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
  email = buildUniqueEmail('usuario'),
  nome = 'Usuário de Teste',
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
    email: buildUniqueEmail('admin-global'),
    nome: 'Admin Global',
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

test('POST /gestor/api/usuarios aplica gates mínimos de autenticação e autorização no caminho montado real', async () => {
  const anonymous = request(app);

  const unauthenticatedRes = await anonymous
    .post('/gestor/api/usuarios')
    .send({});

  assert.equal(unauthenticatedRes.status, 401);
  assert.equal(unauthenticatedRes.body?.success, false);
  assert.equal(unauthenticatedRes.body?.error, 'Não autenticado');
  assert.equal(unauthenticatedRes.body?.code, 'UNAUTHORIZED');

  const unidade = await createEnabledUnit(`Unidade Gate Usuários ${nextSequence()}`);
  const basicUser = await createUser({
    email: buildUniqueEmail('usuario-sem-permissao'),
    nome: 'Usuário Sem Permissão',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: basicUser._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-user-create-or-link-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: basicUser.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  const forbiddenRes = await agent
    .post('/gestor/api/usuarios')
    .send({});

  assert.equal(forbiddenRes.status, 403);
  assert.equal(forbiddenRes.body?.success, false);
  assert.equal(forbiddenRes.body?.error, 'Acesso negado');
  assert.equal(forbiddenRes.body?.code, 'FORBIDDEN');
});

test('POST /gestor/api/usuarios bloqueia seleção pendente no middleware antes do controller no caminho montado real', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Seleção Pendente A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Seleção Pendente B ${nextSequence()}`);
  const attemptedEmail = buildUniqueEmail('nao-deve-criar');

  const pendingSelectionUser = await createUser({
    email: buildUniqueEmail('usuario-selecao-pendente'),
    nome: 'Usuário Seleção Pendente',
    role: 'user',
    unidadeId: unidadeA._id,
  });

  await UserMembership.create({
    user_id: pendingSelectionUser._id,
    unidade_id: unidadeA._id,
    papel_contextual: 'user',
    status: 'active',
    origem: 'gestor-user-create-or-link-test',
  });

  await UserMembership.create({
    user_id: pendingSelectionUser._id,
    unidade_id: unidadeB._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'gestor-user-create-or-link-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: pendingSelectionUser.email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/login?step=select');

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Não Deve Entrar no Controller',
      email: attemptedEmail,
      role: 'user',
      unidade_id: String(unidadeA._id),
    });

  assert.equal(res.status, 409);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.authenticated, true);
  assert.equal(res.body?.error, 'Seleção de unidade pendente');
  assert.equal(res.body?.code, 'GESTOR_SELECTION_REQUIRED');
  assert.equal(res.body?.needsUnitSelection, true);
  assert.equal(res.body?.redirect, '/gestor/login?step=select');
  assert.notEqual(res.body?.code, 'FORBIDDEN');

  const createdUser = await User.findOne({ email: attemptedEmail }).lean();
  assert.equal(createdUser, null);
});

test('POST /gestor/api/usuarios falha com EMAIL_REQUIRED antes de qualquer efeito no caminho montado real', async () => {
  const unidade = await createEnabledUnit(`Unidade Email Obrigatório ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const usersBefore = await User.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Sem Email',
      role: 'user',
      unidade_id: String(unidade._id),
      cpf: buildUniqueCpf(),
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'E-mail obrigatório');
  assert.equal(res.body?.code, 'EMAIL_REQUIRED');

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore);
});

test('POST /gestor/api/usuarios falha com UNIT_REQUIRED no bloco pre-efeito principal do controller', async () => {
  const { agent } = await createAdminAgent();
  const attemptedEmail = buildUniqueEmail('sem-unidade');
  const usersBefore = await User.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Sem Unidade',
      email: attemptedEmail,
      role: 'user',
      cpf: buildUniqueCpf(),
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'Para usuários e diretores, é obrigatório selecionar uma unidade vinculada.');
  assert.equal(res.body?.code, 'UNIT_REQUIRED');

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore);
});

