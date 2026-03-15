import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { createServer } from '../src/server/createServer.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import Funcao from '../src/core/models/funcao.js';
import Funcionario from '../src/core/models/Funcionario.js';
import Setor from '../src/core/models/setor.js';
import { paginaFuncoes, paginaFuncionarios } from '../src/modules/gestor/app/controllers/views/pagesController.js';
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

async function authenticateAgent(app, { role, unidadeId = null, nomeBase }) {
  const email = uniqueEmail(`tenant-only-${role}`);
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

  if (unidadeId) payload.unidade_id = unidadeId;

  await User.create(payload);

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(
    loginRes.status >= 300 && loginRes.status < 400,
    `Login ${role} deve redirecionar, recebido ${loginRes.status} com body ${JSON.stringify(loginRes.body)}`,
  );

  return { agent, email };
}

function getTenantModel(modelClass, unidadeId) {
  return resolveModel({
    name: modelClass.modelName,
    schema: modelClass.schema,
    unitScope: createUnitScope({ unidadeId: normalizeId(unidadeId) }),
  });
}

async function createFuncaoInTenant(unidadePrincipalId, { nome, descricao }) {
  const FuncaoModel = getTenantModel(Funcao, unidadePrincipalId);
  return FuncaoModel.create({
    nome,
    descricao,
    ativa: true,
    unidade_principal_id: unidadePrincipalId,
  });
}

async function createFuncionarioInTenant(unidadeId, { nome, email, cpf, funcaoId = null, sexo = 'M' }) {
  const FuncionarioModel = getTenantModel(Funcionario, unidadeId);
  return FuncionarioModel.create({
    unidade_id: unidadeId,
    funcao_id: funcaoId || undefined,
    nome,
    rg: `RG-${nextCounter()}`,
    cpf,
    data_nascimento: new Date('1990-01-01T00:00:00.000Z'),
    sexo,
    endereco: { cep: '01001000' },
    email,
    telefone: '(11) 99999-9999',
    ativo: true,
  });
}

async function withHarness(run) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();
  const createdEmails = [];

  try {
    const { unidadeA, unidadeB, unidadeC } = await createModuloAndUnits();
    const diretorFilialAuth = await authenticateAgent(app, {
      role: 'diretor',
      unidadeId: unidadeB._id,
      nomeBase: 'Diretor Filial Contextual',
    });
    createdEmails.push(diretorFilialAuth.email);

    await run({
      app,
      unidadeA,
      unidadeB,
      unidadeC,
      diretorFilialAgent: diretorFilialAuth.agent,
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
    }
  }
}

test('Funções HTML: filial contextual renderiza apenas a principal canônica do contexto atual', async () => {
  await withHarness(async ({ unidadeA, unidadeB, unidadeC, diretorFilialAgent }) => {
    const funcaoAName = `Funcao Principal A ${Date.now()}-${nextCounter()}`;
    const funcaoCName = `Funcao Principal C ${Date.now()}-${nextCounter()}`;

    await createFuncaoInTenant(unidadeA._id, {
      nome: funcaoAName,
      descricao: 'Função visível no contexto da filial',
    });

    await createFuncaoInTenant(unidadeC._id, {
      nome: funcaoCName,
      descricao: 'Função fora do contexto atual',
    });

    const res = await diretorFilialAgent
      .get('/gestor/funcoes')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, new RegExp(escapeRegExp(funcaoAName)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(funcaoCName)));
    assert.match(res.text, new RegExp(escapeRegExp(unidadeA.nome)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(unidadeC.nome)));
    assert.doesNotMatch(res.text, new RegExp(escapeRegExp(normalizeId(unidadeB._id))));
  });
});

