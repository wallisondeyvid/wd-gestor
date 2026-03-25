import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';

const SCOPED_UNIT_ID = '507f191e810c19729de860ea';
const IN_SCOPE_FILIAL_ID = '507f191e810c19729de860eb';
const OUT_OF_SCOPE_UNIT_ID = '507f191e810c19729de860ec';
const PRINCIPAL_UNIT_ID = '507f191e810c19729de860ed';
const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/funcaoApiController.js')).href;
const gestorAppModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/gestor-app.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-funcoes-get-by-unit-api-db-bridge';
const DB_BRIDGE_EXPORTS = [
	'findUnidadeUserBaseLean',
	'findFuncoesByPrincipalUnitIdLean',
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
				"const getMocks = () => globalThis.__GESTOR_FUNCOES_GET_BY_UNIT_DB_MOCKS__ || {};",
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
	globalThis.__GESTOR_FUNCOES_GET_BY_UNIT_DB_MOCKS__ = { ...overrides };
}

function clearDbMocks() {
	globalThis.__GESTOR_FUNCOES_GET_BY_UNIT_DB_MOCKS__ = {};
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
		end(payload) {
			if (payload !== undefined) this.body = payload;
			return this;
		},
	};
}

function createRequest(overrides = {}) {
	return {
		params: { unidadeId: IN_SCOPE_FILIAL_ID },
		query: {},
		body: {},
		headers: {},
		session: {},
		user: null,
		unitScope: null,
		...overrides,
		params: {
			unidadeId: IN_SCOPE_FILIAL_ID,
			...(overrides.params || {}),
		},
		session: {
			...(overrides.session || {}),
		},
	};
}

async function invokeOwner({ reqOverrides = {}, bridgeOverrides = {} } = {}) {
	setDbMocks(bridgeOverrides);
	const { getFuncoesPorUnidade } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
	const req = createRequest(reqOverrides);
	const res = createResponseCapture();

	await getFuncoesPorUnidade(req, res);
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

test('GET /gestor/api/funcoes/unidade/:unidadeId sem sessao responde 401 JSON no app real', async () => {
	const response = await requestGestorApp(`/gestor/api/funcoes/unidade/${IN_SCOPE_FILIAL_ID}`);

	assert.equal(response.status, 401);
	assert.deepEqual(response.body, {
		success: false,
		error: 'Não autenticado',
		code: 'UNAUTHORIZED',
	});
});

test('getFuncoesPorUnidade retorna lista vazia quando unidadeId e null e nao consulta lookup nem listagem', async () => {
	const unidadeCalls = [];
	const funcoesCalls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			params: { unidadeId: 'null' },
			user: { role: 'diretor' },
			unitScope: { unidadeId: SCOPED_UNIT_ID },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async (...args) => {
				unidadeCalls.push(args);
				return null;
			},
			findFuncoesByPrincipalUnitIdLean: async (...args) => {
				funcoesCalls.push(args);
				return [];
			},
		},
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, { success: true, data: [] });
	assert.equal(unidadeCalls.length, 0);
	assert.equal(funcoesCalls.length, 0);
});

test('getFuncoesPorUnidade retorna lista vazia quando a unidade alvo esta fora do cluster contextual', async () => {
	const unidadeCalls = [];
	const funcoesCalls = [];
	const unidades = {
		[SCOPED_UNIT_ID]: { _id: SCOPED_UNIT_ID, is_principal: false, unidade_principal_id: PRINCIPAL_UNIT_ID },
		[OUT_OF_SCOPE_UNIT_ID]: { _id: OUT_OF_SCOPE_UNIT_ID, is_principal: true },
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			params: { unidadeId: OUT_OF_SCOPE_UNIT_ID },
			user: { role: 'diretor' },
			unitScope: { unidadeId: SCOPED_UNIT_ID },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async (unidadeId) => {
				unidadeCalls.push(unidadeId);
				return unidades[unidadeId] || null;
			},
			findFuncoesByPrincipalUnitIdLean: async (...args) => {
				funcoesCalls.push(args);
				return [];
			},
		},
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, { success: true, data: [] });
	assert.deepEqual(unidadeCalls, [SCOPED_UNIT_ID, OUT_OF_SCOPE_UNIT_ID]);
	assert.equal(funcoesCalls.length, 0);
});

