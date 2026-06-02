import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import request from 'supertest';

const AUTH_ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/auth.js');
const AUTH_CONTROLLER_MOCK_URL = 'mock:gestor-auth-login-http-rate-limit-controller';

let authRouterPromise;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/controllers/authController.js') {
      return { url: AUTH_CONTROLLER_MOCK_URL, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === AUTH_CONTROLLER_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const getState = () => globalThis.__GESTOR_LOGIN_HTTP_RATE_LIMIT_STATE__ || { calls: [] };',
          'export async function login(req, res) {',
          '  const state = getState();',
          '  state.calls.push({ ip: req.ip, contentType: req.get("content-type") || "" });',
          '  const mode = state.mode || "success";',
          '  if (req.is?.("application/json")) {',
          '    if (mode === "json-failure") return res.status(401).json({ success: false, error: "INVALID_CREDENTIALS" });',
          '    return res.status(200).json({ success: true, ok: true });',
          '  }',
          '  if (mode === "html-failure") return res.redirect(303, `${req.baseUrl || ""}/login?erro=credenciais`);',
          '  return res.redirect(303, `${req.baseUrl || ""}/dashboard`);',
          '}',
          'export async function getAuthContext(_req, res) { return res.status(200).json({ ok: true }); }',
          'export async function logout(_req, res) { return res.status(204).end(); }',
          'export async function renderResetPassword(_req, res) { return res.status(200).end(); }',
          'export async function postResetPassword(_req, res) { return res.status(200).end(); }',
          'export async function postEsqueciSenha(_req, res) { return res.status(200).end(); }',
          'export async function primeiroAcessoPost(_req, res) { return res.status(200).end(); }',
          'export async function listarEmailsPorCPF(_req, res) { return res.status(200).json({ emails: [] }); }',
          'export async function selectAuthUnit(_req, res) { return res.status(200).json({ ok: true }); }',
          'export async function switchAuthUnit(_req, res) { return res.status(200).json({ ok: true }); }',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function importFresh(filePath, token) {
  return import(`${pathToFileURL(filePath).href}?case=${token}`);
}

async function loadAuthRouter() {
  if (!authRouterPromise) {
    process.env.LOGIN_HTTP_RATE_LIMIT_WINDOW_MS = '600000';
    process.env.LOGIN_HTTP_RATE_LIMIT_MAX = '2';
    authRouterPromise = importFresh(AUTH_ROUTE_PATH, 'gestor-login-http-rate-limit')
      .then((module) => module.default);
  }

  return authRouterPromise;
}

async function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use('/gestor', await loadAuthRouter());
  return app;
}

before(async () => {
  await loadAuthRouter();
});

beforeEach(() => {
  globalThis.__GESTOR_LOGIN_HTTP_RATE_LIMIT_STATE__ = { calls: [], mode: 'success' };
});

test('POST /gestor/login bloqueia HTML após o limite e não chama o controller bloqueado', async () => {
  const app = await createApp();
  globalThis.__GESTOR_LOGIN_HTTP_RATE_LIMIT_STATE__.mode = 'html-failure';

  const first = await request(app)
    .post('/gestor/login')
    .set('Accept', 'text/html')
    .set('X-Forwarded-For', '198.51.100.10')
    .type('form')
    .send({ email: 'primeiro@exemplo.test', senha: 'Senha@123', modulo: 'gestor' });

  const second = await request(app)
    .post('/gestor/login')
    .set('Accept', 'text/html')
    .set('X-Forwarded-For', '198.51.100.10')
    .type('form')
    .send({ email: 'segundo@exemplo.test', senha: 'Senha@123', modulo: 'gestor' });

  const blocked = await request(app)
    .post('/gestor/login')
    .set('Accept', 'text/html')
    .set('X-Forwarded-For', '198.51.100.10')
    .type('form')
    .send({ email: 'terceiro@exemplo.test', senha: 'Senha@123', modulo: 'gestor' });

  assert.equal(first.status, 303);
  assert.equal(first.headers.location, '/gestor/login?erro=credenciais');
  assert.equal(second.status, 303);
  assert.equal(second.headers.location, '/gestor/login?erro=credenciais');
  assert.equal(blocked.status, 303);
  assert.equal(blocked.headers.location, '/gestor/login?erro=muitas_tentativas');
  assert.equal(globalThis.__GESTOR_LOGIN_HTTP_RATE_LIMIT_STATE__.calls.length, 2);
});

test('POST /gestor/login retorna 429 JSON genérico após o limite e preserva chamadas anteriores', async () => {
  const app = await createApp();
  globalThis.__GESTOR_LOGIN_HTTP_RATE_LIMIT_STATE__.mode = 'json-failure';

  const first = await request(app)
    .post('/gestor/login')
    .set('Accept', 'application/json')
    .set('X-Forwarded-For', '198.51.100.11')
    .send({ email: 'json1@exemplo.test', senha: 'Senha@123', modulo: 'gestor' });

  const second = await request(app)
    .post('/gestor/login')
    .set('Accept', 'application/json')
    .set('X-Forwarded-For', '198.51.100.11')
    .send({ email: 'json2@exemplo.test', senha: 'Senha@123', modulo: 'gestor' });

  const blocked = await request(app)
    .post('/gestor/login')
    .set('Accept', 'application/json')
    .set('X-Forwarded-For', '198.51.100.11')
    .send({ email: 'json3@exemplo.test', senha: 'Senha@123', modulo: 'gestor' });

  assert.equal(first.status, 401);
  assert.deepEqual(first.body, { success: false, error: 'INVALID_CREDENTIALS' });
  assert.equal(second.status, 401);
  assert.deepEqual(second.body, { success: false, error: 'INVALID_CREDENTIALS' });
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.body, { success: false, error: 'TOO_MANY_LOGIN_ATTEMPTS' });
  assert.equal(globalThis.__GESTOR_LOGIN_HTTP_RATE_LIMIT_STATE__.calls.length, 2);
});

test('POST /gestor/login não bloqueia logins bem-sucedidos mesmo acima do volume de falhas permitido', async () => {
  const app = await createApp();

  const responses = await Promise.all([
    request(app)
      .post('/gestor/login')
      .set('Accept', 'text/html')
      .set('X-Forwarded-For', '198.51.100.12')
      .type('form')
      .send({ email: 'ok1@exemplo.test', senha: 'Senha@123', modulo: 'gestor' }),
    request(app)
      .post('/gestor/login')
      .set('Accept', 'text/html')
      .set('X-Forwarded-For', '198.51.100.12')
      .type('form')
      .send({ email: 'ok2@exemplo.test', senha: 'Senha@123', modulo: 'gestor' }),
    request(app)
      .post('/gestor/login')
      .set('Accept', 'text/html')
      .set('X-Forwarded-For', '198.51.100.12')
      .type('form')
      .send({ email: 'ok3@exemplo.test', senha: 'Senha@123', modulo: 'gestor' }),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 303);
    assert.equal(response.headers.location, '/gestor/dashboard');
  }

  assert.equal(globalThis.__GESTOR_LOGIN_HTTP_RATE_LIMIT_STATE__.calls.length, 3);
});