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

async function createFuncionarioInTenant(unidadeId, { nome, email, cpf, sexo = 'M', foto = '' }) {
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
    foto,
  });
}

async function authenticateContextualAgent(app, { unidadeId, papelContextual = 'gestor', prefix = 'funcionario-incremental-foto-runtime' }) {
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
    nome: `Incremental Foto Runtime ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gestor-funcionarios-incremental-foto-runtime-contract-test',
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
      prefix: 'funcionario-incremental-foto-runtime-outsider',
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

function pngBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR0pAAAAAASUVORK5CYII=',
    'base64',
  );
}

test('PUT /gestor/api/funcionarios/:id/incremental foto sem sessao retorna unauthorized em JSON', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Sem Sessao ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-incremental-foto-sem-sessao'),
      cpf: uniqueCpf(),
      foto: 'uploads/foto-antiga-sem-sessao.png',
    });

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .type('form')
      .send({ excluir_foto: 'true' })
      .set('Connection', 'close');

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental foto fora do escopo contextual retorna not found', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Fora Escopo ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-incremental-foto-fora-escopo'),
      cpf: uniqueCpf(),
      foto: 'uploads/foto-antiga-fora-escopo.png',
    });

    const res = await outsiderAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .type('form')
      .send({ excluir_foto: 'true' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'NOT_FOUND', JSON.stringify(res.body));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental foto com excluir_foto=true remove a foto e preserva updated=true', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Excluir Foto ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-incremental-foto-excluir'),
      cpf: uniqueCpf(),
      foto: 'uploads/foto-antiga-excluir.png',
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .type('form')
      .send({ excluir_foto: 'true' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.updated, true, JSON.stringify(res.body));

    const updated = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.ok(updated);
    assert.ok(!updated.foto, JSON.stringify(updated));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental foto com arquivo valido retorna 503 quando blob nao esta configurado', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Upload Foto ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-incremental-foto-upload'),
      cpf: uniqueCpf(),
      foto: 'uploads/foto-antiga-upload.png',
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .attach('foto', pngBuffer(), { filename: 'foto.png', contentType: 'image/png' });

    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.match(String(res.body?.error || ''), /Blob não configurado/i, JSON.stringify(res.body));

    const updated = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.ok(updated);
    assert.equal(updated.foto, 'uploads/foto-antiga-upload.png', JSON.stringify(updated));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental foto no sucesso preserva updated=true', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Success Updated ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-incremental-foto-updated-true'),
      cpf: uniqueCpf(),
      foto: 'uploads/foto-antiga-updated-true.png',
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
      .type('form')
      .send({ excluir_foto: 'true' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.deepEqual(res.body?.data, { updated: true }, JSON.stringify(res.body));
  });
});

test('PUT /gestor/api/funcionarios/:id/incremental foto propaga falha interna do ramo executado', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Falha Foto ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-incremental-foto-failure'),
      cpf: uniqueCpf(),
      foto: 'uploads/foto-antiga-failure.png',
    });

    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);
    const originalFindOneAndUpdate = FuncionarioModel.findOneAndUpdate;
    FuncionarioModel.findOneAndUpdate = function patchedFindOneAndUpdate() {
      throw new Error('forced incremental foto failure');
    };

    try {
      const res = await contextualAgent
        .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/incremental`)
        .type('form')
        .send({ excluir_foto: 'true' })
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 500, JSON.stringify(res.body));
      assert.equal(res.body?.success, false, JSON.stringify(res.body));
      assert.equal(res.body?.code, 'SERVER_ERROR', JSON.stringify(res.body));
      assert.equal(res.body?.message, 'Falha ao atualizar funcionário', JSON.stringify(res.body));
    } finally {
      FuncionarioModel.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });
});