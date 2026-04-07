import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcaoApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const FUNCAO_ID = '507f1f77bcf86cd799439011';
const CONTEXT_PRINCIPAL_ID = '507f191e810c19729de860ea';

function extractGetByIdOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export default {', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de funcoes.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de funcoes.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedGetByIdSnippet() {
  const original = extractGetByIdOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('getFuncaoByIdCore({')) {
    return original;
  }

  const fullBlock = [
    'const contextPrincipalUnitId = await getCanonicalContextPrincipalUnitId(req);',
    '    const funcao = await findFuncaoByIdPopulated(req.params.id, contextPrincipalUnitId || null);',
    "    if (!funcao) return notFound(res,'Função não encontrada');",
    '    return ok(res,{ _id:funcao._id, nome:funcao.nome, descricao:funcao.descricao||\'\', unidade_principal_id: funcao.unidade_principal_id?funcao.unidade_principal_id._id:null, modulos_habilitados:(funcao.modulos_habilitados||[]).map(m=>({_id:m._id,nome:m.nome})) });',
  ].join('\n');

  const blockStart = original.indexOf(fullBlock);
  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de getFuncao.');

  const delegatedBlock = [
    'const contextPrincipalUnitId = await getCanonicalContextPrincipalUnitId(req);',
    'const getResult = await getFuncaoByIdCore({',
    '  id: req.params.id,',
    '  contextPrincipalUnitId,',
    '  findFuncaoByIdPopulated,',
    '});',
    "if (!getResult) return notFound(res,'Função não encontrada');",
    'return ok(res, getResult);',
  ].join('\n    ');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + fullBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de getFuncao em memoria.');
  return replaced;
}

function makeResponseHelpers() {
  function send(res, status, payload) {
    res.status(status);
    res.json(payload);
    return res;
  }

  return {
    ok(res, payload = {}) {
      return send(res, 200, { success: true, data: payload });
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

function buildReq(overrides = {}) {
  return {
    params: { id: FUNCAO_ID },
    body: {},
    query: {},
    unitScope: null,
    session: { user: { role: 'admin' } },
    user: { role: 'admin', isMaster: false },
    ...overrides,
    params: {
      id: FUNCAO_ID,
      ...(overrides.params || {}),
    },
  };
}

function loadGetByIdOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedGetByIdSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findFuncaoByIdPopulatedCalls: [],
    findUnidadeUserBaseLeanCalls: [],
    consoleErrors: [],
  };

  const deps = {
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findFuncaoByNome: runtimeOverrides.findFuncaoByNome ?? (async () => null),
    findOutraFuncaoByNomeExcludingId: runtimeOverrides.findOutraFuncaoByNomeExcludingId ?? (async () => null),
    findUnidadeByIdWithModulosAcessiveis: runtimeOverrides.findUnidadeByIdWithModulosAcessiveis ?? (async () => null),
    findUnidadeUserBaseLean: runtimeOverrides.findUnidadeUserBaseLean ?? (async (unidadeId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);
      return null;
    }),
    findFuncaoByIdPopulated: runtimeOverrides.findFuncaoByIdPopulated ?? (async (id, unidadePrincipalId) => {
      callLog.findFuncaoByIdPopulatedCalls.push([id, unidadePrincipalId]);
      return null;
    }),
    createFuncaoContextPolicyCore: runtimeOverrides.createFuncaoContextPolicyCore ?? (({ findUnidadeUserBaseLean }) => ({
      async resolveCanonicalContextPrincipalUnitId({ scopedUnitId } = {}) {
        const unidadeId = String(scopedUnitId || '').trim();
        if (!unidadeId) return '';
        const unidade = await findUnidadeUserBaseLean(unidadeId);
        if (!unidade) return unidadeId;
        return String(unidade.is_principal ? unidade._id : (unidade.unidade_principal_id || unidade.matriz_id || unidade._id || unidadeId)).trim();
      },
    })),
    createFuncaoWriteValidationCore: runtimeOverrides.createFuncaoWriteValidationCore ?? (() => ({
      async validateCreate() {
        return { data: null };
      },
      async validateUpdate() {
        return { data: null, targetPrincipalUnitId: null };
      },
    })),
    getFuncaoByIdCore: runtimeOverrides.getFuncaoByIdCore ?? (async (input) => {
      callLog.seamCalls.push(input);
      return null;
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
const ok = __deps.ok;
const notFound = __deps.notFound;
const serverError = __deps.serverError;
const findFuncaoByNome = __deps.findFuncaoByNome;
const findOutraFuncaoByNomeExcludingId = __deps.findOutraFuncaoByNomeExcludingId;
const findUnidadeByIdWithModulosAcessiveis = __deps.findUnidadeByIdWithModulosAcessiveis;
const findUnidadeUserBaseLean = __deps.findUnidadeUserBaseLean;
const findFuncaoByIdPopulated = __deps.findFuncaoByIdPopulated;
const createFuncaoContextPolicyCore = __deps.createFuncaoContextPolicyCore;
const createFuncaoWriteValidationCore = __deps.createFuncaoWriteValidationCore;
const getFuncaoByIdCore = __deps.getFuncaoByIdCore;
const console = __deps.console;
${snippet}
return { getFuncao };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('getFuncao: owner resolve contexto antes da seam e preserva 404 quando a seam nao encontra alvo', async () => {
  const callOrder = [];
  let seamArgs = null;
  const { getFuncao, callLog } = loadGetByIdOwnerHarness({
    findUnidadeUserBaseLean: async (unidadeId) => {
      callOrder.push('context');
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);
      return {
        _id: String(unidadeId),
        is_principal: true,
      };
    },
    getFuncaoByIdCore: async (input) => {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      seamArgs = input;
      return null;
    },
  });

  const req = buildReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: CONTEXT_PRINCIPAL_ID },
  });
  const res = makeRes();

  await getFuncao(req, res);

  assert.ok(seamArgs, 'A seam de leitura por id deve ser chamada pelo owner real.');
  assert.deepEqual(Object.keys(seamArgs).sort(), ['contextPrincipalUnitId', 'findFuncaoByIdPopulated', 'id'].sort());
  assert.equal(seamArgs.id, FUNCAO_ID);
  assert.equal(seamArgs.contextPrincipalUnitId, CONTEXT_PRINCIPAL_ID);
  assert.equal(typeof seamArgs.findFuncaoByIdPopulated, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('ok' in seamArgs, false);
  assert.equal('notFound' in seamArgs, false);
  assert.equal('serverError' in seamArgs, false);
  assert.deepEqual(callOrder, ['context', 'seam']);
  assert.deepEqual(callLog.findUnidadeUserBaseLeanCalls, [CONTEXT_PRINCIPAL_ID]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Função não encontrada',
  });
});