test('POST /gestor/api/usuarios falha com EMAIL_DUPLICATE no bloco pre-efeito principal do controller', async () => {
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('email-duplicado');
  const existingUser = await createUser({
    email,
    nome: 'Usuário Existente Email Duplicado',
    role: 'user',
  });
  const usersBefore = await User.countDocuments();
  const membershipsBefore = await UserMembership.countDocuments({ user_id: existingUser._id });

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Tentativa Duplicada',
      email,
      role: 'admin',
      cpf: buildUniqueCpf(),
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'Email já cadastrado');
  assert.equal(res.body?.code, 'EMAIL_DUPLICATE');

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore);

  const duplicateUsers = await User.find({ email }).lean();
  assert.equal(duplicateUsers.length, 1);
  assert.equal(String(duplicateUsers[0]._id), String(existingUser._id));

  const membershipsAfter = await UserMembership.countDocuments({ user_id: existingUser._id });
  assert.equal(membershipsAfter, membershipsBefore);
});

test('POST /gestor/api/usuarios mantém EMAIL_DUPLICATE para User existente com role admin, unidade_id presente e funcionario_id válido sem membership contextual', async () => {
  const unidade = await createEnabledUnit(`Unidade Duplicate Sem Papel Contextual ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('email-duplicado-unidade');
  const existingUser = await createUser({
    email,
    nome: 'Usuário Existente Sem Papel Contextual',
    role: 'user',
  });
  const funcionario = await Funcionario.create({
    unidade_id: unidade._id,
    nome: 'Funcionário Existente Sem Papel Contextual',
    rg: `RG${Date.now()}${nextSequence()}`,
    cpf: buildUniqueCpf(),
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-duplicado-unidade'),
    telefone: '(11) 99999-9999',
  });
  const usersBefore = await User.countDocuments();
  const membershipsBefore = await UserMembership.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Tentativa Duplicada Com Unidade',
      email,
      role: 'admin',
      unidade_id: String(unidade._id),
      cpf: buildUniqueCpf(),
      funcionario_id: String(funcionario._id),
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'Email já cadastrado');
  assert.equal(res.body?.code, 'EMAIL_DUPLICATE');
  assert.equal(res.body?.data, undefined);

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore);

  const duplicateUsers = await User.find({ email }).lean();
  assert.equal(duplicateUsers.length, 1);
  assert.equal(String(duplicateUsers[0]._id), String(existingUser._id));
  assert.equal(duplicateUsers[0].funcionario_id ?? null, null);

  const membershipsAfter = await UserMembership.countDocuments();
  assert.equal(membershipsAfter, membershipsBefore);

  const userMemberships = await UserMembership.find({ user_id: existingUser._id }).lean();
  assert.equal(userMemberships.length, 0);

  const funcionarioAfter = await Funcionario.findById(funcionario._id).lean();
  assert.ok(funcionarioAfter);
  assert.equal(funcionarioAfter.usuario_id ?? null, null);
});

test('POST /gestor/api/usuarios falha com FUNC_NOT_FOUND no bloco pre-efeito principal do controller', async () => {
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('funcionario-inexistente');
  const missingFuncionarioId = new mongoose.Types.ObjectId();
  const usersBefore = await User.countDocuments();
  const membershipsBefore = await UserMembership.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário com Funcionário Inexistente',
      email,
      role: 'admin',
      cpf: buildUniqueCpf(),
      funcionario_id: String(missingFuncionarioId),
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'Funcionário não encontrado');
  assert.equal(res.body?.code, 'FUNC_NOT_FOUND');

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore);

  const createdUser = await User.findOne({ email }).lean();
  assert.equal(createdUser, null);

  const membershipsAfter = await UserMembership.countDocuments();
  assert.equal(membershipsAfter, membershipsBefore);
});

test('POST /gestor/api/usuarios falha com FUNC_ALREADY_LINKED no bloco pre-efeito principal do controller', async () => {
  const unidade = await createEnabledUnit(`Unidade Funcionario Ja Vinculado ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('funcionario-ja-vinculado-target');
  const linkedUser = await createUser({
    email: buildUniqueEmail('funcionario-ja-vinculado-owner'),
    nome: 'Usuário Já Vinculado ao Funcionário',
    role: 'user',
    unidadeId: unidade._id,
  });

  const funcionario = await Funcionario.create({
    unidade_id: unidade._id,
    usuario_id: linkedUser._id,
    nome: 'Funcionário Já Vinculado',
    rg: `RG${Date.now()}${nextSequence()}`,
    cpf: buildUniqueCpf(),
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-ja-vinculado-existing'),
    telefone: '(11) 99999-9999',
  });

  const usersBefore = await User.countDocuments();
  const membershipsBefore = await UserMembership.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Alvo Funcionário Já Vinculado',
      email,
      role: 'admin',
      cpf: buildUniqueCpf(),
      funcionario_id: String(funcionario._id),
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'Funcionário já vinculado a um usuário');
  assert.equal(res.body?.code, 'FUNC_ALREADY_LINKED');

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore);

  const createdUser = await User.findOne({ email }).lean();
  assert.equal(createdUser, null);

  const membershipsAfter = await UserMembership.countDocuments();
  assert.equal(membershipsAfter, membershipsBefore);
});

