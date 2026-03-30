import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcaoApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const SCOPED_UNIT_ID = '507f191e810c19729de860ea';
const IN_SCOPE_FILIAL_ID = '507f191e810c19729de860eb';
const OUT_OF_SCOPE_UNIT_ID = '507f191e810c19729de860ec';
const PRINCIPAL_UNIT_ID = '507f191e810c19729de860ed';

function extractGetByUnitOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export default {', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de funcoes.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de funcoes.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedGetByUnitSnippet() {
  const original = extractGetByUnitOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('getFuncoesByUnitCore({')) {
    return original;
  }

  const fullBlock = [
    'const principalUnitId = await resolvePrincipalUnitId(unidadeId);',
    '    const funcoes = await findFuncoesByPrincipalUnitIdLean(principalUnitId || unidadeId);',
    '    return ok(res, funcoes.map(f=>{',
    "      const nome = f.nome || '';",
    "      const rawDesc = (f.descricao && f.descricao.trim()) ? f.descricao.trim() : '';",
    "      const codigo = f.codigo || '';",
    '      // Novo fallback: se não há descricao real e nome==codigo, usa o próprio código como descricao_display',
    '      const descricaoDisplay = rawDesc || (nome && nome !== codigo ? nome : codigo);',
    '      const descricao_final = rawDesc || nome || codigo;',
    '      return { _id:f._id, nome, codigo, descricao: rawDesc, descricao_display: descricaoDisplay, descricao_final, hasDescricaoReal: !!rawDesc };',
    '    }));',
  ].join('\n');

  const blockStart = original.indexOf(fullBlock);
  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de getFuncoesPorUnidade.');

  const delegatedBlock = [
    'const principalUnitId = await resolvePrincipalUnitId(unidadeId);',
    'const result = await getFuncoesByUnitCore({',
    '  effectiveUnitId: principalUnitId || unidadeId,',
    '  findFuncoesByPrincipalUnitIdLean,',
    '});',
    'return ok(res, result);',
  ].join('\n    ');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + fullBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de getFuncoesPorUnidade em memoria.');
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
    params: { unidadeId: IN_SCOPE_FILIAL_ID },
    body: {},
    query: {},
    unitScope: null,
    session: { user: { role: 'admin' } },
    user: { role: 'admin', isMaster: false },
    ...overrides,
    params: {
      unidadeId: IN_SCOPE_FILIAL_ID,
      ...(overrides.params || {}),
    },
  };
}

function loadGetByUnitOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedGetByUnitSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findFuncoesByPrincipalUnitIdLeanCalls: [],
    findUnidadeUserBaseLeanCalls: [],
    consoleErrors: [],
  };

  const deps = {
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findUnidadeUserBaseLean: runtimeOverrides.findUnidadeUserBaseLean ?? (async (unidadeId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);
      return null;
    }),
    findFuncoesByPrincipalUnitIdLean: runtimeOverrides.findFuncoesByPrincipalUnitIdLean ?? (async (principalUnitId) => {
      callLog.findFuncoesByPrincipalUnitIdLeanCalls.push(principalUnitId);
      return [];
    }),
    getFuncoesByUnitCore: runtimeOverrides.getFuncoesByUnitCore ?? (async (input) => {
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
const findUnidadeUserBaseLean = __deps.findUnidadeUserBaseLean;
const findFuncoesByPrincipalUnitIdLean = __deps.findFuncoesByPrincipalUnitIdLean;
const getFuncoesByUnitCore = __deps.getFuncoesByUnitCore;
const console = __deps.console;
${snippet}
return { getFuncoesPorUnidade };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('getFuncoesPorUnidade: owner preserva retorno vazio imediato antes da seam', async () => {
  const { getFuncoesPorUnidade, callLog } = loadGetByUnitOwnerHarness({
    getFuncoesByUnitCore: async () => {
      throw new Error('nao deve delegar quando unidadeId e vazio');
    },
  });

  const req = buildReq({ params: { unidadeId: 'null' } });
  const res = makeRes();

  await getFuncoesPorUnidade(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({ success: true, data: [] }));
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.findUnidadeUserBaseLeanCalls.length, 0);
  assert.equal(callLog.findFuncoesByPrincipalUnitIdLeanCalls.length, 0);
});

test('getFuncoesPorUnidade: owner preserva gate de cluster contextual antes da seam', async () => {
  const { getFuncoesPorUnidade, callLog } = loadGetByUnitOwnerHarness({
    findUnidadeUserBaseLean: async (unidadeId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);
      if (unidadeId === SCOPED_UNIT_ID) {
        return { _id: SCOPED_UNIT_ID, is_principal: false, unidade_principal_id: PRINCIPAL_UNIT_ID };
      }
      if (unidadeId === OUT_OF_SCOPE_UNIT_ID) {
        return { _id: OUT_OF_SCOPE_UNIT_ID, is_principal: true };
      }
      return null;
    },
    getFuncoesByUnitCore: async () => {
      throw new Error('nao deve delegar quando a unidade alvo esta fora do cluster');
    },
  });

  const req = buildReq({
    params: { unidadeId: OUT_OF_SCOPE_UNIT_ID },
    user: { role: 'diretor' },
    unitScope: { unidadeId: SCOPED_UNIT_ID },
  });
  const res = makeRes();

  await getFuncoesPorUnidade(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({ success: true, data: [] }));
  assert.equal(callLog.seamCalls.length, 0);
  assert.deepEqual(callLog.findUnidadeUserBaseLeanCalls, [SCOPED_UNIT_ID, OUT_OF_SCOPE_UNIT_ID]);
  assert.equal(callLog.findFuncoesByPrincipalUnitIdLeanCalls.length, 0);
});

