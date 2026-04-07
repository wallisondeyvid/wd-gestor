import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';

const BRIDGE_ALIAS = '#modules/gestor/app/services/apiDbBridgeService.js';
const BRIDGE_FILE_URL = pathToFileURL(resolve(process.cwd(), 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const BRIDGE_MOCK_URL = 'mock:gestor-funcoes-delete-bridge';
const DELETE_SERVICE_ALIAS = '#modules/gestor/app/services/funcoes/deleteFuncaoScoped.service.js';
const DELETE_SERVICE_MOCK_URL = 'mock:gestor-funcoes-delete-scoped-service';
const OWNER_CONTROLLER_IMPORT = '../src/modules/gestor/app/controllers/funcaoApiController.js?gestor-funcoes-delete-runtime-owner';

globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_MOCKS__ = {};
globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_USE_BRIDGE_MOCK__ = false;

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === BRIDGE_ALIAS && globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_USE_BRIDGE_MOCK__) {
			return {
				shortCircuit: true,
				url: BRIDGE_MOCK_URL,
			};
		}

		if (specifier === DELETE_SERVICE_ALIAS && globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_USE_BRIDGE_MOCK__) {
			return {
				shortCircuit: true,
				url: DELETE_SERVICE_MOCK_URL,
			};
		}

		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === BRIDGE_MOCK_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: `
const getState = () => globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_MOCKS__;
export * from ${JSON.stringify(BRIDGE_FILE_URL)};
export function findFuncaoById(...args) { return getState().findFuncaoById(...args); }
export function deleteFuncaoById(...args) { return getState().deleteFuncaoById(...args); }
export function findUnidadeUserBaseLean(...args) { return getState().findUnidadeUserBaseLean(...args); }
`,
			};
		}

		if (url === DELETE_SERVICE_MOCK_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: `
const getState = () => globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_MOCKS__;
export function deleteFuncaoScopedService(...args) { return getState().deleteFuncaoScopedService(...args); }
`,
			};
		}

		return nextLoad(url, context);
	},
});

const FUNCAO_ID = '507f1f77bcf86cd799439011';
const CONTEXT_FILIAL_ID = '507f191e810c19729de860aa';
const CONTEXT_PRINCIPAL_ID = '507f191e810c19729de860ea';
const OTHER_PRINCIPAL_ID = '507f191e810c19729de860ff';

function resetBridgeMocks() {
	const calls = {
		findFuncaoById: [],
		deleteFuncaoById: [],
		deleteFuncaoScopedService: [],
		findUnidadeUserBaseLean: [],
	};

	globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_MOCKS__ = {
		calls,
		async findFuncaoById(id, unidadePrincipalId) {
			calls.findFuncaoById.push([id, unidadePrincipalId]);
			if (id !== FUNCAO_ID) return null;
			return {
				_id: FUNCAO_ID,
				nome: 'Supervisor',
				unidade_principal_id: OTHER_PRINCIPAL_ID,
			};
		},
		async deleteFuncaoById(id, unidadePrincipalId) {
			calls.deleteFuncaoById.push([id, unidadePrincipalId]);
		},
		async deleteFuncaoScopedService({ funcaoId, canonicalPrincipalUnitId }) {
			calls.deleteFuncaoScopedService.push([{ funcaoId, canonicalPrincipalUnitId }]);
			if (funcaoId !== FUNCAO_ID) return null;
			return {
				_id: FUNCAO_ID,
				nome: 'Supervisor',
				unidade_principal_id: canonicalPrincipalUnitId || OTHER_PRINCIPAL_ID,
			};
		},
		async findUnidadeUserBaseLean(unidadeId) {
			calls.findUnidadeUserBaseLean.push([unidadeId]);
			if (String(unidadeId) === CONTEXT_FILIAL_ID) {
				return {
					_id: CONTEXT_FILIAL_ID,
					is_principal: false,
					unidade_principal_id: CONTEXT_PRINCIPAL_ID,
				};
			}

			if (String(unidadeId) === CONTEXT_PRINCIPAL_ID) {
				return {
					_id: CONTEXT_PRINCIPAL_ID,
					is_principal: true,
				};
			}

			if (!unidadeId) return null;
			return {
				_id: String(unidadeId),
				is_principal: true,
			};
		},
	};

	return calls;
}

function createMockResponse() {
	const state = {
		statusCode: 200,
		body: undefined,
	};

	return {
		status(code) {
			state.statusCode = code;
			return this;
		},
		json(payload) {
			state.body = payload;
			return this;
		},
		send(payload) {
			state.body = payload;
			return this;
		},
		get statusCode() {
			return state.statusCode;
		},
		get body() {
			return state.body;
		},
	};
}

