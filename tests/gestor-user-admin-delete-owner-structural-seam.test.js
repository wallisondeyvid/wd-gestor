import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userAdminApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const TARGET_USER_ID = '507f1f77bcf86cd799439011';
const ADMIN_USER_ID = '507f1f77bcf86cd799439099';
const FUNCIONARIO_ID = '507f191e810c19729de860aa';

function extractDeleteOwnerSnippet(source) {
	const start = source.indexOf('function isAdminOrMaster(req){');
	const end = source.length;

	assert.ok(start >= 0, 'Nao foi possivel localizar o helper do owner admin de deleteUsuario.');

	return source
		.slice(start, end)
		.replace('export async function toggleUsuario(req,res){', 'async function toggleUsuario(req,res){')
		.replace('export async function updateUsuario(req,res){', 'async function updateUsuario(req,res){')
		.replace('export async function deleteUsuario(req,res){', 'async function deleteUsuario(req,res){');
}

function buildDelegatedDeleteSnippet() {
	const original = extractDeleteOwnerSnippet(CONTROLLER_SOURCE);
	if (original.includes('deleteUsuarioExecutionService({')) {
		return original;
	}

	const coreBlockStart = original.indexOf('await deleteUserById(id);');
	const coreBlockEndMarker = 'return ok(res,{ id, deleted:true });';
	const coreBlockEnd = original.indexOf(coreBlockEndMarker, coreBlockStart);
	assert.ok(coreBlockStart >= 0 && coreBlockEnd >= 0, 'Nao foi possivel localizar o bloco inline atual de deleteUsuario admin.');
	const coreBlock = original.slice(coreBlockStart, coreBlockEnd + coreBlockEndMarker.length);

	const delegatedBlock = [
		'await deleteUsuarioExecutionService({',
		'  userId: id,',
		'  vinculoFuncionarioId: user?.funcionario_id || null,',
		'  unidadeId: user?.unidade_id || null,',
		'});',
		'return ok(res,{ id, deleted:true });',
	].join('\n ');

	const replaced = original.replace(coreBlock, delegatedBlock);
	assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de deleteUsuario admin em memoria.');
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
		funcionario_id: FUNCIONARIO_ID,
		unidade_id: '507f191e810c19729de860ab',
		...overrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadDeleteOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedDeleteSnippet();
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
		deleteUserById: runtimeOverrides.deleteUserById ?? (async () => {
			throw new Error('deleteUserById inline nao deve ser chamado nesta suite estrutural');
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
		deleteUsuarioExecutionService:
			runtimeOverrides.deleteUsuarioExecutionService ??
			(async (input) => {
				callLog.seamCalls.push(input);
				return { deleted: true };
			}),
	};

	const factoryScript = new vm.Script(`(function (__deps) {
const deleteUserById = __deps.deleteUserById;
const findUserById = __deps.findUserById;
const ok = __deps.ok;
const badRequest = __deps.badRequest;
const notFound = __deps.notFound;
const serverError = __deps.serverError;
const deleteUsuarioExecutionService = __deps.deleteUsuarioExecutionService;
${snippet}
return {
	deleteUsuario,
};
})`);

	const factory = factoryScript.runInNewContext({});
	return {
		...factory(deps),
		callLog,
	};
}

test('user admin delete: ordem estrutural mantem owner antes da seam e resposta JSON apos seam', async () => {
	const snippet = buildDelegatedDeleteSnippet();
	const authIndex = snippet.indexOf("if(!isAdminOrMaster(req)) return badRequest(res,'Apenas admin ou master podem excluir usuários');");
	const loadUserIndex = snippet.indexOf('const user = await findUserById(id);');
	const notFoundIndex = snippet.indexOf("if(!user) return notFound(res,'Usuário não encontrado');");
	const masterBlockIndex = snippet.indexOf("if(user.role === 'master' && !req.user.isMaster && req.user.role !== 'master') return badRequest(res,'Apenas master pode excluir usuário master');");
	const seamIndex = snippet.indexOf('deleteUsuarioExecutionService({');
	const responseIndex = snippet.indexOf('return ok(res,{ id, deleted:true });');

	assert.ok(authIndex >= 0, 'Owner precisa preservar a autorizacao admin/master.');
	assert.ok(loadUserIndex >= 0, 'Owner precisa preservar a carga do usuario alvo.');
	assert.ok(notFoundIndex >= 0, 'Owner precisa preservar a traducao de nao encontrado.');
	assert.ok(masterBlockIndex >= 0, 'Owner precisa preservar o bloqueio de alvo master.');
	assert.ok(seamIndex >= 0, 'Seam de delete precisa existir no meio do fluxo em memoria.');
	assert.ok(responseIndex >= 0, 'Owner precisa preservar a resposta JSON final.');
	assert.ok(authIndex < seamIndex, 'Autorizacao precisa ocorrer antes da seam.');
	assert.ok(loadUserIndex < seamIndex, 'Carga do usuario alvo precisa ocorrer antes da seam.');
	assert.ok(notFoundIndex < seamIndex, 'Traducao de nao encontrado precisa ocorrer antes da seam.');
	assert.ok(masterBlockIndex < seamIndex, 'Bloqueio de alvo master precisa ocorrer antes da seam.');
	assert.ok(seamIndex < responseIndex, 'Resposta JSON final deve permanecer no owner apos a seam.');

	const callOrder = [];
	const { deleteUsuario, callLog } = loadDeleteOwnerHarness({
		findUserById: async (id) => {
			callOrder.push('loadUser');
			callLog.userLookupCalls.push([id]);
			return userFixture();
		},
		deleteUsuarioExecutionService: async (input) => {
			callOrder.push('seam');
			callLog.seamCalls.push(input);
			return { deleted: true };
		},
		ok: (res, data = {}) => {
			callOrder.push('ok');
			callLog.okCalls.push([data]);
			return makeResponseHelpers().ok(res, data);
		},
	});

	const req = buildReq();
	const res = makeRes();

	await deleteUsuario(req, res);

	assert.deepEqual(callOrder, ['loadUser', 'seam', 'ok']);
	assert.equal(res.statusCode, 200);
	assert.equal(callLog.badRequestCalls.length, 0);
	assert.equal(callLog.serverErrorCalls.length, 0);
});

test('user admin delete: owner preserva autorizacao admin/master antes da seam', async () => {
	const { deleteUsuario, callLog } = loadDeleteOwnerHarness({
		findUserById: async () => {
			throw new Error('nao deve carregar usuario sem autorizacao admin/master');
		},
		deleteUsuarioExecutionService: async () => {
			throw new Error('nao deve delegar delete sem autorizacao admin/master');
		},
	});

	const req = buildReq({
		user: {
			role: 'user',
			isMaster: false,
		},
	});
	const res = makeRes();

	await deleteUsuario(req, res);

	assert.equal(res.statusCode, 400);
	assert.equal(res.sentText, 'Apenas admin ou master podem excluir usuários');
	assert.equal(callLog.userLookupCalls.length, 0);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.okCalls.length, 0);
});

