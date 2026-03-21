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
const ENDPOINT = '/gestor/api/modulos';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'modulos-contract') {
  const id = nextSequence();
  return prefix + '.' + Date.now() + '.' + id + '@example.com';
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
  nome = 'Teste Modulos Contrato',
  role = 'user',
} = {}) {
  return User.create({
    email,
    senha: passwordHash,
    nome,
    cpf: buildUniqueCpf(),
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  });
}

async function login(agent, { email, senha = PASSWORD } = {}) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

function extractNames(response) {
  return (response.body?.data || []).map((item) => item.nome).sort();
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

test('GET /gestor/api/modulos retorna 401 JSON sem sessao', async () => {
  const res = await request(app).get(ENDPOINT);

  assert.equal(res.status, 401, JSON.stringify(res.body));
  assert.equal(res.type, 'application/json');
  assert.deepEqual(res.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('GET /gestor/api/modulos retorna 409 JSON com selecao pendente', async () => {
  const moduloGestor = await ensureGestorModulo();
  const unidadeA = await createEnabledUnit({
    nome: 'Unidade Selecao A ' + nextSequence(),
    moduloIds: [moduloGestor._id],
  });
  const unidadeB = await createEnabledUnit({
    nome: 'Unidade Selecao B ' + nextSequence(),
    moduloIds: [moduloGestor._id],
  });
  const user = await createUser({
    email: buildUniqueEmail('pending-modulos-contract'),
    nome: 'Usuario Modulos Pendente Contrato',
  });

  await UserMembership.insertMany([
    {
      user_id: user._id,
      unidade_id: unidadeA._id,
      papel_contextual: 'gestor',
      status: 'active',
      origem: 'modulo-api-contract-test',
    },
    {
      user_id: user._id,
      unidade_id: unidadeB._id,
      papel_contextual: 'user',
      status: 'active',
      origem: 'modulo-api-contract-test',
    },
  ]);

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/login?step=select');

  const res = await agent.get(ENDPOINT);

  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.type, 'application/json');
  assert.deepEqual(res.body, {
    success: false,
    authenticated: true,
    error: 'Seleção de unidade pendente',
    code: 'GESTOR_SELECTION_REQUIRED',
    needsUnitSelection: true,
    redirect: '/gestor/login?step=select',
  });
});

test('GET /gestor/api/modulos retorna sucesso minimo com modulos da unidade ativa', async () => {
  const moduloGestor = await ensureGestorModulo();
  const moduloEscala = await createModulo({
    nome: 'modulo-escala-' + nextSequence(),
    urlBase: '/escalas',
  });
  const unidade = await createEnabledUnit({
    nome: 'Unidade Gestor ' + nextSequence(),
    moduloIds: [moduloGestor._id, moduloEscala._id],
  });
  const user = await createUser({
    email: buildUniqueEmail('gestor-modulos-contract'),
    nome: 'Gestor Contextual Modulos Contrato',
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'modulo-api-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  const res = await agent.get(ENDPOINT);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.type, 'application/json');
  assert.equal(res.body?.success, true, JSON.stringify(res.body));
  assert.equal(Array.isArray(res.body?.data), true, JSON.stringify(res.body));
  assert.deepEqual(extractNames(res), [moduloEscala.nome, moduloGestor.nome].sort());
});