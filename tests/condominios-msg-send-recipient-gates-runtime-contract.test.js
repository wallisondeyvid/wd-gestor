import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

import CondMsgMailbox from '../src/core/models/cond_msg_mailbox.js';
import CondMsgSettings from '../src/core/models/cond_msg_settings.js';
import CondUsuario from '../src/core/models/cond_usuario.js';
import { createServer } from '../src/server/createServer.js';

const UNIDADE_ID = '507f1f77bcf86cd799439010';
const OUTRA_UNIDADE_ID = '507f1f77bcf86cd799439099';
const PORTAL_USER_ID = '507f1f77bcf86cd799439011';

function signPortalCookie(payload, secret) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function buildPortalCookieHeader({
  secret = 'portal-send-recipient-gates-runtime-test-secret',
  userId = PORTAL_USER_ID,
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

function buildPayload(overrides = {}) {
  return {
    fromMailboxId: 'pessoal',
    fromMailboxName: 'Pessoal',
    to: [{ type: 'user', email: 'destino@example.com', nome: 'Destino' }],
    cc: [],
    assunto: 'Teste gates intermediarios',
    bodyHtml: '<p>teste gates intermediarios</p>',
    bodyText: 'teste gates intermediarios',
    assinaturaAtiva: false,
    assinaturaTexto: '',
    clientNonce: `nonce-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...overrides,
  };
}

function mailboxDoc({
  _id,
  name,
  unidadeId,
} = {}) {
  return {
    _id,
    name,
    type: 'grupo',
    unidade_id: unidadeId,
    unidade_nome: 'Condominio Teste',
    public: true,
    operators: [],
    createdBy: 'runtime-test',
    ativo: true,
  };
}

test('POST /condominios/api/msg/messages no Portal rejeita mailbox destinataria fora da unidade efetiva', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-send-recipient-gates-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: PORTAL_USER_ID,
        nome: 'Morador Portal',
        email: 'portal@example.com',
        unidade_id: UNIDADE_ID,
        ativo: true,
      });

      await CondMsgMailbox.create(mailboxDoc({
        _id: '507f1f77bcf86cd799439050',
        name: 'Caixa Outra Unidade',
        unidadeId: OUTRA_UNIDADE_ID,
      }));

      const res = await request(app)
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { email: undefined, userEmail: undefined, unidade_id: UNIDADE_ID } }))
        .send(buildPayload({
          to: [{ type: 'mailbox', mailboxId: '507f1f77bcf86cd799439050', nome: 'Caixa Outra Unidade' }],
        }));

      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body?.error, 'Caixa de destinatário fora da sua unidade em Para.');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /condominios/api/msg/messages no Portal aplica gate basico Pessoal para Pessoal por settings', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-send-recipient-gates-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create([
        {
          _id: PORTAL_USER_ID,
          nome: 'Morador Portal',
          email: 'portal@example.com',
          unidade_id: UNIDADE_ID,
          ativo: true,
        },
        {
          _id: '507f1f77bcf86cd799439012',
          nome: 'Outro Morador Portal',
          email: 'destino@example.com',
          unidade_id: UNIDADE_ID,
          ativo: true,
        },
      ]);

      await CondMsgSettings.create({
        unidade_id: UNIDADE_ID,
        permitir_pessoal_para_pessoal: true,
        portal_user_perms: [{
          email: 'portal@example.com',
          permitir_pessoal_para_pessoal: false,
          permitir_pessoal_para_habitacao: true,
          permitir_pessoal_para_colaborador: true,
        }],
      });

      const res = await request(app)
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { email: undefined, userEmail: undefined, unidade_id: UNIDADE_ID } }))
        .send(buildPayload({
          to: [{ type: 'user', email: 'destino@example.com', nome: 'Outro Morador Portal' }],
        }));

      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body?.error, 'Envio de caixa pessoal para caixa pessoal está desativado.');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /condominios/api/msg/messages no Portal bloqueia destinatario pessoal suspenso', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-send-recipient-gates-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create([
        {
          _id: PORTAL_USER_ID,
          nome: 'Morador Portal',
          email: 'portal@example.com',
          unidade_id: UNIDADE_ID,
          ativo: true,
        },
        {
          _id: '507f1f77bcf86cd799439013',
          nome: 'Destinatario Suspenso',
          email: 'suspenso@example.com',
          unidade_id: UNIDADE_ID,
          ativo: true,
        },
      ]);

      await CondMsgSettings.create({
        unidade_id: UNIDADE_ID,
        permitir_pessoal_para_pessoal: true,
        pessoais_suspensas_portal: ['suspenso@example.com'],
      });

      const res = await request(app)
        .post('/condominios/api/msg/messages')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { email: undefined, userEmail: undefined, unidade_id: UNIDADE_ID } }))
        .send(buildPayload({
          to: [{ type: 'user', email: 'suspenso@example.com', nome: 'Destinatario Suspenso' }],
        }));

      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body?.error, 'Um ou mais destinatários estão com caixa pessoal suspensa.');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});