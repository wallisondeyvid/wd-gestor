import { resolveGestorAuthContext } from '#modules/gestor/app/services/authContextResolver.js';

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

async function defaultLoadAllModulos() {
  const Modulo = (await import('#models/modulo.js')).default;
  return Modulo.find({}).select('_id nome descricao status url_base').lean();
}

async function defaultFindFuncionarioById(funcionarioId) {
  const Funcionario = (await import('#models/Funcionario.js')).default;
  return Funcionario.findById(funcionarioId)
    .select('_id funcao_id unidade_id usuario_id cpf email')
    .lean();
}

async function defaultFindFuncaoById(funcaoId) {
  const Funcao = (await import('#models/funcao.js')).default;
  return Funcao.findById(funcaoId)
    .populate('modulos_habilitados')
    .lean();
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
  const loadAllModulos = deps.loadAllModulos || defaultLoadAllModulos;
  const findFuncionarioById = deps.findFuncionarioById || defaultFindFuncionarioById;
  const findFuncaoById = deps.findFuncaoById || defaultFindFuncaoById;

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
      return { kind: 'not-applicable' };
    }

    if (authContext.needsUnitSelection) {
      return { kind: 'selection-required' };
    }

    const effectiveRole = normalizeRole(authContext.effectiveRole);
    const globalRole = normalizeRole(authContext.globalRole);

    if (globalRole === 'master' || globalRole === 'admin' || effectiveRole === 'master' || effectiveRole === 'admin') {
      try {
        const todos = await loadAllModulos();
        const payload = { data: todos };
        const debug = buildDebugPayload({ wantDebug, source: 'auth-context-v1-global', authContext });
        if (debug) payload.debug = debug;
        return { kind: 'resolved', payload };
      } catch (error) {
        console.warn('[gestor][api/modulos] fallback master/admin auth-context:', error?.message || error);
        return { kind: 'not-applicable' };
      }
    }

    if (effectiveRole === 'diretor') {
      const unidade = await tryLoadUnidadeComModulos(authContext.activeContext?.unidadeId || null);
      const payload = { data: mapMods(unidade?.modulosAcessiveis || []) };
      const debug = buildDebugPayload({ wantDebug, source: 'auth-context-v1-gestor', authContext, unidade });
      if (debug) payload.debug = debug;
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
          funcionario = await findFuncionarioById(activeFuncionarioId);
        }

        let funcao = null;
        let modsFuncao = [];
        const funcionarioUnidadeId = funcionario?.unidade_id ? String(funcionario.unidade_id) : null;
        if (funcionario?.funcao_id && activeUnitId && funcionarioUnidadeId === String(activeUnitId)) {
          funcao = await findFuncaoById(funcionario.funcao_id);
          modsFuncao = (funcao?.modulos_habilitados || []).filter(Boolean);
        }

        const intersection = uniqById(intersectById(modsUnidade, modsFuncao));
        const payload = { data: mapMods(intersection) };
        const debug = buildDebugPayload({ wantDebug, source: 'auth-context-v1-user', authContext, unidade, funcionario, funcao });
        if (debug) payload.debug = debug;
        return { kind: 'resolved', payload };
      } catch (error) {
        console.warn('[gestor][api/modulos] auth-context user:', error?.message || error);
        const payload = { data: [] };
        const debug = buildDebugPayload({ wantDebug, source: 'auth-context-v1-user-error', authContext });
        if (debug) payload.debug = debug;
        return { kind: 'resolved', payload };
      }
    }

    const payload = { data: [] };
    const debug = buildDebugPayload({ wantDebug, source: 'auth-context-v1-empty', authContext });
    if (debug) payload.debug = debug;
    return { kind: 'resolved', payload };
  } catch (error) {
    console.warn('[gestor][api/modulos] auth-context fallback:', error?.message || error);
    return { kind: 'not-applicable' };
  }
}

export default resolveUserApiModulosCanonicalResult;