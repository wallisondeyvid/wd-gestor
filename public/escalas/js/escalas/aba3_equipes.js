(function(){
  const ABA3 = {
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
        let equipesNovas = Array.isArray(d.equipes)
          ? d.equipes.map(e=> ({
              id: e.id||e._id||e.nome||'',
              nome: e.nome||'',
              descricao: e.descricao||'',
              componentes: Array.isArray(e.componentes)
                ? e.componentes.map(c=>({
                    id: c?.id || c?.funcionario_id || c?._id || '',
                    funcionario_id: c?.funcionario_id || c?.id || c?._id || '',
                    matricula: c?.matricula || c?.codigo || '',
                    nome: c?.nome || c?.nomeFuncionario || c?.funcionarioNome || c?.descricao || ''
                  }))
                : []
            }))
          : [];
        // Fallback: se alguma equipe ficou sem componentes com nome/código, tentar derivar dos recursos
        const precisaDerivar = equipesNovas.some(eq=> !Array.isArray(eq.componentes) || eq.componentes.length===0 || eq.componentes.every(c=> !(c.nome||c.matricula)));
        async function derivarDeRecursos(){
          try{
            const escalaId = (function(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||''; }catch(_){ return ''; } })();
            const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
            let recursos = Array.isArray(st.recursos)? st.recursos : [];
            if(!recursos.length && escalaId){
              const u1 = `${bp()}/api/escalas/${encodeURIComponent(escalaId)}/recursos`;
              let r = null; try{ r = await fetch(u1, { credentials:'same-origin' }); }catch(_){ }
              if(!(r && r.ok)){ try{ r = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}/recursos`, { credentials:'same-origin' }); }catch(_e){} }
              if(r && r.ok){ try{ const js=await r.json(); recursos = (js?.data||js?.recursos||js||[]); }catch(_p){} }
            }
            if(!Array.isArray(recursos) || !recursos.length) return;
            const mapByEq = new Map();
            recursos.forEach(r=>{ const eid = r?.equipeId || r?.equipe_id || (r?.equipe && (r.equipe.id||r.equipe._id)) || ''; if(!eid) return; if(!mapByEq.has(String(eid))) mapByEq.set(String(eid), []); mapByEq.get(String(eid)).push(r); });
            equipesNovas = equipesNovas.map(eq=>{
              const eid = String(eq.id||'');
              const lista = mapByEq.get(eid) || [];
              if(!lista.length) return eq;
              const acc = new Map();
              for(const r of lista){
                const membros = Array.isArray(r?.membros)? r.membros: [];
                if(membros.length){
                  for(const m of membros){
                    if(!m) continue; const fid = String(m.funcionario_id || m.id || '').trim(); if(!fid) continue;
                    if(!acc.has(fid)) acc.set(fid, { id: fid, funcionario_id: fid, nome: m.nome || '', matricula: m.matricula || m.codigo || '' });
                  }
                } else if(Array.isArray(r?.atribuicoes) && r.atribuicoes.length){
                  for(const a of r.atribuicoes){ if(!a) continue; const fid = String(a.membroFuncionarioId || a.funcionarioId || a.funcionario_id || a.id || '').trim(); if(!fid) continue; if(!acc.has(fid)) acc.set(fid, { id: fid, funcionario_id: fid, nome: a.nome || a.funcionarioNome || '', matricula: a.matricula || a.codigo || '' }); }
                }
              }
              const existentes = Array.isArray(eq.componentes)? eq.componentes: [];
              // mantém os existentes com nome/código e complementa com derivados
              const base = new Map((existentes||[]).filter(c=> (c.nome||c.matricula)).map(c=> [String(c.funcionario_id||c.id||''), c]));
              for(const [fid, comp] of acc.entries()){ if(!base.has(fid)) base.set(fid, comp); }
              return { ...eq, componentes: Array.from(base.values()) };
            });
          }catch(_){ /* noop derivation */ }
        }
        if(precisaDerivar){ await derivarDeRecursos(); }
        const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
        // Persistir status/fechada para permitir bloqueio proativo e desabilitar botões
        try{
          const rawStatus = (d.status||d.situacao||d.situacao_atual||'')+'';
          st.status = rawStatus;
          const low = rawStatus.toLowerCase();
          st.fechada = ['fechada','fechado','validada','validado','publicada','concluida','concluída'].includes(low) || (d.fechada===true) || (d.fechamento?.status==='fechada');
        }catch(_){ }
        st.equipes = equipesNovas;
        if(renderAfter){ try{ ABA3.render('sync'); }catch(_r){} }
        return true;
      }catch(_){ return false; }
    },
    init(){
      try{ console.debug && console.debug('[ABA3] init Equipes'); }catch(_l){}
      // Trabalhar diretamente com form/tabela (sem depender de wrapper específico)
      const form = document.getElementById('formEquipes');
      const tbl = document.getElementById('tabelaEquipes');
      if(!form || !tbl) return;

      // Sincronizar do servidor ao iniciar, para garantir que a lista reflete o banco
      try { ABA3.syncFromServer(true); } catch(_e){}

      // Bloquear o botão Inserir até primeira sincronização/lock conhecido para evitar POST precoce 423
      try{
        const addBtnInit = document.getElementById('btnAddEquipe');
        if(addBtnInit){ addBtnInit.disabled = true; addBtnInit.title = 'Carregando status da escala...'; }
        const unblockWhenReady = ()=>{
          try{
            const st = window.__ESCALA_STATE__||{}; const fechado = (typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()) || (st.fechada===true);
            if(addBtnInit){ addBtnInit.disabled = !!fechado; addBtnInit.title = fechado ? 'Escala fechada: destrave um dia/turno na aba Alocação para permitir alterações.' : ''; }
          }catch(_){ }
        };
        document.addEventListener('escala:carregada', unblockWhenReady, { once:true });
        setTimeout(unblockWhenReady, 1500);
      }catch(_blk){}

      // Também sincronizar sempre que a aba for mostrada (evita estado defasado)
      try{
        document.addEventListener('shown.bs.tab', function(ev){
          try{
            const el = ev?.target; const target = (el?.getAttribute && (el.getAttribute('data-bs-target')||el.getAttribute('href'))) || el?.dataset?.bsTarget || '';
            if(target==='#aba-equipes' || target==='aba-equipes'){
              ABA3.syncFromServer(true);
            }
          }catch(_evt){}
        });
      }catch(_bind){}

      // Listener: sempre que outra parte do app sinalizar alteração nas equipes/componentes, re-sincroniza do servidor
      try {
        if(!window.__ABA3_EVT_BOUND__){
          window.__ABA3_EVT_BOUND__ = true;
          document.addEventListener('escala:equipes-alteradas', function(){ try { ABA3.syncFromServer(true); } catch(_){} });
        }
      } catch(_evt){}

      // Delegar abertura do modal Efetivo para botões que tenham data-eq-id
      document.addEventListener('click', async function(ev){
        try{
          const btn = ev.target && (ev.target.closest && ev.target.closest('[data-open="efetivo-equipe"]'));
          if(!btn) return;
          ev.preventDefault(); ev.stopPropagation();
          const eqId = btn.getAttribute('data-eq-id') || '';
          const eqNome = btn.getAttribute('data-eq-nome') || '';
          const modal = document.getElementById('modalEfetivoEquipe');
          if(!modal) return;
          // Registrar último botão/equipe e preparar o modal para troca limpa
          try { window.__LAST_EQ_BTN_EQID__ = eqId || null; } catch(_lb){}
          try {
            // Atualiza rótulo imediatamente
            const span = modal.querySelector('#efetivoEquipeNome'); if(span) span.textContent = eqNome || '';
            // Zera estados anteriores para evitar "vazamento" de componentes de outra equipe
            delete modal.__editingList;
            delete modal.__efList;
          } catch(_clr){}
          modal.dataset.eqId = eqId; modal.dataset.eqNome = eqNome;
          window.__LAST_EQ_FOR_EFETIVO__ = { id:eqId, nome:eqNome };
          // tentar pré-carregar componentes existentes da equipe (render fará o restante)
          try{
            const escalaId = (function(){
              try{ const u=new URL(location.href); const q=u.searchParams.get('id'); if(q&&q.trim()) return q; }catch(_){ }
              try{ const s = window.__ESCALA_STATE__ && window.__ESCALA_STATE__.escalaId; if(s && String(s).trim()) return String(s); }catch(_s){}
              return '';
            })();
            if(escalaId){
              const u1 = `/escalas/api/escalas/${encodeURIComponent(escalaId)}`;
              let data=null; try{ const r=await fetch(u1,{credentials:'same-origin'}); if(r.ok){ data=(await r.json())?.data||null; } }catch(_e){}
              if(!data){ try{ const r2=await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`,{credentials:'same-origin'}); if(r2.ok){ data=(await r2.json())?.data||null; } }catch(_e2){}
              }
              if(data && Array.isArray(data.equipes)){
                const eq = data.equipes.find(e=> String(e.id||e._id)===String(eqId));
                if(eq && Array.isArray(eq.componentes)){
                  const list = eq.componentes.map(c=> ({ id:c.id||c.funcionario_id||c._id||'', funcionario_id:c.funcionario_id||c.id||'', matricula:c.matricula||c.codigo||'', nome:c.nome||'' }));
                  const getModal=()=>document.getElementById('modalEfetivoEquipe');
                  const m=getModal();
                  if(m){
                    // Injeta a lista pré-carregada para esta equipe
                    m.__efList = list;
                    // Se o modal já estiver aberto e for a mesma equipe, force re-render imediato
                    if(m.classList.contains('show') && String(m.dataset.eqId||'')===String(eqId)){
                      try {
                        if(typeof m.__efRender==='function'){
                          m.__editingList = list.slice();
                          m.__efRender();
                        } else if(typeof window.openEquipeEfetivoModal==='function'){
                          window.openEquipeEfetivoModal({ id:eqId, nome:eqNome, componentes: list.slice() });
                        }
                      } catch(_rr){}
                    }
                  }
                }
              }
            }
          }catch(_){ }
          try{ const inst = bootstrap.Modal.getOrCreateInstance(modal); inst.show(); }catch(_b){}
        }catch(_err){}
      }, true);

      // Extrair handler de inserção de equipe para reuso
      async function handleInserirEquipe(ev){
        try{
          if(ev){ ev.preventDefault(); }
          // Bloqueio por fechamento efetivo
          try{
            const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
            const localLocked = (typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()) || (st.fechada===true);
            if(localLocked){ if(window.__toastEscalaFechada) window.__toastEscalaFechada(); else if(window.__toastInfoUI) window.__toastInfoUI('Escala fechada. Proibida a edição!'); else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!'); return; }
          }catch(_lock){ }
          // Último preflight: consultar status no servidor rapidamente para evitar POST 423 se o estado local ainda não refletiu
          try{
            function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
            const escalaIdPf = (function(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||''; }catch(_){ return ''; } })();
            if(escalaIdPf){
              let rr = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaIdPf)}`, { credentials:'same-origin', headers:{ 'Accept':'application/json' } });
              if(!rr.ok){ rr = await fetch(`/api/escalas/${encodeURIComponent(escalaIdPf)}`, { credentials:'same-origin', headers:{ 'Accept':'application/json' } }); }
              if(rr && rr.ok){
                const js = await rr.json(); const d = js?.data || js?.escala || js || {};
                try{ const rawStatus=(d.status||d.situacao||d.situacao_atual||'')+''; const low=rawStatus.toLowerCase(); const cerrado=['fechada','fechado','validada','validado','publicada','concluida','concluída'].includes(low) || (d.fechada===true) || (d.fechamento?.status==='fechada'); const st=(window.__ESCALA_STATE__=window.__ESCALA_STATE__||{}); st.status=rawStatus; st.fechada=!!cerrado; if(cerrado){ if(window.__toastEscalaFechada) window.__toastEscalaFechada(); else if(window.__toastInfoUI) window.__toastInfoUI('Escala fechada. Proibida a edição!'); else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!'); return; } }catch(_s){}
              }
            }
          }catch(_pf){}
          const nomeInp = document.getElementById('nomeEquipe');
          const descInp = document.getElementById('descricaoEquipe');
          const nome = String(nomeInp?.value||'').trim().toUpperCase();
          const desc = String(descInp?.value||'').trim();
          if(!nome){ alert('Informe o nome da equipe (1 a 3 caracteres).'); return; }
          if(nome.length>3){ alert('O nome da equipe deve ter no máximo 3 caracteres.'); return; }
          const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
          const lista = Array.isArray(st.equipes)? st.equipes : (st.equipes = []);
          if(lista.some(e => String((e.nome||'').toUpperCase()) === nome)){
            alert('Já existe uma equipe com esse nome.');
            return;
          }

          // Persistir no backend: POST /escalas/api/escalas/:id/equipes (fallback /api/...)
          const escalaId = (function(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||''; }catch(_){ return ''; } })();
          if(!escalaId){ alert('Crie e salve os Dados Gerais da escala antes de inserir equipes.'); return; }
          function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
          const equipePayload = { id: nome, nome, descricao: desc, componentes: [] };

          let ok=false, resp=null, payloadResp=null;
          try{
            resp = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}/equipes`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipe: equipePayload }) });
            if(!resp.ok){
              if(resp.status===423){ try{ await (window.handleEscalaLockedResponse && window.handleEscalaLockedResponse(resp, { area:'equipes', oper:'create' })); }catch(_h){} return; }
              // Tratamento de erros comuns antes do fallback
              if(resp.status===409){ alert('Nome de equipe já utilizado.'); return; }
              if(resp.status===401 || resp.status===403){ alert('Sem permissão para alterar esta escala (sessão expirada ou acesso negado).'); return; }
              // tentar rota raiz
              resp = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}/equipes`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipe: equipePayload }) });
            }
            ok = !!(resp && resp.ok);
            if(ok){ try { const js = await resp.json(); payloadResp = js && (js.equipe || (js.data && js.data.equipe)); } catch(_j) { payloadResp = null; } }
          }catch(_net){}

          if(!ok){
            // Fallback: PUT da escala inteira com merge das equipes
            try{
              // Carregar escala do servidor
              let r = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' });
              if(!r.ok){ r = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); }
              if(r.ok){ const js=await r.json(); const d=js?.data||js?.escala||js||{}; const equipesSrv = Array.isArray(d.equipes)? d.equipes: [];
                if(!equipesSrv.some(e=> String((e.nome||'').toUpperCase())===nome)) equipesSrv.push({ id: nome, nome, descricao: desc, componentes: [] });
                // PUT com body parcial
                let rPut = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipes: equipesSrv }) });
                if(!rPut.ok){
                  if(rPut.status===423){ try{ await (window.handleEscalaLockedResponse && window.handleEscalaLockedResponse(rPut, { area:'equipes', oper:'create-fallback' })); }catch(_h2){} return; }
                  rPut = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipesOverwrite:true, equipes: equipesSrv }) });
                }
                ok = !!(rPut && rPut.ok);
              }
            }catch(_fb){}
          }

          if(!ok){ alert('Falha ao criar equipe no servidor.'); return; }

          // Atualizar estado local com a resposta do servidor (se disponível) antes do sync
          try {
            if(payloadResp && payloadResp.nome){
              const nova = {
                id: payloadResp.id || payloadResp._id || payloadResp.nome,
                nome: payloadResp.nome,
                descricao: payloadResp.descricao || '',
                componentes: Array.isArray(payloadResp.componentes)? payloadResp.componentes : []
              };
              // merge idempotente
              const idx = st.equipes.findIndex(e=> String(e.id||e._id||e.nome||'') === String(nova.id));
              if(idx>=0) st.equipes[idx] = nova; else st.equipes.push(nova);
            }
          } catch(_preSync){}

          // Sincronizar estado local a partir do servidor
          try{
            let g = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' });
            if(!g.ok){ g = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); }
            if(g.ok){ const js=await g.json(); const d=js?.data||js?.escala||js||{}; const equipesNovas = Array.isArray(d.equipes)? d.equipes.map(e=> ({ id:e.id||e._id||e.nome||'', nome:e.nome||'', descricao:e.descricao||'', componentes: Array.isArray(e.componentes)? e.componentes: [] })) : [];
              st.equipes = equipesNovas;
            }
          }catch(_sync){ /* manter estado já atualizado pelo payloadResp; não inserir local sem confirmação */ }

          try{ if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); }catch(_a){}
          // Limpar inputs e re-render
          try{ if(nomeInp) nomeInp.value=''; if(descInp) descInp.value=''; }catch(_c){}
          ABA3.render('insert');
        }catch(_){ }
      }

      // Inserção de equipe (botão Inserir)
      const btnAdd = document.getElementById('btnAddEquipe');
      if(btnAdd && !btnAdd.__bound){
        btnAdd.__bound = true;
        btnAdd.addEventListener('click', async function(ev){
          const before = (window.__ESCALA_STATE__ && Array.isArray(window.__ESCALA_STATE__.equipes)) ? window.__ESCALA_STATE__.equipes.length : null;
          await handleInserirEquipe(ev);
          try {
            const st = window.__ESCALA_STATE__||{}; const after = Array.isArray(st.equipes)? st.equipes.length : null;
            if(after!==null && before!==null && after>before){
              document.dispatchEvent(new CustomEvent('escala:equipes-alteradas', { detail:{ tipo:'add', equipes: (st.equipes||[]).slice() } }));
            }
          } catch(_d){}
        });
      }
      // Fallback: delegar clique para o botão Inserir caso o binding direto falhe por qualquer motivo
      document.addEventListener('click', function(ev){
        try{
          const el = ev.target && (ev.target.id==='btnAddEquipe' ? ev.target : (ev.target.closest && ev.target.closest('#btnAddEquipe')));
          if(!el) return;
          if(!el.__bound){ handleInserirEquipe(ev); }
        }catch(_e){}
      }, true);

      // Aplicar bloqueio visual quando escala estiver fechada
      try{
        function aplicarLockEquipes(){
          try{
            const fechado = window.__isEscalaFechada && window.__isEscalaFechada();
            const addBtn = document.getElementById('btnAddEquipe');
            if(addBtn){ addBtn.disabled = !!fechado; addBtn.title = fechado ? 'Escala fechada: destrave um dia/turno na aba Alocação para permitir alterações.' : ''; }
          }catch(_){ }
        }
        aplicarLockEquipes();
        document.addEventListener('escala:fechada', aplicarLockEquipes);
      }catch(_bindLock){}
    },
    render(reason){
      try{
        const tbody = document.querySelector('#tabelaEquipes tbody');
        if(!tbody) return;
        const st = window.__ESCALA_STATE__ || {}; const equipes = Array.isArray(st.equipes)? st.equipes : [];
        if(!equipes.length){ tbody.innerHTML = '<tr class="text-muted"><td colspan="4" class="text-center">Nenhuma equipe cadastrada.</td></tr>'; return; }
        const locked = (function(){ try{ return (typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()) || (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.fechada===true); }catch(_){ return false; } })();
        tbody.innerHTML = equipes.map(eq=>{
          const id = String(eq.id||'');
          const nome = String(eq.nome||'');
          const desc = (eq.descricao||'');
          const comps = Array.isArray(eq.componentes)? eq.componentes : [];
          const nomeComp = (c)=>{
            const nome = c?.nome || c?.nomeFuncionario || c?.funcionarioNome || '';
            const cod = c?.matricula || c?.codigo || '';
            const id = c?.id || c?.funcionario_id || '';
            // Evitar exibir ObjectId puro quando possível
            const hasIdHex = typeof id==='string' && /^[0-9a-fA-F]{24}$/.test(id);
            if(cod && nome) return `${String(cod)} - ${String(nome)}`;
            if(nome) return String(nome);
            if(cod) return String(cod);
            return hasIdHex ? '(Funcionário)' : String(id||'');
          };
          const compsBox = comps.length? ('<div class="eq-componentes-box">'+ comps.map(c=> `<div>${nomeComp(c)}</div>`).join('') +'</div>') : '-';
          const dis = locked ? 'disabled aria-disabled="true" tabindex="-1"' : '';
          const pe = locked ? ' style="pointer-events:none;"' : '';
          return `<tr data-id="${id}">`
            + `<td class="eq-col-nome text-center"><strong>${nome}</strong></td>`
            + `<td class="eq-col-desc">${desc? String(desc) : ''}</td>`
            + `<td class="eq-col-comp">${compsBox}</td>`
            + `<td class="eq-col-acoes text-center">`
              + `<button type="button" class="btn btn-sm btn-outline-primary" data-open="efetivo-equipe" data-eq-id="${id}" data-eq-nome="${nome}" title="Efetivo" ${dis}${pe}><i class="bi bi-people"></i></button> `
              + `<button type="button" class="btn btn-sm btn-outline-secondary" data-act="edit-eq" data-eq-id="${id}" title="Editar" ${dis}${pe}><i class="bi bi-pencil"></i></button> `
              + `<button type="button" class="btn btn-sm btn-outline-danger" data-act="del-eq" data-eq-id="${id}" title="Excluir" ${dis}${pe}><i class="bi bi-trash"></i></button>`
            + `</td>`
          + `</tr>`;
        }).join('');
        // Delegar exclusão COM persistência no backend
        // Ação: Editar equipe (abre modal_nome_equipe)
        tbody.querySelectorAll('[data-act="edit-eq"]').forEach(btn=>{
          if(btn.__editBound) return; btn.__editBound = true;
          btn.addEventListener('click', async function(){
            try{
              const eqId = btn.getAttribute('data-eq-id')||'';
              if(!eqId) return;
              try{
                if((typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()) || (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.fechada===true)){
                  if(window.__toastEscalaFechada) window.__toastEscalaFechada();
                  else if(window.__toastInfoUI) window.__toastInfoUI('Escala fechada. Proibida a edição!');
                  else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!');
                  return;
                }
              }catch(_lock){}
              const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
              const eq = Array.isArray(st.equipes) ? st.equipes.find(e=> String(e.id||e._id||'')===String(eqId)) : null;
              const modal = document.getElementById('modalEditarEquipe'); if(!modal) return;
              const nomeEl = modal.querySelector('#editNomeEquipe');
              const descEl = modal.querySelector('#editDescricaoEquipe');
              if(nomeEl){ nomeEl.value = (eq && eq.nome) ? String(eq.nome) : ''; }
              if(descEl){ descEl.value = (eq && eq.descricao) ? String(eq.descricao) : ''; }
              modal.dataset.eqId = eqId;
              // bind salvar (uma única vez)
              const salvarBtn = modal.querySelector('#btnSalvarEdicaoEquipe');
              if(salvarBtn && !salvarBtn.__bound){
                salvarBtn.__bound = true;
                salvarBtn.addEventListener('click', async function(){
                  try{
                    const id = modal.dataset.eqId||'';
                    const novoNome = (nomeEl?.value||'').trim().toUpperCase();
                    const novaDesc = (descEl?.value||'').trim();
                    if(!novoNome){ alert('Informe o nome da equipe (até 3 caracteres).'); return; }
                    if(novoNome.length>3){ alert('O nome da equipe deve ter no máximo 3 caracteres.'); return; }
                    try{
                      if((typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()) || (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.fechada===true)){
                        if(window.__toastEscalaFechada) window.__toastEscalaFechada();
                        else if(window.__toastInfoUI) window.__toastInfoUI('Escala fechada. Proibida a edição!');
                        else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!');
                        return;
                      }
                    }catch(_lock){}
                    // carregar escala do servidor
                    function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
                    const escalaId = (function(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||''; }catch(_){ return ''; } })();
                    if(!escalaId){ alert('Salve os Dados Gerais antes de editar equipes.'); return; }
                    let payload=null; try{ const r=await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); if(r.ok){ payload=await r.json(); } }catch(_e){}
                    if(!payload){ try{ const r2=await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); if(r2.ok){ payload=await r2.json(); } }catch(_e2){} }
                    if(!payload){ alert('Falha ao carregar a escala para editar.'); return; }
                    let d = payload && (payload.data||payload.escala||payload);
                    let equipes = Array.isArray(d?.equipes)? d.equipes : [];
                    const i = equipes.findIndex(e=> String(e.id||e._id||'')===String(id));
                    if(i<0){ alert('Equipe não encontrada.'); return; }
                    // validar conflito de nome
                    if(equipes.some((e,idx)=> idx!==i && String((e.nome||'').toUpperCase())===novoNome)){
                      alert('Já existe uma equipe com esse nome.'); return;
                    }
                    // aplicar alteração: atualizar apenas nome/descrição, preservando id para não quebrar referências
                    equipes[i] = Object.assign({}, equipes[i], { nome: novoNome, descricao: novaDesc });
                    // PUT parcial com fallback overwrite
                    let ok=false; try{ const r=await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipes }) }); if(r && r.status===423){ try{ await (window.handleEscalaLockedResponse && window.handleEscalaLockedResponse(r, { area:'equipes', oper:'edit' })); }catch(_h){} return; } ok = r && r.ok; }catch(_p){}
                    if(!ok){ try{ const r2=await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipesOverwrite:true, equipes }) }); if(r2 && r2.status===423){ try{ await (window.handleEscalaLockedResponse && window.handleEscalaLockedResponse(r2, { area:'equipes', oper:'edit-overwrite' })); }catch(_h2){} return; } ok = r2 && r2.ok; }catch(_p2){} }
                    if(!ok){ alert('Não foi possível salvar as alterações da equipe.'); return; }
                    // sincronizar estado e UI
                    st.equipes = equipes.map(e=> ({ id:e.id||e._id||e.nome||'', nome:e.nome||'', descricao:e.descricao||'', componentes: Array.isArray(e.componentes)? e.componentes: [] }));
                    try{ if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); }catch(_a){}
                    try{ ABA3.render('edit'); }catch(_r){}
                    try{ const inst=bootstrap.Modal.getOrCreateInstance(modal); inst && inst.hide(); }catch(_b){}
                    try { document.dispatchEvent(new CustomEvent('escala:equipes-alteradas', { detail:{ tipo:'edit', equipeId:id, equipes: (st.equipes||[]).slice() } })); } catch(_evt){}
                  }catch(err){ console.warn('[ABA3][edit-equipe] erro ao salvar', err); }
                });
              }
              try{ const inst=bootstrap.Modal.getOrCreateInstance(modal); inst.show(); }catch(_m){}
            }catch(err){ console.warn('[ABA3][edit] erro', err); }
          });
        });

        // Ação: Excluir equipe (persistência no backend)
        tbody.querySelectorAll('[data-act="del-eq"]').forEach(btn=>{
          if(btn.__bound) return; btn.__bound=true;
          btn.addEventListener('click', async function(){
            try{
              const eqId = btn.getAttribute('data-eq-id')||'';
              if(!eqId) return;
              try{
                if((typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()) || (window.__ESCALA_STATE__ && window.__ESCALA_STATE__.fechada===true)){
                  if(window.__toastEscalaFechada) window.__toastEscalaFechada();
                  else if(window.__toastInfoUI) window.__toastInfoUI('Escala fechada. Proibida a edição!');
                  else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!');
                  return;
                }
              }catch(_lock){}
              if(!confirm('Confirmar exclusão da equipe?')) return;
              const st=(window.__ESCALA_STATE__=window.__ESCALA_STATE__||{});
              function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
              const escalaId = (function(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||''; }catch(_){ return ''; } })();
              if(!escalaId){ alert('Escala ainda não foi salva. Salve os Dados Gerais antes de excluir equipes.'); return; }

              // 1) Tentar DELETE prefixado e raiz
              let ok=false; let r=null;
              try{ r = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(eqId)}`, { method:'DELETE', credentials:'same-origin' }); if(r && r.status===423){ try{ await (window.handleEscalaLockedResponse && window.handleEscalaLockedResponse(r, { area:'equipes', oper:'delete' })); }catch(_h){} return; } ok = r && r.ok; }catch(_d1){}
              if(!ok){ try{ r = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(eqId)}`, { method:'DELETE', credentials:'same-origin' }); ok = r && r.ok; }catch(_d2){} }

              // 2) Fallback PUT (remover da lista de equipes e sobrescrever no servidor)
              if(!ok){
                try{
                  let g = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' });
                  if(!g.ok){ g = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); }
                  if(g.ok){ const js=await g.json(); const d=js?.data||js?.escala||js||{}; let equipes = Array.isArray(d.equipes)? d.equipes: [];
                    equipes = equipes.filter(e=> String(e.id||e._id||'') !== String(eqId));
                    let p = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipes }) });
                    if(!p.ok){ if(p.status===423){ try{ await (window.handleEscalaLockedResponse && window.handleEscalaLockedResponse(p, { area:'equipes', oper:'delete-fallback' })); }catch(_h3){} return; } p = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ equipesOverwrite:true, equipes }) }); }
                    ok = p && p.ok;
                  }
                }catch(_fb){}
              }

              if(!ok){ alert('Não foi possível excluir a equipe no servidor.'); return; }

              // 3) Recarregar equipes do servidor e refletir na UI
              try{
                let g2 = await fetch(`${bp()}/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' });
                if(!g2.ok){ g2 = await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); }
                if(g2.ok){ const js=await g2.json(); const d=js?.data||js?.escala||js||{}; st.equipes = Array.isArray(d.equipes)? d.equipes.map(e=> ({ id:e.id||e._id||e.nome||'', nome:e.nome||'', descricao:e.descricao||'', componentes: Array.isArray(e.componentes)? e.componentes: [] })) : []; }
                else { st.equipes = Array.isArray(st.equipes)? st.equipes.filter(e=> String(e.id)!==String(eqId)) : []; }
              }catch(_sync){ st.equipes = Array.isArray(st.equipes)? st.equipes.filter(e=> String(e.id)!==String(eqId)) : []; }

              ABA3.render('delete');
              try { document.dispatchEvent(new CustomEvent('escala:equipes-alteradas', { detail:{ tipo:'del', equipeId: eqId, equipes: (window.__ESCALA_STATE__?.equipes||[]).slice() } })); } catch(_evt){}
              try{ if(typeof window.avaliarProgressaoAbas==='function') window.avaliarProgressaoAbas(); }catch(_a){}
            }catch(_){ }
          });
        });
      }catch(_e){}
    }
  };
  // Expor render global para consumidores externos (ex.: efetivo.js pós-save)
  try { if(typeof window.renderEquipes !== 'function'){ window.renderEquipes = function(){ try { ABA3.render('external'); } catch(_e){} }; } } catch(_exp){}
  // Fallback leve para carregar a escala inteira quando necessário (ex.: efetivo.js chama carregarEscalaExistente)
  try {
    if(typeof window.carregarEscalaExistente !== 'function'){
      window.carregarEscalaExistente = async function(id){
        try{
          const base = (document.body && document.body.getAttribute('data-base-path')) || '/escalas';
          let r = await fetch(`${base}/api/escalas/${encodeURIComponent(id)}`, { credentials:'same-origin' });
          if(!r.ok) r = await fetch(`/api/escalas/${encodeURIComponent(id)}`, { credentials:'same-origin' });
          if(!r.ok) return false;
          const js = await r.json();
          const d = js?.data || js?.escala || js || {};
          const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
          // Atualiza campos principais usados nas abas
          try { if(d.periodo){ st.periodo = { ini: d.periodo.ini||d.inicio||d.periodoIni||null, fim: d.periodo.fim||d.fim||d.periodoFim||null }; } } catch(_p){}
          try { if(Array.isArray(d.equipes)) st.equipes = d.equipes; } catch(_eq){}
          try { const g = d.grupos_turnos||d.gruposTurnos; if(Array.isArray(g)) st.gruposTurnos = g; } catch(_gt){}
          // Re-renderiza o que estiver presente
          try { if(typeof window.renderGruposTurnos==='function') window.renderGruposTurnos('sync'); } catch(_rg){}
          try { if(typeof window.renderEquipes==='function') window.renderEquipes('sync'); } catch(_re){}
          try { if(typeof window.renderMatrizesPorGrupo==='function') window.renderMatrizesPorGrupo(); } catch(_rm){}
          return true;
        }catch(_e){ return false; }
      };
    }
  } catch(_fb){}
  window.ABA3 = ABA3;
})();
