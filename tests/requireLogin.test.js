import test from 'node:test';
import assert from 'node:assert/strict';
import { requireLogin } from '../src/modules/gestor/app/middlewares/requireLogin.js';
import * as userModel from '../models/user.js';
import * as funcionarioModel from '../models/Funcionario.js';
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

test('quando User não é encontrado, mas há funcionario_id válido na sessão, autentica por Funcionario via id', async () => {
  const originalFindOneUser = userModel.default.findOne;
  const originalFindByIdFuncionario = funcionarioModel.default.findById;
  const originalFindOneFuncionario = funcionarioModel.default.findOne;
  try {
    userModel.default.findOne = () => ({
      lean() { return null; },
      exec() { return Promise.resolve(null); }
    });

    funcionarioModel.default.findOne = () => {
      throw new Error('findOne de Funcionario não deve ser chamado no fallback por funcionario_id');
    };

    let findByIdArg = null;
    funcionarioModel.default.findById = (id) => {
      findByIdArg = id;
      return {
        populate(path) {
          assert.equal(path, 'unidade_id funcao_id');
          return {
            _id: '651000000000000000000123',
            nome: 'Funcionario Fallback',
            email: 'funcionario@empresa.com',
            foto: null,
            unidade_id: {
              _id: '661000000000000000000001',
              is_principal: false,
              unidade_principal_id: '661000000000000000000099'
            },
            funcao_id: { nome: 'Operador' }
          };
        }
      };
    };

    const req = {
      session: {
        user: {
          email: 'nao-usar@empresa.com',
          funcionario_id: '651000000000000000000123'
        }
      },
      originalUrl: '/privado'
    };
    const res = mockRes();
    let nextCalled = false;

    await requireLogin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.redirectUrl, null);
    assert.equal(findByIdArg, '651000000000000000000123');
    assert.equal(String(req.user.id), '651000000000000000000123');
    assert.equal(req.user.email, 'funcionario@empresa.com');
    assert.equal(req.user.role, 'user');
    assert.equal(req.user.isMaster, false);
    assert.equal(String(req.user.unidade_id), '661000000000000000000001');
    assert.equal(String(req.user.unidade_principal_id), '661000000000000000000099');
    assert.equal(req.user.funcao, 'Operador');
  } finally {
    userModel.default.findOne = originalFindOneUser;
    funcionarioModel.default.findById = originalFindByIdFuncionario;
    funcionarioModel.default.findOne = originalFindOneFuncionario;
  }
});

test('quando User não é encontrado e não há funcionario_id confiável na sessão, redireciona para login', async () => {
  const originalFindOneUser = userModel.default.findOne;
  const originalFindByIdFuncionario = funcionarioModel.default.findById;
  const originalFindOneFuncionario = funcionarioModel.default.findOne;
  try {
    userModel.default.findOne = () => ({
      lean() { return null; },
      exec() { return Promise.resolve(null); }
    });

    funcionarioModel.default.findOne = () => {
      throw new Error('findOne de Funcionario não deve ser chamado sem funcionario_id confiável');
    };

    funcionarioModel.default.findById = () => {
      throw new Error('findById de Funcionario não deve ser chamado sem funcionario_id confiável');
    };

    const req = {
      session: {
        user: {
          email: 'nao-usar@empresa.com',
          funcionario_id: 'invalido'
        }
      },
      originalUrl: '/privado'
    };
    const res = mockRes();
    let nextCalled = false;

    await requireLogin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.ok(
      res.redirectUrl === '/login' ||
      (typeof res.redirectUrl === 'string' && res.redirectUrl.startsWith('/login')),
      `redirect inesperado: ${res.redirectUrl}`
    );
  } finally {
    userModel.default.findOne = originalFindOneUser;
    funcionarioModel.default.findById = originalFindByIdFuncionario;
    funcionarioModel.default.findOne = originalFindOneFuncionario;
  }
});