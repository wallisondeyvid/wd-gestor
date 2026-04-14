import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const DELETE_EXECUTION_SERVICE_MOCK_MODULE_URL = 'mock:gestor-unidades-delete-structural-delete-service';
const UNIDADES_DELETE_DATA_FACADE_MOCK_MODULE_URL = 'mock:gestor-unidades-delete-structural-data-facade';

function nextMockToken() {
	return `${Date.now()}-${Math.random()}`;
}

function getDeleteStructuralDeleteServiceMocks() {
	if (!globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_DELETE_SERVICE_MOCKS__) {
		globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_DELETE_SERVICE_MOCKS__ = new Map();
	}
	return globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_DELETE_SERVICE_MOCKS__;
}

function getDeleteStructuralDataFacadeMocks() {
	if (!globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_DATA_FACADE_MOCKS__) {
		globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_DATA_FACADE_MOCKS__ = new Map();
	}
	return globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_DATA_FACADE_MOCKS__;
}

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier === '#modules/gestor/app/services/unidades/deleteUnidadeExecution.service.js' &&
			globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_CURRENT_DELETE_SERVICE_TOKEN__
		) {
			return {
				url: `${DELETE_EXECUTION_SERVICE_MOCK_MODULE_URL}?token=${globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_CURRENT_DELETE_SERVICE_TOKEN__}`,
				shortCircuit: true,
			};
		}
		if (
			specifier === '#modules/gestor/app/data/unidades/unidadesDeleteDataFacade.js' &&
			globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_INTERCEPT_DATA_FACADE__ &&
			globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_CURRENT_DATA_FACADE_TOKEN__
		) {
			return {
				url: `${UNIDADES_DELETE_DATA_FACADE_MOCK_MODULE_URL}?token=${globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_CURRENT_DATA_FACADE_TOKEN__}`,
				shortCircuit: true,
			};
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.startsWith(DELETE_EXECUTION_SERVICE_MOCK_MODULE_URL)) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					`const token = ${JSON.stringify(url.split('?token=')[1] || '')};`,
					"const mock = globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_DELETE_SERVICE_MOCKS__?.get(token) || {};",
					"export const findUnidadeDeleteCandidateService = mock.findUnidadeDeleteCandidateService;",
					"export const deleteUnidadeExecutionService = mock.deleteUnidadeExecutionService;",
				].join('\n'),
			};
		}

		if (url.startsWith(UNIDADES_DELETE_DATA_FACADE_MOCK_MODULE_URL)) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					`const token = ${JSON.stringify(url.split('?token=')[1] || '')};`,
					"const mock = globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_DATA_FACADE_MOCKS__?.get(token) || {};",
					"export const findUnidadeById = mock.findUnidadeById;",
					"export const findUnidadeByIdLean = mock.findUnidadeByIdLean;",
					"export const deleteUnidadeById = mock.deleteUnidadeById;",
				].join('\n'),
			};
		}

		return nextLoad(url, context);
	},
});

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

function setDeleteStructuralDeleteServiceMocks(mocks) {
	const token = nextMockToken();
	getDeleteStructuralDeleteServiceMocks().set(token, mocks);
	globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_CURRENT_DELETE_SERVICE_TOKEN__ = token;
	return token;
}

function clearDeleteStructuralDeleteServiceMocks(token) {
	getDeleteStructuralDeleteServiceMocks().delete(token);
	delete globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_CURRENT_DELETE_SERVICE_TOKEN__;
}

function setDeleteStructuralDataFacadeMocks(mocks) {
	const token = nextMockToken();
	getDeleteStructuralDataFacadeMocks().set(token, mocks);
	globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_CURRENT_DATA_FACADE_TOKEN__ = token;
	return token;
}

function clearDeleteStructuralDataFacadeMocks(token) {
	getDeleteStructuralDataFacadeMocks().delete(token);
	delete globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_CURRENT_DATA_FACADE_TOKEN__;
}

function setDeleteStructuralDataFacadeInterception(enabled) {
	globalThis.__GESTOR_UNIDADES_DELETE_STRUCTURAL_INTERCEPT_DATA_FACADE__ = enabled;
}

