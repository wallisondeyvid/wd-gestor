import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';
import request from 'supertest';

const CONTEXTUAL_UNIT_ID = '507f191e810c19729de860ea';
const OUT_OF_SCOPE_UNIT_ID = '507f191e810c19729de860eb';
const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/recursoApiController.js')).href;
const gestorAppModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/gestor-app.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-recursos-create-api-db-bridge';
const DB_BRIDGE_EXPORTS = [
	'findRecursosByFiltroComUnidadeLean',
	'createRecurso',
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
				"const getMocks = () => globalThis.__GESTOR_RECURSOS_CREATE_DB_MOCKS__ || {};",
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
	globalThis.__GESTOR_RECURSOS_CREATE_DB_MOCKS__ = { ...overrides };
}

function clearDbMocks() {
	globalThis.__GESTOR_RECURSOS_CREATE_DB_MOCKS__ = {};
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

function validBody(overrides = {}) {
	return {
		unidade_id: CONTEXTUAL_UNIT_ID,
		tipo: 'carro',
		placa: 'ABC-1D34',
		chassi: '9BWZZZ377VT004251',
		renavam: '12345678901',
		ano: '2024',
		mod: '2025',
		marca: 'Fiat',
		modelo: 'Argo',
		cor: 'Branco',
		...overrides,
	};
}

function createRequest(overrides = {}) {
	return {
		body: validBody(),
		query: {},
		params: {},
		headers: {},
		session: {},
		user: null,
		unitScope: null,
		...overrides,
		body: {
			...validBody(),
			...(overrides.body || {}),
		},
		session: {
			...(overrides.session || {}),
		},
	};
}

async function invokeOwner({ reqOverrides = {}, bridgeOverrides = {} } = {}) {
	setDbMocks(bridgeOverrides);
	const { createRecurso } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
	const req = createRequest(reqOverrides);
	const res = createResponseCapture();

	await createRecurso(req, res);
	return { req, res };
}

async function requestGestorApp(pathname, body) {
	const { default: buildGestorApp } = await import(`${gestorAppModuleUrl}?case=app-${encodeURIComponent(uniqueSuffix())}`);
	const gestorApp = buildGestorApp();
	const rootApp = express();
	rootApp.use('/gestor', gestorApp);

	const server = await new Promise((resolve) => {
		const instance = rootApp.listen(0, '127.0.0.1', () => resolve(instance));
	});

	try {
		const { port } = server.address();
		const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				accept: 'application/json',
				'content-type': 'application/json',
			},
			body: JSON.stringify(body),
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

async function requestRecursoRouterWithSession({ pathname = '/gestor/api/recursos', body, sessionUser } = {}) {
	const app = express();
	app.use(express.json());
	app.use((req, res, next) => {
		req.session = sessionUser ? { user: { ...sessionUser } } : {};
		next();
	});
	app.use('/gestor', (await import('../src/modules/gestor/app/routes/recursoApi.js')).default);

	const req = request(app)
		.post(pathname)
		.set('Accept', 'application/json');

	if (body !== undefined) {
		req.send(body);
	}

	return req;
}

test.afterEach(() => {
	clearDbMocks();
});

test('POST /gestor/api/recursos sem sessao no app real responde 401 JSON', async () => {
	const response = await requestGestorApp('/gestor/api/recursos', validBody());

	assert.equal(response.status, 401);
	assert.deepEqual(response.body, {
		success: false,
		error: 'Não autenticado',
		code: 'UNAUTHORIZED',
	});
});

test('POST /gestor/api/recursos com diretor sem contexto canonico ativo retorna 400 na borda real', async () => {
	const response = await requestRecursoRouterWithSession({
		pathname: '/gestor/api/recursos',
		body: validBody(),
		sessionUser: {
			id: 'session-diretor-sem-contexto',
			email: 'diretor.recurso.sem.contexto@example.com',
			role: 'diretor',
			nome: 'Diretor sem contexto',
		},
	});

	assert.equal(response.status, 400);
	assert.deepEqual(response.body, {
		success: false,
		error: 'UNIDADE_ID_REQUIRED',
	});
});

test('createRecurso retorna 400 para payload minimo invalido sem consultar duplicidades nem persistir', async () => {
	const calls = [];
	const persists = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
			body: validBody({ marca: '' }),
		},
		bridgeOverrides: {
			findRecursosByFiltroComUnidadeLean: async (...args) => {
				calls.push(args);
				return [];
			},
			createRecurso: async (...args) => {
				persists.push(args);
				return null;
			},
		},
	});

	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, {
		success: false,
		code: 'BAD_REQUEST',
		message: 'Todos os campos são obrigatórios',
	});
	assert.equal(calls.length, 0);
	assert.equal(persists.length, 0);
});

