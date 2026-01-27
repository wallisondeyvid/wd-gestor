// Helper global para compor URL de arquivos de dados estáticos considerando basePath do módulo
(() => {
  if (window.wdgDataUrl) return; // evitar redeclaração
  function getBase(){
    const b = document.body?.getAttribute('data-base-path') || window.__WD_BASE_PATH || '/gestor';
    return b.endsWith('/') ? b.slice(0,-1) : b;
  }
  function dataUrl(file){
    const base = getBase();
    if (!file) return base + '/data';
    // Normaliza se usuário passou '/data/arquivo.json'
    const clean = file.startsWith('/data/') ? file.slice(6) : file.replace(/^\/+/, '');
    return base + '/data/' + clean;
  }
  // Tenta vários caminhos até algum funcionar; retorna primeira resposta JSON válida
  async function fetchData(file, options){
    const prefer = [];
    const base = getBase();
    const clean = file.replace(/^\/+/, '');
    // Caminhos candidatos (ordenados)
    prefer.push(base + '/data/' + clean.replace(/^data\//,''));
    if (base !== '/gestor') prefer.push('/gestor/data/' + clean.replace(/^data\//,''));
    prefer.push('/data/' + clean.replace(/^data\//,''));
    const tried = [];
    for (const p of prefer){
      try {
        const res = await fetch(p, { cache:'no-store', __wdgInternal:true, headers:{'Accept':'application/json', ...((options&&options.headers)||{})}, ...(options||{}) });
        if (!res.ok) { tried.push({ path:p, status:res.status }); continue; }
        const ct = res.headers.get('content-type')||'';
        if (!/json/i.test(ct)) { tried.push({ path:p, status:res.status, ct}); continue; }
        const json = await res.json();
        return { ok:true, data:json, path:p, tried };
      } catch (err){ tried.push({ path:p, error:err.message }); }
    }
    return { ok:false, tried };
  }
  window.wdgDataUrl = dataUrl;
  window.wdgFetchData = fetchData;
  try {
    console.info('[wdgDataUrl] carregado; ordem de tentativas = basePath > /gestor > /data | basePath atual =', getBase());
  } catch {}
})();
