import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.ENABLE_ESCALAS = '1';
process.env.MONGO_MEMORY = '1';

import { createServer } from '../src/server/createServer.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import Funcionario from '../src/core/models/Funcionario.js';
import { disconnectMongo } from '../src/core/db/connect.js';

after(async () => {
  await disconnectMongo({ stopMemoryServer: true });
});

afterEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
  }
});

function oid(hex) {
  return new mongoose.Types.ObjectId(hex);
}

function buildUnitDocs() {
  const matrizAId = oid('111111111111111111111111');
  const filialA1Id = oid('222222222222222222222222');
  const matrizBId = oid('333333333333333333333333');

  return {
    matrizAId,
    filialA1Id,
    matrizBId,
    docs: [
      {
        _id: matrizAId,
        codigo: 'U001',
        nome: 'Matriz A',
        pessoaTipo: 'pj',
        is_principal: true,
        unidade_principal_id: null,
      },
      {
        _id: filialA1Id,
        codigo: 'U002',
        nome: 'Filial A1',
        pessoaTipo: 'pj',
        is_principal: false,
        unidade_principal_id: matrizAId,
      },
      {
        _id: matrizBId,
        codigo: 'U010',
        nome: 'Matriz B',
        pessoaTipo: 'pj',
        is_principal: true,
        unidade_principal_id: null,
      },
    ],
  };
}

function buildFuncionarioDocs(units) {
  return {
    matrizA: {
      _id: oid('aaaaaaaaaaaaaaaaaaaaaaaa'),
      codigo: 'FUNC00042',
      unidade_id: units.matrizAId,
      nome: 'Funcionario Matriz A',
      rg: 'RG0001',
      cpf: '11111111111',
      data_nascimento: new Date('1990-01-01T00:00:00.000Z'),
      sexo: 'M',
      email: 'func.matriz.a@example.com',
      telefone: '(11) 99999-1111',
      ativo: true,
    },
    filialA1: {
      _id: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
      codigo: 'FUNC00077',
      unidade_id: units.filialA1Id,
      nome: 'Funcionario Filial A1',
      rg: 'RG0002',
      cpf: '22222222222',
      data_nascimento: new Date('1991-02-02T00:00:00.000Z'),
      sexo: 'F',
      email: 'func.filial.a1@example.com',
      telefone: '(11) 99999-2222',
      ativo: true,
    },
    matrizB: {
      _id: oid('cccccccccccccccccccccccc'),
      codigo: 'FUNC00999',
      unidade_id: units.matrizBId,
      nome: 'Funcionario Matriz B',
      rg: 'RG0003',
      cpf: '33333333333',
      data_nascimento: new Date('1992-03-03T00:00:00.000Z'),
      sexo: 'M',
      email: 'func.matriz.b@example.com',
      telefone: '(11) 99999-3333',
      ativo: true,
    },
  };
}

async function seedUnits() {
  const fixture = buildUnitDocs();
  await Unidade.insertMany(fixture.docs);
  return fixture;
}

async function seedFuncionarios(units) {
  const docs = buildFuncionarioDocs(units);
  await Funcionario.insertMany(Object.values(docs));
  return docs;
}

async function createLoginUser({ email, senha, nome, cpf, role, unidadeId = null }) {
  const senhaHash = await bcrypt.hash(senha, 10);
  await User.create({
    email,
    senha: senhaHash,
    cpf,
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome,
    unidade_id: unidadeId,
  });
}

async function loginForEscalasSession(app, { email, senha }) {
  const agent = request.agent(app);
  const loginRes = await agent
    .post('/escalas/login')
    .type('form')
    .send({ email, senha });

  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);
  return agent;
}

function assertObservableFuncionarioData(data) {
  assert.equal(typeof data, 'object');
  assert.ok(data);
  assert.equal(typeof data.id, 'string');
  assert.equal(typeof data.nome, 'string');
  assert.ok('cpf' in data);
  assert.ok('codigo' in data);
  assert.ok('unidade_id' in data);
  assert.ok('unidade_nome' in data);
  assert.ok('unidade_codigo' in data);
  assert.ok(data.cpf === null || typeof data.cpf === 'string');
  assert.ok(data.codigo === null || typeof data.codigo === 'string');
  assert.ok(data.unidade_id === null || typeof data.unidade_id === 'string');
  assert.ok(data.unidade_nome === null || typeof data.unidade_nome === 'string');
  assert.ok(data.unidade_codigo === null || typeof data.unidade_codigo === 'string');
}

