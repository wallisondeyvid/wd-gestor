import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/setorApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const PARAM_UNIT_ID = 'u-param';
const SCOPED_UNIT_ID = 'u-contexto';

function extractListOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export default {', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de setores.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de setores.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedListSnippet() {
  const original = extractListOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('listSetoresCore({')) {
    return original;
  }

  const fullBlock = [
    'const setores = await findSetoresByFiltroPopulateUnidadeLean(filtro);',
    '',
    '    // Fallback: construir mapa de unidades se algum setor veio sem populate resolvido',
    "    let needsLookup = setores.some(s => s.unidade_id && typeof s.unidade_id === 'string');",
    '    const unidadeIdsRaw = new Set();',
    '    if (needsLookup) {',
    "      setores.forEach(s => { if (s.unidade_id && typeof s.unidade_id === 'string') unidadeIdsRaw.add(s.unidade_id); });",
    '    }',
    '    let unidadesMap = {};',
    '    if (unidadeIdsRaw.size) {',
    '      const unidadesDB = await findUnidadesByIdsNomeCodigoLean(Array.from(unidadeIdsRaw));',
    '      unidadesDB.forEach(u => { unidadesMap[String(u._id)] = u; });',
    '    }',
    '',
    '    const mapped = setores.map((s) => {',
    "      let unidade_nome = '';",
    "      let unidade_label = '';",
    '      let unidade_id_raw = null;',
    '      if (s.unidade_id) {',
    "        if (typeof s.unidade_id === 'object' && s.unidade_id !== null) {",
    "          const codigo = s.unidade_id.codigo || '';",
    "          const nome = s.unidade_id.nome || '';",
    "          unidade_label = codigo && nome ? `${codigo} - ${nome}` : (nome || codigo || '');",
    '          unidade_nome = unidade_label;',
    '          unidade_id_raw = s.unidade_id._id || null;',
    "        } else if (typeof s.unidade_id === 'string') {",
    '          unidade_id_raw = s.unidade_id;',
    '          const u = unidadesMap[s.unidade_id];',
    '          if (u) {',
    "            const codigo = u.codigo || '';",
    "            const nome = u.nome || '';",
    "            unidade_label = codigo && nome ? `${codigo} - ${nome}` : (nome || codigo || '');",
    '            unidade_nome = unidade_label;',
    '          }',
    '        }',
    '      }',
    '      return { ...s, unidade_nome, unidade_label, unidade_id_raw };',
    '    });',
    '    return ok(res, mapped);',
  ].join('\n');

  const blockStart = original.indexOf(fullBlock);
  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de listarSetores.');

  const delegatedBlock = [
    'const mapped = await listSetoresCore({',
    '  filtro,',
    '  findSetoresByFiltroPopulateUnidadeLean,',
    '  findUnidadesByIdsNomeCodigoLean,',
    '});',
    'return ok(res, mapped);',
  ].join('\n    ');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + fullBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de listarSetores em memoria.');
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
    params: {},
    body: {},
    query: {},
    unitScope: null,
    session: { user: { role: 'admin' } },
    user: { role: 'admin', isMaster: false },
    ...overrides,
    params: {
      ...(overrides.params || {}),
    },
    query: {
      ...(overrides.query || {}),
    },
  };
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadListOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedListSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findSetoresByFiltroPopulateUnidadeLeanCalls: [],
    findUnidadesByIdsNomeCodigoLeanCalls: [],
    consoleErrors: [],
  };

  const deps = {
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findSetoresByFiltroPopulateUnidadeLean: runtimeOverrides.findSetoresByFiltroPopulateUnidadeLean ?? (async (filtro) => {
      callLog.findSetoresByFiltroPopulateUnidadeLeanCalls.push([filtro]);
      return [];
    }),
    findUnidadesByIdsNomeCodigoLean: runtimeOverrides.findUnidadesByIdsNomeCodigoLean ?? (async (unidadeIds) => {
      callLog.findUnidadesByIdsNomeCodigoLeanCalls.push([unidadeIds]);
      return [];
    }),
    listSetoresCore: runtimeOverrides.listSetoresCore ?? (async (input) => {
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
const findSetoresByFiltroPopulateUnidadeLean = __deps.findSetoresByFiltroPopulateUnidadeLean;
const findUnidadesByIdsNomeCodigoLean = __deps.findUnidadesByIdsNomeCodigoLean;
const listSetoresCore = __deps.listSetoresCore;
const console = __deps.console;
${snippet}
return { listarSetores };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('listarSetores: owner preserva gate de lista vazia antes da seam quando nao ha unidade canonica e o usuario nao e master/admin', async () => {
  const { listarSetores, callLog } = loadListOwnerHarness({
    listSetoresCore: async () => {
      throw new Error('nao deve delegar quando o gate devolve lista vazia');
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    query: { unidade_id: PARAM_UNIT_ID },
  });
  const res = makeRes();

  await listarSetores(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.body), { success: true, data: [] });
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.findSetoresByFiltroPopulateUnidadeLeanCalls.length, 0);
  assert.equal(callLog.findUnidadesByIdsNomeCodigoLeanCalls.length, 0);
});

test('listarSetores: owner resolve filtro contextual antes da seam, preserva dependencias minimas e responde com envelope final de sucesso', async () => {
  let seamArgs = null;
  const { listarSetores, callLog } = loadListOwnerHarness({
    listSetoresCore: async (input) => {
      callLog.seamCalls.push(input);
      seamArgs = input;

      const setores = await input.findSetoresByFiltroPopulateUnidadeLean(input.filtro);
      const needsLookup = setores.some((setor) => setor.unidade_id && typeof setor.unidade_id === 'string');
      const unidadeIdsRaw = new Set();

      if (needsLookup) {
        setores.forEach((setor) => {
          if (setor.unidade_id && typeof setor.unidade_id === 'string') {
            unidadeIdsRaw.add(setor.unidade_id);
          }
        });
      }

      let unidadesMap = {};
      if (unidadeIdsRaw.size) {
        const unidades = await input.findUnidadesByIdsNomeCodigoLean(Array.from(unidadeIdsRaw));
        unidades.forEach((unidade) => {
          unidadesMap[String(unidade._id)] = unidade;
        });
      }

      return setores.map((setor) => {
        let unidade_nome = '';
        let unidade_label = '';
        let unidade_id_raw = null;

        if (setor.unidade_id) {
          if (typeof setor.unidade_id === 'object' && setor.unidade_id !== null) {
            const codigo = setor.unidade_id.codigo || '';
            const nome = setor.unidade_id.nome || '';
            unidade_label = codigo && nome ? `${codigo} - ${nome}` : (nome || codigo || '');
            unidade_nome = unidade_label;
            unidade_id_raw = setor.unidade_id._id || null;
          } else if (typeof setor.unidade_id === 'string') {
            unidade_id_raw = setor.unidade_id;
            const unidade = unidadesMap[setor.unidade_id];
            if (unidade) {
              const codigo = unidade.codigo || '';
              const nome = unidade.nome || '';
              unidade_label = codigo && nome ? `${codigo} - ${nome}` : (nome || codigo || '');
              unidade_nome = unidade_label;
            }
          }
        }

        return { ...setor, unidade_nome, unidade_label, unidade_id_raw };
      });
    },
    findSetoresByFiltroPopulateUnidadeLean: async (filtro) => {
      callLog.findSetoresByFiltroPopulateUnidadeLeanCalls.push([filtro]);
      return [
        { _id: 's-pop', nome: 'Financeiro', descricao: 'ok', unidade_id: { _id: SCOPED_UNIT_ID, codigo: '001', nome: 'Matriz' } },
        { _id: 's-str', nome: 'RH', descricao: '', unidade_id: SCOPED_UNIT_ID },
      ];
    },
    findUnidadesByIdsNomeCodigoLean: async (unidadeIds) => {
      callLog.findUnidadesByIdsNomeCodigoLeanCalls.push([unidadeIds]);
      return [
        { _id: SCOPED_UNIT_ID, codigo: '001', nome: 'Matriz' },
      ];
    },
  });

  const req = buildReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: SCOPED_UNIT_ID },
    query: { unidade_id: PARAM_UNIT_ID },
  });
  const res = makeRes();

  await listarSetores(req, res);

  assert.ok(seamArgs, 'A seam de listagem deve ser chamada pelo owner real.');
  assert.deepEqual(Object.keys(seamArgs).sort(), [
    'filtro',
    'findSetoresByFiltroPopulateUnidadeLean',
    'findUnidadesByIdsNomeCodigoLean',
  ].sort());
  assert.deepEqual(toPlainJson(seamArgs.filtro), { unidade_id: SCOPED_UNIT_ID });
  assert.equal(typeof seamArgs.findSetoresByFiltroPopulateUnidadeLean, 'function');
  assert.equal(typeof seamArgs.findUnidadesByIdsNomeCodigoLean, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('ok' in seamArgs, false);
  assert.equal('serverError' in seamArgs, false);
  assert.deepEqual(toPlainJson(callLog.findSetoresByFiltroPopulateUnidadeLeanCalls), [[{ unidade_id: SCOPED_UNIT_ID }]]);
  assert.deepEqual(toPlainJson(callLog.findUnidadesByIdsNomeCodigoLeanCalls), [[[SCOPED_UNIT_ID]]]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.body), {
    success: true,
    data: [
      {
        _id: 's-pop',
        nome: 'Financeiro',
        descricao: 'ok',
        unidade_id: { _id: SCOPED_UNIT_ID, codigo: '001', nome: 'Matriz' },
        unidade_nome: '001 - Matriz',
        unidade_label: '001 - Matriz',
        unidade_id_raw: SCOPED_UNIT_ID,
      },
      {
        _id: 's-str',
        nome: 'RH',
        descricao: '',
        unidade_id: SCOPED_UNIT_ID,
        unidade_nome: '001 - Matriz',
        unidade_label: '001 - Matriz',
        unidade_id_raw: SCOPED_UNIT_ID,
      },
    ],
  });
});

