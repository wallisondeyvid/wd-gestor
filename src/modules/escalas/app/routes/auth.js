import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import User from '#core/models/user.js';
import PasswordReset from '#core/models/passwordReset.js';
// Import do template de reset vindo do módulo Gestor.
// O caminho anterior para gestor subia apenas dois níveis (routes -> app -> escalas) e entrava em 'escalas/gestor',
// causando o erro de módulo não encontrado. Precisamos subir três níveis para alcançar 'modules'.
// Estrutura: modules/escalas/app/routes/auth.js -> subir 3 (routes->app->escalas) => modules/ -> gestor/...
import { resetPasswordTemplate } from '#core/mail/templates/resetPassword.js';
import nodemailer from 'nodemailer';
import Modulo from '#core/models/modulo.js';
import Funcionario from '#core/models/Funcionario.js';
import RememberToken from '#core/models/rememberToken.js';

const ROOT = process.cwd();

const router = Router();

// Middleware simples de auditoria para login do módulo Escalas
function auditLogin(req, res, next) {
  if (req.method !== 'POST') return next();
  req._loginAuditStart = Date.now();
  const ua = req.headers['user-agent'] || '-';
  const ip = req.ip || req.connection?.remoteAddress || '-';
  req._auditInfo = { ip, ua, email: (req.body?.email||'').toLowerCase() };
  res.on('finish', ()=>{
    if (req.originalUrl.startsWith('/escalas/login')) {
      const ms = Date.now() - (req._loginAuditStart||Date.now());
      console.info('[audit-escalas-login]', {
        email: req._auditInfo.email,
        ip: req._auditInfo.ip,
        ua: req._auditInfo.ua.substring(0,180),
        status: res.statusCode,
        location: res.getHeader('Location') || null,
        ms
      });
    }
  });
  next();
}

// Métricas de login (memória simples)
const loginMetrics = {
  success: 0,
  failure: 0,
  blocked: 0,
  lastSuccessAt: null,
  lastBlockedAt: null
};
globalThis.__ESCALAS_LOGIN_METRICS__ = loginMetrics;

