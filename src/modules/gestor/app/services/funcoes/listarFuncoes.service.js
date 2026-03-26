import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import {
  findFuncoesByFiltroLeanRepo,
  findFuncoesByFiltroSelectLeanRepo,
} from '#modules/gestor/app/repositories/FuncaoReadRepository.js';
import { findUnidadeUserBaseLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';

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
  const unidadeIdNorm = normalizeUnitId(unidadeId);
  if (!unidadeIdNorm) return '';

  const unidade = await findUnidadeUserBaseLeanRepo({
    unitScope: scopeFromUnidadeId(unidadeIdNorm),
    id: unidadeIdNorm,
  });
  if (!unidade) return unidadeIdNorm;

  return normalizeUnitId(
    unidade.is_principal
      ? unidade._id
      : unidade.unidade_principal_id || unidade.matriz_id || unidade._id || unidadeIdNorm,
  );
}

async function getCanonicalContextPrincipalUnitId(unitScope) {
  const scopedUnitId = normalizeUnitId(unitScope?.unidadeId);
  if (scopedUnitId) return resolvePrincipalUnitId(scopedUnitId);

  return '';
}

async function requestedUnitWithinContextCluster(unitScope, requestedUnitId) {
  const requestedUnitIdNorm = normalizeUnitId(requestedUnitId);
  if (!requestedUnitIdNorm) return true;

  const contextPrincipalUnitId = await getCanonicalContextPrincipalUnitId(unitScope);
  if (!contextPrincipalUnitId) return true;

  const requestedPrincipalUnitId = await resolvePrincipalUnitId(requestedUnitIdNorm);
  return !!requestedPrincipalUnitId && requestedPrincipalUnitId === contextPrincipalUnitId;
}

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
  const unidadeCluster = normalizeUnitId(query?.unidade_cluster);
  const unidadeIdRaw = normalizeUnitId(query?.unidade_id);
  const queryTerm = String(query?.q || '').trim();

  if (unidadeCluster) {
    if (!(await requestedUnitWithinContextCluster(unitScope, unidadeCluster))) return [];

    const principalUnitId = await resolvePrincipalUnitId(unidadeCluster);
    const filtro = { unidade_principal_id: principalUnitId };
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

  if (unidadeIdRaw) {
    const resolvedIds = [];

    for (const candidateId of unidadeIdRaw.split(',').map((value) => value.trim()).filter(Boolean)) {
      if (!(await requestedUnitWithinContextCluster(unitScope, candidateId))) continue;

      const principalUnitId = await resolvePrincipalUnitId(candidateId);
      if (principalUnitId) resolvedIds.push(principalUnitId);
    }

    const ids = [...new Set(resolvedIds)];
    if (ids.length === 0) return [];

    const filtro = ids.length === 1
      ? { unidade_principal_id: ids[0] }
      : { unidade_principal_id: { $in: ids } };

    const funcoes = await findFuncoesByFiltroSelectService(filtro);
    return funcoes.map(mapUnidadeFuncao);
  }

  return [];
}