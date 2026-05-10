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

function describeFutureFlagStatus(value) {
  return value ? 'present-but-not-used' : 'missing';
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
  const snapshot = {
    environmentConfirmed: describeFutureFlagStatus(env.WD_OPS_ENVIRONMENT_CONFIRM),
    databaseConfirmed: describeFutureFlagStatus(env.WD_OPS_DATABASE_CONFIRM),
    readOnlyConfirmed: describeFutureFlagStatus(env.WD_OPS_READONLY_CONFIRM),
    atlasApproval: describeFutureFlagStatus(env.WD_OPS_ATLAS_EXPLICIT_APPROVAL),
    status: 'not-executed',
    reason: 'Skeleton nao valida nem usa conexao; apenas registra bloqueios e pendencias futuras.',
  };

  return snapshot;
}

export function buildPlannedInventoryManifest() {
  return {
    scriptName: SCRIPT_NAME,
    scriptPath: SCRIPT_PATH,
    status: SCRIPT_STATUS,
    objective: SCRIPT_OBJECTIVE,
    targetEntities: TARGET_ENTITIES,
    conceptualAllowlist: CONCEPTUAL_ALLOWLIST,
    conceptualBlocklist: CONCEPTUAL_BLOCKLIST,
    requiredFutureFlags: REQUIRED_FUTURE_FLAGS,
    futureReportLocation: FUTURE_REPORT_LOCATION,
    maskingRules: MASKING_RULES,
    connectionImplementation: 'blocked-until-future-microcut',
    reportGenerationImplementation: 'blocked-until-future-microcut',
  };
}

export function buildSafetySummary() {
  const envSnapshot = {
    readOnlyConfirm: describeFutureFlagStatus(process.env.WD_OPS_READONLY_CONFIRM),
    environmentConfirm: describeFutureFlagStatus(process.env.WD_OPS_ENVIRONMENT_CONFIRM),
    databaseConfirm: describeFutureFlagStatus(process.env.WD_OPS_DATABASE_CONFIRM),
    atlasApproval: describeFutureFlagStatus(process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL),
  };

  return {
    scriptStatus: SCRIPT_STATUS,
    executionMode: 'not-executed',
    databaseAccess: 'disabled',
    reportWrite: 'disabled',
    packageJsonIntegration: 'absent',
    envSnapshot,
    notes: [
      'Este skeleton nao importa mongoose.',
      'Este skeleton nao importa connect-mongo.',
      'Este skeleton nao abre conexao.',
      'Este skeleton nao consulta banco.',
      'Este skeleton nao gera relatorio real.',
      'Este skeleton so expõe estados seguros de flags futuras, sem usar segredos.',
    ],
  };
}

export function main() {
  const manifest = buildPlannedInventoryManifest();
  const safetySummary = buildSafetySummary();
  const pendingChecks = assertReadOnlyEnvironment({
    WD_OPS_READONLY_CONFIRM: process.env.WD_OPS_READONLY_CONFIRM,
    WD_OPS_ENVIRONMENT_CONFIRM: process.env.WD_OPS_ENVIRONMENT_CONFIRM,
    WD_OPS_DATABASE_CONFIRM: process.env.WD_OPS_DATABASE_CONFIRM,
    WD_OPS_ATLAS_EXPLICIT_APPROVAL: process.env.WD_OPS_ATLAS_EXPLICIT_APPROVAL,
  });

  const output = {
    script: manifest.scriptName,
    path: manifest.scriptPath,
    status: manifest.status,
    objective: manifest.objective,
    targetEntities: manifest.targetEntities,
    futureFlags: manifest.requiredFutureFlags,
    futureReportLocation: manifest.futureReportLocation,
    maskingRules: manifest.maskingRules,
    safetySummary,
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
