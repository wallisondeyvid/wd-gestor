import { getConnectionForUnit } from '#shared/db/connectionFactory.js';

const UNIT_DATABASE_REGISTRY_COLLECTION = 'unit_database_registry';

function normalizeRegistryDocument(document) {
  if (!document) return null;

  const routingMode = String(document?.routingMode || '').trim();

  return {
    unidadeId: document.unidadeId,
    dbName: document.dbName,
    databaseKey: document.databaseKey,
    ...(routingMode ? { routingMode } : {}),
    readiness: {
      ready: document?.readiness?.ready === true,
    },
    activation: {
      active: document?.activation?.active === true,
    },
    updatedAt: document.updatedAt ?? null,
  };
}

export async function readUnitDatabaseRegistryFromBase({ unidadeId, connection } = {}) {
  const normalizedUnidadeId = String(unidadeId || '').trim();
  if (!normalizedUnidadeId) {
    throw new TypeError('UNIDADE_ID_REQUIRED');
  }

  const targetConnection = connection || getConnectionForUnit(null);
  const collection = targetConnection?.db?.collection(UNIT_DATABASE_REGISTRY_COLLECTION);
  const document = await collection.findOne({ unidadeId: normalizedUnidadeId });
  return normalizeRegistryDocument(document);
}