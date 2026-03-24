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
    nome: `Gestor Create Bio JSON ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gf-create-biometria-json',
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
      prefix: 'funcionario-create-biometria-json-context',
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
    nome: `Funcionario Create Bio JSON ${Date.now()}-${nextCounter()}`,
    rg: buildRg(),
    cpf: uniqueCpf(),
    data_nascimento: '1990-01-01',
    sexo: 'M',
    'endereco[cep]': '01001000',
    email: uniqueEmail('funcionario-create-biometria-json-runtime'),
    telefone: '(11) 99999-9999',
    biometrico: 'hash-digital-legado-1|hash-digital-legado-2',
    biometrico_face: 'hash-face-legado-1|hash-face-legado-2',
    fp_template_b64: 'fp-template-legado-b64',
    fp_template_sha256: 'fp-template-legado-sha',
    fp_imagem: 'fp-imagem-legado',
    fp_dedo: 'D3',
    face_template_b64: 'face-template-legado-b64',
    face_template_sha256: 'face-template-legado-sha',
    ...overrides,
  };
}

async function fetchPersistedFuncionario(unidadeId, funcionarioId) {
  return getTenantModel(Funcionario, unidadeId).findById(funcionarioId).lean();
}

function buildFaceCapturasJsonValid() {
  return JSON.stringify([
    {
      hash: 'face-captura-hash-1',
      template_sha256: 'face-template-sha-1',
      qualidade: 87,
    },
  ]);
}

function buildFpCapturasJsonValid() {
  return JSON.stringify([
    {
      idx: 4,
      hash: 'fp-captura-hash-5',
      template_sha256: 'fp-template-sha-5',
      qualidade: 91,
    },
  ]);
}

function buildFaceCapturasJsonFilteredToEmpty() {
  return JSON.stringify([
    {
      qualidade: 52,
    },
  ]);
}

function buildFpCapturasJsonFilteredToEmpty() {
  return JSON.stringify([
    {
      qualidade: 48,
    },
  ]);
}

test('sem sessao', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const res = await request(app)
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        face_capturas_json: buildFaceCapturasJsonValid(),
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
        face_capturas_json: buildFaceCapturasJsonValid(),
      }));

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Unidade não encontrada', JSON.stringify(res.body));
  });
});

test('sucesso com face_capturas_json valido', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        face_capturas_json: buildFaceCapturasJsonValid(),
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.created, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.equal(persisted?.biometrico, 'hash-digital-legado-1|hash-digital-legado-2', JSON.stringify(persisted));
    assert.equal(persisted?.biometrico_face, 'hash-face-legado-1|hash-face-legado-2', JSON.stringify(persisted));
    assert.equal(persisted?.fp_template_b64, 'fp-template-legado-b64', JSON.stringify(persisted));
    assert.equal(persisted?.fp_template_sha256, 'fp-template-legado-sha', JSON.stringify(persisted));
    assert.equal(persisted?.fp_imagem, 'fp-imagem-legado', JSON.stringify(persisted));
    assert.equal(persisted?.fp_dedo, 'D3', JSON.stringify(persisted));
    assert.equal(persisted?.face_template_b64, 'face-template-legado-b64', JSON.stringify(persisted));
    assert.equal(persisted?.face_template_sha256, 'face-template-legado-sha', JSON.stringify(persisted));
    assert.equal(persisted?.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-captura-hash-1', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.template_sha256, 'face-template-sha-1', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.qualidade, 87, JSON.stringify(persisted));
    assert.deepEqual(persisted?.biometrias_digitais || [], [], JSON.stringify(persisted));
  });
});

test('sucesso com fp_capturas_json valido', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        fp_capturas_json: buildFpCapturasJsonValid(),
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.created, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.equal(persisted?.biometrico, 'hash-digital-legado-1|hash-digital-legado-2', JSON.stringify(persisted));
    assert.equal(persisted?.fp_template_b64, 'fp-template-legado-b64', JSON.stringify(persisted));
    assert.equal(persisted?.fp_template_sha256, 'fp-template-legado-sha', JSON.stringify(persisted));
    assert.equal(persisted?.fp_imagem, 'fp-imagem-legado', JSON.stringify(persisted));
    assert.equal(persisted?.fp_dedo, 'D3', JSON.stringify(persisted));
    assert.deepEqual(persisted?.biometrias_digitais || [], [], JSON.stringify(persisted));
    assert.deepEqual(persisted?.biometrias_facial || [], [], JSON.stringify(persisted));
  });
});

test('sucesso com ambos validos', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        face_capturas_json: buildFaceCapturasJsonValid(),
        fp_capturas_json: buildFpCapturasJsonValid(),
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.equal(persisted?.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-captura-hash-1', JSON.stringify(persisted));
    assert.deepEqual(persisted?.biometrias_digitais || [], [], JSON.stringify(persisted));
  });
});

test('face_capturas_json invalido com parse tolerante', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        face_capturas_json: '{invalid-json',
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.deepEqual(persisted?.biometrias_facial || [], [], JSON.stringify(persisted));
  });
});

test('fp_capturas_json invalido com parse tolerante', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        fp_capturas_json: '{invalid-json',
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.deepEqual(persisted?.biometrias_digitais || [], [], JSON.stringify(persisted));
  });
});

test('guardrail de tamanho bruto em face_capturas_json', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        face_capturas_json: 'x'.repeat(500001),
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.deepEqual(persisted?.biometrias_facial || [], [], JSON.stringify(persisted));
  });
});

test('guardrail de tamanho bruto em fp_capturas_json', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        fp_capturas_json: 'x'.repeat(500001),
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.deepEqual(persisted?.biometrias_digitais || [], [], JSON.stringify(persisted));
  });
});

test('unset observavel quando o array normalizado facial fica vazio', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        face_capturas_json: buildFaceCapturasJsonFilteredToEmpty(),
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.ok(!persisted?.biometrias_facial || persisted.biometrias_facial.length === 0, JSON.stringify(persisted));
  });
});

test('unset observavel quando o array normalizado digital fica vazio', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const res = await contextualAgent
      .post('/gestor/api/funcionarios')
      .type('form')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildBaseCreatePayload(unidadeB._id, {
        fp_capturas_json: buildFpCapturasJsonFilteredToEmpty(),
      }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.ok(!persisted?.biometrias_digitais || persisted.biometrias_digitais.length === 0, JSON.stringify(persisted));
  });
});

test('erro interno induzido no create dentro deste recorte', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);
    const originalCreate = FuncionarioModel.create;

    FuncionarioModel.create = async function mockedCreate() {
      throw new Error('forced create-biometria-json failure');
    };

    try {
      const res = await contextualAgent
        .post('/gestor/api/funcionarios')
        .type('form')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send(buildBaseCreatePayload(unidadeB._id, {
          face_capturas_json: buildFaceCapturasJsonValid(),
          fp_capturas_json: buildFpCapturasJsonValid(),
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