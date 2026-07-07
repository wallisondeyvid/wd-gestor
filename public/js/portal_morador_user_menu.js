(function () {
  'use strict';

  function getBasePath() {
    try {
      var bp = (document.body && document.body.getAttribute('data-base-path')) || '';
      bp = String(bp || '').trim();
      if (!bp) return '/portal-morador';
      if (bp.endsWith('/')) bp = bp.slice(0, -1);
      return bp;
    } catch {
      return '/portal-morador';
    }
  }

  function initMensagensSubmenuAccordion() {
    try {
      var host = document.querySelector('.pm-nav-details--mensagens');
      if (!host) return;

      var all = Array.prototype.slice.call(host.querySelectorAll('.pm-nav-sub-details'));
      if (!all || all.length < 2) return;

      function closeOthers(opened) {
        for (var i = 0; i < all.length; i++) {
          var d = all[i];
          if (!d) continue;
          if (d === opened) continue;
          if (d.open) d.open = false;
        }
      }

      for (var k = 0; k < all.length; k++) {
        (function (detailsEl) {
          if (!detailsEl) return;
          detailsEl.addEventListener('toggle', function () {
            if (!detailsEl.open) return;
            closeOthers(detailsEl);
          });
        })(all[k]);
      }
    } catch {
      /* noop */
    }
  }

  function readServicosUnreadFlag() {
    if (volatileUnreadFlag) return true;
    try {
      var hasFlag = false;
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (!key || key.indexOf('pm-servicos-status:') !== 0) continue;
        if (key.endsWith(':unread') && localStorage.getItem(key) === '1') {
          hasFlag = true;
          break;
        }
      }
      return hasFlag;
    } catch {
      return false;
    }
  }

  function clearServicosUnreadFlag() {
    try {
      var toClear = [];
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (!key || key.indexOf('pm-servicos-status:') !== 0) continue;
        if (key.endsWith(':unread')) toClear.push(key);
      }
      toClear.forEach(function (k) { localStorage.removeItem(k); });
    } catch {
      /* noop */
    }
    volatileUnreadFlag = false;
  }

  function countUnreadNotifications(list) {
    if (!Array.isArray(list)) return 0;
    return list.filter(function (n) { return !n.read; }).length;
  }

  function normalizeStatus(raw) {
    var s = String(raw || '').toLowerCase().trim();
    if (!s) return 'aberto';
    try {
      s = s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ');
    } catch {
      /* noop */
    }
    if (s.indexOf('aceita') >= 0 || s.indexOf('aceito') >= 0) return 'aceita';
    if (s.indexOf('rejeita') >= 0 || s.indexOf('recusa') >= 0) return 'rejeitada';
    if (s.indexOf('andamento') >= 0) return 'andamento';
    if (s.indexOf('concluido') >= 0 || s.indexOf('finalizado') >= 0) return 'concluido';
    return 'aberto';
  }

  function fmtNotifTime(ts) {
    try {
      var d = new Date(ts);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '';
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function tryDeviceNotification(title, message, url, tag) {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;
      // Evita duplicar quando o usuário está com o portal em foco.
      try {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus && document.hasFocus()) return;
      } catch { /* noop */ }

      var t = String(title || 'Notificação').trim() || 'Notificação';
      var b = String(message || '').trim();
      var u = String(url || '').trim();
      var n = new Notification(t, {
        body: b,
        tag: String(tag || '') || undefined,
        data: { url: u || '' }
      });
      n.onclick = function () {
        try {
          var target = u;
          if (target) window.location.href = target;
          try { n.close(); } catch { /* noop */ }
        } catch { /* noop */ }
      };
    } catch {
      /* noop */
    }
  }

  function pushServiceNotification(payload) {
    var now = Date.now();
    var list = loadNotifStore();
    var id = String(payload && payload.id ? payload.id : 'srv-' + now);
    if (isNotificationDismissed(id)) return;
    var proto = String(payload && payload.protocolo ? payload.protocolo : id).trim();
    var title = proto ? 'Solicitação ' + proto : 'Solicitação de serviço';
    var message = (payload && payload.message) || 'Foi aceita pelo condomínio. Você já pode acompanhar o andamento.';
    var assunto = String(payload && payload.assunto ? payload.assunto : '').trim();
    var item = {
      id: id,
      protocolo: proto,
      title: title,
      message: message,
      assunto: assunto,
      ts: now,
      read: false
    };
    var exists = list.find(function (n) {
      return n.id === item.id && n.protocolo === item.protocolo && n.message === item.message;
    });
    if (!exists) {
      list.unshift(item);
      saveNotifStore(list.slice(0, 30));
      try {
        var url = BASE_PATH + '/solicitacoes/servico?notif=' + encodeURIComponent(String(item.id || item.protocolo || '').trim());
        tryDeviceNotification(item.title, item.message, url, item.protocolo ? ('servico-' + item.protocolo) : 'servico-status');
      } catch { /* noop */ }
    }
  }

  function pushServiceNotificationSilent(payload) {
    var now = Date.now();
    var list = loadNotifStore();
    var id = String(payload && payload.id ? payload.id : 'srv-' + now);
    if (isNotificationDismissed(id)) return;
    var proto = String(payload && payload.protocolo ? payload.protocolo : id).trim();
    var title = proto ? 'Solicitação ' + proto : 'Solicitação de serviço';
    var message = (payload && payload.message) || 'Foi aceita pelo condomínio. Você já pode acompanhar o andamento.';
    var assunto = String(payload && payload.assunto ? payload.assunto : '').trim();
    var item = {
      id: id,
      protocolo: proto,
      title: title,
      message: message,
      assunto: assunto,
      ts: now,
      read: false
    };
    var exists = list.find(function (n) {
      return n.id === item.id && n.protocolo === item.protocolo && n.message === item.message;
    });
    if (!exists) {
      list.unshift(item);
      saveNotifStore(list.slice(0, 30));
    }
  }

  function pushGenericNotification(payload) {
    var now = Date.now();
    var list = loadNotifStore();
    var id = String(payload && payload.id ? payload.id : 'n-' + now);
    if (isNotificationDismissed(id)) return;
    var title = String(payload && payload.title ? payload.title : 'Notificação').trim() || 'Notificação';
    var message = (payload && payload.message) || '';
    var assunto = String(payload && payload.assunto ? payload.assunto : '').trim();
    var url = String(payload && payload.url ? payload.url : '').trim();
    var item = {
      id: id,
      protocolo: '',
      title: title,
      message: message,
      assunto: assunto,
      url: url,
      ts: now,
      read: false
    };
    var exists = list.find(function (n) {
      return n.id === item.id && n.title === item.title && n.message === item.message && String(n.url || '') === String(item.url || '');
    });
    if (!exists) {
      list.unshift(item);
      saveNotifStore(list.slice(0, 30));
      try {
        tryDeviceNotification(item.title, item.message, item.url, item.id);
      } catch { /* noop */ }
    }
  }

  function pushGenericNotificationSilent(payload) {
    var now = Date.now();
    var list = loadNotifStore();
    var id = String(payload && payload.id ? payload.id : 'n-' + now);
    if (isNotificationDismissed(id)) return;
    var title = String(payload && payload.title ? payload.title : 'Notificação').trim() || 'Notificação';
    var message = (payload && payload.message) || '';
    var assunto = String(payload && payload.assunto ? payload.assunto : '').trim();
    var url = String(payload && payload.url ? payload.url : '').trim();
    var item = {
      id: id,
      protocolo: '',
      title: title,
      message: message,
      assunto: assunto,
      url: url,
      ts: now,
      read: false
    };
    var exists = list.find(function (n) {
      return n.id === item.id && n.title === item.title && n.message === item.message && String(n.url || '') === String(item.url || '');
    });
    if (!exists) {
      list.unshift(item);
      saveNotifStore(list.slice(0, 30));
    }
  }

  function upsertGenericNotification(item) {
    if (!item) return false;
    try {
      if (isNotificationDismissed(item.id)) return false;
      var list = loadNotifStore();
      var exists = list.find(function (n) {
        return String(n.id || '') === String(item.id || '')
          && String(n.title || '') === String(item.title || '')
          && String(n.message || '') === String(item.message || '')
          && String(n.url || '') === String(item.url || '');
      });
      if (exists) return false;
      list.unshift({
        id: String(item.id || ''),
        protocolo: '',
        title: String(item.title || 'Notificação'),
        message: String(item.message || ''),
        assunto: String(item.assunto || ''),
        url: String(item.url || ''),
        ts: Number(item.ts || Date.now()),
        read: false
      });
      saveNotifStore(list.slice(0, 30));
      try {
        tryDeviceNotification(String(item.title || 'Notificação'), String(item.message || ''), String(item.url || ''), String(item.id || ''));
      } catch { /* noop */ }
      return true;
    } catch {
      return false;
    }
  }

  var SERVICO_TITLE_CACHE_KEY = 'pm_servico_title_cache_v1';

  function loadServicoTitleCache() {
    try {
      var raw = localStorage.getItem(SERVICO_TITLE_CACHE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* noop */
    }
    return {};
  }

  function saveServicoTitleCache(map) {
    try {
      localStorage.setItem(SERVICO_TITLE_CACHE_KEY, JSON.stringify(map || {}));
    } catch {
      /* noop */
    }
  }

  function getCachedServicoAssunto(proto, servicoId) {
    var cache = loadServicoTitleCache();
    var byId = servicoId ? String(cache['id:' + String(servicoId).trim()] || '').trim() : '';
    if (byId) return byId;
    var byProto = proto ? String(cache['p:' + String(proto).trim()] || '').trim() : '';
    if (byProto) return byProto;
    return '';
  }

  function setUnreadFlag(value) {
    try {
      if (value) localStorage.setItem(UNREAD_FLAG_KEY, '1');
      else localStorage.removeItem(UNREAD_FLAG_KEY);
      // Keep badge in sync even if list render hasn't run yet (mobile safeguards)
      try { setBellUnread(!!value); } catch { /* noop */ }
    } catch {
      volatileUnreadFlag = !!value;
      try { setBellUnread(!!value); } catch { /* noop */ }
    }
  }

  function markNotificationRead(id) {
    if (!id) return;
    var list = loadNotifStore();
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id || '') === String(id)) {
        if (!list[i].read) {
          list[i].read = true;
          changed = true;
        }
        break;
      }
    }
    if (changed) saveNotifStore(list);
  }

  function findNotificationById(id) {
    try {
      var rawId = String(id || '').trim();
      if (!rawId) return null;
      var list = loadNotifStore();
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].id || '') === rawId) return list[i];
      }
    } catch {
      /* noop */
    }
    return null;
  }

  function resolveNotifUrl(url) {
    var raw = String(url || '').trim();
    if (!raw) return '';
    if (raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0) return raw;
    if (raw.indexOf('/') === 0) return raw;
    return BASE_PATH + '/' + raw.replace(/^\/+/, '');
  }

  function navToServicoFromNotif(id) {
    if (!id) return;
    var raw = String(id || '').trim();

    // Notificação de chegada de visita: permite confirmar entrada.
    if (raw.indexOf('visita-chegada:') === 0) {
      try { markNotificationRead(raw); } catch { /* noop */ }
      var parts = raw.split(':');
      var visitaId = parts.length >= 2 ? String(parts[1] || '').trim() : '';
        var chegadaIso = parts.length >= 3 ? String(parts[2] || '').trim() : '';
        var visitanteKey = parts.length >= 4 ? String(parts.slice(3).join(':') || '').trim() : '';
      if (!visitaId) return;
      var ok = window.confirm('Confirmar entrada do visitante?');
      if (!ok) return;
      (async function () {
        try {
          var resp = await fetch(BASE_PATH + '/api/visitas/' + encodeURIComponent(visitaId) + '/confirmar-entrada', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
            body: visitanteKey ? JSON.stringify({ visitanteKey: visitanteKey }) : JSON.stringify({})
          });
          if (!resp.ok) {
            var msg = 'Falha ao confirmar entrada.';
            try {
              var err = await resp.json();
              if (err && err.error) msg = String(err.error);
            } catch { /* noop */ }
            try { notifyUser(msg); } catch { /* noop */ }
            return;
          }
          try { notifyUser('Entrada autorizada com sucesso.'); } catch { /* noop */ }
        } catch {
          try { notifyUser('Falha ao confirmar entrada.'); } catch { /* noop */ }
        }
      })();
      return;
    }

    // Notificações genéricas com URL (ex.: enquetes)
    try {
      var n = findNotificationById(raw);
      var targetUrl = n && n.url ? resolveNotifUrl(n.url) : '';
      if (targetUrl) {
        try { markNotificationRead(raw); } catch { /* noop */ }
        window.location.href = targetUrl;
        return;
      }
    } catch {
      /* noop */
    }

    var url = BASE_PATH + '/solicitacoes/servico?notif=' + encodeURIComponent(raw);
    try {
      markNotificationRead(raw);
    } catch { /* noop */ }
    window.location.href = url;
  }

  function supportsPush() {
    try {
      return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
    } catch {
      return false;
    }
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var outputArray = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; ++i) {
      outputArray[i] = raw.charCodeAt(i);
    }
    return outputArray;
  }

  async function getServiceWorkerRegistration() {
    if (!supportsPush()) return null;
    if (swRegPromise) return swRegPromise;
    try {
      swRegPromise = navigator.serviceWorker.register(BASE_PATH + '/sw.js', { scope: BASE_PATH + '/' })
        .catch(function () { return null; });
      return await swRegPromise;
    } catch {
      swRegPromise = null;
      return null;
    }
  }

  async function fetchPushPublicKey() {
    if (cachedPublicKey !== null) return cachedPublicKey;
    cachedPublicKey = '';
    try {
      var resp = await fetch(BASE_PATH + '/api/push/public-key', { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' } });
      if (!resp.ok) return cachedPublicKey;
      var data = await resp.json();
      cachedPublicKey = String(data && data.key ? data.key : '').trim();
      try { localStorage.setItem(PUSH_KEY_STORAGE, cachedPublicKey); } catch { /* noop */ }
      return cachedPublicKey;
    } catch {
      cachedPublicKey = '';
      return cachedPublicKey;
    }
  }

  async function syncPushSubscription(sub) {
    try {
      if (!sub) return false;
      await fetch(BASE_PATH + '/api/push/subscription', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ subscription: sub })
      });
      return true;
    } catch {
      return false;
    }
  }

  async function ensurePushSubscription() {
    if (!supportsPush()) return null;
    try {
      var reg = await getServiceWorkerRegistration();
      if (!reg) return null;
      var sub = await reg.pushManager.getSubscription();
      var storedKey = '';
      try { storedKey = localStorage.getItem(PUSH_KEY_STORAGE) || ''; } catch { storedKey = ''; }

      var pubKey = await fetchPushPublicKey();
      if (sub && pubKey && storedKey && storedKey !== pubKey) {
        try { await sub.unsubscribe(); } catch { /* noop */ }
        sub = null;
      }

      if (!sub) {
        if (!pubKey) return null;
        var appServerKey = urlBase64ToUint8Array(pubKey);
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
        try { localStorage.setItem(PUSH_KEY_STORAGE, pubKey); } catch { /* noop */ }
      }
      if (!pushSyncPromise) {
        pushSyncPromise = syncPushSubscription(sub).finally(function () { pushSyncPromise = null; });
      }
      await pushSyncPromise;
      return sub;
    } catch {
      return null;
    }
  }

  async function initPushInfrastructure() {
    if (!supportsPush()) return;
    try { await getServiceWorkerRegistration(); } catch { /* noop */ }
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        await ensurePushSubscription();
      }
    } catch {
      /* noop */
    }
  }

  var NOTIF_STORE_KEY = 'pm-servicos-notifs';
  var HAB_ID = (document.body && document.body.getAttribute('data-hab-id')) || '';
  var BASE_PATH = getBasePath();
  var STATUS_CACHE_KEY = 'pm-servicos-status:' + (HAB_ID || 'all');
  var UNREAD_FLAG_KEY = STATUS_CACHE_KEY + ':unread';
  var DISMISSED_NOTIF_KEY = 'pm-notif-dismissed:' + (HAB_ID || 'all');
  var ENQUETES_LAST_SEEN_KEY = 'pm-enquetes-last-seen:' + (HAB_ID || 'all');
  var PUSH_KEY_STORAGE = 'pm-push-key';
  var volatileUnreadFlag = false;
  var swRegPromise = null;
  var cachedPublicKey = null;
  var pushSyncPromise = null;
  var dismissedCache = null;

  function baseVisitaChegadaId(id) {
    var raw = String(id || '').trim();
    if (!raw) return '';
    if (raw.indexOf('visita-chegada:') !== 0) return '';
    var parts = raw.split(':');
    var visitaId = parts.length >= 2 ? String(parts[1] || '').trim() : '';
    if (!visitaId) return '';
    return 'visita-chegada:' + visitaId;
  }

  function loadDismissedNotifs() {
    try {
      if (dismissedCache) return dismissedCache;
      var raw = localStorage.getItem(DISMISSED_NOTIF_KEY);
      if (!raw) {
        dismissedCache = {};
        return dismissedCache;
      }
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        dismissedCache = parsed;
        return dismissedCache;
      }
    } catch {
      /* noop */
    }
    dismissedCache = {};
    return dismissedCache;
  }

  function saveDismissedNotifs(map) {
    try {
      dismissedCache = map && typeof map === 'object' ? map : {};
      localStorage.setItem(DISMISSED_NOTIF_KEY, JSON.stringify(dismissedCache));
    } catch {
      /* noop */
    }
  }

  function dismissNotification(id) {
    var raw = String(id || '').trim();
    if (!raw) return;
    var map = loadDismissedNotifs();
    var now = Date.now();
    map[raw] = now;
    var base = baseVisitaChegadaId(raw);
    if (base) map[base] = now;

    // Limpa o mapa se crescer demais (mantém as 200 mais recentes).
    try {
      var keys = Object.keys(map);
      if (keys.length > 220) {
        keys.sort(function (a, b) { return (map[b] || 0) - (map[a] || 0); });
        var next = {};
        for (var i = 0; i < Math.min(200, keys.length); i++) {
          next[keys[i]] = map[keys[i]];
        }
        saveDismissedNotifs(next);
        return;
      }
    } catch {
      /* noop */
    }

    saveDismissedNotifs(map);
  }

  function isNotificationDismissed(id) {
    var raw = String(id || '').trim();
    if (!raw) return false;
    var map = loadDismissedNotifs();
    if (map && map[raw]) return true;
    var base = baseVisitaChegadaId(raw);
    return !!(base && map && map[base]);
  }

  function bySel(root, sel) {
    try {
      return (root || document).querySelector(sel);
    } catch {
      return null;
    }
  }

  function loadNotifStore() {
    try {
      var raw = localStorage.getItem(NOTIF_STORE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    } catch {
      /* noop */
    }
    return [];
  }

  function saveNotifStore(list) {
    try {
      localStorage.setItem(NOTIF_STORE_KEY, JSON.stringify(list || []));
    } catch {
      /* noop */
    }
  }

  function removeNotificationById(id) {
    var list = loadNotifStore();
    var next = list.filter(function (n) { return String(n.id || '') !== String(id || ''); });
    saveNotifStore(next);
    try { dismissNotification(id); } catch { /* noop */ }
    return next;
  }

  function loadStatusCache() {
    try {
      var raw = localStorage.getItem(STATUS_CACHE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* noop */
    }
    return {};
  }

  function saveStatusCache(map) {
    try {
      localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(map || {}));
    } catch {
      /* noop */
    }
  }

  function computeInitials(name) {
    var n = String(name || '').trim();
    if (!n) return 'ME';
    var parts = n.split(/\s+/).filter(Boolean);
    if (!parts.length) return n.slice(0, 2).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
  }

  function firstName(name) {
    var n = String(name || '').trim();
    if (!n) return '';
    return n.split(/\s+/)[0] || '';
  }

  function normalizeSpaces(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function keyForUniq(s) {
    try {
      return normalizeSpaces(String(s || ''))
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    } catch {
      return normalizeSpaces(String(s || '')).toLowerCase();
    }
  }

  function buildNameVariants(fullName) {
    var full = normalizeSpaces(fullName);
    if (!full) return [];

    var parts = full.split(' ').filter(Boolean);
    if (parts.length < 2) {
      // Nome único: não faz sentido criar muitas variações.
      return [];
    }

    var out = [];
    var seen = Object.create(null);

    function add(candidate) {
      var c = normalizeSpaces(candidate);
      if (!c) return;
      if (c.length < 2) return;
      if (c === full) return;
      if (c === parts[0]) return;
      var k = keyForUniq(c);
      if (seen[k]) return;
      seen[k] = true;
      out.push(c);
    }

    var n = parts.length;

    // Prefixos: Wallison Deyvid, Wallison Deyvid Durães...
    for (var i = 1; i < n; i++) {
      add(parts.slice(0, i + 1).join(' '));
    }

    // Sufixos: Deyvid Durães Guimarães, Durães Guimarães...
    for (var s = 1; s < n; s++) {
      add(parts.slice(s).join(' '));
    }

    // Subsequências contíguas (inclui Deyvid Durães, Durães Guimarães, etc.)
    for (var start = 0; start < n; start++) {
      for (var end = start + 1; end < n; end++) {
        add(parts.slice(start, end + 1).join(' '));
      }
    }

    // Partes individuais (Deyvid, Durães, Guimarães...)
    for (var p = 0; p < n; p++) {
      add(parts[p]);
    }

    // Combinações de 2 partes não necessariamente contíguas (inclui Deyvid Guimarães)
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        add(parts[a] + ' ' + parts[b]);
      }
    }

    return out;
  }

  function populateNameModeSelect(selectEl, fullName) {
    if (!selectEl) return;
    var full = normalizeSpaces(fullName);
    if (!full) return;

    // Mantém as opções básicas (se existirem no HTML) e adiciona variações.
    var base = {
      initials: 'Somente iniciais',
      first: 'Primeiro nome',
      full: 'Nome completo'
    };

    var existing = {};
    try {
      Array.prototype.slice.call(selectEl.options || []).forEach(function (o) {
        if (!o) return;
        existing[String(o.value || '')] = true;
      });
    } catch {
      /* noop */
    }

    // Garante as 3 opções padrão no topo.
    var rebuilt = [];
    ['initials', 'first', 'full'].forEach(function (v) {
      if (!existing[v]) {
        rebuilt.push({ value: v, label: base[v] });
      }
    });

    // Se o HTML já possui as 3 opções, preserva elas primeiro.
    if (!rebuilt.length) {
      try {
        rebuilt = Array.prototype.slice.call(selectEl.options || []).map(function (o) {
          return { value: String(o.value || ''), label: String(o.textContent || '') };
        });
      } catch {
        rebuilt = [
          { value: 'initials', label: base.initials },
          { value: 'first', label: base.first },
          { value: 'full', label: base.full }
        ];
      }
    } else {
      // Se faltavam opções padrão, descarta tudo e recria o bloco padrão.
      rebuilt = [
        { value: 'initials', label: base.initials },
        { value: 'first', label: base.first },
        { value: 'full', label: base.full }
      ];
    }

    var variants = buildNameVariants(full);
    if (variants && variants.length) {
      variants.forEach(function (t) {
        rebuilt.push({ value: 'text:' + t, label: t });
      });
    }

    // Opção para digitar manualmente.
    rebuilt.push({ value: 'custom', label: 'Outro…' });

    // Rebuild options
    try {
      while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
      rebuilt.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        selectEl.appendChild(o);
      });
    } catch {
      /* noop */
    }
  }

  function ensureCustomNameInput(menu, afterEl) {
    if (!menu) return null;
    var existing = bySel(menu, '[data-action="name-custom"]');
    if (existing) return existing;

    try {
      var input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('data-action', 'name-custom');
      input.placeholder = 'Digite como deseja ser chamado';
      input.autocomplete = 'off';
      input.style.display = 'none';

      // Insere logo após o select, para ficar contextual.
      if (afterEl && afterEl.parentNode) {
        if (afterEl.nextSibling) afterEl.parentNode.insertBefore(input, afterEl.nextSibling);
        else afterEl.parentNode.appendChild(input);
      } else {
        menu.appendChild(input);
      }
      return input;
    } catch {
      return null;
    }
  }

  function getSavedCustomName() {
    try {
      return localStorage.getItem('pm_name_custom_text') || '';
    } catch {
      return '';
    }
  }

  function setSavedCustomName(val) {
    try {
      localStorage.setItem('pm_name_custom_text', String(val || ''));
    } catch {
      /* noop */
    }
  }

  function setWelcomeName(text) {
    try {
      var el = document.querySelector('.pm-welcome .pm-page-title strong');
      if (!el) return;
      el.textContent = String(text || '').trim();
    } catch {
      /* noop */
    }
  }

  function computeDisplayName(full, mode) {
    var m = String(mode || 'initials');
    var f = String(full || '').trim();
    if (!f) return { chip: '', welcome: '' };

    if (m === 'initials') {
      return { chip: '', welcome: computeInitials(f) };
    }
    if (m === 'first') {
      var fn = firstName(f);
      return { chip: fn, welcome: fn };
    }
    if (m === 'full') {
      return { chip: f, welcome: f };
    }
    if (m === 'custom') {
      var c = normalizeSpaces(getSavedCustomName());
      return { chip: c, welcome: c || computeInitials(f) };
    }
    if (m.indexOf('text:') === 0) {
      var t = normalizeSpaces(m.slice(5));
      return { chip: t, welcome: t || computeInitials(f) };
    }
    return { chip: '', welcome: computeInitials(f) };
  }

  function setBellUnread(flag) {
    try {
      var bell = document.querySelector('.pm-icon-btn[title="Notificações"], .pm-bell-btn');
      if (!bell) return;
      bell.classList.toggle('has-unread', !!flag);
      var badge = document.querySelector('[data-bell-badge]');
      if (badge) {
        if (!flag) {
          badge.textContent = '0';
          badge.style.display = 'none';
        } else {
          if (!badge.textContent || badge.textContent === '0') {
            badge.textContent = '1';
          }
          badge.style.display = 'inline-flex';
        }
      }
    } catch {
      /* noop */
    }
  }

  var NOTIF_PROMPT_FLAG = 'pm-notif-prompted';

  function isIos() {
    try { return /iphone|ipad|ipod/i.test(navigator.userAgent || ''); } catch { return false; }
  }

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      return window.navigator.standalone === true;
    } catch { return false; }
  }

  function showPushHelp(message) {
    try {
      alert(message);
    } catch {
      /* noop */
    }
  }

  function notifyUser(message) {
    try {
      alert(message);
    } catch {
      /* noop */
    }
  }

  async function requestNotificationPermission() {
    try {
      if (typeof Notification === 'undefined') {
        console.warn('Notificações não são suportadas neste navegador.');
        return;
      }

      if (!window.isSecureContext) {
        console.warn('Notificações exigem HTTPS ou contexto seguro.');
        return;
      }

      var alreadyPrompted = false;
      try { alreadyPrompted = localStorage.getItem(NOTIF_PROMPT_FLAG) === '1'; } catch { /* noop */ }

      var state = Notification.permission;
      console.info('[pm] notification state (before request):', state, 'secure:', window.isSecureContext, 'supportsPush:', supportsPush());
      if (state === 'granted') {
        ensurePushSubscription();
        return;
      }

      if (state === 'denied') {
        if (isIos() && !isStandalone()) {
          notifyUser('Para receber notificações no iOS, instale o portal na Tela de Início e permita notificações.');
        }
        return; // browser already rejected; cannot prompt again programmatically
      }

      // Safari iOS/Chrome Android require secure context + user gesture; ensure SW is ready first
      try { await getServiceWorkerRegistration(); } catch { /* noop */ }

      var res = null;
      try {
        // Some browsers still use the callback signature
        if (Notification.requestPermission.length === 0) {
          res = await Notification.requestPermission();
        } else {
          res = await new Promise(function (resolve) {
            try { Notification.requestPermission(resolve); }
            catch (err) { resolve(null); }
          });
        }
      } catch {
        res = null;
      }

      if (res === 'granted') {
        try { localStorage.setItem(NOTIF_PROMPT_FLAG, '1'); } catch { /* noop */ }
        ensurePushSubscription();
      } else if (res === 'denied' && isIos() && !isStandalone()) {
        notifyUser('No iOS só é possível autorizar notificações após instalar o portal na Tela de Início. Toque em “Compartilhar” e depois “Adicionar à Tela de Início”, abra pelo atalho e toque novamente no sino.');
      } else if (res === 'denied') {
        showPushHelp('O navegador bloqueou notificações para este site. Reative em Ajustes/Configurações do site > Notificações e tente novamente.');
      } else if (!alreadyPrompted) {
        try { localStorage.setItem(NOTIF_PROMPT_FLAG, '1'); } catch { /* noop */ }
        showPushHelp('Não foi possível exibir o prompt de notificações. Verifique se as notificações do site não estão bloqueadas em Ajustes/Configurações, e tente novamente.');
      }
      console.info('[pm] notification request result:', res);
    } catch {
      /* noop */
    }
  }

  function initBellFromServicosFlag() {
    var bell = document.querySelector('.pm-icon-btn[title="Notificações"], .pm-bell-btn');
    var menu = document.querySelector('[data-bell-menu]');
    var listEl = document.querySelector('[data-bell-list]');
    var badge = document.querySelector('[data-bell-badge]');
    var closeBtn = document.querySelector('[data-bell-close]');
    var backdrop = document.querySelector('.pm-bell-backdrop');
    var homeCard = document.getElementById('notificacoes');
    var homeList = homeCard ? homeCard.querySelector('[data-home-notif-list]') : null;
    var homeEmpty = homeCard ? homeCard.querySelector('[data-home-notif-empty]') : null;
    var homeBadge = homeCard ? homeCard.querySelector('[data-home-notif-count]') : null;
    var homeOpenBtn = homeCard ? homeCard.querySelector('[data-home-notif-open]') : null;
    var HOME_MAX_ITEMS = 40;
    var lastNotifs = [];
    var lastUnread = 0;
    if (!backdrop) {
      try {
        backdrop = document.createElement('div');
        backdrop.className = 'pm-bell-backdrop';
        document.body.appendChild(backdrop);
      } catch {
        backdrop = null;
      }
    }
    if (!bell || !menu || !listEl) return;

    function renderHome(notifs, unread) {
      if (!homeCard) return;

      lastNotifs = Array.isArray(notifs) ? notifs : [];
      lastUnread = unread || 0;

      if (homeBadge) {
        var badgeVal = unread > 99 ? '99+' : String(unread || 0);
        homeBadge.textContent = badgeVal;
        homeBadge.hidden = unread <= 0;
      }

      if (!homeList || !homeEmpty) return;
      var list = Array.isArray(notifs) ? notifs : [];
      try {
        var patched = false;
        for (var pi = 0; pi < list.length; pi++) {
          var n0 = list[pi];
          if (!n0 || n0.assunto) continue;
          var fromCache = getCachedServicoAssunto(n0.protocolo || '', n0.id || '');
          if (fromCache) {
            n0.assunto = fromCache;
            patched = true;
          }
        }
        if (patched) saveNotifStore(list);
      } catch {
        /* noop */
      }
      var total = list.length;
      if (!total) {
        homeList.innerHTML = '';
        homeList.hidden = true;
        homeEmpty.hidden = false;
        if (homeOpenBtn) homeOpenBtn.hidden = true;
        return;
      }

      var slice = list.slice(0, HOME_MAX_ITEMS);

      homeEmpty.hidden = true;
      homeList.hidden = false;
      homeList.innerHTML = slice.map(function (n) {
        var title = escapeHtml(n.title || 'Notificação');
        var message = escapeHtml(n.message || '');
        var assunto = escapeHtml(n.assunto || '');
        var time = fmtNotifTime(n.ts);
        var iso = '';
        try { iso = new Date(n.ts).toISOString(); } catch { iso = ''; }
        return '<li data-home-notif-id="' + escapeHtml(n.id || '') + '" data-read="' + (n.read ? 'true' : 'false') + '">'
          + '<span class="pm-notif-dot" aria-hidden="true"></span>'
          + '<div class="pm-notif-main">'
          + '<strong>' + title + '</strong>'
          + (assunto ? '<span class="pm-notif-assunto">' + assunto + '</span>' : '')
          + (message ? '<span>' + message + '</span>' : '')
          + (time ? '<time datetime="' + iso + '">' + escapeHtml(time) + '</time>' : '')
          + '</div>'
          + '<button class="pm-notif-remove" type="button" data-home-notif-remove="' + escapeHtml(n.id || '') + '" aria-label="Excluir notificação">'
            + '<img src="' + BASE_PATH + '/images/excluir.png" alt="Excluir">'
          + '</button>'
          + '</li>';
      }).join('');

      if (homeOpenBtn) homeOpenBtn.hidden = false;
    }

    function renderList() {
      var notifs = loadNotifStore();
      try {
        var patched = false;
        for (var pi = 0; pi < notifs.length; pi++) {
          var n0 = notifs[pi];
          if (!n0 || n0.assunto) continue;
          var fromCache = getCachedServicoAssunto(n0.protocolo || '', n0.id || '');
          if (fromCache) {
            n0.assunto = fromCache;
            patched = true;
          }
        }
        if (patched) saveNotifStore(notifs);
      } catch {
        /* noop */
      }
      var unread = countUnreadNotifications(notifs);
      if (!unread && readServicosUnreadFlag()) unread = 1;
      setBellUnread(unread > 0);
      if (badge) {
        if (unread > 0) {
          badge.textContent = String(unread > 99 ? '99+' : unread);
          badge.style.display = 'inline-flex';
        } else {
          badge.textContent = '0';
          badge.style.display = 'none';
        }
      }

      renderHome(notifs, unread);

      if (!notifs.length) {
        listEl.innerHTML = '<div class="pm-bell-item"><p>Nenhuma notificação.</p></div>';
        return;
      }

      listEl.innerHTML = notifs.map(function (n) {
        var title = n.title || 'Notificação';
        var message = n.message || '';
        var assunto = n.assunto || '';
        var time = fmtNotifTime(n.ts);
        return '<article class="pm-bell-item" role="listitem" data-bell-item-id="' + (n.id || '') + '" data-read="' + (n.read ? 'true' : 'false') + '">'
          + '<div class="pm-bell-item-head">'
          + '<span class="pm-notif-dot" aria-hidden="true"></span>'
          + '<div class="pm-bell-item-title">'
          + '<strong>' + title + '</strong>'
          + (assunto ? '<span class="pm-notif-assunto">' + escapeHtml(assunto) + '</span>' : '')
          + '</div>'
          + '<button type="button" class="pm-bell-remove" title="Excluir" aria-label="Excluir notificação" data-bell-remove="' + (n.id || '') + '">'
          + '<img src="' + BASE_PATH + '/images/excluir.png" alt="Excluir">'
          + '</button>'
          + '</div>'
          + (message ? '<p>' + escapeHtml(message) + '</p>' : '')
          + (time ? '<time datetime="' + new Date(n.ts).toISOString() + '">' + time + '</time>' : '')
          + '</article>';
      }).join('');
    }

    function handlePushMessage(payload) {
      if (!payload) return;
      var data = payload.data || {};
      var tipo = String(data.tipo || data.type || '').trim();

      // IMPORTANTE: este handler é disparado via postMessage do service worker.
      // O SW já exibiu a notificação do sistema (showNotification). Aqui só atualizamos
      // a central de notificações (sino) e badges, sem criar Notification duplicada.

      if (tipo === 'enquete-nova' || tipo === 'poll-new') {
        var titleE = payload.title || data.title || 'Nova enquete disponível para votação';
        var idE = String(payload.tag || data.enqueteId || ('enquete-nova:' + Date.now()));
        pushGenericNotificationSilent({
          id: idE,
          title: String(titleE || '').trim() || 'Nova enquete disponível para votação',
          message: '',
          assunto: '',
          url: data.url || (BASE_PATH + '/enquetes')
        });
        setUnreadFlag(true);
        renderList();
        return;
      }

      if (tipo === 'visita-chegada' || tipo === 'visit-arrival') {
        var assuntoV = String(data.assunto || '').trim();
        var msgV = payload.body || data.message || '';
        var titleV = payload.title || data.title || 'Chegada de visitante';
        var idV = String(payload.tag || data.visitaId || Date.now());
        pushGenericNotificationSilent({ id: idV, title: titleV, message: msgV || 'Chegada comunicada.', assunto: assuntoV });
        setUnreadFlag(true);
        renderList();
        return;
      }

      if (tipo === 'comunicado-novo') {
        var titleC = String(payload.title || data.title || 'Comunicados').trim() || 'Comunicados';
        var msgC = String(payload.body || data.message || 'Novo comunicado adicionado, acesse o mural.').trim() || 'Novo comunicado adicionado, acesse o mural.';
        var idC = String(payload.tag || data.comunicadoId || ('comunicado-novo:' + Date.now()));
        pushGenericNotificationSilent({
          id: idC,
          title: titleC,
          message: msgC,
          assunto: '',
          url: data.url || (BASE_PATH + '/comunicados')
        });
        setUnreadFlag(true);
        renderList();
        return;
      }

      if (tipo === 'mensagem' || tipo === 'mensagem-nova' || tipo === 'msg-nova' || tipo === 'msg-new') {
        // Mensagens não pertencem à central do sino (notificações gerais).
        // Aqui só avisamos a UI da Caixa de Mensagens para atualizar/puxar não lidas.
        try { window.dispatchEvent(new CustomEvent('wdg:msg:unread', { detail: { source: 'push' } })); } catch { /* noop */ }
        return;
      }

      var proto = String(data.protocolo || data.servicoId || payload.tag || '').trim();
      var msg = payload.body || data.message || '';
      var assunto = String(data.assunto || data.titulo || data.title || '').trim();
      if (!assunto) {
        try {
          assunto = getCachedServicoAssunto(proto, String(data.servicoId || '').trim());
        } catch {
          assunto = '';
        }
      }
      var id = proto || String(Date.now());
      pushServiceNotificationSilent({ id: id, protocolo: proto || id, message: msg || 'Atualização recebida.', assunto: assunto });
      setUnreadFlag(true);
      renderList();
    }

    function loadEnquetesLastSeen() {
      try {
        var raw = localStorage.getItem(ENQUETES_LAST_SEEN_KEY);
        if (!raw) return null;
        var n = Number(raw);
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    }

    function saveEnquetesLastSeen(ts) {
      try {
        localStorage.setItem(ENQUETES_LAST_SEEN_KEY, String(Number(ts) || Date.now()));
      } catch {
        /* noop */
      }
    }

    async function pollEnquetesNovas() {
      if (!BASE_PATH) return;
      try {
        var url = BASE_PATH + '/api/enquetes';
        if (HAB_ID) url += '?hab=' + encodeURIComponent(String(HAB_ID || '').trim());
        var resp = await fetch(url, {
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' }
        });
        if (!resp.ok) return;
        var data = await resp.json();
        var items = Array.isArray(data && data.data) ? data.data : [];
        if (!items.length) return;

        var lastSeen = loadEnquetesLastSeen();
        var maxTs = 0;
        for (var i = 0; i < items.length; i++) {
          var it = items[i] || {};
          var t = Date.parse(String(it.createdAt || ''));
          if (Number.isFinite(t) && t > maxTs) maxTs = t;
        }
        if (!maxTs) return;

        // Primeira execução (sem histórico): cria somente 1 notificação (mais recente elegível)
        // e grava o marcador para não repetir.
        if (lastSeen === null) {
          var newest = null;
          for (var k = 0; k < items.length; k++) {
            var ek = items[k] || {};
            var createdK = Date.parse(String(ek.createdAt || ''));
            if (!Number.isFinite(createdK)) continue;
            if (String(ek.status || '') !== 'ativo') continue;
            if (ek.jaVotou) continue;
            var idK = String(ek._id || '').trim();
            if (!idK) continue;
            newest = { id: idK, ts: createdK };
            break;
          }
          saveEnquetesLastSeen(maxTs);
          if (newest) {
            var insertedFirst = upsertGenericNotification({
              id: 'enquete-nova:' + newest.id,
              title: 'Nova enquete disponível para votação',
              message: '',
              assunto: '',
              url: BASE_PATH + '/enquetes',
              ts: newest.ts
            });
            if (insertedFirst) {
              setUnreadFlag(true);
              renderList();
            }
          }
          return;
        }

        var insertedAny = false;
        for (var j = 0; j < items.length; j++) {
          var e0 = items[j] || {};
          var createdMs = Date.parse(String(e0.createdAt || ''));
          if (!Number.isFinite(createdMs) || createdMs <= lastSeen) continue;
          if (String(e0.status || '') !== 'ativo') continue;
          if (e0.jaVotou) continue;
          var enqId = String(e0._id || '').trim();
          if (!enqId) continue;

          insertedAny = upsertGenericNotification({
            id: 'enquete-nova:' + enqId,
            title: 'Nova enquete disponível para votação',
            message: '',
            assunto: '',
            url: BASE_PATH + '/enquetes',
            ts: createdMs
          }) || insertedAny;
        }

        saveEnquetesLastSeen(Math.max(lastSeen || 0, maxTs));
        if (insertedAny) setUnreadFlag(true);
        if (insertedAny) renderList();
      } catch {
        /* ignore polling errors */
      }
    }

    function openMenu() {
      menu.hidden = false;
      menu.classList.add('is-open');

      // Disable gray overlay on mobile; keep backdrop hidden
      if (backdrop) backdrop.classList.remove('is-active');
      document.body.classList.remove('pm-bell-open');

      var notifs = loadNotifStore();
      var changed = false;
      for (var i = 0; i < notifs.length; i++) {
        if (!notifs[i].read) {
          notifs[i].read = true;
          changed = true;
        }
      }
      if (changed) saveNotifStore(notifs);
      clearServicosUnreadFlag();
      renderList();
    }

    function closeMenu() {
      menu.hidden = true;
      menu.classList.remove('is-open');
      if (backdrop) backdrop.classList.remove('is-active');
      document.body.classList.remove('pm-bell-open');
    }

    bell.addEventListener('click', function (e) {
      e.stopPropagation();
      requestNotificationPermission();
      if (menu.hidden) openMenu();
      else closeMenu();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenu();
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenu();
      });
    }

    if (homeOpenBtn) {
      homeOpenBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (menu.hidden) openMenu();
        else closeMenu();
      });
    }

    listEl.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-bell-remove]') : null;
      if (btn) {
        e.stopPropagation();
        var idRemove = btn.getAttribute('data-bell-remove');
        removeNotificationById(idRemove);
        renderList();
        return;
      }

      var item = e.target && e.target.closest ? e.target.closest('[data-bell-item-id]') : null;
      if (!item) return;
      e.stopPropagation();
      var id = item.getAttribute('data-bell-item-id');
      if (id) {
        navToServicoFromNotif(id);
      }
    });

    if (homeList) {
      homeList.addEventListener('click', function (e) {
        var removeBtn = e.target && e.target.closest ? e.target.closest('[data-home-notif-remove]') : null;
        if (removeBtn) {
          var remId = removeBtn.getAttribute('data-home-notif-remove');
          removeNotificationById(remId);
          renderList();
          return;
        }

        var li = e.target && e.target.closest ? e.target.closest('[data-home-notif-id]') : null;
        if (!li) return;
        var id = li.getAttribute('data-home-notif-id');
        if (id) navToServicoFromNotif(id);
      });
    }

    document.addEventListener('click', function (e) {
      if (menu.hidden) return;
      if (menu.contains(e.target) || bell.contains(e.target)) return;
      closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (menu.hidden) return;
      closeMenu();
    });

    try {
      if (navigator && navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', function (event) {
          if (!event || !event.data || event.data.type !== 'portal-push') return;
          handlePushMessage(event.data.payload || {});
        });
      }
    } catch {
      /* noop */
    }

    async function pollServicos() {
      if (!BASE_PATH) return;
      try {
        var resp = await fetch(BASE_PATH + '/api/servicos', { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' } });
        if (!resp.ok) return;
        var data = await resp.json();
        var items = Array.isArray(data && data.data) ? data.data : [];
        try {
          var cache = loadServicoTitleCache();
          var touched = false;
          for (var ci = 0; ci < items.length; ci++) {
            var itc = items[ci];
            var idc = String(itc && itc._id ? itc._id : '').trim();
            if (!idc) continue;
            var titlec = String(itc && itc.titulo ? itc.titulo : '').trim();
            if (!titlec) continue;
            var protoc = String(itc && itc.protocolo ? itc.protocolo : '').trim();
            if (cache['id:' + idc] !== titlec) { cache['id:' + idc] = titlec; touched = true; }
            if (protoc && cache['p:' + protoc] !== titlec) { cache['p:' + protoc] = titlec; touched = true; }
          }
          if (touched) saveServicoTitleCache(cache);
        } catch {
          /* noop */
        }
        var prev = loadStatusCache();
        var next = {};
        var newAccepted = false;

        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          var id = String(it && it._id ? it._id : '').trim();
          if (!id) continue;
          var status = normalizeStatus(it.status || '');
          next[id] = status;
          if (status === 'aceita' && prev[id] && prev[id] !== 'aceita') {
            var proto = String(it.protocolo || id).trim();
            pushServiceNotification({ id: id, protocolo: proto, assunto: it && it.titulo });
            newAccepted = true;
          }
          if (status === 'rejeitada' && prev[id] && prev[id] !== 'rejeitada') {
            var protoR = String(it.protocolo || id).trim();
            var motivo = String(it.rejeicao_motivo || it.rejeitada_motivo || '').trim();
            var msg = motivo ? 'Foi rejeitada: ' + motivo : 'Foi rejeitada pelo condomínio.';
            pushServiceNotification({ id: id, protocolo: protoR, message: msg, assunto: it && it.titulo });
            newAccepted = true;
          }
        }

        saveStatusCache(next);
        if (newAccepted) {
          setUnreadFlag(true);
        }
        renderList();
      } catch {
        /* ignore polling errors */
      }
    }

    async function pollVisitasChegadas() {
      if (!BASE_PATH) return;
      try {
        var resp = await fetch(BASE_PATH + '/api/visitas/chegadas', { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' } });
        if (!resp.ok) return;
        var data = await resp.json();
        var items = Array.isArray(data && data.data) ? data.data : [];
        var insertedAny = false;

        for (var i = 0; i < items.length; i++) {
          var it = items[i] || {};
          var visitaId = String(it._id || '').trim();
          if (!visitaId) continue;
          var chegadaIso = String(it.chegadaEm || '').trim();
          var visitantes = Array.isArray(it.visitantes) ? it.visitantes : [];
          var primeiro = visitantes.length ? String(visitantes[0] || '').trim() : '';
          var count = visitantes.length;

          var title = 'Chegada de visitante';
          var message = count
            ? (count === 1 ? (primeiro ? (primeiro + ' chegou.') : 'Um visitante chegou.') : ((primeiro ? primeiro : 'Um visitante') + ' e mais ' + String(count - 1) + ' chegaram.'))
            : 'Um visitante chegou.';
          var hab = String(it.habitacaoNome || '').trim();
          var assunto = hab ? ('Habitação: ' + hab) : '';

          var visitanteKey = '';
          try {
            var vk = String(it.visitanteKey || '').trim();
            if (vk) {
              visitanteKey = vk;
            } else {
              var nomeP = String(it.visitante || it.principalNome || '').trim();
              var rgP = String(it.rg || it.principalRg || '').trim();
              var cpfP = String(it.cpf || it.principalCpf || '').trim();
              visitanteKey = (nomeP ? nomeP.toLowerCase() : '') + '|' + rgP + '|' + cpfP;
            }
          } catch { visitanteKey = ''; }

          // formato: visita-chegada:<visitaId>:<chegadaIso>:<visitanteKey>
          var id = 'visita-chegada:' + visitaId + (chegadaIso ? (':' + chegadaIso) : '') + (visitanteKey ? (':' + visitanteKey) : '');
          insertedAny = upsertGenericNotification({ id: id, title: title, message: message, assunto: assunto, ts: chegadaIso ? Date.parse(chegadaIso) : Date.now() }) || insertedAny;
        }

        if (insertedAny) setUnreadFlag(true);
        renderList();
      } catch {
        /* ignore polling errors */
      }
    }

    pollServicos();
    pollVisitasChegadas();
    pollEnquetesNovas();
    setInterval(pollServicos, 45000);
    setInterval(pollVisitasChegadas, 45000);
    setInterval(pollEnquetesNovas, 45000);

    renderList();
  }

  function initMsgNotifyFromCaixaDeMensagem() {
    try {
      var link = document.querySelector('[data-msg-link]');
      var badge = document.querySelector('[data-msg-badge]');
      if (!link || !badge) return;

      var MSG_MAILBOX_LS_PREFIX = 'wdg_msg_selectedMailboxId::';

      function normalizeBasePath(bp) {
        try {
          var p = String(bp || '').trim();
          if (!p) return '';
          if (!p.startsWith('/')) p = '/' + p;
          if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
          return p;
        } catch {
          return '';
        }
      }

      function inferBasePathCandidates(explicitBasePath) {
        var out = [];
        function push(v) {
          try {
            var s = normalizeBasePath(v);
            if (!s) return;
            if (out.indexOf(s) >= 0) return;
            out.push(s);
          } catch { /* noop */ }
        }

        push(explicitBasePath);
        try {
          var cand = window.__NB_BASE || window.__nbBase || window.__WdgBasePath || window.__wdgBasePath;
          if (typeof cand === 'string') push(cand);
        } catch { /* noop */ }

        try {
          var p = String(window.location && window.location.pathname ? window.location.pathname : '');
          if (p.indexOf('/portal-morador') === 0) push('/portal-morador');
          if (p.indexOf('/condominios') === 0) push('/condominios');
          if (p.indexOf('/gestor') === 0) push('/gestor');
        } catch { /* noop */ }

        return out;
      }

      function buildApiUrl(basePath, apiPathWithQuery) {
        var bp = normalizeBasePath(basePath);
        var p = String(apiPathWithQuery || '');
        if (!p) return bp || '';
        if (p.indexOf('/') === 0) return bp ? (bp + p) : p;
        return bp ? (bp + '/' + p) : ('/' + p);
      }

      function buildApiUrlTries(basePath, apiPathWithQuery) {
        var candidates = inferBasePathCandidates(basePath);
        var urls = [];
        function add(bp) {
          var u = buildApiUrl(bp, apiPathWithQuery);
          if (!u) return;
          if (urls.indexOf(u) >= 0) return;
          urls.push(u);
        }
        for (var i = 0; i < candidates.length; i += 1) add(candidates[i]);
        if (!urls.length) add('');
        return urls;
      }

      async function fetchJsonWithFallback(urls, fetchOptions) {
        var list = Array.isArray(urls) ? urls.filter(Boolean) : [];
        for (var i = 0; i < list.length; i += 1) {
          var url = list[i];
          try {
            var opts = (fetchOptions && typeof fetchOptions === 'object') ? Object.assign({}, fetchOptions) : {};
            var hdrs = {};
            try {
              if (opts.headers && typeof opts.headers === 'object') {
                if (typeof opts.headers.forEach === 'function') {
                  opts.headers.forEach(function (v, k) { hdrs[String(k)] = v; });
                } else {
                  hdrs = Object.assign({}, opts.headers);
                }
              }
            } catch { /* noop */ }
            if (!('Accept' in hdrs) && !('accept' in hdrs)) hdrs['Accept'] = 'application/json';
            if (!('X-Requested-With' in hdrs) && !('x-requested-with' in hdrs)) hdrs['X-Requested-With'] = 'fetch';
            hdrs['x-wdg-portal'] = '1';
            opts.headers = hdrs;

            var r = await fetch(url, opts);
            var ct = '';
            try { ct = String(r.headers.get('content-type') || '').toLowerCase(); } catch { ct = ''; }
            var json = null;
            if (ct.indexOf('application/json') >= 0 || ct.indexOf('+json') >= 0) {
              json = await r.json().catch(function () { return null; });
            } else {
              var text = await r.text().catch(function () { return ''; });
              var looksJson = (typeof text === 'string') && (/^[\s\r\n]*[\[{]/.test(text));
              if (looksJson) {
                try { json = JSON.parse(text); } catch { json = null; }
              } else {
                json = null;
              }
            }

            // Igual ao client do Condomínios: se veio 2xx mas não conseguimos JSON (provável HTML/login/proxy),
            // tenta o próximo candidato de basePath ao invés de assumir "vazio".
            if (r && r.ok && json === null) {
              continue;
            }

            return { r: r, json: json, url: url };
          } catch {
            // tenta próximo
          }
        }
        return { r: null, json: null, url: '' };
      }

      function getSelectedMailboxId() {
        try {
          var bp = normalizeBasePath(BASE_PATH);
          var select = document.querySelector('#msgMailboxSelect');
          var fromSelect = String(select && select.value ? select.value : '').trim();
          if (fromSelect) {
            try {
              var k1 = MSG_MAILBOX_LS_PREFIX + String(bp || '').trim();
              localStorage.setItem(k1, fromSelect);
            } catch { /* noop */ }
            return fromSelect;
          }

          try {
            var k2 = MSG_MAILBOX_LS_PREFIX + String(bp || '').trim();
            var stored = String(localStorage.getItem(k2) || '').trim();
            if (stored) return stored;
          } catch { /* noop */ }

          return 'pessoal';
        } catch {
          return 'pessoal';
        }
      }

      var lastUnread = null;
      var timer = null;
      var audioCtx = null;
      var audioUnlocked = false;
      var lastBeepAt = 0;
      var boostUntil = 0;
      var pendingBeep = false;

      function ensureAudioCtx() {
        try {
          if (audioCtx) return audioCtx;
          var Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return null;
          audioCtx = new Ctx();
          return audioCtx;
        } catch {
          return null;
        }
      }

      function unlockAudio() {
        try {
          if (audioUnlocked) return;
          var ctx = ensureAudioCtx();
          if (!ctx) return;
          if (ctx.state === 'suspended') {
            ctx.resume().catch(function () { /* noop */ });
          }
          audioUnlocked = true;

          // Se houve incremento de não lidas enquanto o áudio estava bloqueado, toca agora.
          if (pendingBeep) {
            pendingBeep = false;
            try { playBell(); } catch { /* noop */ }
          }
        } catch {
          /* noop */
        }
      }

      // Browsers modernos exigem interação antes de tocar som.
      try { window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true }); } catch { /* noop */ }
      try { window.addEventListener('keydown', unlockAudio, { once: true }); } catch { /* noop */ }

      function playBell() {
        try {
          var nowMs = Date.now();
          if (nowMs - lastBeepAt < 2500) return;

          var ctx = ensureAudioCtx();
          if (!ctx) return;
          if (ctx.state === 'suspended') return;

          var t0 = ctx.currentTime + 0.01;
          var master = ctx.createGain();
          master.gain.setValueAtTime(0.0001, t0);
          master.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
          master.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.10);
          master.connect(ctx.destination);

          var o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(784, t0);
          o.connect(master);
          o.start(t0);
          o.stop(t0 + 1.2);

          lastBeepAt = nowMs;
        } catch {
          /* noop */
        }
      }

      function setBadge(n) {
        var num = Math.max(0, Number(n) || 0);
        if (num <= 0) {
          badge.style.display = 'none';
          badge.textContent = '';
          badge.setAttribute('aria-hidden', 'true');
          link.classList.remove('has-unread');
          try { setInboxMenuCount(0); } catch { /* noop */ }
          return;
        }
        badge.style.display = 'inline-flex';
        badge.textContent = String(num);
        badge.removeAttribute('aria-hidden');
        link.classList.add('has-unread');
        try { setInboxMenuCount(num); } catch { /* noop */ }
      }

      function setInboxMenuCount(n) {
        var num = Math.max(0, Number(n) || 0);

        // Preferência: se os EJS já tiverem placeholder.
        var holders = Array.prototype.slice.call(document.querySelectorAll('[data-msg-inbox-count]'));
        if (holders && holders.length) {
          for (var i = 0; i < holders.length; i += 1) {
            var el = holders[i];
            if (!el) continue;
            if (num > 0) {
              el.textContent = '(' + String(num) + ')';
              el.style.display = '';
              try { el.removeAttribute('aria-hidden'); } catch { /* noop */ }
            } else {
              el.textContent = '';
              el.style.display = 'none';
              try { el.setAttribute('aria-hidden', 'true'); } catch { /* noop */ }
            }
          }
          return;
        }

        // Fallback: encontra o link de entrada pelo href e injeta um <span> uma vez.
        var anchors = Array.prototype.slice.call(document.querySelectorAll('.pm-nav-sub-item[href*="/mensagens/entrada"]'));
        if (!anchors || !anchors.length) return;
        for (var j = 0; j < anchors.length; j += 1) {
          var a = anchors[j];
          if (!a) continue;
          var countEl = a.querySelector('.pm-nav-count');
          if (!countEl) {
            countEl = document.createElement('span');
            countEl.className = 'pm-nav-count';
            countEl.setAttribute('data-msg-inbox-count', '1');
            countEl.setAttribute('aria-hidden', 'true');
            countEl.style.display = 'none';
            a.appendChild(countEl);
          }
          if (num > 0) {
            countEl.textContent = '(' + String(num) + ')';
            countEl.style.display = '';
            try { countEl.removeAttribute('aria-hidden'); } catch { /* noop */ }
          } else {
            countEl.textContent = '';
            countEl.style.display = 'none';
            try { countEl.setAttribute('aria-hidden', 'true'); } catch { /* noop */ }
          }
        }
      }

      var consecutiveFails = 0;
      var lastFailAt = 0;
      var lastFailStatus = 0;

      function noteFail(status) {
        try {
          consecutiveFails = Math.min(20, Math.max(0, Number(consecutiveFails) || 0) + 1);
          lastFailAt = Date.now();
          lastFailStatus = Number(status) || 0;
        } catch { /* noop */ }
      }

      function noteSuccess() {
        try {
          consecutiveFails = 0;
          lastFailAt = 0;
          lastFailStatus = 0;
        } catch { /* noop */ }
      }

      function getBackoffMs() {
        try {
          var fails = Math.max(0, Number(consecutiveFails) || 0);
          if (!fails) return 0;
          // 2s, 4s, 8s... até 60s (com jitter leve)
          var base = Math.min(60000, 2000 * Math.pow(2, Math.min(5, fails - 1)));
          var jitter = Math.floor(Math.random() * 500);
          return base + jitter;
        } catch {
          return 5000;
        }
      }

      async function fetchUnread() {
        try {
          var debug = false;
          try { debug = String(localStorage.getItem('pm_debug_msg_notify') || '') === '1'; } catch { debug = false; }

          // Portal do Morador: o menu "Caixa de entrada" e o ícone da topbar representam a INBOX PESSOAL.
          // Se usarmos a última caixa selecionada (ex.: pública), é fácil o contador ficar sempre 0 e
          // parecer que a feature não funciona.
          var mailboxId = 'pessoal';
          // Usa paginação mínima e lê `total` para detectar mudanças mesmo com muitas não lidas.
          var qs = 'mailboxId=' + encodeURIComponent(mailboxId)
            + '&folder=entrada&status=nao_lidas&page=1&pageSize=1&_ts=' + Date.now();
          var tries = ['/mensagens/api/msg/messages?' + qs];
          var result = await fetchJsonWithFallback(tries, { credentials: 'same-origin', cache: 'no-store' });
          if (!result || !result.r) {
            if (debug) console.warn('[PM MSG NOTIFY] polling falhou: sem resposta', { tries });
            noteFail(0);
            return null;
          }
          if (Number(result.r.status) === 409) {
            if (debug) console.warn('[PM MSG NOTIFY] polling: status 409 (seleção/unidade)', { url: result.url });
            noteFail(409);
            return null;
          }
          if (!result.r.ok) {
            if (debug) console.warn('[PM MSG NOTIFY] polling: status NOK', { status: result.r.status, url: result.url });
            // 5xx costuma ser indisponibilidade temporária (Vercel/cold start); aplique backoff.
            noteFail(Number(result.r.status) || 0);
            return null;
          }
          var data = result.json;
          if (!data) {
            if (debug) console.warn('[PM MSG NOTIFY] polling: resposta sem JSON', { url: result.url, status: result.r.status });
            noteFail(Number(result.r.status) || 0);
            return null;
          }
          var total = (typeof data.total !== 'undefined') ? Number(data.total) : NaN;
          if (Number.isFinite(total) && total >= 0) {
            if (debug) console.log('[PM MSG NOTIFY] polling', { url: result.url, status: result.r.status, total: total });
            noteSuccess();
            return total;
          }
          var items = (data && Array.isArray(data.items)) ? data.items : (Array.isArray(data) ? data : []);
          if (debug) console.log('[PM MSG NOTIFY] polling', { url: result.url, status: result.r.status, itemsLen: Array.isArray(items) ? items.length : null });
          noteSuccess();
          return Array.isArray(items) ? items.length : 0;
        } catch (err) {
          try {
            var debug2 = false;
            try { debug2 = String(localStorage.getItem('pm_debug_msg_notify') || '') === '1'; } catch { debug2 = false; }
            if (debug2) console.error('[PM MSG NOTIFY] polling erro', err);
          } catch { /* noop */ }
          noteFail(0);
          return null;
        }
      }

      async function tick() {
        try {
          var n = await fetchUnread();
          if (n == null) {
            // Evita badge "travado" (ex.: ficou em 1) quando a API passa a falhar
            // por auth/seleção/unidade. Nestes casos, é melhor limpar do que mentir.
            try {
              if (consecutiveFails >= 2 && (lastFailStatus === 401 || lastFailStatus === 403 || lastFailStatus === 409)) {
                setBadge(0);
                lastUnread = 0;
              }
            } catch { /* noop */ }
            return;
          }
          setBadge(n);
          if (lastUnread != null && n > lastUnread) {
            try {
              // Permite que a tela da caixa de mensagens reaja imediatamente (ex.: recarregar lista)
              // sem depender de refresh manual.
              window.dispatchEvent(new CustomEvent('wdg:msg:unread', { detail: { unread: n, prev: lastUnread } }));
            } catch { /* noop */ }

            if (audioUnlocked) {
              playBell();
            } else {
              pendingBeep = true;
            }
            try { boostUntil = Date.now() + 60000; } catch { /* noop */ }
          }
          lastUnread = n;
        } catch {
          /* noop */
        }
      }

      function bindMailboxSignals() {
        try {
          var select = document.querySelector('#msgMailboxSelect');
          if (select && !select.__pmMsgNotifyBound) {
            select.__pmMsgNotifyBound = true;
            select.addEventListener('change', function () {
              try { lastUnread = null; } catch { /* noop */ }
              tick();
            });
          }
        } catch { /* noop */ }

        // Se a seleção for gravada em outra aba/tela, atualiza também.
        try {
          window.addEventListener('storage', function (ev) {
            try {
              var k = String(ev && ev.key ? ev.key : '');
              if (!k) return;
              var bp = normalizeBasePath(BASE_PATH);
              if (k === (MSG_MAILBOX_LS_PREFIX + String(bp || '').trim())) {
                try { lastUnread = null; } catch { /* noop */ }
                tick();
              }
            } catch { /* noop */ }
          });
        } catch { /* noop */ }
      }

      function schedule() {
        try {
          if (timer) clearTimeout(timer);
          var interval;

          // Backoff quando a API está falhando (evita loop de 503 no console).
          var backoff = getBackoffMs();
          if (backoff > 0) {
            interval = backoff;
            timer = setTimeout(async function () {
              await tick();
              schedule();
            }, interval);
            return;
          }

          if (document.hidden) {
            interval = 45000;
          } else {
            // Mais responsivo quando o usuário está olhando a caixa.
            var p = '';
            try { p = String(location && location.pathname ? location.pathname : ''); } catch { p = ''; }
            var isMsgPage = p.indexOf('/mensagens/') >= 0;

            // Comportamento padrão: 10s; na caixa: 2.5s.
            interval = isMsgPage ? 2500 : 10000;

            // Após detectar nova mensagem, acelera por 60s.
            try {
              if (boostUntil && Date.now() < boostUntil) interval = Math.min(interval, 2000);
            } catch { /* noop */ }
          }
          timer = setTimeout(async function () {
            await tick();
            schedule();
          }, interval);
        } catch {
          /* noop */
        }
      }

      document.addEventListener('visibilitychange', function () {
        try {
          if (!document.hidden) {
            // Ao voltar para a aba, faz um tick imediato.
            tick();
          }
        } catch { /* noop */ }
        schedule();
      });

      try {
        window.addEventListener('focus', function () {
          try { if (!document.hidden) tick(); } catch { /* noop */ }
        });
      } catch { /* noop */ }

      // Permite que outras telas (ex.: caixa de mensagem) peçam refresh imediato do badge.
      try {
        window.addEventListener('wdg:msg:refreshBadge', function () {
          try { boostUntil = Date.now() + 15000; } catch { /* noop */ }
          try { lastUnread = null; } catch { /* noop */ }
          tick();
        });
      } catch { /* noop */ }

      bindMailboxSignals();
      try { boostUntil = Date.now() + 15000; } catch { /* noop */ }
      tick();
      // Segundo tick rápido ajuda a preencher o badge quando o navegador ainda está "assentando".
      // Porém, se a API está falhando, isso só gera spam (503). Então só faz se não há falhas.
      try { setTimeout(function () { if (!consecutiveFails) tick(); }, 1500); } catch { /* noop */ }
      schedule();
    } catch {
      /* noop */
    }
  }

  function applyNameMode(wrap, mode) {
    var full = String(wrap.getAttribute('data-user-name') || '').trim();
    var label = bySel(wrap, '.pm-user-name');
    if (!label) {
      try {
        var topbarRight = wrap.closest && wrap.closest('.pm-topbar-right');
        label = bySel(topbarRight || wrap.parentElement, '.pm-user-name');
      } catch {
        label = null;
      }
    }
    var initialsEl = bySel(wrap, '.pm-user-initials');

    if (initialsEl) initialsEl.textContent = computeInitials(full);

    if (!label) {
      // Ainda aplica boas-vindas mesmo sem label do topo.
      var dispNoLabel = computeDisplayName(full, mode);
      if (dispNoLabel && dispNoLabel.welcome) setWelcomeName(dispNoLabel.welcome);
      return;
    }

    var disp = computeDisplayName(full, mode);
    var text = disp.chip;

    if (text) {
      label.textContent = text;
      label.style.display = '';
      label.setAttribute('aria-hidden', 'false');
    } else {
      label.textContent = '';
      label.style.display = 'none';
      label.setAttribute('aria-hidden', 'true');
    }

    // Boas-vindas (Home): usa o nome escolhido.
    if (disp.welcome) setWelcomeName(disp.welcome);
  }

  function initUserMenu(wrap) {
    var btn = bySel(wrap, '.pm-user-chip--btn');
    var menu = bySel(wrap, '.pm-user-menu');
    if (!btn || !menu) return;

    // Evita registrar listeners duplicados caso o script seja carregado mais de uma vez.
    try {
      if (wrap.__pmUserMenuBound) return;
      wrap.__pmUserMenuBound = true;
    } catch {
      /* noop */
    }

    var basePath = getBasePath();

    // Compat: algumas telas antigas usam `data-name-mode`.
    var nameModeSelect = bySel(menu, '[data-action="name-mode"], [data-name-mode]');
    var customNameInput = ensureCustomNameInput(menu, nameModeSelect);
    var fileInput = bySel(menu, '[data-action="avatar-file"]');
    var fileBtn = bySel(menu, '[data-action="avatar-pick"]');
    var pwdToggle = bySel(menu, '[data-action="toggle-password"]');
    var pwdForm = bySel(menu, '[data-action="password-form"]');
    var statusEl = bySel(menu, '.pm-user-menu-status');

    function setStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = String(msg || '');
      statusEl.setAttribute('data-kind', kind || 'info');
      statusEl.style.display = msg ? '' : 'none';
    }

    function openMenu() {
      menu.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      setStatus('', 'info');
    }

    function closeMenu() {
      menu.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      setStatus('', 'info');
      if (pwdForm) pwdForm.hidden = true;
    }

    function toggleMenu() {
      if (menu.classList.contains('is-open')) closeMenu();
      else openMenu();
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });

    document.addEventListener('click', function (e) {
      if (!menu.classList.contains('is-open')) return;
      if (wrap.contains(e.target)) return;
      closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!menu.classList.contains('is-open')) return;
      closeMenu();
    });

    var fullName = String(wrap.getAttribute('data-user-name') || '');
    populateNameModeSelect(nameModeSelect, fullName);

    var savedMode = '';
    try {
      savedMode = localStorage.getItem('pm_name_mode') || '';
    } catch {
      savedMode = '';
    }
    if (!savedMode) savedMode = 'initials';

    // Se o modo salvo não existe mais (ex: usuário diferente), cai para iniciais.
    if (nameModeSelect) {
      var has = false;
      try {
        for (var oi = 0; oi < nameModeSelect.options.length; oi++) {
          if (String(nameModeSelect.options[oi].value || '') === savedMode) {
            has = true;
            break;
          }
        }
      } catch {
        has = false;
      }
      if (!has) savedMode = 'initials';
    }

    applyNameMode(wrap, savedMode);
    if (nameModeSelect) {
      nameModeSelect.value = savedMode;

      // Se for "Outro…", mostra o input e carrega valor salvo.
      if (customNameInput) {
        if (savedMode === 'custom') {
          customNameInput.style.display = '';
          customNameInput.value = getSavedCustomName();
        } else {
          customNameInput.style.display = 'none';
        }
      }

      nameModeSelect.addEventListener('change', function () {
        var mode = String(nameModeSelect.value || 'initials');
        try {
          localStorage.setItem('pm_name_mode', mode);
        } catch {
          /* noop */
        }

        if (customNameInput) {
          if (mode === 'custom') {
            customNameInput.style.display = '';
            if (!customNameInput.value) customNameInput.value = getSavedCustomName();
            try { customNameInput.focus(); } catch { /* noop */ }
          } else {
            customNameInput.style.display = 'none';
          }
        }

        applyNameMode(wrap, mode);
      });
    }

    if (customNameInput) {
      customNameInput.addEventListener('input', function () {
        var val = normalizeSpaces(customNameInput.value);
        setSavedCustomName(val);
        if (nameModeSelect && String(nameModeSelect.value || '') === 'custom') {
          applyNameMode(wrap, 'custom');
        }
      });
    }

    if (fileBtn && fileInput) {
      fileBtn.addEventListener('click', function () {
        setStatus('', 'info');
        fileInput.click();
      });

      fileInput.addEventListener('change', async function () {
        try {
          setStatus('Enviando foto...', 'info');
          var file = fileInput.files && fileInput.files[0];
          if (!file) {
            setStatus('', 'info');
            return;
          }
          var form = new FormData();
          form.append('foto', file);
          var resp = await fetch(basePath + '/api/user/avatar', {
            method: 'POST',
            body: form,
            credentials: 'same-origin'
          });
          var data = null;
          try {
            data = await resp.json();
          } catch {
            data = null;
          }
          if (!resp.ok || !data || !data.ok) {
            setStatus((data && data.error) ? data.error : 'Falha ao enviar foto.', 'error');
            return;
          }
          var url = String(data.avatarUrl || '');
          if (url) {
            var img = bySel(btn, 'img');
            var initials = bySel(btn, '.pm-user-initials');
            if (!img) {
              img = document.createElement('img');
              img.alt = 'Avatar';
              btn.insertBefore(img, btn.firstChild);
            }
            var sep = url.indexOf('?') >= 0 ? '&' : '?';
            img.src = url + sep + 'v=' + Date.now();
            if (initials) initials.style.display = 'none';
          }
          setStatus('Foto atualizada.', 'ok');
        } catch {
          setStatus('Falha ao enviar foto.', 'error');
        } finally {
          try {
            fileInput.value = '';
          } catch {
            /* noop */
          }
        }
      });
    }

    if (pwdToggle && pwdForm) {
      pwdToggle.addEventListener('click', function () {
        setStatus('', 'info');
        pwdForm.hidden = !pwdForm.hidden;
      });

      pwdForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        setStatus('', 'info');

        var cur = bySel(pwdForm, 'input[name="currentPassword"]');
        var next = bySel(pwdForm, 'input[name="newPassword"]');
        var confirm = bySel(pwdForm, 'input[name="confirmPassword"]');
        var curVal = cur ? String(cur.value || '') : '';
        var nextVal = next ? String(next.value || '') : '';
        var confVal = confirm ? String(confirm.value || '') : '';

        if (!curVal || !nextVal || !confVal) {
          setStatus('Preencha todos os campos.', 'error');
          return;
        }
        if (nextVal !== confVal) {
          setStatus('Confirmação diferente da nova senha.', 'error');
          return;
        }

        try {
          setStatus('Atualizando senha...', 'info');
          var resp = await fetch(basePath + '/api/user/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: curVal, newPassword: nextVal }),
            credentials: 'same-origin'
          });
          var data = null;
          try {
            data = await resp.json();
          } catch {
            data = null;
          }
          if (!resp.ok || !data || !data.ok) {
            setStatus((data && data.error) ? data.error : 'Falha ao atualizar senha.', 'error');
            return;
          }
          setStatus('Senha atualizada.', 'ok');
          pwdForm.hidden = true;
          if (cur) cur.value = '';
          if (next) next.value = '';
          if (confirm) confirm.value = '';
        } catch {
          setStatus('Falha ao atualizar senha.', 'error');
        }
      });
    }
  }

  function initSidebarNavAccordion() {
    try {
      var allDetails = Array.prototype.slice.call(document.querySelectorAll('.pm-nav .pm-nav-details'));
      if (!allDetails || allDetails.length < 2) return;

      function closeOthers(opened) {
        for (var i = 0; i < allDetails.length; i++) {
          var d = allDetails[i];
          if (d !== opened && d && d.open) d.open = false;
        }
      }

      // Se houver item ativo em submenu, abre somente o grupo correspondente.
      var activeSub = document.querySelector('.pm-nav .pm-nav-sub-item.active');
      if (activeSub) {
        for (var j = 0; j < allDetails.length; j++) {
          var cand = allDetails[j];
          if (cand && cand.contains(activeSub)) {
            cand.open = true;
            closeOthers(cand);
            break;
          }
        }
      }

      // Accordion: abriu um, fecha os outros.
      for (var k = 0; k < allDetails.length; k++) {
        (function (detailsEl) {
          if (!detailsEl) return;
          detailsEl.addEventListener('toggle', function () {
            if (!detailsEl.open) return;
            closeOthers(detailsEl);
          });
        })(allDetails[k]);
      }
    } catch {
      /* noop */
    }
  }

  function initMobileSidebarToggle() {
    try {
      var toggle = document.getElementById('pmNavToggle');
      var sidebar = document.getElementById('pmSidebar');
      if (!toggle || !sidebar) return;

      var backdrop = document.querySelector('.pm-nav-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'pm-nav-backdrop';
        document.body.appendChild(backdrop);
      }

      var open = false;

      function setExpandedState(expanded) {
        try {
          toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        } catch {
          /* noop */
        }
      }

      function setCollapsedDesktop(collapsed) {
        sidebar.classList.toggle('is-collapsed', collapsed);
        try {
          document.body.classList.toggle('pm-sidebar-collapsed', collapsed);
        } catch {
          /* noop */
        }
        setExpandedState(!collapsed);
      }

      function openNav() {
        if (open) return;
        open = true;
        sidebar.classList.add('is-open');
        try { document.body.classList.remove('pm-sidebar-collapsed'); } catch { /* noop */ }
        document.body.classList.add('pm-nav-open');
        if (backdrop) backdrop.classList.add('is-active');
        setExpandedState(true);
      }

      function closeNav() {
        open = false;
        sidebar.classList.remove('is-open');
        document.body.classList.remove('pm-nav-open');
        if (backdrop) backdrop.classList.remove('is-active');
        try { document.body.classList.remove('pm-sidebar-collapsed'); } catch { /* noop */ }
        setExpandedState(false);
      }

      function toggleNav(ev) {
        if (ev) ev.preventDefault();
        var isMobile = window.matchMedia('(max-width: 1024px)').matches;
        if (isMobile) {
          if (open) closeNav();
          else {
            setCollapsedDesktop(false);
            openNav();
          }
        } else {
          var next = !sidebar.classList.contains('is-collapsed');
          setCollapsedDesktop(next);
        }
      }

      toggle.addEventListener('click', toggleNav);
      backdrop && backdrop.addEventListener('click', closeNav);

      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') closeNav();
      });

      function syncResponsiveState() {
        var isMobile = window.matchMedia('(max-width: 1024px)').matches;
        if (isMobile) {
          sidebar.classList.remove('is-collapsed');
          try { document.body.classList.remove('pm-sidebar-collapsed'); } catch { /* noop */ }
          if (!open) setExpandedState(false);
        } else {
          closeNav();
          var collapsed = sidebar.classList.contains('is-collapsed');
          try { document.body.classList.toggle('pm-sidebar-collapsed', collapsed); } catch { /* noop */ }
          setExpandedState(!collapsed);
        }
      }

      window.addEventListener('resize', syncResponsiveState);
      syncResponsiveState();
    } catch {
      /* noop */
    }
  }

  function initToolbarFold() {
    try {
      var toolbar = document.getElementById('pmToolbar');
      var body = document.getElementById('pmToolbarBody');
      var toggle = document.getElementById('pmToolbarToggle');
      if (!toolbar || !toggle || !body) return;

      var expanded = true;
      var mobileMatch = null;
      try {
        mobileMatch = window.matchMedia('(max-width: 640px)');
      } catch {
        mobileMatch = null;
      }

      function setState(next) {
        expanded = !!next;
        toolbar.classList.toggle('is-collapsed', !expanded);
        body.classList.toggle('is-collapsed', !expanded);
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        toggle.setAttribute('aria-label', expanded ? 'Recolher barra' : 'Expandir barra');
        toggle.classList.toggle('is-collapsed', !expanded);
      }

      function applyResponsiveDefault(isMobile) {
        setState(!isMobile);
      }

      toggle.addEventListener('click', function (ev) {
        if (ev) ev.preventDefault();
        setState(!expanded);
      });

      if (mobileMatch) {
        applyResponsiveDefault(mobileMatch.matches);
        var handler = function (ev) {
          applyResponsiveDefault(ev.matches);
        };
        if (typeof mobileMatch.addEventListener === 'function') {
          mobileMatch.addEventListener('change', handler);
        } else if (typeof mobileMatch.addListener === 'function') {
          mobileMatch.addListener(handler);
        }
      } else {
        setState(true);
      }
    } catch {
      /* noop */
    }
  }

  function initMensagensMenuDirectOpen() {
    try {
      var basePath = getBasePath();
      var summary = document.querySelector('.pm-nav-details--mensagens > summary');
      if (!summary) return;

      // Evita registrar handlers duplicados caso o script seja carregado mais de uma vez.
      try {
        if (summary.getAttribute('data-pm-mensagens-direct-open') === '1') return;
        summary.setAttribute('data-pm-mensagens-direct-open', '1');
      } catch { /* noop */ }

      function normalizeBasePath(bp) {
        var out = String(bp || '').trim();
        if (!out) return '';
        if (out.endsWith('/')) out = out.slice(0, -1);
        return out;
      }

      function isInMensagens(pathname) {
        var path = String(pathname || '');
        var bp = normalizeBasePath(basePath);
        var candidates = [];
        if (bp) {
          candidates.push(bp);
          // Compat: algumas instalações usam /portal_morador (underscore).
          if (bp.indexOf('portal-morador') >= 0) candidates.push(bp.replace('portal-morador', 'portal_morador'));
          if (bp.indexOf('portal_morador') >= 0) candidates.push(bp.replace('portal_morador', 'portal-morador'));
        }
        // Sem basePath confiável, faz match direto.
        candidates.push('');

        for (var i = 0; i < candidates.length; i++) {
          var c = candidates[i];
          var prefix = (c ? c : '') + '/mensagens';
          if (path === prefix) return true;
          if (path.indexOf(prefix + '/') === 0) return true;
        }
        return false;
      }

      function redirectEntrada() {
        // Usa setTimeout para não depender do ciclo do <details>/<summary>.
        setTimeout(function () {
          try {
            window.location.href = (normalizeBasePath(basePath) || '') + '/mensagens/entrada';
          } catch { /* noop */ }
        }, 0);
      }

      function onSummaryActivate(ev) {
        // Dedupe: touch/pointer/mouse/click podem disparar em cascata.
        // Evita navegação dupla e ruído no console.
        var now = 0;
        try { now = Date.now(); } catch { now = 0; }
        try {
          if (summary && summary.__wdg_lastActivateAt && now && (now - summary.__wdg_lastActivateAt) < 650) return;
          if (summary) summary.__wdg_lastActivateAt = now;
        } catch { /* noop */ }

        var path = '';
        try {
          path = window.location && window.location.pathname ? window.location.pathname : '';
        } catch {
          path = '';
        }

        // Dentro do módulo: apenas alterna expandir/recolher (sem navegar).
        if (isInMensagens(path)) return;

        // Fora do módulo: expande e navega para Caixa de entrada.
        // Não tenta preventDefault em touchstart passive.
        if (ev && ev.type !== 'touchstart' && ev.cancelable && typeof ev.preventDefault === 'function') ev.preventDefault();
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        if (ev && typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

        try {
          var detailsEl = summary.parentElement;
          if (detailsEl && detailsEl.tagName === 'DETAILS') detailsEl.open = true;
        } catch { /* noop */ }

        redirectEntrada();
      }

      function onSummaryTouchStart(ev) {
        // Listener passive: não chama preventDefault.
        return onSummaryActivate(ev);
      }

      // Capture para ganhar de qualquer listener que interfira no click.
      try { summary.addEventListener('pointerdown', onSummaryActivate, true); } catch { /* noop */ }
      try { summary.addEventListener('mousedown', onSummaryActivate, true); } catch { /* noop */ }
      try { summary.addEventListener('touchstart', onSummaryTouchStart, { capture: true, passive: true }); } catch { /* noop */ }
      // Fallback: click.
      try { summary.addEventListener('click', onSummaryActivate, true); } catch { /* noop */ }
      summary.addEventListener('click', onSummaryActivate);
    } catch {
      /* noop */
    }
  }

  function initAllUserMenus() {
    try {
      var wraps = Array.prototype.slice.call(document.querySelectorAll('.pm-user-menu-wrap'));
      if (!wraps || !wraps.length) return;
      for (var i = 0; i < wraps.length; i++) {
        try { initUserMenu(wraps[i]); } catch { /* noop */ }
      }
    } catch {
      /* noop */
    }
  }

  // Bootstrap (script é carregado ao final do body; pode inicializar imediatamente)
  try { initSidebarNavAccordion(); } catch { /* noop */ }
  try { initMobileSidebarToggle(); } catch { /* noop */ }
  try { initToolbarFold(); } catch { /* noop */ }
  try { initMensagensSubmenuAccordion(); } catch { /* noop */ }
  try { initMensagensMenuDirectOpen(); } catch { /* noop */ }
  try { initAllUserMenus(); } catch { /* noop */ }
  try { initPushInfrastructure(); } catch { /* noop */ }
  try { initBellFromServicosFlag(); } catch { /* noop */ }
  try { initMsgNotifyFromCaixaDeMensagem(); } catch { /* noop */ }
})();
