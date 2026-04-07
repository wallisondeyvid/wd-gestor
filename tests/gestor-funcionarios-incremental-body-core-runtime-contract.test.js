import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { createServer } from '../src/server/createServer.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import Funcionario from '../src/core/models/Funcionario.js';
import { createUnitScope } from '../src/shared/unitScope.js';
import { resolveModel } from '../src/shared/db/resolveModel.js';

let uniqueCounter = 0;
const sharedHarness = {
  promise: null,
  app: null,
  close: null,
  teardownGuard: null,
  prevMongoMemory: undefined,
  prevAuthContextFlag: undefined,
  unidadeA: null,
  unidadeB: null,
  unidadeC: null,
  contextualAgent: null,
  outsiderAgent: null,
  createdEmails: [],
};

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
  return String(value || '').trim();
}

function buildRg() {
  return `RG-${Date.now()}-${nextCounter()}`;
}

function installTeardownSuppression() {
  let shuttingDown = false;
  const originalEmit = process.emit;

  const shouldIgnore = (err) => {
    if (!shuttingDown) return false;
    const message = String(err?.message || err);
    return message.includes('Connection was force closed')
      || message.includes('Unable to deserialize cloned data due to invalid or unsupported version.');
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
    nome: `Principal A ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    is_principal: true,
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  });

  const unidadeB = await Unidade.create({
    nome: `Filial B ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    ativa: true,
    unidade_principal_id: unidadeA._id,
    modulosAcessiveis: [moduloGestor._id],
  });

  const unidadeC = await Unidade.create({
    nome: `Principal C ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    is_principal: true,
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  });

  return { unidadeA, unidadeB, unidadeC };
}

function getTenantModel(modelClass, unidadeId) {
  return resolveModel({
    name: modelClass.modelName,
    schema: modelClass.schema,
    unitScope: createUnitScope({ unidadeId: normalizeId(unidadeId) }),
  });
}

async function createFuncionarioInTenant(unidadeId, overrides = {}) {
  const FuncionarioModel = getTenantModel(Funcionario, unidadeId);
  return FuncionarioModel.create({
    unidade_id: unidadeId,
    nome: overrides.nome || `Funcionario Tenant ${Date.now()}-${nextCounter()}`,
    rg: buildRg(),
    cpf: overrides.cpf || uniqueCpf(),
    data_nascimento: new Date('1990-01-01T00:00:00.000Z'),
    sexo: overrides.sexo || 'M',
    endereco: overrides.endereco || { cep: '01001000' },
    email: overrides.email || uniqueEmail('func-incremental-body-core-tenant'),
    telefone: overrides.telefone || '(11) 99999-9999',
    ativo: true,
    ...overrides,
  });
}

async function authenticateContextualAgent(app, { unidadeId, prefix }) {
  const email = uniqueEmail(prefix);
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  const user = await User.create({
    email,
    senha: senhaHash,
    cpf: uniqueCpf(),
    role: 'user',
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: `Incremental Body Core Runtime ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-funcionarios-incremental-body-core-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });

  assert.equal(loginRes.status, 303, JSON.stringify(loginRes.body));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, email };
}

async function getSharedHarness() {
  if (!sharedHarness.promise) {
    sharedHarness.promise = (async () => {
      sharedHarness.prevMongoMemory = process.env.MONGO_MEMORY;
      sharedHarness.prevAuthContextFlag = process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      process.env.MONGO_MEMORY = '1';
      process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '1';

      const { app, close } = await createServer({ skipDb: false });
      app.locals.gestorAuthContextFeatureFlags = {
        gestor_auth_context_resolver: true,
      };
      delete app.locals.gestorAuthContextResolverDeps;
      delete app.locals.gestorAuthContextMaxTimeMS;

      const { unidadeA, unidadeB, unidadeC } = await createModuloAndUnits();
      const contextualAuth = await authenticateContextualAgent(app, {
        unidadeId: unidadeB._id,
        prefix: 'funcionario-incremental-body-core-runtime-context',
      });
      const outsiderAuth = await authenticateContextualAgent(app, {
        unidadeId: unidadeC._id,
        prefix: 'funcionario-incremental-body-core-runtime-outsider',
      });

      sharedHarness.app = app;
      sharedHarness.close = close;
      sharedHarness.teardownGuard = installTeardownSuppression();
      sharedHarness.unidadeA = unidadeA;
      sharedHarness.unidadeB = unidadeB;
      sharedHarness.unidadeC = unidadeC;
      sharedHarness.contextualAgent = contextualAuth.agent;
      sharedHarness.outsiderAgent = outsiderAuth.agent;
      sharedHarness.createdEmails = [contextualAuth.email, outsiderAuth.email];
      return sharedHarness;
    })();
  }

  return sharedHarness.promise;
}

