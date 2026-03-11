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

function buildUniqueEmail(prefix = 'user') {
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
} = {}) {
  const payload = {
    email,
    senha: passwordHash,
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
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
  const admin = await createUser({
    email: buildUniqueEmail('admin-global'),
    nome: 'Admin Global',
    role: 'admin',
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: admin.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');
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

test('POST /gestor/api/usuarios cria usuário novo com membership contextual', async () => {
  const unidade = await createEnabledUnit(`Unidade Novo Usuário ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('novo-contextual');

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Novo Contextual',
      email,
      role: 'user',
      unidade_id: String(unidade._id),
      cpf: buildUniqueCpf(),
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.created, true);
  assert.equal(res.body.data?.outcome, 'created');
  assert.equal(typeof res.body.data?.tempPassword, 'string');

  const user = await User.findOne({ email }).lean();
  assert.ok(user);

  const membership = await UserMembership.findOne({ user_id: user._id, unidade_id: unidade._id }).lean();
  assert.ok(membership);
  assert.equal(membership.papel_contextual, 'user');
  assert.equal(membership.status, 'active');
  assert.equal(String(res.body.id), String(user._id));
});

test('POST /gestor/api/usuarios reaproveita o mesmo User e adiciona membership em outra unidade', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Existente A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Existente B ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('link-contextual');

  const existingUser = await createUser({
    email,
    nome: 'Usuário Multiunidade',
    role: 'user',
    unidadeId: unidadeA._id,
  });

  await UserMembership.create({
    user_id: existingUser._id,
    unidade_id: unidadeA._id,
    papel_contextual: 'user',
    status: 'active',
    origem: 'gestor-user-create-or-link-test',
  });

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Multiunidade',
      email,
      role: 'diretor',
      unidade_id: String(unidadeB._id),
      cpf: buildUniqueCpf(),
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.outcome, 'linked');
  assert.equal(res.body.data?.tempPassword, undefined);
  assert.equal(String(res.body.id), String(existingUser._id));

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);

  const memberships = await UserMembership.find({ user_id: existingUser._id }).sort({ createdAt: 1 }).lean();
  assert.equal(memberships.length, 2);
  assert.equal(String(memberships[1].unidade_id), String(unidadeB._id));
  assert.equal(memberships[1].papel_contextual, 'gestor');

  const targetAgent = request.agent(app);
  const loginRes = await login(targetAgent, { email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/login?step=select');

  const contextRes = await targetAgent.get('/gestor/auth/context');
  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.needsUnitSelection, true);
  assert.equal(contextRes.body.membershipCount, 2);
});

test('POST /gestor/api/usuarios falha claramente quando o usuário já está vinculado à mesma unidade', async () => {
  const unidade = await createEnabledUnit(`Unidade Duplicada ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('duplicado-contextual');

  const existingUser = await createUser({
    email,
    nome: 'Usuário Já Vinculado',
    role: 'user',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: existingUser._id,
    unidade_id: unidade._id,
    papel_contextual: 'user',
    status: 'active',
    origem: 'gestor-user-create-or-link-test',
  });

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Já Vinculado',
      email,
      role: 'user',
      unidade_id: String(unidade._id),
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'USER_MEMBERSHIP_DUPLICATE');
  assert.equal(res.body.error, 'Usuário já vinculado a esta unidade');

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);

  const memberships = await UserMembership.find({ user_id: existingUser._id, unidade_id: unidade._id }).lean();
  assert.equal(memberships.length, 1);
});