import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const DELETE_POST_SERVICE_MOCK_MODULE_URL = 'mock:gestor-funcionarios-delete-post-service';
const DELETE_POST_DATA_FACADE_MOCK_MODULE_URL = 'mock:gestor-funcionarios-delete-post-data-facade';

function nextMockToken() {
	return `${Date.now()}-${Math.random()}`;
}

function getDeletePostServiceMocks() {
	if (!globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_SERVICE_MOCKS__) {
		globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_SERVICE_MOCKS__ = new Map();
	}

	return globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_SERVICE_MOCKS__;
}

function getDeletePostBridgeMocks() {
	if (!globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_DATA_FACADE_MOCKS__) {
		globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_DATA_FACADE_MOCKS__ = new Map();
	}

	return globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_DATA_FACADE_MOCKS__;
}

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier === '#modules/gestor/app/services/funcionarios/deleteFuncionarioPostExecution.service.js'
			&& globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_CURRENT_SERVICE_TOKEN__
		) {
			return {
				url: `${DELETE_POST_SERVICE_MOCK_MODULE_URL}?token=${globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_CURRENT_SERVICE_TOKEN__}`,
				shortCircuit: true,
			};
		}

		if (
			specifier === '#modules/gestor/app/data/funcionarios/funcionarioDeletePostDataFacade.js'
			&& globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_CURRENT_BRIDGE_TOKEN__
		) {
			return {
				url: `${DELETE_POST_DATA_FACADE_MOCK_MODULE_URL}?token=${globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_CURRENT_BRIDGE_TOKEN__}`,
				shortCircuit: true,
			};
		}

		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.startsWith(DELETE_POST_SERVICE_MOCK_MODULE_URL)) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					`const token = ${JSON.stringify(url.split('?token=')[1] || '')};`,
					"const mocks = globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_SERVICE_MOCKS__?.get(token) || {};",
					"export async function deleteFuncionarioPostExecutionService(...args) {",
					"  return await mocks.deleteFuncionarioPostExecutionService(...args);",
					"}",
					"export default deleteFuncionarioPostExecutionService;",
				].join('\n'),
			};
		}

		if (url.startsWith(DELETE_POST_DATA_FACADE_MOCK_MODULE_URL)) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					`const token = ${JSON.stringify(url.split('?token=')[1] || '')};`,
					"const mocks = globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_DATA_FACADE_MOCKS__?.get(token) || {};",
					"export async function findFuncionarioForDeletePostData(...args) { return await mocks.findFuncionarioForDeletePostData(...args); }",
					"export async function findLinkedUserForDeletePostData(...args) { return await mocks.findLinkedUserForDeletePostData(...args); }",
					"export async function deleteFuncionarioForDeletePostData(...args) { return await mocks.deleteFuncionarioForDeletePostData(...args); }",
				].join('\n'),
			};
		}

		return nextLoad(url, context);
	},
});

function setDeletePostServiceMock(mock) {
	const token = nextMockToken();
	getDeletePostServiceMocks().set(token, mock);
	globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_CURRENT_SERVICE_TOKEN__ = token;
	return token;
}

function clearDeletePostServiceMock(token) {
	getDeletePostServiceMocks().delete(token);
	delete globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_CURRENT_SERVICE_TOKEN__;
}

function setDeletePostBridgeMocks(mocks) {
	const token = nextMockToken();
	getDeletePostBridgeMocks().set(token, mocks);
	globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_CURRENT_BRIDGE_TOKEN__ = token;
	return token;
}

function clearDeletePostBridgeMocks(token) {
	getDeletePostBridgeMocks().delete(token);
	delete globalThis.__GESTOR_FUNCIONARIOS_DELETE_POST_CURRENT_BRIDGE_TOKEN__;
}

function createMockRes() {
	return {
		statusCode: 200,
		body: null,
		headers: {},
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(payload) {
			this.body = payload;
			return this;
		},
		set(field, value) {
			this.headers[field] = value;
			return this;
		},
	};
}

function nextModuleUrl(relativePath) {
	return new URL(`${relativePath}?case=${Date.now()}-${Math.random()}`, import.meta.url).href;
}

async function importControllerWithDeletePostMock(t, implementation) {
	const calls = [];
	const serviceMock = async (args) => {
		calls.push(args);
		return implementation(args);
	};

	const token = setDeletePostServiceMock({
		deleteFuncionarioPostExecutionService: serviceMock,
	});

	try {
		const controllerModule = await import(nextModuleUrl('../src/modules/gestor/app/controllers/funcionarioApiController.js'));
		return { deleteFuncionarioPost: controllerModule.deleteFuncionarioPost, calls };
	} finally {
		clearDeletePostServiceMock(token);
	}
}

