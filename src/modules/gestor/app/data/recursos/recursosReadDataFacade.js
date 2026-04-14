import { findRecursosByFiltroComUnidadeLeanRepo } from '#modules/gestor/app/repositories/RecursoReadRepository.js';
import { scopeFromRecursoListFiltro } from '#modules/gestor/app/data/recursos/recursosScope.js';

export async function findRecursosByFiltroComUnidadeLeanData(filtro) {
  return findRecursosByFiltroComUnidadeLeanRepo({
    unitScope: scopeFromRecursoListFiltro(filtro),
    filtro,
  });
}