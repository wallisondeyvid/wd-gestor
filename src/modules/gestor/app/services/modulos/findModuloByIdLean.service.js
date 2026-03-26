import { createUnitScope } from '#shared/unitScope.js';
import { findModuloByIdLeanRepo } from '#modules/gestor/app/repositories/ModuloReadRepository.js';

const GLOBAL_SCOPE = createUnitScope({});

export async function findModuloByIdLeanService(id) {
  return findModuloByIdLeanRepo({ unitScope: GLOBAL_SCOPE, id });
}

export default findModuloByIdLeanService;