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
const ENDPOINT = '/gestor/api/usuario/senha';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'usuario-senha') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

async function createUser({
  email = buildUniqueEmail('senha-user'),
  nome = 'Usuario Senha API',
  role = 'admin',
  globalRole = 'admin',
  primeiroAcesso = false,
  senhaProvisoria = false,
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

  if (globalRole) {
    payload.global_role = globalRole;
  }

  return User.create(payload);
}

async function login(agent, { email, senha = PASSWORD } = {}) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

async function createAuthenticatedAgent(userOptions = {}) {
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

test('PUT /gestor/api/usuario/senha retorna 401 sem sessão', async () => {
  const res = await request(app)
    .put(ENDPOINT)
    .send({ senhaAtual: PASSWORD, novaSenha: 'NovaSenha@123' });

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('PUT /gestor/api/usuario/senha valida parâmetros obrigatórios', async () => {
  const { agent } = await createAuthenticatedAgent();

  const res = await agent
    .put(ENDPOINT)
    .send({ senhaAtual: PASSWORD });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'Parâmetros insuficientes');
  assert.equal(res.body?.code, 'BAD_REQUEST');
});

test('PUT /gestor/api/usuario/senha rejeita senha atual incorreta', async () => {
  const { agent, user } = await createAuthenticatedAgent();

  const res = await agent
    .put(ENDPOINT)
    .send({ senhaAtual: 'SenhaErrada@123', novaSenha: 'NovaSenha@123' });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'Senha atual inválida');
  assert.equal(res.body?.code, 'BAD_REQUEST');

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(PASSWORD, persistedUser.senha), true);
});

test('PUT /gestor/api/usuario/senha atualiza a senha com usuário autenticado apto', async () => {
  const { agent, user } = await createAuthenticatedAgent();
  const novaSenha = 'NovaSenha@123';

  const res = await agent
    .put(ENDPOINT)
    .send({ senhaAtual: PASSWORD, novaSenha });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.success, true, JSON.stringify(res.body));
  assert.deepEqual(res.body?.data, {
    updated: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  });

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(novaSenha, persistedUser.senha), true);
  assert.equal(await bcrypt.compare(PASSWORD, persistedUser.senha), false);
  assert.equal(persistedUser.primeiro_acesso, false);
  assert.equal(persistedUser.senha_provisoria, false);
});

test('PUT /gestor/api/usuario/senha é bloqueado quando a sessão exige primeiro acesso', async () => {
  const { agent, user } = await createAuthenticatedAgent({
    primeiroAcesso: true,
    senhaProvisoria: true,
  });
  const novaSenha = 'NovaSenha@123';

  const res = await agent
    .put(ENDPOINT)
    .send({ senhaAtual: PASSWORD, novaSenha });

  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'FIRST_LOGIN_PASSWORD_CHANGE_REQUIRED',
    code: 'FIRST_LOGIN',
  });

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(PASSWORD, persistedUser.senha), true);
  assert.equal(persistedUser.primeiro_acesso, true);
  assert.equal(persistedUser.senha_provisoria, true);
});