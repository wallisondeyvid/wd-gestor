import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test from 'node:test';
import request from 'supertest';

import CondMsgGroup from '../src/core/models/cond_msg_group.js';
import CondMsgMailbox from '../src/core/models/cond_msg_mailbox.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { createServer } from '../src/server/createServer.js';

const PASSWORD = 'Senha@123456';
const UNIDADE_ID = '507f1f77bcf86cd799439010';
const OUTRA_UNIDADE_ID = '507f1f77bcf86cd799439099';

let sequence = 0;
let passwordHashPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'groups-shared-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

async function getPasswordHash() {
  if (!passwordHashPromise) {
    passwordHashPromise = bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));
  }
  return passwordHashPromise;
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

async function createEnabledUnit(nome, forcedId) {
  const modulo = await ensureGestorModulo();
  return Unidade.create({
    _id: forcedId,
    nome,
    pessoaTipo: 'pj',
    is_principal: true,
    modulosAcessiveis: [modulo._id],
  });
}

async function createUser({
  email = buildUniqueEmail('diretor'),
  nome = 'Usuario Teste',
  role = 'diretor',
  unidadeId = null,
} = {}) {
  return User.create({
    email,
    senha: await getPasswordHash(),
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  });
}

async function login(agent, { email, senha = PASSWORD }) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