test('POST /gestor/api/usuarios falha com FUNC_WRONG_UNIT no bloco pre-efeito principal do controller', async () => {
  const unidadeFuncionario = await createEnabledUnit(`Unidade Funcionario Origem ${nextSequence()}`);
  const unidadeAlvo = await createEnabledUnit(`Unidade Funcionario Destino ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('funcionario-outra-unidade-target');

  const funcionario = await Funcionario.create({
    unidade_id: unidadeFuncionario._id,
    nome: 'Funcionário Outra Unidade',
    rg: `RG${Date.now()}${nextSequence()}`,
    cpf: buildUniqueCpf(),
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-outra-unidade-existing'),
    telefone: '(11) 99999-9999',
  });

  const usersBefore = await User.countDocuments();
  const membershipsBefore = await UserMembership.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Alvo Funcionário Outra Unidade',
      email,
      role: 'admin',
      cpf: buildUniqueCpf(),
      unidade_id: String(unidadeAlvo._id),
      funcionario_id: String(funcionario._id),
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'Funcionário pertence a outra unidade');
  assert.equal(res.body?.code, 'FUNC_WRONG_UNIT');

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore);

  const createdUser = await User.findOne({ email }).lean();
  assert.equal(createdUser, null);

  const membershipsAfter = await UserMembership.countDocuments();
  assert.equal(membershipsAfter, membershipsBefore);
});

test('POST /gestor/api/usuarios falha com FUNC_INVALID no bloco pre-efeito principal do controller', async () => {
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('funcionario-invalido-target');
  const usersBefore = await User.countDocuments();
  const membershipsBefore = await UserMembership.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Alvo Funcionário Inválido',
      email,
      role: 'admin',
      cpf: buildUniqueCpf(),
      funcionario_id: 'funcionario-id-invalido',
    });

  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.error, 'Funcionário inválido');
  assert.equal(res.body?.code, 'FUNC_INVALID');

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore);

  const createdUser = await User.findOne({ email }).lean();
  assert.equal(createdUser, null);

  const membershipsAfter = await UserMembership.countDocuments();
  assert.equal(membershipsAfter, membershipsBefore);
});

test('POST /gestor/api/usuarios cria usuário novo com membership contextual', async () => {
  const unidade = await createEnabledUnit(`Unidade Novo Usuário ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('novo-contextual');

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Novo Contextual',
      email,
      role: 'user',
      unidade_id: String(unidade._id),
      cpf: buildUniqueCpf(),
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.created, true);
  assert.equal(res.body.data?.outcome, 'created');
  assert.equal(typeof res.body.data?.tempPassword, 'string');

  const user = await User.findOne({ email }).lean();
  assert.ok(user);

  const membership = await UserMembership.findOne({ user_id: user._id, unidade_id: unidade._id }).lean();
  assert.ok(membership);
  assert.equal(membership.papel_contextual, 'user');
  assert.equal(membership.status, 'active');
  assert.equal(String(res.body.id), String(user._id));
});

