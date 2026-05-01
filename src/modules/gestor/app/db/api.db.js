import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import { findClusterUnidadesByAnchorService } from '#modules/gestor/app/services/unidades/findClusterUnidadesByAnchor.service.js';
import {
  findFuncoesByFiltroService,
  findFuncoesByFiltroSelectService,
} from '#modules/gestor/app/services/funcoes/listarFuncoes.service.js';
import { findModuloByIdLeanService } from '#modules/gestor/app/services/modulos/findModuloByIdLean.service.js';
import { findRecursosByFiltroComUnidadeService } from '#modules/gestor/app/services/recursos/listarRecursos.service.js';
import { listLockedUsersService } from '#modules/gestor/app/services/usuarios/listLockedUsers.service.js';
import {
  createUnidadeDocRepo,
  findAllUnidadesLeanRepo,
  findAllUnidadesRepo,
  findAllUnidadesSelectIdCodigoNomeLeanRepo,
  findClusterUnidadesByAnchorLeanRepo,
  findSubunidadesLeanRepo,
  findSubunidadesByUnidadePrincipalRepo,
  findUltimaUnidadePorCodigoRepo,
  findUnidadeByCnpjExcludingIdRepo,
  findUnidadeByCnpjRepo,
  findUnidadeByCpfExcludingIdRepo,
  findUnidadeByCpfRepo,
  findUnidadeByCodigoRepo,
  findUnidadeByCodigoLeanRepo,
  findUnidadeByIdOrRawLeanRepo,
  findUnidadeByIdRepo,
  findUnidadeByIdLeanRepo,
  findUnidadeByIdWithModulosAcessiveisLeanRepo,
  findUnidadeByIdWithModulosAcessiveisRepo,
  findUnidadePrincipalLeanRepo,
  findUnidadeUserBaseLeanRepo,
  findUnidadeUserBaseSetorLeanRepo,
  findUnidadesAtivasCodigoNomeOrdenadasSelectLeanRepo,
  findUnidadesAtivasNomeCodigoOrdenadasLeanRepo,
  findUnidadesAtivasStatusLeanRepo,
  findUnidadesByCondLeanFullRepo,
  findUnidadesByCondSelectCodigoNomeOrdenadasLeanRepo,
  findUnidadesByCondLeanRepo,
  findUnidadesByIdRepo,
  findUnidadesByIdsNomeCodigoLeanRepo,
  findUnidadesByMatrizOuPrincipalRepo,
  findUnidadesForSetorPageByCondSelectLeanRepo,
  findUnidadesForSetorPageByIdsSelectLeanRepo,
  findUnidadesForSetorPageSelectLeanRepo,
  findUnidadesPermitidasByMatrizRefRepo,
  findUnidadesPrincipaisByIdsRepo,
  findUnidadesPrincipaisLeanRepo,
  findUnidadesPrincipaisRepo,
  findUnidadesPrincipaisSelectIdLeanRepo,
  updateManyUnidadesAccessByIdsRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import {
  deleteUnidadeByIdRepo,
  updateUnidadeByIdWithValidatorsRepo,
} from '#modules/gestor/app/repositories/UnidadeWriteRepository.js';
import {
  createSetorRepo,
  findCounterSetorCodigoLeanRepo,
  findMaxSetorCodigoLeanRepo,
  findOneAndUpdateCounterSetorCodigoRepo,
  findSetorByIdAndDeleteRepo,
  findSetorByIdPopulateUnidadeRepo,
  findSetorByIdRepo,
  findSetorByUnidadeAndNomeNormalizadoLeanRepo,
  findSetorDupByNomeNormalizadoExcludingIdRepo,
  findSetoresAtivosNomeOrdenadosSelectLeanRepo,
  findSetoresAtivosPopulateUnidadeOrdenadosLeanRepo,
  findSetoresByCondDescricaoPopulateUnidadeOrdenadosLeanRepo,
  findSetoresByCondNomeOrdenadosSelectLeanRepo,
  findSetoresByFiltroPopulateUnidadeLeanRepo,
  findSetoresByUnidadeIdPopulateLeanRepo,
} from '#modules/gestor/app/repositories/SetorReadRepository.js';
import {
  createModuloRepo,
  deleteModuloByIdRepo,
  findAllModulosBaseLeanRepo,
  findAllModulosLeanRepo,
  findAllModulosRepo,
  findModuloByIdRepo,
  findModuloByIdLeanRepo,
  findModuloByNomeRepo,
  findModulosAtivosStatusLeanRepo,
} from '#modules/gestor/app/repositories/ModuloReadRepository.js';
import {
  createFuncaoRepo,
  deleteFuncaoByIdRepo,
  findAllFuncoesPopuladasRepo,
  findFuncaoByIdPopulatedRepo,
  findFuncaoByIdRepo,
  findFuncaoByNomeRepo,
  findFuncaoByIdLeanRepo,
  findFuncoesAtivasNomeOrdenadasSelectLeanRepo,
  findFuncoesByUnidadePrincipalIdsPopuladasRepo,
  findFuncoesByUnidadePrincipalPopuladasRepo,
  findFuncoesByUnidadeLeanRepo,
  findOutraFuncaoByNomeExcludingIdRepo,
  updateFuncaoByIdRepo,
} from '#modules/gestor/app/repositories/FuncaoReadRepository.js';
import {
  countUsersMastersRepo,
  deleteUserByIdRepo,
  findDiretorAtivoByUnidadeSelectIdRepo,
  findUserByCpfCondLeanRepo,
  findUserByEmailCondLeanMaxTimeMsRepo,
  findUserByEmailCondLeanRepo,
  findUserByEmailCondRepo,
  findUserByEmailRepo,
  findUserByFuncionarioIdRepo,
  findUserByIdRepo,
  findUserByIdSelectAuthLockInfoRepo,
  findUsersByIdsExcludingMasterLeanRepo,
  findUserDuplicadoByCpfUnidadeExcludingIdRepo,
  findUsersByQueryLeanRepo,
  findUsersByUnidadeIdsExcludingMasterLeanRepo,
  findUsersLockedAfterSelectLeanRepo,
  findUsuariosDiretorAtivosPopulatedLeanRepo,
  updateUserUnidadeByIdRepo,
} from '#modules/gestor/app/repositories/UserRepository.js';
import {
  createUserMembershipRepo,
  findUserMembershipUserIdsByUnidadeIdsLeanRepo,
  findUserMembershipsByUserIdsLeanRepo,
  findUserMembershipByUserAndUnidadeLeanRepo,
  setUserMembershipFuncionarioIdIfEmptyRepo,
} from '#modules/gestor/app/repositories/UserMembershipRepository.js';
import {
  createFuncionarioDocRepo,
  deleteFuncionarioByIdRepo,
  findAllFuncionariosSelectIdNomeCpfLeanRepo,
  findFuncionarioByCpfAndUnidadeRepo,
  findFuncionarioByCpfAndUnidadeSelectLeanRepo,
  findFuncionarioByCpfOrEmailLeanRepo,
  findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLeanRepo,
  findFuncionarioByEmailRepo,
  findFuncionarioByEmailSelectIdUnidadeEmailLeanRepo,
  findFuncionarioByEmailSelectLeanRepo,
  findFuncionariosByUnidadeIdsSelectIdNomeCpfLeanRepo,
  findFuncionarioByIdLeanRepo,
  findFuncionarioByIdPopulateRefsRepo,
  findFuncionarioByIdRepo,
  findFuncionarioByIdSelectBasicLeanRepo,
  findFuncionarioByIdSelectIdUnidadeUsuarioLeanRepo,
  findFuncionariosByEmailsSelectEmailNomeLeanRepo,
  findFuncionariosDisponiveisByUnidadeLeanRepo,
  findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLeanRepo,
  findFuncionariosParaListagemComRefsSelectLeanRepo,
  setFuncionarioUsuarioIdByIdRepo,
  setFuncionarioUsuarioIdIfEmptyRepo,
  unsetFuncionarioUsuarioIdByIdRepo,
  unsetFuncionarioUsuarioIdIfMatchesUserRepo,
  updateFuncionarioByIdWithOpsRepo,
} from '#modules/gestor/app/repositories/FuncionarioRepository.js';
import {
  createFeedbackRepo,
  findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo,
  findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo,
  findFeedbackByIdAndDeleteLeanRepo,
  findFeedbackByIdAndUpdateSetNewLeanRepo,
  findFeedbackByIdLeanRepo,
  findFeedbackByIdRepo,
} from '#modules/gestor/app/repositories/FeedbackReadRepository.js';
import {
  createRecursoRepo,
  deleteRecursoByIdRepo,
  findOutroRecursoByChassiUpperRepo,
  findOutroRecursoByPlacaUpperRepo,
  findOutroRecursoByRenavamRepo,
  findRecursoByChassiUpperRepo,
  findRecursoByIdComUnidadeNomeRepo,
  findRecursoByIdRepo,
  findRecursoByPlacaUpperRepo,
  findRecursoByRenavamRepo,
  findRecursosByFiltroComUnidadeLeanRepo,
  updateRecursoByIdComUnidadeNomeRepo,
} from '#modules/gestor/app/repositories/RecursoReadRepository.js';
import {
  findWidgetSettingsFeedbackLeanRepo,
  updateWidgetSettingsFeedbackModuleEnabledUpsertRepo,
} from '#modules/gestor/app/repositories/WidgetSettingWriteRepository.js';
import { scopeFromRecursoListFiltro } from '#modules/gestor/app/data/recursos/recursosScope.js';
import {
  GLOBAL_SCOPE,
  extractSingleScopedUnitId,
  scopeFromFuncaoFiltro,
  scopeFromUnidadeId,
} from '#modules/gestor/app/data/funcoes/funcoesScope.js';

function scopeFromSetorFiltro(filtro) {
  if (!filtro || typeof filtro !== 'object' || Array.isArray(filtro)) return GLOBAL_SCOPE;

  const unidadeId = extractSingleScopedUnitId(filtro?.unidade_id);
  return unidadeId ? scopeFromUnidadeId(unidadeId) : GLOBAL_SCOPE;
}

function scopeFromFuncionarioFiltro(filtro) {
  if (!filtro || typeof filtro !== 'object' || Array.isArray(filtro)) return GLOBAL_SCOPE;

  const unidadeId = extractSingleScopedUnitId(filtro.unidade_id);
  return unidadeId ? scopeFromUnidadeId(unidadeId) : GLOBAL_SCOPE;
}

function normalizeFeedbackScopedUnitId(options = {}) {
  const scopedUnitId = options?.scopedUnitId || options?.unitScope?.unidadeId || '';
  return String(scopedUnitId || '').trim();
}

function resolveFeedbackReadUnitScope(options = {}) {
  const scopedUnitId = normalizeFeedbackScopedUnitId(options);
  if (!scopedUnitId || options?.preferScopedRepoRead !== true) return GLOBAL_SCOPE;
  return scopeFromUnidadeId(scopedUnitId);
}

function buildFeedbackScopedFilter(filter, options = {}) {
  const scopedUnitId = normalizeFeedbackScopedUnitId(options);
  if (!scopedUnitId) return filter;

  const baseFilter = filter && typeof filter === 'object' ? filter : {};
  const scopeFilter = options?.allowLegacyUnscoped
    ? {
        $or: [
          { unidade_id: scopedUnitId },
          { unidade_id: { $exists: false } },
          { unidade_id: null },
        ],
      }
    : { unidade_id: scopedUnitId };

  if (Object.keys(baseFilter).length === 0) return scopeFilter;
  return { $and: [baseFilter, scopeFilter] };
}

function feedbackMatchesScopedUnit(feedback, options = {}) {
  const scopedUnitId = normalizeFeedbackScopedUnitId(options);
  if (!scopedUnitId) return true;

  const feedbackUnitId = String(feedback?.unidade_id || '').trim();
  if (!feedbackUnitId) return options?.allowLegacyUnscoped === true;
  return feedbackUnitId === scopedUnitId;
}

async function findFeedbackByIdWithinScope(id, options = {}) {
  const feedback = await findFeedbackByIdLeanRepo({
    unitScope: resolveFeedbackReadUnitScope(options),
    id,
  });
  return feedbackMatchesScopedUnit(feedback, options) ? feedback : null;
}

function extractScopedClusterAnchorFromUnidadesCond(cond) {
  if (!cond || typeof cond !== 'object' || Array.isArray(cond)) return '';

  const clauses = Array.isArray(cond.$or) ? cond.$or : null;
  if (!clauses || clauses.length !== 3) return '';

  const allowedKeys = new Set(['_id', 'unidade_principal_id', 'matriz_id']);
  const matchedKeys = new Set();
  const anchors = new Set();

  for (const clause of clauses) {
    if (!clause || typeof clause !== 'object' || Array.isArray(clause)) return '';

    const entries = Object.entries(clause)
      .map(([key, value]) => [key, String(value || '').trim()])
      .filter(([, value]) => value);

    if (entries.length !== 1) return '';

    const [key, value] = entries[0];
    if (!allowedKeys.has(key)) return '';

    matchedKeys.add(key);
    anchors.add(value);
  }

  if (matchedKeys.size !== 3 || anchors.size !== 1) return '';
  return [...anchors][0];
}

export async function findUnidadeByIdLean(id) {
  return findUnidadeByIdLeanRepo({
    unitScope: createUnitScope({ unidadeId: id }),
    unidadeId: id,
  });
}

export async function findUnidadeByCodigoLean(codigo) {
  return findUnidadeByCodigoLeanRepo({ unitScope: GLOBAL_SCOPE, codigo });
}

export async function findUnidadeUserBaseLean(id) {
  return findUnidadeUserBaseLeanRepo({ unitScope: scopeFromUnidadeId(id), id });
}

export async function findSubunidadesLean(unidadePrincipalId) {
  return findSubunidadesLeanRepo({
    unitScope: createUnitScope({ unidadeId: unidadePrincipalId }),
    unidadePrincipalId,
  });
}

export async function findUnidadesByCondLean(cond) {
  const anchor = extractScopedClusterAnchorFromUnidadesCond(cond);
  return findUnidadesByCondLeanRepo({
    unitScope: anchor ? scopeFromUnidadeId(anchor) : GLOBAL_SCOPE,
    cond,
  });
}

export async function existsUnidadeByCond(cond) {
  const registros = await findUnidadesByCondLean(cond);
  return Array.isArray(registros) && registros.length > 0;
}

export async function findUnidadeByIdOrRawLean(unidadeId) {
  const { Types } = mongoose;
  const oid = Types.ObjectId.isValid(unidadeId) ? new Types.ObjectId(unidadeId) : null;
  return findUnidadeByIdOrRawLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    filter: oid ? { _id: oid } : { _id: unidadeId },
  });
}

