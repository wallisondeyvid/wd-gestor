import { getModel } from '#shared/db/modelRegistry.js';
import { resolveConnection } from '#shared/db/resolveConnection.js';

export function resolveModel({ name, schema, unitScope }) {
  const connection = resolveConnection(unitScope);
  return getModel(name, schema, connection);
}
