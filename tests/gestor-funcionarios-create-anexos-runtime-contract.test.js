import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
    nome: `Gestor Create Anexo ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gf-create-anexo',
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
  const cleanupPaths = new Set();

  try {
    const { unidadeA, unidadeB, unidadeC } = await createModuloAndUnits();
    const contextualAuth = await authenticateContextualAgent(app, {
      unidadeId: unidadeB._id,
      prefix: 'funcionario-create-anexo-context',
      papelContextual: 'gestor',
    });
    createdEmails.push(contextualAuth.email);

    await run({
      app,
      unidadeA,
      unidadeB,
      unidadeC,
      contextualAgent: contextualAuth.agent,
      registerCreatedPath(filePath) {
        if (filePath) cleanupPaths.add(filePath);
      },
    });
  } finally {
    try {
      for (const filePath of cleanupPaths) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {}
      }
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
    nome: `Funcionario Create Anexo ${Date.now()}-${nextCounter()}`,
    rg: buildRg(),
    cpf: uniqueCpf(),
    data_nascimento: '1990-01-01',
    sexo: 'M',
    'endereco[cep]': '01001000',
    email: uniqueEmail('funcionario-create-anexo-runtime'),
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

function buildTextAttachment(content, filename, contentType = 'text/plain') {
  return {
    buffer: Buffer.from(content, 'utf8'),
    filename,
    contentType,
  };
}

async function fetchPersistedFuncionario(unidadeId, funcionarioId) {
  return getTenantModel(Funcionario, unidadeId).findById(funcionarioId).lean();
}

function toAbsoluteUploadPath(relativePath) {
  return path.join(process.cwd(), 'public', String(relativePath || '').replace(/^uploads\//, 'uploads\\').replace(/\//g, path.sep));
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

test('sucesso sem req.files.anexos', async () => {
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
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.deepEqual(persisted?.anexos || [], [], JSON.stringify(persisted));
  });
});

test('sucesso com um anexo valido', async () => {
  await withHarness(async ({ unidadeB, contextualAgent, registerCreatedPath }) => {
    const payload = buildBaseCreatePayload(unidadeB._id);
    const attachment = buildTextAttachment('anexo create unico', 'contrato.txt');

    const res = await attachBaseFields(
      contextualAgent
        .post('/gestor/api/funcionarios')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexos', attachment.buffer, { filename: attachment.filename, contentType: attachment.contentType }),
      payload,
    );

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.autoUser?.ok, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.equal(persisted?.anexos?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.anexos[0]?.nome, 'contrato.txt', JSON.stringify(persisted));
    registerCreatedPath(toAbsoluteUploadPath(persisted.anexos[0]?.caminho));
  });
});

test('sucesso com multiplos anexos validos', async () => {
  await withHarness(async ({ unidadeB, contextualAgent, registerCreatedPath }) => {
    const payload = buildBaseCreatePayload(unidadeB._id);
    const first = buildTextAttachment('primeiro anexo', 'holerite.txt');
    const second = buildTextAttachment('segundo anexo', 'admissao.pdf', 'application/pdf');

    const res = await attachBaseFields(
      contextualAgent
        .post('/gestor/api/funcionarios')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexos', first.buffer, { filename: first.filename, contentType: first.contentType })
        .attach('anexos', second.buffer, { filename: second.filename, contentType: second.contentType }),
      payload,
    );

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.equal(persisted?.anexos?.length, 2, JSON.stringify(persisted));
    assert.deepEqual(
      persisted.anexos.map((anexo) => anexo.nome),
      ['holerite.txt', 'admissao.pdf'],
      JSON.stringify(persisted),
    );
    persisted.anexos.forEach((anexo) => registerCreatedPath(toAbsoluteUploadPath(anexo?.caminho)));
  });
});

test('shape persistido do descriptor de anexo', async () => {
  await withHarness(async ({ unidadeB, contextualAgent, registerCreatedPath }) => {
    const payload = buildBaseCreatePayload(unidadeB._id);
    const attachment = buildTextAttachment('descriptor anexo', 'descriptor.txt');

    const res = await attachBaseFields(
      contextualAgent
        .post('/gestor/api/funcionarios')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexos', attachment.buffer, { filename: attachment.filename, contentType: attachment.contentType }),
      payload,
    );

    assert.equal(res.status, 201, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.equal(persisted?.anexos?.length, 1, JSON.stringify(persisted));
    const descriptor = persisted.anexos[0];
    assert.equal(descriptor?.nome, 'descriptor.txt', JSON.stringify(persisted));
    assert.equal(descriptor?.mime, 'text/plain', JSON.stringify(persisted));
    assert.equal(typeof descriptor?.tamanho, 'number', JSON.stringify(persisted));
    assert.equal(typeof descriptor?.caminho, 'string', JSON.stringify(persisted));
    assert.equal(descriptor?.data_upload instanceof Date || typeof descriptor?.data_upload === 'string', true, JSON.stringify(persisted));
    registerCreatedPath(toAbsoluteUploadPath(descriptor?.caminho));
  });
});

test('caminho persistido no prefixo esperado de uploads', async () => {
  await withHarness(async ({ unidadeB, contextualAgent, registerCreatedPath }) => {
    const payload = buildBaseCreatePayload(unidadeB._id);
    const attachment = buildTextAttachment('caminho upload', 'uploads-check.txt');

    const res = await attachBaseFields(
      contextualAgent
        .post('/gestor/api/funcionarios')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexos', attachment.buffer, { filename: attachment.filename, contentType: attachment.contentType }),
      payload,
    );

    assert.equal(res.status, 201, JSON.stringify(res.body));

    const persisted = await fetchPersistedFuncionario(unidadeB._id, res.body.id);
    assert.equal(persisted?.anexos?.length, 1, JSON.stringify(persisted));
    assert.equal(persisted.anexos[0]?.caminho.startsWith('uploads/'), true, JSON.stringify(persisted));
    registerCreatedPath(toAbsoluteUploadPath(persisted.anexos[0]?.caminho));
  });
});

test('erro interno induzido no create desse recorte', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);
    const originalCreate = FuncionarioModel.create;
    const attachment = buildTextAttachment('erro create anexo', 'erro-create.txt');

    FuncionarioModel.create = async function mockedCreate(...args) {
      throw new Error('forced create-anexos failure');
    };

    try {
      const res = await attachBaseFields(
        contextualAgent
          .post('/gestor/api/funcionarios')
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .attach('anexos', attachment.buffer, { filename: attachment.filename, contentType: attachment.contentType }),
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