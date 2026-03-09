import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const FOTO_ENDPOINT = '/gestor/api/usuario/foto';
const SESSION_SEED_ENDPOINT = '/__tests__/seed-gestor-session';
const EXPECTED_RUNTIME_OWNER = 'src/shared/routes/userApi.js';
const REMOVED_NON_OWNER_CANDIDATE = 'src/modules/gestor/app/routes/userPhotoApi.js';
const GESTOR_APP_FILE = 'src/modules/gestor/app/gestor-app.js';

function ownershipFailure(message) {
  return [
    'Mudanca de ownership/precedencia detectada em /gestor/api/usuario/foto.',
    `Owner runtime esperado: ${EXPECTED_RUNTIME_OWNER}.`,
    `Arquivo concorrente historico removido: ${REMOVED_NON_OWNER_CANDIDATE}.`,
    message,
  ].join(' ');
}

function assertGestorSingleOwnerGuardrail() {
  const absolutePath = path.resolve(process.cwd(), GESTOR_APP_FILE);
  assert.ok(fs.existsSync(absolutePath), ownershipFailure(`Arquivo de montagem nao encontrado: ${GESTOR_APP_FILE}`));

  const content = fs.readFileSync(absolutePath, 'utf8');
  const userApiMatch = content.match(/app\.use\(\s*['"]\/["']\s*,\s*userApiRouter\s*\)\s*;/);
  const userPhotoMatch = content.match(/app\.use\(\s*['"]\/["']\s*,\s*userPhotoApiRouter\s*\)\s*;/);

  assert.ok(
    userApiMatch,
    ownershipFailure('Montagem de userApiRouter nao encontrada em gestor-app.js.'),
  );
  assert.ok(
    !userPhotoMatch,
    ownershipFailure('Duplicidade voltou: userPhotoApiRouter nao deve estar montado no app Gestor enquanto o owner canônico for shared/routes/userApi.js.'),
  );
}

function installSessionSeedRoute(app) {
  app.get(SESSION_SEED_ENDPOINT, (req, res) => {
    const role = String(req.query?.role || 'master').trim() || 'master';
    const email = String(req.query?.email || `${role}.userphoto.contract@example.com`).trim().toLowerCase();
    const foto = String(req.query?.foto || '').trim();

    req.session.user = {
      id: '000000000000000000000001',
      email,
      role,
      nome: `Test ${role}`,
    };

    if (foto) req.session.user.foto = foto;

    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'SESSION_SEED_FAILED' });
      }
      return res.status(204).end();
    });
  });
}

async function createAuthenticatedAgent(app, opts = {}) {
  const role = String(opts.role || 'master').trim() || 'master';
  const email = opts.email ? String(opts.email).trim() : '';
  const foto = opts.foto ? String(opts.foto).trim() : '';

  const agent = request.agent(app);
  const seed = await agent
    .get(SESSION_SEED_ENDPOINT)
    .query({
      role,
      ...(email ? { email } : {}),
      ...(foto ? { foto } : {}),
    })
    .set('Connection', 'close');

  assert.equal(seed.status, 204, `Falha ao seedar sessao para role=${role}`);
  return agent;
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
    },
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function withBlobUnavailable(run) {
  const keys = [
    'VERCEL',
    'BLOB_READ_WRITE_TOKEN',
    'WDGESTOR_DB_DADOS_READ_WRITE_TOKEN',
    'VERCEL_BLOB_RW_TOKEN',
  ];

  const previous = new Map();
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      previous.set(key, process.env[key]);
    } else {
      previous.set(key, undefined);
    }
  }

  process.env.VERCEL = '';
  process.env.BLOB_READ_WRITE_TOKEN = '';
  process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN = '';
  process.env.VERCEL_BLOB_RW_TOKEN = '';

  try {
    return await run();
  } finally {
    for (const key of keys) {
      const oldValue = previous.get(key);
      if (oldValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = oldValue;
      }
    }
  }
}