async function disposeSharedHarness() {
  if (!sharedHarness.promise) return;

  try {
    await sharedHarness.promise;
    if (sharedHarness.createdEmails.length > 0) {
      try {
        await User.deleteMany({ email: { $in: sharedHarness.createdEmails } });
      } catch {}
    }
    await closeWithTeardownGuard(sharedHarness.close, sharedHarness.teardownGuard);
  } finally {
    try {
      if (sharedHarness.teardownGuard) {
        await sharedHarness.teardownGuard.remove();
      }
    } finally {
      if (sharedHarness.prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = sharedHarness.prevMongoMemory;
      if (sharedHarness.prevAuthContextFlag === undefined) delete process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      else process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = sharedHarness.prevAuthContextFlag;

      sharedHarness.promise = null;
      sharedHarness.app = null;
      sharedHarness.close = null;
      sharedHarness.teardownGuard = null;
      sharedHarness.prevMongoMemory = undefined;
      sharedHarness.prevAuthContextFlag = undefined;
      sharedHarness.unidadeA = null;
      sharedHarness.unidadeB = null;
      sharedHarness.unidadeC = null;
      sharedHarness.contextualAgent = null;
      sharedHarness.outsiderAgent = null;
      sharedHarness.createdEmails = [];
    }
  }
}

async function withHarness(run) {
  const harness = await getSharedHarness();

  await run({
    app: harness.app,
    unidadeA: harness.unidadeA,
    unidadeB: harness.unidadeB,
    unidadeC: harness.unidadeC,
    contextualAgent: harness.contextualAgent,
    outsiderAgent: harness.outsiderAgent,
  });
}

test.after(async () => {
  await disposeSharedHarness();
});

test('PUT /gestor/api/funcionarios/:id/incremental body core sem sessao retorna unauthorized em JSON', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: 'Sem Sessao Body Core' });

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental body core fora do escopo contextual retorna not found', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await outsiderAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: 'Fora Escopo Body Core' });

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Funcionário não encontrado', JSON.stringify(res.body));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental body core com funcionario inexistente retorna not found', async () => {
  await withHarness(async ({ contextualAgent }) => {
    const res = await contextualAgent
      .put('/gestor/api/funcionarios/64f111111111111111111111/incremental')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: 'Inexistente Body Core' });

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Funcionário não encontrado', JSON.stringify(res.body));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental body core com update escalar minimo observavel retorna updated=true', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Body Core Base ${Date.now()}-${nextCounter()}`,
      salario_base: 1234.56,
    });
    const novoNome = `Funcionario Body Core Atualizado ${Date.now()}-${nextCounter()}`;

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: novoNome });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const updated = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.ok(updated);
    assert.equal(updated.nome, novoNome, JSON.stringify(updated));
    assert.equal(updated.salario_base, 1234.56, JSON.stringify(updated));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental body core com PIS invalido retorna bad request', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ pis: '12345678901' });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'BAD_REQUEST', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'PIS inválido', JSON.stringify(res.body));
    assert.equal(res.body?.campo, 'pis', JSON.stringify(res.body));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental body core com CPF invalido retorna bad request', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ cpf: '123' });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'BAD_REQUEST', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'CPF inválido', JSON.stringify(res.body));
    assert.equal(res.body?.campo, 'cpf', JSON.stringify(res.body));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental body core com duplicidade de CPF retorna bad request', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const cpfDuplicado = uniqueCpf();
    await createFuncionarioInTenant(unidadeB._id, {
      cpf: cpfDuplicado,
      email: uniqueEmail('func-incremental-body-core-dup-base'),
    });
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      email: uniqueEmail('func-incremental-body-core-dup-target'),
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ cpf: cpfDuplicado });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'BAD_REQUEST', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Já existe um funcionário cadastrado com este CPF nesta empresa.', JSON.stringify(res.body));
    assert.equal(res.body?.path, 'cpf', JSON.stringify(res.body));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental body core com pcd=N limpa tipo_deficiencia e cid', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      pcd: 'S',
      tipo_deficiencia: 'FISICA',
      cid: 'CID-123',
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ pcd: 'N' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const updated = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.ok(updated);
    assert.equal(updated.pcd, 'N', JSON.stringify(updated));
    assert.equal(Object.prototype.hasOwnProperty.call(updated, 'tipo_deficiencia'), false, JSON.stringify(updated));
    assert.equal(Object.prototype.hasOwnProperty.call(updated, 'cid'), false, JSON.stringify(updated));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental body core propaga erro interno induzido no update', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);
    const originalFindOneAndUpdate = FuncionarioModel.findOneAndUpdate;
    FuncionarioModel.findOneAndUpdate = function patchedFindOneAndUpdate() {
      throw new Error('forced incremental body-core failure');
    };

    try {
      const res = await contextualAgent
        .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ nome: 'Falha Body Core' });

      assert.equal(res.status, 500, JSON.stringify(res.body));
      assert.equal(res.body?.success, false, JSON.stringify(res.body));
      assert.equal(res.body?.code, 'SERVER_ERROR', JSON.stringify(res.body));
      assert.equal(res.body?.message, 'Falha ao atualizar funcionário', JSON.stringify(res.body));
    } finally {
      FuncionarioModel.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });
});