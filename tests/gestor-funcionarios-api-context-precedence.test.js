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
const authContextHarness = {
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
const legacyFallbackHarness = {
  promise: null,
  app: null,
  close: null,
  teardownGuard: null,
  prevMongoMemory: undefined,
  prevAuthContextFlag: undefined,
  unidadeA: null,
  unidadeB: null,
  unidadeC: null,
  legacyAgent: null,
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

async function authenticateContextualAgent(app, { activeUnidadeId, legacyUnidadeId = null }) {
  const email = uniqueEmail('funcionario-context-precedence');
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  const payload = {
    email,
    senha: senhaHash,
    cpf: uniqueCpf(),
    role: 'user',
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: `Gestor Contextual ${nextCounter()}`,
  };

  if (legacyUnidadeId) payload.unidade_id = legacyUnidadeId;

  const user = await User.create(payload);

  await UserMembership.create({
    user_id: user._id,
    unidade_id: activeUnidadeId,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-funcionarios-api-context-precedence-test',
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

async function authenticateLegacyAgent(app, { legacyUnidadeId }) {
  const email = uniqueEmail('funcionario-legacy-precedence');
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  await User.create({
    email,
    senha: senhaHash,
    cpf: uniqueCpf(),
    role: 'diretor',
    unidade_id: legacyUnidadeId,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: `Diretor Legado ${nextCounter()}`,
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });

  assert.ok(
    loginRes.status >= 300 && loginRes.status < 400,
    `Login legado deve redirecionar, recebido ${loginRes.status} com body ${JSON.stringify(loginRes.body)}`,
  );

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

function extractArrayPayload(res) {
  if (Array.isArray(res.body)) return res.body;
  if (Array.isArray(res.body?.data)) return res.body.data;
  return [];
}

async function getAuthContextHarness({ legacyUnidadeId = null } = {}) {
  if (!authContextHarness.promise) {
    authContextHarness.promise = (async () => {
      authContextHarness.prevMongoMemory = process.env.MONGO_MEMORY;
      authContextHarness.prevAuthContextFlag = process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      process.env.MONGO_MEMORY = '1';
      process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '1';

      const { app, close } = await createServer({ skipDb: false });
      app.locals.gestorAuthContextFeatureFlags = {
        gestor_auth_context_resolver: true,
      };
      delete app.locals.gestorAuthContextResolverDeps;
      delete app.locals.gestorAuthContextMaxTimeMS;

      const { unidadeA, unidadeB, unidadeC } = await createModuloAndUnits();
      const resolvedLegacyUnidadeId = legacyUnidadeId === 'unidadeA'
        ? unidadeA._id
        : legacyUnidadeId === 'unidadeB'
          ? unidadeB._id
          : legacyUnidadeId === 'unidadeC'
            ? unidadeC._id
            : null;
      const contextualAuth = await authenticateContextualAgent(app, {
        activeUnidadeId: unidadeB._id,
        legacyUnidadeId: resolvedLegacyUnidadeId,
      });

      authContextHarness.app = app;
      authContextHarness.close = close;
      authContextHarness.teardownGuard = installTeardownSuppression();
      authContextHarness.unidadeA = unidadeA;
      authContextHarness.unidadeB = unidadeB;
      authContextHarness.unidadeC = unidadeC;
      authContextHarness.contextualAgent = contextualAuth.agent;
      authContextHarness.createdEmails = [contextualAuth.email];
      return authContextHarness;
    })();
  }

  return authContextHarness.promise;
}

async function withAuthContextHarness(run, { legacyUnidadeId = null } = {}) {
  const harness = await getAuthContextHarness({ legacyUnidadeId });
  await clearFuncionariosInUnits(harness.unidadeA._id, harness.unidadeB._id, harness.unidadeC._id);

  await run({
    app: harness.app,
    unidadeA: harness.unidadeA,
    unidadeB: harness.unidadeB,
    unidadeC: harness.unidadeC,
    contextualAgent: harness.contextualAgent,
  });
}

async function disposeHarness(target) {
  if (!target.promise) return;

  try {
    await target.promise;
    if (target.createdEmails.length > 0) {
      try {
        await User.deleteMany({ email: { $in: target.createdEmails } });
      } catch {}
    }
    await closeWithTeardownGuard(target.close, target.teardownGuard);
  } finally {
    try {
      if (target.teardownGuard) {
        await target.teardownGuard.remove();
      }
    } finally {
      if (target.prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = target.prevMongoMemory;
      if (target.prevAuthContextFlag === undefined) delete process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      else process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = target.prevAuthContextFlag;

      target.promise = null;
      target.app = null;
      target.close = null;
      target.teardownGuard = null;
      target.prevMongoMemory = undefined;
      target.prevAuthContextFlag = undefined;
      target.unidadeA = null;
      target.unidadeB = null;
      target.unidadeC = null;
      target.contextualAgent = null;
      target.legacyAgent = null;
      target.createdEmails = [];
    }
  }
}

async function getLegacyFallbackHarness() {
  if (!legacyFallbackHarness.promise) {
    legacyFallbackHarness.promise = (async () => {
      legacyFallbackHarness.prevMongoMemory = process.env.MONGO_MEMORY;
      legacyFallbackHarness.prevAuthContextFlag = process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      process.env.MONGO_MEMORY = '1';
      process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '0';

      const { app, close } = await createServer({ skipDb: false });
      app.locals.gestorAuthContextFeatureFlags = {
        gestor_auth_context_resolver: false,
      };
      delete app.locals.gestorAuthContextResolverDeps;
      delete app.locals.gestorAuthContextMaxTimeMS;

      const { unidadeA, unidadeB, unidadeC } = await createModuloAndUnits();
      const legacyAuth = await authenticateLegacyAgent(app, {
        legacyUnidadeId: unidadeB._id,
      });

      legacyFallbackHarness.app = app;
      legacyFallbackHarness.close = close;
      legacyFallbackHarness.teardownGuard = installTeardownSuppression();
      legacyFallbackHarness.unidadeA = unidadeA;
      legacyFallbackHarness.unidadeB = unidadeB;
      legacyFallbackHarness.unidadeC = unidadeC;
      legacyFallbackHarness.legacyAgent = legacyAuth.agent;
      legacyFallbackHarness.createdEmails = [legacyAuth.email];
      return legacyFallbackHarness;
    })();
  }

  return legacyFallbackHarness.promise;
}

async function withLegacyFallbackHarness(run) {
  await disposeHarness(authContextHarness);
  const harness = await getLegacyFallbackHarness();
  await clearFuncionariosInUnits(harness.unidadeA._id, harness.unidadeB._id, harness.unidadeC._id);

  await run({
    app: harness.app,
    unidadeA: harness.unidadeA,
    unidadeB: harness.unidadeB,
    unidadeC: harness.unidadeC,
    legacyAgent: harness.legacyAgent,
  });
}

test.after(async () => {
  await disposeHarness(authContextHarness);
  await disposeHarness(legacyFallbackHarness);
});

test('Funcionarios API contexto: GET por id prioriza authContext ativo sobre legado divergente', async () => {
  await withAuthContextHarness(async ({ unidadeB, unidadeC, contextualAgent }) => {
    const funcionarioB = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Auth Context B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-auth-b'),
      cpf: uniqueCpf(),
    });
    const funcionarioC = await createFuncionarioInTenant(unidadeC._id, {
      nome: `Funcionario Auth Context C ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-auth-c'),
      cpf: uniqueCpf(),
    });

    const okRes = await contextualAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionarioB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(okRes.status, 200, JSON.stringify(okRes.body));
    const okPayload = okRes.body?.data || okRes.body;
    assert.equal(String(okPayload?._id || ''), normalizeId(funcionarioB._id));

    const blockedRes = await contextualAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionarioC._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(blockedRes.status, 404, JSON.stringify(blockedRes.body));
  }, { legacyUnidadeId: 'unidadeC' });
});

test('Funcionarios API contexto: POST com query e body divergentes falha cedo sem fallback legado', async () => {
  await withLegacyFallbackHarness(async ({ unidadeB, unidadeC, legacyAgent }) => {
    const nome = `Funcionario Query Scope ${Date.now()}-${nextCounter()}`;
    const email = uniqueEmail('func-query-scope');
    const cpf = uniqueCpf();

    const res = await legacyAgent
      .post('/gestor/api/funcionarios')
      .query({ unidade_id: normalizeId(unidadeC._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildCreatePayload({
        unidadeId: unidadeB._id,
        nome,
        email,
        cpf,
      }));

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.error, 'UNIDADE_ID_REQUIRED', JSON.stringify(res.body));

    const createdInB = await getTenantModel(Funcionario, unidadeB._id).findOne({ email }).lean();
    const createdInC = await getTenantModel(Funcionario, unidadeC._id).findOne({ email }).lean();

    assert.equal(createdInB, null);
    assert.equal(createdInC, null);
  });
});

test('Funcionarios API contexto: initial sem escopo canônico falha cedo sem fallback legado', async () => {
  await withLegacyFallbackHarness(async ({ unidadeA, unidadeB, legacyAgent }) => {
    const nome = `Funcionario Initial Legacy ${Date.now()}-${nextCounter()}`;
    const email = uniqueEmail('func-initial-legacy');
    const cpf = uniqueCpf();

    const userCountBefore = await User.countDocuments();
    const membershipCountBefore = await UserMembership.countDocuments();

    const res = await legacyAgent
      .post('/gestor/api/funcionarios/initial')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildCreatePayload({
        unidadeId: unidadeB._id,
        nome,
        email,
        cpf,
      }));

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.error, 'UNIDADE_ID_REQUIRED', JSON.stringify(res.body));

    const createdInB = await getTenantModel(Funcionario, unidadeB._id).findOne({ email }).lean();
    const createdUser = await User.findOne({ email }).lean();
    const createdMembership = createdUser
      ? await UserMembership.findOne({ user_id: createdUser._id, unidade_id: unidadeB._id }).lean()
      : null;
    const userCountAfter = await User.countDocuments();
    const membershipCountAfter = await UserMembership.countDocuments();

    assert.equal(createdInB, null);
    assert.equal(createdUser, null);
    assert.equal(createdMembership, null);
    assert.equal(userCountAfter, userCountBefore);
    assert.equal(membershipCountAfter, membershipCountBefore);
  });
});

test('Funcionarios API contexto: disponiveis sem escopo canônico falha cedo sem fallback legado', async () => {
  await withLegacyFallbackHarness(async ({ unidadeA, unidadeB, legacyAgent }) => {
    await createFuncionarioInTenant(unidadeA._id, {
      nome: `Funcionario Principal A ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-legacy-a'),
      cpf: uniqueCpf(),
    });
    await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Filial B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-legacy-b'),
      cpf: uniqueCpf(),
    });

    const principalRes = await legacyAgent
      .get(`/gestor/api/funcionarios/disponiveis/${normalizeId(unidadeA._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(principalRes.status, 400, JSON.stringify(principalRes.body));
    assert.equal(principalRes.body?.success, false, JSON.stringify(principalRes.body));
    assert.equal(principalRes.body?.error, 'UNIDADE_ID_REQUIRED', JSON.stringify(principalRes.body));

    const filialRes = await legacyAgent
      .get(`/gestor/api/funcionarios/disponiveis/${normalizeId(unidadeB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(filialRes.status, 400, JSON.stringify(filialRes.body));
    assert.equal(filialRes.body?.success, false, JSON.stringify(filialRes.body));
    assert.equal(filialRes.body?.error, 'UNIDADE_ID_REQUIRED', JSON.stringify(filialRes.body));
  });
});

test('Funcionarios API contexto: disponiveis com query divergente falha cedo sem fallback legado', async () => {
  await withLegacyFallbackHarness(async ({ unidadeB, unidadeC, legacyAgent }) => {
    await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Disponivel B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-scope-b'),
      cpf: uniqueCpf(),
    });
    await createFuncionarioInTenant(unidadeC._id, {
      nome: `Funcionario Disponivel C ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-scope-c'),
      cpf: uniqueCpf(),
    });

    const res = await legacyAgent
      .get(`/gestor/api/funcionarios/disponiveis/${normalizeId(unidadeB._id)}`)
      .query({ unidade_id: normalizeId(unidadeC._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.error, 'UNIDADE_ID_REQUIRED', JSON.stringify(res.body));
  });
});

test('Funcionarios API contexto: match sem escopo canônico falha cedo sem fallback legado', async () => {
  await withLegacyFallbackHarness(async ({ unidadeA, unidadeB, legacyAgent }) => {
    const funcionarioA = await createFuncionarioInTenant(unidadeA._id, {
      nome: `Funcionario Match Principal A ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-match-legacy-a'),
      cpf: uniqueCpf(),
    });
    const funcionarioB = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Match Filial B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-match-legacy-b'),
      cpf: uniqueCpf(),
    });

    const matchFilialRes = await legacyAgent
      .get('/gestor/api/funcionarios/match')
      .query({ cpf: funcionarioB.cpf })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(matchFilialRes.status, 400, JSON.stringify(matchFilialRes.body));
    assert.equal(matchFilialRes.body?.success, false, JSON.stringify(matchFilialRes.body));
    assert.equal(matchFilialRes.body?.error, 'UNIDADE_ID_REQUIRED', JSON.stringify(matchFilialRes.body));

    const matchPrincipalRes = await legacyAgent
      .get('/gestor/api/funcionarios/match')
      .query({ cpf: funcionarioA.cpf, unidade_id: normalizeId(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(matchPrincipalRes.status, 400, JSON.stringify(matchPrincipalRes.body));
    assert.equal(matchPrincipalRes.body?.success, false, JSON.stringify(matchPrincipalRes.body));
    assert.equal(matchPrincipalRes.body?.error, 'UNIDADE_ID_REQUIRED', JSON.stringify(matchPrincipalRes.body));
  });
});