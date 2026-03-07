const ESCALAS_BOOTSTRAP_COLLECTION = '__mod_escalas_bootstrap';
const ESCALAS_BOOTSTRAP_MARKER_KEY = 'module_escalas_ready';
const ESCALAS_BOOTSTRAP_INDEX_NAME = 'uk_key';
const ESCALAS_DOMAIN_COLLECTION = 'escalas_cadastros';
const ESCALAS_DOMAIN_INDEX_NAME = 'uk_key';
const ESCALAS_DOMAIN_SCHEMA_VERSION = 1;

const ESCALAS_BASE_CADASTROS = Object.freeze([
  {
    key: 'status_escala',
    label: 'Status de Escala',
    payload: {
      values: ['rascunho', 'validada', 'fechada'],
    },
  },
  {
    key: 'classificacoes_escala',
    label: 'Classificacoes de Escala',
    payload: {
      values: ['ORDINARIA', 'EXTRAORDINARIA', 'ordinaria'],
    },
  },
  {
    key: 'tipos_refeicao',
    label: 'Tipos de Refeicao',
    payload: {
      values: ['ALMOCO', 'JANTAR', 'LANCHE', 'PAUSA'],
    },
  },
  {
    key: 'contextos_log_escala',
    label: 'Contextos de Log de Escala',
    payload: {
      values: ['atribuicao', 'alocacao_recurso', 'alocacao_equipe'],
    },
  },
  {
    key: 'acoes_log_escala',
    label: 'Acoes de Log de Escala',
    payload: {
      values: ['INSERCAO', 'EXCLUSAO', 'MUDANCA'],
    },
  },
  {
    key: 'modelo_schema_escala',
    label: 'Modelo de Persistencia da Escala',
    payload: {
      schemaVersion: 2,
      model: 'nested-recursos-em-equipes',
      features: ['grupos_turnos', 'equipes', 'alocacao', 'desbloqueios'],
    },
  },
]);

export async function bootstrapEscalasModule({ unidadeId, dbName, repository }) {
  const now = new Date();

  await repository.ensureTenantProvisioningCollection({
    unidadeId,
    collectionName: ESCALAS_DOMAIN_COLLECTION,
  });

  await repository.ensureTenantProvisioningIndex({
    unidadeId,
    collectionName: ESCALAS_DOMAIN_COLLECTION,
    indexSpec: { key: 1 },
    indexOptions: { unique: true, name: ESCALAS_DOMAIN_INDEX_NAME },
  });

  const seededCadastroKeys = [];
  for (const cadastro of ESCALAS_BASE_CADASTROS) {
    await repository.upsertTenantDocumentByKey({
      unidadeId,
      collectionName: ESCALAS_DOMAIN_COLLECTION,
      keyField: 'key',
      keyValue: cadastro.key,
      setFields: {
        dbName,
        module: 'escalas',
        label: cadastro.label,
        payload: cadastro.payload,
        active: true,
        schemaVersion: ESCALAS_DOMAIN_SCHEMA_VERSION,
        source: 'bootstrap_escalas_v1',
      },
      setOnInsertFields: {
        createdBy: 'unit_provisioning',
      },
      now,
    });

    seededCadastroKeys.push(cadastro.key);
  }

  await repository.ensureTenantProvisioningCollection({
    unidadeId,
    collectionName: ESCALAS_BOOTSTRAP_COLLECTION,
  });

  await repository.ensureTenantProvisioningIndex({
    unidadeId,
    collectionName: ESCALAS_BOOTSTRAP_COLLECTION,
    indexSpec: { key: 1 },
    indexOptions: { unique: true, name: ESCALAS_BOOTSTRAP_INDEX_NAME },
  });

  await repository.upsertTenantProvisioningMarker({
    unidadeId,
    collectionName: ESCALAS_BOOTSTRAP_COLLECTION,
    markerKey: ESCALAS_BOOTSTRAP_MARKER_KEY,
    dbName,
    now,
  });

  return {
    module: 'escalas',
    ok: true,
    collection: ESCALAS_BOOTSTRAP_COLLECTION,
    markerKey: ESCALAS_BOOTSTRAP_MARKER_KEY,
    indexName: ESCALAS_BOOTSTRAP_INDEX_NAME,
    domainCollection: ESCALAS_DOMAIN_COLLECTION,
    domainIndexName: ESCALAS_DOMAIN_INDEX_NAME,
    domainSeededKeys: seededCadastroKeys,
    domainSchemaVersion: ESCALAS_DOMAIN_SCHEMA_VERSION,
  };
}

export default bootstrapEscalasModule;
