(function(){
  var basePath = (document.body && document.body.dataset && document.body.dataset.basePath) ? document.body.dataset.basePath : '/portal-morador';
  var habId = (document.body && document.body.dataset && document.body.dataset.habId) ? String(document.body.dataset.habId || '').trim() : '';

  var qs = (window && window.location && window.location.search) ? String(window.location.search) : '';
  var wantDebug = /(?:\?|&)(debug|__debug|__debugAcessos)=1(?:&|$)/.test(qs);

  var panel = document.getElementById('acessos');
  if(!panel) return;

  var listEl = panel.querySelector('[data-home-access-list]');
  var emptyEl = panel.querySelector('[data-home-access-empty]');
  if(!listEl || !emptyEl) return;

  function escapeHtml(str){
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeDate(value){
    if(!value) return null;
    var d = new Date(value);
    if(!isFinite(d.getTime())) return null;
    return d;
  }

  function formatDt(value){
    var d = safeDate(value);
    if(!d) return '—';
    return d.toLocaleString('pt-BR');
  }

  function render(items){
    var arr = Array.isArray(items) ? items : [];
    if(!arr.length){
      listEl.hidden = true;
      emptyEl.hidden = false;
      listEl.innerHTML = '';
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    listEl.innerHTML = arr.map(function(it){
      var nome = String(it && it.nome ? it.nome : '').trim() || '—';
      var em = it && (it.ocorridoEm || it.em || it.dataHora) ? (it.ocorridoEm || it.em || it.dataHora) : null;
      var pessoaTipo = String(it && it.pessoaTipo ? it.pessoaTipo : '').trim().toUpperCase();
      var isMorador = pessoaTipo === 'MORADOR';
      var badgeText = isMorador ? 'Morador' : 'Visitante';
      var badgeClass = isMorador ? 'is-morador' : 'is-visitante';
      var badgeIcon = isMorador ? 'bi bi-house-door' : 'bi bi-person';
      var acao = String(it && it.acao ? it.acao : '').trim().toUpperCase();
      var isSaida = acao === 'SAIDA' || acao === 'SAÍDA';
      var acaoText = isSaida ? 'Saída' : (acao === 'ENTRADA' ? 'Entrada' : '');
      var acaoIcon = isSaida ? 'bi bi-box-arrow-right' : 'bi bi-box-arrow-in-right';
      var acaoClass = isSaida ? 'is-saida' : 'is-entrada';
      var acaoHtml = acaoText
        ? ('<span class="pm-access-badge pm-access-badge--event ' + acaoClass + '"><i class="' + acaoIcon + '" aria-hidden="true"></i>' + escapeHtml(acaoText) + '</span>')
        : '';

      return '<li class="pm-access-item">'
        + '<strong class="pm-access-name">' + escapeHtml(nome) + '</strong>'
        + '<time class="pm-access-dt">' + escapeHtml(formatDt(em)) + '</time>'
        + '<div class="pm-access-tags-line">'
          + '<span class="pm-access-badge ' + badgeClass + '"><i class="' + badgeIcon + '" aria-hidden="true"></i>' + escapeHtml(badgeText) + '</span>'
          + acaoHtml
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
      var url = basePath + '/api/acessos/ultimos?hab=' + encodeURIComponent(habId) + '&days=7' + (wantDebug ? '&debug=1' : '');
      var resp = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' }, cache: 'no-store' });
      var data = await resp.json().catch(function(){ return null; });
      if(!resp.ok || !data || data.ok !== true){
        if(wantDebug){
          try { console.warn('[portal-morador][home acessos] erro http', resp.status, data); } catch {}
        }
        throw new Error('HTTP ' + resp.status);
      }
      var items = Array.isArray(data && data.data) ? data.data : [];
      if(wantDebug){
        try { console.warn('[portal-morador][home acessos] ok', { count: items.length, since: data.since, windowDays: data.windowDays }); } catch {}
      }
      render(items);
    } catch (e) {
      // Silencioso: não quebra a home
      render([]);

      if(emptyEl){
        emptyEl.textContent = 'Não foi possível carregar últimos acessos agora.';
      }

      if(wantDebug){
        try { console.warn('[portal-morador][home acessos] exception', e); } catch {}
      }
    }
  }

  load();
})();
