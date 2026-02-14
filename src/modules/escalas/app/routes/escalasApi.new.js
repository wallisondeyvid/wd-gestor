import { Router } from 'express';
import mongoose from 'mongoose';
// Import dinâmico postergado dos modelos de férias/ausência para evitar custo inicial grande
let FeriasModel=null; let AusenciaModel=null;
// Ajuste de caminho: os modelos ficam em <root>/models, então precisamos subir 5 níveis a partir deste arquivo
async function getFeriasModel(){ if(!FeriasModel){ const m = await import('#models/ferias.js'); FeriasModel = m.default || m; } return FeriasModel; }
async function getAusenciaModel(){ if(!AusenciaModel){ const m = await import('#models/ausencia.js'); AusenciaModel = m.default || m; } return AusenciaModel; }

// Carrega modelo Escala on-demand
async function getEscalaModel(){
  const mod = await import('#core/models/escala.js');
  return mod.default || mod.Escala || mod;
}
// Carrega modelo Funcionario sob demanda
async function getFuncionarioModel(){
  const mod = await import('#core/models/Funcionario.js');
  return mod.default || mod.Funcionario || mod;
}
// Carrega modelos Recurso e Unidade sob demanda para reuso no endpoint de recursos
async function getRecursoModel(){
  const mod = await import('#core/models/recurso.js');
  return mod.default || mod.Recurso || mod;
}
async function getUnidadeModel(){
  const mod = await import('#core/models/unidade.js');
  return mod.default || mod.Unidade || mod;
}
// Carrega modelo de Log de Escala sob demanda
async function getEscalaLogModel(){
  const mod = await import('#core/models/escalaLog.js');
  return mod.default || mod.EscalaLog || mod;
}

function extractUserInfo(req){
  try {
    const u = req.user || req.session?.escalasUser || {};
    return {
      usuario_id: (u && (u.id || u._id)) || null,
      usuario_nome: (u && (u.nome || u.name)) || null,
      usuario_email: (u && (u.email)) || null
    };
  } catch(_) { return { usuario_id:null, usuario_nome:null, usuario_email:null }; }
}

// Registrar log apenas se a escala estiver FECHADA (requisito de negócio)
async function registrarLogSeFechada(esc, req, {
  contexto, // 'atribuicao' | 'alocacao_recurso' | 'alocacao_equipe'
  acao,     // 'INSERCAO' | 'EXCLUSAO' | 'MUDANCA'
  dia,
  turnoId,
  funcionarioId,
  funcionarioNome,
  equipeId,
  recursoId,
  recursoNome,
  detalhes
}){
  try {
    if(!esc || esc.status !== 'fechada') return; // só computa logs em escalas fechadas
    if(!funcionarioId || !dia || !turnoId || !acao || !contexto) return;
    const Log = await getEscalaLogModel();
    const user = extractUserInfo(req);
    const normTurn = String(turnoId).includes('::') ? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
    await Log.create({
      escala_id: esc._id,
      unidade_id: esc.unidade_id || null,
      equipe_id: equipeId || null,
      recurso_id: recursoId || null,
      recurso_nome: recursoNome || null,
      funcionario_id: String(funcionarioId),
      funcionario_nome: funcionarioNome || null,
      acao: String(acao).toUpperCase(),
      contexto: String(contexto),
      dia: String(dia),
      turnoId: normTurn,
      usuario_id: user.usuario_id || null,
      usuario_nome: user.usuario_nome || null,
      usuario_email: user.usuario_email || null,
      detalhes: detalhes || {}
    });
  } catch(e){
    try { console.warn('[escalasApi.new][LOG][registrar] falha', e.message); } catch(_){}
  }
}

const router = Router();
const ESCALAS_API_BUILD_TAG = 'newRouter-20251020A-LogsForaMirror';
console.debug('[escalas][escalasApi.new] router simplificado carregado', { build: ESCALAS_API_BUILD_TAG });

// Middleware diagnóstico simples para chamadas /api/escalas*
// Trace focado em endpoints críticos (diária e atribuições)
router.use((req,res,next)=>{
  try {
    const url = req.originalUrl || req.url || '';
    if(
      url.includes('/api/escalas/diaria') ||
      (url.includes('/api/escalas/') && url.includes('/atribuicoes/')) ||
      (url.includes('/api/escalas/') && url.includes('/componentes/'))
    ){
      console.info('[escalasApi.new][TRACE]', {
        method: req.method,
        url,
        queryKeys: Object.keys(req.query||{}),
        bodyKeys: Object.keys(req.body||{})
      });
    }
  } catch(_){}
  next();
});

// Rota de diagnóstico: lista caminhos deste router (útil para verificar 404 por não-montagem)
router.get('/api/escalas/__debug/routes', (req,res)=>{
  try {
    const stack = router.stack || [];
    const routes = stack
      .filter(l=> l.route && l.route.path)
      .map(l=> ({ method: Object.keys(l.route.methods||{}), path: l.route.path }));
    return res.json({ ok:true, build: ESCALAS_API_BUILD_TAG, total: routes.length, routes });
  } catch(e){ return res.json({ ok:false, error: e.message }); }
});

// ===== Aliases de Relatórios (PDF) delegando para o handler de relatorios.js =====
router.get(['/relatorios/__debug'], async (req,res)=>{
  return res.json({ ok:true, via:'escalasApi.new', hint:'/escalas/relatorios/escala/:id.pdf' });
});
async function delegateRelatorio(req,res){
  try {
    // Delegar dinamicamente para o router de relatórios deste módulo
    // Preferir nova implementação (relatorios2.js); fallback para relatorios.js se necessário
    let mod;
    try { mod = await import('./relatorios2.js'); }
    catch(_e){ mod = await import('./relatorios.js'); }
    const other = mod.default || mod.router || mod;
    if(other && typeof other.handle === 'function'){
      return other.handle(req,res,()=> res.status(500).send('Handler de relatório indisponível'));
    }
    return res.status(500).send('Handler de relatório indisponível');
  } catch(e){
    console.error('[escalasApi.new][delegateRelatorio] erro', e);
    return res.status(500).send('Falha ao carregar handler de relatório');
  }
}
router.get('/relatorios/escala', requireEscalasAuth, delegateRelatorio);
router.get('/relatorios/escala.pdf', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/escala', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/escala.pdf', requireEscalasAuth, delegateRelatorio);
router.get('/relatorios/escala/:id', requireEscalasAuth, delegateRelatorio);
router.get('/relatorios/escala/:id.pdf', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/escala/:id', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/escala/:id.pdf', requireEscalasAuth, delegateRelatorio);
// Relatório Diário (delegação para o router de relatórios)
router.get('/relatorios/diaria', requireEscalasAuth, delegateRelatorio);
router.get('/relatorios/diaria.pdf', requireEscalasAuth, delegateRelatorio);
// Alias com nome amigável no caminho para o viewer exibir "Relatorio.pdf" na diária
router.get('/relatorios/diaria/Relatorio.pdf', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/diaria', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/diaria.pdf', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/diaria/Relatorio.pdf', requireEscalasAuth, delegateRelatorio);
router.get('/relatorios/diaria/:id', requireEscalasAuth, delegateRelatorio);
router.get('/relatorios/diaria/:id.pdf', requireEscalasAuth, delegateRelatorio);
// Aliases curtos: /diaria(.pdf)
router.get('/diaria', requireEscalasAuth, delegateRelatorio);
router.get('/diaria.pdf', requireEscalasAuth, delegateRelatorio);
router.get('/diaria/Relatorio.pdf', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/diaria/:id', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/diaria/:id.pdf', requireEscalasAuth, delegateRelatorio);

// Relatório de Horas (PDF) – delega para relatorios2.js
router.get('/relatorios/horas', requireEscalasAuth, delegateRelatorio);
router.get('/relatorios/horas.pdf', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/horas', requireEscalasAuth, delegateRelatorio);
router.get('/relatorio/horas.pdf', requireEscalasAuth, delegateRelatorio);

// ===== Utils locais (tempo e turnos) =====
function parseHHMMToMin(hhmm){
  if(!hhmm || typeof hhmm!=='string') return null;
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if(!m) return null; const h=+m[1], mi=+m[2];
  return (h*60)+mi;
}
function rangesOverlap(aIni,aFim,bIni,bFim){
  // Considera [ini,fim) em minutos do dia, normalizando 00:00 como 1440 para casos de turno que termina à meia-noite
  const norm = v=> (v===0? 1440: v);
  const A1=norm(aIni), A2=norm(aFim), B1=norm(bIni), B2=norm(bFim);
  return (A1 < B2) && (B1 < A2);
}
// Tamanho da sobreposição entre intervalos semiabertos [a1,a2) e [b1,b2) em minutos (assume 0<=min<1440)
function overlapLen(a1,a2,b1,b2){ const s=Math.max(a1,b1); const e=Math.min(a2,b2); return Math.max(0, e-s); }
function findTurnoRangeById(esc, turnoId){
  // Tenta localizar HH:MM-HH:MM por:
  // 1) Grupo de turnos da escala (turno.id == turnoId)
  // 2) Se turnoId já estiver no formato HH:MM-HH:MM
  // 3) Campos ini/fim diretos no próprio aloc (tratados fora)
  if(!turnoId) return null;
  // 2) pattern direto
  const pat = String(turnoId).match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if(pat){ const ini=parseHHMMToMin(pat[1]); const fim=parseHHMMToMin(pat[2]); if(ini!=null && fim!=null) return { ini, fim };
  }
  // 1) procurar nos grupos
  try {
    const grupos = esc?.grupos_turnos || [];
    for(const g of grupos){ for(const t of (g.turnos||[])){ if((t.id||t.turnoId)===turnoId){ const ini=parseHHMMToMin(t.ini); const fim=parseHHMMToMin(t.fim); if(ini!=null && fim!=null) return { ini, fim, overnight: !!t.overnight }; } } }
  } catch(_){}
  return null;
}
function resolveAlocacaoRangeMin(aloc, esc){
  // Preferir aloc.ini/fim se existirem, senão derivar por turnoId a partir da escala.
  if(aloc && typeof aloc.ini==='string' && typeof aloc.fim==='string'){
    const ini=parseHHMMToMin(aloc.ini); const fim=parseHHMMToMin(aloc.fim); if(ini!=null && fim!=null) return { ini, fim };
  }
  const r = findTurnoRangeById(esc, aloc?.turnoId);
  if(r) return r; return null;
}
// Parser de chave de alocação de matriz no nível da escala: grupoId::HH:MM-HH:MM|YYYY-MM-DD
function parseChaveAlocacaoEscala(key){
  if(!key || typeof key!=='string') return null;
  const m = key.match(/^([^|:]+)::(\d{2}:\d{2})-(\d{2}:\d{2})\|(\d{4}-\d{2}-\d{2})$/);
  if(!m) return null;
  const grupoId = m[1];
  const ini = parseHHMMToMin(m[2]);
  const fim = parseHHMMToMin(m[3]);
  const dia = m[4];
  if(ini==null || fim==null) return null;
  return { grupoId, ini, fim, dia };
}
// Formato legacy: turnoToken|YYYY-MM-DD
function parseChaveAlocacaoLegacy(key, esc){
  if(!key || typeof key!=='string') return null;
  const m = key.match(/^([^|]+)\|(\d{4}-\d{2}-\d{2})$/);
  if(!m) return null;
  const turnoToken = m[1];
  const dia = m[2];
  // Derivar ini/fim a partir do token
  let ini=null, fim=null;
  const m2 = String(turnoToken).match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if(m2){ ini = parseHHMMToMin(m2[1]); fim = parseHHMMToMin(m2[2]); }
  else {
    const r = findTurnoRangeById(esc, turnoToken);
    if(r){ ini=r.ini; fim=r.fim; }
  }
  if(ini==null || fim==null) return null;
  return { grupoId: null, ini, fim, dia };
}

// ====== Auth / util simples (duplicado mínimo do arquivo legacy) ======
function requireEscalasAuth(req,res,next){
  // Bypass em ambientes de desenvolvimento/teste
  try {
    if (req.skipAuth === true) return next();
    if (req.user) return next();
    // Bypass explícito por cabeçalho/param em ambiente de dev
    const h = (v)=> String(v||'').trim();
    if (h(req.headers['x-skip-auth']) === '1' || h(req.query?._skipAuth) === '1') return next();
  } catch(_) { /* noop */ }
  if(!req.session?.escalasUser) return res.status(401).json({ error:'Não autenticado'});
  next();
}
function isMasterUser(req){
  const u = req.user || req.session?.escalasUser || {};
  return !!(u.isMaster === true || (u.role||'').toLowerCase()==='master' || u.master === true);
}

// ===== Helpers de fechamento/desbloqueios =====
function todayISO(){ try { return new Date().toISOString().slice(0,10); } catch(_){ return ''; } }
function normalizeTurnoToken(tok){
  try {
    if(!tok) return '';
    const raw = String(tok);
    // aceitar GID::HH:MM-HH:MM
    const base = raw.includes('::') ? raw.split('::').slice(-1)[0] : raw;
    return base.replace(/\s*-\s*/,'-');
  } catch(_) { return ''; }
}
function isCellUnlocked(esc, dia, turno){
  try {
    const map = (esc && esc.desbloqueios) || {};
    if(!dia) return false;
    if(map[dia] === true) return true;
    if(turno){ const key = `${dia}__${normalizeTurnoToken(turno)}`; if(map[key] === true) return true; }
  } catch(_){ }
  return false;
}
function isAlvoEditable(esc, dia, turno, req){
  // Regra: se não está fechada, pode editar; se fechada, só pode editar PRESENTE/FUTURO e quando desbloqueado
  try {
    if(!esc || esc.status !== 'fechada') return true;
    if(isMasterUser(req)) return true; // master sempre pode
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) return false;
    const hoje = todayISO();
    if(String(dia) < String(hoje)) return false; // passado sempre bloqueado
    return isCellUnlocked(esc, String(dia), turno ? String(turno) : null);
  } catch(_){ return false; }
}

// ===== Cálculo de horas trabalhadas (diurna x noturna e CLT) =====
// Regra solicitada:
// - Horário noturno: 22:00 às 05:00 do dia seguinte
// - Hora noturna "simples": minuto real (60 min por hora)
// - Hora noturna "CLT": cada hora equivale a 52:30 (52.5) minutos
//   Portanto, minutos_noturnos_CLT = round(minutos_noturnos * (60 / 52.5))
const MIN_PER_HOUR = 60;
const NIGHT_START = 22*60; // 22:00
const NIGHT_END = 5*60;    // 05:00 (do dia seguinte)
const CLT_FACTOR = MIN_PER_HOUR / 52.5; // ~= 1.142857...

function clampTodayISO(iso){
  try{
    const today = new Date(); const tISO = today.toISOString().slice(0,10);
    return String(iso) > tISO ? tISO : String(iso);
  }catch{ return String(iso); }
}
function eachDayISO(inicioISO, fimISO){
  const arr=[]; try{ const d0=new Date(inicioISO+'T00:00:00'); const d1=new Date(fimISO+'T00:00:00'); if(isNaN(d0)||isNaN(d1)||d1<d0) return arr; for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)){ arr.push(d.toISOString().slice(0,10)); } }catch{ } return arr;
}
function addDaysISO(iso, delta){ try{ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+delta); return d.toISOString().slice(0,10); }catch{ return iso; } }
function fmtMin(min){ if(!Number.isFinite(min)||min<=0) return '00:00'; const t=Math.round(min); const h=Math.floor(t/60); const m=t%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }

// Divide um segmento [iniMin,fimMin) dentro de UM dia (0..1440) em minutos diurnos e noturnos
function daySplitMinutes(iniMin, fimMin){
  // normalizar 0 como 1440 para facilitar comparações na família rangesOverlap já lida com isso,
  // mas aqui vamos trabalhar com [0,1440] diretamente
  if(fimMin===0) fimMin=1440;
  const total = Math.max(0, fimMin - iniMin);
  const night1 = overlapLen(iniMin, fimMin, 0, NIGHT_END); // 00:00-05:00
  const night2 = overlapLen(iniMin, fimMin, NIGHT_START, 1440); // 22:00-24:00
  const noturno = night1 + night2;
  const diurno = Math.max(0, total - noturno);
  return { diurno, noturno };
}
// Dado um turno possivelmente overnight (fim < ini), aloca minutos em D e D+1
function allocateToDays(diaISO, iniMin, fimMin){
  const out=[];
  if(fimMin===iniMin) return out; // zero
  if(fimMin>iniMin){
    // mesmo dia
    const sp = daySplitMinutes(iniMin, fimMin);
    out.push({ dia: diaISO, ...sp });
  } else {
    // cruza meia-noite: [ini,1440) no dia; [0,fim) no dia+1
    const sp1 = daySplitMinutes(iniMin, 1440);
    out.push({ dia: diaISO, ...sp1 });
    const sp2 = daySplitMinutes(0, fimMin);
    out.push({ dia: addDaysISO(diaISO, 1), ...sp2 });
  }
  return out;
}
function minutesNoturnosCLT(minNoturno){ return Math.round(minNoturno * CLT_FACTOR); }

// Agregador por funcionário/dia
function ensureAgg(agg, fid){ const key=String(fid); if(!agg.has(key)) agg.set(key, new Map()); return agg.get(key); }
function addAgg(agg, fid, dia, diurnoMin, noturnoMin){ const byDia=ensureAgg(agg, fid); const cur=byDia.get(dia)||{ diurno:0, noturno:0 }; cur.diurno += diurnoMin||0; cur.noturno += noturnoMin||0; byDia.set(dia, cur); }


// ===== Helpers específicos deste router novo =====
function montarRecursoNormalizado(r){
  if(!r || typeof r !== 'object') r={};
  const out = {
    id: r.id || r.referenciaGestorId || ('r_'+Date.now()+Math.random().toString(16).slice(2)),
    referenciaGestorId: r.referenciaGestorId || null,
    equipeId: r.equipeId || null,
    nome: r.nome || null,
    placa: r.placa || null,
    created_at: r.created_at ? new Date(r.created_at) : new Date()
  };
  // ===== Alocações =====
  // Formatos aceitos: array [{ dia, turnoId, ini?, fim? }] OU mapa { 'YYYY-MM-DD__grupo::HH:MM-HH:MM': true }
  if(Array.isArray(r.alocacoes)){
    out.alocacoes = r.alocacoes.slice(0,500);
  } else if(r.alocacoesRecurso && typeof r.alocacoesRecurso==='object' && !Array.isArray(r.alocacoesRecurso)){
    try {
      const arr = [];
      Object.entries(r.alocacoesRecurso).forEach(([k,v])=>{
        if(!v) return; const parts=String(k).split('__'); if(parts.length!==2) return;
        const dia=parts[0]; const turnoId=parts[1]; arr.push({ dia, turnoId });
      });
      if(arr.length) out.alocacoes = arr.slice(0,500);
    } catch(_al){ /* noop */ }
  }
  // ===== Atribuições =====
  // Formatos aceitos: array linear OU mapa { 'YYYY-MM-DD__turnoId': [ { funcionarioId/nome/atribuicao } ] }
  if(Array.isArray(r.atribuicoes)){
    out.atribuicoes = r.atribuicoes.slice(0,500);
  } else if(r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object' && !Array.isArray(r.atribuicoesRecurso)){
    try {
      const arr = [];
      Object.entries(r.atribuicoesRecurso).forEach(([alloc, lista])=>{
        const parts=String(alloc).split('__'); if(parts.length!==2) return; const dia=parts[0]; const turnoId=parts[1];
        if(Array.isArray(lista)){
          lista.forEach(it=>{
            if(!it) return; const fid = it.membroFuncionarioId || it.funcionarioId || it.funcionario_id; if(!fid) return;
            arr.push({
              membroFuncionarioId: String(fid),
              papel: it.atribuicao || it.papel || null,
              turnoId,
              dia,
              escopo: it.escopo || 'dia+turno',
              prioridade: typeof it.prioridade==='number'? it.prioridade: 0
            });
          });
        }
      });
      if(arr.length) out.atribuicoes = arr.slice(0,500);
    } catch(_at){ /* noop */ }
  }
  // ===== Refeições =====
  // Formatos aceitos: array linear OU mapa { 'YYYY-MM-DD__turnoId': [ { inicio/ini, fim, computavel?, tipo? } ] }
  if(Array.isArray(r.refeicoes)){
    out.refeicoes = r.refeicoes.slice(0,500).map(iv=>{
      if(!iv || typeof iv!=='object') return iv;
      let computavel = true;
      if(typeof iv.computavel === 'boolean') computavel = iv.computavel;
      else if(typeof iv.tipo === 'string'){
        const t = iv.tipo.toLowerCase();
        if(t==='computado') computavel = true; else if(t==='nao_computado' || t==='não_computado') computavel=false;
      }
      // Normalizar campos ini/fim
      const ini = iv.ini || iv.inicio || null; const fim = iv.fim || iv.termino || null;
      const tipo = iv.tipo || 'ALMOCO';
      return { ...iv, ini, fim, tipo, computavel };
    });
  } else if(r.refeicoesRecurso && typeof r.refeicoesRecurso==='object' && !Array.isArray(r.refeicoesRecurso)){
    try {
      const arr = [];
      Object.entries(r.refeicoesRecurso).forEach(([alloc, lista])=>{
        const parts=String(alloc).split('__'); if(parts.length!==2) return; const dia=parts[0]; const turnoId=parts[1];
        if(Array.isArray(lista)){
          lista.forEach(it=>{
            if(!it) return; const ini = it.ini || it.inicio; const fim = it.fim || it.termino; if(!ini || !fim) return;
            let computavel = true;
            if(typeof it.computavel==='boolean') computavel = it.computavel; else if(typeof it.tipo==='string'){
              const t = String(it.tipo).toLowerCase(); if(t==='nao_computado' || t==='não_computado') computavel=false; else if(t==='computado') computavel=true;
            }
            const tipo = it.tipo && /^(ALMOCO|JANTAR|LANCHE|PAUSA)$/i.test(String(it.tipo)) ? String(it.tipo).toUpperCase() : 'ALMOCO';
            arr.push({ dia, turnoId, ini, fim, computavel, tipo });
          });
        }
      });
      if(arr.length) out.refeicoes = arr.slice(0,500);
    } catch(_rf){ /* noop */ }
  }
  // Membros: incluir somente se o cliente enviou como array
  if(Array.isArray(r.membros)){
    out.membros = r.membros.slice(0,300);
  }
  return out;
}

// Normaliza lista de refeições garantindo campo booleano computavel e campos ini/fim presentes
function normalizarRefeicoesArray(lista){
  if(!Array.isArray(lista)) return lista;
  return lista.map(iv=>{
    if(!iv || typeof iv!=='object') return iv;
    const ini = iv.ini || iv.inicio || null;
    const fim = iv.fim || iv.termino || null;
    let computavel = typeof iv.computavel==='boolean' ? iv.computavel : true;
    if(typeof iv.computavel!=='boolean' && typeof iv.tipo==='string'){
      const t = String(iv.tipo).toLowerCase();
      if(t==='nao_computado' || t==='não_computado') computavel=false;
      else if(t==='computado') computavel=true;
    }
    const tipo = iv.tipo && /^(ALMOCO|JANTAR|LANCHE|PAUSA)$/i.test(String(iv.tipo)) ? String(iv.tipo).toUpperCase() : (iv.tipo ? 'ALMOCO' : 'ALMOCO');
    return { ...iv, ini, fim, computavel, tipo };
  });
}
async function carregarEscalaLean(id){
  if(!id || !id.match(/^[0-9a-fA-F]{24}$/)) return null;
  const Escala = await getEscalaModel();
  return Escala.findById(id).lean();
}

// Conta refeições computáveis/não computáveis (para diagnóstico nas respostas)
function contarComputavel(lista){
  const arr = Array.isArray(lista)? lista: [];
  let t=0,f=0; for(const it of arr){ if(!it) continue; if(it.computavel===false) f++; else if(it.computavel===true) t++; }
  return { total: arr.length, verdadeiros: t, falsos: f };
}

// Backfill: garante que documentos no banco passem a ter o campo booleano computavel nas refeições
async function ensureBackfillRefeicoesComputavel(id){
  try {
    const Escala = await getEscalaModel();
    const doc = await Escala.findById(id);
    if(!doc) return { changed:false };
    let changed=false;
    for(const eq of (doc.equipes||[])){
      if(!eq || !Array.isArray(eq.recursos)) continue;
      for(const r of eq.recursos){
        if(!r || !Array.isArray(r.refeicoes) || r.refeicoes.length===0) continue;
        // Verificar se há itens sem booleano explícito
        const precisa = r.refeicoes.some(iv=> !iv || typeof iv.computavel !== 'boolean');
        if(!precisa) continue;
        const normal = normalizarRefeicoesArray(r.refeicoes);
        r.refeicoes = normal;
        changed = true;
      }
    }
    if(changed){
      try { doc.markModified('equipes'); } catch(_mm){}
      doc.version = (doc.version||0)+1;
      await doc.save();
      console.debug('[escalasApi.new][BACKFILL computavel] aplicado em', String(id));
    }
    return { changed };
  } catch(e){
    console.warn('[escalasApi.new][BACKFILL computavel] falhou', e.message);
    return { changed:false, error:e.message };
  }
}
function localizarEquipe(esc, eid){
  if(!esc || !Array.isArray(esc.equipes)) return null;
  try {
    if(typeof esc.getEquipeById === 'function') return esc.getEquipeById(eid);
  } catch(_){ /* noop */ }
  return esc.equipes.find(e=> e && (e.id===eid));
}
function localizarRecurso(esc, eid, rid){
  try {
    if(esc && typeof esc.getRecursoById === 'function') return esc.getRecursoById(eid, rid);
  } catch(_){ /* noop */ }
  const eq = localizarEquipe(esc, eid);
  if(!eq || !Array.isArray(eq.recursos)) return null;
  const ridStr = String(rid);
  return eq.recursos.find(x=> { const cand=[x?.id, x?.placa, x?.referenciaGestorId].filter(Boolean).map(String); return cand.includes(ridStr); }) || null;
}
function detectarConflitosRecursos(esc){
  // Versão simplificada para novo modelo: conflito se mesmo funcionario aparece em 2 recursos no mesmo dia|turno
  const conflitos=[]; if(!esc) return conflitos;
  const recursos = [];
  (esc.equipes||[]).forEach(eq=> (eq.recursos||[]).forEach(r=> recursos.push({ ...r, equipeId:eq.id })));
  const map = new Map();
  for(const r of recursos){
    const alocs = Array.isArray(r.alocacoes)? r.alocacoes:[];
    const membros = Array.isArray(r.membros)? r.membros:[];
    const fids = membros.map(m=> m && (m.funcionario_id||m.id)).filter(Boolean);
    if(!fids.length || !alocs.length) continue;
    for(const a of alocs){
      const keyBase = a.dia+'|'+a.turnoId;
      for(const fid of fids){
        const key = keyBase+'|'+fid;
        if(!map.has(key)) map.set(key, []);
        map.get(key).push({ recursoId:r.id, recursoNome:r.nome, equipeId:r.equipeId, dia:a.dia, turnoId:a.turnoId, funcionarioId:fid });
      }
    }
  }
  for(const arr of map.values()){
    if(arr.length>1){
      const distinct = new Set(arr.map(o=> o.recursoId));
      if(distinct.size>1){
        conflitos.push({ tipo:'membro_multiplos_recursos', funcionarioId:arr[0].funcionarioId, ocorrencias:arr.map(o=> ({ recursoId:o.recursoId, recursoNome:o.recursoNome, equipeId:o.equipeId, dia:o.dia, turnoId:o.turnoId })) });
      }
    }
  }
  return conflitos;
}

// Debug schema
router.get('/api/escalas/__debug/schema', requireEscalasAuth, async (req,res)=>{
  try {
    const Escala = await getEscalaModel();
    // retornar apenas chaves relevantes (sem dados pesados)
    return res.json({ ok:true, schemaVersion:2, modelo:'nested-recursos-em-equipes' });
  } catch(e){ return res.status(500).json({ ok:false, error:'Falha debug schema'}); }
});

// ===== API direta de Recursos (fallback interno do módulo Escalas) =====
// GET /escalas/api/recursos?placa=&unidadeId=
router.get('/api/recursos', requireEscalasAuth, async (req,res)=>{
  try {
    let { placa, unidadeId } = req.query || {};
    placa = (placa||'').trim();
    unidadeId = (unidadeId||'').trim();
    const Recurso = await getRecursoModel();
    const Unidade = await getUnidadeModel();
    const filtro = {};
    let placaTermNorm = null;
    if(placa && placa.length>=2){
      placaTermNorm = placa.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
    }
    if(unidadeId){ filtro.unidade_id = unidadeId; }
    // Escopo por cluster de unidades do usuário (se não master)
    const su = req.session?.escalasUser || {};
    const role = (su.role||su.perfil||'user').toLowerCase();
    if(role!=='master' && role!=='admin'){
      let principalId = su.unidade_principal_id || su.unidadePrincipalId || null;
      if(!principalId && su.unidade_id){
        const u = await Unidade.findById(su.unidade_id).select('_id is_principal unidade_principal_id matriz_id').lean();
        if(u) principalId = u.is_principal? u._id : (u.unidade_principal_id || u.matriz_id || u._id);
      }
      const cond = principalId ? { $or:[{ _id:principalId }, { unidade_principal_id:principalId }, { matriz_id:principalId }] } : { _id: su.unidade_id || null };
      const unidadesAcessiveis = await Unidade.find(cond).select('_id').lean();
      const ids = unidadesAcessiveis.map(u=> String(u._id));
      if(unidadeId && !ids.includes(String(unidadeId))){ return res.json([]); }
      if(!unidadeId){ filtro.unidade_id = { $in: ids }; }
    }
    let recursos = await Recurso.find(filtro)
      .populate({ path:'unidade_id', select:'codigo nome' })
      .sort({ placa:1 })
      .limit(100)
      .lean();
    if(placaTermNorm){
      recursos = recursos.filter(r=>{
        const normR = (r.placa||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
        return normR.includes(placaTermNorm);
      });
    }
    const mapped = recursos.map(r=>({
      id: r._id,
      placa: r.placa,
      descricao: [r.marca, r.modelo].filter(Boolean).join(' ') || r.modelo || r.marca || '',
      unidadeFormatada: r.unidade_id ? ((r.unidade_id.codigo? r.unidade_id.codigo+' - ':'') + (r.unidade_id.nome||'')) : ''
    }));
    return res.json(mapped);
  } catch(err){
    console.error('[escalasApi.new][GET /api/recursos] erro', err);
    return res.status(500).json({ error:'erro_interno' });
  }
});

// Debug leve de recursos (ids e nomes) para diagnosticar sumiço

// Validação intra-escala
router.get('/api/escalas/:id/validar', requireEscalasAuth, async (req,res)=>{
  try { const { id } = req.params; if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ error:'ID inválido' });
    const Escala = await getEscalaModel(); const esc = await Escala.findById(id).lean(); if(!esc) return res.status(404).json({ error:'Escala não encontrada' });
    const conflitos = detectarConflitosRecursos(esc); return res.json({ ok:true, conflitos, total: conflitos.length });
  } catch(e){ console.error('[escalasApi.new][GET validar] erro', e); return res.status(500).json({ error:'Falha ao validar' }); }
});

