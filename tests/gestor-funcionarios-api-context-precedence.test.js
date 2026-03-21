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

async function withAuthContextHarness(run, { legacyUnidadeId = null } = {}) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  const prevAuthContextFlag = process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
  process.env.MONGO_MEMORY = '1';
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '1';

  const { app, close } = await createServer({ skipDb: false });
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: true,
  };
  delete app.locals.gestorAuthContextResolverDeps;
  delete app.locals.gestorAuthContextMaxTimeMS;

  const teardownGuard = installTeardownSuppression();
  const createdEmails = [];

  try {
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
    createdEmails.push(contextualAuth.email);

    await run({
      app,
      unidadeA,
      unidadeB,
      unidadeC,
      contextualAgent: contextualAuth.agent,
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
      if (prevAuthContextFlag === undefined) delete process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      else process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = prevAuthContextFlag;
    }
  }
}

async function withLegacyFallbackHarness(run) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  const prevAuthContextFlag = process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
  process.env.MONGO_MEMORY = '1';
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '0';

  const { app, close } = await createServer({ skipDb: false });
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: false,
  };
  delete app.locals.gestorAuthContextResolverDeps;
  delete app.locals.gestorAuthContextMaxTimeMS;

  const teardownGuard = installTeardownSuppression();
  const createdEmails = [];

  try {
    const { unidadeA, unidadeB, unidadeC } = await createModuloAndUnits();
    const legacyAuth = await authenticateLegacyAgent(app, {
      legacyUnidadeId: unidadeB._id,
    });
    createdEmails.push(legacyAuth.email);

    await run({
      app,
      unidadeA,
      unidadeB,
      unidadeC,
      legacyAgent: legacyAuth.agent,
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
      if (prevAuthContextFlag === undefined) delete process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      else process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = prevAuthContextFlag;
    }
  }
}

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

test('Funcionarios API contexto: POST com query e body divergentes retorna 404 no fallback legado atual', async () => {
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

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Unidade não encontrada', JSON.stringify(res.body));

    const createdInB = await getTenantModel(Funcionario, unidadeB._id).findOne({ email }).lean();
    const createdInC = await getTenantModel(Funcionario, unidadeC._id).findOne({ email }).lean();

    assert.equal(createdInB, null);
    assert.equal(createdInC, null);
  });
});

test('Funcionarios API contexto: initial no fallback legado com body na filial autenticada', async () => {
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

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const createdInB = await getTenantModel(Funcionario, unidadeB._id).findOne({ email }).lean();
    const createdUser = await User.findOne({ email }).lean();
    const createdMembership = createdUser
      ? await UserMembership.findOne({ user_id: createdUser._id, unidade_id: unidadeB._id }).lean()
      : null;
    const userCountAfter = await User.countDocuments();
    const membershipCountAfter = await UserMembership.countDocuments();

    assert.ok(createdInB);
    assert.equal(String(createdInB.unidade_id || ''), normalizeId(unidadeB._id));
    assert.ok(createdUser);
    assert.ok(createdMembership);
    assert.equal(userCountAfter, userCountBefore + 1);
    assert.equal(membershipCountAfter, membershipCountBefore + 1);
  });
});

test('Funcionarios API contexto: disponiveis no fallback legado converge para a unidade concreta da filial autenticada', async () => {
  await withLegacyFallbackHarness(async ({ unidadeA, unidadeB, legacyAgent }) => {
    const funcionarioA = await createFuncionarioInTenant(unidadeA._id, {
      nome: `Funcionario Principal A ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-legacy-a'),
      cpf: uniqueCpf(),
    });
    const funcionarioB = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Filial B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-legacy-b'),
      cpf: uniqueCpf(),
    });

    const principalRes = await legacyAgent
      .get(`/gestor/api/funcionarios/disponiveis/${normalizeId(unidadeA._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(principalRes.status, 200, JSON.stringify(principalRes.body));
    const principalData = extractArrayPayload(principalRes);
    assert.equal(principalData.length, 0, JSON.stringify(principalData));

    const filialRes = await legacyAgent
      .get(`/gestor/api/funcionarios/disponiveis/${normalizeId(unidadeB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(filialRes.status, 200, JSON.stringify(filialRes.body));
    const filialData = extractArrayPayload(filialRes);
    assert.ok(filialData.some((item) => String(item?._id || '') === normalizeId(funcionarioB._id)));
    assert.equal(filialData.some((item) => String(item?._id || '') === normalizeId(funcionarioA._id)), false);
  });
});

test('Funcionarios API contexto: disponiveis com query divergente preserva a unidade concreta do legado autenticado', async () => {
  await withLegacyFallbackHarness(async ({ unidadeB, unidadeC, legacyAgent }) => {
    const funcionarioB = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Disponivel B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-scope-b'),
      cpf: uniqueCpf(),
    });
    const funcionarioC = await createFuncionarioInTenant(unidadeC._id, {
      nome: `Funcionario Disponivel C ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-disp-scope-c'),
      cpf: uniqueCpf(),
    });

    const res = await legacyAgent
      .get(`/gestor/api/funcionarios/disponiveis/${normalizeId(unidadeB._id)}`)
      .query({ unidade_id: normalizeId(unidadeC._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const data = extractArrayPayload(res);
    assert.ok(data.some((item) => String(item?._id || '') === normalizeId(funcionarioB._id)));
    assert.equal(data.some((item) => String(item?._id || '') === normalizeId(funcionarioC._id)), false);
  });
});

test('Funcionarios API contexto: match no fallback legado converge para a unidade concreta da filial autenticada', async () => {
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

    assert.equal(matchFilialRes.status, 200, JSON.stringify(matchFilialRes.body));
    const matchFilial = matchFilialRes.body?.data || matchFilialRes.body;
    assert.equal(matchFilial.exists, true, JSON.stringify(matchFilial));
    assert.equal(String(matchFilial.funcionario?._id || ''), normalizeId(funcionarioB._id));

    const matchPrincipalRes = await legacyAgent
      .get('/gestor/api/funcionarios/match')
      .query({ cpf: funcionarioA.cpf, unidade_id: normalizeId(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(matchPrincipalRes.status, 200, JSON.stringify(matchPrincipalRes.body));
    const matchPrincipal = matchPrincipalRes.body?.data || matchPrincipalRes.body;
    assert.equal(matchPrincipal.exists, false, JSON.stringify(matchPrincipal));
  });
});