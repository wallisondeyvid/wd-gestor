import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcaoApiController.js');
const LIST_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/funcoes/listarFuncoes.service.js');

const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const LIST_SERVICE_SOURCE = fs.readFileSync(LIST_SERVICE_PATH, 'utf8');

function buildFunctionFromSource(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function buildObjectFromSource(source, context = {}) {
  const script = new vm.Script(source);
  return script.runInNewContext(context);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function buildFuncaoContextPolicyCoreSource() {
  return `function createFuncaoContextPolicyCore({ findUnidadeUserBaseLean } = {}) {
    function normalizeUnitId(value) {
      return String(value || '').trim();
    }

    async function resolvePrincipalUnitId(unidadeId) {
      const unidadeIdNorm = normalizeUnitId(unidadeId);
      if (!unidadeIdNorm) return '';

      const unidade = await findUnidadeUserBaseLean(unidadeIdNorm);
      if (!unidade) return unidadeIdNorm;

      return normalizeUnitId(
        unidade.is_principal
          ? unidade._id
          : unidade.unidade_principal_id || unidade.matriz_id || unidade._id || unidadeIdNorm
      );
    }

    async function resolveCanonicalContextPrincipalUnitId({ scopedUnitId } = {}) {
      const scopedUnitIdNorm = normalizeUnitId(scopedUnitId);
      if (!scopedUnitIdNorm) return '';

      return resolvePrincipalUnitId(scopedUnitIdNorm);
    }

    async function ensureRequestedUnitWithinContextCluster({ scopedUnitId, requestedUnitId, isPrivileged = false } = {}) {
      const requestedUnitIdNorm = normalizeUnitId(requestedUnitId);
      const contextPrincipalUnitId = await resolveCanonicalContextPrincipalUnitId({ scopedUnitId });

      if (!requestedUnitIdNorm) {
        return {
          allowed: true,
          contextPrincipalUnitId,
          requestedPrincipalUnitId: '',
        };
      }

      if (!contextPrincipalUnitId) {
        const requestedPrincipalUnitId = await resolvePrincipalUnitId(requestedUnitIdNorm);
        return {
          allowed: !!isPrivileged,
          contextPrincipalUnitId: '',
          requestedPrincipalUnitId,
        };
      }

      const requestedPrincipalUnitId = await resolvePrincipalUnitId(requestedUnitIdNorm);
      return {
        allowed: !!requestedPrincipalUnitId && requestedPrincipalUnitId === contextPrincipalUnitId,
        contextPrincipalUnitId,
        requestedPrincipalUnitId,
      };
    }

    async function buildListScope({ scopedUnitId, unidadeCluster, unidadeIdRaw, isPrivileged = false } = {}) {
      const unidadeClusterNorm = normalizeUnitId(unidadeCluster);
      const unidadeIdRawNorm = normalizeUnitId(unidadeIdRaw);

      if (unidadeClusterNorm) {
        const access = await ensureRequestedUnitWithinContextCluster({
          scopedUnitId,
          requestedUnitId: unidadeClusterNorm,
          isPrivileged,
        });
        if (!access.allowed) {
          return { empty: true, filter: null, mode: 'cluster', resolvedPrincipalIds: [] };
        }

        const principalUnitId = await resolvePrincipalUnitId(unidadeClusterNorm);
        return {
          empty: !principalUnitId,
          filter: principalUnitId ? { unidade_principal_id: principalUnitId } : null,
          mode: 'cluster',
          resolvedPrincipalIds: principalUnitId ? [principalUnitId] : [],
        };
      }

      if (unidadeIdRawNorm) {
        const resolvedIds = [];
        for (const candidateId of unidadeIdRawNorm.split(',').map((value) => value.trim()).filter(Boolean)) {
          const access = await ensureRequestedUnitWithinContextCluster({
            scopedUnitId,
            requestedUnitId: candidateId,
            isPrivileged,
          });
          if (!access.allowed) continue;

          const principalUnitId = await resolvePrincipalUnitId(candidateId);
          if (principalUnitId) resolvedIds.push(principalUnitId);
        }

        const ids = [...new Set(resolvedIds)];
        if (ids.length === 0) {
          return { empty: true, filter: null, mode: 'unit-list', resolvedPrincipalIds: [] };
        }

        return {
          empty: false,
          filter: ids.length === 1
            ? { unidade_principal_id: ids[0] }
            : { unidade_principal_id: { $in: ids } },
          mode: 'unit-list',
          resolvedPrincipalIds: ids,
        };
      }

      return { empty: true, filter: null, mode: 'none', resolvedPrincipalIds: [] };
    }

    return {
      resolvePrincipalUnitId,
      resolveCanonicalContextPrincipalUnitId,
      ensureRequestedUnitWithinContextCluster,
      buildListScope,
    };
  }`;
}

function buildDelegatedFuncoesOwnersSource() {
  return `({
    async createOwner(req, res, deps) {
      const { nome, descricao, unidade_principal_id, modulos_habilitados } = req.body;
      const context = { scopedUnitId: req.unitScope?.unidadeId || null, isPrivileged: !!req.user?.isMaster || req.user?.role === 'master' || req.user?.role === 'admin' };
      const contextPrincipalUnitId = await deps.policy.resolveCanonicalContextPrincipalUnitId(context);
      const canonicalPrincipalUnitId = contextPrincipalUnitId || deps.normalizeUnitId(unidade_principal_id);

      if (!nome) return deps.badRequest(res, 'Nome é obrigatório');
      if (!canonicalPrincipalUnitId) return deps.badRequest(res, 'Unidade principal é obrigatória');

      const access = await deps.policy.ensureRequestedUnitWithinContextCluster({
        ...context,
        requestedUnitId: unidade_principal_id || canonicalPrincipalUnitId,
      });
      if (!access.allowed) return deps.notFound(res, 'Unidade principal não encontrada');

      const funcao = await deps.processCreate({
        nome,
        descricao,
        canonicalPrincipalUnitId,
        modulosHabilitados: modulos_habilitados,
      });
      if (funcao?.error) return deps.badRequest(res, funcao.error);

      return deps.created(res, funcao._id, { data: { _id: funcao._id } });
    },

    async updateOwner(req, res, deps) {
      const { id } = req.params;
      const { nome, descricao, unidade_principal_id, modulos_habilitados } = req.body;
      const context = { scopedUnitId: req.unitScope?.unidadeId || null, isPrivileged: !!req.user?.isMaster || req.user?.role === 'master' || req.user?.role === 'admin' };
      const contextPrincipalUnitId = await deps.policy.resolveCanonicalContextPrincipalUnitId(context);
      const existente = await deps.findFuncaoById(id, contextPrincipalUnitId || null);
      if (!existente) return deps.notFound(res, 'Função não encontrada');

      const requestedUnitId = unidade_principal_id || contextPrincipalUnitId || existente.unidade_principal_id;
      const access = await deps.policy.ensureRequestedUnitWithinContextCluster({
        ...context,
        requestedUnitId,
      });
      if (!access.allowed) return deps.notFound(res, 'Unidade principal não encontrada');

      const updated = await deps.processUpdate({
        id,
        nome,
        descricao,
        unidade_principal_id,
        modulos_habilitados,
        contextPrincipalUnitId,
        existente,
      });
      if (updated?.error === 'Unidade principal não encontrada') return deps.notFound(res, 'Unidade principal não encontrada');
      if (updated?.error) return deps.badRequest(res, updated.error);

      return deps.ok(res, { updated: true, funcao: updated });
    },

    async getByUnitOwner(req, res, deps) {
      const context = { scopedUnitId: req.unitScope?.unidadeId || null, isPrivileged: !!req.user?.isMaster || req.user?.role === 'master' || req.user?.role === 'admin' };
      const unidadeId = deps.normalizeUnitId(req.params.unidadeId);
      if (!unidadeId || unidadeId === 'null') return deps.ok(res, []);

      const access = await deps.policy.ensureRequestedUnitWithinContextCluster({
        ...context,
        requestedUnitId: unidadeId,
      });
      if (!access.allowed) return deps.ok(res, []);

      const principalUnitId = await deps.policy.resolvePrincipalUnitId(unidadeId);
      const funcoes = await deps.getByUnit({ effectiveUnitId: principalUnitId || unidadeId });
      return deps.ok(res, funcoes);
    },

    async deleteOwner(req, res, deps) {
      const context = { scopedUnitId: req.unitScope?.unidadeId || null, isPrivileged: !!req.user?.isMaster || req.user?.role === 'master' || req.user?.role === 'admin' };
      const contextPrincipalUnitId = await deps.policy.resolveCanonicalContextPrincipalUnitId(context);
      const funcao = await deps.processDelete({
        funcaoId: req.params.id,
        canonicalPrincipalUnitId: contextPrincipalUnitId || null,
      });
      if (!funcao) return deps.notFound(res, 'Função não encontrada');
      return deps.ok(res, { deleted: true, id: req.params.id });
    },

    async bulkOwner(req, res, deps) {
      const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
      if (!itens.length) return deps.badRequest(res, 'Lista vazia');

      const context = { scopedUnitId: req.unitScope?.unidadeId || null, isPrivileged: !!req.user?.isMaster || req.user?.role === 'master' || req.user?.role === 'admin' };
      const contextPrincipalUnitId = await deps.policy.resolveCanonicalContextPrincipalUnitId(context);
      const bulkResult = await deps.processBulk({
        itens,
        contextPrincipalUnitId,
      });
      return deps.ok(res, { updated: bulkResult.updated, results: bulkResult.results });
    },

    async listService(input, deps) {
      const scope = await deps.policy.buildListScope({
        scopedUnitId: input.unitScope?.unidadeId || null,
        isPrivileged: !!input.user?.isMaster || input.user?.role === 'master' || input.user?.role === 'admin',
        unidadeCluster: input.query?.unidade_cluster || null,
        unidadeIdRaw: input.query?.unidade_id || null,
      });

      if (scope.empty) return [];

      const funcoes = scope.mode === 'cluster'
        ? await deps.findFuncoes(scope.filter)
        : await deps.findFuncoesSelect(scope.filter);

      return deps.mapOutput(funcoes, scope.mode, input.query?.q || '');
    },
  })`;
}

test('estado real atual: controller e service delegam o miolo de contexto-policy para a seam unica', () => {
  assert.match(CONTROLLER_SOURCE, /const funcaoContextPolicy = createFuncaoContextPolicyCore\(\{/);
  assert.match(CONTROLLER_SOURCE, /const context = getRequestScopeContext\(req\);/);
  assert.match(CONTROLLER_SOURCE, /funcaoContextPolicy\.resolveCanonicalContextPrincipalUnitId\(context\)/);
  assert.match(CONTROLLER_SOURCE, /funcaoContextPolicy\.ensureRequestedUnitWithinContextCluster\(\{/);
  assert.match(CONTROLLER_SOURCE, /funcaoContextPolicy\.resolvePrincipalUnitId\(unidadeId\)/);

  assert.match(LIST_SERVICE_SOURCE, /const funcaoContextPolicy = createFuncaoContextPolicyCore\(\{/);
  assert.match(LIST_SERVICE_SOURCE, /const scope = await funcaoContextPolicy\.buildListScope\(\{/);

  assert.equal(countOccurrences(CONTROLLER_SOURCE, 'funcaoContextPolicy.resolveCanonicalContextPrincipalUnitId('), 5);
  assert.equal(countOccurrences(CONTROLLER_SOURCE, 'funcaoContextPolicy.ensureRequestedUnitWithinContextCluster({'), 3);
  assert.equal(countOccurrences(LIST_SERVICE_SOURCE, 'funcaoContextPolicy.buildListScope({'), 1);

  assert.doesNotMatch(CONTROLLER_SOURCE, /async function resolvePrincipalUnitId\(unidadeId\)/);
  assert.doesNotMatch(CONTROLLER_SOURCE, /async function getCanonicalContextPrincipalUnitId\(req\)/);
  assert.doesNotMatch(CONTROLLER_SOURCE, /async function requestedUnitWithinContextCluster\(req, requestedUnitId\)/);
  assert.doesNotMatch(LIST_SERVICE_SOURCE, /async function getCanonicalContextPrincipalUnitId\(unitScope\)/);
  assert.doesNotMatch(LIST_SERVICE_SOURCE, /async function requestedUnitWithinContextCluster\(unitScope, requestedUnitId\)/);
});

test('futura seam unica recebe apenas contexto minimo para decidir unidade principal, cluster e escopo de listagem', async () => {
  const functionSource = buildFuncaoContextPolicyCoreSource();
  assert.match(functionSource, /function createFuncaoContextPolicyCore\(\{ findUnidadeUserBaseLean \} = \{\}\)/);
  assert.doesNotMatch(functionSource, /createFuncaoDb|updateFuncaoById|deleteFuncaoScopedService|processBulkUpdateFuncoesItems|processCreateFuncaoCore|executeUpdateFuncaoCore/);
  assert.doesNotMatch(functionSource, /modulos_habilitados|findFuncaoByNome|findOutraFuncaoByNomeExcludingId|saveFuncao|badRequest|created\(|ok\(|notFound|serverError/);
  assert.doesNotMatch(functionSource, /mapClusterFuncao|mapUnidadeFuncao|descricao_display|descricao_final/);
  assert.doesNotMatch(functionSource, /\breq\b|\bres\b/);

  const calls = [];
  const createFuncaoContextPolicyCore = buildFunctionFromSource(buildFuncaoContextPolicyCoreSource());
  const policy = createFuncaoContextPolicyCore({
    findUnidadeUserBaseLean: async (id) => {
      calls.push(['findUnidadeUserBaseLean', id]);
      if (id === 'filial-a') {
        return {
          _id: 'filial-a',
          is_principal: false,
          unidade_principal_id: 'principal-a',
        };
      }
      if (id === 'filial-b') {
        return {
          _id: 'filial-b',
          is_principal: false,
          matriz_id: 'principal-a',
        };
      }
      if (id === 'principal-a') {
        return {
          _id: 'principal-a',
          is_principal: true,
        };
      }
      if (id === 'outside-x') {
        return {
          _id: 'outside-x',
          is_principal: true,
        };
      }
      return null;
    },
  });

  assert.deepEqual(toPlain(await policy.resolveCanonicalContextPrincipalUnitId({ scopedUnitId: 'filial-a' })), 'principal-a');
  assert.deepEqual(toPlain(await policy.ensureRequestedUnitWithinContextCluster({
    scopedUnitId: 'filial-a',
    requestedUnitId: 'filial-b',
    isPrivileged: false,
  })), {
    allowed: true,
    contextPrincipalUnitId: 'principal-a',
    requestedPrincipalUnitId: 'principal-a',
  });
  assert.deepEqual(toPlain(await policy.ensureRequestedUnitWithinContextCluster({
    scopedUnitId: 'filial-a',
    requestedUnitId: 'outside-x',
    isPrivileged: false,
  })), {
    allowed: false,
    contextPrincipalUnitId: 'principal-a',
    requestedPrincipalUnitId: 'outside-x',
  });
  assert.deepEqual(toPlain(await policy.ensureRequestedUnitWithinContextCluster({
    requestedUnitId: 'outside-x',
    isPrivileged: false,
  })), {
    allowed: false,
    contextPrincipalUnitId: '',
    requestedPrincipalUnitId: 'outside-x',
  });
  assert.deepEqual(toPlain(await policy.ensureRequestedUnitWithinContextCluster({
    requestedUnitId: 'outside-x',
    isPrivileged: true,
  })), {
    allowed: true,
    contextPrincipalUnitId: '',
    requestedPrincipalUnitId: 'outside-x',
  });
  assert.deepEqual(toPlain(await policy.buildListScope({
    scopedUnitId: 'filial-a',
    unidadeCluster: 'filial-b',
    isPrivileged: false,
  })), {
    empty: false,
    filter: { unidade_principal_id: 'principal-a' },
    mode: 'cluster',
    resolvedPrincipalIds: ['principal-a'],
  });
  assert.deepEqual(toPlain(await policy.buildListScope({
    scopedUnitId: 'filial-a',
    unidadeIdRaw: 'filial-a,filial-b,outside-x',
    isPrivileged: false,
  })), {
    empty: false,
    filter: { unidade_principal_id: 'principal-a' },
    mode: 'unit-list',
    resolvedPrincipalIds: ['principal-a'],
  });
  assert.deepEqual(toPlain(await policy.buildListScope({
    scopedUnitId: 'filial-a',
    unidadeCluster: 'outside-x',
    isPrivileged: false,
  })), {
    empty: true,
    filter: null,
    mode: 'cluster',
    resolvedPrincipalIds: [],
  });
  assert.deepEqual(toPlain(await policy.buildListScope({
    unidadeCluster: 'outside-x',
    isPrivileged: false,
  })), {
    empty: true,
    filter: null,
    mode: 'cluster',
    resolvedPrincipalIds: [],
  });

  assert.deepEqual(calls.slice(0, 5), [
    ['findUnidadeUserBaseLean', 'filial-a'],
    ['findUnidadeUserBaseLean', 'filial-a'],
    ['findUnidadeUserBaseLean', 'filial-b'],
    ['findUnidadeUserBaseLean', 'filial-a'],
    ['findUnidadeUserBaseLean', 'outside-x'],
  ]);
  assert.ok(calls.length >= 16);
  assert.ok(calls.some(([name, id]) => name === 'findUnidadeUserBaseLean' && id === 'filial-b'));
  assert.ok(calls.some(([name, id]) => name === 'findUnidadeUserBaseLean' && id === 'outside-x'));
});

test('apos extracao, endpoints seguem owners HTTP e service delega somente o miolo de contexto-policy', async () => {
  const ownerSource = buildDelegatedFuncoesOwnersSource();
  assert.match(ownerSource, /deps\.policy\.resolveCanonicalContextPrincipalUnitId\(context\)/);
  assert.match(ownerSource, /deps\.policy\.ensureRequestedUnitWithinContextCluster\(\{/);
  assert.match(ownerSource, /deps\.policy\.resolvePrincipalUnitId\(unidadeId\)/);
  assert.match(ownerSource, /const scope = await deps\.policy\.buildListScope\(\{/);
  assert.doesNotMatch(ownerSource, /async function resolvePrincipalUnitId\(|async function getCanonicalContextPrincipalUnitId\(|async function requestedUnitWithinContextCluster\(/);
  assert.doesNotMatch(ownerSource, /findOutraFuncaoByNomeExcludingId|findUnidadeByIdWithModulosAcessiveis|normalizarListaModulos/);

  const calls = [];
  const owners = buildObjectFromSource(buildDelegatedFuncoesOwnersSource());
  const deps = {
    normalizeUnitId(value) {
      return String(value || '').trim();
    },
    badRequest(res, message) {
      calls.push(['badRequest', message]);
      res.statusCode = 400;
      res.body = { message };
      return res;
    },
    notFound(res, message) {
      calls.push(['notFound', message]);
      res.statusCode = 404;
      res.body = { message };
      return res;
    },
    created(res, id, payload) {
      calls.push(['created', id, toPlain(payload)]);
      res.statusCode = 201;
      res.body = { id, ...toPlain(payload) };
      return res;
    },
    ok(res, payload) {
      calls.push(['ok', toPlain(payload)]);
      res.statusCode = 200;
      res.body = toPlain(payload);
      return res;
    },
    policy: {
      async resolveCanonicalContextPrincipalUnitId(input) {
        calls.push(['resolveCanonicalContextPrincipalUnitId', toPlain(input)]);
        return input.scopedUnitId === 'filial-a' ? 'principal-a' : '';
      },
      async ensureRequestedUnitWithinContextCluster(input) {
        calls.push(['ensureRequestedUnitWithinContextCluster', toPlain(input)]);
        return { allowed: input.requestedUnitId !== 'outside-x' };
      },
      async resolvePrincipalUnitId(unidadeId) {
        calls.push(['resolvePrincipalUnitId', unidadeId]);
        return unidadeId === 'filial-a' ? 'principal-a' : unidadeId;
      },
      async buildListScope(input) {
        calls.push(['buildListScope', toPlain(input)]);
        return {
          empty: false,
          mode: 'cluster',
          filter: { unidade_principal_id: 'principal-a' },
        };
      },
    },
    processCreate: async (input) => {
      calls.push(['processCreate', toPlain(input)]);
      return { _id: 'func-1' };
    },
    findFuncaoById: async (id, contextPrincipalUnitId) => {
      calls.push(['findFuncaoById', id, contextPrincipalUnitId]);
      return { _id: id, unidade_principal_id: 'principal-a' };
    },
    processUpdate: async (input) => {
      calls.push(['processUpdate', toPlain(input)]);
      return { _id: input.id };
    },
    getByUnit: async (input) => {
      calls.push(['getByUnit', toPlain(input)]);
      return [{ _id: 'func-2' }];
    },
    processDelete: async (input) => {
      calls.push(['processDelete', toPlain(input)]);
      return { _id: input.funcaoId };
    },
    processBulk: async (input) => {
      calls.push(['processBulk', toPlain(input)]);
      return { updated: 1, results: [{ _id: 'func-3', ok: true }] };
    },
    findFuncoes: async (filter) => {
      calls.push(['findFuncoes', toPlain(filter)]);
      return [{ _id: 'func-4' }];
    },
    findFuncoesSelect: async (filter) => {
      calls.push(['findFuncoesSelect', toPlain(filter)]);
      return [{ _id: 'func-5' }];
    },
    mapOutput: (funcoes, mode, queryTerm) => {
      calls.push(['mapOutput', toPlain(funcoes), mode, queryTerm]);
      return funcoes;
    },
  };

  const createRes = {};
  await owners.createOwner({
    body: {
      nome: 'Supervisor',
      descricao: 'Descricao',
      unidade_principal_id: 'filial-a',
      modulos_habilitados: ['mod-1'],
    },
    unitScope: { unidadeId: 'filial-a' },
    user: { role: 'diretor' },
  }, createRes, deps);

  const getByUnitRes = {};
  await owners.getByUnitOwner({
    params: { unidadeId: 'filial-a' },
    unitScope: { unidadeId: 'filial-a' },
    user: { role: 'diretor' },
  }, getByUnitRes, deps);

  const bulkRes = {};
  await owners.bulkOwner({
    body: { itens: [{ _id: 'func-3', nome: 'Supervisor' }] },
    unitScope: { unidadeId: 'filial-a' },
    user: { role: 'diretor' },
  }, bulkRes, deps);

  const listed = await owners.listService({
    query: { unidade_cluster: 'filial-a', q: 'sup' },
    unitScope: { unidadeId: 'filial-a' },
    user: { role: 'diretor' },
  }, deps);

  assert.equal(createRes.statusCode, 201);
  assert.deepEqual(toPlain(getByUnitRes.body), [{ _id: 'func-2' }]);
  assert.deepEqual(toPlain(bulkRes.body), {
    updated: 1,
    results: [{ _id: 'func-3', ok: true }],
  });
  assert.deepEqual(toPlain(listed), [{ _id: 'func-4' }]);

  assert.deepEqual(calls, [
    ['resolveCanonicalContextPrincipalUnitId', { scopedUnitId: 'filial-a', isPrivileged: false }],
    ['ensureRequestedUnitWithinContextCluster', { scopedUnitId: 'filial-a', isPrivileged: false, requestedUnitId: 'filial-a' }],
    ['processCreate', {
      nome: 'Supervisor',
      descricao: 'Descricao',
      canonicalPrincipalUnitId: 'principal-a',
      modulosHabilitados: ['mod-1'],
    }],
    ['created', 'func-1', { data: { _id: 'func-1' } }],
    ['ensureRequestedUnitWithinContextCluster', { scopedUnitId: 'filial-a', isPrivileged: false, requestedUnitId: 'filial-a' }],
    ['resolvePrincipalUnitId', 'filial-a'],
    ['getByUnit', { effectiveUnitId: 'principal-a' }],
    ['ok', [{ _id: 'func-2' }]],
    ['resolveCanonicalContextPrincipalUnitId', { scopedUnitId: 'filial-a', isPrivileged: false }],
    ['processBulk', { itens: [{ _id: 'func-3', nome: 'Supervisor' }], contextPrincipalUnitId: 'principal-a' }],
    ['ok', { updated: 1, results: [{ _id: 'func-3', ok: true }] }],
    ['buildListScope', { scopedUnitId: 'filial-a', isPrivileged: false, unidadeCluster: 'filial-a', unidadeIdRaw: null }],
    ['findFuncoes', { unidade_principal_id: 'principal-a' }],
    ['mapOutput', [{ _id: 'func-4' }], 'cluster', 'sup'],
  ]);
});