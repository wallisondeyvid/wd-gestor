import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/recursoApiController.js');
const LIST_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/recursos/listarRecursos.service.js');
const POLICY_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/recursos/createRecursoContextPolicyCore.js');

const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const LIST_SERVICE_SOURCE = fs.readFileSync(LIST_SERVICE_PATH, 'utf8');
const POLICY_CORE_SOURCE = fs.readFileSync(POLICY_CORE_PATH, 'utf8');

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

function buildRecursoContextPolicyCoreSource() {
  return `function createRecursoContextPolicyCore({ findUnidadeUserBaseLean, findUnidadesByCondLean } = {}) {
    function normalizeUnitId(value) {
      return String(value || '').trim();
    }

    function isMasterOrAdmin(currentUser) {
      return !!(currentUser?.isMaster || currentUser?.role === 'admin');
    }

    function resolveCanonicalContextUnitId({ currentUser, sessionUser, scopedUnitId } = {}) {
      return normalizeUnitId(scopedUnitId || currentUser?.unidade_id || sessionUser?.unidade_id);
    }

    function shouldBlockForMissingContext({ currentUser, sessionUser, scopedUnitId } = {}) {
      return !isMasterOrAdmin(currentUser || null) && !resolveCanonicalContextUnitId({
        currentUser,
        sessionUser,
        scopedUnitId,
      });
    }

    function ensureRequestedUnitAccess({ currentUser, sessionUser, scopedUnitId, requestedUnitId } = {}) {
      const requested = normalizeUnitId(requestedUnitId);
      const canonicalContextUnitId = resolveCanonicalContextUnitId({ currentUser, sessionUser, scopedUnitId });

      if (!requested) {
        return { allowed: true, canonicalContextUnitId: canonicalContextUnitId || null };
      }

      if (isMasterOrAdmin(currentUser || null)) {
        return {
          allowed: true,
          canonicalContextUnitId: canonicalContextUnitId || null,
          effectiveUnitId: requested,
        };
      }

      if (!canonicalContextUnitId) {
        return {
          allowed: false,
          blocked: true,
          error: 'missing_context',
          canonicalContextUnitId: null,
        };
      }

      if (canonicalContextUnitId !== requested) {
        return {
          allowed: false,
          error: 'out_of_scope',
          canonicalContextUnitId,
        };
      }

      return {
        allowed: true,
        canonicalContextUnitId,
        effectiveUnitId: requested,
      };
    }

    async function buildListScope({ currentUser, sessionUser, scopedUnitId, requestedUnitId } = {}) {
      const requested = normalizeUnitId(requestedUnitId);
      const canonicalContextUnitId = resolveCanonicalContextUnitId({ currentUser, sessionUser, scopedUnitId });

      if (shouldBlockForMissingContext({ currentUser, sessionUser, scopedUnitId })) {
        return { blocked: true, filter: null, canonicalContextUnitId: null };
      }

      if (isMasterOrAdmin(currentUser || null)) {
        return {
          blocked: false,
          filter: requested ? { unidade_id: requested } : {},
          canonicalContextUnitId: canonicalContextUnitId || null,
        };
      }

      const anchorUnitId = canonicalContextUnitId;
      const unidadeAnchor = anchorUnitId ? await findUnidadeUserBaseLean(anchorUnitId) : null;
      const principalId = unidadeAnchor
        ? String(
            unidadeAnchor.is_principal
              ? unidadeAnchor._id
              : (unidadeAnchor.unidade_principal_id || unidadeAnchor.matriz_id || unidadeAnchor._id || anchorUnitId)
          )
        : anchorUnitId;
      const cond = principalId
        ? { $or: [{ _id: principalId }, { unidade_principal_id: principalId }, { matriz_id: principalId }] }
        : { _id: anchorUnitId || null };
      const unidadesAcessiveis = await findUnidadesByCondLean(cond);
      const allowedUnitIds = unidadesAcessiveis.map((unidade) => String(unidade._id));

      if (requested) {
        if (!allowedUnitIds.includes(requested)) {
          return {
            blocked: false,
            empty: true,
            filter: null,
            canonicalContextUnitId: anchorUnitId || null,
            allowedUnitIds,
          };
        }

        return {
          blocked: false,
          filter: { unidade_id: requested },
          canonicalContextUnitId: anchorUnitId || null,
          allowedUnitIds,
        };
      }

      return {
        blocked: false,
        filter: { unidade_id: { $in: allowedUnitIds } },
        canonicalContextUnitId: anchorUnitId || null,
        allowedUnitIds,
      };
    }

    return {
      resolveCanonicalContextUnitId,
      shouldBlockForMissingContext,
      ensureRequestedUnitAccess,
      buildListScope,
    };
  }`;
}