test('POST /gestor/api/usuarios normaliza role vazia e master para user no fluxo created', async () => {
  const unidade = await createEnabledUnit(`Unidade Role Normalizada ${nextSequence()}`);
  const { agent } = await createAdminAgent();

  for (const role of ['', 'master']) {
    const email = buildUniqueEmail(role || 'role-vazia');

    const res = await agent
      .post('/gestor/api/usuarios')
      .send({
        nome: `Usuário ${role || 'vazio'}`,
        email,
        role,
        unidade_id: String(unidade._id),
        cpf: buildUniqueCpf(),
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data?.outcome, 'created');

    const users = await User.find({ email }).lean();
    assert.equal(users.length, 1);
    assert.equal(users[0].role, 'user');

    const memberships = await UserMembership.find({ user_id: users[0]._id }).lean();
    assert.equal(memberships.length, 1);
    assert.equal(String(memberships[0].unidade_id), String(unidade._id));
    assert.equal(memberships[0].papel_contextual, 'user');
    assert.equal(memberships[0].status, 'active');
    assert.equal(memberships[0].origem, 'gestor-user-admin');
  }
});

test('POST /gestor/api/usuarios cria User com funcionario_id válido e sem membership contextual quando a role não mapeia para papel_contextual', async () => {
  const unidade = await createEnabledUnit(`Unidade Sem Papel Contextual ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('sem-papel-contextual');

  const funcionario = await Funcionario.create({
    unidade_id: unidade._id,
    nome: 'Funcionário Sem Papel Contextual',
    rg: `RG${Date.now()}${nextSequence()}`,
    cpf: buildUniqueCpf(),
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-sem-papel-contextual'),
    telefone: '(11) 99999-9999',
  });

  const usersBefore = await User.countDocuments();
  const membershipsBefore = await UserMembership.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Sem Papel Contextual',
      email,
      role: 'admin',
      unidade_id: String(unidade._id),
      cpf: buildUniqueCpf(),
      funcionario_id: String(funcionario._id),
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.created, true);
  assert.equal(res.body.data?.outcome, 'created');
  assert.equal(String(res.body.data?.funcionario_id), String(funcionario._id));

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'admin');
  assert.equal(String(users[0].unidade_id), String(unidade._id));
  assert.equal(String(users[0].funcionario_id), String(funcionario._id));

  const funcionarioAtualizado = await Funcionario.findById(funcionario._id).lean();
  assert.ok(funcionarioAtualizado);
  assert.equal(String(funcionarioAtualizado.usuario_id), String(users[0]._id));

  const userMemberships = await UserMembership.find({ user_id: users[0]._id }).lean();
  assert.equal(userMemberships.length, 0);

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore + 1);

  const membershipsAfter = await UserMembership.countDocuments();
  assert.equal(membershipsAfter, membershipsBefore);
});

test('POST /gestor/api/usuarios cria usuário novo com funcionario_id válido e membership contextual coerente', async () => {
  const unidade = await createEnabledUnit(`Unidade Novo Usuário com Funcionário ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('novo-contextual-funcionario');

  const funcionario = await Funcionario.create({
    unidade_id: unidade._id,
    nome: 'Funcionário Novo Contextual',
    rg: `RG${Date.now()}${nextSequence()}`,
    cpf: buildUniqueCpf(),
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-novo-contextual'),
    telefone: '(11) 99999-9999',
  });

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Novo Contextual com Funcionário',
      email,
      role: 'diretor',
      unidade_id: String(unidade._id),
      cpf: buildUniqueCpf(),
      funcionario_id: String(funcionario._id),
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.outcome, 'created');

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);

  const user = users[0];
  assert.equal(user ? String(user.funcionario_id) : null, String(funcionario._id));

  const funcionarioAtualizado = await Funcionario.findById(funcionario._id).lean();
  assert.ok(funcionarioAtualizado);
  assert.equal(String(funcionarioAtualizado.usuario_id), String(user._id));

  const memberships = await UserMembership.find({ user_id: user._id }).lean();
  assert.equal(memberships.length, 1);
  assert.equal(String(memberships[0].unidade_id), String(unidade._id));
  assert.equal(memberships[0].papel_contextual, 'gestor');
  assert.equal(String(memberships[0].funcionario_id), String(funcionario._id));
  assert.equal(memberships[0].status, 'active');
  assert.equal(memberships[0].origem, 'gestor-user-admin');
});

