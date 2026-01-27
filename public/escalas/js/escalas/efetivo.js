(function(){
  function bp(){ try{ return document.body.getAttribute('data-base-path') || '/escalas'; }catch(_){ return '/escalas'; } }
  function getModal(){ return document.getElementById('modalEfetivoEquipe'); }
  function isoToBr(iso){ try{ const s=String(iso||'').slice(0,10); const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m? `${m[3]}/${m[2]}/${m[1]}`: s; }catch(_){ return String(iso||''); } }
  function getPeriodo(){
    try{
      const st = window.__ESCALA_STATE__ || {};
      if(st?.periodo?.ini && st?.periodo?.fim) return { ini: st.periodo.ini, fim: st.periodo.fim };
      const diBr = document.getElementById('dataInicio')?.value || ''; const dfBr = document.getElementById('dataFim')?.value || '';
      const brToISO = (v)=>{ const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v||'')); return m? `${m[3]}-${m[2]}-${m[1]}`:''; };
      return { ini: brToISO(diBr), fim: brToISO(dfBr) };
    }catch(_){ return { ini:'', fim:'' }; }
  }
  function getEscalaId(){ try{ const u=new URL(location.href); return u.searchParams.get('id')||''; }catch(_){ return ''; } }
  function getUnidadeId(){ try{ const st=window.__ESCALA_STATE__||{}; return st?.dadosGerais?.unidadeId || document.getElementById('unidadeEscala')?.value || ''; }catch(_){ return ''; } }
  function getList(modal){
    if(!modal) modal=getModal(); if(!modal) return [];
    // Preferir a lista canônica usada pelo binder principal
    if(Array.isArray(modal.__editingList)) return modal.__editingList;
    if(!modal.__efList) modal.__efList = [];
    // Sincroniza referência para evitar divergência entre implementações
    modal.__editingList = modal.__efList;
    return modal.__editingList;
  }
  function setList(list, modal){
    if(!modal) modal=getModal(); if(!modal) return;
    const arr = Array.isArray(list) ? list : [];
    modal.__editingList = arr;
    modal.__efList = arr;
  }
  function esc(s){ return String(s||'').replace(/</g,'&lt;'); }
  function isHex24(v){ return typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v); }
  function normCodeKey(v){ try{ const s=String(v||'').trim().toUpperCase(); if(!s) return ''; if(/^FUNC\d+$/i.test(s)) return s; const digits=s.replace(/\D/g,''); return digits? ('FUNC'+digits) : s; }catch(_){ return String(v||'').trim().toUpperCase(); } }
  async function fetchBuscaCodigo(codigo){ if(!codigo) return null; const urls=[ bp()+`/api/funcionarios/busca-codigo?codigo=${encodeURIComponent(codigo)}`, `/api/funcionarios/busca-codigo?codigo=${encodeURIComponent(codigo)}` ]; for(const u of urls){ try{ const r=await fetch(u,{credentials:'same-origin'}); if(r.ok){ const j=await r.json(); if(j?.data) return j.data; } }catch(_e){} } return null; }
  async function fetchCluster(){ const uid=getUnidadeId(); const urls=[]; if(uid){ urls.push(bp()+`/api/funcionarios-responsaveis?unidade=${encodeURIComponent(uid)}&incluirFiliais=1`); urls.push(`/api/funcionarios-responsaveis?unidade=${encodeURIComponent(uid)}&incluirFiliais=1`); } urls.push(bp()+`/api/funcionarios-responsaveis?incluirFiliais=1`); urls.push(`/api/funcionarios-responsaveis?incluirFiliais=1`); for(const u of urls){ try{ const r=await fetch(u,{credentials:'same-origin'}); if(r.ok){ const j=await r.json(); if(Array.isArray(j?.data)) return j.data; } }catch(_e){} } return []; }

  function render(modal){
    modal = modal || getModal(); if(!modal) return;
    const tbody = modal.querySelector('#tabelaEfetivoEquipe tbody'); if(!tbody) return;
    const list = getList(modal);
    tbody.innerHTML = list.length ? list.map((c,i)=>{
      const ident = (c.matricula||c.codigo||c.id||'') + (c.nome? ' - '+c.nome : '');
      return `<tr data-idx="${i}"><td class="align-middle small">${esc(ident)}</td><td class="align-middle small"><span class="text-muted small">(calculando...)</span></td><td class="align-middle text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="rem-comp">Remover</button></td></tr>`;
    }).join('') : '<tr class="text-muted"><td colspan="3" class="text-center small">Sem componentes.</td></tr>';
    // recalcular períodos
    setTimeout(()=> atualizarPeriodosDisponiveis(modal), 0);
  }

  async function atualizarPeriodosDisponiveis(modal){
    modal = modal || getModal(); if(!modal) return;
    const tbody = modal.querySelector('#tabelaEfetivoEquipe tbody'); if(!tbody) return;
    const linhas = Array.from(tbody.querySelectorAll('tr[data-idx]'));
  const { ini, fim } = getPeriodo();
  // normaliza para YYYY-MM-DD (sem horário) pois o endpoint espera data simples
  const iniDay = (ini||'').slice(0,10);
  const fimDay = (fim||'').slice(0,10);
    const uid = getUnidadeId();
    await Promise.all(linhas.map(async tr=>{
      try{
        const idx = parseInt(tr.getAttribute('data-idx')||'-1',10); const item=getList(modal)[idx]; if(!item) return;
        // tenta obter id do funcionario via cluster se não houver
        let fid = item.funcionario_id || item.id || '';
        if(!isHex24(fid)){
          const cluster = await fetchCluster();
          const byCode = new Map(cluster.map(x=> [normCodeKey(x.codigo||''), x]));
          const key = normCodeKey(item.matricula||item.codigo||'');
          const row = byCode.get(key);
          if(row?.id) fid = row.id;
        }
        let html = '<span class="text-muted small">-</span>';
        if(fid && iniDay && fimDay){
          try{
            const u = bp()+`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(fid)}&inicio=${encodeURIComponent(iniDay)}&fim=${encodeURIComponent(fimDay)}`;
            const r = await fetch(u, { credentials:'same-origin' });
            if(r.ok){
              const j = await r.json();
              const data = j && j.data || {};
              const free = Array.isArray(data.free)? data.free: [];
              if(free.length){
                const linhas = free.map(x=>{
                  const i = (x.inicioISO||x.inicio||x.ini||'').slice(0,10);
                  const f = (x.fimISO||x.fim||x.fimISO||'').slice(0,10);
                  if(!i||!f) return null;
                  return `${isoToBr(i)} à ${isoToBr(f)}`;
                }).filter(Boolean);
                html = `<span class="small">${linhas.join('<br>')}</span>`;
              } else {
                html = '<span class="text-danger fw-semibold small">Indisponível</span>';
              }
            }
          }catch(_e){ html = '<span class="text-muted small">-</span>'; }
        }
        const td = tr.children[1]; if(td) td.innerHTML = html;
      }catch(_e){}
    }));
  }

  async function addFromInput(){
    const modal = getModal(); if(!modal) return;
    const input = modal.querySelector('#efetivoCodigo'); if(!input) return;
    const raw = (input.value||'').trim(); if(!raw) return;
    const f = await fetchBuscaCodigo(raw);
    if(!f){ alert('Funcionário não encontrado.'); return; }
    const list = getList(modal);
    const key = String(f.id||f._id||f.funcionario_id||f.codigo||f.cpf||raw).toUpperCase();
    if(list.some(c=> String(c.funcionario_id||c.id||c.codigo||c.cpf).toUpperCase()===key)) return;
  list.push({ id:f.id||f._id||key, funcionario_id:f.id||f._id||null, matricula:f.codigo||f.cpf||raw, nome:f.nome||'' });
  setList(list, modal);
  input.value='';
  render(modal);
  try { window.dispatchEvent(new CustomEvent('escala:efetivo:lista-modificada')); } catch(_){}
  }

  function getEquipeRef(){
    const modal = getModal(); if(!modal) return { id:null, nome:'' };
    let eqId = modal.dataset.eqId || (window.__LAST_EQ_FOR_EFETIVO__ && window.__LAST_EQ_FOR_EFETIVO__.id) || null;
    let nome = modal.dataset.eqNome || (window.__LAST_EQ_FOR_EFETIVO__ && window.__LAST_EQ_FOR_EFETIVO__.nome) || '';
    return { id:eqId, nome:nome };
  }

  async function salvar(){
    const modal = getModal(); if(!modal) return;
    const { id: eqId, nome: alvoNome } = getEquipeRef();
    if(!eqId){ alert('Equipe inválida.'); return; }
    const escalaId = getEscalaId(); if(!escalaId){ alert('Crie/salve os Dados Gerais antes de salvar.'); return; }
    // Bloqueio pró-ativo quando a escala estiver fechada
    try {
      if(typeof window.__isEscalaFechada==='function' && window.__isEscalaFechada()){
        try{ if(window.__toastEscalaFechada) window.__toastEscalaFechada(); else if(window.__toastInfo) window.__toastInfo('Escala fechada. Proibida a edição!'); }catch(_t){}
        return;
      }
    } catch(_pre){ }
    async function getEscala(){
      try { const r=await fetch(bp()+`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); if(r.ok) return await r.json(); } catch(_e){}
      try { const r2=await fetch(`/api/escalas/${encodeURIComponent(escalaId)}`, { credentials:'same-origin' }); if(r2.ok) return await r2.json(); } catch(_e2){}
      return null;
    }
    async function putEscala(body){
      const tries = [ bp()+`/api/escalas/${encodeURIComponent(escalaId)}`, `/api/escalas/${encodeURIComponent(escalaId)}` ];
      for(const u of tries){
        try{
          const r = await fetch(u, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body) });
          if(r.ok) return r;
          if(r.status===423 && typeof window.handleEscalaLockedResponse==='function'){
            try { const handled = await window.handleEscalaLockedResponse(r, { origem:'efetivo-save' }); if(handled) return { ok:false, __locked:true }; } catch(_h){}
          }
        }catch(_p){}
      }
      return { ok:false };
    }
    const payload = await getEscala(); if(!payload){ alert('Falha ao carregar a escala do servidor.'); return; }
    let d = payload && (payload.data||payload.escala||payload);
    const list = getList(modal);
    const { ini, fim } = getPeriodo();
    const iniDay = (ini||'').slice(0,10); const fimDay = (fim||'').slice(0,10);
    // Helper para resolver funcionarioId válido (ObjectId) a partir do item
    async function resolveFuncionarioId(item){
      try{
        let fid = item.funcionario_id || item.id || '';
        if(isHex24(fid)) return fid;
        const cluster = await fetchCluster();
        const byCode = new Map(cluster.map(x=> [normCodeKey(x.codigo||''), x]));
        const key = normCodeKey(item.matricula||item.codigo||'');
        const row = byCode.get(key);
        if(row && isHex24(row.id)) return row.id;
      }catch(_){ }
      return null;
    }
    async function calcularDisponibilidade(fid){
      if(!fid || !isHex24(fid) || !iniDay || !fimDay) return null;
      try{
        const u = bp()+`/api/disponibilidade-funcionario?funcionarioId=${encodeURIComponent(fid)}&inicio=${encodeURIComponent(iniDay)}&fim=${encodeURIComponent(fimDay)}`;
        const r = await fetch(u, { credentials:'same-origin' });
        if(!r.ok) return null;
        const j = await r.json();
        const data = j && j.data;
        if(!data) return null;
        const blocked = Array.isArray(data.blocked)? data.blocked: [];
        const free = Array.isArray(data.free)? data.free: [];
        return { base:{ inicio:iniDay, fim:fimDay }, blocked, free };
      }catch(_){ return null; }
    }
    // Montar componentes com disponibilidade calculada (período da escala menos férias/ausências)
    async function diasFromFreeIntervals(free){
      try{
        if(!Array.isArray(free) || !free.length) return [];
        const out=[];
        for(const r of free){
          const i=(r.inicio||r.inicioISO||r.ini||'').slice(0,10);
          const f=(r.fim||r.fimISO||r.fimISO||'').slice(0,10);
          if(!i||!f) continue;
          const d0=new Date(i+'T00:00:00'); const d1=new Date(f+'T00:00:00');
          for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)) out.push(d.toISOString().slice(0,10));
        }
        return Array.from(new Set(out));
      }catch(_){ return []; }
    }
    const comps = await Promise.all(list.map(async c=>{
      const fid = await resolveFuncionarioId(c);
      const disp = await calcularDisponibilidade(fid); // { base, blocked, free }
      const free = Array.isArray(disp?.free)? disp.free: [];
      const blocked = Array.isArray(disp?.blocked)? disp.blocked: [];
      const disponibilidade = free.map(x=>({ ini: String(x.inicio||x.inicioISO||x.ini||'').slice(0,10), fim: String(x.fim||x.fimISO||x.fimISO||'').slice(0,10) }))
                                 .filter(iv=> iv.ini && iv.fim);
      const indisponibilidades = blocked.map(x=>({ ini: String(x.inicio||'').slice(0,10), fim: String(x.fim||'').slice(0,10), tipo: x.tipo||null }))
                                       .filter(iv=> iv.ini && iv.fim);
      const diasDisponiveis = await diasFromFreeIntervals(free);
      return {
        id: c.id,
        funcionario_id: c.funcionario_id||c.id,
        nome: c.nome,
        matricula: c.matricula||c.codigo||null,
        periodo: { ini, fim },
        periodoIni: (ini||'').slice(0,10),
        periodoFim: (fim||'').slice(0,10),
        disponibilidade,
        indisponibilidades,
        diasDisponiveis
      };
    }));
    let equipes = Array.isArray(d?.equipes)? d.equipes : (Array.isArray(d?.lista_equipes)? d.lista_equipes: []);
    if(!Array.isArray(equipes)) equipes=[];
    let idx = equipes.findIndex(e=> String(e.id||e._id)===String(eqId));
    if(idx<0 && alvoNome){ idx = equipes.findIndex(e=> String((e.nome||'').toUpperCase())===String(alvoNome).toUpperCase()); }
    if(idx>=0){ equipes[idx] = Object.assign({}, equipes[idx], { componentes: comps }); } else { equipes.push({ id:eqId, nome: alvoNome||'EQ', descricao:'', componentes: comps }); }
  let ok=false; const r1=await putEscala({ equipes }); if(r1 && r1.ok){ ok=true; }
  else { const r2=await putEscala({ equipesOverwrite:true, equipes }); if(r2 && r2.ok){ ok=true; } else if(r1 && r1.__locked || r2 && r2.__locked){ return; } }
  if(!ok){ alert('Falha ao salvar componentes da equipe.'); return; }
    // Sincroniza a UI imediatamente após salvar
    try {
      // Recarrega a escala completa para atualizar o estado principal, se o orquestrador expôs a função
      if(typeof window.carregarEscalaExistente === 'function'){
        try { await window.carregarEscalaExistente(escalaId); } catch(_rld){}
      }
      // Tenta re-renderizar as equipes se a função estiver disponível globalmente
      try { if(typeof window.renderEquipes === 'function') window.renderEquipes(); } catch(_re){}
      // Atualiza matrizes que dependem dos componentes, se existir
      try { if(typeof window.renderMatrizesPorGrupo === 'function') window.renderMatrizesPorGrupo(); } catch(_rm){}
      // Notifica outros módulos para reagirem à alteração
      try { document.dispatchEvent(new CustomEvent('escala:equipes-alteradas', { detail:{ tipo:'update', equipeId:eqId } })); } catch(_evt){}
    } catch(_sync){}
    try { const inst=bootstrap.Modal.getOrCreateInstance(modal); inst && inst.hide(); } catch(_b){}
  }

  // Delegações no modal
  document.addEventListener('click', function(ev){
    try{
      const t=ev.target; const modal = t && (t.closest && t.closest('#modalEfetivoEquipe'));
      if(!modal) return;
  if(t.closest && t.closest('button[data-act="rem-comp"]')){ ev.preventDefault(); ev.stopPropagation(); const tr=t.closest('tr[data-idx]'); const idx=parseInt(tr?.getAttribute('data-idx')||'-1',10); const list=getList(modal); if(idx>=0){ list.splice(idx,1); setList(list, modal); render(modal); try { window.dispatchEvent(new CustomEvent('escala:efetivo:lista-modificada')); } catch(_){} } return; }
    }catch(_e){}
  }, true);
  document.addEventListener('keydown', function(ev){ try{ const el=ev.target; if(!el || el.id!=='efetivoCodigo') return; const modal=el.closest('#modalEfetivoEquipe'); if(!modal) return; if(ev.key==='Enter'){ ev.preventDefault(); ev.stopPropagation(); addFromInput(); } }catch(_e){} }, true);
  document.addEventListener('show.bs.modal', function(ev){
    try{
      const el=ev.target; if(el && el.id==='modalEfetivoEquipe'){
        // garantir input vazio a cada abertura do modal
        try {
          const inp = el.querySelector('#efetivoCodigo');
          if(inp){ inp.value=''; inp.setAttribute('value',''); }
        } catch(_cl){}
        render(el);
        setTimeout(()=> atualizarPeriodosDisponiveis(el), 60);
      }
    }catch(_e){}
  });

  // também limpar ao fechar, para evitar persistência pelo DOM do navegador
  document.addEventListener('hidden.bs.modal', function(ev){
    try{
      const el=ev.target; if(el && el.id==='modalEfetivoEquipe'){
        const inp = el.querySelector('#efetivoCodigo');
        if(inp){ inp.value=''; inp.setAttribute('value',''); }
      }
    }catch(_e){}
  });

  // Expor funções globais usadas no markup
  try { window.__EF_addFromInput = addFromInput; } catch(_e){}
  try { window.__efAddByCodigo = function(modal){ addFromInput(); }; } catch(_e){}
  try { window.__EF_save = salvar; } catch(_e){}
  try { window.__efForceRefreshLista = function(){ render(); }; } catch(_e){}
  try { window.__abrirPesquisaEfetivoFromBtn = function(btn){ try{ const mp=document.getElementById('modalPesquisarEfetivo'); if(mp){
        // marcar empilhamento e prevenir fechamento do modal de efetivo
        try{ const ef=document.getElementById('modalEfetivoEquipe'); if(ef){ window.__EF_PESQ_OPENED_FROM_EQ__ = true; const ph=function(e){ try{ e.preventDefault(); }catch(_){} }; if(!ef.__preventHideBound){ ef.addEventListener('hide.bs.modal', ph); ef.__preventHideBound = ph; } } }catch(_s){}
        const inst=bootstrap.Modal.getOrCreateInstance(mp); inst.show();
        if(window.WDG && typeof WDG.abrirModalPesquisarEfetivo==='function'){ WDG.abrirModalPesquisarEfetivo({ mode:'multi' }); }
      } }catch(_e){} }; } catch(_e){}
  // Fallback: escutar eventos globais do modal de pesquisa
  try { window.addEventListener('escala:efetivoSelecionadoMultiplo', function(e){ try{ const arr=e && e.detail; if(Array.isArray(arr)) arr.forEach(it=> window.__efAdicionarSelecionadoEfetivo && window.__efAdicionarSelecionadoEfetivo(it)); }catch(_){}}); } catch(_g){}
  try { window.addEventListener('escala:efetivoSelecionado', function(e){ try{ const it=e && e.detail; if(it) window.__efAdicionarSelecionadoEfetivo && window.__efAdicionarSelecionadoEfetivo(it); }catch(_){}}); } catch(_g2){}
  // Recebe itens do modal de pesquisa e adiciona à lista
  try { window.__efAdicionarSelecionadoEfetivo = function(item){ try{
      const modal=getModal(); if(!modal) return; const list=getList(modal);
      if(Array.isArray(item)){ item.forEach(it=> window.__efAdicionarSelecionadoEfetivo(it)); return; }
      const key = String(item && (item.id||item._id||item.funcionario_id||item.codigo||item.cpf)||'').toUpperCase(); if(!key) return;
      if(list.some(c=> String(c.funcionario_id||c.id||c.codigo||c.cpf).toUpperCase()===key)) return;
      list.push({ id:item.id||item._id||key, funcionario_id:item.id||item._id||null, matricula:item.codigo||item.cpf||'', nome:item.nome||'' });
      setList(list, modal);
      render(modal);
      // Dispara evento e recálculo imediato se disponível
      try { window.dispatchEvent(new CustomEvent('escala:efetivo:lista-modificada')); } catch(_){}
      try { if(typeof modal.__efRecalc==='function') modal.__efRecalc(); else setTimeout(()=> atualizarPeriodosDisponiveis(modal), 0); } catch(_){}
    }catch(_e){} }; } catch(_e){}
  // Atualiza título do modal com o nome da equipe
  document.addEventListener('show.bs.modal', function(ev){ try{ const el=ev.target; if(el && el.id==='modalEfetivoEquipe'){ const nm = el.querySelector('#efetivoEquipeNome'); if(nm){ const ref=getEquipeRef(); nm.textContent = ref && ref.nome? String(ref.nome): ''; } } }catch(_e){} });
})();
