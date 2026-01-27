// Mailer centralizado em core/mail
import nodemailer from 'nodemailer';
import os from 'os';

let transporter;

async function buildTransport() {
  if (transporter) return transporter;
  const hasCreds = !!(process.env.SMTP_HOST && process.env.SMTP_FROM_EMAIL);
  if (!hasCreds) {
    console.warn('[MAILER] Variáveis SMTP básicas ausentes. Gerando conta Ethereal (modo desenvolvimento).');
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    console.log('[MAILER] Ethereal user:', testAccount.user);
  } else {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    console.log('[MAILER][config]', { host, port, secure, authUser: !!user, from: process.env.SMTP_FROM_EMAIL });
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      tls: { rejectUnauthorized: false }
    }, {
      // Default headers
      'X-Mailer-App': 'WDGestor',
      'X-Node-Version': process.version,
      'X-Hostname': os.hostname()
    });
  }
  try {
    console.time('[MAILER] verify');
    await transporter.verify();
    console.timeEnd('[MAILER] verify');
    console.log('[MAILER] SMTP ready');
  } catch(e){ console.error('[MAILER] Falha verify:', e.message); }
  return transporter;
}

export async function sendMail({ to, subject, html, text, headers, replyTo }) {
  const t = await buildTransport();
  const fromEmail = process.env.SMTP_FROM_EMAIL || 'no-reply@example.test';
  const fromName  = process.env.SMTP_FROM_NAME || 'WD Gestor';
  const from = `"${fromName}" <${fromEmail}>`;
  const start = Date.now();
  console.log('[MAILER] Enviando e-mail', { to, subject, from, hasHtml: !!html, hasText: !!text });
  try {
    const info = await t.sendMail({ from, to, subject, html, text, replyTo: replyTo || process.env.SMTP_REPLY_TO, headers });
    const ms = Date.now() - start;
    console.log('[MAILER] Envio concluído', { messageId: info?.messageId, response: info?.response, ms });
    if (nodemailer.getTestMessageUrl && info?.messageId) {
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) console.log('[MAILER] Preview URL:', preview);
    }
    return info;
  } catch (e) {
    const ms = Date.now() - start;
    console.error('[MAILER] Erro ao enviar', { err: e.message, code: e.code, command: e.command, ms });
    throw e;
  }
}

export default { sendMail };
