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
import { BankPort } from '../src/shared/ports/bank.port.js';
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

function buildUniqueEmail(prefix = 'unidades-write-context') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(30000000000 + id).slice(-11);
}

function buildValidCnpj() {
  const base = String(10000000 + nextSequence()).slice(-8);
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
    emailPrincipal: buildUniqueEmail('principal-unidade'),
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
    emailPrincipal: buildUniqueEmail('filial-unidade'),
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

function buildCreateSubunitPayload(overrides = {}) {
  return {
    nomeFantasia: `Filial Contextual ${nextSequence()}`,
    razaoSocial: `Filial Contextual LTDA ${nextSequence()}`,
    pessoaTipo: 'pj',
    principal: 'false',
    subunidade: 'true',
    emailPrincipal: buildUniqueEmail('create-subunit'),
    modulosAcessiveis: [],
    ...overrides,
  };
}

function buildUpdatePayload(unidade, overrides = {}) {
  return {
    nomeFantasia: overrides.nomeFantasia || `${unidade.nome || 'Unidade'} Atualizada`,
    razaoSocial: overrides.razaoSocial || `${unidade.nome || 'Unidade'} LTDA`,
    pessoaTipo: 'pj',
    cnpj: overrides.cnpj || unidade.cnpj || buildValidCnpj(),
    subunidade: overrides.subunidade ?? (unidade.subunidade ? 'true' : 'false'),
    unidadePrincipal: overrides.unidadePrincipal ?? (unidade.unidade_principal_id ? String(unidade.unidade_principal_id) : ''),
    emailPrincipal: overrides.emailPrincipal || unidade.emailPrincipal || buildUniqueEmail('update-unidade'),
    modulosAcessiveis: overrides.modulosAcessiveis || [],
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

async function createContextualDiretorAgent() {
  const unidadePrincipalA = await createPrincipalUnit(`Principal A ${nextSequence()}`);
  const unidadeFilialB = await createBranchUnit(`Filial B ${nextSequence()}`, unidadePrincipalA._id);
  const unidadePrincipalC = await createPrincipalUnit(`Principal C ${nextSequence()}`);
  const unidadeFilialC = await createBranchUnit(`Filial C ${nextSequence()}`, unidadePrincipalC._id);

  const user = await createUser({
    email: buildUniqueEmail('diretor-contextual-unidades'),
    nome: 'Diretor Contextual Unidades',
    role: 'diretor',
  });

  assert.equal(user.unidade_id, null);

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeFilialB._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-unidades-writes-misc-unit-scope-canonical-test',
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
    unidadeFilialC,
  };
}

test('POST /gestor/api/unidades usa a principal canônica do contexto e bloqueia principal fora do escopo', async () => {
  const { agent, unidadePrincipalA, unidadePrincipalC } = await createContextualDiretorAgent();

  const createRes = await agent
    .post('/gestor/api/unidades')
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send(buildCreateSubunitPayload());

  assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
  const createdId = String(createRes.body?.data?._id || createRes.body?.id || createRes.body?._id || '');
  assert.ok(createdId);

  const created = await Unidade.findById(createdId).lean();
  assert.ok(created);
  assert.equal(String(created.unidade_principal_id), String(unidadePrincipalA._id));

  const blockedRes = await agent
    .post('/gestor/api/unidades')
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send(buildCreateSubunitPayload({ unidadePrincipal: String(unidadePrincipalC._id) }));

  assert.equal(blockedRes.status, 400);
});

test('PUT /gestor/api/unidades/:id bloqueia update de unidade fora do contexto ativo', async () => {
  const { agent, unidadePrincipalC } = await createContextualDiretorAgent();

  const res = await agent
    .put(`/gestor/api/unidades/${unidadePrincipalC._id}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send(buildUpdatePayload(unidadePrincipalC));

  assert.equal(res.status, 400);
});

test('DELETE /gestor/api/unidades/:id bloqueia exclusão de unidade fora do contexto ativo', async () => {
  const { agent, unidadeFilialC } = await createContextualDiretorAgent();

  const res = await agent
    .delete(`/gestor/api/unidades/${unidadeFilialC._id}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 400);
});

test('GET /gestor/api/unidades/cluster respeita o unitScope ativo e não expõe cluster fora do contexto', async () => {
  const previousMultiDb = process.env.WD_MULTI_DB;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const previousHandshake = process.env.WD_USERDB_HANDSHAKE;

  try {
    const { agent, unidadePrincipalA, unidadeFilialB, unidadePrincipalC } = await createContextualDiretorAgent();

    process.env.WD_MULTI_DB = '1';
    process.env.WD_MULTI_DB_ALLOWLIST = [String(unidadePrincipalA._id), String(unidadeFilialB._id)].join(',');
    process.env.WD_USERDB_HANDSHAKE = '0';
    clearResolveConnectionCache();

    const tenantPrincipalName = `${unidadePrincipalA.nome} TENANT`;
    const tenantFilialName = `${unidadeFilialB.nome} TENANT`;

    await seedTenantUnitCluster(unidadeFilialB._id, [
      buildTenantUnitDoc(unidadeFilialB, { nome: tenantFilialName }),
    ]);

    await seedTenantUnitCluster(unidadePrincipalA._id, [
      buildTenantUnitDoc(unidadePrincipalA, { nome: tenantPrincipalName }),
      buildTenantUnitDoc(unidadeFilialB, { nome: tenantFilialName }),
    ]);

    const allowedRes = await agent
      .get('/gestor/api/unidades/cluster')
      .query({ unidade_id: String(unidadeFilialB._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(allowedRes.status, 200);
    const allowedNames = (allowedRes.body?.unidades || []).map((unidade) => unidade.nome).sort();
    assert.deepEqual(allowedNames, [tenantFilialName, tenantPrincipalName].sort());
    assert.equal(allowedNames.includes(unidadePrincipalA.nome), false);

    const blockedRes = await agent
      .get('/gestor/api/unidades/cluster')
      .query({ unidade_id: String(unidadePrincipalC._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(blockedRes.status, 200);
    assert.deepEqual(blockedRes.body?.unidades || [], []);
  } finally {
    clearResolveConnectionCache();

    if (previousMultiDb === undefined) delete process.env.WD_MULTI_DB;
    else process.env.WD_MULTI_DB = previousMultiDb;

    if (previousAllowlist === undefined) delete process.env.WD_MULTI_DB_ALLOWLIST;
    else process.env.WD_MULTI_DB_ALLOWLIST = previousAllowlist;

    if (previousHandshake === undefined) delete process.env.WD_USERDB_HANDSHAKE;
    else process.env.WD_USERDB_HANDSHAKE = previousHandshake;
  }
});

test('GET /gestor/api/unidades/:id/logo bloqueia leitura fora do contexto ativo', async () => {
  const { agent, unidadeFilialC } = await createContextualDiretorAgent();

  const res = await agent
    .get(`/gestor/api/unidades/${unidadeFilialC._id}/logo`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 400);
});

test('GET /gestor/api/unidades/:id/logo retorna binario de Data URL para unidade acessivel', async () => {
  const { agent, unidadeFilialB } = await createContextualDiretorAgent();
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Zr0YAAAAASUVORK5CYII=';

  await Unidade.updateOne(
    { _id: unidadeFilialB._id },
    { $set: { logo: dataUrl } },
  );

  const res = await agent
    .get(`/gestor/api/unidades/${unidadeFilialB._id}/logo`)
    .buffer(true)
    .parse((response, callback) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
      response.on('error', callback);
    })
    .set('Accept', 'image/png')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /^image\/png\b/i);
  assert.equal(Buffer.isBuffer(res.body), true);
  assert.ok(res.body.length > 0);
});

test('POST /gestor/api/unidades/toggle-access bloqueia diretor ao tentar alterar unidade principal acessivel no proprio cluster', async () => {
  const { agent, unidadePrincipalA } = await createContextualDiretorAgent();

  const before = await Unidade.findById(unidadePrincipalA._id).lean();
  assert.ok(before);
  const beforeIsActive = before?.is_active;
  const beforeAtiva = before?.ativa;

  const res = await agent
    .post('/gestor/api/unidades/toggle-access')
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send({ unitIds: [String(unidadePrincipalA._id)], activate: false });

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body?.success, false, JSON.stringify(res.body));
  assert.equal(res.body?.code, 'BAD_REQUEST', JSON.stringify(res.body));
  assert.equal(res.body?.message, 'Diretores não podem alterar o acesso de unidades principais.', JSON.stringify(res.body));

  const after = await Unidade.findById(unidadePrincipalA._id).lean();
  assert.ok(after);
  assert.equal(after?.is_active, beforeIsActive);
  assert.equal(after?.ativa, beforeAtiva);
});

test('POST /gestor/api/unidades/toggle-access permite ids do contexto ativo e bloqueia ids fora do cluster', async () => {
  const { agent, unidadeFilialB, unidadeFilialC } = await createContextualDiretorAgent();

  const allowedRes = await agent
    .post('/gestor/api/unidades/toggle-access')
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send({ unitIds: [String(unidadeFilialB._id)], activate: false });

  assert.equal(allowedRes.status, 200, JSON.stringify(allowedRes.body));
  assert.equal(allowedRes.body?.data?.newStatus ?? allowedRes.body?.newStatus, false);

  const blockedRes = await agent
    .post('/gestor/api/unidades/toggle-access')
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send({ unitIds: [String(unidadeFilialC._id)], activate: false });

  assert.equal(blockedRes.status, 400, JSON.stringify(blockedRes.body));
  assert.equal(blockedRes.body?.message || blockedRes.body?.error, 'Acesso à unidade não autorizado.');
});

test('POST /gestor/unidades/:id/testar-banco respeita o unitScope ativo e bloqueia unidade fora do contexto', async () => {
  const { agent, unidadeFilialB, unidadePrincipalC } = await createContextualDiretorAgent();

  await Unidade.updateOne(
    { _id: unidadeFilialB._id },
    {
      $set: {
        apiBancaria: {
          apiBaseUrl: 'https://bank.example.test',
          tipoAutenticacaoAPI: '',
        },
      },
    },
  );

  await Unidade.updateOne(
    { _id: unidadePrincipalC._id },
    {
      $set: {
        apiBancaria: {
          apiBaseUrl: 'https://bank.example.test',
          tipoAutenticacaoAPI: '',
        },
      },
    },
  );

  const originalCallBankApi = BankPort.callBankApi;
  const bankCalls = [];
  BankPort.callBankApi = async (unitId, payload) => {
    bankCalls.push({ unitId: String(unitId), payload });
    return { status: 'ok' };
  };

  try {
    const allowedRes = await agent
      .post(`/gestor/unidades/${unidadeFilialB._id}/testar-banco`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ method: 'GET', path: '/status' });

    assert.equal(allowedRes.status, 200, JSON.stringify(allowedRes.body));
    assert.equal(allowedRes.body?.ok, true);
    assert.equal(bankCalls.length, 1);
    assert.equal(bankCalls[0]?.unitId, String(unidadeFilialB._id));
    assert.equal(bankCalls[0]?.payload?.path, '/status');

    const blockedRes = await agent
      .post(`/gestor/unidades/${unidadePrincipalC._id}/testar-banco`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ method: 'GET', path: '/status' });

    assert.equal(blockedRes.status, 400, JSON.stringify(blockedRes.body));
    assert.equal(blockedRes.body?.ok, false);
    assert.equal(blockedRes.body?.message, 'Acesso à unidade não autorizado.');
    assert.equal(bankCalls.length, 1);
  } finally {
    BankPort.callBankApi = originalCallBankApi;
  }
});

test('POST /gestor/unidades/:id/testar-banco retorna 400 para unidade acessivel sem apiBaseUrl e nao chama integracoes bancarias', async () => {
  const { agent, unidadeFilialB } = await createContextualDiretorAgent();

  await Unidade.updateOne(
    { _id: unidadeFilialB._id },
    { $unset: { apiBancaria: 1 } },
  );

  const originalCallBankApi = BankPort.callBankApi;
  const originalGetOAuthTokenFromConfig = BankPort.getOAuthTokenFromConfig;
  let callBankApiCalled = false;
  let getOAuthTokenCalled = false;

  BankPort.callBankApi = async () => {
    callBankApiCalled = true;
    return { status: 'ok' };
  };

  BankPort.getOAuthTokenFromConfig = async () => {
    getOAuthTokenCalled = true;
    return 'token-preview';
  };

  try {
    const res = await agent
      .post(`/gestor/unidades/${unidadeFilialB._id}/testar-banco`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ method: 'GET', path: '/status' });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.ok, false);
    assert.equal(res.body?.message, 'Base URL da API bancária não configurada para esta unidade.');
    assert.equal(callBankApiCalled, false);
    assert.equal(getOAuthTokenCalled, false);
  } finally {
    BankPort.callBankApi = originalCallBankApi;
    BankPort.getOAuthTokenFromConfig = originalGetOAuthTokenFromConfig;
  }
});

test('POST /gestor/api/unidades/:id/provisioning/retry bloqueia unidade fora do contexto e nao executa retry', async () => {
  const { agent, unidadePrincipalC } = await createContextualDiretorAgent();
  const blockedUnitId = String(unidadePrincipalC._id);

  const snapshotBefore = await mongoose.connection.db.collection('unit_provisioning_status').findOne({
    unidadeId: blockedUnitId,
  });
  const eventsBefore = await mongoose.connection.db.collection('unit_provisioning_events')
    .find({ unidadeId: blockedUnitId })
    .toArray();

  const res = await agent
    .post(`/gestor/api/unidades/${blockedUnitId}/provisioning/retry`)
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send({ modulosRetry: ['clinica'] });

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body?.success, false);
  assert.match(String(res.body?.message || res.body?.error || ''), /acesso.*unidade.*autorizado/i);

  const snapshotAfter = await mongoose.connection.db.collection('unit_provisioning_status').findOne({
    unidadeId: blockedUnitId,
  });
  const eventsAfter = await mongoose.connection.db.collection('unit_provisioning_events')
    .find({ unidadeId: blockedUnitId })
    .toArray();

  assert.equal(snapshotBefore, null);
  assert.equal(snapshotAfter, null);
  assert.equal(eventsBefore.length, 0);
  assert.equal(eventsAfter.length, 0);
});