async function importControllerWithDeleteServiceMock(t, implementation = {}) {
	const findCalls = [];
	const deleteCalls = [];

	const findUnidadeDeleteCandidateService = t.mock.fn(async (args) => {
		findCalls.push(args);
		if (implementation.findError) throw implementation.findError;
		return implementation.findResult;
	});

	const deleteUnidadeExecutionService = t.mock.fn(async (args) => {
		deleteCalls.push(args);
		if (implementation.deleteError) throw implementation.deleteError;
		return implementation.deleteResult;
	});

	const mockToken = setDeleteStructuralDeleteServiceMocks({
		findUnidadeDeleteCandidateService,
		deleteUnidadeExecutionService,
	});

	try {
		const controllerModule = await import(nextModuleUrl('../src/modules/gestor/app/controllers/unidadeApiController.js'));
		return {
			deleteUnidade: controllerModule.deleteUnidade,
			findCalls,
			deleteCalls,
		};
	} finally {
		clearDeleteStructuralDeleteServiceMocks(mockToken);
	}
}

async function importDeleteUnidadeServiceWithMocks(t, implementation = {}) {
	const bridgeFindCalls = [];
	const bridgeFindLeanCalls = [];
	const bridgeDeleteCalls = [];

	const findUnidadeById = t.mock.fn(async (unidadeId) => {
		bridgeFindCalls.push(unidadeId);
		if (implementation.bridgeFindError) throw implementation.bridgeFindError;
		return implementation.bridgeFindResult;
	});

	const findUnidadeByIdLean = t.mock.fn(async (unidadeId) => {
		bridgeFindLeanCalls.push(unidadeId);
		if (implementation.bridgeFindLeanError) throw implementation.bridgeFindLeanError;
		return implementation.bridgeFindLeanResult;
	});

	const deleteUnidadeById = t.mock.fn(async (unidadeId) => {
		bridgeDeleteCalls.push(unidadeId);
		if (implementation.bridgeDeleteError) throw implementation.bridgeDeleteError;
		return implementation.bridgeDeleteResult;
	});

	const mockToken = setDeleteStructuralDataFacadeMocks({
		findUnidadeById,
		findUnidadeByIdLean,
		deleteUnidadeById,
	});
	setDeleteStructuralDataFacadeInterception(true);

	try {
		const serviceModule = await import(nextModuleUrl('../src/modules/gestor/app/services/unidades/deleteUnidadeExecution.service.js'));
		return {
			findUnidadeDeleteCandidateService: serviceModule.findUnidadeDeleteCandidateService,
			deleteUnidadeExecutionService: serviceModule.deleteUnidadeExecutionService,
			bridgeFindCalls,
			bridgeFindLeanCalls,
			bridgeDeleteCalls,
		};
	} finally {
		setDeleteStructuralDataFacadeInterception(false);
		clearDeleteStructuralDataFacadeMocks(mockToken);
	}
}

test('deleteUnidade preserva o gate de role user sem chamar o service fino', async (t) => {
	const { deleteUnidade, findCalls, deleteCalls } = await importControllerWithDeleteServiceMock(t, {});
	const req = { user: { role: 'user', isMaster: false }, params: { id: 'u-role-user' } };
	const res = createMockRes();

	await deleteUnidade(req, res);

	assert.equal(findCalls.length, 0);
	assert.equal(deleteCalls.length, 0);
	assert.equal(res.statusCode, 400);
	assert.equal(res.body?.success, false);
	assert.equal(res.body?.code, 'BAD_REQUEST');
	assert.match(String(res.body?.message || ''), /não tem permissão/i);
});

test('deleteUnidade delega o lookup ao service fino e preserva 404 quando a unidade nao existe', async (t) => {
	const { deleteUnidade, findCalls, deleteCalls } = await importControllerWithDeleteServiceMock(t, {
		findResult: null,
	});
	const req = { user: { role: 'admin', isMaster: false }, params: { id: 'u-missing' } };
	const res = createMockRes();

	await deleteUnidade(req, res);

	assert.equal(findCalls.length, 1);
	assert.deepEqual(findCalls[0], { unidadeId: 'u-missing' });
	assert.equal(deleteCalls.length, 0);
	assert.equal(res.statusCode, 404);
	assert.equal(res.body?.success, false);
	assert.equal(res.body?.code, 'NOT_FOUND');
	assert.equal(res.body?.message, 'Unidade não encontrada');
});

