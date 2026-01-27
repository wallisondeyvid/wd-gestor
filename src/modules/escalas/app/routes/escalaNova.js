import { Router } from 'express';
import mongoose from 'mongoose';
import Ferias from '../../../../../models/ferias.js';
import Ausencia from '../../../../../models/ausencia.js';
import { relatorioEscalaHandler } from './relatorios.js';

const router = Router();

// Middleware simples de auth (mesmo padrão dashboard)
function requireEscalasAuth(req, res, next){
  if(!req.session?.escalasUser) return res.redirect('/escalas/login');
  next();
}

// Rota para renderizar o modal de detalhamento equipe dia
router.get('/modal-detalhamento-equipe-dias', requireEscalasAuth, async (req, res) => {
  try {
    const { equipeId, dataISO, turnoIni, turnoFim, grupoId } = req.query;
    // Aqui você pode buscar dados adicionais se necessário
    // Por enquanto, apenas renderiza o modal EJS
    res.render('modais_popups/modal_detalhamento_equipe_dia', {
      equipeId,
      dataISO,
      turnoIni,
      turnoFim,
      grupoId
    });
  } catch (err) {
    console.error('[escala][modal-detalhamento] erro', err);
    res.status(500).send('Erro ao carregar modal');
  }
});

// Função para renderizar nova escala
function renderNovaEscala(req, res) {
  const tipoEscala = req.path.includes('/extraordinaria/') ? 'extraordinaria' : 'ordinaria';
  const usuario = req.session?.escalasUser || null;
  // Renderiza diretamente a view index (todas as abas + modais + scripts)
  res.render('escala_nova_index', { title: 'Nova Escala', tipoEscala, usuario });
}

// Rotas canônicas (dentro do app montado em /escalas)
router.get(['/ordinaria/nova','/extraordinaria/nova'], requireEscalasAuth, renderNovaEscala);

// ====== Rotas de Pesquisa de Escalas ======
async function getUnidadeModel(){
  try {
    const mod = await import('#core/models/unidade.js');
    return mod.default || mod.Unidade || mod;
  } catch (e1) {
    try {
      const mod2 = await import('../../../../../src/core/models/unidade.js');
      return mod2.default || mod2.Unidade || mod2;
    } catch (e2) {
      console.error('[escalaNova][pesquisar] Falha carregando Unidade:', e1?.message||e1, e2?.message||e2);
      throw e2 || e1;
    }
  }
}

async function renderPesquisarEscala(req,res){
  const tipoEscala = req.path.includes('/extraordinaria/') ? 'extraordinaria' : 'ordinaria';
  const usuario = req.session?.escalasUser || null;
  let unidades = [];
  try {
    const Unidade = await getUnidadeModel();
    const isMaster = !!(usuario && (usuario.isMaster || usuario.role === 'master'));
    const isAdmin = !!(usuario && usuario.role === 'admin');
    const campos = 'codigo nome is_principal unidade_principal_id';
    if (isMaster || isAdmin) {
      unidades = await Unidade.find({}).select(campos).lean();
      // ordenação consistente
      unidades.sort((a,b)=>{
        if(!!b.is_principal - !!a.is_principal !== 0) return (!!b.is_principal - !!a.is_principal);
        const ca = (a.codigo||'').localeCompare(b.codigo||''); if(ca!==0) return ca; return (a.nome||'').localeCompare(b.nome||'');
      });
    } else if (usuario && usuario.unidade_id) {
      // cluster do usuário: matriz + filiais
      const u = await Unidade.findById(usuario.unidade_id).lean();
      if (u) {
        const matrizId = u.is_principal ? u._id : (u.unidade_principal_id || u._id);
        const todas = await Unidade.find({ $or: [{ _id: matrizId }, { unidade_principal_id: matrizId }] }).select(campos).lean();
        const matriz = todas.find(x=> String(x._id) === String(matrizId));
        const filiais = todas.filter(x=> String(x._id) !== String(matrizId));
        filiais.sort((a,b)=> (a.codigo||'').localeCompare(b.codigo||'') || (a.nome||'').localeCompare(b.nome||''));
        unidades = [ matriz, ...filiais ].filter(Boolean);
      }
    } else {
      // fallback suave: somente matrizes
      unidades = await Unidade.find({ is_principal: true }).select(campos).lean();
      unidades.sort((a,b)=> (a.codigo||'').localeCompare(b.codigo||'') || (a.nome||'').localeCompare(b.nome||''));
    }
  } catch (e) {
    console.warn('[escalaNova][pesquisar] unidades indisponíveis:', e.message);
  }
  res.render('pesquisar_escala', { title:'Pesquisar Escalas', tipoEscala, usuario, unidades });
}
router.get(['/ordinaria/pesquisar','/extraordinaria/pesquisar'], requireEscalasAuth, (req,res)=>{
  renderPesquisarEscala(req,res);
});

// ====== Rota Escala Diária (view) ======
function renderEscalaDiaria(req,res){
  const usuario = req.session?.escalasUser || null;
  res.render('escalas/escala_diaria', { title:'Escala Diária', usuario });
}
router.get('/diaria', requireEscalasAuth, renderEscalaDiaria);

