import Unidade from '#models/unidade.js';
import Funcionario from '#models/Funcionario.js';
import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import {
  findSubunidadesLeanRepo,
  findUnidadeByCodigoLeanRepo,
  findUnidadeByIdLeanRepo,
  findUnidadesByCondLeanRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import {
  deleteUnidadeByIdRepo,
  updateUnidadeByIdWithValidatorsRepo,
} from '#modules/gestor/app/repositories/UnidadeWriteRepository.js';
import {
  createSetorRepo,
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
  return Unidade.findById(id)
    .select('_id is_principal unidade_principal_id matriz_id')
    .lean();
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
  return Unidade.findOne(oid ? { _id: oid } : { _id: unidadeId }).lean();
}

export async function findClusterUnidadesByAnchorLean(anchorRaw) {
  const { Types } = mongoose;
  const conds = [];

  if (Types.ObjectId.isValid(String(anchorRaw))) {
    const anchorOid = new Types.ObjectId(String(anchorRaw));
    conds.push({ _id: anchorOid }, { matriz_id: anchorOid }, { unidade_principal_id: anchorOid });
  }

  conds.push({ _id: anchorRaw }, { matriz_id: anchorRaw }, { unidade_principal_id: anchorRaw });
  return Unidade.find({ $or: conds }).lean();
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
  return Unidade.find({}).lean();
}

export async function findAllUnidadesSelectIdCodigoNomeLean() {
  return Unidade.find().select('_id codigo nome').lean();
}

export async function findAllUnidades() {
  return Unidade.find();
}

export async function findUnidadesByMatrizOuPrincipal(matrizRef) {
  return Unidade.find({ $or: [{ _id: matrizRef }, { unidade_principal_id: matrizRef }] });
}

export async function findUnidadesAtivasStatusLean() {
  return Unidade.find({ status: 'ativo' }).lean();
}

export async function findUnidadePrincipalLean() {
  return Unidade.findOne({ is_principal: true }).lean();
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
  return Unidade.findById(unidadeId).populate('modulosAcessiveis').lean();
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
  return Unidade.findById(setorUnidadeId);
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
  return Unidade.findById(id)
    .select('_id is_principal unidade_principal_id')
    .lean();
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
  return Unidade.find({ ativa: true }).select('nome codigo').sort({ nome: 1 }).lean();
}

export async function findUnidadesByIdsNomeCodigoLean(unidadeIds) {
  return Unidade.find({ _id: { $in: unidadeIds } }).select('nome codigo').lean();
}

export async function findUnidadesForSetorPageSelectLean() {
  return Unidade.find().select('_id id codigo nome is_principal unidade_principal_id').lean();
}

export async function findUnidadesForSetorPageByCondSelectLean(cond) {
  return Unidade.find(cond).select('_id id codigo nome is_principal unidade_principal_id').lean();
}

export async function findUnidadesForSetorPageByIdsSelectLean(unidadeIds) {
  return Unidade.find({ _id: { $in: unidadeIds } }).select('_id id codigo nome is_principal unidade_principal_id').lean();
}

export async function findSetorByIdAndDelete(id) {
  return findSetorByIdAndDeleteRepo({ unitScope: null, id });
}

export async function findCounterSetorCodigoLean() {
  const Counter = mongoose.models._Counter;
  return Counter.findOne({ _id: 'setor_codigo' }).lean();
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
  return Unidade.findById(id).populate('modulosAcessiveis');
}

export async function findFuncionarioByCpfAndUnidade(cpf, unidadeId) {
  return Funcionario.findOne({ cpf, unidade_id: unidadeId });
}

export async function findAllFuncionariosSelectIdNomeCpfLean() {
  return Funcionario.find().select('_id nome cpf').lean();
}

export async function findFuncionarioByIdSelectIdUnidadeUsuarioLean(funcionarioId) {
  return Funcionario.findById(funcionarioId).select('_id unidade_id usuario_id').lean();
}

export async function findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean(cleanCpf, unidadeId) {
  return Funcionario.findOne({ cpf: cleanCpf, unidade_id: unidadeId }).select('_id unidade_id email').lean();
}

export async function findFuncionarioByEmailSelectIdUnidadeEmailLean(emailNorm) {
  return Funcionario.findOne({ email: emailNorm }).select('_id unidade_id email').lean();
}

export async function findFuncionarioByCpfOrEmailLean(cleanCpf, unidadeId, emailNorm) {
  return Funcionario.findOne({ $or: [{ cpf: cleanCpf, unidade_id: unidadeId }, { email: emailNorm }] }).lean();
}

export async function unsetFuncionarioUsuarioIdById(funcionarioId) {
  return Funcionario.updateOne({ _id: funcionarioId }, { $unset: { usuario_id: '' } });
}

export async function setFuncionarioUsuarioIdById(funcionarioId, userId) {
  return Funcionario.updateOne({ _id: funcionarioId }, { $set: { usuario_id: userId } });
}

export async function unsetFuncionarioUsuarioIdIfMatchesUser(funcionarioId, userId) {
  return Funcionario.updateOne({ _id: funcionarioId, usuario_id: userId }, { $unset: { usuario_id: '' } });
}

export async function setFuncionarioUsuarioIdIfEmpty(funcionarioId, userId) {
  return Funcionario.updateOne(
    { _id: funcionarioId, $or: [{ usuario_id: { $exists: false } }, { usuario_id: null }] },
    { $set: { usuario_id: userId } }
  );
}

export async function findUnidadesAtivasCodigoNomeOrdenadasSelectLean() {
  return Unidade.find({ ativa: true }).select('codigo nome').sort({ nome: 1 }).lean();
}

export async function findUnidadesByCondSelectCodigoNomeOrdenadasLean(cond) {
  return Unidade.find(cond).select('codigo nome').sort({ nome: 1 }).lean();
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
  return Funcionario.find(filtro)
    .select('nome cpf unidade_id funcao_id ativo')
    .populate({ path: 'unidade_id', select: 'nome' })
    .populate({ path: 'funcao_id', select: 'nome' })
    .sort({ nome: 1 })
    .lean();
}

export async function findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLean(unidadeId) {
  return Funcionario.find({
    unidade_id: unidadeId,
    $or: [{ usuario_id: { $exists: false } }, { usuario_id: null }],
  })
    .select('_id nome cpf')
    .sort({ nome: 1 })
    .lean();
}

export async function findFuncionarioByEmail(email) {
  return Funcionario.findOne({ email });
}

export async function findFuncionariosByEmailsSelectEmailNomeLean(emails) {
  return Funcionario.find({ email: { $in: emails } }).select('email nome').lean();
}

export async function createFuncionarioDoc(doc) {
  return Funcionario.create(doc);
}

export async function saveFuncionario(doc) {
  return doc.save();
}

export async function findFuncionarioById(id) {
  return Funcionario.findById(id);
}

export async function updateFuncionarioByIdWithOps(id, ops) {
  return Funcionario.findByIdAndUpdate(id, ops, { new: true, runValidators: true });
}

export async function findFuncionarioByIdPopulateRefs(id) {
  return Funcionario.findById(id).populate('unidade_id funcao_id departamento');
}

export async function findFuncionarioByIdLean(id) {
  return Funcionario.findById(id).lean();
}

export async function deleteFuncionarioById(id) {
  return Funcionario.findByIdAndDelete(id);
}

export async function findFuncionariosDisponiveisByUnidadeLean(unidadeId) {
  return Funcionario.find({
    unidade_id: unidadeId,
    $or: [{ usuario_id: { $exists: false } }, { usuario_id: null }],
  }).select('_id nome cpf').sort({ nome: 1 }).lean();
}

export async function findFuncionarioByIdSelectBasicLean(id) {
  return Funcionario.findById(id).select('_id nome cpf unidade_id').lean();
}

export async function findFuncionarioByCpfAndUnidadeSelectLean(cpf, unidadeId) {
  return Funcionario.findOne({ cpf, unidade_id: unidadeId }).select('_id nome cpf email unidade_id usuario_id').lean();
}

export async function findFuncionarioByEmailSelectLean(email) {
  return Funcionario.findOne({ email }).select('_id nome cpf email unidade_id usuario_id').lean();
}

export async function findUserByEmail(email) {
  return findUserByEmailRepo({ unitScope: null, email });
}

export async function findUserByFuncionarioId(funcionarioId) {
  return findUserByFuncionarioIdRepo({ unitScope: null, funcionarioId });
}

export async function findUnidadesByCondLeanFull(cond) {
  return Unidade.find(cond).lean();
}

export async function findUltimaUnidadePorCodigo() {
  return Unidade.findOne().sort({ codigo: -1 });
}

export async function findUnidadeByCodigo(codigo) {
  return Unidade.findOne({ codigo });
}

export async function findUnidadeByCpf(cpf) {
  return Unidade.findOne({ cpf });
}

export async function findUnidadeByCnpj(cnpj) {
  return Unidade.findOne({ cnpj });
}

export async function findSubunidadesByUnidadePrincipal(unidadePrincipalId) {
  return Unidade.find({ unidade_principal_id: unidadePrincipalId, is_principal: false });
}

export async function createUnidadeDoc(data) {
  return new Unidade(data);
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
  return Unidade.findOne({ cpf, _id: { $ne: unidadeId } });
}

export async function findUnidadeByCnpjExcludingId(cnpj, unidadeId) {
  return Unidade.findOne({ cnpj, _id: { $ne: unidadeId } });
}

export async function updateUnidadeByIdWithValidators(unidadeId, updated) {
  return updateUnidadeByIdWithValidatorsRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
    updated,
  });
}

export async function findUnidadesPrincipaisByIds(unitIds) {
  return Unidade.find({ _id: { $in: unitIds }, is_principal: true });
}

export async function findUnidadesPrincipais() {
  return Unidade.find({ is_principal: true });
}

export async function findUnidadesPrincipaisLean() {
  return Unidade.find({ is_principal: true }).lean();
}

export async function findUnidadesPrincipaisSelectIdLean() {
  return Unidade.find({ is_principal: true }).select('_id').lean();
}

export async function findUnidadesById(unidadeId) {
  return Unidade.find({ _id: unidadeId });
}

export async function updateManyUnidadesAccessByIds(unitIds, activate) {
  return Unidade.updateMany({ _id: { $in: unitIds } }, { $set: { is_active: activate } });
}

export async function findUnidadesPermitidasByMatrizRef(matrizRef) {
  return Unidade.find({ $or: [{ _id: matrizRef }, { unidade_principal_id: matrizRef }] });
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