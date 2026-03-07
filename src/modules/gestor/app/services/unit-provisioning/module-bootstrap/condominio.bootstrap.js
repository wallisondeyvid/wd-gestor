const CONDOMINIO_BOOTSTRAP_COLLECTION = '__mod_condominio_bootstrap';
const CONDOMINIO_BOOTSTRAP_MARKER_KEY = 'module_condominio_ready';
const CONDOMINIO_BOOTSTRAP_INDEX_NAME = 'uk_key';

export async function bootstrapCondominioModule({ unidadeId, dbName, repository }) {
  await repository.ensureTenantProvisioningCollection({
    unidadeId,
    collectionName: CONDOMINIO_BOOTSTRAP_COLLECTION,
  });

  await repository.ensureTenantProvisioningIndex({
    unidadeId,
    collectionName: CONDOMINIO_BOOTSTRAP_COLLECTION,
    indexSpec: { key: 1 },
    indexOptions: { unique: true, name: CONDOMINIO_BOOTSTRAP_INDEX_NAME },
  });

  const now = new Date();
  await repository.upsertTenantProvisioningMarker({
    unidadeId,
    collectionName: CONDOMINIO_BOOTSTRAP_COLLECTION,
    markerKey: CONDOMINIO_BOOTSTRAP_MARKER_KEY,
    dbName,
    now,
  });

  return {
    module: 'condominio',
    ok: true,
    collection: CONDOMINIO_BOOTSTRAP_COLLECTION,
    markerKey: CONDOMINIO_BOOTSTRAP_MARKER_KEY,
    indexName: CONDOMINIO_BOOTSTRAP_INDEX_NAME,
  };
}

export default bootstrapCondominioModule;
