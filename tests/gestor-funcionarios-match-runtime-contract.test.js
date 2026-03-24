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

async function createFuncionarioInTenant(unidadeId, { nome, email, cpf, sexo = 'M', usuarioId = null }) {
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
    usuario_id: usuarioId,
  });
}

async function authenticateContextualAgent(app, { unidadeId, papelContextual = 'gestor', emailPrefix = 'funcionario-match-runtime' }) {
  const email = uniqueEmail(emailPrefix);
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
    nome: `Match Runtime ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gestor-funcionarios-match-runtime-contract-test',
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

async function withHarness(run) {
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
    const contextualAuth = await authenticateContextualAgent(app, { unidadeId: unidadeB._id });
    const outsiderAuth = await authenticateContextualAgent(app, {
      unidadeId: unidadeC._id,
      emailPrefix: 'funcionario-match-runtime-outsider',
    });
    createdEmails.push(contextualAuth.email, outsiderAuth.email);

    await run({
      app,
      unidadeA,
      unidadeB,
      unidadeC,
      contextualAgent: contextualAuth.agent,
      outsiderAgent: outsiderAuth.agent,
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

function getPayload(body) {
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') return body.data;
  return body;
}

test('GET /gestor/api/funcionarios/match sem sessao retorna unauthorized em JSON', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const res = await request(app)
      .get(`/gestor/api/funcionarios/match?cpf=12345678901&unidade_id=${normalizeId(unidadeB._id)}`)
      .set('Connection', 'close');

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('GET /gestor/api/funcionarios/match fora do escopo contextual responde exists false', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const cpf = uniqueCpf();
    await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Match Fora Escopo ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-match-fora-escopo'),
      cpf,
    });

    const res = await outsiderAgent
      .get(`/gestor/api/funcionarios/match?cpf=${cpf}&unidade_id=${normalizeId(unidadeB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    const payload = getPayload(res.body);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(payload?.exists, false, JSON.stringify(res.body));
  });
});

test('GET /gestor/api/funcionarios/match sem match responde exists false', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .get(`/gestor/api/funcionarios/match?cpf=${uniqueCpf()}&unidade_id=${normalizeId(unidadeB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    const payload = getPayload(res.body);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(payload?.exists, false, JSON.stringify(res.body));
  });
});

test('GET /gestor/api/funcionarios/match com match responde dados minimos e canLink', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const cpf = uniqueCpf();
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Match Positivo ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-match-ok'),
      cpf,
    });

    const res = await contextualAgent
      .get(`/gestor/api/funcionarios/match?cpf=${cpf}&unidade_id=${normalizeId(unidadeB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    const payload = getPayload(res.body);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(payload?.exists, true, JSON.stringify(res.body));
    assert.equal(payload?.matchType, 'cpf+unidade', JSON.stringify(res.body));
    assert.equal(payload?.canLink, true, JSON.stringify(res.body));
    assert.equal(normalizeId(payload?.funcionario?._id), normalizeId(funcionario._id), JSON.stringify(res.body));
    assert.equal(payload?.funcionario?.nome, funcionario.nome, JSON.stringify(res.body));
    assert.equal(payload?.funcionario?.cpf, funcionario.cpf, JSON.stringify(res.body));
    assert.equal(payload?.funcionario?.email, funcionario.email, JSON.stringify(res.body));
    assert.equal(normalizeId(payload?.funcionario?.unidade_id), normalizeId(unidadeB._id), JSON.stringify(res.body));
    assert.equal(payload?.funcionario?.usuario_id, null, JSON.stringify(res.body));
    assert.equal(payload?.funcionario?.hasUsuario, false, JSON.stringify(res.body));
  });
});

test('GET /gestor/api/funcionarios/match propaga falha interna como 500 JSON', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);
    const originalFindOne = FuncionarioModel.findOne;
    FuncionarioModel.findOne = function patchedFindOne() {
      throw new Error('forced match failure');
    };

    try {
      const res = await contextualAgent
        .get(`/gestor/api/funcionarios/match?cpf=${uniqueCpf()}&unidade_id=${normalizeId(unidadeB._id)}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 500, JSON.stringify(res.body));
      assert.equal(res.body?.success, false, JSON.stringify(res.body));
    } finally {
      FuncionarioModel.findOne = originalFindOne;
    }
  });
});