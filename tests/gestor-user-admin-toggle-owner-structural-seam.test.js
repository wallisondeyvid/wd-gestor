import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userAdminApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const TARGET_USER_ID = '507f1f77bcf86cd799439011';
const ADMIN_USER_ID = '507f1f77bcf86cd799439099';

function extractToggleOwnerSnippet(source) {
	const start = source.indexOf('function isAdminOrMaster(req){');
	const end = source.indexOf('export async function updateUsuario(req,res){', start);

	assert.ok(start >= 0, 'Nao foi possivel localizar o helper do owner admin de toggleUsuario.');
	assert.ok(end >= 0 && end > start, 'Nao foi possivel isolar o corredor de toggleUsuario admin.');

	return source
		.slice(start, end)
		.replace('export async function toggleUsuario(req,res){', 'async function toggleUsuario(req,res){');
}

function buildDelegatedToggleSnippet() {
	const original = extractToggleOwnerSnippet(CONTROLLER_SOURCE);
	if (original.includes('toggleUsuarioExecutionService({')) {
		return original;
	}

	const coreBlockStart = original.indexOf('user.ativo = !user.ativo;');
	const coreBlockEndMarker = 'return ok(res,{ id:user._id, ativo:user.ativo });';
	const coreBlockEnd = original.indexOf(coreBlockEndMarker, coreBlockStart);
	assert.ok(coreBlockStart >= 0 && coreBlockEnd >= 0, 'Nao foi possivel localizar o bloco inline atual de toggleUsuario admin.');
	const coreBlock = original.slice(coreBlockStart, coreBlockEnd + coreBlockEndMarker.length);

	const delegatedBlock = [
		'const toggleResult = await toggleUsuarioExecutionService({',
		'  user,',
		'});',
		'return ok(res,{ id:(toggleResult?._id || user._id), ativo:(toggleResult?.ativo ?? user.ativo) });',
	].join('\n ');

	const replaced = original.replace(coreBlock, delegatedBlock);
	assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de toggleUsuario admin em memoria.');
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
	const { params: paramsOverrides = {}, user: userOverrides = {}, ...restOverrides } = overrides;
	return {
		params: {
			id: TARGET_USER_ID,
			...paramsOverrides,
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
		role: 'user',
		ativo: true,
		...overrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadToggleOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedToggleSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		userLookupCalls: [],
		seamCalls: [],
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
		toggleUsuarioExecutionService:
			runtimeOverrides.toggleUsuarioExecutionService ??
			(async (input) => {
				callLog.seamCalls.push(input);
				input.user.ativo = !input.user.ativo;
				return input.user;
			}),
	};

	const factoryScript = new vm.Script(`(function (__deps) {
const findUserById = __deps.findUserById;
const ok = __deps.ok;
const badRequest = __deps.badRequest;
const notFound = __deps.notFound;
const serverError = __deps.serverError;
const toggleUsuarioExecutionService = __deps.toggleUsuarioExecutionService;
${snippet}
return {
	toggleUsuario,
};
})`);

	const factory = factoryScript.runInNewContext({});
	return {
		...factory(deps),
		callLog,
	};
}

test('user admin toggle: ordem estrutural mantem owner antes da seam e resposta JSON apos seam', async () => {
	const snippet = buildDelegatedToggleSnippet();
	const authIndex = snippet.indexOf("if(!isAdminOrMaster(req)) return badRequest(res,'Apenas admin ou master podem alterar usuários');");
	const loadUserIndex = snippet.indexOf('const user = await findUserById(id);');
	const masterBlockIndex = snippet.indexOf("if(user.role === 'master' && !req.user.isMaster && req.user.role !== 'master') return badRequest(res,'Apenas master pode alterar usuário master');");
	const seamIndex = snippet.indexOf('toggleUsuarioExecutionService({');
	const responseIndex = snippet.indexOf('return ok(res,{');

	assert.ok(authIndex >= 0, 'Owner precisa preservar a autorizacao admin/master.');
	assert.ok(loadUserIndex >= 0, 'Owner precisa preservar a carga do usuario alvo.');
	assert.ok(masterBlockIndex >= 0, 'Owner precisa preservar o bloqueio de alvo master.');
	assert.ok(seamIndex >= 0, 'Seam de toggle precisa existir no meio do fluxo em memoria.');
	assert.ok(responseIndex >= 0, 'Owner precisa preservar a resposta JSON final.');
	assert.ok(authIndex < seamIndex, 'Autorizacao precisa ocorrer antes da seam.');
	assert.ok(loadUserIndex < seamIndex, 'Carga do usuario alvo precisa ocorrer antes da seam.');
	assert.ok(masterBlockIndex < seamIndex, 'Bloqueio de alvo master precisa ocorrer antes da seam.');
	assert.ok(seamIndex < responseIndex, 'Resposta JSON final deve permanecer no owner apos a seam.');

	const callOrder = [];
	const { toggleUsuario, callLog } = loadToggleOwnerHarness({
		findUserById: async (id) => {
			callOrder.push('loadUser');
			callLog.userLookupCalls.push([id]);
			return userFixture({ ativo: true });
		},
		toggleUsuarioExecutionService: async (input) => {
			callOrder.push('seam');
			callLog.seamCalls.push(input);
			return { ...input.user, ativo: false };
		},
		ok: (res, data = {}) => {
			callOrder.push('ok');
			callLog.okCalls.push([data]);
			return makeResponseHelpers().ok(res, data);
		},
	});

	const req = buildReq();
	const res = makeRes();

	await toggleUsuario(req, res);

	assert.deepEqual(callOrder, ['loadUser', 'seam', 'ok']);
	assert.equal(res.statusCode, 200);
	assert.equal(callLog.badRequestCalls.length, 0);
	assert.equal(callLog.serverErrorCalls.length, 0);
});

test('user admin toggle: owner preserva autorizacao admin/master antes da seam', async () => {
	const { toggleUsuario, callLog } = loadToggleOwnerHarness({
		findUserById: async () => {
			throw new Error('nao deve carregar usuario sem autorizacao admin/master');
		},
		toggleUsuarioExecutionService: async () => {
			throw new Error('nao deve delegar toggle sem autorizacao admin/master');
		},
	});

	const req = buildReq({
		user: {
			role: 'user',
			isMaster: false,
		},
	});
	const res = makeRes();

	await toggleUsuario(req, res);

	assert.equal(res.statusCode, 400);
	assert.equal(res.sentText, 'Apenas admin ou master podem alterar usuários');
	assert.equal(callLog.userLookupCalls.length, 0);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.okCalls.length, 0);
});

