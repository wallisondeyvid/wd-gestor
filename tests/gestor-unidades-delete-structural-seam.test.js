import assert from 'node:assert/strict';
import test from 'node:test';

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

	t.mock.module('#modules/gestor/app/services/unidades/deleteUnidadeExecution.service.js', {
		namedExports: {
			findUnidadeDeleteCandidateService,
			deleteUnidadeExecutionService,
		},
	});

	const controllerModule = await import(nextModuleUrl('../src/modules/gestor/app/controllers/unidadeApiController.js'));
	return {
		deleteUnidade: controllerModule.deleteUnidade,
		findCalls,
		deleteCalls,
	};
}

async function importDeleteUnidadeServiceWithMocks(t, implementation = {}) {
	const readRepoCalls = [];
	const writeRepoCalls = [];
	const bridgeFindCalls = [];
	const bridgeDeleteCalls = [];

	const findUnidadeByIdLeanRepo = t.mock.fn(async (args) => {
		readRepoCalls.push(args);
		if (implementation.readRepoError) throw implementation.readRepoError;
		return implementation.readRepoResult;
	});

	const deleteUnidadeByIdRepo = t.mock.fn(async (args) => {
		writeRepoCalls.push(args);
		if (implementation.writeRepoError) throw implementation.writeRepoError;
		return implementation.writeRepoResult;
	});

	const findUnidadeById = t.mock.fn(async (unidadeId) => {
		bridgeFindCalls.push(unidadeId);
		if (implementation.bridgeFindError) throw implementation.bridgeFindError;
		return implementation.bridgeFindResult;
	});

	const deleteUnidadeById = t.mock.fn(async (unidadeId) => {
		bridgeDeleteCalls.push(unidadeId);
		if (implementation.bridgeDeleteError) throw implementation.bridgeDeleteError;
		return implementation.bridgeDeleteResult;
	});

	t.mock.module('#modules/gestor/app/repositories/UnidadeReadRepository.js', {
		namedExports: {
			findUnidadeByIdLeanRepo,
		},
	});

	t.mock.module('#modules/gestor/app/repositories/UnidadeWriteRepository.js', {
		namedExports: {
			deleteUnidadeByIdRepo,
		},
	});

	t.mock.module('#modules/gestor/app/services/apiDbBridgeService.js', {
		namedExports: {
			findUnidadeById,
			deleteUnidadeById,
		},
	});

	const serviceModule = await import(nextModuleUrl('../src/modules/gestor/app/services/unidades/deleteUnidadeExecution.service.js'));
	return {
		findUnidadeDeleteCandidateService: serviceModule.findUnidadeDeleteCandidateService,
		deleteUnidadeExecutionService: serviceModule.deleteUnidadeExecutionService,
		readRepoCalls,
		writeRepoCalls,
		bridgeFindCalls,
		bridgeDeleteCalls,
	};
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

test('findUnidadeDeleteCandidateService usa repository real para id valido', async (t) => {
	const unidadeId = '507f1f77bcf86cd799439011';
	const {
		findUnidadeDeleteCandidateService,
		readRepoCalls,
		bridgeFindCalls,
	} = await importDeleteUnidadeServiceWithMocks(t, {
		readRepoResult: { _id: unidadeId, nome: 'Unidade valida' },
	});

	const result = await findUnidadeDeleteCandidateService({ unidadeId });

	assert.deepEqual(result, { _id: unidadeId, nome: 'Unidade valida' });
	assert.equal(readRepoCalls.length, 1);
	assert.equal(readRepoCalls[0].unidadeId, unidadeId);
	assert.equal(readRepoCalls[0].unitScope?.unidadeId, unidadeId);
	assert.equal(bridgeFindCalls.length, 0);
});

test('findUnidadeDeleteCandidateService faz fallback para bridge compat quando o id e invalido', async (t) => {
	const {
		findUnidadeDeleteCandidateService,
		readRepoCalls,
		bridgeFindCalls,
	} = await importDeleteUnidadeServiceWithMocks(t, {
		bridgeFindResult: null,
	});

	const result = await findUnidadeDeleteCandidateService({ unidadeId: 'u-invalida' });

	assert.equal(result, null);
	assert.equal(readRepoCalls.length, 0);
	assert.deepEqual(bridgeFindCalls, ['u-invalida']);
});

test('deleteUnidadeExecutionService usa repository real para id valido', async (t) => {
	const unidadeId = '507f1f77bcf86cd799439012';
	const {
		deleteUnidadeExecutionService,
		writeRepoCalls,
		bridgeDeleteCalls,
	} = await importDeleteUnidadeServiceWithMocks(t, {
		writeRepoResult: { _id: unidadeId },
	});

	await deleteUnidadeExecutionService({ unidadeId });

	assert.equal(writeRepoCalls.length, 1);
	assert.equal(writeRepoCalls[0].unidadeId, unidadeId);
	assert.equal(writeRepoCalls[0].unitScope?.unidadeId, unidadeId);
	assert.equal(bridgeDeleteCalls.length, 0);
});

test('deleteUnidadeExecutionService faz fallback para bridge compat quando o id e invalido', async (t) => {
	const {
		deleteUnidadeExecutionService,
		writeRepoCalls,
		bridgeDeleteCalls,
	} = await importDeleteUnidadeServiceWithMocks(t, {
		bridgeDeleteResult: undefined,
	});

	await deleteUnidadeExecutionService({ unidadeId: 'u-invalida' });

	assert.equal(writeRepoCalls.length, 0);
	assert.deepEqual(bridgeDeleteCalls, ['u-invalida']);
});