async function importDeletePostServiceWithRepoMocks(t, implementation = {}) {
	const findFuncionarioCalls = [];
	const findUserCalls = [];
	const deleteFuncionarioCalls = [];

	const findFuncionarioById = async (...args) => {
		findFuncionarioCalls.push(args);
		return implementation.findFuncionarioResult;
	};

	const findUserByFuncionarioId = async (...args) => {
		findUserCalls.push(args);
		if (implementation.findUserError) throw implementation.findUserError;
		return implementation.findUserResult;
	};

	const deleteFuncionarioById = async (...args) => {
		deleteFuncionarioCalls.push(args);
		return implementation.deleteFuncionarioResult;
	};

	const token = setDeletePostBridgeMocks({
		findFuncionarioForDeletePostData: findFuncionarioById,
		findLinkedUserForDeletePostData: findUserByFuncionarioId,
		deleteFuncionarioForDeletePostData: deleteFuncionarioById,
	});

	try {
		const serviceModule = await import(nextModuleUrl('../src/modules/gestor/app/services/funcionarios/deleteFuncionarioPostExecution.service.js'));
		return {
			deleteFuncionarioPostExecutionService: serviceModule.deleteFuncionarioPostExecutionService,
			findFuncionarioCalls,
			findUserCalls,
			deleteFuncionarioCalls,
		};
	} finally {
		clearDeletePostBridgeMocks(token);
	}
}

test('deleteFuncionarioPost delega ao service fino e preserva o ramo alreadyRemoved', async (t) => {
	const { deleteFuncionarioPost, calls } = await importControllerWithDeletePostMock(t, async () => ({ kind: 'already_removed' }));
	const req = {
		params: { id: 'func-1' },
		unitScope: { unidadeId: 'unit-ctx-1' },
	};
	const res = createMockRes();

	await deleteFuncionarioPost(req, res);

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0], { funcionarioId: 'func-1', canonicalUnitId: 'unit-ctx-1' });
	assert.equal(res.statusCode, 200);
	assert.equal(res.body?.success, true);
	assert.equal(res.body?.data?.deleted, true);
	assert.equal(res.body?.data?.alreadyRemoved, true);
	assert.equal(res.body?.data?.redirect, '/funcionarios?deleted=1');
});

test('deleteFuncionarioPost preserva o bloqueio HTTP quando o service informa vinculo master', async (t) => {
	const { deleteFuncionarioPost, calls } = await importControllerWithDeletePostMock(t, async () => ({ kind: 'forbidden_master_link' }));
	const req = {
		params: { id: 'func-2' },
		unitScope: { unidadeId: 'unit-ctx-2' },
	};
	const res = createMockRes();

	await deleteFuncionarioPost(req, res);

	assert.equal(calls.length, 1);
	assert.equal(res.statusCode, 403);
	assert.equal(res.body?.success, false);
	assert.equal(res.body?.code, 'FORBIDDEN');
	assert.match(String(res.body?.error || ''), /master/i);
});

test('deleteFuncionarioPost preserva o payload final com redirect quando o service exclui o alvo', async (t) => {
	const { deleteFuncionarioPost, calls } = await importControllerWithDeletePostMock(t, async () => ({
		kind: 'deleted',
		funcionarioNome: 'Funcionario Estrutural',
	}));
	const req = {
		params: { id: 'func-3' },
		unitScope: { unidadeId: 'unit-ctx-3' },
	};
	const res = createMockRes();

	await deleteFuncionarioPost(req, res);

	assert.equal(calls.length, 1);
	assert.equal(res.statusCode, 200);
	assert.equal(res.body?.success, true);
	assert.equal(res.body?.data?.deleted, true);
	assert.equal(res.body?.data?.alreadyRemoved ?? false, false);
	assert.equal(res.body?.data?.redirect, '/funcionarios?deleted=1&nome=Funcionario%20Estrutural');
});

test('deleteFuncionarioPost preserva o 500 quando o service fino falha', async (t) => {
	const { deleteFuncionarioPost, calls } = await importControllerWithDeletePostMock(t, async () => {
		throw new Error('forced-structural-delete-post-failure');
	});
	const req = {
		params: { id: 'func-4' },
		unitScope: { unidadeId: 'unit-ctx-4' },
	};
	const res = createMockRes();

	await deleteFuncionarioPost(req, res);

	assert.equal(calls.length, 1);
	assert.equal(res.statusCode, 500);
	assert.equal(res.body?.success, false);
	assert.match(String(res.body?.message || res.body?.error || ''), /erro interno/i);
});

