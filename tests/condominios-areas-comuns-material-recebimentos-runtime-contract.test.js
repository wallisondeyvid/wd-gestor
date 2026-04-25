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

async function createMaterial({ unidadeId, areaId, naturezaId, serie = uniqueSerie() }) {
  return CondBemMaterial.create({
    unidade_id: unidadeId,
    tipo: 'Móvel',
    natureza_id: naturezaId,
    serie,
    descricao: uniqueLabel('Material Runtime'),
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

function postReceive(app, { areaId, transferenciaId, materialId, acao }) {
  return request(app)
    .post(`/condominios/api/areas-comuns/${areaId}/materiais/recebimentos`)
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send({ transferenciaId, materialId, ...(acao ? { acao } : {}) });
}

test('POST /condominios/api/areas-comuns/:id/materiais/recebimentos retorna 400 para acao invalida', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaDestino = await createArea({ unidadeId: unidade._id });

  const res = await postReceive(app, {
    areaId: String(areaDestino._id),
    transferenciaId: '507f1f77bcf86cd799439011',
    materialId: '507f1f77bcf86cd799439012',
    acao: 'invalidar',
  });

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Ação inválida'
  });
});

test('POST /condominios/api/areas-comuns/:id/materiais/recebimentos retorna 404 quando transferencia nao existe', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaDestino = await createArea({ unidadeId: unidade._id });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaDestino._id, naturezaId: natureza._id });

  const res = await postReceive(app, {
    areaId: String(areaDestino._id),
    transferenciaId: '507f1f77bcf86cd799439011',
    materialId: String(material._id),
    acao: 'confirmar',
  });

  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Transferência não encontrada'
  });
});

test('POST /condominios/api/areas-comuns/:id/materiais/recebimentos retorna 409 quando transferencia nao pertence a area de destino', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaOrigem = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Origem Runtime') });
  const areaDestino = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Destino Runtime') });
  const outraArea = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Outra Area Runtime') });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaOrigem._id, naturezaId: natureza._id });
  const transferencia = await createPendingTransfer({
    unidadeId: unidade._id,
    materialId: material._id,
    origemAreaId: areaOrigem._id,
    destinoAreaId: areaDestino._id,
  });

  const res = await postReceive(app, {
    areaId: String(outraArea._id),
    transferenciaId: String(transferencia._id),
    materialId: String(material._id),
    acao: 'confirmar',
  });

  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'A transferência não pertence a esta área'
  });
});

test('POST /condominios/api/areas-comuns/:id/materiais/recebimentos retorna 409 quando transferencia ja foi processada', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaOrigem = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Origem Processada') });
  const areaDestino = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Destino Processado') });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaOrigem._id, naturezaId: natureza._id });
  const transferencia = await CondMaterialTransferencia.create({
    unidade_id: unidade._id,
    material_id: material._id,
    origem_area_id: areaOrigem._id,
    destino_area_id: areaDestino._id,
    status: 'aceito',
  });

  const res = await postReceive(app, {
    areaId: String(areaDestino._id),
    transferenciaId: String(transferencia._id),
    materialId: String(material._id),
    acao: 'confirmar',
  });

  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Transferência já processada'
  });
});

test('POST /condominios/api/areas-comuns/:id/materiais/recebimentos aceita transferencia pendente e move o material para a area de destino', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaOrigem = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Origem Aceite') });
  const areaDestino = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Destino Aceite') });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaOrigem._id, naturezaId: natureza._id });
  const transferencia = await createPendingTransfer({
    unidadeId: unidade._id,
    materialId: material._id,
    origemAreaId: areaOrigem._id,
    destinoAreaId: areaDestino._id,
  });

  const res = await postReceive(app, {
    areaId: String(areaDestino._id),
    transferenciaId: String(transferencia._id),
    materialId: String(material._id),
    acao: 'confirmar',
  });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.ok, true, JSON.stringify(res.body));
  assert.equal(res.body?.transferencia?.status, 'aceito', JSON.stringify(res.body));
  assert.equal(res.body?.transferencia?.materialId, String(material._id));
  assert.equal(res.body?.transferencia?.origemId, String(areaOrigem._id));
  assert.equal(res.body?.transferencia?.destinoId, String(areaDestino._id));
  assert.ok(res.body?.transferencia?.aceiteEm, JSON.stringify(res.body));
  assert.equal(res.body?.transferencia?.canceladoEm, null, JSON.stringify(res.body));
  assert.ok(res.body?.material, JSON.stringify(res.body));

  const [persistedTransfer, persistedMaterial] = await Promise.all([
    CondMaterialTransferencia.findById(transferencia._id).lean(),
    CondBemMaterial.findById(material._id).lean(),
  ]);

  assert.equal(persistedTransfer.status, 'aceito');
  assert.ok(persistedTransfer.aceite_em);
  assert.equal(String(persistedMaterial.vinculo_area.area_id), String(areaDestino._id));
});

test('POST /condominios/api/areas-comuns/:id/materiais/recebimentos recusa transferencia pendente sem mover o material', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaOrigem = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Origem Recusa') });
  const areaDestino = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Destino Recusa') });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaOrigem._id, naturezaId: natureza._id });
  const transferencia = await createPendingTransfer({
    unidadeId: unidade._id,
    materialId: material._id,
    origemAreaId: areaOrigem._id,
    destinoAreaId: areaDestino._id,
  });

  const res = await postReceive(app, {
    areaId: String(areaDestino._id),
    transferenciaId: String(transferencia._id),
    materialId: String(material._id),
    acao: 'rejeitar',
  });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.ok, true, JSON.stringify(res.body));
  assert.equal(res.body?.transferencia?.status, 'recusado', JSON.stringify(res.body));
  assert.equal(res.body?.transferencia?.aceiteEm, null, JSON.stringify(res.body));
  assert.ok(res.body?.transferencia?.canceladoEm, JSON.stringify(res.body));
  assert.ok(res.body?.material, JSON.stringify(res.body));

  const [persistedTransfer, persistedMaterial] = await Promise.all([
    CondMaterialTransferencia.findById(transferencia._id).lean(),
    CondBemMaterial.findById(material._id).lean(),
  ]);

  assert.equal(persistedTransfer.status, 'recusado');
  assert.ok(persistedTransfer.cancelado_em);
  assert.equal(String(persistedMaterial.vinculo_area.area_id), String(areaOrigem._id));
});