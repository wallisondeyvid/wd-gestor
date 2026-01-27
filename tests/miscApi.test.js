import test from 'node:test';
import assert from 'node:assert/strict';
import { obterCodigoIbge, obterClusterUnidades } from '../src/modules/gestor/app/controllers/miscApiController.js';

function mockRes() {
  const res = { statusCode: 200, headers: {}, payload: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.json = (p) => { res.payload = p; return res; };
  res.send = (p) => { res.payload = p; return res; };
  res.end = () => res;
  return res;
}
function mockReq({ query = {}, params = {}, body = {}, headers = {} } = {}) {
  return { query, params, body, headers };
}
async function run(ctrl, req, res) {
  const maybe = ctrl(req, res);
  if (maybe && typeof maybe.then === 'function') await maybe;
  else await new Promise(r => setImmediate(r));
  return res;
}

test('obterCodigoIbge requer parametros', async () => {
  const req = mockReq({ query: {} });
  const res = mockRes();
  await run(obterCodigoIbge, req, res);
  assert.equal(res.statusCode, 400);
});

test('obterCodigoIbge retorna código São Paulo via dataset', async () => {
  const req = mockReq({ query: { estado: 'SP', cidade: 'São Paulo' } });
  const res = mockRes();
  await run(obterCodigoIbge, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.success, true);
  assert.equal(res.payload?.data?.codigoIbge, '3550308');
  // se sua implementação garante fonte
  assert.equal(res.payload?.data?.fonte, 'dataset');
});

test('obterCodigoIbge case/acento/espacos insensitive', async () => {
  const req = mockReq({ query: { estado: ' sp ', cidade: '  sao   paulo  ' } });
  const res = mockRes();
  await run(obterCodigoIbge, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.data?.codigoIbge, '3550308');
});

test('obterCodigoIbge cidade inexistente retorna vazio', async () => {
  const req = mockReq({ query: { estado: 'SP', cidade: 'Cidade Inexistente XYZ' } });
  const res = mockRes();
  await run(obterCodigoIbge, req, res);
  assert.equal(res.statusCode, 200);
  // tolere variações: '' ou null
  const v = res.payload?.data?.codigoIbge;
  assert.ok(v === '' || v == null);
});

test('obterClusterUnidades sem id retorna vazio', async () => {
  const req = mockReq({ query: {} });
  const res = mockRes();
  await run(obterClusterUnidades, req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload?.data?.unidades, []);
});