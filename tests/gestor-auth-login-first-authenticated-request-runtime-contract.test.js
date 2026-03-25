import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import session from 'express-session';

const ROOT = process.cwd();
const GESTOR_APP_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/app/gestor-app.js')).href;

function createEmptyRouter() {
  const router = express.Router();
  router.use((req, res, next) => next());
  return router;
}

const state = {
  bcryptCompareResult: true,
  loginUser: null,
  moduloDoc: { _id: 'mod-gestor-1' },
  plannedModuloDoc: null,
  populateUserDoc: null,
  populateUserError: null,
  activeMemberships: [],
  unidadeMap: new Map(),
  routeObservations: [],
  saveCalls: 0,
};

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
  virtual() {
    return {
      get() { return this; },
      set() { return this; },
    };
  }
}

SchemaMock.Types = {
  ObjectId: class ObjectIdSchemaTypeMock {},
};

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
      constructor(value) {
        this.value = String(value || '');
      }

      toString() {
        return this.value;
      }
    },
  },
};

const authDbBridgeMock = {
  async createPasswordReset() { return null; },
  async createRememberToken() { return null; },
  async deletePasswordResetById() { return null; },
  async findFuncaoByIdSelect() { return null; },
  async findFuncionarioByIdSelect() { return null; },
  async findFuncionariosByCpfSelect() { return []; },
  async findModuloByOr() { return state.moduloDoc; },
  async findModuloLeanByOrSelect() { return state.plannedModuloDoc; },
  async findPasswordResetByToken() { return null; },
  async findUnidadeByIdSelect({ id }) {
    return state.unidadeMap.get(String(id)) || null;
  },
  async findUserByEmail() { return null; },
  async findUserByEmailForLogin() { return state.loginUser; },
  async findUserByIdSelect() { return null; },
  async findUserByIdWithMaxTime() { return null; },
  async findUsersByCpf() { return []; },
  async findUsersByFuncionarioIds() { return []; },
  async revokeRememberTokenByHash() { return null; },
  async saveUserDocument(user) {
    state.saveCalls += 1;
    return user;
  },
};

const authContextBridgeMock = {
  async loadActiveMembershipsByUserId() {
    return state.activeMemberships;
  },
  async loadUnidadeById({ unidadeId }) {
    return state.unidadeMap.get(String(unidadeId)) || null;
  },
};

const apiDbMock = {
  async findUserByEmailCondLeanMaxTimeMs() {
    if (state.populateUserError) throw state.populateUserError;
    return state.populateUserDoc;
  },
};

const apiControllerMock = {
  async unidadesCluster(req, res) {
    const snapshot = {
      user: req.user || null,
      sessionUser: req.session?.user || null,
      sessionAuthContext: req.session?.gestorAuthContext || null,
      unitScope: req.unitScope || null,
    };
    state.routeObservations.push(snapshot);
    return res.status(200).json(snapshot);
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

function installRouteStubs() {
  const routeFiles = [
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
  ];

  for (const file of routeFiles) {
    mock.module(pathToFileURL(path.join(ROOT, file)).href, {
      defaultExport: createEmptyRouter(),
    });
  }
}

mock.module('mongoose', {
  defaultExport: mongooseMock,
});

mock.module('bcryptjs', {
  defaultExport: {
    async compare() {
      return state.bcryptCompareResult;
    },
    async hash(value) {
      return `hashed:${value}`;
    },
  },
});

mock.module('nodemailer', {
  defaultExport: {
    createTransport() {
      return {
        async sendMail() {
          return { messageId: 'mock-mail' };
        },
      };
    },
  },
});

mock.module('#core/config/featureFlags.js', {
  namedExports: {
    isFeatureEnabled(featureFlags, flagName, fallback = false) {
      if (!featureFlags || typeof featureFlags !== 'object') return fallback;
      if (Object.prototype.hasOwnProperty.call(featureFlags, flagName)) {
        return featureFlags[flagName] === true;
      }
      return fallback;
    },
    isFlagEnabled() {
      return false;
    },
  },
});

mock.module('#modules/gestor/app/services/authDbBridgeService.js', {
  namedExports: authDbBridgeMock,
});

mock.module('#modules/gestor/app/services/authContextDbBridgeService.js', {
  namedExports: authContextBridgeMock,
});

mock.module('#modules/gestor/app/db/api.db.js', {
  namedExports: apiDbMock,
});

mock.module('#modules/gestor/app/controllers/apiController.js', {
  namedExports: apiControllerMock,
});

mock.module('#modules/gestor/app/middlewares/requireLogin.js', {
  defaultExport(req, res, next) {
    if (req.user || req.session?.user) return next();
    return res.redirect((req.baseUrl || '') + '/login');
  },
});

mock.module('#modules/gestor/app/middlewares/requireUnitScope.js', {
  namedExports: {
    requireUnitScope(req, res, next) {
      const unidadeId = req.session?.gestorAuthContext?.active_unidade_id
        || req.user?.unidade_id
        || req.session?.user?.unidade_id
        || null;

      if (!unidadeId) {
        return res.redirect((req.baseUrl || '') + '/login');
      }

      req.unitScope = {
        type: 'unit',
        unidadeId: String(unidadeId),
      };
      return next();
    },
  },
});

installRouteStubs();

let gestorApp;

function resetState() {
  state.bcryptCompareResult = true;
  state.loginUser = null;
  state.moduloDoc = { _id: 'mod-gestor-1' };
  state.plannedModuloDoc = null;
  state.populateUserDoc = null;
  state.populateUserError = null;
  state.activeMemberships = [];
  state.unidadeMap = new Map();
  state.routeObservations = [];
  state.saveCalls = 0;
  mongooseMock.connection.readyState = 1;
  if (gestorApp) {
    gestorApp.locals.skipDb = false;
    gestorApp.locals.gestorAuthContextFeatureFlags = null;
    gestorApp.locals.gestorAuthContextResolverDeps = undefined;
    gestorApp.locals.gestorAuthContextMaxTimeMS = 100;
  }
}

function buildHarness() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'gestor-auth-runtime-contract',
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
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
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
  ({ default: gestorApp } = await import(GESTOR_APP_URL));
  resetState();
});

