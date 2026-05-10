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
    connectionImplementation: 'blocked-until-future-microcut',
    reportGenerationImplementation: 'blocked-until-future-microcut',
  };
}

export function buildSafetySummary() {
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

  return {
    scriptStatus: SCRIPT_STATUS,
    executionMode: 'not-executed',
    databaseAccess: 'disabled',
    reportWrite: 'disabled',
    packageJsonIntegration: 'absent',
    envSnapshot,
    validationSummary,
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
