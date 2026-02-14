(function(){
  var bp = (document.body && document.body.dataset && document.body.dataset.basePath) ? String(document.body.dataset.basePath || '').trim() : '/portal-morador';

  var tbody = document.querySelector('[data-asm-body]');
  var emptyEl = document.querySelector('[data-asm-empty]');
  if(!tbody) return;

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

  function fmtDate(d){
    try { return d.toLocaleDateString('pt-BR'); } catch { return String(d); }
  }

  function fmtDataHora(it){
    var d = safeDate(it && it.data);
    var base = d ? fmtDate(d) : '—';
    var hUnica = String(it && it.horaUnica ? it.horaUnica : '').trim();
    var h1 = String(it && it.hora1 ? it.hora1 : '').trim();
    var h2 = String(it && it.hora2 ? it.hora2 : '').trim();

    var horas = '';
    if(hUnica){
      horas = hUnica;
    } else if(h1 && h2){
      horas = h1 + ' / ' + h2;
    } else if(h1){
      horas = h1;
    } else if(h2){
      horas = h2;
    }

    return horas ? (base + ' ' + horas) : base;
  }

  function natureVariant(nat){
    var n = String(nat || '').trim().toLowerCase();
    if(n === 'ordinaria') return 'ordinaria';
    if(n === 'extraordinaria') return 'extraordinaria';
    return n || '—';
  }

  function statusVariant(st){
    var s = String(st || '').trim().toLowerCase();
    if(!s) return '—';
    if(s === 'aberta' || s === 'em_andamento') return 'em_andamento';
    return s;
  }

  function labelNatureza(nat){
    var n = String(nat || '').trim().toLowerCase();
    if(n === 'ordinaria') return 'Ordinária';
    if(n === 'extraordinaria') return 'Extraordinária';
    return nat ? String(nat) : '—';
  }

  function labelStatus(st){
    var s = String(st || '').trim().toLowerCase();
    if(s === 'rascunho') return 'Rascunho';
    if(s === 'convocada') return 'Convocada';
    if(s === 'aberta' || s === 'em_andamento') return 'Em andamento';
    if(s === 'encerrada') return 'Encerrada';
    if(s === 'cancelada') return 'Cancelada';
    return st ? String(st) : '—';
  }

  async function fetchJson(url){
    var controller = null;
    var timer = null;
    try {
      controller = new AbortController();
      timer = setTimeout(function(){ try { controller.abort(); } catch {} }, 8000);
    } catch {
      controller = null;
      timer = null;
    }

    var resp = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    });
    try { if (timer) clearTimeout(timer); } catch {}

    var json = null;
    try { json = await resp.json(); } catch { json = null; }
    if(!resp.ok){
      var msg = (json && (json.error || json.message)) ? String(json.error || json.message) : ('Falha ao carregar (' + resp.status + ')');
      throw new Error(msg);
    }
    return json;
  }

  async function postJson(url, body){
    var controller = null;
    var timer = null;
    try {
      controller = new AbortController();
      timer = setTimeout(function(){ try { controller.abort(); } catch {} }, 12000);
    } catch {
      controller = null;
      timer = null;
    }

    var resp = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {}),
      signal: controller ? controller.signal : undefined
    });
    try { if (timer) clearTimeout(timer); } catch {}

    var json = null;
    try { json = await resp.json(); } catch { json = null; }
    if(!resp.ok){
      var msg = (json && (json.error || json.message)) ? String(json.error || json.message) : ('Falha ao confirmar (' + resp.status + ')');
      throw new Error(msg);
    }
    return json;
  }

  function render(items){
    var list = Array.isArray(items) ? items : [];
    if(!list.length){
      tbody.innerHTML = '';
      if(emptyEl) emptyEl.hidden = false;
      return;
    }
    if(emptyEl) emptyEl.hidden = true;

    tbody.innerHTML = list.map(function(it){
      var asmId = (it && (it._id || it.id)) ? String(it._id || it.id) : '';
      var asmIdEsc = escapeHtml(asmId);
      var dataHora = escapeHtml(fmtDataHora(it));
      var numero = escapeHtml(String(it && it.numero ? it.numero : ''));
      var titulo = escapeHtml(String(it && it.titulo ? it.titulo : ''));

      var natVar = natureVariant(it && it.natureza);
      var natLabel = escapeHtml(labelNatureza(it && it.natureza));

      var stVar = statusVariant(it && it.status);
      var stLabel = escapeHtml(labelStatus(it && it.status));

      var natPill = '<span class="pm-asm-pill" data-variant="' + escapeHtml(natVar) + '">' + natLabel + '</span>';
      var stPill = '<span class="pm-asm-pill" data-variant="' + escapeHtml(stVar) + '">' + stLabel + '</span>';

      var actionCell = '';
      if(asmId){
        actionCell = ''
          + '<button type="button" class="pm-asm-action-btn" data-asm-confirm="1" data-asm-id="' + asmIdEsc + '">Confirmar presença</button>'
          + '<div class="pm-asm-action-msg" data-asm-msg="' + asmIdEsc + '" aria-live="polite"></div>';
      } else {
        actionCell = '<span class="pm-asm-muted">—</span>';
      }

      return ''
        + '<tr>'
        + '  <td>' + dataHora + '</td>'
        + '  <td>' + (numero || '—') + '</td>'
        + '  <td>' + (titulo || '—') + '</td>'
        + '  <td>' + natPill + '</td>'
        + '  <td>' + stPill + '</td>'
        + '  <td>' + actionCell + '</td>'
        + '</tr>';
    }).join('');
  }

  function getActionMsgEl(asmId){
    try {
      return tbody.querySelector('[data-asm-msg="' + String(asmId).replace(/"/g,'') + '"]');
    } catch {
      return null;
    }
  }

  async function handleConfirmClick(btn){
    var asmId = btn && btn.dataset ? String(btn.dataset.asmId || '').trim() : '';
    if(!asmId) return;

    var msgEl = getActionMsgEl(asmId);
    var prevText = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-loading');
    if(msgEl) msgEl.textContent = 'Confirmando…';

    try {
      await postJson(bp + '/api/assembleias/' + encodeURIComponent(asmId) + '/presenca/confirmar', {});
      btn.textContent = 'Confirmada';
      btn.classList.remove('is-loading');
      btn.classList.add('is-confirmed');
      if(msgEl) msgEl.textContent = 'Presença confirmada.';
    } catch (e) {
      var msg = (e && e.message) ? String(e.message) : 'Falha ao confirmar.';
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.textContent = prevText || 'Confirmar presença';
      if(msgEl) msgEl.textContent = msg;
    }
  }

  async function load(){
    try {
      if(emptyEl) emptyEl.hidden = true;
      tbody.innerHTML = '<tr><td colspan="6" class="pm-asm-muted">Carregando…</td></tr>';
      var json = await fetchJson(bp + '/api/assembleias');
      render(json && json.assembleias ? json.assembleias : []);
    } catch (e) {
      var msg = (e && e.message) ? String(e.message) : 'Falha ao carregar.';
      tbody.innerHTML = '<tr><td colspan="6" class="pm-asm-muted">' + escapeHtml(msg) + '</td></tr>';
    }
  }

  tbody.addEventListener('click', function(ev){
    try {
      var t = ev && ev.target ? ev.target : null;
      if(!t) return;
      var btn = (t && t.closest) ? t.closest('[data-asm-confirm="1"]') : null;
      if(!btn) return;
      ev.preventDefault();
      handleConfirmClick(btn);
    } catch {
      /* noop */
    }
  });

  document.addEventListener('DOMContentLoaded', load);
})();
