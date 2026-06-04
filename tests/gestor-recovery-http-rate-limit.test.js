import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import request from 'supertest';
import mongoose from 'mongoose';

import { connectMongo, disconnectMongo } from '../src/core/db/connect.js';
import {
  resetGestorLoginHttpLimiterNamespace,
  resetGestorRecoveryHttpLimiterNamespace,
} from '../src/modules/gestor/app/middlewares/rateLimit.js';

const AUTH_ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/auth.js');
const AUTH_CONTROLLER_MOCK_URL = 'mock:gestor-recovery-http-rate-limit-controller';
const GENERIC_MESSAGE = 'Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.';

let authRouterPromise;
let collectionSequence = 0;

process.env.MONGO_MEMORY = '1';
process.env.RECOVERY_RATE_LIMIT_WINDOW_MS = '600000';
process.env.RECOVERY_RATE_LIMIT_MAX = '2';
process.env.RECOVERY_CPF_RATE_LIMIT_MAX = '2';
process.env.RESET_PASSWORD_RATE_LIMIT_MAX = '2';

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
          'const getState = () => globalThis.__GESTOR_RECOVERY_HTTP_RATE_LIMIT_STATE__ || { recoveryCalls: [], emailCalls: [], resetCalls: [] };',
          'function wantsJson(req) {',
          '  if (req.xhr) return true;',
          '  if (req.is?.("application/json")) return true;',
          '  const requestedWith = String(req.get?.("x-requested-with") || "").toLowerCase();',
          '  if (requestedWith === "xmlhttprequest") return true;',
          '  const accept = String(req.get?.("accept") || "").toLowerCase();',
          '  return accept.includes("application/json") && !accept.includes("text/html");',
          '}',
          'export async function postEsqueciSenha(req, res) {',
          '  const state = getState();',
          '  state.recoveryCalls.push({ ip: req.ip, hasCpf: Boolean(req.body?.cpf) });',
          '  if (wantsJson(req)) {',
          '    return res.status(200).json({ success: true, message: "Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação." });',
          '  }',
          '  return res.redirect(303, `${req.baseUrl || ""}/esquecisenha?status=recebida`);',
          '}',
          'export async function listarEmailsPorCPF(req, res) {',
          '  const state = getState();',
          '  state.emailCalls.push({ ip: req.ip, hasCpf: Boolean(req.query?.cpf) });',
          '  return res.status(200).json({ success: true, message: "Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação." });',
          '}',
          'export async function postResetPassword(req, res) {',
          '  const state = getState();',
          '  state.resetCalls.push({ ip: req.ip, hasToken: Boolean(req.body?.token) });',
          '  return res.render("reset-password-success", { title: "Senha Redefinida", message: "Sua senha foi redefinida com sucesso." });',
          '}',
          'export async function login(_req, res) { return res.status(200).end(); }',
          'export async function getAuthContext(_req, res) { return res.status(200).json({ ok: true }); }',
          'export async function logout(_req, res) { return res.status(204).end(); }',
          'export async function renderResetPassword(_req, res) { return res.status(200).end(); }',
          'export async function primeiroAcessoPost(_req, res) { return res.status(200).end(); }',
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
    authRouterPromise = importFresh(AUTH_ROUTE_PATH, 'gestor-recovery-http-rate-limit')
      .then((module) => module.default);
  }

  return authRouterPromise;
}

function configureViews(app) {
  const viewsRoot = path.join(process.cwd(), 'views');
  app.set('views', [
    viewsRoot,
    path.join(viewsRoot, 'gestor'),
    path.join(viewsRoot, 'escalas'),
    path.join(viewsRoot, 'portal-morador'),
  ]);
  app.set('view engine', 'ejs');
}

async function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  configureViews(app);

  collectionSequence += 1;
  app.locals.gestorLoginHttpLimiterCollectionName = `loginratelimits_test_${collectionSequence}`;
  app.locals.gestorRecoveryHttpLimiterCollectionName = `recoveryratelimits_test_${collectionSequence}`;
  resetGestorLoginHttpLimiterNamespace(app);
  resetGestorRecoveryHttpLimiterNamespace(app);
  app.use('/gestor', await loadAuthRouter());
  return app;
}

before(async () => {
  await connectMongo();
  await loadAuthRouter();
});

