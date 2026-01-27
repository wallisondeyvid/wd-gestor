import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockRes, createMockReq } from './test-helpers.js';
import { listarCnaes } from '../src/modules/gestor/app/controllers/cnaeApiController.js';
import { listarDispositivosApi } from '../src/modules/gestor/app/controllers/biometriaApiController.js';

// Helper que executa e aguarda o controller (caso retorne Promise)
async function runController(controller, req, res) {
  const maybePromise = controller(req, res);
  if (maybePromise && typeof maybePromise.then === 'function') {
    await maybePromise;
  } else {
    // Se o controller for callback-style síncrono, ainda damos um tick
    await new Promise((r) => setImmediate(r));
  }
  return res;
}

test('listarCnaes retorna estrutura padrao success', async () => {
  const req = createMockReq({ page: '1', limit: '5' }); // req.query = { page, limit }
  const res = createMockRes();
  await runController(listarCnaes, req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.success, true);
  assert.ok(Array.isArray(res.body?.data));
  // Se houver paginação, opcional:
  // assert.match(res.body?.meta?.page?.toString() ?? '', /^[0-9]+$/);
});

test('listarDispositivosApi sempre retorna success + array', async () => {
  const req = createMockReq();
  const res = createMockRes();
  await runController(listarDispositivosApi, req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.success, true);
  assert.ok(Array.isArray(res.body?.data));
});