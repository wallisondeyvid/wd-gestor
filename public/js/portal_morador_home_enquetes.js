(function(){
  var basePath = (document.body && document.body.dataset && document.body.dataset.basePath) ? document.body.dataset.basePath : '/portal-morador';
  var habId = (document.body && document.body.dataset && document.body.dataset.habId) ? String(document.body.dataset.habId || '').trim() : '';

  var qs = (window && window.location && window.location.search) ? String(window.location.search) : '';
  var wantDebug = /(?:\?|&)(debug|__debug|__debugEnquetes)=1(?:&|$)/.test(qs);

  var panel = document.getElementById('enquetes');
  if(!panel) return;

  var countEl = panel.querySelector('[data-home-enq-count]');
  var listEl = panel.querySelector('[data-home-enq-list]');
  var emptyEl = panel.querySelector('[data-home-enq-empty]');
  if(!listEl || !emptyEl) return;

  var HOME_MAX_ITEMS = 40;

  function esc(str){
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeDate(v){
    if(!v) return null;
    var d = new Date(v);
    if(!isFinite(d.getTime())) return null;
    return d;
  }

  function fmtShort(v){
    var d = safeDate(v);
    if(!d) return '';
    return d.toLocaleString('pt-BR');
  }

  function trunc20(s){
    var t = String(s || '').trim();
    if(!t) return '';
    if(t.length <= 20) return t;
    return t.slice(0, 20) + '...';
  }

  function render(items){
    var arr = Array.isArray(items) ? items : [];
    var ativas = arr.filter(function(i){ return i && i.status === 'ativo'; }).length;

    if(countEl){
      countEl.textContent = String(ativas);
      countEl.hidden = false;
    }

    if(!arr.length){
      listEl.hidden = true;
      emptyEl.hidden = false;
      listEl.innerHTML = '';
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    var slice = arr.slice(0, HOME_MAX_ITEMS);
    listEl.innerHTML = slice.map(function(it){
      var perguntaRaw = String(it && it.pergunta ? it.pergunta : '').trim() || 'Enquete';
      var pergunta = trunc20(perguntaRaw);
      var st = String(it && it.status ? it.status : 'inativo');
      var badgeClass = st === 'ativo' ? 'is-success' : 'is-danger';
      var badge = st === 'ativo' ? 'Ativo' : 'Inativo';
      var when = it && it.vigencia_fim ? ('Até ' + fmtShort(it.vigencia_fim)) : '';
      var jaVotou = !!(it && it.jaVotou);
      var votedLabel = jaVotou ? 'Votado' : 'Não votado';
      var votedClass = jaVotou ? 'is-info' : 'is-warning';

      return '<li class="pm-servico-item pm-enq-item" role="link" tabindex="0" data-go-enquetes>'
        + '<div class="pm-servico-top">'
          + '<strong class="pm-servico-title pm-enq-title" title="' + esc(perguntaRaw) + '">' + esc(pergunta) + '</strong>'
          + '<span class="pm-servico-badge pm-enq-status ' + badgeClass + '">' + esc(badge) + '</span>'
        + '</div>'
        + '<div class="pm-servico-sub pm-enq-sub">'
          + '<span class="pm-servico-proto pm-enq-when">' + esc(when) + '</span>'
          + '<span class="pm-servico-badge pm-enq-vote ' + votedClass + '">' + esc(votedLabel) + '</span>'
        + '</div>'
        + '</li>';
    }).join('');
  }

  async function load(){
    if(!habId){
      render([]);
      return;
    }
    try {
      var url = basePath + '/api/enquetes?hab=' + encodeURIComponent(habId) + (wantDebug ? '&debug=1' : '');
      var resp = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' }, cache: 'no-store' });
      var j = await resp.json().catch(function(){ return null; });
      if(!resp.ok || !j || !j.ok) throw new Error('HTTP ' + resp.status);
      if(wantDebug && j && j.debug){
        try {
          console.warn('[portal-morador][home enquetes] debug', j.debug);
        } catch {}
      }
      render(j.data || []);
    } catch (e) {
      render([]);
      emptyEl.hidden = false;
      emptyEl.textContent = 'Não foi possível carregar enquetes agora.';
    }
  }

  function goToPage(){
    window.location.href = basePath + '/enquetes';
  }

  panel.addEventListener('click', function(ev){
    var item = ev.target.closest('[data-go-enquetes]');
    if(!item) return;
    goToPage();
  });

  panel.addEventListener('keydown', function(ev){
    if(ev.key !== 'Enter' && ev.key !== ' ') return;
    var item = ev.target.closest('[data-go-enquetes]');
    if(!item) return;
    ev.preventDefault();
    goToPage();
  });

  load();
})();
