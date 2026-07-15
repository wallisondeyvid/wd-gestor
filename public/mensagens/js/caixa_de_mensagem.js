(function () {
  'use strict';

  // Estado em memória (sem persistência no navegador). O servidor é a fonte da verdade.
  const MEMORY_STORE = {
    mailboxes: [],
    recipientMailboxes: [],
    groupsByMailbox: {},
    opsEditorStateByMailbox: {},
    selectedView: '',
    selectedMailboxId: '',
    lastApiDiag: null,
    lastMailboxesDiag: null,
    lastRecipientMailboxesDiag: null,
    myRecipientPerms: null
  };

  // Estado da LISTA por mailbox/view (mantido em memória durante a sessão da página).
  // Isso evita “tela em branco” e melhora a percepção de performance ao alternar entre caixas.
  const LIST_VIEW_STATE = (function () {
    const store = new Map();
    function keyFor(mailboxId, viewName) { return `${String(mailboxId || 'pessoal')}::${String(viewName || 'entrada')}`; }
    function get(mailboxId, viewName) {
      const key = keyFor(mailboxId, viewName);
      if (store.has(key)) return store.get(key);
      const init = {
        q: '',
        status: 'todas',
        onlyUnread: false,
        statusBeforeOnlyUnread: 'todas',
        marker: '',
        protocolo: '',
        de: '',
        para: '',
        ini: '',
        fim: '',
        comAnexo: false,
        semMarcador: false,
        filterOpen: false,
        selectedIds: new Set(),
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        pages: 1,
        markers: null,
        readOrder: 'normal',
        loadedOnce: false,
        openMessageId: '',
        inlineMode: '',
        inlineBaseMsgId: ''
      };
      store.set(key, init);
      return init;
    }
    return { get };
  })();

  // Diagnóstico: expõe um dump seguro no window para inspeção rápida via console.
  // Ex.: `window.__wdgMsgDump()`
  try {
    if (typeof window !== 'undefined') {
      window.__wdgMsgDump = () => {
        try {
          const ctx = getCtx();
          return {
            at: new Date().toISOString(),
            href: String(window.location?.href || ''),
            ctx,
            selected: {
              view: String(MEMORY_STORE.selectedView || ''),
              mailboxId: String(MEMORY_STORE.selectedMailboxId || '')
            },
            cache: {
              mailboxesCount: Array.isArray(MEMORY_STORE.mailboxes) ? MEMORY_STORE.mailboxes.length : 0,
              recipientMailboxesCount: Array.isArray(MEMORY_STORE.recipientMailboxes) ? MEMORY_STORE.recipientMailboxes.length : 0
            },
            last: {
              mailboxes: MEMORY_STORE.lastMailboxesDiag,
              recipientMailboxes: MEMORY_STORE.lastRecipientMailboxesDiag,
              messages: MEMORY_STORE.lastApiDiag
            }
          };
        } catch (e) {
          return { at: new Date().toISOString(), error: String(e?.message || e) };
        }
      };

      window.__wdgMsgDumpPrint = () => {
        const d = window.__wdgMsgDump ? window.__wdgMsgDump() : null;
        try { console.log('[WDG_MSG_DUMP]', d); } catch {}
        return d;
      };
    }
  } catch {
    /* noop */
  }

  function isDebugEnabled() {
    try {
      const qs = new URLSearchParams(window.location.search || '');
      return String(qs.get('debug') || '').trim() === '1';
    } catch {
      return false;
    }
  }

  function appendQs(url, pairs) {
    const u = String(url || '').trim();
    if (!u) return u;
    const p = pairs && typeof pairs === 'object' ? pairs : {};
    const s = Object.entries(p)
      .filter(([k, v]) => k && v !== undefined && v !== null && String(v) !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (!s) return u;
    return u.includes('?') ? `${u}&${s}` : `${u}?${s}`;
  }

  function normalizeBasePath(raw) {
    let bp = String(raw || '').trim();
    if (!bp) return '';
    if (!bp.startsWith('/')) bp = '/' + bp;
    // Remove barra no final (exceto se for apenas "/")
    if (bp.length > 1) bp = bp.replace(/\/+$/, '');
    return bp;
  }

  function inferBasePathCandidates(explicitBasePath) {
    const out = [];
    const push = (v) => {
      const bp = normalizeBasePath(v);
      if (!bp) return;
      if (out.includes(bp)) return;
      out.push(bp);
    };

    try { push(document.body?.dataset?.apiBasePath); } catch { /* noop */ }
    push(explicitBasePath);
    try { push(document.body?.dataset?.basePath); } catch { /* noop */ }
    try {
      // Alguns módulos injetam base em variáveis globais.
      const cand = window.__NB_BASE || window.__nbBase || window.__WdgBasePath || window.__wdgBasePath;
      if (typeof cand === 'string') push(cand);
    } catch { /* noop */ }

    try {
      const p = String(window.location?.pathname || '');
      if (p.startsWith('/portal-morador')) push('/portal-morador');
      if (p.startsWith('/condominios')) push('/condominios');
      if (p.startsWith('/gestor')) push('/gestor');
    } catch { /* noop */ }

    return out;
  }

  function getSafePageBasePath(explicitBasePath) {
    const cands = inferBasePathCandidates(explicitBasePath);
    return cands && cands.length ? cands[0] : '';
  }

  function buildApiUrl(basePath, apiPathWithQuery) {
    const bp = normalizeBasePath(basePath);
    const p = String(apiPathWithQuery || '');
    if (!p) return bp || '';
    if (p.startsWith('/')) return bp ? `${bp}${p}` : p;
    return bp ? `${bp}/${p}` : `/${p}`;
  }

  function buildApiUrlTries(basePath, apiPathWithQuery) {
    const candidates = inferBasePathCandidates(basePath);
    const urls = [];
    const add = (bp) => {
      const u = buildApiUrl(bp, apiPathWithQuery);
      if (!u) return;
      if (urls.includes(u)) return;
      urls.push(u);
    };
    candidates.forEach(add);
    // Fallback para root SOMENTE se não conseguimos inferir basePath.
    // Em ambientes multi-módulo (Portal/Gestor/Condomínios), cair para /api/* pode redirecionar para o módulo errado.
    if (!urls.length) add('');
    return urls;
  }

  async function fetchJsonWithFallback(urls, fetchOptions) {
    const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
    for (const url of list) {
      try {
        const opts = (fetchOptions && typeof fetchOptions === 'object') ? { ...fetchOptions } : {};
        // Importante em ambientes multi-módulo: evita que middlewares respondam com HTML
        // (ex.: redirect para login) e o fetch acabe em 200 com body HTML.
        // Muitos handlers só retornam JSON corretamente quando Accept inclui application/json.
        let hdrs = {};
        try {
          if (opts.headers && typeof opts.headers === 'object') {
            // Headers (Fetch API)
            if (typeof opts.headers.forEach === 'function') {
              opts.headers.forEach((v, k) => { hdrs[String(k)] = v; });
            } else {
              hdrs = { ...opts.headers };
            }
          }
        } catch { /* noop */ }
        if (!('Accept' in hdrs) && !('accept' in hdrs)) hdrs['Accept'] = 'application/json';
        if (!('X-Requested-With' in hdrs) && !('x-requested-with' in hdrs)) hdrs['X-Requested-With'] = 'fetch';

        // Portal do Morador: evita misturar identidade com sessão do Gestor no mesmo navegador.
        // Se a página atual está no Portal, sinalize explicitamente para o backend.
        try {
          const path = (typeof window !== 'undefined' && window.location) ? String(window.location.pathname || '') : '';
          if (path.startsWith('/portal-morador')) {
            if (!('x-wdg-portal' in hdrs) && !('X-WDG-Portal' in hdrs)) hdrs['x-wdg-portal'] = '1';
          }
        } catch { /* noop */ }
        opts.headers = hdrs;

        const r = await fetch(url, opts);
        const ct = String(r.headers.get('content-type') || '').toLowerCase();
        let json = null;

        if (ct.includes('application/json') || ct.includes('+json')) {
          json = await r.json().catch(() => null);
        } else {
          // Alguns proxies/redirecionamentos retornam HTML; trate como falha para permitir fallback.
          const text = await r.text().catch(() => '');
          const looksJson = typeof text === 'string' && /^[\s\r\n]*[\[{]/.test(text);
          json = looksJson ? safeJsonParse(text, null) : null;
        }

        return { r, json, url };
      } catch (e) {
        // Abort deve encerrar imediatamente (evita race e trabalho desnecessário)
        try {
          if (e && (e.name === 'AbortError' || String(e.name || '') === 'AbortError')) throw e;
        } catch (abortErr) {
          throw abortErr;
        }
        // tenta próximo
      }
    }
    return { r: null, json: null, url: '' };
  }

  const PERMISSIONS = [
    { key: 'administrar', label: 'Administrar a caixa', short: 'ADM' },
    { key: 'gerenciarMarcador', label: 'Gerenciar marcador', short: 'MAR' },
    { key: 'lerMensagem', label: 'Ler mensagem', short: 'LER' },
    { key: 'criarMensagem', label: 'Criar mensagem', short: 'CRI' },
    { key: 'gerenciarGrupos', label: 'Gerenciar grupos', short: 'GRP' },
    { key: 'excluirMensagem', label: 'Excluir mensagem', short: 'EXC' }
  ];

  const MSG_VIEW_STATE_KEY = 'wdgMsg.viewState.v1';

  function isReloadNavigation() {
    try {
      const nav = (typeof performance !== 'undefined' && performance && performance.getEntriesByType)
        ? performance.getEntriesByType('navigation')
        : null;
      if (Array.isArray(nav) && nav[0] && typeof nav[0].type === 'string') {
        return String(nav[0].type || '').toLowerCase() === 'reload';
      }
      // Fallback legado
      return !!(typeof performance !== 'undefined' && performance && performance.navigation && performance.navigation.type === 1);
    } catch {
      return false;
    }
  }

  function trySaveMsgViewState(state) {
    try {
      if (typeof sessionStorage === 'undefined') return;
      const payload = (state && typeof state === 'object') ? state : {};
      sessionStorage.setItem(MSG_VIEW_STATE_KEY, JSON.stringify(payload));
    } catch {
      /* noop */
    }
  }

  function tryLoadMsgViewState() {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      const raw = sessionStorage.getItem(MSG_VIEW_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  const VIEWS = {
    nova: {
      title: 'Nova mensagem',
      subtitle: ''
    },
    entrada: {
      title: 'Caixa de entrada',
      subtitle: ''
    },
    saida: {
      title: 'Caixa de saída',
      subtitle: ''
    },
    arquivo: {
      title: 'Arquivo',
      subtitle: ''
    },
    lixeira: {
      title: 'Lixeira',
      subtitle: ''
    },
    grupos: {
      title: 'Grupos',
      subtitle: ''
    },
    configuracao: {
      title: 'Configuração',
      subtitle: 'Ajustes da caixa de mensagem.'
    },
    cfg_caixas: {
      title: 'Configurações > Caixas',
      subtitle: ''
    },
    cfg_geral: {
      title: 'Configuração > Geral',
      subtitle: ''
    }
  };

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function getPortalizedMarkerMenuRoot() {
    try {
      if (typeof document === 'undefined') return null;
      const shown = document.querySelector('.dropdown-menu.wdg-msg-dd-portal.show');
      if (shown && shown.querySelector && shown.querySelector('#msgMarkerList')) return shown;
      const all = Array.from(document.querySelectorAll('.dropdown-menu.wdg-msg-dd-portal'));
      return all.find(m => m && m.querySelector && m.querySelector('#msgMarkerList')) || null;
    } catch {
      return null;
    }
  }

  function qsMarker(sel, bodyEl) {
    const inBody = qs(sel, bodyEl);
    if (inBody) return inBody;
    const portalRoot = getPortalizedMarkerMenuRoot();
    if (!portalRoot) return null;
    return qs(sel, portalRoot);
  }

  function ensureFormFieldsHaveIdOrName(root, opts) {
    const host = root || document;
    const prefix = String(opts?.prefix || 'wdgField_');
    const fields = host && host.querySelectorAll ? host.querySelectorAll('input,select,textarea') : [];
    let i = 0;

    Array.from(fields).forEach((el) => {
      try {
        if (!el) return;
        if (el.id || el.name) return;
        if (String(el.tagName || '').toUpperCase() === 'INPUT') {
          const t = String(el.getAttribute('type') || 'text').toLowerCase();
          if (t === 'button' || t === 'submit' || t === 'reset' || t === 'image') return;
        }

        el.name = `${prefix}${i++}`;
        if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
          el.setAttribute('aria-label', 'Campo');
        }
      } catch {
        /* noop */
      }
    });
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function imgIcon(bp, fileName, alt, fallbackBiClass, sizePx) {
    const base = String(bp || '').trim();
    const src = base ? `${base}/images/${String(fileName || '').trim()}` : `/images/${String(fileName || '').trim()}`;
    const size = Number.isFinite(Number(sizePx)) ? Number(sizePx) : 20;
    const fallback = String(fallbackBiClass || '').trim();
    const onerror = fallback
      ? `this.onerror=null;this.outerHTML='&lt;i class=\'${escapeHtml(fallback)}\' aria-hidden=\'true\'&gt;&lt;/i&gt;'`
      : `this.onerror=null;this.style.display='none'`;

    return `
      <img
        class="msg-action-ico"
        src="${escapeHtml(src)}"
        alt="${escapeHtml(alt || '')}"
        aria-hidden="true"
        style="width:${size}px;height:${size}px;object-fit:contain;display:block;margin:0 auto;pointer-events:none;"
        onerror="${onerror}">
    `.trim();
  }

  function inlineImgIcon(bp, fileName, alt, fallbackBiClass, sizePx, extraClass) {
    const base = String(bp || '').trim();
    const src = base ? `${base}/images/${String(fileName || '').trim()}` : `/images/${String(fileName || '').trim()}`;
    const size = Number.isFinite(Number(sizePx)) ? Number(sizePx) : 16;
    const fallback = String(fallbackBiClass || '').trim();
    const cls = String(extraClass || '').trim();
    const onerror = fallback
      ? `this.onerror=null;this.outerHTML='&lt;i class=\'${escapeHtml(fallback)}\' aria-hidden=\'true\'&gt;&lt;/i&gt;'`
      : `this.onerror=null;this.style.display='none'`;

    return `
      <img
        class="${escapeHtml(cls)}"
        src="${escapeHtml(src)}"
        alt="${escapeHtml(alt || '')}"
        aria-hidden="true"
        style="width:${size}px;height:${size}px;object-fit:contain;display:inline-block;vertical-align:-2px;pointer-events:none;"
        onerror="${onerror}">
    `.trim();
  }
  function sanitizeRichHtml(html) {
    // Sanitização mínima (defesa básica) para renderizar HTML salvo.
    // Não é um sanitizador completo, mas remove vetores comuns.
    const h = String(html || '');
    return h
      .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
      .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '');
  }

  function confirmSmallModal(opts) {
    const title = String(opts?.title || 'Confirmar').trim() || 'Confirmar';
    const message = String(opts?.message || '').trim();
    const okText = String(opts?.okText || 'OK').trim() || 'OK';
    const cancelText = String(opts?.cancelText || 'Cancelar').trim() || 'Cancelar';

    // Preferir modal do Bootstrap (UI consistente). Se não existir, cai no confirm nativo.
    const hasBootstrap = typeof window !== 'undefined' && window.bootstrap && typeof window.bootstrap.Modal === 'function';
    if (!hasBootstrap) {
      return Promise.resolve(window.confirm(message || title));
    }

    const MODAL_ID = 'wdgConfirmSmallModal';
    let host = document.getElementById(MODAL_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = MODAL_ID;
      host.className = 'modal fade';
      host.tabIndex = -1;
      host.setAttribute('aria-hidden', 'true');
      host.innerHTML = [
        '<div class="modal-dialog modal-dialog-centered modal-sm">',
        '  <div class="modal-content">',
        '    <div class="modal-header py-2">',
        '      <h6 class="modal-title" data-confirm-title="1"></h6>',
        '      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>',
        '    </div>',
        '    <div class="modal-body py-2">',
        '      <div class="small" data-confirm-message="1"></div>',
        '    </div>',
        '    <div class="modal-footer py-2">',
        '      <button type="button" class="btn btn-sm btn-outline-secondary" data-confirm-cancel="1" data-bs-dismiss="modal"></button>',
        '      <button type="button" class="btn btn-sm btn-danger" data-confirm-ok="1"></button>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('\n');
      document.body.appendChild(host);
    }

    const titleEl = host.querySelector('[data-confirm-title="1"]');
    const msgEl = host.querySelector('[data-confirm-message="1"]');
    const okBtn = host.querySelector('[data-confirm-ok="1"]');
    const cancelBtn = host.querySelector('[data-confirm-cancel="1"]');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (okBtn) okBtn.textContent = okText;
    if (cancelBtn) cancelBtn.textContent = cancelText;

    return new Promise((resolve) => {
      const modal = new window.bootstrap.Modal(host, { backdrop: 'static', keyboard: true });
      let done = false;

      const finish = (val) => {
        if (done) return;
        done = true;
        try { modal.hide(); } catch {}
        resolve(!!val);
      };

      const onOk = (ev) => {
        try { ev.preventDefault(); } catch {}
        finish(true);
      };
      const onHidden = () => {
        // Se fechou sem clicar em OK, considera cancelado.
        finish(false);
      };

      if (okBtn) okBtn.addEventListener('click', onOk, { once: true });
      host.addEventListener('hidden.bs.modal', onHidden, { once: true });

      modal.show();
      try { okBtn?.focus(); } catch {}
    });
  }

  function confirmPermanentDelete() {
    return confirmSmallModal({
      title: 'Excluir definitivamente',
      message: 'Esssa exclusão será definitiva. Deseja mesmo prosseguir?',
      okText: 'Excluir',
      cancelText: 'Cancelar'
    });
  }

  function buildLogoCandidates(rawUrl, basePath) {
    const bp = String(basePath || '').trim();
    const u = String(rawUrl || '').trim();
    if (!u) return [];

    const candidates = [];
    const isAbs = /^https?:\/\//i.test(u) || u.startsWith('data:');
    if (isAbs) {
      candidates.push(u);
      return candidates;
    }

    // como veio
    candidates.push(u);

    // tenta com prefixo do módulo
    if (bp && u.startsWith('/') && !u.startsWith(bp + '/')) {
      candidates.push(bp + u);
    }

    // tenta absolutizar pelo origin
    if (u.startsWith('/')) {
      try { candidates.push(window.location.origin + u); } catch {}
      if (bp && !u.startsWith(bp + '/')) {
        try { candidates.push(window.location.origin + bp + u); } catch {}
      }
    }

    // remove duplicados / vazios
    return candidates
      .map(x => String(x || '').trim())
      .filter(Boolean)
      .filter((x, i, arr) => arr.indexOf(x) === i);
  }

  async function resolvePrintLogoCandidates(basePath) {
    const ctx = getCtx();
    const bp = String(basePath || '').trim();

    const wdLogo = bp ? `${bp}/images/logoWDGestor.png` : '/images/logoWDGestor.png';

    // Preferir a logo já resolvida no HTML do Portal (mais confiável que /api/unidades).
    const headerLogo = String(ctx?.headerLogoUrl || '').trim();
    if (headerLogo) {
      const cands = buildLogoCandidates(headerLogo, bp);
      if (cands.length) return cands;
    }

    // Se master/admin: usar a unidade WD Gestor (M0001)
    const isPriv = isMasterOrAdmin(ctx?.role);

    // Sem unidade vinculada => WD Gestor
    const unitId = String(ctx?.unitId || '').trim();
    if (!unitId && !isPriv) return buildLogoCandidates(wdLogo, bp);

    // Tenta obter logo da unidade (ou M0001 para master/admin)
    try {
      const unidades = await fetchUnidadesList(bp);
      const list = Array.isArray(unidades) ? unidades : [];
      const norm = (s) => String(s || '').trim().toLowerCase();
      const match = (
        (isPriv ? list.find(u => norm(u?.codigo) === 'm0001') : null)
        || (unitId ? list.find(u => {
          const id = String(u?._id || u?.id || u?.unidade_id || u?.unidadeId || '').trim();
          return id && id === unitId;
        }) : null)
      ) || null;
      const rawLogo = String(match?.logo || match?.logo_url || match?.logoUrl || match?.logo_unidade || match?.logoUnidade || match?.headerLogo || match?.header_logo || '').trim();
      if (rawLogo) {
        const cands = buildLogoCandidates(rawLogo, bp);
        if (cands.length) return cands;
      }
    } catch {}

    return buildLogoCandidates(wdLogo, bp);
  }

  function buildPrintDocumentHtml(opts) {
    const title = String(opts?.title || 'Imprimir').trim();
    const headerLeft = String(opts?.headerLeft || '').trim();
    const headerCenter = String(opts?.headerCenter || '').trim();
    const headerRight = String(opts?.headerRight || '').trim();
    const headerKicker = String(opts?.headerKicker || '').trim();
    const headerSubject = String(opts?.headerSubject || '').trim();
    const orgName = String(opts?.orgName || '').trim();
    const orgLines = Array.isArray(opts?.orgLines) ? opts.orgLines.map(s => String(s || '').trim()).filter(Boolean) : [];
    const logoCandidates = Array.isArray(opts?.logoCandidates) ? opts.logoCandidates : [];
    const contentHtml = String(opts?.contentHtml || '').trim();
    const footerHtml = String(opts?.footerHtml || '').trim();

    const hasTopbar = !!(headerLeft || headerCenter || headerRight);

    // Observação: não dependemos de assets externos aqui para não quebrar a impressão.
    return [
      '<!doctype html>',
      '<html lang="pt-br">',
      '<head>',
      '  <meta charset="utf-8">',
      `  <title>${escapeHtml(title)}</title>`,
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <style>',
      '    :root{ --fg:#111; --muted:#666; --line:#e5e7eb; }',
      '    html,body{ margin:0; padding:0; }',
      '    body{ font-family: Arial, Helvetica, sans-serif; color: var(--fg); background:#fff; }',
      '    .page{ max-width: 900px; margin: 0 auto; padding: 18px 18px 28px; }',
      '    .topbar{ display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; color: var(--muted); }',
      '    .topbar .left{ flex:1; min-width:0; white-space:nowrap; }',
      '    .topbar .center{ flex:1; text-align:center; font-weight:700; color: var(--fg); }',
      '    .topbar .right{ min-width:180px; text-align:right; }',
      '    .hdr{ display:flex; flex-direction:column; align-items:center; gap: 6px; margin-top: 10px; }',
      '    .logo{ width:180px; }',
      '    .logo img{ width:180px; height:64px; object-fit:contain; display:block; margin: 0 auto; }',
      '    .org-name{ font-size: 18px; font-weight: 800; text-align:center; margin: 0; }',
      '    .org-line{ font-size: 12px; color: var(--muted); text-align:center; margin: 0; }',
      '    .hdr-main{ width: 100%; }',
      '    .hdr-kicker{ font-size: 22px; font-weight: 900; line-height: 1.1; margin: 6px 0 0; text-align:center; }',
      '    .hdr-subject{ font-size: 18px; font-weight: 800; margin: 0; word-break: break-word; }',
      '    .msg-card{ border:1px solid var(--line); border-radius: 10px; padding: 14px 14px 12px; }',
      '    .msg-card + .msg-card{ margin-top: 12px; }',
      '    .msg-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }',
      '    .sender{ display:flex; align-items:center; gap:10px; min-width:0; }',
      '    .sender img{ width:36px; height:36px; border-radius:999px; object-fit:cover; }',
      '    .sender-name{ font-weight:700; word-break:break-word; }',
      '    .msg-meta{ text-align:right; font-size:13px; }',
      '    .two-cols{ display:flex; align-items:flex-start; gap:12px; margin-top: 10px; }',
      '    .two-cols .left{ flex:1; min-width:0; }',
      '    .label{ color: var(--muted); }',
      '    .kv{ font-size: 13px; }',
      '    .body{ margin-top: 10px; }',
      '    .muted{ color: var(--muted); }',
      '    hr{ border:0; border-top: 1px solid var(--line); margin: 12px 0 14px; }',
      '    /* Esconde controles interativos do viewer */',
      '    button, .btn, [role="button"], .dropdown, .dropdown-menu { display:none !important; }',
      '    [data-inline-prompt="1"], #msgInlineComposerSlot, #msgInlineComposerSlotBottom { display:none !important; }',
      '    [data-msg-action], [data-att-action] { display:none !important; }',
      '    /* Evita quebras ruins */',
      '    img{ max-width:100%; }',
      '    .card{ border:1px solid var(--line); border-radius: 8px; }',
      '    .card-body{ padding: 12px 14px; }',
      '    .print-footer{ display:none; }',
      '    .print-footer .left{ color: var(--muted); }',
      '    .print-footer .right{ color: var(--muted); }',
      '    .wdgPageNo:before{ content: counter(page); }',
      '    .hasPrintCounters .wdgPageNo > span{ display:none; }',
      '    .noPrintCounters .wdgPageNo:before{ content: ""; }',
      '    @media print{',
      '      @page{ margin: 14mm 12mm 16mm; }',
      '      .page{ max-width: none; padding: 0; }',
      '      a[href]:after{ content:""; }',
      '      .print-footer{',
      '        display:flex;',
      '        position: fixed;',
      '        left: 0;',
      '        right: 0;',
      '        bottom: 0;',
      '        border-top: 1px solid var(--line);',
      '        padding: 6px 0;',
      '        font-size: 12px;',
      '      }',
      '      .print-footer .wrap{',
      '        max-width: 900px;',
      '        margin: 0 auto;',
      '        padding: 0 18px;',
      '        width: 100%;',
      '        display:flex;',
      '        justify-content: space-between;',
      '        gap: 12px;',
      '      }',
      '    }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div class="page">',
      (hasTopbar ? '    <div class="topbar">' : ''),
      (hasTopbar && headerLeft ? `      <div class="left">${escapeHtml(headerLeft)}</div>` : ''),
      (hasTopbar && headerCenter ? `      <div class="center">${escapeHtml(headerCenter)}</div>` : ''),
      (hasTopbar && headerRight ? `      <div class="right">${escapeHtml(headerRight)}</div>` : ''),
      (hasTopbar ? '    </div>' : ''),
      '    <div class="hdr">',
      '      <div class="logo">',
      '        <img id="wdgPrintLogo" alt="Logo" />',
      '      </div>',
      (orgName ? `      <div class="org-name">${escapeHtml(orgName)}</div>` : ''),
      (orgLines.length ? orgLines.map(l => `      <div class="org-line">${escapeHtml(l)}</div>`).join('\n') : ''),
      '      <div class="hdr-main">',
      `        <div class="hdr-kicker">${escapeHtml(headerKicker || 'Caixa de mensagem')}</div>`,
      (headerSubject ? `        <div class="hdr-subject">${escapeHtml(headerSubject)}</div>` : ''),
      '      </div>',
      '    </div>',
      '    <hr>',
      `    <div id="wdgPrintContent">${contentHtml}</div>`,
      '  </div>',

      '  <script>',
      '    (function(){',
      '      var img = document.getElementById("wdgPrintLogo");',
      `      var cands = ${JSON.stringify(logoCandidates)};`,
      '      if(!img) return;',
      '      function tryNext(i){',
      '        if(i>=cands.length) return;',
      '        img.onload = function(){};',
      '        img.onerror = function(){ tryNext(i+1); };',
      '        img.src = cands[i];',
      '      }',
      '      tryNext(0);',
      '      try {',
      '        function detectPrintCounters(){',
      '          try {',
      '            var el = document.querySelector(".wdgPageNo");',
      '            if (!el || !window.getComputedStyle) return;',
      '            var raw = window.getComputedStyle(el, "::before").content || "";',
      '            var norm = String(raw).replace(/\"/g, "").trim().toLowerCase();',
      '            var ok = !!norm && norm !== "none" && norm !== "normal" && norm !== "0";',
      '            document.documentElement.classList.toggle("hasPrintCounters", ok);',
      '            document.documentElement.classList.toggle("noPrintCounters", !ok);',
      '          } catch(e) {}',
      '        }',
      '        window.addEventListener("beforeprint", function(){ setTimeout(detectPrintCounters, 0); });',
      '        try {',
      '          var m = window.matchMedia ? window.matchMedia("print") : null;',
      '          if (m) {',
      '            var onChange = function(ev){ if (ev && ev.matches) setTimeout(detectPrintCounters, 0); };',
      '            if (m.addEventListener) m.addEventListener("change", onChange);',
      '            else if (m.addListener) m.addListener(onChange);',
      '          }',
      '        } catch(e) {}',
      '      } catch(e) {}',
      '    })();',
      '  </script>',
      '</body>',
      '</html>'
    ].join('\n');
  }

  function ensureMsgDropdownOverlayFix() {
    try {
      if (typeof document === 'undefined') return;
      if (!document.head) return;
      if (document.getElementById('wdgMsgDropdownOverlayFix')) return;
      // Problema comum: dropdown do Bootstrap ficar "atrás" de cards/containers por stacking context.
      // Aqui forçamos z-index alto apenas dentro do módulo de mensagens.
      const style = document.createElement('style');
      style.id = 'wdgMsgDropdownOverlayFix';
      style.textContent = [
        '#msgBody .dropdown-menu{ z-index: 2500 !important; }',
        '#msgBody .dropdown-menu.show{ z-index: 2500 !important; }',
        '#msgBody .dropdown, #msgBody .btn-group{ position: relative; z-index: 2501; }',
        // Evita que algum wrapper com overflow esconda o menu (best-effort).
        '#msgBody{ overflow: visible; }',
        '',
        // Paleta de cores: manter 9 cores por linha (estável mesmo com menu portalizado).
        '#msgBody [data-marker-color-palette="1"], .dropdown-menu.wdg-msg-dd-portal [data-marker-color-palette="1"]{',
        '  display: grid !important;',
        '  grid-template-columns: repeat(9, 22px);',
        '  gap: 8px;',
        '}',
        '#msgBody [data-marker-color-palette="1"] > button, .dropdown-menu.wdg-msg-dd-portal [data-marker-color-palette="1"] > button{',
        '  width: 22px !important;',
        '  height: 22px !important;',
        '}',
        '#msgBody [data-marker-color-palette="1"] > button{ margin: 0 !important; }',
        '.dropdown-menu.wdg-msg-dd-portal [data-marker-color-palette="1"] > button{ margin: 0 !important; }'
      ].join('\n');
      document.head.appendChild(style);
    } catch {
      /* noop */
    }
  }

  function ensureMsgMarkerDropdownPortalFix() {
    try {
      if (typeof document === 'undefined') return;
      if (document.__wdgMsgMarkerDropdownPortalFixBound) return;
      document.__wdgMsgMarkerDropdownPortalFixBound = true;

      const stateByMenu = new WeakMap();
      let activeToggle = null;
      let activeMenu = null;

      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

      const computeAndApplyPosition = (toggle, menu) => {
        try {
          if (!toggle || !menu) return;
          if (!document.body.contains(menu)) return;
          const r = toggle.getBoundingClientRect();
          const vw = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 1024);
          const vh = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 768);

          // Garante que conseguimos medir o menu
          const prevVis = menu.style.visibility;
          const prevDisp = menu.style.display;
          if (!menu.classList.contains('show')) menu.classList.add('show');
          menu.style.visibility = 'hidden';
          menu.style.display = 'block';
          menu.style.position = 'fixed';
          menu.style.zIndex = '4000';
          menu.style.transform = 'none';
          menu.style.inset = 'auto';

          const mr = menu.getBoundingClientRect();
          const mw = mr.width || 280;
          const mh = mr.height || 200;

          const pad = 8;
          const gap = 6;

          const alignEnd = menu.classList.contains('dropdown-menu-end');
          let left = alignEnd ? (r.right - mw) : r.left;
          left = clamp(left, pad, vw - mw - pad);

          // Preferir abaixo; se não couber, abre acima.
          const belowTop = r.bottom + gap;
          const aboveTop = r.top - mh - gap;
          let top = belowTop;
          if (belowTop + mh + pad > vh && aboveTop >= pad) top = aboveTop;
          top = clamp(top, pad, vh - mh - pad);

          menu.style.left = `${Math.round(left)}px`;
          menu.style.top = `${Math.round(top)}px`;

          // Restaura visibilidade e display para não "travar" visibilidade via style inline.
          // O Bootstrap controla visibilidade via classe `.show`.
          menu.style.visibility = prevVis || '';
          menu.style.display = prevDisp || '';
        } catch {
          /* noop */
        }
      };

      const portalize = (toggle) => {
        try {
          const dd = toggle?.closest?.('.dropdown');
          const menu = dd ? dd.querySelector?.('.dropdown-menu') : null;
          if (!dd || !menu) return;

          // Só para o dropdown de Marcador (tem #msgMarkerList dentro)
          const isMarker = !!menu.querySelector?.('#msgMarkerList') || !!menu.querySelector?.('#msgMarkerCreateBlock') || !!menu.querySelector?.('#msgNewMarkerName');
          if (!isMarker) return;

          if (stateByMenu.has(menu)) return;
          stateByMenu.set(menu, {
            parent: dd,
            nextSibling: menu.nextSibling || null,
            onScroll: null,
            onResize: null
          });

          // Move para o body para escapar de stacking/overflow do container.
          document.body.appendChild(menu);
          menu.classList.add('wdg-msg-dd-portal');

          activeToggle = toggle;
          activeMenu = menu;

          const apply = () => computeAndApplyPosition(toggle, menu);
          // Aplica agora e no próximo frame (bootstrap/popper pode mexer depois do evento)
          apply();
          try { window.requestAnimationFrame(apply); } catch { /* noop */ }

          const st = stateByMenu.get(menu);
          st.onScroll = () => apply();
          st.onResize = () => apply();
          window.addEventListener('scroll', st.onScroll, { passive: true });
          window.addEventListener('resize', st.onResize);
        } catch {
          /* noop */
        }
      };

      const restore = (toggle) => {
        try {
          const dd = toggle?.closest?.('.dropdown');
          const menu = dd ? dd.querySelector?.('.dropdown-menu') : null;

          // Se o menu foi portalizado, ele não está mais dentro do dd.
          // Então tentamos localizar pelo estado salvo.
          let foundMenu = null;
          if (menu && stateByMenu.has(menu)) foundMenu = menu;
          if (!foundMenu) {
            // Procura algum menu portalizado relacionado (heurística: marcador)
            const all = Array.from(document.querySelectorAll('.dropdown-menu.wdg-msg-dd-portal'));
            foundMenu = all.find(m => stateByMenu.has(m)) || null;
          }
          if (!foundMenu) return;

          const st = stateByMenu.get(foundMenu);
          if (!st) return;

          try { window.removeEventListener('scroll', st.onScroll); } catch {}
          try { window.removeEventListener('resize', st.onResize); } catch {}

          foundMenu.classList.remove('wdg-msg-dd-portal');
          // Ao restaurar após hidden, garanta que não fique visualmente aberto.
          try { foundMenu.classList.remove('show'); } catch {}
          foundMenu.style.position = '';
          foundMenu.style.zIndex = '';
          foundMenu.style.left = '';
          foundMenu.style.top = '';
          foundMenu.style.transform = '';
          foundMenu.style.inset = '';
          foundMenu.style.display = '';
          foundMenu.style.visibility = '';

          // Restaura para o dropdown original
          if (st.parent && st.parent.isConnected) {
            if (st.nextSibling && st.nextSibling.parentNode === st.parent) st.parent.insertBefore(foundMenu, st.nextSibling);
            else st.parent.appendChild(foundMenu);
          }

          stateByMenu.delete(foundMenu);

          if (activeMenu === foundMenu) activeMenu = null;
          if (activeToggle === toggle) activeToggle = null;
        } catch {
          /* noop */
        }
      };

      const forceHideActive = () => {
        try {
          if (!activeToggle) return false;
          // Preferir API do Bootstrap (fecha e dispara eventos)
          if (window.bootstrap && window.bootstrap.Dropdown) {
            const inst = window.bootstrap.Dropdown.getInstance(activeToggle) || new window.bootstrap.Dropdown(activeToggle);
            inst.hide();

            // Quando o menu foi portalizado, o Bootstrap pode não conseguir limpar o `.show`/display.
            // Fazemos um cleanup best-effort para garantir que o clique fora feche de verdade.
            try {
              const toggleRef = activeToggle;
              const menuRef = activeMenu;
              setTimeout(() => {
                try {
                  if (!toggleRef || !menuRef) return;
                  // Se ainda está visível/portalizado, force fechar.
                  const stillInBody = document.body.contains(menuRef) && menuRef.classList.contains('wdg-msg-dd-portal');
                  const stillShown = menuRef.classList.contains('show') || String(menuRef.style.display || '').toLowerCase() === 'block';
                  if (stillInBody || stillShown) {
                    try { menuRef.classList.remove('show'); } catch {}
                    try { toggleRef.classList.remove('show'); } catch {}
                    try { toggleRef.setAttribute('aria-expanded', 'false'); } catch {}
                    restore(toggleRef);
                  }
                } catch { /* noop */ }
              }, 0);
            } catch { /* noop */ }
            return true;
          }

          // Fallback (sem bootstrap): remove show e restaura DOM.
          try { activeToggle.setAttribute('aria-expanded', 'false'); } catch {}
          const menu = activeMenu;
          if (menu) {
            try { menu.classList.remove('show'); } catch {}
            try { activeToggle.classList.remove('show'); } catch {}
            restore(activeToggle);
          }
          return true;
        } catch {
          return false;
        }
      };

      // Expor um hook global para outras rotinas (ex.: troca de view)
      try {
        window.__wdgMsgForceCloseDropdowns = () => {
          try { forceHideActive(); } catch {}
          // Fecha quaisquer outros dropdowns abertos dentro do módulo.
          try {
            const root = document.getElementById('msgBody') || document.body;
            const toggles = Array.from(root.querySelectorAll('[data-bs-toggle="dropdown"]'));
            toggles.forEach((t) => {
              try {
                if (t === activeToggle) return;
                if (window.bootstrap && window.bootstrap.Dropdown) {
                  const inst = window.bootstrap.Dropdown.getInstance(t);
                  if (inst) inst.hide();
                }
              } catch { /* noop */ }
            });
          } catch { /* noop */ }
        };
      } catch { /* noop */ }

      // Clique fora deve fechar (portalização pode impedir o autoClose do Bootstrap).
      document.addEventListener('mousedown', (ev) => {
        try {
          if (!activeToggle || !activeMenu) return;
          const t = ev?.target;
          if (!t) return;
          // Clique no toggle ou no menu: não fecha.
          if (activeToggle.contains(t)) return;
          if (activeMenu.contains(t)) return;
          forceHideActive();
        } catch { /* noop */ }
      }, true);

      document.addEventListener('shown.bs.dropdown', (ev) => {
        const toggle = ev?.target;
        if (!toggle) return;
        portalize(toggle);
      });

      document.addEventListener('hidden.bs.dropdown', (ev) => {
        const toggle = ev?.target;
        if (!toggle) return;
        restore(toggle);
      });
    } catch {
      /* noop */
    }
  }

  function fmtPrintDateTime(dt) {
    try {
      if (!dt) return '';
      const d = new Date(dt);
      if (isNaN(d)) return '';
      const date = d.toLocaleDateString('pt-BR');
      const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${date}, ${time}`;
    } catch {
      return '';
    }
  }

  function fmtPrintDate(dt) {
    try {
      if (!dt) return '';
      const d = new Date(dt);
      if (isNaN(d)) return '';
      return d.toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  }

  function fmtPrintTime(dt) {
    try {
      if (!dt) return '';
      const d = new Date(dt);
      if (isNaN(d)) return '';
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function fmtPrintDateTimeFull(dt) {
    try {
      if (!dt) return '';
      const d = new Date(dt);
      if (isNaN(d)) return '';
      const date = d.toLocaleDateString('pt-BR');
      const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `${date} ${time}`;
    } catch {
      return '';
    }
  }

  function getHistoryPrintKicker() {
    return 'CAIXA DE MENSAGEM - HISTÓRICO DE ACESSOS';
  }

  function getHistoryPrintTopbarCenter(basePath) {
    try {
      const labelRaw = String(getPrintModuleLabelFromUi() || '').trim();
      if (labelRaw) return `WD Gestor - ${labelRaw}`;
    } catch {
      /* noop */
    }
    const bp = String(basePath || '').toLowerCase();
    if (bp.includes('portal-morador') || bp.includes('portal_morador')) return 'WD Gestor - Portal do morador';
    if (bp.includes('condominios')) return 'WD Gestor - Gestão de condomínio';
    return 'WD Gestor - Módulo';
  }

  function getFromLabelForPrint(m) {
    const msg = m || {};
    const fromMailboxId = String(msg?.from?.mailboxId || '').trim();
    const fromMailboxName = String(msg?.from?.mailboxName || '').trim() || fromMailboxId;
    const fromOwner = String(msg?.from?.owner || '').trim();
    const fromCreatedBy = String(msg?.from?.createdBy || '').trim();
    const senderUserLabel = String(fromCreatedBy || fromOwner || '').trim();
    if (fromMailboxId && fromMailboxId !== 'pessoal') {
      return `${String(fromMailboxName || 'Caixa').trim()}${senderUserLabel ? ` (${senderUserLabel})` : ''}`;
    }
    return String(fromCreatedBy || msg?.from?.display || fromOwner || 'Remetente').trim();
  }

  function buildHistoryPrintContentHtml(baseMsg, basePath, usersByEmail) {
    const m = baseMsg || {};
    const bp = String(basePath || '').trim();

    const protocolo = String(m?.protocolo || '').trim();
    const dataTxt = fmtPrintDateTimeFull(m?.createdAt);
    const assunto = String(m?.assunto || '').trim() || '-';
    const deTxt = getFromLabelForPrint(m) || '-';

    const toList = (Array.isArray(m?.to) ? m.to : [])
      .map(x => String(x?.display || x?.name || x?.nome || x?.email || x?.mailboxName || x?.mailboxId || '').trim())
      .filter(Boolean);
    const paraTxt = toList.length ? toList.join(' ; ') : '-';

    // Mapa de mailboxId -> label a partir do Para/Cópia
    const mailboxLabel = new Map();
    const allTo = [...(Array.isArray(m?.to) ? m.to : []), ...(Array.isArray(m?.cc) ? m.cc : [])];
    allTo.forEach(x => {
      const id = String(x?.mailboxId || x?.mailbox_id || x?.id || '').trim();
      const label = String(x?.display || x?.mailboxName || x?.name || x?.nome || '').trim();
      if (id && label && !mailboxLabel.has(id)) mailboxLabel.set(id, label);
    });

    function accessEmail(a) {
      const owner = String(a?.owner || '').trim();
      const user = String(a?.user || '').trim();
      if (owner && owner.includes('@')) return owner;
      if (user && user.includes('@')) return user;
      return owner || user;
    }

    const acessos = Array.isArray(m?.acessos) ? m.acessos : [];
    const agg = new Map();
    acessos.forEach(a => {
      const mailboxId = String(a?.mailbox_id || a?.mailboxId || '').trim();
      const emailOrId = accessEmail(a);
      const key = mailboxId || normalizeEmailKey(emailOrId) || String(emailOrId || '').trim();
      if (!key) return;
      const at = new Date(a?.at || 0).getTime();
      if (!at) return;
      const cur = agg.get(key) || { key, mailboxId, emailOrId, first: at, last: at, count: 0 };
      cur.first = Math.min(cur.first, at);
      cur.last = Math.max(cur.last, at);
      cur.count++;
      agg.set(key, cur);
    });

    const accessRows = Array.from(agg.values())
      .sort((a, b) => a.first - b.first)
      .map(r => {
        let dest = '';
        if (r.mailboxId && mailboxLabel.has(r.mailboxId)) dest = mailboxLabel.get(r.mailboxId);
        if (!dest) {
          const emKey = normalizeEmailKey(r.emailOrId);
          const u = (emKey && usersByEmail && usersByEmail.get) ? usersByEmail.get(emKey) : null;
          dest = String(u?.nome || '').trim() || String(r.emailOrId || r.mailboxId || r.key || '').trim();
        }
        const firstTxt = fmtPrintDateTimeFull(new Date(r.first));
        const lastTxt = fmtPrintDateTimeFull(new Date(r.last));
        const countTxt = String(r.count || 0);
        return [
          '<tr>',
          `  <td style="padding:8px 10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(dest || '-') }</td>`,
          `  <td style="padding:8px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">${escapeHtml(countTxt) }</td>`,
          `  <td style="padding:8px 10px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${escapeHtml(firstTxt || '-') }</td>`,
          `  <td style="padding:8px 10px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">${escapeHtml(lastTxt || '-') }</td>`,
          '</tr>'
        ].join('\n');
      }).join('\n');

    const acessosHtml = accessRows
      ? [
          '<table style="width:100%; border-collapse:collapse; border:1px solid #e5e7eb; font-size:13px;">',
          '  <thead>',
          '    <tr>',
          '      <th style="text-align:center; padding:8px 10px; border-bottom:1px solid #e5e7eb;">Destinatário</th>',
          '      <th style="text-align:center; padding:8px 10px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">Qtd. acessos</th>',
          '      <th style="text-align:center; padding:8px 10px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">Primeiro acesso</th>',
          '      <th style="text-align:center; padding:8px 10px; border-bottom:1px solid #e5e7eb; white-space:nowrap;">Último acesso</th>',
          '    </tr>',
          '  </thead>',
          '  <tbody>',
          accessRows,
          '  </tbody>',
          '</table>'
        ].join('\n')
      : '<div class="muted">(sem acessos)</div>';

    // Bloco de dados no topo (estilo formulário)
    const fieldRow = (label, valueHtml) => [
      '<div style="display:flex; gap:10px; padding:3px 0;">',
      `  <div style="width:90px; font-weight:700;">${escapeHtml(label)}</div>`,
      `  <div style="flex:1; min-width:0;">${valueHtml}</div>`,
      '</div>'
    ].join('\n');

    return [
      '<div style="border:1px solid #e5e7eb; border-radius:10px; padding:12px 14px;">',
      fieldRow('Protocolo', escapeHtml(protocolo || '-')),
      fieldRow('Data', escapeHtml(dataTxt || '-')),
      fieldRow('Assunto', `<strong>${escapeHtml(assunto)}</strong>`),
      fieldRow('De', escapeHtml(deTxt || '-')),
      fieldRow('Para', escapeHtml(paraTxt || '-')),
      '</div>',
      '<div style="height:12px;"></div>',
      '<div style="font-weight:800; margin: 4px 0 8px; text-align:center;">Acessos</div>',
      acessosHtml
    ].join('\n');
  }

  function getPrintModuleLabelFromUi() {
    // Esperado: navbar-shared.ejs renderiza: <span class="center-chip">Módulo <%= moduleLabel %></span>
    try {
      const el = document.querySelector('.center-chip');
      const raw = String(el?.textContent || '').trim();
      if (!raw) return '';
      return raw.replace(/^m[oó]dulo\s+/i, '').trim();
    } catch {
      return '';
    }
  }

  function getPrintHeaderCenterText(fallback) {
    const label = getPrintModuleLabelFromUi();
    if (label) return `WD Gestor - ${label}`;
    return String(fallback || 'WD Gestor').trim();
  }

  function buildPrintMessageBlockHtml(msg, basePath) {
    const m = msg || {};
    const bp = String(basePath || '').trim();
    const fromMailboxId = String(m?.from?.mailboxId || '').trim();
    const fromMailboxName = String(m?.from?.mailboxName || '').trim() || fromMailboxId;
    const fromOwner = String(m?.from?.owner || '').trim();
    const fromEmail = String(m?.from?.email || '').trim();
    const fromCreatedBy = String(m?.from?.createdBy || '').trim();

    const senderUserLabel = String(fromCreatedBy || fromOwner || '').trim();
    const senderLabel = (fromMailboxId && fromMailboxId !== 'pessoal')
      ? `${String(fromMailboxName || 'Caixa').trim()}${senderUserLabel ? ` (${senderUserLabel})` : ''}`
      : String(fromCreatedBy || m?.from?.display || fromOwner || 'Remetente').trim();

    const ctx = getCtx();
    const { src: avatar, fallback: avatarFallback } = resolveSenderAvatarForMessage(m, bp, ctx);

    const protocolo = String(m?.protocolo || '').trim();
    const when = fmtPrintDateTime(m?.createdAt);

    const paraTxt = (Array.isArray(m?.to) ? m.to : [])
      .map(x => String(x?.display || x?.name || x?.nome || x?.email || '').trim())
      .filter(Boolean)
      .join(', ');

    const ccTxt = (Array.isArray(m?.cc) ? m.cc : [])
      .map(x => String(x?.display || x?.name || x?.nome || x?.email || '').trim())
      .filter(Boolean)
      .join(', ');

    const bodyHtmlRaw = String(m?.bodyHtml || '').trim();
    const bodyTxtRaw = String(m?.bodyText || '').trim();
    const bodyHtml = bodyHtmlRaw
      ? sanitizeRichHtml(bodyHtmlRaw)
      : (bodyTxtRaw ? escapeHtml(bodyTxtRaw).replace(/\r?\n/g, '<br>') : '');

    const anexos = Array.isArray(m?.anexos) ? m.anexos : [];
    const anexosLines = anexos
      .map(a => {
        const nome = String(a?.nome || '').trim();
        const mime = String(a?.mime || '').trim();
        const tam = Number(a?.tamanho) || 0;
        const kb = 1024;
        const mb = kb * 1024;
        const sizeTxt = !tam ? '' : (tam >= mb ? `${(tam / mb).toFixed(1).replace(/\.0$/, '')} MB` : `${Math.round(tam / kb)} KB`);
        const right = [mime, sizeTxt].filter(Boolean).join(' - ');
        if (!nome) return '';
        return right ? `${nome} — ${right}` : nome;
      })
      .filter(Boolean);

    const anexosHtml = anexosLines.length
      ? [
        '<div style="margin-top:10px;">',
        '  <div class="kv" style="font-weight:800;">Anexos</div>',
        '  <div class="kv" style="margin-top:6px;">' + anexosLines.map(l => `• ${escapeHtml(l)}`).join('<br>') + '</div>',
        '</div>'
      ].join('\n')
      : '';

    return [
      '<div class="msg-card">',
      '  <div class="msg-top">',
      '    <div class="sender">',
      `      <img src="${escapeHtml(avatar)}" alt="" onerror="this.onerror=null;this.src='${escapeHtml(avatarFallback)}'">`,
      '      <div class="sender-name">' + escapeHtml(senderLabel) + '</div>',
      '    </div>',
      '    <div class="msg-meta">',
      `      <div class="kv">${escapeHtml(when || '')}</div>`,
      `      <div class="kv" style="margin-top:6px;">${protocolo ? `Protocolo: ${escapeHtml(protocolo)}` : ''}</div>`,
      '    </div>',
      '  </div>',
      '  <div class="two-cols">',
      '    <div class="left">',
      `      <div class="kv"><span class="label">Para:</span> ${escapeHtml(paraTxt || '-')}</div>`,
      (ccTxt ? `      <div class="kv" style="margin-top:6px;"><span class="label">Cópia:</span> ${escapeHtml(ccTxt)}</div>` : ''),
      '    </div>',
      '  </div>',
      '  <hr>',
      `  <div class="body">${bodyHtml || '<span class="muted">(sem conteúdo)</span>'}</div>`,
      anexosHtml,
      '</div>'
    ].join('\n');
  }

  function buildPrintThreadBlocksHtml(detail, item, basePath, order) {
    const listRaw = Array.isArray(detail?.thread) ? detail.thread : [];
    const thread = listRaw.length ? listRaw : [item];
    const list = (String(order || 'normal') === 'reverse') ? [...thread].reverse() : thread;

    // Evita duplicados por segurança
    const out = [];
    const seen = new Set();
    for (const m of (Array.isArray(list) ? list : [])) {
      const id = String(m?.id || m?._id || '').trim();
      const key = id || JSON.stringify([m?.createdAt, m?.protocolo, m?.assunto].map(x => String(x || '').trim()));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(buildPrintMessageBlockHtml(m, basePath));
    }
    return out.join('\n');
  }

  async function openPrintDialog(basePath, opts) {
    const bp = String(basePath || '').trim();
    const title = String(opts?.title || 'Imprimir').trim();
    const contentHtml = String(opts?.contentHtml || '');

    try {
      const logoCandidates = await resolvePrintLogoCandidates(bp);
      const html = buildPrintDocumentHtml({
        title,
        headerLeft: String(opts?.headerLeft || '').trim(),
        headerCenter: String(opts?.headerCenter || '').trim(),
        headerRight: String(opts?.headerRight || '').trim(),
        headerKicker: String(opts?.headerKicker || '').trim(),
        headerSubject: String(opts?.headerSubject || '').trim(),
        orgName: String(opts?.orgName || '').trim(),
        orgLines: Array.isArray(opts?.orgLines) ? opts.orgLines : [],
        footerHtml: String(opts?.footerHtml || '').trim(),
        logoCandidates,
        contentHtml
      });
      let frame = null;
      try {
        frame = document.getElementById('wdgMsgPrintHiddenFrame');
        if (!frame) {
          frame = document.createElement('iframe');
          frame.id = 'wdgMsgPrintHiddenFrame';
          frame.title = 'Impressão';
          frame.style.position = 'fixed';
          frame.style.right = '0';
          frame.style.bottom = '0';
          frame.style.width = '0';
          frame.style.height = '0';
          frame.style.border = '0';
          frame.style.opacity = '0';
          frame.style.pointerEvents = 'none';
          document.body.appendChild(frame);
        }
      } catch {
        try { window.print(); } catch {}
        return;
      }

      const token = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      frame.__wdgPrintToken = token;

      let didPrint = false;
      let loopStarted = false;
      let retryTimer = null;
      let fallbackTimer = null;

      const doPrint = () => {
        try {
          if (frame.__wdgPrintToken !== token) return;
          if (didPrint) return;
          if (loopStarted) return;
          loopStarted = true;
          try { if (fallbackTimer) clearTimeout(fallbackTimer); } catch {}

          const w = frame.contentWindow;
          if (!w) throw new Error('no_window');

          const tryPrintWhenReady = (deadlineAt) => {
            try {
              if (frame.__wdgPrintToken !== token) return;
              if (didPrint) return;
              const doc = w.document;
              const imgs = Array.from(doc?.images || []);
              const allOk = imgs.every(img => {
                try {
                  if (!img) return true;
                  if (img.complete && img.naturalWidth > 0) return true;
                  // Se falhou (naturalWidth 0), não bloqueie a impressão.
                  if (img.complete) return true;
                  return false;
                } catch {
                  return true;
                }
              });

              const now = Date.now();
              if (allOk || now >= deadlineAt) {
                didPrint = true;
                try { if (retryTimer) clearTimeout(retryTimer); } catch {}
                try { w.focus(); } catch {}
                try { w.print(); } catch {}
                return;
              }
              try { if (retryTimer) clearTimeout(retryTimer); } catch {}
              retryTimer = setTimeout(() => tryPrintWhenReady(deadlineAt), 120);
            } catch {
              didPrint = true;
              try { if (retryTimer) clearTimeout(retryTimer); } catch {}
              try { w.focus(); } catch {}
              try { w.print(); } catch {}
            }
          };

          // Aguarda até ~2s para imagens (avatar/logo) carregarem.
          tryPrintWhenReady(Date.now() + 2000);
        } catch {
          try { window.print(); } catch {}
        }
      };

      // Registra antes de carregar
      frame.onload = () => doPrint();
      try { frame.srcdoc = html; } catch {}

      // Fallback: alguns browsers podem não disparar onload com srcdoc
      fallbackTimer = setTimeout(() => doPrint(), 450);
    } catch {
      try { window.print(); } catch {}
    }
  }

  function getCtx() {
    const body = document.body;
    const userName = body?.dataset?.userName || 'Usuário';
    const userEmail = body?.dataset?.userEmail || '';
    const role = body?.dataset?.userRole || '';
    const unitId = body?.dataset?.userUnitId || body?.dataset?.unidadeId || '';
    const unitName = body?.dataset?.userUnitName || body?.dataset?.unidadeName || '';
    const headerLogoUrl = body?.dataset?.headerLogoUrl || '';
    return { userName, userEmail, role, unitId, unitName, headerLogoUrl };
  }

  function isMasterOrAdmin(role) {
    const r = String(role || '').toLowerCase();
    return r === 'master' || r === 'admin';
  }

  function normalizeId(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_.:]/g, '')
      .slice(0, 60);
  }

  function safeJsonParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeEmailKey(email) {
    return String(email || '').trim().toLowerCase();
  }

  const MAILBOX_SYNC = {
    cacheAt: 0,
    inflight: null,
    ttlMs: 20 * 1000
  };

  const RECIPIENT_PERMS_SYNC = {
    cacheAt: 0,
    inflight: null,
    ttlMs: 60 * 1000
  };

  function getCachedRecipientPerms() {
    return (MEMORY_STORE.myRecipientPerms && typeof MEMORY_STORE.myRecipientPerms === 'object')
      ? MEMORY_STORE.myRecipientPerms
      : null;
  }

  function setCachedRecipientPerms(value) {
    MEMORY_STORE.myRecipientPerms = (value && typeof value === 'object') ? value : null;
    return MEMORY_STORE.myRecipientPerms;
  }

  async function apiFetchMyRecipientPerms(basePath) {
    const bp = normalizeBasePath(basePath);
    const tries = ['/mensagens/api/msg/recipients/perms'];
    for (const url of tries) {
      try {
        const target = appendQs(url, { _ts: Date.now() });
        const { r, json } = await fetchJsonWithFallback([target], { credentials: 'same-origin', cache: 'no-store' });
        if (!r) continue;

        const baseForRedirect = normalizeBasePath(url.split('/api/msg/')[0] || bp);
        if (maybeRedirectToLogin(baseForRedirect, r)) return null;
        if (maybeRedirectToPortalSelection(baseForRedirect, r, json)) return null;

        if (!r.ok) continue;
        if (!json || typeof json !== 'object') continue;
        if (json && json.ok === false) continue;
        return json;
      } catch {
        // ignore
      }
    }
    return null;
  }

  async function ensureMyRecipientPerms(basePath, opts) {
    const force = !!(opts && opts.force);
    const now = Date.now();
    const cached = getCachedRecipientPerms();
    if (!force && cached && (now - RECIPIENT_PERMS_SYNC.cacheAt) < RECIPIENT_PERMS_SYNC.ttlMs) return cached;
    if (!force && RECIPIENT_PERMS_SYNC.inflight) return RECIPIENT_PERMS_SYNC.inflight;

    const p = (async () => {
      try {
        const loaded = await apiFetchMyRecipientPerms(basePath);
        if (!loaded) return setCachedRecipientPerms(null);
        RECIPIENT_PERMS_SYNC.cacheAt = Date.now();
        return setCachedRecipientPerms(loaded);
      } finally {
        RECIPIENT_PERMS_SYNC.inflight = null;
      }
    })();

    RECIPIENT_PERMS_SYNC.inflight = p;
    return p;
  }

  function maybeRedirectToLogin(basePath, resp) {
    try {
      const status = Number(resp?.status);
      if (status !== 401) return false;
      const bp = normalizeBasePath(basePath);
      // Regra: evitar "/login" genérico sem saber o módulo.
      // Porém, em Condomínios (admin), o login é do Gestor (não existe /condominios/login).
      let loginUrl = '';
      try {
        const herePath = (typeof window !== 'undefined' && window.location) ? String(window.location.pathname || '') : '';
        const hereFull = (typeof window !== 'undefined' && window.location) ? (String(window.location.pathname || '') + String(window.location.search || '')) : '';
        const inPortal = herePath.startsWith('/portal-morador');
        const inCondominios = herePath.startsWith('/condominios/') || String(bp || '').endsWith('/condominios');
        if (inPortal) {
          const nextUrl = encodeURIComponent(String(hereFull || '/portal-morador'));
          loginUrl = `/portal-morador/login?next=${nextUrl}`;
        } else if (inCondominios) {
          const nextUrl = encodeURIComponent(String(hereFull || '/condominios'));
          loginUrl = `/gestor/login?next=${nextUrl}`;
        }
      } catch { /* noop */ }
      if (!loginUrl) {
        if (!bp) return false;
        const nextUrl = (typeof window !== 'undefined' && window.location)
          ? encodeURIComponent(String(window.location.pathname || '') + String(window.location.search || ''))
          : '';
        loginUrl = nextUrl ? `${bp}/login?next=${nextUrl}` : `${bp}/login`;
      }
      // Evita loops caso já esteja na tela de login.
      if (typeof window !== 'undefined' && window.location) {
        const here = String(window.location.pathname || '');
        if (!here.endsWith('/login')) {
          window.location.href = loginUrl;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  function maybeRedirectToPortalSelection(basePath, resp, json) {
    try {
      const status = Number(resp?.status || 0);
      if (status !== 409) return false;
      const code = String(json?.code || json?.error || '').trim();
      const need = code === 'PORTAL_SELECTION_REQUIRED' || String(json?.error || '').includes('PORTAL_SELECTION_REQUIRED');
      if (!need) return false;

      const bp = normalizeBasePath(basePath);
      if (!bp) return false;
      const selectUrl = bp ? `${bp}/login?step=select` : '/login?step=select';

      if (typeof window !== 'undefined' && window.location) {
        const here = String(window.location.pathname || '') + String(window.location.search || '');
        if (!here.includes('step=select')) {
          window.location.href = selectUrl;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  function normalizeMailboxFromServer(x) {
    if (!x || typeof x !== 'object') return null;
    const id = String(x.id || x._id || '').trim();
    const name = String(x.name || x.nome || '').trim();
    if (!id || !name) return null;
    return {
      id,
      name,
      type: String(x.type || 'grupo'),
      unitId: String(x.unitId || x.unidade_id || x.unidadeId || ''),
      unitName: String(x.unitName || x.unidade_nome || x.unidadeNome || ''),
      createdBy: String(x.createdBy || ''),
      operators: Array.isArray(x.operators) ? x.operators : [],
      isPublic: !!(x.isPublic || x.public || x.publica),
      isMember: typeof x.isMember === 'boolean' ? x.isMember : undefined,
      canAdmin: typeof x.canAdmin === 'boolean' ? x.canAdmin : undefined,
      userPerms: (x.userPerms && typeof x.userPerms === 'object') ? x.userPerms : (x.perms && typeof x.perms === 'object' ? x.perms : null),
      linkType: String(x.linkType || x.link_type || ''),
      linkId: String(x.linkId || x.link_id || '')
    };
  }

  function mailboxIsGroup(mb) {
    try {
      return String(mb?.type || '').trim().toLowerCase() === 'grupo';
    } catch {
      return false;
    }
  }

  function mailboxGetUserPerms(mb) {
    try {
      const perms = mb?.userPerms;
      return (perms && typeof perms === 'object') ? perms : null;
    } catch {
      return null;
    }
  }

  function mailboxHasPerm(mb, key) {
    const perms = mailboxGetUserPerms(mb);
    if (!perms) return false;
    return !!perms[key];
  }

  function mailboxCanAdmin(mb) {
    if (!mb) return false;
    if (mb.canAdmin === true) return true;
    return mailboxHasPerm(mb, PERMISSIONS.administrar);
  }

  function getMailboxById(mailboxId) {
    try {
      const id = String(mailboxId || '').trim();
      if (!id) return null;
      const list = Array.isArray(MEMORY_STORE.mailboxes) ? MEMORY_STORE.mailboxes : [];
      return list.find(m => String(m?.id || '').trim() === id) || null;
    } catch {
      return null;
    }
  }

  function mailboxPermsEnforced(mb) {
    // Requisito: permissões só para caixas de grupo.
    return !!(mb && mailboxIsGroup(mb));
  }

  function mustAllowByPublicPortal(mb) {
    // Backend permite leitura/envio para caixas públicas via Portal mesmo sem ser membro.
    // A UI não deve bloquear nesses casos.
    try {
      const ctx = getCtx();
      const isPortal = !!ctx?.isPortal;
      const isPublic = !!mb?.isPublic;
      const isMember = (typeof mb?.isMember === 'boolean') ? mb.isMember : true;
      return !!(isPortal && isPublic && !isMember);
    } catch {
      return false;
    }
  }

  function ensureMailboxPermOrWarn(mailboxId, permKey, msg) {
    try {
      const mb = getMailboxById(mailboxId);
      if (!mb) return true;
      if (!mailboxPermsEnforced(mb)) return true;
      // Exceção do Portal (caixa pública) é só para leitura/envio.
      if (mustAllowByPublicPortal(mb) && (permKey === PERMISSIONS.lerMensagem || permKey === PERMISSIONS.criarMensagem)) return true;
      if (mailboxCanAdmin(mb)) return true;
      if (mailboxHasPerm(mb, permKey)) return true;
      toastError(msg || 'Sem permissão para executar esta ação nesta caixa.');
      return false;
    } catch {
      return false;
    }
  }

  async function apiFetchMailboxes(basePath) {
    const bp = normalizeBasePath(basePath);
    const debug = isDebugEnabled();
    const tries = ['/mensagens/api/msg/mailboxes'];
    const ctx = getCtx();
    const adminUnitId = isMasterOrAdmin(ctx?.role) ? getActiveUnitIdForAdmin() : '';
    for (const url of tries) {
      try {
        const target = appendQs(url, { _ts: Date.now(), ...(adminUnitId ? { unidade_id: adminUnitId } : {}), ...(debug ? { debug: 1 } : {}) });
        const { r, json } = await fetchJsonWithFallback([target], { credentials: 'same-origin', cache: 'no-store' });
        if (!r) continue;

        const baseForRedirect = normalizeBasePath(url.split('/api/msg/')[0] || bp);
        if (maybeRedirectToLogin(baseForRedirect, r)) return null;
        try {
          MEMORY_STORE.lastMailboxesDiag = {
            at: Date.now(),
            url: target,
            status: r.status,
            ok: r.ok,
            portalAuth: String(r.headers.get('x-portal-auth-debug') || ''),
            portalAuthDetail: String(r.headers.get('x-portal-auth-detail') || ''),
            debug: (debug && json && typeof json === 'object') ? (json.debug || null) : null,
            error: (json && (json.error || json.message || json.code)) ? String(json.error || json.message || json.code) : ''
          };
        } catch { /* noop */ }

        if (maybeRedirectToPortalSelection(baseForRedirect, r, json)) return null;
        if (!r.ok) continue;
        if (!json) continue;
        try {
          if (debug && json && typeof json === 'object' && json.debug) {
            MEMORY_STORE.lastMailboxesDiag = { at: Date.now(), url: target, status: r.status, debug: json.debug };
          } else if (debug) {
            MEMORY_STORE.lastMailboxesDiag = { at: Date.now(), url: target, status: r.status, debug: null };
          }
        } catch { /* noop */ }
        const list = Array.isArray(json) ? json : (json && (json.data || json.mailboxes)) || [];
        if (!Array.isArray(list)) continue;
        return list.map(normalizeMailboxFromServer).filter(Boolean);
      } catch {
        // ignore
      }
    }
    return null;
  }

  async function apiFetchRecipientMailboxes(basePath) {
    const bp = normalizeBasePath(basePath);
    const debug = isDebugEnabled();
    const tries = ['/mensagens/api/msg/mailboxes/recipients'];
    const ctx = getCtx();
    const adminUnitId = isMasterOrAdmin(ctx?.role) ? getActiveUnitIdForAdmin() : '';
    for (const url of tries) {
      try {
        const target = appendQs(url, { _ts: Date.now(), includeHabitacoes: 1, ...(adminUnitId ? { unidade_id: adminUnitId } : {}), ...(debug ? { debug: 1 } : {}) });
        const { r, json } = await fetchJsonWithFallback([target], { credentials: 'same-origin', cache: 'no-store' });
        if (!r) continue;

        const baseForRedirect = normalizeBasePath(url.split('/api/msg/')[0] || bp);
        if (maybeRedirectToLogin(baseForRedirect, r)) return null;
        try {
          MEMORY_STORE.lastRecipientMailboxesDiag = {
            at: Date.now(),
            url: target,
            status: r.status,
            ok: r.ok,
            portalAuth: String(r.headers.get('x-portal-auth-debug') || ''),
            portalAuthDetail: String(r.headers.get('x-portal-auth-detail') || ''),
            debug: (debug && json && typeof json === 'object') ? (json.debug || null) : null,
            error: (json && (json.error || json.message || json.code)) ? String(json.error || json.message || json.code) : ''
          };
        } catch { /* noop */ }

        if (maybeRedirectToPortalSelection(baseForRedirect, r, json)) return null;
        if (!r.ok) continue;
        if (!json) continue;
        try {
          if (debug && json && typeof json === 'object' && json.debug) {
            MEMORY_STORE.lastRecipientMailboxesDiag = { at: Date.now(), url: target, status: r.status, debug: json.debug };
          } else if (debug) {
            MEMORY_STORE.lastRecipientMailboxesDiag = { at: Date.now(), url: target, status: r.status, debug: null };
          }
        } catch { /* noop */ }
        const list = Array.isArray(json) ? json : (json && (json.data || json.mailboxes)) || [];
        if (!Array.isArray(list)) continue;
        return list.map(normalizeMailboxFromServer).filter(Boolean);
      } catch {
        // ignore
      }
    }
    return null;
  }

  async function apiCreateMailbox(basePath, payload) {
    const bp = String(basePath || '').trim();
    const tries = ['/mensagens/api/msg/mailboxes'];
    for (const url of tries) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {})
        });
        if (!r.ok) continue;
        const json = await r.json().catch(() => null);
        return normalizeMailboxFromServer(json);
      } catch {
        // ignore
      }
    }
    return null;
  }

  async function apiPatchMailbox(basePath, id, patch) {
    const bp = String(basePath || '').trim();
    const tries = [`/mensagens/api/msg/mailboxes/${encodeURIComponent(id)}`];
    for (const url of tries) {
      try {
        const r = await fetch(url, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch || {})
        });
        if (!r.ok) continue;
        const json = await r.json().catch(() => null);
        return normalizeMailboxFromServer(json);
      } catch {
        // ignore
      }
    }
    return null;
  }

  async function apiDeleteMailbox(basePath, id) {
    const bp = String(basePath || '').trim();
    const tries = [`/mensagens/api/msg/mailboxes/${encodeURIComponent(id)}`];
    for (const url of tries) {
      try {
        const r = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
        if (!r.ok) continue;
        return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  async function apiFetchMessages(basePath, params, opts) {
    const bp = normalizeBasePath(basePath);
    const debug = isDebugEnabled();
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      if (v === '') return;
      qs.set(k, String(v));
    });

    if (debug && !qs.has('debug') && !qs.has('__debug')) {
      qs.set('debug', '1');
    }

    // Evita cache (CDN/navegador) mascarar atualizações e/ou retornar 304 em APIs.
    // O backend já manda no-store, mas isso reforça no cliente.
    qs.set('_ts', String(Date.now()));

    const tries = [`/mensagens/api/msg/messages?${qs.toString()}`];
    let last = { r: null, json: null, url: '' };
    const signal = opts && typeof opts === 'object' ? opts.signal : undefined;
    for (const url of tries) {
      const result = await fetchJsonWithFallback([url], {
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'fetch'
        }
      });
      if (!result?.r) continue;
      last = result;

      const baseForRedirect = normalizeBasePath(url.split('/api/msg/')[0] || bp);
      if (maybeRedirectToLogin(baseForRedirect, result.r)) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      // Portal: se perdeu seleção (cookie/sessão), redireciona para a tela de seleção.
      if (Number(result.r.status) === 409) {
        if (maybeRedirectToPortalSelection(baseForRedirect, result.r, result.json)) {
          throw new Error('Seleção de unidade/habitação necessária.');
        }
        const errMsg = (result.json && (result.json.error || result.json.message))
          ? String(result.json.error || result.json.message)
          : `Falha ao listar mensagens (HTTP ${result.r.status})`;
        throw new Error(errMsg);
      }

      // Se veio HTML/redirecionamento e não conseguimos JSON, tenta próximo.
      if (!result.json && result.r.ok) continue;
      if (!result.r.ok) {
        // ainda tenta próximo basePath antes de falhar
        continue;
      }
      // OK + JSON: retorna
      try {
        MEMORY_STORE.lastApiDiag = {
          at: Date.now(),
          url,
          status: result.r.status,
          ok: result.r.ok,
          contentType: String(result.r.headers.get('content-type') || ''),
          apiVersion: String(result.r.headers.get('x-wdg-api-version') || ''),
          vercelId: String(result.r.headers.get('x-vercel-id') || ''),
          dbMode: String(result.r.headers.get('x-condominios-db-mode') || ''),
        };
      } catch {
        // ignore
      }

      try {
        if (debug && result.json && typeof result.json === 'object') {
          const meta = result.json.meta || result.json.debug || null;
          if (meta) {
            MEMORY_STORE.lastApiDiag = { ...(MEMORY_STORE.lastApiDiag || {}), meta };
          }
        }
      } catch { /* noop */ }

      return result.json;
    }

    const r = last?.r;
    const json = last?.json;
    const finalUrl = last?.url || (tries[0] || '');

    if (r) {
      try {
        MEMORY_STORE.lastApiDiag = {
          at: Date.now(),
          url: finalUrl,
          status: r.status,
          ok: r.ok,
          contentType: String(r.headers.get('content-type') || ''),
          apiVersion: String(r.headers.get('x-wdg-api-version') || ''),
          vercelId: String(r.headers.get('x-vercel-id') || ''),
          dbMode: String(r.headers.get('x-condominios-db-mode') || ''),
        };
      } catch { /* noop */ }
    }

    const errMsg = (json && (json.error || json.message))
      ? String(json.error || json.message)
      : (r ? `Falha ao carregar mensagens (HTTP ${r.status})` : 'Falha ao carregar mensagens (sem resposta da API)');
    const err = new Error(errMsg);
    try {
      err.status = r ? r.status : 0;
      err.body = json;
      err.url = finalUrl;
      err.mailboxId = String(params?.mailboxId || '');
    } catch { /* noop */ }
    throw err;
  }

  async function apiFetchMarkers(basePath, mailboxId) {
    const bp = String(basePath || '').trim();
    const mb = String(mailboxId || 'pessoal').trim() || 'pessoal';
    const path = `/mensagens/api/msg/markers?mailboxId=${encodeURIComponent(mb)}`;
    const tries = [path];
    const result = await fetchJsonWithFallback(tries, { credentials: 'same-origin' });
    const r = result?.r || null;
    const json = result?.json ?? null;

    if (!r) throw new Error('Falha ao listar marcadores (sem resposta da API).');
    if (!r.ok) {
      const errMsg = (json && (json.error || json.message))
        ? String(json.error || json.message)
        : `Falha ao listar marcadores (HTTP ${r.status})`;
      throw new Error(errMsg);
    }
    if (json === null) throw new Error('Falha ao listar marcadores (resposta inválida da API).');
    return Array.isArray(json) ? json : (json && json.items) || [];
  }

  async function apiCreateMarker(basePath, mailboxId, nome, cor) {
    const url = '/mensagens/api/msg/markers';
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'fetch' };
    try {
      const low = String(bp || '').trim().toLowerCase();
      if (low.startsWith('/portal-morador')) headers['x-wdg-portal'] = '1';
    } catch {}
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ mailboxId: mailboxId || 'pessoal', nome: String(nome || '').trim(), cor: String(cor || '').trim() })
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const errMsg = (json && (json.error || json.message)) ? String(json.error || json.message) : `Falha ao criar marcador (HTTP ${r.status})`;
      throw new Error(errMsg);
    }
    return json;
  }

  async function apiDeleteMarker(basePath, mailboxId, markerId) {
    const id = String(markerId || '').trim();
    const url = `/mensagens/api/msg/markers/${encodeURIComponent(id)}?mailboxId=${encodeURIComponent(mailboxId || 'pessoal')}`;
    const headers = { 'Accept': 'application/json', 'X-Requested-With': 'fetch' };
    try {
      const low = String(bp || '').trim().toLowerCase();
      if (low.startsWith('/portal-morador')) headers['x-wdg-portal'] = '1';
    } catch {}
    const r = await fetch(url, { method: 'DELETE', credentials: 'same-origin', headers });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const errMsg = (json && (json.error || json.message)) ? String(json.error || json.message) : `Falha ao remover marcador (HTTP ${r.status})`;
      throw new Error(errMsg);
    }
    return json;
  }

  async function apiMessagesAction(basePath, mailboxId, ids, action, extra) {
    const bp = String(basePath || '').trim();
    const url = '/mensagens/api/msg/messages/actions';
    const payload = { mailboxId: mailboxId || 'pessoal', ids: Array.isArray(ids) ? ids : [], action, ...(extra || {}) };
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'fetch' };
    try {
      const low = String(bp || '').trim().toLowerCase();
      if (low.startsWith('/portal-morador')) headers['x-wdg-portal'] = '1';
    } catch {}
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(payload)
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const errMsg = (json && (json.error || json.message)) ? String(json.error || json.message) : `Falha ao aplicar ação (HTTP ${r.status})`;
      throw new Error(errMsg);
    }
    return json;
  }

  async function migrateLocalMailboxesToServer(basePath) {
    // Zero storage: não há migração de dados locais.
    void basePath;
    return;
  }

  async function syncMailboxesFromServer(basePath, opts) {
    const force = !!(opts && opts.force);
    const now = Date.now();
    if (!force && MAILBOX_SYNC.inflight) return MAILBOX_SYNC.inflight;
    if (!force && (now - MAILBOX_SYNC.cacheAt) < MAILBOX_SYNC.ttlMs) return true;

    MAILBOX_SYNC.inflight = (async () => {
      // Migra caixas legadas do navegador (uma vez) antes de sobrescrever o cache local
      try { await migrateLocalMailboxesToServer(basePath); } catch {}

      const list = await apiFetchMailboxes(basePath);
      if (!list) {
        MAILBOX_SYNC.cacheAt = Date.now();
        MAILBOX_SYNC.inflight = null;
        return false;
      }

      // Atualiza cache local com o estado do servidor
      saveCustomMailboxes(list);

      MAILBOX_SYNC.cacheAt = Date.now();
      MAILBOX_SYNC.inflight = null;
      return true;
    })();

    return MAILBOX_SYNC.inflight;
  }

  const RECIPIENT_MAILBOX_SYNC = {
    cacheAt: 0,
    inflight: null,
    ttlMs: 20 * 1000
  };

  function loadRecipientMailboxes() {
    return Array.isArray(MEMORY_STORE.recipientMailboxes) ? MEMORY_STORE.recipientMailboxes : [];
  }

  function saveRecipientMailboxes(list) {
    MEMORY_STORE.recipientMailboxes = Array.isArray(list) ? list : [];
  }

  async function syncRecipientMailboxesFromServer(basePath, opts) {
    const force = !!(opts && opts.force);
    const now = Date.now();
    if (!force && RECIPIENT_MAILBOX_SYNC.inflight) return RECIPIENT_MAILBOX_SYNC.inflight;
    if (!force && (now - RECIPIENT_MAILBOX_SYNC.cacheAt) < RECIPIENT_MAILBOX_SYNC.ttlMs) return true;

    RECIPIENT_MAILBOX_SYNC.inflight = (async () => {
      const list = await apiFetchRecipientMailboxes(basePath);
      if (!list) {
        RECIPIENT_MAILBOX_SYNC.cacheAt = Date.now();
        RECIPIENT_MAILBOX_SYNC.inflight = null;
        return false;
      }
      saveRecipientMailboxes(list);
      RECIPIENT_MAILBOX_SYNC.cacheAt = Date.now();
      RECIPIENT_MAILBOX_SYNC.inflight = null;
      return true;
    })();

    return RECIPIENT_MAILBOX_SYNC.inflight;
  }

  const GROUP_SYNC = {
    byMailbox: new Map(),
    inflight: new Map(),
    ttlMs: 15 * 1000
  };

  function loadGroupsMigratedMap() {
    MEMORY_STORE.__groupsMigrated = MEMORY_STORE.__groupsMigrated || {};
    const map = MEMORY_STORE.__groupsMigrated;
    return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
  }

  function markGroupsMigrated(mailboxId) {
    const mb = String(mailboxId || '').trim();
    if (!mb) return;
    const map = loadGroupsMigratedMap();
    map[mb] = { at: Date.now(), ok: true };
  }

  function wasGroupsMigrated(mailboxId) {
    const mb = String(mailboxId || '').trim();
    if (!mb) return true;
    const map = loadGroupsMigratedMap();
    return !!(map && map[mb] && map[mb].ok);
  }

  const GROUP_MIGRATION = {
    inflight: new Map()
  };

  async function migrateLocalGroupsToServer(basePath, mailboxId) {
    const mb = String(mailboxId || '').trim();
    if (!mb) return;
    if (wasGroupsMigrated(mb)) return;
    if (GROUP_MIGRATION.inflight.get(mb)) return GROUP_MIGRATION.inflight.get(mb);

    const p = (async () => {
      // Zero storage: não há migração de dados locais.
      void basePath;
      markGroupsMigrated(mb);
      GROUP_MIGRATION.inflight.delete(mb);
    })();

    GROUP_MIGRATION.inflight.set(mb, p);
    return p;
  }

  function normalizeGroupFromServer(x) {
    if (!x || typeof x !== 'object') return null;
    const id = String(x.id || x._id || '').trim();
    const name = String(x.name || x.nome || '').trim();
    if (!id || !name) return null;
    return {
      id,
      mailboxId: String(x.mailboxId || x.mailbox_id || ''),
      name,
      members: Array.isArray(x.members) ? x.members : []
    };
  }

  async function apiFetchGroups(basePath, mailboxId) {
    const mb = String(mailboxId || '').trim();
    if (!mb) return null;

    const qs = `?mailboxId=${encodeURIComponent(mb)}`;
    const bp = String(basePath || '').trim();
    const tries = [`/mensagens/api/msg/groups${qs}`];
    for (const url of tries) {
      try {
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) {
          // 401/403: não adianta tentar novamente e isso causa loop de polling no menu.
          if (r.status === 401 || r.status === 403) {
            const err = new Error('Acesso negado');
            err.status = r.status;
            err.url = url;
            err.mailboxId = mb;
            try {
              const ct = String(r.headers.get('content-type') || '').toLowerCase();
              err.body = ct.includes('application/json')
                ? await r.json().catch(() => null)
                : await r.text().catch(() => '');
            } catch {
              err.body = null;
            }
            throw err;
          }
          continue;
        }
        const json = await r.json().catch(() => null);
        const list = Array.isArray(json) ? json : (json && (json.data || json.groups)) || [];
        if (!Array.isArray(list)) continue;
        return list.map(normalizeGroupFromServer).filter(Boolean);
      } catch (e) {
        const st = Number(e && e.status ? e.status : 0);
        if (st === 401 || st === 403) throw e;
        // ignore
      }
    }
    return null;
  }

  async function apiCreateGroup(basePath, payload) {
    const bp = String(basePath || '').trim();
    const tries = ['/mensagens/api/msg/groups'];
    for (const url of tries) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {})
        });
        if (!r.ok) continue;
        const json = await r.json().catch(() => null);
        return normalizeGroupFromServer(json);
      } catch {
        // ignore
      }
    }
    return null;
  }

  async function apiPatchGroup(basePath, id, patch) {
    const gid = String(id || '').trim();
    if (!gid) return null;
    const bp = String(basePath || '').trim();
    const tries = [`/mensagens/api/msg/groups/${encodeURIComponent(gid)}`];
    for (const url of tries) {
      try {
        const r = await fetch(url, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch || {})
        });
        if (!r.ok) continue;
        const json = await r.json().catch(() => null);
        return normalizeGroupFromServer(json);
      } catch {
        // ignore
      }
    }
    return null;
  }

  async function apiDeleteGroup(basePath, id) {
    const gid = String(id || '').trim();
    if (!gid) return false;
    const bp = String(basePath || '').trim();
    const tries = [`/mensagens/api/msg/groups/${encodeURIComponent(gid)}`];
    for (const url of tries) {
      try {
        const r = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
        if (!r.ok) continue;
        return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  function mailboxMembersCount(group) {
    // Contador exibido no menu do grupo.
    // O comportamento esperado é contar todos os membros (usuários + caixas).
    const members = Array.isArray(group?.members) ? group.members : [];
    return members.length;
  }

  function looksLikeServerId(id) {
    const s = String(id || '').trim();
    if (!s) return false;
    // Mongo ObjectId
    if (/^[a-f0-9]{24}$/i.test(s)) return true;
    return false;
  }

  async function ensureGroupOnServer(basePath, mailboxId, groupId, groupName, members) {
    // Se o id não parece ser do servidor (ObjectId), cria um novo grupo no servidor e retorna.
    if (looksLikeServerId(groupId)) return null;
    const name = String(groupName || '').trim();
    if (!name) return null;
    const created = await apiCreateGroup(basePath, { mailboxId, name, members: Array.isArray(members) ? members : [] });
    if (!created) return null;
    return sanitizeGroups([created])[0] || created;
  }

  async function syncGroupsForMailbox(basePath, mailboxId, opts) {
    const mb = String(mailboxId || '').trim();
    if (!mb) return [];

    const force = !!(opts && opts.force);
    const cache = GROUP_SYNC.byMailbox.get(mb);
    const now = Date.now();
    if (!force && cache && (now - cache.at) < GROUP_SYNC.ttlMs) return cache.list;
    if (!force && GROUP_SYNC.inflight.get(mb)) return GROUP_SYNC.inflight.get(mb);

    const p = (async () => {
      // Migra grupos legados do navegador (uma vez por mailbox)
      try { await migrateLocalGroupsToServer(basePath, mb); } catch {}
      let server = null;
      try {
        server = await apiFetchGroups(basePath, mb);
      } catch (e) {
        const st = Number(e && e.status ? e.status : 0);
        // 401/403 deve ser tratado na UI (fallback para pessoal / parar polling).
        if (st === 401 || st === 403) throw e;
        server = null;
      }
      if (Array.isArray(server)) {
        const safe = sanitizeGroups(server);
        GROUP_SYNC.byMailbox.set(mb, { at: Date.now(), list: safe });
        // Cache local é apenas espelho do servidor
        try { saveGroupsForMailbox(mb, safe); } catch {}
        GROUP_SYNC.inflight.delete(mb);
        return safe;
      }

      // Servidor indisponível: usa cache local (último estado conhecido)
      const local = loadGroupsForMailbox(mb);
      const safeLocal = sanitizeGroups(local);
      GROUP_SYNC.byMailbox.set(mb, { at: Date.now(), list: safeLocal });
      GROUP_SYNC.inflight.delete(mb);
      return safeLocal;
    })();

    GROUP_SYNC.inflight.set(mb, p);
    return p;
  }

  function loadGroupsByMailbox() {
    const map = MEMORY_STORE.groupsByMailbox;
    return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
  }

  function saveGroupsByMailbox(map) {
    const safe = (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
    MEMORY_STORE.groupsByMailbox = safe;
  }

  function normalizeMemberKey(member) {
    const type = String(member?.type || '').trim().toLowerCase();
    if (type === 'mailbox') {
      const mailboxId = String(member?.mailboxId || member?.mailbox_id || member?.id || member?.mailbox || '').trim();
      return mailboxId ? `mb:${mailboxId}` : 'mb:';
    }

    // Suporta caixa pessoal por contexto (Portal por habitação / Colaborador)
    const ownerKey = String(member?.ownerKey || member?.owner_key || '').trim().toLowerCase();
    if (ownerKey) return ownerKey;

    const email = String(member?.email || '').trim().toLowerCase();
    if (email) return email;
    return normalizeText(String(member?.nome || member?.name || member || '')).trim();
  }

  function sanitizeGroups(list) {
    if (!Array.isArray(list)) return [];

    function mergeMembers(a, b) {
      const left = Array.isArray(a) ? a.filter(Boolean) : [];
      const right = Array.isArray(b) ? b.filter(Boolean) : [];
      if (!right.length) return left;
      const seen = new Set(left.map(x => normalizeMemberKey(x)));
      const out = [...left];
      for (const m of right) {
        const key = normalizeMemberKey(m);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
      }
      return out;
    }

    const normalized = list
      .filter(Boolean)
      .map(g => ({
        id: String(g.id || ''),
        name: String(g.name || g.nome || '').trim(),
        members: Array.isArray(g.members) ? g.members : []
      }))
      .filter(g => g.id && g.name)
      .map(g => ({
        ...g,
        members: g.members
          .filter(Boolean)
          .map(m => {
            // Suporta versões antigas onde member era salvo como string.
            if (typeof m === 'string') {
              const raw = String(m || '').trim();
              const lower = raw.toLowerCase();
              if (lower.startsWith('userkey:')) {
                const ownerKeyRaw = raw.slice('userkey:'.length).trim();
                const ownerKey = ownerKeyRaw.toLowerCase();
                const baseEmail = (ownerKey.split('::')[0] || '').trim();
                const email = baseEmail.includes('@') ? baseEmail : '';
                return { type: 'user', nome: '', email: email, fotoUrl: '', ownerKey: ownerKeyRaw };
              }
              if (lower.startsWith('user:')) {
                const token = raw.slice('user:'.length).trim();
                const isEmail = token.includes('@');
                return { type: 'user', nome: isEmail ? '' : token, email: isEmail ? token : '', fotoUrl: '' };
              }
              if (lower.startsWith('mailbox:')) {
                const mailboxId = raw.slice('mailbox:'.length).trim();
                return { type: 'mailbox', mailboxId, name: mailboxId };
              }
              if (lower.startsWith('mb:')) {
                const mailboxId = raw.slice('mb:'.length).trim();
                return { type: 'mailbox', mailboxId, name: mailboxId };
              }

              // Heurística: ids comuns de caixas (evita aparecer como “usuário” quando vinha errado)
              if (lower === 'pessoal' || lower === 'publica' || lower === 'pública') {
                const mailboxId = (lower === 'pública') ? 'publica' : lower;
                return { type: 'mailbox', mailboxId, name: raw };
              }

              // Caso padrão: trata como usuário (nome ou email).
              const isEmail = raw.includes('@');
              return { type: 'user', nome: isEmail ? '' : raw, email: isEmail ? raw : '', fotoUrl: '' };
            }

            const type = String(m.type || '').trim().toLowerCase();
            if (type === 'mailbox' || m.mailboxId || m.mailbox_id || m.id || m.mailbox) {
              return {
                type: 'mailbox',
                mailboxId: String(m.mailboxId || m.mailbox_id || m.id || m.mailbox || '').trim(),
                name: String(m.name || m.nome || m.mailboxName || m.mailbox_nome || '').trim()
              };
            }

            // Migração: alguns membros foram persistidos errado como nome="userkey:..." / nome="user:...".
            // Corrige para email e evita exibir o prefixo na UI.
            {
              const rawNome = String(m.nome || m.name || '').trim();
              const rawEmail = String(m.email || '').trim();
              const lowerNome = rawNome.toLowerCase();
              const lowerEmail = rawEmail.toLowerCase();
              if (!rawEmail && lowerNome.startsWith('userkey:')) {
                const ownerKeyRaw = rawNome.slice('userkey:'.length).trim();
                const ownerKeyLower = ownerKeyRaw.toLowerCase();
                const baseEmail = (ownerKeyLower.split('::')[0] || '').trim();
                const email = baseEmail.includes('@') ? baseEmail : '';
                return {
                  type: 'user',
                  nome: '',
                  email,
                  fotoUrl: String(m.fotoUrl || m.foto || m.photo || m.avatar || '').trim(),
                  ownerKey: String(m.ownerKey || m.owner_key || ownerKeyRaw || '').trim(),
                  origem: String(m.origem || m.source || '').trim(),
                  habitacao_id: String(m.habitacao_id || m.habitacaoId || '').trim(),
                  suffix: String(m.suffix || '').trim()
                };
              }
              if (!rawEmail && lowerNome.startsWith('user:')) {
                const token = rawNome.slice('user:'.length).trim();
                const isEmail = token.includes('@');
                return {
                  type: 'user',
                  nome: isEmail ? '' : token,
                  email: isEmail ? token.toLowerCase() : '',
                  fotoUrl: String(m.fotoUrl || m.foto || m.photo || m.avatar || '').trim(),
                  ownerKey: String(m.ownerKey || m.owner_key || '').trim(),
                  origem: String(m.origem || m.source || '').trim(),
                  habitacao_id: String(m.habitacao_id || m.habitacaoId || '').trim(),
                  suffix: String(m.suffix || '').trim()
                };
              }
              if (!rawNome && lowerEmail.startsWith('userkey:')) {
                const ownerKeyRaw = rawEmail.slice('userkey:'.length).trim();
                const ownerKeyLower = ownerKeyRaw.toLowerCase();
                const baseEmail = (ownerKeyLower.split('::')[0] || '').trim();
                const email = baseEmail.includes('@') ? baseEmail : '';
                return {
                  type: 'user',
                  nome: '',
                  email,
                  fotoUrl: String(m.fotoUrl || m.foto || m.photo || m.avatar || '').trim(),
                  ownerKey: String(m.ownerKey || m.owner_key || ownerKeyRaw || '').trim(),
                  origem: String(m.origem || m.source || '').trim(),
                  habitacao_id: String(m.habitacao_id || m.habitacaoId || '').trim(),
                  suffix: String(m.suffix || '').trim()
                };
              }
            }
            return {
              type: 'user',
              nome: String(m.nome || m.name || '').trim(),
              email: String(m.email || '').trim(),
              fotoUrl: String(m.fotoUrl || m.foto || m.photo || m.avatar || '').trim(),
              ownerKey: String(m.ownerKey || m.owner_key || '').trim(),
              origem: String(m.origem || m.source || '').trim(),
              habitacao_id: String(m.habitacao_id || m.habitacaoId || '').trim(),
              suffix: String(m.suffix || '').trim()
            };
          })
          .filter(m => (m.type === 'mailbox' ? (m.mailboxId && m.name) : (m.nome || m.email)))
      }));

    // Dedup por id (evita menu duplicado); se repetido, mescla membros.
    const byId = new Map();
    for (const g of normalized) {
      const id = String(g?.id || '').trim();
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, g);
        continue;
      }
      const mergedName = String(prev.name || '').trim() || String(g.name || '').trim();
      const mergedMembers = mergeMembers(prev.members, g.members);
      byId.set(id, { id, name: mergedName, members: mergedMembers });
    }

    return Array.from(byId.values());
  }

  function loadGroupsForMailbox(mailboxId) {
    const key = String(mailboxId || '').trim();
    if (!key) return [];
    const map = loadGroupsByMailbox();
    return sanitizeGroups(map[key]);
  }

  function saveGroupsForMailbox(mailboxId, list) {
    const key = String(mailboxId || '').trim();
    if (!key) return;
    const map = loadGroupsByMailbox();
    map[key] = sanitizeGroups(list);
    saveGroupsByMailbox(map);
  }

  function loadCustomMailboxes() {
    return Array.isArray(MEMORY_STORE.mailboxes) ? MEMORY_STORE.mailboxes : [];
  }

  function saveCustomMailboxes(list) {
    const safe = Array.isArray(list) ? list : [];
    MEMORY_STORE.mailboxes = safe;
  }

  function buildBaseMailboxes(ctx) {
    return [
      {
        id: 'pessoal',
        name: `Pessoal - ${ctx.userName || 'Usuário'}`,
        type: 'pessoal',
        locked: true
      }
    ];
  }

  function normalizeUserKey(text) {
    return String(text || '').trim().toLowerCase();
  }

  function isMailboxMember(mailbox, ctx) {
    if (!mailbox) return false;
    if (mailbox.type === 'pessoal') return true;

    const meEmail = normalizeUserKey(ctx.userEmail);
    const meName = normalizeUserKey(ctx.userName);

    if (mailbox.createdBy) {
      const by = normalizeUserKey(mailbox.createdBy);
      if (by && (by === meEmail || by === meName)) return true;
    }

    const ops = Array.isArray(mailbox.operators) ? mailbox.operators : [];
    return ops.some(op => {
      const u = (typeof op === 'string') ? op : (op && typeof op === 'object' ? op.user : '');
      const key = normalizeUserKey(u);
      if (!key) return false;
      if (meEmail && key === meEmail) return true;
      if (meName && key === meName) return true;
      return false;
    });
  }

  function buildAllMailboxesUnfiltered(ctx) {
    const base = buildBaseMailboxes(ctx);
    const custom = loadCustomMailboxes();
    const merged = [...base];

    const seen = new Set(base.map(b => b.id));
    custom.forEach(b => {
      const id = String(b.id || '');
      const name = String(b.name || '');
      if (!id || !name || seen.has(id)) return;
      seen.add(id);
      // Importante: as caixas do servidor já vêm com `userPerms`/`canAdmin`/`isMember`.
      // Se perdermos isso aqui, a UI (Configurações > Caixas) entra em modo somente leitura.
      merged.push({
        id,
        name,
        type: b.type || 'grupo',
        unitId: b.unitId || '',
        unitName: b.unitName || '',
        createdBy: b.createdBy || '',
        operators: b.operators || [],
        isPublic: !!b.isPublic,
        isMember: (typeof b.isMember === 'boolean') ? b.isMember : undefined,
        canAdmin: (typeof b.canAdmin === 'boolean') ? b.canAdmin : undefined,
        userPerms: (b.userPerms && typeof b.userPerms === 'object') ? b.userPerms : null,
        linkType: String(b.linkType || ''),
        linkId: String(b.linkId || ''),
        locked: !!b.locked
      });
    });

    return merged;
  }

  function buildAllMailboxes(ctx) {
    // Em produção, a fonte da verdade é o servidor.
    // O endpoint `/mensagens/api/msg/mailboxes` já devolve apenas caixas visíveis para o usuário.
    // Se filtrarmos aqui de novo, o Portal pode esconder caixas de habitação quando `userEmail` não existe no dataset.
    const all = buildAllMailboxesUnfiltered(ctx);
    const custom = loadCustomMailboxes();
    const hasServerMailboxes = Array.isArray(custom) && custom.some(m => m && m.id && m.name);
    if (hasServerMailboxes) return all;
    // Fallback (sem dados do servidor): mantém filtro local.
    return all.filter(m => isMailboxMember(m, ctx));
  }

  function buildAllMailboxesForRecipients(ctx) {
    // Para Master/Admin, permitir selecionar qualquer caixa carregada do servidor.
    // Para usuários comuns:
    // - mantém restrição de participação, mas
    // - adiciona caixas públicas (carregadas via endpoint /recipients), quando existirem.
    const isMA = isMasterOrAdmin(ctx?.role);
    const base = isMA ? buildAllMailboxesUnfiltered(ctx) : buildAllMailboxes(ctx);
    const extra = loadRecipientMailboxes()
      .filter(b => b && b.id && b.name)
      .filter(b => String(b.type || '').toLowerCase() !== 'pessoal');

    const seen = new Set(base.map(b => b.id));
    const merged = [...base];
    extra.forEach(b => {
      if (seen.has(b.id)) return;
      seen.add(b.id);
      merged.push({
        id: b.id,
        name: b.name,
        type: b.type || 'grupo',
        unitId: b.unitId || '',
        unitName: b.unitName || '',
        createdBy: b.createdBy || '',
        operators: b.operators || [],
        isPublic: !!b.isPublic,
        locked: true
      });
    });

    return merged;
  }

  let _currentMailboxId = null;
  let _currentView = 'entrada';
  let _activeGroupMenuId = '';
  let _composePrefill = null;
  let _composeApi = null;
  let _composeActiveRecipientKind = 'to';

  const MAILBOX_LS_PREFIX = 'wdg_msg_selectedMailboxId::';
  const ADMIN_UNIT_LS_PREFIX = 'wdg_msg_adminUnitId::';

  function tryGetBasePathForStorage() {
    try {
      const bp = getSafePageBasePath(document.body?.dataset?.basePath || '');
      return String(bp || '').trim();
    } catch {
      return '';
    }
  }

  function tryLoadSelectedMailboxIdFromStorage() {
    try {
      const bp = tryGetBasePathForStorage();
      const key = MAILBOX_LS_PREFIX + bp;
      return String(window.localStorage?.getItem(key) || '').trim();
    } catch {
      return '';
    }
  }

  function trySaveSelectedMailboxIdToStorage(id) {
    try {
      const v = String(id || '').trim();
      if (!v) return;
      const bp = tryGetBasePathForStorage();
      const key = MAILBOX_LS_PREFIX + bp;
      window.localStorage?.setItem(key, v);
    } catch {
      /* noop */
    }
  }

  function tryLoadSelectedAdminUnitIdFromStorage() {
    try {
      const bp = tryGetBasePathForStorage();
      const key = ADMIN_UNIT_LS_PREFIX + bp;
      return String(window.localStorage?.getItem(key) || '').trim();
    } catch {
      return '';
    }
  }

  function trySaveSelectedAdminUnitIdToStorage(unitId) {
    try {
      const v = String(unitId || '').trim();
      if (!v) return;
      const bp = tryGetBasePathForStorage();
      const key = ADMIN_UNIT_LS_PREFIX + bp;
      window.localStorage?.setItem(key, v);
    } catch {
      /* noop */
    }
  }

  function tryGetAdminUnitIdFromDom() {
    try {
      const sel = document.querySelector('#cfgUnidade');
      return String(sel?.value || '').trim();
    } catch {
      return '';
    }
  }

  function getActiveUnitIdForAdmin() {
    try {
      const ctx = getCtx();
      if (!isMasterOrAdmin(ctx?.role)) return '';
      const dom = tryGetAdminUnitIdFromDom();
      if (dom && looksLikeObjectId(dom)) return dom;
      const stored = tryLoadSelectedAdminUnitIdFromStorage();
      if (stored && looksLikeObjectId(stored)) return stored;
      const fallback = String(ctx?.unitId || '').trim();
      if (fallback && looksLikeObjectId(fallback)) return fallback;
      return '';
    } catch {
      return '';
    }
  }

  function getSelectedView() {
    return MEMORY_STORE.selectedView || '';
  }

  function setSelectedView(view) {
    MEMORY_STORE.selectedView = String(view || '');
  }

  function getSelectedMailboxId() {
    const cur = MEMORY_STORE.selectedMailboxId || '';
    if (cur) return cur;
    const stored = tryLoadSelectedMailboxIdFromStorage();
    if (stored) {
      MEMORY_STORE.selectedMailboxId = stored;
      return stored;
    }

    return '';
  }

  async function apiFetchMessageDetail(basePath, mailboxId, id, opts) {
    const bp = String(basePath || '').trim();
    const mb = String(mailboxId || 'pessoal').trim() || 'pessoal';
    const url = `/mensagens/api/msg/messages/${encodeURIComponent(id)}?mailboxId=${encodeURIComponent(mb)}`;
    const signal = opts && typeof opts === 'object' ? opts.signal : undefined;
    const r = await fetch(url, { credentials: 'same-origin', signal });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const errMsg = (json && (json.error || json.message)) ? String(json.error || json.message) : `Falha ao carregar mensagem (HTTP ${r.status})`;
      throw new Error(errMsg);
    }
    return json;
  }

  async function apiMarkMessageRead(basePath, mailboxId, id, opts) {
    const bp = String(basePath || '').trim();
    const url = `/mensagens/api/msg/messages/${encodeURIComponent(id)}/read`;
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'fetch' };
    try {
      const low = String(bp || '').trim().toLowerCase();
      if (low.startsWith('/portal-morador')) headers['x-wdg-portal'] = '1';
    } catch {}
    const signal = opts && typeof opts === 'object' ? opts.signal : undefined;
    const markThread = !!(opts && typeof opts === 'object' && (opts.thread || opts.markThread || opts.threadAll));
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      signal,
      body: JSON.stringify({
        mailboxId: String(mailboxId || 'pessoal').trim() || 'pessoal',
        thread: markThread ? 1 : 0
      })
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const errMsg = (json && (json.error || json.message)) ? String(json.error || json.message) : `Falha ao marcar como lida (HTTP ${r.status})`;
      const err = new Error(errMsg);
      try {
        err.status = r.status;
        err.body = json;
      } catch {}
      throw err;
    }
    return json;
  }

  function setSelectedMailboxId(id) {
    MEMORY_STORE.selectedMailboxId = String(id || '');
    trySaveSelectedMailboxIdToStorage(MEMORY_STORE.selectedMailboxId);
  }

  function getMailboxByIdFromCtx(ctx, id) {
    const all = buildAllMailboxes(ctx);
    return all.find(m => m.id === id) || all[0] || null;
  }

  function populateMailboxSelect() {
    const select = qs('#msgMailboxSelect');
    if (!select) return;

    const ctx = getCtx();
    const all = buildAllMailboxes(ctx);

    // Importante: em um reload (F5), as caixas do servidor ainda não estão no cache em memória.
    // Se houver uma caixa previamente selecionada (ex.: caixa de grupo) ela ainda não estará em `all`
    // e o fluxo antigo acabava sobrescrevendo a escolha para "pessoal" e gravando isso no storage.
    const serverBoxesLoaded = (() => {
      try {
        // Se já tentamos sincronizar com o servidor pelo menos uma vez,
        // não vale manter uma seleção antiga indefinidamente.
        if (Number(MAILBOX_SYNC.cacheAt || 0) > 0) return true;
        const list = loadCustomMailboxes();
        return Array.isArray(list) && list.some(m => m && m.id && m.name);
      } catch {
        return false;
      }
    })();

    // Portal do Morador: a UX esperada é abrir na caixa PESSOAL por padrão.
    // No módulo Condomínios/Gestor, pode fazer sentido preferir uma caixa pública.
    const bpForDefault = getSafePageBasePath(document.body?.dataset?.basePath || '');
    const isPortalMorador = String(bpForDefault || '').trim().toLowerCase().startsWith('/portal-morador');

    const desired = getSelectedMailboxId();

    // Se ainda não houver escolha salva, o Portal abre em "pessoal".
    // Fora do Portal, mantém o comportamento antigo (preferir a primeira caixa além da pessoal).
    const preferred = (!desired && !isPortalMorador)
      ? (all.find(m => m && m.id && m.id !== 'pessoal') || null)
      : null;
    const portalFallback = (all.find(m => m && m.id === 'pessoal')?.id || all[0]?.id || 'pessoal');
    const genericFallback = (preferred?.id || all[0]?.id || 'pessoal');
    const fallback = isPortalMorador ? portalFallback : genericFallback;

    const desiredExistsInList = !!(desired && all.some(m => m && m.id === desired));
    const keepDesiredUntilSync = !!(desired && desired !== 'pessoal' && !desiredExistsInList && !serverBoxesLoaded);

    // Se a caixa desejada ainda não existe no menu porque as caixas do servidor não carregaram,
    // mantém a escolha e apenas cria uma option temporária para refletir a seleção.
    _currentMailboxId = keepDesiredUntilSync ? desired : (desiredExistsInList ? desired : fallback);
    if (!keepDesiredUntilSync) {
      // Só persiste quando temos certeza de que a seleção é válida no menu atual.
      setSelectedMailboxId(_currentMailboxId);
    }

    const options = [];
    if (keepDesiredUntilSync) {
      options.push(`<option value="${escapeHtml(desired)}">${escapeHtml('Carregando caixa...')}</option>`);
    }
    options.push(...all.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`));
    select.innerHTML = options.join('');

    select.value = _currentMailboxId;

    if (!select.__wdgBound) {
      select.__wdgBound = true;
      select.addEventListener('change', () => {
        const ctx = getCtx();
        const all = buildAllMailboxes(ctx);
        const fallback = all[0]?.id || 'pessoal';
        _currentMailboxId = select.value || fallback;
        setSelectedMailboxId(_currentMailboxId);
        void render(_currentView);
        void refreshGroupsMenu();
      });
    }
  }

  function mailboxLabelForChip() {
    const ctx = getCtx();
    const m = getMailboxByIdFromCtx(ctx, _currentMailboxId);
    return m?.name || 'Caixa';
  }

  const USERS = {
    cache: null,
    byEmail: new Map(),
    cacheAt: 0,
    inflight: null,
    ttlMs: 5 * 60 * 1000
  };

  function normalizeText(t) {
    return String(t || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
  }

  function looksLikeObjectId(value) {
    const s = String(value || '').trim();
    return /^[0-9a-fA-F]{24}$/.test(s);
  }

  function resolveUserPhotoUrl(u, basePath, email) {
    const raw = String(u?.foto || u?.photo || u?.avatar || u?.fotoUrl || '').trim();
    const bp = String(basePath || '').trim();
    const key = String(email || u?.email || '').trim();

    const buildPhotoEndpoint = (k) => {
      const v = String(k || '').trim();
      if (!v) return '';
      if (v.includes('@')) return (bp ? `${bp}/api/usuarios/foto?email=${encodeURIComponent(v)}` : `/api/usuarios/foto?email=${encodeURIComponent(v)}`);
      if (looksLikeObjectId(v)) return (bp ? `${bp}/api/usuarios/foto?id=${encodeURIComponent(v)}` : `/api/usuarios/foto?id=${encodeURIComponent(v)}`);
      return '';
    };

    // Mesmo sem caminho salvo, se tiver e-mail, tenta endpoint de foto.
    // O backend pode retornar o avatar correto (ou fallback) sem depender de static.
    if (!raw) {
      const url = buildPhotoEndpoint(key);
      if (url) return url;
      return bp ? `${bp}/images/usuario.png` : '/images/usuario.png';
    }
    if (/^data:/i.test(raw)) return raw;
    if (/^blob:/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;

    // Para caminhos locais (absolutos ou relativos), preferir endpoint por e-mail
    // (resolve public/uploads + uploads e evita 404 por static)
    {
      const url = buildPhotoEndpoint(key);
      if (url) return url;
    }
    if (raw.startsWith('/')) return raw;

    // Normalizações comuns do projeto
    const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.startsWith('public/uploads/')) return `/${normalized.slice('public/'.length)}`;
    if (normalized.startsWith('uploads/')) return `/${normalized}`;

    // Convenção: user.foto = 'users/<arquivo>' => servir em /uploads/users/<arquivo>
    return `/uploads/${normalized}`;
  }

  function defaultUserAvatarUrl(basePath) {
    const bp = String(basePath || '').trim();
    return bp ? `${bp}/images/usuario.png` : '/images/usuario.png';
  }

  function defaultMailboxAvatarUrl(basePath) {
    const bp = String(basePath || '').trim();
    return bp ? `${bp}/images/perfil.png` : '/images/perfil.png';
  }

  function findMailboxMetaAny(ctx, mailboxId) {
    const id = String(mailboxId || '').trim();
    if (!id) return null;
    try {
      const fromRecipients = loadRecipientMailboxes().find(b => String(b?.id || '').trim() === id) || null;
      if (fromRecipients) return fromRecipients;
    } catch {}
    try {
      const fromMine = buildAllMailboxesUnfiltered(ctx).find(b => String(b?.id || '').trim() === id) || null;
      if (fromMine) return fromMine;
    } catch {}
    return null;
  }

  function canResolvePhotoByKey(key) {
    const k = String(key || '').trim();
    if (!k) return false;
    if (k.includes('@')) return true;
    if (looksLikeObjectId(k)) return true;
    return false;
  }

  function resolveSenderAvatarForMessage(msg, basePath, ctx) {
    const m = msg || {};
    const fromMailboxId = String(m?.from?.mailboxId || '').trim();
    const fromEmail = String(m?.from?.email || '').trim();
    const fromOwner = String(m?.from?.owner || '').trim();
    const fromCreatedBy = String(m?.from?.createdBy || '').trim();

    // Remetente pessoal: mantém foto do usuário.
    if (!fromMailboxId || fromMailboxId === 'pessoal') {
      const key = fromEmail || fromOwner || fromCreatedBy;
      return {
        src: resolveUserPhotoUrl(null, basePath, key),
        fallback: defaultUserAvatarUrl(basePath)
      };
    }

    // Remetente é uma "caixa":
    // - caixa pública => não tem foto de usuário (ícone perfil)
    // - caixa privada => foto do createdBy (fallback perfil)
    const mb = findMailboxMetaAny(ctx, fromMailboxId);
    const isPublic = !!mb?.isPublic;
    if (isPublic) {
      const icon = defaultMailboxAvatarUrl(basePath);
      return { src: icon, fallback: icon };
    }

    const ownerKey = String(mb?.createdBy || fromCreatedBy || '').trim();
    if (canResolvePhotoByKey(ownerKey)) {
      return {
        src: resolveUserPhotoUrl(null, basePath, ownerKey),
        fallback: defaultMailboxAvatarUrl(basePath)
      };
    }

    const icon = defaultMailboxAvatarUrl(basePath);
    return { src: icon, fallback: icon };
  }

  async function fetchUsuariosList(basePath) {
    const now = Date.now();
    if (USERS.cache && (now - USERS.cacheAt) < USERS.ttlMs) return USERS.cache;
    if (USERS.inflight) return USERS.inflight;

    const tries = [
      `${basePath}/api/usuarios/busca.v2`,
      `${basePath}/api/usuarios/busca`,
      `/api/usuarios/busca.v2`,
      `/api/usuarios/busca`
    ];

    USERS.inflight = (async () => {
      let list = [];
      for (const url of tries) {
        try {
          const r = await fetch(url, { credentials: 'same-origin' });
          if (!r.ok) continue;
          const json = await r.json().catch(() => null);
          if (Array.isArray(json)) { list = json; break; }
          if (json && Array.isArray(json.data)) { list = json.data; break; }
        } catch {
          // ignore
        }
      }

      const norm = (list || [])
        .filter(Boolean)
        .map(u => {
          const nome = String(u.nome || u.name || '').trim();
          const email = String(u.email || '').trim();
          const fotoUrl = resolveUserPhotoUrl(u, basePath, email);
          const key = normalizeText(`${nome} ${email}`);
          const perms = Array.isArray(u.perms) ? u.perms.slice() : [];
          const vinculos = Array.isArray(u.vinculos) ? u.vinculos.slice() : [];
          const is_funcionario = !!(u.is_funcionario || u.isFuncionario);
          const role = String(u.role || u.nivel || '').trim();
          return {
            _id: u._id || null,
            nome,
            email,
            fotoUrl,
            key,
            perms,
            vinculos,
            is_funcionario,
            role
          };
        })
        .filter(u => u.nome || u.email);

      // Coloca o usuário atual no topo (se existir)
      try {
        const ctx = getCtx();
        if (ctx.userEmail) {
          const meEmail = String(ctx.userEmail || '').toLowerCase();
          norm.sort((a, b) => {
            const aIsMe = String(a.email || '').toLowerCase() === meEmail;
            const bIsMe = String(b.email || '').toLowerCase() === meEmail;
            if (aIsMe && !bIsMe) return -1;
            if (!aIsMe && bIsMe) return 1;
            return (a.nome || a.email).localeCompare(b.nome || b.email);
          });
        }
      } catch {}

      USERS.cache = norm;
      try {
        USERS.byEmail = new Map(norm.map(u => [normalizeEmailKey(u?.email), u]));
      } catch {
        USERS.byEmail = new Map();
      }
      USERS.cacheAt = Date.now();
      USERS.inflight = null;
      return norm;
    })();

    return USERS.inflight;
  }

  function buildUserPickHtml(value) {
    return [
      '<div class="wdg-userpick wdg-userpick-pro" data-userpick="1" data-userpick-pro="1">',
      '  <div class="wdg-userpick-field" role="combobox" aria-expanded="false" aria-haspopup="listbox">',
      '    <div class="wdg-userpick-selected" data-userpick-selected hidden>',
      '      <img class="wdg-userpick-sel-avatar" data-userpick-sel-avatar alt="">',
      '      <div class="wdg-userpick-sel-text">',
      '        <div class="wdg-userpick-sel-name" data-userpick-sel-name></div>',
      '        <div class="wdg-userpick-sel-meta" data-userpick-sel-meta></div>',
      '      </div>',
      '    </div>',
      `    <input class="form-control wdg-userpick-input" type="text" data-op-user name="opUser" aria-label="Selecionar usuário" placeholder="Selecionar usuário" maxlength="120" autocomplete="off" value="${escapeHtml(value || '')}">`,
      '    <button type="button" class="wdg-userpick-clear" data-userpick-clear aria-label="Limpar" title="Limpar" hidden>×</button>',
      '    <span class="wdg-userpick-chevron" aria-hidden="true"></span>',
      `    <input type="hidden" data-op-user-value name="opUserValue" value="">`,
      '  </div>',
      '  <div class="wdg-userpick-menu" data-userpick-menu="1" hidden></div>',
      '</div>'
    ].join('\n');
  }

  function buildUserPickCompactHtml(value) {
    return [
      '<div class="wdg-userpick wdg-userpick-compact wdg-userpick-pro" data-userpick="1" data-userpick-compact="1" data-userpick-pro="1">',
      '  <div class="wdg-userpick-field" role="combobox" aria-expanded="false" aria-haspopup="listbox">',
      '    <div class="wdg-userpick-selected" data-userpick-selected hidden>',
      '      <img class="wdg-userpick-sel-avatar" data-userpick-sel-avatar alt="">',
      '      <div class="wdg-userpick-sel-text">',
      '        <div class="wdg-userpick-sel-name" data-userpick-sel-name></div>',
      '        <div class="wdg-userpick-sel-meta" data-userpick-sel-meta></div>',
      '      </div>',
      '    </div>',
      `    <input class="form-control wdg-userpick-input" type="text" data-op-user name="opUser" aria-label="Selecionar usuário" placeholder="Selecionar usuário" maxlength="120" autocomplete="off" value="${escapeHtml(value || '')}">`,
      '    <button type="button" class="wdg-userpick-clear" data-userpick-clear aria-label="Limpar" title="Limpar" hidden>×</button>',
      '    <span class="wdg-userpick-chevron" aria-hidden="true"></span>',
      `    <input type="hidden" data-op-user-value name="opUserValue" value="">`,
      '  </div>',
      '  <div class="wdg-userpick-menu" data-userpick-menu="1" hidden></div>',
      '</div>'
    ].join('\n');
  }

  function buildRecipientPickCompactHtml() {
    return [
      '<div class="wdg-userpick wdg-userpick-compact" data-userpick="1" data-userpick-compact="1" data-userpick-mode="recipients">',
      '  <input class="form-control" type="text" data-op-user name="opRecipient" aria-label="Destinatário" maxlength="120" autocomplete="off" value="">',
      '  <div class="wdg-userpick-menu" data-userpick-menu="1" hidden></div>',
      '</div>'
    ].join('\n');
  }

  function bindUserPickers(root, basePath) {
    const host = root || document;
    const pickers = qsa('[data-userpick="1"]', host);
    if (!pickers.length) return;

    const bp = String(basePath || '').trim();
    const caixaAvatarUrl = bp ? `${bp}/images/caixas.png` : '/images/caixas.png';
    const defaultUserAvatarUrl = bp ? `${bp}/images/usuario.png` : '/images/usuario.png';

    function computeAltPhotoUrl(primary) {
      const p = String(primary || '').trim();
      if (!p) return '';
      // Tenta alternar entre URL com basePath e URL root.
      // Ex.: /condominios/api/usuarios/foto?... -> /api/usuarios/foto?...
      //      /api/usuarios/foto?... -> /condominios/api/usuarios/foto?...
      if (bp && p.startsWith(bp + '/api/usuarios/foto')) return p.slice(bp.length);
      if (bp && p.startsWith('/api/usuarios/foto')) return `${bp}${p}`;
      return '';
    }

    function ensurePortalHost() {
      let el = document.getElementById('wdgUserpickPortal');
      if (!el) {
        el = document.createElement('div');
        el.id = 'wdgUserpickPortal';
        const noBoldTitle = (view === 'cfg_caixas' || view === 'cfg_geral' || view === 'entrada' || view === 'saida' || view === 'arquivo' || view === 'lixeira' || view === 'grupos' || view === 'nova');
        el.style.zIndex = '3000';
        document.body.appendChild(el);
      }
      return el;
    }

    function portalMenu(menuEl) {
      if (!menuEl || menuEl.__wdgPortaled) return;
      menuEl.__wdgReturnParent = menuEl.parentElement;
      menuEl.__wdgPortaled = true;
    }

    function unportalMenu(menuEl) {
      if (!menuEl || !menuEl.__wdgPortaled) return;
      const parent = menuEl.__wdgReturnParent;
      menuEl.__wdgPortaled = false;
      menuEl.__wdgReturnParent = null;
      try {
        if (parent) parent.appendChild(menuEl);
      } catch {
        // ignore
      }
    }

    function closeAll() {
      // Fecha menus em todo o documento (inclui os que foram "portalados")
      qsa('[data-userpick-menu="1"]').forEach(m => {
        m.hidden = true;
        m.innerHTML = '';
        unportalMenu(m);
      });
    }

    // Fecha ao clicar fora
    if (!document.body.__wdgUserPickBound) {
      document.body.__wdgUserPickBound = true;
      document.addEventListener('mousedown', (ev) => {
        const t = ev.target;
        if (!t) return;
        const insidePicker = t.closest && t.closest('[data-userpick="1"]');
        // Importante: o menu pode ser "portalado" para o body (fora do picker).
        // Então, clicks dentro do menu também devem ser considerados "inside".
        const insideMenu = t.closest && t.closest('[data-userpick-menu="1"]');
        if (!insidePicker && !insideMenu) {
          qsa('[data-userpick-menu="1"]').forEach(m => {
            m.hidden = true;
            m.innerHTML = '';
            unportalMenu(m);
          });
        }
      });
    }

    pickers.forEach(p => {
      if (p.__wdgBound) return;
      p.__wdgBound = true;
      const input = qs('input[data-op-user]', p);
      const menu = qs('[data-userpick-menu="1"]', p);
      const hiddenValue = qs('input[data-op-user-value]', p);
      const isPro = p.getAttribute('data-userpick-pro') === '1' || (p.classList && p.classList.contains('wdg-userpick-pro'));

      const proSelected = isPro ? qs('[data-userpick-selected]', p) : null;
      const proAvatar = isPro ? qs('[data-userpick-sel-avatar]', p) : null;
      const proName = isPro ? qs('[data-userpick-sel-name]', p) : null;
      const proMeta = isPro ? qs('[data-userpick-sel-meta]', p) : null;
      const proClear = isPro ? qs('[data-userpick-clear]', p) : null;
      const proField = isPro ? qs('.wdg-userpick-field', p) : null;

      if (!input || !menu) return;

      const isCompact = p.getAttribute('data-userpick-compact') === '1';
      const mode = p.getAttribute('data-userpick-mode') || '';
      const keepOpenAfterSelect = isCompact && mode === 'recipients';

      function setProSelectedState(enabled) {
        if (!isPro) return;
        if (proSelected) proSelected.hidden = !enabled;
        if (proClear) proClear.hidden = !enabled;
        if (enabled) p.classList.add('wdg-userpick-has'); else p.classList.remove('wdg-userpick-has');
      }

      function setProDisplay(meta) {
        if (!isPro) return;
        const email = String(meta?.email || '').trim();
        const display = String(meta?.display || '').trim();
        const photo = String(meta?.fotoUrl || '').trim();
        const suffix = String(meta?.suffix || '').trim();

        const avatarSrc = photo || resolveUserPhotoUrl(null, basePath, email) || defaultUserAvatarUrl;
        if (proAvatar) proAvatar.src = avatarSrc;

        if (proName) proName.textContent = display || email || '';

        // Linha de meta: e-mail + badge
        const metaBits = [];
        if (email) metaBits.push(email);
        if (suffix) metaBits.push(suffix);
        if (proMeta) proMeta.textContent = metaBits.filter(Boolean).join(' · ');

        // Input vira “busca”, não exibição.
        input.value = '';
        input.placeholder = 'Trocar usuário…';
        setProSelectedState(true);
      }

      function pickUserSuffix(u) {
        try {
          const perms = Array.isArray(u?.perms) ? u.perms : [];
          const vinculos = Array.isArray(u?.vinculos) ? u.vinculos : [];
          const mora = perms.includes('Mora') || vinculos.some(v => !!v?.morador);
          if (mora) {
            const v = vinculos.find(v => !!v?.morador && String(v?.hab_label || '').trim()) || vinculos.find(v => String(v?.hab_label || '').trim());
            const hab = String(v?.hab_label || '').trim();
            if (hab) return hab.replace(/\s*-\s*/g, ', ');
            return '';
          }

          if (u && (u.is_funcionario || /func|colab/i.test(String(u.role || '')))) return 'Colaborador';
        } catch {}
        return '';
      }

      function formatPickedUserDisplay(u, fallbackLabel) {
        const name = String(u?.nome || '').trim() || String(fallbackLabel || '').trim() || String(u?.email || '').trim();
        const suffix = pickUserSuffix(u);
        if (!suffix) return name;
        return `${name} (${suffix})`;
      }

      function setPickedVisuals(meta) {
        if (!meta || typeof meta !== 'object') return;
        const email = String(meta.email || '').trim();
        const display = String(meta.display || '').trim();
        const fotoUrl = String(meta.fotoUrl || '').trim();

        const suffix = String(meta.suffix || '').trim();

        if (hiddenValue) hiddenValue.value = email;

        if (isPro) {
          setProDisplay({ email, display, fotoUrl, suffix });
          return;
        }

        if (display) input.value = display;
      }

      function looksLikeEmail(v) {
        const s = String(v || '').trim();
        return !!(s && s.includes('@') && s.length >= 5);
      }

      // Quando a tela já vem com operadores salvos (e-mail), queremos exibir nome + sufixo.
      // Mantemos o e-mail real no hidden, para salvar corretamente.
      function hydrateFromCurrentValue() {
        if (!isPro) return;
        const raw = String(input.value || '').trim();
        if (!raw) return;

        // Não sobrescreve se já está com um texto “bonito” e hidden preenchido.
        if (hiddenValue && String(hiddenValue.value || '').trim()) return;

        const candidateEmail = looksLikeEmail(raw) ? raw : '';
        if (!candidateEmail) return;

        void (async () => {
          try {
            const users = await fetchUsuariosList(basePath);
            const key = normalizeEmailKey(candidateEmail);
            const u = key ? (users || []).find(x => normalizeEmailKey(x?.email) === key) : null;

            const fotoUrl = u?.fotoUrl
              ? String(u.fotoUrl)
              : resolveUserPhotoUrl(u, basePath, candidateEmail);

            const suffix = u ? pickUserSuffix(u) : '';
            const name = String(u?.nome || '').trim() || candidateEmail;
            const display = suffix ? `${name} (${suffix})` : name;

            setPickedVisuals({ email: candidateEmail, display, fotoUrl, suffix });
          } catch {
            // fallback: pelo menos mantém o e-mail real
            if (hiddenValue) hiddenValue.value = candidateEmail;
            setPickedVisuals({ email: candidateEmail, display: candidateEmail, fotoUrl: resolveUserPhotoUrl(null, basePath, candidateEmail) || '' });
          }
        })();
      }

      hydrateFromCurrentValue();

      if (isPro && proClear && !proClear.__wdgBound) {
        proClear.__wdgBound = true;
        proClear.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (hiddenValue) hiddenValue.value = '';
          input.value = '';
          input.placeholder = 'Selecionar usuário';
          setProSelectedState(false);
          try { input.focus(); } catch {}
          openMenu();
        });
      }

      if (isPro && proField && !proField.__wdgBound) {
        proField.__wdgBound = true;
        proField.addEventListener('mousedown', () => {
          try { input.focus(); } catch {}
        });
      }

      function positionMenuFixed() {
        if (menu.hidden) return;

        const rect = input.getBoundingClientRect();
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;

        let width = Math.max(isCompact ? 320 : 260, Math.ceil(rect.width));
        width = Math.min(width, Math.max(260, viewportW - 16));

        const spaceBelow = Math.max(0, viewportH - rect.bottom);
        const spaceAbove = Math.max(0, rect.top);
        const preferUp = spaceBelow < 240 && spaceAbove > spaceBelow;

        // Reserva uma folga para não colar nas bordas.
        const pad = 8;

        let maxH = 320;
        if (preferUp) {
          maxH = Math.max(160, Math.min(320, spaceAbove - (pad * 2)));
        } else {
          maxH = Math.max(160, Math.min(320, spaceBelow - (pad * 2)));
        }

        let left = Math.floor(rect.left);
        if (left + width > viewportW - pad) left = Math.max(pad, Math.floor(viewportW - pad - width));
        if (left < pad) left = pad;

        let top;
        if (preferUp) {
          top = Math.max(pad, Math.floor(rect.top - 6 - maxH));
        } else {
          top = Math.min(Math.max(pad, Math.floor(rect.bottom + 6)), Math.max(pad, Math.floor(viewportH - pad - maxH)));
        }

        menu.style.position = 'fixed';
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.width = `${width}px`;
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
        menu.style.maxHeight = `${maxH}px`;
        menu.style.overflowY = 'auto';
        menu.style.overscrollBehavior = 'contain';
        menu.style.zIndex = '3000';
      }

      function ensureRepositionBound() {
        if (p.__wdgUserpickRepositionBound) return;
        p.__wdgUserpickRepositionBound = true;

        const handler = () => {
          if (!menu.hidden) positionMenuFixed();
        };

        // Reposiciona em scroll/resize (inclui scroll de container com overflow).
        window.addEventListener('resize', handler);
        window.addEventListener('scroll', handler, true);

        const scroller = p.closest && p.closest('.table-responsive');
        if (scroller) scroller.addEventListener('scroll', handler, { passive: true });
      }

      function updateCompactSize() {
        if (!isCompact) return;
        // width em "ch" via atributo size (muda conforme digita)
        const len = String(input.value || '').length;
        input.size = Math.max(1, Math.min(32, len + 1));
      }
      updateCompactSize();

      let _debounceT = null;
      let _itemsCache = null;
      let _itemsCacheAt = 0;

      async function renderMenu() {
        const token = menu.__wdgToken || 0;
        const q = normalizeText(input.value);

        if (mode === 'recipients') {
          const ctx = getCtx();
          // Cache leve para evitar remapear listas grandes a cada tecla.
          const now = Date.now();
          if (!_itemsCache || (now - _itemsCacheAt) > 60_000) {
            // Garante que as caixas públicas (destinatários) estejam disponíveis.
            try { await syncRecipientMailboxesFromServer(basePath); } catch {}
            const users = await fetchUsuariosList(basePath);

            // Se o menu foi fechado/trocado durante o await, não reabrir.
            if ((menu.__wdgToken || 0) !== token || menu.hidden) return;
            // Para grupos: permitir adicionar "caixas" (do tipo grupo), mas não caixas pessoais.
            const boxes = buildAllMailboxesForRecipients(ctx)
              .filter(b => String(b?.type || '').toLowerCase() !== 'pessoal');

            const userItems = (() => {
              const out = [];
              (users || []).forEach(u => {
                const nome = u?.nome || '';
                const email = u?.email || '';
                const fotoUrl = u?.fotoUrl || '';
                const perms = Array.isArray(u?.perms) ? u.perms : [];
                const vinculosAll = Array.isArray(u?.vinculos) ? u.vinculos : [];
                const is_funcionario = !!u?.is_funcionario;
                const role = String(u?.role || '').trim();

                const emailLower = String(email || '').trim().toLowerCase();
                const isEmailish = !!(emailLower && emailLower.includes('@') && emailLower.length >= 5);

                const habVinculos = vinculosAll
                  .filter(v => v && String(v?.habitacao_id || '').trim() && String(v?.hab_label || '').trim())
                  .map(v => ({
                    habitacao_id: String(v.habitacao_id).trim(),
                    hab_label: String(v.hab_label).trim(),
                    morador: !!v.morador,
                    proprietario: !!v.proprietario,
                    inquilino: !!v.inquilino
                  }));

                // Portal por habitação: expande em 1 item por vínculo (quando houver)
                        // Caixa pessoal é 1 por usuário: não expandir em 1 item por habitação.
                        // Mantém os vínculos no item (para busca/sufixo), mas lista o usuário apenas uma vez.
                        if (isEmailish && !is_funcionario && habVinculos.length) {
                          const habKey = habVinculos.map(v => String(v?.hab_label || '').trim()).filter(Boolean).join(' ');
                          out.push({
                            kind: 'user',
                            key: normalizeText(`${nome} ${emailLower} ${habKey}`),
                            nome,
                            email: emailLower,
                            fotoUrl,
                            perms,
                            vinculos: habVinculos,
                            is_funcionario,
                            role,
                            origem: 'portal',
                            habitacao_id: '',
                            ownerKey: `${emailLower}::portal`
                          });
                          return;
                        }

                // Colaborador: mantém como 1 item, mas com ownerKey (para bater com o runtime novo)
                if (isEmailish && (is_funcionario || /func|colab/i.test(role))) {
                  out.push({
                    kind: 'user',
                    key: normalizeText(`${nome} ${emailLower}`),
                    nome,
                    email: emailLower,
                    fotoUrl,
                    perms,
                    vinculos: vinculosAll,
                    is_funcionario,
                    role,
                    origem: 'colaborador',
                    habitacao_id: '',
                    ownerKey: `${emailLower}::colab`
                  });
                  return;
                }

                // Portal genérico (sem hab): mantém 1 item
                out.push({
                  kind: 'user',
                  key: normalizeText(`${nome} ${email}`),
                  nome,
                  email,
                  fotoUrl,
                  perms,
                  vinculos: vinculosAll,
                  is_funcionario,
                  role,
                  origem: isEmailish ? 'portal' : '',
                  habitacao_id: '',
                  ownerKey: isEmailish ? `${emailLower}::portal` : ''
                });
              });
              return out;
            })();

            const boxItems = boxes
              .filter(b => b && b.id && b.name)
              .map(b => ({
                kind: 'mailbox',
                key: normalizeText(`${b.name} ${b.unitName || ''}`),
                mailboxId: b.id,
                name: b.name,
                unitName: b.unitName || '',
                linkType: b.linkType || b.link_type || '',
                linkId: b.linkId || b.link_id || ''
              }));

            _itemsCache = { userItems, boxItems };
            _itemsCacheAt = now;
          }

          let userItems = _itemsCache.userItems;
          let boxItems = _itemsCache.boxItems;

          // Regras de permissão (Configuração > Geral) aplicadas somente em "Nova mensagem".
          // Não interfere em responder/encaminhar (reply/forward), que usam prefill.
          try {
            const inCompose = !!p.closest?.('[data-compose-adder]');
            const composeHost = p.closest?.('[data-compose-kind]');
            const composeKind = String(composeHost?.dataset?.composeKind || '').trim() || 'new';
            if (inCompose && composeKind === 'new') {
              const perms = await ensureMyRecipientPerms(basePath);

              // Se o menu foi fechado/trocado durante o await, não reabrir.
              if ((menu.__wdgToken || 0) !== token || menu.hidden) return;

              const p = (perms && typeof perms === 'object' && perms.perms && typeof perms.perms === 'object') ? perms.perms : null;

              // Portal: Pessoal→Pessoal depende também do flag global da unidade.
              const allowPortalUsers = !!(
                (perms && typeof perms === 'object' && 'effectiveAllowP2P' in perms)
                  ? !!perms.effectiveAllowP2P
                  : (p ? (p.permitir_pessoal_para_pessoal !== false) : true)
              );
              const allowColabUsers = !!(p ? (p.permitir_pessoal_para_colaborador !== false) : true);
              const allowHabitacaoMailboxes = !!(p ? (p.permitir_pessoal_para_habitacao !== false) : true);

              // Pessoas: filtra conforme flags (sem zerar sempre).
              userItems = (Array.isArray(userItems) ? userItems : []).filter(it => {
                const origem = String(it?.origem || '').trim().toLowerCase();
                const ownerKey = String(it?.ownerKey || '').trim().toLowerCase();
                const isColab = origem === 'colaborador' || ownerKey.includes('::colab');
                const isPortal = origem === 'portal' || ownerKey.includes('::portal');
                if (isColab) return allowColabUsers;
                if (isPortal) return allowPortalUsers;
                // fallback: se não souber classificar, mantém apenas se houver alguma permissão ativa
                return allowPortalUsers || allowColabUsers;
              });

              // Caixas de habitação: quando desativado, manter apenas as caixas já acessíveis ao usuário (normalmente, a própria).
              if (!allowHabitacaoMailboxes) {
                const mine = buildAllMailboxes(ctx);
                const allowedHabMailboxIds = new Set(
                  (Array.isArray(mine) ? mine : [])
                    .filter(m => String(m?.linkType || m?.link_type || '').trim().toLowerCase() === 'habitacao')
                    .map(m => String(m?.id || '').trim())
                    .filter(Boolean)
                );

                boxItems = (Array.isArray(boxItems) ? boxItems : []).filter(it => {
                  const lt = String(it?.linkType || it?.link_type || '').trim().toLowerCase();
                  if (lt !== 'habitacao') return true;
                  const id = String(it?.mailboxId || '').trim();
                  return id && allowedHabMailboxIds.has(id);
                });
              }
            }
          } catch {
            // Se falhar (rede/etc), não bloqueia o fluxo.
          }

          // UX: as Caixas não podem “sumir” por causa do limite de itens.
          // Mantém um limite para pessoas (usuários), mas deixa a lista de caixas bem maior.
          const filteredUsers = q ? userItems.filter(it => it.key.includes(q)) : userItems;
          const filteredBoxes = q ? boxItems.filter(it => it.key.includes(q)) : boxItems;

          const MAX_USERS = 80;
          const MAX_BOXES = 500;
          const topBoxes = filteredBoxes.slice(0, MAX_BOXES);
          const topUsers = filteredUsers.slice(0, MAX_USERS);
          const top = [...topBoxes, ...topUsers];

          menu.innerHTML = top.map(it => {
            if (it.kind === 'mailbox') {
              const value = `mailbox:${it.mailboxId}`;
              const full = `${it.name || ''}${it.unitName ? ' - ' + it.unitName : ''}`.trim();
              return [
                `<button type="button" class="wdg-userpick-item" data-userpick-value="${escapeHtml(value)}" title="${escapeHtml(full)}">`,
                `  <img class="wdg-userpick-avatar" src="${escapeHtml(caixaAvatarUrl)}" alt="">`,
                '  <span class="wdg-userpick-meta">',
                `    <span class="wdg-userpick-name">${escapeHtml(it.name)}</span>`,
                '    <span class="wdg-userpick-email">Caixa</span>',
                '  </span>',
                '</button>'
              ].join('');
            }

            const displayName = it.nome || it.email || '';
            const displayEmail = it.email || '';
            const ownerKey = String(it.ownerKey || '').trim();
            const origem = String(it.origem || '').trim();
            const habitacaoId = String(it.habitacao_id || '').trim();
            const value = ownerKey ? `userkey:${ownerKey}` : (it.email ? `user:${it.email}` : `user:${displayName}`);
            const suffix = pickUserSuffix(it);
            const display = formatPickedUserDisplay(it, displayName);
            const full = `${displayName || ''}${displayEmail ? ' (' + displayEmail + ')' : ''}`.trim();
            return [
              `<button type="button" class="wdg-userpick-item" data-userpick-kind="user" data-userpick-email="${escapeHtml(it.email || '')}" data-userpick-name="${escapeHtml(displayName)}" data-userpick-suffix="${escapeHtml(String(suffix || ''))}" data-userpick-display="${escapeHtml(String(display || displayName || ''))}" data-userpick-photo="${escapeHtml(it.fotoUrl || '')}" data-userpick-ownerkey="${escapeHtml(ownerKey)}" data-userpick-origem="${escapeHtml(origem)}" data-userpick-habitacaoid="${escapeHtml(habitacaoId)}" data-userpick-value="${escapeHtml(value)}" title="${escapeHtml(full)}">`,
              `  <img class="wdg-userpick-avatar" src="${escapeHtml(it.fotoUrl || defaultUserAvatarUrl)}" alt="" onerror="if(!this.dataset.altTried && '${escapeHtml(computeAltPhotoUrl(it.fotoUrl || ''))}'){this.dataset.altTried='1';this.onerror=function(){this.onerror=null;this.src='${escapeHtml(defaultUserAvatarUrl)}';};this.src='${escapeHtml(computeAltPhotoUrl(it.fotoUrl || ''))}';}else{this.onerror=null;this.src='${escapeHtml(defaultUserAvatarUrl)}';}">`,
              '  <span class="wdg-userpick-meta">',
              `    <span class="wdg-userpick-name">${escapeHtml(displayName)}</span>`,
              `    <span class="wdg-userpick-email">${escapeHtml(displayEmail)}</span>`,
              '  </span>',
              '</button>'
            ].join('');
          }).join('');

          if (!top.length) {
            menu.hidden = true;
            menu.innerHTML = '';
            unportalMenu(menu);
            return;
          }
        } else {
          const all = await fetchUsuariosList(basePath);

          // Se o menu foi fechado/trocado durante o await, não reabrir.
          if ((menu.__wdgToken || 0) !== token || menu.hidden) return;

          const filtered = q
            ? all.filter(u => u.key.includes(q))
            : all;
          const top = filtered.slice(0, 60);

          menu.innerHTML = top
            .map(u => {
              const displayName = u.nome || u.email || '';
              const displayEmail = u.email || '';
              const value = u.email || u.nome || '';
              const suffix = pickUserSuffix(u);
              const display = formatPickedUserDisplay(u, displayName);
              return [
                `<button type="button" class="wdg-userpick-item" data-userpick-kind="user" data-userpick-email="${escapeHtml(String(u.email || '').trim())}" data-userpick-name="${escapeHtml(String(u.nome || displayName || '').trim())}" data-userpick-suffix="${escapeHtml(String(suffix || ''))}" data-userpick-display="${escapeHtml(String(display || displayName || ''))}" data-userpick-photo="${escapeHtml(String(u.fotoUrl || ''))}" data-userpick-value="${escapeHtml(value)}">`,
                `  <img class="wdg-userpick-avatar" src="${escapeHtml(u.fotoUrl)}" alt="" onerror="if(!this.dataset.altTried && '${escapeHtml(computeAltPhotoUrl(u.fotoUrl || ''))}'){this.dataset.altTried='1';this.onerror=function(){this.onerror=null;this.src='${escapeHtml(defaultUserAvatarUrl)}';};this.src='${escapeHtml(computeAltPhotoUrl(u.fotoUrl || ''))}';}else{this.onerror=null;this.src='${escapeHtml(defaultUserAvatarUrl)}';}">`,
                '  <span class="wdg-userpick-meta">',
                `    <span class="wdg-userpick-name">${escapeHtml(displayName)}</span>`,
                `    <span class="wdg-userpick-email">${escapeHtml(displayEmail)}</span>`,
                '  </span>',
                '</button>'
              ].join('');
            })
            .join('');
        }

        // Evita aparecer "depois" quando o foco já saiu do campo.
        if ((menu.__wdgToken || 0) !== token || (document.activeElement !== input && !keepOpenAfterSelect)) return;
        menu.hidden = false;
      }

      function showLoadingMenu() {
        menu.hidden = false;
        menu.innerHTML = '<div class="px-2 py-2 text-muted small">Carregando...</div>';
        portalMenu(menu);
        ensureRepositionBound();
        positionMenuFixed();
      }

      function openMenu() {
        menu.__wdgToken = (menu.__wdgToken || 0) + 1;
        closeAll();
        showLoadingMenu();
        void renderMenu()
          .then(() => {
            if (!menu.hidden) {
              ensureRepositionBound();
              positionMenuFixed();
            }
          })
          .catch(() => {
            // silencioso
            menu.innerHTML = '<div class="px-2 py-2 text-muted small">Falha ao carregar.</div>';
          });
      }

      function refreshMenu() {
        if (menu.hidden) return;
        void renderMenu()
          .then(() => {
            if (!menu.hidden) positionMenuFixed();
          })
          .catch(() => {
            // silencioso
          });
      }

      // Delegação: evita adicionar listeners em dezenas de itens a cada render.
      if (!menu.__wdgBound) {
        menu.__wdgBound = true;

        // Marca interação com o menu para impedir que o blur do input feche o menu
        // quando o usuário clica/arrasta a barra de rolagem.
        const markInteract = () => {
          menu.__wdgInteracting = true;
          clearTimeout(menu.__wdgInteractingT);
          menu.__wdgInteractingT = setTimeout(() => { menu.__wdgInteracting = false; }, 300);
        };
        menu.addEventListener('pointerdown', markInteract);
        menu.addEventListener('wheel', markInteract, { passive: true });

        menu.addEventListener('mousedown', (ev) => {
          const btn = ev.target?.closest?.('[data-userpick-value]');
          if (btn) ev.preventDefault();
        });
        menu.addEventListener('click', (ev) => {
          const btn = ev.target?.closest?.('[data-userpick-value]');
          if (!btn) return;
          const v = btn.getAttribute('data-userpick-value') || '';

          // Meta do item (para exibir foto/nome no campo após selecionar)
          const kind = btn.getAttribute('data-userpick-kind') || '';
          const email = btn.getAttribute('data-userpick-email') || '';
          const nome = btn.getAttribute('data-userpick-name') || '';
          const fotoUrl = btn.getAttribute('data-userpick-photo') || '';
          const display = btn.getAttribute('data-userpick-display') || '';
          const suffix = btn.getAttribute('data-userpick-suffix') || '';
          const ownerKey = btn.getAttribute('data-userpick-ownerkey') || '';
          const origem = btn.getAttribute('data-userpick-origem') || '';
          const habitacao_id = btn.getAttribute('data-userpick-habitacaoid') || '';
          const computedDisplay = (kind === 'user')
            ? (display || (suffix ? `${nome} (${suffix})` : nome))
            : '';

          // Para permitir múltiplas inserções sem precisar "clicar fora",
          // mantém o input focado e reabre a lista no modo compacto/recipients.
          if (keepOpenAfterSelect) {
            input.value = '';
            updateCompactSize();
          } else {
            // Para usuários, mostra nome + sufixo (não apenas e-mail)
            if (kind === 'user') {
              setPickedVisuals({ email, display: computedDisplay || v, fotoUrl, suffix });
            } else {
              input.value = v;
              if (hiddenValue) hiddenValue.value = '';
            }
          }

          input.focus();

          try {
            p.dispatchEvent(new CustomEvent('wdg:userpick', {
              detail: { value: v, kind, email, nome, fotoUrl, display: computedDisplay || '', suffix, ownerKey, origem, habitacao_id },
              bubbles: true
            }));
          } catch {
            // noop
          }

          if (keepOpenAfterSelect) {
            void refreshMenu();
          } else {
            menu.hidden = true;
            menu.innerHTML = '';
            unportalMenu(menu);
          }
        });
      }

      input.addEventListener('focus', () => {
        openMenu();
      });

      // Se já está focado, clique não dispara focus — então abre no clique também.
      input.addEventListener('mousedown', () => {
        openMenu();
      });

      input.addEventListener('input', () => {
        updateCompactSize();
        if (isPro) setProSelectedState(false);
        if (_debounceT) clearTimeout(_debounceT);
        _debounceT = setTimeout(() => void refreshMenu(), 120);
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          menu.hidden = true;
          menu.innerHTML = '';
          unportalMenu(menu);
        }
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          // Se o foco foi para dentro do picker OU do menu portalado, não fecha.
          if (document.activeElement && (p.contains(document.activeElement) || menu.contains(document.activeElement))) return;
          // Se o usuário está interagindo com o menu (scrollbar/rolagem), não fecha.
          if (menu.__wdgInteracting) return;
          menu.hidden = true;
          menu.innerHTML = '';
          unportalMenu(menu);
        }, 120);
      });
    });
  }

  // Editor de operadores/permissões: layout compacto em 2 colunas
  // Matriz 2x3 (2 linhas, 3 colunas): 6 permissões exibidas em blocos equilibrados.
  const OPS_PERMS_COL_1 = ['administrar', 'gerenciarMarcador'];
  const OPS_PERMS_COL_2 = ['lerMensagem', 'criarMensagem'];
  const OPS_PERMS_COL_3 = ['gerenciarGrupos', 'excluirMensagem'];

  function getPermissionDef(key) {
    return PERMISSIONS.find(p => p.key === key) || { key, label: String(key || '') };
  }

  function renderPermCheckbox(opIdx, permKey, checked, opts) {
    const def = getPermissionDef(permKey);
    const id = `op_${opIdx}_${def.key}`;
    const disabled = !!(opts && typeof opts === 'object' && opts.disabled);
    return [
      '<div class="wdg-cfg-permitem">',
      `  <input class="form-check-input" type="checkbox" id="${escapeHtml(id)}" data-perm="${escapeHtml(def.key)}" ${checked ? 'checked' : ''}${disabled ? ' disabled' : ''}>`,
      `  <label class="wdg-cfg-permlabel" for="${escapeHtml(id)}">${escapeHtml(def.label)}</label>`,
      '</div>'
    ].join('\n');
  }

  function renderPermissionsCell(op, idx) {
    const p1 = OPS_PERMS_COL_1.map(k => renderPermCheckbox(idx, k, !!(op?.perms && op.perms[k]))).join('');
    const p2 = OPS_PERMS_COL_2.map(k => renderPermCheckbox(idx, k, !!(op?.perms && op.perms[k]))).join('');
    const p3 = OPS_PERMS_COL_3.map(k => renderPermCheckbox(idx, k, !!(op?.perms && op.perms[k]))).join('');
    return [
      '<div class="wdg-cfg-permscols">',
      `  <div class="wdg-cfg-permscol">${p1}</div>`,
      `  <div class="wdg-cfg-permscol">${p2}</div>`,
      `  <div class="wdg-cfg-permscol">${p3}</div>`,
      '</div>'
    ].join('\n');
  }

  function renderPermissionsCellReadOnly(op, idx) {
    const p1 = OPS_PERMS_COL_1.map(k => renderPermCheckbox(idx, k, !!(op?.perms && op.perms[k]), { disabled: true })).join('');
    const p2 = OPS_PERMS_COL_2.map(k => renderPermCheckbox(idx, k, !!(op?.perms && op.perms[k]), { disabled: true })).join('');
    const p3 = OPS_PERMS_COL_3.map(k => renderPermCheckbox(idx, k, !!(op?.perms && op.perms[k]), { disabled: true })).join('');
    return [
      '<div class="wdg-cfg-permscols" aria-disabled="true">',
      `  <div class="wdg-cfg-permscol">${p1}</div>`,
      `  <div class="wdg-cfg-permscol">${p2}</div>`,
      `  <div class="wdg-cfg-permscol">${p3}</div>`,
      '</div>'
    ].join('\n');
  }

  function renderPermsReadOnlyText(op) {
    try {
      const perms = (op && typeof op === 'object' && op.perms && typeof op.perms === 'object') ? op.perms : {};
      const labels = PERMISSIONS
        .filter(p => perms && perms[p.key])
        .map(p => p.label)
        .filter(Boolean);
      if (!labels.length) return '<span class="text-muted">—</span>';
      return `<span>${escapeHtml(labels.join(', '))}</span>`;
    } catch {
      return '<span class="text-muted">—</span>';
    }
  }

  function renderOpsViewerTable(operators) {
    const rows = coerceOperators(operators);
    const thead = [
      '<thead>',
      '  <tr>',
      '    <th style="min-width:320px;">Usuário</th>',
      '    <th>Permissões</th>',
      '  </tr>',
      '</thead>'
    ].join('\n');

    const bodyRows = (rows.length ? rows : [{ user: '', perms: {}, displayName: '' }]);
    const tbody = [
      '<tbody>',
      ...bodyRows.map((op, idx) => {
        const rawUser = String(op?.user || '').trim();
        const display = String(op?.displayName || '').trim();
        const user = display || rawUser;
        return [
          '<tr>',
          `  <td>${user ? escapeHtml(user) : '<span class="text-muted">—</span>'}</td>`,
          `  <td>${renderPermissionsCellReadOnly(op, idx)}</td>`,
          '</tr>'
        ].join('\n');
      }),
      '</tbody>'
    ].join('\n');

    return `<table class="table table-sm align-middle" aria-label="Usuários e permissões">${thead}${tbody}</table>`;
  }

  function renderOpsEditorRow(op, idx) {
    return [
      `<tr data-op-row="1" data-op-idx="${escapeHtml(String(idx))}">`,
      `  <td class="wdg-cfg-td-user" style="min-width:380px;">${buildUserPickCompactHtml(op.user)}</td>`,
      `  <td class="wdg-cfg-td-perms" style="min-width:720px;">${renderPermissionsCell(op, idx)}</td>`,
      '  <td class="wdg-cfg-td-action text-center" style="min-width:120px;">',
      '    <button type="button" class="btn p-0" data-op-remove aria-label="Remover" style="border:0;background:transparent;box-shadow:none;outline:none;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;">'
      + '      <img src="/images/remover.png" alt="Remover" style="width:28px;height:28px;object-fit:contain;display:block;">'
      + '    </button>',
      '  </td>',
      '</tr>'
    ].join('\n');
  }

  function buildOperatorsRowHtml(idx) {
    return renderOpsEditorRow({ user: '', perms: {} }, idx);
  }

  function renderConfiguracaoOverview(bodyEl) {
    bodyEl.innerHTML = [
      '<div class="wdg-msg-empty" style="text-align:left;">',
      '  <strong>Configuração</strong><br>',
      '  ',
      '</div>'
    ].join('\n');
  }

  function renderConfiguracaoGeral(bodyEl) {
    const bp = getSafePageBasePath(document.body?.dataset?.basePath || '') || '/condominios';
    bodyEl.innerHTML = [
      '<div id="wdgMsgCfgGeralRoot">',
      '  <section class="wdg-cfg-hero p-4 mb-4">',
      '    <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">',
      '      <div>',
      '        <h1 class="h4 mb-0">Geral</h1>',
      '      </div>',
      '      <div></div>',
      '    </div>',
      '',
      '    <div class="row g-3 mt-3">',
      '      <div class="col-12">',
      '        <label class="form-label" for="cfgUnidade">Condomínio (Unidade)</label>',
      '        <select id="cfgUnidade" class="form-select">',
      '          <option value="">Carregando…</option>',
      '        </select>',
      '      </div>',
      '      <div class="col-12">',
      '        <div class="wdg-kpi p-3">',
      '          <div class="small wdg-cfg-muted">Período</div>',
      '          <div class="d-flex gap-2 mt-2 flex-wrap">',
      '            <input id="cfgFrom" type="date" class="form-control form-control-sm" style="min-width:160px;max-width:220px;" />',
      '            <input id="cfgTo" type="date" class="form-control form-control-sm" style="min-width:160px;max-width:220px;" />',
      '          </div>',
      '        </div>',
      '      </div>',
      '      <div class="col-12">',
      '        <div class="row g-3">',
      '          <div class="col-12 col-md-6">',
      '            <div class="wdg-kpi p-3 h-100">',
      '              <div class="small wdg-cfg-muted">Totais (usuários)</div>',
      '              <div id="kpiUsers" class="wdg-kpi-totals mt-2" aria-label="Totais por usuários">',
      '                <div class="wdg-kpi-metrics">',
      '                  <div class="wdg-kpi-metric">',
      '                    <div class="wdg-kpi-label">Enviadas</div>',
      '                    <div id="kpiUsersSent" class="wdg-kpi-value">—</div>',
      '                    <div id="kpiUsersSentBytes" class="wdg-kpi-sub">—</div>',
      '                  </div>',
      '                  <div class="wdg-kpi-metric">',
      '                    <div class="wdg-kpi-label">Recebidas</div>',
      '                    <div id="kpiUsersReceived" class="wdg-kpi-value">—</div>',
      '                    <div id="kpiUsersReceivedBytes" class="wdg-kpi-sub">—</div>',
      '                  </div>',
      '                </div>',
      '                <div class="wdg-kpi-chart" id="kpiUsersChart" aria-hidden="true"></div>',
      '              </div>',
      '            </div>',
      '          </div>',
      '          <div class="col-12 col-md-6">',
      '            <div class="wdg-kpi p-3 h-100">',
      '              <div class="small wdg-cfg-muted">Totais (caixas)</div>',
      '              <div id="kpiMailboxes" class="wdg-kpi-totals mt-2" aria-label="Totais por caixas">',
      '                <div class="wdg-kpi-metrics">',
      '                  <div class="wdg-kpi-metric">',
      '                    <div class="wdg-kpi-label">Enviadas</div>',
      '                    <div id="kpiMailboxesSent" class="wdg-kpi-value">—</div>',
      '                    <div id="kpiMailboxesSentBytes" class="wdg-kpi-sub">—</div>',
      '                  </div>',
      '                  <div class="wdg-kpi-metric">',
      '                    <div class="wdg-kpi-label">Recebidas</div>',
      '                    <div id="kpiMailboxesReceived" class="wdg-kpi-value">—</div>',
      '                    <div id="kpiMailboxesReceivedBytes" class="wdg-kpi-sub">—</div>',
      '                  </div>',
      '                </div>',
      '                <div class="wdg-kpi-chart" id="kpiMailboxesChart" aria-hidden="true"></div>',
      '              </div>',
      '            </div>',
      '          </div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </section>',
      '',
      '  <div class="d-grid gap-4">',
      '      <section class="wdg-cfg-card p-4 fw-normal">',
      '        <div class="wdg-cfg-card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">',
      '          <div class="wdg-cfg-card-titlewrap">',
      '            <h2 class="h6 mb-0 wdg-cfg-card-title">Usuários</h2>',
      '          </div>',
      '          <div class="wdg-cfg-card-actions d-flex gap-2 align-items-center">',
      '          </div>',
      '        </div>',
      '        <div class="wdg-users-controls mt-2">',
      '          <select id="cfgUsersPageSize" class="form-select form-select-sm wdg-users-page-size">',
      '            <option value="10">10 por página</option>',
      '            <option value="25">25 por página</option>',
      '            <option value="50" selected>50 por página</option>',
      '            <option value="75">75 por página</option>',
      '            <option value="100">100 por página</option>',
      '          </select>',
      '          <div id="cfgUsersBulkActions" class="wdg-users-bulk" style="display:none"></div>',
      '          <div id="cfgUsersCount" class="wdg-users-summary">—</div>',
      '        </div>',
      '        <div class="table-responsive mt-3 wdg-users-table-wrap">',
      '          <table class="table table-sm align-middle text-center wdg-users-table mb-0">',
      '            <thead id="cfgUsersHead">',
      '              <tr>',
      '                <th><input id="cfgUsersCheckAll" class="form-check-input" type="checkbox" title="Selecionar todos" /></th>',
      '                <th>',
      '                  <div class="wdg-users-th">',
      '                    <button type="button" class="wdg-users-th-label" data-users-sort="nome">NOME <span class="wdg-users-sort-ind" data-users-sort-ind="nome"></span></button>',
      '                    <button type="button" class="wdg-users-th-drop" data-users-filter="nome" title="Filtrar">▾</button>',
      '                  </div>',
      '                </th>',
      '                <th>',
      '                  <div class="wdg-users-th">',
      '                    <button type="button" class="wdg-users-th-label" data-users-sort="email">E-MAIL <span class="wdg-users-sort-ind" data-users-sort-ind="email"></span></button>',
      '                    <button type="button" class="wdg-users-th-drop" data-users-filter="email" title="Filtrar">▾</button>',
      '                  </div>',
      '                </th>',
      '                <th>',
      '                  <div class="wdg-users-th">',
      '                    <button type="button" class="wdg-users-th-label" data-users-sort="origem">ORIGEM <span class="wdg-users-sort-ind" data-users-sort-ind="origem"></span></button>',
      '                    <button type="button" class="wdg-users-th-drop" data-users-filter="origem" title="Filtrar">▾</button>',
      '                  </div>',
      '                </th>',
      '                <th>',
      '                  <div class="wdg-users-th">',
      '                    <button type="button" class="wdg-users-th-label" data-users-sort="habitacao">HABITAÇÃO <span class="wdg-users-sort-ind" data-users-sort-ind="habitacao"></span></button>',
      '                    <button type="button" class="wdg-users-th-drop" data-users-filter="habitacao" title="Filtrar">▾</button>',
      '                  </div>',
      '                </th>',
      '                <th title="Permissões aplicadas apenas para usuários do Portal do Morador">PERMISSÕES (PORTAL)</th>',
      '                <th>',
      '                  <div class="wdg-users-th">',
      '                    <button type="button" class="wdg-users-th-label" data-users-sort="status">STATUS <span class="wdg-users-sort-ind" data-users-sort-ind="status"></span></button>',
      '                    <button type="button" class="wdg-users-th-drop" data-users-filter="status" title="Filtrar">▾</button>',
      '                  </div>',
      '                </th>',
      '                <th>AÇÃO</th>',
      '              </tr>',
      '            </thead>',
      '            <tbody id="cfgUsersTable"><tr><td colspan="8" class="text-muted">Clique em Recarregar para listar usuários.</td></tr></tbody>',
      '          </table>',
      '        </div>',
      '        <div class="wdg-cfg-pager d-flex align-items-center justify-content-between gap-2 mt-2">',
      '          <button id="cfgUsersPrev" class="btn btn-outline-secondary btn-sm fw-normal" type="button">Anterior</button>',
      '          <div id="cfgUsersPageInfo" class="small wdg-cfg-muted fw-normal">—</div>',
      '          <button id="cfgUsersNext" class="btn btn-outline-secondary btn-sm fw-normal" type="button">Próxima</button>',
      '        </div>',
      '      </section>',

      '      <div class="wdg-cfg-two-col">',

      '      <section class="wdg-cfg-card wdg-cfg-card--mailboxes p-4">',
      '        <div class="wdg-cfg-card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">',
      '          <div class="wdg-cfg-card-titlewrap">',
      '            <h2 class="h6 mb-0 wdg-cfg-card-title">Caixas</h2>',
      '          </div>',
      '          <div class="wdg-cfg-card-actions d-flex gap-2 align-items-center">',
      '          </div>',
      '        </div>',
      '        <div class="wdg-cfg-bottom">',
      '        <div class="wdg-users-controls">',
      '          <select id="cfgMailboxPageSize" class="form-select form-select-sm wdg-users-page-size">',
      '            <option value="10">10 por página</option>',
      '            <option value="25">25 por página</option>',
      '            <option value="50" selected>50 por página</option>',
      '            <option value="75">75 por página</option>',
      '            <option value="100">100 por página</option>',
      '          </select>',
      '          <div id="cfgMailboxBulkActions" class="wdg-users-bulk" style="display:none"></div>',
      '          <div id="cfgMailboxSummary" class="wdg-users-summary">—</div>',
      '        </div>',
      '        <div class="table-responsive wdg-mailbox-table-wrap">',
      '          <table class="table table-sm align-middle text-center wdg-mailbox-table mb-0">',
      '            <thead id="cfgMailboxHead">',
      '              <tr>',
      '                <th><input id="cfgMailboxCheckAll" class="form-check-input" type="checkbox" title="Selecionar todos" /></th>',
      '                <th>',
      '                  <div class="wdg-users-th">',
      '                    <button type="button" class="wdg-users-th-label" data-mb-sort="name">CAIXA <span class="wdg-users-sort-ind" data-mb-sort-ind="name"></span></button>',
      '                    <button type="button" class="wdg-users-th-drop" data-mb-filter="name" title="Filtrar">▾</button>',
      '                  </div>',
      '                </th>',
      '                <th>',
      '                  <div class="wdg-users-th">',
      '                    <button type="button" class="wdg-users-th-label" data-mb-sort="status">STATUS <span class="wdg-users-sort-ind" data-mb-sort-ind="status"></span></button>',
      '                    <button type="button" class="wdg-users-th-drop" data-mb-filter="status" title="Filtrar">▾</button>',
      '                  </div>',
      '                </th>',
      '                <th>AÇÃO</th>',
      '              </tr>',
      '            </thead>',
      '            <tbody id="cfgMailboxList"><tr><td colspan="4" class="text-muted">—</td></tr></tbody>',
      '          </table>',
      '        </div>',
      '        <div class="wdg-cfg-pager d-flex align-items-center justify-content-between gap-2 mt-2">',
      '          <button id="cfgMailboxPrev" class="btn btn-outline-secondary btn-sm fw-normal" type="button">Anterior</button>',
      '          <div id="cfgMailboxPageInfo" class="small wdg-cfg-muted">—</div>',
      '          <button id="cfgMailboxNext" class="btn btn-outline-secondary btn-sm fw-normal" type="button">Próxima</button>',
      '        </div>',
      '        </div>',
      '      </section>',

      '      <section class="wdg-cfg-card wdg-cfg-card--metrics p-4">',
      '        <div class="wdg-cfg-card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">',
      '          <div class="wdg-cfg-card-titlewrap">',
      '            <h2 class="h6 mb-0 wdg-cfg-card-title">Métricas</h2>',
      '          </div>',
      '          <div class="wdg-cfg-card-actions">',
      '            <button id="cfgReloadMetrics" class="btn btn-outline-secondary btn-sm"><i class="bi bi-graph-up"></i> Atualizar métricas</button>',
      '          </div>',
      '        </div>',
      '        <ul class="nav nav-pills mt-3" id="metricsTabs" role="tablist">',
      '          <li class="nav-item" role="presentation">',
      '            <button class="nav-link active" id="tabUsers" data-bs-toggle="pill" data-bs-target="#paneUsers" type="button" role="tab">Por usuário</button>',
      '          </li>',
      '          <li class="nav-item" role="presentation">',
      '            <button class="nav-link" id="tabMailboxes" data-bs-toggle="pill" data-bs-target="#paneMailboxes" type="button" role="tab">Por caixa</button>',
      '          </li>',
      '        </ul>',
      '        <div class="wdg-cfg-bottom">',
      '        <div class="tab-content">',
      '          <div class="tab-pane fade show active" id="paneUsers" role="tabpanel">',
      '            <div class="wdg-metrics-controls">',
      '              <select id="metricsUsersPageSize" class="form-select form-select-sm wdg-users-page-size">',
      '                <option value="10">10 por página</option>',
      '                <option value="25" selected>25 por página</option>',
      '                <option value="50">50 por página</option>',
      '              </select>',
      '              <div id="metricsUsersSummary" class="wdg-users-summary">—</div>',
      '            </div>',
      '            <div class="table-responsive wdg-metrics-table-wrap">',
      '              <table class="table table-sm align-middle wdg-metrics-table mb-0">',
      '                <thead id="metricsUsersHead">',
      '                  <tr>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mu-sort="user">USUÁRIO <span class="wdg-users-sort-ind" data-mu-sort-ind="user"></span></button>',
      '                        <button type="button" class="wdg-users-th-drop" data-mu-filter="user" title="Filtrar">▾</button>',
      '                      </div>',
      '                    </th>',
      '                    <th class="text-end">',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mu-sort="sentcount">ENVIADAS <span class="wdg-users-sort-ind" data-mu-sort-ind="sentcount"></span></button>',
      '                      </div>',
      '                    </th>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mu-sort="receivedcount">RECEBIDAS <span class="wdg-users-sort-ind" data-mu-sort-ind="receivedcount"></span></button>',
      '                      </div>',
      '                    </th>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mu-sort="sentbytes">BYTES ENVIADAS <span class="wdg-users-sort-ind" data-mu-sort-ind="sentbytes"></span></button>',
      '                      </div>',
      '                    </th>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mu-sort="receivedbytes">BYTES RECEBIDAS <span class="wdg-users-sort-ind" data-mu-sort-ind="receivedbytes"></span></button>',
      '                      </div>',
      '                    </th>',
      '                  </tr>',
      '                </thead>',
      '                <tbody id="metricsUsers"><tr><td colspan="5" class="text-muted">—</td></tr></tbody>',
      '              </table>',
      '            </div>',
      '            <div class="wdg-cfg-pager d-flex align-items-center justify-content-between gap-2 mt-2">',
      '              <button id="metricsUsersPrev" class="btn btn-outline-secondary btn-sm fw-normal" type="button">Anterior</button>',
      '              <div id="metricsUsersPageInfo" class="small wdg-cfg-muted fw-normal">—</div>',
      '              <button id="metricsUsersNext" class="btn btn-outline-secondary btn-sm fw-normal" type="button">Próxima</button>',
      '            </div>',
      '          </div>',
      '          <div class="tab-pane fade" id="paneMailboxes" role="tabpanel">',
      '            <div class="wdg-metrics-controls">',
      '              <select id="metricsMailboxesPageSize" class="form-select form-select-sm wdg-users-page-size">',
      '                <option value="10">10 por página</option>',
      '                <option value="25" selected>25 por página</option>',
      '                <option value="50">50 por página</option>',
      '              </select>',
      '              <div id="metricsMailboxesSummary" class="wdg-users-summary">—</div>',
      '            </div>',
      '            <div class="table-responsive wdg-metrics-table-wrap">',
      '              <table class="table table-sm align-middle wdg-metrics-table mb-0">',
      '                <thead id="metricsMailboxesHead">',
      '                  <tr>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mm-sort="mailbox">CAIXA <span class="wdg-users-sort-ind" data-mm-sort-ind="mailbox"></span></button>',
      '                        <button type="button" class="wdg-users-th-drop" data-mm-filter="mailbox" title="Filtrar">▾</button>',
      '                      </div>',
      '                    </th>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mm-sort="type">TIPO <span class="wdg-users-sort-ind" data-mm-sort-ind="type"></span></button>',
      '                        <button type="button" class="wdg-users-th-drop" data-mm-filter="type" title="Filtrar">▾</button>',
      '                      </div>',
      '                    </th>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mm-sort="sentcount">ENVIADAS <span class="wdg-users-sort-ind" data-mm-sort-ind="sentcount"></span></button>',
      '                      </div>',
      '                    </th>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mm-sort="receivedcount">RECEBIDAS <span class="wdg-users-sort-ind" data-mm-sort-ind="receivedcount"></span></button>',
      '                      </div>',
      '                    </th>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mm-sort="sentbytes">BYTES ENVIADAS <span class="wdg-users-sort-ind" data-mm-sort-ind="sentbytes"></span></button>',
      '                      </div>',
      '                    </th>',
      '                    <th>',
      '                      <div class="wdg-users-th">',
      '                        <button type="button" class="wdg-users-th-label" data-mm-sort="receivedbytes">BYTES RECEBIDAS <span class="wdg-users-sort-ind" data-mm-sort-ind="receivedbytes"></span></button>',
      '                      </div>',
      '                    </th>',
      '                  </tr>',
      '                </thead>',
      '                <tbody id="metricsMailboxes"><tr><td colspan="6" class="text-muted">—</td></tr></tbody>',
      '              </table>',
      '            </div>',
      '            <div class="wdg-cfg-pager d-flex align-items-center justify-content-between gap-2 mt-2">',
      '              <button id="metricsMailboxesPrev" class="btn btn-outline-secondary btn-sm fw-normal" type="button">Anterior</button>',
      '              <div id="metricsMailboxesPageInfo" class="small wdg-cfg-muted fw-normal">—</div>',
      '              <button id="metricsMailboxesNext" class="btn btn-outline-secondary btn-sm fw-normal" type="button">Próxima</button>',
      '            </div>',
      '          </div>',
      '        </div>',
      '        </div>',
      '      </section>',

      '      </div>',
      '  </div>',
      '',
      '  <div class="position-fixed bottom-0 end-0 p-3" style="z-index: 1080">',
      '    <div id="cfgToast" class="toast" role="alert" aria-live="assertive" aria-atomic="true">',
      '      <div class="toast-header">',
      '        <strong class="me-auto">Configuração</strong>',
      '        <small id="cfgToastHint">agora</small>',
      '        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Fechar"></button>',
      '      </div>',
      '      <div class="toast-body" id="cfgToastBody">—</div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  async function fetchUnidadesList(basePath) {
    const bp = String(basePath || '').trim();
    const altCondoBp = bp && bp.includes('/portal-morador') ? bp.replace('/portal-morador', '/condominios') : '';
    const tries = [
      (bp ? `${bp}/api/unidades` : ''),
      // Portal do Morador normalmente não tem proxy para /api/unidades; usar o módulo condomínios direto.
      (altCondoBp ? `${altCondoBp}/api/unidades` : ''),
      `/condominios/api/unidades`,
      `/api/unidades`
    ];
    for (const url of tries) {
      if (!url) continue;
      try {
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) continue;
        const json = await r.json().catch(() => null);
        const list = (json && (json.unidades || json.data || json)) || [];
        if (Array.isArray(list)) return list;
      } catch {
        // ignore
      }
    }
    return [];
  }

  function formatCnpjBr(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 14) return String(value || '').trim();
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }

  function formatTelefoneBr(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return String(value || '').trim();
  }

  function buildUnitPrintLines(unit) {
    const u = unit && typeof unit === 'object' ? unit : null;
    if (!u) return [];

    const lines = [];

    const endereco = String(u.endereco || '').trim();
    const cidade = String(u.cidade || '').trim();
    const estado = String(u.estado || '').trim();
    const cep = String(u.cepFormatado || u.cep || '').trim();
    const cidadeUf = (cidade && estado) ? `${cidade} - ${estado}` : (cidade || estado);
    const enderecoLineBase = [endereco, cidadeUf].filter(Boolean).join(', ').trim();
    const enderecoLine = (enderecoLineBase && cep)
      ? `${enderecoLineBase}, CEP: ${cep}`
      : (enderecoLineBase || (cep ? `CEP: ${cep}` : ''));
    if (enderecoLine) lines.push(enderecoLine);

    const tels = [u.telefoneCelular, u.telefoneFixo].map(formatTelefoneBr).filter(Boolean);
    const telLine = tels.length ? `Tel.: ${Array.from(new Set(tels)).join(' / ')}` : '';
    const emails = [u.emailPrincipal, u.emailFiscal]
      .map(v => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    const emailLine = emails.length ? `E-mail: ${Array.from(new Set(emails)).join(' / ')}` : '';
    const contatoLine = [telLine, emailLine].filter(Boolean).join(' · ').trim();
    if (contatoLine) lines.push(contatoLine);

    const cnpj = String(u.cnpj || '').trim();
    if (cnpj) lines.push(`CNPJ ${formatCnpjBr(cnpj)}`);

    return lines.slice(0, 4);
  }

  function defaultCreatorPerms() {
    return {
      administrar: true,
      gerenciarMarcador: true,
      lerMensagem: true,
      criarMensagem: true,
      gerenciarGrupos: true,
      excluirMensagem: true
    };
  }

  function coerceOperators(ops) {
    const arr = Array.isArray(ops) ? ops : [];
    return arr
      .map(op => {
        if (typeof op === 'string') return { user: op, perms: {}, displayName: '' };
        if (op && typeof op === 'object') {
          return {
            user: String(op.user || '').trim(),
            perms: (op.perms && typeof op.perms === 'object') ? op.perms : {},
            displayName: String(op.displayName || op.nome || op.name || '').trim()
          };
        }
        return null;
      })
      .filter(Boolean)
      .filter(op => op.user.trim());
  }

  function renderOpsEditorTable(operators) {
    const rows = coerceOperators(operators);
    const thead = [
      '<thead>',
      '  <tr>',
      '    <th style="min-width:380px;">Usuário</th>',
      '    <th style="min-width:720px;">Permissões</th>',
      '    <th class="text-center" style="min-width:120px;">Ação</th>',
      '  </tr>',
      '</thead>'
    ].join('\n');

    const bodyRows = rows.length ? rows : [{ user: '', perms: {} }];
    const tbody = [
      '<tbody>',
      ...bodyRows.map((op, idx) => renderOpsEditorRow(op, idx)),
      '</tbody>'
    ].join('\n');

    return `<table class="table table-sm align-middle" id="cfgOpsTable">${thead}${tbody}</table>`;
  }

  function renderConfiguracaoCaixas(bodyEl) {
    const ctx = getCtx();

    const basePath = getSafePageBasePath(document.body?.dataset?.basePath || '');
    const isPortalMorador = (() => {
      try {
        const bp = String(basePath || '').toLowerCase();
        if (bp.includes('/portal-morador')) return true;
        const b = document.body;
        return !!(b && b.classList && b.classList.contains('pm-home-body'));
      } catch {
        return false;
      }
    })();
    const roleIsMA = isMasterOrAdmin(ctx?.role) || document.body?.dataset?.userMaster === '1';

    // No Portal, o servidor já devolve apenas caixas acessíveis (inclui públicas/habitação quando aplicável).
    // Não filtramos por e-mail/nome local, pois o dataset do Portal pode vir incompleto.
    const memberBoxes = buildAllMailboxes(ctx);
    const customAll = loadCustomMailboxes();
    const memberCustom = isPortalMorador ? customAll : customAll.filter(b => isMailboxMember(b, ctx));

    // Se a seleção atual não existe na lista acessível, volta para uma caixa válida.
    try {
      const exists = memberBoxes.some(b => b && b.id === _currentMailboxId);
      if (!exists) {
        const fallbackId = (memberBoxes.find(b => b && b.id) || {}).id || 'pessoal';
        _currentMailboxId = fallbackId;
        setSelectedMailboxId(fallbackId);
      }
    } catch {
      // noop
    }

    const listRows = memberBoxes.map(b => ({
      id: b.id,
      name: b.name,
      type: b.type,
      unitName: b.unitName || (b.type === 'pessoal' ? '' : ''),
      operators: Array.isArray(b.operators) ? coerceOperators(b.operators).length : (b.type === 'pessoal' ? 1 : 0),
      locked: !!b.locked,
      canAdmin: mailboxCanAdmin(b),
      selected: b.id === _currentMailboxId
    }));

    const editableBoxes = memberCustom
      .filter(b => String(b.type || 'grupo') === 'grupo')
      .filter(b => !isPortalMorador || b.canAdmin === true);

    const selected = getMailboxByIdFromCtx(ctx, _currentMailboxId);
    const selectedIsGroup = selected && selected.type === 'grupo';
    const selectedCanAdmin = mailboxCanAdmin(selected);
    const opsCanEdit = !!(selectedIsGroup && selectedCanAdmin);

    bodyEl.innerHTML = [
      '<div class="wdg-cfg-layout">',

      // Topo: Caixas que você participa
      '  <div class="wdg-card wdg-card-hover mb-3 wdg-cfg-top" style="padding: 1rem 1rem 1.1rem;">',
      '    <div class="wdg-cfg-top-title">Caixas que você participa</div>',
      '    <div class="table-responsive">',
      '      <table class="table table-sm align-middle mb-0">',
      '        <thead class="table-light">',
      '          <tr>',
      '            <th style="font-weight:600; letter-spacing:.02em;">Caixa</th>',
      '            <th style="min-width:140px; font-weight:600; letter-spacing:.02em;">Tipo</th>',
      '            <th style="min-width:220px; font-weight:600; letter-spacing:.02em;">Condomínio</th>',
      '            <th class="text-center" style="min-width:120px; font-weight:600; letter-spacing:.02em;">Operadores</th>',
      '            <th class="text-center" style="min-width:110px; font-weight:600; letter-spacing:.02em;">Ações</th>',
      '          </tr>',
      '        </thead>',
      '        <tbody>',
      ...listRows.map(r => [
        (() => {
          const isCustom = customAll.some(b => b && b.id === r.id);
          const canEdit = !isPortalMorador && !r.locked && isCustom && !!r.canAdmin;
          const canDelete = canEdit;
          const nameEsc = escapeHtml(r.name);
          const idEsc = escapeHtml(r.id);
          return [
        `          <tr class="wdg-cfg-row${r.selected ? ' active' : ''}" data-select-box="${escapeHtml(r.id)}" role="button" tabindex="0" aria-label="Selecionar caixa ${escapeHtml(r.name)}">`,
        '            <td>',
        `              <div class="wdg-cfg-namecell" data-box-id="${idEsc}">`,
        `                <button type="button" class="wdg-cfg-iconbtn" data-box-edit="${idEsc}" aria-label="Editar"${canEdit ? '' : ' disabled'}>`,
        '                  <img src="/images/editar.png" alt="Editar" class="wdg-cfg-icon">',
        '                </button>',
        `                <span class="wdg-cfg-namelabel" data-box-name-label="${idEsc}">${nameEsc}</span>`,
        `                <input class="form-control form-control-sm wdg-cfg-nameinput" data-box-name-input="${idEsc}" name="cfgBoxNameInline" aria-label="Nome da caixa" value="${nameEsc}" maxlength="50" autocomplete="off" style="display:none;">`,
        '              </div>',
        '            </td>',
        `            <td>${escapeHtml(String(r.type || ''))}</td>`,
        `            <td>${escapeHtml(String(r.unitName || (r.type === 'pessoal' ? '-' : '-')))}</td>`,
        `            <td class="text-center">${escapeHtml(String(r.operators || 0))}</td>`,
        '            <td class="text-center">',
        canDelete
          ? `              <button type="button" class="wdg-cfg-iconbtn" data-box-delete="${idEsc}" aria-label="Excluir">` +
            '                <img src="/images/excluir.png" alt="Excluir" class="wdg-cfg-icon">' +
            '              </button>'
          : '              <span class="text-muted">—</span>',
        '            </td>',
        '          </tr>'
          ].join('\n');
        })()
      ].join('\n')),
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',

      // Base: dois blocos lado a lado
      '  <div class="row g-3">',
      ...(isPortalMorador ? [] : [
        '    <div class="col-12 col-lg-3">',
        '      <div class="wdg-card wdg-card-hover wdg-cfg-box" style="padding: .45rem .6rem .6rem;">',
        '        <div class="wdg-cfg-title-big">Criar nova caixa</div>',
        '        <form id="cfgCreateBoxForm" autocomplete="off">',
        '          <div class="row g-2">',
        '            <div class="col-12">',
        '              <label class="form-label fw-normal" for="cfgUnit">Condomínio</label>',
        '              <select class="form-select" id="cfgUnit" required></select>',
        '              <div class="form-text" id="cfgUnitHint"></div>',
        '            </div>',
        '            <div class="col-12">',
        '              <label class="form-label fw-normal" for="cfgBoxName">Nome da caixa</label>',
        '              <input class="form-control" id="cfgBoxName" maxlength="50" required>',
        '            </div>',
        '          </div>',
        '          <div class="d-flex justify-content-end gap-2 mt-2">',
        '            <button type="submit" class="btn btn-primary wdg-btn-regular">Criar caixa</button>',
        '          </div>',
        '        </form>',
        '      </div>',
        '    </div>'
      ]),
      `    <div class="col-12 ${isPortalMorador ? '' : 'col-lg-9'}">`,
      '      <div class="wdg-card wdg-card-hover wdg-cfg-box" style="padding: 1rem 1rem 1.1rem;">',
      '        <div class="wdg-cfg-title">Usuários e Permissões</div>',
      '        <form id="cfgOpsForm" autocomplete="off">',
      '          <div class="mb-2">',
      '            <div><strong>Caixa:</strong> <span id="cfgOpsBoxName" style="font-weight:400;"></span></div>',
      '          </div>',
      '          <div class="mt-3" id="cfgOpsEditor"></div>',
      '          <div class="d-flex justify-content-between align-items-center gap-2 mt-2">',
      `            <button type="button" class="btn btn-outline-secondary wdg-btn-regular" id="cfgAddOp" ${(!selectedIsGroup || !opsCanEdit) ? 'disabled' : ''}>Adicionar usuário</button>`,
      `            <button type="submit" class="btn btn-primary wdg-btn-regular" ${(!selectedIsGroup || !opsCanEdit) ? 'disabled' : ''}>Salvar permissões</button>`,
      '          </div>',
      '        </form>',
      '      </div>',
      '    </div>',
      '  </div>',

      '</div>'
    ].join('\n');

    function selectMailboxById(id) {
      if (!id) return;
      const sel = qs('#msgMailboxSelect');
      if (sel) sel.value = id;
      _currentMailboxId = id;
      setSelectedMailboxId(id);
      renderConfiguracaoCaixas(bodyEl);
    }

    // Linha inteira seleciona a caixa
    qsa('tr[data-select-box]').forEach(row => {
      const id = row.getAttribute('data-select-box') || '';
      row.addEventListener('click', () => selectMailboxById(id));
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          selectMailboxById(id);
        }
      });
    });

    // Ações (delegação): editar nome e excluir caixa
    if (!bodyEl._cfgBoxesDelegated) {
      bodyEl._cfgBoxesDelegated = true;

      const ensureCanAdminBoxOrWarn = (boxId) => {
        try {
          const mb = getMailboxById(boxId);
          if (!mb) return true;
          if (!mailboxPermsEnforced(mb)) return true;
          if (mailboxCanAdmin(mb)) return true;
          toastError('Sem permissão para administrar esta caixa.');
          return false;
        } catch {
          return false;
        }
      };

      const startEdit = (boxId) => {
        if (!boxId) return;
        const wrap = qs(`[data-box-id="${CSS.escape(boxId)}"]`, bodyEl);
        if (!wrap) return;
        const label = qs(`[data-box-name-label="${CSS.escape(boxId)}"]`, bodyEl);
        const input = qs(`[data-box-name-input="${CSS.escape(boxId)}"]`, bodyEl);
        if (!label || !input) return;
        if (input.style.display !== 'none') return;
        input.value = label.textContent || '';
        label.style.display = 'none';
        input.style.display = '';
        input.focus();
        try { input.select(); } catch {}
      };

      const cancelEdit = (boxId) => {
        const label = qs(`[data-box-name-label="${CSS.escape(boxId)}"]`, bodyEl);
        const input = qs(`[data-box-name-input="${CSS.escape(boxId)}"]`, bodyEl);
        if (!label || !input) return;
        input.style.display = 'none';
        label.style.display = '';
      };

      const commitEdit = (boxId) => {
        const label = qs(`[data-box-name-label="${CSS.escape(boxId)}"]`, bodyEl);
        const input = qs(`[data-box-name-input="${CSS.escape(boxId)}"]`, bodyEl);
        if (!label || !input) return;
        const nextName = String(input.value || '').trim();
        const prevName = String(label.textContent || '').trim();
        if (!nextName) { cancelEdit(boxId); return; }
        if (nextName === prevName) { cancelEdit(boxId); return; }

        if (!ensureCanAdminBoxOrWarn(boxId)) {
          cancelEdit(boxId);
          return;
        }

        (async () => {
          const updated = await apiPatchMailbox(basePath, boxId, { name: nextName });
          if (!updated) {
            bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-danger" role="alert">Falha ao salvar no servidor.</div>');
            cancelEdit(boxId);
            return;
          }
          const list = loadCustomMailboxes();
          const idx = list.findIndex(b => b && b.id === boxId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], name: updated.name };
            saveCustomMailboxes(list);
          }
          setSelectedMailboxId(_currentMailboxId);
          populateMailboxSelect();
          renderConfiguracaoCaixas(bodyEl);
        })();
      };

      const deleteBox = (boxId) => {
        if (!boxId) return;

        if (!ensureCanAdminBoxOrWarn(boxId)) {
          return;
        }
        (async () => {
          const ok = await apiDeleteMailbox(basePath, boxId);
          if (!ok) {
            bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-danger" role="alert">Falha ao excluir no servidor.</div>');
            return;
          }
          const list = loadCustomMailboxes();
          const next = list.filter(b => b && b.id !== boxId);
          saveCustomMailboxes(next);
          if (_currentMailboxId === boxId) setSelectedMailboxId('');
          populateMailboxSelect();
          renderConfiguracaoCaixas(bodyEl);
        })();
      };

      bodyEl.addEventListener('click', (ev) => {
        const editBtn = ev.target.closest('[data-box-edit]');
        if (editBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          if (editBtn.disabled) return;
          const id = editBtn.getAttribute('data-box-edit') || '';
          startEdit(id);
          return;
        }
        const delBtn = ev.target.closest('[data-box-delete]');
        if (delBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          const id = delBtn.getAttribute('data-box-delete') || '';
          deleteBox(id);
        }
      }, true);

      bodyEl.addEventListener('keydown', (ev) => {
        const input = ev.target && ev.target.matches && ev.target.matches('[data-box-name-input]') ? ev.target : null;
        if (!input) return;
        const id = input.getAttribute('data-box-name-input') || '';
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commitEdit(id);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          cancelEdit(id);
        }
      });

      bodyEl.addEventListener('focusout', (ev) => {
        const input = ev.target && ev.target.matches && ev.target.matches('[data-box-name-input]') ? ev.target : null;
        if (!input) return;
        const id = input.getAttribute('data-box-name-input') || '';
        // commit no blur
        commitEdit(id);
      });
    }

    if (!isPortalMorador) {
      // Preencher campo Condomínio
      const unitSel = qs('#cfgUnit');
      const unitHint = qs('#cfgUnitHint');
      (async () => {
        if (!unitSel) return;
        if (!roleIsMA) {
          const label = ctx.unitName || 'Unidade vinculada';
          unitSel.innerHTML = `<option value="${escapeHtml(ctx.unitId || 'vinculada')}">${escapeHtml(label)}</option>`;
          unitSel.value = ctx.unitId || 'vinculada';
          unitSel.disabled = true;
          if (unitHint) unitHint.textContent = '';
          return;
        }

        unitSel.innerHTML = '<option value="">Carregando unidades...</option>';
        if (unitHint) unitHint.textContent = '';
        const unidades = await fetchUnidadesList(basePath);
        const opts = (unidades || []).map(u => {
          const id = u._id || u.id || '';
          const nome = u.nome || u.nomeFantasia || u.razaoSocial || id;
          return { id: String(id), nome: String(nome) };
        }).filter(o => o.id && o.nome);

        if (!opts.length) {
          unitSel.innerHTML = '<option value="">Nenhuma unidade disponível</option>';
          return;
        }
        unitSel.innerHTML = ['<option value="">-- Selecionar --</option>', ...opts.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.nome)}</option>`)].join('');
      })();

      // Criar caixa (sem operadores aqui; operadores são geridos no bloco 3)
      const createForm = qs('#cfgCreateBoxForm');
      if (createForm) {
        createForm.addEventListener('submit', (ev) => {
          ev.preventDefault();
          const name = qs('#cfgBoxName')?.value?.trim() || '';
          const unitIdRaw = String(qs('#cfgUnit')?.value || '').trim();
          const unitName = String(qs('#cfgUnit')?.selectedOptions?.[0]?.textContent || '').trim();

          const unitId = looksLikeObjectId(unitIdRaw) ? unitIdRaw : '';

          if (!name || !unitId || !unitName) {
            bodyEl.insertAdjacentHTML(
              'afterbegin',
              '<div class="alert alert-warning" role="alert">Selecione uma unidade válida antes de criar a caixa.</div>'
            );
            return;
          }

          (async () => {
            const created = await apiCreateMailbox(basePath, { name, unitId, unitName });
            if (!created) {
              bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-danger" role="alert">Falha ao criar no servidor.</div>');
              return;
            }

            const next = loadCustomMailboxes();
            next.push({
              id: created.id,
              name: created.name,
              type: created.type || 'grupo',
              unitId: created.unitId || unitId,
              unitName: created.unitName || unitName,
              createdBy: created.createdBy || (ctx.userEmail || ctx.userName || 'Usuário'),
              operators: Array.isArray(created.operators) && created.operators.length
                ? created.operators
                : [{ user: (ctx.userEmail || ctx.userName || 'Usuário'), perms: defaultCreatorPerms() }]
            });
            saveCustomMailboxes(next);

            populateMailboxSelect();
            const sel = qs('#msgMailboxSelect');
            if (sel) {
              sel.value = created.id;
              _currentMailboxId = created.id;
              setSelectedMailboxId(created.id);
            }

            bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-success" role="status">Caixa criada e salva no servidor.</div>');
            renderConfiguracaoCaixas(bodyEl);
          })();
        });
      }
    }

    // Bloco 3: gerir operadores/permissões
    const opsBoxName = qs('#cfgOpsBoxName');
    const opsEditor = qs('#cfgOpsEditor');
    const addOpBtn = qs('#cfgAddOp');
    const opsForm = qs('#cfgOpsForm');

    const groupBoxes = editableBoxes;
    if (opsBoxName) opsBoxName.textContent = selected ? selected.name : '—';

    const OPS_PAGE_SIZE = 10;

    function normalizeOperatorsForEditor(rawOps) {
      const arr = Array.isArray(rawOps) ? rawOps : [];
      const rows = arr
        .map(op => {
          if (typeof op === 'string') return { user: String(op || '').trim(), perms: {}, displayName: '' };
          if (op && typeof op === 'object') {
            return {
              user: String(op.user || '').trim(),
              perms: (op.perms && typeof op.perms === 'object') ? { ...op.perms } : {},
              displayName: String(op.displayName || op.nome || op.name || '').trim()
            };
          }
          return null;
        })
        .filter(x => x !== null);

      if (!rows.length) rows.push({ user: '', perms: {}, displayName: '' });
      return rows;
    }

    function sanitizeOperatorsForSave(ops) {
      const arr = Array.isArray(ops) ? ops : [];
      return arr
        .map(op => {
          const user = String(op?.user || '').trim();
          if (!user) return null;
          const perms = (op?.perms && typeof op.perms === 'object') ? op.perms : {};
          const outPerms = {};
          PERMISSIONS.forEach(p => {
            outPerms[p.key] = !!perms[p.key];
          });
          return { user, perms: outPerms };
        })
        .filter(Boolean);
    }

    function getOpsEditorState(boxId, box) {
      const key = String(boxId || '');
      if (!key) return null;
      const store = MEMORY_STORE.opsEditorStateByMailbox || (MEMORY_STORE.opsEditorStateByMailbox = {});
      const existing = store[key];
      if (existing && Array.isArray(existing.operators)) return existing;
      const initialOps = normalizeOperatorsForEditor(box?.operators);
      const st = { operators: initialOps, filter: '', page: 1, pageSize: OPS_PAGE_SIZE };
      store[key] = st;
      return st;
    }

    function getFilteredIndices(st) {
      const q = String(st?.filter || '').trim().toLowerCase();
      const ops = Array.isArray(st?.operators) ? st.operators : [];
      const out = [];
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i] || {};
        const user = String(op?.user || '');
        let displayName = String(op?.displayName || '').trim();

        // Fallback: se só temos e-mail, tenta resolver o nome no cache.
        if (!displayName) {
          try {
            const key = normalizeEmailKey(user);
            const u = key && USERS.byEmail ? USERS.byEmail.get(key) : null;
            if (u && (u.nome || u.email)) displayName = String(u.nome || u.email || '').trim();
          } catch {
            // ignore
          }
        }

        const hay = `${displayName} ${user}`.toLowerCase();
        if (!q || hay.includes(q)) out.push(i);
      }
      return out;
    }

    function clampPage(st, filteredIdx) {
      const total = filteredIdx.length;
      const size = Math.max(1, Number(st.pageSize) || OPS_PAGE_SIZE);
      const pages = Math.max(1, Math.ceil(total / size));
      st.page = Math.min(Math.max(1, Number(st.page) || 1), pages);
      return pages;
    }

    function visibleEntries(st, filteredIdx) {
      const size = Math.max(1, Number(st.pageSize) || OPS_PAGE_SIZE);
      const page = Math.max(1, Number(st.page) || 1);
      const start = (page - 1) * size;
      const slice = filteredIdx.slice(start, start + size);
      return slice.map(i => ({ idx: i, op: st.operators[i] }));
    }

    function commitVisibleEdits(st) {
      if (!opsEditor) return;
      const table = qs('#cfgOpsTable', opsEditor);
      if (!table) return;
      qsa('tbody tr[data-op-row="1"][data-op-idx]', table).forEach(row => {
        const idx = Number(row.getAttribute('data-op-idx'));
        if (!Number.isFinite(idx) || idx < 0) return;
        if (!st.operators[idx]) st.operators[idx] = { user: '', perms: {} };

        const hidden = row.querySelector('input[data-op-user-value]');
        const user = (hidden && String(hidden.value || '').trim())
          ? String(hidden.value || '').trim()
          : (row.querySelector('[data-op-user]')?.value?.trim() || '');
        const perms = { ...(st.operators[idx].perms || {}) };
        qsa('input[type="checkbox"][data-perm]', row).forEach(chk => {
          const k = chk.getAttribute('data-perm');
          if (!k) return;
          perms[k] = !!chk.checked;
        });
        st.operators[idx] = { ...st.operators[idx], user, perms };
      });
    }

    function renderPagerHtml(st, filteredCount, pages) {
      const page = Math.max(1, Number(st.page) || 1);
      const prevDisabled = page <= 1;
      const nextDisabled = page >= pages;

      // Janela de páginas (até 7)
      const win = 7;
      const half = Math.floor(win / 2);
      let start = Math.max(1, page - half);
      let end = Math.min(pages, start + win - 1);
      start = Math.max(1, end - win + 1);

      const nums = [];
      for (let p = start; p <= end; p++) {
        nums.push(
          `<button type="button" class="btn btn-sm fw-normal ${p === page ? 'btn-primary' : 'btn-outline-secondary'}" style="font-weight:400;" data-ops-page="${p}">${p}</button>`
        );
      }

      return [
        '<div class="wdg-cfg-ops-pager">',
        '  <div class="wdg-cfg-ops-pager-right">',
        `    <button type="button" class="btn btn-sm btn-outline-secondary fw-normal" style="font-weight:400;" data-ops-page="prev" ${prevDisabled ? 'disabled' : ''}>Anterior</button>`,
        `    ${nums.join('')}`,
        `    <button type="button" class="btn btn-sm btn-outline-secondary fw-normal" style="font-weight:400;" data-ops-page="next" ${nextDisabled ? 'disabled' : ''}>Próxima</button>`,
        '  </div>',
        `  <div class="wdg-cfg-ops-pager-left" style="font-weight:400;">Mostrando ${filteredCount ? Math.min(filteredCount, ((page - 1) * st.pageSize) + 1) : 0}–${Math.min(filteredCount, page * st.pageSize)} de ${filteredCount}</div>`,
        '</div>'
      ].join('\n');
    }

    function renderOpsTableForEntries(entries) {
        const colgroup = [
          '<colgroup>',
        '  <col style="width:34%">',
        '  <col style="width:56%">',
        '  <col style="width:10%">',
          '</colgroup>'
        ].join('\n');

        const thead = [
        '<thead class="table-light">',
        '  <tr>',
          '    <th style="min-width:380px; font-weight:600; letter-spacing:.02em;">Usuário</th>',
          '    <th style="min-width:720px; font-weight:600; letter-spacing:.02em;">Permissões</th>',
        '    <th class="text-center" style="min-width:120px; font-weight:600; letter-spacing:.02em;">Ação</th>',
        '  </tr>',
        '</thead>'
      ].join('\n');

      const tbody = [
        '<tbody>',
        ...entries.map(e => renderOpsEditorRow(e.op || { user: '', perms: {} }, e.idx)),
        '</tbody>'
      ].join('\n');

      return `<table class="table table-sm align-middle" id="cfgOpsTable">${colgroup}${thead}${tbody}</table>`;
    }

    function renderOpsEditorUi(boxId) {
      if (!opsEditor) return;
      const box = loadCustomMailboxes().find(b => b.id === boxId);
      if (!box) {
        opsEditor.innerHTML = '<div class="wdg-msg-empty"></div>';
        return;
      }

      const st = getOpsEditorState(boxId, box);
      commitVisibleEdits(st);
      const filteredIdx = getFilteredIndices(st);
      const pages = clampPage(st, filteredIdx);
      const entries = visibleEntries(st, filteredIdx);

      opsEditor.innerHTML = [
        '<div class="wdg-cfg-ops-head">',
        '  <div class="wdg-cfg-ops-search">',
        '    <label class="form-label mb-1" for="cfgOpsSearch">Pesquisar usuário</label>',
        `    <input class="form-control" id="cfgOpsSearch" type="search" placeholder="Filtrar por nome/e-mail" value="${escapeHtml(String(st.filter || ''))}" autocomplete="off">`,
        '  </div>',
        '</div>',
        '  <div class="wdg-cfg-ops-tablewrap">',
        '    <div class="table-responsive">',
        `      ${renderOpsTableForEntries(entries)}`,
        '    </div>',
        '  </div>',
        `  ${renderPagerHtml(st, filteredIdx.length, pages)}`
      ].join('\n');

      bindUserPickers(opsEditor, basePath);
    }

    function ensureOpsEditorBound() {
      if (!opsEditor || opsEditor.__wdgOpsEditorBound) return;
      opsEditor.__wdgOpsEditorBound = true;

      opsEditor.addEventListener('input', (ev) => {
        const t = ev.target;
        if (!t) return;
        if (t.id === 'cfgOpsSearch') {
          const prevValue = String(t.value || '');
          const selStart = (typeof t.selectionStart === 'number') ? t.selectionStart : null;
          const selEnd = (typeof t.selectionEnd === 'number') ? t.selectionEnd : null;
          const boxId = selectedIsGroup ? _currentMailboxId : '';
          if (!boxId) return;
          const box = loadCustomMailboxes().find(b => b.id === boxId);
          if (!box) return;
          const st = getOpsEditorState(boxId, box);
          st.filter = String(t.value || '');
          st.page = 1;
          renderOpsEditorUi(boxId);

          // A UI é re-renderizada via innerHTML, então o input é recriado.
          // Restaurar foco/seleção evita perder o cursor a cada tecla.
          setTimeout(() => {
            try {
              const next = qs('#cfgOpsSearch', opsEditor);
              if (!next) return;
              // Se o valor mudou por algum motivo, respeitar o atual.
              if (String(next.value || '') !== prevValue) next.value = prevValue;
              next.focus();
              if (typeof next.setSelectionRange === 'function' && typeof selStart === 'number' && typeof selEnd === 'number') {
                const max = String(next.value || '').length;
                const a = Math.max(0, Math.min(max, selStart));
                const b = Math.max(0, Math.min(max, selEnd));
                next.setSelectionRange(a, b);
              }
            } catch {
              // noop
            }
          }, 0);
          return;
        }

        if (t.matches && t.matches('input[data-op-user]')) {
          const row = t.closest('tr[data-op-idx]');
          if (!row) return;
          const idx = Number(row.getAttribute('data-op-idx'));
          if (!Number.isFinite(idx) || idx < 0) return;
          const boxId = selectedIsGroup ? _currentMailboxId : '';
          if (!boxId) return;
          const box = loadCustomMailboxes().find(b => b.id === boxId);
          if (!box) return;
          const st = getOpsEditorState(boxId, box);
          if (!st.operators[idx]) st.operators[idx] = { user: '', perms: {} };

          // Se o usuário está digitando manualmente, invalida o valor selecionado.
          const hidden = row.querySelector('input[data-op-user-value]');
          if (hidden) hidden.value = '';
          st.operators[idx].user = String(t.value || '').trim();
          st.operators[idx].displayName = '';
        }
      });

      opsEditor.addEventListener('change', (ev) => {
        const t = ev.target;
        if (!t || !(t.matches && t.matches('input[type="checkbox"][data-perm]'))) return;
        const row = t.closest('tr[data-op-idx]');
        if (!row) return;
        const idx = Number(row.getAttribute('data-op-idx'));
        if (!Number.isFinite(idx) || idx < 0) return;
        const perm = t.getAttribute('data-perm');
        if (!perm) return;
        const boxId = selectedIsGroup ? _currentMailboxId : '';
        if (!boxId) return;
        const box = loadCustomMailboxes().find(b => b.id === boxId);
        if (!box) return;
        const st = getOpsEditorState(boxId, box);
        if (!st.operators[idx]) st.operators[idx] = { user: '', perms: {} };
        st.operators[idx].perms = { ...(st.operators[idx].perms || {}), [perm]: !!t.checked };
      });

      opsEditor.addEventListener('wdg:userpick', (ev) => {
        const picker = ev.target;
        if (!picker || !(picker.closest && picker.closest('tr[data-op-idx]'))) return;
        const row = picker.closest('tr[data-op-idx]');
        const input = qs('input[data-op-user]', row);
        const hidden = qs('input[data-op-user-value]', row);
        if (!input) return;
        const idx = Number(row.getAttribute('data-op-idx'));
        if (!Number.isFinite(idx) || idx < 0) return;
        const boxId = selectedIsGroup ? _currentMailboxId : '';
        if (!boxId) return;
        const box = loadCustomMailboxes().find(b => b.id === boxId);
        if (!box) return;
        const st = getOpsEditorState(boxId, box);
        if (!st.operators[idx]) st.operators[idx] = { user: '', perms: {} };

        // Preferir o e-mail real (hidden) ao texto exibido.
        const selected = (hidden && String(hidden.value || '').trim()) ? String(hidden.value || '').trim() : '';
        st.operators[idx].user = selected || String(input.value || '').trim();

        // Guardar nome para permitir filtrar por nome (além do e-mail)
        try {
          const d = ev.detail || {};
          const display = String(d.display || '').trim();
          const nome = String(d.nome || '').trim();
          st.operators[idx].displayName = display || nome || st.operators[idx].displayName || '';
        } catch {
          // noop
        }
      });

      opsEditor.addEventListener('click', (ev) => {
        const btnRemove = ev.target?.closest?.('[data-op-remove]');
        if (btnRemove) {
          const row = btnRemove.closest('tr[data-op-idx]');
          if (!row) return;
          const idx = Number(row.getAttribute('data-op-idx'));
          if (!Number.isFinite(idx) || idx < 0) return;

          const boxId = selectedIsGroup ? _currentMailboxId : '';
          if (!boxId) return;
          const box = loadCustomMailboxes().find(b => b.id === boxId);
          if (!box) return;
          const st = getOpsEditorState(boxId, box);
          commitVisibleEdits(st);
          st.operators.splice(idx, 1);
          if (!st.operators.length) st.operators.push({ user: '', perms: {}, displayName: '' });
          renderOpsEditorUi(boxId);
          return;
        }

        const pagerBtn = ev.target?.closest?.('[data-ops-page]');
        if (pagerBtn) {
          const v = pagerBtn.getAttribute('data-ops-page');
          const boxId = selectedIsGroup ? _currentMailboxId : '';
          if (!boxId) return;
          const box = loadCustomMailboxes().find(b => b.id === boxId);
          if (!box) return;
          const st = getOpsEditorState(boxId, box);
          commitVisibleEdits(st);
          const filteredIdx = getFilteredIndices(st);
          const pages = clampPage(st, filteredIdx);

          if (v === 'prev') st.page = Math.max(1, st.page - 1);
          else if (v === 'next') st.page = Math.min(pages, st.page + 1);
          else {
            const p = Number(v);
            if (Number.isFinite(p)) st.page = p;
          }
          renderOpsEditorUi(boxId);
        }
      });
    }

    function loadEditorForBoxId(boxId) {
      if (!opsEditor) return;
      const box = loadCustomMailboxes().find(b => b.id === boxId);
      if (!box) {
        opsEditor.innerHTML = '<div class="wdg-msg-empty"></div>';
        return;
      }

      // Sem administrar: modo somente leitura (lista usuários/permissões).
      if (!selectedCanAdmin) {
        opsEditor.innerHTML = [
          '<div class="text-muted small mb-2">Você não tem permissão para administrar esta caixa.</div>',
          renderOpsViewerTable(box.operators)
        ].join('\n');
        return;
      }

      // Warm-up: pré-carrega usuários para evitar atraso no primeiro clique.
      try { void fetchUsuariosList(basePath); } catch {}
      // Inicializa estado (mantém edits locais ao trocar páginas/filtros)
      getOpsEditorState(boxId, box);
      ensureOpsEditorBound();
      renderOpsEditorUi(boxId);
    }

    // Carrega o painel automaticamente pela caixa selecionada
    if (selectedIsGroup) {
      loadEditorForBoxId(_currentMailboxId);
      if (addOpBtn) addOpBtn.disabled = !opsCanEdit;
    } else {
      if (opsEditor) opsEditor.innerHTML = '<div class="wdg-msg-empty"></div>';
      if (addOpBtn) addOpBtn.disabled = true;
    }

    if (addOpBtn && !addOpBtn.__wdgBound) {
      addOpBtn.__wdgBound = true;
      addOpBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (addOpBtn.disabled) return;
        const boxId = String(_currentMailboxId || '');
        if (!boxId) return;
        const box = loadCustomMailboxes().find(b => b.id === boxId);
        if (!box) {
          bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-warning" role="alert">Não foi possível localizar a caixa selecionada para adicionar usuário.</div>');
          return;
        }

        const st = getOpsEditorState(boxId, box);
        commitVisibleEdits(st);

        // Se houver filtro, limpar para o item novo aparecer.
        if (String(st.filter || '').trim()) {
          st.filter = '';
          st.page = 1;
        }

        st.operators.push({ user: '', perms: {}, displayName: '' });
        const filteredIdx = getFilteredIndices(st);
        const pages = clampPage(st, filteredIdx);
        st.page = pages;
        renderOpsEditorUi(boxId);

        // Foco no novo usuário adicionado (última linha visível na última página).
        setTimeout(() => {
          try {
            const table = opsEditor ? qs('#cfgOpsTable', opsEditor) : null;
            if (!table) return;
            const rows = qsa('tbody tr[data-op-row="1"]', table);
            const last = rows && rows.length ? rows[rows.length - 1] : null;
            const input = last ? qs('input[data-op-user]', last) : null;
            if (!input) return;
            try { last.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch {}
            input.focus();
          } catch {
            // noop
          }
        }, 0);
      });
    }

    if (opsForm) {
      opsForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const boxId = selectedIsGroup ? _currentMailboxId : '';
        if (!boxId) return;

        if (!opsCanEdit) {
          return;
        }

        const box = loadCustomMailboxes().find(b => b.id === boxId);
        const st = getOpsEditorState(boxId, box);
        commitVisibleEdits(st);
        const operators = sanitizeOperatorsForSave(st.operators);

        (async () => {
          const updated = await apiPatchMailbox(basePath, boxId, { operators });
          if (!updated) {
            bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-danger" role="alert">Falha ao salvar permissões no servidor.</div>');
            return;
          }

          // Sincroniza estado do editor com o retorno do servidor.
          if (MEMORY_STORE.opsEditorStateByMailbox && MEMORY_STORE.opsEditorStateByMailbox[boxId]) {
            MEMORY_STORE.opsEditorStateByMailbox[boxId] = {
              ...(MEMORY_STORE.opsEditorStateByMailbox[boxId] || {}),
              operators: normalizeOperatorsForEditor(updated.operators || operators),
              page: 1
            };
          }

          const all = loadCustomMailboxes();
          const idx = all.findIndex(b => b.id === boxId);
          if (idx >= 0) {
            all[idx] = { ...all[idx], operators: updated.operators || operators };
            saveCustomMailboxes(all);
          }

          populateMailboxSelect();
          bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-success" role="status">Usuários/permissões atualizados e salvos no servidor.</div>');
          renderConfiguracaoCaixas(bodyEl);
        })();
      });
    }
  }

  let _layoutBound = false;

  function updateStickyOffset() {
    const root = document.documentElement;
    const hero = document.querySelector('header.hero-wd');
    const nav = document.querySelector('nav.navbar-wd');

    let offset = 0;
    // Usa a borda inferior visível (bottom) para acompanhar elementos
    // que se ocultam via scroll (ex.: transform/translate) sem depender da altura fixa.
    if (hero) offset = Math.max(offset, Math.max(0, hero.getBoundingClientRect().bottom));
    if (nav) offset = Math.max(offset, Math.max(0, nav.getBoundingClientRect().bottom));

    // folga pequena para evitar “colar” e overflow por arredondamento
    if (offset > 0) offset += 8;

    root.style.setProperty('--wdg-msg-top-offset', `${Math.max(0, Math.ceil(offset))}px`);
  }

  const SIGNATURE_PREF_SYNC = {
    cache: new Map(),
    inflight: new Map(),
    ttlMs: 60 * 1000
  };

  function normalizeMailboxIdForSignature(mailboxId) {
    return String(mailboxId || '').trim() || 'pessoal';
  }

  function normalizeSignaturePrefFromServer(x) {
    if (!x || typeof x !== 'object') return { text: '', enabled: false };
    return {
      text: String(x.text || '').trim(),
      enabled: !!x.enabled
    };
  }

  async function apiFetchSignaturePref(basePath, mailboxId) {
    const mb = normalizeMailboxIdForSignature(mailboxId);
    const bp = String(basePath || '').trim();
    const qs = `?mailboxId=${encodeURIComponent(mb)}`;
    const url = `/mensagens/api/msg/signature${qs}`;
    const headers = { 'Accept': 'application/json', 'X-Requested-With': 'fetch' };
    try {
      const path = (typeof window !== 'undefined' && window.location) ? String(window.location.pathname || '') : '';
      if (path.startsWith('/portal-morador')) headers['x-wdg-portal'] = '1';
    } catch { /* noop */ }
    const r = await fetch(url, { credentials: 'same-origin', headers });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const errMsg = (json && (json.error || json.message)) ? String(json.error || json.message) : `Falha ao carregar assinatura (HTTP ${r.status})`;
      throw new Error(errMsg);
    }
    return normalizeSignaturePrefFromServer(json);
  }

  async function apiSaveSignaturePref(basePath, mailboxId, text, enabled) {
    const mb = normalizeMailboxIdForSignature(mailboxId);
    const bp = String(basePath || '').trim();
    const qs = `?mailboxId=${encodeURIComponent(mb)}`;
    const url = `/mensagens/api/msg/signature${qs}`;
    const payload = { text: String(text || ''), enabled: !!enabled };
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'fetch' };
    try {
      const path = (typeof window !== 'undefined' && window.location) ? String(window.location.pathname || '') : '';
      if (path.startsWith('/portal-morador')) headers['x-wdg-portal'] = '1';
    } catch { /* noop */ }
    const r = await fetch(url, {
      method: 'PUT',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(payload)
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      const errMsg = (json && (json.error || json.message)) ? String(json.error || json.message) : `Falha ao salvar assinatura (HTTP ${r.status})`;
      throw new Error(errMsg);
    }
    return normalizeSignaturePrefFromServer(json);
  }

  function getCachedSignaturePref(mailboxId) {
    const mb = normalizeMailboxIdForSignature(mailboxId);
    const hit = SIGNATURE_PREF_SYNC.cache.get(mb);
    if (hit && (Date.now() - hit.at) < SIGNATURE_PREF_SYNC.ttlMs) return hit.value;
    return { text: '', enabled: false };
  }

  function setCachedSignaturePref(mailboxId, value) {
    const mb = normalizeMailboxIdForSignature(mailboxId);
    const safe = normalizeSignaturePrefFromServer(value);
    SIGNATURE_PREF_SYNC.cache.set(mb, { at: Date.now(), value: safe });
    return safe;
  }

  async function ensureSignaturePrefLoaded(basePath, mailboxId, opts) {
    const mb = normalizeMailboxIdForSignature(mailboxId);
    const force = !!(opts && opts.force);
    const now = Date.now();
    const cached = SIGNATURE_PREF_SYNC.cache.get(mb);
    if (!force && cached && (now - cached.at) < SIGNATURE_PREF_SYNC.ttlMs) return cached.value;
    if (!force && SIGNATURE_PREF_SYNC.inflight.get(mb)) return SIGNATURE_PREF_SYNC.inflight.get(mb);

    const p = (async () => {
      const pref = await apiFetchSignaturePref(basePath, mb);
      const safe = setCachedSignaturePref(mb, pref);
      SIGNATURE_PREF_SYNC.inflight.delete(mb);
      return safe;
    })();

    SIGNATURE_PREF_SYNC.inflight.set(mb, p);
    return p;
  }

  function loadSignature(_ctx, mailboxId) {
    return getCachedSignaturePref(mailboxId);
  }

  function saveSignature(_ctx, mailboxId, text, enabled) {
    // Atualiza cache local em memória. Persistência no servidor é feita pelo fluxo do compose.
    setCachedSignaturePref(mailboxId, { text, enabled });
  }

  function renderComposeInto(containerEl, opts) {
    const host = containerEl;
    if (!host) return;
    const basePath = String(opts?.basePath || '').trim();
    const ctx = opts?.ctx || getCtx();
    const mailboxes = Array.isArray(opts?.mailboxes) ? opts.mailboxes : [];
    const prefill = (opts?.prefill && typeof opts.prefill === 'object') ? opts.prefill : null;
    const onSent = typeof opts?.onSent === 'function' ? opts.onSent : null;
    const prefix = String(opts?.prefix || 'page_');

    function id(name) {
      return `${prefix}${name}`;
    }

    // Contexto do compose: usado para regras específicas (ex.: filtrar destinatários só em "Nova mensagem").
    try {
      const composeKind = String(prefill?.kind || 'new').trim() || 'new';
      host.dataset.composeKind = composeKind;
    } catch { /* noop */ }

    const selectedFrom = (opts?.initialFromId && mailboxes.some(m => m.id === opts.initialFromId))
      ? opts.initialFromId
      : (mailboxes[0]?.id || 'pessoal');

    const initialSig = loadSignature(ctx, selectedFrom);

    let sigDirty = false;
    let sigSaveTimer = null;

    function currentSigMailboxId() {
      return String(deSelect?.value || selectedFrom).trim() || selectedFrom;
    }

    function applySignaturePrefToUi(pref, opts) {
      const respectDirty = !!(opts && opts.respectDirty);
      if (respectDirty && sigDirty) return;
      const safe = pref && typeof pref === 'object' ? pref : { text: '', enabled: false };
      if (sigTxt) sigTxt.value = String(safe.text || '');
      if (sigChk) sigChk.checked = !!safe.enabled;
    }

    function refreshSignaturePrefFromServer(mailboxId, opts) {
      const mb = String(mailboxId || '').trim() || 'pessoal';
      const force = !!(opts && opts.force);
      const respectDirty = (opts && 'respectDirty' in opts) ? !!opts.respectDirty : true;
      ensureSignaturePrefLoaded(basePath, mb, { force })
        .then(pref => {
          applySignaturePrefToUi(pref, { respectDirty });
        })
        .catch(() => {
          // silencioso: se falhar, mantém cache/UI atual
        });
    }

    function scheduleSaveSignaturePref(mailboxId, opts) {
      const mb = String(mailboxId || '').trim() || 'pessoal';
      const immediate = !!(opts && opts.immediate);

      // Atualiza cache em memória imediatamente
      saveSignature(ctx, mb, sigTxt?.value || '', !!sigChk?.checked);

      if (sigSaveTimer) {
        clearTimeout(sigSaveTimer);
        sigSaveTimer = null;
      }

      const delay = immediate ? 0 : 450;
      sigSaveTimer = setTimeout(() => {
        sigSaveTimer = null;
        const text = sigTxt?.value || '';
        const enabled = !!sigChk?.checked;
        apiSaveSignaturePref(basePath, mb, text, enabled)
          .then(saved => {
            setCachedSignaturePref(mb, saved);
          })
          .catch(() => {
            // Mantém cache/UI; se necessário, o usuário salva novamente na próxima interação
          });
      }, delay);
    }

    host.innerHTML = [
      `<form id="${escapeHtml(id('msgCompose'))}" autocomplete="off">`,
      '  <div class="d-flex justify-content-end mb-2" data-compose-attach-header="1">',
      `    <button type="button" class="btn btn-outline-secondary" id="${escapeHtml(id('msgAttachBtn'))}">`,
      `      ${inlineImgIcon(basePath, 'anexo.png', 'Anexar arquivo', 'bi bi-paperclip', 16, 'me-2')} Anexar arquivo`,
      '    </button>',
      `    <input type="file" id="${escapeHtml(id('msgAttachInput'))}" name="anexos" aria-label="Anexos" multiple hidden>`,
      '  </div>',
      '  <div class="row g-3">',
      '    <div class="col-12">',
      `      <label class="form-label" for="${escapeHtml(id('msgDe'))}">De:</label>`,
      `      <select class="form-select" id="${escapeHtml(id('msgDe'))}" name="deMailboxId" aria-label="De" required></select>`,
      '    </div>',
      '    <div class="col-12">',
      `      <label class="form-label" for="${escapeHtml(id('msgParaPicker'))}">Para:</label>`,
      `      <div class="wdg-grp-members" id="${escapeHtml(id('msgParaWrap'))}">`,
      '        <div class="wdg-grp-adder" data-compose-adder="to">',
      `          ${buildRecipientPickCompactHtml()}`,
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div class="col-12">',
      `      <label class="form-label" for="${escapeHtml(id('msgCopiaPicker'))}">Cópia:</label>`,
      `      <div class="wdg-grp-members" id="${escapeHtml(id('msgCopiaWrap'))}">`,
      '        <div class="wdg-grp-adder" data-compose-adder="cc">',
      `          ${buildRecipientPickCompactHtml()}`,
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div class="col-12">',
      `      <label class="form-label" for="${escapeHtml(id('msgAssunto'))}">Assunto:</label>`,
      `      <input class="form-control" id="${escapeHtml(id('msgAssunto'))}" name="assunto" type="text" maxlength="140" required>`,
      '    </div>',
      '    <div class="col-12">',
      `      <label class="form-label" id="${escapeHtml(id('msgEditorLabel'))}">Mensagem:</label>`,
      `      <div id="${escapeHtml(id('msgEditor'))}" class="form-control" contenteditable="true" tabindex="0" spellcheck="true" role="textbox" aria-multiline="true" aria-labelledby="${escapeHtml(id('msgEditorLabel'))}" style="min-height: 170px;"></div>`,
      '      <div class="d-flex flex-wrap gap-2 align-items-center mt-2">',
      `        <select class="form-select form-select-sm" id="${escapeHtml(id('msgFont'))}" name="fonte" aria-label="Fonte" style="width:auto; min-width: 170px;">`,
      '          <option value="">Fonte</option>',
      '          <option value="Arial">Arial</option>',
      '          <option value="Times New Roman">Times New Roman</option>',
      '          <option value="Courier New">Courier New</option>',
      '        </select>',
      `        <select class="form-select form-select-sm" id="${escapeHtml(id('msgSize'))}" name="tamanho" aria-label="Tamanho" style="width:auto; min-width: 140px;">`,
      '          <option value="">Tamanho</option>',
      '          <option value="2">Pequeno</option>',
      '          <option value="3">Normal</option>',
      '          <option value="5">Grande</option>',
      '        </select>',
      `        <button type="button" class="btn btn-outline-secondary btn-sm" id="${escapeHtml(id('msgBold'))}" aria-label="Negrito"><strong>B</strong></button>`,
      `        <button type="button" class="btn btn-outline-secondary btn-sm" id="${escapeHtml(id('msgItalic'))}" aria-label="Itálico"><em>I</em></button>`,
      `        <button type="button" class="btn btn-outline-secondary btn-sm" id="${escapeHtml(id('msgStrike'))}" aria-label="Tachado"><span style="text-decoration: line-through;">S</span></button>`,
      `        <button type="button" class="btn btn-outline-secondary btn-sm" id="${escapeHtml(id('msgUnderline'))}" aria-label="Sublinhado"><span style="text-decoration: underline;">U</span></button>`,
      `        <span class="ms-auto form-text"><span id="${escapeHtml(id('msgCount'))}">0</span>/4000</span>`,
      '      </div>',
      '    </div>',
      '    <div class="col-12">',
      '      <div class="form-check mb-2">',
      `        <input class="form-check-input" type="checkbox" id="${escapeHtml(id('msgUseSignature'))}">`,
      `        <label class="form-check-label" for="${escapeHtml(id('msgUseSignature'))}">Assinatura</label>`,
      '      </div>',
      `      <textarea class="form-control" id="${escapeHtml(id('msgSignature'))}" name="assinatura" aria-label="Assinatura" rows="3" maxlength="1500" placeholder="Digite sua assinatura..."></textarea>`,
      '    </div>',
      `    <div class="col-12" id="${escapeHtml(id('msgAttachWrap'))}" style="display:none;">`,
      '      <div style="max-width:33.33%;">',
      '        <label class="form-label">Anexos</label>',
      `        <ul class="list-group small" id="${escapeHtml(id('msgAttachList'))}"></ul>`,
      `        <div class="form-text" id="${escapeHtml(id('msgAttachHint'))}"></div>`,
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="d-flex justify-content-end gap-2 mt-3">',
      `    <button type="button" class="btn btn-outline-secondary" id="${escapeHtml(id('msgLimpar'))}">Limpar</button>`,
      `    <button type="submit" class="btn btn-primary" id="${escapeHtml(id('msgEnviar'))}">Enviar</button>`,
      '  </div>',
      '</form>'
    ].join('\n');

    const form = qs(`#${CSS.escape(id('msgCompose'))}`, host);
    const deSelect = qs(`#${CSS.escape(id('msgDe'))}`, host);
    const assuntoEl = qs(`#${CSS.escape(id('msgAssunto'))}`, host);
    const editorEl = qs(`#${CSS.escape(id('msgEditor'))}`, host);
    const countEl = qs(`#${CSS.escape(id('msgCount'))}`, host);
    const fontEl = qs(`#${CSS.escape(id('msgFont'))}`, host);
    const sizeEl = qs(`#${CSS.escape(id('msgSize'))}`, host);
    const sigChk = qs(`#${CSS.escape(id('msgUseSignature'))}`, host);
    const sigTxt = qs(`#${CSS.escape(id('msgSignature'))}`, host);
    const btnClear = qs(`#${CSS.escape(id('msgLimpar'))}`, host);
    const attachBtn = qs(`#${CSS.escape(id('msgAttachBtn'))}`, host);
    const attachInput = qs(`#${CSS.escape(id('msgAttachInput'))}`, host);
    const attachWrap = qs(`#${CSS.escape(id('msgAttachWrap'))}`, host);
    const attachList = qs(`#${CSS.escape(id('msgAttachList'))}`, host);
    const attachHint = qs(`#${CSS.escape(id('msgAttachHint'))}`, host);
    const paraWrap = qs(`#${CSS.escape(id('msgParaWrap'))}`, host);
    const ccWrap = qs(`#${CSS.escape(id('msgCopiaWrap'))}`, host);

    // A11y/Console: as labels "Para"/"Cópia" apontam para ids específicos.
    // Garanta que os inputs existam com id/name para evitar warnings e melhorar autofill.
    try {
      const paraInput = qs('[data-compose-adder="to"] input[data-op-user]', host);
      if (paraInput) {
        if (!paraInput.id) paraInput.id = id('msgParaPicker');
        if (!paraInput.name) paraInput.name = id('msgParaPicker');
      }
      const ccInput = qs('[data-compose-adder="cc"] input[data-op-user]', host);
      if (ccInput) {
        if (!ccInput.id) ccInput.id = id('msgCopiaPicker');
        if (!ccInput.name) ccInput.name = id('msgCopiaPicker');
      }
    } catch { /* noop */ }

    const MAX_TEXT = 4000;
    const MAX_ATTACH_TOTAL = 10 * 1024 * 1024;

    let toRecipients = [];
    let ccRecipients = [];
    let attachments = [];

    function setActiveRecipientKind(kind) {
      _composeActiveRecipientKind = (String(kind || '').toLowerCase() === 'cc') ? 'cc' : 'to';
    }

    if (prefill) {
      toRecipients = Array.isArray(prefill.toRecipients) ? prefill.toRecipients.filter(Boolean) : [];
      ccRecipients = Array.isArray(prefill.ccRecipients) ? prefill.ccRecipients.filter(Boolean) : [];
    }

    function normalizeRecipientFromPick(value, detail) {
      const raw = String(value || '').trim();
      if (!raw) return null;
      if (raw.startsWith('mailbox:')) {
        const mailboxId = raw.slice('mailbox:'.length).trim();
        const box = buildAllMailboxesForRecipients(ctx).find(b => b.id === mailboxId);
        if (!box) return null;
        return { type: 'mailbox', mailboxId: box.id, name: box.name };
      }

      const d = detail && typeof detail === 'object' ? detail : null;
      const pickedOwnerKey = String(d?.ownerKey || '').trim();
      const pickedOrigem = String(d?.origem || '').trim();
      const pickedHabitacaoId = String(d?.habitacao_id || '').trim();
      const pickedSuffix = String(d?.suffix || '').trim();
      const pickedNome = String(d?.nome || '').trim();
      const pickedEmail = String(d?.email || '').trim();
      const pickedFotoUrl = String(d?.fotoUrl || '').trim();

      const canonicalizeOwnerKey = (k) => {
        const s = String(k || '').trim();
        if (!s) return '';
        const base = s.split('::')[0] || '';
        // Se for ownerKey composto, persista só o e-mail (evita regravar legado em novas mensagens).
        if (base && base.includes('@')) return String(base).trim().toLowerCase();
        return s;
      };

      if (raw.startsWith('userkey:')) {
        const ownerKey = canonicalizeOwnerKey(raw.slice('userkey:'.length).trim());
        const baseEmail = ownerKey.split('::')[0] || '';
        const email = pickedEmail || baseEmail;
        return {
          type: 'user',
          nome: pickedNome || '',
          email: email,
          fotoUrl: pickedFotoUrl || '',
          ownerKey,
          origem: pickedOrigem || '',
          habitacao_id: pickedHabitacaoId || '',
          suffix: pickedSuffix || ''
        };
      }
      if (raw.startsWith('user:')) {
        const token = raw.slice('user:'.length).trim();
        const isEmail = token.includes('@');
        const email = isEmail ? token : '';
        return {
          type: 'user',
          nome: pickedNome || (isEmail ? '' : token),
          email: pickedEmail || email,
          fotoUrl: pickedFotoUrl || '',
          ownerKey: canonicalizeOwnerKey(pickedOwnerKey || ''),
          origem: pickedOrigem || '',
          habitacao_id: pickedHabitacaoId || '',
          suffix: pickedSuffix || ''
        };
      }
      const isEmail = raw.includes('@');
      return {
        type: 'user',
        nome: pickedNome || (isEmail ? '' : raw),
        email: pickedEmail || (isEmail ? raw : ''),
        fotoUrl: pickedFotoUrl || '',
        ownerKey: canonicalizeOwnerKey(pickedOwnerKey || ''),
        origem: pickedOrigem || '',
        habitacao_id: pickedHabitacaoId || '',
        suffix: pickedSuffix || ''
      };
    }

    function extractKeyFromOwnerKey(ownerKey) {
      const raw = String(ownerKey || '').trim();
      if (!raw) return '';
      // ownerKey pode ser: "email::portal::hab:<id>", "email::portal", "email::colab"
      // ou, em alguns fluxos, um ObjectId.
      const first = raw.split('::')[0] || '';
      const head = String(first).trim();
      if (head.includes('@')) return head;
      if (looksLikeObjectId(raw)) return raw;
      if (looksLikeObjectId(head)) return head;
      return '';
    }

    function recipientAvatar(m) {
      const bp = String(basePath || '').trim();
      if (!m) return defaultUserAvatarUrl(bp);
      if (String(m.type || '').toLowerCase() === 'mailbox') return bp ? `${bp}/images/caixas.png` : '/images/caixas.png';
      const em = String(m.email || '').trim();
      const ownerKey = String(m.ownerKey || m.owner_key || '').trim();
      const key = em || extractKeyFromOwnerKey(ownerKey);
      return resolveUserPhotoUrl(m, bp, key || em);
    }

    function recipientLabel(m) {
      if (!m) return '';
      if (String(m.type || '').toLowerCase() === 'mailbox') return String(m.name || '').trim();
      const nome = String(m.nome || '').trim();
      const email = String(m.email || '').trim();
      const suffix = String(m.suffix || '').trim();
      const base = nome || email;
      return suffix ? `${base} (${suffix})` : base;
    }

    function recipientTitle(m) {
      if (!m) return '';
      if (String(m.type || '').toLowerCase() === 'mailbox') return String(m.name || '').trim();
      const nome = String(m.nome || '').trim();
      const email = String(m.email || '').trim();
      const suffix = String(m.suffix || '').trim();
      const base = (nome && email) ? `${nome} (${email})` : (nome || email);
      return suffix ? `${base} - ${suffix}` : base;
    }

    function renderRecipients() {
      function computeAltRecipientPhotoUrl(primary) {
        const p = String(primary || '').trim();
        const bp = String(basePath || '').trim();
        if (!p) return '';
        if (bp && p.startsWith(bp + '/api/usuarios/foto')) return p.slice(bp.length);
        if (bp && p.startsWith('/api/usuarios/foto')) return `${bp}${p}`;
        return '';
      }
      function renderInto(hostEl, list, kind) {
        if (!hostEl) return;
        const adder = qs('[data-compose-adder]', hostEl);
        qsa('[data-compose-chip="1"]', hostEl).forEach(el => el.remove());
        const chips = (Array.isArray(list) ? list : []).map(m => {
          const key = escapeHtml(normalizeMemberKey(m));
          const label = recipientLabel(m);
          const title = recipientTitle(m) || label;
          const fotoUrl = recipientAvatar(m);
          const isMailbox = String(m?.type || '').toLowerCase() === 'mailbox';
          const fallback = isMailbox
            ? (String(basePath || '').trim() ? `${String(basePath || '').trim()}/images/caixas.png` : '/images/caixas.png')
            : defaultUserAvatarUrl(basePath);
          const altFotoUrl = computeAltRecipientPhotoUrl(fotoUrl);
          return [
            `<span class="wdg-grp-member" data-compose-chip="1" data-compose-kind="${escapeHtml(kind)}" data-compose-key="${key}">`,
            `  <img src="${escapeHtml(fotoUrl)}" alt="" onerror="if(!this.dataset.altTried && '${escapeHtml(altFotoUrl)}'){this.dataset.altTried='1';this.onerror=function(){this.onerror=null;this.src='${escapeHtml(fallback)}';};this.src='${escapeHtml(altFotoUrl)}';}else{this.onerror=null;this.src='${escapeHtml(fallback)}';}">`,
            `  <span class="wdg-grp-member-name" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`,
            `  <button type="button" class="wdg-grp-member-remove" data-compose-remove="1" data-compose-kind="${escapeHtml(kind)}" data-compose-key="${key}" aria-label="Remover">×</button>`,
            '</span>'
          ].join('');
        }).join('');
        if (adder) adder.insertAdjacentHTML('beforebegin', chips);
        else hostEl.insertAdjacentHTML('beforeend', chips);
      }
      renderInto(paraWrap, toRecipients, 'to');
      renderInto(ccWrap, ccRecipients, 'cc');
    }

    function formatBytes(n) {
      const v = Number(n) || 0;
      if (v < 1024) return `${v} B`;
      if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
      return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    }

    function attachmentsTotalBytes() {
      return attachments.reduce((sum, f) => sum + (Number(f?.size) || 0), 0);
    }

    function renderAttachments() {
      if (!attachList || !attachWrap || !attachHint) return;
      const total = attachmentsTotalBytes();
      if (!attachments.length) {
        attachWrap.style.display = 'none';
        attachList.innerHTML = '';
        attachHint.textContent = '';
        return;
      }
      attachWrap.style.display = '';
      attachList.innerHTML = attachments.map((f, idx) => {
        const name = String(f?.name || 'arquivo');
        const size = formatBytes(f?.size);
        return [
          `<li class="list-group-item py-1 px-2 d-flex justify-content-between align-items-center" data-attach-idx="${idx}">`,
          `  <span class="text-truncate" title="${escapeHtml(name)}">${escapeHtml(name)} <span class="text-muted">(${escapeHtml(size)})</span></span>`,
          `  <button type="button" class="btn btn-sm btn-outline-secondary" data-attach-remove="1" data-attach-idx="${idx}">Remover</button>`,
          '</li>'
        ].join('');
      }).join('');
      attachHint.textContent = `Total: ${formatBytes(total)} (máx. 10 MB)`;
    }

    function fillDeOptions(selected) {
      if (!deSelect) return;
      deSelect.innerHTML = mailboxes
        .map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`)
        .join('');
      deSelect.value = selected;
    }

    function updateCount() {
      if (!editorEl || !countEl) return;
      const text = String(editorEl.innerText || '').replace(/\r\n/g, '\n');
      countEl.textContent = String(Math.min(MAX_TEXT, text.length));
      if (text.length > MAX_TEXT) {
        const trimmed = text.slice(0, MAX_TEXT);
        editorEl.innerText = trimmed;
        countEl.textContent = String(MAX_TEXT);
      }
    }

    function execCommandSafe(cmd, value) {
      try {
        editorEl?.focus();
        document.execCommand(cmd, false, value);
      } catch {
        // ignore
      }
    }

    function signatureHtmlFromText(text) {
      const t = String(text || '').trim();
      if (!t) return '';
      return escapeHtml(t).replace(/\n/g, '<br>');
    }

    bindUserPickers(host, basePath);
    qsa('[data-compose-adder="to"] [data-userpick="1"]', host).forEach(p => {
      if (p.__wdgComposeBound) return;
      p.__wdgComposeBound = true;
      p.addEventListener('wdg:userpick', (ev) => {
        const val = ev?.detail?.value || '';
        const member = normalizeRecipientFromPick(val, ev?.detail);
        if (!member) return;
        setActiveRecipientKind('to');
        const key = normalizeMemberKey(member);
        if (toRecipients.some(m => normalizeMemberKey(m) === key)) return;
        toRecipients = [...toRecipients, member];
        const input = p.querySelector('input[data-op-user]');
        if (input) { input.value = ''; input.size = 1; }
        renderRecipients();
      });
    });
    qsa('[data-compose-adder="cc"] [data-userpick="1"]', host).forEach(p => {
      if (p.__wdgComposeBound) return;
      p.__wdgComposeBound = true;
      p.addEventListener('wdg:userpick', (ev) => {
        const val = ev?.detail?.value || '';
        const member = normalizeRecipientFromPick(val, ev?.detail);
        if (!member) return;
        setActiveRecipientKind('cc');
        const key = normalizeMemberKey(member);
        if (ccRecipients.some(m => normalizeMemberKey(m) === key)) return;
        ccRecipients = [...ccRecipients, member];
        const input = p.querySelector('input[data-op-user]');
        if (input) { input.value = ''; input.size = 1; }
        renderRecipients();
      });
    });

    host.addEventListener('focusin', (ev) => {
      const t = ev?.target;
      if (!t) return;
      if (paraWrap && paraWrap.contains(t)) setActiveRecipientKind('to');
      else if (ccWrap && ccWrap.contains(t)) setActiveRecipientKind('cc');
    });

    host.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;

      // Mantém o "alvo" ativo (Para/Cópia) para permitir ações externas (ex.: clique em grupo no menu)
      if (paraWrap && paraWrap.contains(t)) setActiveRecipientKind('to');
      else if (ccWrap && ccWrap.contains(t)) setActiveRecipientKind('cc');

      const rm = t.closest('[data-compose-remove="1"]');
      if (rm && host.contains(rm)) {
        const kind = rm.getAttribute('data-compose-kind') || '';
        const key = rm.getAttribute('data-compose-key') || '';
        if (kind === 'to') toRecipients = toRecipients.filter(m => normalizeMemberKey(m) !== key);
        if (kind === 'cc') ccRecipients = ccRecipients.filter(m => normalizeMemberKey(m) !== key);
        renderRecipients();
        return;
      }

      const rmAtt = t.closest('[data-attach-remove="1"]');
      if (rmAtt && host.contains(rmAtt)) {
        const idx = Number(rmAtt.getAttribute('data-attach-idx'));
        if (!Number.isNaN(idx)) {
          attachments = attachments.filter((_, i) => i !== idx);
          renderAttachments();
        }
      }
    });

    fillDeOptions(selectedFrom);

    if (sigTxt) sigTxt.value = initialSig.text || '';
    if (sigChk) sigChk.checked = !!initialSig.enabled;

    // Busca assinatura no servidor (sem sobrescrever se o usuário já começou a editar)
    refreshSignaturePrefFromServer(selectedFrom, { force: false, respectDirty: true });

    if (prefill) {
      if (prefill?.fromMailboxId && mailboxes.some(m => m.id === prefill.fromMailboxId)) {
        fillDeOptions(prefill.fromMailboxId);
        sigDirty = false;
        const s = loadSignature(ctx, prefill.fromMailboxId);
        applySignaturePrefToUi(s, { respectDirty: false });
        refreshSignaturePrefFromServer(prefill.fromMailboxId, { force: true, respectDirty: false });
      }
      if (assuntoEl) assuntoEl.value = String(prefill.assunto || '').trim();
      if (editorEl) editorEl.innerHTML = String(prefill.bodyHtml || '').trim();
      updateCount();
    }

    if (deSelect && !deSelect.__wdgComposeBound) {
      deSelect.__wdgComposeBound = true;
      deSelect.addEventListener('change', () => {
        const mb = String(deSelect.value || selectedFrom).trim() || selectedFrom;
        sigDirty = false;
        const s = loadSignature(ctx, mb);
        applySignaturePrefToUi(s, { respectDirty: false });
        refreshSignaturePrefFromServer(mb, { force: true, respectDirty: false });
      });
    }

    if (sigTxt && !sigTxt.__wdgComposeBound) {
      sigTxt.__wdgComposeBound = true;
      sigTxt.addEventListener('input', () => {
        sigDirty = true;
        const mb = currentSigMailboxId();
        scheduleSaveSignaturePref(mb, { immediate: false });
      });
    }

    if (sigChk && !sigChk.__wdgComposeBound) {
      sigChk.__wdgComposeBound = true;
      sigChk.addEventListener('change', () => {
        sigDirty = true;
        const mb = currentSigMailboxId();
        scheduleSaveSignaturePref(mb, { immediate: true });
      });
    }

    if (editorEl) {
      editorEl.addEventListener('input', updateCount);
      updateCount();
    }

    qs(`#${CSS.escape(id('msgBold'))}`, host)?.addEventListener('click', () => execCommandSafe('bold'));
    qs(`#${CSS.escape(id('msgItalic'))}`, host)?.addEventListener('click', () => execCommandSafe('italic'));
    qs(`#${CSS.escape(id('msgUnderline'))}`, host)?.addEventListener('click', () => execCommandSafe('underline'));
    qs(`#${CSS.escape(id('msgStrike'))}`, host)?.addEventListener('click', () => execCommandSafe('strikeThrough'));

    if (fontEl) {
      fontEl.addEventListener('change', () => {
        const v = String(fontEl.value || '').trim();
        if (v) execCommandSafe('fontName', v);
        fontEl.value = '';
      });
    }
    if (sizeEl) {
      sizeEl.addEventListener('change', () => {
        const v = String(sizeEl.value || '').trim();
        if (v) execCommandSafe('fontSize', v);
        sizeEl.value = '';
      });
    }

    if (attachBtn && attachInput) {
      attachBtn.addEventListener('click', () => attachInput.click());
    }
    if (attachInput && !attachInput.__wdgComposeBound) {
      attachInput.__wdgComposeBound = true;
      attachInput.addEventListener('change', () => {
        const files = Array.from(attachInput.files || []);
        if (!files.length) return;
        let total = attachmentsTotalBytes();
        const next = [...attachments];
        for (const f of files) {
          const sz = Number(f?.size) || 0;
          if (total + sz > MAX_ATTACH_TOTAL) {
            alert('Limite de 10 MB em anexos (total) atingido.');
            break;
          }
          next.push(f);
          total += sz;
        }
        attachments = next;
        attachInput.value = '';
        renderAttachments();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (assuntoEl) assuntoEl.value = '';
        if (editorEl) editorEl.innerHTML = '';
        toRecipients = [];
        ccRecipients = [];
        attachments = [];
        renderRecipients();
        renderAttachments();
        updateCount();
      });
    }

    if (form) {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();

        // Anti-duplo-clique / anti-submit duplicado: trava antes de qualquer await
        try {
          // Importante: amarre a trava ao FORM (instância atual).
          // Se a trava ficar no container (host), ela sobrevive entre renders e impede novos envios.
          if (form.__wdgMsgSendInFlight) return;
          form.__wdgMsgSendInFlight = true;
        } catch { /* noop */ }

        const btnSend = qs(`#${CSS.escape(id('msgEnviar'))}`, host);
        if (btnSend) {
          btnSend.disabled = true;
          btnSend.textContent = 'Enviando...';
        }

        const fromId = String(deSelect?.value || selectedFrom).trim() || selectedFrom;
        const fromLabel = (mailboxes.find(m => m.id === fromId)?.name) || fromId;
        const assunto = String(assuntoEl?.value || '').trim();
        const htmlBody = String(editorEl?.innerHTML || '').trim();
        const plainBody = String(editorEl?.innerText || '').trim();
        const sigEnabled = !!sigChk?.checked;
        const sigText = String(sigTxt?.value || '').trim();
        const sigHtml = sigEnabled ? signatureHtmlFromText(sigText) : '';
        const finalHtml = sigHtml ? `${htmlBody}${htmlBody ? '<br><br>' : ''}${sigHtml}` : htmlBody;

        if (!toRecipients.length) {
          alert('Informe ao menos um destinatário em Para.');
          try { form.__wdgMsgSendInFlight = false; } catch { /* noop */ }
          if (btnSend) { btnSend.disabled = false; btnSend.textContent = 'Enviar'; }
          return;
        }
        if (!assunto) {
          alert('Informe o Assunto.');
          try { form.__wdgMsgSendInFlight = false; } catch { /* noop */ }
          if (btnSend) { btnSend.disabled = false; btnSend.textContent = 'Enviar'; }
          return;
        }
        if (!plainBody) {
          alert('Informe a Mensagem.');
          try { form.__wdgMsgSendInFlight = false; } catch { /* noop */ }
          if (btnSend) { btnSend.disabled = false; btnSend.textContent = 'Enviar'; }
          return;
        }

        // Mantém preferência de assinatura persistida no banco (best effort)
        saveSignature(ctx, fromId, sigTxt?.value || '', !!sigChk?.checked);
        try {
          const saved = await apiSaveSignaturePref(basePath, fromId, sigTxt?.value || '', !!sigChk?.checked);
          setCachedSignaturePref(fromId, saved);
        } catch {
          // Se falhar, segue com o envio da mensagem normalmente
        }

        const fd = new FormData();
        // Idempotência do envio: o backend usa esse nonce para deduplicar duplo-clique/instabilidade de rede
        let clientNonce = '';
        try {
          if (window.crypto && window.crypto.getRandomValues) {
            const u = new Uint32Array(4);
            window.crypto.getRandomValues(u);
            clientNonce = Array.from(u).map(x => x.toString(16)).join('');
          } else {
            clientNonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
          }
        } catch {
          clientNonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        }
        const payload = {
          fromMailboxId: fromId,
          fromMailboxName: fromLabel,
          to: toRecipients,
          cc: ccRecipients,
          assunto,
          bodyHtml: finalHtml,
          bodyText: plainBody,
          assinaturaAtiva: sigEnabled,
          assinaturaTexto: sigText,
          clientNonce
        };
        if (prefill?.threadRootId) payload.threadRootId = prefill.threadRootId;
        if (prefill?.inReplyToId) payload.inReplyToId = prefill.inReplyToId;
        if (prefill?.forwardedFromId) payload.forwardedFromId = prefill.forwardedFromId;
        fd.append('payload', JSON.stringify(payload));
        attachments.forEach(f => fd.append('anexos', f));

        try {
          const url = '/mensagens/api/msg/messages';
          const headers = { 'Accept': 'application/json', 'X-Requested-With': 'fetch' };
          try {
            const path = (typeof window !== 'undefined' && window.location) ? String(window.location.pathname || '') : '';
            if (path.startsWith('/portal-morador')) headers['x-wdg-portal'] = '1';
          } catch { /* noop */ }
          const r = await fetch(url, { method: 'POST', credentials: 'same-origin', body: fd, headers });
          const json = await r.json().catch(() => null);
          if (!r.ok) {
            const errMsg = (json && (json.error || json.message)) ? String(json.error || json.message) : `Falha ao enviar (HTTP ${r.status})`;
            throw new Error(errMsg);
          }
          const protocolo = String(json?.protocolo || '').trim();
          const msg = protocolo ? `Mensagem enviada. Protocolo: ${protocolo}` : 'Mensagem enviada.';
          host.insertAdjacentHTML('afterbegin', `<div class="alert alert-success" role="status">${escapeHtml(msg)}</div>`);
          if (onSent) {
            try { onSent({ protocolo, fromId, response: json }); } catch {}
          }
          // Sucesso normalmente navega/re-renderiza para a Saída; mantém travado para evitar reenvio acidental.
        } catch (e) {
          host.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger" role="alert">${escapeHtml(e?.message || 'Falha ao enviar mensagem.')}</div>`);
          if (btnSend) {
            btnSend.disabled = false;
            btnSend.textContent = 'Enviar';
          }
          try { form.__wdgMsgSendInFlight = false; } catch { /* noop */ }
        }
      });
    }

    renderRecipients();
    renderAttachments();

    function mergeRecipientLists(currentList, extraList) {
      const cur = Array.isArray(currentList) ? currentList.filter(Boolean) : [];
      const add = Array.isArray(extraList) ? extraList.filter(Boolean) : [];
      if (!add.length) return cur;

      const seen = new Set(cur.map(m => normalizeMemberKey(m)));
      const next = [...cur];
      for (const m of add) {
        const key = normalizeMemberKey(m);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(m);
      }
      return next;
    }

    return {
      focusEditor: () => { try { editorEl?.focus(); } catch {} },
      setRecipients: (toList, ccList) => {
        toRecipients = Array.isArray(toList) ? toList : [];
        ccRecipients = Array.isArray(ccList) ? ccList : [];
        renderRecipients();
      },
      addRecipients: (kind, list) => {
        const k = String(kind || '').toLowerCase();
        if (k === 'cc') {
          ccRecipients = mergeRecipientLists(ccRecipients, list);
          setActiveRecipientKind('cc');
        } else {
          toRecipients = mergeRecipientLists(toRecipients, list);
          setActiveRecipientKind('to');
        }
        renderRecipients();
      }
    };
  }

  async function render(view) {
    // Evita dropdowns "presos" ao navegar entre views/páginas.
    try {
      if (typeof window !== 'undefined' && typeof window.__wdgMsgForceCloseDropdowns === 'function') {
        window.__wdgMsgForceCloseDropdowns();
      }
    } catch { /* noop */ }

    const meta = VIEWS[view] || VIEWS.entrada;
    _currentView = view || 'entrada';

    // Persistência de navegação (para F5): mantém a view ao recarregar,
    // mas nunca volta para "Nova mensagem" em reload.
    try {
      trySaveMsgViewState({
        view: String(_currentView || '').trim().toLowerCase(),
        groupId: String(_activeGroupMenuId || '').trim()
      });
    } catch { /* noop */ }

    try { setSelectedView(_currentView); } catch {}
    try {
      if (typeof window !== 'undefined' && typeof window.__wdgPortalNavSetActive === 'function') {
        window.__wdgPortalNavSetActive(_currentView);
      }
    } catch { /* noop */ }

    if (_currentView !== 'nova') _composeApi = null;

    const titleEl = qs('#msgTitle');
    const subEl = qs('#msgSubtitle');
    const bodyEl = qs('#msgBody');
    const chipEl = qs('#msgChip');

    if (titleEl) {
      titleEl.textContent = meta.title;
      // Sem negrito para títulos das caixas no painel.
      const noBoldTitle = (view === 'cfg_caixas' || view === 'cfg_geral' || view === 'entrada' || view === 'saida' || view === 'arquivo' || view === 'lixeira' || view === 'grupos' || view === 'nova');
      if (noBoldTitle) {
        titleEl.style.setProperty('font-weight', '400', 'important');
      } else {
        titleEl.style.removeProperty('font-weight');
      }
    }
    if (subEl) {
      let sub = String(meta.subtitle || '').trim();
      // No Portal do Morador, não exibimos as "dicas" das telas Nova e Saída.
      try {
        const basePath = getSafePageBasePath(document.body?.dataset?.basePath || '');
        const pathname = String(window?.location?.pathname || '').trim().toLowerCase();
        const inPortal = pathname.startsWith('/portal-morador') || String(basePath || '').trim().toLowerCase().startsWith('/portal-morador');
        if (inPortal && (_currentView === 'nova' || _currentView === 'saida' || _currentView === 'configuracao')) sub = '';
      } catch { /* noop */ }
      subEl.textContent = sub;
      subEl.style.display = sub ? '' : 'none';
    }
    if (chipEl) chipEl.innerHTML = `<i class="bi bi-envelope" aria-hidden="true"></i><span class="fw-normal">Mensagens · ${escapeHtml(mailboxLabelForChip())}</span>`;

    if (!bodyEl) return;

    // IMPORTANTE: evita que timers/listeners da LISTA (entrada/saída/arquivo/lixeira)
    // continuem ativos e re-renderizem a lista enquanto o usuário está em outras telas
    // (principalmente em "Nova mensagem"). Também minimiza race de fetch atrasado.
    try { teardownMsgListAutoRefresh(bodyEl); } catch {}

    if (view === 'configuracao') {
      renderConfiguracaoOverview(bodyEl);
      ensureFormFieldsHaveIdOrName(bodyEl, { prefix: 'wdgMsg_' });
      return;
    }

    if (view === 'cfg_caixas') {
      const basePath = getSafePageBasePath(document.body?.dataset?.basePath || '');
      try { await syncMailboxesFromServer(basePath, { force: true }); } catch {}
      renderConfiguracaoCaixas(bodyEl);
      ensureFormFieldsHaveIdOrName(bodyEl, { prefix: 'wdgMsg_' });
      return;
    }

    if (view === 'cfg_geral') {
      renderConfiguracaoGeral(bodyEl);
      ensureFormFieldsHaveIdOrName(bodyEl, { prefix: 'wdgMsg_' });
      try {
        const init = window.__wdgMsgCfgGeralInit;
        if (typeof init === 'function') {
          await Promise.resolve(init({ mode: 'embedded' }));
        } else {
          toastError('Painel Geral indisponível (script não carregado).');
        }
      } catch {
        toastError('Falha ao inicializar Configuração > Geral.');
      }
      return;
    }

    if (view === 'grupos') {
      renderGrupos(bodyEl);
      ensureFormFieldsHaveIdOrName(bodyEl, { prefix: 'wdgMsg_' });
      return;
    }

    if (view === 'nova') {
      const basePath = getSafePageBasePath(document.body?.dataset?.basePath || '');

      // Permissões (somente caixas de grupo): sem criarMensagem, não permite compor/enviar.
      try {
        const mb = getMailboxById(_currentMailboxId || 'pessoal');
        if (mb && mailboxPermsEnforced(mb) && !mustAllowByPublicPortal(mb) && !mailboxCanAdmin(mb) && !mailboxHasPerm(mb, PERMISSIONS.criarMensagem)) {
          toastError('Sem permissão para criar mensagem nesta caixa.');
          _composePrefill = null;
          setActiveMenu('entrada');
          await render('entrada');
          return;
        }
      } catch { /* noop */ }

      // Segurança/UX: se um overlay de lista/detalhe ficou preso por algum erro de rede,
      // ele bloqueia cliques e dá a impressão de que não dá pra digitar/enviar.
      try {
        const o1 = document.getElementById('wdgMsgListOverlay');
        if (o1) o1.style.display = 'none';
      } catch {}
      try {
        const o2 = document.getElementById('wdgMsgOpenOverlay');
        if (o2) o2.style.display = 'none';
      } catch {}

      const ctx = getCtx();
      const mailboxes = buildAllMailboxes(ctx);
      const selectedFrom = (_currentMailboxId && mailboxes.some(m => m.id === _currentMailboxId))
        ? _currentMailboxId
        : (mailboxes[0]?.id || 'pessoal');

      const prefill = (_composePrefill && typeof _composePrefill === 'object') ? _composePrefill : null;
      let initialFromId = selectedFrom;
      if (prefill?.fromMailboxId && mailboxes.some(m => m.id === prefill.fromMailboxId)) {
        initialFromId = prefill.fromMailboxId;
      }

      _composeActiveRecipientKind = 'to';
      _composeApi = renderComposeInto(bodyEl, {
        basePath,
        ctx,
        mailboxes,
        initialFromId,
        prefill,
        prefix: 'page_',
        onSent: ({ fromId }) => {
          // Após enviar: muda a caixa atual para o "De" e abre a Saída
          try {
            _currentMailboxId = fromId;
            setSelectedMailboxId(fromId);
            const sel = qs('#msgMailboxSelect');
            if (sel) sel.value = fromId;
            setActiveMenu('saida');
            void render('saida');
            void refreshGroupsMenu();
          } catch {}
        }
      });

      _composePrefill = null;
      ensureFormFieldsHaveIdOrName(bodyEl, { prefix: 'wdgMsg_' });
      return;
    }

    // Views de lista (Entrada/Saída/Arquivo/Lixeira)
    const basePath = getSafePageBasePath(document.body?.dataset?.basePath || '');

    const mailboxId = String(_currentMailboxId || 'pessoal').trim() || 'pessoal';
    const st = LIST_VIEW_STATE.get(mailboxId, view);

    function fmtDate(d) {
      try {
        const dt = new Date(d);
        if (isNaN(dt)) return '';

        const now = new Date();
        const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
        const diffDays = Math.round((startOfDay(now) - startOfDay(dt)) / (24 * 3600 * 1000));

        const time = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if (diffDays === 0) return `hoje, ${time}`;
        if (diffDays === 1) return `ontem, ${time}`;
        const date = dt.toLocaleDateString('pt-BR');
        return `${date}, ${time}`;
      } catch {
        return '';
      }
    }

    function currentFolderLabel(v) {
      const m = { entrada: 'Entrada', saida: 'Saída', arquivo: 'Arquivo', lixeira: 'Lixeira' };
      return m[v] || 'Entrada';
    }

    function buildTopBarHtml(selectedCount) {
      const unreadActive = !!(st.onlyUnread || st.status === 'nao_lidas' || st.status === 'não_lidas');
      const hasSelection = selectedCount > 0;

      const mb = getMailboxById(mailboxId);
      // Caixa pública no Portal: exceção é apenas para leitura/envio.
      // Marcadores e exclusão são ações administrativas e devem respeitar permissões/membership.
      const canMarker = !mb || !mailboxPermsEnforced(mb) || mailboxCanAdmin(mb) || mailboxHasPerm(mb, PERMISSIONS.gerenciarMarcador);
      const canDelete = !mb || !mailboxPermsEnforced(mb) || mailboxCanAdmin(mb) || mailboxHasPerm(mb, PERMISSIONS.excluirMensagem);
      const markerDisabledAttr = canMarker ? '' : ' disabled aria-disabled="true"';
      const trashDisabledAttr = canDelete ? '' : ' disabled aria-disabled="true"';

      let actionsHtml = '';
      if (hasSelection) {
        const ids = Array.from(st.selectedIds || []);
        const items = Array.isArray(st.items) ? st.items : [];

        function truthyFlag(v) {
          if (v === true) return true;
          if (v === 1) return true;
          if (typeof v === 'number') return v > 0;
          if (typeof v === 'string') {
            const s = v.trim().toLowerCase();
            return s === '1' || s === 'true' || s === 'sim' || s === 'yes';
          }
          return false;
        }

        function isPinned(it) {
          if (!it || typeof it !== 'object') return false;
          if (truthyFlag(it.fixada) || truthyFlag(it.fixa) || truthyFlag(it.pinned) || truthyFlag(it.pin) || truthyFlag(it.isPinned)) return true;
          const pinnedAt = it.pinnedAt ?? it.pinned_at ?? it.fixadaEm ?? it.fixada_em;
          if (pinnedAt === true) return true;
          if (typeof pinnedAt === 'number') return pinnedAt > 0;
          if (typeof pinnedAt === 'string') return pinnedAt.trim().length > 0;
          return false;
        }

        const selectedItems = ids.length
          ? items.filter(it => it && typeof it === 'object' && ids.includes(String(it.id || '')))
          : [];

        const allPinned = selectedItems.length > 0 && selectedItems.every(isPinned);
        const pinTitle = allPinned ? 'Desafixar' : 'Fixar';
        const pinIcon = allPinned ? 'bi bi-pin-angle-fill' : 'bi bi-pin-angle';

        const restoreBtnHtml = (String(view || '') === 'lixeira')
          ? '    <button type="button" class="btn btn-outline-secondary" id="msgActRestore" title="Restaurar"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i></button>'
          : '';

        const archiveIsUnarchive = (String(view || '') === 'arquivo');
        const archiveTitle = archiveIsUnarchive ? 'Desarquivar' : 'Arquivar';
        const archiveIcon = archiveIsUnarchive ? 'bi bi-box-arrow-up' : 'bi bi-archive';

        actionsHtml = [
          '<div class="d-flex align-items-center gap-2 flex-wrap">',
          '  <div class="d-flex align-items-center gap-2 flex-wrap" role="group" aria-label="Ações">',
          `    <button type="button" class="btn msg-icon-btn" id="msgActArchive" title="${archiveTitle}">${imgIcon(basePath, 'desarquivar.png', archiveTitle, archiveIcon, 30)}</button>`,
          '    <div class="dropdown">',
          `      <button type="button" class="btn msg-icon-btn dropdown-toggle" id="msgActMarker" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" title="Marcador"${markerDisabledAttr}>${imgIcon(basePath, 'caixa_men_marcador.png', 'Marcador', 'bi bi-tag', 30)}</button>`,
          '      <div class="dropdown-menu p-2" style="min-width: 300px;">',
          '        <div class="d-flex align-items-center justify-content-between mb-2">',
          `          <button type="button" class="btn btn-sm btn-outline-secondary fw-normal" id="msgMarkerNewBtn"${markerDisabledAttr}>Novo</button>`,
          '        </div>',
          '        <div id="msgMarkerCreateBlock" style="display:none;">',
          '          <div class="input-group input-group-sm">',
          '            <input type="text" class="form-control" id="msgNewMarkerName" placeholder="Nome do marcador" aria-label="Nome do marcador">',
          '            <input type="hidden" id="msgNewMarkerColor" name="msgNewMarkerColor" value="">',
          `            <button class="btn btn-outline-secondary" type="button" id="msgMarkerColorBtn" title="Cor"${markerDisabledAttr}>`,
          '              <span class="d-inline-block border shadow-sm" data-marker-color-preview="1" style="width:18px;height:18px;border-radius:3px;"></span>',
          '            </button>',
          '          </div>',
          '          <div class="d-flex justify-content-end gap-2 mt-2">',
          '            <button type="button" class="btn btn-sm btn-outline-secondary" id="msgMarkerCancelBtn">Cancelar</button>',
          `            <button type="button" class="btn btn-sm btn-primary" id="msgMarkerOkBtn"${markerDisabledAttr}>OK</button>`,
          '          </div>',
          '          <div class="mt-2" id="msgMarkerPalette" style="display:none;">',
          '            <div class="d-flex flex-wrap gap-2" data-marker-color-palette="1">',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="blue" title="Azul" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-blue);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="indigo" title="Índigo" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-indigo);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="purple" title="Roxo" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-purple);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="pink" title="Rosa" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-pink);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="red" title="Vermelho" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-red);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="orange" title="Laranja" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-orange);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="yellow" title="Amarelo" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-yellow);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="green" title="Verde" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-green);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="teal" title="Verde-azulado" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-teal);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="cyan" title="Ciano" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-cyan);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="gray-700" title="Cinza" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-gray-700);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="dark" title="Preto" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-dark);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c01" title="Cor 01" style="width:22px;height:22px;border-radius:3px;background-color:#1565C0;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c02" title="Cor 02" style="width:22px;height:22px;border-radius:3px;background-color:#1E88E5;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c03" title="Cor 03" style="width:22px;height:22px;border-radius:3px;background-color:#3949AB;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c04" title="Cor 04" style="width:22px;height:22px;border-radius:3px;background-color:#283593;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c05" title="Cor 05" style="width:22px;height:22px;border-radius:3px;background-color:#5E35B1;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c06" title="Cor 06" style="width:22px;height:22px;border-radius:3px;background-color:#6A1B9A;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c07" title="Cor 07" style="width:22px;height:22px;border-radius:3px;background-color:#8E24AA;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c08" title="Cor 08" style="width:22px;height:22px;border-radius:3px;background-color:#AD1457;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c09" title="Cor 09" style="width:22px;height:22px;border-radius:3px;background-color:#D81B60;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c10" title="Cor 10" style="width:22px;height:22px;border-radius:3px;background-color:#C62828;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c11" title="Cor 11" style="width:22px;height:22px;border-radius:3px;background-color:#E53935;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c12" title="Cor 12" style="width:22px;height:22px;border-radius:3px;background-color:#EF6C00;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c13" title="Cor 13" style="width:22px;height:22px;border-radius:3px;background-color:#FF8F00;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c14" title="Cor 14" style="width:22px;height:22px;border-radius:3px;background-color:#F9A825;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c15" title="Cor 15" style="width:22px;height:22px;border-radius:3px;background-color:#827717;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c16" title="Cor 16" style="width:22px;height:22px;border-radius:3px;background-color:#9E9D24;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c17" title="Cor 17" style="width:22px;height:22px;border-radius:3px;background-color:#2E7D32;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c18" title="Cor 18" style="width:22px;height:22px;border-radius:3px;background-color:#43A047;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c19" title="Cor 19" style="width:22px;height:22px;border-radius:3px;background-color:#00695C;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c20" title="Cor 20" style="width:22px;height:22px;border-radius:3px;background-color:#00897B;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c21" title="Cor 21" style="width:22px;height:22px;border-radius:3px;background-color:#00838F;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c22" title="Cor 22" style="width:22px;height:22px;border-radius:3px;background-color:#00ACC1;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c23" title="Cor 23" style="width:22px;height:22px;border-radius:3px;background-color:#5D4037;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c24" title="Cor 24" style="width:22px;height:22px;border-radius:3px;background-color:#546E7A;"></button>',
          '            </div>',
          '          </div>',
          '          <hr class="my-2">',
          '        </div>',
          '        <div id="msgMarkerList"></div>',
          '        <div class="mt-2 d-flex justify-content-end">',
          `          <button type="button" class="btn btn-sm btn-outline-secondary fw-normal" id="msgMarkerEditBtn"${markerDisabledAttr}>Editar</button>`,
          '        </div>',
          '      </div>',
          '    </div>',
          `    <button type="button" class="btn msg-icon-btn" id="msgActPin" title="${pinTitle}" aria-label="${pinTitle}">${imgIcon(basePath, allPinned ? 'caixa_men_desafixar.png' : 'caixa_men_fixar.png', pinTitle, pinIcon, 30)}</button>`,
          restoreBtnHtml,
          `    <button type="button" class="btn msg-icon-btn" id="msgActTrash" title="Excluir"${trashDisabledAttr}>${imgIcon(basePath, 'lixeira.png', 'Excluir', 'bi bi-trash', 30)}</button>`,
          '  </div>',
          `  <div class="text-muted small">${selectedCount} selecionada(s)</div>`,
          '</div>'
        ].join('\n');
      }

      return [
        '<div class="d-flex align-items-center justify-content-between gap-2 flex-wrap" id="msgListTop">',
        '  <div class="flex-grow-1" style="min-width: 260px;">',
        `    <div id="msgSearchWrap" style="display:${hasSelection ? 'none' : 'block'};">`,
        '      <div class="input-group">',
        '        <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>',
        '        <input type="search" class="form-control" id="msgSearch" placeholder="Pesquisar" aria-label="Pesquisar" value="' + escapeHtml(st.q) + '">',
        '      </div>',
        '    </div>',
        `    <div id="msgActionsWrap" style="display:${hasSelection ? 'block' : 'none'};">`,
        actionsHtml,
        '    </div>',
        '  </div>',
        '  <div class="d-flex align-items-center gap-2">',
        `    <button type="button" class="btn msg-icon-btn" id="msgFilterBtn" title="Filtro">${imgIcon(basePath, 'filtro.png', 'Filtro', 'bi bi-funnel', 30)}</button>`,
        `    <button type="button" class="btn msg-icon-btn wdg-msg-unread-toggle ${unreadActive ? 'msg-icon-btn-active' : ''}" id="msgUnreadBtn" aria-pressed="${unreadActive ? 'true' : 'false'}" title="${unreadActive ? 'Somente não lidas (ON)' : 'Somente não lidas (OFF)'}">${imgIcon(basePath, 'mensagem.png', 'Somente não lidas', 'bi bi-envelope', 30)}<span class="wdg-msg-unread-pill ${unreadActive ? 'wdg-msg-unread-pill--on' : 'wdg-msg-unread-pill--off'}" aria-hidden="true">${unreadActive ? 'ON' : 'OFF'}</span></button>`,
        '    <div class="dropdown">',
        '      <button class="btn msg-icon-btn" type="button" id="msgSelectMenuBtn" data-bs-toggle="dropdown" aria-expanded="false" title="Selecionar">',
        `        ${imgIcon(basePath, 'selecionarmenu.png', 'Selecionar', 'bi bi-three-dots-vertical', 30)}`,
        '      </button>',
        '      <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="msgSelectMenuBtn">',
        '        <li><h6 class="dropdown-header">Selecionar</h6></li>',
        '        <li><button class="dropdown-item" type="button" data-select="all">Todas</button></li>',
        '        <li><button class="dropdown-item" type="button" data-select="none">Nenhuma</button></li>',
        '        <li><button class="dropdown-item" type="button" data-select="read">Lidas</button></li>',
        '        <li><button class="dropdown-item" type="button" data-select="unread">Não lidas</button></li>',
        '      </ul>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('\n');
    }

    function buildFilterPanelHtml() {
      const open = !!st.filterOpen;
      const statusVal = String((st.onlyUnread ? 'nao_lidas' : (st.status || 'todas')));
      const folderVal = String(view || 'entrada');
      const markerVal = String(st.marker || '');
      const markersOptionsHtml = (() => {
        const list = Array.isArray(st.markers) ? st.markers : [];
        const byName = list
          .map(m => String(m?.nome || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        return byName.map((nm) => {
          const sel = nm === markerVal ? 'selected' : '';
          return `<option value="${escapeHtml(nm)}" ${sel}>${escapeHtml(nm)}</option>`;
        }).join('\n');
      })();
      return [
        `<div class="card mt-2" id="msgFilterPanel" style="display:${open ? 'block' : 'none'};">`,
        '  <div class="card-body">',
        '    <div class="row g-2 align-items-end">',
        '      <div class="col-12 col-lg-3">',
        '        <select class="form-select form-select-sm" id="msgFilterFolder" aria-label="Pasta">',
        `          <option value="entrada" ${folderVal === 'entrada' ? 'selected' : ''}>Entrada</option>`,
        `          <option value="saida" ${folderVal === 'saida' ? 'selected' : ''}>Saída</option>`,
        `          <option value="arquivo" ${folderVal === 'arquivo' ? 'selected' : ''}>Arquivo</option>`,
        `          <option value="lixeira" ${folderVal === 'lixeira' ? 'selected' : ''}>Lixeira</option>`,
        '        </select>',
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        '        <select class="form-select form-select-sm" id="msgFilterStatus" aria-label="Status">',
        `          <option value="todas" ${statusVal === 'todas' ? 'selected' : ''}>Todas</option>`,
        `          <option value="lidas" ${statusVal === 'lidas' ? 'selected' : ''}>Lidas</option>`,
        `          <option value="nao_lidas" ${statusVal === 'nao_lidas' || statusVal === 'não_lidas' ? 'selected' : ''}>Não lidas</option>`,
        '        </select>',
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        `        <input class="form-control form-control-sm" id="msgFilterTexto" type="text" placeholder="Texto" aria-label="Texto" value="${escapeHtml(st.q)}">`,
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        `        <input class="form-control form-control-sm" id="msgFilterProtocolo" type="text" placeholder="Protocolo" aria-label="Protocolo" value="${escapeHtml(st.protocolo)}">`,
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        `        <input class="form-control form-control-sm" id="msgFilterDe" type="text" placeholder="De" aria-label="De" value="${escapeHtml(st.de)}">`,
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        `        <input class="form-control form-control-sm" id="msgFilterPara" type="text" placeholder="Para" aria-label="Para" value="${escapeHtml(st.para)}">`,
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        `        <input class="form-control form-control-sm" id="msgFilterIni" type="month" aria-label="Início" value="${escapeHtml(st.ini)}">`,
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        `        <input class="form-control form-control-sm" id="msgFilterFim" type="month" aria-label="Fim" value="${escapeHtml(st.fim)}">`,
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        '        <div class="form-check">',
        `          <input class="form-check-input" type="checkbox" id="msgFilterComAnexo" ${st.comAnexo ? 'checked' : ''}>`,
        '          <label class="form-check-label" for="msgFilterComAnexo">Com anexo</label>',
        '        </div>',
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        '        <div class="form-check">',
        `          <input class="form-check-input" type="checkbox" id="msgFilterSemMarcador" ${st.semMarcador ? 'checked' : ''}>`,
        '          <label class="form-check-label" for="msgFilterSemMarcador">Sem marcador</label>',
        '        </div>',
        '      </div>',
        '      <div class="col-12 col-lg-3">',
        '        <select class="form-select form-select-sm" id="msgFilterMarker" aria-label="Marcador">',
        `          <option value="" ${markerVal ? '' : 'selected'}>Todos os marcadores</option>`,
        markersOptionsHtml,
        '        </select>',
        '      </div>',
        '      <div class="col-12 d-flex gap-2">',
        '        <button type="button" class="btn btn-sm btn-primary" id="msgFilterApply">Pesquisar</button>',
        '        <button type="button" class="btn btn-sm btn-outline-secondary" id="msgFilterClear">Limpar</button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('\n');
    }

    function buildTableHtml(items) {
      const list = Array.isArray(items) ? items : [];
      const whoLabel = (String(view || '').trim().toLowerCase() === 'saida') ? 'Destinatário' : 'Remetente';

      const pageSize = [10, 25, 50, 100].includes(Number(st.pageSize)) ? Number(st.pageSize) : 25;
      const total = Number.isFinite(Number(st.total)) && Number(st.total) >= 0 ? Number(st.total) : list.length;
      const pages = Math.max(1, Number.isFinite(Number(st.pages)) && Number(st.pages) > 0 ? Number(st.pages) : Math.ceil(Math.max(1, total) / pageSize));
      const page = Math.min(Math.max(1, Number(st.page) || 1), pages);
      // Mantém estado coerente ao renderizar (p.ex. total zerou após filtro).
      try { st.pageSize = pageSize; } catch {}
      try { st.total = total; } catch {}
      try { st.pages = pages; } catch {}
      try { st.page = page; } catch {}

      function getThreadCount(it) {
        const n = Number(it?.threadCount || it?.thread_count);
        if (Number.isFinite(n) && n > 0) return n;
        return 1;
      }

      function isThreadRoot(it) {
        if (!it || typeof it !== 'object') return false;
        if (it.threadIsRoot === true) return true;
        if (it.threadIsRoot === false) return false;
        // fallback: sem campo do backend
        const hasRoot = String(it.threadRootId || it.thread_root_id || '').trim();
        return !hasRoot;
      }

      function buildThreadIndicatorHtml(it) {
        const isRoot = isThreadRoot(it);
        // Se não for a raiz, o ícone representa o tipo da mensagem (reply/forward)
        if (!isRoot) {
          const isForward = !!String(it?.forwardedFromId || it?.forwarded_from_id || '').trim();
          const isReply = !!String(it?.inReplyToId || it?.in_reply_to || '').trim();
          if (isForward) return '<i class="bi bi-forward-fill me-1" aria-hidden="true" title="Encaminhada"></i>';
          if (isReply) return '<i class="bi bi-reply-fill me-1" aria-hidden="true" title="Respondida"></i>';
          return '';
        }

        // Na raiz, o ícone representa se o bloco teve reply/forward em algum ponto
        const hasForward = !!(it?.threadHasForward || it?.thread_has_forward);
        const hasReply = !!(it?.threadHasReply || it?.thread_has_reply);
        if (hasForward) return '<i class="bi bi-forward-fill me-1" aria-hidden="true" title="Encaminhada"></i>';
        if (hasReply) return '<i class="bi bi-reply-fill me-1" aria-hidden="true" title="Respondida"></i>';
        return '';
      }

      function truthyFlag(v) {
        if (v === true) return true;
        if (v === 1) return true;
        if (typeof v === 'number') return v > 0;
        if (typeof v === 'string') {
          const s = v.trim().toLowerCase();
          return s === '1' || s === 'true' || s === 'sim' || s === 'yes' || s === 's' || s === 'y';
        }
        return false;
      }

      function falsyFlag(v) {
        if (v === false) return true;
        if (v === 0) return true;
        if (typeof v === 'string') {
          const s = v.trim().toLowerCase();
          return s === '' || s === '0' || s === 'false' || s === 'nao' || s === 'não' || s === 'n' || s === 'no' || s === 'null' || s === 'undefined' || s === 'n/a' || s === 'na';
        }
        return false;
      }

      function isTruthyDateLikeString(raw) {
        const s = String(raw || '').trim();
        if (!s) return false;
        const low = s.toLowerCase();
        if (falsyFlag(low)) return false;
        // timestamp numérico
        if (/^\d{10,}$/.test(s)) return true;
        // ISO-ish
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
        // fallback: Date.parse
        const t = Date.parse(s);
        return Number.isFinite(t);
      }

      function isRead(it) {
        if (!it || typeof it !== 'object') return false;
        // Alguns backends mandam "N"/"Não"/"false" em campos de leitura.
        // Se houver um flag explícito de "não lida", respeite.
        if (falsyFlag(it.lida) || falsyFlag(it.read) || falsyFlag(it.isRead) || falsyFlag(it.is_read) || falsyFlag(it.lido) || falsyFlag(it.visualizada) || falsyFlag(it.visualizado)) {
          return false;
        }

        // Status textual (cuidado com substring "lida" dentro de "nao_lida")
        try {
          const stRaw = it.status ?? it.situacao ?? it.estado;
          if (typeof stRaw === 'string') {
            const st = stRaw.trim().toLowerCase();
            if (st) {
              if (st.includes('nao_lida') || st.includes('não_lida') || st.includes('nao lida') || st.includes('não lida') || st === 'unread' || st === 'nao_lidas' || st === 'não_lidas') return false;
              if (st === 'lida' || st === 'lidas' || st === 'read') return true;
            }
          }
        } catch { /* noop */ }

        // Convenções comuns do backend
        if (truthyFlag(it.lida) || truthyFlag(it.read) || truthyFlag(it.isRead) || truthyFlag(it.is_read) || truthyFlag(it.lido) || truthyFlag(it.visualizada) || truthyFlag(it.visualizado) || truthyFlag(it.visto) || truthyFlag(it.viewed)) return true;
        const readAt = it.lidaEm ?? it.lida_em ?? it.readAt ?? it.read_at ?? it.lidoEm ?? it.lido_em ?? it.visualizadoEm ?? it.visualizado_em ?? it.visualizadaEm ?? it.visualizada_em ?? it.vistoEm ?? it.visto_em ?? it.openedAt ?? it.opened_at;
        if (readAt === true) return true;
        if (typeof readAt === 'number') return readAt > 0;
        if (typeof readAt === 'string') {
          if (falsyFlag(readAt)) return false;
          return isTruthyDateLikeString(readAt);
        }
        return false;
      }

      function isPinned(it) {
        if (!it || typeof it !== 'object') return false;
        // Suporta várias convenções possíveis do backend
        if (truthyFlag(it.fixada) || truthyFlag(it.fixa) || truthyFlag(it.pinned) || truthyFlag(it.pin) || truthyFlag(it.isPinned)) return true;
        const pinnedAt = it.pinnedAt ?? it.pinned_at ?? it.fixadaEm ?? it.fixada_em;
        if (pinnedAt === true) return true;
        if (typeof pinnedAt === 'number') return pinnedAt > 0;
        if (typeof pinnedAt === 'string') return pinnedAt.trim().length > 0;
        return false;
      }

      function renderRow(it) {
        const checked = st.selectedIds.has(it.id) ? 'checked' : '';
        const threadN = getThreadCount(it);
        const remetenteTxt = String(it.remetente || '').trim();
        const showCount = threadN > 1;
        const remetente = escapeHtml(remetenteTxt ? (showCount ? `${remetenteTxt} (${threadN})` : remetenteTxt) : '');
        const indicator = buildThreadIndicatorHtml(it);
        const assunto = escapeHtml(it.assunto || '');
        const data = escapeHtml(fmtDate(it.data));
        const clip = it.comAnexo ? `${inlineImgIcon(basePath, 'anexo.png', 'Anexo', 'bi bi-paperclip', 16, 'ms-2')}` : '';
        const read = isRead(it);
        const bold = read ? '' : 'fw-bold';
        const rowClass = read ? '' : 'wdg-msg-row--unread';
        const copiaBadge = it.copia ? '<span class="badge rounded-pill text-bg-light border border-secondary-subtle text-body-secondary fw-semibold ms-2 align-middle">Cópia</span>' : '';

        const markerBadges = (Array.isArray(it?.marcadores) ? it.marcadores : [])
          .map(x => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 3)
          .map((name) => {
            const { bgCss, textCss } = markerColorStyle(getMarkerColorKey(name, ''));
            return `<span class="badge rounded-1 text-uppercase fw-semibold me-2" style="background-color:${escapeHtml(bgCss)};color:${escapeHtml(textCss)};">${escapeHtml(name)}</span>`;
          }).join('');
        return [
          `<tr data-msg-row="1" data-id="${escapeHtml(it.id)}" class="${rowClass}">`,
          `  <td data-msg-check-col="1" style="width: 36px; padding: 0; position: relative;">` +
          `    <label style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:40px;cursor:pointer;margin:0;" aria-label="Selecionar mensagem">` +
          `      <input class="form-check-input" type="checkbox" name="msgSelect" aria-label="Selecionar mensagem" data-msg-check="1" data-id="${escapeHtml(it.id)}" ${checked}>` +
          `    </label>` +
          `  </td>`,
          `  <td class="text-truncate ${bold}" style="max-width: 260px;">${indicator}${remetente}</td>`,
          `  <td class="text-truncate ${bold}" style="max-width: 520px;">${markerBadges}${assunto}${copiaBadge}</td>`,
          `  <td class="text-nowrap text-muted ${bold}" style="width: 160px; text-align:right;">${data}${clip}</td>`,
          '</tr>'
        ].join('\n');
      }

      function sectionRow(label) {
        return [
          '<tr class="table-light">',
          `  <td colspan="4" class="text-muted small py-2">${escapeHtml(label)}</td>`,
          '</tr>'
        ].join('\n');
      }

      const pinned = list.filter(isPinned);
      const others = list.filter(x => !isPinned(x));

      const rowsParts = [];
      if (pinned.length) {
        rowsParts.push(sectionRow('Fixadas'));
        rowsParts.push(pinned.map(renderRow).join('\n'));
      }
      if (others.length) {
        if (pinned.length) rowsParts.push(sectionRow('Ordem cronológica'));
        rowsParts.push(others.map(renderRow).join('\n'));
      }

      const rows = rowsParts.filter(Boolean).join('\n');

      const empty = [
        '<tr>',
        `  <td colspan="4" class="text-muted">Nenhuma mensagem em ${escapeHtml(currentFolderLabel(view))}.</td>`,
        '</tr>'
      ].join('\n');

      return [
        '<div class="table-responsive mt-2" style="font-size:15px;">',
        '  <table class="table table-hover align-middle mb-0">',
        '    <thead>',
        '      <tr class="text-muted small">',
        '        <th style="width: 36px;"></th>',
        `        <th style="max-width: 260px;">${escapeHtml(whoLabel)}</th>`,
        '        <th style="max-width: 520px;">Assunto</th>',
        '        <th style="width: 160px; text-align:right;">Data</th>',
        '      </tr>',
        '    </thead>',
        '    <tbody id="msgListBody">',
        (rows || empty),
        '    </tbody>',
        '  </table>',
        '</div>'
        ,
        // Paginação (sempre visível)
        '<div class="mt-3" id="msgPagerHost" style="position:relative; z-index:20; overflow:visible;">',
        '  <div class="row g-2 align-items-center">',
        '    <div class="col-12 col-md-4">',
        '      <div class="d-flex align-items-center justify-content-start gap-2">',
        '        <span class="text-muted small text-nowrap">Por página</span>',
        '        <select class="form-select form-select-sm" id="msgPagerSize" aria-label="Mensagens por página" style="width:110px;">',
        `          <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>`,
        `          <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>`,
        `          <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>`,
        `          <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>`,
        '        </select>',
        '      </div>',
        '    </div>',
        '    <div class="col-12 col-md-4">',
        '      <div class="d-flex justify-content-center">',
        '        <div class="btn-group" role="group" aria-label="Paginação">',
        `          <button type="button" class="btn btn-outline-secondary btn-sm fw-normal" id="msgPagerFirst" ${page <= 1 ? 'disabled aria-disabled="true"' : ''} title="Primeira">«</button>`,
        `          <button type="button" class="btn btn-outline-secondary btn-sm fw-normal" id="msgPagerPrev" ${page <= 1 ? 'disabled aria-disabled="true"' : ''} title="Anterior">‹</button>`,
        `          <button type="button" class="btn btn-outline-secondary btn-sm fw-normal" disabled aria-disabled="true" id="msgPagerInfo" title="Página">Página ${page} de ${pages}</button>`,
        `          <button type="button" class="btn btn-outline-secondary btn-sm fw-normal" id="msgPagerNext" ${page >= pages ? 'disabled aria-disabled="true"' : ''} title="Próxima">›</button>`,
        `          <button type="button" class="btn btn-outline-secondary btn-sm fw-normal" id="msgPagerLast" ${page >= pages ? 'disabled aria-disabled="true"' : ''} title="Última">»</button>`,
        '        </div>',
        '      </div>',
        '    </div>',
        '    <div class="col-12 col-md-4">',
        `      <div class="text-muted small text-nowrap d-flex justify-content-end">${escapeHtml(String(total))} mensagem(ns)</div>`,
        '    </div>',
        '  </div>',
        '</div>'
      ].join('\n');
    }

    function renderListShell() {
      // Se estamos renderizando a LISTA, o detalhe não está mais aberto.
      try { st.openMessageId = ''; } catch {}
      const selectedCount = st.selectedIds.size;
      const diag = MEMORY_STORE.lastApiDiag;
      const debugEnabled = isDebugEnabled();
      const mailboxesDiag = MEMORY_STORE.lastMailboxesDiag;
      const diagHtml = (() => {
        // Diagnóstico visual é útil apenas para troubleshooting. Em produção, não exibir.
        if (!debugEnabled) return '';
        if (!diag) return '';
        const ver = String(diag.apiVersion || '').trim();
        const verShort = ver ? ver.slice(0, 12) : '';
        const db = String(diag.dbMode || '').trim();
        const parts = [
          `HTTP ${String(diag.status || '')}`,
          verShort ? `v ${escapeHtml(verShort)}` : '',
          db ? `db:${escapeHtml(db)}` : ''
        ].filter(Boolean);
        const text = parts.join(' · ');
        if (!text) return '';
        const metaText = (() => {
          const meta = diag.meta && typeof diag.meta === 'object' ? diag.meta : null;
          if (!meta) return '';
          const folder = meta.folder ? String(meta.folder) : '';
          const mailboxId = meta.mailboxId ? String(meta.mailboxId) : '';
          const ownerCandidatesCount = (meta.ownerCandidatesCount !== undefined && meta.ownerCandidatesCount !== null)
            ? String(meta.ownerCandidatesCount)
            : '';
          const parts2 = [
            folder ? `pasta:${escapeHtml(folder)}` : '',
            mailboxId ? `caixa:${escapeHtml(mailboxId)}` : '',
            ownerCandidatesCount ? `owners:${escapeHtml(ownerCandidatesCount)}` : ''
          ].filter(Boolean);
          return parts2.length ? ` <span class="ms-2">(${parts2.join(' · ')})</span>` : '';
        })();
        return `<div class="text-muted small mt-2" id="msgListDiag">API mensagens: ${text}${metaText}</div>`;
      })();

      const mailboxesDiagHtml = (() => {
        if (!debugEnabled) return '';
        if (!mailboxesDiag) return '';
        const dbg = mailboxesDiag && mailboxesDiag.debug && typeof mailboxesDiag.debug === 'object' ? mailboxesDiag.debug : null;
        if (!dbg) return `<div class="text-muted small mt-1" id="msgMailboxesDiag">API caixas: HTTP ${escapeHtml(String(mailboxesDiag.status || ''))}</div>`;
        const counts = dbg.counts && typeof dbg.counts === 'object' ? dbg.counts : {};
        const ctx = dbg.ctx && typeof dbg.ctx === 'object' ? dbg.ctx : {};
        const parts = [
          `HTTP ${escapeHtml(String(mailboxesDiag.status || ''))}`,
          (counts.total !== undefined ? `total:${escapeHtml(String(counts.total))}` : ''),
          (counts.visible !== undefined ? `vis:${escapeHtml(String(counts.visible))}` : ''),
          (ctx.identityKeyType ? `key:${escapeHtml(String(ctx.identityKeyType))}` : ''),
          (ctx.hasEmail !== undefined ? `email:${ctx.hasEmail ? '1' : '0'}` : ''),
          (ctx.emailMasked ? `user:${escapeHtml(String(ctx.emailMasked))}` : ''),
          (ctx.vinculosCount !== undefined ? `vinc:${escapeHtml(String(ctx.vinculosCount))}` : '')
        ].filter(Boolean);
        return `<div class="text-muted small mt-1" id="msgMailboxesDiag">API caixas: ${parts.join(' · ')}</div>`;
      })();
      bodyEl.innerHTML = [
        buildTopBarHtml(selectedCount),
        buildFilterPanelHtml(),
        '<div id="msgListAlerts"></div>',
        mailboxesDiagHtml,
        diagHtml,
        buildTableHtml(st.items),
      ].join('\n');
    }

    function showAlert(kind, msg) {
      const host = qs('#msgListAlerts', bodyEl);
      if (!host) return;
      host.innerHTML = `<div class="alert alert-${escapeHtml(kind)}" role="alert">${escapeHtml(msg)}</div>`;
    }

    function updateTopBar() {
      // re-render topo + painel (mantém itens)
      renderListShell();
      bindHandlers();
    }

    async function loadMarkersIfNeeded() {
      if (st.markers) return st.markers;
      const list = await apiFetchMarkers(basePath, mailboxId);
      st.markers = (Array.isArray(list) ? list : []).map(x => ({
        id: String(x.id || ''),
        nome: String(x.nome || '').trim(),
        cor: String(x.cor || x.color || x.colour || '').trim()
      })).filter(x => x.nome);
      return st.markers;
    }

    const MARKER_COLORS_ALLOWED = new Set([
      'blue', 'indigo', 'purple', 'pink',
      'red', 'orange', 'yellow', 'green',
      'teal', 'cyan', 'gray', 'gray-300', 'gray-700', 'gray-dark',
      'info', 'warning', 'light', 'dark',
      'primary', 'secondary', 'success', 'danger',
      'blue-soft', 'indigo-soft', 'purple-soft', 'pink-soft',
      'red-soft', 'orange-soft', 'yellow-soft', 'green-soft',
      'teal-soft', 'cyan-soft',
      'primary-soft', 'secondary-soft', 'success-soft', 'danger-soft',
      'c01', 'c02', 'c03', 'c04', 'c05', 'c06',
      'c07', 'c08', 'c09', 'c10', 'c11', 'c12',
      'c13', 'c14', 'c15', 'c16', 'c17', 'c18',
      'c19', 'c20', 'c21', 'c22', 'c23', 'c24'
    ]);

    function markerColorStyle(key) {
      const k = normalizeMarkerColorKey(key);

      const customSolidHex = {
        c01: '#1565C0',
        c02: '#1E88E5',
        c03: '#3949AB',
        c04: '#283593',
        c05: '#5E35B1',
        c06: '#6A1B9A',
        c07: '#8E24AA',
        c08: '#AD1457',
        c09: '#D81B60',
        c10: '#C62828',
        c11: '#E53935',
        c12: '#EF6C00',
        c13: '#FF8F00',
        c14: '#F9A825',
        c15: '#827717',
        c16: '#9E9D24',
        c17: '#2E7D32',
        c18: '#43A047',
        c19: '#00695C',
        c20: '#00897B',
        c21: '#00838F',
        c22: '#00ACC1',
        c23: '#5D4037',
        c24: '#546E7A'
      };

      function isLightHex(hex) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!m) return false;
        const v = m[1];
        const r = parseInt(v.slice(0, 2), 16);
        const g = parseInt(v.slice(2, 4), 16);
        const b = parseInt(v.slice(4, 6), 16);
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return yiq >= 155;
      }

      if (customSolidHex[k]) {
        const bgCss = customSolidHex[k];
        const textCss = isLightHex(bgCss) ? 'var(--bs-dark)' : 'var(--bs-white)';
        return { k, bgCss, textCss };
      }

      const solidBgVar = {
        blue: '--bs-blue',
        indigo: '--bs-indigo',
        purple: '--bs-purple',
        pink: '--bs-pink',
        red: '--bs-red',
        orange: '--bs-orange',
        yellow: '--bs-yellow',
        green: '--bs-green',
        teal: '--bs-teal',
        cyan: '--bs-cyan',
        gray: '--bs-gray',
        'gray-300': '--bs-gray-300',
        'gray-700': '--bs-gray-700',
        'gray-dark': '--bs-gray-dark',
        info: '--bs-info',
        warning: '--bs-warning',
        light: '--bs-light',
        dark: '--bs-dark',
        primary: '--bs-primary',
        secondary: '--bs-secondary',
        success: '--bs-success',
        danger: '--bs-danger'
      };

      // Variantes "soft" (claras), baseadas nos RGB do Bootstrap.
      if (k.endsWith('-soft')) {
        const base = k.slice(0, -5);
        const alpha = (base === 'yellow') ? 0.35 : 0.25;
        const bgCss = `rgba(var(--bs-${base}-rgb), ${alpha})`;
        const textCss = 'var(--bs-dark)';
        return { k, bgCss, textCss };
      }

      const bgVar = solidBgVar[k] || '--bs-primary';
      const bgCss = `var(${bgVar})`;
      const textCss = (k === 'yellow' || k === 'warning' || k === 'light' || k === 'gray-300')
        ? 'var(--bs-dark)'
        : 'var(--bs-white)';
      return { k, bgCss, textCss };
    }

    function normalizeMarkerColorKey(k) {
      const key = String(k || '').trim().toLowerCase();
      return MARKER_COLORS_ALLOWED.has(key) ? key : 'primary';
    }

    function getMarkerColorKey(markerName, markerObjColor) {
      const name = String(markerName || '').trim();
      if (!name) return 'primary';
      const fromObj = String(markerObjColor || '').trim();
      if (fromObj) return normalizeMarkerColorKey(fromObj);
      const list = Array.isArray(st.markers) ? st.markers : [];
      const found = list.find(m => String(m?.nome || '').trim().toLowerCase() === name.toLowerCase());
      const v = String(found?.cor || '').trim();
      return normalizeMarkerColorKey(v);
    }

    function renderMarkerDropdown() {
      const host = qsMarker('#msgMarkerList', bodyEl);
      if (!host) return;
      const list = Array.isArray(st.markers) ? st.markers : [];
      const selectedIds = Array.from(st.selectedIds || []);
      const selectionOverride = Array.isArray(st.markerSelectionOverride) ? st.markerSelectionOverride : null;

      function markersForItem(it) {
        const arr = Array.isArray(it?.marcadores) ? it.marcadores : [];
        return arr.map(x => String(x || '').trim()).filter(Boolean);
      }

      function isMarkerCheckedForSelection(markerName) {
        if (selectionOverride) {
          const key = String(markerName || '').trim().toLowerCase();
          if (!key) return false;
          return selectionOverride.some(x => String(x || '').trim().toLowerCase() === key);
        }
        if (!selectedIds.length) return false;
        const key = String(markerName || '').trim().toLowerCase();
        if (!key) return false;
        const items = Array.isArray(st.items) ? st.items : [];
        let any = false;
        for (const id of selectedIds) {
          const it = items.find(x => String(x?.id || '') === String(id));
          if (!it) continue;
          any = true;
          const tags = markersForItem(it).map(t => t.toLowerCase());
          if (!tags.includes(key)) return false;
        }
        return any;
      }

      if (!list.length) {
        host.innerHTML = '<div class="text-muted small px-2">Nenhum marcador.</div>';
        return;
      }

      host.innerHTML = list.map(m => {
        const nome = String(m?.nome || '').trim();
        const checked = isMarkerCheckedForSelection(nome);
        const { bgCss } = markerColorStyle(getMarkerColorKey(nome, m?.cor));
        const dot = `<span class="d-inline-block me-2 border shadow-sm" style="width:20px;height:20px;border-radius:4px;background-color:${escapeHtml(bgCss)};"></span>`;
        const removeBtn = st.markerEditMode
          ? (
            `<button type="button" class="btn p-0" data-marker-remove-id="${escapeHtml(m.id)}" title="Remover" aria-label="Remover" ` +
            `style="border:0;background:transparent;box-shadow:none;outline:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;">` +
            `<img src="/images/remover.png" alt="Remover" style="width:24px;height:24px;object-fit:contain;display:block;">` +
            `</button>`
          )
          : '';
        return [
          '<div class="dropdown-item d-flex align-items-center gap-2" data-marker-row="1" data-marker-name="' + escapeHtml(nome) + '">',
          '  <div class="d-flex align-items-center flex-grow-1 text-truncate" style="min-width:0;">',
          dot,
          (st.markerEditMode
            ? ''
            : ['    <div class="form-check m-0">',
              `      <input class="form-check-input" type="checkbox" name="markerSelect" aria-label="Selecionar marcador" ${checked ? 'checked' : ''} tabindex="-1">`,
              '    </div>'].join('')),
          '    <div class="text-truncate ms-2">' + escapeHtml(nome) + '</div>',
          '  </div>',
          (removeBtn ? ('  <div class="flex-shrink-0 ms-2">' + removeBtn + '</div>') : ''),
          '</div>'
        ].join('');
      }).join('');
    }

    function fmtDateTime(d) {
      try {
        const dt = new Date(d);
        if (isNaN(dt)) return '';
        return dt.toLocaleString('pt-BR');
      } catch {
        return '';
      }
    }

    function recipientsLine(label, list) {
      const arr = Array.isArray(list) ? list : [];
      if (!arr.length) return '';
      const txt = arr
        .map(x => String(x?.display || x?.name || x?.nome || x?.email || '').trim())
        .filter(Boolean)
        .join(', ');
      if (!txt) return '';
      return `<div class="small"><span class="text-muted">${escapeHtml(label)}:</span> ${escapeHtml(txt)}</div>`;
    }

    function renderMessageDetail(detail) {
      const item = detail && detail.item ? detail.item : null;
      if (!item) {
        renderListShell();
        bindHandlers();
        showAlert('danger', 'Falha ao carregar mensagem.');
        return;
      }

      // Guard: se o usuário trocar de view/caixa, não permita que callbacks atrasados
      // re-renderizem o detalhe por cima da tela atual.
      const expectedView = String(view || '').trim();
      const expectedMailboxId = String(mailboxId || 'pessoal').trim() || 'pessoal';

      const _attByMsgId = new Map();
      const _attMetaByMsgId = new Map();

      const ctx = getCtx();
      const allMailboxes = buildAllMailboxes(ctx);
      const assunto = escapeHtml(item.assunto || '');
      const copiaBadge = item.copia ? '<span class="badge rounded-pill text-bg-light border border-secondary-subtle text-body-secondary fw-semibold ms-2 align-middle">Cópia</span>' : '';

      function fmtWhen(dt) {
        try {
          const d = new Date(dt);
          if (isNaN(d)) return { label: '', time: '', ago: '' };
          const now = new Date();
          const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
          const dd = Math.round((startOf(now) - startOf(d)) / (24 * 3600 * 1000));
          let label = '';
          if (dd === 0) label = 'Hoje';
          else if (dd === 1) label = 'Ontem';
          else {
            const w = d.toLocaleDateString('pt-BR', { weekday: 'long' });
            label = w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '';
          }
          const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const diffMs = Math.max(0, now - d);
          const diffH = Math.floor(diffMs / (3600 * 1000));
          const ago = diffH < 48
            ? `há ${diffH} ${diffH === 1 ? 'hora' : 'horas'}`
            : (() => {
              const diffD = Math.floor(diffH / 24);
              return `há ${diffD} ${diffD === 1 ? 'dia' : 'dias'}`;
            })();
          return { label, time, ago };
        } catch {
          return { label: '', time: '', ago: '' };
        }
      }

      function renderToBadges(list, msg) {
        const arr = Array.isArray(list) ? list : [];
        if (!arr.length) return '';

        const looksLikeEmail = (v) => {
          const s = String(v || '').trim();
          return !!(s && s.includes('@') && s.length >= 5);
        };

        const users = Array.isArray(USERS.cache) ? USERS.cache : [];
        const usersByEmail = new Map(users.map(u => [normalizeEmailKey(u?.email), u]));

        const senderUserLabel = (() => {
          const m = msg || item || {};
          const raw = String(m?.from?.display || '').trim();
          if (raw && !looksLikeEmail(raw)) return raw;
          const key = normalizeEmailKey(m?.from?.owner || m?.from?.email || '');
          const u = key ? usersByEmail.get(key) : null;
          if (u && String(u.nome || '').trim()) return String(u.nome).trim();
          if (looksLikeEmail(raw)) return 'Master User';
          return raw || 'Usuário';
        })();

        function resolveMailboxNameFromAny(x) {
          const mbId = String(x?.mailboxId || x?.id || '').trim();
          const direct = String(x?.mailboxName || x?.name || x?.nome || x?.display || '').trim();
          if (direct && !looksLikeEmail(direct)) return direct;
          if (!mbId || mbId === 'pessoal') return '';
          try {
            const found = (Array.isArray(allMailboxes) ? allMailboxes : []).find(mb => String(mb?.id || '').trim() === mbId);
            const nm = String(found?.name || found?.nome || '').trim();
            if (nm) return nm;
          } catch {}
          return mbId;
        }

        function resolveUserRecipientLabel(x) {
          const rawLabel = String(x?.display || x?.name || x?.nome || x?.email || '').trim();
          const emailKey = normalizeEmailKey(x?.email || x?.owner || rawLabel);
          const u = emailKey ? usersByEmail.get(emailKey) : null;
          const nome = String(u?.nome || '').trim() || (looksLikeEmail(rawLabel) ? '' : rawLabel);

          let suffix = '';
          try {
            const perms = Array.isArray(u?.perms) ? u.perms : [];
            const vinculos = Array.isArray(u?.vinculos) ? u.vinculos : [];
            const mora = perms.includes('Mora') || vinculos.some(v => !!v?.morador);
            if (mora) {
              const v = vinculos.find(v => !!v?.morador && String(v?.hab_label || '').trim()) || vinculos.find(v => String(v?.hab_label || '').trim());
              const hab = String(v?.hab_label || '').trim();
              if (hab) suffix = hab.replace(/\s*-\s*/g, ', ');
            } else if (u && (u.is_funcionario || /func|colab/i.test(String(u.role || '')))) {
              suffix = 'Colaborador';
            }
          } catch {}

          const label = nome || rawLabel;
          if (!suffix) return label;
          return `${label} (${suffix})`;
        }

        const labels = arr.map(x => {
          const mbId = String(x?.mailboxId || '').trim();
          const isMailbox = !!(mbId && mbId !== 'pessoal');
          if (isMailbox) {
            const mbName = resolveMailboxNameFromAny(x);
            return mbName ? `${mbName} (${senderUserLabel})` : senderUserLabel;
          }
          return resolveUserRecipientLabel(x);
        }).filter(s => String(s || '').trim());

        if (!labels.length) return '';
        return labels.map(n => `<span class="badge text-bg-light border text-dark me-1">${escapeHtml(n)}</span>`).join('');
      }

      function fmtBytes(n) {
        const v = Number(n) || 0;
        if (!v) return '';
        const kb = 1024;
        const mb = kb * 1024;
        if (v >= mb) return `${(v / mb).toFixed(2)} MB`;
        if (v >= kb) return `${Math.round(v / kb)} KB`;
        return `${v} B`;
      }

      function normalizeAttachmentUrl(url) {
        const raw = String(url || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
        if (raw.startsWith('/')) {
          const bp = String(basePath || '').trim();
          if (bp && !raw.startsWith(bp + '/')) return bp + raw;
          return raw;
        }
        return raw;
      }

      function safeZipEntryName(name) {
        const raw = String(name || 'arquivo').trim() || 'arquivo';
        const cleaned = raw
          .replace(/\s+/g, '_')
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .slice(0, 140);
        return cleaned || 'arquivo';
      }

      function downloadBlob(filename, blob) {
        try {
          const a = document.createElement('a');
          const url = URL.createObjectURL(blob);
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 2000);
        } catch {}
      }

      function renderAccessAvatars(acessos) {
        const list = Array.isArray(acessos) ? acessos : [];
        if (!list.length) return '<span class="text-muted small">Sem acessos</span>';

        const uniq = [];
        const seen = new Set();
        for (const a of list.slice().reverse()) {
          const owner = String(a?.owner || '').trim();
          const user = String(a?.user || '').trim();
          const key = (owner && owner.includes('@')) ? owner : (user && user.includes('@') ? user : (owner || user));
          if (!key) continue;
          const k = key.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          uniq.push(key);
          if (uniq.length >= 24) break;
        }

        const max = 18;
        const visible = uniq.slice(0, max);
        const extra = Math.max(0, uniq.length - visible.length);
        return [
          ...visible.map((key) => {
            const src = escapeHtml(resolveUserPhotoUrl(null, basePath, key));
            const title = escapeHtml(key);
            const fb = escapeHtml((String(basePath || '').trim() ? `${String(basePath || '').trim()}/images/usuario.png` : '/images/usuario.png'));
            return `<img src="${src}" alt="" title="${title}" onerror="this.onerror=null;this.src='${fb}'" style="width:22px; height:22px; border-radius:999px; object-fit:cover;" class="border me-1">`;
          }),
          (extra ? `<span class="badge text-bg-light border text-dark">+${extra}</span>` : '')
        ].join('');
      }

      async function downloadAllAttachmentsZip(msgId, btnEl) {
        const id = String(msgId || '').trim();
        if (!id) return;

        const arr = _attByMsgId.get(id) || [];
        if (!Array.isArray(arr) || arr.length < 2) return;

        const zipLib = window.JSZip;
        if (!zipLib) {
          showAlert('warning', 'Não foi possível carregar o ZIP (JSZip).');
          return;
        }

        const meta = _attMetaByMsgId.get(id) || {};
        const zipNameBase = safeZipEntryName(`anexos_${String(meta?.protocolo || id).trim() || id}`);
        const zipName = `${zipNameBase}.zip`;

        const btn = btnEl;
        const prevHtml = btn ? btn.innerHTML : '';
        try {
          if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>';
          }

          const zip = new zipLib();
          let added = 0;

          for (const a of arr) {
            const nome = safeZipEntryName(a?.nome || 'arquivo');
            const href = normalizeAttachmentUrl(a?.url || '');
            if (!href) continue;

            const urlObj = new URL(href, window.location.href);
            const sameOrigin = urlObj.origin === window.location.origin;
            const resp = await fetch(urlObj.href, { credentials: sameOrigin ? 'include' : 'omit' });
            if (!resp.ok) throw new Error(`Falha ao baixar anexo (${resp.status})`);
            const blob = await resp.blob();
            zip.file(nome, blob);
            added++;
          }

          if (!added) {
            showAlert('warning', 'Nenhum anexo disponível para baixar.');
            return;
          }

          const out = await zip.generateAsync({ type: 'blob' });
          downloadBlob(zipName, out);
        } catch (e) {
          showAlert('danger', String(e?.message || 'Falha ao gerar ZIP.'));
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevHtml;
          }
        }
      }

      function renderAttachmentsBlock(msg, anexos) {
        const arr = Array.isArray(anexos) ? anexos : [];
        if (!arr.length) return '';

        const msgId = String(msg?.id || msg?._id || '').trim();
        if (msgId) {
          _attByMsgId.set(msgId, arr);
          _attMetaByMsgId.set(msgId, { protocolo: String(msg?.protocolo || '').trim(), assunto: String(msg?.assunto || '').trim() });
        }

        const acessos = Array.isArray(msg?.acessos) ? msg.acessos : [];
        const showZip = arr.length > 1;
        const accessBtn = `<button type="button" class="btn btn-link p-0 text-secondary" title="Ver acessos aos anexos" data-att-action="toggle-access" aria-pressed="false"><i class="bi bi-eye" aria-hidden="true"></i></button>`;
        const zipBtn = showZip
          ? `<button type="button" class="btn btn-link p-0 text-secondary" title="Baixar tudo (ZIP)" data-att-action="download-all" data-att-msg-id="${escapeHtml(msgId)}"><i class="bi bi-download" aria-hidden="true"></i></button>`
          : '';

        return [
          `<div class="mt-3 border rounded" data-att-root="1" data-att-msg-id="${escapeHtml(msgId)}" style="display:inline-block; width:fit-content; max-width:100%; min-width:0;">`,
          '  <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">',
          '    <div class="text-muted small">Anexos</div>',
          `    <div class="d-flex align-items-center gap-3">${accessBtn}${zipBtn}</div>`,
          '  </div>',
          '  <div class="list-group list-group-flush">',
          ...arr.map((a) => {
            const rawNome = String(a?.nome || 'arquivo');
            const displayNome = rawNome.length > 150 ? (rawNome.slice(0, 147) + '...') : rawNome;
            const nome = escapeHtml(displayNome);
            const hrefRaw = normalizeAttachmentUrl(a?.url || '');
            const href = hrefRaw ? escapeHtml(hrefRaw) : '#';
            const disabled = hrefRaw ? '' : 'disabled';
            const mime = escapeHtml(String(a?.mime || '').trim());
            const size = escapeHtml(fmtBytes(a?.tamanho));
            const meta = [mime, size].filter(Boolean).join(' · ');
            const acessosHtml = renderAccessAvatars(acessos);
            return [
              `    <div class="list-group-item px-3 py-1 ${disabled}">`,
              '      <div class="d-flex align-items-start justify-content-between gap-3" style="min-width:0; max-width:100%;">',
              `        <a class="text-decoration-none text-body" title="${escapeHtml(rawNome)}" style="min-width:0; max-width:100%; flex:1 1 auto; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" href="${href}" ${hrefRaw ? 'target="_blank" rel="noopener"' : ''}>` +
              `          ${inlineImgIcon(basePath, 'anexo.png', 'Anexo', 'bi bi-paperclip', 16, 'me-2')}${nome}` +
              '        </a>',
              (meta ? `        <div class="text-muted small text-nowrap" style="flex:0 0 auto; text-align:right;">${meta}</div>` : ''),
              '      </div>',
              `      <div class="mt-1" data-att-access-row="1" style="display:none;">${acessosHtml}</div>`,
              '    </div>'
            ].join('\n');
          }),
          '  </div>',
          '</div>'
        ].join('\n');
      }

      function buildQuoteForMessage(msg) {
        const dt = String(msg?.createdAt ? fmtDateTime(msg.createdAt) : '').trim();
        const header = `Em ${dt}, ${msg?.from?.display || msg?.from?.mailboxName || 'Remetente'} escreveu:`;
        const original = String(msg?.bodyText || '').trim();
        const quoted = original
          ? original.split(/\r?\n/).map(l => `&gt; ${escapeHtml(l)}`).join('<br>')
          : '';
        return `${escapeHtml(header)}<br><br>${quoted}`;
      }

      function getThreadRootId() {
        const t = Array.isArray(detail?.thread) ? detail.thread : [];
        const root = t.length ? t[0] : item;
        return String(root?.id || root?._id || item?.id || item?._id || '').trim();
      }

      function buildPrefill(kind, baseMsg) {
        const base = baseMsg || item;
        const subj = String(base?.assunto || item?.assunto || '').trim();
        const prefix2 = kind === 'forward' ? 'ENC: ' : 'RE: ';
        const assunto2 = subj.startsWith(prefix2) ? subj : `${prefix2}${subj}`;

        const toRecipients = [];
        const ccRecipients = [];

        if (kind === 'reply' || kind === 'reply_all') {
          // reply para remetente
          if (String(base?.from?.mailboxId || '').trim() === 'pessoal') {
            const displayName = String(base?.from?.display || '').trim();
            const cands = [base?.from?.email, base?.from?.owner, base?.from?.createdBy]
              .map(v => String(v || '').trim())
              .filter(Boolean);
            const email = (cands.find(v => v.includes('@')) || '').trim();
            const ownerKey = String(base?.from?.owner || base?.from?.createdBy || email || '').trim();
            if (email || displayName || ownerKey) {
              toRecipients.push({
                type: 'user',
                email: email,
                nome: displayName,
                fotoUrl: '',
                ownerKey
              });
            }
          } else {
            const mbId = String(base?.from?.mailboxId || '').trim();
            const nm = String(base?.from?.mailboxName || base?.from?.display || '').trim();
            if (mbId) toRecipients.push({ type: 'mailbox', mailboxId: mbId, name: nm || mbId });
          }
        }

        if (kind === 'reply_all') {
          // adiciona Para/Cc originais (best-effort) como CC, sem deduplicação sofisticada
          const toArr = Array.isArray(base?.to) ? base.to : [];
          const ccArr = Array.isArray(base?.cc) ? base.cc : [];
          const add = (x) => {
            const disp = String(x?.display || x?.name || x?.nome || x?.email || '').trim();
            const email = String(x?.email || '').trim();
            if (email) return { type: 'user', email, nome: disp, fotoUrl: '' };
            return disp ? { type: 'user', email: '', nome: disp, fotoUrl: '' } : null;
          };
          for (const x of toArr) {
            const m = add(x);
            if (m) ccRecipients.push(m);
          }
          for (const x of ccArr) {
            const m = add(x);
            if (m) ccRecipients.push(m);
          }
        }

        const p = {
          kind,
          fromMailboxId: mailboxId,
          toRecipients,
          ccRecipients,
          assunto: assunto2,
          // Resposta deve iniciar em branco (sem citação automática)
          bodyHtml: (kind === 'forward') ? `<br><br>${buildQuoteForMessage(base)}` : '',
          threadRootId: getThreadRootId(),
          inReplyToId: (kind === 'forward') ? '' : String(base?.id || base?._id || '').trim(),
          forwardedFromId: (kind === 'forward') ? String(base?.id || base?._id || '').trim() : ''
        };
        return p;
      }

      async function ensureMarkers() {
        try {
          await loadMarkersIfNeeded();
          st.markerSelectionOverride = Array.isArray(item?.state?.marcadores) ? item.state.marcadores : [];
          renderMarkerDropdown();
        } catch (e) {
          try { console.warn('[msg][markers] falha ao carregar marcadores:', e); } catch {}
          try {
            if (!st.__markerLoadErrorShown) {
              st.__markerLoadErrorShown = true;
              const msg = String(e?.message || '').trim() || 'Falha ao carregar marcadores.';
              showAlert('warning', msg);
            }
          } catch {}
        }
      }

      let _usersByEmail = null;
      let _usersByEmailPromise = null;

      function normalizeEmailKey(email) {
        return String(email || '').trim().toLowerCase();
      }

      function openHistoryAccessPdf(baseMsg) {
        const m = baseMsg || item;
        const msgId = String(m?.id || m?._id || '').trim();
        if (!msgId) return;
        const mb = String(mailboxId || '').trim() || 'pessoal';
        const url = `/mensagens/api/msg/messages/${encodeURIComponent(msgId)}/historico-acessos.pdf?mailboxId=${encodeURIComponent(mb)}`;
        try {
          const w = window.open(url, '_blank');
          if (!w) window.location.assign(url);
        } catch {
          try { window.location.assign(url); } catch {}
        }
      }

      async function openMessagePrintPdf(baseMsg) {
        const m = baseMsg || item;
        const msgId = String(m?.id || m?._id || '').trim();
        if (!msgId) return;
        const mb = String(mailboxId || '').trim() || 'pessoal';
        const ord = String(st.readOrder || 'normal') === 'reverse' ? 'reverse' : 'normal';

        // Portal do Morador e Gestão: imprimir como a página (HTML), sem botões.
        // Isso garante que avatar/imagens saiam exatamente como na UI e padroniza o modo de impressão.
        try {
          const ctx = getCtx();
          const subject = String(m?.assunto || item?.assunto || '').trim();
          const contentHtml = buildPrintThreadBlocksHtml(detail, item, basePath, ord);
          const nowTxt = fmtPrintDateTime(new Date()) || '';

          // Dados da unidade (abaixo da logo)
          let unitName = String(ctx?.unitName || '').trim();
          let orgLines = [];
          try {
            const unitId = String(ctx?.unitId || '').trim();
            const unidades = await fetchUnidadesList(String(basePath || '').trim());
            const list = Array.isArray(unidades) ? unidades : [];
            const norm = (s) => String(s || '').trim().toLowerCase();
            const isPriv = isMasterOrAdmin(ctx?.role);
            const match = (
              // Master/Admin sempre usa a unidade do WD Gestor
              (isPriv ? list.find(u => norm(u?.codigo) === 'm0001') : null)
              || (unitId ? list.find(u => {
                const id = String(u?._id || u?.id || u?.unidade_id || u?.unidadeId || '').trim();
                return id && id === unitId;
              }) : null)
              || ((!unitId && unitName) ? list.find(u => norm(u?.nome || u?.name) && norm(u?.nome || u?.name) === norm(unitName)) : null)
              || ((!unitId && !unitName && list.length === 1) ? list[0] : null)
            ) || null;
            if (match) {
              const matchName = String(match?.nome || match?.name || '').trim();
              if (isPriv) {
                // Mesmo que o contexto tenha outra unidade (ex.: sessão/caixa), o cabeçalho deve ser M0001.
                unitName = matchName;
              } else if (!unitName) {
                unitName = matchName;
              }
              orgLines = buildUnitPrintLines(match);
            }
          } catch { /* noop */ }

          const footerHtml = [
            '<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;">',
            `  <div class="left">Gerado por ${escapeHtml(String(ctx?.userName || 'Usuário').trim())}${nowTxt ? ` em ${escapeHtml(nowTxt)}` : ''}</div>`,
            '  <div class="right">Página <span class="wdgPageNo"><span>1</span></span></div>',
            '</div>'
          ].join('\n');

          await openPrintDialog(basePath, {
            title: 'Imprimir - Caixa de Mensagens',
            // Sem topbar (modelo solicitado)
            headerLeft: '',
            headerCenter: '',
            headerRight: '',
            // Bloco abaixo da logo
            orgName: unitName,
            orgLines,
            headerKicker: 'CAIXA DE MENSAGENS',
            headerSubject: '',
            footerHtml,
            contentHtml
          });
          return;
        } catch {
          // Fallback: tenta PDF do backend (modo antigo)
          const url = `/mensagens/api/msg/messages/${encodeURIComponent(msgId)}/imprimir.pdf?mailboxId=${encodeURIComponent(mb)}&order=${encodeURIComponent(ord)}`;
          try {
            const w = window.open(url, '_blank');
            if (!w) window.location.assign(url);
          } catch {
            try { window.location.assign(url); } catch {}
          }
        }
      }

      async function ensureUsersByEmail() {
        if (_usersByEmail) return _usersByEmail;
        if (_usersByEmailPromise) return _usersByEmailPromise;
        _usersByEmailPromise = (async () => {
          try {
            const list = await fetchUsuariosList(basePath);
            const map = new Map();
            (Array.isArray(list) ? list : []).forEach(u => {
              const em = normalizeEmailKey(u?.email);
              if (!em) return;
              if (!map.has(em)) map.set(em, u);
            });
            _usersByEmail = map;
            return map;
          } catch {
            _usersByEmail = new Map();
            return _usersByEmail;
          } finally {
            _usersByEmailPromise = null;
          }
        })();
        return _usersByEmailPromise;
      }

      let __wdgHistoryOutsideClose = null;
      let __wdgHistoryAnchorEl = null;

      const HISTORY_MENU_SIZES = {
        headerIconButtonPx: 28,
        headerIconImgPx: 18,
        rowAvatarPx: 28
      };

      function ensureHistoryMenuEls() {
        let menu = qs('#msgHistoryMenu', bodyEl) || qs('#msgHistoryMenu', document.body);
        if (!menu) {
          const bp = String(basePath || '').trim();
          const printIcon = bp ? `${bp}/images/imprimir.png` : '/images/imprimir.png';
          const closeIcon = bp ? `${bp}/images/fechar.png` : '/images/fechar.png';
          const btnPx = HISTORY_MENU_SIZES.headerIconButtonPx;
          const imgPx = HISTORY_MENU_SIZES.headerIconImgPx;

          menu = document.createElement('div');
          menu.id = 'msgHistoryMenu';
          menu.className = 'dropdown-menu p-0';
          menu.style.display = 'none';
          menu.innerHTML = [
            '<div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">',
            '  <div class="fw-semibold small">Histórico de acessos</div>',
            '  <div class="d-flex gap-2">',
            `    <button type="button" data-hist-menu="print" title="Imprimir" aria-label="Imprimir" style="border:0; background:transparent; padding:0; line-height:1; width:${btnPx}px; height:${btnPx}px; display:flex; align-items:center; justify-content:center; cursor:pointer;">`
              + `      <img src="${escapeHtml(printIcon)}" alt="" style="width:${imgPx}px; height:${imgPx}px; object-fit:contain; display:block;" onerror="this.onerror=null;this.src='/images/imprimir.png'">`
              + '    </button>',
            `    <button type="button" data-hist-menu="close" title="Fechar" aria-label="Fechar" style="border:0; background:transparent; padding:0; line-height:1; width:${btnPx}px; height:${btnPx}px; display:flex; align-items:center; justify-content:center; cursor:pointer;">`
              + `      <img src="${escapeHtml(closeIcon)}" alt="" style="width:${imgPx}px; height:${imgPx}px; object-fit:contain; display:block;" onerror="this.onerror=null;this.src='/images/fechar.png'">`
              + '    </button>',
            '  </div>',
            '</div>',
            '<div id="msgHistoryMenuContent"></div>'
          ].join('\n');
          // Anexar no body pra flutuar por cima
          try { (document.body || bodyEl).appendChild(menu); } catch { bodyEl.appendChild(menu); }

          menu.addEventListener('click', (ev) => {
            const b = ev.target?.closest?.('[data-hist-menu]');
            if (!b) return;
            const a = String(b.getAttribute('data-hist-menu') || '').trim();
            if (a === 'close') {
              ev.preventDefault();
              closeHistoryPanel();
              return;
            }
            if (a === 'print') {
              ev.preventDefault();
              try {
                const baseMsg = menu.__wdgHistoryBaseMsg || item;
                openHistoryAccessPdf(baseMsg);
              } catch { /* noop */ }
              return;
            }
          });
        }
        const content = qs('#msgHistoryMenuContent', menu);
        return { menu, content };
      }

      function showHistoryMenuAsSubmenu(menuEl, anchorEl) {
        if (!menuEl || !anchorEl) return;
        __wdgHistoryAnchorEl = anchorEl;

        try { menuEl.classList.add('show'); } catch {}
        menuEl.style.display = 'block';
        menuEl.style.position = 'fixed';
        menuEl.style.zIndex = '2000';
        menuEl.style.width = '560px';
        menuEl.style.maxWidth = 'calc(100vw - 16px)';
        menuEl.style.margin = '0';

        const rect = anchorEl.getBoundingClientRect();
        const vpW = window.innerWidth || document.documentElement.clientWidth || 0;
        const vpH = window.innerHeight || document.documentElement.clientHeight || 0;

        // Abre como submenu: ao lado do item do dropdown
        const width = 560;
        let left = rect.right + 6;
        if (left + width > vpW - 8) left = rect.left - width - 6;
        if (left < 8) left = 8;

        let top = rect.top - 6;
        if (top < 8) top = 8;
        if (top > Math.max(8, vpH - 8)) top = Math.max(8, vpH - 8);

        menuEl.style.left = `${Math.round(left)}px`;
        menuEl.style.top = `${Math.round(top)}px`;

        // Fecha ao clicar fora (com atraso para não fechar no mesmo clique que abriu)
        try {
          if (__wdgHistoryOutsideClose) {
            document.removeEventListener('mousedown', __wdgHistoryOutsideClose, true);
            __wdgHistoryOutsideClose = null;
          }
        } catch {}

        __wdgHistoryOutsideClose = (ev) => {
          try {
            const t = ev?.target;
            if (!t) return;
            if (menuEl.contains(t)) return;
            if (__wdgHistoryAnchorEl && __wdgHistoryAnchorEl.contains && __wdgHistoryAnchorEl.contains(t)) return;
            closeHistoryPanel();
          } catch {}
        };
        setTimeout(() => {
          try { document.addEventListener('mousedown', __wdgHistoryOutsideClose, true); } catch {}
        }, 0);
      }

      async function openHistoryPanel(msg, anchorEl) {
        const { menu, content } = ensureHistoryMenuEls();
        if (!menu || !content) return;
        const base = msg || item;

        // Guard: evita que um histórico carregando atualize UI depois que o usuário
        // trocou de caixa/view ou abriu outro histórico.
        let reqId = 0;
        try {
          reqId = (Number(menu.__wdgHistoryReqId || 0) || 0) + 1;
          menu.__wdgHistoryReqId = reqId;
        } catch {
          reqId = 0;
        }
        try { menu.__wdgHistoryBaseMsg = base; } catch {}
        const acessos = Array.isArray(base?.acessos) ? base.acessos : [];

        // Mostra imediatamente como submenu (evita sensação de "inerte" enquanto carrega usuários)
        try {
          content.innerHTML = '<div class="px-3 py-3 text-muted">Carregando…</div>';
        } catch {}
        if (anchorEl) {
          try { showHistoryMenuAsSubmenu(menu, anchorEl); } catch {}
        } else {
          try { menu.classList.add('show'); } catch {}
          menu.style.display = 'block';
        }

        const usersByEmail = await ensureUsersByEmail().catch(() => new Map());

        // Se mudou a caixa/view (ou iniciou outra requisição de histórico), ignora.
        try { if (Number(menu.__wdgHistoryReqId || 0) !== Number(reqId || 0)) return; } catch {}
        if (String(_currentView || '').trim() !== expectedView) return;
        if (String(_currentMailboxId || 'pessoal').trim() !== expectedMailboxId) return;
        try { menu.__wdgHistoryUsersByEmail = usersByEmail; } catch {}

        const looksLikeEmail = (v) => {
          const s = String(v || '').trim();
          return !!(s && s.includes('@') && s.length >= 5);
        };

        const resolveActorDisplayNameNoEmail = (u, emailOrIdRaw) => {
          const nome = String(u?.nome || '').trim();
          if (nome) return nome;
          const raw = String(emailOrIdRaw || '').trim();
          // Regra do sistema: não exibir e-mails no histórico.
          // Quando não conseguimos resolver nome e veio um e-mail (ex.: Master User), usa rótulo genérico.
          if (looksLikeEmail(raw)) return 'Master User';
          return raw || 'Usuário';
        };

        function resolveMailboxNameForId(mbIdRaw) {
          const mbId = String(mbIdRaw || '').trim();
          if (!mbId || mbId === 'pessoal') return '';
          try {
            // 1) Global mailboxes carregadas (melhor fonte)
            const list = Array.isArray(allMailboxes) ? allMailboxes : [];
            const found = list.find(mb => String(mb?.id || '').trim() === mbId);
            const nm = String(found?.name || found?.nome || '').trim();
            if (nm) return nm;
          } catch {}

          try {
            // 2) Fallback: destinatários da própria mensagem
            const members = [...(Array.isArray(base?.to) ? base.to : []), ...(Array.isArray(base?.cc) ? base.cc : [])];
            const found = members.find(m => String(m?.mailboxId || '').trim() === mbId);
            const nm = String(found?.name || found?.nome || found?.display || '').trim();
            if (nm) return nm;
          } catch {}

          return mbId;
        }

        function accessEmail(a) {
          const owner = String(a?.owner || '').trim();
          const user = String(a?.user || '').trim();
          if (owner && owner.includes('@')) return owner;
          if (user && user.includes('@')) return user;
          return owner || user;
        }

        if (!acessos.length) {
          content.innerHTML = '<div class="text-muted">Sem histórico de acessos.</div>';
        } else {
          // Agrupa para não mostrar acesso por acesso.
          // Exibe: primeiro acesso + quantidade (ordena por último acesso desc).
          const agg = new Map();
          (Array.isArray(acessos) ? acessos : []).forEach(a => {
            const emailOrId = accessEmail(a);
            const emailKey = normalizeEmailKey(emailOrId);
            const mailboxId = String(a?.mailbox_id || a?.mailboxId || '').trim();
            const actorKey = (emailKey || String(emailOrId || '').trim()).toLowerCase();
            const key = (mailboxId && mailboxId !== 'pessoal')
              ? `mb:${mailboxId}::${actorKey}`
              : `u:${actorKey}`;
            if (!key) return;
            const at = new Date(a?.at || 0).getTime();
            if (!at) return;
            const cur = agg.get(key) || { key, mailboxId, emailOrId, emailKey, first: at, last: at, count: 0 };
            cur.first = Math.min(cur.first, at);
            cur.last = Math.max(cur.last, at);
            cur.count++;
            agg.set(key, cur);
          });

          const avatarPx = HISTORY_MENU_SIZES.rowAvatarPx;
          const rows = Array.from(agg.values())
            .sort((a, b) => (b.last - a.last) || (b.count - a.count))
            .map(r => {
              const u = r.emailKey ? usersByEmail.get(r.emailKey) : null;
              const displayName = resolveActorDisplayNameNoEmail(u, r.emailOrId);
              const mbId = String(r.mailboxId || '').trim();
              const mbName = mbId && mbId !== 'pessoal' ? resolveMailboxNameForId(mbId) : '';
              const leitorLabel = mbName ? `${mbName} (${displayName})` : displayName;
              const firstTxt = escapeHtml(fmtDateTime(new Date(r.first)));
              const countTxt = escapeHtml(String(r.count || 0));

              const isPublicMailboxAccess = !!(mbId && mbId !== 'pessoal');
              const fotoSrc = isPublicMailboxAccess
                ? escapeHtml(defaultMailboxAvatarUrl(basePath))
                : escapeHtml(resolveUserPhotoUrl(u, basePath, r.emailOrId));
              const avatarFallback = isPublicMailboxAccess
                ? escapeHtml(defaultMailboxAvatarUrl(basePath))
                : escapeHtml(defaultUserAvatarUrl(basePath));

              return [
                '<div class="list-group-item list-group-item-action">',
                '  <div class="d-flex align-items-center gap-2" style="min-width:0;">',
                `    <img src="${fotoSrc}" alt="" onerror="this.onerror=null;this.src='${avatarFallback}'" style="width:${avatarPx}px; height:${avatarPx}px; border-radius:999px; object-fit:cover;" class="border">`,
                `    <div class="text-truncate" style="min-width:0;">${escapeHtml(leitorLabel)}</div>`,
                '  </div>',
                `  <div class="text-muted small mt-1">Primeiro acesso: ${firstTxt}</div>`,
                `  <div class="text-muted small">Qtd. acessos: ${countTxt}</div>`,
                '</div>'
              ].join('');
            }).join('');

          const shouldScroll = agg.size > 3;
          const listStyle = shouldScroll
            ? 'max-height: 260px; overflow:auto;'
            : '';

          content.innerHTML = [
            `<div class="list-group list-group-flush" style="${listStyle}">`,
            rows,
            '</div>'
          ].join('');
        }

        // Submenu do dropdown (dos três pontos) - garante fechamento quando dropdown pai fechar
        if (anchorEl) {
          try {
            const dd = anchorEl.closest?.('.dropdown');
            const toggle = dd ? dd.querySelector?.('[data-bs-toggle="dropdown"]') : null;
            if (toggle && !toggle.__wdgHistBound) {
              toggle.__wdgHistBound = true;
              toggle.addEventListener('hidden.bs.dropdown', () => { try { closeHistoryPanel(); } catch {} });
            }
          } catch {}
        }
      }

      function closeHistoryPanel() {
        const panel = qs('#msgHistoryMenu', bodyEl) || qs('#msgHistoryMenu', document.body);
        if (panel) {
          try { panel.classList.remove('show'); } catch {}
          panel.style.display = 'none';
          panel.style.position = '';
          panel.style.left = '';
          panel.style.top = '';
          panel.style.zIndex = '';
          panel.style.width = '';
          panel.style.maxWidth = '';
          panel.style.margin = '';
        }
        try {
          if (__wdgHistoryOutsideClose) {
            document.removeEventListener('mousedown', __wdgHistoryOutsideClose, true);
            __wdgHistoryOutsideClose = null;
          }
        } catch {}
        __wdgHistoryAnchorEl = null;
      }

      function renderThread(order) {
        const root = qs('#msgThreadHost', bodyEl);
        if (!root) return;
        const listRaw = Array.isArray(detail?.thread) ? detail.thread : [];
        const thread = listRaw.length ? listRaw : [item];
        const list = (order === 'reverse') ? [...thread].reverse() : thread;
        root.innerHTML = list.map((m, idx) => {
          const who = escapeHtml(m?.from?.display || m?.from?.mailboxName || m?.from?.mailboxId || '');
          const when = fmtWhen(m?.createdAt);
          const proto = escapeHtml(m?.protocolo || '');
          const bodyHtmlRaw = String(m?.bodyHtml || '').trim();
          const bodyTxtRaw = String(m?.bodyText || '').trim();
          const html = bodyHtmlRaw
            ? sanitizeRichHtml(bodyHtmlRaw)
            : (bodyTxtRaw ? escapeHtml(bodyTxtRaw).replace(/\r?\n/g, '<br>') : '');
          const anexosHtml = renderAttachmentsBlock(m, m?.anexos);
          const paraBadges = renderToBadges(m?.to, m);
          const copyBadges = renderToBadges(m?.cc, m);

          const { src: avatarSrc, fallback: avatarFallback } = resolveSenderAvatarForMessage(m, basePath, ctx);
          return [
            `<div class="card mb-3" data-thread-msg="1" data-id="${escapeHtml(m?.id || '')}">`,
            '  <div class="card-body">',
            '    <div class="d-flex align-items-start justify-content-between gap-2">',
            '      <div class="d-flex align-items-center gap-2">',
            `        <img src="${escapeHtml(avatarSrc)}" alt="" onerror="this.onerror=null;this.src='${escapeHtml(avatarFallback)}'" style="width:36px; height:36px; border-radius:999px; object-fit:cover;">`,
            '        <div>',
            `          <div class="fw-semibold">${who}</div>`,
            '        </div>',
            '      </div>',
            '      <div class="d-flex align-items-start gap-2">',
            '        <div class="text-end">',
            '          <div class="d-flex align-items-start justify-content-end gap-2">',
            '            <div class="text-end">',
            `              ${proto ? `<div class=\"text-nowrap\">Protocolo: <span>${proto}</span></div>` : ''}`,
            '            </div>',
            '            <div class="dropdown">',
            `              <button type="button" class="btn msg-icon-btn btn-sm" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" title="Mais">${imgIcon(basePath, 'selecionarmenu.png', 'Mais', 'bi bi-three-dots-vertical', 30)}</button>`,
            '              <ul class="dropdown-menu dropdown-menu-end">',
            `                <li><button class="dropdown-item" type="button" data-msg-action="reply" data-msg-id="${escapeHtml(m?.id || '')}">Responder</button></li>`,
            `                <li><button class="dropdown-item" type="button" data-msg-action="reply_all" data-msg-id="${escapeHtml(m?.id || '')}">Responder a todos</button></li>`,
            `                <li><button class="dropdown-item" type="button" data-msg-action="forward" data-msg-id="${escapeHtml(m?.id || '')}">Encaminhar</button></li>`,
            '                <li><hr class="dropdown-divider"></li>',
            `                <li><button class="dropdown-item" type="button" data-msg-action="history" data-msg-id="${escapeHtml(m?.id || '')}">Histórico</button></li>`,
            '              </ul>',
            '            </div>',
            '          </div>',
            `          <div class="text-muted small text-nowrap">${escapeHtml(when.label)} · ${escapeHtml(when.time)} ${when.ago ? `(${escapeHtml(when.ago)})` : ''}</div>`,
            '        </div>',
            '      </div>',
            '    </div>',
            '    <div class="mt-2">',
            (paraBadges ? `<div class="small"><span class="text-muted">Para:</span> ${paraBadges}</div>` : ''),
            (copyBadges ? `<div class="small"><span class="text-muted">Cópia:</span> ${copyBadges}</div>` : ''),
            '    </div>',
            '    <hr>',
            `    <div class="msg-body" style="white-space:normal;">${html}</div>`,
            anexosHtml,
            '  </div>',
            '</div>'
          ].filter(Boolean).join('\n');
        }).join('\n');
      }

      function showInlineComposer(slotEl, kind, baseMsg) {
        const slot = slotEl;
        if (!slot) return;
        const mode = String(kind || '').trim();
        slot.innerHTML = [
          '<div class="card">',
          '  <div class="card-body">',
          '    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">',
          '      <div class="d-flex align-items-center gap-2" data-inline-top-left="1">',
          '        <div class="btn-group" role="group" aria-label="Ação">',
          `          <button type="button" class="btn btn-outline-secondary btn-sm" data-inline-mode-btn="reply" aria-pressed="${mode === 'reply' ? 'true' : 'false'}">Responder</button>`,
          `          <button type="button" class="btn btn-outline-secondary btn-sm" data-inline-mode-btn="reply_all" aria-pressed="${mode === 'reply_all' ? 'true' : 'false'}">Responder a todos</button>`,
          `          <button type="button" class="btn btn-outline-secondary btn-sm" data-inline-mode-btn="forward" aria-pressed="${mode === 'forward' ? 'true' : 'false'}">Encaminhar</button>`,
          '        </div>',
          '      </div>',
          '      <div class="d-flex align-items-center justify-content-end" data-inline-top-right="1"></div>',
          '    </div>',
          '    <div id="msgInlineComposerBody"></div>',
          '  </div>',
          '</div>'
        ].join('\n');
        const composerBody = qs('#msgInlineComposerBody', slot);
        if (!composerBody) return;
        const prefill = buildPrefill(kind, baseMsg);
        const order = String(st.readOrder || 'normal');

        renderComposeInto(composerBody, {
          basePath,
          ctx,
          mailboxes: allMailboxes,
          initialFromId: mailboxId,
          prefill,
          prefix: `inline_${Date.now()}_`,
          onSent: async () => {
            // Recarrega o detalhe para atualizar thread
            try {
              const signal = (() => {
                try { return bodyEl.__wdgMsgOpenAbort ? bodyEl.__wdgMsgOpenAbort.signal : undefined; } catch { return undefined; }
              })();
              const refreshed = await apiFetchMessageDetail(basePath, mailboxId, item.id, { signal });
              try { await apiMarkMessageRead(basePath, mailboxId, item.id, { signal }); } catch {}
              if (String(_currentView || '').trim() !== expectedView) return;
              if (String(_currentMailboxId || 'pessoal').trim() !== expectedMailboxId) return;
              renderMessageDetail(refreshed);
              st.readOrder = order;
            } catch {}
          }
        });

        // Move o botão “Anexar arquivo” para a primeira linha à direita
        try {
          const right = qs('[data-inline-top-right="1"]', slot);
          const attachHeader = qs('[data-compose-attach-header="1"]', slot);
          if (right && attachHeader) {
            attachHeader.classList.remove('mb-2');
            attachHeader.classList.add('mb-0');
            right.innerHTML = '';
            right.appendChild(attachHeader);
          }
        } catch {}
      }

      function renderReaderShell() {
        const order = String(st.readOrder || 'normal');

        const mb = getMailboxById(mailboxId);
        const canMarker = !mb || !mailboxPermsEnforced(mb) || mailboxCanAdmin(mb) || mailboxHasPerm(mb, PERMISSIONS.gerenciarMarcador);
        const markerDisabledAttr = canMarker ? '' : ' disabled aria-disabled="true"';

        const inlinePromptHtml = [
          '<div class="card" data-inline-prompt="1">',
          '  <div class="card-body">',
          '    <div class="text-muted">Clique aqui para responder</div>',
          '  </div>',
          '</div>'
        ].join('\n');

        const restoreBtn = (String(_currentView || '') === 'lixeira')
          ? '    <button type="button" class="btn btn-outline-secondary btn-sm" id="msgActRestore" title="Restaurar"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i></button>'
          : '';

        const archiveIsUnarchive = (String(_currentView || '') === 'arquivo');
        const archiveTitle = archiveIsUnarchive ? 'Desarquivar' : 'Arquivar';
        const archiveIcon = archiveIsUnarchive ? 'bi bi-box-arrow-up' : 'bi bi-archive';

        const pinned = !!(item?.state?.fixadaEm);
        const pinTitle = pinned ? 'Desafixar' : 'Fixar';
        const pinIcon = pinned ? 'bi bi-pin-angle-fill' : 'bi bi-pin-angle';

        bodyEl.innerHTML = [
          '<div class="d-flex align-items-center justify-content-between flex-wrap gap-2">',
          '  <div class="d-flex align-items-center gap-2">',
          `    <button type="button" class="btn msg-icon-btn btn-sm" id="msgDetailBack" aria-label="Voltar" title="Voltar">${imgIcon(basePath, 'anterior.png', 'Voltar', 'bi bi-arrow-left', 30)}</button>`,
          `    <div class="fw-bold" style="font-size:32px; line-height:1.1;">${assunto}${copiaBadge}</div>`,
          '  </div>',
          '  <div class="d-flex align-items-center gap-2">',
          `    <button type="button" class="btn msg-icon-btn btn-sm" id="msgActArchive" title="${archiveTitle}">${imgIcon(basePath, 'desarquivar.png', archiveTitle, archiveIcon, 30)}</button>`,
          '    <div class="dropdown">',
          `      <button type="button" class="btn msg-icon-btn btn-sm dropdown-toggle" id="msgActMarker" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" title="Marcador"${markerDisabledAttr}>${imgIcon(basePath, 'caixa_men_marcador.png', 'Marcador', 'bi bi-tag', 30)}</button>`,
          '      <div class="dropdown-menu p-2 dropdown-menu-end" style="min-width: 300px;">',
          '        <div class="d-flex align-items-center justify-content-between mb-2">',
          `          <button type="button" class="btn btn-sm btn-outline-secondary fw-normal" id="msgMarkerNewBtn"${markerDisabledAttr}>Novo</button>`,
          '        </div>',
          '        <div id="msgMarkerCreateBlock" style="display:none;">',
          '          <div class="input-group input-group-sm">',
          '            <input type="text" class="form-control" id="msgNewMarkerName" placeholder="Nome do marcador" aria-label="Nome do marcador">',
          '            <input type="hidden" id="msgNewMarkerColor" name="msgNewMarkerColor" value="">',
          `            <button class="btn btn-outline-secondary" type="button" id="msgMarkerColorBtn" title="Cor"${markerDisabledAttr}>`,
          '              <span class="d-inline-block border shadow-sm" data-marker-color-preview="1" style="width:18px;height:18px;border-radius:3px;"></span>',
          '            </button>',
          '          </div>',
          '          <div class="d-flex justify-content-end gap-2 mt-2">',
          '            <button type="button" class="btn btn-sm btn-outline-secondary" id="msgMarkerCancelBtn">Cancelar</button>',
          `            <button type="button" class="btn btn-sm btn-primary" id="msgMarkerOkBtn"${markerDisabledAttr}>OK</button>`,
          '          </div>',
          '          <div class="mt-2" id="msgMarkerPalette" style="display:none;">',
          '            <div class="d-flex flex-wrap gap-2" data-marker-color-palette="1">',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="blue" title="Azul" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-blue);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="indigo" title="Índigo" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-indigo);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="purple" title="Roxo" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-purple);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="pink" title="Rosa" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-pink);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="red" title="Vermelho" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-red);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="orange" title="Laranja" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-orange);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="yellow" title="Amarelo" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-yellow);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="green" title="Verde" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-green);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="teal" title="Verde-azulado" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-teal);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="cyan" title="Ciano" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-cyan);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="gray-700" title="Cinza" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-gray-700);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="dark" title="Preto" style="width:22px;height:22px;border-radius:3px;background-color:var(--bs-dark);"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c01" title="Cor 01" style="width:22px;height:22px;border-radius:3px;background-color:#1565C0;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c02" title="Cor 02" style="width:22px;height:22px;border-radius:3px;background-color:#1E88E5;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c03" title="Cor 03" style="width:22px;height:22px;border-radius:3px;background-color:#3949AB;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c04" title="Cor 04" style="width:22px;height:22px;border-radius:3px;background-color:#283593;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c05" title="Cor 05" style="width:22px;height:22px;border-radius:3px;background-color:#5E35B1;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c06" title="Cor 06" style="width:22px;height:22px;border-radius:3px;background-color:#6A1B9A;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c07" title="Cor 07" style="width:22px;height:22px;border-radius:3px;background-color:#8E24AA;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c08" title="Cor 08" style="width:22px;height:22px;border-radius:3px;background-color:#AD1457;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c09" title="Cor 09" style="width:22px;height:22px;border-radius:3px;background-color:#D81B60;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c10" title="Cor 10" style="width:22px;height:22px;border-radius:3px;background-color:#C62828;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c11" title="Cor 11" style="width:22px;height:22px;border-radius:3px;background-color:#E53935;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c12" title="Cor 12" style="width:22px;height:22px;border-radius:3px;background-color:#EF6C00;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c13" title="Cor 13" style="width:22px;height:22px;border-radius:3px;background-color:#FF8F00;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c14" title="Cor 14" style="width:22px;height:22px;border-radius:3px;background-color:#F9A825;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c15" title="Cor 15" style="width:22px;height:22px;border-radius:3px;background-color:#827717;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c16" title="Cor 16" style="width:22px;height:22px;border-radius:3px;background-color:#9E9D24;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c17" title="Cor 17" style="width:22px;height:22px;border-radius:3px;background-color:#2E7D32;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c18" title="Cor 18" style="width:22px;height:22px;border-radius:3px;background-color:#43A047;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c19" title="Cor 19" style="width:22px;height:22px;border-radius:3px;background-color:#00695C;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c20" title="Cor 20" style="width:22px;height:22px;border-radius:3px;background-color:#00897B;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c21" title="Cor 21" style="width:22px;height:22px;border-radius:3px;background-color:#00838F;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c22" title="Cor 22" style="width:22px;height:22px;border-radius:3px;background-color:#00ACC1;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c23" title="Cor 23" style="width:22px;height:22px;border-radius:3px;background-color:#5D4037;"></button>',
          '              <button type="button" class="btn btn-sm p-0 border shadow-sm" data-marker-color="c24" title="Cor 24" style="width:22px;height:22px;border-radius:3px;background-color:#546E7A;"></button>',
          '            </div>',
          '          </div>',
          '          <hr class="my-2">',
          '        </div>',
          '        <div id="msgMarkerList" class="py-1"></div>',
          '        <div class="mt-2 d-flex justify-content-end">',
          `          <button type="button" class="btn btn-sm btn-outline-secondary fw-normal" id="msgMarkerEditBtn"${markerDisabledAttr}>Editar</button>`,
          '        </div>',
          '      </div>',
          '    </div>',
          `    <button type="button" class="btn msg-icon-btn btn-sm" id="msgActPin" title="${pinTitle}" aria-label="${pinTitle}">${imgIcon(basePath, pinned ? 'caixa_men_desafixar.png' : 'caixa_men_fixar.png', pinTitle, pinIcon, 30)}</button>`,
          restoreBtn,
          `    <button type="button" class="btn msg-icon-btn btn-sm" id="msgActTrash" title="Excluir">${imgIcon(basePath, 'lixeira.png', 'Excluir', 'bi bi-trash', 30)}</button>`,
          '    <div class="dropdown">',
          `      <button type="button" class="btn msg-icon-btn btn-sm" id="msgMoreBtn" data-bs-toggle="dropdown" aria-expanded="false" title="Mais">${imgIcon(basePath, 'selecionarmenu.png', 'Mais', 'bi bi-three-dots-vertical', 30)}</button>`,
          '      <ul class="dropdown-menu dropdown-menu-end">',
          '        <li><button class="dropdown-item" type="button" id="msgMoreReply">Responder</button></li>',
          '        <li><button class="dropdown-item" type="button" id="msgMoreReplyAll">Responder a todos</button></li>',
          '        <li><button class="dropdown-item" type="button" id="msgMoreForward">Encaminhar</button></li>',
          '        <li><hr class="dropdown-divider"></li>',
          `        <li><button class="dropdown-item" type="button" id="msgMoreOrder">Ordenar ${order === 'reverse' ? '↑' : '↓'}</button></li>`,
          '        <li><button class="dropdown-item" type="button" id="msgMorePrev">Anterior (Ctrl+↑)</button></li>',
          '        <li><button class="dropdown-item" type="button" id="msgMoreNext">Posterior (Ctrl+↓)</button></li>',
          '        <li><button class="dropdown-item" type="button" id="msgMorePrint">Imprimir (Ctrl+P)</button></li>',
          '      </ul>',
          '    </div>',
          '  </div>',
          '</div>',
          `<div class="mt-2" id="msgInlineComposerSlot" style="${order === 'reverse' ? '' : 'display:none;'}">${inlinePromptHtml}</div>`,
          '<div class="mt-3" id="msgThreadHost"></div>',
          `<div class="mt-2" id="msgInlineComposerSlotBottom" style="${order === 'reverse' ? 'display:none;' : ''}">${inlinePromptHtml}</div>`,

          '<div class="card mt-3" id="msgHistoryPanel" style="display:none;">',
          '  <div class="card-header d-flex align-items-center justify-content-between">',
          '    <div class="fw-semibold">Histórico de acessos</div>',
          '    <div class="d-flex gap-2">',
          '      <button type="button" class="btn btn-outline-secondary btn-sm" id="msgHistoryPrint">Imprimir</button>',
          '      <button type="button" class="btn btn-outline-secondary btn-sm" id="msgHistoryClose">Fechar</button>',
          '    </div>',
          '  </div>',
          '  <div class="card-body" id="msgHistoryContent"></div>',
          '</div>'
        ].join('\n');

        const slotTop = qs('#msgInlineComposerSlot', bodyEl);
        const slotBottom = qs('#msgInlineComposerSlotBottom', bodyEl);
        if (order === 'reverse') {
          if (slotTop) slotTop.style.display = '';
          if (slotBottom) slotBottom.style.display = 'none';
        } else {
          if (slotTop) slotTop.style.display = 'none';
          if (slotBottom) slotBottom.style.display = '';
        }

        renderThread(order);
        void ensureMarkers();
      }

      function attachReaderHandlers() {
        function hideInlineComposer() {
          const top = qs('#msgInlineComposerSlot', bodyEl);
          const bottom = qs('#msgInlineComposerSlotBottom', bodyEl);
          const promptHtml = [
            '<div class="card" data-inline-prompt="1">',
            '  <div class="card-body">',
            '    <div class="text-muted">Clique aqui para responder</div>',
            '  </div>',
            '</div>'
          ].join('\n');

          if (top) top.innerHTML = promptHtml;
          if (bottom) bottom.innerHTML = promptHtml;
          st.inlineMode = '';
          st.inlineBaseMsgId = '';
        }

        const backBtn = qs('#msgDetailBack', bodyEl);
        if (backBtn && !backBtn.__wdgBound) {
          backBtn.__wdgBound = true;
          backBtn.addEventListener('click', () => {
            try { hideInlineComposer(); } catch {}
            try { st.openMessageId = ''; } catch {}
            try { __wdgMsgResumeAutoRefresh('detail'); } catch {}
            renderListShell();
            bindHandlers();

            // Se algo chegou durante a leitura, atualiza a lista ao voltar.
            try { __wdgMsgFlushDeferredRefresh('back'); } catch {}

            // Voltar para lista deve reativar o polling (ele é pausado no detalhe).
            try {
              if (bodyEl.__wdgMsgListPollTimer) {
                clearTimeout(bodyEl.__wdgMsgListPollTimer);
                bodyEl.__wdgMsgListPollTimer = null;
              }
            } catch {}
            try { __wdgMsgScheduleListPoll(); } catch {}
          });
        }

        const doAction = async (action, extra) => {
          try {
            const wasReadBefore = (() => {
              try {
                if (action !== 'marker') return false;
                const src = (item && typeof item === 'object') ? (item.state && typeof item.state === 'object' ? item.state : item) : null;
                if (!src) return false;

                const statusRaw = src.status ?? src.situacao ?? src.estado;
                if (typeof statusRaw === 'string') {
                  const stx = statusRaw.trim().toLowerCase();
                  if (stx) {
                    if (stx.includes('nao_lida') || stx.includes('não_lida') || stx.includes('nao lida') || stx.includes('não lida') || stx === 'unread' || stx === 'nao_lidas' || stx === 'não_lidas') return false;
                    if (stx === 'lida' || stx === 'lidas' || stx === 'read') return true;
                  }
                }

                const flag = src.lida ?? src.read ?? src.isRead ?? src.is_read ?? src.lido ?? src.visualizada ?? src.visualizado ?? src.visto ?? src.viewed;
                if (flag === true || flag === 1) return true;
                if (flag === false || flag === 0) return false;
                if (typeof flag === 'string') {
                  const s = flag.trim().toLowerCase();
                  if (!s) return false;
                  if (s === '0' || s === 'false' || s === 'nao' || s === 'não' || s === 'n' || s === 'no') return false;
                  if (s === '1' || s === 'true' || s === 'sim' || s === 's' || s === 'yes' || s === 'y') return true;
                }

                const readAt = src.lidaEm ?? src.lida_em ?? src.readAt ?? src.read_at ?? src.lidoEm ?? src.lido_em ?? src.visualizadoEm ?? src.visualizado_em ?? src.visualizadaEm ?? src.visualizada_em ?? src.vistoEm ?? src.visto_em ?? src.openedAt ?? src.opened_at;
                if (readAt === true) return true;
                if (typeof readAt === 'number') return readAt > 0;
                if (typeof readAt === 'string') {
                  const v = readAt.trim();
                  if (!v) return false;
                  const low = v.toLowerCase();
                  if (low === '0' || low === 'false' || low === 'null' || low === 'undefined') return false;
                  if (/^\d{10,}$/.test(v)) return true;
                  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return true;
                  const t = Date.parse(v);
                  return Number.isFinite(t);
                }
                return false;
              } catch {
                return false;
              }
            })();

            if (action === 'marker') {
              if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarMarcador, 'Sem permissão para gerenciar marcadores nesta caixa.')) return;
            }
            if (action === 'trash' || action === 'delete') {
              if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.excluirMensagem, 'Sem permissão para excluir mensagens nesta caixa.')) return;
            }
            await apiMessagesAction(basePath, mailboxId, [item.id], action, extra);

            // UI imediata: atualiza marcador localmente para não depender do auto-refresh.
            if (action === 'marker') {
              try {
                const rawMarker = String(extra?.marker || '').trim();
                const markerName = rawMarker.replace(/\s+/g, ' ').slice(0, 60);
                const keyLower = markerName.toLowerCase();

                const toggleMarkers = (arr) => {
                  const tags = (Array.isArray(arr) ? arr : []).map(x => String(x || '').trim()).filter(Boolean);
                  const has = tags.some(t => t.toLowerCase() === keyLower);
                  if (has) return tags.filter(t => t.toLowerCase() !== keyLower).slice(0, 3);
                  return [...tags, markerName].slice(0, 3);
                };

                // Atualiza o item aberto (pode estar em item.state)
                try {
                  const curArr = Array.isArray(item?.state?.marcadores) ? item.state.marcadores : (Array.isArray(item?.marcadores) ? item.marcadores : []);
                  const nextArr = toggleMarkers(curArr);
                  if (item && typeof item === 'object') {
                    if (!item.state || typeof item.state !== 'object') item.state = {};
                    item.state.marcadores = nextArr;
                    item.marcadores = nextArr;
                  }
                } catch { /* noop */ }

                // Atualiza o cache da lista para refletir imediatamente ao voltar
                try {
                  const items = Array.isArray(st.items) ? st.items : [];
                  const nextItems = items.map((it) => {
                    if (!it || typeof it !== 'object') return it;
                    if (String(it.id || '') !== String(item.id || '')) return it;
                    const curArr = Array.isArray(it.marcadores) ? it.marcadores : [];
                    const nextArr = toggleMarkers(curArr);
                    const next = { ...it, marcadores: nextArr };
                    try {
                      if (next.state && typeof next.state === 'object') next.state = { ...next.state, marcadores: nextArr };
                    } catch { /* noop */ }
                    return next;
                  });

                  // Se estiver filtrando "Sem marcador", ao adicionar marcador o item deixa de ser elegível.
                  st.items = st.semMarcador
                    ? nextItems.filter((it) => {
                      if (!it || typeof it !== 'object') return true;
                      if (String(it.id || '') !== String(item.id || '')) return true;
                      const arr = Array.isArray(it.marcadores) ? it.marcadores : [];
                      return arr.length === 0;
                    })
                    : nextItems;
                } catch { /* noop */ }
              } catch { /* noop */ }
            }

            // Alguns backends acabam “tocando” o status de leitura ao atualizar marcadores.
            // Se a mensagem já estava lida, reafirma a leitura para evitar beep/contador de novas mensagens.
            if (action === 'marker' && wasReadBefore) {
              try { await apiMarkMessageRead(basePath, mailboxId, item.id); } catch {}
            }

            if (action === 'trash' || action === 'archive' || action === 'unarchive' || action === 'delete' || action === 'restore') {
              try { st.openMessageId = ''; } catch {}
              await fetchAndRender();
              renderListShell();
              bindHandlers();

              // Ao retornar para lista após mover/excluir/restaurar, reativa polling.
              try {
                if (bodyEl.__wdgMsgListPollTimer) {
                  clearTimeout(bodyEl.__wdgMsgListPollTimer);
                  bodyEl.__wdgMsgListPollTimer = null;
                }
              } catch {}
              try { __wdgMsgScheduleListPoll(); } catch {}
              return;
            }
            const refreshed = await apiFetchMessageDetail(basePath, mailboxId, item.id);
            if (String(_currentView || '').trim() !== expectedView) return;
            if (String(_currentMailboxId || 'pessoal').trim() !== expectedMailboxId) return;
            renderMessageDetail(refreshed);
          } catch (e) {
            bodyEl.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger" role="alert">${escapeHtml(e?.message || 'Falha ao aplicar ação.')}</div>`);
          }
        };

        qs('#msgActArchive', bodyEl)?.addEventListener('click', () => {
          void (async () => {
            const cur = String(_currentView || '') || 'entrada';
            if (cur === 'arquivo') {
              await doAction('unarchive');
              return;
            }
            await doAction('archive', { fromFolder: cur });
          })();
        });
        qs('#msgActPin', bodyEl)?.addEventListener('click', () => void doAction('pin'));
        qs('#msgActRestore', bodyEl)?.addEventListener('click', () => void doAction('restore'));
        qs('#msgActTrash', bodyEl)?.addEventListener('click', () => {
          void (async () => {
            if (String(_currentView || '') === 'lixeira') {
              const ok = await confirmPermanentDelete();
              if (!ok) return;
              await doAction('delete');
              return;
            }
            await doAction('trash', { fromFolder: String(_currentView || '') || 'entrada' });
          })();
        });

        const markerHost = qsMarker('#msgMarkerList', bodyEl);
        if (markerHost && !markerHost.__wdgBound) {
          markerHost.__wdgBound = true;
          markerHost.addEventListener('click', (ev) => {
            const t = ev.target;
            const removeBtn = t && t.closest ? t.closest('[data-marker-remove-id]') : null;
            if (removeBtn) {
              const id = String(removeBtn.getAttribute('data-marker-remove-id') || '').trim();
              if (!id) return;
              if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarMarcador, 'Sem permissão para gerenciar marcadores nesta caixa.')) return;
              void (async () => {
                try {
                  await apiDeleteMarker(basePath, mailboxId, id);
                  st.markers = (Array.isArray(st.markers) ? st.markers : []).filter(m => String(m?.id || '') !== id);
                  renderMarkerDropdown();
                } catch (e) {
                  showAlert('danger', e?.message || 'Falha ao remover marcador.');
                }
              })();
              return;
            }

            const row = t && t.closest ? t.closest('[data-marker-row="1"]') : null;
            const name = String(row?.getAttribute('data-marker-name') || '').trim();
            if (!name) return;

            // Em modo edição, o clique no item não deve aplicar marcador na mensagem.
            if (st.markerEditMode) return;

            void doAction('marker', { marker: name });
          });
        }

        // Controles de criação/edição de marcadores (mesma UX da lista)
        const markerToggle = qsMarker('#msgActMarker', bodyEl) || qs('#msgActMarker', bodyEl);
        const actMarkerNew = qsMarker('#msgMarkerNewBtn', bodyEl);
        const actMarkerEdit = qsMarker('#msgMarkerEditBtn', bodyEl);
        const createBlock = qsMarker('#msgMarkerCreateBlock', bodyEl);
        const createNameInput = qsMarker('#msgNewMarkerName', bodyEl);
        const colorBtn = qsMarker('#msgMarkerColorBtn', bodyEl);
        const paletteWrap = qsMarker('#msgMarkerPalette', bodyEl);
        const palette = qsMarker('[data-marker-color-palette="1"]', bodyEl);
        const colorHidden = qsMarker('#msgNewMarkerColor', bodyEl);
        const colorPreview = qsMarker('[data-marker-color-preview="1"]', bodyEl);
        const okBtn = qsMarker('#msgMarkerOkBtn', bodyEl);
        const cancelBtn = qsMarker('#msgMarkerCancelBtn', bodyEl);

        function normalizeMarkerNameClient(name) {
          const n = String(name || '').trim();
          if (!n) return '';
          return n.replace(/\s+/g, ' ').slice(0, 60);
        }

        function setCreateColor(key) {
          const { k, bgCss } = markerColorStyle(key);
          if (colorHidden) colorHidden.value = k;
          if (colorPreview) colorPreview.style.backgroundColor = bgCss;
        }

        function showCreateBlock(show) {
          if (!createBlock) return;
          createBlock.style.display = show ? '' : 'none';
          if (!show && paletteWrap) paletteWrap.style.display = 'none';
          if (show) {
            if (colorHidden) colorHidden.value = '';
            if (colorPreview) colorPreview.style.backgroundColor = '';
            try { createNameInput?.focus(); } catch {}
          }
        }

        async function createMarkerFromForm() {
          if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarMarcador, 'Sem permissão para gerenciar marcadores nesta caixa.')) return;
          const nome = normalizeMarkerNameClient(createNameInput?.value || '');
          if (!nome) {
            showAlert('warning', 'Digite o nome do marcador.');
            return;
          }
          const corRaw = String(colorHidden?.value || '').trim();
          if (!corRaw) {
            showAlert('warning', 'Selecione uma cor para o marcador.');
            return;
          }
          const cor = normalizeMarkerColorKey(corRaw);
          try {
            const created = await apiCreateMarker(basePath, mailboxId, nome, cor);
            st.markers = Array.isArray(st.markers) ? st.markers : [];
            const id = String(created?.id || '').trim();
            const exists = st.markers.some(x => String(x?.id || '') === id || String(x?.nome || '').trim().toLowerCase() === nome.toLowerCase());
            if (!exists) st.markers = [{ id: id || `local_${Date.now()}`, nome, cor }, ...st.markers];
            renderMarkerDropdown();
            if (createNameInput) createNameInput.value = '';
            showCreateBlock(false);
          } catch (e) {
            showAlert('danger', e?.message || 'Falha ao criar marcador.');
          }
        }

        if (markerToggle && !markerToggle.__wdgBound) {
          markerToggle.__wdgBound = true;
          markerToggle.addEventListener('click', () => {
            void (async () => {
              try {
                await loadMarkersIfNeeded();
                // default: modo visual (e respeita seleção da mensagem aberta)
                st.markerEditMode = false;
                st.markerSelectionOverride = Array.isArray(item?.state?.marcadores) ? item.state.marcadores : [];
                showCreateBlock(false);
                renderMarkerDropdown();
              } catch (e) {
                showAlert('danger', e?.message || 'Falha ao carregar marcadores.');
              }
            })();
          });
        }

        if (actMarkerNew && !actMarkerNew.__wdgBound) {
          actMarkerNew.__wdgBound = true;
          actMarkerNew.addEventListener('click', () => {
            const isOpen = !!(createBlock && createBlock.style.display !== 'none');
            showCreateBlock(!isOpen);
          });
        }

        if (colorBtn && !colorBtn.__wdgBound) {
          colorBtn.__wdgBound = true;
          colorBtn.addEventListener('click', () => {
            if (!createBlock || createBlock.style.display === 'none') return;
            if (!paletteWrap) return;
            paletteWrap.style.display = (paletteWrap.style.display === 'none') ? '' : 'none';
          });
        }

        if (palette && !palette.__wdgBound) {
          palette.__wdgBound = true;
          palette.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-marker-color]');
            if (!btn) return;
            const key = normalizeMarkerColorKey(btn.getAttribute('data-marker-color') || 'primary');
            setCreateColor(key);
          });
        }

        if (okBtn && !okBtn.__wdgBound) {
          okBtn.__wdgBound = true;
          okBtn.addEventListener('click', () => void createMarkerFromForm());
        }

        if (cancelBtn && !cancelBtn.__wdgBound) {
          cancelBtn.__wdgBound = true;
          cancelBtn.addEventListener('click', () => {
            if (createNameInput) createNameInput.value = '';
            showCreateBlock(false);
          });
        }

        if (actMarkerEdit && !actMarkerEdit.__wdgBound) {
          actMarkerEdit.__wdgBound = true;
          actMarkerEdit.addEventListener('click', () => {
            if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarMarcador, 'Sem permissão para gerenciar marcadores nesta caixa.')) return;
            st.markerEditMode = !st.markerEditMode;
            if (st.markerEditMode) st.markerSelectionOverride = null;
            renderMarkerDropdown();
          });
        }

        const ensureComposerSlot = () => {
          const order = String(st.readOrder || 'normal');
          const top = qs('#msgInlineComposerSlot', bodyEl);
          const bottom = qs('#msgInlineComposerSlotBottom', bodyEl);
          const slot = (order === 'reverse') ? top : bottom;
          if (!slot) return null;
          slot.style.display = '';
          return slot;
        };

        const openInline = (kind, baseMsg) => {
          if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.criarMensagem, 'Sem permissão para criar mensagem nesta caixa.')) return;
          const slot = ensureComposerSlot();
          if (!slot) return;
          const mode = String(kind || '').trim();
          const base = baseMsg || item;
          const baseId = String(base?.id || '').trim();

          const scrollAndFocusInline = () => {
            try { slot.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch {}

            const focusEditorInSlot = () => {
              try {
                const editor = slot.querySelector?.('[contenteditable="true"][role="textbox"]');
                if (editor) {
                  try { editor.focus({ preventScroll: true }); } catch { try { editor.focus(); } catch {} }
                  return;
                }
                const fallback = slot.querySelector?.('textarea, input[type="text"], input:not([type])');
                if (fallback) {
                  try { fallback.focus({ preventScroll: true }); } catch { try { fallback.focus(); } catch {} }
                }
              } catch {}
            };

            try { requestAnimationFrame(() => focusEditorInSlot()); } catch { /* noop */ }
            try { setTimeout(() => focusEditorInSlot(), 0); } catch { /* noop */ }
            try { setTimeout(() => focusEditorInSlot(), 120); } catch { /* noop */ }
          };

          // Toggle: se clicar no mesmo modo novamente, cancela
          const curMode = String(st.inlineMode || '').trim();
          const curBaseId = String(st.inlineBaseMsgId || '').trim();
          if (curMode && curMode === mode && (!baseId || curBaseId === baseId)) {
            hideInlineComposer();
            return;
          }

          st.inlineMode = mode;
          st.inlineBaseMsgId = baseId;
          showInlineComposer(slot, mode, base);
          scrollAndFocusInline();
        };

        // Clique no campo (sem botões) abre o composer (Responder)
        if (!bodyEl.__wdgInlinePromptDelegated) {
          bodyEl.__wdgInlinePromptDelegated = true;
          bodyEl.addEventListener('click', (ev) => {
            const prompt = ev.target?.closest?.('[data-inline-prompt="1"]');
            if (!prompt) return;
            openInline('reply', item);
          });
        }

        // Botões ficam dentro do composer (estrutura nova)
        if (!bodyEl.__wdgInlineModeBtnDelegated) {
          bodyEl.__wdgInlineModeBtnDelegated = true;
          bodyEl.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-inline-mode-btn]');
            if (!btn) return;
            const mode = String(btn.getAttribute('data-inline-mode-btn') || '').trim();
            if (!mode) return;
            openInline(mode, item);
          });
        }

        qs('#msgMoreReply', bodyEl)?.addEventListener('click', () => openInline('reply', item));
        qs('#msgMoreReplyAll', bodyEl)?.addEventListener('click', () => openInline('reply_all', item));
        qs('#msgMoreForward', bodyEl)?.addEventListener('click', () => openInline('forward', item));

        qs('#msgMoreOrder', bodyEl)?.addEventListener('click', () => {
          st.readOrder = (String(st.readOrder || 'normal') === 'reverse') ? 'normal' : 'reverse';
          renderReaderShell();
          attachReaderHandlers();
        });

        function navOpen(delta) {
          const ids = (Array.isArray(st.items) ? st.items : []).map(x => String(x?.id || '')).filter(Boolean);
          const cur = String(item.id || '');
          const idx = ids.indexOf(cur);
          if (idx < 0) return;
          const next = ids[idx + delta];
          if (!next) return;
          void openMessageById(next);
        }

        qs('#msgMorePrev', bodyEl)?.addEventListener('click', () => navOpen(-1));
        qs('#msgMoreNext', bodyEl)?.addEventListener('click', () => navOpen(1));
        qs('#msgMorePrint', bodyEl)?.addEventListener('click', () => {
          try { openMessagePrintPdf(item); } catch { /* noop */ }
        });

        // Painel histórico
        qs('#msgHistoryClose', bodyEl)?.addEventListener('click', () => closeHistoryPanel());
        qs('#msgHistoryPrint', bodyEl)?.addEventListener('click', () => {
          try { openHistoryAccessPdf(item); } catch { /* noop */ }
        });

        // Atalhos (garante 1 handler ativo por vez)
        try {
          if (window.__wdgMsgDetailKeyHandler) {
            window.removeEventListener('keydown', window.__wdgMsgDetailKeyHandler);
          }
        } catch {}

        const keyHandler = (ev) => {
          if (!ev) return;
          const isCtrl = !!(ev.ctrlKey || ev.metaKey);
          if (!isCtrl) return;
          if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            navOpen(-1);
          }
          if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            navOpen(1);
          }
          if (String(ev.key || '').toLowerCase() === 'p') {
            ev.preventDefault();
            try {
              const hist = qs('#msgHistoryPanel', bodyEl);
              const histOpen = hist && String(hist.style.display || '') !== 'none';
              if (histOpen) {
                try { openHistoryAccessPdf(item); } catch { /* noop */ }
                return;
              }
              try { openMessagePrintPdf(item); } catch { /* noop */ }
            } catch {
              try { window.print(); } catch {}
            }
          }
        };

        window.__wdgMsgDetailKeyHandler = keyHandler;
        window.addEventListener('keydown', keyHandler);
        // remove handler quando voltar para lista
        const back = qs('#msgDetailBack', bodyEl);
        if (back && !back.__wdgKeyUnbind) {
          back.__wdgKeyUnbind = true;
          back.addEventListener('click', () => {
            try {
              if (window.__wdgMsgDetailKeyHandler) {
                window.removeEventListener('keydown', window.__wdgMsgDetailKeyHandler);
                window.__wdgMsgDetailKeyHandler = null;
              }
            } catch {}
          });
        }

        // Ações por mensagem (menu de 3 pontos dentro do thread)
        try {
          if (bodyEl.__wdgThreadActionsHandler) {
            bodyEl.removeEventListener('click', bodyEl.__wdgThreadActionsHandler);
            bodyEl.removeEventListener('click', bodyEl.__wdgThreadActionsHandler, true);
          }
        } catch {}
        const threadActionsHandler = async (ev) => {
          const btn = ev.target?.closest?.('[data-msg-action]');
          if (!btn) return;
          const action = String(btn.getAttribute('data-msg-action') || '').trim();
          const msgId = String(btn.getAttribute('data-msg-id') || '').trim();
          const thread = Array.isArray(detail?.thread) ? detail.thread : [];
          const baseMsg = thread.find(x => String(x?.id || '') === msgId) || item;
          if (action === 'history') {
            try { ev.preventDefault(); } catch {}
            try { ev.stopPropagation(); } catch {}
            await openHistoryPanel(baseMsg, btn);
            return;
          }
          if (action === 'reply' || action === 'reply_all' || action === 'forward') {
            openInline(action, baseMsg);
            try {
              const dd = btn.closest?.('.dropdown');
              const toggle = dd ? dd.querySelector?.('[data-bs-toggle="dropdown"]') : null;
              if (toggle && window.bootstrap && window.bootstrap.Dropdown) {
                const inst = window.bootstrap.Dropdown.getInstance(toggle) || new window.bootstrap.Dropdown(toggle);
                inst.hide();
              }
            } catch {}
          }
        };
        bodyEl.__wdgThreadActionsHandler = threadActionsHandler;
        bodyEl.addEventListener('click', threadActionsHandler, true);

        // Ações do bloco de anexos (ver acessos / baixar tudo)
        try {
          if (bodyEl.__wdgAttachmentsActionsHandler) {
            bodyEl.removeEventListener('click', bodyEl.__wdgAttachmentsActionsHandler);
          }
        } catch {}
        const attachmentsActionsHandler = (ev) => {
          const btn = ev.target?.closest?.('[data-att-action]');
          if (!btn) return;
          const action = String(btn.getAttribute('data-att-action') || '').trim();
          const root = btn.closest?.('[data-att-root="1"]');
          if (action === 'toggle-access') {
            const pressed = String(btn.getAttribute('aria-pressed') || 'false') === 'true';
            btn.setAttribute('aria-pressed', pressed ? 'false' : 'true');
            const rows = root ? qsa('[data-att-access-row="1"]', root) : [];
            rows.forEach((el) => { el.style.display = pressed ? 'none' : ''; });
            return;
          }
          if (action === 'download-all') {
            const msgId = String(btn.getAttribute('data-att-msg-id') || root?.getAttribute('data-att-msg-id') || '').trim();
            void downloadAllAttachmentsZip(msgId, btn);
          }
        };
        bodyEl.__wdgAttachmentsActionsHandler = attachmentsActionsHandler;
        bodyEl.addEventListener('click', attachmentsActionsHandler);

        // Restaura visual dos botões conforme estado atual
        try { setInlineButtonsActive(String(st.inlineMode || '').trim()); } catch {}
      }

      renderReaderShell();
      attachReaderHandlers();
    }

    async function openMessageById(id) {
      if (!id) return;
      const OVERLAY_ID = 'wdgMsgOpenOverlay';

      const expectedView = String(view || '').trim();
      const expectedMailboxId = String(mailboxId || 'pessoal').trim() || 'pessoal';

      // Cada abertura deve cancelar a anterior para evitar race.
      let ac = null;
      let openReqId = 0;
      try {
        if (bodyEl.__wdgMsgOpenAbort) {
          try { bodyEl.__wdgMsgOpenAbort.abort(); } catch {}
        }
        ac = new AbortController();
        bodyEl.__wdgMsgOpenAbort = ac;
        openReqId = (Number(bodyEl.__wdgMsgOpenReqId || 0) || 0) + 1;
        bodyEl.__wdgMsgOpenReqId = openReqId;
      } catch {
        ac = null;
      }

      if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.lerMensagem, 'Sem permissão para ler mensagens desta caixa.')) {
        return;
      }

      // Ao abrir o detalhe, pausa qualquer auto-refresh/poll da lista
      // para não "fechar" a leitura por re-render.
      try { st.openMessageId = String(id || '').trim(); } catch {}

      // Se um fetch de LISTA já estiver em voo, ele pode terminar depois e
      // re-renderizar a lista (limpando openMessageId) e "voltar para a caixa".
      // Ao abrir o detalhe, aborte/invalide o fetch da lista.
      try {
        if (bodyEl.__wdgMsgListAbort) {
          try { bodyEl.__wdgMsgListAbort.abort(); } catch {}
        }
      } catch {}
      try {
        bodyEl.__wdgMsgListReqId = (Number(bodyEl.__wdgMsgListReqId || 0) || 0) + 1;
      } catch {}

      // Hold explícito de "detalhe": bloqueia refresh/poll por segurança.
      try { __wdgMsgPauseAutoRefresh('detail'); } catch {}
      try {
        if (bodyEl.__wdgMsgAutoRefreshTimer) {
          clearTimeout(bodyEl.__wdgMsgAutoRefreshTimer);
          bodyEl.__wdgMsgAutoRefreshTimer = null;
        }
      } catch {}
      try {
        if (bodyEl.__wdgMsgListPollTimer) {
          clearTimeout(bodyEl.__wdgMsgListPollTimer);
          bodyEl.__wdgMsgListPollTimer = null;
        }
      } catch {}

      function showOpenOverlay() {
        try {
          let el = document.getElementById(OVERLAY_ID);
          if (!el) {
            el = document.createElement('div');
            el.id = OVERLAY_ID;
            // Não use `d-flex` aqui: no Bootstrap é `display:flex !important`,
            // o que impede ocultar com `style.display = 'none'`.
            el.className = 'position-fixed top-0 start-0 w-100 h-100 align-items-center justify-content-center bg-light bg-opacity-75';
            el.style.zIndex = '2000';
            el.innerHTML = [
              '<div class="bg-body border rounded-3 px-4 py-3 text-center" style="max-width: 340px; width: calc(100% - 2rem);">',
              '  <div class="spinner-border text-primary" role="status" aria-label="Carregando"></div>',
              '  <div class="mt-2 fw-semibold">Carregando mensagem...</div>',
              '</div>'
            ].join('');
            document.body.appendChild(el);
          }
          el.style.display = 'flex';
        } catch {}
      }

      function hideOpenOverlay() {
        try {
          const el = document.getElementById(OVERLAY_ID);
          if (el) el.style.display = 'none';
        } catch {}
      }

      showOpenOverlay();
      try {
        // Carrega (best-effort) caixas públicas para decisão correta de avatar.
        const syncPublicBoxesP = syncRecipientMailboxesFromServer(basePath).catch(() => false);

        // marca como lida (best-effort) antes, para refletir no histórico
        try {
          // UX: abrir uma conversa deve zerar o contador de não lidas da conversa.
          // Marca a thread inteira como lida (best-effort) para evitar badge preso.
          const r = await apiMarkMessageRead(basePath, mailboxId, id, { signal: ac ? ac.signal : undefined, thread: true });
          try { window.__wdgMsgLastReadMark = { ok: true, at: Date.now(), id: String(id || ''), mailboxId: String(mailboxId || ''), resp: r }; } catch {}
          // Portal: força refresh imediato do badge (evita contador preso até o próximo polling).
          try { window.dispatchEvent(new Event('wdg:msg:refreshBadge')); } catch { /* noop */ }
        } catch (e) {
          if (e && (e.name === 'AbortError' || String(e.name || '') === 'AbortError')) throw e;
          try {
            window.__wdgMsgLastReadMark = {
              ok: false,
              at: Date.now(),
              id: String(id || ''),
              mailboxId: String(mailboxId || ''),
              status: e?.status,
              message: String(e?.message || e || ''),
              body: e?.body || null
            };
          } catch {}
          try {
            // Não interrompe o fluxo, mas deixa rastro no console.
            console.warn('[wdg-msg] Falha ao marcar como lida', window.__wdgMsgLastReadMark);
          } catch {}
        }
        const detail = await apiFetchMessageDetail(basePath, mailboxId, id, { signal: ac ? ac.signal : undefined });

        // Guard contra respostas atrasadas (troca de view/caixa ou nova abertura)
        try {
          if (Number(bodyEl.__wdgMsgOpenReqId || 0) !== Number(openReqId || 0)) return;
        } catch {}
        if (String(_currentView || '').trim() !== expectedView) return;
        if (String(_currentMailboxId || 'pessoal').trim() !== expectedMailboxId) return;

        // Aguarda o sync (best-effort) antes do render do thread.
        try { await syncPublicBoxesP; } catch {}

        // atualiza cache local
        const idx = (st.items || []).findIndex(x => String(x?.id || '') === String(id));
        if (idx >= 0) {
          const next = [...st.items];
          next[idx] = { ...next[idx], lida: true };
          st.items = next;
        }
        renderMessageDetail(detail);
      } catch (e) {
        if (e && (e.name === 'AbortError' || String(e.name || '') === 'AbortError')) return;
        // Falhou abrir: volta a permitir refresh/poll na lista.
        try { st.openMessageId = ''; } catch {}
        try { __wdgMsgResumeAutoRefresh('detail'); } catch {}
        try { __wdgMsgScheduleListPoll(); } catch {}
        const msg = e?.message || 'Falha ao abrir mensagem.';
        showAlert('danger', msg);
        // fallback visual caso o container de alertas não exista
        try {
          if (!qs('#msgListAlerts', bodyEl)) {
            bodyEl.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger" role="alert">${escapeHtml(msg)}</div>`);
          }
        } catch {}
      } finally {
        hideOpenOverlay();
      }
    }

    async function fetchAndRender() {
      const OVERLAY_ID = 'wdgMsgListOverlay';
      const expectedView = String(view || '').trim();
      // IMPORTANTE: o mailbox pode mudar durante recuperação de 403 (fallback para 'pessoal').
      // Portanto, sempre derive o mailbox efetivo do estado atual.
      const effectiveMailboxId = String(_currentMailboxId || mailboxId || 'pessoal').trim() || 'pessoal';
      const expectedMailboxId = effectiveMailboxId;

      // Id desta requisição (evita que respostas atrasadas sobrescrevam UI atual)
      let listReqId = 0;
      try {
        listReqId = (Number(bodyEl.__wdgMsgListReqId || 0) || 0) + 1;
        bodyEl.__wdgMsgListReqId = listReqId;
      } catch {
        listReqId = 0;
      }

      // Cada fetch da lista deve ser independente; ao disparar um novo, cancele o anterior.
      // Isso evita que respostas atrasadas sobrescrevam a lista atual.
      let ac = null;
      try {
        if (bodyEl.__wdgMsgListAbort) {
          try { bodyEl.__wdgMsgListAbort.abort(); } catch {}
        }
        ac = new AbortController();
        bodyEl.__wdgMsgListAbort = ac;
      } catch {
        ac = null;
      }

      function showListOverlay() {
        try {
          let el = document.getElementById(OVERLAY_ID);
          if (!el) {
            el = document.createElement('div');
            el.id = OVERLAY_ID;
            // Mesma estratégia do overlay do detalhe: sem `d-flex` (bootstrap),
            // e o `display:flex` é controlado via style.
            el.className = 'position-fixed top-0 start-0 w-100 h-100 align-items-center justify-content-center bg-light bg-opacity-75';
            el.style.zIndex = '2000';
            el.innerHTML = [
              '<div class="bg-body border rounded-3 px-4 py-3 text-center" style="max-width: 340px; width: calc(100% - 2rem);">',
              '  <div class="spinner-border text-primary" role="status" aria-label="Carregando"></div>',
              '  <div class="mt-2 fw-semibold">Carregando mensagens...</div>',
              '</div>'
            ].join('');
            document.body.appendChild(el);
          }
          el.style.display = 'flex';
        } catch {}
      }

      function hideListOverlay() {
        try {
          const el = document.getElementById(OVERLAY_ID);
          if (el) el.style.display = 'none';
        } catch {}
        try {
          if (bodyEl) {
            bodyEl.__wdgMsgListOverlayVisible = false;
            bodyEl.__wdgMsgListOverlayOwner = 0;
          }
        } catch {}
      }

      // Overlay de carregamento da LISTA:
      // - Mostra com um pequeno delay para evitar "piscada" em requests rápidos.
      // - Permanece até depois do render + 1 frame, para não sumir antes da lista aparecer.
      // - Em refresh automático (poll/unread/focus), evite mostrar overlay (senão fica em loop).
      let overlayShown = false;
      let overlayTimer = null;
      let didRenderList = false;
      const allowOverlay = (() => {
        try {
          // Se for um refresh automático, não exibir overlay (mantém UX estável no Portal).
          if (bodyEl && bodyEl.__wdgMsgSilentRefresh) return false;
        } catch {}
        // Se um detalhe estiver aberto, nunca mostrar overlay da LISTA.
        try {
          if (st && String(st.openMessageId || '').trim()) return false;
        } catch {}
        return true;
      })();
      const paintNextFrame = () => new Promise((resolve) => {
        try { requestAnimationFrame(() => resolve()); } catch { resolve(); }
      });
      try {
        if (allowOverlay) {
          overlayTimer = setTimeout(() => {
            try {
              // Se uma requisição mais nova já começou, não mostre overlay desta.
              try {
                if (listReqId && Number(bodyEl.__wdgMsgListReqId || 0) !== Number(listReqId || 0)) return;
              } catch {}
              showListOverlay();
              try { bodyEl.__wdgMsgListOverlayOwner = listReqId || 0; } catch {}
              try { bodyEl.__wdgMsgListOverlayVisible = true; } catch {}
              overlayShown = true;
            } catch {}
          }, 180);
        }
      } catch {
        overlayTimer = null;
      }

      try {
        const captureSearchFocus = () => {
          try {
            const ae = document.activeElement;
            if (!ae || !bodyEl || !(ae.closest && ae.closest('#msgBody'))) return null;
            if (String(ae.id || '') !== 'msgSearch') return null;
            return {
              id: 'msgSearch',
              value: String(ae.value || ''),
              start: Number.isFinite(ae.selectionStart) ? ae.selectionStart : null,
              end: Number.isFinite(ae.selectionEnd) ? ae.selectionEnd : null
            };
          } catch {
            return null;
          }
        };

        const restoreSearchFocus = (snap) => {
          try {
            if (!snap || snap.id !== 'msgSearch') return;
            const el = qs('#msgSearch', bodyEl);
            if (!el) return;
            // Mantém o valor atual (st.q) e devolve o foco/seleção se possível.
            try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
            try {
              if (snap.start != null && snap.end != null && typeof el.setSelectionRange === 'function') {
                el.setSelectionRange(snap.start, snap.end);
              }
            } catch { /* noop */ }
          } catch { /* noop */ }
        };

        const params = {
          mailboxId: effectiveMailboxId,
          folder: view,
          page: String(Math.max(1, Number(st.page) || 1)),
          pageSize: String([10, 25, 50, 100].includes(Number(st.pageSize)) ? Number(st.pageSize) : 25),
          q: st.q,
          status: (st.onlyUnread ? 'nao_lidas' : ((st.status && st.status !== 'todas') ? st.status : '')),
          marker: String(st.marker || '').trim(),
          protocolo: st.protocolo,
          de: st.de,
          para: st.para,
          ini: st.ini,
          fim: st.fim,
          comAnexo: st.comAnexo ? '1' : '',
          semMarcador: st.semMarcador ? '1' : ''
        };
        const res = await apiFetchMessages(basePath, params, { signal: ac ? ac.signal : undefined });
        const items = Array.isArray(res?.items) ? res.items : [];

        // Metadados de paginação (best-effort; mantém compat com respostas legadas)
        try {
          const total = Number(res?.total);
          const pageSize = Number(res?.pageSize);
          const pages = Number(res?.pages);
          const page = Number(res?.page);
          if (Number.isFinite(total) && total >= 0) st.total = total;
          else st.total = items.length;
          if ([10, 25, 50, 100].includes(pageSize)) st.pageSize = pageSize;
          if (Number.isFinite(pages) && pages > 0) st.pages = pages;
          else st.pages = Math.max(1, Math.ceil(Math.max(1, Number(st.total) || items.length) / (Number(st.pageSize) || 25)));
          if (Number.isFinite(page) && page > 0) st.page = Math.min(page, st.pages);
          else st.page = Math.min(Math.max(1, Number(st.page) || 1), st.pages);
        } catch {
          // fallback
          st.total = items.length;
          st.pages = 1;
          st.page = 1;
          st.pageSize = [10, 25, 50, 100].includes(Number(st.pageSize)) ? Number(st.pageSize) : 25;
        }

        // Se o usuário saiu desta view enquanto o fetch estava em voo,
        // NÃO sobrescreva a tela atual (ex.: "nova"), evitando o "volta para entrada".
        if (String(_currentView || '').trim() !== expectedView) return;
        // Se o usuário trocou de CAIXA enquanto o fetch estava em voo,
        // não renderize resultados da caixa anterior.
        if (String(_currentMailboxId || 'pessoal').trim() !== expectedMailboxId) return;

        // Se o usuário abriu um DETALHE enquanto o fetch estava em voo,
        // não re-renderize a lista (isso fecha a leitura).
        try {
          if (st && String(st.openMessageId || '').trim()) return;
        } catch {}

        // Se outra requisição de lista mais recente foi disparada, descarte esta.
        try {
          if (listReqId && Number(bodyEl.__wdgMsgListReqId || 0) !== Number(listReqId || 0)) return;
        } catch {}

        st.items = items;

        // Garante cores dos badges (marcadores) já no primeiro render
        try {
          const hasAnyMarkers = items.some(i => Array.isArray(i?.marcadores) && i.marcadores.length);
          if (hasAnyMarkers && !st.markers) await loadMarkersIfNeeded();
        } catch {}

        st.loadedOnce = true;
        // remove seleção de ids que sumiram
        const set = new Set(items.map(i => String(i.id)));
        st.selectedIds = new Set(Array.from(st.selectedIds).filter(id => set.has(id)));

        // Último guard antes de re-renderizar a lista.
        try {
          if (st && String(st.openMessageId || '').trim()) return;
        } catch {}
        try {
          if (listReqId && Number(bodyEl.__wdgMsgListReqId || 0) !== Number(listReqId || 0)) return;
        } catch {}
        const snap = captureSearchFocus();
        renderListShell();
        bindHandlers();
        restoreSearchFocus(snap);
        didRenderList = true;
      } catch (e) {
        // Abort: fluxo normal ao alternar caixa/view ou atualizar busca.
        if (e && (e.name === 'AbortError' || String(e.name || '') === 'AbortError')) return;

        // 403 em mailbox selecionada (ex.: ID de caixa de grupo que o usuário não tem permissão)
        // pode acontecer quando o navegador ficou com uma seleção antiga em storage.
        // Recuperação: volta para a caixa pessoal UMA vez e tenta novamente.
        try {
          const stCode = Number(e?.status || 0);
          if (stCode === 403) {
            const curMb = String(expectedMailboxId || 'pessoal').trim() || 'pessoal';
            if (curMb !== 'pessoal') {
              const key = '__wdgMsgRecovered403_' + String(basePath || '');
              if (!bodyEl[key]) {
                bodyEl[key] = true;
                _currentMailboxId = 'pessoal';
                setSelectedMailboxId('pessoal');
                try { populateMailboxSelect(); } catch {}
                try { void refreshGroupsMenu(); } catch {}
                // Re-tenta imediatamente já na caixa pessoal
                try { await fetchAndRender(); } catch {}
                return;
              }
            } else {
              // Se até a caixa pessoal está bloqueada, desliga polling para evitar spam de 403.
              bodyEl.__wdgMsgDisablePoll = true;
              try {
                if (bodyEl.__wdgMsgListPollTimer) {
                  clearTimeout(bodyEl.__wdgMsgListPollTimer);
                  bodyEl.__wdgMsgListPollTimer = null;
                }
                if (bodyEl.__wdgMsgAutoRefreshTimer) {
                  clearTimeout(bodyEl.__wdgMsgAutoRefreshTimer);
                  bodyEl.__wdgMsgAutoRefreshTimer = null;
                }
              } catch {}
            }
          }
        } catch { /* noop */ }

        st.loadedOnce = true;
        // Mesmo comportamento: não renderiza erros da LISTA se já saiu da view.
        if (
          String(_currentView || '').trim() === String(view || '').trim() &&
          String(_currentMailboxId || 'pessoal').trim() === expectedMailboxId
        ) {
          // Se o usuário estiver lendo um detalhe, não interrompa com re-render/alert.
          try {
            if (st && String(st.openMessageId || '').trim()) return;
          } catch {}
          const snap = (() => { try { return (document.activeElement && String(document.activeElement.id || '') === 'msgSearch') ? { id: 'msgSearch' } : null; } catch { return null; } })();
          renderListShell();
          bindHandlers();
          try {
            if (snap && snap.id === 'msgSearch') {
              const el = qs('#msgSearch', bodyEl);
              if (el) { try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} } }
            }
          } catch { /* noop */ }
          showAlert('danger', e?.message || 'Falha ao carregar mensagens.');
          didRenderList = true;
        }
      } finally {
        try {
          if (overlayTimer) {
            clearTimeout(overlayTimer);
            overlayTimer = null;
          }
        } catch {}

        // O overlay só deve desaparecer quando a LISTA foi de fato renderizada.
        // Além disso, se o overlay ficou "preso" de uma requisição anterior,
        // um render bem-sucedido/erro desta requisição deve limpá-lo.
        if (didRenderList) {
          const shouldHide = (() => {
            try {
              const el = document.getElementById(OVERLAY_ID);
              const visible = !!(el && el.style && el.style.display !== 'none');
              if (!visible) return false;

              const owner = Number(bodyEl?.__wdgMsgListOverlayOwner || 0);
              // Se não há owner, ou se o owner é mais antigo/igual a esta req,
              // é seguro esconder agora.
              return !owner || owner <= Number(listReqId || 0);
            } catch {
              return false;
            }
          })();

          if (shouldHide) {
            try {
              await paintNextFrame();
              await paintNextFrame();
            } catch {}
            hideListOverlay();
          }

          // Notifica outras partes da página (ex.: navbar) que a lista foi atualizada.
          // Isso permite sincronizar badge/contadores sem esperar o polling separado.
          try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
              window.dispatchEvent(new CustomEvent('wdg-msg:list-rendered', {
                detail: { at: Date.now(), view: String(view || ''), mailboxId: String(expectedMailboxId || '') }
              }));
            }
          } catch {}
        }
      }
    }

    function bindHandlers() {
      const searchEl = qs('#msgSearch', bodyEl);
      const filterBtn = qs('#msgFilterBtn', bodyEl);
      const unreadBtn = qs('#msgUnreadBtn', bodyEl);

      if (searchEl && !searchEl.__wdgBound) {
        searchEl.__wdgBound = true;
        let t = null;
        searchEl.addEventListener('input', () => {
          try { bodyEl.__wdgMsgLastTypingAt = Date.now(); } catch { /* noop */ }
          st.q = String(searchEl.value || '').trim();
          st.page = 1;
          if (t) clearTimeout(t);
          t = setTimeout(() => { void fetchAndRender(); }, 300);
        });
      }

      if (filterBtn && !filterBtn.__wdgBound) {
        filterBtn.__wdgBound = true;
        filterBtn.addEventListener('click', () => {
          st.filterOpen = !st.filterOpen;
          updateTopBar();

          if (st.filterOpen) {
            void (async () => {
              try {
                await loadMarkersIfNeeded();
                renderListShell();
                bindHandlers();
              } catch (e) {
                showAlert('warning', e?.message || 'Falha ao carregar marcadores.');
              }
            })();
          }
        });
      }

      if (unreadBtn && !unreadBtn.__wdgBound) {
        unreadBtn.__wdgBound = true;
        unreadBtn.addEventListener('click', () => {
          const isUnread = !!(st.onlyUnread || st.status === 'nao_lidas' || st.status === 'não_lidas');
          if (!isUnread) {
            st.statusBeforeOnlyUnread = String(st.status || 'todas') || 'todas';
            st.onlyUnread = true;
            st.status = 'nao_lidas';
          } else {
            st.onlyUnread = false;
            const back = String(st.statusBeforeOnlyUnread || 'todas') || 'todas';
            st.status = (back === 'nao_lidas' || back === 'não_lidas') ? 'todas' : back;
          }
          st.page = 1;
          void fetchAndRender();
        });
      }

      // filtro panel
      const folderSel = qs('#msgFilterFolder', bodyEl);
      const statusSel = qs('#msgFilterStatus', bodyEl);
      const textoEl = qs('#msgFilterTexto', bodyEl);
      const protEl = qs('#msgFilterProtocolo', bodyEl);
      const deEl = qs('#msgFilterDe', bodyEl);
      const paraEl = qs('#msgFilterPara', bodyEl);
      const iniEl = qs('#msgFilterIni', bodyEl);
      const fimEl = qs('#msgFilterFim', bodyEl);
      const comAnexoEl = qs('#msgFilterComAnexo', bodyEl);
      const semMarcadorEl = qs('#msgFilterSemMarcador', bodyEl);
      const markerEl = qs('#msgFilterMarker', bodyEl);
      const applyBtn = qs('#msgFilterApply', bodyEl);
      const clearBtn = qs('#msgFilterClear', bodyEl);

      if (folderSel && !folderSel.__wdgBound) {
        folderSel.__wdgBound = true;
        folderSel.addEventListener('change', () => {
          const nextView = String(folderSel.value || '').trim() || 'entrada';
          setActiveMenu(nextView);
          void render(nextView);
        });
      }

      if (applyBtn && !applyBtn.__wdgBound) {
        applyBtn.__wdgBound = true;
        applyBtn.addEventListener('click', () => {
          const nextStatus = String(statusSel?.value || 'todas');
          if (st.onlyUnread) {
            // Mantém o toggle ativo, mas armazena o status desejado para quando o toggle for desligado.
            st.statusBeforeOnlyUnread = nextStatus || 'todas';
            st.status = 'nao_lidas';
          } else {
            st.status = nextStatus;
          }
          st.q = String(textoEl?.value || '').trim();
          st.marker = String(markerEl?.value || '').trim();
          st.protocolo = String(protEl?.value || '').trim();
          st.de = String(deEl?.value || '').trim();
          st.para = String(paraEl?.value || '').trim();
          st.ini = String(iniEl?.value || '').trim();
          st.fim = String(fimEl?.value || '').trim();
          st.comAnexo = !!comAnexoEl?.checked;
          st.semMarcador = !!semMarcadorEl?.checked;
          if (st.marker) st.semMarcador = false;
          st.page = 1;
          void fetchAndRender();
        });
      }

      if (clearBtn && !clearBtn.__wdgBound) {
        clearBtn.__wdgBound = true;
        clearBtn.addEventListener('click', () => {
          // Limpa filtros, mas não força desligar o toggle (somente não lidas) se estiver ativo.
          if (st.onlyUnread) {
            st.statusBeforeOnlyUnread = 'todas';
            st.status = 'nao_lidas';
          } else {
            st.status = 'todas';
          }
          st.q = '';
          st.marker = '';
          st.protocolo = '';
          st.de = '';
          st.para = '';
          st.ini = '';
          st.fim = '';
          st.comAnexo = false;
          st.semMarcador = false;
          st.filterOpen = false;
          st.page = 1;
          void fetchAndRender();
        });
      }

      // Paginação
      const pagerSize = qs('#msgPagerSize', bodyEl);
      if (pagerSize && !pagerSize.__wdgBound) {
        pagerSize.__wdgBound = true;
        pagerSize.addEventListener('change', () => {
          const next = Number(pagerSize.value) || 25;
          st.pageSize = [10, 25, 50, 100].includes(next) ? next : 25;
          st.page = 1;
          st.selectedIds = new Set();
          void fetchAndRender();
        });
      }

      const bindPagerBtn = (id, onClick) => {
        const el = qs(id, bodyEl);
        if (!el || el.__wdgBound) return;
        el.__wdgBound = true;
        el.addEventListener('click', () => {
          if (el.disabled) return;
          onClick();
        });
      };

      bindPagerBtn('#msgPagerFirst', () => {
        st.page = 1;
        st.selectedIds = new Set();
        void fetchAndRender();
      });
      bindPagerBtn('#msgPagerPrev', () => {
        st.page = Math.max(1, (Number(st.page) || 1) - 1);
        st.selectedIds = new Set();
        void fetchAndRender();
      });
      bindPagerBtn('#msgPagerNext', () => {
        const pages = Math.max(1, Number(st.pages) || 1);
        st.page = Math.min(pages, (Number(st.page) || 1) + 1);
        st.selectedIds = new Set();
        void fetchAndRender();
      });
      bindPagerBtn('#msgPagerLast', () => {
        st.page = Math.max(1, Number(st.pages) || 1);
        st.selectedIds = new Set();
        void fetchAndRender();
      });

      // seleção por menu
      qsa('[data-select]', bodyEl).forEach(btn => {
        if (btn.__wdgBound) return;
        btn.__wdgBound = true;
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-select') || '';
          if (mode === 'none') {
            st.selectedIds = new Set();
            updateTopBar();
            return;
          }
          const next = new Set();
          (st.items || []).forEach(it => {
            if (mode === 'all') next.add(it.id);
            if (mode === 'read' && it.lida) next.add(it.id);
            if (mode === 'unread' && !it.lida) next.add(it.id);
          });
          st.selectedIds = next;
          updateTopBar();
        });
      });

      // checkboxes
      qsa('[data-msg-check="1"]', bodyEl).forEach(chk => {
        if (chk.__wdgBound) return;
        chk.__wdgBound = true;
        chk.addEventListener('change', () => {
          const id = chk.getAttribute('data-id') || '';
          if (!id) return;
          const next = new Set(st.selectedIds);
          if (chk.checked) next.add(id); else next.delete(id);
          st.selectedIds = next;
          updateTopBar();
        });
      });

      // abrir mensagem ao clicar na linha (exceto checkbox)
      const listBody = qs('#msgListBody', bodyEl);
      if (listBody && !listBody.__wdgMsgRowBound) {
        listBody.__wdgMsgRowBound = true;
        listBody.addEventListener('click', (ev) => {
          let t = ev.target;
          if (!t) return;
          if (t.nodeType === 3) t = t.parentElement;
          if (!t) return;

          // Checkbox: não abre a mensagem, mas deixa o input marcar normalmente
          if (t.closest && t.closest('[data-msg-check="1"]')) {
            ev.stopPropagation();
            return;
          }

          // Coluna do checkbox: clique em qualquer lugar alterna seleção
          if (t.closest && t.closest('[data-msg-check-col="1"]')) {
            ev.preventDefault();
            ev.stopPropagation();
            const col = t.closest('[data-msg-check-col="1"]');
            const chk = col ? col.querySelector('[data-msg-check="1"]') : null;
            if (chk && !chk.disabled) {
              chk.checked = !chk.checked;
              chk.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
          }
          const row = t.closest ? t.closest('[data-msg-row="1"]') : null;
          if (!row) return;
          const id = row.getAttribute('data-id') || '';
          if (!id) return;
          void openMessageById(id);
        });
      }

      // ações quando selecionado
      const actArchive = qs('#msgActArchive', bodyEl);
      const actTrash = qs('#msgActTrash', bodyEl);
      const actPin = qs('#msgActPin', bodyEl);
      const actRestore = qs('#msgActRestore', bodyEl);
      const actMarkerList = qsMarker('#msgMarkerList', bodyEl);
      const actMarkerNew = qsMarker('#msgMarkerNewBtn', bodyEl);
      const actMarkerEdit = qsMarker('#msgMarkerEditBtn', bodyEl);
      const createBlock = qsMarker('#msgMarkerCreateBlock', bodyEl);
      const createNameInput = qsMarker('#msgNewMarkerName', bodyEl);
      const colorBtn = qsMarker('#msgMarkerColorBtn', bodyEl);
      const paletteWrap = qsMarker('#msgMarkerPalette', bodyEl);
      const palette = qsMarker('[data-marker-color-palette="1"]', bodyEl);
      const colorHidden = qsMarker('#msgNewMarkerColor', bodyEl);
      const colorPreview = qsMarker('[data-marker-color-preview="1"]', bodyEl);
      const okBtn = qsMarker('#msgMarkerOkBtn', bodyEl);
      const cancelBtn = qsMarker('#msgMarkerCancelBtn', bodyEl);

      function setCreateColor(key) {
        const { k, bgCss } = markerColorStyle(key);
        if (colorHidden) colorHidden.value = k;
        if (colorPreview) colorPreview.style.backgroundColor = bgCss;
      }

      function showCreateBlock(show) {
        if (!createBlock) return;
        createBlock.style.display = show ? '' : 'none';
        if (!show && paletteWrap) paletteWrap.style.display = 'none';
        if (show) {
          if (colorHidden) colorHidden.value = '';
          if (colorPreview) colorPreview.style.backgroundColor = '';
          try { createNameInput?.focus(); } catch {}
        }
      }

      async function createMarkerFromForm() {
        const nome = normalizeMarkerNameClient(createNameInput?.value || '');
        if (!nome) {
          showAlert('warning', 'Digite o nome do marcador.');
          return;
        }
        const corRaw = String(colorHidden?.value || '').trim();
        if (!corRaw) {
          showAlert('warning', 'Selecione uma cor para o marcador.');
          return;
        }
        const cor = normalizeMarkerColorKey(corRaw);
        try {
          const created = await apiCreateMarker(basePath, mailboxId, nome, cor);
          st.markers = Array.isArray(st.markers) ? st.markers : [];
          const id = String(created?.id || '').trim();
          const exists = st.markers.some(x => String(x?.id || '') === id || String(x?.nome || '').trim().toLowerCase() === nome.toLowerCase());
          if (!exists) st.markers = [{ id: id || `local_${Date.now()}`, nome, cor }, ...st.markers];
          renderMarkerDropdown();
          if (createNameInput) createNameInput.value = '';
          showCreateBlock(false);
        } catch (e) {
          showAlert('danger', e?.message || 'Falha ao criar marcador.');
        }
      }

      function togglePalette() {
        if (!paletteWrap) return;
        const open = paletteWrap.style.display !== 'none' && paletteWrap.style.display !== '' ? false : (paletteWrap.style.display === '');
        paletteWrap.style.display = open ? 'none' : '';
      }

      function getSelectedItems() {
        const ids = Array.from(st.selectedIds || []);
        const items = Array.isArray(st.items) ? st.items : [];
        const setIds = new Set(ids.map(String));
        return items.filter(it => it && typeof it === 'object' && setIds.has(String(it.id || '')));
      }

      function normalizeMarkerNameClient(name) {
        const n = String(name || '').trim();
        if (!n) return '';
        return n.replace(/\s+/g, ' ').slice(0, 60);
      }

      async function runAction(action, extra) {
        const ids = Array.from(st.selectedIds);
        if (!ids.length) return;

        if (action === 'marker') {
          if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarMarcador, 'Sem permissão para gerenciar marcadores nesta caixa.')) return;
        }
        if (action === 'trash' || action === 'delete') {
          if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.excluirMensagem, 'Sem permissão para excluir mensagens nesta caixa.')) return;
        }
        try {
          // marcador: toggle + limite de 3
          if (action === 'marker') {
            const markerName = normalizeMarkerNameClient(extra?.marker || '');
            if (!markerName) return;

            // Guarda quais mensagens estavam lidas ANTES da ação de marcador.
            // Se o backend mexer no status (bug), nós reafirmamos a leitura para não disparar alerta sonoro.
            const wasReadBefore = new Set();
            try {
              const idSet0 = new Set(ids.map(String));
              const items0 = Array.isArray(st.items) ? st.items : [];
              const looksRead = (src) => {
                if (!src || typeof src !== 'object') return false;
                const statusRaw = src.status ?? src.situacao ?? src.estado;
                if (typeof statusRaw === 'string') {
                  const stx = statusRaw.trim().toLowerCase();
                  if (stx) {
                    if (stx.includes('nao_lida') || stx.includes('não_lida') || stx.includes('nao lida') || stx.includes('não lida') || stx === 'unread' || stx === 'nao_lidas' || stx === 'não_lidas') return false;
                    if (stx === 'lida' || stx === 'lidas' || stx === 'read') return true;
                  }
                }
                const flag = src.lida ?? src.read ?? src.isRead ?? src.is_read ?? src.lido ?? src.visualizada ?? src.visualizado ?? src.visto ?? src.viewed;
                if (flag === true || flag === 1) return true;
                if (flag === false || flag === 0) return false;
                if (typeof flag === 'string') {
                  const s = flag.trim().toLowerCase();
                  if (!s) return false;
                  if (s === '0' || s === 'false' || s === 'nao' || s === 'não' || s === 'n' || s === 'no') return false;
                  if (s === '1' || s === 'true' || s === 'sim' || s === 's' || s === 'yes' || s === 'y') return true;
                }
                const readAt = src.lidaEm ?? src.lida_em ?? src.readAt ?? src.read_at ?? src.lidoEm ?? src.lido_em ?? src.visualizadoEm ?? src.visualizado_em ?? src.visualizadaEm ?? src.visualizada_em ?? src.vistoEm ?? src.visto_em ?? src.openedAt ?? src.opened_at;
                if (readAt === true) return true;
                if (typeof readAt === 'number') return readAt > 0;
                if (typeof readAt === 'string') {
                  const v = readAt.trim();
                  if (!v) return false;
                  const low = v.toLowerCase();
                  if (low === '0' || low === 'false' || low === 'null' || low === 'undefined') return false;
                  if (/^\d{10,}$/.test(v)) return true;
                  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return true;
                  const t = Date.parse(v);
                  return Number.isFinite(t);
                }
                return false;
              };
              for (const it0 of items0) {
                if (!it0 || typeof it0 !== 'object') continue;
                const itId0 = String(it0.id || '').trim();
                if (!itId0 || !idSet0.has(itId0)) continue;
                if (looksRead(it0)) wasReadBefore.add(itId0);
              }
            } catch { /* noop */ }

            const idSet = new Set(ids.map(String));
            const keyLower = markerName.toLowerCase();
            const items = Array.isArray(st.items) ? st.items : [];

            // pré-valida limite (se for adicionar)
            for (const it of items) {
              if (!it || typeof it !== 'object') continue;
              const itId = String(it.id || '');
              if (!idSet.has(itId)) continue;
              const tags = (Array.isArray(it.marcadores) ? it.marcadores : []).map(x => String(x || '').trim()).filter(Boolean);
              const has = tags.some(t => t.toLowerCase() === keyLower);
              if (!has && tags.length >= 3) {
                showAlert('warning', 'Limite de 3 marcadores por mensagem.');
                return;
              }
            }

            await apiMessagesAction(basePath, mailboxId, ids, action, { marker: markerName });

            if (wasReadBefore.size) {
              try {
                await Promise.all(Array.from(wasReadBefore).map((id) => apiMarkMessageRead(basePath, mailboxId, id).catch(() => null)));
              } catch { /* noop */ }
            }

            const nextItems = items.map((it) => {
              if (!it || typeof it !== 'object') return it;
              const itId = String(it.id || '');
              if (!idSet.has(itId)) return it;
              const next = { ...it };
              const tags = (Array.isArray(next.marcadores) ? next.marcadores : []).map(x => String(x || '').trim()).filter(Boolean);
              const has = tags.some(t => t.toLowerCase() === keyLower);
              next.marcadores = has
                ? tags.filter(t => t.toLowerCase() !== keyLower)
                : [...tags, markerName].slice(0, 3);
              return next;
            });

            // Se estiver filtrando "Sem marcador", ao adicionar marcador a mensagem deixa de ser elegível.
            st.items = st.semMarcador ? nextItems.filter((it) => {
              if (!it || typeof it !== 'object') return true;
              const itId = String(it.id || '');
              return !idSet.has(itId);
            }) : nextItems;

            st.selectedIds = new Set();
            updateTopBar();
            return;
          }

          await apiMessagesAction(basePath, mailboxId, ids, action, extra);
          st.selectedIds = new Set();
          await fetchAndRender();
        } catch (e) {
          showAlert('danger', e?.message || 'Falha ao aplicar ação.');
        }
      }

      if (actArchive && !actArchive.__wdgBound) {
        actArchive.__wdgBound = true;
        actArchive.addEventListener('click', () => {
          void (async () => {
            const cur = String(_currentView || '') || 'entrada';
            if (cur === 'arquivo') {
              await runAction('unarchive');
              return;
            }
            await runAction('archive', { fromFolder: cur });
          })();
        });
      }
      if (actRestore && !actRestore.__wdgBound) {
        actRestore.__wdgBound = true;
        actRestore.addEventListener('click', () => void runAction('restore'));
      }
      if (actTrash && !actTrash.__wdgBound) {
        actTrash.__wdgBound = true;
        actTrash.addEventListener('click', () => {
          void (async () => {
            if (String(_currentView || '') === 'lixeira') {
              const ok = await confirmPermanentDelete();
              if (!ok) return;
              await runAction('delete');
              return;
            }
            await runAction('trash', { fromFolder: String(_currentView || '') || 'entrada' });
          })();
        });
      }
      if (actPin && !actPin.__wdgBound) {
        actPin.__wdgBound = true;
        actPin.addEventListener('click', () => void runAction('pin'));
      }

      // marcador: carregar lista na primeira vez
      const markerToggle = qsMarker('#msgActMarker', bodyEl) || qs('#msgActMarker', bodyEl);
      if (markerToggle && !markerToggle.__wdgBound) {
        markerToggle.__wdgBound = true;
        markerToggle.addEventListener('click', () => {
          void (async () => {
            try {
              await loadMarkersIfNeeded();
              // default: modo visual
              st.markerEditMode = false;
              st.markerSelectionOverride = null;
              showCreateBlock(false);
              renderMarkerDropdown();
            } catch (e) {
              showAlert('danger', e?.message || 'Falha ao carregar marcadores.');
            }
          })();
        });
      }

      if (actMarkerNew && !actMarkerNew.__wdgBound) {
        actMarkerNew.__wdgBound = true;
        actMarkerNew.addEventListener('click', () => {
          const isOpen = !!(createBlock && createBlock.style.display !== 'none');
          showCreateBlock(!isOpen);
        });
      }

      if (colorBtn && !colorBtn.__wdgBound) {
        colorBtn.__wdgBound = true;
        colorBtn.addEventListener('click', () => {
          if (!createBlock || createBlock.style.display === 'none') return;
          if (!paletteWrap) return;
          paletteWrap.style.display = (paletteWrap.style.display === 'none') ? '' : 'none';
        });
      }

      if (palette && !palette.__wdgBound) {
        palette.__wdgBound = true;
        palette.addEventListener('click', (ev) => {
          const btn = ev.target?.closest?.('[data-marker-color]');
          if (!btn) return;
          const key = normalizeMarkerColorKey(btn.getAttribute('data-marker-color') || 'primary');
          setCreateColor(key);
        });
      }

      if (okBtn && !okBtn.__wdgBound) {
        okBtn.__wdgBound = true;
        okBtn.addEventListener('click', () => void createMarkerFromForm());
      }

      if (cancelBtn && !cancelBtn.__wdgBound) {
        cancelBtn.__wdgBound = true;
        cancelBtn.addEventListener('click', () => {
          if (createNameInput) createNameInput.value = '';
          showCreateBlock(false);
        });
      }

      if (actMarkerEdit && !actMarkerEdit.__wdgBound) {
        actMarkerEdit.__wdgBound = true;
        actMarkerEdit.addEventListener('click', () => {
          st.markerEditMode = !st.markerEditMode;
          if (st.markerEditMode) st.markerSelectionOverride = null;
          renderMarkerDropdown();
        });
      }

      if (actMarkerList && !actMarkerList.__wdgBound) {
        actMarkerList.__wdgBound = true;
        actMarkerList.addEventListener('click', (ev) => {
          const t = ev.target;
          const removeBtn = t && t.closest ? t.closest('[data-marker-remove-id]') : null;
          if (removeBtn) {
            const id = String(removeBtn.getAttribute('data-marker-remove-id') || '').trim();
            if (!id) return;
            void (async () => {
              try {
                await apiDeleteMarker(basePath, mailboxId, id);
                st.markers = (Array.isArray(st.markers) ? st.markers : []).filter(m => String(m?.id || '') !== id);
                renderMarkerDropdown();
              } catch (e) {
                showAlert('danger', e?.message || 'Falha ao remover marcador.');
              }
            })();
            return;
          }

          const row = t && t.closest ? t.closest('[data-marker-row="1"]') : null;
          const nome = String(row?.getAttribute('data-marker-name') || '').trim();
          if (!nome) return;

          // Em modo edição, o clique no item não deve aplicar marcador nas mensagens.
          if (st.markerEditMode) return;

          void runAction('marker', { marker: nome });
        });
      }
    }

    // Evita "tela vazia"/placeholder antes do primeiro carregamento.
    // O `fetchAndRender()` já renderiza e também mostra o overlay na 1ª carga.
    // Auto-refresh (Portal do Morador): quando o contador de não lidas sobe,
    // atualiza a lista sem precisar dar F5.
    try {
      if (bodyEl.__wdgMsgAutoRefreshHandler) {
        window.removeEventListener('wdg:msg:unread', bodyEl.__wdgMsgAutoRefreshHandler);
      }
      if (bodyEl.__wdgMsgAutoRefreshFocusHandler) {
        window.removeEventListener('focus', bodyEl.__wdgMsgAutoRefreshFocusHandler);
      }
      if (bodyEl.__wdgMsgAutoRefreshVisHandler) {
        document.removeEventListener('visibilitychange', bodyEl.__wdgMsgAutoRefreshVisHandler);
      }
      if (bodyEl.__wdgMsgAutoRefreshTimer) {
        clearTimeout(bodyEl.__wdgMsgAutoRefreshTimer);
        bodyEl.__wdgMsgAutoRefreshTimer = null;
      }
    } catch {}

    var __wdgMsgRefreshInFlight = false;
    var __wdgMsgRefreshQueued = false;
    var __wdgMsgLastRefreshAt = 0;
    var __wdgMsgBoostUntil = Date.now() + 15000;

    // Refresh deferido: se chegar evento/poll enquanto o usuário está lendo um detalhe
    // ou com UI ocupada, apenas marca pendente e executa quando voltar à lista.
    var __wdgMsgDeferredRefresh = false;
    var __wdgMsgDeferredReason = '';
    var __wdgMsgDeferredTimer = null;

    function __wdgMsgMarkDeferred(reason) {
      try {
        __wdgMsgDeferredRefresh = true;
        __wdgMsgDeferredReason = String(reason || 'deferred');

        // Tenta flush posteriormente (best-effort) quando a UI ficar livre.
        // Não roda em loop agressivo.
        if (__wdgMsgDeferredTimer) return;
        __wdgMsgDeferredTimer = setTimeout(function () {
          __wdgMsgDeferredTimer = null;
          try { __wdgMsgFlushDeferredRefresh('timer'); } catch {}
        }, 1500);
      } catch {}
    }

    function __wdgMsgFlushDeferredRefresh(reason) {
      try {
        if (!__wdgMsgDeferredRefresh) return;
        if (document.hidden) return;
        if (!__wdgMsgIsListView()) return;
        if (__wdgMsgIsUiHeld()) return;
        if (__wdgMsgIsUiBusy()) return;

        __wdgMsgDeferredRefresh = false;
        var r = __wdgMsgDeferredReason || String(reason || 'deferred');
        __wdgMsgDeferredReason = '';
        try { __wdgMsgRequestRefresh(String(r || 'deferred')); } catch {}
      } catch {}
    }

    // Pausa o auto-refresh/polling enquanto menus/dropdowns estiverem abertos.
    // Evita re-render da lista que pode fechar menus (instabilidade relatada).
    try {
      if (typeof bodyEl.__wdgMsgUiHoldCount !== 'number') bodyEl.__wdgMsgUiHoldCount = 0;
    } catch {}

    function __wdgMsgIsUiHeld() {
      try {
        return (Number(bodyEl.__wdgMsgUiHoldCount || 0) || 0) > 0;
      } catch {
        return false;
      }
    }

    function __wdgMsgPauseAutoRefresh(reason) {
      try {
        // Idempotência: evita incrementar hold múltiplas vezes para o mesmo "motivo".
        // (ex.: evento do Bootstrap + MutationObserver vendo o menu aberto)
        if (String(reason || '') === 'dropdown' && bodyEl.__wdgMsgDropdownHoldActive) return;
        if (String(reason || '') === 'detail' && bodyEl.__wdgMsgDetailHoldActive) return;

        var n = (Number(bodyEl.__wdgMsgUiHoldCount || 0) || 0) + 1;
        bodyEl.__wdgMsgUiHoldCount = n;
        bodyEl.__wdgMsgUiHoldReason = String(reason || 'ui');
        bodyEl.__wdgMsgUiHoldSince = Date.now();

        if (String(reason || '') === 'dropdown') bodyEl.__wdgMsgDropdownHoldActive = true;
        if (String(reason || '') === 'detail') bodyEl.__wdgMsgDetailHoldActive = true;

        // Para timers imediatamente.
        if (bodyEl.__wdgMsgAutoRefreshTimer) {
          clearTimeout(bodyEl.__wdgMsgAutoRefreshTimer);
          bodyEl.__wdgMsgAutoRefreshTimer = null;
        }
        if (bodyEl.__wdgMsgListPollTimer) {
          clearTimeout(bodyEl.__wdgMsgListPollTimer);
          bodyEl.__wdgMsgListPollTimer = null;
        }
      } catch {}
    }

    function __wdgMsgResumeAutoRefresh(reason) {
      try {
        // Idempotência para o hold de dropdown.
        if (String(reason || '') === 'dropdown') {
          if (!bodyEl.__wdgMsgDropdownHoldActive) return;
          bodyEl.__wdgMsgDropdownHoldActive = false;
        }

        // Idempotência para o hold de detalhe.
        if (String(reason || '') === 'detail') {
          if (!bodyEl.__wdgMsgDetailHoldActive) return;
          bodyEl.__wdgMsgDetailHoldActive = false;
        }

        var n = (Number(bodyEl.__wdgMsgUiHoldCount || 0) || 0) - 1;
        if (n < 0) n = 0;
        bodyEl.__wdgMsgUiHoldCount = n;
        if (n > 0) return;

        // Retoma polling e faz um refresh leve (best-effort)
        try { __wdgMsgBoostUntil = Date.now() + 8000; } catch {}

        try { __wdgMsgScheduleListPoll(); } catch {}
        if (__wdgMsgRefreshQueued) {
          __wdgMsgRefreshQueued = false;
          try { __wdgMsgRequestRefresh(String(reason || 'ui-resume')); } catch {}
        }

        // Se havia refresh deferido, tenta aplicar agora que a UI liberou.
        try { __wdgMsgFlushDeferredRefresh(String(reason || 'ui-resume')); } catch {}
      } catch {}
    }

    function __wdgMsgIsUiBusy() {
      // Bloqueia auto-refresh enquanto o usuário estiver interagindo com filtros,
      // seleção (ações em lote) ou digitando em inputs do módulo.
      try {
        if (st && st.filterOpen) return true;
      } catch {}
      try {
        if (st && st.selectedIds && typeof st.selectedIds.size === 'number' && st.selectedIds.size > 0) return true;
      } catch {}
      try {
        var ae = document.activeElement;
        if (ae && ae !== document.body) {
          var inMsg = ae.closest && ae.closest('#msgBody');
          if (inMsg) {
            var tag = String(ae.tagName || '').toLowerCase();
            // Se apenas está focado (ex.: campo de busca), não bloquear indefinidamente.
            // Só considera "ocupado" quando houve digitação recente.
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || ae.isContentEditable) {
              var last = Number(bodyEl.__wdgMsgLastTypingAt || 0) || 0;
              if (last && (Date.now() - last) < 2500) return true;
              // fallback conservador: textarea/contenteditable tende a ser composição
              // (mas em compose a view não é list, então não entra aqui).
              if (tag === 'textarea' || ae.isContentEditable) return true;
              return false;
            }
          }
        }
      } catch {}
      return false;
    }

    function __wdgMsgIsListView() {
      var v = String(view || '').trim();
      // Garante que estamos falando da view ativa atual.
      if (String(_currentView || '').trim() !== v) return false;

      // Se um detalhe estiver aberto, não permita refresh/poll re-renderizar a lista.
      try {
        if (st && String(st.openMessageId || '').trim()) return false;
      } catch {}

      // Se a UI estiver em interação (menus abertos), não re-renderizar.
      if (__wdgMsgIsUiHeld()) return false;

      // Se o usuário estiver em ações/inputs/seleção, não auto-atualizar.
      if (__wdgMsgIsUiBusy()) return false;

      // Se a caixa pessoal está bloqueada (403), paramos o polling.
      try {
        if (bodyEl.__wdgMsgDisablePoll) return false;
      } catch {}

      return v === 'entrada' || v === 'saida' || v === 'arquivo' || v === 'lixeira';
    }

    async function __wdgMsgRefreshNow(reason) {
      try {
        if (!__wdgMsgIsListView()) { __wdgMsgMarkDeferred(String(reason || 'refresh')); return; }
        if (document.hidden) { __wdgMsgMarkDeferred(String(reason || 'refresh')); return; }
        if (__wdgMsgIsUiHeld()) {
          __wdgMsgRefreshQueued = true;
          return;
        }
        if (__wdgMsgIsUiBusy()) {
          __wdgMsgMarkDeferred(String(reason || 'busy'));
          return;
        }
        if (__wdgMsgRefreshInFlight) {
          __wdgMsgRefreshQueued = true;
          return;
        }
        __wdgMsgRefreshInFlight = true;
        try {
          try { bodyEl.__wdgMsgSilentRefresh = true; } catch {}
          await fetchAndRender();
          __wdgMsgLastRefreshAt = Date.now();
        } finally {
          try { bodyEl.__wdgMsgSilentRefresh = false; } catch {}
          __wdgMsgRefreshInFlight = false;
        }
        if (__wdgMsgRefreshQueued) {
          __wdgMsgRefreshQueued = false;
          // pequena folga para não martelar a API
          try { setTimeout(function () { void __wdgMsgRefreshNow('queued'); }, 350); } catch {}
        }
      } catch {
        // best-effort
      }
    }

    function __wdgMsgRequestRefresh(reason) {
      try {
        if (!__wdgMsgIsListView()) { __wdgMsgMarkDeferred(String(reason || 'event')); return; }
        if (document.hidden) { __wdgMsgMarkDeferred(String(reason || 'event')); return; }

        // Se estiver em interação, apenas enfileira para quando o menu fechar.
        if (__wdgMsgIsUiHeld()) {
          __wdgMsgRefreshQueued = true;
          return;
        }

        // Se estiver ocupado (filtro/seleção/digitando), deferir para não interromper.
        if (__wdgMsgIsUiBusy()) {
          __wdgMsgMarkDeferred(String(reason || 'busy'));
          return;
        }

        try { __wdgMsgBoostUntil = Date.now() + 20000; } catch {}

        var now = Date.now();
        if (__wdgMsgLastRefreshAt && (now - __wdgMsgLastRefreshAt) < 2000) return;

        if (bodyEl.__wdgMsgAutoRefreshTimer) {
          clearTimeout(bodyEl.__wdgMsgAutoRefreshTimer);
          bodyEl.__wdgMsgAutoRefreshTimer = null;
        }

        bodyEl.__wdgMsgAutoRefreshTimer = setTimeout(function () {
          void __wdgMsgRefreshNow(String(reason || 'event'));
        }, 250);
      } catch {}
    }

    try {
      // Hook de debug (ex.: console): window.__wdgMsgRefreshNow?.()
      window.__wdgMsgRefreshNow = function () { __wdgMsgRequestRefresh('manual'); };
    } catch {}

    try {
      var __wdgOnUnread = function (ev) {
        try {
          __wdgMsgRequestRefresh('unread');
        } catch {}
      };
      bodyEl.__wdgMsgAutoRefreshHandler = __wdgOnUnread;
      window.addEventListener('wdg:msg:unread', __wdgOnUnread);

      var __wdgOnFocus = function () { __wdgMsgRequestRefresh('focus'); };
      bodyEl.__wdgMsgAutoRefreshFocusHandler = __wdgOnFocus;
      window.addEventListener('focus', __wdgOnFocus);

      var __wdgOnVis = function () {
        try {
          if (!document.hidden) __wdgMsgRequestRefresh('visible');
        } catch {}
      };
      bodyEl.__wdgMsgAutoRefreshVisHandler = __wdgOnVis;
      document.addEventListener('visibilitychange', __wdgOnVis);
    } catch {}

    // Polling local: deixa a lista "fluida" (parece app local), sem depender só do badge.
    // Mantém intervalos moderados + boost quando algo acontece.
    try {
      if (bodyEl.__wdgMsgListPollTimer) {
        clearTimeout(bodyEl.__wdgMsgListPollTimer);
        bodyEl.__wdgMsgListPollTimer = null;
      }
    } catch {}

    function __wdgMsgGetPollIntervalMs() {
      try {
        if (document.hidden) return 30000;
        var base = 5000;
        if (__wdgMsgBoostUntil && Date.now() < __wdgMsgBoostUntil) base = 2500;
        return base;
      } catch {
        return 8000;
      }
    }

    function __wdgMsgScheduleListPoll() {
      try {
        // Evita múltiplos timers concorrentes.
        if (bodyEl.__wdgMsgListPollTimer) {
          clearTimeout(bodyEl.__wdgMsgListPollTimer);
          bodyEl.__wdgMsgListPollTimer = null;
        }
        if (!__wdgMsgIsListView()) return;
        if (__wdgMsgIsUiHeld()) return;
        if (__wdgMsgIsUiBusy()) return;

        // Se a lista voltou a ficar "segura", aplica refresh deferido antes de agendar.
        try { __wdgMsgFlushDeferredRefresh('poll-pre'); } catch {}
        var ms = __wdgMsgGetPollIntervalMs();
        bodyEl.__wdgMsgListPollTimer = setTimeout(function () {
          try {
            void __wdgMsgRefreshNow('poll');
          } finally {
            __wdgMsgScheduleListPoll();
          }
        }, ms);
      } catch {}
    }

    // Ao abrir dropdown/menu, pausa refresh/poll para evitar fechamento por re-render.
    try {
      if (bodyEl.__wdgMsgDropdownShowHandler) {
        document.removeEventListener('show.bs.dropdown', bodyEl.__wdgMsgDropdownShowHandler, true);
      }
      if (bodyEl.__wdgMsgDropdownHiddenHandler) {
        document.removeEventListener('hidden.bs.dropdown', bodyEl.__wdgMsgDropdownHiddenHandler, true);
      }
      if (bodyEl.__wdgMsgDropdownObserver) {
        try { bodyEl.__wdgMsgDropdownObserver.disconnect(); } catch {}
        bodyEl.__wdgMsgDropdownObserver = null;
      }
    } catch {}

    try {
      var __wdgMsgDropdownShow = function (ev) {
        try {
          if (!__wdgMsgIsListView()) return;
          var t = ev && ev.target;
          // Só considerar dropdowns que pertencem ao módulo de mensagens.
          if (!t || !(t.closest && t.closest('#msgBody'))) return;
          __wdgMsgPauseAutoRefresh('dropdown');
        } catch {}
      };
      var __wdgMsgDropdownHidden = function (ev) {
        try {
          // Mesmo fora da lista, ainda pode ser um dropdown do módulo.
          var t = ev && ev.target;
          if (!t || !(t.closest && t.closest('#msgBody'))) return;
          __wdgMsgResumeAutoRefresh('dropdown');
        } catch {}
      };
      bodyEl.__wdgMsgDropdownShowHandler = __wdgMsgDropdownShow;
      bodyEl.__wdgMsgDropdownHiddenHandler = __wdgMsgDropdownHidden;
      // capture=true para pegar eventos mesmo se alguma lib parar bubbling.
      document.addEventListener('show.bs.dropdown', __wdgMsgDropdownShow, true);
      document.addEventListener('hidden.bs.dropdown', __wdgMsgDropdownHidden, true);
    } catch {}

    // Fallback: alguns menus (ex.: Marcador) podem ser "portalizados"/movidos no DOM.
    // Se isso ocorrer, o evento ainda pode acontecer, mas o DOM final pode confundir
    // handlers; então observamos também a existência de dropdowns abertos.
    try {
      var __wdgMsgIsAnyMsgDropdownOpen = function () {
        try {
          if (!__wdgMsgIsListView()) return false;

          // Dropdowns dentro do corpo do módulo.
          var inBody = document.querySelector('#msgBody .dropdown-menu.show');
          if (inBody) return true;

          // Dropdown "portalizado" (usado no menu de Marcadores) vira .wdg-msg-dd-portal.
          var portal = document.querySelector('.dropdown-menu.wdg-msg-dd-portal.show');
          if (portal) return true;

          return false;
        } catch {
          return false;
        }
      };

      var __wdgMsgSyncDropdownHold = function () {
        try {
          var open = __wdgMsgIsAnyMsgDropdownOpen();
          if (open) {
            __wdgMsgPauseAutoRefresh('dropdown');
          } else {
            __wdgMsgResumeAutoRefresh('dropdown');
          }
        } catch {}
      };

      // Primeira sincronização + observer.
      __wdgMsgSyncDropdownHold();
      var obs = new MutationObserver(function () {
        try { __wdgMsgSyncDropdownHold(); } catch {}
      });
      obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-expanded'] });
      bodyEl.__wdgMsgDropdownObserver = obs;
    } catch {}

    __wdgMsgScheduleListPoll();

    // Renderiza o shell imediatamente (evita “branco” enquanto a API responde)
    renderListShell();
    bindHandlers();
    await fetchAndRender();
    return;
  }

  function teardownMsgListAutoRefresh(bodyEl) {
    if (!bodyEl) return;
    try {
      // Cancela qualquer fetch em voo para evitar sobrescrita após troca de caixa/view.
      if (bodyEl.__wdgMsgListAbort) {
        try { bodyEl.__wdgMsgListAbort.abort(); } catch {}
        bodyEl.__wdgMsgListAbort = null;
      }
      // Cancela abertura/detalhe em voo (evita re-render do detalhe após trocar de caixa/view).
      if (bodyEl.__wdgMsgOpenAbort) {
        try { bodyEl.__wdgMsgOpenAbort.abort(); } catch {}
        bodyEl.__wdgMsgOpenAbort = null;
      }
      try { bodyEl.__wdgMsgOpenReqId = (Number(bodyEl.__wdgMsgOpenReqId || 0) || 0) + 1; } catch {}
      if (bodyEl.__wdgMsgAutoRefreshHandler) {
        window.removeEventListener('wdg:msg:unread', bodyEl.__wdgMsgAutoRefreshHandler);
        bodyEl.__wdgMsgAutoRefreshHandler = null;
      }
      if (bodyEl.__wdgMsgAutoRefreshFocusHandler) {
        window.removeEventListener('focus', bodyEl.__wdgMsgAutoRefreshFocusHandler);
        bodyEl.__wdgMsgAutoRefreshFocusHandler = null;
      }
      if (bodyEl.__wdgMsgAutoRefreshVisHandler) {
        document.removeEventListener('visibilitychange', bodyEl.__wdgMsgAutoRefreshVisHandler);
        bodyEl.__wdgMsgAutoRefreshVisHandler = null;
      }
      if (bodyEl.__wdgMsgAutoRefreshTimer) {
        clearTimeout(bodyEl.__wdgMsgAutoRefreshTimer);
        bodyEl.__wdgMsgAutoRefreshTimer = null;
      }
      if (bodyEl.__wdgMsgListPollTimer) {
        clearTimeout(bodyEl.__wdgMsgListPollTimer);
        bodyEl.__wdgMsgListPollTimer = null;
      }
      if (bodyEl.__wdgMsgDropdownShowHandler) {
        document.removeEventListener('show.bs.dropdown', bodyEl.__wdgMsgDropdownShowHandler, true);
        bodyEl.__wdgMsgDropdownShowHandler = null;
      }
      if (bodyEl.__wdgMsgDropdownHiddenHandler) {
        document.removeEventListener('hidden.bs.dropdown', bodyEl.__wdgMsgDropdownHiddenHandler, true);
        bodyEl.__wdgMsgDropdownHiddenHandler = null;
      }
      if (bodyEl.__wdgMsgDropdownObserver) {
        try { bodyEl.__wdgMsgDropdownObserver.disconnect(); } catch {}
        bodyEl.__wdgMsgDropdownObserver = null;
      }
      try {
        bodyEl.__wdgMsgUiHoldCount = 0;
        bodyEl.__wdgMsgUiHoldReason = '';
        bodyEl.__wdgMsgDropdownHoldActive = false;
        bodyEl.__wdgMsgDetailHoldActive = false;
      } catch {}
    } catch {
      // best-effort
    }
  }

  function setActiveMenu(view, opts) {
    const menu = qs('#msgMenu');
    if (!menu) return;

    const activeGroupId = String(opts?.groupId || '').trim();

    qsa('[data-view]', menu).forEach(btn => {
      const btnView = btn.getAttribute('data-view') || '';
      const btnGroupId = btn.getAttribute('data-group-id') || '';
      const isGroupsEdit = btn.getAttribute('data-groups-edit') === '1';

      let isActive = btnView === view;
      if (view === 'grupos') {
        if (activeGroupId) {
          isActive = (btnGroupId && btnGroupId === activeGroupId);
        } else {
          isActive = isGroupsEdit;
        }
      }

      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  function initSubmenuAccordion(menu) {
    const host = menu || qs('#msgMenu');
    if (!host) return;
    if (host.__wdgSubmenuAccordionBound) return;
    host.__wdgSubmenuAccordionBound = true;

    const submenus = qsa('.wdg-msg-submenu', host);
    const pairs = submenus
      .map(sm => {
        const toggle = sm.previousElementSibling;
        if (!toggle || !toggle.classList || !toggle.classList.contains('list-group-item')) return null;
        return { toggle, submenu: sm };
      })
      .filter(Boolean);

    // Inicial: recolhido
    pairs.forEach(({ toggle, submenu }, idx) => {
      if (!submenu.id) submenu.id = `wdgSubmenu_${idx + 1}`;
      submenu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', submenu.id);
    });

    function collapseAll(exceptId) {
      pairs.forEach(({ toggle, submenu }) => {
        if (exceptId && submenu.id === exceptId) return;
        submenu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      });
    }

    host.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;
      const clicked = t.closest('.list-group-item');
      if (!clicked) return;

      const next = clicked.nextElementSibling;
      const isToggle = next && next.classList && next.classList.contains('wdg-msg-submenu');
      if (!isToggle) return;

      const willOpen = !!next.hidden;
      if (willOpen) {
        collapseAll(next.id);
        next.hidden = false;
        clicked.setAttribute('aria-expanded', 'true');
      } else {
        next.hidden = true;
        clicked.setAttribute('aria-expanded', 'false');
      }
    });
  }

  async function refreshGroupsMenu() {
    try {
      if (document.body && document.body.__wdgMsgDisablePoll) return;
    } catch { /* noop */ }

    const basePath = getSafePageBasePath(document.body?.dataset?.basePath || '');
    const mailboxId = _currentMailboxId || 'pessoal';
    const submenu = qs('#msgGroupsSubmenu');
    if (!submenu) return;

    const editBtn = qs('[data-groups-edit="1"]', submenu);
    if (!editBtn) return;

    // Permissões: somente caixas de grupo. Em caixas pessoais, continua livre.
    try {
      const mb = getMailboxById(mailboxId);
      const permsEnforced = !!(mb && mailboxPermsEnforced(mb));
      const canManageGroups = !permsEnforced || mailboxCanAdmin(mb) || mailboxHasPerm(mb, PERMISSIONS.gerenciarGrupos);
      if (typeof editBtn.disabled === 'boolean') {
        editBtn.disabled = !canManageGroups;
      }
      if (!canManageGroups) {
        editBtn.setAttribute('aria-disabled', 'true');
        editBtn.title = 'Sem permissão para gerenciar grupos nesta caixa';
        editBtn.style.opacity = '0.55';
        editBtn.style.cursor = 'not-allowed';
      } else {
        editBtn.removeAttribute('aria-disabled');
        if (String(editBtn.title || '').includes('Sem permissão')) editBtn.title = '';
        editBtn.style.opacity = '';
        editBtn.style.cursor = '';
      }
    } catch { /* noop */ }

    let groupsRaw = [];
    try {
      groupsRaw = await syncGroupsForMailbox(basePath, mailboxId, { force: true });
    } catch (e) {
      const st = Number(e && e.status ? e.status : 0);
      if ((st === 401 || st === 403) && String(mailboxId || '').trim() && String(mailboxId || '').trim() !== 'pessoal') {
        // Recuperação: mailbox salva no storage pode não ser acessível para o usuário.
        _currentMailboxId = 'pessoal';
        try { setSelectedMailboxId('pessoal'); } catch {}
        try { void refreshMenu(); } catch {}
        try { setTimeout(() => { try { void refreshGroupsMenu(); } catch {} }, 0); } catch {}
        return;
      }

      if (st === 401 || st === 403) {
        // Se nem a caixa pessoal é acessível, para de tentar atualizar menu/polling.
        try { if (document.body) document.body.__wdgMsgDisablePoll = true; } catch {}
        return;
      }

      groupsRaw = [];
    }
    if (!groupsRaw.length) return;

    // Dedupe defensivo: já dedupamos por id em sanitizeGroups(), mas alguns ambientes
    // podem devolver duplicado com ids diferentes e mesmo nome.
    function mergeMembers(a, b) {
      const left = Array.isArray(a) ? a.filter(Boolean) : [];
      const right = Array.isArray(b) ? b.filter(Boolean) : [];
      if (!right.length) return left;
      const seen = new Set(left.map(m => normalizeMemberKey(m)));
      const out = [...left];
      for (const m of right) {
        const key = normalizeMemberKey(m);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
      }
      return out;
    }

    const byName = new Map();
    for (const g of (Array.isArray(groupsRaw) ? groupsRaw : [])) {
      const name = String(g?.name || '').trim();
      if (!name) continue;
      const key = normalizeText(name);
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, g);
        continue;
      }
      byName.set(key, {
        id: String(prev.id || '').trim() || String(g.id || '').trim(),
        name: prev.name || name,
        members: mergeMembers(prev.members, g.members)
      });
    }

    const groups = Array.from(byName.values());
    if (!groups.length) return;

    const iconSrc = `${basePath}/images/grupo.png`;
    const groupsHtml = groups
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map(g => {
        const count = mailboxMembersCount(g);
        return [
          `<button type="button" class="list-group-item list-group-item-action" data-view="grupos" data-group-item="1" data-group-id="${escapeHtml(g.id)}" aria-current="false">`,
          '  <span class="wdg-msg-item">',
          `    <span class="wdg-msg-ico-wrap"><img class="wdg-msg-ico" src="${escapeHtml(iconSrc)}" alt=""></span>`,
          `    <span class="wdg-msg-label">${escapeHtml(g.name)} (${escapeHtml(String(count))})</span>`,
          '  </span>',
          '  <span class="wdg-msg-caret" aria-hidden="true"></span>',
          '</button>'
        ].join('');
      })
      .join('');

    // Rebuild idempotente: evita duplicar mesmo com múltiplas chamadas.
    const keepHidden = submenu.hidden;
    const editHtml = editBtn.outerHTML;
    submenu.innerHTML = `${groupsHtml}${editHtml}`;
    submenu.hidden = keepHidden;
  }

  function renderGrupos(bodyEl) {
    const basePath = getSafePageBasePath(document.body?.dataset?.basePath || '');
    const mailboxId = _currentMailboxId || 'pessoal';
    const ctx = getCtx();

    const mb = getMailboxById(mailboxId);
    // Gerenciar grupos é ação administrativa: não aplica exceção de caixa pública do Portal.
    const permsEnforced = !!(mb && mailboxPermsEnforced(mb));
    const canManageGroups = !permsEnforced || mailboxCanAdmin(mb) || mailboxHasPerm(mb, PERMISSIONS.gerenciarGrupos);

    let groupsCache = [];

    bodyEl.innerHTML = [
      '<div class="wdg-grp">',
      '  <div class="wdg-grp-toolbar" style="display:flex;align-items:center;gap:.5rem;flex-wrap:nowrap">',
      '    <input type="search" class="form-control" id="grpSearch" placeholder="Pesquisar grupo" aria-label="Pesquisar grupo" autocomplete="off" style="flex:1 1 auto;min-width:0;width:auto">',
      `    <button type="button" class="wdg-grp-btnplus" id="grpAddBtn" aria-label="Criar novo grupo" title="Adicionar" ${canManageGroups ? '' : 'disabled aria-disabled="true"'} style="background:transparent;border:0;padding:0;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;line-height:1;${canManageGroups ? '' : 'opacity:.45;cursor:not-allowed;'}"><img class="wdg-grp-btn-ico" src="${escapeHtml(basePath)}/images/adicionar.png" alt="" aria-hidden="true" style="width:18px;height:18px;max-width:18px;max-height:18px;display:block;object-fit:contain"><span class="visually-hidden">Adicionar</span></button>`,
      '    <div class="wdg-grp-import" id="grpImportWrap" style="display:inline-flex;align-items:center">',
      `      <button type="button" id="grpImportBtn" aria-label="Importar" title="Importar" ${canManageGroups ? '' : 'disabled aria-disabled="true"'} style="background:transparent;border:0;padding:0;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;line-height:1;${canManageGroups ? '' : 'opacity:.45;cursor:not-allowed;'}"><img class="wdg-grp-btn-ico" src="${escapeHtml(basePath)}/images/importar.png" alt="" aria-hidden="true" style="width:18px;height:18px;max-width:18px;max-height:18px;display:block;object-fit:contain"><span class="visually-hidden">Importar</span></button>`,
      '      <div class="wdg-grp-import-menu" id="grpImportMenu" hidden></div>',
      '    </div>',
      '  </div>',
      ...(canManageGroups ? [] : [
        '  <div class="text-muted small mt-2">Você não tem permissão para gerenciar grupos nesta caixa.</div>'
      ]),
      '  <div class="wdg-grp-create" id="grpCreate" hidden>',
      '    <div class="row g-2 align-items-end">',
      '      <div class="col-12 col-lg-6">',
      '        <label class="form-label" for="grpNewName">Nome do grupo</label>',
      '        <input class="form-control" id="grpNewName" type="text" maxlength="80" autocomplete="off">',
      '      </div>',
      '      <div class="col-12 col-lg-6">',
      '        <div class="d-flex gap-2">',
      '          <button type="button" class="btn btn-primary" id="grpCreateConfirm">Incluir</button>',
      '          <button type="button" class="btn btn-outline-secondary" id="grpCreateCancel">Cancelar</button>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div id="grpList"></div>',
      '</div>'
    ].join('\n');

    const listEl = qs('#grpList', bodyEl);
    const searchEl = qs('#grpSearch', bodyEl);
    const createEl = qs('#grpCreate', bodyEl);
    const newNameEl = qs('#grpNewName', bodyEl);
    const importMenuEl = qs('#grpImportMenu', bodyEl);
    const importWrapEl = qs('#grpImportWrap', bodyEl);

    function currentGroups() {
      return Array.isArray(groupsCache) ? groupsCache : [];
    }

    async function loadGroups() {
      const list = await syncGroupsForMailbox(basePath, mailboxId, { force: true }).catch(() => []);
      groupsCache = Array.isArray(list) ? list : [];
      return groupsCache;
    }

    function renderList() {
      if (!listEl) return;
      const q = normalizeText(searchEl?.value || '').trim();
      const groups = currentGroups();

      const filtered = q
        ? groups.filter(g => {
          if (normalizeText(g.name).includes(q)) return true;
          return (g.members || []).some(m => normalizeText(`${m.nome} ${m.email}`).includes(q));
        })
        : groups;

      if (!filtered.length) {
        listEl.innerHTML = '<div class="wdg-msg-empty">Nenhum grupo.</div>';
        return;
      }

      listEl.innerHTML = filtered.map(g => {
        const members = Array.isArray(g.members) ? g.members : [];
        const chips = members.map(m => {
          const type = String(m.type || '').trim().toLowerCase();
          const key = escapeHtml(normalizeMemberKey(m));
          const label = (type === 'mailbox')
            ? (String(m.name || '').trim())
            : (String(m.nome || '').trim() || String(m.email || '').trim());

          const fotoUrl = (type === 'mailbox')
            ? `${basePath}/images/caixas.png`
            : (m.fotoUrl ? m.fotoUrl : resolveUserPhotoUrl(m, basePath, String(m.ownerKey || m.owner_key || m.email || '').trim()));

          return [
            `<span class="wdg-grp-member" data-member="${key}">`,
            `  <img src="${escapeHtml(fotoUrl)}" alt="">`,
            `  <span class="wdg-grp-member-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`,
            ...(canManageGroups ? [`  <button type="button" class="wdg-grp-member-remove" data-grp-remove-member="1" data-group-id="${escapeHtml(g.id)}" data-member-key="${key}" aria-label="Remover">×</button>`] : []),
            '</span>'
          ].join('');
        }).join('');

        return [
          `<div class="wdg-grp-card" data-group-card="1" data-group-id="${escapeHtml(g.id)}">`,
          `  <div class="wdg-grp-card-title">${escapeHtml(g.name)}</div>`,
          '  <div class="wdg-grp-members">',
          chips,
          ...(canManageGroups ? [`    <div class="wdg-grp-adder" data-grp-adder="1" data-group-id="${escapeHtml(g.id)}">${buildRecipientPickCompactHtml()}</div>`] : []),
          '  </div>',
          '</div>'
        ].join('\n');
      }).join('\n');

      // Bind do seletor de usuários dentro dos grupos
      bindUserPickers(listEl, basePath);
      qsa('[data-userpick="1"]', listEl).forEach(p => {
        if (p.__wdgGroupsPickBound) return;
        p.__wdgGroupsPickBound = true;
        p.addEventListener('wdg:userpick', (ev) => {
          if (!canManageGroups) {
            ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarGrupos, 'Sem permissão para gerenciar grupos nesta caixa.');
            return;
          }
          const value = ev?.detail?.value || '';
          const groupId = p.closest('[data-grp-adder="1"]')?.getAttribute('data-group-id') || '';
          if (!groupId || !value) return;

          (async () => {
            const groups = currentGroups();
            const idx = groups.findIndex(x => x.id === groupId);
            if (idx < 0) return;

            const raw = String(value || '').trim();
            let member = null;

            const d = (ev && ev.detail && typeof ev.detail === 'object') ? ev.detail : null;
            const pickedOwnerKey = String(d?.ownerKey || '').trim();
            const pickedOrigem = String(d?.origem || '').trim();
            const pickedHabitacaoId = String(d?.habitacao_id || '').trim();
            const pickedSuffix = String(d?.suffix || '').trim();
            const pickedNome = String(d?.nome || '').trim();
            const pickedEmail = String(d?.email || '').trim();
            const pickedFotoUrl = String(d?.fotoUrl || '').trim();

            if (raw.startsWith('mailbox:')) {
              const mailboxId = raw.slice('mailbox:'.length).trim();
              const box = buildAllMailboxesForRecipients(ctx).find(b => b.id === mailboxId);
              if (!box) return;
              member = { type: 'mailbox', mailboxId: box.id, name: box.name };
            } else {
              // Preferir meta do picker (evita inconsistência e evita fetch desnecessário)
              if (raw.toLowerCase().startsWith('userkey:')) {
                const ownerKeyRaw = raw.slice('userkey:'.length).trim();
                const ownerKeyLower = ownerKeyRaw.toLowerCase();
                const baseEmail = (ownerKeyLower.split('::')[0] || '').trim();
                const email = pickedEmail || (baseEmail.includes('@') ? baseEmail : '');
                member = {
                  type: 'user',
                  nome: pickedNome || '',
                  email,
                  fotoUrl: pickedFotoUrl || '',
                  ownerKey: ownerKeyRaw || pickedOwnerKey,
                  origem: pickedOrigem || '',
                  habitacao_id: pickedHabitacaoId || '',
                  suffix: pickedSuffix || ''
                };
              } else {
                const token = raw.startsWith('user:') ? raw.slice('user:'.length).trim() : raw;
                if (pickedEmail || pickedNome || pickedOwnerKey || pickedFotoUrl) {
                  member = {
                    type: 'user',
                    nome: pickedNome || (token.includes('@') ? '' : token),
                    email: pickedEmail || (token.includes('@') ? token : ''),
                    fotoUrl: pickedFotoUrl || '',
                    ownerKey: pickedOwnerKey || '',
                    origem: pickedOrigem || '',
                    habitacao_id: pickedHabitacaoId || '',
                    suffix: pickedSuffix || ''
                  };
                } else {
                  const all = await fetchUsuariosList(basePath);
                  const vNorm = String(token || '').trim().toLowerCase();
                  const found = all.find(u => String(u.email || '').trim().toLowerCase() === vNorm)
                    || all.find(u => String(u.nome || '').trim().toLowerCase() === vNorm)
                    || null;
                  member = found
                    ? { type: 'user', nome: found.nome || '', email: found.email || '', fotoUrl: found.fotoUrl || '' }
                    : { type: 'user', nome: String(token || '').trim(), email: '', fotoUrl: '' };
                }
              }
            }

            const key = normalizeMemberKey(member);
            const members = Array.isArray(groups[idx].members) ? groups[idx].members : [];
            if (members.some(m => normalizeMemberKey(m) === key)) {
              // já existe
              const input = p.querySelector('input[data-op-user]');
              if (input) input.value = '';
              return;
            }

            const nextMembers = [...members, member];

            // Se for um grupo legado/local (id timestamp), cria no servidor e troca o id.
            const maybeCreated = await ensureGroupOnServer(basePath, mailboxId, groupId, groups[idx].name, nextMembers);
            if (maybeCreated && maybeCreated.id) {
              const next = groups.map(g => g.id === groupId
                ? { ...g, id: maybeCreated.id, name: maybeCreated.name || g.name, members: maybeCreated.members || nextMembers }
                : g);
              groupsCache = next;
              saveGroupsForMailbox(mailboxId, next);
              GROUP_SYNC.byMailbox.set(String(mailboxId), { at: Date.now(), list: next });
              void refreshGroupsMenu();

              const input = p.querySelector('input[data-op-user]');
              if (input) {
                input.value = '';
                input.size = 1;
              }
              renderList();
              return;
            }

            const updated = await apiPatchGroup(basePath, groupId, { members: nextMembers });
            if (updated) {
              groupsCache = groups.map(g => g.id === groupId ? { ...g, members: sanitizeGroups([updated])[0]?.members || nextMembers } : g);
              GROUP_SYNC.byMailbox.set(String(mailboxId), { at: Date.now(), list: groupsCache });
              // Cache local espelha o servidor
              try { saveGroupsForMailbox(mailboxId, groupsCache); } catch {}
            } else {
              try {
                bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-danger" role="alert">Falha ao salvar grupo no servidor.</div>');
              } catch {}
            }

            void refreshGroupsMenu();

            const input = p.querySelector('input[data-op-user]');
            if (input) {
              input.value = '';
              input.size = 1;
            }
            renderList();
          })();
        });
      });
    }

    async function openImportMenu() {
      if (!importMenuEl) return;
      const allBoxes = buildAllMailboxesForRecipients(ctx);
      const other = allBoxes.filter(b => b.id && b.id !== mailboxId);
      const items = [];

      for (const b of other.slice(0, 40)) {
        const gs = await syncGroupsForMailbox(basePath, b.id, { force: true }).catch(() => loadGroupsForMailbox(b.id));
        (gs || []).forEach(g => {
          items.push({ fromId: b.id, fromName: b.name, groupId: g.id, groupName: g.name });
        });
      }

      if (!items.length) {
        importMenuEl.innerHTML = '<div class="wdg-grp-import-empty">Nenhum grupo para importar.</div>';
      } else {
        importMenuEl.innerHTML = items.map(it => {
          return [
            `<button type="button" class="wdg-grp-import-item" data-grp-import="1" data-from-id="${escapeHtml(it.fromId)}" data-group-id="${escapeHtml(it.groupId)}">`,
            `  <span class="wdg-grp-import-title">${escapeHtml(it.groupName)}</span>`,
            `  <span class="wdg-grp-import-sub">${escapeHtml(it.fromName)}</span>`,
            '</button>'
          ].join('');
        }).join('');
      }

      importMenuEl.hidden = false;
    }

    function closeImportMenu() {
      if (!importMenuEl) return;
      importMenuEl.hidden = true;
    }

    // Eventos (delegação dentro do bodyEl)
    if (!bodyEl.__wdgGroupsBound) {
      bodyEl.__wdgGroupsBound = true;

      bodyEl.addEventListener('click', (ev) => {
        const t = ev.target;
        if (!t) return;

        const addBtn = t.closest && t.closest('#grpAddBtn');
        if (addBtn) {
          if (addBtn.disabled) return;
          if (!canManageGroups) {
            ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarGrupos, 'Sem permissão para gerenciar grupos nesta caixa.');
            return;
          }
          if (createEl) createEl.hidden = false;
          if (newNameEl) { newNameEl.value = ''; newNameEl.focus(); }
          return;
        }

        const cancelBtn = t.closest && t.closest('#grpCreateCancel');
        if (cancelBtn) {
          if (createEl) createEl.hidden = true;
          if (newNameEl) newNameEl.value = '';
          return;
        }

        const confirmBtn = t.closest && t.closest('#grpCreateConfirm');
        if (confirmBtn) {
          if (!canManageGroups) {
            ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarGrupos, 'Sem permissão para gerenciar grupos nesta caixa.');
            return;
          }
          const name = String(newNameEl?.value || '').trim();
          if (!name) return;

          (async () => {
            const created = await apiCreateGroup(basePath, { mailboxId, name });
            if (created) {
              const safe = sanitizeGroups([created])[0] || { id: created.id, name: created.name, members: created.members || [] };
              groupsCache = [safe, ...currentGroups()];
              GROUP_SYNC.byMailbox.set(String(mailboxId), { at: Date.now(), list: groupsCache });
              try { saveGroupsForMailbox(mailboxId, groupsCache); } catch {}
            } else {
              try {
                bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-danger" role="alert">Falha ao criar grupo no servidor.</div>');
              } catch {}
              return;
            }

            if (createEl) createEl.hidden = true;
            if (newNameEl) newNameEl.value = '';
            void refreshGroupsMenu();
            renderList();
          })();
          return;
        }

        const rmBtn = t.closest && t.closest('[data-grp-remove-member="1"]');
        if (rmBtn) {
          if (!canManageGroups) {
            ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarGrupos, 'Sem permissão para gerenciar grupos nesta caixa.');
            return;
          }
          const groupId = rmBtn.getAttribute('data-group-id') || '';
          const memberKey = rmBtn.getAttribute('data-member-key') || '';
          const groups = currentGroups();
          const idx = groups.findIndex(g => g.id === groupId);
          if (idx < 0) return;
          const nextMembers = (groups[idx].members || []).filter(m => normalizeMemberKey(m) !== memberKey);

          (async () => {
            const maybeCreated = await ensureGroupOnServer(basePath, mailboxId, groupId, groups[idx].name, nextMembers);
            if (maybeCreated && maybeCreated.id) {
              const next = groups.map(g => g.id === groupId
                ? { ...g, id: maybeCreated.id, name: maybeCreated.name || g.name, members: maybeCreated.members || nextMembers }
                : g);
              groupsCache = next;
              saveGroupsForMailbox(mailboxId, next);
              GROUP_SYNC.byMailbox.set(String(mailboxId), { at: Date.now(), list: next });
              void refreshGroupsMenu();
              renderList();
              return;
            }

            const updated = await apiPatchGroup(basePath, groupId, { members: nextMembers });
            if (updated) {
              groupsCache = groups.map(g => g.id === groupId ? { ...g, members: sanitizeGroups([updated])[0]?.members || nextMembers } : g);
              GROUP_SYNC.byMailbox.set(String(mailboxId), { at: Date.now(), list: groupsCache });
              try { saveGroupsForMailbox(mailboxId, groupsCache); } catch {}
            } else {
              try {
                bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-danger" role="alert">Falha ao salvar grupo no servidor.</div>');
              } catch {}
            }
            void refreshGroupsMenu();
            renderList();
          })();
          return;
        }

        const importBtn = t.closest && t.closest('#grpImportBtn');
        if (importBtn) {
          if (importBtn.disabled) return;
          if (!canManageGroups) {
            ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarGrupos, 'Sem permissão para gerenciar grupos nesta caixa.');
            return;
          }
          if (importMenuEl?.hidden) void openImportMenu(); else closeImportMenu();
          return;
        }

        const importItem = t.closest && t.closest('[data-grp-import="1"]');
        if (importItem) {
          if (!canManageGroups) {
            ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.gerenciarGrupos, 'Sem permissão para gerenciar grupos nesta caixa.');
            return;
          }
          const fromId = importItem.getAttribute('data-from-id') || '';
          const groupId = importItem.getAttribute('data-group-id') || '';
          if (!fromId || !groupId) return;

          (async () => {
            const sourceList = await syncGroupsForMailbox(basePath, fromId, { force: true }).catch(() => loadGroupsForMailbox(fromId));
            const source = (sourceList || []).find(g => g.id === groupId);
            if (!source) return;

            const created = await apiCreateGroup(basePath, { mailboxId, name: source.name, members: source.members || [] });
            if (created) {
              const safe = sanitizeGroups([created])[0] || { id: created.id, name: created.name, members: created.members || [] };
              groupsCache = [safe, ...currentGroups()];
              GROUP_SYNC.byMailbox.set(String(mailboxId), { at: Date.now(), list: groupsCache });
              try { saveGroupsForMailbox(mailboxId, groupsCache); } catch {}
            } else {
              try {
                bodyEl.insertAdjacentHTML('afterbegin', '<div class="alert alert-danger" role="alert">Falha ao importar grupo no servidor.</div>');
              } catch {}
              return;
            }

            closeImportMenu();
            void refreshGroupsMenu();
            renderList();
          })();
          return;
        }

        // Clique fora do import
        if (importMenuEl && !importMenuEl.hidden) {
          const insideImport = importWrapEl && (importWrapEl.contains(t));
          if (!insideImport) closeImportMenu();
        }
      });

      bodyEl.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        if (createEl && !createEl.hidden) createEl.hidden = true;
        closeImportMenu();
      });
    }

    if (searchEl && !searchEl.__wdgBound) {
      searchEl.__wdgBound = true;
      searchEl.addEventListener('input', () => renderList());
    }

    (async () => {
      await loadGroups();
      renderList();
    })();
  }

  async function init() {
    const hasMessageShell = !!(
      qs('#msgBody') ||
      qs('#msgMenu') ||
      qs('#msgMailboxSelect') ||
      qs('[data-msg-root]') ||
      qs('[data-wdg-msg-root]')
    );

    if(!hasMessageShell){
      return;
    }

    ensureMsgDropdownOverlayFix();
    ensureMsgMarkerDropdownPortalFix();

    // Suporte a deep-link: /mensagens/nova?mailboxId=...&groupId=...
    // E também: /administracao/caixa-de-mensagem?view=entrada|saida|arquivo|lixeira|nova|grupos|cfg_caixas|cfg_geral
    let qpMailboxId = '';
    let qpGroupId = '';
    let qpView = '';
    try {
      const usp = new URLSearchParams(window.location.search || '');
      qpMailboxId = String(usp.get('mailboxId') || usp.get('mailbox_id') || '').trim();
      qpGroupId = String(usp.get('groupId') || usp.get('group_id') || '').trim();
      qpView = String(usp.get('view') || usp.get('initialView') || usp.get('tela') || '').trim().toLowerCase();
    } catch {
      /* noop */
    }
    if (qpMailboxId) {
      try { setSelectedMailboxId(qpMailboxId); } catch { /* noop */ }
    }

    // Por padrão, iniciar em "Entrada" ao abrir a Caixa de Mensagem.
    // Pode vir via querystring (?view=...) ou via atributo no <body>.
    // Em reload (F5): restaura a tela anterior (sessionStorage), com regras de segurança.
    const desiredFromBody = String(document.body?.dataset?.initialView || '').trim().toLowerCase();
    const normalizeView = (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (!s) return '';
      if (s === 'caixas') return 'cfg_caixas';
      if (s === 'config' || s === 'configuracao' || s === 'configuração') return 'cfg_caixas';
      if (s === 'geral') return 'cfg_geral';
      return s;
    };
    const desiredFromQs = normalizeView(qpView);

    const isReload = isReloadNavigation();
    const state = tryLoadMsgViewState() || {};
    const desiredFromState = normalizeView(state.view);
    let desired = desiredFromQs || normalizeView(desiredFromBody) || desiredFromState;

    if (isReload) {
      // Regras pedidas:
      // - se estiver em "nova" e atualizar, cai para "entrada".
      // - se estiver em entrada/saida/arquivo/lixeira/grupos/cfg_caixas/cfg_geral, mantém.
      // - qualquer outra, cai para "entrada".
      if (desired === 'nova') desired = 'entrada';

      const allowed = new Set(['entrada', 'saida', 'arquivo', 'lixeira', 'grupos', 'cfg_caixas', 'cfg_geral']);
      if (!allowed.has(desired)) desired = 'entrada';
    }

    const initialView = (desired && VIEWS[desired]) ? desired : 'entrada';
    _currentView = initialView;
    try { setSelectedView(initialView); } catch {}

    // Restore seleção no menu de grupos (quando aplicável)
    try {
      if (initialView === 'grupos') {
        _activeGroupMenuId = String(state.groupId || '').trim();
      } else {
        _activeGroupMenuId = '';
      }
    } catch { /* noop */ }

    updateStickyOffset();
    if (!_layoutBound) {
      _layoutBound = true;
      window.addEventListener('resize', () => window.requestAnimationFrame(updateStickyOffset));
      window.addEventListener('scroll', () => window.requestAnimationFrame(updateStickyOffset), { passive: true });
    }

    // Primeiro: usa o que já existe em memória (se houver) para renderizar sem esperar a rede.
    populateMailboxSelect();
    void refreshGroupsMenu();

    setActiveMenu(initialView);
    // Importante (Portal do Morador): aguarda o primeiro render (inclui o 1º fetch da lista)
    // antes de iniciar sync em background. Isso evita corrida onde o sync aborta/re-renderiza
    // e a lista só aparece no refresh automático.
    try {
      await render(initialView);
    } catch {
      // best-effort: se falhar, o polling/eventos podem recuperar.
    }

    // Depois: sincroniza caixas com servidor em background (não bloqueia a UI).
    const basePath = getSafePageBasePath(document.body?.dataset?.basePath || '');

    // Master/Admin: ao trocar a unidade em Configuração > Geral, re-sync para evitar
    // “mistura” de caixas de unidades diferentes no seletor/listas.
    try {
      const ctx = getCtx();
      if (isMasterOrAdmin(ctx?.role) && !document.body.__wdgMsgAdminUnitBound) {
        document.body.__wdgMsgAdminUnitBound = true;
        document.addEventListener('change', (ev) => {
          const t = ev?.target;
          if (!t || !(t instanceof HTMLElement)) return;
          if (t.id !== 'cfgUnidade') return;

          const v = String(t.value || '').trim();
          if (v && looksLikeObjectId(v)) {
            trySaveSelectedAdminUnitIdToStorage(v);
          }

          Promise.all([
            syncMailboxesFromServer(basePath, { force: true }).catch(() => false),
            syncRecipientMailboxesFromServer(basePath, { force: true }).catch(() => false)
          ])
            .finally(() => {
              const prev = String(_currentMailboxId || '');
              populateMailboxSelect();
              void refreshGroupsMenu();
              if (String(_currentMailboxId || '') !== prev) {
                setActiveMenu(String(_currentView || 'entrada'));
                void render(String(_currentView || 'entrada'));
              }
            });
        });
      }
    } catch {
      /* noop */
    }

    Promise.resolve(syncMailboxesFromServer(basePath, { force: true }))
      .catch(() => false)
      .finally(() => {
        const prev = String(_currentMailboxId || '');
        populateMailboxSelect();
        void refreshGroupsMenu();
        // Só re-renderiza se a caixa selecionada mudou após o sync.
        if (String(_currentMailboxId || '') !== prev) {
          setActiveMenu(initialView);
          void render(initialView);
        }
      });

    async function openComposeForGroupId(groupIdRaw, mailboxIdOverride) {
      const groupId = String(groupIdRaw || '').trim();
      if (!groupId) return;
      const basePath = getSafePageBasePath(document.body?.dataset?.basePath || '');
      const mailboxId = String(mailboxIdOverride || _currentMailboxId || 'pessoal').trim() || 'pessoal';

      if (!ensureMailboxPermOrWarn(mailboxId, PERMISSIONS.criarMensagem, 'Sem permissão para criar mensagem nesta caixa.')) {
        return;
      }

      const groups = await syncGroupsForMailbox(basePath, mailboxId, { force: true }).catch(() => []);
      const g = (Array.isArray(groups) ? groups : []).find(x => String(x?.id || '').trim() === groupId) || null;
      const members = Array.isArray(g?.members) ? g.members.filter(Boolean) : [];

      // Se a nova mensagem já estiver aberta, apenas adiciona (merge) no campo ativo.
      if (_currentView === 'nova' && _composeApi && typeof _composeApi.addRecipients === 'function') {
        const target = (_composeActiveRecipientKind === 'cc') ? 'cc' : 'to';
        _composeApi.addRecipients(target, members);
        return;
      }

      _composePrefill = {
        fromMailboxId: mailboxId,
        toRecipients: members,
        ccRecipients: [],
        assunto: '',
        bodyHtml: ''
      };

      _activeGroupMenuId = '';
      setActiveMenu('nova');
      await render('nova');
    }

    // Se veio via link de grupo (Portal do Morador), abre Nova mensagem preenchida.
    // Importante: não depende de existir #msgMenu (no Portal o menu é a sidebar).
    if (qpGroupId) {
      void openComposeForGroupId(qpGroupId, qpMailboxId);
    }

    const menu = qs('#msgMenu');
    if (!menu) {
      // No Portal do Morador não existe #msgMenu; o restante da UI já foi iniciado acima.
      // Mantemos apenas o fluxo de deep-link (feito acima) e seguimos sem bind de menu interno.
      return;
    }

    initSubmenuAccordion(menu);

    menu.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('[data-view]') : null;
      if (!btn) return;

      const view = btn.getAttribute('data-view') || 'entrada';

      // "Configuração" é apenas um menu principal (sem página).
      // Mantém o comportamento do accordion (se houver submenu), mas não navega.
      if (view === 'configuracao') return;

      // Grupo específico (submenu): abre Nova mensagem com Para preenchido.
      if (view === 'grupos' && btn.getAttribute('data-group-item') === '1') {
        const groupId = btn.getAttribute('data-group-id') || '';
        void openComposeForGroupId(groupId);
        return;
      }

      if (view === 'grupos') {
        const isEdit = btn.getAttribute('data-groups-edit') === '1';
        _activeGroupMenuId = isEdit ? '' : (btn.getAttribute('data-group-id') || '');
        setActiveMenu('grupos', { groupId: _activeGroupMenuId });
      } else {
        _activeGroupMenuId = '';
        setActiveMenu(view);
      }
      void render(view);
    });

    // Inicial (menu ativo imediatamente; render já foi disparado acima)
    setActiveMenu(String(_currentView || 'entrada'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void init(); });
  } else {
    void init();
  }
})();
