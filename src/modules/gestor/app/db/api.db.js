import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
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
  findFuncoesByFiltroLeanRepo,
  findFuncoesByFiltroSelectLeanRepo,
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
  findUserDuplicadoByCpfUnidadeExcludingIdRepo,
  findUsersByQueryLeanRepo,
  findUsersLockedAfterSelectLeanRepo,
  findUsuariosDiretorAtivosPopulatedLeanRepo,
  updateUserUnidadeByIdRepo,
} from '#modules/gestor/app/repositories/UserRepository.js';
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

export async function findUnidadeByIdLean(id) {
  return findUnidadeByIdLeanRepo({
    unitScope: createUnitScope({ unidadeId: id }),
    unidadeId: id,
  });
}

export async function findUnidadeByCodigoLean(codigo) {
  return findUnidadeByCodigoLeanRepo({ unitScope: null, codigo });
}

export async function findUnidadeUserBaseLean(id) {
  return findUnidadeUserBaseLeanRepo({ unitScope: null, id });
}

export async function findSubunidadesLean(unidadePrincipalId) {
  return findSubunidadesLeanRepo({
    unitScope: createUnitScope({ unidadeId: unidadePrincipalId }),
    unidadePrincipalId,
  });
}

export async function findUnidadesByCondLean(cond) {
  return findUnidadesByCondLeanRepo({ unitScope: null, cond });
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
  const { Types } = mongoose;
  const conds = [];

  if (Types.ObjectId.isValid(String(anchorRaw))) {
    const anchorOid = new Types.ObjectId(String(anchorRaw));
    conds.push({ _id: anchorOid }, { matriz_id: anchorOid }, { unidade_principal_id: anchorOid });
  }

  conds.push({ _id: anchorRaw }, { matriz_id: anchorRaw }, { unidade_principal_id: anchorRaw });
  return findClusterUnidadesByAnchorLeanRepo({ unitScope: null, conds });
}

export async function findUserByEmailCondLean(cond) {
  return findUserByEmailCondLeanRepo({ unitScope: null, cond });
}

export async function findUsersLockedAfterSelectLean(agora) {
  return findUsersLockedAfterSelectLeanRepo({ unitScope: null, agora });
}

export async function findUserByCpfCondLean(cond) {
  return findUserByCpfCondLeanRepo({ unitScope: null, cond });
}

export async function findUserByEmailCondLeanMaxTimeMs(cond, maxTimeMs) {
  return findUserByEmailCondLeanMaxTimeMsRepo({ unitScope: null, cond, maxTimeMs });
}

export async function findAllUnidadesLean() {
  return findAllUnidadesLeanRepo({ unitScope: null });
}

export async function findAllUnidadesSelectIdCodigoNomeLean() {
  return findAllUnidadesSelectIdCodigoNomeLeanRepo({ unitScope: null });
}

export async function findAllUnidades() {
  return findAllUnidadesRepo({ unitScope: null });
}

export async function findUnidadesByMatrizOuPrincipal(matrizRef) {
  return findUnidadesByMatrizOuPrincipalRepo({ unitScope: null, matrizRef });
}

export async function findUnidadesAtivasStatusLean() {
  return findUnidadesAtivasStatusLeanRepo({ unitScope: null });
}

export async function findUnidadePrincipalLean() {
  return findUnidadePrincipalLeanRepo({ unitScope: null });
}

export async function findUserByEmailCond(cond) {
  return findUserByEmailCondRepo({ unitScope: null, cond });
}

export async function findUsersByQueryLean(query) {
  return findUsersByQueryLeanRepo({ unitScope: null, query });
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
  return countUsersMastersRepo({ unitScope: null });
}

export async function findUserByIdSelectAuthLockInfo(id) {
  return findUserByIdSelectAuthLockInfoRepo({ unitScope: null, id });
}

export async function findUsuariosDiretorAtivosPopulatedLean() {
  return findUsuariosDiretorAtivosPopulatedLeanRepo({ unitScope: null });
}

export async function findUserById(userId) {
  return findUserByIdRepo({ unitScope: null, userId });
}

export async function saveUserDoc(userDoc) {
  return userDoc.save();
}

