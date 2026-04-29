import { resolveGestorAuthContext } from '#modules/gestor/app/services/authContextResolver.js';
import {
  findFuncaoCanonicalByIdData,
  findFuncionarioCanonicalByIdData,
  loadAllModulosBaseData,
} from '#modules/gestor/app/data/auth/userApiModulosCanonicalDataFacade.js';

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function mapMods(mods) {
  return (mods || []).filter(Boolean).map((modulo) => ({
    _id: modulo._id,
    nome: modulo.nome,
    descricao: modulo.descricao,
    status: modulo.status,
    url_base: modulo.url_base,
  }));
}

function intersectById(baseMods, allowedMods) {
  const allowedIds = new Set(
    (allowedMods || [])
      .filter(Boolean)
      .map((modulo) => (modulo?._id ? String(modulo._id) : ''))
      .filter(Boolean)
  );

  return (baseMods || []).filter((modulo) => {
    const id = modulo?._id ? String(modulo._id) : '';
    return id && allowedIds.has(id);
  });
}

function uniqById(mods) {
  const out = [];
  const seen = new Set();
  for (const modulo of mods || []) {
    const id = modulo?._id ? String(modulo._id) : '';
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(modulo);
  }
  return out;
}

function buildDebugPayload({ wantDebug = false, source, authContext = null, unidade = null, funcionario = null, funcao = null } = {}) {
  if (!wantDebug) return null;

  return {
    source,
    authContext: authContext
      ? {
          source: authContext.source,
          globalRole: authContext.globalRole || null,
          effectiveRole: authContext.effectiveRole || null,
          needsUnitSelection: !!authContext.needsUnitSelection,
          membershipCount: Number(authContext.membershipCount || 0),
          activeContext: authContext.activeContext
            ? {
                unidadeId: authContext.activeContext.unidadeId,
                funcionarioId: authContext.activeContext.funcionarioId || null,
                papelContextual: authContext.activeContext.papelContextual || null,
                legacyRole: authContext.activeContext.legacyRole || null,
              }
            : null,
        }
      : null,
    funcionario: funcionario
      ? {
          _id: funcionario._id,
          funcao_id: funcionario.funcao_id,
          unidade_id: funcionario.unidade_id,
        }
      : null,
    funcao: funcao
      ? {
          _id: funcao._id,
          ativa: funcao.ativa !== false,
          modulosCount: (funcao.modulos_habilitados || []).length,
        }
      : null,
    unidade: unidade
      ? {
          _id: unidade._id,
          subunidade: !!unidade.subunidade,
          unidade_principal_id: unidade.unidade_principal_id,
          modulosCount: (unidade.modulosAcessiveis || []).length,
        }
      : null,
  };
}

function buildResolvedPayload({ data = [], wantDebug = false, source, authContext = null, unidade = null, funcionario = null, funcao = null } = {}) {
  const payload = { data };
  const debug = buildDebugPayload({ wantDebug, source, authContext, unidade, funcionario, funcao });
  if (debug) payload.debug = debug;
  return payload;
}

function hasGlobalPrivilegedRole(authenticatedUser, sessionUser) {
  const globalRole = normalizeRole(authenticatedUser?.global_role || sessionUser?.global_role);
  const isMaster = authenticatedUser?.isMaster === true;

  return (
    isMaster
    ||
    globalRole === 'master'
    || globalRole === 'admin'
  );
}

async function resolveClosedCanonicalFallback({ authenticatedUser, sessionUser, loadAllModulos, wantDebug = false, source } = {}) {
  if (hasGlobalPrivilegedRole(authenticatedUser, sessionUser)) {
    try {
      const todos = await loadAllModulos();
      return {
        kind: 'resolved',
        payload: buildResolvedPayload({
          data: todos,
          wantDebug,
          source,
        }),
      };
    } catch (error) {
      console.warn('[gestor][api/modulos] fallback global fechado:', error?.message || error);
    }
  }

  return {
    kind: 'resolved',
    payload: buildResolvedPayload({
      data: [],
      wantDebug,
      source,
    }),
  };
}

