import { findUnidadeUserBaseLean } from '#modules/gestor/app/services/apiDbBridgeService.js';
import {
  findFuncoesByFiltroLeanData,
  findFuncoesByFiltroSelectLeanData,
} from '#modules/gestor/app/data/funcoes/funcoesReadDataFacade.js';
import { createFuncaoContextPolicyCore } from '#modules/gestor/app/services/funcoes/createFuncaoContextPolicyCore.js';

const funcaoContextPolicy = createFuncaoContextPolicyCore({
  findUnidadeUserBaseLean,
});

function mapClusterFuncao(funcao) {
  return {
    _id: funcao._id,
    nome: funcao.nome,
    descricao: funcao.descricao || '',
    codigo: funcao.codigo || '',
  };
}

function mapUnidadeFuncao(funcao) {
  const nome = funcao.nome || '';
  const rawDesc = (funcao.descricao && funcao.descricao.trim()) ? funcao.descricao.trim() : '';
  const codigo = funcao.codigo || '';
  const descricaoDisplay = rawDesc || (nome && nome !== codigo ? nome : codigo);
  const descricaoFinal = rawDesc || nome || codigo;

  return {
    _id: funcao._id,
    codigo,
    nome,
    descricao: rawDesc,
    descricao_display: descricaoDisplay,
    descricao_final: descricaoFinal,
    hasDescricaoReal: !!rawDesc,
  };
}

export async function findFuncoesByFiltroService(filtro) {
  return findFuncoesByFiltroLeanData(filtro);
}

export async function findFuncoesByFiltroSelectService(filtro) {
  return findFuncoesByFiltroSelectLeanData(filtro);
}

export async function listarFuncoesService({ query, unitScope }) {
  const queryTerm = String(query?.q || '').trim();

  const scope = await funcaoContextPolicy.buildListScope({
    scopedUnitId: unitScope?.unidadeId || null,
    unidadeCluster: query?.unidade_cluster || null,
    unidadeIdRaw: query?.unidade_id || null,
  });

  if (scope.mode === 'cluster') {
    if (scope.empty) return [];

    const filtro = scope.filter;
    let funcoes = await findFuncoesByFiltroService(filtro);

    if (queryTerm) {
      const searchTerm = queryTerm.toLowerCase();
      funcoes = funcoes.filter((funcao) => (
        (funcao.nome && funcao.nome.toLowerCase().includes(searchTerm))
        || (funcao.codigo && funcao.codigo.toLowerCase().includes(searchTerm))
        || (funcao.descricao && funcao.descricao.toLowerCase().includes(searchTerm))
      ));
    }

    funcoes.sort((left, right) => (left.nome || '').localeCompare(right.nome || ''));
    return funcoes.map(mapClusterFuncao);
  }

  if (scope.mode === 'unit-list') {
    if (scope.empty) return [];

    const funcoes = await findFuncoesByFiltroSelectService(scope.filter);
    return funcoes.map(mapUnidadeFuncao);
  }

  return [];
}