import { Router } from 'express';
import mongoose from 'mongoose';
import Ferias from '#models/ferias.js';
import Ausencia from '#models/ausencia.js';
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
    const mod = await import('#models/unidade.js');
    return mod.default || mod.Unidade || mod;
  } catch (e1) {
    try {
      const mod2 = await import('#models/unidade.js');
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
router.get(['/ordinaria/listar','/extraordinaria/listar'], requireEscalasAuth, (req,res)=>{
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
function parseDisponibilidadeQuery(req){
  const { funcionarioId, inicio, fim } = req.query;
  return { funcionarioId, inicio, fim };
}

function validateDisponibilidadeQuery(input){
  const { funcionarioId, inicio, fim } = input;

  if(!funcionarioId || !inicio || !fim){ return 'Parâmetros obrigatórios: funcionarioId, inicio, fim'; }
  if(!mongoose.isValidObjectId(funcionarioId)){ return 'funcionarioId inválido'; }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)){ return 'Formato de data deve ser YYYY-MM-DD'; }
  if(fim < inicio){ return 'fim anterior a inicio'; }

  return null;
}

function buildDisponibilidadeBase({ inicio, fim, funcionarioId }){
  const dtIni = new Date(inicio+'T00:00:00');
  const dtFim = new Date(fim+'T00:00:00');
  const diffDias = Math.round((dtFim - dtIni)/86400000)+1;

  return { inicio, fim, funcionarioId, dtIni, dtFim, diffDias };
}

function buildDisponibilidadeBlockedSourcesQuery({ funcionarioId, inicio, fim }){
  return { funcionarioId, inicioISO:{ $lte:fim }, fimISO:{ $gte:inicio } };
}

function getDisponibilidadeBlockedSourcesProjection(){
  return { inicioISO:1, fimISO:1 };
}

function loadFeriasBlockedSource(query, projection){
  return Ferias.find(query, projection).lean();
}

function loadAusenciasBlockedSource(query, projection){
  return Ausencia.find(query, projection).lean();
}

async function loadDisponibilidadeBlockedSources({ funcionarioId, inicio, fim }){
  const query = buildDisponibilidadeBlockedSourcesQuery({ funcionarioId, inicio, fim });
  const projection = getDisponibilidadeBlockedSourcesProjection();

  const [ferias, ausencias] = await Promise.all([
    loadFeriasBlockedSource(query, projection),
    loadAusenciasBlockedSource(query, projection)
  ]);

  return { ferias, ausencias };
}

function clipRangeToBase(inicioISO, fimISO, baseIni, baseFim){
  const rangeInicio = new Date(inicioISO+'T00:00:00');
  const rangeFim = new Date(fimISO+'T00:00:00');

  if(rangeFim < baseIni || rangeInicio > baseFim) return null;

  const clippedInicio = new Date(Math.max(rangeInicio, baseIni));
  const clippedFim = new Date(Math.min(rangeFim, baseFim));
  if(clippedFim < clippedInicio) return null;

  return { ini: clippedInicio, fim: clippedFim };
}

function collectFeriasBlockedRanges(ferias, baseIni, baseFim){
  return ferias.reduce((blocks, item) => {
    const clipped = clipRangeToBase(item.inicioISO, item.fimISO, baseIni, baseFim);
    if(clipped){
      blocks.push({ ...clipped, tipo:'ferias' });
    }
    return blocks;
  }, []);
}

function collectAusenciasBlockedRanges(ausencias, baseIni, baseFim){
  return ausencias.reduce((blocks, item) => {
    const clipped = clipRangeToBase(item.inicioISO, item.fimISO, baseIni, baseFim);
    if(clipped){
      blocks.push({ ...clipped, tipo:'ausencia' });
    }
    return blocks;
  }, []);
}

function buildBlockedRanges({ ferias, ausencias, baseIniDate, baseFimDate }){
  return [
    ...collectFeriasBlockedRanges(ferias, baseIniDate, baseFimDate),
    ...collectAusenciasBlockedRanges(ausencias, baseIniDate, baseFimDate)
  ];
}

function mergeBlockedTypes(currentType, nextType){
  return currentType === nextType ? currentType : 'misto';
}

function mergeBlockedRanges(blocks){
  const sortedBlocks = [...blocks].sort((a,b)=> a.ini - b.ini || a.fim - b.fim);
  const merged=[];

  for(const block of sortedBlocks){
    if(!merged.length){
      merged.push({ ...block });
      continue;
    }

    const last=merged[merged.length-1];
    const nextDayAfterLast = new Date(last.fim);
    nextDayAfterLast.setDate(nextDayAfterLast.getDate()+1);

    if(block.ini <= nextDayAfterLast){
      if(block.fim > last.fim) last.fim = new Date(block.fim);
      last.tipo = mergeBlockedTypes(last.tipo, block.tipo);
    } else {
      merged.push({ ...block });
    }
  }

  return merged;
}

function buildFreeRangesFromMerged(merged, baseIni, baseFim){
  const free=[];
  let cursor = new Date(baseIni);

  for(const block of merged){
    if(block.ini > cursor){
      const freeFim = new Date(block.ini);
      freeFim.setDate(freeFim.getDate()-1);
      free.push({ ini:new Date(cursor), fim:freeFim });
    }

    cursor = new Date(block.fim);
    cursor.setDate(cursor.getDate()+1);
  }

  if(cursor <= baseFim){
    free.push({ ini:new Date(cursor), fim:new Date(baseFim) });
  }

  return free;
}

async function calculateDisponibilidadeRanges({ funcionarioId, inicio, fim, dtIni, dtFim }){
  const { ferias, ausencias } = await loadDisponibilidadeBlockedSources({ funcionarioId, inicio, fim });
  const blocks = buildBlockedRanges({ ferias, ausencias, baseIniDate: dtIni, baseFimDate: dtFim });
  const merged = mergeBlockedRanges(blocks);
  const free = buildFreeRangesFromMerged(merged, dtIni, dtFim);

  return { merged, free };
}

function toISODateString(date){
  const year = date.getFullYear();
  const month = String(date.getMonth()+1).padStart(2,'0');
  const day = String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}

function serializeBlockedRanges(blocked){
  return blocked.map(item => ({ inicio: toISODateString(item.ini), fim: toISODateString(item.fim), tipo:item.tipo }));
}

function serializeFreeRanges(free){
  return free.filter(item => item.fim >= item.ini).map(item => ({ inicio: toISODateString(item.ini), fim: toISODateString(item.fim) }));
}

function buildDisponibilidadePayload({ inicio, fim, funcionarioId, blocked, free }){
  return {
    base: { inicio, fim },
    funcionarioId,
    blocked: serializeBlockedRanges(blocked),
    free: serializeFreeRanges(free)
  };
}

function sendDisponibilidadeValidationError(res, message){
  return res.status(400).json({ ok:false, error:message });
}

function sendDisponibilidadeSuccess(res, payload){
  return res.json({ ok:true, data:payload });
}

function sendDisponibilidadeInternalError(res){
  return res.status(500).json({ ok:false, error:'Erro ao calcular disponibilidade' });
}

router.get('/api/disponibilidade-funcionario', requireEscalasAuth, async (req,res)=>{
  try {
    const input = parseDisponibilidadeQuery(req);
    const validationError = validateDisponibilidadeQuery(input);
    if(validationError){ return sendDisponibilidadeValidationError(res, validationError); }

    // Limite sanidade: máximo 370 dias
    const { funcionarioId, inicio, fim, dtIni, dtFim, diffDias } = buildDisponibilidadeBase(input);
    if(diffDias>370){ return sendDisponibilidadeValidationError(res, 'Janela muito extensa (>370 dias)'); }

    const { merged, free } = await calculateDisponibilidadeRanges({ funcionarioId, inicio, fim, dtIni, dtFim });

    return sendDisponibilidadeSuccess(res, buildDisponibilidadePayload({ inicio, fim, funcionarioId, blocked: merged, free }));
  } catch(err){
    console.error('[ESCALA][API][DISPONIBILIDADE] erro', err); return sendDisponibilidadeInternalError(res);
  }
});
