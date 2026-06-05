import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const ROOT = process.cwd();
const ROUTE_MODULE_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/app/routes/unidadeApi.js')).href;
const CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-unidades-list-bootstrap-route-controller';
const REQUIRE_LOGIN_MOCK_MODULE_URL = 'mock:gestor-unidades-list-bootstrap-route-require-login';
const REQUIRE_UNIT_SCOPE_MOCK_MODULE_URL = 'mock:gestor-unidades-list-bootstrap-route-require-unit-scope';

const state = {
	requireUnitScopeCalls: [],
	controllerCalls: [],
};

globalThis.__GESTOR_UNIDADES_LIST_BOOTSTRAP_ROUTE_STATE__ = state;

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '#modules/gestor/app/controllers/unidadeApiController.js') {
			return { url: CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
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
		if (url === CONTROLLER_MOCK_MODULE_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					'const state = globalThis.__GESTOR_UNIDADES_LIST_BOOTSTRAP_ROUTE_STATE__;',
					'function makeHandler(name) {',
					'  return function handler(req, res) {',
					'    state.controllerCalls.push({',
					'      name,',
					'      method: req.method,',
					'      path: req.path,',
					'      user: req.user || null,',
					'      unitScope: req.unitScope || null,',
					'    });',
					'    return res.status(200).json({',
					'      success: true,',
					'      handler: name,',
					'      userRole: req.user?.role || null,',
					'      isMaster: req.user?.isMaster === true,',
					'      unitScope: req.unitScope || null,',
					'    });',
					'  };',
					'}',
					'export const createUnidade = makeHandler("createUnidade");',
					'export const updateUnidade = makeHandler("updateUnidade");',
					'export const toggleAccessUnidades = makeHandler("toggleAccessUnidades");',
					'export const getUnidadeById = makeHandler("getUnidadeById");',
					'export const getUnidadeModulos = makeHandler("getUnidadeModulos");',
					'export const getUnidadeProvisioningStatus = makeHandler("getUnidadeProvisioningStatus");',
					'export const getUnidadeProvisioningEvents = makeHandler("getUnidadeProvisioningEvents");',
					'export const retryUnidadeProvisioning = makeHandler("retryUnidadeProvisioning");',
					'export const deleteUnidade = makeHandler("deleteUnidade");',
					'export const uploadLogoUnidade = makeHandler("uploadLogoUnidade");',
					'export const uploadLogoUnidadeInline = makeHandler("uploadLogoUnidadeInline");',
					'export const getUnidadeLogo = makeHandler("getUnidadeLogo");',
					'export const listUnidades = makeHandler("listUnidades");',
					'export const getUnidadePublic = makeHandler("getUnidadePublic");',
				].join('\n'),
			};
		}

		if (url === REQUIRE_LOGIN_MOCK_MODULE_URL) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					'export default function requireLogin(req, res, next) {',
					'  if (req.user || req.session?.user) return next();',
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
					'const state = globalThis.__GESTOR_UNIDADES_LIST_BOOTSTRAP_ROUTE_STATE__;',
					'function normalizeId(value) {',
					'  if (value === null || value === undefined) return null;',
					'  const normalized = String(value).trim();',
					'  return normalized || null;',
					'}',
					'function normalizeRole(value) {',
					'  const role = String(value || "").trim().toLowerCase();',
					'  return role || null;',
					'}',
					'function isCanonicalAuthContext(authContext) {',
					'  return authContext?.source === "auth-context-v1";',
					'}',
					'function isPrivilegedRole(value) {',
					'  const role = normalizeRole(value);',
					'  return role === "master" || role === "admin";',
					'}',
					'function resolveRequestUnidadeId(req) {',
					'  return normalizeId(',
					'    req.params?.unidadeId',
					'    || req.params?.id',
					'    || req.query?.unidadeId',
					'    || req.query?.unidade_id',
					'    || req.body?.unidadeId',
					'    || req.body?.unidade_id',
					'  );',
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
					'function resolveLegacyUnidadeId(req, authContext) {',
					'  const requestUnidadeId = resolveRequestUnidadeId(req);',
					'  const privileged = isPrivilegedGestorContext({',
					'    user: req.user || null,',
					'    sessionUser: req.session?.user || null,',
					'    authContext,',
					'  });',
					'  if (isCanonicalAuthContext(authContext)) {',
					'    return privileged ? requestUnidadeId : null;',
					'  }',
					'  return requestUnidadeId;',
					'}',
					'export function requireUnitScope(req, res, next) {',
					'  state.requireUnitScopeCalls.push({',
					'    method: req.method,',
					'    path: req.path,',
					'    user: req.user || null,',
					'    params: { ...(req.params || {}) },',
					'  });',
					'  const authContext = req.session?.gestorAuthContext || null;',
					'  const unidadeId = normalizeId(',
					'    authContext?.active_unidade_id',
					'    || authContext?.activeUnidadeId',
					'    || authContext?.activeContext?.unidadeId',
					'    || resolveLegacyUnidadeId(req, authContext)',
					'  );',
					'  if (!unidadeId) {',
					'    return res.status(400).json({ success: false, error: "UNIDADE_ID_REQUIRED" });',
					'  }',
					'  req.unitScope = { type: "unit", unidadeId: String(unidadeId) };',
					'  return next();',
					'}',
				].join('\n'),
			};
		}

		return nextLoad(url, context);
	},
});

