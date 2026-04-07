import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import session from 'express-session';

const ROOT = process.cwd();
const GESTOR_APP_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/app/gestor-app.js')).href;

const ROUTE_STUB_URLS = new Set([
  'src/modules/gestor/app/routes/auth.js',
  'src/modules/gestor/app/routes/usuario.js',
  'src/modules/gestor/app/routes/unidade.js',
  'src/modules/gestor/app/routes/funcionario.js',
  'src/modules/gestor/app/routes/funcao.js',
  'src/modules/gestor/app/routes/setor.js',
  'src/modules/gestor/app/routes/recurso.js',
  'src/modules/gestor/app/routes/modulo.js',
  'src/modules/gestor/app/routes/dashboard.js',
  'src/modules/gestor/app/routes/pagesRouter.js',
  'src/modules/gestor/app/routes/userApi.js',
  'src/modules/gestor/app/routes/unidadeApi.js',
  'src/modules/gestor/app/routes/funcaoApi.js',
  'src/modules/gestor/app/routes/setorApi.js',
  'src/modules/gestor/app/routes/recursoApi.js',
  'src/modules/gestor/app/routes/biometriaApi.js',
  'src/modules/gestor/app/routes/funcionarioApi.js',
  'src/modules/gestor/app/routes/cnaeApi.js',
  'src/modules/gestor/app/routes/moduloApi.js',
  'src/modules/gestor/app/routes/debugApi.js',
  'src/modules/gestor/app/routes/userAdminApi.js',
  'src/modules/gestor/app/routes/miscApi.js',
  'src/modules/gestor/app/routes/bancoApi.js',
  'src/modules/gestor/app/routes/faceBiometriaUploadApi.js',
  'src/modules/gestor/app/routes/feedbackApi.js',
  'src/modules/gestor/app/routes/widgetSettingsApi.js',
].map((file) => pathToFileURL(path.join(ROOT, file)).href));

const MODEL_STUB_URLS = new Set([
  'src/core/models/user.js',
  'src/core/models/passwordReset.js',
].map((file) => pathToFileURL(path.join(ROOT, file)).href));

const ROUTE_STUB_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-route-stub';
const MODEL_STUB_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-model-stub';
const MONGOOSE_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-mongoose';
const BCRYPT_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-bcryptjs';
const NODEMAILER_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-nodemailer';
const FEATURE_FLAGS_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-feature-flags';
const API_DB_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-api-db';
const AUTH_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-auth-db-bridge';
const AUTH_CONTEXT_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-auth-context-db-bridge';
const API_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-api-controller';
const AUTH_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-auth-controller';
const REQUIRE_LOGIN_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-require-login';
const REQUIRE_UNIT_SCOPE_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-runtime-require-unit-scope';

class SchemaMock {
  constructor(definition = {}, options = {}) {
    this.definition = definition;
    this.options = options;
  }

  index() { return this; }
  pre() { return this; }
  post() { return this; }
  add() { return this; }
  set() { return this; }
  plugin() { return this; }
  method() { return this; }
  static() { return this; }
  path() { return createDeepMock(); }
  virtual() {
    return {
      get() { return this; },
      set() { return this; },
    };
  }
}

SchemaMock.Types = new Proxy({ ObjectId: class ObjectIdSchemaTypeMock {} }, {
  get(target, prop) {
    if (!(prop in target)) target[prop] = createDeepMock();
    return target[prop];
  },
});

function createDeepMock() {
  const fn = function () {};
  return new Proxy(fn, {
    get(target, prop) {
      if (prop === 'options') return {};
      if (prop === 'validate') return () => createDeepMock();
      if (prop === 'get') return () => createDeepMock();
      if (prop === 'set') return () => createDeepMock();
      if (prop === 'valueOf') return () => target;
      if (prop === Symbol.toPrimitive) return () => '';
      return createDeepMock();
    },
    set() {
      return true;
    },
    apply() {
      return createDeepMock();
    },
  });
}

const state = {
  populateUserDoc: null,
  populateUserError: null,
  routeObservations: [],
};

