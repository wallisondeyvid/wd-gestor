import mongoose from 'mongoose';
import process from 'node:process';

const ABORT_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;
const CONNECTION_TIMEOUT_MS = 8000;
const SOCKET_TIMEOUT_MS = 8000;
const SERVER_SELECTION_TIMEOUT_MS = 8000;

function printSummary(fields) {
  for (const [key, value] of Object.entries(fields)) {
    console.log(`${key}=${value}`);
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

function sanitizeMongoUri(rawUri) {
  const uri = String(rawUri || '').trim();
  if (!uri) return '[uri-missing]';

  try {
    const parsed = new URL(uri);
    const protocol = parsed.protocol || 'mongodb:';
    const hostname = maskHost(parsed.hostname);
    const port = parsed.port ? `:${parsed.port}` : '';
    const dbName = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.slice(1) : '[db-unspecified]';
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
  error.name = 'ReadonlyDiagnosticAbortError';
  error.extraFields = extraFields;
  return error;
}

function sanitizeDiagnosticMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message) return 'diagnostic-aborted';

  return message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s'"`]+/gi, '[mongo-uri-redacted]')
    .replace(/([A-Za-z0-9._%+-]+):([^@\s]+)@/g, '$1:[redacted]@');
}

function assertSafeEnvironment(rawUri) {
  const memoryFlag = String(process.env.MONGO_MEMORY || '').trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(memoryFlag)) {
    throw buildAbortError('MONGO_MEMORY=1 bloqueia diagnostico de Mongo real.', {
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

async function runDiagnostic() {
  const rawUri = String(process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
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

    const admin = mongoose.connection.db.admin();
    const pingResult = await admin.ping();
    const dbName = mongoose.connection.name || '[db-unspecified]';
    const pingOk = typeof pingResult?.ok === 'number' ? pingResult.ok === 1 : !!pingResult?.ok;

    printSummary({
      diagnosticResult: pingOk ? 'green' : 'red',
      connectionAttempted,
      readOnly: true,
      writesAttempted: false,
      seedMasterCleanupTouched: false,
      secretsPrinted: false,
      productionReady: false,
      sanitizedTarget: sanitizedUri,
      sanitizedDbName: dbName,
    });

    return pingOk ? SUCCESS_EXIT_CODE : ABORT_EXIT_CODE;
  } catch (error) {
    const blockedReason = error?.extraFields?.blockedReason || error?.name || 'diagnostic-failed';
    const message = sanitizeDiagnosticMessage(error);

    printSummary({
      diagnosticResult: 'red',
      connectionAttempted,
      readOnly: true,
      writesAttempted: false,
      seedMasterCleanupTouched: false,
      secretsPrinted: false,
      productionReady: false,
      sanitizedTarget: sanitizedUri,
      blockedReason,
      diagnosticMessage: message,
    });

    return ABORT_EXIT_CODE;
  } finally {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch {
      // Mantem falha fechada sem expor detalhes adicionais.
    }
  }
}

const exitCode = await runDiagnostic();
process.exit(exitCode);