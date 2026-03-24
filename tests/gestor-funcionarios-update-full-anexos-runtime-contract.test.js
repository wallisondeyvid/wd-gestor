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

const ROOT = process.cwd();
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
    nome: overrides.nome || `Funcionario ${Date.now()}-${nextCounter()}`,
    rg: overrides.rg || buildRg(),
    cpf: overrides.cpf || uniqueCpf(),
    data_nascimento: overrides.data_nascimento || new Date('1990-01-01T00:00:00.000Z'),
    sexo: overrides.sexo || 'M',
    endereco: overrides.endereco || { cep: '01001000' },
    email: overrides.email || uniqueEmail('funcionario-update-full-anexos'),
    telefone: overrides.telefone || '(11) 99999-9999',
    ativo: overrides.ativo ?? true,
    ...overrides,
  });
}

async function authenticateContextualAgent(app, { unidadeId, papelContextual = 'gestor' }) {
  const email = uniqueEmail('funcionario-update-full-anexos-context');
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
    nome: `Gestor Contextual ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gestor-funcionarios-update-full-anexos-runtime-contract-test',
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

function buildExistingAnexo(name, caminho, mime = 'text/plain', tamanho = 10) {
  return {
    nome: name,
    mime,
    tamanho,
    caminho,
    data_upload: new Date('2024-01-01T00:00:00.000Z'),
  };
}

function materializeWorkspaceFile(relativePath, content = 'fixture anexo') {
  const absolutePath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
  return absolutePath;
}

function removeWorkspaceFile(relativePath) {
  const candidates = [
    path.join(ROOT, relativePath),
    path.join(ROOT, 'public', relativePath),
  ];
  for (const candidate of candidates) {
    try {
      fs.unlinkSync(candidate);
      return;
    } catch {}
  }
}

function listAnexosNames(doc) {
  return (doc?.anexos || []).map((item) => item?.nome);
}

test('PUT full anexos: sem sessao retorna 401', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .field('anexos_existentes', JSON.stringify([]));

    assert.equal(res.status, 401);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'UNAUTHORIZED');
  });
});

test('PUT full anexos: fora do escopo contextual retorna 404', async () => {
  await withHarness(async ({ unidadeC, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeC._id);

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .field('anexos_existentes', JSON.stringify([]));

    assert.equal(res.status, 404);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'NOT_FOUND');
    assert.equal(res.body?.message, 'Funcionário não encontrado');
  });
});

test('PUT full anexos: funcionario inexistente retorna 404', async () => {
  await withHarness(async ({ contextualAgent }) => {
    const res = await contextualAgent
      .put('/gestor/api/funcionarios/64f111111111111111111111')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .field('anexos_existentes', JSON.stringify([]));

    assert.equal(res.status, 404);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'NOT_FOUND');
    assert.equal(res.body?.message, 'Funcionário não encontrado');
  });
});

test('PUT full anexos: sucesso preserva anexos_existentes sem req.files', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const existentes = [
      buildExistingAnexo('contrato.pdf', 'uploads/tests/contrato.pdf', 'application/pdf', 100),
      buildExistingAnexo('rg.txt', 'uploads/tests/rg.txt', 'text/plain', 20),
    ];
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      anexos: existentes,
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .field('anexos_existentes', JSON.stringify(existentes));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.deepEqual(listAnexosNames(persisted), ['contrato.pdf', 'rg.txt']);
    assert.equal(String(persisted.anexos?.[0]?.caminho || ''), 'uploads/tests/contrato.pdf');
    assert.equal(String(persisted.anexos?.[1]?.caminho || ''), 'uploads/tests/rg.txt');
  });
});

test('PUT full anexos: sucesso remove item listado em anexos_excluidos e efeito fisico observavel', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const keep = buildExistingAnexo('keep.txt', 'uploads/tests/keep-full.txt', 'text/plain', 4);
    const remove = buildExistingAnexo('remove.txt', 'uploads/tests/remove-full.txt', 'text/plain', 6);
    materializeWorkspaceFile('uploads/tests/remove-full.txt', 'remove');
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      anexos: [keep, remove],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .field('anexos_existentes', JSON.stringify([keep, remove]))
      .field('anexos_excluidos', JSON.stringify([remove]));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.deepEqual(listAnexosNames(persisted), ['keep.txt']);
    assert.equal(fs.existsSync(path.join(ROOT, 'uploads/tests/remove-full.txt')), false);
  });
});

test('PUT full anexos: sucesso acrescenta novo anexo por req.files.anexos', async (t) => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, { anexos: [] });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .attach('anexos', Buffer.from('novo-anexo-full'), 'novo-full.txt');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.equal(persisted.anexos?.length, 1);
    assert.equal(persisted.anexos?.[0]?.nome, 'novo-full.txt');
    assert.equal(persisted.anexos?.[0]?.mime, 'text/plain');
    assert.equal(typeof persisted.anexos?.[0]?.tamanho, 'number');
    assert.match(String(persisted.anexos?.[0]?.caminho || ''), /^uploads\//);

    t.after(() => removeWorkspaceFile(String(persisted.anexos?.[0]?.caminho || '')));
  });
});

test('PUT full anexos: sucesso reconcilia existentes excluidos e novo upload', async (t) => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const keep = buildExistingAnexo('keep-mix.txt', 'uploads/tests/keep-mix-full.txt', 'text/plain', 8);
    const remove = buildExistingAnexo('remove-mix.txt', 'uploads/tests/remove-mix-full.txt', 'text/plain', 9);
    materializeWorkspaceFile('uploads/tests/remove-mix-full.txt', 'remove-mix');
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      anexos: [keep, remove],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .field('anexos_existentes', JSON.stringify([keep, remove]))
      .field('anexos_excluidos', JSON.stringify([remove]))
      .attach('anexos', Buffer.from('novo-mix-full'), 'novo-mix-full.txt');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.equal(persisted.anexos?.length, 2);
    assert.deepEqual(listAnexosNames(persisted), ['keep-mix.txt', 'novo-mix-full.txt']);
    assert.equal(fs.existsSync(path.join(ROOT, 'uploads/tests/remove-mix-full.txt')), false);
    assert.match(String(persisted.anexos?.[1]?.caminho || ''), /^uploads\//);

    t.after(() => removeWorkspaceFile(String(persisted.anexos?.[1]?.caminho || '')));
  });
});

test('PUT full anexos: erro interno induzido no update retorna 500', async (t) => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const existente = buildExistingAnexo('erro.txt', 'uploads/tests/erro-full.txt', 'text/plain', 4);
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      anexos: [existente],
    });
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);

    t.mock.method(FuncionarioModel, 'findOneAndUpdate', async () => {
      throw new Error('forced update full anexos failure');
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .field('anexos_existentes', JSON.stringify([existente]));

    assert.equal(res.status, 500);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'SERVER_ERROR');
    assert.equal(res.body?.message, 'Erro interno');
  });
});