test('GET /escalas/api/funcionarios/busca-codigo sem autenticacao retorna 401', async () => {
  const { app } = await createServer();

  const res = await request(app)
    .get('/escalas/api/funcionarios/busca-codigo')
    .query({ codigo: 'FUNC00042' })
    .expect(401);

  assert.equal(res.body.error, 'Não autenticado');
});

test('GET /escalas/api/funcionarios/busca-codigo sem codigo e sem id retorna 400', async () => {
  const { app } = await createServer();
  const units = await seedUnits();

  const email = `teste.busca-codigo.param.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now()).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Parametros',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/busca-codigo')
    .expect(400);

  assert.equal(res.body.error, 'Parâmetro codigo ou id obrigatório');
});

test('GET /escalas/api/funcionarios/busca-codigo com master por id retorna 200 com payload observavel completo', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const funcionarios = await seedFuncionarios(units);

  const email = `teste.busca-codigo.master.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 1).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Master Busca Codigo',
    cpf,
    role: 'master',
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/busca-codigo')
    .query({ id: String(funcionarios.matrizB._id) })
    .expect(200);

  assertObservableFuncionarioData(res.body.data);
  assert.equal(res.body.data.id, String(funcionarios.matrizB._id));
  assert.equal(res.body.data.nome, 'Funcionario Matriz B');
  assert.equal(res.body.data.cpf, '33333333333');
  assert.equal(res.body.data.codigo, 'FUNC00999');
  assert.equal(res.body.data.unidade_id, String(units.matrizBId));
  assert.equal(res.body.data.unidade_nome, 'Matriz B');
  assert.equal(res.body.data.unidade_codigo, 'U010');
});

test('GET /escalas/api/funcionarios/busca-codigo com usuario comum por id do cluster A retorna 200', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const funcionarios = await seedFuncionarios(units);

  const email = `teste.busca-codigo.cluster-id.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 2).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Cluster ID',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/busca-codigo')
    .query({ id: String(funcionarios.filialA1._id) })
    .expect(200);

  assertObservableFuncionarioData(res.body.data);
  assert.equal(res.body.data.id, String(funcionarios.filialA1._id));
  assert.equal(res.body.data.codigo, 'FUNC00077');
  assert.equal(res.body.data.unidade_nome, 'Filial A1');
  assert.equal(res.body.data.unidade_codigo, 'U002');
});

test('GET /escalas/api/funcionarios/busca-codigo com usuario comum por codigo trim e case-insensitive retorna 200', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const funcionarios = await seedFuncionarios(units);

  const email = `teste.busca-codigo.codigo.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 3).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Codigo',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/busca-codigo')
    .query({ codigo: '  func00042  ' })
    .expect(200);

  assertObservableFuncionarioData(res.body.data);
  assert.equal(res.body.data.id, String(funcionarios.matrizA._id));
  assert.equal(res.body.data.codigo, 'FUNC00042');
  assert.equal(res.body.data.nome, 'Funcionario Matriz A');
});

test('GET /escalas/api/funcionarios/busca-codigo com codigo de 11 digitos resolve via CPF e retorna 200', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const funcionarios = await seedFuncionarios(units);

  const email = `teste.busca-codigo.cpf.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 4).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario CPF',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/busca-codigo')
    .query({ codigo: '11111111111' })
    .expect(200);

  assertObservableFuncionarioData(res.body.data);
  assert.equal(res.body.data.id, String(funcionarios.matrizA._id));
  assert.equal(res.body.data.cpf, '11111111111');
  assert.equal(res.body.data.codigo, 'FUNC00042');
});

test('GET /escalas/api/funcionarios/busca-codigo com funcionario inexistente retorna 404', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedFuncionarios(units);

  const email = `teste.busca-codigo.inexistente.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 5).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Inexistente',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/busca-codigo')
    .query({ codigo: 'FUNC99999' })
    .expect(404);

  assert.equal(res.body.error, 'Funcionário não encontrado');
});

test('GET /escalas/api/funcionarios/busca-codigo com usuario comum buscando funcionario da Matriz B retorna 404', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const funcionarios = await seedFuncionarios(units);

  const email = `teste.busca-codigo.fora-cluster.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 6).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Fora Cluster',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/busca-codigo')
    .query({ id: String(funcionarios.matrizB._id) })
    .expect(404);

  assert.equal(res.body.error, 'Funcionário não encontrado');
});