function resetState() {
	state.requireUnitScopeCalls = [];
	state.controllerCalls = [];
}

async function buildApp({ user = null, sessionUser = null, gestorAuthContext = null } = {}) {
	const { default: router } = await import(`${ROUTE_MODULE_URL}?case=${Date.now()}-${Math.random()}`);
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		req.user = user;
		req.session = {
			...(sessionUser ? { user: sessionUser } : {}),
			...(gestorAuthContext ? { gestorAuthContext } : {}),
		};
		next();
	});
	app.use(router);
	return app;
}

beforeEach(() => {
	resetState();
});

test('GET /api/unidades permite master sem unidade ativa sem passar por requireUnitScope', async () => {
	const app = await buildApp({ user: { role: 'master', isMaster: true } });
	const response = await request(app).get('/api/unidades');

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'listUnidades');
	assert.equal(response.body.userRole, 'master');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.controllerCalls[0].name, 'listUnidades');
});

test('GET /api/unidades permite admin sem unidade ativa sem passar por requireUnitScope', async () => {
	const app = await buildApp({ user: { role: 'admin', isMaster: false } });
	const response = await request(app).get('/api/unidades');

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'listUnidades');
	assert.equal(response.body.userRole, 'admin');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.controllerCalls[0].name, 'listUnidades');
});

test('GET /api/unidades permite admin apenas por global_role sem unidade ativa sem passar por requireUnitScope', async () => {
	const app = await buildApp({
		user: { role: 'user', isMaster: false, global_role: 'admin' },
		gestorAuthContext: { source: 'auth-context-v1', global_role: 'admin' },
	});
	const response = await request(app).get('/api/unidades');

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'listUnidades');
	assert.equal(response.body.userRole, 'user');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.controllerCalls[0].name, 'listUnidades');
});

test('GET /api/unidades permite master apenas por auth-context global sem unidade ativa sem passar por requireUnitScope', async () => {
	const app = await buildApp({
		user: { role: 'user', isMaster: false },
		gestorAuthContext: { source: 'auth-context-v1', global_role: 'master' },
	});
	const response = await request(app).get('/api/unidades');

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'listUnidades');
	assert.equal(response.body.userRole, 'user');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.controllerCalls[0].name, 'listUnidades');
});

