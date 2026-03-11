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

function buildUniqueEmail(prefix = 'user') {
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
  email = buildUniqueEmail('usuario-atual'),
  nome = 'Teste Usuario Atual',
  role = 'user',
  globalRole = null,
  unidadeId = null,
  funcionarioId = null,
} = {}) {
  const payload = {
    email,
    senha: passwordHash,
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
    funcionario_id: funcionarioId,
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
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '1';
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: true,
  };
  delete app.locals.gestorAuthContextResolverDeps;
  delete app.locals.gestorAuthContextMaxTimeMS;
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

test('GET /gestor/api/usuario mantém o payload legado quando a flag está desligada', async () => {
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '0';
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: false,
  };

  const user = await createUser({
    email: buildUniqueEmail('legacy-usuario-atual'),
    nome: 'Legacy Usuario Atual',
    role: 'master',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);

  const res = await agent.get('/gestor/api/usuario');

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(String(res.body.data.id), String(user._id));
  assert.equal(res.body.data.email, user.email);
  assert.equal(res.body.data.role, 'master');
  assert.equal(typeof res.body.data.isMaster, 'boolean');
  assert.equal('authenticated' in res.body.data, false);
  assert.equal('source' in res.body.data, false);
  assert.equal('globalRole' in res.body.data, false);
  assert.equal('effectiveRole' in res.body.data, false);
  assert.equal('needsUnitSelection' in res.body.data, false);
  assert.equal('membershipCount' in res.body.data, false);
  assert.equal('activeContext' in res.body.data, false);
  assert.equal('membershipsSummary' in res.body.data, false);
});

test('GET /gestor/api/usuario acrescenta campos de AuthContext com contexto completo', async () => {
  const unidade = await createEnabledUnit(`Unidade Perfil Única ${nextSequence()}`);
  const user = await createUser({
    email: buildUniqueEmail('single-usuario-atual'),
    nome: 'Usuario Atual Contextual',
    role: 'user',
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-auth-user-endpoint-context-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);

  const res = await agent.get('/gestor/api/usuario');

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(String(res.body.data.id), String(user._id));
  assert.equal(res.body.data.email, user.email);
  assert.equal(res.body.data.authenticated, true);
  assert.equal(res.body.data.source, 'auth-context-v1');
  assert.equal(res.body.data.globalRole, null);
  assert.equal(res.body.data.effectiveRole, 'diretor');
  assert.equal(res.body.data.needsUnitSelection, false);
  assert.equal(res.body.data.membershipCount, 1);
  assert.deepEqual(res.body.data.activeContext, {
    membershipId: res.body.data.activeContext.membershipId,
    unidadeId: String(unidade._id),
    unidadePrincipalId: String(unidade._id),
    papelContextual: 'gestor',
    funcionarioId: null,
    legacyRole: 'diretor',
  });
  assert.deepEqual(res.body.data.membershipsSummary, [
    {
      membershipId: res.body.data.membershipsSummary[0].membershipId,
      unidadeId: String(unidade._id),
      unidadePrincipalId: String(unidade._id),
      unidadeNome: unidade.nome,
      unidadeCodigo: unidade.codigo,
      papelContextual: 'gestor',
      legacyRole: 'diretor',
    },
  ]);
  assert.ok('role' in res.body.data);
  assert.ok('unidade_id' in res.body.data);
  assert.ok('funcionario_id' in res.body.data);
});

test('GET /gestor/api/usuario expõe seleção pendente sem fingir activeContext', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Perfil A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Perfil B ${nextSequence()}`);
  const user = await createUser({
    email: buildUniqueEmail('pending-usuario-atual'),
    nome: 'Usuario Atual Pendente',
    role: 'user',
  });

  await UserMembership.insertMany([
    {
      user_id: user._id,
      unidade_id: unidadeA._id,
      papel_contextual: 'gestor',
      status: 'active',
      origem: 'gestor-auth-user-endpoint-context-test',
    },
    {
      user_id: user._id,
      unidade_id: unidadeB._id,
      papel_contextual: 'user',
      status: 'active',
      origem: 'gestor-auth-user-endpoint-context-test',
    },
  ]);

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/login?step=select');

  const res = await agent.get('/gestor/api/usuario');

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(String(res.body.data.id), String(user._id));
  assert.equal(res.body.data.authenticated, true);
  assert.equal(res.body.data.source, 'auth-context-v1');
  assert.equal(res.body.data.globalRole, null);
  assert.equal(res.body.data.effectiveRole, null);
  assert.equal(res.body.data.needsUnitSelection, true);
  assert.equal(res.body.data.membershipCount, 2);
  assert.equal(res.body.data.activeContext, null);
  assert.equal(Array.isArray(res.body.data.membershipsSummary), true);
  assert.equal(res.body.data.membershipsSummary.length, 2);
  assert.deepEqual(
    res.body.data.membershipsSummary.map((membership) => ({
      unidadeId: membership.unidadeId,
      unidadeNome: membership.unidadeNome,
      papelContextual: membership.papelContextual,
      legacyRole: membership.legacyRole,
    })),
    [
      {
        unidadeId: String(unidadeA._id),
        unidadeNome: unidadeA.nome,
        papelContextual: 'gestor',
        legacyRole: 'diretor',
      },
      {
        unidadeId: String(unidadeB._id),
        unidadeNome: unidadeB.nome,
        papelContextual: 'user',
        legacyRole: 'user',
      },
    ],
  );
});