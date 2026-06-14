(function(){
  'use strict';
  const $ = (id)=> document.getElementById(id);
  const resultado = document.getElementById('resultado');
  let currentDiaISO = null; // dia atual da pesquisa, para salvar notas por alocação
  // CSS fix: evitar que a borda direita do quadro de notas do recurso fique sob a coluna de Notas da equipe
  (function injectStyles(){
    try{
      const id = 'escalas-diaria-fixes';
      if(document.getElementById(id)) return;
      const css = `
        /* Mantém quadros dentro da célula e dá folga à direita do bloco de notas do recurso */
        .turno-cell.recurso { padding-right: 12px; position: relative; z-index: 2; overflow: visible; }
        .turno-cell.recurso .rc-box { box-sizing: border-box; max-width: 100%; padding-right: 8px; position: relative; z-index: 2; }
        .turno-cell.recurso .rc-notes .rc-notes-box { box-sizing: border-box; margin-right: 0; width: 100%; background-color: #fff; white-space: pre-line; word-break: break-word; }
        /* Garante que a coluna de Notas fique abaixo do quadro do recurso quando encostar */
        .turno-row > .turno-cell:last-child { position: relative; z-index: 1; }

  /* Equipe: nome acima, descrição abaixo, e botões em seguida, na mesma célula */
        .turno-cell.equipe { display:flex; flex-direction: column; align-items: center; justify-content: center; white-space: normal; }
  .turno-cell.equipe .eq-name { display:block; white-space: nowrap; margin-bottom: 2px; }
  .turno-cell.equipe .eq-desc { display:block; color: #6c757d; font-size: 0.9em; line-height: 1.1; margin-bottom: 4px; }
        .turno-cell.equipe .eq-tools { width: 100%; display:flex; justify-content: center; }

        /* Atribuídos do recurso: um por linha (nome + botões na mesma linha) */
        .rc-grid .rc-nomes { display: flex; flex-direction: column; gap: 4px; }
  .rc-grid .rc-nomes .grid-func { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; }
  .rc-grid .rc-nomes .grid-func .func-atr { margin-left: 0; color: #6c757d; font-size: 0.85em; }
  .rc-grid .rc-nomes .grid-func .rc-toolbar { margin-top: 4px; }
        /* ==========================
           Diária — visual moderno
        ========================== */

        .escala-card-title {
          background: linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%);
          border: 1px solid #d6e4f5;
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .escala-content {
          margin-top: 10px;
        }

        .grid-turno {
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #d8e4f2;
          background: #ffffff;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
        }

        .grid-turno > header {
          background: linear-gradient(90deg, #1d4ed8 0%, #2563eb 100%);
          color: #ffffff;
          font-weight: 700;
          letter-spacing: .2px;
          padding: 12px 16px;
          text-align: center;
        }

        .turno-head {
          background: #0f2f63;
          color: #ffffff;
          font-weight: 700;
          letter-spacing: .2px;
        }

        .turno-head > div {
          padding: 10px 12px;
        }

        .turno-table {
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid #d8e4f2;
          background: #fff;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
        }

        .turno-row {
          min-height: 126px;
          background: #ffffff;
        }

        .turno-cell {
          padding: 14px 14px;
          vertical-align: middle;
          background: #fff;
        }

        .turno-cell.equipe {
          background: linear-gradient(180deg, #f7fbff 0%, #edf4fb 100%);
          width: 140px;
          min-width: 140px;
          padding: 18px 18px;
          border-right: 1px solid #dce7f5;
        }

        .turno-cell.recurso {
          padding-left: 5px !important;
          padding-right: 24px !important;
          overflow: visible;
        }

        .turno-row > .turno-cell:last-child {
          padding-left: 18px;
          padding-right: 18px;
        }

        .eq-tools {
          width: 100%;
          display: flex;
          justify-content: center;
        }

        .eq-toolbar,
        .rc-toolbar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .eq-toolbar {
          margin-top: 12px;
          padding-left: 4px;
          padding-right: 4px;
        }

        .rc-toolbar {
          margin-top: 0;
        }

        .diaria-icon-btn {
          width: 28px;
          height: 28px;
          min-width: 28px;
          min-height: 28px;
          max-width: 28px;
          max-height: 28px;
          border: 0;
          background: #ffffff;
          padding: 0;
          margin: 0;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border-radius: 9px;
          vertical-align: middle;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.10);
          transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
          overflow: hidden;
        }

        .diaria-icon-btn:hover {
          background: #eef6ff;
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.14);
        }

        .diaria-icon-danger:hover {
          background: #fff1f2;
        }

        .diaria-icon-btn:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
        }

        .diaria-icon-btn:disabled {
          opacity: .45;
          cursor: not-allowed;
          transform: none;
        }

        .diaria-action-icon,
        .diaria-icon-btn img.diaria-action-icon {
          width: 18px !important;
          height: 18px !important;
          min-width: 18px !important;
          min-height: 18px !important;
          max-width: 18px !important;
          max-height: 18px !important;
          object-fit: contain !important;
          display: block !important;
          flex: 0 0 auto !important;
        }
        .diaria-inline-icon {
          width: 16px !important;
          height: 16px !important;
          min-width: 16px !important;
          min-height: 16px !important;
          max-width: 16px !important;
          max-height: 16px !important;
          object-fit: contain !important;
          display: inline-block !important;
          vertical-align: -3px;
          margin-right: 4px;
        }

        .btn-toggle-escala {
          border: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          padding: 2px !important;
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .btn-toggle-escala:hover {
          background: rgba(13, 110, 253, 0.08) !important;
          border-radius: 8px;
        }

        .diaria-toggle-icon {
          width: 22px !important;
          height: 22px !important;
          min-width: 22px !important;
          min-height: 22px !important;
          max-width: 22px !important;
          max-height: 22px !important;
          object-fit: contain !important;
          display: block !important;
        }

        .rc-stack {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .rc-box {
          border: 1px solid #dbe7f4;
          border-radius: 14px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
          background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
          overflow: hidden;
          max-width: 100%;
        }

        .rc-head {
          color: #52647a;
          font-size: 12px;
          font-weight: 700;
          padding-bottom: 6px;
          background: #f7faff;
          border-bottom: 1px solid #e2ecf8;
        }

        .rc-head > div {
          padding: 8px 10px;
          text-align: center;
        }

        .rc-grid {
          align-items: center;
          row-gap: 10px;
          column-gap: 12px;
          min-height: 76px;
        }

        .rc-grid > div {
          padding: 10px 12px;
        }

        .rc-grid > div:not(:last-child) {
          border-right: 1px solid #eef3fa;
        }

        .rc-nomes {
          gap: 7px !important;
          min-width: 0;
        }

        .grid-func {
          background: transparent;
          padding: 0;
          min-width: 0;
        }

        .func-line {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }

        .func-nome {
          font-size: 14px;
          color: #1f2937;
          font-weight: 600;
          line-height: 1.25;
        }

        .func-atr {
          font-size: 12px !important;
          color: #6b7280 !important;
          margin-top: 3px;
        }

        .rc-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }

        .rc-badge .badge-recurso,
        .badge-recurso.rc-badge {
          background: #eaf2ff;
          color: #1d4ed8;
          border: 1px solid #c7dcff;
          border-radius: 999px;
          padding: 5px 14px;
          font-size: 13px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 82px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.7);
        }

        .rc-badge-sub {
          margin-top: 6px;
          font-size: 12px;
          color: #64748b !important;
          line-height: 1.15;
        }

        .rc-actions {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .rc-notes {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }

        .rc-notes .rc-notes-box,
        .notas-box {
          border: 1px dashed #d7e2f2;
          border-radius: 10px;
          padding: 8px 12px;
          background: #fff;
          display: inline-block;
          min-width: 72px;
          max-width: 220px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          color: #334155;
        }

        .rc-meals-box {
          font-size: 12px;
          color: #4b5563;
        }

        .form-text.text-muted {
          font-size: 12px;
          margin-top: 7px !important;
        }

        /* Funcionários sem recurso */
        .fora-wrap {
          margin-top: 8px;
        }

        .fora-wrap .rc-box {
          background: linear-gradient(180deg, #fbfdff 0%, #f8fbff 100%);
          border: 1px dashed #cbdff5;
          box-shadow: none;
        }

        .grid-func-solo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          min-width: 0;
          padding: 10px 14px;
        }

        .grid-func-solo .func-nome {
          flex: 0 1 auto;
          min-width: 0;
          max-width: 320px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: block;
          text-align: center;
        }

        .grid-func-solo .rc-toolbar {
          flex: 0 0 auto;
          margin-left: 8px;
        }

  /* Mantém layout padrão; coluna de ações fica oculta com d-none quando não usada */
    /* Notas da equipe em coluna própria: preservar quebras de linha e evitar overflow */
    .notas-box { white-space: pre-line; word-break: break-word; }
      `;
      const style = document.createElement('style'); style.id = id; style.type = 'text/css'; style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
    }catch(_e){}
  })();

  // Helpers
  function alertTop(msg, variant='danger', timeout=4000){
    const wrap=document.getElementById('alertsTopRight');
    if(!wrap){ alert(msg); return; }
    const id='al_'+Date.now()+Math.random().toString(16).slice(2);
    const div=document.createElement('div');
    div.id=id; div.className='toast align-items-center text-bg-'+(variant==='danger'?'danger':variant)+' border-0 show mb-2 shadow';
    div.setAttribute('role','alert'); div.style.minWidth='240px';
    div.innerHTML=`<div class="d-flex"><div class="toast-body">${escapeHtml(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>`;
    wrap.appendChild(div);
    div.querySelector('.btn-close').onclick=()=>{ div.classList.remove('show'); setTimeout(()=>div.remove(),150); };
    setTimeout(()=>{ if(div.isConnected){ div.classList.remove('show'); setTimeout(()=>div.remove(),300); } }, timeout);
  }
  function escapeHtml(str){ return (str||'').replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s])); }
    const DIARIA_ICON_BASE = '/escalas/img/icons/';

  function diariaIcon(nome, alt) {
    return `<img src="${DIARIA_ICON_BASE}${nome}" alt="${escapeHtml(alt || '')}" class="diaria-action-icon">`;
  }

  function diariaIconButton({ title, icon, onclick, danger = false }) {
    const dangerClass = danger ? ' diaria-icon-danger' : '';
    return `<button type="button" class="diaria-icon-btn${dangerClass}" title="${escapeHtml(title)}" onclick="${onclick}">
      ${diariaIcon(icon, title)}
    </button>`;
  }
  function diariaIconInline(icon, alt) {
  return `<img src="${DIARIA_ICON_BASE}${icon}" alt="${escapeHtml(alt || '')}" class="diaria-inline-icon">`;
}
  // Monta rótulo do recurso a partir de placa/marca/modelo para uso na Diária
  function comporRotuloRecurso(r){
    if(!r) return '';
    const placa = (r.placa || r.codigo || '').toString().trim();
    const marca = (r.marca || r.fabricante || '').toString().trim();
    const modelo = (r.modelo || r.model || '').toString().trim();
    const parts = [placa, marca, modelo].filter(p=> p);
    // Se tiver placa junto com marca/modelo, juntar com ' - '
    if(placa && (marca || modelo)) return [placa, marca, modelo].filter(p=> p).join(' - ');
    // Caso não tenha placa, mas tenha marca/modelo, ainda assim mostrar o que tiver
    if(parts.length) return parts.join(' - ');
    return '';
  }
  // Evita mostrar ObjectId hex bruto como rótulo
  function looksHexObjectId(v){ try { const s=String(v||'').trim(); return /^[0-9a-fA-F]{24}$/.test(s); } catch(_) { return false; } }
  // Escolhe o melhor nome amigável para o recurso usando diversos campos comuns
  function comporNomeAmigavelRecurso(r){
    if(!r) return '';
    const candidatos = [
      r.nome,
      r.nomeRecurso, r.nome_recurso,
      r.placa, // priorizar placa se existir
      r.descricao, r.descr,
      r.titulo, r.label,
      r.recurso,
      r.codigoRecurso, r.codigo
    ];
    for(const c of candidatos){
      const s = (c==null? '': String(c)).trim();
      if(!s) continue;
      if(looksHexObjectId(s)) continue; // não usar um ObjectId como nome
      return s;
    }
    // Último fallback: mostrar id mesmo que seja ObjectId para não ficar vazio
    try { if(r.id!=null){ const rid=String(r.id).trim(); if(rid) return rid; } } catch(_){ }
    return '';
  }
  function br(d){ if(!d) return ''; return d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4); }
  function isoFromBr(d){ const m=String(d||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return null; return `${m[3]}-${m[2]}-${m[1]}`; }
  function cssEscapeSel(s){ try{ if(window.CSS && typeof CSS.escape==='function') return CSS.escape(String(s)); }catch(_){} return String(s).replace(/[^a-zA-Z0-9_-]/g, m=> '\\'+m); }

  // Init UI
  function initCalendars(){ if(!window.flatpickr) return; document.querySelectorAll('.date-br').forEach(el=>{ if(el._fp) return; flatpickr(el,{ locale:'pt', dateFormat:'d/m/Y', allowInput:false, disableMobile:true }); }); }
  function carregarUnidades(){
    const sel = $('filtroUnidade'); if(!sel) return;
    fetch('/escalas/api/unidades-relacionadas',{ credentials:'same-origin' })
      .then(r=> r.ok? r.json(): Promise.reject(new Error('HTTP '+r.status)))
      .then(js=>{ sel.querySelectorAll('option:not([disabled])').forEach(o=>o.remove()); const lista=Array.isArray(js.data)? js.data:[]; lista.forEach(u=>{ const opt=document.createElement('option'); opt.value=u.id; opt.textContent=((u.codigo?u.codigo+' - ':'')+(u.nome||'')); sel.appendChild(opt); }); })
      .catch(e=> console.warn('[escala-diaria] unidades falhou', e));
  }

  // Render
  function renderVazio(){ resultado.innerHTML = '<div class="text-center text-muted small">Nenhuma escala para os parâmetros informados.</div>'; }
  function renderDia(payload){
    const arr = Array.isArray(payload?.data)? payload.data: [];
    if(!arr.length){ renderVazio(); return; }
    resultado.innerHTML = arr.map(esc=> renderEscala(esc)).join('');
    try { scheduleHydrate(resultado); } catch(_) {}
  }
  // Cache simples para nomes de funcionário por id
  const _nomeFuncCache = new Map();
  async function resolverNomeFuncionario(raw){
    if(!raw) return null;
    const key = String(raw).trim();
    if(_nomeFuncCache.has(key)) return _nomeFuncCache.get(key);
    const looksHexId = /^[0-9a-fA-F]{24}$/.test(key);
    const urls = [];
    if(looksHexId){
      urls.push(`/escalas/api/funcionarios/busca-codigo?id=${encodeURIComponent(key)}`);
      urls.push(`/api/funcionarios/busca-codigo?id=${encodeURIComponent(key)}`);
      // Também tentar por codigo como fallback extremo
      urls.push(`/escalas/api/funcionarios/busca-codigo?codigo=${encodeURIComponent(key)}`);
      urls.push(`/api/funcionarios/busca-codigo?codigo=${encodeURIComponent(key)}`);
    } else {
      // Não é ObjectId: tentar por codigo primeiro; depois tentar id (caso backend aceite)
      urls.push(`/escalas/api/funcionarios/busca-codigo?codigo=${encodeURIComponent(key)}`);
      urls.push(`/api/funcionarios/busca-codigo?codigo=${encodeURIComponent(key)}`);
      urls.push(`/escalas/api/funcionarios/busca-codigo?id=${encodeURIComponent(key)}`);
      urls.push(`/api/funcionarios/busca-codigo?id=${encodeURIComponent(key)}`);
    }
    let display = null;
    const makeDisplay = (obj)=>{
      if(!obj || typeof obj !== 'object') return null;
      const data = obj.data && typeof obj.data === 'object' ? obj.data : obj;
      const nome = [data.nome, data.nomeCompleto, data.apelido, data.name].map(v=> (v==null? '': String(v).trim())).find(v=> v);
      let codigo = [data.codigo, data.matricula, data.registro, data.cod]
        .map(v=> (v==null? '': String(v).trim()))
        .find(v=> v);
      if(codigo && /^[0-9a-fA-F]{24}$/.test(codigo)) codigo = '';
      if(nome && codigo) return `${codigo} - ${nome}`;
      return nome || (codigo || null);
    };
    for(const u of urls){
      try{
        const r = await fetch(u, { credentials:'same-origin' });
        if(!r.ok) continue;
        const js = await r.json();
        const disp = makeDisplay(js);
        if(disp){ display = disp; break; }
      }catch(_e){}
    }
    _nomeFuncCache.set(key, display);
    return display;
  }
  function hydrateNomes(container){
    try{
      const scope = container || resultado;
      const itens = scope.querySelectorAll('.func-nome');
      itens.forEach(async (span)=>{
        if(span.dataset.hydrated === '1') return;
        const el = span.closest('[data-funcionario-id]');
        const fid = el ? (el.getAttribute('data-funcionario-id') || '').trim() : '';
        if(!fid) return;
        const texto = (span.textContent||'').trim();
        const looksHexId = /^[0-9a-fA-F]{24}$/.test(texto);
        const looksAtCode = /^at_[0-9a-z]{6,}$/i.test(texto);
        const shouldHydrate = (texto === fid) || texto === '—' || looksHexId || looksAtCode;
        if(!shouldHydrate) return;
        const nome = await resolverNomeFuncionario(fid);
        if(nome && span.isConnected){
          span.textContent = nome;
          span.setAttribute('title', nome);
          span.dataset.hydrated = '1';
        }
      });
    }catch(_e){ /* noop */ }
  }
  // Agenda a hidratação para fora do handler de click/render imediato
  function scheduleHydrate(container){
    try {
      const fn = () => { try { hydrateNomes(container); } catch(_){} };
      if('requestIdleCallback' in window){
        window.requestIdleCallback(fn, { timeout: 300 });
      } else {
        setTimeout(fn, 16);
      }
    } catch(_s) { try { setTimeout(()=> hydrateNomes(container), 16); } catch(_){} }
  }
    function limparForaVazios(scope){
    try {
      const root = scope || resultado || document;
      root.querySelectorAll('.fora-wrap').forEach((wrap)=>{
        const temFuncionario = !!wrap.querySelector('.grid-func-solo');
        if(!temFuncionario){
          wrap.remove();
        }
      });
    } catch(_){}
  }

  function capturarEscalasExpandidas(){
    const ids = new Set();

    try {
      document.querySelectorAll('#resultado .btn-toggle-escala[aria-expanded="true"]').forEach((btn)=>{
        const card = btn.closest('[data-escala-id]');
        const targetId = btn.getAttribute('data-target');
        const content = targetId ? document.getElementById(targetId) : null;

        if(card && content && !content.classList.contains('d-none')){
          const id = card.getAttribute('data-escala-id');
          if(id) ids.add(String(id));
        }
      });
    } catch(_){}

    return ids;
  }

  function restaurarEscalasExpandidas(ids){
    try {
      if(!ids || !ids.size) return;

      ids.forEach((id)=>{
        const card = resultado?.querySelector(`[data-escala-id="${cssEscapeSel(String(id))}"]`);
        if(!card) return;

        const btn = card.querySelector('.btn-toggle-escala');
        if(!btn) return;

        const targetId = btn.getAttribute('data-target');
        const content = targetId ? document.getElementById(targetId) : null;
        if(!content) return;

        content.classList.remove('d-none');
        btn.setAttribute('aria-expanded', 'true');
        btn.setAttribute('title', 'Recolher');
        btn.innerHTML = `<img src="${DIARIA_ICON_BASE}zoommenos.png" alt="Recolher" class="diaria-toggle-icon">`;

        try { scheduleHydrate(content); } catch(_){}
      });
    } catch(_){}
  }

  async function pesquisarPreservandoExpansao(){
    const expandidas = capturarEscalasExpandidas();

    if(typeof pesquisar !== 'function') return;

    await pesquisar();

    restaurarEscalasExpandidas(expandidas);
  }

  function sincronizarDiariaLeve(delay = 250){
    try {
      setTimeout(()=>{
        pesquisarPreservandoExpansao().catch((err)=>{
          console.warn('[escala-diaria] falha ao sincronizar preservando expansão', err);
        });
      }, delay);
    } catch(_){}
  }
  function renderEscala(esc){
  const titulo = `${escapeHtml(esc.descricao||'-')} — ${(esc.unidade_codigo? escapeHtml(esc.unidade_codigo)+' - ':'')+escapeHtml(esc.unidade_nome||'')}`;
  const escIdVal = esc.id || esc._id || '';
  // Determinar se a escala tem conteúdo para o dia (qualquer turno com equipes visíveis)
  const hasConteudoDia = Array.isArray(esc.turnos) && esc.turnos.some(t=> Array.isArray(t.equipes) && t.equipes.length>0);
    // Botão Detalhes: segue a convenção de pesquisar_escala (abre /ordinaria/nova? id=... ou /extraordinaria/nova)
    const tipo = (String(esc.classificacao||'').toUpperCase().includes('EXTRA')) ? 'extraordinaria' : 'ordinaria';
    const rotaBase = `/escalas/${tipo}/nova`;
  const btnDetalhes = `<a class="btn btn-outline-primary btn-sm" href="${rotaBase}?id=${encodeURIComponent(escIdVal)}" title="Detalhes / Editar">${diariaIconInline('lapisedit.png', 'Detalhes')} Detalhes</a>`;
    // Botão recolher/expandir: inicia recolhido (+)
  const contentId = `esc_body_${escapeHtml(String(escIdVal))}`;
    const btnToggle = `<button type="button" class="btn-toggle-escala" data-target="${contentId}" aria-expanded="false" title="Expandir">
  <img src="${DIARIA_ICON_BASE}zoommais.png" alt="Expandir" class="diaria-toggle-icon">
</button>`;
    // Checkbox de inclusão no relatório (inicia marcado)
  const chkId = `esc_chk_${escapeHtml(String(escIdVal))}`;
  const chkChecked = hasConteudoDia ? 'checked' : '';
  const chkDisabled = hasConteudoDia ? '' : 'disabled';
  const chkTitle = hasConteudoDia ? 'Selecionar escala para relatório' : 'Sem conteúdo no dia (desabilitado)';
  const chkWrap = `
    <div class="form-check form-check-inline m-0">
      <input type="checkbox" class="form-check-input escala-chk" id="${chkId}" data-id="${escapeHtml(String(escIdVal))}" ${chkChecked} ${chkDisabled} title="${chkTitle}" aria-label="${chkTitle}">
      <label class="form-check-label small" for="${chkId}">Selecionar escala para relatório</label>
    </div>`;
    // Botão de toggle à esquerda, antes do nome da escala, seguido do título e do checkbox com rótulo
    const headerTop = `<div class="escala-card-title mb-1 d-flex justify-content-between align-items-center"><div class="d-flex align-items-center gap-2">${btnToggle}<span>${titulo}</span>${chkWrap}</div><div class="d-flex align-items-center gap-2">${btnDetalhes}</div></div>`;
    // Linha de status logo abaixo do título
    const status = String(esc.status||'').toLowerCase();
    const labelStatus = status==='fechada' ? '<span class="badge bg-secondary">fechada</span>' : (status ? '<span class="badge bg-success">aberta</span>' : '');
    const header = `${headerTop}${labelStatus? `<div class="mb-2">${labelStatus}</div>`:''}`;
  const turnos = Array.isArray(esc.turnos)? esc.turnos: [];
  const corpo = turnos.length? turnos.map(t=> renderTurno(t, escIdVal)).join('') : '<div class="text-muted small">Sem turnos para este dia.</div>';
    // Conteúdo inicia oculto (recolhido)
    const wrapCorpo = `<div id="${contentId}" class="escala-content d-none">${corpo}</div>`;
  return `<div class="card mb-3" data-escala-id="${escapeHtml(String(escIdVal))}"><div class="card-body">${header}${wrapCorpo}</div></div>`;
  }
  function renderTurno(t, escalaId){ const nome = `${escapeHtml(t.label || (t.ini&&t.fim? t.ini+' - '+t.fim : 'Turno'))}`; const equipes = Array.isArray(t.equipes)? t.equipes: []; const head = `<div class=\"turno-head\"><div>Equipe</div><div>Efetivo / Recurso</div><div>Notas</div></div>`; const corpo = equipes.map(e=> renderEquipeRowset(e, escalaId, t.token)).join(''); const tabela = `<div class=\"turno-table\">${head}${corpo || `<div class=\"turno-row\"><div class=\"turno-cell muted\" style=\"grid-column: 1 / -1\">Sem equipes</div></div>`}</div>`; return `<div class=\"grid-turno\"><header>${nome}</header>${tabela}</div>`; }
  function renderEquipeRowset(e, escalaId, turnoToken){
    const recursos = Array.isArray(e.recursos)? e.recursos: [];
    const fora = Array.isArray(e.funcionariosFora)? e.funcionariosFora: [];

  
  function extrairAtribuicoesDetalhe(r, dia, turnoToken){
    // 1) Filtrar o array por dia/turno
    const token = String(turnoToken||'').trim();
    const norm = (v)=>{ const s=String(v||''); const y = s.includes('::')? s.split('::').slice(-1)[0] : s; return y.replace(/\s*-\s*/, '-'); };
    const tokenSlim = token.replace(/\s*-\s*/, '-');
    let list = Array.isArray(r.atribuicoes)
      ? r.atribuicoes
          .filter(a=> a && (
            // dia igual ao alvo OU atribuição sem dia mas com turno batendo
            a.dia===dia || (!a.dia && (!a.turnoId || norm(a.turnoId)===tokenSlim))
          ) && (!a.turnoId || norm(a.turnoId)===tokenSlim))
          .map(a=> ({
            id: a.membroFuncionarioId || a.funcionarioId || a.id || a.funcionario || a.matricula || null,
            nome: a.nome || a.funcionarioNome || a.nomeFuncionario || a.funcionarioId || a.id,
            atribuicao: a.atribuicao || a.papel || a.funcao || a.funcaoNome || a.tarefa || '',
            _src: 'arr'
          }))
      : [];
    // 2) Fallback: quando vazio, tentar mapa legado por chave dia__turno
    if((!list || list.length===0) && r && r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){
      try {
  const k1 = `${dia}__${tokenSlim}`; const k2 = `${dia}__${(tokenSlim||'').replace('-', ' - ')}`;
        const add = (arr)=> Array.isArray(arr)? arr : [];
        const merged = [...add(r.atribuicoesRecurso[k1]), ...add(r.atribuicoesRecurso[k2])];
        list = merged.map(it=>({
          id: it.membroFuncionarioId || it.funcionarioId || it.funcionario || it.matricula || it.id || null,
          nome: it.nome || it.funcionarioNome || it.nomeFuncionario || it.funcionarioId || it.id || null,
          atribuicao: it.atribuicao || it.papel || it.funcao || it.funcaoNome || it.tarefa || '',
          _src: 'map'
        })).filter(x=> x && x.id);
      } catch(_){ /* noop */ }
    }
    // Bloqueios (removidos nesta alocação)
    const bloqueados = new Set();
    try {
      const token = String(turnoToken||'').trim();
      const k1 = `${dia}__${token}`; const k2 = `${dia}__${(token||'').replace('-', ' - ')}`;
      const ref = (r && r.remocoesRecurso && typeof r.remocoesRecurso==='object') ? r.remocoesRecurso : {};
      const arr1 = Array.isArray(ref[k1]) ? ref[k1] : []; const arr2 = Array.isArray(ref[k2]) ? ref[k2] : [];
      [...arr1, ...arr2].forEach(fid=> { if(fid!=null) bloqueados.add(String(fid)); });
    } catch(_b){ /* noop */ }
    // 4) Normalizar shape para UI e filtrar bloqueados
    return list
      .filter(it=> it && it.id)
      // Se veio do mapa (fallback), respeitar bloqueios; se veio do array (atribuição real), não bloquear
      .filter(it=> it._src === 'arr' || !bloqueados.has(String(it.id)));
  }
  function renderNomesAtribuidos(r, equipeNome, recursoId, turnoToken){
    // Não filtrar por nome aqui; se vier apenas o ID, exibimos e hidratamos o nome depois
    const list = extrairAtribuicoesDetalhe(r, currentDiaISO, turnoToken).filter(it=> it && (it.id!=null));
    if(!list.length) return '<div class="rc-nomes text-muted small">—</div>';
    const eq = escapeHtml(String(equipeNome||''));
    const rid = escapeHtml(String(recursoId||''));
    const rows = list.map(it=>{
      const fidRaw = (it.id!=null? String(it.id): '');
      const fid = escapeHtml(fidRaw);
      // Evitar exibir ObjectId/código bruto; mostra placeholder até hidratar
      const nome = escapeHtml((it.nome && String(it.nome).trim()) ? it.nome : '—');
      const atrib = it.atribuicao? `(${escapeHtml(it.atribuicao)})` : '';
      const nomeEl = `<span class=\"func-nome\" title=\"${escapeHtml(fidRaw || (it.nome||''))}\">${nome}</span>`;
      const atribEl = atrib? `<div class=\"func-atr\">${atrib}</div>` : '';
                const buttons = `<div class=\"rc-toolbar\">`
          + diariaIconButton({
              title: 'Remover (excluir da alocação)',
              icon: 'menos.png',
              danger: true,
              onclick: `window.es_diaria_removerAtribuicao('${eq}','${rid}','${fidRaw}', false)`
            })
          + diariaIconButton({
              title: 'Extrair efetivo (mover para sem recurso)',
              icon: 'extrair.png',
              onclick: `window.es_diaria_removerAtribuicao('${eq}','${rid}','${fid}', true)`
            })
          + diariaIconButton({
              title: 'Editar atribuição',
              icon: 'editar.png',
              onclick: `window.es_diaria_editarAtribuicao('${eq}','${rid}','${fid}')`
            })
          + `</div>`;
      // Layout solicitado: Nome (linha 1), (atribuição) (linha 2), Botões (linha 3)
      return `<div class=\"grid-func\" data-funcionario-id=\"${fid}\"><div class=\"func-line\">${nomeEl}</div>${atribEl}${buttons}</div>`;
    }).join('');
    return `<div class=\"rc-nomes\">${rows}</div>`;
  }
    function equipeToolbar(equipeNome, equipeId, escalaId, ativa){
      const n = escapeHtml(equipeNome);
      const eid = escapeHtml(String(equipeId||''));
      const escId = escapeHtml(String(escalaId||''));
      return `<div class=\"eq-toolbar\">`
        + diariaIconButton({
            title: 'Excluir equipe',
            icon: 'excluir.png',
            danger: true,
            onclick: `window.es_diaria_excluirEquipe('${n}')`
          })
        + diariaIconButton({
            title: 'Editar notas',
            icon: 'notas.png',
            onclick: `window.es_diaria_editarNotas('${escId}','${eid}','${n}')`
          })
        + diariaIconButton({
            title: 'Inserir efetivo',
            icon: 'adicionar-pessoa.png',
            onclick: `window.es_diaria_inserirEfetivo('${n}')`
          })
        + diariaIconButton({
            title: 'Inserir recurso',
            icon: 'veiculo.png',
            onclick: `window.es_diaria_inserirRecurso('${n}')`
          })
      + `</div>`;
    }
    function cellEquipe(text, desc, toolbarHtml){
      const nome = `<div class=\"eq-name\">${escapeHtml(text)}</div>`;
      const descricao = desc && String(desc).trim() ? `<div class=\"eq-desc text-muted small\">(${escapeHtml(String(desc))})</div>` : '';
      const tools = toolbarHtml ? `<div class=\"eq-tools mt-1\">${toolbarHtml}</div>` : '';
      return `<div class=\"turno-cell equipe\">${nome}${descricao}${tools}</div>`;
    }
  // Nota: coluna de Ações foi removida; toolbar agora fica sob o nome da equipe
  
  function recursoToolbar(escalaId, equipeId, equipeNome, recursoId, turnoToken){
      const n = escapeHtml(equipeNome);
      const eid = escapeHtml(String(equipeId||''));
      const escId = escapeHtml(String(escalaId||''));
      const rid = escapeHtml(String(recursoId||''));
      return `<div class=\"rc-toolbar\">`
        + diariaIconButton({
            title: 'Editar recurso',
            icon: 'lapisedit.png',
            onclick: `window.es_diaria_editarRecurso('${n}','${rid}')`
          })
        + diariaIconButton({
            title: 'Excluir recurso',
            icon: 'excluir.png',
            danger: true,
            onclick: `window.es_diaria_excluirRecurso('${n}','${rid}')`
          })
        + diariaIconButton({
            title: 'Inserir efetivo',
            icon: 'adicionar-pessoa.png',
            onclick: `window.es_diaria_inserirEfetivoRecurso('${n}','${rid}')`
          })
        + diariaIconButton({
            title: 'Editar notas do recurso',
            icon: 'notas.png',
            onclick: `window.es_diaria_editarNotasRecurso('${escId}','${eid}','${rid}')`
          })
        + diariaIconButton({
            title: 'Editar refeições desta alocação',
            icon: 'refeicao.png',
            onclick: `window.es_diaria_editarRefeicoes('${escId}','${eid}','${rid}','${escapeHtml(String(turnoToken||''))}')`
          })
      + `</div>`;
    }
    function recursoBox(r, turnoToken){
        // Exibir Nome do Recurso (linha 1) e abaixo "Placa - Marca - Modelo" (linha 2) quando disponível
        const nome = comporNomeAmigavelRecurso(r).toString().trim();
        const trio = comporRotuloRecurso(r).toString().trim();
        let badgeInnerHtml = '';
        if(nome && trio && trio !== nome){
          // Duas linhas: nome em pílula e trio abaixo, menor e sutil
          badgeInnerHtml = `<span class=\"badge-recurso rc-badge\">${escapeHtml(nome)}</span>`
            + `<div class=\"rc-badge-sub text-muted small\" style=\"line-height:1.1;\">${escapeHtml(trio)}</div>`;
        } else {
          // Um único texto (nome OU trio OU placa/id)
          // Evita exibir ObjectId puro; prefere placa/código
          const rid = (r.id!=null? String(r.id): '').trim();
          const idMostravel = looksHexObjectId(rid) ? '' : rid;
          const single = nome || trio || r.placa || r.codigo || idMostravel || '-';
          // Se ainda assim ficar vazio por algum motivo, força '-'
          badgeInnerHtml = `<span class=\"badge-recurso rc-badge\">${escapeHtml(single)}</span>`;
        }
        const badge = badgeInnerHtml;
  const actions = recursoToolbar(escalaId, (e.id||e._id||''), String(e.nome||e.id||'-'), r.id||r.placa||'', turnoToken);
  const nomesEl = renderNomesAtribuidos(r, String(e.nome||e.id||'-'), r.id||r.placa||'', turnoToken);
        const notasContent = r.notas? `${escapeHtml(r.notas)}` : '—';
        // Refeições: mostrar somente as da alocação atual (dia/turno)
        let refeicoesSection = '';
        try{
          const refeicoesAll = Array.isArray(r.refeicoes)? r.refeicoes: [];
          // Filtros por contexto atual
          const diaAlvo = currentDiaISO;
          const turnoAlvo = String(turnoToken||'').trim();
          const rangeAlvo = (turnoAlvo.match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
          const matchTurno = (t)=>{
            if(!t) return false;
            const token = String(t||'');
            if(token === turnoAlvo) return true;
            const rg = (token.match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
            return !!(rg && rangeAlvo && rg===rangeAlvo);
          };
          let refeicoes = refeicoesAll.filter(iv=>{
            const diaIv = iv.dia || iv.data || null;
            const turnoIv = iv.turnoId || iv.turno || null;
            if(diaIv){ if(String(diaIv) !== String(diaAlvo)) return false; }
            if(turnoIv){ return matchTurno(turnoIv); }
            // Sem campos de escopo: considerar já pré-filtradas pelo backend
            return true;
          });
          const titulo = `<div class=\"form-text text-muted mt-2 mb-1\">Refeições</div>`;
          if(refeicoes.length){
            const linhas = refeicoes.map(iv=>{
              const ini = escapeHtml(String(iv.ini||''));
              const fim = escapeHtml(String(iv.fim||''));
              const compTxt = (iv && iv.computavel === false) ? 'não computável' : 'computável';
              return `<div class=\"meal-row\">${ini} - ${fim} (${escapeHtml(compTxt)})</div>`;
            }).join('');
            refeicoesSection = `${titulo}<div class=\"rc-meals-box\">${linhas}</div>`;
          } else {
            // Sempre renderizar o contêiner para permitir atualização em tempo real após salvar
            refeicoesSection = `${titulo}<div class=\"rc-meals-box\"><div class=\"text-muted small\">—</div></div>`;
          }
        }catch(_meals){}
        const notasEl = `<div class=\"rc-notes\"><div class=\"rc-box rc-notes-box\">${notasContent}</div>${refeicoesSection}</div>`;
        const head = `<div class=\"rc-head\"><div>Funcionário</div><div>Nome do Recurso</div><div>Ações</div><div>Notas do recurso</div></div>`;
  return `<div class=\"rc-box\" data-recurso-id=\"${escapeHtml(String(r.id||r.placa||''))}\">${head}<div class=\"rc-grid\">${nomesEl}<div class=\"rc-badge\">${badge}</div><div class=\"rc-actions\">${actions}</div>${notasEl}</div></div>`;
      }
    
    function cellNotasEquipe(text){ const n = text? `<div class=\"notas-box\">${escapeHtml(text)}</div>`:'<div class=\"text-muted small\">—</div>'; return `<div class=\"turno-cell\">${n}</div>`; }

    let out='';
  const recursosHtml = recursos.map(r=> recursoBox(r, turnoToken));
    function renderForaBox(nomes){
      if(!nomes || !nomes.length) return '';
      const escId = escapeHtml(String(escalaId||''));
      const eqId = escapeHtml(String(e.id||e._id||''));
      const rows = nomes.map(n=>{
        const rawIsStr = (typeof n === 'string');
        const rawId = rawIsStr ? n : (n?.id || n?.funcionarioId || n?.codigo || n?.matricula || '');
        const id = escapeHtml(String(rawId||''));
        let nome = rawIsStr ? n : (n?.nome || n?.name || n?.funcionarioNome || '');
        if(looksHexObjectId(nome)) nome = '';
        if(looksHexObjectId(rawId)) nome = nome || '—';
        const t = escapeHtml(String(nome||'—'));
        const fid = id;
        const btn = fid ? diariaIconButton({
          title: 'Remover',
          icon: 'menos.png',
          danger: true,
          onclick: `window.es_diaria_removerFora('${escId}','${eqId}','${fid}')`
        }) : '';
          const tools = btn ? `<div class="rc-toolbar ms-2">${btn}</div>` : '';
          return `<div class="grid-func-solo" data-funcionario-id="${fid}"><span class="func-nome" title="${t}">${t}</span>${tools}</div>`;
      }).join('');
      // Usa a mesma grade de 4 colunas dos recursos para alinhar horizontalmente
      const head = `<div class="rc-head"><div>Funcionário</div><div></div><div></div><div></div></div>`;
      const grid = `<div class="rc-grid"><div class="rc-nomes">${rows}</div><div></div><div></div><div></div></div>`;
      const html = `<div class="fora-wrap"><div class="rc-box rc-out">${head}${grid}</div></div>`;
      // Não temos acesso ao elemento aqui (string), faremos a hidratação após inserir no DOM
      return html;
    }
    const foraSection = renderForaBox(fora);
    const stackParts = [];
    if(recursosHtml.length) stackParts.push(...recursosHtml);
    if(foraSection) stackParts.push(foraSection);
    const midCol = stackParts.length
      ? `<div class="rc-stack">${stackParts.join('')}</div>`
      : '<div class="rc-box" style="visibility:hidden;height:2rem;"></div>';
    const combined = `<div class="fr-cell"><div class="fr-grid only-mid"><div class="fr-mid">${midCol}</div></div></div>`;
  const equipeIdVal = e.id || e._id || '';
  const toolbar = equipeToolbar(String(e.nome||equipeIdVal||'-'), (e.id||e._id||''), escalaId);
  out += `<div class=\"turno-row\" data-escala-id=\"${escapeHtml(String(escalaId||''))}\" data-equipe-id=\"${escapeHtml(String(equipeIdVal||''))}\" data-turno-id=\"${escapeHtml(String(turnoToken||''))}\" data-dia=\"${escapeHtml(String(currentDiaISO||''))}\" data-ativa=\"${e.ativa? '1':'0'}\">${cellEquipe(String(e.nome||equipeIdVal||'-'), String(e.descricao||''), toolbar)}<div class=\"turno-cell recurso\">${combined}</div>${cellNotasEquipe(e.notas||'')}</div>`;
    return out;
  }

  // Handlers — excluir alocação da equipe no dia/turno atual
  window.es_diaria_excluirEquipe = async (nome)=>{
    try{
      // Descobrir o contexto a partir do botão clicado: linha, ids e escopo
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para exclusão.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!escalaId || !equipeId || !dia || !turnoId){ alertTop('Dados insuficientes para excluir a equipe.', 'danger'); return; }
      const msg = `Excluir a alocação da equipe "${nome}" em ${br(dia)} no turno ${turnoId}?\nOs recursos, efetivo e refeições deste escopo também serão removidos.`;
      if(!confirm(msg)) return;
      // Preferir POST alias (evita restrições de DELETE em alguns stacks)
      const urlPost = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/alocacao/delete`;
      let r = await fetch(urlPost, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
      if(!r.ok){
        // Fallback: tentar com DELETE + querystring
        const urlDel = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/alocacao?dia=${encodeURIComponent(dia)}&turnoId=${encodeURIComponent(turnoId)}`;
        r = await fetch(urlDel, { method:'DELETE', credentials:'same-origin' });
        if(r.status===405 || r.status===415){
          r = await fetch(urlDel, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
        }
      }
      if(!r.ok){ throw new Error('HTTP '+r.status); }
      const js = await r.json();
      if(js && js.ok){
        // Remover a linha da equipe desta tabela; se ficar sem linhas, coloca placeholder "Sem equipes"
        const table = row.parentElement; // .turno-table
        row.remove();
        const rest = table.querySelectorAll(':scope > .turno-row').length;
        if(rest===0){
          const html = `<div class="turno-row"><div class="turno-cell muted" style="grid-column: 1 / -1">Sem equipes</div></div>`;
          table.insertAdjacentHTML('beforeend', html);
        }
        alertTop('Alocação da equipe excluída.', 'success');
      } else {
        throw new Error('Resposta inválida');
      }
    } catch(e){ console.error('[escala-diaria] excluir equipe', e); alertTop('Erro ao excluir a equipe no dia/turno.', 'danger'); }
  };
  // Abrir modal extraído de notas e salvar via API
  (function(){
     async function salvarNotas(escalaId, equipeId, notas, dia, turnoId){
       const body={ notas, dia, turnoId };
       const urls=[ `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/notas`, `/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/notas` ];
       let lastErr=null;
       for(const u of urls){ try{ const r=await fetch(u,{ method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); if(r.ok){ return await r.json(); } lastErr = new Error('HTTP '+r.status); }catch(e){ lastErr=e; } }
       throw lastErr || new Error('HTTP 500');
     }
    function atualizarCelulaNotasDOM(escalaId, equipeId, notas){ const row=document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`); if(!row) return; const cells=row.querySelectorAll('.turno-cell'); if(!cells||cells.length<3) return; const notasCell=cells[cells.length-1]; notasCell.innerHTML = (!notas||!notas.trim())? '<div class="text-muted small">—</div>' : `<div class=\"notas-box\">${escapeHtml(notas)}</div>`; }
    window.es_diaria_editarNotas = (escalaId, equipeId, equipeNome)=>{
      try{
        const row=document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`);
        const atual=row? (row.querySelector('.turno-cell:last-child .notas-box')?.textContent||'') : '';
        if(window.modalNotasEquipe){
          window.modalNotasEquipe.open(atual, async (novo)=>{
            try{
              const dia = row?.getAttribute('data-dia') || currentDiaISO;
              let turnoId = row?.getAttribute('data-turno-id') || null;
              if(turnoId) turnoId = String(turnoId).trim();
              const js=await salvarNotas(escalaId, equipeId, novo, dia, turnoId);
              if(js && js.ok){ atualizarCelulaNotasDOM(escalaId, equipeId, js.notas ?? novo); window.modalNotasEquipe.close(); alertTop('Notas atualizadas.', 'success'); }
              else { throw new Error('Resposta inválida'); }
            }catch(err){ console.error('[escala-diaria] salvar notas', err); alertTop('Erro ao salvar notas da equipe.', 'danger'); }
          }, { title: 'Editar notas da equipe', max: 1000 });
        } else {
          alertTop('Modal de notas não carregado.', 'danger');
        }
      }catch(e){ console.error('[escala-diaria] abrir modal notas', e); alertTop('Não foi possível abrir o editor de notas.', 'danger'); }
    };
  })();
  window.es_diaria_inserirEfetivo = (nome)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para inserir efetivo.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function')){ alertTop('Modal de pesquisa de efetivo não disponível.', 'danger'); return; }
      window.WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect: async (ret)=>{
        const f = Array.isArray(ret)? ret[0] : ret;
        if(!f || !f.id){ alertTop('Seleção inválida.', 'warning'); return; }
        try{
          const url = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/componentes`;
          const body = { funcionarioId: f.id, nome: f.nome||null, dia, turnoId };
          const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(body) });
          if(!r.ok) throw new Error('HTTP '+r.status);
          const js = await r.json();
          if(!(js && js.ok && js.componente)) throw new Error('Resposta inválida');
          // Garantir seção "sem recurso"
          let grid = row.querySelector('.rc-out .rc-grid .rc-nomes');
          if(!grid){
            const container = row.querySelector('.fr-mid .rc-stack');
            if(container){
              const head = `<div class="rc-head"><div>Funcionário</div><div></div><div></div><div></div></div>`;
              const gridHtml = `<div class="rc-grid"><div class="rc-nomes"></div><div></div><div></div><div></div></div>`;
              const wrap = document.createElement('div'); wrap.className='fora-wrap'; wrap.innerHTML = `<div class="rc-box rc-out">${head}${gridHtml}</div>`; container.appendChild(wrap);
              grid = wrap.querySelector('.rc-nomes');
            }
          }
          if(grid){
            const escId = row.getAttribute('data-escala-id');
            const eqId = row.getAttribute('data-equipe-id');
            const fid = escapeHtml(String(js.componente.id||''));
            const nomeMostrado = escapeHtml(String(js.componente.nome||'—'));
            const btn = fid ? diariaIconButton({
              title: 'Remover',
              icon: 'menos.png',
              danger: true,
              onclick: `window.es_diaria_removerFora('${escapeHtml(escId)}','${escapeHtml(eqId)}','${fid}')`
            }) : '';
            const tools = btn ? `<div class="rc-toolbar ms-2">${btn}</div>` : '';
            const rowHtml = `<div class="grid-func-solo" data-funcionario-id="${fid}"><span class="func-nome" title="${nomeMostrado}">${nomeMostrado}</span>${tools}</div>`;
            grid.insertAdjacentHTML('beforeend', rowHtml);
            // Hidratar nome caso seja ObjectId sem nome
            if(/^[0-9a-fA-F]{24}$/.test(fid) && (!js.componente.nome || js.componente.nome===fid)){
              const el = grid.lastElementChild; const span = el && el.querySelector('.func-nome');
              resolverNomeFuncionario(fid).then(n=>{ if(n && span && span.isConnected){ span.textContent = n; span.setAttribute('title', n); } });
            }
          }
          alertTop('Funcionário inserido na equipe (sem recurso).', 'success');
          limparForaVazios(row);
          sincronizarDiariaLeve(250);
          hydrateNomes(resultado);
        } catch(err){ console.error('[escala-diaria] inserir efetivo', err); alertTop('Erro ao inserir funcionário na equipe.', 'danger'); }
      }});
    }catch(e){ console.error('[escala-diaria] abrir modal inserir efetivo', e); alertTop('Não foi possível abrir a pesquisa de efetivo.', 'danger'); }
  };
  window.es_diaria_inserirRecurso = (nome)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para inserir recurso.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!escalaId || !equipeId || !dia || !turnoId){ alertTop('Dados insuficientes para inserir recurso.', 'danger'); return; }
      // Respeitar bloqueios: se escala fechada e célula (dia+turno) não estiver destravada no estado global, bloquear abertura
      try {
        const st = window.__ESCALA_STATE__ || {};
        const stRaw = String((st.status||'')||'').toLowerCase();
        const desbloqs = (st && st.desbloqueios) || {};
        const diaUnlock = !!desbloqs[dia];
        const celKey = `${dia}__${String(turnoId).replace(/\s*-\s*/, '-')}`;
        const celUnlock = !!desbloqs[celKey];
        const fechada = ['fechada','fechado','validada','validado','publicada','concluida','concluída','concluida'].includes(stRaw);
        if(fechada && !(diaUnlock || celUnlock)){
          alertTop('Edição bloqueada: destrave o dia/turno na aba Alocação para inserir recursos.', 'warning');
          return;
        }
      } catch(_lk){}
      // Guardar contexto desta inserção para atualizar a UI ao salvar no modal
      try { window.__DIARIA_INSERT_CTX__ = { escalaId, equipeId, dia, turnoId, equipeNome: (row.querySelector('.turno-cell.equipe .eq-name')?.textContent || '').trim() }; } catch(_){ }
      if(!(window.__OPEN_MODAL_RECURSO_CUSTOM__ && typeof window.__OPEN_MODAL_RECURSO_CUSTOM__==='function')){
        alertTop('Modal de recurso não está disponível nesta página.', 'danger');
        return;
      }
      // Disponibilizar escalaId para o modal (fallback usado pelo modal)
      try { if(!window.__ESCALA_STATE__) window.__ESCALA_STATE__ = {}; window.__ESCALA_STATE__.escalaId = escalaId; } catch(_){ }
      // Abrir o modal em modo "diária":
      // - Seleciona e bloqueia a equipe
      // - Restringe a alocação à combinação (dia, turnoId) atual
      // - Desativa a aba Atribuições
      // Construir contexto de escala a partir do cartão da diária (nome/descrição e unidade)
      const card = row.closest('.card');
      const tituloSpan = card ? card.querySelector('.escala-card-title span') : null;
      const titulo = tituloSpan ? String(tituloSpan.textContent||'').trim() : '';
      const descEscala = titulo ? titulo.split(' — ')[0].trim() : '';
      const unidadeSel = document.getElementById('filtroUnidade');
      const unidadeTxt = (unidadeSel && unidadeSel.selectedIndex > -1) ? (unidadeSel.options[unidadeSel.selectedIndex].text||'').trim() : '';
      // Inferir tipo a partir do link de detalhes do cartão
      let tipoEsc = 'ORDINÁRIA';
      try {
        const link = card ? card.querySelector('.escala-card-title a[href]') : null;
        const href = link ? String(link.getAttribute('href')||'') : '';
        if(href.includes('/extraordinaria/')) tipoEsc = 'EXTRAORDINÁRIA';
      } catch(_t){}
      const escalaCtx = { descricao: descEscala || null, unidade: unidadeTxt || null, tipo: tipoEsc };
      window.__OPEN_MODAL_RECURSO_CUSTOM__({
        escala: escalaCtx,
        recurso: null,
        lock: { dia, turnoId, equipeId, disableAtribuicao: true }
      });
      // Alternar para a aba Alocação automaticamente para o usuário conferir/salvar
      setTimeout(()=>{
        try {
          const tab = document.getElementById('tab-alocacao');
          if(tab && !tab.hasAttribute('disabled')){
            tab.click();
          }
        } catch(_){ }
      }, 120);
    }catch(e){ console.error('[escala-diaria] abrir modal inserir recurso', e); alertTop('Não foi possível abrir o modal de recurso.', 'danger'); }
  };
  // (Removido) Ativar/Inativar equipe no dia/turno corrente via botão na UI — agora sem botão na toolbar
  // Recursos
  window.es_diaria_editarRecurso = (equipe, recursoId)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para editar o recurso.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!escalaId || !equipeId || !dia || !turnoId || !recursoId){ alertTop('Dados insuficientes para editar o recurso.', 'danger'); return; }
      if(!(window.__OPEN_MODAL_RECURSO_CUSTOM__ && typeof window.__OPEN_MODAL_RECURSO_CUSTOM__==='function')){
        alertTop('Modal de recurso não está disponível nesta página.', 'danger');
        return;
      }
      // Disponibilizar escalaId para o modal (fallback usado pelo modal)
      try { if(!window.__ESCALA_STATE__) window.__ESCALA_STATE__ = {}; window.__ESCALA_STATE__.escalaId = escalaId; } catch(_){ }
      // Buscar detalhes do recurso primeiro para hidratar o modal corretamente (nome, placa, equipeId)
      (async ()=>{
        const tries = [
          `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}`,
          `/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}`
        ];
        let detalhe=null;
        for(const u of tries){
          try { const r = await fetch(u, { credentials:'same-origin' }); if(r.ok){ detalhe = await r.json(); break; } } catch(_e){}
        }
        const rec = detalhe && (detalhe.recurso || detalhe.data?.recurso || detalhe);
        // Heurística local: quando não achou via API (rid pode ser placa), extrair rótulo do badge e inferir placa
        let badgeTxt=null;
        try {
          const box = row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`);
          const badge = box ? box.querySelector('.rc-badge .badge-recurso') : null;
          badgeTxt = badge ? String(badge.textContent||'').trim() : null;
        } catch(_bt){}
        const isHex24 = /^[0-9a-fA-F]{24}$/.test(String(recursoId));
        const looksPlate = (s)=>{ const t=String(s||'').toUpperCase().replace(/\s+/g,''); return /[A-Z]{3}-?\d{4}/.test(t) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(t); };
        const recursoObj = rec && (rec.id || rec.referenciaGestorId || rec.placa)
          ? { id: String(rec.id||rec.referenciaGestorId||recursoId), nome: rec.nome||badgeTxt||null, placa: rec.placa|| (looksPlate(rec.id)? rec.id:null) || null, equipeId: String(rec.equipeId||equipeId) }
          : { id: String(recursoId), nome: badgeTxt||null, placa: !isHex24 && looksPlate(recursoId)? String(recursoId): null, equipeId: String(equipeId) };
        // Construir contexto de escala a partir do cartão da diária (nome/descrição e unidade)
        const card = row.closest('.card');
        const tituloSpan = card ? card.querySelector('.escala-card-title span') : null;
        const titulo = tituloSpan ? String(tituloSpan.textContent||'').trim() : '';
        const descEscala = titulo ? titulo.split(' — ')[0].trim() : '';
        const unidadeSel = document.getElementById('filtroUnidade');
        const unidadeTxt = (unidadeSel && unidadeSel.selectedIndex > -1) ? (unidadeSel.options[unidadeSel.selectedIndex].text||'').trim() : '';
        // Inferir tipo a partir do link de detalhes do cartão
        let tipoEsc = 'ORDINÁRIA';
        try {
          const link = card ? card.querySelector('.escala-card-title a[href]') : null;
          const href = link ? String(link.getAttribute('href')||'') : '';
          if(href.includes('/extraordinaria/')) tipoEsc = 'EXTRAORDINÁRIA';
        } catch(_t){}
        const escalaCtx = { descricao: descEscala || null, unidade: unidadeTxt || null, tipo: tipoEsc };
        // Abrir o modal em modo diária
        window.__OPEN_MODAL_RECURSO_CUSTOM__({
          escala: escalaCtx,
          recurso: recursoObj,
          lock: { dia, turnoId, equipeId, disableAtribuicao: true }
        });
        // Garantir aba Dados Gerais visível para edição de nome/recurso
        setTimeout(()=>{
          try {
            const tabDG = document.getElementById('tab-dadosgerais');
            if(tabDG && !tabDG.hasAttribute('disabled')){ tabDG.click(); }
          } catch(_){ }
        }, 120);
      })();
    }catch(e){ console.error('[escala-diaria] abrir modal editar recurso', e); alertTop('Não foi possível abrir o modal de recurso.', 'danger'); }
  };
  window.es_diaria_excluirRecurso = async (equipe, recursoId)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para excluir o recurso.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
  if(!escalaId || !equipeId || !dia || !turnoId){ alertTop('Dados insuficientes para excluir o recurso.', 'danger'); return; }
  if(!confirm(`Excluir o recurso ${recursoId} de "${equipe}" em ${br(dia)} no turno ${turnoId}?\nAs atribuições e refeições desta alocação serão removidas. Funcionários só serão movidos para "sem recurso" se houver atribuições no período.`)) return;
      // Preferir POST alias
      const urlPost = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/alocacao/delete`;
      let r = await fetch(urlPost, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
      if(!r.ok){
        // fallback DELETE com querystring
        const urlDel = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/alocacao?dia=${encodeURIComponent(dia)}&turnoId=${encodeURIComponent(turnoId)}`;
        r = await fetch(urlDel, { method:'DELETE', credentials:'same-origin' });
        if(r.status===405 || r.status===415){
          r = await fetch(urlDel, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
        }
      }
      if(!r.ok) throw new Error('HTTP '+r.status);
      const js = await r.json();
      if(!(js && js.ok)) throw new Error('Resposta inválida');
      // Atualizar DOM: remover o bloco do recurso
      const recursoBox = row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`);
      if(recursoBox){ recursoBox.remove(); }
  // Atualizar "Funcionários sem recurso": inserir os movidos, se houver
  if(js.moved && Array.isArray(js.moved) && js.moved.length){
        let grid = row.querySelector('.rc-out .rc-grid .rc-nomes');
        // Se ainda não existe a seção de "fora", cria estrutura mínima
        if(!grid){
          const container = row.querySelector('.fr-mid .rc-stack');
          if(container){
            const head = `<div class="rc-head"><div>Funcionário</div><div></div><div></div><div></div></div>`;
            const gridHtml = `<div class="rc-grid"><div class="rc-nomes"></div><div></div><div></div><div></div></div>`;
            const wrap = document.createElement('div');
            wrap.className = 'fora-wrap';
            wrap.innerHTML = `<div class="rc-box rc-out">${head}${gridHtml}</div>`;
            container.appendChild(wrap);
            grid = wrap.querySelector('.rc-nomes');
          }
        }
        if(grid){
          const escId = row.getAttribute('data-escala-id');
          const eqId = row.getAttribute('data-equipe-id');
            js.moved.forEach(it=>{
            const nome = escapeHtml(String(it.nome || '—'));
            const fid = escapeHtml(String(it.id || ''));
            const btn = fid ? diariaIconButton({
              title: 'Remover',
              icon: 'menos.png',
              danger: true,
              onclick: `window.es_diaria_removerFora('${escapeHtml(escId)}','${escapeHtml(eqId)}','${fid}')`
            }) : '';
            const tools = btn ? `<div class="rc-toolbar ms-2">${btn}</div>` : '';
            const rowHtml = `<div class="grid-func-solo" data-funcionario-id="${fid}"><span class="func-nome" title="${nome}">${nome}</span>${tools}</div>`;
            grid.insertAdjacentHTML('beforeend', rowHtml);
          });
        }
      }
  hydrateNomes(resultado);
      const movedCount = (js && Array.isArray(js.moved)) ? js.moved.length : 0;
      if(movedCount > 0){
        alertTop(`Recurso excluído da alocação; ${movedCount} funcionário(s) movido(s) para "sem recurso".`, 'success');
      } else {
        alertTop('Recurso excluído da alocação.', 'success');
      }
    }catch(e){ console.error('[escala-diaria] excluir recurso', e); alertTop('Erro ao excluir recurso da alocação.', 'danger'); }
  };
  // Editar refeições do recurso na alocação atual (dia+turno) — sem extrapolar
  window.es_diaria_editarRefeicoes = (escalaId, equipeId, recursoId, turnoId)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para editar refeições.', 'danger'); return; }
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      turnoId = String(turnoId||row.getAttribute('data-turno-id')||'').trim();
      if(!escalaId || !equipeId || !dia || !turnoId || !recursoId){ alertTop('Dados insuficientes para editar refeições.', 'danger'); return; }
      // Coletar existentes desta alocação, se houver, para pré-preencher
      const box = row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`);
      const existentes = [];
      try{
        const lista = box ? Array.from(box.querySelectorAll('.rc-meals-box .meal-row')) : [];
        // Texto no formato: "HH:MM - HH:MM (computável|não computável)"
        existentes.push(...lista.map(el=>{
          const txt = String(el.textContent||'').trim();
          const m = txt.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*\(([^)]+)\)/);
          if(!m) return null;
          const comp = /não\s*computável/i.test(m[3]) ? false : true;
          return { inicio:m[1], fim:m[2], computavel: comp };
        }).filter(Boolean));
      } catch(_){ }
      abrirModalRefAlocacao({ existentes, onSave: async (lista)=>{
        try{
          // Persistir apenas no escopo desta alocação
          const url = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/refeicoes`;
          const body = { dia, turnoId, lista: Array.isArray(lista)? lista.map(x=> ({ inicio:x.inicio, fim:x.fim, computavel: !!x.computavel })) : [] };
          const r = await fetch(url, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(body) });
          if(!r.ok) throw new Error('HTTP '+r.status);
          const js = await r.json();
          if(!(js && js.ok)) throw new Error('Resposta inválida');
          // Atualizar UI imediata
          try {
            const mealsBox = box && box.querySelector('.rc-meals-box');
            if(mealsBox){
              if(body.lista.length){
                const linhas = body.lista.map(iv=>{
                  const ini = escapeHtml(String(iv.inicio));
                  const fim = escapeHtml(String(iv.fim));
                  const compTxt = iv.computavel ? 'computável' : 'não computável';
                  return `<div class="meal-row">${ini} - ${fim} (${escapeHtml(compTxt)})</div>`;
                }).join('');
                mealsBox.innerHTML = linhas;
              } else {
                mealsBox.innerHTML = '<div class="text-muted small">—</div>';
              }
            }
          } catch(_up){ }
          alertTop('Refeições atualizadas para esta alocação.', 'success');
        } catch(err){ console.error('[escala-diaria] salvar refeições', err); alertTop('Erro ao salvar refeições.', 'danger'); }
      }});
    }catch(e){ console.error('[escala-diaria] abrir modal refeicoes', e); alertTop('Não foi possível abrir o editor de refeições.', 'danger'); }
  };

  // Modal simples para edição de refeições na alocação
  function abrirModalRefAlocacao({ existentes, onSave }){
    let el = document.getElementById('modalRefAloc');
    if(!el){
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="modalRefAloc" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header"><h5 class="modal-title">Refeições da alocação</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
              <div class="modal-body">
                <div id="ref-list"></div>
                <div class="d-flex gap-2 align-items-end mt-2">
                  <div><label class="form-label">Início</label><input type="time" class="form-control" id="ref-ini"></div>
                  <div><label class="form-label">Fim</label><input type="time" class="form-control" id="ref-fim"></div>
                  <div class="form-check ms-2" style="padding-top: 1.95rem;">
                    <input class="form-check-input" type="checkbox" id="ref-comp" checked>
                    <label class="form-check-label" for="ref-comp">Computável</label>
                  </div>
                  <button type="button" class="btn btn-primary ms-auto" id="ref-add">Adicionar</button>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-success" id="ref-save">Salvar</button>
              </div>
            </div>
          </div>
        </div>`);
      el = document.getElementById('modalRefAloc');
    }
    const inst = bootstrap.Modal.getOrCreateInstance(el);
    const listEl = el.querySelector('#ref-list');
    let lista = Array.isArray(existentes)? JSON.parse(JSON.stringify(existentes)) : [];
    const render = ()=>{
      if(!lista.length){ listEl.innerHTML = '<div class="text-muted">Nenhum intervalo adicionado.</div>'; return; }
      listEl.innerHTML = lista.map((iv,idx)=>{
        const compTxt = iv.computavel ? 'computável' : 'não computável';
        return `<div class="d-flex align-items-center justify-content-between border rounded px-2 py-1 mb-1">
          <div>${escapeHtml(iv.inicio)} - ${escapeHtml(iv.fim)} <span class="text-muted">(${escapeHtml(compTxt)})</span></div>
          <div>
            <button class="btn btn-sm btn-outline-secondary me-1" data-edit="${idx}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-del="${idx}"><i class="bi bi-x"></i></button>
          </div>
        </div>`;
      }).join('');
    };
    const iniEl = el.querySelector('#ref-ini');
    const fimEl = el.querySelector('#ref-fim');
    const compEl = el.querySelector('#ref-comp');
    el.querySelector('#ref-add').onclick = ()=>{
      const ini = (iniEl.value||'').trim(); const fim=(fimEl.value||'').trim();
      if(!ini || !fim){ alertTop('Informe início e fim.', 'warning'); return; }
      if(fim <= ini){ alertTop('Término deve ser maior que início.', 'warning'); return; }
      lista.push({ inicio: ini, fim: fim, computavel: !!compEl.checked });
      iniEl.value=''; fimEl.value=''; compEl.checked=true; render();
    };
    el.addEventListener('click', (ev)=>{
      const del = ev.target.closest('[data-del]');
      const edit = ev.target.closest('[data-edit]');
      if(del){ const i = Number(del.getAttribute('data-del')); lista.splice(i,1); render(); }
      if(edit){ const i = Number(edit.getAttribute('data-edit')); const cur = lista[i]; if(cur){ iniEl.value=cur.inicio; fimEl.value=cur.fim; compEl.checked=!!cur.computavel; lista.splice(i,1); render(); } }
    }, { once:false });
    el.querySelector('#ref-save').onclick = ()=>{ try { onSave && onSave(lista); inst.hide(); } catch(e){ console.error(e); } };
    render(); inst.show();
  }
  window.es_diaria_inserirEfetivoRecurso = (equipe, recursoId)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para inserir efetivo no recurso.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!escalaId || !equipeId || !dia || !turnoId || !recursoId){ alertTop('Dados insuficientes para inserir efetivo no recurso.', 'danger'); return; }
      if(!(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function')){ alertTop('Modal de pesquisa de efetivo não disponível.', 'danger'); return; }

      // Abre modal dedicado: escolher funcionário e atribuição
      if(!(window.modalEfetivoRecursoDia && typeof window.modalEfetivoRecursoDia.open==='function')){
        alertTop('Modal de atribuição não carregado.', 'danger');
        return;
      }
      window.modalEfetivoRecursoDia.open({ escalaId, equipeId, recursoId, dia, turnoId }, async ({ funcionarioId, funcionarioNome, atribuicao })=>{
        const f = { id: funcionarioId, nome: funcionarioNome };
        const atrib = atribuicao;

        // Busca atribuições atuais do recurso para fazer merge seguro
        async function carregarRecursoAtual(){
          const tries = [
            `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}`,
            `/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}`
          ];
          for(const u of tries){ try { const r = await fetch(u, { credentials:'same-origin' }); if(r.ok) return await r.json(); } catch(_e){} }
          return null;
        }
        function toArrayAtribuicoes(rec){
          try {
            if(rec && Array.isArray(rec.atribuicoes)){
              // Clonar e garantir consistência de campos
              return rec.atribuicoes.map(a=> a? ({
                membroFuncionarioId: a.membroFuncionarioId || a.funcionarioId || a.funcionario || a.matricula || a.id,
                nome: a.nome || a.funcionarioNome || null,
                atribuicao: a.atribuicao || a.papel || null,
                papel: a.papel || a.atribuicao || null,
                turnoId: a.turnoId || a.turno,
                dia: a.dia || null,
                escopo: a.escopo || 'dia+turno',
                prioridade: typeof a.prioridade==='number'? a.prioridade: 0
              }): a).filter(Boolean);
            }
            const map = rec && rec.atribuicoesRecurso && typeof rec.atribuicoesRecurso==='object' ? rec.atribuicoesRecurso : null;
            if(map){
              const arr=[];
              Object.entries(map).forEach(([alloc, lista])=>{
                const parts=String(alloc).split('__'); if(parts.length!==2) return; const diaK=parts[0]; const turnoK=parts[1];
                if(Array.isArray(lista)){
                  lista.forEach(it=>{ if(!it) return; const fid = it.membroFuncionarioId || it.funcionarioId || it.funcionario || it.matricula || it.funcionario_id; if(!fid) return; const atr = it.atribuicao||it.papel||null; arr.push({ membroFuncionarioId:String(fid), nome: it.nome||it.funcionarioNome||null, atribuicao: atr, papel: atr, turnoId: turnoK, dia: diaK, escopo: it.escopo||'dia+turno', prioridade: typeof it.prioridade==='number'? it.prioridade: 0 }); });
                }
              });
              return arr;
            }
          } catch(_conv){}
          return [];
        }
        try{
          const jsRec = await carregarRecursoAtual();
          const rec = jsRec && (jsRec.recurso || jsRec.data?.recurso || jsRec);
          let atribs = toArrayAtribuicoes(rec);
          // Garantir que não haja duplicidade para o mesmo funcionário na mesma alocação
          const fidStr = String(f.id);
          // Normalizar token de turno para bater com o backend (pega o label do final e remove espaços ao redor do hífen)
          const normTurno = (v)=>{ const s=String(v||''); const last = s.includes('::')? s.split('::').slice(-1)[0] : s; return last.replace(/\s*-\s*/,'-'); };
          const turnoNorm = normTurno(turnoId);
          const idxExist = atribs.findIndex(a=> a && (String(a.membroFuncionarioId||a.funcionarioId||a.funcionario_id)===fidStr) && String(a.dia)===String(dia) && String(normTurno(a.turnoId||a.turno))===String(turnoNorm));
          if(idxExist>=0){
            // Atualiza atribuição/papel
            atribs[idxExist].atribuicao = atrib;
            atribs[idxExist].papel = atrib;
          } else {
            atribs.push({ membroFuncionarioId: fidStr, nome: f.nome||null, atribuicao: atrib, papel: atrib, turnoId: turnoNorm, dia, escopo:'dia+turno', prioridade: 0 });
          }
          // Enviar PUT com a lista completa
          const payload = { recurso: { id: recursoId, equipeId, atribuicoes: atribs } };
          let r = await fetch(`/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload) });
          if(!r.ok){
            // fallback sem prefixo
            r = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload) });
          }
          if(!r.ok){
            // Mensagens específicas
            if(r.status===422){ try{ const er = await r.json(); if(er && er.error==='FUNCIONARIO_INDISPONIVEL'){ alertTop('Funcionário indisponível para esta alocação.', 'warning'); return; } }catch(_){} }
            throw new Error('HTTP '+r.status);
          }
          const js = await r.json();
          if(!(js && js.ok && js.recurso)) throw new Error('Resposta inválida');

          // Atualizar DOM — inserir a linha dentro do recurso alvo
          const recursoBox = row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`);
          if(recursoBox){
            let nomesBox = recursoBox.querySelector('.rc-nomes');
            if(nomesBox){
              // Se estava vazio (placeholder "—"), limpar
              if(nomesBox.classList.contains('text-muted')){ nomesBox.classList.remove('text-muted','small'); nomesBox.innerHTML=''; }
              const fidEsc = escapeHtml(fidStr);
              const nomeMostrado = escapeHtml(String(f.nome||'—'));
              const atribTxt = atrib ? `(${escapeHtml(String(atrib))})` : '';
              const eq = escapeHtml(String(equipe||''));
              const rid = escapeHtml(String(recursoId));
              const btns = `<div class="rc-toolbar ms-2">`
  + diariaIconButton({
      title: 'Remover (excluir da alocação)',
      icon: 'menos.png',
      danger: true,
      onclick: `window.es_diaria_removerAtribuicao('${eq}','${rid}','${fidStr}', false)`
    })
  + diariaIconButton({
      title: 'Extrair efetivo (mover para sem recurso)',
      icon: 'extrair.png',
      onclick: `window.es_diaria_removerAtribuicao('${eq}','${rid}','${fidStr}', true)`
    })
  + diariaIconButton({
      title: 'Editar atribuição',
      icon: 'editar.png',
      onclick: `window.es_diaria_editarAtribuicao('${eq}','${rid}','${fidStr}')`
    })
  + `</div>`;
              const rowHtml = `<div class=\"grid-func\" data-funcionario-id=\"${fidEsc}\"><div class=\"func-line\">`
                + `<span class=\"func-nome\" title=\"${nomeMostrado}\">${nomeMostrado}</span>${btns}</div>`
                + (atribTxt? `<div class=\"func-atr\">${atribTxt}</div>`: '')
                + `</div>`;
              nomesBox.insertAdjacentHTML('beforeend', rowHtml);
              // Hidratar se necessário
              if(/^[0-9a-fA-F]{24}$/.test(fidStr) && (!f.nome || f.nome===fidStr)){
                const el = nomesBox.lastElementChild; const span = el && el.querySelector('.func-nome');
                resolverNomeFuncionario(fidStr).then(n=>{ if(n && span && span.isConnected){ span.textContent=n; span.setAttribute('title', n); } });
              }
            }
          }
          // Remover da lista "fora do recurso" (se presente) para evitar duplicidade visual
          try{
            const foraWrap = row.querySelector('.fora-wrap');
            if(foraWrap){
              const alvo = foraWrap.querySelector(`.grid-func-solo[data-funcionario-id="${cssEscapeSel(String(fidStr))}"]`)
                           || foraWrap.querySelector(`.grid-func[data-funcionario-id="${cssEscapeSel(String(fidStr))}"]`);
              if(alvo) alvo.remove();
            }
          }catch(_){ }

          limparForaVazios(row);
          hydrateNomes(resultado);
          alertTop('Funcionário atribuído ao recurso nesta alocação.', 'success');
          sincronizarDiariaLeve(250);
        } catch(err){ console.error('[escala-diaria] inserir efetivo no recurso', err); alertTop('Erro ao inserir funcionário no recurso.', 'danger'); }
      });
    }catch(e){ console.error('[escala-diaria] abrir inserir efetivo no recurso', e); alertTop('Não foi possível abrir a pesquisa de efetivo.', 'danger'); }
  };
  window.es_diaria_editarNotasRecurso = (escalaId, equipeId, recursoId)=>{
    try{
  const row = document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`);
      const wrap = row ? row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`) : null;
  let atual = wrap ? (wrap.querySelector('.rc-notes .rc-notes-box')?.textContent || '') : '';
  // Se o conteúdo atual é apenas o traço placeholder, abrir o modal vazio
  if(atual && atual.trim() === '—') atual = '';
      if(window.modalNotasEquipe){
        window.modalNotasEquipe.open(atual, async (novo)=>{
          try{
            const url = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/notas`;
            const dia = row?.getAttribute('data-dia') || currentDiaISO;
            let turnoId = row?.getAttribute('data-turno-id') || null;
            if(turnoId) turnoId = String(turnoId).trim();
            const r = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ notas: novo, dia, turnoId }) });
            if(!r.ok) throw new Error('HTTP '+r.status);
            const js = await r.json();
            if(js && js.ok){
              const el = wrap?.querySelector('.rc-notes .rc-notes-box');
              if(el) el.innerHTML = (!js.notas || !String(js.notas).trim()) ? '—' : `${escapeHtml(js.notas)}`;
              window.modalNotasEquipe.close();
              alertTop('Notas do recurso atualizadas.', 'success');
            } else { throw new Error('Resposta inválida'); }
          }catch(err){ console.error('[escala-diaria] salvar notas recurso', err); alertTop('Erro ao salvar notas do recurso.', 'danger'); }
  }, { title: 'Editar notas do recurso', max: 300 });
      } else {
        alertTop('Modal de notas não carregado.', 'danger');
      }
    }catch(e){ console.error('[escala-diaria] abrir modal notas recurso', e); alertTop('Não foi possível abrir o editor de notas do recurso.', 'danger'); }
  };
  // Funcionários dentro do recurso
  window.es_diaria_removerAtribuicao = async (equipe, recursoId, funcionarioId, extrair=false)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para remover a atribuição.', 'danger'); return; }
      if(!funcionarioId || String(funcionarioId).trim()===''){ alertTop('Funcionário inválido para remoção.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!escalaId || !equipeId || !dia || !turnoId){ alertTop('Dados insuficientes para remover a atribuição.', 'danger'); return; }
      const msg = extrair
        ? `Extrair o funcionário ${funcionarioId} do recurso ${recursoId} em ${br(dia)} no turno ${turnoId}? Ele será movido para "sem recurso" nesta alocação.`
        : `Remover (excluir) o funcionário ${funcionarioId} do recurso ${recursoId} em ${br(dia)} no turno ${turnoId}? Esta remoção é definitiva nesta alocação.`;
      if(!confirm(msg)) return;
      // POST alias preferido
      const urlPost = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/atribuicoes/${encodeURIComponent(funcionarioId)}/delete`;
  // escopo: 'alocacao' garante extração pontual (somente nesta alocação)
  let r = await fetch(urlPost, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId, extrair, escopo: 'alocacao' }) });
      if(!r.ok){
        // Fallback DELETE com querystring
        const urlDel = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/atribuicoes/${encodeURIComponent(funcionarioId)}?dia=${encodeURIComponent(dia)}&turnoId=${encodeURIComponent(turnoId)}&extrair=${extrair? '1':'0'}&escopo=alocacao`;
        r = await fetch(urlDel, { method:'DELETE', credentials:'same-origin' });
        if(r.status===405 || r.status===415){
          r = await fetch(urlDel, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId, extrair, escopo: 'alocacao' }) });
        }
      }
      if(!r.ok) throw new Error('HTTP '+r.status);
      const js = await r.json();
      if(!(js && js.ok)) throw new Error('Resposta inválida');
      // Remover visualmente a linha do funcionário dentro do recurso
      const recursoBox = row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`);
      if(recursoBox){
        const el = recursoBox.querySelector(`.rc-nomes .grid-func[data-funcionario-id="${cssEscapeSel(String(funcionarioId))}"]`);
        if(el) el.remove();
      }
  // Adicionar funcionário na seção "sem recurso" apenas quando extrair
  if(extrair && js.moved){
        let grid = row.querySelector('.rc-out .rc-grid .rc-nomes');
        if(!grid){
          const container = row.querySelector('.fr-mid .rc-stack');
          if(container){
            const head = `<div class="rc-head"><div>Funcionário</div><div></div><div></div><div></div></div>`;
            const gridHtml = `<div class="rc-grid"><div class="rc-nomes"></div><div></div><div></div><div></div></div>`;
            const wrap = document.createElement('div'); wrap.className='fora-wrap'; wrap.innerHTML = `<div class="rc-box rc-out">${head}${gridHtml}</div>`; container.appendChild(wrap);
            grid = wrap.querySelector('.rc-nomes');
          }
        }
        if(grid){
          const escId = row.getAttribute('data-escala-id'); const eqId = row.getAttribute('data-equipe-id');
          const nome = escapeHtml(String(js.moved.nome || '—'));
          const fid = escapeHtml(String(js.moved.id || ''));
          const btn = fid ? diariaIconButton({
            title: 'Remover',
            icon: 'menos.png',
            danger: true,
            onclick: `window.es_diaria_removerFora('${escapeHtml(escId)}','${escapeHtml(eqId)}','${fid}')`
          }) : '';
          const tools = btn ? `<div class="rc-toolbar ms-2">${btn}</div>` : '';
          const rowHtml = `<div class="grid-func-solo" data-funcionario-id="${fid}"><span class="func-nome" title="${nome}">${nome}</span>${tools}</div>`;
          grid.insertAdjacentHTML('beforeend', rowHtml);
          // Hidratar nome caso o backend ainda não tenha enviado (evita mostrar ObjectId)
          if(/^[0-9a-fA-F]{24}$/.test(fid) && (!js.moved.nome || js.moved.nome===fid)){
            const el = grid.lastElementChild;
            if(el){
              const span = el.querySelector('.func-nome');
              resolverNomeFuncionario(fid).then(n=>{ if(n && span && span.isConnected){ span.textContent = n; span.setAttribute('title', n); } });
            }
          }
        }
      }
      hydrateNomes(resultado);
  alertTop(extrair ? 'Atribuição removida e funcionário movido para "sem recurso".' : 'Atribuição removida definitivamente desta alocação.', 'success');
    }catch(e){ console.error('[escala-diaria] remover atribuicao', e); alertTop('Erro ao remover a atribuição do recurso.', 'danger'); }
  };
  window.es_diaria_extrairEfetivo = (equipe, recursoId, funcionarioId)=> alertTop(`Extrair efetivo do recurso ${recursoId}: funcionário ${funcionarioId} (equipe ${equipe})`, 'info');
  window.es_diaria_editarAtribuicao = (equipe, recursoId, funcionarioId)=>{
    (async ()=>{
      try{
        const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
        const row = btn ? btn.closest('.turno-row') : null;
        if(!row){ alertTop('Contexto não encontrado para editar atribuição.', 'danger'); return; }
        const escalaId = row.getAttribute('data-escala-id');
        const equipeId = row.getAttribute('data-equipe-id');
        const dia = row.getAttribute('data-dia') || currentDiaISO;
        let turnoId = row.getAttribute('data-turno-id') || '';
        const normTurno = (v)=>{ const s=String(v||''); const last = s.includes('::')? s.split('::').slice(-1)[0] : s; return last.replace(/\s*-\s*/,'-'); };
        const turnoNorm = normTurno(turnoId);
        if(!escalaId || !equipeId || !dia || !turnoNorm || !recursoId || !funcionarioId){ alertTop('Dados insuficientes para editar a atribuição.', 'danger'); return; }
        const atualSpan = row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"] .rc-nomes .grid-func[data-funcionario-id="${cssEscapeSel(String(funcionarioId))}"] .func-atr`);
        let atual = atualSpan ? String(atualSpan.textContent||'').replace(/^\(|\)$/g,'').trim() : '';
        let nova = null;
        try{ nova = window.prompt('Editar atribuição:', atual) || null; } catch(_){ nova = null; }
        if(!nova || !String(nova).trim()){ alertTop('Informe a atribuição.', 'warning'); return; }
        nova = String(nova).trim();
        // Carregar estado atual do recurso
        const urlTry = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}`;
        let resp = await fetch(urlTry, { credentials:'same-origin' });
        if(!resp.ok){ resp = await fetch(urlTry.replace('/escalas/api','/api'), { credentials:'same-origin' }); }
        if(!resp.ok) throw new Error('HTTP '+resp.status);
        const jsRec = await resp.json();
        const rec = jsRec && (jsRec.recurso || jsRec.data?.recurso || jsRec);
        const toArr = (rec)=>{
          if(rec && Array.isArray(rec.atribuicoes)) return rec.atribuicoes.map(a=> a? ({ membroFuncionarioId: a.membroFuncionarioId || a.funcionarioId || a.funcionario || a.matricula || a.id, nome: a.nome || a.funcionarioNome || null, atribuicao: a.atribuicao || a.papel || null, turnoId: a.turnoId || a.turno, dia: a.dia || null, escopo: a.escopo || 'dia+turno', prioridade: typeof a.prioridade==='number'? a.prioridade: 0 }): a).filter(Boolean);
          const map = rec && rec.atribuicoesRecurso && typeof rec.atribuicoesRecurso==='object' ? rec.atribuicoesRecurso : null;
          if(map){ const arr=[]; Object.entries(map).forEach(([alloc, lista])=>{ const p=String(alloc).split('__'); if(p.length!==2) return; const d=p[0]; const t=p[1]; if(Array.isArray(lista)){ lista.forEach(it=>{ const fid=it.membroFuncionarioId || it.funcionarioId || it.funcionario || it.matricula || it.funcionario_id; if(!fid) return; arr.push({ membroFuncionarioId:String(fid), nome: it.nome||it.funcionarioNome||null, atribuicao: it.atribuicao||it.papel||null, turnoId:t, dia:d, escopo: it.escopo||'dia+turno', prioridade: typeof it.prioridade==='number'? it.prioridade: 0 }); }); }}); return arr; } return []; };
        let atribs = toArr(rec);
        const fidStr = String(funcionarioId);
        const idx = atribs.findIndex(a=> a && String(a.membroFuncionarioId||a.funcionarioId||a.funcionario_id)===fidStr && String(a.dia)===String(dia) && String(normTurno(a.turnoId||a.turno))===String(turnoNorm));
  if(idx>=0){ atribs[idx].atribuicao = nova; atribs[idx].papel = nova; }
  else atribs.push({ membroFuncionarioId: fidStr, nome: null, atribuicao: nova, papel: nova, turnoId: turnoNorm, dia, escopo:'dia+turno', prioridade:0 });
        // PUT somente atribuicoes
        const payload = { recurso: { id: recursoId, equipeId, atribuicoes: atribs } };
        let r = await fetch(`/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload) });
        if(!r.ok){ r = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload) }); }
        if(!r.ok) throw new Error('HTTP '+r.status);
        // Atualizar UI
        const box = row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`);
        const gf = box && box.querySelector(`.rc-nomes .grid-func[data-funcionario-id="${cssEscapeSel(String(funcionarioId))}"]`);
        if(gf){ const atr = gf.querySelector('.func-atr'); if(atr) atr.textContent = `(${nova})`; else gf.insertAdjacentHTML('beforeend', `<div class="func-atr">(${escapeHtml(nova)})</div>`); }
        alertTop('Atribuição atualizada.', 'success');
      }catch(e){ console.error('[escala-diaria] editar atribuição', e); alertTop('Erro ao atualizar a atribuição.', 'danger'); }
    })();
  };
  // Remover funcionário sem recurso (componente da equipe)
  window.es_diaria_removerFora = async (escalaId, equipeId, funcionarioId)=>{
    try {
      if(!confirm('Remover este funcionário da equipe?')) return;
      // Tentar remover tanto de componentes quanto de adições pontuais desta alocação
      const row = document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`);
      const dia = row?.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row?.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      let urlMirror = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/componentes/${encodeURIComponent(funcionarioId)}?dia=${encodeURIComponent(dia)}&turnoId=${encodeURIComponent(turnoId)}`;
      let urlCanon = `/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/componentes/${encodeURIComponent(funcionarioId)}?dia=${encodeURIComponent(dia)}&turnoId=${encodeURIComponent(turnoId)}`;
      let r = await fetch(urlMirror, { method:'DELETE', credentials:'same-origin' });
      if(!r.ok && (r.status===405 || r.status===415)){
        r = await fetch(urlMirror, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
      }
      // Fallback: tentar rota canônica se a espelhada não responder OK
      if(!r.ok){
        r = await fetch(urlCanon, { method:'DELETE', credentials:'same-origin' });
        if(!r.ok && (r.status===405 || r.status===415)){
          r = await fetch(urlCanon, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
        }
      }
      if(!r.ok) throw new Error('HTTP '+r.status);
      const js = await r.json();
      if(js && js.ok){
        // Remover o elemento visual do funcionário
        const row = document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`);
        const grid = row ? row.querySelector('.rc-out .rc-grid .rc-nomes') : null;
        if(grid){
          const items = Array.from(grid.querySelectorAll('.grid-func-solo'));
          for(const el of items){
            const nameEl = el.querySelector('.func-nome');
            const btn = el.querySelector('button');
            if(btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(funcionarioId)){
              el.remove();
              break;
            } else if(nameEl && nameEl.textContent && nameEl.textContent.includes(funcionarioId)){
              el.remove();
              break;
            }
          }
          limparForaVazios(row);
        }
        alertTop('Funcionário removido da equipe.', 'success');
      } else { throw new Error('Resposta inválida'); }
    } catch(e){ console.error('[escala-diaria] remover funcionario fora', e); alertTop('Erro ao remover funcionário da equipe.', 'danger'); }
  };

  // Buscar
  async function pesquisar(){
    const unidadeId = $('filtroUnidade').value.trim();
    const incluirFiliais = $('chkIncluirFiliais').checked? '1':'0';
    const ord = $('chkOrd').checked; const ext = $('chkExt').checked;
    const dataBr = $('dataDia').value.trim();
    if(!unidadeId){ alertTop('Selecione uma unidade.', 'warning'); return; }
    if(!dataBr){ alertTop('Selecione a data.', 'warning'); return; }
    const diaISO = isoFromBr(dataBr);
    try {
      resultado.innerHTML = '<div class="text-center text-muted small">Carregando...</div>';
  currentDiaISO = diaISO;
  const params = new URLSearchParams({ unidadeId, dia: diaISO });
      if(incluirFiliais==='1') params.set('filiais','1');
      if(ord && !ext) params.set('classificacao','ORDINÁRIA');
      else if(ext && !ord) params.set('classificacao','EXTRAORDINÁRIA');
      // se ambos marcados ou nenhum, não envia classificacao (retorna ambos)
      const r = await fetch(`/escalas/api/escalas/diaria?${params.toString()}`, { credentials:'same-origin' });
      if(!r.ok) throw new Error('HTTP '+r.status);
      const js = await r.json();
      renderDia(js);
    } catch(e){ console.error('[escala-diaria] erro', e); alertTop('Erro ao carregar escala diária.'); renderVazio(); }
  }

  // Relatório (abre PDF consolidado do dia)
  function abrirRelatorio(){
    // Coletar escalas selecionadas (checkbox marcado)
    const marcados = Array.from(document.querySelectorAll('#resultado .escala-chk:checked'));
    const ids = marcados.map(el=> el.getAttribute('data-id')).filter(Boolean);
    if(ids.length === 0){ alertTop('Nenhuma escala selecionada para o relatório.', 'warning'); return; }
    // Parâmetros da diária
    const diaISO = currentDiaISO || (function(){ try { const v=document.getElementById('dataDia')?.value||''; const m=v.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m? `${m[3]}-${m[2]}-${m[1]}`: null; } catch{ return null; } })();
    if(!diaISO){ alertTop('Informe a data da diária.', 'warning'); return; }
    // Abrir relatório diário consolidado (uma única aba) — passando todos os IDs por querystring
    const qs = new URLSearchParams({ ids: ids.join(','), dia: diaISO }).toString();
  // Usar rota com nome amigável no caminho para o viewer exibir "Relatorio.pdf"
  const url = `/escalas/relatorios/diaria/Relatorio.pdf?${qs}`;
    window.open(url, '_blank');
  }

  // Wire
  function init(){
    initCalendars();
    carregarUnidades();

    const btnPesq = $('btnPesquisar');
    if(btnPesq){
      btnPesq.addEventListener('click', (ev)=>{
        try { ev.preventDefault(); } catch(_){ }

        const prevHtml = btnPesq.innerHTML;
        btnPesq.disabled = true;
        btnPesq.innerHTML = 'Carregando…';

        setTimeout(async ()=>{
          console.time('[diaria] pesquisar');
          try {
            await pesquisar();
            scheduleHydrate(resultado);
          } finally {
            console.timeEnd('[diaria] pesquisar');
            btnPesq.disabled = false;
            btnPesq.innerHTML = prevHtml;
          }
        }, 0);
      });
    }

    const btnRelatorio = $('btnRelatorio');
    if(btnRelatorio){
      btnRelatorio.onclick = abrirRelatorio;
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();

  // Delegação: recolher/expandir conteúdo da escala
  if(resultado){
    resultado.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('.btn-toggle-escala');
      if(!btn) return;
      const targetId = btn.getAttribute('data-target');
      if(!targetId) return;
      const el = document.getElementById(targetId);
      if(!el) return;
      const isHidden = el.classList.contains('d-none');
      if(isHidden){
        el.classList.remove('d-none');
        btn.setAttribute('aria-expanded','true');
        btn.innerHTML = `<img src="${DIARIA_ICON_BASE}zoommenos.png" alt="Recolher" class="diaria-toggle-icon">`;
        btn.setAttribute('title','Recolher');
        try { scheduleHydrate(el); } catch(_) {}
      } else {
        el.classList.add('d-none');
        btn.setAttribute('aria-expanded','false');
        btn.innerHTML = `<img src="${DIARIA_ICON_BASE}zoommais.png" alt="Expandir" class="diaria-toggle-icon">`;
        btn.setAttribute('title','Expandir');
      }
    });
  }

  // UI live-update: quando o modal salvar o recurso, inserir o box na equipe/turno/dia atuais
  document.addEventListener('escala:recurso-salvo', (ev)=>{
    try {
      try { console.debug('[escala-diaria] evento recebido: escala:recurso-salvo'); } catch(_){ }
      const ctx = window.__DIARIA_INSERT_CTX__ || null;
      const recurso = ev && ev.detail ? ev.detail.recurso : null;
      if(!recurso){ return; }
      if(!ctx){
        // Sem contexto (inserção fora do fluxo da diária): recarrega a pesquisa para refletir mudanças
        try { alertTop('Sincronizando diária…', 'info', 1500); if(typeof pesquisarPreservandoExpansao === 'function') pesquisarPreservandoExpansao(); } catch(_){ }
        return;
      }
      // Tolerância: o modal pode ter normalizado equipeId para um ObjectId, enquanto a diária usa um rótulo (ex.: "A").
      // Se houver divergência de id, ainda assim seguimos pelo contexto capturado ao abrir o modal.
      const recEquipeId = recurso.equipeId || recurso.equipe_id || recurso.equipe || null;
      const matchEquipe = (!recEquipeId)
        || (String(recEquipeId) === String(ctx.equipeId))
        || ((recurso.equipeNome||'').toString().trim().toLowerCase() === (ctx.equipeNome||'').toString().trim().toLowerCase());
      if(!matchEquipe){
        try { console.debug('[escala-diaria] Ignorando mismatch de equipeId (payload vs contexto), usando contexto da diária para inserir.'); } catch(_){ }
      }
      const row = document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(ctx.escalaId))}"][data-equipe-id="${cssEscapeSel(String(ctx.equipeId))}"][data-turno-id="${cssEscapeSel(String(ctx.turnoId))}"]`);
      if(!row){
        // Como fallback, reconsultar a diária para atualizar a tela inteira
        try { alertTop('Sincronizando diária…', 'info', 1500); if(typeof pesquisarPreservandoExpansao === 'function') pesquisarPreservandoExpansao(); } catch(_){ }
        return;
      }
      // Garantir que exista o container de pilha de recursos; quando a equipe não possui recursos, a UI exibe um placeholder sem .rc-stack
      let stack = row.querySelector('.fr-mid .rc-stack');
      if(!stack){
        const frMid = row.querySelector('.turno-cell.recurso .fr-mid');
        if(frMid){
          frMid.innerHTML = '<div class="rc-stack"></div>';
          stack = frMid.querySelector('.rc-stack');
        }
      }
      if(!stack){
        // Como último recurso, sincronizar tudo
        try { alertTop('Sincronizando diária…', 'info', 1500); if(typeof pesquisarPreservandoExpansao === 'function') pesquisarPreservandoExpansao(); } catch(_){ }
        return;
      }
  const rid = String(recurso.id || recurso._id || recurso.referenciaGestorId || recurso.placa || '').trim();
      if(!rid) return;
      const existenteBox = stack.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(rid)}"]`);
      if(existenteBox){
        // Atualizar somente o rótulo do recurso (badge) quando já existir na UI
        const novoRotulo = String(recurso.nome || recurso.placa || rid);
        const badgeSpan = existenteBox.querySelector('.rc-badge .badge-recurso') || existenteBox.querySelector('.badge-recurso');
        if(badgeSpan){ badgeSpan.textContent = novoRotulo; }
        alertTop('Recurso atualizado nesta alocação.', 'success');
        try { hydrateNomes(resultado); } catch(_){ }
        window.__DIARIA_INSERT_CTX__ = null;
        // Sincronização leve com o backend para refletir qualquer normalização posterior
        try { setTimeout(()=>{ try { if(typeof pesquisar==='function'){ pesquisar(); } } catch(_r){} }, 300); } catch(_sync){}
        return;
      }
      const escId = ctx.escalaId; const eqId = ctx.equipeId; const eqNome = ctx.equipeNome || '';
      const badgeInner = `<span class="badge-recurso rc-badge">${escapeHtml(String(recurso.nome || recurso.placa || rid))}</span>`;
      const actions = `<div class="rc-toolbar">`
  + diariaIconButton({
      title: 'Editar recurso',
      icon: 'lapisedit.png',
      onclick: `window.es_diaria_editarRecurso('${escapeHtml(eqNome)}','${escapeHtml(rid)}')`
    })
  + diariaIconButton({
      title: 'Excluir recurso',
      icon: 'excluir.png',
      danger: true,
      onclick: `window.es_diaria_excluirRecurso('${escapeHtml(eqNome)}','${escapeHtml(rid)}')`
    })
  + diariaIconButton({
      title: 'Inserir efetivo',
      icon: 'adicionar-pessoa.png',
      onclick: `window.es_diaria_inserirEfetivoRecurso('${escapeHtml(eqNome)}','${escapeHtml(rid)}')`
    })
  + diariaIconButton({
      title: 'Editar notas do recurso',
      icon: 'notas.png',
      onclick: `window.es_diaria_editarNotasRecurso('${escapeHtml(escId)}','${escapeHtml(eqId)}','${escapeHtml(rid)}')`
    })
  + `</div>`;
      const head = `<div class="rc-head"><div>Funcionário</div><div>Nome do Recurso</div><div>Ações</div><div>Notas do recurso</div></div>`;
      const nomes = `<div class="rc-nomes text-muted small">—</div>`;
  // No modo diária, o recurso recém-inserido não deve exibir refeições
  const refeicoes = [];
      const refTitulo = `<div class="form-text text-muted mt-2 mb-1">Refeições</div>`;
      let refSec = refTitulo + `<div class="text-muted small">—</div>`;
      if(refeicoes.length){
        const linhas = refeicoes.map(iv=>{
          const ini = escapeHtml(String(iv.ini||''));
          const fim = escapeHtml(String(iv.fim||''));
          const compTxt = (iv && iv.computavel === false) ? 'não computável' : 'computável';
          return `<div class=\"meal-row\">${ini} - ${fim} (${escapeHtml(compTxt)})</div>`;
        }).join('');
        refSec = refTitulo + `<div class=\"rc-meals-box\">${linhas}</div>`;
      }
      const notasEl = `<div class="rc-notes"><div class="rc-box rc-notes-box">—</div>${refSec}</div>`;
      const boxHtml = `<div class="rc-box" data-recurso-id="${escapeHtml(rid)}">${head}<div class="rc-grid">${nomes}<div class="rc-badge">${badgeInner}</div><div class="rc-actions">${actions}</div>${notasEl}</div></div>`;
      const fora = stack.querySelector('.fora-wrap');
      if(fora){ fora.insertAdjacentHTML('beforebegin', boxHtml); }
      else { stack.insertAdjacentHTML('afterbegin', boxHtml); }
      alertTop('Recurso inserido nesta alocação.', 'success');
      try { hydrateNomes(resultado); } catch(_){ }
      window.__DIARIA_INSERT_CTX__ = null;
      // Sincronização leve com o backend para refletir qualquer normalização de IDs/turnos
      try {
        setTimeout(()=>{ try { if(typeof pesquisar==='function'){ pesquisar(); } } catch(_r){} }, 300);
      } catch(_sync){}
    } catch(err){ console.warn('[escala-diaria] atualizar UI pós recurso salvo falhou', err); }
  });
})();