export async function findClusterUnidadesByAnchorLean(anchorRaw) {
  return findClusterUnidadesByAnchorService(anchorRaw);
}

export async function findClusterUnidadesByAnchorLeanFromDb(anchorRaw) {
  const { Types } = mongoose;
  const anchor = String(anchorRaw || '').trim();
  if (!anchor) return [];

  const conds = [];

  if (Types.ObjectId.isValid(anchor)) {
    const anchorOid = new Types.ObjectId(anchor);
    conds.push({ _id: anchorOid }, { matriz_id: anchorOid }, { unidade_principal_id: anchorOid });
  }

  conds.push({ _id: anchorRaw }, { matriz_id: anchorRaw }, { unidade_principal_id: anchorRaw });
  return findClusterUnidadesByAnchorLeanRepo({ unitScope: scopeFromUnidadeId(anchor), conds });
}

export async function findUserByEmailCondLean(cond) {
  return findUserByEmailCondLeanRepo({ unitScope: GLOBAL_SCOPE, cond });
}

export async function findUsersLockedAfterSelectLean(agora) {
  return listLockedUsersService(agora);
}

export async function findUsersLockedAfterSelectLeanFromDb(agora) {
  return findUsersLockedAfterSelectLeanRepo({ unitScope: GLOBAL_SCOPE, agora });
}

