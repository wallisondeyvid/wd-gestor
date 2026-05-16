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

  const userId = typeof resolvePasswordResetUserId === 'function'
    ? resolvePasswordResetUserId(user)
    : user?._id || user?.user_id || user?.userId || null;
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

  const usuarios = await loadRecoveryUsersByCpf(cpfDigits);
  if (!usuarios.length) {
    return { status: 404, body: { success: false, message: 'Nenhum usuário com este CPF.' } };
  }

  const masked = usuarios.map((user) => ({ email: maskEmail(user.email), original: user.email }));
  return {
    status: 200,
    body: { success: true, quantidade: usuarios.length, emails: masked },
  };
}

export async function requestPasswordRecoveryService({ cpf, email, emailConfirm } = {}) {
  if (!cpf) return { status: 400, body: { success: false, message: 'CPF não informado.' } };

  const cpfDigits = String(cpf).replace(/\D/g, '');
  if (cpfDigits.length !== 11) {
    return { status: 400, body: { success: false, message: 'CPF inválido.' } };
  }

  const usuarios = await loadRecoveryUsersByCpf(cpfDigits);
  if (!usuarios.length) {
    return { status: 404, body: { success: false, message: 'Nenhum usuário com este CPF.' } };
  }

  if (usuarios.length > 1 && !email) {
    return {
      status: 200,
      body: {
        success: false,
        reason: 'multiple-users',
        maskedEmails: usuarios.map((user) => maskEmail(user.email)),
      },
    };
  }

  const chosenEmail = email || (usuarios.length === 1 ? usuarios[0].email : null);
  if (!chosenEmail) return { status: 400, body: { success: false, message: 'E-mail requerido.' } };
  if (emailConfirm && chosenEmail.toLowerCase() !== emailConfirm.toLowerCase()) {
    return { status: 400, body: { success: false, message: 'Confirmação de e-mail não confere.' } };
  }

  const user = usuarios.find((item) => item.email.toLowerCase() === chosenEmail.toLowerCase());
  if (!user) {
    return { status: 404, body: { success: false, message: 'E-mail não associado a este CPF.' } };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + 30 * 60 * 1000);
  await createPasswordRecoveryTokenData({ userId: user._id, token, expiresAt: expira });

  const appBase = resolveAppUrl();
  const link = `${appBase.replace(/\/$/, '')}/gestor/reset-password/${token}`;

  let html = '';
  let text = '';
  try {
    const tplResult = resetPasswordTemplate(user.nome || 'Usuário', link);
    if (typeof tplResult === 'string') {
      html = tplResult;
    } else if (tplResult && typeof tplResult === 'object') {
      html = tplResult.html || tplResult.HTML || tplResult.body || '';
      text = tplResult.text || tplResult.TEXT || '';
      if (!html) html = `<p>Redefina sua senha: <a href="${link}">${link}</a></p>`;
    } else {
      html = `<p>Redefina sua senha: <a href="${link}">${link}</a></p>`;
    }
  } catch (tplErr) {
    console.warn('[postEsqueciSenha] falha ao montar template, usando fallback:', tplErr.message);
    html = `<p>Redefina sua senha: <a href="${link}">${link}</a></p>`;
  }

  console.info('[postEsqueciSenha] template montado', { hasHtml: !!html, htmlLength: html.length, hasText: !!text });

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const haveCreds = !!(smtpUser && smtpPass);
  if (!haveCreds) {
    console.warn('[postEsqueciSenha] SMTP_USER/SMTP_PASS ausentes. Envio real será pulado.');
  }
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

  let debugError = null;
  let debugLink = link;
  if (haveCreds) {
    try {
      try {
        await transporter.verify();
        console.info('[postEsqueciSenha] SMTP verificado', { host: smtpHost, port: smtpPort, secure: smtpSecure, user: smtpUser });
      } catch (verErr) {
        console.warn('[postEsqueciSenha] Falha verify SMTP (prosseguindo):', verErr.message);
      }
      const mailOptions = {
        from: process.env.MAIL_FROM || smtpUser || 'no-reply@wdgestor.local',
        to: user.email,
        subject: 'Redefinição de Senha',
        html,
      };
      if (text) mailOptions.text = text;
      const sendResult = await transporter.sendMail(mailOptions);
      console.info('[postEsqueciSenha] email enviado', {
        messageId: sendResult.messageId,
        accepted: sendResult.accepted,
        rejected: sendResult.rejected,
      });
    } catch (sendErr) {
      debugError = sendErr.message;
      console.warn('[postEsqueciSenha] Falha ao enviar email:', sendErr.message);
      console.info('[postEsqueciSenha] Link de redefinição:', link);
      console.info('[postEsqueciSenha] HTML (fallback log)\n---INICIO---\n' + html + '\n---FIM---');
    }
  } else {
    console.info('[postEsqueciSenha] (modo sem credenciais) Link de redefinição:', link);
  }

  const payload = {
    success: true,
    message: 'Se o e-mail existir e estiver ativo, você receberá instruções em alguns instantes.',
  };
  if (process.env.NODE_ENV !== 'production') {
    payload.debugLink = debugLink;
    if (debugError) payload.debugError = debugError;
  }

  return { status: 200, body: payload };
}

export default {
  loadResetPasswordRenderModelService,
  resetPasswordByTokenService,
  requestPasswordRecoveryService,
  listRecoveryEmailsByCpfService,
};
