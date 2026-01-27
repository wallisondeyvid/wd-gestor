import express from 'express';
import nodemailer from 'nodemailer';
import { sendMail } from '#core/mail/mailer.js';

export const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const info = {
      host: process.env.SMTP_HOST || null,
      port: process.env.SMTP_PORT || null,
      secure: process.env.SMTP_SECURE || null,
      from: process.env.SMTP_FROM_EMAIL || null,
      hasUser: !!process.env.SMTP_USER,
      hasPass: !!process.env.SMTP_PASS,
      node: process.version
    };
    return res.json({ ok:true, info });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

router.post('/test', async (req, res) => {
  try {
    const to = req.body?.to || (req.user && req.user.email) || process.env.SMTP_TEST_TO;
    if (!to) return res.status(400).json({ ok:false, error: 'Destinatário ausente (forneça body.to ou defina SMTP_TEST_TO)' });
    const info = await sendMail({ to, subject: 'Teste SMTP WDGestor', text: 'Teste de envio SMTP /debug/mailer/test', html: '<p>Teste SMTP</p>' });
    return res.json({ ok:true, messageId: info?.messageId, response: info?.response });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});