export async function resolveUserApiModulosCanonicalResult({
  authenticatedUser = null,
  sessionUser = null,
  existingAuthContext = null,
  featureFlags = null,
  resolverDeps = {},
  maxTimeMS = undefined,
  wantDebug = false,
  deps = {},
} = {}) {
  const resolveAuthContext = deps.resolveAuthContext || resolveGestorAuthContext;
  const tryLoadUnidadeComModulos = deps.tryLoadUnidadeComModulos;
  const loadAllModulos = deps.loadAllModulos || loadAllModulosBaseData;
  const findFuncionarioById = deps.findFuncionarioById || findFuncionarioCanonicalByIdData;
  const findFuncaoById = deps.findFuncaoById || findFuncaoCanonicalByIdData;

  if (typeof tryLoadUnidadeComModulos !== 'function') {
    throw new TypeError('resolveUserApiModulosCanonicalResult requer deps.tryLoadUnidadeComModulos');
  }

  try {
    const authContext = await resolveAuthContext({
      authenticatedUser,
      sessionUser,
      existingAuthContext,
      featureFlags,
      deps: resolverDeps,
      maxTimeMS,
    });

    if (authContext?.source !== 'auth-context-v1') {
      return resolveClosedCanonicalFallback({
        authenticatedUser,
        sessionUser,
        loadAllModulos,
        wantDebug,
        source: 'auth-context-v1-unresolved',
      });
    }

    if (authContext.needsUnitSelection) {
      return { kind: 'selection-required' };
    }

    const effectiveRole = normalizeRole(authContext.effectiveRole);
    const globalRole = normalizeRole(authContext.globalRole);

    if (globalRole === 'master' || globalRole === 'admin' || effectiveRole === 'master' || effectiveRole === 'admin') {
      try {
        const todos = await loadAllModulos();
        const payload = buildResolvedPayload({ data: todos, wantDebug, source: 'auth-context-v1-global', authContext });
        return { kind: 'resolved', payload };
      } catch (error) {
        console.warn('[gestor][api/modulos] fallback master/admin auth-context:', error?.message || error);
        return resolveClosedCanonicalFallback({
          authenticatedUser,
          sessionUser,
          loadAllModulos,
          wantDebug,
          source: 'auth-context-v1-global-error',
        });
      }
    }

    if (effectiveRole === 'diretor') {
      const unidade = await tryLoadUnidadeComModulos(authContext.activeContext?.unidadeId || null);
      const payload = buildResolvedPayload({ data: mapMods(unidade?.modulosAcessiveis || []), wantDebug, source: 'auth-context-v1-gestor', authContext, unidade });
      return { kind: 'resolved', payload };
    }

    if (effectiveRole === 'user') {
      try {
        const activeUnitId = authContext.activeContext?.unidadeId || null;
        const activeFuncionarioId = authContext.activeContext?.funcionarioId || null;

        const unidade = await tryLoadUnidadeComModulos(activeUnitId);
        const modsUnidade = (unidade?.modulosAcessiveis || []).filter(Boolean);

        let funcionario = null;
        if (activeFuncionarioId) {
          funcionario = await findFuncionarioById({ funcionarioId: activeFuncionarioId, unidadeId: activeUnitId });
        }

        let funcao = null;
        let modsFuncao = [];
        const funcionarioUnidadeId = funcionario?.unidade_id ? String(funcionario.unidade_id) : null;
        if (funcionario?.funcao_id && activeUnitId && funcionarioUnidadeId === String(activeUnitId)) {
          funcao = await findFuncaoById({ funcaoId: funcionario.funcao_id, unidadeId: activeUnitId });
          modsFuncao = (funcao?.modulos_habilitados || []).filter(Boolean);
        }

        const intersection = uniqById(intersectById(modsUnidade, modsFuncao));
        const payload = buildResolvedPayload({ data: mapMods(intersection), wantDebug, source: 'auth-context-v1-user', authContext, unidade, funcionario, funcao });
        return { kind: 'resolved', payload };
      } catch (error) {
        console.warn('[gestor][api/modulos] auth-context user:', error?.message || error);
        const payload = buildResolvedPayload({ data: [], wantDebug, source: 'auth-context-v1-user-error', authContext });
        return { kind: 'resolved', payload };
      }
    }

    const payload = buildResolvedPayload({ data: [], wantDebug, source: 'auth-context-v1-empty', authContext });
    return { kind: 'resolved', payload };
  } catch (error) {
    console.warn('[gestor][api/modulos] auth-context fallback:', error?.message || error);
    return resolveClosedCanonicalFallback({
      authenticatedUser,
      sessionUser,
      loadAllModulos,
      wantDebug,
      source: 'auth-context-v1-error',
    });
  }
}

export default resolveUserApiModulosCanonicalResult;