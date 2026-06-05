import {
  findAllUnidades,
  findAllModulosLean,
  findModulosAtivosStatusLean,
  findUnidadesPrincipaisLean,
} from '#modules/gestor/app/data/unidades/unidadesPageBundleDataFacade.js';
import { loadPaginaUnidadesDiretores } from '#modules/gestor/app/services/unidades/loadPaginaUnidadesDiretores.service.js';

export async function loadPaginaUnidadesBundle({
  req,
  isMaster,
  privilegedUser,
  loadScopedUnidadesClusterForPage,
}) {
  const scopedContext = await loadScopedUnidadesClusterForPage(req);

  function sanitizeApiBancariaForRead(apiBancaria) {
    if (!apiBancaria || typeof apiBancaria !== 'object') return {};
    const plain = apiBancaria?.toObject ? apiBancaria.toObject() : { ...apiBancaria };
    const safe = {};

    if (plain.tipoAutenticacaoAPI) safe.tipoAutenticacaoAPI = plain.tipoAutenticacaoAPI;
    if (plain.apiHeaderName) safe.apiHeaderName = plain.apiHeaderName;
    if (plain.apiQueryParamName) safe.apiQueryParamName = plain.apiQueryParamName;
    if (plain.apiBasicUser) safe.apiBasicUser = plain.apiBasicUser;
    if (plain.apiOauthClientId) safe.apiOauthClientId = plain.apiOauthClientId;
    if (plain.apiOauthScope) safe.apiOauthScope = plain.apiOauthScope;
    if (plain.apiOauthTokenUrl) safe.apiOauthTokenUrl = plain.apiOauthTokenUrl;
    if (plain.apiBaseUrl) safe.apiBaseUrl = plain.apiBaseUrl;
    if (plain.apiTokenUrlGenerica) safe.apiTokenUrlGenerica = plain.apiTokenUrlGenerica;
    if (plain.apiMtlsCertFileName) safe.apiMtlsCertFileName = plain.apiMtlsCertFileName;

    safe.hasApiHeaderValue = Boolean(plain.apiHeaderValue);
    safe.hasApiQueryParamValue = Boolean(plain.apiQueryParamValue);
    safe.hasApiBasicPassword = Boolean(plain.apiBasicPassword);
    safe.hasApiOauthClientSecret = Boolean(plain.apiOauthClientSecret);
    safe.hasApiMtlsPassword = Boolean(plain.apiMtlsPassword);
    safe.hasApiMtlsCertFile = Boolean(plain.apiMtlsCertFileData || plain.apiMtlsCertFileName);
    return safe;
  }

  function sanitizeUnidadeForRead(u) {
    const plain = u?.toObject ? u.toObject() : { ...u };
    return {
      ...plain,
      naturezaJuridica: plain.naturezaJuridica || '',
      modulosAcessiveis: Array.isArray(plain.modulosAcessiveis) ? plain.modulosAcessiveis : [],
      apiBancaria: sanitizeApiBancariaForRead(plain.apiBancaria),
    };
  }

  async function loadPrivilegedPaginaUnidadesBranch() {
    console.log('[DEBUG SERVER] Carregando todas unidades para usuário privilegiado');
    let privilegedUnidadesFiltradas = await findAllUnidades();
    console.log('[DEBUG SERVER] Unidades encontradas:', privilegedUnidadesFiltradas.length);

    try {
      privilegedUnidadesFiltradas = privilegedUnidadesFiltradas.map((u) => sanitizeUnidadeForRead(u));
    } catch (mapErr) {
      console.error('[DEBUG paginaUnidades] Erro no map:', mapErr);
      privilegedUnidadesFiltradas = [];
    }

    let principalUnits = privilegedUnidadesFiltradas.filter((u) => u.is_principal);
    if (principalUnits.length === 0 && scopedContext.principalUnit) principalUnits = [scopedContext.principalUnit];
    if (principalUnits.length === 0 && scopedContext.scopedUnit) principalUnits = [scopedContext.scopedUnit];

    const modulos = (isMaster || req.user.role === 'admin')
      ? await findAllModulosLean()
      : await findModulosAtivosStatusLean();

    if ((!privilegedUnidadesFiltradas || privilegedUnidadesFiltradas.length === 0) && isMaster) {
      console.warn('[paginaUnidades] ALERTA: master sem unidades visíveis — verificando fallback matrizes');
      try {
        const matrizes = await findUnidadesPrincipaisLean();
        if (matrizes?.length) privilegedUnidadesFiltradas = matrizes.map((u) => sanitizeUnidadeForRead(u));
      } catch (_e) {}
    }

    return {
      unidadesFiltradas: privilegedUnidadesFiltradas,
      principalUnits,
      modulos,
    };
  }

  let unidadesFiltradas;
  let principalUnits;
  let modulos;

  if (scopedContext.scopedUnitId) {
    unidadesFiltradas = scopedContext.unidadesFiltradas;
    console.log('[paginaUnidades] Unidades filtradas via unitScope:', unidadesFiltradas.length);

    try {
      unidadesFiltradas = unidadesFiltradas.map((u) => sanitizeUnidadeForRead(u));
    } catch (mapErr) {
      console.error('[DEBUG paginaUnidades] Erro no map:', mapErr);
      unidadesFiltradas = [];
    }

    principalUnits = unidadesFiltradas.filter((u) => u.is_principal);
    if (principalUnits.length === 0 && scopedContext.principalUnit) principalUnits = [scopedContext.principalUnit];
    if (principalUnits.length === 0 && scopedContext.scopedUnit) principalUnits = [scopedContext.scopedUnit];

    modulos = (isMaster || req.user.role === 'admin')
      ? await findAllModulosLean()
      : await findModulosAtivosStatusLean();
  } else if (!privilegedUser) {
    unidadesFiltradas = [];
    principalUnits = [];
    console.log('[paginaUnidades] Unidades filtradas sem unitScope canônico:', unidadesFiltradas.length);

    modulos = (isMaster || req.user.role === 'admin')
      ? await findAllModulosLean()
      : await findModulosAtivosStatusLean();
  } else {
    ({ unidadesFiltradas, principalUnits, modulos } = await loadPrivilegedPaginaUnidadesBranch());
  }

  const usuariosDiretor = await loadPaginaUnidadesDiretores({ user: req.user });
  console.log('[paginaUnidades] Renderizando com unidadesFiltradas:', unidadesFiltradas.length, 'principalUnits:', principalUnits.length);

  return {
    unidadesFiltradas,
    principalUnits,
    isMaster,
    user: req.user,
    modulos,
    usuariosDiretor,
  };
}
