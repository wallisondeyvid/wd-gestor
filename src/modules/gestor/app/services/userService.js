import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendMail } from '#core/mail/mailer.js';
import { welcomePassword } from '#modules/gestor/app/mail/templates/welcomePassword.js';
import User from '#core/models/user.js';

function resolveAppUrl() {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL || '';
  const isVercel = !!process.env.VERCEL || !!vercelDomain;
  let raw = process.env.APP_URL || process.env.APP_BASE_URL || '';
  // Em ambientes Vercel, evitar localhost em links externos
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
  let result='';
  for(let i=0;i<8;i++){ result += chars.charAt(Math.floor(Math.random()*chars.length)); }
  return result;
}

export async function createUserAndSendPassword({ nome, email, cpf, role, unidade_id, funcionario_id, senha }) {
  const tempPassword = senha || generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, 10);
  const user = await User.create({ nome, email, cpf, role: role || 'user', unidade_id, funcionario_id, senha: hash, primeiro_acesso: true, senha_provisoria: true, ativo: true });
  const appUrl = resolveAppUrl();
  const { html, text } = welcomePassword({ nome, email, senha: tempPassword, appName: process.env.APP_NAME || 'WD Gestor', appUrl });
  console.log('[USER SERVICE][createUserAndSendPassword] Preparando envio boas-vindas', { email, appUrl });
  try {
    const info = await sendMail({ to: `${nome || email} <${email}>`, subject: `Sua conta no ${process.env.APP_NAME || 'WD Gestor'}`, html, text, headers:{ 'X-Entity-Ref-ID': user._id.toString() } });
    console.log(`[USER SERVICE] E-mail de boas-vindas enviado para ${email}`, { messageId: info?.messageId });
  } catch(err){
    console.error('[USER SERVICE] Falha ao enviar e-mail de senha provisória (detalhe):', err);
    user._temp_password_plain = tempPassword;
  }
  user._temp_password_plain = tempPassword; return user;
}
