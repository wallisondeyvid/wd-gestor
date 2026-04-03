import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import {
  findFuncoesByFiltroLeanRepo,
  findFuncoesByFiltroSelectLeanRepo,
} from '#modules/gestor/app/repositories/FuncaoReadRepository.js';
import { findUnidadeUserBaseLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import { createFuncaoContextPolicyCore } from '#modules/gestor/app/services/funcoes/createFuncaoContextPolicyCore.js';

const GLOBAL_SCOPE = createUnitScope({});

function normalizeUnitId(value) {
  return String(value || '').trim();
}

function scopeFromUnidadeId(unidadeId) {
  const unidadeIdNorm = normalizeUnitId(unidadeId);
  return unidadeIdNorm && mongoose.isValidObjectId(unidadeIdNorm)
    ? createUnitScope({ unidadeId: unidadeIdNorm })
    : GLOBAL_SCOPE;
}

function extractSingleScopedUnitId(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

  const inValues = Array.isArray(value.$in)
    ? [...new Set(value.$in.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];

  return inValues.length === 1 ? inValues[0] : '';
}

function scopeFromFuncaoFiltro(filtro) {
  if (!filtro || typeof filtro !== 'object' || Array.isArray(filtro)) return GLOBAL_SCOPE;

  const unidadePrincipalId = extractSingleScopedUnitId(filtro.unidade_principal_id);
  return unidadePrincipalId ? scopeFromUnidadeId(unidadePrincipalId) : GLOBAL_SCOPE;
}

async function resolvePrincipalUnitId(unidadeId) {
  return funcaoContextPolicy.resolvePrincipalUnitId(unidadeId);
}

const funcaoContextPolicy = createFuncaoContextPolicyCore({
  findUnidadeUserBaseLean: async (unidadeId) => findUnidadeUserBaseLeanRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    id: unidadeId,
  }),
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
  return findFuncoesByFiltroLeanRepo({ unitScope: scopeFromFuncaoFiltro(filtro), filtro });
}

export async function findFuncoesByFiltroSelectService(filtro) {
  return findFuncoesByFiltroSelectLeanRepo({ unitScope: scopeFromFuncaoFiltro(filtro), filtro });
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