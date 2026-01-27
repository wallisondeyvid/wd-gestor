import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '../src/modules/gestor/app/middlewares/requireRole.js';
import { toggleUsuario } from '../src/modules/gestor/app/controllers/userAdminApiController.js';
import User from '../models/user.js'; // ajuste para ../src/models/user.js se necessário

function mockRes() {
  const r = {};
  r.statusCode = 200;
  r.payload = null;
  r.headers = {};
  r.status = (c) => { r.statusCode = c; return r; };
  r.set = (k, v) => { r.headers[k] = v; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.send = (p) => { r.payload = p; return r; };
  r.sendStatus = (c) => { r.statusCode = c; r.payload = undefined; return r; };
  r.end = () => r;
  return r;
}

// Helper para lidar com middleware possivelmente async
async function runMw(mw, req, res) {
  let called = false;
  const next = () => { called = true; };
  const maybePromise = mw(req, res, next);
  if (maybePromise && typeof maybePromise.then === 'function') {
    await maybePromise;
  }
  return called;
}

test('requireRole bloqueia sem user', async () => {
  const mw = requireRole(['admin']);
  const req = {};
  const res = mockRes();
  const called = await runMw(mw, req, res);

  assert.equal(called, false);
  // ajuste aqui se seu middleware usa 401 ou 403
  assert.equal(res.statusCode === 401 || res.statusCode === 403, true);
});

test('requireRole permite master (mesmo sem corresponder à lista)', async () => {
  const mw = requireRole(['admin']);
  const req = { user: { role: 'user', isMaster: true } };
  const res = mockRes();
  const called = await runMw(mw, req, res);

  assert.equal(called, true);
});

test('toggleUsuario bloqueia não master alterando master', async () => {
  const origFind = User.findById;
  try {
    User.findById = async () => ({
      _id: 'u1',
      role: 'master',
      ativo: true,
      async save() { this._saved = true; }
    });

    const req = { params: { id: 'u1' }, user: { role: 'admin', isMaster: false } };
    const res = mockRes();
    await toggleUsuario(req, res);

    // ajuste aqui conforme seu controller (400 vs 403)
    assert.equal(res.statusCode === 400 || res.statusCode === 403, true);
  } finally {
    User.findById = origFind;
  }
});

test('toggleUsuario sucesso admin -> user comum', async () => {
  const origFind = User.findById;
  let saved = false;
  try {
    User.findById = async () => ({
      _id: 'u2',
      role: 'user',
      ativo: true,
      async save() { saved = true; }
    });

    const req = { params: { id: 'u2' }, user: { role: 'admin', isMaster: false } };
    const res = mockRes();
    await toggleUsuario(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload?.success, true);
    assert.equal(saved, true);
  } finally {
    User.findById = origFind;
  }
});