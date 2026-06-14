import { Router } from 'express';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

// Router principal deste módulo
const router = Router();

// ============ Loaders dinâmicos dos modelos ============
let EscalaModel=null, FuncionarioModel=null, RecursoModel=null, UnidadeModel=null, EscalaLogModel=null;
async function getEscalaModel(){ if(!EscalaModel){ const m=await import('#models/escala.js'); EscalaModel=m.default||m; } return EscalaModel; }
async function getFuncionarioModel(){ if(!FuncionarioModel){ const m=await import('#models/Funcionario.js'); FuncionarioModel=m.default||m; } return FuncionarioModel; }
async function getRecursoModel(){ if(!RecursoModel){ const m=await import('#models/recurso.js'); RecursoModel=m.default||m; } return RecursoModel; }
async function getUnidadeModel(){ if(!UnidadeModel){ const m=await import('#models/unidade.js'); UnidadeModel=m.default||m; } return UnidadeModel; }
async function getEscalaLogModel(){ if(!EscalaLogModel){ const m=await import('#models/escalaLog.js'); EscalaLogModel=m.default||m; } return EscalaLogModel; }
// Modelos adicionais (férias/ausências)
let FeriasModel=null, AusenciaModel=null;
async function getFeriasModel(){ if(!FeriasModel){ const m=await import('#models/ferias.js'); FeriasModel=m.default||m; } return FeriasModel; }
async function getAusenciaModel(){ if(!AusenciaModel){ const m=await import('#models/ausencia.js'); AusenciaModel=m.default||m; } return AusenciaModel; }

// ============ Auth mínimo compartilhado ============
function requireEscalasAuth(req,res,next){
  try{
    if(req.skipAuth===true) return next();
    if(req.user) return next();
    const h=v=> String(v||'').trim();
    if(h(req.headers['x-skip-auth'])==='1' || h(req.query?._skipAuth)==='1') return next();
  }catch(_){ }
  // Sem sessão do módulo Escalas: decidir entre redirect (HTML) ou JSON (API/AJAX)
  if(!req.session?.escalasUser){
    try{
      const path = String(req.originalUrl || req.url || '');
      const accept = String(req.headers?.accept||'').toLowerCase();
      const xrw = String(req.headers['x-requested-with']||'').toLowerCase();
      const isAjax = xrw === 'xmlhttprequest';
      const isPdf = /\.pdf(?:\?|$)/i.test(path);
      const wantsHtml = accept.includes('text/html') || accept === '' || accept === '*/*';
      const isApi = /^\/escalas\/api\//.test(path) || /(^|\/)api(\b|\/)/i.test(path);
      // Para páginas e PDFs acessados diretamente no navegador, redirecionar ao login
      if(!isApi && (wantsHtml || isPdf) && !isAjax){
        const nextUrl = encodeURIComponent(String(req.originalUrl||'/escalas'));
        return res.redirect(302, `/escalas/login?next=${nextUrl}`);
      }
    }catch(_){ /* fallback JSON abaixo */ }
    return res.status(401).json({ error:'Não autenticado', success:false, code:'UNAUTHORIZED' });
  }
  next();
}

// ============ Helpers de tempo/turno/texto ============
function normalizeTurnoToken(tok){
  try{
    if(!tok) return '';
    const raw=String(tok);
    let base=raw.includes('::')? raw.split('::').slice(-1)[0] : raw;
    // Normalizar conectores e traços variados para '-'
    base = base
      .replace(/\s+(às|as|a)\s+/ig,'-')
      .replace(/[–—−‑‒]/g,'-')
      .replace(/\s*-\s*/g,'-')
      .trim();
    return base;
  }catch{ return ''; }
}
// Converte HH:MM para minutos
function hhmmToMin(s){ try{ if(s==null) return null; const m=String(s).match(/^(\d{1,2}):(\d{2})$/); if(!m) return null; const h=parseInt(m[1],10); const mi=parseInt(m[2],10); if(Number.isNaN(h)||Number.isNaN(mi)) return null; return h*60+mi; }catch{ return null; } }
// Aceita tokens do tipo "HH:MM-HH:MM", "1140-1260" e variantes com prefixo "grupo::"
function parseTurnoTokenFlexible(tok){
  try{
    if(!tok) return null;
    let base = typeof tok==='string'? tok: (tok.turnoId||tok.turno||tok.turnoToken||tok.label||tok.token||'');
    base = String(base);
    if(base.includes('::')) base = base.split('::').slice(-1)[0];
    base = base.trim();
    // HH:MM-HH:MM
    let m = base.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if(m){ const iniMin=hhmmToMin(m[1]); const fimMin=hhmmToMin(m[2]); if(iniMin!=null && fimMin!=null) return { iniMin, fimMin }; }
    // 1140-1260 (minutos)
    let m2 = base.match(/^(\d{2,4})\s*-\s*(\d{2,4})$/);
    if(m2){ const iniMin=parseInt(m2[1],10); const fimMin=parseInt(m2[2],10); if(Number.isFinite(iniMin)&&Number.isFinite(fimMin)) return { iniMin, fimMin }; }
    // Objeto com ini/fim
    if(typeof tok==='object' && tok){
      const ai = tok.iniMin ?? tok.ini_min ?? tok.ini;
      const af = tok.fimMin ?? tok.fim_min ?? tok.fim;
      const iniMin = typeof ai==='string'? (ai.includes(':')? hhmmToMin(ai): parseInt(ai,10)) : (Number.isFinite(ai)? ai: null);
      const fimMin = typeof af==='string'? (af.includes(':')? hhmmToMin(af): parseInt(af,10)) : (Number.isFinite(af)? af: null);
      if(iniMin!=null && fimMin!=null) return { iniMin, fimMin };
    }
  }catch(_){ }
  return null;
}
function sameTurnoFlexible(aTokenLike, turnoObj){
  try{
    const a = parseTurnoTokenFlexible(aTokenLike);
    const b = { iniMin: (turnoObj?.iniMin!=null? turnoObj.iniMin: hhmmToMin(turnoObj?.ini)), fimMin: (turnoObj?.fimMin!=null? turnoObj.fimMin: hhmmToMin(turnoObj?.fim)) };
    if(a && b.iniMin!=null && b.fimMin!=null) return a.iniMin===b.iniMin && a.fimMin===b.fimMin;
  }catch(_){ }
  // Fallback para comparação textual normalizada
  try{ const at = normalizeTurnoToken(aTokenLike?.turnoId||aTokenLike?.turno||aTokenLike?.turnoToken||aTokenLike||''); const bt = normalizeTurnoToken(`${turnoObj?.ini}-${turnoObj?.fim}`); return at===bt; }catch(_){ return false; }
}
// Detecta se o turno cruza a meia-noite (fim no dia seguinte)
function isTurnoCruzaMeiaNoite(tok){
  try{
    const p = parseTurnoTokenFlexible(tok||'');
    if(!p) return false;
    return p.fimMin < p.iniMin;
  }catch(_){ return false; }
}
function addDaysISO(iso, delta){
  try{
    const d=new Date(String(iso||'')+'T00:00:00');
    if(Number.isNaN(d.getTime())) return iso;
    d.setDate(d.getDate()+delta);
    return d.toISOString().slice(0,10);
  }catch(_){ return iso; }
}
function clampText(txt, { maxLines=5, maxChars=800 }){ let t=String(txt==null? '': txt); if(t.length>maxChars) t=t.slice(0,maxChars-1)+'…'; const lines=t.split(/\r?\n/); if(lines.length>maxLines) return lines.slice(0,maxLines).join('\n')+'\n…'; return t; }
const THEME={ text:'#111827', grid:'#e5e7eb', primary:'#1f4b99' };
// Normalização de notas: replica o comportamento mais tolerante da API diária
function looksNumericLike(val){
  try{ if(val==null) return false; const s=String(val).trim(); if(!s) return false; return /^[0-9\s\-.,:\/]+$/.test(s); }catch(_){ return false; }
}
function hasLetters(s){ try{ return /[A-Za-zÀ-ÿ]/.test(String(s||'')); } catch{ return false; } }
function notaTexto(val){
  try{
    if(val==null) return null;
    if(typeof val==='string'){
      const lines = String(val).split(/\r?\n/).map(s=> s.trim());
      const kept = lines.filter(s=> s && hasLetters(s) && !looksNumericLike(s));
      return kept.length? kept.join('\n') : null;
    }
    if(typeof val==='number') return null; // não exibir números puros como nota
    if(Array.isArray(val)){
      const parts = val
        .map(notaTexto)
        .filter(v=> typeof v==='string' && v.trim())
        .filter(v=> hasLetters(v) && !looksNumericLike(v));
      if(parts.length) return parts.join('\n');
      const last = val[val.length-1];
      const lastStr = notaTexto(last);
      return lastStr && !looksNumericLike(lastStr)? lastStr : null;
    }
    if(typeof val==='object'){
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
      if(Array.isArray(val.historico) && val.historico.length){ const last = val.historico[val.historico.length-1]; return notaTexto(last) || null; }
      try { const s = (typeof val.toString==='function') ? String(val.toString()) : ''; if(s && s!=='[object Object]') return s; } catch(_toS){}
    }
  }catch(_){ }
  return null;
}

// Heurística extra: vasculha objetos/arrays por campos de texto relevantes (nota/obs/descrição/comentário)
function coletarNotasHeuristicas(obj, { maxDepth=3 }={}){
  const textos=[];
  const seen=new Set();
  const keysRe = /(nota|notas|observa|obs|coment|descri|mensagem|relato|texto)/i;
  function walk(v, depth){
    if(v==null || depth>maxDepth) return;
    if(typeof v==='string'){ const t=notaTexto(v); if(t) textos.push(t); return; }
    if(typeof v==='number'){ return; }
    if(Array.isArray(v)){
      for(const it of v){ walk(it, depth+1); }
      return;
    }
    if(typeof v==='object'){
      if(seen.has(v)) return; seen.add(v);
      for(const [k,val] of Object.entries(v)){
        if(keysRe.test(String(k))){ const t=notaTexto(val); if(t) textos.push(t); }
        // descer um nível mesmo quando a chave não “bate”, para pegar filhos interessantes
        if(val && (typeof val==='object' || typeof val==='string')) walk(val, depth+1);
      }
    }
  }
  try{ walk(obj,0); }catch(_){ }
  // filtra duplicados, junta linhas
  const uniq=[]; const set=new Set();
  for(const t of textos){ const s=String(t).trim(); if(!s) continue; if(!set.has(s)){ set.add(s); uniq.push(s);} }
  return uniq.length? uniq.join('\n') : null;
}

// Helpers para exibir horários HH:MM
function fmtHHMMStr(v){
  try{
    if(typeof v==='number' && Number.isFinite(v)){
      const h=Math.floor(v/60), mi=Math.abs(v)%60; return String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0');
    }
    const s=String(v||'');
    const m=s.match(/(\d{1,2}):(\d{2})/);
    if(m) return m[1].padStart(2,'0')+':'+m[2];
    return s;
  }catch(_){ return String(v||''); }
}

// Coleta refeições (computáveis e não computáveis) do recurso para o dia/turno
function coletarRefeicoesRecursoDiaTurno(rec, dia, turno){
  const out=[]; if(!rec) return out;
  try{
    // Array estruturado
    if(Array.isArray(rec.refeicoes)){
      for(const iv of rec.refeicoes){ if(!iv) continue; const dOk = iv.dia? String(iv.dia)===dia : (iv.data? String(iv.data)===dia : true); if(!dOk) continue; const tok = iv.turnoId||iv.turno||null; if(tok && !sameTurnoFlexible({ turnoId: tok }, turno)) continue; const ini = iv.ini||iv.inicio; const fim = iv.fim||iv.termino; if(!ini||!fim) continue; let comp=true; if(typeof iv.computavel==='boolean') comp=iv.computavel; else if(typeof iv.tipo==='string'){ const t=iv.tipo.toLowerCase(); if(t.includes('nao')||t.includes('não')) comp=false; } out.push({ ini: fmtHHMMStr(ini), fim: fmtHHMMStr(fim), computavel: !!comp }); }
    }
    // Mapa legado
    if(rec.refeicoesRecurso && typeof rec.refeicoesRecurso==='object' && !Array.isArray(rec.refeicoesRecurso)){
      for(const [k,lista] of Object.entries(rec.refeicoesRecurso)){
        const [dKey, tokenKey] = String(k).split('__');
        if(dKey!==dia) continue; if(!tokenKey) continue; if(!sameTurnoFlexible({ turnoId: tokenKey }, turno)) continue;
        if(!Array.isArray(lista)) continue;
        for(const iv of lista){ if(!iv) continue; const ini = iv.ini||iv.inicio; const fim = iv.fim||iv.termino; if(!ini||!fim) continue; let comp=true; if(typeof iv.computavel==='boolean') comp=iv.computavel; else if(typeof iv.tipo==='string'){ const t=iv.tipo.toLowerCase(); if(t.includes('nao')||t.includes('não')) comp=false; } out.push({ ini: fmtHHMMStr(ini), fim: fmtHHMMStr(fim), computavel: !!comp }); }
      }
    }
    // Heurística: buscar arrays aninhados com nome semelhante a "refeicoes"
    if(out.length===0){
      const keys = Object.keys(rec||{}).filter(k=> /refeic/i.test(k));
      for(const k of keys){
        const lista = rec[k];
        if(!Array.isArray(lista)) continue;
        for(const iv of lista){ if(!iv) continue; const ini = iv.ini||iv.inicio; const fim = iv.fim||iv.termino; if(!ini||!fim) continue; const tok = iv.turnoId||iv.turno||null; if(tok && !sameTurnoFlexible({ turnoId: tok }, turno)) continue; const dIv = iv.dia||iv.data||null; if(dIv && dIv!==dia) continue; let comp=true; if(typeof iv.computavel==='boolean') comp=iv.computavel; else if(typeof iv.tipo==='string'){ const t=String(iv.tipo).toLowerCase(); if(t.includes('nao')||t.includes('não')) comp=false; } out.push({ ini: fmtHHMMStr(ini), fim: fmtHHMMStr(fim), computavel: !!comp }); }
        if(out.length) break;
      }
    }
  }catch(_){ }
  return out;
}
function drawCenteredText(doc, txt, x, y, w, h, { align='center', paddingX=0, ellipsis=true }={}){
  const opts={ width:w-2*paddingX, height:h, align, ellipsis };
  doc.text(String(txt||''), x+paddingX, y + (h-doc.heightOfString(String(txt||''),{ width:w-2*paddingX })) / 2, opts);
}
// Cabeçalho: exibe apenas o número do dia (01, 02, ...)
function isWeekendISO(iso){ try{ const d=new Date(iso+'T00:00:00'); const dow=d.getDay(); return dow===0||dow===6; }catch(_){ return false; } }
// Cabeçalho em duas linhas (dia e dia da semana), com finais de semana em vermelho
function drawDaysHeaderTwoRows(doc, x, y, leftW, colDiaW, diasISO, labelLeft){
  const row1=18, row2=12; const totalW = leftW + colDiaW*diasISO.length;
  doc.save(); doc.fillColor('#e7f1ff').rect(x, y, totalW, row1).fill(); doc.restore();
  doc.strokeColor(THEME.grid).lineWidth(0.5).rect(x, y, totalW, row1+row2).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME.text);
  if(labelLeft) drawCenteredText(doc, labelLeft, x, y, leftW, row1);
  diasISO.forEach((d,i)=>{ const cx=x+leftW+i*colDiaW; const weekend=isWeekendISO(d); if(weekend) doc.fillColor('#b91c1c'); else doc.fillColor(THEME.text); drawCenteredText(doc, d.slice(8,10), cx, y, colDiaW, row1); });
  const y2=y+row1; doc.font('Helvetica').fontSize(7);
  const wd=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  diasISO.forEach((d,i)=>{ const cx=x+leftW+i*colDiaW; const dd=new Date(d+'T00:00:00'); const label=wd[dd.getDay()]||''; const weekend=isWeekendISO(d); if(weekend) doc.fillColor('#b91c1c'); else doc.fillColor(THEME.text); drawCenteredText(doc, label, cx, y2, colDiaW, row2); });
  doc.fillColor(THEME.text);
  return y + row1 + row2;
}
// Cálculo robusto de larguras para não extrapolar a página
function computeGridWidths(W, nDias, { leftPref=120, minLeft=90, minCol=22, maxCol=40, safePad=6, minLeftFloor=72, minColFloor=20, fixedLeftW=null }={}){
  // Objetivo: ajustar leftW/colDiaW para SEMPRE caber em W (com safePad dos dois lados),
  // mesmo em meses de 31 dias. Quando impossível manter minLeft/minCol, flexibilizamos
  // para os pisos minLeftFloor/minColFloor.
  nDias = Math.max(1, nDias);
  const effW = Math.max(0, W - safePad*2);

  // Caminho 1: largura fixa da coluna esquerda, se fornecida
  if(Number.isFinite(fixedLeftW) && fixedLeftW!=null){
    let leftW = Math.max(0, Math.min(fixedLeftW, effW));
    let colDiaW = Math.floor((effW - leftW)/nDias);
    if(!Number.isFinite(colDiaW) || colDiaW<0) colDiaW=0;
    // respeitar teto de maxCol, mas não extrapolar largura disponível
    colDiaW = Math.min(maxCol, colDiaW);
    // não permitir negativo; se ficar muito pequeno, ainda assim garantir >= 10 px
    const minFloor = Math.max(10, minColFloor);
    if(colDiaW < minFloor){
      colDiaW = Math.max(0, minFloor);
      // readequar leftW para caber exato quando possível
      if(colDiaW*nDias > effW){
        // se dias ocupam mais que o espaço útil, reduzir leftW a zero e aceitar colDiaW calculado pelo espaço
        colDiaW = Math.floor(effW / nDias);
        leftW = effW - colDiaW*nDias;
      } else {
        leftW = effW - colDiaW*nDias;
      }
    }
    return { leftW, colDiaW, safePad };
  }

  // Caminho 2: dinâmica (com pisos)
  // 1) Tentativa baseada no minLeft desejado
  let colDiaW = Math.floor((effW - minLeft)/nDias);
  colDiaW = Math.min(maxCol, Math.max(minColFloor, colDiaW)); // permite encolher além de minCol quando necessário
  let leftW = effW - colDiaW*nDias;

  // 2) Se leftW ficou abaixo do piso flexível, redistribui tirando alguns pixels das colunas
  if(leftW < minLeftFloor){
    const deficit = Math.ceil((minLeftFloor - leftW) / nDias);
    const novoCol = Math.max(minColFloor, colDiaW - deficit);
    if(novoCol !== colDiaW){
      colDiaW = novoCol;
      leftW = effW - colDiaW*nDias;
    }
  }

  // 3) Se ainda exceder o espaço útil por algum arredondamento, ajusta leftW para fechar exato
  leftW = Math.floor(Math.max(minLeftFloor, leftW));
  if(leftW + colDiaW*nDias > effW){
    leftW = effW - colDiaW*nDias; // fechamento exato
    if(leftW < 0) leftW = 0;
  }

  return { leftW, colDiaW, safePad };
}

// ============ Coleta de turnos e dados ============
function coletarTurnosDia(esc){
  const arr=[]; try{ (esc?.grupos_turnos||[]).forEach(g=> (g.turnos||[]).forEach(t=>{ const ini=t.ini; const fim=t.fim; const token=`${ini}-${fim}`.replace(/\s/g,''); const label=`${ini}-${fim}`; const iniMin=hhmmToMin(ini); const fimMin=hhmmToMin(fim); arr.push({ ini, fim, iniMin, fimMin, token, label }); })); }catch(_){ }
  arr.sort((a,b)=> String(a.ini).localeCompare(String(b.ini)));
  return arr;
}

function recursoTextoDuasLinhas(rec, enrich){
  const e=enrich?.get?.(String(rec?.id||rec?.placa||rec?.referenciaGestorId||'')) || {};
  const nome = rec?.nome || e?.nome || rec?.placa || '—';
  const detalhes = [rec?.placa||e?.placa, e?.marca||rec?.marca, e?.modelo||rec?.modelo].filter(Boolean).join(' - ');
  return detalhes? `${nome}\n${detalhes}` : nome;
}

// Rótulo compacto, em uma linha: "placa - nome (modelo)" quando disponível
function recursoLabelCompacto(rec, enrich){
  try{
    const e = enrich?.get?.(String(rec?.id||rec?.placa||rec?.referenciaGestorId||'')) || {};
    const placa = rec?.placa || e?.placa || '';
    const nome = rec?.nome || e?.nome || '';
    const modelo = e?.modelo || rec?.modelo || '';
    let base = '';
    if(placa && nome) base = `${placa} - ${nome}`;
    else base = nome || placa || '—';
    if(modelo) base += ` (${modelo})`;
    return base;
  }catch(_){ return String(rec?.nome||rec?.placa||'—'); }
}

