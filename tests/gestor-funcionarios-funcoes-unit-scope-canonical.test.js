import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { createServer } from '../src/server/createServer.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import Funcao from '../src/core/models/funcao.js';
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
  return String(value || '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function authenticateAgent(app, { role, unidadeId = null, nomeBase }) {
  const email = uniqueEmail(`tenant-only-${role}`);
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  const payload = {
    email,
    senha: senhaHash,
    cpf: uniqueCpf(),
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: `${nomeBase} ${nextCounter()}`,
  };

  if (unidadeId) payload.unidade_id = unidadeId;

  await User.create(payload);

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(
    loginRes.status >= 300 && loginRes.status < 400,
    `Login ${role} deve redirecionar, recebido ${loginRes.status} com body ${JSON.stringify(loginRes.body)}`,
  );

  return { agent, email };
}

function getTenantModel(modelClass, unidadeId) {
  return resolveModel({
    name: modelClass.modelName,
    schema: modelClass.schema,
    unitScope: createUnitScope({ unidadeId: normalizeId(unidadeId) }),
  });
}

async function createFuncaoInTenant(unidadePrincipalId, { nome, descricao }) {
  const FuncaoModel = getTenantModel(Funcao, unidadePrincipalId);
  return FuncaoModel.create({
    nome,
    descricao,
    ativa: true,
    unidade_principal_id: unidadePrincipalId,
  });
}

async function createFuncionarioInTenant(unidadeId, { nome, email, cpf, funcaoId = null, sexo = 'M' }) {
  const FuncionarioModel = getTenantModel(Funcionario, unidadeId);
  return FuncionarioModel.create({
    unidade_id: unidadeId,
    funcao_id: funcaoId || undefined,
    nome,
    rg: `RG-${nextCounter()}`,
    cpf,
    data_nascimento: new Date('1990-01-01T00:00:00.000Z'),
    sexo,
    endereco: { cep: '01001000' },
    email,
    telefone: '(11) 99999-9999',
    ativo: true,
  });
}

async function withHarness(run) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();
  const createdEmails = [];

  try {
    const { unidadeA, unidadeB, unidadeC } = await createModuloAndUnits();
    const diretorFilialAuth = await authenticateAgent(app, {
      role: 'diretor',
      unidadeId: unidadeB._id,
      nomeBase: 'Diretor Filial Contextual',
    });
    createdEmails.push(diretorFilialAuth.email);

    await run({
      app,
      unidadeA,
      unidadeB,
      unidadeC,
      diretorFilialAgent: diretorFilialAuth.agent,
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
    }
  }
}

test('Funções HTML: filial contextual renderiza apenas a principal canônica do contexto atual', async () => {
  await withHarness(async ({ unidadeA, unidadeB, unidadeC, diretorFilialAgent }) => {
    const funcaoAName = `Funcao Principal A ${Date.now()}-${nextCounter()}`;
    const funcaoCName = `Funcao Principal C ${Date.now()}-${nextCounter()}`;

    await createFuncaoInTenant(unidadeA._id, {
      nome: funcaoAName,
      descricao: 'Função visível no contexto da filial',
    });

    await createFuncaoInTenant(unidadeC._id, {
      nome: funcaoCName,
      descricao: 'Função fora do contexto atual',
    });

    const res = await diretorFilialAgent
      .get('/gestor/funcoes')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, new RegExp(escapeRegExp(funcaoAName)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(funcaoCName)));
    assert.match(res.text, new RegExp(escapeRegExp(unidadeA.nome)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(unidadeC.nome)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(normalizeId(unidadeB._id))));
  });
});

test('Funções API: filial contextual resolve a lista pela principal canônica atual', async () => {
  await withHarness(async ({ unidadeA, unidadeB, unidadeC, diretorFilialAgent }) => {
    const funcaoAName = `Funcao API A ${Date.now()}-${nextCounter()}`;
    const funcaoCName = `Funcao API C ${Date.now()}-${nextCounter()}`;

    await createFuncaoInTenant(unidadeA._id, {
      nome: funcaoAName,
      descricao: 'Função disponível para a filial pela matriz',
    });

    await createFuncaoInTenant(unidadeC._id, {
      nome: funcaoCName,
      descricao: 'Função fora do contexto atual',
    });

    const res = await diretorFilialAgent
      .get(`/gestor/api/funcoes/unidade/${normalizeId(unidadeB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    const data = Array.isArray(res.body) ? res.body : (Array.isArray(res.body?.data) ? res.body.data : []);
    assert.ok(data.some((item) => String(item?.nome || item?.descricao_final || '') === funcaoAName));
    assert.equal(data.some((item) => String(item?.nome || item?.descricao_final || '') === funcaoCName), false);
  });
});

test('Funções API: filial contextual bloqueia criação em principal fora do contexto atual', async () => {
  await withHarness(async ({ unidadeC, diretorFilialAgent }) => {
    const res = await diretorFilialAgent
      .post('/gestor/api/funcoes')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        nome: `Funcao Bloqueada ${Date.now()}-${nextCounter()}`,
        descricao: 'Nao deveria criar fora do contexto atual',
        unidade_principal_id: normalizeId(unidadeC._id),
        modulos_habilitados: [],
      });

    assert.equal(res.status, 404);
  });
});

test('Funcionários HTML: filial contextual renderiza apenas a unidade canônica atual no formulário', async () => {
  await withHarness(async ({ unidadeA, unidadeB, diretorFilialAgent }) => {
    await createFuncionarioInTenant(unidadeA._id, {
      nome: `Funcionario A ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-a'),
      cpf: uniqueCpf(),
      sexo: 'M',
    });

    await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-b'),
      cpf: uniqueCpf(),
      sexo: 'F',
    });

    const res = await diretorFilialAgent
      .get('/gestor/funcionarios')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, new RegExp(`data-unidade-default="${escapeRegExp(normalizeId(unidadeA._id))}"`));
  });
});