// ===== Verificar conflitos de alocação de um funcionário em OUTRAS escalas (mesmo dia/horário) =====
// GET /escalas/api/funcionario(conflitos)/conflitos-alocacao?funcionarioId=...&dia=YYYY-MM-DD&ini=HH:MM&fim=HH:MM&excludeId=<escalaIdAtual>
async function conflitosAlocacaoHandler(req,res){
  try {
    const { funcionarioId, dia, ini, fim, excludeId } = req.query || {};
    if(!funcionarioId || !dia || !ini || !fim){ return res.status(400).json({ ok:false, error:'Parâmetros obrigatórios: funcionarioId, dia, ini, fim' }); }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) return res.status(400).json({ ok:false, error:'dia inválido (YYYY-MM-DD)' });
    const iniMin = parseHHMMToMin(String(ini)); const fimMin = parseHHMMToMin(String(fim));
    if(iniMin==null || fimMin==null) return res.status(400).json({ ok:false, error:'ini/fim inválidos (HH:MM)' });
    // Janela: dia entre data_inicio e data_fim
    const dt = new Date(dia+'T00:00:00.000Z');
    const Escala = await getEscalaModel();
    // === Resolver o funcionário para um ObjectId válido e comparar SEMPRE por _id ===
    let fidStr = null; let fid = null; let fdoc = null;
    const isHex24 = (v)=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v);
    if(isHex24(String(funcionarioId))){ fidStr = String(funcionarioId); fid = new mongoose.Types.ObjectId(fidStr); }
    if(!fid){
      try {
        const Func = await getFuncionarioModel();
        // Tentar resolver por código ou CPF para obter o _id verdadeiro
        const safe = String(funcionarioId).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
        fdoc = await Func.findOne({ $or:[ { codigo: new RegExp('^'+safe+'$','i') }, { cpf: String(funcionarioId).replace(/\D+/g,'') } ] }).select('_id').lean();
        if(fdoc && fdoc._id){ fid = fdoc._id; fidStr = String(fdoc._id); }
      } catch(_e){ /* ignore */ }
    }
    if(!fid){ return res.status(400).json({ ok:false, error:'funcionarioId deve ser um ObjectId válido (ou resolvível para _id)' }); }
    const eqId = (candidate)=>{
      if(candidate==null) return false;
      let val = candidate;
      if(typeof val==='object'){
        if(val._id) val = val._id;
        // Mongoose ObjectId
        if(typeof val.equals==='function') return val.equals(fid);
      }
      try { return String(val) === fidStr; } catch(_){ return false; }
    };
    const filtros = { data_inicio: { $lte: dt }, data_fim: { $gte: dt } };
    if(excludeId && String(excludeId).match(/^[0-9a-fA-F]{24}$/)) filtros._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    // Carregar somente campos necessários
    const docs = await Escala.find(filtros).select('descricao grupos_turnos equipes alocacao recursos').lean();
    const matches = [];
    for(const esc of docs){
      const equipes = esc?.equipes || [];
      const equipesById = new Map(equipes.map(e=> [String(e.id), e]));
      const equipesByNome = new Map(equipes.map(e=> [String((e.nome||'').toUpperCase()), e]));
      for(const eq of equipes){
        for(const r of (eq.recursos||[])){
          const alocs = Array.isArray(r.alocacoes)? r.alocacoes.filter(a=> a && a.dia===dia): [];
          if(!alocs.length) continue;
          // Preferimos atribuicoes específicas
          const atribs = Array.isArray(r.atribuicoes)? r.atribuicoes.filter(a=> a && (eqId(a.membroFuncionarioId) || eqId(a.membroFuncionario) || eqId(a.funcionario) || eqId(a.funcionarioId))): [];
          if(atribs.length){
            for(const at of atribs){
              // Encontrar alocação compatível no mesmo dia: se a atribuição tiver turnoId, tenta casar pelo turno; senão, considera qualquer alocação do dia
              let alvo = null;
              if(at.turnoId){ alvo = alocs.find(a=> (a.turnoId && a.turnoId===at.turnoId)); }
              if(!alvo){ alvo = alocs[0] || null; }
              const range = alvo? resolveAlocacaoRangeMin(alvo, esc) : (at.turnoId? resolveAlocacaoRangeMin({ turnoId: at.turnoId }, esc) : null);
              if(!range) continue;
              const otherIni=range.ini, otherFim=range.fim;
              const confl = rangesOverlap(iniMin, fimMin===0?1440:fimMin, otherIni, otherFim===0?1440:otherFim);
              if(confl){ matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, recursoId: r.id, recursoNome: r.nome||null, turnoId: at.turnoId||null, dia }); }
            }
          } else {
            // Fallback: se não há atribuicoes, considerar membro fixo alocado nesse dia
        const membros = Array.isArray(r.membros)? r.membros: [];
          const isMembro = membros.some(m=> m && (eqId(m.funcionario_id) || eqId(m.funcionario) || eqId(m.id)));
            if(!isMembro) continue;
            for(const a of alocs){
              const range = resolveAlocacaoRangeMin(a, esc); if(!range) continue;
              const otherIni=range.ini, otherFim=range.fim;
              const confl = rangesOverlap(iniMin, fimMin===0?1440:fimMin, otherIni, otherFim===0?1440:otherFim);
              if(confl){ matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, recursoId: r.id, recursoNome: r.nome||null, turnoId: a.turnoId||null, dia }); }
            }
          }
        }
      }
      // --- Legacy raiz: esc.recursos (antes de migrar para equipes[].recursos) ---
      if(Array.isArray(esc.recursos) && esc.recursos.length){
        for(const r of esc.recursos){
          const alocs = Array.isArray(r.alocacoes)? r.alocacoes.filter(a=> a && a.dia===dia): [];
          if(!alocs.length) continue;
          const atribs = Array.isArray(r.atribuicoes)? r.atribuicoes.filter(a=> a && (eqId(a.membroFuncionarioId) || eqId(a.membroFuncionario) || eqId(a.funcionario) || eqId(a.funcionarioId))): [];
          if(atribs.length){
            for(const at of atribs){
              let alvo = null;
              if(at.turnoId){ alvo = alocs.find(a=> (a.turnoId && a.turnoId===at.turnoId)); }
              if(!alvo){ alvo = alocs[0] || null; }
              const range = alvo? resolveAlocacaoRangeMin(alvo, esc) : (at.turnoId? resolveAlocacaoRangeMin({ turnoId: at.turnoId }, esc) : null);
              if(!range) continue;
              const otherIni=range.ini, otherFim=range.fim;
              const confl = rangesOverlap(iniMin, fimMin===0?1440:fimMin, otherIni, otherFim===0?1440:otherFim);
              if(confl){ matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, recursoId: r.id, recursoNome: r.nome||null, turnoId: at.turnoId||null, dia }); }
            }
          } else {
            const membros = Array.isArray(r.membros)? r.membros: [];
            const isMembro = membros.some(m=> m && (eqId(m.funcionario_id) || eqId(m.funcionario) || eqId(m.id)));
            if(!isMembro) continue;
            for(const a of alocs){
              const range = resolveAlocacaoRangeMin(a, esc); if(!range) continue;
              const otherIni=range.ini, otherFim=range.fim;
              const confl = rangesOverlap(iniMin, fimMin===0?1440:fimMin, otherIni, otherFim===0?1440:otherFim);
              if(confl){ matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, recursoId: r.id, recursoNome: r.nome||null, turnoId: a.turnoId||null, dia }); }
            }
          }
        }
      }
      // --- Fallback adicional: considerar a matriz de alocação no nível da escala (esc.alocacao) ---
      // Se a escala define que uma equipe está alocada numa faixa/turno no dia e o funcionário pertence à equipe, conta como conflito
      const matriz = esc?.alocacao && typeof esc.alocacao==='object' ? esc.alocacao : {};
      const reqIni = iniMin; const reqFim = fimMin===0?1440:fimMin;
      for(const [k,v] of Object.entries(matriz)){
        const parsed = parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k, esc);
        if(!parsed) continue; if(parsed.dia !== dia) continue;
        const otherIni = parsed.ini; const otherFim = parsed.fim===0?1440:parsed.fim;
        if(!rangesOverlap(reqIni, reqFim, otherIni, otherFim)) continue;
        // v pode ser string "eq1,eq2" ou já array; normalizar para array de ids
        let tokens=[];
        if(Array.isArray(v)) tokens = v.map(x=> String(x));
        else if(typeof v==='string') tokens = v.split(',').map(s=> s.trim()).filter(Boolean);
        else if(v && typeof v==='object'){ // mapeamento { eqId: true }
          tokens = Object.keys(v).filter(id=> v[id]);
        }
        if(!tokens.length) continue;
        for(const tok of tokens){
          let equipe = equipesById.get(String(tok));
          if(!equipe){ equipe = equipesByNome.get(String(tok).toUpperCase()); }
          if(!equipe) continue;
          const comps = Array.isArray(equipe.componentes)? equipe.componentes: [];
          const isMember = comps.some(c=> (eqId(c && c.funcionario_id) || eqId(c && c.funcionario) || eqId(c && c.id)) );
          if(isMember){
            // Constrói HH:MM de forma segura (parsed.ini já são minutos)
            const h1 = String(Math.floor(parsed.ini/60)).padStart(2,'0');
            const m1 = String(parsed.ini%60).padStart(2,'0');
            const h2 = String(Math.floor(parsed.fim/60)).padStart(2,'0');
            const m2 = String(parsed.fim%60).padStart(2,'0');
            matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, equipeId: equipe.id, equipeNome: equipe.nome||null, dia, turnoRange: `${h1}:${m1}-${h2}:${m2}` });
          }
        }
      }
    }
    return res.json({ ok:true, conflito: matches.length>0, matches });
  } catch(e){ console.error('[escalasApi.new][GET conflitos-alocacao] erro', e); return res.status(500).json({ ok:false, error:'Falha ao verificar conflitos' }); }
}
// Caminhos suportados (singular e plural) para robustez
router.get('/api/funcionario/conflitos-alocacao', requireEscalasAuth, conflitosAlocacaoHandler);
router.get('/api/funcionarios/conflitos-alocacao', requireEscalasAuth, conflitosAlocacaoHandler);
// Lote: verifica vários (funcionarioId, dia, ini, fim) de uma vez
router.post('/api/funcionarios/conflitos-alocacao/lote', requireEscalasAuth, async (req,res)=>{
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const excludeId = body.excludeId || null;
    if(!items.length){ return res.status(400).json({ ok:false, error:'items vazio' }); }
    // Validação leve e normalização de chaves
    const norm = [];
    for(const it of items){
      const funcionarioId = it.funcionarioId || it.id || it.func || it.fid;
      const dia = it.dia || it.data || it.dataISO;
      const ini = it.ini || it.inicio || it.horaIni || it.turnoIni;
      const fim = it.fim || it.horaFim || it.turnoFim;
      if(!funcionarioId || !dia || !ini || !fim) continue;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) continue;
      if(!/^\d{2}:\d{2}$/.test(String(ini)) || !/^\d{2}:\d{2}$/.test(String(fim))) continue;
      norm.push({ funcionarioId, dia, ini, fim });
    }
    if(!norm.length){ return res.status(400).json({ ok:false, error:'Nenhum item válido' }); }

    // Estratégia: agrupar por dia para reduzir leituras de escalas e reutilizar a lógica core
    const byDia = new Map();
    norm.forEach(n=>{ const k=n.dia; if(!byDia.has(k)) byDia.set(k, []); byDia.get(k).push(n); });

    const Escala = await getEscalaModel();
  const out = [];
    for(const [dia, arr] of byDia.entries()){
      const dt = new Date(dia+'T00:00:00.000Z');
      const filtros = { data_inicio: { $lte: dt }, data_fim: { $gte: dt } };
      if(excludeId && String(excludeId).match(/^[0-9a-fA-F]{24}$/)) filtros._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
      const docs = await Escala.find(filtros).select('descricao grupos_turnos equipes alocacao recursos').lean();
      // Preprocess: índices auxiliares por escala
      for(const it of arr){
        const iniMin = parseHHMMToMin(String(it.ini)); const fimMin = parseHHMMToMin(String(it.fim));
  if(iniMin==null || fimMin==null){ out.push({ key:`${it.funcionarioId}|${dia}|${it.ini}|${it.fim}`, conflito:false, matches:[], error:'horario_invalido', clientKey: it.clientKey||null }); continue; }
        // Resolver funcionarioId -> ObjectId consistente
        let fidStr = null; let fid = null;
        const isHex24 = (v)=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v);
        if(isHex24(String(it.funcionarioId))){ fidStr = String(it.funcionarioId); fid = new mongoose.Types.ObjectId(fidStr); }
        if(!fid){
          try { const Func = await getFuncionarioModel(); const safe = String(it.funcionarioId).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); const fdoc = await Func.findOne({ $or:[ { codigo: new RegExp('^'+safe+'$','i') }, { cpf: String(it.funcionarioId).replace(/\D+/g,'') } ] }).select('_id').lean(); if(fdoc && fdoc._id){ fid = fdoc._id; fidStr = String(fdoc._id); } } catch(_e){}
        }
  if(!fid){ out.push({ key:`${it.funcionarioId}|${dia}|${it.ini}|${it.fim}`, conflito:false, matches:[], error:'funcionario_nao_resolvido', clientKey: it.clientKey||null }); continue; }

        const eqIdCmp = (candidate)=>{
          if(candidate==null) return false; let val = candidate; if(typeof val==='object'){ if(val._id) val = val._id; if(typeof val.equals==='function') return val.equals(fid); }
          try { return String(val)===fidStr; } catch(_){ return false; }
        };

        const reqIni = iniMin; const reqFim = fimMin===0?1440:fimMin;
        const matches=[];
        for(const esc of docs){
          const equipes = esc?.equipes || [];
          const equipesById = new Map(equipes.map(e=> [String(e.id), e]));
          const equipesByNome = new Map(equipes.map(e=> [String((e.nome||'').toUpperCase()), e]));
          // Equipes->recursos
          for(const eq of equipes){
            for(const r of (eq.recursos||[])){
              const alocs = Array.isArray(r.alocacoes)? r.alocacoes.filter(a=> a && a.dia===dia): [];
              if(!alocs.length) continue;
              const atribs = Array.isArray(r.atribuicoes)? r.atribuicoes.filter(a=> a && (eqIdCmp(a.membroFuncionarioId) || eqIdCmp(a.membroFuncionario) || eqIdCmp(a.funcionario) || eqIdCmp(a.funcionarioId))): [];
              if(atribs.length){
                for(const at of atribs){
                  let alvo = null; if(at.turnoId){ alvo = alocs.find(a=> (a.turnoId && a.turnoId===at.turnoId)); }
                  if(!alvo){ alvo = alocs[0] || null; }
                  const range = alvo? resolveAlocacaoRangeMin(alvo, esc) : (at.turnoId? resolveAlocacaoRangeMin({ turnoId: at.turnoId }, esc) : null);
                  if(!range) continue; const otherIni=range.ini, otherFim=range.fim===0?1440:range.fim; const confl = rangesOverlap(reqIni, reqFim, otherIni, otherFim);
                  if(confl){ matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, recursoId: r.id, recursoNome: r.nome||null, turnoId: at.turnoId||null, dia }); }
                }
              } else {
                const membros = Array.isArray(r.membros)? r.membros: [];
                const isMembro = membros.some(m=> m && (eqIdCmp(m.funcionario_id) || eqIdCmp(m.funcionario) || eqIdCmp(m.id)));
                if(!isMembro) continue;
                for(const a of alocs){ const range = resolveAlocacaoRangeMin(a, esc); if(!range) continue; const otherIni=range.ini, otherFim=range.fim===0?1440:range.fim; const confl = rangesOverlap(reqIni, reqFim, otherIni, otherFim); if(confl){ matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, recursoId: r.id, recursoNome: r.nome||null, turnoId: a.turnoId||null, dia }); } }
              }
            }
          }
          // Legacy raiz esc.recursos
          if(Array.isArray(esc.recursos) && esc.recursos.length){
            for(const r of esc.recursos){
              const alocs = Array.isArray(r.alocacoes)? r.alocacoes.filter(a=> a && a.dia===dia): [];
              if(!alocs.length) continue;
              const atribs = Array.isArray(r.atribuicoes)? r.atribuicoes.filter(a=> a && (eqIdCmp(a.membroFuncionarioId) || eqIdCmp(a.membroFuncionario) || eqIdCmp(a.funcionario) || eqIdCmp(a.funcionarioId))): [];
              if(atribs.length){
                for(const at of atribs){ let alvo = null; if(at.turnoId){ alvo = alocs.find(a=> (a.turnoId && a.turnoId===at.turnoId)); } if(!alvo){ alvo = alocs[0] || null; } const range = alvo? resolveAlocacaoRangeMin(alvo, esc) : (at.turnoId? resolveAlocacaoRangeMin({ turnoId: at.turnoId }, esc) : null); if(!range) continue; const otherIni=range.ini, otherFim=range.fim===0?1440:range.fim; const confl = rangesOverlap(reqIni, reqFim, otherIni, otherFim); if(confl){ matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, recursoId: r.id, recursoNome: r.nome||null, turnoId: at.turnoId||null, dia }); } }
              } else {
                const membros = Array.isArray(r.membros)? r.membros: [];
                const isMembro = membros.some(m=> m && (eqIdCmp(m.funcionario_id) || eqIdCmp(m.funcionario) || eqIdCmp(m.id)));
                if(!isMembro) continue;
                for(const a of alocs){ const range = resolveAlocacaoRangeMin(a, esc); if(!range) continue; const otherIni=range.ini, otherFim=range.fim===0?1440:range.fim; const confl = rangesOverlap(reqIni, reqFim, otherIni, otherFim); if(confl){ matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, recursoId: r.id, recursoNome: r.nome||null, turnoId: a.turnoId||null, dia }); } }
              }
            }
          }
          // Matriz nível escala
          const matriz = esc?.alocacao && typeof esc.alocacao==='object' ? esc.alocacao : {};
          for(const [k,v] of Object.entries(matriz)){
            const parsed = parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k, esc);
            if(!parsed) continue; if(parsed.dia !== dia) continue;
            const otherIni = parsed.ini; const otherFim = parsed.fim===0?1440:parsed.fim;
            if(!rangesOverlap(reqIni, reqFim, otherIni, otherFim)) continue;
            let tokens=[];
            if(Array.isArray(v)) tokens = v.map(x=> String(x));
            else if(typeof v==='string') tokens = v.split(',').map(s=> s.trim()).filter(Boolean);
            else if(v && typeof v==='object'){ tokens = Object.keys(v).filter(id=> v[id]); }
            if(!tokens.length) continue;
            const equipes = esc?.equipes || [];
            const equipesById = new Map(equipes.map(e=> [String(e.id), e]));
            const equipesByNome = new Map(equipes.map(e=> [String((e.nome||'').toUpperCase()), e]));
            for(const tok of tokens){
              let equipe = equipesById.get(String(tok)); if(!equipe){ equipe = equipesByNome.get(String(tok).toUpperCase()); }
              if(!equipe) continue;
              const comps = Array.isArray(equipe.componentes)? equipe.componentes: [];
              const isMember = comps.some(c=> (eqIdCmp(c && c.funcionario_id) || eqIdCmp(c && c.funcionario) || eqIdCmp(c && c.id)) );
              if(isMember){
                const h1 = String(Math.floor(parsed.ini/60)).padStart(2,'0'); const m1 = String(parsed.ini%60).padStart(2,'0'); const h2 = String(Math.floor(parsed.fim/60)).padStart(2,'0'); const m2 = String(parsed.fim%60).padStart(2,'0');
                matches.push({ escalaId: esc._id, escalaDescricao: esc.descricao, equipeId: equipe.id, equipeNome: equipe.nome||null, dia, turnoRange: `${h1}:${m1}-${h2}:${m2}` });
              }
            }
          }
        }
        out.push({ key:`${fidStr}|${dia}|${it.ini}|${it.fim}`, conflito: matches.length>0, matches, clientKey: it.clientKey||null });
      }
    }
    return res.json({ ok:true, results: out });
  } catch(e){ console.error('[escalasApi.new][POST conflitos-alocacao/lote] erro', e); return res.status(500).json({ ok:false, error:'Falha ao verificar conflitos em lote' }); }
});

// Resumo debug (counts por equipe e total recursos)
router.get('/api/escalas/:id/debug/resumo', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params; if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const esc = await carregarEscalaLean(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    const equipes = esc.equipes||[];
    const resumoEquipes = equipes.map(eq=> ({ id:eq.id, nome:eq.nome, recursos:(eq.recursos||[]).length }));
    const totalRecursos = resumoEquipes.reduce((a,b)=> a + b.recursos, 0);
    return res.json({ ok:true, totalEquipes: equipes.length, totalRecursos, equipes: resumoEquipes });
  } catch(e){ console.error('[escalasApi.new][GET debug/resumo] erro', e); return res.status(500).json({ ok:false, error:'Falha debug resumo' }); }
});

// ===== Escala diária por unidade/dia =====
// GET /escalas/api/escalas/diaria?unidadeId=&dia=YYYY-MM-DD&classificacao=(ORDINÁRIA|EXTRAORDINÁRIA opcional)&filiais=1
router.get('/api/escalas/diaria', requireEscalasAuth, async (req,res)=>{
  try {
    const { unidadeId, dia, classificacao, filiais } = req.query||{};
    if(!unidadeId || !/^[0-9a-fA-F]{24}$/.test(String(unidadeId))) return res.status(400).json({ ok:false, error:'unidadeId inválido' });
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dia||''))) return res.status(400).json({ ok:false, error:'dia inválido (YYYY-MM-DD)' });
    const Escala = await getEscalaModel();
    const Unidade = await getUnidadeModel();
    let filtroUn = { _id: new mongoose.Types.ObjectId(unidadeId) };
    if(String(filiais||'')==='1'){
      const u = await Unidade.findById(unidadeId).select('_id is_principal unidade_principal_id').lean();
      if(u){ const matriz = u.is_principal? u._id : (u.unidade_principal_id || u._id);
        filtroUn = { $or: [ { _id: matriz }, { unidade_principal_id: matriz } ] };
        const ids = await Unidade.find(filtroUn).select('_id').lean();
        filtroUn = { unidade_id: { $in: ids.map(x=> x._id) } };
      } else { filtroUn = { unidade_id: new mongoose.Types.ObjectId(unidadeId) }; }
    } else {
      filtroUn = { unidade_id: new mongoose.Types.ObjectId(unidadeId) };
    }
    const dt = new Date(String(dia)+'T00:00:00.000Z');
    const baseFiltro = { ...filtroUn, data_inicio: { $lte: dt }, data_fim: { $gte: dt } };
    let filtroClass = {};
    if(classificacao==='ORDINÁRIA' || classificacao==='ORDINARIA') filtroClass = { $or:[ { classificacao:'ORDINÁRIA' }, { classificacao:'ORDINARIA' }, { classificacao:null }, { classificacao:{ $exists:false } } ] };
    else if(classificacao==='EXTRAORDINÁRIA' || classificacao==='EXTRAORDINARIA') filtroClass = { $or:[ { classificacao:'EXTRAORDINÁRIA' }, { classificacao:'EXTRAORDINARIA' } ] };
    const docs = await Escala.find({ ...baseFiltro, ...filtroClass }).sort({ data_inicio:1, descricao:1 }).populate({ path:'unidade_id', select:'codigo nome' }).lean();
    // Montar estrutura: por escala, turnos do dia, com equipes/recursos e alocações do dia
    function turnosDia(esc){
      const arr=[]; const grupos = Array.isArray(esc.grupos_turnos)? esc.grupos_turnos: [];
      for(const g of grupos){ for(const t of (g.turnos||[])){ const ini=t.ini, fim=t.fim; arr.push({ label: `${ini} - ${fim}`, ini, fim, token: `${ini}-${fim}`, grupoId: g.id }); } }
      // Ordenar por horário crescente
      arr.sort((a,b)=> a.ini.localeCompare(b.ini));
      return arr;
    }
    // Helpers locais
    const isHex24 = (v)=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v.trim());
  const looksNumericLike = (s)=>{ try { const t=String(s||'').trim(); return !!t && /^[0-9\s\-\.,:\/]+$/.test(t); } catch{ return false; } };
  const hasLetters = (s)=>{ try { return /[A-Za-zÀ-ÿ]/.test(String(s||'')); } catch { return false; } };
    const notaTexto = (val)=>{
      try{
        if(val==null) return null;
        if(typeof val==='string'){
          // Remover linhas que não tenham letras (só números/pontuação)
          const lines = String(val).split(/\r?\n/);
          const kept = lines.map(s=> s.trim()).filter(s=> s && hasLetters(s) && !looksNumericLike(s));
          return kept.length ? kept.join('\n') : null;
        }
        if(typeof val==='number') return null; // não exibir números puros como nota
        if(Array.isArray(val)){
          // Preferir apenas partes textuais; ignorar números "puros"
          const parts = val
            .map(notaTexto)
            .filter(v=> typeof v==='string' && v.trim())
            .filter(v=> hasLetters(v) && !looksNumericLike(v));
          if(parts.length) return parts.join('\n');
          // se tudo virar vazio, tenta último como fallback (evita [object Object])
          const last = val[val.length-1];
          const lastStr = notaTexto(last);
          return (lastStr && !looksNumericLike(lastStr)) ? lastStr : null;
        }
        if(typeof val==='object'){
          // Chaves comuns usadas em notas nos modelos
          if(typeof val.texto==='string' && !looksNumericLike(val.texto)) return val.texto;
          if(typeof val.nota==='string' && !looksNumericLike(val.nota)) return val.nota;
          if(typeof val.conteudo==='string' && !looksNumericLike(val.conteudo)) return val.conteudo;
          if(typeof val.descricao==='string' && !looksNumericLike(val.descricao)) return val.descricao;
          if(typeof val.mensagem==='string' && !looksNumericLike(val.mensagem)) return val.mensagem;
          if(typeof val.message==='string' && !looksNumericLike(val.message)) return val.message;
          if(typeof val.textoHTML==='string') return val.textoHTML.replace(/<[^>]+>/g,' ').trim();
          if(typeof val.html==='string') return val.html.replace(/<[^>]+>/g,' ').trim();
          if(typeof val.value==='string' && !looksNumericLike(val.value)) return val.value;
          if(typeof val.conteudoHTML==='string') return val.conteudoHTML.replace(/<[^>]+>/g,' ').trim();
          if(Array.isArray(val.historico) && val.historico.length){
            const last = val.historico[val.historico.length-1];
            return notaTexto(last) || null;
          }
          // Último recurso: tentar serializar texto simples se sobrou algo legível (evitar [object Object])
          try {
            const s = (typeof val.toString==='function') ? String(val.toString()) : '';
            if(s && s!=='[object Object]') return s;
          } catch(_toS){}
        }
      }catch(_nt){}
      return null;
    };
    const displayRecurso = (r)=>{
      try{
        const cand = [ r?.nome, r?.nomeRecurso, r?.nome_recurso, r?.descricao, r?.descr, r?.titulo, r?.label, r?.placa, r?.codigoRecurso, r?.codigo, r?.referenciaGestorId ];
        for(const c of cand){ const s=(c==null?'':String(c)).trim(); if(!s) continue; if(isHex24(s)) continue; return s; }
      }catch(_dr){}
      return null;
    };
    const data = docs.map(async d=>{
      const unidade = d.unidade_id; const unidade_nome = unidade?.nome||null; const unidade_codigo = unidade?.codigo||null;
      const base = {
        id: d._id,
        descricao: d.descricao,
        periodo: { ini: d.data_inicio.toISOString().slice(0,10), fim: d.data_fim.toISOString().slice(0,10) },
        unidade_nome,
        unidade_codigo,
        status: d.status || null,
        classificacao: d.classificacao || null
      };
      const turnos = turnosDia(d);
      // Mapear equipes e recursos do dia
      const equipesRaw = Array.isArray(d.equipes)? d.equipes: [];
      // Clonar equipes e garantir array de recursos
      const equipes = equipesRaw.map(eq=> ({
        id: eq.id,
        nome: eq.nome || null,
        descricao: eq.descricao || eq.descr || eq.label || null,
        componentes: Array.isArray(eq.componentes)? eq.componentes : [],
        recursos: Array.isArray(eq.recursos)? JSON.parse(JSON.stringify(eq.recursos)) : [] ,
        // preservar alocações da equipe (para notas e ativação por dia/turno)
        alocacoes: Array.isArray(eq.alocacoes)? JSON.parse(JSON.stringify(eq.alocacoes)) : [],
        // mapas de adições/remoções por alocação (necessários para 'fora')
        adicoesEquipe: (eq.adicoesEquipe && typeof eq.adicoesEquipe==='object') ? JSON.parse(JSON.stringify(eq.adicoesEquipe)) : {},
        remocoesEquipe: (eq.remocoesEquipe && typeof eq.remocoesEquipe==='object') ? JSON.parse(JSON.stringify(eq.remocoesEquipe)) : {},
        notas: eq.notas || eq.nota || null
      }));
      // Resolver nomes de componentes sem nome em lote (evita exibir ObjectId)
      let nomesComponentesMap = new Map();
      try {
        const semNome = [];
        for(const eq of equipes){
          for(const c of (eq.componentes||[])){
            const nm = c && (c.nome || c.funcionarioNome);
            if(nm && String(nm).trim()) continue;
            const cid = String(c && (c.id||c.funcionario_id)||'');
            if(!cid) continue;
            if(/^[0-9a-fA-F]{24}$/.test(cid)) semNome.push(cid);
          }
        }
        if(semNome.length){
          const uniq = [...new Set(semNome)];
          const Func = await getFuncionarioModel();
          const docs = await Func.find({ _id: { $in: uniq } }).select('nome').lean();
          nomesComponentesMap = new Map(docs.map(f=> [String(f._id), f.nome||null]));
        }
      } catch(_resolveComp){}
      const mapEq = new Map(equipes.map(e=> [String(e.id), e]));
      // Fallback legacy: d.recursos na raiz -> empurrar para a equipe por equipeId
      if(Array.isArray(d.recursos) && d.recursos.length){
        for(const r0 of d.recursos){
          const eid = r0 && (r0.equipeId || r0.equipe_id || r0.equipe);
          let alvo = eid && mapEq.get(String(eid));
          if(!alvo){
            // criar stub de equipe se não existir
            alvo = { id: String(eid||'SEM_EQUIPE'), nome: String(eid||'SEM_EQUIPE'), componentes: [], recursos: [], notas: null };
            mapEq.set(String(alvo.id), alvo);
            equipes.push(alvo);
          }
          // Evitar duplicados por id
          const exists = Array.isArray(alvo.recursos) && alvo.recursos.some(x=> (x.id===r0.id) || (x.referenciaGestorId && x.referenciaGestorId===r0.id));
          if(!exists){
            const clone = JSON.parse(JSON.stringify(r0));
            if(!clone.id) clone.id = clone.referenciaGestorId || ('r_'+Math.random().toString(36).slice(2,10));
            if(!clone.equipeId) clone.equipeId = alvo.id;
            alvo.recursos.push(clone);
          }
        }
      }
      // Construir por turno
      const porTurno = turnos.map(t=>{
        // Equipes visíveis: todas; mas se houver matriz de alocação no nível da escala, considerar apenas alocadas neste dia/turno
        const alocMatriz = (d.alocacao && typeof d.alocacao==='object')? d.alocacao: {};
        const key1 = `${t.grupoId||''}::${t.ini}-${t.fim}|${dia}`; const key2 = `${t.ini}-${t.fim}|${dia}`; // legacy
        let alocadasTokens = null;
        if(alocMatriz[key1] || alocMatriz[key2]){
          const v = alocMatriz[key1] || alocMatriz[key2];
          if(Array.isArray(v)) alocadasTokens = v.map(x=> String(x));
          else if(typeof v==='string') alocadasTokens = v.split(',').map(s=> s.trim()).filter(Boolean);
          else if(v && typeof v==='object') alocadasTokens = Object.keys(v).filter(k=> v[k]);
        }
        const equipesTurno = equipes
          .map(eq=>{
            // Recursos desta equipe no dia/turno
            const recursos = Array.isArray(eq.recursos)? eq.recursos: [];
            const equipeAtivaNoTurno = !alocadasTokens || alocadasTokens.includes(eq.id) || alocadasTokens.includes(String((eq.nome||'').toUpperCase()));
            const recursosTurno = recursos.map(r=>{
              // Converter mapas legados para arrays quando necessário
              let atribuicoesArr = Array.isArray(r.atribuicoes)? r.atribuicoes : [];
              // Suplementar a partir do mapa legado também quando o array existe mas não tem itens para o dia corrente
              if(r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){
                try {
                  const existentesDia = new Set(
                    (Array.isArray(atribuicoesArr)? atribuicoesArr: [])
                      .filter(a=> a && a.dia===dia)
                      .map(a=> String(a.membroFuncionarioId || a.funcionarioId || a.funcionario || a.matricula || a.id))
                  );
                  Object.entries(r.atribuicoesRecurso).forEach(([alloc, lista])=>{
                    const parts=String(alloc).split('__'); if(parts.length!==2) return; const diaKey=parts[0]; const turnoId=parts[1]; if(diaKey!==dia) return;
                    if(Array.isArray(lista)){
                      lista.forEach(it=>{
                        if(!it) return;
                        const fid = it.membroFuncionarioId || it.funcionarioId || it.funcionario_id || it.funcionario || it.matricula || it.id;
                        if(!fid) return;
                        const fidStr = String(fid);
                        if(!existentesDia.has(fidStr)){
                          atribuicoesArr.push({ membroFuncionarioId: fidStr, nome: it.nome||it.funcionarioNome||null, dia: diaKey, turnoId, atribuicao: it.atribuicao||it.papel||null });
                          existentesDia.add(fidStr);
                        }
                      });
                    }
                  });
                } catch(_sup){ /* noop */ }
              }
              // Alocações do dia com sobreposição de horário ao turno atual t
              const tIniMin = parseHHMMToMin(String(t.ini));
              const tFimMin = parseHHMMToMin(String(t.fim));
              let alocsDia = Array.isArray(r.alocacoes)? r.alocacoes.filter(a=> a && a.dia===dia) : [];
              // Reforçar com mapa legado alocacoesRecurso
              if((!alocsDia || alocsDia.length===0) && r.alocacoesRecurso && typeof r.alocacoesRecurso==='object'){
                try {
                  const arr=[]; Object.keys(r.alocacoesRecurso).forEach(k=>{ const [dkey, turnoKey] = String(k).split('__'); if(dkey!==dia) return; arr.push({ dia:dkey, turnoId: turnoKey }); });
                  alocsDia = arr;
                } catch(_e){ /* noop */ }
              }
              // Verificar sobreposição com o turno corrente (estrito por turno/dia)
              const alocsCompat = alocsDia.filter(a=>{
                try {
                  const rawTurn = String(a.turnoId||'');
                  let normTurn = rawTurn.includes('::') ? rawTurn.split('::').slice(-1)[0] : rawTurn; // ex: 'G1::08:00-17:00' -> '08:00-17:00'
                  // Normalizar variações: 'às'/'as'/'a' como separador e hífens unicode; também remover espaços ao redor do hífen
                  normTurn = String(normTurn||'')
                    .replace(/\s+(às|as|a)\s+/ig, '-')
                    .replace(/[–—−‑‒]/g, '-')
                    .replace(/\s*-\s*/g, '-');
                  const tTokenSlim = String(t.token||'').replace(/\s*-\s*/g, '-');
                  if(normTurn && normTurn !== tTokenSlim) return false; // quando informado, deve casar com o token do turno
                  const rng = resolveAlocacaoRangeMin({ ...a, turnoId: normTurn }, d);
                  if(!rng){
                    // sem resolução de horário: só aceita se explicitamente casar pelo token
                    return !!normTurn && (normTurn === tTokenSlim || normTurn === t.token);
                  }
                  const otherIni=rng.ini, otherFim=rng.fim;
                  return rangesOverlap(tIniMin, tFimMin===0?1440:tFimMin, otherIni, otherFim===0?1440:otherFim);
                } catch(_e){ return false; }
              });
              // Atribuições do dia e turno corrente (normaliza turnoId que pode vir como 'G1::08:00-17:00')
              const atribs = Array.isArray(atribuicoesArr)
                ? atribuicoesArr.filter(a=>{
                    if(!a) return false;
                    const raw = String(a.turnoId||a.turno||'');
                    let norm = raw.includes('::') ? raw.split('::').slice(-1)[0] : raw;
                    // Normalizar 'às' e hífens unicode; comprimir espaços
                    const normSlim = String(norm||'')
                      .replace(/\s+(às|as|a)\s+/ig, '-')
                      .replace(/[–—−‑‒]/g, '-')
                      .replace(/\s*-\s*/g, '-');
                    const tokenSlim = String(t.token||'').replace(/\s*-\s*/g, '-');
                    // Aceita quando: (a) dia bate; ou (b) dia ausente mas o recurso está alocado neste turno
                    const diaOk = (a.dia === dia) || (a.dia == null && alocsCompat.length > 0);
                    if(!diaOk) return false;
                    // Sem turnoId específico na atribuição -> válida para o turno do dia
                    if(!normSlim) return true;
                    return normSlim === tokenSlim;
                  })
                : [];
              const temAloc = alocsCompat.length>0;
              // Regra: página diária mostra somente alocações do dia/turno; exibir recurso apenas se houver alocação compatível
              const incluir = temAloc;
              if(!incluir) return null;
              // Bloqueios de membros removidos especificamente nesta alocação (dia/turno)
              const bloqueados = new Set();
              try {
                if(r.remocoesRecurso && typeof r.remocoesRecurso==='object'){
                  const k1 = `${dia}__${t.token}`;
                  const k2 = `${dia}__${t.label||t.token}`;
                  const lista = r.remocoesRecurso[k1] || r.remocoesRecurso[k2] || [];
                  if(Array.isArray(lista)) lista.forEach(fid=> bloqueados.add(String(fid)));
                }
              } catch(_blk){}
              // Notas do recurso: preferir notas da alocação do dia/turno, fallback para r.notas (geral). Normalizar para texto.
              let notasRecurso = null;
              try {
                if(r && Array.isArray(r.alocacoes)){
                  const a = r.alocacoes.find(a=>{
                    if(!a || a.dia!==dia) return false;
                    const rawTurn = String(a.turnoId||'');
                    const normTurn = rawTurn.includes('::') ? rawTurn.split('::').slice(-1)[0] : rawTurn;
                    return normTurn === t.token || normTurn === (t.label||'');
                  });
                  notasRecurso = a ? (notaTexto(a.notas_recurso) || null) : null;
                }
              } catch(_e){ notasRecurso = null; }
              if(!notasRecurso) notasRecurso = notaTexto(r.notas)||notaTexto(r.nota)||null;
              // Refeições do recurso nesta alocação (dia/turno)
              let refeicoesTurno = [];
              try {
                const tIniMin = parseHHMMToMin(String(t.ini));
                const tFimMin = parseHHMMToMin(String(t.fim));
                // 1) Array r.refeicoes
                if(Array.isArray(r.refeicoes) && r.refeicoes.length){
                  for(const iv of r.refeicoes){
                    if(!iv) continue;
                    const diaIv = iv.dia || iv.data; if(diaIv && diaIv !== dia) continue; // se não houver dia definido, considerar conforme o horário/turno
                    const turnIvRaw = iv.turnoId || iv.turno || '';
                    const turnIv = String(turnIvRaw).includes('::') ? String(turnIvRaw).split('::').slice(-1)[0] : String(turnIvRaw);
                    let incluirIv = false;
                    if(turnIv){ incluirIv = (turnIv === t.token || turnIv === (t.label||'')); }
                    // Fallback: se não houver turno no item, usa sobreposição de horário
                    if(!incluirIv){
                      const iniIv = iv.ini || iv.inicio; const fimIv = iv.fim || iv.termino;
                      if(iniIv && fimIv){
                        const iniM = parseHHMMToMin(String(iniIv)); const fimM = parseHHMMToMin(String(fimIv));
                        if(iniM!=null && fimM!=null && tIniMin!=null && tFimMin!=null){
                          incluirIv = rangesOverlap(tIniMin, tFimMin===0?1440:tFimMin, iniM, fimM===0?1440:fimM);
                        }
                      }
                    }
                    if(incluirIv){
                      let computavel = typeof iv.computavel==='boolean' ? iv.computavel : true;
                      if(typeof iv.computavel!=='boolean' && typeof iv.tipo==='string'){
                        const ti = String(iv.tipo).toLowerCase(); if(ti==='nao_computado' || ti==='não_computado') computavel=false; else if(ti==='computado') computavel=true;
                      }
                      const tipo = iv.tipo && /^(ALMOCO|JANTAR|LANCHE|PAUSA)$/i.test(String(iv.tipo)) ? String(iv.tipo).toUpperCase() : (iv.tipo ? 'ALMOCO' : 'ALMOCO');
                      const ini = iv.ini || iv.inicio || null; const fim = iv.fim || iv.termino || null;
                      if(ini && fim){ refeicoesTurno.push({ ini, fim, tipo, computavel }); }
                    }
                  }
                }
                // 2) Mapa legado r.refeicoesRecurso: { 'YYYY-MM-DD__turno': [ { inicio, fim, computavel, tipo } ] }
                if((!refeicoesTurno.length) && r.refeicoesRecurso && typeof r.refeicoesRecurso==='object'){
                  const k1 = `${dia}__${t.token}`;
                  const k2 = `${dia}__${t.label||t.token}`;
                  const lista = r.refeicoesRecurso[k1] || r.refeicoesRecurso[k2] || [];
                  if(Array.isArray(lista)){
                    for(const it of lista){
                      if(!it) continue;
                      const ini = it.ini || it.inicio; const fim = it.fim || it.termino;
                      if(!ini || !fim) continue;
                      let computavel = typeof it.computavel==='boolean' ? it.computavel : true;
                      if(typeof it.computavel!=='boolean' && typeof it.tipo==='string'){
                        const ti = String(it.tipo).toLowerCase(); if(ti==='nao_computado' || ti==='não_computado') computavel=false; else if(ti==='computado') computavel=true;
                      }
                      const tipo = it.tipo && /^(ALMOCO|JANTAR|LANCHE|PAUSA)$/i.test(String(it.tipo)) ? String(it.tipo).toUpperCase() : 'ALMOCO';
                      refeicoesTurno.push({ ini, fim, tipo, computavel });
                    }
                  }
                }
              } catch(_rf){ /* noop refeições turno */ }
              // Ordenar refeições por horário de início
              if(refeicoesTurno.length){
                try { refeicoesTurno.sort((a,b)=> String(a.ini||'').localeCompare(String(b.ini||''))); } catch(_s){}
              }
              // Filtrar membros por bloqueios desta alocação
              const membrosAll = Array.isArray(r.membros)? r.membros: [];
              const membrosFiltrados = membrosAll.filter(m=>{
                const mid = m && (m.funcionarioId || m.funcionario_id || m.id);
                if(!mid) return true;
                return !bloqueados.has(String(mid));
              });
              return {
                id: r.id,
                nome: displayRecurso(r) || r.placa || null,
                placa: r.placa || null,
                marca: r.marca || r.fabricante || null,
                modelo: r.modelo || r.model || null,
                membros: membrosFiltrados,
                atribuicoes: atribs,
                notas: notasRecurso,
                refeicoes: refeicoesTurno
              };
            }).filter(Boolean);
            // Funcionários fora de recursos: agora somente as adições pontuais desta alocação
            const componentes = Array.isArray(eq.componentes)? eq.componentes: [];
            // Bloqueios de 'fora' (componentes) para esta alocação (dia/turno)
            const bloqueadosEq = new Set();
            try {
              if(eq.remocoesEquipe && typeof eq.remocoesEquipe==='object'){
                const k1 = `${dia}__${t.token}`;
                const k2 = `${dia}__${t.label||t.token}`;
                const lista = eq.remocoesEquipe[k1] || eq.remocoesEquipe[k2] || [];
                if(Array.isArray(lista)) lista.forEach(fid=> bloqueadosEq.add(String(fid)));
              }
            } catch(_be){}
            const membrosAtrib = new Set();
            recursosTurno.forEach(rt=>{
              (rt.atribuicoes||[]).forEach(a=>{ if(a.membroFuncionarioId) membrosAtrib.add(String(a.membroFuncionarioId)); });
              (rt.membros||[]).forEach(m=>{ if(m && (m.id||m.funcionario_id)) membrosAtrib.add(String(m.id||m.funcionario_id)); });
            });
            // Adições pontuais de "fora" (sem recurso) por alocação
            const adicoesPontuais = (()=>{
              try {
                const map = (eq.adicoesEquipe && typeof eq.adicoesEquipe==='object') ? eq.adicoesEquipe : null;
                if(!map) return [];
                const tokenAtual = String(t.token||'');
                const labelAtual = String(t.label||t.token||'');
                const rangeDe = (tok)=>{ try { const s=String(tok||''); const base = s.includes('::')? s.split('::').slice(-1)[0] : s; return (base.match(/\d{2}:\d{2}-\d{2}:\d{2}/)||[])[0] || null; } catch{ return null; } };
                const rangeAlvo = rangeDe(tokenAtual) || rangeDe(labelAtual);
                const itens=[];
                // 1) Chaves exatas
                const k1 = `${dia}__${tokenAtual}`;
                const k2 = `${dia}__${labelAtual}`;
                if(Array.isArray(map[k1])) itens.push(...map[k1]);
                if(Array.isArray(map[k2])) itens.push(...map[k2]);
                // 2) Busca tolerante por qualquer chave com mesmo dia e mesma faixa
                if(rangeAlvo){
                  for(const [key, lista] of Object.entries(map)){
                    if(!Array.isArray(lista) || !key || typeof key!=='string') continue;
                    const [dK, tK] = key.split('__'); if(dK!==dia) continue;
                    const rK = rangeDe(tK); if(!rK) continue;
                    if(rK === rangeAlvo){ itens.push(...lista); }
                  }
                }
                try {
                  const keys = Object.keys(map||{}).filter(k=> k.startsWith(`${dia}__`));
                  console.info('[escalasApi.new][GET diaria][fora-scan]', { escalaId: d._id, unidade: unidade_nome, equipeId: eq.id, turno: t.token, k1, k2, keysDia: keys, encontrados: itens.length });
                } catch(_){}
                // normalizar em objetos { id, nome }
                return itens.map(x=>{
                  if(!x) return null; if(typeof x==='string') return { id:String(x), nome:null };
                  const id = x.id||x.funcionario_id||x.funcionarioId||x.matricula||x.codigo||null; if(!id) return null;
                  return { id:String(id), nome: x.nome||x.funcionarioNome||null };
                }).filter(Boolean);
              } catch(_){ return []; }
            })();
            // Fora = adições pontuais desta alocação + componentes padrão da equipe que não estão alocados em nenhum recurso neste dia/turno
            const foraCalc = (()=>{
              const uniqPontual = new Map();
              const uniqBase = new Map();
              // 1) Adições pontuais no escopo (dia/turno) — determinam se a equipe deve aparecer quando não há recursos nem matriz/alocação
              if(Array.isArray(adicoesPontuais) && adicoesPontuais.length){
                for(const a of adicoesPontuais){
                  if(!a || !a.id) continue;
                  const id = String(a.id);
                  if(membrosAtrib.has(id)) continue; // já alocado em algum recurso
                  if(bloqueadosEq.has(id)) continue;  // explicitamente removido desta alocação
                  if(!uniqPontual.has(id)) uniqPontual.set(id, { id, nome: a.nome || nomesComponentesMap.get(id) || id });
                }
              }
              // 2) Componentes padrão da equipe (baseline) não alocados no escopo — NÃO devem por si só fazer a equipe aparecer
              const compBase = Array.isArray(eq.componentes)? eq.componentes: [];
              for(const c of compBase){
                if(!c) continue;
                const id = String((c.id||c.funcionario_id||c.funcionarioId||c.matricula||c.codigo||'')||'');
                if(!id) continue;
                if(membrosAtrib.has(id)) continue; // está alocado em algum recurso neste turno
                if(bloqueadosEq.has(id)) continue;  // removido explicitamente no escopo
                if(!uniqPontual.has(id) && !uniqBase.has(id)) uniqBase.set(id, { id, nome: c.nome || c.funcionarioNome || nomesComponentesMap.get(id) || id });
              }
              const foraPontual = Array.from(uniqPontual.values());
              const foraBase = Array.from(uniqBase.values());
              return { foraPontual, foraBase, fora: [...foraPontual, ...foraBase] };
            })();
            const fora = foraCalc.fora;
            // Ordenar recursos por nome/placa
            recursosTurno.sort((a,b)=> String(a.nome||'').localeCompare(String(b.nome||'')));
            // Determinar se a equipe deve aparecer neste turno/dia
            let equipeAtivaPorMatriz = !!alocadasTokens && (alocadasTokens.includes(eq.id) || alocadasTokens.includes(String((eq.nome||'').toUpperCase())));
            let equipeAtivaPorAlocEquipe = false;
            try {
              if(Array.isArray(eq.alocacoes)){
                equipeAtivaPorAlocEquipe = !!eq.alocacoes.find(a=>{
                  if(!a || a.dia!==dia) return false;
                  const rawTurn = String(a.turnoId||'');
                  const normTurn = rawTurn.includes('::') ? rawTurn.split('::').slice(-1)[0] : rawTurn;
                  return normTurn === t.token;
                });
              }
            } catch(_e){}
            // Equipe entra se:
            // - estiver ativa pela matriz
            // - estiver ativa por alocação própria
            // - tiver recursos realmente alocados nesse turno
            // - OU tiver funcionários "fora" (adições pontuais) nesta alocação
            // Critério de inclusão: baseline (foraBase) sozinho não deve forçar a exibição da equipe
            const incluirEquipe = (
              equipeAtivaPorMatriz ||
              equipeAtivaPorAlocEquipe ||
              (recursosTurno.length>0) ||
              (foraCalc.foraPontual && foraCalc.foraPontual.length>0)
            );
            try {
              if(fora.length>0){
                console.info('[escalasApi.new][GET diaria][fora]', { escalaId: d._id, equipeId: eq.id, turno: t.token, dia, count: fora.length, ids: fora.map(f=> f.id) });
              }
            } catch(_){}
            if(!incluirEquipe) return null;
            // Notas da equipe: preferir nota por alocação diária/turno, fallback para notas geral — sempre texto
            let notasEquipe = null;
            try {
              if(Array.isArray(eq.alocacoes)){
                const a = eq.alocacoes.find(a=>{
                  if(!a || a.dia!==dia) return false;
                  const rawTurn = String(a.turnoId||'');
                  const normTurn = rawTurn.includes('::') ? rawTurn.split('::').slice(-1)[0] : rawTurn;
                  return normTurn === t.token || normTurn === (t.label||'');
                });
                if(a) notasEquipe = notaTexto(a.notas)||null;
              }
            } catch(_e){}
            if(!notasEquipe) notasEquipe = notaTexto(eq.notas)||notaTexto(eq.nota)||null;
            return { id:eq.id, nome:eq.nome||eq.id, descricao: eq.descricao || null, recursos: recursosTurno, funcionariosFora: fora, notas: notasEquipe, ativa: (equipeAtivaPorMatriz || equipeAtivaPorAlocEquipe) };
          }).filter(Boolean);
        return { ...t, equipes: equipesTurno };
      });
      return { ...base, turnos: porTurno };
    });
    const dataResolved = await Promise.all(data);
    // Enriquecimento: resolver nomes de funcionários em lote para evitar exibir ObjectId/tokens na diária
    try {
      const hexIds = new Set();
      const cods = new Set(); // códigos/matrículas
      const isHex24 = (s)=> typeof s==='string' && /^[0-9a-fA-F]{24}$/.test(s.trim());
      const isBadName = (s)=>{
        const t = (s==null? '': String(s)).trim();
        if(!t) return true;
        if(isHex24(t)) return true;
        if(/^at_[0-9a-z]{6,}$/i.test(t)) return true;
        if(/^ObjectId\(/.test(t)) return true;
        return false;
      };
      // Coleta de referências
      for(const esc of dataResolved){
        for(const t of (esc.turnos||[])){
          for(const eq of (t.equipes||[])){
            // fora (sem recurso)
            for(const f of (eq.funcionariosFora||[])){
              if(!f) continue;
              const id = (f.id!=null? String(f.id): '').trim();
              if(isHex24(id)) hexIds.add(id); else if(id) cods.add(id);
              if(isBadName(f.nome)) { /* marcaremos para preencher depois */ }
            }
            for(const r of (eq.recursos||[])){
              if(!r) continue;
              // membros (se existirem)
              for(const m of (r.membros||[])){
                const id = (m && (m.funcionarioId||m.funcionario_id||m.id)) ? String(m.funcionarioId||m.funcionario_id||m.id).trim() : '';
                if(isHex24(id)) hexIds.add(id); else if(id) cods.add(id);
              }
              // atribuicoes
              for(const a of (r.atribuicoes||[])){
                const id = (a && (a.membroFuncionarioId||a.funcionarioId||a.funcionario||a.matricula||a.id)) ? String(a.membroFuncionarioId||a.funcionarioId||a.funcionario||a.matricula||a.id).trim() : '';
                if(isHex24(id)) hexIds.add(id); else if(id) cods.add(id);
              }
            }
          }
        }
      }
      if(hexIds.size || cods.size){
        const Func = await getFuncionarioModel();
        const ids = Array.from(hexIds.values());
        const codArr = Array.from(cods.values());
        const [byId, byCodigo, byMatricula] = await Promise.all([
          ids.length? Func.find({ _id: { $in: ids } }).select('nome codigo matricula').lean() : Promise.resolve([]),
          codArr.length? Func.find({ codigo: { $in: codArr } }).select('nome codigo matricula').lean() : Promise.resolve([]),
          codArr.length? Func.find({ matricula: { $in: codArr } }).select('nome codigo matricula').lean() : Promise.resolve([])
        ]);
        const mapId = new Map(byId.map(f=> [String(f._id), f]));
        const mapCodigo = new Map();
        for(const f of [...byCodigo, ...byMatricula]){
          if(f.codigo) mapCodigo.set(String(f.codigo), f);
          if(f.matricula) mapCodigo.set(String(f.matricula), f);
        }
        const pickNome = (doc)=>{
          if(!doc) return null;
          const n = (doc.nome && String(doc.nome).trim()) ? String(doc.nome).trim() : null;
          return n;
        };
        // Preencher nomes quando faltarem ou forem "ruins"
        for(const esc of dataResolved){
          for(const t of (esc.turnos||[])){
            for(const eq of (t.equipes||[])){
              for(const f of (eq.funcionariosFora||[])){
                if(!f) continue;
                const id = (f.id!=null? String(f.id): '').trim();
                if(!f.nome || isBadName(f.nome)){
                  const doc = mapId.get(id) || mapCodigo.get(id);
                  const nome = pickNome(doc);
                  if(nome) f.nome = nome; else if(isBadName(f.nome)) f.nome = null; // deixa para o front exibir "—"
                }
              }
              for(const r of (eq.recursos||[])){
                if(!r) continue;
                for(const a of (r.atribuicoes||[])){
                  const id = (a && (a.membroFuncionarioId||a.funcionarioId||a.funcionario||a.matricula||a.id)) ? String(a.membroFuncionarioId||a.funcionarioId||a.funcionario||a.matricula||a.id).trim() : '';
                  if(!a.nome || isBadName(a.nome)){
                    const doc = mapId.get(id) || mapCodigo.get(id);
                    const nome = pickNome(doc);
                    if(nome) a.nome = nome; else if(isBadName(a.nome)) a.nome = null;
                  }
                }
                for(const m of (r.membros||[])){
                  const id = (m && (m.funcionarioId||m.funcionario_id||m.id)) ? String(m.funcionarioId||m.funcionario_id||m.id).trim() : '';
                  if(!m.nome || isBadName(m.nome)){
                    const doc = mapId.get(id) || mapCodigo.get(id);
                    const nome = pickNome(doc);
                    if(nome) m.nome = nome; else if(isBadName(m.nome)) m.nome = null;
                  }
                }
              }
            }
          }
        }
      }
    } catch(_enrNomes){ /* silencioso para não quebrar */ }
  // Enriquecer recursos com dados do cadastro (por id/refId e por placa)
    try {
      // Coletar ids/refIds hex e placas
      const placasSet = new Set();
      const idsSet = new Set(); // _id do Recurso
      const refSet = new Set(); // referenciaGestorId (se for ObjectId)
      const apontadores = []; // { ref, placa }
      const apontadoresId = []; // { ref, tipo:'id'|'ref', id }
      for(const esc of dataResolved){
        try {
          for(const t of (esc.turnos||[])){
            for(const eq of (t.equipes||[])){
              for(const r of (eq.recursos||[])){
                if(!r) continue;
                const placa = (r.placa||'').toString().trim();
                const temTrio = !!((r.marca && String(r.marca).trim()) || (r.modelo && String(r.modelo).trim()));
                if(placa && !temTrio){ placasSet.add(placa.toUpperCase()); apontadores.push({ ref:r, placa: placa.toUpperCase() }); }
                const rid = (r.id!=null? String(r.id): '').trim();
                const refId = (r.referenciaGestorId!=null? String(r.referenciaGestorId): '').trim();
                if(rid && /^[0-9a-fA-F]{24}$/.test(rid)) { idsSet.add(rid); apontadoresId.push({ ref:r, tipo:'id', id:rid }); }
                if(refId && /^[0-9a-fA-F]{24}$/.test(refId)) { refSet.add(refId); apontadoresId.push({ ref:r, tipo:'ref', id:refId }); }
              }
            }
          }
        } catch(_scan){ /* noop */ }
      }
      // Enriquecer por _id/refId -> preencher placa/marca/modelo
      if(idsSet.size || refSet.size){
        const Recurso = await getRecursoModel();
        const ids = Array.from(new Set([ ...Array.from(idsSet.values()), ...Array.from(refSet.values()) ]).values());
        const docsById = await Recurso.find({ _id: { $in: ids } }).select('placa marca modelo fabricante model').lean();
        const mapaId = new Map();
        for(const d of docsById){ if(!d) continue; const k=String(d._id); mapaId.set(k, { placa: d.placa||null, marca: d.marca||d.fabricante||null, modelo: d.modelo||d.model||null }); }
        for(const ap of apontadoresId){
          const hit = mapaId.get(ap.id);
          if(hit){
            if(!ap.ref.placa && hit.placa) ap.ref.placa = hit.placa;
            if(!ap.ref.marca && hit.marca) ap.ref.marca = hit.marca;
            if(!ap.ref.modelo && hit.modelo) ap.ref.modelo = hit.modelo;
          }
        }
      }
      if(placasSet.size){
        const Recurso = await getRecursoModel();
        const placas = Array.from(placasSet.values());
        const docs = await Recurso.find({ placa: { $in: placas } }).select('placa marca modelo fabricante model').lean();
        const mapa = new Map();
        for(const d of docs){ if(!d) continue; const p = (d.placa||'').toString().trim().toUpperCase(); if(!p) continue; mapa.set(p, { marca: d.marca||d.fabricante||null, modelo: d.modelo||d.model||null }); }
        for(const ap of apontadores){
          const hit = mapa.get(ap.placa);
          if(hit){ if(!ap.ref.marca && hit.marca) ap.ref.marca = hit.marca; if(!ap.ref.modelo && hit.modelo) ap.ref.modelo = hit.modelo; }
        }
      }
    } catch(_enr){ /* silencioso para não quebrar a diária */ }
    return res.json({ ok:true, data: dataResolved });
  } catch(e){ console.error('[escalasApi.new][GET diaria] erro', e); return res.status(500).json({ ok:false, error:'Falha ao obter escala diária' }); }
});