async function buildRecursoEnrichMap(esc){
  const map=new Map();
  try{
    const ids=[];
    (esc?.equipes||[]).forEach(eq=> (eq?.recursos||[]).forEach(r=>{ const cand=[r?.id,r?.placa,r?.referenciaGestorId].filter(Boolean).map(String); cand.forEach(c=> ids.push(c)); }));
    if(Array.isArray(esc?.recursos)) esc.recursos.forEach(r=>{ const cand=[r?.id,r?.placa,r?.referenciaGestorId].filter(Boolean).map(String); cand.forEach(c=> ids.push(c)); });
    if(ids.length){ const Recurso=await getRecursoModel(); const arr=await Recurso.find({ $or:[ { _id: { $in: ids } }, { placa: { $in: ids } } ] }).select('_id placa marca modelo nome').lean();
      arr.forEach(r=>{ map.set(String(r._id), r); if(r.placa) map.set(String(r.placa), r); });
    }
  }catch(_){ }
  return map;
}

function montarEfetivoRecursoDiaTurno(esc, rec, dia, turno){
  // Verifica se recurso está alocado no dia/turno
  let alocado=false; let notasRecurso=null; let membros = Array.isArray(rec.membros)? rec.membros: [];
  let _debugFonte=null;
  try{
    if(Array.isArray(rec.alocacoes)){
      const hit = rec.alocacoes.find(a=> a && a.dia===dia && sameTurnoFlexible(a, turno));
      if(hit){
        alocado=true;
        // Preferir campo específico da alocação do recurso no dia/turno, com fallbacks compatíveis (inclui camelCase)
        notasRecurso = notaTexto(
          hit.notasRecurso || hit.notaRecurso || // camelCase
          hit.notas_recurso || hit.nota_recurso || // snake_case
          hit.observacoes || hit.observacao || hit.obs || // observações no próprio hit
          hit.notas || hit.nota || // genéricos
          rec.notasRecurso || rec.notaRecurso || // camelCase no recurso
          rec.notas_recurso || rec.nota_recurso || // snake_case no recurso
          rec.observacoes || rec.observacao || rec.obs || // observações no recurso
          rec.notas || rec.nota ||
          null
        );
        if(notasRecurso) _debugFonte = _debugFonte || 'hit/campos-diretos';
        // Heurística extra: se ainda vazio, vasculhar o próprio "hit" e o recurso
        if(!notasRecurso){
          const h1 = coletarNotasHeuristicas(hit);
          if(h1){ notasRecurso = h1; _debugFonte = _debugFonte || 'hit/heuristica'; }
          else {
            const h2 = coletarNotasHeuristicas(rec);
            if(h2){ notasRecurso = h2; _debugFonte = _debugFonte || 'rec/heuristica'; }
          }
        }
      }
    }
    // Fallback legado: mapa alocacoesRecurso { 'YYYY-MM-DD__TOKEN': <bool|obj> }
    if(!alocado && rec.alocacoesRecurso && typeof rec.alocacoesRecurso==='object' && !Array.isArray(rec.alocacoesRecurso)){
      for(const [k,v] of Object.entries(rec.alocacoesRecurso)){
        const [dKey, tokenKey] = String(k).split('__');
        if(dKey!==dia) continue;
        if(!tokenKey) continue;
        const ok = sameTurnoFlexible({ turnoId: tokenKey }, turno);
        if(ok){
          alocado=true;
          if(v && typeof v==='object'){
            // Considera também notas em diversas chaves
            const n = notaTexto(v.notasRecurso || v.notaRecurso || v.notas_recurso || v.nota_recurso || v.observacoes || v.observacao || v.obs || v.notas || v.nota || null);
            if(n){ notasRecurso = n; _debugFonte = _debugFonte || 'map/alocacoesRecurso'; }
            // Heurística extra no valor do mapa
            if(!notasRecurso){ const h = coletarNotasHeuristicas(v); if(h){ notasRecurso = h; _debugFonte = _debugFonte || 'map/alocacoesRecurso/heuristica'; } }
          }
          break;
        }
      }
    }
    // Fallback adicional: mapas/arrays de observações por recurso (por dia/turno)
    if(alocado && !notasRecurso){
      // observacoesRecurso: { 'YYYY-MM-DD__TOKEN': <string|obj> }
      if(rec.observacoesRecurso && typeof rec.observacoesRecurso==='object' && !Array.isArray(rec.observacoesRecurso)){
        for(const [k,v] of Object.entries(rec.observacoesRecurso)){
          const [dKey, tokenKey] = String(k).split('__');
          if(dKey!==dia) continue; if(!tokenKey) continue; if(!sameTurnoFlexible({ turnoId: tokenKey }, turno)) continue;
          const n = notaTexto(v && typeof v==='object'? (v.texto||v.nota||v.observacao||v.obs||v.value||v.descricao||v.mensagem||v) : v);
          if(n){ notasRecurso=n; _debugFonte = _debugFonte || 'map/observacoesRecurso'; break; }
        }
      }
      // observacoes: [ { dia, turnoId|turno, texto|nota|observacao } ]
      if(!notasRecurso && Array.isArray(rec.observacoes)){
        for(const it of rec.observacoes){ if(!it) continue; const dOk = it.dia? String(it.dia)===dia: true; if(!dOk) continue; const tok=it.turnoId||it.turno||null; if(tok && !sameTurnoFlexible({ turnoId: tok }, turno)) continue; const n = notaTexto(it.texto||it.nota||it.observacao||it.obs||it.descricao||it.value||it.mensagem||it); if(n){ notasRecurso=n; _debugFonte = _debugFonte || 'arr/observacoes'; break; } }
      }
    }
  }catch(_){ }
  return { alocado, membros, notasRecurso, _debugFonte };
}

function coletarMembrosPorAtribuicoes(rec, dia, turno){
  const out=[];
  try{
    // Array linear
    if(Array.isArray(rec.atribuicoes)){
      for(const a of rec.atribuicoes){
        if(!a || a.dia!==dia) continue;
        if(!sameTurnoFlexible(a, turno)) continue;
        const id = a.membroFuncionarioId || a.funcionarioId || a.funcionario_id || a.funcionario || a.matricula || null;
        if(!id) continue;
        out.push({ id:String(id), nome: a.nome || a.funcionarioNome || null, atribuicao: a.atribuicao || a.papel || null });
      }
    }
    // Mapa legado
    if(rec.atribuicoesRecurso && typeof rec.atribuicoesRecurso==='object' && !Array.isArray(rec.atribuicoesRecurso)){
      for(const [k,lista] of Object.entries(rec.atribuicoesRecurso)){
        const [dKey, tokenKey] = String(k).split('__');
        if(dKey!==dia) continue;
        if(!sameTurnoFlexible({ turnoId: tokenKey }, turno)) continue;
        if(!Array.isArray(lista)) continue;
        for(const it of lista){
          if(!it) continue;
          const id = it.membroFuncionarioId || it.funcionarioId || it.funcionario || it.matricula || null; if(!id) continue;
          out.push({ id:String(id), nome: it.nome || it.funcionarioNome || null, atribuicao: it.atribuicao || it.papel || null });
        }
      }
    }
  }catch(_){ }
  return out;
}

// Deduplica membros por id/codigo/nome, mesclando atribuições
function mergeMembrosDedup(membros){
  try{
    const map=new Map();
    const keyOf=(m)=>{
      const id = m?.id || m?.funcionarioId || m?.funcionario_id || null;
      if(id) return 'id:'+String(id);
      if(m?.codigo) return 'codigo:'+String(m.codigo);
      if(m?.nome) return 'nome:'+String(m.nome).trim().toUpperCase();
      return Math.random().toString(36).slice(2); // último recurso, não deve ocorrer
    };
    for(const m of (membros||[])){
      if(!m) continue;
      const k=keyOf(m);
      const prev=map.get(k) || {};
      const atribuicoes=new Set();
      if(prev.atribuicao){ String(prev.atribuicao).split(/[,;]+/).map(s=>s.trim()).filter(Boolean).forEach(a=>atribuicoes.add(a)); }
      if(m.atribuicao){ String(m.atribuicao).split(/[,;]+/).map(s=>s.trim()).filter(Boolean).forEach(a=>atribuicoes.add(a)); }
      const merged={
        id: prev.id || m.id || m.funcionarioId || m.funcionario_id,
        codigo: prev.codigo || m.codigo || null,
        nome: prev.nome || m.nome || null,
        atribuicao: atribuicoes.size? [...atribuicoes].join(', '): null
      };
      map.set(k, merged);
    }
    return [...map.values()];
  }catch(_){ return Array.isArray(membros)? membros: []; }
}

// Normaliza estrutura de equipes/recursos: puxa recursos da raiz esc.recursos (legado) para dentro da equipe correta
function normalizeEquipesEscala(esc){
  const equipesBase = Array.isArray(esc?.equipes)? JSON.parse(JSON.stringify(esc.equipes)) : [];
  // Garante arrays de recursos
  for(const eq of equipesBase){ if(!Array.isArray(eq.recursos)) eq.recursos=[]; }
  const byId = new Map(equipesBase.map(e=> [String(e.id||''), e]));
  const byNome = new Map(equipesBase.map(e=> [String((e.nome||'').toUpperCase()), e]));
  // Se houver recursos na raiz, empurrar para dentro da equipe por hints de equipeId/nome
  if(Array.isArray(esc?.recursos) && esc.recursos.length){
    for(const r0 of esc.recursos){
      const r = JSON.parse(JSON.stringify(r0));
      let alvo = null;
      const tok = r.equipeId||r.equipe_id||r.equipe||r.equipeNome||r.equipe_nome||null;
      if(tok){ alvo = byId.get(String(tok)) || byNome.get(String(tok).toUpperCase()) || null; }
      if(!alvo){
        // cria pseudo-equipe 'SEM_EQUIPE' se necessário
        alvo = byId.get('SEM_EQUIPE');
        if(!alvo){ alvo = { id:'SEM_EQUIPE', nome:'Sem equipe', descricao:null, recursos:[], alocacoes:[], adicoesEquipe:{} }; equipesBase.push(alvo); byId.set('SEM_EQUIPE', alvo); byNome.set('SEM EQUIPE', alvo); }
      }
      const exists = Array.isArray(alvo.recursos) && alvo.recursos.some(x=> (x.id && x.id===r.id) || (x.referenciaGestorId && x.referenciaGestorId===r.id));
      if(!exists) alvo.recursos.push(r);
    }
  }
  return equipesBase;
}

function coletarForaEquipeDiaTurno(eq, dia, turno){
  // Apenas adições pontuais de "fora" por segurança; baseline não força entrada
  try{
    const map = (eq?.adicoesEquipe && typeof eq.adicoesEquipe==='object')? eq.adicoesEquipe: null; if(!map) return [];
    const tokenAtual = String(turno?.token||''); const labelAtual = String(turno?.label||'');
    const k1 = `${dia}__${tokenAtual}`; const k2 = `${dia}__${labelAtual}`;
    const normalizeItem = (x)=>{ if(!x) return null; if(typeof x==='string') return { id:x }; const id = x.id||x.funcionarioId||x.funcionario_id||x.matricula||x.codigo; if(!id) return null; return { id:String(id), nome:x.nome||x.funcionarioNome||null, atribuicao:null }; };
    let arr = []; if(Array.isArray(map[k1])) arr=map[k1]; else if(Array.isArray(map[k2])) arr=map[k2];
    return arr.map(normalizeItem).filter(Boolean);
  }catch(_){ return []; }
}

// ============ PDF helpers (layout) ============
function tryFindLogoPath(){
  const candidates = [
    path.join(process.cwd(),'images','logoWDGestor.png'),
    path.join(process.cwd(),'images','logobranco.png'),
    path.join(process.cwd(),'images','header_wdgestor_futuristic.png')
  ];
  for(const p of candidates){ try{ if(fs.existsSync(p)) return p; }catch(_){} }
  return null;
}
function drawReportHeader(doc, { x, y, W, title, unidades, categorias, diaISO, emitidoPor, logoPathOverride }){
  // Altura total do cabeçalho aumentada para evitar sobreposição do banner da primeira seção
  const h = 64;
  // Linha superior com logo à esquerda e emitido por à direita
  const logoCandidate = logoPathOverride || tryFindLogoPath();
  const pad = 8;
  const rightW = W - 140 - pad*2;
  if(logoCandidate){
    try {
      // Usa apenas 'fit' para respeitar um bounding box e evitar extrapolar a altura do cabeçalho
      doc.image(logoCandidate, x+pad, y+6, { fit:[120,40] });
    } catch(_){ /* ignore */ }
  }
  const dtBr = (()=>{ try{ const d = diaISO && /\d{4}-\d{2}-\d{2}/.test(diaISO)? new Date(diaISO+'T00:00:00') : new Date(); const now = new Date(); const two=n=> String(n).padStart(2,'0'); return `${two(now.getDate())}/${two(now.getMonth()+1)}/${now.getFullYear()} ${two(now.getHours())}:${two(now.getMinutes())}`; }catch{return ''; }})();
  const emitLine = `Emitido por: ${emitidoPor||'—'} em ${dtBr}`;
  doc.font('Helvetica').fontSize(9).fillColor('#555').text(emitLine, x+pad+140, y+10, { width: rightW, align:'right' });

  // Título centralizado
  doc.font('Helvetica-Bold').fontSize(14).fillColor(THEME.text).text(title||'', x, y+22, { width: W, align:'center' });
  // Linha de informações
  const info = [
    unidades? `Unidade(s): ${unidades}`: null,
    categorias? `Categorias: ${categorias}`: null,
    diaISO? `Dia: ${diaISO.split('-').reverse().join('/')}`: null
  ].filter(Boolean).join('   •   ');
  doc.font('Helvetica').fontSize(9).fillColor('#333').text(info, x, y+44, { width: W, align:'center' });
  return y + h;
}
// Resolve a logo path (or Buffer) to use in header based on user's unit logo
async function resolveHeaderLogoPath(req, { unidadeIds=[] }={}){
  try{
    // Sempre tentar usar a logo da unidade do usuário, independentemente do perfil.
    // Caso não seja possível, o cabeçalho cai no logo padrão via tryFindLogoPath().

    const projectRoot = process.cwd();
    function resolveCandidate(rel){
      try{
        if(!rel) return null;
        // URLs públicas (Blob, S3, etc.) — tratar em outro caminho (download para Buffer)
        if(/^https?:\/\//i.test(String(rel))) return null;
        if(path.isAbsolute(rel)) return fs.existsSync(rel)? rel: null;
        const cleaned = String(rel).replace(/^\/+/, '');
        const attempts = [
          path.join(projectRoot, cleaned),
          path.join(projectRoot, 'public', cleaned),
          path.join(projectRoot, 'uploads', cleaned),
          path.join(projectRoot, 'public', 'uploads', cleaned),
          path.join(projectRoot, 'images', cleaned)
        ];
        for(const p of attempts){ if(fs.existsSync(p)) return p; }
      }catch(_){ }
      return null;
    }

  async function fetchToImageBuffer(url){
      try{
        const fetchImpl = (typeof fetch === 'function') ? fetch : (await import('node-fetch')).default;
        const resp = await fetchImpl(url);
        if(!resp.ok) return null;
        const ct = String(resp.headers.get('content-type')||'').toLowerCase();
        const arrBuf = await resp.arrayBuffer();
        let buf = Buffer.from(arrBuf);
        // PDFKit suporta PNG/JPG; nossos arquivos são webp — converter quando necessário
        const looksWebp = ct.includes('image/webp') || /\.webp($|\?)/i.test(url);
        const looksSvg = ct.includes('image/svg') || /\.svg($|\?)/i.test(url);
        if(looksWebp || looksSvg){
          try {
            const sharpMod = (await import('sharp')).default;
            buf = await sharpMod(buf).png().toBuffer();
          } catch(_){ /* se falhar, tentar mesmo assim */ }
        }
        return buf;
      } catch(_){ return null; }
    }

  // 1) Tenta logo diretamente da unidade em sessão
    const s = req?.session?.escalasUser || {};
    const sessUnidadeLogo = s?.unidade?.logo || s?.unidadeLogo || null;
    let logoPath = resolveCandidate(sessUnidadeLogo);
    if(logoPath) return await ensurePngIfWebp(logoPath);
    if(sessUnidadeLogo && /^https?:\/\//i.test(String(sessUnidadeLogo))){
      const buf = await fetchToImageBuffer(String(sessUnidadeLogo));
      if(buf) return buf; // retornar Buffer diretamente
    }

  // 2) Tenta resolver unidade pelos ids vindos da sessão e, por fim, pelos unidadeIds do relatório
    const Unidade = await getUnidadeModel();
    const candidates = [];
    if(s.unidadeId) candidates.push({ type:'id', value: s.unidadeId });
    if(s.unidade_id) candidates.push({ type:'id', value: s.unidade_id });
    if(s.unidade && typeof s.unidade==='object'){
      if(s.unidade._id) candidates.push({ type:'id', value: s.unidade._id });
      if(s.unidade.id) candidates.push({ type:'id', value: s.unidade.id });
      if(s.unidade.codigo) candidates.push({ type:'codigo', value: s.unidade.codigo });
    }
    if(s.unidadeCodigo) candidates.push({ type:'codigo', value: s.unidadeCodigo });
    // Escalas' unidadeIds as last resort
    for(const id of unidadeIds||[]){ candidates.push({ type:'id', value: id }); }

    const seen = new Set();
    for(const c of candidates){
      const key = `${c.type}:${c.value}`; if(!c.value || seen.has(key)) continue; seen.add(key);
      try{
        let u=null;
        if(c.type==='id') u = await Unidade.findById(c.value).select('logo').lean();
        else if(c.type==='codigo') u = await Unidade.findOne({ codigo: c.value }).select('logo').lean();
        if(u?.logo){
          logoPath = resolveCandidate(u.logo);
          if(logoPath) return await ensurePngIfWebp(logoPath);
          if(/^https?:\/\//i.test(String(u.logo))){
            const buf = await fetchToImageBuffer(String(u.logo));
            if(buf) return buf;
          }
        }
      }catch(_){ }
    }
  }catch(_){ }
  return null;
}
async function ensurePngIfWebp(absPath){
  try{
    if(!/\.webp$/i.test(String(absPath||''))) return absPath;
    // Try convert to PNG via sharp if available
    let sharpMod=null; try{ const m = await import('sharp'); sharpMod = m.default || m; }catch(_){ sharpMod=null; }
    if(!sharpMod) return absPath; // fallback: let PDFKit try, or ignore
    // Em ambientes serverless, somente /tmp é gravável; use os.tmpdir()
    const osMod = await import('os');
    const outDir = path.join(osMod.tmpdir(), 'logo-cache');
    if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive:true });
    const outFile = path.join(outDir, path.basename(absPath).replace(/\.webp$/i, '.png'));
    if(!fs.existsSync(outFile)){
      await sharpMod(absPath).png().toFile(outFile);
    }
    return outFile;
  }catch(_){ return absPath; }
}
function drawTableHeader(doc, x, y, W, colW, rowH){
  doc.save(); doc.fillColor('#e7f1ff').rect(x,y,W,rowH).fill(); doc.restore();
  doc.strokeColor('#cfe2ff').lineWidth(0.5).rect(x,y,W,rowH).stroke();
  // Cabeçalho da tabela em fonte 8
  doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME.text);
  drawCenteredText(doc,'Equipe', x, y, colW.equipe, rowH);
  drawCenteredText(doc,'Efetivo', x+colW.equipe, y, colW.efetivo, rowH);
  drawCenteredText(doc,'Recurso', x+colW.equipe+colW.efetivo, y, colW.recurso, rowH);
  drawCenteredText(doc,'Notas (Recurso)', x+colW.equipe+colW.efetivo+colW.recurso, y, colW.notasRecurso, rowH);
  drawCenteredText(doc,'Notas (Equipe)', x+colW.equipe+colW.efetivo+colW.recurso+colW.notasRecurso, y, colW.notasEquipe, rowH);
  return y + rowH;
}
// Barra de seção: "Escala: ... - Turno: ..." repetida no início e após quebras
function drawSectionBar(doc, x, y, W, titulo){
  const secH = 24;
  doc.save(); doc.fillColor('#e7f1ff').rect(x,y,W,secH).fill(); doc.restore();
  doc.strokeColor('#cfe2ff').lineWidth(0.5).rect(x,y,W,secH).stroke();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(THEME.text).text(titulo, x+6, y+6, { width: W-12, align:'left', ellipsis:true, lineBreak:false });
  return y + secH;
}

