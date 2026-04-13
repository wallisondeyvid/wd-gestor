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

async function clearFuncionariosInUnits(...unidadeIds) {
  for (const unidadeId of unidadeIds) {
    const FuncionarioModel = getTenantModel(Funcionario, unidadeId);
    await FuncionarioModel.deleteMany({});
  }
}

async function createFuncionarioInTenant(unidadeId, { nome, email, cpf, sexo = 'M' }) {
  const FuncionarioModel = getTenantModel(Funcionario, unidadeId);
  return FuncionarioModel.create({
    unidade_id: unidadeId,
    nome,
    rg: buildRg(),
    cpf,
    data_nascimento: new Date('1990-01-01T00:00:00.000Z'),
    sexo,
    endereco: { cep: '01001000' },
    email,
    telefone: '(11) 99999-9999',
    ativo: true,
  });
}

async function authenticateContextualAgent(app, { unidadeId, papelContextual = 'gestor' }) {
  const email = uniqueEmail('funcionario-crud-context');
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
    origem: 'gestor-funcionarios-crud-unit-scope-canonical-test',
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });

  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, email };
}

function buildCreatePayload({ unidadeId, nome, email, cpf }) {
  return {
    unidade_id: normalizeId(unidadeId),
    nome,
    rg: buildRg(),
    cpf,
    data_nascimento: '1990-01-01',
    sexo: 'M',
    endereco: {
      cep: '01001000',
      logradouro: 'Rua Teste',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Sao Paulo',
      uf: 'SP',
    },
    email,
    telefone: '(11) 99999-0000',
  };
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

async function withHarness(run) {
  const harness = await getSharedHarness();
  await clearFuncionariosInUnits(harness.unidadeA._id, harness.unidadeB._id, harness.unidadeC._id);

  await run({
    app: harness.app,
    unidadeA: harness.unidadeA,
    unidadeB: harness.unidadeB,
    unidadeC: harness.unidadeC,
    contextualAgent: harness.contextualAgent,
  });
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

test.after(async () => {
  await disposeSharedHarness();
});

test('Funcionarios CRUD API: POST contextual cria apenas na unidade ativa selecionada', async () => {
  await withHarness(async ({ unidadeB, unidadeC, contextualAgent }) => {
    const blockedRes = await contextualAgent
      .post('/gestor/api/funcionarios')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildCreatePayload({
        unidadeId: unidadeC._id,
        nome: `Funcionario Bloqueado ${Date.now()}-${nextCounter()}`,
        email: uniqueEmail('func-bloq'),
        cpf: uniqueCpf(),
      }));

    assert.equal(blockedRes.status, 404);

    const createRes = await contextualAgent
      .post('/gestor/api/funcionarios')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildCreatePayload({
        unidadeId: unidadeB._id,
        nome: `Funcionario Contextual ${Date.now()}-${nextCounter()}`,
        email: uniqueEmail('func-ok'),
        cpf: uniqueCpf(),
      }));

    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const createdId = String(createRes.body?.data?.id || createRes.body?.data?._id || createRes.body?.id || createRes.body?._id || '');
    assert.ok(createdId);

    const createdInB = await getTenantModel(Funcionario, unidadeB._id).findById(createdId).lean();
    const createdInC = await getTenantModel(Funcionario, unidadeC._id)
      .findOne({ _id: createdId, unidade_id: unidadeC._id })
      .lean();

    assert.ok(createdInB);
    assert.equal(String(createdInB.unidade_id), normalizeId(unidadeB._id));
    assert.equal(createdInC, null);
  });
});

