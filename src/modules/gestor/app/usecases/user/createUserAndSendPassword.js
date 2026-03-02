import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendMail } from '#core/mail/mailer.js';
import { welcomePassword } from '#modules/gestor/app/mail/templates/welcomePassword.js';
import { UserRepository } from '#modules/gestor/app/repositories/UserRepository.js';

function resolveAppUrl() {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL || '';
  const isVercel = !!process.env.VERCEL || !!vercelDomain;
  let raw = process.env.APP_URL || process.env.APP_BASE_URL || '';
  if (isVercel && /localhost/i.test(raw)) {
    raw = '';
  }
  if (!raw && vercelDomain) raw = vercelDomain;
  if (raw) {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    return raw.replace(/\/$/, '');
  }
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

function generateTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return result;
}

export async function createUserAndSendPassword({ nome, email, cpf, role, unidade_id, unitScope }) {
  const repo = new UserRepository({ unitScope: unitScope || { type: 'global', unidadeId: null } });
  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, 10);
  const createFn = typeof repo.createUser === 'function' ? repo.createUser.bind(repo) : repo.create.bind(repo);
  const user = await createFn({
    nome,
    email,
    cpf,
    role: role || 'user',
    unidade_id,
    senha: hash,
    primeiro_acesso: true,
    senha_provisoria: true,
    ativo: true,
  });

  const appUrl = resolveAppUrl();
  const { html, text } = welcomePassword({
    nome,
    email,
    senha: tempPassword,
    appName: process.env.APP_NAME || 'WD Gestor',
    appUrl,
  });

  try {
    await sendMail({
      to: `${nome || email} <${email}>`,
      subject: `Sua conta no ${process.env.APP_NAME || 'WD Gestor'}`,
      html,
      text,
      headers: { 'X-Entity-Ref-ID': user._id.toString() },
    });
  } catch (err) {
    console.error('[USER SERVICE] Falha ao enviar e-mail de senha provisória (detalhe):', err);
  }

  user._temp_password_plain = tempPassword;
  return user;
}
