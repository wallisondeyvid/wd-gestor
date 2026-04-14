import { createUnitScope } from '#shared/unitScope.js';
import {
  findAllFuncoesPopuladasRepo,
  findFuncoesByUnidadePrincipalIdsPopuladasRepo,
  findFuncoesByUnidadePrincipalPopuladasRepo,
} from '#modules/gestor/app/repositories/FuncaoReadRepository.js';
import { findAllModulosRepo } from '#modules/gestor/app/repositories/ModuloReadRepository.js';
import {
  findUnidadesPrincipaisRepo,
  findUnidadesPrincipaisSelectIdLeanRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function scopeFromUnidadePrincipalId(unidadePrincipalId) {
  const normalized = String(unidadePrincipalId || '').trim();
  return normalized && /^[a-fA-F0-9]{24}$/.test(normalized)
    ? createUnitScope({ unidadeId: normalized })
    : GLOBAL_SCOPE;
}

export async function findAllFuncoesPopuladas() {
  return findAllFuncoesPopuladasRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findFuncoesByUnidadePrincipalIdsPopuladas(unidadePrincipalIds) {
  return findFuncoesByUnidadePrincipalIdsPopuladasRepo({
    unitScope: GLOBAL_SCOPE,
    unidadePrincipalIds,
  });
}

export async function findFuncoesByUnidadePrincipalPopuladas(unidadePrincipalId) {
  return findFuncoesByUnidadePrincipalPopuladasRepo({
    unitScope: scopeFromUnidadePrincipalId(unidadePrincipalId),
    unidadePrincipalId,
  });
}

export async function findAllModulos() {
  return findAllModulosRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesPrincipais() {
  return findUnidadesPrincipaisRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesPrincipaisSelectIdLean() {
  return findUnidadesPrincipaisSelectIdLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export default {
  findAllFuncoesPopuladas,
  findAllModulos,
  findFuncoesByUnidadePrincipalIdsPopuladas,
  findFuncoesByUnidadePrincipalPopuladas,
  findUnidadesPrincipais,
  findUnidadesPrincipaisSelectIdLean,
};