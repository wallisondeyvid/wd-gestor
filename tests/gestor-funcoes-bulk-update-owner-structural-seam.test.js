import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcaoApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractBulkOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export default {', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de funcoes.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de funcoes.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedBulkSnippet() {
  const original = extractBulkOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('processBulkUpdateFuncoesItems({')) {
    return original;
  }

  const fullBlock = [
    'const resultados=[]; let atualizados=0;',
    '    for(const it of itens){',
    "      const id = it._id || it.id; if(!id) { resultados.push({ ok:false, motivo:'Sem _id' }); continue; }",
    "      const f = await findFuncaoById(id, contextPrincipalUnitId || null); if(!f){ resultados.push({ _id:id, ok:false, motivo:'Nao encontrada' }); continue; }",
    "      if (contextPrincipalUnitId && normalizeUnitId(f.unidade_principal_id) !== contextPrincipalUnitId) {",
    "        resultados.push({ _id:id, ok:false, motivo:'Nao encontrada' }); continue;",
    '      }',
    '      let changed=false;',
    "      if(it.nome && it.nome!==f.nome){ f.nome = it.nome; changed=true; }",
    "      if(it.descricao!==undefined && it.descricao!==f.descricao){ f.descricao = it.descricao; changed=true; }",
    '      if(changed){ await saveFuncao(f); atualizados++; }',
    '      resultados.push({ _id:f._id, ok:true, changed });',
    '    }',
    '    return ok(res,{ updated:atualizados, results:resultados });',
  ].join('\n');

  const blockStart = original.indexOf(fullBlock);
  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de bulkUpdateFuncoes.');

  const delegatedBlock = [
    'const bulkResult = await processBulkUpdateFuncoesItems({',
    '  itens,',
    '  contextPrincipalUnitId,',
    '  findFuncaoById,',
    '  saveFuncao,',
    '  normalizeUnitId,',
    '});',
    'return ok(res,{ updated:bulkResult.updated, results:bulkResult.results });',
  ].join('\n    ');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + fullBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de bulkUpdateFuncoes em memoria.');
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
      return send(res, 400, { success: false, code: 'BAD_REQUEST', message, error: message });
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

function loadBulkOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedBulkSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findFuncaoByIdCalls: [],
    saveFuncaoCalls: [],
    findUnidadeUserBaseLeanCalls: [],
    consoleErrors: [],
  };

  const deps = {
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    badRequest: runtimeOverrides.badRequest ?? responseHelpers.badRequest,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findUnidadeUserBaseLean: runtimeOverrides.findUnidadeUserBaseLean ?? (async (unidadeId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);
      return null;
    }),
    findFuncaoById: runtimeOverrides.findFuncaoById ?? (async (id, unidadePrincipalId) => {
      callLog.findFuncaoByIdCalls.push([id, unidadePrincipalId]);
      return null;
    }),
    saveFuncao: runtimeOverrides.saveFuncao ?? (async (funcao) => {
      callLog.saveFuncaoCalls.push({ ...funcao });
      return funcao;
    }),
    processBulkUpdateFuncoesItems: runtimeOverrides.processBulkUpdateFuncoesItems ?? (async (input) => {
      callLog.seamCalls.push(input);
      return { updated: 0, results: [] };
    }),
    createFuncaoContextPolicyCore: runtimeOverrides.createFuncaoContextPolicyCore ?? (({ findUnidadeUserBaseLean }) => ({
      async resolvePrincipalUnitId(unidadeId) {
        const unidadeIdNorm = String(unidadeId || '').trim();
        if (!unidadeIdNorm) return '';
        const unidade = await findUnidadeUserBaseLean(unidadeIdNorm);
        if (!unidade) return unidadeIdNorm;
        return String(unidade.is_principal ? unidade._id : (unidade.unidade_principal_id || unidade.matriz_id || unidade._id || unidadeIdNorm)).trim();
      },
      async resolveCanonicalContextPrincipalUnitId({ scopedUnitId } = {}) {
        const scopedUnitIdNorm = String(scopedUnitId || '').trim();
        if (!scopedUnitIdNorm) return '';
        return this.resolvePrincipalUnitId(scopedUnitIdNorm);
      },
    })),
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
const serverError = __deps.serverError;
const findUnidadeUserBaseLean = __deps.findUnidadeUserBaseLean;
const findFuncaoById = __deps.findFuncaoById;
const saveFuncao = __deps.saveFuncao;
const processBulkUpdateFuncoesItems = __deps.processBulkUpdateFuncoesItems;
const createFuncaoContextPolicyCore = __deps.createFuncaoContextPolicyCore;
const console = __deps.console;
${snippet}
return { bulkUpdateFuncoes };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('bulkUpdateFuncoes: owner preserva gate antes da seam quando a lista e vazia', async () => {
  const { bulkUpdateFuncoes, callLog } = loadBulkOwnerHarness({
    processBulkUpdateFuncoesItems: async () => {
      throw new Error('nao deve delegar bulk update com lista vazia');
    },
  });

  const req = buildReq({ itens: [] });
  const res = makeRes();

  await bulkUpdateFuncoes(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_REQUEST');
  assert.equal(res.body.message, 'Lista vazia');
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.findUnidadeUserBaseLeanCalls.length, 0);
});

