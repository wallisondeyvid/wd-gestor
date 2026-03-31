import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userAdminApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const TARGET_USER_ID = '507f1f77bcf86cd799439011';
const ADMIN_USER_ID = '507f1f77bcf86cd799439099';

function extractUpdateOwnerSnippet(source) {
	const start = source.indexOf('function isAdminOrMaster(req){');
	const end = source.indexOf('export async function deleteUsuario(req,res){', start);

	assert.ok(start >= 0, 'Nao foi possivel localizar o helper do owner admin de updateUsuario.');
	assert.ok(end >= 0 && end > start, 'Nao foi possivel isolar o corredor de updateUsuario admin.');

	return source
		.slice(start, end)
		.replace('export async function toggleUsuario(req,res){', 'async function toggleUsuario(req,res){')
		.replace('export async function updateUsuario(req,res){', 'async function updateUsuario(req,res){');
}

function buildDelegatedUpdateSnippet() {
	const original = extractUpdateOwnerSnippet(CONTROLLER_SOURCE);
	if (original.includes('updateUsuarioAdminExecutionService({')) {
		return original;
	}

	const coreBlockStart = original.indexOf('if(email) user.email = email.toLowerCase();');
	const coreBlockEndMarker = 'return ok(res,{ id:user._id, email:user.email, role:user.role, ativo:user.ativo });';
	const coreBlockEnd = original.indexOf(coreBlockEndMarker, coreBlockStart);
	assert.ok(coreBlockStart >= 0 && coreBlockEnd >= 0, 'Nao foi possivel localizar o bloco inline atual de updateUsuario admin.');
	const coreBlock = original.slice(coreBlockStart, coreBlockEnd + coreBlockEndMarker.length);

	const delegatedBlock = [
		'const updateResult = await updateUsuarioAdminExecutionService({',
		'  user,',
		"  email: email ? String(email).toLowerCase() : '',",
		"  role: role || '',",
		'});',
		'return ok(res,{ id:(updateResult?.userId || user._id), email:(updateResult?.email ?? user.email), role:(updateResult?.role ?? user.role), ativo:(updateResult?.ativo ?? user.ativo) });',
	].join('\n ');

	const replaced = original.replace(coreBlock, delegatedBlock);
	assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de updateUsuario admin em memoria.');
	return replaced;
}

function makeResponseHelpers() {
	return {
		ok(res, data = {}) {
			res.status(200);
			res.json({ success: true, ...data });
			return res;
		},
		badRequest(res, message) {
			res.status(400);
			res.send(message);
			return res;
		},
		notFound(res, message) {
			res.status(404);
			res.send(message);
			return res;
		},
		serverError(res, error) {
			res.status(500);
			res.json({ success: false, error: error?.message || String(error || 'Erro interno') });
			return res;
		},
	};
}

function makeRes() {
	return {
		statusCode: 200,
		body: null,
		sentText: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(payload) {
			this.body = payload;
			return this;
		},
		send(payload) {
			this.sentText = payload;
			this.body = payload;
			return this;
		},
	};
}

function buildReq(overrides = {}) {
	const { params: paramsOverrides = {}, body: bodyOverrides = {}, user: userOverrides = {}, ...restOverrides } = overrides;
	return {
		params: {
			id: TARGET_USER_ID,
			...paramsOverrides,
		},
		body: {
			email: 'NEW.ADMIN@EXAMPLE.COM',
			role: 'diretor',
			...bodyOverrides,
		},
		user: {
			_id: ADMIN_USER_ID,
			role: 'admin',
			isMaster: false,
			...userOverrides,
		},
		...restOverrides,
	};
}