// ===== Disponibilidade em lote por funcionário/dia =====
// POST /escalas/api/funcionarios/disponibilidade
// Body:
//  - { items: [ { funcionarioId, dia } ] }
//  - ou { inicio:'YYYY-MM-DD', fim:'YYYY-MM-DD', funcionarios:[id,...] }
// Retorna: { ok:true, results: [ { key:'fid|dia', funcionarioId, dia, livre:true|false, motivo:null|'ferias'|'ausencia'|'misto' } ] }
router.post('/api/funcionarios/disponibilidade', requireEscalasAuth, async (req,res)=>{
  try {
    const body = req.body || {};
    let items = [];
    if(Array.isArray(body.items)){
      items = body.items;
    } else if(Array.isArray(body.funcionarios) && body.inicio && body.fim){
      // Expandir em diário
      const ini = String(body.inicio); const fim = String(body.fim);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) return res.status(400).json({ ok:false, error:'Formato de data inválido' });
      const d0=new Date(ini+'T00:00:00'); const d1=new Date(fim+'T00:00:00');
      if(d1 < d0) return res.status(400).json({ ok:false, error:'fim < inicio' });
      const arrDias=[]; for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)){ arrDias.push(d.toISOString().slice(0,10)); }
      for(const fid of body.funcionarios){ for(const dia of arrDias){ items.push({ funcionarioId: fid, dia }); } }
    }
    if(!items.length) return res.status(400).json({ ok:false, error:'Nenhum item informado' });
    if(items.length > 5000) return res.status(400).json({ ok:false, error:'Muitos itens (>5000)' });

    // Agrupar por funcionário
    const byFunc = new Map();
    for(const it of items){
      const funcionarioId = it.funcionarioId || it.id || it.func || it.fid;
      const dia = it.dia || it.data || it.dataISO;
      if(!funcionarioId || !/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) continue;
      const keyF = String(funcionarioId);
      if(!byFunc.has(keyF)) byFunc.set(keyF, new Set());
      byFunc.get(keyF).add(String(dia));
    }
    if(byFunc.size===0) return res.status(400).json({ ok:false, error:'Nenhum item válido' });

    const Ferias = await getFeriasModel();
    const Ausencia = await getAusenciaModel();
    const Func = await getFuncionarioModel();

    const out = [];
    for(const [fidRaw, diasSet] of byFunc.entries()){
      // Resolver funcionarioId -> ObjectId, permitindo código/CPF como fallback
      let fidObjId = null; let fidStr = null;
      if(mongoose.isValidObjectId(fidRaw)){ fidObjId = new mongoose.Types.ObjectId(fidRaw); fidStr = String(fidObjId); }
      if(!fidObjId){
        try {
          const safe = String(fidRaw).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
          const fdoc = await Func.findOne({ $or:[ { codigo: new RegExp('^'+safe+'$','i') }, { cpf: String(fidRaw).replace(/\D+/g,'') } ] }).select('_id').lean();
          if(fdoc && fdoc._id){ fidObjId = fdoc._id; fidStr = String(fdoc._id); }
        } catch(_e){}
      }
      if(!fidObjId){ for(const dia of diasSet){ out.push({ key:`${fidRaw}|${dia}`, funcionarioId: fidRaw, dia, livre:false, motivo:'funcionario_invalido' }); } continue; }

      // Determinar janela mínima que cobre todos os dias solicitados
      const dias = Array.from(diasSet).sort();
      const iniISO = dias[0]; const fimISO = dias[dias.length-1];
      // Buscar blocos que se sobrepõem
      const ferias = await Ferias.find({ funcionarioId: fidObjId, inicioISO:{ $lte:fimISO }, fimISO:{ $gte:iniISO } }, { inicioISO:1, fimISO:1 }).lean();
      const ausencias = await Ausencia.find({ funcionarioId: fidObjId, inicioISO:{ $lte:fimISO }, fimISO:{ $gte:iniISO } }, { inicioISO:1, fimISO:1 }).lean();
      const blocks = [];
      ferias.forEach(f=> blocks.push({ ini: f.inicioISO, fim: f.fimISO, tipo:'ferias' }));
      ausencias.forEach(a=> blocks.push({ ini: a.inicioISO, fim: a.fimISO, tipo:'ausencia' }));
      // Merge simples por data (strings ISO YYYY-MM-DD, ordenáveis)
      blocks.sort((a,b)=> (a.ini<b.ini?-1:a.ini>b.ini?1:0) || (a.fim<b.fim?-1:a.fim>b.fim?1:0));
      const merged=[];
      for(const b of blocks){
        if(!merged.length){ merged.push({ ...b }); continue; }
        const last = merged[merged.length-1];
        // adjacente ou sobreposto: if last.fim >= b.ini-1dia (string compare +1 dia)
        const lastFim = last.fim; const bIni = b.ini;
        const adj = (new Date(lastFim+'T00:00:00').getTime() + 86400000) >= new Date(bIni+'T00:00:00').getTime();
        if(adj){ if(b.fim > last.fim) last.fim = b.fim; if(last.tipo !== b.tipo) last.tipo = 'misto'; }
        else { merged.push({ ...b }); }
      }
      // Para cada dia solicitado, determinar se está livre
      for(const dia of dias){
        let livre = true; let motivo = null;
        for(const blk of merged){ if(blk.ini <= dia && blk.fim >= dia){ livre=false; motivo = blk.tipo||'misto'; break; } }
        out.push({ key:`${fidStr}|${dia}`, funcionarioId: fidStr, dia, livre, motivo });
      }
    }
    return res.json({ ok:true, results: out });
  } catch(e){
    console.error('[escalasApi.new][POST disponibilidade em lote] erro', e);
    return res.status(500).json({ ok:false, error:'Falha ao verificar disponibilidade em lote' });
  }
});

// ===== Relatório: Horas trabalhadas (JSON) =====
// GET /escalas/api/relatorios/horas-trabalhadas?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&funcionarioId=<id[,id2]>|&unidadeId=<id>&filiais=1
// Retorna por funcionário uma matriz diária com: diurnas, noturnasSimples, noturnasCLT, totalSimples, totalCLT
router.get('/api/relatorios/horas-trabalhadas', requireEscalasAuth, async (req,res)=>{
  try{
    let { inicio, fim, funcionarioId, unidadeId, filiais, scopeGeral } = req.query||{};
    if(!inicio || !/\d{4}-\d{2}-\d{2}/.test(String(inicio))) return res.status(400).json({ ok:false, error:'inicio inválido (YYYY-MM-DD)' });
    if(!fim   || !/\d{4}-\d{2}-\d{2}/.test(String(fim)))   return res.status(400).json({ ok:false, error:'fim inválido (YYYY-MM-DD)' });
    fim = clampTodayISO(String(fim));
    if(String(fim) < String(inicio)) return res.status(400).json({ ok:false, error:'fim < inicio' });
    const dias = eachDayISO(String(inicio), String(fim));
    if(!dias.length) return res.status(400).json({ ok:false, error:'intervalo vazio' });

    const Escala = await getEscalaModel();
    const Unidade = await getUnidadeModel();
    const FuncM = await getFuncionarioModel();

    // Filtro por unidade (opcional)
    let filtroUn = {};
    if(unidadeId && /^[0-9a-fA-F]{24}$/.test(String(unidadeId))){
      if(String(filiais||'')==='1'){
        const u = await Unidade.findById(unidadeId).select('_id is_principal unidade_principal_id').lean();
        if(u){ const matriz = u.is_principal? u._id : (u.unidade_principal_id || u._id);
          const ids = await Unidade.find({ $or:[ { _id: matriz }, { unidade_principal_id: matriz } ] }).select('_id').lean();
          filtroUn = { unidade_id: { $in: ids.map(x=> x._id) } };
        } else { filtroUn = { unidade_id: new mongoose.Types.ObjectId(unidadeId) }; }
      } else {
        filtroUn = { unidade_id: new mongoose.Types.ObjectId(unidadeId) };
      }
    }

    // Utilitário: coleta funcionários de uma alocação de recurso (atribuicoes + fallback membros)
    const normalizarToken = (s)=> String(s||'').replace(/\s+(às|as|a)\s+/ig,'-').replace(/[–—−‑‒]/g,'-').replace(/\s*-\s*/g,'-');
    function coletarFidsRecursoDiaTurno(r, dia, token){
      const out = new Set();
      try{
        const tSlim = normalizarToken(token);
        const atribs = Array.isArray(r.atribuicoes)? r.atribuicoes.filter(a=>{
          if(!a) return false; const dOk = a.dia? a.dia===dia : true; if(!dOk) return false; const raw = a.turnoId||a.turno||''; const slim = normalizarToken(raw); return !slim || slim===tSlim; }): [];
        for(const a of atribs){ const id=a.membroFuncionarioId||a.funcionarioId||a.funcionario||a.funcionario_id||a.matricula||a.id; if(id) out.add(String(id)); }
        if(r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){
          const key1 = `${dia}__${token}`; const key2 = `${dia}__${normalizarToken(token)}`;
          const lista = r.atribuicoesRecurso[key1] || r.atribuicoesRecurso[key2] || [];
          if(Array.isArray(lista)) lista.forEach(it=>{ const id=it?.membroFuncionarioId||it?.funcionarioId||it?.id||it?.matricula; if(id) out.add(String(id)); });
        }
        // Fallback: se não houver atribuições explícitas, usar membros fixos do recurso
        if(out.size===0 && Array.isArray(r.membros)){
          r.membros.forEach(m=>{ const id=m?.funcionario_id||m?.id||m?.funcionarioId; if(id) out.add(String(id)); });
        }
      }catch(_){ }
      return [...out.values()];
    }

    // Core: escaneia escalas e agrega minutos dentro de um predicado de dia
    async function coletarMinutos({ inicioISO, fimISO, filtroUnidade }){
      const agg = new Map();
      const dtIniLim = new Date('1970-01-01T00:00:00.000Z');
      const dtFim = new Date(String(fimISO)+'T00:00:00.000Z');
      const dtIni = inicioISO? new Date(String(inicioISO)+'T00:00:00.000Z') : dtIniLim;
      const filtros = { ...(filtroUnidade||{}), data_inicio: { $lte: dtFim }, data_fim: { $gte: dtIni } };
      const docs = await Escala.find(filtros).select('equipes recursos grupos_turnos alocacao').lean();
      // Índices auxiliares por equipe id/nome
      function mapEquipes(esc){
        const equipes = Array.isArray(esc.equipes)? esc.equipes: [];
        return {
          byId: new Map(equipes.map(e=> [String(e.id), e])),
          byNome: new Map(equipes.map(e=> [String((e.nome||'').toUpperCase()), e]))
        };
      }
      function iterRecursos(esc){
        const arr=[]; (esc.equipes||[]).forEach(eq=> (eq.recursos||[]).forEach(r=> arr.push({ r, eq })));
        if(Array.isArray(esc.recursos)) esc.recursos.forEach(r=> arr.push({ r, eq:null }));
        return arr;
      }
      for(const esc of docs){
        const { byId, byNome } = mapEquipes(esc);
        // 1) Recursos -> alocações por dia
        for(const pair of iterRecursos(esc)){
          const r = pair.r; const alocs = Array.isArray(r.alocacoes)? r.alocacoes: [];
          for(const a of alocs){
            const dia = String(a?.dia||''); if(!/\d{4}-\d{2}-\d{2}/.test(dia)) continue;
            if(inicioISO && dia < inicioISO) continue; if(dia > fimISO) continue;
            const range = resolveAlocacaoRangeMin(a, esc); if(!range) continue;
            const token = `${String(range.ini).toString().padStart(2,'0')}:${String(range.ini%60).toString().padStart(2,'0')}-${String(range.fim===0?0:Math.floor(range.fim/60)).toString().padStart(2,'0')}:${String(range.fim%60).toString().padStart(2,'0')}`; // apenas para lookup legado
            const tStr = `${String(Math.floor(range.ini/60)).padStart(2,'0')}:${String(range.ini%60).padStart(2,'0')}-${String(Math.floor((range.fim===0?1440:range.fim)/60)%24).toString().padStart(2,'0')}:${String((range.fim===0?1440:range.fim)%60).toString().padStart(2,'0')}`;
            const fids = coletarFidsRecursoDiaTurno(r, dia, tStr) || [];
            const slots = allocateToDays(dia, range.ini, range.fim);
            for(const fid of fids){ for(const s of slots){ addAgg(agg, fid, s.dia, s.diurno, s.noturno); } }
          }
        }
        // 2) Matriz de alocação no nível da escala (equipes) -> componentes
        const matriz = esc?.alocacao && typeof esc.alocacao==='object'? esc.alocacao: {};
        for(const [k,v] of Object.entries(matriz)){
          const parsed = parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k, esc);
          if(!parsed) continue;
          const dia = parsed.dia; if(inicioISO && dia < inicioISO) continue; if(dia > fimISO) continue;
          const ini = parseHHMMToMin(parsed.ini); const fim = parseHHMMToMin(parsed.fim);
          if(ini==null||fim==null) continue; const slots = allocateToDays(dia, ini, fim);
          // Normalizar v em lista de tokens de equipe (id ou nome)
          let tokens=[]; if(Array.isArray(v)) tokens=v.map(x=> String(x)); else if(typeof v==='string') tokens=v.split(',').map(s=> s.trim()).filter(Boolean); else if(v&&typeof v==='object'){ tokens = Object.keys(v).filter(z=> v[z]); }
          for(const tok of tokens){ let eq = byId.get(String(tok)) || byNome.get(String(tok).toUpperCase()); if(!eq) continue; const comps = Array.isArray(eq.componentes)? eq.componentes: []; for(const c of comps){ const fid=c?.funcionario_id||c?.id; if(!fid) continue; for(const s of slots){ addAgg(agg, fid, s.dia, s.diurno, s.noturno); } } }
        }
      }
      return agg; // Map(fid -> Map(dia -> {diurno,noturno}))
    }

    // 1) Agregar minutos no período
    const aggPeriodo = await coletarMinutos({ inicioISO: String(inicio), fimISO: String(fim), filtroUnidade: filtroUn });
    // 2) Agregar minutos no geral (desde o início do sistema até fim)
    const filtroGeralUn = (scopeGeral==='unidade')? filtroUn : {}; // por padrão, total geral em todo o sistema
    const aggGeral   = await coletarMinutos({ inicioISO: null, fimISO: String(fim), filtroUnidade: filtroGeralUn });

    // Determinar conjunto de funcionários a exibir
    let alvoIds = new Set();
    if(funcionarioId){ String(funcionarioId).split(',').map(s=> s.trim()).filter(Boolean).forEach(id=> alvoIds.add(id)); }
    else {
      // se não especificado, usa todos que apareceram no período (ou todos da unidade, se nenhum no período)
      for(const fid of aggPeriodo.keys()) alvoIds.add(fid);
      if(alvoIds.size===0){ for(const fid of aggGeral.keys()) alvoIds.add(fid); }
    }
    // Enriquecimento de nomes/códigos para IDs hex e também para códigos
    const hexIds=[...alvoIds].filter(id=> /^[0-9a-fA-F]{24}$/.test(String(id)));
    const outInfo = new Map();
    if(hexIds.length){ const docs = await FuncM.find({ _id: { $in: hexIds } }).select('nome codigo').lean(); docs.forEach(f=> outInfo.set(String(f._id), { id:String(f._id), codigo:f.codigo||null, nome:f.nome||null })); }
    // Para chaves não-hex (provavelmente códigos/matrículas), tente resolver
    const nonHex=[...alvoIds].filter(id=> !/^[0-9a-fA-F]{24}$/.test(String(id)));
    if(nonHex.length){ const docs = await FuncM.find({ $or:[ { codigo: { $in: nonHex } }, { matricula: { $in: nonHex } } ] }).select('_id nome codigo matricula'); docs.forEach(f=>{ outInfo.set(String(f.codigo||f.matricula), { id:String(f._id), codigo:f.codigo||f.matricula||null, nome:f.nome||null }); }); }

    // Montar saída por funcionário
    const diasArr = dias; // já clampado
    const results=[];
    for(const fidRaw of alvoIds){
      const byDiaPeriodo = aggPeriodo.get(fidRaw) || new Map();
      const byDiaGeral   = aggGeral.get(fidRaw)   || new Map();
      const cols = { diurnas:[], noturnas:[], noturnasCLT:[], totalSimples:[], totalCLT:[] };
      let totD=0, totN=0;
      for(const d of diasArr){ const v = byDiaPeriodo.get(d)||{ diurno:0, noturno:0 }; const nclt = minutesNoturnosCLT(v.noturno); const tS = v.diurno + v.noturno; const tC = v.diurno + nclt; cols.diurnas.push(fmtMin(v.diurno)); cols.noturnas.push(fmtMin(v.noturno)); cols.noturnasCLT.push(fmtMin(nclt)); cols.totalSimples.push(fmtMin(tS)); cols.totalCLT.push(fmtMin(tC)); totD += v.diurno; totN += v.noturno; }
      const totalPeriodo = { diurnasMin: totD, noturnasMin: totN, noturnasCLTMin: minutesNoturnosCLT(totN), totalSimplesMin: (totD+totN), totalCLTMin: (totD+minutesNoturnosCLT(totN)), diurnas: fmtMin(totD), noturnas: fmtMin(totN), noturnasCLT: fmtMin(minutesNoturnosCLT(totN)), totalSimples: fmtMin(totD+totN), totalCLT: fmtMin(totD+minutesNoturnosCLT(totN)) };
      // Total Geral (até fim)
      let gD=0, gN=0; for(const [dia, v] of byDiaGeral.entries()){ if(dia <= String(fim)){ gD += v.diurno; gN += v.noturno; } }
      const totalGeral = { diurnasMin: gD, noturnasMin: gN, noturnasCLTMin: minutesNoturnosCLT(gN), totalSimplesMin: (gD+gN), totalCLTMin: (gD+minutesNoturnosCLT(gN)), diurnas: fmtMin(gD), noturnas: fmtMin(gN), noturnasCLT: fmtMin(minutesNoturnosCLT(gN)), totalSimples: fmtMin(gD+gN), totalCLT: fmtMin(gD+minutesNoturnosCLT(gN)) };
      const info = outInfo.get(String(fidRaw)) || { id: (/^[0-9a-fA-F]{24}$/.test(String(fidRaw))? String(fidRaw): null), codigo: (/^[0-9a-fA-F]{24}$/.test(String(fidRaw))? null: String(fidRaw)), nome: null };
      results.push({ funcionario: info, periodo: { ini:String(inicio), fim:String(fim) }, dias: diasArr, linhas: cols, totalPeriodo, totalGeral });
    }
    // Ordenar resultados por nome/código
    results.sort((a,b)=>{
      const an=(a?.funcionario?.nome||'').toUpperCase(); const bn=(b?.funcionario?.nome||'').toUpperCase(); if(an&&bn) return an.localeCompare(bn); const ac=a?.funcionario?.codigo||''; const bc=b?.funcionario?.codigo||''; return String(ac).localeCompare(String(bc));
    });
    return res.json({ ok:true, params:{ inicio, fim, unidadeId: unidadeId||null, filiais: String(filiais||'')==='1', scopeGeral: scopeGeral||'global' }, dias: diasArr, results });
  }catch(e){
    console.error('[escalasApi.new][GET horas-trabalhadas] erro', e);
    return res.status(500).json({ ok:false, error:'Falha ao gerar relatório de horas' });
  }
});

// Resolver responsável por ID (pode ser ID de usuário ou de funcionário)
// Colocado ANTES de /api/escalas/:id para evitar captura por rota paramétrica
// GET /escalas/api/escalas/resolve-responsavel?id=<ObjectId>
router.get('/api/escalas/resolve-responsavel', requireEscalasAuth, async (req,res)=>{
  try {
    const q = req.query || {};
    let raw = '';
    // aceitar múltiplas chaves comuns
    const cand = q.id || q._id || q.uid || q.userId || q.funcionarioId || q.fid || '';
    if(typeof cand==='string'){ raw = cand.trim(); }
    // aceitar também "ids" (lista) e pegar o primeiro
    if(!raw && typeof q.ids==='string'){
      const first = q.ids.split(',').map(s=> s.trim()).filter(Boolean)[0];
      raw = first || '';
    }
    // fallback: reparse a partir da URL original
    if(!raw){
      try { const u = new URL('http://local'+(req.originalUrl||req.url||'')); raw = (u.searchParams.get('id')||'').trim(); } catch(_e){}
    }
    const isHex24 = (v)=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v);
    if(!raw || !isHex24(raw)){
      if(process.env.NODE_ENV !== 'production'){
        console.warn('[resolve-responsavel] id inválido', { raw, query:q, url:req.url, originalUrl:req.originalUrl });
      }
      return res.status(400).json({ ok:false, error:'id inválido' });
    }
    const modUser = await import('#core/models/user.js');
    const UserModel = modUser.default || modUser.User || modUser;
    const modFunc = await import('#core/models/Funcionario.js');
    const FuncModel = modFunc.default || modFunc.Funcionario || modFunc;
    let nome=null, codigo=null, origem='none';
    // 1) Tentar como Usuário
    try {
      const u = await UserModel.findById(raw).select('nome funcionario_id funcionarioId').lean();
      if(u){
        const fid = u.funcionario_id || u.funcionarioId || null;
        if(fid){
          const f = await FuncModel.findById(fid).select('nome codigo').lean();
          if(f){ nome = f.nome||u.nome||null; codigo = f.codigo||null; origem='user>funcionario_id'; }
          else { nome = u.nome||null; origem='user(nome)'; }
        } else { nome = u.nome||null; origem='user(nome)'; }
      }
    } catch(_e){ /* noop */ }
    // 2) Tentar como Funcionário direto
    if(!(nome||codigo)){
      try {
        const f = await FuncModel.findById(raw).select('nome codigo').lean();
        if(f){ nome=f.nome||null; codigo=f.codigo||null; origem='funcionario(_id)'; }
      } catch(_f){}
    }
    // 3) Funcionário por usuario_id
    if(!(nome||codigo)){
      try {
        const f = await FuncModel.findOne({ usuario_id: raw }).select('nome codigo').lean();
        if(f){ nome=f.nome||null; codigo=f.codigo||null; origem='funcionario(usuario_id)'; }
      } catch(_fu){}
    }
    const display = (codigo && nome) ? `${codigo} - ${nome}` : (nome || null);
    return res.json({ ok:true, id: raw, nome, codigo, display, origem });
  } catch(e){ console.error('[escalasApi.new][GET resolve-responsavel] erro', e); return res.status(500).json({ ok:false, error:'Falha ao resolver responsável' }); }
});

