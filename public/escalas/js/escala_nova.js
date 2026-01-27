/* [REMOVIDO] Arquivo monolítico legado desativado. Placeholder inofensivo. */
try { console.warn('[escalas][legacy] public/escalas/js/escala_nova.js foi removido (placeholder).'); } catch(_){}
// Correção global de mojibake em mensagens: normaliza textos mal-decodificados (ex.: "NÃ£o" -> "Não")
try {
  if(!window.__UTF8_FIX_INSTALLED__){
    window.__UTF8_FIX_INSTALLED__ = true;
    const __fixUtf8 = function(s){
      try {
        if(typeof s !== 'string') return s;
        // Tenta converter sequência Latin-1 resultante de UTF-8 mal interpretado
        let out;
        try { out = decodeURIComponent(escape(s)); } catch(_e){ out = s; }
        // Limpa caracteres estranhos comuns (ex.: Â, aspas/traços)
        out = out
          .replace(/\u00C2/g, '') // remove "Â"
          .replace(/â€“/g, '–')
          .replace(/â€”/g, '—')
          .replace(/â€œ/g, '“')
          .replace(/â€\x9D/g, '”')
          .replace(/â€˜/g, '‘')
          .replace(/â€™/g, '’')
          .replace(/â€¦/g, '…');
        return out;
      } catch(_e2){ return s; }
    };
    const __wrapMsg = (fnName)=>{
      try {
        const orig = window[fnName];
        if(typeof orig === 'function'){
          window[fnName] = function(msg, ...rest){
            try { msg = __fixUtf8(msg); } catch(_ee){}
            return orig.call(this, msg, ...rest);
          };
        }
      } catch(_w){}
    };
    __wrapMsg('alert');
    __wrapMsg('confirm');
    __wrapMsg('prompt');
    // expõe utilitário para uso manual em renders específicos, se necessário
    window.__fixUtf8 = __fixUtf8;
  }
} catch(_utfFix){}
// Normalização de textos já inseridos no DOM: percorre nós de texto e aplica __fixUtf8 quando detectar sequências suspeitas
try {
  (function(){
    if(window.__UTF8_DOM_FIX_INSTALLED__) return; window.__UTF8_DOM_FIX_INSTALLED__ = true;
    const isSkippable = (node)=>{
      if(!node || !node.parentNode) return true;
      const t = node.parentNode.nodeName;
      return t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT';
    };
    const looksBroken = (txt)=> /[ÃÂâ]/.test(txt);
    function fixTextNodes(root){
      try{
        if(!root) return; const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n; while((n = walker.nextNode())){
          if(isSkippable(n)) continue; const v = n.nodeValue; if(!v) continue;
          if(looksBroken(v)){
            const fixed = (window.__fixUtf8? window.__fixUtf8(v) : v);
            if(fixed !== v) n.nodeValue = fixed;
          }
        }
      }catch(_e){}
    }
    // Expor utilitário global opcional (uso manual após renders específicos)
    window.fixUtf8In = function(container){ try { fixTextNodes(container || document.body); } catch(_){} };
    // Primeiras passagens rápidas após carregamento
    const passes = [50, 300, 900, 1800];
    function schedulePasses(base){
      try{
        passes.forEach(ms=> setTimeout(()=> fixTextNodes(base || document.body), ms));
      }catch(_){}
    }
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', ()=> schedulePasses());
    } else { schedulePasses(); }
    // Corrige conteúdo de modais ao serem exibidos (Bootstrap 5)
    try {
      document.addEventListener('shown.bs.modal', (ev)=>{
        const modal = ev?.target; if(modal) fixTextNodes(modal);
      });
    } catch(_m){}
  })();
} catch(_utfDom){}
// Debug mínimo global: disponível mesmo se partes do arquivo não executarem
try {
  if(typeof window.debugEscalaUnidade !== 'function'){
    window.debugEscalaUnidade = function(){
      try {
        const sel = document.getElementById('unidadeEscala') || document.getElementById('unidade') || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
        const applied = sel && sel.value || '';
        const opts = sel ? Array.from(sel.options).map(o=>({ v:String(o.value), txt:o.textContent, selected:o.selected, disabled:o.disabled })) : [];
        const st = (window.__ESCALA_STATE__||{});
        const uid = st && st.dadosGerais && st.dadosGerais.unidadeId ? String(st.dadosGerais.unidadeId) : null;
        const info = { escalaId: st.escalaId || null, unidadeIdState: uid, selectEncontrado: !!sel, selectedIndex: sel? sel.selectedIndex : -1, appliedValue: applied, totalOptions: opts.length, options: opts.slice(0,30) };
        console.log('[debugEscalaUnidade:min]', info);
        return info;
      } catch(e){ console.warn('debugEscalaUnidade:min erro', e); return { error:String(e&&e.message||e) }; }
    };
  }
} catch(_dbgMin){}
(function(){
  // Estado global preservado para evitar perdas
  // Semeia o estado global mÃ­nimo com o id da URL (se houver) para permitir readiness precoce
  try {
    const u = new URL(location.href);
    const id = u.searchParams.get('id');
    if(id){
      window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {};
      if(!window.__ESCALA_STATE__.escalaId) window.__ESCALA_STATE__.escalaId = id;
    }
  } catch(_id){}

  // --- Monitorar o core da Escala atÃ© que esteja inicializado (sem invocar initEscalaPage externamente) ---
    // Estado global preservado para evitar perdas
    window.__ESCALA_LAST_VALID_GRUPOS_TURNOS__ = null;
    window.__ESCALA_LAST_VALID_GRUPOS_SIG__ = null;
    window.__ESCALA_LAST_VALID_TIMESTAMP__ = 0;
    if (window.__ESCALA_BOOT_OK && window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId) {
      try { document.dispatchEvent(new Event('escalaCoreReady')); } catch(_){}
      return;
    }
    let waited = 0, max = 50, iv = 200, fired=false;
    function isCoreReady(){
      try {
        const coreReady = !!(window.__ESCALA_CORE_PRESENT__ && window.__ESCALA_CORE_DEFINED__);
        let stateReady = !!(window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId);
        if(!stateReady){
          try {
            const u = new URL(location.href);
            const id = u.searchParams.get('id');
            if(id) stateReady = true;
          } catch(_url){}
        }
        // Nova escala: considerar pronto mesmo sem id na URL para evitar espera desnecessária
        if(!stateReady){
          try {
            const p = (location.pathname||'').toLowerCase();
            if(p.includes('/nova')) stateReady = true;
          } catch(_p){}
        }
        return coreReady && stateReady;
      } catch(_e){ return false; }
    }
    function tick(){
      if(fired) return;
      if(isCoreReady()){
        fired = true;
        console.log('[escala][boot-fix] core Escala pronto; escalaId=', window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId);
        try { document.dispatchEvent(new Event('escalaCoreReady')); } catch(_e){}
        return;
      }
      waited++;
      if(waited < max){
        if(waited % 5 === 0) console.debug('[escala][boot-fix] aguardando core Escala...', waited, '/', max);
        setTimeout(tick, iv);
      } else {
        console.warn('[escala][boot-fix] core Escala nÃ£o sinalizou apÃ³s ~10s â€” seguindo com fallback e disparo do evento.');
        fired = true;
        try { document.dispatchEvent(new Event('escalaCoreReady')); } catch(_e){}
      }
    }
    // Reage a sinais do core quando possÃ­vel, sem chamar init
    try {
      const onCoreSignal = ()=>{ if(!fired && isCoreReady()){ fired=true; try { document.dispatchEvent(new Event('escalaCoreReady')); } catch(_e){} } };
      document.addEventListener('escala:core-ready', onCoreSignal);
      document.addEventListener('escala:core-carregado', onCoreSignal);
      document.addEventListener('escala:init-done', onCoreSignal);
    } catch(_ev){}
    tick();
  })();

  // Stub precoce: REMOVIDO para evitar conflitos
  // try {
  //   if(typeof window.initEscalaPage !== 'function'){
  //     window.__ESCALA_INIT_QUEUE__ = window.__ESCALA_INIT_QUEUE__ || [];
  //     const __escInitStub = function(){
  //       console.log('[escala][stub] noop early stub called');
  //       try {
  //         /* noop */
  //       } catch(_q){}
  //     };
  //     __escInitStub.__escStub = true;
  //     window.initEscalaPage = __escInitStub;
  //   }
  // } catch(_stub){}

  // Helpers mÃ­nimos usados em todo o arquivo
  // DiagnÃ³stico leve: evita ReferenceError caso __diag seja chamado antes de definiÃ§Ã£o externa
  function __diag(tag, info){
    try {
      const store = (window.__ESCALA_DIAG__ = window.__ESCALA_DIAG__ || { phases: [] });
      store.phases.push({ ts: Date.now(), tag, info });
    } catch(_e){}
  }
  function $(id){ return document.getElementById(id); }
  function basePath(){
    try {
      const p = location.pathname || '';
      const idx = p.toLowerCase().indexOf('/escalas');
      if(idx >= 0) return p.slice(0, idx + '/escalas'.length);
      return '/escalas';
    } catch(_e){ return '/escalas'; }
  }
  // Evita ReferenceError em checagens condicionais do boot
  function __isInitStub(fn){
    try { return !!(fn && fn.__escStub === true); } catch(_e){ return false; }
  }

  // Stubs globais precoces: garantem que abas possam ser habilitadas mesmo que o core ainda nÃ£o tenha sinalizado
  try {
    if(typeof window.setAbasHabilitadas !== 'function'){
      window.setAbasHabilitadas = function(cfg){
        try {
          cfg = cfg || {};
          const map = {
            gerais: 'aba-gerais',
            turnos: 'aba-turnos',
            equipes: 'aba-equipes',
            aloc: 'aba-alocacao',
            rec: 'aba-recursos',
            valid: 'aba-validacao'
          };
          Object.entries(map).forEach(([chave,paneId])=>{
            const enable = !!cfg[chave];
            const navBtn = document.querySelector(`#tabsEscala [data-bs-target="#${paneId}"]`);
            const pane = document.getElementById(paneId);
            if(navBtn){
              if(enable){
                navBtn.classList.remove('disabled');
                navBtn.removeAttribute('aria-disabled');
                navBtn.removeAttribute('tabindex');
                navBtn.removeAttribute('disabled');
                try { navBtn.style.pointerEvents=''; } catch(_){ }
              } else {
                navBtn.classList.add('disabled');
                navBtn.setAttribute('aria-disabled','true');
                navBtn.setAttribute('tabindex','-1');
                navBtn.setAttribute('disabled','disabled');
                try { navBtn.style.pointerEvents='none'; } catch(_){ }
              }
            }
            if(pane){ pane.classList.toggle('tab-disabled', !enable); }
          });
        } catch(_e){ /* noop stub */ }
      };
    }
  } catch(_eh){}
  try {
    if(typeof window.avaliarProgressaoAbas !== 'function'){
      window.avaliarProgressaoAbas = function(){
        try {
          const st = window.__ESCALA_STATE__ || {};
          const descOk = !!(document.getElementById('descricaoEscala')?.value?.trim());
          const uniOk  = !!(document.getElementById('unidadeEscala')?.value);
          const diV    = document.getElementById('dataInicio')?.value?.trim() || '';
          const dfV    = document.getElementById('dataFim')?.value?.trim() || '';
          const perOk  = !!(dateBrToISO(diV) && dateBrToISO(dfV));
          const created = !!(st.created || new URL(location.href).searchParams.get('id') || document.querySelector('#escalaId,[name="escalaId"]')?.value);
          if(!created){
            const podeEditarEstrutura = !!(descOk && uniOk && perOk);
            return window.setAbasHabilitadas({ gerais:true, turnos:podeEditarEstrutura, equipes:podeEditarEstrutura, aloc:false, rec:false, valid:false });
          }
          const temEquipe = Array.isArray(st.equipes) && st.equipes.length>0;
          const alocEnabled = !!temEquipe;
          const hasAlloc = (st.matrizAlocacao && typeof st.matrizAlocacao==='object' && Object.keys(st.matrizAlocacao).length>0);
          const hasRecursos = Array.isArray(st.recursos) && st.recursos.length>0;
          const modoConsultaUsado = (sessionStorage.getItem('esc_modo_consulta_usado') === '1');
          const recValidEnabled = !!(modoConsultaUsado || hasAlloc || hasRecursos);
          window.setAbasHabilitadas({ gerais:true, turnos:true, equipes:true, aloc: alocEnabled, rec: recValidEnabled, valid: recValidEnabled });
        } catch(_e){ /* noop stub */ }
      };
      // Rodar uma avaliaÃ§Ã£o inicial assim que possÃ­vel
      if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', ()=>{ try { window.avaliarProgressaoAbas(); } catch(_){ } });
      } else {
        setTimeout(()=>{ try { window.avaliarProgressaoAbas(); } catch(_){ } }, 0);
      }
    }
  } catch(_e2){}

  // Mapa de elementos principais
  let els = {
      descricao: $('descricaoEscala'),
      classificacao: $('classificacaoEscala'),
      unidade: $('unidadeEscala'),
      dataInicio: $('dataInicio'),
      dataFim: $('dataFim'),
      respNome: $('responsavelNome'),
      tblGrupos: $('tabelaGruposTurnos'),
      tblEquipes: $('tabelaEquipes'),
      tblRecursos: $('tabelaRecursos'),
      matrizWrap: $('matrizAlocacao')
  };
let state = {
  created:false,
  escalaId:null,
  gruposTurnos:[],
  equipes:[],
  recursos:[],
  matrizAlocacao:{},
  periodo:{ ini:null, fim:null },
  dadosGerais:{},
  diasDestrancados:new Set(),
  responsavel:null,
  responsavelMeta:null,
  tipo:null,
  status:'aberta',
  __indispCache:new Map(),
  matrizForceRenderEdit:false
};
let __deleteEquipeSuportado = true;
let __deleteGrupoTurnoSuportado = true;
// Guarda nomes de equipes em inserÃ§Ã£o para prevenir cliques duplos/concurrentes
window.__ESCALA_EQ_PENDING__ = window.__ESCALA_EQ_PENDING__ || new Set();
// Guarda exclusões de grupos em andamento para evitar reentrância/duplo clique
window.__ESCALA_DEL_GRP_PENDING__ = window.__ESCALA_DEL_GRP_PENDING__ || new Set();

// Stub precoce: garante que window.excluirGrupoTurnoPorId exista imediatamente e delegue quando a implementação real estiver pronta
try {
  if (typeof window.excluirGrupoTurnoPorId !== 'function') {
    window.excluirGrupoTurnoPorId = function (gid, el) {
      try { console.log('[escala][grupos] stub excluir aguardando implementação real...', gid); } catch (_) { }
      // Se este gid já foi excluído com sucesso (marcado), ignore chamadas subsequentes
      try { if(window.__ESCALA_GRP_DELETED_OK__ && window.__ESCALA_GRP_DELETED_OK__.has(String(gid))) return true; } catch(_){}
      // Tenta imediatamente delegar para a função local, se já existir e não for o próprio stub
      try {
        if (typeof excluirGrupoTurnoPorId === 'function' && excluirGrupoTurnoPorId !== window.excluirGrupoTurnoPorId) {
          try { window.__excluirGrupoTurnoPorIdImpl = excluirGrupoTurnoPorId; } catch (_) { }
          return excluirGrupoTurnoPorId(gid, el);
        }
      } catch (_immediate) { }
      // Disparo rápido de fallback inline (se disponível) para não depender do core
      try {
        if (typeof __inlineExcluirGrupoTurnoPorId === 'function') {
          console.warn('[escala][grupos] stub: usando fallback inline imediato');
          __inlineExcluirGrupoTurnoPorId(gid, el);
        } else {
          // Agendar uma tentativa em curto prazo enquanto o símbolo carrega
          setTimeout(() => { try { if (typeof __inlineExcluirGrupoTurnoPorId === 'function') { console.warn('[escala][grupos] stub: fallback inline após pequeno atraso'); __inlineExcluirGrupoTurnoPorId(gid, el); } } catch(_){} }, 600);
        }
      } catch(_inline){ }
  // armazenar timer por gid para poder limpar ao concluir
  window.__ESCALA_DEL_GRP_TIMERS__ = window.__ESCALA_DEL_GRP_TIMERS__ || new Map();
  if(window.__ESCALA_DEL_GRP_TIMERS__.has(String(gid))) try { clearInterval(window.__ESCALA_DEL_GRP_TIMERS__.get(String(gid))); } catch(_cl){}
  let tentativas = 0; const max = 12; const tm = setInterval(() => {
        tentativas++;
        try {
          if (typeof window.__excluirGrupoTurnoPorIdImpl === 'function') {
            clearInterval(tm);
            try { window.__ESCALA_DEL_GRP_TIMERS__.delete(String(gid)); } catch(_d){}
            try { console.log('[escala][grupos] stub -> delegando para implementação real após', tentativas, 'ticks'); } catch (_) { }
            return window.__excluirGrupoTurnoPorIdImpl(gid, el);
          }
          // Tentar função local novamente (pode ter sido definida após carregamento)
          if (typeof excluirGrupoTurnoPorId === 'function' && excluirGrupoTurnoPorId !== window.excluirGrupoTurnoPorId) {
            try { window.__excluirGrupoTurnoPorIdImpl = excluirGrupoTurnoPorId; } catch (_) { }
            clearInterval(tm);
            try { window.__ESCALA_DEL_GRP_TIMERS__.delete(String(gid)); } catch(_d){}
            try { console.log('[escala][grupos] stub -> usando função local após', tentativas, 'ticks'); } catch (_) { }
            return excluirGrupoTurnoPorId(gid, el);
          }
          if (tentativas >= max) {
            clearInterval(tm);
            try { window.__ESCALA_DEL_GRP_TIMERS__.delete(String(gid)); } catch(_d){}
            console.warn('[escala][grupos] implementação real indisponível — usando fallback inline');
            return __inlineExcluirGrupoTurnoPorId(gid, el);
          }
        } catch (_tick) { /* noop */ }
  }, 150);
  try { window.__ESCALA_DEL_GRP_TIMERS__.set(String(gid), tm); } catch(_s){}
    };
  }
} catch (_stub) { }

// Fallback inline definitivo: remove grupo por equivalência de turnos se a função principal não estiver pronta
async function __inlineExcluirGrupoTurnoPorId(gid, el){
  try { console.warn('[escala][grupos] inline excluir ativado (fallback), gid=', gid); } catch(_){ }
  if(!gid) return false;
  try {
    const pend = (window.__ESCALA_DEL_GRP_PENDING__ = window.__ESCALA_DEL_GRP_PENDING__ || new Set());
    if(pend.has(String(gid))){ console.warn('[escala][grupos] inline: delete em andamento para', gid); return false; }
    pend.add(String(gid));
  } catch(_){ }
  // resolver escalaId
  let escalaId = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId) || (typeof state!=='undefined' && state && state.escalaId) || null;
  try { if(!escalaId && typeof getEscalaId==='function'){ escalaId = getEscalaId(); } } catch(_){ }
  if(!escalaId){ try{ window.__escalaToastError && window.__escalaToastError('Salve os dados gerais primeiro para criar a escala.'); }catch(_e){} try{ window.__ESCALA_DEL_GRP_PENDING__?.delete?.(String(gid)); }catch(_){ } return false; }
  // obter turnos do grupo
  let alvoTurnos = [];
  try {
    const st = window.__ESCALA_STATE__ || state || {};
    const gAlvo = Array.isArray(st.gruposTurnos)? st.gruposTurnos.find(g=> String(g.id)===String(gid)) : null;
    if(gAlvo && Array.isArray(gAlvo.turnos)) alvoTurnos = gAlvo.turnos.map(t=> ({ ini:(t.ini||t.inicio||''), fim:(t.fim||t.termino||'') })).filter(t=> t.ini && t.fim);
  } catch(_){ }
  if(!(alvoTurnos && alvoTurnos.length)){
    try {
      const tbl = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
      const tr = tbl && tbl.querySelector(`tbody tr[data-id="${gid}"]`);
      const td = tr && tr.querySelector('td');
      const text = (td && td.textContent || '').trim();
      if(text){
        alvoTurnos = text.split('|').map(s=> s.trim()).map(p=>{ const m=p.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/); return m? { ini:m[1], fim:m[2] }: null; }).filter(Boolean);
      }
    } catch(_){ }
  }
  if(!(alvoTurnos && alvoTurnos.length)){
  try{ window.__escalaToastError && window.__escalaToastError('Não foi possível determinar os turnos do grupo para excluir.'); }catch(_e){} try{ window.__ESCALA_DEL_GRP_PENDING__?.delete?.(String(gid)); }catch(_){ } return false;
  }
  // chamar remove-by-turnos
  const payload = JSON.stringify({ turnos: alvoTurnos });
  const headers = { 'Content-Type':'application/json','Accept':'application/json' };
  let ok=false; let r=null;
  try {
    const u1 = basePath()+`/api/escalas/${escalaId}/grupos-turnos/remove-by-turnos`;
    console.log('[escala][grupos][inline] POST', u1);
    r = await fetch(u1, { method:'POST', headers, credentials:'same-origin', body: payload });
    if(!r || !r.ok){
      const u2 = `/api/escalas/${escalaId}/grupos-turnos/remove-by-turnos`;
      console.log('[escala][grupos][inline] fallback POST', u2, 'status=', r && r.status);
      try{ r = await fetch(u2, { method:'POST', headers, credentials:'same-origin', body: payload }); }catch(_){ }
    }
    if(r){
      const ct = (r.headers && r.headers.get && (r.headers.get('content-type')||'')) || '';
      console.log('[escala][grupos][inline] resposta status=', r.status, 'ok=', r.ok, 'ct=', ct);
      if(/application\/json/i.test(ct)){
        try { const js = await r.clone().json(); ok = !!(js && js.ok===true); console.log('[escala][grupos][inline] body ok=', js && js.ok); } catch(_){ ok=false; }
      } else {
        // possÃ­vel redirect/auth
        try { const tx = await r.clone().text(); console.warn('[escala][grupos][inline] resposta não-JSON, primeiros 120 chars=', (tx||'').slice(0,120)); } catch(_){ }
        ok = false;
      }
    }
  } catch(err){ try{ console.warn('[escala][grupos] inline remove-by-turnos erro', err); }catch(_){ } }
  if(!ok){ try{ window.__escalaToastError && window.__escalaToastError('Falha ao excluir grupo de turnos.'); }catch(_e){} try{ window.__ESCALA_DEL_GRP_PENDING__?.delete?.(String(gid)); }catch(_){ } return false; }
  // sucesso: atualizar estado e DOM
  try {
    const st = window.__ESCALA_STATE__ || state; if(st){ st.gruposTurnos = (Array.isArray(st.gruposTurnos)? st.gruposTurnos: []).filter(g=> String(g.id)!==String(gid)); window.__ESCALA_STATE__ = st; }
  } catch(_){ }
  try {
    const tbl = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
    const tr = tbl && tbl.querySelector(`tbody tr[data-id="${gid}"]`);
    if(tr) tr.remove();
  } catch(_){ }
  try { document.dispatchEvent(new CustomEvent('turnoAtualizado')); } catch(_){ }
  try { window.__escalaToastSuccess && window.__escalaToastSuccess('Sucesso ao excluir o grupo de turnos.'); } catch(_s){}
  try { window.__ESCALA_GRP_DELETED_OK__ = window.__ESCALA_GRP_DELETED_OK__ || new Set(); window.__ESCALA_GRP_DELETED_OK__.add(String(gid)); } catch(_mark){}
  try { window.__ESCALA_DEL_GRP_PENDING__ && window.__ESCALA_DEL_GRP_PENDING__.delete && window.__ESCALA_DEL_GRP_PENDING__.delete(String(gid)); } catch(_clr){}
  try { if(typeof window.refreshTurnosFromServer==='function') window.refreshTurnosFromServer({ silent:true, ensureChange:true }); } catch(_){ }
  try{ window.__ESCALA_DEL_GRP_PENDING__?.delete?.(String(gid)); }catch(_){ }
  try { console.log('[escala][grupos] inline excluir OK (fallback), gid=', gid); } catch(_){ }
  return true;
}
try { window.__INLINE_DEL_GRP_IMPL = __inlineExcluirGrupoTurnoPorId; } catch(_){ }

// Expor para debug
window.__ESCALA_STATE__ = state; window.__ESCALA_ELS__ = els;

// Definir função globalmente para evitar problemas de ordem
window.abrirModalDetalhamentoEquipeDia = function(ctx){
  // Delegação: força usar implementação robusta (namespace ou impl) com pequenas tentativas antes do fallback
  try {
    if (window.__ESCALA_FUNCS__ && typeof window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia === 'function') {
      console.debug('[escala][modal-det] delegando para __ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia');
      return window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia(ctx);
    }
    if (typeof abrirModalDetalhamentoEquipeDiaImpl === 'function') {
      console.debug('[escala][modal-det] delegando para abrirModalDetalhamentoEquipeDiaImpl (local)');
      return abrirModalDetalhamentoEquipeDiaImpl(ctx);
    }
    if (typeof window.abrirModalDetalhamentoEquipeDiaImpl === 'function') {
      console.debug('[escala][modal-det] delegando para abrirModalDetalhamentoEquipeDiaImpl');
      return window.abrirModalDetalhamentoEquipeDiaImpl(ctx);
    }
    // Retry curto (carregamento assíncrono via shim)
    let tentativas = 0;
    const tentarDelegar = ()=>{
      tentativas++;
      const fnNs = window.__ESCALA_FUNCS__ && typeof window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia === 'function' && window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia;
      const fnLoc = (typeof abrirModalDetalhamentoEquipeDiaImpl === 'function' && abrirModalDetalhamentoEquipeDiaImpl) || (typeof window.abrirModalDetalhamentoEquipeDiaImpl === 'function' && window.abrirModalDetalhamentoEquipeDiaImpl);
      const fn = fnNs || fnLoc || null;
      if(fn) return fn(ctx);
      if(tentativas < 10) return setTimeout(tentarDelegar, 30);
      console.debug('[escala][modal-det] implementação não disponível após tentativas, usando fallback');
      return fallbackAbrirModalDetalhamentoEquipeDia(ctx);
    };
    return tentarDelegar();
  } catch(_d){ try{ console.warn('[escala][modal-det] falha ao delegar:', _d); }catch(_){} }
  return fallbackAbrirModalDetalhamentoEquipeDia(ctx);

  function fallbackAbrirModalDetalhamentoEquipeDia(ctx){
    console.debug('[escala][modal-det] usando stub/fallback global abrirModalDetalhamentoEquipeDia');
    const modalEl=document.getElementById('modalDetalhamentoEquipeDia');
    if(!modalEl){ console.warn('Modal detalhamento não encontrado'); return; }
    const spanPeriodo=$('detEqDiaPeriodo');
    const spanEquipe=$('detEqDiaEquipe');
    const spanData=$('detEqDiaData');
    const spanSituacao=$('detEqDiaSituacao');
    const spanTurno=$('detEqDiaTurno');
    const boxObs=$('detEqDiaObservacoes');
    const tbody=modalEl.querySelector('#tabelaDetalhamentoEquipeDia tbody');

    // Período global
    if(state.periodo.ini && state.periodo.fim){ spanPeriodo.textContent = dateISOToBr(state.periodo.ini) + ' à ' + dateISOToBr(state.periodo.fim); } else { spanPeriodo.textContent='-'; }
    // Equipe e data
    spanEquipe.textContent = ctx.equipe? ctx.equipe.nome : (ctx.equipeNome||'-');
    spanData.textContent = ctx.dataISO? dateISOToBr(ctx.dataISO) : '-';
    spanSituacao.className='badge bg-secondary'; spanSituacao.textContent='Em análise';
    if(ctx.turnoIni && ctx.turnoFim){ spanTurno.textContent = ctx.turnoIni + ' às ' + ctx.turnoFim; } else { spanTurno.textContent='-'; }

    // Coleta robusta de funcionários (espelhando a impl): busca em state.recursos quando não vier aninhado
    const diaSel = ctx.dataISO; const hhIniSel = ctx.turnoIni, hhFimSel = ctx.turnoFim;
    function matchTurnoFaixa(a){
      try {
        const turnoId = (a?.turnoId||a?.turno||'').toString();
        const m = turnoId.match(/(\d{2}:\d{2})\s*[–—-]?\s*(\d{2}:\d{2})/);
        if(m){ return m[1]===hhIniSel && m[2]===hhFimSel; }
        const ii=(a?.turnoIni||a?.ini||a?.horaInicio||a?.inicio||'').toString();
        const ff=(a?.turnoFim||a?.fim||a?.horaFim||a?.termino||'').toString();
        if(ii && ff) return ii===hhIniSel && ff===hhFimSel;
      } catch(_e){}
      // Sem informação de turno: não considera alocado para o turno do modal
      return false;
    }
    let funcionarios = [];
    if(ctx.equipe){
      // backfill componentes
      try {
        if((!Array.isArray(ctx.equipe.componentes) || !ctx.equipe.componentes.length) && Array.isArray((window.__ESCALA_STATE__||{}).equipes)){
          const eqRef=(window.__ESCALA_STATE__.equipes||[]).find(e=> String(e.id||e._id||'')===String(ctx.equipe.id||ctx.equipe._id||''))
                     || (window.__ESCALA_STATE__.equipes||[]).find(e=> String(e.nome||'').toUpperCase()===String(ctx.equipe.nome||'').toUpperCase());
          if(eqRef && Array.isArray(eqRef.componentes)){ ctx.equipe.componentes = eqRef.componentes.map(c=> ({...c})); }
        }
      } catch(_bf){}
      // recursos aninhados ou globais
      let recursosDaEquipe = Array.isArray(ctx.equipe.recursos) ? ctx.equipe.recursos : [];
      if(!recursosDaEquipe.length && Array.isArray((window.__ESCALA_STATE__||{}).recursos)){
        const eqId = ctx.equipe.id || ctx.equipe._id;
        recursosDaEquipe = (window.__ESCALA_STATE__.recursos||[])
          .filter(r=> String(r.equipeId||r.equipe_id||r.equipe?.id||'')===String(eqId))
          .map(r=> ({...r}));
      }
      if(Array.isArray(recursosDaEquipe)){
        recursosDaEquipe.forEach(r=>{
          if(Array.isArray(r.atribuicoes)){
            r.atribuicoes.forEach(a=>{
              if(a){
                const diaOK = (a.dia===diaSel) || (a.data===diaSel);
                const turnoOK = matchTurnoFaixa(a);
                if(diaOK && turnoOK){
                  const fid = a.id || a.funcionarioId || a.funcionario_id || a.membroFuncionarioId || (a.funcionario && (a.funcionario.id||a.funcionario._id)) || a.matricula || a.codigo;
                  const nomeA = a.nome || a.nomeFuncionario || a.funcionarioNome || (a.funcionario && (a.funcionario.nome||a.funcionario.descricao));
                  funcionarios.push({ ...a, id: fid, nome: nomeA || a.nome, origem:'recurso', recursoNome: r.nome||r.placa||'' });
                }
              }
            });
          }
        });
      }
      // Não incluir componentes fora das atribuições do dia/turno: o modal exibe apenas os realmente alocados
    }
    let linhas = '';
    if(funcionarios.length){
      linhas = funcionarios.map((c,idx)=>{
        const compId = c.id || c._id || c.funcionarioId || c.funcionario_id || c.membroFuncionarioId || (c.funcionario && (c.funcionario.id || c.funcionario._id)) || c.matricula || c.codigo || '';
        const codigo = c.matricula || c.codigo || c.cpf || compId || '';
        const nome = c.nome || c.nomeFuncionario || c.funcionarioNome || '(sem nome)';
        const uc = c.unidade_codigo || c.unidade?.codigo || '';
        const un = c.unidade_nome || c.unidade?.nome || '';
        let unidadeFmt='-'; if(uc && un) unidadeFmt = `${uc} (${un})`; else if(uc) unidadeFmt = uc; else if(un) unidadeFmt = un;
        const needFetch = unidadeFmt==='-' && compId;
        return `<tr data-comp-idx="${idx}" data-comp-id="${compId}"><td class="text-center">${codigo}</td><td class="col-nome">${nome}</td><td class="col-unidade unidade-cell">${unidadeFmt}${needFetch? '<span class=\"text-muted\"> (..)</span>':''}</td><td class="text-center text-muted">(verificando)</td><td class="text-center text-muted">(verificando)</td></tr>`;
      }).join('');
    } else {
      linhas = '<tr class="text-muted"><td class="text-center" colspan="5">Equipe sem funcionários alocados neste dia/turno.</td></tr>';
    }
    tbody.innerHTML = linhas;

    if(boxObs){ boxObs.innerHTML = '<em>Validando indisponibilidade e outras alocações...</em>'; }
    let instModal=bootstrap.Modal.getInstance(modalEl); if(!instModal){ instModal=new bootstrap.Modal(modalEl); } instModal.show();

    // Após exibir modal, validar indisponibilidade (férias/ausências) e conflitos de alocação no dia/turno
    (async function verificarIndisponibilidadeDia(){
      try {
        if(!ctx || !ctx.dataISO){ return; }
        const diaIni = ctx.dataISO;
        const diaFim = ctx.dataISO;
        for(const tr of tbody.querySelectorAll('tr[data-comp-id]')){
          const fid = String(tr.getAttribute('data-comp-id')||'').trim();
          if(!fid) continue;
          const cellOutra = tr.children[3];
          const cellInd = tr.children[4];
          // Disponibilidade (free vs blocked) no dia
          try {
            const url = basePath()+`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(fid)}&inicio=${diaIni}&fim=${diaFim}`;
            const r = await fetch(url, { credentials:'same-origin' });
            if(r.ok){
              const js = await r.json();
              const dados = js && js.data || {};
              const livre = Array.isArray(dados.free) && dados.free.some(int=> String(int.inicio)<=diaIni && String(int.fim)>=diaFim);
              if(cellInd){ cellInd.innerHTML = livre? '<span class="text-success fw-semibold">Não</span>' : '<span class="text-danger fw-semibold">Sim</span>'; }
              if(!livre) tr.classList.add('text-muted');
            } else {
              if(cellInd) cellInd.innerHTML = '<span class="text-muted">(?)</span>';
            }
          } catch(_e){ if(cellInd) cellInd.innerHTML = '<span class="text-muted">(?)</span>'; }
          // Conflitos de alocação no mesmo dia/turno
          try {
            let hhIni = (ctx.turnoIni||'').trim(); let hhFim=(ctx.turnoFim||'').trim();
            if(!hhIni || !hhFim){ const m = String(ctx.turnoId||'').match(/(\d{2}:\d{2})-(\d{2}:\d{2})/); if(m){ hhIni=m[1]; hhFim=m[2]; } }
            if(hhIni && hhFim){
              const q = new URLSearchParams({ funcionarioId: fid, dia: String(ctx.dataISO), ini: hhIni, fim: hhFim });
              if(state && state.escalaId){ q.set('excludeId', state.escalaId); }
              const url2 = basePath()+`/api/funcionario/conflitos-alocacao?`+q.toString();
              const r2 = await fetch(url2, { credentials:'same-origin' });
              if(r2.ok){
                const js2 = await r2.json();
                const confl = js2 && (js2.conflito===true || (Array.isArray(js2.matches) && js2.matches.length>0));
                if(cellOutra){ cellOutra.innerHTML = confl? '<span class="text-danger fw-semibold">Sim</span>' : '<span class="text-success fw-semibold">Não</span>'; }
                tr.dataset.outraAlocacao = confl? '1':'0';
              } else {
                if(cellOutra){ cellOutra.innerHTML = '<span class="text-muted">(erro)</span>'; }
              }
            } else { if(cellOutra){ cellOutra.innerHTML = '<span class="text-muted">(sem turno)</span>'; } }
          } catch(_e2){ if(cellOutra){ cellOutra.innerHTML = '<span class="text-muted">(?)</span>'; } }
        }
        if(boxObs){ boxObs.innerHTML = ''; }
      } catch(_v){ /* silencioso */ }
    })();

    // Enriquecimento assíncrono da unidade, quando faltante
    try {
      if(ctx && ctx.equipe && Array.isArray(ctx.equipe.componentes)){
        ctx.equipe.componentes.forEach(async (c,i)=>{
          try {
            if(c.unidade_codigo || c.unidade_nome) return;
            const cid = c.id || c._id || c.funcionarioId || c.funcionario_id || c.matricula || c.codigo;
            if(!cid) return;
            const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(cid));
            let url;
            if(isObjectId){ url = basePath()+ '/api/funcionarios/busca-codigo?id='+encodeURIComponent(String(cid)); }
            else { url = basePath()+ '/api/funcionarios/busca-codigo?codigo='+encodeURIComponent(String(cid).trim()); }
            const res = await fetch(url, { credentials:'same-origin' });
            if(!res.ok) return;
            const js = await res.json();
            if(js && js.data){
              c.unidade_codigo = js.data.unidade_codigo || c.unidade_codigo || null;
              c.unidade_nome = js.data.unidade_nome || c.unidade_nome || null;
              const cell = tbody.querySelector(`tr[data-comp-idx="${i}"] .unidade-cell`);
              if(cell){
                const uc=c.unidade_codigo, un=c.unidade_nome;
                let unidadeFmt='-'; if(uc && un) unidadeFmt = `${uc} (${un})`; else if(uc) unidadeFmt=uc; else if(un) unidadeFmt=un;
                cell.textContent = unidadeFmt;
              }
            }
          } catch(_f){ /* noop */ }
        });
      }
    } catch(_e3){ /* noop */ }
  }
};

  // (removido) Enriquecimento assíncrono fora de escopo – a versão correta fica dentro das impls do modal
  // (listener direto antigas aÃ§Ãµes de equipes removido â€“ substituÃ­do por delegaÃ§Ã£o interna pÃ³s-DOM)
  // Binding seguro do botÃ£o salvar do modal (se existir desde o carregamento)
  (function bindSalvarEdicaoEquipeOnce(){
    try {
      const btn = document.getElementById('btnSalvarEdicaoEquipe');
      if(btn && !btn.__bound){ btn.__bound=true; btn.addEventListener('click', onSalvarEdicaoEquipe); }
    } catch(_b){}
  })();
  // Listeners de grupos de turnos serÃ£o ligados apÃ³s DOMContentLoaded (ver final do arquivo)
  // pois aqui ainda nÃ£o temos els.tblGrupos definido. Mantida lÃ³gica em handler separado.
  // (removido handleClickTabelaGrupos: lÃ³gica agora inline no binding DOMContentLoaded)
  // Helpers de Toast (sucesso/erro) e confirmação única de exclusão
  (function(){
    function ensureToastContainer(){
      let c = document.getElementById('escalaToastContainer');
      if(!c){
        c = document.createElement('div');
        c.id='escalaToastContainer';
        c.className='toast-container position-fixed top-0 end-0 p-3';
        c.style.zIndex = 1085; // um pouco acima de modals
        document.body.appendChild(c);
      }
      return c;
    }
  async function showToast(msg, opts){
      try {
        const options = Object.assign({ type:'success', title:null, delay:3000 }, opts||{});
        const container = ensureToastContainer();
        const id = 't_'+Math.random().toString(36).slice(2,8);
        const color = options.type==='error'? 'danger' : (options.type==='info'? 'info' : 'success');
        const html = (
          '<div id="'+id+'" class="toast text-bg-'+color+' border-0" role="alert" aria-live="assertive" aria-atomic="true">'
          + (options.title? ('<div class="toast-header text-bg-'+color+' border-0"><strong class="me-auto">'+String(options.title)+'</strong>'
            +'<button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Fechar"></button></div>') : '')
          + '<div class="toast-body">'+String(msg)+'</div>'
          + '</div>'
        );
        container.insertAdjacentHTML('beforeend', html);
        const el = document.getElementById(id);
        let inst=null;
        try { inst = bootstrap && bootstrap.Toast ? new bootstrap.Toast(el, { autohide:true, delay: options.delay }) : null; } catch(_b){}
        if(inst){ inst.show(); setTimeout(()=>{ try{ el.remove(); }catch(_r){} }, options.delay+800); }
      } catch(_t){ /* noop */ }
    }
    try {
      window.__escalaToastSuccess = (msg)=> showToast(msg, { type:'success', title:'Sucesso' });
      window.__escalaToastError   = (msg)=> showToast(msg, { type:'error', title:'Erro', delay: 5000 });
    } catch(_ex){ }
    // Confirmação única centralizada para deletar grupo de turnos
    try {
      window.__askDeleteGrupoTurno = function(gid, el, ev){
        try { if(ev && ev.__escalaDelAsked) return false; if(ev) ev.__escalaDelAsked = true; } catch(_m){}
        // Debounce rápido para evitar confirmações múltiplas
        const now = Date.now();
        if(window.__LAST_DEL_CLICK_AT__ && (now - window.__LAST_DEL_CLICK_AT__ < 400)) return false;
        window.__LAST_DEL_CLICK_AT__ = now;
        if(ev){ try { ev.preventDefault(); ev.stopImmediatePropagation && ev.stopImmediatePropagation(); ev.stopPropagation(); } catch(_s){} }
        if(!gid) return false;
        const ok = confirm('Excluir este grupo de turnos?');
        if(!ok) return false;
        if(typeof window.excluirGrupoTurnoPorId === 'function') return window.excluirGrupoTurnoPorId(gid, el);
        // Fallback imediato
        if(typeof window.__INLINE_DEL_GRP_IMPL === 'function') return window.__INLINE_DEL_GRP_IMPL(gid, el);
        return false;
      };
    } catch(_cf){}
  })();

  // Stub global seguro: se salvarDadosGerais/salvarAlteracoesEscala ainda não estiverem visíveis neste escopo,
  // expõe implementações fallback para evitar ReferenceError e permitir criar/atualizar a escala.
  (function ensureSalvarStubs(){
    try {
      if (typeof window.salvarDadosGerais !== 'function') {
        window.salvarDadosGerais = async function salvarDadosGeraisFallback(){
          // Micro salvar inspirado no fallback da aba1
          const brToISO = (v)=>{ if(!v) return ''; const m=String(v).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m? `${m[3]}-${m[2]}-${m[1]}`: ''; };
          const postJson = async (url, body)=>{ try{ return await fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); } catch(e){ return { ok:false, status:-1, _err:e }; } };
          const btn = document.getElementById('btnSalvarSecDados');
          try { if(btn){ btn.disabled=true; btn.dataset._txt = btn.dataset._txt || btn.innerText; btn.innerText='Salvando...'; } } catch(_){}
          try {
            const desc = document.getElementById('descricaoEscala')?.value?.trim();
            const uni  = document.getElementById('unidadeEscala')?.value;
            const diBr = document.getElementById('dataInicio')?.value;
            const dfBr = document.getElementById('dataFim')?.value;
            const cls  = document.getElementById('classificacaoEscala')?.value || (document.body?.dataset?.tipoEscala||'').trim();
            if(!desc){ alert('Descrição obrigatória.'); return; }
            if(!uni){ alert('Selecione a unidade.'); return; }
            if(!diBr || !dfBr){ alert('Defina período completo.'); return; }
            const payload = { descricao: desc, classificacao: cls || null, unidadeId: uni, periodo: { ini: brToISO(diBr), fim: brToISO(dfBr) }, gruposTurnos: [], equipes: [], alocacao: {}, validar: false };
            try { if(window.__ESCALA_STATE__?.responsavel?.id) payload.responsavelId = window.__ESCALA_STATE__.responsavel.id; } catch(_){ }
            let res = await postJson(basePath()+ '/api/escalas', payload);
            if(!res.ok) res = await postJson('/api/escalas', payload);
            if(res.status===401){ alert('Sessão expirada. Faça login novamente.'); return; }
            if(!res.ok){ const t=await res.text().catch(()=> ''); throw new Error(t||`Falha ao criar escala (HTTP ${res.status})`); }
            const js = await res.json();
            const id = js?.id || js?._id || js?.data?.id || js?.data?._id || null;
            if(!id) throw new Error('Resposta sem ID');
            try{ const u=new URL(location.href); u.searchParams.set('id', id); history.replaceState(null,'',u.toString()); }catch(_e){}
            // Atualiza estado e UI mínima
            try{ window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {}; window.__ESCALA_STATE__.created = true; window.__ESCALA_STATE__.escalaId = id; }catch(_e){}
            try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_){ }
            try{ document.dispatchEvent(new CustomEvent('escala:id-obtido',{ detail:{ id } })); }catch(_e){}
            alert('Dados gerais salvos. Continue configurando a escala.');
          } catch(err) {
            alert('Não foi possível criar a escala. ' + (err?.message||''));
          } finally {
            try { if(btn){ btn.disabled=false; if(btn.dataset._txt) btn.innerText=btn.dataset._txt; } } catch(_){ }
          }
        };
      }
    } catch(_e){}
    try {
      if (typeof window.salvarAlteracoesEscala !== 'function') {
        window.salvarAlteracoesEscala = async function salvarAlteracoesEscalaFallback(){
          // Fallback mínimo: se não houver implementação, apenas informa o usuário
          alert('Salvar alterações ainda está carregando. Tente novamente em instantes.');
        };
      }
    } catch(_e){}
  })();

  // Listener global de seguranÃ§a (caso binding local falhe)
  document.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('button[data-act]');
    if(!btn) return;
    const act = btn.getAttribute('data-act');
    if(act!=='edit-grupo' && act!=='del-grupo') return;
    // Garante que tabela ou linha exista
    const tr = btn.closest('tr');
    const id = tr && tr.getAttribute('data-id');
    if(!id){ return; }
    // Busca robusta do grupo: aceita id numÃ©rico/strings e campos alternativos
    const gid = String(id);
    const listaGrupos = (state && Array.isArray(state.gruposTurnos)) ? state.gruposTurnos : [];
    const grupo = listaGrupos.find(g=> String(g && (g.id || g._id || g.id_grupo)) === gid);
    if(act==='edit-grupo'){
      if(!grupo){ console.warn('[escala][global-listener] grupo nÃ£o encontrado para id', id, 'lista tamanhos=', listaGrupos.length); return; }
      console.debug('[escala][global-listener] abrir ediÃ§Ã£o grupo', id);
      abrirPopupTurnos(grupo);
    } else if(act==='del-grupo'){
      // confirmação centralizada (evita múltiplos modais)
      try { e.preventDefault(); e.stopImmediatePropagation && e.stopImmediatePropagation(); e.stopPropagation(); } catch(_c){}
      if(typeof window.__askDeleteGrupoTurno==='function') return window.__askDeleteGrupoTurno(gid, btn, e);
      if(confirm('Excluir este grupo de turnos?')) excluirGrupoTurnoPorId(gid, btn);
    }
  }, true);
  if(els.dataInicio) els.dataInicio.addEventListener('blur', ()=>{ try{ ajustarDataFimSeNecessario(); normalizarDatasPeriodoParaEstado(); }catch(e){ /* ignore */ } try { (window.renderMatrizesPorGrupo || renderMatrizesPorGrupo)?.(); } catch(_){ } });
  if(els.dataFim) els.dataFim.addEventListener('blur', ()=>{ try{ normalizarDatasPeriodoParaEstado(); // se usuÃ¡rio colocar fim < inÃ­cio, normalizarDatas lanÃ§aria erro antes; forÃ§amos correÃ§Ã£o
      const iniBr=els.dataInicio.value.trim(); const fimBr=els.dataFim.value.trim(); if(iniBr && fimBr){ const isoIni=dateBrToISO(iniBr); const isoFim=dateBrToISO(fimBr); if(isoIni && isoFim && isoFim < isoIni){ els.dataFim.value=iniBr; normalizarDatasPeriodoParaEstado(); } }
    }catch(e){ /* ignore */ } try { (window.renderMatrizesPorGrupo || renderMatrizesPorGrupo)?.(); } catch(_){ } });
  // Evento change oferece resposta imediata apÃ³s seleÃ§Ã£o no flatpickr (blur sÃ³ ocorre ao fechar foco)
  if(els.dataInicio) els.dataInicio.addEventListener('change', ()=>{
    try {
      ajustarDataFimSeNecessario();
      // Atualiza minDate do calendÃ¡rio de tÃ©rmino para bloquear datas anteriores
      if(els.dataFim && els.dataFim._flatpickr){
        const v=els.dataInicio.value.trim();
          if(v){ els.dataFim._flatpickr.set('minDate', v); } else { els.dataFim._flatpickr.set('minDate', null); }
      }
      normalizarDatasPeriodoParaEstado();
      atualizarLabelsContexto();
      try { avaliarProgressaoAbas(); } catch(_e){}
    } catch(e){ /* ignore */ }
    try { (window.renderMatrizesPorGrupo || renderMatrizesPorGrupo)?.(); } catch(_){ }
  });
  // Garantia: se usuÃ¡rio apagar manualmente fim e sair, change de inÃ­cio jÃ¡ terÃ¡ ajustado; mas tratamos change de fim tambÃ©m
  if(els.dataFim) els.dataFim.addEventListener('change', ()=>{
    try {
      // Se fim vier antes do inÃ­cio por qualquer motivo externo, forÃ§amos alinhamento
      const iniBr=els.dataInicio.value.trim(); const fimBr=els.dataFim.value.trim();
      if(iniBr && fimBr){
        const isoIni=dateBrToISO(iniBr); const isoFim=dateBrToISO(fimBr);
        if(isoIni && isoFim && isoFim < isoIni){ els.dataFim.value=iniBr; }
      }
      normalizarDatasPeriodoParaEstado();
      atualizarLabelsContexto();
      try { avaliarProgressaoAbas(); } catch(_e){}
    } catch(e){ /* ignore */ }
    try { (window.renderMatrizesPorGrupo || renderMatrizesPorGrupo)?.(); } catch(_){ }
  });
  // Removido botÃ£o Regerar (requisito). Caso exista ainda no HTML, removemos dinamicamente.
  const btnReg=$('btnRegerarMatriz');
  if(btnReg){ btnReg.remove(); }
  // SincronizaÃ§Ã£o reativa da lista de recursos: ao salvar ou sincronizar, atualiza state.recursos e re-renderiza
  (function bindRecursosSyncListeners(){
    if(window.__REC_SYNC_BOUND__) return; window.__REC_SYNC_BOUND__=true;
    // Quando o modal de recurso salvar, garantir inclusÃ£o/atualizaÃ§Ã£o no estado e re-render
    document.addEventListener('escala:recurso-salvo', ev=>{
      try {
        const rec = ev?.detail?.recurso; if(!rec) return;
        const key = rec.id || rec.referenciaGestorId; if(!key) return;
        if(!Array.isArray(state.recursos)) state.recursos=[];
        const idx = state.recursos.findIndex(r=> (r.id||r.referenciaGestorId)===key);
        const recNorm = { ...rec };
        // manter consistÃªncia de equipeId se vier do modal
        if(!recNorm.equipeId && rec?.equipeId){ recNorm.equipeId = rec.equipeId; }
        if(idx>=0) state.recursos[idx] = recNorm; else state.recursos.push(recNorm);
        try { window.__ESCALA_STATE__ && (window.__ESCALA_STATE__.recursos = state.recursos.map(r=>({...r}))); } catch(_){}
        renderRecursos();
        try { if(typeof avaliarProgressaoAbas==='function') avaliarProgressaoAbas(); } catch(_e){}
      } catch(_e){ /* noop */ }
    });
    // Ao receber sync completo da escala, sobrescrever lista por verdade do backend
    document.addEventListener('escala:sync-completa', ev=>{
      try {
        const esc = ev?.detail?.escala; if(!esc) return;
        let lista = [];
        if(Array.isArray(esc.recursos)) lista = esc.recursos;
        else if(Array.isArray(esc.equipes)){
          esc.equipes.forEach(eq=>{ if(Array.isArray(eq?.recursos)) eq.recursos.forEach(r=> lista.push({ ...r, equipeId: r?.equipeId || eq?.id || eq?._id })); });
        }
        if(lista.length){ state.recursos = lista.map(r=> ({ ...r })); renderRecursos(); }
      } catch(_e2){ /* noop */ }
    });
  })();
  // Re-render de seguranÃ§a ao redimensionar/rolar (debounced)
  (function(){
    let t;
    function onReflow(){
      clearTimeout(t); t=setTimeout(()=>{ try { (window.renderMatrizesPorGrupo || renderMatrizesPorGrupo)?.(); } catch(_){} }, 120);
    }
    window.addEventListener('resize', onReflow, { passive:true });
    window.addEventListener('scroll', onReflow, { passive:true });
  })();
  // Delegação: botões dos grupos (novo esquema) - proteger contra binds duplicados
  if(els.matrizWrap && !els.matrizWrap.__boundClickAct){ els.matrizWrap.__boundClickAct = true; els.matrizWrap.addEventListener('click', e=>{
    const btn=e.target.closest('button[data-act]'); if(!btn) return;
    const act=btn.getAttribute('data-act'); const grupoId=btn.getAttribute('data-grupo'); if(!grupoId) return;
    if(act==='grupo-modo'){
  // Proxy para o handler canônico global para evitar lógica duplicada e erros de escopo
      try { e.preventDefault(); } catch(_){}
      if(window.__escToggleFromBtn){ return window.__escToggleFromBtn(btn); }
      // Se por algum motivo o handler global nÃ£o existir, apenas alterna modo localmente sem salvar
      const g = state.gruposTurnos.find(x=> x.id===grupoId);
  const agoraEdit = !(g && g.__modo==='edit');
      setModoGrupo(grupoId, agoraEdit? 'edit':'view');
      return renderMatrizesPorGrupo();
    } else if(act==='grupo-limpar'){
  // Proxy para o handler global padrão
      try { e.preventDefault(); } catch(_){}
      if(window.__escLimparFromBtn){ return window.__escLimparFromBtn(btn); }
  if(confirm('Apagar TODAS as alocações deste grupo?')){ Object.keys(state.matrizAlocacao).forEach(k=>{ if(k.startsWith(grupoId+'::')) delete state.matrizAlocacao[k]; }); renderMatrizesPorGrupo(); }
    }
  }); }

  // Fallback global: garante funcionamento mesmo se o listener acima não for ligado a tempo (protegido por flag)
  if(!window.__ESC_DOC_ACT_BOUND__){ window.__ESC_DOC_ACT_BOUND__=true; document.addEventListener('click', async function(ev){
        if(m){ return m[1]===hhIniSel && m[2]===hhFimSel; }
    if(!btn){
  // tenta um botão sem data-grupo explícito
      const btn2 = ev.target && ev.target.closest && ev.target.closest('button[data-act]');
        if(ii && ff) return ii===hhIniSel && ff===hhFimSel;
        // Sem informação de turno: não considera alocado para o turno do modal
        return false;
      const act2 = btn2.getAttribute('data-act');
      return false;
      const gid2 = resolverGrupoIdDoElemento(btn2); if(!gid2) return;
      ev.preventDefault();
  // Encaminha para o handler global se existir; previne execuções duplicadas
      if(act2==='grupo-modo'){
        if(window.__escToggleFromBtn) return window.__escToggleFromBtn(btn2);
        const g = state.gruposTurnos.find(x=> String(x.id)===String(gid2));
        const agoraEdit = !(g && g.__modo==='edit');
        setModoGrupo(gid2, agoraEdit? 'edit':'view');
        return renderMatrizesPorGrupo();
      } else {
        if(window.__escLimparFromBtn) return window.__escLimparFromBtn(btn2);
  if(confirm('Apagar TODAS as alocações deste grupo?')){ Object.keys(state.matrizAlocacao).forEach(k=>{ if(k.startsWith(String(gid2)+'::')) delete state.matrizAlocacao[k]; }); return renderMatrizesPorGrupo(); }
      }
      return;
    }
    const act=btn.getAttribute('data-act');
    if(act!=='grupo-modo' && act!=='grupo-limpar') return;
    ev.preventDefault();
    let grupoId=btn.getAttribute('data-grupo'); if(!grupoId){ grupoId = resolverGrupoIdDoElemento(btn); } if(!grupoId) return;
    if(act==='grupo-modo'){
      if(window.__escToggleFromBtn) return window.__escToggleFromBtn(btn);
      const g = state.gruposTurnos.find(x=> String(x.id)===String(grupoId));
      const agoraEdit = !(g && g.__modo==='edit');
      setModoGrupo(grupoId, agoraEdit? 'edit':'view');
      return renderMatrizesPorGrupo();
    } else if(act==='grupo-limpar'){
      if(window.__escLimparFromBtn) return window.__escLimparFromBtn(btn);
  if(confirm('Apagar TODAS as alocações deste grupo?')){ Object.keys(state.matrizAlocacao).forEach(k=>{ if(k.startsWith(grupoId+'::')) delete state.matrizAlocacao[k]; }); return renderMatrizesPorGrupo(); }
    }
  }, true); }
  // Listener delegado global para abrir Detalhamento a partir da matriz (garantia caso o bind local falhe)
  if(!window.__ESC_DOC_MATRIZ_DET_BOUND__){
    window.__ESC_DOC_MATRIZ_DET_BOUND__ = true;
    document.addEventListener('click', function(ev){
      try {
  let item = ev.target && ev.target.closest && ev.target.closest('.matriz-eq-item');
  if(item){ try { console.log('[escala][detalhe-delegado] clique capturado em .matriz-eq-item', item.textContent?.trim()); } catch(_l){} }
        // Compatibilidade: alguns templates podem usar <a> em vez de .matriz-eq-item
        let td = null; // será resolvido abaixo
        if(!item){
          const a = ev.target && ev.target.closest && ev.target.closest('a');
          const candTd = a && a.closest && a.closest('td[data-key]');
          if(a && candTd){
            item = a; td = candTd;
            try { console.log('[escala][detalhe-delegado] clique capturado em <a> dentro de td[data-key]:', a.textContent?.trim()); } catch(_l){}
          }
        }
        if(!item) return;
        // Evita dupla abertura caso outro handler também capture
        try { ev.preventDefault(); ev.stopImmediatePropagation && ev.stopImmediatePropagation(); ev.stopPropagation && ev.stopPropagation(); } catch(_sp){}
        td = td || (item.closest && item.closest('td[data-key]')); if(!td) return;
        const key = td.getAttribute('data-key')||''; // formato: grupoId::HH:MM-HH:MM|YYYY-MM-DD
        const nome = (item.getAttribute && item.getAttribute('data-eqnome')) || (item.textContent||'');
        if(!key || !nome) return;
        const parts = key.split('|'); const turnoFull = (parts[0]||''); const dataISO = (parts[1]||'').slice(0,10);
        const p2 = turnoFull.split('::'); const grupoId = (p2[0]||''); const faixa = (p2[1]||'');
        let tIni = '', tFim = '';
        if(faixa && faixa.includes('-')){ const tf = faixa.split('-'); tIni = (tf[0]||'').trim(); tFim = (tf[1]||'').trim(); }
        // Resolve equipe por nome no estado
        const st = (window.__ESCALA_STATE__ || (typeof state!=='undefined' && state) || {});
        const equipe = Array.isArray(st.equipes) ? st.equipes.find(eq => String(eq?.nome||'').toUpperCase() === String(nome||'').toUpperCase()) : null;
        // Carrega o HTML do modal, se necessário
        const url = basePath() + `/modal-detalhamento-equipe-dias?equipeId=${encodeURIComponent(equipe?.id||'')}&dataISO=${encodeURIComponent(dataISO||'')}&turnoIni=${encodeURIComponent(tIni||'')}&turnoFim=${encodeURIComponent(tFim||'')}&grupoId=${encodeURIComponent(grupoId||'')}`;
  try { console.log('[escala][detalhe-delegado] fetch modal URL:', url); } catch(_lf){}
        fetch(url, { credentials:'same-origin' })
          .then(r => r.ok ? r.text() : Promise.reject(r.status))
          .then(html => {
            let cont = document.getElementById('modalDetalhamentoEquipeDiaContainer');
            if(!cont){ cont = document.createElement('div'); cont.id = 'modalDetalhamentoEquipeDiaContainer'; document.body.appendChild(cont); }
            cont.innerHTML = html;
            const ctx = { equipe: equipe || { id:null, nome }, equipeNome: nome, dataISO, turnoIni: tIni, turnoFim: tFim, grupoId };
            try {
              console.log('[escala][detalhe-delegado] chamando abrirModalDetalhamentoEquipeDia com ctx:', ctx);
              if(typeof window.abrirModalDetalhamentoEquipeDia === 'function') return window.abrirModalDetalhamentoEquipeDia(ctx);
              // Tentativa tardia via namespace
              if(window.__ESCALA_FUNCS__ && typeof window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia === 'function') return window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia(ctx);
            } catch(_open){}
          })
          .catch(err => { try { console.warn('[escala][detalhe-delegado] erro ao abrir modal', err); } catch(_){} });
      } catch(_err){ /* noop */ }
    }, true);
    // CSS para garantir que o item seja clicável acima de qualquer overlay de célula
    try {
      if(!document.getElementById('escalaMatrizClickableOverrides')){
        const st = document.createElement('style');
        st.id = 'escalaMatrizClickableOverrides';
        st.textContent = '.matriz-eq-item{pointer-events:auto !important; position:relative; z-index:6;}';
        document.head.appendChild(st);
      }
    } catch(_css){}
    // Delegação adicional no container da matriz (bolha) como redundância
    try {
      const cont = document.getElementById('matrizAlocacao');
      if(cont && !cont.__escDetBound){
        cont.__escDetBound = true;
        cont.addEventListener('click', function(e){
          const it = e.target && e.target.closest && e.target.closest('.matriz-eq-item');
          if(!it) return;
          // deixa o listener global tratar (evita duplicar fetch)
          try { console.debug('[escala][detalhe-container] clique encaminhado ao listener global'); } catch(_l){}
        }, false);
      }
    } catch(_bind){}
  }

  // Abertura inline segura: chamada diretamente pelo onclick do link renderizado na célula
  try {
    if(typeof window.__escOpenDet !== 'function'){
      window.__escOpenDet = function(el, ev){
        try {
          console.log('[escala][inline] __escOpenDet acionado', { el, evType: ev && ev.type });
          if(ev){ try { ev.preventDefault(); ev.stopPropagation(); } catch(_){} }
          if(!el){ console.warn('[escala][inline] __escOpenDet sem elemento'); return false; }
          const td = el.closest && el.closest('td[data-key]'); if(!td){ console.warn('[escala][inline] __escOpenDet: td[data-key] não encontrado'); return false; }
          const key = td.getAttribute('data-key')||'';
          const nome = (el.getAttribute && el.getAttribute('data-eqnome')) || (el.textContent||'');
          if(!key || !nome){ console.warn('[escala][inline] __escOpenDet: key/nome ausentes', { key, nome }); return false; }
          const parts = key.split('|'); const turnoFull = (parts[0]||''); const dataISO = (parts[1]||'').slice(0,10);
          const p2 = turnoFull.split('::'); const grupoId = (p2[0]||''); const faixa = (p2[1]||'');
          let tIni='', tFim=''; if(faixa && faixa.includes('-')){ const tf=faixa.split('-'); tIni=(tf[0]||'').trim(); tFim=(tf[1]||'').trim(); }
          const st = (window.__ESCALA_STATE__ || (typeof state!=='undefined' && state) || {});
          const equipe = Array.isArray(st.equipes) ? st.equipes.find(eq => String(eq?.nome||'').toUpperCase() === String(nome||'').toUpperCase()) : null;
          const url = basePath() + `/modal-detalhamento-equipe-dias?equipeId=${encodeURIComponent(equipe?.id||'')}&dataISO=${encodeURIComponent(dataISO||'')}&turnoIni=${encodeURIComponent(tIni||'')}&turnoFim=${encodeURIComponent(tFim||'')}&grupoId=${encodeURIComponent(grupoId||'')}`;
          console.log('[escala][inline] __escOpenDet fetch URL:', url);
          fetch(url, { credentials:'same-origin' })
            .then(r => r.ok ? r.text() : Promise.reject(r.status))
            .then(html => {
              let cont = document.getElementById('modalDetalhamentoEquipeDiaContainer');
              if(!cont){ cont = document.createElement('div'); cont.id='modalDetalhamentoEquipeDiaContainer'; document.body.appendChild(cont); }
              cont.innerHTML = html;
              const ctx = { equipe: equipe || { id:null, nome }, equipeNome: nome, dataISO, turnoIni: tIni, turnoFim: tFim, grupoId };
              console.log('[escala][inline] __escOpenDet ctx pronto, chamando abrirModalDetalhamentoEquipeDia');
              try {
                if(typeof window.abrirModalDetalhamentoEquipeDia === 'function') return window.abrirModalDetalhamentoEquipeDia(ctx);
                if(window.__ESCALA_FUNCS__ && typeof window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia === 'function') return window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia(ctx);
              } catch(_open){}
              return false;
            })
            .catch(err => { try { console.warn('[escala][detalhe-inline] erro ao abrir modal', err); } catch(_){}; return false; });
        } catch(_err){ return false; }
        return false;
      };
    }
  } catch(_e){}
  { const _b=$('btnSalvarEscalaTopo'); if(_b && !_b.__bound){ _b.__bound=true; _b.addEventListener('click', ()=> salvarEscala(false)); } }
const btnSalvarDG = $('btnSalvarSecDados');
if(btnSalvarDG && !btnSalvarDG.__boundSave){
  btnSalvarDG.__boundSave = true;
  if(!btnSalvarDG.dataset._originalLabel){ btnSalvarDG.dataset._originalLabel = btnSalvarDG.innerText; }
  // Captura estado baseline ao entrar na página (será atualizado depois do primeiro save)
  if(!state._dadosGeraisOriginal){ state._dadosGeraisOriginal = {}; }
  function snapshotDadosGerais(){
    state._dadosGeraisOriginal = {
      descricao: els.descricao?.value||'',
      classificacao: els.classificacao?.value||'',
      unidadeId: els.unidade?.value||'',
      periodoIni: els.dataInicio?.value||'',
      periodoFim: els.dataFim?.value||'',
      responsavelId: state.dadosGerais?.responsavelId || state.responsavel?.id || null,
      responsavelNome: els.respNome?.value||''
    };
  }
  function houveAlteracao(){
    const base = state._dadosGeraisOriginal || {};
    if((els.descricao?.value||'') !== (base.descricao||'')) return true;
    if((els.classificacao?.value||'') !== (base.classificacao||'')) return true;
    if((els.unidade?.value||'') !== (base.unidadeId||'')) return true;
    if((els.dataInicio?.value||'') !== (base.periodoIni||'')) return true;
    if((els.dataFim?.value||'') !== (base.periodoFim||'')) return true;
    const atualRespId = state.responsavel?.id || state.dadosGerais?.responsavelId || null;
    if((atualRespId||null) !== (base.responsavelId||null)) return true;
    return false;
  }
  function atualizarEstadoBotao(){
    if(houveAlteracao()){
      btnSalvarDG.disabled = false;
      btnSalvarDG.classList.add('btn-warning');
      btnSalvarDG.innerText = btnSalvarDG.dataset._originalLabel + ' *';
    } else {
      btnSalvarDG.disabled = true;
      btnSalvarDG.classList.remove('btn-warning');
      btnSalvarDG.innerText = btnSalvarDG.dataset._originalLabel;
    }
  }
  // Monitora campos relevantes
  ['change','input'].forEach(evt=>{
    els.descricao && els.descricao.addEventListener(evt, atualizarEstadoBotao);
    els.classificacao && els.classificacao.addEventListener(evt, atualizarEstadoBotao);
    els.unidade && els.unidade.addEventListener(evt, atualizarEstadoBotao);
    els.dataInicio && els.dataInicio.addEventListener(evt, atualizarEstadoBotao);
    els.dataFim && els.dataFim.addEventListener(evt, atualizarEstadoBotao);
  // Também reavalia as abas em tempo real quando os dados gerais mudarem
    els.descricao && els.descricao.addEventListener(evt, ()=>{ try { avaliarProgressaoAbas(); } catch(_){} });
    els.unidade && els.unidade.addEventListener(evt, ()=>{ try { avaliarProgressaoAbas(); } catch(_){} });
    els.dataInicio && els.dataInicio.addEventListener(evt, ()=>{ try { avaliarProgressaoAbas(); } catch(_){} });
    els.dataFim && els.dataFim.addEventListener(evt, ()=>{ try { avaliarProgressaoAbas(); } catch(_){} });
  });
  // Responsável selecionado via modal
  window.addEventListener('escala:efetivoSelecionado', (ev)=>{
    try {
      const f = ev.detail;
      if(f && f.id){
        // sincroniza dadosGerais.responsavelId para comparaÃ§Ã£o correta
        state.responsavel = { id:f.id, nome:f.nome||f.codigo||f.id };
        state.dadosGerais = state.dadosGerais||{};
        state.dadosGerais.responsavelId = f.id;
        if(els.respNome) els.respNome.value = state.responsavel.nome;
  console.debug('[escala][dirty-check] responsável selecionado', f.id, 'snapshot=', state._dadosGeraisOriginal?.responsavelId);
  // Se snapshot ainda não foi criado (ex: usuário abriu modal muito rápido), cria agora para comparar depois
        if(!state._dadosGeraisOriginal || Object.keys(state._dadosGeraisOriginal).length===0){
          state._dadosGeraisOriginal = { descricao: els.descricao?.value||'', classificacao: els.classificacao?.value||'', unidadeId: els.unidade?.value||'', periodoIni: els.dataInicio?.value||'', periodoFim: els.dataFim?.value||'', responsavelId: null };
        }
  // Força habilitação imediata se ID diferente do snapshot ou snapshot.responsavelId ainda nulo
        const snapResp = state._dadosGeraisOriginal.responsavelId||null;
        if(snapResp!==f.id){
          const btnSalvarDG = $('btnSalvarSecDados');
          if(btnSalvarDG){
            btnSalvarDG.disabled=false;
            btnSalvarDG.classList.add('btn-warning');
            if(!btnSalvarDG.dataset._originalLabel) btnSalvarDG.dataset._originalLabel = btnSalvarDG.innerText.replace(/ \*$/,'');
            btnSalvarDG.innerText = (btnSalvarDG.dataset._originalLabel||'Salvar Dados')+' *';
          }
        }
      }
    } catch(_e){}
    atualizarEstadoBotao();
  });
  // Inicialmente desabilitado até haver mudança
setTimeout(()=>{ snapshotDadosGerais(); atualizarEstadoBotao(); }, 400);
window.addEventListener('escala:snapshotSolicitar', ()=>{ snapshotDadosGerais(); atualizarEstadoBotao(); });
  btnSalvarDG.addEventListener('click', async ()=>{
  console.log('[debug] botão salvar clicado, state.created=', state.created);
    if(btnSalvarDG.disabled) return; // proteÃ§Ã£o extra
    try {
      if(!state.created){
        console.log('[debug] chamando salvarDadosGerais');
        await salvarDadosGerais();
      } else {
        console.log('[debug] chamando salvarAlteracoesEscala');
        await salvarAlteracoesEscala();
      }
      snapshotDadosGerais();
      atualizarEstadoBotao();
    } catch(err){ console.error('[escala][save] erro ao salvar', err); alert('Erro ao salvar: '+(err.message||err)); }
  });
}

// Fallback global: garante captura do clique mesmo se initEscalaPage não rodar a tempo
// Evita duplicidade: só atua se o botão não tiver __boundSave
document.addEventListener('click', async (ev)=>{
  try {
    const el = ev.target && (ev.target.id==='btnSalvarSecDados' ? ev.target : ev.target.closest && ev.target.closest('#btnSalvarSecDados'));
    if(!el) return;
  if(el.disabled){ console.debug('[escala][save][global-fallback] ignorado: botão desabilitado'); return; }
  if(el.dataset && el.dataset.fallbackSaving === '1'){ console.debug('[escala][save][global-fallback] ignorado: já em progresso por outro handler'); return; }
  if(el.__boundSave) return; // o handler principal já está instalado
    console.debug('[escala][save][global-fallback] clique capturado (sem bound primÃ¡rio)');
  // Se o dirty-check não rodou ainda, validar rapidamente os campos para permitir o save
    try {
      const desc = document.getElementById('descricaoEscala')?.value?.trim();
      const uni  = document.getElementById('unidadeEscala')?.value;
      const di   = document.getElementById('dataInicio')?.value;
      const df   = document.getElementById('dataFim')?.value;
      if(!desc || !uni || !di || !df){
        alert('Preencha Descrição, Unidade e Período antes de salvar.');
        return;
      }
    } catch(_v){}
    try { el.dataset.fallbackSaving = '1'; } catch(_mark){}
    if(!state.created) await salvarDadosGerais(); else await salvarAlteracoesEscala();
    try { delete el.dataset.fallbackSaving; } catch(_clear){}
  } catch(e){ console.error('[escala][save][global-fallback] erro ao processar clique', e); }
}, true);
// Botão Salvar Alocação removido do HTML; não registrar listener aqui.
// Botão Validar Escala: bind único com flag para evitar duplicidade
try {
  const btnV = $('btnValidarEscala');
  if(btnV && !btnV.__escValidBound__){
    btnV.addEventListener('click', ()=>{ executarValidacaoConflitos(); });
    btnV.__escValidBound__ = true; // evita binds duplicados por fallbacks
    btnV.__bound = true; // compat com aba6_validacao.js
  }
} catch(_e){}
// Injeta contÃªiner de resultados da validaÃ§Ã£o, se nÃ£o existir
(function ensureValidacaoUI(){
  try {
    const tab = document.getElementById('aba-validacao');
    if(!tab) return;
    if(!tab.querySelector('#validacaoResultados')){
      const box = document.createElement('div');
      box.id = 'validacaoResultados';
      box.className = 'mt-3';
      tab.appendChild(box);
    }
  } catch(_e){}
})();
    // (Removida duplicaÃ§Ã£o de salvarDadosGerais aqui)
  try { window.openEquipeEfetivoModal = openEquipeEfetivoModal; } catch(_e){}
  // (funÃ§Ã£o dinÃ¢mica antiga abrirModalEfetivoEquipe removida - fluxo agora centralizado via delegaÃ§Ã£o e modal estÃ¡tico)
  // LEGACY handlers desativados (conflitavam com openEquipeEfetivoModal)
  if(false){
    const inputCodigo=document.getElementById('efetivoCodigo');
    const btnAdd=document.getElementById('btnAdicionarEfetivo');
    const btnBuscar=document.getElementById('btnBuscarFuncionario');
    async function adicionarPorCodigo(){}
    if(btnBuscar) btnBuscar.onclick=null;
    if(btnAdd) btnAdd.onclick=null;
  }
  // Alias global removido: usamos namespace __ESCALA_FUNCS__ para evitar colisões
  // (Removido bloco duplicado de modal de membros fora de funÃ§Ã£o)// ========================= helpers gerais =========================
function obterQueryId(){ try { const url = new URL(location.href); const id = url.searchParams.get('id'); console.log('[escala][obterQueryId] location.href=', location.href, 'parsed URL=', url.toString(), 'id=', id); return id; } catch(e){ console.warn('[escala][obterQueryId] erro', e); return null; } }
function ensureEscalaId(){
  try {
    if(state.escalaId) return state.escalaId;
    let id = null;
    // 1) Querystring
    try { id = obterQueryId(); } catch(_q){}
    // 2) Campo oculto comum
    if(!id){ const el = document.querySelector('#escalaId,[name="escalaId"],[name="idEscala"]'); id = el && (el.value || el.getAttribute('value')) || null; }
    // 3) Dump carregado previamente
    if(!id && window.__ESCALA_RAW__){ id = window.__ESCALA_RAW__.id || window.__ESCALA_RAW__._id || null; }
    // 4) HeurÃ­stica: path com /nova?id=... jÃ¡ tratado por query
    if(id){ state.escalaId = String(id).trim(); return state.escalaId; }
  } catch(_e){}
  return null;
}
function detectTipoEarly(){ try { const p=location.pathname.toLowerCase(); if(p.includes('/ordinaria/')) return 'ORDINÃRIA'; if(p.includes('/extraordinaria/')) return 'EXTRAORDINÃRIA'; return null; } catch(_){ return null; } }
try { if(typeof window!=='undefined'){ window.detectTipoEarly = detectTipoEarly; } } catch(_e){}
function uuid(){ return 'g'+Math.random().toString(36).slice(2,10)+Date.now().toString(36); }
// (unificado) dateBrToISO / dateISOToBr
function dateISOToBr(v){ if(!v) return ''; const iso=String(v).trim(); const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/); if(!m){ if(/^(\d{2})\/(\d{2})\/(\d{4})$/.test(iso)) return iso; return ''; } return `${m[3]}/${m[2]}/${m[1]}`; }
function normalizarDatasPeriodoParaEstado(){ const ini=els.dataInicio?.value.trim(); const fim=els.dataFim?.value.trim(); const isoIni=dateBrToISO(ini); const isoFim=dateBrToISO(fim); if((ini && !isoIni)||(fim && !isoFim)) throw new Error('Datas invÃ¡lidas'); if(isoIni && isoFim && isoFim<isoIni) throw new Error('Fim < InÃ­cio'); state.periodo.ini=isoIni||null; state.periodo.fim=isoFim||null; }
// Resolver id de grupo a partir de um botÃ£o ou elemento dentro do container do grupo
function resolverGrupoIdDoElemento(el){
  try {
    if(!el) return null;
    let gid = el.getAttribute && el.getAttribute('data-grupo');
    if(gid && gid!=='' && gid!=='undefined') return gid;
    const cont = el.closest && el.closest('.matriz-grupo[data-grupo]');
    if(cont){ gid = cont.getAttribute('data-grupo'); if(gid) return gid; }
  } catch(_e){}
  return null;
}
__diag('date-utils-ready');
// function atualizarLabelsContexto(){ try { const d=els.descricao?.value.trim()||''; const ini=els.dataInicio?.value||''; const fim=els.dataFim?.value||''; if(d) state.dadosGerais.descricao=d; if(els.unidade?.value) state.dadosGerais.unidadeId=els.unidade.value; const lblPeriodo=$('lblResumoPeriodo'); if(lblPeriodo) lblPeriodo.textContent=(ini&&fim? ini+' Ã  '+fim : '(perÃ­odo nÃ£o definido)'); } catch(_){ } }

// ========================= seleÃ§Ã£o definitiva da unidade =========================
// ---------- ClassificaÃ§Ã£o (tipo) helpers ----------
function updateClassificationUI(){
  try {
    const lbl=document.getElementById('tipoEscalaLabel');
    const inp=els && els.classificacao ? els.classificacao : document.getElementById('classificacaoEscala');
    const tipo = state.tipo || state.dadosGerais?.classificacao || null;
    if(tipo){
      if(inp && !inp.value) inp.value = tipo;
      if(lbl) lbl.textContent = '('+tipo+')';
    } else {
      if(lbl) lbl.textContent='';
    }
  } catch(e){ console.debug('[escala][classificacao] falha update UI', e); }
}
function detectarTipoSeAusente(reason){
  if(state.tipo) return state.tipo;
  let det = (typeof detectTipoEarly==='function'? detectTipoEarly : (typeof window!=='undefined' && typeof window.detectTipoEarly==='function'? window.detectTipoEarly : ()=>null))();
  if(!det && typeof location!=='undefined'){
    // heurÃ­stica extra: Ãºltima parte do path
    try {
      const segs = location.pathname.toLowerCase().split('/').filter(Boolean);
      if(segs.includes('ordinaria')) det='ORDINÃRIA';
      else if(segs.includes('extraordinaria')) det='EXTRAORDINÃRIA';
    } catch(_e){}
  }
  if(det){ state.tipo=det; console.debug('[escala][classificacao] detectado', det, 'via', reason); }
  return state.tipo;
}
// Exposição global para uso entre diferentes blocos/IIFEs
try { if (typeof window !== 'undefined' && typeof window.detectarTipoSeAusente !== 'function') { window.detectarTipoSeAusente = detectarTipoSeAusente; } } catch(_e){}
function applyUnidadeDefinitiva(reason){
  try {
    // Re-resolve o select toda vez: o DOM pode ter sido refeito por renderizações
    els.unidade = els.unidade || document.getElementById('unidadeEscala')
      || document.getElementById('unidade')
      || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
    if(!els.unidade) return;
    const uid = state.dadosGerais?.unidadeId || state._pendingUnidadeId; if(!uid) return;
    const alvo = String(uid);
    let opt = Array.from(els.unidade.options).find(o=> o.value===alvo);
    if(!opt){
      opt=document.createElement('option');
      opt.value=alvo; opt.textContent=(state._unidadeNomeCarregada||'Unidade')+' *';
      opt.dataset.injetado='1';
      els.unidade.appendChild(opt);
      console.debug('[escala][unidade][apply] option injetada (',reason,')', alvo);
    }
    const jaAplicada = els.unidade.value === alvo && els.unidade.classList.contains('value-applied');
    els.unidade.value = alvo;
    els.unidade.removeAttribute('disabled');
    els.unidade.classList.add('value-applied');
    // Sincroniza state ao aplicar
    try { state.dadosGerais = state.dadosGerais || {}; state.dadosGerais.unidadeId = alvo; } catch(_s){}
    if(!jaAplicada){
      els.unidade.dispatchEvent(new Event('change'));
    }
    console.debug('[escala][unidade][apply] selecionada (',reason,')', alvo, 'totalOptions=', els.unidade.options.length);
  } catch(err){ console.warn('[escala][unidade][apply] erro', err); }
}
// Guardião robusto: garante aplicação da unidade de forma idempotente, re-resolvendo select e injetando option se necessário
function ensureUnidadeFinal(reason){
  console.log('[DEBUG] ensureUnidadeFinal called with reason:', reason);
  try {
    // Re-resolve elementos e estado
    els.unidade = document.getElementById('unidadeEscala')
      || document.getElementById('unidade')
      || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]')
      || els.unidade;
    if(!els.unidade) return false;
    const uid = state?.dadosGerais?.unidadeId || state?._pendingUnidadeId;
    if(!uid) return false;
    const alvo = String(uid);
    // Injeta / encontra option
    const opts = Array.from(els.unidade.options||[]);
    let opt = opts.find(o=> String(o.value)===alvo);
    if(!opt){
      opt = document.createElement('option');
      opt.value = alvo;
      opt.textContent = (state._unidadeNomeCarregada||'Unidade')+' *';
      opt.dataset.injetado = '1';
      els.unidade.appendChild(opt);
    }
  const before = els.unidade.value;
  const already = before===alvo && els.unidade.classList.contains('value-applied');
    // Limpa seleção de placeholder se existir
    try {
      // Limpa qualquer placeholder marcado como selected
      const ph = els.unidade.querySelector('option[disabled][selected]');
      if(ph){ ph.selected = false; ph.removeAttribute('selected'); }
    } catch(_ph){}
    // Ajusta seleção de forma explícita
    try {
      // Primeiro, desmarca todos e marca o alvo
      opts.forEach((o)=>{ o.selected = (String(o.value)===alvo); });
      opt.selected = true;
      // Garante selectedIndex coerente com a option alvo (após eventuais appends)
      const idxNew = Array.from(els.unidade.options||[]).findIndex(o=> String(o.value)===alvo);
      if(idxNew >= 0) els.unidade.selectedIndex = idxNew;
    } catch(_sel){}
  // Redundância: garante a propriedade value sincronizada com o alvo
  // Para forçar o navegador a atualizar a renderização de um <select disabled>,
  // habilitamos temporariamente e restauramos o disabled no próximo tick.
    const wasDisabled = (els.unidade.disabled === true) || els.unidade.hasAttribute('disabled');
    // Não retire o disabled em modo edição; apenas sincronize visualmente sem reabilitar
    const isEdit = !!(state && state.created === true);
    if(wasDisabled && !isEdit){
      try { els.unidade.disabled = false; els.unidade.removeAttribute('disabled'); } catch(_d){}
    }
  try {
    els.unidade.value = alvo;
    // Reforço: garanta que selectedIndex aponte para a option alvo após definir value
    const idx2 = Array.from(els.unidade.options||[]).findIndex(o=> String(o.value)===alvo);
    if(idx2 >= 0) els.unidade.selectedIndex = idx2;
    // Se algum placeholder permaneceu marcado como selected, limpe-o explicitamente
    try { const ph2 = els.unidade.querySelector('option[disabled][selected]'); if(ph2){ ph2.selected = false; ph2.removeAttribute('selected'); } } catch(_ph2){}
    console.log('value set to:', els.unidade.value, 'selectedIndex=', els.unidade.selectedIndex);
  } catch(_v){}
  if(wasDisabled){
    // Restaura disabled; em modo edição mantenha imediatamente travado
    const restore = ()=>{ try { els.unidade.disabled = true; els.unidade.setAttribute('disabled','disabled'); } catch(_d){} };
    if(isEdit){ restore(); } else { setTimeout(restore, 30); }
  }
    els.unidade.classList.add('value-applied');
    // Remove definitivamente placeholders vazios (value="") para evitar re-seleção futura acidental
    try { Array.from(els.unidade.options).filter(o=> String(o.value)==='').forEach(o=> o.remove()); } catch(_rm){}
    try { state.dadosGerais = state.dadosGerais||{}; state.dadosGerais.unidadeId = alvo; } catch(_s){}
    try { if(typeof updateUnidadeMirror==='function'){ updateUnidadeMirror(); } else if(window && typeof window.updateUnidadeMirror==='function'){ window.updateUnidadeMirror(); } } catch(_m){}
  if(!already){ try{ els.unidade.dispatchEvent(new Event('change')); }catch(_e){} try{ els.unidade.dispatchEvent(new Event('input')); }catch(_e2){} }
    console.debug('[escala][unidade][ensure] aplicada (',reason,')', alvo);
    return true;
  } catch(e){ console.warn('[escala][unidade][ensure] erro', e); return false; }
}
try { if(typeof window!=='undefined' && typeof window.ensureUnidadeFinal!=='function'){ window.ensureUnidadeFinal = ensureUnidadeFinal; } } catch(_e){}

// Reforço visual: garante que o select exiba a Unidade selecionada mesmo que esteja bloqueado/readonly
// Não altera atributos de bloqueio; apenas injeta/seleciona a option correta e remove o "selected" do placeholder, se houver
function ensureUnidadeVisual(reason){
  console.log('[DEBUG] ensureUnidadeVisual called with reason:', reason);
  try {
    const sel = document.getElementById('unidadeEscala')
      || document.getElementById('unidade')
      || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
    if(!sel) return false;
    const uid = state?.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
    if(!uid) return false;
    // Encontrar ou injetar option alvo
    let opt = Array.from(sel.options||[]).find(o=> String(o.value)===uid);
    if(!opt){
      // tenta obter nome a partir de lista carregada anteriormente
      let nome = state?._unidadeNomeCarregada || '';
      if(!nome && Array.isArray(state._unidadesCarregadas)){
        const ach = state._unidadesCarregadas.find(u=> String(u.id)===uid);
        if(ach) nome = (ach.codigo? ach.codigo+' - ' : '') + (ach.nome||'Unidade');
      }
      if(!nome) nome = 'Unidade';
      opt = document.createElement('option');
      opt.value = uid;
      opt.textContent = nome + ' *';
      opt.dataset.injetado = '1';
      sel.appendChild(opt);
    }
    // Desmarca placeholder selecionado, se existir
    try { const ph = sel.querySelector('option[disabled][selected]'); if(ph){ ph.selected=false; ph.removeAttribute('selected'); } } catch(_ph){}
    // Seleciona explicitamente a option alvo e sincroniza selectedIndex/value
    Array.from(sel.options).forEach(o=> o.selected = (String(o.value)===uid));
    const idx = Array.from(sel.options).findIndex(o=> String(o.value)===uid);
    if(idx>=0) sel.selectedIndex = idx;
    try { sel.value = uid; } catch(_){ }
    sel.classList && sel.classList.add('value-applied');
    // Espelha no estado por segurança
    try { state.dadosGerais.unidadeId = uid; } catch(_s){}
    try { if(typeof updateUnidadeMirror==='function'){ updateUnidadeMirror(); } else if(window && typeof window.updateUnidadeMirror==='function'){ window.updateUnidadeMirror(); } } catch(_m){}
    console.debug('[escala][unidade][visual] garantida (', reason, ')', uid);
    return true;
  } catch(e){ console.warn('[escala][unidade][visual] erro', e); return false; }
}
try { if(typeof window!=='undefined' && typeof window.ensureUnidadeVisual!=='function'){ window.ensureUnidadeVisual = ensureUnidadeVisual; } } catch(_e){}
// Modo "unidade única": em edição, renderiza apenas a Unidade do banco e evita repopulações
function aplicarUnidadeComoOpcaoUnica(reason){
  try {
    const sel = document.getElementById('unidadeEscala')
      || document.getElementById('unidade')
      || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
    if(!sel) return false;
    const uid = state?.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
    if(!uid) return false;
    // Nome amigável
    let nome = state?._unidadeNomeCarregada || '';
    if(!nome && Array.isArray(state._unidadesCarregadas)){
      const ach = state._unidadesCarregadas.find(u=> String(u.id)===uid);
      if(ach) nome = (ach.codigo? ach.codigo+' - ' : '') + (ach.nome||'Unidade');
    }
    if(!nome) nome = 'Unidade';
    // Repaint technique: habilita temporariamente para forçar o navegador a redesenhar
    const wasDisabled = sel.disabled;
    try { sel.disabled = false; sel.removeAttribute('disabled'); } catch(_ed){}
    sel.innerHTML = `<option value="${uid}" selected>${nome}</option>`;
    sel.selectedIndex = 0;
    sel.value = uid;
    // Remover qualquer option vazia que tenha sido injetada por fallbacks
    try { sel.querySelectorAll('option').forEach(o=>{ if(o.value==='' || /selecion/i.test(o.textContent||'')) o.remove(); }); } catch(_r){}
    // Força reflow antes de re-desabilitar
    try { void sel.offsetHeight; } catch(_h){}
    try { sel.dispatchEvent(new Event('change',{bubbles:true})); } catch(_ev){}
    // Restaurar desabilitado
    if(wasDisabled){ try { sel.disabled = true; sel.setAttribute('disabled','disabled'); } catch(_d){} }
    sel.classList.add('value-applied');
    try { state.dadosGerais.unidadeId = uid; } catch(_s){}
    try { updateUnidadeMirror && updateUnidadeMirror(); } catch(_m){}
    try { document.body && (document.body.dataset.unidadeSingle = '1'); } catch(_b){}
    window.__ESCALA_UNIDADE_SINGLE__ = true;
    window.__ESCALA_UNIDADE_SINGLE_ID__ = uid;
  try { iniciarGuardaGlobalUnidade && iniciarGuardaGlobalUnidade(); } catch(_g){}
    // Observador forte: impede reinserção de placeholder e repopulações indevidas
    try {
      if(!sel.__unidadeSingleObserver){
        const enforce = ()=>{
          const curVal = sel.value;
          const hasPlaceholder = !!sel.querySelector('option[value=""]');
          const wrong = curVal!==uid || hasPlaceholder || sel.options.length!==1;
          if(wrong){
            const wasDisabledInner = sel.disabled;
            try { sel.disabled=false; sel.removeAttribute('disabled'); } catch(_e1){}
            sel.innerHTML = `<option value="${uid}" selected>${nome}</option>`;
            sel.selectedIndex = 0;
            sel.value = uid;
            try { void sel.offsetWidth; } catch(_e2){}
            try { sel.dispatchEvent(new Event('change',{bubbles:true})); } catch(_e3){}
            if(wasDisabledInner){ try { sel.disabled=true; sel.setAttribute('disabled','disabled'); } catch(_e4){} }
          }
        };
        const mo = new MutationObserver((muts)=>{
          let needs=false;
          for(const m of muts){ if(m.type==='childList' || (m.type==='attributes' && (m.attributeName==='disabled' || m.attributeName==='value'))){ needs=true; break; } }
          if(needs) enforce();
        });
        mo.observe(sel, { childList:true, subtree:false, attributes:true, attributeFilter:['disabled','value'] });
        sel.__unidadeSingleObserver = mo;
        // Também aplica em intervalos curtos nos primeiros 2s para pegar alterações tardias
        let ticks=0; const iv=setInterval(()=>{ enforce(); if(++ticks>8) clearInterval(iv); }, 250);
      }
    } catch(_obs){}
    console.debug('[escala][unidade][single] aplicada como opção única (', reason, ')', uid);
    return true;
  } catch(e){ console.warn('[escala][unidade][single] erro', e); return false; }
}
try { if(typeof window!=='undefined' && typeof window.aplicarUnidadeComoOpcaoUnica!=='function'){ window.aplicarUnidadeComoOpcaoUnica = aplicarUnidadeComoOpcaoUnica; } } catch(_e){}

// Guarda global: observa o body inteiro para reinstalar a opção única se o select for recriado
function iniciarGuardaGlobalUnidade(){
  try {
    if(document.__unidadeGlobalGuard__) return;
    const debounced = (fn=>{ let t; return ()=>{ clearTimeout(t); t=setTimeout(fn, 50); }; })
      (()=>{
        try {
          if(!window.__ESCALA_UNIDADE_SINGLE__) return;
          const sel = document.getElementById('unidadeEscala')
            || document.getElementById('unidade')
            || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
          if(sel){ try { aplicarUnidadeComoOpcaoUnica('global-guard'); } catch(_e){} }
        } catch(_e){}
      });
    const mo = new MutationObserver((muts)=>{
      let hit=false;
      for(const m of muts){ if(m.type==='childList'){ hit=true; break; } }
      if(hit) debounced();
    });
    mo.observe(document.body, { childList:true, subtree:true });
    document.__unidadeGlobalGuard__ = mo;
  } catch(_e){}
}
try { if(typeof window!=='undefined' && typeof window.iniciarGuardaGlobalUnidade!=='function'){ window.iniciarGuardaGlobalUnidade = iniciarGuardaGlobalUnidade; } } catch(_e){}
// Enforcer hard: roda por alguns segundos aplicando a unidade repetidamente (cobre cenários de bloqueios e mutações agressivas)
function iniciarEnforcerUnidade(msJanela=3500){
  try {
    if(window.__ESC_UNI_ENFORCER__) return; // já ativo
    const t0 = Date.now();
    window.__ESC_UNI_ENFORCER__ = setInterval(()=>{
      try {
        const uid = state?.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
        const sel = document.getElementById('unidadeEscala') || document.getElementById('unidade') || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
        if(uid && sel){
          // injeta option se necessário
          let opt = Array.from(sel.options||[]).find(o=> String(o.value)===uid);
          if(!opt){ opt = document.createElement('option'); opt.value=uid; opt.textContent=(state._unidadeNomeCarregada||'Unidade')+' *'; opt.dataset.injetado='1'; sel.appendChild(opt); }
          // aplica seleção de forma direta
          Array.from(sel.options).forEach(o=> o.selected = (String(o.value)===uid));
          const idx = Array.from(sel.options).findIndex(o=> String(o.value)===uid);
          if(idx>=0) sel.selectedIndex = idx;
          // Em modo edição, não remova o disabled; apenas sincronize value/selected
          sel.value = uid;
          try { if(!(state && state.created===true)) sel.removeAttribute('disabled'); } catch(_){ }
          sel.classList && sel.classList.add('value-applied');
          // espelha no estado
          try { state.dadosGerais.unidadeId = uid; } catch(_){}
        }
      } catch(_tick){}
      if(Date.now()-t0 > msJanela){ try { clearInterval(window.__ESC_UNI_ENFORCER__); window.__ESC_UNI_ENFORCER__=null; } catch(_){} }
    }, 160);
  } catch(_e){}
}
try { if(typeof window!=='undefined' && typeof window.iniciarEnforcerUnidade!=='function'){ window.iniciarEnforcerUnidade = iniciarEnforcerUnidade; } } catch(_e){}
// Exposição global para uso entre diferentes blocos/IIFEs
try { if (typeof window !== 'undefined' && typeof window.applyUnidadeDefinitiva !== 'function') { window.applyUnidadeDefinitiva = applyUnidadeDefinitiva; } } catch(_e){}
// Guarda de valor: mantém o select coerente com o estado mesmo se opções/atributos mudarem
function bindUnidadeValueGuard(){
  try {
    els.unidade = els.unidade || document.getElementById('unidadeEscala') || document.getElementById('unidade') || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
    if(!els.unidade) return;
    if(els.unidade.__escGuardBound__) return;
    const enforce = (src)=>{
      try{
        const alvo = state?.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
        if(!alvo) return;
        if(els.unidade.value!==alvo){ ensureUnidadeFinal('guard:'+src); }
      }catch(_e){}
    };
    els.unidade.addEventListener('change', ()=> enforce('change'));
    els.unidade.addEventListener('input', ()=> enforce('input'));
    // Observa alterações de seleção em options (selected) e estrutura
    const obs = new MutationObserver(()=> enforce('mut'));
    obs.observe(els.unidade, { subtree:true, childList:true, attributes:true, attributeFilter:['selected'] });
    els.unidade.__escGuardBound__ = true;
    // Primeira verificação assíncrona
    setTimeout(()=> enforce('init'), 0);
  } catch(_g){}
}
try { if(typeof window!=='undefined' && typeof window.bindUnidadeValueGuard!=='function'){ window.bindUnidadeValueGuard = bindUnidadeValueGuard; } } catch(_e){}
// Intervalo de garantia (pÃ¡ra ao conseguir aplicar)
function garantirUnidadeApos(msTotal=3000){
  const start=Date.now();
  const int=setInterval(()=>{
    // Re-resolve select a cada tick
    els.unidade = els.unidade || document.getElementById('unidadeEscala') || document.getElementById('unidade') || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
    const ok = els.unidade && state.dadosGerais?.unidadeId && els.unidade.value===String(state.dadosGerais.unidadeId);
    if(ok){ clearInterval(int); return; }
  try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('interval'); } catch(_e){}
    if(Date.now()-start>msTotal) clearInterval(int);
  },250);
}
// Exposição global (evita ReferenceError quando chamada de outro escopo)
try { if (typeof window !== 'undefined' && typeof window.garantirUnidadeApos !== 'function') { window.garantirUnidadeApos = garantirUnidadeApos; } } catch(_e){}
// Localiza elemento de unidade tardiamente se HTML for injetado depois do script
function _loopResolveUnidadeElement(){
  if(els.unidade && els.unidade.tagName){ return true; }
  const cand = document.getElementById('unidadeEscala')
    || document.getElementById('unidade')
    || document.getElementById('unidadeId')
    || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
  if(cand){
    els.unidade=cand;
    console.debug('[escala][unidade][resolver] elemento encontrado tardiamente');
  try { (typeof instalarObserverUnidade==='function'? instalarObserverUnidade : (window && window.instalarObserverUnidade))?.(); } catch(_e){}
  try { (typeof iniciarObserverUnidade==='function' ? iniciarObserverUnidade : (window && window.iniciarObserverUnidade))?.(); } catch(_e){}
    // Se jÃ¡ temos unidade no estado, aplica agora
    if(state.dadosGerais?.unidadeId){
      try { (typeof forceApplyUnidade==='function' ? forceApplyUnidade : (window && window.forceApplyUnidade))?.(); } catch(_e){}
      try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('resolver-loop'); } catch(_e){}
    }
    return true;
  }
  return false;
}
function iniciarLoopResolucaoUnidade(){
  if(window.__ESCALA_UNIDADE_LOOP__) return;
  let tentativas=0; const maxTent=25; // ~5s (intervalo 200ms)
  window.__ESCALA_UNIDADE_LOOP__ = setInterval(()=>{
    tentativas++;
    if(_loopResolveUnidadeElement() || tentativas>=maxTent){
      clearInterval(window.__ESCALA_UNIDADE_LOOP__);
      window.__ESCALA_UNIDADE_LOOP__=null;
      if(!els.unidade){ console.warn('[escala][unidade][resolver] nÃ£o encontrou select apÃ³s',tentativas,'tentativas'); }
      else {
        // Se encontrou mas segue sem options Ãºteis e jÃ¡ temos unidadeId em estado, tenta fallback extremo
        setTimeout(()=>{ try { extremeUnidadeFallback('resolver-loop'); } catch(_e){} }, 300);
      }
    }
  },200);
}
// Exposição global explícita para prevalecer sobre fallback leve definido mais adiante
try { if(typeof window !== 'undefined'){ window.iniciarLoopResolucaoUnidade = window.iniciarLoopResolucaoUnidade || iniciarLoopResolucaoUnidade; } } catch(_e){}
// Fallback extremo para injetar unidade quando tudo mais falhou
const normalizeId = (id) => {
  if(!id) return null;
  const s = String(id).trim();
  if(!s) return null;
  // Remove prefixos comuns como "ObjectId(" ou similares
  const clean = s.replace(/^ObjectId\(["']?/, '').replace(/["']?\)$/, '');
  // Se for um ObjectId MongoDB (24 hex), retorna como está
  if(/^[0-9a-fA-F]{24}$/.test(clean)) return clean;
  // Caso contrário, tenta extrair apenas dígitos ou retorna o original limpo
  const digits = clean.replace(/\D/g, '');
  return digits || clean;
};
try { if (typeof window !== 'undefined') { window.normalizeId = normalizeId; } } catch(_e){}
// Exposição segura no escopo global (para uso entre diferentes IIFEs)
try { if (typeof window !== 'undefined' && typeof window.normalizeId !== 'function') { window.normalizeId = normalizeId; } } catch(_e){}

async function extremeUnidadeFallback(reason){
  try {
    if(!els.unidade) return;
    const targetId = state.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
    const possuiValida = targetId && Array.from(els.unidade.options).some(o=> o.value===targetId);
    if(possuiValida && els.unidade.value===targetId) return;
    if(!state.escalaId && !targetId) return; // nada a fazer em nova escala sem unidade
    console.warn('[escala][unidade][extreme-fallback] acionado', reason, 'target=', targetId);
    if(!targetId && state.escalaId){
      try {
        const r = await fetch(basePath()+`/api/escalas/${encodeURIComponent(state.escalaId)}`, { credentials:'same-origin' });
  if(r.ok){ const js=await r.json(); const d=js&&js.data||{}; const ru = d.unidade_id||d.unidadeId||d.unidade|| (d.unidadeObj && (d.unidadeObj.id||d.unidadeObj._id)); const rn=d.unidade_nome||(d.unidadeObj&&(d.unidadeObj.nome||d.unidadeObj.descricao)); if(ru){ state.dadosGerais = state.dadosGerais||{}; const _norm=(typeof normalizeId==='function'? normalizeId : (typeof window!=='undefined' && typeof window.normalizeId==='function'? window.normalizeId : (v=>v))); state.dadosGerais.unidadeId=String(_norm(ru)); if(rn) state._unidadeNomeCarregada=rn; }
        }
      } catch(_refetch){ /* silencioso */ }
    }
    const finalId = state.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
    if(!finalId){ console.warn('[escala][unidade][extreme-fallback] ainda sem unidadeId apÃ³s refetch'); return; }
    let opt = Array.from(els.unidade.options).find(o=> o.value===finalId);
    if(!opt){
      opt=document.createElement('option');
      opt.value=finalId;
      opt.textContent=(state._unidadeNomeCarregada||'Unidade')+' *';
      opt.dataset.injetado='1';
      els.unidade.appendChild(opt);
    }
    els.unidade.value=finalId;
    els.unidade.dispatchEvent(new Event('change'));
    console.warn('[escala][unidade][extreme-fallback] aplicado id=', finalId);
  } catch(err){ console.warn('[escala][unidade][extreme-fallback] erro', err); }
}
// FunÃ§Ã£o de diagnÃ³stico manual
window.debugEscalaUnidade = function(){
  try {
    const sel = els.unidade || document.getElementById('unidadeEscala') || document.getElementById('unidade');
    const info = {
      escalaId: state.escalaId,
      unidadeIdState: state.dadosGerais?.unidadeId || null,
      selectEncontrado: !!sel,
      selectId: sel && sel.id,
      selectOptions: sel? Array.from(sel.options).map(o=>({v:o.value, txt:o.textContent, disabled:o.disabled})):[],
      appliedValue: sel && sel.value,
      tentativasFetch: (window.__ESCALA_DIAG__?.phases||[]).filter(p=>/unidades/i.test(p.tag)),
      possuiOptionInjetada: sel? !!sel.querySelector('option[data-injetado]'):false
    };
    console.log('[debugEscalaUnidade]', info);
    return info;
  } catch(e){ console.warn('debugEscalaUnidade erro', e); }
};
// Observer definitivo serÃ¡ definido mais abaixo (versÃ£o estÃ¡vel)
// Desbloqueia quaisquer inputs em um modal (remove bloqueios visuais e atributos)
function desbloquearCamposDeModal(modalEl){
  try {
    if(!modalEl) return;
    // Garante que o contÃªiner do modal receba eventos
    try { modalEl.style.pointerEvents='auto'; } catch(_pe){}
    // Injeta CSS de reforÃ§o uma Ãºnica vez
    if(!document.getElementById('escalaModalUnlockStyle')){
      const st=document.createElement('style');
      st.id='escalaModalUnlockStyle';
      st.textContent = '.modal *{pointer-events:auto !important;} .modal input, .modal textarea, .modal select{user-select:text !important;}';
      document.head.appendChild(st);
    }
    const sel = 'input, textarea, select, button';
    modalEl.querySelectorAll(sel).forEach(el=>{
      try {
        const precisaTrocar = el.hasAttribute('data-escala-locked') || (el.classList && el.classList.contains('escala-field-locked'));
        if(precisaTrocar && (el.matches('input,textarea,select'))){
          const clone = el.cloneNode(true);
          // preserva valor/estado
          try {
            if('value' in clone) clone.value = el.value;
            if('checked' in clone) clone.checked = el.checked;
            if('selectionStart' in clone) { clone.selectionStart = el.selectionStart; clone.selectionEnd = el.selectionEnd; }
          } catch(_pres){ }
          // limpa travas
          clone.removeAttribute('disabled'); clone.disabled=false;
          clone.removeAttribute('readonly'); clone.readOnly=false;
          clone.style.pointerEvents='';
          clone.classList && clone.classList.remove('escala-field-locked');
          clone.removeAttribute('data-escala-locked');
          if(clone.tabIndex < 0) clone.tabIndex = 0;
          el.replaceWith(clone);
          return; // prÃ³ximo elemento
        }
        // caso geral: apenas remover atributos/bloqueios
        el.removeAttribute('disabled'); el.disabled=false;
        el.removeAttribute('readonly'); el.readOnly=false;
        el.style.pointerEvents='';
        el.classList && el.classList.remove('escala-field-locked');
        el.removeAttribute('data-escala-locked');
        if(el.tabIndex < 0) el.tabIndex = 0;
      } catch(_e){}
    });
    // Remove pointer-events e classes de bloqueio de ancestrais dentro do modal
    modalEl.querySelectorAll('*').forEach(node=>{
      try {
        if(node.classList && node.classList.contains('escala-field-locked')) node.classList.remove('escala-field-locked');
        if(node.hasAttribute && node.hasAttribute('data-escala-locked')) node.removeAttribute('data-escala-locked');
        const st = (node.style && node.style.pointerEvents)||''; if(st && st.toLowerCase()==='none'){ node.style.pointerEvents='auto'; }
      } catch(_x){}
    });
  } catch(err){ console.debug('[escala][modal] desbloqueio genÃ©rico falhou', err); }
}
// Garante desbloqueio quando qualquer modal Bootstrap for exibido
try {
  document.addEventListener('shown.bs.modal', (ev)=>{
    const modalEl = ev && ev.target; if(!modalEl) return;
    desbloquearCamposDeModal(modalEl);
    // Impede que handlers globais em captura bloqueiem digitaÃ§Ã£o dentro do modal
    const stop = (e)=>{ e.stopPropagation(); };
    try {
      // use fase de bubble para nÃ£o impedir os handlers do prÃ³prio alvo
      modalEl.addEventListener('keydown', stop, false);
      modalEl.addEventListener('beforeinput', stop, false);
      modalEl.addEventListener('input', stop, false);
      modalEl.addEventListener('click', stop, false);
    } catch(_ev2){}
  }, true);
} catch(_evt){ /* ignora se Bootstrap nÃ£o estiver disponÃ­vel ainda */ }
// OBSERVADOR INICIAL (stub reintroduzido)
// Antes existia uma chamada a iniciarObserverUnidade() que foi removida no refactor e gerava ReferenceError
// Essa funÃ§Ã£o leve garante tentativa proativa de aplicar a unidade assim que opÃ§Ãµes forem adicionadas
function instalarObserverUnidade(){
  try {
    if(!els.unidade) return;
    if(els.unidade.__obsInit__) return; // evita mÃºltiplos
    const obs = new MutationObserver(()=>{
      if(state.dadosGerais?.unidadeId){
        try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('init-observer'); } catch(_e){}
      }
    });
    obs.observe(els.unidade,{ childList:true });
    els.unidade.__obsInit__ = obs;
  } catch(err){
    console.warn('[escala][unidade][iniciarObserverUnidade] erro', err);
  }
}
try { if(typeof window!=='undefined' && typeof window.instalarObserverUnidade!=='function'){ window.instalarObserverUnidade = instalarObserverUnidade; } } catch(_e){}

// Stub seguro: inicializa observadores e listeners do select de unidade, caso ainda não existam
function iniciarObserverUnidade(){
  try {
    if(!els || !els.unidade){
      // tentativa de localizar o select tardiamente
      const cand = document.getElementById('unidadeEscala')
        || document.getElementById('unidade')
        || document.getElementById('unidadeId')
        || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
      if(cand) els.unidade = cand;
    }
    if(!els.unidade) return;
    // Garante observer de opções
    if(!els.unidade.__obsInit2__){
      const obs2 = new MutationObserver(()=>{
  try { if(state && state.dadosGerais && state.dadosGerais.unidadeId){ (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('iniciar-observer'); } } catch(_e){}
      });
      obs2.observe(els.unidade, { childList:true });
      els.unidade.__obsInit2__ = obs2;
    }
    // Garante binding de change para sincronizar estado
    if(!els.unidade.__changeBind__){
      els.unidade.addEventListener('change', ()=>{
        try { state.dadosGerais = state.dadosGerais || {}; state.dadosGerais.unidadeId = String(els.unidade.value||''); } catch(_e){}
      }, { passive:true });
      els.unidade.__changeBind__ = true;
    }
  } catch(err){ console.warn('[escala][unidade][iniciarObserverUnidade] erro', err); }
}
// Exposição global para outros blocos
try { if(typeof window!=='undefined' && typeof window.iniciarObserverUnidade!=='function'){ window.iniciarObserverUnidade = iniciarObserverUnidade; } } catch(_e){}
async function fetchAndPopulateUnidades(opts){
  // Idempotência e deduplicação: reutiliza chamada em voo e evita repopular quando já ok
  try { window.__UNIDADES_FETCH_STATE__ = window.__UNIDADES_FETCH_STATE__ || { inFlight:false, lastStart:0, lastDone:0, promise:null }; } catch(_s){}
  const __STATE = window.__UNIDADES_FETCH_STATE__ || { inFlight:false };
  const nowTs = Date.now();
  const force = !!(opts && opts.force);
  // Re-resolve o select
  try {
    // Sempre resolva o select atual visível/conectado ao DOM para evitar atualizar um nó antigo
    const resolveSel = ()=> document.getElementById('unidadeEscala')
      || document.getElementById('unidade')
      || document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]');
    let sel = resolveSel();
    if(sel && sel.isConnected){ els.unidade = sel; }
    else if(els.unidade && !els.unidade.isConnected){ els.unidade = sel || els.unidade; }
    else if(!els.unidade){ els.unidade = sel; }
  } catch(_e){}
  if(!els.unidade || !els.unidade.isConnected) return;
  // Curto-circuitos
  try {
    const ready = !!(els.unidade.__unidadesPopulated === true || els.unidade.getAttribute('data-unidades-populated')==='1' || (els.unidade.options && els.unidade.options.length>1 && !els.unidade.querySelector('option[disabled]')));
    if(ready && !force) return;
    if(__STATE.inFlight && __STATE.promise) return __STATE.promise;
    if(!force && __STATE.lastStart && (nowTs - __STATE.lastStart) < 250) return __STATE.promise || undefined;
  } catch(_rdy){}
  console.debug('[escala][unidades] fetchAndPopulateUnidades() disparada');
  __diag && __diag('fetch-unidades-start');
  __STATE.inFlight = true; __STATE.lastStart = nowTs;
  __STATE.promise = (async () => {
    try {
      // Nova edição: apenas garantir visual
      if(window.__ESCALA_UNIDADE_SINGLE__ && state?.dadosGerais?.unidadeId){
        try { ensureUnidadeFinal('fetch-skip-single'); } catch(_e){}
        try { updateUnidadeMirror && updateUnidadeMirror(); } catch(_m){}
        __diag && __diag('fetch-unidades-skip-single');
        return;
      }
      if(els.unidade.options.length>1 && !els.unidade.querySelector('option[disabled]')){
        els.unidade.__unidadesPopulated = true; els.unidade.setAttribute('data-unidades-populated','1');
        return;
      }
  // Reconfirme o select antes de modificar o innerHTML
  try { if(!els.unidade || !els.unidade.isConnected){ const s2=document.getElementById('unidadeEscala')||document.getElementById('unidade')||document.querySelector('select[name="unidadeId"],select[name="unidade_id"],select[name="unidade"],select[data-field="unidade"]'); if(s2) els.unidade=s2; } } catch(_rs){}
  els.unidade.innerHTML = '<option value="">Carregando...</option>';
      const attempted=[]; const base=basePath();
      const candidates=[ base+"/api/unidades-relacionadas", base+"/api/unidades", "/api/unidades-relacionadas", "/api/unidades" ];
      if(!candidates.includes('/escalas/api/unidades-relacionadas')) candidates.push('/escalas/api/unidades-relacionadas');
      if(!candidates.includes('/escalas/api/unidades')) candidates.push('/escalas/api/unidades');
      async function tryFetch(url){
        attempted.push(url);
        try {
          const r=await fetch(url,{credentials:'same-origin'});
          if(r.status===401) return {ok:false,status:401};
          if(r.status===404) return {ok:false,status:404};
          if(!r.ok) return {ok:false,status:r.status};
          const txt = await r.text();
          let j=null; try { j=JSON.parse(txt); } catch(_jsonErr){ return {ok:false,status:'not-json'}; }
          return {ok:true,data:j};
        } catch(e){ return {ok:false,status:'net'}; }
      }
      let chosen=null; for(const url of candidates){ const res=await tryFetch(url); console.debug('[escala][unidades] tentativa', url, res.ok?'OK':res.status); if(res.ok){ chosen=res; break; } }
      if(!chosen){
        console.warn('[escala][unidades] falha em todas URLs');
        els.unidade.innerHTML='<option value="" disabled>(erro ao carregar)</option>';
        adicionarBotaoRecarregarUnidades();
        __diag && __diag('fetch-unidades-fail');
        return;
      }
      // Normalização de payload
      let raw;
      if(Array.isArray(chosen.data)) raw = chosen.data; else raw = chosen.data && (chosen.data.data||chosen.data.unidades||chosen.data.items||chosen.data.lista||chosen.data.result||[]);
      if(!raw && chosen.data && typeof chosen.data==='object' && 'data' in chosen.data && chosen.data.data===undefined){ raw=[]; }
      let lista = Array.isArray(raw)? raw:[];
      window.__ESCALA_UNIDADES_DEBUG = window.__ESCALA_UNIDADES_DEBUG || { tentativas: [] };
      window.__ESCALA_UNIDADES_DEBUG.tentativas.push({ ts: Date.now(), tentativaURLs: attempted.slice(), escolhida: (attempted[attempted.length-1])||null, totalRecebido: Array.isArray(lista)? lista.length : 0, brutoKeys: chosen.data ? Object.keys(chosen.data).slice(0,20): [] });
      if(!lista.length && chosen.data && typeof chosen.data==='object'){
        for(const k of Object.keys(chosen.data)){
          const v=chosen.data[k];
          if(Array.isArray(v) && v.length && typeof v[0]==='object' && (v[0].id||v[0]._id||v[0].codigo||v[0].codigo_unidade)){ lista = v; break; }
        }
      }
      lista = lista.map(u=>({ id: (typeof normalizeId==='function'? normalizeId : (typeof window!=='undefined' && typeof window.normalizeId==='function'? window.normalizeId : (v=>v)))(u.id||u._id||u.unidade_id||u.codigo||u.codigo_unidade), codigo: u.codigo||u.codigo_unidade||u.sigla||'', nome: u.nome||u.descricao||u.titulo||(u.codigo?'Unidade '+u.codigo:'(sem nome)'), is_principal: !!(u.is_principal||u.matriz||u.principal) })).filter(u=>u.id);
      if(!lista.length){
        console.warn('[escala][unidades] lista vazia após parse');
        els.unidade.innerHTML='<option value="" disabled>(sem unidades)</option>';
        adicionarBotaoRecarregarUnidades();
        if(state.dadosGerais?.unidadeId){ forceApplyUnidade(); }
        __diag && __diag('fetch-unidades-empty');
        return;
      }
      const uidSel = state?.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
      const placeholderSelected = uidSel ? '' : ' selected';
      els.unidade.innerHTML = '<option value=""'+placeholderSelected+'>Selecione...</option>' + lista.map(u=>{
        const val = String(u.id);
        const sel = (uidSel && val===uidSel) ? ' selected' : '';
        return `<option value="${val}"${sel}>${u.codigo? u.codigo+' - ':''}${u.nome}${u.is_principal?' (Matriz)':''}</option>`;
      }).join('');
  try { els.unidade.__unidadesPopulated = true; els.unidade.setAttribute('data-unidades-populated','1'); } catch(_mark){}
      try {
        if(!uidSel && lista.length===1){
          const only = String(lista[0].id);
          els.unidade.value = only;
          state.dadosGerais = state.dadosGerais || {}; state.dadosGerais.unidadeId = only;
          els.unidade.dispatchEvent(new Event('change'));
        }
      } catch(_one){}
      state._unidadesCarregadas = lista;
      try {
        const uidKnown = state?.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
        if(uidKnown && !state._unidadeNomeCarregada){
          const ach = Array.isArray(lista)? lista.find(u=> String(u.id)===uidKnown) : null;
          if(ach){ state._unidadeNomeCarregada = (ach.codigo? ach.codigo+' - ' : '') + (ach.nome||'Unidade'); }
        }
      } catch(_nameDerive){}
      try {
        if(!window.__ESCALA_UNIDS_OVERLAY__){
          const ov=document.createElement('div');
          ov.id='escalaUnidsOverlay';
          ov.style.cssText='position:fixed;bottom:4px;right:4px;z-index:99999;background:rgba(0,0,0,.7);color:#fff;font:11px/1.2 monospace;padding:4px 6px;border-radius:4px;max-width:300px;';
          ov.innerHTML='<strong>UNIDADES</strong> <span id="escUnCt">0</span> <button id="escUnClose" style="background:none;border:0;color:#ff8080;cursor:pointer;font-weight:bold;">x</button><br><span id="escUnMsg"></span>';
          document.body.appendChild(ov);
          document.getElementById('escUnClose').onclick=()=> ov.remove();
          window.__ESCALA_UNIDS_OVERLAY__=ov;
        }
        const upd=()=>{
          const ct=els.unidade? els.unidade.options.length:0;
          const spanCt=document.getElementById('escUnCt'); if(spanCt) spanCt.textContent=String(ct);
          const msg=document.getElementById('escUnMsg'); if(msg) msg.textContent='value='+ (els.unidade&&els.unidade.value? els.unidade.value:'(vazio)');
        };
        upd(); setTimeout(upd,200); setTimeout(upd,800); setTimeout(upd,2000);
        if(!els.unidade.__obsRemove__){
          const obs=new MutationObserver(()=>{
            const ct=els.unidade.options.length;
            if(ct===0 && state._unidadesCarregadas && state._unidadesCarregadas.length){
              const uid = state?.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
              const phSel = uid ? '' : ' selected';
              els.unidade.innerHTML='<option value=""'+phSel+'>Selecione...</option>' + state._unidadesCarregadas.map(u=>{
                const val = String(u.id);
                const sel = (uid && val===uid) ? ' selected' : '';
                return `<option value="${val}"${sel}>${u.codigo? u.codigo+' - ':''}${u.nome}${u.is_principal?' (Matriz)':''}</option>`;
              }).join('');
              try { ensureUnidadeFinal('reinjection'); } catch(_e){}
              upd();
            }
          });
          obs.observe(els.unidade,{childList:true});
          els.unidade.__obsRemove__=obs;
        }
      } catch(_dbg){}
      if(state.dadosGerais.unidadeId){
        ensureUnidadeFinal('fetch-populate');
        try { (typeof iniciarEnforcerUnidade==='function' ? iniciarEnforcerUnidade : (window && window.iniciarEnforcerUnidade))?.(2500); } catch(_e){}
        __diag && __diag('unidade-autoselect', state.dadosGerais.unidadeId);
        setTimeout(()=>{ try { ensureUnidadeFinal('fetch-populate+200ms'); } catch(_e){} }, 200);
        setTimeout(()=>{ try { ensureUnidadeFinal('fetch-populate+600ms'); } catch(_e){} }, 600);
        setTimeout(()=>{ try { ensureUnidadeFinal('fetch-populate+1200ms'); } catch(_e){} }, 1200);
        if(state.created){ setTimeout(()=>{ try { aplicarUnidadeComoOpcaoUnica('post-fetch'); } catch(_e){} }, 80); }
      }
    } catch(err){
      console.warn('[escala][unidades] erro inesperado', err);
      try { els.unidade.innerHTML='<option value="" disabled>(erro)</option>'; } catch(_h){}
    } finally {
      __diag && __diag('fetch-unidades-done');
      __STATE.inFlight=false; __STATE.lastDone = Date.now();
    }
  })();
  return __STATE.promise;
}
try { if (typeof window !== 'undefined') { window.fetchAndPopulateUnidades = fetchAndPopulateUnidades; } } catch(_e){}
try { if(typeof window!=='undefined' && typeof window.fetchAndPopulateUnidades!=='function'){ window.fetchAndPopulateUnidades = fetchAndPopulateUnidades; } } catch(_e){}
// Retry tardio (stub) â€“ havia referÃªncia a ensureUnidadeSelectRetry inexistente
function ensureUnidadeSelectRetry(){
  try {
    // Se apÃ³s o carregamento inicial ainda nÃ£o aplicou, forÃ§a novamente
    if(state.dadosGerais?.unidadeId){
  try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('late-retry'); } catch(_e){}
    }
    // Em algumas condiÃ§Ãµes as unidades ainda nÃ£o foram buscadas â€“ forÃ§a fetch se necessÃ¡rio
    if(els.unidade && (!els.unidade.options || els.unidade.options.length<=1)){
  try { (typeof fetchAndPopulateUnidades==='function'? fetchAndPopulateUnidades : (window && window.fetchAndPopulateUnidades))?.(); } catch(_e){}
    }
    try { iniciarGuardaGlobalUnidade && iniciarGuardaGlobalUnidade(); } catch(_g){}
  } catch(e){ console.warn('[escala][unidade][ensureUnidadeSelectRetry] erro', e); }
}

// Permite definir a unidade manualmente via console quando lista nÃ£o carrega
window.setUnidadeManual = function(id, nome){
  try {
    if(!id){ console.warn('ForneÃ§a um id'); return; }
    if(!els.unidade){ console.warn('Select de unidade nÃ£o encontrado'); return; }
    if(!state.dadosGerais) state.dadosGerais={};
    state.dadosGerais.unidadeId=String(id);
    if(nome){ state._unidadeNomeCarregada = nome; }
    // Injeta / substitui option
    let opt=[...els.unidade.options].find(o=> o.value===String(id));
    if(!opt){ opt=document.createElement('option'); opt.value=String(id); opt.dataset.injetado='1'; opt.textContent=(nome||'Unidade')+' *'; els.unidade.appendChild(opt); }
    els.unidade.value=String(id);
    els.unidade.dispatchEvent(new Event('change'));
    console.log('[setUnidadeManual] aplicado', id, nome||'');
  } catch(e){ console.error('setUnidadeManual erro', e); }
};
function adicionarBotaoRecarregarUnidades(){
  try {
    if(document.getElementById('btnReloadUnidades')) return;
    const wrap = els.unidade?.parentElement; if(!wrap) return;
    const btn=document.createElement('button');
    btn.type='button'; btn.id='btnReloadUnidades'; btn.className='btn btn-sm btn-outline-secondary mt-1';
    btn.textContent='Recarregar Unidades';
  btn.onclick=()=>{ els.unidade.innerHTML='<option value="" disabled>Carregando...</option>'; setTimeout(()=>{ try { (typeof fetchAndPopulateUnidades==='function'? fetchAndPopulateUnidades : (window && window.fetchAndPopulateUnidades))?.(); } catch(_e){} }, 30); };
    wrap.appendChild(btn);
  } catch(e){ console.warn('[escala][unidades][reload-btn] erro', e); }
}
// ForÃ§a aplicaÃ§Ã£o direta da unidade (injeta option se necessÃ¡rio)
function forceApplyUnidade(){
  if(!els.unidade) return;
  const uid = state.dadosGerais?.unidadeId || state._pendingUnidadeId; if(!uid) return;
  const val=String(uid);
  let opt=[...els.unidade.options].find(o=>o.value===val);
  if(!opt){
    opt=document.createElement('option');
    opt.value=val; opt.textContent=(state._unidadeNomeCarregada||'Unidade')+' *'; opt.dataset.injetado='1';
    els.unidade.appendChild(opt);
  }
  const jaAplicada = els.unidade.value===val && els.unidade.classList.contains('value-applied');
  els.unidade.value=val;
  els.unidade.classList.add('value-applied');
  try { state.dadosGerais = state.dadosGerais || {}; state.dadosGerais.unidadeId = val; } catch(_s){}
  try { if(typeof updateUnidadeMirror==='function'){ updateUnidadeMirror(); } else if(window && typeof window.updateUnidadeMirror==='function'){ window.updateUnidadeMirror(); } } catch(_m){}
  if(!jaAplicada){ els.unidade.dispatchEvent(new Event('change')); }
  console.debug('[escala][unidade][force] aplicada', val);
}
// Exposição global para evitar ReferenceError em outros blocos
try { if (typeof window !== 'undefined' && typeof window.forceApplyUnidade !== 'function') { window.forceApplyUnidade = forceApplyUnidade; } } catch(_e){}
// Evita ReferenceError caso carregarEscalaExistente ainda não esteja definida neste ponto do carregamento
try {
  if (typeof carregarEscalaExistente === 'function') {
    window.carregarEscalaExistente = carregarEscalaExistente;
  } else {
    // cria um shim que tenta novamente depois que o core terminar de carregar
    if (typeof window.carregarEscalaExistente !== 'function') {
      window.carregarEscalaExistente = function shimCarregarEscalaExistente(id){
        try {
          if (typeof carregarEscalaExistente === 'function') return carregarEscalaExistente(id);
          if (typeof window.__deferredCalls === 'undefined') window.__deferredCalls = [];
          window.__deferredCalls.push({ fn: 'carregarEscalaExistente', args: [id] });
          console.warn('[escala][shim] carregarEscalaExistente indisponível no early-boot; chamada será reprocessada após core');
        } catch(_s) { /* noop */ }
      };
    }
  }
} catch(_e) { /* noop */ }
  // Removido suporte a endpoint individual de update de equipe (PUT /equipes/:id) â€“ somente PUT escala completo
  // === FunÃ§Ã£o global (interna) para abrir modal de efetivo da equipe ===
  function openEquipeEfetivoModal(eq){
    if(!eq) return;
    try { state.__indispCache = state.__indispCache || new Map(); } catch(_ci){}
    const modalEl = document.getElementById('modalEfetivoEquipe');
    if(!modalEl){ console.warn('[equipes][efetivo] modalEfetivoEquipe ausente'); return; }
    // Reset defensivo: se estiver trocando de equipe, evite reaproveitar lista da abertura anterior
    try {
      const prevId = modalEl.__lastEqId || null;
      const newId = eq && (eq.id||eq._id) ? String(eq.id||eq._id) : '';
      if(prevId && newId && String(prevId) !== String(newId)){
        // Limpamos a lista anterior para garantir que não "vaze" funcionário da sessão anterior
        delete modalEl.__editingList;
      }
      modalEl.__lastEqId = newId || null;
    } catch(_rst){}
    // Se id ausente, tenta resolver por nome no estado
    try {
      if(!eq.id){
        const st = (window.__ESCALA_STATE__||state||{});
        const lista = Array.isArray(st.equipes)? st.equipes : (Array.isArray(state?.equipes)? state.equipes : []);
        const nome = (eq.nome||'').trim().toUpperCase();
        if(nome){ const ach = lista.find(e=> String((e.nome||'')).trim().toUpperCase()===nome); if(ach) eq.id = ach.id; }
      }
    } catch(_rid){}
  try { modalEl.dataset.eqId = String(eq.id||''); modalEl.dataset.eqNome = (eq.nome||''); } catch(_ds){}
    try { modalEl.__eqRef = eq; } catch(_r){}
    // Guarda último contexto para fallbacks futuros
    try { window.__LAST_EQ_FOR_EFETIVO__ = { id: eq.id, nome: eq.nome, componentes: Array.isArray(eq.componentes)? eq.componentes.slice(): [] }; } catch(_ctx){}
    // Desbloqueio imediato ao abrir
    try { desbloquearCamposDeModal(modalEl); } catch(_u){}
  const spanNome = modalEl.querySelector('#efetivoEquipeNome'); if(spanNome) spanNome.textContent = eq.nome || '';
  // Ao abrir modal: priorizar lista pré-carregada (se disponível), senão usar componentes da equipe;
  // se estiver vazio, o modal aparece vazio; se vier preenchido, clonar para edição local.
  let editingList = [];
  try {
    if(Array.isArray(modalEl.__efList) && modalEl.__efList.length){
      // Preferir a lista recém obtida do servidor via aba de Equipes
      editingList = modalEl.__efList.map(c=> ({ ...c }));
      // após consumir, limpar para não reutilizar sem intenção
      delete modalEl.__efList;
    } else if(Array.isArray(eq.componentes) && eq.componentes.length){
      editingList = eq.componentes.map(c => ({ ...c }));
    }
  } catch(_seed){}
  // Fallback em edição: se a lista vier vazia mas houver id/nome, tenta resolver a equipe completa a partir do estado global
  try {
    if((!editingList || editingList.length===0) && (eq.id || eq.nome)){
      let eqFull = null;
      try {
        const st = (window.__ESCALA_STATE__ || state || {});
        const lista = Array.isArray(st.equipes) ? st.equipes : (Array.isArray(state?.equipes) ? state.equipes : []);
        if(eq.id){ eqFull = lista.find(e=> String(e.id)===String(eq.id)); }
        if(!eqFull && eq.nome){
          const alvo = String(eq.nome||'').trim().toUpperCase();
          eqFull = lista.find(e=> String(e.nome||'').trim().toUpperCase()===alvo);
        }
      } catch(_resEq){}
      if(eqFull && Array.isArray(eqFull.componentes) && eqFull.componentes.length){
        editingList = eqFull.componentes.map(c=> ({ ...c }));
        // também reflita no objeto passado e no dataset para futuras aberturas
        try { eq.componentes = editingList.slice(); } catch(_copy){}
      }
    }
  } catch(_editFill){}
    try { modalEl.__editingList = editingList; } catch(_ml){}
  // Chave estÃ¡vel para deduplicaÃ§Ã£o entre origens (busca por cÃ³digo, modal WDG, carga do servidor)
  const compKey = (c)=> String((c&& (c.funcionario_id||c.id||c.matricula||c.codigo))||'').trim().toUpperCase();
  const funcKey = (f, fallbackCod)=> String((f && (f.id||f._id||f.funcionario_id||f.codigo||f.cpf)) || fallbackCod || '').trim().toUpperCase();
    // Cache de disponibilidade calculada (por id de componente)
    const cacheDisp = {};
  // Cache de resolução de IDs (codigo/CPF -> funcionarioId real)
  const idResolveCache = new Map();
    // UtilitÃ¡rio: converte ISO string -> Date (00:00)
    function dISO(v){ return new Date(v+'T00:00:00'); }
    // Gera lista de dias (ISO) inclusive
    function diasBetween(iniISO,fimISO){ const out=[]; let d=dISO(iniISO); const end=dISO(fimISO); while(d<=end){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1);} return out; }
    // Subtrai intervalos indisponÃ­veis de um intervalo principal (day-level)
    function subtrairIndisponibilidades(intervalo, indis){
      // intervalo: {ini,fim}; indis: Array<{ini,fim}>
      if(!intervalo.ini||!intervalo.fim) return [];
      let livres=[{ini:intervalo.ini, fim:intervalo.fim}];
      (indis||[]).forEach(b=>{
        const nova=[];
        livres.forEach(seg=>{
          if(b.fim < seg.ini || b.ini > seg.fim){ nova.push(seg); return; }
          // Segmento se sobrepÃµe: cortar possÃ­veis partes livres
          if(b.ini>seg.ini){ nova.push({ini:seg.ini, fim:diaAnterior(b.ini)}); }
          if(b.fim<seg.fim){ nova.push({ini:diaSeguinte(b.fim), fim:seg.fim}); }
        });
        livres = nova.filter(s=> s.ini<=s.fim);
      });
      return compactarSequencias(livres);
    }
    function diaAnterior(iso){ const d=dISO(iso); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10);}    
    function diaSeguinte(iso){ const d=dISO(iso); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10);}    
    function compactarSequencias(list){ if(!list.length) return []; list.sort((a,b)=> a.ini.localeCompare(b.ini)); const out=[list[0]]; for(let i=1;i<list.length;i++){ const cur=list[i]; const last=out[out.length-1]; const dPrev=diaSeguinte(last.fim); if(dPrev===cur.ini){ last.fim=cur.fim; } else { out.push(cur); } } return out; }
    function syncPeriodoFromInputs(){
      try {
        if(state.periodo?.ini && state.periodo?.fim) return;
        const di = els.dataInicio && els.dataInicio.value && els.dataInicio.value.trim();
        const df = els.dataFim && els.dataFim.value && els.dataFim.value.trim();
        const isoIni = dateBrToISO(di||'');
        const isoFim = dateBrToISO(df||'');
        if(isoIni && isoFim){ state.periodo.ini=isoIni; state.periodo.fim=isoFim; }
      } catch(_p){}
    }
    syncPeriodoFromInputs();
    async function ensurePeriodoFromServer(){
      try {
        if(state.periodo?.ini && state.periodo?.fim) return true;
        const id = state.escalaId || ensureEscalaId();
        if(!id) return false;
        const urls=[ basePath()+`/api/escalas/${encodeURIComponent(id)}`, `/api/escalas/${encodeURIComponent(id)}` ];
        for(const u of urls){
          try {
            const r = await fetch(u, { credentials:'same-origin' });
            if(!r.ok) continue;
            const j = await r.json();
            const d = j && (j.data||j.escala||j);
            if(d){
              const p = d.periodo || d.periodoEscala || {};
              const ini = p.ini || p.inicio || d.periodoIni || d.inicio || d.data_inicio || d.dataInicio || d.inicioISO || d.periodoIniISO || '';
              const fim = p.fim || p.termino || d.periodoFim || d.fim || d.data_fim || d.dataFim || d.fimISO || d.periodoFimISO || '';
              const i = dateBrToISO(ini)|| (String(ini).match(/^\d{4}-\d{2}-\d{2}/)? String(ini).slice(0,10):'');
              const f = dateBrToISO(fim)|| (String(fim).match(/^\d{4}-\d{2}-\d{2}/)? String(fim).slice(0,10):'');
              if(i && f){ state.periodo.ini=i; state.periodo.fim=f; return true; }
            }
          } catch(_fetch){ }
        }
      } catch(_ep){}
      return false;
    }
    // Resolve o identificador real do funcionário para os endpoints de ausências/férias
    async function resolveFuncionarioId(comp){
      try {
        if(!comp) return null;
        // Se já temos um id plausível (ObjectId 24 hex ou UUID-like genérico), reutiliza
        const cand = comp.funcionario_id || comp.id;
        const looksHex24 = cand && /^[0-9a-fA-F]{24}$/.test(String(cand));
        if(cand && looksHex24){ return String(cand); }
        // Cache por chave estável
        const k = (comp.matricula||comp.codigo||comp.cpf||comp.id||'').toString().trim().toUpperCase();
        if(k && idResolveCache.has(k)) return idResolveCache.get(k);
        // Tenta por CPF primeiro (se válido)
        const cpfDig = (comp.cpf||'').replace(/\D/g,'');
        const codigo = comp.codigo || comp.matricula || '';
        async function buscaLista(url){ try { const r=await fetch(url,{credentials:'same-origin'}); if(!r.ok) return null; const j=await r.json(); return Array.isArray(j.data)? j.data: null; } catch(_){ return null; } }
        let foundId = null;
        const base = basePath();
        if(cpfDig && cpfDig.length===11){
          let lista = await buscaLista(base+`/api/funcionarios-responsaveis?cpf=${encodeURIComponent(cpfDig)}`);
          if(!lista || !lista.length) lista = await buscaLista(`/api/funcionarios-responsaveis?cpf=${encodeURIComponent(cpfDig)}`);
          if(Array.isArray(lista) && lista.length){
            const m = lista.find(x=> String((x.cpf||'').replace(/\D/g,'')).endsWith(cpfDig));
            foundId = m && (m.id||m._id) || null;
          }
        }
        if(!foundId && codigo){
          let lista2 = await buscaLista(base+`/api/funcionarios-responsaveis?codigo=${encodeURIComponent(codigo)}`);
          if(!lista2 || !lista2.length) lista2 = await buscaLista(`/api/funcionarios-responsaveis?codigo=${encodeURIComponent(codigo)}`);
          if(Array.isArray(lista2) && lista2.length){
            const m2 = lista2.find(x=> String(x.codigo||'').toUpperCase()===String(codigo).toUpperCase()) || lista2[0];
            foundId = m2 && (m2.id||m2._id) || null;
          }
        }
        if(!foundId && codigo){
          try { const r=await fetch(base+`/api/funcionarios/busca-codigo?codigo=${encodeURIComponent(codigo)}`, { credentials:'same-origin' }); if(r.ok){ const j=await r.json(); if(j&&j.data&& (j.data.id||j.data._id)) foundId = j.data.id||j.data._id; } } catch(_){ }
          if(!foundId){ try { const r2=await fetch(`/api/funcionarios/busca-codigo?codigo=${encodeURIComponent(codigo)}`, { credentials:'same-origin' }); if(r2.ok){ const j2=await r2.json(); if(j2&&j2.data&&(j2.data.id||j2.data._id)) foundId = j2.data.id||j2.data._id; } } catch(_e2){} }
        }
        if(foundId){
          comp.id = String(foundId);
          comp.funcionario_id = String(foundId);
          try {
            // Também atualiza a lista editável no modal, se presente
            const ef = document.getElementById('modalEfetivoEquipe');
            const list = ef && Array.isArray(ef.__editingList)? ef.__editingList: null;
            if(list){
              for(let i=0;i<list.length;i++){
                const it = list[i];
                const match = String(it.funcionario_id||it.id||it.codigo||it.matricula||'').toUpperCase() === String(comp.funcionario_id||comp.id||comp.codigo||comp.matricula||'').toUpperCase();
                if(match){ list[i] = Object.assign({}, it, { id:String(foundId), funcionario_id:String(foundId) }); break; }
              }
            }
          } catch(_sync){}
          if(k) idResolveCache.set(k, String(foundId));
          return String(foundId);
        }
        return cand? String(cand): null;
      } catch(_e){ return null; }
    }
    async function buscarIndisponibilidades(funcId){
      const ini=state.periodo.ini, fim=state.periodo.fim; if(!ini||!fim) return {ausencias:[], ferias:[]};
      // Cache global por funcionÃ¡rio e intervalo
      try {
        try { state.__indispCache = state.__indispCache || new Map(); } catch(_ci){}
        const cacheKey = funcId+'|'+ini+'|'+fim;
        const cached = state.__indispCache && state.__indispCache.get ? state.__indispCache.get(cacheKey) : null;
        const now = Date.now();
        const TTL = 5 * 60 * 1000; // 5 minutos
        if(cached && (now - cached.ts) < TTL){
          return { ausencias: cached.ausencias, ferias: cached.ferias };
        }
        // Para evitar corrida de mÃºltiplas requisiÃ§Ãµes simultÃ¢neas, marca placeholder
        if(cached && cached.pending){
          // Espera a promise finalizar
          return await cached.pending;
        }
      } catch(_e){ /* ignora falha de cache */ }
      try {
        const cacheKey = funcId+'|'+ini+'|'+fim;
        const pendingPromise = (async ()=>{
          // 1) AusÃªncias: endpoint correto exige funcionarioId + inicio + fim
          let ausencias=[];
          try {
            const urlAus = basePath()+`/api/ausencias?funcionarioId=${encodeURIComponent(funcId)}&inicio=${ini}&fim=${fim}`;
            let rAus = await fetch(urlAus,{credentials:'same-origin'});
            if(!rAus.ok && (rAus.status===404||rAus.status===405)){
              try { rAus = await fetch(`/api/ausencias?funcionarioId=${encodeURIComponent(funcId)}&inicio=${ini}&fim=${fim}`, { credentials:'same-origin' }); } catch(_ra){}
            }
            if(rAus.ok){ const j=await rAus.json(); ausencias = Array.isArray(j.data)? j.data : (j.ausencias||[]); }
          } catch(_e){ /* ignora */ }
          // 2) FÃ©rias: endpoint lista por ano. Determinar anos cobertos pelo intervalo
          let ferias=[];
            const anoIni = parseInt(ini.slice(0,4),10);
            const anoFim = parseInt(fim.slice(0,4),10);
            const anos=[]; for(let a=anoIni; a<=anoFim; a++) anos.push(a);
            for(const a of anos){
              try {
                const urlFer = basePath()+`/api/ferias?funcionarioId=${encodeURIComponent(funcId)}&ano=${a}`;
                let rFer = await fetch(urlFer,{credentials:'same-origin'});
                if(!rFer.ok && (rFer.status===404||rFer.status===405)){
                  try { rFer = await fetch(`/api/ferias?funcionarioId=${encodeURIComponent(funcId)}&ano=${a}`, { credentials:'same-origin' }); } catch(_rf){}
                }
                if(rFer.ok){ const j=await rFer.json(); const lista = Array.isArray(j.data)? j.data : (j.ferias||[]); ferias.push(...lista); }
              } catch(_e){ /* ignora ano */ }
            }
          function normAus(list){
            if(!Array.isArray(list)) return [];
            return list.map(x=>({ ini:(x.inicioISO||x.inicio||x.ini||'').slice(0,10), fim:(x.fimISO||x.fim||x.fimISO||'').slice(0,10) }))
              .filter(x=> x.ini && x.fim && x.ini<=x.fim && !(x.fim < ini || x.ini > fim));
          }
          function normFer(list){
            if(!Array.isArray(list)) return [];
            return list.map(x=>({ ini:(x.inicioISO||x.inicio||x.ini||'').slice(0,10), fim:(x.fimISO||x.fim||x.fimISO||'').slice(0,10) }))
              .filter(x=> x.ini && x.fim && x.ini<=x.fim && !(x.fim < ini || x.ini > fim));
          }
          const result = { ausencias: normAus(ausencias), ferias: normFer(ferias) };
          try { state.__indispCache = state.__indispCache || new Map(); state.__indispCache.set(cacheKey, { ts: Date.now(), ...result }); } catch(_cs){}
          return result;
        })();
        try { state.__indispCache = state.__indispCache || new Map(); state.__indispCache.set(cacheKey, { ts: Date.now(), pending: pendingPromise, ausencias:[], ferias:[] }); } catch(_cs2){}
        return await pendingPromise;
      } catch(err){ console.debug('[equipes][efetivo] indisponibilidades fallback vazio', err?.message||err); return {ausencias:[], ferias:[]}; }
    }
    async function calcularDisponibilidadeComponente(c){
      console.log('[efetivo][calc] iniciar cálculo para', c.matricula || c.nome || c.id);
      // Resolve id real do funcionário antes de buscar indisponibilidades
      let fid = (c && (c.funcionario_id || c.id)) || null;
      const looksHex24 = fid && /^[0-9a-fA-F]{24}$/.test(String(fid));
      if(!fid || !looksHex24){
        console.log('[efetivo][calc] resolvendo id para', c.matricula || c.nome || c.id);
        const rid = await resolveFuncionarioId(c);
        if(rid) fid = rid; // substitui por id resolvido
        console.log('[efetivo][calc] id resolvido:', fid);
      }
      if(!fid){ console.log('[efetivo][calc] sem id, retornando vazio'); return { livres: [], indis: [] }; }
      if(cacheDisp[fid]) return cacheDisp[fid];
      const total={ ini: state.periodo.ini, fim: state.periodo.fim };
      console.log('[efetivo][calc] período:', total);
      const { ausencias, ferias } = await buscarIndisponibilidades(fid);
      const indis = [...ausencias, ...ferias];
      const livres = subtrairIndisponibilidades(total, indis);
      cacheDisp[fid] = { livres, indis };
      console.log('[efetivo][calc] resultado:', livres.length ? 'disponível' : 'indisponível');
      return cacheDisp[fid];
    }
  async function atualizarPeriodosDisponiveis(){
      if(window.__EF_LOGS__){ console.log('[efetivo][atualizar] iniciar atualização'); }
      syncPeriodoFromInputs();
      if(!state.periodo.ini || !state.periodo.fim){
        // tentar carregar período do servidor uma única vez
        if(!modalEl.__periodoTried){
          modalEl.__periodoTried=true;
          try {
            const ok=await ensurePeriodoFromServer();
            if(ok){ /* período definido: seguir adiante */ }
          } catch(_try){}
        }
        // se ainda não temos período, informa e sai; caso contrário, continua
        if(!state.periodo.ini || !state.periodo.fim){
          const rows = tbodyEfetivo.querySelectorAll('tr[data-idx]');
          rows.forEach(tr=>{ const cell=tr.children[1]; if(cell) cell.innerHTML='<span class="text-muted small">Defina período na aba Dados Gerais</span>'; });
          return;
        }
      }
      // Garante que usamos a lista atual do modal
      try { if(Array.isArray(modalEl.__editingList)) editingList = modalEl.__editingList; } catch(_sl){}
      const rows = tbodyEfetivo.querySelectorAll('tr[data-idx]');
      await Promise.all(Array.from(rows).map(async tr=>{
        const idx=parseInt(tr.getAttribute('data-idx'),10); if(isNaN(idx)) return;
        const baseList = Array.isArray(modalEl.__editingList)? modalEl.__editingList : editingList;
        const comp=baseList[idx];
        const cellPeriodo = tr.children[1]; if(!cellPeriodo) return;
        if(!comp){ return; }
        // Se ainda não tem id, ou id não parece válido, resolver e calcular para esta linha
        const cand = comp.funcionario_id || comp.id || null;
        const badId = !(cand && /^[0-9a-fA-F]{24}$/.test(String(cand)));
        if(!cand || badId){
          cellPeriodo.innerHTML = '<span class="text-muted small">(resolvendo...)</span>';
          try {
            const rid = await resolveFuncionarioId(comp);
            if(!rid){ cellPeriodo.innerHTML = '<span class="text-muted small">(sem id)</span>'; return; }
          } catch(_res){}
        }
        cellPeriodo.innerHTML = '<span class="text-muted small">(calculando...)</span>';
        try {
          const info = await calcularDisponibilidadeComponente(comp);
          if(!info.livres.length){
            comp.__periodoHtml = '<span class="text-danger fw-semibold small">Indisponível</span>';
            cellPeriodo.innerHTML = comp.__periodoHtml;
            tr.dataset.disponivel='0';
          } else {
            const lbl = info.livres.map(r=> dateISOToBr(r.ini)+' à '+dateISOToBr(r.fim)).join('<br>');
            comp.__periodoHtml = '<span class="small">'+lbl+'</span>';
            cellPeriodo.innerHTML = comp.__periodoHtml;
            tr.dataset.disponivel='1';
          }
        } catch(_calc){
          cellPeriodo.innerHTML = '<span class="text-muted small">(erro ao calcular)</span>';
          tr.dataset.disponivel='';
        }
      }));
    }
    const tbodyEfetivo = modalEl.querySelector('#tabelaEfetivoEquipe tbody');
    if(!tbodyEfetivo){ console.warn('[equipes][efetivo] tbody nÃ£o encontrado'); return; }
    // Expor utilitários externos (recalc e render)
  try { modalEl.__efRecalc = atualizarPeriodosDisponiveis; modalEl.__efCalcComp = calcularDisponibilidadeComponente; window.__efCalcCompGlobal = calcularDisponibilidadeComponente; } catch(_expose){}
    function renderEfetivoTabela(){
      // Dedup defensivo por chave normalizada
      try {
        // Sincroniza com a lista atual do modal
        if(Array.isArray(modalEl.__editingList)) editingList = modalEl.__editingList;
        const seen = new Set();
        editingList = editingList.filter(c=>{ const k = compKey(c); if(!k) return false; if(seen.has(k)) return false; seen.add(k); return true; });
      } catch(_ded){}
      if(!editingList.length){ tbodyEfetivo.innerHTML=''; return; }
      // Captura células já calculadas para preservar na re-renderização
      let prevCellsByKey = new Map();
      try {
        const prevList = Array.isArray(modalEl.__editingListPrev)? modalEl.__editingListPrev : editingList.slice();
        const rowsPrev = tbodyEfetivo.querySelectorAll('tr[data-idx]');
        rowsPrev.forEach((tr,i)=>{
          const compPrev = prevList[i];
          if(!compPrev) return;
          const key = compKey(compPrev);
          if(!key) return;
          const cell = tr.children && tr.children[1];
          if(cell){ prevCellsByKey.set(key, cell.innerHTML); }
        });
      } catch(_cap){}
      tbodyEfetivo.innerHTML = editingList.map((c,i)=>{
        const ident=(c.matricula||c.codigo||c.id||'') + (c.nome? ' - '+c.nome : '');
        let periodoStr = c.__periodoHtml || '<span class="text-muted small">(calcular)</span>';
        try {
          if(!c.__periodoHtml && Array.isArray(c.disponibilidade) && c.disponibilidade.length){
            const fmt = (s)=> String(s||'').slice(0,10);
            const linhas = c.disponibilidade.map(r=>{ const i=(r.ini||r.inicio||''); const f=(r.fim||r.termino||''); if(!i||!f) return null; return dateISOToBr(fmt(i))+' à '+dateISOToBr(fmt(f)); }).filter(Boolean);
            if(linhas.length){ periodoStr = '<span class="small">'+linhas.join('<br>')+'</span>'; c.__periodoHtml = periodoStr; }
          }
        } catch(_pre){ }
        return `<tr data-idx="${i}">`+
          `<td class="align-middle small">${ident}</td>`+
          `<td class="align-middle small">${periodoStr}</td>`+
          `<td class="align-middle text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="rem-comp" onclick="try{ window.__EF_removerFromRow && window.__EF_removerFromRow(this); }catch(e){}">Remover</button></td>`+
        `</tr>`; }).join('');
      // Restaura células previamente calculadas
      try {
        editingList.forEach((c,i)=>{
          const key = compKey(c);
          const prev = key && prevCellsByKey.get(key);
          if(prev){
            const tr = tbodyEfetivo.querySelector(`tr[data-idx="${i}"]`);
            const cell = tr && tr.children && tr.children[1];
            if(cell){ cell.innerHTML = prev; }
          }
        });
      } catch(_rest){}
      // Após render inicial, dispara cálculo assíncrono com reforços de timing
      try { atualizarPeriodosDisponiveis(); } catch(_a){}
      try { setTimeout(()=>{ try { atualizarPeriodosDisponiveis(); } catch(_b){} }, 0); } catch(_t1){}
      try { setTimeout(()=>{ try { atualizarPeriodosDisponiveis(); } catch(_c){} }, 50); } catch(_t2){}
      // Inicia watchdog para garantir que nenhuma linha permaneça em (calcular)
      try { startEfetivoRecalcWatchdog(); } catch(_wd){}
      // Guarda lista para próxima preservação
      try { modalEl.__editingListPrev = editingList.slice(); } catch(_s){}
    }
    renderEfetivoTabela();
    try { modalEl.__editingList = editingList; modalEl.__efRender = renderEfetivoTabela; } catch(_ml2){}
    // Observa inserções/remoções de linhas para recalcular períodos automaticamente
    try {
      if(!modalEl.__efMo){
        const debounced = (()=>{ let t; return ()=>{ clearTimeout(t); t=setTimeout(()=>{ try{ atualizarPeriodosDisponiveis(); }catch(_r){} }, 10); }; })();
        const mo = new MutationObserver(()=> debounced());
        mo.observe(tbodyEfetivo, { childList: true });
        modalEl.__efMo = mo;
        // Limpeza ao fechar o modal
        modalEl.addEventListener('hidden.bs.modal', ()=>{ try { modalEl.__efMo && modalEl.__efMo.disconnect && modalEl.__efMo.disconnect(); delete modalEl.__efMo; } catch(_){} }, { once:true });
      }
    } catch(_mo){}
    // Recalcular quando eventos globais indicarem alteração de lista (ex: inserção via modal de pesquisa)
    try {
      const onListMod = ()=>{ try { atualizarPeriodosDisponiveis(); } catch(_e){} };
      if(!modalEl.__efListEvt){
        window.addEventListener('escala:efetivo:lista-modificada', onListMod);
        window.addEventListener('escala:efetivoSelecionado', onListMod);
        window.addEventListener('escala:efetivoSelecionadoMultiplo', onListMod);
        modalEl.__efListEvt = onListMod;
        modalEl.addEventListener('hidden.bs.modal', ()=>{ try { window.removeEventListener('escala:efetivo:lista-modificada', onListMod); window.removeEventListener('escala:efetivoSelecionado', onListMod); window.removeEventListener('escala:efetivoSelecionadoMultiplo', onListMod); delete modalEl.__efListEvt; } catch(_){} }, { once:true });
      }
    } catch(_evb){}
    // Watchdog de recálculo: tenta repetidamente enquanto houver linhas pendentes
    function startEfetivoRecalcWatchdog(){
      try {
        if(modalEl.__efWD){ return; }
        let tentativas = 0;
        const maxTent = 25; // ~5s (200ms * 25)
        const iv = setInterval(()=>{
          try {
            tentativas++;
            const rows = Array.from(tbodyEfetivo.querySelectorAll('tr[data-idx]'));
            const pendentes = rows.filter(tr=>{
              const cell = tr.children && tr.children[1];
              if(!cell) return false;
              const txt = (cell.textContent||'').toLowerCase();
              const marcado = tr.dataset && ('disponivel' in tr.dataset);
              return (!marcado) && (txt.includes('(calcular)') || txt.includes('(calculando') || txt.trim()==='');
            });
            if(window.__EF_LOGS__){ try { console.debug('[efetivo][wd]', { tentativas, pendentes: pendentes.length }); } catch(_){} }
            if(pendentes.length===0){ clearInterval(iv); modalEl.__efWD=null; return; }
            try { atualizarPeriodosDisponiveis(); } catch(_r){}
            if(tentativas>=maxTent){ clearInterval(iv); modalEl.__efWD=null; }
          } catch(_tick){ clearInterval(iv); modalEl.__efWD=null; }
        }, 200);
        modalEl.__efWD = iv;
        // Limpeza ao fechar
        modalEl.addEventListener('hidden.bs.modal', ()=>{ try { if(modalEl.__efWD){ clearInterval(modalEl.__efWD); modalEl.__efWD=null; } } catch(_){} }, { once:true });
      } catch(_e){}
    }
    // recalcula se usuário mudar o período enquanto o modal estiver aberto
    try {
      const onChangePeriodo = ()=> setTimeout(()=>{ atualizarPeriodosDisponiveis(); }, 10);
      els.dataInicio && els.dataInicio.addEventListener('change', onChangePeriodo, { passive:true });
      els.dataFim && els.dataFim.addEventListener('change', onChangePeriodo, { passive:true });
      modalEl.addEventListener('hidden.bs.modal', ()=>{
        try {
          els.dataInicio && els.dataInicio.removeEventListener('change', onChangePeriodo, { passive:true });
          els.dataFim && els.dataFim.removeEventListener('change', onChangePeriodo, { passive:true });
        } catch(_rem){}
      }, { once:true });
    } catch(_lst){}
    tbodyEfetivo.onclick = ev=>{
      const btnRem = ev.target.closest('button[data-act="rem-comp"]'); if(!btnRem) return;
      const tr=btnRem.closest('tr'); const idx=parseInt(tr.getAttribute('data-idx'),10); if(!isNaN(idx)){ editingList.splice(idx,1); renderEfetivoTabela(); }
      // NÃ£o persiste agora; somente no botÃ£o Salvar do modal
    };
    const inputCodigo = modalEl.querySelector('#efetivoCodigo');
    const btnAdicionar = modalEl.querySelector('#btnAdicionarEfetivo');
  const btnSalvarEfetivo = modalEl.querySelector('#btnSalvarEfetivoEquipe');
    const btnBuscar = modalEl.querySelector('#btnBuscarFuncionario');
    // bind helpers para evitar mÃºltiplos handlers acumulados a cada abertura do modal
    function bindClickOnce(el, handler){ if(!el) return; try { if(el._clickHandler) el.removeEventListener('click', el._clickHandler); } catch(_){} el._clickHandler = handler; el.addEventListener('click', handler); }
    function bindKeydownOnce(el, handler){ if(!el) return; try { if(el._kdHandler) el.removeEventListener('keydown', el._kdHandler); } catch(_){} el._kdHandler = handler; el.addEventListener('keydown', handler); }
    let _addingBusy = false;
    async function adicionarPorCodigo(){
      if(_addingBusy) return;
      if(!inputCodigo) return; // sem input, não prossegue e não bloqueia cliques futuros
      const cod=inputCodigo.value.trim();
      if(!cod){
        // nada informado: põe foco e sai, sem setar busy para não travar o botão
        try { inputCodigo.focus(); } catch(_f){}
        return;
      }
      _addingBusy = true; // marca busy apenas após validar que há código a consultar
      try {
        btnAdicionar?.setAttribute('disabled','disabled');
        btnBuscar?.setAttribute('disabled','disabled');
        async function buscarFuncionario(){
          // Estratégia:
          // 1) Se CPF (11 dígitos): tentar funcionarios-responsaveis (prefixo /escalas, depois raiz)
          // 2) Se numérico não-CPF: tentar funcionarios-responsaveis?codigo= (prefixo /escalas, depois raiz)
          // 3) Por último, tenta busca-codigo (legado) em /escalas e /api
          const digits = cod.replace(/\D/g,'');
          async function buscaLista(url){ try { const r=await fetch(url, { credentials:'same-origin' }); if(!r.ok) return null; const j=await r.json(); const arr=Array.isArray(j.data)? j.data:[]; return arr; } catch(_){ return null; } }
          // 1/2) funcionarios-responsaveis
          const qs = (digits.length===11) ? ('cpf='+encodeURIComponent(digits)) : ('codigo='+encodeURIComponent(cod));
          let lista = await buscaLista(basePath()+ '/api/funcionarios-responsaveis?'+qs);
          if(!lista || !lista.length) lista = await buscaLista('/api/funcionarios-responsaveis?'+qs);
          if(Array.isArray(lista) && lista.length){
            let f = null;
            if(digits.length===11){ f = lista.find(x=> String((x.cpf||'').replace(/\D/g,'')).endsWith(digits)); }
            if(!f){ f = lista.find(x=> String(x.codigo||'').toUpperCase()===cod.toUpperCase()); }
            if(!f){ f = lista[0]; }
            return { id:f.id, nome:f.nome, codigo:f.codigo, cpf:f.cpf };
          }
          // 3) busca-codigo legado
          try { const r = await fetch(basePath()+ '/api/funcionarios/busca-codigo?codigo='+encodeURIComponent(cod), { credentials:'same-origin' }); if(r.ok){ const j=await r.json(); if(j && j.data) return j.data; } } catch(_e){}
          try { const r2 = await fetch('/api/funcionarios/busca-codigo?codigo='+encodeURIComponent(cod), { credentials:'same-origin' }); if(r2.ok){ const j2=await r2.json(); if(j2 && j2.data) return j2.data; } } catch(_e2){}
          return null;
        }
        const f = await buscarFuncionario();
        if(!f){ alert('Funcionário não encontrado.'); return; }
        const key = funcKey(f, cod);
        if(!key){ alert('FuncionÃ¡rio invÃ¡lido.'); return; }
        if(editingList.some(c=> compKey(c)===key)){
          // jÃ¡ existe â€” ignora silenciosamente para evitar alerta duplicado causado por handlers mÃºltiplos ou duplo clique
          return;
        }
        editingList.push({ id: f.id||f._id||key, funcionario_id: f.id||f._id||null, matricula:f.codigo||f.cpf||cod, nome:f.nome });
        inputCodigo.value=''; renderEfetivoTabela();
  // NÃ£o persiste agora; apenas em Salvar
      } catch(err){ console.error('[equipes][efetivo] erro adicionar', err); alert('Erro ao buscar funcionÃ¡rio.'); }
      finally { btnAdicionar?.removeAttribute('disabled'); btnBuscar?.removeAttribute('disabled'); _addingBusy=false; }
    }
    if(inputCodigo){ bindKeydownOnce(inputCodigo, e=>{ if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); adicionarPorCodigo(); }}); }
    // Botão Adicionar: prioriza abrir o modal de pesquisa de efetivo
    function abrirPesquisaEfetivo(){
      try {
        if(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function'){
          window.WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect: function(sel){ try { if(Array.isArray(sel)) sel=sel[0]; if(sel && window.__efAdicionarSelecionadoEfetivo) window.__efAdicionarSelecionadoEfetivo(sel); } catch(_e){} } });
          return;
        }
        const mp=document.getElementById('modalPesquisarEfetivo');
        if(mp && window.bootstrap && window.bootstrap.Modal){
          try {
            const openModals = Array.from(document.querySelectorAll('.modal.show')).filter(m=> m!==mp);
            if(openModals.length){ mp.style.zIndex = 1065; const backs=document.querySelectorAll('.modal-backdrop'); if(backs.length){ backs[backs.length-1].style.zIndex=1060; } }
            if(mp.getAttribute('aria-hidden')==='true') mp.removeAttribute('aria-hidden');
          } catch(_s){}
          window.bootstrap.Modal.getOrCreateInstance(mp).show();
          return;
        }
        // Fallback: adicionar por código/CPF
        adicionarPorCodigo();
      } catch(_e){}
    }
  // Botão Adicionar agora usa data-bs-toggle no EJS para abrir o modal de pesquisa
    if(btnBuscar){ bindClickOnce(btnBuscar, (ev)=>{ adicionarPorCodigo(); try { ev.stopPropagation(); } catch(_){ } }); }
  if(btnSalvarEfetivo){
    try { btnSalvarEfetivo.dataset.enriched = '1'; } catch(_ds){}
    btnSalvarEfetivo.onclick=async ()=>{
      // Resolve id de forma agressiva antes de tentar salvar
      if(!state.escalaId){ try { ensureEscalaId(); } catch(_e){} }
      if(!state.escalaId){
        try {
          const qid = (typeof obterQueryId==='function') ? obterQueryId() : null;
          const wid = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId) ? window.__ESCALA_STATE__.escalaId : null;
          const hidEl = document.querySelector('#escalaId,[name="escalaId"]');
          const hid = hidEl && (hidEl.value || hidEl.getAttribute('value'));
          state.escalaId = qid || wid || hid || state.escalaId;
        } catch(_idr){}
      }
      // Atualiza lista local com período e disponibilidade calculada por funcionário
      async function diasDisponiveisFromIntervalos(livres){
        try {
          if(!Array.isArray(livres) || !livres.length) return [];
          const out=[];
          for(const r of livres){
            const i=(r.ini||r.inicio||'').slice(0,10); const f=(r.fim||'').slice(0,10);
            if(!i||!f) continue;
            const d0=new Date(i+'T00:00:00'); const d1=new Date(f+'T00:00:00');
            for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)){
              out.push(d.toISOString().slice(0,10));
            }
          }
          return Array.from(new Set(out));
        } catch(_){ return []; }
      }
      const infos = await Promise.all((editingList||[]).map(c=>
        Promise.resolve(calcularDisponibilidadeComponente(c)).catch(()=>({ livres:[], indis:[] }))
      ));
      eq.componentes = await Promise.all((editingList||[]).map(async (c, idx)=>{
        const info = infos[idx] || { livres:[], indis:[] };
        const dias = await diasDisponiveisFromIntervalos(info.livres);
        return {
          id: c.id,
          funcionario_id: c.funcionario_id||c.id,
          nome: c.nome,
          matricula: c.matricula,
          periodo: { ini: state.periodo.ini || null, fim: state.periodo.fim || null },
          periodoIni: state.periodo.ini || null,
          periodoFim: state.periodo.fim || null,
          disponibilidade: Array.isArray(info.livres)? info.livres.map(r=>({ ini:(r.ini||r.inicio||'').slice(0,10), fim:(r.fim||'').slice(0,10) })) : [],
          indisponibilidades: Array.isArray(info.indis)? info.indis.map(r=>({ ini:(r.ini||r.inicio||'').slice(0,10), fim:(r.fim||'').slice(0,10), tipo:r.tipo||null })) : [],
          diasDisponiveis: dias
        };
      }));
  // PersistÃªncia robusta: inclui no campo componentes da equipe e salva na escala
      if(!state.escalaId){ alert('Salve os Dados Gerais para criar a escala antes de salvar a equipe.'); return; }
      const equipesPayload = state.equipes.map(e=>{
        const isTarget = (e===eq) || (String(e.id)===String(eq.id)) || (!eq.id && String((e.nome||'')).toUpperCase()===String((eq.nome||'')).toUpperCase());
        return { id:e.id, nome:e.nome, descricao:e.descricao, componentes: isTarget ? ((eq.componentes)|| (e.componentes)||[]) : ((e.componentes)||[]) };
      });
      async function tryPut(body){
        // prefixo
        try {
          let r = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) });
          if(r.ok) return r; const t1=await r.text().catch(()=> ''); console.warn('[equipes][PUT-prefix] falhou', r.status, t1);
        } catch(e){ console.warn('[equipes][PUT-prefix] erro', e); }
        // raiz
        try {
          let r2 = await fetch(`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) });
          if(r2.ok) return r2; const t2=await r2.text().catch(()=> ''); console.warn('[equipes][PUT-root] falhou', r2.status, t2);
        } catch(e2){ console.warn('[equipes][PUT-root] erro', e2); }
        return { ok:false, status:-1 };
      }
      // SequÃªncia de tentativas
      let ok=false;
      let r = await tryPut({ equipes: equipesPayload });
      if(r && r.ok) ok=true; else {
        r = await tryPut({ equipesOverwrite:true, equipes: equipesPayload });
        if(r && r.ok) ok=true;
      }
      if(!ok){
        alert('Falha ao salvar componentes da equipe no servidor.');
        return;
      }
      // ConfirmaÃ§Ã£o: garante no documento do backend
      try {
        let g = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { credentials:'same-origin' });
        if(!g.ok) g = await fetch(`/api/escalas/${state.escalaId}`, { credentials:'same-origin' });
        if(g.ok){
          const js = await g.json().catch(()=>null);
          let d = js && (js.data||js.escala||js);
          let lista = Array.isArray(d?.equipes)? d.equipes : (Array.isArray(d?.lista_equipes)? d.lista_equipes : (Array.isArray(d?.equipes_turnos)? d.equipes_turnos: []));
          // procura equipe por id ou nome
          const alvoNome = (eq.nome||'').toUpperCase();
          const alvoId = eq.id;
          let dest = lista.find(x=> (x.id===alvoId) || ((x.nome||'').toUpperCase()===alvoNome));
          const compDesejados = eq.componentes||[];
          const presentes = Array.isArray(dest?.componentes)? dest.componentes.length: 0;
          if(!dest || presentes < compDesejados.length){
            const novaLista = (lista && lista.length? lista: equipesPayload).map(e=>{
              if((e.id===alvoId) || ((e.nome||'').toUpperCase()===alvoNome)){
                return { id:e.id||alvoId, nome:e.nome||eq.nome, descricao:e.descricao||eq.descricao||'', componentes: compDesejados };
              }
              return e;
            });
            const rFix = await tryPut({ equipesOverwrite:true, equipes: novaLista });
            if(!rFix || !rFix.ok){ console.warn('[equipes][confirm-fix] overwrite falhou'); }
          }
        }
      } catch(_conf){ console.warn('[equipes][confirmacao] erro', _conf); }
      // Atualiza UI e fecha modal
  renderEquipes();
  try { if(typeof avaliarProgressaoAbas==='function') avaliarProgressaoAbas(); } catch(_e){}
      try { document.dispatchEvent(new CustomEvent('escala:equipes-alteradas', { detail:{ tipo:'update', equipeId:eq.id, equipes: state.equipes.slice() } })); } catch(_e){}
      try { (document.activeElement && document.activeElement.blur && document.activeElement.blur()); } catch(_f){}
      const inst = bootstrap.Modal.getOrCreateInstance(modalEl); inst.hide();
      renderMatrizesPorGrupo();
      avaliarProgressaoAbas();
  // Recarrega do servidor para refletir a verdade final (ids/mapeamentos)
  try { if(typeof carregarEscalaExistente==='function'){ try { carregarEscalaExistente(state.escalaId).catch(()=>{}); } catch(_call){} } } catch(_re){ }
  };
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
  // Fallback mínimo: abrir modalEfetivoEquipe e renderizar componentes sem cálculos
  function __openEfetivoFallback(eq){
    try {
      if(!eq) return;
      let modalEl = document.getElementById('modalEfetivoEquipe');
      if(!modalEl){
        // criar modal mínimo compatível se não existir
        modalEl = document.createElement('div');
        modalEl.id='modalEfetivoEquipe'; modalEl.className='modal fade';
        modalEl.innerHTML = '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">'
          +'<div class="modal-header py-2"><h5 class="modal-title" style="font-size:1rem;">Edição de Efetivo – Equipe <span id="efetivoEquipeNome" class="text-primary"></span></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>'
          +'<div class="modal-body pt-3 pb-2"><div class="table-responsive border rounded">'
          +'<table class="table table-sm mb-0 align-middle text-center" id="tabelaEfetivoEquipe">'
          +'<thead><tr><th class="text-center" style="width:40%;">Funcionário</th><th class="text-center" style="width:40%;">Período Disponível</th><th class="text-center" style="width:20%;">Ações</th></tr></thead>'
          +'<tbody></tbody></table></div></div>'
          +'<div class="modal-footer py-2"><button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" type="button">Fechar</button></div>'
          +'</div></div>';
        document.body.appendChild(modalEl);
      }
      // Se o modal EJS existe, evita popular com linhas de fallback; apenas mostra e deixa o binder completo cuidar
      const spanNome = modalEl.querySelector('#efetivoEquipeNome'); if(spanNome) spanNome.textContent = eq.nome || '';
      try { bootstrap.Modal.getOrCreateInstance(modalEl).show(); } catch(_b){}
      // Tenta acionar o binder completo assim que disponível
      try {
        let tent=0;
        const max=12; // ~1.2s
        const iv=setInterval(()=>{
          tent++;
          try {
            if(typeof window.openEquipeEfetivoModal==='function'){
              clearInterval(iv);
              window.openEquipeEfetivoModal(eq);
              return;
            }
          } catch(_c){}
          if(tent>=max) clearInterval(iv);
        },100);
      } catch(_re){ }
    } catch(_e){ console.warn('[equipes][efetivo][fallback] falhou abrir', _e); }
  }
  try { window.__openEfetivoFallback = __openEfetivoFallback; } catch(_ex){}
  try { window.openEquipeEfetivoModal = openEquipeEfetivoModal; } catch(_e){}
  // Abridor brutal do modal EJS de Efetivo: força abrir #modalEfetivoEquipe
  function __openEfetivoModalEJS(eq){
    try {
      // Delegar para a função completa que também faz os bindings dos botões
      if(typeof openEquipeEfetivoModal==='function'){
        openEquipeEfetivoModal(eq);
        return true;
      }
      return false;
    } catch(_e){ return false; }
  }
  try { window.__openEfetivoModalEJS = __openEfetivoModalEJS; } catch(_ex){}
  // Remoção por onclick inline (fallback brutal)
  try {
    if(typeof window.__EF_removerFromRow !== 'function'){
      window.__EF_removerFromRow = function(btn){
        try {
          const modal = btn.closest('#modalEfetivoEquipe'); if(!modal) return;
          const tr = btn.closest('tr[data-idx]'); if(!tr) return;
          const idx = parseInt(tr.getAttribute('data-idx'),10); if(isNaN(idx)) return;
          const list = Array.isArray(modal.__editingList)? modal.__editingList : (modal.__editingList=[]);
          list.splice(idx,1);
          const tbody = modal.querySelector('#tabelaEfetivoEquipe tbody'); if(!tbody) return;
          tbody.innerHTML = list.map((c,i)=>{
            const ident=(c.matricula||c.codigo||c.id||'') + (c.nome? ' - '+c.nome : '');
            return `<tr data-idx="${i}"><td class="align-middle small">${ident}</td><td class="align-middle small"><span class="text-muted small">(calcular)</span></td><td class="align-middle text-center"><button type=\"button\" class=\"btn btn-sm btn-outline-danger\" data-act=\"rem-comp\" onclick=\"try{ window.__EF_removerFromRow && window.__EF_removerFromRow(this); }catch(e){}\">Remover</button></td></tr>`;
          }).join('');
        } catch(_e){}
      }
    }
  } catch(_ef){}
  // Adicionar/Salvar por onclick inline (fallback brutal)
  try {
    if(typeof window.__EF_addFromInput !== 'function'){
      window.__EF_addFromInput = async function(){
        try {
          const modal = document.getElementById('modalEfetivoEquipe'); if(!modal) return;
          const input = modal.querySelector('#efetivoCodigo'); if(!input) return;
          const cod = (input.value||'').trim(); if(!cod) return;
          // usar o mesmo caminho do binder global
          const add = async ()=>{
            async function fetchOne(){
              try { const r=await fetch(basePath()+ '/api/funcionarios/busca-codigo?codigo='+encodeURIComponent(cod), { credentials:'same-origin' }); if(r.ok){ const j=await r.json(); if(j&&j.data) return j.data; } }catch(_e){}
              try { const r2=await fetch('/api/funcionarios/busca-codigo?codigo='+encodeURIComponent(cod), { credentials:'same-origin' }); if(r2.ok){ const j2=await r2.json(); if(j2&&j2.data) return j2.data; } }catch(_e2){}
              const digits = cod.replace(/\D/g,'');
              const qs = digits.length===11 ? ('cpf='+encodeURIComponent(digits)) : ('codigo='+encodeURIComponent(cod));
              async function buscaLista(url){ try { const r=await fetch(url,{credentials:'same-origin'}); if(!r.ok) return null; const j=await r.json(); return Array.isArray(j.data)? j.data:[]; } catch(_){ return null; } }
              let lista = await buscaLista(basePath()+ '/api/funcionarios-responsaveis?'+qs);
              if(!lista || !lista.length) lista = await buscaLista('/api/funcionarios-responsaveis?'+qs);
              if(Array.isArray(lista) && lista.length){
                let f = null;
                if(digits.length===11){ f = lista.find(x=> String((x.cpf||'').replace(/\D/g,'')).endsWith(digits)); }
                if(!f){ f = lista.find(x=> String(x.codigo||'').toUpperCase()===cod.toUpperCase()); }
                if(!f){ f = lista[0]; }
                return { id:f.id, nome:f.nome, codigo:f.codigo, cpf:f.cpf };
              }
              return null;
            }
            const f = await fetchOne();
            if(!f){ alert('Funcionário não encontrado.'); return; }
            const list = Array.isArray(modal.__editingList)? modal.__editingList : (modal.__editingList=[]);
            const key = String(f.id||f._id||f.funcionario_id||f.codigo||f.cpf||cod).toUpperCase();
            if(list.some(c=> String(c.funcionario_id||c.id||c.codigo||c.cpf).toUpperCase()===key)) return;
            list.push({ id: f.id||f._id||key, funcionario_id: f.id||f._id||null, matricula: f.codigo||f.cpf||cod, nome: f.nome||'' });
            modal.__editingList = list; input.value='';
            const tbody = modal.querySelector('#tabelaEfetivoEquipe tbody'); if(!tbody) return;
            tbody.innerHTML = list.map((c,i)=>{
              const ident=(c.matricula||c.codigo||c.id||'') + (c.nome? ' - '+c.nome : '');
              return `<tr data-idx="${i}"><td class="align-middle small">${ident}</td><td class="align-middle small"><span class="text-muted small">(calcular)</span></td><td class="align-middle text-center"><button type=\"button\" class=\"btn btn-sm btn-outline-danger\" data-act=\"rem-comp\">Remover</button></td></tr>`;
            }).join('');
          };
          await add();
        } catch(_e){}
      }
    }
  } catch(_ef2){}
  try {
    if(typeof window.__EF_save !== 'function'){
      window.__EF_save = async function(){
        try {
          const modal = document.getElementById('modalEfetivoEquipe'); if(!modal) return;
          // delega para o salvamento robusto do binder global se possível
          let eqId = modal.dataset.eqId || (window.__LAST_EQ_FOR_EFETIVO__ && window.__LAST_EQ_FOR_EFETIVO__.id) || null;
          if(!eqId){
            // Fallback: resolver por nome visível no modal
            try {
              const nomeEl = modal.querySelector('#efetivoEquipeNome');
              const nome = (nomeEl && nomeEl.textContent ? nomeEl.textContent : '').trim();
              if(nome){
                const st = (window.__ESCALA_STATE__||state||{});
                const lista = Array.isArray(st.equipes)? st.equipes : (Array.isArray(state?.equipes)? state.equipes : []);
                const ach = lista.find(e=> String((e.nome||'')).trim().toUpperCase()===nome.toUpperCase());
                if(ach){ eqId = ach.id; modal.dataset.eqId = String(eqId); window.__LAST_EQ_FOR_EFETIVO__ = ach; }
              }
            } catch(_nm){}
            // Fallback final: se houver apenas uma equipe no estado, assumir esta
            if(!eqId){
              try {
                const st2 = (window.__ESCALA_STATE__||state||{});
                if(Array.isArray(st2.equipes) && st2.equipes.length===1){ eqId = st2.equipes[0].id; modal.dataset.eqId = String(eqId); window.__LAST_EQ_FOR_EFETIVO__ = st2.equipes[0]; }
              } catch(_one){}
            }
          }
          if(!eqId){ alert('Equipe inválida.'); return; }
          if(!state.escalaId){ try { ensureEscalaId && ensureEscalaId(); } catch(_e){} }
          if(!state.escalaId){ try { const u=new URL(location.href); const q=u.searchParams.get('id'); if(q) state.escalaId=q; } catch(_e2){} }
          if(!state.escalaId){ alert('Salve os Dados Gerais antes de salvar.'); return; }
          // Garante inclusão de período nos componentes
          const baseList = Array.isArray(modal.__editingList)? modal.__editingList: [];
          const ini = (state && state.periodo && state.periodo.ini) || null;
          const fim = (state && state.periodo && state.periodo.fim) || null;
          // tenta usar calculadora exposta; se não houver, mantém caminho simples
          const calc = (modal.__efCalcComp || window.__efCalcCompGlobal || null);
          async function diasDoIntervalo(livres){
            try {
              if(!Array.isArray(livres) || !livres.length) return [];
              const out=[];
              for(const r of livres){
                const i=(r.ini||r.inicio||'').slice(0,10); const f=(r.fim||'').slice(0,10);
                if(!i||!f) continue;
                const d0=new Date(i+'T00:00:00'); const d1=new Date(f+'T00:00:00');
                for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)) out.push(d.toISOString().slice(0,10));
              }
              return Array.from(new Set(out));
            } catch(_){ return []; }
          }
          const infos = calc ? await Promise.all(baseList.map(c=> Promise.resolve(calc(c)).catch(()=>({ livres:[], indis:[] })))) : [];
          const lista = await Promise.all(baseList.map(async (c, idx)=>{
            const info = calc ? (infos[idx]||{livres:[], indis:[]}) : {livres:[], indis:[]};
            const dias = await diasDoIntervalo(info.livres);
            return {
              id: c.id,
              funcionario_id: c.funcionario_id || c.id,
              nome: c.nome,
              matricula: c.matricula || c.codigo || null,
              periodo: { ini: ini, fim: fim },
              periodoIni: ini,
              periodoFim: fim,
              disponibilidade: Array.isArray(info.livres)? info.livres.map(r=>({ ini:(r.ini||r.inicio||'').slice(0,10), fim:(r.fim||'').slice(0,10) })) : [],
              indisponibilidades: Array.isArray(info.indis)? info.indis.map(r=>({ ini:(r.ini||r.inicio||'').slice(0,10), fim:(r.fim||'').slice(0,10), tipo:r.tipo||null })) : [],
              diasDisponiveis: dias
            };
          }));
          const st = state || (window.__ESCALA_STATE__||{});
          const equipes = Array.isArray(st.equipes)? st.equipes: [];
          const idx = equipes.findIndex(e=> String(e.id)===String(eqId));
          if(idx>=0){ equipes[idx].componentes = lista.slice(); }
          async function put(body){
            try { const r=await fetch(basePath()+`/api/escalas/${st.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); if(r.ok) return r; } catch(_p){}
            try { const r2=await fetch(`/api/escalas/${st.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); if(r2.ok) return r2; } catch(_p2){}
            return { ok:false };
          }
          let ok=false;
          if((await put({ equipes: equipes })).ok) ok=true;
          else if((await put({ equipesOverwrite:true, equipes })).ok) ok=true;
          if(!ok){ alert('Falha ao salvar.'); return; }
          try { renderEquipes && renderEquipes(); renderMatrizesPorGrupo && renderMatrizesPorGrupo(); avaliarProgressaoAbas && avaliarProgressaoAbas(); } catch(_r){}
          try { const inst=bootstrap.Modal.getOrCreateInstance(modal); inst && inst.hide(); } catch(_b){}
        } catch(err){ console.warn('[efetivo][inline-save] erro', err); alert('Erro ao salvar.'); }
      }
    }
  } catch(_ef3){}
  // Backup: preenche o modal ao abrir via evento Bootstrap
  try {
    const mEl = document.getElementById('modalEfetivoEquipe');
    if(mEl && !mEl.__efetivoShowBound){
      mEl.__efetivoShowBound = true;
      mEl.addEventListener('show.bs.modal', function(){
        try {
          // Prioridade: dataset (eqId/eqNome) -> botão mais recente -> LAST (apenas fallback final)
          const st = (window.__ESCALA_STATE__||state||{});
          const lista = Array.isArray(st.equipes)? st.equipes : (Array.isArray(state?.equipes)? state.equipes : []);
          let eq = null;
          // 1) dataset.eqId
          const dsId = (mEl.dataset && mEl.dataset.eqId) ? String(mEl.dataset.eqId) : '';
          if(dsId){ eq = lista.find(e=> String(e.id)===dsId) || null; }
          // 2) dataset.eqNome
          if(!eq){
            const dsNome = (mEl.dataset && mEl.dataset.eqNome) ? String(mEl.dataset.eqNome).trim() : '';
            if(dsNome){
              const alvo = dsNome.toUpperCase();
              eq = lista.find(e=> String((e.nome||'')).trim().toUpperCase()===alvo) || null;
            }
          }
          // 3) último botão clicado
          if(!eq && window.__LAST_EQ_BTN_EQID__){
            const bid = String(window.__LAST_EQ_BTN_EQID__);
            eq = lista.find(e=> String(e.id)===bid) || null;
          }
          // 4) nome visível no título
          if(!eq){
            try {
              const nomeEl = mEl.querySelector('#efetivoEquipeNome');
              const nome = (nomeEl && nomeEl.textContent ? nomeEl.textContent : '').trim();
              if(nome){
                const alvo = nome.toUpperCase();
                eq = lista.find(e=> String((e.nome||'')).trim().toUpperCase()===alvo) || null;
              }
            } catch(_nm){}
          }
          // 5) fallback final: LAST
          if(!eq){ eq = window.__LAST_EQ_FOR_EFETIVO__ || null; }
          if(eq){
            try { mEl.dataset.eqId = String(eq.id||''); mEl.dataset.eqNome = (eq.nome||''); mEl.__eqRef = eq; window.__LAST_EQ_FOR_EFETIVO__ = eq; } catch(_ds){}
            if(typeof openEquipeEfetivoModal==='function') openEquipeEfetivoModal(eq); else __openEfetivoModalEJS(eq);
          }
          ensureEfetivoGlobalBinder();
        } catch(_e){}
      });
      // Reforço após exibição: se a tabela apresentar "Sem componentes" mas houver no estado, renderiza imediatamente
      mEl.addEventListener('shown.bs.modal', function(){
        try {
          const tbody = mEl.querySelector('#tabelaEfetivoEquipe tbody');
          if(!tbody) return;
          const txt = (tbody.textContent||'').trim().toLowerCase();
          const listaAtual = Array.isArray(mEl.__editingList)? mEl.__editingList : [];
          const precisa = (!listaAtual || !listaAtual.length) && (txt.includes('sem componentes') || txt==='');
          if(!precisa) return;
          // Resolver equipe pelo dataset/id/nome
          let eqId = mEl.dataset.eqId || window.__LAST_EQ_BTN_EQID__ || (window.__LAST_EQ_FOR_EFETIVO__ && window.__LAST_EQ_FOR_EFETIVO__.id) || '';
          let eqNome = mEl.dataset.eqNome || (mEl.querySelector('#efetivoEquipeNome')?.textContent||'');
          const st = (window.__ESCALA_STATE__||state||{});
          const listaEq = Array.isArray(st.equipes)? st.equipes : (Array.isArray(state?.equipes)? state.equipes : []);
          let eqFull = null;
          if(eqId){ eqFull = listaEq.find(e=> String(e.id)===String(eqId)); }
          if(!eqFull && eqNome){
            const alvo = String(eqNome).trim().toUpperCase();
            eqFull = listaEq.find(e=> String((e.nome||'')).trim().toUpperCase()===alvo);
          }
          if(eqFull && Array.isArray(eqFull.componentes) && eqFull.componentes.length){
            try { mEl.__editingList = eqFull.componentes.map(c=> ({...c})); } catch(_copy){}
            // Render simplificado (sem depender de closures internas) – preserva compatibilidade
            const rows = (mEl.__editingList||[]).map((c,i)=>{
              const ident=(c.matricula||c.codigo||c.id||'') + (c.nome? ' - '+c.nome : '');
              return `<tr data-idx="${i}"><td class="align-middle small">${ident}</td><td class="align-middle small"><span class="text-muted small">(calcular)</span></td><td class="align-middle text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="rem-comp">Remover</button></td></tr>`;
            }).join('');
            tbody.innerHTML = rows;
            try {
              // Dispara recálculo imediato usando utilitário exposto, se existir
              if(typeof mEl.__efRecalc==='function') mEl.__efRecalc();
              else if(typeof window.__efForceRefreshLista==='function') window.__efForceRefreshLista();
            } catch(_re){}
          }
        } catch(_shown){}
      });
    }
  } catch(_evt){}
  // Binder global brutal para os botões do modal de Efetivo (fallback de última linha)
  function ensureEfetivoGlobalBinder(){
    try {
      if(window.__EFETIVO_MODAL_BOUND__) return; window.__EFETIVO_MODAL_BOUND__=true;
      // Função global robusta para forçar refresh/recalcular a lista exibida no modal de Efetivo
      try {
        if(typeof window.__efForceRefreshLista !== 'function'){
          window.__efForceRefreshLista = function(){
            try {
              const ef = document.getElementById('modalEfetivoEquipe');
              if(!ef) return;
              // Fallback: se funções não estiverem expostas, reabre o modal com a mesma equipe para re-vincular e recalcular
              function reopenFallback(){
                try {
                  if(typeof window.openEquipeEfetivoModal==='function' && ef.__eqRef){
                    window.openEquipeEfetivoModal(ef.__eqRef);
                  }
                } catch(_rf){}
              }
              const doRefresh = ()=>{
                try {
                  // Prioriza recálculo sem re-render para não sobrescrever célula já calculada
                  if(typeof ef.__efRecalc==='function') ef.__efRecalc();
                  else if(typeof ef.__efRender==='function') ef.__efRender();
                  else reopenFallback();
                } catch(_r){}
              };
              // Executa duas vezes com pequeno atraso para cobrir alterações de DOM assíncronas
              doRefresh();
              setTimeout(doRefresh, 0);
              setTimeout(doRefresh, 50);
            } catch(_e){}
          }
        }
      } catch(_fr){}
      // Listener global: quando a lista do efetivo for alterada por qualquer fluxo, força refresh
      try {
        if(!window.__EF_LIST_EVENT_BOUND__){
          window.__EF_LIST_EVENT_BOUND__=true;
          window.addEventListener('escala:efetivo:lista-modificada', ()=>{ try { window.__efForceRefreshLista && window.__efForceRefreshLista(); } catch(_e){} });
        }
      } catch(_evb){}
      // Helper central para resolver eqId e gravar no dataset do modal
      function __resolveEqId(modal){
        try {
          let eqId = modal?.dataset?.eqId || null;
          if(!eqId && window.__LAST_EQ_FOR_EFETIVO__?.id){ eqId = window.__LAST_EQ_FOR_EFETIVO__.id; }
          if(!eqId && modal?.__eqRef?.id){ eqId = modal.__eqRef.id; }
          if(!eqId && window.__LAST_EQ_BTN_EQID__){ eqId = window.__LAST_EQ_BTN_EQID__; }
          if(!eqId){
            let nome = (modal?.dataset?.eqNome || '').trim();
            if(!nome){ nome = (modal?.querySelector('#efetivoEquipeNome')?.textContent||'').trim(); }
            if(nome){
              const st = (window.__ESCALA_STATE__||state||{});
              const lista = Array.isArray(st.equipes)? st.equipes : (Array.isArray(state?.equipes)? state.equipes : []);
              const ach = lista.find(e=> String((e.nome||'')).trim().toUpperCase()===nome.toUpperCase());
              if(ach) eqId = ach.id;
            }
          }
          // Similaridade por componentes (se ainda não resolveu)
          if(!eqId){
            try {
              const st3 = (window.__ESCALA_STATE__||state||{});
              const lista = Array.isArray(st3.equipes)? st3.equipes : [];
              const edit = Array.isArray(modal?.__editingList)? modal.__editingList: [];
              const keyOf = (c)=> String((c && (c.funcionario_id||c.id||c.matricula||c.codigo||c.cpf))||'').toUpperCase();
              const editKeys = new Set(edit.map(keyOf).filter(Boolean));
              let best=null, bestCnt=0;
              lista.forEach(eq=>{
                const comp = Array.isArray(eq.componentes)? eq.componentes: [];
                const cnt = comp.reduce((acc,x)=> acc + (editKeys.has(keyOf(x))?1:0), 0);
                if(cnt>bestCnt){ best=eq; bestCnt=cnt; }
              });
              if(best && bestCnt>0){ eqId = best.id; }
            } catch(_sim){}
          }
          if(!eqId){
            const st2 = (window.__ESCALA_STATE__||state||{});
            if(Array.isArray(st2.equipes) && st2.equipes.length===1){ eqId = st2.equipes[0].id; }
          }
          if(eqId && modal){ try { modal.dataset.eqId = String(eqId); } catch(_){} }
          return eqId || null;
        } catch(_r){ return null; }
      }
      try { window.__resolveEqIdEfetivo = __resolveEqId; } catch(_ex){}
      // Abertura programática global do modal de pesquisa a partir do botão Adicionar
      try {
        window.__abrirPesquisaEfetivoFromBtn = async function(btn){
          try {
            const ef = document.getElementById('modalEfetivoEquipe');
            const setStack = ()=>{
              try {
                if(ef && ef.classList.contains('show') && !ef.__preventHideBound){
                  const preventHide = function(e){ try { e.preventDefault(); } catch(_){} };
                  ef.addEventListener('hide.bs.modal', preventHide);
                  ef.__preventHideBound = preventHide;
                }
              } catch(_s){}
            };
            try { window.__EF_PESQ_OPENED_FROM_EQ__ = true; } catch(_f){}
            const openWDG = ()=>{ if(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function'){ setStack(); window.WDG.abrirModalPesquisarEfetivo({ mode:'multi', onSelect:(ret)=>{ try { if(Array.isArray(ret)){ ret.forEach(it=> window.__efAdicionarSelecionadoEfetivo && window.__efAdicionarSelecionadoEfetivo(it)); } else if(ret){ window.__efAdicionarSelecionadoEfetivo && window.__efAdicionarSelecionadoEfetivo(ret); } }catch(_e){} } }); return true; } return false; };
            const openDirect = ()=>{
              const mp = document.getElementById('modalPesquisarEfetivo');
              if(mp && window.bootstrap && window.bootstrap.Modal){
                try {
                  setStack();
                  const openModals = Array.from(document.querySelectorAll('.modal.show')).filter(m=> m!==mp);
                  if(openModals.length){ mp.style.zIndex = 1065; const backs=document.querySelectorAll('.modal-backdrop'); if(backs.length){ backs[backs.length-1].style.zIndex=1060; } }
                  if(mp.getAttribute('aria-hidden')==='true') mp.removeAttribute('aria-hidden');
                } catch(_s){}
                window.bootstrap.Modal.getOrCreateInstance(mp).show();
                return true;
              }
              return false;
            };
            if(openWDG()) return;
            if(openDirect()) return;
            // Loader dinâmico do script do modal de pesquisa e tenta novamente
            if(!window.__EF_PESQ_LOADING__){
              window.__EF_PESQ_LOADING__=true;
              const base=(typeof basePath==='function'? basePath(): '/escalas');
              const urls=[ base + '/js/escalas/modais_popups/modal_pesquisar_efetivo.js?v='+(Date.now()), base + '/js/modais_popups/modal_pesquisar_efetivo.js?v='+(Date.now()) ];
              for(const src of urls){
                try { await new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=res; s.onerror=()=>rej(); document.head.appendChild(s); }); break; } catch(_ld){}
              }
              window.__EF_PESQ_LOADING__=false;
            }
            if(openWDG()) return; if(openDirect()) return;
          } catch(_err){}
        }
      } catch(_glb){}
  document.addEventListener('click', async function(ev){
        try {
          const t = ev.target;
          const modal = t && (t.closest && t.closest('#modalEfetivoEquipe'));
          if(!modal) return;
          const tbody = modal.querySelector('#tabelaEfetivoEquipe tbody');
          // Remover componente
          const btnRem = t.closest && t.closest('button[data-act="rem-comp"]');
          if(btnRem && tbody){
            ev.preventDefault(); ev.stopPropagation();
            const tr = btnRem.closest('tr[data-idx]');
            const idx = tr ? parseInt(tr.getAttribute('data-idx'),10) : -1;
            const list = modal.__editingList || [];
            if(!isNaN(idx) && idx>=0){ list.splice(idx,1); modal.__editingList = list; }
            // re-render simples
            tbody.innerHTML = list.map((c,i)=>{
              const ident=(c.matricula||c.codigo||c.id||'') + (c.nome? ' - '+c.nome : '');
              return `<tr data-idx="${i}"><td class="align-middle small">${ident}</td><td class="align-middle small"><span class="text-muted small">(calcular)</span></td><td class="align-middle text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="rem-comp">Remover</button></td></tr>`;
            }).join('');
            return;
          }
          // Adicionar por código (botão ou enter)
          const btnAdd = t.closest && t.closest('#btnAdicionarEfetivo');
          if(btnAdd){
            try {
              if(typeof window.__abrirPesquisaEfetivoFromBtn === 'function'){
                ev.preventDefault(); ev.stopPropagation();
                try { window.__abrirPesquisaEfetivoFromBtn(btnAdd); } catch(_d){}
                return;
              }
              console.debug('[efetivo][ui] abrir pesquisa via botão Adicionar');
              const openWDG = ()=> window.WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect: function(sel){ try { if(Array.isArray(sel)) sel = sel[0]; if(sel && window.__efAdicionarSelecionadoEfetivo) window.__efAdicionarSelecionadoEfetivo(sel); } catch(_e){} } });
              const openDirect = ()=>{
                const mp = document.getElementById('modalPesquisarEfetivo');
                if(mp && window.bootstrap && window.bootstrap.Modal){
                  try { window.__EF_PESQ_OPENED_FROM_EQ__ = true; } catch(_){ }
                  try {
                    const openModals = Array.from(document.querySelectorAll('.modal.show')).filter(m=> m!==mp);
                    if(openModals.length){ mp.style.zIndex = 1065; const backs=document.querySelectorAll('.modal-backdrop'); if(backs.length){ backs[backs.length-1].style.zIndex=1060; } }
                    if(mp.getAttribute('aria-hidden')==='true') mp.removeAttribute('aria-hidden');
                    // Não fechar o modal Efetivo por baixo
                    const ef = document.getElementById('modalEfetivoEquipe');
                    if(ef && openModals.includes(ef) && !ef.__preventHideBound){
                      const preventHide = function(e){ try { e.preventDefault(); } catch(_){} };
                      ef.addEventListener('hide.bs.modal', preventHide);
                      ef.__preventHideBound = preventHide;
                    }
                  } catch(_s){}
                  window.bootstrap.Modal.getOrCreateInstance(mp).show();
                  return true;
                }
                return false;
              };
              if(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function'){ openWDG(); return; }
              if(openDirect()) return;
              // Carregar dinamicamente o script do modal de pesquisa e tentar novamente
              if(!window.__EF_PESQ_LOADING__){
                window.__EF_PESQ_LOADING__ = true;
                const base = (typeof basePath==='function'? basePath(): '/escalas');
                const candidates = [ base + '/js/escalas/modais_popups/modal_pesquisar_efetivo.js?v='+(Date.now()), base + '/js/modais_popups/modal_pesquisar_efetivo.js?v='+(Date.now()) ];
                for(const src of candidates){
                  try {
                    await new Promise((resolve, reject)=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=resolve; s.onerror=()=>reject(new Error('load-failed')); document.head.appendChild(s); });
                    break;
                  } catch(_load){}
                }
                window.__EF_PESQ_LOADING__ = false;
              }
              if(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function'){ openWDG(); return; }
              if(openDirect()) return;
              // Último recurso: fluxo por código/CPF
              await __efAddByCodigo(modal);
            } catch(_e){}
            return;
          }
          const btnBuscar = t.closest && t.closest('#btnBuscarFuncionario');
          if(btnBuscar){ ev.preventDefault(); ev.stopPropagation(); try { await __efAddByCodigo(modal); } catch(_e){} return; }
          const salvar = t.closest && t.closest('#btnSalvarEfetivoEquipe');
          if(salvar){
            // se o botão já tem handler enriquecido, deixa ele cuidar
            const enriched = salvar.getAttribute && salvar.getAttribute('data-enriched');
            if(enriched==='1'){ return; }
            ev.preventDefault(); ev.stopPropagation();
            try { __resolveEqId(modal); await __efSalvar(modal); } catch(_e){}
            return;
          }
        } catch(_g){}
      }, true);
  document.addEventListener('keydown', async function(ev){
        try {
          const el = ev.target;
          if(!el || el.id!=='efetivoCodigo') return;
          if(ev.key==='Enter'){
            const modal = el.closest('#modalEfetivoEquipe'); if(!modal) return;
            ev.preventDefault(); ev.stopPropagation();
            try { await __efAddByCodigo(modal); } catch(_e){}
          }
        } catch(_k){}
      }, true);
      async function __efAddByCodigo(modal){
        const input = modal.querySelector('#efetivoCodigo'); if(!input) return;
        const cod = (input.value||'').trim(); if(!cod){ try{ input.focus(); }catch(_f){} return; }
        const list = Array.isArray(modal.__editingList)? modal.__editingList: (modal.__editingList=[]);
        // chamada robusta ao backend
        async function buscar(){
          // 1) funcionarios-responsaveis (cpf/codigo) no prefixo /escalas, depois raiz
          const digits = cod.replace(/\D/g,'');
          const qs = digits.length===11 ? ('cpf='+encodeURIComponent(digits)) : ('codigo='+encodeURIComponent(cod));
          async function buscaLista(url){ try { const r=await fetch(url,{credentials:'same-origin'}); if(!r.ok) return null; const j=await r.json(); return Array.isArray(j.data)? j.data:[]; } catch(_){ return null; } }
          let lista = await buscaLista(basePath()+ '/api/funcionarios-responsaveis?'+qs);
          if(!lista || !lista.length) lista = await buscaLista('/api/funcionarios-responsaveis?'+qs);
          if(Array.isArray(lista) && lista.length){
            let f = null;
            if(digits.length===11){ f = lista.find(x=> String((x.cpf||'').replace(/\D/g,'')).endsWith(digits)); }
            if(!f){ f = lista.find(x=> String(x.codigo||'').toUpperCase()===cod.toUpperCase()); }
            if(!f){ f = lista[0]; }
            return { id:f.id, nome:f.nome, codigo:f.codigo, cpf:f.cpf };
          }
          // 2) busca-codigo legado
          try { const r = await fetch(basePath()+ '/api/funcionarios/busca-codigo?codigo='+encodeURIComponent(cod), { credentials:'same-origin' }); if(r.ok){ const j=await r.json(); if(j&&j.data) return j.data; } } catch(_e){}
          try { const r2 = await fetch('/api/funcionarios/busca-codigo?codigo='+encodeURIComponent(cod), { credentials:'same-origin' }); if(r2.ok){ const j2=await r2.json(); if(j2&&j2.data) return j2.data; } } catch(_e2){}
          return null;
        }
        const f = await buscar();
        if(!f){ alert('Funcionário não encontrado.'); return; }
        const key = String(f.id||f._id||f.funcionario_id||f.codigo||f.cpf||cod).toUpperCase();
        if(list.some(c=> String(c.funcionario_id||c.id||c.codigo||c.cpf).toUpperCase()===key)) return;
        list.push({ id: f.id||f._id||key, funcionario_id: f.id||f._id||null, matricula: f.codigo||f.cpf||cod, nome: f.nome||'' });
        modal.__editingList = list; input.value='';
        const tbody = modal.querySelector('#tabelaEfetivoEquipe tbody'); if(!tbody) return;
        tbody.innerHTML = list.map((c,i)=>{
          const ident=(c.matricula||c.codigo||c.id||'') + (c.nome? ' - '+c.nome : '');
          const periodo = c.__periodoHtml || '<span class="text-muted small">(calcular)</span>';
          return `<tr data-idx="${i}"><td class="align-middle small">${ident}</td><td class="align-middle small">${periodo}</td><td class="align-middle text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="rem-comp">Remover</button></td></tr>`;
        }).join('');
        // Cálculo imediato da última linha ao inserir por código/CPF
        try {
          const lastIdx = list.length - 1;
          const lastTr = tbody.querySelector(`tr[data-idx="${lastIdx}"]`);
          const cell = lastTr && lastTr.children && lastTr.children[1];
          const comp = list[lastIdx];
          if(lastTr && cell && comp){
            cell.innerHTML = '<span class="text-muted small">(calculando...)</span>';
            const ef = document.getElementById('modalEfetivoEquipe');
            const calc = (window.__efCalcCompGlobal || (ef && ef.__efCalcComp) || calcularDisponibilidadeComponente);
            Promise.resolve(calc(comp)).then(info=>{
              if(!info || !Array.isArray(info.livres)) return;
              if(!info.livres.length){
                comp.__periodoHtml = '<span class="text-danger fw-semibold small">Indisponível</span>';
                cell.innerHTML = comp.__periodoHtml;
                lastTr.dataset.disponivel='0';
              } else {
                const lbl = info.livres.map(r=> dateISOToBr(r.ini)+' à '+dateISOToBr(r.fim)).join('<br>');
                comp.__periodoHtml = '<span class="small">'+lbl+'</span>';
                cell.innerHTML = comp.__periodoHtml;
                lastTr.dataset.disponivel='1';
              }
            }).catch(()=>{ cell.innerHTML = '<span class="text-muted small">(erro ao calcular)</span>'; })
            .finally(()=>{ try { setTimeout(()=>{ try { window.__efForceRefreshLista && window.__efForceRefreshLista(); } catch(_r){} }, 0); } catch(_r){} });
          }
        } catch(_imm){}
      }
      // Listener global: quando o modal de pesquisa emitir seleção, inserir no modal Efetivo
      try {
        if(!window.__EF_PESQ_EVENT_BOUND__){
          window.__EF_PESQ_EVENT_BOUND__ = true;
          const handlerSingle = (ev)=>{ try { const sel = ev && ev.detail; if(sel && window.__efAdicionarSelecionadoEfetivo) window.__efAdicionarSelecionadoEfetivo(sel); } catch(_e){} };
          const handlerMulti = (ev)=>{ try { const list = ev && ev.detail; if(Array.isArray(list) && window.__efAdicionarSelecionadoEfetivo){ list.forEach(item=> window.__efAdicionarSelecionadoEfetivo(item)); } } catch(_e){} };
          window.addEventListener('escala:efetivoSelecionado', handlerSingle);
          window.addEventListener('escala:efetivoSelecionadoMultiplo', handlerMulti);
        }
      } catch(_evb){}
      // Helper global: inserir item selecionado pelo modal de pesquisa na lista atual do modal Efetivo
      try {
        if(typeof window.__efAdicionarSelecionadoEfetivo !== 'function'){
          window.__efAdicionarSelecionadoEfetivo = function(sel){
            try {
              if(Array.isArray(sel)) sel = sel[0]; if(!sel) return;
              const modal = document.getElementById('modalEfetivoEquipe'); if(!modal) return;
              const tbody = modal.querySelector('#tabelaEfetivoEquipe tbody'); if(!tbody) return;
              const list = Array.isArray(modal.__editingList)? modal.__editingList: (modal.__editingList=[]);
              const key = String(sel.id||sel._id||sel.funcionario_id||sel.codigo||sel.cpf||'').toUpperCase(); if(!key) return;
              const exists = list.some(c=> String(c.funcionario_id||c.id||c.codigo||c.cpf).toUpperCase()===key);
              if(exists) return;
              list.push({ id: sel.id||sel._id||key, funcionario_id: sel.id||sel._id||null, matricula: sel.codigo||sel.cpf||'', nome: sel.nome||'' });
              modal.__editingList = list;
              tbody.innerHTML = list.map((c,i)=>{
                const ident=(c.matricula||c.codigo||c.id||'') + (c.nome? ' - '+c.nome : '');
                const periodo = c.__periodoHtml || '<span class="text-muted small">(calcular)</span>';
                return `<tr data-idx="${i}"><td class="align-middle small">${ident}</td><td class="align-middle small">${periodo}</td><td class="align-middle text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="rem-comp">Remover</button></td></tr>`;
              }).join('');
              // Cálculo imediato para a última linha adicionada (feedback instantâneo)
              try {
                const lastIdx = list.length - 1;
                const lastTr = tbody.querySelector(`tr[data-idx="${lastIdx}"]`);
                const cell = lastTr && lastTr.children && lastTr.children[1];
                const comp = list[lastIdx];
                if(lastTr && cell && comp){
                  cell.innerHTML = '<span class="text-muted small">(calculando...)</span>';
                  const ef = document.getElementById('modalEfetivoEquipe');
                  const calc = (window.__efCalcCompGlobal || (ef && ef.__efCalcComp) || calcularDisponibilidadeComponente);
                  Promise.resolve(calc(comp)).then(info=>{
                    if(!info || !Array.isArray(info.livres)) return;
                    if(!info.livres.length){
                      comp.__periodoHtml = '<span class="text-danger fw-semibold small">Indisponível</span>';
                      cell.innerHTML = comp.__periodoHtml;
                      lastTr.dataset.disponivel='0';
                    } else {
                      const lbl = info.livres.map(r=> dateISOToBr(r.ini)+' à '+dateISOToBr(r.fim)).join('<br>');
                      comp.__periodoHtml = '<span class="small">'+lbl+'</span>';
                      cell.innerHTML = comp.__periodoHtml;
                      lastTr.dataset.disponivel='1';
                    }
                  }).catch(()=>{ cell.innerHTML = '<span class="text-muted small">(erro ao calcular)</span>'; })
                  .finally(()=>{ try { setTimeout(()=>{ try { window.__efForceRefreshLista && window.__efForceRefreshLista(); } catch(_r){} }, 0); } catch(_r){} });
                }
              } catch(_imm){}

              // FORÇA CÁLCULO GLOBAL IMEDIATO APÓS INSERÇÃO VIA MODAL
              try {
                console.log('[efetivo][forçado] inserção via modal detectada, forçando cálculo global');
                setTimeout(()=>{ try { atualizarPeriodosDisponiveis(); } catch(_f){ console.error('[efetivo][forçado] erro no cálculo forçado', _f); } }, 100);
                setTimeout(()=>{ try { atualizarPeriodosDisponiveis(); } catch(_f){} }, 500);
                setTimeout(()=>{ try { atualizarPeriodosDisponiveis(); } catch(_f){} }, 1000);
              } catch(_force){}

              // Invalida cache de indisponibilidade para este funcionário (por período atual)
              try {
                const fid = sel.id||sel._id||sel.funcionario_id||sel.codigo||sel.cpf;
                if(fid && state && state.__indispCache){
                  const ini = state.periodo?.ini, fim = state.periodo?.fim;
                  const k = fid+'|'+(ini||'')+'|'+(fim||'');
                  state.__indispCache.delete && state.__indispCache.delete(k);
                }
              } catch(_ic){}
              // Força cálculo imediato para garantir que o último item seja calculado
              try { setTimeout(()=>{ try { atualizarPeriodosDisponiveis(); } catch(_c){} }, 10); } catch(_f){}
              // Dispara refresh/recalcular após cálculo imediato e notifica outros listeners
              try { setTimeout(()=>{ try { window.__efForceRefreshLista && window.__efForceRefreshLista(); } catch(_r){} }, 0); } catch(_r){}
              try { window.dispatchEvent(new CustomEvent('escala:efetivo:lista-modificada')); } catch(_evt){}
            } catch(_e){ console.error('[efetivo][inserção] erro ao adicionar selecionado', _e); }
          }
        }
      } catch(_exp){}
  try { window.__efAddByCodigo = __efAddByCodigo; } catch(_exp){}
      async function __efSalvar(modal){
        try {
          // Resolve eqId de forma robusta e persiste no dataset do modal
          const resolver = (typeof window.__resolveEqIdEfetivo==='function') ? window.__resolveEqIdEfetivo : null;
          let eqId = resolver ? resolver(modal) : (modal && (modal.dataset && modal.dataset.eqId));
          if(!eqId && window.__LAST_EQ_FOR_EFETIVO__ && window.__LAST_EQ_FOR_EFETIVO__.id){ eqId = window.__LAST_EQ_FOR_EFETIVO__.id; modal.dataset.eqId = String(eqId); }
          if(!eqId && modal && modal.__eqRef && modal.__eqRef.id){ eqId = modal.__eqRef.id; modal.dataset.eqId = String(eqId); }
          if(!eqId && window.__LAST_EQ_BTN_EQID__){ eqId = window.__LAST_EQ_BTN_EQID__; modal.dataset.eqId = String(eqId); }
          if(!eqId){
            const nome = (modal.querySelector('#efetivoEquipeNome')?.textContent||'').trim();
            if(nome){
              const st = (window.__ESCALA_STATE__||state||{});
              const lista = Array.isArray(st.equipes)? st.equipes : (Array.isArray(state?.equipes)? state.equipes : []);
              const ach = lista.find(e=> String((e.nome||'')).trim().toUpperCase()===nome.toUpperCase());
              if(ach){ eqId = ach.id; modal.dataset.eqId = String(eqId); window.__LAST_EQ_FOR_EFETIVO__ = ach; }
            }
          }
          if(!eqId){
            const st2 = (window.__ESCALA_STATE__||state||{});
            if(Array.isArray(st2.equipes) && st2.equipes.length===1){ eqId = st2.equipes[0].id; modal.dataset.eqId=String(eqId); }
          }
          if(!eqId){ alert('Equipe inválida. Abra o Efetivo a partir da tabela de Equipes e tente novamente.'); return; }

          if(!state.escalaId){
            try { const u=new URL(location.href); const q=u.searchParams.get('id'); if(q) state.escalaId=q; } catch(_e){}
          }
          if(!state.escalaId){ alert('Salve os Dados Gerais para criar a escala antes de salvar.'); return; }

          // Monta componentes e salva
          const st = state || (window.__ESCALA_STATE__||{});
          const lista = Array.isArray(st.equipes)? st.equipes: [];
          const idx = lista.findIndex(e=> String(e.id)===String(eqId));
          const compsRaw = Array.isArray(modal.__editingList)? modal.__editingList: [];
          const ini = (state && state.periodo && state.periodo.ini) || null;
          const fim = (state && state.periodo && state.periodo.fim) || null;
          const calc = (modal.__efCalcComp || window.__efCalcCompGlobal || null);
          async function diasDoIntervalo(livres){
            try { if(!Array.isArray(livres)||!livres.length) return []; const out=[]; for(const r of livres){ const i=(r.ini||r.inicio||'').slice(0,10); const f=(r.fim||'').slice(0,10); if(!i||!f) continue; const d0=new Date(i+'T00:00:00'); const d1=new Date(f+'T00:00:00'); for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)) out.push(d.toISOString().slice(0,10)); } return Array.from(new Set(out)); } catch(_){ return []; } }
          const infos = calc ? await Promise.all(compsRaw.map(c=> Promise.resolve(calc(c)).catch(()=>({livres:[],indis:[]})))) : [];
          const comps = await Promise.all(compsRaw.map(async (c, idx)=>{
            const info = calc ? (infos[idx]||{livres:[], indis:[]}) : {livres:[], indis:[]};
            const dias = await diasDoIntervalo(info.livres);
            return {
              id: c.id,
              funcionario_id: c.funcionario_id || c.id,
              nome: c.nome,
              matricula: c.matricula || c.codigo || null,
              periodo: { ini: ini, fim: fim },
              periodoIni: ini,
              periodoFim: fim,
              disponibilidade: Array.isArray(info.livres)? info.livres.map(r=>({ ini:(r.ini||r.inicio||'').slice(0,10), fim:(r.fim||'').slice(0,10) })) : [],
              indisponibilidades: Array.isArray(info.indis)? info.indis.map(r=>({ ini:(r.ini||r.inicio||'').slice(0,10), fim:(r.fim||'').slice(0,10), tipo:r.tipo||null })) : [],
              diasDisponiveis: dias
            };
          }));
          if(idx>=0){ lista[idx].componentes = comps.slice(); }
          async function put(body){
            try { const r=await fetch(basePath()+`/api/escalas/${st.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); if(r.ok) return r; } catch(_p){}
            try { const r2=await fetch(`/api/escalas/${st.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); if(r2.ok) return r2; } catch(_p2){}
            return { ok:false };
          }
          let ok=false;
          if((await put({ equipes: lista })).ok) ok=true;
          else if((await put({ equipesOverwrite:true, equipes: lista })).ok) ok=true;
          if(!ok){ alert('Falha ao salvar componentes da equipe.'); return; }
          try { renderEquipes && renderEquipes(); renderMatrizesPorGrupo && renderMatrizesPorGrupo(); avaliarProgressaoAbas && avaliarProgressaoAbas(); } catch(_r){}
          try { const inst=bootstrap.Modal.getOrCreateInstance(modal); inst && inst.hide(); } catch(_b){}
        } catch(err){ console.warn('[efetivo][save] erro', err); alert('Erro ao salvar.'); }
      }
    } catch(_bd){}
  }
  // Ativa o binder global imediatamente para garantir captura de Enter/Buscar/Adicionar
  try { ensureEfetivoGlobalBinder(); } catch(_autoBind){}
  // (removido patch global de Modal.show para evitar interferência ampla)
  // Shim: se por algum motivo o binder ainda não definiu o abridor global, define um fallback imediato
  try {
    if(typeof window.__abrirPesquisaEfetivoFromBtn !== 'function'){
      window.__abrirPesquisaEfetivoFromBtn = async function(btn){
        try {
          const ef = document.getElementById('modalEfetivoEquipe');
          const setStack = ()=>{
            try {
              if(ef && ef.classList.contains('show') && !ef.__preventHideBound){
                const preventHide = function(e){ try { e.preventDefault(); } catch(_){} };
                ef.addEventListener('hide.bs.modal', preventHide);
                ef.__preventHideBound = preventHide;
              }
            } catch(_s){}
          };
          const openWDG = ()=>{ if(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function'){ setStack(); window.__EF_PESQ_OPENED_FROM_EQ__=true; window.WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect:(sel)=>{ try { if(Array.isArray(sel)) sel=sel[0]; if(sel && window.__efAdicionarSelecionadoEfetivo) window.__efAdicionarSelecionadoEfetivo(sel); }catch(_e){} } }); return true; } return false; };
          const openDirect = ()=>{
            const mp = document.getElementById('modalPesquisarEfetivo');
            if(mp && window.bootstrap && window.bootstrap.Modal){
              try {
                setStack(); window.__EF_PESQ_OPENED_FROM_EQ__=true;
                const openModals = Array.from(document.querySelectorAll('.modal.show')).filter(m=> m!==mp);
                if(openModals.length){ mp.style.zIndex = 1065; const backs=document.querySelectorAll('.modal-backdrop'); if(backs.length){ backs[backs.length-1].style.zIndex=1060; } }
                if(mp.getAttribute('aria-hidden')==='true') mp.removeAttribute('aria-hidden');
              } catch(_s){}
              window.bootstrap.Modal.getOrCreateInstance(mp).show();
              return true;
            }
            return false;
          };
          if(openWDG()) return;
          if(openDirect()) return;
          // loader dinâmico
          if(!window.__EF_PESQ_LOADING__){
            window.__EF_PESQ_LOADING__=true;
            const base=(typeof basePath==='function'? basePath(): '/escalas');
            const urls=[ base + '/js/escalas/modais_popups/modal_pesquisar_efetivo.js?v='+(Date.now()), base + '/js/modais_popups/modal_pesquisar_efetivo.js?v='+(Date.now()) ];
            for(const src of urls){
              try { await new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=res; s.onerror=()=>rej(); document.head.appendChild(s); }); break; } catch(_ld){}
            }
            window.__EF_PESQ_LOADING__=false;
          }
          if(openWDG()) return; if(openDirect()) return;
        } catch(_err){}
      };
    }
  } catch(_shim){}
  // Handler global simples para abrir Efetivo a partir de um botão dentro da linha da tabela
  try {
    if(typeof window.__eqOpenEfetivo !== 'function'){
      window.__eqOpenEfetivo = function(btn){
        try {
          const tr = btn && btn.closest ? btn.closest('tr[data-id]') : null;
          const id = tr && tr.getAttribute('data-id');
          try { window.__LAST_EQ_BTN_EQID__ = id || null; } catch(_g){}
          if(!id){ if(typeof window.__openEfetivoFallback==='function') window.__openEfetivoFallback({ id:null, nome:'EQ', componentes:[] }); return; }
          let eq = null;
          try { eq = (window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.equipes)) ? window.__ESCALA_STATE__.equipes.find(e=> String(e.id)===String(id)) : null; } catch(_s){}
          if(!eq){ try { eq = (typeof state!=='undefined' && state && Array.isArray(state.equipes)) ? state.equipes.find(e=> String(e.id)===String(id)) : null; } catch(_ss){} }
          if(!eq && tr){
            try { const tds=tr.querySelectorAll('td'); eq = { id, nome:(tds[0]?.textContent||'EQ').trim(), descricao:(tds[1]?.textContent||'').trim(), componentes:[] }; } catch(_d){}
          }
          // Guarda último contexto de equipe para preenchimento ao abrir
          try { window.__LAST_EQ_FOR_EFETIVO__ = eq || { id, nome:'EQ', componentes:[] }; } catch(_ctx){}
          // Prioriza abrir o modal EJS com função completa (bindings)
          if(document.getElementById('modalEfetivoEquipe')){
            try {
              window.__LAST_EQ_FOR_EFETIVO__ = eq || { id, nome:'EQ', componentes:[] };
              const m = document.getElementById('modalEfetivoEquipe');
              if(m && (eq||id)) { m.dataset.eqId = String((eq&&eq.id)||id||''); m.dataset.eqNome = (eq&&eq.nome)||''; }
            } catch(_ctx){}
            if(__openEfetivoModalEJS(eq||{ id, nome:'EQ', componentes:[] })) return;
          }
          if(typeof window.openEquipeEfetivoModal==='function') window.openEquipeEfetivoModal(eq||{ id, nome:'EQ', componentes:[] });
          else if(typeof window.__openEfetivoFallback==='function') window.__openEfetivoFallback(eq||{ id, nome:'EQ', componentes:[] });
        } catch(_e){}
      }
    }
  } catch(_exp){}
  // Listener de captura universal: garante abertura do Efetivo em qualquer cenário
  try {
    if(!window.__EQ_OPEN_CAPTURE_BOUND__){
      window.__EQ_OPEN_CAPTURE_BOUND__ = true;
      document.addEventListener('click', function(ev){
        try {
          const el = ev.target;
          const btn = el && (el.closest && (el.closest('table#tabelaEquipes button[data-act="comp-eq"]')
                       || el.closest('table#tabelaEquipes button[data-action="efetivo"]')
                       || el.closest('table#tabelaEquipes [title="Efetivo"]')
                       || el.closest('table#tabelaEquipes .bi-people') && el.closest('button')));
          if(!btn) return;
          const realBtn = btn.matches('button')? btn : btn.closest('button');
          if(realBtn){
            // evita reentrância rápida
            if(realBtn.dataset._efOpen==='1') return;
            realBtn.dataset._efOpen='1'; setTimeout(()=>{ try{ delete realBtn.dataset._efOpen; }catch(_e){} }, 500);
            ev.preventDefault(); ev.stopPropagation(); try{ ev.stopImmediatePropagation && ev.stopImmediatePropagation(); }catch(_e){}
            // Deferir trabalho pesado para fora do handler de click
            setTimeout(()=>{
              try {
                const tr = realBtn.closest('tr[data-id]');
                const id = tr && tr.getAttribute('data-id');
                try { window.__LAST_EQ_BTN_EQID__ = id || null; } catch(_g){}
                let eq = null;
                try { eq = (window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.equipes)) ? window.__ESCALA_STATE__.equipes.find(e=> String(e.id)===String(id)) : null; } catch(_s){}
                if(!eq && tr){ try { const tds=tr.querySelectorAll('td'); eq = { id, nome:(tds[0]?.textContent||'EQ').trim(), descricao:(tds[1]?.textContent||'').trim(), componentes:[] }; } catch(_d){} }
                if(document.getElementById('modalEfetivoEquipe')){
                  try {
                    window.__LAST_EQ_FOR_EFETIVO__ = eq || { id, nome:'EQ', componentes:[] };
                    const m = document.getElementById('modalEfetivoEquipe');
                    if(m && (eq||id)) { m.dataset.eqId = String((eq&&eq.id)||id||''); m.dataset.eqNome = (eq&&eq.nome)||''; }
                  } catch(_ctx){}
                  if(typeof openEquipeEfetivoModal==='function') { openEquipeEfetivoModal(eq||{ id, nome:'EQ', componentes:[] }); return; }
                  if(__openEfetivoModalEJS(eq||{ id, nome:'EQ', componentes:[] })) return;
                }
                // Fallbacks
                if(typeof window.__eqOpenEfetivo==='function') window.__eqOpenEfetivo(realBtn);
              } catch(_prio){}
            }, 0);
          }
        } catch(_cap){}
      }, true); // capture
    }
  } catch(_bindCap){}
  // FunÃ§Ã£o segura para atualizar rÃ³tulos/resumo de contexto (placeholder) â€“ evita ReferenceError
  // Chamadas existentes no cÃ³digo esperavam esta funÃ§Ã£o; ausÃªncia dela interrompia o fluxo (ex: salvar dados gerais)
  function atualizarLabelsContexto(){
    try {
      const desc = els.descricao?.value?.trim() || '';
      const unidadeTxt = (function(){
        if(!els.unidade) return '';
        const opt = els.unidade.options[els.unidade.selectedIndex];
        return opt ? opt.textContent.trim() : '';
      })();
      const ini = els.dataInicio?.value?.trim() || '';
      const fim = els.dataFim?.value?.trim() || '';
      // Atualiza elementos de resumo se existirem
      const lblDesc = document.getElementById('lblResumoDescricao');
  if(lblDesc) lblDesc.textContent = desc || '(sem descrição)';
      const lblUnid = document.getElementById('lblResumoUnidade');
  if(lblUnid) lblUnid.textContent = unidadeTxt || '(unidade não selecionada)';
      const lblPeriodo = document.getElementById('lblResumoPeriodo');
      if(lblPeriodo){
        if(ini && fim) lblPeriodo.textContent = ini + ' à ' + fim; else lblPeriodo.textContent='(período não definido)';
      }
      // Sincroniza parcialmente com state.dadosGerais se jÃ¡ iniciado
      if(desc) state.dadosGerais.descricao = desc;
      if(els.unidade?.value) state.dadosGerais.unidadeId = els.unidade.value;
      if(!state.tipo && els.classificacao?.value){ state.tipo = els.classificacao.value; }
    } catch(err){ console.debug('[escala][atualizarLabelsContexto] noop', err); }
  }
  // (funÃ§Ãµes antigas de retry/forÃ§ar unidade removidas â€“ agora usamos applyUnidadeDefinitiva/forceApplyUnidade)
  // Expor para depuraÃ§Ã£o
  window.__ESCALA_STATE__ = state;
  window.__ESCALA_ELS__ = els;
  // Helper reintroduzido (pode ser usado antes de DOMContentLoaded em verificaÃ§Ãµes de URL)
  // function obterQueryId(){ try { const u=new URL(location.href); return u.searchParams.get('id'); } catch(_){ return null; } }
  // Detecta tipo logo no inÃ­cio para que qualquer aÃ§Ã£o precoce (ex: salvar dados gerais rapidamente)
  // jÃ¡ disponha de state.tipo preenchido e portanto envie 'classificacao' no POST.
  function detectTipoEarly2(){
      try {
        const path = location.pathname.toLowerCase();
        if(path.includes('/ordinaria/')) return 'ORDINÃRIA';
        if(path.includes('/extraordinaria/')) return 'EXTRAORDINÃRIA';
        return null;
      } catch(_){ return null; }
    }
  // Stub precoce para evitar ReferenceError caso carregamento antecipado invoque bloquearCamposGerais
  if(typeof window.bloquearCamposGerais !== 'function'){
    window.bloquearCamposGerais = function(){ /* noop early stub â€“ substituÃ­da pela real apÃ³s init */ };
  }
  // ==== Helpers globais de abas (extraÃ­dos para evitar ReferenceError quando carregarEscalaExistente roda cedo) ====
  // Se versÃµes internas forem definidas depois dentro de initEscalaPage, elas prevalecem somente no escopo interno;
  // por isso garantimos aqui implementaÃ§Ãµes mÃ­nimas reutilizÃ¡veis.
  if(!window.__ESCALA_TAB_HELPERS__){
    window.__ESCALA_TAB_HELPERS__ = true;
    function setAbasHabilitadas(cfg){
      try {
        console.log('[escala][setAbasHabilitadas] chamada com cfg:', cfg);
        cfg = cfg||{};
        const map = {
          gerais: 'aba-gerais',
          turnos: 'aba-turnos',
          equipes: 'aba-equipes',
          aloc: 'aba-alocacao',
          rec: 'aba-recursos',
          valid: 'aba-validacao'
        };
        Object.entries(map).forEach(([chave,paneId])=>{
          const enable = !!cfg[chave];
          console.log('[escala][setAbasHabilitadas] chave:', chave, 'enable:', enable, 'paneId:', paneId);
            const navBtn = document.querySelector(`#tabsEscala [data-bs-target="#${paneId}"]`);
            const pane = document.getElementById(paneId);
            console.log('[escala][setAbasHabilitadas] navBtn encontrado:', !!navBtn, 'pane encontrado:', !!pane);
            if(navBtn){
              if(enable){
                navBtn.classList.remove('disabled');
                navBtn.removeAttribute('aria-disabled');
                navBtn.removeAttribute('tabindex');
                try { navBtn.style.pointerEvents=''; } catch(_){}
              } else {
                navBtn.classList.add('disabled');
                navBtn.setAttribute('aria-disabled','true');
                navBtn.setAttribute('tabindex','-1');
                try { navBtn.style.pointerEvents='none'; } catch(_){}
              }
            }
            if(pane){ pane.classList.toggle('tab-disabled', !enable); }
        });
      } catch(e){ console.error('[escala][setAbasHabilitadas] erro:', e); /* noop */ }
    }
    function avaliarProgressaoAbas(){
      try {
        console.log('[escala][avaliarProgressaoAbas] chamada');
        const st = window.__ESCALA_STATE__ || {};
        // Quando ainda nÃ£o criada, libera Turnos/Equipes se Dados Gerais estiverem completos
        const descOk = !!(document.getElementById('descricaoEscala')?.value?.trim());
        const uniOk  = !!(document.getElementById('unidadeEscala')?.value);
        const diV    = document.getElementById('dataInicio')?.value?.trim() || '';
        const dfV    = document.getElementById('dataFim')?.value?.trim() || '';
        const perOk  = !!(dateBrToISO(diV) && dateBrToISO(dfV));
        if(!st.periodo?.ini || !st.periodo?.fim){
          try { if(perOk) normalizarDatasPeriodoParaEstado(); } catch(_){}
        }
        if(!st.created){
          const podeEditarEstrutura = !!(descOk && uniOk && perOk);
          setAbasHabilitadas({ gerais:true, turnos:podeEditarEstrutura, equipes:podeEditarEstrutura, aloc:false, rec:false, valid:false });
          return;
        }
        // ApÃ³s criada: habilita Turnos e Equipes sempre; AlocaÃ§Ã£o depende de existir equipe
        const temEquipe = Array.isArray(st.equipes) && st.equipes.length>0;
        const alocEnabled = !!temEquipe;
        const hasAlloc = (st.matrizAlocacao && typeof st.matrizAlocacao==='object' && Object.keys(st.matrizAlocacao).length>0)
          || (function(){ try { const cont=document.getElementById('matrizAlocacao'); if(!cont) return false; if(cont.querySelector('.matriz-eq-item')) return true; const td=cont.querySelector('table tbody td'); return !!(td && td.textContent && td.textContent.trim()); } catch(_e){ return false; } })();
        const hasRecursos = Array.isArray(st.recursos) && st.recursos.length>0;
        const modoConsultaUsado = (sessionStorage.getItem('esc_modo_consulta_usado') === '1');
        const recValidEnabled = !!(modoConsultaUsado || hasAlloc || hasRecursos);
        setAbasHabilitadas({ gerais:true, turnos:true, equipes:true, aloc: alocEnabled, rec: recValidEnabled, valid: recValidEnabled });
      } catch(e){ console.error('[escala][avaliarProgressaoAbas] erro:', e); /* noop */ }
    }
    // Expor para depuraÃ§Ã£o (opcional)
    try { window.setAbasHabilitadas = window.setAbasHabilitadas || setAbasHabilitadas; } catch(_ex){}
    try { window.avaliarProgressaoAbas = window.avaliarProgressaoAbas || avaliarProgressaoAbas; } catch(_ex){}
  }
  async function carregarEscalaExistente(id){
    try {
      // Idempotência básica: evita reentrância múltipla com mesmo ID
      window.__ESCALA_LOAD_IN_FLIGHT__ = window.__ESCALA_LOAD_IN_FLIGHT__ || new Set();
      const key = 'ESC@'+String(id||'').trim();
      if(window.__ESCALA_LOAD_IN_FLIGHT__.has(key)){
        console.debug('[escala][load] ignorando chamada reentrante para id', id);
        return;
      }
      window.__ESCALA_LOAD_IN_FLIGHT__.add(key);
      if(id){ id = id.trim(); }
      console.log('[escala][debug] carregando escala id=', id, 'basePath=', (typeof basePath==='function'? basePath(): 'n/a'));
      if(!id){ console.warn('[escala][load] sem id para carregar'); return; }
      // Remapeia elementos se ainda nÃ£o mapeados (chamada precoce antes de initEscalaPage)
      if(!els.descricao || !els.unidade){
        try {
          els.descricao=document.getElementById('descricaoEscala')||els.descricao;
          els.classificacao=document.getElementById('classificacaoEscala')||els.classificacao;
          els.unidade=document.getElementById('unidadeEscala')||els.unidade;
          els.dataInicio=document.getElementById('dataInicio')||els.dataInicio;
          els.dataFim=document.getElementById('dataFim')||els.dataFim;
          els.respNome=document.getElementById('responsavelNome')||els.respNome;
          els.tblGrupos=document.getElementById('tabelaGruposTurnos')||els.tblGrupos;
          els.tblEquipes=document.getElementById('tabelaEquipes')||els.tblEquipes;
          els.matrizWrap=document.getElementById('matrizAlocacao')||els.matrizWrap;
        } catch(_remap){}
      }
      const urlEsc = basePath()+`/api/escalas/${encodeURIComponent(id)}`;
      console.debug('[escala][load] efetuando fetch', urlEsc);
      let resEsc = await fetch(urlEsc, { credentials:'same-origin' });
      if(resEsc.status===404 || resEsc.status===500){
        console.warn('[escala][load] tentativa fallback URL absoluta /api/escalas/:id');
        try { resEsc = await fetch(`/api/escalas/${encodeURIComponent(id)}`, { credentials:'same-origin' }); } catch(_fb){}
      }
      console.debug('[escala][load] resposta HTTP', resEsc.status);
      if(!resEsc.ok){ throw new Error('Falha HTTP '+resEsc.status); }
      const payload = await resEsc.json();
      if(!payload){ throw new Error('Payload vazio'); }
      console.debug('[escala][load] payload bruto', payload);
      if(!payload || payload.ok===false){ throw new Error(payload?.error || 'Resposta invÃ¡lida'); }
      const d = payload.data || {};
  try { window.__ESCALA_RAW__ = JSON.parse(JSON.stringify(d)); } catch(_copy) { window.__ESCALA_RAW__ = d; }
      // DiagnÃ³stico de possÃ­veis chaves alternativas
      if(!d.grupos_turnos && Array.isArray(d.grupos)){ d.grupos_turnos = d.grupos; }
      if(!d.grupos_turnos && Array.isArray(d.turnos)){ // alguns backends podem mandar um array direto de turnos
        d.grupos_turnos = [{ id: uuid(), nome:'GRUPO', turnos: d.turnos }];
      }
      if(!d.equipes && Array.isArray(d.equipes_turnos)){ d.equipes = d.equipes_turnos; }
      // Preenche estado principal
      state.escalaId = d.id || id;
      state.dadosGerais.descricao = d.descricao || '';
      console.debug('[escala][load] descricao recebida=', d.descricao);
      state.tipo = d.classificacao || state.tipo || null;
      state.gruposTurnos = Array.isArray(d.grupos_turnos)? d.grupos_turnos.map(g=> ({ id: g.id || g._id || g.id_grupo || uuid(), nome: g.nome || g.titulo || g.nome_grupo || 'GRUPO', turnos: Array.isArray(g.turnos)? g.turnos.map(t=>({ ini:t.ini||t.inicio||t.hora_inicio||t.start, fim:t.fim||t.termino||t.hora_fim||t.end })) : [] })) : [];
      state.equipes = Array.isArray(d.equipes)? d.equipes.map(e=> ({
        id: e.id||e._id||uuid(),
        nome: e.nome || e.sigla || e.codigo || 'EQ',
        descricao: e.descricao || e.titulo || '',
        componentes: Array.isArray(e.componentes)? e.componentes.map(c=> ({
          id: c.id||c._id||c.funcionario_id||uuid(),
          funcionario_id: c.funcionario_id||c.id||c._id||null,
          nome: c.nome||c.descricao||c.label||'',
          // preserva identificadores para exibição
          matricula: c.matricula||c.codigo||c.cpf||null,
          codigo: c.codigo || null,
          cpf: c.cpf || null,
          // preserva período/disponibilidade se já persistido
          periodo: c.periodo || { ini: (c.periodoIni || null), fim: (c.periodoFim || null) },
          periodoIni: c.periodoIni || (c.periodo && c.periodo.ini) || null,
          periodoFim: c.periodoFim || (c.periodo && c.periodo.fim) || null,
          disponibilidade: Array.isArray(c.disponibilidade)? c.disponibilidade.map(r=>({ ini:(r.ini||r.inicio||'').slice(0,10), fim:(r.fim||'').slice(0,10) })) : [],
          indisponibilidades: Array.isArray(c.indisponibilidades)? c.indisponibilidades.map(r=>({ ini:(r.ini||r.inicio||'').slice(0,10), fim:(r.fim||'').slice(0,10), tipo:r.tipo||null })) : [],
          diasDisponiveis: Array.isArray(c.diasDisponiveis)? c.diasDisponiveis.slice() : []
        })) : []
      })) : [];
      console.debug('[escala][load] gruposTurnos parseados=', state.gruposTurnos.length, 'equipes parseadas=', state.equipes.length);
      if(!state.gruposTurnos.length){
        // tentativa final: se existir d.turnos_simples (ex) transforma em grupo
        if(Array.isArray(d.turnos_simples) && d.turnos_simples.length){
          state.gruposTurnos = [{ id: uuid(), nome:'GRUPO', turnos: d.turnos_simples.map(t=>({ ini:t.ini||t.inicio||t.start, fim:t.fim||t.termino||t.end })) }];
          console.debug('[escala][load][fallback] gruposTurnos derivado de turnos_simples');
        }
        // varredura genÃ©rica: procurar arrays de objetos com chave 'turnos'
        if(!state.gruposTurnos.length){
          Object.keys(d).forEach(k=>{
            const val=d[k];
            if(Array.isArray(val) && val.length && typeof val[0]==='object'){
              // Caso 1: array jÃ¡ de grupos com turnos
              if(val[0].turnos && Array.isArray(val[0].turnos)){
                state.gruposTurnos = val.map(g=> ({ id: g.id||g._id||uuid(), nome:g.nome||g.titulo||'GRUPO', turnos:(g.turnos||[]).map(t=>({ ini:t.ini||t.inicio||t.start||t.hora_inicio, fim:t.fim||t.termino||t.end||t.hora_fim })) }));
              }
              // Caso 2: array de objetos que parecem turnos (tem ini/fim ou inicio/fim)
              else if(val[0].ini || val[0].inicio || val[0].hora_inicio){
                const isTurnoLike = val.every(o=> (o.ini||o.inicio||o.hora_inicio) && (o.fim||o.termino||o.hora_fim||o.end));
                if(isTurnoLike){
                  state.gruposTurnos = [{ id: uuid(), nome:'GRUPO', turnos: val.map(t=> ({ ini:t.ini||t.inicio||t.start||t.hora_inicio, fim:t.fim||t.termino||t.end||t.hora_fim })) }];
                }
              }
            }
          });
          if(state.gruposTurnos.length) console.debug('[escala][load][derive] gruposTurnos reconstruÃ­dos via varredura genÃ©rica');
        }
      }
      if(!state.equipes.length && Array.isArray(d.lista_equipes) && d.lista_equipes.length){
        state.equipes = d.lista_equipes.map(e=> ({ id: e.id||e._id||uuid(), nome: e.nome||e.codigo||'EQ', descricao: e.descricao||'', componentes: [] }));
        console.debug('[escala][load][fallback] equipes derivadas de lista_equipes');
      }
      if(!state.equipes.length){
        // procurar arrays com shape de equipe (nome + componentes OU recursos nested)
        Object.keys(d).forEach(k=>{
          const val=d[k];
            if(Array.isArray(val) && val.length && typeof val[0]==='object'){
              const hasNome = val[0].nome || val[0].sigla || val[0].codigo;
              const hasComponentes = Array.isArray(val[0].componentes) || Array.isArray(val[0].membros) || Array.isArray(val[0].recursos);
              if(hasNome){
                state.equipes = val.map(e=> ({ id:e.id||e._id||uuid(), nome: e.nome||e.sigla||e.codigo||'EQ', descricao: e.descricao||'', componentes: Array.isArray(e.componentes)? e.componentes.map(c=> ({ id:c.id||c._id||c.funcionario_id||uuid(), funcionario_id:c.funcionario_id||c.id||c._id||null, nome:c.nome||c.descricao||c.label||'' })) : [] }));
              }
            }
        });
        if(state.equipes.length) console.debug('[escala][load][derive] equipes reconstruÃ­das via varredura genÃ©rica');
      }
      // Se ainda vazio, tentativa de diagnosticar via endpoint debug/resumo
      if((!state.gruposTurnos.length || !state.equipes.length) && state.escalaId){
        try {
          fetch(basePath()+`/api/escalas/${state.escalaId}/debug/resumo`, { credentials:'same-origin' })
            .then(r=> r.ok? r.json():null)
            .then(js=>{
              if(!js||js.ok===false) return;
              // js.equipes contÃ©m id, nome, recursos:count (nÃ£o detalha turnos) â€“ Ãºtil apenas para indicar que backend tem equipes
              if(!state.equipes.length && Array.isArray(js.equipes) && js.equipes.length){
                state.equipes = js.equipes.map(e=> ({ id:e.id, nome:e.nome||'EQ', descricao:'', componentes:[] }));
                console.debug('[escala][load][debug-resumo] equipes preenchidas via resumo');
                renderEquipes(); avaliarProgressaoAbas?.();
              }
            }).catch(()=>{});
        } catch(_dbg){}
        // Tentar refetch completo atrasado (pode haver condiÃ§Ã£o de gravaÃ§Ã£o incompleta instantÃ¢nea):
        setTimeout(()=>{
          if(!state.gruposTurnos.length || !state.equipes.length){
            console.debug('[escala][load][retry-refetch] tentando refetch tardio escala');
            carregarEscalaExistente(state.escalaId).catch(()=>{});
          }
        }, 2500);
      }
      // Recursos: preferir payload direto; se ausente, derivar de equipes.recursos
      state.recursos = Array.isArray(d.recursos)? d.recursos.map(r=> ({ ...r })) : [];
      if(!state.recursos.length){
        try {
          const flat = [];
          if(Array.isArray(d.equipes)){
            d.equipes.forEach(eq=>{
              const eqId = eq && (eq.id || eq._id || eq.codigo || eq.nome);
              if(Array.isArray(eq?.recursos)){
                eq.recursos.forEach(r=>{
                  // normaliza id e garante equipeId para render
                  const rid = r && (r.id || r._id || r.referenciaGestorId || r.codigo || null);
                  flat.push({ ...r, id: rid || r?.id, equipeId: r?.equipeId || eqId });
                });
              }
            });
          }
          // Varredura genÃ©rica adicional: procurar possÃ­veis coleÃ§Ãµes com nome "recursos"
          if(!flat.length){
            Object.keys(d||{}).forEach(k=>{
              if(/recurso/i.test(k) && Array.isArray(d[k])){
                d[k].forEach(r=> flat.push({ ...r }));
              }
            });
          }
          if(flat.length){ state.recursos = flat; }
        } catch(_recDerive){ /* silencioso */ }
      }
      // Fallback final: GET dedicado de recursos da escala
      if(!Array.isArray(state.recursos) || state.recursos.length===0){
        try {
          const idEsc = state.escalaId;
          if(idEsc){
            const tries = [ basePath()+`/api/escalas/${encodeURIComponent(idEsc)}/recursos`, `/api/escalas/${encodeURIComponent(idEsc)}/recursos` ];
            let lista = [];
            for(const u of tries){
              try {
                const r = await fetch(u, { credentials:'same-origin' });
                if(r && r.ok){ const js = await r.json(); const arr = (js && (js.data||js.recursos||js)) || []; if(Array.isArray(arr)){ lista = arr; break; } }
              } catch(_f){}
            }
            if(Array.isArray(lista) && lista.length){
              state.recursos = lista.map(r=> ({ ...r }));
              try { window.__ESCALA_STATE__ && (window.__ESCALA_STATE__.recursos = state.recursos.map(x=> ({...x}))); } catch(_sync){}
              try { renderRecursos(); } catch(_rend){}
            }
          }
        } catch(_fetchRec){ /* noop */ }
      }
      state.matrizAlocacao = (d.alocacao && typeof d.alocacao==='object')? d.alocacao : {};
      // Datas
      const di = d.data_inicio || d.periodo_inicio || d.periodo?.ini || null;
      const df = d.data_fim || d.periodo_fim || d.periodo?.fim || null;
      state.periodo.ini = di ? String(di).slice(0,10) : null;
      state.periodo.fim = df ? String(df).slice(0,10) : null;
      console.debug('[escala][load] periodo recebido', { di, df, ini: state.periodo.ini, fim: state.periodo.fim });
      // ResponsÃ¡vel (captura robusta)
      try {
        let respId = d.responsavel_id || d.responsavelId || d.responsavelID || d.responsavel || d.responsavel_raw || null;
        let respNome = d.responsavel_nome || d.responsavelNome || d.responsavel_nome_final || d.responsavel_nome_resolvido || null;
        // Alguns endpoints retornam somente cÃ³digo
        const respCodigo = d.responsavel_codigo || d.responsavelCodigo || null;
        // Se sÃ³ veio nome sem id, ainda exibimos o nome (id pode ser null)
        if(respNome && !respId) respId = respCodigo || null;
        if(!respNome && respCodigo) respNome = respCodigo; // nome ausente mas temos cÃ³digo
        if(respId || respNome){
          state.responsavel = { id: respId || null, nome: respNome || (respId? String(respId):'') };
        }
        // Exibe imediatamente se input jÃ¡ existir
        if(els.respNome && state.responsavel && !els.respNome.value){
          els.respNome.value = state.responsavel.nome || state.responsavel.id || '';
        }
      } catch(_respErr){ /* silencioso */ }
      state.status = d.status || 'aberta';
      state.created = true;
      // Aplicar nos campos DOM se disponÃ­veis
  if(els.descricao){ els.descricao.value = state.dadosGerais.descricao || ''; console.debug('[escala][load] descricao aplicada no input'); }
      if(!els.descricao) console.warn('[escala][load] campo descricao nÃ£o encontrado para preenchimento');
      else {
        // Marcar que descriÃ§Ã£o foi aplicada com sucesso
        state._descricaoAplicada = true;
      }
      // Se o elemento ainda nÃ£o existia na hora do load, criaremos uma rotina de retry leve
      if(!els.descricao && state.dadosGerais.descricao){
        let tent=0;
        const retryId = setInterval(()=>{
          tent++;
          const el = document.getElementById('descricaoEscala');
          if(el){ el.value = state.dadosGerais.descricao; els.descricao = el; state._descricaoAplicada = true; console.debug('[escala][load][retry-descricao] aplicado na tentativa', tent); clearInterval(retryId); return; }
          if(tent>=10){ clearInterval(retryId); console.warn('[escala][load][retry-descricao] desistiu apÃ³s', tent, 'tentativas'); }
        },120);
      }
      if(els.classificacao && state.tipo){ els.classificacao.value = state.tipo; }
      // ---------- CAPTURA DE UNIDADE (robusta) ----------
      // Backends diferentes podem devolver unidade em vÃ¡rios campos â€“ tentamos todos
      const rawUnidadeId = d.unidade_id || d.unidadeId || d.unidadeID || d.unidade || (d.unidadeObj && (d.unidadeObj.id || d.unidadeObj._id)) || (d.unidade_ref && (d.unidade_ref.id || d.unidade_ref._id));
      const rawUnidadeNome = d.unidade_nome || d.unidadeNome || (d.unidadeObj && (d.unidadeObj.nome || d.unidadeObj.descricao)) || d.unidade_descricao;
      if(rawUnidadeId){
  { const _norm=(typeof normalizeId==='function'? normalizeId : (typeof window!=='undefined' && typeof window.normalizeId==='function'? window.normalizeId : (v=>v))); state.dadosGerais.unidadeId = String(_norm(rawUnidadeId)); }
        if(rawUnidadeNome) state._unidadeNomeCarregada = rawUnidadeNome;
        console.debug('[escala][load][unidade] detectada', state.dadosGerais.unidadeId, 'nome=', state._unidadeNomeCarregada);
        // Se por algum motivo o select ainda nÃ£o foi mapeado, tenta novamente mapear aqui
        if(!els.unidade){
          els.unidade=document.getElementById('unidadeEscala')||document.getElementById('unidadeEscalaSelect')||document.querySelector('#unidade,[name="unidade"],select[name="unidadeId"],select[name="unidade_id"],select[data-field="unidade"]');
          if(els.unidade) console.debug('[escala][load][unidade] elemento select recuperado tardiamente');
        }
  try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('load-immediate'); } catch(_e){}
  try { (typeof ensureUnidadeVisual==='function' ? ensureUnidadeVisual : (window && window.ensureUnidadeVisual))?.('load-immediate'); } catch(_e){}
  // Travar como opção única assim que detectado em edição
  try { if(state && state.created) aplicarUnidadeComoOpcaoUnica('load-detect'); } catch(_ap){}
  try { (typeof iniciarEnforcerUnidade==='function' ? iniciarEnforcerUnidade : (window && window.iniciarEnforcerUnidade))?.(3500); } catch(_e){}
        // ReforÃ§os tardios (evita race com fetch de lista de unidades)
  setTimeout(()=>{ try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('load+100ms'); } catch(_e){} try { (typeof ensureUnidadeVisual==='function' ? ensureUnidadeVisual : (window && window.ensureUnidadeVisual))?.('load+100ms'); } catch(_e2){} },100);
  setTimeout(()=>{ try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('load+400ms'); } catch(_e){} try { (typeof ensureUnidadeVisual==='function' ? ensureUnidadeVisual : (window && window.ensureUnidadeVisual))?.('load+400ms'); } catch(_e2){} },400);
  setTimeout(()=>{ try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('load+1200ms'); } catch(_e){} try { (typeof ensureUnidadeVisual==='function' ? ensureUnidadeVisual : (window && window.ensureUnidadeVisual))?.('load+1200ms'); } catch(_e2){} },1200);
      } else {
        console.warn('[escala][load][unidade] nÃ£o encontrada no payload â€“ campos disponÃ­veis:', Object.keys(d||{}).filter(k=>k.toLowerCase().includes('unid')));
      }
  // (removidas chamadas antigas de seleÃ§Ã£o de unidade)
  if(els.dataInicio && state.periodo.ini){
    const toBr = (typeof dateISOToBr==='function' ? dateISOToBr : (typeof window!=='undefined' && typeof window.dateISOToBr==='function' ? window.dateISOToBr : (v=>v)));
    els.dataInicio.value = toBr(state.periodo.ini);
    try { if(els.dataInicio._flatpickr){ els.dataInicio._flatpickr.setDate(state.periodo.ini, true, 'Y-m-d'); } } catch(_fp){}
    console.debug('[escala][load] dataInicio aplicada');
  }
  if(els.dataFim && state.periodo.fim){
    const toBr = (typeof dateISOToBr==='function' ? dateISOToBr : (typeof window!=='undefined' && typeof window.dateISOToBr==='function' ? window.dateISOToBr : (v=>v)));
    els.dataFim.value = toBr(state.periodo.fim);
    try { if(els.dataFim._flatpickr){ els.dataFim._flatpickr.setDate(state.periodo.fim, true, 'Y-m-d'); } } catch(_fp){}
    console.debug('[escala][load] dataFim aplicada');
  }
  if(els.respNome && state.responsavel){ els.respNome.value = state.responsavel.nome || state.responsavel.id; }
      // Retry para datas/responsÃ¡vel se campos ainda nÃ£o mapeados
      (function retryCamposGerais(){
        const pendentes = [];
        if(!els.dataInicio && state.periodo.ini) pendentes.push('dataInicio');
        if(!els.dataFim && state.periodo.fim) pendentes.push('dataFim');
        if(!els.respNome && state.responsavel?.nome) pendentes.push('respNome');
        if(!pendentes.length) return;
        let tent=0; const id=setInterval(()=>{
          tent++;
            if(!els.dataInicio && state.periodo.ini){ const ei=document.getElementById('dataInicio'); if(ei){ els.dataInicio=ei; const toBr = (typeof dateISOToBr==='function' ? dateISOToBr : (typeof window!=='undefined' && typeof window.dateISOToBr==='function' ? window.dateISOToBr : (v=>v))); ei.value=toBr(state.periodo.ini); try{ if(ei._flatpickr){ ei._flatpickr.setDate(state.periodo.ini, true, 'Y-m-d'); } } catch(_fp){} } }
            if(!els.dataFim && state.periodo.fim){ const ef=document.getElementById('dataFim'); if(ef){ els.dataFim=ef; const toBr = (typeof dateISOToBr==='function' ? dateISOToBr : (typeof window!=='undefined' && typeof window.dateISOToBr==='function' ? window.dateISOToBr : (v=>v))); ef.value=toBr(state.periodo.fim); try{ if(ef._flatpickr){ ef._flatpickr.setDate(state.periodo.fim, true, 'Y-m-d'); } } catch(_fp){} } }
            if(!els.respNome && state.responsavel?.nome){ const rn=document.getElementById('responsavelNome'); if(rn){ els.respNome=rn; rn.value=state.responsavel.nome||state.responsavel.id; } }
          if((els.dataInicio||!state.periodo.ini) && (els.dataFim||!state.periodo.fim) && (els.respNome||!state.responsavel?.nome)){ clearInterval(id); console.debug('[escala][load][retry-campos] finalizado em', tent,'tentativas'); }
          if(tent>=12){ clearInterval(id); }
        },130);
      })();
      // RenderizaÃ§Ãµes
  try { renderGruposTurnos(); } catch(e){ console.warn('[escala][load] renderGruposTurnos falhou', e); }
  try { renderEquipes(); } catch(e){ console.warn('[escala][load] renderEquipes falhou', e); }
  try { renderRecursos(); } catch(e){ console.warn('[escala][load] renderRecursos falhou', e); }
  try { renderMatrizesPorGrupo(); } catch(e){ console.warn('[escala][load] renderMatrizesPorGrupo falhou', e); }
      if(typeof avaliarProgressaoAbas==='function') avaliarProgressaoAbas(); else console.warn('[escala][load] avaliarProgressaoAbas indisponÃ­vel no momento');
  if(!state.gruposTurnos.length) console.warn('[escala][load][diag] Nenhum grupo de turnos retornado');
  if(!state.equipes.length) console.warn('[escala][load][diag] Nenhuma equipe retornada');
      // Se elementos de tabela ainda nÃ£o mapeados (carregamento antecipado antes de initEscalaPage), marca para render tardia
      if(!els.tblGrupos || !els.tblEquipes){
        state._needRenderAfterMap = true;
        console.debug('[escala][load] render adiada atÃ© mapeamento DOM');
      }
      // Overlay de diagnÃ³stico (apenas se faltando dados)
      if(!state.gruposTurnos.length || !state.equipes.length){
        try {
          let box=document.getElementById('escalaDebugBox');
          if(!box){
            box=document.createElement('div');
            box.id='escalaDebugBox';
            box.style.cssText='position:fixed;bottom:8px;left:8px;z-index:99999;background:#212529;color:#fff;padding:8px 10px;font-size:11px;border-radius:4px;max-width:320px;font-family:monospace;opacity:.9';
            document.body.appendChild(box);
          }
          const keys=Object.keys(d).join(',');
          box.innerHTML='<strong>DEBUG ESCALA</strong><br>grupos_turnos='+state.gruposTurnos.length+' equipes='+state.equipes.length+'<br>keys: '+keys+'<br><em>Veja window.__ESCALA_RAW__</em>';
        } catch(_ov){}
      }
      bloquearCamposGerais(true); // em ediÃ§Ã£o, geralmente campos gerais ficam bloqueados
      console.debug('[escala][load] escala carregada', { grupos: state.gruposTurnos.length, equipes: state.equipes.length, recursos: state.recursos.length });
      // AplicaÃ§Ã£o de bloqueio fÃ­sico redundante (hard lock) â€“ garante mesmo se funÃ§Ã£o anterior falhar
      if(state.created){
        aplicarBloqueioFisicoCamposGerais();
        setTimeout(()=>{ try { aplicarBloqueioFisicoCamposGerais(); } catch(_){} }, 400);
        setTimeout(()=>{ try { aplicarBloqueioFisicoCamposGerais(); } catch(_){} }, 1200);
      }
    } catch(e){
      console.error('[escala][load] falha carregarEscalaExistente', e);
    }
    // ReforÃ§o: se bloqueio ainda nÃ£o efetivado (stub), tentar novamente depois
    setTimeout(()=>{ try { if(state.created) bloquearCamposGerais(true); } catch(_e){} }, 300);
    setTimeout(()=>{ try { if(state.created) bloquearCamposGerais(true); } catch(_e){} }, 1200);
    // ReforÃ§o: tentar refetch/unidade apÃ³s finalizaÃ§Ã£o (caso options nÃ£o existiam ainda)
  setTimeout(()=>{ try { (typeof fetchAndPopulateUnidades==='function'? fetchAndPopulateUnidades : (window && window.fetchAndPopulateUnidades))?.(); } catch(_e){} }, 120);
    // Fallback adicional apÃ³s 2.5s
    setTimeout(()=>{ try { extremeUnidadeFallback('post-load-timeout'); } catch(_e){} }, 2500);
    // Ultra reforço: re-aplica após 2s apenas se ainda não aplicada, sem logs repetidos
    setTimeout(()=>{
      try {
  const alvo = state.dadosGerais?.unidadeId && String(state.dadosGerais.unidadeId);
  const needs = !!(alvo && els.unidade && els.unidade.value!==alvo);
  if(needs){ ensureUnidadeFinal('late-check'); }
      } catch(_e){}
    },2000);
    // Bloco removido: cÃ³digo top-level invÃ¡lido (await fora de funÃ§Ã£o) que impedia execuÃ§Ã£o do restante do script.
    // Libera o guard de reentrância (em qualquer cenário)
    try { if(window.__ESCALA_LOAD_IN_FLIGHT__){ const key = 'ESC@'+String(id||state.escalaId||'').trim(); window.__ESCALA_LOAD_IN_FLIGHT__.delete(key); } } catch(_e){}
  }
  function aplicarBloqueioFisicoCamposGerais(){
    const seletorIds = ['classificacaoEscala','descricaoEscala','unidadeEscala','dataInicio','dataFim','btnSelecionarResponsavel','responsavelNome'];
    let aplicados=0;
    seletorIds.forEach(id=>{
      const el=document.getElementById(id); if(!el) return;
      if(!state.created) return; // sÃ³ em ediÃ§Ã£o
      el.setAttribute('data-escala-locked','1');
      el.classList.add('escala-field-locked');
      // ReforÃ§o para input/select
      if(el.tagName==='INPUT'){
        el.setAttribute('readonly','readonly');
        el.setAttribute('disabled','disabled');
        el.addEventListener('focus', ev=> el.blur(), { once:false, capture:true });
      } else if(el.tagName==='SELECT' || el.tagName==='BUTTON'){
        el.setAttribute('disabled','disabled');
      }
      el.style.pointerEvents='none';
      aplicados++;
    });
    if(aplicados) console.debug('[escala][hard-lock] aplicado a', aplicados, 'elementos');
  // Reforço: garantir que a unidade permaneça aplicada e VISÍVEL mesmo após bloqueio
  try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('post-hard-lock'); } catch(_e){}
  try { (typeof ensureUnidadeVisual==='function' ? ensureUnidadeVisual : (window && window.ensureUnidadeVisual))?.('post-hard-lock'); } catch(_e2){}
    // Assegura que os campos de equipe nÃ£o sejam afetados por bloqueio geral
    try {
      const nomeEq = document.getElementById('nomeEquipe');
      const descEq = document.getElementById('descricaoEquipe');
      [nomeEq, descEq].forEach(el=>{
        if(!el) return;
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');
        el.style.pointerEvents='';
        el.classList.remove('escala-field-locked');
        if(el.__escalaLockHandler__){
          el.removeEventListener('keydown', el.__escalaLockHandler__, true);
          el.removeEventListener('beforeinput', el.__escalaLockHandler__, true);
          el.removeEventListener('input', el.__escalaLockHandler__, true);
          delete el.__escalaLockHandler__;
        }
      });
    } catch(_e){ }
  }
  // Chamada tardia para garantir seleÃ§Ã£o da unidade pÃ³s load
  document.addEventListener('DOMContentLoaded', ()=> setTimeout(ensureUnidadeSelectRetry, 500));
  // (retirado listener ensureUnidadeSelectRetry)
  // Expor para debug manual no console
  try { window.carregarEscalaExistente = carregarEscalaExistente; } catch(_expose){}
  // Drena chamadas diferidas enfileiradas durante o boot
  try {
    if (Array.isArray(window.__deferredCalls) && window.__deferredCalls.length) {
      const rest = [];
      for (const item of window.__deferredCalls) {
        if (item && item.fn === 'carregarEscalaExistente') {
          try { carregarEscalaExistente.apply(null, item.args || []); } catch(_call){}
        } else {
          rest.push(item);
        }
      }
      window.__deferredCalls = rest;
    }
  } catch(_drain){}
  function validarPeriodo(){ const ini=els.dataInicio.value; const fim=els.dataFim.value; if(!ini||!fim) return true; return true; }
  function ajustarDataFimSeNecessario(){
    const iniBr=els.dataInicio.value.trim();
    if(!iniBr) return;
    const fimBr=els.dataFim.value.trim();
    if(!fimBr){
      els.dataFim.value=iniBr; return;
    }
    // Converter para ISO para comparar
    const isoIni=dateBrToISO(iniBr); const isoFim=dateBrToISO(fimBr);
    if(isoIni && isoFim && isoFim < isoIni){
      els.dataFim.value=iniBr; // forÃ§a alinhamento
    }
  }
  // Utilidades de data (padrÃ£o mÃ³dulo Gestor) -> UI em dd/mm/aaaa, estado em ISO yyyy-mm-dd
  function dateBrToISO2(v){ if(!v) return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim()); if(!m) return ''; const dd=+m[1], mm=+m[2], yyyy=+m[3]; if(mm<1||mm>12||dd<1||dd>31||yyyy<1900||yyyy>2100) return ''; const dt=new Date(yyyy,mm-1,dd); if(dt.getFullYear()!==yyyy||dt.getMonth()!==mm-1||dt.getDate()!==dd) return ''; return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`; }
  function dateISOToBr2(v){ if(!v) return ''; const iso=String(v).trim(); const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/); if(!m){ if(/^(\d{2})\/(\d{2})\/(\d{4})$/.test(iso)) return iso; return ''; } return `${m[3]}/${m[2]}/${m[1]}`; }
  function normalizarDatasPeriodoParaEstado2(){ const brIni=els.dataInicio.value.trim(); const brFim=els.dataFim.value.trim(); const isoIni=dateBrToISO(brIni); const isoFim=dateBrToISO(brFim); if((brIni && !isoIni)||(brFim && !isoFim)) throw new Error('Datas em formato invÃ¡lido (use dd/mm/aaaa).'); if(isoIni && isoFim && isoFim < isoIni) throw new Error('Data fim menor que data inÃ­cio.'); state.periodo.ini=isoIni||null; state.periodo.fim=isoFim||null; }
  function coletarDadosGerais(){
    normalizarDatasPeriodoParaEstado();
    if(!state.tipo && els.classificacao?.value){ state.tipo = els.classificacao.value.trim(); }
    state.dadosGerais={
      classificacao: state.tipo,
      descricao: (els.descricao?.value||'').trim(),
      unidadeId: els.unidade?.value||null,
      responsavelId: state.responsavel?.id||null
    };
  }
function __fmtTurno(t){
  const ini = t?.ini || t?.inicio || t?.start || t?.hora_inicio || t?.horaInicio || t?.hi || '';
  const fim = t?.fim || t?.termino || t?.end || t?.hora_fim || t?.horaFim || t?.hf || '';
  return { ini, fim };
}
function renderGruposTurnos(){
  // Helper para garantir que pegamos a tabela visível na aba Turnos
  function __getTurnosTable(){
    try {
      const scoped = document.querySelector('#aba-turnos #tabelaGruposTurnos');
      return scoped || document.getElementById('tabelaGruposTurnos');
    } catch(_e){ return document.getElementById('tabelaGruposTurnos'); }
  }
  try { state = window.__ESCALA_STATE__ || state; } catch(_s){}
  const tblNow = __getTurnosTable();
  if(!tblNow) return;
  els.tblGrupos = tblNow;
  let tbody = tblNow.querySelector('tbody'); if(!tbody){ tbody=document.createElement('tbody'); tblNow.appendChild(tbody); }
  if(!state.gruposTurnos.length){ tbody.innerHTML='<tr class="text-muted"><td colspan="2" class="text-center">Nenhum grupo cadastrado.</td></tr>'; return; }
  try { console.debug('[escala][render] renderGruposTurnos chamado, grupos=', state.gruposTurnos.length, 'grupos:', state.gruposTurnos); console.trace(); } catch(_lg){}
  tbody.innerHTML = state.gruposTurnos.map(g=>{
    const tHtml=(g.turnos||[]).length? g.turnos.map(t=>{ const f=__fmtTurno(t); return `${f.ini} - ${f.fim}`; }).join(' | '):'(sem turnos)';
  return `<tr data-id="${g.id}" title="GID: ${String(g.id).replace(/&/g,'&amp;').replace(/</g,'&lt;')}"><td class="py-1 small text-center">${tHtml}</td><td class="text-center grupos-col-acoes"><button type="button" class="btn btn-sm btn-outline-primary" data-act="edit-grupo" title="Editar"><i class="bi bi-pencil"></i></button><button type="button" class="btn btn-sm btn-outline-danger" data-act="del-grupo" title="Excluir" onclick="try{ if(window.excluirGrupoTurnoPorId){ window.excluirGrupoTurnoPorId('${String(g.id).replace(/'/g, "&#39;")}', this); return false; } }catch(_e){}"><i class="bi bi-trash"></i></button></td></tr>`; }).join('');
  // Bind local e resiliente para capturar clicks em editar/excluir dentro desta tabela
  try {
    if(!tbody.__gruposBound){
      tbody.__gruposBound = true;
      function __resolveGidFromRow(tr){
        if(!tr) return null;
        const id = tr.getAttribute && tr.getAttribute('data-id');
        if(id) return id;
        try {
          // tentar inferir pelo texto dos turnos
          const td = tr.querySelector('td');
          const text = (td && td.textContent || '').trim();
          if(!text) return null;
          // normaliza "HH:MM - HH:MM | HH:MM - HH:MM"
          const parts = text.split('|').map(s=> s.trim()).filter(Boolean);
          const norm = parts.map(p=> p.replace(/\s+/g,'').replace(/–|—/g,'-')).sort().join('|');
          const lista = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.gruposTurnos) || [];
          for(const g of lista){
            const tHtml = (Array.isArray(g.turnos)? g.turnos:[]).map(t=>{ const f=__fmtTurno(t); return (f.ini||'')+'-'+(f.fim||''); }).sort().join('|');
            if(tHtml === norm) return g.id;
          }
        } catch(_i){}
        return null;
      }
      tbody.addEventListener('click', function(ev){
        const btn = ev.target && ev.target.closest ? (ev.target.closest('button[data-act]') || ev.target.closest('[title="Excluir"]') || ev.target.closest('.bi-trash') || ev.target.closest('button')) : null;
        if(!btn) return;
        const actAttr = btn.getAttribute && btn.getAttribute('data-act');
        const title = btn.getAttribute && btn.getAttribute('title');
        const isDel = (actAttr==='del-grupo') || (title && /excluir/i.test(title)) || (btn.classList && btn.classList.contains('bi-trash'));
        const isEdit = (actAttr==='edit-grupo') || (title && /editar/i.test(title));
        const act = isDel? 'del-grupo' : (isEdit? 'edit-grupo' : actAttr);
        if(act!=='edit-grupo' && act!=='del-grupo') return;
        const tr = btn.closest('tr');
        let gid = tr && (tr.getAttribute && tr.getAttribute('data-id'));
        if(!gid){ gid = __resolveGidFromRow(tr); }
        if(!gid) return;
        if(act==='edit-grupo'){
          try {
            // Localiza o grupo atual e abre o popup
            const lista = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.gruposTurnos) || [];
            const grupo = lista.find(g=> String(g && (g.id||g._id||g.id_grupo)) === String(gid));
            if(grupo && typeof window.abrirPopupTurnos==='function') return window.abrirPopupTurnos(grupo);
            if(grupo && typeof window.openPopupTurnos==='function') return window.openPopupTurnos(grupo);
          } catch(_e){ /* no-op */ }
        } else if(act==='del-grupo'){
          try {
            if(typeof window.__askDeleteGrupoTurno==='function') return window.__askDeleteGrupoTurno(gid, btn, ev);
            if(confirm('Excluir este grupo de turnos?')){ if(typeof window.excluirGrupoTurnoPorId==='function') return window.excluirGrupoTurnoPorId(gid, btn); }
          } catch(_d){ /* no-op */ }
        }
      }, true);
    }
  } catch(_bind){ /* ignora */ }
  // Varredura direta para anexar onclick em ícones/links de exclusão que não tenham data-act
  try {
    function __attachDirectDeleteHandlers(scope){
      const root = scope || (document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos'));
      if(!root) return;
      const rows = root.querySelectorAll('tbody tr');
      rows.forEach(tr=>{
        const gid = tr.getAttribute && tr.getAttribute('data-id');
        const cand = tr.querySelectorAll('a,button,img,i,svg,use');
        cand.forEach(el=>{
          if(el.__delBound) return;
          const title = (el.getAttribute && (el.getAttribute('title')||'')) || '';
          const alt = (el.getAttribute && (el.getAttribute('alt')||'')) || '';
          const src = (el.getAttribute && (el.getAttribute('src')||'')) || '';
          const cls = (el.className||'')+'';
          const looksTrash = /trash|lixeira|excluir|delete|remover/i.test(title+alt+src+cls);
          if(!looksTrash) return;
          el.__delBound = true;
          el.addEventListener('click', (ev)=>{
            try{
              ev.preventDefault(); ev.stopPropagation();
              let targetGid = gid;
              if(!targetGid){
                const td = tr.querySelector('td');
                const text = (td && td.textContent || '').trim();
                if(text){
                  const norm = text.split('|').map(s=> s.trim()).map(p=> p.replace(/\s+/g,'').replace(/–|—/g,'-')).sort().join('|');
                  const lista = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.gruposTurnos) || [];
                  for(const g of lista){
                    const tHtml = (Array.isArray(g.turnos)? g.turnos:[]).map(t=>{ const f=__fmtTurno(t); return (f.ini||'')+'-'+(f.fim||''); }).sort().join('|');
                    if(tHtml === norm){ targetGid = g.id; break; }
                  }
                }
              }
              if(!targetGid) return;
              if(typeof window.__askDeleteGrupoTurno==='function') return window.__askDeleteGrupoTurno(targetGid, el, ev);
              if(!confirm('Excluir este grupo de turnos?')) return;
              console.log('[escala][grupos] clique excluir (direct attach), gid=', targetGid);
              if(typeof window.excluirGrupoTurnoPorId==='function') window.excluirGrupoTurnoPorId(targetGid, el);
            }catch(_e){ /* noop */ }
          }, true);
        });
      });
    }
    __attachDirectDeleteHandlers();
    // Repetir por alguns ciclos para cobrir renders assíncronos
    let __tries=0; const __tm = setInterval(()=>{ try { __attachDirectDeleteHandlers(); } catch(_){} if(++__tries>10) clearInterval(__tm); }, 200);
  } catch(_att){ /* noop */ }
}

// Atualiza grupos de turnos a partir do servidor (com debounce para evitar mÃºltiplas chamadas)
let __refreshTurnosTimer = null; let __refreshTurnosInFlight = false; let __refreshTurnosPending = false; let __refreshTurnosLastSig = null;
function __makeGruposSig(grupos){
  try{
    if(!Array.isArray(grupos)) return 'nogrupos';
    const norm = grupos.map(g=>({
      id: String(g.id||g._id||g.codigo||''),
      turnos: (Array.isArray(g.turnos)? g.turnos: (Array.isArray(g.turnos_simples)? g.turnos_simples: [])).map(t=>{
        const f = __fmtTurno(t);
        return { ini: f.ini||'', fim: f.fim||'' };
      }).filter(t=> t.ini && t.fim).sort((a,b)=> (a.ini+a.fim).localeCompare(b.ini+b.fim))
    })).sort((a,b)=> a.id.localeCompare(b.id));
    const parts = norm.map(g=> `${g.id}:${g.turnos.length}:${g.turnos.map(t=> t.ini+'-'+t.fim).join('|')}`);
    return `${norm.length}::${parts.join('||')}`;
  }catch(_){ return 'sigerr'; }
}
// Normaliza estrutura de turnos aceitando mÃºltiplas chaves possÃ­veis
function __toTurnos(arr){
  if(!Array.isArray(arr)) return [];
  return arr.map(t=>{
    const ini = t?.ini || t?.inicio || t?.inicioStr || t?.start || t?.hora_inicio || t?.horaInicio || t?.ini_hora || t?.inicioHora || t?.hi || '';
    const fim = t?.fim || t?.termino || t?.fimStr || t?.end || t?.hora_fim || t?.horaFim || t?.fim_hora || t?.fimHora || t?.hf || '';
    return { ini, fim };
  }).filter(t=> t.ini && t.fim);
}
// Mapeia um grupo em formato canÃ´nico { id, turnos }
function __mapGrupo(g){
  if(!g || typeof g!== 'object') return { id: undefined, turnos: [] };
  const id = g.id || g._id || g.id_grupo || g.codigo || g.codigo_grupo || g.groupId || g.gid || g.identificador || ('g'+Math.random().toString(36).slice(2,10));
  const fonteTurnos = g.turnos || g.turnos_simples || g.horarios || g.faixas || g.faixas_horarias || [];
  return { id, turnos: __toTurnos(fonteTurnos) };
}
// Extrai grupos de turnos de um payload potencialmente inconsistente/profundo
function __extractGruposFromPayload(d, escalaId){
  try {
    let grupos = [];
    let source = 'desconhecido';
    const fallbackId = (typeof state!=='undefined' && state.gruposTurnos?.[0]?.id) || ('g'+Math.random().toString(36).slice(2,10));

    // Casos diretos conhecidos
    if(d && typeof d==='object'){
      if(Array.isArray(d.grupos_turnos)){ grupos = d.grupos_turnos.map(__mapGrupo); source='grupos_turnos'; }
      else if(Array.isArray(d.gruposTurnos)){ grupos = d.gruposTurnos.map(__mapGrupo); source='gruposTurnos'; }
      else if(Array.isArray(d.grupos)){ grupos = d.grupos.map(__mapGrupo); source='grupos'; }
      else if(Array.isArray(d.turnos_simples)){ grupos = [{ id: fallbackId, turnos: __toTurnos(d.turnos_simples) }]; source='turnos_simples'; }
      else if(Array.isArray(d.turnos)){ grupos = [{ id: fallbackId, turnos: __toTurnos(d.turnos) }]; source='turnos'; }
    }

    // Se ainda nÃ£o achou, tratar top-level array
    if(!grupos.length && Array.isArray(d)){
      const esc = d.find(x=> (x && (x._id||x.id)) && String(x._id||x.id) === String(escalaId)) || d[0];
      const sub = __extractGruposFromPayload(esc, escalaId);
      grupos = sub.grupos; source = 'array:'+sub.source;
    }

    // Busca profunda: 1-2 nÃ­veis
    if(!grupos.length && d && typeof d==='object'){
      for(const k of Object.keys(d)){
        const v = d[k];
        if(Array.isArray(v)){
          if(v.length){
            if(typeof v[0] === 'object'){
              const looksLikeGrupos = v.some(it => Array.isArray(it?.turnos) || Array.isArray(it?.turnos_simples) || Array.isArray(it?.horarios) || Array.isArray(it?.faixas) || Array.isArray(it?.faixas_horarias));
              if(looksLikeGrupos){ grupos = v.map(__mapGrupo); source = 'deep:'+k; break; }
              const looksLikeTurnos = !!(v[0]?.ini || v[0]?.inicio || v[0]?.start || v[0]?.hora_inicio || v[0]?.horaInicio || v[0]?.fim || v[0]?.termino || v[0]?.end || v[0]?.hora_fim || v[0]?.horaFim);
              if(looksLikeTurnos){ grupos = [{ id: fallbackId, turnos: __toTurnos(v) }]; source = 'deep-turnos:'+k; break; }
            }
          }
        } else if(v && typeof v === 'object'){
          const sub = __extractGruposFromPayload(v, escalaId);
          if(sub.grupos.length){ grupos = sub.grupos; source = 'deepObj:'+k+'/'+sub.source; break; }
        }
      }
    }

    if(!Array.isArray(grupos)) grupos = [];
    return { grupos, source };
  } catch(_e){ return { grupos: [], source: 'erro' }; }
}
async function refreshTurnosFromServer(opts){
  const options = Object.assign({ silent:true, ensureChange:false, maxTries:7, _try:0 }, opts||{});
  if(__refreshTurnosInFlight){ __refreshTurnosPending = true; return; } // agenda outra rodada ao final
  __refreshTurnosInFlight = true;
  console.debug('[escala][turnos] refreshTurnosFromServer chamado');
  try {
    // Resolver id da escala
    let escalaId = null;
    try { if(state?.escalaId) escalaId = state.escalaId; } catch(_){ }
    if(!escalaId){ try { if(window.__ESCALA_STATE__?.escalaId) escalaId = window.__ESCALA_STATE__.escalaId; } catch(_){ } }
    if(!escalaId){ try { const u=new URL(window.location.href); escalaId=u.searchParams.get('id')||escalaId; } catch(_){ } }
    if(!escalaId){ try { const hid=document.querySelector('#escalaId,[name="escalaId"],[name="idEscala"]'); escalaId = hid && (hid.value||hid.getAttribute('value')); } catch(_){ } }
    if(!escalaId){ __refreshTurnosInFlight=false; console.debug('[escala][turnos] refreshTurnosFromServer: escalaId nÃ£o encontrado'); return; }
    console.debug('[escala][turnos] refreshTurnosFromServer: escalaId=', escalaId);
    const bp = (typeof basePath==='function')? basePath(): (window._bpDash||'/escalas');
    let url = bp+`/api/escalas/${encodeURIComponent(escalaId)}`;
    console.debug('[escala][turnos] refreshTurnosFromServer: fetch url=', url);
  // Adiciona cache-buster e no-store para evitar dados antigos
  const cacheBust = (url.indexOf('?')>-1? '&':'?')+`_ts=${Date.now()}`;
  let res = await fetch(url+cacheBust, { credentials:'same-origin', cache:'no-store', headers:{ 'Cache-Control':'no-cache' } });
    console.debug('[escala][turnos] refreshTurnosFromServer: fetch response ok=', res.ok, 'status=', res.status);
    if(!res.ok){
      try {
        // Tenta rota raiz como fallback
        url = `/api/escalas/${encodeURIComponent(escalaId)}`;
        console.debug('[escala][turnos] refreshTurnosFromServer: tentando fallback url=', url);
  res = await fetch(url+cacheBust, { credentials:'same-origin', cache:'no-store', headers:{ 'Cache-Control':'no-cache' } });
        console.debug('[escala][turnos] refreshTurnosFromServer: fallback response ok=', res.ok, 'status=', res.status);
      } catch(_fb){}
    }
    if(!res.ok){
      // fallback: mantÃ©m UI coerente com estado atual
      try { renderGruposTurnos(); } catch(_r0){}
      __refreshTurnosInFlight=false; return;
    }
    let d = await res.json().catch(()=>null);
    console.debug('[escala][turnos] refreshTurnosFromServer: response data=', d);
  if(!d){ try { renderGruposTurnos(); } catch(_r1){} __refreshTurnosInFlight=false; return; }
    // Desembrulhar formatos comuns { ok, data }, { escala }, etc.
    try {
      if(d && typeof d==='object'){
        if(d.data && typeof d.data==='object'){ d = d.data; }
        else if(d.escala && typeof d.escala==='object'){ d = d.escala; }
        else if(d.result && typeof d.result==='object'){ d = d.result; }
      }
      // Alguns backends retornam { data: { data: {...} } }
      if(d && d.data && typeof d.data==='object' && (d.data.grupos_turnos || d.data.gruposTurnos || d.data.turnos_simples)){
        d = d.data;
      }
    } catch(_unwrap){}
  // Mapear para state.gruposTurnos aceitando chaves alternativas (com busca profunda)
  const extr = __extractGruposFromPayload(d, escalaId);
  let grupos = extr.grupos;
  console.debug('[escala][turnos] grupos mapeados:', Array.isArray(grupos)? grupos.length:0, '(fonte='+extr.source+')');
    const newSig = __makeGruposSig(grupos);
    const prevSig = __refreshTurnosLastSig;
    const prevLen = Array.isArray(state?.gruposTurnos) ? state.gruposTurnos.length : 0;
    // DiagnÃ³stico detalhado
    try { console.debug('[escala][turnos] prevLen=', prevLen, 'newLen=', Array.isArray(grupos)?grupos.length:0, 'ensureChange=', !!options.ensureChange, 'sigChanged=', (prevSig!==null && newSig!==prevSig)); } catch(_d){}
    // ProteÃ§Ã£o: se ensureChange e o payload vier vazio mas jÃ¡ temos itens na tela, nÃ£o destrua a UI; agende nova tentativa
    if(options.ensureChange && prevLen>0 && Array.isArray(grupos) && grupos.length===0){
      const nextTry = options._try + 1;
      const waitMs = Math.min(180 + (nextTry*130), 900);
      try { console.warn('[escala][turnos] payload vazio temporÃ¡rio detectado; preservando lista atual e re-tentando em', waitMs, 'ms (', nextTry,'/', options.maxTries, ')'); } catch(_w){}
      if(nextTry <= options.maxTries){
        setTimeout(()=>{ try{ refreshTurnosFromServer(Object.assign({}, options, { _try: nextTry })); }catch(_rt){} }, waitMs);
      }
      return; // mantÃ©m state.gruposTurnos atual
    }
    // ProteÃ§Ã£o: se ensureChange e assinatura nÃ£o mudou, nÃ£o sobrescrever a UI com snapshot antigo; apenas re-tentar
    if(options.ensureChange && prevSig !== null && newSig === prevSig){
      const nextTry = options._try + 1;
      const waitMs = Math.min(220 + (nextTry*110), 900);
      try { console.debug('[escala][turnos] assinatura inalterada; mantendo UI atual e re-tentando em', waitMs, 'ms (', nextTry,'/', options.maxTries, ')'); } catch(_l){}
      if(nextTry <= options.maxTries){
        setTimeout(()=>{ try{ refreshTurnosFromServer(Object.assign({}, options, { _try: nextTry })); }catch(_rt){} }, waitMs);
      }
      return; // nÃ£o atualiza state/render
    }
    try { window.__ESCALA_SIG__ = newSig; } catch(_){ }
    // Sempre atualiza estado/DOM imediatamente
  __refreshTurnosLastSig = newSig;
  state.gruposTurnos = grupos;
    try { window.__ESCALA_STATE__ = state; } catch(_){ }
  renderGruposTurnos();
  console.debug('[escala][turnos] refreshTurnosFromServer: renderGruposTurnos chamado');
    try { document.dispatchEvent(new CustomEvent('escala:turnos:atualizados', { detail: { grupos, sig:newSig } })); } catch(_e){}
    // ensureChange jÃ¡ tratado acima; se chegou aqui Ã© porque houve mudanÃ§a ou ensureChange nÃ£o estÃ¡ ativo
  } catch(_err){ console.debug('[escala][turnos] refreshTurnosFromServer: erro=', _err); }
  finally {
    __refreshTurnosInFlight=false;
    if(__refreshTurnosPending){
      __refreshTurnosPending=false;
      setTimeout(()=>{ try { refreshTurnosFromServer({ silent:true }); } catch(_rloop){} }, 60);
    }
  }
}
function refreshTurnosDebounced(){
  console.debug('[escala][turnos] refreshTurnosDebounced chamado');
  clearTimeout(__refreshTurnosTimer);
  __refreshTurnosTimer = setTimeout(()=>{ 
    console.debug('[escala][turnos] refreshTurnosDebounced timeout executando refreshTurnosFromServer');
    refreshTurnosFromServer({ silent:true }); 
  }, 150);
}
try { if(!window.refreshTurnosFromServer) window.refreshTurnosFromServer = refreshTurnosFromServer; } catch(_g){}
try { if(!window.refreshTurnosDebounced) window.refreshTurnosDebounced = refreshTurnosDebounced; } catch(_g){}
// Safe UI refresh: re-render imediato + tentativa de buscar do servidor
function safeRefreshTurnosUI(opts){
  try { console.debug('[escala][turnos] safeRefreshTurnosUI acionado', opts||{}); } catch(_l){}
  try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_r1){}
  try { if(typeof window.forceRepaintTurnosList==='function') window.forceRepaintTurnosList(); } catch(_r2){}
  try { if(typeof window.renderMatrizesPorGrupo==='function') window.renderMatrizesPorGrupo(); } catch(_r3){}
  try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_r4){}
  // ReforÃ§o: aplicar Ãºltima atualizaÃ§Ã£o otimista, se existir
  try { if(window.__LAST_SAVED_GRUPO_ID__ && window.__LAST_SAVED_TURNOS__) updateTurnosRowDOM(window.__LAST_SAVED_GRUPO_ID__, window.__LAST_SAVED_TURNOS__); } catch(_op){}
  try {
    if(typeof window.refreshTurnosFromServer==='function'){
      window.refreshTurnosFromServer(Object.assign({ silent:true, ensureChange:true }, opts||{}));
    }
  } catch(_rfs){}
  // reforÃ§os temporizados
  setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){ } }, 120);
  setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){ } }, 500);
}
try { if(!window.refreshTurnosUI) window.refreshTurnosUI = safeRefreshTurnosUI; } catch(_exp){}
// Atualizador dirigido por evento: atualizar sÃ³ a lista quando 'turnoAtualizado' for disparado
try {
  document.addEventListener('turnoAtualizado', ()=>{
    try { 
      // Aplicar imediatamente a Ãºltima alteraÃ§Ã£o otimista, se disponÃ­vel
      if(window.__LAST_SAVED_GRUPO_ID__ && window.__LAST_SAVED_TURNOS__){
        try { updateTurnosRowDOM(window.__LAST_SAVED_GRUPO_ID__, window.__LAST_SAVED_TURNOS__); } catch(_d){}
      }
      safeRefreshTurnosUI(); 
    } catch(_sf){}
  });
} catch(_e){}
// ReforÃ§o: repintar linha/grade de turnos sem depender do ciclo completo
function forceRepaintTurnosList(gid){
  try {
    const tbl = (function(){
      try { return document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos'); } catch(_){ return document.getElementById('tabelaGruposTurnos'); }
    })();
    if(!tbl) return;
    const tbody = tbl.querySelector('tbody');
    if(!tbody) return;
    const lista = (typeof state!=='undefined' && Array.isArray(state.gruposTurnos)) ? state.gruposTurnos : ((window.__ESCALA_STATE__ && window.__ESCALA_STATE__.gruposTurnos) || []);
    if(!Array.isArray(lista) || !lista.length){ tbody.innerHTML='<tr class="text-muted"><td colspan="2" class="text-center">Nenhum grupo cadastrado.</td></tr>'; return; }
    const g = lista.find(x=> String(x && (x.id||x._id||x.id_grupo)) === String(gid));
    if(!g){
      // Se nÃ£o encontrou, repinta tudo
      els.tblGrupos = tbl; renderGruposTurnos(); return;
    }
  const tHtml = (Array.isArray(g.turnos) && g.turnos.length) ? g.turnos.map(t=>{ const f=__fmtTurno(t); return `${f.ini} - ${f.fim}`; }).join(' | ') : '(sem turnos)';
    let tr = tbody.querySelector(`tr[data-id="${g.id}"]`);
    if(!tr){
      // Se nÃ£o houver a linha (novo grupo), re-renderiza completo para inserir corretamente
      els.tblGrupos = tbl; renderGruposTurnos();
    } else {
      const td = tr.querySelector('td'); if(td) td.innerHTML = tHtml;
      try { tr.classList.add('table-success'); setTimeout(()=> tr.classList.remove('table-success'), 1000); } catch(_h){}
    }
    // Sinaliza atualizaÃ§Ã£o
    try { document.dispatchEvent(new CustomEvent('escala:turnos:atualizados', { detail: { grupos: lista, grupoId: g.id } })); } catch(_e){}
  } catch(_err){ /* noop */ }
}
// Atualiza diretamente a linha do grupo alvo com os turnos informados
function updateTurnosRowDOM(grupoId, turnos){
  try {
    const tbl = (function(){
      try { return document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos'); } catch(_){ return document.getElementById('tabelaGruposTurnos'); }
    })();
    if(!tbl) return;
    const tbody = tbl.querySelector('tbody'); if(!tbody) return;
    const tr = tbody.querySelector(`tr[data-id="${grupoId}"]`);
    const tHtml = (Array.isArray(turnos) && turnos.length) ? turnos.map(t=>{ const f=__fmtTurno(t); return `${f.ini} - ${f.fim}`; }).join(' | ') : '(sem turnos)';
    if(tr){
      const td = tr.querySelector('td'); if(td) td.innerHTML = tHtml;
      try { tr.classList.add('table-success'); setTimeout(()=> tr.classList.remove('table-success'), 1000); } catch(_h){}
    }
    try { console.log('[escala][turnos] updateTurnosRowDOM', { grupoId, found: !!tr, tHtmlLen: tHtml.length }); } catch(_log){}
  } catch(_e){}
}
  // DefiniÃ§Ã£o (reintroduzida) chamada em diversos pontos para montar a matriz de alocaÃ§Ã£o por grupos
  function aplicarRestricoesInputsMatriz(){
  const inputs=[...els.matrizWrap.querySelectorAll('input.matriz-input')];
  inputs.forEach(inp=>{
    inp.addEventListener('input',()=>{
      let v=inp.value.toUpperCase();
      // MantÃ©m somente A-Z,0-9 e vÃ­rgula
      v=v.replace(/[^A-Z0-9,]/g,'');
      // Remove vÃ­rgulas duplicadas seguidas
      v=v.replace(/,{2,}/g,',');
v=v.replace(/^,+/,'');                // vÃ­rgula no comeÃ§o
// NÃƒO removemos vÃ­rgula no final para permitir continuar digitando outra equipe
      inp.value=v;
      // Ao editar, limpar estados de erro
      inp.classList.remove('is-invalid');
      inp.removeAttribute('title');
    });
    inp.addEventListener('blur', ()=>{
      const valor = inp.value.trim();
      if(!valor) return;
      const equipes = valor.split(',').map(e => e.trim().toUpperCase()).filter(Boolean);
      const invalidas = equipes.filter(eq => !state.equipes.some(e => (e.nome || '').toUpperCase() === eq));
      if(invalidas.length > 0){
        alert('Equipe inexistente: ' + invalidas.join(', '));
        inp.classList.add('is-invalid');
        inp.setAttribute('title', 'Equipe inexistente: ' + invalidas.join(', '));
      } else {
        inp.classList.remove('is-invalid');
        inp.removeAttribute('title');
      }
    });
    inp.setAttribute('autocomplete','off');
    inp.setAttribute('spellcheck','false');
    inp.maxLength=50; // limite defensivo
  });
}
  function onClickMatrizDetalhe(e){
    console.log('[debug] onClickMatrizDetalhe chamado com e.target:', e.target, 'e:', e);
    const item=e.target.closest('.matriz-eq-item');
    console.log('[debug] item encontrado:', item);
    if(!item) return;
    const td=item.closest('td[data-key]');
    console.log('[debug] td encontrado:', td);
    const key=td?.getAttribute('data-key'); // formato: grupoId::HH:MM-HH:MM|YYYY-MM-DD
    console.log('[debug] key extraÃ­do:', key);
    const nome=item.getAttribute('data-eqnome');
    console.log('[debug] nome da equipe:', nome);
    if(!key || !nome) return;
    try {
      const [turnoFull, dataISO] = key.split('|');
      console.log('[debug] turnoFull:', turnoFull, 'dataISO:', dataISO);
      const [grupoId, faixa] = turnoFull.split('::');
      console.log('[debug] grupoId:', grupoId, 'faixa:', faixa);
      const [turnoIni, turnoFim] = (faixa||'').split('-');
      console.log('[debug] turnoIni:', turnoIni, 'turnoFim:', turnoFim);
      const equipe = state.equipes.find(eq=> eq.nome === nome);
      console.log('[debug] equipe encontrada:', equipe);
      if(!equipe) return;
      // Fetch the EJS modal content
      const url = basePath() + `/modal-detalhamento-equipe-dias?equipeId=${encodeURIComponent(equipe.id)}&dataISO=${encodeURIComponent(dataISO)}&turnoIni=${encodeURIComponent(turnoIni)}&turnoFim=${encodeURIComponent(turnoFim)}&grupoId=${encodeURIComponent(grupoId)}`;
      console.log('[debug] URL do fetch:', url);
      fetch(url, { credentials: 'same-origin' })
        .then(r => {
          console.log('[debug] fetch response:', r.status, r.ok);
          if(!r.ok) throw new Error('Failed to load modal');
          return r.text();
        })
        .then(html => {
          console.log('[debug] HTML do modal carregado, tamanho:', html.length);
          // Insert or update the modal in DOM
          let modalContainer = document.getElementById('modalDetalhamentoEquipeDiaContainer');
          if(!modalContainer){
            modalContainer = document.createElement('div');
            modalContainer.id = 'modalDetalhamentoEquipeDiaContainer';
            document.body.appendChild(modalContainer);
          }
          modalContainer.innerHTML = html;
          // Populate the modal with data
          const ctx = {
            equipe: equipe,
            equipeNome: nome,
            dataISO: dataISO,
            turnoIni: turnoIni,
            turnoFim: turnoFim,
            grupoId: grupoId
          };
          console.log('[debug] ctx para abrirModalDetalhamentoEquipeDia:', ctx);
          console.log('[debug] chamando abrirModalDetalhamentoEquipeDia...');
          // Call the function to populate and show the modal (namespaced to avoid collisions)
                  const fn = (typeof window!=='undefined' && window.__ESCALA_FUNCS__ && typeof window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia==='function' && window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia)
                    || (typeof abrirModalDetalhamentoEquipeDiaImpl==='function' && abrirModalDetalhamentoEquipeDiaImpl)
                    || (typeof window!=='undefined' && typeof window.abrirModalDetalhamentoEquipeDiaImpl==='function' && window.abrirModalDetalhamentoEquipeDiaImpl)
                    || (typeof window!=='undefined' && typeof window.abrirModalDetalhamentoEquipeDia==='function' && window.abrirModalDetalhamentoEquipeDia)
                    || null;
          try {
            if(typeof fn==='function') { fn(ctx); }
            else { console.warn('[escala][modal-det] função de abertura do modal não encontrada'); }
          } catch(err){ console.warn('falha ao abrir modal detalhamento', err); }
          console.log('[debug] abrirModalDetalhamentoEquipeDia chamada concluída');
        })
        .catch(err => {
          console.warn('Failed to load modal EJS', err);
          alert('Erro ao carregar modal de detalhamento da equipe.');
        });
    } catch(err){ console.warn('Falha ao processar clique detalhamento', err); }
  }
function renderMatrizesPorGrupo(){
  console.log('[escala][render] renderMatrizesPorGrupo v3 UNIQUE LOG start');
  state = window.__ESCALA_STATE__ || state;
  // VersÃ£o canÃ´nica com visibilidade/placeholder e sincronizaÃ§Ã£o de perÃ­odo a partir dos inputs
  const wrap = document.getElementById('matrizAlocacaoWrap') || null;
  const placeholder = document.getElementById('placeholderMatriz') || null;
  const contEl = document.getElementById('matrizAlocacao') || els.matrizWrap;
  if(!contEl) return;
  try { if(wrap) wrap.style.display='block'; } catch(_){ }
  try { if(els.dataInicio || els.dataFim) normalizarDatasPeriodoParaEstado(); } catch(_e){ }
  function showPlaceholder(msg){
    if(placeholder){ placeholder.innerHTML = `<div class="p-2 text-center">${msg}</div>`; placeholder.style.display='block'; }
    if(contEl){ contEl.style.display='none'; contEl.innerHTML=''; }
  }
  function showContent(){ if(placeholder){ placeholder.style.display='none'; } if(contEl){ contEl.style.display='block'; } }
  if(!state.periodo.ini || !state.periodo.fim){ showPlaceholder('Defina o período (Dados Gerais) para exibir a matriz.'); return; }
  // Lista de Equipes VÃ¡lidas (com componentes)
  try {
    const ul = document.getElementById('listaEquipesValidas');
    if(ul){
      const equipesValidas = (state.equipes||[]).filter(e=> Array.isArray(e.componentes) && e.componentes.length>0);
      const itens = equipesValidas.map(e=>{
        const comps=(e.componentes||[]).map(c=> c.nome||c.id).filter(Boolean);
        const title = comps.length? comps.join(', ') : '';
        return `<li class="list-group-item d-flex justify-content-between align-items-center">
                  <span title="${title.replace(/"/g,'&quot;')}">${e.nome} ${e.descricao? ' - '+e.descricao: ''}</span>
                  <span class="badge bg-secondary rounded-pill" title="Qtd. de componentes">${comps.length}</span>
                </li>`;
      }).join('');
  ul.innerHTML = itens || '<li class="list-group-item text-muted text-center">Nenhuma equipe válida.</li>';
    }
  } catch(_ul){}
  if(!Array.isArray(state.gruposTurnos) || !state.gruposTurnos.length){
    // Renderiza um esqueleto mÃ­nimo com cabeÃ§alho de datas para dar feedback visual
    const datasMini=(function(){
      try {
        const out=[]; const ini=String(state.periodo.ini).slice(0,10); const fim=String(state.periodo.fim).slice(0,10);
        const dt=new Date(ini+'T00:00:00'); const end=new Date(fim+'T00:00:00');
        if(isNaN(dt)||isNaN(end)) return out; let c=0; while(dt<=end && c<31){ out.push(dt.toISOString().slice(0,10)); dt.setDate(dt.getDate()+1); c++; }
        return out;
      } catch(_e){ return []; }
    })();
    // Garante visibilidade do container (por padrÃ£o vem display:none no EJS)
    try { if(placeholder) placeholder.style.display='none'; } catch(_){}
    try { contEl.style.display='block'; } catch(_){}
let html = '<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead>'+
             '<tr><th style="width:140px" class="bg-white"></th>'+
             datasMini.map(d=>`<th class="text-center align-middle bg-primary text-white" style="font-size:.7rem;width:60px;">${d.slice(8,10)}</th>`).join('')+
             '</tr></thead><tbody>'+
             `<tr><td colspan="${datasMini.length+1}" class="text-center text-muted">Nenhum grupo de turnos. Use o botão "Inserir" na aba Turnos.</td></tr>`+
             '</tbody></table></div>';
    contEl.innerHTML = html;
    // Notifica que a "matriz" (esqueleto) foi renderizada
    try { document.dispatchEvent(new CustomEvent('escala:matriz:renderizada', { detail:{ grupos: 0, dias: datasMini.length||0, skeleton:true } })); } catch(_evt){}
    return;
  }
  showContent();
  // Helpers locais se ausentes
  if(!state.matrizAlocacao) state.matrizAlocacao={};
  if(!state.diasDestrancados) state.diasDestrancados=new Set();
  const eqById = new Map();
  (state.equipes||[]).forEach(e=>{ if(e && e.id) eqById.set(e.id, e); });
  function eqIdsToNames(valor){
    if(!valor) return '';
    return valor.split(',').map(id=>{ id=id.trim(); const eq=eqById.get(id); return eq? eq.nome : id; }).filter(Boolean).join(',');
  }
  function nomesToIds(nomes){
    if(!nomes) return [];
    const nomesArr = nomes.split(/\s*,\s*/).filter(Boolean);
    const mapaNome=new Map(); (state.equipes||[]).forEach(e=>{ if(e && e.nome) mapaNome.set(e.nome.toUpperCase(), e.id); });
    return nomesArr.map(n=> mapaNome.get(n.toUpperCase()) || '').filter(Boolean);
  }
  function soData(v){ try { if(!v) return ''; const s=String(v); return s.length>=10? s.slice(0,10) : s; } catch(_){ return ''; } }
  function gerarDatas(iniISO,fimISO){
    const out=[];
    const ini = soData(iniISO);
    const fim = soData(fimISO);
    const dt = new Date(ini+'T00:00:00');
    const end= new Date(fim+'T00:00:00');
    if(isNaN(dt)||isNaN(end)) return out;
    while(dt<=end){ out.push(dt.toISOString().slice(0,10)); dt.setDate(dt.getDate()+1);} return out;
  }
  const datas = gerarDatas(state.periodo.ini, state.periodo.fim);
  if(!datas.length){ showPlaceholder('Período inválido. Ajuste as datas em Dados Gerais.'); return; }
  const colWidth = 66; // px
  let html='';
  state.gruposTurnos.forEach(grupo=>{
    const modo = (state.matrizForceRenderEdit || grupo.__modo==='edit') ? 'edit':'view';
    console.log('[escala][render] grupo:', grupo.id, 'modo calculado:', modo, 'g.__modo:', grupo.__modo);
  const turnos = Array.isArray(grupo.turnos)? grupo.turnos : [];
    html += `<div class="matriz-grupo mb-3 border rounded" data-grupo="${grupo.id}">`+
      `<div class="d-flex justify-content-between align-items-center p-2 bg-light border-bottom">`+
  (()=>{ const faixas=(turnos||[]).map(t=>`${t.ini||'?'} às ${t.fim||'?'}`).join(' - '); return `<div class="text-truncate"><strong>${faixas||'(sem turnos)'}</strong></div>`; })()+
        `<div class="btn-group btn-group-sm">`+
          `<button type="button" class="btn btn-outline-primary" data-act="grupo-modo" data-grupo="${grupo.id}" onclick="window.__escToggleFromBtn && __escToggleFromBtn(this)">${modo==='edit'?'Modo consulta':'Modo edição'}</button>`+
          (modo==='edit'? `<button type="button" class="btn btn-outline-danger" data-act="grupo-limpar" data-grupo="${grupo.id}" onclick="window.__escLimparFromBtn && __escLimparFromBtn(this)">Limpar alocações</button>`:'')+
        `</div>`+
      `</div>`;
    if(!turnos.length){ html += '<div class="p-2 small text-muted">(sem turnos)</div></div>'; return; }
    html += `<div class="table-responsive"><table class="table table-sm table-bordered mb-0 matriz-tabela"><thead>`;
    // Cabeçalho datas (dia numeral + cadeado quando fechada)
    // Persistência de destravas: prioriza backend (desbloqueios) com fallback localStorage
    function __escUnlockKey(){ try { return 'escalaUnlock:'+(state.escalaId||'novo'); } catch(_){ return 'escalaUnlock:novo'; } }
    (function __escLoadUnlock(){
      try {
        if(!(state.diasDestrancados instanceof Set)) state.diasDestrancados = new Set();
        const raw = localStorage.getItem(__escUnlockKey());
        if(raw){ const arr=JSON.parse(raw); if(Array.isArray(arr)){ arr.forEach(x=> x && state.diasDestrancados.add(String(x))); } }
      } catch(_e){}
      // Carregar desbloqueios do servidor (uma vez) quando fechada
      try {
        if(isEscalaFechada() && !state._desbloqueiosLoaded && state.escalaId){
          state._desbloqueiosLoaded = 'loading';
          fetch(basePath()+`/api/escalas/${state.escalaId}/desbloqueios`, { credentials:'same-origin' })
            .then(r=> r.ok? r.json(): null)
            .then(js=>{
              const map = (js && (js.data||js.desbloqueios)) || {};
              state.desbloqueios = (map && typeof map==='object') ? map : {};
              // Sincronizar destravas por dia para compatibilidade visual do cabeçalho
              try { Object.keys(state.desbloqueios).forEach(k=>{ if(k && !k.includes('__')) state.diasDestrancados.add(String(k)); }); } catch(_){ }
              state._desbloqueiosLoaded = true;
              try { renderMatrizesPorGrupo(); } catch(_r){}
            })
            .catch(()=>{ state._desbloqueiosLoaded = false; });
        }
      } catch(_fb){}
    })();
    function __isDiaUnlocked(d){
      try { if(state && state.desbloqueios && state.desbloqueios[String(d)]===true) return true; } catch(_){ }
      return !!(state.diasDestrancados && state.diasDestrancados.has(d));
    }
    function __isCelulaUnlocked(d, grupoId, hi, hf){
      try {
        const token = (grupoId? (String(grupoId)+'::') : '')+String(hi)+'-'+String(hf);
        const key = `${d}__${token}`;
        if(state && state.desbloqueios && state.desbloqueios[key]===true) return true;
      } catch(_){ }
      return false;
    }
    if(isEscalaFechada()){
      html += `<tr><th style="width:160px;white-space:nowrap" class="bg-white"></th>`+
        datas.map(d=>{
          const unlocked = __isDiaUnlocked(d);
          const icon = unlocked? 'destrancado.png' : 'trancado.png';
          const title = unlocked? 'Dia desbloqueado para edição' : 'Dia bloqueado; clique para destravar';
          return `<th class="text-center align-middle bg-primary text-white cadeado-dia" data-dia="${d}" data-unlocked="${unlocked?'1':'0'}" style="width:${colWidth}px;min-width:${colWidth}px;padding:.15rem .25rem;cursor:pointer;">
                    <img src="${basePath()}/images/${icon}" alt="${unlocked?'destrancado':'trancado'}" style="width:16px;height:16px;vertical-align:middle;" onerror="this.style.display='none'" />
                    <div class="dia-num" style="font-size:.7rem;line-height:1;margin-top:2px;">${d.slice(8,10)}</div>
                  </th>`;
        }).join('')+`</tr>`;
    } else {
      html += `<tr><th style="width:160px;white-space:nowrap" class="bg-white"></th>`+
        datas.map(d=>`<th class="text-center align-middle bg-primary text-white" style="width:${colWidth}px;min-width:${colWidth}px;font-size:.7rem;padding:.25rem .25rem;">${d.slice(8,10)}</th>`).join('')+`</tr>`;
    }
    // CabeÃ§alho dia da semana
html += `<tr><th class="bg-white" style="width:160px;white-space:nowrap"></th>`+datas.map(d=>{ const ds=obterDiaSemanaAbrev(d); return `<th class="text-center align-middle bg-secondary text-white" style="width:${colWidth}px;min-width:${colWidth}px;font-size:.55rem;padding:.15rem .25rem;">${ds}</th>`; }).join('')+`</tr>`;
    html += `</thead><tbody>`;
  turnos.forEach(t=>{
const hi = t.ini || t.inicio || t.start || t.horaInicio || t.hi || '';
const hf = t.fim || t.termino || t.end || t.horaFim || t.hf || '';
const faixaLabel = `${hi||'?'} às ${hf||'?'}`;
html += `<tr data-turno="${t.id||t.turnoId||''}"><td class="bg-light fw-semibold text-center" style="font-size:.65rem;white-space:nowrap;width:160px;">${faixaLabel}</td>`+datas.map(d=>{
    const key=(grupo.id+'::'+(hi||'?')+'-'+(hf||'?'))+'|'+d;
        const valor = state.matrizAlocacao[key] || '';
        if(modo==='edit'){
          const nomes = eqIdsToNames(valor);
          const locked = isEscalaFechada() && !(__isDiaUnlocked(d) || __isCelulaUnlocked(d, grupo.id, hi, hf));
          const disabledAttr = locked? 'disabled readonly title="Dia bloqueado; clique no cadeado para destravar"' : '';
          return `<td class="p-0 text-center align-middle" style="width:${colWidth}px;"><div class="w-100" style="pointer-events:auto"><input type="text" class="form-control form-control-sm text-center matriz-input matriz-input-mini" data-key="${key}" value="${nomes}" ${disabledAttr} style="font-size:.55rem;padding:.15rem .25rem;${locked? 'background:#f3f3f3;':''}" /></div></td>`;
        } else {
          const nomes = eqIdsToNames(valor);
          if(!nomes) return `<td class="text-center align-middle small" style="width:${colWidth}px;">-</td>`;
          const linhas = nomes.split(/\s*,\s*/).filter(Boolean).map(n=>`<a href=\"#\" class=\"matriz-eq-item d-block text-primary text-decoration-underline\" data-eqnome=\"${n}\" onclick=\"if(window.__escOpenDet){ return window.__escOpenDet(this, event); } console.log('[escala][inline] __escOpenDet indisponível, bloqueando navegação'); return false;\" style=\"cursor:pointer;line-height:1.05;\">${n}</a>`).join('');
          return `<td class="text-center align-middle small" data-key="${key}" style="width:${colWidth}px;">${linhas}</td>`;
        }
      }).join('')+`</tr>`;
    });
    html += `</tbody></table>`;
  if(modo==='edit') html += `<div class="form-text px-2 pb-2">Use vírgula para múltiplas equipes. Apenas letras (A-Z), números e vírgula.</div>`;
    html += `</div></div>`; // fecha matriz-grupo
  });
  contEl.innerHTML = html;
  // CSS overrides: garante que entradas fiquem clicÃ¡veis e acima de overlays acidentais
  try {
    if(!document.getElementById('escalaMatrizOverrides')){
      const st=document.createElement('style');
      st.id='escalaMatrizOverrides';
      st.textContent = `
        .matriz-grupo td{ position: relative; }
        .matriz-grupo input.matriz-input{ pointer-events:auto !important; position: relative; z-index: 5; }
        .matriz-grupo .form-control{ background-clip: padding-box; }
      `;
      document.head.appendChild(st);
    }
  } catch(_css){ }
  // Bind de toggle de cadeado por dia (apenas quando a escala está fechada)
  try {
    if(isEscalaFechada()){
      async function __persistUnlockDia(dia, desbloquear){
        try {
          if(!state.escalaId) return false;
          const url = basePath()+`/api/escalas/${state.escalaId}/desbloqueios`;
          const body = { dia: String(dia), desbloqueado: !!desbloquear };
          const r = await fetch(url, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(body) });
          if(!r.ok){ const t=await r.text().catch(()=> ''); throw new Error(t||('HTTP '+r.status)); }
          const js = await r.json().catch(()=>null);
          const map = (js && js.data) || {};
          state.desbloqueios = map;
          // Sincronizar dias destravados (compat visual)
          try {
            state.diasDestrancados = new Set(Object.keys(map).filter(k=> k && !k.includes('__')));
            // persistência local apenas para fallback visual
            const arr=[...state.diasDestrancados]; localStorage.setItem(__escUnlockKey(), JSON.stringify(arr));
          } catch(_sync){}
          return true;
        } catch(e){ console.warn('[escala][unlock-dia] falha', e); return false; }
      }
      contEl.querySelectorAll('th.cadeado-dia[data-dia]').forEach(th=>{
        th.addEventListener('click', (ev)=>{
          try {
            const dia = th.getAttribute('data-dia'); if(!dia) return;
            const unlocked = __isDiaUnlocked(dia);
            const agora = new Date(); const hojeISO = agora.toISOString().slice(0,10);
            // Regras: permitir destravar hoje e futuro; bloquear passado
            if(!unlocked && dia < hojeISO){
              alert('Não é possível destravar dias passados.');
              return;
            }
            if(unlocked){
              if(confirm('Re-bloquear este dia? Os campos voltarão a ficar somente leitura.')){
                __persistUnlockDia(dia, false).then(ok=>{ if(ok && typeof renderMatrizesPorGrupo==='function') renderMatrizesPorGrupo(); });
              }
            } else {
              if(confirm('Desbloquear este dia para edição?')){
                __persistUnlockDia(dia, true).then(ok=>{ if(ok && typeof renderMatrizesPorGrupo==='function') renderMatrizesPorGrupo(); });
              }
            }
          } catch(_e){ console.warn('[escala][unlock] falha toggle', _e); }
        }, { once:false });
      });
    }
  } catch(_bindLock){}
  // Bind detalhamento clique
  contEl.querySelectorAll('.matriz-eq-item').forEach(el=> el.addEventListener('click', onClickMatrizDetalhe));
  if(contEl.querySelector('.matriz-input')) aplicarRestricoesInputsMatriz();
  // Salvaguarda: se o modo de algum grupo for 'edit' mas nÃ£o houver inputs por algum CSS/erro, injeta inputs on-the-fly
  try {
    const gruposEdit = state.gruposTurnos.filter(g=> g.__modo==='edit');
    if(gruposEdit.length){
      gruposEdit.forEach(g=>{
        const wrap = contEl.querySelector(`.matriz-grupo[data-grupo="${g.id}"]`);
        if(!wrap) return;
        const temInput = wrap.querySelector('input.matriz-input');
        if(!temInput){
          wrap.querySelectorAll('td[data-key], td').forEach(td=>{
            const key = td.getAttribute && td.getAttribute('data-key');
            if(!key) return;
            const valor = state.matrizAlocacao[key]||'';
            const nomes = (function(){ const eqById=new Map(); (state.equipes||[]).forEach(e=>{ if(e&&e.id) eqById.set(e.id,e); }); if(!valor) return ''; return valor.split(',').map(id=>{ id=id.trim(); const eq=eqById.get(id); return eq? eq.nome : id; }).filter(Boolean).join(','); })();
            td.innerHTML = `<div class="w-100" style="pointer-events:auto"><input type="text" class="form-control form-control-sm text-center matriz-input matriz-input-mini" data-key="${key}" value="${nomes}" style="font-size:.55rem;padding:.15rem .25rem;" /></div>`;
          });
          aplicarRestricoesInputsMatriz();
        }
      });
    }
  } catch(_safe){}
  // Qualidade de vida: se houver algum grupo em modo edição, foca o primeiro input
  try {
    const grpEdit = state.gruposTurnos.find(g=> g.__modo==='edit');
    if(grpEdit){
      const wrap = contEl.querySelector(`.matriz-grupo[data-grupo="${grpEdit.id}"]`);
      const first = wrap && wrap.querySelector('input.matriz-input');
      if(first) first.focus();
    }
  } catch(_fx){ }
  // (Blocos duplicados de utilitários e renderMatrizesPorGrupo removidos – usar implementação única definida anteriormente)
  console.log('[escala][render] renderMatrizesPorGrupo end');
  // Dispara evento para integraÃ§Ãµes na view saberem que a matriz foi atualizada
  try { document.dispatchEvent(new CustomEvent('escala:matriz:renderizada', { detail:{ grupos: (state.gruposTurnos||[]).length } })); } catch(_ev){}
  // Definir __escToggleFromBtn para compatibilidade com onclick inline
  // FunÃ§Ã£o auxiliar para verificar indisponibilidade de uma equipe em um dia especÃ­fico (sem UI)
  async function verificarIndisponibilidadeEquipeDia(equipe, dataISO){
    if(!dataISO || !equipe || !Array.isArray(equipe.componentes)) return;
    equipe.disponibilidade = equipe.disponibilidade || {};
    const diaIni=dataISO; // formato YYYY-MM-DD
    const diaFim=dataISO; // consulta 1 dia
    for(const comp of equipe.componentes){
      if(!comp.id) continue;
      let indisponivel = false;
      let horasTrabalhadas = comp.horasTrabalhadas || 0;
      let diasServico = comp.diasServico || 0;
      if(equipe.disponibilidade && equipe.disponibilidade[comp.id] && equipe.disponibilidade[comp.id].dias && equipe.disponibilidade[comp.id].dias[dataISO] === false){
        indisponivel = true;
      } else {
        // Fazer fetch se nÃ£o tiver salvo
        try {
          const url=basePath()+`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(comp.id)}&inicio=${diaIni}&fim=${diaFim}`;
          const r=await fetch(url,{credentials:'same-origin'});
          if(!r.ok){ throw new Error(r.status); }
          const js=await r.json();
          if(!js.ok) throw new Error(js.error||'erro');
          const dados=js.data;
          // Dia indisponÃ­vel se NÃƒO existir intervalo free que cubra totalmente o dia (diaIni-diaFim)
          const livre = Array.isArray(dados.free) && dados.free.some(int=> int.inicio<=diaIni && int.fim>=diaFim);
          indisponivel = !livre;
          horasTrabalhadas = livre ? (comp.horasTrabalhadas || 0) : 0;
          diasServico = livre ? (comp.diasServico || 0) : 0;
          // Salvar no disponibilidade da equipe
          equipe.disponibilidade[comp.id] = equipe.disponibilidade[comp.id] || { dias: {} };
          equipe.disponibilidade[comp.id].dias[dataISO] = livre; // true if available
        } catch(e){ continue; }
      }
      comp.indisponivel = indisponivel;
      comp.horasTrabalhadas = horasTrabalhadas;
      comp.diasServico = diasServico;
    }
    // Removido: salvar indisponibilidades no banco aqui para evitar mÃºltiplos PUTs
  }

  window.__escToggleFromBtn = async function(btn){
    console.log('[escala][toggle] __escToggleFromBtn start', btn && btn.getAttribute('data-grupo'));
    try {
      const grupoId = btn && btn.getAttribute('data-grupo'); if(!grupoId) return;
      console.log('[escala][grupo] clique Modo ediÃ§Ã£o', grupoId);
      try {
        const cont = document.querySelector(`.matriz-grupo[data-grupo="${grupoId}"]`);
        if(cont){
          cont.classList.add('esc-pulse-edit');
          setTimeout(()=> cont.classList.remove('esc-pulse-edit'), 500);
        }
      } catch(_fx){}
      const g = state.gruposTurnos.find(x=> String(x.id)===String(grupoId));
      console.log('[escala][toggle] g encontrado:', g, 'modo atual:', g?.__modo);
      const agoraEdit = !(g && g.__modo==='edit');
      if(!agoraEdit){
        const container=(document.getElementById('matrizAlocacao')||document).querySelector(`.matriz-grupo[data-grupo="${grupoId}"]`);
        if(container){
          const valRes=validarEntradasGrupo(container);
          if(!valRes.ok){ alert('As seguintes equipes nÃ£o existem: '+valRes.invalidTokens.join(', ')+".\nCorrija os campos destacados."); return; }
          const inputs=[...container.querySelectorAll('input.matriz-input[data-key]')];
          inputs.forEach(inp=>{ const ids=nomesToIds(inp.value.trim()); const key=inp.getAttribute('data-key'); if(ids.length) state.matrizAlocacao[key]=ids.join(','); else delete state.matrizAlocacao[key]; });
        }
          // Salva silenciosamente para nÃ£o exibir alertas duplicados em toggles encadeados
          await salvarEscala(false, { silent: true });
  // Marca que o usuÃ¡rio utilizou o Modo consulta ao menos uma vez
  try { sessionStorage.setItem('esc_modo_consulta_usado','1'); } catch(_s){}
  try { if(typeof avaliarProgressaoAbas==='function') avaliarProgressaoAbas(); } catch(_r){}
        setModoGrupo(grupoId,'view');
        // ApÃ³s mudar para modo consulta, verificar indisponibilidades das equipes alocadas neste grupo
        const equipesAlocadas = new Set();
        Object.keys(state.matrizAlocacao).forEach(key => {
          if (key.startsWith(grupoId + '::')) {
            const ids = state.matrizAlocacao[key].split(',');
            ids.forEach(id => equipesAlocadas.add(id.trim()));
          }
        });
        const datas = gerarDatas(state.periodo.ini, state.periodo.fim);
        for (const equipeId of equipesAlocadas) {
          const equipe = state.equipes.find(e => e.id === equipeId);
          if (equipe) {
            for (const dataISO of datas) {
              await verificarIndisponibilidadeEquipeDia(equipe, dataISO);
            }
          }
        }
        // Agora salvar as indisponibilidades no banco para cada equipe
        for (const equipeId of equipesAlocadas) {
          const equipe = state.equipes.find(e => e.id === equipeId);
          if (equipe && equipe.id && state.escalaId) {
            const body = { disponibilidade: equipe.disponibilidade };
            console.log('PUT equipe', equipe.id, 'body', JSON.stringify(body));
            try {
              const r = await fetch(basePath() + `/api/escalas/${state.escalaId}/equipes/${equipe.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(body)
              });
              if (!r.ok) {
                const text = await r.text();
                console.log('PUT equipe error response', equipe.id, r.status, text);
                throw new Error(text);
              }
            } catch (e) {
              console.warn('Falha ao salvar indisponibilidades no banco para equipe', equipeId, e);
            }
          }
        }
      } else {
        if(isEscalaFechada()){ alert('EdiÃ§Ã£o nÃ£o permitida: a escala estÃ¡ fechada/validada.'); return; }
        setModoGrupo(grupoId,'edit');
      }
      renderMatrizesPorGrupo();
      // apÃ³s re-render, atualiza label do botÃ£o correspondente e foca input no modo ediÃ§Ã£o
      try {
        const cont = document.querySelector(`.matriz-grupo[data-grupo="${grupoId}"]`);
  const btnModo = cont && cont.querySelector('button[data-act="grupo-modo"]');
        if(btnModo){
          const g2 = state.gruposTurnos.find(x=> String(x.id)===String(grupoId));
          btnModo.innerText = (g2 && g2.__modo==='edit') ? 'Modo consulta' : 'Modo edição';
        }
        const g3 = state.gruposTurnos.find(x=> String(x.id)===String(grupoId));
        if(g3 && g3.__modo==='edit' && cont){
          const first = cont.querySelector('input.matriz-input');
          if(first) first.focus();
        }
      } catch(_upd){ }
    } catch(_e){ console.error('[escala][toggle] erro', _e); }
    console.log('[escala][toggle] __escToggleFromBtn end');
  };
  window.__escLimparFromBtn = function(btn){
    try {
      const grupoId = btn && btn.getAttribute('data-grupo'); if(!grupoId) return;
      if(confirm('Apagar TODAS as alocações deste grupo?')){
        Object.keys(state.matrizAlocacao).forEach(k=>{ if(k.startsWith(String(grupoId)+'::')) delete state.matrizAlocacao[k]; });
        renderMatrizesPorGrupo();
      }
    } catch(_e){}
  };
}
// expÃµe para chamadas de fallback/externas
try { window.renderMatrizesPorGrupo = renderMatrizesPorGrupo; } catch(_expR){}
  // ===== FunÃ§Ãµes utilitÃ¡rias adicionadas / stubs =====
  function setModoGrupo(grupoId, modo){ const g=state.gruposTurnos.find(x=> String(x.id)===String(grupoId)); if(g){ g.__modo = modo==='edit'?'edit':'view'; } }
  function uuid2(){ return 'g'+Math.random().toString(36).slice(2,10)+Date.now().toString(36); }
  function isEscalaFechada(){
    try {
      const st=(state.status||'').toString().toLowerCase();
      return ['fechada','fechado','validada','validado','publicada','concluida','concluÃ­da'].includes(st);
    } catch(_e){ return false; }
  }
  function validarEntradasGrupo(container){
    const inputs = [...container.querySelectorAll('input.matriz-input[data-key]')];
    const invalidTokens = [];
    let ok = true;
    inputs.forEach(inp => {
      const val = inp.value.trim().toUpperCase();
      if (!val) return; // vazio Ã© ok
      const tokens = val.split(',').map(t => t.trim()).filter(Boolean);
      tokens.forEach(token => {
        const exists = state.equipes.some(eq => (eq.nome || '').toUpperCase() === token);
        if (!exists) {
          invalidTokens.push(token);
          inp.classList.add('is-invalid');
          ok = false;
        } else {
          inp.classList.remove('is-invalid');
        }
      });
    });
    return { ok, invalidTokens };
  }
function renderEquipes(){
  if(!els.tblEquipes) return; const tbody=els.tblEquipes.querySelector('tbody')||els.tblEquipes;
  if(!state.equipes.length){ tbody.innerHTML='<tr class="text-muted"><td colspan="4" class="text-center small">Nenhuma equipe.</td></tr>'; return; }
  tbody.innerHTML=state.equipes.map(e=>{
    const nomes=(e.componentes||[]).map(c=>c.nome||c.id).filter(Boolean); const preview=nomes.slice(0,3).join(', ')+(nomes.length>3? ' +'+(nomes.length-3):'');
    return `<tr data-id="${e.id}"><td>${e.nome}</td><td>${(e.descricao||'').replace(/</g,'&lt;')}</td><td class="text-center">${nomes.length? `<span title="${nomes.join(', ')}">${preview}</span>`:'-'}</td><td class="text-center eq-col-acoes">`+
  `<button type="button" class="btn btn-sm btn-outline-primary" data-act="comp-eq" data-action="efetivo" title="Efetivo" data-bs-toggle="modal" data-bs-target="#modalEfetivoEquipe" onclick="try{ window.__eqOpenEfetivo && window.__eqOpenEfetivo(this); }catch(_e){}"><i class="bi bi-people"></i></button>`+
      `<button type="button" class="btn btn-sm btn-outline-secondary" data-act="edit-eq" data-action="editar-nome" title="Editar nome"><i class="bi bi-pencil"></i></button>`+
      `<button type="button" class="btn btn-sm btn-outline-danger" data-act="del-eq" title="Excluir"><i class="bi bi-trash"></i></button>`+
    `</td></tr>`; }).join('');
}
// Expor para chamadas externas (ex.: pós-save do modal Efetivo)
try { window.renderEquipes = renderEquipes; } catch(_expRE){}

function ensureModalNomeEquipe(){
  // Preferir o modal provido pelo EJS (views/escalas/modais_popups/modal_nome_equipe.ejs)
  let modal = document.getElementById('modalEditarEquipe');
  if(modal) return modal;
  // Compatibilidade com fallback antigo
  modal = document.getElementById('modalEditarNomeEquipe');
  if(!modal){
    // Criar fallback mínimo com os mesmos IDs de campos/botão para reaproveitar handlers
    modal = document.createElement('div');
    modal.id = 'modalEditarEquipe';
    modal.className = 'modal fade';
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Editar Equipe</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label for="editNomeEquipe" class="form-label">Nome da Equipe</label>
              <input type="text" class="form-control" id="editNomeEquipe" maxlength="3" style="text-transform: uppercase;">
            </div>
            <div class="mb-3">
              <label for="editDescricaoEquipe" class="form-label">Descrição</label>
              <input type="text" class="form-control" id="editDescricaoEquipe">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="btnSalvarEdicaoEquipe">Salvar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  // Garante o handler do botão salvar
  const btnSalvar = modal.querySelector('#btnSalvarEdicaoEquipe');
  if(btnSalvar && !btnSalvar.__bound){ btnSalvar.__bound=true; btnSalvar.addEventListener('click', onSalvarEdicaoEquipe); }
  return modal;
}

function onSalvarEdicaoEquipe(){
  const modal = document.getElementById('modalEditarEquipe') || document.getElementById('modalEditarNomeEquipe');
  const nomeEl = modal.querySelector('#editNomeEquipe');
  const descEl = modal.querySelector('#editDescricaoEquipe');
  const btnSalvar = modal.querySelector('#btnSalvarEdicaoEquipe');
  const equipeId = btnSalvar.dataset.id;
  if(!equipeId) return;
  const nome = (nomeEl.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,3);
  const descricao = (descEl.value || '').trim();
  if(!nome) return alert('Informe o nome da equipe.');
  // Update state
  const eq = state.equipes.find(e => e.id === equipeId);
  if(eq){
    eq.nome = nome;
    eq.descricao = descricao;
    renderEquipes();
    renderMatrizesPorGrupo();
    avaliarProgressaoAbas?.();
    // Close modal
    const inst = bootstrap.Modal.getInstance(modal);
    if(inst) inst.hide();
  }
}

async function excluirEquipePersistente(equipeId){
  if(!equipeId){ alert('Equipe invÃ¡lida.'); return false; }
  // Resolve escalaId agressivamente
  try { if(!state.escalaId && typeof ensureEscalaId==='function') ensureEscalaId(); } catch(_e){}
  if(!state.escalaId){
    try {
      const qid = (typeof obterQueryId==='function') ? obterQueryId() : null;
      const wid = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId) ? window.__ESCALA_STATE__.escalaId : null;
      const hidEl = document.querySelector('#escalaId,[name="escalaId"],[name="idEscala"]');
      const hid = hidEl && (hidEl.value || hidEl.getAttribute('value'));
      state.escalaId = qid || wid || hid || state.escalaId;
    } catch(_idr){}
  }
  if(!state.escalaId){ alert('Salve os Dados Gerais da escala antes de excluir equipes.'); return false; }
  const anterior = state.equipes.slice();
  state.equipes = state.equipes.filter(e=> e.id!==equipeId);
  renderEquipes(); renderMatrizesPorGrupo(); avaliarProgressaoAbas?.();
  // Helpers
  async function tryDelete(url){ try{ const r=await fetch(url,{ method:'DELETE', credentials:'same-origin' }); return r; }catch(e){ return { ok:false, status:-1, err:e }; } }
  async function tryPut(body){
    // prefixo
    try { let r=await fetch(basePath()+`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); if(r.ok) return r; } catch(_e){}
    // raiz
    try { let r2=await fetch(`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); if(r2.ok) return r2; } catch(_e2){}
    return { ok:false };
  }
  // 1) Tenta DELETE direto (prefixo e raiz)
  let ok=false;
  try {
    let r = await tryDelete(basePath()+`/api/escalas/${state.escalaId}/equipes/${encodeURIComponent(equipeId)}`);
    if(r.ok) ok=true; else {
      r = await tryDelete(`/api/escalas/${state.escalaId}/equipes/${encodeURIComponent(equipeId)}`);
      if(r.ok) ok=true;
    }
  } catch(_del){ /* segue para PUT */ }
  // 2) PUT overwrite com mÃºltiplos formatos
  if(!ok){
    const mapEq = state.equipes.map(e=> ({ id:e.id, nome:e.nome, descricao:e.descricao||'', componentes: Array.isArray(e.componentes)? e.componentes: [] }));
    const bodies=[
      { equipes: mapEq },
      { equipesOverwrite:true, equipes: mapEq },
      { id: state.escalaId, equipes: mapEq },
      { id: state.escalaId, equipesOverwrite:true, equipes: mapEq },
      { lista_equipes: mapEq },
      { equipes_turnos: mapEq }
    ];
    for(const body of bodies){ const r = await tryPut(body); if(r && r.ok){ ok=true; break; } }
  }
  // 3) ConfirmaÃ§Ã£o via GET e ajuste final
  if(ok){
    try {
      let g = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { credentials:'same-origin' });
      if(!g.ok) g = await fetch(`/api/escalas/${state.escalaId}`, { credentials:'same-origin' });
      if(g.ok){
        const js=await g.json().catch(()=>null); const d = js?.data||js?.escala||js||null;
        let lista = Array.isArray(d?.equipes)? d.equipes : (Array.isArray(d?.lista_equipes)? d.lista_equipes : (Array.isArray(d?.equipes_turnos)? d.equipes_turnos : []));
        // Atualiza estado a partir da verdade do servidor, garantindo remoÃ§Ã£o do alvo
        state.equipes = (lista||[]).filter(e=> e && e.id!==equipeId);
      }
    } catch(_cf){}
    renderEquipes(); renderMatrizesPorGrupo(); avaliarProgressaoAbas?.();
    try { document.dispatchEvent(new CustomEvent('escala:equipes-alteradas', { detail:{ tipo:'del', equipeId, equipes: state.equipes.slice() } })); } catch(_e){}
    return true;
  }
  // Falhou: reverte
  state.equipes = anterior; renderEquipes(); renderMatrizesPorGrupo(); avaliarProgressaoAbas?.();
  alert('Falha ao excluir equipe no servidor.');
  return false;
}
try { window.excluirEquipe = excluirEquipePersistente; } catch(_wx){}
async function salvarNovaEquipe(params){
  // params opcional: { nome, descricao, trigger }
  let nomeInput=$('nomeEquipe'); let descInput=$('descricaoEquipe');
  if(!nomeInput || !descInput){
    // tenta localizar inputs prÃ³ximos ao botÃ£o acionador (params.trigger)
    const scope = params?.trigger ? (params.trigger.closest('#aba-equipes, .tab-pane, .card, .container, .row, .col') || document) : document;
    if(!nomeInput){ nomeInput = scope.querySelector('#nomeEquipe, input[name="nomeEquipe"], input[data-field="nomeEquipe"], .equipe-input-nome, input[type="text"]'); }
    if(!descInput){
      // procura um segundo input de texto na mesma regiÃ£o
      const texts = scope.querySelectorAll('#descricaoEquipe, input[name="descricaoEquipe"], input[data-field="descricaoEquipe"], .equipe-input-descricao, input[type="text"]');
      if(texts && texts.length>=2){ descInput = texts[1]; }
      else { descInput = scope.querySelector('#descricaoEquipe, input[name="descricaoEquipe"], input[data-field="descricaoEquipe"], .equipe-input-descricao, textarea'); }
    }
  }
  let nome = (params?.nome ?? (nomeInput && nomeInput.value) ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
  if(!nome) return alert('Informe o nome da equipe (letras/nÃºmeros).');
  if(window.__ESCALA_EQ_PENDING__?.has(nome)) return; // jÃ¡ existe inserÃ§Ã£o em andamento para este nome
  if(state.equipes.some(e=> (e.nome||'').toUpperCase()===nome)) return alert('Nome jÃ¡ usado');
  const equipe={ id:'eq'+Math.random().toString(36).slice(2,10), nome, descricao:(params?.descricao ?? (descInput? descInput.value.trim():'')) , componentes:[] };
  // UI feedback
  // Descobre botÃ£o preferencial e faz feedback
  const btn=document.getElementById('btnAddEquipe') || params?.trigger || document.querySelector('#aba-equipes button, .tab-pane#aba-equipes button');
  let oldHtml='';
  if(btn && btn.tagName==='BUTTON'){
    if(btn.dataset.busy==='1') return; // proteÃ§Ã£o contra duplo clique
    btn.dataset.busy='1';
    oldHtml=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm"></span>';
  }
  // Marca o nome como pendente (evita corridas antes do state.equipes ser atualizado)
  try { window.__ESCALA_EQ_PENDING__?.add(nome); } catch(_pend){}
  // Se a escala ainda nÃ£o existe, tenta resolver id agressivamente pela URL/campos
  if(!state.escalaId){ ensureEscalaId(); }
  // Se ainda nÃ£o houver id, nÃ£o tenta mais criar automaticamente: peÃ§a para salvar os dados gerais
  if(!state.escalaId){
    if(btn){ btn.disabled=false; btn.innerHTML=oldHtml; }
    return alert('Salve os Dados Gerais da escala primeiro (DescriÃ§Ã£o, Unidade e PerÃ­odo) e clique em Salvar. Depois volte para inserir a equipe.');
  }
  let persisted=false; let serverEquipe=null;
  try {
    const urlPref = basePath()+`/api/escalas/${state.escalaId}/equipes`;
    const urlRoot = `/api/escalas/${state.escalaId}/equipes`;
    let r = await fetch(urlPref, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipe }) });
    if (r.ok) {
      try { const js = await r.json().catch(()=>null); serverEquipe = js && (js.equipe||js.data||null); } catch(_err){}
      persisted = true;
    } else if (r.status === 401) {
      if(btn){ btn.disabled=false; btn.innerHTML=oldHtml; }
      return alert('SessÃ£o expirada ou sem permissÃ£o. FaÃ§a login novamente.');
    } else if (r.status === 409) {
      const msg = await r.text().catch(()=> '');
      alert('Nome de equipe jÃ¡ utilizado.');
      if(btn){ btn.disabled=false; btn.innerHTML=oldHtml; }
      return;
    } else if (r.status === 404) {
      console.warn('POST equipes nÃ£o disponÃ­vel em prefixo (404) â€“ vai tentar rota raiz e, se preciso, PUT');
      try {
        // Tenta na rota raiz mantendo wrapper {equipe}
        const rRoot = await fetch(urlRoot, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipe }) });
        if(rRoot.ok){ try { const jsR=await rRoot.json().catch(()=>null); serverEquipe = jsR && (jsR.equipe||jsR.data||null); } catch(_eR){}; persisted=true; }
      } catch(_404root){ /* ignora */ }
    } else {
      const txt = await r.text().catch(()=> '');
      console.warn('POST equipe falhou', r.status, txt);
      // Tentativa alternativa: alguns backends esperam os campos na raiz do body
      try {
        const r2 = await fetch(urlPref, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ id:equipe.id, nome:equipe.nome, descricao:equipe.descricao, componentes:equipe.componentes||[] }) });
        if(r2.ok){ try { const js2=await r2.json().catch(()=>null); serverEquipe = js2 && (js2.equipe||js2.data||null); } catch(_e2){}; persisted=true; }
        else { const txt2=await r2.text().catch(()=> ''); console.warn('[equipes][POST-alt] falhou', r2.status, txt2); }
      } catch(_postAlt){ console.warn('[equipes][POST-alt] erro rede', _postAlt); }
      // Tentativa alternativa 2: rota raiz sem prefixo
      if(!persisted){
        try {
          const r3 = await fetch(urlRoot, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ id:equipe.id, nome:equipe.nome, descricao:equipe.descricao, componentes:equipe.componentes||[] }) });
          if(r3.ok){ try { const js3=await r3.json().catch(()=>null); serverEquipe = js3 && (js3.equipe||js3.data||null); } catch(_e3){}; persisted=true; }
          else { const txt3=await r3.text().catch(()=> ''); console.warn('[equipes][POST-root-alt] falhou', r3.status, txt3); }
        } catch(_postAlt2){ console.warn('[equipes][POST-root-alt] erro rede', _postAlt2); }
      }
    }
  } catch(e){
    console.warn('POST equipe erro rede', e);
  }
  if(!persisted){
    // Fallback: adiciona localmente e sobrepÃµe com PUT escala inteira
    // Garante que nÃ£o haja duplicidade local
    if(!state.equipes.some(eq=> (eq.nome||'').toUpperCase()===nome)) state.equipes.push(equipe);
    // Dedup forÃ§ada por nome
    try {
      const seen=new Set();
      state.equipes = state.equipes.filter(eq=>{ const k=(eq.nome||'').toUpperCase(); if(!k||seen.has(k)) return false; seen.add(k); return true; });
    } catch(_dd){}
    try {
      const equipesArr = state.equipes.map(e=>({ id:e.id, nome:e.nome, descricao:e.descricao, componentes:e.componentes||[] }));
      // Dedup no payload tambÃ©m
      const seen2=new Set();
      const equipesArrDedup = equipesArr.filter(e=>{ const k=(e.nome||'').toUpperCase(); if(!k||seen2.has(k)) return false; seen2.add(k); return true; });
      async function tryPut(body){
        // Tenta com prefixo e, se falhar (404/405), tenta rota raiz
        let res = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) });
        if(!res.ok && (res.status===404 || res.status===405)){
          try { const res2 = await fetch(`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); return res2; } catch(_e){ /* usa res anterior */ }
        }
        return res;
      }
      // SequÃªncia de tentativas de PUT para diferentes expectativas de backend
      let put = await tryPut({ id: state.escalaId, equipes: equipesArrDedup });
      if(!put.ok){
        const tx=await put.text().catch(()=> ''); console.warn('[equipes][fallback PUT#1] falhou', put.status, tx);
        put = await tryPut({ id: state.escalaId, equipesOverwrite: true, equipes: equipesArrDedup });
      }
      if(!put.ok){
        const tx=await put.text().catch(()=> ''); console.warn('[equipes][fallback PUT#2 overwrite] falhou', put.status, tx);
        put = await tryPut({ equipes: equipesArrDedup });
      }
      if(!put.ok){
        const tx=await put.text().catch(()=> ''); console.warn('[equipes][fallback PUT#3 sem id] falhou', put.status, tx);
        state.equipes=state.equipes.filter(x=>x.id!==equipe.id);
        if(btn){ btn.disabled=false; btn.innerHTML=oldHtml; }
        return alert('Falha ao salvar equipe');
      }
    } catch(err){ state.equipes=state.equipes.filter(x=>x.id!==equipe.id); if(btn){ btn.disabled=false; btn.innerHTML=oldHtml; } return alert('Erro de rede ao salvar equipe'); }
  }
  // Etapa de confirmaÃ§Ã£o: GARANTE que a equipe existe no documento da escala
  try {
    if(state.escalaId){
      // Garante que state.equipes contenha a equipe (sem duplicar por nome)
      try {
        const nomeAlvo = (equipe.nome||'').toUpperCase();
        const semDup = [];
        const vistos = new Set();
        (state.equipes||[]).concat([equipe]).forEach(eq=>{
          if(!eq) return; const key=(eq.nome||'').toUpperCase();
          if(!key) return; if(vistos.has(key)) return; vistos.add(key); semDup.push(eq);
        });
        state.equipes = semDup;
      } catch(_ded){ /* ignore */ }
      let rGet = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { credentials:'same-origin' });
      if(!rGet.ok && (rGet.status===404 || rGet.status===405)){
        try { rGet = await fetch(`/api/escalas/${state.escalaId}`, { credentials:'same-origin' }); } catch(_g){}
      }
      if(rGet.ok){
        const jsEsc = await rGet.json().catch(()=>null);
        // Aceitar mÃºltiplos formatos de resposta
        let d = null;
        if(jsEsc && typeof jsEsc==='object'){
          if(jsEsc.data) d = jsEsc.data;
          else if(jsEsc.escala) d = jsEsc.escala;
          else d = jsEsc; // fallback: raiz jÃ¡ Ã© a escala
        }
        let lista=[];
        if(d){
          if(Array.isArray(d.equipes)) lista=d.equipes;
          else if(Array.isArray(d.lista_equipes)) lista=d.lista_equipes;
          else if(Array.isArray(d.equipes_turnos)) lista=d.equipes_turnos;
        }
        const existe = lista.some(e=> (e.nome||'').toUpperCase() === equipe.nome.toUpperCase());
        if(!existe){
          // Adiciona e forÃ§a PUT overwrite para garantir persistÃªncia
          const novaLista = (lista.length? lista: state.equipes).concat([{ id: equipe.id, nome: equipe.nome, descricao: equipe.descricao||'', componentes: equipe.componentes||[] }]);
          // De-duplicaÃ§Ã£o por nome
          const vistos = new Set();
          const novaListaDedup = [];
          novaLista.forEach(eq=>{ const k=(eq&&eq.nome||'').toUpperCase(); if(!k||vistos.has(k)) return; vistos.add(k); novaListaDedup.push({ id:eq.id||('eq'+Math.random().toString(36).slice(2,10)), nome:eq.nome, descricao:eq.descricao||'', componentes:Array.isArray(eq.componentes)? eq.componentes:[] }); });
          const putConf = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipesOverwrite:true, equipes:novaLista }) });
          if(!putConf.ok){
            const t = await putConf.text().catch(()=> '');
            console.warn('[equipes][confirmacao] PUT overwrite falhou', putConf.status, t);
          } else {
            console.debug('[equipes][confirmacao] equipe garantida via PUT overwrite');
          }
        }
      } else {
        console.warn('[equipes][confirmacao] GET escala falhou', rGet.status);
        // Hard fallback: se GET falhar, tenta garantir via PUT com state.equipes + equipe
        try {
          const listaLocal = (state.equipes||[]).concat([{ id:equipe.id, nome:equipe.nome, descricao:equipe.descricao||'', componentes:equipe.componentes||[] }]);
          const vistos2=new Set(); const listaDedup=[];
          listaLocal.forEach(eq=>{ const k=(eq&&eq.nome||'').toUpperCase(); if(!k||vistos2.has(k)) return; vistos2.add(k); listaDedup.push(eq); });
          const putHard = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipesOverwrite:true, equipes: listaDedup }) });
          if(!putHard.ok){ const t2=await putHard.text().catch(()=> ''); console.warn('[equipes][confirmacao] hard PUT overwrite falhou', putHard.status, t2); }
        } catch(_hf){ /* noop */ }
      }
    }
  } catch(_confErr){ console.warn('[equipes][confirmacao] erro', _confErr); }
  // ApÃ³s sucesso (POST ou fallback PUT), recarrega escala do servidor para refletir verdade do banco
  try { await carregarEscalaExistente?.(state.escalaId); } catch(_e){}
  renderEquipes(); avaliarProgressaoAbas(); renderMatrizesPorGrupo();
  if(btn){ btn.disabled=false; btn.innerHTML=oldHtml; btn.dataset.busy='0'; }
  try { if(nomeInput) nomeInput.value=''; if(descInput) descInput.value=''; } catch(_clr){}
  try { window.__ESCALA_EQ_PENDING__?.delete(nome); } catch(_rm){}
}
try { window.salvarNovaEquipe = salvarNovaEquipe; } catch(_e){}
// Listener delegado robusto para acionar inserÃ§Ã£o em diversos templates/IDs
document.addEventListener('click', (ev)=>{
  const t = ev.target;
  // candidatos de botÃµes de inserir na aba Equipes
  const btn = t.closest && t.closest('#btnAddEquipe, #btnInserirEquipe, [data-act="add-eq"], [data-action="add-equipe"], .btn-add-equipe');
  const inEquipes = btn && (btn.closest('#aba-equipes, [data-pane="equipes"], .pane-equipes') || document.body);
  // tambÃ©m aceita botÃ£o com label "Inserir" dentro da aba de equipes
  if(!btn && t.closest){
    const maybe = t.closest('button');
    if(maybe && /inserir/i.test((maybe.textContent||'').trim()) && maybe.closest('#aba-equipes, [data-pane="equipes"], .pane-equipes')){
      return salvarNovaEquipe({ trigger: maybe });
    }
  }
  if(btn && inEquipes){ ev.preventDefault(); return salvarNovaEquipe({ trigger: btn }); }
}, true);
function renderRecursos(){
  if(!els.tblRecursos) return;
  const tbody = els.tblRecursos.querySelector('tbody') || els.tblRecursos;
  // Alinha com o cabeÃ§alho atual: [Equipe | Recurso | AÃ§Ãµes]
  if(!Array.isArray(state.recursos) || !state.recursos.length){
    tbody.innerHTML = '<tr class="text-muted"><td colspan="3" class="text-center small">Nenhum recurso.</td></tr>';
    return;
  }
  // Mapa rÃ¡pido de nomes de equipe
  const eqNome = new Map((state.equipes||[]).map(e=> [String(e.id||e._id||''), e.nome||'EQ']));
  function fmtRecurso(r){
    const placa = r.placa || r.codigo || r.nome || '';
    const marca = r.marca || r.fabricante || '';
    const modelo = r.modelo || r.versao || '';
    let parts = [];
    if(placa) parts.push(String(placa));
    if(marca) parts.push(String(marca));
    if(modelo) parts.push(String(modelo));
    const s = parts.join(' - ');
    return s || (r.nome || r.descricao || 'Recurso');
  }
  tbody.innerHTML = state.recursos.map(r=>{
    const rid = r.id || r._id || r.referenciaGestorId || '';
    const eqId = r.equipeId || r.equipe_id || (r.equipe && (r.equipe.id||r.equipe._id)) || '';
    const equipe = eqNome.get(String(eqId)) || (r.equipe && (r.equipe.nome||r.equipe.descricao)) || '-';
    const desc = fmtRecurso(r);
    return `<tr data-recurso-id="${rid}" data-eq-id="${eqId||''}">`
      + `<td>${equipe||'-'}</td>`
      + `<td>${desc||'-'}</td>`
      + `<td class="text-center">`
        + `<button type="button" class="btn btn-sm btn-outline-secondary" title="Editar" onclick="window.__escEditRecurso && window.__escEditRecurso(this, '${String(rid).replace(/'/g,"\\'")}')"><i class="bi bi-pencil"></i></button> `
        + `<button type="button" class="btn btn-sm btn-outline-danger" title="Excluir" onclick="window.__escDelRecurso && window.__escDelRecurso(this, '${String(rid).replace(/'/g,"\\'")}', '${String(eqId||'').replace(/'/g,"\\'")}')"><i class="bi bi-trash"></i></button>`
      + `</td>`
    + `</tr>`;
  }).join('');
}
// expÃµe para uso por fallback-lite
try { window.renderRecursos = renderRecursos; } catch(_e){}
// Fallback global invocÃ¡vel inline: exclusÃ£o de recurso por ids
try {
  window.__escDelRecurso = async function(btn, rid, eqId){
    try {
      const escalaId = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId) || (typeof state!=='undefined' && state.escalaId) || (new URL(location.href).searchParams.get('id'));
      if(!escalaId || !rid){ alert('Recurso ou escala nÃ£o identificados.'); return; }
      const isHex24 = v=> /^[0-9a-fA-F]{24}$/.test(String(v||''));
      if(!eqId || !isHex24(eqId)){
        // tentar resolver por state
        if(typeof state!=='undefined' && Array.isArray(state.recursos)){
          const rec = state.recursos.find(x=> (x.id||x._id||x.referenciaGestorId)===rid); if(rec) eqId = rec.equipeId || rec.equipe_id || eqId;
        }
      }
      if((!eqId || !isHex24(eqId)) && window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.equipes)){
        for(const eq of window.__ESCALA_STATE__.equipes){
          if(Array.isArray(eq.recursos) && eq.recursos.some(r=> (r.id||r._id||r.referenciaGestorId)===rid)){ eqId = eq.id || eq._id; break; }
        }
      }
      if(!eqId || !isHex24(eqId)){
        try {
          const rEsc = await fetch('/escalas/api/escalas/'+encodeURIComponent(escalaId), { credentials:'same-origin' });
          if(rEsc.ok){
            const js = await rEsc.json(); const d = js && (js.data||js);
            const equipes = Array.isArray(d?.equipes)? d.equipes:[];
            for(const eq of equipes){
              if(Array.isArray(eq.recursos) && eq.recursos.some(r=> (r.id||r._id||r.referenciaGestorId)===rid)){ eqId = eq.id || eq._id; break; }
            }
          }
        } catch(_){ }
      }
      if(!eqId){ alert('Equipe do recurso nÃ£o identificada.'); return; }
      if(!confirm('Excluir recurso? Esta aÃ§Ã£o removerÃ¡ o recurso desta escala.')) return;
      const old = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm"></span>';
      async function tryDel(u){ try{ return await fetch(u, { method:'DELETE', credentials:'same-origin' }); } catch(_){ return { ok:false, status:-1 }; } }
      const tries = [
        '/escalas/api/escalas/'+encodeURIComponent(escalaId)+'/equipes/'+encodeURIComponent(eqId)+'/recursos/'+encodeURIComponent(rid),
        '/api/escalas/'+encodeURIComponent(escalaId)+'/equipes/'+encodeURIComponent(eqId)+'/recursos/'+encodeURIComponent(rid),
        '/escalas/api/escalas/'+encodeURIComponent(escalaId)+'/recursos/'+encodeURIComponent(rid),
        '/api/escalas/'+encodeURIComponent(escalaId)+'/recursos/'+encodeURIComponent(rid)
      ];
      let ok=false, lastRes=null; for(const u of tries){ const r=await tryDel(u); lastRes=r; if(r && (r.ok || r.status===204 || r.status===200)){ ok=true; break; } }
      if(!ok){ let msg='Falha ao excluir o recurso.'; try{ const t=await (lastRes && lastRes.text ? lastRes.text() : Promise.resolve('')); if(t) msg+='\n'+t; }catch(_){ } alert(msg); btn.disabled=false; btn.innerHTML=old; return; }
      // Atualiza UI
      try {
        const tr = btn.closest('tr'); if(tr && tr.parentElement){ tr.parentElement.removeChild(tr); }
        if(typeof state!=='undefined' && Array.isArray(state.recursos)){
          state.recursos = state.recursos.filter(r=> (r.id||r._id||r.referenciaGestorId)!==rid);
        }
        if(window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.recursos)){
          window.__ESCALA_STATE__.recursos = window.__ESCALA_STATE__.recursos.filter(r=> (r.id||r._id||r.referenciaGestorId)!==rid);
        }
      } catch(_upd){}
    } catch(err){ console.error('[inline-del] erro', err); alert('Erro ao excluir o recurso.'); }
  }
} catch(_exp){}
// Handler global para ediÃ§Ã£o do recurso
try {
  window.__escEditRecurso = function(btn, rid){
    try {
      const recurso = (typeof state!=='undefined' && Array.isArray(state.recursos)) ? state.recursos.find(r=> (r.id||r._id||r.referenciaGestorId)===rid) : null;
      const trigger = document.querySelector('[data-open-modal-recurso]');
      if(trigger){
        trigger.click();
        setTimeout(()=>{ try { document.dispatchEvent(new CustomEvent('escala:editar-recurso-pendente', { detail:{ recurso } })); } catch(_){} }, 200);
        return;
      }
      alert('Editar recurso: '+(recurso && (recurso.nome||recurso.placa||rid) || rid));
    } catch(err){ console.warn('[escala][__escEditRecurso] falha abrir modal recurso', err); }
  }
} catch(_eEdit){}
  // ==== Turnos Modal Helpers (skeleton + open) ====
  function abrirPopupTurnos(grupo){
  const MODAL_ID = 'modalSelecionarTurnos';
  function ensureModalSkeleton(){
    let el = document.getElementById(MODAL_ID);
    if(!el){
      el = document.createElement('div');
      el.id = MODAL_ID;
      el.className = 'modal fade';
      el.innerHTML = (
        '<div class="modal-dialog modal-dialog-scrollable modal-turnos-reduzida">\n'
        +'<div class="modal-content">\n'
        +'<div class="modal-header justify-content-between"><h5 class="modal-title mb-0">Turnos</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>'
        +'<div class="modal-body p-0">\n'
        +'<div class="p-3 border-bottom">'
          +'<form class="row g-2 align-items-end" id="formSelecionarTurnos">'
            +'<div class="col-auto">'
              +'<label class="form-label fw-semibold mb-1">Início</label>'
              +'<input type="time" id="horaInicioTurno2" class="form-control form-control-sm">'
            +'</div>'
            +'<div class="col-auto">'
              +'<label class="form-label fw-semibold mb-1">Término</label>'
              +'<input type="time" id="horaFimTurno2" class="form-control form-control-sm">'
            +'</div>'
            +'<div class="col-auto d-flex align-items-end">'
              +'<button type="button" id="btnAddTurno2" class="btn btn-success btn-sm">Adicionar</button>'
            +'</div>'
          +'</form>'
        +'</div>'
        +'<div class="p-3">'
          +'<div class="table-responsive border rounded">'
            +'<table class="table table-sm align-middle mb-0" id="tabelaTurnosGrupo2">'
              +'<thead class="table-light"><tr><th>Início</th><th>Fim</th><th style="width:110px" class="text-center">Ação</th></tr></thead>'
              +'<tbody><tr class="text-muted"><td colspan="3" class="text-center small">Nenhum turno ainda</td></tr></tbody>'
            +'</table>'
          +'</div>'
        +'</div>'
        +'</div>'
        +'<div class="modal-footer">'
          +'<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>'
          +'<button type="button" class="btn btn-primary" id="btnConfirmarTurnosFinal">Confirmar</button>'
        +'</div>'
        +'</div>'
      );
      document.body.appendChild(el);
    }
    return el;
  }
  // Garantir referência ao elemento do modal para os seletores abaixo
  let el = ensureModalSkeleton();
  const iniEl = el.querySelector('#horaInicioTurno2');
  const fimEl = el.querySelector('#horaFimTurno2');
  const btnAdd = el.querySelector('#btnAddTurno2');
  // Seleciona botÃ£o Confirmar cobrindo ids usados nas variantes de modal e um fallback genÃ©rico na footer
  let btnConfirmar = el.querySelector('#btnConfirmarTurnosFinal, #btnConfirmarTurnos, [data-act="confirmar-turnos"], #btnSalvar');
  if(!btnConfirmar){ btnConfirmar = el.querySelector('.modal-footer .btn.btn-primary'); }
      const tbody = el.querySelector('#tabelaTurnosGrupo2 tbody');
      if(!tbody){ console.warn('[escala][turnos] tbody tabelaTurnosGrupo2 nÃ£o encontrado'); }
      // ForÃ§a desbloqueio dos inputs de hora (evita interferÃªncia de bloqueios gerais)
      function desbloquearInputsTurnos(){
        [iniEl, fimEl].forEach(inp=>{
          if(!inp) return;
          try {
            inp.removeAttribute('disabled'); inp.disabled=false;
            inp.removeAttribute('readonly'); inp.readOnly=false;
            inp.style.pointerEvents=''; inp.classList.remove('escala-field-locked');
            inp.setAttribute('autocomplete','off'); inp.setAttribute('inputmode','numeric');
            inp.tabIndex = 0;
          } catch(_d){}
        });
      }
      desbloquearInputsTurnos();
      try { el.addEventListener('shown.bs.modal', desbloquearInputsTurnos, { once:true }); } catch(_evt){}
      // Ao fechar a modal, nÃ£o altere a aba ativa; apenas re-renderize a lista de turnos
      function refreshTurnosUI(){
        try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_r1){}
        try { if(typeof window.forceRepaintTurnosList==='function') window.forceRepaintTurnosList(); } catch(_r2){}
        try { if(typeof window.renderMatrizesPorGrupo==='function') window.renderMatrizesPorGrupo(); } catch(_r3){}
        try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_r4){}
        try { document.dispatchEvent(new CustomEvent('escala:turnos:atualizados', { detail: { grupos: (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.gruposTurnos) || (typeof state!=='undefined'? state.gruposTurnos:[]) } })); } catch(_r5){}
        // ReforÃ§o: executar novamente apÃ³s pequenos atrasos
        setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){ } }, 60);
        setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){ } }, 180);
      }
  try { el.addEventListener('hidden.bs.modal', ()=>{ 
    console.debug('[escala][turnos] hidden.bs.modal fired (local listener) - forcing refresh');
    try { document.dispatchEvent(new CustomEvent('turnoAtualizado')); } catch(_evt){}
    // Re-render leve sem limpar o conteÃºdo; observer abaixo reforÃ§a contra sobrescritas
    // MutationObserver to detect overwrites after modal close
    const modalCloseTime = Date.now();
    setTimeout(() => {
      const tbl = document.getElementById('tabelaGruposTurnos');
      if (tbl) {
        const tbody = tbl.querySelector('tbody');
        if (tbody) {
          const observer = new MutationObserver((mutations) => {
            if (Date.now() - modalCloseTime < 500 && mutations.some(m => m.type === 'childList')) {
              console.debug('[escala][turnos] MutationObserver detected overwrite, re-rendering');
              renderGruposTurnos();
              observer.disconnect();
            }
          });
          observer.observe(tbody, { childList: true });
          setTimeout(() => observer.disconnect(), 500);
        }
      }
    }, 100); // Start observing after refresh completes
    // Additional re-render after modal close to ensure update (protegido)
  setTimeout(() => { try {
    const hadRows = (function(){
      const tbl=document.getElementById('tabelaGruposTurnos');
      const tb=tbl && tbl.querySelector('tbody');
      return !!(tb && tb.querySelector('tr') && !tb.querySelector('.text-muted'));
    })();
    // Se jÃ¡ havia linhas e o estado estÃ¡ temporariamente vazio, evita trocar por placeholder
    if(hadRows && (!window.__ESCALA_STATE__ || !Array.isArray(window.__ESCALA_STATE__.gruposTurnos) || window.__ESCALA_STATE__.gruposTurnos.length===0)){
      // aguardar ensureChange/fetch consolidar
      return;
    }
    renderGruposTurnos();
  } catch(_p){} }, 120);
    // Extra re-render with longer delay to ensure update
    setTimeout(() => { console.debug('[escala][turnos] extra re-render at 800ms'); try{ renderGruposTurnos(); }catch(_){ } }, 800);
  }); } catch(_evt2){}
    // Evita submit acidental do form
    const formSel = el.querySelector('#formSelecionarTurnos');
    if(formSel && !formSel.__noSubmit){ formSel.__noSubmit=true; formSel.addEventListener('submit', ev=> ev.preventDefault()); }

      // Working copy: nÃ£o altera state atÃ© salvar/confirmar
      let working = grupo ? JSON.parse(JSON.stringify(grupo)) : { id:null, nome:'', turnos:[] };
      // NormalizaÃ§Ã£o de formatos de turnos vindos do backend (vÃ¡rios possÃ­veis campos)
      if(Array.isArray(working.turnos)){
        working.turnos = working.turnos.map(t=>{
          const ini = t.ini || t.inicio || t.start || t.horaInicio || t.hi || '';
          const fim = t.fim || t.termino || t.end || t.horaFim || t.hf || '';
            return { ini, fim };
        }).filter(t=> t.ini && t.fim);
        // Remover duplicados
        const seen=new Set(); working.turnos = working.turnos.filter(t=>{ const k=t.ini+'_'+t.fim; if(seen.has(k)) return false; seen.add(k); return true; });
        working.turnos.sort((a,b)=> a.ini.localeCompare(b.ini));
      }
  const modoEdicao = !!grupo;

      // Preenche UI inicial
      if(iniEl) iniEl.value=''; if(fimEl) fimEl.value='';

      function renderTabela(){
        if(!tbody) return;
        if(!working.turnos.length){
          tbody.innerHTML = '<tr class="text-muted"><td colspan="3" class="text-center small">Nenhum turno ainda</td></tr>';
          return;
        }
    tbody.innerHTML = working.turnos.map((t,i)=>{
      return `<tr data-idx="${i}"><td class="text-center">${t.ini}</td><td class="text-center">${t.fim}</td><td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="del" data-idx="${i}">&times;</button></td></tr>`; }).join('');
      }
      // Permitir digitaÃ§Ã£o nos inputs de hora (nÃ£o bloquear eventos)
      function liberarDigitacaoHoras(){
        [iniEl, fimEl].forEach(inp=>{
          if(!inp) return;
          if(inp.__fixHora) return; inp.__fixHora=true;
          inp.addEventListener('keydown', (e)=>{ /* permitir tudo; sÃ³ trata Enter */ if(e.key==='Enter'){ e.preventDefault(); btnAdd?.click(); } }, false);
          inp.addEventListener('beforeinput', (e)=>{ /* nÃ£o bloquear */ }, false);
          inp.addEventListener('input', ()=>{
            // Normaliza para formato HH:MM
            let v = (inp.value||'').replace(/[^0-9:]/g,'');
            if(/^[0-9]{3,4}$/.test(v)){
              // 800 -> 08:00 ; 1330 -> 13:30
              if(v.length===3) v='0'+v;
              v = v.slice(0,2)+":"+v.slice(2,4);
            }
            // Limites simples
            const m=v.match(/^(\d{2}):(\d{2})$/);
            if(m){
              let hh=parseInt(m[1],10), mm=parseInt(m[2],10);
              if(hh>23) hh=23; if(mm>59) mm=59;
              inp.value = String(hh).padStart(2,'0')+":"+String(mm).padStart(2,'0');
            } else {
              inp.value=v;
            }
          }, false);
        });
      }
      liberarDigitacaoHoras();
      function validarTurno(ini,fim){
        if(!ini||!fim) return 'Informe inÃ­cio e tÃ©rmino';
        if(ini===fim) return 'InÃ­cio e tÃ©rmino iguais';
        const conflito = working.turnos.some(t=> (ini>=t.ini && ini<t.fim) || (fim>t.ini && fim<=t.fim) || (ini<=t.ini && fim>=t.fim));
        if(conflito) return 'Conflito com turno existente';
        return null;
      }
      function ensureTblGrupos(){ if(!els.tblGrupos){ els.tblGrupos = document.getElementById('tabelaGruposTurnos') || els.tblGrupos; } }
      let __saving=false;
      async function commitGrupo(){
        if(!working.turnos.length){ alert('Adicione pelo menos um turno.'); return false; }
        // Normaliza e ordena antes de salvar
        working.turnos = working.turnos.map(t=>({ ini:t.ini.trim(), fim:t.fim.trim() })).filter(t=> t.ini && t.fim);
        working.turnos.sort((a,b)=> a.ini.localeCompare(b.ini));
        const novo = !working.id;
        if(novo) working.id = 'g'+Math.random().toString(36).slice(2,10);
        // Recupera escalaId de forma agressiva se ainda nÃ£o estiver no estado
        if(!state.escalaId){
          try {
            const qid = (typeof obterQueryId==='function') ? obterQueryId() : null;
            const wid = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId) ? window.__ESCALA_STATE__.escalaId : null;
            const hidEl = document.querySelector('#escalaId,[name="escalaId"]');
            const hid = hidEl && (hidEl.value || hidEl.getAttribute('value'));
            state.escalaId = qid || wid || hid || state.escalaId;
          } catch(_idrec){ /* noop */ }
        }
        if(!state.escalaId){ alert('Salve os dados gerais primeiro para criar a escala antes de inserir turnos.'); return false; }
        if(__saving) return false; __saving=true; if(btnConfirmar){ btnConfirmar.disabled=true; btnConfirmar.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span> Salvando...'; }
        // EstratÃ©gia: tentar endpoint dedicado; se falhar (404/405 ou erro rede) tenta PUT completo
  let persisted=false; let tentouFallback=false;
  const turnosSrv = working.turnos.map(t=>({ ini: t.ini, fim: t.fim, overnight: (typeof t.overnight==='boolean'? t.overnight : false) }));
  const payloadGrupo = { grupo: { id: working.id, turnos: turnosSrv } };
        try {
          const url = novo ? basePath()+`/api/escalas/${state.escalaId}/grupos-turnos` : basePath()+`/api/escalas/${state.escalaId}/grupos-turnos/${encodeURIComponent(working.id)}`;
          const method = novo? 'POST':'PUT';
          const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(payloadGrupo) });
          if(res.ok){
            let data=null; try { data=await res.json(); } catch(_){}
            if(data && data.grupo && data.grupo.id) working.id = data.grupo.id;
            persisted=true;
          } else if([404,405].includes(res.status)) {
            console.warn('[escala][turnos] endpoint dedicado indisponÃ­vel, tentando fallback PUT completo', res.status);
          } else {
            const txt=await res.text(); console.warn('[escala][turnos] falha primÃ¡ria', res.status, txt);
          }
        } catch(err){ console.warn('[escala][turnos] erro rede endpoint dedicado', err); }
        if(!persisted){
          tentouFallback=true;
          try {
            // Fallback minimalista: tenta snake_case e caso falhe tenta camelCase
            const gruposForFallback=(function(){
              const map = new Map(state.gruposTurnos.map(g=> [g.id, { id:g.id, turnos:(g.turnos||[]).map(t=>({ ini:t.ini, fim:t.fim, overnight:(typeof t.overnight==='boolean'? t.overnight:false) })) }]));
              map.set(working.id, { id: working.id, turnos: (working.turnos||[]).map(t=>({ ini:t.ini, fim:t.fim, overnight:(typeof t.overnight==='boolean'? t.overnight:false) })) });
              return Array.from(map.values());
            })();
            const bodySnake={ grupos_turnos: gruposForFallback };
            let put = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(bodySnake) });
            if(put.ok){ persisted=true; }
            else {
              const txt1=await put.text(); console.warn('[escala][turnos] PUT snake_case falhou', put.status, txt1);
              const bodyCamel={ gruposTurnos: gruposForFallback };
              put = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(bodyCamel) });
              if(put.ok){ persisted=true; }
              else { const txt2=await put.text(); console.warn('[escala][turnos] PUT camelCase tambÃ©m falhou', put.status, txt2); }
            }
          } catch(e2){ console.error('[escala][turnos] erro fallback PUT completo', e2); }
        }
        if(!persisted){
          alert('NÃ£o foi possÃ­vel salvar o grupo de turnos no servidor. Nenhuma alteraÃ§Ã£o foi aplicada.');
          __saving=false; if(btnConfirmar){ btnConfirmar.disabled=false; btnConfirmar.textContent='Confirmar'; }
          return false;
        }
  console.debug('[escala][turnos] grupo persistido com sucesso', { id: working.id, turnos: working.turnos, fallback: tentouFallback });
        // AtualizaÃ§Ã£o otimista: merge no estado local e render imediato (garante novo grupo aparecer)
        try {
          const idxLocalPre = state.gruposTurnos.findIndex(g=> String(g.id)===String(working.id));
          if(idxLocalPre>=0) state.gruposTurnos[idxLocalPre] = { id: working.id, turnos: working.turnos.slice() };
          else state.gruposTurnos.push({ id: working.id, turnos: working.turnos.slice() });
          try { window.__ESCALA_STATE__ = state; } catch(_set){ }
          console.log('[debug] commitGrupo: state.gruposTurnos updated', state.gruposTurnos);
          // Render completo e destaque/atualizaÃ§Ã£o pontual da linha
          try { renderGruposTurnos(); } catch(_rAll){ console.error('[debug] renderGruposTurnos failed', _rAll); }
          try { updateTurnosRowDOM(working.id, working.turnos); } catch(_upd){ console.error('[debug] updateTurnosRowDOM failed', _upd); }
        } catch(_opt){ console.error('[debug] optimistic update failed', _opt); }
        // Recarrega do servidor para garantir consistÃªncia (id gerado, validaÃ§Ã£o, etc.)
        let reloaded=false;
        try {
          if(typeof carregarEscalaExistente==='function' && state.escalaId){
            await carregarEscalaExistente(state.escalaId);
            reloaded=true;
          }
        } catch(_r){ console.warn('[escala][turnos] falha ao recarregar escala apÃ³s salvar', _r); }
        // Dispara refresh explÃ­cito e reforÃ§os temporizados para garantir UI atualizada
  try { if(typeof window.refreshTurnosFromServer==='function') window.refreshTurnosFromServer({ silent:true, ensureChange:true }); } catch(_rf0){}
  setTimeout(()=>{ try { if(typeof window.refreshTurnosFromServer==='function') window.refreshTurnosFromServer({ silent:true, ensureChange:true }); } catch(_rf1){} }, 250);
        setTimeout(()=>{ try { renderGruposTurnos(); } catch(_r0){} }, 300);
  setTimeout(()=>{ try { if(typeof window.refreshTurnosFromServer==='function') window.refreshTurnosFromServer({ silent:true, ensureChange:true }); } catch(_rf2){} }, 800);
        if(!reloaded){
          // Atualiza localmente como Ãºltimo recurso
          const idxLocal = state.gruposTurnos.findIndex(g=> g.id===working.id);
          if(idxLocal>=0) state.gruposTurnos[idxLocal]=working; else state.gruposTurnos.push(working);
          window.__ESCALA_STATE__=state;
        }
  ensureTblGrupos();
  renderGruposTurnos();
        try { forceRepaintTurnosList(working.id); } catch(_fr){}
        renderMatrizesPorGrupo(); avaliarProgressaoAbas();
        __saving=false; if(btnConfirmar){ btnConfirmar.disabled=false; btnConfirmar.textContent='Confirmar'; }
        return true;
      }

      // Handlers
      if(btnAdd){
        btnAdd.onclick = ()=>{
          const ini = (iniEl && iniEl.value||'').trim();
          const fim = (fimEl && fimEl.value||'').trim();
          const err = validarTurno(ini,fim);
          if(err) return alert(err);
          working.turnos.push({ ini, fim });
          working.turnos.sort((a,b)=> a.ini.localeCompare(b.ini));
          if(iniEl) iniEl.value='';
          if(fimEl) fimEl.value='';
          renderTabela();
          if(iniEl) iniEl.focus();
        };
      }
      if(tbody){
        tbody.onclick = (ev)=>{
          const btn = ev.target.closest && ev.target.closest('button[data-act="del"]');
          if(!btn) return;
            const idx = +btn.getAttribute('data-idx');
            if(idx>=0){
              working.turnos.splice(idx,1);
              renderTabela();
            }
        };
      }
      if(btnConfirmar){
        btnConfirmar.textContent = 'Salvar';
        console.log('[debug] btnConfirmar found:', !!btnConfirmar);
        btnConfirmar.onclick = async (ev)=>{ 
          console.log('[debug] btnConfirmar onclick fired');
          window.__TURNOS_SALVOU = true; // mark as saved
          try{ ev.preventDefault(); ev.stopPropagation(); }catch(_e){}
          console.debug('[escala][turnos] confirmar click, turnos=', working.turnos);
          if(await commitGrupo()){
            const inst=bootstrap.Modal.getInstance(el)||new bootstrap.Modal(el);
            inst.hide();
            // MantÃ©m/forÃ§a a permanÃªncia na aba Turnos e deixa o listener global registrar no sessionStorage
            try {
              const turnosBtn = document.querySelector('[data-bs-target="#aba-turnos"]');
              if(turnosBtn && !turnosBtn.classList.contains('disabled')){
                const t = bootstrap.Tab.getOrCreateInstance(turnosBtn);
                t.show();
              }
            } catch(_tab){ /* noop */ }
            // MantÃ©m usuÃ¡rio na aba Turnos e re-render jÃ¡ foi feito antes
            try {
              const turnosBtn = document.querySelector('[data-bs-target="#aba-turnos"]');
              if(turnosBtn){ const t=bootstrap.Tab.getOrCreateInstance(turnosBtn); t.show(); }
            } catch(_keep){}
          }
        };
      }

      // Cancelar (qualquer botÃ£o com data-bs-dismiss jÃ¡ funciona) â€“ se era novo e nÃ£o salvou nada, nÃ£o mexe em state.
      renderTabela();
      if(modoEdicao){ console.debug('[escala][turnos] modo ediÃ§Ã£o, turnos prÃ©-carregados', working.turnos); }
      // Exibir modal de forma resiliente
      let modalInstance = null;
      try {
        if(window.bootstrap && bootstrap.Modal){
          modalInstance = bootstrap.Modal.getOrCreateInstance(el, { backdrop:'static', keyboard:false });
          modalInstance.show();
        } else {
          // Fallback visual: adiciona classes e atributos esperados pelo CSS do Bootstrap
          el.classList.add('show');
          el.style.display = 'block';
          el.removeAttribute('aria-hidden');
          el.setAttribute('aria-modal', 'true');
          el.removeAttribute('role');
          // backdrop simples
          let bd = document.querySelector('.modal-backdrop');
          if(!bd){
            bd = document.createElement('div');
            bd.className = 'modal-backdrop fade show';
            document.body.appendChild(bd);
          }
          document.body.classList.add('modal-open');
          // Fecha ao clicar em botÃµes com data-bs-dismiss
          el.querySelectorAll('[data-bs-dismiss="modal"]').forEach(x=>{
            x.addEventListener('click', ()=>{
              try{
                el.classList.remove('show');
                el.style.display='none';
                el.setAttribute('aria-hidden','true');
                el.removeAttribute('aria-modal');
                bd?.parentNode?.removeChild(bd);
                document.body.classList.remove('modal-open');
                // nÃ£o alterar aba ativa
                refreshTurnosUI();
                try { if(typeof window.refreshTurnosFromServer==='function') window.refreshTurnosFromServer({ silent:true }); } catch(_rfs){}
                try { if(typeof window.refreshTurnosDebounced==='function') window.refreshTurnosDebounced(); } catch(_rf){}
              }catch(_c){}
            }, { once:true });
          });
        }
      } catch(_bm){
        try {
          const mi = bootstrap?.Modal?.getOrCreateInstance?.(el, { backdrop:'static', keyboard:false });
          mi?.show?.();
        } catch(_){ /* ignora */ }
      }
  try { setTimeout(()=>{ iniEl?.focus(); }, 120); } catch(_f){}
      console.debug('[escala][turnos] modal exibida');
  }
  // Expor globalmente para fallback / depuraÃ§Ã£o
  try { if(!window.openPopupTurnos) window.openPopupTurnos = abrirPopupTurnos; } catch(_exposeTurnos){}
  // FunÃ§Ã£o auxiliar: abrir popup para criar novo grupo vazio
  function abrirPopupNovoGrupo(){
    try { console.debug('[escala][turnos] abrirPopupNovoGrupo acionado'); abrirPopupTurnos(null); } catch(e){ console.warn('[escala][turnos] falha abrirPopupNovoGrupo', e); }
  }
  try { if(!window.abrirPopupNovoGrupo) window.abrirPopupNovoGrupo = abrirPopupNovoGrupo; } catch(_e){}
  // ==== Bind para abrir a modal de turnos (versÃ£o robusta) ====
  async function excluirGrupoTurnoPorId(gid, triggerBtn){
    if(!gid) return false;
    try { console.log('[escala][grupos] iniciar exclusao grupo', gid, 'escalaId atual=', (state && state.escalaId)); } catch(_lg){}
    // Helper: valida se resposta é JSON com ok:true e não é redirect/HTML
    async function __respOk(r){
      try {
        if(!r) return false;
        if(r.redirected) return false;
        const ct = (r.headers && r.headers.get && (r.headers.get('content-type')||'')) || '';
        if(!/application\/json/i.test(ct)) return false;
        const js = await r.clone().json().catch(()=> null);
        return !!(js && js.ok === true);
      } catch(_e){ return false; }
    }
    // Anti reentrância por gid
    try {
      const pend = (window.__ESCALA_DEL_GRP_PENDING__ = window.__ESCALA_DEL_GRP_PENDING__ || new Set());
      if(pend.has(String(gid))){ console.warn('[escala][grupos] delete já em andamento para', gid); return false; }
      pend.add(String(gid));
    } catch(_pend){}
    // Recupera agressivamente o id da escala
    if(!state.escalaId){
      try { if(typeof getEscalaId==='function'){ const idTry=getEscalaId(); if(idTry) state.escalaId=idTry; } } catch(_gid){}
      try {
        const qid = (typeof obterQueryId==='function') ? obterQueryId() : null;
        const wid = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId) ? window.__ESCALA_STATE__.escalaId : null;
        const hidEl = document.querySelector('#escalaId,[name="escalaId"]');
        const hid = hidEl && (hidEl.value || hidEl.getAttribute('value'));
        state.escalaId = qid || wid || hid || state.escalaId;
      } catch(_idr){}
    }
  if(!state.escalaId){ console.warn('[escala][grupos] escalaId ausente ao excluir, abortando'); alert('Salve os dados gerais primeiro para criar a escala antes de excluir turnos.'); return false; }
  try { console.log('[escala][grupos] excluir: escalaId resolvido =', state.escalaId); } catch(_idlg){}
    const anterior = state.gruposTurnos.slice();
    let ok=false; const btnRef = triggerBtn && triggerBtn.tagName ? triggerBtn : null;
    let oldHtml=''; if(btnRef){ oldHtml = btnRef.innerHTML; btnRef.disabled=true; btnRef.innerHTML='<span class="spinner-border spinner-border-sm"></span>'; }
    if(state.escalaId && __deleteGrupoTurnoSuportado){
      try {
        const url1 = basePath()+`/api/escalas/${state.escalaId}/grupos-turnos/${encodeURIComponent(gid)}`;
        console.log('[escala][grupos] DELETE tentando', url1, 'gid=', gid);
        let r = await fetch(url1, { method:'DELETE', credentials:'same-origin', headers:{ 'Accept':'application/json' } });
        console.log('[escala][grupos] DELETE resposta ok=', r.ok, 'status=', r.status);
        if(!(await __respOk(r))){
          // tentar sem prefixo
          const url2 = `/api/escalas/${state.escalaId}/grupos-turnos/${encodeURIComponent(gid)}`;
          console.warn('[escala][grupos] DELETE falhou em', url1, 'status', r.status, '— tentando', url2);
          try { r = await fetch(url2, { method:'DELETE', credentials:'same-origin', headers:{ 'Accept':'application/json' } }); } catch(_f2){}
          console.log('[escala][grupos] DELETE fallback resposta ok=', r && r.ok, 'status=', r && r.status);
        }
  if(await __respOk(r)){ ok=true; console.log('[escala][grupos] DELETE OK para gid', gid); }
        else if(r && r.status===404){ __deleteGrupoTurnoSuportado=false; }
        else {
          let txt=''; try { txt = await r.text(); } catch(_t){}
          console.warn('[escala][grupos] DELETE falhou', r && r.status, txt);
          // Tentar alias POST .../delete para stacks que bloqueiam DELETE
          try {
            const urlAlias1 = basePath()+`/api/escalas/${state.escalaId}/grupos-turnos/${encodeURIComponent(gid)}/delete`;
            console.log('[escala][grupos] tentando POST alias delete', urlAlias1);
            let rp = await fetch(urlAlias1, { method:'POST', credentials:'same-origin', headers:{ 'Accept':'application/json' } });
            if(!(await __respOk(rp))){
              const urlAlias2 = `/api/escalas/${state.escalaId}/grupos-turnos/${encodeURIComponent(gid)}/delete`;
              console.log('[escala][grupos] tentando POST alias raiz', urlAlias2);
              try { rp = await fetch(urlAlias2, { method:'POST', credentials:'same-origin', headers:{ 'Accept':'application/json' } }); } catch(_af2){}
            }
            if(await __respOk(rp)) { ok=true; console.log('[escala][grupos] POST alias delete OK para gid', gid); } else console.warn('[escala][grupos] POST alias delete falhou', rp && rp && rp.status);
          } catch(_alias){ /* continua */ }
          // Tentar PATCH remover grupos
          if(!ok){
            try {
              const patchUrl1 = basePath()+`/api/escalas/${state.escalaId}`;
              console.log('[escala][grupos] tentando PATCH remover grupo em', patchUrl1);
              let pr = await fetch(patchUrl1, { method:'PATCH', headers:{'Content-Type':'application/json','Accept':'application/json'}, credentials:'same-origin', body: JSON.stringify({ gruposTurnosRemover:[String(gid)] }) });
              if(!(await __respOk(pr))){
                const patchUrl2 = `/api/escalas/${state.escalaId}`;
                console.log('[escala][grupos] tentando PATCH raiz remover grupo em', patchUrl2);
                try { pr = await fetch(patchUrl2, { method:'PATCH', headers:{'Content-Type':'application/json','Accept':'application/json'}, credentials:'same-origin', body: JSON.stringify({ gruposTurnosRemover:[String(gid)] }) }); } catch(_pf2){}
              }
              if(await __respOk(pr)) { ok=true; console.log('[escala][grupos] PATCH remover grupo OK para gid', gid); } else console.warn('[escala][grupos] PATCH remover grupo falhou', pr && pr.status);
            } catch(_patch){ /* segue para PUT overwrite */ }
          }
        }
      } catch(err){ console.warn('[escala][grupos] erro DELETE grupo-turno', err); __deleteGrupoTurnoSuportado=false; }
    }
    if(!ok){
      // Tentar remoção por equivalência de turnos (quando gid não é aceito/legado)
      try{
        // Obter turnos do grupo alvo a partir do estado anterior ou do DOM
        let alvoTurnos = [];
        try {
          const gAlvo = anterior.find(g=> String(g.id)===String(gid));
          if(gAlvo && Array.isArray(gAlvo.turnos)) alvoTurnos = gAlvo.turnos.map(t=> ({ ini:(t.ini||t.inicio||''), fim:(t.fim||t.termino||'') })).filter(t=> t.ini && t.fim);
        } catch(_galvo){}
        if(!(alvoTurnos && alvoTurnos.length)){
          try {
            const tbl = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
            const tr = tbl && tbl.querySelector(`tbody tr[data-id="${gid}"]`);
            const td = tr && tr.querySelector('td');
            const text = (td && td.textContent || '').trim();
            if(text){
              alvoTurnos = text.split('|').map(s=> s.trim()).map(p=>{ const m=p.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/); return m? { ini:m[1], fim:m[2] }: null; }).filter(Boolean);
            }
          } catch(_dom){ }
        }
        if(alvoTurnos && alvoTurnos.length){
          const urlRB1 = basePath()+`/api/escalas/${state.escalaId}/grupos-turnos/remove-by-turnos`;
          let rr = await fetch(urlRB1, { method:'POST', headers:{ 'Content-Type':'application/json','Accept':'application/json' }, credentials:'same-origin', body: JSON.stringify({ turnos: alvoTurnos }) });
          if(!(await __respOk(rr))){
            const urlRB2 = `/api/escalas/${state.escalaId}/grupos-turnos/remove-by-turnos`;
            try { rr = await fetch(urlRB2, { method:'POST', headers:{ 'Content-Type':'application/json','Accept':'application/json' }, credentials:'same-origin', body: JSON.stringify({ turnos: alvoTurnos }) }); } catch(_rb2){}
          }
          if(await __respOk(rr)){
            ok = true; console.log('[escala][grupos] remove-by-turnos OK');
          } else {
            console.warn('[escala][grupos] remove-by-turnos falhou');
          }
        }
      } catch(_rbt){ /* segue para PUT overwrite */ }
    }
    if(!ok){
      // Fallback: PUT overwrite com grupos restantes (tentar prefixo e raiz, camel e snake) e validar remoção de fato
      try{
        const restante = anterior.filter(g=> g.id!==gid).map(g=> ({ id:g.id, turnos:(g.turnos||[]).map(t=>({ ini:t.ini, fim:t.fim, overnight: (typeof t.overnight==='boolean'? t.overnight:false) })) }));
        const urls = [ basePath()+`/api/escalas/${state.escalaId}`, `/api/escalas/${state.escalaId}` ];
        const payloads = [ { key:'gruposTurnos', body:{ gruposTurnos: restante } }, { key:'grupos_turnos', body:{ grupos_turnos: restante } } ];
        for(const u of urls){
          for(const p of payloads){
            try {
              let put = await fetch(u, { method:'PUT', headers:{'Content-Type':'application/json','Accept':'application/json'}, credentials:'same-origin', body: JSON.stringify(p.body) });
              if(await __respOk(put)){
                // Verificar se realmente removeu consultando o endpoint de debug
                let removed=false;
                try {
                  let dbg = await fetch(basePath()+`/api/escalas/${state.escalaId}/__debug/grupos`, { credentials:'same-origin' });
                  let js=null; try{ js=await dbg.json(); }catch(_j){}
                  if(!(js && js.ok)){
                    dbg = await fetch(`/api/escalas/${state.escalaId}/__debug/grupos`, { credentials:'same-origin' });
                    try{ js=await dbg.json(); }catch(_j2){}
                  }
                  if(js && js.ok){
                    const ainda = Array.isArray(js.ids)? js.ids.some(x=> String(x)===String(gid)) : false;
                    removed = !ainda;
                  }
                } catch(_ver){ /* segue */ }
                if(removed){ ok=true; console.log('[escala][grupos] PUT overwrite', p.key, 'OK em', u, '— grupo removido confirmado'); break; }
                else { console.warn('[escala][grupos] PUT overwrite', p.key, 'retornou OK em', u, 'mas grupo ainda presente — tentando próxima variação'); }
              } else {
                const txt=await put.text().catch(()=> ''); console.warn('[escala][grupos] PUT overwrite', p.key, 'falhou', put.status, 'em', u, txt);
              }
            } catch(_pu){ /* tenta próxima combinação */ }
          }
          if(ok) break;
        }
      } catch(err2){ console.error('[escala][grupos] erro fallback PUT overwrite', err2); }
    }
  if(!ok){ console.error('[escala][grupos] falha final ao excluir gid', gid); try{ window.__escalaToastError && window.__escalaToastError('Falha ao excluir o grupo de turnos.'); }catch(_t){} if(btnRef){ btnRef.disabled=false; btnRef.innerHTML=oldHtml; } try{ window.__ESCALA_DEL_GRP_PENDING__?.delete?.(String(gid)); }catch(_cpend){} return false; }
    // Sucesso: atualizar estado local e UI imediatamente (como no fluxo de salvar/editar)
    try {
      const novaLista = anterior.filter(g=> String(g.id) !== String(gid));
      state.gruposTurnos = novaLista;
      try { window.__ESCALA_STATE__ = state; } catch(_ex){}
      try { window.__LAST_DELETED_GRUPO_ID__ = gid; } catch(_ld){}
      // Re-render imediato da tabela
      try { renderGruposTurnos(); } catch(_r0){}
      // Injeção direta (último recurso) para refletir a nova lista
      try {
        const tbl = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
        if(tbl){
          const tbody = tbl.querySelector('tbody');
          if(tbody){
            const __fmt = (t)=>{ const ini=t?.ini||t?.inicio||t?.start||t?.hora_inicio||t?.horaInicio||t?.hi||''; const fim=t?.fim||t?.termino||t?.end||t?.hora_fim||t?.horaFim||t?.hf||''; return { ini, fim }; };
            const html = (Array.isArray(novaLista) && novaLista.length) ? novaLista.map(g=>{
              const tHtml = (Array.isArray(g.turnos) && g.turnos.length) ? g.turnos.map(t=>{ const f=__fmt(t); return `${f.ini} - ${f.fim}`; }).join(' | ') : '(sem turnos)';
              return `<tr data-id="${g.id}"><td class="py-1 small text-center">${tHtml}</td><td class="text-center grupos-col-acoes"><button type="button" class="btn btn-sm btn-outline-primary" data-act="edit-grupo" title="Editar"><i class="bi bi-pencil"></i></button><button type="button" class="btn btn-sm btn-outline-danger" data-act="del-grupo" title="Excluir"><i class="bi bi-trash"></i></button></td></tr>`;
            }).join('') : '<tr class="text-muted"><td colspan="2" class="text-center">Nenhum grupo cadastrado.</td></tr>';
            tbody.innerHTML = html;
            // Estabilizador contra sobrescritas tardias
            try {
              const expected = tbody.innerHTML; const startedAt = Date.now();
              const mo = new MutationObserver(()=>{ if(Date.now() - startedAt > 1000){ mo.disconnect(); return; } if(tbody.innerHTML !== expected){ tbody.innerHTML = expected; } });
              mo.observe(tbody, { childList:true, subtree:false }); setTimeout(()=> mo.disconnect(), 1200);
            } catch(_mo){}
          }
        }
      } catch(_inj){}
      // Disparar eventos e reforços para manter consistência
      try { document.dispatchEvent(new CustomEvent('turnoAtualizado')); } catch(_evt){}
      try { if(typeof window.refreshTurnosFromServer==='function') window.refreshTurnosFromServer({ silent:true, ensureChange:true }); } catch(_rf){}
      setTimeout(()=>{ try { renderGruposTurnos(); } catch(_){ } }, 120);
      setTimeout(()=>{ try { if(typeof window.refreshTurnosFromServer==='function') window.refreshTurnosFromServer({ silent:true, ensureChange:true }); } catch(_){ } }, 300);
      setTimeout(()=>{ try { renderGruposTurnos(); } catch(_){ } }, 600);
      // Verificação final: se a linha ainda existir no DOM após atrasos, forçar reload único
      try {
        setTimeout(()=>{
          try {
            const tbl = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
            const tr = tbl ? tbl.querySelector(`tbody tr[data-id="${gid}"]`) : null;
            if(tr && !window.__ESCALA_FORCED_RELOAD_ONCE__){ window.__ESCALA_FORCED_RELOAD_ONCE__=true; location.reload(); }
          } catch(_vf){}
        }, 900);
      } catch(_vfOuter){}
      // Consolidar com backend
        try { await carregarEscalaExistente?.(state.escalaId); } catch(_r){}
        // Verificação adicional via endpoint debug de ids
        try {
          const dbg1 = await fetch(basePath()+`/api/escalas/${state.escalaId}/__debug/grupos`, { credentials:'same-origin' });
          let js=null; try{ js=await dbg1.json(); }catch(_j){}
          if(!(js && js.ok)){
            const dbg2 = await fetch(`/api/escalas/${state.escalaId}/__debug/grupos`, { credentials:'same-origin' });
            try{ js=await dbg2.json(); }catch(_j2){}
          }
          if(js && js.ok){
            const ainda = Array.isArray(js.ids)? js.ids.some(x=> String(x)===String(gid)) : false;
            if(ainda && !window.__ESCALA_FORCED_RELOAD_ONCE__){ window.__ESCALA_FORCED_RELOAD_ONCE__=true; location.reload(); }
          }
        } catch(_dbg){}
      renderMatrizesPorGrupo?.(); avaliarProgressaoAbas?.();
    } catch(_up){}
    if(btnRef){ btnRef.disabled=false; btnRef.innerHTML=oldHtml; }
    try{ window.__ESCALA_DEL_GRP_PENDING__?.delete?.(String(gid)); }catch(_cpend2){}
    try { window.__escalaToastSuccess && window.__escalaToastSuccess('Sucesso ao excluir o grupo de turnos.'); } catch(_toast){}
    return true;
  }
  // expÃµe para uso em fallbacks/handlers globais
  try { window.__excluirGrupoTurnoPorIdImpl = excluirGrupoTurnoPorId; window.excluirGrupoTurnoPorId = excluirGrupoTurnoPorId; } catch(_e){}
  function bindAbrirPopupTurnosOnce() {
    if (window.__bindTurnosBound) return;
    window.__bindTurnosBound = true;
    // Usa boolean para capture evitando objeto com vÃ­rgula final acidental
    document.addEventListener('click', function (ev) {
      if(!ev || !ev.target) return;
      const btn = ev.target.closest && ev.target.closest('[data-action="abrir-turnos"]');
      if (btn) {
        try { abrirPopupTurnos(); } catch(e){ console.warn('[escala][turnos] erro ao abrir popup via delegated', e); }
      }
      // ExclusÃ£o de grupo de turnos (delegado global)
      const del = ev.target.closest && ev.target.closest('button[data-act="del-grupo"]');
      if(del){
        ev.preventDefault();
        const tr = del.closest('tr[data-id]'); const gid = tr && tr.getAttribute('data-id');
        if(!gid) return;
        if(typeof window.__askDeleteGrupoTurno==='function') return window.__askDeleteGrupoTurno(gid, del, ev);
        if(!confirm('Excluir este grupo de turnos?')) return;
        excluirGrupoTurnoPorId(gid, del);
      }
    }, true);
  }
  async function persistirGruposTurnosImediato(){
    if(!state.created || !state.escalaId) return; 
    try {
      const payload = { grupos: state.gruposTurnos.map(g=>({ id:g.id, turnos:g.turnos })) };
      console.debug('[escala][stub] persistirGruposTurnosImediato', payload);
      // PUT real comentado
    } catch(e){ console.warn('[escala] falha persistir grupos turnos', e); }
  }
  async function salvarEscala(validar, opts){
    const options = opts || {};
    if(!state.created){ return alert('Salve os dados gerais primeiro.'); }
    // Evita reentrÃ¢ncia: se jÃ¡ houver um save em andamento, retorna a mesma promessa
    if(window.__ESC_SAVING_ALOC_ACTIVE__){
      return window.__ESC_SAVING_ALOC_PROMISE__ || Promise.resolve();
    }
    window.__ESC_SAVING_ALOC_ACTIVE__ = true;
    window.__ESC_SAVING_ALOC_PROMISE__ = (async ()=>{
      try {
        const payload={ id: state.escalaId, validar: !!validar, gruposTurnos: state.gruposTurnos.map(g=>({ id:g.id, turnos:g.turnos })), equipes: state.equipes.map(e=>({ ...e })), alocacao: state.matrizAlocacao };
        console.debug('[escala][stub] salvarEscala PUT payload', payload);
        // Tentar PUT com prefixo
        let res = await fetch(basePath()+`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(payload) });
        if(!res.ok && (res.status===404 || res.status===405)){
          // Tentar sem prefixo
          res = await fetch(`/api/escalas/${state.escalaId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(payload) });
        }
        if(res.ok){
          console.log('[escala] AlocaÃ§Ãµes salvas com sucesso');
          if(!options.silent){ alert('AlocaÃ§Ãµes salvas com sucesso.'); }
        } else {
          const txt = await res.text().catch(()=> 'Erro desconhecido');
          console.error('[escala] Falha ao salvar alocaÃ§Ãµes:', res.status, txt);
          if(!options.silent){ alert('Falha ao salvar alocaÃ§Ãµes: ' + txt); }
        }
      } catch(e){ if(!options.silent){ alert('Erro salvar escala: '+(e.message||e)); } }
      finally {
        // libera com leve atraso para evitar quick re-toggle em cascata
        setTimeout(()=>{ window.__ESC_SAVING_ALOC_ACTIVE__=false; window.__ESC_SAVING_ALOC_PROMISE__=null; }, 50);
      }
    })();
    return window.__ESC_SAVING_ALOC_PROMISE__;
  }
  function executarValidacaoConflitos(){
    // Executa varredura de conflitos entre alocaÃ§Ãµes (mesmo funcionÃ¡rio alocado em outro lugar no mesmo dia/faixa),
    // e levanta avisos nÃ£o bloqueantes (alocaÃ§Ãµes com equipe vazia; recursos sem atribuiÃ§Ãµes)
    (async()=>{
      try {
        const btn = document.getElementById('btnValidarEscala');
        const cont = document.getElementById('validacaoResultados') || (function(){ const c=document.createElement('div'); c.id='validacaoResultados'; (document.getElementById('aba-validacao')||document.body).appendChild(c); return c; })();
        // UI inicial de progresso
        cont.innerHTML = '<div id="validacaoStatus" class="small text-muted mb-1">Preparando validação…</div>'+
                         '<div class="progress" style="height:6px"><div id="validacaoBar" class="progress-bar progress-bar-striped progress-bar-animated" style="width:0%"></div></div>'+
                         '<div id="validacaoResumo" class="mt-2"></div>';
        const statusEl = document.getElementById('validacaoStatus');
        const barEl = document.getElementById('validacaoBar');
        const resumoEl = document.getElementById('validacaoResumo');
        let lastUpd = 0;
        function setProgress(stageLabel, done, total){
          try{
            const now=Date.now();
            if(now - lastUpd < 80) return; // evita thrash
            lastUpd = now;
            const pct = total>0 ? Math.min(100, Math.floor(done*100/total)) : 0;
            if(barEl) barEl.style.width = pct+'%';
            if(statusEl) statusEl.textContent = `${stageLabel} ${done}/${total}`;
          }catch(_){ }
        }
        if(btn){ btn.disabled=true; btn.dataset._txt = btn.dataset._txt || btn.innerText; btn.innerText='Validando...'; }

        // Garantir dados essenciais
        ensureEscalaId();
        normalizarDatasPeriodoParaEstado();
        const periodo = { ini: state.periodo.ini, fim: state.periodo.fim };
  if(!periodo.ini || !periodo.fim){ cont.innerHTML = '<div class="alert alert-warning">Defina o período na aba Dados Gerais antes de validar.</div>'; if(btn){ btn.disabled=false; btn.innerText=btn.dataset._txt; } return; }
        if(!Array.isArray(state.equipes) || state.equipes.length===0){ cont.innerHTML = '<div class="alert alert-warning">Cadastre ao menos uma equipe com componentes antes de validar.</div>'; if(btn){ btn.disabled=false; btn.innerText=btn.dataset._txt; } return; }

    // Yield inicial para liberar o thread do clique e iniciar processamento assíncrono
    await new Promise(r=>setTimeout(r,0));

        const eqById = new Map();
        (state.equipes||[]).forEach(e=>{ if(e&&e.id) eqById.set(String(e.id), e); });

        // 1) Montar checagens Ãºnicas: funcionarioId|dia|ini|fim
        const checks = new Map();
        const warningsEmptyAlloc = [];
        const matriz = state.matrizAlocacao || {};
        const entriesMat = Object.entries(matriz);
        for(let i=0;i<entriesMat.length;i++){
          const [key, valor] = entriesMat[i];
          if(!valor) { if(i%200===0) await new Promise(r=>setTimeout(r,0)); continue; }
          const [turnoFull, diaISO] = String(key).split('|');
          const [_grupoId, faixa] = String(turnoFull||'').split('::');
          const m = (faixa||'').match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
          const ini = m? m[1]: ''; const fim = m? m[2]: '';
          const eqIds = String(valor).split(',').map(s=>s.trim()).filter(Boolean);
          for(const eid of eqIds){
            const eq = eqById.get(String(eid));
            const comps = Array.isArray(eq?.componentes)? eq.componentes : [];
            if(comps.length===0){
              warningsEmptyAlloc.push({ tipo:'alocacao-vazia', equipe: eq?.nome||eid, dia: diaISO, ini, fim });
            }
            for(const c of comps){
              const funcId = c.funcionario_id || c.id || c._id || null;
              if(!funcId || !diaISO || !ini || !fim) continue;
              const k = String(funcId)+'|'+diaISO+'|'+ini+'|'+fim;
              if(!checks.has(k)) checks.set(k, { funcId, dia:diaISO, ini, fim, equipe: eq?.nome||null });
            }
          }
          if(i%200===0){ setProgress('Preparando dados', i, entriesMat.length); await new Promise(r=>setTimeout(r,0)); }
        }

        // 2) Executar consultas de conflito para cada checagem Ãºnica
        const severeConflicts = [];
        const total = checks.size; let done = 0;
        const base = basePath();
        async function checkOne(ch){
          try {
            const q = new URLSearchParams({ funcionarioId:String(ch.funcId), dia:String(ch.dia), ini:String(ch.ini), fim:String(ch.fim) });
            if(state.escalaId) q.set('excludeId', state.escalaId);
            const url = base+`/api/funcionario/conflitos-alocacao?`+q.toString();
            const r = await fetch(url, { credentials:'same-origin' });
            if(!r.ok){ return; }
            const js = await r.json().catch(()=>null);
            const confl = js && (js.conflito===true || (Array.isArray(js.matches) && js.matches.length>0));
            if(confl){ severeConflicts.push({ funcionarioId: ch.funcId, dia: ch.dia, ini: ch.ini, fim: ch.fim, equipe: ch.equipe||null, detalhes: (js && js.matches)||[] }); }
          } catch(_e){ /* ignora erro isolado */ }
          finally { done++; setProgress('Etapa 1/3 — Conflitos', done, total); }
        }
        async function tryBatchConflitos(arr){
          if(!Array.isArray(arr) || arr.length===0) return true;
          try {
            const items = arr.map(ch=> ({ funcionarioId:String(ch.funcId), dia:String(ch.dia), ini:String(ch.ini), fim:String(ch.fim), clientKey: `${ch.funcId}|${ch.dia}|${ch.ini}|${ch.fim}` }));
            const resp = await fetch(base+`/api/funcionarios/conflitos-alocacao/lote`, { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ excludeId: state.escalaId||undefined, items }) });
            if(!resp.ok) return false;
            const js = await resp.json().catch(()=>null); if(!js || !Array.isArray(js.results)) return false;
            const byClient = new Map(js.results.map(r=> [String(r.clientKey||r.key||''), r]));
            let i=0; for(const ch of arr){
              const k = `${ch.funcId}|${ch.dia}|${ch.ini}|${ch.fim}`;
              const r = byClient.get(k);
              if(r && (r.conflito || (Array.isArray(r.matches) && r.matches.length>0))){
                severeConflicts.push({ funcionarioId: ch.funcId, dia: ch.dia, ini: ch.ini, fim: ch.fim, equipe: ch.equipe||null, detalhes: Array.isArray(r.matches)? r.matches : [] });
              }
              i++; if(i%100===0){ setProgress('Etapa 1/3 — Conflitos', i, arr.length); await new Promise(rr=>setTimeout(rr,0)); }
            }
            setProgress('Etapa 1/3 — Conflitos', arr.length, arr.length);
            return true;
          } catch(_e){ return false; }
        }
        // Rodar checks: tenta lote e cai no fallback se necessário
        const arrChecks = Array.from(checks.values());
        const concurrency = 8; // balanceia carga
        let batchOk = false;
        if(arrChecks.length>0){ batchOk = await tryBatchConflitos(arrChecks); }
        if(!batchOk){
          for(let i=0; i<arrChecks.length; i+=concurrency){
            await Promise.all(arrChecks.slice(i, i+concurrency).map(ch=> checkOne(ch)));
            // yield leve entre lotes para liberar UI
            await new Promise(r=>setTimeout(r,0));
          }
        }

  // 3) Avisos: recursos sem atribuições (resumo por recurso)
        const warningsRecursos = [];
        try {
          const recs = Array.isArray(state.recursos)? state.recursos: [];
          recs.forEach(r=>{
            const temAtrib = Array.isArray(r.atribuicoes) ? r.atribuicoes.length>0 : false;
            const temAloc = r.matrizAlocacao && typeof r.matrizAlocacao==='object' && Object.keys(r.matrizAlocacao).length>0;
            if(!temAtrib && !temAloc){
              const placa = r.placa || r.codigo || '';
              const marca = r.marca || r.fabricante || '';
              const modelo = r.modelo || r.versao || '';
              const label = [placa, marca, modelo].filter(Boolean).join(' - ') || (r.nome || r.descricao || 'Recurso');
              warningsRecursos.push({ tipo:'recurso-sem-atribuicao', recurso: label, id: r.id||r._id||r.referenciaGestorId||'' });
            }
          });
        } catch(_rr){}

  // 3.1) Resumos solicitados: dias com alocaÃ§Ãµes vazias; equipes vazias por indisponibilidade; recursos sem funcionÃ¡rios por dia
        const diasUsadosSet = new Set();
        const emptyAllocDays = new Set(); // dias com cÃ©lula sem equipe
        const emptyPerTurno = new Map(); // turno(HH:MM-HH:MM) -> Set(dias)
        const eqAllocDays = new Map(); // eqId -> Set(dias ISO) em que foi alocada
        // Gera todos os dias no perÃ­odo
        function gerarDias(iniISO, fimISO){ const out=[]; let d=new Date(iniISO+'T00:00:00'); const end=new Date(fimISO+'T00:00:00'); while(d<=end){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1);} return out; }
        const diasRange = gerarDias(periodo.ini, periodo.fim);
        diasRange.forEach(d=> diasUsadosSet.add(d));
        // Percorre todos os grupos/turnos/dias para identificar cÃ©lulas vazias por turno
        // Varredura de células vazias por turno/dia com yields
        const grupos = Array.isArray(state.gruposTurnos)? state.gruposTurnos : [];
        let scanCount=0; const scanTotal = grupos.reduce((acc,g)=> acc + (Array.isArray(g.turnos)? g.turnos.length:0) * diasRange.length, 0);
        for(const grupo of grupos){
          const turnos = Array.isArray(grupo?.turnos)? grupo.turnos: [];
          for(const t of turnos){
            const turnoStr = `${t.ini}-${t.fim}`;
            for(const diaISO of diasRange){
              const key = `${grupo.id}::${turnoStr}|${diaISO}`;
              const val = String(matriz[key]||'').trim();
              if(!val){
                emptyAllocDays.add(diaISO);
                if(!emptyPerTurno.has(turnoStr)) emptyPerTurno.set(turnoStr, new Set());
                emptyPerTurno.get(turnoStr).add(diaISO);
              }
              scanCount++;
              if(scanCount % 500 === 0){ setProgress('Pré-varredura', scanCount, Math.max(scanTotal,1)); await new Promise(r=>setTimeout(r,0)); }
            }
          }
        }
        // Mapa dos dias em que cada equipe foi efetivamente alocada (com base nas entradas existentes)
        Object.entries(matriz).forEach(([key, valor])=>{
          const [_, diaISO] = String(key).split('|');
          const val = String(valor||'').trim(); if(!val) return;
          const eqIds = val.split(',').map(s=>s.trim()).filter(Boolean);
          if(diaISO){ eqIds.forEach(eid=>{ if(!eqAllocDays.has(eid)) eqAllocDays.set(eid, new Set()); eqAllocDays.get(eid).add(diaISO); }); }
        });
        // Disponibilidade por funcionÃ¡rio/dia (cache)
        const dispCache = new Map();
        async function checkDisponibilidadeDia(funcId, diaISO){
          const k = String(funcId)+'|'+diaISO;
          if(dispCache.has(k)) return dispCache.get(k);
          let livre=false;
          try {
            const url = base+`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(funcId)}&inicio=${diaISO}&fim=${diaISO}`;
            const r = await fetch(url, { credentials:'same-origin' });
            if(r.ok){
              const js = await r.json().catch(()=>null);
              // Mesmo contrato do modal: resposta { ok, data: { free: [...] } }
              const dados = js && (js.data || js) || {};
              const arr = Array.isArray(dados.free) ? dados.free : (Array.isArray(js?.free) ? js.free : []);
              livre = Array.isArray(arr) && arr.some(int=> String(int.inicio).slice(0,10)<=diaISO && String(int.fim).slice(0,10)>=diaISO);
            }
          } catch(_e){}
          dispCache.set(k, livre); return livre;
        }
        // Equipes efetivamente vazias por indisponibilidade (por dia)
        const equipeVaziaPorDia = new Map(); // eqNome -> Set(dias ISO)
        // Percorre cada dia/equipe alocada e verifica se hÃ¡ pelo menos 1 componente disponÃ­vel
        const diasUsados = Array.from(diasUsadosSet);
        // Pré-carregar disponibilidade em lote para (funcId,dia) usados nesta etapa
        try {
          const needPairs = new Map(); // key fid|dia -> { funcionarioId, dia }
          for(const [key, valor] of Object.entries(matriz)){
            const [turnoFull, diaISO] = String(key).split('|'); if(!diaISO) continue; const val = String(valor||'').trim(); if(!val) continue;
            const eqIds = val.split(',').map(s=>s.trim()).filter(Boolean);
            for(const eid of eqIds){
              const eq = eqById.get(String(eid)); const comps = Array.isArray(eq?.componentes)? eq.componentes : [];
              for(const c of comps){ const fid = c.funcionario_id || c.id || c._id; if(!fid) continue; const k = `${fid}|${diaISO}`; if(!dispCache.has(k)) needPairs.set(k, { funcionarioId: fid, dia: diaISO }); }
            }
          }
          const items = Array.from(needPairs.values());
          if(items.length){
            setProgress('Etapa 2/3 — Disponibilidade (pré-carregando)', 0, items.length);
            const resp = await fetch(base+`/api/funcionarios/disponibilidade`, { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ items }) });
            if(resp.ok){ const js = await resp.json().catch(()=>null); const arr = Array.isArray(js?.results) ? js.results : [];
              let i=0; for(const r of arr){ const k = `${r.funcionarioId||''}|${r.dia||''}`; if(r && typeof r.livre==='boolean') dispCache.set(k, !!r.livre); i++; if(i%200===0){ setProgress('Etapa 2/3 — Disponibilidade (pré-carregando)', i, arr.length); await new Promise(rr=>setTimeout(rr,0)); } }
              setProgress('Etapa 2/3 — Disponibilidade (pré-carregando)', items.length, items.length);
            }
          }
        } catch(_pre){ /* fallback para chamadas individuais em checkDisponibilidadeDia */ }
        const entriesMatriz = Object.entries(matriz);
        let step2Done = 0;
        const step2Total = entriesMatriz.reduce((acc, [key, valor])=>{
          const val = String(valor||'').trim(); if(!val) return acc;
          const eqIds = val.split(',').map(s=>s.trim()).filter(Boolean); return acc + eqIds.length;
        }, 0);
        for(const [key, valor] of entriesMatriz){
          const [turnoFull, diaISO] = String(key).split('|'); if(!diaISO) continue;
          const turnoMatch = String(turnoFull||'').match(/::(\d{2}:\d{2}-\d{2}:\d{2})$/);
          const turnoStr = turnoMatch ? turnoMatch[1] : '';
          const eqIds = String(valor||'').split(',').map(s=>s.trim()).filter(Boolean);
          for(const eid of eqIds){
            const eq = eqById.get(String(eid));
            const eqNome = (eq && (eq.nome||eq.codigo)) || String(eid);
            const comps = Array.isArray(eq?.componentes)? eq.componentes : [];
            if(comps.length===0){
              if(!equipeVaziaPorDia.has(eqNome)) equipeVaziaPorDia.set(eqNome, new Set());
              equipeVaziaPorDia.get(eqNome).add(diaISO);
              step2Done++; setProgress('Etapa 2/3 — Disponibilidade', step2Done, Math.max(step2Total,1));
              continue;
            }
            // Checa se algum componente estÃ¡ disponÃ­vel nesse dia
            let algumLivre=false;
            for(const c of comps){
              const fid = c.funcionario_id || c.id || c._id; if(!fid) continue;
              const ok = await checkDisponibilidadeDia(fid, diaISO);
              if(ok){ algumLivre=true; break; }
            }
            // Marca vazio por dia se ninguÃ©m estiver disponÃ­vel neste turno; para granularidade futura por turno poderÃ­amos particionar por turno.
            if(!algumLivre){ if(!equipeVaziaPorDia.has(eqNome)) equipeVaziaPorDia.set(eqNome, new Set()); equipeVaziaPorDia.get(eqNome).add(diaISO); }
            step2Done++; setProgress('Etapa 2/3 — Disponibilidade', step2Done, Math.max(step2Total,1));
            if(step2Done % 25 === 0){ await new Promise(r=>setTimeout(r,0)); }
          }
        }
        // Resumo geral de dias vazios (sem equipe OU equipe efetivamente vazia)
        const diasEquipeVaziaSet = new Set(Array.from(equipeVaziaPorDia.values()).flatMap(s=> Array.from(s)));
        const diasVaziosGeral = new Set([...emptyAllocDays, ...diasEquipeVaziaSet]);
        // Recursos: dias sem atribuiÃ§Ã£o de funcionÃ¡rio
        const recursosResumo = [];
        try {
          const recs = Array.isArray(state.recursos)? state.recursos: [];
          // Mapear dias alocados por equipe (jÃ¡ temos em eqAllocDays)
          const idToEqNome = new Map((state.equipes||[]).map(e=> [String(e.id), e.nome||e.codigo||'EQ']));
          function extrairDiasAtrib(r){
            const s = new Set(); (r.atribuicoes||[]).forEach(a=>{
              const d = (a && (a.dia||a.dataISO||a.data||a.inicio||a.start||'')).toString().slice(0,10);
              if(d) s.add(d);
            }); return s;
          }
          recs.forEach(r=>{
            const eqId = r.equipeId || r.equipe_id || (r.equipe && (r.equipe.id||r.equipe._id)) || null;
            if(!eqId) return;
            const diasEq = eqAllocDays.get(String(eqId)); if(!diasEq || diasEq.size===0) return;
            const atribu = extrairDiasAtrib(r);
            const faltantes = Array.from(diasEq).filter(d=> !atribu.has(d));
            if(faltantes.length){
              const placa = r.placa || r.codigo || '';
              const marca = r.marca || r.fabricante || '';
              const modelo = r.modelo || r.versao || '';
              const label = [placa, marca, modelo].filter(Boolean).join(' - ') || (r.nome || r.descricao || 'Recurso');
              recursosResumo.push({ recurso: label, dias: faltantes.sort() });
            }
          });
        } catch(_res){ }

  // Lista por turno de dias vazios (somente cÃ©lulas sem equipe)
  const resumoVaziosPorTurno = Array.from(emptyPerTurno.entries()).map(([turno,setDias])=> ({ turno, dias: Array.from(setDias).sort() }));

  // 4) Resolver nomes de funcionÃ¡rios e informaÃ§Ãµes das escalas conflitantes, e agrupar por funcionÃ¡rio
        const nomeCache = new Map();
        const escInfoCache = new Map();
        async function resolveFuncionarioNome(fid){
          if(!fid) return String(fid||'');
          if(nomeCache.has(fid)) return nomeCache.get(fid);
          // 4.1) tenta mapear via equipes atuais
          try {
            for(const e of (state.equipes||[])){
              for(const c of (e.componentes||[])){
                const idCand = c.funcionario_id || c.id || c._id;
                if(String(idCand)===String(fid)){
                  const nome = c.nome || c.descricao || c.label || String(fid);
                  nomeCache.set(fid, nome);
                  return nome;
                }
              }
            }
          } catch(_e){ }
          // 4.2) consulta backend
          try {
            const url = base+`/api/funcionarios/busca-codigo?id=${encodeURIComponent(String(fid))}`;
            const r = await fetch(url, { credentials:'same-origin' });
            if(r.ok){ const js = await r.json().catch(()=>null); const nome = js?.data?.nome || js?.data?.descricao || null; if(nome){ nomeCache.set(fid, nome); return nome; } }
          } catch(_f){}
          const fallback = String(fid); nomeCache.set(fid, fallback); return fallback;
        }
        async function resolveEscalaInfo(eid){
          if(!eid) return null;
          if(escInfoCache.has(eid)) return escInfoCache.get(eid);
          try {
            const tries = [ base+`/api/escalas/${encodeURIComponent(eid)}`, `/api/escalas/${encodeURIComponent(eid)}` ];
            let js=null;
            for(const u of tries){ const r=await fetch(u,{credentials:'same-origin'}); if(r && r.ok){ js = await r.json().catch(()=>null); if(js) break; } }
            const d = js && (js.data||js.escala||js) || null;
            if(d){
              const info = { id: d.id||d._id||eid, nome: d.descricao || d.titulo || d.nome || ('Escala '+(d.id||d._id||eid)), classificacao: d.classificacao||null };
              escInfoCache.set(eid, info); return info;
            }
          } catch(_e){ }
          const info = { id: eid, nome: 'Escala '+String(eid), classificacao: null };
          escInfoCache.set(eid, info); return info;
        }

        // Monta agrupamento por funcionÃ¡rio
        const grupoPorFunc = new Map();
        severeConflicts.forEach(c=>{
          const fid = c.funcionarioId; if(!fid) return;
          if(!grupoPorFunc.has(fid)) grupoPorFunc.set(fid, { funcionarioId: fid, conflitos: [], escalasSet: new Set() });
          const g = grupoPorFunc.get(fid);
          g.conflitos.push(c);
          const mats = Array.isArray(c.detalhes) ? c.detalhes : [];
          mats.forEach(m=>{
            const sid = m?.escalaId || m?.id || m?.escala?._id || m?.escala?.id || null;
            if(sid) g.escalasSet.add(String(sid));
          });
        });
        // Resolve nomes dos funcionÃ¡rios e nomes das escalas em paralelo (limite de concorrÃªncia)
        const funcs = Array.from(grupoPorFunc.values());
        const allFuncIds = funcs.map(f=> f.funcionarioId);
        const allEscIds = Array.from(new Set(funcs.flatMap(f=> Array.from(f.escalasSet))));
        async function withConcurrency(items, fn, k=8){ for(let i=0;i<items.length;i+=k){ await Promise.all(items.slice(i,i+k).map(fn)); } }
        await withConcurrency(allFuncIds, async (fid)=>{ const nome = await resolveFuncionarioNome(fid); const obj = grupoPorFunc.get(fid); if(obj){ obj.funcionarioNome = nome; } });
        await withConcurrency(allEscIds, async (eid)=>{ await resolveEscalaInfo(eid); });

        // 5) Renderização dos resultados agrupados
        setProgress('Etapa 3/3 — Montando relatório', 0, 1);
        renderResultadosValidacaoAgrupado({
          groups: funcs.map(f=> ({ funcionarioId: f.funcionarioId, funcionarioNome: f.funcionarioNome || String(f.funcionarioId), conflitos: f.conflitos, escalaInfos: Array.from(f.escalasSet).map(id=> escInfoCache.get(id)).filter(Boolean) })),
          totalConflicts: severeConflicts.length,
          warningsEmptyAlloc,
          warningsRecursos,
          resumoDiasVazios: Array.from(diasVaziosGeral).sort(),
          resumoEquipeVazia: Array.from(equipeVaziaPorDia.entries()).map(([eqNome,setDias])=> ({ equipe:eqNome, dias: Array.from(setDias).sort() })),
          resumoRecursosDias: recursosResumo,
          resumoVaziosPorTurno
        });
        setProgress('Concluído', 1, 1);

        if(btn){ btn.disabled=false; btn.innerText=btn.dataset._txt; }
      } catch(e){
        console.error('[escala][validacao] falha', e);
        try { const cont = document.getElementById('validacaoResultados'); if(cont) cont.innerHTML = '<div class="alert alert-danger">Erro durante a validaÃ§Ã£o: '+String(e.message||e)+'</div>'; } catch(_h){}
        const btn = document.getElementById('btnValidarEscala'); if(btn){ btn.disabled=false; btn.innerText=btn.dataset._txt||'Validar Escala'; }
      }
    })();
  }
  try { window.executarValidacaoConflitos = executarValidacaoConflitos; } catch(_ex){}

  function renderResultadosValidacao({ conflicts, warningsEmptyAlloc, warningsRecursos }){
    try {
      const cont = document.getElementById('validacaoResultados'); if(!cont) return;
      const temBloqueio = Array.isArray(conflicts) && conflicts.length>0;
      const temAvisos = (Array.isArray(warningsEmptyAlloc)&&warningsEmptyAlloc.length>0) || (Array.isArray(warningsRecursos)&&warningsRecursos.length>0);

      let html = '';
      if(temBloqueio){
        html += `<div class="alert alert-danger"><strong>Conflitos encontrados (${conflicts.length})</strong><br><span class="small">Existem funcionÃ¡rios alocados em outra escala no mesmo dia/faixa. Corrija para prosseguir.</span></div>`;
        html += '<div class="table-responsive"><table class="table table-sm table-bordered align-middle"><thead class="table-light"><tr><th class="text-center">FuncionÃ¡rio</th><th class="text-center">Data</th><th class="text-center">Turno</th><th class="text-center">Equipe</th></tr></thead><tbody>'+
          conflicts.slice(0,300).map(c=>`<tr><td class="text-center">${String(c.funcionarioId)}</td><td class="text-center">${dateISOToBr(c.dia)}</td><td class="text-center">${c.ini} - ${c.fim}</td><td class="text-center">${c.equipe||'-'}</td></tr>`).join('')+
        '</tbody></table></div>';
      } else {
        html += '<div class="alert alert-success"><strong>Sem conflitos bloqueantes.</strong> VocÃª pode fechar a escala.</div>';
      }

      if(temAvisos){
        html += '<div class="alert alert-warning"><strong>Avisos (nÃ£o bloqueiam)</strong></div>';
        if(Array.isArray(warningsEmptyAlloc) && warningsEmptyAlloc.length){
          html += '<div class="mb-2"><div class="fw-semibold small mb-1">AlocaÃ§Ãµes com equipe vazia ('+warningsEmptyAlloc.length+')</div>';
          html += '<ul class="small mb-2">'+warningsEmptyAlloc.slice(0,400).map(a=>`<li>${a.equipe} â€” ${dateISOToBr(a.dia)} ${a.ini}-${a.fim}</li>`).join('')+'</ul></div>';
        }
        if(Array.isArray(warningsRecursos) && warningsRecursos.length){
          html += '<div class="mb-2"><div class="fw-semibold small mb-1">Recursos sem atribuiÃ§Ãµes ('+warningsRecursos.length+')</div>';
          html += '<ul class="small mb-2">'+warningsRecursos.slice(0,400).map(r=>`<li>${r.recurso}</li>`).join('')+'</ul></div>';
        }
      }

      // BotÃ£o Fechar somente se nÃ£o houver bloqueio
      if(!temBloqueio){
        html += '<div class="mt-3 text-end"><button class="btn btn-outline-success" id="btnFecharEscala"><i class="bi bi-lock-fill"></i> Fechar</button></div>';
      }
      cont.innerHTML = html;

      // Bind do botÃ£o fechar
      const btnF = document.getElementById('btnFecharEscala');
      if(btnF){ btnF.addEventListener('click', async ()=>{ await fecharEscala(); }); }
    } catch(e){ console.warn('[escala][validacao][render] erro', e); }
  }

  function renderResultadosValidacaoAgrupado({ groups, totalConflicts, warningsEmptyAlloc, warningsRecursos, resumoDiasVazios, resumoEquipeVazia, resumoRecursosDias, resumoVaziosPorTurno }){
    try {
      const cont = document.getElementById('validacaoResultados'); if(!cont) return;
      const temBloqueio = (Array.isArray(groups) && groups.some(g=> Array.isArray(g.conflitos) && g.conflitos.length>0));
      let html = '';
      if(temBloqueio){
        html += `<div class="alert alert-danger"><strong>Conflitos encontrados (${totalConflicts||0})</strong><br><span class="small">Existem funcionÃ¡rios alocados em outra escala no mesmo dia/faixa. Corrija para prosseguir.</span></div>`;
        const baseEditPath = (function(){ try { const p = location.pathname; return p; } catch(_e){ return '/escalas/ordinaria/nova'; } })();
        // Render por funcionÃ¡rio
        groups.sort((a,b)=> String(a.funcionarioNome||'').localeCompare(String(b.funcionarioNome||'')));
        html += '<div class="d-flex flex-column gap-3">';
        for(let idx=0; idx<groups.length; idx++){
          const g = groups[idx];
          if(!g.conflitos || !g.conflitos.length) continue;
          const bodyId = `vrpBody_${idx}`;
          html += `<div class="border rounded" data-vrp-group>
            <div class="bg-light px-2 py-1 fw-semibold d-flex justify-content-between align-items-center">`
              + `<div>${(g.funcionarioNome||g.funcionarioId)} <span class=\"text-muted fw-normal\">(${g.conflitos.length} conflito(s))</span></div>`
              + `<div><button type=\"button\" class=\"btn btn-sm btn-outline-secondary\" data-col-toggle=\"1\" data-target=\"${bodyId}\" data-state=\"closed\">Expandir</button></div>`
            + `</div>`;
          if(Array.isArray(g.escalaInfos) && g.escalaInfos.length){
            const links = g.escalaInfos.map(info=>{
              const href = baseEditPath.split('?')[0] + '?id=' + encodeURIComponent(info.id);
              const label = (info.nome || ('Escala '+info.id)) + (info.classificacao? ` (${info.classificacao})`: '');
              return `<a href="${href}" class="link-primary" target="_blank" rel="noopener">${label}</a>`;
            }).join(', ');
            html += `<div class="small px-2 pt-1">Conflita com: ${links}</div>`;
          }
      html += `<div class="p-2 vrp-body" id="${bodyId}" style="display:none;">
        <div class="table-responsive"><table class="table table-sm table-bordered align-middle mb-2"><thead class="table-light"><tr><th class="text-center">Data</th><th class="text-center">Turno</th><th class="text-center">Equipe</th></tr></thead><tbody>`+
        g.conflitos.map(c=>`<tr><td class="text-center">${dateISOToBr(c.dia)}</td><td class="text-center">${c.ini} - ${c.fim}</td><td class="text-center">${c.equipe||'-'}</td></tr>`).join('')+
              `</tbody></table></div></div>`;
          html += `</div>`;
        }
        html += '</div>';
      } else {
        html += '<div class="alert alert-success"><strong>Sem conflitos bloqueantes.</strong> VocÃª pode fechar a escala.</div>';
      }

      // Avisos/ObservaÃ§Ãµes nÃ£o bloqueantes
      const temAvisos = (Array.isArray(warningsEmptyAlloc)&&warningsEmptyAlloc.length>0) || (Array.isArray(warningsRecursos)&&warningsRecursos.length>0);
      if(temAvisos){
        html += '<div class="alert alert-warning mt-3"><strong>Avisos (nÃ£o bloqueiam)</strong></div>';
        if(Array.isArray(warningsEmptyAlloc) && warningsEmptyAlloc.length){
          html += '<div class="mb-2"><div class="fw-semibold small mb-1">AlocaÃ§Ãµes com equipe ausente ('+warningsEmptyAlloc.length+')</div>';
          html += '<ul class="small mb-2">'+warningsEmptyAlloc.slice(0,400).map(a=>`<li>${a.equipe} â€” ${dateISOToBr(a.dia)} ${a.ini}-${a.fim}</li>`).join('')+'</ul></div>';
        }
        if(Array.isArray(warningsRecursos) && warningsRecursos.length){
          html += '<div class="mb-2"><div class="fw-semibold small mb-1">Recursos sem atribuiÃ§Ãµes ('+warningsRecursos.length+')</div>';
          html += '<ul class="small mb-2">'+warningsRecursos.slice(0,400).map(r=>`<li>${r.recurso}</li>`).join('')+'</ul></div>';
        }
      }

      // Bloco textual resumido conforme solicitado
      try {
        const diasLabel = (arr)=> {
          const nums = (arr||[]).map(d=> String(d).slice(8,10)).filter(Boolean);
          return nums.join(', ');
        };
        const wrapAlert = (inner)=> `<div class="alert alert-warning p-2 py-2 small">${inner}</div>`;
        if(Array.isArray(resumoVaziosPorTurno) && resumoVaziosPorTurno.length){
          html += '<div class="mt-3">'+ resumoVaziosPorTurno.map(x=> wrapAlert(`as alocações do turno ${x.turno} nos dias ${diasLabel(x.dias)} estão vazias.`)).join('') + '</div>';
        } else if(Array.isArray(resumoDiasVazios) && resumoDiasVazios.length){
          // fallback: se por algum motivo nÃ£o foi possÃ­vel determinar o turno
          html += wrapAlert(`as alocações dos dias ${diasLabel(resumoDiasVazios)} estão vazias.`);
        }
        if(Array.isArray(resumoRecursosDias) && resumoRecursosDias.length){
          html += '<div class="mt-2">'+resumoRecursosDias.map(x=> wrapAlert(`não há atribuição de funcionário para o recurso ${x.recurso} nas alocações dos dias ${diasLabel(x.dias)}.`)).join('') + '</div>';
        }
        if(Array.isArray(resumoEquipeVazia) && resumoEquipeVazia.length){
          html += '<div class="mt-2">'+resumoEquipeVazia.map(x=> wrapAlert(`a equipe ${x.equipe} está vazia nas alocações dos dias ${diasLabel(x.dias)}.`)).join('') + '</div>';
        }
      } catch(_txt){}

      // BotÃ£o Fechar sÃ³ quando nÃ£o hÃ¡ bloqueio
      if(!temBloqueio){ html += '<div class="mt-3 text-end"><button class="btn btn-outline-success" id="btnFecharEscala"><i class="bi bi-lock-fill"></i> Fechar</button></div>'; }
      cont.innerHTML = html;
      const btnF = document.getElementById('btnFecharEscala'); if(btnF){ btnF.addEventListener('click', async ()=>{ await fecharEscala(); }); }
      // Bind de expansÃ£o/recolhimento (por funcionÃ¡rio apenas)
      const onToggle = (btn)=>{
        try {
          const targetId = btn.getAttribute('data-target');
          const state = btn.getAttribute('data-state')||'open';
          const body = document.getElementById(targetId);
          if(!body) return;
          const willCollapse = state==='open';
          body.style.display = willCollapse? 'none' : '';
          btn.setAttribute('data-state', willCollapse? 'closed':'open');
          btn.textContent = willCollapse? 'Expandir':'Recolher';
        } catch(_e){}
      };
      cont.querySelectorAll('[data-col-toggle]')?.forEach(btn=>{
        btn.addEventListener('click', (ev)=>{ ev.preventDefault(); onToggle(btn); });
      });
    } catch(e){ console.warn('[escala][validacao][render-group] erro', e); }
  }

  async function fecharEscala(){
    try {
      if(!state.escalaId){ ensureEscalaId(); }
      if(!state.escalaId){ alert('ID da escala nÃ£o encontrado. Salve os dados antes.'); return; }
      const btn = document.getElementById('btnFecharEscala'); if(btn){ btn.disabled=true; btn.dataset._txt=btn.dataset._txt||btn.innerText; btn.innerText='Fechando...'; }
      const body = { status: 'fechada' };
      async function tryPut(u){ try { return await fetch(u, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(body) }); } catch(_e){ return { ok:false, status:-1, text: async()=>'' }; } }
      const tries = [ basePath()+`/api/escalas/${encodeURIComponent(state.escalaId)}`, `/api/escalas/${encodeURIComponent(state.escalaId)}` ];
      let ok=false, last=null;
      for(const u of tries){ const r=await tryPut(u); last=r; if(r && r.ok){ ok=true; break; } }
      if(!ok){
        // fallback: PATCH /status
        const tries2 = [ basePath()+`/api/escalas/${encodeURIComponent(state.escalaId)}/status`, `/api/escalas/${encodeURIComponent(state.escalaId)}/status` ];
        for(const u of tries2){ const r=await fetch(u, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ status:'fechada' }) }); last=r; if(r && r.ok){ ok=true; break; } }
      }
      if(!ok){
        const txt = last && (await (last.text?.().catch(()=>''))) || '';
        alert('NÃ£o foi possÃ­vel fechar a escala. '+(txt? ('\n'+txt):''));
        if(btn){ btn.disabled=false; btn.innerText = btn.dataset._txt; }
        return;
      }
      state.status = 'fechada';
      const cont = document.getElementById('validacaoResultados');
      if(cont){ cont.insertAdjacentHTML('afterbegin','<div class="alert alert-success">Escala fechada com sucesso.</div>'); }
      // Opcional: desabilitar aÃ§Ãµes de ediÃ§Ã£o principais
      try { bloquearCamposGerais(true); } catch(_b){}
    } catch(e){ alert('Erro ao fechar: '+String(e.message||e)); }
  }
  function validarPeriodo2(){ const ini=els.dataInicio.value; const fim=els.dataFim.value; if(!ini||!fim) return true; return true; }
  function ajustarDataFimSeNecessario2(){
    const iniBr=els.dataInicio.value.trim();
    if(!iniBr) return;
    const fimBr=els.dataFim.value.trim();
    if(!fimBr){
      els.dataFim.value=iniBr; return;
    }
    // Converter para ISO para comparar
    const isoIni=dateBrToISO(iniBr); const isoFim=dateBrToISO(fimBr);
    if(isoIni && isoFim && isoFim < isoIni){
      els.dataFim.value=iniBr; // forÃ§a alinhamento
    }
  }
  // Utilidades de data (padrÃ£o mÃ³dulo Gestor) -> UI em dd/mm/aaaa, estado em ISO yyyy-mm-dd
  function dateBrToISO3(v){ if(!v) return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim()); if(!m) return ''; const dd=+m[1], mm=+m[2], yyyy=+m[3]; if(mm<1||mm>12||dd<1||dd>31||yyyy<1900||yyyy>2100) return ''; const dt=new Date(yyyy,mm-1,dd); if(dt.getFullYear()!==yyyy||dt.getMonth()!==mm-1||dt.getDate()!==dd) return ''; return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`; }
  function dateISOToBr3(v){ if(!v) return ''; const iso=String(v).trim(); const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/); if(!m){ if(/^(\d{2})\/(\d{2})\/(\d{4})$/.test(iso)) return iso; return ''; } return `${m[3]}/${m[2]}/${m[1]}`; }
  function normalizarDatasPeriodoParaEstado3(){ const brIni=els.dataInicio.value.trim(); const brFim=els.dataFim.value.trim(); const isoIni=dateBrToISO(brIni); const isoFim=dateBrToISO(brFim); if((brIni && !isoIni)||(brFim && !isoFim)) throw new Error('Datas em formato invÃ¡lido (use dd/mm/aaaa).'); if(isoIni && isoFim && isoFim < isoIni) throw new Error('Data fim menor que data inÃ­cio.'); state.periodo.ini=isoIni||null; state.periodo.fim=isoFim||null; }
  // (removido fechamento indevido de initEscalaPage inserido por engano)
  // (definiÃ§Ã£o incompleta de renderMatrizesPorGrupo removida - versÃ£o vÃ¡lida permanece mais abaixo)
  function setModoGrupo2(grupoId, modo){ const g=state.gruposTurnos.find(x=> String(x.id)===String(grupoId)); if(g){ g.__modo = modo==='edit'?'edit':'view'; } }
  // (removidas duplicaÃ§Ãµes de utilitÃ¡rios jÃ¡ definidas acima)
  // (duplicaÃ§Ã£o de renderMatrizesPorGrupo removida - versÃ£o canÃ´nica permanece)
  function setModoGrupo3(grupoId, modo){ const g=state.gruposTurnos.find(x=> String(x.id)===String(grupoId)); if(g){ g.__modo = modo==='edit'?'edit':'view'; } }
  function validarPeriodo3(){ const ini=els.dataInicio.value; const fim=els.dataFim.value; if(!ini||!fim) return true; return true; }
  function ajustarDataFimSeNecessario3(){
    const iniBr=els.dataInicio.value.trim();
    if(!iniBr) return;
    const fimBr=els.dataFim.value.trim();
    if(!fimBr){
      els.dataFim.value=iniBr; return;
    }
    // Converter para ISO para comparar
    const isoIni=dateBrToISO(iniBr); const isoFim=dateBrToISO(fimBr);
    if(isoIni && isoFim && isoFim < isoIni){
      els.dataFim.value=iniBr; // forÃ§a alinhamento
    }
  }
  // Utilidades de data (padrÃ£o mÃ³dulo Gestor) -> UI em dd/mm/aaaa, estado em ISO yyyy-mm-dd
  function dateBrToISO4(v){ if(!v) return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim()); if(!m) return ''; const dd=+m[1], mm=+m[2], yyyy=+m[3]; if(mm<1||mm>12||dd<1||dd>31||yyyy<1900||yyyy>2100) return ''; const dt=new Date(yyyy,mm-1,dd); if(dt.getFullYear()!==yyyy||dt.getMonth()!==mm-1||dt.getDate()!==dd) return ''; return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`; }
  function dateISOToBr4(v){ if(!v) return ''; const iso=String(v).trim(); const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/); if(!m){ if(/^(\d{2})\/(\d{2})\/(\d{4})$/.test(iso)) return iso; return ''; } return `${m[3]}/${m[2]}/${m[1]}`; }
  function normalizarDatasPeriodoParaEstado4(){ const brIni=els.dataInicio.value.trim(); const brFim=els.dataFim.value.trim(); const isoIni=dateBrToISO(brIni); const isoFim=dateBrToISO(brFim); if((brIni && !isoIni)||(brFim && !isoFim)) throw new Error('Datas em formato invÃ¡lido (use dd/mm/aaaa).'); if(isoIni && isoFim && isoFim < isoIni) throw new Error('Data fim menor que data inÃ­cio.'); state.periodo.ini=isoIni||null; state.periodo.fim=isoFim||null; }
  // DefiniÃ§Ã£o (reintroduzida) chamada em diversos pontos para montar a matriz de alocaÃ§Ã£o por grupos
  // (remoÃ§Ã£o de redefiniÃ§Ã£o duplicada de renderMatrizesPorGrupo â€“ usar versÃ£o primÃ¡ria)
  function setModoGrupo4(grupoId, modo){ const g=state.gruposTurnos.find(x=> String(x.id)===String(grupoId)); if(g){ g.__modo = modo==='edit'?'edit':'view'; } }
  function validarPeriodo4(){ const ini=els.dataInicio.value; const fim=els.dataFim.value; if(!ini||!fim) return true; return true; }
  function ajustarDataFimSeNecessario4(){
    const iniBr=els.dataInicio.value.trim();
    if(!iniBr) return;
    const fimBr=els.dataFim.value.trim();
    if(!fimBr){
      els.dataFim.value=iniBr; return;
    }
    // Converter para ISO para comparar
    const isoIni=dateBrToISO(iniBr); const isoFim=dateBrToISO(fimBr);
    if(isoIni && isoFim && isoFim < isoIni){
      els.dataFim.value=iniBr; // forÃ§a alinhamento
    }
  }
  // Utilidades de data (padrÃ£o mÃ³dulo Gestor) -> UI em dd/mm/aaaa, estado em ISO yyyy-mm-dd
  function dateBrToISO5(v){ if(!v) return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim()); if(!m) return ''; const dd=+m[1], mm=+m[2], yyyy=+m[3]; if(mm<1||mm>12||dd<1||dd>31||yyyy<1900||yyyy>2100) return ''; const dt=new Date(yyyy,mm-1,dd); if(dt.getFullYear()!==yyyy||dt.getMonth()!==mm-1||dt.getDate()!==dd) return ''; return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`; }
  function dateISOToBr5(v){ if(!v) return ''; const iso=String(v).trim(); const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/); if(!m){ if(/^(\d{2})\/(\d{2})\/(\d{4})$/.test(iso)) return iso; return ''; } return `${m[3]}/${m[2]}/${m[1]}`; }
  function normalizarDatasPeriodoParaEstado5(){ const brIni=els.dataInicio.value.trim(); const brFim=els.dataFim.value.trim(); const isoIni=dateBrToISO(brIni); const isoFim=dateBrToISO(brFim); if((brIni && !isoIni)||(brFim && !isoFim)) throw new Error('Datas em formato invÃ¡lido (use dd/mm/aaaa).'); if(isoIni && isoFim && isoFim < isoIni) throw new Error('Data fim menor que data inÃ­cio.'); state.periodo.ini=isoIni||null; state.periodo.fim=isoFim||null; }
  // DefiniÃ§Ã£o (reintroduzida) chamada em diversos pontos para montar a matriz de alocaÃ§Ã£o por grupos
  function renderMatrizesPorGrupo2(){
    console.log('[escala][render] renderMatrizesPorGrupo v2 UNIQUE LOG start');
    // ReimplementaÃ§Ã£o avanÃ§ada (restaurada)
    if(!els.matrizWrap) return;
    if(!state.periodo.ini || !state.periodo.fim){ els.matrizWrap.innerHTML='<div class="text-muted small">Defina o perÃ­odo para visualizar a matriz.</div>'; return; }
    if(!Array.isArray(state.gruposTurnos) || !state.gruposTurnos.length){ els.matrizWrap.innerHTML='<div class="text-muted small">Nenhum grupo de turnos.</div>'; return; }
    // Helpers locais se ausentes
    if(!state.matrizAlocacao) state.matrizAlocacao={};
    if(!state.diasDestrancados) state.diasDestrancados=new Set();
    const eqById = new Map();
    (state.equipes||[]).forEach(e=>{ if(e && e.id) eqById.set(e.id, e); });
    function eqIdsToNames(valor){
      if(!valor) return '';
      return valor.split(',').map(id=>{ id=id.trim(); const eq=eqById.get(id); return eq? eq.nome : id; }).filter(Boolean).join(',');
    }
    function nomesToIds(nomes){
      if(!nomes) return [];
      const nomesArr = nomes.split(/\s*,\s*/).filter(Boolean);
      const mapaNome=new Map(); (state.equipes||[]).forEach(e=>{ if(e && e.nome) mapaNome.set(e.nome.toUpperCase(), e.id); });
      return nomesArr.map(n=> mapaNome.get(n.toUpperCase()) || '').filter(Boolean);
    }
  // (duplicado removido)
  function setModoGrupo(grupoId, modo){ const g=state.gruposTurnos.find(x=> String(x.id)===String(grupoId)); if(g){ g.__modo = modo==='edit'?'edit':'view'; } }
  function validarPeriodo(){ const ini=els.dataInicio.value; const fim=els.dataFim.value; if(!ini||!fim) return true; return true; }
  function ajustarDataFimSeNecessario(){
    const iniBr=els.dataInicio.value.trim();
    if(!iniBr) return;
    const fimBr=els.dataFim.value.trim();
    if(!fimBr){
      els.dataFim.value=iniBr; return;
    }
    // Converter para ISO para comparar
    const isoIni=dateBrToISO(iniBr); const isoFim=dateBrToISO(fimBr);
    if(isoIni && isoFim && isoFim < isoIni){
      els.dataFim.value=iniBr; // forÃ§a alinhamento
    }
  }
  // Utilidades de data (padrÃ£o mÃ³dulo Gestor) -> UI em dd/mm/aaaa, estado em ISO yyyy-mm-dd
  function dateBrToISO(v){ if(!v) return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim()); if(!m) return ''; const dd=+m[1], mm=+m[2], yyyy=+m[3]; if(mm<1||mm>12||dd<1||dd>31||yyyy<1900||yyyy>2100) return ''; const dt=new Date(yyyy,mm-1,dd); if(dt.getFullYear()!==yyyy||dt.getMonth()!==mm-1||dt.getDate()!==dd) return ''; return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`; }
  function dateISOToBr(v){ if(!v) return ''; const iso=String(v).trim(); const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/); if(!m){ if(/^(\d{2})\/(\d{2})\/(\d{4})$/.test(iso)) return iso; return ''; } return `${m[3]}/${m[2]}/${m[1]}`; }
  // Exposição global utilitário de data
  try { if (typeof window !== 'undefined' && typeof window.dateISOToBr !== 'function') { window.dateISOToBr = dateISOToBr; } } catch(_e){}
  try { if (typeof window !== 'undefined' && typeof window.dateBrToISO !== 'function' && typeof dateBrToISO === 'function') { window.dateBrToISO = dateBrToISO; } } catch(_e){}
  function normalizarDatasPeriodoParaEstado(){ const brIni=els.dataInicio.value.trim(); const brFim=els.dataFim.value.trim(); const isoIni=dateBrToISO(brIni); const isoFim=dateBrToISO(brFim); if((brIni && !isoIni)||(brFim && !isoFim)) throw new Error('Datas em formato invÃ¡lido (use dd/mm/aaaa).'); if(isoIni && isoFim && isoFim < isoIni) throw new Error('Data fim menor que data inÃ­cio.'); state.periodo.ini=isoIni||null; state.periodo.fim=isoFim||null; }
  // DefiniÃ§Ã£o (reintroduzida) chamada em diversos pontos para montar a matriz de alocaÃ§Ã£o por grupos
  function renderMatrizesPorGrupo(){
    console.log('[escala][render] renderMatrizesPorGrupo v3 UNIQUE LOG start');
    state = window.__ESCALA_STATE__ || state;
    // VersÃ£o canÃ´nica com visibilidade/placeholder e sincronizaÃ§Ã£o de perÃ­odo a partir dos inputs
    const wrap = document.getElementById('matrizAlocacaoWrap') || null;
    const placeholder = document.getElementById('placeholderMatriz') || null;
    const contEl = document.getElementById('matrizAlocacao') || els.matrizWrap;
    if(!contEl) return;
    try { if(wrap) wrap.style.display='block'; } catch(_){ }
    try { if(els.dataInicio || els.dataFim) normalizarDatasPeriodoParaEstado(); } catch(_e){ }
    function showPlaceholder(msg){
      if(placeholder){ placeholder.innerHTML = `<div class="p-2 text-center">${msg}</div>`; placeholder.style.display='block'; }
      if(contEl){ contEl.style.display='none'; contEl.innerHTML=''; }
    }
    function showContent(){ if(placeholder){ placeholder.style.display='none'; } if(contEl){ contEl.style.display='block'; } }
  if(!state.periodo.ini || !state.periodo.fim){ showPlaceholder('Defina o período (Dados Gerais) para exibir a matriz.'); return; }
    // Lista de Equipes VÃ¡lidas (com componentes)
    try {
      const ul = document.getElementById('listaEquipesValidas');
      if(ul){
        const equipesValidas = (state.equipes||[]).filter(e=> Array.isArray(e.componentes) && e.componentes.length>0);
        const itens = equipesValidas.map(e=>{
          const comps=(e.componentes||[]).map(c=> c.nome||c.id).filter(Boolean);
          const title = comps.length? comps.join(', ') : '';
          return `<li class="list-group-item d-flex justify-content-between align-items-center">
                    <span title="${title.replace(/"/g,'&quot;')}">${e.nome} ${e.descricao? ' - '+e.descricao: ''}</span>
                    <span class="badge bg-secondary rounded-pill" title="Qtd. de componentes">${comps.length}</span>
                  </li>`;
        }).join('');
  ul.innerHTML = itens || '<li class="list-group-item text-muted text-center">Nenhuma equipe válida.</li>';
      }
    } catch(_ul){}
    if(!Array.isArray(state.gruposTurnos) || !state.gruposTurnos.length){
  // Renderiza um esqueleto mínimo com cabeçalho de datas para dar feedback visual
      const datasMini=(function(){
        try {
          const out=[]; const ini=String(state.periodo.ini).slice(0,10); const fim=String(state.periodo.fim).slice(0,10);
          const dt=new Date(ini+'T00:00:00'); const end=new Date(fim+'T00:00:00');
          if(isNaN(dt)||isNaN(end)) return out; let c=0; while(dt<=end && c<31){ out.push(dt.toISOString().slice(0,10)); dt.setDate(dt.getDate()+1); c++; }
          return out;
        } catch(_e){ return []; }
      })();
  // Garante visibilidade do container (por padrão vem display:none no EJS)
      try { if(placeholder) placeholder.style.display='none'; } catch(_){}
      try { contEl.style.display='block'; } catch(_){}
  let html = '<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead>'+
                 '<tr><th style="width:140px" class="bg-white"></th>'+
                 datasMini.map(d=>`<th class="text-center align-middle bg-primary text-white" style="font-size:.7rem;width:60px;">${d.slice(8,10)}</th>`).join('')+
                 '</tr></thead><tbody>'+
                 `<tr><td colspan="${datasMini.length+1}" class="text-center text-muted">Nenhum grupo de turnos. Use o botão "Inserir" na aba Turnos.</td></tr>`+
                 '</tbody></table></div>';
      contEl.innerHTML = html; return;
    }
    showContent();
    // Helpers locais se ausentes
    if(!state.matrizAlocacao) state.matrizAlocacao={};
    if(!state.diasDestrancados) state.diasDestrancados=new Set();
    const eqById = new Map();
    (state.equipes||[]).forEach(e=>{ if(e && e.id) eqById.set(e.id, e); });
    function eqIdsToNames(valor){
      if(!valor) return '';
      return valor.split(',').map(id=>{ id=id.trim(); const eq=eqById.get(id); return eq? eq.nome : id; }).filter(Boolean).join(',');
    }
    function nomesToIds(nomes){
      if(!nomes) return [];
      const nomesArr = nomes.split(/\s*,\s*/).filter(Boolean);
      const mapaNome=new Map(); (state.equipes||[]).forEach(e=>{ if(e && e.nome) mapaNome.set(e.nome.toUpperCase(), e.id); });
      return nomesArr.map(n=> mapaNome.get(n.toUpperCase()) || '').filter(Boolean);
    }
    function soData(v){ try { if(!v) return ''; const s=String(v); return s.length>=10? s.slice(0,10) : s; } catch(_){ return ''; } }
    function gerarDatas(iniISO,fimISO){
      const out=[]; const ini=soData(iniISO), fim=soData(fimISO);
      const dt=new Date(ini+'T00:00:00'); const end=new Date(fim+'T00:00:00');
      if(isNaN(dt)||isNaN(end)) return out; while(dt<=end){ out.push(dt.toISOString().slice(0,10)); dt.setDate(dt.getDate()+1);} return out;
    }
    const datas = gerarDatas(state.periodo.ini, state.periodo.fim);
  if(!datas.length){ showPlaceholder('Período inválido. Ajuste as datas em Dados Gerais.'); return; }
    const colWidth = 66; // px
    let html='';
    state.gruposTurnos.forEach(grupo=>{
      const modo = grupo.__modo==='edit' ? 'edit':'view';
      console.log('[escala][render] grupo:', grupo.id, 'modo calculado:', modo, 'g.__modo:', grupo.__modo);
      const turnos = Array.isArray(grupo.turnos)? grupo.turnos : [];
      html += `<div class="matriz-grupo mb-3 border rounded" data-grupo="${grupo.id}">`+
        `<div class="d-flex justify-content-between align-items-center p-2 bg-light border-bottom">`+
          (()=>{ const faixas=(turnos||[]).map(t=>`${t.ini||'?'} às ${t.fim||'?'}`).join(' - '); return `<div class="text-truncate"><strong>${faixas||'(sem turnos)'}</strong></div>`; })()+
          `<div class="btn-group btn-group-sm">`+
            `<button type="button" class="btn btn-outline-primary" data-act="grupo-modo" data-grupo="${grupo.id}" onclick="window.__escToggleFromBtn && __escToggleFromBtn(this)">${modo==='edit'?'Modo consulta':'Modo edição'}</button>`+
            (modo==='edit'? `<button type="button" class="btn btn-outline-danger" data-act="grupo-limpar" data-grupo="${grupo.id}" onclick="window.__escLimparFromBtn && __escLimparFromBtn(this)">Limpar alocações</button>`:'')+
          `</div>`+
        `</div>`;
      if(!turnos.length){ html += '<div class="p-2 small text-muted">(sem turnos)</div></div>'; return; }
      html += `<div class="table-responsive"><table class="table table-sm table-bordered mb-0 matriz-tabela"><thead>`;
      // Cabeçalho datas (dia numeral + cadeado em escala fechada)
      function __escUnlockKey2(){ try { return 'escalaUnlock:'+(state.escalaId||'novo'); } catch(_){ return 'escalaUnlock:novo'; } }
      (function __escLoadUnlock2(){ try { if(!(state.diasDestrancados instanceof Set)) state.diasDestrancados = new Set(); const raw = localStorage.getItem(__escUnlockKey2()); if(raw){ const arr=JSON.parse(raw); if(Array.isArray(arr)){ arr.forEach(x=> x && state.diasDestrancados.add(String(x))); } } } catch(_e){} })();
      if(isEscalaFechada()){
        html += `<tr><th style="width:160px;white-space:nowrap" class="bg-white"></th>`+
          datas.map(d=>{
            const unlocked = !!(state.diasDestrancados && state.diasDestrancados.has(d));
            const icon = unlocked? 'destrancado.png' : 'trancado.png';
            const title = unlocked? 'Dia desbloqueado para edição' : 'Dia bloqueado; clique para destravar';
            return `<th class="text-center align-middle bg-primary text-white cadeado-dia" data-dia="${d}" data-unlocked="${unlocked?'1':'0'}" style="width:${colWidth}px;min-width:${colWidth}px;padding:.15rem .25rem;cursor:pointer;" title="${title}">
                      <img src="${basePath()}/images/${icon}" alt="${unlocked?'destrancado':'trancado'}" style="width:16px;height:16px;vertical-align:middle;" onerror="this.style.display='none'" />
                      <div class="dia-num" style="font-size:.7rem;line-height:1;margin-top:2px;">${d.slice(8,10)}</div>
                    </th>`;
          }).join('')+`</tr>`;
      } else {
        html += `<tr><th style="width:160px;white-space:nowrap" class="bg-white"></th>`+
          datas.map(d=>`<th class="text-center align-middle bg-primary text-white" style="width:${colWidth}px;min-width:${colWidth}px;font-size:.7rem;padding:.25rem .25rem;">${d.slice(8,10)}</th>`).join('')+`</tr>`;
      }
      // CabeÃ§alho dia da semana
  html += `<tr><th class="bg-white" style="width:160px;white-space:nowrap"></th>`+datas.map(d=>{ const ds=obterDiaSemanaAbrev(d); return `<th class="text-center align-middle bg-secondary text-white" style="width:${colWidth}px;min-width:${colWidth}px;font-size:.55rem;padding:.15rem .25rem;">${ds}</th>`; }).join('')+`</tr>`;
      html += `</thead><tbody>`;
    turnos.forEach(t=>{
  const hi = t.ini || t.inicio || t.start || t.horaInicio || t.hi || '';
  const hf = t.fim || t.termino || t.end || t.horaFim || t.hf || '';
  const faixaLabel = `${hi||'?'} às ${hf||'?'}`;
  html += `<tr data-turno="${t.id||t.turnoId||''}"><td class="bg-light fw-semibold text-center" style="font-size:.65rem;white-space:nowrap;width:160px;">${faixaLabel}</td>`+datas.map(d=>{
      const key=(grupo.id+'::'+(hi||'?')+'-'+(hf||'?'))+'|'+d;
          const valor = state.matrizAlocacao[key] || '';
          if(modo==='edit'){
            const nomes = eqIdsToNames(valor);
            const locked = isEscalaFechada() && !(state.diasDestrancados && state.diasDestrancados.has(d));
            const disabledAttr = locked? 'disabled readonly title="Dia bloqueado; clique no cadeado para destravar"' : '';
            return `<td class="p-0 text-center align-middle" style="width:${colWidth}px;"><div class="w-100" style="pointer-events:auto"><input type="text" class="form-control form-control-sm text-center matriz-input matriz-input-mini" data-key="${key}" value="${nomes}" ${disabledAttr} style="font-size:.55rem;padding:.15rem .25rem;${locked? 'background:#f3f3f3;':''}" /></div></td>`;
          } else {
            const nomes = eqIdsToNames(valor);
            if(!nomes) return `<td class="text-center align-middle small" style="width:${colWidth}px;">-</td>`;
            const linhas = nomes.split(/\s*,\s*/).filter(Boolean).map(n=>`<a href=\"#\" class=\"matriz-eq-item d-block text-primary text-decoration-underline\" data-eqnome=\"${n}\" onclick=\"if(window.__escOpenDet){ return window.__escOpenDet(this, event); } console.log('[escala][inline] __escOpenDet indisponível, bloqueando navegação'); return false;\" style=\"cursor:pointer;line-height:1.05;\">${n}</a>`).join('');
            return `<td class="text-center align-middle small" data-key="${key}" style="width:${colWidth}px;">${linhas}</td>`;
          }
        }).join('')+`</tr>`;
      });
      html += `</tbody></table>`;
  if(modo==='edit') html += `<div class="form-text px-2 pb-2">Use vírgula para múltiplas equipes. Apenas letras (A-Z), números e vírgula.</div>`;
      html += `</div></div>`; // fecha matriz-grupo
    });
    contEl.innerHTML = html;
    // CSS overrides: garante que entradas fiquem clicÃ¡veis e acima de overlays acidentais
    try {
      if(!document.getElementById('escalaMatrizOverrides')){
        const st=document.createElement('style');
        st.id='escalaMatrizOverrides';
        st.textContent = `
          .matriz-grupo td{ position: relative; }
          .matriz-grupo input.matriz-input{ pointer-events:auto !important; position: relative; z-index: 5; }
          .matriz-grupo .form-control{ background-clip: padding-box; }
        `;
        document.head.appendChild(st);
      }
    } catch(_css){ }
    // Bind toggle cadeado (fechada)
    try {
      if(isEscalaFechada()){
        const saveUnlock2 = ()=>{ try { const arr=[...state.diasDestrancados]; localStorage.setItem((function(){ try { return 'escalaUnlock:'+(state.escalaId||'novo'); } catch(_){ return 'escalaUnlock:novo'; } })(), JSON.stringify(arr)); } catch(_e){} };
        contEl.querySelectorAll('th.cadeado-dia[data-dia]').forEach(th=>{
          th.addEventListener('click', ()=>{
            try {
              const dia = th.getAttribute('data-dia'); if(!dia) return;
              const unlocked = !!(state.diasDestrancados && state.diasDestrancados.has(dia));
              const hojeISO = new Date().toISOString().slice(0,10);
              if(!unlocked && dia < hojeISO){ alert('Não é possível destravar dias passados.'); return; }
              if(unlocked){
                if(confirm('Re-bloquear este dia?')){ state.diasDestrancados.delete(dia); saveUnlock2(); renderMatrizesPorGrupo(); }
              } else {
                if(confirm('Desbloquear este dia para edição?')){ if(!(state.diasDestrancados instanceof Set)) state.diasDestrancados=new Set(); state.diasDestrancados.add(dia); saveUnlock2(); renderMatrizesPorGrupo(); }
              }
            } catch(_e){}
          });
        });
      }
    } catch(_bind){ }
    // Bind detalhamento clique
    contEl.querySelectorAll('.matriz-eq-item').forEach(el=> el.addEventListener('click', onClickMatrizDetalhe));
    if(contEl.querySelector('.matriz-input')) aplicarRestricoesInputsMatriz();
  // Salvaguarda: se o modo de algum grupo for 'edit' mas não houver inputs por algum CSS/erro, injeta inputs on-the-fly
    try {
      const gruposEdit = state.gruposTurnos.filter(g=> g.__modo==='edit');
      if(gruposEdit.length){
        gruposEdit.forEach(g=>{
          const wrap = contEl.querySelector(`.matriz-grupo[data-grupo="${g.id}"]`);
          if(!wrap) return;
          const temInput = wrap.querySelector('input.matriz-input');
          if(!temInput){
            wrap.querySelectorAll('td[data-key], td').forEach(td=>{
              const key = td.getAttribute && td.getAttribute('data-key');
              if(!key) return;
              const valor = state.matrizAlocacao[key]||'';
              const nomes = (function(){ const eqById=new Map(); (state.equipes||[]).forEach(e=>{ if(e&&e.id) eqById.set(e.id,e); }); if(!valor) return ''; return valor.split(',').map(id=>{ id=id.trim(); const eq=eqById.get(id); return eq? eq.nome : id; }).filter(Boolean).join(','); })();
              td.innerHTML = `<div class="w-100" style="pointer-events:auto"><input type="text" class="form-control form-control-sm text-center matriz-input matriz-input-mini" data-key="${key}" value="${nomes}" style="font-size:.55rem;padding:.15rem .25rem;" /></div>`;
            });
            aplicarRestricoesInputsMatriz();
          }
        });
      }
    } catch(_safe){}
  // Qualidade de vida: se houver algum grupo em modo edição, foca o primeiro input
    try {
      const grpEdit = state.gruposTurnos.find(g=> g.__modo==='edit');
      if(grpEdit){
        const wrap = contEl.querySelector(`.matriz-grupo[data-grupo="${grpEdit.id}"]`);
        const first = wrap && wrap.querySelector('input.matriz-input');
        if(first) first.focus();
      }
    } catch(_fx){ }
  // (Blocos duplicados de utilitários e renderMatrizesPorGrupo removidos – usar implementação única definida anteriormente)
  console.log('[escala][render] renderMatrizesPorGrupo end');
  try { document.dispatchEvent(new CustomEvent('escala:matriz:renderizada', { detail:{ grupos:(state.gruposTurnos||[]).length, dias: (Array.isArray(datas)? datas.length: undefined) } })); } catch(_e){}
    try { if(typeof avaliarProgressaoAbas==='function') avaliarProgressaoAbas(); } catch(_e){}
  }
  function setModoGrupo(grupoId, modo){ const g=state.gruposTurnos.find(x=> String(x.id)===String(grupoId)); if(g){ g.__modo = modo==='edit'?'edit':'view'; } }
  // Removida definiÃ§Ã£o duplicada corrompida de carregarEscalaExistente.
  // A versÃ£o canÃ´nica permanece no inÃ­cio do arquivo.
  function obterDiaSemanaAbrev(iso){
    // iso yyyy-mm-dd
    const dt=new Date(iso+'T00:00:00');
  const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    return dias[dt.getDay()]||'';
  }
  function aplicarRestricoesInputsMatriz(){
    const inputs=[...els.matrizWrap.querySelectorAll('input.matriz-input')];

    // Helpers locais: chave de storage compatÃ­vel com a view e alternar aba Recursos
    function storageKeys(){
      try {
        const u=new URL(location.href);
        const id=u.searchParams.get('id')||'novo';
        const base=location.pathname.replace(/\/$/,'');
        return {
          active:'wdg.escala.activeTab:'+base+':'+id,
          allowRec:'wdg.escala.allowAutoSwitchRec:'+base+':'+id
        };
      } catch(_e){ return { active:'wdg.escala.activeTab', allowRec:'wdg.escala.allowAutoSwitchRec' }; }
    }
    function permitirAutoSwitchRecursosUmaVez(){
      try { sessionStorage.setItem(storageKeys().allowRec,'1'); } catch(_e){}
      // expirar em 60s para nÃ£o â€œcolarâ€ na prÃ³xima visita
      try { setTimeout(()=>{ sessionStorage.removeItem(storageKeys().allowRec); }, 60000); } catch(_e){}
    }
    function mostrarAbaRecursos(){
      try {
        const btn = document.querySelector('[data-bs-target="#aba-recursos"]');
        if(btn && !btn.classList.contains('disabled')){
          const tab = bootstrap.Tab.getOrCreateInstance(btn);
          tab.show();
        }
      } catch(_e){}
    }
    function acionarModoConsultaDoGrupo(grupoId){
      try {
        const cont = (document.getElementById('matrizAlocacao')||document).querySelector(`.matriz-grupo[data-grupo="${grupoId}"]`);
        const btn = cont && cont.querySelector('button[data-act="grupo-modo"]');
        // SÃ³ aciona toggle se o grupo estiver em modo ediÃ§Ã£o (g.__modo === 'edit')
        const g = Array.isArray(state.gruposTurnos) ? state.gruposTurnos.find(x=> String(x.id)===String(grupoId)) : null;
        if(btn && g && g.__modo==='edit' && typeof window.__escToggleFromBtn==='function'){
          window.__escToggleFromBtn(btn);
          return;
        }
        // Fallback direto
        if(typeof setModoGrupo==='function'){
          setModoGrupo(grupoId,'view');
          if(typeof renderMatrizesPorGrupo==='function') renderMatrizesPorGrupo();
        }
      } catch(_e){}
    }

    // One-shot para evitar mÃºltiplas ativaÃ§Ãµes por vÃ¡rias cÃ©lulas
    if(!window.__ESC_ATIVOU_REC_INSERCAO){ window.__ESC_ATIVOU_REC_INSERCAO = false; }

    inputs.forEach(inp=>{
      inp.addEventListener('input',()=>{
        let v=inp.value.toUpperCase();
        // MantÃ©m somente A-Z,0-9 e vÃ­rgula
        v=v.replace(/[^A-Z0-9,]/g,'');
        // Remove vÃ­rgulas duplicadas seguidas
        v=v.replace(/,{2,}/g,',');
        v=v.replace(/^,+/,'');                // vÃ­rgula no comeÃ§o
        // NÃƒO removemos vÃ­rgula no final para permitir continuar digitando outra equipe
        inp.value=v;
        // Ao editar, limpar estados de erro
        inp.classList.remove('is-invalid');
        inp.removeAttribute('title');
      });

      // Na saÃ­da do campo (ou mudanÃ§a), verificar se houve uma alocaÃ§Ã£o vÃ¡lida e entÃ£o acionar Recursos + Modo consulta
      function onCommit(){
        try {
          // Guardas anti-loop/duplicidade
          if(window.__ESC_ATIVOU_REC_INSERCAO) return; // jÃ¡ fizemos uma vez
          if(inp.dataset && inp.dataset.committing==='1') return; // jÃ¡ estÃ¡ em commit para este input
          const now = Date.now();
          if(window.__ALOC_COMMIT_TS__ && (now - window.__ALOC_COMMIT_TS__ < 800)) return; // throttle global
          const valor = (inp.value||'').trim();
          if(!valor) return;
          // Verifica se hÃ¡ ao menos um token que corresponde a uma equipe existente
          const tokens = valor.toUpperCase().split(',').map(t=>t.trim()).filter(Boolean);
          const temValida = Array.isArray(state.equipes) && tokens.some(tok => state.equipes.some(eq => (eq.nome||'').toUpperCase()===tok));
          if(!temValida) return;
          // Extrai grupoId desta cÃ©lula
          const td = inp.closest && inp.closest('td[data-key]');
          const key = td && td.getAttribute('data-key'); // grupoId::HH:MM-HH:MM|YYYY-MM-DD
          const grupoId = (function(){ try { const p=(key||'').split('|')[0]; return (p||'').split('::')[0]||null; } catch(_e){ return null; } })();

          // Marca inÃ­cio do commit para evitar reentrÃ¢ncia
          try { inp.dataset.committing = '1'; window.__ALOC_COMMIT_TS__ = now; } catch(_m){}

          // Dispara evento de alocaÃ§Ã£o inserida (assÃ­ncrono)
          try { setTimeout(()=>{ try { document.dispatchEvent(new CustomEvent('escala:alocacao-inserida', { detail:{ key, grupoId, tokens } })); } catch(_e){} }, 0); } catch(_e){}

          // Permite e mostra Recursos imediatamente
          permitirAutoSwitchRecursosUmaVez();
          mostrarAbaRecursos();
          try { if(typeof avaliarProgressaoAbas==='function') avaliarProgressaoAbas(); } catch(_e){}

          // Aciona "Modo consulta" no grupo (salva e sai da ediÃ§Ã£o)
          if(grupoId){ acionarModoConsultaDoGrupo(grupoId); }

          window.__ESC_ATIVOU_REC_INSERCAO = true;
          // Libera o commit deste input apÃ³s pequena janela para evitar loops de blur/change em navegaÃ§Ã£o de abas
          setTimeout(()=>{ try { delete inp.dataset.committing; } catch(_){} }, 500);
        } catch(_e){}
      }
      // Preferir blur apenas (change pode disparar extra conforme navegadores)
      inp.addEventListener('blur', onCommit, true);

      inp.setAttribute('autocomplete','off');
      inp.setAttribute('spellcheck','false');
      inp.maxLength=50; // limite defensivo
    });
  }
  function isEscalaFechada(){
    try {
      const st=(state.status||'').toString().toLowerCase();
      return ['fechada','fechado','validada','validado','publicada','concluida','concluÃ­da'].includes(st);
    } catch(_e){ return false; }
  }

  // --- MODAL DETALHAMENTO EQUIPE / DIA ---
  function abrirModalDetalhamentoEquipeDiaImpl(ctx){
    console.log('[debug] INÃCIO abrirModalDetalhamentoEquipeDia - funÃ§Ã£o entrou');
    console.log('[debug] abrirModalDetalhamentoEquipeDia chamado com ctx:', ctx);
    console.log('[debug] state.recursos:', window.__ESCALA_STATE__?.recursos);
    console.log('[debug] state.equipes:', window.__ESCALA_STATE__?.equipes);
    const modalEl=document.getElementById('modalDetalhamentoEquipeDia');
    if(!modalEl){ console.warn('Modal detalhamento nÃ£o encontrado'); return; }
    const spanPeriodo=$('detEqDiaPeriodo');
    const spanEquipe=$('detEqDiaEquipe');
    const spanData=$('detEqDiaData');
    const spanSituacao=$('detEqDiaSituacao');
    const spanTurno=$('detEqDiaTurno');
    const boxObs=$('detEqDiaObservacoes');
    const tbody=modalEl.querySelector('#tabelaDetalhamentoEquipeDia tbody');

    // PerÃ­odo global
    if(state.periodo.ini && state.periodo.fim){
      spanPeriodo.textContent = dateISOToBr(state.periodo.ini) + ' à ' + dateISOToBr(state.periodo.fim);
    } else { spanPeriodo.textContent='-'; }

    // Equipe
    spanEquipe.textContent = ctx.equipe? ctx.equipe.nome : (ctx.equipeNome||'-');
    // Data (dia especÃ­fico)
    spanData.textContent = ctx.dataISO? dateISOToBr(ctx.dataISO) : '-';
  // Situação inicial (placeholder até regras de disponibilidade/conflitos)
  spanSituacao.className='badge bg-secondary';
  spanSituacao.textContent='Em análise';
    // Turno
  if(ctx.turnoIni && ctx.turnoFim){ spanTurno.textContent = ctx.turnoIni + ' às ' + ctx.turnoFim; } else { spanTurno.textContent='-'; }

  // Monta linhas de funcionÃ¡rios do dia/turno: somente o que pertence ao dia/turno atual
      let funcionarios = [];
      const diaSel = ctx.dataISO;
      const hhIniSel = ctx.turnoIni, hhFimSel = ctx.turnoFim;
      function matchTurnoFaixa(a){
        try {
          const turnoId = (a.turnoId||a.turno||'').toString();
          // Tenta extrair HH:MM-HH:MM de qualquer string
          const m = turnoId.match(/(\d{2}:\d{2})\s*[–—-]?\s*(\d{2}:\d{2})/);
          if(m){ return m[1]===hhIniSel && m[2]===hhFimSel; }
          // fallback: pode vir como campos separados
          const ii=(a.turnoIni||a.ini||a.horaInicio||a.inicio||'').toString();
          const ff=(a.turnoFim||a.fim||a.horaFim||a.termino||'').toString();
          if(ii && ff) return ii===hhIniSel && ff===hhFimSel;
        } catch(_e){}
        // Sem informação de turno: não considera alocado para o turno do modal
        return false;
      }
    if(ctx.equipe) {
        console.log('[debug] ctx.equipe:', ctx.equipe.id, 'componentes:', ctx.equipe.componentes?.length || 0, 'recursos:', ctx.equipe.recursos?.length || 0);
        // Backfill de componentes se vierem vazios/inexistentes no ctx
        try {
          if((!Array.isArray(ctx.equipe.componentes) || ctx.equipe.componentes.length===0) && Array.isArray((window.__ESCALA_STATE__||{}).equipes)){
            const eqRef = (window.__ESCALA_STATE__.equipes||[]).find(e=> String(e.id||e._id||'')===String(ctx.equipe.id||ctx.equipe._id||''))
                          || (window.__ESCALA_STATE__.equipes||[]).find(e=> String(e.nome||'').toUpperCase()===String(ctx.equipe.nome||'').toUpperCase());
            if(eqRef && Array.isArray(eqRef.componentes) && eqRef.componentes.length){
              ctx.equipe.componentes = eqRef.componentes.map(c=> ({...c}));
              console.log('[debug] componentes backfilled a partir do estado global:', ctx.equipe.componentes.length);
            }
          }
        } catch(_bf){}
        // Localiza recursos da equipe: se nÃ£o vierem aninhados na equipe, usa a lista plana do estado
        let recursosDaEquipe = Array.isArray(ctx.equipe.recursos) ? ctx.equipe.recursos : [];
        if(!recursosDaEquipe.length && Array.isArray((window.__ESCALA_STATE__||{}).recursos)){
          const eqId = ctx.equipe.id || ctx.equipe._id;
          recursosDaEquipe = (window.__ESCALA_STATE__.recursos||[])
            .filter(r=> String(r.equipeId||r.equipe_id||r.equipe?.id||'')===String(eqId))
            .map(r=> ({ ...r }));
        }
        console.log('[debug] recursosDaEquipe:', recursosDaEquipe.length, 'equipeId:', ctx.equipe.id);
        // AtribuÃ­dos em recursos que batem dia/turno
        if(Array.isArray(recursosDaEquipe)) {
          recursosDaEquipe.forEach(r=>{
            if(Array.isArray(r.atribuicoes)){
              r.atribuicoes.forEach(a=>{
                if(a && a.id){
                  const diaOK = (a.dia===diaSel) || (a.data===diaSel);
                  const turnoOK = matchTurnoFaixa(a);
                  if(diaOK && turnoOK){
                    // Normaliza possíveis campos de identificação do funcionário na atribuição
                    const fid = a.id || a.funcionarioId || a.funcionario_id || a.membroFuncionarioId || (a.funcionario && (a.funcionario.id||a.funcionario._id)) || a.matricula || a.codigo;
                    const nomeA = a.nome || a.nomeFuncionario || a.funcionarioNome || (a.funcionario && (a.funcionario.nome||a.funcionario.descricao));
                    funcionarios.push({ ...a, id: fid, nome: nomeA || a.nome, origem:'recurso', recursoNome: r.nome||r.placa||'' });
                  }
                }
              });
            }
          });
        }
        // Fallback adicional: procurar em state.recursos (caso recursosDaEquipe venha vazio)
        if(funcionarios.length===0 && (!Array.isArray(recursosDaEquipe) || recursosDaEquipe.length===0) && Array.isArray((window.__ESCALA_STATE__||{}).recursos)){
          const eqId = ctx.equipe.id || ctx.equipe._id;
          (window.__ESCALA_STATE__.recursos||[]).filter(r=> String(r.equipeId||r.equipe_id||r.equipe?.id||'')===String(eqId)).forEach(r=>{
            if(Array.isArray(r.atribuicoes)){
              r.atribuicoes.forEach(a=>{
                const diaOK = (a?.dia===diaSel) || (a?.data===diaSel);
                const turnoOK = matchTurnoFaixa(a||{});
                if(diaOK && turnoOK){
                  const fid = a.id || a.funcionarioId || a.funcionario_id || a.membroFuncionarioId || (a.funcionario && (a.funcionario.id||a.funcionario._id)) || a.matricula || a.codigo;
                  const nomeA = a.nome || a.nomeFuncionario || a.funcionarioNome || (a.funcionario && (a.funcionario.nome||a.funcionario.descricao));
                  funcionarios.push({ ...a, id: fid, nome: nomeA || a.nome, origem:'recurso', recursoNome: r.nome||r.placa||'' });
                }
              });
            }
          });
        }
        console.log('[debug] funcionarios de recursos:', funcionarios.length);
        // Não adicionar componentes que não estejam alocados no dia/turno
        console.log('[debug] total funcionarios:', funcionarios.length, 'componentes:', ctx.equipe.componentes?.length || 0);
      }
      let linhas='';
      if(funcionarios.length){
        linhas = funcionarios.map((c,idx)=>{
          const compId = c.id || c._id || c.funcionarioId || c.funcionario_id || c.membroFuncionarioId || (c.funcionario && (c.funcionario.id || c.funcionario._id)) || c.matricula || c.codigo || '';
          const codigo = c.matricula || c.codigo || c.cpf || compId || '';
          const nome = c.nome || c.nomeFuncionario || c.funcionarioNome || '(sem nome)';
          const uniCodigo = c.unidade_codigo || c.unidade?.codigo || '';
          const uniNome   = c.unidade_nome || c.unidade?.nome || '';
          let unidadeFmt='-';
          if(uniCodigo && uniNome) unidadeFmt = `${uniCodigo} (${uniNome})`;
          else if(uniCodigo) unidadeFmt = uniCodigo;
          else if(uniNome) unidadeFmt = uniNome;
          const needFetch = unidadeFmt==='-' && compId;
          return `<tr data-comp-idx="${idx}" data-comp-id="${compId}"><td class="text-center">${codigo}</td><td class="col-nome">${nome}</td><td class="col-unidade unidade-cell">${unidadeFmt}${needFetch? '<span class=\"text-muted\"> (..)</span>':''}</td><td class="text-center text-muted">(verificando)</td><td class="text-center text-muted">(verificando)</td></tr>`;
        }).join('');
      } else {
  linhas = '<tr class="text-muted"><td class="text-center" colspan="5">Equipe sem funcionários alocados neste dia/turno.</td></tr>';
      }
      tbody.innerHTML=linhas;
      console.log('[debug] tbody.innerHTML setado:', tbody.innerHTML);

  // Observações (temporário até cálculo de disponibilidade/conflitos)
    if(boxObs){
  boxObs.innerHTML = '<em>Validações de indisponibilidade e outras alocações serão aplicadas em etapas seguintes.</em>';
    }

  let instModalEfetivo=bootstrap.Modal.getInstance(modalEl);
  if(!instModalEfetivo){ instModalEfetivo=new bootstrap.Modal(modalEl); }
  instModalEfetivo.show();
  console.log('[debug] modal mostrado');

    // ApÃ³s exibir modal, validar indisponibilidade de cada componente para o dia especÃ­fico
    async function verificarIndisponibilidadeDia(){
      if(!ctx.dataISO || !ctx.equipe) return;
      const diaIni=ctx.dataISO; // formato YYYY-MM-DD
      const diaFim=ctx.dataISO; // consulta 1 dia
      for(const tr of tbody.querySelectorAll('tr[data-comp-id]')){
        const fid = String(tr.getAttribute('data-comp-id')||'').trim();
        if(!fid) continue;
        const cellOutra = tr.children[3];
        const cellInd = tr.children[4];
        // disponibilidade
        try {
          const url=basePath()+`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(fid)}&inicio=${diaIni}&fim=${diaFim}`;
          const r=await fetch(url,{credentials:'same-origin'});
          if(r.ok){
            const js=await r.json();
            const dados=js.data||{};
            const livre = Array.isArray(dados.free) && dados.free.some(int=> int.inicio<=diaIni && int.fim>=diaFim);
            if(cellInd){ cellInd.innerHTML = livre? '<span class="text-success fw-semibold">Não</span>' : '<span class="text-danger fw-semibold">Sim</span>'; }
            if(!livre) tr.classList.add('text-muted');
          } else { if(cellInd) cellInd.innerHTML='<span class="text-muted">(?)</span>'; }
        } catch(_e){ if(cellInd) cellInd.innerHTML='<span class="text-muted">(?)</span>'; }
        // conflitos
        try {
          let hhIni = (ctx.turnoIni||'').trim(); let hhFim=(ctx.turnoFim||'').trim();
          if(!hhIni || !hhFim){ const m = String(ctx.turnoId||'').match(/(\d{2}:\d{2})-(\d{2}:\d{2})/); if(m){ hhIni=m[1]; hhFim=m[2]; } }
          if(hhIni && hhFim){
            const q = new URLSearchParams({ funcionarioId: fid, dia: String(ctx.dataISO), ini: hhIni, fim: hhFim });
            if(state.escalaId){ q.set('excludeId', state.escalaId); }
            const url2 = basePath()+`/api/funcionario/conflitos-alocacao?`+q.toString();
            const r2 = await fetch(url2, { credentials:'same-origin' });
            if(r2.ok){ const js2 = await r2.json(); const confl = js2 && (js2.conflito===true || (Array.isArray(js2.matches) && js2.matches.length>0)); if(cellOutra){ cellOutra.innerHTML = confl? '<span class="text-danger fw-semibold">Sim</span>' : '<span class="text-success fw-semibold">Não</span>'; } tr.dataset.outraAlocacao = confl? '1':'0'; }
            else { if(cellOutra){ cellOutra.innerHTML = '<span class="text-muted">(erro)</span>'; } }
          } else { if(cellOutra){ cellOutra.innerHTML = '<span class="text-muted">(sem turno)</span>'; } }
        } catch(_e2){ if(cellOutra){ cellOutra.innerHTML = '<span class="text-muted">(?)</span>'; } }
      }
      // Removido: salvar indisponibilidades no banco aqui para evitar mÃºltiplos PUTs
    }
    verificarIndisponibilidadeDia();

    // Enriquecimento assÃ­ncrono da unidade se faltante
    if(ctx.equipe && Array.isArray(ctx.equipe.componentes)){
      ctx.equipe.componentes.forEach(async (c,i)=>{
        if(c.unidade_codigo || c.unidade_nome) return;
        if(!c.id) return;
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(c.id);
        try {
          let url;
          if(isObjectId){
            url = basePath() + '/api/funcionarios/busca-codigo?id='+encodeURIComponent(c.id);
          } else {
            // Se nÃ£o Ã© ObjectId, assumimos que c.id Ã© na verdade o cÃ³digo (ex: FUNC00049)
            url = basePath() + '/api/funcionarios/busca-codigo?codigo='+encodeURIComponent(c.id.trim());
          }
          const res = await fetch(url, { credentials:'same-origin' });
          if(!res.ok) { return; }
          const js = await res.json();
          if(js && js.data){
            c.unidade_codigo = js.data.unidade_codigo || c.unidade_codigo || null;
            c.unidade_nome = js.data.unidade_nome || c.unidade_nome || null;
            const row = tbody.querySelector(`tr[data-comp-idx="${i}"] .unidade-cell`);
            if(row){
              let unidadeFmt='-';
              const uc=c.unidade_codigo, un=c.unidade_nome;
              if(uc && un) unidadeFmt = `${uc} (${un})`; else if(uc) unidadeFmt=uc; else if(un) unidadeFmt=un;
              row.textContent = unidadeFmt;
            }
          }
        } catch(errFetchComp){ /* silencioso para nÃ£o travar modal */ }
      });
    }
    // (listener direto antigas aÃ§Ãµes de equipes removido â€“ substituÃ­do por delegaÃ§Ã£o interna pÃ³s-DOM)
    // Binding seguro do botÃ£o salvar do modal (se existir desde o carregamento)
    (function bindSalvarEdicaoEquipeOnce(){
      try {
        const btn = document.getElementById('btnSalvarEdicaoEquipe');
        if(btn && !btn.__bound){ btn.__bound=true; btn.addEventListener('click', onSalvarEdicaoEquipe); }
      } catch(_b){}
    })();
  // Listeners de grupos de turnos serÃ£o ligados apÃ³s DOMContentLoaded (ver final do arquivo)
  // pois aqui ainda nÃ£o temos els.tblGrupos definido. Mantida lÃ³gica em handler separado.
  // (removido handleClickTabelaGrupos: lÃ³gica agora inline no binding DOMContentLoaded)
  // Listener global de seguranÃ§a (caso binding local falhe)
  document.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('button[data-act]');
    if(!btn) return;
    const act = btn.getAttribute('data-act');
  if(act!=='edit-grupo' && act!=='del-grupo') return;
    // Garante que tabela ou linha exista
    const tr = btn.closest('tr');
    const id = tr && tr.getAttribute('data-id');
    if(!id){ return; }
    const grupo = state.gruposTurnos.find(g=> g.id===id);
    if(act==='edit-grupo'){
      if(!grupo){ console.warn('[escala][global-listener] grupo nÃ£o encontrado para id', id); return; }
      console.debug('[escala][global-listener] abrir ediÃ§Ã£o grupo', id);
      abrirPopupTurnos(grupo);
    } else if(act==='del-grupo'){
      if(confirm('Excluir este grupo de turnos?')){
        // utiliza fluxo persistente com servidor
        excluirGrupoTurnoPorId(id, btn);
      }
    }
  }, true);
    els.dataInicio.addEventListener('blur', ()=>{ try{ ajustarDataFimSeNecessario(); normalizarDatasPeriodoParaEstado(); }catch(e){ /* ignore */ } renderMatrizesPorGrupo(); });
    els.dataFim.addEventListener('blur', ()=>{ try{ normalizarDatasPeriodoParaEstado(); // se usuÃ¡rio colocar fim < inÃ­cio, normalizarDatas lanÃ§aria erro antes; forÃ§amos correÃ§Ã£o
        const iniBr=els.dataInicio.value.trim(); const fimBr=els.dataFim.value.trim(); if(iniBr && fimBr){ const isoIni=dateBrToISO(iniBr); const isoFim=dateBrToISO(fimBr); if(isoIni && isoFim && isoFim < isoIni){ els.dataFim.value=iniBr; normalizarDatasPeriodoParaEstado(); } }
      }catch(e){ /* ignore */ } renderMatrizesPorGrupo(); });
    // Evento change oferece resposta imediata apÃ³s seleÃ§Ã£o no flatpickr (blur sÃ³ ocorre ao fechar foco)
    els.dataInicio.addEventListener('change', ()=>{
      try {
        ajustarDataFimSeNecessario();
        // Atualiza minDate do calendÃ¡rio de tÃ©rmino para bloquear datas anteriores
        if(els.dataFim && els.dataFim._flatpickr){
          const v=els.dataInicio.value.trim();
            if(v){ els.dataFim._flatpickr.set('minDate', v); } else { els.dataFim._flatpickr.set('minDate', null); }
        }
        normalizarDatasPeriodoParaEstado();
        atualizarLabelsContexto();
      } catch(e){ /* ignore */ }
      renderMatrizesPorGrupo();
    });
    // Garantia: se usuÃ¡rio apagar manualmente fim e sair, change de inÃ­cio jÃ¡ terÃ¡ ajustado; mas tratamos change de fim tambÃ©m
    els.dataFim.addEventListener('change', ()=>{
      try {
        // Se fim vier antes do inÃ­cio por qualquer motivo externo, forÃ§amos alinhamento
        const iniBr=els.dataInicio.value.trim(); const fimBr=els.dataFim.value.trim();
        if(iniBr && fimBr){
          const isoIni=dateBrToISO(iniBr); const isoFim=dateBrToISO(fimBr);
          if(isoIni && isoFim && isoFim < isoIni){ els.dataFim.value=iniBr; }
        }
        normalizarDatasPeriodoParaEstado();
        atualizarLabelsContexto();
      } catch(e){ /* ignore */ }
      renderMatrizesPorGrupo();
    });
  // Removido botÃ£o Regerar (requisito). Caso exista ainda no HTML, removemos dinamicamente.
  const btnReg=$('btnRegerarMatriz');
  if(btnReg){ btnReg.remove(); }
    // Re-render de seguranÃ§a ao redimensionar/rolar (debounced)
    (function(){
      let t;
      function onReflow(){
        clearTimeout(t); t=setTimeout(()=>{ try { renderMatrizesPorGrupo(); } catch(_){} }, 120);
      }
      window.addEventListener('resize', onReflow, { passive:true });
      window.addEventListener('scroll', onReflow, { passive:true });
    })();
    // DelegaÃ§Ã£o: botÃµes dos grupos (novo esquema)
    els.matrizWrap.addEventListener('click', e=>{
      const btn=e.target.closest('button[data-act]'); if(!btn) return;
      const act=btn.getAttribute('data-act'); const grupoId=btn.getAttribute('data-grupo'); if(!grupoId) return;
      if(act==='grupo-modo'){
        const g = state.gruposTurnos.find(x=> x.id===grupoId);
        const agoraEdit = !(g && g.__modo==='edit');
        if(!agoraEdit){
          // Salvamento automÃ¡tico ao sair da ediÃ§Ã£o
          const container=els.matrizWrap.querySelector(`.matriz-grupo[data-grupo="${grupoId}"]`);
          if(container){
            // ValidaÃ§Ã£o: apenas equipes existentes, separadas por vÃ­rgula
            const valRes=validarEntradasGrupo(container);
            if(!valRes.ok){
              alert('As seguintes equipes nÃ£o existem: '+valRes.invalidTokens.join(', ')+".\nCorrija os campos destacados.");
              return; // permanece em modo ediÃ§Ã£o
            }
            const inputs=[...container.querySelectorAll('input.matriz-input[data-key]')];
            inputs.forEach(inp=>{
              const nomesRaw=inp.value.trim();
              const ids=nomesToIds(nomesRaw);
              const key=inp.getAttribute('data-key');
              if(ids.length) state.matrizAlocacao[key]=ids.join(','); else delete state.matrizAlocacao[key];
            });
          }
          setModoGrupo(grupoId,'view');
        } else {
          // Em escala fechada, só permitir edição se houver ao menos um dia destravado
          if(isEscalaFechada()){
            const temDiaLivre = state && state.diasDestrancados && state.diasDestrancados.size>0;
            if(!temDiaLivre){
              alert('Edição não permitida: a escala está fechada. Destrave um dia no cabeçalho para editar.');
              return;
            }
          }
          setModoGrupo(grupoId,'edit');
        }
        renderMatrizesPorGrupo();
      } else if(act==='grupo-limpar'){
        if(confirm('Apagar TODAS as alocaÃ§Ãµes deste grupo?')){
          Object.keys(state.matrizAlocacao).forEach(k=>{ if(k.startsWith(grupoId+'::')) delete state.matrizAlocacao[k]; });
          renderMatrizesPorGrupo();
        }
      }
    });

    // Fallback global: garante funcionamento mesmo se o listener acima nÃ£o for ligado a tempo
    document.addEventListener('click', async function(ev){
      const btn=ev.target && ev.target.closest && ev.target.closest('button[data-act][data-grupo]');
      if(!btn){
        // tenta um botÃ£o sem data-grupo explÃ­cito
        const btn2 = ev.target && ev.target.closest && ev.target.closest('button[data-act]');
        if(!btn2) return;
        const act2 = btn2.getAttribute('data-act');
        if(act2!=='grupo-modo' && act2!=='grupo-limpar') return;
        const gid2 = resolverGrupoIdDoElemento(btn2); if(!gid2) return;
        ev.preventDefault();
        if(act2==='grupo-modo'){
          const g = state.gruposTurnos.find(x=> String(x.id)===String(gid2));
          const agoraEdit = !(g && g.__modo==='edit');
          if(!agoraEdit){
            const container=(document.getElementById('matrizAlocacao')||document).querySelector(`.matriz-grupo[data-grupo="${gid2}"]`);
            if(container){ const v=validarEntradasGrupo(container); if(!v.ok){ alert('As seguintes equipes nÃ£o existem: '+v.invalidTokens.join(', ')+".\nCorrija os campos destacados."); return; }
              const inputs=[...container.querySelectorAll('input.matriz-input[data-key]')];
              inputs.forEach(inp=>{ const ids=nomesToIds(inp.value.trim()); const key=inp.getAttribute('data-key'); if(ids.length) state.matrizAlocacao[key]=ids.join(','); else delete state.matrizAlocacao[key]; }); }
            setModoGrupo(gid2,'view');
          } else {
            if(isEscalaFechada()){
              const temDiaLivre = state && state.diasDestrancados && state.diasDestrancados.size>0;
              if(!temDiaLivre){ alert('Edição não permitida: a escala está fechada. Destrave um dia no cabeçalho para editar.'); return; }
            }
            setModoGrupo(gid2,'edit');
          }
          renderMatrizesPorGrupo();
        } else {
          if(confirm('Apagar TODAS as alocaÃ§Ãµes deste grupo?')){ Object.keys(state.matrizAlocacao).forEach(k=>{ if(k.startsWith(String(gid2)+'::')) delete state.matrizAlocacao[k]; }); renderMatrizesPorGrupo(); }
        }
        return;
      }
      const act=btn.getAttribute('data-act');
      if(act!=='grupo-modo' && act!=='grupo-limpar') return;
      ev.preventDefault();
      let grupoId=btn.getAttribute('data-grupo'); if(!grupoId){ grupoId = resolverGrupoIdDoElemento(btn); } if(!grupoId) return;
      if(act==='grupo-modo'){
        const g = state.gruposTurnos.find(x=> String(x.id)===String(grupoId));
        const agoraEdit = !(g && g.__modo==='edit');
        if(!agoraEdit){
          const container=(document.getElementById('matrizAlocacao')||document).querySelector(`.matriz-grupo[data-grupo="${grupoId}"]`);
          if(container){
            const valRes=validarEntradasGrupo(container);
            if(!valRes.ok){ alert('As seguintes equipes nÃ£o existem: '+valRes.invalidTokens.join(', ')+".\nCorrija os campos destacados."); return; }
            const inputs=[...container.querySelectorAll('input.matriz-input[data-key]')];
            inputs.forEach(inp=>{ const ids=nomesToIds(inp.value.trim()); const key=inp.getAttribute('data-key'); if(ids.length) state.matrizAlocacao[key]=ids.join(','); else delete state.matrizAlocacao[key]; });
          }
          // Salva silenciosamente ao sair do modo ediÃ§Ã£o para evitar alertas repetidos
          await salvarEscala(false, { silent: true });
          setModoGrupo(grupoId,'view');
        } else {
          if(isEscalaFechada()){
            const temDiaLivre2 = state && state.diasDestrancados && state.diasDestrancados.size>0;
            if(!temDiaLivre2){ alert('Edição não permitida: a escala está fechada. Destrave um dia no cabeçalho para editar.'); return; }
          }
          setModoGrupo(grupoId,'edit');
        }
        renderMatrizesPorGrupo();
      } else if(act==='grupo-limpar'){
        if(confirm('Apagar TODAS as alocaÃ§Ãµes deste grupo?')){ Object.keys(state.matrizAlocacao).forEach(k=>{ if(k.startsWith(grupoId+'::')) delete state.matrizAlocacao[k]; }); renderMatrizesPorGrupo(); }
      }
    }, true);
    $('btnSalvarEscalaTopo')?.addEventListener('click', ()=> salvarEscala(false));
  const btnSalvarDG = $('btnSalvarSecDados');
  if(btnSalvarDG){
    if(!btnSalvarDG.dataset._originalLabel){ btnSalvarDG.dataset._originalLabel = btnSalvarDG.innerText; }
    // Captura estado baseline ao entrar na pÃ¡gina (serÃ¡ atualizado depois do primeiro save)
    if(!state._dadosGeraisOriginal){ state._dadosGeraisOriginal = {}; }
    function snapshotDadosGerais(){
      state._dadosGeraisOriginal = {
        descricao: els.descricao?.value||'',
        classificacao: els.classificacao?.value||'',
        unidadeId: els.unidade?.value||'',
        periodoIni: els.dataInicio?.value||'',
        periodoFim: els.dataFim?.value||'',
        responsavelId: state.dadosGerais?.responsavelId || state.responsavel?.id || null,
        responsavelNome: els.respNome?.value||''
      };
    }
    function houveAlteracao(){
      const base = state._dadosGeraisOriginal || {};
      if((els.descricao?.value||'') !== (base.descricao||'')) return true;
      if((els.classificacao?.value||'') !== (base.classificacao||'')) return true;
      if((els.unidade?.value||'') !== (base.unidadeId||'')) return true;
      if((els.dataInicio?.value||'') !== (base.periodoIni||'')) return true;
      if((els.dataFim?.value||'') !== (base.periodoFim||'')) return true;
      const atualRespId = state.responsavel?.id || state.dadosGerais?.responsavelId || null;
      if((atualRespId||null) !== (base.responsavelId||null)) return true;
      return false;
    }
    function atualizarEstadoBotao(){
      if(houveAlteracao()){
        btnSalvarDG.disabled = false;
        btnSalvarDG.classList.add('btn-warning');
        btnSalvarDG.innerText = btnSalvarDG.dataset._originalLabel + ' *';
      } else {
        btnSalvarDG.disabled = true;
        btnSalvarDG.classList.remove('btn-warning');
        btnSalvarDG.innerText = btnSalvarDG.dataset._originalLabel;
      }
    }
    // Monitora campos relevantes
    ['change','input'].forEach(evt=>{
      els.descricao && els.descricao.addEventListener(evt, atualizarEstadoBotao);
      els.classificacao && els.classificacao.addEventListener(evt, atualizarEstadoBotao);
      els.unidade && els.unidade.addEventListener(evt, atualizarEstadoBotao);
      els.dataInicio && els.dataInicio.addEventListener(evt, atualizarEstadoBotao);
      els.dataFim && els.dataFim.addEventListener(evt, atualizarEstadoBotao);
    });
    // ResponsÃ¡vel selecionado via modal
    window.addEventListener('escala:efetivoSelecionado', (ev)=>{
      try {
        const f = ev.detail;
        if(f && f.id){
          // sincroniza dadosGerais.responsavelId para comparaÃ§Ã£o correta
          state.responsavel = { id:f.id, nome:f.nome||f.codigo||f.id };
          state.dadosGerais = state.dadosGerais||{};
          state.dadosGerais.responsavelId = f.id;
          if(els.respNome) els.respNome.value = state.responsavel.nome;
          console.debug('[escala][dirty-check] responsÃ¡vel selecionado', f.id, 'snapshot=', state._dadosGeraisOriginal?.responsavelId);
          // Se snapshot ainda nÃ£o foi criado (ex: usuÃ¡rio abriu modal muito rÃ¡pido), cria agora para comparar depois
          if(!state._dadosGeraisOriginal || Object.keys(state._dadosGeraisOriginal).length===0){
            state._dadosGeraisOriginal = { descricao: els.descricao?.value||'', classificacao: els.classificacao?.value||'', unidadeId: els.unidade?.value||'', periodoIni: els.dataInicio?.value||'', periodoFim: els.dataFim?.value||'', responsavelId: null };
          }
          // ForÃ§a habilitaÃ§Ã£o imediata se ID diferente do snapshot ou snapshot.responsavelId ainda nulo
          const snapResp = state._dadosGeraisOriginal.responsavelId||null;
          if(snapResp!==f.id){
            const btnSalvarDG = $('btnSalvarSecDados');
            if(btnSalvarDG){
              btnSalvarDG.disabled=false;
              btnSalvarDG.classList.add('btn-warning');
              if(!btnSalvarDG.dataset._originalLabel) btnSalvarDG.dataset._originalLabel = btnSalvarDG.innerText.replace(/ \*$/,'');
              btnSalvarDG.innerText = (btnSalvarDG.dataset._originalLabel||'Salvar Dados')+' *';
            }
          }
        }
      } catch(_e){}
      atualizarEstadoBotao();
    });
    // Inicialmente desabilitado atÃ© haver mudanÃ§a
  setTimeout(()=>{ snapshotDadosGerais(); atualizarEstadoBotao(); }, 400);
  window.addEventListener('escala:snapshotSolicitar', ()=>{ snapshotDadosGerais(); atualizarEstadoBotao(); });
    btnSalvarDG.addEventListener('click', async ()=>{
      console.log('[debug] botÃ£o salvar clicado, state.created=', state.created);
      if(btnSalvarDG.disabled) return; // proteÃ§Ã£o extra
      try {
        if(!state.created){
          console.log('[debug] chamando salvarDadosGerais');
          await salvarDadosGerais();
        } else {
          console.log('[debug] chamando salvarAlteracoesEscala');
          await salvarAlteracoesEscala();
        }
        snapshotDadosGerais();
        atualizarEstadoBotao();
      } catch(err){ console.error('[escala][save] erro ao salvar', err); alert('Erro ao salvar: '+(err.message||err)); }
    });
  }
  // Botão Salvar Alocação removido do HTML; não registrar listener aqui.
  // Botão Validar Escala apenas verifica conflitos; fechamento é etapa separada (bind único)
  (function(){
    try{
      const btn = $('btnValidarEscala');
      if(btn && !btn.__escValidBound__){
        btn.addEventListener('click', ()=>{ executarValidacaoConflitos(); });
        btn.__escValidBound__ = true;
        btn.__bound = true; // compat com aba6_validacao.js
      }
    }catch(_e){}
  })();
  // Fallback global: dispara validaÃ§Ã£o se o binding direto nÃ£o ocorreu
  document.addEventListener('click', (ev)=>{
    const el = ev.target && (ev.target.id==='btnValidarEscala' ? ev.target : (ev.target.closest && ev.target.closest('#btnValidarEscala')));
    if(!el) return;
    // Evita dupla execuÃ§Ã£o se jÃ¡ houver __bound
    if(el.__escValidBound__) return;
    executarValidacaoConflitos();
  }, true);
    // (Removida duplicaÃ§Ã£o de salvarDadosGerais aqui)
  try { window.openEquipeEfetivoModal = openEquipeEfetivoModal; } catch(_e){}
  // (funÃ§Ã£o dinÃ¢mica antiga abrirModalEfetivoEquipe removida - fluxo agora centralizado via delegaÃ§Ã£o e modal estÃ¡tico)
  // LEGACY handlers desativados (conflitavam com openEquipeEfetivoModal)
  if(false){
    const inputCodigo=document.getElementById('efetivoCodigo');
    const btnAdd=document.getElementById('btnAdicionarEfetivo');
    const btnBuscar=document.getElementById('btnBuscarFuncionario');
    async function adicionarPorCodigo(){}
    if(btnBuscar) btnBuscar.onclick=null;
    if(btnAdd) btnAdd.onclick=null;
  }
  }
  try {
    window.__ESCALA_FUNCS__ = window.__ESCALA_FUNCS__ || {};
    window.__ESCALA_FUNCS__.abrirModalDetalhamentoEquipeDia = abrirModalDetalhamentoEquipeDiaImpl;
    // expor símbolo auxiliar para diagnósticos e compatibilidade
    window.abrirModalDetalhamentoEquipeDiaImpl = abrirModalDetalhamentoEquipeDiaImpl;
    // alinhar alias global principal ao impl robusto
    window.abrirModalDetalhamentoEquipeDia = abrirModalDetalhamentoEquipeDiaImpl;
    try {
      console.debug('[escala][modal-det][expose] impl definida. typeof impl=', typeof window.abrirModalDetalhamentoEquipeDiaImpl,
        ' typeof global=', typeof window.abrirModalDetalhamentoEquipeDia,
        ' typeof ns=', typeof window.__ESCALA_FUNCS__?.abrirModalDetalhamentoEquipeDia);
    } catch(_log){}
  } catch(_e){}
  // (Removido bloco duplicado de modal de membros fora de funÃ§Ã£o)
  // ===== MODAL DE MEMBROS DO RECURSO ===== (DEFINIÃ‡ÃƒO ÃšNICA) =====
  // ===== MODAL DE MEMBROS DO RECURSO =====
  function garantirModalMembros(){
    if(document.getElementById('modalMembrosRecurso')) return;
    const div=document.createElement('div');
    div.innerHTML=`<div class="modal fade" id="modalMembrosRecurso" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header py-2"><h6 class="modal-title">Membros do Recurso <span id="mmrRecursoNome" class="text-primary"></span></h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div class="row g-2 mb-2">
              <div class="col-4"><input type="text" id="mmrFuncionarioId" class="form-control form-control-sm" placeholder="ID ou matrÃ­cula" /></div>
              <div class="col-4"><input type="text" id="mmrFuncionarioNome" class="form-control form-control-sm" placeholder="Nome" /></div>
              <div class="col-3"><input type="text" id="mmrAtribuicao" class="form-control form-control-sm" placeholder="AtribuiÃ§Ã£o" /></div>
              <div class="col-1 d-grid"><button type="button" id="mmrBtnAdd" class="btn btn-sm btn-primary">Add</button></div>
            </div>
            <div class="table-responsive" style="max-height:260px;">
              <table class="table table-sm table-bordered mb-0" id="mmrTabela"><thead><tr><th style="width:20%">FuncionÃ¡rio</th><th>Nome</th><th style="width:25%">AtribuiÃ§Ã£o</th><th style="width:60px" class="text-center">&nbsp;</th></tr></thead><tbody></tbody></table>
            </div>
            <div class="form-text mt-2">Apenas funcionÃ¡rios jÃ¡ presentes na equipe serÃ£o aceitos. ValidaÃ§Ã£o final ocorre ao salvar.</div>
          </div>
          <div class="modal-footer py-2"><button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Fechar</button><button type="button" id="mmrBtnSalvar" class="btn btn-sm btn-success">Salvar Membros</button></div>
        </div></div></div>`;
    document.body.appendChild(div.firstElementChild);
  }
  function abrirModalMembrosRecurso(recurso){
    if(!recurso){ return alert('Recurso nÃ£o encontrado.'); }
    garantirModalMembros();
    const modalEl=document.getElementById('modalMembrosRecurso');
    const titulo=document.getElementById('mmrRecursoNome');
    const tbody=modalEl.querySelector('#mmrTabela tbody');
    const inpId=document.getElementById('mmrFuncionarioId');
    const inpNome=document.getElementById('mmrFuncionarioNome');
    const inpAtr=document.getElementById('mmrAtribuicao');
    const btnAdd=document.getElementById('mmrBtnAdd');
    const btnSalvar=document.getElementById('mmrBtnSalvar');
    titulo.textContent = recurso.nome || recurso.placa || recurso.id || '';
    let lista = Array.isArray(recurso.membros)? recurso.membros.map(m=>({...m})) : [];
    function render(){
      if(!lista.length){ tbody.innerHTML='<tr class="text-muted"><td colspan="4" class="text-center small">Nenhum membro.</td></tr>'; return; }
      tbody.innerHTML=lista.map((m,i)=>`<tr data-idx="${i}"><td>${m.funcionario_id}</td><td>${m.nome||'-'}</td><td>${m.atribuicao||'-'}</td><td class="text-center"><button class="btn btn-sm btn-outline-danger" data-act="rm">&times;</button></td></tr>`).join('');
    }
    render();
    tbody.onclick=e=>{ const b=e.target.closest('button[data-act="rm"]'); if(!b) return; const tr=b.closest('tr'); const idx=parseInt(tr.getAttribute('data-idx'),10); if(!isNaN(idx)){ lista.splice(idx,1); render(); } };
    btnAdd.onclick=()=>{
      const idVal=inpId.value.trim();
      if(!idVal) return inpId.focus();
      if(lista.some(m=> m.funcionario_id===idVal)) { inpId.focus(); return; }
      lista.push({ funcionario_id:idVal, nome:inpNome.value.trim()||null, atribuicao:inpAtr.value.trim()||null, diasDisponiveis: Array.isArray(recurso?.diasDisponiveis)? recurso.diasDisponiveis: undefined });
      inpId.value=''; inpNome.value=''; inpAtr.value='';
      render(); inpId.focus();
    };
    btnSalvar.onclick=async ()=>{
      if(!state.created || !state.escalaId){ return alert('Salve a escala antes.'); }
      try {
        btnSalvar.setAttribute('disabled','disabled');
        const recursoKey = recurso.id || recurso.referenciaGestorId;
        const payload = { membros: lista };
        // Poda de atribuiÃ§Ãµes incompatÃ­veis com disponibilidade
        try {
          const equipeRef = (window.__ESCALA_STATE__?.equipes||[]).find(e=> e.id===recurso.equipeId);
          if(equipeRef && Array.isArray(recurso.atribuicoes)){
            const dispMap = new Map();
            equipeRef.componentes.forEach(c=>{ if(c.id && Array.isArray(c.diasDisponiveis)) dispMap.set(c.id, new Set(c.diasDisponiveis)); });
            recurso.atribuicoes = recurso.atribuicoes.filter(at=>{
              const fid = at.membroFuncionarioId||at.funcionarioId||at.funcionario_id; const dia=at.dia;
              if(!fid||!dia) return false;
              const set = dispMap.get(fid); if(!set) return false;
              return set.has(dia);
            });
          }
        } catch(_pod){ /* ignore */ }
        const res = await fetch(basePath()+`/api/escalas/${state.escalaId}/equipes/${encodeURIComponent(recurso.equipeId)}/recursos/${encodeURIComponent(recursoKey)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ recurso: { ...recurso, membros: lista } }) });
        if(!res.ok){ const t=await res.text(); alert('Falha ao salvar membros: '+t); return; }
        recurso.membros = lista.map(m=>({...m}));
        renderRecursos();
        const inst=bootstrap.Modal.getInstance(modalEl); if(inst) inst.hide();
      } catch(e){ alert('Erro salvar membros'); } finally { btnSalvar.removeAttribute('disabled'); }
    };
    let inst=bootstrap.Modal.getInstance(modalEl); if(!inst){ inst=new bootstrap.Modal(modalEl); }
    inst.show();
    setTimeout(()=> inpId?.focus(), 200);
  }
}

  // === InicializaÃ§Ã£o principal (refatorada) ===

  // Funções utilitárias globais
  function getEscalaId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('id');
      if (id) {
        console.log('[escala][getEscalaId] encontrado na URL:', id);
        return id;
      }
    } catch (e) {
      console.warn('[escala][getEscalaId] erro ao ler URL:', e);
    }
    try {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#id=')) {
        const id = hash.substring(4);
        console.log('[escala][getEscalaId] encontrado no hash:', id);
        return id;
      }
    } catch (e) {
      console.warn('[escala][getEscalaId] erro ao ler hash:', e);
    }
    console.log('[escala][getEscalaId] nenhum ID encontrado');
    return null;
  }

  function dateBrToISO(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return date.toISOString().split('T')[0];
  }

  function obterDiaSemanaAbrev(dateStr) {
    const iso = dateBrToISO(dateStr);
    if (!iso) return '';
    const date = new Date(iso + 'T00:00:00');
    const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    return days[date.getDay()];
  }

  // (removida duplicação de iniciarLoopResolucaoUnidade aqui; usa-se a versão canônica definida anteriormente)

  async function atualizarPeriodosDisponiveis(equipeId, dia) {
    console.log('[escala][periodos] atualizarPeriodosDisponiveis chamado para equipe', equipeId, 'dia', dia);
    try {
      const response = await fetch(basePath() + '/api/escalas/' + state.escalaId + '/equipes/' + equipeId + '/periodos-disponiveis?dia=' + encodeURIComponent(dia), {
        credentials: 'same-origin'
      });
      if (!response.ok) {
        throw new Error('Erro HTTP: ' + response.status);
      }
      const data = await response.json();
      console.log('[escala][periodos] dados recebidos:', data);
      // Atualizar a UI com os períodos disponíveis
      const container = document.querySelector(`[data-equipe="${equipeId}"][data-dia="${dia}"]`);
      if (container) {
        // Limpar conteúdo anterior
        container.innerHTML = '';
        // Adicionar períodos disponíveis
        if (data.periodos && data.periodos.length > 0) {
          data.periodos.forEach(periodo => {
            const div = document.createElement('div');
            div.className = 'periodo-disponivel';
            div.textContent = periodo;
            container.appendChild(div);
          });
        } else {
          container.textContent = 'Nenhum período disponível';
        }
      }
    } catch (error) {
      console.error('[escala][periodos] erro ao atualizar períodos disponíveis:', error);
      // Mostrar erro na UI
      const container = document.querySelector(`[data-equipe="${equipeId}"][data-dia="${dia}"]`);
      if (container) {
        container.textContent = 'Erro ao carregar';
      }
    }
  }

const initEscalaPage = function initEscalaPage(){
  if(!window.__INIT_COUNT) window.__INIT_COUNT = 0;
  window.__INIT_COUNT++;
  console.log('[escala][init] initEscalaPage chamada #' + window.__INIT_COUNT);
  if(window.__INIT_RUNNING) {
    console.log('[escala][init] reentrância detectada, ignorando chamada #' + window.__INIT_COUNT);
    return;
  }
  window.__INIT_RUNNING = true;
  console.log('[escala][init] location.href=', location.href);
  // Mapeamento ajustado para IDs reais do template EJS
  els.descricao=document.getElementById('descricaoEscala')||document.querySelector('#descricao, [name="descricao"]');
  els.classificacao=document.getElementById('classificacaoEscala')||document.querySelector('#classificacao,[name="classificacao"]');
  els.unidade=document.getElementById('unidadeEscala')||document.querySelector('#unidade,[name="unidade"]');
  els.dataInicio=document.getElementById('dataInicio')||document.querySelector('#periodoInicio,[name="dataInicio"],[name="periodoInicio"]');
  els.dataFim=document.getElementById('dataFim')||document.querySelector('#periodoFim,[name="dataFim"],[name="periodoFim"]');
  els.respNome=document.getElementById('responsavelNome')||document.querySelector('#responsavel,[name="responsavel"]');
  els.btnResp=document.getElementById('btnSelecionarResponsavel');
  els.tblGrupos=$('tabelaGruposTurnos');
  els.matrizWrap=$('matrizAlocacao')||document.querySelector('#wrapMatrizAlocacao');
  els.tblEquipes=$('tabelaEquipes');
  els.tblRecursos=$('tabelaRecursos');
  // Cria/atualiza um espelho textual da unidade selecionada (útil quando o select está desabilitado)
  try {
    const selUni = els.unidade;
    if(selUni && !document.getElementById('unidadeMirror')){
      const span = document.createElement('div');
      span.id='unidadeMirror';
      span.className='form-text text-muted mt-1';
      span.style.fontSize = '0.85rem';
      selUni.insertAdjacentElement('afterend', span);
    }
  } catch(_mir){ }
  // Define atualizador do espelho textual
  try {
    if(typeof window.updateUnidadeMirror !== 'function'){
      window.updateUnidadeMirror = function(){
        try {
          const sel = document.getElementById('unidadeEscala');
          const span = document.getElementById('unidadeMirror');
          if(!sel || !span) return;
          const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
          const uid = (state && state.dadosGerais && state.dadosGerais.unidadeId) ? String(state.dadosGerais.unidadeId) : (sel && sel.value ? String(sel.value) : '');
          let nome = '';
          if(opt && opt.value === uid) nome = opt.textContent || '';
          if(!nome && Array.isArray(state._unidadesCarregadas)){
            const ach = state._unidadesCarregadas.find(u=> String(u.id)===uid);
            if(ach) nome = (ach.codigo? ach.codigo+' - ': '') + (ach.nome||'Unidade');
          }
          if(!nome && state._unidadeNomeCarregada){ nome = state._unidadeNomeCarregada; }
          span.textContent = nome ? ('Unidade selecionada: ' + nome) : '';
        } catch(_um){}
      };
    }
  } catch(_defMir){}
  // Inicia loop de resolução tardia do select de unidade (prefere versão global robusta)
  try {
    const startLoop = (typeof window!=='undefined' && typeof window.iniciarLoopResolucaoUnidade==='function') ? window.iniciarLoopResolucaoUnidade : iniciarLoopResolucaoUnidade;
    startLoop && startLoop();
  } catch(_e){}
  try { (typeof bindUnidadeValueGuard==='function' ? bindUnidadeValueGuard : (window && window.bindUnidadeValueGuard))?.(); } catch(_e){}
  // Dispara fetch de unidades bem cedo
  setTimeout(()=>{ try { (typeof fetchAndPopulateUnidades==='function'? fetchAndPopulateUnidades : (window && window.fetchAndPopulateUnidades))?.(); } catch(_e){} }, 40);
  try { (typeof iniciarObserverUnidade==='function' ? iniciarObserverUnidade : (window && window.iniciarObserverUnidade))?.(); } catch(_e){}
  try { (typeof instalarObserverUnidade==='function'? instalarObserverUnidade : (window && window.instalarObserverUnidade))?.(); } catch(_e){}
  try { (typeof garantirUnidadeApos==='function' ? garantirUnidadeApos : (window && window.garantirUnidadeApos))?.(); } catch(_e){}
  try { (typeof iniciarEnforcerUnidade==='function' ? iniciarEnforcerUnidade : (window && window.iniciarEnforcerUnidade))?.(); } catch(_e){}
  try { (typeof detectarTipoSeAusente==='function' ? detectarTipoSeAusente : (window && window.detectarTipoSeAusente))?.('init'); } catch(_e){}
  try { updateClassificationUI && updateClassificationUI(); } catch(_e){}
  // Retry tardio caso HTML/elemento tenha surgido apÃ³s mapping inicial ou detecÃ§Ã£o atrasada
  setTimeout(()=>{ try { (typeof detectarTipoSeAusente==='function' ? detectarTipoSeAusente : (window && window.detectarTipoSeAusente))?.('retry-300ms'); } catch(_e){} try { updateClassificationUI && updateClassificationUI(); } catch(_e){} },300);
  setTimeout(()=>{ try { (typeof detectarTipoSeAusente==='function' ? detectarTipoSeAusente : (window && window.detectarTipoSeAusente))?.('retry-1000ms'); } catch(_e){} try { updateClassificationUI && updateClassificationUI(); } catch(_e){} },1000);
  setTimeout(() => {
    const id = getEscalaId();
    console.log('[escala][init] apÃ³s getEscalaId (delayed), id=', id, 'truthy?', !!id);
    if (id) {
      console.log('[escala][init] id encontrado via getEscalaId:', id);
      state.escalaId = id;
      (async () => {
        try {
          await carregarEscalaExistente(id);
          // Sincroniza classificaÃ§Ã£o apÃ³s carregar backend
          try {
            if (!state.tipo && state.dadosGerais?.classificacao) { state.tipo = state.dadosGerais.classificacao; }
            updateClassificationUI();
          } catch (_sync) {}
          try {
            if (state.responsavel?.id) {
              state.dadosGerais = state.dadosGerais || {};
              state.dadosGerais.responsavelId = state.responsavel.id;
            }
            window.dispatchEvent(new CustomEvent('escala:snapshotSolicitar'));
          } catch (_adj) {}
        } catch (e) { console.warn('[escala][init] erro carregarEscalaExistente', e); }
      })();
    } else {
      console.log('[escala][init] id nÃ£o encontrado via getEscalaId');
      alert('ID da escala nÃ£o encontrado na URL. Verifique se a URL contÃ©m ?id=...');
    }
  }, 200);
  avaliarProgressaoAbas();
  console.warn('[escala][init] done');
  // Binding explÃ­cito do botÃ£o Inserir Turnos (alÃ©m da delegaÃ§Ã£o e data-action)
  try {
    const btnNovo = document.getElementById('btnNovoGrupoTurnos');
    if(btnNovo && !btnNovo.__turnosBound){
      btnNovo.__turnosBound = true;
      btnNovo.addEventListener('click', (ev)=>{ ev.preventDefault(); console.debug('[escala][turnos] clique direto botÃ£o Inserir'); abrirPopupNovoGrupo(); });
    } else if(!btnNovo){
      console.warn('[escala][turnos] botÃ£o #btnNovoGrupoTurnos nÃ£o encontrado para binding direto');
    }
  } catch(_bTurn){ }
  // Render tardio se o carregamento da escala ocorreu antes do mapeamento dos elementos
  if(state._needRenderAfterMap){
    setTimeout(()=>{
      try {
        if(state.gruposTurnos?.length) renderGruposTurnos();
        if(state.equipes?.length) renderEquipes();
        if(state.matrizAlocacao && Object.keys(state.matrizAlocacao).length) renderMatrizesPorGrupo();
        avaliarProgressaoAbas?.();
        console.debug('[escala][init][late-render] aplicado');
      } catch(e){ console.warn('[escala][init][late-render] falha', e); }
    },60);
  }
  // Garante que campos de equipe estejam editÃ¡veis
  try {
    const nomeEl = document.getElementById('nomeEquipe');
    const descEl = document.getElementById('descricaoEquipe');
    [nomeEl, descEl].forEach(el=>{
      if(!el) return;
      el.removeAttribute('disabled');
      el.removeAttribute('readonly');
      el.style.pointerEvents='';
      el.classList.remove('escala-field-locked');
      if(el.__escalaLockHandler__){
        el.removeEventListener('keydown', el.__escalaLockHandler__, true);
        el.removeEventListener('beforeinput', el.__escalaLockHandler__, true);
        el.removeEventListener('input', el.__escalaLockHandler__, true);
        delete el.__escalaLockHandler__;
      }
    });
    // ValidaÃ§Ã£o dinÃ¢mica do botÃ£o Inserir
    const btnAdd = document.getElementById('btnAddEquipe');
    function normalizarNomeEquipe(v){ return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3); }
    function updateEquipeAddButtonState(){
      if(!btnAdd || !nomeEl) return;
      const nome = normalizarNomeEquipe(nomeEl.value);
      // reflete normalizaÃ§Ã£o no input
      if(nomeEl.value !== nome) nomeEl.value = nome;
      const invalido = !nome || (window.__ESCALA_EQ_PENDING__?.has(nome)) || (Array.isArray(state.equipes) && state.equipes.some(e=> (e.nome||'').toUpperCase()===nome));
      if(invalido){ btnAdd.setAttribute('disabled','disabled'); }
      else { if(btnAdd.dataset.busy!=='1') btnAdd.removeAttribute('disabled'); }
    }
    if(nomeEl){ nomeEl.addEventListener('input', updateEquipeAddButtonState); setTimeout(updateEquipeAddButtonState, 0); }
    // TambÃ©m atualiza quando estado muda via recarregamento
    document.addEventListener('escala:equipes-alteradas', updateEquipeAddButtonState);
    // Mantém a tabela de Equipes e matrizes sincronizadas sempre que houver alterações nas equipes/componentes
    try {
      document.addEventListener('escala:equipes-alteradas', function(){
        try { if(typeof renderEquipes==='function') renderEquipes(); } catch(_e){}
        try { if(typeof renderMatrizesPorGrupo==='function') renderMatrizesPorGrupo(); } catch(_e){}
      });
    } catch(_syncEvt){}
  } catch(_unlockEq){}
  // Reage quando o ID Ã© obtido apÃ³s salvar dados gerais
  document.addEventListener('escala:id-obtido', ()=>{
    try {
      const btnAdd = document.getElementById('btnAddEquipe');
      if(btnAdd){ btnAdd.removeAttribute('disabled'); }
      if(typeof avaliarProgressaoAbas==='function') avaliarProgressaoAbas();
    } catch(_e){}
  });
  // Watchdog: se passados 300ms apÃ³s init ainda nÃ£o carregou a escala (e hÃ¡ id), tenta carregar
  setTimeout(()=>{
    try {
      if(!state.created){
        const idW = obterQueryId();
        if(idW){ console.warn('[escala][watchdog] escala ainda nÃ£o carregada; disparando carregarEscalaExistente'); carregarEscalaExistente(idW); }
      }
    } catch(_wd){}
  },300);
  // Segunda tentativa apÃ³s 1.2s
  setTimeout(()=>{
    try {
      if(!state.created){
        const idW = obterQueryId();
        if(idW){ console.warn('[escala][watchdog-2] segunda tentativa carregarEscalaExistente'); carregarEscalaExistente(idW); }
      }
    } catch(_wd2){}
  },1200);
  // Sinalizadores globais de readiness para coordenar fallback tardio de ediÃ§Ã£o
  try {
    window.__ESCALA_INIT_DONE__ = true;
    document.dispatchEvent(new CustomEvent('escala:init-done', { detail:{ created:!!state.created, escalaId: state.escalaId||null } }));
  } catch(_evt){}
  // Marca boot concluÃ­do para evitar tomada de controle do fallback
  try { if(!window.__ESCALA_BOOT_OK) window.__ESCALA_BOOT_OK = true; } catch(_flag){}
};
// Expor imediatamente apÃ³s definiÃ§Ã£o
try {
  console.log('[escala][expose] typeof initEscalaPage:', typeof initEscalaPage);
  console.log('[escala][expose] typeof window.initEscalaPage:', typeof window.initEscalaPage);
  if(typeof window.initEscalaPage !== 'function' || __isInitStub(window.initEscalaPage)){
    window.initEscalaPage = initEscalaPage;
    console.log('[escala][expose] initEscalaPage exposta com sucesso');
    try {
      if(!window.__ESCALA_CORE_READY_EMITTED__){
        document.dispatchEvent(new CustomEvent('escala:core-ready'));
        window.__ESCALA_CORE_READY_EMITTED__ = true;
      }
    } catch(_e){}
  }
  // Amarra a real Ã  ponte e drena fila pendente
  try { window.__INIT_ESCALA_REAL__ = initEscalaPage; } catch(_a){}
  try {
    const q = Array.isArray(window.__ESCALA_INIT_QUEUE__)? window.__ESCALA_INIT_QUEUE__:[];
    if(q.length){
      console.debug('[escala][expose] drenando fila de init (', q.length, ')');
      q.length = 0;
      // Chama a real imediatamente apÃ³s dreno
  setTimeout(()=>{ try { if(typeof window.initEscalaPage==='function' && !__isInitStub(window.initEscalaPage)){ window.initEscalaPage(); window.__ESCALA_BOOT_OK=true; } } catch(_c){} }, 0);
    }
  } catch(_drain){}
  console.warn('[escala][expose] initEscalaPage definida e exposta');
  try {
    if(!window.__ESCALA_CORE_READY_EMITTED__){
      document.dispatchEvent(new CustomEvent('escala:core-ready'));
      window.__ESCALA_CORE_READY_EMITTED__ = true;
    }
  } catch(_e){}
  try { document.dispatchEvent(new CustomEvent('escala:core-carregado')); } catch(_e){}
  // Gatilho imediato adicional: se ainda nÃ£o sinalizou boot e a funÃ§Ã£o real jÃ¡ estÃ¡ exposta, chama agora
  try {
    if(!window.__ESCALA_BOOT_OK && typeof window.initEscalaPage==='function' && !__isInitStub(window.initEscalaPage)){
      window.initEscalaPage();
      window.__ESCALA_BOOT_OK = true;
    }
  } catch(_kick){}
} catch(_expose){ console.warn('[escala][expose] falha ao expor initEscalaPage (pÃ³s-definiÃ§Ã£o)', _expose); }
// Tentativa imediata de inicializaÃ§Ã£o evitando condiÃ§Ã£o de corrida
(function immediateInitTry(){
  // Em vez de chamar diretamente (risco de TDZ), apenas agenda na fila para ser drenada apÃ³s a definiÃ§Ã£o
  try {
    if(!window.__ESCALA_BOOT_OK){
      const enqueue = (from)=>{
        try {
          const q = (window.__ESCALA_INIT_QUEUE__ = window.__ESCALA_INIT_QUEUE__ || []);
          q.push({ ts: Date.now(), from: from||'immediate' });
          console.debug('[escala][boot] init agendado via fila (__ESCALA_INIT_QUEUE__)', from||'immediate');
        } catch(_q){}
      };
      if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded', ()=> enqueue('DOMContentLoaded'));
      } else {
        enqueue('immediate');
      }
    }
  } catch(_e){}
})();
// Watchdog: se apÃ³s 1200ms nÃ£o sinalizou boot, tentar novamente
setTimeout(()=>{
  try {
    if(!window.__ESCALA_BOOT_OK){
      console.warn('[escala][boot-watchdog] re-tentando init (preferindo local)');
      try { if(typeof initEscalaPage==='function'){ initEscalaPage(); window.__ESCALA_BOOT_OK = true; } }
      catch(_l){}
      if(!window.__ESCALA_BOOT_OK && typeof window.initEscalaPage==='function'){ try { window.initEscalaPage(); window.__ESCALA_BOOT_OK = true; } catch(_w){} }
    }
  } catch(_e){}
}, 1200);

// --- Turnos: refresh automÃ¡tico e binds quando o core Escala estiver pronto ---
try {
  document.addEventListener('escalaCoreReady', function(){
    if (window.__ESCALA_TURNOS_READY_BOUND__) return;
    window.__ESCALA_TURNOS_READY_BOUND__ = true;
    console.log('[escala][turnos] Core pronto â€“ habilitando refresh automÃ¡tico');
    try {
      const el = document.getElementById('modalSelecionarTurnos') || document.getElementById('modalTurno');
      if (el) {
        el.addEventListener('hidden.bs.modal', ()=>{
          try { document.dispatchEvent(new CustomEvent('turnoAtualizado')); } catch(_e){}
          try { setTimeout(()=> window.refreshTurnosUI && window.refreshTurnosUI({ ensureChange:true }), 150); } catch(_rfs){}
        });
      }
    } catch(_m){}
    // Listener de evento customizado â€“ atualiza lista sem trocar de aba
    try {
      document.addEventListener('turnoAtualizado', ()=>{
        try { window.refreshTurnosUI && window.refreshTurnosUI({ ensureChange:true }); } catch(_e){}
      });
    } catch(_l){}
    // Rede de seguranÃ§a global: caso algum listener especÃ­fico do modal nÃ£o esteja anexado
    try {
      document.addEventListener('hide.bs.modal', (ev)=>{
        try {
          const el = ev && ev.target;
          if(el && (el.id==='modalSelecionarTurnos' || el.id==='modalTurno')){
            try { document.dispatchEvent(new CustomEvent('turnoAtualizado')); } catch(_e){}
            window.refreshTurnosUI && window.refreshTurnosUI({ ensureChange:true });
          }
        } catch(_eh){}
      }, true);
      document.addEventListener('hidden.bs.modal', (ev)=>{
        try {
          const el = ev && ev.target;
          if(el && (el.id==='modalSelecionarTurnos' || el.id==='modalTurno') && window.__TURNOS_SALVOU){
            try { document.dispatchEvent(new CustomEvent('turnoAtualizado')); } catch(_e){}
            window.refreshTurnosUI && window.refreshTurnosUI({ ensureChange:true });
          }
        } catch(_eh2){}
      }, true);
    } catch(_glob){}
  });
} catch(_e){}
 // ImplementaÃ§Ã£o real de bloqueio/desbloqueio dos campos gerais (substitui stub inicial)
 (function ensureRealBloquearCamposGerais(){
   function realBloquearCamposGerais(lock){
     try {
       const desc = document.getElementById('descricaoEscala');
       const uni  = document.getElementById('unidadeEscala');
       const di   = document.getElementById('dataInicio');
       const df   = document.getElementById('dataFim');
       const btnResp = document.getElementById('btnSelecionarResponsavel');
       const respNome = document.getElementById('responsavelNome');
       const alvo = [desc, uni, di, df, btnResp, respNome].filter(Boolean);
       alvo.forEach(el=>{
        const tag = (el.tagName||'').toUpperCase();
        if(lock){
          el.classList.add('escala-field-locked');
          // desabilitar seletivamente: select e botÃµes -> disabled; inputs -> readonly + disabled para garantir estilo
          if(tag==='SELECT' || tag==='BUTTON') {
            // atributo e propriedade para resistência contra remoções de atributo
            try { el.setAttribute('disabled','disabled'); el.disabled = true; } catch(_d){}
          }
          if(tag==='INPUT'){
            try { el.setAttribute('readonly','readonly'); el.readOnly = true; } catch(_r){}
            try { el.setAttribute('disabled','disabled'); el.disabled = true; } catch(_d){}
          }
          el.style.pointerEvents='none';
          // Prev default em key/entrada
          if(!el.__escalaLockHandler__){
            const h = ev=>{ ev.preventDefault(); ev.stopPropagation(); return false; };
            el.addEventListener('keydown', h, true);
            el.addEventListener('beforeinput', h, true);
            el.addEventListener('input', h, true);
            el.__escalaLockHandler__ = h;
          }
        } else {
            try { el.removeAttribute('disabled'); el.disabled = false; } catch(_ud){}
            try { el.removeAttribute('readonly'); el.readOnly = false; } catch(_ur){}
            el.classList.remove('escala-field-locked');
            el.style.pointerEvents='';
            if(el.__escalaLockHandler__){
              el.removeEventListener('keydown', el.__escalaLockHandler__, true);
              el.removeEventListener('beforeinput', el.__escalaLockHandler__, true);
              el.removeEventListener('input', el.__escalaLockHandler__, true);
              delete el.__escalaLockHandler__;
            }
        }
       });
      if(lock){
        console.debug('[escala][lock] aplicado bloqueio campos gerais', alvo.map(x=>x&&x.id));
      } else {
        console.debug('[escala][lock] desbloqueio aplicado');
      }
      // Reforço: logo após alterar estados de disabled/readonly, garantir unidade aplicada visualmente
      try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.(lock? 'post-lock' : 'post-unlock'); } catch(_e){}
     } catch(e){ console.warn('[escala][lock] falha aplicar bloqueio', e); }
   }
   // ExpÃµe substituindo o stub se ainda for o stub (heurÃ­stica: toString length pequeno)
   try {
     const prev = window.bloquearCamposGerais;
     const isStub = !prev || /noop early stub/.test(String(prev));
     if(isStub){ window.bloquearCamposGerais = realBloquearCamposGerais; }
   } catch(_ex){}
  // Reaplicar bloqueio automaticamente em ediÃ§Ã£o (caso created jÃ¡ tenha sido setado antes dessa IIFE)
  setTimeout(()=>{ try { if(window.__ESCALA_STATE__?.created) bloquearCamposGerais(true); } catch(_e){} }, 50);
  setTimeout(()=>{ try { if(window.__ESCALA_STATE__?.created) bloquearCamposGerais(true); } catch(_e){} }, 400);
  setTimeout(()=>{ try { if(window.__ESCALA_STATE__?.created) bloquearCamposGerais(true); } catch(_e){} }, 1500);
    // Observador da seção de Dados Gerais: se houver re-render (childList), reforça o bloqueio em modo edição
    try {
      const alvoForm = document.getElementById('formDadosGerais') || document.getElementById('sec-dados-gerais');
      if(alvoForm && !alvoForm.__escalaLockObserver){
        const obs = new MutationObserver(()=>{
          try { const st = window.__ESCALA_STATE__ || {}; if(st.created && typeof window.bloquearCamposGerais==='function') window.bloquearCamposGerais(true); } catch(_r){}
        });
        obs.observe(alvoForm, { childList:true, subtree:true });
        alvoForm.__escalaLockObserver = obs;
      }
    } catch(_obs){ }
 })();
  // =============================
  // ÃšNICA DEFINIÃ‡ÃƒO CANÃ”NICA
  // salvarDadosGerais
  // NÃƒO DUPLICAR: se precisar alterar, modificar apenas aqui.
  // =============================
  async function salvarDadosGerais(){
    if(state.created){ console.debug('[escala][save] ignorado: jÃ¡ criada'); return; }
    if(state._savingGeneral){ console.warn('[escala][save] ignorado: operaÃ§Ã£o em andamento'); return; }
    state._savingGeneral = true;
    const btn = document.getElementById('btnSalvarSecDados');
    if(btn){ btn.disabled=true; btn.dataset.originalText = btn.dataset.originalText || btn.innerText; btn.innerText='Salvando...'; }
    console.debug('[escala][save] iniciar salvarDadosGerais');
    const restoreBtn = ()=>{ try { if(btn){ btn.disabled=false; btn.innerText=btn.dataset.originalText; } } catch(_e){} };
    try { coletarDadosGerais(); } catch(e){
      console.warn('[escala][save] validaÃ§Ã£o inicial falhou', e);
      alert(e.message);
      restoreBtn();
      return;
    }
    // Fallback: se classificacao nÃ£o veio do form, tenta detectar novamente
    if(!state.dadosGerais.classificacao){
  const det = (typeof detectTipoEarly==='function'? detectTipoEarly : (typeof window!=='undefined' && typeof window.detectTipoEarly==='function'? window.detectTipoEarly : ()=>null))();
      if(det){ state.dadosGerais.classificacao = det; state.tipo = det; }
      // Atualiza UI se possÃ­vel
      try {
        if(els.classificacao && !els.classificacao.value && state.dadosGerais.classificacao){ els.classificacao.value = state.dadosGerais.classificacao; }
        const lblTipo=document.getElementById('tipoEscalaLabel');
        if(lblTipo && state.dadosGerais.classificacao){ lblTipo.textContent='('+state.dadosGerais.classificacao+')'; }
      } catch(_u){}
    }
  if(!state.dadosGerais.descricao){ restoreBtn(); return alert('DescriÃ§Ã£o obrigatÃ³ria.'); }
  if(!state.dadosGerais.unidadeId){ restoreBtn(); return alert('Selecione a unidade.'); }
  if(!state.periodo.ini || !state.periodo.fim){ restoreBtn(); return alert('Defina perÃ­odo completo.'); }
    // Hardening: se usuÃ¡rio jÃ¡ selecionou responsÃ¡vel mas nÃ£o foi copiado
    if(!state.dadosGerais.responsavelId && state.responsavel?.id){
      state.dadosGerais.responsavelId = state.responsavel.id;
      try { console.debug('[escala][hardening] inject responsavelId no dadosGerais antes do POST', state.dadosGerais.responsavelId); } catch(_){ }
    }
    const payload={
      descricao: state.dadosGerais.descricao,
      classificacao: state.tipo,
      unidadeId: state.dadosGerais.unidadeId,
      periodo:{ ini: state.periodo.ini, fim: state.periodo.fim },
      gruposTurnos: state.gruposTurnos ? state.gruposTurnos.map(g=>({ id:g.id, turnos:Array.isArray(g.turnos)? g.turnos.map(t=>({...t})):[] })) : [],
      // Enviar equipes jÃ¡ adicionadas antes do primeiro save, clonando componentes para nÃ£o perder referÃªncia
      equipes: state.equipes ? state.equipes.map(e=>({ ...e, componentes: Array.isArray(e.componentes)? e.componentes.map(c=>({...c})):[] })) : [],
      alocacao: state.matrizAlocacao || {},
      validar:false,
  responsavelId: state.dadosGerais.responsavelId || state.responsavel?.id || null,
  responsavelCodigo: state.responsavelMeta?.codigo || null
    };
  try { console.debug('[escala][debug] POST /api/escalas payload', payload); } catch(_l){}
    try {
      async function tryPost(url){
        try {
          const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), credentials:'same-origin' });
          return r;
        } catch(e){ console.warn('[escala][save] erro de rede em', url, e); return { ok:false, status:-1, _err:e }; }
      }
      let res = await tryPost(basePath() + '/api/escalas');
      if(!res.ok){
        // Fallback para rota raiz sem prefixo
        console.warn('[escala][save] POST prefixo falhou', res.status, '-> tentando /api/escalas');
        const t1 = (typeof res.text==='function') ? (await res.text().catch(()=>'')) : '';
        if(t1) console.warn('[escala][save] resposta prefixo:', t1.slice(0,200));
        res = await tryPost('/api/escalas');
      }
      if(res.status===401){ restoreBtn(); alert('SessÃ£o expirada. FaÃ§a login novamente.'); return; }
      if(!res.ok){ const t=await res.text().catch(()=> ''); throw new Error(t || 'Falha ao criar escala (HTTP '+res.status+')'); }
      const js=await res.json();
      // ExtraÃ§Ã£o robusta do ID retornado em diferentes formatos ({id}, {data:{id}}, {escala:{id}}, {_id}, etc.)
      let novoId = null;
      try {
        const cand = [
          js && js.id,
          js && js._id,
          js && js.data && (js.data.id || js.data._id || (typeof js.data === 'string' ? js.data : null)),
          js && js.escala && (js.escala.id || js.escala._id),
          js && js.data && js.data.escala && (js.data.escala.id || js.data.escala._id)
        ].find(Boolean);
        if(cand) novoId = String(cand);
      } catch(_eId){}
      if(!novoId){
        // Tentativa via header Location (ex.: /api/escalas/{id})
        try {
          const loc = res.headers && res.headers.get && res.headers.get('Location');
          if(loc){
            const m = String(loc).match(/\/escalas\/?([^/?#]+)/i);
            if(m && m[1]) novoId = m[1];
          }
        } catch(_h){}
      }
      if(!novoId){ console.warn('[escala][save] POST /api/escalas nÃ£o retornou id reconhecÃ­vel', js); throw new Error('Resposta sem ID'); }
  { const _norm=(typeof normalizeId==='function'? normalizeId : (typeof window!=='undefined' && typeof window.normalizeId==='function'? window.normalizeId : (v=>v))); state.escalaId = _norm(novoId); } state.created=true; bloquearCamposGerais(true); avaliarProgressaoAbas();
  try { document.dispatchEvent(new CustomEvent('escala:id-obtido', { detail:{ id: state.escalaId } })); } catch(_evt){}
      // Se backend retornou responsavel_id resolvido, sincroniza; senÃ£o tenta resoluÃ§Ã£o via PUT
      if(js.responsavel_id){
        state.dadosGerais.responsavelId = js.responsavel_id;
        state.responsavel = state.responsavel || { id: js.responsavel_id, nome: js.responsavel_nome||els?.respNome?.value||null };
        console.log('[escala][info] responsÃ¡vel confirmado no POST', js.responsavel_id);
        alert('Dados gerais salvos. Continue configurando a escala.');
      } else {
        console.warn('[escala][warn] POST retornou responsavel_id null; tentando resoluÃ§Ã£o posterior');
        // Tenta resolver responsÃ¡vel via PUT (atualizaÃ§Ã£o da escala) enviando campos explícitos
        try {
          const putPayload = {
            id: state.escalaId,
            responsavelId: state.dadosGerais?.responsavelId || state.responsavel?.id || null,
            responsavelCodigo: state.responsavelMeta?.codigo || state.responsavel?.codigo || null,
            responsavelCPF: state.responsavelMeta?.cpf || state.responsavel?.cpf || null
          };
          try { console.debug('[escala][warn] PUT fallback com dados de responsável', putPayload); } catch(_d){}
          const putRes = await fetch(basePath() + '/api/escalas/' + state.escalaId, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(putPayload), credentials:'same-origin' });
          if(putRes.ok){
            const putJs = await putRes.json();
            if(putJs.responsavel_id){
              state.dadosGerais.responsavelId = putJs.responsavel_id;
              state.responsavel = state.responsavel || { id: putJs.responsavel_id, nome: putJs.responsavel_nome||els?.respNome?.value||null };
              console.log('[escala][info] responsÃ¡vel resolvido no PUT', putJs.responsavel_id);
            } else {
              console.warn('[escala][warn] PUT nÃ£o retornou responsavel_id');
            }
          } else {
            console.warn('[escala][warn] falha ao tentar resolver responsavel_id via PUT');
          }
        } catch(_putErr){ console.warn('[escala][warn] erro inesperado ao tentar resolver responsavel_id via PUT', _putErr); }
      }
      // Redirecionar para ediÃ§Ã£o imediata (se nÃ£o houver ID na URL, adicionar query)
      try {
        const u = new URL(location.href);
        if(!u.searchParams.get('id')){
          u.searchParams.set('id', state.escalaId);
          history.replaceState(null, '', u.toString());
        } else {
          // Atualiza query se veio um placeholder antigo
          u.searchParams.set('id', state.escalaId);
          history.replaceState(null, '', u.toString());
        }
      } catch(_){ }
      // (Re)carregar dados da escala (agora deve ter ID vÃ¡lido)
      console.debug('[escala][save] sucesso criar escala id=', state.escalaId);
      // Em vez de recarregar a pÃ¡gina, manter estado e apenas sinalizar sucesso
      try {
        const aviso = document.getElementById('avisoSalvoEscala') || (()=>{
          const div=document.createElement('div');
          div.id='avisoSalvoEscala';
          div.className='alert alert-success py-2 px-3 mt-2';
          div.style.fontSize='.85rem';
          div.innerHTML='<strong>Escala criada!</strong> Continue cadastrando turnos, equipes e alocaÃ§Ã£o.';
          const container = document.querySelector('#sec-dados-gerais') || document.body;
          container.appendChild(div);
          return div;
        })();
        setTimeout(()=>{ aviso?.classList.add('fade'); }, 6000);
      } catch(_avisoErr){}
      // MantÃ©m usuÃ¡rio na aba Dados Gerais (sem auto switch para Turnos)
    } catch(e){
      console.error('[escala] erro ao salvar dados gerais', e);
      restoreBtn();
      alert('NÃ£o foi possÃ­vel criar a escala. Verifique os campos e tente novamente. Detalhe: '+(e.message||e));
    } finally {
      if(!state.created){
        state._savingGeneral = false;
        restoreBtn();
      } else {
        // Escala criada: manter flag travada para impedir recriaÃ§Ã£o acidental
        state._savingGeneral = true;
      }
    }
  }
  // FunÃ§Ã£o para salvar alteraÃ§Ãµes na ediÃ§Ã£o
  async function salvarAlteracoesEscala(){
    console.log('[debug] salvarAlteracoesEscala start');
    try {
      const payload = { responsavelId: state.responsavel?.id || null };
      console.log('[debug] payload:', payload);
      const res = await fetch(basePath() + '/api/escalas/' + state.escalaId, { 
        method:'PUT', 
        headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify(payload), 
        credentials:'same-origin' 
      });
      console.log('[debug] fetch status:', res.status);
      if(res.ok){
        alert('AlteraÃ§Ãµes salvas com sucesso.');
      } else {
        alert('Erro ao salvar: ' + res.status);
      }
    } catch(e){
      console.error('[debug] erro:', e);
      alert('Erro: ' + e.message);
    }
  }
  // ===== ReintroduÃ§Ã£o: controle de habilitaÃ§Ã£o de abas (perdeu-se em refactors) =====
  function setAbasHabilitadas(cfg){
    // cfg: {gerais:true, turnos:false, equipes:false, aloc:false, rec:false, valid:false}
    const map={ 'aba-gerais':'gerais','aba-turnos':'turnos','aba-equipes':'equipes','aba-alocacao':'aloc','aba-recursos':'rec','aba-validacao':'valid' };
    Object.keys(map).forEach(id=>{
      const pane=document.getElementById(id); // presenÃ§a opcional
      const navBtn=document.querySelector(`[data-bs-target="#${id}"]`);
      const chave=map[id]; const enable=!!cfg[chave];
      if(navBtn){
        if(enable){ navBtn.classList.remove('disabled'); navBtn.setAttribute('aria-disabled','false'); navBtn.removeAttribute('tabindex'); try{ navBtn.style.pointerEvents=''; }catch(_){} }
        else { navBtn.classList.add('disabled'); navBtn.setAttribute('aria-disabled','true'); navBtn.setAttribute('tabindex','-1'); try{ navBtn.style.pointerEvents='none'; }catch(_){} }
      }
      if(pane){ pane.classList.toggle('tab-disabled', !enable); }
    });
  }
  function avaliarProgressaoAbas(){
    // Antes de criar, libera Turnos/Equipes se Dados Gerais estiverem completos
    const descOk = !!(document.getElementById('descricaoEscala')?.value?.trim());
    const uniOk  = !!(document.getElementById('unidadeEscala')?.value);
    const diV    = document.getElementById('dataInicio')?.value?.trim() || '';
    const dfV    = document.getElementById('dataFim')?.value?.trim() || '';
    const perOk  = !!(dateBrToISO(diV) && dateBrToISO(dfV));
    if(!state.created){
      const podeEditarEstrutura = !!(descOk && uniOk && perOk);
      setAbasHabilitadas({ gerais:true, turnos:podeEditarEstrutura, equipes:podeEditarEstrutura, aloc:false, rec:false, valid:false });
      return;
    }
    const temEquipe = Array.isArray(state.equipes) && state.equipes.length>0;
    const alocEnabled = !!temEquipe;
    const hasAlloc = (state.matrizAlocacao && typeof state.matrizAlocacao==='object' && Object.keys(state.matrizAlocacao).length>0)
      || (function(){ try { const cont=document.getElementById('matrizAlocacao'); if(!cont) return false; if(cont.querySelector('.matriz-eq-item')) return true; const td=cont.querySelector('table tbody td'); return !!(td && td.textContent && td.textContent.trim()); } catch(_e){ return false; } })();
    const hasRecursos = Array.isArray(state.recursos) && state.recursos.length>0;
    const modoConsultaUsado = (sessionStorage.getItem('esc_modo_consulta_usado') === '1');
    const recValidEnabled = !!(modoConsultaUsado || hasAlloc || hasRecursos);
    setAbasHabilitadas({ gerais:true, turnos:true, equipes:true, aloc: alocEnabled, rec: recValidEnabled, valid: recValidEnabled });
  }
  // Bloqueia/desbloqueia campos gerais apÃ³s criaÃ§Ã£o da escala
  // (duplicado removido)
      try {
        const tabelaEq = document.getElementById('tabelaEquipes');
        if(tabelaEq){
          const ths = tabelaEq.querySelectorAll('thead th');
          ths.forEach(th=>{
            if(th.classList.contains('eq-col-nome')){ th.style.width='60px'; }
            else if(th.classList.contains('eq-col-comp')){ th.style.width='240px'; }
            else if(th.classList.contains('eq-col-acoes')){ th.style.width='1%'; th.style.whiteSpace='nowrap'; }
          });
        }
      } catch(_e){ /* ignore */ }
      // BotÃ£o salvar nova equipe
      const btnAddEquipe = document.getElementById('btnAddEquipe');
      if(btnAddEquipe){
        btnAddEquipe.addEventListener('click', (ev)=>{ ev.preventDefault(); salvarNovaEquipe(); });
      } else {
        console.warn('[escala][equipes] botÃ£o btnAddEquipe nÃ£o encontrado');
      }
    // Ajustes iniciais de UI
    try {
      // Tooltips (inicializaÃ§Ã£o manual para elementos existentes)
      const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
      });
      // Flatpickr (calendÃ¡rio)
      if(els.dataInicio){
        flatpickr(els.dataInicio, { locale: 'pt', dateFormat: 'd/m/Y', onChange: (selectedDates, dateStr, instance) => { try { instance.input.dispatchEvent(new Event('change')); } catch(_e){} } });
      }
      if(els.dataFim){
        flatpickr(els.dataFim, { locale: 'pt', dateFormat: 'd/m/Y', onChange: (selectedDates, dateStr, instance) => { try { instance.input.dispatchEvent(new Event('change')); } catch(_e){} } });
      }
      console.debug('[escala][init] UI bÃ¡sica pronta');
    } catch(e){ console.warn('Erro ao inicializar UI', e); }
    // Carregar estado inicial (se ID na URL)
      const id = getEscalaId();
      console.log('[escala][init] getEscalaId() retornou:', id);
  state.tipo = (typeof detectTipoEarly==='function'? detectTipoEarly : (typeof window!=='undefined' && typeof window.detectTipoEarly==='function'? window.detectTipoEarly : ()=>null))();
      if(els.classificacao && state.tipo){ els.classificacao.value = state.tipo; }
      if(id){
        state.escalaId = id;
        carregarEscalaExistente(id).then(()=>{ try { renderMatrizesPorGrupo(); } catch(_e){} });
      } else {
        // Nova escala: determinar tipo por URL (se disponÃ­vel)
        const path = location.pathname.toLowerCase();
        if(path.includes('/ordinaria/')) state.tipo = 'ORDINÃRIA';
        else if(path.includes('/extraordinaria/')) state.tipo = 'EXTRAORDINÃRIA';
        if(els.classificacao && state.tipo){ els.classificacao.value = state.tipo; }
        // Habilitar apenas aba geral inicialmente
        setAbasHabilitadas({ gerais:true });
      }
      // ForÃ§ar uma tentativa tardia de renderizaÃ§Ã£o caso carregamento assÃ­ncrono tenha atrasado grupos/perÃ­odo
      setTimeout(()=>{ try { renderMatrizesPorGrupo(); } catch(_e){} }, 800);
      // Se a aba AlocaÃ§Ã£o jÃ¡ estiver ativa ao iniciar, renderiza imediatamente
      try {
        const paneAloc = document.getElementById('aba-alocacao');
        if(paneAloc && (paneAloc.classList.contains('show') || paneAloc.classList.contains('active'))){ renderMatrizesPorGrupo(); }
      } catch(_chk){}
      // Polling curto pÃ³s-init para garantir uma render (caso DOM/estilos atrasem)
      (function(){ let tent=0; const max=5; const iv=setInterval(()=>{ try { renderMatrizesPorGrupo(); } catch(_){} tent++; if(tent>=max) clearInterval(iv); }, 200); })();
      // ForÃ§ado tardio para garantir
      setTimeout(() => { try { renderMatrizesPorGrupo(); } catch(_){} }, 2000);
      // Listener de troca de abas (Bootstrap) para garantir render quando usuÃ¡rio entrar em AlocaÃ§Ã£o
      try {
        document.addEventListener('shown.bs.tab', (ev)=>{
          const el = ev && ev.target;
          const target = (el && (el.getAttribute && (el.getAttribute('data-bs-target') || el.getAttribute('href')))) || (el && el.dataset && (el.dataset.bsTarget || el.dataset.target)) || '';
          console.log('[tab] shown.bs.tab', target);
          if(target==="#aba-alocacao" || target==="#alocacao" ){ renderMatrizesPorGrupo(); }
        });
        // Fallback: clique simples em links/botÃµes que apontem para '#aba-alocacao'
        document.querySelectorAll('a[href="#aba-alocacao"], a[data-bs-target="#aba-alocacao"], button[data-bs-target="#aba-alocacao"]').forEach(el=>{
          el.addEventListener('click', ()=> setTimeout(()=>{ try{ renderMatrizesPorGrupo(); }catch(_e){} }, 60));
        });
        // Observa o painel da aba e re-renderiza quando ficar ativo (classe 'show'/'active')
        const paneAloc = document.getElementById('aba-alocacao');
        if(paneAloc && !paneAloc.__alocObs){
          const obs = new MutationObserver(()=>{
            console.log('[tab] mutation check');
            if(paneAloc.classList.contains('show') || paneAloc.classList.contains('active')){
              console.log('[tab] mutation active for alocacao');
              try { renderMatrizesPorGrupo(); } catch(_e){}
            }
          });
          obs.observe(paneAloc, { attributes:true, attributeFilter:['class'] });
          paneAloc.__alocObs = obs;
        }
      } catch(_et){ console.warn('[matriz][init] falha instalar listener de abas', _et); }
      // Carregar unidades (nova implementaÃ§Ã£o se ainda nÃ£o populado)
      if(els.unidade && !els.unidade.options.length){
        (async ()=>{
          try {
            els.unidade.innerHTML = '<option value="" disabled>Carregando...</option>';
            const res = await fetch(basePath()+"/api/unidades-relacionadas", { credentials:'same-origin' });
              if(res.ok){
                const js = await res.json();
                const lista = Array.isArray(js.data)? js.data: [];
                if(lista.length){
                  els.unidade.innerHTML = '<option value="" disabled selected>Selecione...</option>' + lista.map(u=>`<option value="${u.id}">${u.codigo? u.codigo+' - ' : ''}${u.nome}${u.is_principal?' (Matriz)':''}</option>`).join('');
                  console.debug('[escala][init] unidades carregadas', lista.length);
                  // Fallback hard: selecionar visualmente a unidade conhecida mesmo com o select desabilitado
                  try {
                    const uid = (state && state.dadosGerais && state.dadosGerais.unidadeId) ? String(state.dadosGerais.unidadeId) : '';
                    if(uid){
                      let opt = Array.from(els.unidade.options||[]).find(o=> String(o.value)===uid);
                      if(!opt){
                        const ach = Array.isArray(lista)? lista.find(x=> String(x.id)===uid) : null;
                        opt = document.createElement('option');
                        opt.value = uid;
                        opt.textContent = (state._unidadeNomeCarregada || (ach && ((ach.codigo? ach.codigo+' - ' : '')+ach.nome)) || 'Unidade') + ' *';
                        opt.dataset.injetado = '1';
                        els.unidade.appendChild(opt);
                      }
                      // remover placeholder selecionado
                      try { const ph = els.unidade.querySelector('option[disabled][selected]'); if(ph){ ph.selected=false; ph.removeAttribute('selected'); } } catch(_ph){}
                      const wasDisabled = els.unidade.hasAttribute('disabled');
                      if(wasDisabled) els.unidade.removeAttribute('disabled');
                      // selecionar explicitamente a option
                      Array.from(els.unidade.options).forEach(o=> o.selected = (String(o.value)===uid));
                      const idx = Array.from(els.unidade.options).findIndex(o=> String(o.value)===uid);
                      if(idx>=0) els.unidade.selectedIndex = idx;
                      try { els.unidade.value = uid; } catch(_v){}
                      els.unidade.classList && els.unidade.classList.add('value-applied');
                      if(wasDisabled) els.unidade.setAttribute('disabled','disabled');
                      console.debug('[escala][init] unidade aplicada via fallback-hard', uid);
                    }
                  } catch(_hard){ console.warn('[escala][init] fallback-hard unidade falhou', _hard); }
                  // Aplicar unidade imediatamente se já conhecida e amarrar o guardião de coerência
                  try { (typeof ensureUnidadeFinal==='function' ? ensureUnidadeFinal : (window && window.ensureUnidadeFinal))?.('init-loader'); } catch(_e){}
                  try { (typeof iniciarEnforcerUnidade==='function' ? iniciarEnforcerUnidade : (window && window.iniciarEnforcerUnidade))?.(2500); } catch(_e){}
                  try { (typeof bindUnidadeValueGuard==='function' ? bindUnidadeValueGuard : (window && window.bindUnidadeValueGuard))?.(); } catch(_e2){}
                } else {
                  els.unidade.innerHTML = '<option value="" disabled selected>(nenhuma unidade)</option>';
                }
              } else {
                els.unidade.innerHTML = '<option value="" disabled selected>(erro ao carregar)</option>';
              }
          } catch(errUn){ console.warn('[escala] falha carregar unidades inicial', errUn); }
        })();
      }
      // Bind modal responsÃ¡vel (placeholder busca efetivo reutilizado)
      if(els.btnResp && !els.btnResp.__wdgBound){
        els.btnResp.__wdgBound = true;
        els.btnResp.addEventListener('click', ()=>{
          if(window.WDG && typeof WDG.abrirModalPesquisarEfetivo==='function'){
            WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect:(f)=>{
              if(!f || typeof f!=='object') return;
              els.respNome.value = f.nome || f.codigo || f.id || '';
              state.responsavel = { id: f.id, nome: f.nome || f.codigo || f.id };
              console.debug('[escala][responsavel] selecionado', state.responsavel);
              // Ativar o botÃ£o salvar ao alterar o responsÃ¡vel
              const btn = document.getElementById('btnSalvarSecDados');
              if(btn){
                btn.disabled = false;
              }
            }});
          } else {
            alert('Funcionalidade de pesquisa nÃ£o disponÃ­vel.');
          }
        });
      }
      console.debug('[escala][init] inicializaÃ§Ã£o concluÃ­da', { tipo: state.tipo, escalaId: state.escalaId });
    // Listener delegado fallback para botÃ£o salvar (caso binding primÃ¡rio falhe)
    document.addEventListener('click', async (ev)=>{
      const t=ev.target;
      if(t && t.id==='btnSalvarSecDados'){
          // SÃ³ aciona via fallback se o binding principal nÃ£o foi aplicado
          if(!t.__boundSave){
            console.debug('[escala][save][delegated] clique capturado fallback');
            if(!state.created) await salvarDadosGerais(); else await salvarAlteracoesEscala();
          }
      }
      const btnTurnos = t?.closest && t.closest('#btnNovoGrupoTurnos');
      if(btnTurnos){
        console.debug('[escala][turnos] clique delegado inserir grupo');
        abrirPopupTurnos();
      }
      // DelegaÃ§Ã£o dedicada para equipes (garantia caso listener interno nÃ£o tenha sido ligado ainda)
      const actBtn = t?.closest && t.closest('table#tabelaEquipes button[data-act], table#tabelaEquipes button[data-action]');
      if(actBtn){
        const act = actBtn.getAttribute('data-act') || actBtn.getAttribute('data-action');
        if(['comp-eq','edit-eq','del-eq','editar-equipe','editar-nome','efetivo'].includes(act)){
          const tr = actBtn.closest('tr[data-id]'); const id = tr && tr.getAttribute('data-id');
          let eq = null;
          try { eq = id && state && Array.isArray(state.equipes) ? state.equipes.find(e=> e.id===id) : null; } catch(_e){}
          if(!eq){
            try { const arr = (window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.equipes)) ? window.__ESCALA_STATE__.equipes : []; eq = arr.find(e=> String(e.id)===String(id)); } catch(_g){}
          }
          if(!eq && tr){
            // Fallback mínimo: construir a partir do DOM (nome/descrição) para permitir abrir o modal
            try {
              const tds = tr.querySelectorAll('td');
              eq = { id: id, nome: (tds[0] && tds[0].textContent || 'EQ').trim(), descricao: (tds[1] && tds[1].textContent || '').trim(), componentes: [] };
            } catch(_dom){}
          }
          if(!eq) return;
          if(act==='edit-eq' || act==='editar-nome'){
            const modalEdit = (typeof ensureModalNomeEquipe==='function') ? ensureModalNomeEquipe() : (function(){
              let m = document.getElementById('modalEditarEquipe') || document.getElementById('modalEditarNomeEquipe');
              if(!m){
                m = document.createElement('div');
                m.id='modalEditarEquipe'; m.className='modal fade';
                m.innerHTML = '<div class="modal-dialog"><div class="modal-content">'
                  +'<div class="modal-header py-2"><h5 class="modal-title mb-0" style="font-size:1rem;">Editar Equipe</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>'
                  +'<div class="modal-body pb-2"><form class="row g-3"><div class="col-6 col-sm-4 col-md-3"><label class="form-label fw-semibold" for="editNomeEquipe">Nome:</label><input type="text" id="editNomeEquipe" maxlength="3" class="form-control uppercase"></div><div class="col-12"><label class="form-label fw-semibold" for="editDescricaoEquipe">Descrição:</label><input type="text" id="editDescricaoEquipe" maxlength="30" class="form-control"></div></form></div>'
                  +'<div class="modal-footer py-2"><button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" type="button">Cancelar</button><button class="btn btn-primary btn-sm" id="btnSalvarEdicaoEquipe" type="button">Salvar</button></div>'
                +'</div></div>';
                document.body.appendChild(m);
              }
              const btn = m.querySelector('#btnSalvarEdicaoEquipe'); if(btn && !btn.__bound){ btn.__bound=true; btn.addEventListener('click', function(){
                try{
                  const nomeEl = m.querySelector('#editNomeEquipe');
                  const descEl = m.querySelector('#editDescricaoEquipe');
                  const id = this.dataset.id;
                  if(!id) return;
                  const nome = (nomeEl && nomeEl.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
                  const descricao = (descEl && descEl.value || '').trim();
                  if(!nome){ alert('Informe o nome da equipe.'); return; }
                  let eq = (state && Array.isArray(state.equipes)) ? state.equipes.find(e=> e.id===id) : null;
                  if(!eq){ try { const arr=(window.__ESCALA_STATE__?.equipes)||[]; eq = arr.find(e=> String(e.id)===String(id)); } catch(_s){} }
                  if(eq){ eq.nome = nome; eq.descricao = descricao; }
                  try { if(window.renderEquipes) window.renderEquipes(); } catch(_r){}
                  try { if(window.renderMatrizesPorGrupo) window.renderMatrizesPorGrupo(); } catch(_m){}
                  try { if(window.avaliarProgressaoAbas) window.avaliarProgressaoAbas(); } catch(_a){}
                  try { const inst = bootstrap.Modal.getOrCreateInstance(m); inst && inst.hide(); } catch(_b){}
                } catch(_err){}
              }); }
              return m;
            })();
            const nomeEl = modalEdit.querySelector('#editNomeEquipe');
            const descEl = modalEdit.querySelector('#editDescricaoEquipe');
            if(nomeEl) nomeEl.value=eq.nome||''; if(descEl) descEl.value=eq.descricao||'';
            const btnSalvarEd= modalEdit.querySelector('#btnSalvarEdicaoEquipe'); if(btnSalvarEd) btnSalvarEd.dataset.id=eq.id;
            bootstrap.Modal.getOrCreateInstance(modalEdit).show();
          } else if(act==='comp-eq' || act==='editar-equipe' || act==='efetivo'){
            if(typeof openEquipeEfetivoModal==='function') openEquipeEfetivoModal(eq);
            else if(typeof window.openEquipeEfetivoModal==='function') window.openEquipeEfetivoModal(eq);
            else if(typeof window.__openEfetivoFallback==='function') window.__openEfetivoFallback(eq);
            else console.warn('[equipes][efetivo] função de abertura indisponível');
          } else if(act==='del-eq'){
            if(actBtn.dataset.busy==='1') return; actBtn.dataset.busy='1';
            const nomeShow = (eq.nome||'').trim()||eq.id; const okConf = confirm(`Excluir a equipe ${nomeShow}?`);
            if(!okConf){ actBtn.dataset.busy='0'; return; }
            excluirEquipePersistente(eq.id).finally(()=>{ actBtn.dataset.busy='0'; });
          }
        }
      }
    });
    // ForÃ§a seleÃ§Ã£o da unidade caso ainda nÃ£o tenha funcionado em 1s
  // (removida chamada forcarSelecaoUnidade)
  // bindAbrirPopupTurnosOnce agora tambÃ©m pode ser chamado aqui caso queira garantir; jÃ¡ foi chamado acima condicionalmente
  bindAbrirPopupTurnosOnce();
  console.debug('[escala][turnos] binding turnos pronto');
  console.debug('[escala][debug] initEscalaPage fim');
  // Bootstrap de inicializaÃ§Ã£o (Ãºnico)
  try {
    // typeof em identificador nÃ£o declarado Ã© seguro (nÃ£o lanÃ§a ReferenceError)
    if(typeof initEscalaPage === 'function' && typeof window.initEscalaPage !== 'function'){
      window.initEscalaPage = initEscalaPage;
    }
  } catch(_e){ console.error('[escala][expose] falha ao expor initEscalaPage', _e); }
  function __boot(){
    try {
      if(window.__ESCALA_BOOT_OK) return;
      const fn = (typeof initEscalaPage === 'function') ? initEscalaPage : (typeof window.initEscalaPage === 'function' ? window.initEscalaPage : null);
      if(typeof fn === 'function' && !__isInitStub(fn)){ fn(); window.__ESCALA_BOOT_OK = true; return; }
      // Reagenda discretamente atÃ© que a funÃ§Ã£o esteja disponÃ­vel
      setTimeout(__boot, 40);
    } catch(e){ console.error('[escala][boot] falha init', e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', __boot); else setTimeout(__boot, 0);
  // Salvaguarda tardia: se apÃ³s 2s initEscalaPage nÃ£o estiver exposta, tentar reapontar
  setTimeout(()=>{
    try {
      if(typeof window.initEscalaPage!=='function' && typeof initEscalaPage==='function'){
        window.initEscalaPage = initEscalaPage; console.warn('[escala][guard] reapontado initEscalaPage tardio');
      }
      // Se exposta tardiamente, inicializa
      if(!window.__ESCALA_BOOT_OK && typeof window.initEscalaPage==='function'){
        console.warn('[escala][guard] chamando initEscalaPage tardio');
        window.initEscalaPage(); window.__ESCALA_BOOT_OK = true;
      }
    } catch(_g){}
  },2000);
  // Pequenas tentativas rÃ¡pidas nos primeiros 200ms
  (function retryBootQuick(){
    let tent=0;
    const max=5;
    const iv=setInterval(()=>{
      try {
        if(window.__ESCALA_BOOT_OK){ clearInterval(iv); return; }
        const fn = (typeof initEscalaPage === 'function') ? initEscalaPage : (typeof window.initEscalaPage === 'function' ? window.initEscalaPage : null);
        if(typeof fn === 'function' && !__isInitStub(fn)){
          fn(); window.__ESCALA_BOOT_OK = true; clearInterval(iv);
        }
      } catch(_e){}
      tent++;
      if(tent>=max) clearInterval(iv);
    }, 40);
  })();
  // Guarda extra atÃ© 5s tentando inicializar caso algo ainda impeÃ§a a chamada
  (function retryBootWindowLate(){
    let tent=0; const max=10;
    const iv=setInterval(()=>{
      try {
        if(window.__ESCALA_BOOT_OK){ clearInterval(iv); return; }
        // Preferir referÃªncia local para inicializaÃ§Ã£o
        if(typeof initEscalaPage==='function'){ initEscalaPage(); window.__ESCALA_BOOT_OK = true; clearInterval(iv); return; }
        // Fallback Ãºltimo caso esteja exposta em window
        if(typeof window.initEscalaPage==='function' && !__isInitStub(window.initEscalaPage)){
          window.initEscalaPage(); window.__ESCALA_BOOT_OK = true; clearInterval(iv); return;
        }
        // Reduzir ruÃ­do: nÃ£o logar a cada meio segundo
      } catch(_e){}
      tent++;
      if(tent>=max) clearInterval(iv);
    }, 500);
  })();

  /* === FALLBACK INDEPENDENTE: garante funcionamento dos botÃµes mesmo se o core nÃ£o completar === */
  (function ensureFallbackTurnosAndEquipes(){
    // Expor um fallback bÃ¡sico de abertura do modal de turnos caso a funÃ§Ã£o principal nÃ£o esteja disponÃ­vel
    function abrirPopupTurnosBasico(grupo){
      try {
        // Reset da flag de salvamento ao abrir o modal (fallback)
        try { window.__TURNOS_SALVOU = false; } catch(_){}
        const el = ensureModalTurnosMin();
        // NÃ£o alterar tab ativa no fallback; manter apenas a ediÃ§Ã£o e o refresh visual
        function refreshTurnosUI(){
          try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_r1){}
          try { if(typeof window.forceRepaintTurnosList==='function') window.forceRepaintTurnosList(); } catch(_r2){}
          try { if(typeof window.renderMatrizesPorGrupo==='function') window.renderMatrizesPorGrupo(); } catch(_r3){}
          try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_r4){}
          try { document.dispatchEvent(new CustomEvent('escala:turnos:atualizados', { detail: { grupos: (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.gruposTurnos) || (typeof state!=='undefined'? state.gruposTurnos:[]) } })); } catch(_r5){}
        }
        // Preencher com turnos existentes se fornecido um grupo
        try {
          const tbody = el.querySelector('#tabelaTurnosGrupo2 tbody');
          if(tbody){
            const lista = Array.isArray(grupo?.turnos) ? grupo.turnos.map(t=>({ ini: t.ini||t.inicio||t.start||t.hora_inicio||t.horaInicio||t.hi, fim: t.fim||t.termino||t.end||t.hora_fim||t.horaFim||t.hf })).filter(t=> t.ini && t.fim) : [];
            if(!lista.length){ tbody.innerHTML = '<tr class="text-muted"><td colspan="3" class="text-center small">Nenhum turno ainda</td></tr>'; }
            else { tbody.innerHTML = lista.map((t,i)=>`<tr data-idx="${i}"><td class="text-center">${t.ini}</td><td class="text-center">${t.fim}</td><td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="del" data-idx="${i}">&times;</button></td></tr>`).join(''); }
            // Bind simples de remoÃ§Ã£o linha-a-linha (somente visual)
            tbody.onclick = (ev)=>{ const b=ev.target.closest && ev.target.closest('button[data-act="del"]'); if(!b) return; const tr=b.closest('tr'); if(tr) tr.remove(); if(!tbody.querySelector('tr')) tbody.innerHTML = '<tr class="text-muted"><td colspan="3" class="text-center small">Nenhum turno ainda</td></tr>'; };
          }
          const iniEl = el.querySelector('#horaInicioTurno2');
          const fimEl = el.querySelector('#horaFimTurno2');
          const btnAdd = el.querySelector('#btnAddTurno2');
          if(btnAdd){ btnAdd.onclick = ()=>{ const ini=(iniEl?.value||'').trim(); const fim=(fimEl?.value||'').trim(); if(!ini||!fim){ alert('Informe inÃ­cio e tÃ©rmino'); return; } const tb=el.querySelector('#tabelaTurnosGrupo2 tbody'); if(tb){ if(tb.querySelector('.text-muted')) tb.innerHTML=''; const idx = tb.querySelectorAll('tr').length; tb.insertAdjacentHTML('beforeend', `<tr data-idx="${idx}"><td class="text-center">${ini}</td><td class="text-center">${fim}</td><td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="del" data-idx="${idx}">&times;</button></td></tr>`); } if(iniEl) iniEl.value=''; if(fimEl) fimEl.value=''; } };
          // Helpers de coleta/validaÃ§Ã£o e persistÃªncia
          function coletarTurnos(){
            const tb=el.querySelector('#tabelaTurnosGrupo2 tbody');
            const rows = Array.from(tb?.querySelectorAll('tr')||[]);
            const out = [];
            rows.forEach(r=>{
              const tds = r.querySelectorAll('td');
              if(tds && tds.length>=2){
                const ini=(tds[0].textContent||'').trim();
                const fim=(tds[1].textContent||'').trim();
                if(/^[0-2]\d:[0-5]\d$/.test(ini) && /^[0-2]\d:[0-5]\d$/.test(fim) && ini!==fim){ out.push({ ini, fim }); }
              }
            });
            // remove duplicados e ordena
            const seen=new Set();
            const norm = out.filter(t=>{ const k=t.ini+'_'+t.fim; if(seen.has(k)) return false; seen.add(k); return true; }).sort((a,b)=> a.ini.localeCompare(b.ini));
            return norm;
          }
          function validarLista(turnos){
            if(!turnos.length) return 'Adicione pelo menos um turno.';
            // checa sobreposiÃ§Ã£o simples
            for(let i=0;i<turnos.length;i++){
              for(let j=i+1;j<turnos.length;j++){
                const a=turnos[i], b=turnos[j];
                if((a.ini>=b.ini && a.ini<b.fim) || (a.fim>b.ini && a.fim<=b.fim) || (a.ini<=b.ini && a.fim>=b.fim)){
                  return `Conflito entre ${a.ini}-${a.fim} e ${b.ini}-${b.fim}`;
                }
              }
            }
            return null;
          }
          function safeBasePath(){ try { return (typeof basePath==='function')? basePath(): (window._bpDash || '/escalas'); } catch(_){ return '/escalas'; } }
          function pegarEscalaId(){
            try {
              if(typeof state!=='undefined' && state.escalaId) return state.escalaId;
            } catch(_){}
            try { if(window.__ESCALA_STATE__?.escalaId) return window.__ESCALA_STATE__.escalaId; } catch(_){}
            try { const u = new URL(window.location.href); const q=u.searchParams.get('id'); if(q) return q; } catch(_){}
            try { const hid = document.querySelector('#escalaId,[name="escalaId"],[name="idEscala"]'); return hid && (hid.value||hid.getAttribute('value')); } catch(_){}
            return null;
          }
          async function persistirTurnosBasico(turnos){
            const escalaId = pegarEscalaId();
            if(!escalaId){ alert('Salve os dados gerais primeiro para criar a escala antes de inserir turnos.'); return false; }
            // garante id do grupo
            let gid = (grupo && (grupo.id||grupo._id||grupo.id_grupo)) || null;
            if(!gid) gid = 'g'+Math.random().toString(36).slice(2,10);
            const bp = safeBasePath();
            // tenta endpoints dedicados
            let persisted=false;
            try {
              const url = bp+`/api/escalas/${encodeURIComponent(escalaId)}/grupos-turnos` + (grupo? `/${encodeURIComponent(gid)}` : '');
              const method = grupo? 'PUT':'POST';
              const body = JSON.stringify({ grupo: { id: gid, turnos: turnos.map(t=>({ ini:t.ini, fim:t.fim, overnight:false })) } });
              const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, credentials:'same-origin', body });
              if(r.ok){
                let js=null; try { js=await r.json(); } catch(_){ js=null; }
                if(js?.grupo?.id) gid = js.grupo.id;
                persisted=true;
              }
            } catch(_ded){}
            // fallback PUT completo
            if(!persisted){
              try {
                const st = (typeof state!=='undefined' && state) ? state : (window.__ESCALA_STATE__||{});
                const atual = Array.isArray(st.gruposTurnos)? st.gruposTurnos.slice(): [];
                const map = new Map(atual.map(g=> [String(g.id||g._id||g.id_grupo), { id: (g.id||g._id||g.id_grupo), turnos: (g.turnos||[]).map(tt=>({ ini: tt.ini||tt.inicio||tt.start||tt.hora_inicio, fim: tt.fim||tt.termino||tt.end||tt.hora_fim, overnight:(typeof tt.overnight==='boolean'? tt.overnight:false) })) }]));
                map.set(String(gid), { id: gid, turnos: turnos.map(t=>({ ini:t.ini, fim:t.fim, overnight:false })) });
                const gruposForPut = Array.from(map.values());
                let put = await fetch(bp+`/api/escalas/${encodeURIComponent(escalaId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ grupos_turnos: gruposForPut }) });
                if(put.ok){ persisted=true; }
                else {
                  const body2 = { gruposTurnos: gruposForPut };
                  put = await fetch(bp+`/api/escalas/${encodeURIComponent(escalaId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body2) });
                  if(put.ok) persisted=true;
                }
              } catch(_put){ persisted=false; }
            }
            if(persisted){
              let savedId = null;
              try {
                // atualiza estado local
                const st = (typeof state!=='undefined' && state) ? state : (window.__ESCALA_STATE__||{});
                if(!Array.isArray(st.gruposTurnos)) st.gruposTurnos = [];
                const idx = st.gruposTurnos.findIndex(g=> String(g.id||g._id||g.id_grupo) === String(gid));
                const novo = { id: gid, turnos: turnos };
                if(idx>=0) st.gruposTurnos[idx]=novo; else st.gruposTurnos.push(novo);
                try { window.__ESCALA_STATE__ = st; } catch(_){}
                savedId = gid;
                try { window.__LAST_SAVED_GRUPO_ID__ = gid; window.__LAST_SAVED_TURNOS__ = turnos.slice(); } catch(_){ }
                // re-render UI
                try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){}
                try { if(typeof window.forceRepaintTurnosList==='function') window.forceRepaintTurnosList(savedId); } catch(_){}
                try { if(typeof window.renderMatrizesPorGrupo==='function') window.renderMatrizesPorGrupo(); } catch(_){}
                try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_){}
              } catch(_st){}
            }
            return persisted;
          }
          // Confirmar: coleta, valida, persiste e fecha
          const btnC = el.querySelector('#btnSalvar');
          if(btnC){
            btnC.onclick = async ()=>{
              const turnos = coletarTurnos();
              const err = validarLista(turnos);
              if(err){ alert(err); return; }
              btnC.disabled=true; const old=btnC.innerHTML; btnC.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span> Salvando...';
              const ok = await persistirTurnosBasico(turnos);
              btnC.disabled=false; btnC.innerHTML=old;
              if(!ok){ alert('NÃ£o foi possÃ­vel salvar o grupo de turnos.'); return; }
              // Marca que houve salvamento bem-sucedido
              try { window.__TURNOS_SALVOU = true; console.debug('[escala][turnos][fallback] salvou com sucesso; flag marcada'); } catch(_flag){}
              // Marcar ediÃ§Ã£o recente para proteger estado contra fallback-lite
              try { window.__ESCALA_EDITADO_RECENTEMENTE = Date.now(); } catch(_){}
              // Recarregar escala completa para consolidar estado (evita snapshot antigo do fallback-lite)
              try {
                const escalaId = pegarEscalaId();
                if(escalaId && typeof window.carregarEscalaExistente==='function'){
                  window.carregarEscalaExistente(escalaId).catch(()=>{});
                }
              } catch(_rec){}
              // Atualiza diretamente a linha na tabela para feedback imediato (usa id salvo global)
              try {
                const gidSaved = (window.__LAST_SAVED_GRUPO_ID__ || (grupo && (grupo.id||grupo._id||grupo.id_grupo)) || '');
                if(gidSaved) updateTurnosRowDOM(gidSaved, turnos);
              } catch(_upd2){}
              // fechar modal
              try { if(window.bootstrap?.Modal){ window.bootstrap.Modal.getOrCreateInstance(el).hide(); } else { el.classList.remove('show'); el.style.display='none'; el.setAttribute('aria-hidden','true'); const bd=document.querySelector('.modal-backdrop'); bd?.parentNode?.removeChild(bd); document.body.classList.remove('modal-open'); } } catch(_h){}
              // Disparar evento customizado e atualizar lista
              try { document.dispatchEvent(new CustomEvent('turnoAtualizado')); } catch(_e){}
              try { if(typeof window.refreshTurnosFromServer==='function') window.refreshTurnosFromServer({ silent:true, ensureChange:true }); } catch(_rfs){}
              setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){} }, 80);
              setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){} }, 200);
            };
          }
        } catch(_p){}
        try { if(window.bootstrap?.Modal){
          const m = window.bootstrap.Modal.getOrCreateInstance(el);
          // vincular evento de hidden para manter na aba Turnos e atualizar lista (sem once:true para repetir em aberturas futuras)
          try { el.addEventListener('hidden.bs.modal', ()=>{ 
            const salvou = !!window.__TURNOS_SALVOU;
            console.log('[escala][turnos] hidden.bs.modal fired (basico) - forcing refresh? ', salvou);
            if(salvou){
              try { document.dispatchEvent(new CustomEvent('turnoAtualizado')); } catch(_e){}
              // Re-render imediato e reforços temporizados para garantir UI atualizada
              try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_r0){}
              try { const gid = window.__LAST_SAVED_GRUPO_ID__; if(gid && window.__LAST_SAVED_TURNOS__) updateTurnosRowDOM(gid, window.__LAST_SAVED_TURNOS__); } catch(_u0){}
              try { if(typeof window.forceRepaintTurnosList==='function' && window.__LAST_SAVED_GRUPO_ID__) window.forceRepaintTurnosList(window.__LAST_SAVED_GRUPO_ID__); } catch(_fp){}
              // Injeção direta: sobrescrever o tbody com o estado atual como último recurso (evita quaisquer sobrescritas externas)
              try {
                const tbl = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
                const st = (typeof state!=='undefined' && state) ? state : (window.__ESCALA_STATE__||{});
                if(tbl && Array.isArray(st.gruposTurnos)){
                  const tbody = tbl.querySelector('tbody');
                  if(tbody){
                    const __fmt = (t)=>{ const ini=t?.ini||t?.inicio||t?.start||t?.hora_inicio||t?.horaInicio||t?.hi||''; const fim=t?.fim||t?.termino||t?.end||t?.hora_fim||t?.horaFim||t?.hf||''; return { ini, fim }; };
                    const html = st.gruposTurnos.map(g=>{
                      const tHtml = (Array.isArray(g.turnos) && g.turnos.length) ? g.turnos.map(t=>{ const f=__fmt(t); return `${f.ini} - ${f.fim}`; }).join(' | ') : '(sem turnos)';
                      return `<tr data-id="${g.id}"><td class="py-1 small text-center">${tHtml}</td><td class="text-center grupos-col-acoes"><button type="button" class="btn btn-sm btn-outline-primary" data-act="edit-grupo" title="Editar"><i class="bi bi-pencil"></i></button><button type="button" class="btn btn-sm btn-outline-danger" data-act="del-grupo" title="Excluir"><i class="bi bi-trash"></i></button></td></tr>`;
                    }).join('');
                    tbody.innerHTML = html || '<tr class="text-muted"><td colspan="2" class="text-center">Nenhum grupo cadastrado.</td></tr>';
                    // Estabilizador: se alguma rotina sobrescrever em até 1s, reimpor nosso HTML esperado
                    try {
                      const expected = tbody.innerHTML;
                      const startedAt = Date.now();
                      const mo = new MutationObserver(()=>{
                        if(Date.now() - startedAt > 1000){ mo.disconnect(); return; }
                        if(tbody.innerHTML !== expected){ tbody.innerHTML = expected; }
                      });
                      mo.observe(tbody, { childList:true, subtree:false });
                      setTimeout(()=> mo.disconnect(), 1200);
                    } catch(_mo){}
                  }
                }
              } catch(_inj){}
              try { window.refreshTurnosUI && window.refreshTurnosUI({ ensureChange:true }); } catch(_rfs){}
              // Garantir que a aba Turnos esteja visível
              try {
                const turnosBtn = document.querySelector('[data-bs-target="#aba-turnos"]');
                if(turnosBtn && !turnosBtn.classList.contains('disabled')){ bootstrap.Tab.getOrCreateInstance(turnosBtn).show(); }
              } catch(_tab){}
              // Reforços com pequenos atrasos (supera sobrescritas tardias)
              setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){ } }, 90);
              setTimeout(()=>{ try { if(window.__LAST_SAVED_GRUPO_ID__ && window.__LAST_SAVED_TURNOS__) updateTurnosRowDOM(window.__LAST_SAVED_GRUPO_ID__, window.__LAST_SAVED_TURNOS__); } catch(_){ } }, 180);
              setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){ } }, 500);
              // Verificação final: se a linha não contiver os turnos esperados, forçar reload uma única vez
              try {
                const expected = (function(){
                  const arr = (window.__LAST_SAVED_TURNOS__||[]).map(t=>{ const f={ ini:(t.ini||t.inicio||t.start||t.hora_inicio||t.horaInicio||t.hi||'').trim(), fim:(t.fim||t.termino||t.end||t.hora_fim||t.horaFim||t.hf||'').trim() }; return `${f.ini} - ${f.fim}`; });
                  return arr.join(' | ');
                })();
                setTimeout(()=>{
                  try {
                    if(!expected) return;
                    const tbl = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
                    const gid = window.__LAST_SAVED_GRUPO_ID__;
                    const tr = tbl && gid ? tbl.querySelector(`tbody tr[data-id="${gid}"]`) : null;
                    const ok = !!(tr && tr.innerText && tr.innerText.indexOf(expected) !== -1);
                    if(!ok && !window.__ESCALA_FORCED_RELOAD_ONCE__){ window.__ESCALA_FORCED_RELOAD_ONCE__ = true; location.reload(); }
                  } catch(_chk){}
                }, 900);
              } catch(_vf){}
              try { if(typeof window.refreshTurnosDebounced==='function') window.refreshTurnosDebounced(); } catch(_rf){}
              try { window.__TURNOS_SALVOU = false; } catch(_){}
            }
            // NÃ£o limpar o tbody; manter UI atual atÃ© o servidor responder para evitar lista vazia
          }); } catch(_l){}
          m.show();
        } else {
          el.classList.add('show'); el.style.display='block'; el.removeAttribute('aria-hidden'); el.setAttribute('aria-modal','true');
          let bd=document.querySelector('.modal-backdrop'); if(!bd){ bd=document.createElement('div'); bd.className='modal-backdrop fade show'; document.body.appendChild(bd); }
          document.body.classList.add('modal-open');
          el.querySelectorAll('[data-bs-dismiss="modal"]').forEach(x=> x.addEventListener('click', ()=>{ 
            el.classList.remove('show'); el.style.display='none'; el.setAttribute('aria-hidden','true'); el.removeAttribute('aria-modal');
            bd?.parentNode?.removeChild(bd); document.body.classList.remove('modal-open'); 
            const salvou = !!window.__TURNOS_SALVOU;
            if(salvou){
              try { document.dispatchEvent(new CustomEvent('turnoAtualizado')); } catch(_e){}
              // Re-render imediato e reforços temporizados para garantir UI atualizada
              try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_r0){}
              try { const gid = window.__LAST_SAVED_GRUPO_ID__; if(gid && window.__LAST_SAVED_TURNOS__) updateTurnosRowDOM(gid, window.__LAST_SAVED_TURNOS__); } catch(_u0){}
              try { if(typeof window.forceRepaintTurnosList==='function' && window.__LAST_SAVED_GRUPO_ID__) window.forceRepaintTurnosList(window.__LAST_SAVED_GRUPO_ID__); } catch(_fp){}
              // Injeção direta: sobrescrever o tbody com o estado atual como último recurso
              try {
                const tbl = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
                const st = (typeof state!=='undefined' && state) ? state : (window.__ESCALA_STATE__||{});
                if(tbl && Array.isArray(st.gruposTurnos)){
                  const tbody = tbl.querySelector('tbody');
                  if(tbody){
                    const __fmt = (t)=>{ const ini=t?.ini||t?.inicio||t?.start||t?.hora_inicio||t?.horaInicio||t?.hi||''; const fim=t?.fim||t?.termino||t?.end||t?.hora_fim||t?.horaFim||t?.hf||''; return { ini, fim }; };
                    const html = st.gruposTurnos.map(g=>{
                      const tHtml = (Array.isArray(g.turnos) && g.turnos.length) ? g.turnos.map(t=>{ const f=__fmt(t); return `${f.ini} - ${f.fim}`; }).join(' | ') : '(sem turnos)';
                      return `<tr data-id="${g.id}"><td class="py-1 small text-center">${tHtml}</td><td class="text-center grupos-col-acoes"><button type="button" class="btn btn-sm btn-outline-primary" data-act="edit-grupo" title="Editar"><i class="bi bi-pencil"></i></button><button type="button" class="btn btn-sm btn-outline-danger" data-act="del-grupo" title="Excluir"><i class="bi bi-trash"></i></button></td></tr>`;
                    }).join('');
                    tbody.innerHTML = html || '<tr class="text-muted"><td colspan="2" class="text-center">Nenhum grupo cadastrado.</td></tr>';
                    // Estabilizador: reimpor HTML esperado por 1s se algo sobrescrever
                    try {
                      const expected = tbody.innerHTML;
                      const startedAt = Date.now();
                      const mo = new MutationObserver(()=>{
                        if(Date.now() - startedAt > 1000){ mo.disconnect(); return; }
                        if(tbody.innerHTML !== expected){ tbody.innerHTML = expected; }
                      });
                      mo.observe(tbody, { childList:true, subtree:false });
                      setTimeout(()=> mo.disconnect(), 1200);
                    } catch(_mo){}
                  }
                }
              } catch(_inj){}
              try { window.refreshTurnosUI && window.refreshTurnosUI({ ensureChange:true }); } catch(_rfs){}
              // Garantir que a aba Turnos esteja visível
              try {
                const turnosBtn = document.querySelector('[data-bs-target="#aba-turnos"]');
                if(turnosBtn && !turnosBtn.classList.contains('disabled')){ bootstrap.Tab.getOrCreateInstance(turnosBtn).show(); }
              } catch(_tab){}
              // Reforços com pequenos atrasos (supera sobrescritas tardias)
              setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){ } }, 90);
              setTimeout(()=>{ try { if(window.__LAST_SAVED_GRUPO_ID__ && window.__LAST_SAVED_TURNOS__) updateTurnosRowDOM(window.__LAST_SAVED_GRUPO_ID__, window.__LAST_SAVED_TURNOS__); } catch(_){ } }, 180);
              setTimeout(()=>{ try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos(); } catch(_){ } }, 500);
              // Verificação final: se a linha não contiver os turnos esperados, forçar reload uma única vez
              try {
                const expected = (function(){
                  const arr = (window.__LAST_SAVED_TURNOS__||[]).map(t=>{ const f={ ini:(t.ini||t.inicio||t.start||t.hora_inicio||t.horaInicio||t.hi||'').trim(), fim:(t.fim||t.termino||t.end||t.hora_fim||t.horaFim||t.hf||'').trim() }; return `${f.ini} - ${f.fim}`; });
                  return arr.join(' | ');
                })();
                setTimeout(()=>{
                  try {
                    if(!expected) return;
                    const tbl = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
                    const gid = window.__LAST_SAVED_GRUPO_ID__;
                    const tr = tbl && gid ? tbl.querySelector(`tbody tr[data-id="${gid}"]`) : null;
                    const ok = !!(tr && tr.innerText && tr.innerText.indexOf(expected) !== -1);
                    if(!ok && !window.__ESCALA_FORCED_RELOAD_ONCE__){ window.__ESCALA_FORCED_RELOAD_ONCE__ = true; location.reload(); }
                  } catch(_chk){}
                }, 900);
              } catch(_vf){}
              try { if(typeof window.refreshTurnosDebounced==='function') window.refreshTurnosDebounced(); } catch(_rf){}
              try { window.__TURNOS_SALVOU = false; } catch(_){}
            }
          }, { once:true }));
        } } catch(_s){}
      } catch(_e){ console.warn('[escala][fallback] abrirPopupTurnosBasico falhou', _e); }
    }
    try { if(typeof window.abrirPopupTurnos!=='function'){ window.abrirPopupTurnos = abrirPopupTurnosBasico; } } catch(_ex){}
    function ensureModalTurnosMin(){
      let el = document.getElementById('modalSelecionarTurnos');
      if(!el){
        el=document.createElement('div');
        el.id='modalSelecionarTurnos';
        el.className='modal fade';
        el.innerHTML='<div class="modal-dialog modal-dialog-scrollable modal-turnos-reduzida">\n'
          +'<div class="modal-content">\n'
          +'<div class="modal-header justify-content-between"><h5 class="modal-title mb-0">Turnos</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>'
          +'<div class="modal-body p-0">\n'
          +'<div class="p-3 border-bottom"><form class="row g-2 align-items-end" id="formSelecionarTurnos"><div class="col-auto"><label class="form-label fw-semibold mb-1">InÃ­cio</label><input type="time" id="horaInicioTurno2" class="form-control form-control-sm"></div><div class="col-auto"><label class="form-label fw-semibold mb-1">TÃ©rmino</label><input type="time" id="horaFimTurno2" class="form-control form-control-sm"></div><div class="col-auto d-flex align-items-end"><button type="button" id="btnAddTurno2" class="btn btn-success btn-sm">Adicionar</button></div></form></div>'
          +'<div class="p-3"><div class="table-responsive border rounded"><table class="table table-sm align-middle mb-0" id="tabelaTurnosGrupo2"><thead class="table-light"><tr><th>InÃ­cio</th><th>Fim</th><th style="width:110px" class="text-center">AÃ§Ã£o</th></tr></thead><tbody><tr class="text-muted"><td colspan="3" class="text-center small">Nenhum turno ainda</td></tr></tbody></table></div></div>'
          +'</div>'
          +'<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button><button type="button" class="btn btn-primary" id="btnSalvar">Salvar</button></div>'
          +'</div></div>';
        document.body.appendChild(el);
      }
      return el;
    }
    function openTurnosFallback(){
      // Usa funÃ§Ãµes principais se disponÃ­veis
      if(typeof window.abrirPopupNovoGrupo==='function') return window.abrirPopupNovoGrupo();
      if(typeof window.abrirPopupTurnos==='function') return window.abrirPopupTurnos(null);
      // Fallback reduzido
      const el=ensureModalTurnosMin();
      try { bootstrap.Modal.getOrCreateInstance(el).show(); } catch(_b){}
    }
    function bindInsert(){
      const btn=document.getElementById('btnNovoGrupoTurnos');
      if(btn && !btn.__turnosHardBound){
        btn.__turnosHardBound=true;
        btn.addEventListener('click', ev=>{ ev.preventDefault(); console.debug('[escala][fallback] clique Inserir Turnos'); openTurnosFallback(); });
      }
    }
    function bindEquipesEfetivo(){
      const tabela=document.getElementById('tabelaEquipes');
      if(!tabela || tabela.__eqHardBound) return;
      tabela.__eqHardBound=true;
      tabela.addEventListener('click', ev=>{
        const btn=ev.target.closest('button[data-act]'); if(!btn) return;
        const act=btn.getAttribute('data-act');
  if(act==='comp-eq'){
          // Usa função original se existir; senão, fallback mínimo
            const tr=btn.closest('tr[data-id]');
            const id=tr && tr.getAttribute('data-id');
            let eq = null;
            try { eq = (window.__ESCALA_STATE__?.equipes||[]).find(e=> String(e.id)===String(id)); } catch(_s){}
            if(!eq){ try { const tds=tr.querySelectorAll('td'); eq = { id, nome:(tds[0]?.textContent||'EQ').trim(), descricao:(tds[1]?.textContent||'').trim(), componentes:[] }; } catch(_d){} }
            if(typeof window.openEquipeEfetivoModal==='function') window.openEquipeEfetivoModal(eq || { id, nome:'EQ', componentes:[] });
            else if(typeof window.__openEfetivoFallback==='function') window.__openEfetivoFallback(eq || { id, nome:'EQ', componentes:[] });
        } else if(act==='edit-eq'){
          // Garantir modal (preferir EJS, senão fallback)
          const modal = (typeof ensureModalNomeEquipe==='function') ? ensureModalNomeEquipe() : (function(){
            let m = document.getElementById('modalEditarEquipe') || document.getElementById('modalEditarNomeEquipe');
            if(!m){
              m = document.createElement('div'); m.id='modalEditarEquipe'; m.className='modal fade';
              m.innerHTML = '<div class="modal-dialog"><div class="modal-content">'
                +'<div class="modal-header py-2"><h5 class="modal-title mb-0" style="font-size:1rem;">Editar Equipe</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>'
                +'<div class="modal-body pb-2"><form class="row g-3"><div class="col-6 col-sm-4 col-md-3"><label class="form-label fw-semibold" for="editNomeEquipe">Nome:</label><input type="text" id="editNomeEquipe" maxlength="3" class="form-control uppercase"></div><div class="col-12"><label class="form-label fw-semibold" for="editDescricaoEquipe">Descrição:</label><input type="text" id="editDescricaoEquipe" maxlength="30" class="form-control"></div></form></div>'
                +'<div class="modal-footer py-2"><button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" type="button">Cancelar</button><button class="btn btn-primary btn-sm" id="btnSalvarEdicaoEquipe" type="button">Salvar</button></div>'
              +'</div></div>';
              document.body.appendChild(m);
            }
            const btnS = m.querySelector('#btnSalvarEdicaoEquipe'); if(btnS && !btnS.__bound){ btnS.__bound=true; btnS.addEventListener('click', function(){
              try{
                const id=this.dataset.id; if(!id) return;
                const nomeEl=m.querySelector('#editNomeEquipe'); const descEl=m.querySelector('#editDescricaoEquipe');
                const nome=(nomeEl&&nomeEl.value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
                const descricao=(descEl&&descEl.value||'').trim();
                if(!nome){ alert('Informe o nome da equipe.'); return; }
                let eq=null; try { const arr=(window.__ESCALA_STATE__?.equipes)||[]; eq=arr.find(e=> String(e.id)===String(id)); } catch(_s){}
                if(!eq && window.state && Array.isArray(window.state.equipes)) eq = window.state.equipes.find(e=> e.id===id);
                if(eq){ eq.nome=nome; eq.descricao=descricao; }
                try { window.renderEquipes && window.renderEquipes(); } catch(_r){}
                try { window.renderMatrizesPorGrupo && window.renderMatrizesPorGrupo(); } catch(_m){}
                try { window.avaliarProgressaoAbas && window.avaliarProgressaoAbas(); } catch(_a){}
                try { const inst=bootstrap.Modal.getOrCreateInstance(m); inst && inst.hide(); } catch(_b){}
              } catch(_err){}
            }); }
            return m;
          })();
          try {
            const tr=btn.closest('tr[data-id]'); const id=tr && tr.getAttribute('data-id');
            if(id){
              let eq = null;
              try { const arr=(window.__ESCALA_STATE__?.equipes)||[]; eq = arr.find(e=> String(e.id)===String(id)); } catch(_s){}
              if(!eq){
                // reconstrói via DOM
                try { const tds = tr.querySelectorAll('td'); eq = { id, nome:(tds[0]?.textContent||'').trim(), descricao:(tds[1]?.textContent||'').trim(), componentes:[] }; } catch(_dom){}
              }
              modal.querySelector('#editNomeEquipe').value = (eq && eq.nome) || '';
              const d = modal.querySelector('#editDescricaoEquipe'); if(d) d.value = (eq && eq.descricao) || '';
              const b = modal.querySelector('#btnSalvarEdicaoEquipe'); if(b) b.dataset.id = id;
            }
          } catch(_f){}
          try { bootstrap.Modal.getOrCreateInstance(modal).show(); } catch(_m){}
        } else if(act==='del-eq'){
          const tr=btn.closest('tr[data-id]'); const id=tr && tr.getAttribute('data-id');
          if(!id) return;
          if(btn.dataset.busy==='1') return; btn.dataset.busy='1';
          try{ const st=window.__ESCALA_STATE__||{}; const stRaw=String((st.status||'')||'').toLowerCase(); if(['fechada','fechado','validada','validado','publicada','concluida','concluída','concluida'].includes(stRaw)){ alert('Edição bloqueada: a escala está fechada.'); btn.dataset.busy='0'; return; } }catch(_lock){}
          const ok=confirm('Excluir equipe?');
          if(!ok){ btn.dataset.busy='0'; return; }
          if(typeof window.excluirEquipe==='function'){ window.excluirEquipe(id).finally(()=>{ btn.dataset.busy='0'; }); }
          else {
            // fallback mÃ­nimo: tenta remover localmente e PUT overwrite
            try {
              const anterior = (window.__ESCALA_STATE__?.equipes||[]).slice();
              const rest = anterior.filter(e=> e.id!==id);
              // resolve id agressivamente
              let escalaId = window.__ESCALA_STATE__?.escalaId;
              try {
                if(!escalaId && typeof window.obterQueryId==='function') escalaId = window.obterQueryId();
                if(!escalaId){ const hid = document.querySelector('#escalaId,[name="escalaId"],[name="idEscala"]'); escalaId = hid && (hid.value||hid.getAttribute('value')); }
              } catch(_id){}
              if(!escalaId){ alert('Salve a escala antes.'); btn.dataset.busy='0'; return; }
              fetch((window.basePath? window.basePath(): '')+`/api/escalas/${escalaId}`,{ method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipesOverwrite:true, equipes: rest }) })
                .then(async r=>{ 
                  if(!r.ok) throw new Error('PUT falhou'); 
                  try { if(window.__ESCALA_STATE__) window.__ESCALA_STATE__.equipes = rest.slice(); } catch(_s){}
                  // Atualiza DOM localmente (remover linha)
                  try { const tbody = document.querySelector('#tabelaEquipes tbody'); if(tbody && tr && tbody.contains(tr)) tr.remove(); } catch(_rm){}
                  // Se ficar vazia, mostra linha "Nenhuma equipe."
                  try { const tbody = document.querySelector('#tabelaEquipes tbody'); if(tbody && !tbody.querySelector('tr[data-id]')) tbody.innerHTML = '<tr class="text-muted"><td colspan="4" class="text-center small">Nenhuma equipe.</td></tr>'; } catch(_emp){}
                  try { if(typeof window.renderMatrizesPorGrupo==='function') window.renderMatrizesPorGrupo(); } catch(_r){}
                  try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_a){}
                  try { window.__escalaToastSuccess && window.__escalaToastSuccess('Equipe excluída com sucesso.'); } catch(_t){}
                  btn.dataset.busy='0';
                })
                .catch(()=>{ alert('Falha ao excluir equipe.'); btn.dataset.busy='0'; });
            } catch(_e){ alert('Falha ao excluir equipe.'); btn.dataset.busy='0'; }
          }
        }
      });
    }
    function bindInserirEquipeFallback(){
      const btn=document.getElementById('btnAddEquipe');
      if(!btn || btn.__eqAddBound) return; btn.__eqAddBound=true;
      btn.addEventListener('click', async ev=>{
        ev.preventDefault();
        try {
          // Bloqueio: se a escala estiver fechada, não permitir inserir novas equipes
          try{
            const st = window.__ESCALA_STATE__ || {}; const stRaw = String((st.status||'')||'').toLowerCase();
            if(['fechada','fechado','validada','validado','publicada','concluida','concluída','concluida'].includes(stRaw)){
              alert('Edição bloqueada: a escala está fechada.');
              return;
            }
          }catch(_b){}
          if(typeof window.salvarNovaEquipe==='function') return window.salvarNovaEquipe();
          // fallback mÃ­nimo se funÃ§Ã£o ainda nÃ£o estÃ¡ exposta
          const nomeEl=document.getElementById('nomeEquipe'); const descEl=document.getElementById('descricaoEquipe');
          if(!nomeEl) return;
          const nome=(nomeEl.value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
          if(!nome) return alert('Informe nome da equipe');
          const eq={ id:'eq'+Math.random().toString(36).slice(2,10), nome, descricao:(descEl&&descEl.value||'').trim(), componentes:[] };
          const st=window.__ESCALA_STATE__ || { equipes:[] };
          if(!st.escalaId){ st.equipes = (st.equipes||[]).concat([eq]); }
          else {
            try { await fetch('/escalas/api/escalas/'+encodeURIComponent(st.escalaId)+'/equipes', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipe: eq }) }); } catch(_e){}
          }
          // render mÃ­nimo
          const tbl=document.getElementById('tabelaEquipes'); if(tbl){ const tbody=tbl.querySelector('tbody'); if(tbody){ const row=`<tr data-id="${eq.id}"><td>${eq.nome}</td><td>${eq.descricao||''}</td><td class="text-center">-</td><td class="text-center eq-col-acoes"><button type="button" class="btn btn-sm btn-outline-primary" data-act="comp-eq" title="Efetivo"><i class="bi bi-people"></i></button><button type="button" class="btn btn-sm btn-outline-secondary" data-act="edit-eq" title="Editar"><i class="bi bi-pencil"></i></button><button type="button" class="btn btn-sm btn-outline-danger" data-act="del-eq" title="Excluir"><i class="bi bi-trash"></i></button></td></tr>`; if(tbody.querySelector('.text-muted')) tbody.innerHTML=row; else tbody.insertAdjacentHTML('beforeend', row); } }
          if(nomeEl) nomeEl.value=''; if(descEl) descEl.value='';
        } catch(_e){ /* noop */ }
      });
    }
    function bindEditarGrupoDelegado(){
      if(window.__editGrupoDelegadoBound) return; window.__editGrupoDelegadoBound=true;
      document.addEventListener('click', ev=>{
        const btn=ev.target.closest && ev.target.closest('button[data-act="edit-grupo"]');
        if(!btn) return;
        const tr = btn.closest('tr[data-id]');
        const gid = tr && tr.getAttribute('data-id');
        if(!gid) return;
        const lista = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.gruposTurnos) || (typeof state!=='undefined'? state.gruposTurnos:[]) || [];
        const grupo = lista.find(g=> String(g && (g.id||g._id||g.id_grupo)) === String(gid));
        console.debug('[escala][fallback] editar grupo click', gid, grupo);
        // Preferir versÃµes completas; senÃ£o, usar fallback bÃ¡sico
        if(typeof window.abrirPopupTurnos==='function'){
          try { window.abrirPopupTurnos(grupo); return; } catch(e){ console.warn('falha abrirPopupTurnos(grupo)', e); }
        }
        if(typeof window.openPopupTurnos==='function'){
          try { window.openPopupTurnos(grupo); return; } catch(e2){ console.warn('falha openPopupTurnos(grupo)', e2); }
        }
        // Ãšltimo recurso: modal mÃ­nima
        abrirPopupTurnosBasico(grupo);
      }, true);
    }
    function bindExcluirGrupoDelegado(){
      if(window.__delGrupoDelegadoBound) return; window.__delGrupoDelegadoBound=true;
      document.addEventListener('click', ev=>{
        try { if(ev && ev.__escalaDelAsked) return; } catch(_s){}
        const btn=ev.target.closest && ev.target.closest('button[data-act="del-grupo"]');
        if(!btn) return;
        const tr = btn.closest('tr[data-id]');
        const gid = tr && tr.getAttribute('data-id');
        if(!gid) return;
        try { ev.preventDefault(); ev.stopImmediatePropagation && ev.stopImmediatePropagation(); ev.stopPropagation(); } catch(_c){}
        if(typeof window.__askDeleteGrupoTurno==='function') return window.__askDeleteGrupoTurno(gid, btn, ev);
        if(confirm('Excluir este grupo de turnos?')){
          if(typeof window.excluirGrupoTurnoPorId==='function') return window.excluirGrupoTurnoPorId(gid, btn);
        }
      }, true);
    }
    // Tentar agora e repetir (caso DOM ainda nÃ£o tenha carregado tudo)
    bindInsert(); bindEquipesEfetivo(); bindEditarGrupoDelegado(); bindExcluirGrupoDelegado(); bindInserirEquipeFallback();
    setTimeout(bindInsert,250); setTimeout(bindEquipesEfetivo,250); setTimeout(bindEditarGrupoDelegado,250); setTimeout(bindExcluirGrupoDelegado,250); setTimeout(bindInserirEquipeFallback,250);
    setTimeout(bindInsert,1000); setTimeout(bindEquipesEfetivo,1000); setTimeout(bindEditarGrupoDelegado,1000); setTimeout(bindExcluirGrupoDelegado,1000); setTimeout(bindInserirEquipeFallback,1000);
  })();
  // Expor funÃ§Ã£o globalmente para debug e botÃµes
  try { if(typeof renderMatrizesPorGrupo === 'function'){ window.renderMatrizesPorGrupo = renderMatrizesPorGrupo; } } catch(_e){}
  try { if(typeof renderGruposTurnos === 'function'){ window.renderGruposTurnos = renderGruposTurnos; } } catch(_e){}
  try { if(typeof forceRepaintTurnosList === 'function'){ window.forceRepaintTurnosList = forceRepaintTurnosList; } } catch(_e){}
  // Evita sobrescrita do handler do modal de detalhamento; mantemos apenas em __ESCALA_FUNCS__
  // Listener global hiper-robusto para "Excluir" na tabela de turnos
  (function bindExcluirGrupoGlobalRobust(){
    if(window.__DEL_GRP_GLOBAL_ROBUST__) return; window.__DEL_GRP_GLOBAL_ROBUST__=true;
    document.addEventListener('click', function(ev){
      try{
        if(ev && ev.__escalaDelAsked) return;
        const table = document.querySelector('#aba-turnos #tabelaGruposTurnos') || document.getElementById('tabelaGruposTurnos');
        if(!table) return;
        const within = ev.target && table.contains(ev.target);
        if(!within) return;
        // Detectar alvos de exclusão por diversos sinais
        const el = ev.target.closest ? (ev.target.closest('[data-act="del-grupo"]') || ev.target.closest('[title]') || ev.target.closest('img') || ev.target.closest('a') || ev.target.closest('button')) : null;
        if(!el) return;
        const title = (el.getAttribute && (el.getAttribute('title')||'')) || '';
        const alt = (el.getAttribute && (el.getAttribute('alt')||'')) || '';
        const src = (el.getAttribute && (el.getAttribute('src')||'')) || '';
        const dataAct = (el.getAttribute && el.getAttribute('data-act')) || '';
        const txt = (el.textContent||'').toLowerCase();
        const looksDelete = /del-grupo/.test(dataAct) || /exclu|apag|delet|trash|remov/i.test(title) || /exclu|apag|delet|trash|remov/i.test(alt) || /trash|delete|excluir|lixeira/i.test(src) || /🗑/i.test(txt);
        if(!looksDelete) return;
        const tr = el.closest && el.closest('tr');
        if(!tr) return;
        let gid = tr.getAttribute && tr.getAttribute('data-id');
        if(!gid){
          // inferir pelo conteúdo
          const td = tr.querySelector('td');
          const text = (td && td.textContent || '').trim();
          if(text){
            const norm = text.split('|').map(s=> s.trim()).map(p=> p.replace(/\s+/g,'').replace(/–|—/g,'-')).sort().join('|');
            const lista = (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.gruposTurnos) || [];
            for(const g of lista){
              const tHtml = (Array.isArray(g.turnos)? g.turnos:[]).map(t=>{ const f=__fmtTurno(t); return (f.ini||'')+'-'+(f.fim||''); }).sort().join('|');
              if(tHtml === norm){ gid = g.id; break; }
            }
          }
        }
        if(!gid) return;
        try { ev.preventDefault(); ev.stopImmediatePropagation && ev.stopImmediatePropagation(); ev.stopPropagation(); } catch(_c){}
        console.log('[escala][grupos] clique excluir capturado (robusto), gid=', gid);
        if(typeof window.__askDeleteGrupoTurno==='function') return window.__askDeleteGrupoTurno(gid, el, ev);
        if(!confirm('Excluir este grupo de turnos?')) return;
        try {
          if(typeof window.excluirGrupoTurnoPorId==='function'){
            return window.excluirGrupoTurnoPorId(gid, el);
          }
          // fallback: tentar chamar símbolo local se existir
          if(typeof excluirGrupoTurnoPorId==='function'){
            try { window.excluirGrupoTurnoPorId = excluirGrupoTurnoPorId; } catch(_){}
            return excluirGrupoTurnoPorId(gid, el);
          }
          // último recurso: agendar reintentos curtos aguardando a função ficar disponível
          console.warn('[escala][grupos] excluirGrupoTurnoPorId indisponível no clique; agendando reintentos');
          let tentativas=0; const max=10; const tm = setInterval(()=>{
            tentativas++;
            try{
              if(typeof window.excluirGrupoTurnoPorId==='function'){
                clearInterval(tm);
                console.log('[escala][grupos] função de exclusão ficou disponível após', tentativas, 'ticks');
                return window.excluirGrupoTurnoPorId(gid, el);
              }
              if(typeof excluirGrupoTurnoPorId==='function'){
                try { window.excluirGrupoTurnoPorId = excluirGrupoTurnoPorId; } catch(_){}
                clearInterval(tm);
                console.log('[escala][grupos] função local de exclusão usada após', tentativas, 'ticks');
                return excluirGrupoTurnoPorId(gid, el);
              }
              if(tentativas>=max){ clearInterval(tm); console.error('[escala][grupos] não conseguiu obter função de exclusão após reintentos'); }
            }catch(_tick){ /* noop */ }
          }, 150);
        } catch(_call){ /* noop */ }
      }catch(_e){ /* noop */ }
    }, true);
  })();
  // Chamada direta de inicializaÃ§Ã£o
  try {
    if(typeof initEscalaPage === 'function'){
      window.initEscalaPage = initEscalaPage;
      initEscalaPage();
      window.__ESCALA_BOOT_OK = true;
    }
  } catch(e){
    console.error('[escala][core] erro na inicializaÃ§Ã£o direta:', e);
  }
  // Fallback de carregamento direto da escala por ID (fora do init), caso algo impeÃ§a o boot completar
  setTimeout(()=>{
    try {
      const st = window.__ESCALA_STATE__ || {};
      const idQ = getEscalaId();
      console.debug('[escala][fallback-load] estado.created=', !!st.created, 'idQ=', idQ, 'basePath=', (typeof basePath==='function'? basePath(): 'n/a'));
      if(!st.created && idQ && typeof carregarEscalaExistente==='function'){
        console.warn('[escala][fallback-load] tentando carregar escala fora do init com id=', idQ);
        carregarEscalaExistente(idQ).then(()=>{
          console.debug('[escala][fallback-load] pÃ³s-carregamento created=', !!(window.__ESCALA_STATE__ && window.__ESCALA_STATE__.created));
          avaliarProgressaoAbas?.();
        }).catch(err=> console.warn('[escala][fallback-load] erro', err));
      }
    } catch(_fl){}
  }, 600);
  // Fallback adicional ao DOMContentLoaded: se init rodou mas nÃ£o marcou created, tenta carregar novamente pela query
  document.addEventListener('DOMContentLoaded', ()=>{
    try {
      setTimeout(()=>{
        try {
          const st = window.__ESCALA_STATE__ || {};
          const idQ = getEscalaId();
          if(!st.created && idQ && typeof carregarEscalaExistente==='function'){
            console.warn('[escala][fallback-load][dom] created ainda falso; re-tentando carregar id=', idQ);
            carregarEscalaExistente(idQ).catch(()=>{});
          }
        } catch(_e){}
      }, 300);
    } catch(_d){}
  });
  // Removido: nÃ£o forÃ§ar aba via sessionStorage; abrir ediÃ§Ã£o sempre em Dados Gerais
  console.log('[escala][script] fim da execuÃ§Ã£o do script');

  // LISTENER GLOBAL PARA FORÇAR CÁLCULO APÓS QUALQUER INSERÇÃO DE FUNCIONÁRIO
  try {
    if(!window.__EF_GLOBAL_CALC_LISTENER__){
      window.__EF_GLOBAL_CALC_LISTENER__ = true;
      document.addEventListener('escala:efetivoSelecionado', function(){
        console.log('[efetivo][global] evento escala:efetivoSelecionado detectado, forçando cálculo');
        setTimeout(()=>{ try { if(window.__efForceRefreshLista) window.__efForceRefreshLista(); } catch(_f){} }, 200);
        setTimeout(()=>{ try { if(window.__efForceRefreshLista) window.__efForceRefreshLista(); } catch(_f){} }, 800);
      });
      document.addEventListener('escala:efetivoSelecionadoMultiplo', function(){
        console.log('[efetivo][global] evento escala:efetivoSelecionadoMultiplo detectado, forçando cálculo');
        setTimeout(()=>{ try { if(window.__efForceRefreshLista) window.__efForceRefreshLista(); } catch(_f){} }, 200);
        setTimeout(()=>{ try { if(window.__efForceRefreshLista) window.__efForceRefreshLista(); } catch(_f){} }, 800);
      });
      document.addEventListener('escala:efetivo:lista-modificada', function(){
        console.log('[efetivo][global] evento escala:efetivo:lista-modificada detectado, forçando cálculo');
        setTimeout(()=>{ try { if(window.__efForceRefreshLista) window.__efForceRefreshLista(); } catch(_f){} }, 200);
        setTimeout(()=>{ try { if(window.__efForceRefreshLista) window.__efForceRefreshLista(); } catch(_f){} }, 800);
      });
    }
  } catch(_global){}

  // Expor funções necessárias para o escopo global
  try {
    if(typeof getEscalaId === 'function' && typeof window.getEscalaId !== 'function'){
      window.getEscalaId = getEscalaId;
    }
    if(typeof dateBrToISO === 'function' && typeof window.dateBrToISO !== 'function'){
      window.dateBrToISO = dateBrToISO;
    }
    if(typeof obterDiaSemanaAbrev === 'function' && typeof window.obterDiaSemanaAbrev !== 'function'){
      window.obterDiaSemanaAbrev = obterDiaSemanaAbrev;
    }
    if(typeof iniciarLoopResolucaoUnidade === 'function' && typeof window.iniciarLoopResolucaoUnidade !== 'function'){
      window.iniciarLoopResolucaoUnidade = iniciarLoopResolucaoUnidade;
    }
  } catch(_expose){ console.warn('[escala][expose] falha ao expor funções globais', _expose); }
}