const AUTH_DB_BRIDGE_EXPORTS = [
  'createPasswordReset',
  'createRememberToken',
  'deletePasswordResetById',
  'findFuncaoByIdSelect',
  'findFuncionarioByIdSelect',
  'findFuncionariosByCpfSelect',
  'findModuloByOr',
  'findModuloLeanByOrSelect',
  'findPasswordResetByToken',
  'findUnidadeByIdSelect',
  'findUserByEmail',
  'findUserByEmailForLogin',
  'findUserByIdSelect',
  'findUserByIdWithMaxTime',
  'findUsersByCpf',
  'findUsersByFuncionarioIds',
  'revokeRememberTokenByHash',
  'saveUserDocument',
];

const AUTH_CONTEXT_DB_BRIDGE_EXPORTS = [
  'loadActiveMembershipsByUserId',
  'loadUnidadeById',
];

const mongooseMock = {
  connection: { readyState: 1 },
  models: {},
  Schema: SchemaMock,
  model(name) {
    if (!this.models[name]) this.models[name] = {};
    return this.models[name];
  },
  isValidObjectId(value) {
    return /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());
  },
  Types: {
    ObjectId: class ObjectIdMock {
      constructor(value) { this.value = String(value || ''); }
      toString() { return this.value; }
    },
  },
};

const apiDbMock = {
  async findUserByEmailCondLeanMaxTimeMs() {
    if (state.populateUserError) throw state.populateUserError;
    return state.populateUserDoc;
  },
};

const authDbBridgeMock = {
  async createPasswordReset() { return null; },
  async createRememberToken() { return null; },
  async deletePasswordResetById() { return null; },
  async findFuncaoByIdSelect() { return null; },
  async findFuncionarioByIdSelect() { return null; },
  async findFuncionariosByCpfSelect() { return []; },
  async findModuloByOr() { return { _id: 'mod-gestor-1' }; },
  async findModuloLeanByOrSelect() { return null; },
  async findPasswordResetByToken() { return null; },
  async findUnidadeByIdSelect() { return null; },
  async findUserByEmail() { return null; },
  async findUserByEmailForLogin() { return null; },
  async findUserByIdSelect() { return null; },
  async findUserByIdWithMaxTime() { return null; },
  async findUsersByCpf() { return []; },
  async findUsersByFuncionarioIds() { return []; },
  async revokeRememberTokenByHash() { return null; },
  async saveUserDocument(user) { return user; },
};

const authContextBridgeMock = {
  async loadActiveMembershipsByUserId() { return []; },
  async loadUnidadeById() { return null; },
};

globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_STATE__ = state;
globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_MONGOOSE_STATE__ = mongooseMock;
globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_API_DB_MOCK__ = apiDbMock;
globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_AUTH_DB_BRIDGE_MOCK__ = authDbBridgeMock;
globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_AUTH_CONTEXT_BRIDGE_MOCK__ = authContextBridgeMock;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'mongoose') return { url: MONGOOSE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === 'bcryptjs') return { url: BCRYPT_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === 'nodemailer') return { url: NODEMAILER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#core/config/featureFlags.js') return { url: FEATURE_FLAGS_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/db/api.db.js') return { url: API_DB_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/authDbBridgeService.js') return { url: AUTH_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/authContextDbBridgeService.js') return { url: AUTH_CONTEXT_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/apiController.js') return { url: API_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/authController.js') return { url: AUTH_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/middlewares/requireLogin.js') return { url: REQUIRE_LOGIN_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/middlewares/requireUnitScope.js') return { url: REQUIRE_UNIT_SCOPE_MOCK_MODULE_URL, shortCircuit: true };

    const resolved = nextResolve(specifier, context);
    if (ROUTE_STUB_URLS.has(resolved.url)) return { url: ROUTE_STUB_MODULE_URL, shortCircuit: true };
    if (MODEL_STUB_URLS.has(resolved.url)) return { url: MODEL_STUB_MODULE_URL, shortCircuit: true };
    return resolved;
  },
  load(url, context, nextLoad) {
    if (url === ROUTE_STUB_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export default function routeStub(_req, _res, next) {',
          '  return next();',
          '}',
        ].join('\n'),
      };
    }

    if (url === MODEL_STUB_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export default {};',
      };
    }

    if (url === MONGOOSE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'const state = globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_MONGOOSE_STATE__; export default state;',
      };
    }

    if (url === BCRYPT_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export default {',
          '  async compare() { return false; },',
          '  async hash(value) { return `hashed:${value}`; },',
          '};',
        ].join('\n'),
      };
    }

    if (url === NODEMAILER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export default {',
          '  createTransport() {',
          '    return { async sendMail() { return { messageId: \"mock-mail\" }; } };',
          '  },',
          '};',
        ].join('\n'),
      };
    }

    if (url === FEATURE_FLAGS_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export function isFeatureEnabled(featureFlags, flagName, fallback = false) {',
          '  if (!featureFlags || typeof featureFlags !== \"object\") return fallback;',
          '  if (Object.prototype.hasOwnProperty.call(featureFlags, flagName)) {',
          '    return featureFlags[flagName] === true;',
          '  }',
          '  return fallback;',
          '}',
          'export function isFlagEnabled() { return false; }',
        ].join('\n'),
      };
    }

    if (url === API_DB_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_API_DB_MOCK__;',
          'export async function findUserByEmailCondLeanMaxTimeMs(...args) {',
          '  return await state.findUserByEmailCondLeanMaxTimeMs(...args);',
          '}',
        ].join('\n'),
      };
    }

    if (url === AUTH_DB_BRIDGE_MOCK_MODULE_URL) {
      const lines = ['const state = globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_AUTH_DB_BRIDGE_MOCK__;'];
      for (const exportName of AUTH_DB_BRIDGE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await state[${JSON.stringify(exportName)}](...args); }`);
      }
      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }

    if (url === AUTH_CONTEXT_DB_BRIDGE_MOCK_MODULE_URL) {
      const lines = ['const state = globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_AUTH_CONTEXT_BRIDGE_MOCK__;'];
      for (const exportName of AUTH_CONTEXT_DB_BRIDGE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await state[${JSON.stringify(exportName)}](...args); }`);
      }
      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }

    if (url === API_CONTROLLER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_API_CONTROLLER_MOCK__;',
          'export async function unidadesCluster(...args) { return await state.unidadesCluster(...args); }',
          'export async function debugSession(...args) { return await state.debugSession(...args); }',
          'export async function debugWhoami(...args) { return await state.debugWhoami(...args); }',
          'export async function ibge(...args) { return await state.ibge(...args); }',
          'export async function favicon(...args) { return await state.favicon(...args); }',
        ].join('\n'),
      };
    }

    if (url === AUTH_CONTROLLER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export async function getAuthContext(req, res) { return res.status(501).json({ ok: false }); }',
          'export async function login(req, res) { return res.redirect(303, (req.baseUrl || \"\") + \"/login?erro=usuario\"); }',
          'export async function logout(req, res) { return res.redirect((req.baseUrl || \"\") + \"/login\"); }',
          'export async function renderResetPassword(req, res) { return res.status(501).end(); }',
          'export async function postResetPassword(req, res) { return res.status(501).end(); }',
          'export async function postEsqueciSenha(req, res) { return res.status(501).end(); }',
          'export async function primeiroAcessoPost(req, res) { return res.status(501).end(); }',
          'export async function listarEmailsPorCPF(req, res) { return res.status(501).end(); }',
          'export async function selectAuthUnit(req, res) { return res.status(501).end(); }',
          'export async function switchAuthUnit(req, res) { return res.status(501).end(); }',
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
          '  return res.status(401).json({ ok: false, code: \"GESTOR_UNAUTHORIZED\" });',
          '}',
        ].join('\n'),
      };
    }

    if (url === REQUIRE_UNIT_SCOPE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export function requireUnitScope(req, res, next) {',
          '  const unidadeId = req.session?.gestorAuthContext?.active_unidade_id',
          '    || req.user?.unidade_id',
          '    || req.session?.user?.unidade_id',
          '    || null;',
          '  if (!unidadeId) {',
          '    return res.status(401).json({ ok: false, code: \"GESTOR_UNIT_SCOPE_REQUIRED\" });',
          '  }',
          '  req.unitScope = {',
          '    type: \"unit\",',
          '    unidadeId: String(unidadeId),',
          '  };',
          '  return next();',
          '}',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

const apiControllerMock = {
  async unidadesCluster(req, res) {
    const payload = {
      ok: true,
      sessionUser: req.session?.user || null,
      sessionAuthContext: req.session?.gestorAuthContext || null,
      user: req.user || null,
      unitScope: req.unitScope || null,
    };
    state.routeObservations.push(payload);
    return res.status(200).json(payload);
  },
  debugSession(req, res) {
    return res.status(200).json({ session: req.session || null });
  },
  debugWhoami(req, res) {
    return res.status(200).json({ user: req.user || null });
  },
  ibge(req, res) {
    return res.status(200).json({ ok: true });
  },
  favicon(req, res) {
    return res.status(204).end();
  },
};

globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_API_CONTROLLER_MOCK__ = apiControllerMock;

let gestorApp;

function resetState() {
  state.populateUserDoc = null;
  state.populateUserError = null;
  state.routeObservations = [];
  mongooseMock.connection.readyState = 1;
  if (gestorApp?.locals) gestorApp.locals.skipDb = false;
}

function buildHarness() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'gestor-cluster-runtime-contract',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));

  app.post('/__seed-session', (req, res) => {
    req.session.user = req.body?.user ?? undefined;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'gestorAuthContext')) {
      req.session.gestorAuthContext = req.body.gestorAuthContext;
    }
    return req.session.save(() => res.status(200).json({ ok: true }));
  });

  app.use('/gestor', gestorApp);
  return app;
}

