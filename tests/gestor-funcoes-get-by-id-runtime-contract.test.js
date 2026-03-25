import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';

const FUNCAO_ID = '507f1f77bcf86cd799439011';
const CONTEXTUAL_UNIT_ID = '507f191e810c19729de860ea';
const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/funcaoApiController.js')).href;
const gestorAppModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/gestor-app.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-funcoes-get-by-id-api-db-bridge';
const DB_BRIDGE_EXPORTS = [
	'findUnidadeUserBaseLean',
	'findFuncaoByIdPopulated',
];

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
			return { url: dbBridgeMockModuleUrl, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === dbBridgeMockModuleUrl) {
			const lines = [
				`export * from '${actualDbBridgeModuleUrl}';`,
				`import * as actual from '${actualDbBridgeModuleUrl}';`,
				"const getMocks = () => globalThis.__GESTOR_FUNCOES_GET_BY_ID_DB_MOCKS__ || {};",
			];

			for (const exportName of DB_BRIDGE_EXPORTS) {
				lines.push(`export async function ${exportName}(...args) { const fn = getMocks()['${exportName}']; if (typeof fn === 'function') return await fn(...args); return await actual['${exportName}'](...args); }`);
			}

			return {
				format: 'module',
				shortCircuit: true,
				source: lines.join('\n'),
			};
		}

		return nextLoad(url, context);
	},
});

function uniqueSuffix() {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setDbMocks(overrides = {}) {
	globalThis.__GESTOR_FUNCOES_GET_BY_ID_DB_MOCKS__ = { ...overrides };
}

function clearDbMocks() {
	globalThis.__GESTOR_FUNCOES_GET_BY_ID_DB_MOCKS__ = {};
}

function createResponseCapture() {
	return {
		statusCode: 200,
		body: undefined,
		headers: {},
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(payload) {
			this.body = JSON.parse(JSON.stringify(payload));
			return this;
		},
		send(payload) {
			this.body = JSON.parse(JSON.stringify(payload));
			return this;
		},
		set(name, value) {
			this.headers[String(name).toLowerCase()] = value;
			return this;
		},
		setHeader(name, value) {
			this.headers[String(name).toLowerCase()] = value;
		},
		type(value) {
			this.headers['content-type'] = value;
			return this;
		},
	};
}

function createRequest(overrides = {}) {
	return {
		params: { id: FUNCAO_ID },
		query: {},
		body: {},
		headers: {},
		session: {},
		user: null,
		unitScope: null,
		...overrides,
		params: {
			id: FUNCAO_ID,
			...(overrides.params || {}),
		},
		session: {
			...(overrides.session || {}),
		},
	};
}

async function invokeOwner({ reqOverrides = {}, bridgeOverrides = {} } = {}) {
	setDbMocks(bridgeOverrides);
	const { getFuncao } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
	const req = createRequest(reqOverrides);
	const res = createResponseCapture();

	await getFuncao(req, res);
	return { req, res };
}

async function requestGestorApp(pathname) {
	const { default: gestorApp } = await import(`${gestorAppModuleUrl}?case=app-${encodeURIComponent(uniqueSuffix())}`);
	const rootApp = express();
	rootApp.use('/gestor', gestorApp);

	const server = await new Promise((resolve) => {
		const instance = rootApp.listen(0, '127.0.0.1', () => resolve(instance));
	});

	try {
		const { port } = server.address();
		const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
			method: 'GET',
			redirect: 'manual',
			headers: { accept: 'application/json' },
		});
		const text = await response.text();
		let body = null;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			body = null;
		}
		return { status: response.status, body, text };
	} finally {
		await new Promise((resolve, reject) => {
			server.close((error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	}
}

test.afterEach(() => {
	clearDbMocks();
});

test('GET /gestor/api/funcoes/:id sem sessao responde 401 JSON no app real', async () => {
	const response = await requestGestorApp(`/gestor/api/funcoes/${FUNCAO_ID}`);

	assert.equal(response.status, 401);
	assert.deepEqual(response.body, {
		success: false,
		error: 'Não autenticado',
		code: 'UNAUTHORIZED',
	});
});

test('getFuncao para admin sem contexto consulta lookup com unidade nula e retorna 404 quando nao encontra', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findFuncaoByIdPopulated: async (...args) => {
				calls.push(args);
				return null;
			},
		},
	});

	assert.deepEqual(calls, [[FUNCAO_ID, null]]);
	assert.equal(res.statusCode, 404);
	assert.deepEqual(res.body, {
		success: false,
		code: 'NOT_FOUND',
		message: 'Função não encontrada',
	});
});

