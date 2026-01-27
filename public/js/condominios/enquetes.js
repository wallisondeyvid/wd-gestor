(function () {
  'use strict';

  var app = document.getElementById('enquetesApp');
  if (!app) return;

  var BASE_PATH = String(app.getAttribute('data-base-path') || '').trim() || '/condominios';
  var isScopeAll = (document.body && document.body.getAttribute('data-scope-all')) === 'true';
  var userUnit = (document.body && document.body.getAttribute('data-user-unit')) || '';

  function splitTokens(text) {
    var s = String(text == null ? '' : text);
    if (!s.trim()) return [];
    return s
      .split(/\r?\n|\t|\s*,\s*|\s*;\s*|\s*\|\s*/g)
      .map(function (t) { return String(t || '').trim(); })
      .filter(Boolean);
  }

  function escapeHtml(text) {
    var s = String(text == null ? '' : text);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeCpf(text) {
    var s = String(text == null ? '' : text);
    return s.replace(/\D/g, '');
  }

  function pad2(n) {
    var v = Number(n || 0);
    return String(v < 10 ? ('0' + v) : v);
  }

  function toDatetimeLocalValue(d) {
    if (!d) return '';
    var dt = (d instanceof Date) ? d : new Date(d);
    if (!dt || !Number.isFinite(dt.getTime())) return '';
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate()) + 'T' + pad2(dt.getHours()) + ':' + pad2(dt.getMinutes());
  }

  function fmtDateTime(d) {
    if (!d) return '';
    var dt = (d instanceof Date) ? d : new Date(d);
    if (!dt || !Number.isFinite(dt.getTime())) return '';
    return pad2(dt.getDate()) + '/' + pad2(dt.getMonth() + 1) + '/' + dt.getFullYear() + ' ' + pad2(dt.getHours()) + ':' + pad2(dt.getMinutes());
  }

  function safeImgSrc(src) {
    var s = String(src || '').trim();
    if (!s) return '';
    s = s.replace(/\\/g, '/');
    if (/^(data:|https?:\/\/|blob:)/i.test(s)) return s;
    if (s.startsWith('/')) return s;
    return '/' + s;
  }

  function isTooLargeImageFile(file) {
    try {
      var f = file;
      if (!f) return false;
      var max = 2 * 1024 * 1024; // ~2MB
      return Number(f.size || 0) > max;
    } catch (e) {
      return false;
    }
  }

  var unidadeSelect = document.getElementById('enqUnidadeSelect');
  var selectedUnitId = '';

  // Paginação / lista
  var PAGE_SIZE = 8;
  var currentPage = 1;
  var lastTotal = 0;
  var lastTotalPages = 0;

  var form = document.getElementById('enqForm');
  var enqId = document.getElementById('enqId');
  var vigInicio = document.getElementById('vigInicio');
  var vigFim = document.getElementById('vigFim');
  var pergunta = document.getElementById('pergunta');
  var perguntaFoto = document.getElementById('perguntaFoto');
  var perguntaFotoWrap = document.getElementById('perguntaFotoWrap');
  var perguntaFotoToggle = document.getElementById('perguntaFotoToggle');
  var perguntaFotoPreviewWrap = document.getElementById('perguntaFotoPreviewWrap');
  var perguntaFotoPreview = document.getElementById('perguntaFotoPreview');
  var perguntaFotoRemover = document.getElementById('perguntaFotoRemover');
  var opcoesWrap = document.getElementById('opcoesWrap');

  var btnEnviar = document.getElementById('btnEnviar');
  var btnLimpar = document.getElementById('btnLimpar');

  // Uploads / previews
  var perguntaFotoFile = null;
  var perguntaFotoObjectUrl = '';
  var optFileMap = new Map();
  var optObjectUrlMap = new Map();
  var optKeySeq = 1;

  // Restrições
  var rNaoExibirDesabitadas = document.getElementById('rNaoExibirDesabitadas');
  var rApenasResponsavel = document.getElementById('rApenasResponsavel');
  var rApenasProprietario = document.getElementById('rApenasProprietario');
  var rExcluirHabitacoes = document.getElementById('rExcluirHabitacoes');
  var rExcluirMoradores = document.getElementById('rExcluirMoradores');

  var pickerHabitacoesRoot = app.querySelector('[data-enq-picker="habitacoes"]');
  var pickerMoradoresRoot = app.querySelector('[data-enq-picker="moradores"]');

  // Lista / Paginação
  var countEl = app.querySelector('[data-enq-count]');
  var listEl = document.getElementById('enqList');
  var emptyEl = document.getElementById('enqEmpty');
  var pagerEl = document.getElementById('enqPager');

  // Modais / viewer
  var detalhesModalEl = document.getElementById('enqDetalhesModal');
  var detalhesTitle = document.getElementById('enqDetalhesTitle');
  var detalhesKpi = document.getElementById('enqDetalhesKpi');
  var detalhesPergunta = document.getElementById('enqDetalhesPergunta');
  var detalhesOpcoes = document.getElementById('enqDetalhesOpcoes');
  var detalhesFotoWrap = document.getElementById('enqDetalhesFotoWrap');
  var detalhesFoto = document.getElementById('enqDetalhesFoto');

  var detalhesModal = null;

  var finalizarModalEl = document.getElementById('enqFinalizarModal');
  var finalizarModal = null;
  var btnConfirmFinalizar = document.getElementById('btnEnqConfirmFinalizar');
  var pendingFinalizarId = '';

  var imgViewer = document.getElementById('enqImgViewer');
  var imgViewerClose = document.getElementById('enqImgViewerClose');
  var imgViewerImg = document.getElementById('enqImgViewerImg');
  var imgViewerOpen = false;

  function setDetalhesFoto(src) {
    if (!detalhesFotoWrap || !detalhesFoto) return;
    var s = safeImgSrc(src);
    if (!s) {
      detalhesFotoWrap.hidden = true;
      detalhesFoto.removeAttribute('src');
      return;
    }
    detalhesFoto.src = s;
    detalhesFotoWrap.hidden = false;
  }

  function openImgViewer(src) {
    if (!imgViewer || !imgViewerImg) return;
    var s = safeImgSrc(src);
    if (!s) return;
    imgViewerImg.src = s;
    imgViewer.hidden = false;
    imgViewer.setAttribute('aria-hidden', 'false');
    imgViewerOpen = true;
  }

  function closeImgViewer() {
    if (!imgViewer || !imgViewerImg) return;
    imgViewer.hidden = true;
    imgViewer.setAttribute('aria-hidden', 'true');
    imgViewerOpen = false;
    try { imgViewerImg.removeAttribute('src'); } catch (e) { /* noop */ }
  }

  var perguntaFotoUrl = '';
  function writeToTextarea(textarea, values) {
    if (!textarea) return;
    textarea.value = (Array.isArray(values) ? values : []).join('\n');
  }

  function makePicker(rootEl, textareaEl, kind) {
    if (!rootEl || !textareaEl) return null;

    var boxEl = rootEl.querySelector('[data-enq-picker-box]');
    var inputEl = rootEl.querySelector('[data-enq-picker-input]');
    var tokensEl = rootEl.querySelector('[data-enq-picker-tokens]');
    var menuEl = rootEl.querySelector('[data-enq-picker-menu]');

    var open = false;
    var cacheByUnit = new Map();
    var lastItems = [];

    function openMenu() {
      if (!menuEl) return;
      open = true;
      menuEl.hidden = false;
      renderMenu(lastItems, String((inputEl && inputEl.value) || ''));
    }

    function closeMenu() {
      if (!menuEl) return;
      open = false;
      menuEl.hidden = true;
    }

    function parseFromTextarea() {
      return splitTokens(textareaEl.value);
    }

    function stripCpfFromText(text) {
      var s = String(text || '').trim();
      if (!s) return '';
      var parts = s.split(/\s+-\s+/g).map(function (p) { return String(p || '').trim(); }).filter(Boolean);
      parts = parts.filter(function (p) { return !/\bcpf\b/i.test(p); });
      return parts.join(' - ').trim();
    }

    function initialsFromName(name) {
      var n = String(name || '').trim();
      if (!n) return 'U';
      var words = n.split(/\s+/g).filter(Boolean);
      var a = words[0] ? words[0][0] : 'U';
      var b = words.length > 1 ? words[1][0] : '';
      return String((a + b).toUpperCase()).slice(0, 2);
    }

    function findItemByValue(v) {
      var key = String(v || '').trim();
      if (!key) return null;
      for (var i = 0; i < lastItems.length; i++) {
        var it = lastItems[i];
        if (!it) continue;
        if (String(it.value || '').trim() === key) return it;
      }
      try {
        cacheByUnit.forEach(function (list) {
          if (!Array.isArray(list)) return;
          for (var j = 0; j < list.length; j++) {
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

    function escapeAttr(v) {
      return escapeHtml(String(v || '')).replace(/"/g, '&quot;');
    }

    function uniqueUrls(list) {
      var out = [];
      var seen = new Set();
      (Array.isArray(list) ? list : []).forEach(function (u) {
        var s = String(u || '').trim();
        if (!s) return;
        if (seen.has(s)) return;
        seen.add(s);
        out.push(s);
      });
      return out;
    }

    function guessPhotoPrefixes() {
      var prefixes = [];
      try {
        var bp = String(BASE_PATH || '').trim();
        if (bp) prefixes.push(bp);
      } catch (e) { /* noop */ }
      try {
        var p = String(location && location.pathname ? location.pathname : '');
        if (p.startsWith('/gestor')) prefixes.push('/gestor');
        if (p.startsWith('/condominios')) prefixes.push('/condominios');
      } catch (e) { /* noop */ }
      prefixes.push('/condominios');
      prefixes.push('/gestor');
      prefixes.push('');
      return uniqueUrls(prefixes);
    }

    function normalizeImgSrc(src, fallback) {
      var s = String(src || '').trim();
      if (!s) return String(fallback || '').trim();
      s = s.replace(/\\/g, '/');
      if (/^(data:|https?:\/\/|blob:)/i.test(s)) return s;
      if (s.startsWith('/')) return s;
      return '/' + s;
    }

    function normalizeUserPhotoApiPath(p) {
      var s = String(p || '').trim();
      if (!s) return '';
      try {
        var bp = String(BASE_PATH || '').trim();
        if (!bp) return s;
        if (s.startsWith(bp + '/api/usuarios/foto')) return s;
        if (s.startsWith('/api/usuarios/foto')) return bp + s;
        if (s.startsWith('/gestor/api/usuarios/foto')) return bp + s.replace('/gestor', '');
      } catch (e) { /* noop */ }
      return s;
    }

    function buildUserFotoCandidates(raw) {
      var s = String(raw || '').trim();
      if (!s) return [];
      var out = [];
      out.push(s);
      try {
        if (s.startsWith('/gestor/api/usuarios/foto')) out.push(s.replace('/gestor', '/condominios'));
        if (s.startsWith('/condominios/api/usuarios/foto')) out.push(s.replace('/condominios', '/gestor'));
        if (s.startsWith('/api/usuarios/foto')) {
          guessPhotoPrefixes().forEach(function (pref) {
            if (!pref) out.push(s);
            else out.push(pref + s);
          });
        }
      } catch (e) { /* noop */ }
      return uniqueUrls(out);
    }

    function pick(obj, keys) {
      if (!obj) return '';
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (obj && obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
      }
      return '';
    }

    function formatHabitacaoFromItem(it) {
      if (!it) return '';
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

    function getMoradorDisplay(it) {
      var rawLabel = String((it && (it.nome || it.name || it.label)) || '').trim();
      var labelClean = stripCpfFromText(rawLabel);
      var parts = labelClean.split(/\s+-\s+/g).map(function (p) { return String(p || '').trim(); }).filter(Boolean);
      var name = String((it && (it.nome || it.name)) || (parts[0] || labelClean) || 'Morador').trim();
      var hab = formatHabitacaoFromItem(it);
      if (!hab) hab = String((it && (it.habitacaoLabel || it.habitacao_text || it.habitacaoTexto || it.habLabel)) || '').trim();
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

    function getHabitacaoDisplay(it) {
      var formatted = formatHabitacaoFromItem(it);
      if (formatted) {
        var segs = formatted.split(/\s+-\s+/g).map(function (p) { return String(p || '').trim(); }).filter(Boolean);
        var cond = String((it && (it.condominioNome || it.condominio || it.unidadeNome || it.unidade_nome || it.unidade)) || '').trim();
        return {
          line1: cond || 'Condomínio',
          line2: segs.join(' - '),
          initials: initialsFromName(cond || 'Condomínio')
        };
      }
      var rawLabel = String((it && (it.label || it.nome || it.name)) || '').trim();
      var labelClean = stripCpfFromText(rawLabel);
      var parts = labelClean.split(/\s+-\s+/g).map(function (p) { return String(p || '').trim(); }).filter(Boolean);
      var cond2 = String((it && (it.condominioNome || it.condominio || it.unidadeNome || it.unidade_nome || it.unidade)) || '').trim();
      if (!parts.length) return { line1: (cond2 || 'Condomínio'), line2: '', initials: initialsFromName(cond2 || 'Condomínio') };
      return { line1: (cond2 || 'Condomínio'), line2: parts.join(' - '), initials: initialsFromName(cond2 || 'Condomínio') };
    }

    var DEFAULT_USER_ICON = BASE_PATH + '/images/usuario.png';
    var DEFAULT_HOME_ICON = BASE_PATH + '/images/home.png';

    try {
      if (!window.__wdgImgFallback) {
        window.__wdgImgFallback = function (img) {
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
          } catch (e) { /* noop */ }
        };
      }
    } catch (e) { /* noop */ }

    function renderTokens(vals) {
      var arr = Array.isArray(vals) ? vals : [];
      tokensEl.innerHTML = arr.map(function (v) {
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

    function renderMenu(items, q) {
      if (!menuEl) return;
      var query = String(q || '').toLowerCase().trim();
      var selected = new Set(parseFromTextarea().map(function (x) { return String(x); }));
      var list = (Array.isArray(items) ? items : []).filter(function (it) {
        if (!it) return false;
        var lbl = String(it.label || '').toLowerCase();
        var val = String(it.value || '');
        if (!val) return false;
        if (selected.has(val)) return false;
        if (!query) return true;
        return lbl.indexOf(query) >= 0 || val.toLowerCase().indexOf(query) >= 0;
      }).slice(0, 40);

      if (!list.length) {
        menuEl.innerHTML = '<div class="px-3 py-2 text-muted" style="font-weight:700">Nenhum resultado.</div>';
        return;
      }

      menuEl.innerHTML = list.map(function (it) {
        if (kind === 'moradores') {
          var info = getMoradorDisplay(it);
          var primary = normalizeUserPhotoApiPath(normalizeImgSrc(info.foto, DEFAULT_USER_ICON)) || DEFAULT_USER_ICON;
          var cands = buildUserFotoCandidates(primary);
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

    async function loadItemsForUnit(unidadeId) {
      var u = String(unidadeId || '').trim();
      if (!u) return [];
      if (cacheByUnit.has(u)) return cacheByUnit.get(u);
      var path = kind === 'moradores' ? '/api/enquetes/restricoes/moradores' : '/api/enquetes/restricoes/habitacoes';
      var data = await api(path + '?unidade_id=' + encodeURIComponent(u));
      var items = Array.isArray(data && data.data) ? data.data : [];
      cacheByUnit.set(u, items);
      return items;
    }

    function addValues(values) {
      var curr = parseFromTextarea();
      var set = new Set(curr);
      (Array.isArray(values) ? values : []).forEach(function (v) {
        var s = String(v || '').trim();
        if (!s) return;
        if (set.has(s)) return;
        curr.push(s);
        set.add(s);
      });
      writeToTextarea(textareaEl, curr);
      syncFromTextarea();
    }

    function syncFromTextarea() {
      var vals = parseFromTextarea();
      renderTokens(vals);
    }

    if (boxEl) {
      boxEl.addEventListener('click', function () {
        try { inputEl && inputEl.focus(); } catch (e) { /* noop */ }
      });
    }

    if (inputEl) {
      inputEl.addEventListener('focus', async function () {
        try {
          var unidade = String(getSelectedUnidadeId() || '').trim();
          lastItems = await loadItemsForUnit(unidade);
        } catch (e) { lastItems = []; }
        openMenu();
      });

      inputEl.addEventListener('input', function () {
        if (!open) openMenu();
        renderMenu(lastItems, inputEl.value);
      });

      inputEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          closeMenu();
          inputEl.blur();
          return;
        }
        if (ev.key === 'Enter') {
          ev.preventDefault();
          var raw = String(inputEl.value || '').trim();
          if (!raw) return;
          var parts = splitTokens(raw);
          if (!parts.length) return;
          addValues(parts);
          inputEl.value = '';
          renderMenu(lastItems, '');
        }
      });

      inputEl.addEventListener('paste', function () {
        setTimeout(function () {
          var raw = String(inputEl.value || '').trim();
          if (!raw) return;
          var parts = splitTokens(raw);
          if (!parts.length) return;
          addValues(parts);
          inputEl.value = '';
          renderMenu(lastItems, '');
        }, 0);
      });
    }

    if (menuEl) {
      menuEl.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-menu-item]') : null;
        if (!btn) return;
        var v = String(btn.getAttribute('data-val') || '').trim();
        if (!v) return;
        addValues([v]);
        if (inputEl) inputEl.value = '';
        renderMenu(lastItems, '');
      });
    }

    if (tokensEl) {
      tokensEl.addEventListener('click', function (ev) {
        var del = ev.target && ev.target.closest ? ev.target.closest('[data-token-del]') : null;
        if (!del) return;
        var tok = del.closest('[data-token]');
        if (!tok) return;
        var v = String(tok.getAttribute('data-val') || '').trim();
        if (!v) return;
        var curr = parseFromTextarea();
        writeToTextarea(textareaEl, curr.filter(function (x) { return x !== v; }));
        syncFromTextarea();
      });
    }

    document.addEventListener('click', function (ev) {
      if (!open) return;
      if (rootEl.contains(ev.target)) return;
      closeMenu();
    });

    syncFromTextarea();

    return {
      syncFromTextarea: syncFromTextarea,
      clearCache: function () { cacheByUnit.clear(); closeMenu(); }
    };
  }

  function buildRestricoes() {
    var habIds = splitTokens(rExcluirHabitacoes && rExcluirHabitacoes.value);
    var morTokens = splitTokens(rExcluirMoradores && rExcluirMoradores.value);

    var excluirMoradorEmails = [];
    var excluirMoradorCpfs = [];
    var excluirMoradorIds = [];

    morTokens.forEach(function (t) {
      if (t.indexOf('@') > 0) {
        excluirMoradorEmails.push(String(t).toLowerCase());
        return;
      }
      var cpf = normalizeCpf(t);
      if (cpf && cpf.length === 11) {
        excluirMoradorCpfs.push(cpf);
        return;
      }
      // fallback: id
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
    var resp = await api('/api/enquetes/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unidade_id: u, foto: dataUrl })
    });
    var url = resp && (resp.url || (resp.data && resp.data.url)) ? String(resp.url || (resp.data && resp.data.url) || '') : '';
    if (!url) throw new Error('Upload não retornou URL');
    return url;
  }

  function setPerguntaFotoPreview(src) {
    if (!perguntaFotoPreviewWrap || !perguntaFotoPreview) return;
    var s = String(src || '').trim();
    if (!s) {
      perguntaFotoPreviewWrap.hidden = true;
      perguntaFotoPreview.removeAttribute('src');
      return;
    }
    perguntaFotoPreview.src = s;
    perguntaFotoPreviewWrap.hidden = false;
  }

  function setPerguntaFotoWrapVisible(visible) {
    if (!perguntaFotoWrap) return;
    perguntaFotoWrap.hidden = !visible;
  }

  var pickerHabitacoes = makePicker(pickerHabitacoesRoot, rExcluirHabitacoes, 'habitacoes');
  var pickerMoradores = makePicker(pickerMoradoresRoot, rExcluirMoradores, 'moradores');

  function clearPerguntaFotoInput() {
    perguntaFotoFile = null;
    if (perguntaFotoObjectUrl) {
      try { URL.revokeObjectURL(perguntaFotoObjectUrl); } catch (e) { /* noop */ }
      perguntaFotoObjectUrl = '';
    }
    try { if (perguntaFoto) perguntaFoto.value = ''; } catch (e) { /* noop */ }
  }

  function cleanupOptPreview(key) {
    var k = String(key || '');
    var obj = optObjectUrlMap.get(k);
    if (obj) {
      try { URL.revokeObjectURL(obj); } catch (e) { /* noop */ }
      optObjectUrlMap.delete(k);
    }
    optFileMap.delete(k);
  }

  function setOptPreview(row, src) {
    if (!row) return;
    var wrap = row.querySelector('[data-opt-preview]');
    var img = row.querySelector('[data-opt-preview-img]');
    var s = String(src || '').trim();
    if (!wrap || !img) return;
    if (!s) {
      wrap.hidden = true;
      img.removeAttribute('src');
      return;
    }
    img.src = s;
    wrap.hidden = false;
  }

  function removeOptFoto(row) {
    if (!row) return;
    var key = String(row.getAttribute('data-opt-key') || '').trim();
    if (key) cleanupOptPreview(key);
    row.setAttribute('data-opt-foto-url', '');
    try {
      var input = row.querySelector('[data-opt-foto]');
      if (input) input.value = '';
    } catch (e) { /* noop */ }
    setOptPreview(row, '');

    var wrap = row.querySelector('[data-opt-foto-wrap]');
    if (wrap) wrap.hidden = true;
  }

  function optionRowTemplate(idx, value, fotoUrl, key) {
    var v = value ? String(value) : '';
    var k = String(key || ('opt_' + (optKeySeq++)));
    var foto = fotoUrl ? String(fotoUrl) : '';
    return ''
      + '<div class="wdg-enq-option-row wdg-enq-opt-block" data-opt-row data-opt-key="' + escapeHtml(k) + '" data-opt-foto-url="' + escapeHtml(foto) + '">' 
      + '  <div class="wdg-enq-opt-block-head">'
      + '    <div class="wdg-enq-opt-block-title" data-opt-title>Alternativa ' + String(idx + 1) + '</div>'
      + '    <div class="wdg-enq-opt-tools">'
      + '      <button class="wdg-enq-icon-btn" type="button" title="Adicionar alternativa" aria-label="Adicionar alternativa" data-opt-add><img src="' + escapeHtml(BASE_PATH) + '/images/adicionar.png" alt=""></button>'
      + '      <button class="wdg-enq-icon-btn" type="button" title="Adicionar imagem" aria-label="Adicionar imagem" data-opt-foto-toggle><img class="wdg-enq-ico" src="' + escapeHtml(BASE_PATH) + '/images/foto.png" alt=""></button>'
      + '      <button class="wdg-enq-icon-btn" type="button" title="Remover" aria-label="Remover" data-opt-del><img src="' + escapeHtml(BASE_PATH) + '/images/remover.png" alt=""></button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="wdg-enq-option-main">'
      + '    <textarea class="form-control wdg-enq-opt-text" maxlength="180" rows="2" placeholder="Alternativa ' + String(idx + 1) + '" data-opt-input required>' + escapeHtml(v) + '</textarea>'
      + '    <div data-opt-foto-wrap ' + (foto ? '' : 'hidden') + '>'
      + '      <div class="wdg-enq-photo-line">'
      + '        <input class="form-control" type="file" accept="image/png,image/jpeg,image/webp" data-opt-foto>'
      + '        <button class="wdg-enq-icon-btn" type="button" title="Remover foto" aria-label="Remover foto" data-opt-foto-remove><img class="wdg-enq-ico" src="' + escapeHtml(BASE_PATH) + '/images/remover.png" alt=""></button>'
      + '      </div>'
      + '      <div class="wdg-enq-photo-preview" data-opt-preview ' + (foto ? '' : 'hidden') + '>'
      + '        <img data-opt-preview-img alt="" ' + (foto ? ('src="' + escapeHtml(foto) + '"') : '') + ' />'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function renderOptions(values) {
    var list = Array.isArray(values) ? values : [];
    if (list.length < 2) list = ['', ''];
    if (list.length > 12) list = list.slice(0, 12);

    opcoesWrap.innerHTML = list.map(function (it, i) {
      if (it && typeof it === 'object') {
        return optionRowTemplate(i, it.texto || it.value || '', it.foto || '', it.key || '');
      }
      return optionRowTemplate(i, it, '', '');
    }).join('');
    syncOptionButtons();
  }

  function syncOptionButtons() {
    var rows = opcoesWrap.querySelectorAll('[data-opt-row]');
    rows.forEach(function (row, i) {
      var input = row.querySelector('[data-opt-input]');
      if (input) input.setAttribute('placeholder', 'Alternativa ' + String(i + 1));
      var title = row.querySelector('[data-opt-title]');
      if (title) title.textContent = 'Alternativa ' + String(i + 1);
      var del = row.querySelector('[data-opt-del]');
      if (del) del.disabled = rows.length <= 2;
      var add = row.querySelector('[data-opt-add]');
      if (add) {
        add.hidden = i !== (rows.length - 1);
        add.disabled = rows.length >= 12;
      }
    });
  }

  async function buildOptionsPayload(unidadeId) {
    var values = [];
    var rows = opcoesWrap.querySelectorAll('[data-opt-row]');

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var input = row.querySelector('[data-opt-input]');
      var v = String(input && input.value ? input.value : '').trim();
      if (!v) continue;

      var key = String(row.getAttribute('data-opt-key') || '').trim();
      var existingFoto = String(row.getAttribute('data-opt-foto-url') || '').trim();
      var file = key ? optFileMap.get(key) : null;
      var fotoUrl = existingFoto;
      if (file) {
        var dataUrl = await readFileAsDataUrl(file);
        fotoUrl = await uploadFoto(unidadeId, dataUrl);
      }
      values.push({ texto: v, foto: fotoUrl || '' });
    }

    // remove duplicates (case-insensitive), mantendo a primeira ocorrência
    var seen = Object.create(null);
    var out = [];
    values.forEach(function (o) {
      var k = String(o.texto || '').toLowerCase();
      if (!k) return;
      if (seen[k]) return;
      seen[k] = true;
      out.push({ texto: String(o.texto || '').trim(), foto: String(o.foto || '').trim() });
    });
    return out;
  }

  async function api(path, opts) {
    var url = BASE_PATH + path;
    var resp = await fetch(url, Object.assign({
      credentials: 'same-origin',
      headers: Object.assign({ 'Accept': 'application/json', 'X-Requested-With': 'fetch' }, (opts && opts.headers) || {})
    }, opts || {}));
    var json = null;
    try { json = await resp.json(); } catch (e) { json = null; }
    if (!resp.ok) {
      var msg = (json && (json.error || json.message)) ? String(json.error || json.message) : ('Falha na requisição: ' + String(resp.status));
      throw new Error(msg);
    }
    return json;
  }

  function setSelectOptions(selectEl, options, selectedValue) {
    if (!selectEl) return;
    var opts = Array.isArray(options) ? options : [];
    selectEl.innerHTML = opts.map(function (o) {
      return '<option value="' + escapeHtml(o && o.value) + '">' + escapeHtml(o && o.label) + '</option>';
    }).join('');
    if (selectedValue) {
      try { selectEl.value = String(selectedValue); } catch (e) { /* noop */ }
    }
  }

  function getSelectedUnidadeId() {
    try {
      var v = unidadeSelect ? String(unidadeSelect.value || '').trim() : '';
      if (v) return v;
    } catch (e) { /* noop */ }
    var fallback = String(selectedUnitId || '').trim();
    if (fallback) return fallback;
    return String(userUnit || '').trim();
  }

  async function loadUnidades() {
    if (!unidadeSelect) return;

    unidadeSelect.disabled = true;
    setSelectOptions(unidadeSelect, [{ value: '', label: 'Carregando...' }], '');

    var list = [];
    try {
      list = await api('/api/unidades');
    } catch (e) {
      list = [];
    }

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
      try { saved = String(localStorage.getItem('wdg_enquetes_unidade') || '').trim(); } catch (e) { saved = ''; }

      var prefer = String(userUnit || '').trim() || saved;
      var initial = prefer && norm.some(function (u) { return u.id === prefer; }) ? prefer : (norm[0] ? norm[0].id : '');

      selectedUnitId = initial;
      setSelectOptions(unidadeSelect, norm.map(function (u) { return { value: u.id, label: u.label }; }), initial);
      unidadeSelect.disabled = norm.length <= 1;
      try { if (initial) localStorage.setItem('wdg_enquetes_unidade', initial); } catch (e) { /* noop */ }
      return;
    }

    // Diretor/User: fixa a unidade vinculada
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

  function statusInfo(enq) {
    var s = String(enq && (enq.statusCalc || enq.status)) || '';
    if (s === 'ativa') return { label: 'Ativa', cls: 'wdg-enq-badge--ativa' };
    if (s === 'agendada') return { label: 'Agendada', cls: 'wdg-enq-badge--agendada' };
    if (s === 'encerrada') return { label: 'Encerrada', cls: 'wdg-enq-badge--encerrada' };
    if (s === 'finalizada') return { label: 'Finalizada', cls: 'wdg-enq-badge--finalizada' };
    return { label: '—', cls: 'wdg-enq-badge--encerrada' };
  }

  function canReport(enq) {
    var s = String(enq && (enq.statusCalc || enq.status)) || '';
    return s === 'encerrada' || s === 'finalizada';
  }

  function canEdit(enq) {
    var s = String(enq && (enq.statusCalc || enq.status)) || '';
    return s !== 'finalizada' && s !== 'encerrada';
  }

  function canFinalize(enq) {
    var s = String(enq && (enq.statusCalc || enq.status)) || '';
    return s === 'ativa' || s === 'agendada';
  }

  function setListMeta(total, totalPages, page) {
    lastTotal = Number(total || 0);
    lastTotalPages = Number(totalPages || 0);
    if (!Number.isFinite(lastTotal) || lastTotal < 0) lastTotal = 0;
    if (!Number.isFinite(lastTotalPages) || lastTotalPages < 0) lastTotalPages = 0;
    if (Number.isFinite(page) && page > 0) currentPage = Number(page);
    if (countEl) countEl.textContent = String(lastTotal);
  }

  function clampPage(p) {
    var n = parseInt(String(p || '1'), 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (lastTotalPages && n > lastTotalPages) n = lastTotalPages;
    return n;
  }

  function renderPager() {
    if (!pagerEl) return;
    // Mantém a paginação visível (fixa) mesmo com 1 página,
    // para o usuário sempre enxergar o "sistema de paginação".
    var totalPages = lastTotalPages;
    if (!Number.isFinite(totalPages) || totalPages < 1) totalPages = 1;

    var page = clampPage(currentPage);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);

    var html = '';
    html += '<button type="button" class="wdg-enq-page" data-page="' + String(page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + ' aria-label="Página anterior">‹</button>';

    for (var i = start; i <= end; i++) {
      html += '<button type="button" class="wdg-enq-page' + (i === page ? ' is-active' : '') + '" data-page="' + String(i) + '" aria-label="Página ' + String(i) + '">' + String(i) + '</button>';
    }

    html += '<button type="button" class="wdg-enq-page" data-page="' + String(page + 1) + '" ' + (page >= totalPages ? 'disabled' : '') + ' aria-label="Próxima página">›</button>';

    pagerEl.innerHTML = html;
    pagerEl.hidden = false;
  }

  function renderList(items) {
    var list = Array.isArray(items) ? items : [];

    if (!list.length) {
      if (listEl) listEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      if (pagerEl) pagerEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    listEl.innerHTML = list.map(function (enq) {
      var st = statusInfo(enq);
      var ini = fmtDateTime(enq.vigencia_inicio);
      var fim = fmtDateTime(enq.vigencia_fim);
      var perguntaTxt = String(enq.pergunta || '').trim();
      var title = perguntaTxt.length > 80 ? (perguntaTxt.slice(0, 77) + '...') : perguntaTxt;

      return ''
        + '<article class="wdg-enq-item" data-enq-id="' + escapeHtml(enq._id) + '">'
        + '  <div class="wdg-enq-top">'
        + '    <div class="wdg-enq-top-left">'
        + '      <span class="wdg-enq-badge" title="Vigência"><i class="bi bi-calendar-event" aria-hidden="true"></i> ' + escapeHtml(ini) + ' → ' + escapeHtml(fim) + '</span>'
        + '    </div>'
        + '    <div class="wdg-enq-top-right">'
        + '      <span class="wdg-enq-badge ' + st.cls + '" title="Status">' + st.label + '</span>'
        + '    </div>'
        + '  </div>'
        + '  <div class="wdg-enq-mid">'
        + '    <h3 title="' + escapeHtml(perguntaTxt) + '">' + escapeHtml(title || 'Enquete') + '</h3>'
        + '  </div>'
        + '  <div class="wdg-enq-toolbar">'
        + '    <button class="wdg-enq-tool" type="button" data-action="detalhes" title="Detalhes" aria-label="Detalhes"><img src="' + BASE_PATH + '/images/detalhe.png" alt=""></button>'
        + '    <button class="wdg-enq-tool" type="button" data-action="relatorio" title="Relatório" aria-label="Relatório" ' + (canReport(enq) ? '' : 'disabled') + '><img src="' + BASE_PATH + '/images/relatorio.png" alt=""></button>'
        + '    <button class="wdg-enq-tool" type="button" data-action="editar" title="Editar" aria-label="Editar" ' + (canEdit(enq) ? '' : 'disabled') + '><img src="' + BASE_PATH + '/images/editar.png" alt=""></button>'
        + '    <button class="wdg-enq-tool" type="button" data-action="finalizar" title="Finalizar" aria-label="Finalizar" ' + (canFinalize(enq) ? '' : 'disabled') + '><img src="' + BASE_PATH + '/images/cancelar.png" alt=""></button>'
        + '    <button class="wdg-enq-tool" type="button" data-action="excluir" title="Excluir" aria-label="Excluir"><img src="' + BASE_PATH + '/images/excluir.png" alt=""></button>'
        + '  </div>'
        + '</article>';
    }).join('');
  }

  function resetForm() {
    enqId.value = '';
    btnEnviar.textContent = 'Enviar enquete';

    var now = new Date();
    var end = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
    if (vigInicio) vigInicio.value = toDatetimeLocalValue(now);
    if (vigFim) vigFim.value = toDatetimeLocalValue(end);
    if (pergunta) pergunta.value = '';

    perguntaFotoUrl = '';
    clearPerguntaFotoInput();
    setPerguntaFotoPreview('');
    setPerguntaFotoWrapVisible(false);

    try {
      optObjectUrlMap.forEach(function (u) {
        try { URL.revokeObjectURL(u); } catch (e) { /* noop */ }
      });
    } catch (e) { /* noop */ }
    optFileMap.clear();
    optObjectUrlMap.clear();

    if (rNaoExibirDesabitadas) rNaoExibirDesabitadas.checked = false;
    if (rApenasResponsavel) rApenasResponsavel.checked = false;
    if (rApenasProprietario) rApenasProprietario.checked = false;
    if (rExcluirHabitacoes) rExcluirHabitacoes.value = '';
    if (rExcluirMoradores) rExcluirMoradores.value = '';

    if (pickerHabitacoes) pickerHabitacoes.syncFromTextarea();
    if (pickerMoradores) pickerMoradores.syncFromTextarea();

    renderOptions(['', '']);
  }

  function loadFormFromEnquete(enq) {
    enqId.value = String(enq._id || '');
    btnEnviar.textContent = 'Salvar alterações';

    vigInicio.value = toDatetimeLocalValue(enq.vigencia_inicio);
    vigFim.value = toDatetimeLocalValue(enq.vigencia_fim);
    pergunta.value = String(enq.pergunta || '');

    perguntaFotoUrl = String(enq.foto_pergunta || '').trim();
    clearPerguntaFotoInput();
    setPerguntaFotoPreview(perguntaFotoUrl);
    setPerguntaFotoWrapVisible(!!perguntaFotoUrl);

    var r = enq.restricoes || {};
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

    var ops = Array.isArray(enq.opcoes)
      ? enq.opcoes.map(function (o) {
        if (!o) return null;
        if (typeof o === 'string') return { texto: o, foto: '' };
        return { texto: (o.texto || ''), foto: (o.foto || '') };
      }).filter(Boolean)
      : [];
    renderOptions(ops);
  }

  async function refreshList() {
    var unidade = String(getSelectedUnidadeId() || '');
    var qs = unidade ? ('?unidade_id=' + encodeURIComponent(unidade)) : '';
    var glue = qs ? '&' : '?';
    qs += glue + 'page=' + encodeURIComponent(String(currentPage || 1)) + '&limit=' + encodeURIComponent(String(PAGE_SIZE));

    var data = await api('/api/enquetes' + qs);
    var items = (data && data.data) || [];
    setListMeta(data && data.total, data && data.totalPages, data && data.page);

    // Se a página atual ficou inválida (ex.: deletou itens), recua e recarrega 1 vez.
    if (lastTotalPages && currentPage > lastTotalPages) {
      currentPage = lastTotalPages;
      return await refreshList();
    }

    renderList(items);
    renderPager();
    return items;
  }

  if (pagerEl) {
    pagerEl.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-page]') : null;
      if (!btn) return;
      var p = btn.getAttribute('data-page');
      var next = clampPage(p);
      if (!next || next === currentPage) return;
      currentPage = next;
      refreshList().catch(function () { /* noop */ });
    });
  }

  async function submitForm(e) {
    e.preventDefault();

    var unidadeSelecionada = String(getSelectedUnidadeId() || '').trim();
    if (!unidadeSelecionada) {
      alert('Selecione o condomínio (unidade) antes de salvar a enquete.');
      return;
    }

    btnEnviar.disabled = true;
    try {
      var opts = await buildOptionsPayload(unidadeSelecionada);
      if (opts.length < 2) {
        alert('Informe pelo menos 2 alternativas.');
        return;
      }

      var fotoPergunta = String(perguntaFotoUrl || '').trim();
      if (perguntaFotoFile) {
        var dataUrlPerg = await readFileAsDataUrl(perguntaFotoFile);
        fotoPergunta = await uploadFoto(unidadeSelecionada, dataUrlPerg);
      }

      var payload = {
        unidade_id: unidadeSelecionada,
        vigencia_inicio: new Date(vigInicio.value).toISOString(),
        vigencia_fim: new Date(vigFim.value).toISOString(),
        pergunta: String(pergunta.value || '').trim(),
        foto_pergunta: fotoPergunta,
        opcoes: opts,
        restricoes: buildRestricoes()
      };

      if (!payload.pergunta) {
        alert('Informe o questionamento.');
        return;
      }

      var id = String(enqId.value || '').trim();
      if (id) {
        await api('/api/enquetes/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await api('/api/enquetes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      resetForm();
      currentPage = 1;
      await refreshList();
    } catch (err) {
      alert(err && err.message ? err.message : 'Falha ao salvar enquete.');
    } finally {
      btnEnviar.disabled = false;
    }
  }

  async function openDetalhes(id) {
    if (!detalhesModal) {
      try { detalhesModal = new bootstrap.Modal(detalhesModalEl); } catch (e) { detalhesModal = null; }
    }
    detalhesTitle.textContent = 'Carregando...';
    detalhesPergunta.textContent = '';
    detalhesKpi.innerHTML = '';
    detalhesOpcoes.innerHTML = '';
    setDetalhesFoto('');
    if (detalhesModal) detalhesModal.show();

    try {
      var unidade = String(getSelectedUnidadeId() || '');
      var qs = unidade ? ('?unidade_id=' + encodeURIComponent(unidade)) : '';
      var data = await api('/api/enquetes/' + encodeURIComponent(id) + '/detalhes' + qs);
      var enq = data && data.enquete ? data.enquete : null;
      var total = Number(data && data.totalVotos ? data.totalVotos : 0);
      var status = String(data && data.statusCalc ? data.statusCalc : (enq && enq.statusCalc ? enq.statusCalc : ''));
      var ini = fmtDateTime(enq && enq.vigencia_inicio);
      var fim = fmtDateTime(enq && enq.vigencia_fim);

      detalhesTitle.textContent = 'Resultado: ' + (status ? status.toUpperCase() : 'ENQUETE');
      detalhesPergunta.textContent = String(enq && enq.pergunta ? enq.pergunta : '');
      setDetalhesFoto(enq && enq.foto_pergunta ? enq.foto_pergunta : '');

      detalhesKpi.innerHTML = ''
        + '<div class="wdg-enq-kpi-card"><small>Vigência</small><strong>' + escapeHtml(ini) + ' → ' + escapeHtml(fim) + '</strong></div>'
        + '<div class="wdg-enq-kpi-card"><small>Votantes</small><strong>' + String(total) + '</strong></div>'
        + '<div class="wdg-enq-kpi-card"><small>Opções</small><strong>' + String((enq && enq.opcoes ? enq.opcoes.length : 0)) + '</strong></div>';

      var options = Array.isArray(data && data.opcoes) ? data.opcoes : [];
      if (!options.length) {
        detalhesOpcoes.innerHTML = '<div class="wdg-empty">Sem votos registrados ainda.</div>';
        return;
      }

      detalhesOpcoes.innerHTML = options.map(function (o) {
        var pct = Number(o.percent || 0);
        var votos = Number(o.votos || 0);
        var whoCount = Array.isArray(o.votantes) ? o.votantes.length : 0;
        var fotoOpt = safeImgSrc(o && o.foto ? o.foto : '');

        var votersHtml = '';
        if (whoCount) {
          votersHtml = '<div class="wdg-enq-voters" data-voters>'
            + '<div class="wdg-enq-section-label mb-2">Quem votou nesta alternativa</div>'
            + '<ul>'
            + o.votantes.map(function (v) {
              var nome = String(v.morador_nome || v.nome || '').trim() || 'Morador';
              var hab = String(v.habitacao_label || '').trim();
              var when = fmtDateTime(v.createdAt || v.ts);
              return '<li><div><div class="who">' + escapeHtml(nome) + '</div><div class="where">' + escapeHtml(hab) + '</div></div><div class="when">' + escapeHtml(when) + '</div></li>';
            }).join('')
            + '</ul>'
            + '</div>';
        } else {
          votersHtml = '<div class="wdg-enq-voters" data-voters><div class="wdg-empty" style="padding:1rem">Nenhum voto nesta alternativa.</div></div>';
        }

        return ''
          + '<div class="wdg-enq-opt" data-opt>'
          + '  <div class="wdg-enq-opt-head">'
          + '    <div class="wdg-enq-opt-left">'
          + (fotoOpt ? ('      <div class="wdg-enq-opt-thumb"><img src="' + escapeHtml(fotoOpt) + '" alt="" data-enq-img></div>') : '')
          + '      <div class="wdg-enq-opt-title" style="min-width:0;word-break:break-word">' + escapeHtml(o.texto || '') + '</div>'
          + '    </div>'
          + '    <div class="wdg-enq-opt-meta">'
          + '      <span class="wdg-enq-mini">' + String(votos) + ' votos</span>'
          + '      <button type="button" class="btn btn-sm btn-outline-secondary" style="border-radius:999px;font-weight:900" data-toggle-voters>'
          + '        ' + String(pct.toFixed(1)).replace('.', ',') + '% · ver votantes'
          + '      </button>'
          + '    </div>'
          + '  </div>'
          + '  <div class="wdg-enq-bar" aria-hidden="true"><span style="width:' + String(Math.max(0, Math.min(100, pct))) + '%"></span></div>'
          + votersHtml
          + '</div>';
      }).join('');

      detalhesOpcoes.querySelectorAll('[data-toggle-voters]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var opt = btn.closest('[data-opt]');
          if (!opt) return;
          var voters = opt.querySelector('[data-voters]');
          if (!voters) return;
          voters.classList.toggle('is-open');
        });
      });
    } catch (err) {
      detalhesTitle.textContent = 'Falha ao carregar';
      detalhesPergunta.textContent = '';
      detalhesKpi.innerHTML = '';
      setDetalhesFoto('');
      detalhesOpcoes.innerHTML = '<div class="wdg-empty">' + escapeHtml(err && err.message ? err.message : 'Erro ao carregar detalhes.') + '</div>';
    }
  }

  function openFinalizarConfirm(id) {
    pendingFinalizarId = String(id || '').trim();
    if (!pendingFinalizarId) return;
    if (!finalizarModalEl) {
      // Fallback de segurança (não esperado)
      var ok = window.confirm('Finalizar esta enquete agora?');
      if (ok) {
        // Reutiliza o fluxo de confirmação
        confirmFinalizar();
      }
      return;
    }

    if (!finalizarModal) {
      try { finalizarModal = new bootstrap.Modal(finalizarModalEl); } catch (e) { finalizarModal = null; }
    }
    if (finalizarModal) finalizarModal.show();
  }

  async function confirmFinalizar() {
    var id = String(pendingFinalizarId || '').trim();
    if (!id) return;
    if (btnConfirmFinalizar) btnConfirmFinalizar.disabled = true;
    try {
      var unidadeF = String(getSelectedUnidadeId() || '');
      var qsF = unidadeF ? ('?unidade_id=' + encodeURIComponent(unidadeF)) : '';
      await api('/api/enquetes/' + encodeURIComponent(id) + '/finalizar' + qsF, { method: 'POST' });
      await refreshList();
      if (finalizarModal) finalizarModal.hide();
    } catch (err) {
      alert(err && err.message ? err.message : 'Falha ao finalizar enquete.');
    } finally {
      if (btnConfirmFinalizar) btnConfirmFinalizar.disabled = false;
      pendingFinalizarId = '';
    }
  }

  if (detalhesModalEl) {
    detalhesModalEl.addEventListener('click', function (ev) {
      var img = ev.target && ev.target.closest ? ev.target.closest('[data-enq-img]') : null;
      if (!img) return;
      var src = String(img.getAttribute('src') || '').trim();
      openImgViewer(src);
    });

    // Ao fechar o modal, fecha o viewer também
    detalhesModalEl.addEventListener('hidden.bs.modal', function () {
      closeImgViewer();
    });
  }

  if (imgViewer) {
    imgViewer.addEventListener('click', function (ev) {
      // clique no backdrop fecha; clique na imagem não fecha
      var card = ev.target && ev.target.closest ? ev.target.closest('.wdg-enq-imgviewer-card') : null;
      if (card) return;
      closeImgViewer();
    });
  }

  if (imgViewerClose) {
    imgViewerClose.addEventListener('click', function () {
      closeImgViewer();
    });
  }

  document.addEventListener('keydown', function (ev) {
    if (!imgViewerOpen) return;
    if (ev.key === 'Escape') closeImgViewer();
  });

  async function handleListClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var card = btn.closest('[data-enq-id]');
    if (!card) return;
    var id = card.getAttribute('data-enq-id');
    var action = btn.getAttribute('data-action');
    if (!id || !action) return;

    if (action === 'detalhes') {
      openDetalhes(id);
      return;
    }

    if (action === 'relatorio') {
      var unidadeR = String(getSelectedUnidadeId() || '');
      var qsR = unidadeR ? ('?unidade_id=' + encodeURIComponent(unidadeR)) : '';
      window.open(BASE_PATH + '/api/enquetes/' + encodeURIComponent(id) + '/relatorio.pdf' + qsR, '_blank');
      return;
    }

    if (action === 'editar') {
      try {
        var unidadeE = String(getSelectedUnidadeId() || '');
        var qsE = unidadeE ? ('?unidade_id=' + encodeURIComponent(unidadeE)) : '';
        var data = await api('/api/enquetes/' + encodeURIComponent(id) + qsE);
        var enq = data && data.data ? data.data : null;
        if (!enq) throw new Error('Enquete não encontrada.');
        if (isScopeAll && unidadeSelect && enq && enq.unidade_id) {
          var enqUnit = String(enq.unidade_id && (enq.unidade_id._id || enq.unidade_id.id || enq.unidade_id) ? (enq.unidade_id._id || enq.unidade_id.id || enq.unidade_id) : '').trim();
          if (enqUnit) {
            selectedUnitId = enqUnit;
            try { unidadeSelect.value = enqUnit; } catch (e) { /* noop */ }
            try { localStorage.setItem('wdg_enquetes_unidade', enqUnit); } catch (e) { /* noop */ }
          }
        }
        loadFormFromEnquete(enq);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        alert(err && err.message ? err.message : 'Falha ao carregar enquete.');
      }
      return;
    }

    if (action === 'finalizar') {
      openFinalizarConfirm(id);
      return;
    }

    if (action === 'excluir') {
      var ok2 = window.confirm('Excluir esta enquete? Esta ação remove também os votos.');
      if (!ok2) return;
      try {
        var unidadeX = String(getSelectedUnidadeId() || '');
        var qsX = unidadeX ? ('?unidade_id=' + encodeURIComponent(unidadeX)) : '';
        await api('/api/enquetes/' + encodeURIComponent(id) + qsX, { method: 'DELETE' });
        await refreshList();
      } catch (err) {
        alert(err && err.message ? err.message : 'Falha ao excluir enquete.');
      }
      return;
    }
  }

  // Wire UI
  if (perguntaFotoToggle) {
    perguntaFotoToggle.addEventListener('click', function () {
      var isHidden = perguntaFotoWrap ? !!perguntaFotoWrap.hidden : false;
      setPerguntaFotoWrapVisible(isHidden);
      if (isHidden) {
        try { if (perguntaFoto) perguntaFoto.focus(); } catch (e) { /* noop */ }
      }
    });
  }

  if (btnConfirmFinalizar) {
    btnConfirmFinalizar.addEventListener('click', function (ev) {
      ev.preventDefault();
      confirmFinalizar();
    });
  }

  if (finalizarModalEl) {
    finalizarModalEl.addEventListener('hidden.bs.modal', function () {
      pendingFinalizarId = '';
      if (btnConfirmFinalizar) btnConfirmFinalizar.disabled = false;
    });
  }

  if (perguntaFoto) {
    perguntaFoto.addEventListener('change', function () {
      var f = perguntaFoto.files && perguntaFoto.files[0] ? perguntaFoto.files[0] : null;
      clearPerguntaFotoInput();
      if (!f) {
        setPerguntaFotoPreview(perguntaFotoUrl);
        return;
      }

      if (isTooLargeImageFile(f)) {
        alert('Imagem muito grande. Use uma imagem de até 2MB.');
        clearPerguntaFotoInput();
        setPerguntaFotoPreview(perguntaFotoUrl);
        setPerguntaFotoWrapVisible(false);
        return;
      }

      perguntaFotoFile = f;
      try {
        perguntaFotoObjectUrl = URL.createObjectURL(f);
        setPerguntaFotoWrapVisible(true);
        setPerguntaFotoPreview(perguntaFotoObjectUrl);
      } catch (e) {
        setPerguntaFotoPreview('');
      }
    });
  }

  if (perguntaFotoRemover) {
    perguntaFotoRemover.addEventListener('click', function () {
      perguntaFotoUrl = '';
      clearPerguntaFotoInput();
      setPerguntaFotoPreview('');
      setPerguntaFotoWrapVisible(false);
    });
  }

  opcoesWrap.addEventListener('click', function (e) {
    var add = e.target && e.target.closest ? e.target.closest('[data-opt-add]') : null;
    var del = e.target && e.target.closest ? e.target.closest('[data-opt-del]') : null;
    var fotoToggle = e.target && e.target.closest ? e.target.closest('[data-opt-foto-toggle]') : null;
    var fotoRemove = e.target && e.target.closest ? e.target.closest('[data-opt-foto-remove]') : null;
    if (add) {
      var rows = opcoesWrap.querySelectorAll('[data-opt-row]');
      if (rows.length >= 12) return;
      opcoesWrap.insertAdjacentHTML('beforeend', optionRowTemplate(rows.length, '', '', ''));
      syncOptionButtons();
      var last = opcoesWrap.querySelectorAll('[data-opt-input]');
      var input = last && last.length ? last[last.length - 1] : null;
      if (input) input.focus();
      return;
    }
    if (fotoToggle) {
      var rowT = fotoToggle.closest('[data-opt-row]');
      if (!rowT) return;
      var wrapT = rowT.querySelector('[data-opt-foto-wrap]');
      if (wrapT) wrapT.hidden = !wrapT.hidden;
      return;
    }
    if (fotoRemove) {
      var rowF = fotoRemove.closest('[data-opt-row]');
      if (!rowF) return;
      removeOptFoto(rowF);
      return;
    }
    if (del) {
      var row = del.closest('[data-opt-row]');
      if (!row) return;
      var rows2 = opcoesWrap.querySelectorAll('[data-opt-row]');
      if (rows2.length <= 2) return;
      var key = String(row.getAttribute('data-opt-key') || '').trim();
      if (key) cleanupOptPreview(key);
      row.remove();
      syncOptionButtons();
      return;
    }
  });

  opcoesWrap.addEventListener('change', function (e) {
    var input = e.target && e.target.matches ? (e.target.matches('[data-opt-foto]') ? e.target : null) : null;
    if (!input) return;
    var row = input.closest('[data-opt-row]');
    if (!row) return;

    var wrap = row.querySelector('[data-opt-foto-wrap]');
    if (wrap) wrap.hidden = false;

    var key = String(row.getAttribute('data-opt-key') || '').trim();
    if (!key) return;

    var f = input.files && input.files[0] ? input.files[0] : null;

    cleanupOptPreview(key);
    if (!f) {
      var ex = String(row.getAttribute('data-opt-foto-url') || '').trim();
      setOptPreview(row, ex);
      return;
    }

    if (isTooLargeImageFile(f)) {
      alert('Imagem muito grande. Use uma imagem de até 2MB.');
      try { input.value = ''; } catch (e) { /* noop */ }
      var ex2 = String(row.getAttribute('data-opt-foto-url') || '').trim();
      setOptPreview(row, ex2);
      return;
    }

    optFileMap.set(key, f);
    try {
      var obj = URL.createObjectURL(f);
      optObjectUrlMap.set(key, obj);
      setOptPreview(row, obj);
    } catch (e) {
      setOptPreview(row, '');
    }
  });

  if (btnLimpar) btnLimpar.addEventListener('click', function () { resetForm(); });
  if (form) form.addEventListener('submit', submitForm);
  if (listEl) listEl.addEventListener('click', handleListClick);

  if (unidadeSelect) {
    unidadeSelect.addEventListener('change', function () {
      var v = String(unidadeSelect.value || '').trim();
      if (v) {
        selectedUnitId = v;
        try { localStorage.setItem('wdg_enquetes_unidade', v); } catch (e) { /* noop */ }
      }

      if (pickerHabitacoes) pickerHabitacoes.clearCache();
      if (pickerMoradores) pickerMoradores.clearCache();

      resetForm();
      currentPage = 1;
      refreshList().catch(function () { /* noop */ });
    });
  }

  // init
  resetForm();
  loadUnidades().then(function(){ return refreshList(); }).catch(function () { /* noop */ });
})();
