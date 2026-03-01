import Unidade from '#models/unidade.js';
import User from '#models/user.js';
import Modulo from '#models/modulo.js';
import Recurso from '#models/recurso.js';
import Setor from '#models/setor.js';
import Funcao from '#models/funcao.js';
import Funcionario from '#models/Funcionario.js';
import mongoose from 'mongoose';

export async function findUnidadeByIdLean(id) {
  return Unidade.findById(id).lean();
}

export async function findUnidadeByCodigoLean(codigo) {
  return Unidade.findOne({ codigo }).lean();
}

export async function findUnidadeUserBaseLean(id) {
  return Unidade.findById(id)
    .select('_id is_principal unidade_principal_id matriz_id')
    .lean();
}

export async function findSubunidadesLean(unidadePrincipalId) {
  return Unidade.find({ unidade_principal_id: unidadePrincipalId }).lean();
}

export async function findUnidadesByCondLean(cond) {
  return Unidade.find(cond).select('_id').lean();
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

export async function findUserByCpfCondLean(cond) {
  return User.findOne(cond).lean();
}

export async function findAllUnidadesLean() {
  return Unidade.find({}).lean();
}

export async function findUnidadePrincipalLean() {
  return Unidade.findOne({ is_principal: true }).lean();
}

export async function findUserByEmailCond(cond) {
  return User.findOne(cond);
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
  return Modulo.find({}).select('_id nome descricao status url_base').lean();
}

export async function findAllModulos() {
  return Modulo.find();
}

export async function findUnidadeByIdWithModulosAcessiveisLean(unidadeId) {
  return Unidade.findById(unidadeId).populate('modulosAcessiveis').lean();
}

export async function findModuloByIdLean(id) {
  return Modulo.findById(id).lean();
}

export async function findModuloByNome(nome) {
  return Modulo.findOne({ nome });
}

export async function createModulo(data) {
  return Modulo.create(data);
}

export async function findModuloById(id) {
  return Modulo.findById(id);
}

export async function saveModulo(modulo) {
  return modulo.save();
}

export async function deleteModuloById(id) {
  return Modulo.deleteOne({ _id: id });
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
  return Setor.findOne({ unidade_id: unidadeId, nome_normalizado: nomeNormalizado }).lean();
}

export async function createSetor(data) {
  return Setor.create(data);
}

export async function findSetoresByUnidadeIdPopulateLean(unidadeId) {
  return Setor.find({ unidade_id: unidadeId }).populate('unidade_id').lean();
}

export async function findSetorByIdPopulateUnidade(id) {
  return Setor.findById(id).populate('unidade_id');
}

export async function findSetorById(id) {
  return Setor.findById(id);
}

export async function findSetorDupByNomeNormalizadoExcludingId(setorId, unidadeId, nomeNormalizado) {
  return Setor.findOne({ _id: { $ne: setorId }, unidade_id: unidadeId, nome_normalizado: nomeNormalizado });
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
  return Setor.find(filtro)
    .select('nome descricao unidade_id')
    .populate({ path: 'unidade_id', select: 'nome codigo' })
    .lean();
}

export async function findSetoresAtivosPopulateUnidadeOrdenadosLean(filtroAtivo) {
  return Setor.find(filtroAtivo)
    .select('nome descricao unidade_id')
    .populate({ path: 'unidade_id', select: 'nome codigo' })
    .sort({ nome: 1 })
    .lean();
}

export async function findUnidadesAtivasNomeCodigoOrdenadasLean() {
  return Unidade.find({ ativa: true }).select('nome codigo').sort({ nome: 1 }).lean();
}

export async function findUnidadesByIdsNomeCodigoLean(unidadeIds) {
  return Unidade.find({ _id: { $in: unidadeIds } }).select('nome codigo').lean();
}

export async function findSetorByIdAndDelete(id) {
  return Setor.findByIdAndDelete(id);
}

export async function findCounterSetorCodigoLean() {
  const Counter = mongoose.models._Counter;
  return Counter.findOne({ _id: 'setor_codigo' }).lean();
}

export async function findMaxSetorCodigoLean() {
  return Setor.find({ codigo: { $exists: true } })
    .sort({ codigo: -1 })
    .limit(1)
    .select('codigo')
    .lean();
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
  return Funcao.findById(id).lean();
}

export async function findFuncoesByUnidadeLean(unidadeId) {
  return Funcao.find({ unidade_principal_id: unidadeId }).lean();
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

export async function findUnidadesAtivasCodigoNomeOrdenadasSelectLean() {
  return Unidade.find({ ativa: true }).select('codigo nome').sort({ nome: 1 }).lean();
}

export async function findFuncoesAtivasNomeOrdenadasSelectLean() {
  return Funcao.find({ ativa: true }).select('nome').sort({ nome: 1 }).lean();
}

export async function findSetoresAtivosNomeOrdenadosSelectLean() {
  return Setor.find({ ativo: true }).select('nome').sort({ nome: 1 }).lean();
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
  return Unidade.findByIdAndUpdate(unidadeId, updated, { new: true, runValidators: true });
}

export async function findUnidadesPrincipaisByIds(unitIds) {
  return Unidade.find({ _id: { $in: unitIds }, is_principal: true });
}

export async function findUnidadesPrincipais() {
  return Unidade.find({ is_principal: true });
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
  return Unidade.findByIdAndDelete(unidadeId);
}