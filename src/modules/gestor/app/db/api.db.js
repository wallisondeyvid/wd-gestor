import Unidade from '#models/unidade.js';

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