test('user admin delete: owner preserva usuario nao encontrado antes da seam', async () => {
	const { deleteUsuario, callLog } = loadDeleteOwnerHarness({
		findUserResult: null,
		deleteUsuarioExecutionService: async () => {
			throw new Error('nao deve delegar delete sem usuario carregado');
		},
	});

	const req = buildReq();
	const res = makeRes();

	await deleteUsuario(req, res);

	assert.deepEqual(callLog.userLookupCalls, [[TARGET_USER_ID]]);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(res.statusCode, 404);
	assert.equal(res.sentText, 'Usuário não encontrado');
	assert.equal(callLog.okCalls.length, 0);
});

test('user admin delete: owner preserva bloqueio de alvo master antes da seam', async () => {
	const { deleteUsuario, callLog } = loadDeleteOwnerHarness({
		findUserResult: userFixture({ role: 'master', funcionario_id: null }),
		deleteUsuarioExecutionService: async () => {
			throw new Error('nao deve delegar delete para alvo master bloqueado');
		},
	});

	const req = buildReq({
		user: {
			role: 'admin',
			isMaster: false,
		},
	});
	const res = makeRes();

	await deleteUsuario(req, res);

	assert.deepEqual(callLog.userLookupCalls, [[TARGET_USER_ID]]);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(res.statusCode, 400);
	assert.equal(res.sentText, 'Apenas master pode excluir usuário master');
	assert.equal(callLog.okCalls.length, 0);
});

test('user admin delete: a seam futura recebe apenas o nucleo de execucao do delete e owner preserva resposta JSON final', async () => {
	const loadedUser = userFixture({ funcionario_id: FUNCIONARIO_ID });
	const req = buildReq();
	const res = makeRes();

	const { deleteUsuario, callLog } = loadDeleteOwnerHarness({
		findUserResult: loadedUser,
		deleteUsuarioExecutionService: async (input) => {
			callLog.seamCalls.push(input);
			return { deleted: true };
		},
	});

	await deleteUsuario(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.deepEqual(Object.keys(callLog.seamCalls[0]).sort(), ['unidadeId', 'userId', 'vinculoFuncionarioId']);
	assert.deepEqual(toPlainJson(callLog.seamCalls[0]), {
		unidadeId: '507f191e810c19729de860ab',
		userId: TARGET_USER_ID,
		vinculoFuncionarioId: FUNCIONARIO_ID,
	});
	assert.equal(callLog.okCalls.length, 1);
	assert.deepEqual(toPlainJson(res.body), {
		success: true,
		id: TARGET_USER_ID,
		deleted: true,
	});
});

test('user admin delete: owner trata erro externo com serverError', async () => {
	const req = buildReq();
	const res = makeRes();

	const { deleteUsuario, callLog } = loadDeleteOwnerHarness({
		deleteUsuarioExecutionService: async (input) => {
			callLog.seamCalls.push(input);
			throw new Error('forced-user-admin-delete-structural-failure');
		},
	});

	await deleteUsuario(req, res);

	assert.equal(callLog.userLookupCalls.length, 1);
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.okCalls.length, 0);
	assert.equal(callLog.serverErrorCalls.length, 1);
	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		success: false,
		error: 'forced-user-admin-delete-structural-failure',
	});
});