import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

test('GET /gestor/api/usuario retorna 401 quando sessão não possui id válido', async () => {
  const { app } = await createServer({ skipDb: true, skipAuth: true });
  const res = await request(app).get('/gestor/api/usuario');

  assert.equal(res.status, 401);
});