async function createAgentForRole(app, { unidadeId, role, origem }) {
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(`Unidade Runtime ${nextSequence()}`, unidadeId);
  const user = await createUser({
    email: buildUniqueEmail(`groups-${role}`),
    nome: `Usuario ${role}`,
    role,
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem,
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user, unidade };
}

async function createDiretorAgent(app, { unidadeId } = {}) {
  return createAgentForRole(app, {
    unidadeId,
    role: 'diretor',
    origem: 'msg-groups-shared-dir',
  });
}

async function createAdminAgent(app, { unidadeId } = {}) {
  return createAgentForRole(app, {
    unidadeId,
    role: 'admin',
    origem: 'msg-groups-shared-adm',
  });
}

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function installTeardownSuppression() {
  let shuttingDown = false;
  const originalEmit = process.emit;

  const shouldIgnore = (err) => {
    if (!shuttingDown) return false;
    return String(err?.message || err).includes('Connection was force closed');
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
    }
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mailboxDoc({
  _id,
  name,
  unidadeId = UNIDADE_ID,
  publicValue = false,
  operators = [],
  createdBy = 'runtime-test',
} = {}) {
  return {
    _id,
    name,
    type: 'grupo',
    unidade_id: unidadeId,
    unidade_nome: 'Condominio Teste',
    public: publicValue,
    operators,
    createdBy,
    ativo: true,
  };
}

function groupDoc({
  mailboxId,
  name,
  unidadeId = UNIDADE_ID,
  members = [],
} = {}) {
  return {
    mailbox_id: mailboxId,
    owner: '',
    name,
    members,
    unidade_id: unidadeId,
    createdBy: 'runtime-test',
    ativo: true,
  };
}

test('GET/POST/PATCH/DELETE /mensagens/api/msg/groups fora do pessoal sem sessÃ£o preservam 401 json', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const endpoints = [
      { method: 'get', url: '/mensagens/api/msg/groups?mailboxId=507f1f77bcf86cd799439050' },
      { method: 'post', url: '/mensagens/api/msg/groups', body: { mailboxId: '507f1f77bcf86cd799439050', name: 'Novo Grupo' } },
      { method: 'patch', url: '/mensagens/api/msg/groups/507f1f77bcf86cd799439051', body: { name: 'Editado' } },
      { method: 'delete', url: '/mensagens/api/msg/groups/507f1f77bcf86cd799439051' },
    ];

    for (const endpoint of endpoints) {
      const req = request(app)[endpoint.method](endpoint.url)
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      const res = endpoint.body ? await req.send(endpoint.body) : await req;

      assert.equal(res.status, 401, `${endpoint.method} ${endpoint.url} => ${JSON.stringify(res.body)}`);
      assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
      assert.match(String(res.body?.error || ''), /^N.o autenticado$/u);
    }
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('groups fora do pessoal permitem write-side para membro mesmo sem gerenciarGrupos', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent, user } = await createDiretorAgent(app, { unidadeId: UNIDADE_ID });

      const manageableMailbox = await CondMsgMailbox.create(mailboxDoc({
        _id: '507f1f77bcf86cd799439050',
        name: 'Caixa Operacional',
        operators: [{ user: user.email, perms: { gerenciarGrupos: true } }],
      }));
      const readOnlyMailbox = await CondMsgMailbox.create(mailboxDoc({
        _id: '507f1f77bcf86cd799439060',
        name: 'Caixa Sem PermissÃ£o',
        operators: [{ user: user.email, perms: { criarMensagem: true } }],
      }));

      const [editableGroup, forbiddenGroup] = await CondMsgGroup.create([
        groupDoc({ mailboxId: String(manageableMailbox._id), name: 'Equipe A', members: [{ type: 'user', email: 'a@example.com', nome: 'A' }] }),
        groupDoc({ mailboxId: String(readOnlyMailbox._id), name: 'Equipe B', members: [{ type: 'user', email: 'b@example.com', nome: 'B' }] }),
      ]);

      const getRes = await agent
        .get(`/mensagens/api/msg/groups?mailboxId=${manageableMailbox._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(getRes.status, 200, JSON.stringify(getRes.body));
      assert.equal(Array.isArray(getRes.body), true, JSON.stringify(getRes.body));
      assert.deepEqual(getRes.body.map((item) => item.name), ['Equipe A']);

      const postRes = await agent
        .post('/mensagens/api/msg/groups')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({
          mailboxId: String(manageableMailbox._id),
          name: 'Equipe Nova',
          members: [{ type: 'user', email: 'novo@example.com', nome: 'Novo' }],
        });

      assert.equal(postRes.status, 201, JSON.stringify(postRes.body));
      assert.equal(String(postRes.body?.name || ''), 'Equipe Nova');
      assert.equal(String(postRes.body?.mailboxId || ''), String(manageableMailbox._id));

      const createdGroup = await CondMsgGroup.findOne({ mailbox_id: String(manageableMailbox._id), name: 'Equipe Nova' }).lean();
      assert.equal(String(createdGroup?.owner || ''), '');
      assert.equal(String(createdGroup?.unidade_id || ''), UNIDADE_ID);

      const patchRes = await agent
        .patch(`/mensagens/api/msg/groups/${editableGroup._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ name: 'Equipe A Renomeada' });

      assert.equal(patchRes.status, 200, JSON.stringify(patchRes.body));
      assert.equal(String((await CondMsgGroup.findById(editableGroup._id).lean())?.name || ''), 'Equipe A Renomeada');

      const deleteRes = await agent
        .delete(`/mensagens/api/msg/groups/${editableGroup._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(deleteRes.status, 200, JSON.stringify(deleteRes.body));
      assert.deepEqual(deleteRes.body, { ok: true, id: String(editableGroup._id) });
      assert.equal((await CondMsgGroup.findById(editableGroup._id).lean())?.ativo, false);

      const forbiddenPostRes = await agent
        .post('/mensagens/api/msg/groups')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ mailboxId: String(readOnlyMailbox._id), name: 'Nao Pode Criar' });

      assert.equal(forbiddenPostRes.status, 201, JSON.stringify(forbiddenPostRes.body));
      assert.equal(String(forbiddenPostRes.body?.name || ''), 'Nao Pode Criar', JSON.stringify(forbiddenPostRes.body));
      assert.equal(String(forbiddenPostRes.body?.mailboxId || ''), String(readOnlyMailbox._id), JSON.stringify(forbiddenPostRes.body));

      const forbiddenCreatedGroup = await CondMsgGroup.findOne({
        mailbox_id: String(readOnlyMailbox._id),
        name: 'Nao Pode Criar',
      }).lean();

      assert.ok(forbiddenCreatedGroup, JSON.stringify(forbiddenPostRes.body));
      assert.equal(String(forbiddenCreatedGroup?.owner || ''), '');
      assert.equal(String(forbiddenCreatedGroup?.unidade_id || ''), UNIDADE_ID);

      const forbiddenPatchRes = await agent
        .patch(`/mensagens/api/msg/groups/${forbiddenGroup._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ name: 'Nao Pode Editar' });

      assert.equal(forbiddenPatchRes.status, 200, JSON.stringify(forbiddenPatchRes.body));
      assert.equal(String(forbiddenPatchRes.body?.name || ''), 'Nao Pode Editar', JSON.stringify(forbiddenPatchRes.body));

      const forbiddenAfterPatch = await CondMsgGroup.findById(forbiddenGroup._id).lean();
      assert.equal(String(forbiddenAfterPatch?.name || ''), 'Nao Pode Editar', JSON.stringify(forbiddenAfterPatch));

      const forbiddenDeleteRes = await agent
        .delete(`/mensagens/api/msg/groups/${forbiddenGroup._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(forbiddenDeleteRes.status, 200, JSON.stringify(forbiddenDeleteRes.body));
      assert.deepEqual(forbiddenDeleteRes.body, { ok: true, id: String(forbiddenGroup._id) });

      const forbiddenAfterDelete = await CondMsgGroup.findById(forbiddenGroup._id).lean();
      assert.equal(forbiddenAfterDelete?.ativo, false, JSON.stringify(forbiddenAfterDelete));
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});

test('groups fora do pessoal permitem bypass administrativo global em mailbox de outra unidade sem membership explÃ­cita', async () => {
  const teardownGuard = installTeardownSuppression();

  await withEnv({ MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined }, async () => {
    const { app, close } = await createServer();

    try {
      const { agent } = await createAdminAgent(app, { unidadeId: UNIDADE_ID });
      const remoteMailbox = await CondMsgMailbox.create(mailboxDoc({
        _id: '507f1f77bcf86cd799439070',
        name: 'Caixa Remota',
        unidadeId: OUTRA_UNIDADE_ID,
        publicValue: false,
        operators: [],
      }));
      const remoteGroup = await CondMsgGroup.create(groupDoc({
        mailboxId: String(remoteMailbox._id),
        name: 'Equipe Remota',
        unidadeId: OUTRA_UNIDADE_ID,
      }));

      const getRes = await agent
        .get(`/mensagens/api/msg/groups?mailboxId=${remoteMailbox._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(getRes.status, 200, JSON.stringify(getRes.body));
      assert.deepEqual(getRes.body.map((item) => item.name), ['Equipe Remota']);

      const postRes = await agent
        .post('/mensagens/api/msg/groups')
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ mailboxId: String(remoteMailbox._id), name: 'Equipe Admin' });

      assert.equal(postRes.status, 201, JSON.stringify(postRes.body));
      assert.equal(String(postRes.body?.mailboxId || ''), String(remoteMailbox._id));

      const patchRes = await agent
        .patch(`/mensagens/api/msg/groups/${remoteGroup._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ name: 'Equipe Remota Atualizada' });

      assert.equal(patchRes.status, 200, JSON.stringify(patchRes.body));
      assert.equal(String((await CondMsgGroup.findById(remoteGroup._id).lean())?.name || ''), 'Equipe Remota Atualizada');

      const deleteRes = await agent
        .delete(`/mensagens/api/msg/groups/${remoteGroup._id}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(deleteRes.status, 200, JSON.stringify(deleteRes.body));
      assert.equal((await CondMsgGroup.findById(remoteGroup._id).lean())?.ativo, false);
    } finally {
      try {
        await closeWithTeardownGuard(close, teardownGuard);
      } finally {
        await teardownGuard.remove();
      }
    }
  });
});
