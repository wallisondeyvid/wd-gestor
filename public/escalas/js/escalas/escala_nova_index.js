(function(){
  // Orquestrador da página principal: liga abas e integra com o core canônico
  function getId(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||null; }catch(_){ return null; } }
  // Atualiza título para edição
  try { if(getId()){ const h=document.getElementById('tituloPrincipalEscala'); if(h) h.textContent='Editar Escala'; if(document && document.title) document.title='Editar Escala - WDGestor'; } } catch(_e){}

  // Habilita/desabilita abas com base na função global do core, caindo em stub se necessário
  function setTabs(cfg){ try { if(typeof window.setAbasHabilitadas==='function'){ window.setAbasHabilitadas(cfg); } } catch(_e){} }

  // Eventos de integração
  document.addEventListener('escalaCoreReady', ()=>{
    setTimeout(()=>{ try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_e){} }, 0);
  });
  document.addEventListener('escala:core-ready', ()=>{
    setTimeout(()=>{ try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_e){} }, 0);
  });

  // Persistência da aba ativa (sessionStorage)
  (function(){
    function keys(){ try{ const u=new URL(location.href); const id=u.searchParams.get('id')||'novo'; const base=location.pathname.replace(/\/$/,''); return { active:`wdg.escala.activeTab:${base}:${id}`, allow:`wdg.escala.allowAutoSwitchRec:${base}:${id}` }; }catch(_){ return { active:'wdg.escala.activeTab', allow:'wdg.escala.allowAutoSwitchRec' }; } }
    function restore(){ try{ const saved=sessionStorage.getItem(keys().active); if(!saved) return; const sel=saved.startsWith('#')? saved : ('#'+saved); const btn=document.querySelector(`[data-bs-target="${sel}"]`); if(btn && !btn.classList.contains('disabled')){ const inst=bootstrap.Tab.getOrCreateInstance(btn); inst.show(); } }catch(_e){} }
    function bind(){ try{ document.addEventListener('shown.bs.tab', function(ev){ try{ const el=ev?.target; const target=(el?.getAttribute && (el.getAttribute('data-bs-target')||el.getAttribute('href'))) || el?.dataset?.bsTarget || ''; if(!target) return; sessionStorage.setItem(keys().active, target); }catch(_s){} }); }catch(_e){} }
    if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', function(){ bind(); setTimeout(restore,50); }); } else { bind(); setTimeout(restore,0); }
    // expõe helpers
    try { window.__ESC_KEYS__ = keys; } catch(_e){}
  })();

  // Fallback: carregar escala por id se o core atrasar
  (function(){
    function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
    function isoToBr(iso){ if(!iso) return ''; const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m? `${m[3]}/${m[2]}/${m[1]}`:''; }
    function corePronto(){ return window.__ESCALA_BOOT_OK===true; }
    async function carregarManual(){
      const id = getId(); if(!id) return;
      try{
        const r = await fetch(`${bp()}/api/escalas/${encodeURIComponent(id)}`, { credentials:'same-origin' });
        if(!r.ok) return; const js=await r.json(); const d=js?.data||js?.escala||js; if(!d) return;
        const desc=document.getElementById('descricaoEscala'); if(desc && d.descricao) desc.value=d.descricao;
        const cls=document.getElementById('classificacaoEscala'); if(cls && d.classificacao) cls.value=d.classificacao;
        const lbl=document.getElementById('tipoEscalaLabel'); if(lbl && d.classificacao) lbl.textContent='('+d.classificacao+')';
        const di=document.getElementById('dataInicio'); if(di && d.data_inicio) di.value=isoToBr(d.data_inicio);
        const df=document.getElementById('dataFim'); if(df && d.data_fim) df.value=isoToBr(d.data_fim);
        const sel=document.getElementById('unidadeEscala'); if(sel && d.unidade_id){ const val=String(d.unidade_id); if(!sel.querySelector(`option[value="${val}"]`)){ const opt=document.createElement('option'); opt.value=val; opt.textContent='(Unidade)'; sel.appendChild(opt); } sel.value=val; try{ sel.dispatchEvent(new Event('change',{bubbles:true})); }catch(_e){} }
        // Responsável (id e nome) vindo do backend, com resolução do nome se necessário
        try {
          let respId = d.responsavel_id || d.responsavelId || d.responsavelID || d.criado_por || null;
          let respNome = d.responsavel_nome || d.responsavelNome || d.responsavel_nome_final || d.responsavel_nome_resolvido || '';
          let respCodigo = d.responsavel_codigo || '';
          let respDisplay = d.responsavel_display || '';
          if(respId && !respNome){
            try{
              const url1 = `${bp()}/api/funcionarios/por-ids?ids=${encodeURIComponent(String(respId))}`;
              const url2 = `/api/funcionarios/por-ids?ids=${encodeURIComponent(String(respId))}`;
              let rr = await fetch(url1, { credentials:'same-origin' });
              if(!rr.ok) rr = await fetch(url2, { credentials:'same-origin' });
              if(rr.ok){
                const j2 = await rr.json();
                const arr = Array.isArray(j2?.data) ? j2.data : (Array.isArray(j2)? j2 : []);
                const f0 = arr[0];
                if(f0 && (f0.nome || f0.codigo)) { respNome = f0.nome || ''; respCodigo = f0.codigo || respCodigo || ''; }
              }
            }catch(_res){ /* noop */ }
            // Fallback adicional: se ainda não temos nome, resolver via usuário
            if(!respNome && (window.__ESCALAS_ENABLE_USER_STATUS===true || window.__ESCALAS_HAS_USER_STATUS==='1')){
              try {
                const u1 = `${bp()}/api/usuarios/${encodeURIComponent(String(respId))}/status`;
                const u2 = `/api/usuarios/${encodeURIComponent(String(respId))}/status`;
                let ru = await fetch(u1, { credentials:'same-origin' });
                if(!ru.ok) ru = await fetch(u2, { credentials:'same-origin' });
                if(ru.ok){
                  const ju = await ru.json();
                  const cand = ju?.data || ju || {};
                  const nm = cand.nome || cand.name || cand.displayName || cand.fullname || cand.fullName || cand.usuario || cand.user || null;
                  const mail = cand.email || cand.login || cand.username || null;
                  if(nm) respNome = nm; else if(mail) respNome = mail;
                }
              } catch(_user){ /* noop user fallback */ }
            }
          }
          // Montar rótulo preferindo responsavel_display; senão "COD - Nome"
          let display = respDisplay || '';
          if(!display){
            if(respCodigo && respNome) display = `${respCodigo} - ${respNome}`;
            else if(respNome) display = respNome;
            else display = String(respId || '');
          }
          // Se ainda parece ObjectId, usar endpoint dedicado para resolver
          if(display && /^[0-9a-fA-F]{24}$/.test(display) && respId){
            try{
              const r3 = await fetch(`${bp()}/api/escalas/resolve-responsavel?id=${encodeURIComponent(String(respId))}`, { credentials:'same-origin' });
              if(!r3.ok){
                const r3b = await fetch(`/api/escalas/resolve-responsavel?id=${encodeURIComponent(String(respId))}`, { credentials:'same-origin' });
                if(r3b.ok){ const j3=await r3b.json(); if(j3?.display){ display=j3.display; respNome=j3.nome||respNome; respCodigo=j3.codigo||respCodigo; }
                }
              } else {
                const j3=await r3.json(); if(j3?.display){ display=j3.display; respNome=j3.nome||respNome; respCodigo=j3.codigo||respCodigo; }
              }
            }catch(_rx){}
          }
          const inpResp = document.getElementById('responsavelNome'); if(inpResp && (display || respId)) { inpResp.value = display; try{ console.debug('[escala][loader] responsavel preenchido (index)', { respId, respNome, respCodigo, display }); }catch(_d){} try{ document.dispatchEvent(new CustomEvent('escala:responsavel:set',{ detail:{ id: respId, nome: respNome, codigo: respCodigo, display } })); }catch(_e){} try{ inpResp.dataset.responsavelNome = display; }catch(_ds){} }
          // Sincroniza no estado para outros módulos
          window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {};
          window.__ESCALA_STATE__.responsavel = (respId || respNome || respCodigo || respDisplay) ? { id: respId || null, nome: respNome || null, codigo: respCodigo || null, display } : null;
        } catch(_r){ }
        try {
          window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {};
          const st=window.__ESCALA_STATE__;
          st.escalaId = id;
          st.dadosGerais = { descricao: d.descricao||'', unidadeId: d.unidade_id||null, classificacao: d.classificacao||null };
          st.periodo = { ini: d.data_inicio||null, fim: d.data_fim||null };
          st.gruposTurnos = Array.isArray(d.grupos_turnos)? d.grupos_turnos.map(g=>({ id:g.id||g._id||'', nome:g.nome||'GRUPO', turnos:Array.isArray(g.turnos)? g.turnos.map(t=>({ ini:t.ini||t.inicio, fim:t.fim||t.termino })) : [] })) : [];
          st.equipes = Array.isArray(d.equipes)? d.equipes.map(e=>({
            id: e.id||e._id||'',
            nome: e.nome||'EQ',
            descricao: e.descricao||'',
            componentes: Array.isArray(e.componentes)? e.componentes.map(c=>({ id:c.id||c._id||'', nome:c.nome||'', funcionario_id:c.funcionario_id||c.id||'' })) : [],
            // importante para a aba Alocação: trazer alocações do servidor para fallback de renderização
            alocacoes: Array.isArray(e.alocacoes)? e.alocacoes.map(a=>({ dia: a.dia || a.data || a.date || '', turnoId: a.turnoId || a.turno_id || a.turno || a.id || '' })) : []
          })) : [];
          st.matrizAlocacao = d.alocacao||{};
          st.created = true;
        } catch(_sync){}
        // Aplicar bloqueio e habilitação de abas na edição (fallback)
        try { if (typeof window.bloquearCamposGerais==='function') window.bloquearCamposGerais(true); } catch(_b){}
        // Reforços de lock para pós-bootstrap/flatpickr
        setTimeout(()=>{ try { const s=window.__ESCALA_STATE__||{}; if (s.created && typeof window.bloquearCamposGerais==='function') window.bloquearCamposGerais(true); } catch(_e){} }, 300);
        setTimeout(()=>{ try { const s=window.__ESCALA_STATE__||{}; if (s.created && typeof window.aplicarBloqueioFisicoCamposGerais==='function') window.aplicarBloqueioFisicoCamposGerais(); } catch(_e){} }, 900);
        try { if (typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_a){}
        // Disparar evento para módulos re-sincronizarem campos
        try { document.dispatchEvent(new CustomEvent('escala:carregada', { detail:{ id } })); } catch(_evt){}
      }catch(_e){}
    }
    // Tenta inicializar core e/ou carregar manualmente em atraso pequeno
    const t1 = setTimeout(()=>{ if(!corePronto()) carregarManual(); }, 1200);
    document.addEventListener('escala:core-ready', ()=>{ try{ clearTimeout(t1); }catch(_e){} });
  })();

  // Auto-switch de Recursos quando houver alocação
  (function(){
    let jaAtivado=false;
    function keys(){ try{ return (window.__ESC_KEYS__ && window.__ESC_KEYS__()) || { active:'wdg.escala.activeTab', allow:'wdg.escala.allowAutoSwitchRec' }; }catch(_){ return { active:'wdg.escala.activeTab', allow:'wdg.escala.allowAutoSwitchRec' }; } }
    function temAloc(){ try{ if(window.__ESCALA_STATE__?.matrizAlocacao && Object.keys(window.__ESCALA_STATE__.matrizAlocacao).length>0) return true; const cont=document.getElementById('matrizAlocacao'); if(!cont) return false; if(cont.querySelector('.matriz-eq-item')) return true; if(cont.querySelector('table tbody td:not(:empty)')) return true; return false; }catch(_){ return false; } }
    function enableRecursos(){
      if(jaAtivado) return;
      try{
        // Sinaliza que modo consulta foi usado (ativa rec/valid em avaliarProgressaoAbas)
        try { sessionStorage.setItem('esc_modo_consulta_usado','1'); } catch(_s){}
        if(typeof window.avaliarProgressaoAbas==='function'){
          window.avaliarProgressaoAbas();
          // Reforço: se por algum motivo não habilitou, força habilitar
          try {
            const btn = document.querySelector('#tabsEscala [data-bs-target="#aba-recursos"]');
            const isDisabled = !!(btn && btn.classList.contains('disabled'));
            if(isDisabled && typeof window.setAbasHabilitadas==='function'){
              window.setAbasHabilitadas({ gerais:true, turnos:true, equipes:true, aloc:true, rec:true, valid:true });
            }
          } catch(_force){}
        } else if(typeof window.setAbasHabilitadas==='function'){
          window.setAbasHabilitadas({ gerais:true, turnos:true, equipes:true, aloc:true, rec:true, valid:true });
        }
        const k=keys();
        const ultima=sessionStorage.getItem(k.active)||'';
        const allow=sessionStorage.getItem(k.allow)==='1';
        if(allow || ultima==='#aba-recursos' || ultima==='aba-recursos'){
          const btn=document.querySelector('[data-bs-target="#aba-recursos"]');
          if(btn){ const t=bootstrap.Tab.getOrCreateInstance(btn); t.show(); try{ sessionStorage.removeItem(k.allow); }catch(_e){} }
        }
        jaAtivado=true;
      }catch(_e){}
    }
    function instalarObserver(){ const alvo=document.getElementById('matrizAlocacao'); if(!alvo || alvo.__obsRecursos) return; const obs=new MutationObserver(()=>{ if(temAloc()) enableRecursos(); }); obs.observe(alvo,{ childList:true, subtree:true, characterData:true }); alvo.__obsRecursos=obs; }
    ['escala:alocacao-salva','escala:alocacao:salva'].forEach(evt=> document.addEventListener(evt, ()=>{ try{ const k=keys(); sessionStorage.setItem(k.allow,'1'); }catch(_e){} setTimeout(()=>{ if(temAloc()) enableRecursos(); }, 120); }));
    document.addEventListener('escala:matriz:renderizada', ()=> {
      // Se já há alocação em primeira render, garantir que Recursos habilite
      setTimeout(()=>{ if(temAloc()) enableRecursos(); }, 120);
    });
    document.addEventListener('DOMContentLoaded', ()=>{ instalarObserver(); setTimeout(()=>{ if(temAloc()) enableRecursos(); }, 400); });
    setTimeout(instalarObserver, 600);
    setTimeout(()=>{ if(temAloc()) enableRecursos(); }, 1200);
  })();

  // Inicialização de containers das abas (cada aba faz seu render)
  function initAbas(){
    // Guard global para evitar múltiplas inicializações redundantes
    if(window.__ESC_ABAS_INIT_DONE__){ return; }
    window.__ESC_ABAS_INIT_DONE__ = true;
    try { if(window.ABA1 && typeof window.ABA1.init==='function') window.ABA1.init(); } catch(_e){}
    try { if(window.ABA2 && typeof window.ABA2.init==='function') window.ABA2.init(); } catch(_e){}
    try { if(window.ABA3 && typeof window.ABA3.init==='function') window.ABA3.init(); } catch(_e){}
    try { if(window.ABA4 && typeof window.ABA4.init==='function') window.ABA4.init(); } catch(_e){}
    try { if(window.ABA5 && typeof window.ABA5.init==='function') window.ABA5.init(); } catch(_e){}
    try { if(window.ABA6 && typeof window.ABA6.init==='function') window.ABA6.init(); } catch(_e){}
  }
  // Inicializa uma vez; se módulos ainda não estiverem prontos, eles próprios devem ser idempotentes
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=> { try{ initAbas(); }catch(_e){} });
  } else {
    try{ initAbas(); }catch(_e){}
  }
})();