function userFixture(overrides = {}) {
	return {
		_id: TARGET_USER_ID,
		email: 'old.user@example.com',
		role: 'user',
		ativo: true,
		...overrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadUpdateOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedUpdateSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		userLookupCalls: [],
		seamCalls: [],
		saveUserDocCalls: [],
		okCalls: [],
		badRequestCalls: [],
		notFoundCalls: [],
		serverErrorCalls: [],
	};

	const deps = {
		findUserById: runtimeOverrides.findUserById ?? (async (id) => {
			callLog.userLookupCalls.push([id]);
			if (Object.prototype.hasOwnProperty.call(runtimeOverrides, 'findUserResult')) {
				return runtimeOverrides.findUserResult;
			}
			return userFixture();
		}),
		saveUserDoc: runtimeOverrides.saveUserDoc ?? (async (user) => {
			callLog.saveUserDocCalls.push([user]);
			throw new Error('saveUserDoc inline nao deve ser chamado nesta suite estrutural');
		}),
		ok: runtimeOverrides.ok ?? ((res, data = {}) => {
			callLog.okCalls.push([data]);
			return responseHelpers.ok(res, data);
		}),
		badRequest: runtimeOverrides.badRequest ?? ((res, message) => {
			callLog.badRequestCalls.push([message]);
			return responseHelpers.badRequest(res, message);
		}),
		notFound: runtimeOverrides.notFound ?? ((res, message) => {
			callLog.notFoundCalls.push([message]);
			return responseHelpers.notFound(res, message);
		}),
		serverError: runtimeOverrides.serverError ?? ((res, error) => {
			callLog.serverErrorCalls.push([error]);
			return responseHelpers.serverError(res, error);
		}),
		updateUsuarioExecutionService:
			runtimeOverrides.updateUsuarioExecutionService ??
			(async (input) => {
				callLog.seamCalls.push(input);
				if (input.email) input.user.email = input.email;
				if (input.role) input.user.role = input.role;
				return input.user;
			}),
		updateUsuarioAdminExecutionService:
			runtimeOverrides.updateUsuarioAdminExecutionService ??
			(async (input) => {
				callLog.seamCalls.push(input);
				if (input.email) input.user.email = input.email;
				if (input.role) input.user.role = input.role;
				return input.user;
			}),
	};

	const factoryScript = new vm.Script(`(function (__deps) {
const findUserById = __deps.findUserById;
const saveUserDoc = __deps.saveUserDoc;
const ok = __deps.ok;
const badRequest = __deps.badRequest;
const notFound = __deps.notFound;
const serverError = __deps.serverError;
const updateUsuarioExecutionService = __deps.updateUsuarioExecutionService;
const updateUsuarioAdminExecutionService = __deps.updateUsuarioAdminExecutionService;
${snippet}
return {
	updateUsuario,
};
})`);

	const factory = factoryScript.runInNewContext({});
	return {
		...factory(deps),
		callLog,
	};
}

test('user admin update: ordem estrutural mantem owner antes da seam e resposta JSON apos seam', async () => {
	const snippet = buildDelegatedUpdateSnippet();
	const authIndex = snippet.indexOf("if(!isAdminOrMaster(req)) return badRequest(res,'Apenas admin ou master podem alterar usuários');");
	const loadUserIndex = snippet.indexOf('const user = await findUserById(id);');
	const notFoundIndex = snippet.indexOf("if(!user) return notFound(res,'Usuário não encontrado');");
	const targetMasterBlockIndex = snippet.indexOf("if(user.role === 'master' && !req.user.isMaster && req.user.role !== 'master') return badRequest(res,'Apenas master pode alterar usuário master');");
	const seamIndex = snippet.indexOf('updateUsuarioAdminExecutionService({');
	const responseIndex = snippet.indexOf('return ok(res,{', seamIndex);

	assert.ok(authIndex >= 0, 'Owner precisa preservar a autorizacao admin/master.');
	assert.ok(loadUserIndex >= 0, 'Owner precisa preservar a carga do usuario alvo.');
	assert.ok(notFoundIndex >= 0, 'Owner precisa preservar a traducao de nao encontrado.');
	assert.ok(targetMasterBlockIndex >= 0, 'Owner precisa preservar o bloqueio de alvo master.');
	assert.ok(seamIndex >= 0, 'Seam de update precisa existir no meio do fluxo em memoria.');
	assert.ok(responseIndex >= 0, 'Owner precisa preservar a resposta JSON final.');
	assert.ok(authIndex < seamIndex, 'Autorizacao precisa ocorrer antes da seam.');
	assert.ok(loadUserIndex < seamIndex, 'Carga do usuario alvo precisa ocorrer antes da seam.');
	assert.ok(notFoundIndex < seamIndex, 'Traducao de nao encontrado precisa ocorrer antes da seam.');
	assert.ok(targetMasterBlockIndex < seamIndex, 'Bloqueio de alvo master precisa ocorrer antes da seam.');
	assert.ok(seamIndex < responseIndex, 'Resposta JSON final deve permanecer no owner apos a seam.');

	const callOrder = [];
	const { updateUsuario, callLog } = loadUpdateOwnerHarness({
		findUserById: async (id) => {
			callOrder.push('loadUser');
			callLog.userLookupCalls.push([id]);
			return userFixture();
		},
		updateUsuarioAdminExecutionService: async (input) => {
			callOrder.push('seam');
			callLog.seamCalls.push(input);
			return { ...input.user, email: input.email, role: input.role };
		},
		ok: (res, data = {}) => {
			callOrder.push('ok');
			callLog.okCalls.push([data]);
			return makeResponseHelpers().ok(res, data);
		},
	});

	const req = buildReq();
	const res = makeRes();

	await updateUsuario(req, res);

	assert.deepEqual(callOrder, ['loadUser', 'seam', 'ok']);
	assert.equal(res.statusCode, 200);
	assert.equal(callLog.saveUserDocCalls.length, 0);
	assert.equal(callLog.serverErrorCalls.length, 0);
});

