import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcaoApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const FUNCAO_ID = '507f1f77bcf86cd799439011';
const SCOPED_FILIAL_ID = 'u-filial-a';
const CONTEXT_PRINCIPAL_ID = 'u-principal-a';
const OUT_OF_SCOPE_FILIAL_ID = 'u-filial-b';
const OUT_OF_SCOPE_PRINCIPAL_ID = 'u-principal-b';

function extractUpdateOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export default {', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de funcoes.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de funcoes.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedUpdateSnippet() {
  const original = extractUpdateOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('funcaoWriteValidation.validateUpdate({') || original.includes('executeUpdateFuncaoCore({')) {
    return original;
  }

  const blockStart = original.indexOf('const unidadePrincipalExistenteId = normalizeUnitId(existente.unidade_principal_id);');
  const blockEndToken = 'return ok(res,{ updated:true, funcao:{ _id:updated._id, codigo, nome:nomeF, descricao: rawDesc, descricao_display: descricaoDisplay, hasDescricaoReal: !!rawDesc } });';
  const blockEnd = original.indexOf(blockEndToken, blockStart);

  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o inicio do miolo atual de updateFuncao.');
  assert.ok(blockEnd > blockStart, 'Nao foi possivel localizar o fim do miolo atual de updateFuncao.');

  const delegatedBlock = [
    'const seamResult = await executeUpdateFuncaoCore({',
    '  id,',
    '  nome,',
    '  descricao,',
    '  unidade_principal_id,',
    '  modulos_habilitados,',
    '  contextPrincipalUnitId,',
    '  existente,',
    '  normalizeUnitId,',
    '  requestedUnitWithinContextCluster: async (unitId) => requestedUnitWithinContextCluster(req, unitId),',
    '  findOutraFuncaoByNomeExcludingId,',
    '  findUnidadeByIdWithModulosAcessiveis,',
    '  normalizarListaModulos,',
    '  updateFuncaoById,',
    '  findFuncaoByIdLean,',
    '});',
    "if (seamResult?.error === 'Unidade principal não encontrada') return notFound(res,'Unidade principal não encontrada');",
    "if (seamResult?.error === 'Já existe uma função com este nome') return badRequest(res,'Já existe uma função com este nome');",
    "if (seamResult?.error === 'Unidade inválida') return badRequest(res,'Unidade inválida');",
    'return ok(res,{ updated:true, funcao: seamResult });',
  ].join('\n    ');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockEnd + blockEndToken.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de updateFuncao em memoria.');
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
    body: {
      ...(overrides.body || {}),
    },
  };
}

function loadUpdateOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedUpdateSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    findFuncaoByIdCalls: [],
    findOutraFuncaoByNomeExcludingIdCalls: [],
    updateFuncaoByIdCalls: [],
    findFuncaoByIdLeanCalls: [],
    findUnidadeByIdWithModulosAcessiveisCalls: [],
    findUnidadeUserBaseLeanCalls: [],
    consoleErrors: [],
  };

  const deps = {
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    badRequest: runtimeOverrides.badRequest ?? responseHelpers.badRequest,
    notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    findUnidadeUserBaseLean: runtimeOverrides.findUnidadeUserBaseLean ?? (async (unitId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unitId);
      if (unitId === SCOPED_FILIAL_ID) {
        return {
          _id: SCOPED_FILIAL_ID,
          is_principal: false,
          unidade_principal_id: CONTEXT_PRINCIPAL_ID,
          matriz_id: CONTEXT_PRINCIPAL_ID,
        };
      }
      if (unitId === OUT_OF_SCOPE_FILIAL_ID) {
        return {
          _id: OUT_OF_SCOPE_FILIAL_ID,
          is_principal: false,
          unidade_principal_id: OUT_OF_SCOPE_PRINCIPAL_ID,
          matriz_id: OUT_OF_SCOPE_PRINCIPAL_ID,
        };
      }
      if (unitId === CONTEXT_PRINCIPAL_ID || unitId === OUT_OF_SCOPE_PRINCIPAL_ID) {
        return {
          _id: unitId,
          is_principal: true,
        };
      }
      return null;
    }),
    findFuncaoById: runtimeOverrides.findFuncaoById ?? (async (id, principalUnitId) => {
      callLog.findFuncaoByIdCalls.push([id, principalUnitId]);
      return null;
    }),
    findFuncaoByNome: runtimeOverrides.findFuncaoByNome ?? (async () => null),
    findOutraFuncaoByNomeExcludingId: runtimeOverrides.findOutraFuncaoByNomeExcludingId ?? (async (id, nome, principalUnitId) => {
      callLog.findOutraFuncaoByNomeExcludingIdCalls.push([id, nome, principalUnitId]);
      return null;
    }),
    findUnidadeByIdWithModulosAcessiveis: runtimeOverrides.findUnidadeByIdWithModulosAcessiveis ?? (async (principalUnitId) => {
      callLog.findUnidadeByIdWithModulosAcessiveisCalls.push([principalUnitId]);
      return {
        _id: principalUnitId,
        modulosAcessiveis: [
          { _id: 'mod-1', nome: 'Escalas' },
          { _id: 'mod-2', nome: 'Funcionarios' },
        ],
      };
    }),
    updateFuncaoById: runtimeOverrides.updateFuncaoById ?? (async (id, updates, principalUnitId) => {
      callLog.updateFuncaoByIdCalls.push([id, updates, principalUnitId]);
      return { acknowledged: true };
    }),
    findFuncaoByIdLean: runtimeOverrides.findFuncaoByIdLean ?? (async (id, principalUnitId) => {
      callLog.findFuncaoByIdLeanCalls.push([id, principalUnitId]);
      return {
        _id: id,
        codigo: 'SUP',
        nome: 'Supervisor Senior',
        descricao: 'Coordena equipe ampliada',
      };
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
      async ensureRequestedUnitWithinContextCluster({ scopedUnitId, requestedUnitId } = {}) {
        const requestedUnitIdNorm = String(requestedUnitId || '').trim();
        if (!requestedUnitIdNorm) return { allowed: true };
        const contextPrincipalUnitId = await this.resolveCanonicalContextPrincipalUnitId({ scopedUnitId });
        if (!contextPrincipalUnitId) return { allowed: true };
        const requestedPrincipalUnitId = await this.resolvePrincipalUnitId(requestedUnitIdNorm);
        return { allowed: !!requestedPrincipalUnitId && requestedPrincipalUnitId === contextPrincipalUnitId };
      },
    })),
    createFuncaoWriteValidationCore: runtimeOverrides.createFuncaoWriteValidationCore ?? (({
      findOutraFuncaoByNomeExcludingId,
      findUnidadeByIdWithModulosAcessiveis,
    }) => ({
      async validateUpdate(input) {
        callLog.seamCalls.push(input);

        const unidadePrincipalExistenteId = input.normalizeUnitId(input.existente?.unidade_principal_id);
        const targetPrincipalUnitId = input.contextPrincipalUnitId || input.normalizeUnitId(input.unidade_principal_id || unidadePrincipalExistenteId);

        if (input.nome && input.nome !== input.existente?.nome) {
          const dup = await findOutraFuncaoByNomeExcludingId(
            input.id,
            input.nome,
            targetPrincipalUnitId || unidadePrincipalExistenteId || null,
          );
          if (dup) return { error: 'Já existe uma função com este nome' };
        }

        const updates = {};
        if (input.nome) updates.nome = input.nome;
        if (input.descricao !== undefined) updates.descricao = input.descricao;

        if (targetPrincipalUnitId) {
          const unidade = await findUnidadeByIdWithModulosAcessiveis(targetPrincipalUnitId);
          if (!unidade) return { error: 'Unidade inválida' };

          updates.unidade_principal_id = targetPrincipalUnitId;
          if (input.modulos_habilitados !== undefined) {
            const lista = Array.isArray(input.modulos_habilitados) ? input.modulos_habilitados.filter(Boolean) : [];
            const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
            updates.modulos_habilitados = lista.filter((moduloId) => permitidos.has(String(moduloId)));
          }
        }

        return {
          data: updates,
          targetPrincipalUnitId: targetPrincipalUnitId || unidadePrincipalExistenteId || null,
        };
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
const notFound = __deps.notFound;
const serverError = __deps.serverError;
const findUnidadeUserBaseLean = __deps.findUnidadeUserBaseLean;
const findFuncaoById = __deps.findFuncaoById;
const findFuncaoByNome = __deps.findFuncaoByNome;
const findOutraFuncaoByNomeExcludingId = __deps.findOutraFuncaoByNomeExcludingId;
const updateFuncaoById = __deps.updateFuncaoById;
const findFuncaoByIdLean = __deps.findFuncaoByIdLean;
const findUnidadeByIdWithModulosAcessiveis = __deps.findUnidadeByIdWithModulosAcessiveis;
const createFuncaoContextPolicyCore = __deps.createFuncaoContextPolicyCore;
const createFuncaoWriteValidationCore = __deps.createFuncaoWriteValidationCore;
const console = __deps.console;
${snippet}
return { updateFuncao };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('updateFuncao: owner resolve contexto e lookup inicial antes da seam candidata, preservando 404 estrutural do alvo', async () => {
  const callOrder = [];
  const { updateFuncao, callLog } = loadUpdateOwnerHarness({
    findUnidadeUserBaseLean: async (unitId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unitId);
      callOrder.push(`context:${unitId}`);
      if (unitId === SCOPED_FILIAL_ID) {
        return {
          _id: SCOPED_FILIAL_ID,
          is_principal: false,
          unidade_principal_id: CONTEXT_PRINCIPAL_ID,
          matriz_id: CONTEXT_PRINCIPAL_ID,
        };
      }
      if (unitId === CONTEXT_PRINCIPAL_ID) {
        return {
          _id: CONTEXT_PRINCIPAL_ID,
          is_principal: true,
        };
      }
      return null;
    },
    findFuncaoById: async (id, principalUnitId) => {
      callLog.findFuncaoByIdCalls.push([id, principalUnitId]);
      callOrder.push('lookup');
      return null;
    },
    createFuncaoWriteValidationCore: () => ({
      async validateUpdate() {
        throw new Error('nao deve delegar quando o lookup inicial nao encontra a funcao');
      },
    }),
  });

  const req = buildReq({
    params: { id: FUNCAO_ID },
    body: { nome: 'Supervisor Senior' },
    unitScope: { unidadeId: SCOPED_FILIAL_ID },
  });
  const res = makeRes();

  await updateFuncao(req, res);

  assert.equal(callLog.seamCalls.length, 0);
  assert.deepEqual(callLog.findFuncaoByIdCalls, [[FUNCAO_ID, CONTEXT_PRINCIPAL_ID]]);
  assert.deepEqual(callOrder, [`context:${SCOPED_FILIAL_ID}`, 'lookup']);
  assert.equal(res.statusCode, 404);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: false,
    code: 'NOT_FOUND',
    message: 'Função não encontrada',
  }));
});

