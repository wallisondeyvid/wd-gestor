import test from 'node:test';
import assert from 'node:assert/strict';
import { debugSession } from '../src/modules/gestor/app/controllers/debugApiController.js';
import { toggleUsuario } from '../src/modules/gestor/app/controllers/userAdminApiController.js';
import User from '../models/user.js'; // ajuste para ../src/models/user.js se necessário

function mockRes() {
  const res = { statusCode: 200, headers: {}, jsonPayload: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.json = (p) => { res.jsonPayload = p; return res; };
  res.send = (p) => { res.jsonPayload = p; return res; };
  res.end = () => res;
  return res;
}

async function run(controller, req, res) {
  const maybe = controller(req, res);
  if (maybe && typeof maybe.then === 'function') await maybe;
  else await new Promise(r => setImmediate(r)); // dá 1 tick para sync->json
}

test('debugSession sem usuário retorna ok com user null', async () => {
  const req = { headers: {}, sessionID: 'abc123' };
  const res = mockRes();
  await run(debugSession, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonPayload?.success, true);
  assert.equal(res.jsonPayload?.data?.user, null);
});

test('toggleUsuario sem master retorna 400/403', async () => {
  const req = { params: { id: 'fakeid' }, user: { role: 'user', isMaster: false } };
  const res = mockRes();
  await run(toggleUsuario, req, res);
  assert.equal([400, 403].includes(res.statusCode), true); // ajuste conforme seu controller
});

test('toggleUsuario usuário inexistente -> 404', async () => {
  const original = User.findById;
  try {
    User.findById = async () => null;
    const req = { params: { id: '651234567890abcdef123456' }, user: { role: 'master', isMaster: true } };
    const res = mockRes();
    await run(toggleUsuario, req, res);
    assert.equal(res.statusCode, 404);
    // opcionalmente:
    // assert.equal(res.jsonPayload?.success, false);
  } finally {
    User.findById = original;
  }
});