import { GLOBAL_SCOPE, extractSingleScopedUnitId, scopeFromUnidadeId } from '#modules/gestor/app/data/funcoes/funcoesScope.js';

export { GLOBAL_SCOPE };

export function scopeFromRecursoListFiltro(filtro) {
  if (!filtro || typeof filtro !== 'object' || Array.isArray(filtro)) return GLOBAL_SCOPE;

  const unidadeId = extractSingleScopedUnitId(filtro?.unidade_id);
  return unidadeId ? scopeFromUnidadeId(unidadeId) : GLOBAL_SCOPE;
}