import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';

const RESOURCE_ID = '507f1f77bcf86cd799439011';
const CONTEXTUAL_UNIT_ID = '507f191e810c19729de860ea';
const OUT_OF_SCOPE_UNIT_ID = '507f191e810c19729de860eb';
const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/recursoApiController.js')).href;
const gestorAppModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/gestor-app.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-recursos-update-api-db-bridge';
const DB_BRIDGE_EXPORTS = [
	'findRecursoByIdComUnidadeNome',
	'findOutroRecursoByPlacaUpper',
	'findOutroRecursoByChassiUpper',
	'findOutroRecursoByRenavam',
	'updateRecursoByIdComUnidadeNome',
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
				"const getMocks = () => globalThis.__GESTOR_RECURSOS_UPDATE_DB_MOCKS__ || {};",
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
	globalThis.__GESTOR_RECURSOS_UPDATE_DB_MOCKS__ = { ...overrides };
}

function clearDbMocks() {
	globalThis.__GESTOR_RECURSOS_UPDATE_DB_MOCKS__ = {};
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

function existingResource(overrides = {}) {
	return {
		_id: RESOURCE_ID,
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
		...overrides,
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
		ativo: true,
		...overrides,
	};
}

function createRequest(overrides = {}) {
	return {
		body: validBody(),
		query: {},
		params: { id: RESOURCE_ID },
		headers: {},
		session: {},
		user: null,
		unitScope: null,
		...overrides,
		body: {
			...validBody(),
			...(overrides.body || {}),
		},
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
	const { updateRecurso } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
	const req = createRequest(reqOverrides);
	const res = createResponseCapture();

	await updateRecurso(req, res);
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
			method: 'PUT',
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

test.afterEach(() => {
	clearDbMocks();
});

test('PUT /gestor/api/recursos/:id sem sessao no app real responde 401 JSON', async () => {
	const response = await requestGestorApp(`/gestor/api/recursos/${RESOURCE_ID}`, validBody());

	assert.equal(response.status, 401);
	assert.deepEqual(response.body, {
		success: false,
		error: 'Não autenticado',
		code: 'UNAUTHORIZED',
	});
});

test('updateRecurso retorna 400 para id invalido antes de lookup', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
			params: { id: 'invalido' },
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async (...args) => {
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

test('updateRecurso retorna 404 quando falta contexto canonico para usuario nao privilegiado', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			session: { user: {} },
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async (...args) => {
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

test('updateRecurso retorna 404 quando a unidade alvo esta fora do escopo contextual', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
			body: validBody({ unidade_id: OUT_OF_SCOPE_UNIT_ID }),
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async (...args) => {
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

test('updateRecurso retorna 400 para payload minimo invalido quando unidade_id esta ausente', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
			body: validBody({ unidade_id: '' }),
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async (...args) => {
				calls.push(args);
				return null;
			},
		},
	});

	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, {
		success: false,
		code: 'BAD_REQUEST',
		message: 'Unidade é obrigatória',
	});
	assert.equal(calls.length, 0);
});

test('updateRecurso retorna 404 para recurso inexistente apos lookup escopado', async () => {
	const calls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async (...args) => {
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

test('updateRecurso retorna 400 para duplicidade de placa de outro recurso', async () => {
	const duplicateCalls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
			body: validBody({ placa: 'ZZZ-9Z99' }),
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async () => existingResource(),
			findOutroRecursoByPlacaUpper: async (...args) => {
				duplicateCalls.push(args);
				return { _id: 'dup-placa' };
			},
		},
	});

	assert.deepEqual(duplicateCalls, [[RESOURCE_ID, 'ZZZ-9Z99', CONTEXTUAL_UNIT_ID]]);
	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, {
		success: false,
		code: 'BAD_REQUEST',
		message: 'Placa já cadastrada para outro recurso',
	});
});

test('updateRecurso retorna 400 para duplicidade de chassi e interrompe antes do RENAVAM', async () => {
	const chassiCalls = [];
	const renavamCalls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
			body: validBody({ chassi: '9BWZZZ377VT004252' }),
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async () => existingResource(),
			findOutroRecursoByPlacaUpper: async () => null,
			findOutroRecursoByChassiUpper: async (...args) => {
				chassiCalls.push(args);
				return { _id: 'dup-chassi' };
			},
			findOutroRecursoByRenavam: async (...args) => {
				renavamCalls.push(args);
				return null;
			},
		},
	});

	assert.deepEqual(chassiCalls, [[RESOURCE_ID, '9BWZZZ377VT004252', CONTEXTUAL_UNIT_ID]]);
	assert.deepEqual(renavamCalls, []);
	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, {
		success: false,
		code: 'BAD_REQUEST',
		message: 'Chassi já cadastrado para outro recurso',
	});
});