beforeEach(async () => {
  globalThis.__GESTOR_RECOVERY_HTTP_RATE_LIMIT_STATE__ = { recoveryCalls: [], emailCalls: [], resetCalls: [] };
  const collections = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(
    collections.map(({ name }) => mongoose.connection.db.collection(name).deleteMany({}))
  );
});

test('POST /gestor/esquecisenha bloqueia HTML após limite por IP sem JSON cru e persiste contagem no Mongo', async () => {
  const app = await createApp();

  const first = await request(app)
    .post('/gestor/esquecisenha')
    .set('Accept', 'text/html')
    .set('X-Forwarded-For', '198.51.100.20')
    .type('form')
    .send({ cpf: '123.456.789-00' });

  const second = await request(app)
    .post('/gestor/esquecisenha')
    .set('Accept', 'text/html')
    .set('X-Forwarded-For', '198.51.100.20')
    .type('form')
    .send({ cpf: '123.456.789-00' });

  const blocked = await request(app)
    .post('/gestor/esquecisenha')
    .set('Accept', 'text/html')
    .set('X-Forwarded-For', '198.51.100.20')
    .type('form')
    .send({ cpf: '123.456.789-00' });

  assert.equal(first.status, 303);
  assert.equal(first.headers.location, '/gestor/esquecisenha?status=recebida');
  assert.equal(second.status, 303);
  assert.equal(second.headers.location, '/gestor/esquecisenha?status=recebida');
  assert.equal(blocked.status, 429);
  assert.match(blocked.headers['content-type'] || '', /text\/html/);
  assert.match(blocked.text, /Muitas solicitações em pouco tempo/);
  assert.doesNotMatch(blocked.text, /application\/json|debugLink|123\.456\.789-00|12345678900/);
  assert.equal(globalThis.__GESTOR_RECOVERY_HTTP_RATE_LIMIT_STATE__.recoveryCalls.length, 2);

  const savedState = await mongoose.connection.db
    .collection(app.locals.gestorRecoveryHttpLimiterCollectionName)
    .findOne(
      { key: new RegExp(`^${app.locals.gestorRecoveryHttpLimiterNamespace}:request-ip:`) },
      { projection: { _id: 0, key: 1, count: 1, windowStart: 1, expiresAt: 1, createdAt: 1, updatedAt: 1 } }
    );

  assert.equal(typeof savedState?.key, 'string');
  assert.equal(savedState.key.includes('198.51.100.20'), false);
  assert.equal(savedState.key.includes('12345678900'), false);
  assert.equal(savedState.count, 3);
  assert.ok(savedState.windowStart instanceof Date);
  assert.ok(savedState.expiresAt instanceof Date);
  assert.ok(savedState.createdAt instanceof Date);
  assert.ok(savedState.updatedAt instanceof Date);
});

test('POST /gestor/esqueci-senha retorna 429 JSON genérico quando CPF excede o limite mesmo com IP variando', async () => {
  const app = await createApp();

  const first = await request(app)
    .post('/gestor/esqueci-senha')
    .set('Accept', 'application/json')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('X-Forwarded-For', '198.51.100.21')
    .send({ cpf: '123.456.789-00' });

  const second = await request(app)
    .post('/gestor/esqueci-senha')
    .set('Accept', 'application/json')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('X-Forwarded-For', '198.51.100.22')
    .send({ cpf: '123.456.789-00' });

  const blocked = await request(app)
    .post('/gestor/esqueci-senha')
    .set('Accept', 'application/json')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('X-Forwarded-For', '198.51.100.23')
    .send({ cpf: '123.456.789-00' });

  assert.equal(first.status, 200);
  assert.deepEqual(first.body, {
    success: true,
    message: 'Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação.',
  });
  assert.equal(second.status, 200);
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.body, { success: false, message: GENERIC_MESSAGE });
  assert.equal(globalThis.__GESTOR_RECOVERY_HTTP_RATE_LIMIT_STATE__.recoveryCalls.length, 2);

  const cpfState = await mongoose.connection.db
    .collection(app.locals.gestorRecoveryHttpLimiterCollectionName)
    .findOne(
      { key: new RegExp(`^${app.locals.gestorRecoveryHttpLimiterNamespace}:request-cpf:`) },
      { projection: { _id: 0, key: 1, count: 1 } }
    );

  assert.equal(typeof cpfState?.key, 'string');
  assert.equal(cpfState.key.includes('12345678900'), false);
  assert.equal(cpfState.count, 3);
  assert.equal(Object.prototype.hasOwnProperty.call(blocked.body, 'emails'), false);
  assert.doesNotMatch(JSON.stringify(blocked.body), /debugLink|12345678900/);
});

