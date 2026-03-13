import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { createServer } from '../src/server/createServer.js';
import { clearResolveConnectionCache } from '../src/shared/db/resolveConnection.js';
import { resolveModel } from '../src/shared/db/resolveModel.js';
import { createUnitScope } from '../src/shared/unitScope.js';
import { findUnidadesByIdsNomeCodigoLean } from '../src/modules/gestor/app/db/api.db.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';

let uniqueCounter = 0;

function nextCounter() {
  uniqueCounter += 1;
  return uniqueCounter;
}

function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}.${nextCounter()}@example.com`;
}

function uniqueCpf() {
  return String(Date.now() + nextCounter()).slice(-11).padStart(11, '0');
}

function normalizeId(value) {
  return String(value || '');
}

function getTenantUnitModel(unidadeId) {
  return resolveModel({
    name: Unidade.modelName,
    schema: Unidade.schema,
    unitScope: createUnitScope({ unidadeId: normalizeId(unidadeId) }),
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

async function seedTenantUnits(unidadeId, unidades) {
  const UnidadeTenantModel = getTenantUnitModel(unidadeId);
  await UnidadeTenantModel.deleteMany({});
  await UnidadeTenantModel.insertMany(unidades);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    },
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function createModuloAndUnits() {
  const moduloGestor = await Modulo.create({
    nome: 'gestor',
    status: 'ativo',
    url_base: '/gestor',
  });

  const unidadeA = await Unidade.create({
    nome: `Unidade A ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    is_principal: true,
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  });

  const unidadeB = await Unidade.create({
    nome: `Unidade B ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    ativa: true,
    unidade_principal_id: unidadeA._id,
    modulosAcessiveis: [moduloGestor._id],
  });

  return { unidadeA, unidadeB };
}

async function authenticateAgent(app, { role, unidadeId = null, nomeBase }) {
  const email = uniqueEmail(`tenant-only-${role}`);
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  const payload = {
    email,
    senha: senhaHash,
    cpf: uniqueCpf(),
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: `${nomeBase} ${nextCounter()}`,
  };

  if (unidadeId) {
    payload.unidade_id = unidadeId;
  }

  await User.create(payload);

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(
    loginRes.status >= 300 && loginRes.status < 400,
    `Login ${role} deve redirecionar, recebido ${loginRes.status} com body ${JSON.stringify(loginRes.body)}`,
  );

  return { agent, email };
}

async function createRecursoViaApi(agent, payload) {
  const res = await agent
    .post('/gestor/api/recursos')
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send(payload);

  assert.equal(
    res.status,
    201,
    `Setup falhou: criação de recurso deveria retornar 201, veio ${res.status} com body ${JSON.stringify(res.body)}`,
  );

  return String(res.body?.data?._id || res.body?.id || res.body?._id || '');
}

async function createSetorViaApi(agent, payload) {
  const res = await agent
    .post('/gestor/api/setores')
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send(payload);

  assert.equal(
    res.status,
    201,
    `Setup falhou: criação de setor deveria retornar 201, veio ${res.status} com body ${JSON.stringify(res.body)}`,
  );

  return String(res.body?.data?._id || res.body?.id || res.body?._id || '');
}

async function withHarness(run) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();
  const createdEmails = [];

  try {
    const { unidadeA, unidadeB } = await createModuloAndUnits();
    const masterAuth = await authenticateAgent(app, {
      role: 'master',
      nomeBase: 'Master Unit Scope',
    });
    createdEmails.push(masterAuth.email);

    const diretorAuth = await authenticateAgent(app, {
      role: 'diretor',
      unidadeId: unidadeA._id,
      nomeBase: 'Diretor Unit Scope',
    });
    createdEmails.push(diretorAuth.email);

    await run({
      app,
      unidadeA,
      unidadeB,
      masterAgent: masterAuth.agent,
      diretorAgent: diretorAuth.agent,
      trackCreatedEmail(email) {
        createdEmails.push(email);
      },
    });
  } finally {
    try {
      if (createdEmails.length > 0) {
        try {
          await User.deleteMany({ email: { $in: createdEmails } });
        } catch {}
      }
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
    }
  }
}

test('Recursos: GET lista apenas a unidade canônica do contexto atual', async () => {
  await withHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const recursoAId = await createRecursoViaApi(masterAgent, {
      unidade_id: normalizeId(unidadeA._id),
      tipo: 'carro',
      placa: `RCA-${String(Date.now()).slice(-4)}`,
      chassi: `CHASSI-A-${Date.now()}${nextCounter()}`,
      renavam: uniqueCpf(),
      ano: 2024,
      mod: 2025,
      marca: 'Marca A',
      modelo: 'Modelo A',
      cor: 'preto',
    });

    const recursoBId = await createRecursoViaApi(masterAgent, {
      unidade_id: normalizeId(unidadeB._id),
      tipo: 'carro',
      placa: `RCB-${String(Date.now()).slice(-4)}`,
      chassi: `CHASSI-B-${Date.now()}${nextCounter()}`,
      renavam: uniqueCpf(),
      ano: 2024,
      mod: 2025,
      marca: 'Marca B',
      modelo: 'Modelo B',
      cor: 'branco',
    });

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.equal(res.body?.success, true);
    assert.ok(Array.isArray(res.body?.data));
    assert.ok(res.body.data.some((item) => normalizeId(item?._id || item?.id) === recursoAId));
    assert.equal(res.body.data.some((item) => normalizeId(item?._id || item?.id) === recursoBId), false);
  });
});

test('Recursos: POST bloqueia criação em unidade fora do contexto atual', async () => {
  await withHarness(async ({ unidadeB, diretorAgent }) => {
    const res = await diretorAgent
      .post('/gestor/api/recursos')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: normalizeId(unidadeB._id),
        tipo: 'carro',
        placa: `RCC-${String(Date.now()).slice(-4)}`,
        chassi: `CHASSI-C-${Date.now()}${nextCounter()}`,
        renavam: uniqueCpf(),
        ano: 2024,
        mod: 2025,
        marca: 'Marca C',
        modelo: 'Modelo C',
        cor: 'cinza',
      });

    assert.equal(res.status, 404);
  });
});

test('Recursos: DELETE não alcança recurso de outra unidade contextual', async () => {
  await withHarness(async ({ unidadeB, masterAgent, diretorAgent }) => {
    const recursoBId = await createRecursoViaApi(masterAgent, {
      unidade_id: normalizeId(unidadeB._id),
      tipo: 'carro',
      placa: `RCD-${String(Date.now()).slice(-4)}`,
      chassi: `CHASSI-D-${Date.now()}${nextCounter()}`,
      renavam: uniqueCpf(),
      ano: 2024,
      mod: 2025,
      marca: 'Marca D',
      modelo: 'Modelo D',
      cor: 'azul',
    });

    const res = await diretorAgent
      .delete(`/gestor/api/recursos/${recursoBId}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 404);
  });
});

