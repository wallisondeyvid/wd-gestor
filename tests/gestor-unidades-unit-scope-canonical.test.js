import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import { clearResolveConnectionCache } from '../src/shared/db/resolveConnection.js';
import { resolveModel } from '../src/shared/db/resolveModel.js';
import { createUnitScope } from '../src/shared/unitScope.js';
import {
  findUnidadesByCondLean,
  findUnidadesByCondSelectCodigoNomeOrdenadasLean,
} from '../src/modules/gestor/app/db/api.db.js';
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

function normalizeId(value) {
  return String(value || '');
}

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'unidades-context') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(20000000000 + id).slice(-11);
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

async function createUnit({ nome, principalUnitId = null } = {}) {
  const moduloGestor = await ensureGestorModulo();
  const payload = {
    nome,
    pessoaTipo: 'pj',
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  };

  if (principalUnitId) {
    payload.is_principal = false;
    payload.subunidade = true;
    payload.unidade_principal_id = principalUnitId;
  } else {
    payload.is_principal = true;
  }

  return Unidade.create(payload);
}

function getTenantUnitModel(unidadeId) {
  return resolveModel({
    name: Unidade.modelName,
    schema: Unidade.schema,
    unitScope: createUnitScope({ unidadeId: String(unidadeId) }),
  });
}

function buildTenantUnitDoc(unidade, overrides = {}) {
  return {
    _id: unidade._id,
    codigo: unidade.codigo || String(unidade._id).slice(-6).toUpperCase(),
    nome: unidade.nome,
    pessoaTipo: unidade.pessoaTipo || 'pj',
    ativa: unidade.ativa !== undefined ? unidade.ativa : true,
    modulosAcessiveis: Array.isArray(unidade.modulosAcessiveis) ? unidade.modulosAcessiveis : [],
    is_principal: !!unidade.is_principal,
    subunidade: !!unidade.subunidade,
    unidade_principal_id: unidade.unidade_principal_id || undefined,
    matriz_id: unidade.matriz_id || undefined,
    ...overrides,
  };
}

async function seedTenantUnitCluster(unidadeId, unidades) {
  const UnidadeTenantModel = getTenantUnitModel(unidadeId);
  await UnidadeTenantModel.deleteMany({});
  await UnidadeTenantModel.insertMany(unidades);
}

