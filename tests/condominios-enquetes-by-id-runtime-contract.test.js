import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test, { after } from 'node:test';
import request from 'supertest';

import CondEnquete from '../src/core/models/cond_enquete.js';
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

function buildUniqueEmail(prefix = 'enquetes-by-id-runtime') {
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
    ativa: true,
    modulosAcessiveis: [modulo._id],
  });
}

async function createUser({
  email = buildUniqueEmail('enquetes-by-id-runtime-user'),
  nome = 'Usuario Teste',
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

async function createAgentForRole(app, { unidadeId = null, role = 'diretor', origem = 'condominios-enquetes-by-id-runtime-contract-test' } = {}) {
  const unidade = unidadeId
    ? (await Unidade.findById(unidadeId)) || await createEnabledUnit(uniqueLabel('Unidade Runtime'), unidadeId)
    : null;

  const user = await createUser({
    email: buildUniqueEmail(`enquetes-by-id-runtime-${role}`),
    nome: `Usuario ${role} Enquetes By Id`,
    role,
    unidadeId: unidade?._id || null,
  });

  if (unidade) {
    await UserMembership.create({
      user_id: user._id,
      unidade_id: unidade._id,
      papel_contextual: 'gestor',
      status: 'active',
      origem,
    });
  }

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, unidade, user };
}

async function createDiretorAgent(app, { unidadeId } = {}) {
  return createAgentForRole(app, {
    unidadeId,
    role: 'diretor',
    origem: 'condominios-enquetes-by-id-runtime-dir',
  });
}

async function createAdminAgent(app, { unidadeId } = {}) {
  return createAgentForRole(app, {
    unidadeId,
    role: 'admin',
    origem: 'condominios-enquetes-by-id-runtime-admin',
  });
}

async function createEnquete({ unidadeId, pergunta = uniqueLabel('Pergunta Runtime') } = {}) {
  return CondEnquete.create({
    unidade_id: unidadeId,
    vigencia_inicio: new Date('2024-01-01T00:00:00.000Z'),
    vigencia_fim: new Date('2099-12-31T23:59:59.999Z'),
    pergunta,
    opcoes: [
      { texto: 'Opcao A' },
      { texto: 'Opcao B' },
    ],
    criadaPor: { nome: 'Runtime Test' },
  });
}

function getEnqueteById(agent, id, query = '') {
  return agent
    .get(`/condominios/api/enquetes/${id}${query}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

test('GET /condominios/api/enquetes/:id sem sessão retorna 401 Não autenticado', async () => {
  const { app } = await getRuntimeContext();
  const unidade = await createEnabledUnit(uniqueLabel('Unidade Sem Sessao'), '507f1f77bcf86cd799439701');
  const enquete = await createEnquete({ unidadeId: unidade._id });

  const res = await request(app)
    .get(`/condominios/api/enquetes/${String(enquete._id)}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 401, JSON.stringify(res.body));
  assert.deepEqual(res.body, { error: 'Não autenticado', success: false });
});

test('GET /condominios/api/enquetes/:id da mesma unidade retorna 200 com ok true, data e statusCalc', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439702' });
  const enquete = await createEnquete({ unidadeId: unidade._id, pergunta: 'Pergunta Mesma Unidade' });

  const res = await getEnqueteById(agent, String(enquete._id));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.ok, true, JSON.stringify(res.body));
  assert.equal(String(res.body?.data?._id), String(enquete._id), JSON.stringify(res.body));
  assert.equal(String(res.body?.data?.unidade_id), String(unidade._id), JSON.stringify(res.body));
  assert.equal(res.body?.data?.pergunta, 'Pergunta Mesma Unidade', JSON.stringify(res.body));
  assert.equal(typeof res.body?.data?.statusCalc, 'string', JSON.stringify(res.body));
});

test('GET /condominios/api/enquetes/:id de outra unidade retorna 404 Enquete não encontrada', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439703' });
  const outraUnidade = await createEnabledUnit(uniqueLabel('Outra Unidade Runtime'), '507f1f77bcf86cd799439704');
  const enquete = await createEnquete({ unidadeId: outraUnidade._id });

  const res = await getEnqueteById(agent, String(enquete._id));

  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.deepEqual(res.body, { error: 'Enquete não encontrada', success: false });
});

test('GET /condominios/api/enquetes/:id de admin sem unidade efetiva e sem unidade_id retorna 400 Unidade inválida', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createAdminAgent(app);
  const unidade = await createEnabledUnit(uniqueLabel('Unidade Admin Sem Contexto'), '507f1f77bcf86cd799439705');
  const enquete = await createEnquete({ unidadeId: unidade._id });

  const res = await getEnqueteById(agent, String(enquete._id));

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.body, { error: 'Unidade inválida', success: false });
});

test('GET /condominios/api/enquetes/:id de admin com unidade_id explícita retorna 200 quando a enquete existe na unidade consultada', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createAdminAgent(app);
  const unidade = await createEnabledUnit(uniqueLabel('Unidade Admin Query'), '507f1f77bcf86cd799439706');
  const enquete = await createEnquete({ unidadeId: unidade._id, pergunta: 'Pergunta Admin Query' });

  const res = await getEnqueteById(agent, String(enquete._id), `?unidade_id=${unidade._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.ok, true, JSON.stringify(res.body));
  assert.equal(String(res.body?.data?._id), String(enquete._id), JSON.stringify(res.body));
  assert.equal(String(res.body?.data?.unidade_id), String(unidade._id), JSON.stringify(res.body));
  assert.equal(res.body?.data?.pergunta, 'Pergunta Admin Query', JSON.stringify(res.body));
});

test('GET /condominios/api/enquetes/:id com id válido inexistente retorna 404 Enquete não encontrada', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439707' });

  const res = await getEnqueteById(agent, '64f111111111111111111111', `?unidade_id=${unidade._id}`);

  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.deepEqual(res.body, { error: 'Enquete não encontrada', success: false });
});

test('GET /condominios/api/enquetes/:id com id inválido não casa na rota e retorna 404', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439708' });

  const res = await getEnqueteById(agent, 'id-invalido');

  assert.equal(res.status, 404, `${res.status} ${String(res.text || '')}`);
});