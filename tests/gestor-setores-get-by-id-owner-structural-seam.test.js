import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/setorApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const SETOR_ID = '507f1f77bcf86cd799439011';
const CONTEXT_UNIT_ID = 'u-contexto';

function extractGetByIdOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export default {', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de setores.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de setores.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedGetByIdSnippet() {
  const original = extractGetByIdOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('getSetorByIdCore({')) {
    return original;
  }

  const fullBlock = [
    'const setor = await findSetorByIdPopulateUnidade(req.params.id, getCanonicalContextUnitId(req) || null);',
    "    if (!setor) return notFound(res,'Setor não encontrado');",
    "    return ok(res,{ _id:setor._id, nome:setor.nome, descricao:setor.descricao||'', unidade_id: setor.unidade_id ? setor.unidade_id._id : null });",
  ].join('\n');

  const blockStart = original.indexOf(fullBlock);
  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de getSetor.');

  const delegatedBlock = [
    'const canonicalUnitId = getCanonicalContextUnitId(req) || null;',
    'const result = await getSetorByIdCore({',
    '  id: req.params.id,',
    '  canonicalUnitId,',
    '  findSetorByIdPopulateUnidade,',
    '});',
    "if (!result) return notFound(res,'Setor não encontrado');",
    'return ok(res, result);',
  ].join('\n    ');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + fullBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de getSetor em memoria.');
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
    params: { id: SETOR_ID },
    body: {},
    query: {},
    unitScope: null,
    session: { user: { role: 'admin' } },
    user: { role: 'admin', isMaster: false },
    ...overrides,
    params: {
      id: SETOR_ID,
      ...(overrides.params || {}),
    },
  };
}

function loadGetByIdOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedGetByIdSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findSetorByIdPopulateUnidadeCalls: [],
    consoleErrors: [],
  };

  const deps = {
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findSetorByIdPopulateUnidade: runtimeOverrides.findSetorByIdPopulateUnidade ?? (async (id, unidadeId) => {
      callLog.findSetorByIdPopulateUnidadeCalls.push([id, unidadeId]);
      return null;
    }),
    getSetorByIdCore: runtimeOverrides.getSetorByIdCore ?? (async (input) => {
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
const findSetorByIdPopulateUnidade = __deps.findSetorByIdPopulateUnidade;
const getSetorByIdCore = __deps.getSetorByIdCore;
const console = __deps.console;
${snippet}
return { getSetor };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('getSetor: owner resolve unitScope canonico antes da seam e preserva 404 quando a seam nao encontra alvo', async () => {
  let seamArgs = null;
  const { getSetor, callLog } = loadGetByIdOwnerHarness({
    getSetorByIdCore: async (input) => {
      callLog.seamCalls.push(input);
      seamArgs = input;
      return null;
    },
  });

  const req = buildReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: CONTEXT_UNIT_ID },
  });
  const res = makeRes();

  await getSetor(req, res);

  assert.ok(seamArgs, 'A seam de leitura por id deve ser chamada pelo owner real.');
  assert.deepEqual(Object.keys(seamArgs).sort(), ['canonicalUnitId', 'findSetorByIdPopulateUnidade', 'id'].sort());
  assert.equal(seamArgs.id, SETOR_ID);
  assert.equal(seamArgs.canonicalUnitId, CONTEXT_UNIT_ID);
  assert.equal(typeof seamArgs.findSetorByIdPopulateUnidade, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('ok' in seamArgs, false);
  assert.equal('notFound' in seamArgs, false);
  assert.equal('serverError' in seamArgs, false);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Setor não encontrado',
  });
});

test('getSetor: owner preserva contrato final de sucesso apos a seam normalizar o payload', async () => {
  let seamArgs = null;
  const { getSetor, callLog } = loadGetByIdOwnerHarness({
    getSetorByIdCore: async (input) => {
      callLog.seamCalls.push(input);
      seamArgs = input;

      const setor = await input.findSetorByIdPopulateUnidade(input.id, input.canonicalUnitId || null);
      if (!setor) return null;

      return {
        _id: setor._id,
        nome: setor.nome,
        descricao: setor.descricao || '',
        unidade_id: setor.unidade_id ? setor.unidade_id._id : null,
      };
    },
    findSetorByIdPopulateUnidade: async (id, unidadeId) => {
      callLog.findSetorByIdPopulateUnidadeCalls.push([id, unidadeId]);
      return {
        _id: id,
        nome: 'Financeiro',
        descricao: undefined,
        unidade_id: { _id: CONTEXT_UNIT_ID },
      };
    },
  });

  const req = buildReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: CONTEXT_UNIT_ID },
  });
  const res = makeRes();

  await getSetor(req, res);

  assert.ok(seamArgs, 'A seam de leitura deve ser chamada no caminho de sucesso.');
  assert.deepEqual(callLog.findSetorByIdPopulateUnidadeCalls, [[SETOR_ID, CONTEXT_UNIT_ID]]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      _id: SETOR_ID,
      nome: 'Financeiro',
      descricao: '',
      unidade_id: CONTEXT_UNIT_ID,
    },
  });
});

test('getSetor: owner preserva tratamento de erro externo quando a seam falha', async () => {
  const { getSetor, callLog } = loadGetByIdOwnerHarness({
    getSetorByIdCore: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced-setores-get-by-id-structural-failure');
    },
  });

  const req = buildReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: CONTEXT_UNIT_ID },
  });
  const res = makeRes();

  await getSetor(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.consoleErrors.length, 1);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-setores-get-by-id-structural-failure',
  });
});