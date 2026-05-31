import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const ROOT = process.cwd();
const PAGES_ROUTE_MODULE_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/app/routes/pagesRouter.js')).href;
const SETOR_ROUTE_MODULE_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/app/routes/setorApi.js')).href;
const RECURSO_ROUTE_MODULE_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/app/routes/recursoApi.js')).href;

const PAGES_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-setor-recurso-global-readonly-pages-controller';
const SETOR_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-setor-recurso-global-readonly-setor-controller';
const RECURSO_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-setor-recurso-global-readonly-recurso-controller';
const REQUIRE_LOGIN_MOCK_MODULE_URL = 'mock:gestor-setor-recurso-global-readonly-require-login';
const REQUIRE_UNIT_SCOPE_MOCK_MODULE_URL = 'mock:gestor-setor-recurso-global-readonly-require-unit-scope';

const state = {
	requireUnitScopeCalls: [],
	handlerCalls: [],
};

globalThis.__GESTOR_SETOR_RECURSO_GLOBAL_READONLY_ROUTE_STATE__ = state;

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '#modules/gestor/app/controllers/views/pagesController.js') {
			return { url: PAGES_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
		}
		if (specifier === '#modules/gestor/app/controllers/setorApiController.js') {
			return { url: SETOR_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
		}
		if (specifier === '#modules/gestor/app/controllers/recursoApiController.js') {
			return { url: RECURSO_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
		}
		if (specifier === '#modules/gestor/app/middlewares/requireLogin.js') {
			return { url: REQUIRE_LOGIN_MOCK_MODULE_URL, shortCircuit: true };
		}
		if (specifier === '#modules/gestor/app/middlewares/requireUnitScope.js') {
			return { url: REQUIRE_UNIT_SCOPE_MOCK_MODULE_URL, shortCircuit: true };
		}

		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === PAGES_CONTROLLER_MOCK_MODULE_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					'const state = globalThis.__GESTOR_SETOR_RECURSO_GLOBAL_READONLY_ROUTE_STATE__;',
					'function capture(name, req) {',
					'  state.handlerCalls.push({ name, method: req.method, path: req.path, user: req.user || null, unitScope: req.unitScope || null });',
					'}',
					'function makePageHandler(name) {',
					'  return function handler(req, res) {',
					'    capture(name, req);',
					'    return res.status(200).type("html").send(`<html><body>${name}</body></html>`);',
					'  };',
					'}',
					'export const paginaDashboard = makePageHandler("paginaDashboard");',
					'export const paginaLogin = makePageHandler("paginaLogin");',
					'export const paginaContato = makePageHandler("paginaContato");',
					'export const paginaPrimeiroAcesso = makePageHandler("paginaPrimeiroAcesso");',
					'export const paginaEsqueciSenha = makePageHandler("paginaEsqueciSenha");',
					'export const paginaErro = makePageHandler("paginaErro");',
					'export const paginaUsuarios = makePageHandler("paginaUsuarios");',
					'export const paginaUnidades = makePageHandler("paginaUnidades");',
					'export const paginaEditarUnidade = makePageHandler("paginaEditarUnidade");',
					'export const paginaModulos = makePageHandler("paginaModulos");',
					'export const paginaFuncoes = makePageHandler("paginaFuncoes");',
					'export const paginaFuncionarios = makePageHandler("paginaFuncionarios");',
					'export const paginaRecursos = makePageHandler("paginaRecursos");',
					'export const partialEndereco = makePageHandler("partialEndereco");',
					'export const paginaSetores = makePageHandler("paginaSetores");',
					'export const paginaFeedback = makePageHandler("paginaFeedback");',
				].join('\n'),
			};
		}

		if (url === SETOR_CONTROLLER_MOCK_MODULE_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					'const state = globalThis.__GESTOR_SETOR_RECURSO_GLOBAL_READONLY_ROUTE_STATE__;',
					'function makeHandler(name) {',
					'  return function handler(req, res) {',
					'    state.handlerCalls.push({ name, method: req.method, path: req.path, user: req.user || null, unitScope: req.unitScope || null });',
					'    return res.status(200).json({ success: true, handler: name, unitScope: req.unitScope || null, userRole: req.user?.role || null });',
					'  };',
					'}',
					'export const createSetor = makeHandler("createSetor");',
					'export const getSetoresPorUnidade = makeHandler("getSetoresPorUnidade");',
					'export const getSetor = makeHandler("getSetor");',
					'export const updateSetor = makeHandler("updateSetor");',
					'export const listarSetores = makeHandler("listarSetores");',
					'export const deleteSetor = makeHandler("deleteSetor");',
					'export const debugGetCounter = makeHandler("debugGetCounter");',
					'export const debugFixCounter = makeHandler("debugFixCounter");',
				].join('\n'),
			};
		}

		if (url === RECURSO_CONTROLLER_MOCK_MODULE_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					'const state = globalThis.__GESTOR_SETOR_RECURSO_GLOBAL_READONLY_ROUTE_STATE__;',
					'function makeHandler(name) {',
					'  return function handler(req, res) {',
					'    state.handlerCalls.push({ name, method: req.method, path: req.path, user: req.user || null, unitScope: req.unitScope || null });',
					'    return res.status(200).json({ success: true, handler: name, unitScope: req.unitScope || null, userRole: req.user?.role || null });',
					'  };',
					'}',
					'export const listarRecursosApi = makeHandler("listarRecursosApi");',
					'export const getRecurso = makeHandler("getRecurso");',
					'export const createRecurso = makeHandler("createRecurso");',
					'export const updateRecurso = makeHandler("updateRecurso");',
					'export const deleteRecurso = makeHandler("deleteRecurso");',
				].join('\n'),
			};
		}

		if (url === REQUIRE_LOGIN_MOCK_MODULE_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					'export default function requireLogin(req, res, next) {',
					'  if (req.user) return next();',
					'  return res.status(401).json({ success: false, error: "UNAUTHORIZED" });',
					'}',
				].join('\n'),
			};
		}

		if (url === REQUIRE_UNIT_SCOPE_MOCK_MODULE_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					'const state = globalThis.__GESTOR_SETOR_RECURSO_GLOBAL_READONLY_ROUTE_STATE__;',
					'function normalizeRole(value) {',
					'  const role = String(value || "").trim().toLowerCase();',
					'  return role || null;',
					'}',
					'function isPrivilegedRole(value) {',
					'  const role = normalizeRole(value);',
					'  return role === "master" || role === "admin";',
					'}',
					'export function isPrivilegedGestorContext({ user = null, authContext = null, sessionUser = null } = {}) {',
					'  if (user?.isMaster === true) return true;',
					'  if (sessionUser?.isMaster === true) return true;',
					'  return [',
					'    user?.role,',
					'    user?.globalRole,',
					'    user?.global_role,',
					'    user?.effectiveRole,',
					'    sessionUser?.role,',
					'    sessionUser?.globalRole,',
					'    sessionUser?.global_role,',
					'    sessionUser?.effectiveRole,',
					'    authContext?.effectiveRole,',
					'    authContext?.effective_role,',
					'    authContext?.globalRole,',
					'    authContext?.global_role,',
					'  ].some(isPrivilegedRole);',
					'}',
					'export function requireUnitScope(req, res, next) {',
					'  state.requireUnitScopeCalls.push({',
					'    method: req.method,',
					'    path: req.path,',
					'    user: req.user || null,',
					'    params: { ...(req.params || {}) },',
					'  });',
					'  const unidadeId = req.session?.gestorAuthContext?.active_unidade_id',
					'    || req.user?.unidade_id',
					'    || req.params?.unidadeId',
					'    || req.params?.unidade_id',
					'    || req.query?.unidadeId',
					'    || req.query?.unidade_id',
					'    || req.body?.unidadeId',
					'    || req.body?.unidade_id',
					'    || null;',
					'  if (!unidadeId) {',
					'    return res.status(400).json({ success: false, error: "UNIDADE_ID_REQUIRED" });',
					'  }',
					'  req.unitScope = { type: "unit", unidadeId: String(unidadeId) };',
					'  return next();',
					'}',
					'export default requireUnitScope;',
				].join('\n'),
			};
		}

		return nextLoad(url, context);
	},
});