test('POST /gestor/api/usuarios retorna CPF_REQUIRED no ramo automático após criar o User e antes de criar Funcionario', async () => {
  const unidade = await createEnabledUnit(`Unidade CPF Required Automático ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('auto-funcionario-cpf-required');

  const usersBefore = await User.countDocuments();
  const membershipsBefore = await UserMembership.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Sem CPF no Automático',
      email,
      role: 'diretor',
      unidade_id: String(unidade._id),
      criarNovoFuncionario: true,
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'CPF é obrigatório para criar novo funcionário automaticamente.');
  assert.equal(res.body.code, 'CPF_REQUIRED');
  assert.equal(res.body.data, undefined);

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);

  const user = users[0];
  assert.equal(user.role, 'diretor');
  assert.equal(String(user.unidade_id), String(unidade._id));
  assert.equal(user.funcionario_id ?? null, null);

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore + 1);

  const funcionariosCriados = await Funcionario.find({
    email,
    unidade_id: unidade._id,
  }).lean();
  assert.equal(funcionariosCriados.length, 0);

  const membershipsAfter = await UserMembership.countDocuments();
  assert.equal(membershipsAfter, membershipsBefore);

  const memberships = await UserMembership.find({ user_id: user._id }).lean();
  assert.equal(memberships.length, 0);
});

test('POST /gestor/api/usuarios retorna UNIT_REQUIRED no ramo automático após criar o User e antes de criar Funcionario', async () => {
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('auto-funcionario-unit-required');
  const cpf = buildUniqueCpf();

  const usersBefore = await User.countDocuments();
  const membershipsBefore = await UserMembership.countDocuments();

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Sem Unidade no Automático',
      email,
      role: 'admin',
      cpf,
      criarNovoFuncionario: true,
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Unidade é obrigatória para criar novo funcionário.');
  assert.equal(res.body.code, 'UNIT_REQUIRED');
  assert.equal(res.body.data, undefined);

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);

  const user = users[0];
  assert.equal(user.role, 'admin');
  assert.equal(user.unidade_id ?? null, null);
  assert.equal(user.funcionario_id ?? null, null);

  const usersAfter = await User.countDocuments();
  assert.equal(usersAfter, usersBefore + 1);

  const funcionariosCriados = await Funcionario.find({ email }).lean();
  assert.equal(funcionariosCriados.length, 0);

  const membershipsAfter = await UserMembership.countDocuments();
  assert.equal(membershipsAfter, membershipsBefore);

  const memberships = await UserMembership.find({ user_id: user._id }).lean();
  assert.equal(memberships.length, 0);
});

test('POST /gestor/api/usuarios reaproveita Funcionario existente por cpf e unidade no ramo automático', async () => {
  const unidade = await createEnabledUnit(`Unidade Reaproveita Funcionario Automatico ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('auto-funcionario-existente');
  const cpf = buildUniqueCpf();

  const funcionarioExistente = await Funcionario.create({
    unidade_id: unidade._id,
    nome: 'Funcionário Existente no Automático',
    rg: `RG${Date.now()}${nextSequence()}`,
    cpf,
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-automatico-existente'),
    telefone: '(11) 99999-9999',
  });

  const funcionariosAntes = await Funcionario.find({
    cpf,
    unidade_id: unidade._id,
  }).lean();
  assert.equal(funcionariosAntes.length, 1);

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário com Funcionário Existente no Automático',
      email,
      role: 'diretor',
      unidade_id: String(unidade._id),
      cpf,
      criarNovoFuncionario: true,
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.created, true);
  assert.equal(res.body.data?.outcome, 'created');
  assert.equal(String(res.body.data?.funcionario_id), String(funcionarioExistente._id));

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);

  const user = users[0];
  assert.equal(String(user.unidade_id), String(unidade._id));
  assert.equal(String(user.funcionario_id), String(funcionarioExistente._id));

  const funcionariosDepois = await Funcionario.find({
    cpf,
    unidade_id: unidade._id,
  }).lean();
  assert.equal(funcionariosDepois.length, 1);
  assert.equal(String(funcionariosDepois[0]._id), String(funcionarioExistente._id));

  const funcionarioAtualizado = await Funcionario.findById(funcionarioExistente._id).lean();
  assert.ok(funcionarioAtualizado);
  assert.equal(String(funcionarioAtualizado.usuario_id), String(user._id));

  const memberships = await UserMembership.find({ user_id: user._id }).lean();
  assert.equal(memberships.length, 1);
  assert.equal(String(memberships[0].unidade_id), String(unidade._id));
  assert.equal(memberships[0].papel_contextual, 'gestor');
  assert.equal(String(memberships[0].funcionario_id), String(funcionarioExistente._id));
  assert.equal(memberships[0].status, 'active');
  assert.equal(memberships[0].origem, 'gestor-user-admin');
});