test('listarSetores: owner usa o filtro da query quando nao ha unidade canonica e o usuario e admin', async () => {
  let seamArgs = null;
  const { listarSetores, callLog } = loadListOwnerHarness({
    listSetoresCore: async (input) => {
      callLog.seamCalls.push(input);
      seamArgs = input;
      return [];
    },
  });

  const req = buildReq({
    user: { role: 'admin', isMaster: false },
    query: { unidade_id: PARAM_UNIT_ID },
  });
  const res = makeRes();

  await listarSetores(req, res);

  assert.ok(seamArgs, 'A seam deve receber o filtro vindo da query quando permitido pelo owner.');
  assert.deepEqual(toPlainJson(seamArgs.filtro), { unidade_id: PARAM_UNIT_ID });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.body), { success: true, data: [] });
  assert.equal(callLog.findSetoresByFiltroPopulateUnidadeLeanCalls.length, 0);
  assert.equal(callLog.findUnidadesByIdsNomeCodigoLeanCalls.length, 0);
});

test('listarSetores: owner preserva tratamento de erro externo quando a seam falha', async () => {
  const { listarSetores, callLog } = loadListOwnerHarness({
    listSetoresCore: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced-setores-list-structural-failure');
    },
  });

  const req = buildReq({
    user: { role: 'admin', isMaster: false },
    query: { unidade_id: PARAM_UNIT_ID },
  });
  const res = makeRes();

  await listarSetores(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.consoleErrors.length, 1);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-setores-list-structural-failure',
  });
});