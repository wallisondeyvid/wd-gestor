import {
  findModuloById,
  deleteModuloById,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function deleteModuloByIdService({ moduloId }) {
  const modulo = await findModuloById(moduloId);
  if (!modulo) return null;

  await deleteModuloById(moduloId);
  return modulo;
}

export default deleteModuloByIdService;