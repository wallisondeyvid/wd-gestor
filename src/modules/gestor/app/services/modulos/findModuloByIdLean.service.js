import { findModuloByIdLeanFromDb } from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function findModuloByIdLeanService(id) {
  return findModuloByIdLeanFromDb(id);
}

export default findModuloByIdLeanService;