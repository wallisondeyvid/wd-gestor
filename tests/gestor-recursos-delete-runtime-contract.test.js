import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';

const RESOURCE_ID = '507f1f77bcf86cd799439011';
const CONTEXTUAL_UNIT_ID = '507f191e810c19729de860ea';
const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/recursoApiController.js')).href;
const gestorAppModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/gestor-app.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-recursos-delete-api-db-bridge';
const DB_BRIDGE_EXPORTS = [
	'deleteRecursoById',
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
				"const getMocks = () => globalThis.__GESTOR_RECURSOS_DELETE_DB_MOCKS__ || {};",
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
	globalThis.__GESTOR_RECURSOS_DELETE_DB_MOCKS__ = { ...overrides };
}

function clearDbMocks() {
	globalThis.__GESTOR_RECURSOS_DELETE_DB_MOCKS__ = {};
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
		query: {},
		body: {},
		params: { id: RESOURCE_ID },
		headers: {},
		session: {},
		user: null,
		unitScope: null,
		...overrides,
		params: {
			id: RESOURCE_ID,
			...(overrides.params || {}),
		},
		session: {
			...(overrides.session || {}),
		},
	};
}

async function invokeOwner({ reqOverrides = {}, bridgeOverrides = {} } = {}) {
	setDbMocks(bridgeOverrides);
	const { deleteRecurso } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
	const req = createRequest(reqOverrides);
	const res = createResponseCapture();

	await deleteRecurso(req, res);
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
			method: 'DELETE',
			redirect: 'manual',
			headers: { accept: 'application/json' },
		});
		const text = await response.text();
		let parsed = null;
		try {
			parsed = text ? JSON.parse(text) : null;
		} catch {
			parsed = null;
		}
		return { status: response.status, body: parsed, text };
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

test('DELETE /gestor/api/recursos/:id sem sessao no app real responde 401 JSON', async () => {
	const response = await requestGestorApp(`/gestor/api/recursos/${RESOURCE_ID}`);

	assert.equal(response.status, 401);
	assert.deepEqual(response.body, {
		success: false,
		error: 'Não autenticado',
		code: 'UNAUTHORIZED',
	});
});

test('deleteRecurso retorna 400 para id invalido antes da exclusao', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
			params: { id: 'invalido' },
		},
		bridgeOverrides: {
			deleteRecursoById: async (...args) => {
				calls.push(args);
				return null;
			},
		},
	});

	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, {
		success: false,
		code: 'BAD_REQUEST',
		message: 'ID inválido',
	});
	assert.equal(calls.length, 0);
});

test('deleteRecurso retorna 404 quando falta contexto canonico para usuario nao privilegiado', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			session: { user: {} },
		},
		bridgeOverrides: {
			deleteRecursoById: async (...args) => {
				calls.push(args);
				return null;
			},
		},
	});

	assert.equal(res.statusCode, 404);
	assert.deepEqual(res.body, {
		success: false,
		code: 'NOT_FOUND',
		message: 'Unidade não encontrada',
	});
	assert.equal(calls.length, 0);
});

test('deleteRecurso retorna 404 para recurso inexistente fora do escopo contextual efetivo', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		},
		bridgeOverrides: {
			deleteRecursoById: async (...args) => {
				calls.push(args);
				return null;
			},
		},
	});

	assert.deepEqual(calls, [[RESOURCE_ID, CONTEXTUAL_UNIT_ID]]);
	assert.equal(res.statusCode, 404);
	assert.deepEqual(res.body, {
		success: false,
		code: 'NOT_FOUND',
		message: 'Recurso não encontrado',
	});
});

test('deleteRecurso chama a exclusao no escopo efetivo de admin com unidade nula e retorna 404 se nao achar', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			deleteRecursoById: async (...args) => {
				calls.push(args);
				return null;
			},
		},
	});

	assert.deepEqual(calls, [[RESOURCE_ID, null]]);
	assert.equal(res.statusCode, 404);
	assert.deepEqual(res.body, {
		success: false,
		code: 'NOT_FOUND',
		message: 'Recurso não encontrado',
	});
});

test('deleteRecurso retorna sucesso com shape exato e exclusao chamada no escopo efetivo', async () => {
	const calls = [];
	const recursoExcluido = {
		_id: RESOURCE_ID,
		unidade_id: CONTEXTUAL_UNIT_ID,
		placa: 'ABC-1D34',
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		},
		bridgeOverrides: {
			deleteRecursoById: async (...args) => {
				calls.push(args);
				return recursoExcluido;
			},
		},
	});

	assert.deepEqual(calls, [[RESOURCE_ID, CONTEXTUAL_UNIT_ID]]);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		success: true,
		data: {
			deleted: true,
			id: RESOURCE_ID,
		},
	});
});

test('deleteRecurso retorna 500 quando a exclusao lanca erro interno', async () => {
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			deleteRecursoById: async () => {
				throw new Error('forced-recursos-delete-failure');
			},
		},
	});

	assert.equal(res.statusCode, 500);
	assert.deepEqual(res.body, {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-recursos-delete-failure',
	});
});