test('POST /gestor/api/usuarios reaproveita User existente e Funcionario existente por cpf e unidade em nova unidade contextual no ramo automático', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Existing User Automático A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Existing User Automático B ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('auto-existing-user-funcionario');
  const cpf = buildUniqueCpf();

  const existingUser = await createUser({
    email,
    nome: 'Usuário Existente no Automático',
    role: 'user',
    unidadeId: unidadeA._id,
  });

  await UserMembership.create({
    user_id: existingUser._id,
    unidade_id: unidadeA._id,
    papel_contextual: 'user',
    status: 'active',
    origem: 'gestor-user-create-or-link-test',
  });

  const funcionarioExistente = await Funcionario.create({
    unidade_id: unidadeB._id,
    nome: 'Funcionário Existente em Nova Unidade',
    rg: `RG${Date.now()}${nextSequence()}`,
    cpf,
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-auto-existing-user'),
    telefone: '(11) 99999-9999',
  });

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Existente Vinculando Funcionario Automático',
      email,
      role: 'diretor',
      unidade_id: String(unidadeB._id),
      cpf,
      criarNovoFuncionario: true,
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.created, true);
  assert.equal(res.body.data?.outcome, 'linked');
  assert.equal(String(res.body.id), String(existingUser._id));
  assert.equal(String(res.body.data?.funcionario_id), String(funcionarioExistente._id));

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);
  assert.equal(String(users[0]._id), String(existingUser._id));

  const funcionariosDepois = await Funcionario.find({
    cpf,
    unidade_id: unidadeB._id,
  }).lean();
  assert.equal(funcionariosDepois.length, 1);
  assert.equal(String(funcionariosDepois[0]._id), String(funcionarioExistente._id));

  const memberships = await UserMembership.find({ user_id: existingUser._id }).sort({ createdAt: 1 }).lean();
  assert.equal(memberships.length, 2);

  const membershipNovaUnidade = memberships.find(
    (membership) => String(membership.unidade_id) === String(unidadeB._id),
  );
  assert.ok(membershipNovaUnidade);
  assert.equal(membershipNovaUnidade.papel_contextual, 'gestor');
  assert.equal(String(membershipNovaUnidade.funcionario_id), String(funcionarioExistente._id));
  assert.equal(membershipNovaUnidade.status, 'active');
  assert.equal(membershipNovaUnidade.origem, 'gestor-user-admin');

  const funcionarioAtualizado = await Funcionario.findById(funcionarioExistente._id).lean();
  assert.ok(funcionarioAtualizado);
  assert.equal(String(funcionarioAtualizado.usuario_id), String(existingUser._id));

  const reusedUserAfter = await User.findById(existingUser._id).lean();
  assert.ok(reusedUserAfter);
  assert.equal(
    reusedUserAfter.funcionario_id ? String(reusedUserAfter.funcionario_id) : null,
    String(funcionarioExistente._id),
  );
});