test('user admin update: owner preserva autorizacao admin/master antes da seam', async () => {
	const { updateUsuario, callLog } = loadUpdateOwnerHarness({
		findUserById: async () => {
			throw new Error('nao deve carregar usuario sem autorizacao admin/master');
		},
		updateUsuarioAdminExecutionService: async () => {
			throw new Error('nao deve delegar update sem autorizacao admin/master');
		},
	});

	const req = buildReq({
		user: {
			role: 'user',
			isMaster: false,
		},
	});
	const res = makeRes();

	await updateUsuario(req, res);

	assert.equal(res.statusCode, 400);
	assert.equal(res.sentText, 'Apenas admin ou master podem alterar usuários');
	assert.equal(callLog.userLookupCalls.length, 0);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.okCalls.length, 0);
});

test('user admin update: owner preserva usuario nao encontrado antes da seam', async () => {
	const { updateUsuario, callLog } = loadUpdateOwnerHarness({
		findUserResult: null,
		updateUsuarioAdminExecutionService: async () => {
			throw new Error('nao deve delegar update sem usuario carregado');
		},
	});

	const req = buildReq();
	const res = makeRes();

	await updateUsuario(req, res);

	assert.deepEqual(callLog.userLookupCalls, [[TARGET_USER_ID]]);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(res.statusCode, 404);
	assert.equal(res.sentText, 'Usuário não encontrado');
	assert.equal(callLog.okCalls.length, 0);
});

test('user admin update: owner preserva bloqueio de alvo master antes da seam', async () => {
	const { updateUsuario, callLog } = loadUpdateOwnerHarness({
		findUserResult: userFixture({ role: 'master' }),
		updateUsuarioAdminExecutionService: async () => {
			throw new Error('nao deve delegar update para alvo master bloqueado');
		},
	});

	const req = buildReq({
		user: {
			role: 'admin',
			isMaster: false,
		},
	});
	const res = makeRes();

	await updateUsuario(req, res);

	assert.deepEqual(callLog.userLookupCalls, [[TARGET_USER_ID]]);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(res.statusCode, 400);
	assert.equal(res.sentText, 'Apenas master pode alterar usuário master');
	assert.equal(callLog.okCalls.length, 0);
});
test('user admin update: a seam futura recebe apenas o nucleo canonizado do owner admin atual e preserva resposta JSON final', async () => {
	const loadedUser = userFixture();
	const req = buildReq({
		body: {
			email: 'NEW.ADMIN@EXAMPLE.COM',
			role: 'diretor',
		},
	});
	const res = makeRes();

	const { updateUsuario, callLog } = loadUpdateOwnerHarness({
		findUserResult: loadedUser,
		updateUsuarioAdminExecutionService: async (input) => {
			callLog.seamCalls.push(input);
			return {
				userId: input.user._id,
				email: input.email,
				role: input.role,
				ativo: input.user.ativo,
			};
		},
	});

	await updateUsuario(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.deepEqual(Object.keys(callLog.seamCalls[0]).sort(), ['email', 'role', 'user']);
	assert.deepEqual(toPlainJson(callLog.seamCalls[0]), {
		email: 'new.admin@example.com',
		role: 'diretor',
		user: toPlainJson(loadedUser),
	});
	assert.equal(callLog.okCalls.length, 1);
	assert.deepEqual(toPlainJson(res.body), {
		success: true,
		id: TARGET_USER_ID,
		email: 'new.admin@example.com',
		role: 'diretor',
		ativo: true,
	});
});

test('user admin update: owner trata erro externo com serverError', async () => {
	const req = buildReq();
	const res = makeRes();

	const { updateUsuario, callLog } = loadUpdateOwnerHarness({
		updateUsuarioAdminExecutionService: async (input) => {
			callLog.seamCalls.push(input);
			throw new Error('forced-user-admin-update-structural-failure');
		},
	});

	await updateUsuario(req, res);

	assert.equal(callLog.userLookupCalls.length, 1);
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.okCalls.length, 0);
	assert.equal(callLog.serverErrorCalls.length, 1);
	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		success: false,
		error: 'forced-user-admin-update-structural-failure',
	});
});