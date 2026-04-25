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

function postTransfer(app, { areaId, materialId, destinoId }) {
  return request(app)
    .post(`/condominios/api/areas-comuns/${areaId}/materiais/transferencias`)
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send({ materialId, destinoId });
}

test('POST /condominios/api/areas-comuns/:id/materiais/transferencias retorna 400 quando destino e a mesma area de origem', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaOrigem = await createArea({ unidadeId: unidade._id });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaOrigem._id, naturezaId: natureza._id });

  const res = await postTransfer(app, {
    areaId: String(areaOrigem._id),
    materialId: String(material._id),
    destinoId: String(areaOrigem._id),
  });

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Área de destino deve ser diferente da área de origem'
  });
});

test('POST /condominios/api/areas-comuns/:id/materiais/transferencias retorna 409 quando material nao pertence a area de origem informada', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaOrigem = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Origem Runtime') });
  const areaReal = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Area Real Runtime') });
  const areaDestino = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Destino Runtime') });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaReal._id, naturezaId: natureza._id });

  const res = await postTransfer(app, {
    areaId: String(areaOrigem._id),
    materialId: String(material._id),
    destinoId: String(areaDestino._id),
  });

  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Material não está vinculado à área informada'
  });
});

test('POST /condominios/api/areas-comuns/:id/materiais/transferencias retorna 400 quando destinoId e invalido', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaOrigem = await createArea({ unidadeId: unidade._id });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaOrigem._id, naturezaId: natureza._id });

  const res = await postTransfer(app, {
    areaId: String(areaOrigem._id),
    materialId: String(material._id),
    destinoId: 'destino-invalido',
  });

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Dados da transferência inválidos'
  });
});

test('POST /condominios/api/areas-comuns/:id/materiais/transferencias retorna 400 quando destino pertence a outro condominio', async () => {
  const { app } = await getRuntimeContext();
  const unidadeOrigem = await createUnit(uniqueLabel('Unidade Origem Runtime'));
  const unidadeDestino = await createUnit(uniqueLabel('Unidade Destino Runtime'));
  const areaOrigem = await createArea({ unidadeId: unidadeOrigem._id, nome: uniqueLabel('Origem Outra Unidade') });
  const areaDestino = await createArea({ unidadeId: unidadeDestino._id, nome: uniqueLabel('Destino Outra Unidade') });
  const natureza = await createNatureza({ unidadeId: unidadeOrigem._id });
  const material = await createMaterial({ unidadeId: unidadeOrigem._id, areaId: areaOrigem._id, naturezaId: natureza._id });

  const res = await postTransfer(app, {
    areaId: String(areaOrigem._id),
    materialId: String(material._id),
    destinoId: String(areaDestino._id),
  });

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Área de destino pertence a outro condomínio'
  });
});

test('POST /condominios/api/areas-comuns/:id/materiais/transferencias retorna 409 quando ja existe transferencia pendente para o material', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaOrigem = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Origem Pendente') });
  const areaDestino = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Destino Pendente') });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaOrigem._id, naturezaId: natureza._id });

  await CondMaterialTransferencia.create({
    unidade_id: unidade._id,
    material_id: material._id,
    origem_area_id: areaOrigem._id,
    destino_area_id: areaDestino._id,
    status: 'pendente',
  });

  const res = await postTransfer(app, {
    areaId: String(areaOrigem._id),
    materialId: String(material._id),
    destinoId: String(areaDestino._id),
  });

  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Este material já possui uma transferência pendente.'
  });
  assert.equal(await CondMaterialTransferencia.countDocuments({ material_id: material._id }), 1);
});

test('POST /condominios/api/areas-comuns/:id/materiais/transferencias retorna 201 e payload curto no caso valido', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createUnit();
  const areaOrigem = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Origem Valida') });
  const areaDestino = await createArea({ unidadeId: unidade._id, nome: uniqueLabel('Destino Valido') });
  const natureza = await createNatureza({ unidadeId: unidade._id });
  const material = await createMaterial({ unidadeId: unidade._id, areaId: areaOrigem._id, naturezaId: natureza._id });

  const res = await postTransfer(app, {
    areaId: String(areaOrigem._id),
    materialId: String(material._id),
    destinoId: String(areaDestino._id),
  });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body?.ok, true, JSON.stringify(res.body));
  assert.deepEqual(Object.keys(res.body?.transferencia || {}).sort(), ['criadoEm', 'destinoId', 'id', 'materialId', 'origemId', 'status']);
  assert.equal(res.body.transferencia.materialId, String(material._id));
  assert.equal(res.body.transferencia.origemId, String(areaOrigem._id));
  assert.equal(res.body.transferencia.destinoId, String(areaDestino._id));
  assert.equal(res.body.transferencia.status, 'pendente');
  assert.ok(res.body.transferencia.id);
  assert.ok(!Number.isNaN(Date.parse(res.body.transferencia.criadoEm)), JSON.stringify(res.body));

  const persisted = await CondMaterialTransferencia.findById(res.body.transferencia.id).lean();
  assert.ok(persisted, 'transferência pendente não persistida');
  assert.equal(String(persisted.material_id), String(material._id));
  assert.equal(String(persisted.origem_area_id), String(areaOrigem._id));
  assert.equal(String(persisted.destino_area_id), String(areaDestino._id));
  assert.equal(persisted.status, 'pendente');
});