async function createUser({
  email = buildUniqueEmail('unidades-user'),
  nome = 'Usuario Contextual Unidades',
  role = 'user',
  unidadeId = null,
  globalRole = null,
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

function extractUnidadesFromListResponse(response) {
  if (Array.isArray(response.body?.data?.unidades)) return response.body.data.unidades;
  if (Array.isArray(response.body?.unidades)) return response.body.unidades;
  return [];
}

before(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));

  const built = await createServer({ skipDb: false, deferErrorHandlers: true });
  app = built.app;
  closeServer = built.close;
  app.get('/__seed-session', (req, res) => {
    const email = String(req.query?.email || buildUniqueEmail('unidades-seed')).trim().toLowerCase();
    const role = String(req.query?.role || 'diretor').trim().toLowerCase();
    const unidadeId = String(req.query?.unidadeId || '').trim();
    const unidadePrincipalId = String(req.query?.unidadePrincipalId || '').trim();
    const authContextUnitId = String(req.query?.authContextUnitId || '').trim();
    const authContextPrincipalId = String(req.query?.authContextPrincipalId || authContextUnitId || '').trim();
    const funcionarioId = String(req.query?.funcionarioId || '').trim();
    const globalRole = String(req.query?.globalRole || '').trim().toLowerCase();

    req.session.user = {
      id: `seed-${role}-${nextSequence()}`,
      _id: `seed-${role}-${nextSequence()}`,
      email,
      role,
      nome: `Seed ${role} ${nextSequence()}`,
      ...(funcionarioId ? { funcionario_id: funcionarioId } : {}),
      ...(unidadeId ? { unidade_id: unidadeId } : {}),
      ...(unidadePrincipalId ? { unidade_principal_id: unidadePrincipalId } : {}),
      ...(globalRole ? { global_role: globalRole } : {}),
    };

    if (authContextUnitId) {
      req.session.gestorAuthContext = {
        source: 'auth-context-v1',
        active_unidade_id: authContextUnitId,
        active_unidade_principal_id: authContextPrincipalId,
        needs_selection: false,
        ...(globalRole ? { global_role: globalRole } : {}),
      };
    } else {
      delete req.session.gestorAuthContext;
    }

    return req.session.save(() => res.status(204).end());
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

async function createContextualAgent() {
  const unidadePrincipalA = await createUnit({ nome: `Principal A ${nextSequence()}` });
  const unidadeFilialB = await createUnit({
    nome: `Filial B ${nextSequence()}`,
    principalUnitId: unidadePrincipalA._id,
  });
  const unidadePrincipalC = await createUnit({ nome: `Principal C ${nextSequence()}` });

  const user = await createUser({
    email: buildUniqueEmail('unidades-context-user'),
    nome: 'Gestor Contextual de Unidades',
    role: 'user',
  });

  assert.equal(user.unidade_id, null);

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeFilialB._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-unidades-unit-scope-canonical-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return {
    agent,
    unidadePrincipalA,
    unidadeFilialB,
    unidadePrincipalC,
  };
}

async function seedSession(agent, body) {
  const res = await agent
    .get('/__seed-session')
    .query(body)
    .set('Connection', 'close');

  assert.equal(res.status, 204, JSON.stringify(res.body));
}

test('GET /gestor/unidades usa req.unitScope e ignora unidade legada divergente', async () => {
  const { agent, unidadePrincipalA, unidadeFilialB, unidadePrincipalC } = await createContextualAgent();

  const res = await agent
    .get('/gestor/unidades')
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/i);
  assert.match(res.text, new RegExp(unidadePrincipalA.nome));
  assert.match(res.text, new RegExp(unidadeFilialB.nome));
  assert.doesNotMatch(res.text, new RegExp(unidadePrincipalC.nome));
});

test('GET /gestor/unidades com usuário comum sem unidade ativa continua bloqueado', async () => {
  const agent = request.agent(app);

  await seedSession(agent, {
    email: buildUniqueEmail('unidades-page-sem-scope'),
    role: 'diretor',
    funcionarioId: '65f400000000000000000120',
  });

  const res = await agent
    .get('/gestor/unidades')
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/i);
  assert.match(String(res.text || ''), /login/i);
  assert.doesNotMatch(String(res.text || ''), /<title>Unidades - WDGestor<\/title>/i);
});

test('GET /gestor/unidades com usuário privilegiado sem unidade ativa renderiza o branch global legítimo', async () => {
  const unidadePrincipalA = await createUnit({ nome: `Principal Global A ${nextSequence()}` });
  const unidadeFilialB = await createUnit({
    nome: `Filial Global B ${nextSequence()}`,
    principalUnitId: unidadePrincipalA._id,
  });
  const unidadePrincipalC = await createUnit({ nome: `Principal Global C ${nextSequence()}` });

  const user = await createUser({
    email: buildUniqueEmail('unidades-admin-global'),
    nome: 'Admin Global de Unidades',
    role: 'admin',
    globalRole: 'admin',
  });

  const agent = request.agent(app);

  await seedSession(agent, {
    email: user.email,
    role: 'admin',
    globalRole: 'admin',
  });

  const res = await agent
    .get('/gestor/unidades')
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/i);
  assert.match(res.text, new RegExp(unidadePrincipalA.nome));
  assert.match(res.text, new RegExp(unidadeFilialB.nome));
  assert.match(res.text, new RegExp(unidadePrincipalC.nome));
});

test('GET /gestor/unidades com master apenas por global_role sem unidade ativa renderiza o branch global legítimo', async () => {
  const unidadePrincipalA = await createUnit({ nome: `Principal Master Global A ${nextSequence()}` });
  const unidadeFilialB = await createUnit({
    nome: `Filial Master Global B ${nextSequence()}`,
    principalUnitId: unidadePrincipalA._id,
  });
  const unidadePrincipalC = await createUnit({ nome: `Principal Master Global C ${nextSequence()}` });

  const user = await createUser({
    email: buildUniqueEmail('unidades-master-global-shape'),
    nome: 'Master Global por global_role',
    role: 'user',
    globalRole: 'master',
  });

  const agent = request.agent(app);

  await seedSession(agent, {
    email: user.email,
    role: 'user',
    globalRole: 'master',
  });

  const res = await agent
    .get('/gestor/unidades')
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/i);
  assert.match(res.text, new RegExp(unidadePrincipalA.nome));
  assert.match(res.text, new RegExp(unidadeFilialB.nome));
  assert.match(res.text, new RegExp(unidadePrincipalC.nome));
});

