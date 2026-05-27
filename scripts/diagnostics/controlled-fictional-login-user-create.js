import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import process from 'node:process';
import User from '#core/models/user.js';

const ABORT_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;
const CONNECTION_TIMEOUT_MS = 8000;
const SOCKET_TIMEOUT_MS = 8000;
const SERVER_SELECTION_TIMEOUT_MS = 8000;
const ALLOWED_MUTATION = 'user-insert-fictional-only';
const EXPECTED_EMAIL = 'teste.login@example.com';
const EXPECTED_DOMAIN = 'example.com';
const EXPECTED_NAME = 'Usuario Teste Login';

function printSummary(fields) {
  for (const [key, value] of Object.entries(fields)) {
    console.log(`${key}=${value}`);
  }
}

function isEnabledFlag(rawValue) {
  return String(rawValue || '').trim().toLowerCase() === '1';
}

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase();
}

function extractDomain(normalizedEmail) {
  const atIndex = normalizedEmail.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) return '';
  return normalizedEmail.slice(atIndex + 1);
}

function buildAbortError(reason) {
  const error = new Error(reason);
  error.name = 'ControlledFictionalUserCreateAbortError';
  return error;
}

function assertSafeEnvironment() {
  const mongoUri = String(process.env.MONGODB_URI || '').trim();
  if (!mongoUri) {
    throw buildAbortError('MONGODB_URI ausente ou vazio.');
  }

  if (isEnabledFlag(process.env.MONGO_MEMORY)) {
    throw buildAbortError('MONGO_MEMORY=1 bloqueia criacao controlada em Mongo real.');
  }

  if (!isEnabledFlag(process.env.WDG_ALLOW_FICTIONAL_USER_CREATE)) {
    throw buildAbortError('WDG_ALLOW_FICTIONAL_USER_CREATE=1 e obrigatorio.');
  }

  const normalizedCandidateEmail = normalizeEmail(process.env.WDG_LOGIN_EMAIL || '');
  if (!normalizedCandidateEmail) {
    throw buildAbortError('WDG_LOGIN_EMAIL ausente ou vazio.');
  }

  if (normalizedCandidateEmail !== EXPECTED_EMAIL) {
    throw buildAbortError('WDG_LOGIN_EMAIL deve ser exatamente o candidato ficticio permitido.');
  }

  const candidateDomain = extractDomain(normalizedCandidateEmail);
  if (candidateDomain !== EXPECTED_DOMAIN) {
    throw buildAbortError('Dominio do candidato invalido; apenas example.com e permitido.');
  }

  const candidatePassword = String(process.env.WDG_LOGIN_PASSWORD || '');
  if (!candidatePassword.trim()) {
    throw buildAbortError('WDG_LOGIN_PASSWORD ausente ou vazio.');
  }

  return {
    mongoUri,
    normalizedCandidateEmail,
    candidateDomain,
    candidatePassword,
  };
}

async function runControlledCreation() {
  let connectionAttempted = false;
  let writesAttempted = false;
  let created = false;
  let candidateDomain = 'unknown';
  let createdUserIdRedacted = false;

  try {
    const safeInput = assertSafeEnvironment();
    const { mongoUri, normalizedCandidateEmail, candidatePassword } = safeInput;

    candidateDomain = safeInput.candidateDomain;
    connectionAttempted = true;

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      connectTimeoutMS: CONNECTION_TIMEOUT_MS,
      socketTimeoutMS: SOCKET_TIMEOUT_MS,
      maxPoolSize: 1,
      minPoolSize: 0,
      retryReads: false,
      retryWrites: false,
      family: 4,
      autoIndex: false,
      autoCreate: false,
    });

    const existingCandidate = await User.exists({ email: normalizedCandidateEmail });
    if (existingCandidate) {
      throw buildAbortError('Candidato ficticio ja existe; insercao bloqueada.');
    }

    const passwordHash = await bcrypt.hash(candidatePassword, 10);
    const userPayload = {
      email: normalizedCandidateEmail,
      nome: EXPECTED_NAME,
      senha: passwordHash,
      ativo: true,
      role: 'user',
      primeiro_acesso: false,
      senha_provisoria: false,
    };

    // Primeira versao cria apenas o usuario ficticio permitido, sem memberships nem fluxos administrativos.
    writesAttempted = true;
    const createdUser = await User.create(userPayload);
    created = Boolean(createdUser?._id);
    createdUserIdRedacted = created ? 'redacted' : false;

    printSummary({
      creationResult: 'green',
      connectionAttempted,
      allowedMutation: ALLOWED_MUTATION,
      writesAttempted,
      created,
      candidateDomain,
      createdUserIdRedacted,
      secretsPrinted: false,
      productionReady: false,
    });

    return SUCCESS_EXIT_CODE;
  } catch {
    // Mantem a saida restrita aos campos seguros aprovados para este microfluxo.
    printSummary({
      creationResult: 'red',
      connectionAttempted,
      allowedMutation: ALLOWED_MUTATION,
      writesAttempted,
      created,
      candidateDomain,
      createdUserIdRedacted,
      secretsPrinted: false,
      productionReady: false,
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

const exitCode = await runControlledCreation();
process.exitCode = exitCode;
