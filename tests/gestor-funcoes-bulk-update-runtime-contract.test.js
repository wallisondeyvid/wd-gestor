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
const BRIDGE_MOCK_URL = 'mock:gestor-funcoes-bulk-update-bridge';

globalThis.__GESTOR_FUNCOES_BULK_UPDATE_RUNTIME_MOCKS__ = {};

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
const getState = () => globalThis.__GESTOR_FUNCOES_BULK_UPDATE_RUNTIME_MOCKS__;
export * from ${JSON.stringify(BRIDGE_FILE_URL)};
export const findFuncaoById = (...args) => getState().findFuncaoById(...args);
export const saveFuncao = (...args) => getState().saveFuncao(...args);
export const findUnidadeUserBaseLean = (...args) => getState().findUnidadeUserBaseLean(...args);
`,
			};
		}

		return nextLoad(url, context);
	},
});

const CONTEXT_FILIAL_ID = '507f191e810c19729de860aa';
const CONTEXT_PRINCIPAL_ID = '507f191e810c19729de860ea';
const OTHER_PRINCIPAL_ID = '507f191e810c19729de860ff';
const FUNCAO_ID_1 = '507f1f77bcf86cd799439011';
const FUNCAO_ID_2 = '507f1f77bcf86cd799439012';

function resetBridgeMocks() {
	const calls = {
		findFuncaoById: [],
		saveFuncao: [],
		findUnidadeUserBaseLean: [],
	};

	const docs = new Map([
		[FUNCAO_ID_1, { _id: FUNCAO_ID_1, nome: 'Supervisor', descricao: 'Descricao antiga', unidade_principal_id: CONTEXT_PRINCIPAL_ID }],
		[FUNCAO_ID_2, { _id: FUNCAO_ID_2, nome: 'Analista', descricao: '', unidade_principal_id: OTHER_PRINCIPAL_ID }],
	]);

	globalThis.__GESTOR_FUNCOES_BULK_UPDATE_RUNTIME_MOCKS__ = {
		calls,
		docs,
		async findFuncaoById(id, unidadePrincipalId) {
			calls.findFuncaoById.push([id, unidadePrincipalId]);
			const doc = docs.get(String(id));
			return doc ? { ...doc } : null;
		},
		async saveFuncao(funcao) {
			calls.saveFuncao.push([{ ...funcao }]);
			docs.set(String(funcao._id), { ...funcao });
			return funcao;
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

	return { calls, docs };
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

async function requestGestorApp({ body } = {}) {
	const { default: gestorApp } = await import('../src/modules/gestor/app/gestor-app.js');
	const parentApp = express();
	parentApp.use('/gestor', gestorApp);

	const server = createServer(parentApp);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');

	const { port } = server.address();

	try {
		const response = await fetch(`http://127.0.0.1:${port}/gestor/api/funcoes/bulk-update`, {
			method: 'POST',
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
	const { bulkUpdateFuncoes } = await import('../src/modules/gestor/app/controllers/funcaoApiController.js');
	const req = {
		body,
		unitScope,
		params: {},
		query: {},
		session: { user: { role: 'admin' } },
		user: { role: 'admin', isMaster: false },
	};
	const res = createMockResponse();

	await bulkUpdateFuncoes(req, res);

	return {
		statusCode: res.statusCode,
		body: res.body,
	};
}

let calls;

beforeEach(() => {
	({ calls } = resetBridgeMocks());
});

test('POST /gestor/api/funcoes/bulk-update sem sessao responde 401 no app real', async () => {
	const response = await requestGestorApp({
		body: {
			itens: [{ _id: FUNCAO_ID_1, nome: 'Supervisor Atualizado' }],
		},
	});

	assert.equal(response.statusCode, 401);
	assert.deepStrictEqual(response.body, {
		success: false,
		error: 'Não autenticado',
		code: 'UNAUTHORIZED',
	});
});

test('owner real rejeita lista vazia', async () => {
	const response = await invokeOwner({ body: { itens: [] } });

	assert.equal(response.statusCode, 400);
	assert.equal(response.body.success, false);
	assert.equal(response.body.error || response.body.message, 'Lista vazia');
	assert.equal(calls.findFuncaoById.length, 0);
	assert.equal(calls.saveFuncao.length, 0);
});

