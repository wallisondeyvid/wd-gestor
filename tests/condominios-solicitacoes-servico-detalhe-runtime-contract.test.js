import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test, { after } from 'node:test';
import request from 'supertest';

import CondSolicitacaoServico from '../src/core/models/cond_solicitacao_servico.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { createServer } from '../src/server/createServer.js';

const PASSWORD = 'Senha@123456';

let sequence = 0;
let passwordHashPromise = null;
let runtimeContextPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'servico-detalhe-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

function uniqueLabel(prefix) {
  return `${prefix}-${Date.now()}-${nextSequence()}`;
}

async function getPasswordHash() {
  if (!passwordHashPromise) {
    passwordHashPromise = bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));
  }
  return passwordHashPromise;
}

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
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
    }
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const teardownGuard = installTeardownSuppression();

async function getRuntimeContext() {
  if (!runtimeContextPromise) {
    runtimeContextPromise = withEnv(
      { MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined },
      async () => createServer()
    );
  }
  return runtimeContextPromise;
}

after(async () => {
  try {
    if (runtimeContextPromise) {
      const { close } = await runtimeContextPromise;
      await closeWithTeardownGuard(close, teardownGuard);
    }
  } finally {
    await teardownGuard.remove();
  }
});

async function ensureGestorModulo() {
  const existing = await Modulo.findOne({ nome: 'gestor' });
  if (existing) return existing;

  return Modulo.create({
    nome: 'gestor',
    status: 'ativo',
    url_base: '/gestor',
  });
}

async function createEnabledUnit(nome, forcedId) {
  const modulo = await ensureGestorModulo();
  return Unidade.create({
    _id: forcedId,
    nome,
    pessoaTipo: 'pj',
    is_principal: true,
    modulosAcessiveis: [modulo._id],
  });
}

async function createUser({
  email = buildUniqueEmail('diretor-servico'),
  nome = 'Diretor Teste',
  role = 'diretor',
  unidadeId = null,
} = {}) {
  return User.create({
    email,
    senha: await getPasswordHash(),
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  });
}

async function login(agent, { email, senha = PASSWORD }) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

async function createDiretorAgent(app, { unidadeId } = {}) {
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(uniqueLabel('Unidade Runtime'), unidadeId);
  const user = await createUser({
    email: buildUniqueEmail('diretor-servico-detalhe'),
    nome: 'Diretor Servico Detalhe',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-solicitacoes-servico-detalhe-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user, unidade };
}

async function createSolicitacao({ unidadeId, nova = true, titulo = uniqueLabel('Solicitacao Runtime') }) {
  return CondSolicitacaoServico.create({
    unidade_id: String(unidadeId),
    habitacao_id: '507f1f77bcf86cd799439012',
    habitacao_label: 'Apto 101',
    morador_email: buildUniqueEmail('morador-servico'),
    protocolo: uniqueLabel('PROTO'),
    titulo,
    descricao: 'Descricao de teste runtime',
    status: 'aberto',
    nova,
  });
}

function getSolicitacao(agent, solicitacaoId) {
  return agent
    .get(`/condominios/api/solicitacoes-servico/${solicitacaoId}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

test('GET /condominios/api/solicitacoes-servico/:id retorna 200 e marca nova=false para diretor autorizado', async () => {
  const { app } = await getRuntimeContext();
  const { unidade, agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439210' });
  const solicitacao = await createSolicitacao({ unidadeId: unidade._id, nova: true, titulo: 'Vazamento na garagem' });

  const res = await getSolicitacao(agent, solicitacao._id);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
  assert.equal(String(res.body?.data?._id || ''), String(solicitacao._id));
  assert.equal(res.body?.data?.titulo, 'Vazamento na garagem');
  assert.equal(res.body?.data?.nova, false);

  const persisted = await CondSolicitacaoServico.findById(solicitacao._id).lean();
  assert.equal(persisted?.nova, false);
});

test('GET /condominios/api/solicitacoes-servico/:id retorna 403 sem marcar nova=false fora do escopo do diretor', async () => {
  const { app } = await getRuntimeContext();
  const unidadeDona = await createEnabledUnit(uniqueLabel('Unidade Dona'), '507f1f77bcf86cd799439220');
  const solicitacao = await createSolicitacao({ unidadeId: unidadeDona._id, nova: true, titulo: 'Luz do corredor apagada' });
  const { agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439221' });

  const res = await getSolicitacao(agent, solicitacao._id);

  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Solicitação fora do escopo do usuário'
  });

  const persisted = await CondSolicitacaoServico.findById(solicitacao._id).lean();
  assert.equal(persisted?.nova, true);
});