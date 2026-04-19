import assert from 'node:assert/strict';
import test from 'node:test';

import { requireUnitScope } from '../src/modules/gestor/app/middlewares/requireUnitScope.js';

const IDS = Object.freeze({
  unitA: '65f100000000000000000002',
  unitB: '65f100000000000000000003',
});

function createResponse() {
  return {
    statusCode: 200,
    jsonPayload: null,
    redirectUrl: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
    redirect(location) {
      this.redirectUrl = location;
      return this;
    },
  };
}

test('requireUnitScope usa apenas a unidade ativa canônica do auth-context-v1 para usuário contextual', async () => {
  const req = {
    path: `/api/unidades/${IDS.unitB}/modulos`,
    originalUrl: `/gestor/api/unidades/${IDS.unitB}/modulos`,
    baseUrl: '/gestor',
    headers: { accept: 'application/json' },
    params: { id: IDS.unitB, unidadeId: IDS.unitB },
    query: { unidadeId: IDS.unitB },
    body: { unidade_id: IDS.unitB },
    user: { role: 'diretor', isMaster: false },
    session: {
      gestorAuthContext: {
        source: 'auth-context-v1',
        active_unidade_id: IDS.unitA,
        global_role: null,
        needs_selection: false,
      },
    },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
  };
  const res = createResponse();
  let nextCalled = false;

  await requireUnitScope(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonPayload, null);
  assert.deepEqual(req.unitScope, {
    type: 'unit',
    unidadeId: IDS.unitA,
  });
});

test('requireUnitScope permite alvo explícito apenas para ramo global privilegiado do auth-context-v1', async () => {
  const req = {
    path: `/api/unidades/${IDS.unitB}/modulos`,
    originalUrl: `/gestor/api/unidades/${IDS.unitB}/modulos`,
    baseUrl: '/gestor',
    headers: { accept: 'application/json' },
    params: { id: IDS.unitB, unidadeId: IDS.unitB },
    query: {},
    body: {},
    user: { role: 'admin', isMaster: false },
    session: {
      gestorAuthContext: {
        source: 'auth-context-v1',
        global_role: 'admin',
        active_unidade_id: null,
        needs_selection: false,
      },
    },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
  };
  const res = createResponse();
  let nextCalled = false;

  await requireUnitScope(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(req.unitScope, {
    type: 'unit',
    unidadeId: IDS.unitB,
  });
});

test('requireUnitScope não volta ao target explícito quando auth-context-v1 não tem contexto ativo nem papel global', async () => {
  const req = {
    path: `/api/unidades/${IDS.unitB}/modulos`,
    originalUrl: `/gestor/api/unidades/${IDS.unitB}/modulos`,
    baseUrl: '/gestor',
    headers: { accept: 'application/json' },
    params: { id: IDS.unitB, unidadeId: IDS.unitB },
    query: { unidadeId: IDS.unitB },
    body: {},
    user: { role: 'user', isMaster: false, unidade_id: IDS.unitB },
    session: {
      gestorAuthContext: {
        source: 'auth-context-v1',
        global_role: null,
        active_unidade_id: null,
        needs_selection: false,
      },
    },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
  };
  const res = createResponse();
  let nextCalled = false;

  await requireUnitScope(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonPayload, {
    success: false,
    error: 'UNIDADE_ID_REQUIRED',
  });
  assert.equal(req.unitScope, undefined);
});