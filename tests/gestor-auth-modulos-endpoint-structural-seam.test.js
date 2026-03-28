import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROUTER_PATH = path.join(process.cwd(), 'src/shared/routes/userApi.js');
const ROUTER_SOURCE = fs.readFileSync(ROUTER_PATH, 'utf8');

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros para: ${signature}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco para: ${signature}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1).replace(/^export\s+/, '');
      }
    }
  }

  throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunction(source, signature);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function createRouterHarness(overrides = {}) {
  const registered = {
    gets: [],
    posts: [],
    puts: [],
    uses: [],
  };

  const router = {
    get(routePath, ...handlers) {
      registered.gets.push({ routePath, handlers });
      return this;
    },
    post(routePath, ...handlers) {
      registered.posts.push({ routePath, handlers });
      return this;
    },
    put(routePath, ...handlers) {
      registered.puts.push({ routePath, handlers });
      return this;
    },
    use(routePath, ...handlers) {
      registered.uses.push({ routePath, handlers });
      return this;
    },
  };

  const express = {
    Router() {
      return router;
    },
  };

  const multer = Object.assign(
    () => ({
      single() {
        return function uploadMiddleware(_req, _res, next) {
          if (typeof next === 'function') next();
        };
      },
    }),
    {
      memoryStorage() {
        return {};
      },
    }
  );

  const createUserApiRouter = buildFunction(
    ROUTER_SOURCE,
    'export function createUserApiRouter',
    {
      express,
      multer,
      isAuthContextResolverEnabledForRequest: overrides.isAuthContextResolverEnabledForRequest || (() => false),
      resolveUserApiModulosCanonicalResult: overrides.resolveUserApiModulosCanonicalResult || (async () => ({ kind: 'not-applicable' })),
      buildPendingSelectionRequiredPayload: overrides.buildPendingSelectionRequiredPayload || (() => ({
        success: false,
        authenticated: true,
        error: 'Selecao de unidade pendente',
        code: 'GESTOR_SELECTION_REQUIRED',
        needsUnitSelection: true,
        redirect: '/gestor/login?step=select',
      })),
      User: {},
      console: overrides.console || console,
    }
  );

  const requireLogin = function requireLoginStub(req, res, next) {
    return next?.();
  };
  const requireApiAuth = function requireApiAuthStub(req, res, next) {
    return next?.();
  };
  const requireRole = function requireRoleStub() {
    return function requireRoleMiddleware(req, res, next) {
      return next?.();
    };
  };

  createUserApiRouter({
    criarUsuario() {},
    obterUsuarioAtual() {},
    atualizarSenhaUsuario() {},
    atualizarUsuario() {},
    toggleUsuario() {},
    deleteUsuario() {},
    updateUsuarioJson() {},
    requireRole,
    requireApiAuth,
    requireLogin,
  });

  const modulosRoute = registered.gets.find((entry) => entry.routePath === '/api/modulos');
  assert.ok(modulosRoute, 'Nao registrou GET /api/modulos');
  assert.equal(modulosRoute.handlers.length, 2, 'GET /api/modulos deve manter requireLogin + owner');
  assert.equal(modulosRoute.handlers[0], requireLogin, 'GET /api/modulos deve manter requireLogin na rota');

  return {
    requireLogin,
    owner: modulosRoute.handlers[1],
  };
}

function createResponseRecorder() {
  return {
    statusCode: 200,
    jsonPayload: undefined,
    redirectTarget: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
    redirect(target) {
      this.redirectTarget = target;
      return this;
    },
  };
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('owner de GET /gestor/api/modulos preserva 409 quando o contexto canonico exige selecao', async () => {
  const serviceCalls = [];
  const { owner } = createRouterHarness({
    isAuthContextResolverEnabledForRequest: () => true,
    resolveUserApiModulosCanonicalResult: async (input) => {
      serviceCalls.push(JSON.parse(JSON.stringify(input || null)));
      return { kind: 'selection-required' };
    },
  });

  const req = {
    user: { id: 'u-1', role: 'user', email: 'gestor@example.com' },
    session: {
      user: { id: 'u-1', role: 'user', email: 'gestor@example.com' },
      gestorAuthContext: { active_unidade_id: null },
    },
    query: {},
    app: { locals: { gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true } } },
  };
  const res = createResponseRecorder();

  await owner(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].authenticatedUser.role, 'user');
  assert.equal(serviceCalls[0].sessionUser.role, 'user');
  assert.equal(res.statusCode, 409);
  assert.deepEqual(toPlainJson(res.jsonPayload), {
    success: false,
    authenticated: true,
    error: 'Selecao de unidade pendente',
    code: 'GESTOR_SELECTION_REQUIRED',
    needsUnitSelection: true,
    redirect: '/gestor/login?step=select',
  });
});

test('owner de GET /gestor/api/modulos preserva a resposta JSON final do branch canonico', async () => {
  const serviceCalls = [];
  const { owner } = createRouterHarness({
    isAuthContextResolverEnabledForRequest: () => true,
    resolveUserApiModulosCanonicalResult: async (input) => {
      serviceCalls.push(JSON.parse(JSON.stringify(input || null)));
      return { kind: 'resolved', payload: { data: [] } };
    },
  });

  const req = {
    user: { id: 'u-1', role: 'visitante', email: 'gestor@example.com' },
    session: {
      user: { id: 'u-1', role: 'visitante', email: 'gestor@example.com' },
      gestorAuthContext: { active_unidade_id: null },
    },
    query: {},
    app: { locals: { gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true } } },
  };
  const res = createResponseRecorder();

  await owner(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.jsonPayload), { data: [] });
  assert.equal(res.redirectTarget, undefined);
});

test('owner de GET /gestor/api/modulos preserva o fallback legado quando o branch canonico nao se aplica', async () => {
  const serviceCalls = [];
  const { owner } = createRouterHarness({
    isAuthContextResolverEnabledForRequest: () => true,
    resolveUserApiModulosCanonicalResult: async (input) => {
      serviceCalls.push(JSON.parse(JSON.stringify(input || null)));
      return { kind: 'not-applicable' };
    },
  });

  const req = {
    user: { id: 'u-1', role: 'visitante', email: 'gestor@example.com' },
    session: {
      user: { id: 'u-1', role: 'visitante', email: 'gestor@example.com' },
      gestorAuthContext: null,
    },
    query: {},
    app: { locals: { gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true } } },
  };
  const res = createResponseRecorder();

  await owner(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.jsonPayload), {
    data: [{ nome: 'Gestor', status: 'ativo' }],
  });
});