function resetState() {
	state.requireUnitScopeCalls = [];
	state.handlerCalls = [];
}

async function buildApp(routeModuleUrl, { user = null, sessionUser = null, gestorAuthContext = null } = {}) {
	const { default: router } = await import(`${routeModuleUrl}?case=${Date.now()}-${Math.random()}`);
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		req.user = user;
		req.session = {};
		if (sessionUser || user) {
			req.session.user = sessionUser || user;
		}
		if (gestorAuthContext) {
			req.session.gestorAuthContext = gestorAuthContext;
		}
		next();
	});
	app.use('/gestor', router);
	return app;
}

beforeEach(() => {
	resetState();
});

test('GET /gestor/setores permite master global sem unidade ativa sem passar por requireUnitScope', async () => {
	const app = await buildApp(PAGES_ROUTE_MODULE_URL, {
		user: { role: 'master', isMaster: true },
	});

	const response = await request(app)
		.get('/gestor/setores')
		.set('Accept', 'text/html');

	assert.equal(response.status, 200);
	assert.match(response.headers['content-type'] || '', /text\/html/i);
	assert.match(response.text, /paginaSetores/);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.handlerCalls.length, 1);
	assert.equal(state.handlerCalls[0].name, 'paginaSetores');
	assert.equal(state.handlerCalls[0].unitScope, null);
});

