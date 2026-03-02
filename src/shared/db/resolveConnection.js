import { getConnectionForUnit } from '#shared/db/connectionFactory.js';

export function resolveConnection(unitScope) {
  const unidadeId =
    unitScope?.unidadeId ??
    unitScope?.unit?.unidadeId ??
    null;

  const isUnitScope =
    unitScope?.type === 'unit' ||
    Boolean(unitScope?.unit?.unidadeId);

  return getConnectionForUnit(isUnitScope ? unidadeId : null);
}
