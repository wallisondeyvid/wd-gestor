import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test from 'node:test';
import request from 'supertest';

import CondMsgGroup from '../src/core/models/cond_msg_group.js';
import CondMsgMailbox from '../src/core/models/cond_msg_mailbox.js';
import CondMsgMarker from '../src/core/models/cond_msg_marker.js';
import CondMsgMessage from '../src/core/models/cond_msg_message.js';
import CondMsgSignaturePref from '../src/core/models/cond_msg_signature_pref.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { createServer } from '../src/server/createServer.js';

const PASSWORD = 'Senha@123456';
const UNIDADE_ID = '507f1f77bcf86cd799439010';
const OUTRA_UNIDADE_ID = '507f1f77bcf86cd799439099';

let sequence = 0;
let passwordHashPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'admin-mailboxes-write-runtime') {
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

async function createAgentForRole(app, { unidadeId, role, origem }) {
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(`Unidade Runtime ${nextSequence()}`, unidadeId);
  const user = await createUser({
    email: buildUniqueEmail(`msg-mailboxes-${role}`),
    nome: `Usuario ${role}`,
    role,
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem,
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user, unidade };
}

async function createDiretorAgent(app, { unidadeId } = {}) {
  return createAgentForRole(app, {
    unidadeId,
    role: 'diretor',
    origem: 'msg-admin-mbxw-dir',
  });
}

async function createAdminAgent(app, { unidadeId } = {}) {
  return createAgentForRole(app, {
    unidadeId,
    role: 'admin',
    origem: 'msg-admin-mbxw-adm',
  });
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

test('PATCH status e DELETE admin mailboxes sem sessão preservam 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const endpoints = [
      { method: 'patch', url: '/condominios/api/msg/admin/mailboxes/507f1f77bcf86cd799439010/status', body: { ativo: false } },
      { method: 'delete', url: '/condominios/api/msg/admin/mailboxes/507f1f77bcf86cd799439010' },
    ];

    for (const endpoint of endpoints) {
      const req = request(app)[endpoint.method](endpoint.url)
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      const res = endpoint.body ? await req.send(endpoint.body) : await req;

      assert.equal(res.status, 401, `${endpoint.method} ${endpoint.url} => ${JSON.stringify(res.body)}`);
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

test('PATCH /condominios/api/msg/admin/mailboxes/:id/status alterna status na própria unidade e bloqueia unidade externa para diretor', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent } = await createDiretorAgent(app, { unidadeId: UNIDADE_ID });
      const localMailbox = await CondMsgMailbox.create({
        name: 'Grupo Local',
        unidade_id: UNIDADE_ID,
        type: 'grupo',
        ativo: true,
        public: true,
        createdBy: 'write-runtime-test',
      });
      const remoteMailbox = await CondMsgMailbox.create({
        name: 'Grupo Remoto',
        unidade_id: OUTRA_UNIDADE_ID,
        type: 'grupo',
        ativo: true,
        public: true,
        createdBy: 'write-runtime-test',
      });

      const okRes = await agent
        .patch(`/condominios/api/msg/admin/mailboxes/${localMailbox._id}/status`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ ativo: false });

      assert.equal(okRes.status, 200, JSON.stringify(okRes.body));
      assert.deepEqual(okRes.body, { ok: true, id: String(localMailbox._id), ativo: false });
      assert.equal((await CondMsgMailbox.findById(localMailbox._id).lean())?.ativo, false);

      const forbiddenRes = await agent
        .patch(`/condominios/api/msg/admin/mailboxes/${remoteMailbox._id}/status`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ ativo: false });

      assert.equal(forbiddenRes.status, 403, JSON.stringify(forbiddenRes.body));
      assert.equal(forbiddenRes.body?.error, 'Acesso negado');
      assert.equal((await CondMsgMailbox.findById(remoteMailbox._id).lean())?.ativo, true);
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('DELETE /condominios/api/msg/admin/mailboxes/:id exige escopo global e executa cleanup administrativo de mailbox manual', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent: diretorAgent } = await createDiretorAgent(app, { unidadeId: UNIDADE_ID });
      const mailbox = await CondMsgMailbox.create({
        _id: '507f1f77bcf86cd799439015',
        name: 'Grupo Manual',
        unidade_id: UNIDADE_ID,
        type: 'grupo',
        ativo: true,
        public: true,
        createdBy: 'write-runtime-test',
      });

      const forbiddenRes = await diretorAgent
        .delete(`/condominios/api/msg/admin/mailboxes/${mailbox._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(forbiddenRes.status, 403, JSON.stringify(forbiddenRes.body));
      assert.equal(forbiddenRes.body?.error, 'Acesso negado');

      const { agent: adminAgent } = await createAdminAgent(app, { unidadeId: UNIDADE_ID });

      await CondMsgGroup.create({
        mailbox_id: String(mailbox._id),
        owner: '',
        name: 'Grupo Vinculado',
        members: [],
        unidade_id: UNIDADE_ID,
        createdBy: 'write-runtime-test',
      });
      await CondMsgMarker.create({
        mailbox_id: String(mailbox._id),
        owner: '',
        nome: 'Marcador Vinculado',
        cor: '#000000',
        unidade_id: UNIDADE_ID,
        createdBy: 'write-runtime-test',
      });
      await CondMsgSignaturePref.create({
        owner: 'admin@example.com',
        mailbox_id: String(mailbox._id),
        enabled: true,
        text: 'Assinatura',
      });
      await CondMsgMessage.create([
        {
          protocolo: `ADM-DEL-${Date.now()}-1`,
          ano: 2026,
          from_mailbox_id: String(mailbox._id),
          from_mailbox_name: 'Grupo Manual',
          from_owner: 'admin@example.com',
          assunto: 'Somente essa caixa',
          body_text: 'abc',
          body_html: '',
          anexos: [],
          states: [{ mailbox_id: String(mailbox._id), owner: 'admin@example.com' }],
          unidade_id: UNIDADE_ID,
          createdBy: 'write-runtime-test',
        },
        {
          protocolo: `ADM-DEL-${Date.now()}-2`,
          ano: 2026,
          from_mailbox_id: 'pessoal',
          from_mailbox_name: 'Pessoal',
          from_owner: 'admin@example.com',
          assunto: 'Caixa compartilhada com pessoal',
          body_text: 'abcd',
          body_html: '',
          anexos: [],
          states: [
            { mailbox_id: String(mailbox._id), owner: 'admin@example.com' },
            { mailbox_id: 'pessoal', owner: 'admin@example.com' },
          ],
          unidade_id: UNIDADE_ID,
          createdBy: 'write-runtime-test',
        }
      ]);

      const deleteRes = await adminAgent
        .delete(`/condominios/api/msg/admin/mailboxes/${mailbox._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(deleteRes.status, 200, JSON.stringify(deleteRes.body));
      assert.deepEqual(deleteRes.body, {
        ok: true,
        id: String(mailbox._id),
        deleted: {
          mailbox: 1,
          groups: 1,
          markers: 1,
          signatures: 1,
          messages: 1,
          messageStatesTouched: 2,
        }
      });

      assert.equal(await CondMsgMailbox.countDocuments({ _id: mailbox._id }), 0);
      assert.equal(await CondMsgGroup.countDocuments({ mailbox_id: String(mailbox._id) }), 0);
      assert.equal(await CondMsgMarker.countDocuments({ mailbox_id: String(mailbox._id) }), 0);
      assert.equal(await CondMsgSignaturePref.countDocuments({ mailbox_id: String(mailbox._id) }), 0);

      const remainingMessages = await CondMsgMessage.find({ createdBy: 'write-runtime-test' }).lean();
      assert.equal(remainingMessages.length, 1);
      assert.deepEqual((remainingMessages[0]?.states || []).map((state) => ({ mailbox_id: state.mailbox_id, owner: state.owner })), [
        { mailbox_id: 'pessoal', owner: 'admin@example.com' },
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