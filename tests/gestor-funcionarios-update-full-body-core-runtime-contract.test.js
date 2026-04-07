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
    nome: overrides.nome || `Funcionario ${Date.now()}-${nextCounter()}`,
    rg: overrides.rg || buildRg(),
    cpf: overrides.cpf || uniqueCpf(),
    data_nascimento: overrides.data_nascimento || new Date('1990-01-01T00:00:00.000Z'),
    sexo: overrides.sexo || 'M',
    endereco: overrides.endereco || { cep: '01001000' },
    email: overrides.email || uniqueEmail('funcionario-update-full'),
    telefone: overrides.telefone || '(11) 99999-9999',
    ativo: overrides.ativo ?? true,
    ...overrides,
  });
}

async function authenticateContextualAgent(app, { unidadeId, papelContextual = 'gestor' }) {
  const email = uniqueEmail('funcionario-update-full-context');
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
    nome: `Gestor Contextual ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gestor-funcionarios-update-full-body-core-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });

  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, email, userId: user._id };
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
      });

      sharedHarness.app = app;
      sharedHarness.close = close;
      sharedHarness.teardownGuard = installTeardownSuppression();
      sharedHarness.unidadeA = unidadeA;
      sharedHarness.unidadeB = unidadeB;
      sharedHarness.unidadeC = unidadeC;
      sharedHarness.contextualAgent = contextualAuth.agent;
      sharedHarness.createdEmails = [contextualAuth.email];
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
  });
}

test.after(async () => {
  await disposeSharedHarness();
});

test('PUT full body core: sem sessao retorna 401', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: 'Sem Sessao' });

    assert.equal(res.status, 401);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'UNAUTHORIZED');
  });
});

test('PUT full body core: fora do escopo contextual retorna 404', async () => {
  await withHarness(async ({ unidadeC, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeC._id);

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: 'Nao Deve Atualizar' });

    assert.equal(res.status, 404);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'NOT_FOUND');
    assert.equal(res.body?.message, 'Funcionário não encontrado');
  });
});

test('PUT full body core: funcionario inexistente retorna 404', async () => {
  await withHarness(async ({ contextualAgent }) => {
    const res = await contextualAgent
      .put('/gestor/api/funcionarios/64f111111111111111111111')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: 'Nao Existe' });

    assert.equal(res.status, 404);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'NOT_FOUND');
    assert.equal(res.body?.message, 'Funcionário não encontrado');
  });
});

test('PUT full body core: sucesso escalar minimo observavel normaliza salario_base', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Original ${Date.now()}-${nextCounter()}`,
      salario_base: 1200,
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        nome: 'Funcionario Atualizado Full',
        salario_base: '1.234,56',
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.equal(persisted.nome, 'Funcionario Atualizado Full');
    assert.equal(persisted.salario_base, 1234.56);
  });
});

test('PUT full body core: unidade_id divergente do contexto no body retorna 404', async () => {
  await withHarness(async ({ unidadeB, unidadeC, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: normalizeId(unidadeC._id),
        nome: 'Nao Deve Atualizar',
      });

    assert.equal(res.status, 404);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'NOT_FOUND');
    assert.equal(res.body?.message, 'Unidade não encontrada');
  });
});

test('PUT full body core: PIS invalido retorna 400', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ pis: '12345678901' });

    assert.equal(res.status, 400);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'BAD_REQUEST');
    assert.equal(res.body?.message, 'PIS inválido');
    assert.equal(res.body?.campo, 'pis');
  });
});

test('PUT full body core: CPF invalido retorna 400', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ cpf: '123' });

    assert.equal(res.status, 400);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'BAD_REQUEST');
    assert.equal(res.body?.message, 'CPF inválido');
    assert.equal(res.body?.campo, 'cpf');
  });
});

test('PUT full body core: duplicidade de CPF retorna 400', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const duplicado = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario CPF Duplicado ${Date.now()}-${nextCounter()}`,
    });
    const alvo = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Alvo ${Date.now()}-${nextCounter()}`,
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(alvo._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ cpf: duplicado.cpf });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'BAD_REQUEST');
    assert.equal(res.body?.message, 'Já existe um funcionário cadastrado com este CPF nesta empresa.');
    assert.equal(res.body?.path, 'cpf');
  });
});

test('PUT full body core: erro interno induzido no update retorna 500', async (t) => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);

    t.mock.method(FuncionarioModel, 'findOneAndUpdate', async () => {
      throw new Error('forced update full body core failure');
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: 'Deve Falhar' });

    assert.equal(res.status, 500);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'SERVER_ERROR');
    assert.equal(res.body?.message, 'Erro interno');
  });
});

test('PUT full body core: pcd N limpa tipo_deficiencia e cid', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      pcd: 'S',
      tipo_deficiencia: 'Auditiva',
      cid: 'H90',
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ pcd: 'N' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.equal(persisted.pcd, 'N');
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'tipo_deficiencia'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'cid'), false);
  });
});