import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test, { after } from 'node:test';
import request from 'supertest';

import CondAndar from '../src/core/models/cond_andar.js';
import CondBloco from '../src/core/models/cond_bloco.js';
import CondHabitacao from '../src/core/models/cond_habitacao.js';
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

function buildUniqueEmail(prefix = 'habitacoes-busca-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(50000000000 + id).slice(-11);
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
  email = buildUniqueEmail('user-habitacoes-busca'),
  nome = 'Usuario Habitacoes Busca',
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
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(uniqueLabel('Unidade Diretor Habitacoes'), unidadeId);
  const user = await createUser({
    email: buildUniqueEmail('diretor-habitacoes-busca'),
    nome: 'Diretor Habitacoes Busca',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-habitacoes-busca-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, unidade, user };
}

async function createAdminAgent(app) {
  const user = await createUser({
    email: buildUniqueEmail('admin-habitacoes-busca'),
    nome: 'Admin Habitacoes Busca',
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

async function createBloco({ unidadeId, nome = uniqueLabel('Bloco Hab Runtime') } = {}) {
  return CondBloco.create({
    unidade_id: unidadeId,
    nome,
    ordem: 0,
    ativo: true,
  });
}

async function createAndar({ unidadeId, nome = uniqueLabel('Andar Hab Runtime') } = {}) {
  return CondAndar.create({
    unidade_id: unidadeId,
    nome,
    ordem: 0,
    ativo: true,
  });
}

async function createHabitacao({
  unidadeId,
  blocoId = null,
  andarId = null,
  numero = '101',
  tipo = 'Apartamento',
  ativa = true,
} = {}) {
  return CondHabitacao.create({
    unidade_id: unidadeId,
    bloco_id: blocoId,
    andar_id: andarId,
    numero,
    tipo,
    ativa,
  });
}

function listHabitacoes(requester, query = '') {
  return requester
    .get(`/condominios/api/habitacoes/busca${query}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

function assertArrayResponse(res) {
  assert.equal(Array.isArray(res.body), true, JSON.stringify(res.body));
}

function habitacaoIds(body) {
  return (Array.isArray(body) ? body : []).map((item) => String(item._id));
}

test('GET /condominios/api/habitacoes/busca sem sessao caracteriza o contrato atual', async () => {
  const { app } = await getRuntimeContext();

  const unidade = await createEnabledUnit(uniqueLabel('Unidade Sem Sessao Hab'));
  await createHabitacao({ unidadeId: unidade._id, numero: '1001' });

  const res = await listHabitacoes(request(app));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(res.body, []);
});

test('GET /condominios/api/habitacoes/busca sem query unidade limita usuario comum as unidades permitidas', async () => {
  const { app } = await getRuntimeContext();
  const unidadeA = await createEnabledUnit(uniqueLabel('Unidade A Hab Sem Query'));
  const unidadeB = await createEnabledUnit(uniqueLabel('Unidade B Hab Sem Query'));
  const blocoA = await createBloco({ unidadeId: unidadeA._id, nome: 'Bloco A' });
  const andarA = await createAndar({ unidadeId: unidadeA._id, nome: 'Andar A' });

  const habA = await createHabitacao({ unidadeId: unidadeA._id, blocoId: blocoA._id, andarId: andarA._id, numero: '101', tipo: 'Apartamento' });
  const habB = await createHabitacao({ unidadeId: unidadeB._id, numero: '202', tipo: 'Casa' });

  const { agent } = await createDiretorAgent(app, { unidadeId: unidadeA._id });
  const res = await listHabitacoes(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(habitacaoIds(res.body), [String(habA._id)]);
  assert.equal(String(res.body[0]?.unidade?._id || ''), String(unidadeA._id), JSON.stringify(res.body));
  assert.equal(String(res.body[0]?.bloco?._id || ''), String(blocoA._id), JSON.stringify(res.body));
  assert.equal(String(res.body[0]?.andar?._id || ''), String(andarA._id), JSON.stringify(res.body));
  assert.equal(res.body[0]?.numero, '101', JSON.stringify(res.body));
  assert.equal(habitacaoIds(res.body).includes(String(habB._id)), false, JSON.stringify(res.body));
});

test('GET /condominios/api/habitacoes/busca com query da propria unidade retorna as habitacoes da unidade informada', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createEnabledUnit(uniqueLabel('Unidade Propria Hab Query'));
  const hab = await createHabitacao({ unidadeId: unidade._id, numero: '303', tipo: 'Loja' });

  const { agent } = await createDiretorAgent(app, { unidadeId: unidade._id });
  const res = await listHabitacoes(agent, `?unidade=${unidade._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(habitacaoIds(res.body), [String(hab._id)]);
  assert.equal(res.body[0]?.numero, '303', JSON.stringify(res.body));
  assert.equal(String(res.body[0]?.unidade?._id || ''), String(unidade._id), JSON.stringify(res.body));
});

test('GET /condominios/api/habitacoes/busca com query de unidade fora do escopo caracteriza o contrato critico atual', async () => {
  const { app } = await getRuntimeContext();
  const unidadeA = await createEnabledUnit(uniqueLabel('Unidade A Hab Fora Escopo'));
  const unidadeB = await createEnabledUnit(uniqueLabel('Unidade B Hab Fora Escopo'));
  await createHabitacao({ unidadeId: unidadeA._id, numero: '404-A', tipo: 'Apartamento' });
  const habB = await createHabitacao({ unidadeId: unidadeB._id, numero: '404-B', tipo: 'Apartamento' });

  const { agent } = await createDiretorAgent(app, { unidadeId: unidadeA._id });
  const res = await listHabitacoes(agent, `?unidade=${unidadeB._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(res.body, [], JSON.stringify(res.body));
});

test('GET /condominios/api/habitacoes/busca sem query unidade preserva leitura ampla para admin', async () => {
  const { app } = await getRuntimeContext();
  const unidadeA = await createEnabledUnit(uniqueLabel('Unidade A Hab Admin'));
  const unidadeB = await createEnabledUnit(uniqueLabel('Unidade B Hab Admin'));
  const habA = await createHabitacao({ unidadeId: unidadeA._id, numero: '501' });
  const habB = await createHabitacao({ unidadeId: unidadeB._id, numero: '502' });

  const { agent } = await createAdminAgent(app);
  const res = await listHabitacoes(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  const ids = habitacaoIds(res.body);
  assert.equal(ids.includes(String(habA._id)), true, JSON.stringify(res.body));
  assert.equal(ids.includes(String(habB._id)), true, JSON.stringify(res.body));
});

test('GET /condominios/api/habitacoes/busca com query unidade explicita filtra para admin', async () => {
  const { app } = await getRuntimeContext();
  const unidadeA = await createEnabledUnit(uniqueLabel('Unidade A Hab Admin Query'));
  const unidadeB = await createEnabledUnit(uniqueLabel('Unidade B Hab Admin Query'));
  await createHabitacao({ unidadeId: unidadeA._id, numero: '601' });
  const habB = await createHabitacao({ unidadeId: unidadeB._id, numero: '602' });

  const { agent } = await createAdminAgent(app);
  const res = await listHabitacoes(agent, `?unidade=${unidadeB._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(habitacaoIds(res.body), [String(habB._id)]);
});

test('GET /condominios/api/habitacoes/busca com unidade invalida caracteriza o contrato atual', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createAdminAgent(app);

  const res = await listHabitacoes(agent, '?unidade=invalida');

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(res.body, []);
});