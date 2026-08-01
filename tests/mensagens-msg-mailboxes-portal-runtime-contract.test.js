import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

import CondMsgMailbox from '../src/core/models/cond_msg_mailbox.js';
import CondUsuario from '../src/core/models/cond_usuario.js';
import { createServer } from '../src/server/createServer.js';

function signPortalCookie(payload, secret) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function buildPortalCookieHeader({
  secret = 'portal-mailboxes-runtime-test-secret',
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

function mailboxDoc({
  _id,
  name,
  unitId = '507f1f77bcf86cd799439010',
  publicValue = false,
  linkType = '',
  linkId = null,
  createdBy = 'operador@example.com',
  operators = [],
} = {}) {
  return {
    _id,
    name,
    type: 'grupo',
    unidade_id: unitId,
    unidade_nome: 'Condominio Teste',
    public: publicValue,
    link_type: linkType,
    link_id: linkId,
    createdBy,
    operators,
    ativo: true,
  };
}

test('GET /mensagens/api/msg/mailboxes sem sessao Portal preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/mensagens/api/msg/mailboxes')
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

test('GET /mensagens/api/msg/mailboxes/recipients sem sessao Portal preserva 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/mensagens/api/msg/mailboxes/recipients')
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

test('GET /mensagens/api/msg/mailboxes no Portal lista caixas de que o usuario e membro', async () => {
  const teardownGuard = installTeardownSuppression();
  const unitId = '507f1f77bcf86cd799439010';
  const habitacaoId = '507f1f77bcf86cd799439012';
  const otherHabitacaoId = '507f1f77bcf86cd799439013';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-mailboxes-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondMsgMailbox.create([
        mailboxDoc({
          name: 'Caixa Membro',
          unitId,
          operators: [{ user: 'portal@example.com', perms: { administrar: true } }],
        }),
        mailboxDoc({
          name: 'Caixa Publica',
          unitId,
          publicValue: true,
          createdBy: 'outro@example.com',
          operators: [{ user: 'outro@example.com', perms: { administrar: true } }],
        }),
        mailboxDoc({
          name: 'Hab 101',
          unitId,
          linkType: 'habitacao',
          linkId: habitacaoId,
          createdBy: 'morador@example.com',
        }),
        mailboxDoc({
          name: 'Hab 102',
          unitId,
          linkType: 'habitacao',
          linkId: otherHabitacaoId,
          createdBy: 'morador@example.com',
        }),
      ]);

      const res = await request(app)
        .get('/mensagens/api/msg/mailboxes')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { unidade_id: unitId, habitacao_id: habitacaoId } }));

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(Array.isArray(res.body), true, JSON.stringify(res.body));

      const byName = new Map((res.body || []).map((item) => [String(item?.name || ''), item]));
      assert.ok(byName.has('Caixa Membro'), JSON.stringify(res.body));
      assert.equal(byName.has('Caixa Publica'), false, JSON.stringify(res.body));
      assert.equal(byName.has('Hab 101'), false, JSON.stringify(res.body));
      assert.equal(byName.has('Hab 102'), false, JSON.stringify(res.body));

      assert.equal(byName.get('Caixa Membro')?.isMember, true, JSON.stringify(byName.get('Caixa Membro')));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('GET /mensagens/api/msg/mailboxes/recipients no Portal lista caixas publicas da unidade', async () => {
  const teardownGuard = installTeardownSuppression();
  const unitId = '507f1f77bcf86cd799439010';
  const habitacaoId = '507f1f77bcf86cd799439012';
  const otherHabitacaoId = '507f1f77bcf86cd799439013';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-mailboxes-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondMsgMailbox.create([
        mailboxDoc({ name: 'Caixa Publica', unitId, publicValue: true }),
        mailboxDoc({ name: 'Hab 101', unitId, linkType: 'habitacao', linkId: habitacaoId }),
        mailboxDoc({ name: 'Hab 102', unitId, linkType: 'habitacao', linkId: otherHabitacaoId }),
      ]);

      const res = await request(app)
        .get('/mensagens/api/msg/mailboxes/recipients')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({ session: { unidade_id: unitId, habitacao_id: habitacaoId } }));

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(Array.isArray(res.body), true, JSON.stringify(res.body));

      const names = (res.body || []).map((item) => String(item?.name || ''));
      assert.equal(names.includes('Caixa Publica'), true, JSON.stringify(res.body));
      assert.equal(names.includes('Hab 101'), false, JSON.stringify(res.body));
      assert.equal(names.includes('Hab 102'), false, JSON.stringify(res.body));

      const publicMailbox = (res.body || []).find((item) => String(item?.name || '') === 'Caixa Publica');
      assert.equal(publicMailbox?.isPublic, true, JSON.stringify(publicMailbox));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('POST /mensagens/api/msg/mailboxes no Portal cria caixa com identidade resolvida por preparo canÃ´nico mÃ­nimo', async () => {
  const teardownGuard = installTeardownSuppression();
  const unitId = '507f1f77bcf86cd799439010';
  const portalUserId = '507f1f77bcf86cd799439011';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-mailboxes-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
      });

      const res = await request(app)
        .post('/mensagens/api/msg/mailboxes')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined, unidade_id: unitId },
        }))
        .send({ name: 'Nova Caixa Portal', unidade_id: '507f1f77bcf86cd799439099' });

      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(String(res.body?.name || ''), 'Nova Caixa Portal');
      assert.equal(String(res.body?.unitId || ''), unitId, JSON.stringify(res.body));
      assert.equal(String(res.body?.createdBy || ''), portalUserId, JSON.stringify(res.body));
      assert.equal(String(res.body?.operators?.[0]?.user || ''), portalUserId, JSON.stringify(res.body));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('PATCH /mensagens/api/msg/mailboxes/:id no Portal autoriza membro por id resolvido do preparo canonico minimo', async () => {
  const teardownGuard = installTeardownSuppression();
  const unitId = '507f1f77bcf86cd799439010';
  const portalUserId = '507f1f77bcf86cd799439011';
  const mailboxId = '507f1f77bcf86cd799439099';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-mailboxes-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
      });

      await CondMsgMailbox.create(mailboxDoc({
        _id: mailboxId,
        name: 'Caixa Editavel',
        unitId,
        operators: [{ user: portalUserId, perms: { administrar: true, editar: true } }],
      }));

      const res = await request(app)
        .patch(`/mensagens/api/msg/mailboxes/${mailboxId}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined, unidade_id: unitId },
        }))
        .send({ name: 'Caixa Editada' });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(String(res.body?.name || ''), 'Caixa Editada');
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('DELETE /mensagens/api/msg/mailboxes/:id no Portal autoriza exclusao por id resolvido do preparo canonico minimo', async () => {
  const teardownGuard = installTeardownSuppression();
  const unitId = '507f1f77bcf86cd799439010';
  const portalUserId = '507f1f77bcf86cd799439011';
  const mailboxId = '507f1f77bcf86cd799439098';

  await withEnv({ PORTAL_COOKIE_SECRET: 'portal-mailboxes-runtime-test-secret', MONGO_MEMORY: '1' }, async () => {
    const { app, close } = await createServer();

    try {
      await CondUsuario.create({
        _id: portalUserId,
        nome: 'Morador Portal',
        email: 'portal@example.com',
      });

      await CondMsgMailbox.create(mailboxDoc({
        _id: mailboxId,
        name: 'Caixa Excluivel',
        unitId,
        operators: [{ user: portalUserId, perms: { administrar: true, editar: true, excluir: true } }],
      }));

      const res = await request(app)
        .delete(`/mensagens/api/msg/mailboxes/${mailboxId}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('x-wdg-portal', '1')
        .set('Cookie', buildPortalCookieHeader({
          userId: portalUserId,
          session: { email: undefined, userEmail: undefined, unidade_id: unitId },
        }));

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.ok, true, JSON.stringify(res.body));
      assert.equal(String(res.body?.id || ''), mailboxId);
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});
