import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';

import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';

async function createProbe({ user, query = '' }) {
  const app = express();
  app.use((req, _res, next) => {
    req.app.locals.gestorAuthContextFeatureFlags = { gestor_auth_context_resolver: false };
    req.session = {};
    req.user = user;
    next();
  });

  app.get('/gestor/funcionarios', requireUnitScope, (req, res) => {
    res.status(200).json({ ok: true, unidadeId: req.unitScope?.unidadeId || null });
  });

  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/gestor/funcionarios${query}`);
  const body = await response.json();

  server.close();
  await once(server, 'close');

  return { response, body };
}

test('master/admin global com unidade ativa em req.user passa no requireUnitScope sem query unidade_id', async () => {
  const activeUnidadeId = '65f3000000000000000000a1';

  const { response, body } = await createProbe({
    user: {
      role: 'master',
      isMaster: true,
      unidade_id: activeUnidadeId,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.unidadeId, activeUnidadeId);
});

test('admin global com unidade ativa em req.user passa no requireUnitScope sem query unidade_id', async () => {
  const activeUnidadeId = '65f3000000000000000000a2';

  const { response, body } = await createProbe({
    user: {
      role: 'admin',
      isMaster: false,
      global_role: 'admin',
      unidade_id: activeUnidadeId,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.unidadeId, activeUnidadeId);
});

test('query unidade_id continua tendo prioridade sobre req.user.unidade_id para privilegiado global', async () => {
  const { response, body } = await createProbe({
    user: {
      role: 'master',
      isMaster: true,
      unidade_id: '65f3000000000000000000b1',
    },
    query: '?unidade_id=65f3000000000000000000b2',
  });

  assert.equal(response.status, 200);
  assert.equal(body.unidadeId, '65f3000000000000000000b2');
});

test('diretor sem unidade ativa segue bloqueado com UNIDADE_ID_REQUIRED', async () => {
  const { response, body } = await createProbe({
    user: {
      role: 'diretor',
      isMaster: false,
      unidade_id: '',
    },
  });

  assert.equal(response.status, 400);
  assert.equal(body?.error, 'UNIDADE_ID_REQUIRED');
});

test('usuario comum sem unidade ativa segue bloqueado com UNIDADE_ID_REQUIRED', async () => {
  const { response, body } = await createProbe({
    user: {
      role: 'user',
      isMaster: false,
      unidade_id: '',
    },
  });

  assert.equal(response.status, 400);
  assert.equal(body?.error, 'UNIDADE_ID_REQUIRED');
});
