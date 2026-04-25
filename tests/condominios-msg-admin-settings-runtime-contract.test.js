import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test from 'node:test';
import request from 'supertest';

import CondMsgSettings from '../src/core/models/cond_msg_settings.js';
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

function buildUniqueEmail(prefix = 'admin-settings-runtime') {
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

async function createEnabledUnit(nome) {
  const modulo = await ensureGestorModulo();
  return Unidade.create({
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
  globalRole = null,
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

  if (globalRole) payload.global_role = globalRole;
  return User.create(payload);
}

async function login(agent, { email, senha = PASSWORD }) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

async function createDiretorAgent(app, { unidadeId } = {}) {
  const unidade = unidadeId
    ? await Unidade.findById(unidadeId) || await Unidade.create({
      _id: unidadeId,
      nome: `Unidade Runtime ${nextSequence()}`,
      pessoaTipo: 'pj',
      is_principal: true,
      modulosAcessiveis: [(await ensureGestorModulo())._id],
    })
    : await createEnabledUnit(`Unidade Runtime ${nextSequence()}`);
  const user = await createUser({
    email: buildUniqueEmail('diretor-msg-settings'),
    nome: 'Diretor Msg Settings',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-msg-admin-settings-runtime-contract-test',
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

test('GET /condominios/api/msg/admin/settings sem sessão preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/condominios/api/msg/admin/settings?unidade_id=507f1f77bcf86cd799439010')
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

test('GET /condominios/api/msg/admin/settings bootstrapa defaults para diretor da própria unidade', async () => {
  const teardownGuard = installTeardownSuppression();
  const unidadeId = '507f1f77bcf86cd799439010';

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent } = await createDiretorAgent(app, { unidadeId });

      const res = await agent
        .get(`/condominios/api/msg/admin/settings?unidade_id=${unidadeId}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.ok, true, JSON.stringify(res.body));
      assert.equal(String(res.body?.settings?.unidade_id || ''), unidadeId);
      assert.equal(res.body?.settings?.suspender_caixas_pessoais, false);
      assert.equal(res.body?.settings?.suspender_caixas_grupo, false);
      assert.equal(res.body?.settings?.permitir_pessoal_para_pessoal, true);
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('PUT /condominios/api/msg/admin/settings retorna 403 para diretor fora da unidade alvo', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439010' });

      const res = await agent
        .put('/condominios/api/msg/admin/settings')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ unidade_id: '507f1f77bcf86cd799439088' });

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

test('PUT /condominios/api/msg/admin/settings persiste payload saneado e updatedBy para diretor da própria unidade', async () => {
  const teardownGuard = installTeardownSuppression();
  const unidadeId = '507f1f77bcf86cd799439010';

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent } = await createDiretorAgent(app, { unidadeId });

      const res = await agent
        .put('/condominios/api/msg/admin/settings')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({
          unidade_id: unidadeId,
          suspender_caixas_pessoais: true,
          suspender_caixas_grupo: false,
          permitir_pessoal_para_pessoal: false,
          pessoais_suspensas_portal: ['PORTAL@example.com', 'invalido'],
          pessoais_suspensas_colaborador: ['colab@example.com', 'colab@example.com'],
          portal_user_perms: [
            { email: 'morador@example.com', permitir_pessoal_para_pessoal: false },
            { email: 'morador@example.com', permitir_pessoal_para_colaborador: false },
            { email: 'email-invalido' },
          ],
        });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.ok, true, JSON.stringify(res.body));
      assert.equal(res.body?.settings?.suspender_caixas_pessoais, true);
      assert.equal(res.body?.settings?.permitir_pessoal_para_pessoal, false);
      assert.deepEqual(res.body?.settings?.pessoais_suspensas_portal, ['portal@example.com']);
      assert.deepEqual(res.body?.settings?.pessoais_suspensas_colaborador, ['colab@example.com']);
      assert.deepEqual(res.body?.settings?.portal_user_perms, [{
        email: 'morador@example.com',
        permitir_pessoal_para_pessoal: false,
        permitir_pessoal_para_habitacao: true,
        permitir_pessoal_para_colaborador: true,
      }]);

      const saved = await CondMsgSettings.findOne({ unidade_id: unidadeId }).lean();
      assert.match(String(saved?.updatedBy || ''), /diretor-msg-settings\..+@example\.com/);
      assert.deepEqual(saved?.pessoais_suspensas_portal || [], ['portal@example.com']);
      assert.deepEqual(saved?.pessoais_suspensas_colaborador || [], ['colab@example.com']);
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});