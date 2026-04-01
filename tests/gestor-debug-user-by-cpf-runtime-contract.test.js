import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import User from '../src/core/models/user.js';

process.env.NODE_ENV = 'test';
process.env.MONGO_MEMORY = '1';

const PASSWORD = 'Senha@123456';
const ENDPOINT_BASE = '/gestor/debug/user-by-cpf';
const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-debug-user-by-cpf-session';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'debug-user-by-cpf') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

function installSessionSeedRoute(targetApp) {
  targetApp.get(TEST_SESSION_SEED_ENDPOINT, async (req, res) => {
    try {
      const email = String(req.query?.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ success: false, error: 'EMAIL_REQUIRED' });
      }

      const user = await User.findOne({ email }).lean();
      if (!user) {
        return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
      }

      req.session.user = {
        id: String(user._id),
        _id: String(user._id),
        email: user.email,
        role: user.role || 'user',
        nome: user.nome || 'Debug Contract User',
        isMaster: user.isMaster === true || user.role === 'master' || user.global_role === 'master',
      };

      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ success: false, error: 'SESSION_SEED_FAILED' });
        }
        return res.status(204).end();
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: String(err?.message || err) });
    }
  });
}

async function createUser({
  email = buildUniqueEmail(),
  nome = 'Debug Contract User',
  cpf = buildUniqueCpf(),
  role = 'admin',
  globalRole = 'admin',
} = {}) {
  const payload = {
    email,
    senha: passwordHash,
    nome,
    cpf,
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  };

  if (globalRole) payload.global_role = globalRole;

  return User.create(payload);
}

async function seedAuthenticatedAgent(user) {
  const agent = request.agent(app);
  const seed = await agent
    .get(TEST_SESSION_SEED_ENDPOINT)
    .query({ email: user.email })
    .set('Connection', 'close');

  assert.equal(seed.status, 204, `Falha ao seedar sessao para ${user.email}`);
  return agent;
}

before(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));

  const built = await createServer({ skipDb: false, deferErrorHandlers: true });
  app = built.app;
  closeServer = built.close;
  installSessionSeedRoute(app);
  if (typeof built.registerErrorHandlers === 'function') {
    await Promise.resolve(built.registerErrorHandlers());
  }
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

after(async () => {
  try {
    if (typeof closeServer === 'function') {
      await closeServer({ stopMemoryServer: true });
      return;
    }
    await disconnectMongo({ stopMemoryServer: true });
  } catch {}
});

test('GET /gestor/debug/user-by-cpf/:cpf sem sessao cai no fluxo real de login', async () => {
  const res = await request(app)
    .get(`${ENDPOINT_BASE}/12345678901`)
    .redirects(0)
    .set('Connection', 'close');

  if (res.status === 302) {
    assert.equal(res.headers.location, '/gestor/login');
    return;
  }

  assert.equal(res.status, 200);
  assert.match(String(res.text || ''), /login/i);
});

test('GET /gestor/debug/user-by-cpf sem parametro nao atinge o owner e permanece 404 na rota real', async () => {
  const user = await createUser({
    email: buildUniqueEmail('debug-route-miss'),
    role: 'admin',
    globalRole: 'admin',
  });
  const agent = await seedAuthenticatedAgent(user);

  const res = await agent
    .get(`${ENDPOINT_BASE}/`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 404);
});

test('GET /gestor/debug/user-by-cpf/:cpf retorna 404 quando lookup nao encontra usuario', async () => {
  const user = await createUser({
    email: buildUniqueEmail('debug-auth'),
    role: 'admin',
    globalRole: 'admin',
  });
  const agent = await seedAuthenticatedAgent(user);

  const res = await agent
    .get(`${ENDPOINT_BASE}/99999999999`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Usuário não encontrado',
  });
});

test('GET /gestor/debug/user-by-cpf/:cpf retorna 200 no caminho feliz com normalizacao efetiva e payload projetado', async () => {
  const authUser = await createUser({
    email: buildUniqueEmail('debug-auth'),
    role: 'admin',
    globalRole: 'admin',
  });
  const targetUser = await createUser({
    email: buildUniqueEmail('debug-target'),
    nome: 'Runtime Target User',
    cpf: '12345678901',
    role: 'user',
    globalRole: null,
  });
  const agent = await seedAuthenticatedAgent(authUser);

  const res = await agent
    .get(`${ENDPOINT_BASE}/123.456.789-01`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(String(res.body?.data?._id), String(targetUser._id));
  assert.equal(res.body?.data?.email, targetUser.email);
  assert.equal(res.body?.data?.role, 'user');
  assert.equal(res.body?.data?.ativo, true);
  assert.equal(res.body?.data?.unidade_id ?? null, null);
  assert.equal('cpf' in (res.body?.data || {}), false);
  assert.equal('senha' in (res.body?.data || {}), false);
  assert.equal('nome' in (res.body?.data || {}), false);
});

test('GET /gestor/debug/user-by-cpf/:cpf retorna 500 quando o lookup interno falha', async () => {
  const authUser = await createUser({
    email: buildUniqueEmail('debug-auth'),
    role: 'admin',
    globalRole: 'admin',
  });
  const agent = await seedAuthenticatedAgent(authUser);

  const originalFindOne = User.findOne;

  try {
    User.findOne = (cond, ...args) => {
      if (String(cond?.cpf || '').trim() === '11122233344') {
        throw new Error('FORCED_DEBUG_USER_BY_CPF_FAILURE');
      }
      return originalFindOne.call(User, cond, ...args);
    };

    const res = await agent
      .get(`${ENDPOINT_BASE}/111.222.333-44`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, {
      success: false,
      code: 'SERVER_ERROR',
      message: 'FORCED_DEBUG_USER_BY_CPF_FAILURE',
    });
  } finally {
    User.findOne = originalFindOne;
  }
});