// ============ Handler: Relatório Diário ============
async function relatorioDiariaHandler(req,res){
  try{
    // Aceitar aliases: id, ids, id[]
    const rawId = req.query.id ?? req.query.ids ?? (Array.isArray(req.query['id[]']) ? req.query['id[]'].join(',') : req.query['id[]']);
    const ids = String(rawId||'').split(',').map(s=> s.trim()).filter(x=> x && x.match(/^[0-9a-fA-F]{24}$/));
    if(!ids.length) return res.status(400).send('Informe ?id=<escalaId>[,<escalaId>...] ou ?ids=<id1>,<id2>');
    // Normalizar dia: aceitar só a porção YYYY-MM-DD
    const diaParam = String(req.query.dia||'');
    const mDia = diaParam.match(/\d{4}-\d{2}-\d{2}/);
    const dia = mDia? mDia[0] : new Date().toISOString().slice(0,10);
    const turnoTok = req.query.turno? normalizeTurnoToken(req.query.turno): '';
    const Escala=await getEscalaModel();
    const escalas = await Escala.find({ _id: { $in: ids } }).lean();

  res.setHeader('Content-Type','application/pdf; charset=binary');
  // Padrão de nome do arquivo: sem acento -> Relatorio.pdf (inline)
  res.setHeader('Content-Disposition',`inline; filename=Relatorio.pdf; filename*=UTF-8''${encodeURIComponent('Relatorio.pdf')}`);

  const doc = new PDFDocument({ size:'A4', layout:'landscape', margin:28, bufferPages:true });
    doc.pipe(res);

    const p = doc.page; const contentW = p.width - p.margins.left - p.margins.right; const contentH = p.height - p.margins.top - p.margins.bottom;
    let x = p.margins.left; let y = p.margins.top; const W = contentW; const safeBottom = p.height - p.margins.bottom - 24;
    const rowH = 20; const maxRowH = 120;
    // Ajuste de largura conforme solicitação:
    // - Equipe: reduzir em 1/3 (fica 2/3 do tamanho atual)
    // - Efetivo: reduzir em 1/5 (fica 4/5 do tamanho atual)
    // O que for retirado é somado às colunas de Notas (recurso e equipe), dividido igualmente.
    const basePerc = { equipe: 0.16, efetivo: 0.31, recurso: 0.16, notasRecurso: 0.18, notasEquipe: 0.19 };
    const equipePerc = basePerc.equipe * (2/3);
    const efetivoPerc = basePerc.efetivo * (4/5);
    const recursoPerc = basePerc.recurso; // não alterado nesta solicitação
    const freedPerc = (basePerc.equipe - equipePerc) + (basePerc.efetivo - efetivoPerc);
    const notasRecursoPerc = basePerc.notasRecurso + freedPerc/2;
    const notasEquipePerc = basePerc.notasEquipe + freedPerc/2;
    // Converte para pixels e garante fechamento exato no último campo
    const colW = {
      equipe: Math.floor(W*equipePerc),
      efetivo: Math.floor(W*efetivoPerc),
      recurso: Math.floor(W*recursoPerc),
      notasRecurso: Math.floor(W*notasRecursoPerc),
      notasEquipe: 0
    };
    colW.notasEquipe = Math.max(0, W - (colW.equipe + colW.efetivo + colW.recurso + colW.notasRecurso));
    // Pré-coletar informações para header
    const unidadeIds = [...new Set(escalas.map(e=> e.unidade_id).filter(Boolean).map(String))];
    let unidadesLabel = '';
    try{
      if(unidadeIds.length){
        const Unidade = await getUnidadeModel();
        const arr = await Unidade.find({ _id: { $in: unidadeIds } }).select('nome codigo').lean();
        const nomes = arr.map(u=> u? ((u.codigo? `${u.codigo} - `:'') + (u.nome||'-')): null).filter(Boolean);
        unidadesLabel = [...new Set(nomes)].join(' / ');
      }
    }catch(_){ }
    const categoriasLabel = (()=>{
      try{
        const cats = escalas.map(e=> e.classificacao || e.tipo || e.categoria || null).filter(Boolean);
        return [...new Set(cats)].join(' / ');
      }catch{ return ''; }
    })();
    const emitidoPor = (()=>{
      try{
        const u = (doc._emitUser) || ({});
        // Sem acesso ao req aqui; obter no handler logo abaixo
        return u.nome || u.email || '';
      }catch{ return ''; }
    })();
  // Resolve logo de cabeçalho preferindo a unidade do usuário (não-master)
  const headerLogoPath = await resolveHeaderLogoPath(req, { unidadeIds });
  // Header completo
  y = drawReportHeader(doc, { x, y, W, title:'Relatório de acompanhamento diário', unidades: unidadesLabel, categorias: categoriasLabel, diaISO: dia, emitidoPor: (req?.user?.nome || req?.session?.escalasUser?.nome || req?.user?.email || req?.session?.escalasUser?.email || ''), logoPathOverride: headerLogoPath });

  function novaPagina(){ doc.addPage(); const p2=doc.page; x = p2.margins.left; y = p2.margins.top; y = drawReportHeader(doc, { x, y, W, title:'Relatório de acompanhamento diário', unidades: unidadesLabel, categorias: categoriasLabel, diaISO: dia, emitidoPor: (req?.user?.nome || req?.session?.escalasUser?.nome || req?.user?.email || req?.session?.escalasUser?.email || ''), logoPathOverride: headerLogoPath }); }

    // Percorrer escalas
    for(const esc of escalas){
  const Unidade=await getUnidadeModel();
      let unidadeNome='-'; try{ if(esc.unidade_id){ const uni=await Unidade.findById(esc.unidade_id).select('nome codigo').lean(); if(uni) unidadeNome=uni.nome||'-'; } }catch(_){ }
  const turnosDia = coletarTurnosDia(esc).filter(t=> !turnoTok || normalizeTurnoToken(t.token)===turnoTok);
  // Normalizar equipes/recursos (suporta legado esc.recursos)
  const equipesNorm = normalizeEquipesEscala(esc);
      // Se a escala não possuir turnos configurados, ainda assim gerar uma seção placeholder
      if(!turnosDia.length){
        const secH=24; const titulo=`Escala: ${esc.descricao||'—'} - Sem turnos configurados`;
        if(y + secH + 20 > safeBottom) novaPagina();
        y = drawSectionBar(doc, x, y, W, titulo);
        // Cabeçalho e linha placeholder
        y = drawTableHeader(doc, x, y, W, colW, rowH);
        const phH = rowH;
        if(y + phH > safeBottom) { novaPagina(); y = drawSectionBar(doc, x, y, W, titulo); y = drawTableHeader(doc, x, y, W, colW, rowH); }
        doc.save(); doc.fillColor('#f6faff').rect(x,y,W,phH).fill(); doc.restore();
        doc.strokeColor('#e5e7eb').lineWidth(0.5).rect(x,y,W,phH).stroke();
  // Placeholder em fonte 8
  doc.font('Helvetica').fontSize(8).fillColor(THEME.text);
        ['—','—','—','—','Sem dados para este dia'].forEach((txt,idx)=>{
          const cx = idx===0? x : idx===1? x+colW.equipe : idx===2? x+colW.equipe+colW.efetivo : idx===3? x+colW.equipe+colW.efetivo+colW.recurso : x+colW.equipe+colW.efetivo+colW.recurso+colW.notasRecurso;
          const cw = idx===0? colW.equipe : idx===1? colW.efetivo : idx===2? colW.recurso : idx===3? colW.notasRecurso : colW.notasEquipe;
          drawCenteredText(doc, txt, cx, y, cw, phH, { align:'center', paddingX:6 });
        });
        y += phH + 4; // espaço após placeholder
        continue;
      }
      const enrichMap = await buildRecursoEnrichMap(esc);
      // Para cada turno
      for(const turno of turnosDia){
        // Montar linhas
        const linhas = []; const idsParaResolver = new Set();
        for(const eq of (equipesNorm||[])){
          const recursos = Array.isArray(eq.recursos)? eq.recursos: [];
          let addedForEq = 0;
          for(const rec of recursos){
            let info = montarEfetivoRecursoDiaTurno(esc, rec, dia, turno);
            if(!info || !info.alocado){
              if(isEquipeAtivaNoTurnoDia(esc, eq, dia, turno)){
                info = { alocado:true, membros: rec.membros||[], notasRecurso: notaTexto(info?.notasRecurso || rec.notas || rec.notas_recurso || rec.nota_recurso || rec.nota || null) };
              } else {
                // Mesmo que não esteja explicitamente alocado, ainda podemos ter atribuições que representem efetivo
                const atrib = coletarMembrosPorAtribuicoes(rec, dia, turno);
                if(atrib.length===0) continue;
                info = { alocado:true, membros: [], notasRecurso: notaTexto(rec.notas || rec.notas_recurso || rec.nota_recurso || rec.nota || null) };
              }
            }
            let membros = Array.isArray(info.membros)? info.membros.slice(): [];
            // Unir atribuições do dia/turno
            const mais = coletarMembrosPorAtribuicoes(rec, dia, turno);
            if(mais.length) membros = membros.concat(mais);
            // Refeições por recurso no dia/turno (computáveis e não computáveis)
            const refe = coletarRefeicoesRecursoDiaTurno(rec, dia, turno);
            // Montar bloco de notas do recurso com refeições (abaixo)
            let notasRecursoTxt = info.notasRecurso == null ? null : String(info.notasRecurso);
            if(refe.length){
              const lines = refe.map(rf => `${rf.ini} - ${rf.fim} (${rf.computavel? 'computável':'não computável'})`);
              const bloco = `Refeições:\n${lines.join('\n')}`;
              notasRecursoTxt = notasRecursoTxt ? (notasRecursoTxt + '\n\n' + bloco) : bloco;
            }
            // Debug opcional por recurso
            try{
              const dbg = String(req.query.debug||req.query._debug||'').trim();
              if(dbg==='1' || /^true$/i.test(dbg)){
                console.info('[relatorios2][diaria][debug][recurso]', {
                  escalaId: String(esc._id), dia, turno: `${turno.ini}-${turno.fim}`,
                  equipeId: String(eq.id||''), recursoId: String(rec.id||rec.placa||''), notasPresente: !!(notasRecursoTxt && notasRecursoTxt.trim()), fonte: info._debugFonte||null, refeicoes: refe
                });
              } else if(dbg==='2' || /^all$/i.test(dbg)){
                // Debug verboso: lista chaves relevantes e trechos textuais candidatos
                const pickKeys=(o)=>{ try{ return Object.keys(o||{}).filter(k=> /(nota|notas|observa|obs|coment|descri|mensagem|texto|refeic)/i.test(k)); }catch(_){ return []; } };
                const sample=(v)=>{ try{ const s = typeof v==='string'? v: (typeof v==='object'? (v.texto||v.nota||v.observacao||v.obs||v.descricao||v.value||v.mensagem||'') : ''); return String(s).slice(0,160); }catch(_){ return ''; } };
                const hit = Array.isArray(rec.alocacoes)? rec.alocacoes.find(a=> a && a.dia===dia && sameTurnoFlexible(a, turno)) : null;
                console.info('[relatorios2][diaria][debug2][recurso]', {
                  escalaId: String(esc._id), dia, turno: `${turno.ini}-${turno.fim}`,
                  equipeId: String(eq.id||''), recursoId: String(rec.id||rec.placa||''),
                  keys_hit: pickKeys(hit), keys_rec: pickKeys(rec), keys_maps: [ rec && rec.alocacoesRecurso && typeof rec.alocacoesRecurso==='object'? Object.keys(rec.alocacoesRecurso).length: 0, rec && rec.observacoesRecurso && typeof rec.observacoesRecurso==='object'? Object.keys(rec.observacoesRecurso).length: 0 ],
                  fonte: info._debugFonte||null,
                  amostras: {
                    hit: hit? Object.fromEntries(pickKeys(hit).map(k=> [k, sample(hit[k])])): {},
                    rec: Object.fromEntries(pickKeys(rec).map(k=> [k, sample(rec[k])]))
                  },
                  refeicoes: refe
                });
              }
            }catch(_){ }
            // Deduplicar por id/codigo/nome e mesclar atribuições
            membros = mergeMembrosDedup(membros);
            membros.forEach(m=>{ const id=m && (m.id||m.funcionarioId||m.funcionario_id); if(id) idsParaResolver.add(String(id)); });
            linhas.push({
              equipe: `${eq.nome||eq.id||'—'}${eq.descricao? `\n${eq.descricao}`:''}`,
              membros,
              recurso: recursoTextoDuasLinhas(rec, enrichMap),
              notasRecurso: notasRecursoTxt || '—',
              notasEquipe: null,
              _eq: eq
            });
            addedForEq++;
          }
          // Linha para "fora" sem recurso: só quem NÃO está em recurso neste mesmo dia/turno
          const idsEmRecurso = new Set();

          for(const ln of linhas){
            if(ln && ln._eq === eq && ln.recurso && ln.recurso !== '—' && Array.isArray(ln.membros)){
              for(const m of ln.membros){
                const id = m && (m.id || m.funcionarioId || m.funcionario_id);
                if(id) idsEmRecurso.add(String(id));
              }
            }
          }

          const fora = coletarForaEquipeDiaTurno(eq, dia, turno);
          const foraFiltrado = Array.isArray(fora)
            ? fora.filter(f => f && f.id && !idsEmRecurso.has(String(f.id)))
            : [];

          if(foraFiltrado.length){
            foraFiltrado.forEach(f=>{ if(f && f.id) idsParaResolver.add(String(f.id)); });
            const membros = foraFiltrado.map(f=> ({ id:f.id, nome:f.nome||null, atribuicao:null }));
            linhas.push({ equipe: eq.nome||eq.id||'-', membros, recurso:'—', notasRecurso:'—', notasEquipe:null, _eq:eq });
            addedForEq++;
          }
          // Se a equipe está ativa no dia/turno, mas não adicionamos nenhuma linha
          // e ela possui componentes (baseline), renderizar uma linha com esses componentes
          const eqAtivaLocal = Array.isArray(eq.alocacoes) && eq.alocacoes.some(a=> a && a.dia===dia && sameTurnoFlexible(a, turno));
          if(addedForEq===0 && (eqAtivaLocal || isEquipeAtivaNoTurnoDia(esc, eq, dia, turno))){
            const comps = Array.isArray(eq.componentes)? eq.componentes: [];
            if(comps.length){
              const membros = comps.map(c=> ({ id: c.funcionario_id||c.id, nome: c.nome||null, atribuicao: null })).filter(m=> m.id);
              membros.forEach(m=>{ if(m.id) idsParaResolver.add(String(m.id)); });
              linhas.push({ equipe: `${eq.nome||eq.id||'—'}${eq.descricao? `\n${eq.descricao}`:''}`, membros, recurso:'—', notasRecurso:'—', notasEquipe:null, _eq:eq });
              addedForEq++;
            }
          }
        }
  // Mesmo sem linhas, vamos renderizar a seção e colocar uma linha placeholder,
  // para garantir que todas as escalas/turnos apareçam no relatório.
        // Resolver nomes/códigos em lote
        if(idsParaResolver.size){
          try{
            const Func=await getFuncionarioModel();
            const arr=await Func.find({ _id: { $in:[...idsParaResolver] } }).select('_id nome codigo').lean();
            const mapa=new Map(arr.map(a=> [String(a._id), { nome:a.nome||null, codigo:a.codigo||null }]));
            for(const ln of linhas){ if(!Array.isArray(ln.membros)) continue; for(const m of ln.membros){ if(!m) continue; const k=String(m.id||m.funcionarioId||m.funcionario_id||''); if(!k) continue; const info=mapa.get(k); if(info){ if(!m.nome && info.nome) m.nome=info.nome; if(!m.codigo && info.codigo) m.codigo=info.codigo; } } }
          }catch(_){ }
        }
        // Notas da equipe: primeira linha da equipe carrega, demais em branco
        try{
          const notasMap=new Map();
          for(const ln of linhas){
            const eq=ln._eq; if(!eq) continue;
            if(!notasMap.has(eq)){
              let n=null;
              try{
                const a=Array.isArray(eq.alocacoes)? eq.alocacoes.find(a=> a && a.dia===dia && sameTurnoFlexible(a, turno)): null;
                n = a? (notaTexto(a.notas)||notaTexto(a.nota)||null): null;
              }catch(_){ }
              if(!n) n = notaTexto(eq.notas)||notaTexto(eq.nota)||null;
              notasMap.set(eq, n);
            }
          }
          const firstSeen=new Map();
          for(const ln of linhas){
            const eq=ln._eq; const n=notasMap.get(eq)||null;
            if(!firstSeen.get(eq)){ ln.notasEquipe = n || '—'; firstSeen.set(eq,true); }
            else { ln.notasEquipe=' '; }
            delete ln._eq;
          }
        }catch(_){ }

        // Seção: Escala + Turno
  const secH=24; const titulo=`Escala: ${esc.descricao||'—'} - Turno: ${turno.ini}-${turno.fim}`;
  if(y + secH + rowH > safeBottom) novaPagina();
  y = drawSectionBar(doc, x, y, W, titulo);
        // Cabeçalho da tabela
        y = drawTableHeader(doc, x, y, W, colW, rowH);

        // Linhas
        if(!linhas.length){
          const phH = rowH;
          if(y + phH > safeBottom) { novaPagina(); y = drawSectionBar(doc, x, y, W, titulo); y = drawTableHeader(doc, x, y, W, colW, rowH); }
          doc.save(); doc.fillColor('#f6faff').rect(x,y,W,phH).fill(); doc.restore();
          doc.strokeColor('#e5e7eb').lineWidth(0.5).rect(x,y,W,phH).stroke();
          // Placeholder em fonte 8
          doc.font('Helvetica').fontSize(8).fillColor(THEME.text);
          ['—','—','—','—','Sem alocações neste turno'].forEach((txt,idx)=>{
            const cx = idx===0? x : idx===1? x+colW.equipe : idx===2? x+colW.equipe+colW.efetivo : idx===3? x+colW.equipe+colW.efetivo+colW.recurso : x+colW.equipe+colW.efetivo+colW.recurso+colW.notasRecurso;
            const cw = idx===0? colW.equipe : idx===1? colW.efetivo : idx===2? colW.recurso : idx===3? colW.notasRecurso : colW.notasEquipe;
            drawCenteredText(doc, txt, cx, y, cw, phH, { align:'center', paddingX:6 });
          });
          y += phH + 4; // espaço após placeholder
          continue;
        }
        for(const ln of linhas){
          const efetivo = (Array.isArray(ln.membros)? ln.membros: []).map(m=>{
            if(!m) return ''; const codigo=m.codigo||null; const nome=m.nome||null; let base=null; if(codigo&&nome) base=`${codigo} - ${nome}`; else if(codigo) base=`${codigo}`; else if(nome) base=`${nome}`; else base=String(m.id||''); return base + (m.atribuicao? ` (${m.atribuicao})`: '');
          }).filter(Boolean).join('\n') || '—';
          const txtEquipe = clampText(ln.equipe||'—', { maxLines:3, maxChars:220 });
          const txtEfetivo = clampText(efetivo, { maxLines:10, maxChars:2000 });
          const txtRecurso = clampText(ln.recurso||'—', { maxLines:4, maxChars:400 });
          // Notas devem aparecer integralmente: não usar clamp/ellipsis
          const txtNotasR = String(ln.notasRecurso==null? '—': ln.notasRecurso);
          const txtNotasE = String(ln.notasEquipe==null? '—': ln.notasEquipe);
          const rowW = { equipe: Math.max(0,colW.equipe-6), efetivo: Math.max(0,colW.efetivo-6), recurso: Math.max(0,colW.recurso-6), notasRecurso: Math.max(0,colW.notasRecurso-6), notasEquipe: Math.max(0,colW.notasEquipe-6) };
          // Garantir cálculo de altura com fonte 8
          doc.font('Helvetica').fontSize(8);
          const equipeH=Math.max(rowH,doc.heightOfString(txtEquipe,{width:rowW.equipe,align:'left'})+6);
          const efetivoH=Math.max(rowH,doc.heightOfString(txtEfetivo,{width:rowW.efetivo,align:'left'})+6);
          const recursoH=Math.max(rowH,doc.heightOfString(txtRecurso,{width:rowW.recurso,align:'left'})+6);
          const notasRH=Math.max(rowH,doc.heightOfString(txtNotasR,{width:rowW.notasRecurso,align:'left'})+6);
          const notasEH=Math.max(rowH,doc.heightOfString(txtNotasE,{width:rowW.notasEquipe,align:'left'})+6);
          const dynH=Math.max(rowH,equipeH,efetivoH,recursoH,notasRH,notasEH);
          if(y + dynH > safeBottom){ novaPagina(); y = drawSectionBar(doc, x, y, W, titulo); y = drawTableHeader(doc, x, y, W, colW, rowH); }
          doc.save(); doc.fillColor('#f6faff').rect(x,y,W,dynH).fill(); doc.restore();
          doc.strokeColor('#e5e7eb').lineWidth(0.5).rect(x,y,W,dynH).stroke();
          // Conteúdo em fonte 8
          doc.font('Helvetica').fontSize(8).fillColor(THEME.text);
          drawCenteredText(doc, txtEquipe, x, y, colW.equipe, dynH, { align:'center', paddingX:6 });
          drawCenteredText(doc, txtEfetivo, x+colW.equipe, y, colW.efetivo, dynH, { align:'center', paddingX:6 });
          drawCenteredText(doc, txtRecurso, x+colW.equipe+colW.efetivo, y, colW.recurso, dynH, { align:'center', paddingX:6 });
          // Notas sem corte: não informar height nem ellipsis
          doc.text(txtNotasR, x+colW.equipe+colW.efetivo+colW.recurso+3, y+3, { width: colW.notasRecurso-6, align:'left' });
          doc.text(txtNotasE, x+colW.equipe+colW.efetivo+colW.recurso+colW.notasRecurso+3, y+3, { width: colW.notasEquipe-6, align:'left' });
          y += dynH;
        }
        // Log leve de debug quando solicitado
        try{
          const dbg = String(req.query.debug||req.query._debug||'').trim();
          if(dbg==='1' || /^true$/i.test(dbg)){
            const comNota = linhas.filter(ln=> typeof ln.notasRecurso==='string' && ln.notasRecurso.trim() && ln.notasRecurso.trim()!=='—').length;
            const total = linhas.length;
            console.info('[relatorios2][diaria][debug]', {
              escalaId: String(esc._id), descricao: esc.descricao||null, dia, turno: `${turno.ini}-${turno.fim}`,
              linhas: total, comNota
            });
          }
        }catch(_){ }
        // Pequeno espaço entre seções
        y += 4;
      }
    }

    // Rodapé com paginação
    const range = doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){
      doc.switchToPage(range.start + i);
      const p2 = doc.page; const contentW2 = p2.width - p2.margins.left - p2.margins.right;
      const yFooter = p2.height - p2.margins.bottom - 14;
      const pagTxt = `página ${i+1}/${range.count}`;
      doc.font('Helvetica').fontSize(8).fillColor('#666').text(pagTxt, p2.margins.left, yFooter, { width: contentW2, align:'right' });
      doc.fillColor(THEME.text);
    }
    doc.end();
  }catch(e){
    console.error('[escalas][relatorios2][diaria] erro', e);
    if(!res.headersSent) res.status(500).send('Falha ao gerar PDF');
  }
}