test('getFuncao com contexto canonico restringe o lookup ao escopo efetivo', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async () => ({ _id: CONTEXTUAL_UNIT_ID, is_principal: true }),
			findFuncaoByIdPopulated: async (...args) => {
				calls.push(args);
				return null;
			},
		},
	});

	assert.deepEqual(calls, [[FUNCAO_ID, CONTEXTUAL_UNIT_ID]]);
	assert.equal(res.statusCode, 404);
	assert.deepEqual(res.body, {
		success: false,
		code: 'NOT_FOUND',
		message: 'Função não encontrada',
	});
});

test('getFuncao sem contexto canonico no owner isolado nao bloqueia e usa unidade nula', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			session: { user: {} },
		},
		bridgeOverrides: {
			findFuncaoByIdPopulated: async (...args) => {
				calls.push(args);
				return null;
			},
		},
	});

	assert.deepEqual(calls, [[FUNCAO_ID, null]]);
	assert.equal(res.statusCode, 404);
	assert.deepEqual(res.body, {
		success: false,
		code: 'NOT_FOUND',
		message: 'Função não encontrada',
	});
});

test('getFuncao retorna sucesso com payload normalizado para a tela de edicao', async () => {
	const calls = [];
	const funcao = {
		_id: FUNCAO_ID,
		nome: 'Supervisor',
		descricao: 'Coordena equipe',
		unidade_principal_id: { _id: CONTEXTUAL_UNIT_ID, nome: 'Matriz Centro' },
		modulos_habilitados: [
			{ _id: 'm-1', nome: 'Dashboard' },
			{ _id: 'm-2', nome: 'Funcionarios' },
		],
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async () => ({ _id: CONTEXTUAL_UNIT_ID, is_principal: true }),
			findFuncaoByIdPopulated: async (...args) => {
				calls.push(args);
				return funcao;
			},
		},
	});

	assert.deepEqual(calls, [[FUNCAO_ID, CONTEXTUAL_UNIT_ID]]);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		success: true,
		data: {
			_id: FUNCAO_ID,
			nome: 'Supervisor',
			descricao: 'Coordena equipe',
			unidade_principal_id: CONTEXTUAL_UNIT_ID,
			modulos_habilitados: [
				{ _id: 'm-1', nome: 'Dashboard' },
				{ _id: 'm-2', nome: 'Funcionarios' },
			],
		},
	});
});

test('getFuncao normaliza descricao vazia e unidade principal nula no retorno de sucesso', async () => {
	const funcao = {
		_id: FUNCAO_ID,
		nome: 'Analista',
		descricao: undefined,
		unidade_principal_id: null,
		modulos_habilitados: [],
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findFuncaoByIdPopulated: async () => funcao,
		},
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		success: true,
		data: {
			_id: FUNCAO_ID,
			nome: 'Analista',
			descricao: '',
			unidade_principal_id: null,
			modulos_habilitados: [],
		},
	});
});

test('getFuncao retorna 500 quando o lookup lanca erro interno', async () => {
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findFuncaoByIdPopulated: async () => {
				throw new Error('forced-funcoes-get-by-id-failure');
			},
		},
	});

	assert.equal(res.statusCode, 500);
	assert.deepEqual(res.body, {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-funcoes-get-by-id-failure',
	});
});