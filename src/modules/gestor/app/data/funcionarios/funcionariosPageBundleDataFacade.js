import {
  findFuncionariosParaListagemComRefsSelectLeanRepo,
} from '#modules/gestor/app/repositories/FuncionarioRepository.js';
import {
  findFuncoesAtivasNomeOrdenadasSelectLeanRepo,
  findFuncoesByUnidadePrincipalPopuladasRepo,
} from '#modules/gestor/app/repositories/FuncaoReadRepository.js';
import {
  findSetoresByCondNomeOrdenadosSelectLeanRepo,
  findSetoresByUnidadeIdPopulateLeanRepo,
} from '#modules/gestor/app/repositories/SetorReadRepository.js';
import {
  findUnidadesByCondSelectCodigoNomeOrdenadasLeanRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import { GLOBAL_SCOPE, scopeFromUnidadeId } from '#modules/gestor/app/data/funcoes/funcoesScope.js';

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

export async function loadPrivilegedPaginaFuncionariosBundleData() {
  const [unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios] = await Promise.all([
    findUnidadesByCondSelectCodigoNomeOrdenadasLeanRepo({ unitScope: GLOBAL_SCOPE, cond: { ativa: true } }),
    findFuncoesAtivasNomeOrdenadasSelectLeanRepo({ unitScope: GLOBAL_SCOPE }),
    findSetoresByCondNomeOrdenadosSelectLeanRepo({ unitScope: GLOBAL_SCOPE, cond: { ativo: true } }),
    findFuncionariosParaListagemComRefsSelectLeanRepo({ unitScope: GLOBAL_SCOPE, filtro: {} }),
  ]);

  return {
    unidadesFiltradas,
    funcoesFiltradas,
    setoresFiltrados,
    funcionarios,
  };
}

export async function loadScopedPaginaFuncionariosBundleData({ operationalUnitId, principalUnitId }) {
  const [funcoesContextuais, setoresContextuais, funcionarios] = await Promise.all([
    principalUnitId
      ? findFuncoesByUnidadePrincipalPopuladasRepo({
          unitScope: scopeFromUnidadeId(principalUnitId),
          unidadePrincipalId: principalUnitId,
        })
      : [],
    findSetoresByUnidadeIdPopulateLeanRepo({
      unitScope: scopeFromUnidadeId(operationalUnitId),
      unidadeId: operationalUnitId,
    }),
    findFuncionariosParaListagemComRefsSelectLeanRepo({
      unitScope: scopeFromUnidadeId(operationalUnitId),
      filtro: { unidade_id: operationalUnitId },
    }),
  ]);

  return {
    funcoesFiltradas: mapFuncoesFiltradas(funcoesContextuais),
    setoresFiltrados: mapSetoresFiltrados(setoresContextuais),
    funcionarios,
  };
}

export default {
  loadPrivilegedPaginaFuncionariosBundleData,
  loadScopedPaginaFuncionariosBundleData,
};