test('owner real processa resultados mistos sem contexto canonico', async () => {
	const response = await invokeOwner({
		body: {
			itens: [
				{},
				{ _id: 'missing-id', nome: 'Nao Existe' },
				{ _id: FUNCAO_ID_1, nome: 'Supervisor Atualizado' },
				{ _id: FUNCAO_ID_2, descricao: '' },
			],
		},
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.success, true);
	assert.deepStrictEqual(calls.findFuncaoById, [
		['missing-id', null],
		[FUNCAO_ID_1, null],
		[FUNCAO_ID_2, null],
	]);
	assert.deepStrictEqual(calls.saveFuncao, [[{
		_id: FUNCAO_ID_1,
		nome: 'Supervisor Atualizado',
		descricao: 'Descricao antiga',
		unidade_principal_id: CONTEXT_PRINCIPAL_ID,
	}]]);
	assert.deepStrictEqual(response.body.data, {
		updated: 1,
		results: [
			{ ok: false, motivo: 'Sem _id' },
			{ _id: 'missing-id', ok: false, motivo: 'Nao encontrada' },
			{ _id: FUNCAO_ID_1, ok: true, changed: true },
			{ _id: FUNCAO_ID_2, ok: true, changed: false },
		],
	});
});

test('owner real em contexto marca como nao encontrada funcao fora da principal canonica', async () => {
	const response = await invokeOwner({
		body: {
			itens: [
				{ _id: FUNCAO_ID_1, nome: 'Supervisor Atualizado' },
				{ _id: FUNCAO_ID_2, nome: 'Analista Senior' },
			],
		},
		unitScope: { unidadeId: CONTEXT_FILIAL_ID },
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.success, true);
	assert.deepStrictEqual(calls.findUnidadeUserBaseLean, [[CONTEXT_FILIAL_ID]]);
	assert.deepStrictEqual(calls.findFuncaoById, [
		[FUNCAO_ID_1, CONTEXT_PRINCIPAL_ID],
		[FUNCAO_ID_2, CONTEXT_PRINCIPAL_ID],
	]);
	assert.deepStrictEqual(calls.saveFuncao, [[{
		_id: FUNCAO_ID_1,
		nome: 'Supervisor Atualizado',
		descricao: 'Descricao antiga',
		unidade_principal_id: CONTEXT_PRINCIPAL_ID,
	}]]);
	assert.deepStrictEqual(response.body.data, {
		updated: 1,
		results: [
			{ _id: FUNCAO_ID_1, ok: true, changed: true },
			{ _id: FUNCAO_ID_2, ok: false, motivo: 'Nao encontrada' },
		],
	});
});

test('owner real atualiza descricao vazia quando explicitamente enviada', async () => {
	const response = await invokeOwner({
		body: {
			itens: [
				{ _id: FUNCAO_ID_1, descricao: '' },
			],
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepStrictEqual(calls.saveFuncao, [[{
		_id: FUNCAO_ID_1,
		nome: 'Supervisor',
		descricao: '',
		unidade_principal_id: CONTEXT_PRINCIPAL_ID,
	}]]);
	assert.deepStrictEqual(response.body.data, {
		updated: 1,
		results: [
			{ _id: FUNCAO_ID_1, ok: true, changed: true },
		],
	});
});

test('owner real propaga erro interno como 500', async () => {
	globalThis.__GESTOR_FUNCOES_BULK_UPDATE_RUNTIME_MOCKS__.saveFuncao = async (funcao) => {
		calls.saveFuncao.push([{ ...funcao }]);
		throw new Error('forced-funcoes-bulk-update-failure');
	};

	const response = await invokeOwner({
		body: {
			itens: [
				{ _id: FUNCAO_ID_1, nome: 'Supervisor Atualizado' },
			],
		},
	});

	assert.equal(response.statusCode, 500);
	assert.deepStrictEqual(response.body, {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-funcoes-bulk-update-failure',
	});
});