test('POST /gestor/api/usuarios cria funcionário automaticamente quando solicitado sem funcionario_id prévio', async () => {
  const unidade = await createEnabledUnit(`Unidade Funcionário Automático ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('auto-funcionario');
  const cpf = buildUniqueCpf();

  const funcionariosAntes = await Funcionario.find({
    cpf,
    unidade_id: unidade._id,
  }).lean();
  assert.equal(funcionariosAntes.length, 0);

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário com Funcionário Automático',
      email,
      role: 'diretor',
      unidade_id: String(unidade._id),
      cpf,
      criarNovoFuncionario: true,
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.created, true);
  assert.equal(res.body.data?.outcome, 'created');
  assert.ok(res.body.data?.funcionario_id);

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);

  const user = users[0];
  assert.equal(String(user.unidade_id), String(unidade._id));
  assert.equal(String(user.funcionario_id), String(res.body.data?.funcionario_id));

  const funcionariosCriados = await Funcionario.find({
    cpf,
    unidade_id: unidade._id,
  }).lean();
  assert.equal(funcionariosCriados.length, 1);

  const funcionarioCriado = funcionariosCriados[0];
  assert.equal(String(funcionarioCriado._id), String(res.body.data?.funcionario_id));
  assert.equal(funcionarioCriado.email, email);
  assert.equal(String(funcionarioCriado.usuario_id), String(user._id));

  const memberships = await UserMembership.find({ user_id: user._id }).lean();
  assert.equal(memberships.length, 1);
  assert.equal(String(memberships[0].unidade_id), String(unidade._id));
  assert.equal(memberships[0].papel_contextual, 'gestor');
  assert.equal(String(memberships[0].funcionario_id), String(funcionarioCriado._id));
  assert.equal(memberships[0].status, 'active');
  assert.equal(memberships[0].origem, 'gestor-user-admin');
});

test('POST /gestor/api/usuarios reaproveita o mesmo User e adiciona membership em outra unidade', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Existente A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Existente B ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('link-contextual');

  const existingUser = await createUser({
    email,
    nome: 'Usuário Multiunidade',
    role: 'user',
    unidadeId: unidadeA._id,
  });

  await UserMembership.create({
    user_id: existingUser._id,
    unidade_id: unidadeA._id,
    papel_contextual: 'user',
    status: 'active',
    origem: 'gestor-user-create-or-link-test',
  });

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Nome Divergente Ignorado',
      email,
      role: 'diretor',
      unidade_id: String(unidadeB._id),
      cpf: buildUniqueCpf(),
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.outcome, 'linked');
  assert.equal(res.body.data?.tempPassword, undefined);
  assert.equal(String(res.body.id), String(existingUser._id));

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);
  assert.equal(users[0].nome, 'Usuário Multiunidade');
  assert.equal(users[0].cpf, existingUser.cpf);

  const memberships = await UserMembership.find({ user_id: existingUser._id }).sort({ createdAt: 1 }).lean();
  assert.equal(memberships.length, 2);
  assert.equal(String(memberships[1].unidade_id), String(unidadeB._id));
  assert.equal(memberships[1].papel_contextual, 'gestor');

  const targetAgent = request.agent(app);
  const loginRes = await login(targetAgent, { email });
  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/login?step=select');

  const contextRes = await targetAgent.get('/gestor/auth/context');
  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.needsUnitSelection, true);
  assert.equal(contextRes.body.membershipCount, 2);
});

test('POST /gestor/api/usuarios reaproveita User existente com funcionario_id valido em nova unidade contextual mantendo coerencia interna', async () => {
  const unidadeA = await createEnabledUnit(`Unidade Existente Funcionario A ${nextSequence()}`);
  const unidadeB = await createEnabledUnit(`Unidade Existente Funcionario B ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('link-contextual-funcionario');

  const existingUser = await createUser({
    email,
    nome: 'Usuário Multiunidade com Funcionário',
    role: 'user',
    unidadeId: unidadeA._id,
  });

  await UserMembership.create({
    user_id: existingUser._id,
    unidade_id: unidadeA._id,
    papel_contextual: 'user',
    status: 'active',
    origem: 'gestor-user-create-or-link-test',
  });

  const funcionario = await Funcionario.create({
    unidade_id: unidadeB._id,
    nome: 'Funcionário Disponível Multiunidade',
    rg: `RG${Date.now()}${nextSequence()}`,
    cpf: buildUniqueCpf(),
    data_nascimento: new Date('2000-01-01T00:00:00.000Z'),
    sexo: 'N',
    email: buildUniqueEmail('funcionario-link-contextual'),
    telefone: '(11) 99999-9999',
  });

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Nome Divergente Ignorado com Funcionário',
      email,
      role: 'diretor',
      unidade_id: String(unidadeB._id),
      cpf: buildUniqueCpf(),
      funcionario_id: String(funcionario._id),
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data?.outcome, 'linked');
  assert.equal(String(res.body.id), String(existingUser._id));
  assert.equal(String(res.body.data?.funcionario_id), String(funcionario._id));

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);
  assert.equal(String(users[0]._id), String(existingUser._id));

  const memberships = await UserMembership.find({ user_id: existingUser._id }).sort({ createdAt: 1 }).lean();
  assert.equal(memberships.length, 2);

  const membershipNovaUnidade = memberships.find(
    (membership) => String(membership.unidade_id) === String(unidadeB._id),
  );
  assert.ok(membershipNovaUnidade);
  assert.equal(membershipNovaUnidade.papel_contextual, 'gestor');
  assert.equal(membershipNovaUnidade.status, 'active');
  assert.equal(String(membershipNovaUnidade.funcionario_id), String(funcionario._id));
  assert.equal(membershipNovaUnidade.origem, 'gestor-user-admin');

  const funcionarioAtualizado = await Funcionario.findById(funcionario._id).lean();
  assert.ok(funcionarioAtualizado);
  assert.equal(String(funcionarioAtualizado.usuario_id), String(existingUser._id));

  const reusedUserAfter = await User.findById(existingUser._id).lean();
  assert.ok(reusedUserAfter);
  assert.equal(
    reusedUserAfter.funcionario_id ? String(reusedUserAfter.funcionario_id) : null,
    String(funcionario._id),
  );
});

