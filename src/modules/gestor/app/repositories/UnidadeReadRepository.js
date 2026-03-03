import Unidade from '#models/unidade.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findUnidadeByIdLeanRepo({ unitScope, unidadeId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findById(unidadeId).lean();
}

export async function findSubunidadesLeanRepo({ unitScope, unidadePrincipalId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ unidade_principal_id: unidadePrincipalId }).lean();
}

export async function findUnidadesByCondLeanRepo({ unitScope, cond }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find(cond).select('_id').lean();
}

export async function findUnidadeByCodigoLeanRepo({ unitScope, codigo }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne({ codigo }).lean();
}

export async function findUnidadeUserBaseLeanRepo({ unitScope, id }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findById(id)
    .select('_id is_principal unidade_principal_id matriz_id')
    .lean();
}

export async function findUnidadeByIdOrRawLeanRepo({ unitScope, filter }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne(filter).lean();
}

export async function findClusterUnidadesByAnchorLeanRepo({ unitScope, conds }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ $or: conds }).lean();
}

export async function findAllUnidadesLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({}).lean();
}

export async function findAllUnidadesSelectIdCodigoNomeLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find().select('_id codigo nome').lean();
}

export async function findAllUnidadesRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find();
}

export async function findUnidadesByMatrizOuPrincipalRepo({ unitScope, matrizRef }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ $or: [{ _id: matrizRef }, { unidade_principal_id: matrizRef }] });
}

export async function findUnidadesAtivasStatusLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ status: 'ativo' }).lean();
}

export async function findUnidadePrincipalLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne({ is_principal: true }).lean();
}

export async function findUnidadeByIdWithModulosAcessiveisLeanRepo({ unitScope, unidadeId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findById(unidadeId).populate('modulosAcessiveis').lean();
}

export async function findUnidadeByIdRepo({ unitScope, setorUnidadeId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findById(setorUnidadeId);
}

export async function findUnidadeUserBaseSetorLeanRepo({ unitScope, id }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findById(id)
    .select('_id is_principal unidade_principal_id')
    .lean();
}

export async function findUnidadesAtivasNomeCodigoOrdenadasLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ ativa: true }).select('nome codigo').sort({ nome: 1 }).lean();
}

export async function findUnidadesByIdsNomeCodigoLeanRepo({ unitScope, unidadeIds }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ _id: { $in: unidadeIds } }).select('nome codigo').lean();
}

export async function findUnidadesForSetorPageSelectLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find().select('_id id codigo nome is_principal unidade_principal_id').lean();
}

export async function findUnidadesForSetorPageByCondSelectLeanRepo({ unitScope, cond }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find(cond).select('_id id codigo nome is_principal unidade_principal_id').lean();
}

export async function findUnidadesForSetorPageByIdsSelectLeanRepo({ unitScope, unidadeIds }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ _id: { $in: unidadeIds } }).select('_id id codigo nome is_principal unidade_principal_id').lean();
}

export async function findUnidadeByIdWithModulosAcessiveisRepo({ unitScope, id }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findById(id).populate('modulosAcessiveis');
}

export async function findUnidadesAtivasCodigoNomeOrdenadasSelectLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ ativa: true }).select('codigo nome').sort({ nome: 1 }).lean();
}

export async function findUnidadesByCondSelectCodigoNomeOrdenadasLeanRepo({ unitScope, cond }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find(cond).select('codigo nome').sort({ nome: 1 }).lean();
}

export async function findUnidadesByCondLeanFullRepo({ unitScope, cond }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find(cond).lean();
}

export async function findUltimaUnidadePorCodigoRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne().sort({ codigo: -1 });
}

export async function findUnidadeByCodigoRepo({ unitScope, codigo }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne({ codigo });
}

export async function findUnidadeByCpfRepo({ unitScope, cpf }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne({ cpf });
}

export async function findUnidadeByCnpjRepo({ unitScope, cnpj }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne({ cnpj });
}

export async function findSubunidadesByUnidadePrincipalRepo({ unitScope, unidadePrincipalId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ unidade_principal_id: unidadePrincipalId, is_principal: false });
}

export async function createUnidadeDocRepo({ unitScope, data }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return new UnidadeModel(data);
}

export async function findUnidadeByCpfExcludingIdRepo({ unitScope, cpf, unidadeId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne({ cpf, _id: { $ne: unidadeId } });
}

export async function findUnidadeByCnpjExcludingIdRepo({ unitScope, cnpj, unidadeId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne({ cnpj, _id: { $ne: unidadeId } });
}

export async function findUnidadesPrincipaisByIdsRepo({ unitScope, unitIds }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ _id: { $in: unitIds }, is_principal: true });
}

export async function findUnidadesPrincipaisRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ is_principal: true });
}

export async function findUnidadesPrincipaisLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ is_principal: true }).lean();
}

export async function findUnidadesPrincipaisSelectIdLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ is_principal: true }).select('_id').lean();
}

export async function findUnidadesByIdRepo({ unitScope, unidadeId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ _id: unidadeId });
}

export async function updateManyUnidadesAccessByIdsRepo({ unitScope, unitIds, activate }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.updateMany({ _id: { $in: unitIds } }, { $set: { is_active: activate } });
}

export async function findUnidadesPermitidasByMatrizRefRepo({ unitScope, matrizRef }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ $or: [{ _id: matrizRef }, { unidade_principal_id: matrizRef }] });
}