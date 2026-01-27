(function(){
  var root = document.getElementById('comunicadosApp');
  var BASE_PATH = (root && root.dataset && root.dataset.basePath) ? String(root.dataset.basePath || '').trim() : ((document.body && document.body.dataset && document.body.dataset.basePath) ? document.body.dataset.basePath : '/condominios');
  var isScopeAll = (document.body && document.body.dataset && String(document.body.dataset.scopeAll) === 'true') ? true : false;
  var userUnit = (document.body && document.body.dataset) ? String(document.body.dataset.userUnit || '').trim() : '';

  var form = document.getElementById('comForm');
  var comId = document.getElementById('comId');
  var unidadeSelect = document.getElementById('comUnidadeSelect');
  var vigInicio = document.getElementById('comVigInicio');
  var vigFim = document.getElementById('comVigFim');
  var assunto = document.getElementById('comAssunto');
  var mensagem = document.getElementById('comMensagem');

  var comFotoToggle = document.getElementById('comFotoToggle');
  var comFotoWrap = document.getElementById('comFotoWrap');
  var comFoto = document.getElementById('comFoto');
  var comFotoPreviewWrap = document.getElementById('comFotoPreviewWrap');
  var comFotoPreview = document.getElementById('comFotoPreview');
  var comFotoRemover = document.getElementById('comFotoRemover');
  var comFotoUrlInput = document.getElementById('comFotoUrl');

  var btnLimpar = document.getElementById('btnComLimpar');
  var btnEnviar = document.getElementById('btnComEnviar');

  var listEl = document.getElementById('comList');
  var emptyEl = document.getElementById('comEmpty');
  var pagerEl = document.getElementById('comPager');
  var countEl = root ? root.querySelector('[data-com-count]') : null;

  // Restrições (IDs iguais ao Enquetes)
  var rNaoExibirDesabitadas = document.getElementById('rNaoExibirDesabitadas');
  var rApenasResponsavel = document.getElementById('rApenasResponsavel');
  var rApenasProprietario = document.getElementById('rApenasProprietario');
  var rExcluirHabitacoes = document.getElementById('rExcluirHabitacoes');
  var rExcluirMoradores = document.getElementById('rExcluirMoradores');

  var pickerHabitacoesRoot = document.querySelector('[data-enq-picker="habitacoes"]');
  var pickerMoradoresRoot = document.querySelector('[data-enq-picker="moradores"]');

  if(!form || !unidadeSelect || !vigInicio || !vigFim || !assunto || !mensagem || !listEl || !emptyEl || !pagerEl) return;

  var PAGE_SIZE = 9;
  var selectedUnitId = '';
  var currentPage = 1;
  var lastTotalPages = 0;
  var lastTotal = 0;

  var comFotoFile = null;
  var comFotoObjectUrl = '';

  function escapeHtml(str){
    return String(str || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  async function api(path, opts) {
    var url = BASE_PATH + path;

    var method = (opts && opts.method) ? String(opts.method).toUpperCase() : 'GET';
    var canRetry = (method === 'GET');
    var maxAttempts = canRetry ? 3 : 1;

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      var resp = await fetch(url, Object.assign({
        credentials: 'same-origin',
        headers: Object.assign({ 'Accept': 'application/json', 'X-Requested-With': 'fetch' }, (opts && opts.headers) || {})
      }, opts || {}));

      var json = null;
      try { json = await resp.json(); } catch { json = null; }

      if (resp.ok) return json;

      var status = Number(resp.status);
      var transient = (status === 502 || status === 503);
      if (canRetry && transient && attempt < maxAttempts) {
        var delayMs = 400 * attempt;
        await new Promise(function(r){ setTimeout(r, delayMs); });
        continue;
      }

      var msg = (json && (json.error || json.message)) ? String(json.error || json.message) : ('Falha na requisição: ' + String(resp.status));
      throw new Error(msg + ' (' + path + ')');
    }

    throw new Error('Falha na requisição (' + path + ')');
  }

  function setSelectOptions(selectEl, options, selectedValue) {
    if (!selectEl) return;
    var opts = Array.isArray(options) ? options : [];
    selectEl.innerHTML = opts.map(function (o) {
      return '<option value="' + escapeHtml(o && o.value) + '">' + escapeHtml(o && o.label) + '</option>';
    }).join('');
    if (selectedValue) {
      try { selectEl.value = String(selectedValue); } catch { /* noop */ }
    }
  }

  function getSelectedUnidadeId() {
    try {
      var v = unidadeSelect ? String(unidadeSelect.value || '').trim() : '';
      if (v) return v;
    } catch { /* noop */ }
    var fallback = String(selectedUnitId || '').trim();
    if (fallback) return fallback;
    return String(userUnit || '').trim();
  }

  async function loadUnidades() {
    unidadeSelect.disabled = true;
    setSelectOptions(unidadeSelect, [{ value: '', label: 'Carregando...' }], '');

    var list = [];
    try { list = await api('/api/unidades'); } catch { list = []; }

    var unidades = Array.isArray(list) ? list : (Array.isArray(list && list.data) ? list.data : []);
    var norm = unidades.map(function (u) {
      var id = u && (u._id || u.id) ? String(u._id || u.id) : '';
      var codigo = String(u && u.codigo ? u.codigo : '').trim();
      var nome = String(u && u.nome ? u.nome : '').trim();
      var label = (codigo ? (codigo + ' - ') : '') + (nome || id || 'Unidade');
      return { id: id, label: label };
    }).filter(function (u) { return !!u.id; });

    if (isScopeAll) {
      var saved = '';
      try { saved = String(localStorage.getItem('wdg_comunicados_unidade') || '').trim(); } catch { saved = ''; }
      var prefer = String(userUnit || '').trim() || saved;
      var initial = prefer && norm.some(function (u) { return u.id === prefer; }) ? prefer : (norm[0] ? norm[0].id : '');

      selectedUnitId = initial;
      setSelectOptions(unidadeSelect, norm.map(function (u) { return { value: u.id, label: u.label }; }), initial);
      unidadeSelect.disabled = norm.length <= 1;
      try { if (initial) localStorage.setItem('wdg_comunicados_unidade', initial); } catch { /* noop */ }
      return;
    }

    var fixed = String(userUnit || '').trim();
    if (!fixed && norm.length === 1) fixed = norm[0].id;
    selectedUnitId = fixed;

    var fixedLabel = '';
    if (fixed) {
      var found = norm.find(function (u) { return u.id === fixed; });
      fixedLabel = found ? found.label : fixed;
    }

    setSelectOptions(unidadeSelect, fixed ? [{ value: fixed, label: fixedLabel }] : [{ value: '', label: 'Unidade não vinculada' }], fixed);
    unidadeSelect.disabled = true;
  }

  function safeDate(v){
    if(!v) return null;
    var d = new Date(v);
    if(!isFinite(d.getTime())) return null;
    return d;
  }

  var DAY_MS = 24 * 60 * 60 * 1000;
  var END_OF_DAY_MS = DAY_MS - 1;

  function toDateValue(v){
    var d = safeDate(v);
    if(!d) return '';
    var pad = function(n){ return String(n).padStart(2,'0'); };
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  }

  function todayLocalStart(){
    var t = new Date();
    t.setHours(0,0,0,0);
    return t;
  }

  function enforceInicioMinToday(){
    if(!vigInicio) return;
    var t = todayLocalStart();
    var tStr = toDateValue(t);
    try { vigInicio.min = tStr; } catch { /* noop */ }

    var cur = parseDateValue(vigInicio.value);
    if(!cur || cur.getTime() < t.getTime()){
      try { vigInicio.value = tStr; } catch { /* noop */ }
    }
  }

  function parseDateValue(v){
    var s = String(v || '').trim();
    if(!s) return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var da = parseInt(m[3], 10);
    if(!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return null;
    // local midnight
    var d = new Date(y, mo - 1, da, 0, 0, 0, 0);
    if(!isFinite(d.getTime())) return null;
    return d;
  }

  function addDays(dateObj, days){
    var d = new Date(dateObj.getTime());
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }

  function computeMaxEnd(iniDate){
    // permite até +10 dias considerando fim do dia (23:59:59.999)
    return new Date(iniDate.getTime() + (10 * DAY_MS) + END_OF_DAY_MS);
  }

  function fmtDateTime(v){
    var d = safeDate(v);
    if(!d) return '';
    return d.toLocaleString('pt-BR');
  }

  function fmtDateTimeHM(v){
    var d = safeDate(v);
    if(!d) return '';
    var dateStr = d.toLocaleDateString('pt-BR');
    var timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
    return dateStr + ', ' + timeStr;
  }

  function syncVigenciaConstraints(){
    if(!vigInicio || !vigFim) return;
    var ini = parseDateValue(vigInicio.value);
    if(!ini) return;
    var maxEndDate = addDays(ini, 10);
    var maxEndStr = toDateValue(maxEndDate);
    try {
      vigFim.min = toDateValue(ini);
      vigFim.max = maxEndStr;
    } catch { /* noop */ }

    var fim = parseDateValue(vigFim.value);
    if(!fim){
      // default: máximo permitido
      vigFim.value = maxEndStr;
      return;
    }
    if(fim.getTime() < ini.getTime()){
      vigFim.value = toDateValue(ini);
      return;
    }
    if(fim.getTime() > maxEndDate.getTime()){
      vigFim.value = maxEndStr;
    }
  }

  function statusInfo(it){
    var s = String(it && (it.statusCalc || it.status) ? (it.statusCalc || it.status) : '');
    if (s === 'ativa') return { label: 'Ativa', cls: 'wdg-com-badge--ativa' };
    if (s === 'agendada') return { label: 'Agendada', cls: 'wdg-com-badge--agendada' };
    if (s === 'encerrada') return { label: 'Encerrada', cls: 'wdg-com-badge--encerrada' };
    return { label: '—', cls: 'wdg-com-badge--encerrada' };
  }

  function setListMeta(total, totalPages, page){
    lastTotal = Number(total || 0);
    lastTotalPages = Number(totalPages || 0);
    if (!Number.isFinite(lastTotal) || lastTotal < 0) lastTotal = 0;
    if (!Number.isFinite(lastTotalPages) || lastTotalPages < 0) lastTotalPages = 0;
    if (Number.isFinite(page) && page > 0) currentPage = Number(page);
    if (countEl) countEl.textContent = String(lastTotal);
  }

  function clampPage(p){
    var n = parseInt(String(p || '1'), 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (lastTotalPages && n > lastTotalPages) n = lastTotalPages;
    return n;
  }

  function renderPager(){
    if (!pagerEl) return;
    var totalPages = lastTotalPages;
    if (!Number.isFinite(totalPages) || totalPages < 1) totalPages = 1;

    var page = clampPage(currentPage);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);

    var html = '';
    html += '<button type="button" class="wdg-com-page" data-page="' + String(page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + ' aria-label="Página anterior">‹</button>';
    for (var i = start; i <= end; i++) {
      html += '<button type="button" class="wdg-com-page' + (i === page ? ' is-active' : '') + '" data-page="' + String(i) + '" aria-label="Página ' + String(i) + '">' + String(i) + '</button>';
    }
    html += '<button type="button" class="wdg-com-page" data-page="' + String(page + 1) + '" ' + (page >= totalPages ? 'disabled' : '') + ' aria-label="Próxima página">›</button>';

    pagerEl.innerHTML = html;
    pagerEl.hidden = false;
  }

  function renderList(items){
    var list = Array.isArray(items) ? items : [];

    if (!list.length) {
      listEl.hidden = true;
      emptyEl.hidden = false;
      pagerEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    listEl.innerHTML = list.map(function(it){
      var st = statusInfo(it);
      var ini = fmtDateTimeHM(it.vigencia_inicio);
      var fim = fmtDateTimeHM(it.vigencia_fim);
      var ass = String(it && it.assunto ? it.assunto : '').trim();
      var msgRaw = String(it && it.mensagem ? it.mensagem : '').trim();
      var msg1 = msgRaw.replace(/\s+/g,' ').trim();
      if (msg1.length > 110) msg1 = msg1.slice(0, 107) + '...';
      // Slot não deve exibir conteúdo/preview (inclui imagem)
      var thumb = '';

      return ''
        + '<article class="wdg-com-item" data-com-id="' + escapeHtml(it._id) + '">'
        + '  <div class="wdg-com-top">'
        + '    <div style="min-width:0">'
        + '      <span class="wdg-com-badge" title="Vigência"><i class="bi bi-calendar-event" aria-hidden="true"></i> ' + escapeHtml(ini) + ' → ' + escapeHtml(fim) + '</span>'
        + '    </div>'
        + '    <div>'
        + '      <span class="wdg-com-badge ' + st.cls + '" title="Status">' + escapeHtml(st.label) + '</span>'
        + '    </div>'
        + '  </div>'
        + '  <div class="wdg-com-mid">'
        + '    ' + thumb
        + '    <div class="wdg-com-msg"><span class="wdg-com-subject">' + escapeHtml(ass || 'Comunicado') + '</span><small>Publicado em ' + escapeHtml(fmtDateTime(it.createdAt)) + '</small></div>'
        + '  </div>'
        + '  <div class="wdg-com-toolbar">'
        + '    <button class="wdg-com-tool" type="button" data-action="editar" title="Editar" aria-label="Editar"><img src="' + BASE_PATH + '/images/editar.png" alt=""></button>'
        + '    <button class="wdg-com-tool" type="button" data-action="excluir" title="Excluir" aria-label="Excluir"><img src="' + BASE_PATH + '/images/excluir.png" alt=""></button>'
        + '  </div>'
        + '</article>';
    }).join('');
  }

  function splitTokens(raw){
    var s = String(raw || '');
    if(!s) return [];
    var parts = s.split(/[\n,;\t]+/g).map(function(x){ return String(x||'').trim(); }).filter(Boolean);
    var seen = {};
    var out = [];
    parts.forEach(function(p){
      var k = p.toLowerCase();
      if(seen[k]) return;
      seen[k] = true;
      out.push(p);
    });
    return out;
  }

  function normalizeCpf(v){
    return String(v || '').replace(/\D/g,'');
  }

  function buildRestricoes(){
    var habIds = splitTokens(rExcluirHabitacoes && rExcluirHabitacoes.value);
    var morTokens = splitTokens(rExcluirMoradores && rExcluirMoradores.value);

    var excluirMoradorEmails = [];
    var excluirMoradorCpfs = [];
    var excluirMoradorIds = [];

    morTokens.forEach(function(t){
      if (t.indexOf('@') > 0) {
        excluirMoradorEmails.push(String(t).toLowerCase());
        return;
      }
      var cpf = normalizeCpf(t);
      if (cpf && cpf.length === 11) {
        excluirMoradorCpfs.push(cpf);
        return;
      }
      excluirMoradorIds.push(t);
    });

    return {
      naoExibirHabDesabitadas: !!(rNaoExibirDesabitadas && rNaoExibirDesabitadas.checked),
      apenasResponsavelHabitacao: !!(rApenasResponsavel && rApenasResponsavel.checked),
      apenasProprietario: !!(rApenasProprietario && rApenasProprietario.checked),
      excluirHabitacaoIds: habIds,
      excluirMoradorIds: excluirMoradorIds,
      excluirMoradorCpfs: excluirMoradorCpfs,
      excluirMoradorEmails: excluirMoradorEmails
    };
  }

  function writeToTextarea(textarea, values){
    if(!textarea) return;
    textarea.value = (Array.isArray(values) ? values : []).join('\n');
  }

  function makePicker(rootEl, textareaEl, kind){
    if(!rootEl || !textareaEl) return null;

    var boxEl = rootEl.querySelector('[data-enq-picker-box]');
    var inputEl = rootEl.querySelector('[data-enq-picker-input]');
    var tokensEl = rootEl.querySelector('[data-enq-picker-tokens]');
    var menuEl = rootEl.querySelector('[data-enq-picker-menu]');

    var open = false;
    var cacheByUnit = new Map();
    var lastItems = [];

    function openMenu(){
      if(!menuEl) return;
      open = true;
      menuEl.hidden = false;
      renderMenu(lastItems, String(inputEl && inputEl.value || ''));
    }

    function closeMenu(){
      if(!menuEl) return;
      open = false;
      menuEl.hidden = true;
    }

    function parseFromTextarea(){
      return splitTokens(textareaEl.value);
    }

    function syncFromTextarea(){
      var vals = parseFromTextarea();
      renderTokens(vals);
    }

    function stripCpfFromText(text){
      var s = String(text || '').trim();
      if(!s) return '';
      var parts = s.split(/\s+-\s+/g).map(function(p){ return String(p||'').trim(); }).filter(Boolean);
      parts = parts.filter(function(p){ return !/\bcpf\b/i.test(p); });
      return parts.join(' - ').trim();
    }

    function initialsFromName(name){
      var n = String(name || '').trim();
      if(!n) return 'U';
      var words = n.split(/\s+/g).filter(Boolean);
      var a = words[0] ? words[0][0] : 'U';
      var b = words.length > 1 ? words[1][0] : '';
      return String((a + b).toUpperCase()).slice(0,2);
    }

    function findItemByValue(v){
      var key = String(v || '').trim();
      if(!key) return null;
      for (var i=0; i<lastItems.length; i++) {
        var it = lastItems[i];
        if (!it) continue;
        if (String(it.value || '').trim() === key) return it;
      }
      try {
        cacheByUnit.forEach(function(list){
          if (!Array.isArray(list)) return;
          for (var j=0; j<list.length; j++) {
            var it2 = list[j];
            if (!it2) continue;
            if (String(it2.value || '').trim() === key) throw it2;
          }
        });
      } catch (found) {
        if (found && typeof found === 'object') return found;
      }
      return null;
    }

    function getMoradorDisplay(it){
      var rawLabel = String((it && (it.nome || it.name || it.label)) || '').trim();
      var labelClean = stripCpfFromText(rawLabel);
      var parts = labelClean.split(/\s+-\s+/g).map(function(p){ return String(p||'').trim(); }).filter(Boolean);
      var name = String((it && (it.nome || it.name)) || (parts[0] || labelClean) || 'Morador').trim();
      var hab = formatHabitacaoFromItem(it);
      if (!hab) {
        hab = String((it && (it.habitacaoLabel || it.habitacao_text || it.habitacaoTexto || it.habLabel)) || '').trim();
      }
      if (!hab) hab = parts.slice(1).join(' - ');
      hab = stripCpfFromText(hab);
      var foto = String((it && (it.foto || it.fotoUrl || it.avatar || it.avatarUrl || it.photo || it.photoUrl || it.profilePhotoUrl || it.foto_url || it.urlFoto || it.url_foto)) || '').trim();
      return {
        name: name || 'Morador',
        hab: hab,
        foto: normalizeImgSrc(foto, ''),
        initials: initialsFromName(name)
      };
    }

    function getHabitacaoDisplay(it){
      var formatted = formatHabitacaoFromItem(it);
      if (formatted) {
        var segs = formatted.split(/\s+-\s+/g).map(function(p){ return String(p||'').trim(); }).filter(Boolean);
        var cond = String((it && (it.condominioNome || it.condominio || it.unidadeNome || it.unidade_nome || it.unidade)) || '').trim();
        return {
          line1: cond || 'Condomínio',
          line2: segs.join(' - '),
          initials: initialsFromName(cond || 'Condomínio')
        };
      }
      var rawLabel = String((it && (it.label || it.nome || it.name)) || '').trim();
      var labelClean = stripCpfFromText(rawLabel);
      var parts = labelClean.split(/\s+-\s+/g).map(function(p){ return String(p||'').trim(); }).filter(Boolean);
      var cond2 = String((it && (it.condominioNome || it.condominio || it.unidadeNome || it.unidade_nome || it.unidade)) || '').trim();
      if (!parts.length) return { line1: (cond2 || 'Condomínio'), line2: '', initials: initialsFromName(cond2 || 'Condomínio') };
      return { line1: (cond2 || 'Condomínio'), line2: parts.join(' - '), initials: initialsFromName(cond2 || 'Condomínio') };
    }

    function escapeAttr(v){
      return escapeHtml(String(v || '')).replace(/"/g,'&quot;');
    }

    var DEFAULT_USER_ICON = BASE_PATH + '/images/usuario.png';
    var DEFAULT_HOME_ICON = BASE_PATH + '/images/home.png';

    try {
      if (!window.__wdgImgFallback) {
        window.__wdgImgFallback = function(img){
          try {
            if (!img) return;
            var t1 = img.getAttribute('data-try1');
            if (t1) {
              img.removeAttribute('data-try1');
              img.src = t1;
              return;
            }
            var t2 = img.getAttribute('data-try2');
            if (t2) {
              img.removeAttribute('data-try2');
              img.src = t2;
              return;
            }
            var fin = img.getAttribute('data-final') || '';
            img.onerror = null;
            if (fin) img.src = fin;
          } catch { /* noop */ }
        };
      }
    } catch { /* noop */ }

    function uniqueUrls(list){
      var out = [];
      var seen = new Set();
      (Array.isArray(list) ? list : []).forEach(function(u){
        var s = String(u || '').trim();
        if (!s) return;
        if (seen.has(s)) return;
        seen.add(s);
        out.push(s);
      });
      return out;
    }

    function guessPhotoPrefixes(){
      var prefixes = [];
      try {
        var bp = String(BASE_PATH || '').trim();
        if (bp) prefixes.push(bp);
      } catch { /* noop */ }
      try {
        var p = String(location && location.pathname ? location.pathname : '');
        if (p.startsWith('/gestor')) prefixes.push('/gestor');
        if (p.startsWith('/condominios')) prefixes.push('/condominios');
      } catch { /* noop */ }
      prefixes.push('/condominios');
      prefixes.push('/gestor');
      prefixes.push('');
      return uniqueUrls(prefixes);
    }

    function buildUserFotoCandidates(raw){
      var s = String(raw || '').trim();
      if (!s) return [];
      var out = [];
      out.push(s);
      try {
        // Se vier com prefixo /gestor mas o endpoint existir em /condominios (ou vice-versa), tenta ambos.
        if (s.startsWith('/gestor/api/usuarios/foto')) out.push(s.replace('/gestor', '/condominios'));
        if (s.startsWith('/condominios/api/usuarios/foto')) out.push(s.replace('/condominios', '/gestor'));
        // Sem prefixo de módulo, tenta prefixar.
        if (s.startsWith('/api/usuarios/foto')) {
          guessPhotoPrefixes().forEach(function(pref){
            if (!pref) out.push(s);
            else out.push(pref + s);
          });
        }
      } catch { /* noop */ }
      return uniqueUrls(out);
    }

    function normalizeImgSrc(src, fallback){
      var s = String(src || '').trim();
      if(!s) return String(fallback || '').trim();
      s = s.replace(/\\/g, '/');
      if (/^(data:|https?:\/\/|blob:)/i.test(s)) return s;
      if (s.startsWith('/')) return s;
      return '/' + s;
    }

    function normalizeUserPhotoApiPath(p){
      var s = String(p || '').trim();
      if (!s) return '';
      // Padroniza o endpoint de foto para respeitar o basePath do módulo.
      // Ex.: /api/usuarios/foto?... -> /condominios/api/usuarios/foto?... (quando BASE_PATH=/condominios)
      //      /condominios/api/usuarios/foto?... -> mantém
      // Também corrige casos legados que venham como /gestor/api/usuarios/foto?... quando o módulo atual é /condominios.
      try {
        var bp = String(BASE_PATH || '').trim();
        if (!bp) return s;
        if (s.startsWith(bp + '/api/usuarios/foto')) return s;
        if (s.startsWith('/api/usuarios/foto')) return bp + s;
        if (s.startsWith('/gestor/api/usuarios/foto')) return bp + s.replace('/gestor', '');
      } catch { /* noop */ }
      return s;
    }

    function pick(obj, keys){
      if(!obj) return '';
      for (var i=0; i<keys.length; i++){
        var k = keys[i];
        if (obj && obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
      }
      return '';
    }

    function formatHabitacaoFromItem(it){
      if(!it) return '';
      var hab = it.habitacao || it.hab || it.unidadeHabitacao || it.habitacaoObj || null;
      var bloco = pick(hab || it, ['bloco', 'blocoNome', 'bloco_nome', 'bloco_name', 'torre', 'torreNome', 'torre_nome']);
      var andar = pick(hab || it, ['andar', 'andarNome', 'andar_nome', 'pavimento', 'pavimentoNome', 'pavimento_nome']);
      var tipo = pick(hab || it, ['tipo', 'tipoHabitacao', 'tipo_habitacao', 'tipoNome', 'tipo_nome', 'categoria', 'categoriaNome', 'categoria_nome']);
      var numero = pick(hab || it, ['numero', 'num', 'apto', 'apartamento', 'casa', 'unidade', 'unidadeNumero', 'unidade_numero', 'habitacaoNumero', 'habitacao_numero']);
      var parts = [];
      if (bloco) parts.push(/^bloco\b/i.test(bloco) ? bloco : ('Bloco ' + bloco));
      if (andar) parts.push(andar);
      if (tipo) {
        if (numero) parts.push(tipo + ' ' + numero);
        else parts.push(tipo);
      } else if (numero) {
        parts.push(numero);
      }
      return parts.join(' - ').trim();
    }

    function renderTokens(vals){
      var arr = Array.isArray(vals) ? vals : [];
      tokensEl.innerHTML = arr.map(function(v){
        var display = String(v || '');
        if (kind === 'moradores') {
          var it = findItemByValue(v);
          if (it) {
            var info = getMoradorDisplay(it);
            display = info.hab ? (info.name + ' · ' + info.hab) : info.name;
          } else {
            display = stripCpfFromText(display);
          }
        } else if (kind === 'habitacoes') {
          var itH = findItemByValue(v);
          if (itH) {
            var infoH = getHabitacaoDisplay(itH);
            display = infoH.line2 ? (infoH.line1 + ' · ' + infoH.line2) : infoH.line1;
          }
        }
        var short = display;
        if (short.length > 26) short = short.slice(0, 23) + '...';
        return '<span class="wdg-enq-token" data-token data-val="' + escapeHtml(v) + '">' + escapeHtml(short) + '<button type="button" data-token-del aria-label="Remover">×</button></span>';
      }).join('');
    }

    function renderMenu(items, q){
      if(!menuEl) return;
      var query = String(q || '').toLowerCase().trim();
      var selected = new Set(parseFromTextarea().map(function(x){ return String(x); }));
      var list = (Array.isArray(items) ? items : []).filter(function(it){
        if(!it) return false;
        var lbl = String(it.label || '').toLowerCase();
        var val = String(it.value || '');
        if(!val) return false;
        if(selected.has(val)) return false;
        if(!query) return true;
        return lbl.indexOf(query) >= 0 || val.toLowerCase().indexOf(query) >= 0;
      }).slice(0, 40);

      if(!list.length){
        menuEl.innerHTML = '<div class="px-3 py-2 text-muted" style="font-weight:700">Nenhum resultado.</div>';
        return;
      }

      menuEl.innerHTML = list.map(function(it){
        if (kind === 'moradores') {
          var info = getMoradorDisplay(it);
          var primary = normalizeUserPhotoApiPath(normalizeImgSrc(info.foto, DEFAULT_USER_ICON)) || DEFAULT_USER_ICON;
          var cands = buildUserFotoCandidates(primary);
          // Sempre finaliza no ícone do usuário (com BASE_PATH) para evitar quebrar UI.
          var try1 = cands.length > 1 ? cands[1] : '';
          var try2 = cands.length > 2 ? cands[2] : '';
          var src = cands.length ? cands[0] : primary;
          var avatar = ''
            + '<span class="wdg-pick-avatar">'
            +   '<img src="' + escapeAttr(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer"'
            +     (try1 ? (' data-try1="' + escapeAttr(try1) + '"') : '')
            +     (try2 ? (' data-try2="' + escapeAttr(try2) + '"') : '')
            +     ' data-final="' + escapeAttr(DEFAULT_USER_ICON) + '"'
            +     ' onerror="window.__wdgImgFallback && window.__wdgImgFallback(this)">'
            + '</span>';
          var habLine = info.hab ? ('<span class="wdg-pick-hab">' + escapeHtml(info.hab) + '</span>') : '';
          return ''
            + '<button type="button" class="wdg-enq-picker-item" data-menu-item data-val="' + escapeHtml(it.value) + '">' 
            +   avatar
            +   '<span class="wdg-pick-lines">'
            +     '<span class="wdg-pick-name">' + escapeHtml(info.name) + '</span>'
            +     habLine
            +   '</span>'
            + '</button>';
        }

        if (kind === 'habitacoes') {
          var infoHab = getHabitacaoDisplay(it);
          var avatarHab = ''
            + '<span class="wdg-pick-avatar">'
            +   '<img src="' + escapeAttr(DEFAULT_HOME_ICON) + '" alt="" loading="lazy"'
            +     ' onerror="this.onerror=null;this.src=\'' + escapeAttr(DEFAULT_HOME_ICON) + '\';">'
            + '</span>';
          var line2 = infoHab.line2 ? ('<span class="wdg-pick-hab">' + escapeHtml(infoHab.line2) + '</span>') : '';
          return ''
            + '<button type="button" class="wdg-enq-picker-item" data-menu-item data-val="' + escapeHtml(it.value) + '">' 
            +   avatarHab
            +   '<span class="wdg-pick-lines">'
            +     '<span class="wdg-pick-name">' + escapeHtml(infoHab.line1 || 'Habitação') + '</span>'
            +     line2
            +   '</span>'
            + '</button>';
        }

        return '<button type="button" class="wdg-enq-picker-item" data-menu-item data-val="' + escapeHtml(it.value) + '">' + escapeHtml(it.label || it.value) + '</button>';
      }).join('');
    }

    async function loadItemsForUnit(unidadeId){
      var u = String(unidadeId || '').trim();
      if(!u) return [];
      if(cacheByUnit.has(u)) return cacheByUnit.get(u);
      var path = kind === 'moradores' ? '/api/comunicados/restricoes/moradores' : '/api/comunicados/restricoes/habitacoes';
      var data = await api(path + '?unidade_id=' + encodeURIComponent(u));
      var items = Array.isArray(data && data.data) ? data.data : [];
      cacheByUnit.set(u, items);
      return items;
    }

    function addValues(values){
      var curr = parseFromTextarea();
      var set = new Set(curr);
      (Array.isArray(values) ? values : []).forEach(function(v){
        var s = String(v || '').trim();
        if(!s) return;
        if(set.has(s)) return;
        curr.push(s);
        set.add(s);
      });
      writeToTextarea(textareaEl, curr);
      syncFromTextarea();
    }

    if(boxEl){
      boxEl.addEventListener('click', function(){
        try { inputEl && inputEl.focus(); } catch { /* noop */ }
      });
    }

    if(inputEl){
      inputEl.addEventListener('focus', async function(){
        try {
          var unidade = String(getSelectedUnidadeId() || '').trim();
          lastItems = await loadItemsForUnit(unidade);
        } catch { lastItems = []; }
        openMenu();
      });

      inputEl.addEventListener('input', function(){
        if(!open) openMenu();
        renderMenu(lastItems, inputEl.value);
      });

      inputEl.addEventListener('keydown', function(ev){
        if(ev.key === 'Escape'){
          closeMenu();
          inputEl.blur();
          return;
        }
        if(ev.key === 'Enter'){
          ev.preventDefault();
          var raw = String(inputEl.value || '').trim();
          if(!raw) return;
          var parts = splitTokens(raw);
          if(!parts.length) return;
          addValues(parts);
          inputEl.value = '';
          renderMenu(lastItems, '');
        }
      });

      inputEl.addEventListener('paste', function(){
        setTimeout(function(){
          var raw = String(inputEl.value || '').trim();
          if(!raw) return;
          var parts = splitTokens(raw);
          if(!parts.length) return;
          addValues(parts);
          inputEl.value = '';
          renderMenu(lastItems, '');
        }, 0);
      });
    }

    if(menuEl){
      menuEl.addEventListener('click', function(ev){
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-menu-item]') : null;
        if(!btn) return;
        var v = String(btn.getAttribute('data-val') || '').trim();
        if(!v) return;
        addValues([v]);
        if(inputEl) inputEl.value = '';
        renderMenu(lastItems, '');
      });
    }

    if(tokensEl){
      tokensEl.addEventListener('click', function(ev){
        var del = ev.target && ev.target.closest ? ev.target.closest('[data-token-del]') : null;
        if(!del) return;
        var tok = del.closest('[data-token]');
        if(!tok) return;
        var v = String(tok.getAttribute('data-val') || '').trim();
        if(!v) return;
        var curr = parseFromTextarea();
        writeToTextarea(textareaEl, curr.filter(function(x){ return x !== v; }));
        syncFromTextarea();
      });
    }

    document.addEventListener('click', function(ev){
      if(!open) return;
      if(rootEl.contains(ev.target)) return;
      closeMenu();
    });

    syncFromTextarea();

    return {
      syncFromTextarea: syncFromTextarea,
      clearCache: function(){ cacheByUnit.clear(); closeMenu(); }
    };
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = function () { reject(new Error('Falha ao ler arquivo')); };
        reader.readAsDataURL(file);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function uploadFoto(unidadeId, dataUrl) {
    var u = String(unidadeId || '').trim();
    if (!u) throw new Error('Unidade inválida');
    var resp = await api('/api/comunicados/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unidade_id: u, foto: dataUrl })
    });
    var url = resp && (resp.url || (resp.data && resp.data.url)) ? String(resp.url || (resp.data && resp.data.url) || '') : '';
    if (!url) throw new Error('Upload não retornou URL');
    return url;
  }

  function setFotoPreview(src){
    var s = String(src || '').trim();
    if(!comFotoPreviewWrap || !comFotoPreview) return;
    if(!s){
      comFotoPreviewWrap.hidden = true;
      comFotoPreview.removeAttribute('src');
      return;
    }
    comFotoPreview.src = s;
    comFotoPreviewWrap.hidden = false;
  }

  function setFotoWrapVisible(visible){
    if(!comFotoWrap) return;
    comFotoWrap.hidden = !visible;
  }

  function clearFotoInput(){
    comFotoFile = null;
    if(comFotoObjectUrl){
      try { URL.revokeObjectURL(comFotoObjectUrl); } catch { /* noop */ }
      comFotoObjectUrl = '';
    }
    try { if(comFoto) comFoto.value = ''; } catch { /* noop */ }
  }

  function resetForm(){
    comId.value = '';
    btnEnviar.textContent = 'Enviar comunicado';

    var now = todayLocalStart();
    var end = addDays(now, 10);
    vigInicio.value = toDateValue(now);
    enforceInicioMinToday();
    vigFim.value = toDateValue(end);
    syncVigenciaConstraints();
    assunto.value = '';
    mensagem.value = '';

    comFotoUrlInput.value = '';
    clearFotoInput();
    setFotoPreview('');
    setFotoWrapVisible(false);

    if (rNaoExibirDesabitadas) rNaoExibirDesabitadas.checked = false;
    if (rApenasResponsavel) rApenasResponsavel.checked = false;
    if (rApenasProprietario) rApenasProprietario.checked = false;
    if (rExcluirHabitacoes) rExcluirHabitacoes.value = '';
    if (rExcluirMoradores) rExcluirMoradores.value = '';

    if (pickerHabitacoes) pickerHabitacoes.syncFromTextarea();
    if (pickerMoradores) pickerMoradores.syncFromTextarea();
  }

  function loadFormFromComunicado(it){
    comId.value = String(it._id || '');
    btnEnviar.textContent = 'Salvar alterações';

    vigInicio.value = toDateValue(it.vigencia_inicio);
    vigFim.value = toDateValue(it.vigencia_fim);
    // regra: não permitir início anterior à data atual
    enforceInicioMinToday();
    syncVigenciaConstraints();
    assunto.value = String(it.assunto || '');
    mensagem.value = String(it.mensagem || '');

    var fotoUrl = String(it.foto || '').trim();
    comFotoUrlInput.value = fotoUrl;
    clearFotoInput();
    setFotoPreview(fotoUrl);
    setFotoWrapVisible(!!fotoUrl);

    var r = it.restricoes || {};
    if (rNaoExibirDesabitadas) rNaoExibirDesabitadas.checked = !!r.naoExibirHabDesabitadas;
    if (rApenasResponsavel) rApenasResponsavel.checked = !!r.apenasResponsavelHabitacao;
    if (rApenasProprietario) rApenasProprietario.checked = !!r.apenasProprietario;

    if (rExcluirHabitacoes) rExcluirHabitacoes.value = Array.isArray(r.excluirHabitacaoIds) ? r.excluirHabitacaoIds.join('\n') : '';

    var morParts = [];
    if (Array.isArray(r.excluirMoradorIds)) morParts = morParts.concat(r.excluirMoradorIds);
    if (Array.isArray(r.excluirMoradorCpfs)) morParts = morParts.concat(r.excluirMoradorCpfs);
    if (Array.isArray(r.excluirMoradorEmails)) morParts = morParts.concat(r.excluirMoradorEmails);
    if (rExcluirMoradores) rExcluirMoradores.value = morParts.join('\n');

    if (pickerHabitacoes) pickerHabitacoes.syncFromTextarea();
    if (pickerMoradores) pickerMoradores.syncFromTextarea();
  }

  async function refreshList(){
    var unidade = String(getSelectedUnidadeId() || '');
    var qs = unidade ? ('?unidade_id=' + encodeURIComponent(unidade)) : '';
    var glue = qs ? '&' : '?';
    qs += glue + 'page=' + encodeURIComponent(String(currentPage || 1)) + '&limit=' + encodeURIComponent(String(PAGE_SIZE));

    var data = await api('/api/comunicados' + qs);
    var items = (data && data.data) || [];
    setListMeta(data && data.total, data && data.totalPages, data && data.page);

    if (lastTotalPages && currentPage > lastTotalPages) {
      currentPage = lastTotalPages;
      return await refreshList();
    }

    renderList(items);
    renderPager();
    return items;
  }

  async function submitForm(ev){
    ev.preventDefault();

    var unidadeSelecionada = String(getSelectedUnidadeId() || '').trim();
    if (!unidadeSelecionada) {
      alert('Selecione o condomínio (unidade) antes de salvar o comunicado.');
      return;
    }

    btnEnviar.disabled = true;
    try {
      var foto = String(comFotoUrlInput.value || '').trim();
      if (comFotoFile) {
        var dataUrl = await readFileAsDataUrl(comFotoFile);
        foto = await uploadFoto(unidadeSelecionada, dataUrl);
      }

      var iniDate = parseDateValue(vigInicio.value);
      var fimDate = parseDateValue(vigFim.value);
      if(!iniDate || !fimDate){
        alert('Informe as datas de início e fim.');
        return;
      }

      var today = todayLocalStart();
      if (iniDate.getTime() < today.getTime()) {
        enforceInicioMinToday();
        syncVigenciaConstraints();
        alert('A data de início não pode ser anterior à data atual.');
        return;
      }

      // normalização: início 00:00 e fim 23:59:59.999
      iniDate.setHours(0,0,0,0);
      fimDate.setHours(23,59,59,999);

      if (fimDate.getTime() <= iniDate.getTime()) {
        alert('A data final deve ser maior que a inicial.');
        return;
      }

      var maxEnd = computeMaxEnd(iniDate);
      if (fimDate.getTime() > maxEnd.getTime()) {
        alert('A data final só pode ser até 10 dias após a inicial (considerando 23:59).');
        return;
      }

      var payload = {
        unidade_id: unidadeSelecionada,
        vigencia_inicio: iniDate.toISOString(),
        vigencia_fim: fimDate.toISOString(),
        assunto: String(assunto.value || '').trim(),
        mensagem: String(mensagem.value || '').trim(),
        foto: foto,
        restricoes: buildRestricoes()
      };

      if (!payload.mensagem) {
        alert('Informe a mensagem do comunicado.');
        return;
      }

      var id = String(comId.value || '').trim();
      if (id) {
        await api('/api/comunicados/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await api('/api/comunicados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      resetForm();
      currentPage = 1;
      await refreshList();
    } catch (err) {
      alert(err && err.message ? err.message : 'Falha ao salvar comunicado.');
    } finally {
      btnEnviar.disabled = false;
    }
  }

  var pickerHabitacoes = makePicker(pickerHabitacoesRoot, rExcluirHabitacoes, 'habitacoes');
  var pickerMoradores = makePicker(pickerMoradoresRoot, rExcluirMoradores, 'moradores');

  if (pagerEl) {
    pagerEl.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-page]') : null;
      if (!btn) return;
      var p = btn.getAttribute('data-page');
      var next = clampPage(p);
      if (!next || next === currentPage) return;
      currentPage = next;
      refreshList().catch(function(){ /* noop */ });
    });
  }

  listEl.addEventListener('click', async function(ev){
    var card = ev.target && ev.target.closest ? ev.target.closest('[data-com-id]') : null;
    if(!card) return;
    var id = String(card.getAttribute('data-com-id') || '').trim();
    if(!id) return;
    var actionBtn = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
    if(!actionBtn) return;
    var action = String(actionBtn.getAttribute('data-action') || '').trim();
    if(!action) return;

    if(action === 'editar'){
      try {
        var unidade = String(getSelectedUnidadeId() || '');
        var qs = unidade ? ('?unidade_id=' + encodeURIComponent(unidade)) : '';
        var data = await api('/api/comunicados/' + encodeURIComponent(id) + qs);
        var it = data && data.data ? data.data : null;
        if (!it) throw new Error('Comunicado não encontrado');
        if (isScopeAll && unidadeSelect && it.unidade_id) {
          var uid = (typeof it.unidade_id === 'object' && it.unidade_id) ? String(it.unidade_id._id || it.unidade_id.id || '') : String(it.unidade_id || '');
          if (uid) {
            try { unidadeSelect.value = uid; } catch { /* noop */ }
            selectedUnitId = uid;
            try { localStorage.setItem('wdg_comunicados_unidade', uid); } catch { /* noop */ }
          }
        }
        if (pickerHabitacoes) pickerHabitacoes.clearCache();
        if (pickerMoradores) pickerMoradores.clearCache();
        loadFormFromComunicado(it);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        alert(err && err.message ? err.message : 'Falha ao carregar comunicado.');
      }
      return;
    }

    if(action === 'excluir'){
      var ok = confirm('Deseja excluir este comunicado?');
      if(!ok) return;
      try {
        var unidade2 = String(getSelectedUnidadeId() || '');
        var qs2 = unidade2 ? ('?unidade_id=' + encodeURIComponent(unidade2)) : '';
        await api('/api/comunicados/' + encodeURIComponent(id) + qs2, { method: 'DELETE' });
        if (String(comId.value || '') === id) resetForm();
        await refreshList();
      } catch (err2) {
        alert(err2 && err2.message ? err2.message : 'Falha ao excluir comunicado.');
      }
    }
  });

  if (form) form.addEventListener('submit', submitForm);
  if (btnLimpar) btnLimpar.addEventListener('click', function(){ resetForm(); });

  if (comFotoToggle) {
    comFotoToggle.addEventListener('click', function(){
      // UX esperado: apenas exibir/ocultar o campo de escolher arquivo.
      var nextVisible = comFotoWrap ? !!comFotoWrap.hidden : true;
      setFotoWrapVisible(nextVisible);
    });
  }

  if (comFoto) {
    comFoto.addEventListener('change', function(){
      var f = comFoto.files && comFoto.files[0] ? comFoto.files[0] : null;
      if(!f){
        comFotoFile = null;
        setFotoPreview(String(comFotoUrlInput.value || ''));
        return;
      }
      comFotoFile = f;
      if(comFotoObjectUrl){
        try { URL.revokeObjectURL(comFotoObjectUrl); } catch { /* noop */ }
        comFotoObjectUrl = '';
      }
      comFotoObjectUrl = URL.createObjectURL(f);
      setFotoPreview(comFotoObjectUrl);
      setFotoWrapVisible(true);
    });
  }

  if (comFotoRemover) {
    comFotoRemover.addEventListener('click', function(){
      comFotoUrlInput.value = '';
      clearFotoInput();
      setFotoPreview('');
      setFotoWrapVisible(false);
    });
  }

  if (unidadeSelect) {
    unidadeSelect.addEventListener('change', function(){
      var v = String(unidadeSelect.value || '').trim();
      if (v) selectedUnitId = v;
      try { if (isScopeAll && v) localStorage.setItem('wdg_comunicados_unidade', v); } catch { /* noop */ }
      if (pickerHabitacoes) pickerHabitacoes.clearCache();
      if (pickerMoradores) pickerMoradores.clearCache();
      currentPage = 1;
      refreshList().catch(function(){ /* noop */ });
    });
  }

  if (vigInicio) {
    vigInicio.addEventListener('change', function(){
      enforceInicioMinToday();
      syncVigenciaConstraints();
    });
  }
  if (vigFim) {
    vigFim.addEventListener('change', function(){
      syncVigenciaConstraints();
    });
  }

  loadUnidades().then(function(){
    resetForm();
    refreshList().catch(function(){ /* noop */ });
  }).catch(function(){
    resetForm();
  });
})();
