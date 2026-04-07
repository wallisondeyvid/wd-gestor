import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { buildGestorApp } from '../src/modules/gestor/app/gestor-app.js';

const gestorApp = buildGestorApp();

test('POST /api/funcionarios core create: sem sessão retorna 401', async () => {
  const response = await request(gestorApp)
    .post('/api/funcionarios')
    .field('unidade_id', 'unit-core-401');

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'UNAUTHORIZED');
});