test('getFuncoesPorUnidade resolve filial para principal e retorna shape mapeado com fallbacks', async () => {
	const unidadeCalls = [];
	const funcoesCalls = [];
	const unidades = {
		[SCOPED_UNIT_ID]: { _id: SCOPED_UNIT_ID, is_principal: false, unidade_principal_id: PRINCIPAL_UNIT_ID },
		[IN_SCOPE_FILIAL_ID]: { _id: IN_SCOPE_FILIAL_ID, is_principal: false, unidade_principal_id: PRINCIPAL_UNIT_ID },
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			params: { unidadeId: IN_SCOPE_FILIAL_ID },
			user: { role: 'diretor' },
			unitScope: { unidadeId: SCOPED_UNIT_ID },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async (unidadeId) => {
				unidadeCalls.push(unidadeId);
				return unidades[unidadeId] || null;
			},
			findFuncoesByPrincipalUnitIdLean: async (principalUnitId) => {
				funcoesCalls.push(principalUnitId);
				return [
					{ _id: 'f-1', nome: 'Analista RH', codigo: 'C001', descricao: 'Responsável por RH' },
					{ _id: 'f-2', nome: 'C002', codigo: 'C002', descricao: '   ' },
				];
			},
		},
	});

	assert.deepEqual(unidadeCalls, [SCOPED_UNIT_ID, IN_SCOPE_FILIAL_ID, IN_SCOPE_FILIAL_ID]);
	assert.deepEqual(funcoesCalls, [PRINCIPAL_UNIT_ID]);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		success: true,
		data: [
			{
				_id: 'f-1',
				nome: 'Analista RH',
				codigo: 'C001',
				descricao: 'Responsável por RH',
				descricao_display: 'Responsável por RH',
				descricao_final: 'Responsável por RH',
				hasDescricaoReal: true,
			},
			{
				_id: 'f-2',
				nome: 'C002',
				codigo: 'C002',
				descricao: '',
				descricao_display: 'C002',
				descricao_final: 'C002',
				hasDescricaoReal: false,
			},
		],
	});
});

test('getFuncoesPorUnidade sem contexto canonico usa a propria unidade como chave de listagem quando lookup nao encontra unidade', async () => {
	const unidadeCalls = [];
	const funcoesCalls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			params: { unidadeId: OUT_OF_SCOPE_UNIT_ID },
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async (unidadeId) => {
				unidadeCalls.push(unidadeId);
				return null;
			},
			findFuncoesByPrincipalUnitIdLean: async (principalUnitId) => {
				funcoesCalls.push(principalUnitId);
				return [
					{ _id: 'f-3', nome: 'Supervisor', codigo: 'SUP', descricao: '' },
				];
			},
		},
	});

	assert.deepEqual(unidadeCalls, [OUT_OF_SCOPE_UNIT_ID]);
	assert.deepEqual(funcoesCalls, [OUT_OF_SCOPE_UNIT_ID]);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		success: true,
		data: [
			{
				_id: 'f-3',
				nome: 'Supervisor',
				codigo: 'SUP',
				descricao: '',
				descricao_display: 'Supervisor',
				descricao_final: 'Supervisor',
				hasDescricaoReal: false,
			},
		],
	});
});

test('getFuncoesPorUnidade retorna 500 quando a listagem lanca erro interno', async () => {
	const { res } = await invokeOwner({
		reqOverrides: {
			params: { unidadeId: IN_SCOPE_FILIAL_ID },
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async () => ({ _id: IN_SCOPE_FILIAL_ID, is_principal: false, unidade_principal_id: PRINCIPAL_UNIT_ID }),
			findFuncoesByPrincipalUnitIdLean: async () => {
				throw new Error('forced-funcoes-get-by-unit-failure');
			},
		},
	});

	assert.equal(res.statusCode, 500);
	assert.deepEqual(res.body, {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-funcoes-get-by-unit-failure',
	});
});