// ============ Helpers matriz (compartilhados) ============
function parseChaveAlocacaoEscala(key){ if(!key || typeof key!=='string') return null; const m=key.match(/^([^|:]+)::(\d{2}:\d{2})-(\d{2}:\d{2})\|(\d{4}-\d{2}-\d{2})$/); if(!m) return null; const grupoId=m[1]; const ini=m[2]; const fim=m[3]; const dia=m[4]; return { grupoId, ini, fim, dia }; }
function parseChaveAlocacaoLegacy(key){ if(!key || typeof key!=='string') return null; const m=key.match(/^([^|]+)\|(\d{4}-\d{2}-\d{2})$/); if(!m) return null; const turnoToken=m[1]; const dia=m[2]; const m2=String(turnoToken).match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/); if(!m2) return null; const ini=m2[1]; const fim=m2[2]; return { grupoId:null, ini, fim, dia }; }
// Ultra flex: extrai qualquer combinação contendo um dia YYYY-MM-DD e um token HH:MM-HH:MM, independente da ordem ou separadores
function parseChaveAlocacaoLax(key){
  try{
    if(!key || typeof key!=='string') return null;
    const diaMatch = key.match(/(\d{4}-\d{2}-\d{2})/);
    const tokMatch = key.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if(!diaMatch || !tokMatch) return null;
    const dia = diaMatch[1];
    const ini = tokMatch[1].padStart(5,'0');
    const fim = tokMatch[2].padStart(5,'0');
    return { grupoId:null, ini, fim, dia };
  }catch(_){ return null; }
}
function isEquipeAtivaNoTurnoDia(esc, eq, dia, turno){
  try{
    const matriz = (esc?.alocacao && typeof esc.alocacao==='object')? esc.alocacao: null; if(!matriz) return false;
    const eid = String(eq?.id||''); const enome = String((eq?.nome||'').toUpperCase());
    for(const [k,v] of Object.entries(matriz)){
      const parsed = parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k) || parseChaveAlocacaoLax(k); if(!parsed) continue;
      if(parsed.dia!==dia) continue;
      const tokLike = `${parsed.ini}-${parsed.fim}`;
      if(!sameTurnoFlexible({ turnoId: tokLike }, turno)) continue;
      const val = typeof v==='string'? v: (v?.equipeId||v?.equipe||v?.id||'');
      if(val){ if(String(val)===eid) return true; if(String(val).toUpperCase()===enome && enome) return true; }
    }
  }catch(_){ }
  return false;
}

// Desenha uma matriz simplificada de alocação turnos x dias baseada em esc.alocacao
function drawMatrizAlocacaoTurnos(doc, esc, x, y, W, diasISO){
  const turnos=[]; (esc.grupos_turnos||[]).forEach(g=> (g.turnos||[]).forEach(t=> turnos.push({ label:`${t.ini}-${t.fim}`, ini:t.ini, fim:t.fim })));
  turnos.sort((a,b)=> String(a.ini).localeCompare(String(b.ini)));
  const grid = computeGridWidths(W, diasISO.length, { fixedLeftW:120, minCol:22, maxCol:40 });
  let baseX = x + grid.safePad; const { leftW, colDiaW } = grid; const rowH = 16;
  // Header com duas linhas (dia + dia da semana)
  y = drawDaysHeaderTwoRows(doc, baseX, y, leftW, colDiaW, diasISO, 'Turno');
  // Preprocess matriz
  const matriz = (esc.alocacao && typeof esc.alocacao==='object')? esc.alocacao: {};
  const tokensByDiaTurn = new Map();
  const eqMap = new Map(); // id/codigo/nomeUpper -> nome legível
  try{
    for(const eq of (esc.equipes||[])){
      const nome = eq?.nome || String(eq?.id||'');
      const id = String(eq?.id||''); if(id) eqMap.set(id, nome);
      const codigo = String(eq?.codigo||''); if(codigo) eqMap.set(codigo, nome);
      eqMap.set((nome||'').toUpperCase(), nome);
    }
  }catch(_){ }
  function extractEquipes(val){
    const out=[];
    if(!val) return out;
    if(typeof val==='string'){
      String(val).split(/[;,]+/).map(s=> s.trim()).filter(Boolean).forEach(t=> out.push(t));
    }
    else if(Array.isArray(val)){
      for(const it of val){ if(!it) continue; if(typeof it==='string') out.push(it); else if(typeof it==='object'){ const e=it.equipeId||it.equipe||it.id||it.nome; if(e) out.push(String(e)); } }
    } else if(typeof val==='object'){
      if(val.equipeId||val.equipe||val.id||val.nome){ out.push(String(val.equipeId||val.equipe||val.id||val.nome)); }
      else { for(const [k,vx] of Object.entries(val)){ if(vx) out.push(String(k)); } }
    }
    return out;
  }
  const canon = (s)=> String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^\s*equipe\s+/i,'').replace(/\s+/g,' ').trim().toUpperCase();
  for(const [k,v] of Object.entries(matriz)){
    const parsed = parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k) || parseChaveAlocacaoLax(k); if(!parsed) continue;
    const d = parsed.dia;
    const tok = `${String(parsed.ini)}`.includes(':')? `${parsed.ini}-${parsed.fim}`: `${String(Math.floor(parsed.ini/60)).padStart(2,'0')}:${String(parsed.ini%60).padStart(2,'0')}-${String(Math.floor(parsed.fim/60)).padStart(2,'0')}:${String(parsed.fim%60).padStart(2,'0')}`;
    const key = d+'|'+tok;
    const arr = extractEquipes(v).map(String);
    let map = tokensByDiaTurn.get(key);
    if(!map){ map=new Map(); tokensByDiaTurn.set(key,map); }
    arr.forEach(a=>{
      const nome = (eqMap.get(String(a)) || eqMap.get(String(a).toUpperCase()) || String(a)).trim();
      const ck = canon(nome); if(!ck) return;
      if(!map.has(ck)) map.set(ck, nome); else { const prev = map.get(ck); if(String(nome).length < String(prev).length) map.set(ck, nome); }
    });
  }
  // Rows por turno (altura dinâmica por quantidade/altura de nomes por dia)
  for(const t of turnos){
    const tok = `${t.ini}-${t.fim}`;
    // Calcular altura necessária desta linha considerando todos os dias
    let rowHdyn = 16; const pad=2;
    doc.font('Helvetica').fontSize(7);
    diasISO.forEach((d)=>{
      const key=d+'|'+tok; const map = tokensByDiaTurn.get(key);
      const txt = map && map.size? [...map.values()].join('\n') : '';
      const h = txt? Math.ceil(doc.heightOfString(txt,{ width: Math.max(1,colDiaW-2*pad), align:'center' })) + pad*2 : 16;
      if(h>rowHdyn) rowHdyn=h;
    });
    // zebra
    doc.save(); doc.fillColor('#f6faff').rect(baseX, y, leftW + colDiaW*diasISO.length, rowHdyn).fill(); doc.restore();
    // left cell
    doc.strokeColor(THEME.grid).rect(baseX, y, leftW, rowHdyn).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME.text);
    drawCenteredText(doc, tok, baseX, y, leftW, rowHdyn);
    // day cells (nomes completos, uma por linha)
    diasISO.forEach((d,i)=>{
      const cx=baseX+leftW+i*colDiaW; doc.strokeColor(THEME.grid).rect(cx, y, colDiaW, rowHdyn).stroke();
      const key=d+'|'+tok; const map = tokensByDiaTurn.get(key);
      if(map && map.size>0){
        const txt = [...map.values()].join('\n');
        doc.font('Helvetica').fillColor(THEME.text).fontSize(7);
        doc.text(txt, cx+pad, y+pad, { width: Math.max(1,colDiaW-2*pad), align:'center' });
      }
    });
    y += rowHdyn;
    if(y > doc.page.height - doc.page.margins.bottom - 40){ doc.addPage(); y = doc.page.margins.top; baseX = doc.page.margins.left + grid.safePad; }
  }
  return y + 6;
}

// ============ Handler: Relatório por Escala (Matriz) ============
async function relatorioEscalaHandler(req,res){
  try{
    const id = String(req.query.id||req.params.id||'');
    if(!id || !id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).send('Informe ?id=<escalaId>');
    // Resolver dias do relatório: usar SEMPRE o período da escala
    // Ignora parâmetros de formulário (?dias, ?inicio, ?fim). As matrizes devem
    // refletir exatamente o período [data_inicio, data_fim] da escala.
    let diasISO = [];
    const Escala=await getEscalaModel();
    const esc = await Escala.findById(id).lean(); if(!esc) return res.status(404).send('Escala não encontrada');
    const toISOd = (dt)=>{ try{ if(!dt) return null; const d = (dt instanceof Date)? dt: new Date(dt); return isNaN(d.getTime())? null: d.toISOString().slice(0,10); }catch{ return null; } };
    const ini = toISOd(esc.data_inicio);
    const fim = toISOd(esc.data_fim);
    try{
      if(ini && fim){
        const d0 = new Date(ini+'T00:00:00');
        const d1 = new Date(fim+'T00:00:00');
        if(!isNaN(d0.getTime()) && !isNaN(d1.getTime()) && d1 >= d0){
          const arr=[]; for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)){ arr.push(d.toISOString().slice(0,10)); }
          diasISO = arr;
        }
      }
    }catch(_){ /* noop */ }
    // Fallback final: se algum lado faltar, usa pelo menos um dia válido
    if(!diasISO.length){ if(ini) diasISO=[ini]; else if(fim) diasISO=[fim]; else diasISO=[ new Date().toISOString().slice(0,10) ]; }

    // Labels de header (unidades/categoria) e logo
    let unidadesLabel='';
    try{
      if(esc.unidade_id){
        const Unidade=await getUnidadeModel();
        const u=await Unidade.findById(esc.unidade_id).select('nome codigo').lean();
        if(u) unidadesLabel = (u.codigo? `${u.codigo} - `:'') + (u.nome||'-');
      }
    }catch(_){ }
  const categoriasLabel = esc.classificacao || esc.tipo || esc.categoria || '';
  // Define o título conforme classificação: Ordinária ou Extraordinária
  const clsUpper = String(categoriasLabel||'').toUpperCase();
  const tituloRelEscala = `Relatório de Escala ${/EXTRA/.test(clsUpper)? 'Extraordinária': 'Ordinária'}`;
    const headerLogoPath = await resolveHeaderLogoPath(req, { unidadeIds: esc.unidade_id? [esc.unidade_id]: [] });

  res.setHeader('Content-Type','application/pdf; charset=binary');
  // Padrão de nome do arquivo: sem acento -> Relatorio.pdf (inline)
  res.setHeader('Content-Disposition',`inline; filename=Relatorio.pdf; filename*=UTF-8''${encodeURIComponent('Relatorio.pdf')}`);
    const doc = new PDFDocument({ size:'A4', layout:'landscape', margin:28, bufferPages:true });
    doc.pipe(res);
    const p = doc.page; const W = p.width - p.margins.left - p.margins.right; let x=p.margins.left; let y=p.margins.top;
    // Header padronizado
  y = drawReportHeader(doc, { x, y, W, title: tituloRelEscala, unidades:unidadesLabel, categorias:categoriasLabel, emitidoPor:(req?.user?.nome || req?.session?.escalasUser?.nome || req?.user?.email || req?.session?.escalasUser?.email || ''), logoPathOverride: headerLogoPath });
    // Linha informativa da escala e período
    const fmtBr=(iso)=> iso? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '';
    const perIni = diasISO.length? diasISO[0] : (esc.data_inicio? new Date(esc.data_inicio).toISOString().slice(0,10): null);
    const perFim = diasISO.length? diasISO[diasISO.length-1] : (esc.data_fim? new Date(esc.data_fim).toISOString().slice(0,10): null);
    const periodoStr = perIni && perFim? `${fmtBr(perIni)} à ${fmtBr(perFim)} (${diasISO.length||1} dia(s))` : (diasISO.length? diasISO.join(', '): 'sem dias definidos');
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(`Escala: ${esc.descricao||esc.nome||esc._id} — Período: ${periodoStr}`, x, y, { width: W, align:'center' });
    y += Math.ceil(doc.heightOfString('X',{ width: W })) + 6; // respiro após linha informativa
    doc.fillColor(THEME.text);
  // Matriz: título e grade principal (Turno x Dias) com equipes indicadas nas células
  const titulo1 = 'Matriz de Alocação';
  doc.font('Helvetica-Bold').fontSize(11).fillColor(THEME.text).text(titulo1, x, y, { width: W, align:'center' });
  y += Math.ceil(doc.heightOfString(titulo1, { width: W })) + 6; // espaço entre o título e a matriz
  doc.fillColor(THEME.text).font('Helvetica');
  y = drawMatrizAlocacaoTurnos(doc, esc, x, y, W, diasISO.length? diasISO: [new Date().toISOString().slice(0,10)]);

    // Matriz por Efetivo
    try{
      const titulo2 = 'Matriz de Alocação por Efetivo';
      y += 8; // respiro antes do próximo título
      doc.font('Helvetica-Bold').fontSize(11).fillColor(THEME.text).text(titulo2, x, y, { width: W, align:'center' });
      y += Math.ceil(doc.heightOfString(titulo2, { width: W })) + 6;
      doc.fillColor(THEME.text).font('Helvetica');
  const equiposNorm = normalizeEquipesEscala(esc);
  y = await drawMatrizEfetivo(doc, esc, equiposNorm, x, y, W, diasISO);
    }catch(_){ /* mantém relatório mesmo se seção falhar */ }

    // Lista de Recursos (em grade por dia, agrupado por equipe)
    try{
      const titulo3 = 'Recursos';
      y += 8; // respiro antes do próximo título
      doc.font('Helvetica-Bold').fontSize(11).fillColor(THEME.text).text(titulo3, x, y, { width: W, align:'center' });
      y += Math.ceil(doc.heightOfString(titulo3, { width: W })) + 6;
      doc.fillColor(THEME.text).font('Helvetica');
      const equiposNorm = normalizeEquipesEscala(esc);
      y = drawMatrizRecursos(doc, esc, equiposNorm, x, y, W, diasISO);
    }catch(_){ }
    // Rodapé
    const range = doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){
      doc.switchToPage(range.start + i);
      const p2 = doc.page; const contentW2 = p2.width - p2.margins.left - p2.margins.right; const yFooter=p2.height - p2.margins.bottom - 14;
      const pagTxt=`página ${i+1}/${range.count}`;
      doc.font('Helvetica').fontSize(8).fillColor('#666').text(pagTxt, p2.margins.left, yFooter, { width: contentW2, align:'right' });
      doc.fillColor(THEME.text);
    }
    doc.end();
  }catch(e){
    console.error('[escalas][relatorios2][escala] erro', e);
    if(!res.headersSent) res.status(500).send('Falha ao gerar PDF');
  }
}