test('updateRecurso retorna 400 para duplicidade de RENAVAM apos passar por placa e chassi', async () => {
	const renavamCalls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
			body: validBody({ renavam: '10987654321' }),
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async () => existingResource(),
			findOutroRecursoByPlacaUpper: async () => null,
			findOutroRecursoByChassiUpper: async () => null,
			findOutroRecursoByRenavam: async (...args) => {
				renavamCalls.push(args);
				return { _id: 'dup-renavam' };
			},
		},
	});

	assert.deepEqual(renavamCalls, [[RESOURCE_ID, '10987654321', CONTEXTUAL_UNIT_ID]]);
	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, {
		success: false,
		code: 'BAD_REQUEST',
		message: 'RENAVAM já cadastrado para outro recurso',
	});
});

test('updateRecurso retorna sucesso com payload exato atualizado', async () => {
	const updateCalls = [];
	const atualizado = existingResource({
		placa: 'ZZZ-9Z99',
		chassi: '9BWZZZ377VT004252',
		renavam: '10987654321',
		ano: 2026,
		mod: 2027,
		marca: 'Toyota',
		modelo: 'Corolla',
		cor: 'Preto',
		ativo: false,
	});
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'diretor' },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
			body: validBody({
				placa: 'ZZZ-9Z99',
				chassi: '9BWZZZ377VT004252',
				renavam: '10987654321',
				ano: '2026',
				mod: '2027',
				marca: 'Toyota',
				modelo: 'Corolla',
				cor: 'Preto',
				ativo: false,
			}),
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async () => existingResource(),
			findOutroRecursoByPlacaUpper: async () => null,
			findOutroRecursoByChassiUpper: async () => null,
			findOutroRecursoByRenavam: async () => null,
			updateRecursoByIdComUnidadeNome: async (...args) => {
				updateCalls.push(JSON.parse(JSON.stringify(args)));
				return atualizado;
			},
		},
	});

	assert.deepEqual(updateCalls, [[
		RESOURCE_ID,
		{
			unidade_id: CONTEXTUAL_UNIT_ID,
			tipo: 'carro',
			placa: 'ZZZ-9Z99',
			chassi: '9BWZZZ377VT004252',
			renavam: '10987654321',
			ano: 2026,
			mod: 2027,
			marca: 'Toyota',
			modelo: 'Corolla',
			cor: 'Preto',
			ativo: false,
		},
		CONTEXTUAL_UNIT_ID,
	]]);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		success: true,
		data: atualizado,
	});
});

test('updateRecurso retorna 500 quando a persistencia lanca erro interno', async () => {
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findRecursoByIdComUnidadeNome: async () => existingResource(),
			findOutroRecursoByPlacaUpper: async () => null,
			findOutroRecursoByChassiUpper: async () => null,
			findOutroRecursoByRenavam: async () => null,
			updateRecursoByIdComUnidadeNome: async () => {
				throw new Error('forced-recursos-update-failure');
			},
		},
	});

	assert.equal(res.statusCode, 500);
	assert.deepEqual(res.body, {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-recursos-update-failure',
	});
});