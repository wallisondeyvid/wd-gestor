import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';

process.env.NODE_ENV = 'test';
process.env.MONGO_MEMORY = '1';

const PASSWORD = 'Senha@123456';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'check-email') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

async function ensureGestorModulo() {
  const existing = await Modulo.findOne({ nome: 'gestor' });
  if (existing) return existing;

  return Modulo.create({
    nome: 'gestor',
    status: 'ativo',
    url_base: '/gestor',
  });
}

async function createEnabledUnit(nome) {
  const modulo = await ensureGestorModulo();
  return Unidade.create({
    nome,
    pessoaTipo: 'pj',
    is_principal: true,
    modulosAcessiveis: [modulo._id],
  });
}

async function createUser({
  email = buildUniqueEmail('usuario-check-email'),
  nome = 'Usuário Check Email',
  role = 'user',
  globalRole = null,
  unidadeId = null,
} = {}) {
  const payload = {
    email,
    senha: passwordHash,
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  };

  if (globalRole) {
    payload.global_role = globalRole;
  }

  return User.create(payload);
}

async function login(agent, { email, senha = PASSWORD } = {}) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

async function createAdminAgent() {
  const admin = await createUser({
    email: buildUniqueEmail('admin-check-email'),
    nome: 'Admin Check Email',
    role: 'admin',
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: admin.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');
  return { agent, admin };
}

before(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));

  const built = await createServer({ skipDb: false, deferErrorHandlers: true });
  app = built.app;
  closeServer = built.close;
  if (typeof built.registerErrorHandlers === 'function') {
    await Promise.resolve(built.registerErrorHandlers());
  }
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

after(async () => {
  try {
    if (typeof closeServer === 'function') {
      await closeServer({ stopMemoryServer: true });
      return;
    }
    await disconnectMongo({ stopMemoryServer: true });
  } catch {}
});

test('GET /gestor/api/usuarios/check-email informa quando o e-mail ainda não existe globalmente', async () => {
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('novo-precheck');

  const res = await agent.get('/gestor/api/usuarios/check-email').query({ email });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.exists, false);
  assert.equal(res.body.data?.email, email);
  assert.deepEqual(res.body.data?.membershipsSummary, []);
  assert.deepEqual(res.body.data?.blockedUnidadeIds, []);
});

test('GET /gestor/api/usuarios/check-email retorna resumo do usuário global e das unidades já vinculadas', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Check A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Check B ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const funcionarioId = new mongoose.Types.ObjectId();

  const existingUser = await createUser({
    email: buildUniqueEmail('existente-precheck'),
    nome: 'Usuário Existente Precheck',
    role: 'user',
    unidadeId: unidadeA._id,
  });

  await UserMembership.create([
    {
      user_id: existingUser._id,
      unidade_id: unidadeA._id,
      papel_contextual: 'user',
      status: 'active',
      origem: 'gestor-user-check-email-test',
    },
    {
      user_id: existingUser._id,
      unidade_id: unidadeB._id,
      papel_contextual: 'gestor',
      status: 'inactive',
      funcionario_id: funcionarioId,
      origem: 'gestor-user-check-email-test',
    },
  ]);

  const res = await agent.get('/gestor/api/usuarios/check-email').query({ email: existingUser.email });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.exists, true);
  assert.equal(res.body.data?.user?.id, String(existingUser._id));
  assert.equal(res.body.data?.user?.nome, existingUser.nome);
  assert.equal(res.body.data?.user?.role, existingUser.role);
  assert.equal(res.body.data?.membershipsCount, 2);
  assert.equal(res.body.data?.membershipsSummary?.length, 2);
  assert.deepEqual(
    res.body.data?.blockedUnidadeIds?.sort(),
    [String(unidadeA._id), String(unidadeB._id)].sort()
  );
  assert.match(JSON.stringify(res.body.data?.membershipsSummary || []), /Unidade Check A/);
  assert.match(JSON.stringify(res.body.data?.membershipsSummary || []), /Unidade Check B/);
  assert.match(JSON.stringify(res.body.data?.membershipsSummary || []), /gestor/);
  assert.match(JSON.stringify(res.body.data?.membershipsSummary || []), /inactive/);
  assert.match(JSON.stringify(res.body.data?.membershipsSummary || []), new RegExp(String(funcionarioId)));
});