test('GET /gestor/unidades com admin apenas por global_role sem unidade ativa renderiza o branch global legítimo', async () => {
  const unidadePrincipalA = await createUnit({ nome: `Principal Admin Global A ${nextSequence()}` });
  const unidadeFilialB = await createUnit({
    nome: `Filial Admin Global B ${nextSequence()}`,
    principalUnitId: unidadePrincipalA._id,
  });
  const unidadePrincipalC = await createUnit({ nome: `Principal Admin Global C ${nextSequence()}` });

  const user = await createUser({
    email: buildUniqueEmail('unidades-admin-global-shape'),
    nome: 'Admin Global por global_role',
    role: 'user',
    globalRole: 'admin',
  });

  const agent = request.agent(app);

  await seedSession(agent, {
    email: user.email,
    role: 'user',
    globalRole: 'admin',
  });

  const res = await agent
    .get('/gestor/unidades')
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/i);
  assert.match(res.text, new RegExp(unidadePrincipalA.nome));
  assert.match(res.text, new RegExp(unidadeFilialB.nome));
  assert.match(res.text, new RegExp(unidadePrincipalC.nome));
});

test('GET /gestor/unidades com admin legado e req.user.unidade_id sem unidade explicita na request preserva o branch global', async () => {
  const unidadePrincipalA = await createUnit({ nome: `Principal Admin Legado A ${nextSequence()}` });
  const unidadeFilialB = await createUnit({
    nome: `Filial Admin Legado B ${nextSequence()}`,
    principalUnitId: unidadePrincipalA._id,
  });
  const unidadePrincipalC = await createUnit({ nome: `Principal Admin Legado C ${nextSequence()}` });

  const user = await createUser({
    email: buildUniqueEmail('unidades-admin-legado-global'),
    nome: 'Admin Legado Global de Unidades',
    role: 'admin',
    unidadeId: unidadeFilialB._id,
  });

  const agent = request.agent(app);

  await seedSession(agent, {
    email: user.email,
    role: 'admin',
    unidadeId: normalizeId(unidadeFilialB._id),
    unidadePrincipalId: normalizeId(unidadePrincipalA._id),
  });

  const res = await agent
    .get('/gestor/unidades')
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/i);
  assert.match(res.text, new RegExp(unidadePrincipalA.nome));
  assert.match(res.text, new RegExp(unidadeFilialB.nome));
  assert.match(res.text, new RegExp(unidadePrincipalC.nome));
  assert.doesNotMatch(res.text, /UNIDADE_ID_REQUIRED/i);
});

test('GET /gestor/unidades com usuário privilegiado e unidade ativa continua contextual', async () => {
  const unidadePrincipalA = await createUnit({ nome: `Principal Contextual A ${nextSequence()}` });
  const unidadeFilialB = await createUnit({
    nome: `Filial Contextual B ${nextSequence()}`,
    principalUnitId: unidadePrincipalA._id,
  });
  const unidadePrincipalC = await createUnit({ nome: `Principal Contextual C ${nextSequence()}` });

  const user = await createUser({
    email: buildUniqueEmail('unidades-admin-contextual'),
    nome: 'Admin Contextual de Unidades',
    role: 'admin',
    globalRole: 'admin',
  });

  const agent = request.agent(app);

  await seedSession(agent, {
    email: user.email,
    role: 'admin',
    authContextUnitId: normalizeId(unidadeFilialB._id),
    authContextPrincipalId: normalizeId(unidadePrincipalA._id),
    globalRole: 'admin',
  });

  const res = await agent
    .get('/gestor/unidades')
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/i);
  assert.match(res.text, new RegExp(unidadePrincipalA.nome));
  assert.match(res.text, new RegExp(unidadeFilialB.nome));
  assert.doesNotMatch(res.text, new RegExp(unidadePrincipalC.nome));
});

test('GET /gestor/api/unidades hidrata apenas o cluster da unidade ativa e ignora unidade legada divergente', async () => {
  const { agent, unidadePrincipalA, unidadeFilialB, unidadePrincipalC } = await createContextualAgent();

  const res = await agent
    .get('/gestor/api/unidades')
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(res.status, 200);
  const unidades = extractUnidadesFromListResponse(res);
  const nomes = unidades.map((unidade) => unidade.nome).sort();

  assert.equal(unidades.length, 2);
  assert.deepEqual(nomes, [unidadeFilialB.nome, unidadePrincipalA.nome].sort());
  assert.equal(nomes.includes(unidadePrincipalC.nome), false);
});

