import mongoose from 'mongoose';
import process from 'node:process';

const ABORT_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;
const CONNECTION_TIMEOUT_MS = 8000;
const SOCKET_TIMEOUT_MS = 8000;
const SERVER_SELECTION_TIMEOUT_MS = 8000;
const CANDIDATE_DOMAIN_ALLOWED = 'example.com';
const CANDIDATE_COLLECTIONS = ['users', 'usuarios'];

function printSummary(fields) {
  for (const [key, value] of Object.entries(fields)) {
    console.log(`${key}=${value}`);
  }
}

function isEnabledFlag(rawValue) {
  return String(rawValue || '').trim().toLowerCase() === '1';
}

function buildAbortError(reason) {
  const error = new Error(reason);
  error.name = 'ReadonlyCandidateQueryAbortError';
  return error;
}

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase();
}

function extractDomain(normalizedEmail) {
  const atIndex = normalizedEmail.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) return '';
  return normalizedEmail.slice(atIndex + 1);
}

function assertSafeEnvironment() {
  const mongoUri = String(process.env.MONGODB_URI || '').trim();
  if (!mongoUri) {
    throw buildAbortError('MONGODB_URI ausente ou vazio.');
  }

  if (isEnabledFlag(process.env.MONGO_MEMORY)) {
    throw buildAbortError('MONGO_MEMORY=1 bloqueia consulta dedicada de Mongo real.');
  }

  if (!isEnabledFlag(process.env.READ_ONLY_SAFE_OUTPUT)) {
    throw buildAbortError('READ_ONLY_SAFE_OUTPUT=1 e obrigatorio.');
  }

  const rawCandidateEmail = String(process.env.FICTIONAL_CANDIDATE_EMAIL || '');
  const normalizedCandidateEmail = normalizeEmail(rawCandidateEmail);
  if (!normalizedCandidateEmail) {
    throw buildAbortError('FICTIONAL_CANDIDATE_EMAIL ausente ou vazio.');
  }

  const candidateDomain = extractDomain(normalizedCandidateEmail);
  if (!candidateDomain || candidateDomain !== CANDIDATE_DOMAIN_ALLOWED) {
    throw buildAbortError('Dominio do candidato invalido; apenas example.com e permitido.');
  }

  return {
    mongoUri,
    normalizedCandidateEmail,
    candidateDomain,
    candidateEmailConfigured: true,
    candidateEmailNormalized: normalizedCandidateEmail !== rawCandidateEmail,
  };
}

function buildCandidateFilter(normalizedCandidateEmail) {
  return {
    $or: [
      { email: normalizedCandidateEmail },
      { email_normalized: normalizedCandidateEmail },
      { login: normalizedCandidateEmail },
    ],
  };
}

async function countMatchesByCollection(db, normalizedCandidateEmail) {
  const existingCollectionsResult = await db.listCollections({}, { nameOnly: true }).toArray();
  const existingCollections = new Set(
    existingCollectionsResult
      .map((entry) => String(entry?.name || '').trim())
      .filter(Boolean),
  );

  const candidateFilter = buildCandidateFilter(normalizedCandidateEmail);
  let totalSafeCount = 0;

  for (const collectionName of CANDIDATE_COLLECTIONS) {
    if (!existingCollections.has(collectionName)) {
      continue;
    }

    const collection = db.collection(collectionName);
    const count = await collection.countDocuments(candidateFilter, { maxTimeMS: SERVER_SELECTION_TIMEOUT_MS });
    totalSafeCount += Number(count || 0);
  }

  return totalSafeCount;
}

async function runCandidateDiagnostic() {
  let connectionAttempted = false;
  let candidateDomain = 'unknown';
  let candidateEmailConfigured = false;
  let candidateEmailNormalized = false;

  try {
    const safeInput = assertSafeEnvironment();
    const { mongoUri, normalizedCandidateEmail } = safeInput;

    candidateDomain = safeInput.candidateDomain;
    candidateEmailConfigured = safeInput.candidateEmailConfigured;
    candidateEmailNormalized = safeInput.candidateEmailNormalized;

    connectionAttempted = true;
    await mongoose.connect(mongoUri, {
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
    const totalSafeCount = await countMatchesByCollection(db, normalizedCandidateEmail);
    const matchingCandidateCount = totalSafeCount;
    const candidateExists = matchingCandidateCount > 0;

    printSummary({
      diagnosticResult: 'green',
      connectionAttempted,
      readOnly: true,
      writesAttempted: false,
      seedMasterCleanupTouched: false,
      secretsPrinted: false,
      productionReady: false,
      candidateExists,
      candidateDomain,
      matchingCandidateCount,
      totalSafeCount,
      candidateEmailConfigured,
      candidateEmailNormalized,
    });

    return SUCCESS_EXIT_CODE;
  } catch {
    printSummary({
      diagnosticResult: 'red',
      connectionAttempted,
      readOnly: true,
      writesAttempted: false,
      seedMasterCleanupTouched: false,
      secretsPrinted: false,
      productionReady: false,
      candidateExists: false,
      candidateDomain,
      matchingCandidateCount: 0,
      totalSafeCount: 0,
      candidateEmailConfigured,
      candidateEmailNormalized,
    });

    return ABORT_EXIT_CODE;
  } finally {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch {
      // Fecha sem expor dados sensiveis.
    }
  }
}

const exitCode = await runCandidateDiagnostic();
process.exitCode = exitCode;