test('user photo runtime contract + precedence (Gestor app)', async (t) => {
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });
  const teardownGuard = installTeardownSuppression();

  installSessionSeedRoute(app);
  registerErrorHandlers();

  const anonymous = request(app);
  const authNoPhoto = await createAuthenticatedAgent(app, {
    role: 'master',
    email: 'master.userphoto.nophoto@example.com',
  });
  const sessionFotoUrl = 'https://cdn.example.com/avatars/session-photo.webp';
  const authWithSessionPhoto = await createAuthenticatedAgent(app, {
    role: 'master',
    email: 'master.userphoto.withphoto@example.com',
    foto: sessionFotoUrl,
  });

  try {
    await t.test('OWNERSHIP guardrail: Gestor app mantém owner único explícito', async () => {
      assertGestorSingleOwnerGuardrail();
    });

    await t.test('OWNERSHIP guardrail GET: owner runtime permanece shared/routes/userApi.js', async () => {
      const anonRes = await anonymous
        .get(FOTO_ENDPOINT)
        .set('Connection', 'close');

      assert.equal(
        anonRes.status,
        200,
        ownershipFailure('Assinatura GET sem autenticacao mudou: esperado placeholder direto com status 200.'),
      );
      assert.match(
        String(anonRes.headers['cache-control'] || ''),
        /public,\s*max-age=300/i,
        ownershipFailure('Assinatura GET sem autenticacao mudou: cache-control esperado de placeholder direto (public, max-age=300).'),
      );
      assert.match(
        String(anonRes.headers['content-type'] || ''),
        /image\/(svg\+xml|png)/i,
        ownershipFailure('Assinatura GET sem autenticacao mudou: content-type esperado de placeholder imagem.'),
      );
      assert.equal(
        typeof anonRes.headers.location,
        'undefined',
        ownershipFailure('Assinatura GET sem autenticacao mudou: nao deveria haver redirect/location nesse cenario.'),
      );

      const photoRes = await authWithSessionPhoto
        .get(FOTO_ENDPOINT)
        .set('Connection', 'close');

      assert.equal(
        photoRes.status,
        302,
        ownershipFailure('Assinatura GET autenticado com foto em sessao mudou: esperado redirect 302 para URL da sessao.'),
      );
      assert.equal(
        photoRes.headers.location,
        sessionFotoUrl,
        ownershipFailure('Assinatura GET autenticado com foto em sessao mudou: location deve apontar para req.session.user.foto.'),
      );
      assert.match(
        String(photoRes.headers['cache-control'] || ''),
        /public,\s*max-age=60/i,
        ownershipFailure('Assinatura GET autenticado com foto em sessao mudou: cache-control esperado (public, max-age=60).'),
      );
    });

    await t.test('OWNERSHIP guardrail POST: owner runtime permanece shared/routes/userApi.js', async () => {
      await withBlobUnavailable(async () => {
        const res = await authNoPhoto
          .post(FOTO_ENDPOINT)
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .attach('foto', Buffer.from('fake-image-binary'), 'foto.txt');

        assert.equal(
          res.status,
          503,
          ownershipFailure('Assinatura POST mudou: esperado 503 com blob indisponivel no cenario de ownership.'),
        );
        assert.equal(
          res.body?.error,
          'Blob n\u00E3o configurado',
          ownershipFailure('Assinatura POST mudou: mensagem de erro curta esperada do owner runtime atual (shared/routes/userApi.js).'),
        );
        assert.equal(
          String(res.body?.error || '').includes('conecte a Store no Vercel'),
          false,
          ownershipFailure('Assinatura POST mudou: apareceu mensagem longa tipica de outro handler/ownership.'),
        );
      });
    });

    await t.test('GET sem autenticacao retorna placeholder direto (prova de precedencia do shared userApi)', async () => {
      const res = await anonymous
        .get(FOTO_ENDPOINT)
        .set('Connection', 'close');

      assert.equal(res.status, 200);
      assert.match(String(res.headers['cache-control'] || ''), /public,\s*max-age=300/i);
      assert.match(String(res.headers['content-type'] || ''), /image\/(svg\+xml|png)/i);
      assert.equal(typeof res.headers.location, 'undefined');
    });

    await t.test('GET autenticado com foto em sessao redireciona para URL da sessao (prova de precedencia do shared userApi)', async () => {
      const res = await authWithSessionPhoto
        .get(FOTO_ENDPOINT)
        .set('Connection', 'close');

      assert.equal(res.status, 302);
      assert.equal(res.headers.location, sessionFotoUrl);
      assert.match(String(res.headers['cache-control'] || ''), /public,\s*max-age=60/i);
    });

    await t.test('GET autenticado sem foto preserva fallback efetivo atual', async () => {
      const res = await authNoPhoto
        .get(FOTO_ENDPOINT)
        .set('Connection', 'close');

      assert.equal(res.status, 200);
      assert.match(String(res.headers['cache-control'] || ''), /public,\s*max-age=300/i);
      assert.match(String(res.headers['content-type'] || ''), /image\/(svg\+xml|png)/i);
    });

    await t.test('POST sem autenticacao retorna 401 (contrato efetivo)', async () => {
      const res = await anonymous
        .post(FOTO_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 401);
      assert.equal(res.body?.success, false);
      assert.equal(res.body?.code, 'UNAUTHORIZED');
      assert.equal(res.body?.error, 'N\u00E3o autenticado');
    });

    await t.test('POST autenticado sem arquivo retorna 400 (contrato efetivo)', async () => {
      const res = await authNoPhoto
        .post(FOTO_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({});

      assert.equal(res.status, 400);
      assert.equal(res.body?.error, 'Arquivo n\u00E3o enviado');
    });

    await t.test('POST autenticado com arquivo e blob indisponivel retorna assinatura do shared userApi', async () => {
      await withBlobUnavailable(async () => {
        const res = await authNoPhoto
          .post(FOTO_ENDPOINT)
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .attach('foto', Buffer.from('fake-image-binary'), 'foto.txt');

        assert.equal(res.status, 503);
        assert.equal(res.body?.error, 'Blob n\u00E3o configurado');
        assert.equal(String(res.body?.error || '').includes('conecte a Store no Vercel'), false);
      });
    });
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});