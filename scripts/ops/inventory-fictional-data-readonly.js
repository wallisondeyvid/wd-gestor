import { pathToFileURL } from 'node:url';

const SCRIPT_NAME = 'inventory-fictional-data-readonly';
const SCRIPT_PATH = 'scripts/ops/inventory-fictional-data-readonly.js';
const SCRIPT_STATUS = 'skeletonOnly';
const SCRIPT_OBJECTIVE = [
  'Inventariar dados ficticios do WD Gestor em modo somente leitura.',
  'Gerar relatorio local sem alterar banco.',
  'Bloquear qualquer implementacao de conexao/leitura ate microcorte futuro.',
];

const CONCEPTUAL_ALLOWLIST = [
  'countDocuments',
  'find com projection',
  'distinct',
  'aggregate sem $out e sem $merge',
  'sort',
  'limit',
  'validacoes em memoria',
  'escrita apenas de arquivo local de relatorio, se aprovada futuramente',
];

const CONCEPTUAL_BLOCKLIST = [
  'insert',
  'update',
  'updateOne',
  'updateMany',
  'replaceOne',
  'delete',
  'deleteOne',
  'deleteMany',
  'remove',
  'drop',
  'dropDatabase',
  'dropIndex',
  'createIndex',
  'bulkWrite',
  'save',
  'seed',
  'migration',
  'backfill',
  'mongoose.connect',
  'connectMongo',
];

const TARGET_ENTITIES = [
  'usuarios',
  'memberships',
  'unidades',
  'funcionarios',
  'setores',
  'funcoes',
  'modulos',
  'recursos',
  'feedback',
  'widget/dashboard',
  'provisioning/status/events',
  'seeds/dados de teste',
  'anexos/metadados',
];

const REQUIRED_FUTURE_FLAGS = {
  WD_OPS_READONLY_CONFIRM: 'pending',
  WD_OPS_ENVIRONMENT_CONFIRM: 'pending',
  WD_OPS_DATABASE_CONFIRM: 'pending',
  WD_OPS_DATABASE_TARGET: 'pending',
  WD_OPS_ATLAS_EXPLICIT_APPROVAL: 'pending',
};

const FUTURE_REPORT_LOCATION = 'docs/runbooks/generated';

const MASKING_RULES = [
  'Mascarar URI',
  'Mascarar emails',
  'Mascarar CPF',
  'Mascarar tokens',
  'Nao imprimir senha ou hash',
  'Nao imprimir variaveis de ambiente completas',
  'Nao imprimir anexos brutos',
  'Limitar amostras',
];

const COMMON_SENSITIVE_FIELDS = [
  'senha',
  'password',
  'hash',
  'token',
  'cpf',
  'email',
  'anexos brutos',
  'biometria',
  'URI',
  'connection string',
  'env completa',
];

