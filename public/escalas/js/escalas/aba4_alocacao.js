(function(){
  // Estado local de desbloqueios vindos do backend
  let __UNLOCKS__ = null; // mapa: { 'YYYY-MM-DD': true, 'YYYY-MM-DD__HH:MM-HH:MM': true }
  function getState(){ try{ return (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {}); }catch(_){ return {}; } }
  function isFechada(){ try{ return String((getState().status||'').toLowerCase())==='fechada'; }catch(_){ return false; } }
  function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
  function getEscalaId(){ try{ const u=new URL(location.href); return u.searchParams.get('id') || ''; }catch(_){ return ''; } }
  function normTok(tok){ try{ return String(tok||'').replace(/\s*-\s*/,'-'); }catch(_){ return String(tok||''); } }
  function isDiaUnlocked(d){ try{ return !!(__UNLOCKS__ && (__UNLOCKS__[String(d)]===true)); }catch(_){ return false; } }
  function isCellUnlocked(d, tok){ try{ const key=`${String(d)}__${normTok(tok)}`; return !!(__UNLOCKS__ && (__UNLOCKS__[String(d)]===true || __UNLOCKS__[key]===true)); }catch(_){ return false; } }
  async function loadUnlocks(force){
    try{
      // Permitir recarregar explicitamente quando force=true (ex.: após fechar a escala)
      if(!force && __UNLOCKS__ && typeof __UNLOCKS__==='object') return __UNLOCKS__;
      const id=getEscalaId(); if(!id) return {};
      const urls=[ bp()+`/api/escalas/${encodeURIComponent(id)}/desbloqueios`, `/escalas/api/escalas/${encodeURIComponent(id)}/desbloqueios`, `/api/escalas/${encodeURIComponent(id)}/desbloqueios` ];
      for(const u of urls){ try{ const r=await fetch(u,{ credentials:'same-origin' }); if(r.ok){ const j=await r.json(); __UNLOCKS__ = (j&&j.data)||{}; return __UNLOCKS__; } }catch(_e){} }
    }catch(_){ }
    __UNLOCKS__ = __UNLOCKS__ || {};
    return __UNLOCKS__;
  }
  function hasAnyUnlockedForGroup(grupo, datas){
    try{
      // Se a escala não está fechada, considerar editável por padrão
      if(!isFechada()) return true;
      if(!grupo || !Array.isArray(grupo.turnos) || !grupo.turnos.length) return false;
      for(const d of (datas||[])){
        if(isDiaUnlocked(d)) return true;
        for(const t of grupo.turnos){
          const tok = `${t.ini||t.inicio||''}-${t.fim||t.termino||''}`;
          if(isCellUnlocked(d, tok)) return true;
        }
      }
    }catch(_){ }
    return false;
  }
  async function toggleDiaUnlock(dia, desbloqueado){
    try{
      const id=getEscalaId(); if(!id||!dia) return { ok:false };
      const body = JSON.stringify({ dia:String(dia), desbloqueado: !!desbloqueado });
      const urls=[ bp()+`/api/escalas/${encodeURIComponent(id)}/desbloqueios`, `/escalas/api/escalas/${encodeURIComponent(id)}/desbloqueios`, `/api/escalas/${encodeURIComponent(id)}/desbloqueios` ];
      for(const u of urls){ try{ const r=await fetch(u,{ method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body }); if(r.ok){ const j=await r.json().catch(()=>null); __UNLOCKS__ = (j&&j.data)||__UNLOCKS__||{}; return { ok:true }; } }catch(_e){} }
    }catch(_){ }
    return { ok:false };
  }
  function soData(v){ try { if(!v) return ''; const s=String(v); return s.length>=10? s.slice(0,10) : s; } catch(_){ return ''; } }
  function gerarDatas(iniISO,fimISO){
    const out=[]; const ini=soData(iniISO); const fim=soData(fimISO);
    const dt=new Date(ini+'T00:00:00'); const end=new Date(fim+'T00:00:00');
    if(isNaN(dt)||isNaN(end)) return out; let guard=0;
    while(dt<=end && guard<93){ out.push(dt.toISOString().slice(0,10)); dt.setDate(dt.getDate()+1); guard++; }
    return out;
  }
  function diaSemanaAbrev(iso){ try{ const d=new Date(iso+'T00:00:00'); const i=d.getDay(); return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][i]||''; }catch(_){ return ''; } }
  function fmtBr(iso){ if(!iso) return ''; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m? `${m[3]}/${m[2]}/${m[1]}`:''; }
  // bp() e getEscalaId() declarados acima
  function toDaysRange(iniISO,fimISO){ try{ const out=[]; const di=new Date(String(iniISO).slice(0,10)+'T00:00:00'); const df=new Date(String(fimISO).slice(0,10)+'T00:00:00'); if(isNaN(di)||isNaN(df) || df<di) return out; const d=new Date(di); let guard=0; while(d<=df && guard<400){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); guard++; } return out; }catch(_){ return []; } }
  async function salvarMatrizAlocacao(){
    try{
      const st=getState(); const id=getEscalaId(); if(!id) return { ok:false, error:'sem_id' };
      const obj = st.matrizAlocacao && typeof st.matrizAlocacao==='object' ? st.matrizAlocacao : {};
      // Se fechada, evitamos PUT geral de matriz para não gerar 400 desnecessário (as mudanças serão aplicadas via toggles por célula)
      if(isFechada()){
        return { ok:true, via:'skip-fechada' };
      }
      const urls=[ bp()+`/api/escalas/${encodeURIComponent(id)}`, `/escalas/api/escalas/${encodeURIComponent(id)}`, `/api/escalas/${encodeURIComponent(id)}` ];
      let lastErr=null;
      for(const u of urls){
        try{
          const r=await fetch(u,{ method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ alocacao: obj }) });
          if(r.ok){ return { ok:true, via:u }; }
          const text = await r.text().catch(()=>String(r.status));
          // Rebaixar severidade quando bloqueado por fechamento
          const msg = String(text||'');
          if(r.status===400 && /Escala fechada/i.test(msg)){
            console.info('[alocacao][salvarMatriz] bloqueado (fechada)', r.status, u);
            return { ok:false, error:'fechada', via:u };
          }
          console.warn('[alocacao][salvarMatriz] falha', r.status, u, msg.slice(0,200));
          lastErr = text || String(r.status);
        }catch(e){ lastErr=e?.message||'erro_fetch'; console.warn('[alocacao][salvarMatriz] erro_fetch', u, lastErr); }
      }
      return { ok:false, error:lastErr||'erro_put' };
    }catch(e){ return { ok:false, error:e?.message||'erro' }; }
  }
  async function calcularBlockedDiasFuncionario(fid, per){
    try{
      const id = String(fid||''); if(!id) return [];
      const ini = String(per?.ini||'').slice(0,10); const fim=String(per?.fim||'').slice(0,10);
      if(!(ini && fim)) return [];
      const urls=[ bp()+`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(id)}&inicio=${encodeURIComponent(ini)}&fim=${encodeURIComponent(fim)}`, `/escalas/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(id)}&inicio=${encodeURIComponent(ini)}&fim=${encodeURIComponent(fim)}` ];
      for(const u of urls){ try{ const r=await fetch(u,{ credentials:'same-origin' }); if(!r.ok) continue; const j=await r.json(); const blocked = Array.isArray(j?.data?.blocked)? j.data.blocked: []; if(!blocked.length) return []; // sem bloqueios
        // Expandir blocos em dias individuais
        const dias=[]; for(const b of blocked){ const arr = toDaysRange(b.inicio, b.fim); for(const d of arr){ dias.push(d); } }
        return [...new Set(dias)];
      }catch(_e){} }
    }catch(_){ }
    return [];
  }
  async function salvarDisponibilidadeEquipe(equipe){
    try{
      const st=getState(); const id=getEscalaId(); if(!id || !equipe || !equipe.id) return { ok:false };
      if(isFechada()) return { ok:false, skipped:true };
      const comps = Array.isArray(equipe.componentes)? equipe.componentes: [];
      const per = st.periodo || {};
      const disp = {};
      // Monta apenas dias false (bloqueados) por funcionário
      for(const c of comps){ const fid = c && (c.id||c.funcionario_id); if(!fid) continue; const blocked = await calcularBlockedDiasFuncionario(fid, per); if(blocked.length){ const node = disp[String(fid)] = (disp[String(fid)]||{ dias:{} }); for(const d of blocked){ node.dias[d]=false; } } }
      const payload = { disponibilidade: disp };
  const urls=[ bp()+`/api/escalas/${encodeURIComponent(id)}/equipes/${encodeURIComponent(equipe.id)}`, `/escalas/api/escalas/${encodeURIComponent(id)}/equipes/${encodeURIComponent(equipe.id)}`, `/api/escalas/${encodeURIComponent(id)}/equipes/${encodeURIComponent(equipe.id)}` ];
      for(const u of urls){ try{ const r=await fetch(u,{ method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload) }); if(r.ok){ return { ok:true }; } }catch(_e){} }
    }catch(_){ }
    return { ok:false };
  }
  async function salvarGrupo(gid){
    // 1) salvar matriz global de alocação; 2) sincronizar eq.alocacoes por dia/turno; 3) salvar disponibilidade das equipes
    const st=window.__ESCALA_STATE__||{};
    const escId = getEscalaId();
    if(!escId){ alert('ID da escala não encontrado. Abra a escala pelo link com ?id=<ObjectId>.'); return { ok:false, error:'sem_id' }; }
    // UI: status no header do grupo
    function setStatus(msg, kind){
      try{
        const header = document.querySelector(`.matriz-grupo[data-grupo="${gid}"] .border-bottom`);
        if(!header) return;
        let span = header.querySelector('.persist-status');
        if(!span){ span = document.createElement('span'); span.className = 'persist-status small ms-2'; header.appendChild(span); }
        span.textContent = String(msg||'');
        span.style.opacity = 0.9;
        span.style.transition = 'opacity .3s ease';
        span.dataset.kind = kind||'info';
        if(kind==='ok'){ span.style.color = '#157347'; }
        else if(kind==='err'){ span.style.color = '#dc3545'; }
        else { span.style.color = '#0d6efd'; }
      }catch(_s){}
    }
    setStatus('Salvando…','info');
  await salvarMatrizAlocacao();
    // Montar células (dia,turno) do grupo
    try{
      const grupo = (Array.isArray(st.gruposTurnos)? st.gruposTurnos: []).find(g=> String(g.id)===String(gid));
      const per = st.periodo || {};
      const datas = gerarDatas(per.ini, per.fim);
      const turnos = Array.isArray(grupo?.turnos)? grupo.turnos: [];
      const aloc = st.matrizAlocacao || {};
      // Helpers
      const parseIds = (v)=>{
        if(Array.isArray(v)) return v.map(String);
        if(typeof v==='string') return v.split(',').map(s=> s.trim()).filter(Boolean);
        if(v && typeof v==='object') return Object.keys(v).filter(k=> v[k]);
        return [];
      };
      // Mapas para resolver tokens de equipe (id OU nome) em id
      const eqById = new Map((st.equipes||[]).map(e=> [String(e.id||e._id||''), e]));
      const eqByNomeUp = new Map((st.equipes||[]).map(e=> [String((e.nome||'').toUpperCase()), e]));
      function resolverEquipeToken(token){
        let raw = String(token||'').trim();
        if(!raw) return null;
        // Normalizar tokens do tipo "A - LOCAF" para apenas o prefixo do nome
        const idx = raw.toUpperCase().indexOf(' - ');
        if(idx>0) raw = raw.slice(0, idx).trim();
        if(eqById.has(raw)) return eqById.get(raw);
        const byName = eqByNomeUp.get(raw.toUpperCase());
        return byName || null;
      }
      async function toggleAloc(eid, dia, turno, ativa){
        try{
          const id=getEscalaId(); if(!id) return;
          const body = JSON.stringify({ dia, turnoId: turno, ativa });
          const urls=[ bp()+`/api/escalas/${encodeURIComponent(id)}/equipes/${encodeURIComponent(eid)}/alocacao`, `/escalas/api/escalas/${encodeURIComponent(id)}/equipes/${encodeURIComponent(eid)}/alocacao`, `/api/escalas/${encodeURIComponent(id)}/equipes/${encodeURIComponent(eid)}/alocacao` ];
          for(const u of urls){
            try{
              const r=await fetch(u,{ method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body });
              if(r.ok) return { ok:true };
              // Log leve para diagnóstico sem interromper fluxo
              try { const tt = await r.text(); console.warn('[alocacao][toggleAloc] falha', { status:r.status, url:u, eid, dia, turno, ativa, body: body, resp: String(tt).slice(0,400) }); } catch(_t){}
            }catch(_e){ /* noop */ }
          }
        }catch(_t){}
      }
  let okCount=0, failCount=0; let selectedCells=0, totalCells=0, removedToggles=0;
  const eqIdsReferenciadas = new Set();
  // Garantir desbloqueios carregados antes de processar
  await loadUnlocks();
      // Recuperar alocações atuais (servidor) para identificar removidas (desativar)
      function getPrevIdsForCell(dia, token){
        const out = new Set();
        try{
          const eqs = Array.isArray(st.equipes)? st.equipes: [];
          for(const eq of eqs){
            const arr = Array.isArray(eq.alocacoes)? eq.alocacoes: [];
            for(const a of arr){
              if(!a) continue;
              if(String(a.dia)!==String(dia)) continue;
              const tok = String(a.turnoId||'').split('::').slice(-1)[0];
              if(tok===token){ out.add(String(eq.id||eq._id||'')); break; }
            }
          }
        }catch(_p){}
        return out;
      }
      // Processar toggles sequencialmente para reduzir conflitos/500
      for(const t of turnos){
        const token = `${t.ini}-${t.fim}`;
        for(const d of datas){
          const key = `${gid}::${t.ini}-${t.fim}|${d}`;
          const selecionadas = new Set(parseIds(aloc[key]));
          totalCells++;
          for(const tok of selecionadas){
            const eq = resolverEquipeToken(tok);
            if(!eq || !eq.id) continue;
            eqIdsReferenciadas.add(String(eq.id));
            try {
              // Se fechada e célula não desbloqueada, nem tenta
              if(isFechada() && !isCellUnlocked(d, token)){
                failCount++;
              } else {
                const res = await toggleAloc(String(eq.id), d, token, true);
                if(res && res.ok){ okCount++; } else { failCount++; }
              }
            } catch(_e){ failCount++; }
            // pequeno intervalo para reduzir colisões no servidor
            try { await new Promise(r=> setTimeout(r, 15)); } catch(_s){}
            selectedCells++;
          }
          // Desativar alocações que existiam e não estão mais selecionadas
          try{
            const prev = getPrevIdsForCell(d, token);
            if(prev.size){
              for(const eid of prev){
                if(!selecionadas.has(String(eid))){
                  try {
                    if(isFechada() && !isCellUnlocked(d, token)){
                      failCount++;
                    } else {
                      const res = await toggleAloc(String(eid), d, token, false);
                      if(res && res.ok){ okCount++; removedToggles++; } else { failCount++; }
                    }
                  } catch(_de){ failCount++; }
                  try { await new Promise(r=> setTimeout(r, 15)); } catch(_s){}
                }
              }
            }
          }catch(_rem){}
        }
      }
      // Se nada foi selecionado e nada foi removido, informar
      if(selectedCells===0 && removedToggles===0){
        console.info('[alocacao][persist] Nada para salvar no grupo', { grupoId: gid, totalCells });
        setStatus('Nada para salvar: nenhuma mudança detectada', 'info');
      }
  // (sem tasks em paralelo — já processado sequencialmente)
      // Disponibilidade: apenas para equipes referenciadas no grupo (selecionadas em qualquer célula)
      if(eqIdsReferenciadas.size){
        for(const eid of eqIdsReferenciadas){ const eq = eqById.get(String(eid)); if(eq){ try{ await salvarDisponibilidadeEquipe(eq); }catch(_sd){ failCount++; } } }
      }
      // Verificar no servidor se refletiu
      try {
        const urlsVer = [ bp()+`/api/escalas/${encodeURIComponent(escId)}`, `/escalas/api/escalas/${encodeURIComponent(escId)}`, `/api/escalas/${encodeURIComponent(escId)}` ];
        let doc=null; let via='';
        for(const u of urlsVer){ try { const r=await fetch(u,{ credentials:'same-origin' }); if(r.ok){ const j=await r.json(); doc=j?.data||j; via=u; break; } } catch(_v){} }
        if(doc){
          const matriz = doc.alocacao && typeof doc.alocacao==='object'? doc.alocacao: {};
          const eqs = Array.isArray(doc.equipes)? doc.equipes: [];
          const chavesGrupo = Object.keys(matriz).filter(k=> k.startsWith(String(gid)+'::')).length;
          // contar alocações de equipe no período/turnos do grupo
          let eqAllocCount=0;
          try{
            const period = st.periodo||{}; const dias=gerarDatas(period.ini, period.fim);
            const normHora=(h)=>{ try{ if(!h) return ''; const m=String(h).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/); if(m){ const hh=String(m[1]).padStart(2,'0'); const mm=String(m[2]).padStart(2,'0'); return `${hh}:${mm}`; } return String(h).slice(0,5); }catch(_){ return String(h||'').slice(0,5); } };
            const normTok=(tok)=>{ try{ const t=String(tok||'').split('::').slice(-1)[0]; const p=t.split('-'); if(p.length>=2) return `${normHora(p[0])}-${normHora(p[1])}`; return t; }catch(_){ return String(tok||''); } };
            const turnTokens = (Array.isArray(grupo?.turnos)? grupo.turnos: []).map(t=> `${t.ini}-${t.fim}`).map(normTok);
            for(const eq of eqs){ const arr = Array.isArray(eq.alocacoes)? eq.alocacoes: []; for(const a of arr){ if(!a) continue; if(!dias.includes(a.dia)) continue; const tok=normTok(a.turnoId||''); if(turnTokens.includes(tok)) eqAllocCount++; } }
          }catch(_cnt){}
          // Sincronizar estado local com o servidor para refletir imediatamente na UI
          try {
            st.matrizAlocacao = matriz;
            if(Array.isArray(eqs)) st.equipes = eqs;
            render();
          } catch(_sync){ }
          const baseMsg = `Servidor OK: matriz(${chavesGrupo}) eq.aloc(${eqAllocCount})`;
          if(failCount>0) setStatus(`${baseMsg} • alertas (${okCount} OK, ${failCount} falhas)`,`err`);
          else setStatus(`${baseMsg} • Salvo${removedToggles? ` • removidas(${removedToggles})`:''}`,`ok`);
          console.info('[alocacao][verificacao]', { via, chavesGrupo, eqAllocCount });
        } else {
          if(failCount>0) setStatus(`Salvo com alertas (${okCount} OK, ${failCount} falhas)`,`err`);
          else setStatus(`Salvo (${okCount} atualizações)`,`ok`);
        }
      } catch(_ver){
        if(failCount>0) setStatus(`Salvo com alertas (${okCount} OK, ${failCount} falhas)`,`err`);
        else setStatus(`Salvo (${okCount} atualizações)`,`ok`);
      }
    }catch(_e){ }
    try{ document.dispatchEvent(new CustomEvent('escala:alocacao:salva',{ detail:{ grupoId: gid } })); }catch(_evt){}
  }

  function render(){
    try{
      const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
      const wrap = document.getElementById('matrizAlocacaoWrap');
      const placeholder = document.getElementById('placeholderMatriz');
      const cont = document.getElementById('matrizAlocacao');
      const ulValidas = document.getElementById('listaEquipesValidas');
      const ctx = document.getElementById('ctxAlocacao');
      if(ctx){ const per=st.periodo||{}; ctx.textContent = (per.ini&&per.fim) ? `Período: ${fmtBr(per.ini)} a ${fmtBr(per.fim)}` : 'Defina o período em Dados Gerais.'; }
      if(!wrap || !cont){ return; }

      function showPlaceholder(msg){ if(placeholder){ placeholder.innerHTML = `<div class="p-2 text-center">${msg}</div>`; placeholder.style.display='block'; } if(cont){ cont.style.display='none'; cont.innerHTML=''; } }
      function showContent(){ if(placeholder){ placeholder.style.display='none'; } if(cont){ cont.style.display='block'; } }

      // Listar equipes válidas (com componentes)
      try{
        if(ulValidas){
          const equipesValidas = (st.equipes||[]).filter(e=> Array.isArray(e.componentes) && e.componentes.length>0);
          const itens = equipesValidas.map(e=>{
            const comps=(e.componentes||[]).map(c=> c.nome||c.id).filter(Boolean);
            const title = comps.length? comps.join(', ') : '';
            return `<li class="list-group-item d-flex justify-content-between align-items-center">
                      <span title="${(title||'').replace(/"/g,'&quot;')}">${e.nome}${e.descricao? ' - '+e.descricao: ''}</span>
                      <span class="badge bg-secondary rounded-pill" title="Qtd. de componentes">${comps.length}</span>
                    </li>`;
          }).join('');
          ulValidas.innerHTML = itens || '<li class="list-group-item text-muted text-center">Nenhuma equipe válida.</li>';
        }
      }catch(_lv){}

      // Pré-condições
      const per = st.periodo || {}; if(!(per.ini && per.fim)){ showPlaceholder('Defina o período (Dados Gerais) para exibir a matriz.'); return; }
      const datas = gerarDatas(per.ini, per.fim); if(!datas.length){ showPlaceholder('Período inválido. Ajuste as datas em Dados Gerais.'); return; }
      const grupos = Array.isArray(st.gruposTurnos)? st.gruposTurnos: [];
      // Iniciar sempre em modo consulta (view); clique em célula ativa modo edição on-demand
      if(!grupos.length){
        showContent();
        const header = '<tr><th style="width:140px" class="bg-white"></th>' + datas.map(d=>`<th class="text-center align-middle bg-primary text-white" style="font-size:.7rem;width:60px;">${d.slice(8,10)}</th>`).join('') + '</tr>';
  const html = '<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="width:100%; table-layout: fixed;"><thead>'+
                     header + '</thead><tbody>'+
                     `<tr><td colspan="${datas.length+1}" class="text-center text-muted">Nenhum grupo de turnos. Use o botão "Inserir" na aba Turnos.</td></tr>`+
                     '</tbody></table></div>';
        cont.innerHTML = html; cont.style.display='block';
        try{ document.dispatchEvent(new CustomEvent('escala:matriz:renderizada',{ detail:{ grupos:0, dias: datas.length, skeleton:true } })); }catch(_evt){}
        return;
      }

  // Helpers de nomes/ids
      function eqIdsToNames(valor){
        if(!valor) return '';
        const eqById=new Map((st.equipes||[]).map(e=> [String(e.id||e._id||''), e]));
        return String(valor).split(',').map(id=>{ id=String(id||'').trim(); const eq=eqById.get(id); return eq? eq.nome : id; }).filter(Boolean).join(',');
      }
      // Mapa de fallback derivado de eq.alocacoes -> { `${gid}::HH:MM-HH:MM|YYYY-MM-DD`: Set<equipeId> }
      function construirFallbackDeEqAlocacoes(grupos, datas){
        const out = new Map();
        try{
          const gruposByToken = new Map(); // token -> [gid,...]
          grupos.forEach(g=>{
            const turnos = Array.isArray(g.turnos)? g.turnos: [];
            turnos.forEach(t=>{
              const normHora=(h)=>{ try{ if(!h) return ''; const m=String(h).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/); if(m){ const hh=String(m[1]).padStart(2,'0'); const mm=String(m[2]).padStart(2,'0'); return `${hh}:${mm}`; } return String(h).slice(0,5); }catch(_){ return String(h||'').slice(0,5); } };
              const tok = `${normHora(t.ini)}-${normHora(t.fim)}`;
              if(!gruposByToken.has(tok)) gruposByToken.set(tok, []);
              gruposByToken.get(tok).push(String(g.id));
            });
          });
          const eqs = Array.isArray(st.equipes)? st.equipes: [];
          for(const eq of eqs){
            const al = Array.isArray(eq.alocacoes)? eq.alocacoes: [];
            for(const a of al){
              if(!a || !a.dia || !a.turnoId) continue;
              if(!datas.includes(a.dia)) continue;
              const tok = (function(){ const t=String(a.turnoId).split('::').slice(-1)[0]; const p=t.split('-'); if(p.length>=2){ return `${p[0].slice(0,5)}-${p[1].slice(0,5)}`; } return t; })();
              const gids = gruposByToken.get(tok) || [];
              for(const gid of gids){
                const key = `${gid}::${tok}|${a.dia}`;
                if(!out.has(key)) out.set(key, new Set());
                out.get(key).add(String(eq.id||eq._id||''));
              }
            }
          }
        }catch(_fb){}
        return out;
      }
      function nomesToIds(nomes){
        if(!nomes) return [];
        const nomesArr = String(nomes).split(/\s*,\s*/).filter(Boolean);
        // Normalizar tokens: aceitar formatos como "A - LOCAF" pegando o prefixo antes de " - "
        const normalizar = (s)=>{
          let t = String(s||'').toUpperCase().trim();
          const idx = t.indexOf(' - ');
          if(idx>0) t = t.slice(0, idx).trim();
          // remover espaços extras
          t = t.replace(/\s+/g,' ');
          return t;
        };
        const mapaNome = new Map((st.equipes||[]).map(e=> [String((e.nome||'').toUpperCase()), e.id||e._id||'']));
        return nomesArr.map(n=> mapaNome.get(normalizar(n)) || '').filter(Boolean);
      }
      function aplicarRestricoesInputsMatriz(container){
        const inputs=[...(container||document).querySelectorAll('input.matriz-input')];
        inputs.forEach(inp=>{
          if(inp.__bound) return; inp.__bound=true;
          inp.addEventListener('input',()=>{
            let v=String(inp.value||'').toUpperCase();
            // Permitir letras, números, vírgulas, hífen e espaços (ex.: "A - LOCAF")
            v=v.replace(/[^A-Z0-9,\-\s]/g,'');
            v=v.replace(/,{2,}/g,',');
            v=v.replace(/^,+/,'');
            inp.value=v; inp.classList.remove('is-invalid'); inp.removeAttribute('title');
          });
          inp.addEventListener('blur',()=>{
            const valor = String(inp.value||'').trim(); if(!valor) return;
            const normalizar=(s)=>{ let t=String(s||'').toUpperCase().trim(); const idx=t.indexOf(' - '); if(idx>0) t=t.slice(0,idx).trim(); t=t.replace(/\s+/g,' '); return t; };
            const equipes = valor.split(',').map(e => normalizar(e)).filter(Boolean);
            const existentes = new Set((st.equipes||[]).map(e=> String((e.nome||'').toUpperCase())));
            const invalidas = equipes.filter(eq => !existentes.has(eq));
            if(invalidas.length>0){
              inp.classList.add('is-invalid'); inp.setAttribute('title','Equipe inexistente: '+invalidas.join(', '));
            }
          });
          inp.setAttribute('autocomplete','off');
          inp.setAttribute('spellcheck','false');
          try{ inp.maxLength=64; }catch(_){ }
        });
      }
      function validarEntradasGrupo(container){
        const inputs=[...(container||document).querySelectorAll('input.matriz-input[data-key]')];
        const existentes = new Set((st.equipes||[]).map(e=> String((e.nome||'').toUpperCase())));
        const normalizar = (s)=>{
          let t = String(s||'').toUpperCase().trim();
          const idx = t.indexOf(' - ');
          if(idx>0) t = t.slice(0, idx).trim();
          t = t.replace(/\s+/g,' ');
          return t;
        };
        const invalidTokens=[];
        inputs.forEach(inp=>{
          const valor=String(inp.value||'').trim(); if(!valor) return;
          const tokens = valor.split(/\s*,\s*/).filter(Boolean);
          tokens.forEach(t=>{ const norm = normalizar(t); if(!existentes.has(norm)) invalidTokens.push(t); });
        });
        return { ok: invalidTokens.length===0, invalidTokens };
      }
      function atualizarEstadoDoGrupo(container){
        const inputs=[...(container||document).querySelectorAll('input.matriz-input[data-key]')];
        st.matrizAlocacao = st.matrizAlocacao || {};
        inputs.forEach(inp=>{
          const key = inp.getAttribute('data-key'); if(!key) return;
          const ids = nomesToIds(String(inp.value||''));
          if(ids.length) st.matrizAlocacao[key] = ids.join(',');
          else delete st.matrizAlocacao[key];
        });
      }

      // Renderização por grupo (consulta/edição)
      showContent();
  const colWidth=66; const eqById = new Map((st.equipes||[]).map(e=> [String(e.id||e._id||''), e]));
      const parts = [];
  // Precompute fallback allocations from eq.alocacoes
  const fallbackMap = construirFallbackDeEqAlocacoes(grupos, datas);
  // Estabilizar a visualização: incorporar fallback na matriz local uma vez (sem sobrescrever chaves existentes)
  try{
    const st2 = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
    if(!st2.__alocFillFromFallbackDone){
      const mat = (st2.matrizAlocacao = st2.matrizAlocacao && typeof st2.matrizAlocacao==='object' ? st2.matrizAlocacao : {});
      for(const [k, setIds] of fallbackMap.entries()){
        if(!(k in mat) || !mat[k]){
          const ids = Array.from(setIds||[]).map(String).filter(Boolean);
          if(ids.length) mat[k] = ids.join(',');
        }
      }
      st2.__alocFillFromFallbackDone = true;
    }
  }catch(_stab){}
  grupos.forEach(g=>{
        const turnos = Array.isArray(g.turnos)? g.turnos: [];
        const modo = (g && g.__modo==='edit') ? 'edit' : 'view';
    const grupoTemDesbloqueio = hasAnyUnlockedForGroup(g, datas);
    const head1 = (isFechada()
      ? (`<tr><th style="width:160px;white-space:nowrap" class="bg-white"></th>`+
        datas.map(d=>`<th class="text-center align-middle bg-primary text-white cadeado-dia" data-dia="${d}" style="width:${colWidth}px;min-width:${colWidth}px;font-size:.7rem;padding:.25rem .25rem;">${d.slice(8,10)}</th>`).join('')+
        `</tr>`)
      : (`<tr><th style="width:160px;white-space:nowrap" class="bg-white"></th>`+
        datas.map(d=>`<th class="text-center align-middle bg-primary text-white" style="width:${colWidth}px;min-width:${colWidth}px;font-size:.7rem;padding:.25rem .25rem;">${d.slice(8,10)}</th>`).join('')+
        `</tr>`)
    );
  const head2 = `<tr><th class="bg-white" style="width:160px;white-space:nowrap"></th>`+
          datas.map(d=>`<th class="text-center align-middle bg-secondary text-white" style="width:${colWidth}px;min-width:${colWidth}px;font-size:.70rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:.15rem .25rem;">${diaSemanaAbrev(d)}</th>`).join('')+
                      `</tr>`;
        let body='';
        turnos.forEach(t=>{
          const hi = t.ini||t.inicio||''; const hf=t.fim||t.termino||''; const faixaLabel = `${hi||'?'} às ${hf||'?'}`;
          body += `<tr><td class="bg-light fw-semibold text-center" style="font-size:.80rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:160px;">${faixaLabel}</td>`;
          body += datas.map(d=>{
            const key=`${g.id}::${hi||'?'}-${hf||'?'}|${d}`;
            const keySpc=`${g.id}::${hi||'?'} - ${hf||'?'}|${d}`;
            const mat = st.matrizAlocacao || {};
            const legacyKey = `${hi||'?'}-${hf||'?'}|${d}`; // suporte a formato sem groupId
            const legacySpc = `${hi||'?'} - ${hf||'?'}|${d}`;
            const rawVal = (key in mat) ? mat[key]
                          : (keySpc in mat) ? mat[keySpc]
                          : (legacyKey in mat) ? mat[legacyKey]
                          : (legacySpc in mat) ? mat[legacySpc]
                          : undefined;
            const val = (rawVal==null)? '' : rawVal;
            if(modo==='edit'){
              // Em modo edição, só mostrar input nas células destrancadas; bloqueadas permanecem em modo consulta
              const tokEdit = `${hi||'?'}-${hf||'?'}`;
              const editable = (!isFechada()) || isDiaUnlocked(d) || isCellUnlocked(d, tokEdit);
              if(!editable){
                // Render como view
                let ids = [];
                if(Array.isArray(val)) ids = val.map(x=> String(x));
                else if(typeof val==='string') ids = val.split(',').map(s=> s.trim()).filter(Boolean);
                else if(val && typeof val==='object') ids = Object.keys(val).filter(k=> val[k]);
                if(ids.length===0){
                  const fromFb = fallbackMap.get(key);
                  if(fromFb && fromFb.size) ids = [...fromFb];
                }
                const nomes = ids.length? ids.map(id=> (eqById.get(String(id))||{}).nome || String(id)).filter(Boolean) : [];
                if(!nomes.length) return `<td class="text-center align-middle small" data-key="${key}" data-grupo-id="${g.id}" data-turno-ini="${hi}" data-turno-fim="${hf}" data-dia="${d}" style="width:${colWidth}px;">-</td>`;
                const links = nomes.map(n=> `<a href="#" class="matriz-eq-item d-block text-primary text-decoration-underline" data-eqnome="${n}" data-eq-nome="${n}" data-eq-id="${(function(){ const cand=[...eqById.values()].find(e=> String(e.nome)===String(n)); return cand? (cand.id||cand._id||'') : ''; })()}" style="cursor:pointer;line-height:1.05;">${n}</a>`).join('');
                return `<td class="text-center align-middle small" data-key="${key}" data-grupo-id="${g.id}" data-turno-ini="${hi}" data-turno-fim="${hf}" data-dia="${d}" style="width:${colWidth}px;">${links}</td>`;
              }
              // Converter valor da matriz em IDs; se vazio, usar fallback derivado de eq.alocacoes para pré-preencher
              let ids = [];
              if(Array.isArray(val)) ids = val.map(x=> String(x));
              else if(typeof val==='string') ids = val.split(',').map(s=> s.trim()).filter(Boolean);
              else if(val && typeof val==='object') ids = Object.keys(val).filter(k=> val[k]);
              if(ids.length===0){
                const fromFb = fallbackMap.get(key);
                if(fromFb && fromFb.size) ids = [...fromFb];
              }
              const nomesArr = ids.map(id=> (eqById.get(String(id))||{}).nome || String(id)).filter(Boolean);
              const nomes = nomesArr.join(',');
              const safeNomes = String(nomes).replace(/"/g,'&quot;');
              return `<td class="p-0 text-center align-middle" style="width:${colWidth}px;"><div class="w-100" style="pointer-events:auto"><input type="text" class="form-control form-control-sm text-center matriz-input matriz-input-mini" data-key="${key}" value="${safeNomes}" style="font-size:.55rem;padding:.15rem .25rem;width:50%;" /></div></td>`;
            } else {
              // Normalizar val para lista de IDs; se vazio, usar fallback derivado de eq.alocacoes
              let ids = [];
              if(Array.isArray(val)) ids = val.map(x=> String(x));
              else if(typeof val==='string') ids = val.split(',').map(s=> s.trim()).filter(Boolean);
              else if(val && typeof val==='object') ids = Object.keys(val).filter(k=> val[k]);
              if(ids.length===0){
                const fromFb = fallbackMap.get(key);
                if(fromFb && fromFb.size) ids = [...fromFb];
              }
              const nomes = ids.length? ids.map(id=> (eqById.get(String(id))||{}).nome || String(id)).filter(Boolean) : [];
              if(!nomes.length) return `<td class="text-center align-middle small" data-key="${key}" data-grupo-id="${g.id}" data-turno-ini="${hi}" data-turno-fim="${hf}" data-dia="${d}" style="width:${colWidth}px;">-</td>`;
              const links = nomes.map(n=> `<a href="#" class="matriz-eq-item d-block text-primary text-decoration-underline" data-eqnome="${n}" data-eq-nome="${n}" data-eq-id="${(function(){ const cand=[...eqById.values()].find(e=> String(e.nome)===String(n)); return cand? (cand.id||cand._id||'') : ''; })()}" style="cursor:pointer;line-height:1.05;">${n}</a>`).join('');
              return `<td class="text-center align-middle small" data-key="${key}" data-grupo-id="${g.id}" data-turno-ini="${hi}" data-turno-fim="${hf}" data-dia="${d}" style="width:${colWidth}px;">${links}</td>`;
            }
          }).join('');
          body += `</tr>`;
        });
        const faixas = turnos.map(t=> `${t.ini||'?'} às ${t.fim||'?'}`).join(' - ');
        // Removido: controles de "Preencher com" e botão "Aplicar"
        const fillControls = '';
        const headerBtns = `<div class="btn-group btn-group-sm">`
          + `<button type="button" class="btn btn-outline-primary" data-act="grupo-modo" data-grupo="${g.id}" ${(modo!=='edit' && !grupoTemDesbloqueio)? 'disabled title="Desbloqueie algum dia/turno para editar"':''}>${modo==='edit'? 'Modo consulta':'Modo edição'}</button>`
          + (modo==='edit'? `<button type="button" class="btn btn-outline-danger" data-act="grupo-limpar" data-grupo="${g.id}">Limpar alocações</button>`:'')
          + `</div>`;
        parts.push(`<div class="matriz-grupo mb-3 border rounded" data-grupo="${g.id}" data-any-unlocked="${grupoTemDesbloqueio? '1':'0'}">
          <div class="d-flex justify-content-between align-items-center p-2 bg-light border-bottom">
            <div class="text-truncate"><strong>${faixas||'(sem turnos)'}</strong></div>
            ${headerBtns}
          </div>
          <div class="table-responsive"><table class="table table-sm table-bordered mb-0 matriz-tabela" style="width:100%; table-layout: fixed;"><thead>${head1}${head2}</thead><tbody>${body||'<tr><td colspan="'+(datas.length+1)+'" class="text-center text-muted">(sem turnos)</td></tr>'}</tbody></table></div>
        </div>`);
      });
      cont.innerHTML = parts.join('');
      // Instalar cadeados de dia (cabeçalho) somente quando a escala está fechada
      try{
        if(isFechada()){
          const heads = cont.querySelectorAll('th.cadeado-dia');
          heads.forEach(th=>{
            const dia = th.getAttribute('data-dia'); if(!dia) return;
            const unlocked = isDiaUnlocked(dia);
            const img = unlocked? '/images/destrancado.png' : '/images/trancado.png';
            const title = unlocked? 'Dia desbloqueado para edição' : 'Dia bloqueado (clique para destravar)';
            const inner = th.textContent.trim();
            th.innerHTML = `<div class=\"d-flex flex-column justify-content-center align-items-center\" style=\"line-height:1;\">\n`
              + `  <span>${inner}</span>\n`
        + `  <a href=\"#\" data-act=\"toggle-cadeado-dia\" data-dia=\"${dia}\" title=\"${title}\" style=\"line-height:1; display:inline-flex; align-items:center; margin-top:2px;\">\n`
        + `    <img src=\"${img}\" alt=\"${unlocked? 'Destrancado':'Trancado'}\" style=\"width:32px;height:32px;display:block;\" />\n`
              + `  </a>\n`
              + `</div>`;
          });
        }
      }catch(_lock){ }
      // CSS de reforço para largura dos inputs = 50%
      try {
        if(!document.getElementById('escalaMatrizAba4Overrides')){
          const st=document.createElement('style'); st.id='escalaMatrizAba4Overrides';
          st.textContent = `
            #matrizAlocacao .matriz-grupo input.matriz-input.matriz-input-mini{ width:50% !important; margin: 0 auto; }
          `;
          document.head.appendChild(st);
        }
      } catch(_css){}
      // Se houver inputs, aplicar restrições
      try{ if(cont.querySelector('.matriz-input')) aplicarRestricoesInputsMatriz(cont); }catch(_inp){}

      // Evento para integrações (auto-switch de Recursos, etc.)
      try{ document.dispatchEvent(new CustomEvent('escala:matriz:renderizada', { detail:{ grupos: grupos.length, dias: datas.length } })); }catch(_evt){}
    }catch(_e){}
  }

  const ABA4 = {
    init(){
      const wrap = document.getElementById('matrizAlocacaoWrap');
      const matriz = document.getElementById('matrizAlocacao');
      if(!wrap || !matriz) return;
      // Bind global para alternar cadeado por dia
      try{
        if(!document.__boundToggleDiaUnlock){
          document.__boundToggleDiaUnlock = true;
          document.addEventListener('click', async (ev)=>{
            const a = ev.target && (ev.target.closest && ev.target.closest('a[data-act="toggle-cadeado-dia"]'));
            if(!a) return;
            ev.preventDefault();
            const dia = a.getAttribute('data-dia'); if(!dia) return;
            await loadUnlocks();
            const want = !isDiaUnlocked(dia);
            const res = await toggleDiaUnlock(dia, want);
            if(res && res.ok){ await loadUnlocks(); render(); }
            else { try{ alert('Falha ao '+(want?'desbloquear':'bloquear')+' o dia '+dia+'.'); }catch(_al){} }
          }, true);
        }
      }catch(_bind){ }
      // Expor render público
      if(typeof window.renderMatrizesPorGrupo !== 'function'){ window.renderMatrizesPorGrupo = function(){ render(); }; }
      // Render inicial e binds
      try{ render(); }catch(_r){}
      // Carregar estado de desbloqueios e re-renderizar cabeçalhos com ícones atualizados
  try{ loadUnlocks().then(()=>{ try{ render(); }catch(_rr){} }); }catch(_lu){}
      // Delegação para botões de cabeçalho
      try{
        document.addEventListener('click', async function(ev){
          const target = ev.target;
          const btn = target && (target.closest && target.closest('[data-act="grupo-modo"], [data-act="grupo-limpar"]'));
          // Clique-to-edit: se clicar numa célula em modo consulta, alterna o grupo para edição e foca o input correspondente
          if(!btn){
            const td = target && (target.closest && target.closest('td[data-key]'));
            if(td){
              const gidCell = td.getAttribute('data-grupo-id');
              const key = td.getAttribute('data-key');
              if(gidCell && key){
                const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
                const grupos = Array.isArray(st.gruposTurnos)? st.gruposTurnos: [];
                const g = grupos.find(x=> String(x.id)===String(gidCell));
                if(g && g.__modo!=='edit'){
                  // Só entra em modo edição se houver alguma alocação destrancada no grupo
                  const grupoElm = document.querySelector(`.matriz-grupo[data-grupo="${gidCell}"]`);
                  const anyUnlocked = grupoElm ? (grupoElm.getAttribute('data-any-unlocked')==='1') : hasAnyUnlockedForGroup(g, []);
                  if(!anyUnlocked){
                    try{ if(window.__toastInfoUI) window.__toastInfoUI('Edição bloqueada: destrave algum dia/turno para editar a matriz.'); else if(window.__toastInfo) window.__toastInfo('Edição bloqueada: destrave algum dia/turno para editar a matriz.'); }catch(_t){}
                    ev.preventDefault();
                    return;
                  }
                  g.__modo='edit';
                  render();
                  // Focar input da célula clicada se esta estiver destrancada; senão, foca o primeiro input do grupo
                  try{
                    let inp = document.querySelector(`input.matriz-input[data-key="${key}"]`);
                    if(!inp){
                      const scope = document.querySelector(`.matriz-grupo[data-grupo="${gidCell}"]`);
                      inp = scope && scope.querySelector('input.matriz-input');
                    }
                    if(inp){ inp.focus(); inp.select(); }
                  }catch(_f){}
                  ev.preventDefault();
                  return;
                }
              }
            }
            return; // não é botão
          }
          // Fluxo dos botões do cabeçalho
          const act = btn.getAttribute('data-act');
          const gid = btn.getAttribute('data-grupo');
          if(!gid) return;
          ev.preventDefault();
          // Respeitar estado disabled do botão Modo edição
          if(act==='grupo-modo' && (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled')==='true')){
            try{ if(window.__toastInfoUI) window.__toastInfoUI('Edição bloqueada: destrave algum dia/turno para editar a matriz.'); else if(window.__toastInfo) window.__toastInfo('Edição bloqueada: destrave algum dia/turno para editar a matriz.'); }catch(_t){}
            return;
          }
          try{
            const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
            const grupos = Array.isArray(st.gruposTurnos)? st.gruposTurnos: [];
            const g = grupos.find(x=> String(x.id)===String(gid)); if(!g) return;
            if(act==='grupo-modo'){
              // Se for abrir modo edição, exigir que exista alguma alocação destrancada
              if(g.__modo!=='edit'){
                const grupoElm = document.querySelector(`.matriz-grupo[data-grupo="${gid}"]`);
                const anyUnlocked = grupoElm ? (grupoElm.getAttribute('data-any-unlocked')==='1') : hasAnyUnlockedForGroup(g, []);
                if(!anyUnlocked){
                  try{ if(window.__toastInfoUI) window.__toastInfoUI('Edição bloqueada: destrave algum dia/turno para editar a matriz.'); else if(window.__toastInfo) window.__toastInfo('Edição bloqueada: destrave algum dia/turno para editar a matriz.'); }catch(_t){}
                  return;
                }
              }
              const container = document.querySelector(`.matriz-grupo[data-grupo="${gid}"]`) || document.getElementById('matrizAlocacao');
              const indoParaConsulta = (g.__modo==='edit');
              if(indoParaConsulta){
                // Validação inline
                const inputs=[...(container||document).querySelectorAll('input.matriz-input[data-key]')];
                const existentes = new Set((st.equipes||[]).map(e=> String((e.nome||'').toUpperCase())));
                const normalizar = (s)=>{ let t=String(s||'').toUpperCase().trim(); const idx=t.indexOf(' - '); if(idx>0) t=t.slice(0,idx).trim(); t=t.replace(/\s+/g,' '); return t; };
                const invalidTokens=[];
                inputs.forEach(inp=>{ const valor=String(inp.value||'').trim(); if(!valor) return; const tokens = valor.split(/\s*,\s*/).filter(Boolean); tokens.forEach(t=>{ const norm=normalizar(t); if(!existentes.has(norm)) invalidTokens.push(t); }); });
                if(invalidTokens.length){ alert('As seguintes equipes não existem: '+invalidTokens.join(', ')+'.\nCorrija os campos destacados.'); return; }
                // Atualizar estado inline
                const mapaNome = new Map((st.equipes||[]).map(e=> [String((e.nome||'').toUpperCase()), e.id||e._id||'']));
                const nomesParaIds=(valor)=>{ return String(valor||'').split(/\s*,\s*/).map(t=>{ let x=String(t||'').toUpperCase().trim(); const i=x.indexOf(' - '); if(i>0) x=x.slice(0,i).trim(); x=x.replace(/\s+/g,' '); return mapaNome.get(x)||''; }).filter(Boolean); };
                st.matrizAlocacao = st.matrizAlocacao || {};
                inputs.forEach(inp=>{ const key=inp.getAttribute('data-key'); if(!key) return; const ids = nomesParaIds(String(inp.value||'')); if(ids.length) st.matrizAlocacao[key]=ids.join(','); else delete st.matrizAlocacao[key]; });
                g.__modo = 'view';
                try{ document.dispatchEvent(new CustomEvent('escala:alocacao:alterada', { detail:{ grupoId: gid } })); }catch(_evt){}
                // Persistir no servidor: matriz e disponibilidade por equipe do grupo
                try{ await salvarGrupo(gid); }catch(_persist){}
              } else {
                g.__modo = 'edit';
              }
              render();
            } else if(act==='grupo-limpar'){
              if(!confirm('Apagar TODAS as alocações deste grupo?')) return;
              try{
                const aloc = (st.matrizAlocacao = st.matrizAlocacao || {});
                Object.keys(aloc).forEach(k=>{ if(k.startsWith(String(gid)+'::')) delete aloc[k]; });
              }catch(_){ }
              try{ document.dispatchEvent(new CustomEvent('escala:alocacao:alterada', { detail:{ grupoId: gid, cleared:true } })); }catch(_evt){}
              render();
            }
          }catch(_h){}
        }, true);
      }catch(_bind){}
      try{
        document.addEventListener('shown.bs.tab', function(ev){ try{ const el=ev?.target; const target=(el?.getAttribute && (el.getAttribute('data-bs-target')||el.getAttribute('href'))) || el?.dataset?.bsTarget || ''; if(target==='#aba-alocacao' || target==='aba-alocacao') render(); }catch(_e){} });
      }catch(_bind){}
      try{ document.addEventListener('escala:carregada', ()=> render()); }catch(_evt){}
      try{ document.addEventListener('escala:equipes-alteradas', ()=> render()); }catch(_evt2){}
      try{ document.addEventListener('escala:fechada', ()=> {
        try{
          // Zerar cache de desbloqueios e forçar recarga, garantindo fechamento efetivo na UI
          __UNLOCKS__ = null;
          // Retornar todos os grupos para modo consulta ao fechar
          const st = (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {});
          if(Array.isArray(st.gruposTurnos)){
            st.gruposTurnos.forEach(g=>{ try{ g.__modo='view'; }catch(_m){} });
          }
          loadUnlocks(true).then(()=>render());
        }catch(_){ render(); }
      }); }catch(_evt3){}
    }
  };
  window.ABA4 = ABA4;
})();