async function requestGestorApp({ pathname = `/api/funcoes/${FUNCAO_ID}` } = {}) {
	globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_USE_BRIDGE_MOCK__ = false;
	const { default: buildGestorApp } = await import('../src/modules/gestor/app/gestor-app.js');
	const gestorApp = buildGestorApp();
	const parentApp = express();
	parentApp.use('/gestor', gestorApp);

	const server = createServer(parentApp);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');

	const { port } = server.address();

	try {
		const response = await fetch(`http://127.0.0.1:${port}/gestor${pathname}`, {
			method: 'DELETE',
			headers: {
				accept: 'application/json',
			},
		});
		const payload = await response.json();
		return { statusCode: response.status, body: payload };
	} finally {
		server.close();
		await once(server, 'close');
	}
}

async function invokeOwner({ id = FUNCAO_ID, unitScope } = {}) {
	globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_USE_BRIDGE_MOCK__ = true;
	const { deleteFuncao } = await import(OWNER_CONTROLLER_IMPORT);
	const req = {
		params: { id },
		unitScope,
		body: {},
		query: {},
		session: { user: { role: 'admin' } },
		user: { role: 'admin', isMaster: false },
	};
	const res = createMockResponse();

	await deleteFuncao(req, res);

	return {
		statusCode: res.statusCode,
		body: res.body,
	};
}

let calls;

beforeEach(() => {
	calls = resetBridgeMocks();
});

test('DELETE /gestor/api/funcoes/:id sem sessao responde 401 no app real', async () => {
	const response = await requestGestorApp();

	assert.equal(response.statusCode, 401);
	assert.deepStrictEqual(response.body, {
		success: false,
		error: 'Não autenticado',
		code: 'UNAUTHORIZED',
	});
});

test('owner real retorna 404 quando a funcao nao existe sem contexto canonico', async () => {
	const response = await invokeOwner({ id: 'missing-id' });

	assert.equal(response.statusCode, 404);
	assert.deepStrictEqual(response.body, {
		success: false,
		code: 'NOT_FOUND',
		message: 'Função não encontrada',
	});
	assert.deepStrictEqual(calls.deleteFuncaoScopedService, [[{ funcaoId: 'missing-id', canonicalPrincipalUnitId: null }]]);
	assert.equal(calls.deleteFuncaoById.length, 0);
	assert.equal(calls.findFuncaoById.length, 0);
});

test('owner real retorna 404 quando a funcao nao existe no contexto canonico', async () => {
	const response = await invokeOwner({
		id: 'missing-id',
		unitScope: { unidadeId: CONTEXT_FILIAL_ID },
	});

	assert.equal(response.statusCode, 404);
	assert.deepStrictEqual(response.body, {
		success: false,
		code: 'NOT_FOUND',
		message: 'Função não encontrada',
	});
	assert.deepStrictEqual(calls.findUnidadeUserBaseLean, [[CONTEXT_FILIAL_ID]]);
	assert.deepStrictEqual(calls.deleteFuncaoScopedService, [[{ funcaoId: 'missing-id', canonicalPrincipalUnitId: CONTEXT_PRINCIPAL_ID }]]);
	assert.equal(calls.deleteFuncaoById.length, 0);
	assert.equal(calls.findFuncaoById.length, 0);
});

test('owner real sem contexto delega delete com contexto canonico nulo', async () => {
	const response = await invokeOwner();

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.success, true);
	assert.deepStrictEqual(calls.deleteFuncaoScopedService, [[{ funcaoId: FUNCAO_ID, canonicalPrincipalUnitId: null }]]);
	assert.equal(calls.findFuncaoById.length, 0);
	assert.equal(calls.deleteFuncaoById.length, 0);
	assert.deepStrictEqual(response.body.data, {
		deleted: true,
		id: FUNCAO_ID,
	});
});

test('owner real com contexto delega delete com a principal contextual', async () => {
	const response = await invokeOwner({
		unitScope: { unidadeId: CONTEXT_FILIAL_ID },
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.success, true);
	assert.deepStrictEqual(calls.findUnidadeUserBaseLean, [[CONTEXT_FILIAL_ID]]);
	assert.deepStrictEqual(calls.deleteFuncaoScopedService, [[{ funcaoId: FUNCAO_ID, canonicalPrincipalUnitId: CONTEXT_PRINCIPAL_ID }]]);
	assert.equal(calls.findFuncaoById.length, 0);
	assert.equal(calls.deleteFuncaoById.length, 0);
	assert.deepStrictEqual(response.body.data, {
		deleted: true,
		id: FUNCAO_ID,
	});
});

test('owner real propaga erro interno como 500', async () => {
	globalThis.__GESTOR_FUNCOES_DELETE_RUNTIME_MOCKS__.deleteFuncaoScopedService = async ({ funcaoId, canonicalPrincipalUnitId }) => {
		calls.deleteFuncaoScopedService.push([{ funcaoId, canonicalPrincipalUnitId }]);
		throw new Error('forced-funcoes-delete-failure');
	};

	const response = await invokeOwner();

	assert.equal(response.statusCode, 500);
	assert.deepStrictEqual(response.body, {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-funcoes-delete-failure',
	});
});