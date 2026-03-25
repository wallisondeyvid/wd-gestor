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
const BRIDGE_MOCK_URL = 'mock:gestor-funcoes-create-bridge';

globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_MOCKS__ = {};

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === BRIDGE_ALIAS) {
			return {
				shortCircuit: true,
				url: BRIDGE_MOCK_URL,
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
import * as actual from ${JSON.stringify(BRIDGE_FILE_URL)};
const getState = () => globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_MOCKS__;
export * from ${JSON.stringify(BRIDGE_FILE_URL)};
export const findFuncaoByNome = (...args) => getState().findFuncaoByNome(...args);
export const createFuncao = (...args) => getState().createFuncao(...args);
export const findUnidadeByIdWithModulosAcessiveis = (...args) => getState().findUnidadeByIdWithModulosAcessiveis(...args);
export const findUnidadeUserBaseLean = (...args) => getState().findUnidadeUserBaseLean(...args);
`,
			};
		}

		return nextLoad(url, context);
	},
});

const CREATED_FUNCAO_ID = '507f1f77bcf86cd799439011';
const CONTEXT_FILIAL_ID = '507f191e810c19729de860aa';
const CONTEXT_PRINCIPAL_ID = '507f191e810c19729de860ea';
const OUTSIDE_PRINCIPAL_ID = '507f191e810c19729de860ff';
const MOD_ALLOWED_1 = 'mod-1';
const MOD_ALLOWED_2 = 'mod-2';
const MOD_BLOCKED = 'mod-x';

function resetBridgeMocks() {
	const calls = {
		findFuncaoByNome: [],
		createFuncao: [],
		findUnidadeByIdWithModulosAcessiveis: [],
		findUnidadeUserBaseLean: [],
	};

	globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_MOCKS__ = {
		calls,
		async findFuncaoByNome(nome, unidadePrincipalId) {
			calls.findFuncaoByNome.push([nome, unidadePrincipalId]);
			return null;
		},
		async createFuncao(payload) {
			calls.createFuncao.push([payload]);
			return { _id: CREATED_FUNCAO_ID, ...payload };
		},
		async findUnidadeByIdWithModulosAcessiveis(unidadePrincipalId) {
			calls.findUnidadeByIdWithModulosAcessiveis.push([unidadePrincipalId]);
			return {
				_id: unidadePrincipalId,
				modulosAcessiveis: [
					{ _id: MOD_ALLOWED_1 },
					{ _id: MOD_ALLOWED_2 },
				],
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

			if (String(unidadeId) === OUTSIDE_PRINCIPAL_ID) {
				return {
					_id: OUTSIDE_PRINCIPAL_ID,
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

async function requestGestorApp({ method = 'POST', pathname = '/api/funcoes', body } = {}) {
	const { default: gestorApp } = await import('../src/modules/gestor/app/gestor-app.js');
	const parentApp = express();
	parentApp.use('/gestor', gestorApp);

	const server = createServer(parentApp);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');

	const { port } = server.address();

	try {
		const response = await fetch(`http://127.0.0.1:${port}/gestor${pathname}`, {
			method,
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const payload = await response.json();
		return { statusCode: response.status, body: payload };
	} finally {
		server.close();
		await once(server, 'close');
	}
}

async function invokeOwner({ body = {}, unitScope } = {}) {
	const { createFuncao } = await import('../src/modules/gestor/app/controllers/funcaoApiController.js');
	const req = {
		body,
		unitScope,
		params: {},
		query: {},
		session: { user: { role: 'admin' } },
		user: { role: 'admin', isMaster: false },
	};
	const res = createMockResponse();

	await createFuncao(req, res);

	return {
		statusCode: res.statusCode,
		body: res.body,
	};
}

let calls;

beforeEach(() => {
	calls = resetBridgeMocks();
});

test('POST /gestor/api/funcoes sem sessao responde 401 no app real', async () => {
	const response = await requestGestorApp({
		body: {
			nome: 'Supervisor',
			unidade_principal_id: CONTEXT_PRINCIPAL_ID,
		},
	});

	assert.equal(response.statusCode, 401);
	assert.deepStrictEqual(response.body, {
		success: false,
		error: 'Não autenticado',
		code: 'UNAUTHORIZED',
	});
});

test('owner real exige nome', async () => {
	const response = await invokeOwner({
		body: {
			unidade_principal_id: CONTEXT_PRINCIPAL_ID,
		},
	});

	assert.equal(response.statusCode, 400);
	assert.equal(response.body.success, false);
	assert.equal(response.body.error || response.body.message, 'Nome é obrigatório');
	assert.equal(calls.findFuncaoByNome.length, 0);
	assert.equal(calls.createFuncao.length, 0);
});

