import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/setorApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const CONTEXT_UNIT_ID = 'u-contexto';
const OUTSIDE_UNIT_ID = 'u-fora';
const CREATED_SETOR_ID = '507f1f77bcf86cd799439011';

function extractCreateOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export default {', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de setores.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de setores.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedCreateSnippet() {
  const original = extractCreateOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('processCreateSetorCore({')) {
    return original;
  }

  const fullBlock = [
    'const existing = await findSetorByUnidadeAndNomeNormalizadoLean(canonicalUnitId, nomeNormalizado);',
    '    if (existing) {',
    "      return conflict(res,'Setor já cadastrado nesta unidade', { duplicateField:'nome', duplicateValue: nome, duplicateId: existing._id });",
    '    }',
    '    const setor = await createSetorDb({ nome, nome_normalizado: nomeNormalizado, descricao, unidade_id: canonicalUnitId });',
    '    return created(res, setor._id, { data:{ _id:setor._id, codigo: setor.codigo } });',
  ].join('\n');

  const blockStart = original.indexOf(fullBlock);
  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de createSetor.');

  const delegatedBlock = [
    'const createResult = await processCreateSetorCore({',
    '  nome,',
    '  descricao,',
    '  canonicalUnitId,',
    '  findSetorByUnidadeAndNomeNormalizadoLean,',
    '  createSetorDb,',
    '});',
    "if (createResult?.error === 'duplicate_name') {",
    "  return conflict(res,'Setor já cadastrado nesta unidade', { duplicateField:'nome', duplicateValue: nome, duplicateId: createResult.duplicateId });",
    '}',
    'return created(res, createResult._id, { data:{ _id:createResult._id, codigo: createResult.codigo } });',
  ].join('\n    ');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + fullBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de createSetor em memoria.');
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
    findSetorByUnidadeAndNomeNormalizadoLeanCalls: [],
    createSetorDbCalls: [],
    consoleErrors: [],
    createdCalls: [],
  };

  const deps = {
    created: runtimeOverrides.created ?? ((res, id, payload = {}) => {
      callLog.createdCalls.push([id, payload]);
      return responseHelpers.created(res, id, payload);
    }),
    badRequest: runtimeOverrides.badRequest ?? responseHelpers.badRequest,
    notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findSetorByUnidadeAndNomeNormalizadoLean: runtimeOverrides.findSetorByUnidadeAndNomeNormalizadoLean ?? (async (unidadeId, nomeNormalizado) => {
      callLog.findSetorByUnidadeAndNomeNormalizadoLeanCalls.push([unidadeId, nomeNormalizado]);
      return null;
    }),
    createSetorDb: runtimeOverrides.createSetorDb ?? (async (payload) => {
      callLog.createSetorDbCalls.push([payload]);
      return { _id: CREATED_SETOR_ID, codigo: 'S001', ...payload };
    }),
    processCreateSetorCore: runtimeOverrides.processCreateSetorCore ?? (async (input) => {
      callLog.seamCalls.push(input);
      return { _id: CREATED_SETOR_ID, codigo: 'S001' };
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
const findSetorByUnidadeAndNomeNormalizadoLean = __deps.findSetorByUnidadeAndNomeNormalizadoLean;
const createSetorDb = __deps.createSetorDb;
const processCreateSetorCore = __deps.processCreateSetorCore;
const console = __deps.console;
${snippet}
return { createSetor };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('createSetor: owner preserva gate de nome obrigatorio antes da seam', async () => {
  const { createSetor, callLog } = loadCreateOwnerHarness({
    processCreateSetorCore: async () => {
      throw new Error('nao deve delegar create sem nome');
    },
  });

  const req = buildReq({ unidade_id: CONTEXT_UNIT_ID });
  const res = makeRes();

  await createSetor(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_REQUEST');
  assert.equal(res.body.message, 'Nome é obrigatório');
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.createdCalls.length, 0);
});

test('createSetor: owner preserva gate de unidade obrigatoria antes da seam', async () => {
  const { createSetor, callLog } = loadCreateOwnerHarness({
    processCreateSetorCore: async () => {
      throw new Error('nao deve delegar create sem unidade canonica');
    },
  });

  const req = buildReq({ nome: 'Financeiro' });
  const res = makeRes();

  await createSetor(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_REQUEST');
  assert.equal(res.body.message, 'Unidade é obrigatória');
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.createdCalls.length, 0);
});

test('createSetor: owner preserva gate contextual da unidade antes da seam', async () => {
  const { createSetor, callLog } = loadCreateOwnerHarness({
    processCreateSetorCore: async () => {
      throw new Error('nao deve delegar create fora do contexto');
    },
  });

  const req = buildReq(
    {
      nome: 'Financeiro',
      unidade_id: OUTSIDE_UNIT_ID,
    },
    {
      unitScope: { unidadeId: CONTEXT_UNIT_ID },
      user: { role: 'diretor' },
    },
  );
  const res = makeRes();

  await createSetor(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  }));
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.createdCalls.length, 0);
});