export async function findUserByCpfCondLean(cond) {
  return findUserByCpfCondLeanRepo({ unitScope: GLOBAL_SCOPE, cond });
}

export async function findUserByEmailCondLeanMaxTimeMs(cond, maxTimeMs) {
  return findUserByEmailCondLeanMaxTimeMsRepo({ unitScope: GLOBAL_SCOPE, cond, maxTimeMs });
}

export async function findAllUnidadesLean() {
  return findAllUnidadesLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findAllUnidadesSelectIdCodigoNomeLean() {
  return findAllUnidadesSelectIdCodigoNomeLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findAllUnidades() {
  return findAllUnidadesRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesByMatrizOuPrincipal(matrizRef) {
  return findUnidadesByMatrizOuPrincipalRepo({ unitScope: scopeFromUnidadeId(matrizRef), matrizRef });
}

export async function findUnidadesAtivasStatusLean() {
  return findUnidadesAtivasStatusLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadePrincipalLean() {
  return findUnidadePrincipalLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUserByEmailCond(cond) {
  return findUserByEmailCondRepo({ unitScope: GLOBAL_SCOPE, cond });
}

export async function findUsersByQueryLean(query) {
  return findUsersByQueryLeanRepo({ unitScope: GLOBAL_SCOPE, query });
}

export async function findUserMembershipsByUserIdsLean(userIds) {
  return findUserMembershipsByUserIdsLeanRepo({ unitScope: GLOBAL_SCOPE, userIds });
}

export async function findUserMembershipUserIdsByUnidadeIdsLean(unidadeIds) {
  return findUserMembershipUserIdsByUnidadeIdsLeanRepo({ unitScope: GLOBAL_SCOPE, unidadeIds });
}

export async function findUserDuplicadoByCpfUnidadeExcludingId(userId, cleanCpf, unidadeId) {
  return findUserDuplicadoByCpfUnidadeExcludingIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    userId,
    cleanCpf,
    unidadeId,
  });
}

export async function countUsersMasters() {
  return countUsersMastersRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUserByIdSelectAuthLockInfo(id) {
  return findUserByIdSelectAuthLockInfoRepo({ unitScope: GLOBAL_SCOPE, id });
}

export async function findUsersByUnidadeIdsExcludingMasterLean(unidadeIds) {
  return findUsersByUnidadeIdsExcludingMasterLeanRepo({ unitScope: GLOBAL_SCOPE, unidadeIds });
}

export async function findUsersByIdsExcludingMasterLean(userIds) {
  return findUsersByIdsExcludingMasterLeanRepo({ unitScope: GLOBAL_SCOPE, userIds });
}

export async function findUsuariosDiretorAtivosPopulatedLean() {
  return findUsuariosDiretorAtivosPopulatedLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUserById(userId) {
  return findUserByIdRepo({ unitScope: GLOBAL_SCOPE, userId });
}

export async function saveUserDoc(userDoc) {
  return userDoc.save();
}

export async function deleteUserById(userId) {
  return deleteUserByIdRepo({ unitScope: GLOBAL_SCOPE, userId });
}

export async function findAllModulosBaseLean() {
  return findAllModulosBaseLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findAllModulos() {
  return findAllModulosRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findAllModulosLean() {
  return findAllModulosLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findModulosAtivosStatusLean() {
  return findModulosAtivosStatusLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadeByIdWithModulosAcessiveisLean(unidadeId) {
  return findUnidadeByIdWithModulosAcessiveisLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findModuloByIdLean(id) {
  return findModuloByIdLeanService(id);
}

export async function findModuloByIdLeanFromDb(id) {
  return findModuloByIdLeanRepo({ unitScope: GLOBAL_SCOPE, id });
}

export async function findModuloByNome(nome) {
  return findModuloByNomeRepo({ unitScope: GLOBAL_SCOPE, nome });
}

export async function createModulo(data) {
  return createModuloRepo({ unitScope: GLOBAL_SCOPE, data });
}

export async function findModuloById(id) {
  return findModuloByIdRepo({ unitScope: GLOBAL_SCOPE, id });
}

export async function saveModulo(modulo) {
  return modulo.save();
}

export async function deleteModuloById(id) {
  return deleteModuloByIdRepo({ unitScope: GLOBAL_SCOPE, id });
}

export async function findRecursosByFiltroComUnidadeLean(filtro) {
  return findRecursosByFiltroComUnidadeService(filtro);
}

export async function findRecursosByFiltroComUnidadeLeanFromDb(filtro) {
  return findRecursosByFiltroComUnidadeLeanRepo({ unitScope: scopeFromRecursoListFiltro(filtro), filtro });
}

export async function findRecursoByIdComUnidadeNome(id, unidadeId = null) {
  return findRecursoByIdComUnidadeNomeRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    id,
    unidadeId,
  });
}

export async function findRecursoByPlacaUpper(placaUpper) {
  return findRecursoByPlacaUpperRepo({ unitScope: GLOBAL_SCOPE, placaUpper });
}

export async function findRecursoByChassiUpper(chassiUpper) {
  return findRecursoByChassiUpperRepo({ unitScope: GLOBAL_SCOPE, chassiUpper });
}

export async function findRecursoByRenavam(renavam) {
  return findRecursoByRenavamRepo({ unitScope: GLOBAL_SCOPE, renavam });
}

export async function createRecurso(data) {
  return createRecursoRepo({ unitScope: scopeFromUnidadeId(data?.unidade_id), data });
}

export async function findRecursoById(id) {
  return findRecursoByIdRepo({ unitScope: GLOBAL_SCOPE, id });
}

export async function findOutroRecursoByPlacaUpper(id, placaUpper, unidadeId = null) {
  return findOutroRecursoByPlacaUpperRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, placaUpper, unidadeId });
}

export async function findOutroRecursoByChassiUpper(id, chassiUpper, unidadeId = null) {
  return findOutroRecursoByChassiUpperRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, chassiUpper, unidadeId });
}

export async function findOutroRecursoByRenavam(id, renavam, unidadeId = null) {
  return findOutroRecursoByRenavamRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, renavam, unidadeId });
}

export async function updateRecursoByIdComUnidadeNome(id, data, unidadeId = null) {
  return updateRecursoByIdComUnidadeNomeRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    id,
    data,
    unidadeId,
  });
}