test('GET /gestor/api/unidades usa o anchor canônico para resolver o cluster em multi-db', async () => {
  const previousMultiDb = process.env.WD_MULTI_DB;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const previousHandshake = process.env.WD_USERDB_HANDSHAKE;

  try {
    const { agent, unidadePrincipalA, unidadeFilialB, unidadePrincipalC } = await createContextualAgent();

    process.env.WD_MULTI_DB = '1';
    process.env.WD_MULTI_DB_ALLOWLIST = [String(unidadePrincipalA._id), String(unidadeFilialB._id)].join(',');
    process.env.WD_USERDB_HANDSHAKE = '0';
    clearResolveConnectionCache();

    const tenantPrincipalName = `${unidadePrincipalA.nome} TENANT`;
    const tenantFilialName = `${unidadeFilialB.nome} TENANT`;

    await seedTenantUnitCluster(unidadeFilialB._id, [
      buildTenantUnitDoc(unidadeFilialB, { nome: tenantFilialName }),
    ]);

    await seedTenantUnitCluster(unidadePrincipalA._id, [
      buildTenantUnitDoc(unidadePrincipalA, { nome: tenantPrincipalName }),
      buildTenantUnitDoc(unidadeFilialB, { nome: tenantFilialName }),
    ]);

    const res = await agent
      .get('/gestor/api/unidades')
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    const unidades = extractUnidadesFromListResponse(res);
    const nomes = unidades.map((unidade) => unidade.nome).sort();

    assert.deepEqual(nomes, [tenantFilialName, tenantPrincipalName].sort());
    assert.equal(nomes.includes(unidadePrincipalA.nome), false);
    assert.equal(nomes.includes(unidadePrincipalC.nome), false);
  } finally {
    clearResolveConnectionCache();

    if (previousMultiDb === undefined) delete process.env.WD_MULTI_DB;
    else process.env.WD_MULTI_DB = previousMultiDb;

    if (previousAllowlist === undefined) delete process.env.WD_MULTI_DB_ALLOWLIST;
    else process.env.WD_MULTI_DB_ALLOWLIST = previousAllowlist;

    if (previousHandshake === undefined) delete process.env.WD_USERDB_HANDSHAKE;
    else process.env.WD_USERDB_HANDSHAKE = previousHandshake;

    clearResolveConnectionCache();
  }
});

test('findUnidadesByCondLean usa o anchor canônico para resolver o cluster em multi-db', async () => {
  const previousMultiDb = process.env.WD_MULTI_DB;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const previousHandshake = process.env.WD_USERDB_HANDSHAKE;

  try {
    const unidadePrincipalA = await createUnit({ nome: `Principal A Bridge ${nextSequence()}` });
    const unidadeFilialB = await createUnit({
      nome: `Filial B Bridge ${nextSequence()}`,
      principalUnitId: unidadePrincipalA._id,
    });

    process.env.WD_MULTI_DB = '1';
    process.env.WD_MULTI_DB_ALLOWLIST = String(unidadePrincipalA._id);
    process.env.WD_USERDB_HANDSHAKE = '0';
    clearResolveConnectionCache();

    await seedTenantUnitCluster(unidadePrincipalA._id, [
      buildTenantUnitDoc(unidadePrincipalA, { nome: `${unidadePrincipalA.nome} TENANT` }),
      buildTenantUnitDoc(unidadeFilialB, { nome: `${unidadeFilialB.nome} TENANT` }),
    ]);

    await Unidade.deleteMany({ _id: { $in: [unidadePrincipalA._id, unidadeFilialB._id] } });

    const unidades = await findUnidadesByCondLean({
      $or: [
        { _id: unidadePrincipalA._id },
        { unidade_principal_id: unidadePrincipalA._id },
        { matriz_id: unidadePrincipalA._id },
      ],
    });

    const ids = unidades.map((entry) => String(entry?._id || '')).sort();
    assert.deepEqual(ids, [String(unidadeFilialB._id), String(unidadePrincipalA._id)].sort());
  } finally {
    clearResolveConnectionCache();

    if (previousMultiDb === undefined) delete process.env.WD_MULTI_DB;
    else process.env.WD_MULTI_DB = previousMultiDb;

    if (previousAllowlist === undefined) delete process.env.WD_MULTI_DB_ALLOWLIST;
    else process.env.WD_MULTI_DB_ALLOWLIST = previousAllowlist;

    if (previousHandshake === undefined) delete process.env.WD_USERDB_HANDSHAKE;
    else process.env.WD_USERDB_HANDSHAKE = previousHandshake;

    clearResolveConnectionCache();
  }
});