test('updateFuncao: owner preserva 404 estrutural quando a seam candidata sinaliza unidade fora do cluster', async () => {
  const { updateFuncao, callLog } = loadUpdateOwnerHarness({
    findFuncaoById: async (id, principalUnitId) => {
      callLog.findFuncaoByIdCalls.push([id, principalUnitId]);
      return {
        _id: id,
        nome: 'Supervisor',
        descricao: 'Coordena equipe',
        unidade_principal_id: CONTEXT_PRINCIPAL_ID,
      };
    },
    createFuncaoWriteValidationCore: () => ({
      async validateUpdate() {
        throw new Error('nao deve delegar update fora do cluster contextual');
      },
    }),
  });

  const req = buildReq({
    body: {
      nome: 'Supervisor Senior',
      unidade_principal_id: OUT_OF_SCOPE_FILIAL_ID,
    },
    unitScope: { unidadeId: SCOPED_FILIAL_ID },
  });
  const res = makeRes();

  await updateFuncao(req, res);

  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(res.statusCode, 404);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade principal não encontrada',
  }));
});

test('updateFuncao: owner delega o miolo coeso para a seam candidata e preserva o contrato final de sucesso', async () => {
  const callOrder = [];
  let seamArgs = null;
  const { updateFuncao, callLog } = loadUpdateOwnerHarness({
    findUnidadeUserBaseLean: async (unitId) => {
      callLog.findUnidadeUserBaseLeanCalls.push(unitId);
      if (unitId === SCOPED_FILIAL_ID) {
        return {
          _id: SCOPED_FILIAL_ID,
          is_principal: false,
          unidade_principal_id: CONTEXT_PRINCIPAL_ID,
          matriz_id: CONTEXT_PRINCIPAL_ID,
        };
      }
      if (unitId === CONTEXT_PRINCIPAL_ID) {
        return {
          _id: CONTEXT_PRINCIPAL_ID,
          is_principal: true,
        };
      }
      return null;
    },
    findFuncaoById: async (id, principalUnitId) => {
      callLog.findFuncaoByIdCalls.push([id, principalUnitId]);
      callOrder.push('lookup');
      return {
        _id: id,
        nome: 'Supervisor',
        descricao: 'Coordena equipe',
        unidade_principal_id: CONTEXT_PRINCIPAL_ID,
      };
    },
    findOutraFuncaoByNomeExcludingId: async (id, nome, principalUnitId) => {
      callLog.findOutraFuncaoByNomeExcludingIdCalls.push([id, nome, principalUnitId]);
      return null;
    },
    findUnidadeByIdWithModulosAcessiveis: async (principalUnitId) => {
      callLog.findUnidadeByIdWithModulosAcessiveisCalls.push([principalUnitId]);
      return {
        _id: principalUnitId,
        modulosAcessiveis: [
          { _id: 'mod-1', nome: 'Escalas' },
          { _id: 'mod-2', nome: 'Funcionarios' },
        ],
      };
    },
    updateFuncaoById: async (id, updates, principalUnitId) => {
      callLog.updateFuncaoByIdCalls.push([id, updates, principalUnitId]);
      return { acknowledged: true };
    },
    findFuncaoByIdLean: async (id, principalUnitId) => {
      callLog.findFuncaoByIdLeanCalls.push([id, principalUnitId]);
      return {
        _id: id,
        codigo: 'SUP',
        nome: 'Supervisor Senior',
        descricao: 'Coordena equipe ampliada',
      };
    },
    createFuncaoWriteValidationCore: ({ findOutraFuncaoByNomeExcludingId, findUnidadeByIdWithModulosAcessiveis }) => ({
      async validateUpdate(input) {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      seamArgs = input;

      const unidadePrincipalExistenteId = input.normalizeUnitId(input.existente.unidade_principal_id);
      const targetPrincipalUnitId = input.contextPrincipalUnitId || input.normalizeUnitId(input.unidade_principal_id || unidadePrincipalExistenteId);

      if (input.nome && input.nome !== input.existente.nome) {
        const dup = await findOutraFuncaoByNomeExcludingId(
          input.id,
          input.nome,
          targetPrincipalUnitId || unidadePrincipalExistenteId || null,
        );
        if (dup) return { error: 'Já existe uma função com este nome' };
      }

      const updates = {};
      if (input.nome) updates.nome = input.nome;
      if (input.descricao !== undefined) updates.descricao = input.descricao;

      if (targetPrincipalUnitId) {
        const unidade = await findUnidadeByIdWithModulosAcessiveis(targetPrincipalUnitId);
        if (!unidade) return { error: 'Unidade inválida' };

        updates.unidade_principal_id = targetPrincipalUnitId;
        if (input.modulos_habilitados !== undefined) {
          const lista = Array.isArray(input.modulos_habilitados) ? input.modulos_habilitados.filter(Boolean) : [];
          const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
          updates.modulos_habilitados = lista.filter((moduloId) => permitidos.has(String(moduloId)));
        }
      }

      return {
        data: updates,
        targetPrincipalUnitId: targetPrincipalUnitId || unidadePrincipalExistenteId || null,
      };
    },
    }),
  });

  const req = buildReq({
    body: {
      nome: 'Supervisor Senior',
      descricao: 'Coordena equipe ampliada',
      unidade_principal_id: SCOPED_FILIAL_ID,
      modulos_habilitados: ['mod-2', 'mod-x'],
    },
    unitScope: { unidadeId: SCOPED_FILIAL_ID },
  });
  const res = makeRes();

  await updateFuncao(req, res);

  assert.ok(seamArgs, 'A seam candidata deve receber o miolo apos o lookup inicial.');
  assert.deepEqual(callOrder, ['lookup', 'seam']);
  assert.equal(seamArgs.contextPrincipalUnitId, CONTEXT_PRINCIPAL_ID);
  assert.equal(JSON.stringify(Array.from(Object.keys(seamArgs)).sort()), JSON.stringify([
    'contextPrincipalUnitId',
    'descricao',
    'existente',
    'id',
    'modulos_habilitados',
    'nome',
    'normalizeUnitId',
    'unidade_principal_id',
  ].sort()));
  assert.deepEqual(callLog.findFuncaoByIdCalls, [[FUNCAO_ID, CONTEXT_PRINCIPAL_ID]]);
  assert.deepEqual(callLog.findOutraFuncaoByNomeExcludingIdCalls, [[FUNCAO_ID, 'Supervisor Senior', CONTEXT_PRINCIPAL_ID]]);
  assert.deepEqual(callLog.findUnidadeByIdWithModulosAcessiveisCalls, [[CONTEXT_PRINCIPAL_ID]]);
  assert.deepEqual(callLog.updateFuncaoByIdCalls, [[
    FUNCAO_ID,
    {
      nome: 'Supervisor Senior',
      descricao: 'Coordena equipe ampliada',
      unidade_principal_id: CONTEXT_PRINCIPAL_ID,
      modulos_habilitados: ['mod-2'],
    },
    CONTEXT_PRINCIPAL_ID,
  ]]);
  assert.deepEqual(callLog.findFuncaoByIdLeanCalls, [[FUNCAO_ID, CONTEXT_PRINCIPAL_ID]]);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: true,
    data: {
      updated: true,
      funcao: {
        _id: FUNCAO_ID,
        codigo: 'SUP',
        nome: 'Supervisor Senior',
        descricao: 'Coordena equipe ampliada',
        descricao_display: 'Coordena equipe ampliada',
        hasDescricaoReal: true,
      },
    },
  }));
});

test('updateFuncao: owner preserva tratamento de erro externo quando a seam candidata falha', async () => {
  const { updateFuncao, callLog } = loadUpdateOwnerHarness({
    findFuncaoById: async (id, principalUnitId) => {
      callLog.findFuncaoByIdCalls.push([id, principalUnitId]);
      return {
        _id: id,
        nome: 'Supervisor',
        descricao: 'Coordena equipe',
        unidade_principal_id: CONTEXT_PRINCIPAL_ID,
      };
    },
    createFuncaoWriteValidationCore: () => ({
      async validateUpdate(input) {
        callLog.seamCalls.push(input);
        throw new Error('forced-update-owner-structural-seam-failure');
      },
    }),
  });

  const req = buildReq({
    body: { nome: 'Supervisor Senior' },
    unitScope: { unidadeId: SCOPED_FILIAL_ID },
  });
  const res = makeRes();

  await updateFuncao(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.consoleErrors.length, 1);
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.stringify(res.body), JSON.stringify({
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-update-owner-structural-seam-failure',
  }));
});