test('bulkUpdateFuncoes: owner resolve contexto antes da seam e preserva contrato final de sucesso', async () => {
  const callOrder = [];
  let seamArgs = null;
  const { bulkUpdateFuncoes, callLog } = loadBulkOwnerHarness({
    findUnidadeUserBaseLean: async (unidadeId) => {
      callOrder.push('context');
      callLog.findUnidadeUserBaseLeanCalls.push(unidadeId);
      return {
        _id: String(unidadeId),
        is_principal: false,
        unidade_principal_id: '507f191e810c19729de860ea',
      };
    },
    findFuncaoById: async (id, unidadePrincipalId) => {
      callLog.findFuncaoByIdCalls.push([id, unidadePrincipalId]);
      return {
        _id: id,
        nome: 'Supervisor',
        descricao: 'Descricao antiga',
        unidade_principal_id: unidadePrincipalId,
      };
    },
    saveFuncao: async (funcao) => {
      callLog.saveFuncaoCalls.push({ ...funcao });
      return funcao;
    },
    processBulkUpdateFuncoesItems: async (input) => {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      seamArgs = input;

      const doc = await input.findFuncaoById(input.itens[0]._id, input.contextPrincipalUnitId || null);
      if (input.itens[0].nome && input.itens[0].nome !== doc.nome) {
        doc.nome = input.itens[0].nome;
        await input.saveFuncao(doc);
        return {
          updated: 1,
          results: [
            { _id: doc._id, ok: true, changed: true },
          ],
        };
      }

      return {
        updated: 0,
        results: [
          { _id: doc._id, ok: true, changed: false },
        ],
      };
    },
    ok: (res, payload = {}) => {
      callOrder.push('ok');
      res.status(200);
      res.json({ success: true, data: payload });
      return res;
    },
  });

  const req = buildReq(
    {
      itens: [
        { _id: '507f1f77bcf86cd799439011', nome: 'Supervisor Atualizado' },
      ],
    },
    { unitScope: { unidadeId: '507f191e810c19729de860aa' } }
  );
  const res = makeRes();

  await bulkUpdateFuncoes(req, res);

  assert.ok(seamArgs, 'A seam de bulk update deve ser chamada pelo owner real.');
  assert.deepEqual(
    Object.keys(seamArgs).sort(),
    ['contextPrincipalUnitId', 'findFuncaoById', 'itens', 'normalizeUnitId', 'saveFuncao'].sort()
  );
  assert.equal(seamArgs.itens, req.body.itens);
  assert.equal(seamArgs.contextPrincipalUnitId, '507f191e810c19729de860ea');
  assert.equal(typeof seamArgs.findFuncaoById, 'function');
  assert.equal(typeof seamArgs.saveFuncao, 'function');
  assert.equal(typeof seamArgs.normalizeUnitId, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('ok' in seamArgs, false);
  assert.equal('serverError' in seamArgs, false);
  assert.deepEqual(callOrder, ['context', 'seam', 'ok']);
  assert.deepEqual(callLog.findUnidadeUserBaseLeanCalls, ['507f191e810c19729de860aa']);
  assert.deepEqual(callLog.findFuncaoByIdCalls, [['507f1f77bcf86cd799439011', '507f191e810c19729de860ea']]);
  assert.deepEqual(callLog.saveFuncaoCalls, [{
    _id: '507f1f77bcf86cd799439011',
    nome: 'Supervisor Atualizado',
    descricao: 'Descricao antiga',
    unidade_principal_id: '507f191e810c19729de860ea',
  }]);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: true,
    data: {
      updated: 1,
      results: [
        { _id: '507f1f77bcf86cd799439011', ok: true, changed: true },
      ],
    },
  }));
});

test('bulkUpdateFuncoes: owner preserva tratamento de erro externo quando a seam falha', async () => {
  const { bulkUpdateFuncoes, callLog } = loadBulkOwnerHarness({
    processBulkUpdateFuncoesItems: async (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced bulk update seam failure');
    },
  });

  const req = buildReq({ itens: [{ _id: '507f1f77bcf86cd799439011', nome: 'Supervisor Atualizado' }] });
  const res = makeRes();

  await bulkUpdateFuncoes(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SERVER_ERROR');
  assert.equal(res.body.message, 'forced bulk update seam failure');
  assert.equal(callLog.consoleErrors.length, 1);
});