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
  const matrizBId = oid('333333333333333333333333');

  return {
    matrizAId,
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
    matrizA2: {
      _id: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
      codigo: 'FUNC00077',
      unidade_id: units.matrizAId,
      nome: 'Funcionario Matriz A Dois',
      rg: 'RG0002',
      cpf: '22222222222',
      data_nascimento: new Date('1991-02-02T00:00:00.000Z'),
      sexo: 'F',
      email: 'func.matriz.a2@example.com',
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

function assertObservableFuncionarioShape(item) {
  assert.equal(typeof item, 'object');
  assert.ok(item);
  assert.equal(typeof item.id, 'string');
  assert.ok('nome' in item);
  assert.ok('cpf' in item);
  assert.ok('codigo' in item);
  assert.ok('unidade_id' in item);
  assert.ok('unidade_nome' in item);
  assert.ok('unidade_codigo' in item);
  assert.ok(item.nome === null || typeof item.nome === 'string');
  assert.ok(item.cpf === null || typeof item.cpf === 'string');
  assert.ok(item.codigo === null || typeof item.codigo === 'string');
  assert.ok(item.unidade_id === null || typeof item.unidade_id === 'string');
  assert.ok(item.unidade_nome === null || typeof item.unidade_nome === 'string');
  assert.ok(item.unidade_codigo === null || typeof item.unidade_codigo === 'string');
}

function sortById(items) {
  return [...items].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

test('GET /escalas/api/funcionarios/por-ids sem autenticacao retorna 401', async () => {
  const { app } = await createServer();

  const res = await request(app)
    .get('/escalas/api/funcionarios/por-ids')
    .query({ ids: 'aaaaaaaaaaaaaaaaaaaaaaaa' })
    .expect(401);

  assert.equal(res.body.error, 'Não autenticado');
});

test('GET /escalas/api/funcionarios/por-ids sem ids retorna 200 com data vazio', async () => {
  const { app } = await createServer();
  const units = await seedUnits();

  const email = `teste.funcionarios.por-ids.sem-ids.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now()).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Por IDs Sem IDs',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/por-ids')
    .expect(200);

  assert.deepEqual(res.body, { success: true, data: [] });
});

test('GET /escalas/api/funcionarios/por-ids com ids invalidos retorna 200 com data vazio', async () => {
  const { app } = await createServer();
  const units = await seedUnits();

  const email = `teste.funcionarios.por-ids.invalidos.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 1).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Por IDs Invalidos',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/por-ids')
    .query({ ids: 'id-invalido,123,abc' })
    .expect(200);

  assert.deepEqual(res.body, { success: true, data: [] });
});

test('GET /escalas/api/funcionarios/por-ids com um id valido retorna item observavel', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const funcionarios = await seedFuncionarios(units);

  const email = `teste.funcionarios.por-ids.um.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 2).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Por IDs Um',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/por-ids')
    .query({ ids: String(funcionarios.matrizA._id) })
    .expect(200);

  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  assertObservableFuncionarioShape(res.body.data[0]);
  assert.equal(res.body.data[0].id, String(funcionarios.matrizA._id));
  assert.equal(res.body.data[0].nome, 'Funcionario Matriz A');
  assert.equal(res.body.data[0].cpf, '11111111111');
  assert.equal(res.body.data[0].codigo, 'FUNC00042');
  assert.equal(res.body.data[0].unidade_id, String(units.matrizAId));
  assert.equal(res.body.data[0].unidade_nome, 'Matriz A');
  assert.equal(res.body.data[0].unidade_codigo, 'U001');
});

test('GET /escalas/api/funcionarios/por-ids com multiplos ids validos retorna os itens corretos', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const funcionarios = await seedFuncionarios(units);

  const email = `teste.funcionarios.por-ids.multiplos.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 3).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Por IDs Multiplos',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/por-ids')
    .query({ ids: `${String(funcionarios.matrizA._id)},${String(funcionarios.matrizA2._id)}` })
    .expect(200);

  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 2);
  const ordered = sortById(res.body.data);
  ordered.forEach(assertObservableFuncionarioShape);
  assert.deepEqual(ordered.map((item) => item.codigo).sort(), ['FUNC00042', 'FUNC00077']);
});

test('GET /escalas/api/funcionarios/por-ids com mistura de ids validos e invalidos preserva apenas os validos', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const funcionarios = await seedFuncionarios(units);

  const email = `teste.funcionarios.por-ids.misto.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 4).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Por IDs Mistos',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/por-ids')
    .query({ ids: `${String(funcionarios.matrizA._id)},id-invalido,${String(funcionarios.matrizA2._id)}` })
    .expect(200);

  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 2);
  assert.deepEqual(res.body.data.map((item) => item.codigo).sort(), ['FUNC00042', 'FUNC00077']);
});

test('GET /escalas/api/funcionarios/por-ids preserva o comportamento atual sem filtro explicito de escopo', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const funcionarios = await seedFuncionarios(units);

  const email = `teste.funcionarios.por-ids.sem-escopo.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 5).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Por IDs Sem Filtro de Escopo',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/funcionarios/por-ids')
    .query({ ids: `${String(funcionarios.matrizA._id)},${String(funcionarios.matrizB._id)}` })
    .expect(200);

  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 2);
  assert.deepEqual(res.body.data.map((item) => item.codigo).sort(), ['FUNC00042', 'FUNC00999']);
});