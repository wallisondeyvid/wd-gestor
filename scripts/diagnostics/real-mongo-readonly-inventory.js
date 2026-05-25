import mongoose from 'mongoose';
import process from 'node:process';

const ABORT_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;
const CONNECTION_TIMEOUT_MS = 8000;
const SOCKET_TIMEOUT_MS = 8000;
const SERVER_SELECTION_TIMEOUT_MS = 8000;

const COLLECTION_ALLOWLIST = [
  'users',
  'usuarios',
  'condominios',
  'unidades',
  'moradores',
  'comunicados',
  'blocos',
  'sessions',
  'refreshTokens',
  'auditLogs',
];

function printField(key, value) {
  console.log(`${key}=${value}`);
}

function printSummary(fields) {
  for (const [key, value] of Object.entries(fields)) {
    printField(key, value);
  }
}

function maskHost(hostname) {
  const value = String(hostname || '').trim();
  if (!value) return '[redacted-host]';

  const parts = value.split('.').filter(Boolean);
  const maskedParts = parts.map((part, index) => {
    if (part.length <= 2) return '*'.repeat(part.length || 1);
    if (index === parts.length - 1) return part;
    return `${part.slice(0, 1)}***${part.slice(-1)}`;
  });

  return maskedParts.join('.');
}

function sanitizeDbName(rawDbName) {
  const value = String(rawDbName || '').trim();
  if (!value) return '[db-unspecified]';
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return '[db-redacted]';
  return value;
}

function sanitizeMongoUri(rawUri) {
  const uri = String(rawUri || '').trim();
  if (!uri) return '[uri-missing]';

  try {
    const parsed = new URL(uri);
    const protocol = parsed.protocol || 'mongodb:';
    const hostname = maskHost(parsed.hostname);
    const port = parsed.port ? `:${parsed.port}` : '';
    const dbName = sanitizeDbName(parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.slice(1) : '');
    return `${protocol}//[credentials-redacted]@${hostname}${port}/${dbName}`;
  } catch {
    return '[uri-redacted]';
  }
}

function classifyUri(rawUri) {
  const uri = String(rawUri || '').trim();
  const lowered = uri.toLowerCase();
  const signals = [];

  if (!uri) {
    signals.push('missing-uri');
    return { signals, isUnsafe: true };
  }

  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
    signals.push('unsupported-protocol');
  }

  if (/(^|[^a-z])localhost([^a-z]|$)/i.test(lowered)) {
    signals.push('localhost');
  }

  if (lowered.includes('127.0.0.1')) {
    signals.push('loopback-ip');
  }

  if (lowered.includes('0.0.0.0')) {
    signals.push('wildcard-host');
  }

  if (lowered.includes('mongodb-memory-server')) {
    signals.push('memory-server');
  }

  if (lowered.includes('/test') || lowered.includes('-test') || lowered.includes('_test')) {
    signals.push('test-like-uri');
  }

  return {
    signals,
    isUnsafe: signals.length > 0,
  };
}

function buildAbortError(reason, extraFields = {}) {
  const error = new Error(reason);
  error.name = 'ReadonlyInventoryAbortError';
  error.extraFields = extraFields;
  return error;
}

function assertSafeEnvironment(rawUri) {
  const memoryFlag = String(process.env.MONGO_MEMORY || '').trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(memoryFlag)) {
    throw buildAbortError('MONGO_MEMORY=1 bloqueia inventario de Mongo real.', {
      blockedReason: 'memory-flag-enabled',
    });
  }

  if (!rawUri) {
    throw buildAbortError('URI real explicita ausente em MONGO_URI/MONGODB_URI.', {
      blockedReason: 'missing-uri',
    });
  }

  const uriInfo = classifyUri(rawUri);
  if (uriInfo.isUnsafe) {
    throw buildAbortError('URI rejeitada por ambiente ambiguo ou alvo local/teste.', {
      blockedReason: uriInfo.signals.join(','),
    });
  }
}

function selectMongoUriFromEnvironment() {
  const mongoUriCandidate = typeof process.env.MONGO_URI === 'string'
    ? process.env.MONGO_URI.trim()
    : '';
  const mongodbUriCandidate = typeof process.env.MONGODB_URI === 'string'
    ? process.env.MONGODB_URI.trim()
    : '';

  return mongoUriCandidate || mongodbUriCandidate;
}

async function readCollectionInventory(db, collectionName, existingCollections) {
  const exists = existingCollections.has(collectionName);
  if (!exists) {
    return {
      exists: false,
      count: 0,
      nonEmpty: false,
      hasIndexes: false,
    };
  }

  const collection = db.collection(collectionName);
  const count = await collection.countDocuments({}, { maxTimeMS: SERVER_SELECTION_TIMEOUT_MS });
  const indexes = await collection.indexes();

  return {
    exists: true,
    count,
    nonEmpty: count > 0,
    hasIndexes: Array.isArray(indexes) && indexes.length > 0,
  };
}

function printCollectionInventory(collectionName, inventory) {
  printField(`collection:${collectionName}:exists`, inventory.exists);
  printField(`collection:${collectionName}:count`, inventory.count);
  printField(`collection:${collectionName}:nonEmpty`, inventory.nonEmpty);
  printField(`collection:${collectionName}:hasIndexes`, inventory.hasIndexes);
}

async function runInventory() {
  const rawUri = selectMongoUriFromEnvironment();
  const sanitizedUri = sanitizeMongoUri(rawUri);
  let connectionAttempted = false;

  try {
    assertSafeEnvironment(rawUri);

    connectionAttempted = true;
    await mongoose.connect(rawUri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      connectTimeoutMS: CONNECTION_TIMEOUT_MS,
      socketTimeoutMS: SOCKET_TIMEOUT_MS,
      maxPoolSize: 1,
      minPoolSize: 0,
      retryReads: true,
      retryWrites: false,
      family: 4,
      autoIndex: false,
      autoCreate: false,
    });

    const db = mongoose.connection.db;
    const existingCollectionsResult = await db.listCollections({}, { nameOnly: true }).toArray();
    const existingCollections = new Set(
      existingCollectionsResult
        .map((entry) => String(entry?.name || '').trim())
        .filter(Boolean),
    );

    const sanitizedDbName = sanitizeDbName(mongoose.connection.name || '');

    printSummary({
      inventoryResult: 'green',
      connectionAttempted,
      readOnly: true,
      writesAttempted: false,
      seedMasterCleanupTouched: false,
      secretsPrinted: false,
      productionReady: false,
      sanitizedTarget: sanitizedUri,
      sanitizedDbName,
    });

    for (const collectionName of COLLECTION_ALLOWLIST) {
      const inventory = await readCollectionInventory(db, collectionName, existingCollections);
      printCollectionInventory(collectionName, inventory);
    }

    return SUCCESS_EXIT_CODE;
  } catch (error) {
    const blockedReason = error?.extraFields?.blockedReason || error?.name || 'inventory-failed';

    printSummary({
      inventoryResult: 'red',
      connectionAttempted,
      readOnly: true,
      writesAttempted: false,
      seedMasterCleanupTouched: false,
      secretsPrinted: false,
      productionReady: false,
      sanitizedTarget: sanitizedUri,
      blockedReason,
    });

    return ABORT_EXIT_CODE;
  } finally {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch {
      // Fecha sem expor detalhes adicionais.
    }
  }
}

// Nunca imprimir documentos ou dados pessoais; apenas metadados sanitizados.
const exitCode = await runInventory();
process.exitCode = exitCode;
