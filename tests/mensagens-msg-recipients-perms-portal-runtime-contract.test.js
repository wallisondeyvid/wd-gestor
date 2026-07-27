import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

import CondMsgSettings from '../src/core/models/cond_msg_settings.js';
import CondUsuario from '../src/core/models/cond_usuario.js';
import { createServer } from '../src/server/createServer.js';

function signPortalCookie(payload, secret) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function buildPortalCookieHeader({
  secret = 'portal-recipients-perms-runtime-test-secret',
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

test('GET /mensagens/api/msg/recipients/perms sem sessao Portal preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/mensagens/api/msg/recipients/perms')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .set('x-wdg-portal', '1');

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

test('GET /mensagens/api/msg/recipients/perms no Portal resolve identidade, unidade e regras globais', async () => {
  const teardownGuard = installTeardownSuppression();
  const portalUserId = '507f1f77bcf86cd799439011';
  const unidadeId = '507f1f77bcf86cd799439010';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-recipients-perms-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
        unidade_id: unidadeId,
      });

      await CondMsgSettings.create({
        unidade_id: unidadeId,
        permitir_pessoal_para_pessoal: true,
      });

      const res = await request(app)
        .get('/mensagens/api/msg/recipients/perms')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined, unidade_id: unidadeId },
        }));

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.ok, true, JSON.stringify(res.body));
      assert.equal(String(res.body?.unidadeId || ''), unidadeId);
      assert.equal(String(res.body?.email || ''), portalUserId);
      assert.equal(res.body?.fromPortal, true);
      assert.deepEqual(res.body?.perms, {
        permitir_pessoal_para_pessoal: true,
        permitir_pessoal_para_habitacao: true,
        permitir_pessoal_para_colaborador: true,
      });
      assert.equal(res.body?.allowP2PGlobal, true);
      assert.equal(res.body?.effectiveAllowP2P, true);
      assert.equal(res.body?.restrictNewMessageRecipients, false);
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('GET /mensagens/api/msg/recipients/perms falha com 403 quando a unidade efetiva nao pode ser determinada', async () => {
  const teardownGuard = installTeardownSuppression();
  const portalUserId = '507f1f77bcf86cd799439011';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-recipients-perms-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
      });

      const res = await request(app)
        .get('/mensagens/api/msg/recipients/perms')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined, unidade_id: undefined },
        }));

      assert.equal(res.status, 403, JSON.stringify(res.body));
      assert.match(String(res.body?.error || ''), /^N.o foi poss.vel determinar a unidade do usu.rio\.$/u);
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});
