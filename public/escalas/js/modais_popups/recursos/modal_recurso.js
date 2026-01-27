(function(){
  const modalId = 'modalRecurso';
  // Estilos dinâmicos injetados (uma única vez) para padronizar larguras
  (function ensureStyles(){
    if(document.getElementById('recurso-matriz-style')) return;
    const st=document.createElement('style');
    st.id='recurso-matriz-style';
     st.textContent = `
      #${modalId} table .col-turno { width:150px; min-width:150px; max-width:150px; }
      #${modalId} table .col-dia { width:32px; min-width:32px; max-width:32px; padding:2px 4px; }
      #${modalId} table .col-dia input[type=checkbox]{ margin:0; transform:scale(.95); }
      #${modalId} .table-fixed-layout { table-layout:fixed; }
      #${modalId} .table-fixed-layout th, 
      #${modalId} .table-fixed-layout td { overflow:hidden; text-overflow:ellipsis; }
      #${modalId} table .dia-fds { background:#f8f9fa; }
      #${modalId} .acoes-grupo-aloc { position:absolute; top:4px; right:8px; display:flex; gap:4px; }
      #${modalId} .bloco-grupo-aloc { position:relative; }
      #${modalId} .badge-alterado { font-size:.65rem; position:absolute; top:4px; left:8px; }
        /* Abas de atribuição personalizadas */
        #${modalId} #listaAbasAtribuicao { border-bottom:1px solid #dee2e6; }
        #${modalId} #listaAbasAtribuicao .nav-link { 
          border:1px solid #dee2e6; 
          border-bottom:1px solid #dee2e6; 
          background:#f8f9fa; 
          margin-right:4px; 
          border-top-left-radius:.35rem; 
          border-top-right-radius:.35rem; 
          line-height:1.1; 
          font-size:.72rem; 
          padding:.35rem .5rem; 
          color:#495057;
          min-width:80px;
          text-align:center;
        }
        #${modalId} #listaAbasAtribuicao .nav-link:hover { background:#e9ecef; color:#212529; }
        #${modalId} #listaAbasAtribuicao .nav-link.active { 
          background:#fff; 
          border-color:#adb5bd #adb5bd #fff; 
          color:#0d6efd; 
          font-weight:600; 
          box-shadow:0 -1px 0 #fff inset; 
        }
        #${modalId} #wrapAbasAtribuicao { scrollbar-height:thin; }
        #${modalId} #wrapAbasAtribuicao::-webkit-scrollbar { height:8px; }
        #${modalId} #wrapAbasAtribuicao::-webkit-scrollbar-track { background:transparent; }
        #${modalId} #wrapAbasAtribuicao::-webkit-scrollbar-thumb { background:#ced4da; border-radius:4px; }
        #${modalId} #wrapAbasAtribuicao::-webkit-scrollbar-thumb:hover { background:#adb5bd; }
  /* Centralização de dados das tabelas de refeição */
  #${modalId} #tabelaRefeicoesRecurso th, 
  #${modalId} #tabelaRefeicoesRecurso td,
  #${modalId} #tabelaIntervalosRefeicao th,
  #${modalId} #tabelaIntervalosRefeicao td { text-align:center; vertical-align:middle; }
  #${modalId} #tabelaIntervalosRefeicao input[type=time] { text-align:center; }
  /* Remover ícone padrão de time (Webkit) sem remover funcionalidade */
  #${modalId} input[type=time]::-webkit-calendar-picker-indicator { display:none; }
  #${modalId} input[type=time] { -moz-appearance:textfield; }
  /* Forçar sem spinners extras */
  #${modalId} input[type=time]::-webkit-inner-spin-button, 
  #${modalId} input[type=time]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        /* Classe específica para reforçar remoção do ícone em diferentes navegadores */
        #${modalId} .input-time-simples { position:relative; }
        #${modalId} .input-time-simples::-webkit-calendar-picker-indicator { opacity:0; pointer-events:none; }
        #${modalId} .input-time-simples::-ms-expand { display:none; }
        #${modalId} .input-time-simples::-ms-clear { display:none; }
        /* Firefox fallback: usar font monospace para consistência visual */
        @-moz-document url-prefix() {
          #${modalId} .input-time-simples { font-family:monospace; }
        }
        /* Colunas resultados busca de recurso */
        #modalLocalizarRecurso table thead th:nth-child(1),
        #modalLocalizarRecurso td.col-placa { width:110px; max-width:110px; }
        #modalLocalizarRecurso table thead th:nth-child(3),
        #modalLocalizarRecurso td.col-unidade { width:190px; max-width:190px; }
        #modalLocalizarRecurso td.col-acoes { width:110px; max-width:110px; }
        #modalLocalizarRecurso td.col-desc { min-width:160px; }
     `;
     document.head.appendChild(st);
   })();

  let modalEl, bsModal;
  let state = {
    escala: null,
    recurso: null,
    atribuicoes: {},
    refeicoes: {},
    matrizAlocacao: {},
    subAbasGeradas: false,
    __refPend: [] // refeicoes pendentes (sem turno) -> [{ dia, inicio, fim, computavel }]
  };
  // Flag para não registrar múltiplos listeners de navegação das abas de atribuição
  let abasAtribuicaoListenerBound = false;

  function $(sel,ctx){ return (ctx||document).querySelector(sel); }
  function $all(sel,ctx){ return Array.from((ctx||document).querySelectorAll(sel)); }

  function preencherCabecalho(){
    const box = $('#infoEscalaRecurso'); if(!box || !state.escala) return;
    box.querySelector('[data-field="tipo"]').textContent = state.escala.tipo || '-';
    // Período pode vir como string ou objeto { ini, fim }
    try {
      const p = state.escala.periodo;
      const perTxt = (p && typeof p==='object' && (p.ini||p.inicio) && (p.fim||p.termino))
        ? `${p.ini||p.inicio} à ${p.fim||p.termino}`
        : (typeof p==='string'? p: null);
      box.querySelector('[data-field="periodo"]').textContent = perTxt || '-';
    } catch(_){ box.querySelector('[data-field="periodo"]').textContent = state.escala.periodo || '-'; }
    // Unidade pode vir do contexto global
    try {
      let uni = state.escala.unidade || null;
      if(!uni){ const u=window.__ESCALA_STATE__||{}; const cod=u.unidadeCodigo; const nome=u.unidade||u.unidadeNome; uni = nome? (cod? `${cod} - ${nome}`: nome): null; }
      box.querySelector('[data-field="unidade"]').textContent = uni || '-';
    } catch(_){ box.querySelector('[data-field="unidade"]').textContent = state.escala.unidade || '-'; }
    try {
      const g = (window.__ESCALA_STATE__||{});
      const desc = state.escala.descricao || state.escala.nome || g.descricao || g.nome || g.escalaNome || g.escalaDescricao || g.descricaoEscala || g.titulo || g.label || '';
      box.querySelector('[data-field="descricao"]').textContent = desc || '-';
    } catch(_){ box.querySelector('[data-field="descricao"]').textContent = state.escala.descricao || '-'; }
    const labelRec = box.querySelector('[data-field="recursoLabel"]');
    // Montar como "Nome do recurso (Recurso)" usando os campos da aba Dados Gerais, sem usar fallback do nome no campo Recurso
    try {
      const nomeDG = (document.getElementById('recursoNome')?.value || state.recurso?.nome || '').toString().trim();
      // Campo "Recurso" visual em Dados Gerais (ex.: "PLACA - Marca - Modelo")
      let recursoDG = (document.getElementById('campoPesquisarRecurso')?.value || '').toString().trim();
      if(!recursoDG){
        // Só usar rótulo composto se houver pelo menos placa/marca/modelo; nunca usar o nome como fallback aqui
        const r = state.recurso || {};
        const hasTrio = !!(String(r.placa||'').trim() || String(r.marca||'').trim() || String(r.modelo||'').trim());
        if(hasTrio){
          const comp = (comporRotuloRecurso(r) || '').toString().trim();
          const nomeR = (r.nome||'').toString().trim();
          if(comp && comp !== nomeR) recursoDG = comp; // evita "Nome (Nome)"
        }
      }
      let texto = '';
      if(nomeDG && recursoDG){ texto = `${nomeDG} (${recursoDG})`; }
      else if(nomeDG){ texto = nomeDG; }
      else if(recursoDG){ texto = recursoDG; }
      labelRec.textContent = texto || '(novo)';
    } catch(_){
      // fallback conservador: evitar usar apenas nome para o campo Recurso
      const r = state.recurso || {};
      const hasTrio = !!(String(r.placa||'').trim() || String(r.marca||'').trim() || String(r.modelo||'').trim());
      labelRec.textContent = hasTrio ? (comporRotuloRecurso(state.recurso) || '(novo)') : ((state.recurso?.nome)||'(novo)');
    }
    const uniLbl = document.getElementById('recursoUnidadeLabel');
    const perLbl = document.getElementById('recursoPeriodoLabel');
    if(uniLbl) uniLbl.textContent = state.escala.unidade || '-';
    if(perLbl) perLbl.textContent = state.escala.periodo || '-';
  }

  function comporRotuloRecurso(r){
    if(!r) return '';
    let placa = r.placa || r.codigo || '';
    let marca = r.marca || r.fabricante || '';
    let modelo = r.modelo || r.model || '';
    // Fallback: se marca/modelo não vieram no objeto, tentar hiddens do formulário
    try {
      if(!marca){ const hM = document.getElementById('recursoSelecionadoMarca'); if(hM && hM.value) marca = hM.value; }
      if(!modelo){ const hMd = document.getElementById('recursoSelecionadoModelo'); if(hMd && hMd.value) modelo = hMd.value; }
    } catch(_){ }
    const trioParts = [placa, marca, modelo].filter(p=> p!=null && String(p).trim()!=='');
    if(placa && (marca || modelo)){
      return [placa, marca, modelo].filter(p=> p!=null && String(p).trim()!=='').join(' - ');
    }
    // Fallback conservador: priorizar apenas a placa quando não houver marca/modelo
    if(trioParts.length){ return trioParts.join(' - '); }
    if(placa){ return placa; }
    const nomeDesc = r.nome || r.descricao || r.nomeRecurso || r.titulo || r.label || '';
    return nomeDesc;
  }

  // Tenta preencher marca/modelo no state.recurso quando faltarem, a partir de fontes disponíveis no front
  function enriquecerMarcaModeloSeFaltando(){
    try {
      if(!state || !state.recurso) return;
      let mudou=false;
      const rid = state.recurso.id || state.recurso._id || state.recurso.referenciaGestorId;
      // 1) Buscar em __ESCALA_STATE__.recursos por id ou placa
      try {
        const lista = Array.isArray(window.__ESCALA_STATE__?.recursos) ? window.__ESCALA_STATE__.recursos : [];
        const placaUp = (state.recurso.placa||'').toUpperCase();
        const hit = lista.find(r=> (r && ((r.id||r._id||r.referenciaGestorId)===rid)) || (placaUp && String(r?.placa||'').toUpperCase()===placaUp));
        if(hit){
          if(!state.recurso.marca && (hit.marca||hit.fabricante||hit.marca_veiculo||hit.marcaVeiculo||hit.marcaDescricao)){
            state.recurso.marca = hit.marca || hit.fabricante || hit.marca_veiculo || hit.marcaVeiculo || hit.marcaDescricao; mudou=true;
          }
          if(!state.recurso.modelo && (hit.modelo||hit.model||hit.modelo_veiculo||hit.modeloVeiculo)){
            state.recurso.modelo = hit.modelo || hit.model || hit.modelo_veiculo || hit.modeloVeiculo; mudou=true;
          }
        }
      } catch(_){ }
      // 1.2) Buscar em __ESCALA_STATE__.equipes[].recursos
      try {
        if((!state.recurso.marca || !state.recurso.modelo) && Array.isArray(window.__ESCALA_STATE__?.equipes)){
          const placaUp = (state.recurso.placa||'').toUpperCase();
          for(const eq of window.__ESCALA_STATE__.equipes){
            if(!Array.isArray(eq.recursos)) continue;
            const r2 = eq.recursos.find(r=> (r && ((r.id||r._id||r.referenciaGestorId)===rid)) || (placaUp && String(r?.placa||'').toUpperCase()===placaUp));
            if(r2){
              if(!state.recurso.marca && (r2.marca||r2.fabricante||r2.marca_veiculo||r2.marcaVeiculo||r2.marcaDescricao)){
                state.recurso.marca = r2.marca || r2.fabricante || r2.marca_veiculo || r2.marcaVeiculo || r2.marcaDescricao; mudou=true;
              }
              if(!state.recurso.modelo && (r2.modelo||r2.model||r2.modelo_veiculo||r2.modeloVeiculo)){
                state.recurso.modelo = r2.modelo || r2.model || r2.modelo_veiculo || r2.modeloVeiculo; mudou=true;
              }
              break;
            }
          }
        }
      } catch(_e2){ }
      // 2) Fallback dos inputs hidden, caso tenham sido preenchidos por um fluxo anterior
      try {
        if(!state.recurso.marca){ const hM=document.getElementById('recursoSelecionadoMarca'); if(hM && hM.value){ state.recurso.marca=hM.value; mudou=true; } }
        if(!state.recurso.modelo){ const hMd=document.getElementById('recursoSelecionadoModelo'); if(hMd && hMd.value){ state.recurso.modelo=hMd.value; mudou=true; } }
      } catch(_){ }
      // 3) Fallback: tentar extrair de um rótulo/descrição "PLACA - Marca - Modelo"
      try {
        if((!state.recurso.marca || !state.recurso.modelo)){
          const lbl = (state.recurso.nome||'') + ' ' + (state.recurso.descricao||'') + ' ' + (document.getElementById('campoPesquisarRecurso')?.value||'');
          const m = String(lbl).match(/^[A-Z0-9-]{3,}\s*-\s*([^\-]+?)\s*-\s*(.+)$/i);
          if(m){
            const marcaS = m[1].trim(); const modeloS = m[2].trim();
            if(!state.recurso.marca && marcaS){ state.recurso.marca = marcaS; mudou=true; }
            if(!state.recurso.modelo && modeloS){ state.recurso.modelo = modeloS; mudou=true; }
          }
        }
      } catch(_p){ }
      if(mudou){
        try { const hM=document.getElementById('recursoSelecionadoMarca'); if(hM) hM.value = state.recurso.marca||''; } catch(_){ }
        try { const hMd=document.getElementById('recursoSelecionadoModelo'); if(hMd) hMd.value = state.recurso.modelo||''; } catch(_){ }
        try { atualizarRotuloCampoRecurso(); } catch(_){ }
      }
    } catch(err){ console.warn('[modal_recurso] enriquecerMarcaModeloSeFaltando falhou', err); }
  }

  // Atualiza o campo visual do recurso e o cabeçalho com base no state.recurso
  function atualizarRotuloCampoRecurso(){
    try {
      const campoPlaca = document.getElementById('campoPesquisarRecurso');
      if(campoPlaca){
        const r = state.recurso || {};
        const hasAny = !!(String(r.placa||'').trim() || String(r.marca||'').trim() || String(r.modelo||'').trim());
        // Apenas preencher o input visual se houver dados de placa/marca/modelo; não usar o nome como fallback
        campoPlaca.value = hasAny ? (comporRotuloRecurso(r) || '') : '';
      }
      // Sincronizar hiddens
      try { const hP=document.getElementById('recursoSelecionadoPlaca'); if(hP) hP.value = state.recurso?.placa||''; } catch(_){ }
      try { const hM=document.getElementById('recursoSelecionadoMarca'); if(hM) hM.value = state.recurso?.marca||''; } catch(_){ }
      try { const hMd=document.getElementById('recursoSelecionadoModelo'); if(hMd) hMd.value = state.recurso?.modelo||''; } catch(_){ }
      // Atualizar cabeçalho
      try { preencherCabecalho(); } catch(_){ }
    } catch(_e){ }
  }

  // Seleciona um option no select quando disponível (com algumas tentativas)
  function selecionarEquipeQuandoDisponivel(equipeId, tentativas=6, atraso=80){
    if(!equipeId) return;
    let tries=0;
    const tick = ()=>{
      tries++;
      try {
        const sel=document.getElementById('recursoEquipeSelect');
        if(sel){
          const opt = sel.querySelector(`option[value="${CSS.escape(String(equipeId))}"]`);
          if(opt){ sel.value = String(equipeId); return; }
        }
      } catch(_){ }
      if(tries < tentativas){ setTimeout(tick, atraso); }
    };
    tick();
  }

  // Busca detalhes do recurso no backend para preencher dados gerais (placa/marca/modelo/equipeId), se possível
  function hidratarDadosGeraisRecursoSePossivel(){
    try {
      const rid = state.recurso?.id || state.recurso?._id || state.recurso?.referenciaGestorId || state.recurso?.referencia_gestor_id;
      let eid = state.recurso?.equipeId || document.getElementById('recursoEquipeSelect')?.value || null;
      const escalaId = window.__ESCALA_STATE__?.escalaId || (function(){ try { const u=new URL(location.href); return u.searchParams.get('id'); } catch(_){ return null; } })();
      if(!rid || !escalaId) return;
      // Resolver equipeId via GET da escala se necessário
      const resolverEq = ()=>{
        return new Promise((resolve)=>{
          if(eid){ resolve(eid); return; }
          try {
            const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
            fetch(base + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' })
              .then(r=> r.ok? r.json(): null).then(js=>{
                const d = js && (js.data||js);
                if(d && Array.isArray(d.equipes)){
                  // Aceitar recursos identificados por id, referenciaGestorId ou código/placa
                  const eq = d.equipes.find(eq=> Array.isArray(eq.recursos) && eq.recursos.some(x=> (x.id||x._id||x.referenciaGestorId||x.referencia_gestor_id||x.codigo) == rid));
                  if(eq){ eid = eq.id || eq._id || eid; }
                }
                resolve(eid);
              }).catch(()=> resolve(eid));
          } catch(_){ resolve(eid); }
        });
      };
      resolverEq().then((eidResolved)=>{
        if(!eidResolved) return;
        const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        const url = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eidResolved) + '/recursos/' + encodeURIComponent(rid);
        fetch(url, { credentials:'same-origin' })
          .then(r=> r.ok? r.json(): null)
          .then(js=>{
            const rec = js && (js.recurso || (js.data && js.data.recurso) || js);
            if(rec){
              // Mesclar dados úteis
              const merged = { ...state.recurso };
              if(rec.placa && !merged.placa) merged.placa = rec.placa;
              if((rec.marca||rec.fabricante) && !merged.marca) merged.marca = rec.marca || rec.fabricante;
              if((rec.modelo||rec.model) && !merged.modelo) merged.modelo = rec.modelo || rec.model;
              if(rec.equipeId && !merged.equipeId) merged.equipeId = rec.equipeId;
              state.recurso = merged;
              // Atualizar UI: recarregar e selecionar equipe correta
              try {
                carregarEquipes();
                setTimeout(()=>{
                  try {
                    if(state.recurso?.equipeId){
                      const sel=document.getElementById('recursoEquipeSelect');
                      if(sel){ sel.value = String(state.recurso.equipeId); }
                      try { aplicarRegraBloqueioEquipe(); } catch(_){ }
                    }
                  } catch(_){ }
                }, 50);
              } catch(_){ }
              atualizarRotuloCampoRecurso();
            }
          }).catch(()=>{});
      });
    } catch(err){ console.warn('[modal_recurso] hidratarDadosGeraisRecursoSePossivel falhou', err); }
  }

  // Busca marca/modelo por placa usando os mesmos endpoints do modal de localização
  async function buscarMarcaModeloPorPlacaSeNecessario(){
    try {
      if(!state?.recurso || state.recurso.marca && state.recurso.modelo) return;
      if(state.__mmFetchDone) return; // evitar repetição
      const placa = (state.recurso.placa||'').trim(); if(!placa) return;
      const up = placa.toUpperCase();
      const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      const urls = [ `${base}/api/recursos?placa=${encodeURIComponent(up)}`, `/gestor/api/recursos?placa=${encodeURIComponent(up)}` ];
      let data=null;
      for(const u of urls){
        try {
          const r = await fetch(u, { headers:{ 'Accept':'application/json','X-Requested-With':'fetch' }, credentials:'same-origin' });
          if(!r.ok) continue;
          const ct = r.headers.get('content-type')||'';
          if(/application\/json/i.test(ct)){ data = await r.json(); if(Array.isArray(data) && data.length) break; }
        } catch(_){ }
      }
      if(!Array.isArray(data) || !data.length){ state.__mmFetchDone = true; return; }
      // Selecionar registro pela placa com normalização (com/sem hífen)
      const norm = s=> String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
      const hit = data.find(x=> norm(x.placa||x.codigo) === norm(up));
      if(hit){
        let marca = hit.marca || hit.fabricante || hit.marca_veiculo || hit.marcaVeiculo || hit.marcaDescricao || '';
        let modelo = hit.modelo || hit.model || hit.modelo_veiculo || hit.modeloVeiculo || '';
        if(marca && !state.recurso.marca) state.recurso.marca = marca;
        if(modelo && !state.recurso.modelo) state.recurso.modelo = modelo;
        if(marca || modelo){
          state.__mmFetchDone = true;
          try { const hM=document.getElementById('recursoSelecionadoMarca'); if(hM) hM.value = state.recurso.marca||''; } catch(_){ }
          try { const hMd=document.getElementById('recursoSelecionadoModelo'); if(hMd) hMd.value = state.recurso.modelo||''; } catch(_){ }
          atualizarRotuloCampoRecurso();
        }
      } else {
        state.__mmFetchDone = true;
      }
    } catch(err){ console.warn('[modal_recurso] buscarMarcaModeloPorPlacaSeNecessario falhou', err); }
  }

  // Busca o objeto oficial do recurso (módulo Gestor) por id e preenche marca/modelo/descricao
  async function buscarRecursoOficialPorIdSeNecessario(){
    try {
      if(!state?.recurso) return;
      const gid = state.recurso.referenciaGestorId || state.recurso.referencia_gestor_id || document.getElementById('recursoSelecionadoId')?.value || state.recurso.id || state.recurso._id;
      if(!gid) return;
      // Se já temos marca e modelo, ainda assim podemos reforçar nome/descricao; mas evitar loops
      if(state.__gestorFetchDone) return;
      // Sanear IDs sintéticos/locais para não disparar 404/500 em endpoints externos
      try {
        const g = String(gid);
        const isHex24 = /^[0-9a-fA-F]{24}$/.test(g);
        const isNumeric = /^\d+$/.test(g);
        const isSynthetic = /^r[_-]/i.test(g) || /^tmp[_-]/i.test(g) || /^al_|^at_|^rf_/i.test(g);
        if(!isHex24 && !isNumeric){
          // Se for claramente sintético ou qualquer string não reconhecida, não consultar endpoints oficiais
          state.__gestorFetchDone = true;
          return;
        }
        if(isSynthetic){ state.__gestorFetchDone = true; return; }
      } catch(_){ }
      const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      // Preferir endpoints que costumam existir: gestor -> /api -> prefixado /escalas (cachear 404s para pular tentativas futuras)
  window.__REC_OFICIAL_API_PREF = window.__REC_OFICIAL_API_PREF || { skip: { escalas:false, gestor:false, api:false } };
      const pref = window.__REC_OFICIAL_API_PREF;
  const candidates = [];
  // Priorizar a API do próprio módulo Escalas (não depende do middleware do Gestor)
  if(!pref.skip.escalas) candidates.push(`${base}/api/recursos/${encodeURIComponent(gid)}`);
  if(!pref.skip.api) candidates.push(`/api/recursos/${encodeURIComponent(gid)}`);
  if(!pref.skip.gestor) candidates.push(`/gestor/api/recursos/${encodeURIComponent(gid)}`);
      let rec=null;
      for(const u of candidates){
        try {
          const r = await fetch(u, { headers:{ 'Accept':'application/json','X-Requested-With':'fetch' }, credentials:'same-origin' });
          if(!r.ok){
            try {
              // Marcar skip por prefixo para evitar tentativas futuras
              const markSkip=(p)=>{ if(p==='gestor') pref.skip.gestor=true; else if(p==='api') pref.skip.api=true; else if(p==='escalas') pref.skip.escalas=true; };
              const is404 = r.status===404;
              const is401_403 = r.status===401 || r.status===403;
              if(is404 || is401_403){ if(u.startsWith('/gestor/')) markSkip('gestor'); else if(u.startsWith('/api/')) markSkip('api'); else if(u.includes('/escalas/')) markSkip('escalas'); }
            } catch(_ms){}
            continue;
          }
          const ct = r.headers.get('content-type')||'';
          if(!/application\/json/i.test(ct)) continue;
          const js = await r.json();
          rec = (js && (js.data || js.recurso || js));
          if(rec && (rec.id || rec._id || rec.codigo || rec.placa)) break;
        } catch(_){ }
      }
      if(!rec){ state.__gestorFetchDone = true; return; }
      // Mapear campos comuns
      const marca = rec.marca || rec.fabricante || rec.marca_veiculo || rec.marcaVeiculo || rec.marcaDescricao || null;
      const modelo = rec.modelo || rec.model || rec.modelo_veiculo || rec.modeloVeiculo || null;
      const nome = rec.nome || rec.descricao || rec.label || null;
      const placa = rec.placa || rec.codigo || null;
      if(marca && !state.recurso.marca) state.recurso.marca = marca;
      if(modelo && !state.recurso.modelo) state.recurso.modelo = modelo;
      if(nome && !state.recurso.nome) state.recurso.nome = nome;
      if(placa && !state.recurso.placa) state.recurso.placa = placa;
      state.__gestorFetchDone = true;
      // Atualizar hiddens e rótulo
      try { const hM=document.getElementById('recursoSelecionadoMarca'); if(hM) hM.value = state.recurso.marca||''; } catch(_){ }
      try { const hMd=document.getElementById('recursoSelecionadoModelo'); if(hMd) hMd.value = state.recurso.modelo||''; } catch(_){ }
      atualizarRotuloCampoRecurso();
    } catch(err){ console.warn('[modal_recurso] buscarRecursoOficialPorIdSeNecessario falhou', err); }
  }

  async function hidratarRecursoSePreciso(){
    try {
      const r = state.recurso; if(!r) return;
      // Só pula hidratação se TODAS as estruturas principais já estiverem presentes
      const hasAnyData = (x)=> Array.isArray(x) ? x.length>0 : (x && typeof x==='object' ? Object.keys(x).length>0 : false);
      const temAloc = hasAnyData(r.alocacoesRecurso || r.alocacoes);
      const temAtrib = hasAnyData(r.atribuicoesRecurso || r.atribuicoes);
      const temRef = hasAnyData(r.refeicoesRecurso || r.refeicoes);
      if(temAloc && temAtrib && temRef) return;
      let escalaId = window.__ESCALA_STATE__?.escalaId;
      if(!escalaId){ try { const u=new URL(location.href); escalaId = u.searchParams.get('id') || null; } catch(_e){} }
      if(!escalaId) return;
      const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      let resp = await fetch(base + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
      if(!resp.ok){
        try {
          // Fallback sem prefixo
          resp = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
        } catch(_fb){}
        if(!resp.ok) return;
      }
      const js = await resp.json().catch(()=>null);
      const d = js && (js.data || js);
      if(!d || !Array.isArray(d.equipes)) return;
      const rid = r.id || r._id || r.referenciaGestorId || r.referencia_gestor_id || r.codigo;
      let found=null, equipeId=null;
      for(const eq of d.equipes){
        if(Array.isArray(eq.recursos)){
          const hit = eq.recursos.find(x=> (x.id||x._id||x.referenciaGestorId||x.referencia_gestor_id||x.codigo) == rid);
          if(hit){ found = hit; equipeId = eq.id || eq._id || eq.codigo || eq.nome; break; }
        }
      }
      if(found){
        // Mesclar campos ausentes
        const merged = { ...found };
        merged.id = r.id || r._id || r.referenciaGestorId || found.id || found._id || found.referenciaGestorId;
        merged.referenciaGestorId = r.referenciaGestorId || r.referencia_gestor_id || found.referenciaGestorId || found.referencia_gestor_id || null;
        merged.nome = r.nome || found.nome || found.descricao || '';
        merged.placa = r.placa || found.placa || found.codigo || '';
        merged.equipeId = r.equipeId || equipeId || null;
  merged.marca = r.marca || found.marca || found.fabricante || merged.marca;
  merged.modelo = r.modelo || found.modelo || found.model || merged.modelo;
        // Estruturas opcionais (permitir array -> converter para mapas internos onde aplicável)
        let aloc = r.alocacoesRecurso || found.alocacoesRecurso || found.matrizAlocacao || r.alocacoes || found.alocacoes || null;
        if(Array.isArray(aloc)){
          const map={}; aloc.forEach(a=>{ if(a && a.dia && a.turnoId){ const k = normalizarAllocationKey(a.dia, a.turnoId, (equipeId || r.equipeId || found.equipeId)); map[k]=true; } }); aloc = map;
        } else if(aloc && typeof aloc==='object'){
          const map={}; Object.entries(aloc).forEach(([k,v])=>{
            const parts = String(k).split('__');
            if(parts.length===2){ const dia=parts[0]; const turno=parts[1]; const nk=normalizarAllocationKey(dia, turno, (equipeId || r.equipeId || found.equipeId)); map[nk]=!!v; }
          });
          aloc = map;
        }
  merged.alocacoesRecurso = aloc || merged.alocacoesRecurso;
        let atrib = r.atribuicoesRecurso || found.atribuicoesRecurso || found.atribuicoes || null;
        if(Array.isArray(atrib)){
          const map={}; atrib.forEach(a=>{ const dia=a?.dia||a?.data; const turno=a?.turnoId||a?.turno; const fid=a?.membroFuncionarioId||a?.funcionarioId||a?.funcionario_id; if(dia && turno && fid){ const k=normalizarAllocationKey(dia, turno, (equipeId || r.equipeId || found.equipeId)); if(!map[k]) map[k]=[]; map[k].push({ funcionarioId: fid, nome: a.nome||a.funcionarioNome||null, atribuicao: a.papel||a.atribuicao||null }); } }); atrib = map;
        }
        merged.atribuicoesRecurso = atrib || merged.atribuicoesRecurso;
        let ref = r.refeicoesRecurso || found.refeicoesRecurso || found.refeicoes || null;
        if(Array.isArray(ref)){
          const map={}; ref.forEach(iv=>{ const dia=iv?.dia||iv?.data; const turno=iv?.turnoId||iv?.turno; const ini=iv?.inicio||iv?.ini; const fim=iv?.fim||iv?.termino; if(dia && ini && fim){ const tStr=String(iv?.tipo||''); const compInf = (typeof iv?.computavel==='boolean') ? iv.computavel : (!/nao[_ ]?computad|não[_ ]?computad/i.test(tStr)); if(turno){ const k=normalizarAllocationKey(dia, turno, (equipeId || r.equipeId || found.equipeId)); if(!map[k]) map[k]=[]; map[k].push({ inicio: ini, fim: fim, computavel: compInf }); } else { state.__refPend.push({ dia: normalizarDiaIso(dia), inicio: ini, fim: fim, computavel: compInf }); } } }); ref = map;
        }
        merged.refeicoesRecurso = ref || merged.refeicoesRecurso;
  state.recurso = merged;
        console.debug('[modal_recurso][hidratar] backend merge', {
          alocacoesArr: Array.isArray(found.alocacoes)? found.alocacoes.length: 0,
          atribuicoesArr: Array.isArray(found.atribuicoes)? found.atribuicoes.length: 0,
          refeicoesArr: Array.isArray(found.refeicoes)? found.refeicoes.length: 0
        });
        // Preencher UI após hidratar
        try {
          if(state.recurso.nome) $('#recursoNome').value = state.recurso.nome;
          if(state.recurso.equipeId){ $('#recursoEquipeSelect').value = state.recurso.equipeId; }
          const placaCampo = document.getElementById('campoPesquisarRecurso');
          if(placaCampo){
            const rLoc = state.recurso || {};
            const hasAny = !!(String(rLoc.placa||'').trim() || String(rLoc.marca||'').trim() || String(rLoc.modelo||'').trim());
            placaCampo.value = hasAny ? (comporRotuloRecurso(rLoc) || '') : '';
          }
          // Atualizar hidden fields de marca/modelo se existirem
          try { const hM=document.getElementById('recursoSelecionadoMarca'); if(hM) hM.value = state.recurso.marca||''; } catch(_){ }
          try { const hMd=document.getElementById('recursoSelecionadoModelo'); if(hMd) hMd.value = state.recurso.modelo||''; } catch(_){ }
          preencherCabecalho();
          // Regenerar alocações caso tenham vindo do backend
          if(state.recurso.alocacoesRecurso){ state.matrizAlocacao = Object.keys(state.recurso.alocacoesRecurso).reduce((acc,k)=>{ acc[k]=!!state.recurso.alocacoesRecurso[k]; return acc; }, {}); }
          if(state.recurso.atribuicoesRecurso){ state.atribuicoes = JSON.parse(JSON.stringify(state.recurso.atribuicoesRecurso)); }
          if(state.recurso.refeicoesRecurso){ state.refeicoes = JSON.parse(JSON.stringify(state.recurso.refeicoesRecurso)); }
          // Se, e somente se, o backend NÃO informou o campo de alocações (nem no recurso original, nem no encontrado)
          // podemos derivar a matriz a partir de chaves presentes em atribuições/refeições. Caso o backend tenha
          // retornado alocações vazias explicitamente, NÃO devemos recriar slots removidos.
          try {
            const campoAlocInformado = (
              ('alocacoes' in (r||{})) || ('alocacoesRecurso' in (r||{})) || ('matrizAlocacao' in (r||{})) ||
              ('alocacoes' in (found||{})) || ('alocacoesRecurso' in (found||{})) || ('matrizAlocacao' in (found||{}))
            );
            if(!campoAlocInformado && Object.keys(state.matrizAlocacao||{}).length===0){
              const derivadas = new Set();
              Object.keys(state.atribuicoes||{}).forEach(k=> derivadas.add(k));
              Object.keys(state.refeicoes||{}).forEach(k=> derivadas.add(k));
              derivadas.forEach(k=>{ if(k && typeof k==='string' && k.includes('__')){ if(!state.matrizAlocacao) state.matrizAlocacao={}; state.matrizAlocacao[k]=true; }});
            }
          } catch(_der){ }
          // Remover dados órfãos (atribuições/refeições) cujas alocações não existam mais
          try { podarDadosOrfaosSemAlocacao(/*somenteSeCampoAlocInformado=*/true, (r||{}), (found||{})); } catch(_pd){}
          console.debug('[modal_recurso][hidratar] alocacoes(keys)=', Object.keys(state.matrizAlocacao||{}));
          console.debug('[modal_recurso][hidratar] atribuicoes(keys)=', Object.keys(state.atribuicoes||{}));
          console.debug('[modal_recurso][hidratar] refeicoes(keys)=', Object.keys(state.refeicoes||{}));
          // Reconciliar e gerar UI após consolidar
          try { reindexarParaEquipeSelecionada(); } catch(_r){}
          try { reconciliarRefeicoesComMatriz(); } catch(_r2){}
          gerarMatrizAlocacao(); atualizarMatrizAoClique(); gerarAbasAtribuicao(); gerarTabelaRefeicoes();
          $('#btnSalvarRecursoFinal').disabled = false;
        } catch(_ui){}
      }
    } catch(err){ console.warn('[modal_recurso] hidratarRecursoSePreciso falhou', err); }
  }

  async function carregarEquipes(){
    const sel = $('#recursoEquipeSelect');
    const prev = sel.value;
    const desejado = (state.recurso && (state.recurso.equipeId || state.recurso.equipe_id || state.recurso.equipe)) ? (state.recurso.equipeId || state.recurso.equipe_id || state.recurso.equipe) : null;
    sel.innerHTML = '<option value="" disabled selected>Selecione...</option>';
    // Preferir equipes do backend para garantir IDs reais (ObjectId)
    let equipes = state.escala?.equipes || [];
    try {
      const escalaId = window.__ESCALA_STATE__?.escalaId || (new URL(location.href)).searchParams.get('id');
      if(escalaId){
        const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        let r = await fetch(base + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
        if(!r.ok){ try { r = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
        if(r && r.ok){
          const js = await r.json().catch(()=>null);
          const d = js && (js.data||js);
          if(d && Array.isArray(d.equipes)) equipes = d.equipes;
        }
      }
    } catch(_){ /* fallback para state */ }
    // Deduplicar por id/_id e também por nome; montar rótulo 'CODIGO - Nome'
    const vistosId = new Set();
    const vistosNome = new Set();
    equipes.forEach(eq => {
      const idVal = eq.id || eq._id || null;
      const nomeVal = (eq.nome || '').toString().trim();
      const codVal = (eq.codigo || '').toString().trim();
      // Se não tiver id e nome/código, ignore
      if(!idVal && !nomeVal && !codVal) return;
      const idKey = idVal ? String(idVal) : null;
      const nomeKey = nomeVal ? nomeVal.toLowerCase() : null;
      if(idKey && vistosId.has(idKey)) return;
      if(nomeKey && vistosNome.has(nomeKey)) return;
      if(idKey) vistosId.add(idKey);
      if(nomeKey) vistosNome.add(nomeKey);
      const opt = document.createElement('option');
      opt.value = idKey || (codVal || nomeVal);
      const label = (codVal && nomeVal) ? `${codVal} - ${nomeVal}` : (nomeVal || codVal);
      if(!label) return; // segurança
      opt.textContent = label;
      sel.appendChild(opt);
    });
    // Reselecionar se possível (prioriza a equipe do recurso)
    const alvo = desejado || prev;
    if(alvo){
      const opt = sel.querySelector(`option[value="${CSS.escape(String(alvo))}"]`);
      if(opt){ sel.value = String(alvo); }
    }
    // Aplicar regra de bloqueio do campo equipe após (re)popular opções
    try { aplicarRegraBloqueioEquipe(); } catch(_){ }
    // Se selecionou agora e a aba Alocação estiver ativa, gerar matriz
    try {
      const tabAtiva = document.querySelector('#tab-alocacao.active');
      if(tabAtiva && sel.value){ gerarMatrizAlocacao(); atualizarMatrizAoClique(); }
    } catch(_){ }
    // Ao trocar de equipe regenerar matriz de alocação do recurso
    if(!sel.__boundChange){
      sel.addEventListener('change', ()=>{
        // Limpa matriz local de recurso e refaz baseada na alocação da equipe
        state.matrizAlocacao = {};
        gerarMatrizAlocacao();
        atualizarMatrizAoClique();
        state.subAbasGeradas=false;
        // Reindexar qualquer dado carregado conforme equipe recém-selecionada
        try { reindexarParaEquipeSelecionada(); } catch(_r){}
        // Se estamos criando novo recurso, pré-marcar todas as alocações possíveis
        // EXCETO quando estamos no modo diária (lockCtx), para não interferir em outras datas
        if(state.__recursoNovoAberto === true && !state.__lockCtx){
          // Após gerar a matriz, marcar todos os checkboxes e refletir em state.matrizAlocacao
          $all('.chkAlocacaoRecurso').forEach(chk=>{ if(!chk.checked){ chk.checked=true; chk.dispatchEvent(new Event('change')); }});
          gerarAbasAtribuicao();
        }
      });
      sel.__boundChange = true;
    }
  }
  // Retorna todas as datas em que a equipe (id ou nome) aparece em QUALQUER turno da escala principal
  function coletarDatasEquipeAlocada(equipeId){
    // Se não houver datas globais, derive do período
    let todasDatas = state.escala?.datas || [];
    if((!todasDatas || !todasDatas.length) && window.__ESCALA_STATE__?.periodo?.ini && window.__ESCALA_STATE__?.periodo?.fim){
      try { const arr=[]; let cur=new Date(window.__ESCALA_STATE__.periodo.ini+'T00:00:00'); const end=new Date(window.__ESCALA_STATE__.periodo.fim+'T00:00:00'); while(cur<=end){ arr.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1);} todasDatas=arr; } catch(_d){}
    }
    if(!equipeId) return [];
    const matrizEscala = window.__ESCALA_STATE__?.matrizAlocacao || {};
    const tokens = new Set([equipeId]);
    const equipe = (window.__ESCALA_STATE__?.equipes||[]).find(e=> e.id===equipeId || e._id===equipeId || e.nome===equipeId || e.codigo===equipeId);
    if(equipe){ if(equipe.id) tokens.add(equipe.id); if(equipe._id) tokens.add(equipe._id); if(equipe.nome) tokens.add(equipe.nome); if(equipe.codigo) tokens.add(equipe.codigo); }
    // Comparador tolerante: aceita itens do CSV no formato "COD - Nome"
    const listaContemEquipe = (lista, toks)=>{
      const toksStr = new Set(Array.from(toks).map(x=> String(x)));
      const extrairPrefixo = (s)=>{
        const m = String(s).trim().match(/^([^\-]+?)\s*-\s*.+$/);
        return m ? m[1].trim() : null;
      };
      return lista.some(x=>{
        const val = String(x).trim();
        if(toksStr.has(val)) return true;
        const pref = extrairPrefixo(val);
        return pref && toksStr.has(pref);
      });
    };
    const datasSet = new Set();
    Object.keys(matrizEscala).forEach(key=>{
      const [turnoId,dataISO] = key.split('|');
      if(!dataISO) return;
      const csv = matrizEscala[key]; if(!csv) return;
      const lista = String(csv).split(',').map(s=>s.trim()).filter(Boolean);
      if(listaContemEquipe(lista, tokens)) datasSet.add(dataISO);
    });
    // Fallback: quando a matriz global não contiver a equipe, derive dias das alocações da própria equipe
    if(datasSet.size===0){
      try {
        const eq = (window.__ESCALA_STATE__?.equipes||[]).find(e=> e.id===equipeId || e._id===equipeId || e.nome===equipeId || e.codigo===equipeId);
        if(eq && Array.isArray(eq.alocacoes)){
          eq.alocacoes.forEach(a=>{ const dia=(a.dia||a.data||a.date||'').toString().slice(0,10); if(dia) datasSet.add(dia); });
        }
      } catch(_fbDatas){ }
    }
    // Restrição: apenas dias em que a equipe foi alocada (via matriz ou fallback por equipe)
    const filtradas = todasDatas.filter(d=> datasSet.has(d));
    return filtradas;
  }

  // Constrói, de forma programática, a lista completa de alocações { dia, turnoId }
  // para uma equipe, usando a matriz global da escala (preferencial) e fallback
  // para grupos de turnos + datas da equipe quando a matriz não estiver disponível.
  function construirAlocacoesParaEquipe(equipeId){
    const result = [];
    if(!equipeId) return result;
    const matrizEscala = window.__ESCALA_STATE__?.matrizAlocacao || {};
    const eqObj = (window.__ESCALA_STATE__?.equipes||[]).find(e=> e.id===equipeId || e._id===equipeId || e.nome===equipeId || e.codigo===equipeId);
    const tokens = new Set([ String(equipeId) ]);
    if(eqObj){ if(eqObj.id) tokens.add(String(eqObj.id)); if(eqObj._id) tokens.add(String(eqObj._id)); if(eqObj.nome) tokens.add(String(eqObj.nome)); if(eqObj.codigo) tokens.add(String(eqObj.codigo)); }
    const listaContemEquipe = (lista, toks)=>{
      const toksStr = new Set(Array.from(toks).map(x=> String(x)));
      const extrairPrefixo = (s)=>{ const m=String(s).trim().match(/^([^\-]+?)\s*-\s*.+$/); return m? m[1].trim(): null; };
      return lista.some(x=>{ const val=String(x).trim(); if(toksStr.has(val)) return true; const pref=extrairPrefixo(val); return pref && toksStr.has(pref); });
    };
    // 1) Preferir matriz global: chave "grupoId::HH:MM-HH:MM|YYYY-MM-DD" => CSV de equipes
    try {
      for(const k of Object.keys(matrizEscala)){
        const [turnoIdLocal, dataISO] = String(k).split('|');
        if(!turnoIdLocal || !dataISO) continue;
        const csv = matrizEscala[k]; if(!csv) continue;
        const lista = String(csv).split(',').map(s=>s.trim()).filter(Boolean);
        if(listaContemEquipe(lista, tokens)){ result.push({ dia: dataISO, turnoId: turnoIdLocal }); }
      }
    } catch(_){ /* continua para fallback se preciso */ }
    // Fallback: quando a matriz global não retorna entradas, usar alocações da equipe
    if(result.length===0 && eqObj && Array.isArray(eqObj.alocacoes)){
      eqObj.alocacoes.forEach(a=>{
        const dia = (a.dia||a.data||a.date||'').toString().slice(0,10);
        const turnoIdLocal = String(a.turnoId||a.turno_id||a.turno||'');
        if(dia && turnoIdLocal){ result.push({ dia, turnoId: turnoIdLocal }); }
      });
    }
    return result;
  }

  // Resolve um turnoId local (grupoId::HH:MM-HH:MM) a partir de um token possivelmente simples "HH:MM-HH:MM"
  function resolverTurnoIdComGrupo(diaISO, turnoToken, equipeId){
    try {
      const range = (String(turnoToken||'').match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
      if(!range) return String(turnoToken||'');
      const grupos = window.__ESCALA_STATE__?.gruposTurnos || [];
      const matrizEscala = window.__ESCALA_STATE__?.matrizAlocacao || {};
      const equipeTokens = new Set();
      if(equipeId){
        equipeTokens.add(equipeId);
        const eq = (window.__ESCALA_STATE__?.equipes||[]).find(e=> e.id===equipeId || e._id===equipeId || e.nome===equipeId);
        if(eq){ if(eq.id) equipeTokens.add(eq.id); if(eq._id) equipeTokens.add(eq._id); if(eq.nome) equipeTokens.add(eq.nome); }
      }
      let fallbackTurnoId = null;
      for(const grupo of grupos){
        const turnoIdLocal = grupo.id + '::' + range;
        if(diaISO && equipeTokens.size){
          const chave = turnoIdLocal + '|' + diaISO;
          const csv = matrizEscala[chave];
          if(csv){
            const lista = String(csv).split(',').map(s=>s.trim()).filter(Boolean);
            const listaContemEquipe = (lst, toks)=>{
              const toksStr = new Set(Array.from(toks).map(x=> String(x)));
              const extrairPrefixo=(s)=>{ const m=String(s).trim().match(/^([^\-]+?)\s*-\s*.+$/); return m? m[1].trim(): null; };
              return lst.some(x=>{ const v=String(x).trim(); if(toksStr.has(v)) return true; const pref=extrairPrefixo(v); return pref && toksStr.has(pref); });
            };
            if(listaContemEquipe(lista, equipeTokens)) return turnoIdLocal;
          }
        }
        if(!fallbackTurnoId) fallbackTurnoId = turnoIdLocal;
      }
      return fallbackTurnoId || String(turnoToken||'');
    } catch(_){ return String(turnoToken||''); }
  }

  // Normaliza data para ISO (YYYY-MM-DD) quando vier como DD/MM/YYYY
  function normalizarDiaIso(dia){
    try {
      if(/^\d{4}-\d{2}-\d{2}$/.test(dia)) return dia;
      const m = String(dia).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if(m){ return `${m[3]}-${m[2]}-${m[1]}`; }
      // fallback: tentar parse
      const dt = new Date(dia);
      if(!isNaN(dt)) return dt.toISOString().slice(0,10);
    } catch(_){ }
    return dia;
  }

  // Normaliza allocationId a partir de (dia, turnoToken) considerando a equipe selecionada
  function normalizarAllocationKey(diaISO, turnoToken, equipeOverride){
    const equipeIdSel = (function(){
      try { return $('#recursoEquipeSelect').value || state.recurso?.equipeId || null; } catch(_){ return state.recurso?.equipeId || null; }
    })();
    const diaNorm = normalizarDiaIso(diaISO);
    const turnoLocal = resolverTurnoIdComGrupo(diaNorm, turnoToken, equipeOverride || equipeIdSel);
    return diaNorm + '__' + turnoLocal;
  }

  // Dado um allocationId (YYYY-MM-DD__tokenTurno) possivelmente com grupo sintético (ex.: AUTO::),
  // tenta mapear para o turnoId REAL (grupoId::HH:MM-HH:MM) a partir da matriz global da escala
  // considerando a equipe informada. Retorna { dia, turnoId } ou null se não encontrar.
  function mapearTurnoRealDeAllocation(allocationId, equipeId){
    try {
      if(!allocationId) return null;
      const [diaISO, turnoToken] = String(allocationId).split('__');
      if(!diaISO || !turnoToken) return null;
      // Extrair a faixa HH:MM-HH:MM do token atual
      const range = (String(turnoToken).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
      if(!range){
        // Sem faixa horária, não há como remapear. Use como está.
        return { dia: normalizarDiaIso(diaISO), turnoId: turnoToken };
      }
      const matrizEscala = window.__ESCALA_STATE__?.matrizAlocacao || {};
      if(!matrizEscala || typeof matrizEscala !== 'object' || !Object.keys(matrizEscala).length){
        // Sem matriz global: se for sintético (AUTO::), descartar; senão devolve token atual
        if(/^AUTO::/i.test(String(turnoToken))) return null;
        return { dia: normalizarDiaIso(diaISO), turnoId: turnoToken };
      }
      const tokensEquipe = new Set();
      if(equipeId!=null){
        tokensEquipe.add(String(equipeId));
        try {
          const eq = (window.__ESCALA_STATE__?.equipes||[]).find(e=> (e.id||e._id||e.nome||e.codigo)==equipeId);
          if(eq){ if(eq.id) tokensEquipe.add(String(eq.id)); if(eq._id) tokensEquipe.add(String(eq._id)); if(eq.nome) tokensEquipe.add(String(eq.nome)); if(eq.codigo) tokensEquipe.add(String(eq.codigo)); }
        } catch(_){ }
      }
      // Procurar por uma chave na matrizEscala do mesmo dia onde o lado esquerdo termina com a mesma faixa e contenha a equipe
      let escolhido = null;
      for(const k of Object.keys(matrizEscala)){
        const [turnoIdLeft, dataISO] = String(k).split('|');
        if(dataISO !== normalizarDiaIso(diaISO)) continue;
        // Verificar se o turnoIdLeft termina com a faixa
        const m = String(turnoIdLeft).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/);
        if(!m || m[1] !== range) continue;
        const csv = matrizEscala[k]; if(!csv) continue;
        const lista = String(csv).split(',').map(s=> s.trim()).filter(Boolean);
        if(!tokensEquipe.size){
          // Se equipe não informada, aceitar a primeira ocorrência com essa faixa
          escolhido = turnoIdLeft; break;
        }
        let match=false; for(const tk of tokensEquipe){ if(lista.includes(String(tk))) { match=true; break; } }
        if(match){ escolhido = turnoIdLeft; break; }
      }
      if(escolhido){ return { dia: normalizarDiaIso(diaISO), turnoId: escolhido }; }
      // Fallback 1: usar gruposTurnos conhecidos pelo range para gerar um turnoId real
      try {
        const grupos = Array.isArray(window.__ESCALA_STATE__?.gruposTurnos) ? window.__ESCALA_STATE__.gruposTurnos : [];
        if(grupos.length){
          const candidatos = [];
          grupos.forEach(g=>{ if(Array.isArray(g.turnos)) g.turnos.forEach(t=>{ const r=(t.ini+'-'+t.fim); if(r===range) candidatos.push(g.id+'::'+r); }); });
          if(candidatos.length===1){ return { dia: normalizarDiaIso(diaISO), turnoId: candidatos[0] }; }
          if(candidatos.length>1){ console.warn('[modal_recurso] Range com múltiplos grupos; escolhendo primeiro', range, candidatos); return { dia: normalizarDiaIso(diaISO), turnoId: candidatos[0] }; }
        }
      } catch(_fbGT){ }
      // Fallback 2: se o token atual já for grupo::range e não for AUTO, reutilizá-lo
      if(/^[^:]+::\d{2}:\d{2}-\d{2}:\d{2}$/.test(String(turnoToken)) && !/^AUTO::/i.test(String(turnoToken))){
        return { dia: normalizarDiaIso(diaISO), turnoId: String(turnoToken) };
      }
      // Sem como mapear com segurança
      return null;
    } catch(_){ return null; }
  }

  // Reindexa mapas (matriz, atribuições, refeições) para a equipe atualmente selecionada,
  // recalculando o grupo do turno (prefixo) a partir do range HH:MM-HH:MM
  function reindexarParaEquipeSelecionada(){
    try {
      const equipeIdSel = (function(){ try { return $('#recursoEquipeSelect').value || state.recurso?.equipeId || null; } catch(_) { return state.recurso?.equipeId || null; } })();
      if(!equipeIdSel) return;
      function rekey(obj){
        if(!obj || typeof obj!=='object') return obj;
        const novo={};
        Object.entries(obj).forEach(([k,v])=>{
          const [dia, token] = String(k).split('__');
          const m = String(token||'').match(/(\d{2}:\d{2}-\d{2}:\d{2})$/);
          if(!dia || !m) { novo[k]=v; return; }
          const nk = normalizarAllocationKey(dia, m[1], equipeIdSel);
          // merge conservador se colidir
          if(Array.isArray(v)){
            if(!Array.isArray(novo[nk])) novo[nk]=[];
            novo[nk] = novo[nk].concat(v.map(x=> ({ ...x })));
          } else {
            novo[nk] = (typeof v==='boolean') ? v : (v!=null);
          }
        });
        return novo;
      }
      // Reindexar os três mapas
      if(state.matrizAlocacao && Object.keys(state.matrizAlocacao).length){ state.matrizAlocacao = rekey(state.matrizAlocacao); }
      if(state.atribuicoes && Object.keys(state.atribuicoes).length){ state.atribuicoes = rekey(state.atribuicoes); }
      if(state.refeicoes && Object.keys(state.refeicoes).length){ state.refeicoes = rekey(state.refeicoes); }
      try { reconciliarRefeicoesComMatriz(); } catch(_r){}
      // Após reindexar, podar dados órfãos para que abas/checkboxes reflitam as alocações atuais
      try { podarDadosOrfaosSemAlocacao(/*somenteSeCampoAlocInformado=*/false); } catch(_pd){}
      // Re-render minimal para refletir
      try { gerarAbasAtribuicao(); } catch(_a){}
      try { gerarTabelaRefeicoes(); } catch(_t){}
    } catch(err){ console.warn('[modal_recurso] reindexarParaEquipeSelecionada falhou', err); }
  }

  // Reconciliar chaves de state.refeicoes com as alocações ativas (por dia+faixa horário)
  function reconciliarRefeicoesComMatriz(){
    try {
      if(!state.refeicoes || !state.matrizAlocacao) return;
      const ativos = Object.keys(state.matrizAlocacao).filter(k=> state.matrizAlocacao[k]);
      if(!ativos.length) return;
      // Índice: dia|range -> lista de allocationIds ativos compatíveis
      const idx = new Map();
      ativos.forEach(a=>{
        const [dia, token] = String(a).split('__');
        const range = (String(token).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
        if(!dia || !range) return;
        const key = dia + '|' + range;
        if(!idx.has(key)) idx.set(key, []);
        idx.get(key).push(a);
      });
      const novo = {};
      let moved = 0;
      Object.entries(state.refeicoes).forEach(([k, lista])=>{
        const [dia, token] = String(k).split('__');
        const range = (String(token).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
        const key = (dia && range) ? (dia+'|'+range) : null;
        const candidatos = key ? (idx.get(key) || []) : [];
        const alvo = candidatos.includes(k) ? k : (candidatos[0] || k);
        if(!novo[alvo]) novo[alvo] = [];
        if(Array.isArray(lista)) novo[alvo] = novo[alvo].concat(lista.map(x=> ({ ...x })));
        if(alvo !== k) moved++;
      });
      // Distribuir pendentes (sem turno) pelo dia
      if(Array.isArray(state.__refPend) && state.__refPend.length){
        let used=0;
        state.__refPend.forEach(p=>{
          const keyDia = p.dia + '|';
          // procurar qualquer allocation ativa no mesmo dia
          const cand = ativos.filter(a=> a.startsWith(p.dia+'__'));
          if(cand.length){
            const alvo = cand[0];
            if(!novo[alvo]) novo[alvo]=[];
            novo[alvo].push({ inicio: p.inicio, fim: p.fim, computavel: !!p.computavel, tipo: p.tipo || 'ALMOCO' });
            used++;
          }
        });
        if(used){ console.debug('[modal_recurso][reconciliar] refeicoes pendentes alocadas=', used); }
        state.__refPend = state.__refPend.filter(p=> !ativos.some(a=> a.startsWith(p.dia+'__')));
      }
      state.refeicoes = novo;
      console.debug('[modal_recurso][reconciliar] refeicoes realocadas=', moved);
    } catch(err){ console.warn('[modal_recurso] reconciliarRefeicoesComMatriz falhou', err); }
  }

  // Gera uma tabela por grupo de turnos. Cada tabela contém apenas as datas onde ao menos um turno do grupo possui a equipe selecionada.
  function gerarMatrizAlocacao(){
    const container = $('#containerMatrizAlocacaoRecurso');
    const wrap = $('#wrapGruposAlocacaoRecurso');
    wrap.innerHTML='';
    let equipeId = $('#recursoEquipeSelect').value || '';
    // Se nenhuma equipe selecionada, mas há exatamente uma equipe na escala, selecione-a automaticamente
    try {
      if(!equipeId && Array.isArray(window.__ESCALA_STATE__?.equipes) && window.__ESCALA_STATE__.equipes.length===1){
        equipeId = window.__ESCALA_STATE__.equipes[0].id || window.__ESCALA_STATE__.equipes[0]._id || '';
        const sel = document.getElementById('recursoEquipeSelect');
        if(sel && equipeId){
          // Não criar option temporária com texto 'Equipe'; aguardar carregarEquipes popular corretamente
          const opt = sel.querySelector(`option[value="${CSS.escape(String(equipeId))}"]`);
          if(opt){ sel.value = String(equipeId); }
        }
      }
    } catch(_autoEq){ }
    if (!equipeId) {
        container.classList.add('d-none');
        $('#msgAlocacaoRecursoVazia').classList.remove('d-none');
        return;
    }
      // Em modo diária, forçar datas/turnos mínimos com base no lock
    const lock = state.__lockCtx || null;
    let datasEquipe = lock && lock.dia ? [ String(lock.dia) ] : coletarDatasEquipeAlocada(equipeId);
    let gruposTurnos = window.__ESCALA_STATE__?.gruposTurnos || [];
    if(lock && lock.turnoId){
      const turnoToken = String(lock.turnoId);
      const m = turnoToken.match(/(.*::)?(\d{2}:\d{2}-\d{2}:\d{2})$/);
      const range = m ? m[2] : null;
      const gid = m && m[1] ? m[1].replace(/::$/,'') : null;
      if(range){
        gruposTurnos = [{ id: gid || 'AUTO', turnos: [{ ini: range.split('-')[0], fim: range.split('-')[1] }] }];
      }
    }
    // Removido fallback: não derivar grupos/turnos sintéticos sem respaldo da matriz oficial.
    // Se a escala não tiver grupos de turnos definidos, a aba de Alocação do recurso ficará vazia.
    if(!gruposTurnos.length || !datasEquipe.length){
      console.debug('[modal_recurso][alocacao] não há grupos/datas para renderizar', {
        equipeId,
        datasEquipeCount: datasEquipe.length,
        temGrupos: Array.isArray(gruposTurnos) ? gruposTurnos.length : 0,
        periodo: window.__ESCALA_STATE__?.periodo,
        gruposTurnosState: window.__ESCALA_STATE__?.gruposTurnos,
        matrizEscalaKeys: Object.keys(window.__ESCALA_STATE__?.matrizAlocacao||{}).length,
        matrizLocalKeys: Object.keys(state.matrizAlocacao||{}).length,
        atribKeys: Object.keys(state.atribuicoes||{}).length,
        refeiKeys: Object.keys(state.refeicoes||{}).length
      });
      // Em modo diária, ainda assim renderizar um grid mínimo com a data/turno alvo
      if(lock && lock.dia && lock.turnoId){
        datasEquipe = [ String(lock.dia) ];
        const turnoToken = String(lock.turnoId);
        const m2 = turnoToken.match(/(.*::)?(\d{2}:\d{2}-\d{2}:\d{2})$/);
        const range2 = m2 ? m2[2] : null;
        const gid2 = m2 && m2[1] ? m2[1].replace(/::$/,'') : 'AUTO';
        if(range2){ gruposTurnos = [{ id: gid2, turnos: [{ ini: range2.split('-')[0], fim: range2.split('-')[1] }] }]; }
      } else {
        container.classList.add('d-none');
        $('#msgAlocacaoRecursoVazia').classList.remove('d-none');
        return;
      }
    }
    const matrizEscala = window.__ESCALA_STATE__?.matrizAlocacao || {};
    const equipeTokens = new Set([equipeId]);
    const eqObj = (window.__ESCALA_STATE__?.equipes||[]).find(e=> e.id===equipeId || e._id===equipeId || e.nome===equipeId || e.codigo===equipeId);
    if(eqObj){ if(eqObj.id) equipeTokens.add(eqObj.id); if(eqObj._id) equipeTokens.add(eqObj._id); if(eqObj.nome) equipeTokens.add(eqObj.nome); if(eqObj.codigo) equipeTokens.add(eqObj.codigo); }
    const listaContemEquipe = (lst, toks)=>{
      const toksStr = new Set(Array.from(toks).map(x=> String(x)));
      const extrairPrefixo=(s)=>{ const m=String(s).trim().match(/^([^\-]+?)\s*-\s*.+$/); return m? m[1].trim(): null; };
      return lst.some(x=>{ const v=String(x).trim(); if(toksStr.has(v)) return true; const pref=extrairPrefixo(v); return pref && toksStr.has(pref); });
    };

  gruposTurnos.forEach(grupo=>{
      const turnos = (grupo.turnos||[]).map(t=>({
        id: (lock && lock.turnoId) ? String(lock.turnoId) : (grupo.id+'::'+t.ini+'-'+t.fim),
        label: t.ini+' às '+t.fim, inicio: t.ini, fim: t.fim
      }));
      if(!turnos.length) return;
      // Coletar datas deste grupo onde a equipe aparece
      const datasGrupoSet = new Set();
      Object.keys(matrizEscala).forEach(key=>{
        const [turnoId,dataISO] = key.split('|');
        if(!dataISO) return;
        // turno pertence a este grupo?
        if(!turnos.some(t=> t.id===turnoId)) return;
        const csv = matrizEscala[key]; if(!csv) return;
        const lista = String(csv).split(',').map(s=>s.trim()).filter(Boolean);
        if(listaContemEquipe(lista, equipeTokens)) datasGrupoSet.add(dataISO);
      });
      // Fallback: se nenhuma data veio da matriz, use alocações da equipe compatíveis com os turnos do grupo
      if(datasGrupoSet.size===0){
        try {
          const eq = (window.__ESCALA_STATE__?.equipes||[]).find(e=> e.id===equipeId || e._id===equipeId || e.nome===equipeId || e.codigo===equipeId);
          if(eq && Array.isArray(eq.alocacoes)){
            const rangesGrupo = new Set(turnos.map(t=> (t.inicio+'-'+t.fim)));
            eq.alocacoes.forEach(a=>{
              const dia = (a.dia||a.data||a.date||'').toString().slice(0,10);
              const tid = String(a.turnoId||a.turno_id||a.turno||'');
              const m = tid.match(/(\d{2}:\d{2}-\d{2}:\d{2})$/);
              const range = m? m[1] : null;
              if(dia && range && rangesGrupo.has(range)) datasGrupoSet.add(dia);
            });
          }
        } catch(_fbGrupo){ }
      }
      // Restrição: considerar somente interseção entre dias do grupo e dias que a equipe está alocada
      const datasGrupo = Array.from(datasGrupoSet).filter(d=> datasEquipe.includes(d));
      if(!datasGrupo.length) return; // não renderiza grupo sem dias

  const bloco = document.createElement('div');
      bloco.className='mb-3 border rounded p-2 bloco-grupo-aloc';
      bloco.setAttribute('data-grupo-id', grupo.id);
      // Largura total = coluna turno (150) + (n dias * 32)
      const larguraTabela = 150 + (datasGrupo.length * 32);
      bloco.innerHTML = `<span class="badge bg-secondary d-none badge-alterado">Alterado</span>`+
        `<div class="fw-semibold mb-1">Grupo: <span class="text-primary">${grupo.id}</span></div>`+
        `<div class="acoes-grupo-aloc">`+
          `<button type=button class="btn btn-light btn-sm p-1" data-acao-grupo="marcar" title="Marcar todos"><i class='bi bi-check2-all'></i></button>`+
          `<button type=button class="btn btn-light btn-sm p-1" data-acao-grupo="limpar" title="Limpar"><i class='bi bi-x-lg'></i></button>`+
          `<button type=button class="btn btn-light btn-sm p-1" data-acao-grupo="inverter" title="Inverter seleção"><i class='bi bi-shuffle'></i></button>`+
          `<button type=button class="btn btn-primary btn-sm ms-2 d-none" data-acao-grupo="salvar" title="Salvar alterações deste grupo"><i class='bi bi-save'></i> Salvar alterações</button>`+
        `</div>`+
        `<div class="table-responsive"><table style="width:${larguraTabela}px;max-width:${larguraTabela}px;" class="table table-sm table-bordered align-middle text-center mb-0 table-fixed-layout tabela-aloc-grupo">`+
          `<thead class="table-light">`+
            gerarHeaderDatas(datasGrupo)+
          `</thead>`+
          `<tbody>`+
            turnos.map(t=> gerarLinhaTurno(t,datasGrupo,equipeId)).join('')+
          `</tbody>`+
        `</table></div>`;
      wrap.appendChild(bloco);
    });

    if(!wrap.children.length){
      container.classList.add('d-none');
      $('#msgAlocacaoRecursoVazia').classList.remove('d-none');
      return;
    }
    container.classList.remove('d-none');
    $('#msgAlocacaoRecursoVazia').classList.add('d-none');
    $('#acoesAlocacaoRecurso').style.display='flex';

    // Novo recurso: se a equipe foi auto-selecionada e ainda não há marcações, marcar tudo automaticamente
    // EXCETO quando em modo diária (lockCtx), para não interferir em outras datas
    try {
      if(state.__recursoNovoAberto === true && !state.__lockCtx){
        const chks = $all('.chkAlocacaoRecurso', wrap);
        const algumMarcado = chks.some(c=> c.checked);
        if(chks.length && !algumMarcado){
          chks.forEach(chk=>{ if(!chk.checked){ chk.checked=true; chk.dispatchEvent(new Event('change')); }});
        }
      }
    } catch(_autoMark){ }
  }

  function gerarHeaderDatas(datas){
    const diasSemana=['dom','seg','ter','qua','qui','sex','sáb'];
    // Largura coluna turno deve comportar '00:00 às 00:00' (14 chars aprox). Fixar ~150px.
    // Colunas de dia: largura compacta (3 caracteres) ~ 32px.
    const linha1 = '<tr><th class="col-turno">Turno</th>'+ datas.map(dt=>{ const d=new Date(dt+'T00:00:00'); const diaNum=String(d.getDate()).padStart(2,'0'); const isFds=[0,6].includes(d.getDay()); return `<th class="col-dia ${isFds?'dia-fds':''}" title="${dt}">${diaNum}</th>`;}).join('') + '</tr>';
    const linha2 = '<tr><th class="col-turno"></th>'+ datas.map(dt=>{ const d=new Date(dt+'T00:00:00'); const lbl=diasSemana[d.getDay()]; const isFds=[0,6].includes(d.getDay()); return `<th class="col-dia text-muted fw-normal ${isFds?'dia-fds':''}" title="${dt}" style="font-size:.7rem;line-height:1;">${lbl}</th>`; }).join('') + '</tr>';
    return linha1 + linha2;
  }

  function gerarLinhaTurno(t,datas,equipeId){
    return `<tr><td class="text-nowrap col-turno">${t.label}</td>` + datas.map(dt=>{
      const allocationId = dt+'__'+t.id;
      // Validação: só permitir seleção onde a equipe está alocada no turno/dia
      const chaveMatriz = t.id + '|' + dt;
      const matrizEscala = window.__ESCALA_STATE__?.matrizAlocacao || {};
      const csv = matrizEscala[chaveMatriz] || '';
      const tokens = new Set([ String(equipeId) ]);
      const eq = (window.__ESCALA_STATE__?.equipes||[]).find(e=> (e.id||e._id)==equipeId || e.nome===equipeId || e.codigo===equipeId);
      if(eq){ if(eq.id) tokens.add(String(eq.id)); if(eq._id) tokens.add(String(eq._id)); if(eq.nome) tokens.add(String(eq.nome)); if(eq.codigo) tokens.add(String(eq.codigo)); }
      const lista = String(csv).split(',').map(s=> s.trim()).filter(Boolean);
      let permitido = (function(lst, toks){
        const toksStr = new Set(Array.from(toks).map(x=> String(x)));
        return lst.some(x=>{ const v=String(x).trim(); if(toksStr.has(v)) return true; const pref=v.split(' - ')[0].trim(); return pref && toksStr.has(pref); });
      })(lista, tokens);
      // Fallback: permitir quando a equipe possui alocação no próprio objeto da equipe para este dia e faixa
      if(!permitido){
        try {
          if(eq && Array.isArray(eq.alocacoes)){
            const rangeT = (function(id){ const m=String(id||'').match(/(\d{2}:\d{2}-\d{2}:\d{2})$/); return m? m[1]: null; })(t.id);
            if(rangeT){
              permitido = eq.alocacoes.some(a=>{
                const diaA = (a.dia||a.data||a.date||'').toString().slice(0,10);
                const m2 = String(a.turnoId||a.turno_id||a.turno||'').match(/(\d{2}:\d{2}-\d{2}:\d{2})$/);
                const rangeA = m2? m2[1] : null;
                return (diaA===dt && rangeA===rangeT);
              });
            }
          }
        } catch(_fbPerm){ }
      }
      const checked = permitido && !!(state.matrizAlocacao && state.matrizAlocacao[allocationId]);
      const d=new Date(dt+'T00:00:00'); const isFds=[0,6].includes(d.getDay());
      const grupoIdAttr = (String(t.id).split('::')[0]||'');
      const disabledAttr = permitido ? '' : 'disabled readonly aria-disabled="true"';
      return `<td class="col-dia ${isFds?'dia-fds':''}" title="${dt}"><input type="checkbox" class="form-check-input chkAlocacaoRecurso" data-grupo-id="${grupoIdAttr}" data-allocation="${allocationId}" ${checked? 'checked':''} ${disabledAttr}></td>`;
    }).join('') + '</tr>';
  }

  function snapshotAlocacao(){ return JSON.stringify(state.matrizAlocacao); }
  let alocacaoOriginal='';
  function prepararAlocacaoEdicao(){ alocacaoOriginal=snapshotAlocacao(); }
  function cancelarAlocacao(){ try { state.matrizAlocacao=JSON.parse(alocacaoOriginal)||{}; } catch(_){ } gerarMatrizAlocacao(); atualizarMatrizAoClique(); }
  function salvarAlocacao(){ toastSucesso('Alocação de recurso salva (local, TODO backend)'); prepararAlocacaoEdicao(); }

  // Bloqueia/desbloqueia campos e ações da aba Dados Gerais
  function bloquearDadosGeraisCampos(bloquear=true){
    try {
      const form = document.getElementById('formDadosGeraisRecurso');
      // Correção: apenas o campo Equipe deve ser bloqueado/desbloqueado
      const equipe = document.getElementById('recursoEquipeSelect');
      if(equipe){ equipe.disabled = !!bloquear; }
      // Manter todos os demais campos e botões livres (não modificar estado deles aqui)
    } catch(_dglock){}
  }

  // Garante que o select de equipe esteja bloqueado conforme estado (edição ou após salvar novo)
  function aplicarRegraBloqueioEquipe(){
    try {
      const sel = document.getElementById('recursoEquipeSelect');
      if(!sel) return;
      // Edição (state.__recursoNovoAberto === false) -> bloqueado
      // Novo recurso salvo (state.recurso && state.recurso._persisted) -> bloqueado
      const deveBloquear = (state && state.__recursoNovoAberto === false) || (!!(state && state.recurso && state.recurso._persisted));
      sel.disabled = !!deveBloquear;
    } catch(_){ }
  }

  function atualizarMatrizAoClique(){
    $all('.chkAlocacaoRecurso').forEach(chk=>{
      chk.addEventListener('change', e=>{
        const alloc = e.target.getAttribute('data-allocation');
        console.log('[modal_recurso] checkbox change, e.target:', e.target.tagName, 'has data-allocation:', e.target.hasAttribute('data-allocation'), 'alloc:', alloc, 'checked:', e.target.checked);
        console.log('[modal_recurso] before set, state has alloc:', !!state.matrizAlocacao[alloc], 'value:', state.matrizAlocacao[alloc]);
        state.matrizAlocacao[alloc] = e.target.checked;
        console.log('[modal_recurso] after set, state has alloc:', !!state.matrizAlocacao[alloc], 'value:', state.matrizAlocacao[alloc]);
        console.log('[modal_recurso] total keys:', Object.keys(state.matrizAlocacao).length, 'true count:', Object.values(state.matrizAlocacao).filter(v=>v===true).length);
        state.subAbasGeradas = false; // forçar regenerar atribuição
        marcarAlteracaoGrupoPorAllocation(alloc);
        try { reconciliarRefeicoesComMatriz(); } catch(_r){}
        try { gerarTabelaRefeicoes(); } catch(_t){}
      });
    });
    // Após (re)associar listeners, mantenha a UI do botão/badge consistente com qualquer alteração já existente no state
    try {
      const grupos = new Set(Object.keys(state.matrizAlocacao||{}).filter(k=> state.matrizAlocacao[k]).map(k=> extrairGrupoIdDeAlloc(k)).filter(Boolean));
      grupos.forEach(gid=>{
        const bloco = document.querySelector(`.bloco-grupo-aloc[data-grupo-id="${gid}"]`);
        if(!bloco) return;
        const badge = bloco.querySelector('.badge-alterado');
        const btnSalvar = bloco.querySelector('[data-acao-grupo="salvar"]');
        if(badge) badge.classList.add('d-none'); // limpe badges antigas; elas serão exibidas quando houver nova alteração
        if(btnSalvar) btnSalvar.classList.add('d-none');
      });
    } catch(_syncUi){}
    // Delegação para botões de ação por grupo
    if(!window.__acoesGrupoDelegacaoBound){
      window.__acoesGrupoDelegacaoBound = true;
      $('#wrapGruposAlocacaoRecurso').addEventListener('click', e=>{
      const btn = e.target.closest('[data-acao-grupo]');
      if(!btn) return;
      const acao = btn.getAttribute('data-acao-grupo');
      const bloco = btn.closest('.bloco-grupo-aloc');
      if(!bloco) return;
      const checks = $all('.chkAlocacaoRecurso', bloco);
      if(!checks.length) return;
      if(acao==='marcar') checks.forEach(c=>{ if(!c.checked){ c.checked=true; c.dispatchEvent(new Event('change')); }});
      else if(acao==='limpar') checks.forEach(c=>{ if(c.checked){ c.checked=false; c.dispatchEvent(new Event('change')); }});
      else if(acao==='inverter') checks.forEach(c=>{ c.checked=!c.checked; c.dispatchEvent(new Event('change')); });
      else if(acao==='salvar'){
        const gid = bloco.getAttribute('data-grupo-id');
        if(!gid){ toastInfo('Grupo não identificado.'); return; }
        salvarAlocacoesGrupo(gid, btn);
      }
      });
    }
  }

  function snapshotGrupo(grupoId){
    const prefix = '__'+grupoId+'::'; // não usamos assim; precisamos mapear turnoIds
  }

  // Modo diária: restringe a seleção da matriz para um único dia/turno (allocationId alvo)
  function aplicarRestricaoEscopoDiario(){
    try {
      const lock = state.__lockCtx || null;
      if(!lock || !lock.dia || !lock.turnoId) return;
      const diaISO = String(lock.dia);
      const turnoId = String(lock.turnoId);
      const alvoAlloc = diaISO + '__' + turnoId;
      // Garantir que a aba Alocação tenha sido renderizada ao menos uma vez
      if(!$all('.chkAlocacaoRecurso').length){
        try { gerarMatrizAlocacao(); atualizarMatrizAoClique(); } catch(_r){ }
      }
      // Desmarcar tudo que não seja o alvo e desabilitar todos os checkboxes fora do alvo
      $all('.chkAlocacaoRecurso').forEach(chk=>{
        const alloc = chk.getAttribute('data-allocation');
        const isAlvo = (alloc === alvoAlloc);
        if(!isAlvo){ chk.checked = false; chk.disabled = true; }
        else { chk.checked = true; chk.disabled = false; }
      });
      // Atualizar state.matrizAlocacao para conter apenas o allocation alvo como true
      const novo = {}; novo[alvoAlloc] = true; state.matrizAlocacao = novo;
      // Ocultar botões de ação em grupo e badges de alteração, pois não fazem sentido no lock diário
      $all('.bloco-grupo-aloc .acoes-grupo-aloc [data-acao-grupo]')
        .forEach(btn=>{ if(btn) btn.classList.add('d-none'); });
      $all('.bloco-grupo-aloc .badge-alterado')
        .forEach(b=>{ if(b) b.classList.add('d-none'); });
      // No modo diária, não há Atribuição nem Refeição: limpar estados e desativar/ocultar abas
      try {
        state.atribuicoes = {};
        state.refeicoes = {};
        state.__refPend = [];
        if(state.recurso){ try { delete state.recurso.membros; } catch(_){ } }
        // Desativar e ocultar as abas Atribuição e Refeição
        const tabAtr = document.getElementById('tab-atribuicao');
        const paneAtr = document.getElementById('pane-atribuicao');
        if(tabAtr){ tabAtr.setAttribute('disabled','true'); tabAtr.classList.add('disabled'); tabAtr.classList.add('d-none'); tabAtr.setAttribute('title','Indisponível neste modo'); }
        if(paneAtr){ paneAtr.classList.remove('show','active'); paneAtr.classList.add('d-none'); }
        const tabRef = document.getElementById('tab-refeicao');
        const paneRef = document.getElementById('pane-refeicao');
        if(tabRef){ tabRef.setAttribute('disabled','true'); tabRef.classList.add('disabled'); tabRef.classList.add('d-none'); tabRef.setAttribute('title','Indisponível neste modo'); }
        if(paneRef){ paneRef.classList.remove('show','active'); paneRef.classList.add('d-none'); }
      } catch(_tabs){ }
    } catch(err){ console.warn('[modal_recurso] aplicarRestricaoEscopoDiario falhou', err); }
  }

  const grupoAlteracoes = {}; // grupoId -> boolean se alterado
  function marcarAlteracaoGrupoPorAllocation(allocationId){
    // allocationId = yyyy-mm-dd__<grupoId>::hh:mm-hh:mm
    const m = allocationId.match(/__([^:]+)::/); // extrair parte antes do primeiro '::'
    if(!m) return;
    const grupoId = m[1];
    grupoAlteracoes[grupoId]=true;
    const bloco = document.querySelector(`.bloco-grupo-aloc[data-grupo-id="${grupoId}"]`);
    if(bloco){
      const badge = bloco.querySelector('.badge-alterado');
      if(badge) badge.classList.remove('d-none');
      const btnSalvar = bloco.querySelector('[data-acao-grupo="salvar"]');
      if(btnSalvar){ btnSalvar.classList.remove('d-none'); btnSalvar.disabled=false; }
    }
  }

  function extrairGrupoIdDeAlloc(alloc){ const m = String(alloc).match(/__([^:]+)::/); return m?m[1]:null; }

  async function salvarAlocacoesGrupo(grupoId, btnRef){
    if(window._lockSalvarGrupo) return;
    // Em modo diária, não permitir salvar por grupo (evita alterações fora do escopo do dia)
    try {
      if(state.__lockCtx && state.__lockCtx.dia && state.__lockCtx.turnoId){
        try { toastInfo('Salvar por grupo está indisponível na Escala Diária. Edite apenas a alocação do dia.'); } catch(_t){}
        return;
      }
    } catch(_guard){}
    window._lockSalvarGrupo = true;
    try {
      console.log('[modal_recurso] salvarAlocacoesGrupo chamado para grupo:', grupoId);
      console.log('[modal_recurso] state.matrizAlocacao keys:', Object.keys(state.matrizAlocacao).length);
      // Guardas e contexto
      let ridBase = state.recurso?.id || state.recurso?.referenciaGestorId || state.recurso?._id;
      let eid = state.recurso?.equipeId || document.getElementById('recursoEquipeSelect')?.value || null;
      let escalaId = window.__ESCALA_STATE__?.escalaId;
      if(!ridBase || !eid){ toastInfo('Recurso ou equipe não definidos. Salve os dados gerais antes.'); return; }
      if(!escalaId){ try { const u=new URL(location.href); escalaId = u.searchParams.get('id') || escalaId; } catch(_e){} }
      if(!escalaId){ toastInfo('Escala não identificada.'); return; }

  // Snapshot do estado atual (diagnóstico). Atenção: usaremos o DOM para coletar marcações reais do grupo.
  const current = { ...state.matrizAlocacao };
  const currTrue = Object.keys(current).filter(k=> current[k]===true);
  console.log('[modal_recurso] current keys:', Object.keys(current).length);
  console.log('[modal_recurso] current true total:', currTrue.length);
  console.log('[modal_recurso] current true grupo:', currTrue.filter(k=> String(extrairGrupoIdDeAlloc(k))===String(grupoId)).length);

      // Helpers locais (resolução robusta como em salvarAlocacoesNoBackend)
      const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      async function validarOuResolverEquipeId(eidAtual){
        async function tentar(){
          let rEsc = await fetch(base + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
          if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
          if(!rEsc.ok) return null;
          const js = await rEsc.json().catch(()=>null); const d = js && (js.data||js);
          const equipes = Array.isArray(d?.equipes)? d.equipes:[];
          if(eidAtual && equipes.some(eq=> (eq.id||eq._id) == eidAtual)) return eidAtual;
          const placaUp = state.recurso?.placa ? String(state.recurso.placa).toUpperCase() : null;
          for(const eq of equipes){ if(Array.isArray(eq.recursos)){ const hit = eq.recursos.find(x=> (x.id||x._id||x.referenciaGestorId)===ridBase || (placaUp && String(x.placa||x.codigo||'').toUpperCase()===placaUp)); if(hit) return (eq.id||eq._id||null); } }
          return null;
        }
        let resolved=null; for(let i=0;i<5 && !resolved;i++){ try { resolved = await tentar(); } catch(_){ } if(!resolved) await new Promise(r=> setTimeout(r, 200)); }
        return resolved || eidAtual;
      }
      async function resolverRidValido(escalaId, eidAtual, ridCandidato){
        try {
          const u = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eidAtual) + '/recursos/' + encodeURIComponent(ridCandidato);
          const r = await fetch(u, { credentials:'same-origin' }); if(r && r.ok) return ridCandidato;
        } catch(_){ }
        try {
          let rEsc = await fetch(base + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
          if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
          if(rEsc && rEsc.ok){
            const js = await rEsc.json().catch(()=>null); const d = js && (js.data||js);
            const eq=(Array.isArray(d?.equipes)? d.equipes:[]).find(e=> (e.id||e._id)==eidAtual);
            if(eq && Array.isArray(eq.recursos)){
              const placaUp = state.recurso?.placa ? String(state.recurso.placa).toUpperCase() : null;
              const nome = state.recurso?.nome ? String(state.recurso.nome).trim().toLowerCase() : null;
              const hit = eq.recursos.find(r=> (r.id||r._id||r.referenciaGestorId)===ridCandidato || (placaUp && String(r.placa||r.codigo||'').toUpperCase()===placaUp) || (nome && String(r.nome||'').trim().toLowerCase()===nome));
              if(hit && (hit.id||hit._id)) return hit.id||hit._id;
            }
          }
        } catch(_){ }
        return ridCandidato;
      }
      async function esperarRecursoDisponivel(escalaId, eidAtual, ridAlvo){
        const url = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eidAtual) + '/recursos/' + encodeURIComponent(ridAlvo);
        for(let tent=0; tent<8; tent++){
          try { const r = await fetch(url, { credentials:'same-origin' }); if(r && r.ok) return true; } catch(_e){}
          await new Promise(r=> setTimeout(r, 220 + tent*160));
        }
        return false;
      }

      // Resolver ids reais quando necessário (antes de mapear turno real)
      eid = await validarOuResolverEquipeId(eid);
      if(!eid){ toastInfo('Equipe não identificada no servidor.'); return; }
      // Agora montar alocacoesArr com equipe já validada, após resolver ids reais
      let rid = await resolverRidValido(escalaId, eid, ridBase);
      await esperarRecursoDisponivel(escalaId, eid, rid);

      // Obter alocações atuais do backend para preservar OUTROS grupos e substituir apenas este grupo
      let alocBackend = [];
      try {
        const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        const urlGet = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
        let r0 = await fetch(urlGet, { credentials:'same-origin' });
        if(!r0.ok){ try { r0 = await fetch('/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid), { credentials:'same-origin' }); } catch(_fb){} }
        if(r0 && r0.ok){
          const js0 = await r0.json().catch(()=>null);
          const rec0 = js0 && (js0.recurso || (js0.data && js0.data.recurso) || js0);
          if(rec0 && Array.isArray(rec0.alocacoes)){
            alocBackend = rec0.alocacoes.filter(a=> a && a.dia && a.turnoId).map(a=> ({ dia: normalizarDiaIso(a.dia), turnoId: String(a.turnoId) }));
          }
        }
        // Fallback: usar dados em memória se GET falhar
        if(!alocBackend.length && window.__ESCALA_STATE__){
          try {
            const eqs = Array.isArray(window.__ESCALA_STATE__.equipes)? window.__ESCALA_STATE__.equipes: [];
            const eq = eqs.find(e=> (e.id||e._id)==eid);
            const rec = eq && Array.isArray(eq.recursos) ? eq.recursos.find(r=> (r.id||r._id||r.referenciaGestorId)==rid) : null;
            const arr = rec && Array.isArray(rec.alocacoes) ? rec.alocacoes : [];
            alocBackend = arr.filter(a=> a && a.dia && a.turnoId).map(a=> ({ dia: normalizarDiaIso(a.dia), turnoId: String(a.turnoId) }));
          } catch(_mem){}
        }
      } catch(_bf){ /* silencioso */ }

      // Separar o que será preservado (outros grupos) e o que será substituído (grupo atual)
      // Estratégia principal: usar o DOM do grupo para listar todos os slots (dia|faixa) visíveis e substituir exatamente estes
      // Fallback: heurísticas por prefixo/range quando DOM não disponível
      const rangeFrom = (tid)=> (String(tid||'').match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
      const visibleGrupoSet = new Set(); // dia|range
      try {
        const blocoGrupo = document.querySelector(`.bloco-grupo-aloc[data-grupo-id="${grupoId}"]`);
        if(blocoGrupo){
          blocoGrupo.querySelectorAll('.chkAlocacaoRecurso').forEach(chk=>{
            const alloc = chk.getAttribute('data-allocation'); if(!alloc) return;
            const parts = String(alloc).split('__'); if(parts.length!==2) return; const diaISO = normalizarDiaIso(parts[0]);
            const m = String(parts[1]).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/);
            if(diaISO && m && m[1]) visibleGrupoSet.add(diaISO+'|'+m[1]);
          });
        }
      } catch(_dom){ }
      const rangesDoGrupo = (function(){
        const set = new Set();
        // 1) Preferir definição do grupo (fonte da verdade dos turnos)
        try {
          const gs = Array.isArray(window.__ESCALA_STATE__?.gruposTurnos) ? window.__ESCALA_STATE__.gruposTurnos : [];
          const g = gs.find(x=> String(x.id) === String(grupoId));
          if(g && Array.isArray(g.turnos)){
            g.turnos.forEach(t=>{ if(t && t.ini && t.fim) set.add(String(t.ini+'-'+t.fim)); });
          }
        } catch(_){ }
        // 2) Se ainda vazio, extrair do mapa global da escala (todas as chaves do grupo)
        try {
          if(!set.size){
            const matrizEscala = window.__ESCALA_STATE__?.matrizAlocacao || {};
            const prefix = String(grupoId) + '::';
            for(const k of Object.keys(matrizEscala)){
              const [turnoIdLeft] = String(k).split('|');
              if(turnoIdLeft && turnoIdLeft.startsWith(prefix)){
                const m = String(turnoIdLeft).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/);
                if(m && m[1]) set.add(m[1]);
              }
            }
          }
        } catch(_e){ }
        // 3) Último recurso: derivar de chaves locais deste recurso
        if(!set.size){ try { Object.keys(state.matrizAlocacao||{}).forEach(k=>{ const gid=extrairGrupoIdDeAlloc(k); if(String(gid)===String(grupoId)){ const token=String(k).split('__')[1]||''; const m=token.match(/(\d{2}:\d{2}-\d{2}:\d{2})$/); if(m&&m[1]) set.add(m[1]); } }); } catch(_d){} }
        return set;
      })();
      const preservedOutrosGrupos = [];
      const removidosGrupo = [];
      const grupoPrefix = String(grupoId) + '::';
      const gruposTurnos = Array.isArray(window.__ESCALA_STATE__?.gruposTurnos) ? window.__ESCALA_STATE__.gruposTurnos : [];
      function resolverGrupoERangePorTurnoIdDesconhecido(tidStr){
        try {
          for(const g of gruposTurnos){
            for(const t of (g.turnos||[])){
              const tids = [t.id, t.turnoId, t._id].map(x=> x!=null? String(x): null).filter(Boolean);
              if(tids.includes(tidStr)){
                const r = (t.ini && t.fim) ? String(t.ini+'-'+t.fim) : null;
                return { grupoId: String(g.id), range: r };
              }
            }
          }
        } catch(_){ }
        return null;
      }
      for(const a of alocBackend){
        const tid = String(a.turnoId||'');
        let rg = rangeFrom(tid);
        // Se temos DOM dos slots, usar correspondência exata por dia|faixa
        let pertenceAoGrupoAtual = false;
        if(visibleGrupoSet.size>0){
          if(!rg){ const info = resolverGrupoERangePorTurnoIdDesconhecido(tid); if(info && info.range) rg = info.range; }
          const key = normalizarDiaIso(a.dia)+'|'+(rg||'');
          pertenceAoGrupoAtual = rg ? visibleGrupoSet.has(key) : false;
        } else {
          // Fallback heurístico por prefixo/range/gruposTurnos
          pertenceAoGrupoAtual = tid.startsWith(grupoPrefix) || (rg && rangesDoGrupo.has(rg));
          if(!pertenceAoGrupoAtual){
            const info = resolverGrupoERangePorTurnoIdDesconhecido(tid);
            if(info){
              if(info.range && !rg) rg = info.range;
              if(info.grupoId && String(info.grupoId)===String(grupoId)){
                pertenceAoGrupoAtual = true;
                if(info.range) rangesDoGrupo.add(info.range);
              }
            }
          }
        }
        if(!pertenceAoGrupoAtual) preservedOutrosGrupos.push(a); else removidosGrupo.push({ dia: a.dia, turnoId: a.turnoId });
      }
      try { console.debug('[modal_recurso] salvarAlocacoesGrupo: removendo do backend (grupo=', grupoId, ')', removidosGrupo.length, 'itens'); } catch(_){ }

      // Construir nova lista somente com as marcações locais do grupo atual — DIRETO DO DOM do bloco, para evitar
      // qualquer ressincronização assíncrona do state que possa ter ocorrido.
      const equipeAtual = eid;
      let marcacoesGrupoLocais = [];
      try {
        const blocoGrupo = document.querySelector(`.bloco-grupo-aloc[data-grupo-id="${grupoId}"]`);
        const chks = blocoGrupo ? Array.from(blocoGrupo.querySelectorAll('.chkAlocacaoRecurso')) : [];
        const allocsMarcadas = chks.filter(c=> c.checked).map(c=> c.getAttribute('data-allocation')).filter(Boolean);
        marcacoesGrupoLocais = allocsMarcadas
          .map(alloc=> mapearTurnoRealDeAllocation(alloc, equipeAtual))
          .filter(x=> x && x.dia && x.turnoId);
        console.log('[modal_recurso][grupo] DOM marcadas (grupo=', grupoId, '):', marcacoesGrupoLocais.length);
      } catch(_domColeta){ console.warn('[modal_recurso] falha ao coletar marcações do DOM do grupo', _domColeta); }

      // Unir preservados + novas marcações do grupo atual, deduplicando por dia+faixa e preferindo marcação local
      const dedupe = new Map(); // key: dia|range -> { dia, turnoId }
      // Primeiro adicionar preservados
      preservedOutrosGrupos.forEach(a=>{
        const rg = rangeFrom(a.turnoId); const key = normalizarDiaIso(a.dia)+'|'+(rg||String(a.turnoId));
        if(!dedupe.has(key)) dedupe.set(key, { dia: normalizarDiaIso(a.dia), turnoId: a.turnoId });
      });
      // Depois aplicar locais do grupo (sobrepõe a mesma faixa no mesmo dia)
      marcacoesGrupoLocais.forEach(a=>{
        const rg = rangeFrom(a.turnoId); const key = normalizarDiaIso(a.dia)+'|'+(rg||String(a.turnoId));
        dedupe.set(key, { dia: normalizarDiaIso(a.dia), turnoId: a.turnoId });
      });
  let alocacoesArr = Array.from(dedupe.values());

      // Fallback agressivo: se não removemos nada do backend para o grupo, mas existem desmarcações locais
      // (ou seja, havia alocações do grupo no backend e agora total locais < backend do grupo), forçar replace do grupo
      try {
        const backendGrupoCount = removidosGrupo.length;
        const locaisGrupoCount = marcacoesGrupoLocais.length;
        if(backendGrupoCount>0 && locaisGrupoCount < backendGrupoCount){
          console.debug('[modal_recurso][grupo] fallback agressivo: backendGrupo=', backendGrupoCount, 'locaisGrupo=', locaisGrupoCount, '— aplicando replace total do grupo.');
          // alocacoesArr já contém preservedOutrosGrupos + locaisGrupo; então já é efetivamente um replace do grupo
        }
      } catch(_fb){ }

      // Recalcular alocacoesArr considerando 'current' possivelmente enriquecido pelo backfill
      try {
        const totalGrupoMarcadas = Object.keys(current).filter(k=> current[k]===true && String(extrairGrupoIdDeAlloc(k))===String(grupoId)).length;
        const totalFinal = alocacoesArr.length;
        console.debug('[modal_recurso][grupo] Merge seletivo: preservadas(outros)=', preservedOutrosGrupos.length, 'locais(grupo)=', totalGrupoMarcadas, 'final=', totalFinal);
        if(totalGrupoMarcadas===0){
          console.debug('[modal_recurso][grupo] Aviso: nenhuma marcação local detectada para o grupo', grupoId, '— verifique se as keys de state.matrizAlocacao possuem o prefixo do grupo.');
        }
      } catch(_log){ }

  // Enviar o MERGE completo (preservados de outros grupos + marcações do grupo atual) para o backend substituir a lista inteira.
  // Incluir também um mapa "matrizAlocacao" derivado para rastreabilidade (alguns backends usam).
  const matrizPayload = {}; alocacoesArr.forEach(a=>{ if(a && a.dia && a.turnoId){ matrizPayload[normalizarDiaIso(a.dia)+'__'+a.turnoId] = true; } });
  const recursoCompleto = { id: rid, nome: state.recurso?.nome||null, placa: state.recurso?.placa||null, equipeId: eid, alocacoes: alocacoesArr, matrizAlocacao: matrizPayload, clienteMandouAloc: true };

      // PUT com tentativas em /escalas e absoluto; fallback criar se 404
      let originalHTML = btnRef ? btnRef.innerHTML : '';
      if(btnRef){ btnRef.disabled=true; btnRef.innerHTML='<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Salvando...'; }
      console.log('[modal_recurso] salvarAlocacoesGrupo chamado para grupo:', grupoId);
  async function tryPut(u){ try{ console.log('PUT salvarAlocacoesGrupo:', u, recursoCompleto); return await fetch(u, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) }); } catch(_){ return { ok:false, status:-1, text: async()=>'' }; } }
      const tries = [
        base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid),
        '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid)
      ];
  console.log('[modal_recurso] tries:', tries, 'alocacoesArr.length:', alocacoesArr.length, 'preservados(outros)=', preservedOutrosGrupos.length, 'locais(grupo)=', marcacoesGrupoLocais.length);
      let ok=false, lastRes=null;
      for(const u of tries){ const r=await tryPut(u); lastRes=r; if(r && (r.ok || r.status===200 || r.status===204)) { ok=true; break; } }
      console.log('[modal_recurso] PUT result: ok=', ok, 'status=', lastRes ? lastRes.status : 'no response', 'url=', lastRes ? lastRes.url : 'none');
      if(!ok && lastRes && lastRes.status===404){
        // Criar e repetir PUT
        try {
          const postUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos';
          const rCreate = await fetch(postUrl, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: { id: rid, equipeId: eid, nome: state.recurso?.nome||null, placa: state.recurso?.placa||null } }) });
          if(rCreate && rCreate.ok){
            await new Promise(r=> setTimeout(r, 150));
            const putUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
            const rPut = await fetch(putUrl, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) });
            lastRes = rPut; ok = rPut && (rPut.ok || rPut.status===200 || rPut.status===204);
          }
        } catch(_c){ }
      }
      if(!ok){
        if(lastRes && lastRes.status===423){ try{ await (window.handleEscalaLockedResponse && window.handleEscalaLockedResponse(lastRes, { area:'recursos', oper:'salvar-alocacoes-grupo' })); }catch(_h){} return; }
        let msg='Falha ao salvar alocações do grupo';
        try { const t = await (lastRes && lastRes.text ? lastRes.text() : Promise.resolve('')); if(t) msg += ': ' + t; } catch(_){ }
        toastInfo(msg); return;
      }

      // Persistiu com sucesso: snapshot passa a refletir o estado atual completo
      alocacaoOriginal = JSON.stringify({ ...state.matrizAlocacao });
      // UI: esconder badge e desabilitar botão
      const bloco = document.querySelector(`.bloco-grupo-aloc[data-grupo-id="${grupoId}"]`);
      if(bloco){
        const badge = bloco.querySelector('.badge-alterado'); if(badge) badge.classList.add('d-none');
        const b = bloco.querySelector('[data-acao-grupo="salvar"]'); if(b){ b.disabled=false; b.classList.add('d-none'); b.innerHTML = '<i class="bi bi-save"></i> Salvar alterações'; }
      }
      // Regenerar abas de atribuição se necessário
      try { state.subAbasGeradas=false; gerarAbasAtribuicao(); } catch(_){ }
      // Refresh imediato do recurso do backend para re-hidratar atribuições e refeições
      try {
        const urlGet = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
        console.log('[modal_recurso] refresh GET:', urlGet);
        let r2 = await fetch(urlGet, { credentials:'same-origin' });
        if(!r2.ok){ try { r2 = await fetch('/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid), { credentials:'same-origin' }); } catch(_fbGet){} }
        console.log('[modal_recurso] refresh ok:', r2.ok, 'status:', r2.status);
        if(r2 && r2.ok){
          const js2 = await r2.json().catch(()=>null);
          const rec = js2 && js2.recurso ? js2.recurso : null;
          console.log('[modal_recurso] refresh alocacoes length:', rec ? rec.alocacoes.length : 'no rec');
          if(rec){
            state.recurso = { ...state.recurso, ...rec };
            try {
              const mapAloc = {};
              if(Array.isArray(rec.alocacoes)){
                rec.alocacoes.forEach(a=>{ if(a && a.dia && a.turnoId){ const k = normalizarAllocationKey(a.dia, a.turnoId, state.recurso?.equipeId); mapAloc[k]=true; } });
              }
              state.matrizAlocacao = mapAloc;
              console.log('[modal_recurso] state.matrizAlocacao updated, keys:', Object.keys(state.matrizAlocacao).length);
            } catch(_mapAl){ }
            try {
              if(rec.atribuicoesRecurso && typeof rec.atribuicoesRecurso==='object'){ state.atribuicoes = JSON.parse(JSON.stringify(rec.atribuicoesRecurso)); }
              else if(Array.isArray(rec.atribuicoes)){
                const m={}; rec.atribuicoes.forEach(a=>{ const dia=a?.dia; const turno=a?.turnoId||a?.turno; if(dia && turno){ const k=normalizarAllocationKey(dia, turno, state.recurso?.equipeId); if(!m[k]) m[k]=[]; m[k].push({ funcionarioId:a.membroFuncionarioId||a.funcionarioId||a.funcionario_id, nome:a.nome||a.funcionarioNome||null, atribuicao:a.papel||a.atribuicao||null }); }});
                state.atribuicoes = m;
              }
            } catch(_mapAt){ }
            try {
              if(rec.refeicoesRecurso && typeof rec.refeicoesRecurso==='object'){ state.refeicoes = JSON.parse(JSON.stringify(rec.refeicoesRecurso)); }
              else if(Array.isArray(rec.refeicoes)){
                const m={}; rec.refeicoes.forEach(iv=>{ const dia=iv?.dia||iv?.data; const turno=iv?.turnoId||iv?.turno; const ini=iv?.ini||iv?.inicio; const fim=iv?.fim||iv?.termino; if(dia && ini && fim){ const comp=(typeof iv?.computavel==='boolean')? iv.computavel : (!/nao[_ ]?computad|não[_ ]?computad/i.test(String(iv?.tipo||''))); if(turno){ const k=normalizarAllocationKey(dia, turno, state.recurso?.equipeId); if(!m[k]) m[k]=[]; m[k].push({ inicio:ini, fim:fim, computavel:comp, tipo:iv?.tipo||'ALMOCO' }); } }});
                state.refeicoes = m;
              }
            } catch(_mapRf){ }
            try { podarDadosOrfaosSemAlocacao(/*somenteSeCampoAlocInformado=*/true); } catch(_pd){}
            try { reindexarParaEquipeSelecionada(); } catch(_r){ }
            try { reconciliarRefeicoesComMatriz(); } catch(_r2){ }
            try { gerarAbasAtribuicao(); } catch(_ga){ }
            try { gerarTabelaRefeicoes(); } catch(_gr){ }
            try { gerarMatrizAlocacao(); } catch(_gm){ console.warn('[modal_recurso] gerarMatrizAlocacao pós-refresh falhou', _gm); }
            // IMPORTANTE: após re-render da matriz, reanexar listeners de change dos checkboxes
            try { atualizarMatrizAoClique(); } catch(_bind){ }
          }
        }
      } catch(_refreshErr){ console.warn('[modal_recurso] refresh pós-salvar grupo falhou', _refreshErr); }
      toastSucesso('Alocações do grupo salvas.');
    } catch(err){
      console.warn('[modal_recurso] salvarAlocacoesGrupo erro', err);
      toastInfo('Erro ao salvar alterações do grupo.');
    } finally {
      if(btnRef){ btnRef.disabled=false; btnRef.innerHTML='<i class="bi bi-save"></i> Salvar alterações'; }
      window._lockSalvarGrupo = false;
    }
  }

  // Remove chaves de atribuições/refeições que não possuem alocação ativa correspondente em state.matrizAlocacao
  // Quando somenteSeCampoAlocInformado=true, só aplica a poda se detectarmos que o backend informou explicitamente o campo
  // de alocações (mesmo que vazio) no último recurso hidratado (state.recurso) ou na origem passada (r/found)
  function podarDadosOrfaosSemAlocacao(somenteSeCampoAlocInformado, rOrig, foundOrig){
    try {
      const ativosSet = new Set(Object.keys(state.matrizAlocacao||{}).filter(k=> state.matrizAlocacao[k]));
      const campoAlocInformado = (()=>{
        if(!somenteSeCampoAlocInformado) return true;
        const r0 = rOrig || state.recurso || {};
        const f0 = foundOrig || {};
        return (
          ('alocacoes' in r0) || ('alocacoesRecurso' in r0) || ('matrizAlocacao' in r0) ||
          ('alocacoes' in f0) || ('alocacoesRecurso' in f0) || ('matrizAlocacao' in f0)
        );
      })();
      if(!campoAlocInformado) return; // não podar se não sabemos das alocações do backend
      // Atribuições
      if(state.atribuicoes && typeof state.atribuicoes==='object'){
        Object.keys(state.atribuicoes).forEach(k=>{ if(!ativosSet.has(k)) delete state.atribuicoes[k]; });
      }
      // Refeições
      if(state.refeicoes && typeof state.refeicoes==='object'){
        Object.keys(state.refeicoes).forEach(k=>{ if(!ativosSet.has(k)) delete state.refeicoes[k]; });
      }
    } catch(err){ console.warn('[modal_recurso] podarDadosOrfaosSemAlocacao falhou', err); }
  }

  function gerarAbasAtribuicao(){
    const lista = $('#listaAbasAtribuicao');
    const painel = $('#painelAtribuicaoAtual');
    if(!lista || !painel) return;
    const ativaAnterior = lista.querySelector('.nav-link.active')?.getAttribute('data-alloc');
    lista.innerHTML=''; painel.innerHTML='';
    const ativos = Object.keys(state.matrizAlocacao).filter(k=> state.matrizAlocacao[k]);
    if(!ativos.length){
      $('#containerAtribuicoes').classList.add('d-none');
      $('#msgAtribuicaoRecursoVazia').classList.remove('d-none');
      state.subAbasGeradas=false;
      return;
    }
    $('#containerAtribuicoes').classList.remove('d-none');
    $('#msgAtribuicaoRecursoVazia').classList.add('d-none');
    // Ordenar cronologicamente por data + hora inicial
    const ordenados = ativos.slice().sort((a,b)=>{
      const [dA,tA] = a.split('__'); const [dB,tB]=b.split('__');
      const hA = (String(tA).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || '00:00-00:00';
      const hB = (String(tB).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || '00:00-00:00';
      if(dA===dB) return hA.localeCompare(hB);
      return dA.localeCompare(dB);
    });
    let primeira=null;
    ordenados.forEach(alloc=>{
      const [data, turnoIdRaw] = alloc.split('__');
      const dia = new Date(data+'T00:00:00');
      const diaNum = String(dia.getDate()).padStart(2,'0');
      const labelData = diaNum;
      const m = turnoIdRaw.match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      const ini = m?m[1]:'--:--'; const fim=m?m[2]:'--:--';
      const ativa = ativaAnterior? (alloc===ativaAnterior):(!primeira);
      if(!primeira) primeira=alloc;
      const li = document.createElement('li');
      li.className='nav-item flex-shrink-0';
      li.innerHTML = `<button class="nav-link py-1 px-2 d-inline-block ${ativa?'active':''}" data-alloc="${alloc}" type="button" role="tab" style="min-width:90px;">`+
        `<div class="fw-semibold" style="font-size:.70rem">${labelData}</div>`+
        `<div style="font-size:.70rem">${ini} às ${fim}</div>`+
      `</button>`;
      lista.appendChild(li);
    });
    selecionarAllocAtribuicao(ativaAnterior || primeira);
    if(!abasAtribuicaoListenerBound){
      lista.addEventListener('click', e=>{
        const b = e.target.closest('button[data-alloc]');
        if(!b) return;
        selecionarAllocAtribuicao(b.getAttribute('data-alloc'));
      });
      abasAtribuicaoListenerBound = true;
    }
    state.subAbasGeradas = true;
  }

  function gerarConteudoAtribuicao(allocationId, turno, data, tabId){
  const lista = state.atribuicoes[allocationId]||[]; // atribuições deste recurso
  const equipeSelecionadaId = $('#recursoEquipeSelect').value;
  let equipe = (state.escala.equipes||[]).find(eq=> (eq.id||eq._id||eq.codigo||eq.nome||'') == equipeSelecionadaId) || null;
    // Fallbacks: tentar resolver equipe quando o select tem id sintético ou desatualizado
    if(!equipe || !Array.isArray(equipe.componentes)){
      // 1) Tentar procurar em __ESCALA_STATE__ por id
      try {
  const eq1 = (window.__ESCALA_STATE__?.equipes||[]).find(e=> (e.id||e._id||e.codigo||e.nome||'') == equipeSelecionadaId);
        if(eq1) equipe = eq1;
      } catch(_){ }
      // 2) Se ainda não, casar por nome do select
      if(!equipe){
        try {
          const sel=document.getElementById('recursoEquipeSelect');
          const nomeSel = sel && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].textContent||'').trim() : '';
          const alvoNome = nomeSel ? nomeSel.split('-').slice(1).join('-').trim().toLowerCase() : '';
          if(alvoNome){
            const eqByName = (window.__ESCALA_STATE__?.equipes||[]).find(e=> String(e.nome||'').trim().toLowerCase()===alvoNome);
            if(eqByName) equipe = eqByName;
          }
        } catch(_n){ }
      }
      // 3) Se o recurso atual já tem equipeId, preferi-la
      if((!equipe) && state.recurso && state.recurso.equipeId){
        const eqByRid = (window.__ESCALA_STATE__?.equipes||[]).find(e=> (e.id||e._id||'') == state.recurso.equipeId);
        if(eqByRid) equipe = eqByRid;
      }
      // 4) Se houver exatamente 1 equipe na escala, use-a
      if((!equipe) && Array.isArray(window.__ESCALA_STATE__?.equipes) && window.__ESCALA_STATE__.equipes.length===1){
        equipe = window.__ESCALA_STATE__.equipes[0];
      }
    }
    if(!equipe) equipe = {};

    // Backfill de nomes ausentes: usar membros do recurso e componentes da equipe
    try {
      const nomeLookup = new Map();
      // Membros persistidos no próprio recurso (quando existirem)
      try {
        const membros = Array.isArray(state.recurso?.membros) ? state.recurso.membros : [];
        membros.forEach(m=>{
          const fid = m?.funcionario_id || m?.funcionarioId || m?.id;
          if(fid && m?.nome){ nomeLookup.set(String(fid), String(m.nome)); }
        });
      } catch(_){ }
      // Componentes da equipe (quando disponíveis)
      try {
        if(Array.isArray(equipe?.componentes)){
          equipe.componentes.forEach(c=>{
            const fid = c?.id || c?._id;
            if(fid && c?.nome && !nomeLookup.has(String(fid))){ nomeLookup.set(String(fid), String(c.nome)); }
          });
        }
      } catch(_){ }
      // Preencher diretamente na lista renderizada se faltar nome
      if(Array.isArray(lista) && nomeLookup.size){
        lista.forEach(it=>{
          if(it && !it.nome && it.funcionarioId){
            const k = String(it.funcionarioId);
            if(nomeLookup.has(k)) it.nome = nomeLookup.get(k);
          }
        });
      }
    } catch(_bf){ /* fallback silencioso */ }

    // ===================== Disponibilidade de Funcionários por Dia =====================
    // Convenções aceitas para cada componente da equipe:
    // 1) componente.disponibilidade = [ { ini:'YYYY-MM-DD', fim:'YYYY-MM-DD' }, ... ]
    // 2) componente.diasDisponiveis = ['YYYY-MM-DD', ...]
    // 3) Ausente => assume disponível para todo o período da escala (fallback)
    // Construímos um mapa memoizado por equipeId em state.__cacheDisponibilidade
    if(!state.__cacheDisponibilidade) state.__cacheDisponibilidade = {};
    function construirMapaDisponibilidade(equipe){
      const map = {}; // funcId -> Set(diasISO)
      if(!equipe || !Array.isArray(equipe.componentes)) return map;
      // Determinar período base da escala para fallback
      let datasEscala=[]; try { const p=state.escala?.periodoBruto||state.escala?.periodo||null; } catch(_){ }
      // Se não temos lista consolidada de datas, derivar de window.__ESCALA_STATE__.periodo
      if(window.__ESCALA_STATE__?.periodo?.ini && window.__ESCALA_STATE__?.periodo?.fim){
        try {
          const ini = new Date(window.__ESCALA_STATE__.periodo.ini+'T00:00:00');
            const fim = new Date(window.__ESCALA_STATE__.periodo.fim+'T00:00:00');
            let cur=ini; while(cur<=fim){ datasEscala.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
        } catch(_d){ }
      }
      equipe.componentes.forEach(c=>{
        const fid = c.id||c._id; if(!fid) return;
        const diasSet = new Set();
        if(Array.isArray(c.diasDisponiveis) && c.diasDisponiveis.length){
          c.diasDisponiveis.forEach(d=>{ if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)) diasSet.add(d); });
        } else if(Array.isArray(c.disponibilidade) && c.disponibilidade.length){
          c.disponibilidade.forEach(r=>{
            const ini=r.ini||r.inicio||r.de||r.start; const fim=r.fim||r.fim||r.ate||r.end;
            if(!ini||!fim) return; try {
              let cur=new Date(ini+'T00:00:00'); const end=new Date(fim+'T00:00:00');
              while(cur<=end){ diasSet.add(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
            } catch(_r){ }
          });
        } else {
          // Fallback: todo período da escala
          datasEscala.forEach(d=> diasSet.add(d));
        }
        map[fid]=diasSet;
      });
      return map;
    }
    if(equipeSelecionadaId && !state.__cacheDisponibilidade[equipeSelecionadaId]){
      state.__cacheDisponibilidade[equipeSelecionadaId] = construirMapaDisponibilidade(equipe);
      console.debug('[modal_recurso][disponibilidade] mapa construído', equipeSelecionadaId, state.__cacheDisponibilidade[equipeSelecionadaId]);
    }
    const mapaDisp = state.__cacheDisponibilidade[equipeSelecionadaId] || {};
    const diaAllocation = (allocationId.split('__')[0]) || null;
    // Helpers de comparação
    function turnoRange(token){ const m=String(token||'').match(/(\d{2}:\d{2}-\d{2}:\d{2})$/); return m? m[1]: null; }
    const turnoTokenAtual = allocationId.split('__')[1]||'';
    const rangeAtual = turnoRange(turnoTokenAtual);
    // Equipe matching tolerante
  function isMesmaEquipe(rec){
      try {
        const recEq = rec.equipeId || rec.equipe_id || rec.equipe || null; if(recEq==null) return false;
        const tokens = new Set();
        if(equipeSelecionadaId) tokens.add(String(equipeSelecionadaId));
        if(equipe && equipe.id) tokens.add(String(equipe.id));
        if(equipe && equipe._id) tokens.add(String(equipe._id));
  if(equipe && equipe.nome) tokens.add(String(equipe.nome));
  if(equipe && equipe.codigo) tokens.add(String(equipe.codigo));
        if(tokens.has(String(recEq))) return true;
        if(equipe && String(equipe.nome||'')===String(recEq)) return true;
        // fallback: se existe apenas 1 equipe carregada, considerar mesma
        if(Array.isArray(window.__ESCALA_STATE__?.equipes) && window.__ESCALA_STATE__.equipes.length===1) return true;
      } catch(_){ }
      return false;
    }

    function funcionarioDisponivelNoDia(fid){
      const setDias = mapaDisp[fid];
      if(!setDias) return true; // se não mapeado, considerar disponível
      if(!diaAllocation) return true;
      return setDias.has(diaAllocation);
    }

    // --- BLOCO NOVO: utilidades de disponibilidade ---
    // Cache preguiçoso de mapa: allocationId -> Set(funcionarioId) por outros recursos
    if(!state.__cacheOcupacao){ state.__cacheOcupacao = { versao:0, porAlloc:{}, porRecurso:{} }; }

    function coletarAtivosRecurso(rec){
      // Retorna Set de allocationIds ativos para o recurso rec (usando mesmas convenções de state.matrizAlocacao)
      const ativos = new Set();
      try {
        const aloc = rec.alocacoesRecurso || rec.alocacoes || rec.matrizAlocacao || null;
        if(Array.isArray(aloc)){
          // formato possivelmente array de {dia, turnoId}
          aloc.forEach(a=>{ if(a && a.dia && a.turnoId){ ativos.add(a.dia+'__'+a.turnoId); } });
        } else if(aloc && typeof aloc==='object'){
          Object.entries(aloc).forEach(([k,v])=>{ if(v===true) ativos.add(k); });
        }
      } catch(_e){ }
      return ativos;
    }

    function funcionarioEstaOcupadoEmAlgumaAllocation(funcId){
      // Regra por alocação: bloquear apenas se o funcionário já estiver na MESMA alocação (dia+turno) em outro recurso da mesma equipe.
      const recAtualId = state.recurso && (state.recurso.id || state.recurso.referenciaGestorId);
      const [diaAloc, turnoToken] = String(allocationId).split('__');
      const rangeAloc = turnoRange(turnoToken);
      for(const rec of (window.__ESCALA_STATE__?.recursos||[])){
        if(!rec) continue;
        const recId = rec.id || rec.referenciaGestorId; if(recAtualId && recId === recAtualId) continue;
        if(!isMesmaEquipe(rec)) continue;
        // 1) Se houver mapa de atribuições por allocationId, verificar diretamente a allocationId atual
        const atribSrc = rec.atribuicoesRecurso || rec.atribuicoes || null;
        if(atribSrc && typeof atribSrc==='object' && !Array.isArray(atribSrc)){
          // verificação direta pela chave
          const arr = atribSrc[allocationId];
          if(Array.isArray(arr) && arr.some(a=> (a.funcionarioId||a.funcionario_id||a.membroFuncionarioId)===funcId)) return true;
          // verificação por dia+range (caso o token de turno seja diferente)
          for(const [k, arr2] of Object.entries(atribSrc)){
            if(!Array.isArray(arr2)) continue; const [diaK, turnoK] = String(k).split('__'); if(diaK!==diaAloc) continue; const rg=turnoRange(turnoK); if(rg && rg===rangeAloc){ if(arr2.some(a=> (a.funcionarioId||a.funcionario_id||a.membroFuncionarioId)===funcId)) return true; }
          }
        }
        // 2) Se as atribuições forem um array linear com dia/turnoId, comparar por dia+turno
        if(Array.isArray(atribSrc)){
          for(const a of atribSrc){
            const f=a?.funcionarioId||a?.funcionario_id||a?.membroFuncionarioId;
            const dia = a?.dia||a?.data; const turnoId = a?.turnoId||a?.turno; const rg=turnoRange(turnoId);
            if(f===funcId && dia===diaAloc && (turnoId===turnoToken || (rg && rg===rangeAloc))) return true;
          }
        }
        // 3) Fallback: se não há atribuições, mas o funcionário é membro e o recurso está ativo nesta allocation
        const ativosRec = coletarAtivosRecurso(rec);
        let ativoMesmoSlot = ativosRec.has(allocationId);
        if(!ativoMesmoSlot){
          // tentar casar por dia+range
          for(const key of ativosRec){ const [dK,tK]=String(key).split('__'); if(dK!==diaAloc) continue; const rg=turnoRange(tK); if(rg && rg===rangeAloc){ ativoMesmoSlot=true; break; } }
        }
        if(ativoMesmoSlot){
          if(Array.isArray(rec.membros)){
            for(const m of rec.membros){ const f=m?.funcionario_id||m?.funcionarioId||m?.id; if(f===funcId) return true; }
          }
        }
      }
      return false;
    }

    // Coletar funcionários já ocupados em OUTROS recursos da mesma equipe nesta alocação
    const ocupadosOutros = new Set();
    try {
      if(window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.recursos)){
        window.__ESCALA_STATE__.recursos.forEach(rec=>{
          if(!rec) return;
          const recId = rec.id || rec.referenciaGestorId; if(!recId) return;
          if(state.recurso && (state.recurso.id||state.recurso.referenciaGestorId) === recId) return;
          if(!isMesmaEquipe(rec)) return;
          const atribSrc = rec.atribuicoesRecurso || rec.atribuicoes || null;
          if(atribSrc && typeof atribSrc==='object' && !Array.isArray(atribSrc)){
            // apenas a allocation corrente
            const arr = atribSrc[allocationId]; if(Array.isArray(arr)) arr.forEach(a=>{ const f=a?.funcionarioId||a?.funcionario_id||a?.membroFuncionarioId; if(f) ocupadosOutros.add(f); });
            // e chaves equivalentes por dia+range
            for(const [k, arr2] of Object.entries(atribSrc)){ const [dK,tK]=String(k).split('__'); if(dK!==diaAllocation) continue; const rg=turnoRange(tK); if(rg && rg===rangeAtual){ if(Array.isArray(arr2)) arr2.forEach(a=>{ const f=a?.funcionarioId||a?.funcionario_id||a?.membroFuncionarioId; if(f) ocupadosOutros.add(f); }); } }
          } else if(Array.isArray(atribSrc)){
            atribSrc.forEach(a=>{ const f=a?.funcionarioId||a?.funcionario_id||a?.membroFuncionarioId; const d=a?.dia||a?.data; const rg=turnoRange(a?.turnoId||a?.turno); if(f && d===diaAllocation && rg && rg===rangeAtual) ocupadosOutros.add(f); });
          }
          // membros ocupam apenas se o recurso estiver ativo nesta allocation (ou equivalente por range)
          const ativosSet = coletarAtivosRecurso(rec);
          let ativoMesmo = ativosSet.has(allocationId);
          if(!ativoMesmo){ for(const key of ativosSet){ const [dK,tK]=String(key).split('__'); if(dK!==diaAllocation) continue; const rg=turnoRange(tK); if(rg && rg===rangeAtual){ ativoMesmo=true; break; } }
          }
          if(ativoMesmo && Array.isArray(rec.membros)) rec.membros.forEach(m=>{ const f=m?.funcionario_id||m?.funcionarioId||m?.id; if(f) ocupadosOutros.add(f); });
        });
      }
    } catch(errIndex){ console.warn('[modal_recurso] falha ao montar índice de ocupação', errIndex); }

    const efetivoBase = Array.isArray(equipe.componentes) ? equipe.componentes : [];
    const efetivoDisponivel = efetivoBase
      .filter(c=> !c.bloqueado)
      // disponibilidade diária
      .filter(c=> funcionarioDisponivelNoDia(c.id||c._id))
      // manter se não está listado neste próprio recurso nesta allocation
      .filter(c=> !lista.some(a=> a.funcionarioId === (c.id||c._id)))
      // aplicar regra abrangente de ocupação por overlap
      .filter(c=> !funcionarioEstaOcupadoEmAlgumaAllocation(c.id||c._id));
    console.debug('[modal_recurso][disponibilidade]', { allocationId, dia:diaAllocation, totalComponentes:(equipe.componentes||[]).length, disponiveis:efetivoDisponivel.length });

    // Sanitizar atribuições existentes fora da disponibilidade: marcar e ocultar (não remover para não perder histórico local)
    const listaRender = lista.map(it=>{
      if(it && it.funcionarioId && !funcionarioDisponivelNoDia(it.funcionarioId)){
        return { ...it, nome: (it.nome||'(indisponível)'), _indisponivel:true };
      }
      return it;
    });
    const safeName = allocationId.replace(/[^a-zA-Z0-9_]/g,'_');
    const htmlConteudo = `
      <div class="row g-2 align-items-end">
        <div class="col-md-5 col-lg-4">
          <label class="form-label">Efetivo disponível</label>
          <select class="form-select form-select-sm" data-select-efetivo="${allocationId}">
            <option value="" selected disabled>Selecione...</option>
            ${efetivoDisponivel.map(f=>`<option value="${f.id||f._id}">${f.nome}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4 col-lg-3">
          <label class="form-label">Atribuição</label>
          <input type="text" maxlength="30" class="form-control form-control-sm" data-atribuicao-input="${allocationId}" placeholder="Ex.: Motorista">
        </div>
        <div class="col-md-3 col-lg-2 d-grid">
          <label class="form-label invisible">.</label>
          <button type="button" class="btn btn-primary btn-sm" data-add-atribuicao="${allocationId}"><i class="bi bi-plus"></i> Adicionar</button>
        </div>
      </div>
      <div class="mt-3 table-responsive">
        <table class="table table-sm table-hover mb-0 align-middle text-center">
          <thead class="table-light"><tr class="text-center">
            <th style="width:180px;" class="text-center">Nome do funcionário</th>
            <th style="width:220px;" class="text-center">Atribuição</th>
            <th style="width:110px;" class="text-center">Ações</th>
          </tr></thead>
          <tbody data-list-atribuicao="${allocationId}" class="text-center">
            ${lista.map((it,idx)=>`<tr data-idx="${idx}"><td class="text-truncate" style="max-width:180px;" title="${it.nome}">${it.nome}</td><td>`+
              (it.editing
                ? `<input type=\"text\" class=\"form-control form-control-sm\" maxlength=\"30\" data-inline-edicao=\"${allocationId}\" data-idx=\"${idx}\" value=\"${(it.atribuicao||'').replace(/"/g,'&quot;')}\">`
                : (it.atribuicao
                    ? `<a href=\"#\" data-edit-atribuicao=\"${allocationId}\" data-idx=\"${idx}\" class=\"text-decoration-none\" title=\"Editar atribuição\">${it.atribuicao}</a>`
                    : `<a href=\"#\" data-edit-atribuicao=\"${allocationId}\" data-idx=\"${idx}\" class=\"text-decoration-none text-muted\" title=\"Definir atribuição\">(definir)</a>`)
              )+
            `</td><td><button type="button" class="btn btn-sm btn-outline-danger" data-remove-atribuicao="${allocationId}" data-idx="${idx}"><i class="bi bi-trash"></i></button></td></tr>`).join('')}
            ${''}
          </tbody>
        </table>
      </div>
      <div class="mt-3 small border rounded p-2">
        <div class="fw-bold mb-2">Alterações nos componentes do recurso:</div>
        <div class="d-flex flex-wrap gap-4 align-items-center" style="row-gap:.35rem;">
          <div class="form-check form-check-inline m-0">
            <input class="form-check-input" type="radio" name="escopoAplicacao_${safeName}" value="atual" id="escopo_${safeName}_atual" checked>
            <label for="escopo_${safeName}_atual" class="form-check-label">Aplicar somente à alocação atual</label>
          </div>
          <div class="form-check form-check-inline m-0">
            <input class="form-check-input" type="radio" name="escopoAplicacao_${safeName}" value="seguintes" id="escopo_${safeName}_seg">
            <label for="escopo_${safeName}_seg" class="form-check-label">Aplicar à atual e às alocações seguintes</label>
          </div>
          <div class="form-check form-check-inline m-0">
            <input class="form-check-input" type="radio" name="escopoAplicacao_${safeName}" value="todas" id="escopo_${safeName}_todas">
            <label for="escopo_${safeName}_todas" class="form-check-label">Aplicar a todas alocações</label>
          </div>
        </div>
        <div class="mt-2 d-flex gap-2 justify-content-end">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-cancel-atribuicao="${allocationId}">Cancelar</button>
          <button type="button" class="btn btn-success btn-sm" data-save-atribuicao="${allocationId}">Salvar</button>
        </div>
      </div>
    `;
    // Após renderização, filtramos assíncronamente quem estiver em ausência/férias no dia da alocação
    setTimeout(()=>{ try { filtrarEfetivoDisponivelPorIndisponibilidade(allocationId); } catch(_){ } }, 10);
    // Sincronizar recursos da equipe com backend para refletir atribuições salvas por outros modais
    (async ()=>{
      try {
        const escId = window.__ESCALA_STATE__?.escalaId || (new URL(location.href)).searchParams.get('id');
        if(!escId) return;
        const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
  let r = await fetch(base + '/api/escalas/' + encodeURIComponent(escId), { credentials:'same-origin' });
  if(!r.ok){ try { r = await fetch('/api/escalas/' + encodeURIComponent(escId), { credentials:'same-origin' }); } catch(_fb){} }
  if(!r.ok) return;
        const js = await r.json().catch(()=>null); const d = js && (js.data||js);
        const equipes = Array.isArray(d?.equipes)? d.equipes:[];
        // localizar equipe por id/nome
        const tokens = new Set(); if(equipeSelecionadaId) tokens.add(String(equipeSelecionadaId)); if(equipe && equipe.id) tokens.add(String(equipe.id)); if(equipe && equipe._id) tokens.add(String(equipe._id)); if(equipe && equipe.nome) tokens.add(String(equipe.nome));
        const eqAlvo = equipes.find(eq=> tokens.has(String(eq.id||eq._id)) || (equipe && eq.nome===equipe.nome));
        if(!eqAlvo || !Array.isArray(eqAlvo.recursos)) return;
        if(!Array.isArray(window.__ESCALA_STATE__.recursos)) window.__ESCALA_STATE__.recursos=[];
        const byId = new Map(window.__ESCALA_STATE__.recursos.map(r=> [String(r.id||r.referenciaGestorId||''), r]));
        let updated=false;
        eqAlvo.recursos.forEach(rr=>{
          const key = String(rr.id||rr.referenciaGestorId||''); if(!key) return;
          if(byId.has(key)){ const cur=byId.get(key); const merged={ ...cur };
            if(Array.isArray(rr.atribuicoes) || (rr.atribuicoes && typeof rr.atribuicoes==='object')) merged.atribuicoes = rr.atribuicoes;
            if(Array.isArray(rr.membros)) merged.membros = rr.membros;
            if(Array.isArray(rr.alocacoes) || (rr.alocacoes && typeof rr.alocacoes==='object')) merged.alocacoes = rr.alocacoes;
            const before = JSON.stringify(cur); const after = JSON.stringify(merged);
            if(before!==after){ Object.assign(cur, merged); updated=true; }
          } else { window.__ESCALA_STATE__.recursos.push({ ...rr }); updated=true; }
        });
        if(updated){ selecionarAllocAtribuicao(allocationId); }
      } catch(_e){ }
    })();
    return htmlConteudo;
  }

  function formatarAllocLabel(alloc){
    const [data, turnoId] = alloc.split('__');
    let turno = (state.escala.turnos||[]).find(t=> (t.id||t.label)==turnoId);
    if(!turno){
      const m = turnoId.match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      turno = { inicio: m?m[1]:'00:00', fim: m?m[2]:'00:00', label: (m?m[1]:'00:00')+' às '+(m?m[2]:'00:00') };
    }
    const dia = new Date(data+'T00:00:00');
    const diaNum = String(dia.getDate()).padStart(2,'0');
    const labelChip = `${diaNum} ${turno.inicio}-${turno.fim}`;
    return { labelChip, turno, data };
  }

  function selecionarAllocAtribuicao(alloc){
    const lista = $('#listaAbasAtribuicao');
    const painel = $('#painelAtribuicaoAtual');
    if(!lista || !painel || !alloc) return;
    lista.querySelectorAll('button[data-alloc]').forEach(b=>{
      const active = b.getAttribute('data-alloc')===alloc;
      b.classList.toggle('active', active);
    });
    const { turno, data } = formatarAllocLabel(alloc);
    painel.innerHTML = gerarConteudoAtribuicao(alloc, turno, data, 'painel');
    // Garantir filtro pós-render (caso não tenha sido enfileirado)
    try { filtrarEfetivoDisponivelPorIndisponibilidade(alloc); } catch(_){ }
  }

  function formatarDataBr(iso){ const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }

  function bindAtribuicaoEventos(){
    const painelRoot = document.getElementById('painelAtribuicaoAtual');
    if(!painelRoot) return; // elemento ainda não disponível
    if(painelRoot.__boundAtrib) return; // evita múltiplos binds
    painelRoot.__boundAtrib = true;
    painelRoot.addEventListener('click', e=>{
      const addBtn = e.target.closest('[data-add-atribuicao]');
      if(addBtn){
        const alloc = addBtn.getAttribute('data-add-atribuicao');
        const sel = $(`[data-select-efetivo="${alloc}"]`);
        const inp = $(`[data-atribuicao-input="${alloc}"]`);
        if(!sel.value){ toastInfo('Selecione um efetivo'); return; }
        const funcionarioId = sel.value;
        const funcionarioNome = sel.options[sel.selectedIndex].textContent;
        const atrib = inp.value.trim();
        state.atribuicoes[alloc] = state.atribuicoes[alloc]||[];
        if(state.atribuicoes[alloc].some(x=> x.funcionarioId===funcionarioId)){
          toastInfo('Já atribuído.'); return;
        }
        // Conflito apenas na mesma alocação (dia+turno) em outro recurso da mesma equipe
        if(window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.recursos)){
          const equipeIdSel = $('#recursoEquipeSelect').value;
          const [diaAloc, turnoToken] = String(alloc).split('__');
          const rangeAtual = (String(turnoToken).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
          const eqTokens = new Set([ String(equipeIdSel||'') ]);
          try { const eqSelObj = (window.__ESCALA_STATE__?.equipes||[]).find(e=> (e.id||e._id||e.codigo||e.nome||'')==equipeIdSel); if(eqSelObj){ if(eqSelObj.id) eqTokens.add(String(eqSelObj.id)); if(eqSelObj._id) eqTokens.add(String(eqSelObj._id)); if(eqSelObj.nome) eqTokens.add(String(eqSelObj.nome)); if(eqSelObj.codigo) eqTokens.add(String(eqSelObj.codigo)); } } catch(_){ }
          const conflito = window.__ESCALA_STATE__.recursos.some(rec=>{
            if(!rec) return false; const recId = rec.id || rec.referenciaGestorId; if(state.recurso && (state.recurso.id||state.recurso.referenciaGestorId)===recId) return false;
            const recEq = rec.equipeId || rec.equipe_id || rec.equipe || null; if(recEq==null) return false; const recEqStr = String(recEq); if(!eqTokens.has(recEqStr)) return false;
            const atribSrc = rec.atribuicoesRecurso || rec.atribuicoes || null;
            // mapa por allocationId
            if(atribSrc && typeof atribSrc==='object' && !Array.isArray(atribSrc)){
              const arr = atribSrc[alloc]; if(Array.isArray(arr)) return arr.some(a=> (a.funcionarioId||a.funcionario_id||a.membroFuncionarioId)===funcionarioId);
              // equivalência por dia + faixa
              for(const [k, arr2] of Object.entries(atribSrc)){
                if(!Array.isArray(arr2)) continue; const [dK, tK] = String(k).split('__'); if(dK!==diaAloc) continue;
                const rangeK = (String(tK).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
                if(rangeAtual && rangeK && rangeAtual===rangeK){ if(arr2.some(a=> (a.funcionarioId||a.funcionario_id||a.membroFuncionarioId)===funcionarioId)) return true; }
              }
              return false;
            }
            // array linear
            if(Array.isArray(atribSrc)){
              return atribSrc.some(a=> {
                const rg = (String(a.turnoId||a.turno||'').match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
                return (a.dia||a.data)===diaAloc && ((a.turnoId||a.turno)===turnoToken || (rangeAtual && rg && rangeAtual===rg)) && (a.funcionarioId||a.funcionario_id||a.membroFuncionarioId)===funcionarioId;
              });
            }
            // fallback: membro + recurso ativo nesta allocation
            const ativos = (function(){ const s=new Set(); try { const al=rec.alocacoes||rec.alocacoesRecurso||rec.matrizAlocacao||null; if(Array.isArray(al)) al.forEach(x=>{ if(x&&x.dia&&x.turnoId) s.add(x.dia+'__'+x.turnoId); }); else if(al && typeof al==='object') Object.entries(al).forEach(([k,v])=>{ if(v===true) s.add(k); }); } catch(_){ } return s; })();
            let ativoMesmo = ativos.has(alloc);
            if(!ativoMesmo){ for(const key of ativos){ const [dK,tK]=String(key).split('__'); if(dK!==diaAloc) continue; const rg=(String(tK).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1]||null; if(rangeAtual && rg && rangeAtual===rg){ ativoMesmo=true; break; } } }
            if(ativoMesmo && Array.isArray(rec.membros)) return rec.membros.some(m=> (m.funcionario_id||m.funcionarioId||m.id)===funcionarioId);
            return false;
          });
          if(conflito){ toastInfo('Funcionário já está atribuído em outro recurso nesta alocação.'); return; }
        }
        state.atribuicoes[alloc].push({ funcionarioId, nome: funcionarioNome, atribuicao: atrib });
        // Re-render somente o painel atual mantendo abas (não recriar lista inteira)
        selecionarAllocAtribuicao(alloc);
        return;
      }
      const remBtn = e.target.closest('[data-remove-atribuicao]');
      if(remBtn){
        const alloc = remBtn.getAttribute('data-remove-atribuicao');
        const idx = +remBtn.getAttribute('data-idx');
        state.atribuicoes[alloc].splice(idx,1);
        selecionarAllocAtribuicao(alloc);
        return;
      }
      const editLink = e.target.closest('[data-edit-atribuicao]');
      if(editLink){
        e.preventDefault();
        const alloc = editLink.getAttribute('data-edit-atribuicao');
        const idx = +editLink.getAttribute('data-idx');
        const item = (state.atribuicoes[alloc]||[])[idx];
        if(!item) return;
        item.editing = true;
        selecionarAllocAtribuicao(alloc);
        setTimeout(()=>{
          const inp = document.querySelector(`input[data-inline-edicao="${alloc}"][data-idx="${idx}"]`);
          if(inp){ inp.focus(); inp.select(); }
        },30);
        return;
      }
      const saveBtn = e.target.closest('[data-save-atribuicao]');
      if(saveBtn){
        (async ()=>{
          const alloc = saveBtn.getAttribute('data-save-atribuicao');
          const listaBase = (state.atribuicoes[alloc]||[]).map(x=>({ funcionarioId:x.funcionarioId, nome:x.nome, atribuicao:x.atribuicao }));
          // Determinar escopo
          const safeName = alloc.replace(/[^a-zA-Z0-9_]/g,'_');
          const escopo = (document.querySelector(`input[name="escopoAplicacao_${safeName}"]:checked`)?.value)||'atual';
          // Obter ordenação cronológica das alocações ativas
          const ativos = Object.keys(state.matrizAlocacao).filter(k=> state.matrizAlocacao[k]);
          const ordenados = ativos.slice().sort((a,b)=>{
            const [dA,tA] = a.split('__'); const [dB,tB]=b.split('__');
            const hA = (String(tA).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || '00:00-00:00';
            const hB = (String(tB).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || '00:00-00:00';
            if(dA===dB) return hA.localeCompare(hB);
            return dA.localeCompare(dB);
          });
          const idxAtual = ordenados.indexOf(alloc);
          if(idxAtual===-1){ toastInfo('Não foi possível posicionar a alocação.'); return; }
          let alvoLista = [];
          if(escopo==='atual') alvoLista = [alloc];
          else if(escopo==='seguintes') alvoLista = ordenados.slice(idxAtual); // inclui a atual
          else if(escopo==='todas') alvoLista = ordenados.filter(a=> a!==alloc);
          // Copiar base para alvos
          alvoLista.forEach(a=>{ state.atribuicoes[a] = listaBase.map(x=>({...x})); });
          // Remover conflitos com outros recursos e indisponibilidades (ausências/férias) nos alvos
          const equipeIdSel = $('#recursoEquipeSelect').value;
          for(const a of alvoLista){
            const diaAlvo = a.split('__')[0];
            const turnoAlvo = a.split('__')[1];
            const rangeAlvo = (String(turnoAlvo).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
            const arr = state.atribuicoes[a]||[];
            const filtrada = [];
            for(const item of arr){
              // Conflito apenas na mesma alocação 'a' em outro recurso da mesma equipe
              const conflita = (window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.recursos)) ? window.__ESCALA_STATE__.recursos.some(rec=>{
                if(!rec) return false; const recId = rec.id || rec.referenciaGestorId; if(state.recurso && (state.recurso.id||state.recurso.referenciaGestorId)===recId) return false;
                const recEq = rec.equipeId || rec.equipe_id || rec.equipe || null; const recEqStr=String(recEq);
                const eqTokens = new Set([ String(equipeIdSel||'') ]);
                try { const eqSelObj = (window.__ESCALA_STATE__?.equipes||[]).find(e=> (e.id||e._id||e.codigo||e.nome||'')==equipeIdSel); if(eqSelObj){ if(eqSelObj.id) eqTokens.add(String(eqSelObj.id)); if(eqSelObj._id) eqTokens.add(String(eqSelObj._id)); if(eqSelObj.nome) eqTokens.add(String(eqSelObj.nome)); if(eqSelObj.codigo) eqTokens.add(String(eqSelObj.codigo)); } } catch(_){ }
                if(!eqTokens.has(recEqStr)) return false;
                const atribSrc = rec.atribuicoesRecurso || rec.atribuicoes || null;
                if(atribSrc && typeof atribSrc==='object' && !Array.isArray(atribSrc)){
                  const arrX = atribSrc[a]; if(Array.isArray(arrX)) return arrX.some(x=> (x.funcionarioId||x.funcionario_id||x.membroFuncionarioId)===item.funcionarioId);
                  for(const [k, arr2] of Object.entries(atribSrc)){
                    if(!Array.isArray(arr2)) continue; const [dK,tK]=String(k).split('__'); if(dK!==diaAlvo) continue; const rg=(String(tK).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1]||null;
                    if(rangeAlvo && rg && rangeAlvo===rg){ if(arr2.some(x=> (x.funcionarioId||x.funcionario_id||x.membroFuncionarioId)===item.funcionarioId)) return true; }
                  }
                  return false;
                }
                if(Array.isArray(atribSrc)) return atribSrc.some(x=>{
                  const rg=(String(x.turnoId||x.turno||'').match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1]||null;
                  return (x.dia||x.data)===diaAlvo && ((x.turnoId||x.turno)===turnoAlvo || (rangeAlvo && rg && rangeAlvo===rg)) && (x.funcionarioId||x.funcionario_id||x.membroFuncionarioId)===item.funcionarioId;
                });
                // fallback: membro + alocação ativa
                const ativos = (function(){ const s=new Set(); try { const al=rec.alocacoes||rec.alocacoesRecurso||rec.matrizAlocacao||null; if(Array.isArray(al)) al.forEach(xx=>{ if(xx&&xx.dia&&xx.turnoId) s.add(xx.dia+'__'+xx.turnoId); }); else if(al && typeof al==='object') Object.entries(al).forEach(([k,v])=>{ if(v===true) s.add(k); }); } catch(_){ } return s; })();
                let ativoMesmo = ativos.has(a);
                if(!ativoMesmo){ for(const key of ativos){ const [dK,tK]=String(key).split('__'); if(dK!==diaAlvo) continue; const rg=(String(tK).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1]||null; if(rangeAlvo && rg && rangeAlvo===rg){ ativoMesmo=true; break; } } }
                if(ativoMesmo && Array.isArray(rec.membros)) return rec.membros.some(m=> (m.funcionario_id||m.funcionarioId||m.id)===item.funcionarioId);
                return false;
              }) : false;
              if(conflita) continue;
              // indisponível por ausência/férias no dia?
              const dispoDia = await isFuncionarioDisponivelNoDiaAPI(item.funcionarioId, diaAlvo);
              if(!dispoDia) continue;
              filtrada.push(item);
            }
            state.atribuicoes[a] = filtrada;
          }
          // Persistir no backend
          try {
            await salvarAtribuicoesNoBackend(alvoLista);
            toastSucesso(escopo==='atual'? 'Atribuições salvas no servidor.' : `Atribuições aplicadas e salvas para ${escopo==='seguintes'?'as alocações seguintes':'todas as alocações'}.`);
          } catch(err){
            console.warn('[modal_recurso][atribuicoes] falha persistir', err);
            toastInfo('Falha ao salvar atribuições no servidor.');
          }
        })();
        return;
      }
    });
    if(!window.__recursoInlineEditBound){
      document.addEventListener('keydown', ev=>{
        const inp = ev.target.closest('input[data-inline-edicao]');
        if(!inp) return;
        if(ev.key==='Escape'){
          const alloc = inp.getAttribute('data-inline-edicao');
          const idx = +inp.getAttribute('data-idx');
          const item = (state.atribuicoes[alloc]||[])[idx];
          if(item){ delete item.editing; selecionarAllocAtribuicao(alloc); }
        } else if(ev.key==='Enter'){
          const alloc = inp.getAttribute('data-inline-edicao');
          const idx = +inp.getAttribute('data-idx');
          const item = (state.atribuicoes[alloc]||[])[idx];
          if(item){ item.atribuicao = inp.value.trim(); delete item.editing; selecionarAllocAtribuicao(alloc); }
        }
      });
      document.addEventListener('blur', ev=>{
        const inp = ev.target.closest('input[data-inline-edicao]');
        if(!inp) return;
        const alloc = inp.getAttribute('data-inline-edicao');
        const idx = +inp.getAttribute('data-idx');
        const item = (state.atribuicoes[alloc]||[])[idx];
        if(item){ item.atribuicao = inp.value.trim(); delete item.editing; selecionarAllocAtribuicao(alloc); }
      }, true);
      window.__recursoInlineEditBound = true;
    }
  }

  function toastInfo(msg){ console.info('[recurso]', msg); }
  function toastSucesso(msg){ console.info('[recurso]', msg); }
  // Substituir por toasts visuais Bootstrap-like
  (function initToastsSistema(){
    if(window.__recurso_toasts_inicializado) return; window.__recurso_toasts_inicializado=true;
    const css = document.createElement('style');
    css.textContent = `
      .recurso-toast { font-size:.75rem; background:#fff; border:1px solid #dee2e6; border-left:4px solid #0d6efd; box-shadow:0 .25rem .5rem rgba(0,0,0,.05); padding:.5rem .75rem; border-radius:.35rem; margin-bottom:.5rem; display:flex; gap:.5rem; align-items:flex-start; animation: fadeSlide .35s ease; }
      .recurso-toast-success { border-left-color:#198754; }
      .recurso-toast-error { border-left-color:#dc3545; }
      .recurso-toast-warning { border-left-color:#ffc107; }
      @keyframes fadeSlide { from { opacity:0; transform:translateX(12px);} to { opacity:1; transform:translateX(0);} }
      .recurso-toast-close { background:transparent; border:0; font-size:.85rem; line-height:1; margin-left:auto; color:#6c757d; }
      .recurso-toast-close:hover { color:#000; }
    `;
    document.head.appendChild(css);
    function criar(tipo, msg){
      const cont = document.getElementById('toastRecursoContainer'); if(!cont) return;
      const div = document.createElement('div');
      div.className = `recurso-toast recurso-toast-${tipo}`;
      div.innerHTML = `<div class="flex-grow-1">${msg}</div><button type="button" class="recurso-toast-close" aria-label="Fechar">&times;</button>`;
      cont.appendChild(div);
      const tm = setTimeout(()=> remover(), 4500);
      function remover(){ if(div.parentNode){ div.classList.add('opacity-0'); div.style.transition='opacity .25s'; setTimeout(()=>div.remove(),250);} clearTimeout(tm); }
      div.querySelector('button').addEventListener('click', remover);
    }
    window.__toastRecurso = {
      info: m=>criar('info', m),
      sucesso: m=>criar('success', m),
      erro: m=>criar('error', m),
      aviso: m=>criar('warning', m)
    };
    // Redefinir helpers
    toastInfo = (m)=> window.__toastRecurso.info(m);
    toastSucesso = (m)=> window.__toastRecurso.sucesso(m);
  })();

  // ===== Helpers de disponibilidade por API para aba Atribuição =====
  const __cacheDisponDia = new Map(); // key: funcId|dia -> boolean
  async function isFuncionarioDisponivelNoDiaAPI(funcionarioId, diaISO){
    try {
      if(!funcionarioId || !diaISO) return true;
      const key = funcionarioId+'|'+diaISO;
      if(__cacheDisponDia.has(key)) return __cacheDisponDia.get(key);
      // Endpoint consolidado de disponibilidade diária: /api/disponibilidade-funcionario?funcionarioId&inicio&fim
      const base = (function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      let url = `${base}/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(funcionarioId)}&inicio=${diaISO}&fim=${diaISO}`;
      let r = await fetch(url, { credentials:'same-origin' });
      if(!r.ok){ // fallback absoluto sem prefixo
        try { r = await fetch(`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(funcionarioId)}&inicio=${diaISO}&fim=${diaISO}`, { credentials:'same-origin' }); } catch(_){ }
      }
      if(!r.ok){ __cacheDisponDia.set(key, true); return true; }
      const js = await r.json().catch(()=>null);
      // Considera disponível se houver algum intervalo livre cobrindo o dia inteiro
      let livre=true;
      if(js && js.ok && js.data && Array.isArray(js.data.free)){
        livre = js.data.free.some(int=> (int.inicio||int.ini||'').slice(0,10) <= diaISO && (int.fim||int.fimISO||'').slice(0,10) >= diaISO);
      }
      __cacheDisponDia.set(key, !!livre);
      return !!livre;
    } catch(_e){ return true; }
  }

  async function filtrarEfetivoDisponivelPorIndisponibilidade(allocationId){
    try {
      const sel = document.querySelector(`select[data-select-efetivo="${allocationId}"]`);
      if(!sel) return;
      const diaISO = allocationId.split('__')[0];
      const opts = Array.from(sel.options).filter(o=> o.value);
      const checks = await Promise.all(opts.map(async o=>({ o, ok: await isFuncionarioDisponivelNoDiaAPI(o.value, diaISO) })));
      let removidos=0;
      checks.forEach(({o, ok})=>{ if(!ok){ o.remove(); removidos++; } });
      if(removidos){ /* opcional: exibir nota */ }
    } catch(_){ }
  }

  async function salvarAtribuicoesNoBackend(listaAllocs){
    // Monta payload e faz PUT no recurso atual na equipe
    const rid = state.recurso?.id || state.recurso?.referenciaGestorId || state.recurso?._id;
  let eid = state.recurso?.equipeId || document.getElementById('recursoEquipeSelect')?.value;
    let escalaId = window.__ESCALA_STATE__?.escalaId;
    if(!rid) throw new Error('Recurso não definido');
    if(!escalaId){ try { const u=new URL(location.href); escalaId = u.searchParams.get('id') || escalaId; } catch(_e){} }
    if(!escalaId) throw new Error('Escala não identificada');
  // Resolver equipeId se estiver vazio ou divergente do backend
  const isHex24 = v=> /^[0-9a-fA-F]{24}$/.test(String(v||''));
  async function validarOuResolverEquipeId(eidAtual){
      const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      const equipeNomeSel = (function(){
        try {
          const sel=document.getElementById('recursoEquipeSelect');
          const txt = sel && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].textContent||'').trim() : null;
          if(!txt) return null;
          const m = txt.split('-');
          return (m.length>=2 ? m.slice(1).join('-') : txt).trim();
        } catch(_){ return null; }
      })();
      async function tentar(){
  let rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
  if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
        if(!rEsc.ok) return null;
        const js = await rEsc.json().catch(()=>null);
        const d = js && (js.data||js);
        const equipes = Array.isArray(d?.equipes)? d.equipes:[];
        // Se eidAtual existe e corresponde a alguma equipe, manter
        if(eidAtual && equipes.some(eq=> (eq.id||eq._id) == eidAtual)) return eidAtual;
        // Tentar localizar equipe que contenha o recurso pelo rid
        const ridC = rid;
        for(const eq of equipes){
          if(Array.isArray(eq.recursos)){
            const hit = eq.recursos.find(x=> (x.id||x._id||x.referenciaGestorId)===ridC || (state.recurso?.placa && String(x.placa||'').toUpperCase()===String(state.recurso.placa).toUpperCase()));
            if(hit) return (eq.id || eq._id || null);
          }
        }
        // Tentar por nome
        const alvoNome = (state.recurso?.equipeNome || equipeNomeSel || '').toLowerCase().trim();
        if(alvoNome){
          const byName = equipes.find(eq=> {
            const nomeEq = String(eq.nome||'').toLowerCase().trim();
            if(nomeEq===alvoNome) return true;
            const composed = (String(eq.codigo||'') + ' - ' + (eq.nome||'')).toLowerCase().trim();
            return composed=== (state.recurso?.equipeNome||equipeNomeSel||'').toLowerCase().trim();
          });
          if(byName) return (byName.id || byName._id || null);
        }
        return null;
      }
      let resolved=null; for(let i=0;i<5 && !resolved;i++){ try { resolved = await tentar(); } catch(_){} if(!resolved) await new Promise(r=> setTimeout(r, 200)); }
      if(resolved){
        try { const sel=document.getElementById('recursoEquipeSelect'); if(sel){ sel.value = resolved; } } catch(_s){}
        return resolved;
      }
      return eidAtual; // manter como está se não resolvido
  }

  // Persiste TODAS as alocações atuais do recurso (state.matrizAlocacao) no backend via PUT único.
  // Não mexe em atribuições/refeições.
  async function salvarAlocacoesNoBackend(){
    try {
      let ridBase = state.recurso?.id || state.recurso?._id || state.recurso?.referenciaGestorId;
      let eid = state.recurso?.equipeId || document.getElementById('recursoEquipeSelect')?.value;
      let escalaId = window.__ESCALA_STATE__?.escalaId || (function(){ try { return (new URL(location.href)).searchParams.get('id'); } catch(_){ return null; } })();
      if(!ridBase || !escalaId) throw new Error('Contexto incompleto para salvar alocações');
      // Resolver/validar equipeId pelo backend quando necessário
      async function validarOuResolverEquipeId(eidAtual){
        const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        async function tentar(){
          let rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
          if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
          if(!rEsc.ok) return null;
          const js = await rEsc.json().catch(()=>null); const d = js && (js.data||js);
          const equipes = Array.isArray(d?.equipes)? d.equipes:[];
          if(eidAtual && equipes.some(eq=> (eq.id||eq._id) == eidAtual)) return eidAtual;
          const placaUp = state.recurso?.placa ? String(state.recurso.placa).toUpperCase() : null;
          for(const eq of equipes){ if(Array.isArray(eq.recursos)){ const hit = eq.recursos.find(x=> (x.id||x._id||x.referenciaGestorId)===ridBase || (placaUp && String(x.placa||x.codigo||'').toUpperCase()===placaUp)); if(hit) return (eq.id||eq._id||null); } }
          return null;
        }
        let resolved=null; for(let i=0;i<5 && !resolved;i++){ try { resolved = await tentar(); } catch(_){ } if(!resolved) await new Promise(r=> setTimeout(r, 200)); }
        return resolved || eidAtual;
      }
      if(!eid) eid = await validarOuResolverEquipeId(eid);
      if(!eid) throw new Error('Equipe não identificada');
      // Resolver rid real aninhado sob a equipe
      async function resolverRidValido(escalaId, eid, ridCandidato){
        const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        try {
          const u = baseEsc + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(ridCandidato);
          const r = await fetch(u, { credentials:'same-origin' }); if(r.ok) return ridCandidato;
        } catch(_){ }
        try {
          let rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
          if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
          if(rEsc.ok){
            const js = await rEsc.json().catch(()=>null); const d = js && (js.data||js);
            const eq=(Array.isArray(d?.equipes)? d.equipes:[]).find(e=> (e.id||e._id)==eid);
            if(eq && Array.isArray(eq.recursos)){
              const placaUp = state.recurso?.placa ? String(state.recurso.placa).toUpperCase() : null;
              const nome = state.recurso?.nome ? String(state.recurso.nome).trim().toLowerCase() : null;
              const hit = eq.recursos.find(r=> (r.id||r._id||r.referenciaGestorId)===ridCandidato || (placaUp && String(r.placa||r.codigo||'').toUpperCase()===placaUp) || (nome && String(r.nome||'').trim().toLowerCase()===nome));
              if(hit && (hit.id||hit._id)) return hit.id||hit._id;
            }
          }
        } catch(_){ }
        return ridCandidato;
      }
      async function esperarRecursoDisponivel(escalaId, eid, ridAlvo){
        const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        const url = baseEsc + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(ridAlvo);
        for(let tent=0; tent<8; tent++){
          try { const r = await fetch(url, { credentials:'same-origin' }); if(r && r.ok) return true; } catch(_e){}
          await new Promise(r=> setTimeout(r, 220 + tent*160));
        }
        return false;
      }
      let rid = await resolverRidValido(escalaId, eid, ridBase);
      // Esperar recurso estar visível sob a equipe antes do PUT
      const visivel = await esperarRecursoDisponivel(escalaId, eid, rid);
      if(!visivel){ const novoRid = await resolverRidValido(escalaId, eid, rid); if(novoRid && novoRid!==rid) rid = novoRid; }
      // Montar array substitutivo de alocações a partir do estado atual
      const equipeAtual = eid;
      const alocacoesArr = Object.entries(state.matrizAlocacao||{})
        .filter(([_, v])=> !!v)
        .map(([alloc])=> mapearTurnoRealDeAllocation(alloc, equipeAtual))
        .filter(x=> x && x.dia && x.turnoId);
      try {
        const totalMarcadas = Object.entries(state.matrizAlocacao||{}).filter(([_,v])=> !!v).length;
        if(alocacoesArr.length !== totalMarcadas){
          console.warn('[modal_recurso][aloc-global] Algumas alocações foram descartadas por não encontrarem turnoId real na matriz da escala.', { totalMarcadas, enviadas: alocacoesArr.length });
        }
        console.debug('[modal_recurso][aloc-global] PUT alocações qtde=', alocacoesArr.length, alocacoesArr.slice(0,5));
      } catch(_log){ }
  const matrizPayload1 = {}; alocacoesArr.forEach(a=>{ if(a&&a.dia&&a.turnoId){ matrizPayload1[normalizarDiaIso(a.dia)+'__'+a.turnoId] = true; } });
  const recursoCompleto = { id: rid, equipeId: eid, alocacoes: alocacoesArr, matrizAlocacao: matrizPayload1, clienteMandouAloc: true };
      const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      const url1 = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
  console.debug('[modal_recurso][aloc-global] PUT', url1);
  console.log('PUT salvarAlocacoesNoBackend:', url1, recursoCompleto);
  let res = await fetch(url1, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) });
      if(!res.ok){
        // Tentar fallback absoluto sem prefixo
        try {
          const url2 = '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
          res = await fetch(url2, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) });
        } catch(_){ /* ignore */ }
      }
      if(!res.ok && res.status===404){
        // Como último recurso, tentamos criar e em seguida atualizar
        try {
          const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
          const postUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos';
          const rCreate = await fetch(postUrl, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: { id: rid, equipeId: eid } }) });
          if(rCreate.ok){
            await new Promise(r=> setTimeout(r, 150));
            const putUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
            res = await fetch(putUrl, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) });
          }
        } catch(_fb){ }
      }
      if(!res.ok){
        let msg='Falha ao salvar alocações iniciais';
        try { const err=await res.json(); if(err && err.error) msg += ': ' + err.error; } catch(_){ }
        throw new Error(msg);
      }
      // Re-hidratar rapidamente o recurso para refletir o que o backend consolidou
      try { await carregarDadosParaTabsSeNecessario('atribuicao', true); } catch(_){ }
      try { await carregarDadosParaTabsSeNecessario('refeicao', true); } catch(_){ }
    } catch(err){
      console.warn('[modal_recurso] salvarAlocacoesNoBackend falhou', err);
      throw err;
    }
  }

  if(!eid){
      const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      const equipeNomeSel = (function(){
        try {
          const sel=document.getElementById('recursoEquipeSelect');
          const txt = sel && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].textContent||'').trim() : null;
          if(!txt) return null;
          // Normaliza: se vier "CODIGO - Nome", usar a parte do nome
          const m = txt.split('-');
          return (m.length>=2 ? m.slice(1).join('-') : txt).trim();
        } catch(_){ return null; }
      })();
      async function tentarResolverEquipeId(){
        try {
    let rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
    if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
          if(!rEsc.ok) return null;
          const js = await rEsc.json().catch(()=>null);
          const d = js && (js.data||js);
          // 0) Algumas APIs expõem recursos no topo: d.recursos[].equipeId
          if(Array.isArray(d?.recursos)){
            const rtop = d.recursos.find(x=> (x.id||x._id||x.referenciaGestorId)===rid);
            if(rtop && (rtop.equipeId || rtop.equipe_id)){
              const val = rtop.equipeId || rtop.equipe_id;
              if(val) return val;
            }
          }
          const equipes = Array.isArray(d?.equipes)? d.equipes:[];
          // 1) Prioridade: encontrar equipe que contenha o recurso pelo id
          for(const eq of equipes){
            if(Array.isArray(eq.recursos)){
              const hit = eq.recursos.find(x=> (x.id||x._id||x.referenciaGestorId)===rid);
              if(hit) return (eq.id || eq._id || null);
            }
          }
          // 2) Se não achou por recurso, tentar por nome da equipe (do select ou armazenado)
          const alvoNome = (state.recurso?.equipeNome || equipeNomeSel || '').toLowerCase().trim();
          if(alvoNome){
            const byName = equipes.find(eq=> {
              const nomeEq = String(eq.nome||'').toLowerCase().trim();
              if(nomeEq===alvoNome) return true;
              // Tente casar também com "COD - Nome" vindo do select original
              const composed = (String(eq.codigo||'') + ' - ' + (eq.nome||'')).toLowerCase().trim();
              return composed=== (state.recurso?.equipeNome||equipeNomeSel||'').toLowerCase().trim();
            });
            if(byName) return (byName.id || byName._id || null);
          }
          return null;
        } catch(_){ return null; }
      }
      // Tentar resolver com mais tentativas (evita latência de escrita)
      let tentativa=0; while(tentativa<5 && (!eid)){
        const resolved = await tentarResolverEquipeId();
        if(resolved){ eid = resolved; break; }
        await new Promise(r=> setTimeout(r, 250 + tentativa*200));
        tentativa++;
      }
      // Fallback por estado global (nome da equipe)
      if((!eid) && window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.equipes)){
        const alvoNome = (state.recurso?.equipeNome || equipeNomeSel || '').toLowerCase().trim();
        if(alvoNome){
          const eq = window.__ESCALA_STATE__.equipes.find(e=> {
            const nomeEq = String(e.nome||'').toLowerCase().trim();
            if(nomeEq===alvoNome) return true;
            const composed = (String(e.codigo||'') + ' - ' + (e.nome||'')).toLowerCase().trim();
            return composed === (state.recurso?.equipeNome||equipeNomeSel||'').toLowerCase().trim();
          });
          if(eq) eid = eq.id || eq._id || eid;
        }
      }
    }
    // Mesmo com eid definido, valide contra o backend para evitar ids sintéticos não existentes
    eid = await validarOuResolverEquipeId(eid);
    if(!eid){ throw new Error('Equipe não identificada'); }
    // Converter mapa state.atribuicoes apenas para os allocationIds informados
    const atribs = [];
    for(const a of listaAllocs){
      const [diaRaw, turnoRaw] = a.split('__');
      const arr = state.atribuicoes[a]||[];
      arr.forEach(it=>{
        atribs.push({
          membroFuncionarioId: it.funcionarioId || it.funcionario_id,
          papel: it.atribuicao || it.papel || null,
          turnoId: turnoRaw,
          dia: diaRaw,
          escopo: 'dia+turno',
          prioridade: 0
        });
      });
    }
    // Pré-checagem: garantir que o recurso existe na equipe e, se necessário, ajustar o rid para o id real do nested
    async function resolverRidValido(escalaId, eid, ridCandidato){
      const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      // 1) Tentar GET direto do recurso com ridCandidato
      try {
        const u1 = baseEsc + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(ridCandidato);
        const r1 = await fetch(u1, { credentials:'same-origin' });
        if(r1.ok){ const js=await r1.json().catch(()=>null); if(js && js.ok){ return ridCandidato; } }
      } catch(_g1){ }
      // 2) GET da escala e localizar dentro da equipe
      try {
  let rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
  if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
        if(rEsc.ok){
          const js = await rEsc.json().catch(()=>null);
          const d = js && (js.data||js);
          const eq = (Array.isArray(d?.equipes)? d.equipes:[]).find(e=> (e.id||e._id) == eid);
          if(eq && Array.isArray(eq.recursos)){
            const placa = state.recurso?.placa ? String(state.recurso.placa).toUpperCase() : null;
            const nome = state.recurso?.nome ? String(state.recurso.nome).trim().toLowerCase() : null;
            const hit = eq.recursos.find(r=> (r.id===ridCandidato) || (r.referenciaGestorId===ridCandidato) || (placa && String(r.placa||'').toUpperCase()===placa) || (nome && String(r.nome||'').trim().toLowerCase()===nome));
            if(hit && (hit.id || hit._id)) return hit.id || hit._id;
          }
        }
      } catch(_g2){ }
      return ridCandidato;
    }
    let ridResolved = await resolverRidValido(escalaId, eid, rid);
    // Polling defensivo: aguardar o recurso aparecer na equipe antes do PUT
    async function esperarRecursoDisponivel(escalaId, eid, ridAlvo){
      const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      const url = baseEsc + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(ridAlvo);
      for(let tent=0; tent<10; tent++){
        try { const r = await fetch(url, { credentials:'same-origin' }); if(r && r.ok) return true; } catch(_e){}
        await new Promise(r=> setTimeout(r, 300 + tent*220));
      }
      return false;
    }
    const disponivel = await esperarRecursoDisponivel(escalaId, eid, ridResolved);
    if(!disponivel){
      // Tentar uma última resolução de rid e checar novamente
      const novoRid = await resolverRidValido(escalaId, eid, ridResolved);
      if(novoRid && novoRid !== ridResolved){ ridResolved = novoRid; }
      const disponivel2 = await esperarRecursoDisponivel(escalaId, eid, ridResolved);
      if(!disponivel2){
        // Não abortar aqui: vamos permitir que o PUT faça upsert ou, se 404, criar via POST e depois PUT atribuições
        console.warn('[modal_recurso][atribuicoes] recurso não encontrado via GET; seguindo com upsert via PUT/POST');
      }
    }
    // Construir payload completo do recurso para o PUT
    const nomeRec = state.recurso?.nome || null;
    const placaRec = state.recurso?.placa || null;
    // Alocações atuais (verdadeiras) -> array { dia, turnoId }
    let alocacoesArr=[];
    try {
      if(state.matrizAlocacao && typeof state.matrizAlocacao==='object'){
        alocacoesArr = Object.entries(state.matrizAlocacao)
          .filter(([k,v])=> !!v)
          .map(([alloc])=>{ const [diaRaw, turnoRaw]=alloc.split('__'); return { dia:diaRaw, turnoId:turnoRaw }; });
      }
    } catch(_al){ }
    // Membros derivados das atribuições (únicos)
    const membrosMap = new Map();
    for(const a of listaAllocs){
      const arr = state.atribuicoes[a]||[];
      arr.forEach(it=>{
        const fid = it.funcionarioId || it.funcionario_id; if(!fid) return;
        if(!membrosMap.has(fid)) membrosMap.set(fid, { funcionario_id: fid, nome: it.nome||null, atribuicao: it.atribuicao||it.papel||null, origemEquipe: null });
      });
    }
    const membrosArr = [...membrosMap.values()];
    const recursoCompleto = { id: ridResolved, equipeId: eid, nome: nomeRec, placa: placaRec, alocacoes: alocacoesArr, atribuicoes: atribs, membros: membrosArr, clienteMandouAloc: true };
    const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
    async function tryPut(u){ try{ console.log('PUT salvarAtribuicoesNoBackend:', u, recursoCompleto); return await fetch(u, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) }); } catch(_){ return { ok:false, status:-1, text: async()=>'' }; } }
    const tries = [
      base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid),
      '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid)
    ];
    let ok=false, lastRes=null, lastUrl=null;
    for(const u of tries){ const r=await tryPut(u); lastRes=r; lastUrl=u; if(r && (r.ok || r.status===200 || r.status===204)) { ok=true; break; } }
    // Se falhou com 404/500 recurso não encontrado, tente re-resolver rid e repetir uma vez; se seguir 404, criar via POST e refazer PUT
    if(!ok && lastRes && (lastRes.status===404 || lastRes.status===500)){
      try {
        const novoRid = await resolverRidValido(escalaId, eid, ridResolved);
        if(novoRid && novoRid !== ridResolved){
          ridResolved = novoRid;
          const recursoCompleto2 = { id: ridResolved, equipeId: eid, atribuicoes: atribs };
          for(const u of tries){ const r=await fetch(u, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto2 }) }); lastRes=r; lastUrl=u; if(r && (r.ok || r.status===200 || r.status===204)) { ok=true; break; } }
        }
        // Se ainda não ok e o status mais recente é 404, tentar criar o recurso via POST e depois PUT das atribuições
        if(!ok && lastRes && lastRes.status===404){
          const postUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos';
          const criarPayload = { id: ridResolved, equipeId: eid, nome: nomeRec, placa: placaRec, alocacoes: alocacoesArr, membros: membrosArr };
          try {
            const rCreate = await fetch(postUrl, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: criarPayload }) });
            if(rCreate.ok){
              // pequeno atraso para indexação e em seguida PUT somente das atribuições
              await new Promise(r=> setTimeout(r, 150));
              const putUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(ridResolved);
              const rPut2 = await fetch(putUrl, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: { id: ridResolved, equipeId: eid, atribuicoes: atribs } }) });
              lastRes = rPut2; lastUrl = putUrl; ok = rPut2 && (rPut2.ok || rPut2.status===200 || rPut2.status===204);
            } else {
              // mesmo que criar falhe, vamos expor o erro textual
              lastRes = rCreate; lastUrl = postUrl;
            }
          } catch(_c){ /* ignore network error; handled below */ }
        }
      } catch(_retry){ }
    }
    if(!ok){
      let msg='Falha ao salvar atribuições';
      try { const t = await (lastRes && lastRes.text ? lastRes.text() : Promise.resolve('')); if(t) msg += ': ' + t; } catch(_){ }
      console.warn('[modal_recurso][atribuicoes] PUT falhou url=', lastUrl, 'eid=', eid, 'rid=', ridResolved);
      throw new Error(msg);
    }
    const js = await lastRes.json().catch(()=>null);
    // Sincronizar retorno no state.recurso se vier atualizado
    if(js && (js.recurso || (js.data && js.data.recurso))){
      const r = js.recurso || js.data.recurso;
      state.recurso = { ...state.recurso, ...r };
      // Sync no estado global para que os outros recursos vejam atribuições ao montar a lista de disponíveis
      try {
        if(window.__ESCALA_STATE__){
          const ridSync = state.recurso.id || state.recurso.referenciaGestorId;
          if(!Array.isArray(window.__ESCALA_STATE__.recursos)) window.__ESCALA_STATE__.recursos = [];
          const i = window.__ESCALA_STATE__.recursos.findIndex(x=> (x && (x.id||x.referenciaGestorId))===ridSync);
          if(i>=0) window.__ESCALA_STATE__.recursos[i] = { ...window.__ESCALA_STATE__.recursos[i], ...state.recurso };
          else window.__ESCALA_STATE__.recursos.push({ ...state.recurso });
        }
      } catch(_sync){ }
    }
  }

  async function onSalvarDadosGerais(e){
    e.preventDefault();
    const btn = document.getElementById('btnSalvarDadosGeraisRecurso');
  const equipeSelect = $('#recursoEquipeSelect');
  const equipeId = equipeSelect.value;
    if(!equipeId){ toastInfo('Selecione a equipe'); return; }
    const nome = $('#recursoNome').value.trim();
    if(!nome){ toastInfo('Informe o nome do recurso'); return; }
    // Preparar referência do recurso selecionado (Gestor)
  const refId = $('#recursoSelecionadoId').value || null;
  const placaSel = document.getElementById('recursoSelecionadoPlaca')?.value || '';
  const marcaSel = document.getElementById('recursoSelecionadoMarca')?.value || '';
  const modeloSel = document.getElementById('recursoSelecionadoModelo')?.value || '';
  const campoRecursoEl = document.getElementById('campoPesquisarRecurso');
  const campoRecursoVal = (campoRecursoEl && campoRecursoEl.value) ? campoRecursoEl.value.trim() : '';
  const temSelecaoRecurso = !!(refId || campoRecursoVal);
    // Ajustar campo de exibição do recurso
    const campo = document.getElementById('campoPesquisarRecurso');
    const labelParts = [placaSel, marcaSel, modeloSel].filter(Boolean);
    if(temSelecaoRecurso && campo && labelParts.length){
      campo.value = labelParts.join(' - ');
      try { preencherCabecalho(); } catch(_){ }
    } else if(campo && !temSelecaoRecurso){
      // Não preencher automaticamente com nome/descricao quando não há seleção de recurso
      // Mantém o campo Recurso vazio em edição quando apropriado
      // Apenas atualiza cabeçalho para refletir o nome sem parênteses duplicados
      // sem alterar o campo de entrada
      try { preencherCabecalho(); } catch(_){ }
    }
    // Refletir marca/modelo no state para compor o rótulo padronizado
    try {
      if(!state.recurso) state.recurso = {};
      if(temSelecaoRecurso){
        if(marcaSel) state.recurso.marca = marcaSel;
        if(modeloSel) state.recurso.modelo = modeloSel;
        if(placaSel) state.recurso.placa = placaSel.toUpperCase();
      } else {
        // Não contaminar state com valores antigos dos hiddens se não houve seleção explícita
        delete state.recurso.placa; delete state.recurso.marca; delete state.recurso.modelo;
      }
    } catch(_syncMM){}
    // Garantir state básico antes de persistir
    state.recurso = state.recurso || {};
    state.recurso.nome = nome;
  state.recurso.equipeId = equipeId;
  try { state.recurso.equipeNome = (equipeSelect && equipeSelect.options[equipeSelect.selectedIndex] ? (equipeSelect.options[equipeSelect.selectedIndex].textContent||'').trim() : null); } catch(_){ }
    state.recurso.referenciaGestorId = refId || state.recurso.referenciaGestorId || null;
    if(placaSel){ state.recurso.placa = placaSel.toUpperCase(); }

    // Determinar escalaId
    let escalaId = window.__ESCALA_STATE__?.escalaId;
    if(!escalaId){
      try { const u=new URL(location.href); escalaId = u.searchParams.get('id') || escalaId; } catch(_e){}
      if(escalaId){ if(!window.__ESCALA_STATE__) window.__ESCALA_STATE__={}; window.__ESCALA_STATE__.escalaId=escalaId; }
    }
    if(!escalaId){ toastInfo('Salve os Dados Gerais da escala antes de adicionar recursos.'); return; }

    // Em modo diária, reforçar matriz com apenas a alocação alvo
    try {
      if(state.__lockCtx && state.__lockCtx.dia && state.__lockCtx.turnoId){
        const k = String(state.__lockCtx.dia) + '__' + String(state.__lockCtx.turnoId);
        state.matrizAlocacao = {}; state.matrizAlocacao[k] = true;
        // também limpar estruturas que não se aplicam
        state.atribuicoes = {}; state.refeicoes = {}; state.__refPend = [];
      }
    } catch(_forceM){ }
    // Montar payload para backend com alocações marcadas atualmente
    const payload = { nome, equipeId };
    if(temSelecaoRecurso){
      if(state.recurso.placa) payload.placa = state.recurso.placa;
      if(refId) payload.referenciaGestorId = refId;
    }
    // Se não houver nenhuma seleção em matriz, tentar marcar automaticamente conforme equipe (já ocorre no change da equipe)
    if(state.matrizAlocacao && Object.keys(state.matrizAlocacao).length){
      const alocsArr = Object.entries(state.matrizAlocacao)
        .filter(([k,v])=> v)
        .map(([alloc])=>{ const [diaRaw, turnoRaw]=alloc.split('__'); return { id:'al_'+Math.random().toString(16).slice(2), dia:diaRaw, turnoId:turnoRaw }; });
      if(alocsArr.length) payload.alocacoes = alocsArr;
    }

    // Criação/atualização do recurso na equipe
    const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
    let originalHTML = btn ? btn.innerHTML : '';
    try {
      if(btn){ btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Salvando...'; }
      let js;
      // Em diária com NOVO recurso, não reutilizar o id de referência (evita sobrescrever outras datas)
      const isLockDiaria = !!(state.__lockCtx && state.__lockCtx.dia && state.__lockCtx.turnoId);
      const existingId = state.recurso?.id || state.recurso?._id || null;
      const isNovoRecurso = (state.__recursoNovoAberto === true) || (!existingId);
      // Se for lock diário + novo: forçar POST com id sintético exclusivo
      let ridPrimario = existingId || null;
      let forcePostNovoId = null;
      if(isLockDiaria && isNovoRecurso){
        ridPrimario = null; // anula caminho de PUT-first
        forcePostNovoId = 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);
        try { payload.id = forcePostNovoId; } catch(_){ }
      }
      // Montar objeto completo para PUT quando aplicável
      const recursoCompletoBase = (()=>{
        // Por padrão NÃO enviar alocações (preserva existentes). Em lock diário, faremos merge seguro mais abaixo.
        const rc = { id: ridPrimario||undefined, nome, placa: state.recurso?.placa||undefined, equipeId };
        if(refId){ rc.referenciaGestorId = refId; }
        // Em criação (sem ridPrimario) usamos payload.alocacoes no POST; para PUT só atribuiremos após merge (lock diário).
        if(!ridPrimario && payload.alocacoes){ rc.alocacoes = payload.alocacoes; rc.clienteMandouAloc = true; }
        return rc;
      })();
      if(ridPrimario){
        // Tenta PUT direto; se 404, cai para POST
        const putUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(equipeId) + '/recursos/' + encodeURIComponent(ridPrimario);
        console.log('[modal_recurso][DG] Tentando PUT direto (id do recurso existente):', ridPrimario, putUrl);
        // Em modo diária, antes do PUT: buscar alocações atuais e MESCLAR a alocação alvo sem remover outras
        try {
          if(state.__lockCtx && state.__lockCtx.dia && state.__lockCtx.turnoId){
            // 1) Buscar recurso atual no backend para obter alocações existentes
            const urlGet = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(equipeId) + '/recursos/' + encodeURIComponent(ridPrimario);
            let recAtual=null;
            try {
              const r0 = await fetch(urlGet, { credentials:'same-origin' });
              if(r0 && r0.ok){ const js0 = await r0.json().catch(()=>null); recAtual = js0 && (js0.recurso || (js0.data && js0.data.recurso) || js0); }
            } catch(_g){ /* ignora */ }
            const existentes = Array.isArray(recAtual?.alocacoes) ? recAtual.alocacoes.map(a=> ({ dia: normalizarDiaIso(a.dia), turnoId: String(a.turnoId) })) : [];
            // 2) Mapear alocação alvo para turnoId real quando possível
            const alvoAllocId = String(state.__lockCtx.dia) + '__' + String(state.__lockCtx.turnoId);
            let alvo = mapearTurnoRealDeAllocation(alvoAllocId, equipeId) || { dia: normalizarDiaIso(state.__lockCtx.dia), turnoId: String(state.__lockCtx.turnoId) };
            // 3) Mesclar preservando outros dias/turnos (dedupe por dia|range)
            const keyRange = (tid)=>{ const m=String(tid||'').match(/(\d{2}:\d{2}-\d{2}:\d{2})$/); return m? m[1]: String(tid||''); };
            const dedupe = new Map();
            existentes.forEach(a=>{ const k = normalizarDiaIso(a.dia)+'|'+keyRange(a.turnoId); if(!dedupe.has(k)) dedupe.set(k, { dia: normalizarDiaIso(a.dia), turnoId: String(a.turnoId) }); });
            const kAlvo = normalizarDiaIso(alvo.dia)+'|'+keyRange(alvo.turnoId); dedupe.set(kAlvo, { dia: normalizarDiaIso(alvo.dia), turnoId: String(alvo.turnoId) });
            const merged = Array.from(dedupe.values());
            // 4) Aplicar no recursoCompletoBase para que o backend substitua pela lista mesclada
            recursoCompletoBase.alocacoes = merged;
            recursoCompletoBase.clienteMandouAloc = true;
          }
        } catch(_mergeLock){ console.warn('[modal_recurso][DG] merge lock diário falhou; seguindo com PUT sem alocacoes', _mergeLock); }
        let resPut = await fetch(putUrl, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompletoBase }) });
        if(!resPut.ok && resPut.status===404){
          // Em edição, evitar criar duplicado; orientar usuário
          toastInfo('Recurso a editar não foi encontrado nesta equipe. A edição foi abortada para evitar duplicidade.');
          return;
        } else if(!resPut.ok){
          // Outro erro diferente de 404
          let msg='Falha ao salvar recurso (PUT)';
          try { const err=await resPut.json(); if(err && err.error){ msg += ': ' + err.error; } } catch(_){ }
          toastInfo(msg); return;
        } else {
          js = await resPut.json();
        }
      } else {
        // Sem id (ou forçado lock diário novo): fluxo cria via POST com id sintético quando aplicável
        const postUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(equipeId) + '/recursos';
        // Garantir id exclusivo em lock diário
        if(isLockDiaria && isNovoRecurso){
          try { if(!payload.id) payload.id = forcePostNovoId || ('r_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8)); } catch(_){ }
        }
        // Incluir referenciaGestorId no POST se selecionado
        if(refId) payload.referenciaGestorId = refId;
        const res = await fetch(postUrl, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: payload }) });
        if(!res.ok){
          let msg='Falha ao criar recurso';
          try { const err=await res.json(); if(err && err.error){ msg += ': ' + err.error; } } catch(_){ }
          toastInfo(msg); return;
        }
        js = await res.json();
      }
  // Normalizar resposta do backend em diferentes formatos
  let recursoResp = null;
  if(js && js.ok && js.recurso) recursoResp = js.recurso;
  else if(js && js.recurso) recursoResp = js.recurso;
  else if(js && js.data && js.data.recurso) recursoResp = js.data.recurso;
  else if(js && (js.id || js._id || js.nome || js.placa)) recursoResp = js; // objeto direto
  if(!recursoResp){ toastInfo('Resposta inesperada ao salvar recurso.'); return; }
  // Sincronizar estado com retorno do backend
  state.recurso = { ...recursoResp, _persisted:true };
  // Modo diária: garantir que não existam membros/atribuições/refeições no estado recém-hidratado
  try {
    if(state.__lockCtx){
      if(Array.isArray(state.recurso.membros)) delete state.recurso.membros;
      if(state.recurso.atribuicoes || state.recurso.atribuicoesRecurso){ delete state.recurso.atribuicoes; delete state.recurso.atribuicoesRecurso; }
      if(state.recurso.refeicoes || state.recurso.refeicoesRecurso){ delete state.recurso.refeicoes; delete state.recurso.refeicoesRecurso; }
    }
  } catch(_){ }
  console.log('[modal_recurso][DG] Recurso persistido com sucesso:', state.recurso.id || state.recurso._id || state.recurso.referenciaGestorId);
    try { aplicarRegraBloqueioEquipe(); } catch(_){ }
      // Após persistir, tentar resolver e fixar o ObjectId real da equipe para evitar IDs sintéticos
      try {
        const ridFix = state.recurso.id || state.recurso._id || state.recurso.referenciaGestorId;
        const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        const escIdFix = window.__ESCALA_STATE__?.escalaId || (new URL(location.href)).searchParams.get('id');
        if(escIdFix){
          const rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escIdFix), { credentials:'same-origin' });
          if(rEsc.ok){
            const jsd = await rEsc.json();
            const d = jsd && (jsd.data||jsd);
            // Tentar primeiro via recursos no topo
            if(Array.isArray(d?.recursos)){
              const rtop = d.recursos.find(x=> (x.id||x._id||x.referenciaGestorId)===ridFix);
              if(rtop && (rtop.equipeId || rtop.equipe_id)){
                state.recurso.equipeId = rtop.equipeId || rtop.equipe_id;
              }
            }
            // Se ainda não definido, procurar por equipes
            if(!state.recurso.equipeId){
              const equipes = Array.isArray(d?.equipes)? d.equipes:[];
              for(const eq of equipes){
                if(Array.isArray(eq.recursos) && eq.recursos.some(x=> (x.id||x._id||x.referenciaGestorId)===ridFix)){
                  const realEqId = eq.id || eq._id || null;
                  if(realEqId){ state.recurso.equipeId = realEqId; }
                  break;
                }
              }
            }
          }
        }
      } catch(_fixEq){ /* noop */ }
      // Recarregar lista de equipes do backend e ajustar seleção para garantir que o select tenha ObjectIds reais
      try {
        await carregarEquipes();
        const sel = document.getElementById('recursoEquipeSelect');
        if(sel && state.recurso.equipeId){ sel.value = state.recurso.equipeId; }
          try { aplicarRegraBloqueioEquipe(); } catch(_){ }
      } catch(_rsel){ }
  // Atualizar cabeçalho e UI
      preencherCabecalho();
  try { if(temSelecaoRecurso) atualizarRotuloCampoRecurso(); } catch(_){ }
      $('#btnSalvarRecursoFinal').disabled = false;
      // Regenerar matriz e eventos para refletir marcações
      gerarMatrizAlocacao();
      atualizarMatrizAoClique();
  // Requisito: após salvar novo recurso, bloquear campos e desativar botão Salvar de Dados Gerais
  try { bloquearDadosGeraisCampos(true); } catch(_b){ }
      state.subAbasGeradas = false;
      gerarAbasAtribuicao();
      // Habilitar abas avançadas
      try {
        ['tab-alocacao','tab-atribuicao','tab-refeicao'].forEach(id=>{
          const el=document.getElementById(id); if(el){ el.removeAttribute('disabled'); el.classList.remove('disabled'); el.removeAttribute('title'); }
        });
        // Em modo diária, manter apenas a aba Alocação visível e desativar as demais
        if(state.__lockCtx){
          const tabAtr=document.getElementById('tab-atribuicao'); const paneAtr=document.getElementById('pane-atribuicao');
          const tabRef=document.getElementById('tab-refeicao'); const paneRef=document.getElementById('pane-refeicao');
          if(tabAtr){ tabAtr.setAttribute('disabled','true'); tabAtr.classList.add('disabled','d-none'); tabAtr.setAttribute('title','Indisponível neste modo'); }
          if(paneAtr){ paneAtr.classList.remove('show','active'); paneAtr.classList.add('d-none'); }
          if(tabRef){ tabRef.setAttribute('disabled','true'); tabRef.classList.add('disabled','d-none'); tabRef.setAttribute('title','Indisponível neste modo'); }
          if(paneRef){ paneRef.classList.remove('show','active'); paneRef.classList.add('d-none'); }
          // Limpar dados dessas abas para não vazar no payload
          state.atribuicoes = {}; state.refeicoes = {}; state.__refPend = [];
        }
      } catch(_eHab){}
      // Incluir recurso na lista global para regras de conflito (quando existir)
      try {
        if(window.__ESCALA_STATE__){
          if(!Array.isArray(window.__ESCALA_STATE__.recursos)) window.__ESCALA_STATE__.recursos = [];
          const rid = state.recurso.id || state.recurso.referenciaGestorId;
          const idx = window.__ESCALA_STATE__.recursos.findIndex(r=> (r.id||r.referenciaGestorId)===rid);
          // Em lock diário, evite propagar membros/atribuições/refeições para o estado global
          const clone = { ...state.recurso };
          if(state.__lockCtx){ delete clone.membros; delete clone.atribuicoes; delete clone.atribuicoesRecurso; delete clone.refeicoes; delete clone.refeicoesRecurso; }
          if(idx===-1) window.__ESCALA_STATE__.recursos.push(clone); else window.__ESCALA_STATE__.recursos[idx] = clone;
        }
      } catch(_sync){ }
  // Feedback imediato apenas da criação do recurso; as alocações serão salvas a seguir (quando aplicável)
  toastSucesso('Recurso criado.');
          // Atualizar lista da aba Recursos imediatamente
          try {
            if(window.__ESCALA_STATE__){
              const ridSync = state.recurso.id || state.recurso._id || state.recurso.referenciaGestorId;
              if(!Array.isArray(window.__ESCALA_STATE__.recursos)) window.__ESCALA_STATE__.recursos = [];
              const idx = window.__ESCALA_STATE__.recursos.findIndex(r=> (r.id||r._id||r.referenciaGestorId)===ridSync);
              const clone = { ...state.recurso };
              if(idx>=0) window.__ESCALA_STATE__.recursos[idx] = clone; else window.__ESCALA_STATE__.recursos.push(clone);
            }
          } catch(_syncList){}
          try { if(typeof window.renderRecursos==='function') window.renderRecursos(); } catch(_rend){}
          // Se for realmente um novo recurso (não edição), montar TODAS as alocações programaticamente e salvar automaticamente uma vez
          // EXCETO quando em modo diária (lockCtx), onde só a alocação alvo deve existir
          try {
            const podeAutoInit = (state.__recursoNovoAberto === true && state._jaInicializouAlocacoes !== true);
            state._jaInicializouAlocacoes = true;
            if(podeAutoInit && !state.__lockCtx){
              // Garantir dados globais da escala e equipe selecionada antes de montar a matriz
              try { await ensureEscalaGlobal(); } catch(_){ }
              try { const sel=document.getElementById('recursoEquipeSelect'); if(sel && state.recurso?.equipeId){ sel.value = state.recurso.equipeId; } } catch(_){ }
              // Construir matriz completa de alocações para a equipe com base na matriz global da escala
              const arr = construirAlocacoesParaEquipe(state.recurso?.equipeId);
              // Sincronizar state.matrizAlocacao
              state.matrizAlocacao = {};
              arr.forEach(a=>{ if(a && a.dia && a.turnoId){ const k = String(a.dia)+'__'+String(a.turnoId); state.matrizAlocacao[k]=true; } });
              try { gerarMatrizAlocacao(); atualizarMatrizAoClique(); } catch(_){ }
              // Persistir no backend como estado inicial (substitui alocações)
              if(arr.length===0){
                // Nada a persistir; informar suavemente
                toastInfo('Recurso criado. Nenhuma alocação da equipe encontrada no período para salvar.');
              } else {
                try {
                  await salvarAlocacoesNoBackend();
                  toastSucesso('Alocações iniciais salvas no servidor.');
                } catch(_salvarInit){
                  console.warn('[modal_recurso] persistência automática de alocações iniciais falhou', _salvarInit);
                  toastInfo('Recurso criado, mas houve falha ao salvar as alocações iniciais. Tente salvar pela aba Alocação.');
                }
              }
              // Atualizar UI dependente
              try { gerarAbasAtribuicao(); } catch(_){ }
            } else if(state.__lockCtx){
              // Em modo diária: garantir apenas o allocation alvo e aplicar restrição de escopo
              try { aplicarRestricaoEscopoDiario(); } catch(_){ }
            }
          } catch(_autoInit){ }
    } catch(err){
      console.warn('[modal_recurso][onSalvarDadosGerais] erro persistir', err);
      toastInfo('Erro de rede ao salvar. Tente novamente.');
    } finally {
      if(btn){ btn.innerHTML=originalHTML; btn.disabled=false; }
    }
  }

  // Limpa campos de dados gerais quando modal abre para novo recurso
  function resetDadosGerais(){
    try {
      $('#recursoNome').value='';
      $('#recursoEquipeSelect').value='';
      $('#recursoSelecionadoId').value='';
      $('#campoPesquisarRecurso') && ($('#campoPesquisarRecurso').value='');
      // Limpar hiddens vinculados ao Recurso selecionado
      try { const hP=document.getElementById('recursoSelecionadoPlaca'); if(hP) hP.value=''; } catch(_){ }
      try { const hM=document.getElementById('recursoSelecionadoMarca'); if(hM) hM.value=''; } catch(_){ }
      try { const hMd=document.getElementById('recursoSelecionadoModelo'); if(hMd) hMd.value=''; } catch(_){ }
      // Limpar placa/marca/modelo no state para não herdar valores
      try { if(state && state.recurso){ delete state.recurso.placa; delete state.recurso.marca; delete state.recurso.modelo; delete state.recurso.referenciaGestorId; } } catch(_){ }
      // Não desabilitar o salvar final; ele validará e persistirá conforme necessário
      const b=document.getElementById('btnSalvarRecursoFinal'); if(b){ b.disabled=false; }
      // Reset de flags de inicialização para suportar múltiplas criações na mesma sessão
      state.__recursoNovoAberto = true;
      state._jaInicializouAlocacoes = false;
      // Em novo recurso, liberar edição dos dados gerais e habilitar o botão salvar de dados gerais
  try { bloquearDadosGeraisCampos(false); } catch(_unlock){}
    } catch(_e) { /* ignora se algum campo não existir */ }
  }

  function abrir(modalState){
    modalEl = document.getElementById(modalId);
    if(!modalEl){ console.error('Modal recurso não encontrado'); return; }
    if(!bsModal) bsModal = new bootstrap.Modal(modalEl);
    state.escala = montarEscalaContexto(modalState.escala);
    // Guardar contexto de lock (modo diária) quando fornecido
    state.__lockCtx = (modalState && (modalState.lockCtx || modalState.lock)) ? (modalState.lockCtx || modalState.lock) : null;
    // Normaliza objeto de recurso recebido para os campos esperados pela UI
    function normalizarRecursoEntrada(r){
      if(!r) return null;
      const out = { ...r };
      out.id = r.id || r._id || r.referenciaGestorId || r.referencia_gestor_id || r.codigo || null;
      out.referenciaGestorId = r.referenciaGestorId || r.referencia_gestor_id || null;
      out.nome = r.nome || r.descricao || r.nomeRecurso || r.titulo || r.label || '';
      out.placa = r.placa || r.codigo || r.placaCodigo || r.tag || '';
      out.equipeId = r.equipeId || r.equipe_id || r.equipe || null;
      // Normalizar marca/modelo para compor rótulo corretamente
      out.marca = r.marca || r.fabricante || out.marca || '';
      out.modelo = r.modelo || r.model || out.modelo || '';
      // Estruturas opcionais mantidas
      if(r.alocacoesRecurso || r.matrizAlocacao) out.alocacoesRecurso = r.alocacoesRecurso || r.matrizAlocacao;
      if(r.atribuicoesRecurso || r.atribuicoes) out.atribuicoesRecurso = r.atribuicoesRecurso || r.atribuicoes;
      if(r.refeicoesRecurso || r.refeicoes) out.refeicoesRecurso = r.refeicoesRecurso || r.refeicoes;
      if(Array.isArray(r.membros)) out.membros = r.membros;
      return out;
    }
  state.recurso = normalizarRecursoEntrada(modalState.recurso)||null;
    // Função auxiliar para limpar completamente estado específico de recurso
    function limparEstadoRecurso(){
      state.matrizAlocacao = {};
      state.atribuicoes = {};
      state.refeicoes = {};
      state.subAbasGeradas = false;
      state.__refPend = [];
    }
    limparEstadoRecurso();
    preencherCabecalho();
    carregarEquipes();
    // Não limpar campos ao editar, para preservar hiddens (marca/modelo) do fluxo de seleção
    if(!state.recurso){
      resetDadosGerais();
    }
  // Garantir botão final habilitado; o fluxo cuidará de validações e persistência
  try { const b=document.getElementById('btnSalvarRecursoFinal'); if(b) b.disabled=false; } catch(_){ }
  // Controle inicial de abas: sempre focar Dados Gerais
    try {
      const tabs=['tab-dadosgerais','tab-alocacao','tab-atribuicao','tab-refeicao'];
      tabs.forEach(id=>{ const b=document.getElementById(id); if(b){ b.classList.remove('active'); b.removeAttribute('aria-selected'); } });
      document.getElementById('tab-dadosgerais')?.classList.add('active');
      document.getElementById('tab-dadosgerais')?.setAttribute('aria-selected','true');
      document.querySelectorAll('#tabsRecursoContent .tab-pane').forEach(p=> p.classList.remove('show','active'));
      document.getElementById('pane-dadosgerais')?.classList.add('show','active');
  const novo = !state.recurso; // recurso novo => bloquear demais abas
  // Marcar modo de abertura: novo vs edição (usado para auto-inicialização de alocações)
  state.__recursoNovoAberto = !!novo;
  if(novo){ state._jaInicializouAlocacoes = false; }
      ['tab-alocacao','tab-atribuicao','tab-refeicao'].forEach(id=>{
        const el=document.getElementById(id);
        if(!el) return;
        if(novo){ el.setAttribute('disabled','true'); el.classList.add('disabled'); el.setAttribute('title','Salve os dados gerais primeiro'); }
        else { el.removeAttribute('disabled'); el.classList.remove('disabled'); el.removeAttribute('title'); }
      });
      // Requisito diária: se houver lockCtx, desativar explicitamente a aba de Atribuição e manter oculta
      try {
        if(state.__lockCtx && (state.__lockCtx.disableAtribuicao===true || state.__lockCtx.disableAtribuicao==='true')){
          const tabAtr = document.getElementById('tab-atribuicao');
          if(tabAtr){ tabAtr.setAttribute('disabled','true'); tabAtr.classList.add('disabled'); tabAtr.setAttribute('title','Aba desativada neste modo'); }
          const paneAtr = document.getElementById('pane-atribuicao');
          if(paneAtr){ paneAtr.classList.remove('show','active'); }
        }
      } catch(_){ }
      // Requisito: Em edição, manter campos de Dados Gerais bloqueados e botão desativado; em novo, permitem edição até salvar
  try { bloquearDadosGeraisCampos(!novo); } catch(_lock){ }
    } catch(_abaInit){}
  // Se for edição, preencher campos
    if(state.recurso){
      try {
        // Enriquecer marca/modelo antes de exibir o rótulo
        try { enriquecerMarcaModeloSeFaltando(); } catch(_){ }
  if(state.recurso.nome) $('#recursoNome').value = state.recurso.nome;
        // Garantir que o select de equipe contenha o ObjectId real: recarregar equipes e então selecionar
        try {
          carregarEquipes();
          // Selecionar após pequeno atraso para dar tempo do select ser populado
          setTimeout(()=>{ try { if(state.recurso.equipeId){ const selEq=document.getElementById('recursoEquipeSelect'); if(selEq){ selEq.value = state.recurso.equipeId; } aplicarRegraBloqueioEquipe(); } } catch(_){ } }, 50);
        } catch(_eq){ if(state.recurso.equipeId) $('#recursoEquipeSelect').value = state.recurso.equipeId; }
        if(state.recurso.id || state.recurso.referenciaGestorId){
          $('#recursoSelecionadoId').value = state.recurso.id || state.recurso.referenciaGestorId;
        }
        // Campo de busca/placa: exibir rótulo composto quando possível
  const campoPlaca = document.getElementById('campoPesquisarRecurso');
  if(campoPlaca){
    const r = state.recurso || {};
    const hasAny = !!(String(r.placa||'').trim() || String(r.marca||'').trim() || String(r.modelo||'').trim());
    campoPlaca.value = hasAny ? (comporRotuloRecurso(r) || '') : '';
  }
    // Atualizar o cabeçalho com o novo formato "Nome (Recurso)" após preencher os campos
    try { preencherCabecalho(); } catch(_){ }
        // Seleção resiliente e hidratação extra do recurso, se faltar algo
        try { selecionarEquipeQuandoDisponivel(state.recurso.equipeId); } catch(_){ }
        try { hidratarDadosGeraisRecursoSePossivel(); } catch(_){ }
    // Busca ativa de marca/modelo por placa se ainda estiver faltando
    try { if(!state.recurso.marca || !state.recurso.modelo){ buscarMarcaModeloPorPlacaSeNecessario(); } } catch(_){ }
  // Busca o objeto oficial por id (módulo Gestor/Recursos) para garantir marca/modelo
  try { buscarRecursoOficialPorIdSeNecessario(); } catch(_){ }
  // Atualizar hiddens usados para manter o trio disponível
  try { const hP=document.getElementById('recursoSelecionadoPlaca'); if(hP) hP.value = state.recurso.placa||''; } catch(_){ }
  try { const hM=document.getElementById('recursoSelecionadoMarca'); if(hM) hM.value = state.recurso.marca||''; } catch(_){ }
  try { const hMd=document.getElementById('recursoSelecionadoModelo'); if(hMd) hMd.value = state.recurso.modelo||''; } catch(_){ }
        // -------- Carregar estruturas persistidas (se existirem) --------
        // Nota: No backend atual só membros está no schema. Para suportar futura persistência granular
        // armazenamos estes campos na instância do recurso no estado principal (escala_nova.js) se forem criados.
        // Convenções de nomes adotadas: recurso.alocacoesRecurso (obj), recurso.atribuicoesRecurso (obj), recurso.refeicoesRecurso (obj)
        // Backwards compatible: se nomes alternativos forem usados, tentar detectar.
        // Alocações podem vir como mapa (objeto) ou array [{ dia, turnoId }]
        const alocSrcObj = state.recurso.alocacoesRecurso || state.recurso.alocacaoRecurso || state.recurso.matrizAlocacao || null;
        if(alocSrcObj && typeof alocSrcObj === 'object' && !Array.isArray(alocSrcObj)){
          const map={}; Object.entries(alocSrcObj).forEach(([k,v])=>{
            const [diaRaw, turnoRaw] = String(k).split('__');
            if(diaRaw && turnoRaw){ const nk=normalizarAllocationKey(diaRaw, turnoRaw, state.recurso?.equipeId); map[nk]=!!v; }
          });
          state.matrizAlocacao = map;
        } else if(Array.isArray(state.recurso.alocacoes)){
          const map = {};
          state.recurso.alocacoes.forEach(a=>{ if(a && a.dia && a.turnoId){ const nk=normalizarAllocationKey(a.dia, a.turnoId, state.recurso?.equipeId); map[nk] = true; } });
          state.matrizAlocacao = map;
        }
        // Atribuições podem vir em dois formatos:
        // 1) Mapa allocationId -> [{ funcionarioId, nome, atribuicao }]
        // 2) Array linear de objetos com dia, turnoId, membroFuncionarioId (backend atual)
        const atribSrcRaw = state.recurso.atribuicoesRecurso || state.recurso.atribuicoes || null;
        state.atribuicoes = {};
        if(atribSrcRaw){
          if(Array.isArray(atribSrcRaw)){
            // Converter array linear em mapa
            atribSrcRaw.forEach(a=>{
              if(!a) return;
              const dia = a.dia || a.data || null;
              const turno = a.turnoId || a.turno || null;
              if(!dia || !turno) return;
              const alloc = normalizarAllocationKey(dia, turno, state.recurso?.equipeId);
              const funcionarioId = a.membroFuncionarioId || a.membro_funcionario_id || a.funcionarioId || a.funcionario_id || null;
              if(!funcionarioId) return;
              if(!state.atribuicoes[alloc]) state.atribuicoes[alloc]=[];
              state.atribuicoes[alloc].push({
                funcionarioId,
                nome: a.nome || a.funcionarioNome || null,
                atribuicao: a.papel || a.atribuicao || null
              });
            });
          } else if(typeof atribSrcRaw === 'object') {
            // Já é mapa, mas normalizar possíveis chaves sem grupo
            const novo={}; Object.entries(atribSrcRaw).forEach(([k,lista])=>{
              const [diaRaw, turnoRaw] = String(k).split('__');
              if(diaRaw && turnoRaw){ const nk=normalizarAllocationKey(diaRaw, turnoRaw, state.recurso?.equipeId); novo[nk]=Array.isArray(lista)? JSON.parse(JSON.stringify(lista)) : []; }
            });
            state.atribuicoes = novo;
          }
        }
        // Fallback: preencher nome dos funcionários ausentes usando membros do recurso ou componentes da equipe
        try {
          const equipeIdSel = state.recurso.equipeId;
            const equipeObj = (state.escala.equipes||[]).find(eq=> (eq.id||eq._id)===equipeIdSel);
            const membros = Array.isArray(state.recurso.membros)? state.recurso.membros: [];
            const nomeLookup = new Map();
            membros.forEach(m=>{ const fid=m.funcionario_id||m.funcionarioId||m.id; if(fid && m.nome) nomeLookup.set(fid,String(m.nome)); });
            if(equipeObj && Array.isArray(equipeObj.componentes)){
              equipeObj.componentes.forEach(c=>{ const fid=c.id||c._id; if(fid && c.nome && !nomeLookup.has(fid)) nomeLookup.set(fid,String(c.nome)); });
            }
            Object.values(state.atribuicoes).forEach(lista=>{
              if(!Array.isArray(lista)) return;
              lista.forEach(item=>{ if(item && !item.nome && item.funcionarioId && nomeLookup.has(item.funcionarioId)){ item.nome = nomeLookup.get(item.funcionarioId); } });
            });
        } catch(_nomeFill){ /* silencioso */ }
        // Refeições podem vir como mapa allocationId -> [{inicio,fim,computavel}] ou como array linear
        const refSrc = state.recurso.refeicoesRecurso || state.recurso.refeicoes || null;
        state.refeicoes = {};
        if(refSrc){
          if(Array.isArray(refSrc)){
            refSrc.forEach(iv=>{
              if(!iv) return;
              const dia = iv.dia || iv.data || null;
              const turno = iv.turnoId || iv.turno || null;
              const ini = iv.inicio || iv.ini || null;
              const fim = iv.fim || iv.termino || null;
              if(!dia || !ini || !fim) return;
              if(!turno){
                { const tStr=String(iv?.tipo||''); const compInf = (typeof iv?.computavel==='boolean') ? iv.computavel : (!/nao[_ ]?computad|não[_ ]?computad/i.test(tStr)); state.__refPend.push({ dia: normalizarDiaIso(dia), inicio: ini, fim: fim, computavel: compInf }); }
                return;
              }
              const alloc = normalizarAllocationKey(dia, turno, state.recurso?.equipeId);
              const computavel = (typeof iv.computavel === 'boolean') ? iv.computavel : (!/nao[_ ]?computad|não[_ ]?computad/i.test(String(iv.tipo||'')));
              if(!state.refeicoes[alloc]) state.refeicoes[alloc] = [];
              state.refeicoes[alloc].push({ inicio: ini, fim: fim, computavel });
            });
          } else if(typeof refSrc === 'object') {
            const novo={}; Object.entries(refSrc).forEach(([k,lista])=>{
              const [diaRaw, turnoRaw] = String(k).split('__');
              if(diaRaw && turnoRaw){ const nk=normalizarAllocationKey(diaRaw, turnoRaw, state.recurso?.equipeId); novo[nk]=Array.isArray(lista)? JSON.parse(JSON.stringify(lista)) : []; }
            });
            state.refeicoes = novo;
          }
        }
        console.debug('[modal_recurso][edit] recurso carregado', {
          id: state.recurso.id || state.recurso.referenciaGestorId,
          equipeId: state.recurso.equipeId,
          matrizAlocacaoKeys: Object.keys(state.matrizAlocacao).length,
          atribuicoesAllocCount: Object.keys(state.atribuicoes).length,
          refeicoesAllocCount: Object.keys(state.refeicoes).length,
          membros: Array.isArray(state.recurso.membros)? state.recurso.membros.length : 0
        });
  // Botão final deve estar habilitado em edição
  try { const b=document.getElementById('btnSalvarRecursoFinal'); if(b) b.disabled=false; } catch(_){ }
  console.debug('[modal_recurso][edit-fill] matriz(keys)=', Object.keys(state.matrizAlocacao||{}));
  console.debug('[modal_recurso][edit-fill] atribuicoes(keys)=', Object.keys(state.atribuicoes||{}));
  console.debug('[modal_recurso][edit-fill] refeicoes(keys)=', Object.keys(state.refeicoes||{}));
  // Se já havia alocações previamente salvas para o recurso, gerar UI delas automaticamente
        if(Object.keys(state.matrizAlocacao).length){
          try { reindexarParaEquipeSelecionada(); } catch(_r){}
          try { reconciliarRefeicoesComMatriz(); } catch(_r2){}
          gerarMatrizAlocacao();
          atualizarMatrizAoClique();
          // Gerar abas de atribuição se houver alguma alocação ativa
          gerarAbasAtribuicao();
          // Refeições: render somente se houver dados (caso contrário usuário abre aba e gera depois)
          gerarTabelaRefeicoes();
        }
        // Hidratar caso os dados tenham vindo mínimos da lista
        hidratarRecursoSePreciso();
        // Preparar matriz de alocação antecipadamente (caso esteja vazia) para evitar tela vazia ao abrir a aba
        try {
          setTimeout(async ()=>{
            try {
              if(Object.keys(state.matrizAlocacao||{}).length===0){
                await ensureEscalaGlobal();
                const sel = document.getElementById('recursoEquipeSelect');
                if(state.recurso && state.recurso.equipeId && sel){ sel.value = state.recurso.equipeId; }
                gerarMatrizAlocacao();
                atualizarMatrizAoClique();
              }
            } catch(_prep){ }
          }, 0);
        } catch(_preAsync){ }
      } catch(errFill){ console.warn('[modal_recurso] falha preencher edição recurso', errFill); }
    } else {
      // NOVO RECURSO: Pré-marca todas as alocações possíveis da equipe quando usuário selecionar a equipe.
  console.debug('[modal_recurso][novo] inicializando estado limpo para novo recurso (abas bloqueadas)');
      // Ao trocar a equipe depois, a lógica padrão já vai regenerar matriz; aqui apenas garantimos estado vazio.
      // (Opcional) poderíamos auto-abrir aba Dados Gerais.
    }
    prepararAlocacaoEdicao();
    // Se vier lockCtx com equipe, pré-selecionar e bloquear select da equipe
    try {
      if(state.__lockCtx && state.__lockCtx.equipeId){
        const selEq = document.getElementById('recursoEquipeSelect');
        if(selEq){ selEq.value = String(state.__lockCtx.equipeId); selEq.disabled = true; }
        // Ocultar/Desativar abas que não se aplicam neste modo (atribuicao/refeicao)
        const tabAtr = document.getElementById('tab-atribuicao');
        const paneAtr = document.getElementById('pane-atribuicao');
        if(tabAtr){ tabAtr.setAttribute('disabled','true'); tabAtr.classList.add('disabled','d-none'); tabAtr.setAttribute('title','Indisponível neste modo'); }
        if(paneAtr){ paneAtr.classList.remove('show','active'); paneAtr.classList.add('d-none'); }
        const tabRef = document.getElementById('tab-refeicao');
        const paneRef = document.getElementById('pane-refeicao');
        if(tabRef){ tabRef.setAttribute('disabled','true'); tabRef.classList.add('disabled','d-none'); tabRef.setAttribute('title','Indisponível neste modo'); }
        if(paneRef){ paneRef.classList.remove('show','active'); paneRef.classList.add('d-none'); }
        // Limpar quaisquer dados residuais dessas abas por segurança
        state.atribuicoes = {}; state.refeicoes = {}; state.__refPend = [];
      }
    } catch(_){ }
    bsModal.show();
    // Em modo diária, tentar aplicar a restrição logo após exibir (ou quando a matriz estiver disponível)
    setTimeout(()=>{ try { if(state.__lockCtx){ gerarMatrizAlocacao(); atualizarMatrizAoClique(); aplicarRestricaoEscopoDiario(); } } catch(_){ } }, 50);
  }

  // Expor função pública para edição a partir da página principal
  if(!window.__OPEN_MODAL_RECURSO_CUSTOM__){
    window.__OPEN_MODAL_RECURSO_CUSTOM__ = function(cfg){
      try {
        const escalaCtx = (cfg && cfg.escala) ? cfg.escala : (window.__ESCALA_STATE__||{});
        abrir({ escala: escalaCtx, recurso: cfg && cfg.recurso ? JSON.parse(JSON.stringify(cfg.recurso)) : null, lockCtx: (cfg && (cfg.lock||cfg.lockCtx)) ? (cfg.lock||cfg.lockCtx) : null });
      } catch(e){ console.warn('[modal_recurso] falha ao abrir via função global', e); }
    };
  }

  // Ouvir pedidos externos de edição vindos da aba Recursos (nova escala)
  document.addEventListener('escala:editar-recurso-pendente', (ev)=>{
    try {
      const recurso = ev && ev.detail ? ev.detail.recurso : null;
      abrir({ escala: (window.__ESCALA_STATE__||{}), recurso });
    } catch(err){ console.warn('[modal_recurso] falha ao abrir via evento editar-recurso-pendente', err); }
  });

  // Salvar recurso final (lock/spinner)
  let _lockSalvarRecurso=false;
  document.addEventListener('click', async e=>{
    // Tornar o handler resiliente a cliques em elementos internos (ex.: spinner dentro do botão)
    const btn = e.target && e.target.closest && e.target.closest('#btnSalvarRecursoFinal');
    if(!btn) return;
    try { console.debug('[modal_recurso] btnSalvarRecursoFinal click capturado'); } catch(_){ }
    if(_lockSalvarRecurso) return;
    // Capturar estado visual atual do botão (usado mais adiante se efetivamente formos bloquear o botão)
    const originalHTML=btn.innerHTML; const originalDisabled=btn.disabled; let sucesso=false;
    // Se ainda não temos state.recurso persistido, tentar salvar Dados Gerais automaticamente
    if(!state.recurso || !state.recurso.equipeId || !state.recurso.nome){
      const formDG = document.getElementById('formDadosGeraisRecurso');
      const equipeSel = document.getElementById('recursoEquipeSelect');
      const nomeEl = document.getElementById('recursoNome');
      if(!equipeSel || !nomeEl){ toastInfo('Formulário de dados gerais não encontrado.'); return; }
      if(!equipeSel.value){ toastInfo('Selecione a equipe nos Dados Gerais.'); return; }
      if(!nomeEl.value.trim()){ toastInfo('Informe o nome do recurso nos Dados Gerais.'); return; }
      try {
        await onSalvarDadosGerais(new Event('submit'));
      } catch(_dg) { /* mensagens já exibidas em onSalvarDadosGerais */ }
      if(!state.recurso){ return; }
    }
    try {
      _lockSalvarRecurso=true; btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Salvando...';
      // Opcionalmente atualiza a tabela local se ela existir (não bloquear o salvamento caso não exista)
      const tabela = document.querySelector('#tabelaResultadoRecursos tbody');
      if(tabela){
        const placa=(state.recurso.placa||'').toUpperCase();
        const desc=state.recurso.nome || '(sem nome)';
        const unidade=state.escala?.unidade || '-';
        // Evitar duplicar se já existir mesma descrição + unidade
        const existente = Array.from(tabela.querySelectorAll('tr')).some(tr=>{ const tPlaca=tr.children[0]?.textContent.trim(); const tDesc=tr.children[1]?.textContent.trim(); return (placa && tPlaca===placa) || (!placa && tDesc===desc); });
        if(!existente){ const id=state.recurso.id || state.recurso.referenciaGestorId || ('tmp_'+Date.now()); const linha=document.createElement('tr'); linha.innerHTML=`\n          <td class="col-placa">${placa||'-'}</td>\n          <td class="col-desc text-truncate" title="${desc}">${desc}</td>\n          <td class="col-unidade">${unidade}</td>\n          <td class="col-acoes text-center d-flex gap-1 justify-content-center">\n            <button type="button" class="btn btn-sm btn-outline-primary" data-selecionar-recurso-id="${id}" data-recurso-placa="${placa}" data-recurso-desc="${desc}" title="Selecionar"><i class="bi bi-check2"></i></button>\n            <button type="button" class="btn btn-sm btn-outline-secondary" data-remover-recurso-id="${id}" title="Remover da lista"><i class="bi bi-x"></i></button>\n          </td>`; tabela.prepend(linha); }
        toastSucesso('Recurso preparado e incluído na lista local.');
      }
      // Montar payload e persistir
  const payload={ ...state.recurso };
      if(!payload.id) payload.id = state.recurso.referenciaGestorId || ('tmp_'+Date.now());
      if(!payload.equipeId){ payload.equipeId = document.getElementById('recursoEquipeSelect')?.value || null; }
      if(state.matrizAlocacao && Object.keys(state.matrizAlocacao).length){ payload.alocacoesRecurso = { ...state.matrizAlocacao }; }
      // Em modo diária, não enviar atribuicoes nem refeicoes
      if(!state.__lockCtx){
        if(state.atribuicoes && Object.keys(state.atribuicoes).length){ payload.atribuicoesRecurso = JSON.parse(JSON.stringify(state.atribuicoes)); }
        if(state.refeicoes && Object.keys(state.refeicoes).length){ payload.refeicoesRecurso = JSON.parse(JSON.stringify(state.refeicoes)); }
      }
      // Derivar membros (nome + id) se ainda não existir lista de membros consistente
      try {
        if(!state.__lockCtx && (!Array.isArray(payload.membros) || !payload.membros.length)){
          const uniq = new Map();
          if(payload.atribuicoesRecurso){
            Object.entries(payload.atribuicoesRecurso).forEach(([alloc, lista])=>{
              if(Array.isArray(lista)) lista.forEach(it=>{
                const fid = it.funcionarioId || it.funcionario_id;
                if(!fid) return;
                if(!uniq.has(fid)) uniq.set(fid, { funcionario_id: fid, nome: it.nome||null, atribuicao: it.atribuicao||it.papel||null, origemEquipe: null, added_at: new Date().toISOString() });
              });
            });
          }
          if(uniq.size){ payload.membros = [...uniq.values()]; }
        }
      } catch(_mDeriv){ /* silencioso */ }
      if(state.__lockCtx && payload.membros){ delete payload.membros; }
      let escalaId = window.__ESCALA_STATE__?.escalaId;
      if(!escalaId){
        try { const u=new URL(location.href); escalaId = u.searchParams.get('id') || escalaId; } catch(_e){}
        if(escalaId){ if(!window.__ESCALA_STATE__) window.__ESCALA_STATE__={}; window.__ESCALA_STATE__.escalaId=escalaId; console.debug('[modal_recurso][fallback] escalaId recuperado da URL:', escalaId); }
      }
  if(!escalaId){ toastInfo('Primeiro salve os Dados Gerais da escala para persistir recursos. Recurso ficará apenas local.'); }
      else {
        try {
          const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
          const isEdicao=!!(state.recurso && (state.recurso.created_at || state.recurso._persisted) && (state.recurso.id || state.recurso.referenciaGestorId));
          const recursoIdPersist=state.recurso?.id || state.recurso?.referenciaGestorId || payload.id;
          let url, method, body, recursoPost;
          // Recurso a ser usado em fallback de criação (se PUT falhar)
          let recursoParaCriar = null;
          if(isEdicao){
            // Novo comportamento: enviar recurso completo para PUT
            const recursoCompleto = { id: recursoIdPersist, nome: payload.nome, placa: payload.placa, equipeId: payload.equipeId };
            if(payload.alocacoesRecurso){
              recursoCompleto.alocacoes = Object.entries(payload.alocacoesRecurso)
                .filter(([k,v])=> v)
                .map(([alloc])=>{ const [diaRaw, turnoRaw]=alloc.split('__'); return { dia:diaRaw, turnoId:turnoRaw }; });
              delete recursoCompleto.alocacoesRecurso; delete recursoCompleto.matrizAlocacao;
            }
            if(!state.__lockCtx && payload.atribuicoesRecurso){ const arrAtrib=[]; Object.entries(payload.atribuicoesRecurso).forEach(([alloc, lista])=>{ const [diaRaw, turnoRaw]=alloc.split('__'); if(Array.isArray(lista)) lista.forEach(it=>{ arrAtrib.push({ id:'at_'+Math.random().toString(16).slice(2), membroFuncionarioId: it.funcionarioId||it.funcionario_id||null, papel: it.atribuicao||it.papel||null, turnoId:turnoRaw, dia:diaRaw, escopo:'dia+turno', prioridade:0 }); }); }); recursoCompleto.atribuicoes=arrAtrib; }
            if(!state.__lockCtx && payload.refeicoesRecurso){ const arrRef=[]; Object.entries(payload.refeicoesRecurso).forEach(([alloc, lista])=>{ const [diaRaw, turnoRaw]=alloc.split('__'); if(Array.isArray(lista)) lista.forEach(it=>{ const iniIv = it.inicio || it.ini; const fimIv = it.fim; if(it && iniIv && fimIv){ arrRef.push({ id:'rf_'+Math.random().toString(16).slice(2), membroFuncionarioId: it.funcionarioId||it.funcionario_id||null, dia:diaRaw, ini:iniIv, fim:fimIv, tipo: (it.tipo||'ALMOCO'), computavel: typeof it.computavel==='boolean' ? it.computavel : true }); } }); });
              // incluir pendentes (sem turno) também
              try { if(Array.isArray(state.__refPend) && state.__refPend.length){ state.__refPend.forEach(p=>{ if(p && p.dia && p.inicio && p.fim){ arrRef.push({ id:'rf_'+Math.random().toString(16).slice(2), membroFuncionarioId: p.funcionarioId||p.funcionario_id||null, dia: normalizarDiaIso(p.dia), ini: p.inicio, fim: p.fim, tipo: (p.tipo||'ALMOCO'), computavel: typeof p.computavel==='boolean'? p.computavel: true }); } }); } } catch(_pend){}
              recursoCompleto.refeicoes=arrRef; }
            if(Array.isArray(payload.membros)) recursoCompleto.membros = payload.membros.map(m=> ({ funcionario_id:m.funcionario_id||m.funcionarioId||m.id, nome:m.nome||null, atribuicao:m.atribuicao||m.papel||null, origemEquipe:m.origemEquipe||null }));
            // Guardar recurso completo para possível fallback de criação
            recursoParaCriar = recursoCompleto;
            if(recursoCompleto.alocacoes) recursoCompleto.clienteMandouAloc = true;
            url = base + '/api/escalas/'+escalaId+'/equipes/'+encodeURIComponent(payload.equipeId)+'/recursos/'+ encodeURIComponent(recursoIdPersist); method='PUT'; body=JSON.stringify({ recurso: recursoCompleto });
          }
          else {
            url = base + '/api/escalas/'+escalaId+'/equipes/'+encodeURIComponent(payload.equipeId)+'/recursos'; method='POST';
            recursoPost={ ...payload };
            if(payload.alocacoesRecurso){
              recursoPost.alocacoes = Object.entries(payload.alocacoesRecurso).filter(([k,v])=> v).map(([alloc])=>{ const [diaRaw, turnoRaw]=alloc.split('__'); return { dia:diaRaw, turnoId:turnoRaw }; });
              delete recursoPost.alocacoesRecurso; delete recursoPost.matrizAlocacao;
            }
            if(!state.__lockCtx && payload.atribuicoesRecurso){ const arr=[]; Object.entries(payload.atribuicoesRecurso).forEach(([alloc, lista])=>{ const [diaRaw, turnoRaw]=alloc.split('__'); if(Array.isArray(lista)) lista.forEach(it=>{ arr.push({ id:'at_'+Math.random().toString(16).slice(2), membroFuncionarioId: it.funcionarioId||it.funcionario_id||null, papel: it.atribuicao||it.papel||null, turnoId:turnoRaw, dia:diaRaw, escopo:'dia+turno', prioridade:0 }); }); }); recursoPost.atribuicoes=arr; }
            if(!state.__lockCtx && payload.refeicoesRecurso){ const arr=[]; Object.entries(payload.refeicoesRecurso).forEach(([alloc, lista])=>{ const [diaRaw, turnoRaw]=alloc.split('__'); if(Array.isArray(lista)) lista.forEach(it=>{ const iniIv = it.inicio || it.ini; const fimIv = it.fim; if(it && iniIv && fimIv){ arr.push({ id:'rf_'+Math.random().toString(16).slice(2), membroFuncionarioId: it.funcionarioId||it.funcionario_id||null, dia:diaRaw, ini:iniIv, fim:fimIv, tipo:it.tipo||'ALMOCO', computavel: typeof it.computavel==='boolean' ? it.computavel : true }); } }); });
              // incluir pendentes sem turno
              try { if(Array.isArray(state.__refPend) && state.__refPend.length){ state.__refPend.forEach(p=>{ if(p && p.dia && p.inicio && p.fim){ arr.push({ id:'rf_'+Math.random().toString(16).slice(2), membroFuncionarioId: p.funcionarioId||p.funcionario_id||null, dia: normalizarDiaIso(p.dia), ini: p.inicio, fim: p.fim, tipo: (p.tipo||'ALMOCO'), computavel: typeof p.computavel==='boolean'? p.computavel: true }); } }); } } catch(_pend2){}
              recursoPost.refeicoes=arr;
            }
            body=JSON.stringify({ recurso: recursoPost }); recursoParaCriar = recursoPost;
          }
          console.debug('[modal_recurso][persist] escalaId=', escalaId, 'isEdicao=', isEdicao, 'url=', url, 'payloadKeys=', Object.keys(recursoPost||{}));
          console.log('Enviando PUT:', { url, method, body: JSON.parse(body) });
          let res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, credentials:'same-origin', body });
          if(!res.ok && method==='PUT'){
            try {
              const err=await res.json().catch(()=>({}));
              if(res.status===404 || (res.status===400 && /Recurso não encontrado/i.test(err.error||''))){
                // Fallback: criar diretamente na rota de criação da equipe, reaproveitando o recurso completo (com refeições, computável, etc.)
                const createUrl = base + '/api/escalas/'+escalaId+'/equipes/'+encodeURIComponent(payload.equipeId)+'/recursos';
                const createBody = JSON.stringify({ recurso: recursoParaCriar || { nome: payload.nome, placa: payload.placa, equipeId: payload.equipeId } });
                res = await fetch(createUrl, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:createBody });
              }
            } catch(_fb){}
          }
          if(res.ok){
            const js=await res.json();
            if(js && js.ok && js.recurso){
              Object.assign(payload, js.recurso);
              payload._persisted=true;
              if(state.recurso){ state.recurso._persisted=true; }
              // Re-fetch para garantir consistência (ex: hooks mongose, normalizações futuras)
              try {
                const refId = payload.id || payload.referenciaGestorId;
                if(refId){
                  let re = await fetch(base + '/api/escalas/'+escalaId+'/equipes/'+encodeURIComponent(payload.equipeId)+'/recursos/'+ encodeURIComponent(refId), { credentials:'same-origin' });
                  if(!re.ok){ try { re = await fetch('/api/escalas/'+escalaId+'/equipes/'+encodeURIComponent(payload.equipeId)+'/recursos/'+ encodeURIComponent(refId), { credentials:'same-origin' }); } catch(_fb){} }
                  if(re.ok){ const jsr=await re.json(); if(jsr && jsr.ok && jsr.recurso){ Object.assign(payload, jsr.recurso); payload._refetched=true; } }
                }
              } catch(_rer){ console.warn('[modal_recurso] re-fetch recurso falhou', _rer); }
              // Sync da escala inteira para evitar sobrescrita posterior
              try {
                let escalaResp = await fetch(base + '/api/escalas/'+escalaId, { credentials:'same-origin' });
                if(!escalaResp.ok){ try { escalaResp = await fetch('/api/escalas/'+escalaId, { credentials:'same-origin' }); } catch(_fb){} }
                if(escalaResp.ok){
                  const jse = await escalaResp.json();
                  if(jse && jse.ok && jse.data){
                    document.dispatchEvent(new CustomEvent('escala:sync-completa', { detail:{ escala:jse.data } }));
                    try {
                      if(window.parent && window.parent !== window && window.parent.document){
                        window.parent.document.dispatchEvent(new CustomEvent('escala:sync-completa', { detail:{ escala:jse.data } }));
                      }
                    } catch(_dpe){}
                  }
                }
              } catch(_se){ console.warn('[modal_recurso] falha sync completa pós recurso', _se); }
            }
            toastSucesso(isEdicao && method==='PUT'? 'Recurso atualizado.' : 'Recurso criado.');
          }
          else { toastInfo('Falha ao persistir recurso ('+method+' '+res.status+'). Fica local até novo save.'); }
        } catch(errPersist){ console.warn('[modal_recurso] erro persistir recurso', errPersist); toastInfo('Falha de rede ao persistir recurso. Ficará local até nova tentativa.'); }
      }
      const ev=new CustomEvent('escala:recurso-salvo', { detail:{ recurso: payload } }); document.dispatchEvent(ev);
      try {
        if(window.parent && window.parent !== window && window.parent.document){
          window.parent.document.dispatchEvent(new CustomEvent('escala:recurso-salvo', { detail:{ recurso: payload } }));
        }
      } catch(_dpe){}
      sucesso=true;
      try { if(bsModal){ bsModal.hide(); } } catch(_e){}
      // Após salvar, focar aba "Recursos" da página principal e re-renderizar
      try {
        setTimeout(()=>{
          try {
            const sel = document.querySelector('#aba-recursos, [data-pane="recursos"], [href="#aba-recursos"], [data-bs-target="#aba-recursos"]');
            if(sel){ sel.click && sel.click(); }
            // Se a aba não possuir um link clicável, tentar ativar o pane diretamente
            const pane = document.getElementById('aba-recursos') || document.querySelector('[data-pane="recursos"]');
            if(pane){ pane.classList.add('show','active'); }
            if(typeof window.renderRecursos==='function'){ window.renderRecursos(); }
          } catch(_go){}
        }, 150);
      } catch(_nav){}
      state.recurso=null; state.atribuicoes={}; state.refeicoes={}; state.matrizAlocacao={}; state.subAbasGeradas=false;
    } finally {
      btn.innerHTML=originalHTML; if(!sucesso){ btn.disabled=originalDisabled; } _lockSalvarRecurso=false;
    }
  }, true);

  // Monta objeto de contexto da escala a partir de window (inputs da página) caso não exista completo
  function montarEscalaContexto(base){
    const out = Object.assign({}, base||{});
    try {
      // Inputs presentes na página principal
      const desc = document.getElementById('descricaoEscala')?.value?.trim() || '';
      const unidadeSelect = document.getElementById('unidadeEscala');
      const unidadeTxt = unidadeSelect && unidadeSelect.selectedIndex> -1 ? unidadeSelect.options[unidadeSelect.selectedIndex].text : '';
      const ini = document.getElementById('dataInicio')?.value || '';
      const fim = document.getElementById('dataFim')?.value || '';
      if(!out.descricao) out.descricao = desc;
      if(!out.descricao){
        const g = (window.__ESCALA_STATE__||{});
        out.descricao = g.descricao || g.nome || g.escalaNome || g.escalaDescricao || g.descricaoEscala || g.titulo || g.label || out.descricao;
      }
      // Normalizar período dd/mm/aaaa à dd/mm/aaaa (se ambos presentes)
      if(ini && fim){ out.periodo = ini + ' à ' + fim; }
      // Montar unidade formatada similar a atualizarLabelsContexto
      if(unidadeTxt){
        const m = unidadeTxt.match(/^([^\-]+?)\s*-\s*(.+)$/);
        if(m){
          const codigo=m[1].trim();
          let nome=m[2].trim().replace(/\(Matriz\)/i,'').replace(/\(Filial\)/i,'').trim();
          out.unidade = codigo + ' (' + nome + ')';
        } else {
          let nome=unidadeTxt.trim().replace(/\(Matriz\)/i,'').replace(/\(Filial\)/i,'').trim();
          out.unidade = nome;
        }
      }
      // Tipo da escala: tentar extrair de label existente na página
      if(!out.tipo){
        const tipoLbl = document.getElementById('tipoEscalaLabel')?.textContent || '';
        out.tipo = tipoLbl.replace(/[()]/g,'').trim() || 'ORDINÁRIA';
      }
      // Equipes: aproveitar state global se exposto
      if(!out.equipes || !out.equipes.length){
        if(window && window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.equipes)){
          out.equipes = JSON.parse(JSON.stringify(window.__ESCALA_STATE__.equipes));
        }
      }
      // Turnos/datas (para matriz de alocação futura de recursos) -> derivar se existir variável global
      if(!out.turnos && window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.gruposTurnos)){
        const grupos = window.__ESCALA_STATE__.gruposTurnos;
        const turnosFlat=[]; grupos.forEach(g=> (g.turnos||[]).forEach(t=> turnosFlat.push({ id:g.id+'::'+t.ini+'-'+t.fim, label:t.ini+' às '+t.fim, inicio:t.ini, fim:t.fim })) );
        out.turnos = turnosFlat;
      }
      if(!out.datas && window.__ESCALA_STATE__ && window.__ESCALA_STATE__.periodo){
        const p=window.__ESCALA_STATE__.periodo; if(p.ini && p.fim){
          try {
            const datas=[]; let cur=new Date(p.ini+'T00:00:00'); const end=new Date(p.fim+'T00:00:00');
            while(cur<=end){ datas.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
            out.datas=datas;
          } catch(_e){ /* ignora */ }
        }
      }
    } catch(err){ console.warn('[recurso] falha montar contexto escala', err); }
    return out;
  }

  function init(){
    document.addEventListener('click', e=>{
      const trigger = e.target.closest('[data-open-modal-recurso]');
      if(trigger){
        // Tentar usar objeto de estado global se existir (vamos expor no onReady de escala principal futuramente)
        let escalaData = window.__ESCALA_CONTEXT__ || window.__ESCALA_STATE__ || {};
        abrir({ escala: escalaData });
      }
      if(e.target.id==='btnSalvarAlocacaoRecurso'){
        salvarAlocacao();
        state.subAbasGeradas=false;
        gerarAbasAtribuicao();
        gerarTabelaRefeicoes();
      } else if(e.target.id==='btnCancelarAlocacaoRecurso'){
        cancelarAlocacao();
        state.subAbasGeradas=false;
        gerarAbasAtribuicao();
        gerarTabelaRefeicoes();
      }

      // Botão editar intervalos refeição na tabela principal
      const btnEditRef = e.target.closest('[data-edit-refeicao]');
      if(btnEditRef){
        const alloc = btnEditRef.getAttribute('data-edit-refeicao');
        try {
          // Pega o primeiro intervalo existente (se houver) para pré-preencher
          // Pré-carregar todos os intervalos existentes (inclui computáveis e não computáveis)
          const listaExistente = (state.refeicoes[alloc]||[]).map(iv=> ({ inicio: iv.inicio, fim: iv.fim, computavel: !!iv.computavel }));
          const primeiro = listaExistente[0] || null;
          const existente = primeiro ? { inicio: primeiro.inicio, fim: primeiro.fim, tipo: primeiro.computavel ? 'computado' : 'nao_computado', __lista: listaExistente } : null;
          const onSave = (iv)=>{
            if(!iv) return;
            // Novo formato: payload pode conter lista e escopo
            if(Array.isArray(iv.__lista)){
              // Filtrar por consistência com o turno
              const listaOK = iv.__lista.filter(x=> x && x.inicio && x.fim && intervaloDentroDoTurno(alloc, x.inicio, x.fim));
              state.refeicoes[alloc] = listaOK.map(x=> ({ inicio:x.inicio, fim:x.fim, computavel: !!x.computavel }));
              const escopo = iv.__escopo || 'atual';
              if(escopo==='seguintes' || escopo==='todas'){
                // Copiar para alocações com mesmo período de turno
                const alvoTurno = extrairTurnoDeAlloc(alloc);
                const ordenados = obterAlocacoesAtivasOrdenadas();
                const idxAtual = ordenados.indexOf(alloc);
                let alvos = escopo==='seguintes' ? ordenados.slice(idxAtual+1) : ordenados.filter(a=> a!==alloc);
                alvos = alvos.filter(a=>{ const t=extrairTurnoDeAlloc(a); return t.ini===alvoTurno.ini && t.fim===alvoTurno.fim; });
                alvos.forEach(a=>{ state.refeicoes[a] = listaOK.map(x=> ({ ...x })); });
              }
              gerarTabelaRefeicoes();
              return;
            }
            // Legado: um único intervalo
            if(!iv.inicio || !iv.fim){ return; }
            if(iv.fim <= iv.inicio){ toastInfo('Término deve ser maior que início'); return; }
            if(!intervaloDentroDoTurno(alloc, iv.inicio, iv.fim)){ toastInfo('Intervalo deve estar dentro do turno'); return; }
            const computavel = String(iv.tipo||'').toLowerCase()==='computado';
            state.refeicoes[alloc] = [{ inicio: iv.inicio, fim: iv.fim, computavel }];
            gerarTabelaRefeicoes();
          };
          // Informar janela do turno atual para validações no editor (transitório)
          try { const t = extrairTurnoDeAlloc(alloc); window.__ULTIMO_TURNO_REF__ = { ini: t.ini, fim: t.fim }; } catch(_set){ }
          // Informar janela do turno atual para validações no editor também aqui
          try { const t = extrairTurnoDeAlloc(alloc); window.__ULTIMO_TURNO_REF__ = { ini: t.ini, fim: t.fim }; } catch(_set){ }
          if(window.ModalEditarRefeicao && typeof window.ModalEditarRefeicao.abrir==='function'){
            window.ModalEditarRefeicao.abrir(async (payload)=>{
              try { onSave(payload); await salvarRefeicoesNoBackend(); toastSucesso('Refeições salvas no servidor.'); } catch(err){ console.warn('[modal_recurso] salvar refeicoes (modal) falhou', err); toastInfo('Falha ao salvar refeições no servidor.'); }
            }, existente);
          } else {
            // Fallback inline: cria/usa o modal e trata submit localmente
            try { openRefeicaoFallback(async (payload)=>{ try { onSave(payload); await salvarRefeicoesNoBackend(); toastSucesso('Refeições salvas no servidor.'); } catch(err){ console.warn('[modal_recurso] salvar refeicoes (fallback) falhou', err); toastInfo('Falha ao salvar refeições no servidor.'); } }, existente); }
            catch(errFall){ console.warn('[modal_recurso] falha fallback abrir editar_refeicao', errFall); }
          }
        } catch(err){ console.warn('[modal_recurso] falha ao abrir editar_refeicao', err); }
      }
      const btnLocalizar = e.target.closest('#btnAbrirLocalizarRecurso');
      if(btnLocalizar){
        console.debug('[modal_recurso] click btnAbrirLocalizarRecurso');
        // Fallback robusto: abra o modal de localizar diretamente via Bootstrap
        try {
          const el = document.getElementById('modalLocalizarRecurso');
          if(!el){ console.warn('[modal_recurso] modalLocalizarRecurso não encontrado no DOM'); }
          if(el){ const inst = bootstrap.Modal.getOrCreateInstance(el); console.debug('[modal_recurso] abrindo modalLocalizarRecurso'); inst.show(); }
        } catch(errOpen){ console.warn('[modal_recurso] falha ao abrir localizar recurso', errOpen); }
      }
      const selecionarBtn = e.target.closest('[data-selecionar-recurso-id]');
      if(selecionarBtn){
        const id = selecionarBtn.getAttribute('data-selecionar-recurso-id');
        const placa = selecionarBtn.getAttribute('data-recurso-placa');
        const desc = selecionarBtn.getAttribute('data-recurso-desc');
        aplicarRecursoSelecionado({ id, placa, descricao: desc });
      }
      if(e.target.id==='btnAdicionarIntervalo'){
        adicionarIntervalo();
      }
      if(e.target.id==='btnSalvarIntervalosRefeicao'){
        salvarIntervalosRefeicaoEscopo();
      }
    });
    // Quando um recurso é selecionado via localizar_recurso, higienizar estado no lock diário
    document.addEventListener('recurso:selecionado-localizar', (ev)=>{
      try {
        if(!state) return;
        // Atualizar trio placa/marca/modelo no state.recurso
        const det = ev && ev.detail ? ev.detail : {};
        state.recurso = state.recurso || {};
        if(det.placa) state.recurso.placa = det.placa;
        if(det.marca) state.recurso.marca = det.marca;
        if(det.modelo) state.recurso.modelo = det.modelo;
        // Em lock diário, garantir que o recurso permaneça "vazio" de membros/atribuições/refeições
        if(state.__lockCtx){
          delete state.recurso.membros;
          state.atribuicoes = {}; state.refeicoes = {}; state.__refPend = [];
          // Atualizar cabeçalho e rótulo do campo
          try { atualizarRotuloCampoRecurso(); } catch(_){ }
          try { preencherCabecalho(); } catch(_){ }
        }
      } catch(_e){ }
    });
    // Atualização reativa do label no cabeçalho com base nos campos de Dados Gerais
    try {
      const nomeEl = document.getElementById('recursoNome');
      if(nomeEl && !nomeEl.__hdrBound){ nomeEl.addEventListener('input', ()=> preencherCabecalho()); nomeEl.__hdrBound=true; }
      const campoRecursoEl = document.getElementById('campoPesquisarRecurso');
      if(campoRecursoEl && !campoRecursoEl.__hdrBound){ campoRecursoEl.addEventListener('input', ()=> preencherCabecalho()); campoRecursoEl.__hdrBound=true; }
    } catch(_){ }
    // Listener em fase de captura para garantir abertura do modal de refeição
    document.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest && e.target.closest('[data-edit-refeicao]');
      if(!btn) return;
      // Intercepta antes de outros handlers
      e.preventDefault();
      e.stopPropagation();
      const alloc = btn.getAttribute('data-edit-refeicao');
      try {
  const listaExistente = (state.refeicoes[alloc]||[]).map(iv=> ({ inicio: iv.inicio, fim: iv.fim, computavel: !!iv.computavel }));
  const primeiro = listaExistente[0] || null;
  const existente = primeiro ? { inicio: primeiro.inicio, fim: primeiro.fim, tipo: primeiro.computavel ? 'computado' : 'nao_computado', __lista: listaExistente } : null;
        const onSave = (iv)=>{
          if(!iv) return;
          if(Array.isArray(iv.__lista)){
            const listaOK = iv.__lista.filter(x=> x && x.inicio && x.fim && intervaloDentroDoTurno(alloc, x.inicio, x.fim));
            state.refeicoes[alloc] = listaOK.map(x=> ({ inicio:x.inicio, fim:x.fim, computavel: !!x.computavel }));
            const escopo = iv.__escopo || 'atual';
            if(escopo==='seguintes' || escopo==='todas'){
              const alvoTurno = extrairTurnoDeAlloc(alloc);
              const ordenados = obterAlocacoesAtivasOrdenadas();
              const idxAtual = ordenados.indexOf(alloc);
              let alvos = escopo==='seguintes' ? ordenados.slice(idxAtual+1) : ordenados.filter(a=> a!==alloc);
              alvos = alvos.filter(a=>{ const t=extrairTurnoDeAlloc(a); return t.ini===alvoTurno.ini && t.fim===alvoTurno.fim; });
              alvos.forEach(a=>{ state.refeicoes[a] = listaOK.map(x=> ({ ...x })); });
            }
            gerarTabelaRefeicoes();
            return;
          }
          if(!iv.inicio || !iv.fim){ return; }
          if(!intervaloDentroDoTurno(alloc, iv.inicio, iv.fim)){ toastInfo('Intervalo deve estar dentro do turno'); return; }
          const computavel = String(iv.tipo||'').toLowerCase()==='computado';
          state.refeicoes[alloc] = [{ inicio: iv.inicio, fim: iv.fim, computavel }];
          gerarTabelaRefeicoes();
        };
        // Definir janela do turno antes de abrir o editor (era o ponto faltante)
        try { const t = extrairTurnoDeAlloc(alloc); window.__ULTIMO_TURNO_REF__ = { ini: t.ini, fim: t.fim }; } catch(_set){ }
        if(window.ModalEditarRefeicao && typeof window.ModalEditarRefeicao.abrir==='function'){
          window.ModalEditarRefeicao.abrir(async (payload)=>{ try { onSave(payload); await salvarRefeicoesNoBackend(); toastSucesso('Refeições salvas no servidor.'); } catch(err){ console.warn('[modal_recurso] salvar refeicoes (modal) falhou', err); toastInfo('Falha ao salvar refeições no servidor.'); } }, existente);
        } else {
          openRefeicaoFallback(async (payload)=>{ try { onSave(payload); await salvarRefeicoesNoBackend(); toastSucesso('Refeições salvas no servidor.'); } catch(err){ console.warn('[modal_recurso] salvar refeicoes (fallback) falhou', err); toastInfo('Falha ao salvar refeições no servidor.'); } }, existente);
        }
      } catch(err){ console.warn('[modal_recurso][capture] falha ao abrir editar_refeicao', err); }
    }, true);
    // Gerar quando a aba Atribuição for mostrada
    document.getElementById('tab-atribuicao')?.addEventListener('shown.bs.tab', ()=>{
      (async ()=>{
        try {
          state.subAbasGeradas=false; // permitir regenerar conforme seleção atual
          // Sempre reforçar hidratação ao abrir a aba para garantir dados atualizados
          await carregarDadosParaTabsSeNecessario('atribuicao', true);
        } catch(_){ }
        gerarAbasAtribuicao();
      })();
    });
    // Forçar montar matriz de alocação ao abrir a aba Alocação
    document.getElementById('tab-alocacao')?.addEventListener('shown.bs.tab', ()=>{
      (async ()=>{
        try {
          // Garantir que temos contexto de escala (grupos/datas) e equipe do recurso
          await ensureEscalaGlobal();
          if(Object.keys(state.matrizAlocacao||{}).length===0){
            const sel = document.getElementById('recursoEquipeSelect');
            if(state.recurso && state.recurso.equipeId && sel){ sel.value = state.recurso.equipeId; }
            gerarMatrizAlocacao();
            atualizarMatrizAoClique();
          }
        } catch(_){ }
      })();
    });
    // Aba refeição
    document.getElementById('tab-refeicao')?.addEventListener('shown.bs.tab', ()=>{
      (async ()=>{
        try {
          // Sempre reforçar hidratação ao abrir a aba para garantir dados atualizados
          await carregarDadosParaTabsSeNecessario('refeicao', true);
        } catch(_){ }
        gerarTabelaRefeicoes();
      })();
    });
    const formDG = document.getElementById('formDadosGeraisRecurso');
    if(formDG){ formDG.addEventListener('submit', onSalvarDadosGerais); }
    // Form busca recursos
    document.addEventListener('submit', ev=>{
      if(ev.target && ev.target.id==='formBuscaRecurso'){
        ev.preventDefault(); executarBuscaRecursos();
      }
    });
    document.addEventListener('click', ev=>{
      if(ev.target.id==='btnLimparFiltroRecursos'){
        document.getElementById('filtroPlacaRecurso').value='';
        document.getElementById('filtroUnidadeRecurso').value='';
        atualizarStatusBusca('Informe filtros para iniciar a busca.');
        limparResultadosBusca();
      }
    });
    // Debounce digitação
    // Removido: busca automática por digitação. Só buscar ao clicar em "Buscar".
    bindAtribuicaoEventos();
    // Invalidação de cache de ocupação quando um recurso é removido
    document.addEventListener('escala:recurso-removido', ev=>{
      if(state.__cacheOcupacao){
        console.debug('[modal_recurso] evento escala:recurso-removido recebido, limpando cache ocupação');
        delete state.__cacheOcupacao;
      }
    });
    // Atualizar lista de equipes dinamicamente se alterada fora do modal
    document.addEventListener('escala:equipes-alteradas', ev=>{
      try {
        const detalhe = ev.detail || {};
        console.debug('[modal_recurso] evento escala:equipes-alteradas', detalhe);
        if(window.__ESCALA_STATE__){
          if(!state.escala) state.escala = {};
          // Garantir que state.escala.equipes reflita sempre a fonte global (defensivo contra null)
          try { state.escala.equipes = (window.__ESCALA_STATE__.equipes||[]).map(e=>({...e})); } catch(_setEq){ state.escala.equipes=[]; }
          try { carregarEquipes(); } catch(_ce){ console.warn('[modal_recurso] carregarEquipes falhou após equipes-alteradas', _ce); }
          // Se uma equipe selecionada foi removida, limpar seleção
          const sel = document.getElementById('recursoEquipeSelect');
          if(sel && sel.value && !state.escala.equipes.some(eq=> (eq.id||eq._id||eq.codigo||eq.nome) == sel.value)){
            sel.value='';
            state.matrizAlocacao={};
            state.atribuicoes={};
            state.subAbasGeradas=false;
            gerarAbasAtribuicao();
          }
          // Invalidar cache de ocupação porque a composição das equipes mudou
          if(state.__cacheOcupacao) delete state.__cacheOcupacao;
        }
      } catch(errEqEvt){ console.warn('[modal_recurso] erro ao processar equipes-alteradas', errEqEvt); }
    });
  }

  // Fallback para abrir o modal de refeição caso o script/objeto global não esteja carregado
  function openRefeicaoFallback(onSave, existente){
    // Garante HTML do modal no DOM
    let el = document.getElementById('modalEditarRefeicao');
    if(!el){
      const wrap = document.createElement('div');
      wrap.innerHTML = (
        '<div class="modal fade" id="modalEditarRefeicao" tabindex="-1" aria-hidden="true">'
        + '<div class="modal-dialog modal-sm modal-dialog-scrollable">'
        + '<div class="modal-content">'
        + '<div class="modal-header py-2">'
        + '<h5 class="modal-title">Intervalo de Refeição</h5>'
        + '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>'
        + '</div>'
        + '<div class="modal-body p-3">'
        + '<form id="formRefeicao" autocomplete="off">'
        + '<div class="mb-2">'
        + '<label class="form-label">Início</label>'
        + '<input type="time" class="form-control" id="refeicaoInicio" required>'
        + '</div>'
        + '<div class="mb-2">'
        + '<label class="form-label">Fim</label>'
        + '<input type="time" class="form-control" id="refeicaoFim" required>'
        + '</div>'
        + '<div class="mb-3">'
        + '<label class="form-label">Tipo</label>'
        + '<select class="form-select" id="refeicaoTipo" required>'
        + '<option value="computado">Computado (conta na carga)</option>'
        + '<option value="nao_computado" selected>Não computado (desconta)</option>'
        + '</select>'
        + '</div>'
        + '<div class="d-flex gap-2 justify-content-end">'
        + '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>'
        + '<button type="submit" class="btn btn-primary">Salvar</button>'
        + '</div>'
        + '</form>'
        + '</div>'
        + '</div>'
        + '</div>'
        + '</div>'
      );
      document.body.appendChild(wrap.firstChild);
      el = document.getElementById('modalEditarRefeicao');
    }
    // Preenche valores existentes
    try {
      const ini = document.getElementById('refeicaoInicio'); if(ini) ini.value = existente?.inicio || '';
      const fim = document.getElementById('refeicaoFim'); if(fim) fim.value = existente?.fim || '';
      const tipo = document.getElementById('refeicaoTipo'); if(tipo) tipo.value = existente?.tipo || 'nao_computado';
    } catch(_pre){ }
    // Bind único do submit
    const form = document.getElementById('formRefeicao');
    if(form && !form.__boundSubmitFallback){
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        const inicio = document.getElementById('refeicaoInicio').value;
        const fim = document.getElementById('refeicaoFim').value;
        const tipo = document.getElementById('refeicaoTipo').value;
        if(!inicio || !fim) return;
        try { if(onSave) onSave({ inicio, fim, tipo }); } catch(_cb){}
        try { const inst = bootstrap.Modal.getOrCreateInstance(el); inst.hide(); } catch(_h){}
      });
      form.__boundSubmitFallback = true;
    }
    try {
      const inst = bootstrap.Modal.getOrCreateInstance(el);
      inst.show();
    } catch(err){ console.warn('[modal_recurso][fallback] não foi possível abrir o modal de refeição', err); }
  }

  window.RecursoModal = { abrir, state };
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    try { init(); } catch(_e){}
  }

  /* ========================= LOCALIZAR RECURSO =============================== */
  let modalLocalizar = null;
  function abrirModalLocalizarRecurso(){
    const el = document.getElementById('modalLocalizarRecurso'); if(!el){ toastInfo('Modal de localizar não encontrado'); return; }
    if(!modalLocalizar) modalLocalizar = new bootstrap.Modal(el);
    carregarUnidadesAcessiveis();
    modalLocalizar.show();
  }

  function debounce(fn,delay){ let t; return function(...args){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,args),delay); }; }

  // Normalização campo placa (permitir letras/números e hífen opcional) sem bloquear digitação
  document.addEventListener('input', e=>{
    if(e.target && e.target.id==='filtroPlacaRecurso'){
      const input = e.target;
      const selStartBefore = input.selectionStart;
      const raw = input.value;
      // Normaliza: maiúsculas e removes caracteres inválidos
      let cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g,'');
      // Inserir hífen automático após 3 caracteres se houver mais que 3
      if(cleaned.length > 3){
        cleaned = cleaned.slice(0,3) + '-' + cleaned.slice(3);
      }
      input.value = cleaned;
      // Calcular nova posição do cursor: se acabou de ultrapassar 3 -> pular hífen
      let newPos = selStartBefore;
      if(!raw.includes('-') && cleaned.includes('-') && selStartBefore >=3){
        newPos = selStartBefore + 1; // avança por causa do hífen inserido
      }
      // Limitar dentro do comprimento
      newPos = Math.min(newPos, input.value.length);
      try { input.setSelectionRange(newPos,newPos); } catch(_){ }
    }
  });

  function atualizarStatusBusca(msg){
    const el = document.getElementById('statusBuscaRecursos'); if(el) el.textContent = msg;
  }
  function limparResultadosBusca(){
    const tb = document.querySelector('#tabelaResultadoRecursos tbody'); if(tb) tb.innerHTML='';
  }
  async function executarBuscaRecursos(auto=false){
    const placa = document.getElementById('filtroPlacaRecurso')?.value.trim();
    const unidade = document.getElementById('filtroUnidadeRecurso')?.value || '';
    // Permitir buscar só por unidade (sem placa) — antes já permitido, mas reforçamos mensagem
    if(!placa && !unidade){
      if(!auto){ toastInfo('Informe ao menos a unidade ou parte da placa'); }
      return;
    }
    atualizarStatusBusca('Buscando...'); limparResultadosBusca();
    try {
      const params = new URLSearchParams();
      if(placa) params.append('placa', placa);
      if(unidade) params.append('unidadeId', unidade);
      const query = params.toString();
      // Estratégia: tentar primeiro endpoint interno /escalas para evitar redirect HTML do Gestor
      const urlEscalas = '/escalas/api/recursos?' + query;
      console.debug('[LocalizarRecurso] buscando (primário escalas):', urlEscalas);
      let resp = await fetch(urlEscalas, { headers:{ 'Accept':'application/json','X-Requested-With':'fetch' }, credentials:'same-origin' });
      let data, ct = resp.headers.get('content-type')||'';
      if(!resp.ok){
        console.warn('[LocalizarRecurso] primário escalas falhou status', resp.status);
      }
      if(resp.ok && /application\/json/i.test(ct)){
        data = await resp.json();
      } else {
        // Tentar endpoint do Gestor como fallback (para compatibilidade futura)
        const txtPrim = await resp.text();
        console.warn('[LocalizarRecurso] Escalas não JSON. Trecho:', txtPrim.slice(0,160));
        const urlGestor = '/gestor/api/recursos?' + query;
        console.debug('[LocalizarRecurso] tentando fallback gestor:', urlGestor);
        const respGestor = await fetch(urlGestor, { headers:{ 'Accept':'application/json','X-Requested-With':'fetch' }, credentials:'same-origin' });
        const ctG = respGestor.headers.get('content-type')||'';
        if(respGestor.ok && /application\/json/i.test(ctG)){
          data = await respGestor.json();
        } else {
          const txtG = await respGestor.text();
          console.warn('[LocalizarRecurso] Gestor também não retornou JSON. Trecho:', txtG.slice(0,160));
          throw new Error('Resposta inválida dos endpoints escalas/gestor');
        }
      }
      renderResultadosRecursos(data||[]);
  if(!data || !data.length){ atualizarStatusBusca(''); }
      else atualizarStatusBusca(data.length+' recurso(s) encontrados.');
    } catch(err){
      atualizarStatusBusca('Falha ao buscar.');
      toastInfo(err && err.message ? ('Busca falhou: '+err.message) : 'Erro na busca de recursos');
      console.error('[LocalizarRecurso] Erro na busca:', err);
    }
  }

  function carregarUnidadesAcessiveis(){
    const sel = document.getElementById('filtroUnidadeRecurso'); if(!sel) return;
    // Evitar recarregar se já populado (mantém primeira option)
    if(sel.options.length>1) return;
    // Estratégias de origem de unidades: preferir window.__UNIDADES_USUARIO__ se existir; fallback para __ESCALA_STATE__.unidades
    const lista = (window.__UNIDADES_USUARIO__ && Array.isArray(window.__UNIDADES_USUARIO__))
      ? window.__UNIDADES_USUARIO__
      : (window.__ESCALA_STATE__?.unidadesAcessiveis || window.__ESCALA_STATE__?.unidades || []);
    // Se ainda vazio, tentar carregar via endpoint genérico (somente uma vez)
    if(!lista.length){
      // Evitar múltiplos fetch simultâneos
      if(sel.getAttribute('data-loading')==='1') return;
      sel.setAttribute('data-loading','1');
  const originalFirst = sel.firstElementChild; if(originalFirst) originalFirst.textContent='Selecione...';
      // Determinar basePath aproximado para rota de unidades relacionadas já existente em escala
      let base='/escalas';
      try { const parts=location.pathname.split('/').filter(Boolean); const idx=parts.indexOf('escalas'); if(idx!==-1) base='/' + parts[idx]; } catch(_){ }
      const url = base + '/api/unidades-relacionadas';
      fetch(url,{credentials:'same-origin'})
        .then(r=> r.ok? r.json(): Promise.reject(new Error('HTTP '+r.status)))
        .then(js=>{
          const arr = Array.isArray(js.data)? js.data : (Array.isArray(js)? js: []);
          arr.forEach(u=>{
            const opt=document.createElement('option');
            opt.value = u.id || u._id || u.codigo || '';
            const codigo = u.codigo || opt.value;
            let nome = u.nome || '';
            opt.textContent = codigo + (nome? ' - '+nome : '');
            sel.appendChild(opt);
          });
          if(!arr.length){ if(originalFirst) originalFirst.textContent='(sem unidades)'; }
        })
        .catch(err=>{ console.warn('[modal_recurso] Falha carregar unidades fallback', err); if(originalFirst) originalFirst.textContent='(erro carregando unidades)'; })
        .finally(()=> sel.removeAttribute('data-loading'));
    }
    // Popular com lista local (se existir). Não limpar caso fallback já esteja populando.
    if(lista.length){
      lista.forEach(u=>{
        const opt = document.createElement('option');
        opt.value = u.id || u._id || u.codigo || '';
        const codigo = u.codigo || opt.value;
        let nome = u.nome || '';
        opt.textContent = codigo + (nome? ' - '+nome : '');
        sel.appendChild(opt);
      });
    }
  }

  function normalizarTexto(txt){ return (txt||'').toString().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase(); }

  function renderResultadosRecursos(lista){
    const tb = document.querySelector('#tabelaResultadoRecursos tbody'); if(!tb) return;
    if(!Array.isArray(lista)) lista=[];
    tb.innerHTML = lista.map(r=>{
      const placa = r.placa || r.codigo || '-';
      const desc = r.descricao || r.nome || '(sem descrição)';
      const unidade = r.unidadeFormatada || r.unidade || '-';
      const id = r._id || r.id;
      return `<tr>`+
        `<td class="col-placa">${placa}</td>`+
        `<td class="col-desc text-truncate" title="${desc}">${desc}</td>`+
        `<td class="col-unidade">${unidade}</td>`+
        `<td class="col-acoes text-center d-flex gap-1 justify-content-center">`+
          `<button type="button" class="btn btn-sm btn-outline-primary" data-selecionar-recurso-id="${id}" data-recurso-placa="${placa}" data-recurso-desc="${desc}" title="Selecionar"><i class="bi bi-check2"></i></button>`+
          `<button type="button" class="btn btn-sm btn-outline-secondary" data-remover-recurso-id="${id}" title="Remover da lista"><i class="bi bi-x"></i></button>`+
        `</td>`+
      `</tr>`;
    }).join('');
    // Delegação já existente para selecionar; adicionar para remover
    tb.querySelectorAll('[data-remover-recurso-id]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const tr = btn.closest('tr');
        if(tr) tr.remove();
      });
    });
  }

  function aplicarRecursoSelecionado(rec){
    try {
      document.getElementById('recursoSelecionadoId').value = rec.id;
      const campo = document.getElementById('campoPesquisarRecurso');
      if(campo){
        const placa = (rec.placa||'').toString().trim();
        const desc = (rec.descricao||'').toString().trim();
        // Apenas exibir no campo se houver placa; caso contrário, não preencher automaticamente
        campo.value = placa ? (placa + (desc? ' - '+desc : '')) : '';
      }
      // Atualizar rótulo do cabeçalho imediatamente após seleção
      try { preencherCabecalho(); } catch(_){ }
      toastSucesso('Recurso selecionado.');
      if(modalLocalizar) modalLocalizar.hide();
      document.getElementById('btnLimparRecursoSelecionado').style.display='';
    } catch(err){ console.error(err); }
  }

  /* ========================= REFEIÇÕES =============================== */
  let modalIntervalosRef = null;
  let allocRefeicaoAtual = null; // allocationId atualmente sendo editada

  function obterAlocacoesAtivasOrdenadas(){
    const ativos = Object.keys(state.matrizAlocacao).filter(k=> state.matrizAlocacao[k]);
    return ativos.slice().sort((a,b)=>{
      const [dA,tA] = a.split('__'); const [dB,tB]=b.split('__');
      const hA = (String(tA).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || '00:00-00:00';
      const hB = (String(tB).match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || '00:00-00:00';
      if(dA===dB) return hA.localeCompare(hB);
      return dA.localeCompare(dB);
    });
  }

  function gerarTabelaRefeicoes(){
    const container = document.getElementById('containerRefeicoes');
    if(!container) return;
    try { reconciliarRefeicoesComMatriz(); } catch(_r){}
    const msg = document.getElementById('msgRefeicaoVazia');
    if(!state.recurso || !Object.keys(state.matrizAlocacao).some(k=> state.matrizAlocacao[k])){
      container.classList.add('d-none');
      msg.classList.remove('d-none');
      return;
    }
    // Se há alocações ativas mas não temos dados de refeições, tentar reidratar do backend rapidamente
    try {
      const temAtivos = Object.keys(state.matrizAlocacao||{}).some(k=> state.matrizAlocacao[k]);
      const listaVazia = !state.refeicoes || Object.keys(state.refeicoes).length===0;
      if(temAtivos && listaVazia){
        // força uma re-hidratação pontual
        try { /* not await para não travar UI */ carregarDadosParaTabsSeNecessario('refeicao', true); } catch(_rehyd){}
      }
    } catch(_chk){}
  container.classList.remove('d-none');
    msg.classList.add('d-none');
    const tbody = document.querySelector('#tabelaRefeicoesRecurso tbody');
    if(!tbody) return;
    const ordenados = obterAlocacoesAtivasOrdenadas();
    tbody.innerHTML = ordenados.map(alloc=>{
      const [dataISO, turnoIdRaw] = alloc.split('__');
      const m = turnoIdRaw.match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      const ini = m?m[1]:'--:--'; const fim = m?m[2]:'--:--';
      const lista = state.refeicoes[alloc]||[];
      const resumo = lista.length? lista.map(iv=>`${iv.inicio}-${iv.fim}${iv.computavel?'':'(NC)'}`).join(', ') : '<span class="text-muted">(nenhum)</span>';
      const durEfetiva = calcularHorasEfetivasStr(ini,fim, lista);
      return `<tr data-refeicao-alloc="${alloc}">`+
        `<td>${formatarDataBr(dataISO)}</td>`+
        `<td>${ini}-${fim}</td>`+
        `<td>${resumo} <span class="text-muted">| Efetivo: ${durEfetiva}</span></td>`+
        `<td class="text-center"><button type="button" class="btn btn-sm btn-outline-primary" data-edit-refeicao="${alloc}"><i class="bi bi-pencil"></i></button></td>`+
      `</tr>`;
    }).join('');
  }

  // Hidratação sob demanda ao abrir abas Atribuição/Refeição: GET direto do recurso
  async function carregarDadosParaTabsSeNecessario(alvo, force){
    try {
      if(!state.recurso) return;
      const rid = state.recurso.id || state.recurso._id || state.recurso.referenciaGestorId || state.recurso.referencia_gestor_id;
      let eid = state.recurso.equipeId || document.getElementById('recursoEquipeSelect')?.value || null;
      let escalaId = window.__ESCALA_STATE__?.escalaId;
      if(!rid || !escalaId) return;
      if(!eid){
        // tentar resolver equipeId via GET da escala
        try {
          const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
          let rEsc = await fetch(base + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
          if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
          if(rEsc.ok){
            const js = await rEsc.json().catch(()=>null); const d = js && (js.data||js);
            const eq = (Array.isArray(d?.equipes)? d.equipes:[]).find(eq=> Array.isArray(eq.recursos) && eq.recursos.some(x=> (x.id||x._id||x.referenciaGestorId)==rid));
            if(eq) eid = eq.id || eq._id || eid;
            // também atualizar select se necessário
            try { const sel=document.getElementById('recursoEquipeSelect'); if(sel && eid){ sel.value=eid; } } catch(_){ }
          }
        } catch(_){ }
      }
      if(!eid) return;
      const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      let url = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
      let resp = await fetch(url, { credentials:'same-origin' });
      if(!resp.ok){
        // fallback absoluto
        try { resp = await fetch('/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid), { credentials:'same-origin' }); } catch(_fb){}
      }
      if(!resp.ok) return;
      const js = await resp.json().catch(()=>null);
      const rec = js && (js.recurso || (js.data && js.data.recurso) || js);
      if(!rec) return;
      // Normalizar e transferir para os mapas locais se ainda vazios
      // Alocações: se force, sempre recalcula a partir do backend
      if(force || (state.matrizAlocacao && Object.keys(state.matrizAlocacao).length===0)){
        try {
          let aloc = rec.alocacoesRecurso || rec.alocacoes || rec.matrizAlocacao || null;
          if(Array.isArray(aloc)){
            const map={}; aloc.forEach(a=>{ if(a && a.dia && a.turnoId){ const k = normalizarAllocationKey(a.dia, a.turnoId, (rec.equipeId||eid)); map[k]=true; } }); aloc = map;
          } else if(aloc && typeof aloc==='object'){
            const map={}; Object.entries(aloc).forEach(([k,v])=>{ const parts=String(k).split('__'); if(parts.length===2){ const nk=normalizarAllocationKey(parts[0], parts[1], (rec.equipeId||eid)); map[nk]=!!v; } }); aloc = map;
          }
          if(aloc) state.matrizAlocacao = aloc;
        } catch(_al){ }
      }
    // Atribuições
  if(alvo==='atribuicao' && (force || (!state.atribuicoes || Object.keys(state.atribuicoes).length===0))){
        try {
      const atribRawMap = (rec.atribuicoesRecurso && typeof rec.atribuicoesRecurso==='object' && Object.keys(rec.atribuicoesRecurso).length>0) ? rec.atribuicoesRecurso : null;
      const atribRaw = atribRawMap || (Array.isArray(rec.atribuicoes) ? rec.atribuicoes : null);
          const map={};
          if(Array.isArray(atribRaw)){
            atribRaw.forEach(a=>{ const dia=a?.dia||a?.data; const turno=a?.turnoId||a?.turno; const fid=a?.membroFuncionarioId||a?.funcionarioId||a?.funcionario_id; if(dia && turno && fid){ const k=normalizarAllocationKey(dia, turno, (rec.equipeId||eid)); if(!map[k]) map[k]=[]; map[k].push({ funcionarioId: fid, nome: a.nome||a.funcionarioNome||null, atribuicao: a.papel||a.atribuicao||null }); } });
          } else if(atribRaw && typeof atribRaw==='object'){
            Object.entries(atribRaw).forEach(([k,lista])=>{ const parts=String(k).split('__'); if(parts.length===2){ const nk=normalizarAllocationKey(parts[0], parts[1], (rec.equipeId||eid)); map[nk]=Array.isArray(lista)? lista.map(x=> ({ funcionarioId: x.funcionarioId||x.funcionario_id||x.membroFuncionarioId, nome:x.nome||x.funcionarioNome||null, atribuicao:x.atribuicao||x.papel||null })) : []; } });
          }
          state.atribuicoes = map;
        } catch(_at){ }
      }
    // Refeições
  if(alvo==='refeicao' && (force || (!state.refeicoes || Object.keys(state.refeicoes).length===0))){
        try {
      const refRawMap = (rec.refeicoesRecurso && typeof rec.refeicoesRecurso==='object' && Object.keys(rec.refeicoesRecurso).length>0) ? rec.refeicoesRecurso : null;
      const refRaw = refRawMap || (Array.isArray(rec.refeicoes) ? rec.refeicoes : null);
          const map={};
          if(Array.isArray(refRaw)){
            refRaw.forEach(iv=>{
              const dia=iv?.dia||iv?.data; const turno=iv?.turnoId||iv?.turno; const ini=iv?.inicio||iv?.ini; const fim=iv?.fim||iv?.termino; if(!dia || !ini || !fim) return;
              const comp = (typeof iv?.computavel==='boolean') ? iv.computavel : (!/nao[_ ]?computad|não[_ ]?computad/i.test(String(iv?.tipo||'')));
              const tipo = iv?.tipo || 'ALMOCO';
              if(turno){
                const k=normalizarAllocationKey(dia, turno, (rec.equipeId||eid)); if(!map[k]) map[k]=[]; map[k].push({ inicio: ini, fim: fim, computavel: comp, tipo });
              } else {
                // Se já temos alocações ativas para o dia, mapear diretamente
                const ativosDia = Object.keys(state.matrizAlocacao||{}).filter(a=> state.matrizAlocacao[a] && a.startsWith(normalizarDiaIso(dia)+'__'));
                if(ativosDia.length){
                  const alvo = ativosDia[0]; if(!map[alvo]) map[alvo]=[]; map[alvo].push({ inicio: ini, fim: fim, computavel: comp, tipo });
                } else {
                  state.__refPend.push({ dia: normalizarDiaIso(dia), inicio: ini, fim: fim, computavel: comp, tipo });
                }
              }
            });
          } else if(refRaw && typeof refRaw==='object'){
            Object.entries(refRaw).forEach(([k,lista])=>{
              const parts=String(k).split('__'); if(parts.length===2){ const nk=normalizarAllocationKey(parts[0], parts[1], (rec.equipeId||eid));
                map[nk]=Array.isArray(lista)? lista.map(x=> ({ inicio:x.inicio||x.ini, fim:x.fim||x.termino, computavel: (typeof x.computavel==='boolean') ? x.computavel : (!/nao[_ ]?computad|não[_ ]?computad/i.test(String(x.tipo||''))), tipo: x.tipo||'ALMOCO' })) : []; }
            });
          }
          state.refeicoes = map;
          try { reconciliarRefeicoesComMatriz(); } catch(_r){}
        } catch(_rf){ }
      }
    } catch(err){ console.warn('[modal_recurso] carregarDadosParaTabsSeNecessario falhou', err); }
  }

  // Persiste as refeições atuais do recurso (state.refeicoes + pendentes) no backend.
  // Envia lista completa substitutiva (inclui deleções quando vazia).
  async function salvarRefeicoesNoBackend(){
    const ridBase = state.recurso?.id || state.recurso?._id || state.recurso?.referenciaGestorId || state.recurso?.referencia_gestor_id;
    let eid = state.recurso?.equipeId || document.getElementById('recursoEquipeSelect')?.value || null;
    let escalaId = window.__ESCALA_STATE__?.escalaId;
    if(!escalaId){ try { const u=new URL(location.href); escalaId = u.searchParams.get('id') || escalaId; } catch(_e){} }
    if(!ridBase) throw new Error('Recurso não definido');
    if(!escalaId) throw new Error('Escala não identificada');
    // Resolver/validar equipeId a partir da escala quando necessário
    async function validarOuResolverEquipeId(eidAtual){
      const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      async function tentar(){
        let rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
        if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
        if(!rEsc.ok) return null;
        const js = await rEsc.json().catch(()=>null); const d = js && (js.data||js);
        const equipes = Array.isArray(d?.equipes)? d.equipes:[];
        if(eidAtual && equipes.some(eq=> (eq.id||eq._id) == eidAtual)) return eidAtual;
        const placaUp = state.recurso?.placa ? String(state.recurso.placa).toUpperCase() : null;
        for(const eq of equipes){
          if(Array.isArray(eq.recursos)){
            const hit = eq.recursos.find(x=> (x.id||x._id||x.referenciaGestorId||x.referencia_gestor_id)===ridBase || (placaUp && String(x.placa||x.codigo||'').toUpperCase()===placaUp));
            if(hit) return (eq.id || eq._id || null);
          }
        }
        return null;
      }
      let resolved=null; for(let i=0;i<5 && !resolved;i++){ try { resolved = await tentar(); } catch(_){ } if(!resolved) await new Promise(r=> setTimeout(r, 200)); }
      return resolved || eidAtual;
    }
    if(!eid){ eid = await validarOuResolverEquipeId(eid); }
    if(!eid) throw new Error('Equipe não identificada');
    // Resolver rid real dentro da equipe (caso id local seja referenciaGestorId)
    async function resolverRidValido(escalaId, eid, ridCandidato){
      const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      try {
        const u = baseEsc + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(ridCandidato);
        const r = await fetch(u, { credentials:'same-origin' }); if(r && r.ok) return ridCandidato;
      } catch(_){ }
      try {
        let rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
        if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
        if(rEsc && rEsc.ok){
          const js = await rEsc.json().catch(()=>null); const d = js && (js.data||js);
          const eq=(Array.isArray(d?.equipes)? d.equipes:[]).find(e=> (e.id||e._id)==eid);
          if(eq && Array.isArray(eq.recursos)){
            const placaUp = state.recurso?.placa ? String(state.recurso.placa).toUpperCase() : null;
            const hit = eq.recursos.find(r=> (r.id||r._id||r.referenciaGestorId||r.referencia_gestor_id)===ridCandidato || (placaUp && String(r.placa||r.codigo||'').toUpperCase()===placaUp));
            if(hit && (hit.id||hit._id)) return hit.id||hit._id;
          }
        }
      } catch(_){ }
      return ridCandidato;
    }
    let rid = await resolverRidValido(escalaId, eid, ridBase);
    // Construir lista completa de refeições a partir do estado local
    const refeicoesArr = [];
    try {
      Object.entries(state.refeicoes||{}).forEach(([alloc, lista])=>{
        const [diaRaw, turnoRaw] = String(alloc).split('__');
        if(!diaRaw || !turnoRaw) return;
        if(Array.isArray(lista)){
          lista.forEach(it=>{
            const inicio = it.inicio || it.ini; const fim = it.fim || it.termino;
            if(!inicio || !fim) return;
            const tipo = it.tipo || 'ALMOCO';
            const computavel = (typeof it.computavel==='boolean') ? it.computavel : true;
            refeicoesArr.push({ dia: diaRaw, turnoId: turnoRaw, inicio, fim, tipo, computavel });
          });
        }
      });
      if(Array.isArray(state.__refPend) && state.__refPend.length){
        state.__refPend.forEach(p=>{
          if(p && p.dia && p.inicio && p.fim){
            refeicoesArr.push({ dia: normalizarDiaIso(p.dia), inicio: p.inicio, fim: p.fim, tipo: p.tipo||'ALMOCO', computavel: (typeof p.computavel==='boolean') ? p.computavel : true });
          }
        });
      }
    } catch(_e){ }
    const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
    const recursoCompleto = { id: rid, equipeId: eid, refeicoes: refeicoesArr };
    async function tryPut(u){ try{ console.log('PUT salvarRefeicoesNoBackend:', u, recursoCompleto); return await fetch(u, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) }); } catch(_){ return { ok:false, status:-1, text: async()=>'' }; } }
    const tries = [
      base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid),
      '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid)
    ];
    let lastRes=null, ok=false;
    for(const u of tries){ const r=await tryPut(u); lastRes=r; if(r && (r.ok || r.status===200 || r.status===204)) { ok=true; break; } }
    if(!ok && lastRes && lastRes.status===404){
      // Tentar criar recurso e reexecutar PUT
      try {
        const postUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos';
        const rCreate = await fetch(postUrl, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: { id: rid, equipeId: eid } }) });
        if(rCreate && rCreate.ok){
          await new Promise(r=> setTimeout(r, 150));
          const putUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
          const rPut = await fetch(putUrl, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) });
          lastRes = rPut; ok = rPut && (rPut.ok || rPut.status===200 || rPut.status===204);
        }
      } catch(_c){ }
    }
    if(!ok){
      let msg='Falha ao salvar refeições';
      try { const t = await (lastRes && lastRes.text ? lastRes.text() : Promise.resolve('')); if(t) msg += ': ' + t; } catch(_){ }
      throw new Error(msg);
    }
    try { await carregarDadosParaTabsSeNecessario('refeicao', true); } catch(_){ }
    return true;
  }

  // Garantir que __ESCALA_STATE__ tenha gruposTurnos/periodo/equipes; e tentar resolver equipe do recurso
  async function ensureEscalaGlobal(){
    try {
      const escalaId = window.__ESCALA_STATE__?.escalaId || (new URL(location.href)).searchParams.get('id');
      if(!escalaId) return;
      const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      let r = await fetch(base + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
      if(!r.ok){ try { r = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
      if(!r.ok) return;
      const js = await r.json().catch(()=>null);
      const d = js && (js.data || js);
  if(!d) return;
      window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {};
  // Mapear grupos de turnos (aceita camelCase e snake_case)
  if(Array.isArray(d.gruposTurnos) && d.gruposTurnos.length){ window.__ESCALA_STATE__.gruposTurnos = d.gruposTurnos; }
  else if(Array.isArray(d.grupos_turnos) && d.grupos_turnos.length){ window.__ESCALA_STATE__.gruposTurnos = d.grupos_turnos; }
  // Mapear matriz de alocação, se exposta no documento da escala
  if(d.alocacao && typeof d.alocacao==='object'){ window.__ESCALA_STATE__.matrizAlocacao = d.alocacao; }
      // Período: usar d.periodo se existir; senão derivar de data_inicio/data_fim
      if(d.periodo && d.periodo.ini && d.periodo.fim){ window.__ESCALA_STATE__.periodo = d.periodo; }
      else if(d.data_inicio || d.data_fim){
        try {
          const di = d.data_inicio ? new Date(d.data_inicio) : null;
          const df = d.data_fim ? new Date(d.data_fim) : null;
          const fmt = (x)=> x && !isNaN(x) ? x.toISOString().slice(0,10) : null;
          const ini = fmt(di); const fim = fmt(df);
          if(ini && fim){ window.__ESCALA_STATE__.periodo = { ini, fim }; }
        } catch(_p){ /* noop */ }
      }
      if(Array.isArray(d.equipes)) window.__ESCALA_STATE__.equipes = d.equipes;
      // Resolver equipe do recurso se não definida
      if(state.recurso && !state.recurso.equipeId && Array.isArray(d.equipes)){
        const rid = state.recurso.id || state.recurso._id || state.recurso.referenciaGestorId;
        for(const eq of d.equipes){ if(Array.isArray(eq.recursos) && eq.recursos.some(x=> (x.id||x._id||x.referenciaGestorId)===rid)){ state.recurso.equipeId = eq.id || eq._id || null; break; } }
        // Fallback: se ainda não definido e há exatamente uma equipe, use-a
        if(!state.recurso.equipeId && d.equipes.length===1){
          state.recurso.equipeId = d.equipes[0].id || d.equipes[0]._id || null;
        }
        try {
          const sel=document.getElementById('recursoEquipeSelect');
          if(sel && state.recurso.equipeId){ sel.value = String(state.recurso.equipeId); }
        } catch(_){ }
      }
      // Recarregar lista de equipes locais caso ainda não tenha
      try {
        if((!state.escala?.equipes || !state.escala.equipes.length) && Array.isArray(d.equipes)){
          state.escala = state.escala || {}; state.escala.equipes = d.equipes;
        }
        // Atualizar select de equipes com dados frescos e re-selecionar a equipe do recurso
        try { await carregarEquipes(); } catch(_){ carregarEquipes(); }
        try { if(state.recurso?.equipeId){ const sel=document.getElementById('recursoEquipeSelect'); if(sel){ sel.value = String(state.recurso.equipeId); } } } catch(_){ }
      } catch(_){ }
    } catch(err){ console.warn('[modal_recurso] ensureEscalaGlobal falhou', err); }
  }

  // Versão top-level: persiste TODAS as alocações atuais (state.matrizAlocacao) via PUT único, com fallbacks.
  async function salvarAlocacoesNoBackend(){
    try {
      let ridBase = state.recurso?.id || state.recurso?._id || state.recurso?.referenciaGestorId || state.recurso?.referencia_gestor_id;
      let eid = state.recurso?.equipeId || document.getElementById('recursoEquipeSelect')?.value || null;
      let escalaId = window.__ESCALA_STATE__?.escalaId || (function(){ try { return (new URL(location.href)).searchParams.get('id'); } catch(_){ return null; } })();
      if(!ridBase || !escalaId) throw new Error('Contexto incompleto para salvar alocações');
      // Resolver/validar equipeId pelo backend quando necessário
      async function validarOuResolverEquipeId(eidAtual){
        const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        async function tentar(){
          let rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
          if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
          if(!rEsc.ok) return null;
          const js = await rEsc.json().catch(()=>null); const d = js && (js.data||js);
          const equipes = Array.isArray(d?.equipes)? d.equipes:[];
          if(eidAtual && equipes.some(eq=> (eq.id||eq._id) == eidAtual)) return eidAtual;
          const placaUp = state.recurso?.placa ? String(state.recurso.placa).toUpperCase() : null;
          for(const eq of equipes){ if(Array.isArray(eq.recursos)){ const hit = eq.recursos.find(x=> (x.id||x._id||x.referenciaGestorId)===ridBase || (placaUp && String(x.placa||x.codigo||'').toUpperCase()===placaUp)); if(hit) return (eq.id||eq._id||null); } }
          return null;
        }
        let resolved=null; for(let i=0;i<5 && !resolved;i++){ try { resolved = await tentar(); } catch(_){ } if(!resolved) await new Promise(r=> setTimeout(r, 200)); }
        return resolved || eidAtual;
      }
      if(!eid) eid = await validarOuResolverEquipeId(eid);
      if(!eid) throw new Error('Equipe não identificada');
      // Resolver rid real aninhado sob a equipe
      async function resolverRidValido(escalaId, eid, ridCandidato){
        const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        try {
          const u = baseEsc + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(ridCandidato);
          const r = await fetch(u, { credentials:'same-origin' }); if(r.ok) return ridCandidato;
        } catch(_){ }
        try {
          let rEsc = await fetch(baseEsc + '/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' });
          if(!rEsc.ok){ try { rEsc = await fetch('/api/escalas/' + encodeURIComponent(escalaId), { credentials:'same-origin' }); } catch(_fb){} }
          if(rEsc.ok){
            const js = await rEsc.json().catch(()=>null); const d = js && (js.data||js);
            const eq=(Array.isArray(d?.equipes)? d.equipes:[]).find(e=> (e.id||e._id)==eid);
            if(eq && Array.isArray(eq.recursos)){
              const placaUp = state.recurso?.placa ? String(state.recurso.placa).toUpperCase() : null;
              const nome = state.recurso?.nome ? String(state.recurso.nome).trim().toLowerCase() : null;
              const hit = eq.recursos.find(r=> (r.id||r._id||r.referenciaGestorId)===ridCandidato || (placaUp && String(r.placa||r.codigo||'').toUpperCase()===placaUp) || (nome && String(r.nome||'').trim().toLowerCase()===nome));
              if(hit && (hit.id||hit._id)) return hit.id||hit._id;
            }
          }
        } catch(_){ }
        return ridCandidato;
      }
      async function esperarRecursoDisponivel(escalaId, eid, ridAlvo){
        const baseEsc=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
        const url = baseEsc + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(ridAlvo);
        for(let tent=0; tent<8; tent++){
          try { const r = await fetch(url, { credentials:'same-origin' }); if(r && r.ok) return true; } catch(_e){}
          await new Promise(r=> setTimeout(r, 220 + tent*160));
        }
        return false;
      }
      let rid = await resolverRidValido(escalaId, eid, ridBase);
      const visivel = await esperarRecursoDisponivel(escalaId, eid, rid);
      if(!visivel){ const novoRid = await resolverRidValido(escalaId, eid, rid); if(novoRid && novoRid!==rid) rid = novoRid; }
      const alocacoesArr = Object.entries(state.matrizAlocacao||{})
        .filter(([_, v])=> !!v)
        .map(([alloc])=>{ const [diaRaw, turnoRaw]=String(alloc).split('__'); return { dia: diaRaw, turnoId: turnoRaw }; });
  const matrizPayload2 = {}; alocacoesArr.forEach(a=>{ if(a&&a.dia&&a.turnoId){ matrizPayload2[normalizarDiaIso(a.dia)+'__'+a.turnoId] = true; } });
  const recursoCompleto = { id: rid, equipeId: eid, alocacoes: alocacoesArr, matrizAlocacao: matrizPayload2, clienteMandouAloc: true };
      const base=(function(){ let bp='/escalas'; try { const p=location.pathname.split('/').filter(Boolean); const i=p.indexOf('escalas'); if(i!==-1) bp='/' + p[i]; } catch(_){ } return bp; })();
      const url1 = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
      console.log('PUT salvarAlocacoesNoBackend:', url1, recursoCompleto);
      let res = await fetch(url1, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) });
      if(!res.ok){
        try {
          const url2 = '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
          res = await fetch(url2, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) });
        } catch(_){ }
      }
      if(!res.ok && res.status===404){
        try {
          const postUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos';
          const rCreate = await fetch(postUrl, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: { id: rid, equipeId: eid } }) });
          if(rCreate.ok){
            await new Promise(r=> setTimeout(r, 150));
            const putUrl = base + '/api/escalas/' + encodeURIComponent(escalaId) + '/equipes/' + encodeURIComponent(eid) + '/recursos/' + encodeURIComponent(rid);
            res = await fetch(putUrl, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ recurso: recursoCompleto }) });
          }
        } catch(_fb){ }
      }
      if(!res.ok){
        let msg='Falha ao salvar alocações iniciais';
        try { const err=await res.json(); if(err && err.error) msg += ': ' + err.error; else { const t=await res.text(); if(t) msg += ': ' + t; } } catch(_){ }
        throw new Error(msg);
      }
      // Re-hidratar mapeamentos locais após salvar
      try { await carregarDadosParaTabsSeNecessario('atribuicao', true); } catch(_){ }
      try { await carregarDadosParaTabsSeNecessario('refeicao', true); } catch(_){ }
      return true;
    } catch(err){ console.warn('[modal_recurso][global] salvarAlocacoesNoBackend falhou', err); throw err; }
  }

  function abrirModalIntervalosRefeicao(allocationId){
    allocRefeicaoAtual = allocationId;
    if(!modalIntervalosRef){
      const el = document.getElementById('modalIntervalosRefeicao');
      if(!el){ console.warn('Modal intervalos refeição não encontrado'); return; }
      modalIntervalosRef = new bootstrap.Modal(el);
    }
    // Info header
    const info = document.getElementById('infoRefeicaoAlocacao');
    const [dataISO, turnoIdRaw] = allocationId.split('__');
    const m = turnoIdRaw.match(/(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    const ini = m?m[1]:'--:--'; const fim = m?m[2]:'--:--';
    info.innerHTML = `<strong>Data:</strong> ${formatarDataBr(dataISO)} &nbsp; <strong>Turno:</strong> ${ini}-${fim}`;
    // Limpar inputs
    document.getElementById('intervaloInicio').value='';
    document.getElementById('intervaloFim').value='';
    document.getElementById('intervaloComputavel').checked = true;
    document.querySelector('input[name="escopoIntervalo"][value="atual"]').checked = true;
    renderIntervalosModal();
    modalIntervalosRef.show();
  }

  function renderIntervalosModal(){
    const tbody = document.querySelector('#tabelaIntervalosRefeicao tbody');
    if(!tbody) return;
    const lista = state.refeicoes[allocRefeicaoAtual]||[];
    tbody.innerHTML = lista.map((iv,idx)=>{
      // Duração considerando possível cruzamento de meia-noite no turno atual
      const dur = duracaoIntervalo(allocRefeicaoAtual, iv.inicio, iv.fim);
      return `<tr data-idx="${idx}">`+
        `<td>${iv.computavel?'<span class="badge bg-success">Sim</span>':'<span class="badge bg-secondary">Não</span>'}</td>`+
        `<td>${iv.editing?`<input type=\"time\" class=\"form-control form-control-sm input-time-simples\" data-edit-inicio=\"${idx}\" value=\"${iv.inicio}\" step=\"60\">`:iv.inicio}</td>`+
        `<td>${iv.editing?`<input type=\"time\" class=\"form-control form-control-sm input-time-simples\" data-edit-fim=\"${idx}\" value=\"${iv.fim}\" step=\"60\">`:iv.fim}</td>`+
        `<td>${formatDuracao(dur)}</td>`+
        `<td>`+
          (iv.editing
            ? `<button type=\"button\" class=\"btn btn-sm btn-success me-1\" data-save-intervalo=\"${idx}\"><i class=\"bi bi-check\"></i></button>`+
              `<button type=\"button\" class=\"btn btn-sm btn-outline-secondary\" data-cancel-intervalo=\"${idx}\"><i class=\"bi bi-x\"></i></button>`
            : `<button type=\"button\" class=\"btn btn-sm btn-outline-primary me-1\" data-editar-intervalo=\"${idx}\"><i class=\"bi bi-pencil\"></i></button>`+
              `<button type=\"button\" class=\"btn btn-sm btn-outline-danger\" data-remover-intervalo=\"${idx}\"><i class=\"bi bi-trash\"></i></button>`
          )+
        `</td>`+
      `</tr>`;
    }).join('');
    // Delegar ações
    tbody.querySelectorAll('[data-remover-intervalo]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const i = +btn.getAttribute('data-remover-intervalo');
        const arr = state.refeicoes[allocRefeicaoAtual]||[];
        arr.splice(i,1);
        renderIntervalosModal();
      });
    });
    tbody.querySelectorAll('[data-editar-intervalo]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = +btn.getAttribute('data-editar-intervalo');
        const arr = state.refeicoes[allocRefeicaoAtual]||[]; const item = arr[idx]; if(!item) return;
        item.editing = true; renderIntervalosModal();
      });
    });
    tbody.querySelectorAll('[data-cancel-intervalo]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = +btn.getAttribute('data-cancel-intervalo');
        const arr = state.refeicoes[allocRefeicaoAtual]||[]; const item = arr[idx]; if(!item) return;
        delete item.editing; renderIntervalosModal();
      });
    });
    tbody.querySelectorAll('[data-save-intervalo]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = +btn.getAttribute('data-save-intervalo');
        const arr = state.refeicoes[allocRefeicaoAtual]||[]; const item = arr[idx]; if(!item) return;
        const iniEl = tbody.querySelector(`input[data-edit-inicio="${idx}"]`);
        const fimEl = tbody.querySelector(`input[data-edit-fim="${idx}"]`);
        const novoIni = iniEl.value; const novoFim = fimEl.value;
        if(!novoIni || !novoFim){ toastInfo('Informe início e término'); return; }
        if(!intervaloDentroDoTurno(allocRefeicaoAtual, novoIni, novoFim)){
          toastInfo('Intervalo deve estar contido no turno'); return; }
        const arrCheck = arr.filter((_,i)=> i!==idx);
        // Verificação de sobreposição usando mapeamento no espaço do turno (suporta cruzar meia-noite)
        const novoIniMin = mapToTurnoSpace(allocRefeicaoAtual, novoIni);
        const novoFimMin = mapToTurnoSpace(allocRefeicaoAtual, novoFim);
        const conflito = arrCheck.some(iv=>{
          const aIni = mapToTurnoSpace(allocRefeicaoAtual, iv.inicio);
          const aFim = mapToTurnoSpace(allocRefeicaoAtual, iv.fim);
          return (novoIniMin < aFim) && (novoFimMin > aIni);
        });
        if(conflito){ toastInfo('Intervalo sobreposto a existente'); return; }
        item.inicio = novoIni; item.fim = novoFim; delete item.editing;
        // Ordenar pelo horário mapeado dentro do turno
        arr.sort((a,b)=> mapToTurnoSpace(allocRefeicaoAtual, a.inicio) - mapToTurnoSpace(allocRefeicaoAtual, b.inicio));
        renderIntervalosModal();
      });
    });
    // Fallback JS: remover qualquer ícone residual (alguns navegadores ignoram CSS até reflow)
    requestAnimationFrame(()=>{
      tbody.querySelectorAll('input[type=time].input-time-simples').forEach(inp=>{
        try { inp.setAttribute('inputmode','numeric'); } catch(_){ }
      });
    });
  }

  function calcularDuracaoMinutos(hIni, hFim){
    if(!/\d{2}:\d{2}/.test(hIni) || !/\d{2}:\d{2}/.test(hFim)) return 0;
    const [hi,mi] = hIni.split(':').map(Number); const [hf,mf] = hFim.split(':').map(Number);
    return (hf*60+mf) - (hi*60+mi);
  }
  function formatDuracao(mins){
    if(mins<=0) return '0m';
    const h = Math.floor(mins/60); const m = mins%60;
    if(h && m) return `${h}h${String(m).padStart(2,'0')}m`;
    if(h) return `${h}h`;
    return `${m}m`;
  }

  function adicionarIntervalo(){
    if(!allocRefeicaoAtual) return;
    const iniEl = document.getElementById('intervaloInicio');
    const fimEl = document.getElementById('intervaloFim');
    const compEl = document.getElementById('intervaloComputavel');
    const ini = iniEl.value; const fim = fimEl.value; const computavel = !!compEl.checked;
    if(!ini || !fim){ toastInfo('Informe início e término'); return; }
    if(!intervaloDentroDoTurno(allocRefeicaoAtual, ini, fim)){
      toastInfo('Intervalo deve estar dentro do turno'); return; }
    const arr = state.refeicoes[allocRefeicaoAtual] = state.refeicoes[allocRefeicaoAtual]||[];
    // Validação de sobreposição
    const novoIni = mapToTurnoSpace(allocRefeicaoAtual, ini);
    const novoFim = mapToTurnoSpace(allocRefeicaoAtual, fim);
    const conflito = arr.some(iv=>{
      const aIni = mapToTurnoSpace(allocRefeicaoAtual, iv.inicio);
      const aFim = mapToTurnoSpace(allocRefeicaoAtual, iv.fim);
      return (novoIni < aFim) && (novoFim > aIni); // overlap
    });
    if(conflito){ toastInfo('Intervalo sobreposto a existente'); return; }
    arr.push({ inicio: ini, fim: fim, computavel });
    // Ordenar por início
    arr.sort((a,b)=> mapToTurnoSpace(allocRefeicaoAtual, a.inicio) - mapToTurnoSpace(allocRefeicaoAtual, b.inicio));
    iniEl.value=''; fimEl.value=''; compEl.checked=true;
    renderIntervalosModal();
  }

  function calcularHorasEfetivasStr(turnoIni, turnoFim, intervalos){
    // Cálculo do total do turno considerando possível cruzamento de meia-noite
    const toMin = (hhmm)=>{ const [h,m]=(hhmm||'00:00').split(':').map(Number); return h*60+m; };
    const s = toMin(turnoIni);
    const e = toMin(turnoFim);
    const wrap = e <= s;
    const sBound = s;
    const eBound = wrap ? (e + 1440) : e;
    const durTotal = Math.max(0, eBound - sBound);
    if(!intervalos || !intervalos.length) return formatDuracao(durTotal);
    // Para desconto, mapear cada intervalo no espaço do turno corrente
    const allocFake = `__DUMMY__::${turnoIni}-${turnoFim}`; // compatível com extrairTurnoDeAlloc/mapToTurnoSpace
    const desconto = intervalos.filter(iv=> !iv.computavel)
      .reduce((acc,iv)=> acc + duracaoIntervalo(allocFake, iv.inicio, iv.fim), 0);
    return formatDuracao(Math.max(0, durTotal - desconto));
  }

  function salvarIntervalosRefeicaoEscopo(){
    if(!allocRefeicaoAtual){ toastInfo('Nenhuma alocação selecionada'); return; }
    const base = (state.refeicoes[allocRefeicaoAtual]||[]).map(iv=>({...iv}));
    // Escopo
    const escopo = document.querySelector('input[name="escopoIntervalo"]:checked')?.value || 'atual';
    if(escopo==='atual'){
  (async ()=>{ try { await salvarRefeicoesNoBackend(); toastSucesso('Intervalos salvos para alocação atual.'); } catch(err){ console.warn('[modal_recurso] persist refeicao atual falhou', err); toastInfo('Falha ao salvar refeições no servidor.'); } finally { try { modalIntervalosRef.hide(); } catch(_){ } gerarTabelaRefeicoes(); } })();
      return;
    }
    const ordenados = obterAlocacoesAtivasOrdenadas();
    const idxAtual = ordenados.indexOf(allocRefeicaoAtual);
    if(idxAtual===-1){ toastInfo('Não foi possível ordenar alocações'); return; }
    let alvos=[];
    if(escopo==='seguintes') alvos = ordenados.slice(idxAtual+1);
    else if(escopo==='todas') alvos = ordenados.filter(a=> a!==allocRefeicaoAtual);
    const turnoAtual = extrairTurnoDeAlloc(allocRefeicaoAtual);
    alvos = alvos.filter(a=>{ const t=extrairTurnoDeAlloc(a); return t.ini===turnoAtual.ini && t.fim===turnoAtual.fim; });
    alvos.forEach(a=>{ state.refeicoes[a] = base.map(x=>({...x})); });
    (async ()=>{
      try {
        await salvarRefeicoesNoBackend();
        toastSucesso(`Intervalos copiados e salvos para ${alvos.length} alocações compatíveis.`);
      } catch(err){ console.warn('[modal_recurso] salvarIntervalosRefeicaoEscopo persist fail', err); toastInfo('Falha ao salvar refeições no servidor.'); }
      finally { try { modalIntervalosRef.hide(); } catch(_){ } gerarTabelaRefeicoes(); }
    })();
  }

  function extrairTurnoDeAlloc(alloc){
    const allocStr = String(alloc||'');
    // Captura a última ocorrência de HH:MM-HH:MM em toda a string
    const matches = Array.from(allocStr.matchAll(/(\d{2}:\d{2})-(\d{2}:\d{2})/g));
    if(matches.length){
      const m = matches[matches.length-1];
      return { ini: m[1], fim: m[2] };
    }
    return { ini: null, fim: null };
  }

  // Helpers de mapeamento de horário para o espaço do turno (suporta cruzar meia-noite)
  function mapToTurnoSpace(alloc, hhmm){
    const t = extrairTurnoDeAlloc(alloc);
    const toMin = (x)=>{ const [h,m]=(String(x||'00:00')).split(':').map(Number); return h*60+m; };
    const v = toMin(hhmm);
    if(!t.ini || !t.fim){
      // Sem referência de turno, retornar minuto absoluto para manter ordenação estável
      return v;
    }
    const s = toMin(t.ini);
    const e = toMin(t.fim);
    const wrap = e <= s;
    return (wrap && v <= e) ? (v + 1440) : v;
  }

  function duracaoIntervalo(alloc, ini, fim){
    const t = extrairTurnoDeAlloc(alloc);
    if(!t.ini || !t.fim) return 0;
    const toMin = (x)=>{ const [h,m]=(String(x||'00:00')).split(':').map(Number); return h*60+m; };
    const s = toMin(t.ini);
    const e = toMin(t.fim);
    const wrap = e <= s;
    const start = mapToTurnoSpace(alloc, ini);
    const end = mapToTurnoSpace(alloc, fim);
    const sBound = s;
    const eBound = wrap ? (e + 1440) : e;
    if(!(start >= sBound && end <= eBound && end > start)) return 0;
    return Math.max(0, end - start);
  }

  function intervaloDentroDoTurno(alloc, ini, fim){
    const t = extrairTurnoDeAlloc(alloc);
    if(!t.ini || !t.fim) return false; // sem janela de turno válida, bloquear
    if(t.ini === t.fim) return false; // evitar turno 24h por erro de parsing
    const toMin = (hhmm)=>{ const [h,m]=String(hhmm||'00:00').split(':').map(Number); return (h*60+m); };
    const s = toMin(t.ini);
    const e = toMin(t.fim);
    const wrap = e <= s; // turno cruza a meia-noite
    const map = (valMin)=> wrap && valMin <= e ? (valMin + 1440) : valMin;
    const start = map(toMin(ini));
    const end = map(toMin(fim));
    const sBound = s; // já está no dia base
    const eBound = wrap ? (e + 1440) : e;
    // Regras: início >= sBound e <= eBound-1; fim >= sBound+1 e <= eBound; fim > início
    if(!(start >= sBound && start <= eBound - 1)) return false;
    if(!(end >= sBound + 1 && end <= eBound)) return false;
    if(!(end > start)) return false;
    return true;
  }

})();
