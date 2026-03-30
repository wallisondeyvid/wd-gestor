import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/setorApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const PARAM_UNIT_ID = 'u-param';
const SCOPED_UNIT_ID = 'u-contexto';

function extractGetByUnitOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export default {', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de setores.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de setores.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedGetByUnitSnippet() {
  const original = extractGetByUnitOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('getSetoresByUnitCore({')) {
    return original;
  }

  const fullBlock = [
    'const unidadeId = getCanonicalContextUnitId(req) || normalizeUnitId(req.params.unidadeId);',
    "    if (!unidadeId || unidadeId==='null') return ok(res,[]);",
    '    const setores = await findSetoresByUnidadeIdPopulateLean(unidadeId);',
    '    return ok(res,setores);',
  ].join('\n');

  const blockStart = original.indexOf(fullBlock);
  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de getSetoresPorUnidade.');

  const delegatedBlock = [
    'const effectiveUnitId = getCanonicalContextUnitId(req) || normalizeUnitId(req.params.unidadeId);',
    "if (!effectiveUnitId || effectiveUnitId==='null') return ok(res,[]);",
    'const result = await getSetoresByUnitCore({',
    '  effectiveUnitId,',
    '  findSetoresByUnidadeIdPopulateLean,',
    '});',
    'return ok(res, result);',
  ].join('\n    ');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + fullBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de getSetoresPorUnidade em memoria.');
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
    params: { unidadeId: PARAM_UNIT_ID },
    body: {},
    query: {},
    unitScope: null,
    session: { user: { role: 'admin' } },
    user: { role: 'admin', isMaster: false },
    ...overrides,
    params: {
      unidadeId: PARAM_UNIT_ID,
      ...(overrides.params || {}),
    },
  };
}

function loadGetByUnitOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedGetByUnitSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findSetoresByUnidadeIdPopulateLeanCalls: [],
    consoleErrors: [],
  };

  const deps = {
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findSetoresByUnidadeIdPopulateLean: runtimeOverrides.findSetoresByUnidadeIdPopulateLean ?? (async (unidadeId) => {
      callLog.findSetoresByUnidadeIdPopulateLeanCalls.push([unidadeId]);
      return [];
    }),
    getSetoresByUnitCore: runtimeOverrides.getSetoresByUnitCore ?? (async (input) => {
      callLog.seamCalls.push(input);
      return [];
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
const serverError = __deps.serverError;
const findSetoresByUnidadeIdPopulateLean = __deps.findSetoresByUnidadeIdPopulateLean;
const getSetoresByUnitCore = __deps.getSetoresByUnitCore;
const console = __deps.console;
${snippet}
return { getSetoresPorUnidade };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('getSetoresPorUnidade: owner preserva retorno vazio imediato antes da seam', async () => {
  const { getSetoresPorUnidade, callLog } = loadGetByUnitOwnerHarness({
    getSetoresByUnitCore: async () => {
      throw new Error('nao deve delegar quando unidadeId e vazio');
    },
  });

  const req = buildReq({ params: { unidadeId: 'null' } });
  const res = makeRes();

  await getSetoresPorUnidade(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({ success: true, data: [] }));
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.findSetoresByUnidadeIdPopulateLeanCalls.length, 0);
});

test('getSetoresPorUnidade: owner resolve unidade efetiva antes da seam e preserva contrato final de sucesso', async () => {
  let seamArgs = null;
  const { getSetoresPorUnidade, callLog } = loadGetByUnitOwnerHarness({
    getSetoresByUnitCore: async (input) => {
      callLog.seamCalls.push(input);
      seamArgs = input;
      return await input.findSetoresByUnidadeIdPopulateLean(input.effectiveUnitId);
    },
    findSetoresByUnidadeIdPopulateLean: async (unidadeId) => {
      callLog.findSetoresByUnidadeIdPopulateLeanCalls.push([unidadeId]);
      return [
        { _id: 's-1', nome: 'Financeiro', unidade_id: { _id: unidadeId } },
        { _id: 's-2', nome: 'RH', unidade_id: { _id: unidadeId } },
      ];
    },
  });

  const req = buildReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: SCOPED_UNIT_ID },
    params: { unidadeId: PARAM_UNIT_ID },
  });
  const res = makeRes();

  await getSetoresPorUnidade(req, res);

  assert.ok(seamArgs, 'A seam de leitura por unidade deve ser chamada pelo owner real.');
  assert.deepEqual(Object.keys(seamArgs).sort(), ['effectiveUnitId', 'findSetoresByUnidadeIdPopulateLean'].sort());
  assert.equal(seamArgs.effectiveUnitId, SCOPED_UNIT_ID);
  assert.equal(typeof seamArgs.findSetoresByUnidadeIdPopulateLean, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('ok' in seamArgs, false);
  assert.equal('serverError' in seamArgs, false);
  assert.deepEqual(callLog.findSetoresByUnidadeIdPopulateLeanCalls, [[SCOPED_UNIT_ID]]);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: true,
    data: [
      { _id: 's-1', nome: 'Financeiro', unidade_id: { _id: SCOPED_UNIT_ID } },
      { _id: 's-2', nome: 'RH', unidade_id: { _id: SCOPED_UNIT_ID } },
    ],
  }));
});

test('getSetoresPorUnidade: owner preserva tratamento de erro externo quando a seam falha', async () => {
  const { getSetoresPorUnidade, callLog } = loadGetByUnitOwnerHarness({
    getSetoresByUnitCore: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced-setores-get-by-unit-structural-failure');
    },
  });

  const req = buildReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: SCOPED_UNIT_ID },
  });
  const res = makeRes();

  await getSetoresPorUnidade(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.consoleErrors.length, 1);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-setores-get-by-unit-structural-failure',
  });
});