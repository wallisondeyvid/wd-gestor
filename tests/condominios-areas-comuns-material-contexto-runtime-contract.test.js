import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import request from 'supertest';

import CondAreaComum from '../src/core/models/cond_area_comum.js';
import CondBemMaterial from '../src/core/models/cond_bem_material.js';
import CondMaterialTransferencia from '../src/core/models/cond_material_transferencia.js';
import CondNatMaterial from '../src/core/models/cond_nat_material.js';
import Unidade from '../src/core/models/unidade.js';
import { createServer } from '../src/server/createServer.js';

let sequence = 0;
let runtimeContextPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function uniqueLabel(prefix) {
  return `${prefix}-${Date.now()}-${nextSequence()}`;
}

function uniqueSerie() {
  return `S${Date.now().toString(36)}${nextSequence().toString(36)}`.slice(0, 15).toUpperCase();
}

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function installTeardownSuppression() {
  let shuttingDown = false;
  const originalEmit = process.emit;

  const shouldIgnore = (err) => {
    if (!shuttingDown) return false;
    return String(err?.message || err).includes('Connection was force closed');
  };

  const onUnhandledRejection = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  const onUncaughtException = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  process.emit = function patchedEmit(eventName, ...args) {
    if (
      (eventName === 'unhandledRejection' || eventName === 'uncaughtException')
      && shouldIgnore(args[0])
    ) {
      return false;
    }
    return originalEmit.call(this, eventName, ...args);
  };

  process.prependListener('unhandledRejection', onUnhandledRejection);
  process.prependListener('uncaughtException', onUncaughtException);

  return {
    startShutdown() {
      shuttingDown = true;
    },
    async remove() {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtException', onUncaughtException);
      process.emit = originalEmit;
    }
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const teardownGuard = installTeardownSuppression();

async function getRuntimeContext() {
  if (!runtimeContextPromise) {
    runtimeContextPromise = withEnv({ MONGO_MEMORY: '1' }, async () => createServer());
  }
  return runtimeContextPromise;
}

after(async () => {
  try {
    if (runtimeContextPromise) {
      const { close } = await runtimeContextPromise;
      await closeWithTeardownGuard(close, teardownGuard);
    }
  } finally {
    await teardownGuard.remove();
  }
});

async function createUnit(nome = uniqueLabel('Unidade Runtime')) {
  return Unidade.create({
    nome,
    pessoaTipo: 'pj',
    is_principal: true,
  });
}

async function createArea({ unidadeId, nome = uniqueLabel('Area Runtime') }) {
  return CondAreaComum.create({
    unidade_id: unidadeId,
    nome,
    tipo: 'salão',
  });
}

async function createNatureza({ unidadeId, tipo = 'Móvel', nome = uniqueLabel('Natureza Runtime') }) {
  return CondNatMaterial.create({
    unidade_id: unidadeId,
    tipo,
    nome,
  });
}

async function createMaterial({ unidadeId, areaId, naturezaId, serie = uniqueSerie(), descricao = uniqueLabel('Material Runtime') }) {
  return CondBemMaterial.create({
    unidade_id: unidadeId,
    tipo: 'Móvel',
    natureza_id: naturezaId,
    serie,
    descricao,
    vinculo_area: {
      unidade_id: unidadeId,
      area_id: areaId,
    },
  });
}

async function createPendingTransfer({ unidadeId, materialId, origemAreaId, destinoAreaId }) {
  return CondMaterialTransferencia.create({
    unidade_id: unidadeId,
    material_id: materialId,
    origem_area_id: origemAreaId,
    destino_area_id: destinoAreaId,
    status: 'pendente',
  });
}

function getContext(app, { areaId, secao } = {}) {
  const query = secao ? `?secao=${encodeURIComponent(secao)}` : '';
  return request(app)
    .get(`/condominios/api/areas-comuns/${areaId}/materiais/contexto${query}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

test('GET /condominios/api/areas-comuns/:id/materiais/contexto retorna 400 para identificador invalido', async () => {
  const { app } = await getRuntimeContext();

  const res = await getContext(app, { areaId: 'invalido' });

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Identificador de área inválido'
  });
});

test('GET /condominios/api/areas-comuns/:id/materiais/contexto retorna 404 quando area nao existe', async () => {
  const { app } = await getRuntimeContext();

  const res = await getContext(app, { areaId: '507f1f77bcf86cd799439011' });

  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Área comum não encontrada'
  });
});

test('GET /condominios/api/areas-comuns/:id/materiais/contexto retorna payload canônico com materiais locais, pendentes a receber e pendentes enviados', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaAtual = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Area Atual') });
  const areaDestino = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Area Destino') });
  const areaOrigemExterna = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Area Origem Externa') });
  const natureza = await createNatureza({ unidadeId: unidade._id });

  const materialDisponivel = await createMaterial({
    unidadeId: unidade._id,
    areaId: areaAtual._id,
    naturezaId: natureza._id,
    descricao: 'Mesa Disponivel Runtime'
  });
  const materialEnviado = await createMaterial({
    unidadeId: unidade._id,
    areaId: areaAtual._id,
    naturezaId: natureza._id,
    descricao: 'Cadeira Transferida Runtime'
  });
  const materialReceber = await createMaterial({
    unidadeId: unidade._id,
    areaId: areaOrigemExterna._id,
    naturezaId: natureza._id,
    descricao: 'Projetor Receber Runtime'
  });

  await createPendingTransfer({
    unidadeId: unidade._id,
    materialId: materialEnviado._id,
    origemAreaId: areaAtual._id,
    destinoAreaId: areaDestino._id,
  });
  await createPendingTransfer({
    unidadeId: unidade._id,
    materialId: materialReceber._id,
    origemAreaId: areaOrigemExterna._id,
    destinoAreaId: areaAtual._id,
  });

  const res = await getContext(app, { areaId: String(areaAtual._id) });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.areaId, String(areaAtual._id), JSON.stringify(res.body));
  assert.equal(res.body?.unidadeId, String(unidade._id), JSON.stringify(res.body));
  assert.equal(res.body?.area?._id, String(areaAtual._id), JSON.stringify(res.body));
  assert.equal(res.body?.unidade?._id, String(unidade._id), JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body?.destinos), JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body?.materiaisArea), JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body?.materiaisReceber), JSON.stringify(res.body));
  assert.ok(Array.isArray(res.body?.materiaisTransferidos), JSON.stringify(res.body));

  const materiaisAreaIds = new Set((res.body.materiaisArea || []).map(item => String(item.id || item._id || item.materialId)));
  const materiaisReceberIds = new Set((res.body.materiaisReceber || []).map(item => String(item.id || item._id || item.materialId)));
  const materiaisTransferidosIds = new Set((res.body.materiaisTransferidos || []).map(item => String(item.id || item._id || item.materialId)));
  const destinoIds = new Set((res.body.destinos || []).map(item => String(item.id || item._id || item.areaId)));

  assert.ok(materiaisAreaIds.has(String(materialDisponivel._id)), JSON.stringify(res.body));
  assert.ok(!materiaisAreaIds.has(String(materialEnviado._id)), JSON.stringify(res.body));
  assert.ok(materiaisReceberIds.has(String(materialReceber._id)), JSON.stringify(res.body));
  assert.ok(materiaisTransferidosIds.has(String(materialEnviado._id)), JSON.stringify(res.body));
  assert.ok(destinoIds.has(String(areaDestino._id)), JSON.stringify(res.body));
});