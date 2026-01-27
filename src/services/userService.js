import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendMail } from '#core/mail/mailer.js';
import { welcomePassword } from '../mail/templates/welcomePassword.js';
// Importar o modelo User
import User from '#core/models/user.js';

function generateTempPassword() {
  // Gerar senha alfanumérica mais segura (8 caracteres)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function resolveAppUrl() {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL || '';
  const isVercel = !!process.env.VERCEL || !!vercelDomain;
  let raw = process.env.APP_URL || process.env.APP_BASE_URL || '';
  // Se estiver em Vercel e APP_URL aponta para localhost, ignore e use domínio da Vercel
  if (isVercel && /localhost/i.test(raw)) {
    raw = '';
  }
  // Se APP_URL não definido (ou descartado), usar domínio do deploy (Vercel)
  if (!raw && vercelDomain) raw = vercelDomain;
  if (raw) {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    return raw.replace(/\/$/, '');
  }
  // Fallback de desenvolvimento
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

async function createUserAndSendPassword({ nome, email, cpf, role, unidade_id, funcionario_id, senha }) {
  // Usar senha fornecida ou gerar uma nova se não fornecida
  const tempPassword = senha || generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, 10);

  const user = await User.create({
    nome,
    email,
    cpf, // Adicionar CPF do funcionário
    role: role || 'user',
    unidade_id,
    funcionario_id,
    senha: hash, // Usar 'senha' em vez de 'password' conforme o modelo
    primeiro_acesso: true, // Forçar mudança de senha no primeiro acesso
    ativo: true
  });

  const appUrl = resolveAppUrl();
  const { html, text } = welcomePassword({ nome, email, senha: tempPassword, appName: process.env.APP_NAME || 'WD Gestor', appUrl });
  console.log('[USER SERVICE ROOT][createUserAndSendPassword] Preparando envio boas-vindas', { email, appUrl });

  try {
    const info = await sendMail({ to: `${nome || email} <${email}>`, subject: `Sua conta no ${process.env.APP_NAME || 'WD Gestor'}`, html, text, headers: { 'X-Entity-Ref-ID': user._id.toString() } });
    console.log(`[USER SERVICE ROOT] E-mail de boas-vindas enviado para ${email}`, { messageId: info?.messageId });
  } catch (err) {
    console.error('[USER SERVICE ROOT] Falha ao enviar e-mail de senha provisória (detalhe):', err);
    user._temp_password_plain = tempPassword;
  }

  // Sempre incluir a senha temporária na resposta para desenvolvimento/teste
  user._temp_password_plain = tempPassword;

  return user;
}

export { createUserAndSendPassword };