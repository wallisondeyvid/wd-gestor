import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcaoApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const CONTEXT_FILIAL_ID = '507f191e810c19729de860aa';
const CONTEXT_PRINCIPAL_ID = '507f191e810c19729de860ea';
const OUTSIDE_PRINCIPAL_ID = '507f191e810c19729de860ff';
const CREATED_FUNCAO_ID = '507f1f77bcf86cd799439011';

function extractCreateOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export default {', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de funcoes.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de funcoes.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedCreateSnippet() {
  const original = extractCreateOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('processCreateFuncaoCore({')) {
    return original;
  }

  const fullBlock = [
    "const dup = await findFuncaoByNome(nome, canonicalPrincipalUnitId); if (dup) return badRequest(res,'Função já cadastrada');",
    '    const unidade = await findUnidadeByIdWithModulosAcessiveis(canonicalPrincipalUnitId);',
    "    if (!unidade) return badRequest(res,'Unidade inválida');",
    '    const lista = normalizarListaModulos(modulos_habilitados);',
    '    const permitidos = new Set((unidade.modulosAcessiveis||[]).map(m=>String(m._id)));',
    '    const modsFiltrados = lista.filter(id=>permitidos.has(String(id)));',
    '    const funcao = await createFuncaoDb({ nome, descricao, unidade_principal_id: canonicalPrincipalUnitId, modulos_habilitados: modsFiltrados });',
    '    return created(res, funcao._id, { data:{ _id: funcao._id } });',
  ].join('\n');

  const blockStart = original.indexOf(fullBlock);
  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de createFuncao.');

  const delegatedBlock = [
    'const createResult = await processCreateFuncaoCore({',
    '  nome,',
    '  descricao,',
    '  canonicalPrincipalUnitId,',
    '  modulosHabilitados: modulos_habilitados,',
    '  findFuncaoByNome,',
    '  findUnidadeByIdWithModulosAcessiveis,',
    '  normalizarListaModulos,',
    '  createFuncaoDb,',
    '});',
    'return created(res, createResult._id, { data:{ _id: createResult._id } });',
  ].join('\n    ');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + fullBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de createFuncao em memoria.');
  return replaced;
}