function buildDelegatedRecursosOwnersSource() {
  return `({
    async getOwner(req, res, deps) {
      if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return deps.badRequest(res, 'ID inválido');

      const context = {
        currentUser: req.user || null,
        sessionUser: req.session?.user || null,
        scopedUnitId: req.unitScope?.unidadeId || null,
      };

      if (deps.policy.shouldBlockForMissingContext(context)) {
        return deps.notFound(res, 'Unidade não encontrada');
      }

      const unidadeEfetiva = deps.policy.resolveCanonicalContextUnitId(context) || null;
      const recurso = await deps.getRecursoById({ id: req.params.id, unidadeEfetiva });
      if (!recurso) return deps.notFound(res, 'Recurso não encontrado');

      return deps.ok(res, recurso);
    },

    async createOwner(req, res, deps) {
      const requestedUnitId = String(req.body?.unidade_id || '').trim();
      const context = {
        currentUser: req.user || null,
        sessionUser: req.session?.user || null,
        scopedUnitId: req.unitScope?.unidadeId || null,
      };

      if (deps.policy.shouldBlockForMissingContext(context)) {
        return deps.notFound(res, 'Unidade não encontrada');
      }

      const access = deps.policy.ensureRequestedUnitAccess({
        ...context,
        requestedUnitId,
      });
      if (!access.allowed) return deps.notFound(res, 'Unidade não encontrada');

      const createResult = await deps.processCreate({ requestedUnitId, body: req.body });
      if (createResult?.error) return deps.badRequest(res, createResult.error);

      return deps.created(res, createResult._id, { data: createResult });
    },

    async updateOwner(req, res, deps) {
      const requestedUnitId = String(req.body?.unidade_id || '').trim();
      const context = {
        currentUser: req.user || null,
        sessionUser: req.session?.user || null,
        scopedUnitId: req.unitScope?.unidadeId || null,
      };

      if (deps.policy.shouldBlockForMissingContext(context)) {
        return deps.notFound(res, 'Unidade não encontrada');
      }

      const access = deps.policy.ensureRequestedUnitAccess({
        ...context,
        requestedUnitId,
      });
      if (!access.allowed) return deps.notFound(res, 'Unidade não encontrada');

      const updateResult = await deps.processUpdate({
        id: req.params.id,
        requestedUnitId,
        body: req.body,
      });
      if (!updateResult) return deps.notFound(res, 'Recurso não encontrado');

      return deps.ok(res, updateResult);
    },

    async deleteOwner(req, res, deps) {
      if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return deps.badRequest(res, 'ID inválido');

      const context = {
        currentUser: req.user || null,
        sessionUser: req.session?.user || null,
        scopedUnitId: req.unitScope?.unidadeId || null,
      };

      if (deps.policy.shouldBlockForMissingContext(context)) {
        return deps.notFound(res, 'Unidade não encontrada');
      }

      const unidadeEfetiva = deps.policy.resolveCanonicalContextUnitId(context) || null;
      const recurso = await deps.processDelete({ recursoId: req.params.id, unidadeEfetiva });
      if (!recurso) return deps.notFound(res, 'Recurso não encontrado');

      return deps.ok(res, { deleted: true, id: req.params.id });
    },

    async listService(input, deps) {
      const scope = await deps.policy.buildListScope({
        currentUser: input.user || null,
        sessionUser: input.sessionUser || null,
        scopedUnitId: input.scopedUnitId || null,
        requestedUnitId: input.unidadeId || null,
      });

      if (scope.blocked) {
        return { blocked: true, data: null };
      }

      if (scope.empty) {
        return { blocked: false, data: [] };
      }

      let recursos = await deps.findRecursos(scope.filter);
      if (input.placaTermNorm) {
        recursos = deps.filterByPlaca(recursos, input.placaTermNorm);
      }

      return { blocked: false, data: deps.mapRecursos(recursos) };
    },
  })`;
}

