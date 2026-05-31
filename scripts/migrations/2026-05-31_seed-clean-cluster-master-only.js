import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_NAME = '2026-05-31_seed-clean-cluster-master-only.js';
const TARGET_URI_ENV_KEYS = ['CLEAN_MONGODB_URI', 'MIGRATION_TARGET_MONGODB_URI', 'TARGET_MONGODB_URI'];
const MASTER_EMAIL_ENV_KEYS = ['MASTER_EMAIL', 'MIGRATION_MASTER_EMAIL'];
const MASTER_PASSWORD_ENV_KEYS = ['MASTER_PASSWORD', 'MIGRATION_MASTER_PASSWORD'];
const MASTER_NAME_ENV_KEYS = ['MASTER_NAME'];
const DEFAULT_MASTER_NAME = 'Master User';
const BCRYPT_ROUNDS = 10;

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();

  for (const arg of argv) {
    if (arg === 'apply') {
      flags.add('apply');
      continue;
    }

    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      flags.add(arg.slice(2));
      continue;
    }

    values.set(arg.slice(2, eq), arg.slice(eq + 1));
  }

  return { flags, values };
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function resolveEnvValue(keys) {
  for (const key of keys) {
    const value = normalizeString(process.env[key]);
    if (value) return value;
  }
  return '';
}

function sanitizeMasterName(value) {
  const normalized = normalizeString(value).replace(/\s+/g, ' ');
  return normalized || DEFAULT_MASTER_NAME;
}

function buildConfig(argv = []) {
  const { flags, values } = parseArgs(argv);
  const applyRequested = flags.has('apply');
  const targetUri = normalizeString(values.get('target-uri')) || resolveEnvValue(TARGET_URI_ENV_KEYS);
  const masterEmail = normalizeEmail(values.get('master-email')) || normalizeEmail(resolveEnvValue(MASTER_EMAIL_ENV_KEYS));
  const masterPassword = resolveEnvValue(MASTER_PASSWORD_ENV_KEYS);
  const masterNameInput = normalizeString(values.get('master-name')) || resolveEnvValue(MASTER_NAME_ENV_KEYS);

  return {
    applyRequested,
    dryRun: !applyRequested,
    targetUri,
    masterEmail,
    masterPassword,
    masterName: sanitizeMasterName(masterNameInput),
    masterNameProvided: !!normalizeString(masterNameInput),
  };
}

function buildSummary(config) {
  return {
    script: SCRIPT_NAME,
    dryRun: config.dryRun,
    applyRequested: config.applyRequested,
    targetCleanClusterOnly: true,
    cluster0Touched: false,
    cluster1Touched: false,
    targetUriPresent: !!config.targetUri,
    masterEmailProvided: !!config.masterEmail,
    masterPasswordProvided: !!config.masterPassword,
    masterNameProvided: config.masterNameProvided,
    connectionAttempted: false,
    connected: false,
    usersCollectionExists: null,
    masterExists: null,
    plannedInsert: false,
    insertedNow: false,
    passwordHashGenerated: false,
    passwordHashWouldBeGenerated: false,
    passwordHashPrinted: false,
    passwordPrinted: false,
    rawDocumentPrinted: false,
    writesAttempted: false,
    wouldRequirePasswordForApply: !config.masterPassword,
    abortReason: null,
    errorName: null,
    errorMessageSanitized: null,
  };
}

function buildAbortSummary(summary, abortReason) {
  return {
    ...summary,
    abortReason,
  };
}

async function openTargetConnection(uri) {
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

function buildMasterDocument(config, passwordHash) {
  const now = new Date();
  return {
    email: config.masterEmail,
    senha: passwordHash,
    role: 'master',
    global_role: 'master',
    ativo: true,
    nome: config.masterName,
    primeiro_acesso: false,
    senha_provisoria: false,
    failed_login_attempts: 0,
    lock_until: null,
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeErrorMessage(error) {
  const message = normalizeString(error?.message);

  if (!message) return 'unexpected_error';
  if (/auth|authentication|ECONN|ENOTFOUND|timed out|server selection/i.test(message)) {
    return 'target_connection_failed';
  }
  if (/duplicate key/i.test(message)) {
    return 'master_insert_conflict';
  }
  return 'unexpected_error';
}

function sanitizeErrorName(error) {
  return normalizeString(error?.name) || 'Error';
}

export async function seedCleanClusterMasterOnly(options = {}) {
  const config = {
    ...buildConfig([]),
    ...options,
  };
  const summary = buildSummary(config);

  if (!config.targetUri) {
    return buildAbortSummary(summary, 'target_uri_required');
  }

  if (!config.masterEmail) {
    return buildAbortSummary(summary, 'master_email_required');
  }

  if (config.applyRequested && !config.masterPassword) {
    return buildAbortSummary(summary, 'master_password_required_for_apply');
  }

  let connection;
  try {
    summary.connectionAttempted = true;
    connection = await openTargetConnection(config.targetUri);
    summary.connected = true;
    summary.usersCollectionExists = await collectionExists(connection, 'users');

    const usersCollection = connection.db.collection('users');
    const existingMaster = await usersCollection.findOne(
      { email: config.masterEmail },
      { projection: { _id: 1, email: 1 } }
    );

    summary.masterExists = !!existingMaster;
    summary.plannedInsert = !summary.masterExists;

    if (summary.masterExists) {
      summary.abortReason = 'master_already_exists';
      return summary;
    }

    if (config.dryRun) {
      summary.passwordHashWouldBeGenerated = !!config.masterPassword;
      return summary;
    }

    const passwordHash = await bcrypt.hash(config.masterPassword, BCRYPT_ROUNDS);
    summary.passwordHashGenerated = true;

    summary.writesAttempted = true;
    const insertResult = await usersCollection.insertOne(buildMasterDocument(config, passwordHash));
    summary.insertedNow = !!insertResult?.acknowledged;
    return summary;
  } catch (error) {
    summary.errorName = sanitizeErrorName(error);
    summary.errorMessageSanitized = sanitizeErrorMessage(error);
    if (!summary.abortReason) {
      summary.abortReason = summary.connected ? 'script_failed_after_connect' : 'target_connection_failed';
    }
    return summary;
  } finally {
    await closeConnection(connection);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  const config = buildConfig(process.argv.slice(2));
  seedCleanClusterMasterOnly(config)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));

      const fatalAbortReasons = new Set([
        'target_uri_required',
        'master_email_required',
        'master_password_required_for_apply',
      ]);

      process.exit(summary.errorName || fatalAbortReasons.has(summary.abortReason) ? 1 : 0);
    })
    .catch((error) => {
      console.error(JSON.stringify({
        script: SCRIPT_NAME,
        dryRun: true,
        applyRequested: false,
        targetCleanClusterOnly: true,
        cluster0Touched: false,
        cluster1Touched: false,
        targetUriPresent: false,
        masterEmailProvided: false,
        masterPasswordProvided: false,
        masterNameProvided: false,
        connectionAttempted: false,
        connected: false,
        usersCollectionExists: null,
        masterExists: null,
        plannedInsert: false,
        insertedNow: false,
        passwordHashGenerated: false,
        passwordHashPrinted: false,
        passwordPrinted: false,
        rawDocumentPrinted: false,
        writesAttempted: false,
        abortReason: 'script_bootstrap_failed',
        errorName: sanitizeErrorName(error),
        errorMessageSanitized: sanitizeErrorMessage(error),
      }, null, 2));
      process.exit(1);
    });
}

export default seedCleanClusterMasterOnly;