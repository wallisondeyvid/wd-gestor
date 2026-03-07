import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import { resolveConnection } from '../src/shared/db/resolveConnection.js';
import { createUnitScope } from '../src/shared/unitScope.js';
import User from '../src/core/models/user.js';
import Unidade from '../src/core/models/unidade.js';
import Modulo from '../src/core/models/modulo.js';

process.env.NODE_ENV = 'test';
process.env.MONGO_MEMORY = '1';

const GLOBAL_STATUS_COLLECTION = 'unit_provisioning_status';
const GLOBAL_EVENTS_COLLECTION = 'unit_provisioning_events';
const CLINICA_DOMAIN_COLLECTION = 'clinica_cadastros';
const CLINICA_EXPECTED_CADASTRO_KEYS = Object.freeze([
  'empresas',
  'pacientes',
  'planos',
  'procedimentos',
  'profissionais',
]);
const CLINICA_EXPECTED_PAYLOAD_BY_KEY = Object.freeze({
  empresas: {
    entity: 'empresa',
    displayOrder: 10,
    primaryIdentifier: 'cnpj',
    searchFields: ['razaoSocial', 'nomeFantasia', 'cnpj'],
  },
  pacientes: {
    entity: 'paciente',
    displayOrder: 20,
    primaryIdentifier: 'cpf',
    searchFields: ['nome', 'cpf', 'telefone'],
  },
  profissionais: {
    entity: 'profissional',
    displayOrder: 30,
    primaryIdentifier: 'registroConselho',
    searchFields: ['nome', 'cpf', 'registroConselho'],
  },
  planos: {
    entity: 'plano',
    displayOrder: 40,
    primaryIdentifier: 'codigoPlano',
    searchFields: ['nome', 'codigoPlano', 'convenio'],
  },
  procedimentos: {
    entity: 'procedimento',
    displayOrder: 50,
    primaryIdentifier: 'codigo',
    searchFields: ['descricao', 'codigo', 'tipo'],
  },
});
const ESCALAS_DOMAIN_COLLECTION = 'escalas_cadastros';
const ESCALAS_EXPECTED_CADASTRO_KEYS = Object.freeze([
  'acoes_log_escala',
  'classificacoes_escala',
  'contextos_log_escala',
  'modelo_schema_escala',
  'status_escala',
  'tipos_refeicao',
]);

const MODULE_SEEDS = Object.freeze({
  condominio: { nome: 'Gestao de Condominio', url_base: '/condominios', status: 'ativo' },
  clinica: { nome: 'Clinica', url_base: '/clinica', status: 'ativo' },
  escalas: { nome: 'Escalas', url_base: '/escalas', status: 'ativo' },
});

let app;
let closeServer;
let agent;
let authEmail = '';

function mapStatusesByModuleKey(moduleStatuses) {
  const statuses = Array.isArray(moduleStatuses) ? moduleStatuses : [];
  const map = new Map();

  for (const item of statuses) {
    const moduleKey = String(item?.moduleKey || '').trim();
    if (!moduleKey) continue;
    map.set(moduleKey, item);
  }

  return map;
}

function retryRequest(unidadeId) {
  return agent
    .post(`/gestor/api/unidades/${unidadeId}/provisioning/retry`)
    .set('Accept', 'application/json');
}

function provisioningStatusRequest(unidadeId) {
  return agent
    .get(`/gestor/api/unidades/${unidadeId}/provisioning`)
    .set('Accept', 'application/json');
}

function provisioningEventsRequest(unidadeId) {
  return agent
    .get(`/gestor/api/unidades/${unidadeId}/provisioning/events`)
    .set('Accept', 'application/json');
}