export async function deleteRecursoById(id, unidadeId = null) {
  return deleteRecursoByIdRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    id,
    unidadeId,
  });
}

export async function findUnidadeById(setorUnidadeId) {
  return findUnidadeByIdRepo({ unitScope: scopeFromUnidadeId(setorUnidadeId), setorUnidadeId });
}

export async function findSetorByUnidadeAndNomeNormalizadoLean(unidadeId, nomeNormalizado) {
  return findSetorByUnidadeAndNomeNormalizadoLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
    nomeNormalizado,
  });
}

export async function createSetor(data) {
  return createSetorRepo({ unitScope: scopeFromUnidadeId(data?.unidade_id), data });
}

export async function findSetoresByUnidadeIdPopulateLean(unidadeId) {
  return findSetoresByUnidadeIdPopulateLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findSetorByIdPopulateUnidade(id, unidadeId = null) {
  return findSetorByIdPopulateUnidadeRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, unidadeId });
}

export async function findSetorById(id, unidadeId = null) {
  return findSetorByIdRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, unidadeId });
}

export async function findSetorDupByNomeNormalizadoExcludingId(setorId, unidadeId, nomeNormalizado) {
  return findSetorDupByNomeNormalizadoExcludingIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    setorId,
    unidadeId,
    nomeNormalizado,
  });
}