// Aliases duplicados (quando chegam já com /escalas/ prefixado dentro do mount)
router.get(['/escalas/ordinaria/nova','/escalas/extraordinaria/nova'], requireEscalasAuth, (req,res)=>{
  const clean = req.path.replace(/^\/escalas\//,'/');
  return res.redirect(clean); // redireciona para a rota canônica
});

// Redirect de raiz sem prefixo (acesso direto sem /escalas)
router.get(['/ordinaria/nova','/extraordinaria/nova'].map(p=> '/'+p.replace(/^\//,'')), (req,res,next)=>{
  // Se este router estiver acoplado diretamente em outro contexto sem o mount correto, garante canonicalização
  if(!req.baseUrl || req.baseUrl === ''){
    return res.redirect('/escalas' + req.path);
  }
  next();
});

// ====== Fallback de Relatórios (PDF) neste router também ======
router.get('/relatorios/escala', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorios/escala.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorios/escala/:id', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorios/escala/:id.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala/:id', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala/:id.pdf', requireEscalasAuth, relatorioEscalaHandler);

export default router;

// ====== API de Disponibilidade de Funcionário no Período da Escala ======
// GET /escalas/api/disponibilidade-funcionario?funcionarioId=...&inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// Retorna blocos livres e bloqueados (férias + ausências) dentro do período base
router.get('/api/disponibilidade-funcionario', requireEscalasAuth, async (req,res)=>{
  try {
    const { funcionarioId, inicio, fim } = req.query;
    if(!funcionarioId || !inicio || !fim){ return res.status(400).json({ ok:false, error:'Parâmetros obrigatórios: funcionarioId, inicio, fim' }); }
    if(!mongoose.isValidObjectId(funcionarioId)){ return res.status(400).json({ ok:false, error:'funcionarioId inválido' }); }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)){ return res.status(400).json({ ok:false, error:'Formato de data deve ser YYYY-MM-DD' }); }
    if(fim < inicio){ return res.status(400).json({ ok:false, error:'fim anterior a inicio' }); }
    // Limite sanidade: máximo 370 dias
    const dtIni=new Date(inicio+'T00:00:00'); const dtFim=new Date(fim+'T00:00:00');
    const diffDias = Math.round((dtFim - dtIni)/86400000)+1; if(diffDias>370){ return res.status(400).json({ ok:false, error:'Janela muito extensa (>370 dias)' }); }

    function clip(a,b,baseIni,baseFim){ // retorna [max(a,baseIni), min(b,baseFim)] ou null
      if(b < baseIni || a > baseFim) return null; const ini=Math.max(a,baseIni); const fim=Math.min(b,baseFim); if(fim<ini) return null; return [ini,fim]; }
    function toISO(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
    function addDay(d){ const nd=new Date(d.getTime()); nd.setDate(nd.getDate()+1); return nd; }

    // Busca blocos de férias e ausências sobrepostos ao período base
    const ferias = await Ferias.find({ funcionarioId, inicioISO:{ $lte:fim }, fimISO:{ $gte:inicio } }, { inicioISO:1, fimISO:1 }).lean();
    const ausencias = await Ausencia.find({ funcionarioId, inicioISO:{ $lte:fim }, fimISO:{ $gte:inicio } }, { inicioISO:1, fimISO:1 }).lean();

    const baseIniDate=dtIni; const baseFimDate=dtFim;
    const blocks=[]; // {ini:Date,fim:Date,tipo:'ferias'|'ausencia'}
    ferias.forEach(f=>{ const c=clip(new Date(f.inicioISO+'T00:00:00'), new Date(f.fimISO+'T00:00:00'), baseIniDate, baseFimDate); if(c) blocks.push({ ini:new Date(c[0]), fim:new Date(c[1]), tipo:'ferias' }); });
    ausencias.forEach(a=>{ const c=clip(new Date(a.inicioISO+'T00:00:00'), new Date(a.fimISO+'T00:00:00'), baseIniDate, baseFimDate); if(c) blocks.push({ ini:new Date(c[0]), fim:new Date(c[1]), tipo:'ausencia' }); });

    // Merge de blocos sobrepostos/adjacentes preservando tipos (se múltiplos tipos, marcar 'misto')
    blocks.sort((a,b)=> a.ini - b.ini || a.fim - b.fim);
    const merged=[];
    for(const b of blocks){
      if(!merged.length){ merged.push({ ...b }); continue; }
      const last=merged[merged.length-1];
      if(b.ini <= addDay(last.fim)){ // sobreposto ou adjacente (fim+1 >= ini) -> mescla
        if(b.fim > last.fim) last.fim = new Date(b.fim);
        if(last.tipo !== b.tipo) last.tipo = 'misto';
      } else {
        merged.push({ ...b });
      }
    }

    // Subtração: base - merged => free intervals
    const free=[];
    let cursor = new Date(baseIniDate);
    for(const blk of merged){
      if(blk.ini > cursor){ // intervalo livre antes do bloco
        free.push({ ini:new Date(cursor), fim:new Date(new Date(blk.ini).setDate(blk.ini.getDate()-1)) });
      }
      cursor = new Date(blk.fim); cursor.setDate(cursor.getDate()+1); // dia após o bloco
    }
    if(cursor <= baseFimDate){ free.push({ ini:new Date(cursor), fim:new Date(baseFimDate) }); }

    function toObj(int){ return { inicio: toISO(int.ini), fim: toISO(int.fim) }; }
    const blockedOut = merged.map(m=>({ inicio: toISO(m.ini), fim: toISO(m.fim), tipo:m.tipo }));
    const freeOut = free.filter(f=> f.fim >= f.ini).map(toObj);

    return res.json({ ok:true, data:{ base:{ inicio, fim }, funcionarioId, blocked: blockedOut, free: freeOut } });
  } catch(err){
    console.error('[ESCALA][API][DISPONIBILIDADE] erro', err); return res.status(500).json({ ok:false, error:'Erro ao calcular disponibilidade' });
  }
});