test('createRecurso retorna 404 quando falta contexto canonico para usuario nao privilegiado', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			session: { user: {} },
		},
		bridgeOverrides: {
			findRecursosByFiltroComUnidadeLean: async (...args) => {
				calls.push(args);
				return [];
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

test('createRecurso retorna 404 quando a unidade alvo esta fora do escopo contextual', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
			body: validBody({ unidade_id: OUT_OF_SCOPE_UNIT_ID }),
		},
		bridgeOverrides: {
			findRecursosByFiltroComUnidadeLean: async (...args) => {
				calls.push(args);
				return [];
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

test('createRecurso retorna 400 para duplicidade de placa dentro da unidade', async () => {
	const filtros = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		},
		bridgeOverrides: {
			findRecursosByFiltroComUnidadeLean: async (filtro) => {
				filtros.push(JSON.parse(JSON.stringify(filtro)));
				if (filtro.placa) return [{ _id: 'dup-placa' }];
				return [];
			},
		},
	});

	assert.deepEqual(filtros, [{ unidade_id: CONTEXTUAL_UNIT_ID, placa: 'ABC-1D34' }]);
	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, {
		success: false,
		code: 'BAD_REQUEST',
		message: 'Placa já cadastrada',
	});
});

test('createRecurso retorna 400 para duplicidade de chassi e interrompe antes do RENAVAM', async () => {
	const filtros = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		},
		bridgeOverrides: {
			findRecursosByFiltroComUnidadeLean: async (filtro) => {
				filtros.push(JSON.parse(JSON.stringify(filtro)));
				if (filtro.chassi) return [{ _id: 'dup-chassi' }];
				return [];
			},
		},
	});

	assert.deepEqual(filtros, [
		{ unidade_id: CONTEXTUAL_UNIT_ID, placa: 'ABC-1D34' },
		{ unidade_id: CONTEXTUAL_UNIT_ID, chassi: '9BWZZZ377VT004251' },
	]);
	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, {
		success: false,
		code: 'BAD_REQUEST',
		message: 'Chassi já cadastrado',
	});
});

test('createRecurso retorna 400 para duplicidade de RENAVAM apos passar por placa e chassi', async () => {
	const filtros = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		},
		bridgeOverrides: {
			findRecursosByFiltroComUnidadeLean: async (filtro) => {
				filtros.push(JSON.parse(JSON.stringify(filtro)));
				if (Object.prototype.hasOwnProperty.call(filtro, 'renavam')) return [{ _id: 'dup-renavam' }];
				return [];
			},
		},
	});

	assert.deepEqual(filtros, [
		{ unidade_id: CONTEXTUAL_UNIT_ID, placa: 'ABC-1D34' },
		{ unidade_id: CONTEXTUAL_UNIT_ID, chassi: '9BWZZZ377VT004251' },
		{ unidade_id: CONTEXTUAL_UNIT_ID, renavam: '12345678901' },
	]);
	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, {
		success: false,
		code: 'BAD_REQUEST',
		message: 'RENAVAM já cadastrado',
	});
});

test('createRecurso retorna sucesso com envelope de created e payload persistido normalizado', async () => {
	const filtros = [];
	const persists = [];
	const novoRecurso = {
		_id: '507f1f77bcf86cd799439011',
		unidade_id: CONTEXTUAL_UNIT_ID,
		tipo: 'carro',
		placa: 'ABC-1D34',
		chassi: '9BWZZZ377VT004251',
		renavam: '12345678901',
		ano: 2024,
		mod: 2025,
		marca: 'Fiat',
		modelo: 'Argo',
		cor: 'Branco',
		ativo: true,
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		},
		bridgeOverrides: {
			findRecursosByFiltroComUnidadeLean: async (filtro) => {
				filtros.push(JSON.parse(JSON.stringify(filtro)));
				return [];
			},
			createRecurso: async (payload) => {
				persists.push(JSON.parse(JSON.stringify(payload)));
				return novoRecurso;
			},
		},
	});

	assert.deepEqual(filtros, [
		{ unidade_id: CONTEXTUAL_UNIT_ID, placa: 'ABC-1D34' },
		{ unidade_id: CONTEXTUAL_UNIT_ID, chassi: '9BWZZZ377VT004251' },
		{ unidade_id: CONTEXTUAL_UNIT_ID, renavam: '12345678901' },
	]);
	assert.deepEqual(persists, [{
		unidade_id: CONTEXTUAL_UNIT_ID,
		tipo: 'carro',
		placa: 'ABC-1D34',
		chassi: '9BWZZZ377VT004251',
		renavam: '12345678901',
		ano: 2024,
		mod: 2025,
		marca: 'Fiat',
		modelo: 'Argo',
		cor: 'Branco',
		ativo: true,
	}]);
	assert.equal(res.statusCode, 201);
	assert.deepEqual(res.body, {
		success: true,
		created: true,
		id: '507f1f77bcf86cd799439011',
		data: novoRecurso,
	});
});

test('createRecurso retorna 500 quando a persistencia lanca erro interno', async () => {
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findRecursosByFiltroComUnidadeLean: async () => [],
			createRecurso: async () => {
				throw new Error('forced-recursos-create-failure');
			},
		},
	});

	assert.equal(res.statusCode, 500);
	assert.deepEqual(res.body, {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-recursos-create-failure',
	});
});