export async function saveSetor(setor) {
  return setor.save();
}

export async function findUnidadeUserBaseSetorLean(id) {
  return findUnidadeUserBaseSetorLeanRepo({ unitScope: scopeFromUnidadeId(id), id });
}

export async function findSetoresByFiltroPopulateUnidadeLean(filtro) {
  return findSetoresByFiltroPopulateUnidadeLeanRepo({ unitScope: scopeFromSetorFiltro(filtro), filtro });
}

export async function findSetoresAtivosPopulateUnidadeOrdenadosLean(filtroAtivo) {
  return findSetoresAtivosPopulateUnidadeOrdenadosLeanRepo({ unitScope: GLOBAL_SCOPE, filtroAtivo });
}

export async function findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean(filtroSetores) {
  return findSetoresByCondDescricaoPopulateUnidadeOrdenadosLeanRepo({ unitScope: scopeFromSetorFiltro(filtroSetores), filtroSetores });
}

export async function findUnidadesAtivasNomeCodigoOrdenadasLean() {
  return findUnidadesAtivasNomeCodigoOrdenadasLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesByIdsNomeCodigoLean(unidadeIds, options = {}) {
  const scopedUnitId = String(options?.scopedUnitId || '').trim();
  const singleUnitId = scopedUnitId || extractSingleScopedUnitId({ $in: unidadeIds });
  return findUnidadesByIdsNomeCodigoLeanRepo({
    unitScope: singleUnitId ? scopeFromUnidadeId(singleUnitId) : GLOBAL_SCOPE,
    unidadeIds,
  });
}

export async function findUnidadesForSetorPageSelectLean() {
  return findUnidadesForSetorPageSelectLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesForSetorPageByCondSelectLean(cond) {
  return findUnidadesForSetorPageByCondSelectLeanRepo({ unitScope: GLOBAL_SCOPE, cond });
}

export async function findUnidadesForSetorPageByIdsSelectLean(unidadeIds) {
  const singleUnitId = extractSingleScopedUnitId({ $in: unidadeIds });
  return findUnidadesForSetorPageByIdsSelectLeanRepo({
    unitScope: singleUnitId ? scopeFromUnidadeId(singleUnitId) : GLOBAL_SCOPE,
    unidadeIds,
  });
}

export async function findSetorByIdAndDelete(id, unidadeId = null) {
  return findSetorByIdAndDeleteRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, unidadeId });
}

