import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/recursoApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const CONTEXTUAL_UNIT_ID = '507f191e810c19729de860ea';
const OUT_OF_SCOPE_UNIT_ID = '507f191e810c19729de860eb';
const CREATED_RESOURCE_ID = '507f1f77bcf86cd799439011';

function extractCreateOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export async function updateRecurso(', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de recursos.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de createRecurso.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedCreateSnippet() {
  const original = extractCreateOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('processCreateRecursoCore({')) {
    return original;
  }

  const coreBlockPattern = /if \(\(await findRecursosByFiltroComUnidadeLean\(\{ unidade_id: requestedUnitId, placa: placa\.toUpperCase\(\) \}\)\)\.length > 0\) \{\s*return badRequest\(res, 'Placa já cadastrada'\);\s*\}\s*if \(\(await findRecursosByFiltroComUnidadeLean\(\{ unidade_id: requestedUnitId, chassi: chassi\.toUpperCase\(\) \}\)\)\.length > 0\) \{\s*return badRequest\(res, 'Chassi já cadastrado'\);\s*\}\s*if \(\(await findRecursosByFiltroComUnidadeLean\(\{ unidade_id: requestedUnitId, renavam \}\)\)\.length > 0\) \{\s*return badRequest\(res, 'RENAVAM já cadastrado'\);\s*\}\s*const novoRecurso = await createRecursoDb\(\{\s*unidade_id: requestedUnitId,\s*tipo,\s*placa: placa\.toUpperCase\(\),\s*chassi: chassi\.toUpperCase\(\),\s*renavam,\s*ano: parseInt\(ano\),\s*mod: parseInt\(mod\),\s*marca,\s*modelo,\s*cor,\s*ativo: true,\s*\}\);\s*return created\(res, novoRecurso\._id, \{ data: novoRecurso \}\);/s;
  assert.match(original, coreBlockPattern, 'Nao foi possivel localizar o bloco atual de createRecurso.');

  const delegatedBlock = [
    'const createResult = await processCreateRecursoCore({',
    '  requestedUnitId,',
    '  tipo,',
    '  placa,',
    '  chassi,',
    '  renavam,',
    '  ano,',
    '  mod,',
    '  marca,',
    '  modelo,',
    '  cor,',
    '  findRecursosByFiltroComUnidadeLean,',
    '  createRecursoDb,',
    '});',
    "if (createResult?.error === 'duplicate_placa') return badRequest(res, 'Placa já cadastrada');",
    "if (createResult?.error === 'duplicate_chassi') return badRequest(res, 'Chassi já cadastrado');",
    "if (createResult?.error === 'duplicate_renavam') return badRequest(res, 'RENAVAM já cadastrado');",
    'return created(res, createResult._id, { data: createResult });',
  ].join('\n\t\t');

  const replaced = original.replace(coreBlockPattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de createRecurso em memoria.');
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
      return send(res, 201, { success: true, created: true, id, ...payload });
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

function validBody(overrides = {}) {
  return {
    unidade_id: CONTEXTUAL_UNIT_ID,
    tipo: 'carro',
    placa: 'ABC-1D34',
    chassi: '9BWZZZ377VT004251',
    renavam: '12345678901',
    ano: '2024',
    mod: '2025',
    marca: 'Fiat',
    modelo: 'Argo',
    cor: 'Branco',
    ...overrides,
  };
}

function buildReq(overrides = {}) {
  return {
    body: validBody(),
    params: {},
    query: {},
    unitScope: null,
    session: { user: { role: 'admin' } },
    user: { role: 'admin', isMaster: false },
    ...overrides,
    body: {
      ...validBody(),
      ...(overrides.body || {}),
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

function loadCreateOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedCreateSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findRecursosByFiltroComUnidadeLeanCalls: [],
    createRecursoDbCalls: [],
    createdCalls: [],
    consoleErrors: [],
  };

  const deps = {
    created: runtimeOverrides.created ?? ((res, id, payload = {}) => {
      callLog.createdCalls.push([id, payload]);
      return responseHelpers.created(res, id, payload);
    }),
    badRequest: runtimeOverrides.badRequest ?? responseHelpers.badRequest,
    notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findRecursosByFiltroComUnidadeLean: runtimeOverrides.findRecursosByFiltroComUnidadeLean ?? (async (filtro) => {
      callLog.findRecursosByFiltroComUnidadeLeanCalls.push([filtro]);
      return [];
    }),
    createRecursoDb: runtimeOverrides.createRecursoDb ?? (async (payload) => {
      callLog.createRecursoDbCalls.push([payload]);
      return { _id: CREATED_RESOURCE_ID, ...payload };
    }),
    processCreateRecursoCore: runtimeOverrides.processCreateRecursoCore ?? (async (input) => {
      callLog.seamCalls.push(input);
      return { _id: CREATED_RESOURCE_ID };
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
const findRecursosByFiltroComUnidadeLean = __deps.findRecursosByFiltroComUnidadeLean;
const createRecursoDb = __deps.createRecursoDb;
const processCreateRecursoCore = __deps.processCreateRecursoCore;
const console = __deps.console;
${snippet}
return { createRecurso };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('createRecurso: owner preserva bloqueio por falta de contexto canonico antes da seam', async () => {
  const { createRecurso, callLog } = loadCreateOwnerHarness({
    processCreateRecursoCore: async () => {
      throw new Error('nao deve delegar create sem contexto canonico');
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    session: { user: {} },
    unitScope: null,
  });
  const res = makeRes();

  await createRecurso(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.createdCalls.length, 0);
});

test('createRecurso: owner preserva validacao de obrigatoriedade antes da seam', async () => {
  const { createRecurso, callLog } = loadCreateOwnerHarness({
    processCreateRecursoCore: async () => {
      throw new Error('nao deve delegar create com payload obrigatorio invalido');
    },
  });

  const req = buildReq({
    user: { role: 'admin', isMaster: false },
    body: validBody({ marca: '' }),
  });
  const res = makeRes();

  await createRecurso(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Todos os campos são obrigatórios',
  });
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.createdCalls.length, 0);
});

test('createRecurso: owner preserva gate contextual da unidade antes da seam', async () => {
  const { createRecurso, callLog } = loadCreateOwnerHarness({
    processCreateRecursoCore: async () => {
      throw new Error('nao deve delegar create fora do contexto');
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
    body: validBody({ unidade_id: OUT_OF_SCOPE_UNIT_ID }),
  });
  const res = makeRes();

  await createRecurso(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.createdCalls.length, 0);
});

test('createRecurso: owner preserva validacao de formato da placa antes da seam', async () => {
  const { createRecurso, callLog } = loadCreateOwnerHarness({
    processCreateRecursoCore: async () => {
      throw new Error('nao deve delegar create com placa invalida');
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
    body: validBody({ placa: 'ABC1234' }),
  });
  const res = makeRes();

  await createRecurso(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Formato de placa inválido. Use ABC-1234 ou ABC-1D34',
  });
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.createdCalls.length, 0);
});

test('createRecurso: owner traduz conflitos de duplicidade vindos da seam sem delegar HTTP', async () => {
  const cases = [
    ['duplicate_placa', 'Placa já cadastrada'],
    ['duplicate_chassi', 'Chassi já cadastrado'],
    ['duplicate_renavam', 'RENAVAM já cadastrado'],
  ];

  for (const [errorKind, message] of cases) {
    let seamArgs = null;
    const { createRecurso, callLog } = loadCreateOwnerHarness({
      processCreateRecursoCore: async (input) => {
        callLog.seamCalls.push(input);
        seamArgs = input;
        return { error: errorKind };
      },
    });

    const req = buildReq({
      user: { role: 'diretor', isMaster: false },
      unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
    });
    const res = makeRes();

    await createRecurso(req, res);

    assert.ok(seamArgs, 'A seam futura deve receber apenas o nucleo validado de createRecurso.');
    assert.deepEqual(Object.keys(seamArgs).sort(), [
      'ano',
      'chassi',
      'cor',
      'createRecursoDb',
      'findRecursosByFiltroComUnidadeLean',
      'marca',
      'mod',
      'modelo',
      'placa',
      'renavam',
      'requestedUnitId',
      'tipo',
    ].sort());
    assert.equal(seamArgs.requestedUnitId, CONTEXTUAL_UNIT_ID);
    assert.equal(seamArgs.tipo, 'carro');
    assert.equal(seamArgs.placa, 'ABC-1D34');
    assert.equal(seamArgs.chassi, '9BWZZZ377VT004251');
    assert.equal(seamArgs.renavam, '12345678901');
    assert.equal(seamArgs.ano, '2024');
    assert.equal(seamArgs.mod, '2025');
    assert.equal(seamArgs.marca, 'Fiat');
    assert.equal(seamArgs.modelo, 'Argo');
    assert.equal(seamArgs.cor, 'Branco');
    assert.equal(typeof seamArgs.findRecursosByFiltroComUnidadeLean, 'function');
    assert.equal(typeof seamArgs.createRecursoDb, 'function');
    assert.equal('req' in seamArgs, false);
    assert.equal('res' in seamArgs, false);
    assert.equal('badRequest' in seamArgs, false);
    assert.equal('notFound' in seamArgs, false);
    assert.equal('created' in seamArgs, false);
    assert.equal('serverError' in seamArgs, false);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(toPlainJson(res.body), {
      success: false,
      code: 'BAD_REQUEST',
      message,
    });
    assert.equal(callLog.createdCalls.length, 0);
  }
});

test('createRecurso: owner preserva ordem estrutural owner -> seam -> response final de created', async () => {
  const callOrder = [];
  let seamArgs = null;
  const novoRecurso = {
    _id: CREATED_RESOURCE_ID,
    unidade_id: CONTEXTUAL_UNIT_ID,
    tipo: 'carro',
    placa: 'ABC-1D34',
    chassi: '9BWZZZ377VT004251',
    renavam: '12345678901',
    ano: 2024,
    mod: 2025,
    marca: 'Fiat',
    modelo: 'Argo',
    cor: 'Branco',
    ativo: true,
  };

  const { createRecurso, callLog } = loadCreateOwnerHarness({
    created: (res, id, payload = {}) => {
      callOrder.push('created');
      callLog.createdCalls.push([id, payload]);
      return makeResponseHelpers().created(res, id, payload);
    },
    processCreateRecursoCore: async (input) => {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      seamArgs = input;

      if ((await input.findRecursosByFiltroComUnidadeLean({ unidade_id: input.requestedUnitId, placa: input.placa.toUpperCase() })).length > 0) {
        return { error: 'duplicate_placa' };
      }
      if ((await input.findRecursosByFiltroComUnidadeLean({ unidade_id: input.requestedUnitId, chassi: input.chassi.toUpperCase() })).length > 0) {
        return { error: 'duplicate_chassi' };
      }
      if ((await input.findRecursosByFiltroComUnidadeLean({ unidade_id: input.requestedUnitId, renavam: input.renavam })).length > 0) {
        return { error: 'duplicate_renavam' };
      }

      return await input.createRecursoDb({
        unidade_id: input.requestedUnitId,
        tipo: input.tipo,
        placa: input.placa.toUpperCase(),
        chassi: input.chassi.toUpperCase(),
        renavam: input.renavam,
        ano: parseInt(input.ano),
        mod: parseInt(input.mod),
        marca: input.marca,
        modelo: input.modelo,
        cor: input.cor,
        ativo: true,
      });
    },
    createRecursoDb: async (payload) => {
      callLog.createRecursoDbCalls.push([payload]);
      return novoRecurso;
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
  });
  const res = makeRes();

  await createRecurso(req, res);

  assert.ok(seamArgs, 'A seam futura deve ser chamada no caminho de sucesso.');
  assert.deepEqual(callOrder, ['seam', 'created']);
  assert.deepEqual(toPlainJson(callLog.findRecursosByFiltroComUnidadeLeanCalls), [
    [{ unidade_id: CONTEXTUAL_UNIT_ID, placa: 'ABC-1D34' }],
    [{ unidade_id: CONTEXTUAL_UNIT_ID, chassi: '9BWZZZ377VT004251' }],
    [{ unidade_id: CONTEXTUAL_UNIT_ID, renavam: '12345678901' }],
  ]);
  assert.deepEqual(toPlainJson(callLog.createRecursoDbCalls), [[{
    unidade_id: CONTEXTUAL_UNIT_ID,
    tipo: 'carro',
    placa: 'ABC-1D34',
    chassi: '9BWZZZ377VT004251',
    renavam: '12345678901',
    ano: 2024,
    mod: 2025,
    marca: 'Fiat',
    modelo: 'Argo',
    cor: 'Branco',
    ativo: true,
  }]]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(toPlainJson(res.body), {
    success: true,
    created: true,
    id: CREATED_RESOURCE_ID,
    data: novoRecurso,
  });
});

test('createRecurso: owner preserva serverError quando a seam falha com erro externo generico', async () => {
  const { createRecurso, callLog } = loadCreateOwnerHarness({
    processCreateRecursoCore: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced-recursos-create-structural-failure');
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
  });
  const res = makeRes();

  await createRecurso(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.consoleErrors.length, 1);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-recursos-create-structural-failure',
  });
});