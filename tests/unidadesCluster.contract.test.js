import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import { clearResolveConnectionCache } from '../src/shared/db/resolveConnection.js';
import { resolveModel } from '../src/shared/db/resolveModel.js';
import { createUnitScope } from '../src/shared/unitScope.js';
import { calcularDigitoVerificador } from '../src/modules/gestor/app/utils/cnpj.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';

process.env.NODE_ENV = 'test';
process.env.MONGO_MEMORY = '1';

const PASSWORD = 'Senha@123456';
const CLUSTER_ENDPOINT = '/gestor/api/unidades/cluster';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'unidades-cluster-contract') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(40000000000 + id).slice(-11);
}

function buildValidCnpj() {
  const base = String(20000000 + nextSequence()).slice(-8);
  const parcial = `${base}0001`;
  const dv1 = calcularDigitoVerificador(parcial, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calcularDigitoVerificador(`${parcial}${dv1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${parcial}${dv1}${dv2}`;
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

async function createPrincipalUnit(nome) {
  const moduloGestor = await ensureGestorModulo();
  return Unidade.create({
    nome,
    pessoaTipo: 'pj',
    cnpj: buildValidCnpj(),
    emailPrincipal: buildUniqueEmail('principal-cluster'),
    ativa: true,
    is_active: true,
    is_principal: true,
    subunidade: false,
    modulosAcessiveis: [moduloGestor._id],
  });
}

async function createBranchUnit(nome, principalUnitId) {
  const moduloGestor = await ensureGestorModulo();
  return Unidade.create({
    nome,
    pessoaTipo: 'pj',
    cnpj: buildValidCnpj(),
    emailPrincipal: buildUniqueEmail('filial-cluster'),
    ativa: true,
    is_active: true,
    is_principal: false,
    subunidade: true,
    unidade_principal_id: principalUnitId,
    modulosAcessiveis: [moduloGestor._id],
  });
}

function getTenantUnitModel(unidadeId) {
  return resolveModel({
    name: Unidade.modelName,
    schema: Unidade.schema,
    unitScope: createUnitScope({ unidadeId: String(unidadeId) }),
  });
}

function buildTenantUnitDoc(unidade, overrides = {}) {
  return {
    _id: unidade._id,
    codigo: unidade.codigo || String(unidade._id).slice(-6).toUpperCase(),
    nome: unidade.nome,
    pessoaTipo: unidade.pessoaTipo || 'pj',
    ativa: unidade.ativa !== undefined ? unidade.ativa : true,
    modulosAcessiveis: Array.isArray(unidade.modulosAcessiveis) ? unidade.modulosAcessiveis : [],
    is_principal: !!unidade.is_principal,
    subunidade: !!unidade.subunidade,
    unidade_principal_id: unidade.unidade_principal_id || undefined,
    matriz_id: unidade.matriz_id || undefined,
    ...overrides,
  };
}

async function seedTenantUnitCluster(unidadeId, unidades) {
  const UnidadeTenantModel = getTenantUnitModel(unidadeId);
  await UnidadeTenantModel.deleteMany({});
  await UnidadeTenantModel.insertMany(unidades);
}

async function createUser({ email, nome, role, unidadeId = null }) {
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

async function createContextualDiretorAgent() {
  const unidadePrincipalA = await createPrincipalUnit(`Principal Cluster A ${nextSequence()}`);
  const unidadeFilialB = await createBranchUnit(`Filial Cluster B ${nextSequence()}`, unidadePrincipalA._id);
  const unidadePrincipalC = await createPrincipalUnit(`Principal Cluster C ${nextSequence()}`);

  const user = await createUser({
    email: buildUniqueEmail('diretor-cluster'),
    nome: 'Diretor Cluster Contextual',
    role: 'diretor',
    unidadeId: unidadePrincipalC._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeFilialB._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'unidades-cluster-contract-test',
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

async function withTenantClusterEnv(allowlist, run) {
  const previousMultiDb = process.env.WD_MULTI_DB;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const previousHandshake = process.env.WD_USERDB_HANDSHAKE;

  try {
    process.env.WD_MULTI_DB = '1';
    process.env.WD_MULTI_DB_ALLOWLIST = allowlist.join(',');
    process.env.WD_USERDB_HANDSHAKE = '0';
    clearResolveConnectionCache();
    return await run();
  } finally {
    clearResolveConnectionCache();

    if (previousMultiDb === undefined) delete process.env.WD_MULTI_DB;
    else process.env.WD_MULTI_DB = previousMultiDb;

    if (previousAllowlist === undefined) delete process.env.WD_MULTI_DB_ALLOWLIST;
    else process.env.WD_MULTI_DB_ALLOWLIST = previousAllowlist;

    if (previousHandshake === undefined) delete process.env.WD_USERDB_HANDSHAKE;
    else process.env.WD_USERDB_HANDSHAKE = previousHandshake;
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

test('GET /gestor/api/unidades/cluster retorna 401 sem sessão', async () => {
  const unidadeId = new mongoose.Types.ObjectId();

  const res = await request(app)
    .get(CLUSTER_ENDPOINT)
    .query({ unidade_id: String(unidadeId) })
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('GET /gestor/api/unidades/cluster retorna 400 com unidade_id ausente', async () => {
  const { agent } = await createContextualDiretorAgent();

  const res = await agent
    .get(CLUSTER_ENDPOINT)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, {
    ok: false,
    error: 'Parametro unidade_id ausente',
    success: false,
  });
});

test('GET /gestor/api/unidades/cluster retorna 200 dentro do contexto ativo com ok, total e unidades no topo', async () => {
  const { agent, unidadePrincipalA, unidadeFilialB } = await createContextualDiretorAgent();

  await withTenantClusterEnv([String(unidadePrincipalA._id), String(unidadeFilialB._id)], async () => {
    const tenantPrincipalName = `${unidadePrincipalA.nome} TENANT`;
    const tenantFilialName = `${unidadeFilialB.nome} TENANT`;

    await seedTenantUnitCluster(unidadeFilialB._id, [
      buildTenantUnitDoc(unidadeFilialB, { nome: tenantFilialName }),
    ]);

    await seedTenantUnitCluster(unidadePrincipalA._id, [
      buildTenantUnitDoc(unidadePrincipalA, { nome: tenantPrincipalName }),
      buildTenantUnitDoc(unidadeFilialB, { nome: tenantFilialName }),
    ]);

    const res = await agent
      .get(CLUSTER_ENDPOINT)
      .query({ unidade_id: String(unidadeFilialB._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.ok, true, JSON.stringify(res.body));
    assert.equal(res.body?.total, 2, JSON.stringify(res.body));
    assert.equal(Array.isArray(res.body?.unidades), true, JSON.stringify(res.body));
    assert.equal('data' in (res.body || {}), false, JSON.stringify(res.body));

    const unidades = res.body?.unidades || [];
    const nomes = unidades.map((unidade) => unidade.nome).sort();
    assert.deepEqual(nomes, [tenantFilialName, tenantPrincipalName].sort());
    assert.equal(unidades.every((unidade) => 'id' in unidade), true, JSON.stringify(unidades));
    assert.equal(unidades.some((unidade) => '_id' in unidade), false, JSON.stringify(unidades));
  });
});

test('GET /gestor/api/unidades/cluster retorna 200 fora do contexto ativo com lista vazia', async () => {
  const { agent, unidadePrincipalA, unidadeFilialB, unidadePrincipalC } = await createContextualDiretorAgent();

  await withTenantClusterEnv([String(unidadePrincipalA._id), String(unidadeFilialB._id)], async () => {
    const tenantPrincipalName = `${unidadePrincipalA.nome} TENANT`;
    const tenantFilialName = `${unidadeFilialB.nome} TENANT`;

    await seedTenantUnitCluster(unidadeFilialB._id, [
      buildTenantUnitDoc(unidadeFilialB, { nome: tenantFilialName }),
    ]);

    await seedTenantUnitCluster(unidadePrincipalA._id, [
      buildTenantUnitDoc(unidadePrincipalA, { nome: tenantPrincipalName }),
      buildTenantUnitDoc(unidadeFilialB, { nome: tenantFilialName }),
    ]);

    const res = await agent
      .get(CLUSTER_ENDPOINT)
      .query({ unidade_id: String(unidadePrincipalC._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, {
      ok: true,
      total: 0,
      unidades: [],
    });
  });
});