export async function deleteUserById(userId) {
  return deleteUserByIdRepo({ unitScope: null, userId });
}

export async function findAllModulosBaseLean() {
  return findAllModulosBaseLeanRepo({ unitScope: null });
}

export async function findAllModulos() {
  return findAllModulosRepo({ unitScope: null });
}

export async function findAllModulosLean() {
  return findAllModulosLeanRepo({ unitScope: null });
}

export async function findModulosAtivosStatusLean() {
  return findModulosAtivosStatusLeanRepo({ unitScope: null });
}

export async function findUnidadeByIdWithModulosAcessiveisLean(unidadeId) {
  return findUnidadeByIdWithModulosAcessiveisLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findModuloByIdLean(id) {
  return findModuloByIdLeanRepo({ unitScope: null, id });
}

export async function findModuloByNome(nome) {
  return findModuloByNomeRepo({ unitScope: null, nome });
}

export async function createModulo(data) {
  return createModuloRepo({ unitScope: null, data });
}

export async function findModuloById(id) {
  return findModuloByIdRepo({ unitScope: null, id });
}

export async function saveModulo(modulo) {
  return modulo.save();
}

export async function deleteModuloById(id) {
  return deleteModuloByIdRepo({ unitScope: null, id });
}

export async function findRecursosByFiltroComUnidadeLean(filtro) {
  return findRecursosByFiltroComUnidadeLeanRepo({ unitScope: null, filtro });
}

export async function findRecursoByIdComUnidadeNome(id) {
  return findRecursoByIdComUnidadeNomeRepo({ unitScope: null, id });
}

export async function findRecursoByPlacaUpper(placaUpper) {
  return findRecursoByPlacaUpperRepo({ unitScope: null, placaUpper });
}

export async function findRecursoByChassiUpper(chassiUpper) {
  return findRecursoByChassiUpperRepo({ unitScope: null, chassiUpper });
}

export async function findRecursoByRenavam(renavam) {
  return findRecursoByRenavamRepo({ unitScope: null, renavam });
}

export async function createRecurso(data) {
  return createRecursoRepo({ unitScope: null, data });
}

export async function findRecursoById(id) {
  return findRecursoByIdRepo({ unitScope: null, id });
}

export async function findOutroRecursoByPlacaUpper(id, placaUpper) {
  return findOutroRecursoByPlacaUpperRepo({ unitScope: null, id, placaUpper });
}

export async function findOutroRecursoByChassiUpper(id, chassiUpper) {
  return findOutroRecursoByChassiUpperRepo({ unitScope: null, id, chassiUpper });
}

export async function findOutroRecursoByRenavam(id, renavam) {
  return findOutroRecursoByRenavamRepo({ unitScope: null, id, renavam });
}

export async function updateRecursoByIdComUnidadeNome(id, data) {
  return updateRecursoByIdComUnidadeNomeRepo({ unitScope: null, id, data });
}

export async function deleteRecursoById(id) {
  return deleteRecursoByIdRepo({ unitScope: null, id });
}

export async function findUnidadeById(setorUnidadeId) {
  return findUnidadeByIdRepo({ unitScope: null, setorUnidadeId });
}

export async function findSetorByUnidadeAndNomeNormalizadoLean(unidadeId, nomeNormalizado) {
  return findSetorByUnidadeAndNomeNormalizadoLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
    nomeNormalizado,
  });
}

export async function createSetor(data) {
  return createSetorRepo({ unitScope: null, data });
}