beforeEach(() => {
  resetState();
});

after(() => {
  mock.reset();
});

describe('gestor auth login first authenticated request runtime contract', () => {
  it('redireciona para login quando nao ha sessao no primeiro consumidor autenticado', async () => {
    const app = buildHarness();
    const { server, baseUrl } = await startServer(app);
    const jar = createCookieJar();

    try {
      const response = await request(baseUrl, jar, '/gestor/api/unidades/cluster');
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/gestor/login');
      assert.equal(state.routeObservations.length, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('preserva sessao legacy no primeiro consumidor autenticado', async () => {
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
      assert.equal(payload.user.email, 'legacy@gestor.test');
      assert.equal(payload.user.role, 'diretor');
      assert.equal(payload.user.unidade_id, '507f191e810c19729de860ea');
      assert.equal(payload.user.funcionario_id, 'func-legacy-811');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('mantem sessao auth-context-v1 persistida e preserva unidade_id e funcionario_id contextuais ao reidratar req.user por email', async () => {
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
      assert.deepEqual(payload.sessionAuthContext, {
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
      });
      assert.equal(payload.user.email, 'contexto@gestor.test');
      assert.equal(payload.user.role, 'diretor');
      assert.equal(payload.user.unidade_id, '507f191e810c19729de860ea');
      assert.equal(payload.user.funcionario_id, 'func-ctx-901');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('no fluxo login seguido do primeiro request autenticado, a sessao contextual permanece e req.user preserva unidade_id e funcionario_id projetados', async () => {
    gestorApp.locals.gestorAuthContextFeatureFlags = {
      gestor_auth_context_resolver: true,
    };

    state.loginUser = {
      _id: '507f1f77bcf86cd799439921',
      id: '507f1f77bcf86cd799439921',
      nome: 'Diretor Login',
      email: 'login-continuity@gestor.test',
      senha: 'hashed-secret',
      role: 'diretor',
      global_role: null,
      ativo: true,
      senha_provisoria: false,
      primeiro_acesso: false,
      failed_login_attempts: 0,
      lock_until: null,
      toObject() {
        return {
          _id: this._id,
          id: this.id,
          nome: this.nome,
          email: this.email,
          role: this.role,
          global_role: this.global_role,
          ativo: this.ativo,
          senha: this.senha,
        };
      },
    };

    state.activeMemberships = [{
      _id: '507f1f77bcf86cd799439922',
      user_id: '507f1f77bcf86cd799439921',
      unidade_id: '507f191e810c19729de860ea',
      papel_contextual: 'gestor',
      funcionario_id: 'func-922',
    }];
    state.unidadeMap.set('507f191e810c19729de860ea', {
      _id: '507f191e810c19729de860ea',
      nome: 'Base Norte',
      codigo: 'BN01',
      is_principal: true,
      unidade_principal_id: '507f191e810c19729de860ea',
      modulosAcessiveis: ['mod-gestor-1'],
    });
    state.populateUserDoc = {
      _id: '507f1f77bcf86cd799439921',
      nome: 'Diretor Login Banco',
      email: 'login-continuity@gestor.test',
      role: 'diretor',
      unidade_id: null,
      funcionario_id: null,
      foto: null,
    };

    const app = buildHarness();
    const { server, baseUrl } = await startServer(app);
    const jar = createCookieJar();

    try {
      const loginResponse = await request(baseUrl, jar, '/gestor/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'email=login-continuity%40gestor.test&senha=secret&modulo=gestor',
      });
      assert.equal(loginResponse.status, 303);
      assert.equal(loginResponse.headers.get('location'), '/gestor/dashboard');

      const response = await request(baseUrl, jar, '/gestor/api/unidades/cluster');
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.sessionUser.role, 'diretor');
      assert.equal(payload.sessionUser.unidade_id, '507f191e810c19729de860ea');
      assert.equal(payload.sessionUser.funcionario_id, 'func-922');
      assert.equal(payload.sessionAuthContext.active_unidade_id, '507f191e810c19729de860ea');
      assert.equal(payload.user.email, 'login-continuity@gestor.test');
      assert.equal(payload.user.role, 'diretor');
      assert.equal(payload.user.unidade_id, '507f191e810c19729de860ea');
      assert.equal(payload.user.funcionario_id, 'func-922');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('quando a reidratacao por email falha com erro interno, o middleware absorve a excecao e o primeiro consumidor segue apoiado na sessao', async () => {
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
      assert.equal(payload.sessionUser.unidade_id, '507f191e810c19729de860ea');
      assert.deepEqual(payload.unitScope, {
        type: 'unit',
        unidadeId: '507f191e810c19729de860ea',
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});