export async function findCounterSetorCodigoLean() {
  return findCounterSetorCodigoLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findMaxSetorCodigoLean() {
  return findMaxSetorCodigoLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findOneAndUpdateCounterSetorCodigo(targetSeq) {
  return findOneAndUpdateCounterSetorCodigoRepo({ unitScope: GLOBAL_SCOPE, targetSeq });
}

export async function findFuncaoByNome(nome, unidadePrincipalId = null) {
  return findFuncaoByNomeRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), nome });
}

export async function createFuncao(payload) {
  return createFuncaoRepo({ unitScope: scopeFromUnidadeId(payload?.unidade_principal_id), payload });
}

export async function findFuncaoByIdPopulated(id, unidadePrincipalId = null) {
  return findFuncaoByIdPopulatedRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), id });
}

export async function findAllFuncoesPopuladas() {
  return findAllFuncoesPopuladasRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findFuncoesByUnidadePrincipalPopuladas(unidadePrincipalId) {
  return findFuncoesByUnidadePrincipalPopuladasRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), unidadePrincipalId });
}

export async function findFuncoesByUnidadePrincipalIdsPopuladas(unidadePrincipalIds) {
  return findFuncoesByUnidadePrincipalIdsPopuladasRepo({ unitScope: GLOBAL_SCOPE, unidadePrincipalIds });
}

export async function findFuncaoById(id, unidadePrincipalId = null) {
  return findFuncaoByIdRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), id });
}

export async function findOutraFuncaoByNomeExcludingId(id, nome, unidadePrincipalId = null) {
  return findOutraFuncaoByNomeExcludingIdRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), id, nome });
}

export async function updateFuncaoById(id, updates, unidadePrincipalId = null) {
  return updateFuncaoByIdRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), id, updates });
}

export async function findFuncaoByIdLean(id, unidadePrincipalId = null) {
  return findFuncaoByIdLeanRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), id });
}

export async function findFuncoesByUnidadeLean(unidadeId) {
  return findFuncoesByUnidadeLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findFuncoesByPrincipalUnitIdLean(unidadePrincipalId) {
  return findFuncoesByUnidadeLeanRepo({
    unitScope: createUnitScope({ unidadeId: unidadePrincipalId }),
    unidadeId: unidadePrincipalId,
  });
}

export async function findFuncoesByFiltroLean(filtro) {
  return findFuncoesByFiltroService(filtro);
}

export async function findFuncoesByFiltroLeanFromDb(filtro) {
  return findFuncoesByFiltroLeanRepo({ unitScope: scopeFromFuncaoFiltro(filtro), filtro });
}

export async function findFuncoesByFiltroSelectLean(filtro) {
  return findFuncoesByFiltroSelectService(filtro);
}

export async function findFuncoesByFiltroSelectLeanFromDb(filtro) {
  return findFuncoesByFiltroSelectLeanRepo({ unitScope: scopeFromFuncaoFiltro(filtro), filtro });
}

export async function deleteFuncaoById(id, unidadePrincipalId = null) {
  return deleteFuncaoByIdRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), id });
}

export async function saveFuncao(doc) {
  return doc.save();
}

export async function findUnidadeByIdWithModulosAcessiveis(id) {
  return findUnidadeByIdWithModulosAcessiveisRepo({ unitScope: scopeFromUnidadeId(id), id });
}

export async function findFuncionarioByCpfAndUnidade(cpf, unidadeId) {
  return findFuncionarioByCpfAndUnidadeRepo({
    unitScope: createUnitScope({ unidadeId }),
    cpf,
    unidadeId,
  });
}

export async function findAllFuncionariosSelectIdNomeCpfLean() {
  return findAllFuncionariosSelectIdNomeCpfLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findFuncionariosByUnidadeIdsSelectIdNomeCpfLean(unidadeIds) {
  return findFuncionariosByUnidadeIdsSelectIdNomeCpfLeanRepo({ unitScope: GLOBAL_SCOPE, unidadeIds });
}

export async function findFuncionarioByIdSelectIdUnidadeUsuarioLean(funcionarioId) {
  return findFuncionarioByIdSelectIdUnidadeUsuarioLeanRepo({
    unitScope: scopeFromUnidadeId(arguments[1]),
    funcionarioId,
    unidadeId: arguments[1] ?? null,
  });
}

export async function findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean(cleanCpf, unidadeId) {
  return findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    cleanCpf,
    unidadeId,
  });
}

export async function findFuncionarioByEmailSelectIdUnidadeEmailLean(emailNorm) {
  return findFuncionarioByEmailSelectIdUnidadeEmailLeanRepo({ unitScope: GLOBAL_SCOPE, emailNorm });
}

export async function findFuncionarioByCpfOrEmailLean(cleanCpf, unidadeId, emailNorm) {
  return findFuncionarioByCpfOrEmailLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    cleanCpf,
    unidadeId,
    emailNorm,
  });
}

