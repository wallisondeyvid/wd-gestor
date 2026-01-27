import { Router } from 'express';

const router = Router();

router.get('/dashboard', (req,res)=>{
  if (!req.session?.escalasUser) return res.redirect('/escalas/login');
  res.render('dashboard-escalas', { title: 'Dashboard - Escalas' });
});

// Alguns formulários antigos submetem POST /escalas/dashboard; redireciona para GET idempotente
router.post('/dashboard', (req,res)=>{
  return res.redirect(303, '/escalas/dashboard');
});

router.get('/contato', (req,res)=>{
  res.render('gestor/contato', { title: 'Contato - Escalas', moduleLabel:'Escalas', basePath:'/escalas' });
});

// Rota de health simples (sem auth)
router.get('/health', (req,res)=>{
  res.json({ status:'ok', ts: new Date().toISOString() });
});

// Rota de métricas (requer login Escalas)
// Para evitar import circular, acessamos via require no momento de uso se necessário
router.get('/metrics', (req,res)=>{
  if (!req.session?.escalasUser) return res.status(401).json({ error:'unauthorized' });
  // As métricas ficam anexadas ao authRouter (export? usamos globalThis) – simplificação: armazenadas em globalThis.
  const metrics = globalThis.__ESCALAS_LOGIN_METRICS__ || { success:0,failure:0,blocked:0,lastSuccessAt:null,lastBlockedAt:null };
  res.json(metrics);
});

export default router;