test('getFuncao: owner preserva contrato final de sucesso apos a seam normalizar o payload', async () => {
  let seamArgs = null;
  const { getFuncao, callLog } = loadGetByIdOwnerHarness({
    getFuncaoByIdCore: async (input) => {
      callLog.seamCalls.push(input);
      seamArgs = input;

      const funcao = await input.findFuncaoByIdPopulated(input.id, input.contextPrincipalUnitId || null);
      if (!funcao) return null;

      return {
        _id: funcao._id,
        nome: funcao.nome,
        descricao: funcao.descricao || '',
        unidade_principal_id: funcao.unidade_principal_id ? funcao.unidade_principal_id._id : null,
        modulos_habilitados: (funcao.modulos_habilitados || []).map((modulo) => ({ _id: modulo._id, nome: modulo.nome })),
      };
    },
    findFuncaoByIdPopulated: async (id, unidadePrincipalId) => {
      callLog.findFuncaoByIdPopulatedCalls.push([id, unidadePrincipalId]);
      return {
        _id: id,
        nome: 'Supervisor',
        descricao: 'Coordena equipe',
        unidade_principal_id: { _id: CONTEXT_PRINCIPAL_ID, nome: 'Matriz Centro' },
        modulos_habilitados: [
          { _id: 'm-1', nome: 'Dashboard' },
          { _id: 'm-2', nome: 'Funcionarios' },
        ],
      };
    },
  });

  const req = buildReq();
  const res = makeRes();

  await getFuncao(req, res);

  assert.ok(seamArgs, 'A seam de leitura deve ser chamada no caminho de sucesso.');
  assert.deepEqual(callLog.findFuncaoByIdPopulatedCalls, [[FUNCAO_ID, null]]);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: true,
    data: {
      _id: FUNCAO_ID,
      nome: 'Supervisor',
      descricao: 'Coordena equipe',
      unidade_principal_id: CONTEXT_PRINCIPAL_ID,
      modulos_habilitados: [
        { _id: 'm-1', nome: 'Dashboard' },
        { _id: 'm-2', nome: 'Funcionarios' },
      ],
    },
  }));
});

test('getFuncao: owner preserva tratamento de erro externo quando a seam falha', async () => {
  const { getFuncao, callLog } = loadGetByIdOwnerHarness({
    getFuncaoByIdCore: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced get-by-id seam failure');
    },
  });

  const req = buildReq();
  const res = makeRes();

  await getFuncao(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SERVER_ERROR');
  assert.equal(res.body.message, 'forced get-by-id seam failure');
  assert.equal(callLog.consoleErrors.length, 1);
});