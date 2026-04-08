import {
  findAllFuncoesPopuladas,
  findAllModulos,
  findFuncoesByUnidadePrincipalIdsPopuladas,
  findFuncoesByUnidadePrincipalPopuladas,
  findUnidadesPrincipais,
  findUnidadesPrincipaisSelectIdLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

async function loadPrivilegedPaginaFuncoesBundle(req, privilegedUser) {
  let funcoesFiltradas = await findAllFuncoesPopuladas();
  if ((!funcoesFiltradas || funcoesFiltradas.length === 0) && privilegedUser) {
    const matrizes = await findUnidadesPrincipaisSelectIdLean();
    const ids = matrizes.map((matriz) => matriz._id);
    funcoesFiltradas = await findFuncoesByUnidadePrincipalIdsPopuladas(ids);
  }

  const modulosFiltrados = await findAllModulos();
  const unidadesPrincipaisFiltradas = await findUnidadesPrincipais();

  return {
    statusCode: 200,
    locals: {
      funcoesFiltradas,
      modulosFiltrados,
      unidadesPrincipaisFiltradas,
      user: req.user,
    },
  };
}

export async function loadPaginaFuncoesOwnerBundle({
  req,
  privilegedUser,
  isDbOff,
  buildStubCtx,
  loadScopedUnitContext,
}) {
  if (isDbOff) {
    return {
      statusCode: 200,
      locals: buildStubCtx(req, {
        funcoesFiltradas: [],
        modulosFiltrados: [],
        unidadesPrincipaisFiltradas: [],
      }),
    };
  }

  const { principalUnitId, principalUnit } = await loadScopedUnitContext(req);
  if (principalUnitId) {
    const [funcoesFiltradas, modulosFiltrados] = await Promise.all([
      findFuncoesByUnidadePrincipalPopuladas(principalUnitId),
      findAllModulos(),
    ]);

    return {
      statusCode: 200,
      locals: {
        funcoesFiltradas,
        modulosFiltrados,
        unidadesPrincipaisFiltradas: principalUnit ? [principalUnit] : [],
        user: req.user,
      },
    };
  }

  if (!privilegedUser) {
    const modulosFiltrados = await findAllModulos();
    return {
      statusCode: 200,
      locals: {
        funcoesFiltradas: [],
        modulosFiltrados,
        unidadesPrincipaisFiltradas: [],
        user: req.user,
      },
    };
  }

  return loadPrivilegedPaginaFuncoesBundle(req, privilegedUser);
}