test('findUnidadesByCondSelectCodigoNomeOrdenadasLean usa o anchor canônico para resolver o cluster em multi-db', async () => {
  const previousMultiDb = process.env.WD_MULTI_DB;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const previousHandshake = process.env.WD_USERDB_HANDSHAKE;

  try {
    const unidadePrincipalA = await createUnit({ nome: `Principal A Select Bridge ${nextSequence()}` });
    const unidadeFilialB = await createUnit({
      nome: `Filial B Select Bridge ${nextSequence()}`,
      principalUnitId: unidadePrincipalA._id,
    });

    process.env.WD_MULTI_DB = '1';
    process.env.WD_MULTI_DB_ALLOWLIST = String(unidadePrincipalA._id);
    process.env.WD_USERDB_HANDSHAKE = '0';
    clearResolveConnectionCache();

    const tenantPrincipalName = `${unidadePrincipalA.nome} TENANT`;
    const tenantFilialName = `${unidadeFilialB.nome} TENANT`;

    await seedTenantUnitCluster(unidadePrincipalA._id, [
      buildTenantUnitDoc(unidadePrincipalA, { nome: tenantPrincipalName }),
      buildTenantUnitDoc(unidadeFilialB, { nome: tenantFilialName }),
    ]);

    await Unidade.deleteMany({ _id: { $in: [unidadePrincipalA._id, unidadeFilialB._id] } });

    const unidades = await findUnidadesByCondSelectCodigoNomeOrdenadasLean({
      $or: [
        { _id: unidadePrincipalA._id },
        { unidade_principal_id: unidadePrincipalA._id },
        { matriz_id: unidadePrincipalA._id },
      ],
    });

    const ids = unidades.map((entry) => String(entry?._id || '')).sort();
    const nomes = unidades.map((entry) => String(entry?.nome || '')).sort();

    assert.deepEqual(ids, [String(unidadeFilialB._id), String(unidadePrincipalA._id)].sort());
    assert.deepEqual(nomes, [tenantFilialName, tenantPrincipalName].sort());
    assert.equal(nomes.includes(unidadePrincipalA.nome), false);
  } finally {
    clearResolveConnectionCache();

    if (previousMultiDb === undefined) delete process.env.WD_MULTI_DB;
    else process.env.WD_MULTI_DB = previousMultiDb;

    if (previousAllowlist === undefined) delete process.env.WD_MULTI_DB_ALLOWLIST;
    else process.env.WD_MULTI_DB_ALLOWLIST = previousAllowlist;

    if (previousHandshake === undefined) delete process.env.WD_USERDB_HANDSHAKE;
    else process.env.WD_USERDB_HANDSHAKE = previousHandshake;

    clearResolveConnectionCache();
  }
});

test('GET /gestor/api/unidades/:id bloqueia leitura fora do contexto ativo', async () => {
  const { agent, unidadePrincipalA, unidadePrincipalC } = await createContextualAgent();

  const allowedRes = await agent
    .get(`/gestor/api/unidades/${unidadePrincipalA._id}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(allowedRes.status, 200);
  const unidadePermitida = allowedRes.body?.data || allowedRes.body;
  assert.equal(String(unidadePermitida._id), String(unidadePrincipalA._id));

  const blockedRes = await agent
    .get(`/gestor/api/unidades/${unidadePrincipalC._id}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');

  assert.equal(blockedRes.status, 400);
});

test('GET /gestor/editar-unidades/:id bloqueia unidade fora do contexto ativo', async () => {
  const { agent, unidadePrincipalC } = await createContextualAgent();

  const res = await agent
    .get(`/gestor/editar-unidades/${unidadePrincipalC._id}`)
    .set('Accept', 'text/html')
    .set('Connection', 'close');

  assert.equal(res.status, 403);
  assert.match(res.text, /Acesso à unidade não autorizado/);
});