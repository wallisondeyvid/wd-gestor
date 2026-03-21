import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import Modulo from '../src/core/models/modulo.js';
import User from '../src/core/models/user.js';

process.env.NODE_ENV = 'test';
process.env.MONGO_MEMORY = '1';

const PASSWORD = 'Senha@123456';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'modulos-by-id') {
  const id = nextSequence();
  return prefix + '.' + Date.now() + '.' + id + '@example.com';
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

function endpointById(id) {
  return '/gestor/api/modulos/' + String(id);
}

async function createModulo({ nome, descricao = null, urlBase = null } = {}) {
  return Modulo.create({
    nome,
    descricao,
    status: 'ativo',
    url_base: urlBase,
  });
}

async function createUser({
  email = buildUniqueEmail('modulos-admin'),
  nome = 'Admin Modulos By Id',
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

async function createAdminAgent() {
  const admin = await createUser();

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: admin.email });
  assert.equal(loginRes.status, 303);
  return { agent, admin };
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
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '1';
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: true,
  };
  delete app.locals.gestorAuthContextResolverDeps;
  delete app.locals.gestorAuthContextMaxTimeMS;
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

test('GET /gestor/api/modulos/:id retorna 401 sem sessão', async () => {
  const validId = new mongoose.Types.ObjectId();

  const res = await request(app).get(endpointById(validId));

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('GET /gestor/api/modulos/:id retorna 404 com id válido porém inexistente', async () => {
  const { agent } = await createAdminAgent();
  const missingId = new mongoose.Types.ObjectId();

  const res = await agent.get(endpointById(missingId));

  assert.equal(res.status, 404);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.code, 'NOT_FOUND');
  assert.equal(res.body?.message, 'Módulo não encontrado');
});

test('GET /gestor/api/modulos/:id retorna 200 com objeto do módulo existente', async () => {
  const modulo = await createModulo({
    nome: 'modulo-by-id-' + nextSequence(),
    urlBase: '/modulo-by-id',
  });
  const { agent } = await createAdminAgent();

  const res = await agent.get(endpointById(modulo._id));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.type, 'application/json');
  assert.equal(res.body?.success, true, JSON.stringify(res.body));
  assert.equal(typeof res.body?.data, 'object', JSON.stringify(res.body));
  assert.equal(Array.isArray(res.body?.data), false, JSON.stringify(res.body));
  assert.equal(String(res.body?.data?._id || ''), String(modulo._id));
  assert.equal(res.body?.data?.nome, modulo.nome);
});