test('GET /api/unidades mantem diretor sem unidade bloqueado por UNIDADE_ID_REQUIRED', async () => {
	const app = await buildApp({ user: { role: 'diretor', isMaster: false } });
	const response = await request(app).get('/api/unidades');

	assert.equal(response.status, 400);
	assert.deepEqual(response.body, {
		success: false,
		error: 'UNIDADE_ID_REQUIRED',
	});
	assert.equal(state.requireUnitScopeCalls.length, 1);
	assert.equal(state.controllerCalls.length, 0);
});

test('GET /api/unidades mantem user sem unidade bloqueado por UNIDADE_ID_REQUIRED', async () => {
	const app = await buildApp({ user: { role: 'user', isMaster: false } });
	const response = await request(app).get('/api/unidades');

	assert.equal(response.status, 400);
	assert.deepEqual(response.body, {
		success: false,
		error: 'UNIDADE_ID_REQUIRED',
	});
	assert.equal(state.requireUnitScopeCalls.length, 1);
	assert.equal(state.controllerCalls.length, 0);
});

test('POST /api/unidades permite create global para master sem unidade ativa', async () => {
	const app = await buildApp({ user: { role: 'master', isMaster: true } });
	const response = await request(app).post('/api/unidades').send({ nome: 'Nova unidade' });

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'createUnidade');
	assert.equal(response.body.userRole, 'master');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.controllerCalls[0].name, 'createUnidade');
	assert.equal(state.controllerCalls[0].method, 'POST');
});

test('POST /api/unidades permite create global para admin sem unidade ativa', async () => {
	const app = await buildApp({ user: { role: 'admin', isMaster: false } });
	const response = await request(app).post('/api/unidades').send({ nome: 'Nova unidade' });

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'createUnidade');
	assert.equal(response.body.userRole, 'admin');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.controllerCalls[0].name, 'createUnidade');
	assert.equal(state.controllerCalls[0].method, 'POST');
});

test('POST /api/unidades preserva branch global com auth-context canônico sem unidade ativa mesmo com unidade legada residual', async () => {
	const app = await buildApp({
		user: { role: 'admin', isMaster: false, unidade_id: 'legacy-user-unit' },
		sessionUser: { role: 'admin', global_role: 'admin', unidade_id: 'legacy-session-unit' },
		gestorAuthContext: { source: 'auth-context-v1', global_role: 'admin' },
	});
	const response = await request(app).post('/api/unidades').send({ nome: 'Nova unidade' });

	assert.equal(response.status, 200, JSON.stringify(response.body));
	assert.equal(response.body.handler, 'createUnidade');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.controllerCalls[0].name, 'createUnidade');
	assert.equal(state.controllerCalls[0].method, 'POST');
});

test('POST /api/unidades mantem diretor sem unidade bloqueado por UNIDADE_ID_REQUIRED', async () => {
	const app = await buildApp({ user: { role: 'diretor', isMaster: false } });
	const response = await request(app).post('/api/unidades').send({ nome: 'Nova unidade' });

	assert.equal(response.status, 400);
	assert.deepEqual(response.body, {
		success: false,
		error: 'UNIDADE_ID_REQUIRED',
	});
	assert.equal(state.requireUnitScopeCalls.length, 1);
	assert.equal(state.controllerCalls.length, 0);
	assert.equal(state.requireUnitScopeCalls[0].method, 'POST');
});

test('POST /api/unidades mantem user sem unidade bloqueado por UNIDADE_ID_REQUIRED', async () => {
	const app = await buildApp({ user: { role: 'user', isMaster: false } });
	const response = await request(app).post('/api/unidades').send({ nome: 'Nova unidade' });

	assert.equal(response.status, 400);
	assert.deepEqual(response.body, {
		success: false,
		error: 'UNIDADE_ID_REQUIRED',
	});
	assert.equal(state.requireUnitScopeCalls.length, 1);
	assert.equal(state.controllerCalls.length, 0);
	assert.equal(state.requireUnitScopeCalls[0].method, 'POST');
});