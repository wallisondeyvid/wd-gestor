// Util centralizado para carregamento resiliente de JSON (Gestor)
// Disponibiliza window.wdgFetchGestorJson(nome)
// Mantém histórico em window.__wdgDataLoads e painel (Alt+Shift+D)
(() => {
  if (window.wdgFetchGestorJson) return;
  const DEBUG_FLAGS = ['WDG_DEBUG_UNIDADES', 'WDG_DEBUG_GESTOR_ASSETS'];
  const debugLog = (...args) => window.WDGDebug?.log?.(DEBUG_FLAGS, 'debug', ...args);
  const infoLog = (...args) => window.WDGDebug?.log?.(DEBUG_FLAGS, 'info', ...args);
  const HISTORY_KEY='__wdgDataLoads';
  const INTERCEPT_KEY='__wdgDataIntercepts';
  const INTERCEPT_STORAGE='__wdgDataInterceptsPersist';
  const MEM_CACHE_KEY='__wdgDataMemCache';
  const INFLIGHT_KEY='__wdgDataInflight';
  // Restaura contador intercept
  try { const savedI=sessionStorage.getItem(INTERCEPT_STORAGE); if(savedI){ const v=JSON.parse(savedI); if(v&&typeof v.count==='number') window[INTERCEPT_KEY]=v; } } catch {}
  window[INTERCEPT_KEY] = window[INTERCEPT_KEY] || { count:0 };
  const STORAGE_KEY='__wdgDataLoadsPersist';
  window[HISTORY_KEY] = window[HISTORY_KEY] || [];
  // Restaura histórico de sessão se existir
  try {
    const saved=sessionStorage.getItem(STORAGE_KEY);
    if(saved){
      const arr=JSON.parse(saved);
      if(Array.isArray(arr)) window[HISTORY_KEY].push(...arr.slice(-500));
    }
  } catch {}
  function getBase(){ const b=document.body?.getAttribute('data-base-path')||window.__WD_BASE_PATH||'/gestor'; return b.endsWith('/')?b.slice(0,-1):b; }
  function finalize(ok,data,path,tried,start){
    const entry={ time:new Date().toISOString(), name: path? path.split('/').pop():undefined, ok, path, tried, size: data? (Array.isArray(data)?data.length:Object.keys(data||{}).length):0, durationMs:+(performance.now()-start).toFixed(1) };
    window[HISTORY_KEY].push(entry);
    // Persistência (cap 800)
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(window[HISTORY_KEY].slice(-800))); } catch {}
    try{ window.dispatchEvent(new CustomEvent('wdgDataLoad',{detail:entry})); }catch{}
    return { ok, data, path, tried, durationMs:entry.durationMs };
  }
  async function coreFetch(nome, options){
    const start=performance.now(); const tried=[]; let pathUsed=null; let data=null;
    const cleanName = nome.replace(/^\/+/,'');
    if(window.wdgFetchData){
      try{ const r=await window.wdgFetchData(cleanName, options); if(r&&r.ok){ pathUsed=r.path; data=r.data; tried.push({helper:true, ...(r.tried?{tried:r.tried}:{}), path:r.path}); return finalize(true,data,pathUsed,tried,start);} else if(r){ tried.push({helper:true, tried:r.tried||[]}); } }catch(e){ tried.push({helperError:e.message}); }
    }
    const base=getBase();
    const lista=[ `${base}/data/${cleanName.replace(/^data\//,'')}` ];
    if(base!=='/gestor') lista.push(`/gestor/data/${cleanName.replace(/^data\//,'')}`);
    lista.push(`/data/${cleanName.replace(/^data\//,'')}`);
    debugLog('[wdgFetchGestorJson] tentando', cleanName, 'caminhos:', lista);
    let attemptIndex=0;
    for(const url of lista){
      attemptIndex++;
      try{
        const opt = (options||{});
        const headers = { Accept:'application/json', ...(opt.headers||{}) };
        const res=await fetch(url,{cache:'no-store',__wdgInternal:true,...opt,headers});
        if(!res.ok){ tried.push({url,status:res.status, attempt:attemptIndex}); continue; }

        const ct=(res.headers.get('content-type')||'').toLowerCase();

        // Alguns ambientes/proxies/static podem servir .json como application/octet-stream.
        // Não vamos falhar só por causa do header: tenta parse do corpo.
        if(/json/i.test(ct) || ct.includes('+json')){
          data=await res.json();
        } else {
          const raw=await res.text();
          try{
            data=JSON.parse(raw);
            tried.push({url,status:res.status,ct, parsedDespiteContentType:true, attempt:attemptIndex});
          } catch(_parseErr){
            tried.push({url,status:res.status,ct, attempt:attemptIndex});
            continue;
          }
        }

        pathUsed=url;
        tried.push({url,status:res.status, ok:true, attempt:attemptIndex});
        debugLog('[wdgFetchGestorJson] sucesso', cleanName, '=>', url, '(tentativa', attemptIndex, ')');
        return finalize(true,data,pathUsed,tried,start);
      }catch(err){
        tried.push({url,error:err.message, attempt:attemptIndex});
      }
    }
    console.warn('[wdgFetchGestorJson] falhou', cleanName, tried);
    return finalize(false,null,pathUsed,tried,start);
  }

  function normalizeKey(nome){
    return String(nome || '')
      .replace(/^\/+/, '')
      .replace(/^data\//, '')
      .trim();
  }

  function shouldBypassCache(options){
    if(!options) return false;
    return !!(options.noMemCache || options.forceReload);
  }

  async function wdgFetchGestorJson(nome, options){
    if(!nome) return { ok:false, tried:[{error:'nome invalido'}] };

    const key = normalizeKey(nome);
    const bypass = shouldBypassCache(options);
    const memCache = window[MEM_CACHE_KEY] || (window[MEM_CACHE_KEY] = new Map());
    const inflight = window[INFLIGHT_KEY] || (window[INFLIGHT_KEY] = new Map());

    if(!bypass){
      const cached = memCache.get(key);
      if(cached && cached.ok){
        return { ...cached, tried:[{cache:true}], durationMs:0 };
      }
      const pending = inflight.get(key);
      if(pending) return pending;
    }

    const p = coreFetch(key, options)
      .then((res)=>{
        try{ inflight.delete(key); }catch{}
        if(!bypass && res && res.ok){
          try{
            memCache.set(key, { ok:true, data:res.data, path:res.path });
          }catch{}
        }
        return res;
      })
      .catch((err)=>{
        try{ inflight.delete(key); }catch{}
        throw err;
      });

    if(!bypass){
      try{ inflight.set(key, p); }catch{}
    }
    return p;
  }

  wdgFetchGestorJson.clearCache = function(name){
    const memCache = window[MEM_CACHE_KEY];
    const inflight = window[INFLIGHT_KEY];
    if(!memCache && !inflight) return;
    if(!name){
      try{ memCache?.clear?.(); }catch{}
      try{ inflight?.clear?.(); }catch{}
      return;
    }
    const key = normalizeKey(name);
    try{ memCache?.delete?.(key); }catch{}
    try{ inflight?.delete?.(key); }catch{}
  };

  window.wdgFetchGestorJson=wdgFetchGestorJson;
  infoLog('[wdgFetchGestorJson] inicializado (Alt+Shift+D abre painel)');
  // Painel diagnóstico
  function ensurePanel(){ if(window.__WDG_DISABLE_DATA_PANEL) return; if(document.getElementById('wdgDataPanel')) return; const style=document.createElement('style'); style.textContent=`#wdgDataPanel{position:fixed;bottom:8px;right:8px;width:480px;max-height:60vh;z-index:2147483000;background:#0d1117;color:#c9d1d9;font:12px/1.4 system-ui,Segoe UI,Arial;padding:10px;border:1px solid #30363d;border-radius:6px;box-shadow:0 4px 24px rgba(0,0,0,.4);display:flex;flex-direction:column;}#wdgDataPanel[hidden]{display:none!important}#wdgDataPanel h3{margin:0 0 6px;font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}#wdgDataPanel table{width:100%;border-collapse:collapse;font-size:11px}#wdgDataPanel th,#wdgDataPanel td{border:1px solid #30363d;padding:2px 4px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}#wdgDataPanel tbody tr.ok td{background:#132d18}#wdgDataPanel tbody tr.fail td{background:#3a1e1e}#wdgDataPanel .wdg-actions{display:flex;gap:4px;margin-bottom:6px}#wdgDataPanel button{cursor:pointer;border:1px solid #30363d;background:#21262d;color:#c9d1d9;border-radius:4px;padding:2px 6px;font-size:11px}#wdgDataPanel button:hover{background:#30363d}#wdgDataPanel .wdg-footer{margin-top:4px;font-size:10px;opacity:.7}#wdgDataPanel .wdg-badge{background:#30363d;padding:2px 4px;border-radius:4px;font-size:10px}`; document.head.appendChild(style); const panel=document.createElement('div'); panel.id='wdgDataPanel'; panel.hidden=true; panel.innerHTML=`<h3>Loads JSON <span class="wdg-badge" id="wdgDataCount">0</span><span class="wdg-badge" id="wdgInterceptCount" title="Interceptações de fetch /data/ redirecionadas">0i</span><button type="button" id="wdgCloseDataPanel" style="margin-left:auto;">×</button></h3><div class="wdg-actions"><button type="button" id="wdgRefreshDataPanel">Atualizar</button><button type="button" id="wdgCopyDataPanel">Copiar JSON</button><button type="button" id="wdgClearDataPanel">Limpar</button></div><div style="overflow:auto;flex:1;"><table><thead><tr><th>Hora</th><th>Nome</th><th>OK</th><th>Att</th><th>Duração</th><th>Tam</th></tr></thead><tbody id="wdgDataBody"></tbody></table></div><div class="wdg-footer">Alt+Shift+D · fetch-json.js</div>`; document.body.appendChild(panel); panel.querySelector('#wdgCloseDataPanel').onclick=()=>panel.hidden=true; panel.querySelector('#wdgRefreshDataPanel').onclick=render; panel.querySelector('#wdgCopyDataPanel').onclick=()=>{ try{ navigator.clipboard.writeText(JSON.stringify(window[HISTORY_KEY],null,2)); }catch{} }; panel.querySelector('#wdgClearDataPanel').onclick=()=>{ window[HISTORY_KEY].length=0; render(); }; render(); }
  function render(){ const panel=document.getElementById('wdgDataPanel'); if(!panel) return; const tbody=panel.querySelector('#wdgDataBody'); const count=panel.querySelector('#wdgDataCount'); const intercept=panel.querySelector('#wdgInterceptCount'); const list=[...window[HISTORY_KEY]].slice(-300).reverse(); count.textContent=window[HISTORY_KEY].length; if(intercept) intercept.textContent= (window[INTERCEPT_KEY]?.count||0)+'i'; tbody.innerHTML=''; list.forEach(e=>{ const tr=document.createElement('tr'); tr.className=e.ok?'ok':'fail'; const successAttempt = (e.tried||[]).find(t=>t.ok); const att = successAttempt? successAttempt.attempt : ((e.tried||[]).length? (e.tried[e.tried.length-1].attempt||'') : ''); tr.title=(e.ok?'OK':'FAIL')+(e.path?'\n'+e.path:''); tr.innerHTML=`<td>${new Date(e.time).toLocaleTimeString()}</td><td>${e.name||''}</td><td>${e.ok?'✔':'✖'}</td><td>${att||''}</td><td>${e.durationMs}ms</td><td>${e.size}</td>`; tr.addEventListener('click',()=>{ try{ navigator.clipboard.writeText(JSON.stringify(e,null,2)); }catch{} }); tbody.appendChild(tr); }); }
  if(!window.__WDG_DISABLE_DATA_PANEL){
    window.addEventListener('wdgDataLoad',render);
    window.addEventListener('keydown',ev=>{ if(ev.key.toLowerCase()==='d' && ev.altKey && ev.shiftKey){ ev.preventDefault(); ensurePanel(); const p=document.getElementById('wdgDataPanel'); p.hidden=!p.hidden; if(!p.hidden) render(); }});
  }

  // Interceptor global de fetch para capturar usos diretos de '/data/'
  try {
    const origFetch = window.fetch.bind(window);
    window.fetch = async function(input, init){
      try {
        const url = (typeof input === 'string') ? input : (input?.url || '');
        const internal = init && init.__wdgInternal;
        if(!internal && typeof url === 'string' && /^\/data\//.test(url) && window.wdgFetchGestorJson){
          infoLog('[wdgFetchGuard] Interceptando fetch direto', url);
          try { window[INTERCEPT_KEY].count++; sessionStorage.setItem(INTERCEPT_STORAGE, JSON.stringify(window[INTERCEPT_KEY])); window.dispatchEvent(new CustomEvent('wdgDataLoad')); } catch {}
          const logicalName = url.replace(/^\/data\//,'');
            const res = await window.wdgFetchGestorJson(logicalName);
            if(res && res.ok){
              const blob = new Blob([JSON.stringify(res.data)], {type:'application/json'});
              return new Response(blob,{status:200,statusText:'OK',headers:{'Content-Type':'application/json','X-WDG-Intercepted':'1'}});
            }
            // Se falhou, deixa passar para tentativa original
        }
      } catch (e) { debugLog('[wdgFetchGuard] erro interceptor', e); }
      return origFetch(input, init);
    };
  } catch(e){ debugLog('[wdgFetchGuard] não pôde instalar', e); }
})();