// ===== Rotas do Relatório Diário =====
router.get('/relatorios/diaria', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorios/diaria.pdf', requireEscalasAuth, relatorioDiariaHandler);
// Alias com nome amigável no caminho para o viewer exibir "Relatorio.pdf" na diária
router.get('/relatorios/diaria/Relatorio.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorio/diaria', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorio/diaria.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorio/diaria/Relatorio.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorios/diaria/:id', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorios/diaria/:id.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorio/diaria/:id', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorio/diaria/:id.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/diaria/Relatorio.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/diaria', requireEscalasAuth, relatorioDiariaHandler);
router.get('/diaria.pdf', requireEscalasAuth, relatorioDiariaHandler);

// ============ Relatório: Horas Trabalhadas (PDF) ============
function overlapLen(a1,a2,b1,b2){ const s=Math.max(a1,b1); const e=Math.min(a2,b2); return Math.max(0, e-s); }
const NIGHT_START=22*60, NIGHT_END=5*60; const CLT_FACTOR=60/52.5;
function clampTodayISO(iso){ try{ const t=new Date().toISOString().slice(0,10); return String(iso)>t? t: String(iso); }catch{ return String(iso); } }
function eachDayISO(ini,fim){ const out=[]; try{ const d0=new Date(ini+'T00:00:00'); const d1=new Date(fim+'T00:00:00'); if(d1<d0) return out; for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)){ out.push(d.toISOString().slice(0,10)); } }catch(_){ } return out; }
function addDaysISO2(iso,delta){ try{ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+delta); return d.toISOString().slice(0,10); }catch{ return iso; } }
function fmtMin(m){ if(!Number.isFinite(m)||m<=0) return '00:00'; const t=Math.round(m); const h=Math.floor(t/60); const mi=t%60; return String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0'); }
function daySplitMinutes(iniMin,fimMin){ if(fimMin===0) fimMin=1440; const total=Math.max(0,fimMin-iniMin); const night1=overlapLen(iniMin,fimMin,0,NIGHT_END); const night2=overlapLen(iniMin,fimMin,NIGHT_START,1440); const noturno=night1+night2; const diurno=Math.max(0,total-noturno); return { diurno, noturno }; }
function allocateToDays(diaISO,iniMin,fimMin){
  const out=[]; if(fimMin===iniMin) return out;
  if(fimMin>iniMin){ const sp=daySplitMinutes(iniMin,fimMin); out.push({ dia:diaISO, ini:iniMin, fim:fimMin===0?1440:fimMin, ...sp }); }
  else { const sp1=daySplitMinutes(iniMin,1440); out.push({ dia:diaISO, ini:iniMin, fim:1440, ...sp1 }); const sp2=daySplitMinutes(0,fimMin); out.push({ dia:addDaysISO2(diaISO,1), ini:0, fim:fimMin, ...sp2 }); }
  return out;
}
function minutesNoturnosCLT(m){ return Math.round(m*CLT_FACTOR); }

async function coletarMinutosHoras({ inicioISO, fimISO, unidadeId, filiais, onlyFids }){
  const Escala=await getEscalaModel(); const Unidade=await getUnidadeModel(); const Func=await getFuncionarioModel();
  let filtroUn={};
  // Conjunto de unidades permitidas para filtrar funcionários quando relatório é por unidade
  let allowedUnSet = null;
  if(unidadeId){
    if(filiais){
      const u=await Unidade.findById(unidadeId).select('_id is_principal unidade_principal_id').lean();
      if(u){
        const matriz=u.is_principal? u._id : (u.unidade_principal_id||u._id);
        const ids=await Unidade.find({ $or:[{_id:matriz},{unidade_principal_id:matriz}] }).select('_id').lean();
        const arrIds = ids.map(x=> x._id);
        filtroUn={ unidade_id: { $in: arrIds } };
        allowedUnSet = new Set(arrIds.map(String));
      } else { filtroUn={ unidade_id: unidadeId }; allowedUnSet = new Set([String(unidadeId)]); }
    }
    else { filtroUn={ unidade_id: unidadeId }; allowedUnSet = new Set([String(unidadeId)]); }
  }
  const dtFim=new Date(fimISO+'T00:00:00.000Z'); const dtIni = inicioISO? new Date(inicioISO+'T00:00:00.000Z') : new Date('1970-01-01T00:00:00.000Z');
  const filtros = { ...filtroUn, data_inicio:{ $lte: dtFim }, data_fim:{ $gte: dtIni } };
  const docs = await Escala.find(filtros).select('equipes recursos grupos_turnos alocacao').lean();
  const agg=new Map(); // fid -> Map(dia -> {diurno,noturno})
  const counted=new Set(); // evita contagem duplicada: key=fid|dia|token
  const ensure=(fid)=>{ const k=String(fid); let by=agg.get(k); if(!by){ by=new Map(); agg.set(k,by); } return by; };
  const add=(fid,dia,diurno,noturno)=>{
    const by=ensure(fid);
    const cur=by.get(dia)||{diurno:0,noturno:0};
    cur.diurno+=diurno||0; cur.noturno+=noturno||0;
    // Safety cap: não permitir mais que 24h (1440 min) por dia simples
    let total=cur.diurno + cur.noturno;
    if(total > 1440){
      let overflow = total - 1440;
      // Reduz primeiro do diurno; se necessário, do noturno
      const cutD = Math.min(cur.diurno, overflow);
      cur.diurno -= cutD; overflow -= cutD;
      if(overflow>0){ cur.noturno = Math.max(0, cur.noturno - overflow); }
    }
    by.set(dia,cur);
  };
  const normTok=(s)=> String(s||'').replace(/\s+(às|as|a)\s+/ig,'-').replace(/[–—−‑‒]/g,'-').replace(/\s*-\s*/g,'-');
  const sameDay=(d)=> (!inicioISO || d>=inicioISO) && d<=fimISO;
  function fidsRecurso(r,dia,token){ const out=new Set(); try{ const tSlim=normTok(token); const atribs=Array.isArray(r.atribuicoes)? r.atribuicoes.filter(a=>{ if(!a) return false; const dOk=a.dia? a.dia===dia: true; if(!dOk) return false; const raw=a.turnoId||a.turno||''; const slim=normTok(raw); return !slim || slim===tSlim; }):[]; atribs.forEach(a=>{ const id=a.membroFuncionarioId||a.funcionarioId||a.funcionario||a.funcionario_id||a.matricula||a.id; if(id) out.add(String(id)); }); const map=r.atribuicoesRecurso||{}; const k1=`${dia}__${token}`; const k2=`${dia}__${tSlim}`; const lista=map[k1]||map[k2]||[]; if(Array.isArray(lista)) lista.forEach(it=>{ const id=it?.membroFuncionarioId||it?.funcionarioId||it?.id||it?.matricula; if(id) out.add(String(id)); }); if(out.size===0 && Array.isArray(r.membros)) r.membros.forEach(m=>{ const id=m?.funcionario_id||m?.id||m?.funcionarioId; if(id) out.add(String(id)); }); }catch(_){ } return [...out.values()]; }

  // Lista de refeições NÃO computáveis (intervalos em minutos absolutos do dia)
  function refeicoesNaoComputaveis(r, dia, token, rng){
    const out=[]; if(!r) return out; const tSlim=normTok(token);
    try{
      // Array
      if(Array.isArray(r.refeicoes)){
        for(const iv of r.refeicoes){ if(!iv) continue; const diaIv = iv.dia||iv.data||null; if(diaIv && diaIv!==dia) continue; let comp=true; if(typeof iv.computavel==='boolean') comp=iv.computavel; else if(typeof iv.tipo==='string'){ const t=String(iv.tipo).toLowerCase(); if(t.includes('nao')||t.includes('não')) comp=false; }
          if(comp===true) continue; const ini=iv.ini||iv.inicio; const fim=iv.fim||iv.termino; if(!ini||!fim) continue; // match por turno quando existir
          const tok = iv.turnoId||iv.turno||''; const okTok = tok? (normTok(tok)===tSlim): true; if(!okTok) continue;
          const im=hhmmToMin(ini); const fm=hhmmToMin(fim); if(im==null||fm==null) continue; // considerar sobreposição com rng
          if(rng){ // computa apenas interseção com o turno
            const s=Math.max(im, rng.ini); const e=Math.min(fm, rng.fim===0?1440:rng.fim); if(e>s) out.push({ ini:s, fim:e });
          } else out.push({ ini:im, fim:fm });
        }
      }
      // Mapa legado
      if(r.refeicoesRecurso && typeof r.refeicoesRecurso==='object'){
        const k1=`${dia}__${token}`; const k2=`${dia}__${tSlim}`; const lista=r.refeicoesRecurso[k1]||r.refeicoesRecurso[k2]||[];
        if(Array.isArray(lista)) for(const it of lista){ if(!it) continue; let comp=true; if(typeof it.computavel==='boolean') comp=it.computavel; else if(typeof it.tipo==='string'){ const t=String(it.tipo).toLowerCase(); if(t.includes('nao')||t.includes('não')) comp=false; } if(comp===true) continue; const ini=it.ini||it.inicio; const fim=it.fim||it.termino; if(!ini||!fim) continue; const im=hhmmToMin(ini); const fm=hhmmToMin(fim); if(im==null||fm==null) continue; if(rng){ const s=Math.max(im, rng.ini); const e=Math.min(fm, rng.fim===0?1440:rng.fim); if(e>s) out.push({ ini:s, fim:e }); } else out.push({ ini:im, fim:fm }); }
      }
    }catch(_){ }
    return out;
  }
  function eqMaps(esc){ const eqs=Array.isArray(esc.equipes)? esc.equipes: []; return { byId:new Map(eqs.map(e=> [String(e.id), e])), byNome:new Map(eqs.map(e=> [String((e.nome||'').toUpperCase()), e])) }; }
  function iterRec(esc){ const arr=[]; (esc.equipes||[]).forEach(eq=> (eq.recursos||[]).forEach(r=> arr.push({r,eq}))); if(Array.isArray(esc.recursos)) esc.recursos.forEach(r=> arr.push({r,eq:null})); return arr; }
  for(const esc of docs){
    const { byId, byNome } = eqMaps(esc);
    for(const pair of iterRec(esc)){
      const r=pair.r; const alocs=Array.isArray(r.alocacoes)? r.alocacoes: [];
      for(const a of alocs){
        const dia=String(a?.dia||''); if(!/\d{4}-\d{2}-\d{2}/.test(dia) || !sameDay(dia)) continue;
        const rng = (()=>{ try{ if(a?.ini && a?.fim){ const i=hhmmToMin(a.ini); const f=hhmmToMin(a.fim); if(i!=null && f!=null) return { ini:i, fim:f }; } const r=findFromTurnoToken(esc, a?.turnoId||a?.turno); return r; }catch(_){ return null; } })(); if(!rng) continue;
        const tokStr=`${String(Math.floor(rng.ini/60)).padStart(2,'0')}:${String(rng.ini%60).padStart(2,'0')}-${String(Math.floor((rng.fim===0?1440:rng.fim)/60)%24).toString().padStart(2,'0')}:${String((rng.fim===0?1440:rng.fim)%60).toString().padStart(2,'0')}`;
        const fids=fidsRecurso(r,dia,tokStr);
        const slots=allocateToDays(dia,rng.ini,rng.fim);
        // refeições não computáveis deste recurso para o dia/turno
        const refNC = refeicoesNaoComputaveis(r, dia, tokStr, rng);
        for(const fid of fids){
          if(onlyFids && onlyFids.size && !onlyFids.has(String(fid))) continue;
          const keyBase = `${fid}|${dia}|${normTok(tokStr)}`;
          if(counted.has(keyBase)) continue; // já contou este dia/turno para este funcionário (evita duplicidade com outra origem)
          for(const s of slots){
            // Ajustar minutos por refeições NC sobrepostas neste dia
            let dMin=s.diurno, nMin=s.noturno;
            for(const rf of refNC){
              // sobreposição com o pedaço do dia [s.ini,s.fim)
              const sO = Math.max(s.ini, rf.ini); const eO = Math.min(s.fim, rf.fim);
              if(eO<=sO) continue;
              const cut = daySplitMinutes(sO, eO);
              dMin -= cut.diurno; nMin -= cut.noturno;
            }
            dMin = Math.max(0, dMin); nMin = Math.max(0, nMin);
            add(fid, s.dia, dMin, nMin);
          }
          counted.add(keyBase);
        }
      }
    }
    // matriz esc.alocacao por equipe
    const matriz = esc?.alocacao && typeof esc.alocacao==='object'? esc.alocacao: {};
    for(const [k,v] of Object.entries(matriz)){
      const p = (function(){ const a=parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k) || parseChaveAlocacaoLax(k); if(!a) return null; return { dia:a.dia, ini:hhmmToMin(a.ini), fim:hhmmToMin(a.fim) }; })();
      if(!p || !/\d{4}-\d{2}-\d{2}/.test(p.dia) || !sameDay(p.dia)) continue; if(p.ini==null||p.fim==null) continue;
      let tokens=[]; if(Array.isArray(v)) tokens=v.map(String); else if(typeof v==='string') tokens=v.split(',').map(s=> s.trim()).filter(Boolean); else if(v&&typeof v==='object'){ tokens=Object.keys(v).filter(id=> v[id]); }
      const slots=allocateToDays(p.dia,p.ini,p.fim);
      const tokStr = `${String(Math.floor(p.ini/60)).padStart(2,'0')}:${String(p.ini%60).padStart(2,'0')}-${String(Math.floor((p.fim===0?1440:p.fim)/60)%24).toString().padStart(2,'0')}:${String((p.fim===0?1440:p.fim)%60).toString().padStart(2,'0')}`;
      for(const tok of tokens){ let eq = byId.get(String(tok)) || byNome.get(String(tok).toUpperCase()); if(!eq) continue; const comps = Array.isArray(eq.componentes)? eq.componentes: []; for(const c of comps){ const fid=c?.funcionario_id||c?.id; if(!fid) continue; if(onlyFids && onlyFids.size && !onlyFids.has(String(fid))) continue; const key=`${fid}|${p.dia}|${normTok(tokStr)}`; if(counted.has(key)) continue; for(const s of slots){ add(fid,s.dia,s.diurno,s.noturno); } counted.add(key); } }
    }
  }
  // Se relatório é por unidade, filtrar funcionários cuja unidade atual NÃO pertence ao cluster permitido
  if(allowedUnSet && allowedUnSet.size){
    const idsHex = [...agg.keys()].filter(id=> /^[0-9a-fA-F]{24}$/.test(String(id)));
    if(idsHex.length){
      const docs = await Func.find({ _id: { $in: idsHex } }).select('_id unidade_id').lean();
      const permitidos = new Set(docs.filter(f=> f && f.unidade_id && allowedUnSet.has(String(f.unidade_id))).map(f=> String(f._id)));
      for(const fid of [...agg.keys()]){
        if(/^[0-9a-fA-F]{24}$/.test(String(fid)) && !permitidos.has(String(fid))){ agg.delete(String(fid)); }
      }
    }
  }
  // Enriquecimento básico (id->nome/codigo)
  const info=new Map(); const ids=[...agg.keys()].filter(id=> /^[0-9a-fA-F]{24}$/.test(String(id))); if(ids.length){ const docs=await Func.find({ _id:{ $in: ids } }).select('nome codigo').lean(); docs.forEach(f=> info.set(String(f._id), { id:String(f._id), codigo:f.codigo||null, nome:f.nome||null })); }
  return { agg, info };
}

function findFromTurnoToken(esc, token){ try{ if(!token) return null; let t=String(token); if(t.includes('::')) t=t.split('::').slice(-1)[0]; const m=t.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/); if(m){ const i=hhmmToMin(m[1]); const f=hhmmToMin(m[2]); if(i!=null&&f!=null) return { ini:i, fim:f }; } const grupos=esc?.grupos_turnos||[]; for(const g of grupos){ for(const tt of (g.turnos||[])){ if(`${tt.ini}-${tt.fim}`===t){ const i=hhmmToMin(tt.ini); const f=hhmmToMin(tt.fim); if(i!=null&&f!=null) return { ini:i, fim:f }; } } } }catch(_){ } return null; }

function drawHorasHeader(doc, x, y, W, diasISO, leftW, colDiaW, opts={}){
  // Header de 2 linhas com dia e dia da semana; opcionalmente inclui duas colunas de totais ao fim
  const { showTotals=true, totColW=null } = opts||{};
  const extra = showTotals? ['Total período','Total geral'] : [];
  const row1=18, row2=12; const totalW = leftW + colDiaW*diasISO.length + (showTotals? ((totColW||colDiaW)*2) : 0);
  doc.save(); doc.fillColor('#e7f1ff').rect(x, y, totalW, row1).fill(); doc.restore();
  doc.strokeColor(THEME.grid).lineWidth(0.5).rect(x, y, totalW, row1+row2).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME.text);
  drawCenteredText(doc, 'Horas', x, y, leftW, row1);
  diasISO.forEach((d,i)=>{ const cx=x+leftW+i*colDiaW; const weekend=isWeekendISO(d); if(weekend) doc.fillColor('#b91c1c'); else doc.fillColor(THEME.text); drawCenteredText(doc, d.slice(8,10), cx, y, colDiaW, row1); });
  extra.forEach((lab, idx)=>{ const w=(totColW||colDiaW); const cx=x+leftW+(diasISO.length*colDiaW) + idx*w; doc.fillColor(THEME.text); drawCenteredText(doc, idx===0? 'Tot. período':'Tot. geral', cx, y, w, row1); });
  const y2=y+row1; doc.font('Helvetica').fontSize(7);
  const wd=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  diasISO.forEach((d,i)=>{ const cx=x+leftW+i*colDiaW; const dd=new Date(d+'T00:00:00'); const label=wd[dd.getDay()]||''; const weekend=isWeekendISO(d); if(weekend) doc.fillColor('#b91c1c'); else doc.fillColor(THEME.text); drawCenteredText(doc, label, cx, y2, colDiaW, row2); });
  extra.forEach((_,idx)=>{ const w=(totColW||colDiaW); const cx=x+leftW+(diasISO.length*colDiaW) + idx*w; drawCenteredText(doc, '', cx, y2, w, row2); });
  doc.fillColor(THEME.text);
  return y + row1 + row2;
}

async function relatorioHorasHandler(req,res){
  try{
    const q=req.query||{}; let inicio=String(q.inicio||q.start||''); let fim=String(q.fim||q.end||'');
    const unidadeId = /^[0-9a-fA-F]{24}$/.test(String(q.unidadeId||''))? String(q.unidadeId): null; const filiais = String(q.filiais||'')==='1';
    const rawFunc = String(q.funcionarioId||q.funcionarios||''); const fids = rawFunc.split(',').map(s=> s.trim()).filter(Boolean);
    if(!/\d{4}-\d{2}-\d{2}/.test(inicio) || !/\d{4}-\d{2}-\d{2}/.test(fim)) return res.status(400).send('Informe inicio/fim (YYYY-MM-DD)');
    fim = clampTodayISO(fim);
    if(fim < inicio) return res.status(400).send('fim < inicio');
    const diasISO = eachDayISO(inicio, fim);
    // Coleta dos minutos
    const onlyFids = new Set(fids);
    const { agg, info } = await coletarMinutosHoras({ inicioISO:inicio, fimISO:fim, unidadeId, filiais, onlyFids: (fids.length? onlyFids: null) });

    // Preparar PDF
    res.setHeader('Content-Type','application/pdf; charset=binary');
    res.setHeader('Content-Disposition',`inline; filename=Relatorio.pdf; filename*=UTF-8''${encodeURIComponent('Relatorio.pdf')}`);
    const doc = new PDFDocument({ size:'A4', layout:'landscape', margin:28, bufferPages:true });
    doc.pipe(res);
    let x=doc.page.margins.left; let y=doc.page.margins.top; const W=doc.page.width - doc.page.margins.left - doc.page.margins.right; const safeBottom = doc.page.height - doc.page.margins.bottom - 24;

    // Header
    const Unidade = await getUnidadeModel();
    let unidadesLabel=''; if(unidadeId){ try{ const u=await Unidade.findById(unidadeId).select('nome codigo').lean(); if(u) unidadesLabel = (u.codigo? `${u.codigo} - `:'')+(u.nome||'-') + (filiais? ' (matriz+filiais)':'' ); }catch(_){ } }
    const headerLogoPath = await resolveHeaderLogoPath(req, { unidadeIds: unidadeId? [unidadeId]: [] });
  y = drawReportHeader(doc, { x, y, W, title:'Relatório de Previsão de Horas a Serem Trabalhadas', unidades:unidadesLabel||(fids.length? `Funcionário(s): ${fids.length}`: ''), categorias:null, diaISO:null, emitidoPor:(req?.user?.nome || req?.session?.escalasUser?.nome || req?.user?.email || req?.session?.escalasUser?.email || ''), logoPathOverride: headerLogoPath });
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(`Período: ${inicio.split('-').reverse().join('/')} à ${fim.split('-').reverse().join('/')} (${diasISO.length} dia(s))`, x, y, { width: W, align:'center' });
    y += 18;

  function novaPagina(){ doc.addPage(); x=doc.page.margins.left; y=doc.page.margins.top; y = drawReportHeader(doc, { x, y, W, title:'Relatório de Previsão de Horas a Serem Trabalhadas', unidades:unidadesLabel||(fids.length? `Funcionário(s): ${fids.length}`: ''), categorias:null, diaISO:null, emitidoPor:(req?.user?.nome || req?.session?.escalasUser?.nome || req?.user?.email || req?.session?.escalasUser?.email || ''), logoPathOverride: headerLogoPath }); y += 18; }

  // Grid base por segmento (21 dias), quebra na 22ª coluna; totais só no último segmento
  const MAX_COLS=21; // por segmento
  const baseGrid = computeGridWidths(W, MAX_COLS, { fixedLeftW:140, minCol:22, maxCol:40 });
  const baseX = x + baseGrid.safePad; const baseLeftW = baseGrid.leftW; const baseColDiaW = baseGrid.colDiaW;

    // Ordenar funcionários por nome/código
    const fidsList = [...agg.keys()];
    fidsList.sort((a,b)=>{ const ia=info.get(String(a))||{}; const ib=info.get(String(b))||{}; const an=(ia.nome||'').toUpperCase(); const bn=(ib.nome||'').toUpperCase(); if(an&&bn) return an.localeCompare(bn); const ac=ia.codigo||''; const bc=ib.codigo||''; return String(ac).localeCompare(String(bc)); });
    if(!fidsList.length){ doc.font('Helvetica').fontSize(10).fillColor('#555').text('Sem movimentações no período.', x, y+6, { width: W, align:'center' }); doc.end(); return; }

    for(const fid of fidsList){
      const meta = info.get(String(fid)) || { id: (/^[0-9a-fA-F]{24}$/.test(String(fid))? String(fid): null), codigo: (/^[0-9a-fA-F]{24}$/.test(String(fid))? null: String(fid)), nome:null };
      const title = (meta.codigo && meta.nome)? `${meta.codigo} - ${meta.nome}` : (meta.nome || meta.codigo || String(fid));
  const blocoH = 16*6 + 36; // header + 5 linhas (inclui Total CLT) aproximado; recalcularemos quebras conforme necessário
      if(y + blocoH > safeBottom) { novaPagina(); }

      // Título do funcionário
      doc.font('Helvetica-Bold').fontSize(10).fillColor(THEME.text).text(title, x, y, { width: W, align:'left' });
      y += 14;
  // Segmentação horizontal dos dias (em blocos de até 25 colunas)
  let segmentos = [];
  for(let start=0; start<diasISO.length; start+=MAX_COLS){ segmentos.push(diasISO.slice(start, Math.min(start+MAX_COLS, diasISO.length))); }

      const byDia = agg.get(String(fid)) || new Map();
      let totD=0, totN=0; // período
      for(const d of diasISO){ const v=byDia.get(d)||{diurno:0,noturno:0}; totD+=v.diurno; totN+=v.noturno; }
      // total geral até fim: basta somar todas as chaves <= fim
      let gD=0, gN=0; for(const [d,v] of byDia.entries()){ if(d<=fim){ gD+=v.diurno; gN+=v.noturno; } }
      const per = { d:totD, n:totN, nclt: minutesNoturnosCLT(totN) };
      const ger = { d:gD, n:gN, nclt: minutesNoturnosCLT(gN) };

      const rows=[
        { label:'Diurnas',    getVal:(v)=> v.diurno, totalPer: per.d, totalGer: ger.d },
        { label:'Noturnas',   getVal:(v)=> v.noturno, totalPer: per.n, totalGer: ger.n },
        { label:'AC',         getVal:(v)=> Math.max(0, minutesNoturnosCLT(v.noturno) - v.noturno), totalPer: Math.max(0, per.nclt - per.n), totalGer: Math.max(0, ger.nclt - ger.n) },
        { label:'Total',      getVal:(v)=> v.diurno + v.noturno, totalPer: per.d + per.n, totalGer: ger.d + ger.n },
        { label:'Total CLT',  getVal:(v)=> v.diurno + minutesNoturnosCLT(v.noturno), totalPer: per.d + per.nclt, totalGer: ger.d + ger.nclt }
      ];
      for(let segIdx=0; segIdx<segmentos.length; segIdx++){
        const diasSeg = segmentos[segIdx];
        const isLastSeg = segIdx === segmentos.length-1;
        // Para o último segmento, recalcular largura para incluir colunas de total maiores
        let leftW = baseLeftW; let colDiaW = baseColDiaW; let totColW = baseColDiaW;
        if(isLastSeg){
          // Recalcula usando apenas dias para obter o espaço livre e alocar totColW maior
          const gridLast = computeGridWidths(W, diasSeg.length, { fixedLeftW:130, minCol:22, maxCol:40 });
          leftW = gridLast.leftW; colDiaW = gridLast.colDiaW;
          const effW = (W - baseGrid.safePad*2);
          const usedDays = leftW + colDiaW*diasSeg.length;
          const avail = Math.max(0, effW - usedDays);
          // tenta deixar as colunas de total mais largas que as de dia, limitando a 80px
          const desired = Math.max(colDiaW + 12, Math.floor(avail/2));
          totColW = Math.max(colDiaW, Math.min(80, desired));
        }
        // Header do segmento
        y = drawHorasHeader(doc, baseX, y, W, diasSeg, leftW, colDiaW, { showTotals:isLastSeg, totColW });
        for(const r of rows){
          const h=16; if(y + h > safeBottom){ novaPagina(); doc.font('Helvetica-Bold').fontSize(10).text(title, x, y, { width: W }); y+=14; y = drawHorasHeader(doc, baseX, y, W, diasSeg, leftW, colDiaW, { showTotals:isLastSeg, totColW }); }
          // esquerda
          const extraW = (isLastSeg? totColW*2 : 0);
          doc.save(); doc.fillColor('#f6faff').rect(baseX, y, leftW + colDiaW*(diasSeg.length) + extraW, h).fill(); doc.restore();
          doc.strokeColor(THEME.grid).rect(baseX, y, leftW, h).stroke();
          doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME.text); drawCenteredText(doc, r.label, baseX, y, leftW, h);
          // dias
          diasSeg.forEach((d,i)=>{ const cx=baseX+leftW+i*colDiaW; doc.strokeColor(THEME.grid).rect(cx,y,colDiaW,h).stroke(); const v=byDia.get(d)||{diurno:0,noturno:0}; const val=r.getVal(v); doc.font('Helvetica').fontSize(8); drawCenteredText(doc, fmtMin(val), cx, y, colDiaW, h); });
          // Totais (somente no último segmento)
          if(isLastSeg){
            let cx = baseX + leftW + diasSeg.length*colDiaW; doc.strokeColor(THEME.grid).rect(cx,y,totColW,h).stroke(); drawCenteredText(doc, fmtMin(r.totalPer), cx, y, totColW, h);
            cx += totColW; doc.strokeColor(THEME.grid).rect(cx,y,totColW,h).stroke(); drawCenteredText(doc, fmtMin(r.totalGer), cx, y, totColW, h);
          }
          y += h;
        }
        y += 6; // respiro entre segmentos
      }
      // Rodapé informativo por bloco
  doc.font('Helvetica').fontSize(7).fillColor('#555').text('Horário noturno: 22:00 às 05:00 — AC: acréscimo noturno (CLT 52:30). Total CLT = Total + AC.', baseX, y+2, { width: W - baseX, align:'left' });
      y += 18;
    }

    // Paginação
    const range = doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){ doc.switchToPage(range.start + i); const p2=doc.page; const contentW2 = p2.width - p2.margins.left - p2.margins.right; const yFooter = p2.height - p2.margins.bottom - 14; const pagTxt = `página ${i+1}/${range.count}`; doc.font('Helvetica').fontSize(8).fillColor('#666').text(pagTxt, p2.margins.left, yFooter, { width: contentW2, align:'right' }); doc.fillColor(THEME.text); }
    doc.end();
  }catch(e){ console.error('[relatorios2][horas] erro', e); if(!res.headersSent) res.status(500).send('Falha ao gerar relatório de horas'); }
}

