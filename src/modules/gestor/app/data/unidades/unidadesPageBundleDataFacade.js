import { createUnitScope } from '#shared/unitScope.js';
import {
  findAllUnidadesRepo,
  findUnidadesPrincipaisLeanRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import {
  findAllModulosLeanRepo,
  findModulosAtivosStatusLeanRepo,
} from '#modules/gestor/app/repositories/ModuloReadRepository.js';

const GLOBAL_SCOPE = createUnitScope({ unidadeId: null });

export async function findAllUnidades() {
  return findAllUnidadesRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findAllModulosLean() {
  return findAllModulosLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findModulosAtivosStatusLean() {
  return findModulosAtivosStatusLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesPrincipaisLean() {
  return findUnidadesPrincipaisLeanRepo({ unitScope: GLOBAL_SCOPE });
}