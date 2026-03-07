const CLINICA_BOOTSTRAP_COLLECTION = '__mod_clinica_bootstrap';
const CLINICA_BOOTSTRAP_MARKER_KEY = 'module_clinica_ready';
const CLINICA_BOOTSTRAP_INDEX_NAME = 'uk_key';
const CLINICA_DOMAIN_COLLECTION = 'clinica_cadastros';
const CLINICA_DOMAIN_INDEX_NAME = 'uk_key';
const CLINICA_DOMAIN_SCHEMA_VERSION = 1;

const CLINICA_BASE_CADASTROS = Object.freeze([
  {
    key: 'empresas',
    label: 'Empresas',
    path: '/empresas',
    payload: {
      entity: 'empresa',
      displayOrder: 10,
      primaryIdentifier: 'cnpj',
      searchFields: ['razaoSocial', 'nomeFantasia', 'cnpj'],
    },
  },
  {
    key: 'pacientes',
    label: 'Pacientes',
    path: '/pacientes',
    payload: {
      entity: 'paciente',
      displayOrder: 20,
      primaryIdentifier: 'cpf',
      searchFields: ['nome', 'cpf', 'telefone'],
    },
  },
  {
    key: 'profissionais',
    label: 'Profissionais de Saude',
    path: '/profissionais',
    payload: {
      entity: 'profissional',
      displayOrder: 30,
      primaryIdentifier: 'registroConselho',
      searchFields: ['nome', 'cpf', 'registroConselho'],
    },
  },
  {
    key: 'planos',
    label: 'Planos e Convenios',
    path: '/planos',
    payload: {
      entity: 'plano',
      displayOrder: 40,
      primaryIdentifier: 'codigoPlano',
      searchFields: ['nome', 'codigoPlano', 'convenio'],
    },
  },
  {
    key: 'procedimentos',
    label: 'Procedimentos e Exames',
    path: '/procedimentos',
    payload: {
      entity: 'procedimento',
      displayOrder: 50,
      primaryIdentifier: 'codigo',
      searchFields: ['descricao', 'codigo', 'tipo'],
    },
  },
]);

export async function bootstrapClinicaModule({ unidadeId, dbName, repository }) {
  const now = new Date();

  await repository.ensureTenantProvisioningCollection({
    unidadeId,
    collectionName: CLINICA_DOMAIN_COLLECTION,
  });

  await repository.ensureTenantProvisioningIndex({
    unidadeId,
    collectionName: CLINICA_DOMAIN_COLLECTION,
    indexSpec: { key: 1 },
    indexOptions: { unique: true, name: CLINICA_DOMAIN_INDEX_NAME },
  });

  const seededCadastroKeys = [];
  for (const cadastro of CLINICA_BASE_CADASTROS) {
    await repository.upsertTenantDocumentByKey({
      unidadeId,
      collectionName: CLINICA_DOMAIN_COLLECTION,
      keyField: 'key',
      keyValue: cadastro.key,
      setFields: {
        dbName,
        module: 'clinica',
        label: cadastro.label,
        path: cadastro.path,
        payload: cadastro.payload,
        active: true,
        schemaVersion: CLINICA_DOMAIN_SCHEMA_VERSION,
        source: 'bootstrap_clinica_v1',
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
    collectionName: CLINICA_BOOTSTRAP_COLLECTION,
  });

  await repository.ensureTenantProvisioningIndex({
    unidadeId,
    collectionName: CLINICA_BOOTSTRAP_COLLECTION,
    indexSpec: { key: 1 },
    indexOptions: { unique: true, name: CLINICA_BOOTSTRAP_INDEX_NAME },
  });

  await repository.upsertTenantProvisioningMarker({
    unidadeId,
    collectionName: CLINICA_BOOTSTRAP_COLLECTION,
    markerKey: CLINICA_BOOTSTRAP_MARKER_KEY,
    dbName,
    now,
  });

  return {
    module: 'clinica',
    ok: true,
    collection: CLINICA_BOOTSTRAP_COLLECTION,
    markerKey: CLINICA_BOOTSTRAP_MARKER_KEY,
    indexName: CLINICA_BOOTSTRAP_INDEX_NAME,
    domainCollection: CLINICA_DOMAIN_COLLECTION,
    domainIndexName: CLINICA_DOMAIN_INDEX_NAME,
    domainSeededKeys: seededCadastroKeys,
    domainSchemaVersion: CLINICA_DOMAIN_SCHEMA_VERSION,
  };
}

export default bootstrapClinicaModule;