export async function findSetoresByUnidadeIdPopulateLean(unidadeId) {
  return findSetoresByUnidadeIdPopulateLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findSetorByIdPopulateUnidade(id) {
  return findSetorByIdPopulateUnidadeRepo({ unitScope: null, id });
}

export async function findSetorById(id) {
  return findSetorByIdRepo({ unitScope: null, id });
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
  return findUnidadeUserBaseSetorLeanRepo({ unitScope: null, id });
}

export async function findSetoresByFiltroPopulateUnidadeLean(filtro) {
  return findSetoresByFiltroPopulateUnidadeLeanRepo({ unitScope: null, filtro });
}

export async function findSetoresAtivosPopulateUnidadeOrdenadosLean(filtroAtivo) {
  return findSetoresAtivosPopulateUnidadeOrdenadosLeanRepo({ unitScope: null, filtroAtivo });
}

export async function findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean(filtroSetores) {
  return findSetoresByCondDescricaoPopulateUnidadeOrdenadosLeanRepo({ unitScope: null, filtroSetores });
}

export async function findUnidadesAtivasNomeCodigoOrdenadasLean() {
  return findUnidadesAtivasNomeCodigoOrdenadasLeanRepo({ unitScope: null });
}

export async function findUnidadesByIdsNomeCodigoLean(unidadeIds) {
  return findUnidadesByIdsNomeCodigoLeanRepo({ unitScope: null, unidadeIds });
}

export async function findUnidadesForSetorPageSelectLean() {
  return findUnidadesForSetorPageSelectLeanRepo({ unitScope: null });
}

export async function findUnidadesForSetorPageByCondSelectLean(cond) {
  return findUnidadesForSetorPageByCondSelectLeanRepo({ unitScope: null, cond });
}

export async function findUnidadesForSetorPageByIdsSelectLean(unidadeIds) {
  return findUnidadesForSetorPageByIdsSelectLeanRepo({ unitScope: null, unidadeIds });
}

export async function findSetorByIdAndDelete(id) {
  return findSetorByIdAndDeleteRepo({ unitScope: null, id });
}

export async function findCounterSetorCodigoLean() {
  return findCounterSetorCodigoLeanRepo({ unitScope: null });
}

export async function findMaxSetorCodigoLean() {
  return findMaxSetorCodigoLeanRepo({ unitScope: null });
}

export async function findOneAndUpdateCounterSetorCodigo(targetSeq) {
  const Counter = mongoose.models._Counter;
  return Counter.findOneAndUpdate(
    { _id: 'setor_codigo', seq: { $lt: targetSeq } },
    { $set: { seq: targetSeq } },
    { new: true, upsert: true }
  );
}

export async function findFuncaoByNome(nome) {
  return findFuncaoByNomeRepo({ unitScope: null, nome });
}

export async function createFuncao(payload) {
  return createFuncaoRepo({ unitScope: null, payload });
}

export async function findFuncaoByIdPopulated(id) {
  return findFuncaoByIdPopulatedRepo({ unitScope: null, id });
}

export async function findAllFuncoesPopuladas() {
  return findAllFuncoesPopuladasRepo({ unitScope: null });
}

export async function findFuncoesByUnidadePrincipalPopuladas(unidadePrincipalId) {
  return findFuncoesByUnidadePrincipalPopuladasRepo({ unitScope: null, unidadePrincipalId });
}

export async function findFuncoesByUnidadePrincipalIdsPopuladas(unidadePrincipalIds) {
  return findFuncoesByUnidadePrincipalIdsPopuladasRepo({ unitScope: null, unidadePrincipalIds });
}

export async function findFuncaoById(id) {
  return findFuncaoByIdRepo({ unitScope: null, id });
}

export async function findOutraFuncaoByNomeExcludingId(id, nome) {
  return findOutraFuncaoByNomeExcludingIdRepo({ unitScope: null, id, nome });
}

export async function updateFuncaoById(id, updates) {
  return updateFuncaoByIdRepo({ unitScope: null, id, updates });
}

export async function findFuncaoByIdLean(id) {
  return findFuncaoByIdLeanRepo({ unitScope: null, id });
}

export async function findFuncoesByUnidadeLean(unidadeId) {
  return findFuncoesByUnidadeLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findFuncoesByFiltroLean(filtro) {
  return findFuncoesByFiltroLeanRepo({ unitScope: null, filtro });
}

export async function findFuncoesByFiltroSelectLean(filtro) {
  return findFuncoesByFiltroSelectLeanRepo({ unitScope: null, filtro });
}

export async function deleteFuncaoById(id) {
  return deleteFuncaoByIdRepo({ unitScope: null, id });
}

export async function saveFuncao(doc) {
  return doc.save();
}

export async function findUnidadeByIdWithModulosAcessiveis(id) {
  return findUnidadeByIdWithModulosAcessiveisRepo({ unitScope: null, id });
}

export async function findFuncionarioByCpfAndUnidade(cpf, unidadeId) {
  return findFuncionarioByCpfAndUnidadeRepo({
    unitScope: createUnitScope({ unidadeId }),
    cpf,
    unidadeId,
  });
}

export async function findAllFuncionariosSelectIdNomeCpfLean() {
  return findAllFuncionariosSelectIdNomeCpfLeanRepo({ unitScope: null });
}

export async function findFuncionarioByIdSelectIdUnidadeUsuarioLean(funcionarioId) {
  return findFuncionarioByIdSelectIdUnidadeUsuarioLeanRepo({ unitScope: null, funcionarioId });
}

export async function findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean(cleanCpf, unidadeId) {
  return findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    cleanCpf,
    unidadeId,
  });
}

