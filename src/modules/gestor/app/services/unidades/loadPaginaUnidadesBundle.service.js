import {
  findAllUnidades,
  findAllModulosLean,
  findModulosAtivosStatusLean,
  findUnidadesPrincipaisLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { loadPaginaUnidadesDiretores } from '#modules/gestor/app/services/unidades/loadPaginaUnidadesDiretores.service.js';

export async function loadPaginaUnidadesBundle({
  req,
  isMaster,
  privilegedUser,
  loadScopedUnidadesClusterForPage,
}) {
  const scopedContext = await loadScopedUnidadesClusterForPage(req);

  async function loadPrivilegedPaginaUnidadesBranch() {
    console.log('[DEBUG SERVER] Carregando todas unidades para usuário privilegiado');
    let privilegedUnidadesFiltradas = await findAllUnidades();
    console.log('[DEBUG SERVER] Unidades encontradas:', privilegedUnidadesFiltradas.length);

    try {
      privilegedUnidadesFiltradas = privilegedUnidadesFiltradas.map((u) => {
        const plain = u?.toObject ? u.toObject() : { ...u };
        return {
          ...plain,
          naturezaJuridica: plain.naturezaJuridica || '',
          modulosAcessiveis: Array.isArray(plain.modulosAcessiveis) ? plain.modulosAcessiveis : [],
        };
      });
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
        if (matrizes?.length) privilegedUnidadesFiltradas = matrizes;
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
      unidadesFiltradas = unidadesFiltradas.map((u) => {
        const plain = u?.toObject ? u.toObject() : { ...u };
        return {
          ...plain,
          naturezaJuridica: plain.naturezaJuridica || '',
          modulosAcessiveis: Array.isArray(plain.modulosAcessiveis) ? plain.modulosAcessiveis : [],
        };
      });
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
