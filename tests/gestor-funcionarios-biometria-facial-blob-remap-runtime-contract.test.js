import assert from 'node:assert/strict';
import http from 'node:http';
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

async function createFuncionarioInTenant(unidadeId, overrides = {}) {
  const FuncionarioModel = getTenantModel(Funcionario, unidadeId);
  return FuncionarioModel.create({
    unidade_id: unidadeId,
    nome: overrides.nome || `Funcionario Blob Facial ${Date.now()}-${nextCounter()}`,
    rg: overrides.rg || buildRg(),
    cpf: overrides.cpf || uniqueCpf(),
    data_nascimento: overrides.data_nascimento || new Date('1990-01-01T00:00:00.000Z'),
    sexo: overrides.sexo || 'M',
    endereco: overrides.endereco || { cep: '01001000' },
    email: overrides.email || uniqueEmail('funcionario-biometria-facial-blob-remap-runtime'),
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
    nome: `Gestor Blob Facial ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gestor-func-face-blob-test',
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
      prefix: 'funcionario-face-blob-context',
    });
    const outsiderAuth = await authenticateContextualAgent(app, {
      unidadeId: unidadeC._id,
      prefix: 'funcionario-face-blob-outsider',
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

function validFaceDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ3sAAAAASUVORK5CYII=';
}

function buildFaceCapture(overrides = {}) {
  return {
    idx: overrides.idx ?? 0,
    hash: overrides.hash ?? `face-remap-${Date.now()}-${nextCounter()}`,
    imagem: overrides.imagem ?? validFaceDataUrl(),
    template_sha256: overrides.template_sha256 ?? 'sha-face-remap',
    qualidade: overrides.qualidade ?? '88',
  };
}

async function fetchPersistedFuncionario(unidadeId, funcionarioId) {
  return getTenantModel(Funcionario, unidadeId).findById(funcionarioId).lean();
}

async function withBlobEnvironment(run) {
  const prevBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const prevTenantBlobToken = process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN;
  const prevBlobApiUrl = process.env.VERCEL_BLOB_API_URL;

  process.env.BLOB_READ_WRITE_TOKEN = 'fake-face-blob-token';
  process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN = 'fake-face-blob-token';

  try {
    await run();
  } finally {
    if (prevBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlobToken;

    if (prevTenantBlobToken === undefined) delete process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN;
    else process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN = prevTenantBlobToken;

    if (prevBlobApiUrl === undefined) delete process.env.VERCEL_BLOB_API_URL;
    else process.env.VERCEL_BLOB_API_URL = prevBlobApiUrl;
  }
}

function buildBlobPutResponse(url) {
  return new Response(
    JSON.stringify({
      url,
      pathname: 'faces/runtime.webp',
      contentType: 'image/webp',
      contentDisposition: 'inline',
      downloadUrl: url,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

function buildBlobErrorResponse(code, message, status = 403) {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
      },
    }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  );
}

async function withMockedBlobFetch(mockImpl, run) {
  let server;
  let callCount = 0;
  const prevBlobApiUrl = process.env.VERCEL_BLOB_API_URL;

  server = http.createServer(async (req, res) => {
    callCount += 1;
    const response = await mockImpl(req);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const body = await response.text();
    res.end(body);
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${address.port}`;

    await run({
      getCallCount() {
        return callCount;
      },
    });
  } finally {
    await new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });

    if (prevBlobApiUrl === undefined) delete process.env.VERCEL_BLOB_API_URL;
    else process.env.VERCEL_BLOB_API_URL = prevBlobApiUrl;
  }
}

test('full sem sessao', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: JSON.stringify([buildFaceCapture()]) });

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('incremental sem sessao', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: JSON.stringify([buildFaceCapture()]) });

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('full fora do escopo contextual', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await outsiderAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: JSON.stringify([buildFaceCapture()]) });

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Funcionário não encontrado', JSON.stringify(res.body));
  });
});

test('incremental fora do escopo contextual', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await outsiderAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: JSON.stringify([buildFaceCapture()]) });

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Funcionário não encontrado', JSON.stringify(res.body));
  });
});

test('full com face_capturas_json valido e Blob indisponivel', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [],
    });
    const capture = buildFaceCapture({ hash: 'face-full-no-blob' });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: JSON.stringify([capture]) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-full-no-blob', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.imagem, capture.imagem, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.qualidade, 88, JSON.stringify(persisted));
  });
});