test('deleteUnidade preserva o envelope minimo de sucesso e usa o service fino de delete', async (t) => {
	const { deleteUnidade, findCalls, deleteCalls } = await importControllerWithDeleteServiceMock(t, {
		findResult: { _id: 'u-ok', is_principal: false },
	});
	const req = { user: { role: 'admin', isMaster: false }, params: { id: 'u-ok' } };
	const res = createMockRes();

	await deleteUnidade(req, res);

	assert.equal(findCalls.length, 1);
	assert.equal(deleteCalls.length, 1);
	assert.deepEqual(deleteCalls[0], { unidadeId: 'u-ok' });
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		success: true,
		data: {
			deleted: true,
			id: 'u-ok',
		},
	});
});

test('deleteUnidade preserva a regra de unidade principal para usuario nao master sem chamar o delete do service', async (t) => {
	const { deleteUnidade, findCalls, deleteCalls } = await importControllerWithDeleteServiceMock(t, {
		findResult: { _id: 'u-principal', is_principal: true },
	});
	const req = { user: { role: 'admin', isMaster: false }, params: { id: 'u-principal' } };
	const res = createMockRes();

	await deleteUnidade(req, res);

	assert.equal(findCalls.length, 1);
	assert.equal(deleteCalls.length, 0);
	assert.equal(res.statusCode, 400);
	assert.equal(res.body?.success, false);
	assert.equal(res.body?.code, 'BAD_REQUEST');
	assert.equal(res.body?.message, 'Apenas Master pode excluir unidades principais');
});

test('deleteUnidade preserva o 500 quando o service fino falha no lookup', async (t) => {
	const { deleteUnidade, findCalls, deleteCalls } = await importControllerWithDeleteServiceMock(t, {
		findError: new Error('forced-delete-unidade-structural-failure'),
	});
	const req = { user: { role: 'admin', isMaster: true }, params: { id: 'u-error' } };
	const res = createMockRes();

	await deleteUnidade(req, res);

	assert.equal(findCalls.length, 1);
	assert.equal(deleteCalls.length, 0);
	assert.equal(res.statusCode, 500);
	assert.equal(res.body?.success, false);
	assert.equal(res.body?.code, 'SERVER_ERROR');
	assert.equal(res.body?.message, 'forced-delete-unidade-structural-failure');
});

test('findUnidadeDeleteCandidateService usa a data facade para id valido', async (t) => {
	const unidadeId = '507f1f77bcf86cd799439011';
	const {
		findUnidadeDeleteCandidateService,
		bridgeFindCalls,
		bridgeFindLeanCalls,
	} = await importDeleteUnidadeServiceWithMocks(t, {
		bridgeFindLeanResult: { _id: unidadeId, nome: 'Unidade valida' },
	});

	const result = await findUnidadeDeleteCandidateService({ unidadeId });

	assert.deepEqual(result, { _id: unidadeId, nome: 'Unidade valida' });
	assert.deepEqual(bridgeFindLeanCalls, [unidadeId]);
	assert.equal(bridgeFindCalls.length, 0);
});

test('findUnidadeDeleteCandidateService preserva o fallback compativel quando o id e invalido', async (t) => {
	const {
		findUnidadeDeleteCandidateService,
		bridgeFindCalls,
		bridgeFindLeanCalls,
	} = await importDeleteUnidadeServiceWithMocks(t, {
		bridgeFindResult: null,
	});

	const result = await findUnidadeDeleteCandidateService({ unidadeId: 'u-invalida' });

	assert.equal(result, null);
	assert.equal(bridgeFindLeanCalls.length, 0);
	assert.deepEqual(bridgeFindCalls, ['u-invalida']);
});

test('deleteUnidadeExecutionService usa a data facade para id valido', async (t) => {
	const unidadeId = '507f1f77bcf86cd799439012';
	const {
		deleteUnidadeExecutionService,
		bridgeDeleteCalls,
	} = await importDeleteUnidadeServiceWithMocks(t, {
		bridgeDeleteResult: { _id: unidadeId },
	});

	await deleteUnidadeExecutionService({ unidadeId });

	assert.deepEqual(bridgeDeleteCalls, [unidadeId]);
});

test('deleteUnidadeExecutionService preserva o fallback compativel quando o id e invalido', async (t) => {
	const {
		deleteUnidadeExecutionService,
		bridgeDeleteCalls,
	} = await importDeleteUnidadeServiceWithMocks(t, {
		bridgeDeleteResult: undefined,
	});

	await deleteUnidadeExecutionService({ unidadeId: 'u-invalida' });

	assert.deepEqual(bridgeDeleteCalls, ['u-invalida']);
});