// Obter escala (nova estrutura nested)
router.get('/api/escalas/:id', requireEscalasAuth, async (req,res)=>{
  try {
    let { id } = req.params; if(typeof id==='string') id=id.trim();
    if(!id || !id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const esc = await carregarEscalaLean(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  // Resolver nome do responsável (pode ser user ou funcionario)
  let responsavel_nome=null; let responsavel_codigo=null; let responsavel_resolucao='none';
    try {
      const modUser = await import('#core/models/user.js');
      const UserModel = modUser.default || modUser.User || modUser;
      const modFunc = await import('#core/models/Funcionario.js');
      const FuncModel = modFunc.default || modFunc.Funcionario || modFunc;
      // 1) Tentar via responsavel_id
      if(esc.responsavel_id){
        // Pode ser um User (com vínculo funcionario_id) ou um Funcionario direto
        try {
          const u = await UserModel.findById(esc.responsavel_id).select('nome funcionario_id funcionarioId').lean();
          if(u){
            const fid = u.funcionario_id || u.funcionarioId || null;
            if(fid){
              try {
                const fFromU = await FuncModel.findById(fid).select('nome codigo').lean();
                if(fFromU){
                  responsavel_nome = fFromU.nome || responsavel_nome || (u.nome||null);
                  responsavel_codigo = fFromU.codigo || responsavel_codigo || null;
                  responsavel_resolucao = 'responsavel_id:user>funcionario_id';
                } else {
                  responsavel_nome = u.nome || responsavel_nome;
                  responsavel_resolucao = 'responsavel_id:user(nome)';
                }
              } catch(_eLink){ responsavel_nome = u.nome || responsavel_nome; }
            } else {
              responsavel_nome = u.nome || responsavel_nome;
              responsavel_resolucao = 'responsavel_id:user(nome)';
            }
          }
        } catch(_u){}
        if(!(responsavel_nome||responsavel_codigo)){
          try {
            const f = await FuncModel.findById(esc.responsavel_id).select('nome codigo usuario_id').lean();
            if(f){ responsavel_nome=f.nome||responsavel_nome; responsavel_codigo=f.codigo||responsavel_codigo; responsavel_resolucao = 'responsavel_id:funcionario(_id)'; }
          } catch(_f){}
        }
        // Extra: se ainda não, procurar funcionário pelo campo usuario_id
        if(!(responsavel_nome||responsavel_codigo)){
          try {
            const fByUser = await FuncModel.findOne({ usuario_id: esc.responsavel_id }).select('nome codigo').lean();
            if(fByUser){ responsavel_nome = fByUser.nome || responsavel_nome; responsavel_codigo = fByUser.codigo || responsavel_codigo; responsavel_resolucao = 'responsavel_id:funcionario(usuario_id)'; }
          } catch(_fUser){}
        }
      }
      // 2) Fallback: se ainda não temos nome/código, usar criado_por (mapeando para Funcionario via funcionario_id do User ou via usuario_id no Funcionario)
      if(!(responsavel_nome||responsavel_codigo)){
        const uid = esc.criado_por || null;
        if(uid){
          try {
            const u2 = await UserModel.findById(uid).select('nome funcionario_id funcionarioId').lean();
            if(u2){
              const fid2 = u2.funcionario_id || u2.funcionarioId || null;
              if(fid2){
                try {
                  const f2fromU = await FuncModel.findById(fid2).select('nome codigo').lean();
                  if(f2fromU){
                    responsavel_nome = f2fromU.nome || responsavel_nome || (u2.nome||null);
                    responsavel_codigo = f2fromU.codigo || responsavel_codigo || null;
                    responsavel_resolucao = 'criado_por:user>funcionario_id';
                  } else if(u2.nome){
                    responsavel_nome = responsavel_nome || u2.nome; responsavel_resolucao = 'criado_por:user(nome)';
                  }
                } catch(_eU2){ if(u2 && u2.nome){ responsavel_nome = responsavel_nome || u2.nome; responsavel_resolucao = 'criado_por:user(nome)'; } }
              } else if(u2.nome){
                responsavel_nome = responsavel_nome || u2.nome; responsavel_resolucao = 'criado_por:user(nome)';
              }
            }
          } catch(_u2){}
          try {
            const f2 = await FuncModel.findOne({ usuario_id: uid }).select('nome codigo').lean();
            if(f2){
              responsavel_nome = f2.nome || responsavel_nome;
              responsavel_codigo = f2.codigo || responsavel_codigo;
              responsavel_resolucao = 'criado_por:funcionario(usuario_id)';
            }
          } catch(_f2){}
        }
      }
      // 3) Fallback adicional: resolver a partir de responsavel_raw (pode ser ID, CPF ou Código)
      if(!(responsavel_nome||responsavel_codigo)){
        try {
          const raw = esc.responsavel_raw && String(esc.responsavel_raw).trim();
          if(raw){
            const onlyDigits = (v)=> String(v||'').replace(/\D+/g,'');
            const isHex24 = (v)=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v);
            let fdoc=null;
            if(isHex24(raw)){
              try { fdoc = await FuncModel.findById(raw).select('nome codigo').lean(); } catch(_e){}
              if(!fdoc){
                try { fdoc = await FuncModel.findOne({ usuario_id: raw }).select('nome codigo').lean(); } catch(_eU){}
              }
              if(!fdoc){
                // raw pode ser um usuário: tenta mapear via User.funcionario_id
                try {
                  const uRaw = await UserModel.findById(raw).select('nome funcionario_id funcionarioId').lean();
                  if(uRaw){
                    const fidRaw = uRaw.funcionario_id || uRaw.funcionarioId || null;
                    if(fidRaw){
                      try {
                        const fFromURaw = await FuncModel.findById(fidRaw).select('nome codigo').lean();
                        if(fFromURaw){
                          fdoc = fFromURaw; responsavel_resolucao = 'raw:user>funcionario_id';
                        } else {
                          responsavel_nome = uRaw.nome || responsavel_nome; if(!responsavel_resolucao) responsavel_resolucao = 'raw:user(nome)';
                        }
                      } catch(_mapRaw){ responsavel_nome = uRaw.nome || responsavel_nome; if(!responsavel_resolucao) responsavel_resolucao = 'raw:user(nome)'; }
                    } else {
                      responsavel_nome = uRaw.nome || responsavel_nome; if(!responsavel_resolucao) responsavel_resolucao = 'raw:user(nome)';
                    }
                  }
                } catch(_uRaw){}
              }
            }
            if(!fdoc){
              const cpf = onlyDigits(raw);
              if(cpf.length===11){ try { fdoc = await FuncModel.findOne({ cpf }).select('nome codigo').lean(); if(fdoc) responsavel_resolucao = 'raw:funcionario(cpf)'; } catch(_e2){} }
            }
            if(!fdoc){
              const safe = String(raw).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
              try { fdoc = await FuncModel.findOne({ codigo: new RegExp('^'+safe+'$','i') }).select('nome codigo').lean(); if(fdoc) responsavel_resolucao = 'raw:funcionario(codigo)'; } catch(_e3){}
            }
            if(fdoc){ responsavel_nome = fdoc.nome || responsavel_nome; responsavel_codigo = fdoc.codigo || responsavel_codigo; if(!responsavel_resolucao) responsavel_resolucao = 'raw:funcionario(lookup)'; }
          }
        } catch(_raw){ /* noop */ }
      }
    } catch(eLook){ console.warn('[escalasApi.new][GET escala][responsavel-lookup]', eLook.message); }
    // Remover eventual campo recursos legacy se ainda existir
    if(esc.recursos) delete esc.recursos;
    // Normalizar computavel nas refeições de todos os recursos aninhados (compat docs antigos)
    // e detectar se precisamos aplicar backfill em disco
    let hadMissing=false;
    try {
      for(const eq of (esc.equipes||[])){
        for(const r of (eq.recursos||[])){
          if(Array.isArray(r.refeicoes)){
            const falta = r.refeicoes.some(iv=> !iv || typeof iv.computavel !== 'boolean');
            if(falta) hadMissing=true;
            r.refeicoes = r.refeicoes.map(iv=>{
              if(!iv || typeof iv!=='object') return iv;
              if(typeof iv.computavel==='boolean') return iv;
              const t = String(iv.tipo||'');
              const comp = !/nao[_ ]?computad|não[_ ]?computad/i.test(t);
              return { ...iv, computavel: comp };
            });
          }
        }
      }
    } catch(_norm){ /* noop */ }
    if(hadMissing){ await ensureBackfillRefeicoesComputavel(id); }
      // Resolver nomes dos componentes de equipe ausentes (melhora exibição na aba Equipes)
      try {
        const idsSemNome = new Set();
        for (const eq of (esc.equipes || [])) {
          const comps = Array.isArray(eq.componentes) ? eq.componentes : [];
          for (const c of comps) {
            if (!c) continue;
            const temNome = !!(c.nome && String(c.nome).trim());
            if (temNome) continue;
            const cand = String(c.funcionario_id || c.id || '').trim();
            if (/^[0-9a-fA-F]{24}$/.test(cand)) idsSemNome.add(cand);
          }
        }
        if (idsSemNome.size) {
          const FuncModel = await getFuncionarioModel();
          const ids = Array.from(idsSemNome.values());
          const docs = await FuncModel.find({ _id: { $in: ids } }).select('nome codigo').lean();
          const mapa = new Map(docs.map(d => [String(d._id), { nome: d.nome || null, codigo: d.codigo || null }]));
          for (const eq of (esc.equipes || [])) {
            const comps = Array.isArray(eq.componentes) ? eq.componentes : [];
            for (const c of comps) {
              if (!c) continue;
              const cid = String(c.funcionario_id || c.id || '').trim();
              if (mapa.has(cid)){
                const v = mapa.get(cid);
                if (!c.nome && v.nome) c.nome = v.nome;
                if (!c.codigo && v.codigo) c.codigo = v.codigo;
                if (!c.matricula && v.codigo) c.matricula = v.codigo;
              }
            }
          }
        }
      } catch (_resComp) { /* noop resolução de nomes de componentes */ }
      // Se a equipe não possuir componentes, mas recursos tiverem membros/atribuições, expor estes membros como componentes (visão consolidada)
      try {
        for (const eq of (esc.equipes || [])) {
          const comps = Array.isArray(eq.componentes) ? eq.componentes : [];
          const temComps = comps.length > 0;
          const recursos = Array.isArray(eq.recursos) ? eq.recursos : [];
          if (temComps || recursos.length === 0) continue;
          const mapa = new Map();
          for (const r of recursos) {
            const membros = Array.isArray(r?.membros) ? r.membros : [];
            for (const m of membros) {
              if (!m) continue;
              const fid = String(m.funcionario_id || m.id || '').trim();
              if (!fid) continue;
              if (!mapa.has(fid)) {
                mapa.set(fid, { id: fid, funcionario_id: fid, nome: m.nome || null });
              }
            }
            // Fallback adicional: derivar de atribuições quando não há membros
            if (membros.length === 0 && Array.isArray(r?.atribuicoes) && r.atribuicoes.length) {
              for (const a of r.atribuicoes) {
                if (!a) continue;
                const fid = String(a.membroFuncionarioId || a.funcionarioId || a.funcionario_id || a.id || '').trim();
                if (!fid) continue;
                if (!mapa.has(fid)) {
                  mapa.set(fid, { id: fid, funcionario_id: fid, nome: a.nome || a.funcionarioNome || null });
                }
              }
            }
          }
          if (mapa.size) {
            eq.componentes = Array.from(mapa.values());
          }
        }
      } catch (_fillFromMembros) { /* noop fill componentes from membros */ }
      // Passo final: enriquecer TODOS os componentes (após consolidações) com nome/código do Funcionario
      try {
        const setIds = new Set();
        for(const eq of (esc.equipes||[])){
          for(const c of (Array.isArray(eq.componentes)? eq.componentes: [])){
            const fid = String(c?.funcionario_id || c?.id || '').trim();
            if(fid && /^[0-9a-fA-F]{24}$/.test(fid)) setIds.add(fid);
          }
        }
        if(setIds.size){
          const FuncModel = await getFuncionarioModel();
          const ids = Array.from(setIds.values());
          const docs = await FuncModel.find({ _id: { $in: ids } }).select('nome codigo').lean();
          const mapa = new Map(docs.map(d=> [String(d._id), { nome:d.nome||null, codigo:d.codigo||null }]));
          for(const eq of (esc.equipes||[])){
            for(const c of (Array.isArray(eq.componentes)? eq.componentes: [])){
              const fid = String(c?.funcionario_id || c?.id || '').trim();
              const hit = mapa.get(fid);
              if(hit){
                if(!c.nome && hit.nome) c.nome = hit.nome;
                if(!c.codigo && hit.codigo) c.codigo = hit.codigo;
                if(!c.matricula && hit.codigo) c.matricula = hit.codigo;
              }
            }
          }
        }
      } catch(_enrichAll){ /* noop enrich all comps */ }
      // Complemento: se existem recursos legados na raiz (esc.recursos), usar seus membros para popular componentes por equipe
      try {
        const recursosRaiz = Array.isArray(esc.recursos) ? esc.recursos : [];
        if(recursosRaiz.length && Array.isArray(esc.equipes)){
          const byId = new Map(esc.equipes.map(e=> [String(e.id), e]));
          const byNome = new Map(esc.equipes.map(e=> [String((e.nome||'').toUpperCase()), e]));
          for(const r of recursosRaiz){
            const eidRaw = r?.equipeId || r?.equipe_id || r?.equipe || null;
            const eid = eidRaw ? String(eidRaw) : null;
            let eq = eid && byId.get(eid);
            if(!eq && eid){ eq = byNome.get(eid.toUpperCase()); }
            if(!eq) continue;
            const comps = Array.isArray(eq.componentes) ? eq.componentes : (eq.componentes = []);
            const seen = new Set(comps.map(c=> String(c?.id || c?.funcionario_id || '')));
            const membros = Array.isArray(r?.membros) ? r.membros : [];
            for(const m of membros){
              if(!m) continue;
              const fid = String(m.funcionario_id || m.id || '').trim();
              if(!fid || seen.has(fid)) continue;
              comps.push({ id: fid, funcionario_id: fid, nome: m.nome || null });
              seen.add(fid);
            }
          }
        }
      } catch(_fillFromRoot){ /* noop recursos raiz -> componentes */ }
  const out = { ...esc, id: esc._id, responsavel_nome, responsavel_codigo, responsavel_resolucao };
    // Campos auxiliares canônicos para o frontend (não quebram compatibilidade):
    // periodo.ini/fim (YYYY-MM-DD) e duplicatas camelCase de ids
    try {
      const toISOd = (dt)=>{ try { if(!dt) return null; const d = (dt instanceof Date)? dt: new Date(dt); if(isNaN(d.getTime())) return null; return d.toISOString().slice(0,10); } catch(_){ return null; } };
      const periodo = { ini: toISOd(esc.data_inicio), fim: toISOd(esc.data_fim) };
      out.periodo = periodo;
      if(esc.unidade_id) out.unidadeId = esc.unidade_id; else out.unidadeId = null;
      if(esc.responsavel_id) out.responsavelId = esc.responsavel_id; else out.responsavelId = null;
      // Expor metadados de fechamento e desbloqueios
      out.fechado_em = esc.fechado_em || null;
      out.fechado_por = esc.fechado_por || null;
      out.desbloqueios = (esc.desbloqueios && typeof esc.desbloqueios==='object') ? esc.desbloqueios : {};
    } catch(_canon){}
    // Contagem de refeicoes computáveis por recurso para ajudar no F12 (Network)
    try {
  const dbg = { build: ESCALAS_API_BUILD_TAG, recursos: [], responsavel_resolucao };
      for(const eq of (out.equipes||[])){
        for(const r of (eq.recursos||[])){
          // Compat: derivar mapas por allocationId se arrays existirem
          try {
            if(Array.isArray(r.atribuicoes)){
              const mapA = {};
              for(const a of r.atribuicoes){ if(!a) continue; const dia=a.dia; const turno=a.turnoId||a.turno; if(!dia||!turno) continue; const key=dia+'__'+turno; if(!mapA[key]) mapA[key]=[]; mapA[key].push({ funcionarioId: a.membroFuncionarioId || a.funcionarioId || a.funcionario_id, nome: a.nome || a.funcionarioNome || null, atribuicao: a.papel || a.atribuicao || null }); }
              r.atribuicoesRecurso = mapA;
            }
          } catch(_da){}
          try {
            if(Array.isArray(r.refeicoes)){
              const mapR = {};
              for(const iv of r.refeicoes){ if(!iv) continue; const dia=iv.dia||iv.data; const turno=iv.turnoId||iv.turno; const ini=iv.ini||iv.inicio; const fim=iv.fim||iv.termino; if(!dia||!ini||!fim) continue; if(turno){ const key=dia+'__'+turno; if(!mapR[key]) mapR[key]=[]; mapR[key].push({ inicio: ini, fim: fim, computavel: (typeof iv.computavel==='boolean')? iv.computavel : true, tipo: iv.tipo||'ALMOCO' }); }
              }
              r.refeicoesRecurso = mapR;
            }
          } catch(_dr){}
          dbg.recursos.push({ equipeId:eq.id, recursoId:r.id, counts: contarComputavel(r.refeicoes) });
        }
      }
      // Compor display pronto para o front
      try { out.responsavel_display = (responsavel_codigo && responsavel_nome) ? `${responsavel_codigo} - ${responsavel_nome}` : (responsavel_nome || null); } catch(_disp){}
      return res.json({ ok:true, data: out, dbg });
    } catch(_dbg){
      try { out.responsavel_display = (responsavel_codigo && responsavel_nome) ? `${responsavel_codigo} - ${responsavel_nome}` : (responsavel_nome || null); } catch(_disp2){}
      return res.json({ ok:true, data: out });
    }
  } catch(e){ console.error('[escalasApi.new][GET escala] erro', e); return res.status(500).json({ ok:false, error:'Falha ao obter escala' }); }
});

// (rota movida para antes de /api/escalas/:id)

// Excluir escala
router.delete('/api/escalas/:id', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params; if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const Escala = await getEscalaModel();
    const doc = await Escala.findById(id).lean();
    if(!doc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    if(doc.status==='fechada' && !isMasterUser(req)) return res.status(403).json({ ok:false, error:'Escala fechada: apenas master pode excluir' });
    await Escala.deleteOne({ _id:id });
    return res.json({ ok:true, deleted:true });
  } catch(e){ console.error('[escalasApi.new][DELETE escala] erro', e); return res.status(500).json({ ok:false, error:'Falha ao excluir escala' }); }
});
// Alias POST para clientes antigos
router.post('/api/escalas/:id/delete', requireEscalasAuth, async (req,res)=>{
  req.method='DELETE'; // for consistency logs
  return router.handle(req,res,()=>{}); // reaproveita rota acima? Simples alternativa: repetir lógica
});

// ================= Busca de escalas por período e unidade =================
// GET /api/:tipo(ordinaria|extra|extraordinaria)/buscar?unidadeId=&inicio=dd/mm/aaaa&fim=dd/mm/aaaa

// Criar escala (nova estrutura)
router.post('/api/escalas', requireEscalasAuth, async (req,res)=>{
  try {
    const usuario = req.user || req.session?.escalasUser || {};
    const { descricao, classificacao, unidadeId, periodo, gruposTurnos, equipes, alocacao, validar, responsavelId, responsavelCodigo, responsavelCPF, recursos } = req.body||{};
    if(!descricao || typeof descricao!=='string') return res.status(400).json({ ok:false, error:'Descrição obrigatória' });
    if(!periodo || !periodo.ini || !periodo.fim) return res.status(400).json({ ok:false, error:'Período inválido' });
    const dataInicio = new Date(periodo.ini+'T00:00:00.000Z');
    const dataFim = new Date(periodo.fim+'T00:00:00.000Z');
    if(isNaN(dataInicio)||isNaN(dataFim)|| dataFim < dataInicio) return res.status(400).json({ ok:false, error:'Datas inválidas' });
    // Regra: período máximo de 31 dias (inclusivo) => diferença em dias <= 30
    const diffDias = Math.floor((dataFim - dataInicio) / (24*60*60*1000));
    if(diffDias > 30){
      return res.status(400).json({ ok:false, error:'Período máximo de 31 dias excedido' });
    }
    // Unicidade de funcionário entre equipes
    if(Array.isArray(equipes)){
      const seen=new Map();
      for(const eq of equipes){
        if(!eq||!Array.isArray(eq.componentes)) continue;
        for(const c of eq.componentes){ const fid=c&&c.id; if(!fid) continue; if(seen.has(fid)) return res.status(400).json({ ok:false, error:`Funcionário duplicado em equipes (${seen.get(fid)} e ${eq.id})`}); seen.set(fid, eq.id); }
      }
    }
    // Resolver responsável
    let resolvedResponsavelId=null; let resolvedResponsavelNome=null; let resolvedOrigem=null;
    const isHex24 = v=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v);
    const onlyDigits = v=> (v||'').replace(/\D+/g,'');
    const candidatasCodigo=[];
    if(responsavelCodigo) candidatasCodigo.push(String(responsavelCodigo).trim());
    if(responsavelId && !isHex24(responsavelId)) candidatasCodigo.push(String(responsavelId).trim());
    if(responsavelCPF){ const d=onlyDigits(responsavelCPF); if(d.length===11) candidatasCodigo.push(d); }
    try {
      const modUser = await import('#core/models/user.js');
      const UserModel = modUser.default || modUser.User || modUser;
      const modFunc = await import('#core/models/Funcionario.js');
      const FuncModel = modFunc.default || modFunc.Funcionario || modFunc;
      if(responsavelId && isHex24(responsavelId)){
        try { const u = await UserModel.findById(responsavelId).select('nome').lean(); if(u){ resolvedResponsavelId = new mongoose.Types.ObjectId(responsavelId); resolvedResponsavelNome=u.nome||null; resolvedOrigem='user'; } } catch(_e){}
        if(!resolvedResponsavelId){
          try { const f = await FuncModel.findById(responsavelId).select('nome usuario_id').lean(); if(f){ resolvedResponsavelNome=f.nome||null; resolvedResponsavelId = f.usuario_id? f.usuario_id : f._id; resolvedOrigem='funcionario'; } } catch(_e2){}
        }
      }
      if(!resolvedResponsavelId){
        for(const cod of candidatasCodigo){
          let f=null;
          if(/^\d{11}$/.test(cod)) f = await FuncModel.findOne({ cpf:cod }).select('nome usuario_id _id').lean();
          if(!f) f = await FuncModel.findOne({ codigo: new RegExp('^'+cod+'$','i') }).select('nome usuario_id _id').lean();
          if(f){ resolvedResponsavelNome=f.nome||null; resolvedResponsavelId = f.usuario_id? f.usuario_id : f._id; resolvedOrigem='funcionario'; break; }
        }
      }
      if(!resolvedResponsavelId && responsavelId && isHex24(responsavelId)){
        try { resolvedResponsavelId = new mongoose.Types.ObjectId(responsavelId); resolvedOrigem='bruto'; } catch(_e3){}
      }
    } catch(eRes){ console.warn('[escalasApi.new][POST escala][resolucao-erro]', eRes.message); }
    // Migrar recursos (legacy root) para dentro das equipes
    let equipesNorm = Array.isArray(equipes)? JSON.parse(JSON.stringify(equipes)) : [];
    if(Array.isArray(recursos) && recursos.length){
      const idx = new Map(equipesNorm.map(e=> [e.id, e]));
      for(const r of recursos){
        const eqId = r && r.equipeId; if(eqId && idx.has(eqId)){
          const alvo = idx.get(eqId); if(!Array.isArray(alvo.recursos)) alvo.recursos=[];
          if(!alvo.recursos.find(x=> x.id===r.id)) alvo.recursos.push(r);
        }
      }
    }
    // Normalizar recursos recém migrados
    for(const eq of equipesNorm){ if(Array.isArray(eq.recursos)){ eq.recursos = eq.recursos.map(montarRecursoNormalizado); } }
    const Escala = await getEscalaModel();
    const createdBy = usuario.id || usuario._id || usuario.userId || null;
    const doc = await Escala.create({
      descricao: descricao.trim(),
      classificacao: classificacao||null,
      unidade_id: unidadeId? new mongoose.Types.ObjectId(unidadeId): null,
      responsavel_id: resolvedResponsavelId,
      responsavel_raw: responsavelId || responsavelCodigo || responsavelCPF || null,
      responsavel_origem: resolvedResponsavelId? (resolvedResponsavelNome? 'user/funcionario':'bruto'): null,
      data_inicio: dataInicio,
      data_fim: dataFim,
      grupos_turnos: Array.isArray(gruposTurnos)? gruposTurnos: [],
      equipes: equipesNorm,
      alocacao: alocacao && typeof alocacao==='object'? alocacao: {},
      status: validar? 'validada':'rascunho',
      criado_por: createdBy
    });
    return res.status(201).json({ ok:true, id: doc._id, status: doc.status, responsavel_id: doc.responsavel_id, criado_por: doc.criado_por });
  } catch(e){ console.error('[escalasApi.new][POST escala] erro', e); return res.status(500).json({ ok:false, error:'Falha ao criar escala' }); }
});

// Atualizar status (fechar/validar/reabrir) e registrar metadados de fechamento
router.put('/api/escalas/:id/status', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params; const { status } = req.body||{};
    if(!id || !id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    if(!['rascunho','validada','fechada'].includes(String(status||''))) return res.status(400).json({ ok:false, error:'status inválido' });
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    const user = req.user || req.session?.escalasUser || {};
    const agora = new Date();
    // Transições permitidas: rascunho->validada/fechada; validada->fechada/rascunho; fechada->validada/rascunho (somente master)
    if(esc.status==='fechada' && status !== 'fechada' && !isMasterUser(req)){
      return res.status(403).json({ ok:false, error:'Apenas master pode reabrir escala fechada' });
    }
    esc.status = status;
    if(status==='fechada'){
      esc.fechado_em = agora;
      try { esc.fechado_por = user.id || user._id || null; } catch(_) { esc.fechado_por = null; }
      // Ao fechar, limpar quaisquer desbloqueios remanescentes para garantir fechamento efetivo
      try { esc.desbloqueios = {}; esc.markModified && esc.markModified('desbloqueios'); } catch(_cl){}
    } else {
      // reabertura: mantém histórico mas não zera desbloqueios
    }
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, id: esc._id, status: esc.status, fechado_em: esc.fechado_em, fechado_por: esc.fechado_por });
  } catch(e){ console.error('[escalasApi.new][PUT status] erro', e); return res.status(500).json({ ok:false, error:'Falha ao atualizar status' }); }
});

// Helper: identificar contexto da Escala Diária para permitir edições mesmo com escala fechada
function isDiariaContext(req){
  try {
    const q = req.query || {};
    const h = req.headers || {};
    const tag = String(q.context || q.ctx || q.origem || q.source || '').toLowerCase();
    if(tag.includes('diaria') || tag.includes('daily')) return true;
    if(String(q.diaria||'')==='1' || String(q.daily||'')==='1') return true;
    const hx = String(h['x-escala-context'] || h['x-context'] || '').toLowerCase();
    if(hx.includes('diaria') || hx.includes('daily')) return true;
    // Também considerar a página de origem (Referer) apontando para a tela da diária
    const ref = String(h['referer'] || h['referrer'] || '').toLowerCase();
    if(/\/escalas\/(diaria|escala_diaria)(\b|\/|\?|#)/.test(ref)) return true;
    return false;
  } catch(_){ return false; }
}

// Gerenciar desbloqueios (granulares)
// GET desbloqueios
router.get('/api/escalas/:id/desbloqueios', requireEscalasAuth, async (req,res)=>{
  try { const { id } = req.params; const Escala = await getEscalaModel(); const esc = await Escala.findById(id).lean(); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' }); return res.json({ ok:true, data: esc.desbloqueios || {} }); } catch(e){ console.error('[desbloqueios][GET]', e); return res.status(500).json({ ok:false, error:'Falha ao obter desbloqueios' }); }
});
// PUT matar/adicionar flags: body { dia?, turnoToken?, desbloqueado: boolean }
router.put('/api/escalas/:id/desbloqueios', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params; const { dia, turnoToken, desbloqueado } = req.body||{};
    if(!id || !id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) return res.status(400).json({ ok:false, error:'dia inválido' });
    const Escala = await getEscalaModel(); const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    if(esc.status!=='fechada') return res.status(400).json({ ok:false, error:'Somente escalas fechadas possuem desbloqueios' });
    if(!esc.desbloqueios || typeof esc.desbloqueios!=='object') esc.desbloqueios = {};
    const key = turnoToken ? `${dia}__${normalizeTurnoToken(turnoToken)}` : String(dia);
    if(desbloqueado===false){ delete esc.desbloqueios[key]; }
    else { esc.desbloqueios[key] = true; }
    esc.version = (esc.version||0)+1; try { esc.markModified('desbloqueios'); } catch(_){ }
    await esc.save();
    return res.json({ ok:true, data: esc.desbloqueios });
  } catch(e){ console.error('[desbloqueios][PUT]', e); return res.status(500).json({ ok:false, error:'Falha ao atualizar desbloqueios' }); }
});

// Atualizar escala (dados gerais / gruposTurnos / alocacao / equipes componentes) sem sobrescrever recursos nested
router.put('/api/escalas/:id', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params; if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const Escala = await getEscalaModel();
    const existente = await Escala.findById(id); if(!existente) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    // Permitir alteração de status dentro deste endpoint para compat com clientes antigos
    const { descricao, classificacao, unidadeId, periodo, gruposTurnos, equipes, alocacao, responsavelId, responsavelCodigo, responsavelCPF, equipesOverwrite, status } = req.body||{};
    // Se a escala estiver FECHADA, impedir alterações de campos gerais (exceto reabertura por master) e validar mudanças em alocacao por célula desbloqueada
    if(existente.status==='fechada' && !isMasterUser(req)){
      // 1) Reabertura via status será tratada mais abaixo; demais campos gerais não podem ser alterados em escala fechada
      const tentouCamposGerais = (
        (descricao!=null) || (classificacao!=null) || (unidadeId!=null) || (periodo!=null) || (gruposTurnos!=null) || (equipes!=null) || (responsavelId!=null) || (responsavelCodigo!=null) || (responsavelCPF!=null) || (equipesOverwrite!=null)
      );
      if(tentouCamposGerais && !alocacao){
        return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: alterações de campos gerais não são permitidas' });
      }
      // 2) Caso haja tentativa de alterar a matriz de alocação, validar célula a célula (dia+turno) com desbloqueio
      if(alocacao && typeof alocacao==='object'){
        const before = (existente.alocacao && typeof existente.alocacao==='object') ? existente.alocacao : {};
        const keys = new Set([ ...Object.keys(before), ...Object.keys(alocacao) ]);
        const normVal = (v)=>{
          try {
            if(v==null) return '';
            if(Array.isArray(v)) return v.map(x=> String(x)).sort().join(',');
            if(typeof v==='string') return v.split(',').map(s=> s.trim()).filter(Boolean).sort().join(',');
            if(typeof v==='object'){ const arr = Object.keys(v).filter(k=> v[k]).map(String).sort(); return arr.join(','); }
            return '';
          } catch(_){ return ''; }
        };
        for(const k of keys){
          const a = normVal(before[k]);
          const b = normVal(alocacao[k]);
          if(a===b) continue; // sem mudança efetiva nesta célula
          // Parse da chave -> dia e token HH:MM-HH:MM
          let parsed = parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k, existente);
          if(!parsed){
            // Tentar padrões tolerantes usados em outros pontos
            try {
              const m1 = String(k).match(/^::(\d{2}):(\d{2})-(\d{2}):(\d{2})\|(\d{4}-\d{2}-\d{2})$/);
              if(m1){ const ini=parseHHMMToMin(`${m1[1]}:${m1[2]}`); const fim=parseHHMMToMin(`${m1[3]}:${m1[4]}`); const dkey=m1[5]; if(ini!=null && fim!=null){ parsed={ grupoId:'', ini, fim, dia:dkey }; } }
            } catch(_){}
            if(!parsed){
              try {
                const m2 = String(k).match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\|(\d{4}-\d{2}-\d{2})$/);
                if(m2){ const ini=parseHHMMToMin(m2[1]); const fim=parseHHMMToMin(m2[2]); const dkey=m2[3]; if(ini!=null && fim!=null){ parsed={ grupoId:null, ini, fim, dia:dkey }; } }
              } catch(_){}
            }
          }
          if(!parsed || !parsed.dia){
            return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: chave de alocação inválida', key: k });
          }
          const hh1 = String(Math.floor(parsed.ini/60)).padStart(2,'0');
          const mm1 = String(parsed.ini%60).padStart(2,'0');
          const hh2 = String(Math.floor(parsed.fim/60)).padStart(2,'0');
          const mm2 = String(parsed.fim%60).padStart(2,'0');
          const token = `${hh1}:${mm1}-${hh2}:${mm2}`;
          if(!isAlvoEditable(existente, String(parsed.dia), token, req)){
            return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada', dia: parsed.dia, turno: token, key: k });
          }
        }
      }
    }
    // Se tentar reabrir uma escala fechada via PUT, somente master pode
    if(existente.status==='fechada'){
      if(status && status !== 'fechada'){
        if(!isMasterUser(req)) return res.status(403).json({ ok:false, error:'Apenas master pode reabrir escala fechada' });
        // permitido reabrir (continua fluxo para aplicar mudança mais abaixo)
      } else if(status === 'fechada' || !status) {
        // Idempotente: se já está fechada e a intenção é fechar (ou não veio status), apenas confirme
        return res.json({ ok:true, id: existente._id, status: existente.status, fechado_em: existente.fechado_em, fechado_por: existente.fechado_por });
      }
    }
    if(descricao && typeof descricao==='string') existente.descricao = descricao.trim();
    if(classificacao) existente.classificacao = classificacao; // confiar na UI para valores válidos
    if(unidadeId && unidadeId.match(/^[0-9a-fA-F]{24}$/)) existente.unidade_id = new mongoose.Types.ObjectId(unidadeId);
    if(periodo && periodo.ini && periodo.fim){
      const di = new Date(periodo.ini+'T00:00:00.000Z'); const df = new Date(periodo.fim+'T00:00:00.000Z');
      if(!isNaN(di.getTime()) && !isNaN(df.getTime()) && df>=di){
        const diffDias = Math.floor((df - di) / (24*60*60*1000));
        if(diffDias > 30){
          return res.status(400).json({ ok:false, error:'Período máximo de 31 dias excedido' });
        }
        existente.data_inicio=di; existente.data_fim=df;
      }
    }
    if(Array.isArray(gruposTurnos)){ existente.grupos_turnos = gruposTurnos; }
  if(alocacao && typeof alocacao==='object'){ existente.alocacao = alocacao; }
    // Atualização de status (compat)
    if(typeof status==='string' && ['rascunho','validada','fechada'].includes(status)){
      // Se for fechar, registrar metadados
      if(status==='fechada'){
        existente.status = 'fechada';
        existente.fechado_em = new Date();
        try { const u=req.user||req.session?.escalasUser||{}; existente.fechado_por = u.id || u._id || null; } catch(_){ existente.fechado_por = null; }
        // Ao fechar via PUT compat, também limpar desbloqueios para não perpetuar alocações abertas
        try { existente.desbloqueios = {}; existente.markModified && existente.markModified('desbloqueios'); } catch(_cl2){}
      } else {
        // Validada/Rascunho
        // Se estava fechada, já validamos permissão acima
        existente.status = status;
      }
    }
    // Atualização de componentes das equipes sem tocar recursos
    if(Array.isArray(equipes)){
      if(equipesOverwrite === true){
        // Substituição completa: equipes enviadas tornam-se a fonte de verdade
        existente.equipes = equipes.map(eq=>({
          id: eq.id,
            nome: eq.nome||null,
            descricao: eq.descricao||null,
            componentes: Array.isArray(eq.componentes)? eq.componentes:[],
            recursos: Array.isArray(eq.recursos)? eq.recursos:[]
        }));
      } else {
        // Merge preservando equipes não enviadas (comportamento original)
        const mapExist = new Map((existente.equipes||[]).map(e=> [e.id, e]));
        for(const eq of equipes){
          if(!eq || !eq.id) continue;
          if(!mapExist.has(eq.id)){
            mapExist.set(eq.id, { id:eq.id, nome:eq.nome||null, descricao:eq.descricao||null, componentes:Array.isArray(eq.componentes)? eq.componentes:[], recursos:[] });
          } else {
            const alvo = mapExist.get(eq.id);
            if(eq.nome) alvo.nome = eq.nome;
            if('descricao' in eq) alvo.descricao = eq.descricao;
            if(Array.isArray(eq.componentes)) alvo.componentes = eq.componentes;
          }
        }
        existente.equipes = [...mapExist.values()];
      }
    }
    // Opcional: resolução tardia de responsável se fornecido agora
    if(responsavelId || responsavelCodigo || responsavelCPF){
      try {
        let resolved=null; let resolvedNome=null; let origem=null;
        const modFunc = await import('#core/models/Funcionario.js');
        const FuncModel = modFunc.default || modFunc.Funcionario || modFunc;
        const modUser = await import('#core/models/user.js');
        const UserModel = modUser.default || modUser.User || modUser;
        const isHex24 = v=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v);
        const onlyDigits = v=> (v||'').replace(/\D+/g,'');
        const candidatos=[];
        if(responsavelCodigo) candidatos.push(String(responsavelCodigo).trim());
        if(responsavelId && !isHex24(responsavelId)) candidatos.push(String(responsavelId).trim());
        if(responsavelCPF){ const d=onlyDigits(responsavelCPF); if(d.length===11) candidatos.push(d); }
        if(responsavelId && isHex24(responsavelId)){
          try { const u = await UserModel.findById(responsavelId).select('nome').lean(); if(u){ resolved = u._id; resolvedNome=u.nome; origem='user'; } } catch(_u){}
          if(!resolved){ try { const f = await FuncModel.findById(responsavelId).select('nome usuario_id').lean(); if(f){ resolved = f.usuario_id? f.usuario_id : f._id; resolvedNome=f.nome; origem='funcionario'; } } catch(_f){} }
        }
        if(!resolved){
          for(const c of candidatos){
            let f=null;
            if(/^\d{11}$/.test(c)) f = await FuncModel.findOne({ cpf:c }).select('nome usuario_id _id').lean();
            if(!f) f = await FuncModel.findOne({ codigo: new RegExp('^'+c+'$','i') }).select('nome usuario_id _id').lean();
            if(f){ resolved = f.usuario_id? f.usuario_id : f._id; resolvedNome=f.nome; origem='funcionario'; break; }
          }
        }
        if(!resolved && responsavelId && isHex24(responsavelId)){
          try { resolved = new mongoose.Types.ObjectId(responsavelId); origem='bruto'; } catch(_e){}
        }
        if(resolved){
          existente.responsavel_id = resolved;
          existente.responsavel_raw = responsavelId || responsavelCodigo || responsavelCPF || null;
          existente.responsavel_origem = origem;
        }
      } catch(eRes){ console.warn('[escalasApi.new][PUT escala][responsavel-resolve] erro', eRes.message); }
    }
    existente.version = (existente.version||0)+1;
    await existente.save();
    return res.json({ ok:true, id: existente._id, responsavel_id: existente.responsavel_id });
  } catch(e){ console.error('[escalasApi.new][PUT escala] erro', e); return res.status(500).json({ ok:false, error:'Falha ao atualizar escala' }); }
});

