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

async function authenticateContextualAgent(app, { unidadeId, prefix, papelContextual = 'gestor' }) {
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
    nome: `Gestor Create Foto ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gf-create-foto',
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
    const contextualAuth = await authenticateContextualAgent(app, {
      unidadeId: unidadeB._id,
      prefix: 'funcionario-create-foto-context',
      papelContextual: 'gestor',
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

function buildBaseCreatePayload(unidadeId, overrides = {}) {
  return {
    unidade_id: normalizeId(unidadeId),
    nome: `Funcionario Create Foto ${Date.now()}-${nextCounter()}`,
    rg: buildRg(),
    cpf: uniqueCpf(),
    data_nascimento: '1990-01-01',
    sexo: 'M',
    'endereco[cep]': '01001000',
    email: uniqueEmail('funcionario-create-foto-runtime'),
    telefone: '(11) 99999-9999',
    ...overrides,
  };
}

function attachBaseFields(req, payload) {
  Object.entries(payload).forEach(([key, value]) => {
    req.field(key, value);
  });
  return req;
}

async function fetchPersistedFuncionario(unidadeId, funcionarioId) {
  return getTenantModel(Funcionario, unidadeId).findById(funcionarioId).lean();
}

function hasBlobRuntimeEnabled() {
  return !!process.env.VERCEL
    || !!process.env.BLOB_READ_WRITE_TOKEN
    || !!process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
    || !!process.env.VERCEL_BLOB_RW_TOKEN;
}

function tinyPngBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/e+mz5QAAAABJRU5ErkJggg==',
    'base64',
  );
}

function invalidImageBuffer() {
  return Buffer.from('not-a-real-image-buffer', 'utf8');
}

test('sem sessao', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const res = await request(app)
      .post('/gestor/api/funcionarios')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .field(buildBaseCreatePayload(unidadeB._id));

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('fora do escopo contextual', async () => {
  await withHarness(async ({ unidadeC, contextualAgent }) => {
    const res = await attachBaseFields(
      contextualAgent
        .post('/gestor/api/funcionarios')
        .set('Accept', 'application/json')
        .set('Connection', 'close'),
      buildBaseCreatePayload(unidadeC._id),
    );

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Unidade não encontrada', JSON.stringify(res.body));
  });
});

test('sucesso sem foto', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await attachBaseFields(
      contextualAgent
        .post('/gestor/api/funcionarios')
        .set('Accept', 'application/json')
        .set('Connection', 'close'),
      buildBaseCreatePayload(unidadeB._id),
    );

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.created, true, JSON.stringify(res.body));
    assert.equal(typeof res.body?.id, 'string', JSON.stringify(res.body));
    assert.equal(res.body?.data?.id, res.body.id, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.ok(persisted, JSON.stringify(res.body));
    assert.ok(!persisted?.foto, JSON.stringify(persisted));
  });
});

test('sucesso com foto observa o contrato real do ambiente', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await attachBaseFields(
      contextualAgent
        .post('/gestor/api/funcionarios')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('foto', tinyPngBuffer(), { filename: 'foto-create.png', contentType: 'image/png' }),
      buildBaseCreatePayload(unidadeB._id),
    );

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.created, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.ok(persisted, JSON.stringify(res.body));

    if (hasBlobRuntimeEnabled()) {
      assert.equal(typeof persisted?.foto, 'string', JSON.stringify(persisted));
      assert.match(String(persisted?.foto || ''), /^https?:\/\//, JSON.stringify(persisted));
    } else {
      assert.ok(!persisted?.foto, JSON.stringify(persisted));
    }
  });
});

test('falha de upload da foto nao derruba o create', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await attachBaseFields(
      contextualAgent
        .post('/gestor/api/funcionarios')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('foto', invalidImageBuffer(), { filename: 'foto-invalida.png', contentType: 'image/png' }),
      buildBaseCreatePayload(unidadeB._id),
    );

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.created, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.ok(persisted, JSON.stringify(res.body));
    assert.ok(!persisted?.foto, JSON.stringify(persisted));
  });
});

test('erro interno induzido no create desse recorte', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);
    const originalCreate = FuncionarioModel.create;

    FuncionarioModel.create = async function mockedCreate() {
      throw new Error('forced create-foto failure');
    };

    try {
      const res = await attachBaseFields(
        contextualAgent
          .post('/gestor/api/funcionarios')
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .attach('foto', tinyPngBuffer(), { filename: 'foto-create-erro.png', contentType: 'image/png' }),
        buildBaseCreatePayload(unidadeB._id),
      );

      assert.equal(res.status, 500, JSON.stringify(res.body));
      assert.equal(res.body?.success, false, JSON.stringify(res.body));
      assert.equal(res.body?.code, 'SERVER_ERROR', JSON.stringify(res.body));
      assert.equal(res.body?.message, 'Erro interno', JSON.stringify(res.body));
    } finally {
      FuncionarioModel.create = originalCreate;
    }
  });
});