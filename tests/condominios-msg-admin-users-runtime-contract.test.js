import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test from 'node:test';
import request from 'supertest';
import mongoose from 'mongoose';

import CondHabitacao from '../src/core/models/cond_habitacao.js';
import CondUsuario from '../src/core/models/cond_usuario.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { createServer } from '../src/server/createServer.js';

const PASSWORD = 'Senha@123456';

let sequence = 0;
let passwordHashPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'admin-users-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

async function getPasswordHash() {
  if (!passwordHashPromise) {
    passwordHashPromise = bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));
  }
  return passwordHashPromise;
}

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
  email = buildUniqueEmail('diretor'),
  nome = 'Diretor Teste',
  role = 'diretor',
  unidadeId = null,
  funcionarioId,
} = {}) {
  const payload = {
    email,
    senha: await getPasswordHash(),
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  };
  if (funcionarioId !== undefined) payload.funcionario_id = funcionarioId;
  return User.create(payload);
}

async function login(agent, { email, senha = PASSWORD }) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

async function createDiretorAgent(app, { unidadeId } = {}) {
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(`Unidade Runtime ${nextSequence()}`, unidadeId);
  const user = await createUser({
    email: buildUniqueEmail('diretor-msg-users'),
    nome: 'Diretor Msg Users',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-msg-admin-users-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user, unidade };
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

test('GET /condominios/api/msg/admin/users sem sessão preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/condominios/api/msg/admin/users?unidade_id=507f1f77bcf86cd799439010')
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 401);
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.equal(res.body?.error, 'Não autenticado');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('GET /condominios/api/msg/admin/users projeta portal e colaborador sem duplicar linha genérica do portal com habitação', async () => {
  const teardownGuard = installTeardownSuppression();
  const unidadeId = '507f1f77bcf86cd799439010';
  const habitacaoId = '507f1f77bcf86cd799439012';
  const portalEmail = 'portal-user@example.com';

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent } = await createDiretorAgent(app, { unidadeId });

      await createUser({
        email: 'colaborador@example.com',
        nome: 'Colaborador Um',
        role: 'user',
        unidadeId,
        funcionarioId: new mongoose.Types.ObjectId(),
      });

      await createUser({
        email: portalEmail,
        nome: 'Portal Gestor',
        role: 'user',
        unidadeId,
        funcionarioId: null,
      });

      await CondHabitacao.create({
        _id: habitacaoId,
        unidade_id: unidadeId,
        numero: '101',
        ativa: true,
      });

      await CondUsuario.create({
        email: portalEmail,
        nome: 'Portal Condominio',
        unidade_id: unidadeId,
        portal_acesso_ativo: true,
        favoritos: { habitacoes: [habitacaoId] },
      });

      const res = await agent
        .get(`/condominios/api/msg/admin/users?unidade_id=${unidadeId}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.ok, true, JSON.stringify(res.body));
      assert.equal(Array.isArray(res.body?.data), true, JSON.stringify(res.body));

      const portalRows = res.body.data.filter((item) => item.email === portalEmail);
      const colabRow = res.body.data.find((item) => item.email === 'colaborador@example.com');

      assert.equal(portalRows.length, 1, JSON.stringify(res.body));
      assert.deepEqual(portalRows[0], {
        email: portalEmail,
        nome: 'Portal Condominio',
        origem: 'portal',
        habitacao: '101',
        habitacao_id: habitacaoId,
      });
      assert.deepEqual(colabRow, {
        email: 'colaborador@example.com',
        nome: 'Colaborador Um',
        origem: 'colaborador',
        habitacao: '',
        habitacao_id: '',
      });
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('GET /condominios/api/msg/admin/users retorna 403 para diretor fora da unidade alvo', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439010' });

      const res = await agent
        .get('/condominios/api/msg/admin/users?unidade_id=507f1f77bcf86cd799439088')
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 403, JSON.stringify(res.body));
      assert.equal(res.body?.error, 'Acesso negado');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});