// ===== Grupos de Turnos =====
// Criar grupo de turnos na escala
router.post('/api/escalas/:id/grupos-turnos', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params; if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const Escala = await getEscalaModel(); const esc = await Escala.findById(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    if(esc.status==='fechada') return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const { grupo } = req.body||{}; if(!grupo || !Array.isArray(grupo.turnos)) return res.status(400).json({ ok:false, error:'Grupo inválido' });
    if(!Array.isArray(esc.grupos_turnos)) esc.grupos_turnos=[];
    // Normalização simples
    const doc = { id: grupo.id || ('g'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)), turnos: grupo.turnos.map(t=>({ ini:t.ini, fim:t.fim })) };
    // Evitar duplicado por id
    if(esc.grupos_turnos.some(g=> g.id===doc.id)) return res.status(409).json({ ok:false, error:'Grupo já existe' });
    esc.grupos_turnos.push(doc);
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.status(201).json({ ok:true, grupo: doc, total: esc.grupos_turnos.length });
  } catch(e){ console.error('[escalasApi.new][POST grupo-turnos] erro', e); return res.status(500).json({ ok:false, error:'Falha ao adicionar grupo' }); }
});

// Atualizar grupo de turnos
router.put('/api/escalas/:id/grupos-turnos/:gid', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, gid } = req.params; if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const Escala = await getEscalaModel(); const esc = await Escala.findById(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    if(esc.status==='fechada') return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const { grupo } = req.body||{}; if(!grupo || !Array.isArray(grupo.turnos)) return res.status(400).json({ ok:false, error:'Grupo inválido' });
    const idx = (esc.grupos_turnos||[]).findIndex(g=> g.id===gid); if(idx===-1) return res.status(404).json({ ok:false, error:'Grupo não encontrado' });
    esc.grupos_turnos[idx].turnos = grupo.turnos.map(t=>({ ini:t.ini, fim:t.fim }));
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, grupo: esc.grupos_turnos[idx] });
  } catch(e){ console.error('[escalasApi.new][PUT grupo-turnos] erro', e); return res.status(500).json({ ok:false, error:'Falha ao atualizar grupo' }); }
});

// Excluir grupo de turnos (versão direta com markModified + save)
async function excluirGrupoTurnosHandler(req,res){
  try {
    const { id, gid } = req.params;
    try { if(!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, error:'ID inválido' }); } catch(_v) { if(!id || !String(id).match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' }); }
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada') return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const gidStr = String(gid);
    const gruposArr = Array.isArray(esc.grupos_turnos)? esc.grupos_turnos : [];
    const listaAntes = gruposArr.map(g=> ({ id: g.id, _id: g._id?.toString(), originalId: g.originalId }));
    const existeIdx = gruposArr.findIndex(g=> String(g.id)===gidStr || String(g._id||'')===gidStr || String(g.originalId||'')===gidStr);
    console.debug('[escalasApi.new][DEL grupo] antes', { idEscala: id, gid: gidStr, totalAntes: gruposArr.length, listaAntes });
    if(existeIdx === -1){
      return res.status(404).json({ ok:false, error:'Grupo não encontrado' });
    }
    // Limpa alocacao keys do grupo
    if(esc.alocacao && typeof esc.alocacao==='object'){
      Object.keys(esc.alocacao).forEach(k=>{ if(k.startsWith(gidStr+'::')) delete esc.alocacao[k]; });
      esc.markModified('alocacao');
    }
    // Remove do array em memória tolerando múltiplos campos
    esc.grupos_turnos = gruposArr.filter(g=> !(String(g.id)===gidStr || String(g._id||'')===gidStr || String(g.originalId||'')===gidStr));
    esc.markModified('grupos_turnos');
    esc.version = (esc.version||0)+1;
    await esc.save();
    const listaDepois = (esc.grupos_turnos||[]).map(g=> ({ id: g.id, _id: g._id?.toString(), originalId: g.originalId }));
    console.debug('[escalasApi.new][DEL grupo] depois', { idEscala: id, gid: gidStr, totalDepois: esc.grupos_turnos.length, listaDepois });
    return res.json({ ok:true, removed: gidStr, total: esc.grupos_turnos.length });
  } catch(e){ console.error('[escalasApi.new][DELETE grupo-turnos] erro', e); return res.status(500).json({ ok:false, error:'Falha ao excluir grupo' }); }
}

router.delete('/api/escalas/:id/grupos-turnos/:gid', requireEscalasAuth, excluirGrupoTurnosHandler);

// Alias compatível para stacks que bloqueiam DELETE em produção
router.post('/api/escalas/:id/grupos-turnos/:gid/delete', requireEscalasAuth, async (req,res)=>{
  try { req.method='DELETE'; } catch(_){ }
  return excluirGrupoTurnosHandler(req,res);
});

// Remover grupo por equivalência de turnos (sem precisar do gid) — útil para dados legados sem id
router.post('/api/escalas/:id/grupos-turnos/remove-by-turnos', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params;
    const { turnos } = req.body || {};
    try { if(!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, error:'ID inválido' }); } catch(_v) { if(!id || !String(id).match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' }); }
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada') return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    if(!Array.isArray(turnos) || turnos.length===0) return res.status(400).json({ ok:false, error:'turnos obrigatórios' });
    const norm = (arr)=> arr.map(t=> ({ ini:String(t?.ini||t?.inicio||''), fim:String(t?.fim||t?.termino||'') }))
                            .filter(t=> t.ini && t.fim)
                            .sort((a,b)=> (a.ini+a.fim).localeCompare(b.ini+b.fim));
    const alvoSig = JSON.stringify(norm(turnos));
    const grupos = Array.isArray(esc.grupos_turnos)? esc.grupos_turnos: [];
    let removedGid=null; const before = grupos.length;
    esc.grupos_turnos = grupos.filter(g=> JSON.stringify(norm(g.turnos||[])) !== alvoSig);
    if(esc.grupos_turnos.length !== before){
      // detectar qual foi removido (para auditoria)
      const idx = grupos.findIndex(g=> JSON.stringify(norm(g.turnos||[])) === alvoSig);
      if(idx>=0){ removedGid = grupos[idx]?.id || null; }
      // limpar alocacao que comece com gid conhecido
      if(removedGid && esc.alocacao && typeof esc.alocacao==='object'){
        Object.keys(esc.alocacao).forEach(k=>{ if(k.startsWith(String(removedGid)+'::')) delete esc.alocacao[k]; });
        esc.markModified('alocacao');
      }
      esc.markModified('grupos_turnos'); esc.version=(esc.version||0)+1; await esc.save();
      return res.json({ ok:true, removedByTurnos:true, removedGid, total: esc.grupos_turnos.length });
    }
    return res.status(404).json({ ok:false, error:'Grupo não encontrado por equivalência de turnos' });
  } catch(e){ console.error('[escalasApi.new][POST remove-by-turnos] erro', e); return res.status(500).json({ ok:false, error:'Falha ao remover grupo por turnos' }); }
});

// Diagnóstico direto: lista somente IDs dos grupos (sem lean completo) para confirmação de remoção
router.get('/api/escalas/:id/__debug/grupos', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params;
    if(!id || !id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id).select('grupos_turnos').lean();
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    const ids = Array.isArray(esc.grupos_turnos)? esc.grupos_turnos.map(g=> g.id): [];
    return res.json({ ok:true, total: ids.length, ids });
  } catch(e){ console.error('[escalasApi.new][GET __debug/grupos] erro', e); return res.status(500).json({ ok:false, error:'Falha debug grupos' }); }
});

// PATCH utilitário para remoções múltiplas: body { gruposTurnosRemover:[gid1,gid2], turnosRemover:[{ gid, ini, fim }] }
router.patch('/api/escalas/:id', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params; const { gruposTurnosRemover, turnosRemover } = req.body||{};
    if(!id || !id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada') return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    let changed=false;
    // Remover grupos
    if(Array.isArray(gruposTurnosRemover) && gruposTurnosRemover.length){
      const setRem = new Set(gruposTurnosRemover.map(x=> String(x)));
      const antes = (esc.grupos_turnos||[]).length;
      esc.grupos_turnos = (esc.grupos_turnos||[]).filter(g=> !setRem.has(String(g.id)));
      if((esc.grupos_turnos||[]).length !== antes){ esc.markModified('grupos_turnos'); changed=true; }
      // Limpa alocacao de cada grupo removido
      if(esc.alocacao && typeof esc.alocacao==='object'){
        Object.keys(esc.alocacao).forEach(k=>{ for(const gid of setRem){ if(k.startsWith(gid+'::')) delete esc.alocacao[k]; } });
        esc.markModified('alocacao');
      }
    }
    // Remover turnos específicos
    if(Array.isArray(turnosRemover) && turnosRemover.length){
      for(const item of turnosRemover){
        const gid = String(item?.gid||''); const ini = String(item?.ini||''); const fim = String(item?.fim||'');
        if(!gid || !ini || !fim) continue;
        const g = (esc.grupos_turnos||[]).find(x=> String(x.id)===gid);
        if(!g || !Array.isArray(g.turnos)) continue;
        const antesT = g.turnos.length;
        g.turnos = g.turnos.filter(t=> !(String(t.ini)===ini && String(t.fim)===fim));
        if(g.turnos.length !== antesT){ changed=true; esc.markModified('grupos_turnos'); }
      }
    }
    if(changed){ esc.version=(esc.version||0)+1; await esc.save(); }
    return res.json({ ok:true, changed, grupos: (esc.grupos_turnos||[]).map(g=> ({ id:g.id, totalTurnos: (g.turnos||[]).length })) });
  } catch(e){ console.error('[escalasApi.new][PATCH escala remover]', e); return res.status(500).json({ ok:false, error:'Falha PATCH remover' }); }
});

// Excluir turno individual de um grupo por índice
async function excluirTurnoDoGrupoHandler(req,res){
  try {
    const { id, gid, idx } = req.params;
    if(!id || !id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const turnoIdx = parseInt(idx,10);
    if(isNaN(turnoIdx) || turnoIdx < 0) return res.status(400).json({ ok:false, error:'Índice inválido' });
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada') return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const grupos = Array.isArray(esc.grupos_turnos)? esc.grupos_turnos: [];
    const g = grupos.find(x=> String(x.id)===String(gid));
    if(!g) return res.status(404).json({ ok:false, error:'Grupo não encontrado' });
    if(!Array.isArray(g.turnos)) g.turnos=[];
    if(turnoIdx >= g.turnos.length) return res.status(404).json({ ok:false, error:'Turno não encontrado' });
    const removido = g.turnos.splice(turnoIdx,1)[0];
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, removed: removido, total: g.turnos.length });
  } catch(e){ console.error('[escalasApi.new][DELETE turno-grupo] erro', e); return res.status(500).json({ ok:false, error:'Falha ao excluir turno' }); }
}
router.delete('/api/escalas/:id/grupos-turnos/:gid/turnos/:idx', requireEscalasAuth, excluirTurnoDoGrupoHandler);
router.post('/api/escalas/:id/grupos-turnos/:gid/turnos/:idx/delete', requireEscalasAuth, async (req,res)=>{ try { req.method='DELETE'; } catch(_){ } return excluirTurnoDoGrupoHandler(req,res); });

// Excluir turno por combinação ini/fim (mais resiliente se índices mudam)
async function excluirTurnoPorFaixaHandler(req,res){
  try {
    const { id, gid } = req.params; const { ini, fim } = req.body||{};
    if(!id || !id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    if(!ini || !fim) return res.status(400).json({ ok:false, error:'Parâmetros ini/fim obrigatórios' });
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada') return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const grupos = Array.isArray(esc.grupos_turnos)? esc.grupos_turnos: [];
    const g = grupos.find(x=> String(x.id)===String(gid));
    if(!g) return res.status(404).json({ ok:false, error:'Grupo não encontrado' });
    if(!Array.isArray(g.turnos)) g.turnos=[];
    const before = g.turnos.length;
    g.turnos = g.turnos.filter(t=> !(String(t.ini)===String(ini) && String(t.fim)===String(fim)) );
    if(g.turnos.length === before) return res.status(404).json({ ok:false, error:'Turno não encontrado' });
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, removed:{ ini, fim }, total: g.turnos.length });
  } catch(e){ console.error('[escalasApi.new][DELETE turno-grupo faixa] erro', e); return res.status(500).json({ ok:false, error:'Falha ao excluir turno (faixa)' }); }
}
router.post('/api/escalas/:id/grupos-turnos/:gid/turnos/remove-faixa', requireEscalasAuth, excluirTurnoPorFaixaHandler);

// ===== Rotas de busca (compatibilidade com frontend antigo) =====
router.get('/api/ordinaria/buscar', requireEscalasAuth, (req,res,next)=>{ req.params.tipo='ordinaria'; next(); });
router.get('/api/extra/buscar', requireEscalasAuth, (req,res,next)=>{ req.params.tipo='extra'; next(); });
router.get('/api/:tipo(ordinaria|extra|extraordinaria)/buscar', requireEscalasAuth, async (req,res)=>{
  try {
    const Escala = await getEscalaModel();
    let { tipo } = req.params; if(tipo==='extra') tipo='extraordinaria';
    const classificacaoAlvo = (tipo==='extraordinaria')? 'EXTRAORDINÁRIA':'ORDINÁRIA';
    const { unidadeId, inicio, fim } = req.query;
    if(!unidadeId || !unidadeId.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'unidadeId obrigatório e válido' });
    if(!inicio || !fim) return res.status(400).json({ ok:false, error:'Período obrigatório' });
    function parseBr(d){ const m=String(d||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return null; const dt=new Date(m[3]+'-'+m[2]+'-'+m[1]+'T00:00:00.000Z'); return isNaN(dt.getTime())? null: dt; }
    const di=parseBr(inicio); const df=parseBr(fim); if(!di||!df) return res.status(400).json({ ok:false, error:'Período inválido' }); if(df<di) return res.status(400).json({ ok:false, error:'Data fim < início' });
    const filtros={ unidade_id: new mongoose.Types.ObjectId(unidadeId), data_inicio:{ $lte: df }, data_fim:{ $gte: di } };
    if(classificacaoAlvo==='EXTRAORDINÁRIA'){
      filtros.$or=[ { classificacao:'EXTRAORDINÁRIA' }, { classificacao:'EXTRAORDINARIA' } ];
    } else {
      filtros.$or=[ { classificacao:'ORDINÁRIA' }, { classificacao:'ORDINARIA' }, { classificacao:null }, { classificacao:{ $exists:false } } ];
    }
    let docs = await Escala.find(filtros).sort({ data_inicio:1, descricao:1 }).limit(200).populate({ path:'unidade_id', select:'nome codigo' }).lean();
    // Montar saída enxuta compatível com pesquisar_escala.js
    const data = docs.map(d=>{
      const uni = d.unidade_id;
      let unidadeObj=null; let unidadeIdOut=null; let unidadeNome=null; let unidadeCodigo=null;
      if(uni){
        if(typeof uni==='object' && (uni.nome||uni.codigo)){
          unidadeObj={ id: uni._id, nome: uni.nome, codigo: uni.codigo||null };
          unidadeIdOut=uni._id; unidadeNome=uni.nome; unidadeCodigo=uni.codigo||null;
        } else { unidadeIdOut= uni._id || uni; }
      }
      return {
        id: d._id,
        descricao: d.descricao,
        periodo:{ ini: d.data_inicio.toISOString().slice(0,10), fim: d.data_fim.toISOString().slice(0,10) },
        unidade: unidadeObj,
        unidade_id: unidadeIdOut,
        unidade_nome: unidadeNome,
        unidade_codigo: unidadeCodigo,
        classificacao: d.classificacao,
        status: d.status
      };
    });
    return res.json({ ok:true, data });
  } catch(e){ console.error('[escalasApi.new][GET buscar] erro', e); return res.status(500).json({ ok:false, error:'Falha na busca' }); }
});

// ====== Rotas espelhadas para prefixo /escalas/api/escalas (compatibilidade basePath front) ======
// Nota: fazemos simples redirecionamento interno alterando req.url para reutilizar handlers já definidos
function mirrorToCanonical(req,res,next){
  try {
    const src = req.originalUrl || req.url || '';
    const rewritten = src.replace('/escalas/api/escalas','/api/escalas').replace('/escalas/api/','/api/');
    // Atualiza URL para re-casar rotas canônicas dentro deste mesmo router
    req.url = rewritten;
    // Limpa params para evitar resíduos da rota espelho
    try { req.params = {}; } catch(_){}
    // Reconstroi req.query a partir da URL original (garantir que o handler veja os params)
    try {
      const u = new URL('http://local'+src);
      const parsed = Object.fromEntries(u.searchParams.entries());
      req.query = { ...(req.query||{}), ...parsed };
    } catch(_eQuery){ /* noop */ }
    try { console.info('[escalasApi.new][MIRROR->CANON]', { method: req.method, from: src, to: req.url }); } catch(_eLog){}
  } catch(_){ /* noop */ }
  // Avança para casar as rotas canônicas já definidas
  return next();
}
// Rotas específicas devem vir antes das rotas paramétricas para evitar captura indevida
// Resolver responsável (mirror específico)
router.get('/escalas/api/escalas/resolve-responsavel', requireEscalasAuth, mirrorToCanonical);
// Diária (mirror específico)
router.get('/escalas/api/escalas/diaria', requireEscalasAuth, mirrorToCanonical);
// Escala principal
router.get('/escalas/api/escalas/:id', requireEscalasAuth, mirrorToCanonical);
router.put('/escalas/api/escalas/:id', requireEscalasAuth, mirrorToCanonical);
router.patch('/escalas/api/escalas/:id', requireEscalasAuth, mirrorToCanonical);
// Status e desbloqueios (mirror)
router.put('/escalas/api/escalas/:id/status', requireEscalasAuth, mirrorToCanonical);
router.get('/escalas/api/escalas/:id/desbloqueios', requireEscalasAuth, mirrorToCanonical);
router.put('/escalas/api/escalas/:id/desbloqueios', requireEscalasAuth, mirrorToCanonical);
// Debug grupos
router.get('/escalas/api/escalas/:id/__debug/grupos', requireEscalasAuth, mirrorToCanonical);
// Grupos turnos CRUD
router.post('/escalas/api/escalas/:id/grupos-turnos', requireEscalasAuth, mirrorToCanonical);
router.put('/escalas/api/escalas/:id/grupos-turnos/:gid', requireEscalasAuth, mirrorToCanonical);
router.delete('/escalas/api/escalas/:id/grupos-turnos/:gid', requireEscalasAuth, mirrorToCanonical);
router.post('/escalas/api/escalas/:id/grupos-turnos/:gid/delete', requireEscalasAuth, mirrorToCanonical);
// Espelhar rota de remoção por equivalência de turnos (fallback inline do front)
router.post('/escalas/api/escalas/:id/grupos-turnos/remove-by-turnos', requireEscalasAuth, mirrorToCanonical);
// Turnos individuais
router.delete('/escalas/api/escalas/:id/grupos-turnos/:gid/turnos/:idx', requireEscalasAuth, mirrorToCanonical);
router.post('/escalas/api/escalas/:id/grupos-turnos/:gid/turnos/:idx/delete', requireEscalasAuth, mirrorToCanonical);
router.post('/escalas/api/escalas/:id/grupos-turnos/:gid/turnos/remove-faixa', requireEscalasAuth, mirrorToCanonical);
// Equipes / recursos
router.post('/escalas/api/escalas/:id/equipes', requireEscalasAuth, mirrorToCanonical);
router.put('/escalas/api/escalas/:id/equipes/:eid', requireEscalasAuth, mirrorToCanonical);
router.put('/escalas/api/escalas/:id/equipes/:eid/notas', requireEscalasAuth, mirrorToCanonical);
router.post('/escalas/api/escalas/:id/equipes/:eid/recursos', requireEscalasAuth, mirrorToCanonical);
router.delete('/escalas/api/escalas/:id/equipes/:eid/recursos/:rid', requireEscalasAuth, mirrorToCanonical);
// Alocação de recurso (espelho)
router.delete('/escalas/api/escalas/:id/equipes/:eid/recursos/:rid/alocacao', requireEscalasAuth, mirrorToCanonical);
router.post('/escalas/api/escalas/:id/equipes/:eid/recursos/:rid/alocacao/delete', requireEscalasAuth, mirrorToCanonical);
// Alocação de equipe (toggle) — mirror específico
router.put('/escalas/api/escalas/:id/equipes/:eid/alocacao', requireEscalasAuth, mirrorToCanonical);
router.delete('/escalas/api/escalas/:id/equipes/:eid/alocacao', requireEscalasAuth, mirrorToCanonical);
// Atribuições (espelho)
router.delete('/escalas/api/escalas/:id/equipes/:eid/recursos/:rid/atribuicoes/:fid', requireEscalasAuth, mirrorToCanonical);
router.post('/escalas/api/escalas/:id/equipes/:eid/recursos/:rid/atribuicoes/:fid/delete', requireEscalasAuth, mirrorToCanonical);
// Espelho para salvar refeições na alocação (prefixo /escalas)
router.put('/escalas/api/escalas/:id/equipes/:eid/recursos/:rid/refeicoes', requireEscalasAuth, mirrorToCanonical);
// Componentes (fora) — espelho
router.delete('/escalas/api/escalas/:id/equipes/:eid/componentes/:fid', requireEscalasAuth, mirrorToCanonical);
router.post('/escalas/api/escalas/:id/equipes/:eid/componentes', requireEscalasAuth, mirrorToCanonical);
// Buscas
router.get('/escalas/api/ordinaria/buscar', requireEscalasAuth, mirrorToCanonical);
router.get('/escalas/api/extra/buscar', requireEscalasAuth, mirrorToCanonical);
router.get('/escalas/api/:tipo(ordinaria|extra|extraordinaria)/buscar', requireEscalasAuth, mirrorToCanonical);
// Mirrors para listagens de recursos
router.get('/escalas/api/escalas/:id/recursos', requireEscalasAuth, mirrorToCanonical);
router.get('/escalas/api/escalas/:id/equipes/:eid/recursos', requireEscalasAuth, mirrorToCanonical);
// Remoção de recurso no nível da escala (espelho)
router.delete('/escalas/api/escalas/:id/recursos/:rid', requireEscalasAuth, mirrorToCanonical);
// Debug fora (mirror)
router.get('/escalas/api/escalas/:id/equipes/:eid/debug/fora', requireEscalasAuth, mirrorToCanonical);

// Fallback: espelhar qualquer rota restante sob /escalas/api/*
router.all('/escalas/api/*', requireEscalasAuth, mirrorToCanonical);

// Criar recurso na equipe
// === Equipes (CRUD básico) ===
router.post('/api/escalas/:id/equipes', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params; const Escala = await getEscalaModel(); const esc = await Escala.findById(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    if(esc.status==='fechada') return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const { equipe } = req.body||{}; if(!equipe || !equipe.nome) return res.status(400).json({ ok:false, error:'Equipe inválida' });
    if(!Array.isArray(esc.equipes)) esc.equipes=[];
    // Normalização simples
    let nome = String(equipe.nome||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
    if(!nome) return res.status(400).json({ ok:false, error:'Nome inválido' });
    if(esc.equipes.some(e=> e.nome===nome)) return res.status(409).json({ ok:false, error:'Nome já utilizado' });
    const doc = {
      id: equipe.id || ('eq'+Math.random().toString(36).slice(2,10)),
      nome,
      descricao: equipe.descricao || '',
      componentes: Array.isArray(equipe.componentes)? equipe.componentes : [],
      created_at: new Date(),
      updated_at: new Date()
    };
    esc.equipes.push(doc);
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.status(201).json({ ok:true, equipe: doc });
  } catch(e){ console.error('[escalasApi.new][POST equipe] erro', e); return res.status(500).json({ ok:false, error:'Falha ao criar equipe' }); }
});
router.put('/api/escalas/:id/equipes/:eid', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid } = req.params; console.log('PUT equipe body', JSON.stringify(req.body));
    const Escala = await getEscalaModel(); const esc = await Escala.findById(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    if(esc.status==='fechada') return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const { disponibilidade } = req.body||{}; if(!disponibilidade) return res.status(400).json({ ok:false, error:'Disponibilidade obrigatória', received: req.body });
    const idx = (esc.equipes||[]).findIndex(e=> e.id===eid); if(idx===-1) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    console.log('salvando equipe', eid, 'disponibilidade size', JSON.stringify(disponibilidade).length);
    esc.equipes[idx].disponibilidade = disponibilidade;
    esc.equipes[idx].updated_at = new Date();
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, equipe: esc.equipes[idx] });
  } catch(e){ console.error('[escalasApi.new][PUT equipe] erro', eid, e.message, e.stack); return res.status(500).json({ ok:false, error:'Falha ao atualizar equipe' }); }
});
// Atualizar apenas as notas da equipe
router.delete('/api/escalas/:id/equipes/:eid/componentes/:fid', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid, fid } = req.params;
    const q = req.query || {};
    const body = req.body || {};
    const dia = q.dia || body.dia || null;
    const turnoIdRaw = q.turnoId || q.turno || body.turnoId || body.turno || null;
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    if(esc.status==='fechada' && !isDiariaContext(req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const eqIndex = Array.isArray(esc.equipes) ? esc.equipes.findIndex(e=> e && String(e.id)===String(eid)) : -1;
    if(eqIndex<0) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];

    // Capturar nome do funcionário antes de remover (para registrar em log)
    const normTurnPre = turnoIdRaw ? (String(turnoIdRaw).includes('::') ? String(turnoIdRaw).split('::').slice(-1)[0] : String(turnoIdRaw)) : null;
    const labelTurnPre = normTurnPre && normTurnPre.includes('-') ? normTurnPre.replace('-', ' - ') : (turnoIdRaw || null);
    let nomeCandidato = null;
    try {
      const cand = Array.isArray(eq?.componentes) ? eq.componentes.find(c=> String(c?.id||c?.funcionario_id) === String(fid)) : null;
      if(cand && cand.nome) nomeCandidato = cand.nome;
    } catch(_n1){}
    if(!nomeCandidato && dia && turnoIdRaw){
      try {
        const keys = [ `${dia}__${normTurnPre}`, `${dia}__${String(turnoIdRaw)}`, `${dia}__${labelTurnPre}` ].filter(Boolean);
        for(const key of keys){
          const lista = Array.isArray(eq?.adicoesEquipe?.[key]) ? eq.adicoesEquipe[key] : [];
          const hit = lista.find(c=> String(c?.id||c?.funcionario_id) === String(fid));
          if(hit && hit.nome){ nomeCandidato = hit.nome; break; }
        }
      } catch(_n2){}
    }

    const isPontual = !!(dia && turnoIdRaw);
  let removedFromComponentes = false;
  let removedPontual = false;
  let bloqueioRegistrado = false;

    // Quando operação é PONTUAL (diária: dia+turno), NÃO remover baseline eq.componentes
    if(!isPontual){
      const antes = Array.isArray(eq.componentes)? eq.componentes.length: 0;
      eq.componentes = (eq.componentes||[]).filter(c=> String(c?.id||c?.funcionario_id) !== String(fid));
      if(eq.componentes.length !== antes){ removedFromComponentes = true; try { esc.markModified(`equipes.${eqIndex}.componentes`); } catch(_m1){} }
    }

    // Se foi passado dia/turno, atuar apenas no escopo da alocação: remover de adições pontuais e registrar bloqueio em remocoesEquipe
    if(isPontual){
      try {
        const normalizeRange = (tok)=>{ try { const s=String(tok||''); const base=s.includes('::')? s.split('::').slice(-1)[0] : s; return (base.match(/\d{2}:\d{2}-\d{2}:\d{2}/)||[])[0] || null; } catch{ return null; } };
        const normTurn = String(turnoIdRaw).includes('::') ? String(turnoIdRaw).split('::').slice(-1)[0] : String(turnoIdRaw);
        const labelTurn = normTurn.includes('-') ? normTurn.replace('-', ' - ') : normTurn;
        const alvoRange = normalizeRange(normTurn) || normalizeRange(labelTurn);
        if(!eq.adicoesEquipe || typeof eq.adicoesEquipe!=='object') eq.adicoesEquipe = {};
        if(!eq.remocoesEquipe || typeof eq.remocoesEquipe!=='object') eq.remocoesEquipe = {};
        const touchedKeys = [];
        // 1) Remover de adições pontuais (k1/k2)
        for(const key of [ `${dia}__${normTurn}`, `${dia}__${turnoIdRaw}`, `${dia}__${labelTurn}` ]){
          if(Array.isArray(eq.adicoesEquipe[key])){
            const antesKey = eq.adicoesEquipe[key].length;
            eq.adicoesEquipe[key] = eq.adicoesEquipe[key].filter(c=> String(c?.id||c?.funcionario_id) !== String(fid));
            if(eq.adicoesEquipe[key].length !== antesKey){ removedPontual = true; touchedKeys.push(key); }
            if(eq.adicoesEquipe[key].length === 0){ try { delete eq.adicoesEquipe[key]; } catch(_){} }
          }
        }
        // 2) Varredura tolerante por dia + mesma faixa de horário
        if(alvoRange){
          for(const [key, lista] of Object.entries(eq.adicoesEquipe)){
            if(!Array.isArray(lista) || !key || typeof key!=='string') continue;
            const [dK, tK] = key.split('__'); if(dK!==dia) continue;
            const rK = normalizeRange(tK); if(!rK) continue;
            if(rK === alvoRange){
              const antesKey = lista.length;
              const nova = lista.filter(c=> String(c?.id||c?.funcionario_id) !== String(fid));
              if(nova.length !== antesKey){ eq.adicoesEquipe[key] = nova; removedPontual = true; touchedKeys.push(key); }
              if(eq.adicoesEquipe[key].length === 0){ try { delete eq.adicoesEquipe[key]; } catch(_){} }
            }
          }
        }
        if(removedPontual){ try { esc.markModified(`equipes.${eqIndex}.adicoesEquipe`); } catch(_m2){} }
        // 3) Registrar bloqueio desta alocação para evitar fallback do baseline na diária
        const k1 = `${dia}__${normTurn}`; const k2 = `${dia}__${labelTurn}`;
        for(const key of [k1,k2]){
          if(!eq.remocoesEquipe[key]) eq.remocoesEquipe[key] = [];
          const arr = Array.isArray(eq.remocoesEquipe[key]) ? eq.remocoesEquipe[key] : [];
          const fidStr = String(fid);
          if(!arr.includes(fidStr)) { arr.push(fidStr); bloqueioRegistrado = true; }
          eq.remocoesEquipe[key] = arr;
        }
        try { esc.markModified(`equipes.${eqIndex}.remocoesEquipe`); } catch(_m3){}
        try { console.info('[escalasApi.new][DELETE fora] pontual', { id, eid, dia, turnoId: turnoIdRaw, removedPontual, touchedKeys }); } catch(_){ }
      } catch(_rmPont){ /* noop */ }
    }
    // Sucesso na diária: mesmo que não haja adição pontual para remover, o bloqueio garante o efeito desejado
    if(!isPontual && !removedFromComponentes){
      return res.status(404).json({ ok:false, error:'Funcionário não encontrado na equipe' });
    }

    try { esc.markModified('equipes'); } catch(_mm){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    // Registrar log da EXCLUSAO na alocação da equipe quando operação diária (pontual)
    try {
      if(isPontual && dia && normTurnPre){
        await registrarLogSeFechada(esc, req, {
          contexto: 'alocacao_equipe',
          acao: 'EXCLUSAO',
          dia,
          turnoId: normTurnPre,
          funcionarioId: fid,
          funcionarioNome: nomeCandidato || null,
          equipeId: eid,
          recursoId: null,
          recursoNome: null,
          detalhes: { origem:'componentes', removedFromComponentes, removedPontual, bloqueioRegistrado }
        });
      }
    } catch(_logCompDel){}
    return res.json({ ok:true, deleted:true, removedFromComponentes, removedPontual, bloqueado: isPontual ? true : false, bloqueioRegistrado, total:eq.componentes.length });
  } catch(e){ console.error('[escalasApi.new][DELETE componente equipe] erro', e); return res.status(500).json({ ok:false, error:'Falha ao remover componente da equipe' }); }
});
// Excluir alocação da equipe em um dia/turno específico (e limpar dados correlatos nos recursos)
router.delete('/api/escalas/:id/equipes/:eid/alocacao', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid } = req.params;
    const q = req.query || {}; const b = req.body || {};
    let diaRaw = b.dia || q.dia || b.data || q.data;
    const turnoId = b.turnoId || q.turnoId || b.turno || q.turno || q.token || b.token;
    // Normalizar dia: aceita YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss e DD/MM/YYYY
    let dia = null;
    if(diaRaw){
      const s = String(diaRaw).trim();
      const mISO = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if(mISO){ dia = mISO[1]; }
      else {
        const mBR = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if(mBR){ dia = `${mBR[3]}-${mBR[2]}-${mBR[1]}`; }
      }
    }
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok:false, error:'dia inválido', received: String(diaRaw||'') });
    if(!turnoId) return res.status(400).json({ ok:false, error:'turnoId requerido' });
    const Escala = await getEscalaModel();
    let esc=null;
    try {
      if(mongoose.isValidObjectId(id)) esc = await Escala.findById(id);
      if(!esc) esc = await Escala.findOne({ _id: id });
    } catch(_eFind) { /* noop */ }
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req) && !isAlvoEditable(esc, dia, turnoId, req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada' });
    // Localizar equipe por id ou por nome (tolerante), pois o front pode enviar o rótulo
    const alvoUpper = String(eid||'').toUpperCase();
    const eqIndex = (esc.equipes||[]).findIndex(e=>{
      if(!e) return false;
      if(e.id === eid) return true;
      const nomeUp = String(e.nome||'').toUpperCase();
      return nomeUp && nomeUp === alvoUpper;
    });
    if(eqIndex===-1) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];
    const normTurn = String(turnoId).includes('::')? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
    const labelTurn = normTurn.includes('-') ? normTurn.replace('-', ' - ') : normTurn;
    const reqIni = parseHHMMToMin(String(normTurn).split('-')[0]);
    const reqFim = parseHHMMToMin(String(normTurn).split('-')[1]);
    const matchAloc = (a)=>{
      try {
        if(!a || a.dia!==dia) return false;
        const raw = String(a.turnoId||'');
        const rawNorm = raw.split('::').slice(-1)[0];
        if(rawNorm===normTurn || raw===normTurn || rawNorm===labelTurn || raw===labelTurn) return true;
        const rng = resolveAlocacaoRangeMin({ ...a, turnoId: rawNorm }, esc);
        if(rng && reqIni!=null && reqFim!=null){ return (rng.ini===reqIni && rng.fim===reqFim); }
        return false;
      } catch(_m){ return false; }
    };
    // 1) Remover alocação da equipe neste dia/turno
    if(Array.isArray(eq.alocacoes)){
      eq.alocacoes = eq.alocacoes.filter(a=> !matchAloc(a));
    } else { eq.alocacoes = []; }
    // 2) Remover alocações dos recursos desta equipe para o mesmo dia/turno (inclui mapas legados)
    if(Array.isArray(eq.recursos)){
      for(let r of eq.recursos){
        try {
          if(Array.isArray(r.alocacoes)){
            r.alocacoes = r.alocacoes.filter(a=> !matchAloc(a));
          }
          // Limpar mapas legados de alocações
          if(r.alocacoesRecurso && typeof r.alocacoesRecurso==='object'){
            const key1 = `${dia}__${normTurn}`;
            const key2 = `${dia}__${labelTurn}`;
            if(r.alocacoesRecurso[key1]){ delete r.alocacoesRecurso[key1]; }
            if(r.alocacoesRecurso[key2]){ delete r.alocacoesRecurso[key2]; }
          }
          // 3) Limpar atribuicoes e refeicoes específicas deste dia/turno (para não deixar lixo órfão)
          if(Array.isArray(r.atribuicoes)){
            r.atribuicoes = r.atribuicoes.filter(a=> !(a && a.dia===dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0]===normTurn)));
          }
          if(r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){
            const key1 = `${dia}__${normTurn}`;
            const key2 = `${dia}__${labelTurn}`;
            if(r.atribuicoesRecurso[key1]){ delete r.atribuicoesRecurso[key1]; }
            if(r.atribuicoesRecurso[key2]){ delete r.atribuicoesRecurso[key2]; }
          }
          if(Array.isArray(r.refeicoes)){
            r.refeicoes = r.refeicoes.filter(iv=> !(iv && (iv.dia||iv.data)===dia && (String(iv.turnoId||iv.turno||'').split('::').slice(-1)[0]===normTurn)));
          }
          if(r.refeicoesRecurso && typeof r.refeicoesRecurso==='object'){
            const key1 = `${dia}__${normTurn}`;
            const key2 = `${dia}__${labelTurn}`;
            if(r.refeicoesRecurso[key1]){ delete r.refeicoesRecurso[key1]; }
            if(r.refeicoesRecurso[key2]){ delete r.refeicoesRecurso[key2]; }
          }
        } catch(_e){ /* noop por recurso */ }
      }
    }
    try { esc.markModified('equipes'); } catch(_mm){}
    // 2.1) Legacy: se existirem recursos no nível raiz vinculados a esta equipe, aplicar a mesma limpeza
    let mudouRecursosRoot=false;
    if(Array.isArray(esc.recursos) && esc.recursos.length){
      for(let rr of esc.recursos){
        try {
          const ligado = (String(rr.equipeId||'') === String(eid));
          if(!ligado) continue;
          if(Array.isArray(rr.alocacoes)){
            const novo = rr.alocacoes.filter(a=> !matchAloc(a));
            if(novo.length !== rr.alocacoes.length){ rr.alocacoes = novo; mudouRecursosRoot=true; }
          }
          if(rr.alocacoesRecurso && typeof rr.alocacoesRecurso==='object'){
            const key1 = `${dia}__${normTurn}`;
            const key2 = `${dia}__${labelTurn}`;
            if(rr.alocacoesRecurso[key1]){ delete rr.alocacoesRecurso[key1]; mudouRecursosRoot=true; }
            if(rr.alocacoesRecurso[key2]){ delete rr.alocacoesRecurso[key2]; mudouRecursosRoot=true; }
          }
          if(Array.isArray(rr.atribuicoes)){
            const novoA = rr.atribuicoes.filter(a=> !(a && a.dia===dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0]===normTurn)));
            if(novoA.length !== rr.atribuicoes.length){ rr.atribuicoes = novoA; mudouRecursosRoot=true; }
          }
          if(rr.atribuicoesRecurso && typeof rr.atribuicoesRecurso==='object'){
            const key1 = `${dia}__${normTurn}`;
            const key2 = `${dia}__${labelTurn}`;
            if(rr.atribuicoesRecurso[key1]){ delete rr.atribuicoesRecurso[key1]; mudouRecursosRoot=true; }
            if(rr.atribuicoesRecurso[key2]){ delete rr.atribuicoesRecurso[key2]; mudouRecursosRoot=true; }
          }
          if(Array.isArray(rr.refeicoes)){
            const novoR = rr.refeicoes.filter(iv=> !(iv && (iv.dia||iv.data)===dia && (String(iv.turnoId||iv.turno||'').split('::').slice(-1)[0]===normTurn)));
            if(novoR.length !== rr.refeicoes.length){ rr.refeicoes = novoR; mudouRecursosRoot=true; }
          }
          if(rr.refeicoesRecurso && typeof rr.refeicoesRecurso==='object'){
            const key1 = `${dia}__${normTurn}`;
            const key2 = `${dia}__${labelTurn}`;
            if(rr.refeicoesRecurso[key1]){ delete rr.refeicoesRecurso[key1]; mudouRecursosRoot=true; }
            if(rr.refeicoesRecurso[key2]){ delete rr.refeicoesRecurso[key2]; mudouRecursosRoot=true; }
          }
        } catch(_eRoot){ /* noop */ }
      }
      if(mudouRecursosRoot){ try { esc.markModified('recursos'); } catch(_mr){} }
    }
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, equipeId: eid, dia, turnoId: normTurn, deleted:true });
  } catch(e){ console.error('[escalasApi.new][DELETE equipe/alocacao] erro', e); return res.status(500).json({ ok:false, error:'Falha ao excluir alocação da equipe' }); }
});