test('GET /gestor/api/recover/emails é protegido e devolve 429 genérico sem lista de emails', async () => {
  const app = await createApp();

  const first = await request(app)
    .get('/gestor/api/recover/emails?cpf=123.456.789-00')
    .set('Accept', 'application/json')
    .set('X-Forwarded-For', '198.51.100.24');

  const second = await request(app)
    .get('/gestor/api/recover/emails?cpf=123.456.789-00')
    .set('Accept', 'application/json')
    .set('X-Forwarded-For', '198.51.100.24');

  const blocked = await request(app)
    .get('/gestor/api/recover/emails?cpf=123.456.789-00')
    .set('Accept', 'application/json')
    .set('X-Forwarded-For', '198.51.100.24');

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.body, { success: false, message: GENERIC_MESSAGE });
  assert.equal(globalThis.__GESTOR_RECOVERY_HTTP_RATE_LIMIT_STATE__.emailCalls.length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(blocked.body, 'emails'), false);
  assert.doesNotMatch(JSON.stringify(blocked.body), /debugLink|12345678900/);
});

test('POST /gestor/reset-password bloqueia HTML após limite por IP e não chama controller bloqueado', async () => {
  const app = await createApp();

  const first = await request(app)
    .post('/gestor/reset-password')
    .set('Accept', 'text/html')
    .set('X-Forwarded-For', '198.51.100.25')
    .type('form')
    .send({ token: 'token-a', senha: 'NovaSenha@123' });

  const second = await request(app)
    .post('/gestor/reset-password')
    .set('Accept', 'text/html')
    .set('X-Forwarded-For', '198.51.100.25')
    .type('form')
    .send({ token: 'token-b', senha: 'NovaSenha@123' });

  const blocked = await request(app)
    .post('/gestor/reset-password')
    .set('Accept', 'text/html')
    .set('X-Forwarded-For', '198.51.100.25')
    .type('form')
    .send({ token: 'token-c', senha: 'NovaSenha@123' });

  assert.equal(first.status, 200);
  assert.match(first.text, /Sua senha foi redefinida com sucesso/);
  assert.equal(second.status, 200);
  assert.equal(blocked.status, 429);
  assert.match(blocked.text, /Muitas solicitações em pouco tempo/);
  assert.doesNotMatch(blocked.text, /token-a|token-b|token-c|application\/json/);
  assert.equal(globalThis.__GESTOR_RECOVERY_HTTP_RATE_LIMIT_STATE__.resetCalls.length, 2);
});

test('limiters de recovery isolam estado entre harnesses por coleção e namespace distintos', async () => {
  const appA = await createApp();
  const appB = await createApp();

  const firstFromAppA = await request(appA)
    .post('/gestor/esquecisenha')
    .set('Accept', 'application/json')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('X-Forwarded-For', '198.51.100.26')
    .send({ cpf: '123.456.789-00' });

  const secondFromAppA = await request(appA)
    .post('/gestor/esquecisenha')
    .set('Accept', 'application/json')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('X-Forwarded-For', '198.51.100.26')
    .send({ cpf: '123.456.789-00' });

  const firstFromAppB = await request(appB)
    .post('/gestor/esquecisenha')
    .set('Accept', 'application/json')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('X-Forwarded-For', '198.51.100.26')
    .send({ cpf: '123.456.789-00' });

  assert.equal(firstFromAppA.status, 200);
  assert.equal(secondFromAppA.status, 200);
  assert.equal(firstFromAppB.status, 200);
  assert.notEqual(appA.locals.gestorRecoveryHttpLimiterCollectionName, appB.locals.gestorRecoveryHttpLimiterCollectionName);
  assert.notEqual(appA.locals.gestorRecoveryHttpLimiterNamespace, appB.locals.gestorRecoveryHttpLimiterNamespace);
});

test.after(async () => {
  await disconnectMongo({ stopMemoryServer: true });
});