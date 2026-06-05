// Modal Banco (robusto com MutationObserver)
(() => {
  const IDs = { modal:'modalBanco', tbody:'modalBancoTbody', search:'modalBancoPesquisa', confirm:'modalBancoConfirmar', clear:'modalBancoLimpar', outroCheck:'modalBancoOutroCheck', outroWrap:'modalBancoOutro', outroCod:'modalBancoOutroCodigo', outroNome:'modalBancoOutroNome' };
  const $ = id => document.getElementById(id);
  const getTargetInput = () => document.getElementById('banco') || document.getElementById('extra_banco');

  // Estado
  let cache = [];
  let filtrados = [];
  const DEFAULT_BANCOS = [
    { codigo:'001', nome:'Banco do Brasil S.A.' },
    { codigo:'033', nome:'Banco Santander (Brasil) S.A.' },
    { codigo:'104', nome:'Caixa Econômica Federal' },
    { codigo:'237', nome:'Banco Bradesco S.A.' },
    { codigo:'341', nome:'Itaú Unibanco S.A.' }
  ];
  const debounce = (fn, wait=250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),wait); }; };
  const escapeHtml = (s='') => String(s).replace(/[&<>"]|'/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m]));

  function fallbackBancos(){
    const arr = (window.__WD && Array.isArray(window.__WD.bancos)) ? window.__WD.bancos : [];
    return arr.map(b => ({ codigo: String(b.codigo).padStart(3,'0'), nome: b.nome||'' })).filter(b=>b.codigo && b.nome);
  }

  async function carregarBancos(){
    if (cache.length) return cache;
    const tentativas=[]; let lastError=null;

    // 1) API principal
    try {
      const basePath = document.body?.getAttribute('data-base-path') || window.__WD_BASE_PATH || '/gestor';
      const apiUrl = (basePath.endsWith('/')?basePath.slice(0,-1):basePath) + '/api/bancos';
      const t0=performance.now();
      const res = await fetch(apiUrl, { cache:'no-store' });
      if(res.ok){ const data=await res.json(); processar(apiUrl, data, tentativas, t0); if(cache.length) return cache; } else { tentativas.push({ok:false,path:apiUrl,status:res.status}); }
    } catch(e){ lastError=e; tentativas.push({ok:false,path:'(api/bancos)',erro:e.message}); }

    // 2) fetchGestorData (helper + candidatos locais)
    const dados = await fetchGestorData('bancos.json', tentativas);
    if (dados){ processar(dados.__from||'(fetchGestorData)', dados.data||dados, tentativas, performance.now()); if(cache.length) return cache; }

    // 3) Fallback interno (window.__WD ou DEFAULT)
    cache = fallbackBancos();
    if(!cache.length) cache = DEFAULT_BANCOS.slice();
    tentativas.push({ ok:true, fallback:true, quantidade: cache.length });
    console.info('[Modal Banco] Tentativas (final):', tentativas, { lastError:lastError?.message });
    return cache;
  }

  async function fetchGestorData(nome, tentativas){
    const r = await window.wdgFetchGestorJson?.(nome);
    if(r && r.ok){ return { data:r.data, __from:r.path||'(gestor-json)', tried:r.tried||[] }; }
    tentativas && tentativas.push({ ok:false, nome, tried: (r?r.tried:[]) });
    return null;
  }

  function processar(path, data, tentativas, t0){
    let arr;
    if (Array.isArray(data)) arr = data;
    else if (Array.isArray(data?.bancos)) arr = data.bancos;
    else arr = data?.items || data?.values || [];
    cache = arr.map(x=>({ codigo:String(x.codigo??x.cod??x.code??x.id??'').padStart(3,'0'), nome:String(x.nome??x.name??x.label??x.descricao??'') })).filter(x=>x.codigo&&x.nome);
    cache.sort((a,b)=>a.codigo.localeCompare(b.codigo));
    const info = { path, quantidade: cache.length, ms: ((performance.now()-t0)|0) };
    tentativas.push({ ok:true, ...info });
    console.debug('[Modal Banco] Carregado', info);
  }

  function ensureInit(){
    const modal = $(IDs.modal);
    if(!modal) return false;
    if(modal.__bancoInit){ return true; }
    modal.__bancoInit = true;
    const focusSafe = window.wdgModalFocusSafe?.install?.(modal, {
      getReturnFocus: () => getTargetInput(),
    }) || null;
    console.debug('[Modal Banco] Inicializando handlers (modal presente)');

    const tbody = $(IDs.tbody), search=$(IDs.search), btnConfirm=$(IDs.confirm), btnClear=$(IDs.clear), chkOutro=$(IDs.outroCheck), outroWrap=$(IDs.outroWrap), outroCod=$(IDs.outroCod), outroNome=$(IDs.outroNome), btnReload=document.getElementById('modalBancoReload');

    function render(list){
      if(!tbody) return;
      if(!list.length){ tbody.innerHTML='<tr><td colspan="3" class="text-muted py-2">Nenhum banco encontrado.</td></tr>'; return; }
      tbody.innerHTML=list.map(b=>`<tr class="align-middle">\n        <td class="text-center" style="width:72px;">\n          <input class="form-check-input" type="radio" name="bancoOpt" value="${b.codigo}" data-codigo="${b.codigo}" data-nome="${escapeHtml(b.nome)}">\n        </td>\n        <td class="text-center" style="width:110px;">${b.codigo}</td>\n        <td>${escapeHtml(b.nome)}</td>\n      </tr>`).join('');
    }
    function aplicarFiltro(term){ const t=(term||'').trim().toLowerCase(); filtrados = !t ? cache.slice() : cache.filter(b=>b.codigo.toLowerCase().includes(t)||b.nome.toLowerCase().includes(t)); render(filtrados); }
    const filtroDebounced = debounce(aplicarFiltro,220);

    modal.addEventListener('show.bs.modal', async () => {
      console.debug('[Modal Banco] show.bs.modal disparado');
      try { await carregarBancos(); } catch(err){ console.error('[Modal Banco] Erro carregarBancos', err); }
      aplicarFiltro('');
      if(search){ search.value=''; setTimeout(()=>search.focus(),120); }
      if(chkOutro) chkOutro.checked=false;
      outroWrap?.classList.add('d-none');
      if(outroCod) outroCod.value=''; if(outroNome) outroNome.value='';
    });

    search?.addEventListener('input', e=>filtroDebounced(e.target.value));
    chkOutro?.addEventListener('change', ()=>{ if(chkOutro.checked){ tbody?.querySelectorAll('input[type="radio"][name="bancoOpt"]').forEach(r=>r.checked=false); outroWrap?.classList.remove('d-none'); outroCod?.focus(); } else { outroWrap?.classList.add('d-none'); outroCod&&(outroCod.value=''); outroNome&&(outroNome.value=''); } });
    btnClear?.addEventListener('click', ()=>{ const tgt=getTargetInput(); if(tgt) tgt.value=''; tbody?.querySelectorAll('input[type="radio"][name="bancoOpt"]').forEach(r=>r.checked=false); if(chkOutro) chkOutro.checked=false; outroWrap?.classList.add('d-none'); outroCod&&(outroCod.value=''); outroNome&&(outroNome.value=''); search&&(search.value=''); aplicarFiltro(''); });
    btnConfirm?.addEventListener('click', ()=>{ const tgt=getTargetInput(); if(!tgt){ console.warn('[Modal Banco] Campo destino não encontrado'); return; } if(chkOutro && chkOutro.checked){ const cod=(outroCod?.value||'').trim(); const nom=(outroNome?.value||'').trim(); if(!cod||!nom){ alert('Informe código e nome do banco.'); return; } tgt.value=`${cod} - ${nom}`; } else { const sel=tbody?.querySelector('input[type="radio"][name="bancoOpt"]:checked'); if(!sel){ alert('Selecione um banco.'); return; } const codigo=sel.getAttribute('data-codigo')||sel.value; const nome=sel.getAttribute('data-nome')||''; tgt.value=`${codigo} - ${nome}`; } if(focusSafe){ focusSafe.hide(tgt); } else { (bootstrap.Modal.getInstance(modal)||bootstrap.Modal.getOrCreateInstance(modal)).hide(); } tgt.dispatchEvent(new Event('change',{bubbles:true})); });

    if(btnReload){ const isDev=!/prod|www\./i.test(location.host); if(isDev) btnReload.classList.remove('d-none'); btnReload.addEventListener('click', async ()=>{ console.info('[Modal Banco] Recarga manual'); cache=[]; await carregarBancos(); aplicarFiltro(search?.value||''); }); }

    (async()=>{ try { await carregarBancos(); if(cache.length) console.debug('[Modal Banco] Pré-carregado (lazy) quantidade=', cache.length); } catch(e){ console.warn('[Modal Banco] Pré-carregamento falhou', e.message); } })();
    return true;
  }

  // Tenta init imediato; se não houver modal, observa o DOM
  if(!ensureInit()){
    const obs = new MutationObserver(()=>{ if(ensureInit()) obs.disconnect(); });
    obs.observe(document.documentElement||document.body,{childList:true,subtree:true});
  }
})();
