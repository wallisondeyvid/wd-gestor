import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';
import Funcionario from '../src/core/models/Funcionario.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { listUsuariosOwnerService } from '../src/modules/gestor/app/services/usuarios/listUsuariosOwner.service.js';

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

function buildUniqueEmail(prefix = 'usuarios-memberships') {
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
  email = buildUniqueEmail('usuario-pagina-membership'),
  nome = 'Usuário Página Membership',
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
    email: buildUniqueEmail('admin-pagina-membership'),
    nome: 'Admin Página Membership',
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

test('GET /gestor/usuarios exibe resumo de vínculos por unidade para usuários globais', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Página A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Página B ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const funcionarioId = new mongoose.Types.ObjectId();

  const usuarioGlobal = await createUser({
    email: buildUniqueEmail('usuario-global-tela'),
    nome: 'Usuário Global Tela',
    role: 'user',
    unidadeId: unidadeA._id,
  });

  await UserMembership.create([
    {
      user_id: usuarioGlobal._id,
      unidade_id: unidadeA._id,
      papel_contextual: 'user',
      status: 'active',
      origem: 'gestor-users-memberships-page-test',
    },
    {
      user_id: usuarioGlobal._id,
      unidade_id: unidadeB._id,
      papel_contextual: 'gestor',
      status: 'inactive',
      funcionario_id: funcionarioId,
      origem: 'gestor-users-memberships-page-test',
    },
  ]);

  const res = await agent.get('/gestor/usuarios');

  assert.equal(res.status, 200);
  assert.match(res.text, /Identidade global/);
  assert.match(res.text, /2 unidades vinculadas/);
  assert.match(res.text, /Unidade Página A/);
  assert.match(res.text, /Unidade Página B/);
  assert.match(res.text, /Diretor/);
  assert.doesNotMatch(res.text, /· gestor/);
  assert.match(res.text, /inativo/);
  assert.match(res.text, /func\. vinculado/);
  assert.match(res.text, new RegExp(usuarioGlobal.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('GET /gestor/usuarios diferencia legado sem sync de acesso global sem mostrar 0 unidades vinculadas', async () => {
  const unidadeLegada = await createEnabledUnit(`Unidade Legada ${nextSequence()}`);
  const { agent } = await createAdminAgent();

  const usuarioLegado = await createUser({
    email: buildUniqueEmail('usuario-legado-sem-sync'),
    nome: 'Usuário Legado Sem Sync',
    role: 'user',
    unidadeId: unidadeLegada._id,
  });

  const adminGlobal = await createUser({
    email: buildUniqueEmail('admin-global-sem-contexto'),
    nome: 'Admin Global',
    role: 'admin',
    globalRole: 'admin',
    unidadeId: null,
  });

  const res = await agent.get('/gestor/usuarios');

  assert.equal(res.status, 200);
  assert.match(res.text, new RegExp(usuarioLegado.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(res.text, /Vínculos ainda não sincronizados/);
  assert.match(res.text, /Cadastro legado sem user_memberships sincronizados\./);
  assert.match(res.text, new RegExp(adminGlobal.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(res.text, /Acesso global/);
  assert.match(res.text, /Sem vínculo contextual necessário\./);
  assert.doesNotMatch(res.text, /0 unidades vinculadas/);
});

test('listUsuariosOwnerService ancora o branch contextual em req.unitScope para usuarios, unidades e funcionarios', async () => {
  const unidadeEscopo = await createEnabledUnit(`Unidade Escopo ${nextSequence()}`);
  const unidadeFora = await createEnabledUnit(`Unidade Fora ${nextSequence()}`);

  const usuarioComLegadoNoEscopo = await createUser({
    email: buildUniqueEmail('usuario-escopo-legado'),
    nome: 'Usuário Escopo Legado',
    role: 'user',
    unidadeId: unidadeEscopo._id,
  });

  const usuarioComMembershipNoEscopo = await createUser({
    email: buildUniqueEmail('usuario-escopo-membership'),
    nome: 'Usuário Escopo Membership',
    role: 'user',
    unidadeId: null,
  });

  const usuarioForaDoEscopo = await createUser({
    email: buildUniqueEmail('usuario-fora-escopo'),
    nome: 'Usuário Fora do Escopo',
    role: 'user',
    unidadeId: unidadeFora._id,
  });

  await UserMembership.create([
    {
      user_id: usuarioComMembershipNoEscopo._id,
      unidade_id: unidadeEscopo._id,
      papel_contextual: 'gestor',
      status: 'active',
      origem: 'gestor-users-memberships-page-test',
    },
    {
      user_id: usuarioForaDoEscopo._id,
      unidade_id: unidadeFora._id,
      papel_contextual: 'gestor',
      status: 'active',
      origem: 'gestor-users-memberships-page-test',
    },
  ]);

  const funcionarioEscopo = await Funcionario.create({
    unidade_id: unidadeEscopo._id,
    nome: 'Funcionário do Escopo',
    rg: `RGESCOPO${Date.now()}${nextSequence()}`,
    cpf: buildUniqueCpf(),
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-escopo'),
    telefone: '(11) 99999-1111',
  });

  await Funcionario.create({
    unidade_id: unidadeFora._id,
    nome: 'Funcionário Fora do Escopo',
    rg: `RGFORA${Date.now()}${nextSequence()}`,
    cpf: buildUniqueCpf(),
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-fora'),
    telefone: '(11) 99999-2222',
  });

  const result = await listUsuariosOwnerService({
    req: {
      user: { role: 'diretor', isMaster: false },
      unitScope: { unidadeId: String(unidadeEscopo._id) },
      session: {
        gestorAuthContext: {
          source: 'auth-context-v1',
          active_unidade_id: String(unidadeFora._id),
        },
        user: {
          unidade_id: String(unidadeFora._id),
        },
      },
    },
    isGlobalScope: false,
  });

  const usuarioIds = new Set((result.usuarios || []).map((usuario) => String(usuario._id)));
  const unidadeIds = new Set((result.unidadesFiltradas || []).map((unidade) => String(unidade._id)));
  const funcionarioIds = new Set((result.funcionarios || []).map((funcionario) => String(funcionario._id)));

  assert.equal(usuarioIds.has(String(usuarioComLegadoNoEscopo._id)), true);
  assert.equal(usuarioIds.has(String(usuarioComMembershipNoEscopo._id)), true);
  assert.equal(usuarioIds.has(String(usuarioForaDoEscopo._id)), false);
  assert.deepEqual([...unidadeIds], [String(unidadeEscopo._id)]);
  assert.deepEqual([...funcionarioIds], [String(funcionarioEscopo._id)]);
});