function makeResponseHelpers() {
  function send(res, status, payload) {
    res.status(status);
    res.json(payload);
    return res;
  }

  return {
    created(res, id, payload = {}) {
      return send(res, 201, { success: true, id, ...payload });
    },
    badRequest(res, message = 'Requisicao invalida') {
      return send(res, 400, { success: false, code: 'BAD_REQUEST', message, error: message });
    },
    notFound(res, message = 'Nao encontrado') {
      return send(res, 404, { success: false, code: 'NOT_FOUND', message });
    },
    serverError(res, error) {
      const message = typeof error === 'string' ? error : error?.message || 'Erro interno';
      return send(res, 500, { success: false, code: 'SERVER_ERROR', message });
    },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function buildReq(body = {}, overrides = {}) {
  return {
    body,
    params: {},
    query: {},
    unitScope: null,
    session: { user: { role: 'admin' } },
    user: { role: 'admin', isMaster: false },
    ...overrides,
  };
}

function loadCreateOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedCreateSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findFuncaoByNomeCalls: [],
    createFuncaoDbCalls: [],
    findUnidadeByIdWithModulosAcessiveisCalls: [],
    findUnidadeUserBaseLeanCalls: [],
    consoleErrors: [],
  };

  const deps = {
    created: runtimeOverrides.created ?? responseHelpers.created,
    badRequest: runtimeOverrides.badRequest ?? responseHelpers.badRequest,
    notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findUnidadeUserBaseLean: runtimeOverrides.findUnidadeUserBaseLean ?? (async (unidadeId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);
      return null;
    }),
    findFuncaoByNome: runtimeOverrides.findFuncaoByNome ?? (async (nome, unidadePrincipalId) => {
      callLog.findFuncaoByNomeCalls.push([nome, unidadePrincipalId]);
      return null;
    }),
    findUnidadeByIdWithModulosAcessiveis: runtimeOverrides.findUnidadeByIdWithModulosAcessiveis ?? (async (unidadePrincipalId) => {
      callLog.findUnidadeByIdWithModulosAcessiveisCalls.push([unidadePrincipalId]);
      return {
        _id: unidadePrincipalId,
        modulosAcessiveis: [
          { _id: 'mod-1' },
          { _id: 'mod-2' },
        ],
      };
    }),
    createFuncaoDb: runtimeOverrides.createFuncaoDb ?? (async (payload) => {
      callLog.createFuncaoDbCalls.push([payload]);
      return { _id: CREATED_FUNCAO_ID, ...payload };
    }),
    processCreateFuncaoCore: runtimeOverrides.processCreateFuncaoCore ?? (async (input) => {
      callLog.seamCalls.push(input);
      return { _id: CREATED_FUNCAO_ID };
    }),
    console: runtimeOverrides.console ?? {
      error(...args) {
        callLog.consoleErrors.push(args);
      },
      log() {},
      warn() {},
    },
  };

  const factoryScript = new vm.Script(`(function (__deps) {
const created = __deps.created;
const badRequest = __deps.badRequest;
const notFound = __deps.notFound;
const serverError = __deps.serverError;
const findUnidadeUserBaseLean = __deps.findUnidadeUserBaseLean;
const findFuncaoByNome = __deps.findFuncaoByNome;
const findUnidadeByIdWithModulosAcessiveis = __deps.findUnidadeByIdWithModulosAcessiveis;
const createFuncaoDb = __deps.createFuncaoDb;
const processCreateFuncaoCore = __deps.processCreateFuncaoCore;
const console = __deps.console;
${snippet}
return { createFuncao };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('createFuncao: owner preserva gate de nome obrigatorio antes da seam', async () => {
  const { createFuncao, callLog } = loadCreateOwnerHarness({
    processCreateFuncaoCore: async () => {
      throw new Error('nao deve delegar create sem nome');
    },
  });

  const req = buildReq({ unidade_principal_id: CONTEXT_PRINCIPAL_ID });
  const res = makeRes();

  await createFuncao(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_REQUEST');
  assert.equal(res.body.message, 'Nome é obrigatório');
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.findUnidadeUserBaseLeanCalls.length, 0);
});

test('createFuncao: owner preserva gate de unidade principal obrigatoria antes da seam', async () => {
  const { createFuncao, callLog } = loadCreateOwnerHarness({
    processCreateFuncaoCore: async () => {
      throw new Error('nao deve delegar create sem principal canonica');
    },
  });

  const req = buildReq({ nome: 'Supervisor' });
  const res = makeRes();

  await createFuncao(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_REQUEST');
  assert.equal(res.body.message, 'Unidade principal é obrigatória');
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.findUnidadeUserBaseLeanCalls.length, 0);
});

test('createFuncao: owner preserva rejeicao de unidade fora do cluster antes da seam', async () => {
  const { createFuncao, callLog } = loadCreateOwnerHarness({
    findUnidadeUserBaseLean: async (unidadeId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);

      if (String(unidadeId) === CONTEXT_FILIAL_ID) {
        return {
          _id: CONTEXT_FILIAL_ID,
          is_principal: false,
          unidade_principal_id: CONTEXT_PRINCIPAL_ID,
        };
      }

      if (String(unidadeId) === OUTSIDE_PRINCIPAL_ID) {
        return {
          _id: OUTSIDE_PRINCIPAL_ID,
          is_principal: true,
        };
      }

      return null;
    },
    processCreateFuncaoCore: async () => {
      throw new Error('nao deve delegar create fora do cluster contextual');
    },
  });

  const req = buildReq(
    {
      nome: 'Supervisor',
      unidade_principal_id: OUTSIDE_PRINCIPAL_ID,
    },
    { unitScope: { unidadeId: CONTEXT_FILIAL_ID } }
  );
  const res = makeRes();

  await createFuncao(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Unidade principal não encontrada');
  assert.equal(callLog.seamCalls.length, 0);
  assert.deepEqual(callLog.findUnidadeUserBaseLeanCalls, [
    CONTEXT_FILIAL_ID,
    CONTEXT_FILIAL_ID,
    OUTSIDE_PRINCIPAL_ID,
  ]);
});

test('createFuncao: owner resolve contexto antes da seam e preserva contrato final de created', async () => {
  const callOrder = [];
  let seamArgs = null;
  const { createFuncao, callLog } = loadCreateOwnerHarness({
    findUnidadeUserBaseLean: async (unidadeId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);
      return {
        _id: String(unidadeId),
        is_principal: false,
        unidade_principal_id: CONTEXT_PRINCIPAL_ID,
      };
    },
    findFuncaoByNome: async (nome, unidadePrincipalId) => {
      callLog.findFuncaoByNomeCalls.push([nome, unidadePrincipalId]);
      return null;
    },
    findUnidadeByIdWithModulosAcessiveis: async (unidadePrincipalId) => {
      callLog.findUnidadeByIdWithModulosAcessiveisCalls.push([unidadePrincipalId]);
      return {
        _id: unidadePrincipalId,
        modulosAcessiveis: [
          { _id: 'mod-1' },
          { _id: 'mod-2' },
        ],
      };
    },
    createFuncaoDb: async (payload) => {
      callLog.createFuncaoDbCalls.push([payload]);
      return { _id: CREATED_FUNCAO_ID, ...payload };
    },
    processCreateFuncaoCore: async (input) => {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      seamArgs = input;

      const dup = await input.findFuncaoByNome(input.nome, input.canonicalPrincipalUnitId);
      assert.equal(dup, null);

      const unidade = await input.findUnidadeByIdWithModulosAcessiveis(input.canonicalPrincipalUnitId);
      const lista = input.normalizarListaModulos(input.modulosHabilitados);
      const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
      const modsFiltrados = lista.filter((id) => permitidos.has(String(id)));
      const createdFuncao = await input.createFuncaoDb({
        nome: input.nome,
        descricao: input.descricao,
        unidade_principal_id: input.canonicalPrincipalUnitId,
        modulos_habilitados: modsFiltrados,
      });

      return { _id: createdFuncao._id };
    },
    created: (res, id, payload = {}) => {
      callOrder.push('created');
      res.status(201);
      res.json({ success: true, id, ...payload });
      return res;
    },
  });

  const req = buildReq(
    {
      nome: 'Supervisor',
      descricao: 'Coordena equipe',
      unidade_principal_id: CONTEXT_FILIAL_ID,
      modulos_habilitados: ['mod-1', 'mod-x', 'mod-2'],
    },
    { unitScope: { unidadeId: CONTEXT_FILIAL_ID } }
  );
  const res = makeRes();

  await createFuncao(req, res);

  assert.ok(seamArgs, 'A seam de create deve ser chamada pelo owner real.');
  assert.deepEqual(
    Object.keys(seamArgs).sort(),
    ['canonicalPrincipalUnitId', 'createFuncaoDb', 'descricao', 'findFuncaoByNome', 'findUnidadeByIdWithModulosAcessiveis', 'modulosHabilitados', 'nome', 'normalizarListaModulos'].sort()
  );
  assert.equal(seamArgs.nome, 'Supervisor');
  assert.equal(seamArgs.descricao, 'Coordena equipe');
  assert.equal(seamArgs.canonicalPrincipalUnitId, CONTEXT_PRINCIPAL_ID);
  assert.deepEqual(seamArgs.modulosHabilitados, ['mod-1', 'mod-x', 'mod-2']);
  assert.equal(typeof seamArgs.findFuncaoByNome, 'function');
  assert.equal(typeof seamArgs.findUnidadeByIdWithModulosAcessiveis, 'function');
  assert.equal(typeof seamArgs.normalizarListaModulos, 'function');
  assert.equal(typeof seamArgs.createFuncaoDb, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('created' in seamArgs, false);
  assert.equal('badRequest' in seamArgs, false);
  assert.equal('notFound' in seamArgs, false);
  assert.equal('serverError' in seamArgs, false);
  assert.deepEqual(callLog.findUnidadeUserBaseLeanCalls, [
    CONTEXT_FILIAL_ID,
    CONTEXT_FILIAL_ID,
    CONTEXT_FILIAL_ID,
  ]);
  assert.deepEqual(callLog.findFuncaoByNomeCalls, [['Supervisor', CONTEXT_PRINCIPAL_ID]]);
  assert.deepEqual(callLog.findUnidadeByIdWithModulosAcessiveisCalls, [[CONTEXT_PRINCIPAL_ID]]);
  assert.deepEqual(callLog.createFuncaoDbCalls, [[{
    nome: 'Supervisor',
    descricao: 'Coordena equipe',
    unidade_principal_id: CONTEXT_PRINCIPAL_ID,
    modulos_habilitados: ['mod-1', 'mod-2'],
  }]]);
  assert.deepEqual(callOrder, ['seam', 'created']);
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: true,
    id: CREATED_FUNCAO_ID,
    data: {
      _id: CREATED_FUNCAO_ID,
    },
  }));
});

test('createFuncao: owner preserva tratamento de erro externo quando a seam falha', async () => {
  const { createFuncao, callLog } = loadCreateOwnerHarness({
    processCreateFuncaoCore: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced create seam failure');
    },
  });

  const req = buildReq({
    nome: 'Supervisor',
    unidade_principal_id: CONTEXT_PRINCIPAL_ID,
  });
  const res = makeRes();

  await createFuncao(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SERVER_ERROR');
  assert.equal(res.body.message, 'forced create seam failure');
  assert.equal(callLog.consoleErrors.length, 1);
});