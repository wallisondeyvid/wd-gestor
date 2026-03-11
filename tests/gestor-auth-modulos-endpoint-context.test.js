import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import Funcao from '../src/core/models/funcao.js';
import Funcionario from '../src/core/models/Funcionario.js';
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

function buildUniqueEmail(prefix = 'modulos-context') {
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

async function createModulo({ nome, descricao = null, urlBase = null } = {}) {
  return Modulo.create({
    nome,
    descricao,
    status: 'ativo',
    url_base: urlBase,
  });
}

async function createEnabledUnit({ nome, moduloIds = [] } = {}) {
  return Unidade.create({
    nome,
    pessoaTipo: 'pj',
    is_principal: true,
    modulosAcessiveis: moduloIds,
  });
}

async function createUser({
  email = buildUniqueEmail('modulos-user'),
  nome = 'Teste Modulos Contexto',
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

async function createFuncaoWithModules({ nome, unidadePrincipalId = null, moduloIds = [] } = {}) {
  return Funcao.create({
    nome,
    unidade_principal_id: unidadePrincipalId,
    modulos_habilitados: moduloIds,
  });
}

async function createFuncionarioForUser({ userId, unidadeId, funcaoId, email = buildUniqueEmail('funcionario') } = {}) {
  return Funcionario.create({
    unidade_id: unidadeId,
    funcao_id: funcaoId,
    usuario_id: userId,
    nome: `Funcionario ${nextSequence()}`,
    rg: `RG${nextSequence()}`,
    cpf: buildUniqueCpf(),
    data_nascimento: new Date('1990-01-01T00:00:00.000Z'),
    sexo: 'N',
    email,
    telefone: '(11) 99999-9999',
    ativo: true,
  });
}

async function login(agent, { email, senha = PASSWORD } = {}) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

function extractNames(response) {
  return (response.body.data || []).map((item) => item.nome).sort();
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

test('GET /gestor/api/modulos mantém o comportamento legado quando a flag está desligada', async () => {
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '0';
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: false,
  };

  const moduloGestor = await ensureGestorModulo();
  const moduloUnidade = await createModulo({ nome: `modulo-unidade-${nextSequence()}`, urlBase: '/unidade' });
  const moduloFuncao = await createModulo({ nome: `modulo-funcao-${nextSequence()}`, urlBase: '/funcao' });
  const unidade = await createEnabledUnit({
    nome: `Unidade Legado ${nextSequence()}`,
    moduloIds: [moduloGestor._id, moduloUnidade._id],
  });
  const funcao = await createFuncaoWithModules({
    nome: `Funcao Legado ${nextSequence()}`,
    unidadePrincipalId: unidade._id,
    moduloIds: [moduloGestor._id, moduloFuncao._id],
  });
  const user = await createUser({
    email: buildUniqueEmail('legacy-modulos'),
    nome: 'Usuario Modulos Legado',
    role: 'user',
    unidadeId: unidade._id,
  });

  const funcionario = await createFuncionarioForUser({
    userId: user._id,
    unidadeId: unidade._id,
    funcaoId: funcao._id,
    email: buildUniqueEmail('legacy-funcionario'),
  });
  await User.updateOne(
    { _id: user._id },
    { $set: { funcionario_id: funcionario._id } },
  );

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);

  const res = await agent.get('/gestor/api/modulos');

  assert.equal(res.status, 200);
  assert.deepEqual(extractNames(res), [moduloFuncao.nome, moduloGestor.nome, moduloUnidade.nome].sort());
});

test('GET /gestor/api/modulos mantém privilégio global com AuthContext para admin', async () => {
  const moduloGestor = await ensureGestorModulo();
  const moduloFinanceiro = await createModulo({ nome: `modulo-financeiro-${nextSequence()}`, urlBase: '/financeiro' });
  const user = await createUser({
    email: buildUniqueEmail('global-admin-modulos'),
    nome: 'Admin Global Modulos',
    role: 'user',
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);

  const res = await agent.get('/gestor/api/modulos');

  assert.equal(res.status, 200);
  assert.deepEqual(extractNames(res), [moduloFinanceiro.nome, moduloGestor.nome].sort());
});

test('GET /gestor/api/modulos usa os módulos da unidade ativa para papel gestor', async () => {
  const moduloGestor = await ensureGestorModulo();
  const moduloEscala = await createModulo({ nome: `modulo-escala-${nextSequence()}`, urlBase: '/escalas' });
  const unidade = await createEnabledUnit({
    nome: `Unidade Gestor ${nextSequence()}`,
    moduloIds: [moduloGestor._id, moduloEscala._id],
  });
  const user = await createUser({
    email: buildUniqueEmail('gestor-modulos'),
    nome: 'Gestor Contextual Modulos',
    role: 'user',
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-auth-modulos-endpoint-context-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  const res = await agent.get('/gestor/api/modulos');

  assert.equal(res.status, 200);
  assert.deepEqual(extractNames(res), [moduloEscala.nome, moduloGestor.nome].sort());
});

test('GET /gestor/api/modulos usa interseção entre unidade ativa e função para papel user', async () => {
  const moduloGestor = await ensureGestorModulo();
  const moduloComum = await createModulo({ nome: `modulo-comum-${nextSequence()}`, urlBase: '/comum' });
  const moduloUnidade = await createModulo({ nome: `modulo-unidade-only-${nextSequence()}`, urlBase: '/unidade-only' });
  const moduloFuncao = await createModulo({ nome: `modulo-funcao-only-${nextSequence()}`, urlBase: '/funcao-only' });
  const unidade = await createEnabledUnit({
    nome: `Unidade User ${nextSequence()}`,
    moduloIds: [moduloGestor._id, moduloComum._id, moduloUnidade._id],
  });
  const funcao = await createFuncaoWithModules({
    nome: `Funcao User ${nextSequence()}`,
    unidadePrincipalId: unidade._id,
    moduloIds: [moduloGestor._id, moduloComum._id, moduloFuncao._id],
  });
  const user = await createUser({
    email: buildUniqueEmail('user-modulos'),
    nome: 'Usuario Contextual Modulos',
    role: 'user',
  });
  const funcionario = await createFuncionarioForUser({
    userId: user._id,
    unidadeId: unidade._id,
    funcaoId: funcao._id,
    email: buildUniqueEmail('user-funcionario'),
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'user',
    funcionario_id: funcionario._id,
    status: 'active',
    origem: 'gestor-auth-modulos-endpoint-context-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  const res = await agent.get('/gestor/api/modulos');

  assert.equal(res.status, 200);
  assert.deepEqual(extractNames(res), [moduloComum.nome, moduloGestor.nome].sort());
});

test('GET /gestor/api/modulos retorna seleção obrigatória quando o contexto está pendente', async () => {
  const moduloGestor = await ensureGestorModulo();
  const unidadeA = await createEnabledUnit({
    nome: `Unidade Seleção A ${nextSequence()}`,
    moduloIds: [moduloGestor._id],
  });
  const unidadeB = await createEnabledUnit({
    nome: `Unidade Seleção B ${nextSequence()}`,
    moduloIds: [moduloGestor._id],
  });
  const user = await createUser({
    email: buildUniqueEmail('pending-modulos'),
    nome: 'Usuario Modulos Pendente',
    role: 'user',
  });

  await UserMembership.insertMany([
    {
      user_id: user._id,
      unidade_id: unidadeA._id,
      papel_contextual: 'gestor',
      status: 'active',
      origem: 'gestor-auth-modulos-endpoint-context-test',
    },
    {
      user_id: user._id,
      unidade_id: unidadeB._id,
      papel_contextual: 'user',
      status: 'active',
      origem: 'gestor-auth-modulos-endpoint-context-test',
    },
  ]);

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/login?step=select');

  const res = await agent.get('/gestor/api/modulos');

  assert.equal(res.status, 409);
  assert.deepEqual(res.body, {
    success: false,
    authenticated: true,
    error: 'Seleção de unidade pendente',
    code: 'GESTOR_SELECTION_REQUIRED',
    needsUnitSelection: true,
    redirect: '/gestor/login?step=select',
  });
});