test('createSetor: owner traduz conflito de duplicidade vindo da seam sem delegar HTTP', async () => {
  let seamArgs = null;
  const { createSetor, callLog } = loadCreateOwnerHarness({
    processCreateSetorCore: async (input) => {
      callLog.seamCalls.push(input);
      seamArgs = input;
      return { error: 'duplicate_name', duplicateId: 'setor-existente' };
    },
  });

  const req = buildReq({ nome: 'Financeiro', descricao: 'Backoffice', unidade_id: CONTEXT_UNIT_ID });
  const res = makeRes();

  await createSetor(req, res);

  assert.ok(seamArgs, 'A seam futura deve receber apenas o nucleo canonizado de criacao.');
  assert.equal(JSON.stringify(Array.from(Object.keys(seamArgs)).sort()), JSON.stringify([
    'canonicalUnitId',
    'createSetorDb',
    'descricao',
    'findSetorByUnidadeAndNomeNormalizadoLean',
    'nome',
  ].sort()));
  assert.equal(seamArgs.nome, 'Financeiro');
  assert.equal(seamArgs.descricao, 'Backoffice');
  assert.equal(seamArgs.canonicalUnitId, CONTEXT_UNIT_ID);
  assert.equal(typeof seamArgs.findSetorByUnidadeAndNomeNormalizadoLean, 'function');
  assert.equal(typeof seamArgs.createSetorDb, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('badRequest' in seamArgs, false);
  assert.equal('notFound' in seamArgs, false);
  assert.equal('created' in seamArgs, false);
  assert.equal('serverError' in seamArgs, false);
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    error: 'Setor já cadastrado nesta unidade',
    duplicateField: 'nome',
    duplicateValue: 'Financeiro',
    duplicateId: 'setor-existente',
  }));
  assert.equal(callLog.createdCalls.length, 0);
});

test('createSetor: owner preserva ordem estrutural owner -> seam -> response final de created', async () => {
  const callOrder = [];
  let seamArgs = null;
  const { createSetor, callLog } = loadCreateOwnerHarness({
    created: (res, id, payload = {}) => {
      callOrder.push('created');
      callLog.createdCalls.push([id, payload]);
      return makeResponseHelpers().created(res, id, payload);
    },
    processCreateSetorCore: async (input) => {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      seamArgs = input;
      const nomeNormalizado = String(input.nome || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const existing = await input.findSetorByUnidadeAndNomeNormalizadoLean(input.canonicalUnitId, nomeNormalizado);
      if (existing) return { error: 'duplicate_name', duplicateId: existing._id };
      return await input.createSetorDb({
        nome: input.nome,
        nome_normalizado: nomeNormalizado,
        descricao: input.descricao,
        unidade_id: input.canonicalUnitId,
      });
    },
  });

  const req = buildReq({ nome: ' Financeiro  Central ', descricao: 'Backoffice', unidade_id: CONTEXT_UNIT_ID });
  const res = makeRes();

  await createSetor(req, res);

  assert.ok(seamArgs, 'A seam futura deve ser chamada no caminho de sucesso.');
  assert.deepEqual(callOrder, ['seam', 'created']);
  assert.deepEqual(callLog.findSetorByUnidadeAndNomeNormalizadoLeanCalls, [[CONTEXT_UNIT_ID, 'financeiro central']]);
  assert.deepEqual(callLog.createSetorDbCalls, [[{
    nome: ' Financeiro  Central ',
    nome_normalizado: 'financeiro central',
    descricao: 'Backoffice',
    unidade_id: CONTEXT_UNIT_ID,
  }]]);
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: true,
    id: CREATED_SETOR_ID,
    data: {
      _id: CREATED_SETOR_ID,
      codigo: 'S001',
    },
  }));
});

test('createSetor: owner preserva traducao HTTP do 11000 e tratamento de erro externo', async () => {
  const duplicateError = new Error('duplicate-driver');
  duplicateError.code = 11000;
  duplicateError.keyPattern = { codigo: 1 };
  duplicateError.keyValue = { codigo: 'S001' };

  const { createSetor, callLog } = loadCreateOwnerHarness({
    processCreateSetorCore: async (input) => {
      callLog.seamCalls.push(input);
      throw duplicateError;
    },
  });

  const req = buildReq({ nome: 'Financeiro', unidade_id: CONTEXT_UNIT_ID });
  const res = makeRes();

  await createSetor(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.consoleErrors.length, 1);
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    error: 'Código de setor duplicado (falha na sequência). Tente novamente.',
    duplicateField: 'codigo',
    duplicateValue: 'S001',
    needsSequenceCheck: true,
  }));
});

test('createSetor: owner preserva serverError quando a seam falha com erro externo generico', async () => {
  const { createSetor, callLog } = loadCreateOwnerHarness({
    processCreateSetorCore: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced-setores-create-structural-failure');
    },
  });

  const req = buildReq({ nome: 'Financeiro', unidade_id: CONTEXT_UNIT_ID });
  const res = makeRes();

  await createSetor(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.consoleErrors.length, 1);
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-setores-create-structural-failure',
  }));
});