function resolveAppUrl() {
  let raw = process.env.APP_URL || process.env.APP_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (raw) { if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`; return raw.replace(/\/$/,''); }
  return `http://localhost:${process.env.PORT||3000}`;
}

// Rota raiz do módulo -> decide entre dashboard ou login
router.get('/', async (req,res)=>{
  try {
    // Se o módulo estiver em estado "planejado" e o usuário NÃO for master,
    // não devemos direcionar para o dashboard — redireciona sempre para o login
    let planned = false;
    try {
      const modulo = await Modulo.findOne({ $or: [{ url_base: '/escalas' }, { nome: /escalas/i }] }).select('status').lean();
      planned = !!(modulo && String(modulo.status||'').toLowerCase() === 'planejado');
    } catch {}
    const isMaster = !!(req.session?.escalasUser?.role === 'master' || req.session?.user?.role === 'master');
    if (!planned || isMaster) {
      if (req.session?.escalasUser) return res.redirect('/escalas/dashboard');
    }
  } catch {}
  return res.redirect('/escalas/login');
});

router.get('/login', async (req,res)=>{
  try {
    // Login NUNCA deve aparecer como "em construção".
    // Se o módulo estiver "planejado" e o usuário não for master, NÃO redirecione ao dashboard
    let planned = false;
    try {
      const modulo = await Modulo.findOne({ $or: [{ url_base: '/escalas' }, { nome: /escalas/i }] }).select('status').lean();
      planned = !!(modulo && String(modulo.status||'').toLowerCase() === 'planejado');
    } catch {}
    const isMaster = !!(req.session?.escalasUser?.role === 'master' || req.session?.user?.role === 'master');
    if (!planned || isMaster) {
      if (req.session?.escalasUser) return res.redirect('/escalas/dashboard');
    }
  } catch {}
  // Reutiliza template compartilhado do Gestor
  res.render('gestor/logingestor', { title: 'Login - Escalas', moduleLabel: 'Escalas', basePath: '/escalas' });
});

router.post('/login', auditLogin, async (req,res)=>{
  try {
    const { email, senha, lembrar } = req.body;
    // PRG: Sempre redirecionar com 303 em respostas a POST para evitar re-POST (307) em plataformas serverless
    const seeOther = (url) => { try { res.setHeader('Cache-Control','no-store'); } catch(_){} return res.redirect(303, url); };
    if (!email || !senha) return seeOther('/escalas/login?erro=usuario');
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.ativo) return seeOther('/escalas/login?erro=usuario');

    // --- BLOQUEIO POR TENTATIVAS (replicado de Gestor) ---
    const maxTentativas = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
    const lockMinutos = Number(process.env.LOGIN_LOCK_MINUTES || 15);
    const agora = new Date();
    if (user.lock_until && user.lock_until > agora) {
      const minutosRestantes = Math.ceil((user.lock_until.getTime() - agora.getTime()) / 60000);
      const retrySeconds = Math.max(1, Math.ceil((user.lock_until.getTime() - agora.getTime()) / 1000));
      res.setHeader('Retry-After', retrySeconds);
      res.setHeader('X-Account-Lock-Until', user.lock_until.toISOString());
      res.setHeader('X-Account-Lock-Seconds', String(retrySeconds));
      res.setHeader('X-Account-Lock-Minutes', String(minutosRestantes));
      loginMetrics.blocked++; loginMetrics.lastBlockedAt = new Date();
      return seeOther('/escalas/login?erro=bloqueado&min=' + minutosRestantes);
    } else if (user.lock_until && user.lock_until <= agora) {
      user.lock_until = null; user.failed_login_attempts = 0; await user.save();
    }

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) {
      user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
      const baseDelay = Number(process.env.LOGIN_FAILED_DELAY_BASE_MS || 150);
      const maxDelay = Number(process.env.LOGIN_FAILED_DELAY_MAX_MS || 3000);
      const delay = Math.min(baseDelay * user.failed_login_attempts, maxDelay);
      if (user.failed_login_attempts >= maxTentativas) {
        user.lock_until = new Date(Date.now() + lockMinutos * 60000);
        await user.save();
        if (delay) await new Promise(r => setTimeout(r, delay));
        const lockMinutes = Math.ceil((user.lock_until.getTime() - Date.now()) / 60000);
        const lockSeconds = Math.ceil((user.lock_until.getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', lockSeconds);
        res.setHeader('X-Account-Lock-Until', user.lock_until.toISOString());
        res.setHeader('X-Account-Lock-Seconds', String(lockSeconds));
        res.setHeader('X-Account-Lock-Minutes', String(lockMinutes));
        return seeOther('/escalas/login?erro=bloqueado&min=' + lockMinutes);
      } else {
        await user.save();
        if (delay) await new Promise(r => setTimeout(r, delay));
      }
      const restantes = Math.max(0, maxTentativas - user.failed_login_attempts);
      res.setHeader('X-Account-Attempts-Used', String(user.failed_login_attempts));
      res.setHeader('X-Account-Attempts-Remaining', String(restantes));
      res.setHeader('X-Account-Attempts-Limit', String(maxTentativas));
      loginMetrics.failure++;
      return seeOther('/escalas/login?erro=senha&restantes=' + restantes);
    }

    // Sucesso: reset contadores
    if (user.failed_login_attempts || user.lock_until) {
      user.failed_login_attempts = 0; user.lock_until = null; await user.save();
    }
    loginMetrics.success++; loginMetrics.lastSuccessAt = new Date();
    
    // Checa se módulo está planejado e se usuário NÃO é master → redireciona para construcao
    let moduloPlanned = false;
    let moduloData = null;
    try {
      moduloData = await Modulo.findOne({ $or: [{ url_base: '/escalas' }, { nome: /escalas/i }] }).select('nome status url_base').lean();
      moduloPlanned = !!(moduloData && String(moduloData.status||'').toLowerCase() === 'planejado');
    } catch (eCheck) { console.warn('[escalas][login] falha checando módulo:', eCheck.message); }
    
    // Mantém sessão isolada para o módulo Escalas
    req.session.escalasUser = { id: user._id, email: user.email, nome: user.nome, role: user.role, isMaster: user.role === 'master' };
    if(user.unidade_id){
      try { req.session.escalasUser.unidade_id = user.unidade_id; } catch(_e){}
    }
    
    // Remember-me backend
    try {
      if (lembrar) {
        const days = Number(process.env.REMEMBER_TOKEN_DAYS || 30);
        const tokenPlain = crypto.randomBytes(48).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await RememberToken.create({ user_id: user._id, token_hash: tokenHash, user_agent: req.headers['user-agent'] || null, ip: req.ip, expiresAt });
        const cookieName = process.env.REMEMBER_COOKIE_NAME || 'wdg_remember';
        res.cookie(cookieName, tokenPlain, { httpOnly: true, secure: (process.env.COOKIE_SECURE === 'true'), sameSite: 'Lax', expires: expiresAt });
      }
    } catch (rtErr) { console.warn('[escalas][login] remember token falhou:', rtErr.message); }
    
    if (user.senha_provisoria || user.primeiro_acesso) return seeOther('/escalas/primeiroacesso');
    
    // Se módulo planejado e usuário não é master → redireciona para construcao
    if (moduloPlanned && user.role !== 'master') {
      console.info('[escalas][login] módulo planejado detectado para não-master → renderizando construcao');
      try { res.setHeader('Cache-Control','no-store'); } catch(_){}
      const moduleName = (moduloData?.nome || 'Escalas').toUpperCase();
      return res.status(200).render('partials/construcao', { moduleName, basePath: '/escalas' });
    }
    
    return seeOther('/escalas/dashboard');
  } catch (e) { console.error('[escalas][login] erro', e.message); return res.redirect(303, '/escalas/login?erro=servidor'); }
});

router.get('/logout', async (req,res)=>{ 
  try {
    const cookieName = process.env.REMEMBER_COOKIE_NAME || 'wdg_remember';
    const tokenPlain = req.cookies ? req.cookies[cookieName] : null;
    if (tokenPlain) {
      try {
        const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
        await RememberToken.updateOne({ token_hash: tokenHash }, { $set: { revoked: true, lastUsedAt: new Date() } });
      } catch (e) { console.warn('[escalas][logout] falha revogando remember token:', e.message); }
      res.clearCookie(cookieName);
    }
  } catch {}
  if (req.session) { delete req.session.escalasUser; }
  res.redirect('/escalas/login'); 
});

router.get('/primeiroacesso', (req,res)=>{
  if (!req.session?.escalasUser) return res.redirect('/escalas/login');
  res.render('gestor/primeiroacesso', { title: 'Primeiro Acesso - Escalas', moduleLabel:'Escalas', basePath:'/escalas' });
});

// Contato (compartilha template do Gestor)
router.get('/contato', (req,res)=>{
  res.render('gestor/contato', { title: 'Contato - Escalas', moduleLabel:'Escalas', basePath:'/escalas' });
});

router.post('/primeiroacesso', async (req,res)=>{
  try {
  // PRG 303 em POST de primeiro acesso também
  const seeOther = (url) => { try { res.setHeader('Cache-Control','no-store'); } catch(_){} return res.redirect(303, url); };
  if (!req.session?.escalasUser?.id) return seeOther('/escalas/login');
    const { senha, confirmar } = req.body;
    if (!senha || senha!==confirmar || senha.length < 8) return seeOther('/escalas/primeiroacesso?erro=validacao');
  const user = await User.findById(req.session.escalasUser.id);
    if (!user) return seeOther('/escalas/login');
    user.senha = await bcrypt.hash(senha, 10);
    user.primeiro_acesso = false; user.senha_provisoria = false;
    await user.save();
    return seeOther('/escalas/dashboard');
  } catch (e) { console.error('[escalas][primeiroacesso] erro', e.message); return res.redirect(303, '/escalas/primeiroacesso?erro=servidor'); }
});

router.get('/esquecisenha', (req,res)=> res.render('gestor/esquecisenha', { title:'Esqueci Minha Senha - Escalas', moduleLabel:'Escalas', basePath:'/escalas' }));

// Versão avançada (CPF + multi-email) - interface
router.get('/esquecisenha-avancado', (req,res)=> res.render('gestor/esquecisenha-avancada', { title:'Esqueci Minha Senha - Escalas', moduleLabel:'Escalas', basePath:'/escalas' }));

// Endpoint auxiliar: lista possíveis e-mails quando mais de um usuário compartilha o CPF
router.get('/esquecisenha-avancado/listar-emails', async (req,res)=>{
  try {
    const cpfDigits = String(req.query.cpf||'').replace(/\D/g,'');
    if (cpfDigits.length !== 11) return res.json({ emails: [] });
    // Busca direto no User e também via Funcionário se existir referência cpf no documento de usuário ou funcionario
    let usuarios = await User.find({ cpf: cpfDigits }).select('email').lean();
    if (!usuarios.length) {
      const funcs = await Funcionario.find({ cpf: cpfDigits }).select('id email').lean();
      if (funcs.length) {
        const ids = funcs.map(f=>f._id);
        usuarios = await User.find({ funcionario_id: { $in: ids } }).select('email').lean();
      }
    }
    const emails = usuarios.filter(u=>u.email).map(u=>u.email.toLowerCase()).filter((v,i,a)=>a.indexOf(v)===i);
    return res.json({ emails });
  } catch { return res.json({ emails: [] }); }
});

router.post('/esquecisenha', async (req,res)=>{
  try {
    const { email } = req.body;
  if (!email) return res.render('gestor/esquecisenha', { title:'Esqueci Senha Escalas', erro: 'Informe o e-mail', moduleLabel:'Escalas', basePath:'/escalas' });
    const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.render('gestor/esquecisenha', { title:'Esqueci Senha Escalas', sucesso: true, moduleLabel:'Escalas', basePath:'/escalas' });
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now()+30*60*1000);
    await PasswordReset.create({ user_id: user._id, token, expiresAt: expira });
    const link = `${resolveAppUrl()}/escalas/reset-password/${token}`;
    let html = resetPasswordTemplate(user.nome||'Usuário', link);
    if (typeof html === 'object') html = html.html || html.body || `<p>Redefina: <a href="${link}">${link}</a></p>`;
    try {
      const smtpUser = process.env.SMTP_USER; const smtpPass = process.env.SMTP_PASS;
      if (smtpUser && smtpPass) {
        const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, secure: process.env.SMTP_SECURE==='true', auth: { user: smtpUser, pass: smtpPass }});
        await transporter.sendMail({ from: process.env.MAIL_FROM||smtpUser, to: user.email, subject: 'Redefinição de Senha (Escalas)', html });
      } else { console.warn('[escalas][esquecisenha] SMTP não configurado'); }
    } catch (mailErr) { console.warn('[escalas][email] falha envio:', mailErr.message); }
    res.render('gestor/esquecisenha', { title:'Esqueci Minha Senha - Escalas', sucesso: true, moduleLabel:'Escalas', basePath:'/escalas' });
  } catch (e) { console.error('[escalas][esquecisenha] erro', e.message); res.render('gestor/esquecisenha', { title:'Esqueci Minha Senha - Escalas', erro: 'Erro inesperado', moduleLabel:'Escalas', basePath:'/escalas'}); }
});