test('Funções API: filial contextual resolve a lista pela principal canônica atual', async () => {
  await withHarness(async ({ unidadeA, unidadeB, unidadeC, diretorFilialAgent }) => {
    const funcaoAName = `Funcao API A ${Date.now()}-${nextCounter()}`;
    const funcaoCName = `Funcao API C ${Date.now()}-${nextCounter()}`;

    await createFuncaoInTenant(unidadeA._id, {
      nome: funcaoAName,
      descricao: 'Função disponível para a filial pela matriz',
    });

    await createFuncaoInTenant(unidadeC._id, {
      nome: funcaoCName,
      descricao: 'Função fora do contexto atual',
    });

    const res = await diretorFilialAgent
      .get(`/gestor/api/funcoes/unidade/${normalizeId(unidadeB._id)}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    const data = Array.isArray(res.body) ? res.body : (Array.isArray(res.body?.data) ? res.body.data : []);
    assert.ok(data.some((item) => String(item?.nome || item?.descricao_final || '') === funcaoAName));
    assert.equal(data.some((item) => String(item?.nome || item?.descricao_final || '') === funcaoCName), false);
  });
});

test('Funções API: filial contextual bloqueia criação em principal fora do contexto atual', async () => {
  await withHarness(async ({ unidadeC, diretorFilialAgent }) => {
    const res = await diretorFilialAgent
      .post('/gestor/api/funcoes')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        nome: `Funcao Bloqueada ${Date.now()}-${nextCounter()}`,
        descricao: 'Nao deveria criar fora do contexto atual',
        unidade_principal_id: normalizeId(unidadeC._id),
        modulos_habilitados: [],
      });

    assert.equal(res.status, 404);
  });
});

test('Funções API: bulk update contextual atualiza apenas o cluster permitido e trata item externo como nao encontrada', async () => {
  await withHarness(async ({ unidadeA, unidadeC, diretorFilialAgent }) => {
    const funcaoPermitida = await createFuncaoInTenant(unidadeA._id, {
      nome: `Funcao Bulk Permitida ${Date.now()}-${nextCounter()}`,
      descricao: 'Funcao do cluster contextual atual',
    });
    const funcaoExterna = await createFuncaoInTenant(unidadeC._id, {
      nome: `Funcao Bulk Externa ${Date.now()}-${nextCounter()}`,
      descricao: 'Funcao fora do contexto atual',
    });

    const nomeAtualizado = `Funcao Bulk Atualizada ${Date.now()}-${nextCounter()}`;
    const descricaoAtualizada = 'Descricao atualizada no cluster permitido';
    const nomeExternoTentado = `Funcao Bulk Externa Tentada ${Date.now()}-${nextCounter()}`;
    const descricaoExternaTentada = 'Descricao que nao deveria persistir fora do contexto';

    const res = await diretorFilialAgent
      .post('/gestor/api/funcoes/bulk-update')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        itens: [
          {
            _id: normalizeId(funcaoPermitida._id),
            nome: nomeAtualizado,
            descricao: descricaoAtualizada,
          },
          {
            _id: normalizeId(funcaoExterna._id),
            nome: nomeExternoTentado,
            descricao: descricaoExternaTentada,
          },
        ],
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));

    const payload = res.body?.data || res.body;
    assert.equal(payload.updated, 1);
    assert.ok(Array.isArray(payload.results));

    const resultadoPermitido = payload.results.find((item) => String(item?._id || '') === normalizeId(funcaoPermitida._id));
    const resultadoExterno = payload.results.find((item) => String(item?._id || '') === normalizeId(funcaoExterna._id));

    assert.equal(resultadoPermitido?.ok, true);
    assert.equal(resultadoPermitido?.changed, true);
    assert.equal(resultadoExterno?.ok, false);
    assert.equal(resultadoExterno?.motivo, 'Nao encontrada');

    const funcaoPermitidaAtualizada = await getTenantModel(Funcao, unidadeA._id).findById(funcaoPermitida._id).lean();
    const funcaoExternaAtual = await getTenantModel(Funcao, unidadeC._id).findById(funcaoExterna._id).lean();

    assert.equal(funcaoPermitidaAtualizada?.nome, nomeAtualizado);
    assert.equal(funcaoPermitidaAtualizada?.descricao, descricaoAtualizada);
    assert.equal(funcaoExternaAtual?.nome, funcaoExterna.nome);
    assert.equal(funcaoExternaAtual?.descricao, funcaoExterna.descricao);
  });
});

test('Funções fallback: principal já alinhada no request evita voltar para a unidade legada ao montar principal e lista', async () => {
  await withHarness(async ({ app, unidadeA, unidadeB, unidadeC }) => {
    const funcaoAName = `Funcao Fallback A ${Date.now()}-${nextCounter()}`;
    const funcaoCName = `Funcao Fallback C ${Date.now()}-${nextCounter()}`;
    const email = uniqueEmail('pagina-funcoes-fallback');

    await createFuncaoInTenant(unidadeA._id, {
      nome: funcaoAName,
      descricao: 'Função da principal já alinhada no request',
    });

    await createFuncaoInTenant(unidadeC._id, {
      nome: funcaoCName,
      descricao: 'Função fora do contexto esperado',
    });

    const req = {
      app,
      path: '/funcoes',
      originalUrl: '/gestor/funcoes',
      baseUrl: '/gestor',
      headers: { accept: 'text/html' },
      user: {
        id: 'context-user-funcoes',
        _id: 'context-user-funcoes',
        email,
        role: 'diretor',
        isMaster: false,
        unidade_id: unidadeB._id,
        unidade_principal_id: unidadeA._id,
      },
      session: {
        user: {
          id: 'context-user-funcoes',
          email,
          role: 'diretor',
          unidade_id: unidadeB._id,
          unidade_principal_id: unidadeA._id,
        },
      },
    };

    const renderState = {
      statusCode: 200,
      view: null,
      locals: null,
    };
    const res = {
      status(code) {
        renderState.statusCode = code;
        return this;
      },
      render(view, locals) {
        renderState.view = view;
        renderState.locals = locals;
        return this;
      },
      send(payload) {
        renderState.sendPayload = payload;
        return this;
      },
    };

    await paginaFuncoes(req, res);

    assert.equal(renderState.statusCode, 200);
    assert.equal(renderState.view, 'funcoes');

    const nomesFuncoes = (renderState.locals?.funcoesFiltradas || []).map((funcao) => String(funcao?.nome || ''));
    assert.ok(nomesFuncoes.includes(funcaoAName));
    assert.equal(nomesFuncoes.includes(funcaoCName), false);

    const unidadesPrincipaisIds = (renderState.locals?.unidadesPrincipaisFiltradas || []).map((unidade) => normalizeId(unidade?._id));
    assert.ok(unidadesPrincipaisIds.includes(normalizeId(unidadeA._id)));
    assert.equal(unidadesPrincipaisIds.includes(normalizeId(unidadeB._id)), false);
    assert.equal(unidadesPrincipaisIds.includes(normalizeId(unidadeC._id)), false);
  });
});

test('Funcionários HTML: filial contextual renderiza apenas a unidade canônica atual no formulário', async () => {
  await withHarness(async ({ unidadeA, unidadeB, diretorFilialAgent }) => {
    await createFuncionarioInTenant(unidadeA._id, {
      nome: `Funcionario A ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-a'),
      cpf: uniqueCpf(),
      sexo: 'M',
    });

    await createFuncionarioInTenant(unidadeB._id, {
      nome: `Funcionario B ${Date.now()}-${nextCounter()}`,
      email: uniqueEmail('func-b'),
      cpf: uniqueCpf(),
      sexo: 'F',
    });

    const res = await diretorFilialAgent
      .get('/gestor/funcionarios')
      .set('Accept', 'text/html')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, new RegExp(`data-unidade-default="${escapeRegExp(normalizeId(unidadeA._id))}"`));
  });
});

