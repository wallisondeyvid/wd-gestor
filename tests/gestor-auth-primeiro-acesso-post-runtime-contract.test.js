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
const ENDPOINT = '/gestor/primeiroacesso';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'primeiro-acesso') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

async function createUser({
  email = buildUniqueEmail('primeiro-acesso-user'),
  nome = 'Primeiro Acesso User',
  role = 'admin',
  globalRole = 'admin',
  primeiroAcesso = true,
  senhaProvisoria = true,
} = {}) {
  const payload = {
    email,
    senha: passwordHash,
    nome,
    cpf: buildUniqueCpf(),
    role,
    ativo: true,
    primeiro_acesso: primeiroAcesso,
    senha_provisoria: senhaProvisoria,
  };

  if (globalRole) payload.global_role = globalRole;

  return User.create(payload);
}

async function login(agent, { email, senha = PASSWORD } = {}) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

async function createPrimeiroAcessoAgent(userOptions = {}) {
  const user = await createUser(userOptions);
  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });

  assert.equal(loginRes.status, 303);
  const expectedLocation = user.primeiro_acesso || user.senha_provisoria
    ? '/gestor/primeiroacesso'
    : '/gestor/dashboard';
  assert.equal(loginRes.headers.location, expectedLocation);

  return { agent, user };
}

before(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));

  const built = await createServer({ skipDb: false, deferErrorHandlers: true });
  app = built.app;
  closeServer = built.close;
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

test('POST /gestor/primeiroacesso sem sessao redireciona para /gestor/login', async () => {
  const res = await request(app)
    .post(ENDPOINT)
    .type('form')
    .send({ senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' });

  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/gestor/login');
});

test('POST /gestor/primeiroacesso com campos ausentes redireciona com erro=campos', async () => {
  const { agent, user } = await createPrimeiroAcessoAgent();

  const res = await agent
    .post(ENDPOINT)
    .set('Referer', 'http://127.0.0.1/gestor/primeiroacesso')
    .type('form')
    .send({ senha: 'NovaSenha@123' });

  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/gestor/primeiroacesso?erro=campos');

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(PASSWORD, persistedUser.senha), true);
  assert.equal(persistedUser.primeiro_acesso, true);
  assert.equal(persistedUser.senha_provisoria, true);
});

test('POST /gestor/primeiroacesso com confirmacao divergente redireciona com erro=confirmacao', async () => {
  const { agent, user } = await createPrimeiroAcessoAgent();

  const res = await agent
    .post(ENDPOINT)
    .set('Referer', 'http://127.0.0.1/gestor/primeiroacesso')
    .type('form')
    .send({ senha: 'NovaSenha@123', confirmar_senha: 'OutraSenha@123' });

  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/gestor/primeiroacesso?erro=confirmacao');

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(PASSWORD, persistedUser.senha), true);
  assert.equal(persistedUser.primeiro_acesso, true);
  assert.equal(persistedUser.senha_provisoria, true);
});

test('POST /gestor/primeiroacesso com senha curta redireciona com erro=tamanho', async () => {
  const { agent, user } = await createPrimeiroAcessoAgent();

  const res = await agent
    .post(ENDPOINT)
    .set('Referer', 'http://127.0.0.1/gestor/primeiroacesso')
    .type('form')
    .send({ senha: 'Curta1', confirmar_senha: 'Curta1' });

  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/gestor/primeiroacesso?erro=tamanho');

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(PASSWORD, persistedUser.senha), true);
  assert.equal(persistedUser.primeiro_acesso, true);
  assert.equal(persistedUser.senha_provisoria, true);
});

test('POST /gestor/primeiroacesso com senha fraca redireciona com erro=forca', async () => {
  const { agent, user } = await createPrimeiroAcessoAgent();

  const res = await agent
    .post(ENDPOINT)
    .set('Referer', 'http://127.0.0.1/gestor/primeiroacesso')
    .type('form')
    .send({ senha: 'novasenha1', confirmar_senha: 'novasenha1' });

  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/gestor/primeiroacesso?erro=forca');

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(PASSWORD, persistedUser.senha), true);
  assert.equal(persistedUser.primeiro_acesso, true);
  assert.equal(persistedUser.senha_provisoria, true);
});

test('POST /gestor/primeiroacesso com sessao stale redireciona para /gestor/login', async () => {
  const { agent } = await createPrimeiroAcessoAgent();
  await User.deleteMany({});

  const res = await agent
    .post(ENDPOINT)
    .type('form')
    .send({ senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' });

  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/gestor/login');
});

test('POST /gestor/primeiroacesso ja concluido redireciona para /gestor/dashboard sem reabrir o fluxo', async () => {
  const { agent, user } = await createPrimeiroAcessoAgent({
    primeiroAcesso: false,
    senhaProvisoria: false,
  });

  const res = await agent
    .post(ENDPOINT)
    .type('form')
    .send({ senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' });

  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/gestor/dashboard');

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(PASSWORD, persistedUser.senha), true);
  assert.equal(persistedUser.primeiro_acesso, false);
  assert.equal(persistedUser.senha_provisoria, false);
});

test('POST /gestor/primeiroacesso conclui o primeiro acesso e redireciona para /gestor/dashboard', async () => {
  const { agent, user } = await createPrimeiroAcessoAgent();
  const novaSenha = 'NovaSenha@123';

  const res = await agent
    .post(ENDPOINT)
    .type('form')
    .send({ senha: novaSenha, confirmar_senha: novaSenha });

  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/gestor/dashboard');

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(novaSenha, persistedUser.senha), true);
  assert.equal(await bcrypt.compare(PASSWORD, persistedUser.senha), false);
  assert.equal(persistedUser.primeiro_acesso, false);
  assert.equal(persistedUser.senha_provisoria, false);
});