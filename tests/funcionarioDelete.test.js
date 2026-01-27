import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteFuncionario } from '../src/modules/gestor/app/controllers/funcionarioApiController.js';
import Funcionario from '../models/Funcionario.js';
import User from '../models/user.js';

function mockRes() {
  const r = { statusCode: 200, headers: {}, payload: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.set = (k, v) => { r.headers[k] = v; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.send = (p) => { r.payload = p; return r; };
  r.end = () => r;
  return r;
}

test('deleteFuncionario notFound', async () => {
  const origFind = Funcionario.findById;
  try {
    Funcionario.findById = async () => null;
    const req = { params: { id: '650000000000000000000000' } };
    const res = mockRes();
    await deleteFuncionario(req, res);
    assert.equal(res.statusCode, 404);
  } finally {
    Funcionario.findById = origFind;
  }
});

test('deleteFuncionario master vinculado bloqueado', async () => {
  const origFindFunc = Funcionario.findById;
  const origFindUser = User.findOne;
  try {
    // IDs 24-hex para evitar 400 por ID inválido
    Funcionario.findById = async () => ({ _id: '651000000000000000000000', nome: 'Fulano' });
    // Se o controller consulta por { funcionario_id: req.params.id }, devolver algo coerente
    User.findOne = async (q) => ({ _id: 'u1', role: 'master', funcionario_id: q?.funcionario_id || '651000000000000000000000' });

    const req = { params: { id: '651000000000000000000000' } };
    const res = mockRes();
    await deleteFuncionario(req, res);

    // Alguns projetos usam 403, outros 400; ajuste conforme implementação
    assert.equal([403, 400].includes(res.statusCode), true);
  } finally {
    User.findOne = origFindUser;
    Funcionario.findById = origFindFunc;
  }
});

test('deleteFuncionario success', async () => {
  const origFindFunc = Funcionario.findById;
  const origFindUser = User.findOne;
  const origDel = Funcionario.findByIdAndDelete;
  try {
    Funcionario.findById = async () => ({ _id: '652000000000000000000000', nome: 'Ciclano' });
    User.findOne = async () => null; // sem usuário vinculado
    let deleted = false;
    // Retorne um "doc" simulado para refletir comportamento do Mongoose
    Funcionario.findByIdAndDelete = async () => {
      deleted = true;
      return { _id: '652000000000000000000000' };
    };

    const req = { params: { id: '652000000000000000000000' } };
    const res = mockRes();
    await deleteFuncionario(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload?.success, true);
    // Seja tolerante ao shape da resposta:
    assert.ok(
      res.payload?.data?.deleted === true ||
      res.payload?.data?.id === '652000000000000000000000' ||
      res.payload?.deleted === true
    );
    assert.ok(deleted);
  } finally {
    Funcionario.findById = origFindFunc;
    User.findOne = origFindUser;
    Funcionario.findByIdAndDelete = origDel;
  }
});