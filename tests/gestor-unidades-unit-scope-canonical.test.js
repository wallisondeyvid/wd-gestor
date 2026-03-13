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

function buildUniqueEmail(prefix = 'unidades-context') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(20000000000 + id).slice(-11);
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

async function createUnit({ nome, principalUnitId = null } = {}) {
  const moduloGestor = await ensureGestorModulo();
  const payload = {
    nome,
    pessoaTipo: 'pj',
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  };

  if (principalUnitId) {
    payload.is_principal = false;
    payload.subunidade = true;
    payload.unidade_principal_id = principalUnitId;
  } else {
    payload.is_principal = true;
  }

  return Unidade.create(payload);
}

async function createUser({
  email = buildUniqueEmail('unidades-user'),
  nome = 'Usuario Contextual Unidades',
  role = 'user',
  unidadeId = null,
} = {}) {
  return User.create({
    email,
    senha: passwordHash,
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
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

function extractUnidadesFromListResponse(response) {
  if (Array.isArray(response.body?.data?.unidades)) return response.body.data.unidades;
  if (Array.isArray(response.body?.unidades)) return response.body.unidades;
  return [];
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

async function createContextualAgent() {
  const unidadePrincipalA = await createUnit({ nome: `Principal A ${nextSequence()}` });
  const unidadeFilialB = await createUnit({
    nome: `Filial B ${nextSequence()}`,
    principalUnitId: unidadePrincipalA._id,
  });
  const unidadePrincipalC = await createUnit({ nome: `Principal C ${nextSequence()}` });

  const user = await createUser({
    email: buildUniqueEmail('unidades-context-user'),
    nome: 'Gestor Contextual de Unidades',
    role: 'user',
    unidadeId: unidadePrincipalC._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeFilialB._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-unidades-unit-scope-canonical-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return {
    agent,
    unidadePrincipalA,
    unidadeFilialB,
    unidadePrincipalC,
  };
}

test('GET /gestor/unidades usa req.unitScope e ignora unidade legada divergente', async () => {
  const { agent, unidadePrincipalA, unidadeFilialB, unidadePrincipalC } = await createContextualAgent();

  const res = await agent
    .get('/gestor/unidades')
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/i);
  assert.match(res.text, new RegExp(unidadePrincipalA.nome));
  assert.match(res.text, new RegExp(unidadeFilialB.nome));
  assert.doesNotMatch(res.text, new RegExp(unidadePrincipalC.nome));
});

test('GET /gestor/api/unidades hidrata apenas o cluster da unidade ativa', async () => {
  const { agent, unidadePrincipalA, unidadeFilialB, unidadePrincipalC } = await createContextualAgent();

  const res = await agent
    .get('/gestor/api/unidades')
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  const unidades = extractUnidadesFromListResponse(res);
  const nomes = unidades.map((unidade) => unidade.nome).sort();

  assert.deepEqual(nomes, [unidadeFilialB.nome, unidadePrincipalA.nome].sort());
  assert.equal(nomes.includes(unidadePrincipalC.nome), false);
});

test('GET /gestor/api/unidades/:id bloqueia leitura fora do contexto ativo', async () => {
  const { agent, unidadePrincipalA, unidadePrincipalC } = await createContextualAgent();

  const allowedRes = await agent
    .get(`/gestor/api/unidades/${unidadePrincipalA._id}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(allowedRes.status, 200);
  const unidadePermitida = allowedRes.body?.data || allowedRes.body;
  assert.equal(String(unidadePermitida._id), String(unidadePrincipalA._id));

  const blockedRes = await agent
    .get(`/gestor/api/unidades/${unidadePrincipalC._id}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(blockedRes.status, 400);
});

test('GET /gestor/editar-unidades/:id bloqueia unidade fora do contexto ativo', async () => {
  const { agent, unidadePrincipalC } = await createContextualAgent();

  const res = await agent
    .get(`/gestor/editar-unidades/${unidadePrincipalC._id}`)
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 403);
  assert.match(res.text, /Acesso à unidade não autorizado/);
});