async function startServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function createCookieJar() {
  const cookies = new Map();
  return {
    store(headers) {
      const setCookie = headers.getSetCookie ? headers.getSetCookie() : [];
      for (const entry of setCookie) {
        const [cookie] = String(entry).split(';');
        const [name, value] = cookie.split('=');
        cookies.set(name, value);
      }
    },
    header() {
      return Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
    },
  };
}

async function request(baseUrl, jar, url, options = {}) {
  const headers = new Headers(options.headers || {});
  const cookieHeader = jar.header();
  if (cookieHeader) headers.set('cookie', cookieHeader);
  const response = await fetch(`${baseUrl}${url}`, {
    redirect: 'manual',
    ...options,
    headers,
  });
  jar.store(response.headers);
  return response;
}

before(async () => {
  const { default: buildGestorApp } = await import(GESTOR_APP_URL);
  gestorApp = buildGestorApp();
  resetState();
});

beforeEach(() => {
  resetState();
});

after(() => {
  delete globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_STATE__;
  delete globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_MONGOOSE_STATE__;
  delete globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_API_DB_MOCK__;
  delete globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_AUTH_DB_BRIDGE_MOCK__;
  delete globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_AUTH_CONTEXT_BRIDGE_MOCK__;
  delete globalThis.__GESTOR_API_UNIDADES_CLUSTER_RUNTIME_API_CONTROLLER_MOCK__;
});

