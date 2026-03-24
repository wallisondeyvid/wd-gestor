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
    nome: `Funcionario Create Runtime ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-funcionarios-create-runtime-contract-test',
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

function buildCreatePayload({ unidadeId, nome, email, cpf, overrides = {} }) {
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
    ...overrides,
  };
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
    const contextualAuth = await authenticateContextualAgent(app, {
      unidadeId: unidadeB._id,
      prefix: 'funcionario-create-runtime-context',
    });
    const outsiderAuth = await authenticateContextualAgent(app, {
      unidadeId: unidadeC._id,
      prefix: 'funcionario-create-runtime-outsider',
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

test('POST /gestor/api/funcionarios sem sessao retorna unauthorized em JSON', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const res = await request(app)
      .post('/gestor/api/funcionarios')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildCreatePayload({
        unidadeId: unidadeB._id,
        nome: `Funcionario Sem Sessao ${Date.now()}-${nextCounter()}`,
        email: uniqueEmail('func-create-sem-sessao'),
        cpf: uniqueCpf(),
      }));

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('POST /gestor/api/funcionarios fora do escopo contextual retorna not found', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const email = uniqueEmail('func-create-fora-escopo');

    const res = await outsiderAgent
      .post('/gestor/api/funcionarios')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildCreatePayload({
        unidadeId: unidadeB._id,
        nome: `Funcionario Fora Escopo ${Date.now()}-${nextCounter()}`,
        email,
        cpf: uniqueCpf(),
      }));

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Unidade não encontrada', JSON.stringify(res.body));

    const createdInScopedUnit = await getTenantModel(Funcionario, unidadeB._id).findOne({ email }).lean();
    assert.equal(createdInScopedUnit, null);
  });
});

test('POST /gestor/api/funcionarios com requireds ausentes retorna bad request com campos faltantes', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: normalizeId(unidadeB._id),
        nome: `Funcionario Required ${Date.now()}-${nextCounter()}`,
        cpf: uniqueCpf(),
      });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'BAD_REQUEST', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Campos obrigatórios ausentes', JSON.stringify(res.body));
    assert.deepEqual(
      res.body?.campos,
      ['rg', 'data_nascimento', 'sexo', 'endereco', 'email', 'telefone', 'endereco[cep]'],
      JSON.stringify(res.body),
    );
  });
});

test('POST /gestor/api/funcionarios com CPF duplicado na unidade retorna bad request e nao duplica documento', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const cpf = uniqueCpf();
    await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Existente ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-create-duplicado-base'),
      cpf,
    });

    const email = uniqueEmail('func-create-duplicado');
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildCreatePayload({
        unidadeId: unidadeB._id,
        nome: `Funcionario Duplicado ${Date.now()}-${nextCounter()}`,
        email,
        cpf,
      }));

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'BAD_REQUEST', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Já existe um funcionário cadastrado com este CPF nesta empresa.', JSON.stringify(res.body));

    const duplicates = await getTenantModel(Funcionario, unidadeB._id).find({ cpf }).lean();
    const attemptedEmail = await getTenantModel(Funcionario, unidadeB._id).findOne({ email }).lean();

    assert.equal(duplicates.length, 1);
    assert.equal(attemptedEmail, null);
  });
});

test('POST /gestor/api/funcionarios com sucesso cria base no tenant e expõe autoUser no contrato atual', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const nome = `Funcionario Sucesso ${Date.now()}-${nextCounter()}`;
    const email = uniqueEmail('func-create-success');
    const cpf = uniqueCpf();
    const userCountBefore = await User.countDocuments();
    const membershipCountBefore = await UserMembership.countDocuments();

    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
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
    assert.equal(res.body?.created, true, JSON.stringify(res.body));

    const createdId = normalizeId(res.body?.data?.id || res.body?.id);
    assert.ok(createdId, JSON.stringify(res.body));
    assert.equal(normalizeId(res.body?.id), createdId, JSON.stringify(res.body));
    assert.equal(res.body?.data?.id, createdId, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.outcome, 'created', JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.reusedUser, false, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.membershipCreated, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.funcionarioLinked, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.legacyUserLinked, false, JSON.stringify(res.body));

    const createdFuncionario = await getTenantModel(Funcionario, unidadeB._id).findById(createdId).lean();
    const createdUser = await User.findOne({ email }).lean();
    const createdMembership = createdUser
      ? await UserMembership.findOne({ user_id: createdUser._id, unidade_id: unidadeB._id }).lean()
      : null;
    const userCountAfter = await User.countDocuments();
    const membershipCountAfter = await UserMembership.countDocuments();

    assert.ok(createdFuncionario);
    assert.equal(normalizeId(createdFuncionario.unidade_id), normalizeId(unidadeB._id));
  assert.equal(createdFuncionario.nome, nome);
    assert.equal(createdFuncionario.email, email);
    assert.equal(createdFuncionario.cpf, cpf);
    assert.ok(createdUser);
    assert.ok(createdMembership);
    assert.equal(normalizeId(createdFuncionario.usuario_id), normalizeId(createdUser._id));
    assert.equal(normalizeId(createdMembership.funcionario_id), createdId);
    assert.equal(userCountAfter, userCountBefore + 1);
    assert.equal(membershipCountAfter, membershipCountBefore + 1);
  });
});

test('POST /gestor/api/funcionarios propaga falha interna como server error generico do owner atual', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);
    const originalCreate = FuncionarioModel.create;
    FuncionarioModel.create = async function patchedCreate() {
      throw new Error('forced create failure');
    };

    try {
      const res = await contextualAgent
        .post('/gestor/api/funcionarios')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send(buildCreatePayload({
          unidadeId: unidadeB._id,
          nome: `Funcionario Falha ${Date.now()}-${nextCounter()}`,
          email: uniqueEmail('func-create-failure'),
          cpf: uniqueCpf(),
        }));

      assert.equal(res.status, 500, JSON.stringify(res.body));
      assert.equal(res.body?.success, false, JSON.stringify(res.body));
      assert.equal(res.body?.code, 'SERVER_ERROR', JSON.stringify(res.body));
      assert.equal(res.body?.message, 'Erro interno', JSON.stringify(res.body));
    } finally {
      FuncionarioModel.create = originalCreate;
    }
  });
});