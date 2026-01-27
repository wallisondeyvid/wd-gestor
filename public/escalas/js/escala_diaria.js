(function(){
  'use strict';
  const $ = (id)=> document.getElementById(id);
  const resultado = document.getElementById('resultado');
  let currentDiaISO = null; // dia atual da pesquisa, para salvar notas por alocação
  // CSS fix: evitar que a borda direita do quadro de notas do recurso fique sob a coluna de Notas da equipe
  (function injectStyles(){
    try{
      const id = 'escalas-diaria-fixes';
      if(document.getElementById(id)) return;
      const css = `
        /* Mantém quadros dentro da célula e dá folga à direita do bloco de notas do recurso */
        .turno-cell.recurso { padding-right: 12px; position: relative; z-index: 2; overflow: visible; }
        .turno-cell.recurso .rc-box { box-sizing: border-box; max-width: 100%; padding-right: 8px; position: relative; z-index: 2; }
        .turno-cell.recurso .rc-notes .rc-notes-box { box-sizing: border-box; margin-right: 0; width: 100%; background-color: #fff; }
        /* Garante que a coluna de Notas fique abaixo do quadro do recurso quando encostar */
        .turno-row > .turno-cell:last-child { position: relative; z-index: 1; }

        /* Equipe: nome acima e botões abaixo, na mesma célula */
        .turno-cell.equipe { display:flex; flex-direction: column; align-items: center; justify-content: center; white-space: normal; }
        .turno-cell.equipe .eq-name { display:block; white-space: nowrap; margin-bottom: 4px; }
        .turno-cell.equipe .eq-tools { width: 100%; display:flex; justify-content: center; }

        /* Atribuídos do recurso: um por linha (nome + botões na mesma linha) */
        .rc-grid .rc-nomes { display: flex; flex-direction: column; gap: 4px; }
        .rc-grid .rc-nomes .grid-func { display: flex; align-items: center; justify-content: flex-start; }
        .rc-grid .rc-nomes .grid-func .func-atr { margin-left: 6px; color: #6c757d; font-size: 0.85em; }

  /* Mantém layout padrão; coluna de ações fica oculta com d-none quando não usada */
      `;
      const style = document.createElement('style'); style.id = id; style.type = 'text/css'; style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
    }catch(_e){}
  })();

  // Helpers
  function alertTop(msg, variant='danger', timeout=4000){
    const wrap=document.getElementById('alertsTopRight');
    if(!wrap){ alert(msg); return; }
    const id='al_'+Date.now()+Math.random().toString(16).slice(2);
    const div=document.createElement('div');
    div.id=id; div.className='toast align-items-center text-bg-'+(variant==='danger'?'danger':variant)+' border-0 show mb-2 shadow';
    div.setAttribute('role','alert'); div.style.minWidth='240px';
    div.innerHTML=`<div class="d-flex"><div class="toast-body">${escapeHtml(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>`;
    wrap.appendChild(div);
    div.querySelector('.btn-close').onclick=()=>{ div.classList.remove('show'); setTimeout(()=>div.remove(),150); };
    setTimeout(()=>{ if(div.isConnected){ div.classList.remove('show'); setTimeout(()=>div.remove(),300); } }, timeout);
  }
  function escapeHtml(str){ return (str||'').replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s])); }
  function br(d){ if(!d) return ''; return d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4); }
  function isoFromBr(d){ const m=String(d||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return null; return `${m[3]}-${m[2]}-${m[1]}`; }
  function cssEscapeSel(s){ try{ if(window.CSS && typeof CSS.escape==='function') return CSS.escape(String(s)); }catch(_){} return String(s).replace(/[^a-zA-Z0-9_-]/g, m=> '\\'+m); }

  // Init UI
  function initCalendars(){ if(!window.flatpickr) return; document.querySelectorAll('.date-br').forEach(el=>{ if(el._fp) return; flatpickr(el,{ locale:'pt', dateFormat:'d/m/Y', allowInput:false, disableMobile:true }); }); }
  function carregarUnidades(){
    const sel = $('filtroUnidade'); if(!sel) return;
    fetch('/escalas/api/unidades-relacionadas',{ credentials:'same-origin' })
      .then(r=> r.ok? r.json(): Promise.reject(new Error('HTTP '+r.status)))
      .then(js=>{ sel.querySelectorAll('option:not([disabled])').forEach(o=>o.remove()); const lista=Array.isArray(js.data)? js.data:[]; lista.forEach(u=>{ const opt=document.createElement('option'); opt.value=u.id; opt.textContent=((u.codigo?u.codigo+' - ':'')+(u.nome||'')); sel.appendChild(opt); }); })
      .catch(e=> console.warn('[escala-diaria] unidades falhou', e));
  }

  // Render
  function renderVazio(){ resultado.innerHTML = '<div class="text-center text-muted small">Nenhuma escala para os parâmetros informados.</div>'; }
  function renderDia(payload){
    const arr = Array.isArray(payload?.data)? payload.data: [];
    if(!arr.length){ renderVazio(); return; }
    resultado.innerHTML = arr.map(esc=> renderEscala(esc)).join('');
    // Hidratar nomes de funcionários após render para evitar mostrar IDs
    try { hydrateNomes(resultado); } catch(_){ }
  }
  // Cache simples para nomes de funcionário por id
  const _nomeFuncCache = new Map();
  async function resolverNomeFuncionario(id){
    if(!id) return null;
    const key = String(id);
    if(_nomeFuncCache.has(key)) return _nomeFuncCache.get(key);
    try{
      const r = await fetch(`/escalas/api/funcionarios/busca-codigo?id=${encodeURIComponent(key)}`, { credentials:'same-origin' });
      if(!r.ok) throw new Error('HTTP '+r.status);
      const js = await r.json();
      const nome = js && js.data && js.data.nome ? js.data.nome : null;
      _nomeFuncCache.set(key, nome);
      return nome;
    }catch(_e){ _nomeFuncCache.set(key, null); return null; }
  }
  function hydrateNomes(container){
    try{
      const scope = container || resultado;
      const itens = scope.querySelectorAll('.func-nome');
      itens.forEach(async (span)=>{
        const el = span.closest('[data-funcionario-id]');
        const fid = el ? el.getAttribute('data-funcionario-id') || '' : '';
        if(!fid) return;
        const texto = (span.textContent||'').trim();
        const isHex24 = /^[0-9a-fA-F]{24}$/.test(fid);
        if(texto && !(isHex24 && texto===fid)) return; // já tem nome válido
        const nome = await resolverNomeFuncionario(fid);
        if(nome && span.isConnected){ span.textContent = nome; span.setAttribute('title', nome); }
      });
    }catch(_e){ /* noop */ }
  }
  function renderEscala(esc){
  const titulo = `${escapeHtml(esc.descricao||'-')} — ${(esc.unidade_codigo? escapeHtml(esc.unidade_codigo)+' - ':'')+escapeHtml(esc.unidade_nome||'')}`;
  const escIdVal = esc.id || esc._id || '';
  // Determinar se a escala tem conteúdo para o dia (qualquer turno com equipes visíveis)
  const hasConteudoDia = Array.isArray(esc.turnos) && esc.turnos.some(t=> Array.isArray(t.equipes) && t.equipes.length>0);
    // Botão Detalhes: segue a convenção de pesquisar_escala (abre /ordinaria/nova? id=... ou /extraordinaria/nova)
    const tipo = (String(esc.classificacao||'').toUpperCase().includes('EXTRA')) ? 'extraordinaria' : 'ordinaria';
    const rotaBase = `/escalas/${tipo}/nova`;
  const btnDetalhes = `<a class="btn btn-outline-primary btn-sm" href="${rotaBase}?id=${encodeURIComponent(escIdVal)}" title="Detalhes / Editar"><i class="bi bi-pencil"></i> Detalhes</a>`;
    // Botão recolher/expandir: inicia recolhido (+)
  const contentId = `esc_body_${escapeHtml(String(escIdVal))}`;
    const btnToggle = `<button type="button" class="btn btn-outline-dark btn-sm btn-toggle-escala" data-target="${contentId}" aria-expanded="false" title="Expandir">+</button>`;
    // Checkbox de inclusão no relatório (inicia marcado)
  const chkId = `esc_chk_${escapeHtml(String(escIdVal))}`;
  const chkChecked = hasConteudoDia ? 'checked' : '';
  const chkDisabled = hasConteudoDia ? '' : 'disabled';
  const chkTitle = hasConteudoDia ? 'Incluir no relatório' : 'Sem conteúdo no dia (desabilitado)';
  const chk = `<input type="checkbox" class="form-check-input escala-chk" id="${chkId}" data-id="${escapeHtml(String(escIdVal))}" ${chkChecked} ${chkDisabled} title="${chkTitle}">`;
    // Botão de toggle à esquerda, antes do nome da escala, seguido do título e do checkbox
    const headerTop = `<div class="escala-card-title mb-1 d-flex justify-content-between align-items-center"><div class="d-flex align-items-center gap-2">${btnToggle}<span>${titulo}</span>${chk}</div><div class="d-flex align-items-center gap-2">${btnDetalhes}</div></div>`;
    // Linha de status logo abaixo do título
    const status = String(esc.status||'').toLowerCase();
    const labelStatus = status==='fechada' ? '<span class="badge bg-secondary">fechada</span>' : (status ? '<span class="badge bg-success">aberta</span>' : '');
    const header = `${headerTop}${labelStatus? `<div class="mb-2">${labelStatus}</div>`:''}`;
  const turnos = Array.isArray(esc.turnos)? esc.turnos: [];
  const corpo = turnos.length? turnos.map(t=> renderTurno(t, escIdVal)).join('') : '<div class="text-muted small">Sem turnos para este dia.</div>';
    // Conteúdo inicia oculto (recolhido)
    const wrapCorpo = `<div id="${contentId}" class="escala-content d-none">${corpo}</div>`;
  return `<div class="card mb-3" data-escala-id="${escapeHtml(String(escIdVal))}"><div class="card-body">${header}${wrapCorpo}</div></div>`;
  }
  function renderTurno(t, escalaId){ const nome = `${escapeHtml(t.label || (t.ini&&t.fim? t.ini+' - '+t.fim : 'Turno'))}`; const equipes = Array.isArray(t.equipes)? t.equipes: []; const head = `<div class=\"turno-head\"><div>Equipe</div><div>Efetivo / Recurso</div><div>Notas</div></div>`; const corpo = equipes.map(e=> renderEquipeRowset(e, escalaId, t.token)).join(''); const tabela = `<div class=\"turno-table\">${head}${corpo || `<div class=\"turno-row\"><div class=\"turno-cell muted\" style=\"grid-column: 1 / -1\">Sem equipes</div></div>`}</div>`; return `<div class=\"grid-turno\"><header>${nome}</header>${tabela}</div>`; }
  function renderEquipeRowset(e, escalaId, turnoToken){
    const recursos = Array.isArray(e.recursos)? e.recursos: [];
    const fora = Array.isArray(e.funcionariosFora)? e.funcionariosFora: [];

  
  function extrairAtribuicoesDetalhe(r, dia, turnoToken){
    // 1) Filtrar o array por dia/turno
    const token = String(turnoToken||'').trim();
    const norm = (v)=>{ const s=String(v||''); const y = s.includes('::')? s.split('::').slice(-1)[0] : s; return y.replace(/\s*-\s*/, '-'); };
    const tokenSlim = token.replace(/\s*-\s*/, '-');
    let list = Array.isArray(r.atribuicoes)
      ? r.atribuicoes
          .filter(a=> a && (
            // dia igual ao alvo OU atribuição sem dia mas com turno batendo
            a.dia===dia || (!a.dia && (!a.turnoId || norm(a.turnoId)===tokenSlim))
          ) && (!a.turnoId || norm(a.turnoId)===tokenSlim))
          .map(a=> ({
            id: a.membroFuncionarioId || a.funcionarioId || a.id || a.funcionario || a.matricula || null,
            nome: a.nome || a.funcionarioNome || a.nomeFuncionario || a.funcionarioId || a.id,
            atribuicao: a.atribuicao || a.papel || a.funcao || a.funcaoNome || a.tarefa || '',
            _src: 'arr'
          }))
      : [];
    // 2) Fallback: quando vazio, tentar mapa legado por chave dia__turno
    if((!list || list.length===0) && r && r.atribuicoesRecurso && typeof r.atribuicoesRecurso==='object'){
      try {
  const k1 = `${dia}__${tokenSlim}`; const k2 = `${dia}__${(tokenSlim||'').replace('-', ' - ')}`;
        const add = (arr)=> Array.isArray(arr)? arr : [];
        const merged = [...add(r.atribuicoesRecurso[k1]), ...add(r.atribuicoesRecurso[k2])];
        list = merged.map(it=>({
          id: it.membroFuncionarioId || it.funcionarioId || it.funcionario || it.matricula || it.id || null,
          nome: it.nome || it.funcionarioNome || it.nomeFuncionario || it.funcionarioId || it.id || null,
          atribuicao: it.atribuicao || it.papel || it.funcao || it.funcaoNome || it.tarefa || '',
          _src: 'map'
        })).filter(x=> x && x.id);
      } catch(_){ /* noop */ }
    }
    // Bloqueios (removidos nesta alocação)
    const bloqueados = new Set();
    try {
      const token = String(turnoToken||'').trim();
      const k1 = `${dia}__${token}`; const k2 = `${dia}__${(token||'').replace('-', ' - ')}`;
      const ref = (r && r.remocoesRecurso && typeof r.remocoesRecurso==='object') ? r.remocoesRecurso : {};
      const arr1 = Array.isArray(ref[k1]) ? ref[k1] : []; const arr2 = Array.isArray(ref[k2]) ? ref[k2] : [];
      [...arr1, ...arr2].forEach(fid=> { if(fid!=null) bloqueados.add(String(fid)); });
    } catch(_b){ /* noop */ }
    // 4) Normalizar shape para UI e filtrar bloqueados
    return list
      .filter(it=> it && it.id)
      // Se veio do mapa (fallback), respeitar bloqueios; se veio do array (atribuição real), não bloquear
      .filter(it=> it._src === 'arr' || !bloqueados.has(String(it.id)));
  }
  function renderNomesAtribuidos(r, equipeNome, recursoId, turnoToken){
    // Não filtrar por nome aqui; se vier apenas o ID, exibimos e hidratamos o nome depois
    const list = extrairAtribuicoesDetalhe(r, currentDiaISO, turnoToken).filter(it=> it && (it.id!=null));
    if(!list.length) return '<div class="rc-nomes text-muted small">—</div>';
    const eq = escapeHtml(String(equipeNome||''));
    const rid = escapeHtml(String(recursoId||''));
    const rows = list.map(it=>{
      const fidRaw = (it.id!=null? String(it.id): '');
      const fid = escapeHtml(fidRaw);
      const nome = escapeHtml((it.nome && String(it.nome).trim()) ? it.nome : fidRaw || '—');
      const atrib = it.atribuicao? `(${escapeHtml(it.atribuicao)})` : '';
      const nomeEl = `<span class=\"func-nome\" title=\"${nome}\">${nome}</span>`;
      const atribEl = atrib? `<div class=\"func-atr\">${atrib}</div>` : '';
        const buttons = `<div class=\"rc-toolbar ms-2\">`
          + `<button type=\"button\" class=\"btn btn-outline-danger btn-sm\" title=\"Remover (excluir da alocação)\" onclick=\"window.es_diaria_removerAtribuicao('${eq}','${rid}','${fidRaw}', false)\"><i class=\"bi bi-x\"></i></button>`
          + `<button type=\"button\" class=\"btn btn-outline-primary btn-sm\" title=\"Extrair efetivo (mover para sem recurso)\" onclick=\"window.es_diaria_removerAtribuicao('${eq}','${rid}','${fid}', true)\"><i class=\"bi bi-box-arrow-up\"></i></button>`
          + `<button type=\"button\" class=\"btn btn-outline-secondary btn-sm\" title=\"Editar atribuição\" onclick=\"window.es_diaria_editarAtribuicao('${eq}','${rid}','${fid}')\"><i class=\"bi bi-pencil-square\"></i></button>`
          + `</div>`;
      return `<div class=\"grid-func\" data-funcionario-id=\"${fid}\"><div class=\"func-line\">${nomeEl}${buttons}</div>${atribEl}</div>`;
    }).join('');
    return `<div class=\"rc-nomes\">${rows}</div>`;
  }
    function equipeToolbar(equipeNome, equipeId, escalaId, ativa){
      const n = escapeHtml(equipeNome);
      const eid = escapeHtml(String(equipeId||''));
      const escId = escapeHtml(String(escalaId||''));
      return `<div class=\"eq-toolbar\">`
        + `<button type=\"button\" class=\"btn btn-outline-danger btn-sm\" title=\"Excluir equipe\" onclick=\"window.es_diaria_excluirEquipe('${n}')\"><i class=\"bi bi-trash\"></i></button>`
        + `<button type=\"button\" class=\"btn btn-outline-secondary btn-sm\" title=\"Editar notas\" onclick=\"window.es_diaria_editarNotas('${escId}','${eid}','${n}')\"><i class=\"bi bi-stickies\"></i></button>`
        + `<button type=\"button\" class=\"btn btn-outline-primary btn-sm\" title=\"Inserir efetivo\" onclick=\"window.es_diaria_inserirEfetivo('${n}')\"><i class=\"bi bi-person-plus\"></i></button>`
        + `<button type=\"button\" class=\"btn btn-outline-primary btn-sm\" title=\"Inserir recurso\" onclick=\"window.es_diaria_inserirRecurso('${n}')\"><i class=\"bi bi-truck\"></i></button>`
      + `</div>`;
    }
    function cellEquipe(text, toolbarHtml){
      const nome = `<div class=\"eq-name\">${escapeHtml(text)}</div>`;
      const tools = toolbarHtml ? `<div class=\"eq-tools mt-1\">${toolbarHtml}</div>` : '';
      return `<div class=\"turno-cell equipe\">${nome}${tools}</div>`;
    }
  // Nota: coluna de Ações foi removida; toolbar agora fica sob o nome da equipe
  
  function recursoToolbar(escalaId, equipeId, equipeNome, recursoId){
      const n = escapeHtml(equipeNome);
      const eid = escapeHtml(String(equipeId||''));
      const escId = escapeHtml(String(escalaId||''));
      const rid = escapeHtml(String(recursoId||''));
      return `<div class=\"rc-toolbar\">`
        + `<button type=\"button\" class=\"btn btn-outline-secondary btn-sm\" title=\"Editar recurso\" onclick=\"window.es_diaria_editarRecurso('${n}','${rid}')\"><i class=\"bi bi-pencil\"></i></button>`
        + `<button type=\"button\" class=\"btn btn-outline-danger btn-sm\" title=\"Excluir recurso\" onclick=\"window.es_diaria_excluirRecurso('${n}','${rid}')\"><i class=\"bi bi-trash\"></i></button>`
        + `<button type=\"button\" class=\"btn btn-outline-primary btn-sm\" title=\"Inserir efetivo\" onclick=\"window.es_diaria_inserirEfetivoRecurso('${n}','${rid}')\"><i class=\"bi bi-person-plus\"></i></button>`
        + `<button type=\"button\" class=\"btn btn-outline-secondary btn-sm\" title=\"Editar notas do recurso\" onclick=\"window.es_diaria_editarNotasRecurso('${escId}','${eid}','${rid}')\"><i class=\"bi bi-stickies\"></i></button>`
      + `</div>`;
    }
  function recursoBox(r, turnoToken){
    // Rótulo mais amigável: evitar mostrar ObjectId e preferir placa/código
    const looksHex = (v)=> /^[0-9a-fA-F]{24}$/.test(String(v||'').trim());
    const candidatosNome = [r && r.nome, r && r.nomeRecurso, r && r.nome_recurso, r && r.descricao, r && r.descr, r && r.titulo, r && r.label, r && r.recurso, r && r.codigoRecurso, r && r.codigo];
    let nome = '';
    for(const c of candidatosNome){ const s=(c==null?'':String(c)).trim(); if(!s) continue; if(looksHex(s)) continue; nome=s; break; }
    const rid = (r && r.id!=null? String(r.id): '').trim();
    const idMostravel = looksHex(rid) ? '' : rid;
    const badge = `<span class=\"badge-recurso rc-badge\">${escapeHtml(nome || r?.placa || r?.codigo || idMostravel || '-')}</span>`;
        const actions = recursoToolbar(escalaId, (e.id||e._id||''), String(e.nome||e.id||'-'), r.id||r.placa||'');
  const nomesEl = renderNomesAtribuidos(r, String(e.nome||e.id||'-'), r.id||r.placa||'', turnoToken);
        const notasContent = r.notas? `${escapeHtml(r.notas)}` : '—';
        // Refeições: mostrar somente as da alocação atual (dia/turno)
        let refeicoesSection = '';
        try{
          const refeicoesAll = Array.isArray(r.refeicoes)? r.refeicoes: [];
          // Filtros por contexto atual
          const diaAlvo = currentDiaISO;
          const turnoAlvo = String(turnoToken||'').trim();
          const rangeAlvo = (turnoAlvo.match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
          const matchTurno = (t)=>{
            if(!t) return false;
            const token = String(t||'');
            if(token === turnoAlvo) return true;
            const rg = (token.match(/(\d{2}:\d{2}-\d{2}:\d{2})$/)||[])[1] || null;
            return !!(rg && rangeAlvo && rg===rangeAlvo);
          };
          let refeicoes = refeicoesAll.filter(iv=>{
            const diaIv = iv.dia || iv.data || null;
            const turnoIv = iv.turnoId || iv.turno || null;
            if(diaIv){ if(String(diaIv) !== String(diaAlvo)) return false; }
            if(turnoIv){ return matchTurno(turnoIv); }
            // Sem campos de escopo: considerar já pré-filtradas pelo backend
            return true;
          });
          const titulo = `<div class=\"form-text text-muted mt-2 mb-1\">Refeições</div>`;
          if(refeicoes.length){
            const linhas = refeicoes.map(iv=>{
              const ini = escapeHtml(String(iv.ini||''));
              const fim = escapeHtml(String(iv.fim||''));
              const compTxt = (iv && iv.computavel === false) ? 'não computável' : 'computável';
              return `<div class=\"meal-row\">${ini} - ${fim} (${escapeHtml(compTxt)})</div>`;
            }).join('');
            refeicoesSection = `${titulo}<div class=\"rc-meals-box\">${linhas}</div>`;
          } else {
            refeicoesSection = `${titulo}<div class=\"text-muted small\">—</div>`;
          }
        }catch(_meals){}
        const notasEl = `<div class=\"rc-notes\"><div class=\"rc-box rc-notes-box\">${notasContent}</div>${refeicoesSection}</div>`;
        const head = `<div class=\"rc-head\"><div>Funcionário</div><div>Nome do Recurso</div><div>Ações</div><div>Notas do recurso</div></div>`;
        return `<div class=\"rc-box\" data-recurso-id=\"${escapeHtml(String(r.id||r.placa||''))}\">${head}<div class=\"rc-grid\">${nomesEl}<div class=\"rc-badge\">${badge}</div><div class=\"rc-actions\">${actions}</div>${notasEl}</div></div>`;
      }
    
    function cellNotasEquipe(text){ const n = text? `<div class=\"notas-box\">${escapeHtml(text)}</div>`:'<div class=\"text-muted small\">—</div>'; return `<div class=\"turno-cell\">${n}</div>`; }

    let out='';
  const recursosHtml = recursos.map(r=> recursoBox(r, turnoToken));
    function renderForaBox(nomes){
      if(!nomes || !nomes.length) return '';
      const escId = escapeHtml(String(escalaId||''));
      const eqId = escapeHtml(String(e.id||e._id||''));
      const rows = nomes.map(n=>{
        const nome = (typeof n === 'string') ? n : (n?.nome || n?.name || n?.funcionarioNome || '');
        const id = (typeof n === 'string') ? n : (n?.id || n?.funcionarioId || n?.codigo || n?.matricula || '');
        const t = escapeHtml(String(nome||''));
        const fid = escapeHtml(String(id||''));
          const btn = fid ? `<button type="button" class="btn btn-outline-danger btn-sm" title="Remover" onclick="window.es_diaria_removerFora('${escId}','${eqId}','${fid}')"><i class="bi bi-x"></i></button>` : '';
          const tools = btn ? `<div class="rc-toolbar ms-2">${btn}</div>` : '';
          return `<div class="grid-func-solo" data-funcionario-id="${fid}"><span class="func-nome" title="${t}">${t}</span>${tools}</div>`;
      }).join('');
      // Usa a mesma grade de 4 colunas dos recursos para alinhar horizontalmente
      const head = `<div class="rc-head"><div>Funcionário</div><div></div><div></div><div></div></div>`;
      const grid = `<div class="rc-grid"><div class="rc-nomes">${rows}</div><div></div><div></div><div></div></div>`;
      const html = `<div class="fora-wrap"><div class="rc-box rc-out">${head}${grid}</div></div>`;
      // Não temos acesso ao elemento aqui (string), faremos a hidratação após inserir no DOM
      return html;
    }
    const foraSection = renderForaBox(fora);
    const stackParts = [];
    if(recursosHtml.length) stackParts.push(...recursosHtml);
    if(foraSection) stackParts.push(foraSection);
    const midCol = stackParts.length
      ? `<div class="rc-stack">${stackParts.join('')}</div>`
      : '<div class="rc-box" style="visibility:hidden;height:2rem;"></div>';
    const combined = `<div class="fr-cell"><div class="fr-grid only-mid"><div class="fr-mid">${midCol}</div></div></div>`;
  const equipeIdVal = e.id || e._id || '';
  const toolbar = equipeToolbar(String(e.nome||equipeIdVal||'-'), (e.id||e._id||''), escalaId);
  out += `<div class=\"turno-row\" data-escala-id=\"${escapeHtml(String(escalaId||''))}\" data-equipe-id=\"${escapeHtml(String(equipeIdVal||''))}\" data-turno-id=\"${escapeHtml(String(turnoToken||''))}\" data-dia=\"${escapeHtml(String(currentDiaISO||''))}\" data-ativa=\"${e.ativa? '1':'0'}\">${cellEquipe(String(e.nome||equipeIdVal||'-'), toolbar)}<div class=\"turno-cell recurso\">${combined}</div>${cellNotasEquipe(e.notas||'')}</div>`;
    return out;
  }

  // Handlers — excluir alocação da equipe no dia/turno atual
  window.es_diaria_excluirEquipe = async (nome)=>{
    try{
      // Descobrir o contexto a partir do botão clicado: linha, ids e escopo
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para exclusão.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!escalaId || !equipeId || !dia || !turnoId){ alertTop('Dados insuficientes para excluir a equipe.', 'danger'); return; }
      const msg = `Excluir a alocação da equipe "${nome}" em ${br(dia)} no turno ${turnoId}?\nOs recursos, efetivo e refeições deste escopo também serão removidos.`;
      if(!confirm(msg)) return;
      // Preferir POST alias (evita restrições de DELETE em alguns stacks)
      const urlPost = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/alocacao/delete`;
      let r = await fetch(urlPost, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
      if(!r.ok){
        // Fallback: tentar com DELETE + querystring
        const urlDel = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/alocacao?dia=${encodeURIComponent(dia)}&turnoId=${encodeURIComponent(turnoId)}`;
        r = await fetch(urlDel, { method:'DELETE', credentials:'same-origin' });
        if(r.status===405 || r.status===415){
          r = await fetch(urlDel, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
        }
      }
      if(!r.ok){ throw new Error('HTTP '+r.status); }
      const js = await r.json();
      if(js && js.ok){
        // Remover a linha da equipe desta tabela; se ficar sem linhas, coloca placeholder "Sem equipes"
        const table = row.parentElement; // .turno-table
        row.remove();
        const rest = table.querySelectorAll(':scope > .turno-row').length;
        if(rest===0){
          const html = `<div class="turno-row"><div class="turno-cell muted" style="grid-column: 1 / -1">Sem equipes</div></div>`;
          table.insertAdjacentHTML('beforeend', html);
        }
        alertTop('Alocação da equipe excluída.', 'success');
      } else {
        throw new Error('Resposta inválida');
      }
    } catch(e){ console.error('[escala-diaria] excluir equipe', e); alertTop('Erro ao excluir a equipe no dia/turno.', 'danger'); }
  };
  // Abrir modal extraído de notas e salvar via API
  (function(){
     async function salvarNotas(escalaId, equipeId, notas, dia, turnoId){
       const body={ notas, dia, turnoId };
       const urls=[ `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/notas`, `/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/notas` ];
       let lastErr=null;
       for(const u of urls){ try{ const r=await fetch(u,{ method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) }); if(r.ok){ return await r.json(); } lastErr = new Error('HTTP '+r.status); }catch(e){ lastErr=e; } }
       throw lastErr || new Error('HTTP 500');
     }
    function atualizarCelulaNotasDOM(escalaId, equipeId, notas){ const row=document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`); if(!row) return; const cells=row.querySelectorAll('.turno-cell'); if(!cells||cells.length<3) return; const notasCell=cells[cells.length-1]; notasCell.innerHTML = (!notas||!notas.trim())? '<div class="text-muted small">—</div>' : `<div class=\"notas-box\">${escapeHtml(notas)}</div>`; }
    window.es_diaria_editarNotas = (escalaId, equipeId, equipeNome)=>{
      try{
        const row=document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`);
        const atual=row? (row.querySelector('.turno-cell:last-child .notas-box')?.textContent||'') : '';
        if(window.modalNotasEquipe){
          window.modalNotasEquipe.open(atual, async (novo)=>{
            try{
              const dia = row?.getAttribute('data-dia') || currentDiaISO;
              let turnoId = row?.getAttribute('data-turno-id') || null;
              if(turnoId) turnoId = String(turnoId).trim();
              const js=await salvarNotas(escalaId, equipeId, novo, dia, turnoId);
              if(js && js.ok){ atualizarCelulaNotasDOM(escalaId, equipeId, js.notas ?? novo); window.modalNotasEquipe.close(); alertTop('Notas atualizadas.', 'success'); }
              else { throw new Error('Resposta inválida'); }
            }catch(err){ console.error('[escala-diaria] salvar notas', err); alertTop('Erro ao salvar notas da equipe.', 'danger'); }
          }, { title: 'Editar notas da equipe', max: 1000 });
        } else {
          alertTop('Modal de notas não carregado.', 'danger');
        }
      }catch(e){ console.error('[escala-diaria] abrir modal notas', e); alertTop('Não foi possível abrir o editor de notas.', 'danger'); }
    };
  })();
  window.es_diaria_inserirEfetivo = (nome)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para inserir efetivo.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function')){ alertTop('Modal de pesquisa de efetivo não disponível.', 'danger'); return; }
      window.WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect: async (ret)=>{
        const f = Array.isArray(ret)? ret[0] : ret;
        if(!f || !f.id){ alertTop('Seleção inválida.', 'warning'); return; }
        try{
          const url = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/componentes`;
          const body = { funcionarioId: f.id, nome: f.nome||null, dia, turnoId };
          const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(body) });
          if(!r.ok) throw new Error('HTTP '+r.status);
          const js = await r.json();
          if(!(js && js.ok && js.componente)) throw new Error('Resposta inválida');
          // Garantir seção "sem recurso"
          let grid = row.querySelector('.rc-out .rc-grid .rc-nomes');
          if(!grid){
            const container = row.querySelector('.fr-mid .rc-stack');
            if(container){
              const head = `<div class="rc-head"><div>Funcionário</div><div></div><div></div><div></div></div>`;
              const gridHtml = `<div class="rc-grid"><div class="rc-nomes"></div><div></div><div></div><div></div></div>`;
              const wrap = document.createElement('div'); wrap.className='fora-wrap'; wrap.innerHTML = `<div class="rc-box rc-out">${head}${gridHtml}</div>`; container.appendChild(wrap);
              grid = wrap.querySelector('.rc-nomes');
            }
          }
          if(grid){
            const escId = row.getAttribute('data-escala-id');
            const eqId = row.getAttribute('data-equipe-id');
            const fid = escapeHtml(String(js.componente.id||''));
            const nomeMostrado = escapeHtml(String(js.componente.nome||js.componente.id||''));
            const btn = fid ? `<button type="button" class="btn btn-outline-danger btn-sm" title="Remover" onclick="window.es_diaria_removerFora('${escapeHtml(escId)}','${escapeHtml(eqId)}','${fid}')"><i class="bi bi-x"></i></button>` : '';
            const tools = btn ? `<div class="rc-toolbar ms-2">${btn}</div>` : '';
            const rowHtml = `<div class="grid-func-solo" data-funcionario-id="${fid}"><span class="func-nome" title="${nomeMostrado}">${nomeMostrado}</span>${tools}</div>`;
            grid.insertAdjacentHTML('beforeend', rowHtml);
            // Hidratar nome caso seja ObjectId sem nome
            if(/^[0-9a-fA-F]{24}$/.test(fid) && (!js.componente.nome || js.componente.nome===fid)){
              const el = grid.lastElementChild; const span = el && el.querySelector('.func-nome');
              resolverNomeFuncionario(fid).then(n=>{ if(n && span && span.isConnected){ span.textContent = n; span.setAttribute('title', n); } });
            }
          }
          alertTop('Funcionário inserido na equipe (sem recurso).', 'success');
          hydrateNomes(resultado);
        } catch(err){ console.error('[escala-diaria] inserir efetivo', err); alertTop('Erro ao inserir funcionário na equipe.', 'danger'); }
      }});
    }catch(e){ console.error('[escala-diaria] abrir modal inserir efetivo', e); alertTop('Não foi possível abrir a pesquisa de efetivo.', 'danger'); }
  };
  window.es_diaria_inserirRecurso = (nome)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para inserir recurso.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!escalaId || !equipeId || !dia || !turnoId){ alertTop('Dados insuficientes para inserir recurso.', 'danger'); return; }
      // Guardar contexto desta inserção para atualizar a UI ao salvar no modal
      try { window.__DIARIA_INSERT_CTX__ = { escalaId, equipeId, dia, turnoId, equipeNome: (row.querySelector('.turno-cell.equipe .eq-name')?.textContent || '').trim() }; } catch(_){ }
      if(!(window.__OPEN_MODAL_RECURSO_CUSTOM__ && typeof window.__OPEN_MODAL_RECURSO_CUSTOM__==='function')){
        alertTop('Modal de recurso não está disponível nesta página.', 'danger');
        return;
      }
      // Disponibilizar escalaId para o modal (fallback usado pelo modal)
      try { if(!window.__ESCALA_STATE__) window.__ESCALA_STATE__ = {}; window.__ESCALA_STATE__.escalaId = escalaId; } catch(_){ }
      // Abrir o modal em modo "diária":
      // - Seleciona e bloqueia a equipe
      // - Restringe a alocação à combinação (dia, turnoId) atual
      // - Desativa a aba Atribuições
      window.__OPEN_MODAL_RECURSO_CUSTOM__({
        recurso: null,
        lock: { dia, turnoId, equipeId, disableAtribuicao: true }
      });
      // Alternar para a aba Alocação automaticamente para o usuário conferir/salvar
      setTimeout(()=>{
        try {
          const tab = document.getElementById('tab-alocacao');
          if(tab && !tab.hasAttribute('disabled')){
            tab.click();
          }
        } catch(_){ }
      }, 120);
    }catch(e){ console.error('[escala-diaria] abrir modal inserir recurso', e); alertTop('Não foi possível abrir o modal de recurso.', 'danger'); }
  };
  // (Removido) Ativar/Inativar equipe no dia/turno corrente via botão na UI — agora sem botão na toolbar
  // Recursos
  window.es_diaria_editarRecurso = (equipe, recursoId)=> alertTop(`Editar recurso ${recursoId} da equipe ${equipe}`, 'info');
  window.es_diaria_excluirRecurso = async (equipe, recursoId)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para excluir o recurso.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
  if(!escalaId || !equipeId || !dia || !turnoId){ alertTop('Dados insuficientes para excluir o recurso.', 'danger'); return; }
  if(!confirm(`Excluir o recurso ${recursoId} de "${equipe}" em ${br(dia)} no turno ${turnoId}?\nAs atribuições e refeições desta alocação serão removidas. Funcionários só serão movidos para "sem recurso" se houver atribuições no período.`)) return;
      // Preferir POST alias
      const urlPost = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/alocacao/delete`;
      let r = await fetch(urlPost, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
      if(!r.ok){
        // fallback DELETE com querystring
        const urlDel = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/alocacao?dia=${encodeURIComponent(dia)}&turnoId=${encodeURIComponent(turnoId)}`;
        r = await fetch(urlDel, { method:'DELETE', credentials:'same-origin' });
        if(r.status===405 || r.status===415){
          r = await fetch(urlDel, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
        }
      }
      if(!r.ok) throw new Error('HTTP '+r.status);
      const js = await r.json();
      if(!(js && js.ok)) throw new Error('Resposta inválida');
      // Atualizar DOM: remover o bloco do recurso
      const recursoBox = row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`);
      if(recursoBox){ recursoBox.remove(); }
  // Atualizar "Funcionários sem recurso": inserir os movidos, se houver
  if(js.moved && Array.isArray(js.moved) && js.moved.length){
        let grid = row.querySelector('.rc-out .rc-grid .rc-nomes');
        // Se ainda não existe a seção de "fora", cria estrutura mínima
        if(!grid){
          const container = row.querySelector('.fr-mid .rc-stack');
          if(container){
            const head = `<div class="rc-head"><div>Funcionário</div><div></div><div></div><div></div></div>`;
            const gridHtml = `<div class="rc-grid"><div class="rc-nomes"></div><div></div><div></div><div></div></div>`;
            const wrap = document.createElement('div');
            wrap.className = 'fora-wrap';
            wrap.innerHTML = `<div class="rc-box rc-out">${head}${gridHtml}</div>`;
            container.appendChild(wrap);
            grid = wrap.querySelector('.rc-nomes');
          }
        }
        if(grid){
          const escId = row.getAttribute('data-escala-id');
          const eqId = row.getAttribute('data-equipe-id');
          js.moved.forEach(it=>{
            const nome = escapeHtml(String(it.nome || it.id || ''));
            const fid = escapeHtml(String(it.id || ''));
            const btn = fid ? `<button type="button" class="btn btn-outline-danger btn-sm" title="Remover" onclick="window.es_diaria_removerFora('${escapeHtml(escId)}','${escapeHtml(eqId)}','${fid}')"><i class="bi bi-x"></i></button>` : '';
            const tools = btn ? `<div class="rc-toolbar ms-2">${btn}</div>` : '';
            const rowHtml = `<div class="grid-func-solo"><span class="func-nome" title="${nome}">${nome}</span>${tools}</div>`;
            grid.insertAdjacentHTML('beforeend', rowHtml);
          });
        }
      }
      hydrateNomes(resultado);
      const movedCount = (js && Array.isArray(js.moved)) ? js.moved.length : 0;
      if(movedCount > 0){
        alertTop(`Recurso excluído da alocação; ${movedCount} funcionário(s) movido(s) para "sem recurso".`, 'success');
      } else {
        alertTop('Recurso excluído da alocação.', 'success');
      }
    }catch(e){ console.error('[escala-diaria] excluir recurso', e); alertTop('Erro ao excluir recurso da alocação.', 'danger'); }
  };
  window.es_diaria_inserirEfetivoRecurso = (equipe, recursoId)=> alertTop(`Inserir efetivo no recurso ${recursoId} (equipe ${equipe})`, 'info');
  window.es_diaria_editarNotasRecurso = (escalaId, equipeId, recursoId)=>{
    try{
  const row = document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`);
      const wrap = row ? row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`) : null;
  let atual = wrap ? (wrap.querySelector('.rc-notes .rc-notes-box')?.textContent || '') : '';
  // Se o conteúdo atual é apenas o traço placeholder, abrir o modal vazio
  if(atual && atual.trim() === '—') atual = '';
      if(window.modalNotasEquipe){
        window.modalNotasEquipe.open(atual, async (novo)=>{
          try{
            const url = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/notas`;
            const dia = row?.getAttribute('data-dia') || currentDiaISO;
            let turnoId = row?.getAttribute('data-turno-id') || null;
            if(turnoId) turnoId = String(turnoId).trim();
            const r = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ notas: novo, dia, turnoId }) });
            if(!r.ok) throw new Error('HTTP '+r.status);
            const js = await r.json();
            if(js && js.ok){
              const el = wrap?.querySelector('.rc-notes .rc-notes-box');
              if(el) el.innerHTML = (!js.notas || !String(js.notas).trim()) ? '—' : `${escapeHtml(js.notas)}`;
              window.modalNotasEquipe.close();
              alertTop('Notas do recurso atualizadas.', 'success');
            } else { throw new Error('Resposta inválida'); }
          }catch(err){ console.error('[escala-diaria] salvar notas recurso', err); alertTop('Erro ao salvar notas do recurso.', 'danger'); }
  }, { title: 'Editar notas do recurso', max: 300 });
      } else {
        alertTop('Modal de notas não carregado.', 'danger');
      }
    }catch(e){ console.error('[escala-diaria] abrir modal notas recurso', e); alertTop('Não foi possível abrir o editor de notas do recurso.', 'danger'); }
  };
  // Funcionários dentro do recurso
  window.es_diaria_removerAtribuicao = async (equipe, recursoId, funcionarioId, extrair=false)=>{
    try{
      const btn = window.event && window.event.target ? window.event.target.closest('button') : null;
      const row = btn ? btn.closest('.turno-row') : null;
      if(!row){ alertTop('Contexto não encontrado para remover a atribuição.', 'danger'); return; }
      if(!funcionarioId || String(funcionarioId).trim()===''){ alertTop('Funcionário inválido para remoção.', 'danger'); return; }
      const escalaId = row.getAttribute('data-escala-id');
      const equipeId = row.getAttribute('data-equipe-id');
      const dia = row.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      if(!escalaId || !equipeId || !dia || !turnoId){ alertTop('Dados insuficientes para remover a atribuição.', 'danger'); return; }
      const msg = extrair
        ? `Extrair o funcionário ${funcionarioId} do recurso ${recursoId} em ${br(dia)} no turno ${turnoId}? Ele será movido para "sem recurso".`
        : `Remover (excluir) o funcionário ${funcionarioId} do recurso ${recursoId} em ${br(dia)} no turno ${turnoId}? Esta remoção é definitiva nesta alocação.`;
      if(!confirm(msg)) return;
      // POST alias preferido
      const urlPost = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/atribuicoes/${encodeURIComponent(funcionarioId)}/delete`;
  let r = await fetch(urlPost, { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId, extrair, escopo:'alocacao' }) });
      if(!r.ok){
        // Fallback DELETE com querystring
        const urlDel = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/recursos/${encodeURIComponent(recursoId)}/atribuicoes/${encodeURIComponent(funcionarioId)}?dia=${encodeURIComponent(dia)}&turnoId=${encodeURIComponent(turnoId)}&extrair=${extrair? '1':'0'}&escopo=alocacao`;
        r = await fetch(urlDel, { method:'DELETE', credentials:'same-origin' });
        if(r.status===405 || r.status===415){
          r = await fetch(urlDel, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId, extrair, escopo:'alocacao' }) });
        }
      }
      if(!r.ok) throw new Error('HTTP '+r.status);
      const js = await r.json();
      if(!(js && js.ok)) throw new Error('Resposta inválida');
      // Remover visualmente a linha do funcionário dentro do recurso
      const recursoBox = row.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(String(recursoId))}"]`);
      if(recursoBox){
        const el = recursoBox.querySelector(`.rc-nomes .grid-func[data-funcionario-id="${cssEscapeSel(String(funcionarioId))}"]`);
        if(el) el.remove();
      }
  // Adicionar funcionário na seção "sem recurso" apenas quando extrair
  if(extrair && js.moved){
        let grid = row.querySelector('.rc-out .rc-grid .rc-nomes');
        if(!grid){
          const container = row.querySelector('.fr-mid .rc-stack');
          if(container){
            const head = `<div class="rc-head"><div>Funcionário</div><div></div><div></div><div></div></div>`;
            const gridHtml = `<div class="rc-grid"><div class="rc-nomes"></div><div></div><div></div><div></div></div>`;
            const wrap = document.createElement('div'); wrap.className='fora-wrap'; wrap.innerHTML = `<div class="rc-box rc-out">${head}${gridHtml}</div>`; container.appendChild(wrap);
            grid = wrap.querySelector('.rc-nomes');
          }
        }
        if(grid){
          const escId = row.getAttribute('data-escala-id'); const eqId = row.getAttribute('data-equipe-id');
          const nome = escapeHtml(String(js.moved.nome || js.moved.id || ''));
          const fid = escapeHtml(String(js.moved.id || ''));
          const btn = fid ? `<button type="button" class="btn btn-outline-danger btn-sm" title="Remover" onclick="window.es_diaria_removerFora('${escapeHtml(escId)}','${escapeHtml(eqId)}','${fid}')"><i class="bi bi-x"></i></button>` : '';
          const tools = btn ? `<div class="rc-toolbar ms-2">${btn}</div>` : '';
          const rowHtml = `<div class="grid-func-solo" data-funcionario-id="${fid}"><span class="func-nome" title="${nome}">${nome}</span>${tools}</div>`;
          grid.insertAdjacentHTML('beforeend', rowHtml);
          // Hidratar nome caso o backend ainda não tenha enviado (evita mostrar ObjectId)
          if(/^[0-9a-fA-F]{24}$/.test(fid) && (!js.moved.nome || js.moved.nome===fid)){
            const el = grid.lastElementChild;
            if(el){
              const span = el.querySelector('.func-nome');
              resolverNomeFuncionario(fid).then(n=>{ if(n && span && span.isConnected){ span.textContent = n; span.setAttribute('title', n); } });
            }
          }
        }
      }
      hydrateNomes(resultado);
  alertTop(extrair ? 'Atribuição removida e funcionário movido para "sem recurso".' : 'Atribuição removida definitivamente desta alocação.', 'success');
    }catch(e){ console.error('[escala-diaria] remover atribuicao', e); alertTop('Erro ao remover a atribuição do recurso.', 'danger'); }
  };
  window.es_diaria_extrairEfetivo = (equipe, recursoId, funcionarioId)=> alertTop(`Extrair efetivo do recurso ${recursoId}: funcionário ${funcionarioId} (equipe ${equipe})`, 'info');
  window.es_diaria_editarAtribuicao = (equipe, recursoId, funcionarioId)=> alertTop(`Editar atribuição do funcionário ${funcionarioId} no recurso ${recursoId} (equipe ${equipe})`, 'info');
  // Remover funcionário sem recurso (componente da equipe)
  window.es_diaria_removerFora = async (escalaId, equipeId, funcionarioId)=>{
    try {
      if(!confirm('Remover este funcionário da equipe?')) return;
      // Capturar contexto da alocação atual para remover adição pontual também
      const row = document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`);
      const dia = row?.getAttribute('data-dia') || currentDiaISO;
      let turnoId = row?.getAttribute('data-turno-id') || '';
      turnoId = String(turnoId||'').trim();
      let url = `/escalas/api/escalas/${encodeURIComponent(escalaId)}/equipes/${encodeURIComponent(equipeId)}/componentes/${encodeURIComponent(funcionarioId)}?dia=${encodeURIComponent(dia)}&turnoId=${encodeURIComponent(turnoId)}`;
      let r = await fetch(url, { method:'DELETE', credentials:'same-origin' });
      if(!r.ok && (r.status===405 || r.status===415)){
        r = await fetch(url, { method:'DELETE', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify({ dia, turnoId }) });
      }
      if(!r.ok) throw new Error('HTTP '+r.status);
      const js = await r.json();
      if(js && js.ok){
        // Remover o elemento visual do funcionário
        const row = document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(escalaId))}"][data-equipe-id="${cssEscapeSel(String(equipeId))}"]`);
        const grid = row ? row.querySelector('.rc-out .rc-grid .rc-nomes') : null;
        if(grid){
          const items = Array.from(grid.querySelectorAll('.grid-func-solo'));
          for(const el of items){
            const nameEl = el.querySelector('.func-nome');
            const btn = el.querySelector('button');
            if(btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(funcionarioId)){
              el.remove();
              break;
            } else if(nameEl && nameEl.textContent && nameEl.textContent.includes(funcionarioId)){
              el.remove();
              break;
            }
          }
        }
        alertTop('Funcionário removido da equipe.', 'success');
      } else { throw new Error('Resposta inválida'); }
    } catch(e){ console.error('[escala-diaria] remover funcionario fora', e); alertTop('Erro ao remover funcionário da equipe.', 'danger'); }
  };

  // Buscar
  async function pesquisar(){
    const unidadeId = $('filtroUnidade').value.trim();
    const incluirFiliais = $('chkIncluirFiliais').checked? '1':'0';
    const ord = $('chkOrd').checked; const ext = $('chkExt').checked;
    const dataBr = $('dataDia').value.trim();
    if(!unidadeId){ alertTop('Selecione uma unidade.', 'warning'); return; }
    if(!dataBr){ alertTop('Selecione a data.', 'warning'); return; }
    const diaISO = isoFromBr(dataBr);
    try {
      resultado.innerHTML = '<div class="text-center text-muted small">Carregando...</div>';
  currentDiaISO = diaISO;
  const params = new URLSearchParams({ unidadeId, dia: diaISO });
      if(incluirFiliais==='1') params.set('filiais','1');
      if(ord && !ext) params.set('classificacao','ORDINÁRIA');
      else if(ext && !ord) params.set('classificacao','EXTRAORDINÁRIA');
      // se ambos marcados ou nenhum, não envia classificacao (retorna ambos)
      const r = await fetch(`/escalas/api/escalas/diaria?${params.toString()}`, { credentials:'same-origin' });
      if(!r.ok) throw new Error('HTTP '+r.status);
      const js = await r.json();
      renderDia(js);
    } catch(e){ console.error('[escala-diaria] erro', e); alertTop('Erro ao carregar escala diária.'); renderVazio(); }
  }

  // Relatório (abre PDF consolidado do dia)
  function abrirRelatorio(){
    // Coletar escalas selecionadas (checkbox marcado)
    const marcados = Array.from(document.querySelectorAll('#resultado .escala-chk:checked'));
    const ids = marcados.map(el=> el.getAttribute('data-id')).filter(Boolean);
    if(ids.length === 0){ alertTop('Nenhuma escala selecionada para o relatório.', 'warning'); return; }
    // Parâmetros da diária
    const diaISO = currentDiaISO || (function(){ try { const v=document.getElementById('dataDia')?.value||''; const m=v.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m? `${m[3]}-${m[2]}-${m[1]}`: null; } catch{ return null; } })();
    if(!diaISO){ alertTop('Informe a data da diária.', 'warning'); return; }
    // Abrir relatório diário consolidado (uma única aba) com todas as escalas selecionadas
    const qs = new URLSearchParams({ ids: ids.join(','), dia: diaISO }).toString();
  // Usar rota com nome amigável no caminho para o viewer exibir "Relatorio.pdf"
  const url = `/escalas/relatorios/diaria/Relatorio.pdf?${qs}`;
    window.open(url,'_blank');
  }

  // Wire
  function init(){ initCalendars(); carregarUnidades(); $('btnPesquisar').onclick=async ()=>{ await pesquisar(); hydrateNomesFora(); }; $('btnRelatorio').onclick=abrirRelatorio; }
  // proteção: evitar erro se hydrateNomesFora não existir
  try { if(typeof window.hydrateNomesFora!=='function'){ window.hydrateNomesFora = function(){}; } } catch(_){ }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();

  // Delegação: recolher/expandir conteúdo da escala
  if(resultado){
    resultado.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('.btn-toggle-escala');
      if(!btn) return;
      const targetId = btn.getAttribute('data-target');
      if(!targetId) return;
      const el = document.getElementById(targetId);
      if(!el) return;
      const isHidden = el.classList.contains('d-none');
      if(isHidden){
        el.classList.remove('d-none');
        btn.setAttribute('aria-expanded','true');
        btn.textContent = '-';
        btn.setAttribute('title','Recolher');
      } else {
        el.classList.add('d-none');
        btn.setAttribute('aria-expanded','false');
        btn.textContent = '+';
        btn.setAttribute('title','Expandir');
      }
    });
  }

  // UI live-update: quando o modal salvar o recurso, inserir o box na equipe/turno/dia atuais
  document.addEventListener('escala:recurso-salvo', (ev)=>{
    try {
      const ctx = window.__DIARIA_INSERT_CTX__ || null;
      const recurso = ev && ev.detail ? ev.detail.recurso : null;
      if(!ctx || !recurso) return;
      const recEquipeId = recurso.equipeId || recurso.equipe_id || recurso.equipe || null;
      if(recEquipeId && String(recEquipeId) !== String(ctx.equipeId)) return;
      const row = document.querySelector(`.turno-row[data-escala-id="${cssEscapeSel(String(ctx.escalaId))}"][data-equipe-id="${cssEscapeSel(String(ctx.equipeId))}"][data-turno-id="${cssEscapeSel(String(ctx.turnoId))}"]`);
      if(!row) return;
      const stack = row.querySelector('.fr-mid .rc-stack');
      if(!stack) return;
      const rid = String(recurso.id || recurso.referenciaGestorId || recurso.placa || '').trim();
      if(!rid) return;
      if(stack.querySelector(`.rc-box[data-recurso-id="${cssEscapeSel(rid)}"]`)) return; // já existe
      const escId = ctx.escalaId; const eqId = ctx.equipeId; const eqNome = ctx.equipeNome || '';
      const badgeInner = `<span class="badge-recurso rc-badge">${escapeHtml(String(recurso.nome || recurso.placa || rid))}</span>`;
      const actions = `<div class="rc-toolbar">`
        + `<button type="button" class="btn btn-outline-secondary btn-sm" title="Editar recurso" onclick="window.es_diaria_editarRecurso('${escapeHtml(eqNome)}','${escapeHtml(rid)}')"><i class="bi bi-pencil"></i></button>`
        + `<button type="button" class="btn btn-outline-danger btn-sm" title="Excluir recurso" onclick="window.es_diaria_excluirRecurso('${escapeHtml(eqNome)}','${escapeHtml(rid)}')"><i class="bi bi-trash"></i></button>`
        + `<button type="button" class="btn btn-outline-primary btn-sm" title="Inserir efetivo" onclick="window.es_diaria_inserirEfetivoRecurso('${escapeHtml(eqNome)}','${escapeHtml(rid)}')"><i class="bi bi-person-plus"></i></button>`
        + `<button type="button" class="btn btn-outline-secondary btn-sm" title="Editar notas do recurso" onclick="window.es_diaria_editarNotasRecurso('${escapeHtml(escId)}','${escapeHtml(eqId)}','${escapeHtml(rid)}')"><i class="bi bi-stickies"></i></button>`
        + `</div>`;
      const head = `<div class="rc-head"><div>Funcionário</div><div>Nome do Recurso</div><div>Ações</div><div>Notas do recurso</div></div>`;
      const nomes = `<div class="rc-nomes text-muted small">—</div>`;
  // No modo diária, o recurso recém-inserido não deve exibir refeições
  const refeicoes = [];
      const refTitulo = `<div class="form-text text-muted mt-2 mb-1">Refeições</div>`;
      let refSec = refTitulo + `<div class="text-muted small">—</div>`;
      if(refeicoes.length){
        const linhas = refeicoes.map(iv=>{
          const ini = escapeHtml(String(iv.ini||''));
          const fim = escapeHtml(String(iv.fim||''));
          const compTxt = (iv && iv.computavel === false) ? 'não computável' : 'computável';
          return `<div class=\"meal-row\">${ini} - ${fim} (${escapeHtml(compTxt)})</div>`;
        }).join('');
        refSec = refTitulo + `<div class=\"rc-meals-box\">${linhas}</div>`;
      }
      const notasEl = `<div class="rc-notes"><div class="rc-box rc-notes-box">—</div>${refSec}</div>`;
      const boxHtml = `<div class="rc-box" data-recurso-id="${escapeHtml(rid)}">${head}<div class="rc-grid">${nomes}<div class="rc-badge">${badgeInner}</div><div class="rc-actions">${actions}</div>${notasEl}</div></div>`;
      const fora = stack.querySelector('.fora-wrap');
      if(fora){ fora.insertAdjacentHTML('beforebegin', boxHtml); }
      else { stack.insertAdjacentHTML('afterbegin', boxHtml); }
      alertTop('Recurso inserido nesta alocação.', 'success');
      window.__DIARIA_INSERT_CTX__ = null;
    } catch(err){ console.warn('[escala-diaria] atualizar UI pós recurso salvo falhou', err); }
  });
})();
