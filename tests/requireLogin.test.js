import test from 'node:test';
import assert from 'node:assert/strict';
import { requireLogin } from '../src/modules/gestor/app/middlewares/requireLogin.js';
import * as userModel from '../models/user.js';
import * as unidadeModel from '../models/unidade.js';

function mockRes() {
  const r = { statusCode: 200, redirectUrl: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.redirect = (u) => { r.redirectUrl = u; return r; };
  r.set = () => r;
  r.json = (p) => { r.jsonPayload = p; return r; };
  r.end = () => r;
  return r;
}

test('requireLogin redireciona sem sessão', async () => {
  const req = { session: null, originalUrl: '/privado' };
  const res = mockRes();
  let nextCalled = false;

  await requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  // Aceita com ou sem ?r=
  assert.ok(
    res.redirectUrl === '/login' ||
    (typeof res.redirectUrl === 'string' && res.redirectUrl.startsWith('/login')),
    `redirect inesperado: ${res.redirectUrl}`
  );
});

test('requireLogin popula req.user para user master', async () => {
  const originalFindOneUser = userModel.default.findOne;
  const originalFindOneUnidade = unidadeModel.default.findOne;
  try {
    userModel.default.findOne = () => ({
      lean() { return { _id: 'u1', email: 'x@y', role: 'master', foto: null, unidade_id: null }; },
      exec() { return Promise.resolve({ _id: 'u1', email: 'x@y', role: 'master', foto: null, unidade_id: null }); }
    });
    unidadeModel.default.findOne = () => ({
      lean() { return { _id: 'un1', is_principal: true }; },
      exec() { return Promise.resolve({ _id: 'un1', is_principal: true }); }
    });

    const req = { session: { user: { email: 'x@y' } } };
    const res = mockRes();
    let nextCalled = false;

    await requireLogin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(req.user.role, 'master');
    assert.equal(req.user.isMaster, true);
    assert.equal(String(req.user.unidade_id), 'un1');
  } finally {
    userModel.default.findOne = originalFindOneUser;
    unidadeModel.default.findOne = originalFindOneUnidade;
  }
});