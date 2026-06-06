import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import request from 'supertest';

const BRIDGE_ALIAS = '#modules/gestor/app/services/apiDbBridgeService.js';
const CONTROLLER_ALIAS = '#modules/gestor/app/controllers/funcaoApiController.js';
const BRIDGE_FILE_URL = pathToFileURL(resolve(process.cwd(), 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const BRIDGE_MOCK_URL = 'mock:gestor-funcoes-create-bridge';
const CONTROLLER_ROUTE_MOCK_URL = 'mock:gestor-funcoes-create-route-controller';
const OWNER_CONTROLLER_IMPORT = '../src/modules/gestor/app/controllers/funcaoApiController.js?gestor-funcoes-create-runtime-owner';

globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_MOCKS__ = {};
globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_USE_BRIDGE_MOCK__ = false;
globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_USE_ROUTE_CONTROLLER_MOCK__ = false;
globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__ = [];

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === BRIDGE_ALIAS && globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_USE_BRIDGE_MOCK__) {
			return {
				shortCircuit: true,
				url: BRIDGE_MOCK_URL,
			};
		}

		if (specifier === CONTROLLER_ALIAS && globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_USE_ROUTE_CONTROLLER_MOCK__) {
			return {
				shortCircuit: true,
				url: CONTROLLER_ROUTE_MOCK_URL,
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
const getState = () => globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_MOCKS__;
export * from ${JSON.stringify(BRIDGE_FILE_URL)};
export function findFuncaoByNome(...args) { return getState().findFuncaoByNome(...args); }
export function createFuncao(...args) { return getState().createFuncao(...args); }
export function findUnidadeByIdWithModulosAcessiveis(...args) { return getState().findUnidadeByIdWithModulosAcessiveis(...args); }
export function findUnidadeUserBaseLean(...args) { return getState().findUnidadeUserBaseLean(...args); }
`,
			};
		}

		if (url === CONTROLLER_ROUTE_MOCK_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: `
const getCalls = () => globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__;
export async function createFuncao(req, res) {
	getCalls().push({
		body: req?.body || null,
		unitScope: req?.unitScope || null,
		userRole: req?.user?.role || null,
	});
	return res.status(201).json({ success: true, data: { _id: ${JSON.stringify(CREATED_FUNCAO_ID)} } });
}
export async function getFuncao(req, res) { return res.status(200).json({ success: true }); }
export async function updateFuncao(req, res) { return res.status(200).json({ success: true }); }
export async function getFuncoesPorUnidade(req, res) { return res.status(200).json({ success: true, data: [] }); }
export async function listarFuncoesApi(req, res) { return res.status(200).json({ success: true, data: [] }); }
export async function deleteFuncao(req, res) { return res.status(200).json({ success: true }); }
export async function bulkUpdateFuncoes(req, res) { return res.status(200).json({ success: true, data: { updated: 0, results: [] } }); }
export default {
	createFuncao,
	getFuncao,
	updateFuncao,
	getFuncoesPorUnidade,
	listarFuncoesApi,
	deleteFuncao,
	bulkUpdateFuncoes,
};
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
	globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__ = [];

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
	globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_USE_BRIDGE_MOCK__ = false;
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

async function requestGestorAppWithSession({
	method = 'POST',
	pathname = '/api/funcoes',
	body,
	sessionUser,
	useBridgeMock = false,
	useRouteControllerMock = false,
} = {}) {
	globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_USE_BRIDGE_MOCK__ = !!useBridgeMock;
	globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_USE_ROUTE_CONTROLLER_MOCK__ = !!useRouteControllerMock;
	const routeModuleQuery = useRouteControllerMock ? 'route-controller-mock' : (useBridgeMock ? 'bridge-mock' : 'bridge-real');
	const routeModule = await import(`../src/modules/gestor/app/routes/funcaoApi.js?${routeModuleQuery}-${Date.now()}`);
	const app = express();
	app.use(express.json());
	app.use((req, res, next) => {
		req.session = sessionUser ? { user: { ...sessionUser } } : {};
		next();
	});
	app.use('/gestor', routeModule.default);

	const req = request(app)
		[method.toLowerCase()]("/gestor" + pathname)
		.set('Accept', 'application/json');

	if (body !== undefined) {
		req.send(body);
	}

	return req;
}

async function invokeOwner({ body = {}, unitScope } = {}) {
	globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_USE_BRIDGE_MOCK__ = true;
	const { createFuncao } = await import(OWNER_CONTROLLER_IMPORT);
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

test('POST /gestor/api/funcoes com diretor sem contexto canonico ativo retorna 400 na borda real', async () => {
	const response = await requestGestorAppWithSession({
		pathname: '/api/funcoes',
		body: {
			nome: 'Supervisor sem contexto',
			unidade_principal_id: CONTEXT_PRINCIPAL_ID,
		},
		sessionUser: {
			id: 'session-diretor-sem-contexto',
			email: 'diretor.sem.contexto@example.com',
			role: 'diretor',
			nome: 'Diretor sem contexto',
		},
	});

	assert.equal(response.status, 400);
	assert.equal(response.body?.success, false);
	assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
});

test('POST /gestor/api/funcoes com admin sem contexto canonico ativo e payload real (apenas unidade_principal_id) deriva escopo e cria com 201', async () => {
	const response = await requestGestorAppWithSession({
		pathname: '/api/funcoes',
		body: {
			nome: 'Supervisor admin sem contexto',
			descricao: 'Criado com escopo derivado',
			unidade_principal_id: CONTEXT_PRINCIPAL_ID,
			modulos_habilitados: [MOD_ALLOWED_1, MOD_BLOCKED, MOD_ALLOWED_2],
		},
		sessionUser: {
			id: 'session-admin-sem-contexto',
			email: 'admin.sem.contexto@example.com',
			role: 'admin',
			nome: 'Admin sem contexto',
		},
		useBridgeMock: true,
		useRouteControllerMock: true,
	});

	assert.equal(response.status, 201);
	assert.equal(response.body?.success, true);
	assert.equal(response.body?.data?._id || response.body?.id, CREATED_FUNCAO_ID);
	assert.equal(globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__.length, 1);
	assert.equal(
		String(globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__[0]?.body?.unidade_principal_id || ''),
		CONTEXT_PRINCIPAL_ID,
	);
	assert.equal(
		String(globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__[0]?.unitScope?.unidadeId || ''),
		CONTEXT_PRINCIPAL_ID,
	);
	assert.equal(
		String(globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__[0]?.body?.unidade_id || ''),
		CONTEXT_PRINCIPAL_ID,
	);
	assert.equal(
		String(globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__[0]?.body?.unidadeId || ''),
		'',
	);
});

test('POST /gestor/api/funcoes com user sem contexto canonico ativo continua bloqueado com 400 mesmo com unidadePrincipal no body', async () => {
	const response = await requestGestorAppWithSession({
		pathname: '/api/funcoes',
		body: {
			nome: 'Supervisor user sem contexto',
			unidadePrincipal: CONTEXT_PRINCIPAL_ID,
		},
		sessionUser: {
			id: 'session-user-sem-contexto',
			email: 'user.sem.contexto@example.com',
			role: 'user',
			nome: 'User sem contexto',
		},
		useBridgeMock: true,
		useRouteControllerMock: true,
	});

	assert.equal(response.status, 400);
	assert.equal(response.body?.success, false);
	assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
	assert.equal(globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__.length, 0);
});

test('POST /gestor/api/funcoes com admin sem contexto ativo e sem unidade no body retorna UNIDADE_ID_REQUIRED', async () => {
	const response = await requestGestorAppWithSession({
		pathname: '/api/funcoes',
		body: {
			nome: 'Supervisor sem unidade no payload',
			descricao: 'Sem unidade',
			modulos_habilitados: [MOD_ALLOWED_1],
		},
		sessionUser: {
			id: 'session-admin-sem-unidade',
			email: 'admin.sem.unidade@example.com',
			role: 'admin',
			nome: 'Admin sem unidade',
		},
		useBridgeMock: true,
		useRouteControllerMock: true,
	});

	assert.equal(response.status, 400);
	assert.equal(response.body?.success, false);
	assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
	assert.equal(globalThis.__GESTOR_FUNCOES_CREATE_RUNTIME_ROUTE_CONTROLLER_CALLS__.length, 0);
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