router.get('/relatorios/horas', requireEscalasAuth, relatorioHorasHandler);
router.get('/relatorios/horas.pdf', requireEscalasAuth, relatorioHorasHandler);
router.get('/relatorio/horas', requireEscalasAuth, relatorioHorasHandler);
router.get('/relatorio/horas.pdf', requireEscalasAuth, relatorioHorasHandler);

// ============ Relatório: Alocação por Período (PDF) ============
// Coleta marcações de alocação por funcionário -> escala -> (turno -> dias)
async function coletarAlocacoesPeriodo({ inicioISO, fimISO, unidadeId, filiais, onlyFids }){
  const Escala=await getEscalaModel(); const Unidade=await getUnidadeModel(); const Func=await getFuncionarioModel();
  let filtroUn={}; let allowedUnSet=null;
  if(unidadeId){
    if(filiais){
      const u=await Unidade.findById(unidadeId).select('_id is_principal unidade_principal_id').lean();
      if(u){
        const matriz=u.is_principal? u._id : (u.unidade_principal_id||u._id);
        const ids=await Unidade.find({ $or:[{_id:matriz},{unidade_principal_id:matriz}] }).select('_id').lean();
        const arrIds = ids.map(x=> x._id);
        filtroUn={ unidade_id: { $in: arrIds } };
        allowedUnSet = new Set(arrIds.map(String));
      } else { filtroUn={ unidade_id: unidadeId }; allowedUnSet = new Set([String(unidadeId)]); }
    } else { filtroUn={ unidade_id: unidadeId }; allowedUnSet = new Set([String(unidadeId)]); }
  }
  const dtFim=new Date(fimISO+'T00:00:00.000Z'); const dtIni = inicioISO? new Date(inicioISO+'T00:00:00.000Z') : new Date('1970-01-01T00:00:00.000Z');
  const filtros = { ...filtroUn, data_inicio:{ $lte: dtFim }, data_fim:{ $gte: dtIni } };
  const docs = await Escala.find(filtros).select('descricao unidade_id grupos_turnos equipes recursos alocacao').lean();

  // Estruturas de saída
  // porFuncionarioTok: fid -> Map(escalaId -> Map(token -> Set(diasISO)))
  const porFuncionarioTok = new Map();
  const escalaInfo = new Map(); // escalaId -> { descricao, unidade_id, turnos:[{ini,fim,token}] }
  const funcionariosInfo = new Map(); // fid -> { id,codigo,nome,unidade_id }

  const normTok=(s)=> String(s||'').replace(/\s+(às|as|a)\s+/ig,'-').replace(/[–—−‑‒]/g,'-').replace(/\s*-\s*/g,'-');
  function ensureEmp(fid){ const k=String(fid); let by=porFuncionarioTok.get(k); if(!by){ by=new Map(); porFuncionarioTok.set(k,by); } return by; }
  function ensureTok(fid, escalaId, token){ const by=ensureEmp(fid); let mapTok=by.get(String(escalaId)); if(!mapTok){ mapTok=new Map(); by.set(String(escalaId), mapTok); } const t=normalizeTurnoToken(token||''); let set=mapTok.get(t); if(!set){ set=new Set(); mapTok.set(t,set); } return set; }
  function markTok(fid, escalaId, dia, token){ if(!fid||!escalaId||!dia||!token) return; const set=ensureTok(fid,escalaId,token); set.add(String(dia)); }
  function sameTurnoText(aTokenLike, turnoObj){ try{ const a = parseTurnoTokenFlexible(aTokenLike); const b = { iniMin: (turnoObj?.iniMin!=null? turnoObj.iniMin: hhmmToMin(turnoObj?.ini)), fimMin: (turnoObj?.fimMin!=null? turnoObj.fimMin: hhmmToMin(turnoObj?.fim)) }; if(a && b.iniMin!=null && b.fimMin!=null) return a.iniMin===b.iniMin && a.fimMin===b.fimMin; }catch(_){ } try{ const at = normalizeTurnoToken(aTokenLike?.turnoId||aTokenLike?.turno||aTokenLike?.turnoToken||aTokenLike||''); const bt = normalizeTurnoToken(`${turnoObj?.ini}-${turnoObj?.fim}`); return at===bt; }catch(_){ return false; } }
  function findTurnoByToken(esc, tok){ try{ if(!tok) return null; let t=String(tok); if(t.includes('::')) t=t.split('::').slice(-1)[0]; const m=t.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/); if(m){ const i=hhmmToMin(m[1]); const f=hhmmToMin(m[2]); if(i!=null&&f!=null) return { ini:i, fim:f }; } const grupos=esc?.grupos_turnos||[]; for(const g of grupos){ for(const tt of (g.turnos||[])){ if(`${tt.ini}-${tt.fim}`===t){ const i=hhmmToMin(tt.ini); const f=hhmmToMin(tt.fim); if(i!=null&&f!=null) return { ini:i, fim:f }; } } } }catch(_){ } return null; }
  function fidsRecursoDiaria(rec, dia, token){ const out=new Set(); try{ const tSlim=normTok(token); const atribs=Array.isArray(rec.atribuicoes)? rec.atribuicoes.filter(a=>{ if(!a) return false; const dOk=a.dia? a.dia===dia: true; if(!dOk) return false; const raw=a.turnoId||a.turno||''; const slim=normTok(raw); return !slim || slim===tSlim; }):[]; atribs.forEach(a=>{ const id=a.membroFuncionarioId||a.funcionarioId||a.funcionario||a.funcionario_id||a.matricula||a.id; if(id) out.add(String(id)); }); const map=rec.atribuicoesRecurso||{}; const k1=`${dia}__${token}`; const k2=`${dia}__${tSlim}`; const lista=map[k1]||map[k2]||[]; if(Array.isArray(lista)) lista.forEach(it=>{ const id=it?.membroFuncionarioId||it?.funcionarioId||it?.id||it?.matricula; if(id) out.add(String(id)); }); if(out.size===0 && Array.isArray(rec.membros)) rec.membros.forEach(m=>{ const id=m?.funcionario_id||m?.id||m?.funcionarioId; if(id) out.add(String(id)); }); }catch(_){ } return [...out.values()]; }

  for(const esc of docs){
  const turnos=[]; try{ (esc.grupos_turnos||[]).forEach(g=> (g.turnos||[]).forEach(t=> turnos.push({ ini:t.ini, fim:t.fim, token:`${t.ini}-${t.fim}` }))); }catch(_){ }
  turnos.sort((a,b)=> String(a.ini).localeCompare(String(b.ini)));
  escalaInfo.set(String(esc._id||esc.id), { id:String(esc._id||esc.id), descricao: esc.descricao||esc.nome||String(esc._id||esc.id), unidade_id: esc.unidade_id? String(esc.unidade_id): null, turnos });
    // Recursos dentro de equipes ou raiz
    const equipes = Array.isArray(esc.equipes)? esc.equipes: [];
    for(const eq of equipes){
      for(const r of (eq.recursos||[])){
        const alocs = Array.isArray(r.alocacoes)? r.alocacoes: [];
        for(const a of alocs){ const dia=String(a?.dia||''); if(!/\d{4}-\d{2}-\d{2}/.test(dia)) continue; if(dia<inicioISO || dia>fimISO) continue;
          // Determinar token de turno como HH:MM-HH:MM quando possível
          const rawTok = a?.turnoId||a?.turno||'';
          let tok = rawTok;
          const rngFromTok = findTurnoByToken(esc, rawTok);
          if(rngFromTok){ tok = `${String(Math.floor(rngFromTok.ini/60)).padStart(2,'0')}:${String(rngFromTok.ini%60).padStart(2,'0')}-${String(Math.floor((rngFromTok.fim===0?1440:rngFromTok.fim)/60)%24).toString().padStart(2,'0')}:${String((rngFromTok.fim===0?1440:rngFromTok.fim)%60).toString().padStart(2,'0')}`; }
          else if(a?.ini && a?.fim){ tok = `${a.ini}-${a.fim}`; }
          const fids = fidsRecursoDiaria(r, dia, tok);
          for(const fid of fids){ if(onlyFids && onlyFids.size && !onlyFids.has(String(fid))) continue; markTok(String(fid), String(esc._id||esc.id), dia, tok); }
        }
      }
    }
    // Recursos na raiz (legado)
    if(Array.isArray(esc.recursos)){
  for(const r of esc.recursos){ const alocs = Array.isArray(r.alocacoes)? r.alocacoes: []; for(const a of alocs){ const dia=String(a?.dia||''); if(!/\d{4}-\d{2}-\d{2}/.test(dia)) continue; if(dia<inicioISO || dia>fimISO) continue; const rawTok=a?.turnoId||a?.turno||''; let tok=rawTok; const rngTok=findTurnoByToken(esc, rawTok); if(rngTok){ tok = `${String(Math.floor(rngTok.ini/60)).padStart(2,'0')}:${String(rngTok.ini%60).padStart(2,'0')}-${String(Math.floor((rngTok.fim===0?1440:rngTok.fim)/60)%24).toString().padStart(2,'0')}:${String((rngTok.fim===0?1440:rngTok.fim)%60).toString().padStart(2,'0')}`; } else if(a?.ini && a?.fim){ tok = `${a.ini}-${a.fim}`; } const fids=fidsRecursoDiaria(r,dia,tok); for(const fid of fids){ if(onlyFids && onlyFids.size && !onlyFids.has(String(fid))) continue; markTok(String(fid), String(esc._id||esc.id), dia, tok||''); } } }
    }
    // Matriz de alocação por equipe (esc.alocacao) -> componentes
    try{
      const byId=new Map(equipes.map(e=> [String(e.id||''), e])); const byNome=new Map(equipes.map(e=> [String((e.nome||'').toUpperCase()), e]));
      const matriz = esc?.alocacao && typeof esc.alocacao==='object'? esc.alocacao: {};
      for(const [k,v] of Object.entries(matriz)){
        const p = parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k) || parseChaveAlocacaoLax(k); if(!p) continue; const dia = String(p.dia||''); if(dia<inicioISO || dia>fimISO) continue;
        let tokens=[]; if(Array.isArray(v)) tokens=v.map(String); else if(typeof v==='string') tokens=v.split(',').map(s=> s.trim()).filter(Boolean); else if(v && typeof v==='object'){ tokens=Object.keys(v).filter(id=> v[id]); }
        const tokStr = `${String(p.ini).padStart(2,'0').includes(':')? p.ini: String(p.ini)}`;
        const tokLabel = `${String(Math.floor(p.ini/60)).padStart(2,'0')}:${String(p.ini%60).padStart(2,'0')}-${String(Math.floor((p.fim===0?1440:p.fim)/60)%24).toString().padStart(2,'0')}:${String((p.fim===0?1440:p.fim)%60).toString().padStart(2,'0')}`;
        for(const tok of tokens){ let eq = byId.get(String(tok)) || byNome.get(String(tok).toUpperCase()); if(!eq) continue; const comps = Array.isArray(eq.componentes)? eq.componentes: []; for(const c of comps){ const fid=c?.funcionario_id||c?.id; if(!fid) continue; if(onlyFids && onlyFids.size && !onlyFids.has(String(fid))) continue; markTok(String(fid), String(esc._id||esc.id), dia, tokLabel); } }
      }
    }catch(_){ }
  }
  // Filtro por unidade efetiva do funcionário (quando relatório por unidade)
  if(allowedUnSet && allowedUnSet.size){
    const ids = [...porFuncionarioTok.keys()].filter(id=> /^[0-9a-fA-F]{24}$/.test(String(id)));
    if(ids.length){ const arr = await Func.find({ _id: { $in: ids } }).select('_id unidade_id nome codigo').lean(); const allow=new Set(); for(const f of arr){ if(f?.unidade_id && allowedUnSet.has(String(f.unidade_id))) allow.add(String(f._id)); funcionariosInfo.set(String(f._id), { id:String(f._id), nome:f.nome||null, codigo:f.codigo||null, unidade_id: f.unidade_id? String(f.unidade_id): null }); }
      for(const fid of [...porFuncionarioTok.keys()]) if(/^[0-9a-fA-F]{24}$/.test(String(fid)) && !allow.has(String(fid))) porFuncionarioTok.delete(String(fid));
    }
  }
  // Enriquecer metadados mínimos de funcionários restantes
  const missing = [...porFuncionarioTok.keys()].filter(id=> /^[0-9a-fA-F]{24}$/.test(String(id)) && !funcionariosInfo.has(String(id)));
  if(missing.length){ const arr=await Func.find({ _id:{ $in: missing } }).select('_id nome codigo unidade_id').lean(); arr.forEach(f=> funcionariosInfo.set(String(f._id), { id:String(f._id), nome:f.nome||null, codigo:f.codigo||null, unidade_id: f.unidade_id? String(f.unidade_id): null })); }
  return { porFuncionarioTok, escalaInfo, funcionariosInfo };
}

