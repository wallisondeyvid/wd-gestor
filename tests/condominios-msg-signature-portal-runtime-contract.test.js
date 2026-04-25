import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

import CondMsgSignaturePref from '../src/core/models/cond_msg_signature_pref.js';
import CondUsuario from '../src/core/models/cond_usuario.js';
import { createServer } from '../src/server/createServer.js';

function signPortalCookie(payload, secret) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function buildPortalCookieHeader({
  secret = 'portal-signature-runtime-test-secret',
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

test('GET /condominios/api/msg/signature sem sessao Portal preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/condominios/api/msg/signature')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .set('x-wdg-portal', '1');

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

test('GET /condominios/api/msg/signature no Portal lê preferência por email resolvido do preparo mínimo', async () => {
  const teardownGuard = installTeardownSuppression();
  const portalUserId = '507f1f77bcf86cd799439011';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-signature-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
      });

      await CondMsgSignaturePref.create({
        owner: 'portal@example.com',
        mailbox_id: 'pessoal',
        enabled: true,
        text: 'Assinatura Portal',
      });

      const res = await request(app)
        .get('/condominios/api/msg/signature?mailboxId=pessoal')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined },
        }));

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.enabled, true, JSON.stringify(res.body));
      assert.equal(String(res.body?.text || ''), 'Assinatura Portal');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('PUT /condominios/api/msg/signature no Portal canonicaliza owner pessoal e remove duplicata legado', async () => {
  const teardownGuard = installTeardownSuppression();
  const portalUserId = '507f1f77bcf86cd799439011';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-signature-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
      });

      await CondMsgSignaturePref.create({
        owner: portalUserId,
        mailbox_id: 'pessoal',
        enabled: false,
        text: 'Legado por id',
      });

      const res = await request(app)
        .put('/condominios/api/msg/signature?mailboxId=pessoal')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined },
        }))
        .send({ enabled: true, text: 'Assinatura Canonica' });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.enabled, true, JSON.stringify(res.body));
      assert.equal(String(res.body?.text || ''), 'Assinatura Canonica');

      const canonical = await CondMsgSignaturePref.findOne({ owner: 'portal@example.com', mailbox_id: 'pessoal' }).lean();
      const legacy = await CondMsgSignaturePref.findOne({ owner: portalUserId, mailbox_id: 'pessoal' }).lean();

      assert.equal(String(canonical?.owner || ''), 'portal@example.com');
      assert.equal(String(canonical?.text || ''), 'Assinatura Canonica');
      assert.equal(legacy, null);
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});