import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import process from 'node:process';
import User from '#core/models/user.js';

const ABORT_EXIT_CODE = 1;
const SUCCESS_EXIT_CODE = 0;
const CONNECTION_TIMEOUT_MS = 8000;
const SOCKET_TIMEOUT_MS = 8000;
const SERVER_SELECTION_TIMEOUT_MS = 8000;
const ALLOWED_MUTATION = 'password-rotate-fictional-user-only';
const EXPECTED_EMAIL = 'teste.login@example.com';
const EXPECTED_DOMAIN = 'example.com';

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
  error.name = 'ControlledFictionalPasswordRotateAbortError';
  return error;
}

function isKnownMasterEmail(normalizedEmail) {
  const blockedMasterEmails = [
    normalizeEmail(process.env.WDG_MASTER_EMAIL || ''),
    normalizeEmail(process.env.MASTER_EMAIL || ''),
  ].filter(Boolean);

  return blockedMasterEmails.includes(normalizedEmail);
}

function assertSafeEnvironment() {
  const mongoUri = String(process.env.MONGODB_URI || '').trim();
  if (!mongoUri) {
    throw buildAbortError('MONGODB_URI ausente ou vazio.');
  }

  if (isEnabledFlag(process.env.MONGO_MEMORY)) {
    throw buildAbortError('MONGO_MEMORY=1 bloqueia rotacao controlada em Mongo real.');
  }

  if (!isEnabledFlag(process.env.WDG_ALLOW_FICTIONAL_USER_PASSWORD_ROTATE)) {
    throw buildAbortError('WDG_ALLOW_FICTIONAL_USER_PASSWORD_ROTATE=1 e obrigatorio.');
  }

  const normalizedCandidateEmail = normalizeEmail(process.env.WDG_LOGIN_EMAIL || '');
  if (!normalizedCandidateEmail) {
    throw buildAbortError('WDG_LOGIN_EMAIL ausente ou vazio.');
  }

  if (isKnownMasterEmail(normalizedCandidateEmail)) {
    throw buildAbortError('WDG_LOGIN_EMAIL nao pode apontar para usuario master.');
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

function isMasterUser(user) {
  return user?.role === 'master' || user?.global_role === 'master';
}

async function findCandidateUsers(normalizedCandidateEmail) {
  return User.find({ email: normalizedCandidateEmail })
    .select('_id role global_role')
    .lean()
    .maxTimeMS(SERVER_SELECTION_TIMEOUT_MS);
}

async function runControlledPasswordRotation() {
  let connectionAttempted = false;
  let writesAttempted = false;
  let rotated = false;
  let candidateDomain = 'unknown';
  let candidateExists = false;
  let matchingCandidateCountSafe = 0;

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

    const candidateUsers = await findCandidateUsers(normalizedCandidateEmail);
    matchingCandidateCountSafe = Number(candidateUsers.length || 0);
    candidateExists = matchingCandidateCountSafe > 0;

    if (!candidateExists) {
      throw buildAbortError('Candidato ficticio ausente; rotacao bloqueada.');
    }

    if (matchingCandidateCountSafe !== 1) {
      throw buildAbortError('Quantidade de candidatos ficticios invalida; rotacao bloqueada.');
    }

    const candidateUser = candidateUsers[0];
    if (isMasterUser(candidateUser)) {
      throw buildAbortError('Candidato nao pode possuir perfil master.');
    }

    const passwordHash = await bcrypt.hash(candidatePassword, 10);

    writesAttempted = true;
    const updateResult = await User.updateOne(
      {
        _id: candidateUser._id,
        email: normalizedCandidateEmail,
        role: { $ne: 'master' },
        global_role: { $ne: 'master' },
      },
      { $set: { senha: passwordHash } },
      { runValidators: false },
    );

    rotated = Number(updateResult?.modifiedCount || 0) === 1;
    if (!rotated) {
      throw buildAbortError('Rotacao nao confirmou exatamente uma senha atualizada.');
    }

    printSummary({
      rotationResult: 'green',
      connectionAttempted,
      allowedMutation: ALLOWED_MUTATION,
      writesAttempted,
      rotated,
      candidateDomain,
      candidateExists,
      matchingCandidateCountSafe,
      passwordHashPrinted: false,
      secretsPrinted: false,
      productionReady: false,
    });

    return SUCCESS_EXIT_CODE;
  } catch {
    printSummary({
      rotationResult: 'red',
      connectionAttempted,
      allowedMutation: ALLOWED_MUTATION,
      writesAttempted,
      rotated,
      candidateDomain,
      candidateExists,
      matchingCandidateCountSafe,
      passwordHashPrinted: false,
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

const exitCode = await runControlledPasswordRotation();
process.exitCode = exitCode;