import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/unidadeApiController.js');
const SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function buildFunctionFromSource(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildPolicyContextCoreSource() {
  return `function createUnidadePolicyContextCore({ req } = {}) {
    async function loadScopedUnitAccessContext() {
      const scopedUnitId = getScopedUnitId(req);
      if (!scopedUnitId) {
        return {
          scopedUnitId: '',
          scopedUnit: null,
          principalUnitId: '',
        };
      }

      const [scopedUnit, scopedUnitBase] = await Promise.all([
        findUnidadeByIdLean(scopedUnitId),
        findUnidadeUserBaseLean(scopedUnitId),
      ]);

      const principalUnitId = normalizeUnitId(
        scopedUnitBase?.is_principal
          ? scopedUnitBase?._id
          : scopedUnitBase?.unidade_principal_id || scopedUnitBase?.matriz_id || scopedUnitId,
      );

      return {
        scopedUnitId,
        scopedUnit,
        principalUnitId,
      };
    }

    async function loadScopedAccessibleUnidades() {
      const scopedContext = await loadScopedUnitAccessContext();
      if (!scopedContext.scopedUnitId) {
        return {
          ...scopedContext,
          unidades: [],
        };
      }

      let unidades = scopedContext.principalUnitId
        ? await findUnidadesByCondLeanFull({
            $or: [
              { _id: scopedContext.principalUnitId },
              { unidade_principal_id: scopedContext.principalUnitId },
              { matriz_id: scopedContext.principalUnitId },
            ],
          })
        : [];

      if ((!unidades || unidades.length === 0) && scopedContext.scopedUnit) {
        unidades = [scopedContext.scopedUnit];
      }

      return {
        ...scopedContext,
        unidades,
      };
    }

    async function resolveRequestedPrincipalUnitId(requestedPrincipalUnitId = '', fallbackPrincipalUnitId = '') {
      const scopedContext = await loadScopedUnitAccessContext();
      const requestedPrincipalId = normalizeUnitId(requestedPrincipalUnitId);
      const fallbackPrincipalId = normalizeUnitId(fallbackPrincipalUnitId);
      const scopedPrincipalId = normalizeUnitId(scopedContext.principalUnitId);

      if (requestedPrincipalId && scopedPrincipalId && requestedPrincipalId !== scopedPrincipalId) {
        return { ok: false, principalUnitId: '', scopedContext };
      }

      if (scopedPrincipalId) {
        return {
          ok: true,
          principalUnitId: scopedPrincipalId,
          scopedContext,
        };
      }

      if (!isPrivilegedGestorUser(req?.user)) {
        return {
          ok: false,
          principalUnitId: '',
          scopedContext,
        };
      }

      return {
        ok: true,
        principalUnitId: requestedPrincipalId || fallbackPrincipalId,
        scopedContext,
      };
    }

    async function ensureCanAccessUnidade(unidadeId) {
      const scopedContext = await loadScopedAccessibleUnidades();
      if (scopedContext.scopedUnitId) {
        const permitidoIds = new Set((scopedContext.unidades || []).map((u) => normalizeUnitId(u?._id)).filter(Boolean));
        if (permitidoIds.size > 0) {
          return permitidoIds.has(normalizeUnitId(unidadeId));
        }

        return normalizeUnitId(unidadeId) === scopedContext.scopedUnitId;
      }

      if (isPrivilegedGestorUser(req?.user)) return true;

      return false;
    }

    return {
      loadScopedUnitAccessContext,
      loadScopedAccessibleUnidades,
      resolveRequestedPrincipalUnitId,
      ensureCanAccessUnidade,
    };
  }`;
}

function buildDelegatedOwnersSource() {
  return `({
    async createUnidadeOwner(req, deps) {
      const policy = createUnidadePolicyContextCore({ req });
      const resolvedPrincipal = await policy.resolveRequestedPrincipalUnitId(req.body.unidadePrincipal);
      if (!resolvedPrincipal.ok) return deps.badRequest('Acesso à unidade não autorizado.');
      if (resolvedPrincipal.principalUnitId) {
        const canAccessPrincipal = await policy.ensureCanAccessUnidade(resolvedPrincipal.principalUnitId);
        if (!canAccessPrincipal) return deps.badRequest('Acesso à unidade não autorizado.');
      }
      return deps.created('ok');
    },

    async updateUnidadeOwner(req, deps) {
      const policy = createUnidadePolicyContextCore({ req });
      const canAccessCurrent = await policy.ensureCanAccessUnidade(req.params.id);
      if (!canAccessCurrent) return deps.badRequest('Acesso à unidade não autorizado.');
      const resolvedPrincipal = await policy.resolveRequestedPrincipalUnitId(req.body.unidadePrincipal, req.body.fallbackPrincipalUnitId);
      if (!resolvedPrincipal.ok) return deps.badRequest('Acesso à unidade não autorizado.');
      return deps.ok('updated');
    },

    async toggleAccessOwner(req, deps) {
      const policy = createUnidadePolicyContextCore({ req });
      return deps.executeToggleAccessCore({
        unitIds: req.body.unitIds,
        activate: req.body.activate,
        role: req.user.role,
        canAccessUnitId: (unitId) => policy.ensureCanAccessUnidade(unitId),
      });
    },

    async statusOwner(req, deps) {
      const policy = createUnidadePolicyContextCore({ req });
      return deps.getUnidadeProvisioningStatusOwnerService({
        unidadeId: req.params.id,
        canAccessUnidade: (candidateUnidadeId) => policy.ensureCanAccessUnidade(candidateUnidadeId),
      });
    },

    async retryOwner(req, deps) {
      const policy = createUnidadePolicyContextCore({ req });
      const canAccess = await policy.ensureCanAccessUnidade(req.params.id);
      if (!canAccess) return deps.badRequest('Acesso à unidade não autorizado');
      return deps.retryUnitProvisioning({ unidadeId: req.params.id });
    },

    async deleteOwner(req, deps) {
      const policy = createUnidadePolicyContextCore({ req });
      const canAccess = await policy.ensureCanAccessUnidade(req.params.id);
      if (!canAccess) return deps.badRequest('Acesso à unidade não autorizado.');
      return deps.deleteUnidadeExecutionService({ unidadeId: req.params.id });
    },
  })`;
}

test('estado real atual: o controller delega o policy layer contextual para a seam unica', () => {
  assert.match(SOURCE, /function createUnidadePolicyContextCore\(\{ req \} = \{\}\)/);
  assert.match(SOURCE, /async function loadScopedUnitAccessContext\(\)/);
  assert.match(SOURCE, /async function loadScopedAccessibleUnidades\(\)/);
  assert.match(SOURCE, /async function resolveRequestedPrincipalUnitId\(requestedPrincipalUnitId = '', fallbackPrincipalUnitId = ''\)/);
  assert.match(SOURCE, /async function ensureCanAccessUnidade\(unidadeId\)/);

  assert.match(SOURCE, /const policyContext = createUnidadePolicyContextCore\(\{ req \}\);/);
  assert.match(SOURCE, /const resolvedPrincipal = await policyContext\.resolveRequestedPrincipalUnitId\(unidadePrincipal\);/);
  assert.match(SOURCE, /const resolvedPrincipal = await policyContext\.resolveRequestedPrincipalUnitId\([\s\S]*unidadePrincipal,[\s\S]*subunidade === 'true' \? unidadeExistente\.unidade_principal_id : '',[\s\S]*\);/);
  assert.match(SOURCE, /canAccessUnitId: \(unitId\) => policyContext\.ensureCanAccessUnidade\(unitId\),/);
  assert.match(SOURCE, /canAccessUnidade: \(candidateUnidadeId\) => policyContext\.ensureCanAccessUnidade\(candidateUnidadeId\),/);
  assert.match(SOURCE, /const canAccess = await policyContext\.ensureCanAccessUnidade\(unidade\._id\);/);

  assert.doesNotMatch(SOURCE, /async function loadScopedUnitAccessContext\(req\)/);
  assert.doesNotMatch(SOURCE, /async function loadScopedAccessibleUnidades\(req\)/);
  assert.doesNotMatch(SOURCE, /async function resolveRequestedPrincipalUnitId\(req,/);
  assert.doesNotMatch(SOURCE, /async function ensureCanAccessUnidade\(req,/);
  assert.doesNotMatch(SOURCE, /resolveRequestedPrincipalUnitId\(req,/);
  assert.doesNotMatch(SOURCE, /ensureCanAccessUnidade\(req,/);
});

test('futura seam unica recebe apenas req e concentra as quatro operacoes de policy/contexto', async () => {
  const createUnidadePolicyContextCore = buildFunctionFromSource(buildPolicyContextCoreSource(), {
    normalizeUnitId: (value) => String(value || '').trim(),
    getScopedUnitId: (req) => String(req?.unitScope?.unidadeId || '').trim(),
    isPrivilegedGestorUser: (user) => user?.role === 'admin' || user?.isMaster === true,
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Scoped' }),
    findUnidadeUserBaseLean: async (id) => ({ _id: id, is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-principal' }, { _id: 'u-filial' }]),
    Promise,
    Set,
  });

  const policy = createUnidadePolicyContextCore({
    req: {
      unitScope: { unidadeId: 'u-principal' },
      user: { role: 'diretor' },
    },
  });

  assert.deepEqual(Object.keys(policy).sort(), [
    'ensureCanAccessUnidade',
    'loadScopedAccessibleUnidades',
    'loadScopedUnitAccessContext',
    'resolveRequestedPrincipalUnitId',
  ]);

  const scopedContext = await policy.loadScopedUnitAccessContext();
  const accessibleContext = await policy.loadScopedAccessibleUnidades();
  const principalResolution = await policy.resolveRequestedPrincipalUnitId('u-principal');
  const canAccessFilial = await policy.ensureCanAccessUnidade('u-filial');
  const cannotAccessOtherPrincipal = await policy.resolveRequestedPrincipalUnitId('u-outra-principal');

  assert.deepEqual(toPlain(scopedContext), {
    scopedUnitId: 'u-principal',
    scopedUnit: { _id: 'u-principal', nome: 'Scoped' },
    principalUnitId: 'u-principal',
  });
  assert.deepEqual(toPlain(accessibleContext), {
    scopedUnitId: 'u-principal',
    scopedUnit: { _id: 'u-principal', nome: 'Scoped' },
    principalUnitId: 'u-principal',
    unidades: [{ _id: 'u-principal' }, { _id: 'u-filial' }],
  });
  assert.deepEqual(toPlain(principalResolution), {
    ok: true,
    principalUnitId: 'u-principal',
    scopedContext: {
      scopedUnitId: 'u-principal',
      scopedUnit: { _id: 'u-principal', nome: 'Scoped' },
      principalUnitId: 'u-principal',
    },
  });
  assert.equal(canAccessFilial, true);
  assert.deepEqual(toPlain(cannotAccessOtherPrincipal), {
    ok: false,
    principalUnitId: '',
    scopedContext: {
      scopedUnitId: 'u-principal',
      scopedUnit: { _id: 'u-principal', nome: 'Scoped' },
      principalUnitId: 'u-principal',
    },
  });
});

test('futura seam unica bloqueia fallback tardio para nao privilegiado sem principal canonica e preserva fallback privilegiado sem escopo', async () => {
  const createUnidadePolicyContextCore = buildFunctionFromSource(buildPolicyContextCoreSource(), {
    normalizeUnitId: (value) => String(value || '').trim(),
    getScopedUnitId: (req) => String(req?.unitScope?.unidadeId || '').trim(),
    isPrivilegedGestorUser: (user) => user?.role === 'admin' || user?.isMaster === true,
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Scoped' }),
    findUnidadeUserBaseLean: async () => null,
    findUnidadesByCondLeanFull: async () => ([]),
    Promise,
    Set,
  });

  const nonPrivilegedPolicy = createUnidadePolicyContextCore({
    req: {
      unitScope: null,
      user: { role: 'diretor' },
    },
  });

  const blockedFallback = await nonPrivilegedPolicy.resolveRequestedPrincipalUnitId('u-principal-externa', 'u-fallback');

  assert.deepEqual(toPlain(blockedFallback), {
    ok: false,
    principalUnitId: '',
    scopedContext: {
      scopedUnitId: '',
      scopedUnit: null,
      principalUnitId: '',
    },
  });

  const privilegedPolicy = createUnidadePolicyContextCore({
    req: {
      unitScope: null,
      user: { role: 'admin' },
    },
  });

  const privilegedRequested = await privilegedPolicy.resolveRequestedPrincipalUnitId('u-principal-admin', 'u-fallback-admin');
  const privilegedFallback = await privilegedPolicy.resolveRequestedPrincipalUnitId('', 'u-fallback-admin');

  assert.deepEqual(toPlain(privilegedRequested), {
    ok: true,
    principalUnitId: 'u-principal-admin',
    scopedContext: {
      scopedUnitId: '',
      scopedUnit: null,
      principalUnitId: '',
    },
  });
  assert.deepEqual(toPlain(privilegedFallback), {
    ok: true,
    principalUnitId: 'u-fallback-admin',
    scopedContext: {
      scopedUnitId: '',
      scopedUnit: null,
      principalUnitId: '',
    },
  });
});

test('owners futuros permanecem HTTP e delegam a seam unica em vez de depender dos helpers inline', async () => {
  const ownerCalls = [];
  const policyCalls = [];

  const owners = buildFunctionFromSource(buildDelegatedOwnersSource(), {
    createUnidadePolicyContextCore: ({ req }) => {
      ownerCalls.push(['createUnidadePolicyContextCore', req.params?.id || req.body?.unidadePrincipal || 'req']);
      return {
        resolveRequestedPrincipalUnitId: async (...args) => {
          policyCalls.push(['resolveRequestedPrincipalUnitId', ...args]);
          return { ok: true, principalUnitId: args[0] || args[1] || '' };
        },
        ensureCanAccessUnidade: async (unitId) => {
          policyCalls.push(['ensureCanAccessUnidade', unitId]);
          return true;
        },
      };
    },
  });

  const deps = {
    badRequest: (message) => ({ kind: 'bad_request', message }),
    created: (value) => ({ kind: 'created', value }),
    ok: (value) => ({ kind: 'ok', value }),
    executeToggleAccessCore: async (payload) => ({ kind: 'toggle', payload }),
    getUnidadeProvisioningStatusOwnerService: async (payload) => ({ kind: 'status', payload }),
    retryUnitProvisioning: async (payload) => ({ kind: 'retry', payload }),
    deleteUnidadeExecutionService: async (payload) => ({ kind: 'delete', payload }),
  };

  await owners.createUnidadeOwner({ body: { unidadePrincipal: 'u-principal' } }, deps);
  await owners.updateUnidadeOwner({ params: { id: 'u-1' }, body: { unidadePrincipal: 'u-principal', fallbackPrincipalUnitId: 'u-fallback' } }, deps);
  await owners.toggleAccessOwner({ user: { role: 'admin' }, body: { unitIds: ['u-1'], activate: true } }, deps);
  await owners.statusOwner({ params: { id: 'u-1' } }, deps);
  await owners.retryOwner({ params: { id: 'u-1' } }, deps);
  await owners.deleteOwner({ params: { id: 'u-1' } }, deps);

  assert.deepEqual(policyCalls, [
    ['resolveRequestedPrincipalUnitId', 'u-principal'],
    ['ensureCanAccessUnidade', 'u-principal'],
    ['ensureCanAccessUnidade', 'u-1'],
    ['resolveRequestedPrincipalUnitId', 'u-principal', 'u-fallback'],
    ['ensureCanAccessUnidade', 'u-1'],
    ['ensureCanAccessUnidade', 'u-1'],
  ]);

  const delegatedOwnersSource = buildDelegatedOwnersSource();
  assert.match(delegatedOwnersSource, /createUnidadePolicyContextCore\(\{ req \}\)/);
  assert.match(delegatedOwnersSource, /badRequest/);
  assert.match(delegatedOwnersSource, /created/);
  assert.match(delegatedOwnersSource, /ok/);
  assert.match(delegatedOwnersSource, /executeToggleAccessCore/);
  assert.match(delegatedOwnersSource, /getUnidadeProvisioningStatusOwnerService/);
  assert.match(delegatedOwnersSource, /retryUnitProvisioning/);
  assert.match(delegatedOwnersSource, /deleteUnidadeExecutionService/);
  assert.doesNotMatch(delegatedOwnersSource, /async function loadScopedUnitAccessContext/);
  assert.doesNotMatch(delegatedOwnersSource, /async function loadScopedAccessibleUnidades/);
  assert.doesNotMatch(delegatedOwnersSource, /async function resolveRequestedPrincipalUnitId/);
  assert.doesNotMatch(delegatedOwnersSource, /async function ensureCanAccessUnidade/);
});