function buildExpectedNextBefore(events = []) {
  if (!Array.isArray(events) || events.length === 0) return null;

  const last = events[events.length - 1] || {};
  const createdAt = last?.createdAt ? new Date(last.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null;

  const eventId = String(last?.eventId || '').trim().toLowerCase();
  if (!eventId) return createdAt.toISOString();

  return `${createdAt.toISOString()}|${eventId}`;
}

function assertEventsSortedByNewestFirst(events) {
  assert.ok(Array.isArray(events));

  for (let idx = 1; idx < events.length; idx += 1) {
    const previous = events[idx - 1] || {};
    const current = events[idx] || {};

    const previousTimestamp = previous?.createdAt ? new Date(previous.createdAt).getTime() : Number.NaN;
    const currentTimestamp = current?.createdAt ? new Date(current.createdAt).getTime() : Number.NaN;
    assert.ok(Number.isFinite(previousTimestamp), `createdAt invalido no evento anterior (indice ${idx - 1})`);
    assert.ok(Number.isFinite(currentTimestamp), `createdAt invalido no evento atual (indice ${idx})`);

    if (previousTimestamp === currentTimestamp) {
      const previousEventId = String(previous?.eventId || '').trim().toLowerCase();
      const currentEventId = String(current?.eventId || '').trim().toLowerCase();
      assert.ok(previousEventId >= currentEventId, 'ordem secundaria por eventId deve ser decrescente');
      continue;
    }

    assert.ok(previousTimestamp > currentTimestamp, 'eventos devem ser ordenados do mais novo para o mais antigo');
  }
}

async function readClinicaDomainCadastros(unidadeId) {
  const connection = resolveConnection(createUnitScope({ unidadeId }));
  return connection.collection(CLINICA_DOMAIN_COLLECTION)
    .find({}, { projection: { _id: 0, key: 1, module: 1, label: 1, path: 1, payload: 1, active: 1, source: 1, schemaVersion: 1 } })
    .sort({ key: 1 })
    .toArray();
}

async function readEscalasDomainCadastros(unidadeId) {
  const connection = resolveConnection(createUnitScope({ unidadeId }));
  return connection.collection(ESCALAS_DOMAIN_COLLECTION)
    .find({}, { projection: { _id: 0, key: 1, module: 1, label: 1, payload: 1, active: 1, source: 1, schemaVersion: 1 } })
    .sort({ key: 1 })
    .toArray();
}

async function readProvisioningAuditEvents(unidadeId) {
  if (!mongoose.connection?.db) return [];

  return mongoose.connection.db.collection(GLOBAL_EVENTS_COLLECTION)
    .find(
      { unidadeId: String(unidadeId) },
      {
        projection: {
          _id: 0,
          unidadeId: 1,
          dbName: 1,
          eventType: 1,
          scope: 1,
          moduleKey: 1,
          status: 1,
          message: 1,
          reason: 1,
          operation: 1,
          metadata: 1,
          createdAt: 1,
        },
      }
    )
    .sort({ createdAt: 1 })
    .toArray();
}

async function readProvisioningStatusSnapshot(unidadeId) {
  if (!mongoose.connection?.db) return null;

  return mongoose.connection.db.collection(GLOBAL_STATUS_COLLECTION)
    .findOne(
      { unidadeId: String(unidadeId) },
      {
        projection: {
          _id: 0,
          unidadeId: 1,
          dbName: 1,
          status: 1,
          ready: 1,
          lastProvisioningError: 1,
          modulosHabilitados: 1,
          tenantBase: 1,
          moduleStatuses: 1,
          snapshotVersion: 1,
          updatedAt: 1,
          lastProvisionedAt: 1,
        },
      }
    );
}

async function authenticateMasterAgent() {
  const email = `retry.provisioning.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);
  const cpf = String(Date.now()).slice(-11).padStart(11, '0');

  await User.create({
    email,
    senha: senhaHash,
    cpf,
    role: 'master',
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: 'Teste Retry Provisioning',
  });

  const localAgent = request.agent(app);
  const loginRes = await localAgent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(
    loginRes.status >= 300 && loginRes.status < 400,
    `Login master deve redirecionar, recebido ${loginRes.status}`
  );

  authEmail = email;
  return localAgent;
}

async function clearProvisioningFixtures() {
  if (!mongoose.connection?.db) return;

  await Promise.all([
    mongoose.connection.db.collection(GLOBAL_STATUS_COLLECTION).deleteMany({}),
    mongoose.connection.db.collection(GLOBAL_EVENTS_COLLECTION).deleteMany({}),
    Unidade.deleteMany({}),
    Modulo.deleteMany({}),
  ]);
}

async function seedRetryFixture({
  enabledModuleKeys = ['condominio', 'clinica'],
  condominioReason = 'seed_condominio_error',
} = {}) {
  const moduleDocsByKey = {};

  for (const [moduleKey, seed] of Object.entries(MODULE_SEEDS)) {
    moduleDocsByKey[moduleKey] = await Modulo.create({
      nome: seed.nome,
      url_base: seed.url_base,
      status: seed.status,
    });
  }

  const modulosAcessiveis = enabledModuleKeys.map((moduleKey) => {
    const moduleDoc = moduleDocsByKey[moduleKey];
    assert.ok(moduleDoc, `Modulo fixture ausente para chave ${moduleKey}`);
    return moduleDoc._id;
  });

  const unidade = await Unidade.create({
    nome: `Unidade Retry ${Date.now()}`,
    pessoaTipo: 'pj',
    is_principal: true,
    modulosAcessiveis,
  });

  const unidadeId = String(unidade._id);
  const dbName = `wdgestor_unit_${unidadeId}`;
  const now = new Date();

  const moduleStatuses = enabledModuleKeys.map((moduleKey) => ({
    moduleKey,
    moduleLabel: MODULE_SEEDS[moduleKey].nome,
    requestedModule: String(moduleDocsByKey[moduleKey]._id),
    status: 'error',
    ready: false,
    reason: moduleKey === 'condominio' ? condominioReason : `seed_${moduleKey}_error`,
    source: 'seed_fixture',
    lastBootstrapAt: now,
  }));

  await mongoose.connection.db.collection(GLOBAL_STATUS_COLLECTION).insertOne({
    unidadeId,
    dbName,
    tipo: 'principal',
    status: 'error',
    ready: false,
    lastProvisioningError: 'seed_fixture_error',
    modulosHabilitados: enabledModuleKeys.map((moduleKey) => String(moduleDocsByKey[moduleKey]._id)),
    tenantBase: {
      model: 'unidade',
      unidadeId,
      dbName,
    },
    tenantBaseModel: 'unidade',
    tenantBaseUnidadeId: unidadeId,
    tenantBaseDbName: dbName,
    moduleStatuses,
    snapshotVersion: 'unit-tenant-v1',
    createdAt: now,
    updatedAt: now,
    lastProvisionedAt: now,
  });

  return {
    unidadeId,
    moduleDocsByKey,
    moduleStatusesByKey: mapStatusesByModuleKey(moduleStatuses),
  };
}

before(async () => {
  const built = await createServer({ skipDb: false });
  app = built.app;
  closeServer = built.close;
  agent = await authenticateMasterAgent();
});

after(async () => {
  try {
    await clearProvisioningFixtures();
  } catch {}

  try {
    if (authEmail) {
      await User.deleteMany({ email: authEmail });
    }
  } catch {}

  try {
    if (typeof closeServer === 'function') {
      await closeServer({ stopMemoryServer: true });
    } else {
      await disconnectMongo({ stopMemoryServer: true });
    }
  } catch {}
});

test('retry seletivo valido para modulo habilitado retorna 200 e atualiza moduleStatuses do alvo', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture();

  const res = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['clinica'] });

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.data?.mode, 'selective');
  assert.deepEqual(res.body?.data?.request?.modulosRetryKeys, ['clinica']);

  const statuses = mapStatusesByModuleKey(res.body?.data?.snapshot?.moduleStatuses);
  assert.equal(statuses.get('clinica')?.status, 'ready');
  assert.equal(statuses.get('condominio')?.status, 'error');
  assert.equal(statuses.get('condominio')?.reason, fixture.moduleStatusesByKey.get('condominio')?.reason);
});

test('retry seletivo com modulo nao habilitado retorna 400', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture();
  const snapshotBefore = await readProvisioningStatusSnapshot(fixture.unidadeId);

  const res = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['escalas'] });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.match(String(res.body?.message || ''), /nao habilitado/i);

  const snapshotAfter = await readProvisioningStatusSnapshot(fixture.unidadeId);
  assert.ok(snapshotBefore, 'snapshot inicial deve existir');
  assert.ok(snapshotAfter, 'snapshot apos falha de validacao deve continuar existindo');
  assert.deepEqual(snapshotAfter?.moduleStatuses || [], snapshotBefore?.moduleStatuses || []);
  assert.equal(snapshotAfter?.snapshotVersion, snapshotBefore?.snapshotVersion);
  assert.equal(
    snapshotAfter?.updatedAt ? snapshotAfter.updatedAt.toISOString() : null,
    snapshotBefore?.updatedAt ? snapshotBefore.updatedAt.toISOString() : null
  );

  const auditEvents = await readProvisioningAuditEvents(fixture.unidadeId);
  assert.ok(
    auditEvents.some((eventDoc) => (
      eventDoc?.eventType === 'unit_retry_failed'
      && eventDoc?.operation === 'retry_selective'
      && eventDoc?.reason === 'validation_error'
    )),
    'deve registrar evento de falha de validacao no retry seletivo'
  );
});

test('inspect de provisioning preserva contrato canonico de tenant-base, dbName e snapshot atual', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture();

  const res = await provisioningStatusRequest(fixture.unidadeId);

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);

  const data = res.body?.data || {};
  const expectedDbName = `wdgestor_unit_${fixture.unidadeId}`;

  assert.equal(String(data?.unidadeId || ''), String(fixture.unidadeId));
  assert.equal(data?.dbName, expectedDbName);
  assert.equal(data?.snapshotVersion, 'unit-tenant-v1');

  assert.equal(data?.tenantBase?.model, 'unidade');
  assert.equal(String(data?.tenantBase?.unidadeId || ''), String(fixture.unidadeId));
  assert.equal(data?.tenantBase?.dbName, expectedDbName);

  assert.equal(typeof data?.status, 'string');
  assert.equal(typeof data?.ready, 'boolean');
  assert.equal(typeof data?.globalStatus, 'object');
  assert.equal(data?.globalStatus?.status, data?.status);
  assert.equal(data?.globalStatus?.ready, data?.ready);
  assert.equal(data?.globalStatus?.lastProvisioningError, data?.lastProvisioningError);
  assert.ok(data?.inspectedAt);

  assert.ok(Array.isArray(data?.modulosHabilitados));
  assert.ok(data.modulosHabilitados.length > 0);
  assert.ok(Array.isArray(data?.modulosHabilitadosDisplay));
  assert.ok(data.modulosHabilitadosDisplay.length > 0);

  assert.ok(Array.isArray(data?.moduleStatuses));
  const statuses = mapStatusesByModuleKey(data.moduleStatuses);
  assert.equal(statuses.size, fixture.moduleStatusesByKey.size);
  assert.ok(statuses.has('condominio'));
  assert.ok(statuses.has('clinica'));
  assert.ok(
    data.moduleStatuses.every((entry) => !Object.prototype.hasOwnProperty.call(entry || {}, 'eventType')),
    'snapshot de moduleStatuses nao deve misturar shape de eventos historicos'
  );
  assert.ok(
    data.moduleStatuses.every((entry) => !Object.prototype.hasOwnProperty.call(entry || {}, 'operation')),
    'snapshot de moduleStatuses nao deve carregar operacao de auditoria'
  );
});

test('moduleStatuses segue snapshot atual enquanto unit_provisioning_events guarda historico acumulado', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture();

  const retry1 = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['clinica'] });
  assert.equal(retry1.status, 200);
  assert.equal(retry1.body?.success, true);

  const retry2 = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['clinica'] });
  assert.equal(retry2.status, 200);
  assert.equal(retry2.body?.success, true);

  const inspectRes = await provisioningStatusRequest(fixture.unidadeId);
  assert.equal(inspectRes.status, 200);
  assert.equal(inspectRes.body?.success, true);

  const snapshotStatuses = inspectRes.body?.data?.moduleStatuses || [];
  const snapshotStatusMap = mapStatusesByModuleKey(snapshotStatuses);
  assert.equal(snapshotStatusMap.size, fixture.moduleStatusesByKey.size);
  assert.equal(snapshotStatusMap.get('clinica')?.status, 'ready');
  assert.equal(snapshotStatusMap.get('condominio')?.status, 'error');

  const auditEvents = await readProvisioningAuditEvents(fixture.unidadeId);
  assert.ok(
    auditEvents.length > snapshotStatuses.length,
    'trilha historica deve acumular mais registros do que o snapshot atual de modulos'
  );
  const selectiveSuccessEvents = auditEvents.filter(
    (eventDoc) => eventDoc?.eventType === 'unit_retry_succeeded' && eventDoc?.operation === 'retry_selective'
  );
  assert.ok(selectiveSuccessEvents.length >= 2, 'historico deve manter retries seletivos sucessivos');
});

test('retry seletivo com modulo desconhecido retorna 400', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture();

  const res = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['modulo-inexistente'] });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.match(String(res.body?.message || ''), /invalidos/i);
});

test('retry seletivo por query preserva estado de modulos nao alvo', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture({ condominioReason: 'nao_alterar_condominio' });

  const res = await retryRequest(fixture.unidadeId)
    .query({ modulo: 'clinica' });

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.data?.mode, 'selective');

  const statuses = mapStatusesByModuleKey(res.body?.data?.snapshot?.moduleStatuses);
  assert.equal(statuses.get('clinica')?.status, 'ready');
  assert.equal(statuses.get('condominio')?.status, 'error');
  assert.equal(statuses.get('condominio')?.reason, 'nao_alterar_condominio');
});

test('retry global legado sem modulosRetry continua funcionando e reprocessa modulos habilitados', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture();

  const res = await retryRequest(fixture.unidadeId).send({});

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.notEqual(res.body?.data?.mode, 'selective');

  const statuses = mapStatusesByModuleKey(res.body?.data?.snapshot?.moduleStatuses);
  assert.equal(statuses.get('clinica')?.status, 'ready');
  assert.equal(statuses.get('condominio')?.status, 'ready');

  const requestPayload = res.body?.data?.request;
  assert.ok(Array.isArray(requestPayload?.modulosHabilitados));
  assert.equal(requestPayload.modulosHabilitados.length, 2);

  const auditEvents = await readProvisioningAuditEvents(fixture.unidadeId);
  assert.ok(
    auditEvents.some((eventDoc) => (
      eventDoc?.eventType === 'unit_retry_started'
      && eventDoc?.operation === 'retry_global'
      && eventDoc?.status === 'started'
    )),
    'deve registrar inicio de retry global'
  );
  assert.ok(
    auditEvents.some((eventDoc) => (
      eventDoc?.eventType === 'unit_retry_succeeded'
      && eventDoc?.operation === 'retry_global'
      && eventDoc?.status === 'success'
    )),
    'deve registrar sucesso de retry global'
  );
  assert.ok(
    auditEvents.some((eventDoc) => (
      eventDoc?.eventType === 'module_bootstrap_succeeded'
      && eventDoc?.scope === 'module'
      && eventDoc?.moduleKey === 'condominio'
    )),
    'deve registrar bootstrap de modulo condominio no fluxo global'
  );
  assert.ok(
    auditEvents.some((eventDoc) => (
      eventDoc?.eventType === 'module_bootstrap_succeeded'
      && eventDoc?.scope === 'module'
      && eventDoc?.moduleKey === 'clinica'
    )),
    'deve registrar bootstrap de modulo clinica no fluxo global'
  );
});

test('endpoint administrativo de trilha de provisioning suporta filtros adicionais e paginacao simples', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture({ enabledModuleKeys: ['condominio', 'escalas'] });

  const selectiveRetry1 = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['escalas'] });
  assert.equal(selectiveRetry1.status, 200);
  assert.equal(selectiveRetry1.body?.success, true);

  const selectiveRetry2 = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['escalas'] });
  assert.equal(selectiveRetry2.status, 200);
  assert.equal(selectiveRetry2.body?.success, true);

  const listLimited = await provisioningEventsRequest(fixture.unidadeId)
    .query({ limit: 4 });

  assert.equal(listLimited.status, 200);
  assert.equal(listLimited.body?.success, true);
  assert.equal(String(listLimited.body?.data?.unidadeId || ''), String(fixture.unidadeId));
  assert.equal(listLimited.body?.data?.filters?.limit, 4);
  assert.ok(Array.isArray(listLimited.body?.data?.events));
  assert.ok(listLimited.body.data.events.length <= 4);
  assert.ok(listLimited.body.data.events.every((eventDoc) => String(eventDoc?.unidadeId || '') === String(fixture.unidadeId)));
  assert.equal(typeof listLimited.body?.data?.pagination?.hasMore, 'boolean');
  assert.equal(listLimited.body?.data?.pagination?.hasMore, true);
  assert.equal(typeof listLimited.body?.data?.pagination?.nextBefore, 'string');

  const firstPageEvents = Array.isArray(listLimited.body?.data?.events) ? listLimited.body.data.events : [];
  const firstPageEventIds = new Set(firstPageEvents.map((eventDoc) => String(eventDoc?.eventId || '')));
  assert.ok(firstPageEvents.every((eventDoc) => String(eventDoc?.eventId || '').length > 0));
  assertEventsSortedByNewestFirst(firstPageEvents);
  assert.equal(
    listLimited.body?.data?.pagination?.nextBefore,
    buildExpectedNextBefore(firstPageEvents)
  );

  const listSecondPage = await provisioningEventsRequest(fixture.unidadeId)
    .query({ limit: 4, before: listLimited.body?.data?.pagination?.nextBefore });

  assert.equal(listSecondPage.status, 200);
  assert.equal(listSecondPage.body?.success, true);
  assert.equal(listSecondPage.body?.data?.filters?.limit, 4);
  assert.equal(typeof listSecondPage.body?.data?.filters?.before, 'string');
  assert.ok(Array.isArray(listSecondPage.body?.data?.events));
  assert.ok(listSecondPage.body.data.events.length > 0);

  const secondPageEvents = listSecondPage.body.data.events;
  assertEventsSortedByNewestFirst(secondPageEvents);
  assert.ok(
    secondPageEvents.every((eventDoc) => !firstPageEventIds.has(String(eventDoc?.eventId || ''))),
    'paginacao por cursor nao deve repetir eventos da pagina anterior'
  );

  const firstPageOldest = firstPageEvents[firstPageEvents.length - 1] || null;
  const secondPageNewest = secondPageEvents[0] || null;
  if (firstPageOldest && secondPageNewest) {
    const firstPageOldestTimestamp = firstPageOldest?.createdAt
      ? new Date(firstPageOldest.createdAt).getTime()
      : Number.NaN;
    const secondPageNewestTimestamp = secondPageNewest?.createdAt
      ? new Date(secondPageNewest.createdAt).getTime()
      : Number.NaN;

    assert.ok(Number.isFinite(firstPageOldestTimestamp));
    assert.ok(Number.isFinite(secondPageNewestTimestamp));

    if (secondPageNewestTimestamp === firstPageOldestTimestamp) {
      assert.ok(
        String(secondPageNewest?.eventId || '').trim().toLowerCase()
          < String(firstPageOldest?.eventId || '').trim().toLowerCase(),
        'cursor por eventId deve manter janela consistente quando createdAt empata'
      );
    } else {
      assert.ok(
        secondPageNewestTimestamp < firstPageOldestTimestamp,
        'segunda pagina deve conter apenas eventos mais antigos que a borda da primeira'
      );
    }
  }

  const listModuleScope = await provisioningEventsRequest(fixture.unidadeId)
    .query({ scope: 'module' });

  assert.equal(listModuleScope.status, 200);
  assert.equal(listModuleScope.body?.success, true);
  assert.equal(listModuleScope.body?.data?.filters?.scope, 'module');
  assert.ok(Array.isArray(listModuleScope.body?.data?.events));
  assert.ok(listModuleScope.body.data.events.length > 0);
  assert.ok(listModuleScope.body.data.events.every((eventDoc) => eventDoc?.scope === 'module'));

  const listByModuleKey = await provisioningEventsRequest(fixture.unidadeId)
    .query({ scope: 'module', moduleKey: 'Escalas' });

  assert.equal(listByModuleKey.status, 200);
  assert.equal(listByModuleKey.body?.success, true);
  assert.equal(listByModuleKey.body?.data?.filters?.scope, 'module');
  assert.equal(listByModuleKey.body?.data?.filters?.moduleKey, 'Escalas');
  assert.ok(Array.isArray(listByModuleKey.body?.data?.events));
  assert.ok(listByModuleKey.body.data.events.length > 0);
  assert.ok(listByModuleKey.body.data.events.every((eventDoc) => eventDoc?.moduleKey === 'escalas'));

  const listByOperation = await provisioningEventsRequest(fixture.unidadeId)
    .query({ operation: 'RETRY_SELECTIVE' });

  assert.equal(listByOperation.status, 200);
  assert.equal(listByOperation.body?.success, true);
  assert.equal(listByOperation.body?.data?.filters?.operation, 'retry_selective');
  assert.ok(Array.isArray(listByOperation.body?.data?.events));
  assert.ok(listByOperation.body.data.events.length > 0);
  assert.ok(listByOperation.body.data.events.every((eventDoc) => eventDoc?.operation === 'retry_selective'));

  const listByStatus = await provisioningEventsRequest(fixture.unidadeId)
    .query({ status: 'SUCCESS' });

  assert.equal(listByStatus.status, 200);
  assert.equal(listByStatus.body?.success, true);
  assert.equal(listByStatus.body?.data?.filters?.status, 'success');
  assert.ok(Array.isArray(listByStatus.body?.data?.events));
  assert.ok(listByStatus.body.data.events.length > 0);
  assert.ok(listByStatus.body.data.events.every((eventDoc) => eventDoc?.status === 'success'));

  const invalidScope = await provisioningEventsRequest(fixture.unidadeId)
    .query({ scope: 'foo' });

  assert.equal(invalidScope.status, 400);
  assert.equal(invalidScope.body?.success, false);
  assert.match(String(invalidScope.body?.message || ''), /scope invalido/i);

  const invalidStatus = await provisioningEventsRequest(fixture.unidadeId)
    .query({ status: 'foo' });

  assert.equal(invalidStatus.status, 400);
  assert.equal(invalidStatus.body?.success, false);
  assert.match(String(invalidStatus.body?.message || ''), /status invalido/i);

  const invalidBefore = await provisioningEventsRequest(fixture.unidadeId)
    .query({ before: 'nao-e-data' });

  assert.equal(invalidBefore.status, 400);
  assert.equal(invalidBefore.body?.success, false);
  assert.match(String(invalidBefore.body?.message || ''), /before invalido/i);
});

test('retry seletivo de clinica provisiona estrutura minima de dominio real com idempotencia', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture();

  const firstRetry = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['clinica'] });
  assert.equal(firstRetry.status, 200);
  assert.equal(firstRetry.body?.success, true);

  const executed = firstRetry.body?.data?.provisioningResult?.moduleBootstrap?.executed;
  assert.ok(Array.isArray(executed));
  assert.equal(executed[0]?.module, 'clinica');
  assert.equal(executed[0]?.domainCollection, CLINICA_DOMAIN_COLLECTION);
  assert.deepEqual(
    [...(executed[0]?.domainSeededKeys || [])].sort(),
    [...CLINICA_EXPECTED_CADASTRO_KEYS].sort()
  );

  const firstCadastros = await readClinicaDomainCadastros(fixture.unidadeId);
  assert.equal(firstCadastros.length, CLINICA_EXPECTED_CADASTRO_KEYS.length);
  assert.deepEqual(firstCadastros.map((item) => item.key), CLINICA_EXPECTED_CADASTRO_KEYS);
  assert.ok(firstCadastros.every((item) => item.module === 'clinica'));
  assert.ok(firstCadastros.every((item) => item.active === true));
  assert.ok(firstCadastros.every((item) => item.source === 'bootstrap_clinica_v1'));
  assert.ok(firstCadastros.every((item) => item.schemaVersion === 1));

  const payloadByKey = new Map(firstCadastros.map((item) => [item.key, item.payload || null]));
  assert.deepEqual(payloadByKey.get('empresas'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.empresas);
  assert.deepEqual(payloadByKey.get('pacientes'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.pacientes);
  assert.deepEqual(payloadByKey.get('profissionais'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.profissionais);
  assert.deepEqual(payloadByKey.get('planos'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.planos);
  assert.deepEqual(payloadByKey.get('procedimentos'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.procedimentos);

  const secondRetry = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['clinica'] });
  assert.equal(secondRetry.status, 200);
  assert.equal(secondRetry.body?.success, true);

  const secondCadastros = await readClinicaDomainCadastros(fixture.unidadeId);
  assert.equal(secondCadastros.length, CLINICA_EXPECTED_CADASTRO_KEYS.length);
  assert.deepEqual(secondCadastros.map((item) => item.key), CLINICA_EXPECTED_CADASTRO_KEYS);

  const secondPayloadByKey = new Map(secondCadastros.map((item) => [item.key, item.payload || null]));
  assert.deepEqual(secondPayloadByKey.get('empresas'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.empresas);
  assert.deepEqual(secondPayloadByKey.get('pacientes'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.pacientes);
  assert.deepEqual(secondPayloadByKey.get('profissionais'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.profissionais);
  assert.deepEqual(secondPayloadByKey.get('planos'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.planos);
  assert.deepEqual(secondPayloadByKey.get('procedimentos'), CLINICA_EXPECTED_PAYLOAD_BY_KEY.procedimentos);
});

test('retry seletivo de escalas provisiona estrutura minima de dominio real com idempotencia', async () => {
  await clearProvisioningFixtures();
  const fixture = await seedRetryFixture({ enabledModuleKeys: ['condominio', 'escalas'] });

  const firstRetry = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['escalas'] });
  assert.equal(firstRetry.status, 200);
  assert.equal(firstRetry.body?.success, true);

  const executed = firstRetry.body?.data?.provisioningResult?.moduleBootstrap?.executed;
  assert.ok(Array.isArray(executed));
  assert.equal(executed[0]?.module, 'escalas');
  assert.equal(executed[0]?.domainCollection, ESCALAS_DOMAIN_COLLECTION);
  assert.deepEqual(
    [...(executed[0]?.domainSeededKeys || [])].sort(),
    [...ESCALAS_EXPECTED_CADASTRO_KEYS].sort()
  );

  const firstCadastros = await readEscalasDomainCadastros(fixture.unidadeId);
  assert.equal(firstCadastros.length, ESCALAS_EXPECTED_CADASTRO_KEYS.length);
  assert.deepEqual(firstCadastros.map((item) => item.key), ESCALAS_EXPECTED_CADASTRO_KEYS);
  assert.ok(firstCadastros.every((item) => item.module === 'escalas'));
  assert.ok(firstCadastros.every((item) => item.active === true));
  assert.ok(firstCadastros.every((item) => item.source === 'bootstrap_escalas_v1'));
  assert.ok(firstCadastros.every((item) => item.schemaVersion === 1));

  const statusCatalog = firstCadastros.find((item) => item.key === 'status_escala');
  assert.deepEqual(statusCatalog?.payload?.values, ['rascunho', 'validada', 'fechada']);

  const refeicoesCatalog = firstCadastros.find((item) => item.key === 'tipos_refeicao');
  assert.deepEqual(refeicoesCatalog?.payload?.values, ['ALMOCO', 'JANTAR', 'LANCHE', 'PAUSA']);

  const modelCatalog = firstCadastros.find((item) => item.key === 'modelo_schema_escala');
  assert.equal(modelCatalog?.payload?.schemaVersion, 2);
  assert.equal(modelCatalog?.payload?.model, 'nested-recursos-em-equipes');

  const secondRetry = await retryRequest(fixture.unidadeId).send({ modulosRetry: ['escalas'] });
  assert.equal(secondRetry.status, 200);
  assert.equal(secondRetry.body?.success, true);

  const secondCadastros = await readEscalasDomainCadastros(fixture.unidadeId);
  assert.equal(secondCadastros.length, ESCALAS_EXPECTED_CADASTRO_KEYS.length);
  assert.deepEqual(secondCadastros.map((item) => item.key), ESCALAS_EXPECTED_CADASTRO_KEYS);

  const auditEvents = await readProvisioningAuditEvents(fixture.unidadeId);
  assert.ok(
    auditEvents.some((eventDoc) => (
      eventDoc?.eventType === 'unit_retry_started'
      && eventDoc?.operation === 'retry_selective'
      && eventDoc?.status === 'started'
    )),
    'deve registrar inicio de retry seletivo'
  );
  assert.ok(
    auditEvents.some((eventDoc) => (
      eventDoc?.eventType === 'unit_retry_succeeded'
      && eventDoc?.operation === 'retry_selective'
      && eventDoc?.status === 'success'
    )),
    'deve registrar sucesso de retry seletivo'
  );
  assert.ok(
    auditEvents.some((eventDoc) => (
      eventDoc?.eventType === 'module_bootstrap_succeeded'
      && eventDoc?.scope === 'module'
      && eventDoc?.moduleKey === 'escalas'
      && eventDoc?.operation === 'retry_selective'
    )),
    'deve registrar bootstrap de modulo escalas no retry seletivo'
  );

  const sampleEvent = auditEvents.find((eventDoc) => eventDoc?.eventType === 'unit_retry_succeeded');
  assert.equal(String(sampleEvent?.unidadeId || ''), String(fixture.unidadeId));
  assert.equal(typeof sampleEvent?.dbName, 'string');
  assert.equal(typeof sampleEvent?.scope, 'string');
  assert.equal(typeof sampleEvent?.status, 'string');
  assert.ok(sampleEvent?.createdAt);
});