test('user admin toggle: owner preserva carga do usuario alvo e bloqueio de alvo master antes da seam', async () => {
	const { toggleUsuario, callLog } = loadToggleOwnerHarness({
		findUserResult: userFixture({ role: 'master', ativo: true }),
		toggleUsuarioExecutionService: async () => {
			throw new Error('nao deve delegar toggle para alvo master bloqueado');
		},
	});

	const req = buildReq({
		user: {
			role: 'admin',
			isMaster: false,
		},
	});
	const res = makeRes();

	await toggleUsuario(req, res);

	assert.deepEqual(callLog.userLookupCalls, [[TARGET_USER_ID]]);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(res.statusCode, 400);
	assert.equal(res.sentText, 'Apenas master pode alterar usuário master');
	assert.equal(callLog.okCalls.length, 0);
});

test('user admin toggle: owner preserva usuario nao encontrado antes da seam', async () => {
	const { toggleUsuario, callLog } = loadToggleOwnerHarness({
		findUserResult: null,
		toggleUsuarioExecutionService: async () => {
			throw new Error('nao deve delegar toggle sem usuario carregado');
		},
	});

	const req = buildReq();
	const res = makeRes();

	await toggleUsuario(req, res);

	assert.deepEqual(callLog.userLookupCalls, [[TARGET_USER_ID]]);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(res.statusCode, 404);
	assert.equal(res.sentText, 'Usuário não encontrado');
	assert.equal(callLog.okCalls.length, 0);
});

test('user admin toggle: a seam futura recebe apenas o nucleo de execucao do toggle e owner preserva resposta JSON final', async () => {
	const loadedUser = userFixture({ ativo: true });
	const req = buildReq();
	const res = makeRes();

	const { toggleUsuario, callLog } = loadToggleOwnerHarness({
		findUserResult: loadedUser,
		toggleUsuarioExecutionService: async (input) => {
			callLog.seamCalls.push(input);
			return { ...input.user, ativo: false };
		},
	});

	await toggleUsuario(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.deepEqual(Object.keys(callLog.seamCalls[0]).sort(), ['user']);
	assert.deepEqual(toPlainJson(callLog.seamCalls[0]), {
		user: toPlainJson(loadedUser),
	});
	assert.equal(callLog.okCalls.length, 1);
	assert.deepEqual(toPlainJson(res.body), {
		success: true,
		id: TARGET_USER_ID,
		ativo: false,
	});
});

test('user admin toggle: owner trata erro externo com serverError', async () => {
	const req = buildReq();
	const res = makeRes();

	const { toggleUsuario, callLog } = loadToggleOwnerHarness({
		toggleUsuarioExecutionService: async (input) => {
			callLog.seamCalls.push(input);
			throw new Error('forced-user-admin-toggle-structural-failure');
		},
	});

	await toggleUsuario(req, res);

	assert.equal(callLog.userLookupCalls.length, 1);
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.okCalls.length, 0);
	assert.equal(callLog.serverErrorCalls.length, 1);
	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		success: false,
		error: 'forced-user-admin-toggle-structural-failure',
	});
});