const INVENTORY_ENTITY_MANIFEST = [
  {
    key: 'users',
    label: 'Usuarios',
    conceptualCollection: 'users',
    projectionFields: ['_id', 'email', 'nome', 'role', 'global_role', 'unidade_id', 'funcionario_id', 'ativo', 'primeiro_acesso', 'failed_login_attempts', 'lock_until', 'createdAt', 'updatedAt'],
    sensitiveFields: ['email', 'senha', 'password', 'hash', 'token'],
    maskedFields: ['email', 'nome'],
    relationChecks: ['unidade_id -> unidades._id', 'funcionario_id -> funcionarios._id'],
    duplicateChecks: [],
    notes: ['Nome deve aparecer apenas de forma parcial.', 'Lock status deve ser tratado sem expor segredo.'],
  },
  {
    key: 'userMemberships',
    label: 'Memberships',
    conceptualCollection: 'userMemberships',
    projectionFields: ['_id', 'user_id', 'unidade_id', 'papel_contextual', 'status', 'funcionario_id', 'origem', 'createdAt', 'updatedAt'],
    sensitiveFields: [],
    maskedFields: [],
    relationChecks: ['user_id -> users._id', 'unidade_id -> unidades._id', 'funcionario_id -> funcionarios._id'],
    duplicateChecks: ['user_id + unidade_id'],
    notes: ['Usar para detectar vinculos duplicados e orfaos.'],
  },
  {
    key: 'unidades',
    label: 'Unidades',
    conceptualCollection: 'unidades',
    projectionFields: ['_id', 'codigo', 'nome', 'ativa', 'is_principal', 'subunidade', 'unidade_principal_id', 'modulosAcessiveis', 'diretor_usuario_id'],
    sensitiveFields: [],
    maskedFields: ['nome'],
    relationChecks: ['unidade_principal_id -> unidades._id', 'diretor_usuario_id -> users._id'],
    duplicateChecks: [],
    notes: ['Nome deve ser parcial quando exibido em relatorio futuro.'],
  },
  {
    key: 'funcionarios',
    label: 'Funcionarios',
    conceptualCollection: 'funcionarios',
    projectionFields: ['_id', 'codigo', 'nome', 'cpf', 'email', 'unidade_id', 'funcao_id', 'usuario_id', 'ativo', 'createdAt', 'updatedAt'],
    sensitiveFields: ['cpf', 'email', 'biometria'],
    maskedFields: ['cpf', 'email', 'nome'],
    relationChecks: ['unidade_id -> unidades._id', 'funcao_id -> funcoes._id', 'usuario_id -> users._id'],
    duplicateChecks: ['unidade_id + cpf', 'unidade_id + email'],
    notes: ['Biometrias nunca devem aparecer no relatorio.'],
  },
  {
    key: 'setores',
    label: 'Setores',
    conceptualCollection: 'setores',
    projectionFields: ['_id', 'codigo', 'nome', 'nome_normalizado', 'ativo', 'unidade_id'],
    sensitiveFields: [],
    maskedFields: [],
    relationChecks: ['unidade_id -> unidades._id'],
    duplicateChecks: ['unidade_id + nome_normalizado'],
    notes: ['Nome normalizado serve para detectar duplicidade.'],
  },
  {
    key: 'funcoes',
    label: 'Funcoes',
    conceptualCollection: 'funcoes',
    projectionFields: ['_id', 'codigo', 'nome', 'ativa', 'unidade_principal_id', 'modulos_habilitados'],
    sensitiveFields: [],
    maskedFields: [],
    relationChecks: ['unidade_principal_id -> unidades._id'],
    duplicateChecks: [],
    notes: ['Serve como referencia para funcionarios e habilitacao funcional.'],
  },
  {
    key: 'modulos',
    label: 'Modulos',
    conceptualCollection: 'modulos',
    projectionFields: ['_id', 'nome', 'status', 'url_base'],
    sensitiveFields: [],
    maskedFields: [],
    relationChecks: [],
    duplicateChecks: [],
    notes: ['Url_base pode ser exibida como metadata funcional.'],
  },
  {
    key: 'recursos',
    label: 'Recursos',
    conceptualCollection: 'recursos',
    projectionFields: ['_id', 'unidade_id', 'tipo', 'placa', 'chassi', 'renavam', 'marca', 'modelo', 'ativo'],
    sensitiveFields: ['placa', 'chassi', 'renavam'],
    maskedFields: ['placa', 'chassi', 'renavam'],
    relationChecks: ['unidade_id -> unidades._id'],
    duplicateChecks: ['unidade_id + placa', 'unidade_id + chassi', 'unidade_id + renavam'],
    notes: ['Identificadores devem ser exibidos apenas parcialmente.'],
  },
  {
    key: 'feedback',
    label: 'Feedback',
    conceptualCollection: 'feedback',
    projectionFields: ['_id', 'tipo', 'status', 'unidade_id', 'criadoPor.userId', 'criadoPor.email', 'origem.modulo', 'anexos', 'createdAt', 'updatedAt'],
    sensitiveFields: ['criadoPor.email', 'anexos brutos'],
    maskedFields: ['criadoPor.email'],
    relationChecks: ['unidade_id -> unidades._id', 'criadoPor.userId -> users._id'],
    duplicateChecks: [],
    notes: ['Anexos devem virar apenas metadados, nunca conteudo bruto.'],
  },
  {
    key: 'widgetSettings',
    label: 'Widget Settings',
    conceptualCollection: 'widgetSettings',
    projectionFields: ['_id', 'widget', 'module', 'enabled', 'createdAt', 'updatedAt'],
    sensitiveFields: [],
    maskedFields: [],
    relationChecks: [],
    duplicateChecks: ['widget + module'],
    notes: ['Serve para detectar configuracoes duplicadas.'],
  },
  {
    key: 'unitProvisioningStatus',
    label: 'Provisioning Status',
    conceptualCollection: 'unitProvisioningStatus',
    projectionFields: ['unidadeId', 'status', 'operation', 'scope', 'moduleKey', 'moduleStatuses', 'lastProvisioningError', 'createdAt', 'updatedAt'],
    sensitiveFields: ['lastProvisioningError'],
    maskedFields: ['lastProvisioningError'],
    relationChecks: ['unidadeId -> unidades._id'],
    duplicateChecks: [],
    notes: ['Erros devem ser resumidos, nunca expostos integralmente.'],
  },
  {
    key: 'unitProvisioningEvents',
    label: 'Provisioning Events',
    conceptualCollection: 'unitProvisioningEvents',
    projectionFields: ['unidadeId', 'status', 'operation', 'scope', 'moduleKey', 'moduleStatuses', 'lastProvisioningError', 'createdAt', 'updatedAt'],
    sensitiveFields: ['lastProvisioningError'],
    maskedFields: ['lastProvisioningError'],
    relationChecks: ['unidadeId -> unidades._id'],
    duplicateChecks: [],
    notes: ['Eventos devem permanecer resumidos e sem payload bruto.'],
  },
  {
    key: 'testSeeds',
    label: 'Test Seeds',
    conceptualCollection: 'gestor-seeds',
    projectionFields: ['markers', 'origem', 'email', 'createdAt', 'updatedAt'],
    sensitiveFields: ['email'],
    maskedFields: ['email'],
    relationChecks: [],
    duplicateChecks: [],
    notes: ['Marcadores textuais ajudam a classificar dados ficticios.'],
  },
  {
    key: 'attachmentsMetadata',
    label: 'Attachments Metadata',
    conceptualCollection: 'attachments-metadata',
    projectionFields: ['filename', 'mime', 'size', 'ownerRefs', 'createdAt', 'updatedAt'],
    sensitiveFields: ['filename', 'ownerRefs', 'anexos brutos'],
    maskedFields: ['filename'],
    relationChecks: ['ownerRefs -> users._id ou entidades relacionadas'],
    duplicateChecks: [],
    notes: ['Somente metadados; conteudo bruto permanece fora de escopo.'],
  },
];

function describeFutureFlagStatus(value) {
  return value ? 'present-but-not-used' : 'missing';
}

export function normalizeBooleanFlag(value) {
  if (typeof value === 'boolean') {
    return {
      ok: true,
      normalized: value,
      status: value ? 'true' : 'false',
    };
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      normalized: null,
      status: 'missing',
    };
  }

  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return {
      ok: false,
      normalized: null,
      status: 'missing',
    };
  }

  if (['true', '1', 'yes', 'on'].includes(normalizedValue)) {
    return {
      ok: true,
      normalized: true,
      status: 'true',
    };
  }

  if (['false', '0', 'no', 'off'].includes(normalizedValue)) {
    return {
      ok: true,
      normalized: false,
      status: 'false',
    };
  }

  return {
    ok: false,
    normalized: null,
    status: 'invalid',
  };
}

