(function(){
  var bp = (document.body && document.body.dataset && document.body.dataset.basePath) ? String(document.body.dataset.basePath || '').trim() : '/portal-morador';
  var habId = (document.body && document.body.dataset) ? String(document.body.dataset.habId || '').trim() : '';
  var habLabel = (document.body && document.body.dataset) ? String(document.body.dataset.habLabel || '').trim() : '';

  var listEl = document.querySelector('[data-com-list]');
  var listBoxEl = document.querySelector('[data-com-listbox]');
  var pagerEl = document.querySelector('[data-com-pager]');
  var emptyEl = document.querySelector('[data-com-empty]');
  var chipsEl = document.querySelector('[data-com-chips]');
  var muralEl = document.querySelector('[data-com-mural]');
  var muralEmptyEl = document.querySelector('[data-com-mural-empty]');
  var searchEl = document.querySelector('[data-com-search]');

  if(!listEl || !emptyEl || !muralEl) return;

  var _items = [];
  var _selectedId = '';
  var PAGE_SIZE = 3;
  var _page = 1;
  var _query = '';
  var _emptyStrongBase = '';
  var _emptySubBase = '';

  try {
    _emptyStrongBase = String((emptyEl && emptyEl.querySelector('strong') ? emptyEl.querySelector('strong').textContent : '') || '');
  } catch { _emptyStrongBase = ''; }
  try {
    var subNode = emptyEl ? emptyEl.querySelector('div') : null;
    _emptySubBase = String((subNode ? subNode.textContent : '') || '');
  } catch { _emptySubBase = ''; }

  function escapeHtml(str){
    return String(str || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function normText(v){
    var s = String(v || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { /* noop */ }
    return s;
  }

  function filteredItems(){
    var list = Array.isArray(_items) ? _items : [];
    var q = normText(_query).trim();
    if(!q) return list;
    return list.filter(function(it){
      var ass = String(it && it.assunto ? it.assunto : '');
      var msg = String(it && it.mensagem ? it.mensagem : '');
      var iniS = fmtDateShort(it && it.vigencia_inicio) || '';
      var fimS = fmtDateShort(it && it.vigencia_fim) || '';
      var createdS = fmtDateShort(it && it.createdAt) || '';
      var hay = normText(ass + ' ' + msg + ' ' + iniS + ' ' + fimS + ' ' + createdS);
      return hay.indexOf(q) >= 0;
    });
  }

  function safeDate(v){
    if(!v) return null;
    var d = new Date(v);
    if(!isFinite(d.getTime())) return null;
    return d;
  }

  function fmtDateTime(v){
    var d = safeDate(v);
    if(!d) return '';
    return d.toLocaleString('pt-BR');
  }

  function fmtDateShort(v){
    var d = safeDate(v);
    if(!d) return '';
    try {
      return d.toLocaleDateString('pt-BR');
    } catch {
      return d.toLocaleString('pt-BR');
    }
  }

  function getItemId(it){
    if(!it) return '';
    var id = it._id || it.id || it.codigo || it.code;
    return id ? String(id) : '';
  }

  function totalPages(){
    var n = Math.ceil((filteredItems().length || 0) / PAGE_SIZE);
    return Math.max(1, Number.isFinite(n) ? n : 1);
  }

  function clampPage(p){
    var n = parseInt(String(p || '1'), 10);
    if(!Number.isFinite(n) || n < 1) n = 1;
    var maxP = totalPages();
    if(n > maxP) n = maxP;
    return n;
  }

  function setPage(p){
    _page = clampPage(p);
    renderList();
    renderPager();
  }

  function renderPager(){
    if(!pagerEl) return;
    var list = filteredItems();
    var tp = totalPages();
    var cur = clampPage(_page);
    var prevDisabled = cur <= 1;
    var nextDisabled = cur >= tp;

    pagerEl.hidden = false;
    pagerEl.innerHTML = ''
      + '<div class="pm-com-pager-center">'
      + '  <button type="button" class="pm-com-page-btn" data-page="prev"' + (prevDisabled ? ' disabled' : '') + '>Anterior</button>'
      + '  <span class="pm-com-pager-info">Página ' + String(cur) + ' de ' + String(tp) + '</span>'
      + '  <button type="button" class="pm-com-page-btn" data-page="next"' + (nextDisabled ? ' disabled' : '') + '>Posterior</button>'
      + '</div>';

    // Se não houver itens filtrados, esconde
    if(!list.length){
      pagerEl.hidden = true;
    }
  }

  function statusInfo(s){
    var st = String(s || '');
    if(st === 'ativa') return { label: 'Ativo', cls: 'pm-com-badge is-ativa' };
    if(st === 'agendada') return { label: 'Agendado', cls: 'pm-com-badge is-agendada' };
    return { label: 'Encerrado', cls: 'pm-com-badge is-encerrada' };
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

  function renderChips(total){
    if(!chipsEl) return;
    var chips = [];
    if(habLabel) chips.push('<span class="pm-com-chip"><i class="bi bi-house-door" aria-hidden="true"></i> ' + escapeHtml(habLabel) + '</span>');
    chips.push('<span class="pm-com-chip"><i class="bi bi-megaphone" aria-hidden="true"></i> ' + escapeHtml(String(total || 0)) + ' comunicados</span>');
    if(_selectedId){
      chips.push('<span class="pm-com-chip"><i class="bi bi-pin-angle" aria-hidden="true"></i> Selecionado no mural</span>');
    }
    chipsEl.innerHTML = chips.join('');
  }

  function renderMural(it){
    if(!muralEl) return;
    if(!it){
      if(muralEmptyEl) muralEmptyEl.hidden = false;
      muralEl.querySelectorAll('.pm-com-mural-inner').forEach(function(n){ n.remove(); });
      return;
    }

    if(muralEmptyEl) muralEmptyEl.hidden = true;
    muralEl.querySelectorAll('.pm-com-mural-inner').forEach(function(n){ n.remove(); });

    var ass = String(it && it.assunto ? it.assunto : '').trim();
    var msg = String(it && it.mensagem ? it.mensagem : '').trim();
    var foto = String(it && it.foto ? it.foto : '').trim();
    var status = statusInfo(it && (it.statusCalc || it.status) ? (it.statusCalc || it.status) : 'encerrada');

    var iniS = fmtDateShort(it && it.vigencia_inicio) || '—';
    var fimS = fmtDateShort(it && it.vigencia_fim) || '—';
    var created = fmtDateTime(it && it.createdAt) || '—';

    var mediaHtml = foto
      ? ('<div class="pm-com-mural-media"><img class="pm-com-mural-photo" src="' + escapeHtml(foto) + '" alt="" data-com-zoomable></div>')
      : ('<div class="pm-com-mural-media" aria-hidden="true"></div>');

    var html = ''
      + '<div class="pm-com-mural-inner">'
      + mediaHtml
      + '  <div class="pm-com-mural-content">'
      + '    <div class="pm-com-mural-head">'
      + '      <div>'
      + '        <h3 class="pm-com-mural-title">' + escapeHtml(ass || 'Comunicado') + '</h3>'
      + '        <div class="pm-com-mural-meta"><i class="bi bi-calendar-event" aria-hidden="true"></i> Vigência: ' + escapeHtml(iniS) + ' → ' + escapeHtml(fimS) + '</div>'
      + '      </div>'
      + '      <span class="' + escapeHtml(status.cls) + '"><i class="bi bi-megaphone" aria-hidden="true"></i> ' + escapeHtml(status.label) + '</span>'
      + '    </div>'
      + '    <p class="pm-com-mural-message">' + escapeHtml(msg || 'Comunicado') + '</p>'
      + '    <div class="pm-com-mural-footer">Publicado em ' + escapeHtml(created) + '</div>'
      + '  </div>'
      + '</div>';

    muralEl.insertAdjacentHTML('beforeend', html);
  }

  function openZoom(src){
    var zoomEl = document.querySelector('[data-com-zoom]');
    var zoomImgEl = document.querySelector('[data-com-zoom-img]');
    if(!zoomEl || !zoomImgEl) return;
    var s = String(src || '').trim();
    if(!s) return;
    zoomImgEl.src = s;
    zoomEl.hidden = false;
    zoomEl.setAttribute('aria-hidden', 'false');
    try { document.body.style.overflow = 'hidden'; } catch { /* noop */ }
  }

  function closeZoom(){
    var zoomEl = document.querySelector('[data-com-zoom]');
    var zoomImgEl = document.querySelector('[data-com-zoom-img]');
    if(!zoomEl || !zoomImgEl) return;
    zoomEl.hidden = true;
    zoomEl.setAttribute('aria-hidden', 'true');
    zoomImgEl.removeAttribute('src');
    try { document.body.style.overflow = ''; } catch { /* noop */ }
  }

  // Clique na imagem do mural abre zoom
  muralEl.addEventListener('click', function(ev){
    var t = ev.target;
    if(!t) return;
    if(t.matches && t.matches('[data-com-zoomable]')){
      openZoom(t.getAttribute('src'));
    }
  });

  // Fechar zoom por clique no backdrop/botão
  document.addEventListener('click', function(ev){
    var t = ev.target;
    var close = t && (t.hasAttribute && t.hasAttribute('data-com-zoom-close'));
    if(close) closeZoom();
  });

  // Fechar zoom por ESC
  document.addEventListener('keydown', function(ev){
    var zoomEl = document.querySelector('[data-com-zoom]');
    if(!zoomEl || zoomEl.hidden) return;
    if(ev && (ev.key === 'Escape' || ev.key === 'Esc')) closeZoom();
  });

  function renderList(){
    var baseList = Array.isArray(_items) ? _items : [];
    var list = filteredItems();

    if(!baseList.length){
      listEl.innerHTML = '';
      listEl.hidden = true;
      emptyEl.hidden = false;
      _selectedId = '';
      _page = 1;
      renderMural(null);
      renderChips(0);
      renderPager();
      return;
    }

    if(!list.length){
      listEl.innerHTML = '';
      listEl.hidden = true;
      emptyEl.hidden = false;
      try {
        var strong = emptyEl.querySelector('strong');
        if(strong) strong.textContent = 'Nenhum comunicado encontrado.';
      } catch { /* noop */ }
      try {
        var sub = emptyEl.querySelector('div');
        if(sub) sub.textContent = 'Ajuste a pesquisa para ver resultados.';
      } catch { /* noop */ }
      renderChips(0);
      renderPager();
      return;
    }

    // restaura a mensagem do empty quando houver itens
    try {
      var strongBase = emptyEl.querySelector('strong');
      if(strongBase && _emptyStrongBase) strongBase.textContent = _emptyStrongBase;
    } catch { /* noop */ }
    try {
      var subBase = emptyEl.querySelector('div');
      if(subBase && _emptySubBase) subBase.textContent = _emptySubBase;
    } catch { /* noop */ }

    emptyEl.hidden = true;
    listEl.hidden = false;

    // rolagem a partir de 3 itens
    try { listEl.classList.toggle('is-scroll', list.length >= 3); } catch { /* noop */ }

    // paginação por rolagem (blocos de 3): garante página válida
    _page = clampPage(_page);

    // Sem paginação: renderiza todos e usa rolagem quando necessário
    var start = 0;
    var pageItems = list;

    listEl.innerHTML = pageItems.map(function(it, idx){
      var realIdx = start + idx;
      var id = getItemId(it) || String(realIdx);
      var selected = (_selectedId && id === _selectedId);

      var ass = String(it && it.assunto ? it.assunto : '').trim();
      var msg = String(it && it.mensagem ? it.mensagem : '').trim();
      var statusRaw = String(it && (it.statusCalc || it.status) ? (it.statusCalc || it.status) : 'encerrada');
      var status = statusInfo(statusRaw);
      var statusClass = (statusRaw === 'ativa' || statusRaw === 'agendada' || statusRaw === 'encerrada') ? (' is-' + statusRaw) : '';
      var iniS = fmtDateShort(it && it.vigencia_inicio) || '—';
      var fimS = fmtDateShort(it && it.vigencia_fim) || '—';
      var createdS = fmtDateShort(it && it.createdAt) || '—';

      return ''
        + '<button type="button" class="pm-com-item' + (selected ? ' is-selected' : '') + statusClass + '" data-com-id="' + escapeHtml(id) + '">' 
        + '  <div class="pm-com-item-top">'
        + '    <div>'
        + '      <div class="pm-com-item-title"><i class="bi bi-calendar-event" aria-hidden="true"></i> ' + escapeHtml(iniS) + ' → ' + escapeHtml(fimS) + '</div>'
        + '      <div class="pm-com-item-sub">Publicado em ' + escapeHtml(createdS) + '</div>'
        + '    </div>'
        + '    <span class="' + escapeHtml(status.cls) + '">' + escapeHtml(status.label) + '</span>'
        + '  </div>'
        + '  <div class="pm-com-item-preview">' + escapeHtml(ass || 'Comunicado') + '</div>'
        + '</button>';
    }).join('');

    renderChips(list.length);
    renderPager();
  }

  function scrollToPage(p){
    if(!listEl) return;
    var list = filteredItems();
    if(!list.length) return;
    var targetPage = clampPage(p);
    var idx = (targetPage - 1) * PAGE_SIZE;
    var node = listEl.querySelector('[data-com-id]');
    if(idx <= 0){
      listEl.scrollTop = 0;
      _page = 1;
      renderPager();
      return;
    }
    var nodes = listEl.querySelectorAll('[data-com-id]');
    var target = nodes && nodes.length ? nodes[Math.min(idx, nodes.length - 1)] : null;
    if(target){
      listEl.scrollTop = target.offsetTop;
      _page = targetPage;
      renderPager();
    }
  }

  function updatePageFromScroll(){
    if(!listEl) return;
    var list = filteredItems();
    if(!list.length) return;
    var nodes = listEl.querySelectorAll('[data-com-id]');
    if(!nodes || !nodes.length) return;

    var top = listEl.scrollTop;
    var firstIndex = 0;
    for(var i=0;i<nodes.length;i++){
      if(nodes[i].offsetTop >= top - 2){ firstIndex = i; break; }
    }
    var cur = clampPage(Math.floor(firstIndex / PAGE_SIZE) + 1);
    if(cur !== _page){
      _page = cur;
      renderPager();
    }
  }

  function selectById(id){
    var targetId = String(id || '').trim();
    if(!targetId) return;
    _selectedId = targetId;

    var it = null;
    var foundIndex = -1;
    for(var i=0;i<_items.length;i++){
      var curId = getItemId(_items[i]) || String(i);
      if(curId === targetId){ it = _items[i]; foundIndex = i; break; }
    }

    renderList();
    renderMural(it);
  }

  listEl.addEventListener('click', function(ev){
    var t = ev.target;
    var btn = t && t.closest ? t.closest('[data-com-id]') : null;
    if(!btn) return;
    var id = btn.getAttribute('data-com-id');
    if(id) selectById(id);
  });

  if(searchEl){
    searchEl.addEventListener('input', function(){
      _query = String(searchEl.value || '');
      _page = 1;
      try { listEl.scrollTop = 0; } catch { /* noop */ }
      renderList();
    });
  }

  if(pagerEl){
    pagerEl.addEventListener('click', function(ev){
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-page]') : null;
      if(!btn) return;
      var kind = String(btn.getAttribute('data-page') || '').trim();
      if(kind === 'prev') return scrollToPage(_page - 1);
      if(kind === 'next') return scrollToPage(_page + 1);
    });
  }

  if(listEl){
    listEl.addEventListener('scroll', function(){
      updatePageFromScroll();
    }, { passive: true });
  }

  function listSignature(items){
    var list = Array.isArray(items) ? items : [];
    if(!list.length) return '0';
    var first = list[0] || {};
    var fid = getItemId(first) || '';
    var fts = '';
    try { fts = first && first.createdAt ? String(new Date(first.createdAt).getTime()) : ''; } catch { fts = ''; }
    return String(list.length) + '|' + String(fid) + '|' + String(fts);
  }

  var _lastSig = '';
  var _pollTimer = null;
  var POLL_MS = 25000;

  async function loadFromServer(opts){
    opts = opts || {};
    if(!habId){
      _items = [];
      _selectedId = '';
      _page = 1;
      renderList();
      renderMural(null);
      return;
    }

    var keepScrollTop = 0;
    try { keepScrollTop = listEl ? listEl.scrollTop : 0; } catch { keepScrollTop = 0; }

    var url = bp + '/api/comunicados?hab=' + encodeURIComponent(habId) + '&limit=200';
    var json = await fetchJson(url);
    var nextItems = (json && Array.isArray(json.data)) ? json.data : [];

    var sig = listSignature(nextItems);
    if (opts.silent && sig && sig === _lastSig) {
      return;
    }
    _lastSig = sig;

    _items = nextItems;

    var preferred = '';
    try {
      var qs = new URLSearchParams(window.location.search || '');
      preferred = String(qs.get('com') || qs.get('id') || '').trim();
    } catch { preferred = ''; }

    var pickId = String(_selectedId || '').trim() || preferred;
    var selectedItem = null;

    if (_items.length) {
      if (pickId) {
        for (var i = 0; i < _items.length; i++) {
          var curId = getItemId(_items[i]) || String(i);
          if (curId === pickId) { selectedItem = _items[i]; break; }
        }
      }
      if (!selectedItem) selectedItem = _items[0];
      _selectedId = getItemId(selectedItem) || (preferred ? preferred : '0');
    } else {
      _selectedId = '';
      _page = 1;
    }

    renderList();
    renderMural(selectedItem);

    // restaura scroll para evitar "pulos" durante o auto-refresh
    if (opts.silent) {
      try {
        if (listEl) {
          setTimeout(function(){
            try { listEl.scrollTop = keepScrollTop; } catch { /* noop */ }
          }, 0);
        }
      } catch { /* noop */ }
    }
  }

  async function load(){
    try {
      await loadFromServer({ silent: false });
    } catch (err) {
      _items = [];
      renderList();
      renderMural(null);
      try { emptyEl.querySelector('strong').textContent = 'Não foi possível carregar os comunicados.'; } catch { /* noop */ }
    }
  }

  function startPolling(){
    try { if (_pollTimer) clearInterval(_pollTimer); } catch { /* noop */ }
    _pollTimer = setInterval(function(){
      if (document.hidden) return;
      loadFromServer({ silent: true }).catch(function(){ /* noop */ });
    }, POLL_MS);
  }

  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) {
      loadFromServer({ silent: true }).catch(function(){ /* noop */ });
    }
  });

  window.addEventListener('focus', function(){
    loadFromServer({ silent: true }).catch(function(){ /* noop */ });
  });

  load();
  startPolling();
})();
