import {
  findModuloByIdRepo,
  deleteModuloByIdRepo,
} from '#modules/gestor/app/repositories/ModuloReadRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function deleteModuloByIdService({ moduloId }) {
  const modulo = await findModuloByIdRepo({ unitScope: GLOBAL_SCOPE, id: moduloId });
  if (!modulo) return null;

  await deleteModuloByIdRepo({ unitScope: GLOBAL_SCOPE, id: moduloId });
  return modulo;
}

export default deleteModuloByIdService;