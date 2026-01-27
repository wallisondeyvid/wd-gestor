(function(){
  // Helpers locais
  function getId(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||null; }catch(_){ return null; } }
  function bp(){ try{ return document.body?.getAttribute('data-base-path') || window.__ESCALA_BASE_PATH__ || '/escalas'; }catch(_){ return '/escalas'; } }
  function ensureState(){ window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || { recursos:[], equipes:[] }; return window.__ESCALA_STATE__; }

  function fmtRecurso(r){
    const placa = r.placa || r.codigo || r.nome || '';
    const marca = r.marca || r.fabricante || '';
    const modelo = r.modelo || r.versao || '';
    const parts = [];
    if(placa) parts.push(String(placa));
    if(marca) parts.push(String(marca));
    if(modelo) parts.push(String(modelo));
    const s = parts.join(' - ');
    return s || (r.nome || r.descricao || 'Recurso');
  }
  function getEqNome(eqId){
    try {
      const st = ensureState();
      if(!eqId) return '-';
      const eq = Array.isArray(st.equipes)? st.equipes.find(e=> String(e.id||e._id||'')===String(eqId)) : null;
      return (eq && (eq.nome||eq.descricao)) || '-';
    } catch(_){ return '-'; }
  }
  function isLocked(){
    try{
      const st = ensureState();
      if(typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()) return true;
      if(st && st.fechada===true) return true;
      return false;
    }catch(_){ return false; }
  }
  function tryJson(r){ return r.text().then(t=>{ try{ return JSON.parse(t); }catch(_){ return {}; } }); }

  const ABA5 = {
    _loading: false,
    async ensureEquipes(idsNec){
      try{
        const st = ensureState();
        const id = getId() || st.escalaId; if(!id) return;
        const pend = new Set((idsNec||[]).map(x=> String(x||'')));
        if(Array.isArray(st.equipes) && st.equipes.length){
          st.equipes.forEach(e=> pend.delete(String(e.id||e._id||'')));
          if(pend.size===0) return; // já temos todos
        }
        const tries=[ `${bp()}/api/escalas/${encodeURIComponent(id)}`, `/api/escalas/${encodeURIComponent(id)}` ];
        for(const u of tries){
          try{
            const r = await fetch(u, { credentials:'same-origin' });
            if(!r.ok) continue; const js = await tryJson(r);
            const d = js?.data || js?.escala || js || {};
            if(Array.isArray(d.equipes) && d.equipes.length){
              st.equipes = d.equipes.map(e=> ({ id: e.id||e._id, nome: e.nome||e.codigo||e.descricao||'EQ' })).filter(e=> e.id);
              try{ window.__ESCALA_STATE__ = st; }catch(_){ }
              try{ if(window.state && typeof window.state==='object'){ window.state.equipes = st.equipes.map(x=>({ ...x })); } }catch(_s){}
              return;
            }
          }catch(_e){}
        }
      }catch(_){ }
    },
    async fetchRecursosIfNeeded(){
      if (this._loading) return;
      const st = ensureState();
      const id = getId() || st.escalaId;
      if(!id) return;
      if(Array.isArray(st.recursos) && st.recursos.length) return; // já temos

      this._loading = true;
      const done = ()=> { this._loading = false; };

      // Fallback 1: derivar de equipes[].recursos já carregados no estado
      try {
        if(Array.isArray(st.equipes) && st.equipes.some(eq=> Array.isArray(eq?.recursos) && eq.recursos.length)){
          const flat=[]; st.equipes.forEach(eq=>{ if(Array.isArray(eq.recursos)){ eq.recursos.forEach(r=> flat.push({ ...r, equipeId: r?.equipeId || eq.id || eq._id })); } });
          if(flat.length){
            try{ console.debug('[recursos][fallback1] derivados de st.equipes.recursos:', flat.length); }catch(_){ }
            st.recursos = flat; try{ if(window.state && typeof window.state==='object'){ window.state.recursos = st.recursos.map(x=>({ ...x })); } }catch(_s){}
            this.renderList(); done(); return;
          }
        }
      } catch(_d1){}

      // Tenta endpoint dedicado (se existir no ambiente)
      const urls = [ `${bp()}/api/escalas/${encodeURIComponent(id)}/recursos`, `/api/escalas/${encodeURIComponent(id)}/recursos` ];
      for(const u of urls){
        try{
          const r = await fetch(u, { credentials:'same-origin' });
          if(!r.ok){ try{ console.debug('[recursos][dedicado] tentativa falhou', u, 'status=', r.status); }catch(_){ } continue; }
          const js = await tryJson(r);
          const arr = (js && (js.data||js.recursos||js)) || [];
          if(Array.isArray(arr)){
            try{ console.debug('[recursos][dedicado] carregados via', u, 'qtde=', arr.length); }catch(_){ }
            st.recursos = arr.map(x=> ({ ...x }));
            try{ window.__ESCALA_STATE__ = st; }catch(_){ }
            try{ if(window.state && typeof window.state==='object'){ window.state.recursos = st.recursos.map(x=>({ ...x })); } }catch(_s){}
            // Garantir nomes de equipe
            try{
              const eqIds = Array.from(new Set(
                st.recursos
                  .map(r=> String((r && (r.equipeId || r.equipe_id || (r.equipe && (r.equipe.id)))) || ''))
                  .filter(Boolean)
              ));
              await this.ensureEquipes(eqIds);
            }catch(_eq){}
            this.renderList();
            done();
            return;
          }
        }catch(_e){ /* tenta próximo */ }
      }

      // Fallback 2: refetch da escala e derivar recursos do payload (d.recursos ou d.equipes[].recursos)
      try {
        const triesEsc = [ `${bp()}/api/escalas/${encodeURIComponent(id)}`, `/api/escalas/${encodeURIComponent(id)}` ];
        for(const uEsc of triesEsc){
          try {
            const rEsc = await fetch(uEsc, { credentials:'same-origin' });
            if(!rEsc.ok){ try{ console.debug('[recursos][escala] tentativa falhou', uEsc, 'status=', rEsc.status); }catch(_){ } continue; }
            const jsEsc = await tryJson(rEsc);
            const d = jsEsc?.data || jsEsc?.escala || jsEsc || {};
            let lista = [];
            // procurar coleções prováveis
            const candidates = [ 'recursos', 'recursosEscala', 'recursos_da_escala', 'veiculos', 'equipamentos', 'ativos' ];
            for(const k of candidates){
              const v = d && d[k];
              if(Array.isArray(v) && v.length){ lista = v; try{ console.debug('[recursos][escala] coleção encontrada em', k, 'qtde=', v.length); }catch(_){ } break; }
            }
            // derivar de equipes
            if(!lista.length && Array.isArray(d.equipes)){
              d.equipes.forEach(eq=>{
                if(Array.isArray(eq?.recursos)){
                  eq.recursos.forEach(r=> lista.push({ ...r, equipeId: r?.equipeId || eq?.id || eq?._id }));
                }
              });
              try{ console.debug('[recursos][escala] derivados de d.equipes.recursos:', lista.length); }catch(_){ }
            }
            // Preencher nomes das equipes se estiverem ausentes no estado
            try {
              if((!Array.isArray(st.equipes) || !st.equipes.length) && Array.isArray(d.equipes)){
                st.equipes = d.equipes.map(e=> ({ id: e.id||e._id, nome: e.nome||e.codigo||'EQ' })).filter(e=> e.id);
              }
            } catch(_eqFill){}
            if(lista.length){
              st.recursos = lista.map(x=> ({ ...x }));
              try{ console.debug('[recursos][escala] aplicados ao estado (qtde=', st.recursos.length, ')'); }catch(_){ }
              try{ if(window.state && typeof window.state==='object'){ window.state.recursos = st.recursos.map(x=>({ ...x })); } }catch(_s){}
              this.renderList();
              done();
              return;
            }
            // Fallback 3: consultar recursos por equipe (coleção) se a API suportar
            const eqFonte = Array.isArray(d.equipes) && d.equipes.length ? d.equipes : (Array.isArray(st.equipes) ? st.equipes : []);
            if(Array.isArray(eqFonte) && eqFonte.length){
              const acumulado=[];
              for(const eq of eqFonte){
                const eid = eq && (eq.id || eq._id); if(!eid) continue;
                const urlsEq = [ `${bp()}/api/escalas/${encodeURIComponent(id)}/equipes/${encodeURIComponent(eid)}/recursos`, `/api/escalas/${encodeURIComponent(id)}/equipes/${encodeURIComponent(eid)}/recursos` ];
                for(const u of urlsEq){
                  try{
                    const r = await fetch(u, { credentials:'same-origin' });
                    if(!r.ok){ try{ console.debug('[recursos][eq] tentativa falhou', u, 'status=', r.status); }catch(_){ } continue; }
                    const js = await tryJson(r);
                    const arr = (js && (js.data||js.recursos||js)) || [];
                    if(Array.isArray(arr) && arr.length){
                      arr.forEach(x=> acumulado.push({ ...x, equipeId: x?.equipeId || eid }));
                      try{ console.debug('[recursos][eq] encontrados para equipe', eid, 'qtde=', arr.length); }catch(_){ }
                      break;
                    }
                  }catch(_eqFetch){}
                }
              }
              if(acumulado.length){
                st.recursos = acumulado;
                try{ console.debug('[recursos][eq] aplicados ao estado (qtde=', acumulado.length, ')'); }catch(_){ }
                try{ if(window.state && typeof window.state==='object'){ window.state.recursos = st.recursos.map(x=>({ ...x })); } }catch(_s){}
                this.renderList();
                done();
                return;
              }
            }
          } catch(_ref){ /* tenta o próximo */ }
        }
      } catch(_d2){}
      // Render final (vazio) para não deixar a UI sem feedback
      try { this.renderList(); } finally { done(); }
    },
    renderList(){
      const tbl = document.getElementById('tabelaRecursos');
      if(!tbl) return;
      const tbody = tbl.querySelector('tbody') || tbl;
      const st = ensureState();
      const lista = Array.isArray(st.recursos)? st.recursos : [];
  const locked = isLocked();
      if(!lista.length){
        tbody.innerHTML = '<tr class="text-muted"><td colspan="3" class="text-center small">Nenhum recurso.</td></tr>';
        return;
      }
      const html = lista.map(r=>{
        const rid = r.id || r._id || r.referenciaGestorId || '';
        const eqId = r.equipeId || r.equipe_id || (r.equipe && (r.equipe.id||r.equipe._id)) || '';
        const equipe = getEqNome(eqId) || (r.equipe && (r.equipe.nome||r.equipe.descricao)) || '-';
        const desc = fmtRecurso(r);
        const ridEsc = String(rid).replace(/'/g, "\\'");
        const eqIdEsc = String(eqId||'').replace(/'/g, "\\'");
        const disAttr = locked ? ' disabled title="Edição bloqueada: escala fechada"' : '';
        return `<tr data-recurso-id="${rid}" data-eq-id="${eqId||''}">`
          + `<td>${equipe||'-'}</td>`
          + `<td>${desc||'-'}</td>`
          + `<td class="text-center">`
            + `<button type="button" class="btn btn-sm btn-outline-secondary" title="Editar" onclick="window.__escEditRecurso && window.__escEditRecurso(this, '${ridEsc}')"${disAttr} style="${locked?'pointer-events:none;':''}"><i class="bi bi-pencil"></i></button> `
            + `<button type="button" class="btn btn-sm btn-outline-danger" title="Excluir" onclick="window.__escDelRecurso && window.__escDelRecurso(this, '${ridEsc}', '${eqIdEsc}')"${disAttr} style="${locked?'pointer-events:none;':''}"><i class="bi bi-trash"></i></button>`
          + `</td>`
        + `</tr>`;
      }).join('');
      tbody.innerHTML = html;
    },
    updateAddButtonState(){
      try{
        const triggers = document.querySelectorAll('[data-open-modal-recurso]');
        const locked = isLocked();
        triggers.forEach(btn=>{
          if(!btn) return;
          // Bind guard once to intercept clicks when locked
          if(!btn.dataset.guardRecursoAdd){
            btn.addEventListener('click', (ev)=>{
              try{
                if(isLocked()){
                  ev.preventDefault(); ev.stopPropagation();
                  try{ if(window.__toastEscalaFechada) window.__toastEscalaFechada(); else if(window.__toastInfoUI) window.__toastInfoUI('Escala fechada. Proibida a edição!'); else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!'); }catch(_t){}
                }
              }catch(_g){}
            }, true);
            btn.dataset.guardRecursoAdd = '1';
          }
          if(locked){
            try{ btn.setAttribute('disabled', ''); }catch(_d){}
            try{ btn.style.pointerEvents = 'none'; }catch(_s){}
            try{ if(!btn.getAttribute('title')) btn.setAttribute('title', 'Inserção bloqueada: escala fechada'); }catch(_t){}
          } else {
            try{ btn.removeAttribute('disabled'); }catch(_d2){}
            try{ btn.style.pointerEvents = ''; }catch(_s2){}
            try{ if(btn.getAttribute('title')==='Inserção bloqueada: escala fechada') btn.removeAttribute('title'); }catch(_t2){}
          }
        });
      }catch(_){ }
    },
    init(){
      const pane = document.getElementById('aba-recursos');
      const tbl = document.getElementById('tabelaRecursos');
      if(!pane || !tbl) return;

      // Render inicial (pode estar vazio)
      this.renderList();
      // Ajustar estado do botão Adicionar conforme o bloqueio
      this.updateAddButtonState();
      // Busca do banco assim que possível
      this.fetchRecursosIfNeeded();
      // Buscar se necessário quando abrir a aba
      document.addEventListener('shown.bs.tab', (ev)=>{
        try{
          const target = ev?.target?.getAttribute('data-bs-target') || ev?.target?.dataset?.bsTarget || '';
          if(target === '#aba-recursos'){
            this.fetchRecursosIfNeeded();
            this.updateAddButtonState();
          }
        }catch(_e){}
      });
      // Se a aba já estiver ativa no load, buscar imediatamente
      try {
        const active = document.querySelector('[data-bs-target="#aba-recursos"].active, a.nav-link.active[href="#aba-recursos"]');
        if(active){ this.fetchRecursosIfNeeded(); this.updateAddButtonState(); }
      } catch(_af){}
      // Reagir quando a escala for carregada pelo orquestrador
      document.addEventListener('escala:carregada', ()=>{
        try { this.fetchRecursosIfNeeded(); this.updateAddButtonState(); } catch(_ev){}
      });
      // Ao fechar a escala, atualizar imediatamente o botão Adicionar e estados de ação
      document.addEventListener('escala:fechada', ()=>{
        try { this.updateAddButtonState(); this.renderList(); } catch(_ev2){}
      });
      // Atualiza ao salvar recurso pelo modal
      document.addEventListener('escala:recurso-salvo', (ev)=>{
        try {
          const rec = ev?.detail?.recurso; if(!rec) return;
          const st = ensureState();
          const key = rec.id || rec._id || rec.referenciaGestorId; if(!key) return;
          const idx = Array.isArray(st.recursos)? st.recursos.findIndex(r=> (r.id||r._id||r.referenciaGestorId)===key) : -1;
          if(idx>=0) st.recursos[idx] = { ...st.recursos[idx], ...rec };
          else { (st.recursos = st.recursos||[]).push({ ...rec }); }
          window.__ESCALA_STATE__ = st;
          this.renderList();
        } catch(_e){}
      });
    }
  };

  // Expor e integrar com outras partes que chamam renderRecursos()
  try { window.ABA5 = ABA5; } catch(_){ }
  try { window.renderRecursos = ABA5.renderList.bind(ABA5); } catch(_){ }

  // Handlers globais mínimos para Editar/Excluir, para independência do arquivo legado
  try {
    if(typeof window.__escEditRecurso !== 'function'){
      window.__escEditRecurso = function(btn, rid){
        try {
          if(isLocked()){
            try{ if(window.__toastEscalaFechada) window.__toastEscalaFechada(); else if(window.__toastInfoUI) window.__toastInfoUI('Escala fechada. Proibida a edição!'); else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!'); }catch(_t){}
            return;
          }
          const st = ensureState();
          const recurso = Array.isArray(st.recursos)? st.recursos.find(r=> (r.id||r._id||r.referenciaGestorId)===rid) : null;
          const trigger = document.querySelector('[data-open-modal-recurso]');
          if(trigger){
            trigger.click();
            setTimeout(()=>{ try { document.dispatchEvent(new CustomEvent('escala:editar-recurso-pendente', { detail:{ recurso } })); } catch(_){} }, 200);
            return;
          }
          alert('Editar recurso: '+(recurso && (recurso.nome||recurso.placa||rid) || rid));
        } catch(err){ console.warn('[recursos][edit] erro ao abrir modal', err); }
      };
    }
  } catch(_e){ }
  try {
    if(typeof window.__escDelRecurso !== 'function'){
      window.__escDelRecurso = async function(btn, rid, eqId){
        try {
          if(isLocked()){
            try{ if(window.__toastEscalaFechada) window.__toastEscalaFechada(); else if(window.__toastInfoUI) window.__toastInfoUI('Escala fechada. Proibida a edição!'); else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!'); }catch(_t){}
            return;
          }
          const st = ensureState();
          const escalaId = st.escalaId || getId();
          if(!escalaId || !rid){ alert('Recurso ou escala não identificados.'); return; }
          // tentar resolver equipe se não veio
          if(!eqId){
            const rec = Array.isArray(st.recursos)? st.recursos.find(x=> (x.id||x._id||x.referenciaGestorId)===rid) : null;
            eqId = rec && (rec.equipeId || rec.equipe_id || (rec.equipe && (rec.equipe.id||rec.equipe._id)));
          }
          if(!confirm('Excluir recurso? Esta ação removerá o recurso desta escala.')) return;
          const old = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm"></span>';
          async function tryDel(u){ try{ return await fetch(u, { method:'DELETE', credentials:'same-origin' }); } catch(_){ return { ok:false, status:-1 }; } }
          const tries = [
            `${bp()}/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(eqId||'')}/recursos/${encodeURIComponent(rid)}`,
            `/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(eqId||'')}/recursos/${encodeURIComponent(rid)}`,
            `${bp()}/api/escalas/${encodeURIComponent(escalaId)}/recursos/${encodeURIComponent(rid)}`,
            `/api/escalas/${encodeURIComponent(escalaId)}/recursos/${encodeURIComponent(rid)}`
          ];
          let ok=false, last=null; for(const u of tries){ const r=await tryDel(u); last=r; if(r && (r.ok || r.status===204 || r.status===200)){ ok=true; break; } if(r && r.status===423){ try{ if(window.handleEscalaLockedResponse){ const handled = await window.handleEscalaLockedResponse(r, { acao:'excluir-recurso' }); if(handled){ btn.disabled=false; btn.innerHTML=old; return; } } }catch(_h){} } }
          if(!ok){ let msg='Falha ao excluir o recurso.'; try{ if(last && last.status===423 && window.handleEscalaLockedResponse){ await window.handleEscalaLockedResponse(last, { acao:'excluir-recurso' }); } const t=await (last && last.text ? last.text() : ''); if(t) msg+='\n'+t; }catch(_){ } alert(msg); btn.disabled=false; btn.innerHTML=old; return; }
          // Atualiza UI e estado
          try {
            const tr = btn.closest('tr'); if(tr && tr.parentElement){ tr.parentElement.removeChild(tr); }
            if(Array.isArray(st.recursos)) st.recursos = st.recursos.filter(r=> (r.id||r._id||r.referenciaGestorId)!==rid);
            window.__ESCALA_STATE__ = st;
            ABA5.renderList();
          } catch(_upd){}
        } catch(err){ console.error('[recursos][del] erro', err); alert('Erro ao excluir o recurso.'); }
      };
    }
  } catch(_e){ }

  // Auto-init
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ try{ ABA5.init(); }catch(_e){} });
  } else {
    try{ ABA5.init(); }catch(_e){}
  }
})();
