import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const ROOT = process.cwd();
const ROUTE_MODULE_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/app/routes/unidadeApi.js')).href;
const CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-unidades-provisioning-route-controller';
const REQUIRE_LOGIN_MOCK_MODULE_URL = 'mock:gestor-unidades-provisioning-route-require-login';
const REQUIRE_UNIT_SCOPE_MOCK_MODULE_URL = 'mock:gestor-unidades-provisioning-route-require-unit-scope';

const state = {
	requireUnitScopeCalls: [],
	controllerCalls: [],
};

globalThis.__GESTOR_UNIDADES_PROVISIONING_ROUTE_STATE__ = state;

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
					'const state = globalThis.__GESTOR_UNIDADES_PROVISIONING_ROUTE_STATE__;',
					'function makeHandler(name) {',
					'  return function handler(req, res) {',
					'    state.controllerCalls.push({',
					'      name,',
					'      method: req.method,',
					'      path: req.path,',
					'      user: req.user || null,',
					'      sessionUser: req.session?.user || null,',
					'      sessionAuthContext: req.session?.gestorAuthContext || null,',
					'      unitScope: req.unitScope || null,',
					'    });',
					'    return res.status(200).json({',
					'      success: true,',
					'      handler: name,',
					'      unitScope: req.unitScope || null,',
					'      userRole: req.user?.role || null,',
					'      sessionGlobalRole: req.session?.user?.global_role || null,',
					'      authContextGlobalRole: req.session?.gestorAuthContext?.global_role || null,',
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
					'const state = globalThis.__GESTOR_UNIDADES_PROVISIONING_ROUTE_STATE__;',
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
					'    sessionUser: req.session?.user || null,',
					'    sessionAuthContext: req.session?.gestorAuthContext || null,',
					'    params: { ...(req.params || {}) },',
					'  });',
					'  const unidadeId = req.session?.gestorAuthContext?.active_unidade_id',
					'    || req.user?.unidade_id',
					'    || req.session?.user?.unidade_id',
					'    || req.params?.unidadeId',
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

test('GET /api/unidades/:id/provisioning permite master global por auth-context sem unidade ativa sem passar por requireUnitScope', async () => {
	const app = await buildApp({
		user: { role: 'user', isMaster: false },
		sessionUser: { role: 'user', global_role: 'master' },
		gestorAuthContext: { source: 'auth-context-v1', global_role: 'master' },
	});
	const response = await request(app).get('/api/unidades/u-123/provisioning');

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'getUnidadeProvisioningStatus');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.controllerCalls[0].name, 'getUnidadeProvisioningStatus');
});

test('GET /api/unidades/:id/provisioning/events permite admin global por global_role sem unidade ativa sem passar por requireUnitScope', async () => {
	const app = await buildApp({
		user: { role: 'user', isMaster: false, global_role: 'admin' },
		sessionUser: { role: 'user', global_role: 'admin' },
	});
	const response = await request(app).get('/api/unidades/u-123/provisioning/events');

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'getUnidadeProvisioningEvents');
	assert.equal(response.body.unitScope, null);
	assert.equal(state.requireUnitScopeCalls.length, 0);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.controllerCalls[0].name, 'getUnidadeProvisioningEvents');
});

test('GET /api/unidades/:id/provisioning mantem diretor no corredor protegido via requireUnitScope', async () => {
	const app = await buildApp({ user: { role: 'diretor', isMaster: false } });
	const response = await request(app).get('/api/unidades/u-123/provisioning');

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'getUnidadeProvisioningStatus');
	assert.deepEqual(response.body.unitScope, { type: 'unit', unidadeId: 'u-123' });
	assert.equal(state.requireUnitScopeCalls.length, 1);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.requireUnitScopeCalls[0].params.unidadeId, 'u-123');
});

test('POST /api/unidades/:id/provisioning/retry continua exigindo o corredor protegido via requireUnitScope', async () => {
	const app = await buildApp({
		user: { role: 'user', isMaster: false, global_role: 'master' },
		sessionUser: { role: 'user', global_role: 'master' },
	});
	const response = await request(app).post('/api/unidades/u-123/provisioning/retry').send({});

	assert.equal(response.status, 200);
	assert.equal(response.body.handler, 'retryUnidadeProvisioning');
	assert.deepEqual(response.body.unitScope, { type: 'unit', unidadeId: 'u-123' });
	assert.equal(state.requireUnitScopeCalls.length, 1);
	assert.equal(state.controllerCalls.length, 1);
	assert.equal(state.requireUnitScopeCalls[0].method, 'POST');
	assert.equal(state.requireUnitScopeCalls[0].params.unidadeId, 'u-123');
});