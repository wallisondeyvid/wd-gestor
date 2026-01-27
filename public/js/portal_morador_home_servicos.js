(function(){
  var basePath = (document.body && document.body.dataset && document.body.dataset.basePath) ? document.body.dataset.basePath : '/portal-morador';
  var habId = (document.body && document.body.dataset && document.body.dataset.habId) ? String(document.body.dataset.habId || '').trim() : '';

  var panel = document.getElementById('solicitacoes');
  if(!panel) return;

  var countEl = panel.querySelector('[data-home-servicos-count]');
  var listEl = panel.querySelector('[data-home-servicos-list]');
  var emptyEl = panel.querySelector('[data-home-servicos-empty]');
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

  function fmtDt(value){
    var d = safeDate(value);
    if(!d) return '—';
    // formato compacto (pt-BR)
    return d.toLocaleString('pt-BR');
  }

  function normalizeStatus(raw){
    var s = String(raw || '').trim().toLowerCase();
    if(!s) s = 'aberto';
    if(s.indexOf('aceit') >= 0) return 'aceita';
    if(s.indexOf('rejeit') >= 0 || s.indexOf('recus') >= 0) return 'rejeitada';
    if(s.indexOf('concl') >= 0 || s.indexOf('final') >= 0) return 'concluida';
    if(s.indexOf('and') >= 0 || s.indexOf('exec') >= 0) return 'andamento';
    return s;
  }

  function statusLabel(norm){
    switch(norm){
      case 'aceita': return 'Aceita';
      case 'rejeitada': return 'Rejeitada';
      case 'concluida': return 'Concluída';
      case 'andamento': return 'Em andamento';
      default: return 'Aberta';
    }
  }

  function statusClass(norm){
    switch(norm){
      case 'aceita':
      case 'concluida':
        return 'is-success';
      case 'rejeitada':
        return 'is-danger';
      case 'andamento':
        return 'is-info';
      default:
        return 'is-warning';
    }
  }

  function render(items){
    var arr = Array.isArray(items) ? items : [];
    if(countEl){
      // contador de abertos (não finalizados)
      var openCount = arr.filter(function(it){
        var st = normalizeStatus(it && it.status);
        return st !== 'concluida' && st !== 'rejeitada';
      }).length;
      countEl.textContent = String(openCount);
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

    listEl.innerHTML = arr.map(function(it){
      var titulo = String(it && it.titulo ? it.titulo : '').trim() || 'Solicitação';
      var protocolo = String(it && it.protocolo ? it.protocolo : '').trim();
      var stNorm = normalizeStatus(it && it.status);
      var stLabel = statusLabel(stNorm);
      var stClass = statusClass(stNorm);
      var when = it && (it.updatedAt || it.atualizadoEm || it.createdAt) ? (it.updatedAt || it.atualizadoEm || it.createdAt) : null;

      return '<li class="pm-servico-item">'
        + '<div class="pm-servico-top">'
          + '<strong class="pm-servico-title">' + escapeHtml(titulo) + '</strong>'
          + '<span class="pm-servico-badge ' + stClass + '">' + escapeHtml(stLabel) + '</span>'
        + '</div>'
        + '<div class="pm-servico-sub">'
          + '<span class="pm-servico-proto">' + escapeHtml(protocolo ? ('#' + protocolo) : '') + '</span>'
          + '<time class="pm-servico-time">' + escapeHtml(fmtDt(when)) + '</time>'
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
      var url = basePath + '/api/servicos/ultimos?hab=' + encodeURIComponent(habId);
      var resp = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' }, cache: 'no-store' });
      if(!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      var items = Array.isArray(data && data.data) ? data.data : [];
      render(items);
    } catch (e) {
      render([]);
    }
  }

  load();
})();