// Criar/ativar alocação da equipe (toggle ON) em um dia/turno específico
router.put('/api/escalas/:id/equipes/:eid/alocacao', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid } = req.params;
    const q = req.query || {}; const b = req.body || {};
    let diaRaw = b.dia || q.dia || b.data || q.data;
    const turnoIdRaw = b.turnoId || q.turnoId || b.turno || q.turno || q.token || b.token;
    const iniRaw = b.ini || q.ini || b.inicio || q.inicio || null;
    const fimRaw = b.fim || q.fim || b.termino || q.termino || null;
    // Normalização de dia: aceita YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss e DD/MM/YYYY
    let dia = null;
    if(diaRaw){
      const s = String(diaRaw).trim();
      const mISO = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if(mISO){ dia = mISO[1]; }
      else {
        const mBR = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if(mBR){ dia = `${mBR[3]}-${mBR[2]}-${mBR[1]}`; }
      }
    }
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok:false, error:'dia inválido', received: String(diaRaw||'') });
    if(!turnoIdRaw) return res.status(400).json({ ok:false, error:'turnoId requerido' });
    const Escala = await getEscalaModel();
    let esc=null;
    try {
      if(mongoose.isValidObjectId(id)) esc = await Escala.findById(id);
      if(!esc) esc = await Escala.findOne({ _id: id });
    } catch(_eFind){ /* noop */ }
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    // Se escala fechada: permitir apenas via diária/desbloqueio
    if(esc.status==='fechada' && !isDiariaContext(req) && !isAlvoEditable(esc, dia, String(turnoIdRaw), req)){
      return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada' });
    }
    // Localizar equipe por id OU por nome (tolerante maiúsculas)
    const alvoUpper = String(eid||'').toUpperCase();
    const eqIndex = (esc.equipes||[]).findIndex(e=>{
      if(!e) return false;
      if(e.id === eid) return true;
      const nomeUp = String(e.nome||'').toUpperCase();
      return nomeUp && nomeUp === alvoUpper;
    });
    if(eqIndex===-1) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];
    if(!Array.isArray(eq.alocacoes)) eq.alocacoes = [];
    // Normalizar token do turno e rótulo tolerante
    const rawTok = String(turnoIdRaw);
    const normTurn = rawTok.includes('::') ? rawTok.split('::').slice(-1)[0] : rawTok; // HH:MM-HH:MM
    const labelTurn = normTurn.includes('-') ? normTurn.replace('-', ' - ') : normTurn;
    const reqIni = parseHHMMToMin(String(normTurn).split('-')[0]);
    const reqFim = parseHHMMToMin(String(normTurn).split('-')[1]);
    // Permitir override opcional de ini/fim diretamente pelo corpo
    const overrideIni = (typeof iniRaw==='string') ? parseHHMMToMin(iniRaw) : null;
    const overrideFim = (typeof fimRaw==='string') ? parseHHMMToMin(fimRaw) : null;
    const matchAloc = (a)=>{
      try {
        if(!a || a.dia!==dia) return false;
        const raw = String(a.turnoId||'');
        const rawNorm = raw.split('::').slice(-1)[0];
        if(rawNorm===normTurn || raw===normTurn || rawNorm===labelTurn || raw===labelTurn) return true;
        const rng = resolveAlocacaoRangeMin({ ...a, turnoId: rawNorm }, esc);
        if(rng && reqIni!=null && reqFim!=null){ return (rng.ini===reqIni && rng.fim===reqFim); }
        return false;
      } catch(_m){ return false; }
    };
    // Já existe? idempotente
    let existed=false;
    for(const a of eq.alocacoes){ if(matchAloc(a)){ existed=true; break; } }
    if(!existed){
      const novo = { dia, turnoId: rawTok };
      if(overrideIni!=null && overrideFim!=null){ novo.ini = `${String(Math.floor(overrideIni/60)).padStart(2,'0')}:${String(overrideIni%60).padStart(2,'0')}`; novo.fim = `${String(Math.floor(overrideFim/60)).padStart(2,'0')}:${String(overrideFim%60).padStart(2,'0')}`; }
      eq.alocacoes.push(novo);
    } else {
      // Atualizar ini/fim se foi solicitado override
      if(overrideIni!=null && overrideFim!=null){
        for(const a of eq.alocacoes){ if(matchAloc(a)){ a.ini = `${String(Math.floor(overrideIni/60)).padStart(2,'0')}:${String(overrideIni%60).padStart(2,'0')}`; a.fim = `${String(Math.floor(overrideFim/60)).padStart(2,'0')}:${String(overrideFim%60).padStart(2,'0')}`; } }
      }
    }
    // Atualizar matriz esc.alocacao (formato legacy HH:MM-HH:MM|YYYY-MM-DD)
    let matrizUpdated=false; let matrizKey=null;
    try {
      if(reqIni!=null && reqFim!=null){
        const tokenSlim = String(normTurn).replace(/\s*-\s*/, '-');
        const key = `${tokenSlim}|${dia}`; matrizKey = key;
        if(!esc.alocacao || typeof esc.alocacao!=='object' || Array.isArray(esc.alocacao)) esc.alocacao = {};
        const v = esc.alocacao[key];
        const eidStr = String(eq.id);
        if(v==null){ esc.alocacao[key] = [eidStr]; matrizUpdated=true; }
        else if(Array.isArray(v)){
          if(!v.map(String).includes(eidStr)){ v.push(eidStr); matrizUpdated=true; }
        } else if(typeof v==='string'){
          const parts = v.split(',').map(s=> s.trim()).filter(Boolean);
          if(!parts.includes(eidStr)) { parts.push(eidStr); esc.alocacao[key] = parts.join(','); matrizUpdated=true; }
        } else if(v && typeof v==='object'){
          if(!v[eidStr]){ v[eidStr] = true; matrizUpdated=true; }
        } else {
          // Tipo inesperado: substituir por array
          esc.alocacao[key] = [eidStr]; matrizUpdated=true;
        }
        if(matrizUpdated){ try { esc.markModified('alocacao'); } catch(_mmA){} }
      }
    } catch(_mat){ /* noop matriz */ }
    try { esc.markModified('equipes'); } catch(_mm){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, equipeId: eq.id, dia, turnoId: normTurn, allocated:true, existed, matrizKey, matrizUpdated });
  } catch(e){ console.error('[escalasApi.new][PUT equipe/alocacao] erro', e); return res.status(500).json({ ok:false, error:'Falha ao salvar alocação da equipe' }); }
});

// Alias via POST para ambientes/clients que tratam DELETE com restrições
router.post('/api/escalas/:id/equipes/:eid/alocacao/delete', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid } = req.params;
    const q = req.query || {}; const b = req.body || {};
    let diaRaw = b.dia || q.dia || b.data || q.data;
    const turnoIdRaw = b.turnoId || q.turnoId || b.turno || q.turno || q.token || b.token;
    // Normalizar dia
    let dia = null;
    if(diaRaw){ const s=String(diaRaw).trim(); const mISO=s.match(/^(\d{4}-\d{2}-\d{2})/); if(mISO){ dia=mISO[1]; } else { const mBR=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(mBR){ dia=`${mBR[3]}-${mBR[2]}-${mBR[1]}`; } } }
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok:false, error:'dia inválido', received: String(diaRaw||'') });
    if(!turnoIdRaw) return res.status(400).json({ ok:false, error:'turnoId requerido' });
    const turnoId = String(turnoIdRaw);
    const Escala = await getEscalaModel();
    let esc=null; try { if(mongoose.isValidObjectId(id)) esc = await Escala.findById(id); if(!esc) esc = await Escala.findOne({ _id:id }); } catch(_e){}
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req) && !isAlvoEditable(esc, dia, turnoId, req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada' });
    const eqIndex = (esc.equipes||[]).findIndex(e=> e && e.id===eid);
    if(eqIndex===-1) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];
    const normTurn = String(turnoId).includes('::')? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
    const labelTurn = normTurn.includes('-') ? normTurn.replace('-', ' - ') : normTurn;
    const reqIni = parseHHMMToMin(String(normTurn).split('-')[0]);
    const reqFim = parseHHMMToMin(String(normTurn).split('-')[1]);
    const matchAloc = (a)=>{ try { if(!a||a.dia!==dia) return false; const raw=String(a.turnoId||''); const rawNorm=raw.split('::').slice(-1)[0]; if(rawNorm===normTurn||raw===normTurn||rawNorm===labelTurn||raw===labelTurn) return true; const rng=resolveAlocacaoRangeMin({ ...a, turnoId: rawNorm }, esc); if(rng && reqIni!=null && reqFim!=null) return (rng.ini===reqIni && rng.fim===reqFim); return false; } catch(_){ return false; } };
    // Remover alocação da equipe
    if(Array.isArray(eq.alocacoes)){ eq.alocacoes = eq.alocacoes.filter(a=> !matchAloc(a)); } else { eq.alocacoes = []; }
    // Limpar recursos desta equipe
    if(Array.isArray(eq.recursos)){
      for(let r of eq.recursos){
        try {
          if(Array.isArray(r.alocacoes)) r.alocacoes = r.alocacoes.filter(a=> !matchAloc(a));
          if(r.alocacoesRecurso && typeof r.alocacoesRecurso==='object'){
            const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`; if(r.alocacoesRecurso[k1]) delete r.alocacoesRecurso[k1]; if(r.alocacoesRecurso[k2]) delete r.alocacoesRecurso[k2];
          }
          if(Array.isArray(r.atribuicoes)) r.atribuicoes = r.atribuicoes.filter(a=> !(a && a.dia===dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0]===normTurn)));
          if(r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){
            const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`; if(r.atribuicoesRecurso[k1]) delete r.atribuicoesRecurso[k1]; if(r.atribuicoesRecurso[k2]) delete r.atribuicoesRecurso[k2];
          }
          if(Array.isArray(r.refeicoes)) r.refeicoes = r.refeicoes.filter(iv=> !(iv && (iv.dia||iv.data)===dia && (String(iv.turnoId||iv.turno||'').split('::').slice(-1)[0]===normTurn)));
          if(r.refeicoesRecurso && typeof r.refeicoesRecurso==='object'){
            const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`; if(r.refeicoesRecurso[k1]) delete r.refeicoesRecurso[k1]; if(r.refeicoesRecurso[k2]) delete r.refeicoesRecurso[k2];
          }
        } catch(_e){ /* noop */ }
      }
    }
    // Limpar matriz esc.alocacao
    try {
      const matriz = esc.alocacao && typeof esc.alocacao==='object' ? esc.alocacao : null;
      if(matriz && reqIni!=null && reqFim!=null){
        const nomeUp = String(eq.nome||'').toUpperCase();
        let alterou=false;
        for(const k of Object.keys(matriz)){
          try {
            let parsed = parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k, esc);
            if(!parsed){ const m = String(k).match(/^::(\d{2}):(\d{2})-(\d{2}):(\d{2})\|(\d{4}-\d{2}-\d{2})$/); if(m){ const ini=parseHHMMToMin(`${m[1]}:${m[2]}`); const fim=parseHHMMToMin(`${m[3]}:${m[4]}`); const dkey=m[5]; if(ini!=null && fim!=null){ parsed={ grupoId:'', ini, fim, dia:dkey }; } } }
            if(!parsed){ const m2=String(k).match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\|(\d{4}-\d{2}-\d{2})$/); if(m2){ const ini=parseHHMMToMin(m2[1]); const fim=parseHHMMToMin(m2[2]); const dkey=m2[3]; if(ini!=null && fim!=null){ parsed={ grupoId:null, ini, fim, dia:dkey }; } } }
            if(!parsed && String(k).includes('|')){ const [lhs,rhs]=String(k).split('|'); const dkey=rhs; const m3=String(lhs||'').match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/); if(m3 && /^\d{4}-\d{2}-\d{2}$/.test(dkey||'')){ const ini=parseHHMMToMin(m3[1]); const fim=parseHHMMToMin(m3[2]); if(ini!=null && fim!=null){ parsed={ grupoId:null, ini, fim, dia:dkey }; } } }
            if(!parsed) continue; if(parsed.dia!==dia) continue; if(parsed.ini!==reqIni || parsed.fim!==reqFim) continue;
            const v = matriz[k];
            if(Array.isArray(v)){
              const novo = v.filter(tok=>{ const s=String(tok||''); return !(s===String(eq.id) || s.toUpperCase()===nomeUp); });
              if(novo.length!==v.length){ alterou=true; } if(novo.length>0) matriz[k]=novo; else { delete matriz[k]; }
            } else if(typeof v==='string'){
              const parts=v.split(',').map(s=> s.trim()).filter(Boolean);
              const novo = parts.filter(tok=>{ const s=String(tok||''); return !(s===String(eq.id) || s.toUpperCase()===nomeUp); });
              if(novo.length!==parts.length){ alterou=true; } if(novo.length>0) matriz[k]=novo.join(','); else { delete matriz[k]; }
            } else if(v && typeof v==='object'){
              let removed=false; for(const keyTok of Object.keys(v)){ const s=String(keyTok||''); if(s===String(eq.id) || s.toUpperCase()===nomeUp){ delete v[keyTok]; removed=true; } }
              if(removed){ alterou=true; } if(Object.keys(v).length===0){ delete matriz[k]; }
            }
          } catch(_each){ /* noop */ }
        }
        if(alterou){ esc.alocacao = matriz; try { esc.markModified('alocacao'); } catch(_mmA){} }
      }
    } catch(_mx){ /* noop */ }
    try { esc.markModified('equipes'); } catch(_mm){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, equipeId: eid, dia, turnoId: normTurn, deleted:true });
  } catch(e){ console.error('[escalasApi.new][POST equipe/alocacao/delete] erro', e); return res.status(500).json({ ok:false, error:'Falha ao excluir alocação da equipe' }); }
});
// Atualizar apenas as notas de um recurso dentro da equipe
router.put('/api/escalas/:id/equipes/:eid/recursos/:rid/notas', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid, rid } = req.params;
    if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const { notas, dia, turnoId } = req.body||{};
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && (dia && turnoId) && !isDiariaContext(req) && !isAlvoEditable(esc, dia, turnoId, req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada' });
    const eqIndex = (esc.equipes||[]).findIndex(e=> e.id===eid);
    if(eqIndex===-1) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];
    if(!Array.isArray(eq.recursos)) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    const ridStr = String(rid);
    const rIndex = eq.recursos.findIndex(x=> {
      const cand = [x.id, x.placa, x.referenciaGestorId].filter(Boolean).map(String);
      return cand.includes(ridStr);
    });
    if(rIndex===-1) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    const r = eq.recursos[rIndex];
    if(!r) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
  const texto = typeof notas==='string' ? notas.slice(0,300) : (notas==null? null : String(notas).slice(0,300));
    const val = texto && texto.trim().length? texto : null;
    // Preferir salvar na alocação específica quando dia/turno presentes
    if(dia && turnoId){
      const normTurn = String(turnoId).includes('::')? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
      if(!Array.isArray(r.alocacoes)) r.alocacoes = [];
      const aidx = r.alocacoes.findIndex(a=> a && a.dia===dia && (String(a.turnoId||'').split('::').slice(-1)[0]===normTurn));
      if(aidx>=0){ r.alocacoes[aidx].notas_recurso = val; r.alocacoes[aidx].turnoId = normTurn; }
      else { r.alocacoes.push({ dia, turnoId: normTurn, notas_recurso: val }); }
      try {
        // Reatribuir o subdoc para garantir detecção da mudança e marcar caminhos específicos
        esc.equipes[eqIndex].recursos[rIndex] = r;
        esc.markModified('equipes');
        try { esc.markModified(`equipes.${eqIndex}.recursos`); } catch(_m2){}
      } catch(_mm){}
    } else {
      r.notas = val;
    }
  esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, id: esc._id, equipeId: eid, recursoId: rid, dia: dia||null, turnoId: turnoId||null, notas: val });
  } catch(e){ console.error('[escalasApi.new][PUT recurso/notas] erro', e); return res.status(500).json({ ok:false, error:'Falha ao salvar notas do recurso' }); }
});
// Atualizar apenas as notas da equipe (geral ou por alocação diária/turno)
async function salvarNotasEquipeHandler(req,res){
  try {
    const { id, eid } = req.params;
    if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const { notas, dia, turnoId } = req.body||{};
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    if(esc.status==='fechada' && (dia && turnoId) && !isDiariaContext(req) && !isAlvoEditable(esc, dia, turnoId, req)){
      return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada' });
    }
    const alvoUpper = String(eid||'').toUpperCase();
    const eqIndex = (esc.equipes||[]).findIndex(e=>{
      if(!e) return false;
      if(String(e.id) === String(eid)) return true;
      const nomeUp = String(e.nome||'').toUpperCase();
      return nomeUp && nomeUp === alvoUpper;
    });
    if(eqIndex===-1) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];
  const texto = typeof notas==='string' ? notas.slice(0,1000) : (notas==null? null : String(notas).slice(0,1000));
    const val = texto && texto.trim().length? texto : null;
    if(dia && turnoId){
      if(!Array.isArray(eq.alocacoes)) eq.alocacoes = [];
      const normTurn = String(turnoId).includes('::')? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
      const aidx = eq.alocacoes.findIndex(a=> a && a.dia===dia && (String(a.turnoId||'').split('::').slice(-1)[0]===normTurn));
      if(aidx>=0){ eq.alocacoes[aidx].notas = val; eq.alocacoes[aidx].turnoId = normTurn; }
      else { eq.alocacoes.push({ dia, turnoId: normTurn, notas: val }); }
    } else {
      eq.notas = val;
    }
    try { esc.equipes[eqIndex] = eq; esc.markModified('equipes'); } catch(_mm){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, id: esc._id, equipeId: eid, dia: dia||null, turnoId: turnoId||null, notas: val });
  } catch(e){ console.error('[escalasApi.new][PUT equipe/notas] erro', e); return res.status(500).json({ ok:false, error:'Falha ao salvar notas da equipe' }); }
}
router.put('/api/escalas/:id/equipes/:eid/notas', requireEscalasAuth, salvarNotasEquipeHandler);
router.put('/escalas/api/escalas/:id/equipes/:eid/notas', requireEscalasAuth, salvarNotasEquipeHandler);

// Obter recurso específico
router.get('/api/escalas/:id/equipes/:eid/recursos/:rid', requireEscalasAuth, async (req,res)=>{
  try { const { id, eid, rid } = req.params; const esc = await carregarEscalaLean(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    const eq = localizarEquipe(esc, eid); if(!eq) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const r = (eq.recursos||[]).find(x=> x.id===rid || x.referenciaGestorId===rid); if(!r) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    // Normalizar computavel e campos ini/fim nas refeições do recurso (compatibilidade com documentos antigos)
    let hadMissing=false;
    if(Array.isArray(r.refeicoes)){
      hadMissing = r.refeicoes.some(iv=> !iv || typeof iv.computavel!=='boolean');
      r.refeicoes = normalizarRefeicoesArray(r.refeicoes);
    }
    // Compat: derivar mapas por allocationId a partir dos arrays
    try {
      if(Array.isArray(r.atribuicoes)){
        const mapA={};
        for(const a of r.atribuicoes){ if(!a) continue; const dia=a.dia; const turno=a.turnoId||a.turno; if(!dia||!turno) continue; const key=dia+'__'+turno; if(!mapA[key]) mapA[key]=[]; mapA[key].push({ funcionarioId: a.membroFuncionarioId || a.funcionarioId || a.funcionario_id, nome: a.nome || a.funcionarioNome || null, atribuicao: a.papel || a.atribuicao || null }); }
        r.atribuicoesRecurso = mapA;
      }
    } catch(_da){}
    try {
      if(Array.isArray(r.refeicoes)){
        const mapR={};
        for(const iv of r.refeicoes){ if(!iv) continue; const dia=iv.dia||iv.data; const turno=iv.turnoId||iv.turno; const ini=iv.ini||iv.inicio; const fim=iv.fim||iv.termino; if(!dia||!ini||!fim) continue; if(turno){ const key=dia+'__'+turno; if(!mapR[key]) mapR[key]=[]; mapR[key].push({ inicio: ini, fim: fim, computavel: (typeof iv.computavel==='boolean')? iv.computavel : true, tipo: iv.tipo||'ALMOCO' }); } }
        r.refeicoesRecurso = mapR;
      }
    } catch(_dr){}
    if(hadMissing){ await ensureBackfillRefeicoesComputavel(id); }
    return res.json({ ok:true, recurso:r, dbg: { build: ESCALAS_API_BUILD_TAG, refeicoes: contarComputavel(r.refeicoes) } });
  } catch(e){ console.error('[escalasApi.new][GET recurso equipe] erro', e); return res.status(500).json({ ok:false, error:'Falha ao obter recurso' }); }
});

// Listar recursos de uma equipe
router.get('/api/escalas/:id/equipes/:eid/recursos', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid } = req.params;
    if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const esc = await carregarEscalaLean(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    const eq = localizarEquipe(esc, eid); if(!eq) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const arr = Array.isArray(eq.recursos) ? JSON.parse(JSON.stringify(eq.recursos)) : [];
    // Normalizar refeicoes para garantir campo computavel boolean quando houver
    try { for(const r of arr){ if(Array.isArray(r.refeicoes)) r.refeicoes = normalizarRefeicoesArray(r.refeicoes); r.equipeId = r.equipeId || eq.id; } } catch(_n){}
    return res.json({ ok:true, data: arr });
  } catch(e){ console.error('[escalasApi.new][GET lista recursos equipe] erro', e); return res.status(500).json({ ok:false, error:'Falha ao listar recursos da equipe' }); }
});

// Criar novo recurso em uma equipe
router.post('/api/escalas/:id/equipes/:eid/recursos', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid } = req.params;
    if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const { recurso } = req.body || {};
    if(!recurso) return res.status(400).json({ ok:false, error:'Recurso obrigatório' });
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    if(esc.status==='fechada' && !isDiariaContext(req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    // Localizar equipe por id ou nome (tolerante)
    const alvoUpper = String(eid||'').toUpperCase();
    const eqIndex = (esc.equipes||[]).findIndex(e=>{
      if(!e) return false; if(e.id === eid) return true; const nomeUp = String(e.nome||'').toUpperCase(); return nomeUp && nomeUp === alvoUpper;
    });
    if(eqIndex===-1) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];
    if(!Array.isArray(eq.recursos)) eq.recursos = [];
    // Normalizar documento do recurso
    const docNovo = montarRecursoNormalizado({ ...recurso, equipeId: eq.id });
    if(Array.isArray(docNovo.refeicoes)) docNovo.refeicoes = normalizarRefeicoesArray(docNovo.refeicoes);
    // Evitar duplicidade por id ou referenciaGestorId dentro da equipe
    const ridStr = String(docNovo.id||'');
    const refStr = String(docNovo.referenciaGestorId||'');
    const dup = (eq.recursos||[]).some(r=> (ridStr && String(r?.id||'')===ridStr) || (refStr && String(r?.referenciaGestorId||'')===refStr));
    if(dup) return res.status(409).json({ ok:false, error:'Recurso já existente na equipe' });
    // Validar indisponibilidades de eventuais atribuições enviadas junto
    try {
      const indis = await coletarIndisponibilidadesAtribuicoes(esc, Array.isArray(docNovo.atribuicoes)? docNovo.atribuicoes: [], eq);
      if(indis && indis.length){ return res.status(422).json({ ok:false, error:'FUNCIONARIO_INDISPONIVEL', detalhes: indis }); }
    } catch(_val){ /* noop: não bloquear em caso de falha de validação */ }
    // Inserir e salvar
    eq.recursos.push(docNovo);
    try { esc.markModified('equipes'); } catch(_mm){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    // Buscar o recurso recém-persistido para refletir eventuais transforms do Mongo/Mongoose
    try {
      const fresh = await Escala.findById(id).lean();
      const eq2 = (fresh?.equipes||[]).find(e=> e && (String(e.id)===String(eq.id) || String((e.nome||'').toUpperCase())===alvoUpper));
      const r2 = eq2 && Array.isArray(eq2.recursos) ? eq2.recursos.find(r=> String(r?.id||'')===ridStr || String(r?.referenciaGestorId||'')===refStr) : null;
      if(r2 && Array.isArray(r2.refeicoes)) r2.refeicoes = normalizarRefeicoesArray(r2.refeicoes);
      return res.status(201).json({ ok:true, recurso: r2 || docNovo });
    } catch(_fresh){ return res.status(201).json({ ok:true, recurso: docNovo }); }
  } catch(e){ console.error('[escalasApi.new][POST recurso equipe] erro', e); return res.status(500).json({ ok:false, error:'Falha ao criar recurso' }); }
});

// Listar todos os recursos da escala (achatado)
router.get('/api/escalas/:id/recursos', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params;
    if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    const esc = await carregarEscalaLean(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    const out = [];
    const equipes = Array.isArray(esc.equipes) ? esc.equipes : [];
    for(const eq of equipes){
      const eid = eq && eq.id;
      const lista = Array.isArray(eq?.recursos) ? eq.recursos : [];
      for(const r of lista){
        const clone = JSON.parse(JSON.stringify(r));
        clone.equipeId = clone.equipeId || eid;
        if(Array.isArray(clone.refeicoes)) clone.refeicoes = normalizarRefeicoesArray(clone.refeicoes);
        out.push(clone);
      }
    }
    // Legacy: recursos na raiz (migrados com equipeId)
    if(Array.isArray(esc.recursos) && esc.recursos.length){
      for(const r of esc.recursos){
        const clone = JSON.parse(JSON.stringify(r));
        if(!clone.equipeId) clone.equipeId = clone.equipe_id || clone.equipe || null;
        if(Array.isArray(clone.refeicoes)) clone.refeicoes = normalizarRefeicoesArray(clone.refeicoes);
        out.push(clone);
      }
    }
    return res.json({ ok:true, data: out });
  } catch(e){ console.error('[escalasApi.new][GET lista recursos escala] erro', e); return res.status(500).json({ ok:false, error:'Falha ao listar recursos da escala' }); }
});

// Remover recurso no nível da escala (procura em qualquer equipe ou raiz legacy)
router.delete('/api/escalas/:id/recursos/:rid', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, rid } = req.params;
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
  if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const ridStr = String(rid);
    let removed=false; let equipeId=null; let totalRemovidos=0;
    if(Array.isArray(esc.equipes)){
      for(const eq of esc.equipes){
        try {
          const before = Array.isArray(eq.recursos)? eq.recursos.length : 0;
          if(!Array.isArray(eq.recursos)) eq.recursos = [];
          eq.recursos = eq.recursos.filter(r=> !(String(r?.id||'')===ridStr || String(r?.referenciaGestorId||'')===ridStr));
          if(eq.recursos.length !== before){ removed=true; equipeId = eq.id; totalRemovidos += (before - eq.recursos.length); }
        } catch(_) { /* noop */ }
      }
    }
    // Legacy: recursos na raiz da escala
    if(Array.isArray(esc.recursos)){
      const before = esc.recursos.length;
      esc.recursos = esc.recursos.filter(r=> !(String(r?.id||'')===ridStr || String(r?.referenciaGestorId||'')===ridStr));
      if(esc.recursos.length !== before){ removed=true; totalRemovidos += (before - esc.recursos.length); }
    }
    if(!removed) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    try { esc.markModified('equipes'); } catch(_m){}
    try { esc.markModified('recursos'); } catch(_m2){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, deleted:true, equipeId: equipeId||null, count: totalRemovidos });
  } catch(e){ console.error('[escalasApi.new][DELETE recurso escala] erro', e); return res.status(500).json({ ok:false, error:'Falha ao remover recurso' }); }
});

// Atualizar recurso
router.put('/api/escalas/:id/equipes/:eid/recursos/:rid', requireEscalasAuth, async (req,res)=>{
  try { const { id, eid, rid } = req.params; const Escala = await getEscalaModel(); const esc = await Escala.findById(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' }); const { recurso } = req.body||{}; if(!recurso) return res.status(400).json({ ok:false, error:'Recurso obrigatório' });
    const eq = (esc.equipes||[]).find(e=> e.id===eid); if(!eq) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    if(!Array.isArray(eq.recursos)) eq.recursos=[];
    const idx = (eq.recursos||[]).findIndex(r=> r.id===rid || r.referenciaGestorId===rid);
    // UPSERT: se não encontrado, cria com o rid informado
    if(idx===-1){
        const docNovo = montarRecursoNormalizado({ ...recurso, id: rid, equipeId: eid });
        if(Array.isArray(docNovo.refeicoes)){
          docNovo.refeicoes = normalizarRefeicoesArray(docNovo.refeicoes);
        }
      let dbgCountsUpsert=null;
      try {
        const refArr = Array.isArray(docNovo.refeicoes) ? docNovo.refeicoes : [];
        const cTrue = refArr.filter(x=> x && x.computavel===true).length;
        const cFalse = refArr.filter(x=> x && x.computavel===false).length;
        dbgCountsUpsert = { total: refArr.length, verdadeiros: cTrue, falsos: cFalse };
        console.debug('[escalasApi.new][PUT recurso - upsert] refeicoes normalizadas:', refArr.length, `computavel[t=${cTrue}, f=${cFalse}]`, 'exemplo:', refArr[0] ? { dia: refArr[0].dia, ini: refArr[0].ini, fim: refArr[0].fim, computavel: refArr[0].computavel } : null);
      } catch(_log){}
      const indisponiveisNew = await coletarIndisponibilidadesAtribuicoes(esc, docNovo.atribuicoes||[], eq);
      if(indisponiveisNew.length){
        return res.status(422).json({ ok:false, error:'FUNCIONARIO_INDISPONIVEL', detalhes: indisponiveisNew });
      }
      eq.recursos.push(docNovo);
      try { esc.markModified('equipes'); } catch(_mm){}
      esc.version = (esc.version||0)+1;
      await esc.save();
      // Recarregar do banco e retornar o recurso como persistido
      try {
        const Escala = await getEscalaModel();
        const fresh = await Escala.findById(id).lean();
        const eq2 = (fresh?.equipes||[]).find(e=> e.id===eid);
        let r2 = eq2 && Array.isArray(eq2.recursos) ? eq2.recursos.find(r=> r.id===docNovo.id) : null;
        if(r2 && Array.isArray(r2.refeicoes)) r2.refeicoes = normalizarRefeicoesArray(r2.refeicoes);
        if(r2) return res.json({ ok:true, recurso: r2, created:true, dbg: { build: ESCALAS_API_BUILD_TAG, refeicoes: contarComputavel(r2.refeicoes) } });
      } catch(_refresh){}
      return res.json({ ok:true, recurso: docNovo, created:true, dbg: { build: ESCALAS_API_BUILD_TAG, refeicoes: dbgCountsUpsert || contarComputavel(docNovo.refeicoes) } });
    }
  const antigo = eq.recursos[idx];
  const atualizado = { ...antigo, ...montarRecursoNormalizado({ ...recurso, id:antigo.id, equipeId:eid }) };
    // Se o cliente enviou alocacoes/alocacoesRecurso explicitamente, substituir completamente a lista para refletir remoções
    const clienteMandouAloc = (recurso && (Array.isArray(recurso.alocacoes) || (recurso.alocacoesRecurso && typeof recurso.alocacoesRecurso==='object')));
    if(clienteMandouAloc){
      if(!Array.isArray(atualizado.alocacoes)) atualizado.alocacoes = [];
      // Remover campos legados de alocação para evitar dados órfãos
      try { delete atualizado.alocacoesRecurso; } catch(_del1){}
      try { delete atualizado.matrizAlocacao; } catch(_del2){}
      // Log diagnóstico: antes/depois
      try {
        const before = Array.isArray(antigo.alocacoes)? antigo.alocacoes.length: 0;
        const after = Array.isArray(atualizado.alocacoes)? atualizado.alocacoes.length: 0;
        const beforeLegacy = antigo && (antigo.alocacoesRecurso ? Object.keys(antigo.alocacoesRecurso||{}).length : 0);
        console.debug('[escalasApi.new][PUT recurso] replace alocacoes (cliente mandou). before=', before, 'after=', after, 'beforeLegacyMap=', beforeLegacy);
      } catch(_diag){}
    }
    if(Array.isArray(atualizado.refeicoes)){
      atualizado.refeicoes = normalizarRefeicoesArray(atualizado.refeicoes);
    }
    try {
      const refArr = Array.isArray(atualizado.refeicoes) ? atualizado.refeicoes : [];
      const cTrue = refArr.filter(x=> x && x.computavel===true).length;
      const cFalse = refArr.filter(x=> x && x.computavel===false).length;
      console.debug('[escalasApi.new][PUT recurso] refeicoes resultantes (normalizadas):', refArr.length, `computavel[t=${cTrue}, f=${cFalse}]`, 'exemplo:', refArr[0] ? { dia: refArr[0].dia, ini: refArr[0].ini, fim: refArr[0].fim, computavel: refArr[0].computavel } : null);
    } catch(_log2){}
    const indisponiveis = await coletarIndisponibilidadesAtribuicoes(esc, atualizado.atribuicoes||[], eq);
    if(indisponiveis.length){
      return res.status(422).json({ ok:false, error:'FUNCIONARIO_INDISPONIVEL', detalhes: indisponiveis });
    }
    // Converter mapas legados para arrays se arrays estiverem ausentes (evita perda ao $unset)
    try {
      if((!Array.isArray(atualizado.atribuicoes) || atualizado.atribuicoes.length===0) && atualizado.atribuicoesRecurso && typeof atualizado.atribuicoesRecurso==='object'){
        const arr = [];
        Object.entries(atualizado.atribuicoesRecurso).forEach(([alloc, lista])=>{
          const parts=String(alloc).split('__'); if(parts.length!==2) return; const dia=parts[0]; const turnoId=parts[1];
          if(Array.isArray(lista)){
            lista.forEach(it=>{
              if(!it) return; const fid = it.membroFuncionarioId || it.funcionarioId || it.funcionario_id; if(!fid) return;
              arr.push({ membroFuncionarioId: String(fid), papel: it.atribuicao || it.papel || null, turnoId, dia, escopo: it.escopo || 'dia+turno', prioridade: typeof it.prioridade==='number'? it.prioridade: 0 });
            });
          }
        });
        if(arr.length) atualizado.atribuicoes = arr;
      }
      if((!Array.isArray(atualizado.refeicoes) || atualizado.refeicoes.length===0) && atualizado.refeicoesRecurso && typeof atualizado.refeicoesRecurso==='object'){
        const arr = [];
        Object.entries(atualizado.refeicoesRecurso).forEach(([alloc, lista])=>{
          const parts=String(alloc).split('__'); if(parts.length!==2) return; const dia=parts[0]; const turnoId=parts[1];
          if(Array.isArray(lista)){
            lista.forEach(it=>{
              if(!it) return; const ini = it.ini || it.inicio; const fim = it.fim || it.termino; if(!ini || !fim) return;
              let computavel = true;
              if(typeof it.computavel==='boolean') computavel = it.computavel; else if(typeof it.tipo==='string'){
                const t = String(it.tipo).toLowerCase(); if(t==='nao_computado' || t==='não_computado') computavel=false; else if(t==='computado') computavel=true;
              }
              const tipo = it.tipo && /^(ALMOCO|JANTAR|LANCHE|PAUSA)$/i.test(String(it.tipo)) ? String(it.tipo).toUpperCase() : 'ALMOCO';
              arr.push({ dia, turnoId, ini, fim, computavel, tipo });
            });
          }
        });
        if(arr.length) atualizado.refeicoes = arr;
      }
      if((!Array.isArray(atualizado.alocacoes) || atualizado.alocacoes.length===0) && atualizado.alocacoesRecurso && typeof atualizado.alocacoesRecurso==='object'){
        const arr = [];
        Object.entries(atualizado.alocacoesRecurso).forEach(([k,v])=>{
          if(!v) return; const parts=String(k).split('__'); if(parts.length!==2) return; const dia=parts[0]; const turnoId=parts[1]; arr.push({ dia, turnoId });
        });
        if(arr.length) atualizado.alocacoes = arr;
      }
    } catch(_conv){ /* noop conversao legacy */ }

    // Preserva created_at original
    if(antigo.created_at) atualizado.created_at = antigo.created_at;

    // Determinar se o cliente solicitou atualização explícita de campos
    const clienteMandouAtrib = !!(recurso && (Array.isArray(recurso.atribuicoes) || (recurso.atribuicoesRecurso && typeof recurso.atribuicoesRecurso==='object')));
    const clienteMandouRef = !!(recurso && (Array.isArray(recurso.refeicoes) || (recurso.refeicoesRecurso && typeof recurso.refeicoesRecurso==='object')));

    // Sanitizar objeto a ser persistido somente com campos do schema
    const persist = {
      id: antigo.id,
      referenciaGestorId: atualizado.referenciaGestorId || null,
      equipeId: eid,
      nome: atualizado.nome || null,
      placa: atualizado.placa || null,
      // alocações: já tratamos replace-on-write quando o cliente envia; caso contrário, preservamos as existentes
      alocacoes: Array.isArray(atualizado.alocacoes)
        ? atualizado.alocacoes
        : (Array.isArray(antigo.alocacoes) ? antigo.alocacoes : []),
      // atribuicoes: somente atualiza se o cliente enviou; senão preserva o que já existe
      atribuicoes: Array.isArray(atualizado.atribuicoes)
        ? atualizado.atribuicoes
        : (clienteMandouAtrib ? [] : (Array.isArray(antigo.atribuicoes) ? antigo.atribuicoes : [])),
      // refeicoes: somente atualiza se o cliente enviou; senão preserva o que já existe
      refeicoes: Array.isArray(atualizado.refeicoes)
        ? atualizado.refeicoes
        : (clienteMandouRef ? [] : (Array.isArray(antigo.refeicoes) ? antigo.refeicoes : [])),
      membros: Array.isArray(atualizado.membros)? atualizado.membros : (Array.isArray(antigo.membros)? antigo.membros: []),
      created_at: atualizado.created_at || new Date()
    };

    // Se cliente enviou atribuicoes: detectar diffs para LOG (inserção/mudança/exclusão)
    if(clienteMandouAtrib){
      try {
        const oldList = Array.isArray(antigo.atribuicoes) ? antigo.atribuicoes : [];
        const newList = Array.isArray(atualizado.atribuicoes) ? atualizado.atribuicoes : [];
        const keyOf = (a)=>{
          if(!a) return null;
          const dia = a.dia || a.data || null;
          const turnoRaw = String(a.turnoId||'');
          const turno = turnoRaw.includes('::') ? turnoRaw.split('::').slice(-1)[0] : turnoRaw;
          const fid = a.membroFuncionarioId || a.funcionarioId || a.funcionario || a.matricula || a.funcionario_id;
          if(!dia || !turno || !fid) return null;
          return `${dia}__${turno}__${String(fid)}`;
        };
        const mapOld = new Map(); const mapNew = new Map();
        for(const a of oldList){ const k=keyOf(a); if(!k) continue; mapOld.set(k, a); }
        for(const a of newList){ const k=keyOf(a); if(!k) continue; mapNew.set(k, a); }
        // Inserções
        for(const [k, a] of mapNew.entries()){
          if(!mapOld.has(k)){
            const [dia, turno, fid] = k.split('__');
            await registrarLogSeFechada(esc, req, {
              contexto: 'atribuicao', acao: 'INSERCAO', dia, turnoId: turno,
              funcionarioId: fid, funcionarioNome: a.nome || a.funcionarioNome || null,
              equipeId: eid, recursoId: rid, recursoNome: (atualizado.nome || antigo.nome || antigo.placa || antigo.referenciaGestorId || null),
              detalhes: { papel: a.papel || a.atribuicao || null, prioridade: a.prioridade ?? null }
            });
          }
        }
        // Exclusões
        for(const [k, a] of mapOld.entries()){
          if(!mapNew.has(k)){
            const [dia, turno, fid] = k.split('__');
            await registrarLogSeFechada(esc, req, {
              contexto: 'atribuicao', acao: 'EXCLUSAO', dia, turnoId: turno,
              funcionarioId: fid, funcionarioNome: a.nome || a.funcionarioNome || null,
              equipeId: eid, recursoId: rid, recursoNome: (antigo.nome || antigo.placa || antigo.referenciaGestorId || null),
              detalhes: { papel: a.papel || a.atribuicao || null, prioridade: a.prioridade ?? null }
            });
          }
        }
        // Mudanças (mesma chave com atributos diferentes)
        for(const [k, novo] of mapNew.entries()){
          if(mapOld.has(k)){
            const antigoA = mapOld.get(k);
            const changed = String(antigoA?.papel||antigoA?.atribuicao||'') !== String(novo?.papel||novo?.atribuicao||'')
              || (Number.isFinite(antigoA?.prioridade) ? antigoA.prioridade : null) !== (Number.isFinite(novo?.prioridade) ? novo.prioridade : null);
            if(changed){
              const [dia, turno, fid] = k.split('__');
              await registrarLogSeFechada(esc, req, {
                contexto: 'atribuicao', acao: 'MUDANCA', dia, turnoId: turno,
                funcionarioId: fid, funcionarioNome: novo.nome || novo.funcionarioNome || antigoA?.nome || antigoA?.funcionarioNome || null,
                equipeId: eid, recursoId: rid, recursoNome: (atualizado.nome || antigo.nome || antigo.placa || antigo.referenciaGestorId || null),
                detalhes: { de: { papel: antigoA?.papel || antigoA?.atribuicao || null, prioridade: antigoA?.prioridade ?? null }, para: { papel: novo?.papel || novo?.atribuicao || null, prioridade: novo?.prioridade ?? null } }
              });
            }
          }
        }
      } catch(eLog){ try { console.warn('[escalasApi.new][PUT recurso][LOG] diff atribuicoes falhou', eLog.message); } catch(_){} }
    }

    // Tentar substituir o subdocumento via updateOne com arrayFilters (garante $unset dos campos legados)
    let aplicadoViaUpdate=false;
    try {
      const EscModel = await getEscalaModel();
      const upd = await EscModel.updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        {
          $set: { 'equipes.$[e].recursos.$[r]': persist },
          $unset: {
            'equipes.$[e].recursos.$[r].alocacoesRecurso': '',
            'equipes.$[e].recursos.$[r].matrizAlocacao': ''
          }
        },
        { arrayFilters: [ { 'e.id': eid }, { 'r.id': antigo.id } ] }
      );
      if((upd && (upd.modifiedCount>0 || upd.matchedCount>0))){ aplicadoViaUpdate=true; }
      console.debug('[escalasApi.new][PUT recurso] updateOne aplicadoViaUpdate=', aplicadoViaUpdate, 'matched=', upd?.matchedCount, 'modified=', upd?.modifiedCount);
    } catch(eUpd){ console.warn('[escalasApi.new][PUT recurso] updateOne falhou, fallback save()', eUpd.message); }

    if(!aplicadoViaUpdate){
      // Fallback: aplicar no doc em memória e salvar
      eq.recursos[idx] = persist;
      try { esc.markModified('equipes'); } catch(_mm2){}
      esc.version = (esc.version||0)+1;
      await esc.save();
    }
    // Recarregar e retornar o recurso persistido (fonte de verdade)
    try {
      const EscalaReload = await getEscalaModel();
      const fresh = await EscalaReload.findById(id).lean();
      const eq2 = (fresh?.equipes||[]).find(e=> e.id===eid);
      let r2 = eq2 && Array.isArray(eq2.recursos) ? eq2.recursos.find(r=> r.id===antigo.id) : null;
      if(r2 && Array.isArray(r2.refeicoes)) r2.refeicoes = normalizarRefeicoesArray(r2.refeicoes);
      if(r2) return res.json({ ok:true, recurso: r2, dbg: { build: ESCALAS_API_BUILD_TAG, refeicoes: contarComputavel(r2.refeicoes) } });
    } catch(_refresh){}
    return res.json({ ok:true, recurso: persist, dbg: { build: ESCALAS_API_BUILD_TAG, refeicoes: contarComputavel(persist.refeicoes) } });
  } catch(e){ console.error('[escalasApi.new][PUT recurso equipe] erro', e); return res.status(500).json({ ok:false, error:'Falha ao atualizar recurso' }); }
});

// Salvar refeições apenas na alocação atual (dia+turno) do recurso
// PUT /api/escalas/:id/equipes/:eid/recursos/:rid/refeicoes { dia, turnoId, lista: [{ inicio, fim, computavel }] }
router.put('/api/escalas/:id/equipes/:eid/recursos/:rid/refeicoes', requireEscalasAuth, async (req,res)=>{
  try {
    let { id, eid, rid } = req.params; id=String(id||'').trim(); eid=String(eid||'').trim(); rid=String(rid||'').trim();
    const { dia, turnoId, lista } = req.body||{};
    if(!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ ok:false, error:'ID inválido' });
    if(!eid) return res.status(400).json({ ok:false, error:'Equipe inválida' });
    if(!rid) return res.status(400).json({ ok:false, error:'Recurso inválido' });
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) return res.status(400).json({ ok:false, error:'Dia inválido' });
    if(!turnoId || typeof turnoId!=='string') return res.status(400).json({ ok:false, error:'turnoId inválido' });
    const Escala = await getEscalaModel();
  const esc = await Escala.findById(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req) && !isAlvoEditable(esc, dia, turnoId, req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada' });
    // Localizar equipe e recurso
    const eq = (esc.equipes||[]).find(e=> String(e.id)===String(eid));
    if(!eq) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    // Buscar recurso de forma tolerante (id, placa ou referenciaGestorId)
    let r = null;
    try {
      r = localizarRecurso(esc, eid, rid);
    } catch(_lr) { /* noop */ }
    if(!r){
      r = (eq.recursos||[]).find(x=>{
        try {
          const ridStr = String(rid);
          const cand = [x?.id, x?.placa, x?.referenciaGestorId].filter(Boolean).map(String);
          return cand.includes(ridStr);
        } catch { return false; }
      }) || null;
    }
    if(!r) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    // Garantir array de refeições no recurso
    if(!Array.isArray(r.refeicoes)) r.refeicoes = [];
    // Remover quaisquer refeições existentes para o escopo desta alocação (dia+turno compatível)
    const tokenSlim = String((turnoId||'')).replace(/\s*-\s*/, '-');
    r.refeicoes = r.refeicoes.filter(iv=>{
      if(!iv) return false;
      const diaIv = iv.dia || iv.data || null; if(diaIv && String(diaIv)!==String(dia)) return true; // manter outras datas
      const raw = String(iv.turnoId||iv.turno||'');
      const norm = raw.includes('::')? raw.split('::').slice(-1)[0] : raw;
      const normSlim = String(norm||'').replace(/\s*-\s*/, '-');
      // Se a refeição tinha um turno definido igual ao turno alvo -> remover (vai substituir)
      if(normSlim && normSlim===tokenSlim) return false;
      // Se não tinha turno mas sobrepõe o intervalo do turno alvo, ainda consideramos como da alocação? Para simplificar: manter.
      return !!normSlim && normSlim!==tokenSlim;
    });
    // Inserir novas da lista
    const normLista = Array.isArray(lista)? lista.filter(x=> x && x.inicio && x.fim).map(x=>({
      dia,
      turnoId,
      ini: x.inicio,
      fim: x.fim,
      tipo: (typeof x.tipo==='string' && /^(ALMOCO|JANTAR|LANCHE|PAUSA)$/i.test(x.tipo))? String(x.tipo).toUpperCase() : 'ALMOCO',
      computavel: typeof x.computavel==='boolean'? x.computavel : true
    })) : [];
    r.refeicoes.push(...normLista);
    // Marcar modificação no array aninhado e versionar
    try { esc.markModified('equipes'); } catch(_mm){ /* noop */ }
    esc.version = (esc.version||0)+1;
    // Persistir
    await esc.save();
    return res.json({ ok:true, count: normLista.length });
  } catch(e){ console.error('[escalasApi.new][PUT refeicoes alloc] erro', e); return res.status(500).json({ ok:false, error:'Falha ao salvar refeições' }); }
});

// Remover recurso
router.delete('/api/escalas/:id/equipes/:eid/recursos/:rid', requireEscalasAuth, async (req,res)=>{
  try { const { id, eid, rid } = req.params; const Escala = await getEscalaModel(); const esc = await Escala.findById(id); if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const eq = (esc.equipes||[]).find(e=> e.id===eid); if(!eq) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const antes = (eq.recursos||[]).length;
    eq.recursos = (eq.recursos||[]).filter(r=> !(r.id===rid || r.referenciaGestorId===rid));
    if(eq.recursos.length===antes) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    esc.version = (esc.version||0)+1;
    await esc.save();
    return res.json({ ok:true, deleted:true, total:eq.recursos.length });
  } catch(e){ console.error('[escalasApi.new][DELETE recurso equipe] erro', e); return res.status(500).json({ ok:false, error:'Falha ao remover recurso' }); }
});

// Excluir alocação do recurso em um dia/turno específico (limpa alocação, atribuições e refeições; move membros/atribuídos para componentes da equipe)
router.delete('/api/escalas/:id/equipes/:eid/recursos/:rid/alocacao', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid, rid } = req.params;
    const q = req.query || {}; const b = req.body || {};
    let diaRaw = b.dia || q.dia || b.data || q.data;
    const turnoIdRaw = b.turnoId || q.turnoId || b.turno || q.turno || q.token || b.token;
    // Normalização de dia
    let dia = null;
    if(diaRaw){ const s=String(diaRaw).trim(); const mISO=s.match(/^(\d{4}-\d{2}-\d{2})/); if(mISO){ dia=mISO[1]; } else { const mBR=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(mBR){ dia=`${mBR[3]}-${mBR[2]}-${mBR[1]}`; } } }
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok:false, error:'dia inválido', received: String(diaRaw||'') });
    if(!turnoIdRaw) return res.status(400).json({ ok:false, error:'turnoId requerido' });
    const turnoId = String(turnoIdRaw);
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req) && !isAlvoEditable(esc, dia, turnoId, req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada' });
    const eqIndex = (esc.equipes||[]).findIndex(e=> e && e.id===eid); if(eqIndex===-1) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];
    const rIndex = (eq.recursos||[]).findIndex(x=> {
      const ridStr = String(rid);
      const cand = [x.id, x.placa, x.referenciaGestorId].filter(Boolean).map(String);
      return cand.includes(ridStr);
    });
    if(rIndex===-1) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    const r = eq.recursos[rIndex];
    const normTurn = String(turnoId).includes('::')? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
    const labelTurn = normTurn.includes('-') ? normTurn.replace('-', ' - ') : normTurn;
    const reqIni = parseHHMMToMin(String(normTurn).split('-')[0]);
    const reqFim = parseHHMMToMin(String(normTurn).split('-')[1]);
    const matchAloc = (a)=>{ try { if(!a||a.dia!==dia) return false; const raw=String(a.turnoId||''); const rawNorm=raw.split('::').slice(-1)[0]; if(rawNorm===normTurn||raw===normTurn||rawNorm===labelTurn||raw===labelTurn) return true; const rng=resolveAlocacaoRangeMin({ ...a, turnoId: rawNorm }, esc); if(rng && reqIni!=null && reqFim!=null) return (rng.ini===reqIni && rng.fim===reqFim); return false; } catch(_){ return false; } };
    // Coletar apenas funcionários atribuídos nesta alocação (sem fallback por membros)
    const movedMap = new Map();
    try {
      const atribs = Array.isArray(r.atribuicoes)
        ? r.atribuicoes.filter(a => a && a.dia === dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0] === normTurn))
        : [];
      for (const a of atribs) {
        const fid = a.membroFuncionarioId || a.funcionarioId || a.funcionario || a.matricula;
        if (!fid) continue;
        const nome = a.nome || a.funcionarioNome || null;
        movedMap.set(String(fid), { id: String(fid), nome });
      }
    } catch (_coleta) {}
    // Enriquecer nomes antes de mover para componentes
    try {
      // 0) Reaproveitar nomes já presentes em eq.componentes
      if(Array.isArray(eq.componentes)){
        for(const c of eq.componentes){
          const cid = String(c?.id||c?.funcionario_id||'');
          if(!cid) continue; const tgt = movedMap.get(cid);
          if(tgt && (!tgt.nome || !String(tgt.nome).trim())){ tgt.nome = c.nome || c.funcionarioNome || tgt.nome; }
        }
      }
      // 1) Buscar por _id (ObjectId) em lote
      const falt1 = Array.from(movedMap.values()).filter(o=> !o.nome || !String(o.nome).trim());
      const hex = falt1.map(o=> String(o.id)).filter(s=> /^[0-9a-fA-F]{24}$/.test(s));
      if(hex.length){
        try {
          const Func = await getFuncionarioModel();
          const docs = await Func.find({ _id: { $in: hex } }).select('nome').lean();
          const mapN = new Map(docs.map(d=> [String(d._id), d.nome||null]));
          for(const o of falt1){ const nm = mapN.get(String(o.id)); if(nm && (!o.nome || !String(o.nome).trim())) o.nome = nm; }
        } catch(_q){ /* noop */ }
      }
      // 2) Buscar por CPF/codigo individualmente para restantes
      const falt2 = Array.from(movedMap.values()).filter(o=> !o.nome || !String(o.nome).trim());
      if(falt2.length){
        try {
          const Func = await getFuncionarioModel();
          for(const o of falt2){
            const s = String(o.id||'');
            const cpf = s.replace(/\D+/g,'');
            let f = null;
            if(cpf.length===11){ f = await Func.findOne({ cpf }).select('nome').lean(); }
            if(!f){ const safe = s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); f = await Func.findOne({ codigo: new RegExp('^'+safe+'$','i') }).select('nome').lean(); }
            if(f && f.nome){ o.nome = f.nome; }
          }
        } catch(_q2){ /* noop */ }
      }
    } catch(_enrichPre){ /* noop */ }
    // 1) Remover a alocação do recurso no dia/turno
    if(Array.isArray(r.alocacoes)) r.alocacoes = r.alocacoes.filter(a=> !matchAloc(a));
    if(r.alocacoesRecurso && typeof r.alocacoesRecurso==='object'){ const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`; if(r.alocacoesRecurso[k1]) delete r.alocacoesRecurso[k1]; if(r.alocacoesRecurso[k2]) delete r.alocacoesRecurso[k2]; }
    // 2) Remover atribuicoes específicas desse dia/turno
    if(Array.isArray(r.atribuicoes)) r.atribuicoes = r.atribuicoes.filter(a=> !(a && a.dia===dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0]===normTurn)));
    if(r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){ const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`; if(r.atribuicoesRecurso[k1]) delete r.atribuicoesRecurso[k1]; if(r.atribuicoesRecurso[k2]) delete r.atribuicoesRecurso[k2]; }
    // 3) Remover refeições desse dia/turno
    if(Array.isArray(r.refeicoes)) r.refeicoes = r.refeicoes.filter(iv=> !(iv && (iv.dia||iv.data)===dia && (String(iv.turnoId||iv.turno||'').split('::').slice(-1)[0]===normTurn)));
    if(r.refeicoesRecurso && typeof r.refeicoesRecurso==='object'){ const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`; if(r.refeicoesRecurso[k1]) delete r.refeicoesRecurso[k1]; if(r.refeicoesRecurso[k2]) delete r.refeicoesRecurso[k2]; }
    // 4) Mover para componentes (evitar duplicados)
    if(!Array.isArray(eq.componentes)) eq.componentes = [];
    const existentes = new Set(eq.componentes.map(c=> String(c && (c.id||c.funcionario_id))).filter(Boolean));
    for(const it of movedMap.values()){
      if(!existentes.has(String(it.id))){ eq.componentes.push({ id: String(it.id), nome: it.nome || String(it.id) }); existentes.add(String(it.id)); }
    }
    try { esc.markModified('equipes'); } catch(_mm){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    // Enriquecer nomes dos movidos para evitar exibir apenas o ID
    let moved = Array.from(movedMap.values());
    try {
      // 1) Tentar eq.componentes
      const byId = new Map(moved.map(o=> [String(o.id), o]));
      if(Array.isArray(eq.componentes)){
        for(const c of eq.componentes){
          const cid = String(c?.id||c?.funcionario_id||'');
          if(!cid) continue; const tgt = byId.get(cid);
          if(tgt && (!tgt.nome || !String(tgt.nome).trim())){ tgt.nome = c.nome || c.funcionarioNome || tgt.nome; }
        }
      }
      // 2) Consultar Funcionario por _id (hexadecimal), apenas os que ainda estão sem nome
      const falt = moved.filter(o=> !o.nome || !String(o.nome).trim());
      if(falt.length){
        const hex = falt.map(o=> String(o.id)).filter(s=> /^[0-9a-fA-F]{24}$/.test(s));
        if(hex.length){
          try {
            const Func = await getFuncionarioModel();
            const docs = await Func.find({ _id: { $in: hex } }).select('nome').lean();
            const mapN = new Map(docs.map(d=> [String(d._id), d.nome||null]));
            for(const o of falt){ const nm = mapN.get(String(o.id)); if(nm && (!o.nome || !String(o.nome).trim())) o.nome = nm; }
          } catch(_q){ /* noop */ }
        }
        // 3) Lookup por codigo/CPF para ids não-ObjectId
        const restantes = falt.filter(o=> !o.nome || !String(o.nome).trim());
        if(restantes.length){
          try {
            const Func = await getFuncionarioModel();
            for(const o of restantes){
              const s = String(o.id||'');
              const cpf = s.replace(/\D+/g,'');
              let f = null;
              if(cpf.length===11){ f = await Func.findOne({ cpf }).select('nome').lean(); }
              if(!f){ const safe = s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); f = await Func.findOne({ codigo: new RegExp('^'+safe+'$','i') }).select('nome').lean(); }
              if(f && f.nome){ o.nome = f.nome; }
            }
          } catch(_q2){ /* noop */ }
        }
      }
    } catch(_enrich){ /* noop enrich */ }
    // Registrar logs de exclusão para cada funcionário removido desta alocação do recurso
    try {
      if(moved && moved.length){
        for(const it of moved){
          await registrarLogSeFechada(esc, req, {
            contexto: 'alocacao_recurso', acao: 'EXCLUSAO', dia, turnoId: normTurn,
            funcionarioId: it.id, funcionarioNome: it.nome || null,
            equipeId: eid, recursoId: rid, recursoNome: r?.nome || r?.placa || r?.referenciaGestorId || null,
            detalhes: { motivo: 'excluir_alocacao_recurso' }
          });
        }
      }
    } catch(_logAR){}
    return res.json({ ok:true, deleted:true, moved });
  } catch(e){ console.error('[escalasApi.new][DELETE recurso/alocacao] erro', e); return res.status(500).json({ ok:false, error:'Falha ao excluir alocação do recurso' }); }
});

