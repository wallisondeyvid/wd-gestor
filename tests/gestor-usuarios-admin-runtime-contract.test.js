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

function buildUniqueEmail(prefix = 'usuario-admin-runtime') {
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
    email: buildUniqueEmail('admin-global-runtime'),
    nome: 'Admin Global Runtime',
    role: 'admin',
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: admin.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user: admin };
}

async function createMasterAgent() {
  const master = await createUser({
    email: buildUniqueEmail('master-global-runtime'),
    nome: 'Master Global Runtime',
    role: 'master',
    globalRole: 'master',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: master.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user: master };
}

async function createScopedUserAgent({ role = 'user' } = {}) {
  const unidade = await createEnabledUnit(`Unidade Runtime ${nextSequence()}`);
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
    origem: 'gestor-usuarios-admin-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user, unidade };
}

async function createCommonTarget() {
  const unidade = await createEnabledUnit(`Unidade Alvo ${nextSequence()}`);
  return createUser({
    email: buildUniqueEmail('alvo-comum'),
    nome: 'Alvo Comum',
    role: 'user',
    unidadeId: unidade._id,
  });
}

async function createMasterTarget() {
  return createUser({
    email: buildUniqueEmail('alvo-master'),
    nome: 'Alvo Master',
    role: 'master',
    globalRole: 'master',
  });
}

function buildObjectIdString() {
  return new mongoose.Types.ObjectId().toString();
}

function assertPlainText(res, status, expectedText) {
  assert.equal(res.status, status);
  assert.equal(typeof res.text, 'string');
  assert.match(res.text, new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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

test('Toggle: sem sessão retorna 401 texto simples', async () => {
  const target = await createCommonTarget();

  const res = await request(app).post(`/gestor/api/usuarios/${target._id}/toggle`);

  assertPlainText(res, 401, 'Não autenticado');
});

test('Toggle: sem papel suficiente retorna 403 texto simples', async () => {
  const target = await createCommonTarget();
  const { agent } = await createScopedUserAgent({ role: 'diretor' });

  const res = await agent.post(`/gestor/api/usuarios/${target._id}/toggle`);

  assertPlainText(res, 403, 'Acesso negado');
});

test('Toggle: admin em alvo comum com XHR retorna 200 JSON com success, id e ativo', async () => {
  const target = await createCommonTarget();
  const { agent } = await createAdminAgent();

  const res = await agent
    .post(`/gestor/api/usuarios/${target._id}/toggle`)
    .set('X-Requested-With', 'XMLHttpRequest');

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(String(res.body?.id), String(target._id));
  assert.equal(res.body?.ativo, false);
});

test('Toggle: tentativa sobre master retorna 403 texto simples', async () => {
  const target = await createMasterTarget();
  const { agent } = await createAdminAgent();

  const res = await agent.post(`/gestor/api/usuarios/${target._id}/toggle`);

  assertPlainText(res, 403, 'Apenas Master pode alterar o usuário Master');
});

test('Toggle: id inexistente retorna 404 texto simples', async () => {
  const { agent } = await createAdminAgent();

  const res = await agent.post(`/gestor/api/usuarios/${buildObjectIdString()}/toggle`);

  assertPlainText(res, 404, 'Usuário não encontrado');
});

test('Update: sem sessão retorna 401 texto simples', async () => {
  const target = await createCommonTarget();

  const res = await request(app)
    .post(`/gestor/api/usuarios/${target._id}/update`)
    .type('form')
    .send({ nome: 'Nome Atualizado' });

  assertPlainText(res, 401, 'Não autenticado');
});

test('Update: sem papel suficiente retorna 403 texto simples', async () => {
  const target = await createCommonTarget();
  const { agent } = await createScopedUserAgent({ role: 'diretor' });

  const res = await agent
    .post(`/gestor/api/usuarios/${target._id}/update`)
    .type('form')
    .send({ nome: 'Nome Atualizado' });

  assertPlainText(res, 403, 'Acesso negado');
});

test('Update: id inexistente retorna 404 texto simples', async () => {
  const { agent } = await createAdminAgent();

  const res = await agent
    .post(`/gestor/api/usuarios/${buildObjectIdString()}/update`)
    .type('form')
    .send({ nome: 'Nome Atualizado' });

  assertPlainText(res, 404, 'Usuário não encontrado');
});

test('Update: role user sem unidade_id retorna 400 texto simples', async () => {
  const target = await createCommonTarget();
  const { agent } = await createAdminAgent();

  const res = await agent
    .post(`/gestor/api/usuarios/${target._id}/update`)
    .type('form')
    .send({ role: 'user', unidade_id: '' });

  assertPlainText(res, 400, 'Para usuários e diretores, é obrigatório selecionar uma unidade vinculada.');
});

test('Update: sucesso por POST tradicional retorna 303 para /gestor/usuarios', async () => {
  const target = await createCommonTarget();
  const { agent } = await createAdminAgent();

  const res = await agent
    .post(`/gestor/api/usuarios/${target._id}/update`)
    .type('form')
    .send({ nome: 'Nome Tradicional Atualizado' });

  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/gestor/usuarios');
});

test('Update: sucesso com XHR retorna 200 JSON com success, id e updated', async () => {
  const target = await createCommonTarget();
  const { agent } = await createAdminAgent();

  const res = await agent
    .post(`/gestor/api/usuarios/${target._id}/update`)
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ nome: 'Nome XHR Atualizado' });

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(String(res.body?.id), String(target._id));
  assert.equal(res.body?.updated, true);
});

test('Delete: sem sessão retorna 401 texto simples', async () => {
  const target = await createCommonTarget();

  const res = await request(app).post(`/gestor/api/usuarios/${target._id}/delete`);

  assertPlainText(res, 401, 'Não autenticado');
});

test('Delete: admin autenticado preserva o comportamento runtime atual observado', async () => {
  const target = await createCommonTarget();
  const { agent } = await createAdminAgent();

  const res = await agent.post(`/gestor/api/usuarios/${target._id}/delete`);

  assertPlainText(res, 403, 'Acesso negado');
});

test('Delete: master excluindo usuário comum com XHR retorna 200 JSON com success, deleted e id', async () => {
  const target = await createCommonTarget();
  const { agent } = await createMasterAgent();

  const res = await agent
    .post(`/gestor/api/usuarios/${target._id}/delete`)
    .set('X-Requested-With', 'XMLHttpRequest');

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.deleted, true);
  assert.equal(String(res.body?.id), String(target._id));
});

test('Delete: autoexclusão retorna 403 texto simples', async () => {
  const { agent, user } = await createMasterAgent();

  const res = await agent.post(`/gestor/api/usuarios/${user._id}/delete`);

  assertPlainText(res, 403, 'Você não pode excluir seu próprio usuário.');
});

test('Delete: exclusão de master retorna 403 texto simples', async () => {
  const target = await createMasterTarget();
  const { agent } = await createMasterAgent();

  const res = await agent.post(`/gestor/api/usuarios/${target._id}/delete`);

  assertPlainText(res, 403, 'Usuário master não pode ser excluído.');
});

test('Delete: id inexistente retorna 404 texto simples', async () => {
  const { agent } = await createMasterAgent();

  const res = await agent.post(`/gestor/api/usuarios/${buildObjectIdString()}/delete`);

  assertPlainText(res, 404, 'Usuário não encontrado');
});