test('GET /gestor/api/unidades/:id/provisioning bloqueia leitura fora do contexto ativo sem expor snapshot', async () => {
  const { agent, unidadePrincipalC } = await createContextualDiretorAgent();
  const blockedUnitId = String(unidadePrincipalC._id);
  const expectedDbName = `wdgestor_unit_${blockedUnitId}`;

  await mongoose.connection.db.collection('unit_provisioning_status').insertOne({
    unidadeId: blockedUnitId,
    dbName: expectedDbName,
    tipo: 'principal',
    status: 'error',
    ready: false,
    lastProvisioningError: 'blocked_seed_error',
    modulosHabilitados: [],
    tenantBase: {
      model: 'unidade',
      unidadeId: blockedUnitId,
      dbName: expectedDbName,
    },
    tenantBaseModel: 'unidade',
    tenantBaseUnidadeId: blockedUnitId,
    tenantBaseDbName: expectedDbName,
    moduleStatuses: [{ moduleKey: 'gestor', status: 'error' }],
    snapshotVersion: 'unit-tenant-v1',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastProvisionedAt: new Date(),
  });

  const res = await agent
    .get(`/gestor/api/unidades/${blockedUnitId}/provisioning`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body?.success, false);
  assert.match(String(res.body?.message || res.body?.error || ''), /acesso.*unidade.*autorizado/i);
  assert.equal(Boolean(res.body?.data?.dbName), false);
  assert.equal(Boolean(res.body?.data?.tenantBase), false);
  assert.equal(Boolean(res.body?.data?.moduleStatuses), false);
});

test('GET /gestor/api/unidades/:id/provisioning/events bloqueia leitura fora do contexto ativo sem expor eventos', async () => {
  const { agent, unidadePrincipalC } = await createContextualDiretorAgent();
  const blockedUnitId = String(unidadePrincipalC._id);

  await mongoose.connection.db.collection('unit_provisioning_events').insertOne({
    unidadeId: blockedUnitId,
    dbName: `wdgestor_unit_${blockedUnitId}`,
    eventType: 'unit_retry_failed',
    scope: 'unit',
    status: 'error',
    message: 'evento fora do escopo',
    reason: 'blocked_seed_error',
    operation: 'retry_selective',
    metadata: { source: 'blocked-seed' },
    createdAt: new Date(),
  });

  const res = await agent
    .get(`/gestor/api/unidades/${blockedUnitId}/provisioning/events`)
    .query({ limit: 1 })
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body?.success, false);
  assert.match(String(res.body?.message || res.body?.error || ''), /acesso.*unidade.*autorizado/i);
  assert.equal(Boolean(res.body?.data?.events), false);
  assert.equal(Boolean(res.body?.data?.pagination), false);
  assert.equal(Boolean(res.body?.data?.filters), false);
});