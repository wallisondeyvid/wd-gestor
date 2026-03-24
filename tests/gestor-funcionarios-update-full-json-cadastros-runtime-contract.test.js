import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { createServer } from '../src/server/createServer.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import Funcionario from '../src/core/models/Funcionario.js';
import { createUnitScope } from '../src/shared/unitScope.js';
import { resolveModel } from '../src/shared/db/resolveModel.js';

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
  return String(value || '').trim();
}

function buildRg() {
  return `RG-${Date.now()}-${nextCounter()}`;
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
    },
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

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

  const unidadeA = await Unidade.create({
    nome: `Principal A ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    is_principal: true,
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  });

  const unidadeB = await Unidade.create({
    nome: `Filial B ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    ativa: true,
    unidade_principal_id: unidadeA._id,
    modulosAcessiveis: [moduloGestor._id],
  });

  const unidadeC = await Unidade.create({
    nome: `Principal C ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    is_principal: true,
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  });

  return { unidadeA, unidadeB, unidadeC };
}

function getTenantModel(modelClass, unidadeId) {
  return resolveModel({
    name: modelClass.modelName,
    schema: modelClass.schema,
    unitScope: createUnitScope({ unidadeId: normalizeId(unidadeId) }),
  });
}

async function createFuncionarioInTenant(unidadeId, overrides = {}) {
  const FuncionarioModel = getTenantModel(Funcionario, unidadeId);
  return FuncionarioModel.create({
    unidade_id: unidadeId,
    nome: overrides.nome || `Funcionario ${Date.now()}-${nextCounter()}`,
    rg: overrides.rg || buildRg(),
    cpf: overrides.cpf || uniqueCpf(),
    data_nascimento: overrides.data_nascimento || new Date('1990-01-01T00:00:00.000Z'),
    sexo: overrides.sexo || 'M',
    endereco: overrides.endereco || { cep: '01001000' },
    email: overrides.email || uniqueEmail('funcionario-update-full-json-cadastros'),
    telefone: overrides.telefone || '(11) 99999-9999',
    ativo: overrides.ativo ?? true,
    ...overrides,
  });
}

async function authenticateContextualAgent(app, { unidadeId, papelContextual = 'gestor' }) {
  const email = uniqueEmail('funcionario-update-full-json-cadastros-context');
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  const user = await User.create({
    email,
    senha: senhaHash,
    cpf: uniqueCpf(),
    role: 'user',
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: `Gestor Contextual ${nextCounter()}`,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    status: 'active',
    origem: 'func-update-full-json-cadastros-test',
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });

  assert.equal(loginRes.status, 303);
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, email };
}

async function withHarness(run) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  const prevAuthContextFlag = process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
  process.env.MONGO_MEMORY = '1';
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '1';

  const { app, close } = await createServer({ skipDb: false });
  app.locals.gestorAuthContextFeatureFlags = {
    gestor_auth_context_resolver: true,
  };
  delete app.locals.gestorAuthContextResolverDeps;
  delete app.locals.gestorAuthContextMaxTimeMS;

  const teardownGuard = installTeardownSuppression();
  const createdEmails = [];

  try {
    const { unidadeA, unidadeB, unidadeC } = await createModuloAndUnits();
    const contextualAuth = await authenticateContextualAgent(app, {
      unidadeId: unidadeB._id,
    });
    createdEmails.push(contextualAuth.email);

    await run({
      app,
      unidadeA,
      unidadeB,
      unidadeC,
      contextualAgent: contextualAuth.agent,
    });
  } finally {
    try {
      if (createdEmails.length > 0) {
        try {
          await User.deleteMany({ email: { $in: createdEmails } });
        } catch {}
      }
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
      if (prevAuthContextFlag === undefined) delete process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      else process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = prevAuthContextFlag;
    }
  }
}

function buildDependente(overrides = {}) {
  return {
    nome: overrides.nome || 'Dependente Runtime',
    parentesco: overrides.parentesco || 'Filho(a)',
    data_nascimento: overrides.data_nascimento || '2015-02-03',
    cpf: overrides.cpf,
    salario_familia: overrides.salario_familia,
    irpf: overrides.irpf,
  };
}

function buildBeneficio(overrides = {}) {
  return {
    tipo: overrides.tipo || 'VT',
    nome: overrides.nome || 'Vale Transporte Municipal',
    cnpj_plano: overrides.cnpj_plano,
    tipo_valor: overrides.tipo_valor || 'R$',
    valor: overrides.valor,
    inicio: overrides.inicio || 'admissao',
    data_inicio: overrides.data_inicio || '2024-05-10',
  };
}

test('PUT full json cadastros: sem sessao retorna 401', async () => {
  await withHarness(async ({ app, unidadeB }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);

    const res = await request(app)
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ dependentes_json: JSON.stringify([buildDependente()]) });

    assert.equal(res.status, 401);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'UNAUTHORIZED');
  });
});

test('PUT full json cadastros: fora do escopo contextual retorna 404', async () => {
  await withHarness(async ({ unidadeC, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeC._id);

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ beneficios_json: JSON.stringify([buildBeneficio()]) });

    assert.equal(res.status, 404);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'NOT_FOUND');
    assert.equal(res.body?.message, 'Funcionário não encontrado');
  });
});

test('PUT full json cadastros: funcionario inexistente retorna 404', async () => {
  await withHarness(async ({ contextualAgent }) => {
    const res = await contextualAgent
      .put('/gestor/api/funcionarios/64f111111111111111111111')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ dependentes_json: JSON.stringify([buildDependente()]) });

    assert.equal(res.status, 404);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'NOT_FOUND');
    assert.equal(res.body?.message, 'Funcionário não encontrado');
  });
});

test('PUT full json cadastros: sucesso com dependentes_json valido', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      dependentes: [],
    });
    const dependentes = [
      buildDependente({
        nome: 'Alice Dependente',
        parentesco: 'Filha',
        data_nascimento: '2016-04-05',
        cpf: '12345678901',
        salario_familia: true,
        irpf: false,
      }),
    ];

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ dependentes_json: JSON.stringify(dependentes) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.equal(Array.isArray(persisted.dependentes), true);
    assert.equal(persisted.dependentes.length, 1);
    assert.equal(persisted.dependentes[0]?.nome, 'Alice Dependente');
    assert.equal(persisted.dependentes[0]?.parentesco, 'Filha');
    assert.equal(new Date(persisted.dependentes[0]?.data_nascimento).toISOString().slice(0, 10), '2016-04-05');
    assert.equal(persisted.dependentes[0]?.cpf, '12345678901');
    assert.equal(persisted.dependentes[0]?.salario_familia, true);
    assert.equal(persisted.dependentes[0]?.irpf, false);
  });
});

test('PUT full json cadastros: sucesso com beneficios_json valido', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      beneficios: [],
    });
    const beneficios = [
      buildBeneficio({
        tipo: 'VA',
        nome: 'Vale Alimentacao',
        tipo_valor: 'R$',
        valor: 321.45,
        inicio: 'outra data',
        data_inicio: '2024-06-01',
      }),
    ];

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ beneficios_json: JSON.stringify(beneficios) });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.equal(Array.isArray(persisted.beneficios), true);
    assert.equal(persisted.beneficios.length, 1);
    assert.equal(persisted.beneficios[0]?.tipo, 'VA');
    assert.equal(persisted.beneficios[0]?.nome, 'Vale Alimentacao');
    assert.equal(persisted.beneficios[0]?.tipo_valor, 'R$');
    assert.equal(persisted.beneficios[0]?.valor, 321.45);
    assert.equal(new Date(persisted.beneficios[0]?.data_inicio).toISOString().slice(0, 10), '2024-06-01');
  });
});

test('PUT full json cadastros: sucesso com dependentes_json e beneficios_json juntos', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      dependentes: [],
      beneficios: [],
    });
    const dependentes = [
      buildDependente({
        nome: 'Bruno Dependente',
        parentesco: 'Filho',
        data_nascimento: '2018-08-09',
        cpf: '99888777666',
      }),
    ];
    const beneficios = [
      buildBeneficio({
        tipo: 'VR',
        nome: 'Vale Refeicao',
        valor: 25.5,
        inicio: 'admissao',
        data_inicio: '2024-01-02',
      }),
    ];

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        dependentes_json: JSON.stringify(dependentes),
        beneficios_json: JSON.stringify(beneficios),
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.equal(persisted.dependentes?.length, 1);
    assert.equal(persisted.beneficios?.length, 1);
    assert.equal(persisted.dependentes[0]?.nome, 'Bruno Dependente');
    assert.equal(persisted.beneficios[0]?.tipo, 'VR');
  });
});

test('PUT full json cadastros: normaliza CPF dos dependentes de forma observavel', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      dependentes: [],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        dependentes_json: JSON.stringify([
          buildDependente({
            nome: 'CPF Formatado',
            cpf: '123.456.789-01',
          }),
        ]),
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.equal(persisted.dependentes?.length, 1);
    assert.equal(persisted.dependentes[0]?.cpf, '12345678901');
  });
});

test('PUT full json cadastros: dependentes_json invalido converge para array vazio no runtime atual', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      dependentes: [buildDependente({ nome: 'Dependente Antigo', cpf: '11122233344' })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ dependentes_json: '{invalido' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.deepEqual(persisted.dependentes, []);
  });
});

test('PUT full json cadastros: beneficios_json invalido converge para array vazio no runtime atual', async () => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id, {
      beneficios: [buildBeneficio({ tipo: 'PS', nome: 'Plano Antigo', valor: 99.9 })],
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ beneficios_json: '{invalido' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.updated, true);

    const persisted = await getTenantModel(Funcionario, unidadeB._id).findById(funcionario._id).lean();
    assert.deepEqual(persisted.beneficios, []);
  });
});

test('PUT full json cadastros: erro interno induzido no update retorna 500', async (t) => {
  await withHarness(async ({ unidadeB, contextualAgent }) => {
    const funcionario = await createFuncionarioInTenant(unidadeB._id);
    const FuncionarioModel = getTenantModel(Funcionario, unidadeB._id);

    t.mock.method(FuncionarioModel, 'findOneAndUpdate', async () => {
      throw new Error('forced update full json cadastros failure');
    });

    const res = await contextualAgent
      .put(`/gestor/api/funcionarios/${normalizeId(funcionario._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ dependentes_json: JSON.stringify([buildDependente()]) });

    assert.equal(res.status, 500);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.code, 'SERVER_ERROR');
    assert.equal(res.body?.message, 'Erro interno');
  });
});