export function validateRequiredFutureFlags(env = {}) {
  const requiredFlags = [
    'WD_OPS_READONLY_CONFIRM',
    'WD_OPS_ENVIRONMENT_CONFIRM',
    'WD_OPS_DATABASE_CONFIRM',
  ];

  const missing = [];
  const invalid = [];
  const details = {};

  for (const flagName of requiredFlags) {
    const result = normalizeBooleanFlag(env[flagName]);
    details[flagName] = result.status;

    if (result.status === 'missing') {
      missing.push(flagName);
      continue;
    }

    if (result.status === 'invalid') {
      invalid.push(flagName);
      continue;
    }

    if (!result.normalized) {
      invalid.push(flagName);
    }
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    status: missing.length > 0 ? 'pending' : invalid.length > 0 ? 'invalid' : 'ready-for-future-review',
    details,
  };
}

export function validateAtlasApproval(env = {}) {
  const atlasRequested = normalizeBooleanFlag(env.WD_OPS_ATLAS_TARGET);
  const atlasApproved = normalizeBooleanFlag(env.WD_OPS_ATLAS_EXPLICIT_APPROVAL);

  if (atlasRequested.ok && atlasRequested.normalized) {
    if (atlasApproved.ok && atlasApproved.normalized) {
      return {
        status: 'allowed',
        reason: 'Atlas marcado e aprovado explicitamente para revisao futura.',
      };
    }

    return {
      status: 'blocked',
      reason: 'Atlas permanece bloqueado sem aprovacao explicita.',
    };
  }

  if (atlasApproved.ok && atlasApproved.normalized) {
    return {
      status: 'pending',
      reason: 'Aprovacao isolada nao habilita Atlas sem marcador de uso futuro.',
    };
  }

  return {
    status: 'pending',
    reason: 'Uso de Atlas nao solicitado neste skeleton.',
  };
}

export function validateDatabaseTarget(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return {
      ok: false,
      status: 'missing',
      sanitized: '[database:missing]',
    };
  }

  const trimmedValue = value.trim();
  const loweredValue = trimmedValue.toLowerCase();
  if (['admin', 'local', 'config'].includes(loweredValue)) {
    return {
      ok: false,
      status: 'blocked',
      sanitized: '[database:blocked]',
    };
  }

  return {
    ok: true,
    status: 'valid',
    sanitized: trimmedValue.slice(0, 32),
  };
}

export function validateOperationAllowlist(operation) {
  const allowedOperations = [
    'countDocuments',
    'find',
    'distinct',
    'aggregate',
    'sort',
    'limit',
    'memoryValidation',
    'localReportWriteFutureApproved',
  ];

  const normalizedOperation = typeof operation === 'string' ? operation.trim() : '';
  return {
    ok: allowedOperations.includes(normalizedOperation),
    status: allowedOperations.includes(normalizedOperation) ? 'allowed' : 'blocked',
    operation: normalizedOperation || '[operation:missing]',
  };
}

export function validateAggregatePipeline(pipeline) {
  if (!Array.isArray(pipeline)) {
    return {
      ok: false,
      status: 'invalid',
      blockedStages: [],
    };
  }

  const blockedStages = [];
  for (const stage of pipeline) {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(stage, '$out')) {
      blockedStages.push('$out');
    }

    if (Object.prototype.hasOwnProperty.call(stage, '$merge')) {
      blockedStages.push('$merge');
    }
  }

  return {
    ok: blockedStages.length === 0,
    status: blockedStages.length === 0 ? 'allowed' : 'blocked',
    blockedStages,
  };
}

export function designReadOnlyConnectionConfig(env = {}) {
  const databaseTarget = validateDatabaseTarget(env.WD_OPS_DATABASE_TARGET);
  const atlasApproval = validateAtlasApproval({
    WD_OPS_ATLAS_TARGET: env.WD_OPS_ATLAS_TARGET,
    WD_OPS_ATLAS_EXPLICIT_APPROVAL: env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
  });
  const maskedUri = maskConnectionString(`mongodb://future-user:future-secret@future-host/${databaseTarget.sanitized}`);

  return {
    mode: 'future-readonly-connection-design',
    connectionImplementation: 'design-only-not-implemented',
    queryExecution: 'blocked-until-separate-query-microcut',
    connectionState: 'not-opened',
    target: {
      databaseStatus: databaseTarget.status,
      databaseLabel: databaseTarget.sanitized,
      atlasTarget: describeFutureFlagStatus(env.WD_OPS_ATLAS_TARGET),
      atlasApproval: atlasApproval.status,
      tenantDbOpenMode: 'manual-only-future-review',
    },
    flags: {
      readOnlyConfirm: describeFutureFlagStatus(env.WD_OPS_READONLY_CONFIRM),
      environmentConfirm: describeFutureFlagStatus(env.WD_OPS_ENVIRONMENT_CONFIRM),
      databaseConfirm: describeFutureFlagStatus(env.WD_OPS_DATABASE_CONFIRM),
      databaseTarget: databaseTarget.status,
      atlasTarget: describeFutureFlagStatus(env.WD_OPS_ATLAS_TARGET),
      atlasExplicitApproval: describeFutureFlagStatus(env.WD_OPS_ATLAS_EXPLICIT_APPROVAL),
    },
    uri: {
      present: false,
      masked: maskedUri,
      source: 'synthetic-placeholder',
      printingRule: 'masked-only',
    },
    allowedFutureHelpers: [
      'validateRequiredFutureFlags',
      'validateAtlasApproval',
      'validateDatabaseTarget',
      'maskConnectionString',
    ],
    notes: [
      'Configuracao declarativa e mascarada.',
      'Nenhuma conexao e aberta neste microcorte.',
      'Nenhuma query pode ser executada junto com a futura conexao.',
      'Este objeto nao representa conexao ativa nem tenant DB aberto.',
    ],
  };
}