test('Funcionários fallback: principal já alinhada no request evita voltar para a unidade legada ao montar default e lista', async () => {
  await withHarness(async ({ app, unidadeA, unidadeB, unidadeC }) => {
    const funcionarioAName = `Funcionario Principal A ${Date.now()}-${nextCounter()}`;
    const funcionarioBName = `Funcionario Filial B ${Date.now()}-${nextCounter()}`;
    const funcionarioCName = `Funcionario Principal C ${Date.now()}-${nextCounter()}`;
    const email = uniqueEmail('pagina-funcionarios-fallback');

    await createFuncionarioInTenant(unidadeA._id, {
      nome: funcionarioAName,
      email: email,
      cpf: uniqueCpf(),
      sexo: 'M',
    });

    await createFuncionarioInTenant(unidadeB._id, {
      nome: funcionarioBName,
      email: uniqueEmail('pagina-funcionarios-filial'),
      cpf: uniqueCpf(),
      sexo: 'F',
    });

    await createFuncionarioInTenant(unidadeC._id, {
      nome: funcionarioCName,
      email: uniqueEmail('pagina-funcionarios-fora-contexto'),
      cpf: uniqueCpf(),
      sexo: 'F',
    });

    const req = {
      app,
      path: '/funcionarios',
      originalUrl: '/gestor/funcionarios',
      baseUrl: '/gestor',
      headers: { accept: 'text/html' },
      user: {
        id: 'context-user',
        _id: 'context-user',
        email,
        role: 'diretor',
        isMaster: false,
        unidade_id: unidadeB._id,
        unidade_principal_id: unidadeA._id,
      },
      session: {
        user: {
          id: 'context-user',
          email,
          role: 'diretor',
          unidade_id: unidadeB._id,
          unidade_principal_id: unidadeA._id,
        },
      },
    };

    const renderState = {
      statusCode: 200,
      view: null,
      locals: null,
    };
    const res = {
      status(code) {
        renderState.statusCode = code;
        return this;
      },
      render(view, locals) {
        renderState.view = view;
        renderState.locals = locals;
        return this;
      },
      send(payload) {
        renderState.sendPayload = payload;
        return this;
      },
    };

    await paginaFuncionarios(req, res);

    assert.equal(renderState.statusCode, 200);
    assert.equal(renderState.view, 'funcionarios/funcionarios_index');
    assert.equal(renderState.locals?.unidadeContextualId, normalizeId(unidadeA._id));

    const nomesFuncionarios = (renderState.locals?.funcionarios || []).map((funcionario) => String(funcionario?.nome || ''));
    assert.ok(nomesFuncionarios.includes(funcionarioAName));
    assert.equal(nomesFuncionarios.includes(funcionarioBName), false);
    assert.equal(nomesFuncionarios.includes(funcionarioCName), false);
  });
});