describe('gestor api unidades cluster runtime contract', () => {
  it('responde 401 sem sessao', async () => {
    const app = buildHarness();
    const { server, baseUrl } = await startServer(app);
    const jar = createCookieJar();

    try {
      const response = await request(baseUrl, jar, '/gestor/api/unidades/cluster');
      assert.equal(response.status, 401);
      const payload = await response.json();
      assert.equal(payload.code, 'GESTOR_UNAUTHORIZED');
      assert.equal(state.routeObservations.length, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('preserva sessao legacy e propaga req.user e req.unitScope coerentes', async () => {
    state.populateUserDoc = {
      _id: '507f1f77bcf86cd799439811',
      nome: 'Diretora Legacy',
      email: 'legacy@gestor.test',
      role: 'diretor',
      unidade_id: '507f191e810c19729de860ea',
      funcionario_id: 'func-legacy-811',
      foto: null,
    };

    const app = buildHarness();
    const { server, baseUrl } = await startServer(app);
    const jar = createCookieJar();

    try {
      await request(baseUrl, jar, '/__seed-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user: {
            id: '507f1f77bcf86cd799439811',
            email: 'legacy@gestor.test',
            nome: 'Diretora Legacy',
            role: 'diretor',
            unidade_id: '507f191e810c19729de860ea',
            unidade_principal_id: '507f191e810c19729de860eb',
            funcionario_id: 'func-legacy-811',
          },
        }),
      });

      const response = await request(baseUrl, jar, '/gestor/api/unidades/cluster');
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.sessionAuthContext, null);
      assert.equal(payload.user.email, 'legacy@gestor.test');
      assert.equal(payload.user.unidade_id, '507f191e810c19729de860ea');
      assert.equal(payload.user.funcionario_id, 'func-legacy-811');
      assert.equal(payload.unitScope.unidadeId, '507f191e810c19729de860ea');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('com auth-context-v1 persistido preserva continuidade entre sessao, req.user e req.unitScope', async () => {
    state.populateUserDoc = {
      _id: '507f1f77bcf86cd799439901',
      nome: 'Diretor Banco',
      email: 'contexto@gestor.test',
      role: 'diretor',
      unidade_id: null,
      funcionario_id: null,
      foto: null,
    };

    const app = buildHarness();
    const { server, baseUrl } = await startServer(app);
    const jar = createCookieJar();

    try {
      await request(baseUrl, jar, '/__seed-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user: {
            id: '507f1f77bcf86cd799439901',
            email: 'contexto@gestor.test',
            nome: 'Diretor Contextual',
            role: 'diretor',
            unidade_id: '507f191e810c19729de860ea',
            unidade_principal_id: '507f191e810c19729de860ea',
            funcionario_id: 'func-ctx-901',
            auth_version: 'phase3',
          },
          gestorAuthContext: {
            user_id: '507f1f77bcf86cd799439901',
            user_email: 'contexto@gestor.test',
            global_role: null,
            active_membership_id: '507f1f77bcf86cd799439902',
            active_unidade_id: '507f191e810c19729de860ea',
            active_unidade_principal_id: '507f191e810c19729de860ea',
            active_papel_contextual: 'gestor',
            active_funcionario_id: 'func-ctx-901',
            legacy_role: 'diretor',
            needs_selection: false,
          },
        }),
      });

      const response = await request(baseUrl, jar, '/gestor/api/unidades/cluster');
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.sessionUser.unidade_id, '507f191e810c19729de860ea');
      assert.equal(payload.sessionUser.funcionario_id, 'func-ctx-901');
      assert.equal(payload.sessionAuthContext.active_unidade_id, '507f191e810c19729de860ea');
      assert.equal(payload.sessionAuthContext.active_funcionario_id, 'func-ctx-901');
      assert.equal(payload.user.unidade_id, '507f191e810c19729de860ea');
      assert.equal(payload.user.funcionario_id, 'func-ctx-901');
      assert.deepEqual(payload.unitScope, {
        type: 'unit',
        unidadeId: '507f191e810c19729de860ea',
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('em erro interno de reidratacao, a borda continua apoiada na sessao e mantem unitScope', async () => {
    state.populateUserError = new Error('populate-user-boom');

    const app = buildHarness();
    const { server, baseUrl } = await startServer(app);
    const jar = createCookieJar();

    try {
      await request(baseUrl, jar, '/__seed-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user: {
            id: '507f1f77bcf86cd799439951',
            email: 'erro@gestor.test',
            nome: 'Usuario Erro',
            role: 'diretor',
            unidade_id: '507f191e810c19729de860ea',
            funcionario_id: 'func-951',
          },
        }),
      });

      const response = await request(baseUrl, jar, '/gestor/api/unidades/cluster');
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.user, null);
      assert.equal(payload.sessionUser.email, 'erro@gestor.test');
      assert.deepEqual(payload.unitScope, {
        type: 'unit',
        unidadeId: '507f191e810c19729de860ea',
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});