export function validateConnectionPreconditions(env = {}) {
  const requiredFlags = validateRequiredFutureFlags({
    WD_OPS_READONLY_CONFIRM: env.WD_OPS_READONLY_CONFIRM,
    WD_OPS_ENVIRONMENT_CONFIRM: env.WD_OPS_ENVIRONMENT_CONFIRM,
    WD_OPS_DATABASE_CONFIRM: env.WD_OPS_DATABASE_CONFIRM,
  });
  const databaseTarget = validateDatabaseTarget(env.WD_OPS_DATABASE_TARGET);
  const atlasApproval = validateAtlasApproval({
    WD_OPS_ATLAS_TARGET: env.WD_OPS_ATLAS_TARGET,
    WD_OPS_ATLAS_EXPLICIT_APPROVAL: env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
  });
  const blockedReasons = [];

  if (!requiredFlags.ok) {
    if (requiredFlags.missing.length > 0) {
      blockedReasons.push(`required-flags-missing:${requiredFlags.missing.join(',')}`);
    }

    if (requiredFlags.invalid.length > 0) {
      blockedReasons.push(`required-flags-invalid:${requiredFlags.invalid.join(',')}`);
    }
  }

  if (!databaseTarget.ok) {
    blockedReasons.push(`database-target:${databaseTarget.status}`);
  }

  if (atlasApproval.status === 'blocked') {
    blockedReasons.push('atlas-approval-missing');
  }

  return {
    ok: blockedReasons.length === 0,
    status: blockedReasons.length === 0 ? 'ready-for-future-connection-review' : 'blocked',
    blockedReasons,
    requiredFlags,
    databaseTarget,
    atlasApproval,
    queryExecution: 'blocked-in-this-microcut',
    connectionExecution: 'blocked-in-this-microcut',
  };
}

export function maskConnectionConfig(config = {}) {
  const safeMaskedValue =
    typeof config?.uri?.masked === 'string' && config.uri.masked.includes('://[masked]@')
      ? config.uri.masked
      : maskConnectionString(typeof config?.uri?.masked === 'string' ? config.uri.masked : '');

  return {
    ...config,
    uri: {
      present: Boolean(config?.uri?.present),
      masked: safeMaskedValue,
      source: config?.uri?.source || 'synthetic-placeholder',
      printingRule: 'masked-only',
    },
  };
}

export function ensureNoWriteOperationsRegistered() {
  return {
    ok: true,
    status: 'write-operations-blocked',
    blockedOperations: [
      'insert',
      'update',
      'updateOne',
      'updateMany',
      'replaceOne',
      'delete',
      'deleteOne',
      'deleteMany',
      'remove',
      'drop',
      'dropDatabase',
      'dropIndex',
      'createIndex',
      'bulkWrite',
      'save',
      'seed',
      'migration',
      'backfill',
    ],
    writeRegistration: 'not-allowed',
  };
}

export function summarizeConnectionDesign(config = {}) {
  const safeConfig = maskConnectionConfig(config);

  return {
    mode: safeConfig.mode || 'future-readonly-connection-design',
    connectionImplementation: safeConfig.connectionImplementation || 'design-only-not-implemented',
    queryExecution: safeConfig.queryExecution || 'blocked-until-separate-query-microcut',
    connectionState: safeConfig.connectionState || 'not-opened',
    databaseStatus: safeConfig?.target?.databaseStatus || 'missing',
    databaseLabel: safeConfig?.target?.databaseLabel || '[database:missing]',
    atlasTarget: safeConfig?.target?.atlasTarget || 'missing',
    atlasApproval: safeConfig?.target?.atlasApproval || 'pending',
    tenantDbOpenMode: safeConfig?.target?.tenantDbOpenMode || 'manual-only-future-review',
    uri: safeConfig.uri,
    allowedFutureHelpers: Array.isArray(safeConfig.allowedFutureHelpers) ? [...safeConfig.allowedFutureHelpers] : [],
  };
}

export function buildEntityManifest() {
  return INVENTORY_ENTITY_MANIFEST.map((entity) => ({
    ...entity,
    projectionFields: [...entity.projectionFields],
    sensitiveFields: [...entity.sensitiveFields],
    maskedFields: [...entity.maskedFields],
    relationChecks: [...entity.relationChecks],
    duplicateChecks: [...entity.duplicateChecks],
    notes: [...entity.notes],
  }));
}

export function listSensitiveFields() {
  return [...new Set([...COMMON_SENSITIVE_FIELDS, ...buildEntityManifest().flatMap((entity) => entity.sensitiveFields)])].sort();
}

export function listRelationChecks() {
  return buildEntityManifest().flatMap((entity) => entity.relationChecks);
}

export function listDuplicateChecks() {
  return buildEntityManifest().flatMap((entity) => entity.duplicateChecks);
}

export function getEntityManifestSummary() {
  const entityManifest = buildEntityManifest();
  return {
    entityCount: entityManifest.length,
    entityKeys: entityManifest.map((entity) => entity.key),
    maskedFieldCount: entityManifest.reduce((total, entity) => total + entity.maskedFields.length, 0),
    sensitiveFields: listSensitiveFields(),
    relationChecks: listRelationChecks(),
    duplicateChecks: listDuplicateChecks(),
  };
}

export function buildCountPlan(entity) {
  return {
    entityKey: entity.key,
    type: 'count',
    operation: 'countDocuments',
    collection: entity.conceptualCollection,
    projectionFields: [],
    notes: ['Plano declarativo de contagem; nao executa banco.'],
  };
}