test('POST /gestor/api/usuarios falha claramente quando o usuário já está vinculado à mesma unidade', async () => {
  const unidade = await createEnabledUnit(`Unidade Duplicada ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('duplicado-contextual');

  const existingUser = await createUser({
    email,
    nome: 'Usuário Já Vinculado',
    role: 'user',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: existingUser._id,
    unidade_id: unidade._id,
    papel_contextual: 'user',
    status: 'active',
    origem: 'gestor-user-create-or-link-test',
  });

  const res = await agent
    .post('/gestor/api/usuarios')
    .send({
      nome: 'Usuário Já Vinculado',
      email,
      role: 'user',
      unidade_id: String(unidade._id),
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'USER_MEMBERSHIP_DUPLICATE');
  assert.equal(res.body.error, 'Usuário já vinculado a esta unidade');

  const users = await User.find({ email }).lean();
  assert.equal(users.length, 1);

  const memberships = await UserMembership.find({ user_id: existingUser._id, unidade_id: unidade._id }).lean();
  assert.equal(memberships.length, 1);
});

test('POST /gestor/api/usuarios relocaliza Funcionario por cpf e unidade quando createFuncionarioDoc falha com duplicidade', async () => {
  const unidade = await createEnabledUnit(`Unidade Duplicidade Funcionario ${nextSequence()}`);
  const { agent } = await createAdminAgent();
  const email = buildUniqueEmail('auto-funcionario-duplicate-fallback');
  const cpf = buildUniqueCpf();

  const funcionariosAntes = await Funcionario.find({
    cpf,
    unidade_id: unidade._id,
  }).lean();
  assert.equal(funcionariosAntes.length, 0);

  const originalCreate = Funcionario.create.bind(Funcionario);
  let duplicateFallbackTriggered = false;

  Funcionario.create = async function patchedCreate(payload, ...args) {
    const sameCpf = String(payload?.cpf || '') === String(cpf);
    const sameUnit = String(payload?.unidade_id || '') === String(unidade._id);
    const hasUserId = !!payload?.usuario_id;

    if (!duplicateFallbackTriggered && sameCpf && sameUnit && hasUserId) {
      duplicateFallbackTriggered = true;
      await originalCreate(payload, ...args);

      const duplicateError = new Error('E11000 duplicate key error collection: funcionarios');
      duplicateError.code = 11000;
      throw duplicateError;
    }

    return originalCreate(payload, ...args);
  };

  try {
    const res = await agent
      .post('/gestor/api/usuarios')
      .send({
        nome: 'Usuário com Fallback de Duplicidade',
        email,
        role: 'diretor',
        unidade_id: String(unidade._id),
        cpf,
        criarNovoFuncionario: true,
      });

    assert.equal(duplicateFallbackTriggered, true);
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.created, true);
    assert.equal(res.body.data?.outcome, 'created');
    assert.ok(res.body.data?.funcionario_id);

    const users = await User.find({ email }).lean();
    assert.equal(users.length, 1);

    const user = users[0];
    assert.equal(String(user.unidade_id), String(unidade._id));
    assert.equal(String(user.funcionario_id), String(res.body.data?.funcionario_id));

    const funcionariosDepois = await Funcionario.find({
      cpf,
      unidade_id: unidade._id,
    }).lean();
    assert.equal(funcionariosDepois.length, 1);

    const funcionarioReutilizado = funcionariosDepois[0];
    assert.equal(String(funcionarioReutilizado._id), String(res.body.data?.funcionario_id));

    const funcionarioAtualizado = await Funcionario.findById(funcionarioReutilizado._id).lean();
    assert.ok(funcionarioAtualizado);
    assert.equal(String(funcionarioAtualizado.usuario_id), String(user._id));

    const memberships = await UserMembership.find({ user_id: user._id }).lean();
    assert.equal(memberships.length, 1);
    assert.equal(String(memberships[0].unidade_id), String(unidade._id));
    assert.equal(memberships[0].papel_contextual, 'gestor');
    assert.equal(String(memberships[0].funcionario_id), String(funcionarioReutilizado._id));
    assert.equal(memberships[0].status, 'active');
    assert.equal(memberships[0].origem, 'gestor-user-admin');
  } finally {
    Funcionario.create = originalCreate;
  }
});