export async function findFuncionarioByEmailSelectIdUnidadeEmailLean(emailNorm) {
  return findFuncionarioByEmailSelectIdUnidadeEmailLeanRepo({ unitScope: null, emailNorm });
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
  return unsetFuncionarioUsuarioIdByIdRepo({ unitScope: null, funcionarioId });
}

export async function setFuncionarioUsuarioIdById(funcionarioId, userId) {
  return setFuncionarioUsuarioIdByIdRepo({ unitScope: null, funcionarioId, userId });
}

export async function unsetFuncionarioUsuarioIdIfMatchesUser(funcionarioId, userId) {
  return unsetFuncionarioUsuarioIdIfMatchesUserRepo({ unitScope: null, funcionarioId, userId });
}

export async function setFuncionarioUsuarioIdIfEmpty(funcionarioId, userId) {
  return setFuncionarioUsuarioIdIfEmptyRepo({ unitScope: null, funcionarioId, userId });
}

export async function findUnidadesAtivasCodigoNomeOrdenadasSelectLean() {
  return findUnidadesAtivasCodigoNomeOrdenadasSelectLeanRepo({ unitScope: null });
}

export async function findUnidadesByCondSelectCodigoNomeOrdenadasLean(cond) {
  return findUnidadesByCondSelectCodigoNomeOrdenadasLeanRepo({ unitScope: null, cond });
}

export async function findFuncoesAtivasNomeOrdenadasSelectLean() {
  return findFuncoesAtivasNomeOrdenadasSelectLeanRepo({ unitScope: null });
}

export async function findSetoresAtivosNomeOrdenadosSelectLean() {
  return findSetoresAtivosNomeOrdenadosSelectLeanRepo({ unitScope: null });
}

export async function findSetoresByCondNomeOrdenadosSelectLean(cond) {
  return findSetoresByCondNomeOrdenadosSelectLeanRepo({ unitScope: null, cond });
}

export async function findFuncionariosParaListagemComRefsSelectLean(filtro) {
  return findFuncionariosParaListagemComRefsSelectLeanRepo({ unitScope: null, filtro });
}

export async function findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLean(unidadeId) {
  return findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findFuncionarioByEmail(email) {
  return findFuncionarioByEmailRepo({ unitScope: null, email });
}

export async function findFuncionariosByEmailsSelectEmailNomeLean(emails) {
  return findFuncionariosByEmailsSelectEmailNomeLeanRepo({ unitScope: null, emails });
}

export async function createFuncionarioDoc(doc) {
  return createFuncionarioDocRepo({ unitScope: null, doc });
}

export async function saveFuncionario(doc) {
  return doc.save();
}

export async function findFuncionarioById(id) {
  return findFuncionarioByIdRepo({ unitScope: null, id });
}

export async function updateFuncionarioByIdWithOps(id, ops) {
  return updateFuncionarioByIdWithOpsRepo({ unitScope: null, id, ops });
}

export async function findFuncionarioByIdPopulateRefs(id) {
  return findFuncionarioByIdPopulateRefsRepo({ unitScope: null, id });
}

export async function findFuncionarioByIdLean(id) {
  return findFuncionarioByIdLeanRepo({ unitScope: null, id });
}

export async function deleteFuncionarioById(id) {
  return deleteFuncionarioByIdRepo({ unitScope: null, id });
}

export async function findFuncionariosDisponiveisByUnidadeLean(unidadeId) {
  return findFuncionariosDisponiveisByUnidadeLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findFuncionarioByIdSelectBasicLean(id) {
  return findFuncionarioByIdSelectBasicLeanRepo({ unitScope: null, id });
}

export async function findFuncionarioByCpfAndUnidadeSelectLean(cpf, unidadeId) {
  return findFuncionarioByCpfAndUnidadeSelectLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    cpf,
    unidadeId,
  });
}