test('Setores: GET lista apenas a unidade canônica do contexto atual', async () => {
  await withHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const setorAId = await createSetorViaApi(masterAgent, {
      nome: `Setor A ${Date.now()}-${nextCounter()}`,
      descricao: 'Setor em escopo',
      unidade_id: normalizeId(unidadeA._id),
    });

    const setorBId = await createSetorViaApi(masterAgent, {
      nome: `Setor B ${Date.now()}-${nextCounter()}`,
      descricao: 'Setor fora do escopo',
      unidade_id: normalizeId(unidadeB._id),
    });

    const res = await diretorAgent
      .get('/gestor/api/setores')
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.equal(res.body?.success, true);
    assert.ok(Array.isArray(res.body?.data));
    assert.ok(res.body.data.some((item) => normalizeId(item?._id || item?.id) === setorAId));
    assert.equal(res.body.data.some((item) => normalizeId(item?._id || item?.id) === setorBId), false);
  });
});

test('Setores bridge: findUnidadesByIdsNomeCodigoLean usa tenant quando a lista carrega uma unidade única em multi-db', async () => {
  await withHarness(async ({ unidadeA }) => {
    const previousMultiDb = process.env.WD_MULTI_DB;
    const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
    const previousHandshake = process.env.WD_USERDB_HANDSHAKE;

    try {
      process.env.WD_MULTI_DB = '1';
      process.env.WD_MULTI_DB_ALLOWLIST = normalizeId(unidadeA._id);
      process.env.WD_USERDB_HANDSHAKE = '0';
      clearResolveConnectionCache();

      const tenantName = `${unidadeA.nome} TENANT`;

      await seedTenantUnits(unidadeA._id, [
        buildTenantUnitDoc(unidadeA, { nome: tenantName }),
      ]);

      await Unidade.deleteMany({ _id: unidadeA._id });

      const unidades = await findUnidadesByIdsNomeCodigoLean([normalizeId(unidadeA._id)]);

      assert.equal(unidades.length, 1);
      assert.equal(normalizeId(unidades[0]?._id), normalizeId(unidadeA._id));
      assert.equal(unidades[0]?.nome, tenantName);
    } finally {
      clearResolveConnectionCache();

      if (previousMultiDb === undefined) delete process.env.WD_MULTI_DB;
      else process.env.WD_MULTI_DB = previousMultiDb;

      if (previousAllowlist === undefined) delete process.env.WD_MULTI_DB_ALLOWLIST;
      else process.env.WD_MULTI_DB_ALLOWLIST = previousAllowlist;

      if (previousHandshake === undefined) delete process.env.WD_USERDB_HANDSHAKE;
      else process.env.WD_USERDB_HANDSHAKE = previousHandshake;

      clearResolveConnectionCache();
    }
  });
});

