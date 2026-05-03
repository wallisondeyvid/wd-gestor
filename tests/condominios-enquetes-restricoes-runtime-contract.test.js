import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import test, { after } from 'node:test';
import request from 'supertest';

import CondAndar from '../src/core/models/cond_andar.js';
import CondBloco from '../src/core/models/cond_bloco.js';
import CondHabitacao from '../src/core/models/cond_habitacao.js';
import CondMorador from '../src/core/models/cond_morador.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { createServer } from '../src/server/createServer.js';
import { assertOfflineResponseContract } from './helpers/assertOfflineContract.js';

const PASSWORD = 'Senha@123456';

let sequence = 0;
let passwordHashPromise = null;
let runtimeContextPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function uniqueLabel(prefix) {
  return `${prefix}-${Date.now()}-${nextSequence()}`;
}

function buildUniqueEmail(prefix = 'enquetes-restricoes-runtime') {
  return `${prefix}.${Date.now()}.${nextSequence()}@example.com`;
}

function buildUniqueCpf() {
  return String(81000000000 + nextSequence()).slice(-11);
}

async function getPasswordHash() {
  if (!passwordHashPromise) {
    passwordHashPromise = bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));
  }
  return passwordHashPromise;
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
  email = buildUniqueEmail('user-enquetes-restricoes'),
  nome = 'Usuario Restricoes Enquetes',
  role = 'diretor',
  unidadeId = null,
  globalRole = undefined,
} = {}) {
  return User.create({
    email,
    senha: await getPasswordHash(),
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
    global_role: globalRole,
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
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(uniqueLabel('Unidade Diretor Enquetes'), unidadeId);
  const user = await createUser({
    email: buildUniqueEmail('diretor-enquetes-restricoes'),
    nome: 'Diretor Restricoes Enquetes',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-enquetes-restricoes-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, unidade, user };
}

async function createAdminAgent(app) {
  const user = await createUser({
    email: buildUniqueEmail('admin-enquetes-restricoes'),
    nome: 'Admin Restricoes Enquetes',
    role: 'admin',
    unidadeId: null,
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user };
}

async function createBloco({ unidadeId, nome = uniqueLabel('Bloco Restricoes') } = {}) {
  return CondBloco.create({ unidade_id: unidadeId, nome, ordem: 0, ativo: true });
}

async function createAndar({ unidadeId, nome = uniqueLabel('Andar Restricoes') } = {}) {
  return CondAndar.create({ unidade_id: unidadeId, nome, ordem: 0, ativo: true });
}

async function createHabitacao({
  unidadeId,
  blocoId = null,
  andarId = null,
  numero = '101',
  tipo = 'Apartamento',
} = {}) {
  return CondHabitacao.create({
    unidade_id: unidadeId,
    bloco_id: blocoId,
    andar_id: andarId,
    numero,
    tipo,
    ativa: true,
  });
}

async function createMorador({
  unidadeId,
  habitacaoId,
  nome = 'Morador Restricoes',
  email = buildUniqueEmail('morador-enquetes-restricoes'),
  cpf = buildUniqueCpf(),
} = {}) {
  return CondMorador.create({
    unidade_id: unidadeId,
    habitacao_id: habitacaoId,
    nome,
    email,
    cpf,
    ativo: true,
  });
}

function listRestricoesHabitacoes(requester, query = {}) {
  return requester
    .get('/condominios/api/enquetes/restricoes/habitacoes')
    .query(query)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

function listRestricoesMoradores(requester, query = {}) {
  return requester
    .get('/condominios/api/enquetes/restricoes/moradores')
    .query(query)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

function assertOkArrayEnvelope(res) {
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.ok, true, JSON.stringify(res.body));
  assert.equal(Array.isArray(res.body?.data), true, JSON.stringify(res.body));
}

async function createOfflineSessionAgent(sessionUser) {
  const built = await createServer({ skipDb: true, deferErrorHandlers: true });
  built.app.get('/__tests__/seed-enquetes-restricoes-session', (req, res) => {
    req.session.user = sessionUser;
    req.session.save((err) => {
      if (err) return res.status(500).json({ ok: false, error: 'SESSION_SEED_FAILED' });
      return res.status(204).end();
    });
  });

  const agent = request.agent(built.app);
  const seed = await agent
    .get('/__tests__/seed-enquetes-restricoes-session')
    .set('Connection', 'close');

  assert.equal(seed.status, 204, JSON.stringify(seed.body));
  return { agent, close: built.close };
}

test('GET /condominios/api/enquetes/restricoes/habitacoes sem sessao preserva 401 com envelope atual', async () => {
  const { app } = await getRuntimeContext();

  const res = await listRestricoesHabitacoes(request(app));

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Não autenticado', success: false });
});

test('GET /condominios/api/enquetes/restricoes/moradores sem sessao preserva 401 com envelope atual', async () => {
  const { app } = await getRuntimeContext();

  const res = await listRestricoesMoradores(request(app));

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Não autenticado', success: false });
});

test('GET /condominios/api/enquetes/restricoes/habitacoes sem unidade efetiva no ramo privilegiado preserva 400 atual', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createAdminAgent(app);

  const res = await listRestricoesHabitacoes(agent);

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, { error: 'Unidade inválida', success: false });
});

test('GET /condominios/api/enquetes/restricoes/moradores sem unidade efetiva no ramo privilegiado preserva 400 atual', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createAdminAgent(app);

  const res = await listRestricoesMoradores(agent);

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, { error: 'Unidade inválida', success: false });
});

test('GET /condominios/api/enquetes/restricoes/habitacoes ignora query fora do escopo para usuario comum e preserva shape consumido pelo caller', async () => {
  const { app } = await getRuntimeContext();
  const unidadeA = await createEnabledUnit(uniqueLabel('Unidade A Enquetes Hab'));
  const unidadeB = await createEnabledUnit(uniqueLabel('Unidade B Enquetes Hab'));
  const blocoA = await createBloco({ unidadeId: unidadeA._id, nome: 'Bloco Azul' });
  const andarA = await createAndar({ unidadeId: unidadeA._id, nome: 'Andar 7' });
  const habA = await createHabitacao({
    unidadeId: unidadeA._id,
    blocoId: blocoA._id,
    andarId: andarA._id,
    numero: '701',
    tipo: 'Cobertura',
  });
  await createHabitacao({ unidadeId: unidadeB._id, numero: '999', tipo: 'Apartamento' });

  const { agent } = await createDiretorAgent(app, { unidadeId: unidadeA._id });
  const res = await listRestricoesHabitacoes(agent, { unidade_id: String(unidadeB._id) });

  assertOkArrayEnvelope(res);
  assert.equal(res.body.data.length, 1, JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.value, String(habA._id), JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.condominioNome, unidadeA.nome, JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.habitacao?.bloco, 'Bloco Azul', JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.habitacao?.andar, 'Andar 7', JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.habitacao?.tipo, 'Cobertura', JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.habitacao?.numero, '701', JSON.stringify(res.body));
  assert.equal(typeof res.body.data[0]?.label, 'string', JSON.stringify(res.body));
  assert.match(res.body.data[0].label, /Bloco Azul/);
  assert.match(res.body.data[0].label, /Andar 7/);
  assert.match(res.body.data[0].label, /Cobertura 701/);
});

test('GET /condominios/api/enquetes/restricoes/moradores ignora query fora do escopo para usuario comum e preserva shape consumido pelo caller', async () => {
  const { app } = await getRuntimeContext();
  const unidadeA = await createEnabledUnit(uniqueLabel('Unidade A Enquetes Mor'));
  const unidadeB = await createEnabledUnit(uniqueLabel('Unidade B Enquetes Mor'));
  const blocoA = await createBloco({ unidadeId: unidadeA._id, nome: 'Bloco Verde' });
  const andarA = await createAndar({ unidadeId: unidadeA._id, nome: 'Andar 3' });
  const habA = await createHabitacao({
    unidadeId: unidadeA._id,
    blocoId: blocoA._id,
    andarId: andarA._id,
    numero: '302',
    tipo: 'Apartamento',
  });
  const habB = await createHabitacao({ unidadeId: unidadeB._id, numero: '888', tipo: 'Casa' });
  const emailA = buildUniqueEmail('morador-a-enquetes-restricoes');
  const moradorA = await createMorador({
    unidadeId: unidadeA._id,
    habitacaoId: habA._id,
    nome: 'Maria Restricoes',
    email: emailA,
  });
  await createMorador({
    unidadeId: unidadeB._id,
    habitacaoId: habB._id,
    nome: 'Outro Morador',
    email: buildUniqueEmail('morador-b-enquetes-restricoes'),
  });

  const { agent } = await createDiretorAgent(app, { unidadeId: unidadeA._id });
  const res = await listRestricoesMoradores(agent, { unidade_id: String(unidadeB._id) });

  assertOkArrayEnvelope(res);
  assert.equal(res.body.data.length, 1, JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.value, emailA.toLowerCase(), JSON.stringify(res.body));
  assert.equal(typeof res.body.data[0]?.label, 'string', JSON.stringify(res.body));
  assert.match(res.body.data[0].label, /Maria Restricoes/);
  assert.match(res.body.data[0].label, /Bloco Verde/);
  assert.match(res.body.data[0].label, /Andar 3/);
  assert.match(res.body.data[0].label, /Apartamento 302/);
  assert.equal(
    res.body.data[0]?.fotoUrl,
    `/api/usuarios/foto?email=${encodeURIComponent(emailA.toLowerCase())}`,
    JSON.stringify(res.body)
  );
  assert.equal(res.body.data[0]?.habitacao?.bloco, 'Bloco Verde', JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.habitacao?.andar, 'Andar 3', JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.habitacao?.tipo, 'Apartamento', JSON.stringify(res.body));
  assert.equal(res.body.data[0]?.habitacao?.numero, '302', JSON.stringify(res.body));
  assert.notEqual(String(moradorA._id || '').length, 0);
});

test('GET /condominios/api/enquetes/restricoes/habitacoes preserva contrato offline autenticado', async () => {
  const { agent, close } = await createOfflineSessionAgent({
    id: '000000000000000000000001',
    nome: 'Diretor Offline Restricoes Hab',
    role: 'diretor',
    unidade_id: '000000000000000000000010',
  });
  const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: 0,
  });

  try {
    const res = await listRestricoesHabitacoes(agent);
    assertOfflineResponseContract(res);
  } finally {
    if (originalReadyStateDescriptor) {
      Object.defineProperty(mongoose.connection, 'readyState', originalReadyStateDescriptor);
    } else {
      delete mongoose.connection.readyState;
    }
    await closeWithTeardownGuard(close, teardownGuard);
  }
});

test('GET /condominios/api/enquetes/restricoes/moradores preserva contrato offline autenticado', async () => {
  const { agent, close } = await createOfflineSessionAgent({
    id: '000000000000000000000002',
    nome: 'Diretor Offline Restricoes Mor',
    role: 'diretor',
    unidade_id: '000000000000000000000010',
  });
  const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: 0,
  });

  try {
    const res = await listRestricoesMoradores(agent);
    assertOfflineResponseContract(res);
  } finally {
    if (originalReadyStateDescriptor) {
      Object.defineProperty(mongoose.connection, 'readyState', originalReadyStateDescriptor);
    } else {
      delete mongoose.connection.readyState;
    }
    await closeWithTeardownGuard(close, teardownGuard);
  }
});