// POST avançado: semelhante ao Gestor (CPF + confirmação de e-mail se múltiplos)
router.post('/esquecisenha-avancado', async (req,res)=>{
  try {
    const { cpf, emailConfirm } = req.body;
  if (!cpf) return res.render('gestor/esquecisenha-avancada', { erro: 'Informe o CPF', moduleLabel:'Escalas', basePath:'/escalas' });
    const cpfDigits = String(cpf).replace(/\D/g,'');
  if (cpfDigits.length !== 11) return res.render('gestor/esquecisenha-avancada', { erro: 'CPF inválido', moduleLabel:'Escalas', basePath:'/escalas' });
    // Coleta usuários pelo CPF direto ou via funcionario
    let usuarios = await User.find({ cpf: cpfDigits }).lean();
    if (!usuarios.length) {
      const funcs = await Funcionario.find({ cpf: cpfDigits }).select('_id').lean();
      if (funcs.length) {
        const ids = funcs.map(f=>f._id);
        usuarios = await User.find({ funcionario_id: { $in: ids } }).lean();
      }
    }
  if (!usuarios.length) return res.render('gestor/esquecisenha-avancada', { sucesso: true, moduleLabel:'Escalas', basePath:'/escalas' });
    let alvo = null;
    if (usuarios.length === 1) {
      alvo = usuarios[0];
    } else {
      // múltiplos -> exigir confirmação de e-mail
      if (!emailConfirm) {
  return res.render('gestor/esquecisenha-avancada', { erro: 'Confirme o e-mail selecionado.', moduleLabel:'Escalas', basePath:'/escalas' });
      }
      const lower = emailConfirm.toLowerCase();
      alvo = usuarios.find(u=>u.email?.toLowerCase()===lower) || null;
  if (!alvo) return res.render('gestor/esquecisenha-avancada', { erro: 'E-mail não corresponde aos registros.', moduleLabel:'Escalas', basePath:'/escalas' });
    }
  if (!alvo?.email) return res.render('gestor/esquecisenha-avancada', { sucesso: true, moduleLabel:'Escalas', basePath:'/escalas' });
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now()+30*60*1000);
    await PasswordReset.create({ user_id: alvo._id, token, expiresAt: expira });
    const link = `${resolveAppUrl()}/escalas/reset-password/${token}`;
    let html = resetPasswordTemplate(alvo.nome||'Usuário', link);
    if (typeof html === 'object') html = html.html || html.body || `<p>Redefina: <a href="${link}">${link}</a></p>`;
    try {
      const smtpUser = process.env.SMTP_USER; const smtpPass = process.env.SMTP_PASS;
      if (smtpUser && smtpPass) {
        const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, secure: process.env.SMTP_SECURE==='true', auth: { user: smtpUser, pass: smtpPass }});
        await transporter.sendMail({ from: process.env.MAIL_FROM||smtpUser, to: alvo.email, subject: 'Redefinição de Senha (Escalas)', html });
      } else { console.warn('[escalas][esquecisenha-avancado] SMTP não configurado'); }
    } catch (mailErr) { console.warn('[escalas][email-avancado] falha envio:', mailErr.message); }
    res.render('gestor/esquecisenha-avancada', { sucesso: true, moduleLabel:'Escalas', basePath:'/escalas' });
  } catch (e) { console.error('[escalas][esquecisenha-avancado] erro', e.message); res.render('gestor/esquecisenha-avancada', { erro: 'Erro inesperado', moduleLabel:'Escalas', basePath:'/escalas'}); }
});

