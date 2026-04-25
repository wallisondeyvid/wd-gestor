import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

import CondMsgMailbox from '../src/core/models/cond_msg_mailbox.js';
import CondMsgMessage from '../src/core/models/cond_msg_message.js';
import CondUsuario from '../src/core/models/cond_usuario.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { createServer } from '../src/server/createServer.js';

const PASSWORD = 'Senha@123456';
const UNIDADE_ID = '507f1f77bcf86cd799439010';

let sequence = 0;
let passwordHashPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'msg-send-start') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

function signPortalCookie(payload, secret) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function buildPortalCookieHeader({
  secret = 'portal-send-start-runtime-test-secret',
  userId = '507f1f77bcf86cd799439011',
  session = {},
} = {}) {
  const payload = {
    userId,
    exp: Date.now() + (60 * 60 * 1000),
    v: 1,
    session: {
      cond_usuario_id: userId,
      id: userId,
      nome: 'Morador Portal',
      email: 'portal@example.com',
      unidade_id: UNIDADE_ID,
      habitacao_id: '507f1f77bcf86cd799439012',
      portal_acesso_ativo: true,
      ...session,
    },
  };
  return `wdg_portal=${signPortalCookie(payload, secret)}`;
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
    email: buildUniqueEmail('diretor-msg-send'),
    nome: 'Diretor Msg Send',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'msg-send-start-runtime-dir',
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

function mailboxDoc({
  _id,
  name,
  operators = [],
  unidadeId = UNIDADE_ID,
} = {}) {
  return {
    _id,
    name,
    type: 'grupo',
    unidade_id: unidadeId,
    unidade_nome: 'Condominio Teste',
    public: true,
    operators,
    createdBy: 'runtime-test',
    ativo: true,
  };
}

function buildPayload(overrides = {}) {
  return {
    fromMailboxId: 'pessoal',
    fromMailboxName: 'Pessoal',
    to: [{ type: 'user', email: 'portal@example.com', nome: 'Morador Portal' }],
    cc: [],
    assunto: 'Teste envio inicial',
    bodyHtml: '<p>teste envio inicial</p>',
    bodyText: 'teste envio inicial',
    assinaturaAtiva: false,
    assinaturaTexto: '',
    clientNonce: `nonce-${Date.now()}-${nextSequence()}`,
    ...overrides,
  };
}

test('POST /condominios/api/msg/messages sem sessão preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .post('/condominios/api/msg/messages')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(buildPayload());

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

test('POST /condominios/api/msg/messages no Portal pessoal resolve email por backfill e envia pela caixa pessoal', async () => {
  const teardownGuard = installTeardownSuppression();
  const portalUserId = '507f1f77bcf86cd799439011';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-send-start-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
        unidade_id: UNIDADE_ID,
      });

      const res = await request(app)
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined, unidade_id: UNIDADE_ID },
        }))
        .send(buildPayload());

      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body?.ok, true, JSON.stringify(res.body));

      const saved = await CondMsgMessage.findOne({ protocolo: String(res.body?.protocolo || '').trim() }).lean();
      assert.equal(String(saved?.from_mailbox_id || ''), 'pessoal', JSON.stringify(saved));
      assert.equal(String(saved?.from_owner || ''), 'portal@example.com', JSON.stringify(saved));
      assert.equal(String(saved?.unidade_id || ''), UNIDADE_ID, JSON.stringify(saved));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /condominios/api/msg/messages no Portal pessoal mantém state inicial não lido no autoenvio', async () => {
  const teardownGuard = installTeardownSuppression();
  const portalUserId = '507f1f77bcf86cd799439011';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-send-start-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
        unidade_id: UNIDADE_ID,
      });

      const res = await request(app)
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined, unidade_id: UNIDADE_ID },
        }))
        .send(buildPayload());

      assert.equal(res.status, 201, JSON.stringify(res.body));

      const saved = await CondMsgMessage.findOne({ protocolo: String(res.body?.protocolo || '').trim() }).lean();
      const senderState = Array.isArray(saved?.states)
        ? saved.states.find((state) => String(state?.mailbox_id || '') === 'pessoal' && String(state?.owner || '') === 'portal@example.com')
        : null;

      assert.ok(senderState, JSON.stringify(saved));
      assert.equal(senderState?.lida_em, null, JSON.stringify(senderState));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /condominios/api/msg/messages aplica autorização básica da mailbox origem compartilhada', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent, user } = await createDiretorAgent(app, { unidadeId: UNIDADE_ID });
      const allowedMailbox = await CondMsgMailbox.create(mailboxDoc({
        _id: '507f1f77bcf86cd799439050',
        name: 'Caixa Com Envio',
        operators: [{ user: user.email, perms: { criarMensagem: true } }],
      }));
      const forbiddenMailbox = await CondMsgMailbox.create(mailboxDoc({
        _id: '507f1f77bcf86cd799439051',
        name: 'Caixa Sem Envio',
        operators: [{ user: user.email, perms: { lerMensagem: true } }],
      }));

      const okRes = await agent
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send(buildPayload({
          fromMailboxId: String(allowedMailbox._id),
          fromMailboxName: allowedMailbox.name,
          to: [{ type: 'mailbox', mailboxId: String(allowedMailbox._id), nome: allowedMailbox.name }],
        }));

      assert.equal(okRes.status, 201, JSON.stringify(okRes.body));
      const okSaved = await CondMsgMessage.findOne({ protocolo: String(okRes.body?.protocolo || '').trim() }).lean();
      assert.equal(String(okSaved?.from_mailbox_id || ''), String(allowedMailbox._id), JSON.stringify(okSaved));
      assert.equal(String(okSaved?.from_mailbox_name || ''), 'Caixa Com Envio', JSON.stringify(okSaved));

      const forbiddenRes = await agent
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send(buildPayload({
          fromMailboxId: String(forbiddenMailbox._id),
          fromMailboxName: forbiddenMailbox.name,
          to: [{ type: 'mailbox', mailboxId: String(forbiddenMailbox._id), nome: forbiddenMailbox.name }],
        }));

      assert.equal(forbiddenRes.status, 403, JSON.stringify(forbiddenRes.body));
      assert.equal(forbiddenRes.body?.error, 'Sem permissão para enviar pela caixa');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /condominios/api/msg/messages reaproveita a mesma mensagem quando o clientNonce é repetido', async () => {
  const teardownGuard = installTeardownSuppression();
  const portalUserId = '507f1f77bcf86cd799439011';
  const repeatedNonce = `nonce-dedupe-${Date.now()}-${nextSequence()}`;

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-send-start-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
        unidade_id: UNIDADE_ID,
      });

      const payload = buildPayload({ clientNonce: repeatedNonce });
      const headers = {
        Accept: 'application/json',
        Connection: 'close',
        'x-wdg-portal': '1',
        Cookie: buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined, unidade_id: UNIDADE_ID },
        })
      };

      const firstRes = await request(app)
        .post('/condominios/api/msg/messages')
        .set(headers)
        .send(payload);

      const secondRes = await request(app)
        .post('/condominios/api/msg/messages')
        .set(headers)
        .send(payload);

      assert.equal(firstRes.status, 201, JSON.stringify(firstRes.body));
      assert.equal(firstRes.body?.ok, true, JSON.stringify(firstRes.body));
      assert.equal(secondRes.status, 200, JSON.stringify(secondRes.body));
      assert.equal(secondRes.body?.ok, true, JSON.stringify(secondRes.body));
      assert.equal(secondRes.body?.deduped, true, JSON.stringify(secondRes.body));
      assert.equal(String(secondRes.body?.id || ''), String(firstRes.body?.id || ''), JSON.stringify({ first: firstRes.body, second: secondRes.body }));
      assert.equal(String(secondRes.body?.protocolo || ''), String(firstRes.body?.protocolo || ''), JSON.stringify({ first: firstRes.body, second: secondRes.body }));

      const docs = await CondMsgMessage.find({
        from_owner: 'portal@example.com',
        from_mailbox_id: 'pessoal',
        client_nonce: repeatedNonce,
      }).lean();
      assert.equal(docs.length, 1, JSON.stringify(docs));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});