export async function unsetFuncionarioUsuarioIdById(funcionarioId) {
  return unsetFuncionarioUsuarioIdByIdRepo({
    unitScope: scopeFromUnidadeId(arguments[1]),
    funcionarioId,
    unidadeId: arguments[1] ?? null,
  });
}

export async function setFuncionarioUsuarioIdById(funcionarioId, userId, unidadeId = null) {
  return setFuncionarioUsuarioIdByIdRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    funcionarioId,
    userId,
    unidadeId,
  });
}

export async function unsetFuncionarioUsuarioIdIfMatchesUser(funcionarioId, userId, unidadeId = null) {
  return unsetFuncionarioUsuarioIdIfMatchesUserRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    funcionarioId,
    userId,
    unidadeId,
  });
}

export async function setFuncionarioUsuarioIdIfEmpty(funcionarioId, userId, unidadeId = null) {
  return setFuncionarioUsuarioIdIfEmptyRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    funcionarioId,
    userId,
    unidadeId,
  });
}

export async function findUnidadesAtivasCodigoNomeOrdenadasSelectLean() {
  return findUnidadesAtivasCodigoNomeOrdenadasSelectLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesByCondSelectCodigoNomeOrdenadasLean(cond) {
  const anchor = extractScopedClusterAnchorFromUnidadesCond(cond);
  return findUnidadesByCondSelectCodigoNomeOrdenadasLeanRepo({
    unitScope: anchor ? scopeFromUnidadeId(anchor) : GLOBAL_SCOPE,
    cond,
  });
}

export async function findFuncoesAtivasNomeOrdenadasSelectLean() {
  return findFuncoesAtivasNomeOrdenadasSelectLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findSetoresAtivosNomeOrdenadosSelectLean() {
  return findSetoresAtivosNomeOrdenadosSelectLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findSetoresByCondNomeOrdenadosSelectLean(cond) {
  return findSetoresByCondNomeOrdenadosSelectLeanRepo({ unitScope: scopeFromSetorFiltro(cond), cond });
}

export async function findFuncionariosParaListagemComRefsSelectLean(filtro) {
  return findFuncionariosParaListagemComRefsSelectLeanRepo({ unitScope: scopeFromFuncionarioFiltro(filtro), filtro });
}

export async function findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLean(unidadeId) {
  return findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findFuncionarioByEmail(email) {
  return findFuncionarioByEmailRepo({ unitScope: GLOBAL_SCOPE, email });
}

export async function findFuncionariosByEmailsSelectEmailNomeLean(emails) {
  return findFuncionariosByEmailsSelectEmailNomeLeanRepo({ unitScope: GLOBAL_SCOPE, emails });
}

export async function createFuncionarioDoc(doc) {
  return createFuncionarioDocRepo({ unitScope: scopeFromUnidadeId(doc?.unidade_id), doc });
}

export async function saveFuncionario(doc) {
  return doc.save();
}

export async function findFuncionarioById(id, unidadeId = null) {
  return findFuncionarioByIdRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, unidadeId });
}

export async function updateFuncionarioByIdWithOps(id, ops, unidadeId = null) {
  return updateFuncionarioByIdWithOpsRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, ops, unidadeId });
}

export async function findFuncionarioByIdPopulateRefs(id, unidadeId = null) {
  return findFuncionarioByIdPopulateRefsRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, unidadeId });
}

export async function findFuncionarioByIdLean(id, unidadeId = null) {
  return findFuncionarioByIdLeanRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, unidadeId });
}

export async function deleteFuncionarioById(id, unidadeId = null) {
  return deleteFuncionarioByIdRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, unidadeId });
}

export async function findFuncionariosDisponiveisByUnidadeLean(unidadeId) {
  return findFuncionariosDisponiveisByUnidadeLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findFuncionarioByIdSelectBasicLean(id, unidadeId = null) {
  return findFuncionarioByIdSelectBasicLeanRepo({ unitScope: scopeFromUnidadeId(unidadeId), id, unidadeId });
}

export async function findFuncionarioByCpfAndUnidadeSelectLean(cpf, unidadeId) {
  return findFuncionarioByCpfAndUnidadeSelectLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    cpf,
    unidadeId,
  });
}

export async function findFuncionarioByEmailSelectLean(email) {
  return findFuncionarioByEmailSelectLeanRepo({ unitScope: GLOBAL_SCOPE, email });
}

export async function findUserByEmail(email) {
  return findUserByEmailRepo({ unitScope: GLOBAL_SCOPE, email });
}

export async function findUserByFuncionarioId(funcionarioId) {
  return findUserByFuncionarioIdRepo({ unitScope: GLOBAL_SCOPE, funcionarioId });
}

export async function findUserMembershipByUserAndUnidade(userId, unidadeId) {
  return findUserMembershipByUserAndUnidadeLeanRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    userId,
    unidadeId,
  });
}

export async function createUserMembership(data) {
  return createUserMembershipRepo({ unitScope: scopeFromUnidadeId(data?.unidade_id), data });
}

export async function setUserMembershipFuncionarioIdIfEmpty(membershipId, funcionarioId) {
  return setUserMembershipFuncionarioIdIfEmptyRepo({
    unitScope: GLOBAL_SCOPE,
    membershipId,
    funcionarioId,
  });
}

