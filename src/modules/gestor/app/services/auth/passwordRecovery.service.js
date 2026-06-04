import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { resetPasswordTemplate } from '#core/mail/templates/resetPassword.js';
import {
  createPasswordRecoveryTokenData,
  loadRecoveryUsersByCpfData,
} from '#modules/gestor/app/data/auth/passwordRecoveryRequestDataFacade.js';
import {
  completePasswordResetData,
  loadPasswordResetExecutionData,
} from '#modules/gestor/app/data/auth/resetPasswordExecutionDataFacade.js';
import {
  loadPasswordResetTokenData,
  loadPasswordResetUserNameData,
} from '#modules/gestor/app/data/auth/resetPasswordRenderDataFacade.js';

function resolveAppUrl() {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL || '';
  const isVercel = !!process.env.VERCEL || !!vercelDomain;
  let raw = process.env.APP_URL || process.env.APP_BASE_URL || '';
  if (isVercel && /localhost/i.test(raw)) raw = '';
  if (!raw && vercelDomain) raw = vercelDomain;
  if (raw) {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    return raw.replace(/\/$/, '');
  }
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return local[0] + '***@' + domain;
  const first = local[0];
  const last = local[local.length - 1];
  return first + '*'.repeat(local.length - 2) + last + '@' + domain;
}

function maskCpf(cpf) {
  const digits = String(cpf || '').replace(/\D/g, '');
  if (digits.length !== 11) return '***';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
}

function isValidRecoveryEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isEligibleRecoveryUser(user) {
  const email = String(user?.email || '').trim();
  if (!isValidRecoveryEmail(email)) return false;
  if (Object.prototype.hasOwnProperty.call(user || {}, 'ativo') && user.ativo === false) return false;
  return true;
}

function buildGenericPasswordRecoveryResponse() {
  return {
    status: 200,
    body: {
      success: true,
      message: 'Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação.',
    },
  };
}

function buildPasswordRecoveryLogMeta({ cpfDigits, eligibleCount, queuedCount, failedCount, skippedCount, maskedEmail, reason }) {
  const meta = {
    cpf: maskCpf(cpfDigits),
    eligibleCount,
  };
  if (typeof queuedCount === 'number') meta.queuedCount = queuedCount;
  if (typeof failedCount === 'number') meta.failedCount = failedCount;
  if (typeof skippedCount === 'number') meta.skippedCount = skippedCount;
  if (maskedEmail) meta.email = maskedEmail;
  if (reason) meta.reason = reason;
  return meta;
}

async function loadRecoveryUsersByCpf(cpfDigits) {
  return loadRecoveryUsersByCpfData({ cpfDigits });
}

function resolvePasswordResetUserId(passwordReset) {
  return passwordReset?.user_id || passwordReset?.userId || null;
}

function buildResetPasswordErrorResult({ title, message, showRetry }) {
  return {
    ok: false,
    view: 'reset-password-error',
    locals: { title, message, showRetry },
  };
}

function isPasswordResetInvalidOrExpired(passwordReset) {
  return !passwordReset || passwordReset.expiresAt < new Date();
}

export async function loadResetPasswordRenderModelService({ token } = {}) {
  const passwordReset = await loadPasswordResetTokenData({ token });
  if (isPasswordResetInvalidOrExpired(passwordReset)) {
    return buildResetPasswordErrorResult({
      title: 'Link inválido',
      message: 'Token inválido ou expirado',
      showRetry: true,
    });
  }

  let userName = 'Usuário';

  try {
    const userIdRef = resolvePasswordResetUserId(passwordReset);
    if (userIdRef) {
      const user = await loadPasswordResetUserNameData({ userId: userIdRef });
      if (user?.nome) userName = user.nome.split(' ')[0];
    }
  } catch {}

  return {
    ok: true,
    view: 'reset-password',
    locals: {
      title: 'Redefinir Senha',
      token,
      userName,
    },
  };
}

export async function resetPasswordByTokenService({ token, senha } = {}) {
  if (!token || !senha) {
    return buildResetPasswordErrorResult({
      title: 'Dados incompletos',
      message: 'Dados incompletos',
      showRetry: true,
    });
  }

  const { passwordReset, user } = await loadPasswordResetExecutionData({ token });
  if (isPasswordResetInvalidOrExpired(passwordReset)) {
    return buildResetPasswordErrorResult({
      title: 'Link inválido',
      message: 'Token inválido ou expirado',
      showRetry: true,
    });
  }

  if (!user) {
    return buildResetPasswordErrorResult({
      title: 'Usuário não encontrado',
      message: 'Usuário não encontrado',
      showRetry: false,
    });
  }

  const userId = resolvePasswordResetUserId(user) || user?._id || user?.user_id || user?.userId || null;
  if (!userId) {
    return buildResetPasswordErrorResult({
      title: 'Usuário não encontrado',
      message: 'Usuário não encontrado',
      showRetry: false,
    });
  }

  user._id = userId;

  const senhaHash = await bcrypt.hash(senha, 10);
  await completePasswordResetData({
    userId: user._id,
    passwordHash: senhaHash,
    passwordResetId: passwordReset._id,
  });

  return {
    ok: true,
    view: 'reset-password-success',
    locals: {
      title: 'Senha Redefinida',
      message: 'Sua senha foi redefinida com sucesso.',
    },
  };
}

