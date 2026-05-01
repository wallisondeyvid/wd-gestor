import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { createServer } from '../src/server/createServer.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';

const OFFLINE_CONTEXT_UNIT_ID = '65f400000000000000000111';

let uniqueCounter = 0;

function nextCounter() {
  uniqueCounter += 1;
  return uniqueCounter;
}

function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}.${nextCounter()}@example.com`;
}

function uniqueCpf() {
  return String(Date.now() + nextCounter()).slice(-11).padStart(11, '0');
}

function normalizeId(value) {
  return String(value || '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function installTeardownSuppression() {
  let shuttingDown = false;
  const originalEmit = process.emit;

  const shouldIgnore = (err) => {
    if (!shuttingDown) return false;
    const message = String(err?.message || err);
    return message.includes('Connection was force closed')
      || message.includes('Unable to deserialize cloned data due to invalid or unsupported version.');
  };

  const onUnhandledRejection = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  const onUncaughtException = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  process.emit = function patchedEmit(eventName, ...args) {
    if (
      (eventName === 'unhandledRejection' || eventName === 'uncaughtException')
      && shouldIgnore(args[0])
    ) {
      return false;
    }
    return originalEmit.call(this, eventName, ...args);
  };

  process.prependListener('unhandledRejection', onUnhandledRejection);
  process.prependListener('uncaughtException', onUncaughtException);

  return {
    startShutdown() {
      shuttingDown = true;
    },
    async remove() {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtException', onUncaughtException);
      process.emit = originalEmit;
    },
  };
}

async function waitForLoadedModelsInit() {
  const initCalls = [];

  for (const connection of mongoose.connections) {
    for (const model of Object.values(connection.models || {})) {
      if (typeof model?.init === 'function') {
        initCalls.push(model.init().catch(() => {}));
      }
    }
  }

  await Promise.all(initCalls);
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  await waitForLoadedModelsInit();
  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function createModuloAndUnits() {
  const moduloGestor = await Modulo.create({
    nome: 'gestor',
    status: 'ativo',
    url_base: '/gestor',
  });

  const unidadeContextual = await Unidade.create({
    nome: `Unidade Contextual ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    is_principal: true,
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  });

  const unidadeForaDoContexto = await Unidade.create({
    nome: `Unidade Fora ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    is_principal: true,
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  });

  return { moduloGestor, unidadeContextual, unidadeForaDoContexto };
}

async function authenticateAgent(app, {
  role,
  globalRole = null,
  membershipUnitId = null,
  nomeBase,
}) {
  const email = uniqueEmail(`recursos-page-${role}`);
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  const payload = {
    email,
    senha: senhaHash,
    cpf: uniqueCpf(),
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: `${nomeBase} ${nextCounter()}`,
  };

  if (globalRole) {
    payload.global_role = globalRole;
  }

  const user = await User.create(payload);

  if (membershipUnitId) {
    await UserMembership.create({
      user_id: user._id,
      unidade_id: membershipUnitId,
      papel_contextual: role === 'diretor' ? 'gestor' : 'user',
      status: 'active',
      origem: 'gestor-recursos-page-runtime-contract',
    });
  }

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });

  assert.equal(
    loginRes.status,
    303,
    `Login ${role} deve concluir no fluxo real; recebido ${loginRes.status} com body ${JSON.stringify(loginRes.body)}`,
  );
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, email };
}

async function createUserOnly({ role, globalRole = null, nomeBase }) {
  const email = uniqueEmail(`recursos-page-${role}-seed`);
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  const payload = {
    email,
    senha: senhaHash,
    cpf: uniqueCpf(),
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: `${nomeBase} ${nextCounter()}`,
  };

  if (globalRole) {
    payload.global_role = globalRole;
  }

  const user = await User.create(payload);
  return { user };
}

async function seedSession(agent, body) {
  const res = await agent
    .get('/__seed-session')
    .query(body)
    .set('Connection', 'close');

  assert.equal(res.status, 204, JSON.stringify(res.body));
}

async function seedOfflineSession(agent) {
  const res = await agent
    .get('/__seed-session')
    .set('Connection', 'close');

  assert.equal(res.status, 204, JSON.stringify(res.body));
}

async function withOnlineHarness(run) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  const prevAuthContextResolverFlag = process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
  process.env.MONGO_MEMORY = '1';
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '1';

  const { app, close, registerErrorHandlers } = await createServer({ skipDb: false, deferErrorHandlers: true });
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: true,
  };
  delete app.locals.gestorAuthContextResolverDeps;
  delete app.locals.gestorAuthContextMaxTimeMS;

  app.get('/__seed-session', (req, res) => {
    const email = String(req.query?.email || uniqueEmail('recursos-page-seed')).trim().toLowerCase();
    const role = String(req.query?.role || 'diretor').trim().toLowerCase();
    const unidadeId = String(req.query?.unidadeId || '').trim();
    const unidadePrincipalId = String(req.query?.unidadePrincipalId || '').trim();
    const authContextUnitId = String(req.query?.authContextUnitId || '').trim();
    const authContextPrincipalId = String(req.query?.authContextPrincipalId || authContextUnitId || '').trim();
    const funcionarioId = String(req.query?.funcionarioId || '').trim();
    const globalRole = String(req.query?.globalRole || '').trim().toLowerCase();

    req.session.user = {
      id: `seed-${role}-${nextCounter()}`,
      _id: `seed-${role}-${nextCounter()}`,
      email,
      role,
      nome: `Seed ${role} ${nextCounter()}`,
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

  registerErrorHandlers();

  const teardownGuard = installTeardownSuppression();

  try {
    const units = await createModuloAndUnits();
    await run({ app, ...units });
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
      if (prevAuthContextResolverFlag === undefined) delete process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      else process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = prevAuthContextResolverFlag;
    }
  }
}

async function withOfflineHarness(run) {
  const prevAuthContextResolverFlag = process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '1';

  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: true,
  };
  delete app.locals.gestorAuthContextResolverDeps;
  delete app.locals.gestorAuthContextMaxTimeMS;

  app.get('/__seed-session', (req, res) => {
    req.session.user = {
      id: '65f400000000000000000110',
      email: 'recursos-page-offline@example.com',
      role: 'diretor',
      nome: 'Diretor Offline Recursos',
      unidade_id: OFFLINE_CONTEXT_UNIT_ID,
      unidade_principal_id: OFFLINE_CONTEXT_UNIT_ID,
      auth_version: 'phase3',
    };
    req.session.gestorAuthContext = {
      source: 'auth-context-v1',
      active_unidade_id: OFFLINE_CONTEXT_UNIT_ID,
      active_unidade_principal_id: OFFLINE_CONTEXT_UNIT_ID,
      needs_selection: false,
    };
    return req.session.save(() => res.status(204).end());
  });

  registerErrorHandlers();

  const teardownGuard = installTeardownSuppression();

  try {
    await run({ app });
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevAuthContextResolverFlag === undefined) delete process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      else process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = prevAuthContextResolverFlag;
    }
  }
}

test('GET /gestor/recursos sem sessão redireciona para o login na borda viva', async () => {
  await withOnlineHarness(async ({ app }) => {
    const res = await request(app)
      .get('/gestor/recursos')
      .set('Accept', 'text/html')
      .redirects(0)
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(String(res.text || ''), /login/i);
  });
});

test('GET /gestor/recursos com usuário não privilegiado e unidade contextual ativa renderiza apenas a unidade do contexto', async () => {
  await withOnlineHarness(async ({ app, unidadeContextual, unidadeForaDoContexto }) => {
    const { agent } = await authenticateAgent(app, {
      role: 'diretor',
      membershipUnitId: unidadeContextual._id,
      nomeBase: 'Diretor Página Recursos',
    });

    const res = await agent
      .get('/gestor/recursos')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, new RegExp(escapeRegExp(normalizeId(unidadeContextual._id))));
    assert.match(res.text, new RegExp(escapeRegExp(unidadeContextual.nome)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(normalizeId(unidadeForaDoContexto._id))));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(unidadeForaDoContexto.nome)));
  });
});

test('GET /gestor/recursos com usuário comum sem unidade ativa continua bloqueado', async () => {
  await withOnlineHarness(async ({ app }) => {
    const agent = request.agent(app);

    await seedSession(agent, {
      email: uniqueEmail('recursos-page-sem-scope'),
      role: 'diretor',
      funcionarioId: '65f400000000000000000112',
    });

    const res = await agent
      .get('/gestor/recursos')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(String(res.text || ''), /login/i);
    assert.doesNotMatch(String(res.text || ''), /<title>Recursos - WDGestor<\/title>/i);
  });
});

test('GET /gestor/recursos com usuário privilegiado sem unidade contextual efetiva renderiza o branch global do bundle', async () => {
  await withOnlineHarness(async ({ app, unidadeContextual, unidadeForaDoContexto }) => {
    const { user } = await createUserOnly({
      role: 'admin',
      globalRole: 'admin',
      nomeBase: 'Admin Global Página Recursos',
    });

    const agent = request.agent(app);

    await seedSession(agent, {
      email: user.email,
      role: 'admin',
      globalRole: 'admin',
    });

    const res = await agent
      .get('/gestor/recursos')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, /<title>Recursos - WDGestor<\/title>/i);
    assert.match(res.text, new RegExp(escapeRegExp(normalizeId(unidadeContextual._id))));
    assert.match(res.text, new RegExp(escapeRegExp(normalizeId(unidadeForaDoContexto._id))));
    assert.match(res.text, new RegExp(escapeRegExp(unidadeContextual.nome)));
    assert.match(res.text, new RegExp(escapeRegExp(unidadeForaDoContexto.nome)));
  });
});

test('GET /gestor/recursos com usuário privilegiado e unidade contextual efetiva continua priorizando o caminho contextual', async () => {
  await withOnlineHarness(async ({ app, unidadeContextual, unidadeForaDoContexto }) => {
    const { user } = await createUserOnly({
      role: 'admin',
      globalRole: 'admin',
      nomeBase: 'Admin Contextual Página Recursos',
    });

    const agent = request.agent(app);

    await seedSession(agent, {
      email: user.email,
      role: 'admin',
      authContextUnitId: normalizeId(unidadeContextual._id),
      authContextPrincipalId: normalizeId(unidadeContextual._id),
      globalRole: 'admin',
    });

    const res = await agent
      .get('/gestor/recursos')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, /<title>Recursos - WDGestor<\/title>/i);
    assert.match(res.text, new RegExp(escapeRegExp(normalizeId(unidadeContextual._id))));
    assert.match(res.text, new RegExp(escapeRegExp(unidadeContextual.nome)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(normalizeId(unidadeForaDoContexto._id))));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(unidadeForaDoContexto.nome)));
  });
});

test('GET /gestor/recursos com banco indisponível preserva o fallback observável da página', async () => {
  await withOfflineHarness(async ({ app }) => {
    const agent = request.agent(app);

    await seedOfflineSession(agent);

    const res = await agent
      .get('/gestor/recursos')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, /<title>Recursos - WDGestor<\/title>/i);
    assert.match(res.text, /Selecione uma unidade\.\.\./i);
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(OFFLINE_CONTEXT_UNIT_ID)));
  });
});