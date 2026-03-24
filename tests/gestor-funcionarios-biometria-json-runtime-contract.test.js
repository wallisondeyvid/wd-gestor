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

async function createFuncionarioInTenant(unidadeId, overrides = {}) {
  const FuncionarioModel = getTenantModel(Funcionario, unidadeId);
  return FuncionarioModel.create({
    unidade_id: unidadeId,
    nome: overrides.nome || `Funcionario Biometria ${Date.now()}-${nextCounter()}`,
    rg: overrides.rg || buildRg(),
    cpf: overrides.cpf || uniqueCpf(),
    data_nascimento: overrides.data_nascimento || new Date('1990-01-01T00:00:00.000Z'),
    sexo: overrides.sexo || 'M',
    endereco: overrides.endereco || { cep: '01001000' },
    email: overrides.email || uniqueEmail('funcionario-biometria-json-runtime'),
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
    nome: `Gestor Biometria ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gestor-func-biometria-json-test',
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
      prefix: 'funcionario-biometria-json-context',
    });
    const outsiderAuth = await authenticateContextualAgent(app, {
      unidadeId: unidadeC._id,
      prefix: 'funcionario-biometria-json-outsider',
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

function buildFaceCapture(overrides = {}) {
  return {
    idx: overrides.idx ?? 0,
    hash: overrides.hash ?? `face-hash-${Date.now()}-${nextCounter()}`,
    imagem: overrides.imagem,
    template_b64: overrides.template_b64,
    template_sha256: overrides.template_sha256 ?? 'face-template-sha256',
    qualidade: overrides.qualidade ?? '87',
  };
}

function buildFpCapture(overrides = {}) {
  return {
    idx: overrides.idx ?? 0,
    hash: overrides.hash ?? `fp-hash-${Date.now()}-${nextCounter()}`,
    imagem: overrides.imagem,
    template_b64: overrides.template_b64,
    template_sha256: overrides.template_sha256 ?? 'fp-template-sha256',
  };
}

function buildPersistedFace(overrides = {}) {
  return {
    hash: overrides.hash ?? `face-persistida-${Date.now()}-${nextCounter()}`,
    imagem: overrides.imagem,
    template_b64: overrides.template_b64,
    template_sha256: overrides.template_sha256,
    qualidade: overrides.qualidade,
  };
}

function buildPersistedFp(overrides = {}) {
  return {
    hash: overrides.hash ?? `fp-persistida-${Date.now()}-${nextCounter()}`,
    imagem: overrides.imagem,
    template_b64: overrides.template_b64,
    template_sha256: overrides.template_sha256,
    dedo: overrides.dedo,
  };
}

async function fetchPersistedFuncionario(unidadeId, funcionarioId) {
  return getTenantModel(Funcionario, unidadeId).findById(funcionarioId).lean();
}

test('PUT full biometria json: sem sessao retorna 401', async () => {
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

test('PUT incremental biometria json: sem sessao retorna 401', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ fp_capturas_json: JSON.stringify([buildFpCapture()]) });

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('PUT full biometria json: fora do escopo contextual retorna 404', async () => {
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

test('PUT incremental biometria json: fora do escopo contextual retorna 404', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await outsiderAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ fp_capturas_json: JSON.stringify([buildFpCapture()]) });

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Funcionário não encontrado', JSON.stringify(res.body));
  });
});

test('PUT full biometria json: face_capturas_json invalido e tolerado sem limpar dado existente', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [buildPersistedFace({ hash: 'face-antiga' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: '{invalido' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-antiga', JSON.stringify(persisted));
  });
});

test('PUT incremental biometria json: face_capturas_json invalido e tolerado sem limpar dado existente', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [buildPersistedFace({ hash: 'face-antiga-inc' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: '{invalido' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-antiga-inc', JSON.stringify(persisted));
  });
});

test('PUT full biometria json: fp_capturas_json invalido e tolerado sem limpar dado existente', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_digitais: [buildPersistedFp({ hash: 'fp-antiga', dedo: 'D1' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ fp_capturas_json: '{invalido' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_digitais?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.hash, 'fp-antiga', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.dedo, 'D1', JSON.stringify(persisted));
  });
});

test('PUT incremental biometria json: fp_capturas_json invalido e tolerado sem limpar dado existente', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_digitais: [buildPersistedFp({ hash: 'fp-antiga-inc', dedo: 'D2' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ fp_capturas_json: '{invalido' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_digitais?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.hash, 'fp-antiga-inc', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.dedo, 'D2', JSON.stringify(persisted));
  });
});

test('PUT full biometria json: face_capturas_json valido persiste biometrias_facial normalizada', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        face_capturas_json: JSON.stringify([
          buildFaceCapture({
            idx: 1,
            hash: 'face-full-valida',
            template_sha256: 'sha-face-full',
            qualidade: '91',
          }),
        ]),
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-full-valida', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.template_sha256, 'sha-face-full', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.qualidade, 91, JSON.stringify(persisted));
    assert.equal(Object.prototype.hasOwnProperty.call(persisted.biometrias_facial[0], 'dedo'), false, JSON.stringify(persisted));
  });
});

test('PUT incremental biometria json: face_capturas_json valido persiste biometrias_facial normalizada', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        face_capturas_json: JSON.stringify([
          buildFaceCapture({
            idx: 2,
            hash: 'face-inc-valida',
            template_sha256: 'sha-face-inc',
            qualidade: '73',
          }),
        ]),
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-inc-valida', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.template_sha256, 'sha-face-inc', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.qualidade, 73, JSON.stringify(persisted));
  });
});

test('PUT full biometria json: fp_capturas_json valido persiste biometrias_digitais normalizada com idx para dedo', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_digitais: [],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        fp_capturas_json: JSON.stringify([
          buildFpCapture({
            idx: 4,
            hash: 'fp-full-valida',
            template_sha256: 'sha-fp-full',
          }),
        ]),
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_digitais?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.hash, 'fp-full-valida', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.template_sha256, 'sha-fp-full', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.dedo, 'D5', JSON.stringify(persisted));
  });
});

test('PUT incremental biometria json: fp_capturas_json valido persiste biometrias_digitais normalizada com idx para dedo', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_digitais: [],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        fp_capturas_json: JSON.stringify([
          buildFpCapture({
            idx: 9,
            hash: 'fp-inc-valida',
            template_sha256: 'sha-fp-inc',
          }),
        ]),
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_digitais?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.hash, 'fp-inc-valida', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.template_sha256, 'sha-fp-inc', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.dedo, 'D10', JSON.stringify(persisted));
  });
});

test('PUT full biometria json: array facial normalizado vazio limpa biometrias_facial', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [buildPersistedFace({ hash: 'face-a-limpar' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: JSON.stringify([{ idx: 0 }]) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'biometrias_facial'), false, JSON.stringify(persisted));
  });
});

test('PUT incremental biometria json: array facial normalizado vazio limpa biometrias_facial', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [buildPersistedFace({ hash: 'face-a-limpar-inc' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: JSON.stringify([{ idx: 1 }]) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'biometrias_facial'), false, JSON.stringify(persisted));
  });
});

test('PUT full biometria json: array digital normalizado vazio limpa biometrias_digitais', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_digitais: [buildPersistedFp({ hash: 'fp-a-limpar', dedo: 'D4' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ fp_capturas_json: JSON.stringify([{ idx: 2 }]) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'biometrias_digitais'), false, JSON.stringify(persisted));
  });
});

test('PUT incremental biometria json: array digital normalizado vazio limpa biometrias_digitais', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_digitais: [buildPersistedFp({ hash: 'fp-a-limpar-inc', dedo: 'D3' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ fp_capturas_json: JSON.stringify([{ idx: 7 }]) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'biometrias_digitais'), false, JSON.stringify(persisted));
  });
});

test('PUT full biometria json: erro interno induzido no update retorna 500', async (t) => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);

    t.mock.method(FuncionarioModel, 'findOneAndUpdate', async () => {
      throw new Error('forced biometria full failure');
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: JSON.stringify([buildFaceCapture()]) });

    assert.equal(res.status, 500, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'SERVER_ERROR', JSON.stringify(res.body));
    assert.equal(res.body?.message, 'Erro interno', JSON.stringify(res.body));
  });
});

test('PUT incremental biometria json: erro interno induzido no update retorna 500', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);
    const originalFindOneAndUpdate = FuncionarioModel.findOneAndUpdate;
    FuncionarioModel.findOneAndUpdate = function patchedFindOneAndUpdate() {
      throw new Error('forced biometria incremental failure');
    };

    try {
      const res = await contextualAgent
        .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ fp_capturas_json: JSON.stringify([buildFpCapture()]) });

      assert.equal(res.status, 500, JSON.stringify(res.body));
      assert.equal(res.body?.success, false, JSON.stringify(res.body));
      assert.equal(res.body?.code, 'SERVER_ERROR', JSON.stringify(res.body));
      assert.equal(res.body?.message, 'Falha ao atualizar funcionário', JSON.stringify(res.body));
    } finally {
      FuncionarioModel.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });
});

test('PUT full biometria json: guardrail de tamanho ignora face_capturas_json acima do limite bruto', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [buildPersistedFace({ hash: 'face-grande-full' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: 'x'.repeat(500001) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-grande-full', JSON.stringify(persisted));
  });
});

test('PUT incremental biometria json: guardrail de tamanho ignora face_capturas_json acima do limite bruto', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_facial: [buildPersistedFace({ hash: 'face-grande-inc' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ face_capturas_json: 'x'.repeat(500001) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_facial?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_facial[0]?.hash, 'face-grande-inc', JSON.stringify(persisted));
  });
});

test('PUT full biometria json: guardrail de tamanho ignora fp_capturas_json acima do limite bruto', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_digitais: [buildPersistedFp({ hash: 'fp-grande-full', dedo: 'D6' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ fp_capturas_json: 'x'.repeat(500001) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_digitais?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.hash, 'fp-grande-full', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.dedo, 'D6', JSON.stringify(persisted));
  });
});

test('PUT incremental biometria json: guardrail de tamanho ignora fp_capturas_json acima do limite bruto', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      biometrias_digitais: [buildPersistedFp({ hash: 'fp-grande-inc', dedo: 'D7' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ fp_capturas_json: 'x'.repeat(500001) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, funcionario._id);
    assert.equal(persisted.biometrias_digitais?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.hash, 'fp-grande-inc', JSON.stringify(persisted));
    assert.equal(persisted.biometrias_digitais[0]?.dedo, 'D7', JSON.stringify(persisted));
  });
});