test('getFuncoesPorUnidade: owner resolve principal antes da seam e preserva contrato final de sucesso', async () => {
  const callOrder = [];
  let seamArgs = null;
  const { getFuncoesPorUnidade, callLog } = loadGetByUnitOwnerHarness({
    findUnidadeUserBaseLean: async (unidadeId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);
      callOrder.push(`resolve:${unidadeId}`);
      if (unidadeId === SCOPED_UNIT_ID) {
        return { _id: SCOPED_UNIT_ID, is_principal: false, unidade_principal_id: PRINCIPAL_UNIT_ID };
      }
      if (unidadeId === IN_SCOPE_FILIAL_ID) {
        return { _id: IN_SCOPE_FILIAL_ID, is_principal: false, unidade_principal_id: PRINCIPAL_UNIT_ID };
      }
      return null;
    },
    findFuncoesByPrincipalUnitIdLean: async (principalUnitId) => {
      callLog.findFuncoesByPrincipalUnitIdLeanCalls.push(principalUnitId);
      return [
        { _id: 'f-1', nome: 'Analista RH', codigo: 'C001', descricao: 'Responsável por RH' },
        { _id: 'f-2', nome: 'C002', codigo: 'C002', descricao: '   ' },
      ];
    },
    getFuncoesByUnitCore: async (input) => {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      seamArgs = input;

      const funcoes = await input.findFuncoesByPrincipalUnitIdLean(input.effectiveUnitId);
      return funcoes.map((funcao) => {
        const nome = funcao.nome || '';
        const rawDesc = (funcao.descricao && funcao.descricao.trim()) ? funcao.descricao.trim() : '';
        const codigo = funcao.codigo || '';
        const descricaoDisplay = rawDesc || (nome && nome !== codigo ? nome : codigo);
        const descricaoFinal = rawDesc || nome || codigo;
        return {
          _id: funcao._id,
          nome,
          codigo,
          descricao: rawDesc,
          descricao_display: descricaoDisplay,
          descricao_final: descricaoFinal,
          hasDescricaoReal: !!rawDesc,
        };
      });
    },
    ok: (res, payload = {}) => {
      callOrder.push('ok');
      res.status(200);
      res.json({ success: true, data: payload });
      return res;
    },
  });

  const req = buildReq({
    params: { unidadeId: IN_SCOPE_FILIAL_ID },
    user: { role: 'diretor' },
    unitScope: { unidadeId: SCOPED_UNIT_ID },
  });
  const res = makeRes();

  await getFuncoesPorUnidade(req, res);

  assert.ok(seamArgs, 'A seam de leitura por unidade deve ser chamada pelo owner real.');
  assert.deepEqual(Object.keys(seamArgs).sort(), ['effectiveUnitId', 'findFuncoesByPrincipalUnitIdLean'].sort());
  assert.equal(seamArgs.effectiveUnitId, PRINCIPAL_UNIT_ID);
  assert.equal(typeof seamArgs.findFuncoesByPrincipalUnitIdLean, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('ok' in seamArgs, false);
  assert.equal('serverError' in seamArgs, false);
  assert.deepEqual(callLog.findUnidadeUserBaseLeanCalls, [SCOPED_UNIT_ID, IN_SCOPE_FILIAL_ID, IN_SCOPE_FILIAL_ID]);
  assert.deepEqual(callLog.findFuncoesByPrincipalUnitIdLeanCalls, [PRINCIPAL_UNIT_ID]);
  assert.deepEqual(callOrder, [`resolve:${SCOPED_UNIT_ID}`, `resolve:${IN_SCOPE_FILIAL_ID}`, `resolve:${IN_SCOPE_FILIAL_ID}`, 'seam', 'ok']);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: true,
    data: [
      {
        _id: 'f-1',
        nome: 'Analista RH',
        codigo: 'C001',
        descricao: 'Responsável por RH',
        descricao_display: 'Responsável por RH',
        descricao_final: 'Responsável por RH',
        hasDescricaoReal: true,
      },
      {
        _id: 'f-2',
        nome: 'C002',
        codigo: 'C002',
        descricao: '',
        descricao_display: 'C002',
        descricao_final: 'C002',
        hasDescricaoReal: false,
      },
    ],
  }));
});

test('getFuncoesPorUnidade: owner preserva tratamento de erro externo quando a seam falha', async () => {
  const { getFuncoesPorUnidade, callLog } = loadGetByUnitOwnerHarness({
    getFuncoesByUnitCore: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced get-by-unit seam failure');
    },
  });

  const req = buildReq();
  const res = makeRes();

  await getFuncoesPorUnidade(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SERVER_ERROR');
  assert.equal(res.body.message, 'forced get-by-unit seam failure');
  assert.equal(callLog.consoleErrors.length, 1);
});