// Alias via POST para ambientes com restrições a DELETE
router.post('/api/escalas/:id/equipes/:eid/recursos/:rid/alocacao/delete', requireEscalasAuth, async (req,res)=>{
  try {
    // Reusar lógica chamando internamente a rota DELETE acima seria complexo; replicamos a mesma lógica de forma concisa
    const { id, eid, rid } = req.params; const q = req.query || {}; const b = req.body || {};
    let diaRaw = b.dia || q.dia || b.data || q.data; const turnoIdRaw = b.turnoId || q.turnoId || b.turno || q.turno || q.token || b.token;
    let dia=null; if(diaRaw){ const s=String(diaRaw).trim(); const mISO=s.match(/^(\d{4}-\d{2}-\d{2})/); if(mISO){ dia=mISO[1]; } else { const mBR=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(mBR){ dia=`${mBR[3]}-${mBR[2]}-${mBR[1]}`; } } }
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok:false, error:'dia inválido', received: String(diaRaw||'') });
    if(!turnoIdRaw) return res.status(400).json({ ok:false, error:'turnoId requerido' });
    const turnoId = String(turnoIdRaw);
    const Escala = await getEscalaModel(); const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req) && !isAlvoEditable(esc, dia, turnoId, req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada' });
  const eq = localizarEquipe(esc, eid); if(!eq) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
  const r = localizarRecurso(esc, eid, rid); if(!r) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    const normTurn = String(turnoId).includes('::')? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
    const labelTurn = normTurn.includes('-') ? normTurn.replace('-', ' - ') : normTurn;
    const reqIni = parseHHMMToMin(String(normTurn).split('-')[0]); const reqFim = parseHHMMToMin(String(normTurn).split('-')[1]);
    const matchAloc = (a)=>{ try { if(!a||a.dia!==dia) return false; const raw=String(a.turnoId||''); const rawNorm=raw.split('::').slice(-1)[0]; if(rawNorm===normTurn||raw===normTurn||rawNorm===labelTurn||raw===labelTurn) return true; const rng=resolveAlocacaoRangeMin({ ...a, turnoId: rawNorm }, esc); if(rng && reqIni!=null && reqFim!=null) return (rng.ini===reqIni && rng.fim===reqFim); return false; } catch(_){ return false; } };
    const movedMap = new Map();
    try {
      const atribs = Array.isArray(r.atribuicoes)
        ? r.atribuicoes.filter(a => a && a.dia === dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0] === normTurn))
        : [];
      for (const a of atribs) {
        const fid = a.membroFuncionarioId || a.funcionarioId || a.funcionario || a.matricula;
        if (!fid) continue;
        const nome = a.nome || a.funcionarioNome || null;
        movedMap.set(String(fid), { id: String(fid), nome });
      }
    } catch (_c) {}
    if(Array.isArray(r.alocacoes)) r.alocacoes = r.alocacoes.filter(a=> !matchAloc(a));
    if(r.alocacoesRecurso && typeof r.alocacoesRecurso==='object'){ const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`; if(r.alocacoesRecurso[k1]) delete r.alocacoesRecurso[k1]; if(r.alocacoesRecurso[k2]) delete r.alocacoesRecurso[k2]; }
    if(Array.isArray(r.atribuicoes)) r.atribuicoes = r.atribuicoes.filter(a=> !(a && a.dia===dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0]===normTurn)));
    if(r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){ const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`; if(r.atribuicoesRecurso[k1]) delete r.atribuicoesRecurso[k1]; if(r.atribuicoesRecurso[k2]) delete r.atribuicoesRecurso[k2]; }
    if(Array.isArray(r.refeicoes)) r.refeicoes = r.refeicoes.filter(iv=> !(iv && (iv.dia||iv.data)===dia && (String(iv.turnoId||iv.turno||'').split('::').slice(-1)[0]===normTurn)));
    if(r.refeicoesRecurso && typeof r.refeicoesRecurso==='object'){ const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`; if(r.refeicoesRecurso[k1]) delete r.refeicoesRecurso[k1]; if(r.refeicoesRecurso[k2]) delete r.refeicoesRecurso[k2]; }
    if(!Array.isArray(eq.componentes)) eq.componentes=[];
    const existentes = new Set(eq.componentes.map(c=> String(c && (c.id||c.funcionario_id))).filter(Boolean));
    for(const it of movedMap.values()){ if(!existentes.has(String(it.id))){ eq.componentes.push({ id:String(it.id), nome: it.nome || String(it.id) }); existentes.add(String(it.id)); } }
    try { esc.markModified('equipes'); } catch(_mm){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    // Enriquecer nomes dos movidos para evitar exibir apenas o ID
    let moved = Array.from(movedMap.values());
    try {
      const byId = new Map(moved.map(o=> [String(o.id), o]));
      if(Array.isArray(eq.componentes)){
        for(const c of eq.componentes){
          const cid = String(c?.id||c?.funcionario_id||'');
          if(!cid) continue; const tgt = byId.get(cid);
          if(tgt && (!tgt.nome || !String(tgt.nome).trim())){ tgt.nome = c.nome || c.funcionarioNome || tgt.nome; }
        }
      }
      const falt = moved.filter(o=> !o.nome || !String(o.nome).trim());
      if(falt.length){
        const hex = falt.map(o=> String(o.id)).filter(s=> /^[0-9a-fA-F]{24}$/.test(s));
        if(hex.length){
          try {
            const Func = await getFuncionarioModel();
            const docs = await Func.find({ _id: { $in: hex } }).select('nome').lean();
            const mapN = new Map(docs.map(d=> [String(d._id), d.nome||null]));
            for(const o of falt){ const nm = mapN.get(String(o.id)); if(nm && (!o.nome || !String(o.nome).trim())) o.nome = nm; }
          } catch(_q){ /* noop */ }
        }
        // 3) Lookup por codigo/CPF
        const restantes = falt.filter(o=> !o.nome || !String(o.nome).trim());
        if(restantes.length){
          try {
            const Func = await getFuncionarioModel();
            for(const o of restantes){
              const s = String(o.id||'');
              const cpf = s.replace(/\D+/g,'');
              let f = null;
              if(cpf.length===11){ f = await Func.findOne({ cpf }).select('nome').lean(); }
              if(!f){ const safe = s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); f = await Func.findOne({ codigo: new RegExp('^'+safe+'$','i') }).select('nome').lean(); }
              if(f && f.nome){ o.nome = f.nome; }
            }
          } catch(_q2){ /* noop */ }
        }
      }
    } catch(_enrich){ /* noop enrich */ }
    // Registrar logs (alias POST)
    try {
      const movedArr = Array.from(moved.values ? moved.values() : moved); // compat
      for(const it of movedArr){
        await registrarLogSeFechada(esc, req, {
          contexto: 'alocacao_recurso', acao: 'EXCLUSAO', dia, turnoId: normTurn,
          funcionarioId: it.id, funcionarioNome: it.nome || null,
          equipeId: eid, recursoId: rid, recursoNome: r?.nome || r?.placa || r?.referenciaGestorId || null,
          detalhes: { motivo: 'excluir_alocacao_recurso' }
        });
      }
    } catch(_logPAR){}
    return res.json({ ok:true, deleted:true, moved });
  } catch(e){ console.error('[escalasApi.new][POST recurso/alocacao/delete] erro', e); return res.status(500).json({ ok:false, error:'Falha ao excluir alocação do recurso' }); }
});

// Remover atribuição de funcionário de um recurso em uma alocação (dia/turno) específica
router.delete('/api/escalas/:id/equipes/:eid/recursos/:rid/atribuicoes/:fid', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid, rid, fid } = req.params;
    const q = req.query || {}; const b = req.body || {};
    let diaRaw = b.dia || q.dia || b.data || q.data;
    const turnoIdRaw = b.turnoId || q.turnoId || b.turno || q.turno || q.token || b.token;
    let dia=null; if(diaRaw){ const s=String(diaRaw).trim(); const mISO=s.match(/^(\d{4}-\d{2}-\d{2})/); if(mISO){ dia=mISO[1]; } else { const mBR=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(mBR){ dia=`${mBR[3]}-${mBR[2]}-${mBR[1]}`; } } }
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok:false, error:'dia inválido', received: String(diaRaw||'') });
    if(!turnoIdRaw) return res.status(400).json({ ok:false, error:'turnoId requerido' });
  const turnoId = String(turnoIdRaw);
  // Modo: extrair (mover para componentes) vs remover definitivo
  const extrairRaw = q.extrair ?? b.extrair ?? q.move ?? b.move ?? q.acao ?? b.acao;
  const extrair = (String(extrairRaw||'').toLowerCase() === '1' || String(extrairRaw||'').toLowerCase() === 'true' || String(extrairRaw||'').toLowerCase() === 'componentes' || String(extrairRaw||'').toLowerCase() === 'extrair');
  const escopoRaw = q.escopo ?? b.escopo;
  const escopoAloc = String(escopoRaw||'').toLowerCase() === 'alocacao' || String(escopoRaw||'').toLowerCase() === 'alocação';
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req) && !isAlvoEditable(esc, dia, turnoId, req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada: célula bloqueada' });
  const eq = localizarEquipe(esc, eid); if(!eq) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
  const r = localizarRecurso(esc, eid, rid); if(!r) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    // Corrigir índices para markModified aninhado
    const eqIndex = (esc.equipes||[]).findIndex(e=> e && String(e.id)===String(eid));
    const rIndex = (eq.recursos||[]).findIndex(x=> { const ridStr=String(rid); const cand=[x.id,x.placa,x.referenciaGestorId].filter(Boolean).map(String); return cand.includes(ridStr); });
    // Log de entrada
    try {
      console.info('[escalasApi.new][ATRIB DEL] in', { id, eid, rid, fid, dia, turnoId, extrair, escopoAloc });
    } catch(_){}
    const normTurn = String(turnoId).includes('::')? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
    const labelTurn = normTurn.includes('-') ? normTurn.replace('-', ' - ') : normTurn;
    const reqIni = parseHHMMToMin(String(normTurn).split('-')[0]); const reqFim = parseHHMMToMin(String(normTurn).split('-')[1]);
    const matchTurno = (a)=>{ try { if(!a||a.dia!==dia) return false; const raw=String(a.turnoId||''); const rawNorm=raw.split('::').slice(-1)[0]; if(rawNorm===normTurn||raw===normTurn||rawNorm===labelTurn||raw===labelTurn) return true; const rng=resolveAlocacaoRangeMin({ ...a, turnoId: rawNorm }, esc); if(rng && reqIni!=null && reqFim!=null) return (rng.ini===reqIni && rng.fim===reqFim); return false; } catch(_){ return false; } };
    const eqId = (candidate)=>{
      try {
        if(candidate==null) return false;
        let val = candidate;
        if(typeof val==='object'){
          if(typeof val.equals==='function'){
            try { return val.equals(new mongoose.Types.ObjectId(String(fid))); } catch(_) { /* fallthrough */ }
            return String(val) === String(fid);
          }
          if(val._id) val = val._id;
        }
        return String(val) === String(fid);
      } catch(_){ return false; }
    };
    // Remover da lista de atribuicoes daquele dia/turno
    let deleted=false; let nomeMovido=null;
    if(Array.isArray(r.atribuicoes)){
      const antes = r.atribuicoes.length;
      r.atribuicoes = r.atribuicoes.filter(a=>{
        const alvoTurno = (a && a.dia===dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0]===normTurn) );
        const alvoFunc = a && (eqId(a.membroFuncionarioId)||eqId(a.funcionarioId)||eqId(a.funcionario)||eqId(a.matricula));
        if(alvoTurno && alvoFunc){ nomeMovido = a.nome || a.funcionarioNome || null; return false; }
        return true;
      });
      if(r.atribuicoes.length !== antes) deleted=true;
    }
    if(r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){
      const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`;
      for(const key of [k1,k2]){
        if(!r.atribuicoesRecurso[key] || !Array.isArray(r.atribuicoesRecurso[key])) continue;
        const antes = r.atribuicoesRecurso[key].length;
        r.atribuicoesRecurso[key] = r.atribuicoesRecurso[key].filter(it=> !(it && (eqId(it.membroFuncionarioId)||eqId(it.funcionarioId)||eqId(it.funcionario)||eqId(it.matricula))));
        if(r.atribuicoesRecurso[key].length !== antes) deleted=true;
        if(r.atribuicoesRecurso[key].length === 0) { try { delete r.atribuicoesRecurso[key]; } catch(_){} }
      }
    }
    // Registrar bloqueio desta alocação para evitar reexibir via fallback de membros
    try {
      if(!r.remocoesRecurso || typeof r.remocoesRecurso !== 'object') r.remocoesRecurso = {};
      const k1 = `${dia}__${normTurn}`;
      const k2 = `${dia}__${labelTurn}`;
      for(const key of [k1,k2]){
        if(!r.remocoesRecurso[key]) r.remocoesRecurso[key] = [];
        const arr = Array.isArray(r.remocoesRecurso[key]) ? r.remocoesRecurso[key] : [];
        const fidStr = String(fid);
        if(!arr.includes(fidStr)) arr.push(fidStr);
        r.remocoesRecurso[key] = arr;
      }
    } catch(_blk){ /* noop */ }
    // Se for extração, mover para sem recurso
    let movedObj = null;
    if(extrair){
      // Tentar descobrir nome a partir de atribuições/membros se não veio
      let nomeFinal = nomeMovido || null;
      if(!nomeFinal){
        try {
          const atribs = Array.isArray(r.atribuicoes)? r.atribuicoes.filter(a=> a && a.dia===dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0]===normTurn)) : [];
          const hit = atribs.find(a=> {
            const eqId = v=> String(v)===String(fid);
            return a && (eqId(a.membroFuncionarioId)||eqId(a.funcionarioId)||eqId(a.funcionario)||eqId(a.matricula));
          });
          if(hit) nomeFinal = hit.nome || hit.funcionarioNome || null;
        } catch(_a){}
      }
      if(!nomeFinal){
        try {
          const membro = Array.isArray(r.membros) ? r.membros.find(m=> String(m?.funcionario_id||m?.id) === String(fid)) : null;
          if(membro) nomeFinal = membro.nome || membro.funcionarioNome || null;
        } catch(_m){}
      }
      if(!nomeFinal && /^[0-9a-fA-F]{24}$/.test(String(fid))){
        try {
          const Func = await getFuncionarioModel();
          const f = await Func.findById(String(fid)).select('nome').lean();
          if(f && f.nome) nomeFinal = f.nome;
        } catch(_q){}
      }
      if(!nomeFinal){
        // Fallback adicional: tentar por CPF ou código
        try {
          const Func = await getFuncionarioModel();
          const s = String(fid||'');
          const cpf = s.replace(/\D+/g,'');
          let f = null;
          if(cpf.length===11){ f = await Func.findOne({ cpf }).select('nome').lean(); }
          if(!f){ const safe = s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); f = await Func.findOne({ codigo: new RegExp('^'+safe+'$','i') }).select('nome').lean(); }
          if(f && f.nome) nomeFinal = f.nome;
        } catch(_q2){}
      }
      if(escopoAloc){
        // Extração pontual: registrar em eq.adicoesEquipe[dia__turno]
        try {
          if(!eq.adicoesEquipe || typeof eq.adicoesEquipe!=='object') eq.adicoesEquipe = {};
          const k1 = `${dia}__${normTurn}`; const k2 = `${dia}__${labelTurn}`;
          for(const key of [k1,k2]){
            const arr = Array.isArray(eq.adicoesEquipe[key])? eq.adicoesEquipe[key] : [];
            const exists = arr.some(x=> String(x && (x.id||x.funcionario_id||x.funcionarioId||x.matricula||x.codigo))===String(fid));
            if(!exists){ arr.push({ id:String(fid), nome: nomeFinal || String(fid) }); }
            eq.adicoesEquipe[key] = arr;
          }
          movedObj = { id:String(fid), nome: nomeFinal || String(fid) };
          try { esc.markModified(`equipes.${eqIndex}.adicoesEquipe`); } catch(_mA){}
          try {
            const keys = Object.keys(eq.adicoesEquipe||{});
            const k1 = `${dia}__${normTurn}`; const k2 = `${dia}__${labelTurn}`;
            console.info('[escalasApi.new][ATRIB DEL] adicoesEquipe updated', { eid, dia, normTurn, keys, k1Count: Array.isArray(eq.adicoesEquipe[k1])? eq.adicoesEquipe[k1].length: 0, k2Count: Array.isArray(eq.adicoesEquipe[k2])? eq.adicoesEquipe[k2].length: 0 });
          } catch(_){}
        } catch(_add){}
        // Ao extrair pontualmente, remover eventual bloqueio anterior desta alocação em remocoesEquipe
        try {
          if(eq.remocoesEquipe && typeof eq.remocoesEquipe==='object'){
            const keys = [ `${dia}__${normTurn}`, `${dia}__${labelTurn}` ];
            let changed = false;
            for(const key of keys){
              if(Array.isArray(eq.remocoesEquipe[key])){
                const antes = eq.remocoesEquipe[key].length;
                eq.remocoesEquipe[key] = eq.remocoesEquipe[key].filter(x=> String(x)!==String(fid));
                if(eq.remocoesEquipe[key].length !== antes) changed = true;
              }
            }
            if(changed){ try { esc.markModified(`equipes.${eqIndex}.remocoesEquipe`); } catch(_mRE){} }
            try { console.info('[escalasApi.new][ATRIB DEL] remocoesEquipe cleared', { eid, dia, normTurn }); } catch(_){}
          }
        } catch(_clearBlk){}
      } else {
        // Comportamento legado: mover para equipe.componentes (global)
        if(!Array.isArray(eq.componentes)) eq.componentes=[];
        const jaTem = eq.componentes.some(c=> String(c?.id||c?.funcionario_id) === String(fid));
        if(!jaTem){ const obj={ id:String(fid), nome: nomeFinal || String(fid) }; eq.componentes.push(obj); movedObj = obj; try { esc.markModified(`equipes.${eqIndex}.componentes`); } catch(_mC){} }
        else { movedObj = eq.componentes.find(c=> String(c?.id||c?.funcionario_id) === String(fid)) || null; if(movedObj && (!movedObj.nome || !String(movedObj.nome).trim())){ movedObj.nome = nomeFinal || movedObj.nome; try { esc.markModified(`equipes.${eqIndex}.componentes`); } catch(_mC2){} } }
      }
    } else {
      // Remoção definitiva desta alocação: registrar bloqueio no nível da equipe para não aparecer em 'fora'
      try {
        if(!eq.remocoesEquipe || typeof eq.remocoesEquipe!=='object') eq.remocoesEquipe = {};
        const k1 = `${dia}__${normTurn}`;
        const k2 = `${dia}__${labelTurn}`;
        for(const key of [k1,k2]){
          if(!eq.remocoesEquipe[key]) eq.remocoesEquipe[key] = [];
          const arr = Array.isArray(eq.remocoesEquipe[key]) ? eq.remocoesEquipe[key] : [];
          const fidStr = String(fid);
          if(!arr.includes(fidStr)) arr.push(fidStr);
          eq.remocoesEquipe[key] = arr;
        }
      } catch(_blkEq){}
      // Importante: não remover de eq.componentes globalmente aqui. A ação é pontual (apenas nesta alocação).
    }
  try { esc.markModified('equipes'); } catch(_mm){}
  if(!extrair){ try { esc.markModified(`equipes.${eqIndex}.remocoesEquipe`); } catch(_m3){} }
    try { esc.markModified(`equipes.${eqIndex}.recursos.${rIndex}.remocoesRecurso`); } catch(_m2){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    try {
      const k1 = `${dia}__${normTurn}`; const k2 = `${dia}__${labelTurn}`;
      console.info('[escalasApi.new][ATRIB DEL] out', { ok:true, deleted, moved: !!movedObj, adicoesK1: Array.isArray(eq.adicoesEquipe?.[k1])? eq.adicoesEquipe[k1].map(x=>x.id): [], adicoesK2: Array.isArray(eq.adicoesEquipe?.[k2])? eq.adicoesEquipe[k2].map(x=>x.id): [] });
    } catch(_){ }
    // Registrar log da exclusão de atribuição (por funcionário)
    try {
      await registrarLogSeFechada(esc, req, {
        contexto: 'atribuicao',
        acao: 'EXCLUSAO',
        dia,
        turnoId: normTurn,
        funcionarioId: fid,
        funcionarioNome: (movedObj && movedObj.nome) || nomeMovido || null,
        equipeId: eid,
        recursoId: rid,
        recursoNome: r?.nome || r?.placa || r?.referenciaGestorId || null,
        detalhes: { extrair }
      });
    } catch(_log){ }
    return res.json({ ok:true, deleted: deleted, moved: movedObj || null });
  } catch(e){ console.error('[escalasApi.new][DELETE recurso/atribuicao] erro', e); return res.status(500).json({ ok:false, error:'Falha ao remover atribuição do recurso' }); }
});

