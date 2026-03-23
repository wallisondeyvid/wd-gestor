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

function buildUniqueEmail(prefix = 'usuario-status-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

function buildObjectIdString() {
  return new mongoose.Types.ObjectId().toString();
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
    email: buildUniqueEmail('admin-global-status'),
    nome: 'Admin Global Status',
    role: 'admin',
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: admin.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user: admin };
}

async function createScopedUserAgent({
  role = 'user',
  nome = `Usuário ${role}`,
  failedLoginAttempts = 0,
  lockUntil = null,
} = {}) {
  const unidade = await createEnabledUnit(`Unidade Status ${nextSequence()}`);
  const user = await createUser({
    email: buildUniqueEmail(`scoped-${role}`),
    nome,
    role,
    unidadeId: unidade._id,
    failedLoginAttempts,
    lockUntil,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: role === 'diretor' ? 'gestor' : 'user',
    status: 'active',
    origem: 'gestor-usuarios-status-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user, unidade };
}

async function createThirdPartyTarget({
  role = 'user',
  nome = 'Alvo Terceiro',
  failedLoginAttempts = 0,
  lockUntil = null,
} = {}) {
  const unidade = await createEnabledUnit(`Unidade Alvo Status ${nextSequence()}`);
  return createUser({
    email: buildUniqueEmail('alvo-status'),
    nome,
    role,
    unidadeId: unidade._id,
    failedLoginAttempts,
    lockUntil,
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

function assertStatusDataShape(data, {
  expectedId,
  expectedEmail,
  expectedRole,
  expectedFailedAttempts,
  expectedLocked,
  expectLockUntil,
}) {
  assert.equal(String(data?.id), String(expectedId));
  assert.equal(data?.email, expectedEmail);
  assert.equal(data?.role, expectedRole);
  assert.equal(data?.failed_login_attempts, expectedFailedAttempts);
  assert.equal(data?.locked, expectedLocked);

  if (expectLockUntil) {
    assert.equal(typeof data?.lock_until, 'string');
    assert.equal(new Date(data.lock_until).toISOString(), expectLockUntil.toISOString());
    assert.equal(typeof data?.seconds_remaining, 'number');
    assert.equal(typeof data?.minutes_remaining, 'number');
    assert.ok(data.seconds_remaining > 0);
    assert.ok(data.minutes_remaining > 0);
  } else {
    assert.equal(data?.lock_until, null);
    assert.equal(data?.seconds_remaining, 0);
    assert.equal(data?.minutes_remaining, 0);
  }
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

test('Status: sem sessão retorna 401 JSON com envelope real', async () => {
  const res = await request(app).get(`/gestor/api/usuarios/${buildObjectIdString()}/status`);

  assertErrorEnvelope(res, {
    status: 401,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('Status: usuário autenticado sem privilégio consultando terceiro retorna 403 JSON com envelope real', async () => {
  const target = await createThirdPartyTarget();
  const { agent } = await createScopedUserAgent({ role: 'diretor' });

  const res = await agent.get(`/gestor/api/usuarios/${target._id}/status`);

  assertErrorEnvelope(res, {
    status: 403,
    error: 'Acesso negado',
    code: 'FORBIDDEN',
  });
});

test('Status: usuário consultando o próprio id retorna 200 JSON com success true e shape real', async () => {
  const { agent, user } = await createScopedUserAgent({
    role: 'diretor',
    nome: 'Usuário Self Status',
    failedLoginAttempts: 3,
    lockUntil: null,
  });

  const res = await agent.get(`/gestor/api/usuarios/${user._id}/status`);

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type']?.includes('application/json'), true);
  assert.equal(res.body?.success, true);
  assertStatusDataShape(res.body?.data, {
    expectedId: user._id,
    expectedEmail: user.email,
    expectedRole: user.role,
    expectedFailedAttempts: 0,
    expectedLocked: false,
    expectLockUntil: null,
  });
});

test('Status: admin consultando terceiro retorna 200 JSON com success true e shape real', async () => {
  const lockUntil = new Date(Date.now() + 5 * 60 * 1000);
  const target = await createThirdPartyTarget({
    nome: 'Alvo Admin Status',
    failedLoginAttempts: 2,
    lockUntil,
  });
  const { agent } = await createAdminAgent();

  const res = await agent.get(`/gestor/api/usuarios/${target._id}/status`);

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type']?.includes('application/json'), true);
  assert.equal(res.body?.success, true);
  assertStatusDataShape(res.body?.data, {
    expectedId: target._id,
    expectedEmail: target.email,
    expectedRole: target.role,
    expectedFailedAttempts: 2,
    expectedLocked: true,
    expectLockUntil: lockUntil,
  });
});

test('Status: id bem formado sem usuário correspondente retorna 404 JSON com envelope real', async () => {
  const { agent } = await createAdminAgent();

  const res = await agent.get(`/gestor/api/usuarios/${buildObjectIdString()}/status`);

  assertErrorEnvelope(res, {
    status: 404,
    error: 'Usuário não encontrado',
    code: 'NOT_FOUND',
  });
});

test('Status: erro interno retorna 500 JSON com envelope real', async () => {
  const target = await createThirdPartyTarget();
  const { agent } = await createAdminAgent();
  const originalFindById = User.findById;

  User.findById = function mockedFindById() {
    return {
      select() {
        throw new Error('status-runtime-contract-induced-error');
      },
    };
  };

  try {
    const res = await agent.get(`/gestor/api/usuarios/${target._id}/status`);

    assertErrorEnvelope(res, {
      status: 500,
      error: 'Falha ao obter status',
      code: 'SERVER_ERROR',
    });
  } finally {
    User.findById = originalFindById;
  }
});