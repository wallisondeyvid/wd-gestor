(function(){
  // Utilitários locais leves (sem depender do monolítico)
  function basePath(){
    try { return (window.__ESCALA_BASE_PATH__ || document.body?.dataset?.basePath || '/escalas'); } catch(_){ return '/escalas'; }
  }
  function getEscalaState(){ try { return (window.__ESCALA_STATE__ = window.__ESCALA_STATE__ || {}); } catch(_){ return {}; } }
  function getEscalaId(){
    const st = getEscalaState();
    if(st.escalaId) return String(st.escalaId);
    try { const u = new URL(location.href); const id = u.searchParams.get('id'); if(id) return String(id); } catch(_){ }
    return '';
  }
  function dateISOToBr(v){ try { return (window.dateISOToBr? window.dateISOToBr(v) : (String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/)? RegExp.$3+'/'+RegExp.$2+'/'+RegExp.$1 : '')); } catch(_){ return ''; } }
  function dateBrToISO(v){
    try {
      if(window.dateBrToISO) return window.dateBrToISO(v);
      const m=String(v||'').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m? `${m[3]}-${m[2]}-${m[1]}` : '';
    } catch(_){ return ''; }
  }

  async function executarValidacaoConflitos(){
    (async()=>{
      try {
        const btn = document.getElementById('btnValidarEscala');
        // Garante container
        const tab = document.getElementById('aba-validacao') || document.body;
        let cont = document.getElementById('validacaoResultados');
        if(!cont){ cont = document.createElement('div'); cont.id='validacaoResultados'; tab.appendChild(cont); }
        // UI inicial
        cont.innerHTML = '<div id="validacaoStatus" class="small text-muted mb-1">Preparando validação…</div>'+
                         '<div class="progress" style="height:6px"><div id="validacaoBar" class="progress-bar progress-bar-striped progress-bar-animated" style="width:0%"></div></div>'+
                         '<div id="validacaoResumo" class="mt-2"></div>';
        const statusEl = document.getElementById('validacaoStatus');
        const barEl = document.getElementById('validacaoBar');
        let lastUpd = 0;
        function setProgress(stageLabel, done, total){
          try{ const now=Date.now(); if(now-lastUpd<80) return; lastUpd=now; const pct = total>0? Math.min(100, Math.floor(done*100/total)) : 0; if(barEl) barEl.style.width=pct+'%'; if(statusEl) statusEl.textContent = `${stageLabel} ${done}/${total}`; }catch(_){ }
        }
        if(btn){ btn.disabled=true; btn.dataset._txt = btn.dataset._txt || btn.innerText; btn.innerText='Validando...'; }

        const st = getEscalaState();
        // Período
        let iniISO = st?.periodo?.ini || '';
        let fimISO = st?.periodo?.fim || '';
        if(!iniISO || !fimISO){
          try {
            const di = document.getElementById('dataInicio')?.value || '';
            const df = document.getElementById('dataFim')?.value || '';
            iniISO = dateBrToISO(di); fimISO = dateBrToISO(df);
          } catch(_){ }
        }
        if(!iniISO || !fimISO){ cont.innerHTML='<div class="alert alert-warning">Defina o período na aba Dados Gerais antes de validar.</div>'; if(btn){ btn.disabled=false; btn.innerText=btn.dataset._txt||'Validar Escala'; } return; }
        if(!Array.isArray(st.equipes) || st.equipes.length===0){ cont.innerHTML = '<div class="alert alert-warning">Cadastre ao menos uma equipe com componentes antes de validar.</div>'; if(btn){ btn.disabled=false; btn.innerText=btn.dataset._txt||'Validar Escala'; } return; }

        await new Promise(r=>setTimeout(r,0));

        const eqById = new Map(); (st.equipes||[]).forEach(e=>{ if(e&&e.id) eqById.set(String(e.id), e); });
        const checks = new Map();
        const warningsEmptyAlloc = [];
        const matriz = st.matrizAlocacao || {};
        const entriesMat = Object.entries(matriz);
        for(let i=0;i<entriesMat.length;i++){
          const [key, valor] = entriesMat[i];
          if(!valor){ if(i%200===0) await new Promise(r=>setTimeout(r,0)); continue; }
          const [turnoFull, diaISO] = String(key).split('|');
          const [_grupoId, faixa] = String(turnoFull||'').split('::');
          const m = (faixa||'').match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
          const ini = m? m[1]:''; const fim = m? m[2]:'';
          const eqIds = String(valor).split(',').map(s=>s.trim()).filter(Boolean);
          for(const eid of eqIds){
            const eq = eqById.get(String(eid));
            const comps = Array.isArray(eq?.componentes)? eq.componentes : [];
            if(comps.length===0){ warningsEmptyAlloc.push({ tipo:'alocacao-vazia', equipe: eq?.nome||eid, dia: diaISO, ini, fim }); }
            for(const c of comps){
              const funcId = c.funcionario_id || c.id || c._id || null; if(!funcId || !diaISO || !ini || !fim) continue;
              const k = String(funcId)+'|'+diaISO+'|'+ini+'|'+fim;
              if(!checks.has(k)) checks.set(k, { funcId, dia:diaISO, ini, fim, equipe: eq?.nome||null });
            }
          }
          if(i%200===0){ setProgress('Preparando dados', i, entriesMat.length); await new Promise(r=>setTimeout(r,0)); }
        }

        // Conflitos
        const severeConflicts = [];
        const total = checks.size; let done = 0;
        const bp = basePath();
        async function checkOne(ch){
          try {
            const q = new URLSearchParams({ funcionarioId:String(ch.funcId), dia:String(ch.dia), ini:String(ch.ini), fim:String(ch.fim) });
            const eid = getEscalaId(); if(eid) q.set('excludeId', eid);
            const url = bp+`/api/funcionario/conflitos-alocacao?`+q.toString();
            const r = await fetch(url, { credentials:'same-origin' });
            if(!r.ok) return;
            const js = await r.json().catch(()=>null);
            const confl = js && (js.conflito===true || (Array.isArray(js.matches) && js.matches.length>0));
            if(confl){ severeConflicts.push({ funcionarioId: ch.funcId, dia: ch.dia, ini: ch.ini, fim: ch.fim, equipe: ch.equipe||null, detalhes: (js && js.matches)||[] }); }
          } finally { done++; setProgress('Etapa 1/3 — Conflitos', done, total); }
        }
        async function tryBatchConflitos(arr){
          if(!Array.isArray(arr) || arr.length===0) return true;
          try {
            const eid = getEscalaId();
            const items = arr.map(ch=> ({ funcionarioId:String(ch.funcId), dia:String(ch.dia), ini:String(ch.ini), fim:String(ch.fim), clientKey: `${ch.funcId}|${ch.dia}|${ch.ini}|${ch.fim}` }));
            const resp = await fetch(bp+`/api/funcionarios/conflitos-alocacao/lote`, { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ excludeId: eid||undefined, items }) });
            if(!resp.ok) return false;
            const js = await resp.json().catch(()=>null); if(!js || !Array.isArray(js.results)) return false;
            const byClient = new Map(js.results.map(r=> [String(r.clientKey||r.key||''), r]));
            let i=0; for(const ch of arr){ const k = `${ch.funcId}|${ch.dia}|${ch.ini}|${ch.fim}`; const r = byClient.get(k); if(r && (r.conflito || (Array.isArray(r.matches)&&r.matches.length>0))){ severeConflicts.push({ funcionarioId: ch.funcId, dia: ch.dia, ini: ch.ini, fim: ch.fim, equipe: ch.equipe||null, detalhes: Array.isArray(r.matches)? r.matches : [] }); } i++; if(i%100===0){ setProgress('Etapa 1/3 — Conflitos', i, arr.length); await new Promise(rr=>setTimeout(rr,0)); } }
            setProgress('Etapa 1/3 — Conflitos', arr.length, arr.length);
            return true;
          } catch(_e){ return false; }
        }
        const arrChecks = Array.from(checks.values());
        let batchOk = false; if(arrChecks.length>0){ batchOk = await tryBatchConflitos(arrChecks); }
        if(!batchOk){ const concurrency=8; for(let i=0;i<arrChecks.length;i+=concurrency){ await Promise.all(arrChecks.slice(i,i+concurrency).map(ch=> checkOne(ch))); await new Promise(r=>setTimeout(r,0)); } }

        // Avisos de recursos sem atribuição
        const warningsRecursos = [];
        try {
          const recs = Array.isArray(st.recursos)? st.recursos: [];
          recs.forEach(r=>{
            const temAtrib = Array.isArray(r.atribuicoes)? r.atribuicoes.length>0 : false;
            const temAloc = r.matrizAlocacao && typeof r.matrizAlocacao==='object' && Object.keys(r.matrizAlocacao).length>0;
            if(!temAtrib && !temAloc){
              const placa = r.placa || r.codigo || '';
              const marca = r.marca || r.fabricante || '';
              const modelo = r.modelo || r.versao || '';
              const label = [placa, marca, modelo].filter(Boolean).join(' - ') || (r.nome || r.descricao || 'Recurso');
              warningsRecursos.push({ tipo:'recurso-sem-atribuicao', recurso: label, id: r.id||r._id||r.referenciaGestorId||'' });
            }
          });
        } catch(_){ }

        // Resumos: dias vazios e equipe vazia
        function gerarDias(iniISO, fimISO){ const out=[]; let d=new Date(iniISO+'T00:00:00'); const end=new Date(fimISO+'T00:00:00'); while(d<=end){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1);} return out; }
        const diasRange = gerarDias(iniISO, fimISO);
        const emptyAllocDays = new Set();
        const emptyPerTurno = new Map();
        const eqAllocDays = new Map();
        const grupos = Array.isArray(st.gruposTurnos)? st.gruposTurnos: [];
        let scanCount=0; const scanTotal = grupos.reduce((acc,g)=> acc + (Array.isArray(g.turnos)? g.turnos.length:0) * diasRange.length, 0);
        for(const grupo of grupos){
          const turnos = Array.isArray(grupo?.turnos)? grupo.turnos: [];
          for(const t of turnos){
            const turnoStr = `${t.ini}-${t.fim}`;
            for(const diaISO of diasRange){
              const key = `${grupo.id}::${turnoStr}|${diaISO}`;
              const val = String((st.matrizAlocacao||{})[key]||'').trim();
              if(!val){ emptyAllocDays.add(diaISO); if(!emptyPerTurno.has(turnoStr)) emptyPerTurno.set(turnoStr, new Set()); emptyPerTurno.get(turnoStr).add(diaISO); }
              scanCount++; if(scanCount%500===0){ setProgress('Pré-varredura', scanCount, Math.max(scanTotal,1)); await new Promise(r=>setTimeout(r,0)); }
            }
          }
        }
        Object.entries(st.matrizAlocacao||{}).forEach(([key, valor])=>{ const [_, diaISO] = String(key).split('|'); const val = String(valor||'').trim(); if(!val) return; const eqIds = val.split(',').map(s=>s.trim()).filter(Boolean); if(diaISO){ eqIds.forEach(eid=>{ if(!eqAllocDays.has(eid)) eqAllocDays.set(eid, new Set()); eqAllocDays.get(eid).add(diaISO); }); } });

        // Equipe efetivamente vazia (ninguém livre no dia)
        const dispCache = new Map();
        async function checkDisponibilidadeDia(funcId, diaISO){ const k=`${funcId}|${diaISO}`; if(dispCache.has(k)) return dispCache.get(k); let livre=false; try{ const url = bp+`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(funcId)}&inicio=${diaISO}&fim=${diaISO}`; const r=await fetch(url,{credentials:'same-origin'}); if(r.ok){ const js=await r.json().catch(()=>null); const dados = js && (js.data||js) || {}; const arr = Array.isArray(dados.free)? dados.free : (Array.isArray(js?.free)? js.free : []); livre = Array.isArray(arr) && arr.some(int=> String(int.inicio).slice(0,10)<=diaISO && String(int.fim).slice(0,10)>=diaISO); } }catch(_){ } dispCache.set(k,livre); return livre; }
        const equipeVaziaPorDia = new Map();
        // Pré-carregar disponibilidade em lote
        try {
          const needPairs = new Map();
          for(const [key, valor] of Object.entries(st.matrizAlocacao||{})){
            const [turnoFull, diaISO] = String(key).split('|'); if(!diaISO) continue; const val = String(valor||'').trim(); if(!val) continue;
            const eqIds = val.split(',').map(s=>s.trim()).filter(Boolean);
            for(const eid of eqIds){ const eq = eqById.get(String(eid)); const comps = Array.isArray(eq?.componentes)? eq.componentes : []; for(const c of comps){ const fid = c.funcionario_id || c.id || c._id; if(!fid) continue; const k = `${fid}|${diaISO}`; if(!dispCache.has(k)) needPairs.set(k, { funcionarioId: fid, dia: diaISO }); } }
          }
          const items = Array.from(needPairs.values());
          if(items.length){ setProgress('Etapa 2/3 — Disponibilidade (pré-carregando)', 0, items.length); const resp = await fetch(bp+`/api/funcionarios/disponibilidade`, { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ items }) }); if(resp.ok){ const js = await resp.json().catch(()=>null); const arr = Array.isArray(js?.results)? js.results : []; let i=0; for(const r of arr){ const k = `${r.funcionarioId||''}|${r.dia||''}`; if(r && typeof r.livre==='boolean') dispCache.set(k, !!r.livre); i++; if(i%200===0){ setProgress('Etapa 2/3 — Disponibilidade (pré-carregando)', i, arr.length); await new Promise(rr=>setTimeout(rr,0)); } } setProgress('Etapa 2/3 — Disponibilidade (pré-carregando)', items.length, items.length); } }
        } catch(_){ }
        // Verificar por célula alocada
        const entriesMatriz = Object.entries(st.matrizAlocacao||{});
        let step2Done=0; const step2Total = entriesMatriz.reduce((acc,[key,valor])=>{ const val=String(valor||'').trim(); if(!val) return acc; const eqIds=val.split(',').map(s=>s.trim()).filter(Boolean); return acc+eqIds.length; },0);
        for(const [key, valor] of entriesMatriz){
          const [turnoFull, diaISO] = String(key).split('|'); if(!diaISO) continue;
          const eqIds = String(valor||'').split(',').map(s=>s.trim()).filter(Boolean);
          for(const eid of eqIds){
            const eq = eqById.get(String(eid)); const eqNome = (eq && (eq.nome||eq.codigo)) || String(eid); const comps = Array.isArray(eq?.componentes)? eq.componentes : [];
            if(comps.length===0){ if(!equipeVaziaPorDia.has(eqNome)) equipeVaziaPorDia.set(eqNome, new Set()); equipeVaziaPorDia.get(eqNome).add(diaISO); step2Done++; setProgress('Etapa 2/3 — Disponibilidade', step2Done, Math.max(step2Total,1)); continue; }
            let algumLivre=false; for(const c of comps){ const fid=c.funcionario_id||c.id||c._id; if(!fid) continue; const ok = await checkDisponibilidadeDia(fid, diaISO); if(ok){ algumLivre=true; break; } }
            if(!algumLivre){ if(!equipeVaziaPorDia.has(eqNome)) equipeVaziaPorDia.set(eqNome, new Set()); equipeVaziaPorDia.get(eqNome).add(diaISO); }
            step2Done++; setProgress('Etapa 2/3 — Disponibilidade', step2Done, Math.max(step2Total,1)); if(step2Done%25===0) await new Promise(r=>setTimeout(r,0));
          }
        }
        const diasEquipeVaziaSet = new Set(Array.from(equipeVaziaPorDia.values()).flatMap(s=> Array.from(s)));
        const diasVaziosGeral = new Set([...emptyAllocDays, ...diasEquipeVaziaSet]);
        // Recursos: dias sem atribuição quando equipe alocou
        const recursosResumo = [];
        try {
          const recs = Array.isArray(st.recursos)? st.recursos: [];
          const idToEqNome = new Map((st.equipes||[]).map(e=> [String(e.id), e.nome||e.codigo||'EQ']));
          function extrairDiasAtrib(r){ const s=new Set(); (r.atribuicoes||[]).forEach(a=>{ const d=(a&&(a.dia||a.dataISO||a.data||a.inicio||a.start||'')).toString().slice(0,10); if(d) s.add(d); }); return s; }
          recs.forEach(r=>{ const eqId = r.equipeId || r.equipe_id || (r.equipe && (r.equipe.id||r.equipe._id)) || null; if(!eqId) return; const diasEq = eqAllocDays.get(String(eqId)); if(!diasEq || diasEq.size===0) return; const atribu = extrairDiasAtrib(r); const faltantes = Array.from(diasEq).filter(d=> !atribu.has(d)); if(faltantes.length){ const placa=r.placa||r.codigo||''; const marca=r.marca||r.fabricante||''; const modelo=r.modelo||r.versao||''; const label=[placa,marca,modelo].filter(Boolean).join(' - ') || (r.nome||r.descricao||'Recurso'); recursosResumo.push({ recurso: label, dias: faltantes.sort() }); } });
        } catch(_){ }
        const resumoVaziosPorTurno = Array.from(emptyPerTurno.entries()).map(([turno,setDias])=> ({ turno, dias: Array.from(setDias).sort() }));

        // Resolver nomes e renderizar
        const nomeCache = new Map();
        async function resolveFuncionarioNome(fid){ if(!fid) return String(fid||''); if(nomeCache.has(fid)) return nomeCache.get(fid); try { for(const e of (st.equipes||[])){ for(const c of (e.componentes||[])){ const idCand = c.funcionario_id || c.id || c._id; if(String(idCand)===String(fid)){ const nome = c.nome || c.descricao || c.label || String(fid); nomeCache.set(fid, nome); return nome; } } } } catch(_){ } try { const url=bp+`/api/funcionarios/busca-codigo?id=${encodeURIComponent(String(fid))}`; const r=await fetch(url,{credentials:'same-origin'}); if(r.ok){ const js=await r.json().catch(()=>null); const nome=js?.data?.nome || js?.data?.descricao || null; if(nome){ nomeCache.set(fid,nome); return nome; } } } catch(_){ } const fb=String(fid); nomeCache.set(fid,fb); return fb; }
        const grupoPorFunc = new Map();
        severeConflicts.forEach(c=>{ const fid=c.funcionarioId; if(!fid) return; if(!grupoPorFunc.has(fid)) grupoPorFunc.set(fid,{ funcionarioId:fid, conflitos:[], escalasSet:new Set() }); const g=grupoPorFunc.get(fid); g.conflitos.push(c); const mats=Array.isArray(c.detalhes)? c.detalhes:[]; mats.forEach(m=>{ const sid = m?.escalaId || m?.id || m?.escala?._id || m?.escala?.id || null; if(sid) g.escalasSet.add(String(sid)); }); });
        const funcs = Array.from(grupoPorFunc.values());
        async function withConcurrency(items, fn, k=8){ for(let i=0;i<items.length;i+=k){ await Promise.all(items.slice(i,i+k).map(fn)); } }
        await withConcurrency(funcs.map(f=> f.funcionarioId), async (fid)=>{ const nome = await resolveFuncionarioNome(fid); const obj = grupoPorFunc.get(fid); if(obj){ obj.funcionarioNome = nome; } });

        renderResultadosValidacaoAgrupado({
          groups: funcs.map(f=> ({ funcionarioId: f.funcionarioId, funcionarioNome: f.funcionarioNome || String(f.funcionarioId), conflitos: f.conflitos, escalaInfos: [] })),
          totalConflicts: severeConflicts.length,
          warningsEmptyAlloc,
          warningsRecursos,
          resumoDiasVazios: Array.from(diasVaziosGeral).sort(),
          resumoEquipeVazia: Array.from(equipeVaziaPorDia.entries()).map(([eqNome,setDias])=> ({ equipe:eqNome, dias: Array.from(setDias).sort() })),
          resumoRecursosDias: recursosResumo,
          resumoVaziosPorTurno
        });

        if(btn){ btn.disabled=false; btn.innerText=btn.dataset._txt||'Validar Escala'; }
      } catch(e){
        console.error('[validacao] falha', e);
        try { const cont = document.getElementById('validacaoResultados'); if(cont) cont.innerHTML = '<div class="alert alert-danger">Erro durante a validação: '+String(e.message||e)+'</div>'; } catch(_h){}
        const btn = document.getElementById('btnValidarEscala'); if(btn){ btn.disabled=false; btn.innerText=btn.dataset._txt||'Validar Escala'; }
      }
    })();
  }

  function renderResultadosValidacaoAgrupado({ groups, totalConflicts, warningsEmptyAlloc, warningsRecursos, resumoDiasVazios, resumoEquipeVazia, resumoRecursosDias, resumoVaziosPorTurno }){
    try {
      const cont = document.getElementById('validacaoResultados'); if(!cont) return;
      const temBloqueio = (Array.isArray(groups) && groups.some(g=> Array.isArray(g.conflitos) && g.conflitos.length>0));
      let html = '';
      if(temBloqueio){
        html += `<div class="alert alert-danger"><strong>Conflitos encontrados (${totalConflicts})</strong><br><span class="small">Existem funcionários alocados em outra escala no mesmo dia/faixa. Corrija para prosseguir.</span></div>`;
        // tabela por funcionário
        groups.forEach(g=>{
          if(!g.conflitos || !g.conflitos.length) return;
          html += `<div class="mb-2"><div class="fw-semibold">${g.funcionarioNome||g.funcionarioId}</div>`;
          html += '<div class="table-responsive"><table class="table table-sm table-bordered align-middle"><thead class="table-light"><tr><th class="text-center">Data</th><th class="text-center">Turno</th><th class="text-center">Equipe</th></tr></thead><tbody>'+
            g.conflitos.map(c=>`<tr><td class="text-center">${dateISOToBr(c.dia)}</td><td class="text-center">${c.ini} - ${c.fim}</td><td class="text-center">${c.equipe||'-'}</td></tr>`).join('')+
          '</tbody></table></div></div>';
        });
      } else {
        html += '<div class="alert alert-success"><strong>Sem conflitos bloqueantes.</strong> Você pode fechar a escala.</div>';
      }
      // Avisos
      const temAvisos = (Array.isArray(warningsEmptyAlloc)&&warningsEmptyAlloc.length>0) || (Array.isArray(warningsRecursos)&&warningsRecursos.length>0);
      if(temAvisos){
        html += '<div class="alert alert-warning"><strong>Avisos (não bloqueiam)</strong></div>';
        if(Array.isArray(warningsEmptyAlloc) && warningsEmptyAlloc.length){
          html += '<div class="mb-2"><div class="fw-semibold small mb-1">Alocações com equipe vazia ('+warningsEmptyAlloc.length+')</div>';
          html += '<ul class="small mb-2">'+warningsEmptyAlloc.slice(0,400).map(a=>`<li>${a.equipe} — ${dateISOToBr(a.dia)} ${a.ini}-${a.fim}</li>`).join('')+'</ul></div>';
        }
        if(Array.isArray(warningsRecursos) && warningsRecursos.length){
          html += '<div class="mb-2"><div class="fw-semibold small mb-1">Recursos sem atribuições ('+warningsRecursos.length+')</div>';
          html += '<ul class="small mb-2">'+warningsRecursos.slice(0,400).map(r=>`<li>${r.recurso}</li>`).join('')+'</ul></div>';
        }
      }
      // Resumos adicionais
      if(Array.isArray(resumoDiasVazios) && resumoDiasVazios.length){ html += '<div class="mt-3"><div class="fw-semibold">Dias com alocação vazia (qualquer motivo)</div><div class="small">'+ resumoDiasVazios.map(d=> dateISOToBr(d)).join(', ') +'</div></div>'; }
      if(Array.isArray(resumoVaziosPorTurno) && resumoVaziosPorTurno.length){ html += '<div class="mt-2"><div class="fw-semibold">Células vazias por turno</div>'+ resumoVaziosPorTurno.map(x=> `<div class="small">${x.turno}: ${x.dias.map(d=> dateISOToBr(d)).join(', ')}</div>`).join('') +'</div>'; }
      if(Array.isArray(resumoEquipeVazia) && resumoEquipeVazia.length){ html += '<div class="mt-2"><div class="fw-semibold">Equipes sem efetivo disponível (por dia)</div>'+ resumoEquipeVazia.map(x=> `<div class="small">${x.equipe}: ${x.dias.map(d=> dateISOToBr(d)).join(', ')}</div>`).join('') +'</div>'; }
      if(Array.isArray(resumoRecursosDias) && resumoRecursosDias.length){ html += '<div class="mt-2"><div class="fw-semibold">Recursos sem atribuição em dias alocados</div>'+ resumoRecursosDias.map(x=> `<div class="small">${x.recurso}: ${x.dias.map(d=> dateISOToBr(d)).join(', ')}</div>`).join('') +'</div>'; }

      if(!temBloqueio){ html += '<div class="mt-3 text-end"><button class="btn btn-outline-success" id="btnFecharEscala"><i class="bi bi-lock-fill"></i> Fechar</button></div>'; }
      cont.innerHTML = html;
      const btnF = document.getElementById('btnFecharEscala');
      if(btnF){ btnF.addEventListener('click', async ()=>{ try { if(typeof window.fecharEscala==='function'){ await window.fecharEscala(); } else { await fecharEscala(); } } catch(_e){} }); }
    } catch(e){ console.warn('[validacao][render] erro', e); }
  }

  // Implementação de fechamento (PUT status='fechada'), com fallbacks
  async function fecharEscala(){
    try {
      const st = getEscalaState();
      const escalaId = getEscalaId();
      if(!escalaId){ alert('ID da escala não encontrado. Salve os dados antes de fechar.'); return; }
      const btn = document.getElementById('btnFecharEscala'); if(btn){ btn.disabled=true; btn.dataset._txt=btn.dataset._txt||btn.innerText; btn.innerText='Fechando...'; }
      const body = { status: 'fechada' };
      async function tryPut(u){
        try { return await fetch(u, { method:'PUT', headers:{ 'Content-Type':'application/json','Accept':'application/json' }, credentials:'same-origin', body: JSON.stringify(body) }); }
        catch(_e){ return { ok:false, status:-1, text: async()=>'' }; }
      }
      const bp = basePath();
      // Preferir endpoint dedicado de status para reduzir erros 400
      const triesStatus = [ `${bp}/api/escalas/${encodeURIComponent(escalaId)}/status`, `/api/escalas/${encodeURIComponent(escalaId)}/status` ];
      let ok=false, last=null;
      for(const u of triesStatus){ const r=await tryPut(u); last=r; if(r && r.ok){ ok=true; break; } }
      // Fallback para rota geral (compat)
      if(!ok){
        const triesGeneral = [ `${bp}/api/escalas/${encodeURIComponent(escalaId)}`, `/api/escalas/${encodeURIComponent(escalaId)}` ];
        for(const u of triesGeneral){ const r=await tryPut(u); last=r; if(r && r.ok){ ok=true; break; } }
      }
      if(!ok){
        const txt = last && (await (last.text?.().catch(()=>''))) || '';
        alert('Não foi possível fechar a escala.' + (txt? ('\n'+txt):''));
        if(btn){ btn.disabled=false; btn.innerText = btn.dataset._txt||'Fechar'; }
        return;
      }
      // Sucesso
      try { st.status = 'fechada'; window.__ESCALA_STATE__ = st; } catch(_){ }
      const cont = document.getElementById('validacaoResultados');
      if(cont){ cont.insertAdjacentHTML('afterbegin','<div class="alert alert-success">Escala fechada com sucesso.</div>'); }
      // Desabilitar campos gerais, se disponível
      try { if(typeof window.bloquearCamposGerais==='function') window.bloquearCamposGerais(true); } catch(_b){}
      // Atualizar botão
      const btnF = document.getElementById('btnFecharEscala');
      if(btnF){ btnF.classList.remove('btn-outline-success'); btnF.classList.add('btn-success'); btnF.disabled=true; btnF.innerHTML = '<i class="bi bi-lock-fill"></i> Fechada'; }
      // Sinalizar para outros módulos
      try { document.dispatchEvent(new CustomEvent('escala:fechada', { detail:{ id: escalaId } })); } catch(_e){}
    } catch(e){
      alert('Erro ao fechar: '+String(e&&e.message||e));
    }
  }

  const ABA6 = {
    init(){
      // Nada a renderizar: o markup é server-render nas views.
      const btn = document.getElementById('btnValidarEscala');
      if(!btn) return;
      if(!btn.__bound){
        btn.__bound = true;
        btn.addEventListener('click', function(){ setTimeout(()=>{ try { if(typeof window.executarValidacaoConflitos==='function') window.executarValidacaoConflitos(); } catch(_e){} }, 0); });
      }
      // Garante contêiner
      const tab = document.getElementById('aba-validacao');
      if(tab && !tab.querySelector('#validacaoResultados')){ const box=document.createElement('div'); box.id='validacaoResultados'; box.className='mt-3'; tab.appendChild(box); }
    }
  };

  // Expor a função completa (sobrepõe o stub se já existir)
  try { window.executarValidacaoConflitos = executarValidacaoConflitos; } catch(_){ }
  try { window.fecharEscala = fecharEscala; } catch(_){ }
  window.ABA6 = ABA6;
})();
