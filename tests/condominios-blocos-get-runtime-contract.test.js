import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test, { after } from 'node:test';
import request from 'supertest';

import CondBloco from '../src/core/models/cond_bloco.js';
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

function buildUniqueEmail(prefix = 'blocos-get-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(40000000000 + id).slice(-11);
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
  email = buildUniqueEmail('user-blocos-get'),
  nome = 'Usuario Blocos GET',
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
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(uniqueLabel('Unidade Diretor Blocos'), unidadeId);
  const user = await createUser({
    email: buildUniqueEmail('diretor-blocos-get'),
    nome: 'Diretor Blocos GET',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-blocos-get-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, unidade, user };
}

async function createAdminAgent(app) {
  const user = await createUser({
    email: buildUniqueEmail('admin-blocos-get'),
    nome: 'Admin Blocos GET',
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

async function createBloco({
  unidadeId,
  nome = uniqueLabel('Bloco Runtime'),
  ordem = 0,
  ativo = true,
} = {}) {
  return CondBloco.create({
    unidade_id: unidadeId,
    nome,
    ordem,
    ativo,
  });
}

function listBlocos(requester, query = '') {
  return requester
    .get(`/condominios/api/blocos${query}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

function blocoIds(body) {
  return (Array.isArray(body) ? body : []).map((item) => String(item._id));
}

function assertArrayResponse(res) {
  assert.equal(Array.isArray(res.body), true, JSON.stringify(res.body));
}

test('GET /condominios/api/blocos sem sessao retorna contrato observavel atual', async () => {
  const { app } = await getRuntimeContext();

  const res = await listBlocos(request(app));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, []);
});

test('GET /condominios/api/blocos sem query unidade limita usuario comum aos blocos permitidos', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439810' });
  const outraUnidade = await createEnabledUnit(uniqueLabel('Outra Unidade Blocos'), '507f1f77bcf86cd799439811');

  const blocoPermitido = await createBloco({
    unidadeId: unidade._id,
    nome: 'Bloco Permitido Runtime',
    ordem: 1,
  });
  await createBloco({
    unidadeId: outraUnidade._id,
    nome: 'Bloco Externo Runtime',
    ordem: 1,
  });

  const res = await listBlocos(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(blocoIds(res.body), [String(blocoPermitido._id)]);
  assert.equal(String(res.body[0].unidade_id), String(unidade._id));
  assert.equal(res.body[0].nome, 'Bloco Permitido Runtime');
});

test('GET /condominios/api/blocos com query unidade da propria unidade retorna blocos da unidade', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439820' });
  const bloco = await createBloco({
    unidadeId: unidade._id,
    nome: 'Bloco Proprio Runtime',
    ordem: 2,
  });

  const res = await listBlocos(agent, `?unidade=${unidade._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(blocoIds(res.body), [String(bloco._id)]);
  assert.equal(String(res.body[0].unidade_id), String(unidade._id));
});

test('GET /condominios/api/blocos com query unidade fora do escopo do usuario comum retorna lista vazia', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439830' });
  const outraUnidade = await createEnabledUnit(uniqueLabel('Unidade Fora Escopo Blocos'), '507f1f77bcf86cd799439831');

  await createBloco({
    unidadeId: unidade._id,
    nome: 'Bloco Local Runtime',
    ordem: 1,
  });
  const blocoExterno = await createBloco({
    unidadeId: outraUnidade._id,
    nome: 'Bloco Externo Runtime',
    ordem: 1,
  });

  const res = await listBlocos(agent, `?unidade=${outraUnidade._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(res.body, []);
});

test('GET /condominios/api/blocos para admin sem query unidade mantém leitura ampla', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createAdminAgent(app);
  const unidadeA = await createEnabledUnit(uniqueLabel('Admin Unidade Bloco A'), '507f1f77bcf86cd799439840');
  const unidadeB = await createEnabledUnit(uniqueLabel('Admin Unidade Bloco B'), '507f1f77bcf86cd799439841');

  const blocoA = await createBloco({ unidadeId: unidadeA._id, nome: 'Bloco Admin A', ordem: 1 });
  const blocoB = await createBloco({ unidadeId: unidadeB._id, nome: 'Bloco Admin B', ordem: 1 });

  const res = await listBlocos(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  const ids = new Set(blocoIds(res.body));
  assert.equal(ids.has(String(blocoA._id)), true, JSON.stringify(res.body));
  assert.equal(ids.has(String(blocoB._id)), true, JSON.stringify(res.body));
  assert.equal(res.body.some((item) => String(item.unidade_id) === String(unidadeA._id)), true, JSON.stringify(res.body));
  assert.equal(res.body.some((item) => String(item.unidade_id) === String(unidadeB._id)), true, JSON.stringify(res.body));
});

test('GET /condominios/api/blocos para admin com query unidade explicita filtra pela unidade informada', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createAdminAgent(app);
  const unidadeA = await createEnabledUnit(uniqueLabel('Admin Filtro Bloco A'), '507f1f77bcf86cd799439850');
  const unidadeB = await createEnabledUnit(uniqueLabel('Admin Filtro Bloco B'), '507f1f77bcf86cd799439851');

  const blocoA = await createBloco({ unidadeId: unidadeA._id, nome: 'Filtro Admin A', ordem: 1 });
  await createBloco({ unidadeId: unidadeB._id, nome: 'Filtro Admin B', ordem: 1 });

  const res = await listBlocos(agent, `?unidade=${unidadeA._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(blocoIds(res.body), [String(blocoA._id)]);
  assert.equal(String(res.body[0].unidade_id), String(unidadeA._id));
});

test('GET /condominios/api/blocos com unidade invalida retorna array vazio', async () => {
  const { app } = await getRuntimeContext();

  const res = await listBlocos(request(app), '?unidade=u-test');

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, []);
});