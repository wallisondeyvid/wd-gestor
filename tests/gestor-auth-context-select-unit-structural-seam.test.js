import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/authController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros para: ${signature}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco para: ${signature}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1).replace(/^export\s+/, '');
      }
    }
  }

  throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunction(source, signature);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function createJsonResponseCapture() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

test('selectAuthUnit preserva o owner HTTP e admite uma unidade minima extraivel para a mutacao de unidade no caso de sucesso', async () => {
  const buildRequestIdentity = buildFunction(CONTROLLER_SOURCE, 'function buildRequestIdentity');
  const buildAuthContextResolverOptions = buildFunction(CONTROLLER_SOURCE, 'function buildAuthContextResolverOptions');
  const buildAuthContextHttpPayload = buildFunction(CONTROLLER_SOURCE, 'function buildAuthContextHttpPayload');
  const findMembershipByUnidadeId = buildFunction(CONTROLLER_SOURCE, 'function findMembershipByUnidadeId');
  const persistActiveMembershipInSession = buildFunction(CONTROLLER_SOURCE, 'function persistActiveMembershipInSession');
  const extractCreateAuthContextOrchestrationCore = (() => {
    const signature = 'createAuthContextOrchestrationCore({';
    const start = CONTROLLER_SOURCE.indexOf(signature);
    if (start < 0) return null;
    const openParenIndex = CONTROLLER_SOURCE.lastIndexOf('(', start);
    const braceStart = CONTROLLER_SOURCE.indexOf('{', openParenIndex);
    let depth = 0;
    for (let index = braceStart; index < CONTROLLER_SOURCE.length; index += 1) {
      const char = CONTROLLER_SOURCE[index];
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return CONTROLLER_SOURCE.slice(openParenIndex, index + 1);
        }
      }
    }
    return null;
  })();

  const selectedUnitId = '507f191e810c19729de860eb';
  const firstUnitId = '507f191e810c19729de860ea';
  const userId = '507f1f77bcf86cd799439301';
  const featureFlags = { gestor_auth_context_resolver: true };
  const resolverDeps = { source: 'deps-structural-select-unit' };
  const maxTimeMS = 4321;
  const ownerCalls = [];
  const semanticUnitCalls = [];
  const resolveCalls = [];
  let saveCalls = 0;

  const pendingSelectionContext = {
    authenticated: true,
    source: 'auth-context-v1',
    identity: {
      id: userId,
      email: 'selecionar@gestor.test',
      nome: 'Usuario Selecionar',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 2,
    memberships: [
      {
        membershipId: '507f1f77bcf86cd799439302',
        unidadeId: firstUnitId,
        unidadePrincipalId: '507f191e810c19729de860ff',
        unidadeNome: 'Filial Norte',
        unidadeCodigo: 'FN01',
        papelContextual: 'gestor',
        legacyRole: 'diretor',
        funcionarioId: 'func-302',
      },
      {
        membershipId: '507f1f77bcf86cd799439303',
        unidadeId: selectedUnitId,
        unidadePrincipalId: selectedUnitId,
        unidadeNome: 'Base Sul',
        unidadeCodigo: 'BS02',
        papelContextual: 'user',
        legacyRole: 'user',
        funcionarioId: 'func-303',
      },
    ],
    needsUnitSelection: true,
    activeContext: null,
    effectiveRole: null,
  };

  const resolvedContext = {
    authenticated: true,
    source: 'auth-context-v1',
    identity: {
      id: userId,
      email: 'selecionar@gestor.test',
      nome: 'Usuario Selecionar',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 2,
    memberships: pendingSelectionContext.memberships,
    needsUnitSelection: false,
    activeContext: {
      membershipId: '507f1f77bcf86cd799439303',
      unidadeId: selectedUnitId,
      unidadePrincipalId: selectedUnitId,
      papelContextual: 'user',
      funcionarioId: 'func-303',
      legacyRole: 'user',
    },
    effectiveRole: 'user',
  };

  const resolveGestorAuthContext = async (input) => {
    resolveCalls.push(input);
    if (resolveCalls.length === 1) {
      return pendingSelectionContext;
    }
    return resolvedContext;
  };

  const mutationSemanticUnit = async ({
    authenticated,
    unidadeId,
    session,
    resolverOptions,
    requirePendingSelection,
    deps,
  }) => {
    semanticUnitCalls.push({
      authenticated,
      unidadeId,
      session,
      resolverOptions,
      requirePendingSelection,
      deps,
    });

    if (!authenticated) {
      return { kind: 'unauthorized', authContext: null };
    }

    const authContext = await deps.resolveAuthContext(resolverOptions);
    if (authContext.source !== 'auth-context-v1') {
      return { kind: 'resolver-disabled', authContext };
    }

    if (requirePendingSelection && !authContext.needsUnitSelection) {
      return { kind: 'selection-not-required', authContext };
    }

    const selectedMembership = deps.findMembershipByUnidadeId(authContext, unidadeId);
    if (!selectedMembership) {
      return { kind: 'unit-not-allowed', authContext };
    }

    deps.persistActiveMembershipInSession(session, selectedMembership);
    await deps.saveSession(session);

    const resolvedAfterMutation = await deps.resolveAuthContext({
      ...resolverOptions,
      existingAuthContext: session.gestorAuthContext || null,
    });

    return { kind: 'success', authContext: resolvedAfterMutation };
  };

  const authContextOrchestration = {
    async mutateActiveUnitContext(input) {
      return mutationSemanticUnit({
        authenticated: input.authenticated,
        unidadeId: input.unidadeId,
        session: input.session,
        resolverOptions: input.resolverOptions,
        requirePendingSelection: input.requirePendingSelection === true,
        deps: {
          resolveAuthContext: resolveGestorAuthContext,
          findMembershipByUnidadeId,
          persistActiveMembershipInSession: (session, selectedMembership) => {
            const reqLike = { session };
            persistActiveMembershipInSession(reqLike, selectedMembership);
          },
          saveSession: async (session) => {
            saveCalls += 1;
            if (typeof session?.save === 'function') {
              await new Promise((resolve) => session.save(() => resolve()));
            }
          },
        },
      });
    },
  };

  const selectAuthUnit = buildFunction(CONTROLLER_SOURCE, 'export async function selectAuthUnit', {
    mutateAuthUnitContext: async (req, options) => {
      ownerCalls.push({ req, options });

      const semanticResult = await authContextOrchestration.mutateActiveUnitContext({
        authenticated: buildRequestIdentity(req).authenticated,
        unidadeId: String(req.body?.unidade_id || '').trim(),
        session: req.session,
        resolverOptions: buildAuthContextResolverOptions(req),
        requirePendingSelection: options.requirePendingSelection === true,
        mutationDeps: {
          resolveAuthContext: resolveGestorAuthContext,
          findMembershipByUnidadeId,
          persistActiveMembershipInSession: (session, selectedMembership) => {
            const reqLike = { session };
            persistActiveMembershipInSession(reqLike, selectedMembership);
          },
          saveSession: async (session) => {
            saveCalls += 1;
            if (typeof session?.save === 'function') {
              await new Promise((resolve) => session.save(() => resolve()));
            }
          },
        },
      });

      assert.equal(semanticResult.kind, 'success');

      return {
        status: 200,
        body: {
          ok: true,
          ...buildAuthContextHttpPayload(semanticResult.authContext),
        },
      };
    },
    buildAuthContextMutationErrorPayload: (code) => ({ ok: false, code }),
    console,
  });

  const session = {
    user: {
      id: userId,
      email: 'selecionar@gestor.test',
      nome: 'Usuario Selecionar',
    },
    save(callback) {
      if (typeof callback === 'function') callback();
    },
  };

  const req = {
    body: { unidade_id: selectedUnitId },
    session,
    app: {
      locals: {
        gestorAuthContextFeatureFlags: featureFlags,
        gestorAuthContextResolverDeps: resolverDeps,
        gestorAuthContextMaxTimeMS: maxTimeMS,
      },
    },
  };
  const res = createJsonResponseCapture();

  await selectAuthUnit(req, res);

  assert.equal(ownerCalls.length, 1);
  assert.equal(ownerCalls[0].options.requirePendingSelection, true);
  assert.equal(ownerCalls[0].options.disabledCode, 'GESTOR_AUTH_CONTEXT_SELECTION_DISABLED');
  assert.equal(ownerCalls[0].options.notRequiredCode, 'GESTOR_SELECTION_NOT_REQUIRED');

  assert.equal(semanticUnitCalls.length, 1);
  assert.equal(semanticUnitCalls[0].authenticated, true);
  assert.equal(semanticUnitCalls[0].unidadeId, selectedUnitId);
  assert.equal(semanticUnitCalls[0].session, session);
  assert.equal(semanticUnitCalls[0].requirePendingSelection, true);
  assert.deepEqual(Object.keys(semanticUnitCalls[0].deps).sort(), [
    'findMembershipByUnidadeId',
    'persistActiveMembershipInSession',
    'resolveAuthContext',
    'saveSession',
  ]);
  assert.equal(semanticUnitCalls[0].resolverOptions.authenticatedUser, null);
  assert.equal(semanticUnitCalls[0].resolverOptions.sessionUser, session.user);
  assert.equal(semanticUnitCalls[0].resolverOptions.existingAuthContext, null);
  assert.equal(semanticUnitCalls[0].resolverOptions.featureFlags, featureFlags);
  assert.equal(semanticUnitCalls[0].resolverOptions.deps, resolverDeps);
  assert.equal(semanticUnitCalls[0].resolverOptions.maxTimeMS, maxTimeMS);

  assert.equal(resolveCalls.length, 2);
  assert.equal(saveCalls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(session.gestorAuthContext)), {
    active_membership_id: '507f1f77bcf86cd799439303',
    active_unidade_id: selectedUnitId,
    active_unidade_principal_id: selectedUnitId,
    active_papel_contextual: 'user',
    active_funcionario_id: 'func-303',
    legacy_role: 'user',
    needs_selection: false,
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    authenticated: true,
    source: 'auth-context-v1',
    identity: {
      id: userId,
      email: 'selecionar@gestor.test',
      nome: 'Usuario Selecionar',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 2,
    memberships: [
      {
        membershipId: '507f1f77bcf86cd799439302',
        unidadeId: firstUnitId,
        unidadePrincipalId: '507f191e810c19729de860ff',
        unidadeNome: 'Filial Norte',
        unidadeCodigo: 'FN01',
        papelContextual: 'gestor',
        legacyRole: 'diretor',
      },
      {
        membershipId: '507f1f77bcf86cd799439303',
        unidadeId: selectedUnitId,
        unidadePrincipalId: selectedUnitId,
        unidadeNome: 'Base Sul',
        unidadeCodigo: 'BS02',
        papelContextual: 'user',
        legacyRole: 'user',
      },
    ],
    needsUnitSelection: false,
    activeContext: {
      membershipId: '507f1f77bcf86cd799439303',
      unidadeId: selectedUnitId,
      unidadePrincipalId: selectedUnitId,
      papelContextual: 'user',
      funcionarioId: 'func-303',
      legacyRole: 'user',
    },
    effectiveRole: 'user',
  });
});