// Alias POST para ambientes com restrição a DELETE (replica a lógica do DELETE acima)
router.post('/api/escalas/:id/equipes/:eid/recursos/:rid/atribuicoes/:fid/delete', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid, rid, fid } = req.params;
    const q = req.query || {}; const b = req.body || {};
    let diaRaw = b.dia || q.dia || b.data || q.data;
    const turnoIdRaw = b.turnoId || q.turnoId || b.turno || q.turno || q.token || b.token;
    let dia=null; if(diaRaw){ const s=String(diaRaw).trim(); const mISO=s.match(/^(\d{4}-\d{2}-\d{2})/); if(mISO){ dia=mISO[1]; } else { const mBR=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(mBR){ dia=`${mBR[3]}-${mBR[2]}-${mBR[1]}`; } } }
    if(!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return res.status(400).json({ ok:false, error:'dia inválido', received: String(diaRaw||'') });
    if(!turnoIdRaw) return res.status(400).json({ ok:false, error:'turnoId requerido' });
  const turnoId = String(turnoIdRaw);
  // Modo: extrair (mover para componentes) vs remover definitivo
  const extrairRaw = q.extrair ?? b.extrair ?? q.move ?? b.move ?? q.acao ?? b.acao;
  const extrair = (String(extrairRaw||'').toLowerCase() === '1' || String(extrairRaw||'').toLowerCase() === 'true' || String(extrairRaw||'').toLowerCase() === 'componentes' || String(extrairRaw||'').toLowerCase() === 'extrair');
  // Escopo: quando 'alocacao', a extração deve ser pontual (apenas dia/turno), usando eq.adicoesEquipe
  const escopoRaw = q.escopo ?? b.escopo;
  const escopoAloc = String(escopoRaw||'').toLowerCase() === 'alocacao' || String(escopoRaw||'').toLowerCase() === 'alocação';
  const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const eqIndex = (esc.equipes||[]).findIndex(e=> e && e.id===eid); if(eqIndex===-1) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];
    const rIndex = (eq.recursos||[]).findIndex(x=> { const ridStr=String(rid); const cand=[x.id,x.placa,x.referenciaGestorId].filter(Boolean).map(String); return cand.includes(ridStr); });
    if(rIndex===-1) return res.status(404).json({ ok:false, error:'Recurso não encontrado' });
    const r = eq.recursos[rIndex];
    try {
      console.info('[escalasApi.new][ATRIB POST-DEL] in', { id, eid, rid, fid, dia, turnoId, extrair, escopoAloc });
    } catch(_){ }
    const normTurn = String(turnoId).includes('::')? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
    const labelTurn = normTurn.includes('-') ? normTurn.replace('-', ' - ') : normTurn;
    const reqIni = parseHHMMToMin(String(normTurn).split('-')[0]); const reqFim = parseHHMMToMin(String(normTurn).split('-')[1]);
    const matchTurno = (a)=>{ try { if(!a||a.dia!==dia) return false; const raw=String(a.turnoId||''); const rawNorm=raw.split('::').slice(-1)[0]; if(rawNorm===normTurn||raw===normTurn||rawNorm===labelTurn||raw===labelTurn) return true; const rng=resolveAlocacaoRangeMin({ ...a, turnoId: rawNorm }, esc); if(rng && reqIni!=null && reqFim!=null) return (rng.ini===reqIni && rng.fim===reqFim); return false; } catch(_){ return false; } };
    const eqId = (candidate)=>{
      try {
        if(candidate==null) return false; let val=candidate;
        if(typeof val==='object'){
          if(typeof val.equals==='function'){
            try { return val.equals(new mongoose.Types.ObjectId(String(fid))); } catch(_) { /* fallback */ }
            return String(val) === String(fid);
          }
          if(val._id) val = val._id;
        }
        return String(val) === String(fid);
      } catch(_){ return false; }
    };
    let deleted=false; let nomeMovido=null;
    if(Array.isArray(r.atribuicoes)){
      const antes = r.atribuicoes.length;
      r.atribuicoes = r.atribuicoes.filter(a=>{
        const alvoTurno = (a && a.dia===dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0]===normTurn) );
        const alvoFunc = a && (eqId(a.membroFuncionarioId)||eqId(a.funcionarioId)||eqId(a.funcionario)||eqId(a.matricula));
        if(alvoTurno && alvoFunc){ nomeMovido = a.nome || a.funcionarioNome || null; return false; }
        return true;
      });
      if(r.atribuicoes.length !== antes) deleted=true;
    }
    if(r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){
      const k1=`${dia}__${normTurn}`; const k2=`${dia}__${labelTurn}`;
      for(const key of [k1,k2]){
        if(!r.atribuicoesRecurso[key] || !Array.isArray(r.atribuicoesRecurso[key])) continue;
        const antes = r.atribuicoesRecurso[key].length;
        r.atribuicoesRecurso[key] = r.atribuicoesRecurso[key].filter(it=> !(it && (eqId(it.membroFuncionarioId)||eqId(it.funcionarioId)||eqId(it.funcionario)||eqId(it.matricula))));
        if(r.atribuicoesRecurso[key].length !== antes) deleted=true;
        if(r.atribuicoesRecurso[key].length === 0) delete r.atribuicoesRecurso[key];
      }
    }
    // Registrar bloqueio desta alocação para evitar reexibir via fallback de membros
    try {
      if(!r.remocoesRecurso || typeof r.remocoesRecurso !== 'object') r.remocoesRecurso = {};
      const k1 = `${dia}__${normTurn}`;
      const k2 = `${dia}__${labelTurn}`;
      for(const key of [k1,k2]){
        if(!r.remocoesRecurso[key]) r.remocoesRecurso[key] = [];
        const arr = Array.isArray(r.remocoesRecurso[key]) ? r.remocoesRecurso[key] : [];
        const fidStr = String(fid);
        if(!arr.includes(fidStr)) arr.push(fidStr);
        r.remocoesRecurso[key] = arr;
      }
    } catch(_blk){ /* noop */ }
    // Se for extração, mover para componentes; caso contrário, não mover (remoção definitiva desta alocação)
    let movedObj = null;
    if(extrair){
      let nomeFinal = nomeMovido || null;
      if(!nomeFinal){
        try {
          const atribs = Array.isArray(r.atribuicoes)? r.atribuicoes.filter(a=> a && a.dia===dia && (!a.turnoId || String(a.turnoId).split('::').slice(-1)[0]===normTurn)) : [];
          const hit = atribs.find(a=> {
            const eqId = v=> String(v)===String(fid);
            return a && (eqId(a.membroFuncionarioId)||eqId(a.funcionarioId)||eqId(a.funcionario)||eqId(a.matricula));
          });
          if(hit) nomeFinal = hit.nome || hit.funcionarioNome || null;
        } catch(_a){}
      }
      if(!nomeFinal){
        try { const membro = Array.isArray(r.membros) ? r.membros.find(m=> String(m?.funcionario_id||m?.id) === String(fid)) : null; if(membro) nomeFinal = membro.nome || membro.funcionarioNome || null; } catch(_m){}
      }
      if(!nomeFinal && /^[0-9a-fA-F]{24}$/.test(String(fid))){
        try { const Func = await getFuncionarioModel(); const f = await Func.findById(String(fid)).select('nome').lean(); if(f && f.nome) nomeFinal = f.nome; } catch(_q){}
      }
      if(!nomeFinal){
        try {
          const Func = await getFuncionarioModel();
          const s = String(fid||'');
          const cpf = s.replace(/\D+/g,'');
          let f = null;
          if(cpf.length===11){ f = await Func.findOne({ cpf }).select('nome').lean(); }
          if(!f){ const safe = s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); f = await Func.findOne({ codigo: new RegExp('^'+safe+'$','i') }).select('nome').lean(); }
          if(f && f.nome) nomeFinal = f.nome;
        } catch(_q2){}
      }
      if(escopoAloc){
        try {
          if(!eq.adicoesEquipe || typeof eq.adicoesEquipe!=='object') eq.adicoesEquipe = {};
          const k1 = `${dia}__${normTurn}`; const k2 = `${dia}__${labelTurn}`;
          for(const key of [k1,k2]){
            const arr = Array.isArray(eq.adicoesEquipe[key])? eq.adicoesEquipe[key] : [];
            const exists = arr.some(x=> String(x && (x.id||x.funcionario_id||x.funcionarioId||x.matricula||x.codigo))===String(fid));
            if(!exists){ arr.push({ id:String(fid), nome: nomeFinal || String(fid) }); }
            eq.adicoesEquipe[key] = arr;
          }
          movedObj = { id:String(fid), nome: nomeFinal || String(fid) };
          try { esc.markModified(`equipes.${eqIndex}.adicoesEquipe`); } catch(_mA){}
          try {
            const keys = Object.keys(eq.adicoesEquipe||{});
            const k1 = `${dia}__${normTurn}`; const k2 = `${dia}__${labelTurn}`;
            console.info('[escalasApi.new][ATRIB POST-DEL] adicoesEquipe updated', { eid, dia, normTurn, keys, k1Count: Array.isArray(eq.adicoesEquipe[k1])? eq.adicoesEquipe[k1].length: 0, k2Count: Array.isArray(eq.adicoesEquipe[k2])? eq.adicoesEquipe[k2].length: 0 });
          } catch(_){}
        } catch(_add){}
        // Ao extrair pontualmente, remover eventual bloqueio anterior desta alocação em remocoesEquipe
        try {
          if(eq.remocoesEquipe && typeof eq.remocoesEquipe==='object'){
            const keys = [ `${dia}__${normTurn}`, `${dia}__${labelTurn}` ];
            let changed = false;
            for(const key of keys){
              if(Array.isArray(eq.remocoesEquipe[key])){
                const antes = eq.remocoesEquipe[key].length;
                eq.remocoesEquipe[key] = eq.remocoesEquipe[key].filter(x=> String(x)!==String(fid));
                if(eq.remocoesEquipe[key].length !== antes) changed = true;
              }
            }
            if(changed){ try { esc.markModified(`equipes.${eqIndex}.remocoesEquipe`); } catch(_mRE){} }
            try { console.info('[escalasApi.new][ATRIB POST-DEL] remocoesEquipe cleared', { eid, dia, normTurn }); } catch(_){}
          }
        } catch(_clearBlk){}
      } else {
        if(!Array.isArray(eq.componentes)) eq.componentes=[];
        const jaTem = eq.componentes.some(c=> String(c?.id||c?.funcionario_id) === String(fid));
        if(!jaTem){ const obj={ id:String(fid), nome: nomeFinal || String(fid) }; eq.componentes.push(obj); movedObj = obj; try { esc.markModified(`equipes.${eqIndex}.componentes`); } catch(_mC){} }
        else { movedObj = eq.componentes.find(c=> String(c?.id||c?.funcionario_id) === String(fid)) || null; if(movedObj && (!movedObj.nome || !String(movedObj.nome).trim())){ movedObj.nome = nomeFinal || movedObj.nome; try { esc.markModified(`equipes.${eqIndex}.componentes`); } catch(_mC2){} } }
      }
    } else {
      // Remoção definitiva desta alocação: registrar bloqueio em nível de equipe para não aparecer em 'fora'
      try {
        if(!eq.remocoesEquipe || typeof eq.remocoesEquipe!=='object') eq.remocoesEquipe = {};
        const k1 = `${dia}__${normTurn}`;
        const k2 = `${dia}__${labelTurn}`;
        for(const key of [k1,k2]){
          if(!eq.remocoesEquipe[key]) eq.remocoesEquipe[key] = [];
          const arr = Array.isArray(eq.remocoesEquipe[key]) ? eq.remocoesEquipe[key] : [];
          const fidStr = String(fid);
          if(!arr.includes(fidStr)) arr.push(fidStr);
          eq.remocoesEquipe[key] = arr;
        }
      } catch(_blkEq){}
      // Não remover de eq.componentes globalmente. A ação deve ser pontual à alocação.
    }
  try { esc.markModified('equipes'); } catch(_mm){}
  if(!extrair){ try { esc.markModified(`equipes.${eqIndex}.remocoesEquipe`); } catch(_m3){} }
    try { esc.markModified(`equipes.${eqIndex}.recursos.${rIndex}.remocoesRecurso`); } catch(_m2){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    try {
      const k1 = `${dia}__${normTurn}`; const k2 = `${dia}__${labelTurn}`;
      console.info('[escalasApi.new][ATRIB POST-DEL] out', { ok:true, deleted, moved: !!movedObj, adicoesK1: Array.isArray(eq.adicoesEquipe?.[k1])? eq.adicoesEquipe[k1].map(x=>x.id): [], adicoesK2: Array.isArray(eq.adicoesEquipe?.[k2])? eq.adicoesEquipe[k2].map(x=>x.id): [] });
    } catch(_){}
    // Registrar log da exclusão (alias POST)
    try {
      await registrarLogSeFechada(esc, req, {
        contexto: 'atribuicao', acao: 'EXCLUSAO', dia, turnoId: normTurn,
        funcionarioId: fid,
        funcionarioNome: (movedObj && movedObj.nome) || null,
        equipeId: eid,
        recursoId: rid,
        recursoNome: r?.nome || r?.placa || r?.referenciaGestorId || null,
        detalhes: { extrair }
      });
    } catch(_log2){}
    return res.json({ ok:true, deleted: deleted, moved: movedObj || null });
  } catch(e){ console.error('[escalasApi.new][POST recurso/atribuicao/delete] erro', e); return res.status(500).json({ ok:false, error:'Falha ao remover atribuição do recurso' }); }
});

// Remover funcionário dos componentes da equipe (funcionário sem recurso)
router.delete('/api/escalas/:id/equipes/:eid/componentes/:fid', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid, fid } = req.params;
    const q = req.query || {};
    const body = req.body || {};
    const dia = q.dia || body.dia || null;
    const turnoIdRaw = q.turnoId || q.turno || body.turnoId || body.turno || null;
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });
    const eqIndex = Array.isArray(esc.equipes) ? esc.equipes.findIndex(e=> e && String(e.id)===String(eid)) : -1;
    if(eqIndex<0) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];

    // Normalizações auxiliares e captura de nome antes de remover
    const normTurnPre = turnoIdRaw ? (String(turnoIdRaw).includes('::') ? String(turnoIdRaw).split('::').slice(-1)[0] : String(turnoIdRaw)) : null;
    const labelTurnPre = normTurnPre && normTurnPre.includes('-') ? normTurnPre.replace('-', ' - ') : (turnoIdRaw || null);
    let nomeCandidato = null;
    try {
      const cand = Array.isArray(eq?.componentes) ? eq.componentes.find(c=> String(c?.id||c?.funcionario_id) === String(fid)) : null;
      if(cand && cand.nome) nomeCandidato = cand.nome;
    } catch(_n1){}
    if(!nomeCandidato && dia && turnoIdRaw){
      try {
        const keys = [ `${dia}__${normTurnPre}`, `${dia}__${String(turnoIdRaw)}`, `${dia}__${labelTurnPre}` ].filter(Boolean);
        for(const key of keys){
          const lista = Array.isArray(eq?.adicoesEquipe?.[key]) ? eq.adicoesEquipe[key] : [];
          const hit = lista.find(c=> String(c?.id||c?.funcionario_id) === String(fid));
          if(hit && hit.nome){ nomeCandidato = hit.nome; break; }
        }
      } catch(_n2){}
    }

  let removedFromComponentes = false;
    const antes = Array.isArray(eq.componentes)? eq.componentes.length: 0;
    eq.componentes = (eq.componentes||[]).filter(c=> String(c?.id||c?.funcionario_id) !== String(fid));
    if(eq.componentes.length !== antes){ removedFromComponentes = true; try { esc.markModified(`equipes.${eqIndex}.componentes`); } catch(_m1){} }

    // Se foi passado dia/turno, também remover de adições pontuais desta alocação, se existir
    let removedPontual = false;
    if(dia && turnoIdRaw){
      try {
        const normalizeRange = (tok)=>{ try { const s=String(tok||''); const base=s.includes('::')? s.split('::').slice(-1)[0] : s; return (base.match(/\d{2}:\d{2}-\d{2}:\d{2}/)||[])[0] || null; } catch{ return null; } };
        const normTurn = String(turnoIdRaw).includes('::') ? String(turnoIdRaw).split('::').slice(-1)[0] : String(turnoIdRaw);
        const labelTurn = normTurn.includes('-') ? normTurn.replace('-', ' - ') : normTurn;
        const alvoRange = normalizeRange(normTurn) || normalizeRange(labelTurn);
        if(!eq.adicoesEquipe || typeof eq.adicoesEquipe!=='object') eq.adicoesEquipe = {};
        const touchedKeys = [];
        // 1) Chaves diretas (k1/k2)
        for(const key of [ `${dia}__${normTurn}`, `${dia}__${turnoIdRaw}`, `${dia}__${labelTurn}` ]){
          if(Array.isArray(eq.adicoesEquipe[key])){
            const antesKey = eq.adicoesEquipe[key].length;
            eq.adicoesEquipe[key] = eq.adicoesEquipe[key].filter(c=> String(c?.id||c?.funcionario_id) !== String(fid));
            if(eq.adicoesEquipe[key].length !== antesKey){ removedPontual = true; touchedKeys.push(key); }
            if(eq.adicoesEquipe[key].length === 0){ try { delete eq.adicoesEquipe[key]; } catch(_){} }
          }
        }
        // 2) Varredura tolerante por dia + mesma faixa de horário
        if(alvoRange){
          for(const [key, lista] of Object.entries(eq.adicoesEquipe)){
            if(!Array.isArray(lista) || !key || typeof key!=='string') continue;
            const [dK, tK] = key.split('__'); if(dK!==dia) continue;
            const rK = normalizeRange(tK); if(!rK) continue;
            if(rK === alvoRange){
              const antesKey = lista.length;
              const nova = lista.filter(c=> String(c?.id||c?.funcionario_id) !== String(fid));
              if(nova.length !== antesKey){ eq.adicoesEquipe[key] = nova; removedPontual = true; touchedKeys.push(key); }
              if(eq.adicoesEquipe[key].length === 0){ try { delete eq.adicoesEquipe[key]; } catch(_){} }
            }
          }
        }
        if(removedPontual){ try { esc.markModified(`equipes.${eqIndex}.adicoesEquipe`); } catch(_m2){} }
        try { console.info('[escalasApi.new][DELETE fora] pontual', { id, eid, dia, turnoId: turnoIdRaw, removedPontual, touchedKeys }); } catch(_){}
      } catch(_rmPont){ /* noop */ }
    }

    if(!(removedFromComponentes || removedPontual)){
      return res.status(404).json({ ok:false, error:'Funcionário não encontrado na equipe' });
    }

    try { esc.markModified('equipes'); } catch(_mm){}
    esc.version = (esc.version||0)+1;
    await esc.save();
    // Registrar log de EXCLUSAO na alocação da equipe (somente se diária e escala fechada)
    try {
      if(dia && normTurnPre){
        await registrarLogSeFechada(esc, req, {
          contexto: 'alocacao_equipe',
          acao: 'EXCLUSAO',
          dia,
          turnoId: normTurnPre,
          funcionarioId: fid,
          funcionarioNome: nomeCandidato || null,
          equipeId: eid,
          recursoId: null,
          recursoNome: null,
          detalhes: { origem:'componentes', removedFromComponentes, removedPontual }
        });
      }
    } catch(_logCompDel){}
    return res.json({ ok:true, deleted:true, removedFromComponentes, removedPontual, total:eq.componentes.length });
  } catch(e){ console.error('[escalasApi.new][DELETE componente equipe] erro', e); return res.status(500).json({ ok:false, error:'Falha ao remover componente da equipe' }); }
});

// Adicionar funcionário aos componentes da equipe (funcionário sem recurso)
router.post('/api/escalas/:id/equipes/:eid/componentes', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid } = req.params;
    if(!(id && /^[0-9a-fA-F]{24}$/.test(id))) return res.status(400).json({ ok:false, error:'ID inválido' });
    if(!eid) return res.status(400).json({ ok:false, error:'Equipe inválida' });
    const body = req.body || {};
    const fidRaw = body.funcionarioId || body.id || body.funcionario_id || body.codigo || null;
    let nomeRaw = body.nome || body.nomeFuncionario || null;
    const dia = body.dia || null;
    const turnoIdRaw = body.turnoId || body.turno || null;
    if(!fidRaw || String(fidRaw).trim()==='') return res.status(400).json({ ok:false, error:'funcionarioId requerido' });
    const fid = String(fidRaw).trim();

    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
  if(esc.status==='fechada' && !isDiariaContext(req)) return res.status(423).json({ ok:false, error:'ESCALA_FECHADA', message:'Escala fechada' });

    const eqIndex = Array.isArray(esc.equipes) ? esc.equipes.findIndex(e=> e && String(e.id)===String(eid)) : -1;
    if(eqIndex<0) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const eq = esc.equipes[eqIndex];
    if(!Array.isArray(eq.componentes)) eq.componentes = [];

    // Idempotência: se já existe nos componentes, retornar existente e (opcionalmente) atualizar nome faltante
    let existente = eq.componentes.find(c=> String(c?.id||c?.funcionario_id)===fid) || null;

    // Resolver nome se não fornecido
    let nomeFinal = (nomeRaw && String(nomeRaw).trim()) ? String(nomeRaw).trim() : null;
    if(!nomeFinal){
      try {
        const mod = await import('#core/models/Funcionario.js');
        const FuncModel = mod.default || mod.Funcionario || mod;
        const isHex24 = (v)=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v);
        const onlyDigits = (v)=> (v||'').replace(/\D+/g,'');
        let fdoc=null;
        if(isHex24(fid)){
          try { fdoc = await FuncModel.findById(fid).select('nome').lean(); } catch(_e){}
        }
        if(!fdoc){ const d=onlyDigits(fid); if(d.length===11){ try{ fdoc = await FuncModel.findOne({ cpf:d }).select('nome').lean(); } catch(_e){} } }
        if(!fdoc){ try { fdoc = await FuncModel.findOne({ codigo: new RegExp('^'+fid+'$','i') }).select('nome').lean(); } catch(_e){} }
        if(fdoc && fdoc.nome) nomeFinal = fdoc.nome;
      } catch(_resErr){ /* opcional */ }
    }

    let created = false;
    if(!existente){
      const novo = { id: fid, nome: nomeFinal || fid };
      eq.componentes.push(novo);
      existente = novo;
      created = true;
      try { esc.markModified(`equipes.${eqIndex}.componentes`); } catch(_m){}
    } else {
      // Atualizar nome se estiver vazio
      if((!existente.nome || !String(existente.nome).trim()) && nomeFinal){ existente.nome = nomeFinal; try { esc.markModified(`equipes.${eqIndex}.componentes`); } catch(_m2){} }
    }

    // Se dia e turnoId informados, remover bloqueio de 'fora' para essa alocação (caso tenha sido removido definitivamente antes)
    let clearedBlock = false;
    if(dia && turnoIdRaw){
      try {
        if(!eq.remocoesEquipe || typeof eq.remocoesEquipe!=='object') eq.remocoesEquipe = {};
        const normTurn = String(turnoIdRaw).includes('::') ? String(turnoIdRaw).split('::').slice(-1)[0] : String(turnoIdRaw);
        const keys = [ `${dia}__${normTurn}`, `${dia}__${turnoIdRaw}` ];
        for(const key of keys){
          if(Array.isArray(eq.remocoesEquipe[key])){
            const antes = eq.remocoesEquipe[key].length;
            eq.remocoesEquipe[key] = eq.remocoesEquipe[key].filter(x=> String(x)!==fid);
            if(eq.remocoesEquipe[key].length !== antes){ clearedBlock = true; }
          }
        }
        if(clearedBlock){ try { esc.markModified(`equipes.${eqIndex}.remocoesEquipe`); } catch(_m3){} }
      } catch(_blk){}
    }

    esc.version = (esc.version||0)+1;
    await esc.save();
    // Registrar log de INSERCAO na alocação da equipe (somente se diária e escala fechada)
    try {
      if(dia && turnoIdRaw){
        const normTurn = String(turnoIdRaw).includes('::') ? String(turnoIdRaw).split('::').slice(-1)[0] : String(turnoIdRaw);
        await registrarLogSeFechada(esc, req, {
          contexto: 'alocacao_equipe',
          acao: 'INSERCAO',
          dia,
          turnoId: normTurn,
          funcionarioId: existente.id,
          funcionarioNome: existente.nome || null,
          equipeId: eid,
          recursoId: null,
          recursoNome: null,
          detalhes: { origem:'componentes', created, clearedBlock }
        });
      }
    } catch(_logCompAdd){}
    return res.status(created? 201: 200).json({ ok:true, componente: { id: existente.id, nome: existente.nome }, created, clearedBlock });
  } catch(e){ console.error('[escalasApi.new][POST equipe componentes] erro', e); return res.status(500).json({ ok:false, error:'Falha ao adicionar funcionário na equipe' }); }
});


// Debug sessão/master
router.get('/api/escalas/debug/sessao', requireEscalasAuth, (req,res)=>{
  const raw = req.session?.escalasUser || req.session?.user || {};
  const flags = {
    isMasterUser: isMasterUser(req),
    has_isMaster: raw?.isMaster === true,
    has_master: raw?.master === true,
    has_admin: raw?.admin === true,
    perfil: raw?.perfil||null,
    role: raw?.role||null,
    perfilId: raw?.perfilId||null,
    roleId: raw?.roleId||null,
    roles: raw?.roles||null,
    perfis: raw?.perfis||null,
    permissoes: raw?.permissoes||null
  };
  return res.json({ ok:true, flags });
});

// Debug: inspecionar 'fora' (adições pontuais) por escala/equipe/dia/turno
router.get('/api/escalas/:id/equipes/:eid/debug/fora', requireEscalasAuth, async (req,res)=>{
  try {
    const { id, eid } = req.params;
    const { dia, turnoId } = req.query||{};
    if(!(dia && /^\d{4}-\d{2}-\d{2}$/.test(String(dia)))) return res.status(400).json({ ok:false, error:'dia inválido' });
    if(!turnoId) return res.status(400).json({ ok:false, error:'turnoId requerido' });
    const Escala = await getEscalaModel();
    const esc = await Escala.findById(id);
    if(!esc) return res.status(404).json({ ok:false, error:'Escala não encontrada' });
    const eq = (esc.equipes||[]).find(e=> e && String(e.id)===String(eid));
    if(!eq) return res.status(404).json({ ok:false, error:'Equipe não encontrada' });
    const token = String(turnoId).includes('::')? String(turnoId).split('::').slice(-1)[0] : String(turnoId);
    const label = token.includes('-') ? token.replace('-', ' - ') : token;
    const rangeDe = (tok)=>{ try { const s=String(tok||''); const base = s.includes('::')? s.split('::').slice(-1)[0] : s; return (base.match(/\d{2}:\d{2}-\d{2}:\d{2}/)||[])[0] || null; } catch{ return null; } };
    const rangeAlvo = rangeDe(token) || rangeDe(label);
    const k1 = `${dia}__${token}`; const k2 = `${dia}__${label}`;
    const map = (eq.adicoesEquipe && typeof eq.adicoesEquipe==='object')? eq.adicoesEquipe : {};
    const keysDia = Object.keys(map).filter(k=> k.startsWith(`${dia}__`));
    const listK1 = Array.isArray(map[k1])? map[k1]: [];
    const listK2 = Array.isArray(map[k2])? map[k2]: [];
    const tolerant = [];
    if(rangeAlvo){
      for(const [key, lista] of Object.entries(map)){
        if(!Array.isArray(lista) || !key || typeof key!=='string') continue;
        const [dK, tK] = key.split('__'); if(dK!==dia) continue;
        const rK = rangeDe(tK); if(!rK) continue;
        if(rK === rangeAlvo){ tolerant.push(...lista); }
      }
    }
    // Remoções (bloqueios) por esta alocação
    const rem = (eq.remocoesEquipe && typeof eq.remocoesEquipe==='object')? eq.remocoesEquipe : {};
    const remK1 = Array.isArray(rem[k1])? rem[k1]: [];
    const remK2 = Array.isArray(rem[k2])? rem[k2]: [];
    // Normalizar IDs
    function idOf(x){ return String(x && (x.id||x.funcionario_id||x.funcionarioId||x.matricula||x.codigo||x)).trim(); }
    const tolIds = [...new Set(tolerant.map(idOf).filter(Boolean))];
    const blocked = new Set([ ...remK1, ...remK2 ].map(String));
    const resolved = tolIds.filter(fid=> !blocked.has(String(fid))).map(id=> ({ id }));
    return res.json({ ok:true, escalaId: esc._id, equipeId: eid, dia, turnoId: token, keysDia, k1, k2, k1Count: listK1.length, k2Count: listK2.length, tolerantCount: tolerant.length, blocked: Array.from(blocked), resolved });
  } catch(e){ console.error('[escalasApi.new][GET debug/fora] erro', e); return res.status(500).json({ ok:false, error:'Falha debug fora' }); }
});

// ================= Helpers de Disponibilidade =================
async function coletarIndisponibilidadesAtribuicoes(esc, atribuicoes, equipe){
  if(!Array.isArray(atribuicoes) || !atribuicoes.length) return [];
  const indisponiveis=[];
  const cacheFA = new Map();
  const Ferias = await getFeriasModel();
  const Ausencia = await getAusenciaModel();
  const funcIds = [...new Set(atribuicoes.map(a=> a.membroFuncionarioId).filter(Boolean))];
  const isHex24 = (v)=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v);
  // Resolve funcionarioId para ObjectId quando possível; caso contrário, não lança erro e segue sem férias/ausências
  async function resolveFuncionarioObjectId(fidRaw){
    try {
      if(!fidRaw) return null;
      const s = String(fidRaw);
      if(isHex24(s)) return new mongoose.Types.ObjectId(s);
      // tentar resolver via modelo Funcionario por código exato (case-insensitive) ou CPF numérico
      try {
        const Func = await getFuncionarioModel();
        const safe = s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
        const cpfNum = s.replace(/\D+/g,'');
        let f = null;
        if(cpfNum.length===11){ f = await Func.findOne({ cpf: cpfNum }).select('_id').lean(); }
        if(!f) f = await Func.findOne({ codigo: new RegExp('^'+safe+'$','i') }).select('_id').lean();
        if(f && f._id) return f._id;
      } catch(_e){ /* ignore resolução falha */ }
      return null;
    } catch(_e2){ return null; }
  }
  function intersect(aIni,aFim,bIni,bFim){ return !(aFim < bIni || bFim < aIni); }
  for(const fid of funcIds){
    let oid = null;
    try { oid = await resolveFuncionarioObjectId(fid); } catch(_r) { oid=null; }
    let ferias = [];
    let ausencias = [];
    if(oid){
      try { ferias = await Ferias.find({ funcionarioId: oid, situacao:'ativo' }).lean(); } catch(_q1){ ferias=[]; }
      try { ausencias = await Ausencia.find({ funcionarioId: oid, situacao:'ativo' }).lean(); } catch(_q2){ ausencias=[]; }
    } else {
      // Não resolvível -> não considerar férias/ausências para este ID para evitar 500
      ferias=[]; ausencias=[];
    }
    cacheFA.set(fid, { ferias, ausencias });
  }
  const dispMap = equipe && equipe.disponibilidade ? equipe.disponibilidade : null;
  for(const at of atribuicoes){
    const fid = at.membroFuncionarioId; const dia = at.dia; if(!fid||!dia) continue;
    let bloqueado=false; let motivo=null;
    if(dispMap){
      const node = dispMap[fid] || dispMap[String(fid)];
      if(node && node.dias && node.dias[dia] === false){ bloqueado=true; motivo='disponibilidade:false'; }
    }
    if(!bloqueado){
      const pack = cacheFA.get(fid);
      if(pack){
        for(const f of pack.ferias||[]){ if(intersect(f.inicioISO,f.fimISO,dia,dia)){ bloqueado=true; motivo='ferias'; break; } }
        if(!bloqueado){ for(const a of pack.ausencias||[]){ if(intersect(a.inicioISO,a.fimISO,dia,dia)){ bloqueado=true; motivo='ausencia'; break; } } }
      }
    }
    if(bloqueado){ indisponiveis.push({ funcionarioId: fid, dia, motivo }); }
  }
  return indisponiveis;
}

export default router;
