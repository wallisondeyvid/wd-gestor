// Helper reutilizável para chamadas fetch JSON padronizadas
// Uso: fetchJson('/api/setores', { method: 'GET' })
// Retorna sempre { ok: boolean, status, data, error }
(function(global){
  async function fetchJson(url, options={}){
    const opts = Object.assign({ headers:{} }, options);
    // Garantir Accept e Content-Type quando body presente
    if(!opts.headers['Accept']) opts.headers['Accept'] = 'application/json';
    if(opts.body && !opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
    let resp, text;
    try {
      resp = await fetch(url, opts);
      text = await resp.text();
    } catch(networkErr){
      return { ok:false, status:0, data:null, error:'Falha de rede' };
    }
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch(_){ json = {}; }
    const data = json.data ?? json.dados ?? (Array.isArray(json) || typeof json === 'object' ? json : null);
    if(!resp.ok){
      const errMsg = json.error || json.message || json.mensagem || text || ('Erro HTTP '+resp.status);
      return { ok:false, status: resp.status, data:null, error: errMsg, raw: json };
    }
    return { ok:true, status: resp.status, data, error:null };
  }
  global.fetchJson = fetchJson;
})(window);
