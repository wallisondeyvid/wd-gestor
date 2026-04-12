function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shouldRedirectToFirstAccess({ user, isMasterRole }) {
  const needsPasswordChange = user?.senha_provisoria === true || user?.primeiro_acesso === true || user?.primeiro_acesso === undefined;
  const enforceMaster = String(process.env.ENFORCE_MASTER_FIRST_LOGIN || '').toLowerCase() === 'true';
  return needsPasswordChange && (!isMasterRole || (isMasterRole && enforceMaster));
}

function buildModuloLookupOr({ moduloAlvo, basePath }) {
  const nomeRx = new RegExp('^' + escapeRegex(moduloAlvo) + '$', 'i');
  const or = [{ nome: nomeRx }];
  if (basePath) or.push({ url_base: basePath });
  if (moduloAlvo && !String(moduloAlvo).startsWith('/')) {
    or.push({ url_base: '/' + String(moduloAlvo).trim() });
  }
  if (String(moduloAlvo).toLowerCase() === 'portal_morador') {
    or.push({ nome: /^portal-morador$/i });
    or.push({ url_base: '/portal-morador' });
  }

  const alvoLower = String(moduloAlvo || '').trim().toLowerCase();
  if (alvoLower === 'condominios' || alvoLower === 'condominio') {
    or.push({ nome: /^condom[ií]nios$/i });
    or.push({ nome: /^gest[aã]o de condom[ií]nios$/i });
    or.push({ nome: /^m[oó]dulo condom[ií]nios$/i });
  }

  return or;
}

async function resolvePlannedModuleOutcome({ moduloAlvo, basePath, isMasterRole, deps, logger }) {
  if (isMasterRole || typeof deps?.findModuloLeanByOrSelect !== 'function') {
    return null;
  }

  try {
    const modulo = await deps.findModuloLeanByOrSelect({
      or: buildModuloLookupOr({ moduloAlvo, basePath }),
      select: 'nome status url_base',
      maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000),
    });

    if (!modulo || String(modulo.status || '').toLowerCase() !== 'planejado') {
      return null;
    }

    return {
      kind: 'render',
      statusCode: 200,
      view: 'partials/construcao',
      payload: {
        moduleName: (modulo.nome || moduloAlvo).toUpperCase(),
        basePath: modulo.url_base || basePath,
      },
      saveSession: false,
    };
  } catch (error) {
    logger?.warn?.('[login] falha checando status planejado:', error.message);
    return null;
  }
}

export async function resolveLoginSuccessOutcome({
  user,
  isMasterRole = false,
  moduloAlvo,
  basePath,
  moduleAccessResult = undefined,
  deps = {},
  logger = console,
} = {}) {
  if (shouldRedirectToFirstAccess({ user, isMasterRole })) {
    return {
      kind: 'redirect',
      location: basePath + '/primeiroacesso',
      saveSession: true,
    };
  }

  if (moduleAccessResult == null) {
    return { kind: 'continue' };
  }

  if (!moduleAccessResult.permitido) {
    const motivo = encodeURIComponent(moduleAccessResult.motivo || 'acesso_negado');
    return {
      kind: 'redirect',
      location: `${basePath}/login?erro=modulo&motivo=${motivo}`,
      saveSession: false,
    };
  }

  const plannedModuleOutcome = await resolvePlannedModuleOutcome({
    moduloAlvo,
    basePath,
    isMasterRole,
    deps,
    logger,
  });
  if (plannedModuleOutcome) {
    return plannedModuleOutcome;
  }

  return {
    kind: 'redirect',
    location: basePath + '/dashboard',
    saveSession: true,
  };
}

export default resolveLoginSuccessOutcome;