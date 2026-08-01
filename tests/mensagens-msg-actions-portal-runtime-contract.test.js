import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

import CondMsgMessage from '../src/core/models/cond_msg_message.js';
import { createServer } from '../src/server/createServer.js';

function signPortalCookie(payload, secret) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function buildPortalCookieHeader({
  secret = 'portal-actions-runtime-test-secret',
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
      unidade_id: '507f1f77bcf86cd799439010',
      habitacao_id: '507f1f77bcf86cd799439012',
      portal_acesso_ativo: true,
      ...session,
    },
  };
  return `wdg_portal=${signPortalCookie(payload, secret)}`;
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

function buildMessageDoc({
  protocolo,
  unidadeId = '507f1f77bcf86cd799439010',
  threadRootId = null,
  stateOwner = 'portal@example.com',
}) {
  return {
    protocolo,
    ano: 2026,
    from_mailbox_id: 'pessoal',
    from_mailbox_name: 'Pessoal',
    from_owner: 'remetente@example.com',
    to: [{ type: 'user', email: 'portal@example.com', nome: 'Morador Portal' }],
    cc: [],
    assunto: 'Teste actions',
    body_html: '<p>teste actions</p>',
    body_text: 'teste actions',
    assinatura_ativa: false,
    assinatura_texto: '',
    anexos: [],
    thread_root_id: threadRootId,
    in_reply_to: null,
    forwarded_from_id: null,
    acessos: [],
    states: [{ mailbox_id: 'pessoal', owner: stateOwner, lixeira_em: null, arquivada_em: null }],
    unidade_id: unidadeId,
    createdBy: 'runtime-test',
    ativo: true,
  };
}

test('POST /mensagens/api/msg/messages/actions sem sessÃ£o Portal preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .post('/mensagens/api/msg/messages/actions')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .set('x-wdg-portal', '1')
      .send({ mailboxId: 'pessoal', ids: ['507f1f77bcf86cd799439099'], action: 'archive' });

    assert.equal(res.status, 401);
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.match(String(res.body?.error || ''), /^N.o autenticado$/u);
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('POST /mensagens/api/msg/messages/actions no Portal pessoal arquiva a thread e preserva owner variant por habitaÃ§Ã£o', async () => {
  const teardownGuard = installTeardownSuppression();
  const unidadeId = '507f1f77bcf86cd799439010';
  const habitacaoId = '507f1f77bcf86cd799439012';
  const habOwner = `portal@example.com::portal::hab:${habitacaoId}`;

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-actions-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      const root = await CondMsgMessage.create(buildMessageDoc({
        protocolo: `POST-ACTIONS-ROOT-${Date.now()}`,
        unidadeId,
        stateOwner: 'portal@example.com',
      }));

      const sibling = await CondMsgMessage.create(buildMessageDoc({
        protocolo: `POST-ACTIONS-SIB-${Date.now()}`,
        unidadeId,
        threadRootId: root._id,
        stateOwner: habOwner,
      }));

      const res = await request(app)
        .post('/mensagens/api/msg/messages/actions')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { unidade_id: unidadeId, habitacao_id: habitacaoId } }))
        .send({
          mailboxId: 'pessoal',
          ids: [String(root._id)],
          action: 'archive',
          fromFolder: 'entrada',
        });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
      assert.equal(res.body?.ok, true, JSON.stringify(res.body));

      const [rootAfter, siblingAfter] = await Promise.all([
        CondMsgMessage.findById(root._id).lean(),
        CondMsgMessage.findById(sibling._id).lean(),
      ]);

      const rootState = (rootAfter?.states || []).find((state) => String(state?.owner || '') === 'portal@example.com');
      const siblingState = (siblingAfter?.states || []).find((state) => String(state?.owner || '') === habOwner);

      assert.ok(rootState?.arquivada_em, JSON.stringify(rootAfter));
      assert.equal(rootState?.arquivada_de, 'entrada', JSON.stringify(rootAfter));
      assert.ok(siblingState?.arquivada_em, JSON.stringify(siblingAfter));
      assert.equal(siblingState?.arquivada_de, 'entrada', JSON.stringify(siblingAfter));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});
