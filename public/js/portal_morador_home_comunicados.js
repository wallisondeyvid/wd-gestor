(function(){
  var bp = (document.body && document.body.dataset && document.body.dataset.basePath) ? String(document.body.dataset.basePath || '').trim() : '/portal-morador';
  var habId = (document.body && document.body.dataset) ? String(document.body.dataset.habId || '').trim() : '';

  var listEl = document.querySelector('[data-home-com-list]');
  var emptyEl = document.querySelector('[data-home-com-empty]');
  var countEl = document.querySelector('[data-home-com-count]');

  if(!listEl || !emptyEl) return;

  function escapeHtml(str){
    return String(str || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function safeDate(v){
    if(!v) return null;
    var d = new Date(v);
    if(!isFinite(d.getTime())) return null;
    return d;
  }

  function fmtDateShort(v){
    var d = safeDate(v);
    if(!d) return '';
    try { return d.toLocaleDateString('pt-BR'); } catch { return d.toLocaleString('pt-BR'); }
  }

  function fmtDateTime(v){
    var d = safeDate(v);
    if(!d) return '';
    try { return d.toLocaleString('pt-BR'); } catch { return d.toString(); }
  }

  function getItemId(it, idx){
    if(!it) return '';
    var id = it._id || it.id || it.codigo || it.code;
    var s = id ? String(id) : '';
    if(s) return s;
    return (typeof idx === 'number') ? String(idx) : '';
  }

  async function fetchJson(url){
    var resp = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' }});
    var json = null;
    try { json = await resp.json(); } catch { json = null; }
    if(!resp.ok){
      var msg = (json && (json.error || json.message)) ? String(json.error || json.message) : ('Falha ao carregar (' + resp.status + ')');
      throw new Error(msg);
    }
    return json;
  }

  function setCount(n){
    if(!countEl) return;
    var v = Number(n || 0);
    if(!isFinite(v) || v <= 0){
      countEl.hidden = true;
      countEl.textContent = '0';
      return;
    }
    countEl.textContent = String(v);
    countEl.hidden = false;
  }

  function render(items){
    var list = Array.isArray(items) ? items : [];
    if(!list.length){
      listEl.innerHTML = '';
      listEl.hidden = true;
      emptyEl.hidden = false;
      setCount(0);
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    var top = list.slice(0, 5);
    listEl.innerHTML = top.map(function(it, idx){
      var id = getItemId(it, idx);
      var assunto = String(it && it.assunto ? it.assunto : '').trim() || 'Comunicado';
      var when = fmtDateTime(it && (it.createdAt || it.criadoEm || it.dataCriacao)) || '';

      return ''
        + '<li data-home-com-id="' + escapeHtml(id) + '">' 
        + '  <span class="pm-notif-dot" aria-hidden="true"></span>'
        + '  <div class="pm-notif-main">'
        + '    <strong>' + escapeHtml(assunto) + '</strong>'
        + '  </div>'
        + '  <time>' + escapeHtml(when) + '</time>'
        + '</li>';
    }).join('');

    setCount(list.length);
  }

  async function load(){
    if(!habId){
      render([]);
      return;
    }

    try {
      // Busca até 40 para ter contagem e preencher a lista (mostramos só 5)
      var url = bp + '/api/comunicados?hab=' + encodeURIComponent(habId) + '&limit=40';
      var json = await fetchJson(url);
      var data = (json && Array.isArray(json.data)) ? json.data : [];
      render(data);
    } catch {
      render([]);
      try { emptyEl.textContent = 'Não foi possível carregar comunicados.'; } catch { /* noop */ }
    }
  }

  // Clique no item abre a página de comunicados com o item selecionado no mural
  listEl.addEventListener('click', function(ev){
    var li = ev.target && ev.target.closest ? ev.target.closest('[data-home-com-id]') : null;
    if(!li) return;
    var id = String(li.getAttribute('data-home-com-id') || '').trim();
    if(!id) return;
    window.location.href = bp + '/comunicados?com=' + encodeURIComponent(id);
  });

  load();
})();
