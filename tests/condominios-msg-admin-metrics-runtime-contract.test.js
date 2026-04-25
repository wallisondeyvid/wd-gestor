import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test from 'node:test';
import request from 'supertest';
import mongoose from 'mongoose';

import CondMsgMailbox from '../src/core/models/cond_msg_mailbox.js';
import CondMsgMessage from '../src/core/models/cond_msg_message.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { createServer } from '../src/server/createServer.js';

const PASSWORD = 'Senha@123456';
const UNIDADE_ID = '507f1f77bcf86cd799439010';
const OUTRA_UNIDADE_ID = '507f1f77bcf86cd799439088';
const MAILBOX_GRUPO_ID = '507f1f77bcf86cd799439011';
const RANGE_FROM = '2026-04-10T00:00:00.000Z';
const RANGE_TO = '2026-04-12T23:59:59.999Z';

let sequence = 0;
let passwordHashPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'admin-metrics-runtime') {
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
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(`Unidade Runtime ${nextSequence()}`, unidadeId);
  const user = await createUser({
    email: buildUniqueEmail('diretor-msg-metrics'),
    nome: 'Diretor Msg Metrics',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-msg-admin-metrics-runtime-contract-test',
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

function buildMetricsQuery(unidadeId) {
  return new URLSearchParams({ unidade_id: unidadeId, from: RANGE_FROM, to: RANGE_TO }).toString();
}

async function seedMetricsFixture() {
  await CondMsgMailbox.create({
    _id: MAILBOX_GRUPO_ID,
    name: 'Grupo Operacional',
    unidade_id: UNIDADE_ID,
    type: 'grupo',
    ativo: true,
    public: true,
    createdBy: 'metrics-runtime-test',
  });

  await CondMsgMessage.create([
    {
      protocolo: `MET-USR-${Date.now()}-1`,
      ano: 2026,
      from_mailbox_id: 'pessoal',
      from_mailbox_name: 'Pessoal',
      from_owner: 'portal@example.com',
      assunto: 'Mensagem 1',
      body_text: 'abc',
      body_html: '',
      anexos: [{ nome: 'anexo.txt', mime: 'text/plain', tamanho: 7, url: '', caminho: '' }],
      states: [{ mailbox_id: 'pessoal', owner: 'colab@example.com' }],
      unidade_id: UNIDADE_ID,
      createdBy: 'metrics-runtime-test',
      createdAt: new Date('2026-04-10T15:00:00.000Z'),
      updatedAt: new Date('2026-04-10T15:00:00.000Z'),
    },
    {
      protocolo: `MET-USR-${Date.now()}-2`,
      ano: 2026,
      from_mailbox_id: MAILBOX_GRUPO_ID,
      from_mailbox_name: 'Grupo Operacional',
      from_owner: 'colab@example.com',
      assunto: 'Mensagem 2',
      body_text: 'abcd',
      body_html: '',
      anexos: [],
      states: [{ mailbox_id: MAILBOX_GRUPO_ID, owner: 'portal@example.com' }],
      unidade_id: UNIDADE_ID,
      createdBy: 'metrics-runtime-test',
      createdAt: new Date('2026-04-11T15:00:00.000Z'),
      updatedAt: new Date('2026-04-11T15:00:00.000Z'),
    },
    {
      protocolo: `MET-USR-${Date.now()}-3`,
      ano: 2026,
      from_mailbox_id: 'pessoal',
      from_mailbox_name: 'Pessoal',
      from_owner: 'fora@example.com',
      assunto: 'Mensagem outra unidade',
      body_text: 'xxxx',
      body_html: '',
      anexos: [],
      states: [{ mailbox_id: 'pessoal', owner: 'fora@example.com' }],
      unidade_id: OUTRA_UNIDADE_ID,
      createdBy: 'metrics-runtime-test',
      createdAt: new Date('2026-04-10T15:00:00.000Z'),
      updatedAt: new Date('2026-04-10T15:00:00.000Z'),
    }
  ]);
}

test('GETs administrativos de metrics sem sessão preservam 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const endpoints = [
      '/condominios/api/msg/admin/metrics/users',
      '/condominios/api/msg/admin/metrics/timeseries/users',
      '/condominios/api/msg/admin/metrics/mailboxes',
      '/condominios/api/msg/admin/metrics/timeseries/mailboxes',
    ];

    for (const endpoint of endpoints) {
      const res = await request(app)
        .get(`${endpoint}?unidade_id=${UNIDADE_ID}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 401, `${endpoint} => ${JSON.stringify(res.body)}`);
      assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
      assert.equal(res.body?.error, 'Não autenticado');
    }
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('GETs administrativos de metrics agregam painel por usuário, caixa e séries no período da unidade', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent } = await createDiretorAgent(app, { unidadeId: UNIDADE_ID });
      await seedMetricsFixture();

      const [usersRes, usersSeriesRes, mailboxesRes, mailboxesSeriesRes] = await Promise.all([
        agent.get(`/condominios/api/msg/admin/metrics/users?${buildMetricsQuery(UNIDADE_ID)}`).set('Accept', 'application/json').set('Connection', 'close'),
        agent.get(`/condominios/api/msg/admin/metrics/timeseries/users?${buildMetricsQuery(UNIDADE_ID)}`).set('Accept', 'application/json').set('Connection', 'close'),
        agent.get(`/condominios/api/msg/admin/metrics/mailboxes?${buildMetricsQuery(UNIDADE_ID)}`).set('Accept', 'application/json').set('Connection', 'close'),
        agent.get(`/condominios/api/msg/admin/metrics/timeseries/mailboxes?${buildMetricsQuery(UNIDADE_ID)}`).set('Accept', 'application/json').set('Connection', 'close'),
      ]);

      assert.equal(usersRes.status, 200, JSON.stringify(usersRes.body));
      assert.equal(usersRes.body?.ok, true, JSON.stringify(usersRes.body));
      assert.equal(usersRes.body?.unidade_id, UNIDADE_ID);
      assert.equal(usersRes.body?.totals?.sentCount, 2);
      assert.equal(usersRes.body?.totals?.receivedCount, 1);
      assert.equal(usersRes.body?.totals?.sentBytes, 14);
      assert.equal(usersRes.body?.totals?.receivedBytes, 10);
      assert.equal(usersRes.body?.totals?.sentBytesHuman, '14 B');
      assert.equal(usersRes.body?.totals?.receivedBytesHuman, '10 B');

      const usersByEmail = new Map((usersRes.body?.data || []).map((row) => [row.email, row]));
      assert.deepEqual(usersByEmail.get('portal@example.com'), {
        email: 'portal@example.com',
        sentCount: 1,
        sentBytes: 10,
        receivedCount: 0,
        receivedBytes: 0,
        sentBytesHuman: '10 B',
        receivedBytesHuman: '0 B',
      });
      assert.deepEqual(usersByEmail.get('colab@example.com'), {
        email: 'colab@example.com',
        sentCount: 1,
        sentBytes: 4,
        receivedCount: 1,
        receivedBytes: 10,
        sentBytesHuman: '4 B',
        receivedBytesHuman: '10 B',
      });

      assert.equal(usersSeriesRes.status, 200, JSON.stringify(usersSeriesRes.body));
      assert.equal(usersSeriesRes.body?.ok, true, JSON.stringify(usersSeriesRes.body));
      assert.equal(usersSeriesRes.body?.interval, 'day');
      assert.deepEqual(usersSeriesRes.body?.points, [
        { date: '2026-04-10', sentCount: 1, sentBytes: 10, receivedCount: 1, receivedBytes: 10 },
        { date: '2026-04-11', sentCount: 1, sentBytes: 4, receivedCount: 0, receivedBytes: 0 },
      ]);

      assert.equal(mailboxesRes.status, 200, JSON.stringify(mailboxesRes.body));
      assert.equal(mailboxesRes.body?.ok, true, JSON.stringify(mailboxesRes.body));
      assert.equal(mailboxesRes.body?.unidade_id, UNIDADE_ID);
      assert.equal(mailboxesRes.body?.totals?.sentCount, 2);
      assert.equal(mailboxesRes.body?.totals?.receivedCount, 2);
      assert.equal(mailboxesRes.body?.totals?.sentBytes, 14);
      assert.equal(mailboxesRes.body?.totals?.receivedBytes, 14);

      const mailboxesById = new Map((mailboxesRes.body?.data || []).map((row) => [row.mailboxId, row]));
      assert.deepEqual(mailboxesById.get('pessoal'), {
        mailboxId: 'pessoal',
        sentCount: 1,
        sentBytes: 10,
        receivedCount: 1,
        receivedBytes: 10,
        mailboxName: 'Pessoal',
        mailboxType: 'pessoal',
        ativo: true,
        link_type: '',
        link_id: '',
        public: false,
        sentBytesHuman: '10 B',
        receivedBytesHuman: '10 B',
      });
      assert.deepEqual(mailboxesById.get(MAILBOX_GRUPO_ID), {
        mailboxId: MAILBOX_GRUPO_ID,
        sentCount: 1,
        sentBytes: 4,
        receivedCount: 1,
        receivedBytes: 4,
        mailboxName: 'Grupo Operacional',
        mailboxType: 'grupo',
        ativo: true,
        link_type: '',
        link_id: '',
        public: true,
        sentBytesHuman: '4 B',
        receivedBytesHuman: '4 B',
      });

      assert.equal(mailboxesSeriesRes.status, 200, JSON.stringify(mailboxesSeriesRes.body));
      assert.equal(mailboxesSeriesRes.body?.ok, true, JSON.stringify(mailboxesSeriesRes.body));
      assert.equal(mailboxesSeriesRes.body?.interval, 'day');
      assert.deepEqual(mailboxesSeriesRes.body?.points, [
        { date: '2026-04-10', sentCount: 1, sentBytes: 10, receivedCount: 1, receivedBytes: 10 },
        { date: '2026-04-11', sentCount: 1, sentBytes: 4, receivedCount: 1, receivedBytes: 4 },
      ]);
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('GETs administrativos de metrics retornam 403 para diretor fora da unidade alvo', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent } = await createDiretorAgent(app, { unidadeId: UNIDADE_ID });
      const endpoints = [
        '/condominios/api/msg/admin/metrics/users',
        '/condominios/api/msg/admin/metrics/timeseries/users',
        '/condominios/api/msg/admin/metrics/mailboxes',
        '/condominios/api/msg/admin/metrics/timeseries/mailboxes',
      ];

      for (const endpoint of endpoints) {
        const res = await agent
          .get(`${endpoint}?${buildMetricsQuery(OUTRA_UNIDADE_ID)}`)
          .set('Accept', 'application/json')
          .set('Connection', 'close');

        assert.equal(res.status, 403, `${endpoint} => ${JSON.stringify(res.body)}`);
        assert.equal(res.body?.error, 'Acesso negado');
      }
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});