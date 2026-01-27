(function(){
  // Módulo para modais auxiliares (detalhamento equipe/dia, etc.)
  function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
  function esc(s){ return String(s||'').replace(/</g,'&lt;'); }
  function fmtCodigo(raw){ try{ let v=String(raw||'').trim(); if(!v) return '-'; const up=v.toUpperCase(); if(/^FUNC\d+$/i.test(up)) return up; const digits=v.replace(/\D/g,''); if(digits) return 'FUNC'+digits.padStart(5,'0'); return up; }catch(_){ return String(raw||'-'); } }
  function normCodeKey(v){ try{ const s=String(v||'').trim().toUpperCase(); if(!s) return ''; if(/^FUNC\d+$/i.test(s)) return s; const digits=s.replace(/\D/g,''); return digits? ('FUNC'+digits): s; }catch(_){ return String(v||'').trim().toUpperCase(); } }
  function isHex24(v){ return typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v); }
  async function fetchFuncionariosCluster(){
    try{
      const st = window.__ESCALA_STATE__ || {}; const uid = st?.dadosGerais?.unidadeId || document.getElementById('unidadeEscala')?.value || '';
      const urls=[]; if(uid){ urls.push(bp()+`/api/funcionarios-responsaveis?unidade=${encodeURIComponent(uid)}&incluirFiliais=1`); urls.push(`/api/funcionarios-responsaveis?unidade=${encodeURIComponent(uid)}&incluirFiliais=1`); }
      urls.push(bp()+`/api/funcionarios-responsaveis?incluirFiliais=1`); urls.push(`/api/funcionarios-responsaveis?incluirFiliais=1`);
      for(const u of urls){ try{ const r=await fetch(u,{credentials:'same-origin'}); if(r.ok){ const j=await r.json(); if(Array.isArray(j.data)) return j.data; } }catch(_e){} }
    }catch(_){ }
    return [];
  }

  async function preencherModalDetalhamentoFallback(modal, ctx){
    try{
      const st = window.__ESCALA_STATE__ || {};
      const tbody = modal.querySelector('#tabelaDetalhamentoEquipeDia tbody'); if(!tbody) return;
      const equipes = Array.isArray(st.equipes)? st.equipes: [];
      let eq = equipes.find(e=> String(e.id||e._id)===String(ctx.equipeId));
      if(!eq && ctx.equipeNome){ const alvo=String(ctx.equipeNome||'').trim().toUpperCase(); eq=equipes.find(e=> String((e.nome||'').toUpperCase())===alvo); }
      // Preencher cabeçalho do modal imediatamente (mesmo se não houver atribuições)
      const per = st.periodo || {}; const fmtBr=(iso)=>{ if(!iso) return ''; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m? `${m[3]}/${m[2]}/${m[1]}`:''; };
      const elPer=modal.querySelector('#detEqDiaPeriodo'); if(elPer) elPer.textContent = (per.ini&&per.fim)? `${fmtBr(per.ini)} a ${fmtBr(per.fim)}` : '-';
      const elEq=modal.querySelector('#detEqDiaEquipe'); if(elEq) elEq.textContent = ctx.equipeNome || (eq?.nome || '-') ;
      const elDia=modal.querySelector('#detEqDiaData'); if(elDia) elDia.textContent = fmtBr(ctx.dataISO) || '-';
      const elTur=modal.querySelector('#detEqDiaTurno'); if(elTur) elTur.textContent = (ctx.turnoIni&&ctx.turnoFim)? `${ctx.turnoIni} às ${ctx.turnoFim}` : '-';
      // Buscar recursos da equipe e filtrar por atribuições do dia/turno
      function parseRangeFromToken(raw){
        try{
          if(!raw) return null;
          let s=String(raw);
          // Se vier com prefixo tipo "T1::", pegar só o sufixo
          if(s.includes('::')) s = s.split('::').slice(-1)[0];
          // Normalizar diferentes hífens (– — − ‑ ‒) e o conector "às"/"as"
          s = s.replace(/\s+(às|as|a)\s+/i, ' - ');
          s = s.replace(/[–—−‑‒]/g, '-');
          const m = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/.exec(s);
          if(m) return { ini:m[1], fim:m[2] };
        }catch(_){ }
        return null;
      }
      function matchTurno(a, ini, fim){
        try{
          const t = String(a?.turnoId||a?.turno||'');
          // Tentar via token normalizado
          const pr = parseRangeFromToken(t); if(pr) return pr.ini===ini && pr.fim===fim;
          // Fallback: campos separados
          const ii=String(a?.turnoIni||a?.ini||a?.horaInicio||a?.inicio||''); const ff=String(a?.turnoFim||a?.fim||a?.horaFim||a?.termino||''); if(ii && ff) return ii===ini && ff===fim;
        }catch(_e){}
        return false;
      }
      function sameRangeToken(token, ini, fim){
        try{ const pr = parseRangeFromToken(token); return !!(pr && pr.ini===ini && pr.fim===fim); }catch(_){ return false; }
      }
      function recursoAlocadoNoTurno(recurso, dia, ini, fim){
        try{
          // 1) Array alocacoes
          const arr = Array.isArray(recurso?.alocacoes)? recurso.alocacoes: [];
          if(arr.some(a=> a && String(a.dia)===String(dia) && sameRangeToken(a.turnoId||a.turno, ini, fim))) return true;
          // 2) Mapa legado alocacoesRecurso
          const map = (recurso && recurso.alocacoesRecurso && typeof recurso.alocacoesRecurso==='object') ? recurso.alocacoesRecurso : null;
          if(map){
            for(const [key] of Object.entries(map)){
              const parts=String(key).split('__'); if(parts.length!==2) continue; const dKey=parts[0], tKey=parts[1]; if(dKey!==dia) continue; if(sameRangeToken(tKey, ini, fim)) return true;
            }
          }
        }catch(_){ }
        return false;
      }
      const diaSel = String(ctx.dataISO||'').slice(0,10); const iniSel=String(ctx.turnoIni||'').slice(0,5); const fimSel=String(ctx.turnoFim||'').slice(0,5);
      let recursos = Array.isArray(st.recursos)? st.recursos: [];
      if(!recursos.length){
        try{
          const idParam=(function(){ try{ const u=new URL(location.href); return u.searchParams.get('id'); }catch(_){ return null; } })();
          // Tentar lista achatada; se falhar, tentar só da equipe
          const urls=idParam? [ bp()+`/api/escalas/${encodeURIComponent(idParam)}/recursos`, `/api/escalas/${encodeURIComponent(idParam)}/recursos` ]: [];
          for(const u of urls){ try{ const r=await fetch(u,{credentials:'same-origin'}); if(!r.ok) continue; const j=await r.json(); if(Array.isArray(j?.data)) { recursos=j.data; break; } }catch(_e){} }
          if((!recursos || !recursos.length) && idParam){
            const eid = (eq?.id || ctx.equipeId || '').toString();
            if(eid){ const urlsEq=[ bp()+`/api/escalas/${encodeURIComponent(idParam)}/equipes/${encodeURIComponent(eid)}/recursos`, `/api/escalas/${encodeURIComponent(idParam)}/equipes/${encodeURIComponent(eid)}/recursos` ];
              for(const u of urlsEq){ try{ const r=await fetch(u,{credentials:'same-origin'}); if(!r.ok) continue; const j=await r.json(); if(Array.isArray(j?.data)) { recursos=j.data; break; } }catch(_e){} }
            }
          }
        }catch(_){ }
      }
      const eqId = eq?.id || ctx.equipeId;
      const recsDaEq = (Array.isArray(recursos)? recursos: []).filter(r=> String(r.equipeId||r.equipe_id||r.equipe?.id||'')===String(eqId));
  const atribuicoes = [];
      const seen = new Set(); // evitar duplicados por fid
      recsDaEq.forEach(r=>{
        const recAlocado = recursoAlocadoNoTurno(r, diaSel, iniSel, fimSel);
        // 1) Atribuições em array
        (Array.isArray(r.atribuicoes)? r.atribuicoes: []).forEach(a=>{
          const diaOK = (a?.dia===diaSel) || (a?.data===diaSel) || (!a?.dia && recAlocado);
          const turnoOK = matchTurno(a, iniSel, fimSel) || (!a?.turno && recAlocado);
          if(diaOK && turnoOK){ const fid=a.id||a.funcionarioId||a.funcionario_id||a.membroFuncionarioId||(a.funcionario&&(a.funcionario.id||a.funcionario._id))||a.matricula||a.codigo||''; if(!fid) return; if(seen.has(String(fid))) return; seen.add(String(fid)); const nome=a.nome||a.nomeFuncionario||a.funcionarioNome||(a.funcionario&&(a.funcionario.nome||a.funcionario.descricao))||''; const cod=a.matricula||a.codigo||a.cpf||''; atribuicoes.push({ fid, nome, cod }); }
        });
        // 2) Mapa legado atribuicoesRecurso { 'YYYY-MM-DD__token' : [ { funcionarioId, nome, ... } ] }
        try{
          const map = (r && r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object') ? r.atribuicoesRecurso : null;
          if(map){
            for(const [key, lista] of Object.entries(map)){
              const parts=String(key).split('__'); if(parts.length!==2) continue; const dKey=parts[0], tKey=parts[1]; if(dKey!==diaSel) continue; if(!sameRangeToken(tKey, iniSel, fimSel)) continue;
              if(Array.isArray(lista)){
                for(const it of lista){ if(!it) continue; const fid=it.membroFuncionarioId||it.funcionarioId||it.funcionario_id||it.funcionario||it.matricula||it.id||''; if(!fid) continue; if(seen.has(String(fid))) continue; seen.add(String(fid)); const nome=it.nome||it.funcionarioNome||''; const cod=it.matricula||it.codigo||''; atribuicoes.push({ fid, nome, cod }); }
              }
            }
          }
        }catch(_m){}
        // 3) Membros do recurso (constantes): considerar se o recurso está alocado no dia/turno
        if(recAlocado && Array.isArray(r.membros)){
          for(const m of r.membros){ if(!m) continue; const fid=m.funcionarioId||m.funcionario_id||m.id||m.matricula||m.codigo||''; if(!fid) continue; if(seen.has(String(fid))) continue; seen.add(String(fid)); const nome=m.nome||m.funcionarioNome||''; const cod=m.codigo||m.matricula||''; atribuicoes.push({ fid, nome, cod }); }
        }
      });
      // Política: não misturar baseline da equipe (componentes) quando não há atribuições reais no dia/turno.
      // Se não houver atribuições para o dia/turno, tentamos obter a visão canônica da diária no backend;
      // se ainda assim não houver, o modal deve refletir a realidade (lista vazia na tabela).
      if(!atribuicoes.length){
        try{
          const escalaId = (function(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||''; }catch(_){ return ''; } })();
          // unidadeId é obrigatória para o endpoint de diária; usar do estado/UI
          const st2 = window.__ESCALA_STATE__ || {};
          let unidadeId = st2?.dadosGerais?.unidadeId || document.getElementById('unidadeEscala')?.value || '';
          const diaISO = diaSel;
          if(unidadeId && diaISO){
            const params = new URLSearchParams({ unidadeId: String(unidadeId), dia: String(diaISO) });
            // classif opcional, se existir
            try{ const cls = (st2.classificacao || st2.tipo || document.body?.dataset?.tipoEscala || '').toString().trim(); if(cls) params.set('classificacao', cls); }catch(_cls){}
            const urls=[ bp()+`/api/escalas/diaria?${params.toString()}`, `/api/escalas/diaria?${params.toString()}` ];
            let payload=null; for(const u of urls){ try{ const r=await fetch(u,{credentials:'same-origin'}); if(r.ok){ payload=await r.json(); break; } }catch(_e){} }
            const lista = Array.isArray(payload?.data)? payload.data: [];
            if(lista.length){
              // Selecionar a escala atual pelo id da URL/estado (quando disponível)
              let escDoc = null;
              if(escalaId){ escDoc = lista.find(d=> String(d.id)===String(escalaId)); }
              if(!escDoc && lista.length===1){ escDoc = lista[0]; }
              if(!escDoc){
                // fallback: mesma classificação/unidade já garantidas; escolhe a que possui equipe alvo no turno
                escDoc = lista[0];
              }
              if(escDoc && Array.isArray(escDoc.turnos)){
                const token = `${iniSel}-${fimSel}`;
                let turno = escDoc.turnos.find(t=> String(t?.token||'')===token || String(t?.label||'')===`${iniSel} - ${fimSel}`);
                if(!turno){ turno = escDoc.turnos.find(t=> String(t?.ini||'')===iniSel && String(t?.fim||'')===fimSel); }
                if(turno && Array.isArray(turno.equipes)){
                  let alvoEq = null;
                  if(eqId){ alvoEq = turno.equipes.find(e=> String(e.id)===String(eqId)); }
                  if(!alvoEq && ctx.equipeNome){ const alvo=String(ctx.equipeNome||'').trim().toUpperCase(); alvoEq = turno.equipes.find(e=> String((e.nome||'').toUpperCase())===alvo); }
                  if(alvoEq){
                    const seen = new Set();
                    // 1) Atribuições dos recursos já filtradas por turno no backend
                    for(const r of (alvoEq.recursos||[])){
                      for(const a of (r.atribuicoes||[])){
                        const fid=a.membroFuncionarioId||a.funcionarioId||a.funcionario||a.id||a.matricula||a.codigo||''; if(!fid) continue; const idk=String(fid);
                        if(seen.has(idk)) continue; seen.add(idk);
                        atribuicoes.push({ fid:idk, nome:a.nome||a.funcionarioNome||'', cod:a.matricula||a.codigo||'' });
                      }
                      // 2) Membros do recurso (já filtrados por bloqueios nesta alocação no backend)
                      for(const m of (r.membros||[])){
                        const fid=m.funcionarioId||m.funcionario_id||m.id||m.matricula||m.codigo||''; if(!fid) continue; const idk=String(fid);
                        if(seen.has(idk)) continue; seen.add(idk);
                        atribuicoes.push({ fid:idk, nome:m.nome||m.funcionarioNome||'', cod:m.codigo||m.matricula||'' });
                      }
                    }
                    // 3) Funcionários "fora" nesta alocação (adições pontuais no backend diária)
                    if(Array.isArray(alvoEq.funcionariosFora)){
                      for(const f of alvoEq.funcionariosFora){
                        if(!f) continue; const fid=f.id||f.funcionarioId||f.funcionario_id||f.codigo||f.matricula||''; if(!fid) continue; const idk=String(fid);
                        if(seen.has(idk)) continue; seen.add(idk);
                        atribuicoes.push({ fid:idk, nome:f.nome||f.funcionarioNome||'', cod:f.codigo||f.matricula||'' });
                      }
                    }
                  }
                }
              }
            }
          }
        }catch(_daily){ /* mantém vazio se não conseguir enriquecer */ }
      }
      if(!atribuicoes.length){ tbody.innerHTML='<tr class="text-muted"><td class="text-center" colspan="5">Equipe sem funcionários alocados neste dia/turno.</td></tr>'; return; }
      // Cabeçalho
      // (já preenchido acima)
      // Unidade exibida
      let unidadeNome=''; try{ const sel=document.getElementById('unidadeEscala'); if(sel && sel.options && sel.selectedIndex>=0) unidadeNome = sel.options[sel.selectedIndex].textContent||''; }catch(_){}
      tbody.innerHTML = atribuicoes.map((it,idx)=>{
        const fid=it.fid||''; const cod=it.cod||'';
        return `<tr data-row-idx="${idx}" data-fid="${esc(fid)}">`+
          `<td class="text-center small" data-col="codigo">${esc(cod||'...')}</td>`+
          `<td class="col-nome small" data-col="nome">${esc(it.nome||'')}</td>`+
          `<td class="col-unidade small">${esc(unidadeNome)||'-'}</td>`+
          `<td class="text-center small" data-col="conflito"><span class="text-muted">verificando...</span></td>`+
          `<td class="text-center small" data-col="indisp"><span class="text-muted">verificando...</span></td>`+
        `</tr>`;
      }).join('');

      // Resolver códigos/nomes e checar conflito/indisponibilidade
      const cacheByCode=new Map(); const cacheByNome=new Map();
      async function resolver(){
        const trs=Array.from(tbody.querySelectorAll('tr[data-row-idx]'));
        const cluster = await fetchFuncionariosCluster();
        const byId=new Map(cluster.map(x=> [String(x.id), x]));
        const byCode=new Map(cluster.map(x=> [normCodeKey(x.codigo||''), x]));
        const byNome=new Map(cluster.map(x=> [String((x.nome||'').toUpperCase()), x]));
        const unresolved=[];
        for(const tr of trs){
          const fid=tr.getAttribute('data-fid')||'';
          let alvo = byId.get(String(fid));
          if(!alvo){ const codVal=normCodeKey(tr.querySelector('[data-col="codigo"]')?.textContent||''); if(codVal) alvo = byCode.get(codVal)||null; }
          if(!alvo){ const nomeVal=(tr.querySelector('[data-col="nome"]')?.textContent||'').trim().toUpperCase(); if(nomeVal) alvo=byNome.get(nomeVal)||null; }
          if(!alvo){ const rawCod=(tr.querySelector('[data-col="codigo"]')?.textContent||'').trim(); if(rawCod && rawCod!=='-' && rawCod!=='...'){ const key=normCodeKey(rawCod); if(cacheByCode.has(key)) alvo=cacheByCode.get(key); else { try{ const u1=bp()+`/api/funcionarios/busca-codigo?codigo=${encodeURIComponent(rawCod)}`; const r=await fetch(u1,{credentials:'same-origin'}); if(r.ok){ const j=await r.json(); const f=j?.data; if(f){ alvo={ id:f.id||f._id||f.funcionario_id, nome:f.nome||'', codigo:f.codigo||f.matricula||'' }; cacheByCode.set(key, alvo); } } }catch(_e){} } } }
          if(alvo){ const tdc=tr.querySelector('[data-col="codigo"]'); if(tdc) tdc.textContent=fmtCodigo(alvo.codigo)||'-'; const tdn=tr.querySelector('[data-col="nome"]'); if(tdn && (!tdn.textContent || tdn.textContent.trim()==='')) tdn.textContent = alvo.nome||tdn.textContent; tr.setAttribute('data-fid-resolvido', String(alvo.id)); }
          else { const tdc=tr.querySelector('[data-col="codigo"]'); if(tdc && (!tdc.textContent || tdc.textContent==='...')) tdc.textContent='-'; const fidHex=tr.getAttribute('data-fid')||''; if(isHex24(fidHex)) unresolved.push(fidHex); }
        }
        // por-ids se necessário
        if(unresolved.length && !window.__NO_POR_IDS__){
          const urls=[ bp()+`/api/funcionarios/por-ids?ids=${encodeURIComponent(unresolved.join(','))}`, `/api/funcionarios/por-ids?ids=${encodeURIComponent(unresolved.join(','))}` ];
          let resolvidos=[]; for(const u of urls){ try{ const r=await fetch(u,{credentials:'same-origin'}); if(r.status===404){ window.__NO_POR_IDS__=true; break; } if(r.ok){ const j=await r.json(); resolvidos=Array.isArray(j.data)? j.data:[]; break; } }catch(_e){} }
          if(resolvidos.length){ const map=new Map(resolvidos.map(x=> [String(x.id), x])); for(const tr of trs){ if(tr.getAttribute('data-fid-resolvido')) continue; const fid=tr.getAttribute('data-fid')||''; if(!isHex24(fid)) continue; const alvo=map.get(String(fid)); if(!alvo) continue; const tdc=tr.querySelector('[data-col="codigo"]'); if(tdc) tdc.textContent=fmtCodigo(alvo.codigo)||'-'; const tdn=tr.querySelector('[data-col="nome"]'); if(tdn && (!tdn.textContent||tdn.textContent.trim()==='')) tdn.textContent=alvo.nome||tdn.textContent; tr.setAttribute('data-fid-resolvido', String(alvo.id)); } }
        }
      }
      function overlap(a1,a2,b1,b2){ return (a1<=b2) && (b1<=a2); }
      function conflitoLocal(tr){ try{ const aloc=window.__ESCALA_STATE__?.matrizAlocacao||{}; if(!aloc||typeof aloc!=='object') return false; const nomeRow=(tr.querySelector('[data-col="nome"]')?.textContent||'').trim().toUpperCase(); const codRow=(tr.querySelector('[data-col="codigo"]')?.textContent||'').trim().toUpperCase(); const alvoDia=String(ctx.dataISO||'').slice(0,10); const hi=(ctx.turnoIni||'').slice(0,5); const hf=(ctx.turnoFim||'').slice(0,5); for(const k of Object.keys(aloc)){ const m=/^([^:]+)::(\d{2}:\d{2})-(\d{2}:\d{2})\|(\d{4}-\d{2}-\d{2})$/.exec(k); if(!m) continue; const kd=m[4], ki=m[2], kf=m[3]; if(kd!==alvoDia) continue; if(!overlap(hi,hf,ki,kf)) continue; const eqIds=String(aloc[k]||'').split(',').map(s=>s.trim()).filter(Boolean); // busca por componentes
          const equipes=Array.isArray(st.equipes)? st.equipes:[]; const mapEq=new Map(equipes.map(e=> [String(e.id||e._id||''), e])); for(const otherId of eqIds){ const eq=mapEq.get(String(otherId)); if(!eq?.componentes) continue; for(const c of eq.componentes){ const n=String(c.nome||'').trim().toUpperCase(); const cd=String(c.matricula||c.codigo||'').trim().toUpperCase(); if((nomeRow && n===nomeRow) || (codRow && cd===codRow)) return true; } } } return false; }catch(_){ return false; } }
      async function checar(){
        const escalaId=(function(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||''; }catch(_){ return ''; } })();
        const dia=ctx.dataISO; const ini=ctx.turnoIni; const fim=ctx.turnoFim; const trs=Array.from(tbody.querySelectorAll('tr[data-row-idx]'));
        await Promise.all(trs.map(async tr=>{
          let fid= tr.getAttribute('data-fid-resolvido') || tr.getAttribute('data-fid') || '';
          if(!isHex24(fid)){ const codTxt=(tr.querySelector('[data-col="codigo"]')?.textContent||'').trim(); if(codTxt && codTxt!=='-' && codTxt!=='...') fid=normCodeKey(codTxt); }
          // Conflitos via API ou local
          let confl=false; try{ const urls=[ bp()+`/api/funcionarios/conflitos-alocacao?funcionarioId=${encodeURIComponent(fid)}&dia=${encodeURIComponent(dia)}&ini=${encodeURIComponent(ini)}&fim=${encodeURIComponent(fim)}&excludeId=${encodeURIComponent(escalaId)}`, bp()+`/api/funcionario/conflitos-alocacao?funcionarioId=${encodeURIComponent(fid)}&dia=${encodeURIComponent(dia)}&ini=${encodeURIComponent(ini)}&fim=${encodeURIComponent(fim)}&excludeId=${encodeURIComponent(escalaId)}` ]; let ok=false; for(const u of urls){ try{ const r=await fetch(u,{credentials:'same-origin'}); if(!r.ok) continue; const j=await r.json(); ok=true; confl=!!(j && (j.conflito===true || (Array.isArray(j.matches)&&j.matches.length))); if(confl) break; }catch(_e){} } if(!confl && !ok) confl = conflitoLocal(tr); }catch(_e){}
          const tdC=tr.querySelector('[data-col="conflito"]'); if(tdC) tdC.innerHTML = confl? '<span class="text-danger fw-semibold">Sim</span>' : '<span class="text-muted">-</span>';
          // Indisponível (ferias/ausencias)
          let fidObj = isHex24(fid)? fid : (tr.getAttribute('data-fid-resolvido') || '');
          if(!fidObj){ try{ const lista=await fetchFuncionariosCluster(); const byCode=new Map(lista.map(x=> [normCodeKey(x.codigo||''), x])); const codVal=normCodeKey(tr.querySelector('[data-col="codigo"]')?.textContent||''); const row=byCode.get(codVal); if(row?.id) fidObj=String(row.id); }catch(_e){} }
          let indis=false, motivo='-';
          if(fidObj){ try{ const u=bp()+`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(fidObj)}&inicio=${encodeURIComponent(dia)}&fim=${encodeURIComponent(dia)}`; const r=await fetch(u,{credentials:'same-origin'}); if(r.ok){ const j=await r.json(); const blocks=Array.isArray(j?.data?.blocked)? j.data.blocked: []; if(blocks.length){ indis=true; const t=blocks[0].tipo||''; motivo=(t==='ferias'? 'Férias': (t==='ausencia'? 'Ausência':'Indisp.')); } } }catch(_e){} }
          if(!indis && !fidObj){ try{ const st=window.__ESCALA_STATE__||{}; const uid=st?.dadosGerais?.unidadeId || document.getElementById('unidadeEscala')?.value || ''; const q=`?unidadeId=${encodeURIComponent(uid)}&inicio=${encodeURIComponent(dia)}&fim=${encodeURIComponent(dia)}`; const pairs=[ [bp()+`/api/ferias${q}`,'Férias'], [bp()+`/api/ausencias${q}`,'Ausência'] ]; for(const [url, rot] of pairs){ try{ const r=await fetch(url,{credentials:'same-origin'}); if(!r.ok) continue; const js=await r.json(); const lista=Array.isArray(js?.data)? js.data: []; const nomeVal=(tr.querySelector('[data-col="nome"]')?.textContent||'').trim().toUpperCase(); const hit=lista.find(it=> String((it.funcionarioNome||'').toUpperCase())===nomeVal); if(hit){ indis=true; motivo=rot; break; } }catch(_e){} } }catch(_e){} }
          const tdI=tr.querySelector('[data-col="indisp"]'); if(tdI) tdI.innerHTML = indis? `<span class="text-danger fw-semibold">${motivo}</span>` : '<span class="text-muted">-</span>';
        }));
        try{ const leftover = modal.querySelectorAll('#tabelaDetalhamentoEquipeDia [data-col="conflito"], #tabelaDetalhamentoEquipeDia [data-col="indisp"]'); leftover.forEach(td=>{ if(/verificando/i.test(td.textContent||'')) td.innerHTML='<span class="text-muted">-</span>'; }); }catch(_e){}
      }
      await resolver(); await checar();
    }catch(_e){}
  }

  async function abrirModalDetalhamentoViaView(anchor){
    try{
      const td = anchor.closest('td'); if(!td) return;
      let grupoId=td.getAttribute('data-grupo-id')||''; let turnoIni=td.getAttribute('data-turno-ini')||''; let turnoFim=td.getAttribute('data-turno-fim')||''; let diaISO=td.getAttribute('data-dia')||'';
      if(!(grupoId && turnoIni && turnoFim && diaISO)){ try{ const key=td.getAttribute('data-key')||''; const m=/^(.*?)::(.*?)-(.*?)\|(\d{4}-\d{2}-\d{2})$/.exec(key); if(m){ grupoId=m[1]; turnoIni=m[2]; turnoFim=m[3]; diaISO=m[4]; } }catch(_e){} }
      const equipeId = anchor.getAttribute('data-eq-id') || '';
      const url = bp()+`/modal-detalhamento-equipe-dias?equipeId=${encodeURIComponent(equipeId)}&dataISO=${encodeURIComponent(diaISO)}&turnoIni=${encodeURIComponent(turnoIni)}&turnoFim=${encodeURIComponent(turnoFim)}&grupoId=${encodeURIComponent(grupoId)}`;
      const r = await fetch(url, { credentials:'same-origin' }); if(!r.ok) return; const html = await r.text();
      const modal = document.getElementById('modalDetalhamentoEquipeDia'); if(!modal) return;
      try { const tmp=document.createElement('div'); tmp.innerHTML=html; const fetched=tmp.querySelector('#modalDetalhamentoEquipeDia'); const newContent=fetched? fetched.querySelector('.modal-content') : tmp.querySelector('.modal-content'); const wrap=modal.querySelector('.modal-content'); if(wrap && newContent){ wrap.innerHTML=newContent.innerHTML; } else if(wrap){ wrap.innerHTML=html; } } catch(_inj){ (modal.querySelector('.modal-content')||modal).innerHTML = html; }
      try{ const inst=bootstrap.Modal.getOrCreateInstance(modal); inst.show(); }catch(_b){ modal.style.display='block'; }
      await preencherModalDetalhamentoFallback(modal, { equipeId, equipeNome: anchor.getAttribute('data-eq-nome')||'', dataISO: diaISO, turnoIni, turnoFim, grupoId });
    }catch(_e){}
  }

  // Delegação de clique na matriz: se anchor não é do core, tratamos
  document.addEventListener('click', function(ev){
    try{
      const a = ev.target && (ev.target.classList?.contains('matriz-eq-item') ? ev.target : (ev.target.closest && ev.target.closest('.matriz-eq-item')));
      if(!a) return;
      const hasInline = a.getAttribute && a.getAttribute('onclick');
      const isCoreAnchor = a.hasAttribute && a.hasAttribute('data-eqnome');
      const coreClickHandlerPresent = (typeof window.__escOpenDet === 'function') || (typeof window.onClickMatrizDetalhe === 'function');
      if (isCoreAnchor && (hasInline || coreClickHandlerPresent)) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      abrirModalDetalhamentoViaView(a);
    }catch(_e){}
  }, true);

  // expõe para o core delegar
  try{ if(typeof window.abrirModalDetalhamentoEquipeDiaImpl!=='function') window.abrirModalDetalhamentoEquipeDiaImpl = function(ctx){ const modal=document.getElementById('modalDetalhamentoEquipeDia'); if(!modal) return; return preencherModalDetalhamentoFallback(modal, ctx); }; }catch(_e){}
})();
