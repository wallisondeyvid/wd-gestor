(function(){
  // Helpers globais mínimos que antes vinham do shim — agora fornecidos daqui
  try {
    if (typeof window.dateBrToISO !== 'function') {
      window.dateBrToISO = function(v){ try{ if(!v) return ''; const m=String(v).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m? `${m[3]}-${m[2]}-${m[1]}` : ''; } catch(_){ return ''; } };
    }
    if (typeof window.setAbasHabilitadas !== 'function') {
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
    if (typeof window.bloquearCamposGerais !== 'function') {
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
    if (typeof window.aplicarBloqueioFisicoCamposGerais !== 'function') {
      window.aplicarBloqueioFisicoCamposGerais = function(){
        try{
          const st = window.__ESCALA_STATE__ || {};
          if(st.created){ window.bloquearCamposGerais(true); }
        }catch(_e){}
      };
    }
    if (typeof window.avaliarProgressaoAbas !== 'function') {
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
  } catch(_shimless){}
  const ABA1 = {
    init(){
      const form = document.getElementById('formDadosGerais');
      if(!form) return;
      // Evita re-execução múltipla de binds
      if(form.__aba1Initialized){ return; }
      form.__aba1Initialized = true;
      // Mantemos o markup renderizado no servidor – apenas inicializamos calendários e estado.
      try { if(window.WDG && typeof WDG.initCalendars==='function'){ WDG.initCalendars(); } } catch(_e){}
      try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_e){}

      // Sincroniza o responsável já salvo (se vier do backend) e aplica bloqueio/abas quando em edição
      (function syncResponsavelEBloqueio(){
        try {
          const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
          // Preencher o campo de responsável se estado já possuir
          const inpResp = document.getElementById('responsavelNome');
          const nomeResp = st?.responsavel?.nome || null;
          const idResp = st?.responsavel?.id || null;
          const codResp = st?.responsavel?.codigo || null;
          const displayResp = st?.responsavel?.display || (codResp && nomeResp ? `${codResp} - ${nomeResp}` : (nomeResp || idResp || ''));
          if (inpResp && (displayResp || idResp)) {
            inpResp.value = displayResp || String(idResp || '');
            try{ inpResp.dataset.responsavelNome = inpResp.value; }catch(_ds){}
          }
          // Fallback: se estamos em edição e o campo ficou vazio após F5, tentar hidratar direto do backend
          try {
            const inp = document.getElementById('responsavelNome');
            const temId = (function(){ try{ const u=new URL(location.href); return !!u.searchParams.get('id'); }catch(_){ return false; } })();
            const precisaHidratar = (!inp || !inp.value) && (st.created || temId);
            if(precisaHidratar){
              const bp = (document.body && document.body.getAttribute('data-base-path')) || '/escalas';
              const id = (function(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||st.escalaId||null; }catch(_){ return st.escalaId||null; } })();
              if(id){
                (async function(){
                  try{
                    const r = await fetch(`${bp}/api/escalas/${encodeURIComponent(id)}`, { credentials:'same-origin' });
                    if(!r.ok) return;
                    const js = await r.json();
                    const d  = js?.data || js?.escala || js || {};
                    let respId   = d.responsavel_id || d.responsavelId || d.responsavelID || d.criado_por || null;
                    let respNome = d.responsavel_nome || d.responsavelNome || d.responsavel_nome_final || d.responsavel_nome_resolvido || '';
                    let codigo   = d.responsavel_codigo || '';
                    let dispBack = d.responsavel_display || '';
                    // Se temos ID mas não veio nome, tentar resolver via API de funcionários
                    if(respId && !respNome){
                      try{
                        const url1 = `${bp}/api/funcionarios/por-ids?ids=${encodeURIComponent(String(respId))}`;
                        const url2 = `/api/funcionarios/por-ids?ids=${encodeURIComponent(String(respId))}`;
                        let rr = await fetch(url1, { credentials:'same-origin' });
                        if(!rr.ok) rr = await fetch(url2, { credentials:'same-origin' });
                        if(rr.ok){
                          const j2 = await rr.json();
                          const arr = Array.isArray(j2?.data) ? j2.data : (Array.isArray(j2)? j2 : []);
                          const f0 = arr[0];
                          if(f0 && (f0.nome || f0.codigo)) { respNome = f0.nome || ''; codigo = f0.codigo || codigo || ''; }
                        }
                      }catch(_res){ /* noop */ }
                    }
                    const el = document.getElementById('responsavelNome');
                    let display = dispBack || ((codigo && respNome) ? `${codigo} - ${respNome}` : String(respNome || respId || ''));
                    if(el && (display || respId)){
                      el.value = display;
                      try{ el.dataset.responsavelNome = el.value; }catch(_ds){}
                      try{ console.debug('[aba1][fallback] responsavel preenchido', { respId, respNome, codigo, display }); }catch(_d){}
                      try{ document.dispatchEvent(new CustomEvent('escala:responsavel:set',{ detail:{ id: respId, nome: respNome, codigo, display } })); }catch(_e){}
                    }
                    // Se ainda parece um ObjectId no display, tente resolver codigo/nome de novo
                    try {
                      if(display && /^[0-9a-fA-F]{24}$/.test(display) && respId){
                        const base = (document.body && document.body.getAttribute('data-base-path')) || '/escalas';
                        // Tenta endpoint dedicado
                        let r3 = await fetch(`${base}/api/escalas/resolve-responsavel?id=${encodeURIComponent(String(respId))}`, { credentials:'same-origin' });
                        if(!r3.ok) r3 = await fetch(`/api/escalas/resolve-responsavel?id=${encodeURIComponent(String(respId))}`, { credentials:'same-origin' });
                        if(r3.ok){
                          const j3 = await r3.json();
                          if(j3 && (j3.display || j3.nome || j3.codigo)){
                            respNome = j3.nome || respNome || '';
                            codigo = j3.codigo || codigo || '';
                            display = j3.display || ((codigo && respNome)? `${codigo} - ${respNome}` : (respNome || display));
                            const el2 = document.getElementById('responsavelNome');
                            if(el2){ el2.value = display; try{ el2.dataset.responsavelNome = display; }catch(_ds3){} }
                          }
                        } else {
                          // fallback anterior via funcionarios/por-ids
                          const url1 = `${base}/api/funcionarios/por-ids?ids=${encodeURIComponent(String(respId))}`;
                          const url2 = `/api/funcionarios/por-ids?ids=${encodeURIComponent(String(respId))}`;
                          let r2 = await fetch(url1, { credentials:'same-origin' });
                          if(!r2.ok) r2 = await fetch(url2, { credentials:'same-origin' });
                          if(r2.ok){
                            const j2 = await r2.json();
                            const arr = Array.isArray(j2?.data) ? j2.data : (Array.isArray(j2)? j2 : []);
                            const f0 = arr[0];
                            if(f0 && (f0.nome || f0.codigo)){
                              respNome = f0.nome || '';
                              codigo = f0.codigo || '';
                              display = (codigo && respNome) ? `${codigo} - ${respNome}` : (respNome || display);
                              const el2 = document.getElementById('responsavelNome');
                              if(el2){ el2.value = display; try{ el2.dataset.responsavelNome = display; }catch(_ds3){} }
                            }
                          }
                        }
                      }
                    } catch(_2){ }
                    try{ st.responsavel = (respId || respNome || codigo) ? { id: respId || null, nome: respNome || null, codigo: codigo || null, display } : st.responsavel; }catch(_s){}
                    try{ st.dadosGerais = st.dadosGerais || {}; if(respId) st.dadosGerais.responsavelId = respId; }catch(_dg){}
                    try{ if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); }catch(_a){}
                    // Fallback usuário: se ainda ficou parecendo um ObjectId (24 hex) e não temos nome/código, tentar resolver nome via usuário
                    try {
                      if(respId && (!respNome && !codigo) && /^[0-9a-fA-F]{24}$/.test(String(respId)) && (window.__ESCALAS_ENABLE_USER_STATUS===true || window.__ESCALAS_HAS_USER_STATUS==='1')){
                        const base = (document.body && document.body.getAttribute('data-base-path')) || '/escalas';
                        const u1 = `${base}/api/usuarios/${encodeURIComponent(String(respId))}/status`;
                        const u2 = `/api/usuarios/${encodeURIComponent(String(respId))}/status`;
                        let ru = await fetch(u1, { credentials:'same-origin' });
                        if(!ru.ok) ru = await fetch(u2, { credentials:'same-origin' });
                        if(ru.ok){
                          const ju = await ru.json();
                          const cand = ju?.data || ju || {};
                          const nm = cand.nome || cand.name || cand.displayName || cand.fullname || cand.fullName || cand.usuario || cand.user || null;
                          const mail = cand.email || cand.login || cand.username || null;
                          const nomeUser = nm || mail || null;
                          if(nomeUser){
                            const el2 = document.getElementById('responsavelNome');
                            const disp2 = String(nomeUser);
                            if(el2){ el2.value = disp2; try{ el2.dataset.responsavelNome = disp2; }catch(_ds2){} }
                            try{ st.responsavel = { id: respId, nome: String(nomeUser), codigo: null, display: disp2 }; }catch(_s2){}
                            try{ document.dispatchEvent(new CustomEvent('escala:responsavel:set',{ detail:{ id: respId, nome: String(nomeUser), codigo: null, display: disp2 } })); }catch(_e2){}
                          }
                        }
                      }
                    } catch(_userfb){}
                  }catch(_f){ /* noop */ }
                })();
              }
            }
          } catch(_h){}
          // Se a escala já foi criada (edição), garantir bloqueio dos campos de Dados Gerais
          if (st && st.created) {
            try { if (typeof window.bloquearCamposGerais === 'function') window.bloquearCamposGerais(true); } catch(_b){}
            // Reforços discretos: reavaliar o estado na hora do timeout (não capturar st)
            setTimeout(()=>{ try { const s=window.__ESCALA_STATE__||{}; if (s.created && typeof window.bloquearCamposGerais==='function') window.bloquearCamposGerais(true); } catch(_e){} }, 200);
            setTimeout(()=>{ try { const s=window.__ESCALA_STATE__||{}; if (s.created && typeof window.bloquearCamposGerais==='function') window.bloquearCamposGerais(true); } catch(_e){} }, 800);
            // Último reforço: se algum campo ainda não estiver disabled/readonly, reaplicar
            setTimeout(()=>{
              try {
                const desc = document.getElementById('descricaoEscala');
                const uni  = document.getElementById('unidadeEscala');
                const di   = document.getElementById('dataInicio');
                const df   = document.getElementById('dataFim');
                const precisa = [desc,uni,di,df].some(el=> el && !el.hasAttribute('disabled'));
                if(precisa && typeof window.bloquearCamposGerais==='function') window.bloquearCamposGerais(true);
                // hard lock opcional
                if(precisa && typeof window.aplicarBloqueioFisicoCamposGerais==='function') window.aplicarBloqueioFisicoCamposGerais();
              } catch(_chk){}
            }, 1500);
            try { if (typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_a){}
          }
        } catch(_sync){ /* noop */ }
      })();

      // 1) Classificação da escala: restaurar preenchimento imediato e label de título
      (function(){
        function detectar(){
          try {
            const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
            const dados = (st.dadosGerais = st.dadosGerais || {});
            let tipo = dados.classificacao || (document.body && document.body.dataset && document.body.dataset.tipoEscala) || window.__ESCALA_TIPO_FALLBACK__ || null;
            if(!tipo && typeof window.detectTipoEarly==='function') tipo = window.detectTipoEarly();
            return (tipo || '').toString();
          } catch(_){ return ''; }
        }
        const tipo = detectar();
        try { const inp=document.getElementById('classificacaoEscala'); if(inp) inp.value = tipo || ''; } catch(_){ }
        try { const lbl=document.getElementById('tipoEscalaLabel'); if(lbl) lbl.textContent = tipo? '('+tipo+')' : ''; } catch(_){ }
        try { window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {}; window.__ESCALA_STATE__.dadosGerais = window.__ESCALA_STATE__.dadosGerais || {}; if(tipo) window.__ESCALA_STATE__.dadosGerais.classificacao = tipo; } catch(_){ }
      })();

      // 2) Unidades: popular select com API (fallback se core ainda não cuidou)
      (function(){
        const sel = document.getElementById('unidadeEscala'); if(!sel) return;
        async function popular(){
          // Use implementação global real quando disponível
          try {
            if(typeof window.fetchAndPopulateUnidades==='function' && !window.fetchAndPopulateUnidades.__aba1Local){
              // função global já cobre população; apenas invocar e depois sincronizar estado
              await window.fetchAndPopulateUnidades();
              syncStateFromSelect();
              return;
            }
          } catch(_g){}
          // Fallback local: carrega via /api/unidades-relacionadas
          try {
            sel.innerHTML = '<option value="">Selecione...</option>';
            const urls = [ (document.body.getAttribute('data-base-path')||'/escalas') + '/api/unidades-relacionadas', '/api/unidades-relacionadas' ];
            let payload=null; for(const u of urls){ try { const r=await fetch(u,{credentials:'same-origin'}); if(r.ok){ payload=await r.json(); if(payload) break; } } catch(_e){} }
            const list = Array.isArray(payload?.data) ? payload.data : [];
            const opts = ['<option value="">Selecione...</option>'].concat(list.map(u=>{
              const lab = (u.codigo? (u.codigo+' - ') : '') + (u.nome||'Unidade') + (u.is_principal? ' (Matriz)':'');
              return '<option value="'+ String(u.id)+'">'+ lab +'</option>';
            }));
            sel.innerHTML = opts.join('');
            try { if(list.length===1 && !sel.value){ sel.value=String(list[0].id); sel.dispatchEvent(new Event('change')); } } catch(_auto){}
            // Seleção com base no estado se já existir
            try {
              const st = window.__ESCALA_STATE__||{}; const dg = st.dadosGerais||{}; const val = dg.unidadeId ? String(dg.unidadeId) : '';
              if(val && Array.from(sel.options).some(o=> String(o.value)===val)) sel.value = val;
            } catch(_set){}
            syncStateFromSelect();
          } catch(e){ console.warn('[aba1] falha ao popular unidades', e); }
        }
        function syncStateFromSelect(){
          try {
            const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
            st.dadosGerais = st.dadosGerais || {};
            const v = sel.value || '';
            if(v) st.dadosGerais.unidadeId = v; else delete st.dadosGerais.unidadeId;
            if(typeof window.avaliarProgressaoAbas==='function'){ window.avaliarProgressaoAbas(); }
          } catch(_s){}
        }
        sel.addEventListener('change', syncStateFromSelect);
        // Chamar o populador local imediatamente
        popular();
        // E também acionar a função global (quando disponível) para cobrir outros fluxos
        try {
          if(typeof window.fetchAndPopulateUnidades==='function'){
            setTimeout(()=>{ try { window.fetchAndPopulateUnidades(); } catch(_){} }, 0);
          }
        } catch(_e){}
        // Se após 1s continuar vazio, tentar novamente
        setTimeout(()=>{ try { if(sel.options.length<=1) popular(); } catch(_){} }, 1000);
      })();

      // 3) Responsável: abrir modal de pesquisa e atualizar campo/estado
      (function(){
        const btn = document.getElementById('btnSelecionarResponsavel');
        if(!btn) return;
        if(btn.__aba1Bound) return; btn.__aba1Bound = true;
        btn.addEventListener('click', function(){
          try {
            if(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function'){
              window.WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect: function(f){
                try {
                  const display = f && (f.codigo && f.nome) ? (f.codigo+' - '+f.nome) : (f && (f.nome||f.codigo||f.id)) || '';
                  const inp = document.getElementById('responsavelNome'); if(inp){ inp.value = display; try{ inp.dataset.responsavelNome = display; }catch(_ds){} }
                  if(f && f.id){
                    window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {}; window.__ESCALA_STATE__.responsavel = { id:f.id, nome:f.nome||null, codigo:f.codigo||null, display };
                    const btnSave = document.getElementById('btnSalvarSecDados'); if(btnSave) btnSave.disabled = false;
                    try{ document.dispatchEvent(new CustomEvent('escala:responsavel:set',{ detail:{ id:f.id, nome:f.nome||null, codigo:f.codigo||null, display } })); }catch(_e){}
                  }
                } catch(_upd){}
              }});
            } else {
              // Fallback: abrir modal diretamente
              const mp = document.getElementById('modalPesquisarEfetivo');
              if(mp && window.bootstrap){ window.bootstrap.Modal.getOrCreateInstance(mp).show(); }
            }
          } catch(_e){}
        });
      })();

      // Regras de período: máx 31 dias
      (function(){
        function parseBr(v){ const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v||'').trim()); if(!m) return null; const d=new Date(+m[3], +m[2]-1, +m[1]); return isNaN(d)? null: d; }
        function addDays(dt, n){ const d=new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); d.setDate(d.getDate()+n); return d; }
        function fmtBr(dt){ const dd=String(dt.getDate()).padStart(2,'0'); const mm=String(dt.getMonth()+1).padStart(2,'0'); const yy=dt.getFullYear(); return `${dd}/${mm}/${yy}`; }
        function aplicarRegra(){
          try{
            const iniEl=document.getElementById('dataInicio'); const fimEl=document.getElementById('dataFim');
            if(!iniEl||!fimEl) return;
            const vIni=iniEl.value && iniEl.value.trim(); if(!vIni) return;
            const dIni=parseBr(vIni); if(!dIni) return;
            const maxFim=addDays(dIni,30);
            if(fimEl._flatpickr){ try{ fimEl._flatpickr.set('maxDate', fmtBr(maxFim)); }catch(_e){} }
            if(fimEl.value){ const dFim=parseBr(fimEl.value); if(dFim && dFim>maxFim){ fimEl.value=fmtBr(maxFim); if(fimEl._flatpickr){ try{ fimEl._flatpickr.setDate(fimEl.value,true);}catch(_e){} } } }
          }catch(_e){}
        }
        function onChange(ev){ const id=ev.target && ev.target.id; if(id!=='dataInicio' && id!=='dataFim') return; aplicarRegra(); }
        document.addEventListener('change', onChange, true);
        setTimeout(aplicarRegra, 300);
      })();

      // Guarda de hidratação: se algum script limpar o valor, reponha a partir do estado
      (function(){
        try{
          const target = document.getElementById('responsavelNome');
          if(!target) return;
          function hydrate(){
            try{
              const st = window.__ESCALA_STATE__||{};
              const disp = st?.responsavel?.display || (st?.responsavel?.codigo && st?.responsavel?.nome ? (st.responsavel.codigo+' - '+st.responsavel.nome) : (st?.responsavel?.nome || '')) || target.dataset.responsavelNome || '';
              if(!target.value && disp){ target.value = disp; }
            }catch(_h){}
          }
          const obs = new MutationObserver(()=> hydrate());
          obs.observe(target, { attributes:true, attributeFilter:['value'] });
          // retries curtos pós-plugins
          setTimeout(hydrate, 50);
          setTimeout(hydrate, 300);
          setTimeout(hydrate, 1200);
          document.addEventListener('escala:responsavel:set', hydrate);
        }catch(_e){}
      })();

      // Fallback de salvar Dados Gerais quando o core não está pronto
      (function(){
        function hasCore(){ try{ return (typeof window.initEscalaPage==='function') || (window.__ESCALA_BOOT_OK===true); }catch(_){ return false; } }
        function brToISO(v){ if(!v) return ''; const m=String(v).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m? `${m[3]}-${m[2]}-${m[1]}` : ''; }
        async function postJson(url, body){ try{ return await fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); }catch(e){ return { ok:false, status:-1, _err:e }; } }
        function lockGerais(){ try{ ['classificacaoEscala','descricaoEscala','unidadeEscala','dataInicio','dataFim','responsavelNome','btnSelecionarResponsavel'].forEach(idc=>{ const el=document.getElementById(idc); if(!el) return; el.setAttribute('disabled','disabled'); el.classList.add('escala-field-locked'); el.style.pointerEvents='none'; }); }catch(_e){} }
        function enableTabsBasic(){ try{ if(typeof window.avaliarProgressaoAbas==='function'){ window.avaliarProgressaoAbas(); return; } }catch(_e){} try{ ['#aba-turnos','#aba-equipes'].forEach(sel=>{ const btn=document.querySelector(`[data-bs-target="${sel}"]`); const pane=document.querySelector(sel); if(btn){ btn.classList.remove('disabled'); btn.removeAttribute('aria-disabled'); btn.removeAttribute('tabindex'); btn.style.pointerEvents=''; } if(pane){ pane.classList.remove('tab-disabled'); } }); }catch(_e){} }
        async function microSalvar(){
          const btn = document.getElementById('btnSalvarSecDados');
          try{ if(btn){
            if(btn.dataset.fallbackSaving === '1') return; // já em progresso por outro handler
            btn.dataset.fallbackSaving = '1';
            btn.disabled=true; btn.dataset._txt=btn.dataset._txt||btn.innerText; btn.innerText='Salvando...';
          } }catch(_e){}
          try{
            const desc = document.getElementById('descricaoEscala')?.value?.trim();
            const uni  = document.getElementById('unidadeEscala')?.value;
            const diBr = document.getElementById('dataInicio')?.value;
            const dfBr = document.getElementById('dataFim')?.value;
            const cls  = document.getElementById('classificacaoEscala')?.value || (document.body.dataset.tipoEscala||'').trim();
            if(!desc){ alert('Descrição obrigatória.'); return; }
            if(!uni){ alert('Selecione a unidade.'); return; }
            if(!diBr || !dfBr){ alert('Defina período completo.'); return; }
            const payload = {
              descricao: desc,
              classificacao: cls || null,
              unidadeId: uni,
              periodo: { ini: brToISO(diBr), fim: brToISO(dfBr) },
              gruposTurnos: [], equipes: [], alocacao: {}, validar: false
            };
            try { if(window.__ESCALA_STATE__?.responsavel?.id) payload.responsavelId = window.__ESCALA_STATE__.responsavel.id; } catch(_e){}
            let res = await postJson('/escalas/api/escalas', payload);
            if(!res.ok) res = await postJson('/api/escalas', payload);
            if(res.status===401){ alert('Sessão expirada. Faça login novamente.'); return; }
            if(!res.ok){ const t=await res.text().catch(()=> ''); throw new Error(t||`Falha ao criar escala (HTTP ${res.status})`); }
            const js = await res.json();
            const id = js?.id || js?._id || js?.data?.id || js?.data?._id || null;
            if(!id) throw new Error('Resposta sem ID');
            try{ const u=new URL(location.href); u.searchParams.set('id', id); history.replaceState(null,'',u.toString()); }catch(_e){}
            lockGerais(); enableTabsBasic();
            try{ window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {}; window.__ESCALA_STATE__.created = true; window.__ESCALA_STATE__.escalaId = id; }catch(_e){}
            try{ document.dispatchEvent(new CustomEvent('escala:id-obtido',{ detail:{ id } })); }catch(_e){}
            alert('Dados gerais salvos. Continue configurando a escala.');
          }catch(err){ alert('Não foi possível criar a escala. '+(err?.message||'')); }
          finally{ try{ if(btn){ btn.disabled=false; if(btn.dataset._txt) btn.innerText=btn.dataset._txt; delete btn.dataset.fallbackSaving; } }catch(_e){} }
        }
        const btn = document.getElementById('btnSalvarSecDados');
        if(btn && !btn.__aba1Bound){ btn.__aba1Bound=true; btn.addEventListener('click', function(ev){ if(hasCore()) return; ev.preventDefault(); microSalvar(); }); }
      })();
    }
  };
  window.ABA1 = ABA1;
})();
