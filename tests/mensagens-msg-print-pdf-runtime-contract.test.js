import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

import CondMsgMessage from '../src/core/models/cond_msg_message.js';
import CondUsuario from '../src/core/models/cond_usuario.js';
import { createServer } from '../src/server/createServer.js';

function signPortalCookie(payload, secret) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function buildPortalCookieHeader({
  secret = 'portal-print-pdf-runtime-test-secret',
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

function messageDoc({
  protocolo,
  unidadeId = '507f1f77bcf86cd799439010',
  stateOwner = 'portal@example.com',
} = {}) {
  return {
    protocolo,
    ano: 2026,
    from_mailbox_id: 'pessoal',
    from_mailbox_name: 'Pessoal',
    from_owner: 'remetente@example.com',
    to: [{ type: 'user', email: 'portal@example.com', nome: 'Destinatario Diferente' }],
    cc: [],
    assunto: 'Teste PDF impressao',
    body_html: '<p>teste pdf impressao</p>',
    body_text: 'teste pdf impressao',
    assinatura_ativa: false,
    assinatura_texto: '',
    anexos: [],
    thread_root_id: null,
    in_reply_to: null,
    forwarded_from_id: null,
    acessos: [],
    states: [{ mailbox_id: 'pessoal', owner: stateOwner, lida_em: new Date('2026-04-21T12:00:00.000Z') }],
    unidade_id: unidadeId,
    createdBy: 'runtime-test',
    ativo: true,
  };
}

test('GET /mensagens/api/msg/messages/:id/imprimir.pdf sem sessÃ£o preserva 401 texto simples', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/mensagens/api/msg/messages/507f1f77bcf86cd799439099/imprimir.pdf?mailboxId=pessoal')
      .set('Connection', 'close')
      .set('x-wdg-portal', '1');

    assert.equal(res.status, 401);
    assert.match(String(res.text || ''), /N.o autenticado/u);
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('GET /mensagens/api/msg/messages/:id/imprimir.pdf no Portal pessoal aceita state legado por habitaÃ§Ã£o com email resolvido por backfill', async () => {
  const teardownGuard = installTeardownSuppression();
  const portalUserId = '507f1f77bcf86cd799439011';
  const habitacaoId = '507f1f77bcf86cd799439012';
  const legacyOwner = `portal@example.com::portal::hab:${habitacaoId}`;

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-print-pdf-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
        unidade_id: '507f1f77bcf86cd799439010',
      });

      const message = await CondMsgMessage.create(messageDoc({
        protocolo: `PRINT-PDF-${Date.now()}`,
        stateOwner: legacyOwner,
      }));

      const res = await request(app)
        .get(`/mensagens/api/msg/messages/${message._id}/imprimir.pdf?mailboxId=pessoal&order=normal`)
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { unidade_id: '507f1f77bcf86cd799439010', habitacao_id: habitacaoId },
        }));

      assert.equal(res.status, 200, String(res.text || ''));
      assert.match(String(res.headers['content-type'] || ''), /^application\/pdf\b/i);
      assert.ok(Buffer.isBuffer(res.body), 'esperava body binÃ¡rio do PDF');
      assert.ok(res.body.length > 0, 'esperava PDF nÃ£o vazio');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});