export async function findUnidadesByCondLeanFull(cond) {
  const anchor = extractScopedClusterAnchorFromUnidadesCond(cond);
  if (!anchor) return [];
  return findUnidadesByCondLeanFullRepo({
    unitScope: scopeFromUnidadeId(anchor),
    cond,
  });
}

export async function findUltimaUnidadePorCodigo() {
  return findUltimaUnidadePorCodigoRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadeByCodigo(codigo) {
  return findUnidadeByCodigoRepo({ unitScope: GLOBAL_SCOPE, codigo });
}

export async function findUnidadeByCpf(cpf) {
  return findUnidadeByCpfRepo({ unitScope: GLOBAL_SCOPE, cpf });
}

export async function findUnidadeByCnpj(cnpj) {
  return findUnidadeByCnpjRepo({ unitScope: GLOBAL_SCOPE, cnpj });
}

export async function findSubunidadesByUnidadePrincipal(unidadePrincipalId) {
  return findSubunidadesByUnidadePrincipalRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), unidadePrincipalId });
}

export async function createUnidadeDoc(data) {
  return createUnidadeDocRepo({ unitScope: GLOBAL_SCOPE, data });
}

export async function saveUnidadeDoc(doc) {
  return doc.save();
}

export async function updateUserUnidadeById(userId, unidadeId) {
  return updateUserUnidadeByIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    userId,
    unidadeId,
  });
}

export async function findUnidadeByCpfExcludingId(cpf, unidadeId) {
  return findUnidadeByCpfExcludingIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    cpf,
    unidadeId,
  });
}

export async function findUnidadeByCnpjExcludingId(cnpj, unidadeId) {
  return findUnidadeByCnpjExcludingIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    cnpj,
    unidadeId,
  });
}

export async function updateUnidadeByIdWithValidators(unidadeId, updated) {
  return updateUnidadeByIdWithValidatorsRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
    updated,
  });
}

export async function findUnidadesPrincipaisByIds(unitIds) {
  return findUnidadesPrincipaisByIdsRepo({ unitScope: GLOBAL_SCOPE, unitIds });
}

export async function findUnidadesPrincipais() {
  return findUnidadesPrincipaisRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesPrincipaisLean() {
  return findUnidadesPrincipaisLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesPrincipaisSelectIdLean() {
  return findUnidadesPrincipaisSelectIdLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesById(unidadeId) {
  return findUnidadesByIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function updateManyUnidadesAccessByIds(unitIds, activate) {
  return updateManyUnidadesAccessByIdsRepo({ unitScope: GLOBAL_SCOPE, unitIds, activate });
}

export async function findUnidadesPermitidasByMatrizRef(matrizRef) {
  return findUnidadesPermitidasByMatrizRefRepo({ unitScope: scopeFromUnidadeId(matrizRef), matrizRef });
}

export async function findDiretorAtivoByUnidadeSelectId(unidadeId) {
  return findDiretorAtivoByUnidadeSelectIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function deleteUnidadeById(unidadeId) {
  return deleteUnidadeByIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function createFeedback(data, options = {}) {
  const scopedUnitId = normalizeFeedbackScopedUnitId(options);
  const payload = scopedUnitId
    ? { ...data, unidade_id: scopedUnitId }
    : data;

  return createFeedbackRepo({ unitScope: GLOBAL_SCOPE, data: payload });
}

export async function findFeedbackById(id, options = {}) {
  const feedback = await findFeedbackByIdRepo({
    unitScope: resolveFeedbackReadUnitScope(options),
    id,
  });
  return feedbackMatchesScopedUnit(feedback, options) ? feedback : null;
}

export async function saveFeedbackDoc(feedbackDoc) {
  return feedbackDoc.save();
}

export async function findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter, options = {}) {
  return findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo({
    unitScope: resolveFeedbackReadUnitScope(options),
    filter: buildFeedbackScopedFilter(filter, options),
  });
}

export async function findFeedbackByIdLean(id, options = {}) {
  return findFeedbackByIdWithinScope(id, options);
}

export async function findFeedbackByFilterSortCreatedAtDescLimit500Lean(filter, options = {}) {
  return findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo({
    unitScope: resolveFeedbackReadUnitScope(options),
    filter: buildFeedbackScopedFilter(filter, options),
  });
}

export async function findFeedbackByIdAndUpdateSetNewLean(id, setData, options = {}) {
  const existing = await findFeedbackByIdWithinScope(id, options);
  if (!existing) return null;
  return findFeedbackByIdAndUpdateSetNewLeanRepo({ unitScope: GLOBAL_SCOPE, id, setData });
}

export async function findFeedbackByIdAndDeleteLean(id, options = {}) {
  const existing = await findFeedbackByIdWithinScope(id, options);
  if (!existing) return null;
  return findFeedbackByIdAndDeleteLeanRepo({ unitScope: GLOBAL_SCOPE, id });
}

export async function findWidgetSettingsFeedbackLean() {
  return findWidgetSettingsFeedbackLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function updateWidgetSettingsFeedbackModuleEnabledUpsert(moduleId, enabled) {
  return updateWidgetSettingsFeedbackModuleEnabledUpsertRepo({ unitScope: GLOBAL_SCOPE, moduleId, enabled });
}