export async function listRecoveryEmailsByCpfService({ cpf } = {}) {
  if (!cpf) return { status: 400, body: { success: false, message: 'CPF não informado.' } };

  const cpfDigits = String(cpf).replace(/\D/g, '');
  if (cpfDigits.length !== 11) {
    return { status: 400, body: { success: false, message: 'CPF inválido.' } };
  }

  return buildGenericPasswordRecoveryResponse();
}

export async function requestPasswordRecoveryService({ cpf, email, emailConfirm } = {}) {
  if (!cpf) return { status: 400, body: { success: false, message: 'CPF não informado.' } };

  const cpfDigits = String(cpf).replace(/\D/g, '');
  if (cpfDigits.length !== 11) {
    return { status: 400, body: { success: false, message: 'CPF inválido.' } };
  }

  const usuarios = await loadRecoveryUsersByCpf(cpfDigits);
  const eligibleUsers = usuarios
    .filter((user) => isEligibleRecoveryUser(user))
    .reduce((acc, user) => {
      const key = `${String(user?._id || '')}:${String(user?.email || '').trim().toLowerCase()}`;
      if (!key || acc.seen.has(key)) return acc;
      acc.seen.add(key);
      acc.items.push(user);
      return acc;
    }, { seen: new Set(), items: [] })
    .items;

  console.info('password recovery requested', buildPasswordRecoveryLogMeta({
    cpfDigits,
    eligibleCount: eligibleUsers.length,
  }));

  if (!eligibleUsers.length) {
    console.info('password recovery mail skipped', buildPasswordRecoveryLogMeta({
      cpfDigits,
      eligibleCount: 0,
      skippedCount: 1,
      reason: 'no-eligible-users',
    }));
    return buildGenericPasswordRecoveryResponse();
  }

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const haveCreds = !!(smtpUser && smtpPass);
  const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const ignoreTLS = String(process.env.SMTP_IGNORE_TLS || '').toLowerCase() === 'true';
  const requireTLS = String(process.env.SMTP_REQUIRE_TLS || '').toLowerCase() === 'true';
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: haveCreds ? { user: smtpUser, pass: smtpPass } : undefined,
    tls: (ignoreTLS || requireTLS) ? { rejectUnauthorized: false } : undefined,
    ignoreTLS,
    requireTLS,
  });

  if (haveCreds) {
    try {
      await transporter.verify();
    } catch {
      console.warn('password recovery mail skipped', buildPasswordRecoveryLogMeta({
        cpfDigits,
        eligibleCount: eligibleUsers.length,
        skippedCount: eligibleUsers.length,
        reason: 'smtp-verify-failed',
      }));
    }
  }

  let queuedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const appBase = resolveAppUrl();
  const recoveryTokensByUserId = new Map();
  for (const user of eligibleUsers) {
    const userId = String(user?._id || '');
    if (!userId) continue;

    let recoveryToken = recoveryTokensByUserId.get(userId);
    if (!recoveryToken) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await createPasswordRecoveryTokenData({ userId: user._id, rawToken, expiresAt });
      recoveryToken = { rawToken, expiresAt };
      recoveryTokensByUserId.set(userId, recoveryToken);
    }

    const link = `${appBase.replace(/\/$/, '')}/gestor/reset-password/${recoveryToken.rawToken}`;
    let html = '';
    let text = '';
    try {
      const tplResult = resetPasswordTemplate(user.nome || 'Usuário', link);
      if (typeof tplResult === 'string') {
        html = tplResult;
      } else if (tplResult && typeof tplResult === 'object') {
        html = tplResult.html || tplResult.HTML || tplResult.body || '';
        text = tplResult.text || tplResult.TEXT || '';
        if (!html) html = `<p>Redefina sua senha pelo link recebido por e-mail.</p>`;
      } else {
        html = `<p>Redefina sua senha pelo link recebido por e-mail.</p>`;
      }
    } catch {
      html = `<p>Redefina sua senha pelo link recebido por e-mail.</p>`;
    }

    if (!haveCreds) {
      skippedCount += 1;
      console.info('password recovery mail skipped', buildPasswordRecoveryLogMeta({
        cpfDigits,
        eligibleCount: eligibleUsers.length,
        skippedCount,
        maskedEmail: maskEmail(user.email),
        reason: 'smtp-missing-credentials',
      }));
      continue;
    }

    try {
      const mailOptions = {
        from: process.env.MAIL_FROM || smtpUser || 'no-reply@wdgestor.local',
        to: user.email,
        subject: 'Redefinição de Senha',
        html,
      };
      if (text) mailOptions.text = text;
      await transporter.sendMail(mailOptions);
      queuedCount += 1;
      console.info('password recovery mail queued', buildPasswordRecoveryLogMeta({
        cpfDigits,
        eligibleCount: eligibleUsers.length,
        queuedCount,
        maskedEmail: maskEmail(user.email),
      }));
    } catch {
      failedCount += 1;
      console.warn('password recovery mail failed', buildPasswordRecoveryLogMeta({
        cpfDigits,
        eligibleCount: eligibleUsers.length,
        failedCount,
        maskedEmail: maskEmail(user.email),
      }));
    }
  }

  return buildGenericPasswordRecoveryResponse();
}

export default {
  loadResetPasswordRenderModelService,
  resetPasswordByTokenService,
  requestPasswordRecoveryService,
  listRecoveryEmailsByCpfService,
};