test('Setores: POST bloqueia criação em unidade fora do contexto atual', async () => {
  await withHarness(async ({ unidadeB, diretorAgent }) => {
    const res = await diretorAgent
      .post('/gestor/api/setores')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        nome: `Setor Bloqueado ${Date.now()}-${nextCounter()}`,
        descricao: 'Nao deveria criar',
        unidade_id: normalizeId(unidadeB._id),
      });

    assert.equal(res.status, 404);
  });
});

test('Setores: GET por id não alcança setor de outra unidade contextual', async () => {
  await withHarness(async ({ unidadeB, masterAgent, diretorAgent }) => {
    const setorBId = await createSetorViaApi(masterAgent, {
      nome: `Setor Fora ${Date.now()}-${nextCounter()}`,
      descricao: 'Fora do contexto',
      unidade_id: normalizeId(unidadeB._id),
    });

    const res = await diretorAgent
      .get(`/gestor/api/setores/${setorBId}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 404);
  });
});

test('Recursos HTML: renderiza apenas a unidade contextual atual', async () => {
  await withHarness(async ({ unidadeA, unidadeB, diretorAgent }) => {
    const res = await diretorAgent
      .get('/gestor/recursos')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, new RegExp(escapeRegExp(normalizeId(unidadeA._id))));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(normalizeId(unidadeB._id))));
    assert.match(res.text, new RegExp(escapeRegExp(unidadeA.nome)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(unidadeB.nome)));
  });
});

test('Setores HTML: renderiza dropdown e lista apenas a unidade contextual atual', async () => {
  await withHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const setorAName = `Setor HTML A ${Date.now()}-${nextCounter()}`;
    const setorBName = `Setor HTML B ${Date.now()}-${nextCounter()}`;

    await createSetorViaApi(masterAgent, {
      nome: setorAName,
      descricao: 'Setor HTML fora do contexto',
      unidade_id: normalizeId(unidadeA._id),
    });

    await createSetorViaApi(masterAgent, {
      nome: setorBName,
      descricao: 'Setor HTML no contexto',
      unidade_id: normalizeId(unidadeB._id),
    });

    const res = await diretorAgent
      .get('/gestor/setores')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, new RegExp(escapeRegExp(normalizeId(unidadeA._id))));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(normalizeId(unidadeB._id))));
    assert.match(res.text, new RegExp(escapeRegExp(setorAName)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(setorBName)));
    assert.match(res.text, new RegExp(escapeRegExp(unidadeA.nome)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(unidadeB.nome)));
  });
});