export function buildSamplePlan(entity) {
  return {
    entityKey: entity.key,
    type: 'sample',
    operation: 'find',
    collection: entity.conceptualCollection,
    projectionFields: [...entity.projectionFields],
    sort: { updatedAt: -1 },
    limit: 5,
    notes: ['Plano declarativo de amostra com projection explicita e limite fixo.'],
  };
}

export function buildDistinctPlan(entity, field) {
  return {
    entityKey: entity.key,
    type: 'distinct',
    operation: 'distinct',
    collection: entity.conceptualCollection,
    field,
    projectionFields: [],
    notes: ['Plano declarativo de distinct; nao executa banco.'],
  };
}

export function validateQueryPlan(plan) {
  const operationValidation = validateOperationAllowlist(plan?.operation);
  const aggregateValidation =
    plan?.operation === 'aggregate' && Array.isArray(plan?.pipeline)
      ? validateAggregatePipeline(plan.pipeline)
      : { ok: true, status: 'not-applicable', blockedStages: [] };
  const hasExplicitProjection =
    plan?.operation === 'find'
      ? Array.isArray(plan.projectionFields) && plan.projectionFields.length > 0
      : true;
  const hasSafeLimit =
    plan?.type === 'sample'
      ? typeof plan.limit === 'number' && plan.limit > 0 && plan.limit <= 10
      : true;

  return {
    entityKey: plan?.entityKey ?? '[entity:missing]',
    operation: plan?.operation ?? '[operation:missing]',
    ok: operationValidation.ok && aggregateValidation.ok && hasExplicitProjection && hasSafeLimit,
    blocked: !operationValidation.ok || !aggregateValidation.ok || !hasExplicitProjection || !hasSafeLimit,
    operationValidation,
    aggregateValidation,
    hasExplicitProjection,
    hasSafeLimit,
  };
}

export function validateAllQueryPlans(plans) {
  return plans.map((plan) => validateQueryPlan(plan));
}

export function summarizeQueryPlans(plans) {
  const validations = validateAllQueryPlans(plans);
  return {
    totalPlans: plans.length,
    operationsUsed: [...new Set(plans.map((plan) => plan.operation))].sort(),
    entitiesCovered: [...new Set(plans.map((plan) => plan.entityKey))].sort(),
    blockedPlans: validations.filter((validation) => validation.blocked).map((validation) => ({
      entityKey: validation.entityKey,
      operation: validation.operation,
    })),
    executionPerformed: false,
  };
}

export function buildReadOnlyQueryPlan(entityManifest) {
  const plans = [];

  for (const entity of entityManifest) {
    plans.push(buildCountPlan(entity));
    plans.push(buildSamplePlan(entity));

    const firstMaskedField = entity.maskedFields[0];
    if (firstMaskedField) {
      plans.push(buildDistinctPlan(entity, firstMaskedField));
    }

    if (entity.duplicateChecks.length > 0) {
      plans.push({
        entityKey: entity.key,
        type: 'duplicate-check',
        operation: 'aggregate',
        collection: entity.conceptualCollection,
        projectionFields: [],
        duplicateKeys: [...entity.duplicateChecks],
        plannedOperation: 'aggregate',
        pipelinePreview: 'blocked-until-query-implementation',
        notes: ['Plano declarativo de validacao de duplicidade; nao executa banco.', 'Pipeline real permanece bloqueado ate microcorte proprio.'],
      });
    }
  }

  return plans;
}

export function buildValidationSummary(env = {}) {
  const requiredFlags = validateRequiredFutureFlags({
    WD_OPS_READONLY_CONFIRM: env.WD_OPS_READONLY_CONFIRM,
    WD_OPS_ENVIRONMENT_CONFIRM: env.WD_OPS_ENVIRONMENT_CONFIRM,
    WD_OPS_DATABASE_CONFIRM: env.WD_OPS_DATABASE_CONFIRM,
  });
  const atlasApproval = validateAtlasApproval({
    WD_OPS_ATLAS_TARGET: env.WD_OPS_ATLAS_TARGET,
    WD_OPS_ATLAS_EXPLICIT_APPROVAL: env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
  });
  const databaseTarget = validateDatabaseTarget(env.WD_OPS_DATABASE_TARGET);
  const operationChecks = [
    validateOperationAllowlist('countDocuments'),
    validateOperationAllowlist('aggregate'),
    validateOperationAllowlist('updateMany'),
  ];
  const aggregatePipeline = validateAggregatePipeline([{ $match: { active: true } }, { $merge: 'unsafe' }]);

  return {
    requiredFlags,
    atlasApproval,
    databaseTarget,
    operationChecks,
    aggregatePipeline,
    status:
      requiredFlags.ok && atlasApproval.status !== 'blocked' && databaseTarget.ok
        ? 'future-validation-ready'
        : 'future-validation-pending',
  };
}

export function maskConnectionString(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '[masked:empty]';
  }

  if (value.includes('://[masked]@')) {
    return value;
  }

  const protocolSplit = value.split('://');
  if (protocolSplit.length < 2) {
    return '[masked:invalid-connection-string]';
  }

  const protocol = protocolSplit[0];
  const remainder = protocolSplit.slice(1).join('://');
  const atIndex = remainder.lastIndexOf('@');
  const hostPart = atIndex >= 0 ? remainder.slice(atIndex + 1) : remainder;
  const safeHost = hostPart.length > 48 ? hostPart.slice(0, 48) + '...' : hostPart;
  return protocol + '://[masked]@' + safeHost;
}

export function maskEmail(value) {
  if (typeof value !== 'string' || !value.includes('@')) {
    return '[masked:invalid-email]';
  }

  const [localPart, domain] = value.split('@');
  const localPrefix = localPart.slice(0, 1) || '*';
  return localPrefix + '***@' + domain;
}

export function maskCpf(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 11) {
    return '[masked:invalid-cpf]';
  }

  return digits.slice(0, 3) + '.***.***-' + digits.slice(-2);
}