export async function findFuncionarioByEmailSelectLean(email) {
  return findFuncionarioByEmailSelectLeanRepo({ unitScope: null, email });
}

export async function findUserByEmail(email) {
  return findUserByEmailRepo({ unitScope: null, email });
}

export async function findUserByFuncionarioId(funcionarioId) {
  return findUserByFuncionarioIdRepo({ unitScope: null, funcionarioId });
}

export async function findUnidadesByCondLeanFull(cond) {
  return findUnidadesByCondLeanFullRepo({ unitScope: null, cond });
}

export async function findUltimaUnidadePorCodigo() {
  return findUltimaUnidadePorCodigoRepo({ unitScope: null });
}

export async function findUnidadeByCodigo(codigo) {
  return findUnidadeByCodigoRepo({ unitScope: null, codigo });
}

export async function findUnidadeByCpf(cpf) {
  return findUnidadeByCpfRepo({ unitScope: null, cpf });
}

export async function findUnidadeByCnpj(cnpj) {
  return findUnidadeByCnpjRepo({ unitScope: null, cnpj });
}

export async function findSubunidadesByUnidadePrincipal(unidadePrincipalId) {
  return findSubunidadesByUnidadePrincipalRepo({ unitScope: null, unidadePrincipalId });
}

export async function createUnidadeDoc(data) {
  return createUnidadeDocRepo({ unitScope: null, data });
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
  return findUnidadesPrincipaisByIdsRepo({ unitScope: null, unitIds });
}

export async function findUnidadesPrincipais() {
  return findUnidadesPrincipaisRepo({ unitScope: null });
}

export async function findUnidadesPrincipaisLean() {
  return findUnidadesPrincipaisLeanRepo({ unitScope: null });
}

export async function findUnidadesPrincipaisSelectIdLean() {
  return findUnidadesPrincipaisSelectIdLeanRepo({ unitScope: null });
}

export async function findUnidadesById(unidadeId) {
  return findUnidadesByIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function updateManyUnidadesAccessByIds(unitIds, activate) {
  return updateManyUnidadesAccessByIdsRepo({ unitScope: null, unitIds, activate });
}

export async function findUnidadesPermitidasByMatrizRef(matrizRef) {
  return findUnidadesPermitidasByMatrizRefRepo({ unitScope: null, matrizRef });
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

export async function createFeedback(data) {
  return createFeedbackRepo({ unitScope: null, data });
}

export async function findFeedbackById(id) {
  return findFeedbackByIdRepo({ unitScope: null, id });
}

export async function saveFeedbackDoc(feedbackDoc) {
  return feedbackDoc.save();
}

export async function findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter) {
  return findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo({ unitScope: null, filter });
}

export async function findFeedbackByIdLean(id) {
  return findFeedbackByIdLeanRepo({ unitScope: null, id });
}

export async function findFeedbackByFilterSortCreatedAtDescLimit500Lean(filter) {
  return findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo({ unitScope: null, filter });
}

export async function findFeedbackByIdAndUpdateSetNewLean(id, setData) {
  return findFeedbackByIdAndUpdateSetNewLeanRepo({ unitScope: null, id, setData });
}

export async function findFeedbackByIdAndDeleteLean(id) {
  return findFeedbackByIdAndDeleteLeanRepo({ unitScope: null, id });
}

export async function findWidgetSettingsFeedbackLean() {
  return findWidgetSettingsFeedbackLeanRepo({ unitScope: null });
}

export async function updateWidgetSettingsFeedbackModuleEnabledUpsert(moduleId, enabled) {
  return updateWidgetSettingsFeedbackModuleEnabledUpsertRepo({ unitScope: null, moduleId, enabled });
}