router.get('/reset-password/:token', async (req,res)=>{
  try {
    const pr = await PasswordReset.findOne({ token: req.params.token });
    if (!pr || pr.expiresAt < new Date()) return res.render('gestor/reset-password-error', { title:'Link inválido', message:'Token inválido ou expirado', moduleLabel:'Escalas', basePath:'/escalas' });
    res.render('gestor/reset-password', { title:'Redefinir Senha - Escalas', token: req.params.token, moduleLabel:'Escalas', basePath:'/escalas' });
  } catch (e) { res.render('gestor/reset-password-error', { title:'Erro', message:'Falha ao validar token', moduleLabel:'Escalas', basePath:'/escalas'}); }
});

router.post('/reset-password', async (req,res)=>{
  try {
    const { token, senha, confirmar } = req.body;
  if (!token || !senha || senha !== confirmar) return res.render('gestor/reset-password-error', { title:'Erro', message:'Dados inválidos', moduleLabel:'Escalas', basePath:'/escalas' });
    const pr = await PasswordReset.findOne({ token });
  if (!pr || pr.expiresAt < new Date()) return res.render('gestor/reset-password-error', { title:'Link inválido', message:'Token inválido ou expirado', moduleLabel:'Escalas', basePath:'/escalas' });
    const user = await User.findById(pr.user_id || pr.userId);
  if (!user) return res.render('gestor/reset-password-error', { title:'Erro', message:'Usuário não encontrado', moduleLabel:'Escalas', basePath:'/escalas' });
    user.senha = await bcrypt.hash(senha, 10); user.senha_provisoria = false; user.primeiro_acesso = false; await user.save();
    await PasswordReset.deleteOne({ _id: pr._id });
    res.render('gestor/reset-password-success', { title:'Senha Redefinida', message:'Senha redefinida com sucesso.', loginLink:'/escalas/login', moduleLabel:'Escalas', basePath:'/escalas' });
  } catch (e) { console.error('[escalas][reset-password] erro', e.message); res.render('gestor/reset-password-error', { title:'Erro', message:'Erro ao redefinir senha', moduleLabel:'Escalas', basePath:'/escalas'}); }
});

export default router;