test('owner real exige unidade principal quando nao ha contexto canonico', async () => {
	const response = await invokeOwner({
		body: {
			nome: 'Supervisor',
		},
	});

	assert.equal(response.statusCode, 400);
	assert.equal(response.body.success, false);
	assert.equal(response.body.error || response.body.message, 'Unidade principal é obrigatória');
	assert.equal(calls.findFuncaoByNome.length, 0);
	assert.equal(calls.createFuncao.length, 0);
});

test('owner real rejeita unidade fora do cluster contextual com 404', async () => {
	const response = await invokeOwner({
		body: {
			nome: 'Supervisor',
			unidade_principal_id: OUTSIDE_PRINCIPAL_ID,
		},
		unitScope: { unidadeId: CONTEXT_FILIAL_ID },
	});

	assert.equal(response.statusCode, 404);
	assert.deepStrictEqual(response.body, {
		success: false,
		code: 'NOT_FOUND',
		message: 'Unidade principal não encontrada',
	});
	assert.deepStrictEqual(calls.findUnidadeUserBaseLean, [
		[CONTEXT_FILIAL_ID],
		[CONTEXT_FILIAL_ID],
		[OUTSIDE_PRINCIPAL_ID],
	]);
	assert.equal(calls.findFuncaoByNome.length, 0);
	assert.equal(calls.createFuncao.length, 0);
});

test('owner real rejeita duplicidade por nome na principal canonica', async () => {
	globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_MOCKS__.findFuncaoByNome = async (nome, unidadePrincipalId) => {
		calls.findFuncaoByNome.push([nome, unidadePrincipalId]);
		return { _id: 'dup-1', nome, unidade_principal_id: unidadePrincipalId };
	};

	const response = await invokeOwner({
		body: {
			nome: 'Supervisor',
			unidade_principal_id: CONTEXT_FILIAL_ID,
		},
		unitScope: { unidadeId: CONTEXT_FILIAL_ID },
	});

	assert.equal(response.statusCode, 400);
	assert.equal(response.body.success, false);
	assert.equal(response.body.error || response.body.message, 'Função já cadastrada');
	assert.deepStrictEqual(calls.findFuncaoByNome, [['Supervisor', CONTEXT_PRINCIPAL_ID]]);
	assert.equal(calls.createFuncao.length, 0);
});

test('owner real filtra modulos permitidos e cria pela principal contextual', async () => {
	const response = await invokeOwner({
		body: {
			nome: 'Supervisor',
			descricao: 'Coordena equipe',
			unidade_principal_id: CONTEXT_FILIAL_ID,
			modulos_habilitados: [MOD_ALLOWED_1, MOD_BLOCKED, MOD_ALLOWED_2],
		},
		unitScope: { unidadeId: CONTEXT_FILIAL_ID },
	});

	assert.equal(response.statusCode, 201);
	assert.equal(response.body.success, true);
	assert.deepStrictEqual(calls.findFuncaoByNome, [['Supervisor', CONTEXT_PRINCIPAL_ID]]);
	assert.deepStrictEqual(calls.findUnidadeByIdWithModulosAcessiveis, [[CONTEXT_PRINCIPAL_ID]]);
	assert.deepStrictEqual(calls.createFuncao, [[{
		nome: 'Supervisor',
		descricao: 'Coordena equipe',
		unidade_principal_id: CONTEXT_PRINCIPAL_ID,
		modulos_habilitados: [MOD_ALLOWED_1, MOD_ALLOWED_2],
	}]]);
	assert.equal(response.body.data?._id || response.body.id, CREATED_FUNCAO_ID);
});

test('owner real responde 400 quando a unidade canonica eh invalida', async () => {
	globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_MOCKS__.findUnidadeByIdWithModulosAcessiveis = async (unidadePrincipalId) => {
		calls.findUnidadeByIdWithModulosAcessiveis.push([unidadePrincipalId]);
		return null;
	};

	const response = await invokeOwner({
		body: {
			nome: 'Supervisor',
			unidade_principal_id: CONTEXT_PRINCIPAL_ID,
			modulos_habilitados: [MOD_ALLOWED_1],
		},
	});

	assert.equal(response.statusCode, 400);
	assert.equal(response.body.success, false);
	assert.equal(response.body.error || response.body.message, 'Unidade inválida');
	assert.deepStrictEqual(calls.findUnidadeByIdWithModulosAcessiveis, [[CONTEXT_PRINCIPAL_ID]]);
	assert.equal(calls.createFuncao.length, 0);
});

test('owner real propaga erro interno como 500', async () => {
	globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_MOCKS__.createFuncao = async (payload) => {
		calls.createFuncao.push([payload]);
		throw new Error('forced-funcoes-create-failure');
	};

	const response = await invokeOwner({
		body: {
			nome: 'Supervisor',
			unidade_principal_id: CONTEXT_PRINCIPAL_ID,
		},
	});

	assert.equal(response.statusCode, 500);
	assert.deepStrictEqual(response.body, {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-funcoes-create-failure',
	});
});