test('Funcionários bridge: findSetoresByCondNomeOrdenadosSelectLean usa tenant quando o filtro aponta para uma única unidade', async () => {
  const prevMultiDb = process.env.WD_MULTI_DB;
  const prevAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const prevHandshake = process.env.WD_USERDB_HANDSHAKE;

  process.env.WD_MULTI_DB = '1';
  process.env.WD_USERDB_HANDSHAKE = '0';

  try {
    await withHarness(async ({ unidadeC }) => {
      const setorNome = `Setor Tenant C ${Date.now()}-${nextCounter()}`;
      process.env.WD_MULTI_DB_ALLOWLIST = normalizeId(unidadeC._id);

      const cacheBust = `bridge-setor-${Date.now()}-${nextCounter()}`;
      const [apiDbModule, resolveModelModule] = await Promise.all([
        import(`../src/modules/gestor/app/db/api.db.js?${cacheBust}`),
        import(`../src/shared/db/resolveModel.js?${cacheBust}`),
      ]);

      const TenantSetor = resolveModelModule.resolveModel({
        name: Setor.modelName,
        schema: Setor.schema,
        unitScope: createUnitScope({ unidadeId: normalizeId(unidadeC._id) }),
      });

      await Setor.deleteMany({ nome: setorNome });
      await TenantSetor.deleteMany({ nome: setorNome });

      await TenantSetor.create({
        codigo: nextCounter(),
        nome: setorNome,
        descricao: 'Setor servido pela bridge tenant-aware',
        unidade_id: unidadeC._id,
        ativo: true,
      });

      const setores = await apiDbModule.findSetoresByCondNomeOrdenadosSelectLean({
        ativo: true,
        unidade_id: { $in: [unidadeC._id] },
      });

      assert.equal(Array.isArray(setores), true);
      assert.equal(
        setores.some((setor) => String(setor?.nome || '') === setorNome),
        true,
      );
    });
  } finally {
    if (prevMultiDb === undefined) delete process.env.WD_MULTI_DB;
    else process.env.WD_MULTI_DB = prevMultiDb;

    if (prevAllowlist === undefined) delete process.env.WD_MULTI_DB_ALLOWLIST;
    else process.env.WD_MULTI_DB_ALLOWLIST = prevAllowlist;

    if (prevHandshake === undefined) delete process.env.WD_USERDB_HANDSHAKE;
    else process.env.WD_USERDB_HANDSHAKE = prevHandshake;
  }
});