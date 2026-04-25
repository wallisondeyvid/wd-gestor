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

function buildUniqueEmail(prefix = 'servico-rejeitar-runtime') {
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
    email: buildUniqueEmail('diretor-servico-rejeitar'),
    nome: 'Diretor Servico Rejeitar',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-solicitacoes-servico-rejeitar-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, unidade };
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

function rejectSolicitacao(agent, solicitacaoId, body = {}) {
  return agent
    .post(`/condominios/api/solicitacoes-servico/${solicitacaoId}/rejeitar`)
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send(body);
}

test('POST /condominios/api/solicitacoes-servico/:id/rejeitar retorna 400 quando motivo esta ausente', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439410' });

  const res = await rejectSolicitacao(agent, '507f1f77bcf86cd799439411', {});

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Informe a justificativa da rejeição'
  });
});

test('POST /condominios/api/solicitacoes-servico/:id/rejeitar retorna 404 quando solicitacao nao existe', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439420' });

  const res = await rejectSolicitacao(agent, '507f1f77bcf86cd799439499', { motivo: 'Sem cobertura contratual' });

  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Solicitação não encontrada'
  });
});

test('POST /condominios/api/solicitacoes-servico/:id/rejeitar retorna 403 sem alterar a solicitacao fora do escopo do diretor', async () => {
  const { app } = await getRuntimeContext();
  const unidadeDona = await createEnabledUnit(uniqueLabel('Unidade Dona'), '507f1f77bcf86cd799439430');
  const solicitacao = await createSolicitacao({ unidadeId: unidadeDona._id, nova: true, titulo: 'Fechadura quebrada' });
  const { agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439431' });

  const res = await rejectSolicitacao(agent, solicitacao._id, { motivo: 'Servico fora do escopo da unidade' });

  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    success: false,
    error: 'Solicitação fora do escopo do usuário'
  });

  const persisted = await CondSolicitacaoServico.findById(solicitacao._id).lean();
  assert.equal(persisted?.status, 'aberto');
  assert.equal(persisted?.nova, true);
  assert.equal(persisted?.rejeicao_motivo, null);
});

test('POST /condominios/api/solicitacoes-servico/:id/rejeitar retorna 200 e persiste rejeicao com motivo para diretor autorizado', async () => {
  const { app } = await getRuntimeContext();
  const { unidade, agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439440' });
  const solicitacao = await createSolicitacao({ unidadeId: unidade._id, nova: true, titulo: 'Iluminacao externa falhando' });

  const res = await rejectSolicitacao(agent, solicitacao._id, { motivo: 'Necessario orçamento antes da execução' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { ok: true });

  const persisted = await CondSolicitacaoServico.findById(solicitacao._id).lean();
  assert.equal(persisted?.status, 'rejeitada');
  assert.equal(persisted?.nova, false);
  assert.ok(persisted?.rejeitada_em);
  assert.ok(String(persisted?.rejeitada_por || '').length > 0);
  assert.equal(persisted?.rejeicao_motivo, 'Necessario orçamento antes da execução');
  assert.equal(persisted?.aceita_por, null);
});