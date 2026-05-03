import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test, { after } from 'node:test';
import request from 'supertest';

import Funcionario from '../src/core/models/Funcionario.js';
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

function buildUniqueEmail(prefix = 'unidades-list-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf(base = 60000000000) {
  const id = nextSequence();
  return String(base + id).slice(-11);
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

async function createPrincipalUnit(nome, forcedId) {
  const modulo = await ensureGestorModulo();
  return Unidade.create({
    _id: forcedId,
    nome,
    pessoaTipo: 'pj',
    is_principal: true,
    subunidade: false,
    ativa: true,
    modulosAcessiveis: [modulo._id],
  });
}

async function createRelatedUnit({ nome, principalUnitId, forcedId }) {
  const modulo = await ensureGestorModulo();
  return Unidade.create({
    _id: forcedId,
    nome,
    pessoaTipo: 'pj',
    is_principal: false,
    subunidade: true,
    ativa: true,
    unidade_principal_id: principalUnitId,
    modulosAcessiveis: [modulo._id],
  });
}

async function createUser({
  email = buildUniqueEmail('user-unidades-list'),
  nome = 'Usuario Unidades List',
  role = 'diretor',
  unidadeId = null,
  globalRole = undefined,
  funcionarioId = undefined,
} = {}) {
  const payload = {
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
  };

  if (funcionarioId !== undefined) payload.funcionario_id = funcionarioId;
  return User.create(payload);
}

async function createFuncionario({ unidadeId, userId, email, nome = 'Funcionario Runtime' } = {}) {
  return Funcionario.create({
    unidade_id: unidadeId,
    usuario_id: userId || null,
    nome,
    rg: `RG-${nextSequence()}`,
    cpf: buildUniqueCpf(70000000000),
    data_nascimento: new Date('1990-01-15T00:00:00.000Z'),
    sexo: 'N',
    email: email || buildUniqueEmail('funcionario-unidades-list'),
    telefone: '(11) 98888-0000',
    ativo: true,
  });
}

async function login(agent, { email, senha = PASSWORD }) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

async function createDiretorAgent(app, { unidadeId, forcedEmailPrefix = 'diretor-unidades-list' } = {}) {
  const unidade = await Unidade.findById(unidadeId) || await createPrincipalUnit(uniqueLabel('Unidade Diretor Unidades'), unidadeId);
  const user = await createUser({
    email: buildUniqueEmail(forcedEmailPrefix),
    nome: 'Diretor Unidades List',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-unidades-list-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, unidade, user, loginRes };
}

async function createFallbackDiretorAgent(app, { unidadeId } = {}) {
  const unidade = await Unidade.findById(unidadeId) || await createPrincipalUnit(uniqueLabel('Unidade Fallback Unidades'), unidadeId);
  const email = buildUniqueEmail('diretor-fallback-unidades-list');
  const user = await createUser({
    email,
    nome: 'Diretor Fallback Unidades List',
    role: 'diretor',
    unidadeId: null,
  });

  const funcionario = await createFuncionario({
    unidadeId: unidade._id,
    userId: user._id,
    email,
    nome: 'Funcionario Fallback Unidades',
  });

  await User.updateOne(
    { _id: user._id },
    { $set: { funcionario_id: funcionario._id } }
  );

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    funcionario_id: funcionario._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-unidades-list-runtime-contract-test-fallback',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });

  return { agent, unidade, user, funcionario, loginRes };
}

async function createAdminAgent(app) {
  const user = await createUser({
    email: buildUniqueEmail('admin-unidades-list'),
    nome: 'Admin Unidades List',
    role: 'admin',
    unidadeId: null,
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user, loginRes };
}

async function createUnresolvedDiretorLoginAttempt(app) {
  const user = await createUser({
    email: buildUniqueEmail('diretor-sem-unidade-unidades-list'),
    nome: 'Diretor Sem Unidade Resolvida',
    role: 'diretor',
    unidadeId: null,
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  return { agent, user, loginRes };
}

function listUnidades(requester) {
  return requester
    .get('/condominios/api/unidades')
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

function assertArrayResponse(res) {
  assert.equal(Array.isArray(res.body), true, JSON.stringify(res.body));
}

function unitIds(body) {
  return (Array.isArray(body) ? body : []).map((item) => String(item._id));
}

function pickObserved(ids, expectedIds) {
  const expectedSet = new Set(expectedIds.map(String));
  return ids.filter((id) => expectedSet.has(String(id))).sort();
}

test('GET /condominios/api/unidades sem sessao retorna array vazio', async () => {
  const { app } = await getRuntimeContext();

  const res = await listUnidades(request(app));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, []);
});

test('GET /condominios/api/unidades para usuario comum contextual retorna apenas matriz e relacionadas do proprio cluster', async () => {
  const { app } = await getRuntimeContext();
  const principal = await createPrincipalUnit(uniqueLabel('Principal A Unidades'), '507f1f77bcf86cd799439a10');
  const relacionada = await createRelatedUnit({
    nome: uniqueLabel('Relacionada A Unidades'),
    principalUnitId: principal._id,
    forcedId: '507f1f77bcf86cd799439a11',
  });
  const externa = await createPrincipalUnit(uniqueLabel('Externa B Unidades'), '507f1f77bcf86cd799439a12');
  const { agent } = await createDiretorAgent(app, { unidadeId: principal._id });

  const res = await listUnidades(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);

  const ids = unitIds(res.body);
  const allowedIds = [String(principal._id), String(relacionada._id)];
  const observedAllowed = pickObserved(ids, allowedIds);

  assert.deepEqual(observedAllowed, allowedIds.slice().sort(), JSON.stringify(res.body));
  assert.equal(ids.includes(String(externa._id)), false, JSON.stringify(res.body));
  assert.equal(ids.every((id) => allowedIds.includes(id)), true, JSON.stringify(res.body));
});

test('GET /condominios/api/unidades com fallback legado observado retorna matriz e relacionadas mesmo com login negado ao modulo', async () => {
  const { app } = await getRuntimeContext();
  const principal = await createPrincipalUnit(uniqueLabel('Principal Fallback Unidades'), '507f1f77bcf86cd799439a20');
  const relacionada = await createRelatedUnit({
    nome: uniqueLabel('Relacionada Fallback Unidades'),
    principalUnitId: principal._id,
    forcedId: '507f1f77bcf86cd799439a21',
  });
  const externa = await createPrincipalUnit(uniqueLabel('Externa Fallback Unidades'), '507f1f77bcf86cd799439a22');
  const { agent, loginRes } = await createFallbackDiretorAgent(app, { unidadeId: principal._id });

  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/login?erro=modulo&motivo=diretor_sem_unidade');

  const res = await listUnidades(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);

  const ids = unitIds(res.body);
  const allowedIds = [String(principal._id), String(relacionada._id)];
  const observedAllowed = pickObserved(ids, allowedIds);

  assert.deepEqual(observedAllowed, allowedIds.slice().sort(), JSON.stringify(res.body));
  assert.equal(ids.includes(String(externa._id)), false, JSON.stringify(res.body));
  assert.equal(ids.every((id) => allowedIds.includes(id)), true, JSON.stringify(res.body));
});

test('GET /condominios/api/unidades para usuario comum na matriz inclui todas as relacionadas do proprio cluster', async () => {
  const { app } = await getRuntimeContext();
  const principal = await createPrincipalUnit(uniqueLabel('Principal Cluster Unidades'), '507f1f77bcf86cd799439a30');
  const relacionadaA = await createRelatedUnit({
    nome: uniqueLabel('Relacionada A Cluster Unidades'),
    principalUnitId: principal._id,
    forcedId: '507f1f77bcf86cd799439a31',
  });
  const relacionadaB = await createRelatedUnit({
    nome: uniqueLabel('Relacionada B Cluster Unidades'),
    principalUnitId: principal._id,
    forcedId: '507f1f77bcf86cd799439a32',
  });
  const externa = await createPrincipalUnit(uniqueLabel('Externa Cluster Unidades'), '507f1f77bcf86cd799439a33');
  const { agent } = await createDiretorAgent(app, { unidadeId: principal._id, forcedEmailPrefix: 'diretor-cluster-unidades-list' });

  const res = await listUnidades(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);

  const ids = unitIds(res.body);
  const allowedIds = [String(principal._id), String(relacionadaA._id), String(relacionadaB._id)];
  const observedAllowed = pickObserved(ids, allowedIds);

  assert.deepEqual(observedAllowed, allowedIds.slice().sort(), JSON.stringify(res.body));
  assert.equal(ids.includes(String(externa._id)), false, JSON.stringify(res.body));
  assert.equal(ids.every((id) => allowedIds.includes(id)), true, JSON.stringify(res.body));
});

test('GET /condominios/api/unidades para usuario comum nao enumera unidade externa fora do cluster', async () => {
  const { app } = await getRuntimeContext();
  const principal = await createPrincipalUnit(uniqueLabel('Principal Critica Unidades'), '507f1f77bcf86cd799439a40');
  const relacionada = await createRelatedUnit({
    nome: uniqueLabel('Relacionada Critica Unidades'),
    principalUnitId: principal._id,
    forcedId: '507f1f77bcf86cd799439a41',
  });
  const externa = await createPrincipalUnit(uniqueLabel('Externa Critica Unidades'), '507f1f77bcf86cd799439a42');
  const { agent } = await createDiretorAgent(app, { unidadeId: principal._id, forcedEmailPrefix: 'diretor-critica-unidades-list' });

  const res = await listUnidades(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);

  const ids = unitIds(res.body);
  const allowedIds = [String(principal._id), String(relacionada._id)];

  assert.equal(ids.includes(String(externa._id)), false, JSON.stringify(res.body));
  assert.equal(ids.every((id) => allowedIds.includes(id)), true, JSON.stringify(res.body));
});

test('GET /condominios/api/unidades para admin preserva leitura ampla observada', async () => {
  const { app } = await getRuntimeContext();
  const principal = await createPrincipalUnit(uniqueLabel('Principal Admin Unidades'), '507f1f77bcf86cd799439a50');
  const relacionada = await createRelatedUnit({
    nome: uniqueLabel('Relacionada Admin Unidades'),
    principalUnitId: principal._id,
    forcedId: '507f1f77bcf86cd799439a51',
  });
  const externa = await createPrincipalUnit(uniqueLabel('Externa Admin Unidades'), '507f1f77bcf86cd799439a52');
  const { agent } = await createAdminAgent(app);

  const res = await listUnidades(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);

  const ids = unitIds(res.body);
  assert.equal(ids.includes(String(principal._id)), true, JSON.stringify(res.body));
  assert.equal(ids.includes(String(relacionada._id)), true, JSON.stringify(res.body));
  assert.equal(ids.includes(String(externa._id)), true, JSON.stringify(res.body));
});

test('GET /condominios/api/unidades para usuario sem unidade resolvivel retorna array vazio apos login negado ao modulo', async () => {
  const { app } = await getRuntimeContext();
  const { agent, loginRes } = await createUnresolvedDiretorLoginAttempt(app);

  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/login?erro=modulo&motivo=diretor_sem_unidade');

  const res = await listUnidades(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, []);
});