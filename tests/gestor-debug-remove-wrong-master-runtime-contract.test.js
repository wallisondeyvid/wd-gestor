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
const ENDPOINT = '/gestor/admin/remove-wrong-master';
const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-debug-session';
const WRONG_EMAIL = 'wallisondeyvdi13@gmail.com';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'debug-remove-master') {
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
  role = 'admin',
  globalRole = 'admin',
} = {}) {
  const payload = {
    email,
    senha: passwordHash,
    nome,
    cpf: buildUniqueCpf(),
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

test('POST /gestor/admin/remove-wrong-master sem sessao redireciona para /gestor/login', async () => {
  const res = await request(app)
    .post(ENDPOINT)
    .set('Connection', 'close');

  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/gestor/login');
});

test('POST /gestor/admin/remove-wrong-master bloqueia usuario autenticado sem master', async () => {
  const admin = await createUser({
    email: buildUniqueEmail('debug-admin'),
    role: 'admin',
    globalRole: 'admin',
  });
  const agent = await seedAuthenticatedAgent(admin);

  const res = await agent
    .post(ENDPOINT)
    .set('Connection', 'close');

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.message, 'Acesso negado');
});

test('POST /gestor/admin/remove-wrong-master retorna removed=false quando usuario alvo nao existe', async () => {
  const master = await createUser({
    email: buildUniqueEmail('debug-master'),
    role: 'master',
    globalRole: 'master',
  });
  const agent = await seedAuthenticatedAgent(master);

  const res = await agent
    .post(ENDPOINT)
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.data?.removed, false);
  assert.equal(res.body?.data?.message, 'Usuário incorreto não encontrado');
});

test('POST /gestor/admin/remove-wrong-master remove o usuario hardcoded quando ele existe', async () => {
  const master = await createUser({
    email: buildUniqueEmail('debug-master'),
    role: 'master',
    globalRole: 'master',
  });
  const agent = await seedAuthenticatedAgent(master);

  const wrongUser = await createUser({
    email: WRONG_EMAIL,
    role: 'admin',
    globalRole: 'admin',
    nome: 'Usuario Incorreto',
  });

  const res = await agent
    .post(ENDPOINT)
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.data?.removed, true);
  assert.equal(res.body?.data?.message, 'Usuário incorreto removido');

  const persistedWrongUser = await User.findById(wrongUser._id).lean();
  assert.equal(persistedWrongUser, null);
});