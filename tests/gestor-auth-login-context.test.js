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
  email = buildUniqueEmail('login'),
  nome = 'Teste Login AuthContext',
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
  app.get('/__tests__/session-state', (req, res) => {
    return res.status(200).json({
      sessionUser: req.session?.user || null,
      gestorAuthContext: req.session?.gestorAuthContext || null,
    });
  });
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

test('POST /gestor/login mantém o fluxo legado quando a flag está desligada', async () => {
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '0';
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: false,
  };

  const user = await createUser({
    email: buildUniqueEmail('legacy-master'),
    nome: 'Legacy Master',
    role: 'master',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });

  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  const contextRes = await agent.get('/gestor/auth/context');
  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.authenticated, true);
  assert.equal(contextRes.body.source, 'legacy');
});

test('POST /gestor/login usa global_role para autenticar sem contexto ativo', async () => {
  const user = await createUser({
    email: buildUniqueEmail('global-admin'),
    nome: 'Global Admin',
    role: 'user',
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });

  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  const contextRes = await agent.get('/gestor/auth/context');
  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.source, 'auth-context-v1');
  assert.equal(contextRes.body.globalRole, 'admin');
  assert.equal(contextRes.body.membershipCount, 0);
  assert.equal(contextRes.body.needsUnitSelection, false);
  assert.equal(contextRes.body.activeContext, null);
  assert.equal(contextRes.body.effectiveRole, 'admin');
});

test('POST /gestor/login contextualiza automaticamente usuário com um único membership ativo', async () => {
  const unidade = await createEnabledUnit(`Unidade Login Única ${nextSequence()}`);
  const user = await createUser({
    email: buildUniqueEmail('single-membership'),
    nome: 'Diretor Contextual',
    role: 'user',
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-auth-login-context-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });

  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  const contextRes = await agent.get('/gestor/auth/context');
  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.source, 'auth-context-v1');
  assert.equal(contextRes.body.globalRole, null);
  assert.equal(contextRes.body.membershipCount, 1);
  assert.equal(contextRes.body.needsUnitSelection, false);
  assert.equal(contextRes.body.effectiveRole, 'diretor');
  assert.equal(contextRes.body.activeContext.unidadeId, String(unidade._id));
  assert.equal(contextRes.body.activeContext.unidadePrincipalId, String(unidade._id));
  assert.equal(contextRes.body.activeContext.legacyRole, 'diretor');
});

test('POST /gestor/login mantém sessão autenticada sem contexto falso para múltiplos memberships ativos', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Login A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Login B ${nextSequence()}`);
  const user = await createUser({
    email: buildUniqueEmail('multi-membership'),
    nome: 'Usuário Multi Unidade',
    role: 'user',
    unidadeId: unidadeA._id,
    funcionarioId: '507f191e810c19729de860dd',
  });

  await UserMembership.insertMany([
    {
      user_id: user._id,
      unidade_id: unidadeA._id,
      papel_contextual: 'gestor',
      status: 'active',
      origem: 'gestor-auth-login-context-test',
    },
    {
      user_id: user._id,
      unidade_id: unidadeB._id,
      papel_contextual: 'gestor',
      status: 'active',
      origem: 'gestor-auth-login-context-test',
    },
  ]);

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });

  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/login?step=select');

  const contextRes = await agent.get('/gestor/auth/context');
  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.source, 'auth-context-v1');
  assert.equal(contextRes.body.globalRole, null);
  assert.equal(contextRes.body.membershipCount, 2);
  assert.equal(contextRes.body.needsUnitSelection, true);
  assert.equal(contextRes.body.activeContext, null);
  assert.equal(contextRes.body.effectiveRole, null);

  const sessionStateRes = await agent.get('/__tests__/session-state');
  assert.equal(sessionStateRes.status, 200);
  assert.equal(sessionStateRes.body.sessionUser.auth_version, 'phase3');
  assert.equal('unidade_id' in sessionStateRes.body.sessionUser, false);
  assert.equal('unidade_principal_id' in sessionStateRes.body.sessionUser, false);
  assert.equal('funcionario_id' in sessionStateRes.body.sessionUser, false);
  assert.equal(sessionStateRes.body.gestorAuthContext.needs_selection, true);
  assert.equal(sessionStateRes.body.gestorAuthContext.active_unidade_id ?? null, null);
});

test('POST /gestor/login falha com erro explícito quando não há global_role nem membership ativo', async () => {
  const user = await createUser({
    email: buildUniqueEmail('sem-contexto'),
    nome: 'Usuário Sem Contexto',
    role: 'user',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });

  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/login?erro=contexto');

  const contextRes = await agent.get('/gestor/auth/context');
  assert.equal(contextRes.status, 401);
  assert.equal(contextRes.body.ok, false);
  assert.equal(contextRes.body.authenticated, false);
  assert.equal(contextRes.body.source, 'auth-context-v1');
});