import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

import CondMsgGroup from '../src/core/models/cond_msg_group.js';
import { createServer } from '../src/server/createServer.js';

function signPortalCookie(payload, secret) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function buildPortalCookieHeader({
  secret = 'portal-groups-runtime-test-secret',
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

function groupDoc({
  owner = 'portal@example.com',
  name = 'Grupo Teste',
  unidadeId = '507f1f77bcf86cd799439010',
  members = [],
} = {}) {
  return {
    mailbox_id: 'pessoal',
    owner,
    name,
    members,
    unidade_id: unidadeId,
    createdBy: 'runtime-test',
    ativo: true,
  };
}

test('GET /condominios/api/msg/groups sem sessao Portal preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/condominios/api/msg/groups?mailboxId=pessoal')
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

test('GET /condominios/api/msg/groups no Portal pessoal lista owner base e owner legado com prefixo', async () => {
  const teardownGuard = installTeardownSuppression();
  const habitacaoId = '507f1f77bcf86cd799439012';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-groups-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondMsgGroup.create([
        groupDoc({ owner: 'portal@example.com', name: 'Base' }),
        groupDoc({ owner: `portal@example.com::portal::hab:${habitacaoId}`, name: 'Legado Hab' }),
      ]);

      const res = await request(app)
        .get('/condominios/api/msg/groups?mailboxId=pessoal')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { habitacao_id: habitacaoId } }));

      assert.equal(res.status, 200, JSON.stringify(res.body));
      const names = (res.body || []).map((item) => String(item?.name || ''));
      assert.equal(names.includes('Base'), true, JSON.stringify(res.body));
      assert.equal(names.includes('Legado Hab'), true, JSON.stringify(res.body));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /condominios/api/msg/groups no Portal pessoal cria grupo com owner canônico', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-groups-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      const res = await request(app)
        .post('/condominios/api/msg/groups')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader())
        .send({ mailboxId: 'pessoal', name: 'Novo Grupo', members: [{ type: 'user', email: 'dest@example.com', nome: 'Dest' }] });

      assert.equal(res.status, 201, JSON.stringify(res.body));
      const saved = await CondMsgGroup.findOne({ name: 'Novo Grupo' }).lean();
      assert.equal(String(saved?.owner || ''), 'portal@example.com', JSON.stringify(saved));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('PATCH e DELETE /condominios/api/msg/groups/:id no Portal pessoal aceitam grupo legado por owner variant', async () => {
  const teardownGuard = installTeardownSuppression();
  const habitacaoId = '507f1f77bcf86cd799439012';
  const legacyOwner = `portal@example.com::portal::hab:${habitacaoId}`;

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-groups-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      const [patchDoc, deleteDoc] = await CondMsgGroup.create([
        groupDoc({ owner: legacyOwner, name: 'Legado Patch' }),
        groupDoc({ owner: legacyOwner, name: 'Legado Delete' }),
      ]);

      const patchRes = await request(app)
        .patch(`/condominios/api/msg/groups/${patchDoc._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { habitacao_id: habitacaoId } }))
        .send({ name: 'Legado Patch Renomeado' });

      const deleteRes = await request(app)
        .delete(`/condominios/api/msg/groups/${deleteDoc._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { habitacao_id: habitacaoId } }));

      assert.equal(patchRes.status, 200, JSON.stringify(patchRes.body));
      assert.equal(deleteRes.status, 200, JSON.stringify(deleteRes.body));

      const [patchedAfter, deletedAfter] = await Promise.all([
        CondMsgGroup.findById(patchDoc._id).lean(),
        CondMsgGroup.findById(deleteDoc._id).lean(),
      ]);

      assert.equal(String(patchedAfter?.name || ''), 'Legado Patch Renomeado', JSON.stringify(patchedAfter));
      assert.equal(deletedAfter?.ativo, false, JSON.stringify(deletedAfter));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});