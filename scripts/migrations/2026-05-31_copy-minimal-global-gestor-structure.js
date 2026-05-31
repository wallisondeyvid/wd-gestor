import 'dotenv/config';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_COPY_COLLECTIONS = ['modulos', 'widgetsettings'];
const OPTIONAL_GLOBAL_COLLECTIONS = ['roles', 'permissions', 'permissoes', 'configuracoes', 'settings'];
const DEFAULT_SOURCE_URI_ENV_KEYS = ['MIGRATION_SOURCE_MONGODB_URI', 'SOURCE_MONGODB_URI', 'CLUSTER0_MONGODB_URI'];
const DEFAULT_TARGET_URI_ENV_KEYS = ['MIGRATION_TARGET_MONGODB_URI', 'TARGET_MONGODB_URI', 'CLEAN_CLUSTER_MONGODB_URI', 'CLEAN_MONGODB_URI'];
const DEFAULT_MASTER_EMAIL_ENV_KEYS = ['MIGRATION_MASTER_EMAIL', 'MASTER_EMAIL'];
const MASTER_SYNC_FIELDS = ['email', 'nome', 'global_role', 'role', 'ativo', 'unidade_id', 'funcionario_id', 'foto'];

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  const multiValues = new Map();

  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      flags.add(arg.slice(2));
      continue;
    }

    const key = arg.slice(2, eq);
    const value = arg.slice(eq + 1);
    values.set(key, value);
    if (!multiValues.has(key)) multiValues.set(key, []);
    multiValues.get(key).push(value);
  }

  return { flags, values, multiValues };
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function parseCsv(value) {
  return normalizeString(value)
    .split(',')
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function uniq(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

function resolveEnvValue(keys) {
  for (const key of keys) {
    const value = normalizeString(process.env[key]);
    if (value) return value;
  }
  return '';
}

function resolveBooleanFlag(flags, name) {
  return flags.has(name);
}

function buildConfig(argv = []) {
  const { flags, values, multiValues } = parseArgs(argv);
  const apply = resolveBooleanFlag(flags, 'apply');
  const dryRun = !apply;
  const includeOptionalGlobals = resolveBooleanFlag(flags, 'include-optional-globals');

  const sourceUri = normalizeString(values.get('source-uri')) || resolveEnvValue(DEFAULT_SOURCE_URI_ENV_KEYS);
  const targetUri = normalizeString(values.get('target-uri')) || resolveEnvValue(DEFAULT_TARGET_URI_ENV_KEYS);
  const masterEmail = normalizeEmail(values.get('master-email')) || normalizeEmail(resolveEnvValue(DEFAULT_MASTER_EMAIL_ENV_KEYS));
  const extraCollections = [
    ...parseCsv(values.get('copy-collections')),
    ...(multiValues.get('copy-collection') || []).flatMap((value) => parseCsv(value)),
  ];

  const requestedCollections = uniq([
    ...DEFAULT_COPY_COLLECTIONS,
    ...extraCollections,
    ...(includeOptionalGlobals ? OPTIONAL_GLOBAL_COLLECTIONS : []),
  ]);

  return {
    apply,
    dryRun,
    includeOptionalGlobals,
    sourceUri,
    targetUri,
    masterEmail,
    requestedCollections,
  };
}

async function openConnection(uri, label) {
  if (!normalizeString(uri)) {
    throw new Error(`URI ausente para ${label}`);
  }

  const connection = mongoose.createConnection(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
  });

  await connection.asPromise();
  return connection;
}

async function closeConnection(connection) {
  if (!connection) return;
  try {
    await connection.close();
  } catch {}
}

async function collectionExists(connection, collectionName) {
  const entries = await connection.db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
  return entries.some((entry) => entry?.name === collectionName);
}

async function countDocumentsSafe(connection, collectionName) {
  if (!(await collectionExists(connection, collectionName))) return 0;
  return connection.db.collection(collectionName).countDocuments({});
}

async function loadCollectionDocuments(connection, collectionName, filter = {}) {
  if (!(await collectionExists(connection, collectionName))) return [];
  return connection.db.collection(collectionName).find(filter).toArray();
}

function toBulkReplaceOperations(documents) {
  return (documents || [])
    .filter((document) => document && document._id)
    .map((document) => ({
      replaceOne: {
        filter: { _id: document._id },
        replacement: document,
        upsert: true,
      },
    }));
}

async function syncCollectionById({ sourceConnection, targetConnection, collectionName, dryRun }) {
  const sourceExists = await collectionExists(sourceConnection, collectionName);
  const targetExists = await collectionExists(targetConnection, collectionName);
  const sourceCount = sourceExists ? await countDocumentsSafe(sourceConnection, collectionName) : 0;
  const targetCountBefore = targetExists ? await countDocumentsSafe(targetConnection, collectionName) : 0;
  const summary = {
    collectionName,
    sourceExists,
    targetExists,
    sourceCount,
    targetCountBefore,
    copiedNow: false,
    plannedUpserts: 0,
    appliedUpserts: 0,
  };

  if (!sourceExists) return summary;

  const documents = await loadCollectionDocuments(sourceConnection, collectionName);
  const operations = toBulkReplaceOperations(documents);
  summary.plannedUpserts = operations.length;

  if (dryRun || operations.length === 0) {
    return summary;
  }

  const result = await targetConnection.db.collection(collectionName).bulkWrite(operations, { ordered: false });
  summary.copiedNow = true;
  summary.appliedUpserts = Number(result.upsertedCount || 0) + Number(result.modifiedCount || 0) + Number(result.matchedCount || 0);
  return summary;
}

async function inspectOptionalCollections(sourceConnection) {
  const summary = [];
  for (const collectionName of OPTIONAL_GLOBAL_COLLECTIONS) {
    const exists = await collectionExists(sourceConnection, collectionName);
    const count = exists ? await countDocumentsSafe(sourceConnection, collectionName) : 0;
    summary.push({ collectionName, exists, count });
  }
  return summary;
}

function buildMasterSyncPatch(sourceMaster) {
  const patch = {};
  for (const field of MASTER_SYNC_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(sourceMaster || {}, field)) {
      patch[field] = sourceMaster[field];
    }
  }
  return patch;
}

