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
    nome: `Gestor Create Face Imagem ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gf-create-biometria-face-imagem',
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
      prefix: 'funcionario-create-biometria-face-imagem-context',
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
    nome: `Funcionario Create Face Imagem ${Date.now()}-${nextCounter()}`,
    rg: buildRg(),
    cpf: uniqueCpf(),
    data_nascimento: '1990-01-01',
    sexo: 'M',
    'endereco[cep]': '01001000',
    email: uniqueEmail('funcionario-create-biometria-face-imagem-runtime'),
    telefone: '(11) 99999-9999',
    biometrico_face: 'hash-face-legado-1|hash-face-legado-2',
    face_template_b64: 'face-template-legado-b64',
    face_template_sha256: 'face-template-legado-sha',
    ...overrides,
  };
}

async function fetchPersistedFuncionario(unidadeId, funcionarioId) {
  return getTenantModel(Funcionario, unidadeId).findById(funcionarioId).lean();
}

function tinyPngDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/e+mz5QAAAABJRU5ErkJggg==';
}

function invalidImageDataUrl() {
  return 'data:image/png;base64,bm90LWEtcmVhbC1pbWFnZS1idWZmZXI=';
}

async function withCreatedDocPatch(unidadeId, mutatePayload, run) {
  const FuncionarioModel = getTenantModel(Funcionario, unidadeId);
  const originalCreate = FuncionarioModel.create;
  let lastDoc = null;
  let saveCount = 0;

  FuncionarioModel.create = async function patchedCreate(payload, ...rest) {
    const nextPayload = mutatePayload ? await mutatePayload(payload) : payload;
    const doc = await originalCreate.call(this, nextPayload, ...rest);
    lastDoc = doc;
    const originalSave = doc.save.bind(doc);
    doc.save = async function patchedSave(...args) {
      saveCount += 1;
      return originalSave(...args);
    };
    return doc;
  };

  try {
    return await run({ getLastDoc: () => lastDoc, getSaveCount: () => saveCount });
  } finally {
    FuncionarioModel.create = originalCreate;
  }
}

test('sem sessao', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const res = await request(app)
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        face_imagem: tinyPngDataUrl(),
      }));

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('fora do escopo contextual', async () => {
  await withHarness(async ({ unidadeC, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeC._id, {
        face_imagem: tinyPngDataUrl(),
      }));

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Unidade não encontrada', JSON.stringify(res.body));
  });
});

test('face_imagem nao-data-url', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const originalFaceImage = 'legacy-face-image-value';

    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        face_imagem: originalFaceImage,
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.equal(persisted?.face_imagem, originalFaceImage, JSON.stringify(persisted));
  });
});

test('face_imagem data-url com Blob indisponivel', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const originalFaceImage = tinyPngDataUrl();
    const prevVercel = process.env.VERCEL;
    const prevBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const prevWdBlobToken = process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN;
    const prevVercelBlobToken = process.env.VERCEL_BLOB_RW_TOKEN;

    delete process.env.VERCEL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN;
    delete process.env.VERCEL_BLOB_RW_TOKEN;

    try {
      const res = await contextualAgent
        .post('/gestor/api/funcionarios')
        .type('form')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send(buildBaseCreatePayload(unidadeB._id, {
          face_imagem: originalFaceImage,
        }));

      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body?.success, true, JSON.stringify(res.body));

      const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
      assert.equal(persisted?.face_imagem, originalFaceImage, JSON.stringify(persisted));
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
      if (prevBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = prevBlobToken;
      if (prevWdBlobToken === undefined) delete process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN;
      else process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN = prevWdBlobToken;
      if (prevVercelBlobToken === undefined) delete process.env.VERCEL_BLOB_RW_TOKEN;
      else process.env.VERCEL_BLOB_RW_TOKEN = prevVercelBlobToken;
    }
  });
});

test('face_imagem data-url com falha induzida na conversao remapeamento', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const prevVercel = process.env.VERCEL;
    process.env.VERCEL = '1';

    try {
      await withCreatedDocPatch(
        unidadeB._id,
        (payload) => ({
          ...payload,
          face_imagem: tinyPngDataUrl(),
          biometrias_facial: [{ hash: 'face-branch-hash', imagem: invalidImageDataUrl() }],
        }),
        async ({ getSaveCount }) => {
          const res = await contextualAgent
            .post('/gestor/api/funcionarios')
            .type('form')
            .set('Accept', 'application/json')
            .set('Connection', 'close')
            .send(buildBaseCreatePayload(unidadeB._id, {
              face_imagem: tinyPngDataUrl(),
            }));

          assert.equal(res.status, 201, JSON.stringify(res.body));
          assert.equal(res.body?.success, true, JSON.stringify(res.body));

          const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
          assert.equal(persisted?.face_imagem, tinyPngDataUrl(), JSON.stringify(persisted));
          assert.equal(persisted?.biometrias_facial?.length, 1, JSON.stringify(persisted));
          assert.equal(persisted.biometrias_facial[0]?.imagem, invalidImageDataUrl(), JSON.stringify(persisted));
          assert.ok(getSaveCount() >= 2, `saveCount=${getSaveCount()}`);
        },
      );
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
    }
  });
});

test('face_imagem data-url com tentativa de remapeamento sob harness permanece em data-url no runtime atual', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const prevVercel = process.env.VERCEL;
    const originalFetch = global.fetch;
    process.env.VERCEL = '1';

    global.fetch = async function mockedFetch() {
      return new Response(
        JSON.stringify({
          url: 'https://blob.vercel-storage.com/faces/runtime-success.webp',
          pathname: 'faces/runtime-success.webp',
          contentType: 'image/webp',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    };

    try {
      await withCreatedDocPatch(
        unidadeB._id,
        (payload) => ({
          ...payload,
          face_imagem: tinyPngDataUrl(),
          biometrias_facial: [{ hash: 'face-branch-success', imagem: tinyPngDataUrl() }],
        }),
        async ({ getSaveCount }) => {
          const res = await contextualAgent
            .post('/gestor/api/funcionarios')
            .type('form')
            .set('Accept', 'application/json')
            .set('Connection', 'close')
            .send(buildBaseCreatePayload(unidadeB._id, {
              face_imagem: tinyPngDataUrl(),
            }));

          assert.equal(res.status, 201, JSON.stringify(res.body));
          assert.equal(res.body?.success, true, JSON.stringify(res.body));

          const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
          assert.equal(persisted?.face_imagem, tinyPngDataUrl(), JSON.stringify(persisted));
          assert.equal(persisted?.biometrias_facial?.[0]?.imagem, tinyPngDataUrl(), JSON.stringify(persisted));
          assert.ok(getSaveCount() >= 2, `saveCount=${getSaveCount()}`);
        },
      );
    } finally {
      global.fetch = originalFetch;
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
    }
  });
});

test('persistencia observavel da imagem original quando nao ha conversao', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const originalFaceImage = tinyPngDataUrl();

    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        face_imagem: originalFaceImage,
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.equal(persisted?.face_imagem, originalFaceImage, JSON.stringify(persisted));
  });
});

test('persistencia observavel continua em data-url mesmo sob tentativa de remapeamento com fetch mockado', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const prevVercel = process.env.VERCEL;
    const originalFetch = global.fetch;
    process.env.VERCEL = '1';

    global.fetch = async function mockedFetch() {
      return new Response(
        JSON.stringify({
          url: 'https://blob.vercel-storage.com/faces/runtime-persisted.webp',
          pathname: 'faces/runtime-persisted.webp',
          contentType: 'image/webp',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    };

    try {
      await withCreatedDocPatch(
        unidadeB._id,
        (payload) => ({
          ...payload,
          face_imagem: tinyPngDataUrl(),
          biometrias_facial: [{ hash: 'face-branch-persisted', imagem: tinyPngDataUrl() }],
        }),
        async () => {
          const res = await contextualAgent
            .post('/gestor/api/funcionarios')
            .type('form')
            .set('Accept', 'application/json')
            .set('Connection', 'close')
            .send(buildBaseCreatePayload(unidadeB._id, {
              face_imagem: tinyPngDataUrl(),
            }));

          assert.equal(res.status, 201, JSON.stringify(res.body));

          const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
          assert.equal(persisted?.face_imagem, tinyPngDataUrl(), JSON.stringify(persisted));
          assert.equal(persisted?.biometrias_facial?.[0]?.imagem, tinyPngDataUrl(), JSON.stringify(persisted));
        },
      );
    } finally {
      global.fetch = originalFetch;
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
    }
  });
});

test('erro interno induzido no create dentro deste recorte', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);
    const originalCreate = FuncionarioModel.create;

    FuncionarioModel.create = async function mockedCreate() {
      throw new Error('forced create-biometria-face-imagem failure');
    };

    try {
      const res = await contextualAgent
        .post('/gestor/api/funcionarios')
        .type('form')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send(buildBaseCreatePayload(unidadeB._id, {
          face_imagem: tinyPngDataUrl(),
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

test('confirmacao observavel de que o save adicional pos-create acontece apenas quando esse ramo entra', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    let noEntrySaveCount = 0;
    let entrySaveCount = 0;

    await withCreatedDocPatch(
      unidadeB._id,
      (payload) => ({
        ...payload,
        face_imagem: tinyPngDataUrl(),
        biometrias_facial: [],
      }),
      async ({ getSaveCount }) => {
        const res = await contextualAgent
          .post('/gestor/api/funcionarios')
          .type('form')
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .send(buildBaseCreatePayload(unidadeB._id, {
            face_imagem: tinyPngDataUrl(),
          }));

        assert.equal(res.status, 201, JSON.stringify(res.body));
        noEntrySaveCount = getSaveCount();
      },
    );

    const prevVercel = process.env.VERCEL;
    process.env.VERCEL = '1';

    try {
      await withCreatedDocPatch(
        unidadeB._id,
        (payload) => ({
          ...payload,
          face_imagem: tinyPngDataUrl(),
          biometrias_facial: [{ hash: 'face-entry-save', imagem: invalidImageDataUrl() }],
        }),
        async ({ getSaveCount }) => {
          const res = await contextualAgent
            .post('/gestor/api/funcionarios')
            .type('form')
            .set('Accept', 'application/json')
            .set('Connection', 'close')
            .send(buildBaseCreatePayload(unidadeB._id, {
              face_imagem: tinyPngDataUrl(),
            }));

          assert.equal(res.status, 201, JSON.stringify(res.body));
          entrySaveCount = getSaveCount();
        },
      );
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
    }

    assert.ok(entrySaveCount > noEntrySaveCount, `entrySaveCount=${entrySaveCount}; noEntrySaveCount=${noEntrySaveCount}`);
  });
});