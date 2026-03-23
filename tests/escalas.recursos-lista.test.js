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
        matriz_id: null,
      },
      {
        _id: filialA1Id,
        codigo: 'U001A',
        nome: 'Filial A1',
        pessoaTipo: 'pj',
        is_principal: false,
        unidade_principal_id: matrizAId,
        matriz_id: matrizAId,
      },
      {
        _id: matrizBId,
        codigo: 'U010',
        nome: 'Matriz B',
        pessoaTipo: 'pj',
        is_principal: true,
        unidade_principal_id: null,
        matriz_id: null,
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
      placa: 'DEF2E34',
      chassi: 'CHASSIA00000000001',
      renavam: '00000000001',
      ano: 2024,
      mod: 2025,
      marca: 'Ford',
      modelo: 'Ranger',
      cor: 'Branco',
      ativo: true,
    },
    filialA1: {
      _id: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
      unidade_id: units.filialA1Id,
      tipo: 'carro',
      placa: 'ABC1D23',
      chassi: 'CHASSIA10000000002',
      renavam: '00000000002',
      ano: 2023,
      mod: 2024,
      marca: 'Volkswagen',
      modelo: 'Gol',
      cor: 'Prata',
      ativo: true,
    },
    matrizB: {
      _id: oid('cccccccccccccccccccccccc'),
      unidade_id: units.matrizBId,
      tipo: 'carro',
      placa: 'XYZ9K88',
      chassi: 'CHASSIB00000000003',
      renavam: '00000000003',
      ano: 2022,
      mod: 2023,
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

async function buildAuthenticatedAgent(app, units) {
  const email = `teste.recursos.lista.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now()).slice(-11).padStart(11, '0');

  await createLoginUser({
    email,
    senha,
    nome: 'Usuario Recursos Lista',
    cpf,
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/escalas/login')
    .type('form')
    .send({ email, senha });

  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);
  return agent;
}

async function getRecursos(agent, query) {
  return agent
    .get('/escalas/api/recursos')
    .query(query);
}

function assertObservableListItem(item) {
  assert.deepEqual(Object.keys(item).sort(), ['descricao', 'id', 'placa', 'unidadeFormatada']);
  assert.equal(typeof item.id, 'string');
  assert.equal(typeof item.placa, 'string');
  assert.equal(typeof item.descricao, 'string');
  assert.equal(typeof item.unidadeFormatada, 'string');
}

test('GET /escalas/api/recursos sem autenticacao retorna 401 com a mensagem atual do handler vencedor', async () => {
  const { app } = await createServer();

  const res = await request(app)
    .get('/escalas/api/recursos')
    .expect(401);

  assert.deepEqual(res.body, { error: 'Não autenticado', success: false });
});

test('GET /escalas/api/recursos sem unidadeId agrega apenas recursos do cluster acessivel do usuario comum', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const recursos = await seedRecursos(units);
  const agent = await buildAuthenticatedAgent(app, units);

  const res = await getRecursos(agent, {});

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 2);
  res.body.forEach(assertObservableListItem);
  assert.deepEqual(
    res.body,
    [
      {
        id: String(recursos.filialA1._id),
        placa: 'ABC1D23',
        descricao: 'Volkswagen Gol',
        unidadeFormatada: 'U001A - Filial A1',
      },
      {
        id: String(recursos.matrizA._id),
        placa: 'DEF2E34',
        descricao: 'Ford Ranger',
        unidadeFormatada: 'U001 - Matriz A',
      },
    ],
  );
});

test('GET /escalas/api/recursos com unidadeId dentro do escopo retorna apenas recursos dessa unidade', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const recursos = await seedRecursos(units);
  const agent = await buildAuthenticatedAgent(app, units);

  const res = await getRecursos(agent, { unidadeId: String(units.filialA1Id) });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    {
      id: String(recursos.filialA1._id),
      placa: 'ABC1D23',
      descricao: 'Volkswagen Gol',
      unidadeFormatada: 'U001A - Filial A1',
    },
  ]);
});

test('GET /escalas/api/recursos com unidadeId fora do escopo retorna 200 com array vazio', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedRecursos(units);
  const agent = await buildAuthenticatedAgent(app, units);

  const res = await getRecursos(agent, { unidadeId: String(units.matrizBId) });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('GET /escalas/api/recursos com placa de 1 caractere preserva o conjunto observavel atual', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedRecursos(units);
  const agent = await buildAuthenticatedAgent(app, units);

  const res = await getRecursos(agent, { placa: 'A' });

  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(res.body.map((item) => item.placa), ['ABC1D23', 'DEF2E34']);
});

test('GET /escalas/api/recursos com placa de 2 ou mais caracteres aplica filtro normalizado por placa', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const recursos = await seedRecursos(units);
  const agent = await buildAuthenticatedAgent(app, units);

  const res = await getRecursos(agent, { placa: 'bc-1' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    {
      id: String(recursos.filialA1._id),
      placa: 'ABC1D23',
      descricao: 'Volkswagen Gol',
      unidadeFormatada: 'U001A - Filial A1',
    },
  ]);
});

test('GET /escalas/api/recursos em sucesso retorna array com shape observavel do handler vencedor atual', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedRecursos(units);
  const agent = await buildAuthenticatedAgent(app, units);

  const res = await getRecursos(agent, {});

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 2);
  res.body.forEach(assertObservableListItem);
});

test('GET /escalas/api/recursos em sucesso preserva ordenacao por placa', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  await seedRecursos(units);
  const agent = await buildAuthenticatedAgent(app, units);

  const res = await getRecursos(agent, {});

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((item) => item.placa), ['ABC1D23', 'DEF2E34']);
});

test('GET /escalas/api/recursos em erro interno retorna 500 com error = erro_interno', async () => {
  const { app } = await createServer();
  const units = await seedUnits();
  const agent = await buildAuthenticatedAgent(app, units);
  const originalFind = Recurso.find;

  Recurso.find = () => {
    throw new Error('falha simulada');
  };

  try {
    const res = await getRecursos(agent, {});

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'erro_interno', success: false });
  } finally {
    Recurso.find = originalFind;
  }
});