test('incremental com face_capturas_json valido e Blob indisponivel', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [],
    });
    const capture = buildFaceCapture({ hash: 'face-inc-no-blob' });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: JSON.stringify([capture]) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-inc-no-blob', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.imagem, capture.imagem, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.qualidade, 88, JSON.stringify(persisted));
  });
});

test('full com remapeamento Blob facial bem-sucedido', async (t) => {
  await withBlobEnvironment(async () => {
    await withMockedBlobFetch(async () => buildBlobPutResponse('https://blob.example/full-face-1.webp'), async ({ getCallCount }) => {
      await withHarness(async ({ unidadeB, contextualAgent }) => {
        const funcionario = await createFuncionarioInTenant(unidadeB._id, {
          biometrias_facial: [],
        });

        const res = await contextualAgent
          .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .send({ face_capturas_json: JSON.stringify([buildFaceCapture({ hash: 'face-full-blob-ok' })]) });

        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body?.success, true, JSON.stringify(res.body));
        assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

        const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
        assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.hash, 'face-full-blob-ok', JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.imagem, 'https://blob.example/full-face-1.webp', JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.qualidade, 88, JSON.stringify(persisted));
        assert.equal(getCallCount() > 0, true);
      });
    });
  });
});

test('incremental com remapeamento Blob facial bem-sucedido', async (t) => {
  await withBlobEnvironment(async () => {
    await withMockedBlobFetch(async () => buildBlobPutResponse('https://blob.example/incremental-face-1.webp'), async ({ getCallCount }) => {
      await withHarness(async ({ unidadeB, contextualAgent }) => {
        const funcionario = await createFuncionarioInTenant(unidadeB._id, {
          biometrias_facial: [],
        });

        const res = await contextualAgent
          .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .send({ face_capturas_json: JSON.stringify([buildFaceCapture({ hash: 'face-inc-blob-ok' })]) });

        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body?.success, true, JSON.stringify(res.body));
        assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

        const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
        assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.hash, 'face-inc-blob-ok', JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.imagem, 'https://blob.example/incremental-face-1.webp', JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.qualidade, 88, JSON.stringify(persisted));
        assert.equal(getCallCount() > 0, true);
      });
    });
  });
});

test('full com falha induzida em mapBiometriasFaciaisToBlob', async (t) => {
  await withBlobEnvironment(async () => {
    await withMockedBlobFetch(async () => buildBlobErrorResponse('forbidden', 'forced blob put failure full'), async ({ getCallCount }) => {
      await withHarness(async ({ unidadeB, contextualAgent }) => {
        const funcionario = await createFuncionarioInTenant(unidadeB._id, {
          biometrias_facial: [],
        });
        const capture = buildFaceCapture({ hash: 'face-full-blob-fail' });

        const res = await contextualAgent
          .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .send({ face_capturas_json: JSON.stringify([capture]) });

        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body?.success, true, JSON.stringify(res.body));
        assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

        const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
        assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.hash, 'face-full-blob-fail', JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.imagem, capture.imagem, JSON.stringify(persisted));
        assert.equal(getCallCount() > 0, true);
      });
    });
  });
});

test('incremental com falha induzida em mapBiometriasFaciaisToBlob', async (t) => {
  await withBlobEnvironment(async () => {
    await withMockedBlobFetch(async () => buildBlobErrorResponse('forbidden', 'forced blob put failure incremental'), async ({ getCallCount }) => {
      await withHarness(async ({ unidadeB, contextualAgent }) => {
        const funcionario = await createFuncionarioInTenant(unidadeB._id, {
          biometrias_facial: [],
        });
        const capture = buildFaceCapture({ hash: 'face-inc-blob-fail' });

        const res = await contextualAgent
          .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .send({ face_capturas_json: JSON.stringify([capture]) });

        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body?.success, true, JSON.stringify(res.body));
        assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

        const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
        assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.hash, 'face-inc-blob-fail', JSON.stringify(persisted));
        assert.equal(persisted.biometrias_facial[0]?.imagem, capture.imagem, JSON.stringify(persisted));
        assert.equal(getCallCount() > 0, true);
      });
    });
  });
});