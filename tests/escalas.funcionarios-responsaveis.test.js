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
  return [
    {
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
    {
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
    {
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
  ];
}

async function seedUnits() {
  const fixture = buildUnitDocs();
  await Unidade.insertMany(fixture.docs);
  return fixture;
}

async function seedFuncionarios(units) {
  const docs = buildFuncionarioDocs(units);
  await Funcionario.insertMany(docs);
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

function assertObservableFuncionarioShape(item) {
  assert.equal(typeof item.id, 'string');
  assert.equal(typeof item.nome, 'string');
  assert.ok('codigo' in item);
  assert.ok('cpf' in item);
  assert.ok('unidade_nome' in item);
  assert.ok(item.codigo === null || typeof item.codigo === 'string');
  assert.ok(item.cpf === null || typeof item.cpf === 'string');
  assert.ok(item.unidade_nome === null || typeof item.unidade_nome === 'string');
}

function assertCodes(res, expectedCodes) {
  assert.ok(Array.isArray(res.body.data));
  res.body.data.forEach(assertObservableFuncionarioShape);
  assert.deepEqual(
    res.body.data.map((item) => item.codigo).sort(),
    [...expectedCodes].sort(),
  );
}

test('GET /escalas/api/funcionarios-responsaveis sem autenticacao retorna 401', async () => {
  const { app } = await createServer();

  const res = await request(app)
    .get('/escalas/api/funcionarios-responsaveis')
    .expect(401);

  assert.equal(res.body.error, 'Não autenticado');
});

test('GET /escalas/api/funcionarios-responsaveis com master retorna resultado global observavel', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedFuncionarios(units);

  const email = `teste.funcionarios.master.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now()).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Master Funcionarios',
    cpf,
    role: 'master',
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios-responsaveis')
    .expect(200);

  assertCodes(res, ['FUNC00042', 'FUNC00077', 'FUNC00999']);
});

test('GET /escalas/api/funcionarios-responsaveis com usuario sem unidade_id retorna data vazio', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedFuncionarios(units);

  const email = `teste.funcionarios.sem-unidade.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 1).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Sem Unidade',
    cpf,
    role: 'user',
    unidadeId: null,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios-responsaveis')
    .expect(200);

  assert.ok(Array.isArray(res.body.data));
  assert.deepEqual(res.body.data, []);
  assert.equal(res.body.success, true);
});

test('GET /escalas/api/funcionarios-responsaveis com usuario comum em cluster A retorna apenas cluster A', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedFuncionarios(units);

  const email = `teste.funcionarios.cluster-a.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 2).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Matriz A',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios-responsaveis')
    .expect(200);

  assertCodes(res, ['FUNC00042', 'FUNC00077']);
  assert.equal(res.body.data.some((item) => item.codigo === 'FUNC00999'), false);
});

test('GET /escalas/api/funcionarios-responsaveis com unidade fora do cluster retorna data vazio', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedFuncionarios(units);

  const email = `teste.funcionarios.unidade-fora.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 3).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Matriz A 2',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios-responsaveis')
    .query({ unidade: String(units.matrizBId) })
    .expect(200);

  assert.ok(Array.isArray(res.body.data));
  assert.deepEqual(res.body.data, []);
  assert.equal(res.body.success, true);
});

test('GET /escalas/api/funcionarios-responsaveis com incluirFiliais expande o cluster da unidade consultada', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedFuncionarios(units);

  const email = `teste.funcionarios.incluir-filiais.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 4).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Matriz A 3',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios-responsaveis')
    .query({ unidade: String(units.matrizAId), incluirFiliais: '1' })
    .expect(200);

  assertCodes(res, ['FUNC00042', 'FUNC00077']);
  assert.equal(res.body.data.some((item) => item.codigo === 'FUNC00999'), false);
});

test('GET /escalas/api/funcionarios-responsaveis com codigo numerico puro resolve o item esperado sem romper escopo', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedFuncionarios(units);

  const email = `teste.funcionarios.codigo.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 5).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Matriz A 4',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios-responsaveis')
    .query({ codigo: '42' })
    .expect(200);

  assertCodes(res, ['FUNC00042']);
  assert.equal(res.body.data[0].nome, 'Funcionario Matriz A');
  assert.equal(res.body.data[0].cpf, '11111111111');
  assert.equal(res.body.data[0].unidade_nome, 'Matriz A');
});