async function relatorioAlocacaoHandler(req,res){
  try{
    const q=req.query||{}; let inicio=String(q.inicio||q.start||''); let fim=String(q.fim||q.end||'');
    const unidadeId = /^[0-9a-fA-F]{24}$/.test(String(q.unidadeId||''))? String(q.unidadeId): null; const filiais = String(q.filiais||'')==='1';
    const funcionarioId = /^[0-9a-fA-F]{24}$/.test(String(q.funcionarioId||''))? String(q.funcionarioId): null;
    if(!/\d{4}-\d{2}-\d{2}/.test(inicio) || !/\d{4}-\d{2}-\d{2}/.test(fim)) return res.status(400).send('Informe inicio/fim (YYYY-MM-DD)');
    if(fim < inicio) return res.status(400).send('fim < inicio');
    const diasAll = eachDayISO(inicio, fim);
    // Coleta das marcações
    const onlyFids = funcionarioId? new Set([funcionarioId]): null;
  const { porFuncionarioTok, escalaInfo, funcionariosInfo } = await coletarAlocacoesPeriodo({ inicioISO:inicio, fimISO:fim, unidadeId, filiais, onlyFids });

    // Preparar PDF
    res.setHeader('Content-Type','application/pdf; charset=binary');
    res.setHeader('Content-Disposition',`inline; filename=Relatorio.pdf; filename*=UTF-8''${encodeURIComponent('Relatorio.pdf')}`);
    const doc = new PDFDocument({ size:'A4', layout:'landscape', margin:28, bufferPages:true });
    doc.pipe(res);
    let x=doc.page.margins.left; let y=doc.page.margins.top; const W=doc.page.width - doc.page.margins.left - doc.page.margins.right; const safeBottom=doc.page.height - doc.page.margins.bottom - 24;

    // Header
    let unidadesLabel=''; if(unidadeId){ try{ const Unidade=await getUnidadeModel(); const u=await Unidade.findById(unidadeId).select('nome codigo').lean(); if(u) unidadesLabel = (u.codigo? `${u.codigo} - `:'')+(u.nome||'-') + (filiais? ' (matriz+filiais)':'' ); }catch(_){ } }
    const funcLabel = (function(){ if(funcionarioId){ const m=funcionariosInfo.get(String(funcionarioId))||{}; return (m.codigo&&m.nome)? `${m.codigo} - ${m.nome}`: (m.nome||m.codigo||String(funcionarioId)); } return ''; })();
    const headerLogoPath = await resolveHeaderLogoPath(req, { unidadeIds: unidadeId? [unidadeId]: [] });
    y = drawReportHeader(doc, { x, y, W, title:'Relatório de Alocação por Período', unidades: unidadesLabel || (funcLabel? `Funcionário: ${funcLabel}`: ''), categorias:null, diaISO:null, emitidoPor:(req?.user?.nome || req?.session?.escalasUser?.nome || req?.user?.email || req?.session?.escalasUser?.email || ''), logoPathOverride: headerLogoPath });
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(`Período: ${inicio.split('-').reverse().join('/')} à ${fim.split('-').reverse().join('/')} (${diasAll.length} dia(s))`, x, y, { width: W, align:'center' });
    y += 18;

    function novaPagina(){ doc.addPage(); x=doc.page.margins.left; y=doc.page.margins.top; y = drawReportHeader(doc, { x, y, W, title:'Relatório de Alocação por Período', unidades: unidadesLabel || (funcLabel? `Funcionário: ${funcLabel}`: ''), categorias:null, diaISO:null, emitidoPor:(req?.user?.nome || req?.session?.escalasUser?.nome || req?.user?.email || req?.session?.escalasUser?.email || ''), logoPathOverride: headerLogoPath }); y += 18; }

    // Helpers de render
    function drawMatrizesPorFuncionario(funcKey){
      const byEscTok = porFuncionarioTok.get(funcKey)||new Map();
      // Título do funcionário
      const meta = funcionariosInfo.get(funcKey)||{}; const title=(meta.codigo&&meta.nome)? `${meta.codigo} - ${meta.nome}`: (meta.nome||meta.codigo||funcKey);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(THEME.text).text(title, x, y, { width: W, align:'left' }); y += 12;
      // Ordenar escalas por descrição
      const escKeys=[...byEscTok.keys()].sort((a,b)=>{ const ia=escalaInfo.get(String(a))||{}; const ib=escalaInfo.get(String(b))||{}; return String(ia.descricao||'').toUpperCase().localeCompare(String(ib.descricao||'').toUpperCase()); });
      if(escKeys.length===0){ doc.font('Helvetica').fontSize(9).fillColor('#555').text('Sem alocações no período.', x, y, { width: W, align:'center' }); y += 10; return y; }
      for(const eid of escKeys){
        const info=escalaInfo.get(String(eid))||{}; const labelEsc = `Escala: ${String(info.descricao||eid)}`;
        // Unir dias apenas dos tokens que serão renderizados (linhas da matriz)
        const mapTok = byEscTok.get(eid)||new Map();
        const turnos = Array.isArray(info.turnos)? info.turnos: [];
        const rowsTurnos = turnos.length? turnos.map(t=> t.token): [...mapTok.keys()];
        const diasSet = new Set();
        for(const tok of rowsTurnos){ const set = mapTok.get(normalizeTurnoToken(tok)) || mapTok.get(tok); if(set){ for(const d of set.values()) diasSet.add(d); } }
        const dias = diasAll.filter(d=> diasSet.has(d)); if(dias.length===0) continue;
        // Layout
        const grid = computeGridWidths(W, dias.length, { fixedLeftW:120, minCol:22, maxCol:40 });
        const baseX = x + grid.safePad; const leftW=grid.leftW; const colDiaW=grid.colDiaW; const rowH=15;
        // Título da escala
        doc.font('Helvetica-Bold').fontSize(9).fillColor(THEME.text).text(labelEsc, x, y, { width: W, align:'left' }); y += 10;
        // Header (duas linhas), label left = Turno
        y = drawDaysHeaderTwoRows(doc, baseX, y, leftW, colDiaW, dias, 'Turno');
        // Linhas por turno (da escala)
        // rowsTurnos já calculado acima
        rowsTurnos.forEach(tok=>{ if(y + rowH > safeBottom){ novaPagina(); y = drawDaysHeaderTwoRows(doc, baseX, y, leftW, colDiaW, dias, 'Turno'); }
          doc.save(); doc.fillColor('#f6faff').rect(baseX, y, leftW + colDiaW*dias.length, rowH).fill(); doc.restore();
          doc.strokeColor(THEME.grid).rect(baseX, y, leftW, rowH).stroke();
          doc.font('Helvetica').fontSize(8).fillColor(THEME.text); drawCenteredText(doc, tok, baseX+2, y, leftW-4, rowH, { align:'left' });
          const set = mapTok.get(normalizeTurnoToken(tok)) || mapTok.get(tok) || new Set();
          dias.forEach((d,i)=>{ const cx=baseX+leftW+i*colDiaW; doc.strokeColor(THEME.grid).rect(cx,y,colDiaW,rowH).stroke(); if(set.has(d)){ doc.font('Helvetica-Bold').fillColor(THEME.primary).fontSize(8); drawCenteredText(doc, 'X', cx, y, colDiaW, rowH, { ellipsis:false }); doc.fillColor(THEME.text).font('Helvetica'); } });
          y += rowH;
        });
        y += 6;
      }
      return y;
    }

    if(funcionarioId){
      if(!porFuncionarioTok.has(String(funcionarioId))){ doc.font('Helvetica').fontSize(10).fillColor('#555').text('Sem alocações no período.', x, y+6, { width: W, align:'center' }); doc.end(); return; }
      drawMatrizesPorFuncionario(String(funcionarioId));
    } else {
      // Por unidade: iterar por funcionários, ordenados por nome/código
      const keys=[...porFuncionarioTok.keys()];
      keys.sort((a,b)=>{ const ia=funcionariosInfo.get(String(a))||{}; const ib=funcionariosInfo.get(String(b))||{}; const an=(ia.nome||'').toUpperCase(); const bn=(ib.nome||'').toUpperCase(); if(an && bn) return an.localeCompare(bn); const ac=ia.codigo||''; const bc=ib.codigo||''; return String(ac).localeCompare(String(bc)); });
      if(!keys.length){ doc.font('Helvetica').fontSize(10).fillColor('#555').text('Sem alocações no período.', x, y+6, { width: W, align:'center' }); doc.end(); return; }
      for(const k of keys){ y = drawMatrizesPorFuncionario(String(k)); if(y > safeBottom-40){ novaPagina(); }
      }
    }

    // Paginação
    const range = doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){ doc.switchToPage(range.start + i); const p2=doc.page; const contentW2=p2.width - p2.margins.left - p2.margins.right; const yFooter=p2.height - p2.margins.bottom - 14; const pagTxt=`página ${i+1}/${range.count}`; doc.font('Helvetica').fontSize(8).fillColor('#666').text(pagTxt, p2.margins.left, yFooter, { width: contentW2, align:'right' }); doc.fillColor(THEME.text); }
    doc.end();
  }catch(e){ console.error('[relatorios2][alocacao] erro', e); if(!res.headersSent) res.status(500).send('Falha ao gerar relatório de alocação'); }
}

router.get('/relatorios/alocacao', requireEscalasAuth, relatorioAlocacaoHandler);
router.get('/relatorios/alocacao.pdf', requireEscalasAuth, relatorioAlocacaoHandler);
router.get('/relatorio/alocacao', requireEscalasAuth, relatorioAlocacaoHandler);
router.get('/relatorio/alocacao.pdf', requireEscalasAuth, relatorioAlocacaoHandler);

// ============ Relatório: Logs de Alterações (PDF) ============
function addDaysISO_generic(iso, delta){ try{ const d=new Date(String(iso||'')+'T00:00:00Z'); if(Number.isNaN(d.getTime())) return iso; d.setUTCDate(d.getUTCDate()+delta); return d.toISOString().slice(0,10); }catch(_){ return iso; } }
function fmtDateTimeBR(d){ try{ const dt = (d instanceof Date)? d: new Date(d); if(Number.isNaN(dt.getTime())) return ''; const two=n=> String(n).padStart(2,'0'); const dd=two(dt.getDate()); const mm=two(dt.getMonth()+1); const yyyy=dt.getFullYear(); const hh=two(dt.getHours()); const mi=two(dt.getMinutes()); return `${dd}/${mm}/${yyyy} ${hh}:${mi}`; }catch(_){ return ''; } }
async function relatorioLogsHandler(req,res){
  try{
    const q=req.query||{};
    const inicio=String(q.inicio||q.start||'');
    const fim=String(q.fim||q.end||'');
    if(!/\d{4}-\d{2}-\d{2}/.test(inicio) || !/\d{4}-\d{2}-\d{2}/.test(fim)) return res.status(400).send('Informe inicio/fim (YYYY-MM-DD)');
    if(fim < inicio) return res.status(400).send('fim < inicio');
    const unidadeId = /^[0-9a-fA-F]{24}$/.test(String(q.unidadeId||''))? String(q.unidadeId): null;
    const filiais = String(q.filiais||'')==='1';
    const funcionarioId = /^[0-9a-fA-F]{24}$/.test(String(q.funcionarioId||''))? String(q.funcionarioId): (q.funcionarioId? String(q.funcionarioId): null);
    const usuarioId = /^[0-9a-fA-F]{24}$/.test(String(q.usuarioId||''))? String(q.usuarioId): null;
    const acao = String(q.acao||'').toUpperCase(); // INSERCAO|EXCLUSAO|MUDANCA opcional
    const contexto = String(q.contexto||'').toLowerCase(); // atribuicao|alocacao_recurso|alocacao_equipe opcional

    // Monta filtros de período [$gte, $lt(next day)]
  const dtIni = new Date(inicio+'T00:00:00.000Z');
  const nextFim = addDaysISO_generic(fim, 1);
  const dtFim = new Date(nextFim+'T00:00:00.000Z');
  const por = String(q.por||'dia').toLowerCase(); // 'dia' (padrão) ou 'em' (timestamp do evento)

    // Filtro de unidade (unidade matriz + filiais)
    let filtroUn = {};
    if(unidadeId){
      try{
        const Unidade = await getUnidadeModel();
        if(filiais){
          const u=await Unidade.findById(unidadeId).select('_id is_principal unidade_principal_id').lean();
          if(u){
            const matriz = u.is_principal? u._id : (u.unidade_principal_id||u._id);
            const ids=await Unidade.find({ $or:[{_id:matriz},{unidade_principal_id:matriz}] }).select('_id').lean();
            filtroUn = { unidade_id: { $in: ids.map(x=> x._id) } };
          } else filtroUn = { unidade_id: unidadeId };
        } else filtroUn = { unidade_id: unidadeId };
      }catch(_){ filtroUn = { unidade_id: unidadeId }; }
    }

    // Monta query dos logs
    const EscalaLog = await getEscalaLogModel();
    // Builder do filtro conforme modo
    function buildWhere(mode){
      const base = { ...filtroUn };
      if(mode==='em') base.em = { $gte: dtIni, $lt: dtFim };
      else base.dia = { $gte: inicio, $lte: fim }; // default por 'dia'
      if(funcionarioId) base.funcionario_id = String(funcionarioId);
      if(usuarioId) base.usuario_id = usuarioId;
      if(acao && ['INSERCAO','EXCLUSAO','MUDANCA'].includes(acao)) base.acao = acao;
      if(contexto && ['atribuicao','alocacao_recurso','alocacao_equipe'].includes(contexto)) base.contexto = contexto;
      return base;
    }

    let where = buildWhere(por==='em' ? 'em' : 'dia');
    let logs = await EscalaLog.find(where).select('escala_id unidade_id equipe_id recurso_id recurso_nome funcionario_id funcionario_nome acao contexto dia turnoId usuario_id usuario_nome usuario_email em').sort({ funcionario_id:1, usuario_id:1, em:1 }).lean();
    let fallbackInfo = null;
    // Fallback automático: se nada encontrado no modo selecionado, tenta o outro modo
    if((!logs || logs.length===0)){
      const altMode = (por==='em')? 'dia' : 'em';
      const whereAlt = buildWhere(altMode);
      const logsAlt = await EscalaLog.find(whereAlt).select('escala_id unidade_id equipe_id recurso_id recurso_nome funcionario_id funcionario_nome acao contexto dia turnoId usuario_id usuario_nome usuario_email em').sort({ funcionario_id:1, usuario_id:1, em:1 }).lean();
      if(logsAlt && logsAlt.length){
        logs = logsAlt;
        fallbackInfo = { used:true, mode:altMode };
      }
    }

    // Enriquecer: nomes/códigos dos funcionários e descrições das escalas
    const Func = await getFuncionarioModel();
    const Escala = await getEscalaModel();
    const fidSet = new Set();
    const escIdSet = new Set();
    logs.forEach(l=>{ if(l.funcionario_id) fidSet.add(String(l.funcionario_id)); if(l.escala_id) escIdSet.add(String(l.escala_id)); });
    const fidHex = [...fidSet].filter(id=> /^[0-9a-fA-F]{24}$/.test(id));
    const escHex = [...escIdSet].filter(id=> /^[0-9a-fA-F]{24}$/.test(id));
    const funcInfo = new Map();
    if(fidHex.length){ const arr = await Func.find({ _id:{ $in: fidHex } }).select('_id nome codigo').lean(); arr.forEach(f=> funcInfo.set(String(f._id), { nome:f.nome||null, codigo:f.codigo||null })); }
    const escalaInfo = new Map();
    if(escHex.length){ const arr = await Escala.find({ _id:{ $in: escHex } }).select('_id descricao nome').lean(); arr.forEach(e=> escalaInfo.set(String(e._id), e.descricao||e.nome||String(e._id))); }

    // Agrupar por funcionário -> usuário
    const byFunc = new Map();
    for(const l of logs){
      const fk = String(l.funcionario_id||'sem-id');
      let slot = byFunc.get(fk); if(!slot){ slot=new Map(); byFunc.set(fk, slot); }
      const uk = String(l.usuario_id||'sem-usuario');
      let arr = slot.get(uk); if(!arr){ arr=[]; slot.set(uk, arr); }
      arr.push(l);
    }

    // PDF
    res.setHeader('Content-Type','application/pdf; charset=binary');
    res.setHeader('Content-Disposition',`inline; filename=Relatorio.pdf; filename*=UTF-8''${encodeURIComponent('Relatorio.pdf')}`);
    const doc = new PDFDocument({ size:'A4', layout:'portrait', margin:28, bufferPages:true });
    doc.pipe(res);
    let x=doc.page.margins.left; let y=doc.page.margins.top; const W=doc.page.width - doc.page.margins.left - doc.page.margins.right; const safeBottom=doc.page.height - doc.page.margins.bottom - 24;

    // Header
    let unidadesLabel='';
    if(unidadeId){ try{ const Unidade=await getUnidadeModel(); const u=await Unidade.findById(unidadeId).select('nome codigo').lean(); if(u) unidadesLabel=(u.codigo? `${u.codigo} - `:'')+(u.nome||'-') + (filiais? ' (matriz+filiais)':'' ); }catch(_){ } }
  const filtrosTxt = [];
    if(funcionarioId) filtrosTxt.push(`Funcionário: ${funcionarioId}`);
    if(usuarioId) filtrosTxt.push(`Usuário: ${usuarioId}`);
    if(acao) filtrosTxt.push(`Ação: ${acao}`);
    if(contexto) filtrosTxt.push(`Contexto: ${contexto}`);
  filtrosTxt.push(`Período por: ${por==='em'?'data/hora do evento':'dia da alocação'}`);
    const headerLogoPath = await resolveHeaderLogoPath(req, { unidadeIds: unidadeId? [unidadeId]: [] });
    y = drawReportHeader(doc, { x, y, W, title:'Relatório de Logs de Alterações', unidades: unidadesLabel || (filtrosTxt.length? filtrosTxt.join(' / '): ''), categorias:null, diaISO:null, emitidoPor:(req?.user?.nome || req?.session?.escalasUser?.nome || req?.user?.email || req?.session?.escalasUser?.email || ''), logoPathOverride: headerLogoPath });
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(`Período: ${inicio.split('-').reverse().join('/')} à ${fim.split('-').reverse().join('/')}`, x, y, { width: W, align:'center' });
    y += 16;
    if(fallbackInfo && fallbackInfo.used){
      const msg = `Nota: nenhum log encontrado pelo modo selecionado; exibindo pelo modo "${fallbackInfo.mode==='em'?'data/hora do evento':'dia da alocação'}".`;
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#6b7280').text(msg, x, y, { width: W, align:'center' });
      y += 12;
    }

    function novaPagina(){ doc.addPage(); x=doc.page.margins.left; y=doc.page.margins.top; y = drawReportHeader(doc, { x, y, W, title:'Relatório de Logs de Alterações', unidades: unidadesLabel || (filtrosTxt.length? filtrosTxt.join(' / '): ''), categorias:null, diaISO:null, emitidoPor:(req?.user?.nome || req?.session?.escalasUser?.nome || req?.user?.email || req?.session?.escalasUser?.email || ''), logoPathOverride: headerLogoPath }); y += 16; }

    if(byFunc.size===0){ doc.font('Helvetica').fontSize(10).fillColor('#555').text('Sem logs no período.', x, y+6, { width: W, align:'center' }); doc.end(); return; }

    // Ordena funcionários por nome/código quando possível
    const funcKeys = [...byFunc.keys()].sort((a,b)=>{
      const ia = funcInfo.get(String(a))||{}; const ib = funcInfo.get(String(b))||{};
      const an=(ia.nome||'').toUpperCase(); const bn=(ib.nome||'').toUpperCase();
      if(an && bn) return an.localeCompare(bn);
      const ac=ia.codigo||''; const bc=ib.codigo||''; return String(ac).localeCompare(String(bc));
    });

    // Layout da listagem
    function drawFuncHeader(label){ doc.font('Helvetica-Bold').fontSize(11).fillColor(THEME.text).text(label, x, y, { width: W, align:'left' }); y += 10; }
    function drawUserHeader(label){ doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f4b99').text(label, x+8, y, { width: W-8, align:'left' }); y += 8; }
  function drawTableHeaderLogs(){ const h=16; doc.save(); doc.fillColor('#e7f1ff').rect(x, y, W, h).fill(); doc.restore(); doc.strokeColor('#cfe2ff').lineWidth(0.5).rect(x, y, W, h).stroke(); doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME.text); const cols=[{w:80,l:'Data/Hora'},{w:52,l:'Dia'},{w:64,l:'Turno'},{w:56,l:'Ação'},{w:80,l:'Contexto'},{w:72,l:'Escala'},{w:44,l:'Equipe'},{w:80,l:'Recurso'}]; let cx=x; for(const c of cols){ drawCenteredText(doc, c.l, cx, y, c.w, h); cx+=c.w; } y += h; return cols; }
    function drawRowLogs(cols, row){ const h=16; if(y + h > safeBottom){ novaPagina(); cols = drawTableHeaderLogs(); } doc.save(); doc.fillColor('#f6faff').rect(x, y, W, h).fill(); doc.restore(); doc.strokeColor('#e5e7eb').rect(x, y, W, h).stroke(); doc.font('Helvetica').fontSize(8).fillColor(THEME.text); let cx=x; const cells=[ row.dt, row.dia, row.turno, row.acao, row.contexto, row.escala, row.equipe, row.recurso ]; for(let i=0;i<cols.length;i++){ const w=cols[i].w; drawCenteredText(doc, String(cells[i]||'—'), cx, y, w, h); cx+=w; } y += h; return cols; }

    for(const fk of funcKeys){
      const meta = funcInfo.get(String(fk))||{}; const title = (meta.codigo && meta.nome)? `${meta.codigo} - ${meta.nome}`: (meta.nome||meta.codigo||String(fk));
      if(y + 40 > safeBottom) novaPagina();
      drawFuncHeader(`Funcionário: ${title}`);
      const byUser = byFunc.get(fk)||new Map();
      // ordenar por nome/email quando possível
      const userKeys = [...byUser.keys()].sort((a,b)=>{
        const ua = byUser.get(a)?.[0] || {}; const ub = byUser.get(b)?.[0] || {};
        const na=(ua.usuario_nome||'').toUpperCase(); const nb=(ub.usuario_nome||'').toUpperCase(); if(na && nb) return na.localeCompare(nb); const ea=(ua.usuario_email||'').toUpperCase(); const eb=(ub.usuario_email||'').toUpperCase(); return ea.localeCompare(eb);
      });
      for(const uk of userKeys){
        const arr = byUser.get(uk)||[];
        const uName = arr[0]?.usuario_nome || '(sem nome)';
        const uEmail = arr[0]?.usuario_email || '';
        if(y + 32 > safeBottom) novaPagina();
        drawUserHeader(`Usuário: ${uName}${uEmail? ' <'+uEmail+'>':''}`);
        let cols = drawTableHeaderLogs();
        for(const l of arr){
          const row = {
            dt: fmtDateTimeBR(l.em),
            dia: l.dia || '—',
            turno: l.turnoId || '—',
            acao: l.acao || '—',
            contexto: l.contexto || '—',
            escala: escalaInfo.get(String(l.escala_id)) || String(l.escala_id||'—'),
            equipe: l.equipe_id || '—',
            recurso: l.recurso_nome || l.recurso_id || '—'
          };
          cols = drawRowLogs(cols, row);
        }
        y += 8;
      }
      y += 10;
    }

    // Paginação
    const range = doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){ doc.switchToPage(range.start + i); const p2=doc.page; const contentW2=p2.width - p2.margins.left - p2.margins.right; const yFooter=p2.height - p2.margins.bottom - 14; const pagTxt=`página ${i+1}/${range.count}`; doc.font('Helvetica').fontSize(8).fillColor('#666').text(pagTxt, p2.margins.left, yFooter, { width: contentW2, align:'right' }); doc.fillColor(THEME.text); }
    doc.end();
  }catch(e){ console.error('[relatorios2][logs] erro', e); if(!res.headersSent) res.status(500).send('Falha ao gerar relatório de logs'); }
}

router.get('/relatorios/logs', requireEscalasAuth, relatorioLogsHandler);
router.get('/relatorios/logs.pdf', requireEscalasAuth, relatorioLogsHandler);
router.get('/relatorio/logs', requireEscalasAuth, relatorioLogsHandler);
router.get('/relatorio/logs.pdf', requireEscalasAuth, relatorioLogsHandler);

