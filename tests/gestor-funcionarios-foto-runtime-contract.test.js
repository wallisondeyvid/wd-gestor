import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

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

async function authenticateContextualAgent(app, { unidadeId, papelContextual = 'gestor' }) {
  const email = uniqueEmail('funcionario-foto-runtime');
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
    nome: `Foto Runtime ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gestor-funcionarios-foto-runtime-contract-test',
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

function ensurePublicUploadsDir() {
  const dir = path.join(process.cwd(), 'public', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createRuntimePhotoFile({ filename, content }) {
  const dir = ensurePublicUploadsDir();
  const safeName = `${Date.now()}-${nextCounter()}-${filename}`;
  const fullPath = path.join(dir, safeName);
  fs.writeFileSync(fullPath, content, 'utf8');
  return {
    fullPath,
    relativePath: `uploads/${safeName}`,
  };
}

function parseBinary(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
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
    const outsiderAuth = await authenticateContextualAgent(app, { unidadeId: unidadeC._id });
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

test('GET /gestor/api/funcionarios/:id/foto sem sessao retorna unauthorized em JSON', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Foto Anon ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-foto-anon'),
      cpf: uniqueCpf(),
    });

    const res = await request(app)
      .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/foto`)
      .set('Connection', 'close');

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('GET /gestor/api/funcionarios/:id/foto fora do escopo contextual retorna 404 JSON', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Foto Fora Escopo ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-foto-escopo'),
      cpf: uniqueCpf(),
      foto: 'https://example.com/foto-publica.png',
    });

    const res = await outsiderAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/foto`)
      .set('Connection', 'close');

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.error, 'Funcionário não encontrado', JSON.stringify(res.body));
  });
});

test('GET /gestor/api/funcionarios/:id/foto com funcionario inexistente retorna 404 JSON', async () => {
  await withHarness(async ({ contextualAgent }) => {
    const res = await contextualAgent
      .get('/gestor/api/funcionarios/64f111111111111111111111/foto')
      .set('Connection', 'close');

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.error, 'Funcionário não encontrado', JSON.stringify(res.body));
  });
});

test('GET /gestor/api/funcionarios/:id/foto no ramo data URL retorna buffer com content-type real', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const fotoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1xkAAAAASUVORK5CYII=';
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Foto Data URL ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-foto-dataurl'),
      cpf: uniqueCpf(),
      foto: fotoDataUrl,
    });

    const res = await contextualAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/foto`)
      .buffer(true)
      .parse(parseBinary)
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(String(res.headers['content-type'] || ''), /image\/png/i);
    assert.equal(Buffer.isBuffer(res.body), true);
    assert.ok(res.body.length > 0);
  });
});

test('GET /gestor/api/funcionarios/:id/foto no ramo URL publica responde com redirect', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const fotoUrl = 'https://example.com/foto-publica-runtime.png';
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Foto URL ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-foto-url'),
      cpf: uniqueCpf(),
      foto: fotoUrl,
    });

    const res = await contextualAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/foto`)
      .redirects(0)
      .set('Connection', 'close');

    assert.ok(res.status >= 300 && res.status < 400, `${res.status} ${res.text}`);
    assert.equal(res.headers.location, fotoUrl);
    assert.match(String(res.headers['cache-control'] || ''), /private/i);
  });
});

test('GET /gestor/api/funcionarios/:id/foto no ramo caminho legado em disco responde com arquivo', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const runtimeFile = createRuntimePhotoFile({
      filename: 'foto-legada.svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>',
    });

    try {
      const funcionario = await createFuncionarioInTenant(unidadeB._id, {
        nome: `Funcionario Foto Disco ${Date.now()}-${nextCounter()}`,
        email: uniqueEmail('func-foto-disco'),
        cpf: uniqueCpf(),
        foto: runtimeFile.relativePath,
      });

      const res = await contextualAgent
        .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/foto`)
        .buffer(true)
        .parse(parseBinary)
        .set('Connection', 'close');

      assert.equal(res.status, 200);
      assert.match(String(res.headers['content-type'] || ''), /image\/svg\+xml/i);
      assert.equal(Buffer.isBuffer(res.body), true);
      assert.match(res.body.toString('utf8'), /<svg/i);
    } finally {
      try { fs.unlinkSync(runtimeFile.fullPath); } catch {}
    }
  });
});

test('GET /gestor/api/funcionarios/:id/foto sem foto configurada cai no placeholder', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Foto Placeholder ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-foto-placeholder'),
      cpf: uniqueCpf(),
      foto: '',
    });

    const res = await contextualAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/foto`)
      .buffer(true)
      .parse(parseBinary)
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(String(res.headers['content-type'] || ''), /image\/svg\+xml/i);
    assert.match(String(res.headers['cache-control'] || ''), /public/i);
    assert.equal(Buffer.isBuffer(res.body), true);
    assert.match(res.body.toString('utf8'), /<svg/i);
  });
});

test('GET /gestor/api/funcionarios/:id/foto propaga falha interna como 500 JSON', async () => {
  await withHarness(async ({ app, unidadeB, contextualAgent }) => {
    const fotoUrl = 'https://example.com/foto-failure.png';
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Foto Falha ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-foto-fail'),
      cpf: uniqueCpf(),
      foto: fotoUrl,
    });

    const originalRedirect = app.response.redirect;
    app.response.redirect = function patchedRedirect() {
      throw new Error('forced foto failure');
    };

    try {
      const res = await contextualAgent
        .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/foto`)
        .set('Connection', 'close');

      assert.equal(res.status, 500, JSON.stringify(res.body));
      assert.equal(res.body?.success, false, JSON.stringify(res.body));
      assert.equal(res.body?.error, true, JSON.stringify(res.body));
      assert.equal(res.body?.message, 'forced foto failure', JSON.stringify(res.body));
    } finally {
      app.response.redirect = originalRedirect;
    }
  });
});