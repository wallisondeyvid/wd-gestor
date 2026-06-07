import {
  loadPrivilegedPaginaFuncionariosBundleData,
  loadScopedPaginaFuncionariosBundleData,
} from '#modules/gestor/app/data/funcionarios/funcionariosPageBundleDataFacade.js';

export async function loadPaginaFuncionariosBundle({
  req,
  privilegedUser,
  loadScopedOperationalUnitContext,
}) {
  const { operationalUnitId, operationalUnit, principalUnitId } = await loadScopedOperationalUnitContext(req);

    if (operationalUnitId) {
    const { funcoesFiltradas, setoresFiltrados, funcionarios } = await loadScopedPaginaFuncionariosBundleData({
      operationalUnitId,
      principalUnitId,
    });

    let unidadesFiltradas = operationalUnit ? [operationalUnit] : [];

    if (privilegedUser) {
      const privilegedBundle = await loadPrivilegedPaginaFuncionariosBundleData();
      unidadesFiltradas = privilegedBundle.unidadesFiltradas || unidadesFiltradas;
    }

    return {
      user: req.user,
      unidadesFiltradas,
      funcoesFiltradas,
      setoresFiltrados,
      funcionarios,
      unidadeContextualId: operationalUnitId,
    };
  }

  if (!privilegedUser) {
    return {
      user: req.user,
      unidadesFiltradas: [],
      funcoesFiltradas: [],
      setoresFiltrados: [],
      funcionarios: [],
      unidadeContextualId: operationalUnitId || '',
    };
  }

  const { unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios } = await loadPrivilegedPaginaFuncionariosBundleData();

  return {
    user: req.user,
    unidadesFiltradas,
    funcoesFiltradas,
    setoresFiltrados,
    funcionarios,
    unidadeContextualId: operationalUnitId || '',
  };
}