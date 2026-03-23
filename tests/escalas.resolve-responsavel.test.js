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

  return {
    matrizAId,
    docs: [
      {
        _id: matrizAId,
        codigo: 'U001',
        nome: 'Matriz A',
        pessoaTipo: 'pj',
        is_principal: true,
        unidade_principal_id: null,
      },
    ],
  };
}

function buildFixtureIds() {
  return {
    authUserId: oid('aaaaaaaaaaaaaaaaaaaaaaaa'),
    linkedUserId: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
    nomeOnlyUserId: oid('cccccccccccccccccccccccc'),
    usuarioLookupUserId: oid('dddddddddddddddddddddddd'),
    usuarioLookupRawId: oid('abababababababababababab'),
    linkedFuncionarioId: oid('eeeeeeeeeeeeeeeeeeeeeeee'),
    directFuncionarioId: oid('ffffffffffffffffffffffff'),
    usuarioLookupFuncionarioId: oid('121212121212121212121212'),
    notFoundId: oid('343434343434343434343434'),
  };
}

function buildFuncionarioDocs(units, ids) {
  return [
    {
      _id: ids.linkedFuncionarioId,
      codigo: 'FUNC00042',
      unidade_id: units.matrizAId,
      nome: 'Funcionario Vinculado',
      rg: 'RG0001',
      cpf: '11111111111',
      data_nascimento: new Date('1990-01-01T00:00:00.000Z'),
      sexo: 'M',
      email: 'func.vinculado@example.com',
      telefone: '(11) 99999-1111',
      ativo: true,
    },
    {
      _id: ids.directFuncionarioId,
      codigo: 'FUNC00077',
      unidade_id: units.matrizAId,
      nome: 'Funcionario Direto',
      rg: 'RG0002',
      cpf: '22222222222',
      data_nascimento: new Date('1991-02-02T00:00:00.000Z'),
      sexo: 'F',
      email: 'func.direto@example.com',
      telefone: '(11) 99999-2222',
      ativo: true,
    },
    {
      _id: ids.usuarioLookupFuncionarioId,
      codigo: 'FUNC00999',
      unidade_id: units.matrizAId,
      usuario_id: ids.usuarioLookupRawId,
      nome: 'Funcionario Por Usuario',
      rg: 'RG0003',
      cpf: '33333333333',
      data_nascimento: new Date('1992-03-03T00:00:00.000Z'),
      sexo: 'M',
      email: 'func.usuario@example.com',
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

async function seedFuncionarios(units, ids) {
  const docs = buildFuncionarioDocs(units, ids);
  await Funcionario.insertMany(docs);
  return docs;
}

async function createUserDoc({ _id, email, senha, nome, cpf, role, unidadeId = null, funcionarioId = null }) {
  const senhaHash = await bcrypt.hash(senha, 10);
  await User.create({
    _id,
    email,
    senha: senhaHash,
    cpf,
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome,
    unidade_id: unidadeId,
    funcionario_id: funcionarioId,
  });
}

async function seedUsers(units, ids) {
  const senha = 'Senha@123456';

  await createUserDoc({
    _id: ids.authUserId,
    email: 'auth.resolve.responsavel@example.com',
    senha,
    nome: 'Usuario Autenticado',
    cpf: '44444444444',
    role: 'user',
    unidadeId: units.matrizAId,
  });

  await createUserDoc({
    _id: ids.linkedUserId,
    email: 'linked.resolve.responsavel@example.com',
    senha,
    nome: 'Usuario Vinculado',
    cpf: '55555555555',
    role: 'user',
    unidadeId: units.matrizAId,
    funcionarioId: ids.linkedFuncionarioId,
  });

  await createUserDoc({
    _id: ids.nomeOnlyUserId,
    email: 'nome.only.resolve.responsavel@example.com',
    senha,
    nome: 'Usuario So Nome',
    cpf: '66666666666',
    role: 'user',
    unidadeId: units.matrizAId,
  });

  await createUserDoc({
    _id: ids.usuarioLookupUserId,
    email: 'usuario.lookup.resolve.responsavel@example.com',
    senha,
    nome: 'Usuario Lookup',
    cpf: '77777777777',
    role: 'user',
    unidadeId: units.matrizAId,
  });

  return { senha };
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

async function buildAuthenticatedAgent(app) {
  const units = await seedUnits();
  const ids = buildFixtureIds();
  await seedFuncionarios(units, ids);
  const { senha } = await seedUsers(units, ids);
  const agent = await loginForEscalasSession(app, {
    email: 'auth.resolve.responsavel@example.com',
    senha,
  });

  return { agent, units, ids };
}

function assertResolvePayloadShape(body, expectedId) {
  assert.equal(typeof body, 'object');
  assert.ok(body);
  assert.ok('ok' in body);
  assert.ok('id' in body);
  assert.ok('nome' in body);
  assert.ok('codigo' in body);
  assert.ok('display' in body);
  assert.ok('origem' in body);
  assert.equal(body.id, expectedId);
}

test('GET /escalas/api/escalas/resolve-responsavel sem autenticacao retorna 401', async () => {
  const { app } = await createServer();

  const res = await request(app)
    .get('/escalas/api/escalas/resolve-responsavel')
    .query({ id: 'bbbbbbbbbbbbbbbbbbbbbbbb' })
    .expect(401);

  assert.equal(res.body.error, 'Não autenticado');
});

test('GET /escalas/api/escalas/resolve-responsavel sem id retorna 400', async () => {
  const { app } = await createServer();
  const { agent } = await buildAuthenticatedAgent(app);

  const res = await agent
    .get('/escalas/api/escalas/resolve-responsavel')
    .expect(400);

  assert.deepEqual(res.body, { ok: false, error: 'id inválido', success: false });
});

test('GET /escalas/api/escalas/resolve-responsavel com id invalido retorna 400', async () => {
  const { app } = await createServer();
  const { agent } = await buildAuthenticatedAgent(app);

  const res = await agent
    .get('/escalas/api/escalas/resolve-responsavel')
    .query({ id: 'id-invalido' })
    .expect(400);

  assert.deepEqual(res.body, { ok: false, error: 'id inválido', success: false });
});

test('GET /escalas/api/escalas/resolve-responsavel resolve User com funcionario_id', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await agent
    .get('/escalas/api/escalas/resolve-responsavel')
    .query({ id: String(ids.linkedUserId) })
    .expect(200);

  assertResolvePayloadShape(res.body, String(ids.linkedUserId));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.nome, 'Funcionario Vinculado');
  assert.equal(res.body.codigo, 'FUNC00042');
  assert.equal(res.body.display, 'FUNC00042 - Funcionario Vinculado');
  assert.equal(res.body.origem, 'user>funcionario_id');
});

test('GET /escalas/api/escalas/resolve-responsavel resolve User sem funcionario_id usando nome do usuario', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await agent
    .get('/escalas/api/escalas/resolve-responsavel')
    .query({ id: String(ids.nomeOnlyUserId) })
    .expect(200);

  assertResolvePayloadShape(res.body, String(ids.nomeOnlyUserId));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.nome, 'Usuario So Nome');
  assert.equal(res.body.codigo, null);
  assert.equal(res.body.display, 'Usuario So Nome');
  assert.equal(res.body.origem, 'user(nome)');
});

