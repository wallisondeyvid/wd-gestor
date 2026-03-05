import request from 'supertest';
import { createServer } from '#server/createServer.js';

const DEFAULT_UNIDADE_ID = '000000000000000000000010';
const DEFAULT_UNIDADE_ROUTE_ID = '000000000000000000000001';

function envValue(name) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? '<unset>' : raw;
}

function pickPilotUnidadeId() {
  const fromExplicit = String(process.env.WD_CANARY_UNIDADE_ID || '').trim();
  if (fromExplicit) return fromExplicit;

  const firstAllowlisted = String(process.env.WD_MULTI_DB_ALLOWLIST || '')
    .split(',')
    .map((item) => String(item || '').trim())
    .find(Boolean);

  return firstAllowlisted || DEFAULT_UNIDADE_ID;
}

function installSessionSeedRoute(app, unidadeId) {
  app.get('/__smoke__/seed-session', (req, res) => {
    req.session.user = {
      id: '000000000000000000000001',
      email: 'smoke.userdb.canary@example.com',
      role: 'master',
      nome: 'Smoke Canary User',
      unidade_id: unidadeId,
      unidade_principal_id: unidadeId,
    };

    req.session.save((err) => {
      if (err) return res.status(500).json({ ok: false, error: 'SESSION_SEED_FAILED' });
      return res.status(204).end();
    });
  });
}

async function main() {
  const unidadeId = pickPilotUnidadeId();
  const unidadeRouteId = String(process.env.WD_CANARY_ROUTE_ID || DEFAULT_UNIDADE_ROUTE_ID).trim() || DEFAULT_UNIDADE_ROUTE_ID;

  console.log('[smoke:userdb-canary] env', {
    WD_MULTI_DB: envValue('WD_MULTI_DB'),
    WD_MULTI_DB_ALLOWLIST: envValue('WD_MULTI_DB_ALLOWLIST'),
    WD_USERDB_HANDSHAKE: envValue('WD_USERDB_HANDSHAKE'),
    WDG_MULTI_TENANT: envValue('WDG_MULTI_TENANT'),
    WD_CANARY_UNIDADE_ID: unidadeId,
  });

  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });
  installSessionSeedRoute(app, unidadeId);
  registerErrorHandlers();

  const agent = request.agent(app);

  try {
    const seedRes = await agent
      .get('/__smoke__/seed-session')
      .set('Connection', 'close');

    if (seedRes.status !== 204) {
      throw new Error(`Falha ao seed de sessao: status=${seedRes.status}`);
    }

    const condominiosRes = await agent
      .get(`/condominios/api/unidades/${unidadeRouteId}`)
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    const gestorRes = await agent
      .get('/gestor/api/recursos')
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    const condominioGateRejected = condominiosRes.status === 400 && condominiosRes.body?.error === 'UNIDADE_ID_REQUIRED';
    const gestorGateRejected = gestorRes.status === 400 && gestorRes.body?.error === 'UNIDADE_ID_REQUIRED';
    const gestorUnauthorized = gestorRes.status === 401;

    if (condominiosRes.status === 500 || condominiosRes.status === 503) {
      console.warn('[smoke:userdb-canary] condominios respondeu erro de infra (esperavel em skipDb)', {
        status: condominiosRes.status,
        body: condominiosRes.body,
      });
    }

    if (gestorRes.status === 500 || gestorRes.status === 503) {
      console.warn('[smoke:userdb-canary] gestor respondeu erro de infra (esperavel em skipDb)', {
        status: gestorRes.status,
        body: gestorRes.body,
      });
    }

    console.log('[smoke:userdb-canary] resultados', {
      condominios: {
        status: condominiosRes.status,
        error: condominiosRes.body?.error || null,
      },
      gestor: {
        status: gestorRes.status,
        error: gestorRes.body?.error || null,
      },
      checks: {
        condominioGateRejected,
        gestorGateRejected,
        gestorUnauthorized,
      },
    });

    if (condominioGateRejected || gestorGateRejected || gestorUnauthorized) {
      console.error('[smoke:userdb-canary] FALHOU: gate/auth bloqueou request com unidadeId valido');
      process.exitCode = 1;
      return;
    }

    console.log('[smoke:userdb-canary] OK: requests passaram pelo gate de unitScope com unidadeId valido');
  } finally {
    if (typeof close === 'function') {
      await close({ stopMemoryServer: true });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

main().catch((error) => {
  console.error('[smoke:userdb-canary] erro fatal', error);
  process.exitCode = 1;
});