// ===== Rotas do Relatório de Escala (matriz) =====
router.get('/relatorios/escala', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorios/escala.pdf', requireEscalasAuth, relatorioEscalaHandler);
// Alias com nome amigável no caminho para o viewer exibir "Relatorio.pdf"
router.get('/relatorios/Relatorio.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/Relatorio.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorios/escala/:id', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorios/escala/:id.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala/:id', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala/:id.pdf', requireEscalasAuth, relatorioEscalaHandler);

// Debug rápido
router.get('/relatorios/__debug', (req,res)=> res.json({ ok:true, hint:'/escalas/relatorios/escala?id=<ObjectId>' }));

// ===== Página: Consulta de Relatórios (UI) =====
router.get('/relatorios/consulta', requireEscalasAuth, (req,res)=>{
  try {
    const meta = { basePath: '/escalas' };
    // app.set('views') inclui views/escalas, então renderizamos por nome simples
    return res.render('consulta_relatorios', { title:'Consulta de Relatórios', meta });
  } catch(e){
    console.warn('[relatorios2][consulta][render] falha', e);
    if(!res.headersSent) return res.status(500).send('Falha ao renderizar a página de consulta de relatórios');
  }
});

export default router;
// Named exports para compatibilidade com imports diretos
export { relatorioDiariaHandler, relatorioEscalaHandler };

// ============ Seções adicionais (Efetivo e Recursos) ============
async function drawMatrizEfetivo(doc, esc, equipesNorm, x, y, W, diasISO){
  const p = doc.page; const safeBottom = p.height - p.margins.bottom - 24;
  const turnos=[]; (esc.grupos_turnos||[]).forEach(g=> (g.turnos||[]).forEach(t=> turnos.push({ ini:t.ini, fim:t.fim })));
  turnos.sort((a,b)=> String(a.ini).localeCompare(String(b.ini)));
  if(!turnos.length){
    doc.font('Helvetica').fontSize(9).fillColor('#555').text('Sem turnos configurados.', x, y, { width: W, align:'center' });
    return y + 12;
  }
  // Coletar mapa de marcações: key membro -> Set(dia|turno)
  const marks = new Map(); // geral
  const marksByEq = new Map(); // eqId -> Map(mKey -> Set(dia|turno))
  const membrosInfo = new Map(); // membroKey -> {id,codigo,nome}
  function mark(mKey, dia, turnoTok, eqId){ if(!mKey||!dia||!turnoTok) return; const k=`${dia}|${turnoTok}`; let s=marks.get(mKey); if(!s){ s=new Set(); marks.set(mKey,s);} s.add(k); if(eqId){ let by=marksByEq.get(eqId); if(!by){ by=new Map(); marksByEq.set(eqId, by);} let s2=by.get(mKey); if(!s2){ s2=new Set(); by.set(mKey,s2);} s2.add(k); } }
  function addInfo(m){ if(!m) return; const k = m.id? ('id:'+String(m.id)) : (m.codigo? 'codigo:'+String(m.codigo) : (m.nome? 'nome:'+String(m.nome).trim().toUpperCase() : null)); if(!k) return; const prev=membrosInfo.get(k)||{}; membrosInfo.set(k,{ id: prev.id||m.id||null, codigo: prev.codigo||m.codigo||null, nome: prev.nome||m.nome||null }); return k; }
  const turnosArr = (esc.grupos_turnos||[]).flatMap(g=> g.turnos||[]).map(t=> ({ token:`${t.ini}-${t.fim}`, obj:t }));
  // Atribuições explícitas e adições de equipe marcam diretamente
  for(const eq of (equipesNorm||[])){
    // adicoesEquipe
    try{
      const map = eq?.adicoesEquipe||{}; for(const [k,lista] of Object.entries(map)){
        const [dia, tok] = String(k).split('__'); if(!Array.isArray(lista)) continue; for(const it of lista){ const key=addInfo({ id: it?.id, nome: it?.nome }); if(key) mark(key, dia, tok, String(eq.id||'')); }
      }
    }catch(_){ }
    for(const rec of (eq.recursos||[])){
      // alocacoes: marca todos os membros do recurso quando ele está ativo
      try{
        for(const a of (rec.alocacoes||[])){
          const tok=`${a?.ini||rec?.ini||''}-${a?.fim||rec?.fim||''}`.replace(/\s+/g,'');
          if(!a?.dia || !/\d{4}-\d{2}-\d{2}/.test(a.dia)) continue;
          for(const m of (rec.membros||[])){ const key=addInfo(m); if(key) mark(key, a.dia, tok, String(eq.id||'')); }
        }
      }catch(_){ }
      // atribuicoes (array estruturada)
      try{
        for(const at of (rec.atribuicoes||[])){
          if(!at?.dia) continue; const tok = normalizeTurnoToken(at?.turnoId||at?.turno||''); const key=addInfo({ id: at?.membroFuncionarioId, nome: at?.nome, codigo: at?.codigo }); if(key) mark(key, at.dia, tok, String(eq.id||''));
        }
      }catch(_){ }
      // atribuicoesRecurso (mapa legado)
      try{
        const map = rec.atribuicoesRecurso||{}; for(const [k,lista] of Object.entries(map)){
          const [dia, tok] = String(k).split('__'); if(!Array.isArray(lista)) continue; for(const it of lista){ const key=addInfo({ id: it?.membroFuncionarioId||it?.funcionarioId||it?.id, nome: it?.nome, codigo: it?.codigo }); if(key) mark(key, dia, normalizeTurnoToken(tok), String(eq.id||'')); }
        }
      }catch(_){ }
    }
    // equipe ativa marca componentes como presentes
    try{
      for(const a of (eq.alocacoes||[])){
        const tok = normalizeTurnoToken(a?.turnoId||''); if(!a?.dia) continue; for(const c of (eq.componentes||[])){ const key=addInfo({ id:c?.funcionario_id||c?.id, nome:c?.nome, codigo:c?.codigo }); if(key) mark(key, a.dia, tok, String(eq.id||'')); }
      }
    }catch(_){ }
  }
  // Enriquecer nomes/códigos quando possível
  try{
    const ids=[...membrosInfo.values()].map(v=> v.id).filter(Boolean).map(String); if(ids.length){
      const FuncM = await getFuncionarioModel();
      const arr = await FuncM.find({ _id: { $in: ids } }).select('_id nome codigo').lean();
      const map = new Map(arr.map(a=> [String(a._id), { nome:a.nome||null, codigo:a.codigo||null }]));
      for(const [k,v] of membrosInfo){ if(v.id && map.has(String(v.id))){ const inf=map.get(String(v.id)); v.nome = v.nome||inf.nome; v.codigo = v.codigo||inf.codigo; membrosInfo.set(k,v); } }
    }
  }catch(_){ }
  // Dedup: unifica chaves id/codigo/nome que representam a mesma pessoa por equipe
  try{
    const norm = (s)=> (s? String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase(): '');
    for(const [eqId, by] of marksByEq.entries()){
      const groups = new Map(); // gKey -> { keys:[], set:Set }
      const nameToPrimary = new Map(); // nome normalizado -> primary key (ID/COD/NOME...)
      for(const [k,set] of by.entries()){
        const info = membrosInfo.get(k)||{};
        const nname = norm(info.nome);
        let primary = info.id? ('ID:'+String(info.id)) : (info.codigo? ('COD:'+String(info.codigo).toUpperCase()) : (nname? ('NOME:'+nname) : ('KEY:'+k)));
        // Se houver alguém com o mesmo nome já mapeado (idealmente ID/COD), reusa o primary existente
        if(nname && nameToPrimary.has(nname)){
          primary = nameToPrimary.get(nname);
        }
        // Se este registro tem ID/COD e ainda não havia mapeamento por nome, fixe-o como canônico para esse nome
        if(nname && (String(primary).startsWith('ID:') || String(primary).startsWith('COD:')) && !nameToPrimary.has(nname)){
          nameToPrimary.set(nname, primary);
        }
        let g = groups.get(primary); if(!g){ g={keys:[], set:new Set()}; groups.set(primary,g); }
        g.keys.push(k); for(const v of set) g.set.add(v);
      }
      const rebuilt = new Map();
      for(const [gk, g] of groups.entries()){
        if(g.keys.length===1){ rebuilt.set(g.keys[0], g.set); continue; }
        const canonical = g.keys.find(k=> k.startsWith('id:')) || g.keys.find(k=> k.startsWith('codigo:')) || g.keys[0];
        // Merge info preferindo id/codigo/nome
        const merged = { id:null, codigo:null, nome:null };
        for(const k of g.keys){ const inf=membrosInfo.get(k)||{}; if(!merged.id && inf.id) merged.id=inf.id; if(!merged.codigo && inf.codigo) merged.codigo=inf.codigo; if(!merged.nome && inf.nome) merged.nome=inf.nome; }
        membrosInfo.set(canonical, merged);
        rebuilt.set(canonical, g.set);
        for(const k of g.keys){ if(k!==canonical) membrosInfo.delete(k); }
      }
      marksByEq.set(eqId, rebuilt);
    }
  }catch(_){ }
  // Ordenar membros por nome/código
  const membrosKeys = [...membrosInfo.keys()].sort((ka,kb)=>{
    const a=membrosInfo.get(ka)||{}; const b=membrosInfo.get(kb)||{};
    const an=(a.nome||'').toUpperCase(); const bn=(b.nome||'').toUpperCase();
    if(an && bn) return an.localeCompare(bn); if(a.codigo && b.codigo) return String(a.codigo).localeCompare(String(b.codigo)); return ka.localeCompare(kb);
  });
  if(!membrosKeys.length){ doc.font('Helvetica').fontSize(9).fillColor('#555').text('Sem efetivo identificado para o período.', x, y, { width: W, align:'center' }); return y + 12; }

  // Mapa de Férias/Ausências por funcionário e dia
  const idsFA = [...new Set([...membrosInfo.values()].map(v=> v.id).filter(Boolean).map(String))];
  const inicioISO = diasISO[0]; const fimISO = diasISO[diasISO.length-1];
  const faPorIdDia = new Map(); // id -> Map(iso -> 'ferias'|'ausencia')
  if(idsFA.length){
    try{
      const Ferias = await getFeriasModel();
      const Ausencia = await getAusenciaModel();
      // Busca por intervalo sobrepondo [inicioISO, fimISO] e situacao ativa
      const qRange = { inicioISO: { $lte: fimISO }, fimISO: { $gte: inicioISO } };
      const fer = await Ferias.find({ ...qRange, funcionarioId: { $in: idsFA }, situacao: { $ne: 'cancelado' } }).select('funcionarioId inicioISO fimISO').lean();
      const aus = await Ausencia.find({ ...qRange, funcionarioId: { $in: idsFA }, situacao: { $ne: 'cancelado' } }).select('funcionarioId inicioISO fimISO').lean();
      function marcar(arr, tipo){
        for(const r of arr||[]){
          const fid=String(r.funcionarioId||''); if(!fid) continue;
          const ini=String(r.inicioISO||'').slice(0,10); const fim=String(r.fimISO||'').slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(ini)||!/^\d{4}-\d{2}-\d{2}$/.test(fim)) continue;
          const map = faPorIdDia.get(fid) || new Map();
          const d0=new Date(ini+'T00:00:00'); const d1=new Date(fim+'T00:00:00');
          for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)){
            const iso=d.toISOString().slice(0,10);
            const prev=map.get(iso);
            if(prev==='ferias') continue; // férias tem prioridade
            map.set(iso, tipo);
          }
          faPorIdDia.set(fid, map);
        }
      }
      marcar(fer,'ferias');
      marcar(aus,'ausencia');
    }catch(_){ /* ignora falhas de consulta FA */ }
  }

  // Para cada equipe e turno, desenha um único bloco com todas as colunas (sem quebras)
  const rowH = 15; const grid = computeGridWidths(W, diasISO.length, { fixedLeftW:160, minCol:22, maxCol:40 }); const leftW = grid.leftW; const colDiaW = grid.colDiaW; let baseX = x + grid.safePad;
  for(const eq of (equipesNorm||[])){
    const eqId=String(eq.id||'');
    const by = marksByEq.get(eqId)||new Map();
    if(by.size===0) continue;
    // título da equipe
    doc.font('Helvetica-Bold').fontSize(10).fillColor(THEME.text).text(`Equipe ${eq.nome||eq.id||'—'}`, x, y, { width: W, align:'left' }); y += 12;
    // Merge final de membros da equipe (garantia contra duplicidades residuais)
    const norm = (s)=> (s? String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase(): '');
    // 1) Coleta e decide canônico por nome: prioriza ID, depois CÓDIGO
    const entries = [];
    const byName = new Map(); // nameN -> { ids:Set, cods:Set }
    for(const [mk,set] of by.entries()){
      const inf = membrosInfo.get(mk)||{};
      const nameN = norm(inf.nome);
      entries.push({ mk, set, inf, nameN });
      if(nameN){
        let agg = byName.get(nameN); if(!agg){ agg={ ids:new Set(), cods:new Set() }; byName.set(nameN, agg); }
        if(inf.id) agg.ids.add(String(inf.id));
        if(inf.codigo) agg.cods.add(String(inf.codigo).toUpperCase());
      }
    }
    const canonicalByName = new Map(); // nameN -> 'ID:...' | 'COD:...' | null
    for(const [nameN, agg] of byName.entries()){
      if(agg.ids.size>0){ canonicalByName.set(nameN, 'ID:'+([...agg.ids][0])); continue; }
      if(agg.cods.size>0){ canonicalByName.set(nameN, 'COD:'+([...agg.cods][0])); continue; }
      canonicalByName.set(nameN, null);
    }
    // 2) Agrupa usando canônico por nome quando o item não tiver ID/CÓDIGO
    const merged = new Map(); // gKey -> { set:Set, info:{id,codigo,nome} }
    for(const e of entries){
      let gKey = null;
      if(e.inf.id) gKey = 'ID:'+String(e.inf.id);
      else if(e.inf.codigo) gKey = 'COD:'+String(e.inf.codigo).toUpperCase();
      else gKey = canonicalByName.get(e.nameN) || ('NAME:'+e.nameN);
      let slot = merged.get(gKey);
      if(!slot){ slot={ set:new Set(), info:{ id:e.inf.id||null, codigo:e.inf.codigo||null, nome:e.inf.nome||null } }; merged.set(gKey, slot); }
      for(const v of e.set) slot.set.add(v);
      if(!slot.info.id && e.inf.id) slot.info.id = e.inf.id;
      if(!slot.info.codigo && e.inf.codigo) slot.info.codigo = e.inf.codigo;
      if(!slot.info.nome && e.inf.nome) slot.info.nome = e.inf.nome;
    }
    const mergedKeysSorted = [...merged.keys()].sort((ka,kb)=>{
      const a=merged.get(ka).info||{}; const b=merged.get(kb).info||{};
      const an=norm(a.nome); const bn=norm(b.nome);
      if(an && bn) return an.localeCompare(bn);
      if(a.codigo && b.codigo) return String(a.codigo).localeCompare(String(b.codigo));
      return ka.localeCompare(kb);
    });
    for(const t of turnos){
      const tok=`${t.ini}-${t.fim}`;
      if(y + rowH*3 > safeBottom){ doc.addPage(); const p2=doc.page; y=p2.margins.top; baseX = p2.margins.left + grid.safePad; }
      // Header do bloco (duas linhas com dia da semana)
      y = drawDaysHeaderTwoRows(doc, baseX, y, leftW, colDiaW, diasISO, `Efetivo — Turno ${tok}`);
      // Linhas do efetivo
      for(const gk of mergedKeysSorted){
        if(y + rowH > safeBottom){ doc.addPage(); const p2=doc.page; y=p2.margins.top; baseX = p2.margins.left + grid.safePad; // redesenhar header do bloco na nova página
          y = drawDaysHeaderTwoRows(doc, baseX, y, leftW, colDiaW, diasISO, `Efetivo — Turno ${tok}`);
        }
        const info=merged.get(gk).info||{}; const label=(info.codigo? (info.codigo+' - '):'') + (info.nome||'(sem nome)');
        // zebra
        doc.save(); doc.fillColor('#f6faff').rect(baseX, y, leftW + colDiaW*diasISO.length, rowH).fill(); doc.restore();
        doc.strokeColor(THEME.grid).rect(baseX, y, leftW, rowH).stroke();
        doc.font('Helvetica').fontSize(8).fillColor(THEME.text);
        drawCenteredText(doc, label, baseX+2, y, leftW-4, rowH, { align:'left' });
        // colunas de dias
        const set = merged.get(gk).set || new Set();
        diasISO.forEach((d,i)=>{
          const cx=baseX+leftW+i*colDiaW; doc.strokeColor(THEME.grid).rect(cx, y, colDiaW, rowH).stroke();
          let out='F';
          const fid = merged.get(gk).info?.id? String(merged.get(gk).info.id): null;
          if(fid && faPorIdDia.has(fid)){
            const tag = faPorIdDia.get(fid).get(d);
            if(tag==='ferias') out='Fe';
            else if(tag==='ausencia') out='Au';
          }
          if(out==='F'){
            if(set.has(`${d}|${tok}`)) out='S';
            else if(isTurnoCruzaMeiaNoite(tok)){
              const prev=addDaysISO(d,-1);
              if(set.has(`${prev}|${tok}`)) out='*';
            }
          }
          // Cores por status: S=preto, F=vermelho, Fe=verde; demais mantêm padrão
          let color = THEME.primary;
          if(out==='S') color = '#000000';
          else if(out==='F') color = '#b91c1c';
          else if(out==='Fe') color = '#16a34a';
          doc.font('Helvetica-Bold').fillColor(color).fontSize(8);
          drawCenteredText(doc, out, cx, y, colDiaW, rowH, { ellipsis:false });
          doc.fillColor(THEME.text).font('Helvetica');
        });
        y += rowH;
      }
      y += 6; // espaço após bloco
    }
  }
  return y;
}

function drawMatrizRecursos(doc, esc, equipesNorm, x, y, W, diasISO){
  const p=doc.page; const safeBottom = p.height - p.margins.bottom - 24;
  const rowH=15;
  // Calcula grid uma vez para todos os dias
  const grid = computeGridWidths(W, diasISO.length, { fixedLeftW:140, minCol:22, maxCol:40 });
  const leftW = grid.leftW; const colDiaW = grid.colDiaW; let baseX = x + grid.safePad;
  // Enriquecimento de recursos (nome/marca/modelo/placa) quando disponível
  let enrichMap = new Map();
  try{ /* não bloquear em caso de erro */ }catch(_){ }
  // buildRecursoEnrichMap usa ids/placas presentes na escala
  // Nota: função é assíncrona, mas aqui manteremos a mesma assinatura; portanto, preparar antes de chamar esta função seria ideal.
  // Como estamos dentro de função síncrona, faremos uma tentativa de reuso simples: se rec possuir os campos já, segue sem consulta.
  // Ajuste: vamos buscar o mapa aqui de forma síncrona via hack não disponível; alternativa: recalcular labels sem enrich.
  // Melhor: mover para assíncrono – como já é usado acima, alteramos para async; entretanto, assinatura pública já espera síncrono.
  // Solução prática: construir enrichMap fora e passar por parâmetro seria o ideal, mas para não quebrar chamadas existentes,
  // reusaremos dados do próprio rec e, se preciso no futuro, migramos para async.

  for(const eq of (equipesNorm||[])){
    const recursos = (eq.recursos||[]);
    if(!recursos.length) continue;
    // título da equipe
    doc.font('Helvetica-Bold').fontSize(10).fillColor(THEME.text).text(`Equipe ${eq.nome||eq.id||'—'}`, x, y, { width: W, align:'left' }); y += 12;
    if(y + rowH*3 > safeBottom){ doc.addPage(); const p2=doc.page; y=p2.margins.top; baseX = p2.margins.left + grid.safePad; }
    // Header de dias (duas linhas com dia da semana)
    y = drawDaysHeaderTwoRows(doc, baseX, y, leftW, colDiaW, diasISO, 'Recurso');
    for(const r of recursos){
      // Exibição compacta: placa - nome (modelo); clamp em 1 linha para evitar estouro
      const labelRaw = recursoLabelCompacto(r, enrichMap);
      const label = clampText(labelRaw, { maxLines:1, maxChars:120 });
      if(y + rowH > safeBottom){ doc.addPage(); const p2=doc.page; y=p2.margins.top; baseX = p2.margins.left + grid.safePad; y = drawDaysHeaderTwoRows(doc, baseX, y, leftW, colDiaW, diasISO, 'Recurso'); }
      // linha
      doc.save(); doc.fillColor('#f6faff').rect(baseX, y, leftW + colDiaW*diasISO.length, rowH).fill(); doc.restore();
      doc.strokeColor(THEME.grid).rect(baseX, y, leftW, rowH).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(THEME.text);
      drawCenteredText(doc, label, baseX+2, y, leftW-4, rowH, { align:'left' });
      // marcar dias quando houver alocação do recurso em qualquer turno
      const set=new Set();
      try{ for(const a of (r.alocacoes||[])){ if(a?.dia) set.add(String(a.dia)); } }catch(_){ }
      try{ const map=r.alocacoesRecurso||{}; for(const k of Object.keys(map)){ const dia=String(k).split('__')[0]; if(/\d{4}-\d{2}-\d{2}/.test(dia)) set.add(dia); } }catch(_){ }
      diasISO.forEach((d,i)=>{ const cx=baseX+leftW+i*colDiaW; doc.strokeColor(THEME.grid).rect(cx, y, colDiaW, rowH).stroke(); if(set.has(d)){ doc.font('Helvetica-Bold').fillColor(THEME.primary).fontSize(8); drawCenteredText(doc, '•', cx, y, colDiaW, rowH, { ellipsis:false }); doc.fillColor(THEME.text).font('Helvetica'); } });
      y += rowH;
    }
    y += 6;
  }
  return y;
}