test('GET /gestor/setores mantem diretor sem unidade bloqueado por UNIDADE_ID_REQUIRED', async () => {
	const app = await buildApp(PAGES_ROUTE_MODULE_URL, {
		user: { role: 'diretor', isMaster: false },
	});

	const response = await request(app)
		.get('/gestor/setores')
		.set('Accept', 'text/html');

	assert.equal(response.status, 400);
	assert.deepEqual(response.body, {
		success: false,
		error: 'UNIDADE_ID_REQUIRED',
	});
	assert.equal(state.requireUnitScopeCalls.length, 1);
	assert.equal(state.handlerCalls.length, 0);
});

test('GET /gestor/api/setores permite admin global via auth-context sem passar por requireUnitScope', async () => {
	const app = await buildApp(SETOR_ROUTE_MODULE_URL, {
		user: { role: 'user', isMaster: false },
		gestorAuthContext: { source: 'auth-context-v1', global_role: 'admin' },
	});

	const response = await request(app)
		.get('/gestor/api/setores')
		.set('Accept', 'application/json');

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'listarSetores');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.handlerCalls.length, 1);
	assert.equal(state.handlerCalls[0].name, 'listarSetores');
});

test('GET /gestor/api/recursos permite master global sem unidade ativa sem passar por requireUnitScope', async () => {
	const app = await buildApp(RECURSO_ROUTE_MODULE_URL, {
		user: { role: 'master', isMaster: true },
	});

	const response = await request(app)
		.get('/gestor/api/recursos')
		.set('Accept', 'application/json');

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'listarRecursosApi');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.handlerCalls.length, 1);
	assert.equal(state.handlerCalls[0].name, 'listarRecursosApi');
});

test('POST /gestor/api/setores continua exigindo unitScope para master sem unidade', async () => {
	const app = await buildApp(SETOR_ROUTE_MODULE_URL, {
		user: { role: 'master', isMaster: true },
	});

	const response = await request(app)
		.post('/gestor/api/setores')
		.set('Accept', 'application/json')
		.send({ nome: 'Novo setor' });

	assert.equal(response.status, 400);
	assert.deepEqual(response.body, {
		success: false,
		error: 'UNIDADE_ID_REQUIRED',
	});
	assert.equal(state.requireUnitScopeCalls.length, 1);
	assert.equal(state.handlerCalls.length, 0);
	assert.equal(state.requireUnitScopeCalls[0].method, 'POST');
});

test('POST /gestor/api/recursos continua exigindo unitScope para master sem unidade', async () => {
	const app = await buildApp(RECURSO_ROUTE_MODULE_URL, {
		user: { role: 'master', isMaster: true },
	});

	const response = await request(app)
		.post('/gestor/api/recursos')
		.set('Accept', 'application/json')
		.send({ tipo: 'carro' });

	assert.equal(response.status, 400);
	assert.deepEqual(response.body, {
		success: false,
		error: 'UNIDADE_ID_REQUIRED',
	});
	assert.equal(state.requireUnitScopeCalls.length, 1);
	assert.equal(state.handlerCalls.length, 0);
	assert.equal(state.requireUnitScopeCalls[0].method, 'POST');
});