test('deleteFuncionarioPostExecutionService retorna already_removed e nao tenta user lookup nem delete quando o lookup escopado nao encontra alvo', async (t) => {
	const {
		deleteFuncionarioPostExecutionService,
		findFuncionarioCalls,
		findUserCalls,
		deleteFuncionarioCalls,
	} = await importDeletePostServiceWithRepoMocks(t, {
		findFuncionarioResult: null,
	});

	const result = await deleteFuncionarioPostExecutionService({
		funcionarioId: 'func-10',
		canonicalUnitId: 'unit-ctx-10',
	});

	assert.deepEqual(result, { kind: 'already_removed' });
	assert.equal(findFuncionarioCalls.length, 1);
	assert.deepEqual(findFuncionarioCalls[0], [{ funcionarioId: 'func-10', unidadeId: 'unit-ctx-10' }]);
	assert.equal(findUserCalls.length, 0);
	assert.equal(deleteFuncionarioCalls.length, 0);
});

test('deleteFuncionarioPostExecutionService faz lookup global do usuario vinculado e bloqueia delete quando o vinculo e master', async (t) => {
	const funcionario = { _id: 'func-11', unidade_id: 'unit-db-11', nome: 'Funcionario 11' };
    const {
		deleteFuncionarioPostExecutionService,
		findFuncionarioCalls,
		findUserCalls,
		deleteFuncionarioCalls,
	} = await importDeletePostServiceWithRepoMocks(t, {
		findFuncionarioResult: funcionario,
		findUserResult: { _id: 'user-11', role: 'master' },
	});

	const result = await deleteFuncionarioPostExecutionService({
		funcionarioId: 'func-11',
		canonicalUnitId: 'unit-ctx-11',
	});

	assert.deepEqual(result, { kind: 'forbidden_master_link' });
	assert.equal(findFuncionarioCalls.length, 1);
	assert.equal(findUserCalls.length, 1);
	assert.deepEqual(findUserCalls[0], [{ funcionarioId: 'func-11' }]);
	assert.equal(deleteFuncionarioCalls.length, 0);
});

test('deleteFuncionarioPostExecutionService exclui com unidade do proprio funcionario quando nao ha contexto canonico', async (t) => {
	const funcionario = { _id: 'func-12', unidade_id: 'unit-db-12', nome: 'Funcionario 12' };
	const {
		deleteFuncionarioPostExecutionService,
		findFuncionarioCalls,
		findUserCalls,
		deleteFuncionarioCalls,
	} = await importDeletePostServiceWithRepoMocks(t, {
		findFuncionarioResult: funcionario,
		findUserResult: null,
	});

	const result = await deleteFuncionarioPostExecutionService({
		funcionarioId: 'func-12',
		canonicalUnitId: null,
	});

	assert.deepEqual(result, { kind: 'deleted', funcionarioNome: 'Funcionario 12' });
	assert.equal(findFuncionarioCalls.length, 1);
	assert.deepEqual(findFuncionarioCalls[0], [{ funcionarioId: 'func-12', unidadeId: null }]);
	assert.equal(findUserCalls.length, 1);
	assert.equal(deleteFuncionarioCalls.length, 1);
	assert.deepEqual(deleteFuncionarioCalls[0], [{ funcionarioId: 'func-12', unidadeId: 'unit-db-12' }]);
});

test('deleteFuncionarioPostExecutionService mantem a unidade canonica no lookup e no delete quando ela existe', async (t) => {
	const funcionario = { _id: 'func-13', unidade_id: 'unit-db-13', nome: 'Funcionario 13' };
	const {
		deleteFuncionarioPostExecutionService,
		findFuncionarioCalls,
		findUserCalls,
		deleteFuncionarioCalls,
	} = await importDeletePostServiceWithRepoMocks(t, {
		findFuncionarioResult: funcionario,
		findUserResult: null,
	});

	const result = await deleteFuncionarioPostExecutionService({
		funcionarioId: 'func-13',
		canonicalUnitId: 'unit-ctx-13',
	});

	assert.deepEqual(result, { kind: 'deleted', funcionarioNome: 'Funcionario 13' });
	assert.equal(findFuncionarioCalls.length, 1);
	assert.deepEqual(findFuncionarioCalls[0], [{ funcionarioId: 'func-13', unidadeId: 'unit-ctx-13' }]);
	assert.equal(findUserCalls.length, 1);
	assert.equal(deleteFuncionarioCalls.length, 1);
	assert.deepEqual(deleteFuncionarioCalls[0], [{ funcionarioId: 'func-13', unidadeId: 'unit-ctx-13' }]);
});