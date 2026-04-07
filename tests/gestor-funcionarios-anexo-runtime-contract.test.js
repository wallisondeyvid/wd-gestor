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

async function createFuncionarioInTenant(unidadeId, { nome, email, cpf, sexo = 'M', anexos = [] }) {
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
    anexos,
  });
}

async function authenticateContextualAgent(app, { unidadeId, papelContextual = 'gestor' }) {
  const email = uniqueEmail('funcionario-anexo-runtime');
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
    nome: `Anexo Runtime ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'gestor-funcionarios-anexo-runtime-contract-test',
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

function createRuntimeAttachmentFile({ content, filename }) {
  const dir = ensurePublicUploadsDir();
  const safeName = `${Date.now()}-${nextCounter()}-${filename}`;
  const fullPath = path.join(dir, safeName);
  fs.writeFileSync(fullPath, content, 'utf8');
  return {
    fullPath,
    relativePath: `uploads/${safeName}`,
    size: Buffer.byteLength(content, 'utf8'),
  };
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
      const contextualAuth = await authenticateContextualAgent(app, { unidadeId: unidadeB._id });
      const outsiderAuth = await authenticateContextualAgent(app, { unidadeId: unidadeC._id });

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

test.after(async () => {
  await disposeSharedHarness();
});

test('GET /gestor/api/funcionarios/:id/anexo/:idx sem sessao retorna unauthorized em JSON', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Anexo Anon ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-anexo-anon'),
      cpf: uniqueCpf(),
    });

    const res = await request(app)
      .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/anexo/0`)
      .set('Connection', 'close');

    assert.equal(res.status, 401, res.text);
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  });
});

test('GET /gestor/api/funcionarios/:id/anexo/:idx fora do escopo contextual retorna funcionario nao encontrado', async () => {
  await withHarness(async ({ unidadeB, outsiderAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Anexo Fora Escopo ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-anexo-escopo'),
      cpf: uniqueCpf(),
    });

    const res = await outsiderAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/anexo/0`)
      .set('Connection', 'close');

    assert.equal(res.status, 404, res.text);
    assert.equal(res.text, 'Funcionário não encontrado');
    const preserved = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.ok(preserved);
  });
});

test('GET /gestor/api/funcionarios/:id/anexo/:idx com funcionario inexistente retorna 404 texto simples', async () => {
  await withHarness(async ({ contextualAgent }) => {
    const res = await contextualAgent
      .get('/gestor/api/funcionarios/64f111111111111111111111/anexo/0')
      .set('Connection', 'close');

    assert.equal(res.status, 404, res.text);
    assert.equal(res.text, 'Funcionário não encontrado');
  });
});

test('GET /gestor/api/funcionarios/:id/anexo/:idx com indice invalido retorna 404 texto simples', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const runtimeFile = createRuntimeAttachmentFile({
      filename: 'indice-invalido.txt',
      content: 'indice-invalido-runtime',
    });

    try {
      const funcionario = await createFuncionarioInTenant(unidadeB._id, {
        nome: `Funcionario Anexo Indice ${Date.now()}-${nextCounter()}`,
        email: uniqueEmail('func-anexo-idx'),
        cpf: uniqueCpf(),
        anexos: [{
          nome: 'indice-invalido.txt',
          mime: 'text/plain',
          tamanho: runtimeFile.size,
          caminho: runtimeFile.relativePath,
          data_upload: new Date(),
        }],
      });

      const res = await contextualAgent
        .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/anexo/9`)
        .set('Connection', 'close');

      assert.equal(res.status, 404, res.text);
      assert.equal(res.text, 'Anexo não encontrado');
    } finally {
      try { fs.unlinkSync(runtimeFile.fullPath); } catch {}
    }
  });
});

test('GET /gestor/api/funcionarios/:id/anexo/:idx com arquivo ausente no servidor retorna 404 texto simples', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario Anexo Ausente ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-anexo-ausente'),
      cpf: uniqueCpf(),
      anexos: [{
        nome: 'arquivo-ausente.txt',
        mime: 'text/plain',
        tamanho: 13,
        caminho: `uploads/nao-existe-${Date.now()}-${nextCounter()}.txt`,
        data_upload: new Date(),
      }],
    });

    const res = await contextualAgent
      .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/anexo/0`)
      .set('Connection', 'close');

    assert.equal(res.status, 404, res.text);
    assert.equal(res.text, 'Arquivo ausente no servidor');
  });
});

test('GET /gestor/api/funcionarios/:id/anexo/:idx retorna stream inline do anexo real', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const content = 'contrato-anexo-runtime';
    const runtimeFile = createRuntimeAttachmentFile({
      filename: 'anexo-runtime.txt',
      content,
    });

    try {
      const funcionario = await createFuncionarioInTenant(unidadeB._id, {
        nome: `Funcionario Anexo Sucesso ${Date.now()}-${nextCounter()}`,
        email: uniqueEmail('func-anexo-ok'),
        cpf: uniqueCpf(),
        anexos: [{
          nome: 'anexo-runtime.txt',
          mime: 'text/plain',
          tamanho: runtimeFile.size,
          caminho: runtimeFile.relativePath,
          data_upload: new Date(),
        }],
      });

      const res = await contextualAgent
        .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/anexo/0`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .set('Connection', 'close');

      assert.equal(res.status, 200);
      assert.match(String(res.headers['content-type'] || ''), /text\/plain/i);
      assert.match(String(res.headers['content-disposition'] || ''), /inline;/i);
      assert.match(String(res.headers['content-disposition'] || ''), /anexo-runtime\.txt/i);
      assert.equal(Buffer.isBuffer(res.body), true);
      assert.equal(res.body.toString('utf8'), content);
    } finally {
      try { fs.unlinkSync(runtimeFile.fullPath); } catch {}
    }
  });
});

test('GET /gestor/api/funcionarios/:id/anexo/:idx propaga falha interna como 500 texto simples', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const content = 'falha-anexo-runtime';
    const runtimeFile = createRuntimeAttachmentFile({
      filename: 'anexo-falha.txt',
      content,
    });

    const originalCreateReadStream = fs.createReadStream;

    try {
      const funcionario = await createFuncionarioInTenant(unidadeB._id, {
        nome: `Funcionario Anexo Falha ${Date.now()}-${nextCounter()}`,
        email: uniqueEmail('func-anexo-fail'),
        cpf: uniqueCpf(),
        anexos: [{
          nome: 'anexo-falha.txt',
          mime: 'text/plain',
          tamanho: runtimeFile.size,
          caminho: runtimeFile.relativePath,
          data_upload: new Date(),
        }],
      });

      fs.createReadStream = function patchedCreateReadStream() {
        throw new Error('forced anexo failure');
      };

      const res = await contextualAgent
        .get(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}/anexo/0`)
        .set('Connection', 'close');

      assert.equal(res.status, 500, res.text);
      assert.equal(res.text, 'Erro ao baixar anexo');
    } finally {
      fs.createReadStream = originalCreateReadStream;
      try { fs.unlinkSync(runtimeFile.fullPath); } catch {}
    }
  });
});