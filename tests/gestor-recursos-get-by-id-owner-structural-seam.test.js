import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/recursoApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const RESOURCE_ID = '507f1f77bcf86cd799439011';
const CONTEXTUAL_UNIT_ID = '507f191e810c19729de860ea';

function extractGetByIdOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export async function createRecurso(', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de recursos.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de getRecurso.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedGetByIdSnippet() {
  const original = extractGetByIdOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('getRecursoByIdCore({')) {
    return original;
  }

  const lookupBlockPattern = /const recurso = await findRecursoByIdComUnidadeNome\(req\.params\.id, unidadeEfetiva \|\| null\);\s*if \(!recurso\) return notFound\(res, 'Recurso não encontrado'\);\s*return ok\(res, recurso\);/;
  assert.match(original, lookupBlockPattern, 'Nao foi possivel localizar o bloco atual de getRecurso.');

  const delegatedBlock = [
    'const result = await getRecursoByIdCore({',
    '  id: req.params.id,',
    '  unidadeEfetiva,',
    '  findRecursoByIdComUnidadeNome,',
    '});',
    "if (!result) return notFound(res, 'Recurso não encontrado');",
    'return ok(res, result);',
  ].join('\n\t\t');

  const replaced = original.replace(lookupBlockPattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de getRecurso em memoria.');
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
    badRequest(res, message = 'Requisicao invalida') {
      return send(res, 400, { success: false, code: 'BAD_REQUEST', message });
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
    params: { id: RESOURCE_ID },
    body: {},
    query: {},
    unitScope: null,
    session: { user: { role: 'admin' } },
    user: { role: 'admin', isMaster: false },
    ...overrides,
    params: {
      id: RESOURCE_ID,
      ...(overrides.params || {}),
    },
    session: {
      user: { role: 'admin' },
      ...(overrides.session || {}),
    },
  };
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadGetByIdOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedGetByIdSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findRecursoByIdComUnidadeNomeCalls: [],
    consoleErrors: [],
  };

  const deps = {
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    badRequest: runtimeOverrides.badRequest ?? responseHelpers.badRequest,
    notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findUnidadeUserBaseLean: runtimeOverrides.findUnidadeUserBaseLean ?? (async () => null),
    findUnidadesByCondLean: runtimeOverrides.findUnidadesByCondLean ?? (async () => []),
    findRecursoByIdComUnidadeNome: runtimeOverrides.findRecursoByIdComUnidadeNome ?? (async (id, unidadeEfetiva) => {
      callLog.findRecursoByIdComUnidadeNomeCalls.push([id, unidadeEfetiva]);
      return null;
    }),
    findRecursosByFiltroComUnidadeLean: runtimeOverrides.findRecursosByFiltroComUnidadeLean ?? (async () => []),
    findOutroRecursoByPlacaUpper: runtimeOverrides.findOutroRecursoByPlacaUpper ?? (async () => null),
    findOutroRecursoByChassiUpper: runtimeOverrides.findOutroRecursoByChassiUpper ?? (async () => null),
    findOutroRecursoByRenavam: runtimeOverrides.findOutroRecursoByRenavam ?? (async () => null),
    createRecursoContextPolicyCore: runtimeOverrides.createRecursoContextPolicyCore ?? (() => ({
      shouldBlockForMissingContext({ currentUser, scopedUnitId } = {}) {
        const role = String(currentUser?.role || '').trim().toLowerCase();
        const isPrivileged = role === 'admin' || role === 'master';
        return !isPrivileged && !String(scopedUnitId || '').trim();
      },
      resolveCanonicalContextUnitId({ scopedUnitId } = {}) {
        return String(scopedUnitId || '').trim();
      },
    })),
    createRecursoWriteValidationCore: runtimeOverrides.createRecursoWriteValidationCore ?? (() => ({
      async validateCreate() {
        return { data: null };
      },
      async validateUpdate() {
        return { data: null };
      },
    })),
    getRecursoByIdCore: runtimeOverrides.getRecursoByIdCore ?? (async (input) => {
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
const badRequest = __deps.badRequest;
const notFound = __deps.notFound;
const serverError = __deps.serverError;
const findUnidadeUserBaseLean = __deps.findUnidadeUserBaseLean;
const findUnidadesByCondLean = __deps.findUnidadesByCondLean;
const findRecursoByIdComUnidadeNome = __deps.findRecursoByIdComUnidadeNome;
const findRecursosByFiltroComUnidadeLean = __deps.findRecursosByFiltroComUnidadeLean;
const findOutroRecursoByPlacaUpper = __deps.findOutroRecursoByPlacaUpper;
const findOutroRecursoByChassiUpper = __deps.findOutroRecursoByChassiUpper;
const findOutroRecursoByRenavam = __deps.findOutroRecursoByRenavam;
const createRecursoContextPolicyCore = __deps.createRecursoContextPolicyCore;
const createRecursoWriteValidationCore = __deps.createRecursoWriteValidationCore;
const getRecursoByIdCore = __deps.getRecursoByIdCore;
const console = __deps.console;
${snippet}
return { getRecurso };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('getRecurso: owner preserva gate de id invalido antes da seam', async () => {
  const { getRecurso, callLog } = loadGetByIdOwnerHarness({
    getRecursoByIdCore: async () => {
      throw new Error('nao deve delegar quando o id e invalido');
    },
  });

  const req = buildReq({
    params: { id: 'invalido' },
    user: { role: 'admin', isMaster: false },
  });
  const res = makeRes();

  await getRecurso(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'BAD_REQUEST',
    message: 'ID inválido',
  });
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.findRecursoByIdComUnidadeNomeCalls.length, 0);
});

test('getRecurso: owner preserva bloqueio por falta de contexto canonico antes da seam', async () => {
  const { getRecurso, callLog } = loadGetByIdOwnerHarness({
    getRecursoByIdCore: async () => {
      throw new Error('nao deve delegar quando falta contexto canonico');
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    session: { user: {} },
    unitScope: null,
  });
  const res = makeRes();

  await getRecurso(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.findRecursoByIdComUnidadeNomeCalls.length, 0);
});

test('getRecurso: owner resolve unidade efetiva antes da seam e preserva 404 quando a seam nao encontra alvo', async () => {
  let seamArgs = null;
  const { getRecurso, callLog } = loadGetByIdOwnerHarness({
    getRecursoByIdCore: async (input) => {
      callLog.seamCalls.push(input);
      seamArgs = input;
      return null;
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    session: { user: {} },
    unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
  });
  const res = makeRes();

  await getRecurso(req, res);

  assert.ok(seamArgs, 'A seam de leitura por id deve ser chamada pelo owner real.');
  assert.deepEqual(Object.keys(seamArgs).sort(), ['findRecursoByIdComUnidadeNome', 'id', 'unidadeEfetiva'].sort());
  assert.equal(seamArgs.id, RESOURCE_ID);
  assert.equal(seamArgs.unidadeEfetiva, CONTEXTUAL_UNIT_ID);
  assert.equal(typeof seamArgs.findRecursoByIdComUnidadeNome, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('ok' in seamArgs, false);
  assert.equal('notFound' in seamArgs, false);
  assert.equal('serverError' in seamArgs, false);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'NOT_FOUND',
    message: 'Recurso não encontrado',
  });
});

test('getRecurso: owner preserva contrato final de sucesso apos a seam realizar o lookup escopado', async () => {
  let seamArgs = null;
  const { getRecurso, callLog } = loadGetByIdOwnerHarness({
    getRecursoByIdCore: async (input) => {
      callLog.seamCalls.push(input);
      seamArgs = input;
      return await input.findRecursoByIdComUnidadeNome(input.id, input.unidadeEfetiva || null);
    },
    findRecursoByIdComUnidadeNome: async (id, unidadeEfetiva) => {
      callLog.findRecursoByIdComUnidadeNomeCalls.push([id, unidadeEfetiva]);
      return {
        _id: id,
        placa: 'ABC-1D34',
        unidade_id: { _id: unidadeEfetiva },
      };
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    session: { user: {} },
    unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
  });
  const res = makeRes();

  await getRecurso(req, res);

  assert.ok(seamArgs, 'A seam de leitura deve ser chamada no caminho de sucesso.');
  assert.deepEqual(toPlainJson(callLog.findRecursoByIdComUnidadeNomeCalls), [[RESOURCE_ID, CONTEXTUAL_UNIT_ID]]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.body), {
    success: true,
    data: {
      _id: RESOURCE_ID,
      placa: 'ABC-1D34',
      unidade_id: { _id: CONTEXTUAL_UNIT_ID },
    },
  });
});

test('getRecurso: owner preserva tratamento de erro externo quando a seam falha', async () => {
  const { getRecurso, callLog } = loadGetByIdOwnerHarness({
    getRecursoByIdCore: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced-recursos-get-by-id-structural-failure');
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    session: { user: {} },
    unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
  });
  const res = makeRes();

  await getRecurso(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.consoleErrors.length, 1);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-recursos-get-by-id-structural-failure',
  });
});