export function maskReportSensitiveValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => maskReportSensitiveValues(item));
  }

  if (value && typeof value === 'object') {
    const maskedObject = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const loweredKey = key.toLowerCase();

      if (loweredKey === 'cpf') {
        maskedObject[key] = maskCpf(nestedValue);
        continue;
      }

      if (loweredKey === 'email') {
        maskedObject[key] = maskEmail(nestedValue);
        continue;
      }

      if (['senha', 'password', 'hash', 'token', 'uri', 'connection string', 'connectionstring', 'env completa', 'anexos brutos'].includes(loweredKey)) {
        maskedObject[key] = '[masked:sensitive-field]';
        continue;
      }

      maskedObject[key] = maskReportSensitiveValues(nestedValue);
    }

    return maskedObject;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const loweredValue = value.toLowerCase();
  if (loweredValue.includes('mongodb://') || loweredValue.includes('mongodb+srv://')) {
    return maskConnectionString(value);
  }

  if (value.includes('@')) {
    return maskEmail(value);
  }

  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return maskCpf(value);
  }

  if (['senha', 'password', 'hash', 'token', 'env completa', 'anexos brutos', 'connection string'].includes(loweredValue)) {
    return '[masked:sensitive-value]';
  }

  return value;
}

export function validateReportOutputPath(path) {
  if (typeof path !== 'string' || path.trim() === '') {
    return {
      ok: false,
      status: 'missing',
      normalizedPath: '[report-path:missing]',
    };
  }

  const normalizedPath = path.trim().replace(/\\/g, '/');
  const allowedPrefixes = ['docs/runbooks/generated', 'ops/generated'];
  const isAllowed = allowedPrefixes.some((prefix) => normalizedPath.startsWith(prefix));

  return {
    ok: isAllowed,
    status: isAllowed ? 'allowed-conceptual-path' : 'blocked-path',
    normalizedPath,
  };
}

export function buildReportMetadata(context = {}) {
  const outputPathValidation = validateReportOutputPath(context.outputPath || FUTURE_REPORT_LOCATION);

  return {
    title: 'Inventario read-only do WD Gestor',
    mode: 'future-report-design',
    reportKind: 'local-readonly-report',
    reportGenerated: false,
    writePerformed: false,
    timestamp: context.timestamp || 'pending-future-execution-time',
    environment: maskReportSensitiveValues(context.environment || {
      environment: 'pending-future-environment',
      databaseTarget: context.databaseTarget || '[database:missing]',
    }),
    outputPath: outputPathValidation.normalizedPath,
    outputPathStatus: outputPathValidation.status,
    notes: [
      'Metadados declarativos apenas.',
      'Nenhum arquivo e gerado neste microcorte.',
      'Nenhuma alteracao e feita no banco.',
    ],
  };
}

export function buildReportSections(inventoryData = {}) {
  const sections = [
    {
      key: 'entity-summary',
      title: 'Resumo de entidades',
      content: maskReportSensitiveValues(inventoryData.entityManifestSummary || {}),
    },
    {
      key: 'query-plans',
      title: 'Planos de query',
      content: maskReportSensitiveValues(inventoryData.queryPlanSummary || {}),
    },
    {
      key: 'future-results',
      title: 'Resultados futuros',
      content: maskReportSensitiveValues(inventoryData.futureResults || { status: 'blocked-until-future-microcut' }),
    },
    {
      key: 'discard-candidates',
      title: 'Candidatos a descarte',
      content: maskReportSensitiveValues(inventoryData.discardCandidates || { status: 'human-review-required' }),
    },
    {
      key: 'human-pending-items',
      title: 'Pendencias humanas',
      content: maskReportSensitiveValues(inventoryData.pendingItems || { status: 'pending-human-review' }),
    },
  ];

  return sections;
}

