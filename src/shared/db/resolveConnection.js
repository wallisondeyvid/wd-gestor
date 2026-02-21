import { getConnectionForUnit } from '#shared/db/connectionFactory.js';

export function resolveConnection(unitScope) {
  const unidadeId = unitScope?.unit?.unidadeId;
  return getConnectionForUnit(unidadeId);
}
