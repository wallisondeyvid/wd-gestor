import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import Funcionario from '../src/core/models/Funcionario.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';

process.env.NODE_ENV = 'test';
process.env.MONGO_MEMORY = '1';

const PASSWORD = 'Senha@123456';
const AUTO_USER_MESSAGES = {
  created: 'Usuário criado automaticamente para o funcionário.',
  linked: 'Usuário existente vinculado automaticamente à unidade do funcionário.',
  'already-linked': 'Usuário já estava vinculado a esta unidade.',
  conflict: 'Usuário já possui vínculo com esta unidade associado a outro funcionário.',
};

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'funcionario-auto') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

function buildUniqueRg() {
  return `RG${Date.now()}${nextSequence()}`;
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
  email = buildUniqueEmail('usuario-auto'),
  nome = 'Usuário Auto',
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
    email: buildUniqueEmail('admin-funcionario-auto'),
    nome: 'Admin Funcionário Auto',
    role: 'admin',
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: admin.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');
  return { agent, admin };
}

function buildFuncionarioInitialPayload({ unidadeId, email, cpf = buildUniqueCpf(), nome = 'Funcionário Auto' } = {}) {
  return {
    unidade_id: String(unidadeId),
    nome,
    rg: buildUniqueRg(),
    cpf,
    data_nascimento: '2000-01-01',
    sexo: 'M',
    endereco: {
      cep: '01001000',
      logradouro: 'Rua Teste',
      numero: '100',
      bairro: 'Centro',
      cidade: 'São Paulo',
      uf: 'SP',
    },
    email,
    telefone: '(11) 99999-0000',
  };
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

test('POST /gestor/api/funcionarios/initial com e-mail novo cria User e membership', async () => {
  const unidade = await createEnabledUnit(`Unidade Auto Novo ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('funcionario-auto-novo');

  const res = await agent
    .post('/gestor/api/funcionarios/initial')
    .send(buildFuncionarioInitialPayload({ unidadeId: unidade._id, email, nome: 'Funcionário Novo Auto' }));

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.autoUser?.ok, true);
  assert.equal(res.body.data?.autoUser?.outcome, 'created');
  assert.equal(res.body.data?.autoUser?.message, AUTO_USER_MESSAGES.created);

  const funcionario = await Funcionario.findById(res.body.id).lean();
  const user = await User.findOne({ email }).lean();
  const membership = await UserMembership.findOne({ user_id: user._id, unidade_id: unidade._id }).lean();

  assert.ok(funcionario);
  assert.ok(user);
  assert.ok(membership);
  assert.equal(String(funcionario.usuario_id), String(user._id));
  assert.equal(String(membership.funcionario_id), String(funcionario._id));
});

test('POST /gestor/api/funcionarios/initial com e-mail já existente em outra unidade reaproveita User e cria novo membership', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Auto A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Auto B ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('funcionario-auto-link');

  const existingUser = await createUser({
    email,
    nome: 'Usuário Reaproveitado',
    role: 'user',
    unidadeId: unidadeA._id,
  });

  await UserMembership.create({
    user_id: existingUser._id,
    unidade_id: unidadeA._id,
    papel_contextual: 'user',
    status: 'active',
    origem: 'funcionario-auto-user-test',
  });

  const res = await agent
    .post('/gestor/api/funcionarios/initial')
    .send(buildFuncionarioInitialPayload({ unidadeId: unidadeB._id, email, nome: 'Funcionário Link Auto' }));

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.autoUser?.ok, true);
  assert.equal(res.body.data?.autoUser?.outcome, 'linked');
  assert.equal(res.body.data?.autoUser?.message, AUTO_USER_MESSAGES.linked);
  assert.equal(String(res.body.data?.autoUser?.userId), String(existingUser._id));

  const users = await User.find({ email }).lean();
  const funcionario = await Funcionario.findById(res.body.id).lean();
  const memberships = await UserMembership.find({ user_id: existingUser._id }).sort({ createdAt: 1 }).lean();

  assert.equal(users.length, 1);
  assert.ok(funcionario);
  assert.equal(String(funcionario.usuario_id), String(existingUser._id));
  assert.equal(memberships.length, 2);
  assert.equal(String(memberships[1].unidade_id), String(unidadeB._id));
  assert.equal(String(memberships[1].funcionario_id), String(funcionario._id));
});

test('POST /gestor/api/funcionarios/initial com User já vinculado à mesma unidade não duplica membership e responde explicitamente', async () => {
  const unidade = await createEnabledUnit(`Unidade Auto Mesmo Vínculo ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('funcionario-auto-already-linked');

  const existingUser = await createUser({
    email,
    nome: 'Usuário Já Vinculado',
    role: 'user',
    unidadeId: unidade._id,
  });

  const existingMembership = await UserMembership.create({
    user_id: existingUser._id,
    unidade_id: unidade._id,
    papel_contextual: 'user',
    status: 'active',
    origem: 'funcionario-auto-user-test',
  });

  const res = await agent
    .post('/gestor/api/funcionarios/initial')
    .send(buildFuncionarioInitialPayload({ unidadeId: unidade._id, email, nome: 'Funcionário Mesmo Vínculo' }));

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.autoUser?.ok, true);
  assert.equal(res.body.data?.autoUser?.outcome, 'already-linked');
  assert.equal(res.body.data?.autoUser?.message, AUTO_USER_MESSAGES['already-linked']);
  assert.equal(res.body.data?.autoUser?.membershipCreated, false);

  const funcionario = await Funcionario.findById(res.body.id).lean();
  const memberships = await UserMembership.find({ user_id: existingUser._id, unidade_id: unidade._id }).lean();
  const refreshedMembership = await UserMembership.findById(existingMembership._id).lean();

  assert.ok(funcionario);
  assert.equal(String(funcionario.usuario_id), String(existingUser._id));
  assert.equal(memberships.length, 1);
  assert.equal(String(refreshedMembership.funcionario_id), String(funcionario._id));
});

test('POST /gestor/api/funcionarios/initial com membership já ligado a outro funcionário retorna conflito funcional explícito', async () => {
  const unidade = await createEnabledUnit(`Unidade Auto Conflito ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('funcionario-auto-conflict');

  const existingUser = await createUser({
    email,
    nome: 'Usuário Em Conflito',
    role: 'user',
    unidadeId: unidade._id,
  });

  const funcionarioJaVinculado = await Funcionario.create(
    buildFuncionarioInitialPayload({
      unidadeId: unidade._id,
      email: buildUniqueEmail('funcionario-ja-vinculado'),
      nome: 'Funcionário Já Vinculado',
    })
  );

  const existingMembership = await UserMembership.create({
    user_id: existingUser._id,
    unidade_id: unidade._id,
    papel_contextual: 'user',
    status: 'active',
    funcionario_id: funcionarioJaVinculado._id,
    origem: 'funcionario-auto-user-test',
  });

  const res = await agent
    .post('/gestor/api/funcionarios/initial')
    .send(buildFuncionarioInitialPayload({ unidadeId: unidade._id, email, nome: 'Funcionário Em Conflito' }));

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.autoUser?.ok, false);
  assert.equal(res.body.data?.autoUser?.outcome, 'conflict');
  assert.equal(res.body.data?.autoUser?.code, 'AUTO_USER_MEMBERSHIP_CONFLICT');
  assert.equal(res.body.data?.autoUser?.message, AUTO_USER_MESSAGES.conflict);
  assert.equal(res.body.data?.autoUser?.membershipCreated, false);
  assert.equal(String(res.body.data?.autoUser?.userId), String(existingUser._id));

  const funcionario = await Funcionario.findById(res.body.id).lean();
  const memberships = await UserMembership.find({ user_id: existingUser._id, unidade_id: unidade._id }).lean();
  const refreshedMembership = await UserMembership.findById(existingMembership._id).lean();

  assert.ok(funcionario);
  assert.equal(funcionario.usuario_id ?? null, null);
  assert.equal(memberships.length, 1);
  assert.equal(String(refreshedMembership.funcionario_id), String(funcionarioJaVinculado._id));
});