export function renderMarkdownReport(reportModel = {}) {
  const metadata = reportModel.metadata || {};
  const sections = Array.isArray(reportModel.sections) ? reportModel.sections : [];

  const lines = [
    '# Inventario Read-Only',
    '',
    `- modo: ${metadata.mode || 'future-report-design'}`,
    `- outputPathStatus: ${metadata.outputPathStatus || 'missing'}`,
    `- reportGenerated: false`,
    `- writePerformed: false`,
  ];

  for (const section of sections) {
    lines.push('');
    lines.push(`## ${section.title || section.key || 'secao'}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(section.content ?? {}, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
}

export function renderJsonReport(reportModel = {}) {
  const safeModel = maskReportSensitiveValues(reportModel);

  return {
    ...safeModel,
    reportGenerated: false,
    writePerformed: false,
  };
}

export function summarizeReportModel(reportModel = {}) {
  const sections = Array.isArray(reportModel.sections) ? reportModel.sections : [];
  const outputPathValidation = validateReportOutputPath(reportModel?.metadata?.outputPath || FUTURE_REPORT_LOCATION);
  const serializedModel = JSON.stringify(reportModel);
  const sensitivePattern = /(senha|password|hash|token|mongodb:\/\/|mongodb\+srv:\/\/|anexos brutos)/i;

  return {
    sectionCount: sections.length,
    sensitiveMarkersDetected: sensitivePattern.test(serializedModel),
    outputPathStatus: outputPathValidation.status,
    reportGenerated: false,
    writePerformed: false,
  };
}

export function assertReadOnlyEnvironment(env = {}) {
  const validationSummary = buildValidationSummary({
    WD_OPS_READONLY_CONFIRM: env.WD_OPS_READONLY_CONFIRM,
    WD_OPS_ENVIRONMENT_CONFIRM: env.WD_OPS_ENVIRONMENT_CONFIRM,
    WD_OPS_DATABASE_CONFIRM: env.WD_OPS_DATABASE_CONFIRM,
    WD_OPS_DATABASE_TARGET: env.WD_OPS_DATABASE_TARGET,
    WD_OPS_ATLAS_TARGET: env.WD_OPS_ATLAS_TARGET,
    WD_OPS_ATLAS_EXPLICIT_APPROVAL: env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
  });

  const snapshot = {
    environmentConfirmed: describeFutureFlagStatus(env.WD_OPS_ENVIRONMENT_CONFIRM),
    databaseConfirmed: describeFutureFlagStatus(env.WD_OPS_DATABASE_CONFIRM),
    databaseTarget: validateDatabaseTarget(env.WD_OPS_DATABASE_TARGET).status,
    readOnlyConfirmed: describeFutureFlagStatus(env.WD_OPS_READONLY_CONFIRM),
    atlasApproval: describeFutureFlagStatus(env.WD_OPS_ATLAS_EXPLICIT_APPROVAL),
    status: 'not-executed',
    reason: 'Skeleton nao valida nem usa conexao; apenas registra bloqueios, target futuro e pendencias futuras.',
    validationSummary,
  };

  return snapshot;
}

export function buildPlannedInventoryManifest() {
  const entityManifestSummary = getEntityManifestSummary();
  const queryPlanSummary = summarizeQueryPlans(buildReadOnlyQueryPlan(buildEntityManifest()));
  const connectionDesignSummary = summarizeConnectionDesign(
    designReadOnlyConnectionConfig({
      WD_OPS_READONLY_CONFIRM: process.env.WD_OPS_READONLY_CONFIRM,
      WD_OPS_ENVIRONMENT_CONFIRM: process.env.WD_OPS_ENVIRONMENT_CONFIRM,
      WD_OPS_DATABASE_CONFIRM: process.env.WD_OPS_DATABASE_CONFIRM,
      WD_OPS_DATABASE_TARGET: process.env.WD_OPS_DATABASE_TARGET,
      WD_OPS_ATLAS_TARGET: process.env.WD_OPS_ATLAS_TARGET,
      WD_OPS_ATLAS_EXPLICIT_APPROVAL: process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
    }),
  );
  const reportModel = {
    metadata: buildReportMetadata({
      databaseTarget: validateDatabaseTarget(process.env.WD_OPS_DATABASE_TARGET).sanitized,
      outputPath: FUTURE_REPORT_LOCATION,
    }),
    sections: buildReportSections({
      entityManifestSummary,
      queryPlanSummary,
    }),
  };
  return {
    scriptName: SCRIPT_NAME,
    scriptPath: SCRIPT_PATH,
    status: SCRIPT_STATUS,
    objective: SCRIPT_OBJECTIVE,
    targetEntities: entityManifestSummary.entityKeys,
    conceptualAllowlist: CONCEPTUAL_ALLOWLIST,
    conceptualBlocklist: CONCEPTUAL_BLOCKLIST,
    requiredFutureFlags: REQUIRED_FUTURE_FLAGS,
    futureReportLocation: FUTURE_REPORT_LOCATION,
    maskingRules: MASKING_RULES,
    entityManifestSummary,
    queryPlanSummary,
    connectionDesignSummary,
    reportDesignSummary: summarizeReportModel(reportModel),
    connectionImplementation: 'blocked-until-future-microcut',
    reportGenerationImplementation: 'blocked-until-future-microcut',
  };
}

export function buildSafetySummary() {
  const queryPlanSummary = summarizeQueryPlans(buildReadOnlyQueryPlan(buildEntityManifest()));
  const entityManifestSummary = getEntityManifestSummary();
  const connectionDesignSummary = summarizeConnectionDesign(
    designReadOnlyConnectionConfig({
      WD_OPS_READONLY_CONFIRM: process.env.WD_OPS_READONLY_CONFIRM,
      WD_OPS_ENVIRONMENT_CONFIRM: process.env.WD_OPS_ENVIRONMENT_CONFIRM,
      WD_OPS_DATABASE_CONFIRM: process.env.WD_OPS_DATABASE_CONFIRM,
      WD_OPS_DATABASE_TARGET: process.env.WD_OPS_DATABASE_TARGET,
      WD_OPS_ATLAS_TARGET: process.env.WD_OPS_ATLAS_TARGET,
      WD_OPS_ATLAS_EXPLICIT_APPROVAL: process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
    }),
  );
  const connectionPreconditions = validateConnectionPreconditions({
    WD_OPS_READONLY_CONFIRM: process.env.WD_OPS_READONLY_CONFIRM,
    WD_OPS_ENVIRONMENT_CONFIRM: process.env.WD_OPS_ENVIRONMENT_CONFIRM,
    WD_OPS_DATABASE_CONFIRM: process.env.WD_OPS_DATABASE_CONFIRM,
    WD_OPS_DATABASE_TARGET: process.env.WD_OPS_DATABASE_TARGET,
    WD_OPS_ATLAS_TARGET: process.env.WD_OPS_ATLAS_TARGET,
    WD_OPS_ATLAS_EXPLICIT_APPROVAL: process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
  });
  const validationSummary = buildValidationSummary({
    WD_OPS_READONLY_CONFIRM: process.env.WD_OPS_READONLY_CONFIRM,
    WD_OPS_ENVIRONMENT_CONFIRM: process.env.WD_OPS_ENVIRONMENT_CONFIRM,
    WD_OPS_DATABASE_CONFIRM: process.env.WD_OPS_DATABASE_CONFIRM,
    WD_OPS_DATABASE_TARGET: process.env.WD_OPS_DATABASE_TARGET,
    WD_OPS_ATLAS_TARGET: process.env.WD_OPS_ATLAS_TARGET,
    WD_OPS_ATLAS_EXPLICIT_APPROVAL: process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
  });
  const envSnapshot = {
    readOnlyConfirm: describeFutureFlagStatus(process.env.WD_OPS_READONLY_CONFIRM),
    environmentConfirm: describeFutureFlagStatus(process.env.WD_OPS_ENVIRONMENT_CONFIRM),
    databaseConfirm: describeFutureFlagStatus(process.env.WD_OPS_DATABASE_CONFIRM),
    databaseTarget: validateDatabaseTarget(process.env.WD_OPS_DATABASE_TARGET).status,
    atlasApproval: describeFutureFlagStatus(process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL),
  };
  const reportModel = {
    metadata: buildReportMetadata({
      databaseTarget: validateDatabaseTarget(process.env.WD_OPS_DATABASE_TARGET).sanitized,
      environment: envSnapshot,
      outputPath: FUTURE_REPORT_LOCATION,
    }),
    sections: buildReportSections({
      entityManifestSummary,
      queryPlanSummary,
    }),
  };

  return {
    scriptStatus: SCRIPT_STATUS,
    executionMode: 'not-executed',
    databaseAccess: 'disabled',
    reportWrite: 'disabled',
    packageJsonIntegration: 'absent',
    envSnapshot,
    validationSummary,
    connectionDesignSummary,
    connectionPreconditions,
    reportDesignSummary: summarizeReportModel(reportModel),
    writeGuards: ensureNoWriteOperationsRegistered(),
    queryPlanSummary,
    notes: [
      'Este skeleton nao importa mongoose.',
      'Este skeleton nao importa connect-mongo.',
      'Este skeleton nao abre conexao.',
      'Este skeleton nao consulta banco.',
      'Este skeleton nao gera relatorio real.',
      'Este skeleton so expõe estados seguros de flags futuras, sem usar segredos.',
      'Este skeleton separa confirmacao booleana de database target textual.',
    ],
  };
}

export function main() {
  const manifest = buildPlannedInventoryManifest();
  const safetySummary = buildSafetySummary();
  const entityManifestSummary = getEntityManifestSummary();
  const queryPlanSummary = summarizeQueryPlans(buildReadOnlyQueryPlan(buildEntityManifest()));
  const connectionDesignSummary = summarizeConnectionDesign(
    designReadOnlyConnectionConfig({
      WD_OPS_READONLY_CONFIRM: process.env.WD_OPS_READONLY_CONFIRM,
      WD_OPS_ENVIRONMENT_CONFIRM: process.env.WD_OPS_ENVIRONMENT_CONFIRM,
      WD_OPS_DATABASE_CONFIRM: process.env.WD_OPS_DATABASE_CONFIRM,
      WD_OPS_DATABASE_TARGET: process.env.WD_OPS_DATABASE_TARGET,
      WD_OPS_ATLAS_TARGET: process.env.WD_OPS_ATLAS_TARGET,
      WD_OPS_ATLAS_EXPLICIT_APPROVAL: process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
    }),
  );
  const reportModel = {
    metadata: buildReportMetadata({
      databaseTarget: validateDatabaseTarget(process.env.WD_OPS_DATABASE_TARGET).sanitized,
      environment: {
        readOnlyConfirm: describeFutureFlagStatus(process.env.WD_OPS_READONLY_CONFIRM),
        environmentConfirm: describeFutureFlagStatus(process.env.WD_OPS_ENVIRONMENT_CONFIRM),
        databaseConfirm: describeFutureFlagStatus(process.env.WD_OPS_DATABASE_CONFIRM),
      },
      outputPath: FUTURE_REPORT_LOCATION,
    }),
    sections: buildReportSections({
      entityManifestSummary,
      queryPlanSummary,
    }),
  };
  const validationSummary = buildValidationSummary({
    WD_OPS_READONLY_CONFIRM: process.env.WD_OPS_READONLY_CONFIRM,
    WD_OPS_ENVIRONMENT_CONFIRM: process.env.WD_OPS_ENVIRONMENT_CONFIRM,
    WD_OPS_DATABASE_CONFIRM: process.env.WD_OPS_DATABASE_CONFIRM,
    WD_OPS_DATABASE_TARGET: process.env.WD_OPS_DATABASE_TARGET,
    WD_OPS_ATLAS_TARGET: process.env.WD_OPS_ATLAS_TARGET,
    WD_OPS_ATLAS_EXPLICIT_APPROVAL: process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
  });
  const pendingChecks = assertReadOnlyEnvironment({
    WD_OPS_READONLY_CONFIRM: process.env.WD_OPS_READONLY_CONFIRM,
    WD_OPS_ENVIRONMENT_CONFIRM: process.env.WD_OPS_ENVIRONMENT_CONFIRM,
    WD_OPS_DATABASE_CONFIRM: process.env.WD_OPS_DATABASE_CONFIRM,
    WD_OPS_DATABASE_TARGET: process.env.WD_OPS_DATABASE_TARGET,
    WD_OPS_ATLAS_TARGET: process.env.WD_OPS_ATLAS_TARGET,
    WD_OPS_ATLAS_EXPLICIT_APPROVAL: process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
  });

  const output = {
    script: manifest.scriptName,
    path: manifest.scriptPath,
    status: manifest.status,
    objective: manifest.objective,
    targetEntities: manifest.targetEntities,
    entityManifestSummary,
    queryPlanSummary,
    connectionDesignSummary,
    reportDesignSummary: summarizeReportModel(reportModel),
    futureFlags: manifest.requiredFutureFlags,
    futureReportLocation: manifest.futureReportLocation,
    maskingRules: manifest.maskingRules,
    safetySummary,
    validationSummary,
    pendingChecks,
    placeholders: {
      maskedConnectionStringExample: maskConnectionString('mongodb://user:secret@example.mongodb.net/wdgestor'),
      maskedEmailExample: maskEmail('operacao@example.com'),
      maskedCpfExample: maskCpf('12345678909'),
    },
  };

  console.log(JSON.stringify(output, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
