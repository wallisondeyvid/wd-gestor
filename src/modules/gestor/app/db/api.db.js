import Unidade from '#models/unidade.js';
import User from '#models/user.js';
import Recurso from '#models/recurso.js';
import Funcao from '#models/funcao.js';
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
  findFuncaoByIdLeanRepo,
  findFuncoesByUnidadeLeanRepo,
} from '#modules/gestor/app/repositories/FuncaoReadRepository.js';
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
  return User.findOne(cond).lean();
}

export async function findUsersLockedAfterSelectLean(agora) {
  return User.find({ lock_until: { $gt: agora } })
    .select('_id email role lock_until failed_login_attempts')
    .lean();
}

export async function findUserByCpfCondLean(cond) {
  return User.findOne(cond).lean();
}

export async function findUserByEmailCondLeanMaxTimeMs(cond, maxTimeMs) {
  return User.findOne(cond).lean().maxTimeMS(maxTimeMs);
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
  return User.findOne(cond);
}

export async function findUsersByQueryLean(query) {
  return User.find(query).lean();
}

export async function findUserDuplicadoByCpfUnidadeExcludingId(userId, cleanCpf, unidadeId) {
  return User.findOne({ _id: { $ne: userId }, cpf: cleanCpf, unidade_id: unidadeId });
}

export async function countUsersMasters() {
  return User.countDocuments({ role: 'master' });
}

export async function findUserByIdSelectAuthLockInfo(id) {
  return User.findById(id).select('_id email failed_login_attempts lock_until role');
}

export async function findUsuariosDiretorAtivosPopulatedLean() {
  return User.find({ ativo: true, role: 'diretor' })
    .populate('funcionario_id', 'nome email')
    .lean();
}

export async function findUserById(userId) {
  return User.findById(userId);
}

export async function saveUserDoc(userDoc) {
  return userDoc.save();
}

export async function deleteUserById(userId) {
  return User.deleteOne({ _id: userId });
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
  return Recurso.find(filtro)
    .populate({ path: 'unidade_id', select: 'codigo nome' })
    .sort({ placa: 1 })
    .limit(100)
    .lean();
}

export async function findRecursoByIdComUnidadeNome(id) {
  return Recurso.findById(id).populate('unidade_id', 'nome');
}

export async function findRecursoByPlacaUpper(placaUpper) {
  return Recurso.findOne({ placa: placaUpper });
}

export async function findRecursoByChassiUpper(chassiUpper) {
  return Recurso.findOne({ chassi: chassiUpper });
}

export async function findRecursoByRenavam(renavam) {
  return Recurso.findOne({ renavam });
}

export async function createRecurso(data) {
  return Recurso.create(data);
}

export async function findRecursoById(id) {
  return Recurso.findById(id);
}

export async function findOutroRecursoByPlacaUpper(id, placaUpper) {
  return Recurso.findOne({ placa: placaUpper, _id: { $ne: id } });
}

export async function findOutroRecursoByChassiUpper(id, chassiUpper) {
  return Recurso.findOne({ chassi: chassiUpper, _id: { $ne: id } });
}

export async function findOutroRecursoByRenavam(id, renavam) {
  return Recurso.findOne({ renavam, _id: { $ne: id } });
}

export async function updateRecursoByIdComUnidadeNome(id, data) {
  return Recurso.findByIdAndUpdate(id, data, { new: true }).populate('unidade_id', 'nome');
}

export async function deleteRecursoById(id) {
  return Recurso.findByIdAndDelete(id);
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
  return Funcao.findOne({ nome });
}

export async function createFuncao(payload) {
  return Funcao.create(payload);
}

export async function findFuncaoByIdPopulated(id) {
  return Funcao.findById(id).populate('unidade_principal_id modulos_habilitados');
}

export async function findAllFuncoesPopuladas() {
  return Funcao.find().populate('unidade_principal_id modulos_habilitados');
}

export async function findFuncoesByUnidadePrincipalPopuladas(unidadePrincipalId) {
  return Funcao.find({ unidade_principal_id: unidadePrincipalId }).populate('unidade_principal_id modulos_habilitados');
}

export async function findFuncoesByUnidadePrincipalIdsPopuladas(unidadePrincipalIds) {
  return Funcao.find({ unidade_principal_id: { $in: unidadePrincipalIds } }).populate('unidade_principal_id modulos_habilitados');
}

export async function findFuncaoById(id) {
  return Funcao.findById(id);
}

export async function findOutraFuncaoByNomeExcludingId(id, nome) {
  return Funcao.findOne({ nome, _id: { $ne: id } });
}

export async function updateFuncaoById(id, updates) {
  return Funcao.findByIdAndUpdate(id, updates, { runValidators: true });
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
  return Funcao.find(filtro).lean();
}

export async function findFuncoesByFiltroSelectLean(filtro) {
  return Funcao.find(filtro).select('codigo nome descricao').lean();
}

export async function deleteFuncaoById(id) {
  return Funcao.findByIdAndDelete(id);
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
  return Funcao.find({ ativa: true }).select('nome').sort({ nome: 1 }).lean();
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
  return User.findOne({ email });
}

export async function findUserByFuncionarioId(funcionarioId) {
  return User.findOne({ funcionario_id: funcionarioId });
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
  return User.findByIdAndUpdate(userId, { unidade_id: unidadeId });
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
  return User.findOne({ role: 'diretor', ativo: true, unidade_id: unidadeId }).select('_id');
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