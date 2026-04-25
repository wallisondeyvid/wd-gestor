import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test from 'node:test';
import request from 'supertest';

import CondMsgMailbox from '../src/core/models/cond_msg_mailbox.js';
import CondMsgMessage from '../src/core/models/cond_msg_message.js';
import CondMsgSettings from '../src/core/models/cond_msg_settings.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { createServer } from '../src/server/createServer.js';

const PASSWORD = 'Senha@123456';
const UNIDADE_ID = '507f1f77bcf86cd799439010';
const TARGET_MAILBOX_ID = '507f1f77bcf86cd799439050';
const OTHER_MAILBOX_ID = '507f1f77bcf86cd799439051';

let sequence = 0;
let passwordHashPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'msg-send-reply-nonportal') {
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

async function createDiretorAgent(app, { unidadeId } = {}) {
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(`Unidade Runtime ${nextSequence()}`, unidadeId);
  const user = await createUser({
    email: buildUniqueEmail('reply-nonportal-dir'),
    nome: 'Diretor Reply NonPortal',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'msg-send-reply-nonportal-dir',
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

function mailboxDoc({ _id, name } = {}) {
  return {
    _id,
    name,
    type: 'grupo',
    unidade_id: UNIDADE_ID,
    unidade_nome: 'Condominio Teste',
    public: true,
    operators: [],
    createdBy: 'runtime-test',
    ativo: true,
  };
}

function buildReplyBaseDoc({ protocolo, mailboxId = TARGET_MAILBOX_ID, mailboxName = 'Caixa Original' } = {}) {
  return {
    protocolo,
    ano: 2026,
    from_mailbox_id: mailboxId,
    from_mailbox_name: mailboxName,
    from_owner: '',
    to: [{ type: 'user', email: 'reply-target@example.com', nome: 'Reply Target' }],
    cc: [],
    assunto: 'Mensagem base reply',
    body_html: '<p>mensagem base reply</p>',
    body_text: 'mensagem base reply',
    assinatura_ativa: false,
    assinatura_texto: '',
    anexos: [],
    thread_root_id: null,
    in_reply_to: null,
    forwarded_from_id: null,
    acessos: [],
    states: [{ mailbox_id: mailboxId, owner: '' }],
    unidade_id: UNIDADE_ID,
    createdBy: 'runtime-test',
    ativo: true,
  };
}

function buildPayload(overrides = {}) {
  return {
    fromMailboxId: 'pessoal',
    fromMailboxName: 'Pessoal',
    to: [{ type: 'mailbox', mailboxId: TARGET_MAILBOX_ID, nome: 'Caixa Original' }],
    cc: [],
    assunto: 'Teste reply minimo',
    bodyHtml: '<p>teste reply minimo</p>',
    bodyText: 'teste reply minimo',
    assinaturaAtiva: false,
    assinaturaTexto: '',
    clientNonce: `nonce-${Date.now()}-${nextSequence()}`,
    ...overrides,
  };
}

test('POST /condominios/api/msg/messages no ramo nao-Portal restrito rejeita inReplyToId invalido', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent, user } = await createDiretorAgent(app, { unidadeId: UNIDADE_ID });

      await CondMsgSettings.create({
        unidade_id: UNIDADE_ID,
        portal_user_perms: [{
          email: user.email,
          permitir_pessoal_para_pessoal: false,
          permitir_pessoal_para_habitacao: true,
          permitir_pessoal_para_colaborador: true,
        }],
      });

      const res = await agent
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send(buildPayload({
          inReplyToId: '507f1f77bcf86cd799439099',
        }));

      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body?.error, 'Mensagem de referência inválida para resposta.');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /condominios/api/msg/messages no ramo nao-Portal restrito rejeita reply para mailbox alvo diferente do remetente original', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent, user } = await createDiretorAgent(app, { unidadeId: UNIDADE_ID });

      await CondMsgMailbox.create([
        mailboxDoc({ _id: TARGET_MAILBOX_ID, name: 'Caixa Original' }),
        mailboxDoc({ _id: OTHER_MAILBOX_ID, name: 'Caixa Divergente' }),
      ]);

      const base = await CondMsgMessage.create(buildReplyBaseDoc({
        protocolo: `REPLY-NONPORTAL-BASE-${Date.now()}`,
      }));

      await CondMsgSettings.create({
        unidade_id: UNIDADE_ID,
        portal_user_perms: [{
          email: user.email,
          permitir_pessoal_para_pessoal: false,
          permitir_pessoal_para_habitacao: true,
          permitir_pessoal_para_colaborador: true,
        }],
      });

      const res = await agent
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send(buildPayload({
          inReplyToId: String(base._id),
          to: [{ type: 'mailbox', mailboxId: OTHER_MAILBOX_ID, nome: 'Caixa Divergente' }],
        }));

      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body?.error, 'Sua permissão permite responder apenas ao remetente original.');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /condominios/api/msg/messages no ramo nao-Portal restrito permite reply minimo para o mailbox remetente original', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent, user } = await createDiretorAgent(app, { unidadeId: UNIDADE_ID });

      await CondMsgMailbox.create(mailboxDoc({ _id: TARGET_MAILBOX_ID, name: 'Caixa Original' }));

      const base = await CondMsgMessage.create(buildReplyBaseDoc({
        protocolo: `REPLY-NONPORTAL-ALLOW-${Date.now()}`,
      }));

      await CondMsgSettings.create({
        unidade_id: UNIDADE_ID,
        portal_user_perms: [{
          email: user.email,
          permitir_pessoal_para_pessoal: false,
          permitir_pessoal_para_habitacao: true,
          permitir_pessoal_para_colaborador: true,
        }],
      });

      const res = await agent
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send(buildPayload({
          inReplyToId: String(base._id),
        }));

      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body?.ok, true, JSON.stringify(res.body));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});