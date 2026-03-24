import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';

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

function buildUniqueEmail(prefix = 'usuario-bloqueados-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

async function ensureGestorModulo() {
  const existing = await Modulo.findOne({ nome: 'gestor' });
  if (existing) return existing;

  return Modulo.create({
    nome: 'gestor',
    status: 'ativo',
    url_base: '/gestor',
  });
}

async function createEnabledUnit(nome) {
  const modulo = await ensureGestorModulo();
  return Unidade.create({
    nome,
    pessoaTipo: 'pj',
    is_principal: true,
    modulosAcessiveis: [modulo._id],
  });
}

async function createUser({
  email = buildUniqueEmail('usuario'),
  nome = 'Usuário de Teste',
  role = 'user',
  globalRole = null,
  unidadeId = null,
  ativo = true,
  failedLoginAttempts = 0,
  lockUntil = null,
} = {}) {
  const payload = {
    email,
    senha: passwordHash,
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
    ativo,
    primeiro_acesso: false,
    senha_provisoria: false,
    failed_login_attempts: failedLoginAttempts,
    lock_until: lockUntil,
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
  const admin = await createUser({
    email: buildUniqueEmail('admin-global-bloqueados'),
    nome: 'Admin Global Bloqueados',
    role: 'admin',
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: admin.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user: admin };
}

async function createScopedUserAgent({ role = 'diretor' } = {}) {
  const unidade = await createEnabledUnit(`Unidade Bloqueados ${nextSequence()}`);
  const user = await createUser({
    email: buildUniqueEmail(`scoped-${role}`),
    nome: `Usuário ${role}`,
    role,
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: role === 'diretor' ? 'gestor' : 'user',
    status: 'active',
    origem: 'gestor-usuarios-bloqueados-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user, unidade };
}

async function createLockedTarget({
  emailPrefix = 'alvo-bloqueado',
  failedLoginAttempts = 5,
  role = 'user',
} = {}) {
  const unidade = await createEnabledUnit(`Unidade Alvo Bloqueado ${nextSequence()}`);
  const lockUntil = new Date(Date.now() + 10 * 60 * 1000);
  const user = await createUser({
    email: buildUniqueEmail(emailPrefix),
    nome: 'Alvo Bloqueado',
    role,
    unidadeId: unidade._id,
    failedLoginAttempts,
    lockUntil,
  });

  return { user, lockUntil };
}

async function createUnlockedTarget() {
  const unidade = await createEnabledUnit(`Unidade Alvo Desbloqueado ${nextSequence()}`);
  return createUser({
    email: buildUniqueEmail('alvo-desbloqueado'),
    nome: 'Alvo Desbloqueado',
    role: 'user',
    unidadeId: unidade._id,
    failedLoginAttempts: 0,
    lockUntil: null,
  });
}

function assertErrorEnvelope(res, { status, error, code }) {
  assert.equal(res.status, status);
  assert.equal(res.headers['content-type']?.includes('application/json'), true);
  assert.deepEqual(res.body, {
    success: false,
    error,
    code,
  });
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

test('Bloqueados: sem sessão retorna 401 JSON com envelope real', async () => {
  const res = await request(app).get('/gestor/api/usuarios/bloqueados');

  assertErrorEnvelope(res, {
    status: 401,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('Bloqueados: autenticado sem privilégio suficiente retorna 403 JSON com envelope real', async () => {
  const { agent } = await createScopedUserAgent({ role: 'diretor' });

  const res = await agent.get('/gestor/api/usuarios/bloqueados');

  assertErrorEnvelope(res, {
    status: 403,
    error: 'Acesso negado',
    code: 'FORBIDDEN',
  });
});

test('Bloqueados: admin apto retorna 200 JSON', async () => {
  await createLockedTarget();
  const { agent } = await createAdminAgent();

  const res = await agent.get('/gestor/api/usuarios/bloqueados');

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type']?.includes('application/json'), true);
});

test('Bloqueados: sucesso retorna envelope e lista no shape real observado', async () => {
  const { user, lockUntil } = await createLockedTarget({ failedLoginAttempts: 7 });
  await createUnlockedTarget();
  const { agent } = await createAdminAgent();

  const res = await agent.get('/gestor/api/usuarios/bloqueados');

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(typeof res.body?.total, 'number');
  assert.equal(Array.isArray(res.body?.data), true);

  const item = res.body.data.find((entry) => String(entry?._id) === String(user._id));
  assert.ok(item, 'usuario bloqueado deve aparecer na lista retornada');
  assert.deepEqual(Object.keys(item).sort(), ['_id', 'email', 'failed_login_attempts', 'lock_until', 'role']);
  assert.equal(String(item._id), String(user._id));
  assert.equal(item.email, user.email);
  assert.equal(item.role, user.role);
  assert.equal(item.failed_login_attempts, 7);
  assert.equal(new Date(item.lock_until).toISOString(), lockUntil.toISOString());
});

test('Bloqueados: sucesso preserva o total real observado', async () => {
  await createLockedTarget({ emailPrefix: 'alvo-bloqueado-a' });
  await createLockedTarget({ emailPrefix: 'alvo-bloqueado-b' });
  await createUnlockedTarget();
  const { agent } = await createAdminAgent();

  const res = await agent.get('/gestor/api/usuarios/bloqueados');

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.total, 2);
  assert.equal(res.body?.data?.length, 2);
});

test('Bloqueados: falha interna retorna 500 JSON com envelope real', async () => {
  const { agent } = await createAdminAgent();
  const originalFind = User.find;

  User.find = function mockedFind() {
    throw new Error('bloqueados-runtime-contract-induced-error');
  };

  try {
    const res = await agent.get('/gestor/api/usuarios/bloqueados');

    assertErrorEnvelope(res, {
      status: 500,
      error: 'Falha ao listar bloqueados',
      code: 'SERVER_ERROR',
    });
  } finally {
    User.find = originalFind;
  }
});