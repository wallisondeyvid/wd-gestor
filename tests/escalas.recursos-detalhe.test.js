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
import Recurso from '../src/core/models/recurso.js';
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

function buildRecursoDocs(units) {
  return {
    matrizA: {
      _id: oid('aaaaaaaaaaaaaaaaaaaaaaaa'),
      unidade_id: units.matrizAId,
      tipo: 'carro',
      placa: 'ABC1D23',
      chassi: 'CHASSIA00000000001',
      renavam: '00000000001',
      ano: 2024,
      mod: 2025,
      marca: 'Ford',
      modelo: 'Ranger',
      cor: 'Branco',
      ativo: true,
    },
    matrizB: {
      _id: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
      unidade_id: units.matrizBId,
      tipo: 'carro',
      placa: 'XYZ9K88',
      chassi: 'CHASSIB00000000002',
      renavam: '00000000002',
      ano: 2023,
      mod: 2024,
      marca: 'Chevrolet',
      modelo: 'S10',
      cor: 'Preto',
      ativo: true,
    },
  };
}

async function seedUnits() {
  const fixture = buildUnitDocs();
  await Unidade.insertMany(fixture.docs);
  return fixture;
}

async function seedRecursos(units) {
  const docs = buildRecursoDocs(units);
  await Recurso.insertMany(Object.values(docs));
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

function assertObservableRecursoData(data) {
  assert.equal(typeof data, 'object');
  assert.ok(data);
  assert.deepEqual(Object.keys(data).sort(), ['id', 'marca', 'modelo', 'nome', 'placa', 'unidade']);
  assert.equal(typeof data.id, 'string');
  assert.equal(typeof data.placa, 'string');
  assert.equal(typeof data.marca, 'string');
  assert.equal(typeof data.modelo, 'string');
  assert.equal(typeof data.nome, 'string');
  assert.equal(typeof data.unidade, 'string');
}

test('GET /escalas/api/recursos/:id sem autenticacao retorna 401', async () => {
  const { app } = await createServer();

  const res = await request(app)
    .get('/escalas/api/recursos/aaaaaaaaaaaaaaaaaaaaaaaa')
    .expect(401);

  assert.equal(res.body.error, 'nao_autenticado');
});

test('GET /escalas/api/recursos/:id para recurso inexistente retorna 404', async () => {
  const { app } = await createServer();
  const units = await seedUnits();

  const email = `teste.recursos.detalhe.inexistente.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now()).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Recurso Inexistente',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/recursos/ffffffffffffffffffffffff')
    .expect(404);

  assert.equal(res.body.error, 'nao_encontrado');
});

test('GET /escalas/api/recursos/:id com master retorna 200 com payload observavel', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const recursos = await seedRecursos(units);

  const email = `teste.recursos.detalhe.master.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 1).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Master Recurso Detalhe',
    cpf,
    role: 'master',
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get(`/escalas/api/recursos/${String(recursos.matrizB._id)}`)
    .expect(200);

  assertObservableRecursoData(res.body);
  assert.equal(res.body.id, String(recursos.matrizB._id));
  assert.equal(res.body.placa, 'XYZ9K88');
  assert.equal(res.body.marca, 'Chevrolet');
  assert.equal(res.body.modelo, 'S10');
  assert.equal(res.body.nome, '');
  assert.equal(res.body.unidade, 'U010 - Matriz B');
});

test('GET /escalas/api/recursos/:id com usuario comum no escopo retorna 200', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const recursos = await seedRecursos(units);

  const email = `teste.recursos.detalhe.cluster.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 2).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Matriz A Recurso',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get(`/escalas/api/recursos/${String(recursos.matrizA._id)}`)
    .expect(200);

  assertObservableRecursoData(res.body);
  assert.equal(res.body.id, String(recursos.matrizA._id));
  assert.equal(res.body.placa, 'ABC1D23');
  assert.equal(res.body.marca, 'Ford');
  assert.equal(res.body.modelo, 'Ranger');
  assert.equal(res.body.nome, '');
  assert.equal(res.body.unidade, 'U001 - Matriz A');
});

test('GET /escalas/api/recursos/:id com usuario comum fora do escopo retorna 403', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const recursos = await seedRecursos(units);

  const email = `teste.recursos.detalhe.fora-escopo.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 3).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Fora Escopo Recurso',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get(`/escalas/api/recursos/${String(recursos.matrizB._id)}`)
    .expect(403);

  assert.equal(res.body.error, 'fora_do_escopo');
});

test('GET /escalas/api/recursos/:id com id malformado preserva o comportamento atual observado', async () => {
  const { app } = await createServer();
  const units = await seedUnits();

  const email = `teste.recursos.detalhe.id-malformado.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now() + 4).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario ID Malformado Recurso',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = await loginForEscalasSession(app, { email, senha });
  const res = await agent
    .get('/escalas/api/recursos/id-malformado')
    .expect(500);

  assert.equal(res.body.error, 'erro_interno');
});