test('estado real atual: controller e service delegam o miolo de contexto-policy para a seam unica', () => {
  assert.match(POLICY_CORE_SOURCE, /export function createRecursoContextPolicyCore\(\{ findUnidadeUserBaseLean, findUnidadesByCondLean \} = \{\}\)/);

  assert.match(CONTROLLER_SOURCE, /const recursoContextPolicy = createRecursoContextPolicyCore\(\{/);
  assert.match(CONTROLLER_SOURCE, /const context = getRequestScopeContext\(req\);/);
  assert.match(CONTROLLER_SOURCE, /recursoContextPolicy\.shouldBlockForMissingContext\(context\)/);
  assert.match(CONTROLLER_SOURCE, /recursoContextPolicy\.resolveCanonicalContextUnitId\(context\)/);
  assert.match(CONTROLLER_SOURCE, /const access = recursoContextPolicy\.ensureRequestedUnitAccess\(\{/);

  assert.match(LIST_SERVICE_SOURCE, /const recursoContextPolicy = createRecursoContextPolicyCore\(\{/);
  assert.match(LIST_SERVICE_SOURCE, /const scope = await recursoContextPolicy\.buildListScope\(\{/);

  assert.equal(countOccurrences(CONTROLLER_SOURCE, 'recursoContextPolicy.shouldBlockForMissingContext(context)'), 4);
  assert.equal(countOccurrences(CONTROLLER_SOURCE, 'recursoContextPolicy.ensureRequestedUnitAccess({'), 2);
  assert.equal(countOccurrences(LIST_SERVICE_SOURCE, 'recursoContextPolicy.buildListScope({'), 1);

  assert.doesNotMatch(CONTROLLER_SOURCE, /function getCanonicalContextUnitId\(req\)/);
  assert.doesNotMatch(CONTROLLER_SOURCE, /function shouldBlockForMissingContext\(req\)/);
  assert.doesNotMatch(CONTROLLER_SOURCE, /function requestedUnitMatchesContext\(req, requestedUnitId\)/);
  assert.doesNotMatch(LIST_SERVICE_SOURCE, /function getCanonicalContextUnitId\(\{\s*user, session, unitScope\s*\}\)\s*\{/);
  assert.doesNotMatch(LIST_SERVICE_SOURCE, /function shouldBlockForMissingContext\(\{\s*user, session, unitScope\s*\}\)\s*\{/);
});

test('futura seam unica recebe apenas contexto minimo para decidir escopo e unidade efetiva', async () => {
  const functionSource = buildRecursoContextPolicyCoreSource();
  assert.match(functionSource, /function createRecursoContextPolicyCore\(\{ findUnidadeUserBaseLean, findUnidadesByCondLean \} = \{\}\)/);
  assert.doesNotMatch(functionSource, /processCreateRecursoCore|processUpdateRecursoCore|deleteRecursoScopedService|findRecursosByFiltroComUnidadeService/);
  assert.doesNotMatch(functionSource, /placa|chassi|renavam|created\(|badRequest|notFound|serverError|mapRecurso/);
  assert.doesNotMatch(functionSource, /\breq\b|\bres\b/);

  const calls = [];
  const createRecursoContextPolicyCore = buildFunctionFromSource(buildRecursoContextPolicyCoreSource());
  const policy = createRecursoContextPolicyCore({
    findUnidadeUserBaseLean: async (id) => {
      calls.push(['findUnidadeUserBaseLean', id]);
      return {
        _id: 'unit-principal',
        is_principal: false,
        unidade_principal_id: 'unit-principal',
        matriz_id: null,
      };
    },
    findUnidadesByCondLean: async (cond) => {
      calls.push(['findUnidadesByCondLean', toPlain(cond)]);
      return [{ _id: 'unit-principal' }, { _id: 'unit-child' }];
    },
  });

  assert.equal(policy.resolveCanonicalContextUnitId({ scopedUnitId: 'unit-1' }), 'unit-1');
  assert.equal(policy.resolveCanonicalContextUnitId({ currentUser: { unidade_id: 'unit-2' } }), 'unit-2');
  assert.equal(policy.shouldBlockForMissingContext({ currentUser: { role: 'user' } }), true);
  assert.equal(policy.shouldBlockForMissingContext({ currentUser: { role: 'admin' } }), false);

  assert.deepEqual(toPlain(policy.ensureRequestedUnitAccess({
    currentUser: { role: 'admin' },
    requestedUnitId: 'unit-admin-target',
  })), {
    allowed: true,
    canonicalContextUnitId: null,
    effectiveUnitId: 'unit-admin-target',
  });

  assert.deepEqual(toPlain(policy.ensureRequestedUnitAccess({
    currentUser: { role: 'user', unidade_id: 'unit-ctx' },
    requestedUnitId: 'unit-ctx',
  })), {
    allowed: true,
    canonicalContextUnitId: 'unit-ctx',
    effectiveUnitId: 'unit-ctx',
  });

  assert.deepEqual(toPlain(policy.ensureRequestedUnitAccess({
    currentUser: { role: 'user' },
    requestedUnitId: 'unit-ctx',
  })), {
    allowed: false,
    blocked: true,
    error: 'missing_context',
    canonicalContextUnitId: null,
  });

  assert.deepEqual(toPlain(policy.ensureRequestedUnitAccess({
    currentUser: { role: 'user', unidade_id: 'unit-ctx' },
    requestedUnitId: 'unit-other',
  })), {
    allowed: false,
    error: 'out_of_scope',
    canonicalContextUnitId: 'unit-ctx',
  });

  assert.deepEqual(toPlain(await policy.buildListScope({
    currentUser: { role: 'admin' },
    requestedUnitId: 'unit-admin-target',
  })), {
    blocked: false,
    filter: { unidade_id: 'unit-admin-target' },
    canonicalContextUnitId: null,
  });

  assert.deepEqual(toPlain(await policy.buildListScope({
    currentUser: { role: 'user', unidade_id: 'unit-child' },
  })), {
    blocked: false,
    filter: { unidade_id: { $in: ['unit-principal', 'unit-child'] } },
    canonicalContextUnitId: 'unit-child',
    allowedUnitIds: ['unit-principal', 'unit-child'],
  });

  assert.deepEqual(toPlain(await policy.buildListScope({
    currentUser: { role: 'user', unidade_id: 'unit-child' },
    requestedUnitId: 'unit-outside',
  })), {
    blocked: false,
    empty: true,
    filter: null,
    canonicalContextUnitId: 'unit-child',
    allowedUnitIds: ['unit-principal', 'unit-child'],
  });

  assert.deepEqual(calls, [
    ['findUnidadeUserBaseLean', 'unit-child'],
    ['findUnidadesByCondLean', { $or: [{ _id: 'unit-principal' }, { unidade_principal_id: 'unit-principal' }, { matriz_id: 'unit-principal' }] }],
    ['findUnidadeUserBaseLean', 'unit-child'],
    ['findUnidadesByCondLean', { $or: [{ _id: 'unit-principal' }, { unidade_principal_id: 'unit-principal' }, { matriz_id: 'unit-principal' }] }],
  ]);
});

test('controller e service continuam owners apos a extracao da seam unica de contexto-policy', async () => {
  const policyCalls = [];
  const compiled = buildObjectFromSource(buildDelegatedRecursosOwnersSource());
  const deps = {
    policy: {
      shouldBlockForMissingContext: (input) => {
        policyCalls.push(['shouldBlockForMissingContext', toPlain(input)]);
        return false;
      },
      resolveCanonicalContextUnitId: (input) => {
        policyCalls.push(['resolveCanonicalContextUnitId', toPlain(input)]);
        return 'unit-ctx';
      },
      ensureRequestedUnitAccess: (input) => {
        policyCalls.push(['ensureRequestedUnitAccess', toPlain(input)]);
        return { allowed: true, canonicalContextUnitId: 'unit-ctx', effectiveUnitId: input.requestedUnitId || null };
      },
      buildListScope: async (input) => {
        policyCalls.push(['buildListScope', toPlain(input)]);
        return { blocked: false, filter: { unidade_id: { $in: ['unit-ctx', 'unit-child'] } } };
      },
    },
    badRequest: (_res, message) => ({ status: 400, message }),
    notFound: (_res, message) => ({ status: 404, message }),
    ok: (_res, data) => ({ ok: true, data }),
    created: (_res, id, extra) => ({ created: true, id, extra }),
    getRecursoById: async ({ id, unidadeEfetiva }) => ({ _id: id, unidadeEfetiva }),
    processCreate: async ({ requestedUnitId }) => ({ _id: 'rec-1', unidade_id: requestedUnitId }),
    processUpdate: async ({ id, requestedUnitId }) => ({ _id: id, unidade_id: requestedUnitId }),
    processDelete: async ({ recursoId, unidadeEfetiva }) => ({ _id: recursoId, unidadeEfetiva }),
    findRecursos: async (filter) => [{ _id: 'rec-1', filter }],
    filterByPlaca: (items) => items,
    mapRecursos: (items) => items.map((item) => ({ id: item._id })),
  };

  await compiled.getOwner({ params: { id: '507f1f77bcf86cd799439011' }, user: { unidade_id: 'unit-ctx' }, session: { user: {} }, unitScope: { unidadeId: 'unit-ctx' } }, {}, deps);
  await compiled.createOwner({ body: { unidade_id: 'unit-ctx' }, user: { unidade_id: 'unit-ctx' }, session: { user: {} }, unitScope: { unidadeId: 'unit-ctx' } }, {}, deps);
  await compiled.updateOwner({ params: { id: '507f1f77bcf86cd799439012' }, body: { unidade_id: 'unit-ctx' }, user: { unidade_id: 'unit-ctx' }, session: { user: {} }, unitScope: { unidadeId: 'unit-ctx' } }, {}, deps);
  await compiled.deleteOwner({ params: { id: '507f1f77bcf86cd799439013' }, user: { unidade_id: 'unit-ctx' }, session: { user: {} }, unitScope: { unidadeId: 'unit-ctx' } }, {}, deps);
  await compiled.listService({ user: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx', unidadeId: '', placaTermNorm: 'ABC1234' }, deps);

  assert.deepEqual(policyCalls, [
    ['shouldBlockForMissingContext', { currentUser: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx' }],
    ['resolveCanonicalContextUnitId', { currentUser: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx' }],
    ['shouldBlockForMissingContext', { currentUser: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx' }],
    ['ensureRequestedUnitAccess', { currentUser: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx', requestedUnitId: 'unit-ctx' }],
    ['shouldBlockForMissingContext', { currentUser: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx' }],
    ['ensureRequestedUnitAccess', { currentUser: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx', requestedUnitId: 'unit-ctx' }],
    ['shouldBlockForMissingContext', { currentUser: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx' }],
    ['resolveCanonicalContextUnitId', { currentUser: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx' }],
    ['buildListScope', { currentUser: { unidade_id: 'unit-ctx' }, sessionUser: {}, scopedUnitId: 'unit-ctx', requestedUnitId: null }],
  ]);

  const ownersSource = buildDelegatedRecursosOwnersSource();
  assert.doesNotMatch(ownersSource, /function getCanonicalContextUnitId|function shouldBlockForMissingContext|function requestedUnitMatchesContext/);
  assert.doesNotMatch(ownersSource, /const unidadesAcessiveis = await findUnidadesByCondLean\(cond\);|const cond = principalId/);
  assert.doesNotMatch(ownersSource, /placaRegexAntiga|placaRegexMercosul|findOutroRecursoByPlacaUpper|findOutroRecursoByChassiUpper|findOutroRecursoByRenavam/);
  assert.match(ownersSource, /processCreate\(/);
  assert.match(ownersSource, /processUpdate\(/);
  assert.match(ownersSource, /processDelete\(/);
});