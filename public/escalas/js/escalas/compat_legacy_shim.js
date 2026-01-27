(function(){
  // Compatibilidade mínima para transição pós-escala_nova.js (legacy)
  // Objetivo: evitar ReferenceError em testes/scripts que esperavam símbolos globais do core legado.
  try { window.__ESCALA_CORE_LEGACY_REMOVED__ = true; } catch(_){ }

  // Estado global básico
  window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || { gruposTurnos: [], equipes: [], matrizAlocacao: {} };

  // Utils simples usados por antigos testes
  if(typeof window.__fmtTurno !== 'function'){
    window.__fmtTurno = function(t){ return { ini: t?.ini || t?.inicio || '', fim: t?.fim || t?.termino || '' }; };
  }

  // Renderização e debounce de turnos (no-op/mínimo)
  if(typeof window.renderGruposTurnos !== 'function'){
    window.renderGruposTurnos = function(reason){ try { console.debug('[compat][turnos] renderGruposTurnos noop', reason); } catch(_e){} };
  }
  if(typeof window.refreshTurnosDebounced !== 'function'){
    let t=null; window.refreshTurnosDebounced = function(reason){ try { if(t) clearTimeout(t); t=setTimeout(()=>{ try{ window.renderGruposTurnos(reason); }catch(_e){} }, 50); } catch(_e){} };
  }

  // Utils de data BR -> ISO (usado por avaliarProgressaoAbas)
  if(typeof window.dateBrToISO !== 'function'){
    window.dateBrToISO = function(v){ try{ if(!v) return ''; const m=String(v).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m? `${m[3]}-${m[2]}-${m[1]}` : ''; } catch(_){ return ''; } };
  }
  // Funções de abas (manipulam DOM real)
  if(typeof window.setAbasHabilitadas !== 'function'){
    window.setAbasHabilitadas = function(cfg){
      try {
        cfg = cfg || {};
        const map = { gerais:'aba-gerais', turnos:'aba-turnos', equipes:'aba-equipes', aloc:'aba-alocacao', rec:'aba-recursos', valid:'aba-validacao' };
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
      } catch(_e){ }
    };
  }
  // Bloqueio/Desbloqueio físico dos campos de "Dados Gerais" (usado em edição)
  if(typeof window.bloquearCamposGerais !== 'function'){
    window.bloquearCamposGerais = function(lock){
      try{
        const ids = ['classificacaoEscala','descricaoEscala','unidadeEscala','dataInicio','dataFim','responsavelNome','btnSelecionarResponsavel'];
        ids.forEach(idc=>{
          const el = document.getElementById(idc);
          if(!el) return;
          if(lock){
            el.setAttribute('disabled','disabled');
            try{ el.classList.add('escala-field-locked'); }catch(_){ }
            try{ el.style.pointerEvents='none'; }catch(_){ }
          } else {
            el.removeAttribute('disabled');
            try{ el.classList.remove('escala-field-locked'); }catch(_){ }
            try{ el.style.pointerEvents=''; }catch(_){ }
          }
        });
      }catch(_e){ /* noop */ }
    };
  }
  if(typeof window.aplicarBloqueioFisicoCamposGerais !== 'function'){
    window.aplicarBloqueioFisicoCamposGerais = function(){
      try{
        // Reaplica o lock para casos em que plugins (flatpickr/bootstrap) removem temporariamente atributos
        if(window.__ESCALA_STATE__ && window.__ESCALA_STATE__.created){
          window.bloquearCamposGerais(true);
        }
      }catch(_e){ }
    };
  }
  if(typeof window.avaliarProgressaoAbas !== 'function'){
    window.avaliarProgressaoAbas = function(){
      try {
        const descOk = !!(document.getElementById('descricaoEscala')?.value?.trim());
        const uniOk  = !!(document.getElementById('unidadeEscala')?.value);
        const diV    = document.getElementById('dataInicio')?.value?.trim() || '';
        const dfV    = document.getElementById('dataFim')?.value?.trim() || '';
        const perOk  = !!(window.dateBrToISO(diV) && window.dateBrToISO(dfV));
        const st     = window.__ESCALA_STATE__ || {};
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
      } catch(_e){ }
    };
  }

  // Validação simples de conflitos (placeholder): dispara evento para módulos ouvirem
  if(typeof window.executarValidacaoConflitos !== 'function'){
    window.executarValidacaoConflitos = function(){
      try {
        document.dispatchEvent(new CustomEvent('escala:validacao:executar'));
        alert && alert('Validação iniciada. (Compat)');
      } catch(_e){}
    };
  }
  // Carregar escala existente (mínimo): atualiza estado e dispara re-render básico
  if(typeof window.carregarEscalaExistente !== 'function'){
    window.carregarEscalaExistente = async function(id){
      try{
        if(!id){ try{ const u=new URL(location.href); id=u.searchParams.get('id')||''; }catch(_){ id=''; } }
        if(!id) return false;
        const bp = (document.body.getAttribute('data-base-path')||'/escalas');
        const r = await fetch(`${bp}/api/escalas/${encodeURIComponent(id)}`, { credentials:'same-origin' });
        if(!r.ok) return false; const js=await r.json(); const d=js?.data||js||{};
        const st=(window.__ESCALA_STATE__=window.__ESCALA_STATE__||{});
        try{
          // Derivar status/fechamento do payload sempre que possível
          const rawStatus = (d.status||d.situacao||d.situacao_atual||'')+'';
          st.status = rawStatus;
          const low = rawStatus.toLowerCase();
          st.fechada = ['fechada','fechado','validada','validado','publicada','concluida','concluída'].includes(low) || (d.fechada===true) || (d.fechamento?.status==='fechada');
        }catch(_st){ }
        st.escalaId=id; st.created=true; st.dadosGerais={ descricao:d.descricao||'', unidadeId:d.unidade_id||null, classificacao:d.classificacao||null };
        st.periodo={ ini:d.data_inicio||null, fim:d.data_fim||null };
        st.gruposTurnos=Array.isArray(d.grupos_turnos)? d.grupos_turnos.map(g=>({ id:g.id||g._id||'', nome:g.nome||'GRUPO', turnos:Array.isArray(g.turnos)? g.turnos.map(t=>({ ini:t.ini||t.inicio, fim:t.fim||t.termino })) : [] })) : [];
        st.equipes=Array.isArray(d.equipes)? d.equipes.map(e=>({ id:e.id||e._id||'', nome:e.nome||'EQ', descricao:e.descricao||'', componentes:Array.isArray(e.componentes)? e.componentes.map(c=>({ id:c.id||c._id||'', nome:c.nome||'', funcionario_id:c.funcionario_id||c.id||'' })) : [] })) : [];
        st.matrizAlocacao=d.alocacao||{};
        try{ window.renderGruposTurnos && window.renderGruposTurnos('load'); }catch(_e){}
        try{ document.dispatchEvent(new CustomEvent('escala:carregada',{ detail:{ id } })); }catch(_e){}
        try{ window.avaliarProgressaoAbas && window.avaliarProgressaoAbas(); }catch(_e){}
        return true;
      }catch(_e){ return false; }
    };
  }

  // Expor marcador para testes saberem que o legacy foi substituído
  try { window.__ESCALA_LEGACY_SHIM__ = true; } catch(_e){}

  // ========= Helpers globais de lock 423 (Escala Fechada) =========
  try {
    // Toast leve no canto superior direito (top-right): implementação UI própria, imune a sobrescritas locais
    (function ensureToastUI(){
      function showToastUI(msg, opts){
        try{
          opts = opts || {}; const type = opts.type || 'info'; const timeout = opts.timeout || 3500;
          let cont = document.getElementById('esc-toasts-container');
          if(!cont){
            cont = document.createElement('div');
            cont.id = 'esc-toasts-container';
            cont.style.position = 'fixed';
            cont.style.top = '1rem';
            cont.style.right = '1rem';
            cont.style.zIndex = '99999';
            cont.style.display = 'flex';
            cont.style.flexDirection = 'column';
            cont.style.gap = '0.5rem';
            cont.style.pointerEvents = 'none';
            document.body.appendChild(cont);
          }
          const el = document.createElement('div');
          el.className = 'esc-toast esc-toast-'+type;
          el.style.padding = '10px 12px';
          el.style.minWidth = '280px';
          el.style.maxWidth = '420px';
          el.style.color = '#0c0c0d';
          el.style.background = '#ffffff';
          el.style.border = '1px solid rgba(0,0,0,0.1)';
          el.style.borderLeftWidth = '4px';
          el.style.borderLeftColor = (type==='success'?'#28a745':type==='warning'?'#ffc107':type==='danger'?'#dc3545':'#0d6efd');
          el.style.borderRadius = '6px';
          el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
          el.style.fontSize = '14px';
          el.style.lineHeight = '1.3';
          el.style.opacity = '0';
          el.style.transform = 'translateY(-6px)';
          el.style.transition = 'opacity .15s ease, transform .15s ease';
          el.style.pointerEvents = 'auto';
          el.innerText = String(msg||'');
          cont.appendChild(el);
          requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateY(0)'; });
          setTimeout(()=>{
            try{ el.style.opacity='0'; el.style.transform='translateY(-6px)'; }catch(_){ }
            setTimeout(()=>{ try{ cont.removeChild(el); }catch(_){} }, 200);
          }, timeout);
        }catch(_e){ try{ alert(String(msg||'')); }catch(_){} }
      }
      try { window.__toastInfoUI = showToastUI; } catch(_){ }
      // Não sobrescrever toasts já existentes do projeto; mas nossa própria será usada pelos bloqueios
      if(typeof window.toastInfo !== 'function'){
        window.toastInfo = function(msg, opts){ return showToastUI(msg, opts); };
      }
    })();
    if(typeof window.__isEscalaFechada !== 'function'){
      window.__isEscalaFechada = function(){
        try{
          const st = window.__ESCALA_STATE__ || {};
          const raw = String(st.status||'').toLowerCase();
          return ['fechada','fechado','validada','validado','publicada','concluida','concluída'].includes(raw);
        }catch(_){ return false; }
      };
    }
    if(typeof window.__toastInfo !== 'function'){
      // Sempre usar nossa implementação UI, sem depender de window.toastInfo (que pode ser sobrescrita por módulos)
      window.__toastInfo = function(msg){ try{ return window.__toastInfoUI ? window.__toastInfoUI(msg) : alert(String(msg)); }catch(_){ /* noop */ } };
    }
    if(typeof window.__toastEscalaFechada !== 'function'){
      // Texto padronizado solicitado: com artigo e exclamação
      window.__toastEscalaFechada = function(){
        try{
          return (window.__toastInfoUI ? window.__toastInfoUI('Escala fechada. Proibida a edição!') : (window.__toastInfo && window.__toastInfo('Escala fechada. Proibida a edição!')));
        }catch(_){
          try{ alert('Escala fechada. Proibida a edição!'); }catch(_){ }
        }
      };
    }
    if(typeof window.handleEscalaLockedResponse !== 'function'){
      window.handleEscalaLockedResponse = async function(resp, ctx){
        try{
          if(!(resp && resp.status===423)) return false;
          let payload=null; try{ payload = await resp.clone().json(); }catch(_j){ payload=null; }
          // Exibir mensagem padrão solicitada
          try{
            if(window.__toastEscalaFechada) window.__toastEscalaFechada();
            else if(window.__toastInfoUI) window.__toastInfoUI('Escala fechada. Proibida a edição!');
            else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!');
          }catch(_tx){}
          // Log detalhado no console para diagnóstico sem poluir a UI
          try{
            const dbg = (window.__ESC_DEBUG_LOCKS===true) || (localStorage.getItem('esc_debug_locks')==='1');
            if(dbg){
              const msgSrv = (payload && (payload.message||payload.mensagem)) || '';
              if(console && (console.warn||console.log)){
                const fn = console.warn || console.log;
                fn('[ESCALA][423 Locked] ação bloqueada', { ctx: (ctx||{}), serverMessage: msgSrv, payload });
              }
            }
          }catch(_log){}
          try{ document.dispatchEvent(new CustomEvent('escala:locked-action-blocked', { detail:{ context: ctx||{}, payload } })); }catch(_evt){}
          return true;
        }catch(_e){ return false; }
      };
    }
  } catch(_lockHelpers){}
})();
