import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

import CondMsgMarker from '../src/core/models/cond_msg_marker.js';
import CondMsgMessage from '../src/core/models/cond_msg_message.js';
import { createServer } from '../src/server/createServer.js';

function signPortalCookie(payload, secret) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function buildPortalCookieHeader({
  secret = 'portal-markers-runtime-test-secret',
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

function markerDoc({
  owner = 'portal@example.com',
  nome = 'Importante',
  cor = 'blue',
} = {}) {
  return {
    mailbox_id: 'pessoal',
    owner,
    nome,
    cor,
    unidade_id: null,
    createdBy: 'runtime-test',
    ativo: true,
  };
}

function messageDoc({
  protocolo,
  unidadeId = '507f1f77bcf86cd799439010',
  owner = 'portal@example.com',
  marker = 'Importante',
} = {}) {
  return {
    protocolo,
    ano: 2026,
    from_mailbox_id: 'pessoal',
    from_mailbox_name: 'Pessoal',
    from_owner: 'remetente@example.com',
    to: [{ type: 'user', email: 'portal@example.com', nome: 'Morador Portal' }],
    cc: [],
    assunto: 'Teste markers',
    body_html: '<p>teste markers</p>',
    body_text: 'teste markers',
    assinatura_ativa: false,
    assinatura_texto: '',
    anexos: [],
    thread_root_id: null,
    in_reply_to: null,
    forwarded_from_id: null,
    acessos: [],
    states: [{ mailbox_id: 'pessoal', owner, marcadores: [marker], lida_em: null }],
    unidade_id: unidadeId,
    createdBy: 'runtime-test',
    ativo: true,
  };
}

test('GET /condominios/api/msg/markers sem sessao Portal preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/condominios/api/msg/markers?mailboxId=pessoal')
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

test('GET /condominios/api/msg/markers no Portal pessoal deduplica owners compativeis', async () => {
  const teardownGuard = installTeardownSuppression();
  const habitacaoId = '507f1f77bcf86cd799439012';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-markers-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondMsgMarker.create([
        markerDoc({ owner: 'portal@example.com', nome: ' Importante ', cor: 'blue' }),
        markerDoc({ owner: `portal@example.com::portal::hab:${habitacaoId}`, nome: 'Importante', cor: 'green' }),
      ]);

      const res = await request(app)
        .get('/condominios/api/msg/markers?mailboxId=pessoal')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { habitacao_id: habitacaoId } }));

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
      assert.equal(Array.isArray(res.body), true, JSON.stringify(res.body));
      assert.equal(res.body.length, 1, JSON.stringify(res.body));
      assert.equal(res.body[0]?.nome, 'Importante', JSON.stringify(res.body));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /condominios/api/msg/markers no Portal pessoal reaproveita marcador em owner legado compativel', async () => {
  const teardownGuard = installTeardownSuppression();
  const habitacaoId = '507f1f77bcf86cd799439012';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-markers-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      const existing = await CondMsgMarker.create(markerDoc({
        owner: `portal@example.com::portal::hab:${habitacaoId}`,
        nome: 'Urgente',
        cor: 'red',
      }));

      const res = await request(app)
        .post('/condominios/api/msg/markers')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { habitacao_id: habitacaoId } }))
        .send({ mailboxId: 'pessoal', nome: 'Urgente', cor: 'yellow' });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
      assert.equal(res.body?.id, String(existing._id), JSON.stringify(res.body));
      assert.equal(res.body?.nome, 'Urgente', JSON.stringify(res.body));

      const docs = await CondMsgMarker.find({ nome: 'Urgente', ativo: { $ne: false } }).lean();
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

test('DELETE /condominios/api/msg/markers/:id no Portal pessoal desativa owners compativeis e limpa states', async () => {
  const teardownGuard = installTeardownSuppression();
  const habitacaoId = '507f1f77bcf86cd799439012';
  const legacyOwner = `portal@example.com::portal::hab:${habitacaoId}`;

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-markers-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      const [baseMarker, legacyMarker] = await CondMsgMarker.create([
        markerDoc({ owner: 'portal@example.com', nome: 'Financeiro', cor: 'blue' }),
        markerDoc({ owner: legacyOwner, nome: 'Financeiro', cor: 'green' }),
      ]);

      const [baseMessage, legacyMessage] = await CondMsgMessage.create([
        messageDoc({ protocolo: `MARKER-BASE-${Date.now()}`, owner: 'portal@example.com', marker: 'Financeiro' }),
        messageDoc({ protocolo: `MARKER-LEGACY-${Date.now()}`, owner: legacyOwner, marker: 'Financeiro' }),
      ]);

      const res = await request(app)
        .delete(`/condominios/api/msg/markers/${baseMarker._id}?mailboxId=pessoal`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { habitacao_id: habitacaoId } }));

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.ok, true, JSON.stringify(res.body));

      const [markersAfter, baseMessageAfter, legacyMessageAfter] = await Promise.all([
        CondMsgMarker.find({ nome: 'Financeiro' }).sort({ owner: 1 }).lean(),
        CondMsgMessage.findById(baseMessage._id).lean(),
        CondMsgMessage.findById(legacyMessage._id).lean(),
      ]);

      assert.equal(markersAfter.length, 2, JSON.stringify(markersAfter));
      assert.equal(markersAfter.every((doc) => doc?.ativo === false), true, JSON.stringify(markersAfter));

      const baseState = (baseMessageAfter?.states || []).find((state) => String(state?.owner || '') === 'portal@example.com');
      const legacyState = (legacyMessageAfter?.states || []).find((state) => String(state?.owner || '') === legacyOwner);

      assert.deepEqual(baseState?.marcadores || [], [], JSON.stringify(baseMessageAfter));
      assert.deepEqual(legacyState?.marcadores || [], [], JSON.stringify(legacyMessageAfter));

      void legacyMarker;
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});