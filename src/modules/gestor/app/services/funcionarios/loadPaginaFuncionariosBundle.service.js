import {
  findFuncoesByUnidadePrincipalPopuladas,
  findSetoresByUnidadeIdPopulateLean,
  findFuncionariosParaListagemComRefsSelectLean,
  findUnidadesByCondSelectCodigoNomeOrdenadasLean,
  findFuncoesAtivasNomeOrdenadasSelectLean,
  findSetoresByCondNomeOrdenadosSelectLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function mapFuncoesFiltradas(funcoesContextuais) {
  return (funcoesContextuais || []).map((funcao) => ({
    _id: funcao._id,
    codigo: funcao.codigo,
    nome: funcao.nome,
    descricao: funcao.descricao || '',
  }));
}

function mapSetoresFiltrados(setoresContextuais) {
  return (setoresContextuais || []).map((setor) => ({
    _id: setor._id,
    nome: setor.nome,
    descricao: setor.descricao || '',
  }));
}

export async function loadPaginaFuncionariosBundle({
  req,
  privilegedUser,
  loadScopedOperationalUnitContext,
}) {
  const { operationalUnitId, operationalUnit, principalUnitId } = await loadScopedOperationalUnitContext(req);

  if (operationalUnitId) {
    const [funcoesContextuais, setoresContextuais, funcionarios] = await Promise.all([
      principalUnitId ? findFuncoesByUnidadePrincipalPopuladas(principalUnitId) : [],
      findSetoresByUnidadeIdPopulateLean(operationalUnitId),
      findFuncionariosParaListagemComRefsSelectLean({ unidade_id: operationalUnitId }),
    ]);

    return {
      user: req.user,
      unidadesFiltradas: operationalUnit ? [operationalUnit] : [],
      funcoesFiltradas: mapFuncoesFiltradas(funcoesContextuais),
      setoresFiltrados: mapSetoresFiltrados(setoresContextuais),
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

  const [unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios] = await Promise.all([
    findUnidadesByCondSelectCodigoNomeOrdenadasLean({ ativa: true }),
    findFuncoesAtivasNomeOrdenadasSelectLean(),
    findSetoresByCondNomeOrdenadosSelectLean({ ativo: true }),
    findFuncionariosParaListagemComRefsSelectLean({}),
  ]);

  return {
    user: req.user,
    unidadesFiltradas,
    funcoesFiltradas,
    setoresFiltrados,
    funcionarios,
    unidadeContextualId: operationalUnitId || '',
  };
}