test('Funcionarios CRUD API: GET por id nao alcanca funcionario fora da unidade ativa', async () => {
  await withHarness(async ({ unidadeB, unidadeC, contextualAgent }) => {
    const funcionarioB = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-get-b'),
      cpf: uniqueCpf(),
    });
    const funcionarioC = await createFuncionarioInTenant(unidadeC._id, {
      nome: `Funcionario C ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-get-c'),
      cpf: uniqueCpf(),
    });

    const okRes = await contextualAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionarioB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(okRes.status, 200, JSON.stringify(okRes.body));
    const okPayload = okRes.body?.data || okRes.body;
    assert.equal(String(okPayload._id), normalizeId(funcionarioB._id));

    const blockedRes = await contextualAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionarioC._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(blockedRes.status, 404);
  });
});

test('Funcionarios CRUD API: PUT incremental atualiza apenas o funcionario da unidade ativa', async () => {
  await withHarness(async ({ unidadeB, unidadeC, contextualAgent }) => {
    const funcionarioB = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Update B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-put-b'),
      cpf: uniqueCpf(),
    });
    const funcionarioC = await createFuncionarioInTenant(unidadeC._id, {
      nome: `Funcionario Update C ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-put-c'),
      cpf: uniqueCpf(),
    });

    const updateRes = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionarioB._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: 'Funcionario Atualizado Contextualmente' });

    assert.equal(updateRes.status, 200, JSON.stringify(updateRes.body));
    const updatedB = await getTenantModel(Funcionario, unidadeB._id).findById(funcionarioB._id).lean();
    assert.equal(updatedB.nome, 'Funcionario Atualizado Contextualmente');

    const blockedRes = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionarioC._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ nome: 'Nao Deve Atualizar' });

    assert.equal(blockedRes.status, 404);
    const preservedC = await getTenantModel(Funcionario, unidadeC._id).findById(funcionarioC._id).lean();
    assert.equal(preservedC.nome, funcionarioC.nome);
  });
});

test('Funcionarios CRUD API: DELETE remove apenas o funcionario da unidade ativa', async () => {
  await withHarness(async ({ unidadeB, unidadeC, contextualAgent }) => {
    const funcionarioB = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Delete B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-del-b'),
      cpf: uniqueCpf(),
    });
    const funcionarioC = await createFuncionarioInTenant(unidadeC._id, {
      nome: `Funcionario Delete C ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-del-c'),
      cpf: uniqueCpf(),
    });

    const blockedRes = await contextualAgent
      .delete(`/gestor/api/funcionarios/${normalizeId(funcionarioC._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(blockedRes.status, 404);

    const deleteRes = await contextualAgent
      .delete(`/gestor/api/funcionarios/${normalizeId(funcionarioB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(deleteRes.status, 200, JSON.stringify(deleteRes.body));
    const deletedB = await getTenantModel(Funcionario, unidadeB._id).findById(funcionarioB._id).lean();
    const preservedC = await getTenantModel(Funcionario, unidadeC._id).findById(funcionarioC._id).lean();
    assert.equal(deletedB, null);
    assert.ok(preservedC);
  });
});

test('Funcionarios auxiliares API: disponiveis e match respeitam a unidade ativa', async () => {
  await withHarness(async ({ unidadeB, unidadeC, contextualAgent }) => {
    const funcionarioB = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Disponivel B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-b'),
      cpf: uniqueCpf(),
    });
    const funcionarioC = await createFuncionarioInTenant(unidadeC._id, {
      nome: `Funcionario Disponivel C ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-c'),
      cpf: uniqueCpf(),
    });

    const disponiveisContextoRes = await contextualAgent
      .get(`/gestor/api/funcionarios/disponiveis/${normalizeId(unidadeB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(disponiveisContextoRes.status, 200);
    const disponiveisContexto = Array.isArray(disponiveisContextoRes.body)
      ? disponiveisContextoRes.body
      : (Array.isArray(disponiveisContextoRes.body?.data) ? disponiveisContextoRes.body.data : []);
    assert.ok(disponiveisContexto.some((item) => String(item?._id) === normalizeId(funcionarioB._id)));
    assert.equal(disponiveisContexto.some((item) => String(item?._id) === normalizeId(funcionarioC._id)), false);

    const disponiveisForaRes = await contextualAgent
      .get(`/gestor/api/funcionarios/disponiveis/${normalizeId(unidadeC._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(disponiveisForaRes.status, 200);
    const disponiveisFora = Array.isArray(disponiveisForaRes.body)
      ? disponiveisForaRes.body
      : (Array.isArray(disponiveisForaRes.body?.data) ? disponiveisForaRes.body.data : []);
    assert.equal(disponiveisFora.length, 0);

    const matchContextoRes = await contextualAgent
      .get('/gestor/api/funcionarios/match')
      .query({ cpf: funcionarioB.cpf })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(matchContextoRes.status, 200);
    const matchContexto = matchContextoRes.body?.data || matchContextoRes.body;
    assert.equal(matchContexto.exists, true);
    assert.equal(String(matchContexto.funcionario?._id), normalizeId(funcionarioB._id));

    const matchForaRes = await contextualAgent
      .get('/gestor/api/funcionarios/match')
      .query({ cpf: funcionarioC.cpf, unidade_id: normalizeId(unidadeC._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(matchForaRes.status, 200);
    const matchFora = matchForaRes.body?.data || matchForaRes.body;
    assert.equal(matchFora.exists, false);
  });
});