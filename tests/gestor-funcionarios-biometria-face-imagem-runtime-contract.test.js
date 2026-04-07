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
    nome: overrides.nome || `Funcionario Face Imagem ${Date.now()}-${nextCounter()}`,
    rg: overrides.rg || buildRg(),
    cpf: overrides.cpf || uniqueCpf(),
    data_nascimento: overrides.data_nascimento || new Date('1990-01-01T00:00:00.000Z'),
    sexo: overrides.sexo || 'M',
    endereco: overrides.endereco || { cep: '01001000' },
    email: overrides.email || uniqueEmail('funcionario-biometria-face-imagem-runtime'),
    telefone: overrides.telefone || '(11) 99999-9999',
    ativo: overrides.ativo ?? true,
    ...overrides,
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
    nome: `Gestor Face Imagem ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gestor-func-face-imagem-test',
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
        prefix: 'funcionario-face-imagem-context',
      });
      const outsiderAuth = await authenticateContextualAgent(app, {
        unidadeId: unidadeC._id,
        prefix: 'funcionario-face-imagem-outsider',
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

test.after(async () => {
  await disposeSharedHarness();
});

function validFaceDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ3sAAAAASUVORK5CYII=';
}

function invalidButDataUrlLikeFaceDataUrl() {
  return 'data:image/png;base64,Zm9v';
}

async function fetchPersistedFuncionario(unidadeId, funcionarioId) {
  return getTenantModel(Funcionario, unidadeId).findById(funcionarioId).lean();
}

async function withFakeBlobEnvironment(run) {
  const prevBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const prevTenantBlobToken = process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN;

  process.env.BLOB_READ_WRITE_TOKEN = 'fake-face-imagem-token';
  process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN = 'fake-face-imagem-token';

  try {
    await run();
  } finally {
    if (prevBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlobToken;

    if (prevTenantBlobToken === undefined) delete process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN;
    else process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN = prevTenantBlobToken;
  }
}

test('PUT full face_imagem: sem sessao retorna 401', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_imagem: validFaceDataUrl() });

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('PUT incremental face_imagem: sem sessao retorna 401', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_imagem: validFaceDataUrl() });

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('PUT full face_imagem: fora do escopo contextual retorna 404', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await outsiderAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_imagem: validFaceDataUrl() });

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Funcionário não encontrado', JSON.stringify(res.body));
  });
});

test('PUT incremental face_imagem: fora do escopo contextual retorna 404', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await outsiderAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_imagem: validFaceDataUrl() });

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Funcionário não encontrado', JSON.stringify(res.body));
  });
});

test('PUT full face_imagem: valor nao-data-url e ignorado pelo ramo de conversao', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      face_imagem: 'face-antiga-full',
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_imagem: 'preview-manual-full' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.face_imagem, 'preview-manual-full', JSON.stringify(persisted));
  });
});

test('PUT incremental face_imagem: valor nao-data-url e ignorado pelo ramo de conversao', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      face_imagem: 'face-antiga-inc',
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_imagem: 'preview-manual-inc' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.face_imagem, 'preview-manual-inc', JSON.stringify(persisted));
  });
});

test('PUT full face_imagem: data-url valida com Blob indisponivel preserva payload original e segue', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);
    const dataUrl = validFaceDataUrl();

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_imagem: dataUrl });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.face_imagem, dataUrl, JSON.stringify(persisted));
  });
});

test('PUT incremental face_imagem: data-url valida com Blob indisponivel preserva payload original e segue', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);
    const dataUrl = validFaceDataUrl();

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_imagem: dataUrl });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.face_imagem, dataUrl, JSON.stringify(persisted));
  });
});

test('PUT full face_imagem: falha induzida na conversao facial degrada silenciosamente e segue', async () => {
  await withFakeBlobEnvironment(async () => {
    await withHarness(async ({ unidadeB, contextualAgent }) => {
      const funcionario = await createFuncionarioInTenant(unidadeB._id);
      const dataUrl = invalidButDataUrlLikeFaceDataUrl();

      const res = await contextualAgent
        .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ face_imagem: dataUrl });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.success, true, JSON.stringify(res.body));
      assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

      const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
      assert.equal(persisted.face_imagem, dataUrl, JSON.stringify(persisted));
    });
  });
});

test('PUT incremental face_imagem: falha induzida na conversao facial degrada silenciosamente e segue', async () => {
  await withFakeBlobEnvironment(async () => {
    await withHarness(async ({ unidadeB, contextualAgent }) => {
      const funcionario = await createFuncionarioInTenant(unidadeB._id);
      const dataUrl = invalidButDataUrlLikeFaceDataUrl();

      const res = await contextualAgent
        .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ face_imagem: dataUrl });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.success, true, JSON.stringify(res.body));
      assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

      const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
      assert.equal(persisted.face_imagem, dataUrl, JSON.stringify(persisted));
    });
  });
});