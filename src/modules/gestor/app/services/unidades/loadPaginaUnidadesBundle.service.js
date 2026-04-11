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
  let unidadesFiltradas;

  if (scopedContext.scopedUnitId) {
    unidadesFiltradas = scopedContext.unidadesFiltradas;
    console.log('[paginaUnidades] Unidades filtradas via unitScope:', unidadesFiltradas.length);
  } else if (privilegedUser) {
    console.log('[DEBUG SERVER] Carregando todas unidades para usuário privilegiado');
    unidadesFiltradas = await findAllUnidades();
    console.log('[DEBUG SERVER] Unidades encontradas:', unidadesFiltradas.length);
  } else {
    unidadesFiltradas = [];
    console.log('[paginaUnidades] Unidades filtradas sem unitScope canônico:', unidadesFiltradas.length);
  }

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

  let principalUnits = unidadesFiltradas.filter(u => u.is_principal);
  if (principalUnits.length === 0 && scopedContext.principalUnit) principalUnits = [scopedContext.principalUnit];
  if (principalUnits.length === 0 && scopedContext.scopedUnit) principalUnits = [scopedContext.scopedUnit];

  const modulos = (isMaster || req.user.role === 'admin')
    ? await findAllModulosLean()
    : await findModulosAtivosStatusLean();

  if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && isMaster) {
    console.warn('[paginaUnidades] ALERTA: master sem unidades visíveis — verificando fallback matrizes');
    try {
      const matrizes = await findUnidadesPrincipaisLean();
      if (matrizes?.length) unidadesFiltradas = matrizes;
    } catch (_e) {}
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
