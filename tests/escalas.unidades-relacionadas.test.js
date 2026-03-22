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
  const filialA2Id = oid('333333333333333333333333');
  const matrizBId = oid('444444444444444444444444');

  return {
    matrizAId,
    filialA1Id,
    filialA2Id,
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
        _id: filialA2Id,
        codigo: 'U003',
        nome: 'Filial A2',
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

async function seedUnits() {
  const fixture = buildUnitDocs();
  await Unidade.insertMany(fixture.docs);
  return fixture;
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

// O helper não valida acesso funcional ao Gestor; ele só precisa materializar
// uma sessão autenticada reutilizável pelo módulo Escalas.
async function loginForEscalasSession(app, { email, senha }) {
  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);
  return agent;
}

function assertObservableUnitShape(item) {
  assert.equal(typeof item.id, 'string');
  assert.equal(typeof item.nome, 'string');
  assert.equal(typeof item.is_principal, 'boolean');
  assert.ok('codigo' in item);
  assert.ok(item.codigo === null || typeof item.codigo === 'string');
}

function assertExpectedCluster(res, expected) {
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, expected.codigos.length);
  res.body.data.forEach(assertObservableUnitShape);

  assert.deepEqual(
    res.body.data.map((item) => item.codigo),
    expected.codigos,
  );
  assert.deepEqual(
    res.body.data.map((item) => item.nome),
    expected.nomes,
  );
  assert.deepEqual(
    res.body.data.map((item) => item.is_principal),
    expected.principais,
  );

  for (const codigo of expected.excluidos ?? []) {
    assert.equal(
      res.body.data.some((item) => item.codigo === codigo),
      false,
    );
  }
}

test('GET /escalas/api/unidades-relacionadas sem autenticacao retorna 401', async () => {
  const { app } = await createServer();

  const res = await request(app)
    .get('/escalas/api/unidades-relacionadas')
    .expect(401);

  assert.equal(res.body.error, 'Não autenticado');
  assert.equal(res.body.success, false);
});

test('GET /escalas/api/unidades-relacionadas com usuario master retorna todas as unidades ordenadas', async () => {
  const { app } = await createServer();
  await seedUnits();

  const email = `teste.unidades.master.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now()).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Master Unidades',
    cpf,
    role: 'master',
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/unidades-relacionadas')
    .expect(200);

  assert.equal(res.body.master, true);
  assert.equal(res.body.admin, false);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 4);

  res.body.data.forEach(assertObservableUnitShape);
  assert.deepEqual(
    res.body.data.map((item) => item.codigo),
    ['U001', 'U010', 'U002', 'U003'],
  );
  assert.deepEqual(
    res.body.data.map((item) => item.nome),
    ['Matriz A', 'Matriz B', 'Filial A1', 'Filial A2'],
  );
  assert.deepEqual(
    res.body.data.map((item) => item.is_principal),
    [true, true, false, false],
  );

});

test('GET /escalas/api/unidades-relacionadas com usuario sem unidade retorna apenas matrizes', async () => {
  const { app } = await createServer();
  await seedUnits();

  const email = `teste.unidades.sem-unidade.${Date.now()}@example.com`;
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
    .get('/escalas/api/unidades-relacionadas')
    .expect(200);

  assert.equal(res.body.fallback, 'no-unidade-matrizes');
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 2);

  res.body.data.forEach(assertObservableUnitShape);
  assert.deepEqual(
    res.body.data.map((item) => item.codigo),
    ['U001', 'U010'],
  );
  assert.deepEqual(
    res.body.data.map((item) => item.nome),
    ['Matriz A', 'Matriz B'],
  );
  assert.deepEqual(
    res.body.data.map((item) => item.is_principal),
    [true, true],
  );

});

test('GET /escalas/api/unidades-relacionadas com usuario comum em matriz retorna matriz e filiais do cluster', async () => {
  const { app } = await createServer();
  const fixture = await seedUnits();

  const email = `teste.unidades.matriz.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 2).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Matriz A',
    cpf,
    role: 'user',
    unidadeId: fixture.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/unidades-relacionadas')
    .expect(200);

  assertExpectedCluster(res, {
    codigos: ['U001', 'U002', 'U003'],
    nomes: ['Matriz A', 'Filial A1', 'Filial A2'],
    principais: [true, false, false],
    excluidos: ['U010'],
  });
});

test('GET /escalas/api/unidades-relacionadas com usuario comum em filial sobe para matriz e retorna o cluster', async () => {
  const { app } = await createServer();
  const fixture = await seedUnits();

  const email = `teste.unidades.filial.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 3).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Filial A1',
    cpf,
    role: 'user',
    unidadeId: fixture.filialA1Id,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/unidades-relacionadas')
    .expect(200);

  assertExpectedCluster(res, {
    codigos: ['U001', 'U002', 'U003'],
    nomes: ['Matriz A', 'Filial A1', 'Filial A2'],
    principais: [true, false, false],
    excluidos: ['U010'],
  });
});