test('GET /escalas/api/escalas/resolve-responsavel resolve Funcionario por _id', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await agent
    .get('/escalas/api/escalas/resolve-responsavel')
    .query({ id: String(ids.directFuncionarioId) })
    .expect(200);

  assertResolvePayloadShape(res.body, String(ids.directFuncionarioId));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.nome, 'Funcionario Direto');
  assert.equal(res.body.codigo, 'FUNC00077');
  assert.equal(res.body.display, 'FUNC00077 - Funcionario Direto');
  assert.equal(res.body.origem, 'funcionario(_id)');
});

test('GET /escalas/api/escalas/resolve-responsavel resolve Funcionario por usuario_id', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await agent
    .get('/escalas/api/escalas/resolve-responsavel')
    .query({ id: String(ids.usuarioLookupRawId) })
    .expect(200);

  assertResolvePayloadShape(res.body, String(ids.usuarioLookupRawId));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.nome, 'Funcionario Por Usuario');
  assert.equal(res.body.codigo, 'FUNC00999');
  assert.equal(res.body.display, 'FUNC00999 - Funcionario Por Usuario');
  assert.equal(res.body.origem, 'funcionario(usuario_id)');
});

test('GET /escalas/api/escalas/resolve-responsavel nao encontrado retorna 200 com origem none', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const notFoundId = String(ids.notFoundId);
  const res = await agent
    .get('/escalas/api/escalas/resolve-responsavel')
    .query({ id: notFoundId })
    .expect(200);

  assert.deepEqual(res.body, {
    ok: true,
    id: notFoundId,
    nome: null,
    codigo: null,
    display: null,
    origem: 'none',
  });
});

test('GET /escalas/api/escalas/resolve-responsavel com ids em lista usa apenas o primeiro', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await agent
    .get('/escalas/api/escalas/resolve-responsavel')
    .query({ ids: `${String(ids.directFuncionarioId)},${String(ids.linkedUserId)}` })
    .expect(200);

  assertResolvePayloadShape(res.body, String(ids.directFuncionarioId));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.nome, 'Funcionario Direto');
  assert.equal(res.body.codigo, 'FUNC00077');
  assert.equal(res.body.display, 'FUNC00077 - Funcionario Direto');
  assert.equal(res.body.origem, 'funcionario(_id)');
});