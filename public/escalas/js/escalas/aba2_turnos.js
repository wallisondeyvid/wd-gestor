(function(){
  function $(id){ return document.getElementById(id); }
  function fmtTurno(t){ return (t && (t.ini||'') && (t.fim||'')) ? `${t.ini} - ${t.fim}` : ''; }

  const ABA2 = {
    async syncFromServer(renderAfter){
      try{
        function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
        const escalaId = (function(){
          try{ const u=new URL(location.href); const q=u.searchParams.get('id'); if(q&&q.trim()) return q; }catch(_){ }
          try{ const s = window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId; if(s && String(s).trim()) return String(s); }catch(_s){}
          return '';
        })();
        if(!escalaId) return false;
        let g = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' });
        if(!g.ok){ g = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); }
        const ct = (g && g.headers && g.headers.get && g.headers.get('content-type')) || '';
        if(!(g && g.ok && /application\/json/i.test(ct))) return false;
        const js = await g.json();
        const d = js?.data || js?.escala || js || {};
        const gruposNovos = Array.isArray(d.grupos_turnos||d.gruposTurnos)
          ? (d.grupos_turnos||d.gruposTurnos).map(gp=> ({ id: gp.id||gp._id||'', nome: gp.nome||'GRUPO', turnos: Array.isArray(gp.turnos)? gp.turnos: [] }))
          : [];
        const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
        st.gruposTurnos = gruposNovos;
        try{
          const rawStatus = (d.status||d.situacao||d.situacao_atual||'')+'';
          st.status = rawStatus;
          const low = rawStatus.toLowerCase();
          st.fechada = ['fechada','fechado','validada','validado','publicada','concluida','concluída'].includes(low) || (d.fechada===true) || (d.fechamento?.status==='fechada');
        }catch(_){ }
        if(renderAfter){ try{ ABA2.renderGrupos('sync'); }catch(_r){} }
        return true;
      }catch(_){ return false; }
    },
    init(){
      const tbl = $('tabelaGruposTurnos');
      if(!tbl) return;
      // Render inicial
      try { ABA2.renderGrupos(); } catch(_e){}
      // Sincronizar do servidor ao iniciar, para refletir o banco de dados
      try { ABA2.syncFromServer(true); } catch(_s){}
      // Re-sincronizar quando a aba de turnos for exibida
      try{
        document.addEventListener('shown.bs.tab', function(ev){
          try{
            const el = ev?.target; const target = (el?.getAttribute && (el.getAttribute('data-bs-target')||el.getAttribute('href'))) || el?.dataset?.bsTarget || '';
            if(target==='#aba-turnos' || target==='aba-turnos'){
              ABA2.syncFromServer(true);
            }
          }catch(_evt){}
        });
      }catch(_bind){}
      // Delegação de clique para exclusão
      document.addEventListener('click', function(ev){
        try{
          const btn = ev.target && (ev.target.closest && ev.target.closest('[data-esc="del-grupo-turno"]'));
          if(!btn) return;
          ev.preventDefault();
          // Bloqueio imediato no handler (além dos botões desabilitados) para evitar qualquer requisição
          try{
            if((typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()) || (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.fechada===true)){
              if(typeof window.__toastEscalaFechada==='function') window.__toastEscalaFechada();
              else if(typeof window.__toastInfoUI==='function') window.__toastInfoUI('Escala fechada. Proibida a edição!');
              else if(typeof window.__toastInfo==='function') window.__toastInfo('Escala fechada. Proibida a edição!');
              return;
            }
          }catch(_lock){ }
          const gid = btn.getAttribute('data-gid')||'';
          if(gid) ABA2.excluirGrupo(gid, btn);
        }catch(_e){}
      }, true);
      // Delegação de clique para edição (abrir modal com turnos existentes)
      document.addEventListener('click', function(ev){
        try{
          const btn = ev.target && (ev.target.closest && ev.target.closest('[data-esc="edit-grupo-turno"]'));
          if(!btn) return;
          ev.preventDefault();
          const gid = btn.getAttribute('data-gid')||'';
          if(gid) ABA2.abrirModalTurnosNovoGrupo({ editGid: gid });
        }catch(_e){}
      }, true);
      // Botão inserir abre MODAL Bootstrap de seleção de turnos
      const novo = $('btnNovoGrupoTurnos');
      if(novo && !novo.__bound){
        novo.__bound = true;
        novo.addEventListener('click', function(ev){
          try{
            ev.preventDefault();
            // Bloquear criação/edição quando a escala estiver fechada (fechamento efetivo)
            try{
              const st = window.__ESCALA_STATE__ || {}; const stRaw = String((st.status||'')||'').toLowerCase();
              if(['fechada','fechado','validada','validado','publicada','concluida','concluída','concluida'].includes(stRaw)){
                try{ if(window.__toastEscalaFechada) window.__toastEscalaFechada(); else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!'); }catch(_t){}
                return;
              }
            }catch(_chk){}
            ABA2.abrirModalTurnosNovoGrupo();
          }catch(_e){}
        });
      }
      // Expor funçõees globais esperadas
      if(typeof window.renderGruposTurnos !== 'function'){
        window.renderGruposTurnos = function(reason){ try { ABA2.renderGrupos(reason); } catch(_e){} };
      }
      if(typeof window.excluirGrupoTurnoPorId !== 'function'){
        window.excluirGrupoTurnoPorId = function(gid, el){ try { return ABA2.excluirGrupo(gid, el); } catch(_e){ return false; } };
      }
      // Debounce global de atualizações de turnos (substitui o legado do orquestrador)
      try {
        if(typeof window.refreshTurnosDebounced !== 'function' || !window.refreshTurnosDebounced.__aba2){
          let t=null;
          window.refreshTurnosDebounced = function(reason){
            try { if(t) clearTimeout(t); } catch(_){}
            t = setTimeout(()=>{
              try { ABA2.renderGrupos(reason||'debounced'); } catch(_r){}
              try { if(typeof window.renderMatrizesPorGrupo==='function') window.renderMatrizesPorGrupo(); } catch(_m){}
              try { if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); } catch(_a){}
            }, 120);
          };
          try { window.refreshTurnosDebounced.__aba2 = true; } catch(_mk){}
        }
      } catch(_deb){}
    },
    abrirModalTurnosNovoGrupo(opts){
      try{
        const modalEl = document.getElementById('modalSelecionarTurnos');
        if(!modalEl || !window.bootstrap){ return; }
        // Estado temporário do modal: sempre reinicia ao abrir
        modalEl.__turnosTmp = { turnos: [] };
        modalEl.__editGid = null;
        // Se modo edição: pré-carregar turnos do grupo alvo
        try {
          const gid = opts && opts.editGid ? String(opts.editGid) : '';
          if(gid){
            const st = window.__ESCALA_STATE__ || {};
            const grupos = Array.isArray(st.gruposTurnos)? st.gruposTurnos: [];
            const alvo = grupos.find(g=> String(g.id)===gid);
            if(alvo && Array.isArray(alvo.turnos)){
              modalEl.__turnosTmp = { turnos: alvo.turnos.map(t=> ({ ini:String(t.ini||''), fim:String(t.fim||'') })) };
              modalEl.__editGid = gid;
            }
          }
        } catch(_pre){}
        // Referências
        const inpIni = document.getElementById('horaInicioTurno2');
        const inpFim = document.getElementById('horaFimTurno2');
        const btnAdd = document.getElementById('btnAddTurno2');
        const btnSalvar = modalEl.querySelector('#btnSalvar');
        const tbody = document.querySelector('#tabelaTurnosGrupo2 tbody');
        // Helper de estado que evita capturar referência antiga entre aberturas
        function getState(){
          try{
            const s = modalEl.__turnosTmp;
            if(!s || !Array.isArray(s.turnos)) modalEl.__turnosTmp = { turnos: [] };
            return modalEl.__turnosTmp;
          }catch(_){ return { turnos: [] }; }
        }
        function pad(n){ return String(n).padStart(2,'0'); }
        function parseHora(h){
          try{
            h=(h||'').trim();
            if(!h) return null;
            // Aceita input type=time (HH:MM) ou valores similares
            const m = /^([0-2]?\d):([0-5]\d)$/.exec(h);
            if(!m) return null;
            let HH = parseInt(m[1],10); let MM = parseInt(m[2],10);
            if(HH>23 || MM>59) return null;
            return pad(HH)+':'+pad(MM);
          }catch(_){ return null; }
        }
        function render(){
          try{
            if(!tbody) return;
            const st = getState();
            const list = st.turnos || [];
            if(!list.length){ tbody.innerHTML = '<tr class="text-muted"><td colspan="3" class="text-center small">Nenhum turno ainda</td></tr>'; return; }
            tbody.innerHTML = list.map((t,i)=>{
              const ini=t.ini||''; const fim=t.fim||''; const overnight = (fim<=ini)? '<span class="text-danger small"> (+1d)</span>' : '';
              return '<tr>'
                + `<td class="text-center"><strong>${ini}</strong></td>`
                + `<td class="text-center"><strong>${fim}</strong>${overnight}</td>`
                + `<td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-del-index="${i}"><i class="bi bi-trash"></i></button></td>`
                + '</tr>';
            }).join('');
            // Bind deletes
            tbody.querySelectorAll('[data-del-index]')?.forEach(btn=>{
              btn.addEventListener('click', function(){
                try{
                  const idx = parseInt(btn.getAttribute('data-del-index'), 10);
                  if(isNaN(idx)) return;
                  const s = getState();
                  s.turnos.splice(idx,1);
                  render();
                }catch(_){ }
              });
            });
          }catch(_){ }
        }
        function addTurno(){
          try{
            const ini = parseHora(inpIni && inpIni.value);
            const fim = parseHora(inpFim && inpFim.value);
            if(!ini || !fim){ alert('Preencha início e término no formato HH:MM.'); return; }
            const s = getState();
            if(s.turnos.some(t=> t.ini===ini && t.fim===fim)){ alert('Turno já adicionado.'); return; }
            s.turnos.push({ ini, fim });
            s.turnos.sort((a,b)=> a.ini.localeCompare(b.ini));
            if(inpIni) inpIni.value=''; if(inpFim) inpFim.value='';
            render();
          }catch(_){ }
        }
        if(btnAdd && !btnAdd.__bound){ btnAdd.__bound=true; btnAdd.addEventListener('click', addTurno); }
        if(btnSalvar && !btnSalvar.__bound){
          btnSalvar.__bound = true;
          btnSalvar.addEventListener('click', async function(){
            try{
              // Verifica bloqueio novamente no salvar
              try{
                const st = window.__ESCALA_STATE__ || {}; const stRaw = String((st.status||'')||'').toLowerCase();
                if(['fechada','fechado','validada','validado','publicada','concluida','concluída','concluida'].includes(stRaw)){
                  try{ if(window.__toastEscalaFechada) window.__toastEscalaFechada(); else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!'); }catch(_t2){}
                  return;
                }
              }catch(_chk2){}
              const list = (getState().turnos) || [];
              if(!list.length){ alert('Adicione ao menos um turno.'); return; }
              // Obter escalaId
              const escalaId = (function(){
                try{ const u=new URL(location.href); const q=u.searchParams.get('id'); if(q&&q.trim()) return q; }catch(_){ }
                try{ const s = window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId; if(s && String(s).trim()) return String(s); }catch(_s){}
                return '';
              })();
              if(!escalaId){ alert('Salve primeiro os Dados Gerais da escala para obter um ID.'); return; }
              // Helper base-path
              function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
              // Montar payload do grupo
              const payload = { grupo: { turnos: list.map(t=> ({ ini: t.ini, fim: t.fim })) } };
              // Desabilitar botão durante a operação
              try{ btnSalvar.disabled = true; btnSalvar.classList.add('disabled'); }catch(_d){}
              let ok=false; let resp=null; let grupoSrv=null;
              try{
                const editGid = modalEl.__editGid || null;
                if(editGid){
                  // PUT (edição)
                  resp = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}/grupos-turnos/${encodeURIComponent(editGid)}`, {
                    method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload)
                  });
                  if(!resp.ok){
                    if(resp.status===423){ try{ await (window.handleEscalaLockedResponse && window.handleEscalaLockedResponse(resp, { area:'turnos', oper:'edit-grupo' })); }catch(_h){} return; }
                    if(resp.status===401 || resp.status===403){ alert('Sessão expirada ou sem permissão para alterar esta escala.'); return; }
                    resp = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}/grupos-turnos/${encodeURIComponent(editGid)}`, {
                      method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload)
                    });
                  }
                } else {
                  // POST (criação)
                  resp = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}/grupos-turnos`, {
                    method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload)
                  });
                  if(!resp.ok){
                    if(resp.status===423){ try{ await (window.handleEscalaLockedResponse && window.handleEscalaLockedResponse(resp, { area:'turnos', oper:'create-grupo' })); }catch(_h2){} return; }
                    // Erros comuns
                    if(resp.status===401 || resp.status===403){ alert('Sessão expirada ou sem permissão para alterar esta escala.'); return; }
                    // Fallback para rota raiz
                    resp = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}/grupos-turnos`, {
                      method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload)
                    });
                  }
                }
                ok = !!(resp && resp.ok);
                if(ok){ try{ const js=await resp.json(); grupoSrv = js && (js.grupo || (js.data && js.data.grupo)); }catch(_j){} }
              }catch(_net){}

              if(!ok){
                alert('Falha ao salvar grupo de turnos no servidor.');
                return;
              }

              // Atualizar estado local com o retorno imediato, se existir
              try{
                const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
                st.gruposTurnos = Array.isArray(st.gruposTurnos) ? st.gruposTurnos : [];
                if(grupoSrv && grupoSrv.turnos){
                  const novo = { id: grupoSrv.id || String(Date.now()), nome: grupoSrv.nome || 'GRUPO', turnos: Array.isArray(grupoSrv.turnos)? grupoSrv.turnos: [] };
                  const idx = st.gruposTurnos.findIndex(g=> String(g.id)===String(novo.id));
                  if(idx>=0) st.gruposTurnos[idx] = novo; else st.gruposTurnos.push(novo);
                }
              }catch(_preSync){}

              // Sincronizar via GET para garantir estado fonte de verdade
              try{
                let g = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' });
                if(!g.ok){ g = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); }
                const ct = (g && g.headers && g.headers.get && g.headers.get('content-type')) || '';
                if(g && g.ok && /application\/json/i.test(ct)){
                  const js = await g.json();
                  const d = js?.data || js?.escala || js || {};
                  const gruposNovos = Array.isArray(d.grupos_turnos||d.gruposTurnos)
                    ? (d.grupos_turnos||d.gruposTurnos).map(gp=> ({ id: gp.id||gp._id||'', nome: gp.nome||'GRUPO', turnos: Array.isArray(gp.turnos)? gp.turnos: [] }))
                    : [];
                  const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
                  st.gruposTurnos = gruposNovos;
                }
              }catch(_sync){}

              // Re-render e fechar modal
              ABA2.renderGrupos('insert');
              try{ const inst = window.bootstrap.Modal.getOrCreateInstance(modalEl); inst.hide(); }catch(_){ }
              // Limpar estado logo após salvar
              try{ modalEl.__turnosTmp = { turnos: [] }; modalEl.__editGid = null; if(inpIni) inpIni.value=''; if(inpFim) inpFim.value=''; if(tbody) tbody.innerHTML=''; }catch(_c){}
            }catch(_){ }
            finally { try{ btnSalvar.disabled = false; btnSalvar.classList.remove('disabled'); }catch(_e){} }
          });
        }
        // Render inicial do modal e abrir
        render();
        try{ const inst = window.bootstrap.Modal.getOrCreateInstance(modalEl); inst.show(); }catch(_){ }
        // Limpa estado ao fechar o modal
        if(!modalEl.__cleanupBound){
          modalEl.__cleanupBound = true;
          modalEl.addEventListener('hidden.bs.modal', function(){
            try{ modalEl.__turnosTmp = { turnos: [] }; modalEl.__editGid = null; if(inpIni) inpIni.value=''; if(inpFim) inpFim.value=''; if(tbody) tbody.innerHTML=''; }catch(_r){}
          });
        }
      }catch(_e){}
    },
    renderGrupos(reason){
      try{
        const tbody = document.querySelector('#tabelaGruposTurnos tbody');
        if(!tbody) return;
        const st = window.__ESCALA_STATE__ || {}; const grupos = Array.isArray(st.gruposTurnos) ? st.gruposTurnos : [];
        if(!grupos.length){ tbody.innerHTML = '<tr class="text-muted"><td colspan="2" class="text-center">Nenhum grupo cadastrado.</td></tr>'; return; }
        const locked = (function(){ try{ return (typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()) || (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.fechada===true); }catch(_){ return false; } })();
        tbody.innerHTML = grupos.map(g=>{
          const lista = Array.isArray(g.turnos) ? g.turnos.map(fmtTurno).filter(Boolean).join(', ') : '';
          const dis = locked ? 'disabled aria-disabled="true" tabindex="-1"' : '';
          const pe = locked ? ' style="pointer-events:none;"' : '';
          return `<tr data-gid="${String(g.id)}">`
            + `<td class="small">${lista||'-'}</td>`
            + `<td class="grupos-col-acoes text-center">`
            + `<button class="btn btn-acao-turno btn-acao-edit me-1" title="Editar" data-esc="edit-grupo-turno" data-gid="${String(g.id)}" ${dis}${pe}><i class="bi bi-pencil"></i></button>`
            + `<button class="btn btn-acao-turno btn-acao-del" title="Excluir" data-esc="del-grupo-turno" data-gid="${String(g.id)}" ${dis}${pe}><i class="bi bi-trash"></i></button>`
            + `</td>`
            + `</tr>`;
        }).join('');
        try{ if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); }catch(_a){}
      }catch(_e){}
    },
    async excluirGrupo(gid, _btn){
      try{
        // Bloqueio proativo: evita chamada ao servidor e os logs 4xx no console
        try{
          if(typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()){
            if(typeof window.__toastEscalaFechada==='function') window.__toastEscalaFechada();
            else if(typeof window.__toastInfoUI==='function') window.__toastInfoUI('Escala fechada. Proibida a edição!');
            else if(typeof window.__toastInfo==='function') window.__toastInfo('Escala fechada. Proibida a edição!');
            return false;
          }
        }catch(_pre){ }
        const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
        const grupos = Array.isArray(st.gruposTurnos) ? st.gruposTurnos : (st.gruposTurnos = []);
        const alvo = grupos.find(g=> String(g.id)===String(gid)) || null;
        // Obter escalaId e base-path
        const escalaId = (function(){
          try{ const u=new URL(location.href); const q=u.searchParams.get('id'); if(q&&q.trim()) return q; }catch(_){ }
          try{ const s = window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId; if(s && String(s).trim()) return String(s); }catch(_s){}
          return '';
        })();
        function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
        let ok=false; let lastResp=null;
        if(escalaId){
          // 1) Tentar DELETE por id
          try{
            let r = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}/grupos-turnos/${encodeURIComponent(gid)}`, { method:'DELETE', credentials:'same-origin' });
            if(!r.ok){ r = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}/grupos-turnos/${encodeURIComponent(gid)}`, { method:'DELETE', credentials:'same-origin' }); }
            if(r && r.status===423){
              try{
                if(typeof window.handleEscalaLockedResponse==='function'){
                  await window.handleEscalaLockedResponse(r, { area:'turnos', oper:'delete-grupo' });
                } else if(typeof window.__toastEscalaFechada==='function'){
                  window.__toastEscalaFechada();
                } else if(typeof window.__toastInfo==='function'){
                  window.__toastInfo('Escala fechada. Proibida a edição!');
                }
              }catch(_hdel){}
              return false;
            }
            lastResp = r; ok = !!(r && r.ok);
          }catch(_d){}
          // 2) Fallback: remover por equivalência de turnos (se tivermos os turnos)
          if(!ok && alvo && Array.isArray(alvo.turnos) && alvo.turnos.length){
            try{
              let r2 = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}/grupos-turnos/remove-by-turnos`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ turnos: alvo.turnos }) });
              if(!r2.ok){ r2 = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}/grupos-turnos/remove-by-turnos`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ turnos: alvo.turnos }) }); }
              if(r2 && r2.status===423){
                try{
                  if(typeof window.handleEscalaLockedResponse==='function'){
                    await window.handleEscalaLockedResponse(r2, { area:'turnos', oper:'delete-by-turnos' });
                  } else if(typeof window.__toastEscalaFechada==='function'){
                    window.__toastEscalaFechada();
                  } else if(typeof window.__toastInfo==='function'){
                    window.__toastInfo('Escala fechada. Proibida a edição!');
                  }
                }catch(_hfb){}
                return false;
              }
              lastResp = r2; ok = !!(r2 && r2.ok);
            }catch(_rb){}
          }
        }
        // 3) Se não foi possível persistir, não remover localmente silenciosamente
        if(!ok && escalaId){
          try {
            let msg = 'Não foi possível excluir o grupo no servidor.';
            if(lastResp){
              const t = await lastResp.text();
              if(t){ msg += `\n[${lastResp.status}] ${t}`; }
            }
            alert(msg);
          } catch(_) { alert('Não foi possível excluir o grupo no servidor.'); }
          return false;
        }
        // 4) Sincronizar do servidor quando possível; senão, remover localmente como último recurso
        if(escalaId){
          try{
            let g = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' });
            if(!g.ok){ g = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); }
            if(g.ok){ const js=await g.json(); const d=js?.data||js?.escala||js||{}; const novos = Array.isArray(d.grupos_turnos||d.gruposTurnos)? (d.grupos_turnos||d.gruposTurnos) : []; st.gruposTurnos = novos; }
          }catch(_sync){ /* noop */ }
        } else {
          const before = grupos.length;
          st.gruposTurnos = grupos.filter(g=> String(g.id)!==String(gid));
          if(st.gruposTurnos.length === before){ return false; }
        }
        ABA2.renderGrupos('delete');
        return true;
      }catch(_e){ return false; }
    }
  };
  window.ABA2 = ABA2;
})();