async function findSingleMasterUser(connection, { masterEmail }) {
  const usersCollection = connection.db.collection('users');

  if (masterEmail) {
    return usersCollection.findOne({ email: masterEmail });
  }

  const matches = await usersCollection
    .find({
      $or: [
        { global_role: 'master' },
        { role: 'master' },
      ],
    })
    .limit(2)
    .toArray();

  if (matches.length !== 1) return null;
  return matches[0];
}

async function syncMasterUserStructure({ sourceConnection, targetConnection, masterEmail, dryRun }) {
  const summary = {
    masterEmailProvided: !!masterEmail,
    sourceMasterFound: false,
    targetMasterFound: false,
    passwordHashPreserved: true,
    structuralFieldsPlanned: 0,
    structuralFieldsApplied: 0,
    copiedNow: false,
  };

  const sourceUsersExists = await collectionExists(sourceConnection, 'users');
  const targetUsersExists = await collectionExists(targetConnection, 'users');
  if (!sourceUsersExists || !targetUsersExists) {
    return {
      ...summary,
      sourceUsersExists,
      targetUsersExists,
    };
  }

  const sourceMaster = await findSingleMasterUser(sourceConnection, { masterEmail });
  const targetMaster = await findSingleMasterUser(targetConnection, {
    masterEmail: masterEmail || normalizeEmail(sourceMaster?.email),
  });

  summary.sourceMasterFound = !!sourceMaster;
  summary.targetMasterFound = !!targetMaster;

  if (!sourceMaster || !targetMaster) {
    return summary;
  }

  const patch = buildMasterSyncPatch(sourceMaster);
  summary.structuralFieldsPlanned = Object.keys(patch).length;

  if (dryRun || summary.structuralFieldsPlanned === 0) {
    return summary;
  }

  await targetConnection.db.collection('users').updateOne(
    { _id: targetMaster._id },
    { $set: patch }
  );

  summary.copiedNow = true;
  summary.structuralFieldsApplied = summary.structuralFieldsPlanned;
  return summary;
}

function buildExecutionSummary({ config, optionalCollections, copiedCollections, masterSync }) {
  return {
    dryRun: config.dryRun,
    applyRequested: config.apply,
    includeOptionalGlobals: config.includeOptionalGlobals,
    targetCleanClusterOnly: true,
    sourceClusterTouchedForWrites: false,
    targetCollectionsRequested: config.requestedCollections,
    optionalGlobalCollectionsInspected: optionalCollections,
    copiedCollections,
    masterSync,
  };
}

export async function copyMinimalGlobalGestorStructure(options = {}) {
  const config = {
    ...buildConfig([]),
    ...options,
  };

  if (!normalizeString(config.sourceUri)) {
    throw new Error('Defina a URI de origem via --source-uri ou variavel de ambiente suportada.');
  }
  if (!normalizeString(config.targetUri)) {
    throw new Error('Defina a URI de destino via --target-uri ou variavel de ambiente suportada.');
  }
  if (normalizeString(config.sourceUri) === normalizeString(config.targetUri)) {
    throw new Error('Origem e destino nao podem ser a mesma URI.');
  }

  let sourceConnection;
  let targetConnection;
  try {
    sourceConnection = await openConnection(config.sourceUri, 'origem');
    targetConnection = await openConnection(config.targetUri, 'destino');

    const optionalCollections = await inspectOptionalCollections(sourceConnection);
    const copiedCollections = [];

    for (const collectionName of config.requestedCollections) {
      const result = await syncCollectionById({
        sourceConnection,
        targetConnection,
        collectionName,
        dryRun: config.dryRun,
      });
      copiedCollections.push(result);
    }

    const masterSync = await syncMasterUserStructure({
      sourceConnection,
      targetConnection,
      masterEmail: config.masterEmail,
      dryRun: config.dryRun,
    });

    return buildExecutionSummary({
      config,
      optionalCollections,
      copiedCollections,
      masterSync,
    });
  } finally {
    await closeConnection(sourceConnection);
    await closeConnection(targetConnection);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  const config = buildConfig(process.argv.slice(2));
  copyMinimalGlobalGestorStructure(config)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error(JSON.stringify({
        ok: false,
        error: 'migration_failed',
        message: error?.message || String(error),
      }, null, 2));
      process.exit(1);
    });
}

export default copyMinimalGlobalGestorStructure;