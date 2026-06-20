(() => {
  const $ = (sel) => document.querySelector(sel);

  function initMsgCfgGeral(opts = {}){
    const basePath = document.body?.dataset?.basePath || '/condominios';
    let canAdminDeleteMailbox = false;

    const ADMIN_UNIT_LS_PREFIX = 'wdg_msg_adminUnitId::';

    function tryGetBasePathForStorage(){
      try {
        const bp = String(basePath || '').trim().replace(/\/$/, '');
        return bp || '/condominios';
      } catch {
        return '/condominios';
      }
    }

    function tryLoadSelectedAdminUnitIdFromStorage(){
      try {
        const bp = tryGetBasePathForStorage();
        const key = ADMIN_UNIT_LS_PREFIX + bp;
        return String(window.localStorage?.getItem(key) || '').trim();
      } catch {
        return '';
      }
    }

    function trySaveSelectedAdminUnitIdToStorage(unitId){
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

    function readJsonDataAttr(name){
      try {
        const raw = document.body?.dataset?.[name];
        if (!raw) return null;
        return JSON.parse(decodeURIComponent(String(raw)));
      } catch {
        return null;
      }
    }

    function getBootUser(){
      try {
        const ds = document.body?.dataset || {};
        const role = String(ds.userRole || ds.role || '').trim();
        const unidadeId = String(ds.userUnitId || ds.userUnit || ds.unidadeId || '').trim();
        const unidadeNome = String(ds.userUnitName || ds.userUnitNome || ds.unidadeNome || '').trim();
        return {
          nome: String(ds.userName || ds.nome || '').trim(),
          email: String(ds.userEmail || ds.email || '').trim(),
          role,
          unidade_id: unidadeId,
          unidade_nome: unidadeNome,
          unidadeId,
          unidadeNome
        };
      } catch {
        return {};
      }
    }

    function isMasterOrAdmin(userOrRole){
      try {
        if (!userOrRole) return false;
        if (typeof userOrRole === 'object') {
          if (userOrRole.isMaster === true) return true;
          if (userOrRole.isAdmin === true) return true;
          const r0 = String(userOrRole.role || userOrRole.perfil || '').trim().toLowerCase();
          return r0 === 'master' || r0 === 'admin';
        }
        const r = String(userOrRole || '').trim().toLowerCase();
        return r === 'master' || r === 'admin';
      } catch {
        return false;
      }
    }

    function isDiretor(userOrRole){
      try {
        if (!userOrRole) return false;
        if (typeof userOrRole === 'object') {
          const r0 = String(userOrRole.role || userOrRole.perfil || '').trim().toLowerCase();
          return r0 === 'diretor' || r0 === 'director';
        }
        const r = String(userOrRole || '').trim().toLowerCase();
        return r === 'diretor' || r === 'director';
      } catch {
        return false;
      }
    }

    const els = {
      unidade: $('#cfgUnidade'),
      from: $('#cfgFrom'),
      to: $('#cfgTo'),

      kpiUsersSent: $('#kpiUsersSent'),
      kpiUsersSentBytes: $('#kpiUsersSentBytes'),
      kpiUsersReceived: $('#kpiUsersReceived'),
      kpiUsersReceivedBytes: $('#kpiUsersReceivedBytes'),
      kpiUsersChart: $('#kpiUsersChart'),

      kpiMailboxesSent: $('#kpiMailboxesSent'),
      kpiMailboxesSentBytes: $('#kpiMailboxesSentBytes'),
      kpiMailboxesReceived: $('#kpiMailboxesReceived'),
      kpiMailboxesReceivedBytes: $('#kpiMailboxesReceivedBytes'),
      kpiMailboxesChart: $('#kpiMailboxesChart'),

      suspPessoais: $('#cfgSuspPessoais'),
    suspGrupos: $('#cfgSuspGrupos'),
    allowP2P: $('#cfgAllowP2P'),

    loadUsers: $('#cfgLoadUsers'),
    usersClearView: $('#cfgUsersClearView'),
    usersCount: $('#cfgUsersCount'),
    usersBulkActions: $('#cfgUsersBulkActions'),
    usersSearch: $('#cfgUsersSearch'),
    usersFilter: $('#cfgUsersFilter'),
    usersPageSize: $('#cfgUsersPageSize'),
    usersPrev: $('#cfgUsersPrev'),
    usersNext: $('#cfgUsersNext'),
    usersPageInfo: $('#cfgUsersPageInfo'),
    usersCheckAll: $('#cfgUsersCheckAll'),
    usersHead: $('#cfgUsersHead'),
    usersTable: $('#cfgUsersTable'),

    save: $('#cfgSave'),
    refreshAll: $('#cfgRefreshAll'),

    reloadMailboxes: $('#cfgReloadMailboxes'),
    mailboxList: $('#cfgMailboxList'),
    mailboxCount: $('#cfgMailboxCount'),
    mailboxSummary: $('#cfgMailboxSummary'),
    mailboxBulkActions: $('#cfgMailboxBulkActions'),
    mailboxPageSize: $('#cfgMailboxPageSize'),
    mailboxPrev: $('#cfgMailboxPrev'),
    mailboxNext: $('#cfgMailboxNext'),
    mailboxPageInfo: $('#cfgMailboxPageInfo'),
    mailboxCheckAll: $('#cfgMailboxCheckAll'),
    mailboxHead: $('#cfgMailboxHead'),

    reloadMetrics: $('#cfgReloadMetrics'),
    metricsUsers: $('#metricsUsers'),
    metricsMailboxes: $('#metricsMailboxes'),
    metricsUsersHead: $('#metricsUsersHead'),
    metricsMailboxesHead: $('#metricsMailboxesHead'),
    metricsUsersSummary: $('#metricsUsersSummary'),
    metricsMailboxesSummary: $('#metricsMailboxesSummary'),
    metricsUsersPageSize: $('#metricsUsersPageSize'),
    metricsUsersPrev: $('#metricsUsersPrev'),
    metricsUsersNext: $('#metricsUsersNext'),
    metricsUsersPageInfo: $('#metricsUsersPageInfo'),
    metricsMailboxesPageSize: $('#metricsMailboxesPageSize'),
    metricsMailboxesPrev: $('#metricsMailboxesPrev'),
    metricsMailboxesNext: $('#metricsMailboxesNext'),
    metricsMailboxesPageInfo: $('#metricsMailboxesPageInfo'),

    toastEl: $('#cfgToast'),
    toastBody: $('#cfgToastBody'),
    toastHint: $('#cfgToastHint')
    };

  const toast = (() => {
    try {
      if (!els.toastEl) return null;
      // eslint-disable-next-line no-undef
      return new bootstrap.Toast(els.toastEl, { delay: 4500 });
    } catch {
      return null;
    }
  })();

  function showToast(msg, kind = 'info'){
    try {
      if (!els.toastEl || !els.toastBody) {
        if (kind === 'error') console.error(msg);
        else console.log(msg);
        return;
      }
      els.toastBody.textContent = String(msg || '');
      els.toastHint.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      els.toastEl.classList.remove('text-bg-danger','text-bg-success','text-bg-secondary');
      if (kind === 'error') els.toastEl.classList.add('text-bg-danger');
      else if (kind === 'success') els.toastEl.classList.add('text-bg-success');
      else els.toastEl.classList.add('text-bg-secondary');
      toast && toast.show();
    } catch {
      // noop
    }
  }

    async function fetchJson(url, options = {}){
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    const data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

    async function fetchUnidadesList(){
      const tries = [
        `${basePath}/api/unidades`,
        `/condominios/api/unidades`,
        `/api/unidades`
      ];
      for (const url of tries) {
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

    async function ensureUnidadesOptionsLoaded(options = {}){
      if (!els.unidade) return;

      const bootUser = options?.bootUser || getBootUser();
      const allowList = (options?.allowList !== undefined) ? !!options.allowList : isMasterOrAdmin(bootUser?.role);
      const fixedUnitId = String(options?.fixedUnitId || bootUser?.unidade_id || '').trim();
      const fixedUnitName = String(options?.fixedUnitName || bootUser?.unidade_nome || '').trim();

      // Se não pode listar unidades: mantém apenas a unidade do usuário, travada.
      if (!allowList) {
        try { els.unidade.disabled = true; } catch {}

        if (!fixedUnitId) {
          try { els.unidade.innerHTML = '<option value="">—</option>'; } catch {}
          return;
        }

        // Tenta obter um label amigável sem expor lista.
        let label = fixedUnitName;
        if (!label) {
          try {
            const list = await fetchUnidadesList();
            const rows = Array.isArray(list) ? list : [];
            const u = rows.find(x => String(x && (x._id || x.id) || '').trim() === fixedUnitId);
            if (u) {
              const codigo = String(u && u.codigo || '').trim();
              const nome = String(u && (u.nome || u.razaoSocial || u.nomeFantasia) || '').trim();
              label = `${codigo ? (codigo + ' - ') : ''}${nome || fixedUnitId}`;
            }
          } catch {
            // noop
          }
        }
        if (!label) label = fixedUnitId;

        const safeVal = fixedUnitId.replace(/"/g, '&quot;');
        const safeLabel = label.replace(/</g,'&lt;').replace(/>/g,'&gt;');
        els.unidade.innerHTML = `<option value="${safeVal}">${safeLabel}</option>`;
        try { els.unidade.value = fixedUnitId; } catch {}
        return;
      }

      try { els.unidade.disabled = false; } catch {}

      const hasRealOptions = (() => {
        try {
          const opts = Array.from(els.unidade.options || []);
          const real = opts.filter(o => String(o.value || '').trim()).length;
          return real > 0;
        } catch {
          return false;
        }
      })();
      if (hasRealOptions) return;

      try {
        els.unidade.innerHTML = '<option value="">Carregando…</option>';
      } catch {}

      const list = await fetchUnidadesList();
      const rows = Array.isArray(list) ? list : [];

      if (!rows.length) {
        try {
          els.unidade.innerHTML = '<option value="">—</option>';
        } catch {}
        return;
      }

      const optionsHtml = rows.map(u => {
        const id = String(u && (u._id || u.id) || '').trim();
        if (!id) return '';
        const codigo = String(u && u.codigo || '').trim();
        const nome = String(u && (u.nome || u.razaoSocial || u.nomeFantasia) || '').trim();
        const label = `${codigo ? (codigo + ' - ') : ''}${nome || id}`;
        return `<option value="${id.replace(/"/g,'&quot;')}">${label.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</option>`;
      }).join('');

      els.unidade.innerHTML = optionsHtml || '<option value="">—</option>';
    }

  function toISODate(d){
    const dt = (d instanceof Date) ? d : new Date(d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth()+1).padStart(2,'0');
    const dd = String(dt.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function normalizeEmail(s){
    const v = String(s || '').trim().toLowerCase();
    if (!v) return '';
    if (!v.includes('@')) return '';
    return v;
  }

  function normalizeOwnerKey(s){
    const v = String(s || '').trim().toLowerCase();
    if (!v) return '';
    // ownerKey sempre deve conter a base e-mail (compat com isEmailish do backend).
    if (!v.includes('@')) return '';
    return v;
  }

  function ownerKeyToEmail(ownerKey){
    const k = String(ownerKey || '').trim().toLowerCase();
    if (!k) return '';
    const base = k.split('::')[0] || '';
    return normalizeEmail(base);
  }

  function buildOwnerKeyForUserRow(u){
    const email = normalizeEmail(u?.email);
    if (!email) return '';
    const origem = String(u?.origem || '').trim().toLowerCase() === 'portal' ? 'portal' : 'colaborador';
    if (origem === 'portal') {
      // Caixa pessoal unificada: não fragmentar por habitação nas chaves de suspensão.
      return normalizeOwnerKey(`${email}::portal`);
    }
    return normalizeOwnerKey(`${email}::colab`);
  }

  function normalizeEmailList(list, max = 500){
    const raw = Array.isArray(list) ? list : [];
    const out = [];
    for (const it of raw) {
      if (out.length >= max) break;
      const em = normalizeEmail(it);
      if (!em) continue;
      if (out.includes(em)) continue;
      out.push(em);
    }
    return out;
  }

  function escapeHtml(s){
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function setLoading(tbody, cols){
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${cols}" class="text-muted">Carregando…</td></tr>`;
  }

  function setLoadError(tbody, cols, msg){
    if (!tbody) return;
    const m = String(msg || 'Falha ao carregar').trim();
    tbody.innerHTML = `<tr><td colspan="${cols}" class="text-danger">${escapeHtml(m)}</td></tr>`;
  }

  let currentSettings = null;
  let dirtySuspPortalList = null;
  let dirtySuspColabList = null;
  let dirtyPortalPerms = null;

  let settingsSaveInFlight = null;
  let settingsAutoSaveTimer = null;
  let settingsAutoSaveQueued = false;
  let settingsAutoSaveQueuedOpts = null;
  let lastAutoSaveToastAt = 0;

  function toastThrottled(msg, type, minIntervalMs = 1200) {
    try {
      const now = Date.now();
      if (now - lastAutoSaveToastAt < minIntervalMs) return;
      lastAutoSaveToastAt = now;
      showToast(String(msg || ''), type || 'success');
    } catch { /* noop */ }
  }

  function scheduleAutoSaveSettings(opts = {}) {
    try {
      const delay = Math.max(150, Number(opts.delayMs || 650) || 650);
      const nextOpts = { ...opts };
      if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
      settingsAutoSaveTimer = setTimeout(() => {
        settingsAutoSaveTimer = null;
        triggerAutoSaveSettings(nextOpts);
      }, delay);
    } catch { /* noop */ }
  }

  async function triggerAutoSaveSettings(opts = {}) {
    // Garante 1 save por vez; se acontecerem mudanças enquanto salva, roda mais 1 ao final.
    if (settingsSaveInFlight) {
      settingsAutoSaveQueued = true;
      settingsAutoSaveQueuedOpts = { ...(settingsAutoSaveQueuedOpts || {}), ...(opts || {}) };
      return settingsSaveInFlight;
    }

    const successMsg = String(opts?.successMsg || '').trim();
    const failMsg = String(opts?.failMsg || '').trim();

    settingsSaveInFlight = (async () => {
      const prevText = (els.save && (els.save.__wdgDefaultText || els.save.textContent)) ? String(els.save.__wdgDefaultText || els.save.textContent) : '';
      try {
        if (els.save) {
          if (!els.save.__wdgDefaultText) els.save.__wdgDefaultText = String(els.save.textContent || 'Salvar');
          els.save.disabled = true;
          els.save.textContent = 'Salvando…';
        }

        await saveSettings({ silent: true });
        if (successMsg) toastThrottled(successMsg, 'success');
      } catch (e) {
        toastThrottled(failMsg || e?.message || 'Falha ao salvar.', 'error', 800);
        throw e;
      } finally {
        try {
          if (els.save) {
            els.save.disabled = false;
            els.save.textContent = String(els.save.__wdgDefaultText || prevText || 'Salvar');
          }
        } catch { /* noop */ }

        const shouldRerun = !!settingsAutoSaveQueued;
        const queuedOpts = settingsAutoSaveQueuedOpts;
        settingsAutoSaveQueued = false;
        settingsAutoSaveQueuedOpts = null;
        settingsSaveInFlight = null;
        if (shouldRerun) {
          // roda novamente (uma vez) com o último conjunto de opts.
          try { await triggerAutoSaveSettings(queuedOpts || {}); } catch { /* noop */ }
        }
      }
    })();

    return settingsSaveInFlight;
  }
  let selectedUserKeys = new Set();
  let lastRenderedUserKeys = [];
  let usersByEmail = new Map();
  let usersByOwnerKey = new Map();
  let usersList = [];
  let usersPage = 1;
  let usersPageSize = 50;
  let usersFilter = 'all';
  let usersQuery = '';

  // Ordenação e filtros por coluna (estilo planilha)
  let usersSortKey = 'origem';
  let usersSortDir = 'asc';
  const usersColFilters = {
    // null => tudo selecionado (sem filtro)
    nome: null,
    email: null,
    habitacao: null,
    origem: null,
    status: null
  };
  let usersFilterPanel = null;
  let usersFilterPanelKey = '';

  function normalizePortalPermEntry(p){
    const em = normalizeEmail(p?.email);
    if (!em) return null;
    return {
      email: em,
      permitir_pessoal_para_pessoal: (p?.permitir_pessoal_para_pessoal !== false),
      permitir_pessoal_para_habitacao: (p?.permitir_pessoal_para_habitacao !== false),
      permitir_pessoal_para_colaborador: (p?.permitir_pessoal_para_colaborador !== false)
    };
  }

  function getPortalPerms(email){
    const em = normalizeEmail(email);
    const baseList = Array.isArray(currentSettings?.portal_user_perms) ? currentSettings.portal_user_perms : [];
    const base = baseList.map(normalizePortalPermEntry).filter(Boolean);
    const fromBase = em ? base.find(x => x.email === em) : null;
    const fromDirty = (em && dirtyPortalPerms && dirtyPortalPerms[em]) ? dirtyPortalPerms[em] : null;
    const src = fromDirty || fromBase;
    return {
      permitir_pessoal_para_pessoal: (src?.permitir_pessoal_para_pessoal !== false),
      permitir_pessoal_para_habitacao: (src?.permitir_pessoal_para_habitacao !== false),
      permitir_pessoal_para_colaborador: (src?.permitir_pessoal_para_colaborador !== false)
    };
  }

  function setPortalPerm(email, key, value){
    const em = normalizeEmail(email);
    if (!em) return;
    const current = getPortalPerms(em);
    const next = { ...current, [key]: !!value };
    if (!dirtyPortalPerms) dirtyPortalPerms = Object.create(null);
    dirtyPortalPerms[em] = { email: em, ...next };
  }

  function collectPortalUserPerms(){
    const baseList = Array.isArray(currentSettings?.portal_user_perms) ? currentSettings.portal_user_perms : [];
    const byEmail = new Map();

    for (const p of baseList) {
      const norm = normalizePortalPermEntry(p);
      if (!norm) continue;
      byEmail.set(norm.email, norm);
    }
    if (dirtyPortalPerms) {
      for (const em of Object.keys(dirtyPortalPerms)) {
        const p = dirtyPortalPerms[em];
        const norm = normalizePortalPermEntry(p);
        if (!norm) continue;
        byEmail.set(norm.email, norm);
      }
    }
    return Array.from(byEmail.values()).sort((a, b) => String(a.email).localeCompare(String(b.email)));
  }

  let mailboxesList = [];
  let mailboxesPage = 1;
  let mailboxesPageSize = 50;

  let mailboxesSortKey = 'name';
  let mailboxesSortDir = 'asc';
  const mailboxesColFilters = {
    name: null,
    status: null
  };
  let mailboxesFilterPanel = null;
  let mailboxesFilterPanelKey = '';

  const selectedMailboxIds = new Set();
  let lastRenderedMailboxIds = [];
  let mailboxesById = new Map();

  let metricsUsersList = [];
  let metricsUsersPage = 1;
  let metricsUsersPageSize = 25;
  let metricsUsersSortKey = 'total';
  let metricsUsersSortDir = 'desc';
  const metricsUsersColFilters = {
    user: null
  };
  let metricsUsersFilterPanel = null;
  let metricsUsersFilterPanelKey = '';

  let metricsMailboxesList = [];
  let metricsMailboxesPage = 1;
  let metricsMailboxesPageSize = 25;
  let metricsMailboxesSortKey = 'total';
  let metricsMailboxesSortDir = 'desc';
  const metricsMailboxesColFilters = {
    mailbox: null,
    type: null
  };
  let metricsMailboxesFilterPanel = null;
  let metricsMailboxesFilterPanelKey = '';

  function ensureMetricsFilterPanelBaseStyle() {
    try {
      if (document.body.__wdgMetricsFilterPanelStyle) return;
      document.body.__wdgMetricsFilterPanelStyle = true;
      const st = document.createElement('style');
      st.setAttribute('data-wdg-metrics-filter-style', '1');
      st.textContent = `
        /* Base unificada (Métricas + Configuração Geral) */
        .wdg-filter-panel{
          position: fixed;
          z-index: 9999;
          min-width: 280px;
          max-width: min(420px, 92vw);
          background: rgba(255,255,255,.98);
          border: 1px solid rgba(15,23,42,.12);
          border-radius: 14px;
          box-shadow: 0 18px 45px rgba(2,6,23,.18);
          padding: .75rem;
          color: rgba(15,23,42,.88);
        }
        .wdg-filter-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:.5rem; }
        .wdg-filter-title{ font-size:.82rem; font-weight:600; letter-spacing:.02em; }
        .wdg-filter-actions{ display:flex; gap:.5rem; flex-wrap:wrap; justify-content:flex-end; }
        .wdg-filter-actions .btn{ font-weight:400; }
        .wdg-filter-list{ max-height: 42vh; overflow:auto; border:1px solid rgba(15,23,42,.08); border-radius: 12px; padding:.35rem .5rem; background: rgba(248,250,252,.7); }
        .wdg-filter-opt{ display:flex; align-items:center; gap:.5rem; padding:.25rem .15rem; }
        .wdg-filter-opt .form-check-input{ margin:0; }
        .wdg-filter-opt label{ margin:0; font-size:.88rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wdg-filter-foot{ display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-top:.5rem; }
        .wdg-filter-foot .btn{ min-width: 86px; }

        .wdg-metrics-filter-panel{
          position: fixed;
          z-index: 9999;
          min-width: 280px;
          max-width: min(420px, 92vw);
          background: rgba(255,255,255,.98);
          border: 1px solid rgba(15,23,42,.12);
          border-radius: 14px;
          box-shadow: 0 18px 45px rgba(2,6,23,.18);
          padding: .75rem;
          color: rgba(15,23,42,.88);
        }
        .wdg-metrics-filter-head{ display:flex; align-items:center; justify-content:space-between; gap:.5rem; }
        .wdg-metrics-filter-title{ font-size:.82rem; font-weight:600; letter-spacing:.02em; }
        .wdg-metrics-filter-actions{ display:flex; gap:.5rem; flex-wrap:wrap; }
        .wdg-metrics-filter-actions .btn{ font-weight:400; }
        .wdg-metrics-filter-list{ max-height: 42vh; overflow:auto; border:1px solid rgba(15,23,42,.08); border-radius: 12px; padding:.35rem .5rem; background: rgba(248,250,252,.7); }
        .wdg-metrics-filter-opt{ display:flex; align-items:center; gap:.5rem; padding:.25rem .15rem; }
        .wdg-metrics-filter-opt .form-check-input{ margin:0; }
        .wdg-metrics-filter-opt label{ margin:0; font-size:.88rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      `;
      document.head.appendChild(st);
    } catch {
      /* noop */
    }
  }

  function ensureCfgFilterPanelBaseStyle(){
    // Reaproveita o mesmo style injector das Métricas (inclui .wdg-filter-panel).
    ensureMetricsFilterPanelBaseStyle();
  }

  function positionFilterPanel(panelEl, anchorEl) {
    try {
      const a = anchorEl?.getBoundingClientRect?.();
      const p = panelEl?.getBoundingClientRect?.();
      if (!a || !p) return;
      const margin = 8;
      const align = String(arguments?.[2]?.align || '').trim().toLowerCase();
      const leftBase = (align === 'center')
        ? (a.left + (a.width / 2) - (p.width / 2))
        : a.left;
      let left = Math.max(margin, Math.min(leftBase, window.innerWidth - p.width - margin));
      let top = a.bottom + margin;
      if (top + p.height > window.innerHeight - margin) {
        top = Math.max(margin, a.top - p.height - margin);
      }
      panelEl.style.left = `${Math.round(left)}px`;
      panelEl.style.top = `${Math.round(top)}px`;
    } catch {
      /* noop */
    }
  }

  function buildMetricsUsersFilterOptions(key) {
    const k = String(key || '').trim().toLowerCase();
    if (k !== 'user') return [];
    const set = new Set();
    for (const r of (Array.isArray(metricsUsersList) ? metricsUsersList : [])) {
      const emRaw = String(r?.email || '');
      const em = normalizeEmail(emRaw) || String(emRaw || '').trim();
      if (em) set.add(em);
    }
    return Array.from(set.values()).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' }));
  }

  function isMetricsUsersFilterActive(key) {
    const k = String(key || '').trim().toLowerCase();
    if (!k) return false;
    if (k === 'user') return (metricsUsersColFilters.user instanceof Set);
    return false;
  }

  function closeMetricsUsersFilterPanel() {
    try {
      if (metricsUsersFilterPanel) metricsUsersFilterPanel.remove();
    } catch {}
    metricsUsersFilterPanel = null;
    metricsUsersFilterPanelKey = '';
  }

  function openMetricsUsersFilterPanel(key, anchorEl) {
    const k = String(key || '').trim().toLowerCase();
    if (k !== 'user') return;
    ensureMetricsFilterPanelBaseStyle();
    closeMetricsUsersFilterPanel();

    const opts = buildMetricsUsersFilterOptions(k);
    const current = (metricsUsersColFilters.user instanceof Set) ? new Set(metricsUsersColFilters.user) : null;

    const panel = document.createElement('div');
    panel.className = 'wdg-filter-panel wdg-metrics-filter-panel';
    panel.setAttribute('data-mu-filter-panel', '1');
    panel.setAttribute('data-mu-filter-key', k);
    panel.innerHTML = `
      <div class="wdg-filter-head">
        <div class="wdg-filter-title">Filtro: Usuário</div>
        <div class="wdg-filter-actions">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-mu-filter-markall="${escapeHtml(k)}">Marcar todos</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-mu-filter-unmarkall="${escapeHtml(k)}">Desmarcar</button>
        </div>
      </div>
      <div class="mt-2">
        <input class="form-control form-control-sm" placeholder="Buscar…" data-mu-filter-search="1" />
      </div>
      <div class="wdg-filter-list mt-2" role="listbox">
        ${opts.map(v => {
          const checked = current ? current.has(v) : true;
          return `
            <div class="wdg-filter-opt" data-mu-filter-opt="1" data-mu-filter-label="${escapeHtml(v)}">
              <input class="form-check-input" type="checkbox" data-mu-filter-item="1" data-mu-filter-key="${escapeHtml(k)}" value="${escapeHtml(v)}" ${checked ? 'checked' : ''} />
              <label>${escapeHtml(v)}</label>
            </div>`;
        }).join('')}
      </div>
      <div class="wdg-filter-foot">
        <button type="button" class="btn btn-outline-danger btn-sm" data-mu-filter-clear="${escapeHtml(k)}">Limpar</button>
        <button type="button" class="btn btn-primary btn-sm" data-mu-filter-apply="${escapeHtml(k)}">Aplicar</button>
      </div>
    `;

    document.body.appendChild(panel);
    positionFilterPanel(panel, anchorEl);
    metricsUsersFilterPanel = panel;
    metricsUsersFilterPanelKey = k;
  }

  function applyMetricsUsersFilterPanel(key) {
    const k = String(key || '').trim().toLowerCase();
    if (!metricsUsersFilterPanel) return;
    if (k !== 'user') return;
    const inputs = metricsUsersFilterPanel.querySelectorAll(`input[data-mu-filter-item="1"][data-mu-filter-key="${k}"]`);
    const set = new Set();
    inputs.forEach(i => { if (i.checked) set.add(String(i.value || '').trim()); });
    metricsUsersColFilters.user = set.size ? set : null;
    metricsUsersPage = 1;
    renderMetricsUsersTable();
    closeMetricsUsersFilterPanel();
  }

  function clearMetricsUsersFilter(key) {
    const k = String(key || '').trim().toLowerCase();
    if (k !== 'user') return;
    metricsUsersColFilters.user = null;
    metricsUsersPage = 1;
    renderMetricsUsersTable();
    closeMetricsUsersFilterPanel();
  }

  function renderMetricsUsersHeaderState() {
    const head = els.metricsUsersHead;
    if (!head) return;
    const fbtns = head.querySelectorAll('[data-mu-filter]');
    fbtns.forEach(btn => {
      const k = String(btn.getAttribute('data-mu-filter') || '').trim().toLowerCase();
      const active = isMetricsUsersFilterActive(k);
      btn.classList.toggle('text-primary', active);
      btn.classList.toggle('text-muted', !active);
    });
  }

  function buildMetricsMailboxesFilterOptions(key) {
    const k = String(key || '').trim().toLowerCase();
    const set = new Set();
    for (const r of (Array.isArray(metricsMailboxesList) ? metricsMailboxesList : [])) {
      if (k === 'type') {
        const v = String(r?.mailboxType || '').trim() || '—';
        set.add(v);
      } else if (k === 'mailbox') {
        const v = String(r?.mailboxName || r?.mailboxId || '').trim() || '—';
        set.add(v);
      }
    }
    return Array.from(set.values()).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' }));
  }

  function isMetricsMailboxesFilterActive(key) {
    const k = String(key || '').trim().toLowerCase();
    if (!k) return false;
    if (k === 'type') return (metricsMailboxesColFilters.type instanceof Set);
    if (k === 'mailbox') return (metricsMailboxesColFilters.mailbox instanceof Set);
    return false;
  }

  function closeMetricsMailboxesFilterPanel() {
    try {
      if (metricsMailboxesFilterPanel) metricsMailboxesFilterPanel.remove();
    } catch {}
    metricsMailboxesFilterPanel = null;
    metricsMailboxesFilterPanelKey = '';
  }

  function openMetricsMailboxesFilterPanel(key, anchorEl) {
    const k = String(key || '').trim().toLowerCase();
    if (k !== 'mailbox' && k !== 'type') return;
    ensureMetricsFilterPanelBaseStyle();
    closeMetricsMailboxesFilterPanel();

    const opts = buildMetricsMailboxesFilterOptions(k);
    const current = (k === 'type')
      ? ((metricsMailboxesColFilters.type instanceof Set) ? new Set(metricsMailboxesColFilters.type) : null)
      : ((metricsMailboxesColFilters.mailbox instanceof Set) ? new Set(metricsMailboxesColFilters.mailbox) : null);

    const title = (k === 'type') ? 'Filtro: Tipo' : 'Filtro: Caixa';

    const panel = document.createElement('div');
    panel.className = 'wdg-filter-panel wdg-metrics-filter-panel';
    panel.setAttribute('data-mm-filter-panel', '1');
    panel.setAttribute('data-mm-filter-key', k);
    panel.innerHTML = `
      <div class="wdg-filter-head">
        <div class="wdg-filter-title">${escapeHtml(title)}</div>
        <div class="wdg-filter-actions">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-mm-filter-markall="${escapeHtml(k)}">Marcar todos</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-mm-filter-unmarkall="${escapeHtml(k)}">Desmarcar</button>
        </div>
      </div>
      <div class="mt-2">
        <input class="form-control form-control-sm" placeholder="Buscar…" data-mm-filter-search="1" />
      </div>
      <div class="wdg-filter-list mt-2" role="listbox">
        ${opts.map(v => {
          const checked = current ? current.has(v) : true;
          return `
            <div class="wdg-filter-opt" data-mm-filter-opt="1" data-mm-filter-label="${escapeHtml(v)}">
              <input class="form-check-input" type="checkbox" data-mm-filter-item="1" data-mm-filter-key="${escapeHtml(k)}" value="${escapeHtml(v)}" ${checked ? 'checked' : ''} />
              <label>${escapeHtml(v)}</label>
            </div>`;
        }).join('')}
      </div>
      <div class="wdg-filter-foot">
        <button type="button" class="btn btn-outline-danger btn-sm" data-mm-filter-clear="${escapeHtml(k)}">Limpar</button>
        <button type="button" class="btn btn-primary btn-sm" data-mm-filter-apply="${escapeHtml(k)}">Aplicar</button>
      </div>
    `;

    document.body.appendChild(panel);
    positionFilterPanel(panel, anchorEl);
    metricsMailboxesFilterPanel = panel;
    metricsMailboxesFilterPanelKey = k;
  }

  function applyMetricsMailboxesFilterPanel(key) {
    const k = String(key || '').trim().toLowerCase();
    if (!metricsMailboxesFilterPanel) return;
    if (k !== 'mailbox' && k !== 'type') return;
    const inputs = metricsMailboxesFilterPanel.querySelectorAll(`input[data-mm-filter-item="1"][data-mm-filter-key="${k}"]`);
    const set = new Set();
    inputs.forEach(i => { if (i.checked) set.add(String(i.value || '').trim()); });
    if (k === 'type') metricsMailboxesColFilters.type = set.size ? set : null;
    else metricsMailboxesColFilters.mailbox = set.size ? set : null;
    metricsMailboxesPage = 1;
    renderMetricsMailboxesTable();
    closeMetricsMailboxesFilterPanel();
  }

  function clearMetricsMailboxesFilter(key) {
    const k = String(key || '').trim().toLowerCase();
    if (k === 'type') metricsMailboxesColFilters.type = null;
    else if (k === 'mailbox') metricsMailboxesColFilters.mailbox = null;
    else return;
    metricsMailboxesPage = 1;
    renderMetricsMailboxesTable();
    closeMetricsMailboxesFilterPanel();
  }

  function renderMetricsMailboxesHeaderState() {
    const head = els.metricsMailboxesHead;
    if (!head) return;
    const fbtns = head.querySelectorAll('[data-mm-filter]');
    fbtns.forEach(btn => {
      const k = String(btn.getAttribute('data-mm-filter') || '').trim().toLowerCase();
      const active = isMetricsMailboxesFilterActive(k);
      btn.classList.toggle('text-primary', active);
      btn.classList.toggle('text-muted', !active);
    });
  }

  function getUnidadeId(){
    return String(els.unidade?.value || '').trim();
  }

  function getRange(){
    const from = String(els.from?.value || '').trim();
    const to = String(els.to?.value || '').trim();
    return { from, to };
  }

  function fmtInt(n){
    try { return (Number(n) || 0).toLocaleString('pt-BR'); } catch { return String(Number(n) || 0); }
  }

  function bytesToHuman(bytes){
    const n = Math.max(0, Number(bytes) || 0);
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (!n) return '0 B';
    const p = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const v = n / Math.pow(1024, p);
    const digits = (p === 0) ? 0 : (v >= 10 ? 1 : 2);
    return `${v.toFixed(digits)} ${units[p]}`.replace('.', ',');
  }

  function buildSparklineSVG(points, sentKey, recvKey, opts = {}){
    const list = Array.isArray(points) ? points : [];
    const w = Number(opts.width) || 260;
    const h = Number(opts.height) || 44;
    const uid = `wdgSpark_${Math.random().toString(36).slice(2, 10)}`;
    const padX = 6;
    const padY = 8;
    const innerW = w - padX * 2;
    const innerH = h - padY * 2 - 10;
    const safe = (v) => Math.max(0, Number(v) || 0);

    const valsSent = list.map(p => safe(p?.[sentKey]));
    const valsRecv = list.map(p => safe(p?.[recvKey]));
    const maxY = Math.max(1, ...valsSent, ...valsRecv);

    const xAt = (i) => {
      if (list.length <= 1) return padX;
      return padX + (innerW * (i / (list.length - 1)));
    };
    const yAt = (v) => {
      const y = padY + (innerH * (1 - (safe(v) / maxY)));
      return Math.max(padY, Math.min(padY + innerH, y));
    };

    const buildPath = (arr) => {
      if (!arr.length) return '';
      return arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`).join(' ');
    };

    const pSent = buildPath(valsSent);
    const pRecv = buildPath(valsRecv);

    const firstDate = String(list[0]?.date || '').trim();
    const lastDate = String(list[list.length - 1]?.date || '').trim();
    const fmtDate = (d) => {
      const s = String(d || '').trim();
      if (!s) return '';
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}/${m[2]}` : s;
    };

    return `
      <svg class="wdg-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolução no período">
        <defs>
          <linearGradient id="${uid}_sent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="rgba(13,110,253,.95)" />
            <stop offset="1" stop-color="rgba(13,110,253,.55)" />
          </linearGradient>
          <linearGradient id="${uid}_recv" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="rgba(32,201,151,.95)" />
            <stop offset="1" stop-color="rgba(32,201,151,.55)" />
          </linearGradient>
        </defs>
        <path d="${pSent}" fill="none" stroke="url(#${uid}_sent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="${pRecv}" fill="none" stroke="url(#${uid}_recv)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        <g font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="10" fill="rgba(15,23,42,.62)">
          <text x="${padX}" y="${h - 4}">${fmtDate(firstDate)}</text>
          <text x="${w - padX}" y="${h - 4}" text-anchor="end">${fmtDate(lastDate)}</text>
        </g>
      </svg>
    `.trim();
  }

  function renderSeriesInto(el, title, points){
    if (!el) return;
    const list = Array.isArray(points) ? points : [];
    if (!list.length) {
      el.innerHTML = '<div class="text-muted small">Sem dados no período.</div>';
      return;
    }

    const last = list[list.length - 1] || {};
    const sentC = Number(last?.sentCount) || 0;
    const recvC = Number(last?.receivedCount) || 0;
    const sentB = Number(last?.sentBytes) || 0;
    const recvB = Number(last?.receivedBytes) || 0;

    const chartMsgs = buildSparklineSVG(list, 'sentCount', 'receivedCount', { width: 300, height: 44 });
    const chartBytes = buildSparklineSVG(list, 'sentBytes', 'receivedBytes', { width: 300, height: 44 });

    const msgLabel = `Enviadas ${fmtInt(sentC)} · Recebidas ${fmtInt(recvC)}`;
    const bytesLabel = `Enviadas ${bytesToHuman(sentB)} · Recebidas ${bytesToHuman(recvB)}`;

    el.innerHTML = [
      `<div class="wdg-kpi-sparks" aria-label="${escapeHtml(String(title || ''))}">`,
      `  <div class="wdg-spark-block">`,
      `    <div class="wdg-spark-title">Mensagens</div>`,
      `    ${chartMsgs}`,
      `    <div class="wdg-spark-sub"><span class="wdg-kpi-dot sent"></span>${escapeHtml(msgLabel.split('·')[0].trim())} <span class="ms-2"><span class="wdg-kpi-dot recv"></span>${escapeHtml(msgLabel.split('·')[1].trim())}</span></div>`,
      `  </div>`,
      `  <div class="wdg-spark-block">`,
      `    <div class="wdg-spark-title">Bytes</div>`,
      `    ${chartBytes}`,
      `    <div class="wdg-spark-sub"><span class="wdg-kpi-dot sent"></span>${escapeHtml(bytesLabel.split('·')[0].trim())} <span class="ms-2"><span class="wdg-kpi-dot recv"></span>${escapeHtml(bytesLabel.split('·')[1].trim())}</span></div>`,
      `  </div>`,
      `</div>`
    ].join('');
  }

  function renderKpiTotals(kind, totals){
    const k = String(kind || '').trim().toLowerCase();
    const t = totals && typeof totals === 'object' ? totals : null;
    const sentCount = t ? (t.sentCount || 0) : 0;
    const recvCount = t ? (t.receivedCount || 0) : 0;
    const sentBytesHuman = t ? (t.sentBytesHuman || '0 B') : '0 B';
    const recvBytesHuman = t ? (t.receivedBytesHuman || '0 B') : '0 B';

    if (k === 'users') {
      if (els.kpiUsersSent) els.kpiUsersSent.textContent = t ? fmtInt(sentCount) : '—';
      if (els.kpiUsersReceived) els.kpiUsersReceived.textContent = t ? fmtInt(recvCount) : '—';
      if (els.kpiUsersSentBytes) els.kpiUsersSentBytes.textContent = t ? String(sentBytesHuman) : '—';
      if (els.kpiUsersReceivedBytes) els.kpiUsersReceivedBytes.textContent = t ? String(recvBytesHuman) : '—';
      if (els.kpiUsersChart) {
        els.kpiUsersChart.innerHTML = t ? '<div class="text-muted small">Carregando gráficos…</div>' : '—';
      }
      return;
    }

    if (k === 'mailboxes') {
      if (els.kpiMailboxesSent) els.kpiMailboxesSent.textContent = t ? fmtInt(sentCount) : '—';
      if (els.kpiMailboxesReceived) els.kpiMailboxesReceived.textContent = t ? fmtInt(recvCount) : '—';
      if (els.kpiMailboxesSentBytes) els.kpiMailboxesSentBytes.textContent = t ? String(sentBytesHuman) : '—';
      if (els.kpiMailboxesReceivedBytes) els.kpiMailboxesReceivedBytes.textContent = t ? String(recvBytesHuman) : '—';
      if (els.kpiMailboxesChart) {
        els.kpiMailboxesChart.innerHTML = t ? '<div class="text-muted small">Carregando gráficos…</div>' : '—';
      }
    }
  }

  function renderAccessDenied(reason){
    const msg = String(reason || 'Acesso negado.').trim() || 'Acesso negado.';
    try { setLoadError(els.usersTable, 8, msg); } catch { /* noop */ }
    try { setLoadError(els.mailboxList, 4, msg); } catch { /* noop */ }
    try { setLoadError(els.metricsUsers, 5, msg); } catch { /* noop */ }
    try { setLoadError(els.metricsMailboxes, 6, msg); } catch { /* noop */ }
    try { if (els.metricsUsersSummary) els.metricsUsersSummary.textContent = ''; } catch { /* noop */ }
    try { if (els.metricsMailboxesSummary) els.metricsMailboxesSummary.textContent = ''; } catch { /* noop */ }
    try { if (els.usersCount) els.usersCount.textContent = msg; } catch { /* noop */ }

    try {
      renderKpiTotals('users', null);
      renderKpiTotals('mailboxes', null);
    } catch { /* noop */ }

    try { if (els.kpiUsersChart) els.kpiUsersChart.innerHTML = `<div class="text-danger small">${escapeHtml(msg)}</div>`; } catch { /* noop */ }
    try { if (els.kpiMailboxesChart) els.kpiMailboxesChart.innerHTML = `<div class="text-danger small">${escapeHtml(msg)}</div>`; } catch { /* noop */ }

    // Desabilita ações que dependem de endpoints admin
    try { if (els.save) els.save.disabled = true; } catch { /* noop */ }
    try { if (els.refreshAll) els.refreshAll.disabled = true; } catch { /* noop */ }
    try { if (els.reloadMailboxes) els.reloadMailboxes.disabled = true; } catch { /* noop */ }
    try { if (els.reloadMetrics) els.reloadMetrics.disabled = true; } catch { /* noop */ }
  }

  async function loadKpiUsersSeries(){
    try {
      const unidadeId = getUnidadeId();
      if (!unidadeId) return;
      const { from, to } = getRange();
      const q = new URLSearchParams({ unidade_id: unidadeId });
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      const data = await fetchJson(`${basePath}/api/msg/admin/metrics/timeseries/users?${q.toString()}`);
      const points = Array.isArray(data?.points) ? data.points : [];
      renderSeriesInto(els.kpiUsersChart, 'users', points, 'users');
    } catch (e) {
      if (els.kpiUsersChart) {
        const msg = String(e?.message || 'Falha ao carregar gráficos').trim();
        els.kpiUsersChart.innerHTML = `<div class="text-danger small">${escapeHtml(msg)}</div>`;
      }
    }
  }

  async function loadKpiMailboxesSeries(){
    try {
      const unidadeId = getUnidadeId();
      if (!unidadeId) return;
      const { from, to } = getRange();
      const q = new URLSearchParams({ unidade_id: unidadeId });
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      const data = await fetchJson(`${basePath}/api/msg/admin/metrics/timeseries/mailboxes?${q.toString()}`);
      const points = Array.isArray(data?.points) ? data.points : [];
      renderSeriesInto(els.kpiMailboxesChart, 'mailboxes', points, 'mailboxes');
    } catch (e) {
      if (els.kpiMailboxesChart) {
        const msg = String(e?.message || 'Falha ao carregar gráficos').trim();
        els.kpiMailboxesChart.innerHTML = `<div class="text-danger small">${escapeHtml(msg)}</div>`;
      }
    }
  }

  function collectSuspendedPortal(){
    const list = dirtySuspPortalList ?? (currentSettings?.pessoais_suspensas_portal || currentSettings?.pessoais_suspensas || []);
    return Array.isArray(list) ? list.slice() : [];
  }

  function collectSuspendedColab(){
    const list = dirtySuspColabList ?? (currentSettings?.pessoais_suspensas_colaborador || currentSettings?.pessoais_suspensas || []);
    return Array.isArray(list) ? list.slice() : [];
  }

  function getSuspendedPortalSet(){
    const list = Array.isArray(collectSuspendedPortal()) ? collectSuspendedPortal() : [];
    const scoped = new Set();
    const legacyEmails = new Set();
    for (const it of list) {
      const raw = String(it || '').trim().toLowerCase();
      if (!raw) continue;
      if (raw.includes('::')) {
        const k = normalizeOwnerKey(raw);
        if (k) scoped.add(k);
      } else {
        const em = normalizeEmail(raw);
        if (em) legacyEmails.add(em);
      }
    }
    return { scoped, legacyEmails };
  }

  function getSuspendedColabSet(){
    const list = Array.isArray(collectSuspendedColab()) ? collectSuspendedColab() : [];
    const scoped = new Set();
    const legacyEmails = new Set();
    for (const it of list) {
      const raw = String(it || '').trim().toLowerCase();
      if (!raw) continue;
      if (raw.includes('::')) {
        const k = normalizeOwnerKey(raw);
        if (k) scoped.add(k);
      } else {
        const em = normalizeEmail(raw);
        if (em) legacyEmails.add(em);
      }
    }
    return { scoped, legacyEmails };
  }

  function isSuspendedOwnerKey(ownerKey, origem){
    const ok = normalizeOwnerKey(ownerKey);
    if (!ok) return false;
    const email = ownerKeyToEmail(ok);
    const isPortal = String(origem || '').trim().toLowerCase() === 'portal';
    const sets = isPortal ? getSuspendedPortalSet() : getSuspendedColabSet();
    if (sets.scoped && sets.scoped.has(ok)) return true;
    if (email && sets.legacyEmails && sets.legacyEmails.has(email)) return true;
    return false;
  }

  function computeUsersMeta(list, suspendedPortalSet, suspendedColabSet){
    const meta = { total: 0, portal: 0, colaborador: 0, suspensos: 0 };
    const arr = Array.isArray(list) ? list : [];
    meta.total = arr.length;
    for (const u of arr) {
      const origem = String(u?.origem || '').trim().toLowerCase() === 'portal' ? 'portal' : 'colaborador';
      if (origem === 'portal') meta.portal++;
      else meta.colaborador++;
      const ownerKey = normalizeOwnerKey(u?.ownerKey || '') || buildOwnerKeyForUserRow(u);
      if (ownerKey && isSuspendedOwnerKey(ownerKey, origem)) meta.suspensos++;
    }
    return meta;
  }

  function updateUsersCount(meta, shown, totalFiltered){
    if (!els.usersCount) return;
    const m = meta || { total: 0, portal: 0, colaborador: 0, suspensos: 0 };
    const shownN = Number(shown) || 0;
    const totalN = Number(totalFiltered) || 0;
    els.usersCount.textContent = `Exibindo ${shownN}/${totalN} usuários - Colaboradores: ${Number(m.colaborador || 0)} - Portal: ${Number(m.portal || 0)} - Suspensos: ${Number(m.suspensos || 0)}`;
  }

  function getUsersQuery(){
    try { return String(els.usersSearch?.value || '').trim().toLowerCase(); } catch { return ''; }
  }

  function isUsersFilterActive(key){
    const k = String(key || '').trim().toLowerCase();
    if (!k) return false;
    if (k === 'nome' || k === 'email' || k === 'habitacao') return (usersColFilters[k] instanceof Set);
    if (k === 'origem') {
      const s = usersColFilters.origem;
      if (!(s instanceof Set)) return false;
      return !(s.has('portal') && s.has('colaborador'));
    }
    if (k === 'status') {
      const s = usersColFilters.status;
      if (!(s instanceof Set)) return false;
      return !(s.has('ativo') && s.has('suspenso'));
    }
    return false;
  }

  function ensureUsersFilterPanel(){
    if (usersFilterPanel) return usersFilterPanel;
    ensureCfgFilterPanelBaseStyle();
    const el = document.createElement('div');
    el.id = 'cfgUsersFilterPanel';
    el.className = 'wdg-filter-panel';
    el.style.cssText = ['z-index:1085', 'display:none'].join(';');
    document.body.appendChild(el);
    usersFilterPanel = el;

    // Fecha ao clicar fora
    document.addEventListener('mousedown', (ev) => {
      if (!usersFilterPanel || usersFilterPanel.style.display === 'none') return;
      const t = ev.target;
      if (!t) return;
      if (t.closest && (t.closest('#cfgUsersFilterPanel') || t.closest('[data-users-filter]'))) return;
      closeUsersFilterPanel();
    }, true);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closeUsersFilterPanel();
    });

    // Se algo scrollar (tabela, container, página), fecha para evitar "desancorar".
    if (!document.__wdgCfgUsersFilterScrollClose) {
      document.__wdgCfgUsersFilterScrollClose = true;
      document.addEventListener('scroll', () => {
        try {
          if (usersFilterPanel && usersFilterPanel.style.display !== 'none') closeUsersFilterPanel();
        } catch { /* noop */ }
      }, true);
      window.addEventListener('resize', () => {
        try {
          if (usersFilterPanel && usersFilterPanel.style.display !== 'none') closeUsersFilterPanel();
        } catch { /* noop */ }
      });
    }
    return el;
  }

  function closeUsersFilterPanel(){
    if (!usersFilterPanel) return;
    usersFilterPanel.style.display = 'none';
    usersFilterPanelKey = '';
  }

  function positionUsersFilterPanel(anchor){
    if (!usersFilterPanel || !anchor) return;
    positionFilterPanel(usersFilterPanel, anchor, { align: 'left' });
  }

  function openUsersFilterPanel(key, anchor){
    const k = String(key || '').trim().toLowerCase();
    if (!k) return;
    const panel = ensureUsersFilterPanel();
    usersFilterPanelKey = k;

    const suspendedPortalSet = getSuspendedPortalSet();
    const suspendedColabSet = getSuspendedColabSet();
    const isSuspFast = (ownerKey, origem) => {
      const ok = normalizeOwnerKey(ownerKey);
      if (!ok) return false;
      const baseEmail = ownerKeyToEmail(ok);
      const isPortal = String(origem || '').trim().toLowerCase() === 'portal';
      const sets = isPortal ? suspendedPortalSet : suspendedColabSet;
      if (sets?.scoped && sets.scoped.has(ok)) return true;
      if (baseEmail && sets?.legacyEmails && sets.legacyEmails.has(baseEmail)) return true;
      return false;
    };

    const getVal = (u, keyName) => {
      const kk = String(keyName || '').trim().toLowerCase();
      if (kk === 'nome') return String(u?.nome || '').trim();
      if (kk === 'email') return normalizeEmail(u?.email) || '';
      if (kk === 'habitacao') return String(u?.habitacao || '').trim();
      if (kk === 'origem') return (String(u?.origem || '').trim().toLowerCase() === 'portal') ? 'portal' : 'colaborador';
      if (kk === 'status') {
        const origem = (String(u?.origem || '').trim().toLowerCase() === 'portal') ? 'portal' : 'colaborador';
        const ownerKey = normalizeOwnerKey(u?.ownerKey || '') || buildOwnerKeyForUserRow(u);
        const isSusp = !!(ownerKey && isSuspFast(ownerKey, origem));
        return isSusp ? 'suspenso' : 'ativo';
      }
      return '';
    };

    const title = (k === 'nome') ? 'Nome'
      : (k === 'email') ? 'E-mail'
        : (k === 'habitacao') ? 'Habitação'
          : (k === 'origem') ? 'Origem'
            : (k === 'status') ? 'Status'
              : 'Filtro';

    // Base para listar opções: aplica filtros globais + busca + outros filtros (exceto a coluna atual).
    const buildBase = () => {
      const q = (usersQuery || getUsersQuery() || '').trim().toLowerCase();
      let rows = (Array.isArray(usersList) ? usersList : []).slice();

      if (usersFilter === 'portal') {
        rows = rows.filter(u => String(u?.origem || '').trim().toLowerCase() === 'portal');
      } else if (usersFilter === 'colaborador') {
        rows = rows.filter(u => String(u?.origem || '').trim().toLowerCase() !== 'portal');
      } else if (usersFilter === 'suspensos') {
        rows = rows.filter(u => {
          const origem = (String(u?.origem || '').trim().toLowerCase() === 'portal') ? 'portal' : 'colaborador';
          const ownerKey = normalizeOwnerKey(u?.ownerKey || '') || buildOwnerKeyForUserRow(u);
          return ownerKey && isSuspFast(ownerKey, origem);
        });
      }

      if (q) {
        rows = rows.filter(u => {
          const em = normalizeEmail(u?.email);
          const nome = String(u?.nome || '').trim().toLowerCase();
          const hab = String(u?.habitacao || '').trim().toLowerCase();
          return (em && em.includes(q)) || (nome && nome.includes(q)) || (hab && hab.includes(q));
        });
      }

      const applySetFilter = (keyName, rowVal) => {
        const kk = String(keyName || '').trim().toLowerCase();
        if (kk === k) return true; // não aplica filtro da coluna atual
        const f = usersColFilters[kk];
        if (f === null || f === undefined) return true;
        if (f instanceof Set) return f.has(String(rowVal || ''));
        return true;
      };

      rows = rows.filter(u => {
        const origem = getVal(u, 'origem');
        const status = getVal(u, 'status');
        const nome = getVal(u, 'nome');
        const email = getVal(u, 'email');
        const hab = getVal(u, 'habitacao');
        if (!applySetFilter('origem', origem)) return false;
        if (!applySetFilter('status', status)) return false;
        if (!applySetFilter('nome', nome)) return false;
        if (!applySetFilter('email', email)) return false;
        if (!applySetFilter('habitacao', hab)) return false;
        return true;
      });

      return rows;
    };

    const baseRows = buildBase();

    // Opções únicas
    const labelFor = (val) => {
      const v = String(val ?? '');
      if (k === 'origem') return (v === 'portal') ? 'Portal' : 'Colaborador';
      if (k === 'status') return (v === 'suspenso') ? 'Suspenso' : 'Ativo';
      return v ? v : '—';
    };
    const uniq = new Map();
    for (const u of baseRows) {
      const v = String(getVal(u, k) ?? '');
      if (!uniq.has(v)) uniq.set(v, labelFor(v));
    }
    const allOptions = Array.from(uniq.entries()).map(([value, label]) => ({ value, label }));
    allOptions.sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR', { sensitivity: 'base' }));

    const maxItems = 250;
    const shown = allOptions.slice(0, maxItems);
    const truncated = allOptions.length > shown.length;

    const currentFilter = usersColFilters[k];
    const isChecked = (val) => {
      if (currentFilter === null || currentFilter === undefined) return true;
      if (currentFilter instanceof Set) return currentFilter.has(String(val ?? ''));
      return true;
    };

    const itemsHtml = shown.map(opt => {
      const label = String(opt.label || '');
      const labelKey = label.toLowerCase();
      const value = String(opt.value ?? '');
      const checked = isChecked(value);
      return `
        <div class="wdg-filter-opt" data-users-filter-opt="1" data-users-filter-label="${escapeHtml(labelKey)}">
          <input class="form-check-input" type="checkbox" data-users-filter-item="1" data-users-filter-key="${escapeHtml(k)}" value="${escapeHtml(value)}" ${checked ? 'checked' : ''}>
          <label>${escapeHtml(label)}</label>
        </div>`;
    }).join('');

    panel.innerHTML = `
      <div class="wdg-filter-head">
        <div class="wdg-filter-title">Filtro: ${escapeHtml(title)}</div>
        <div class="wdg-filter-actions">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-users-filter-markall="${escapeHtml(k)}">Marcar todos</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-users-filter-unmarkall="${escapeHtml(k)}">Desmarcar</button>
        </div>
      </div>
      <div class="mt-2">
        <input class="form-control form-control-sm" placeholder="Buscar…" data-users-filter-search="1" />
      </div>
      <div class="wdg-filter-list mt-2" role="listbox">
        ${itemsHtml || '<div class="text-muted small" style="padding:.35rem .15rem">Sem valores para listar.</div>'}
      </div>
      ${truncated ? `<div class="form-text">Mostrando ${shown.length} de ${allOptions.length} valores.</div>` : ''}
      <div class="wdg-filter-foot">
        <button type="button" class="btn btn-outline-danger btn-sm" data-users-filter-clear="${escapeHtml(k)}">Limpar</button>
        <button type="button" class="btn btn-primary btn-sm" data-users-filter-apply="${escapeHtml(k)}">Aplicar</button>
      </div>
    `;
    panel.style.visibility = 'hidden';
    panel.style.display = 'block';
    positionUsersFilterPanel(anchor);
    panel.style.visibility = 'visible';

    setTimeout(() => {
      try {
        const inp = panel.querySelector('input[data-users-filter-search]');
        inp && inp.focus();
      } catch { /* noop */ }
    }, 0);
  }

  function applyUsersFilterPanel(key){
    const k = String(key || '').trim().toLowerCase();
    if (!usersFilterPanel || !k) return;

    const checks = Array.from(usersFilterPanel.querySelectorAll(`input[data-users-filter-item="1"][data-users-filter-key="${k}"]`));
    const total = checks.length;
    const selected = checks.filter(c => c.checked).map(c => String(c.value ?? ''));

    // Se todos selecionados => sem filtro (null). Se parcial => Set.
    if (total > 0 && selected.length === total) usersColFilters[k] = null;
    else usersColFilters[k] = new Set(selected);

    usersPage = 1;
    renderUsersTable();
    closeUsersFilterPanel();
  }

  function clearUsersFilter(key){
    const k = String(key || '').trim().toLowerCase();
    if (!k) return;
    if (k === 'nome' || k === 'email' || k === 'habitacao') usersColFilters[k] = null;
    else if (k === 'origem') usersColFilters.origem = null;
    else if (k === 'status') usersColFilters.status = null;
    usersPage = 1;
    renderUsersTable();
    closeUsersFilterPanel();
  }

  function resetUsersView(){
    // busca (texto)
    usersQuery = '';
    try { if (els.usersSearch) els.usersSearch.value = ''; } catch { /* noop */ }

    // filtro global (select)
    usersFilter = 'all';
    try { if (els.usersFilter) els.usersFilter.value = 'all'; } catch { /* noop */ }

    // filtros por coluna
    usersColFilters.nome = null;
    usersColFilters.email = null;
    usersColFilters.habitacao = null;
    usersColFilters.origem = null;
    usersColFilters.status = null;

    // ordenação padrão
    usersSortKey = 'origem';
    usersSortDir = 'asc';

    usersPage = 1;
    closeUsersFilterPanel();
    renderUsersTable();
  }

  function renderUsersHeaderState(){
    const head = els.usersHead;
    if (!head) return;

    const inds = head.querySelectorAll('[data-users-sort-ind]');
    inds.forEach(el => {
      const k = String(el.getAttribute('data-users-sort-ind') || '').trim().toLowerCase();
      if (!k) return;
      if (k === String(usersSortKey || '').trim().toLowerCase()) {
        el.textContent = (usersSortDir === 'desc') ? '▼' : '▲';
      } else {
        el.textContent = '';
      }
    });

    const fbtns = head.querySelectorAll('[data-users-filter]');
    fbtns.forEach(btn => {
      const k = String(btn.getAttribute('data-users-filter') || '').trim().toLowerCase();
      const active = isUsersFilterActive(k);
      btn.classList.toggle('text-primary', active);
      btn.classList.toggle('text-muted', !active);
    });
  }

  function renderUsersTable(){
    if (!els.usersTable) return;

    const suspendedPortalSet = getSuspendedPortalSet();
    const suspendedColabSet = getSuspendedColabSet();
    const q = (usersQuery || getUsersQuery() || '').trim().toLowerCase();

    let filtered = (Array.isArray(usersList) ? usersList : []).slice();
    if (usersFilter === 'portal') {
      filtered = filtered.filter(u => String(u?.origem || '').trim().toLowerCase() === 'portal');
    } else if (usersFilter === 'colaborador') {
      filtered = filtered.filter(u => String(u?.origem || '').trim().toLowerCase() !== 'portal');
    } else if (usersFilter === 'suspensos') {
      filtered = filtered.filter(u => {
        const origem = String(u?.origem || '').trim().toLowerCase() === 'portal' ? 'portal' : 'colaborador';
        const ownerKey = normalizeOwnerKey(u?.ownerKey || '') || buildOwnerKeyForUserRow(u);
        return ownerKey && isSuspendedOwnerKey(ownerKey, origem);
      });
    }

    if (q) {
      filtered = filtered.filter(u => {
        const em = normalizeEmail(u?.email);
        const nome = String(u?.nome || '').trim().toLowerCase();
        const hab = String(u?.habitacao || '').trim().toLowerCase();
        return (em && em.includes(q)) || (nome && nome.includes(q)) || (hab && hab.includes(q));
      });
    }

    // Filtros por coluna (dropdown com checkbox)
    filtered = filtered.filter(u => {
      const origemRaw = String(u?.origem || '').trim().toLowerCase() === 'portal' ? 'portal' : 'colaborador';
      const origemSet = usersColFilters.origem;
      if (origemSet instanceof Set) {
        if (!origemSet.has(origemRaw)) return false;
      }

      const ownerKey = normalizeOwnerKey(u?.ownerKey || '') || buildOwnerKeyForUserRow(u);
      const isSusp = !!(ownerKey && isSuspendedOwnerKey(ownerKey, origemRaw));
      const statusKey = isSusp ? 'suspenso' : 'ativo';
      const statusSet = usersColFilters.status;
      if (statusSet instanceof Set) {
        if (!statusSet.has(statusKey)) return false;
      }

      const nomeVal = String(u?.nome || '').trim();
      const emailVal = normalizeEmail(u?.email) || '';
      const habVal = String(u?.habitacao || '').trim();

      if (usersColFilters.nome instanceof Set) {
        if (!usersColFilters.nome.has(nomeVal)) return false;
      }
      if (usersColFilters.email instanceof Set) {
        if (!usersColFilters.email.has(emailVal)) return false;
      }
      if (usersColFilters.habitacao instanceof Set) {
        if (!usersColFilters.habitacao.has(habVal)) return false;
      }
      return true;
    });

    const cmpText = (x, y) => String(x || '').localeCompare(String(y || ''), 'pt-BR', { sensitivity: 'base' });
    const cmpKey = (k, a, b) => {
      const key = String(k || '').trim().toLowerCase();
      if (key === 'nome') {
        const an = String(a?.nome || '').trim();
        const bn = String(b?.nome || '').trim();
        if (an && bn) return cmpText(an, bn);
        return cmpText(String(a?.email || ''), String(b?.email || ''));
      }
      if (key === 'email') return cmpText(String(a?.email || ''), String(b?.email || ''));
      if (key === 'habitacao') return cmpText(String(a?.habitacao || ''), String(b?.habitacao || ''));
      if (key === 'origem') {
        const ao = String(a?.origem || '').trim().toLowerCase() === 'portal' ? 0 : 1;
        const bo = String(b?.origem || '').trim().toLowerCase() === 'portal' ? 0 : 1;
        return ao - bo;
      }
      if (key === 'status') {
        const ao = String(a?.origem || '').trim().toLowerCase() === 'portal' ? 'portal' : 'colaborador';
        const bo = String(b?.origem || '').trim().toLowerCase() === 'portal' ? 'portal' : 'colaborador';
        const ak = normalizeOwnerKey(a?.ownerKey || '') || buildOwnerKeyForUserRow(a);
        const bk = normalizeOwnerKey(b?.ownerKey || '') || buildOwnerKeyForUserRow(b);
        const as = !!(ak && isSuspendedOwnerKey(ak, ao));
        const bs = !!(bk && isSuspendedOwnerKey(bk, bo));
        return (as ? 1 : 0) - (bs ? 1 : 0);
      }
      return 0;
    };

    // Ordenação clicável no cabeçalho; desempate: origem, nome, e-mail.
    const dirMul = (String(usersSortDir || '').toLowerCase() === 'desc') ? -1 : 1;
    filtered.sort((a, b) => {
      const primary = cmpKey(usersSortKey, a, b);
      if (primary) return primary * dirMul;
      const byOrigem = cmpKey('origem', a, b);
      if (byOrigem) return byOrigem;
      const byNome = cmpKey('nome', a, b);
      if (byNome) return byNome;
      return cmpKey('email', a, b);
    });

    const size = Math.max(10, Math.min(200, Number(usersPageSize) || 50));
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / size));
    usersPage = Math.max(1, Math.min(usersPage, pages));
    const start = (usersPage - 1) * size;
    const slice = filtered.slice(start, start + size);

    lastRenderedUserKeys = slice.map(u => normalizeOwnerKey(u?.ownerKey || '') || buildOwnerKeyForUserRow(u)).filter(Boolean);

    const metaAll = computeUsersMeta(usersList, suspendedPortalSet, suspendedColabSet);
    updateUsersCount(metaAll, slice.length, total);

    // Atualiza "selecionar todos" com base na página visível
    if (els.usersCheckAll) {
      const keys = lastRenderedUserKeys;
      const any = keys.some(k => selectedUserKeys.has(k));
      const all = keys.length > 0 && keys.every(k => selectedUserKeys.has(k));
      els.usersCheckAll.disabled = keys.length === 0;
      els.usersCheckAll.indeterminate = any && !all;
      els.usersCheckAll.checked = all;
    }

    if (!total) {
      els.usersTable.innerHTML = '<tr><td colspan="8" class="text-muted">Nenhum usuário encontrado.</td></tr>';
    } else {
      els.usersTable.innerHTML = slice.map(u => {
        const em = normalizeEmail(u?.email);
        const nome = String(u?.nome || '').trim();
        const origemRaw = String(u?.origem || '').trim().toLowerCase();
        const origem = (origemRaw === 'portal') ? 'Pessoal Portal' : 'Pessoal Colaborador';
        const origemBadge = `<span class="badge fw-normal ${origemRaw === 'portal' ? 'text-bg-info' : 'text-bg-secondary'}">${escapeHtml(origem)}</span>`;
        const habitacao = String(u?.habitacao || '').trim();
        const rowKey = normalizeOwnerKey(u?.ownerKey || '') || buildOwnerKeyForUserRow(u);
        const isSel = selectedUserKeys.has(rowKey);
        const isSusp = !!(rowKey && isSuspendedOwnerKey(rowKey, origemRaw));
        const status = isSusp
          ? '<span class="badge fw-normal text-bg-danger">Suspenso</span>'
          : '<span class="badge fw-normal text-bg-success">Ativo</span>';
        const btnLabel = isSusp
          ? '<img src="/images/play.png" alt="Reativar" style="width:16px;height:16px;vertical-align:middle" />'
          : '<img src="/images/pause.png" alt="Suspender" style="width:16px;height:16px;vertical-align:middle" />';
        const btnClass = isSusp ? 'btn-outline-success' : 'btn-outline-danger';
        const safeEm = escapeHtml(em || '');

        const perms = (origemRaw === 'portal' && em) ? getPortalPerms(em) : null;
        const permsCol = (origemRaw === 'portal' && em) ? `
          <div class="d-flex flex-column gap-1 align-items-start">
            <label class="form-check m-0 small fw-normal">
              <input class="form-check-input" type="checkbox" data-user-perm="permitir_pessoal_para_pessoal" data-user-email="${safeEm}" ${perms?.permitir_pessoal_para_pessoal ? 'checked' : ''}>
              <span class="form-check-label">Pessoal → Pessoal</span>
            </label>
            <label class="form-check m-0 small fw-normal">
              <input class="form-check-input" type="checkbox" data-user-perm="permitir_pessoal_para_habitacao" data-user-email="${safeEm}" ${perms?.permitir_pessoal_para_habitacao ? 'checked' : ''}>
              <span class="form-check-label">Pessoal → Habitação</span>
            </label>
            <label class="form-check m-0 small fw-normal">
              <input class="form-check-input" type="checkbox" data-user-perm="permitir_pessoal_para_colaborador" data-user-email="${safeEm}" ${perms?.permitir_pessoal_para_colaborador ? 'checked' : ''}>
              <span class="form-check-label">Pessoal → Colaborador</span>
            </label>
          </div>
        ` : '<span class="text-muted">—</span>';

        return `
          <tr>
            <td><input class="form-check-input" type="checkbox" data-user-select="1" data-user-key="${escapeHtml(rowKey)}" ${isSel ? 'checked' : ''}></td>
            <td>${escapeHtml(nome || '—')}</td>
            <td>${safeEm || '—'}</td>
            <td>${origemBadge}</td>
            <td>${escapeHtml(habitacao || '—')}</td>
            <td>${permsCol}</td>
            <td>${status}</td>
            <td class="text-center">
              <button class="btn ${btnClass} btn-sm" type="button" ${safeEm && rowKey ? `data-user-toggle-susp-key=\"${escapeHtml(rowKey)}\" data-user-origem=\"${escapeHtml(origemRaw)}\"` : 'disabled'} title="${isSusp ? 'Reativar' : 'Suspender'}">${btnLabel}</button>
            </td>
          </tr>`;
      }).join('');
    }

    if (els.usersPageInfo) {
      els.usersPageInfo.textContent = `Página ${usersPage} de ${pages}`;
    }
    if (els.usersPrev) {
      els.usersPrev.disabled = usersPage <= 1;
    }
    if (els.usersNext) {
      els.usersNext.disabled = usersPage >= pages;
    }

    renderUsersHeaderState();
    renderUsersBulkActions();
  }

  function isMailboxesFilterActive(key){
    const k = String(key || '').trim().toLowerCase();
    if (!k) return false;
    if (k === 'name') return (mailboxesColFilters.name instanceof Set);
    if (k === 'status') {
      const s = mailboxesColFilters.status;
      if (!(s instanceof Set)) return false;
      return !(s.has('ativa') && s.has('suspensa'));
    }
    return false;
  }

  function ensureMailboxesFilterPanel(){
    if (mailboxesFilterPanel) return mailboxesFilterPanel;
    ensureCfgFilterPanelBaseStyle();
    const el = document.createElement('div');
    el.id = 'cfgMailboxFilterPanel';
    el.className = 'wdg-filter-panel';
    el.style.cssText = ['z-index:1085', 'display:none'].join(';');
    document.body.appendChild(el);
    mailboxesFilterPanel = el;

    document.addEventListener('mousedown', (ev) => {
      if (!mailboxesFilterPanel || mailboxesFilterPanel.style.display === 'none') return;
      const t = ev.target;
      if (!t) return;
      if (t.closest && (t.closest('#cfgMailboxFilterPanel') || t.closest('[data-mb-filter]'))) return;
      closeMailboxesFilterPanel();
    }, true);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closeMailboxesFilterPanel();
    });

    if (!document.__wdgCfgMbFilterScrollClose) {
      document.__wdgCfgMbFilterScrollClose = true;
      document.addEventListener('scroll', () => {
        try {
          if (mailboxesFilterPanel && mailboxesFilterPanel.style.display !== 'none') closeMailboxesFilterPanel();
        } catch { /* noop */ }
      }, true);
      window.addEventListener('resize', () => {
        try {
          if (mailboxesFilterPanel && mailboxesFilterPanel.style.display !== 'none') closeMailboxesFilterPanel();
        } catch { /* noop */ }
      });
    }
    return el;
  }

  function closeMailboxesFilterPanel(){
    if (!mailboxesFilterPanel) return;
    mailboxesFilterPanel.style.display = 'none';
    mailboxesFilterPanelKey = '';
  }

  function positionMailboxesFilterPanel(anchor){
    if (!mailboxesFilterPanel || !anchor) return;
    positionFilterPanel(mailboxesFilterPanel, anchor, { align: 'center' });
  }

  function openMailboxesFilterPanel(key, anchor){
    const k = String(key || '').trim().toLowerCase();
    if (!k) return;
    const panel = ensureMailboxesFilterPanel();
    mailboxesFilterPanelKey = k;

    const getVal = (mb, keyName) => {
      const kk = String(keyName || '').trim().toLowerCase();
      if (kk === 'name') return String(mb?.name || '').trim();
      if (kk === 'status') return (mb?.ativo !== false) ? 'ativa' : 'suspensa';
      return '';
    };

    const title = (k === 'name') ? 'Caixa'
      : (k === 'status') ? 'Status'
        : 'Filtro';

    const buildBase = () => {
      let rows = (Array.isArray(mailboxesList) ? mailboxesList : []).slice();

      const applySetFilter = (keyName, rowVal) => {
        const kk = String(keyName || '').trim().toLowerCase();
        if (kk === k) return true;
        const f = mailboxesColFilters[kk];
        if (f === null || f === undefined) return true;
        if (f instanceof Set) return f.has(String(rowVal || ''));
        return true;
      };

      rows = rows.filter(mb => {
        const name = getVal(mb, 'name');
        const status = getVal(mb, 'status');
        if (!applySetFilter('name', name)) return false;
        if (!applySetFilter('status', status)) return false;
        return true;
      });

      return rows;
    };

    const baseRows = buildBase();
    const labelFor = (val) => {
      const v = String(val ?? '');
      if (k === 'status') return (v === 'suspensa') ? 'Suspensa' : 'Ativa';
      return v ? v : '—';
    };

    const uniq = new Map();
    for (const mb of baseRows) {
      const v = String(getVal(mb, k) ?? '');
      if (!uniq.has(v)) uniq.set(v, labelFor(v));
    }
    const allOptions = Array.from(uniq.entries()).map(([value, label]) => ({ value, label }));
    allOptions.sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR', { sensitivity: 'base' }));

    const maxItems = 250;
    const shown = allOptions.slice(0, maxItems);
    const truncated = allOptions.length > shown.length;

    const currentFilter = mailboxesColFilters[k];
    const isChecked = (val) => {
      if (currentFilter === null || currentFilter === undefined) return true;
      if (currentFilter instanceof Set) return currentFilter.has(String(val ?? ''));
      return true;
    };

    const itemsHtml = shown.map(opt => {
      const label = String(opt.label || '');
      const labelKey = label.toLowerCase();
      const value = String(opt.value ?? '');
      const checked = isChecked(value);
      return `
        <div class="wdg-filter-opt" data-mb-filter-opt="1" data-mb-filter-label="${escapeHtml(labelKey)}">
          <input class="form-check-input" type="checkbox" data-mb-filter-item="1" data-mb-filter-key="${escapeHtml(k)}" value="${escapeHtml(value)}" ${checked ? 'checked' : ''}>
          <label>${escapeHtml(label)}</label>
        </div>`;
    }).join('');

    panel.innerHTML = `
      <div class="wdg-filter-head">
        <div class="wdg-filter-title">Filtro: ${escapeHtml(title)}</div>
        <div class="wdg-filter-actions">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-mb-filter-markall="${escapeHtml(k)}">Marcar todos</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-mb-filter-unmarkall="${escapeHtml(k)}">Desmarcar</button>
        </div>
      </div>
      <div class="mt-2">
        <input class="form-control form-control-sm" placeholder="Buscar…" data-mb-filter-search="1" />
      </div>
      <div class="wdg-filter-list mt-2" role="listbox">
        ${itemsHtml || '<div class="text-muted small" style="padding:.35rem .15rem">Sem valores para listar.</div>'}
      </div>
      ${truncated ? `<div class="form-text">Mostrando ${shown.length} de ${allOptions.length} valores.</div>` : ''}
      <div class="wdg-filter-foot">
        <button type="button" class="btn btn-outline-danger btn-sm" data-mb-filter-clear="${escapeHtml(k)}">Limpar</button>
        <button type="button" class="btn btn-primary btn-sm" data-mb-filter-apply="${escapeHtml(k)}">Aplicar</button>
      </div>
    `;
    panel.style.visibility = 'hidden';
    panel.style.display = 'block';
    positionMailboxesFilterPanel(anchor);
    panel.style.visibility = 'visible';
    setTimeout(() => {
      try {
        const inp = panel.querySelector('input[data-mb-filter-search]');
        inp && inp.focus();
      } catch { /* noop */ }
    }, 0);
  }

  function applyMailboxesFilterPanel(key){
    const k = String(key || '').trim().toLowerCase();
    if (!mailboxesFilterPanel || !k) return;
    const checks = Array.from(mailboxesFilterPanel.querySelectorAll(`input[data-mb-filter-item="1"][data-mb-filter-key="${k}"]`));
    const total = checks.length;
    const selected = checks.filter(c => c.checked).map(c => String(c.value ?? ''));
    if (total > 0 && selected.length === total) mailboxesColFilters[k] = null;
    else mailboxesColFilters[k] = new Set(selected);
    mailboxesPage = 1;
    renderMailboxesTable();
    closeMailboxesFilterPanel();
  }

  function clearMailboxesFilter(key){
    const k = String(key || '').trim().toLowerCase();
    if (!k) return;
    if (k === 'name') mailboxesColFilters.name = null;
    else if (k === 'status') mailboxesColFilters.status = null;
    mailboxesPage = 1;
    renderMailboxesTable();
    closeMailboxesFilterPanel();
  }

  function renderMailboxesHeaderState(){
    const head = els.mailboxHead;
    if (!head) return;

    const inds = head.querySelectorAll('[data-mb-sort-ind]');
    inds.forEach(el => {
      const k = String(el.getAttribute('data-mb-sort-ind') || '').trim().toLowerCase();
      if (!k) return;
      if (k === String(mailboxesSortKey || '').trim().toLowerCase()) {
        el.textContent = (mailboxesSortDir === 'desc') ? '▼' : '▲';
      } else {
        el.textContent = '';
      }
    });

    const fbtns = head.querySelectorAll('[data-mb-filter]');
    fbtns.forEach(btn => {
      const k = String(btn.getAttribute('data-mb-filter') || '').trim().toLowerCase();
      const active = isMailboxesFilterActive(k);
      btn.classList.toggle('text-primary', active);
      btn.classList.toggle('text-muted', !active);
    });
  }

  function updateMailboxesSummary(listAll, shown, totalFiltered){
    const el = els.mailboxSummary || els.mailboxCount;
    if (!el) return;
    const arr = Array.isArray(listAll) ? listAll : [];
    const meta = { total: arr.length, ativas: 0, suspensas: 0 };
    for (const mb of arr) {
      const ativo = mb?.ativo !== false;
      if (ativo) meta.ativas++;
      else meta.suspensas++;
    }
    const shownN = Number(shown) || 0;
    const totalN = Number(totalFiltered) || 0;
    el.textContent = `Exibindo ${shownN}/${totalN} caixas - Ativas: ${meta.ativas} - Suspensas: ${meta.suspensas}`;
  }

  function getSelectedMailboxRows(){
    const ids = Array.from(selectedMailboxIds || []);
    const rows = [];
    for (const id of ids) {
      const k = String(id || '').trim();
      if (!k) continue;
      const mb = mailboxesById.get(k);
      if (mb) rows.push(mb);
    }
    return rows;
  }

  function renderMailboxesBulkActions(){
    if (!els.mailboxBulkActions) return;
    const selCount = (selectedMailboxIds && selectedMailboxIds.size) ? selectedMailboxIds.size : 0;
    if (!selCount) {
      els.mailboxBulkActions.style.display = 'none';
      els.mailboxBulkActions.innerHTML = '';
      return;
    }

    const rows = getSelectedMailboxRows();
    const total = rows.length;
    const suspendedCount = rows.reduce((acc, mb) => acc + ((mb?.ativo === false) ? 1 : 0), 0);
    const activeCount = Math.max(0, total - suspendedCount);

    // Um botão inteligente (Suspender OU Ativar) por maioria.
    let showAction = 'suspend';
    if (suspendedCount <= 0) showAction = 'suspend';
    else if (activeCount <= 0) showAction = 'activate';
    else if (suspendedCount >= activeCount) showAction = 'activate';
    else showAction = 'suspend';

    const icon = (src, alt) => `<img class="wdg-users-bulk-ico" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`;
    const state = (showAction === 'activate')
      ? (suspendedCount === total ? 'all' : (suspendedCount > 0 ? 'partial' : 'none'))
      : (activeCount === total ? 'all' : (activeCount > 0 ? 'partial' : 'none'));

    const btn = (showAction === 'activate')
      ? `
        <button type="button" class="wdg-users-bulk-btn" data-mb-bulk-activate="1" data-bulk-state="${escapeHtml(state)}" aria-label="Ativar selecionadas" title="Ativar selecionadas">
          ${icon('/images/play.png','Ativar')}
        </button>`
      : `
        <button type="button" class="wdg-users-bulk-btn" data-mb-bulk-suspend="1" data-bulk-state="${escapeHtml(state)}" aria-label="Suspender selecionadas" title="Suspender selecionadas">
          ${icon('/images/pause.png','Suspender')}
        </button>`;

    els.mailboxBulkActions.innerHTML = `<div class="wdg-users-bulk-inner" aria-label="Ações em massa (caixas)">${btn}</div>`;
    els.mailboxBulkActions.style.display = '';
  }

  function renderMailboxesTable(){
    if (!els.mailboxList) return;
    const list = Array.isArray(mailboxesList) ? mailboxesList : [];

    // Filtros por coluna (dropdown com checkbox)
    let filtered = list.slice();
    filtered = filtered.filter(mb => {
      const nameVal = String(mb?.name || '').trim();
      const statusVal = (mb?.ativo !== false) ? 'ativa' : 'suspensa';
      if (mailboxesColFilters.name instanceof Set) {
        if (!mailboxesColFilters.name.has(nameVal)) return false;
      }
      if (mailboxesColFilters.status instanceof Set) {
        if (!mailboxesColFilters.status.has(statusVal)) return false;
      }
      return true;
    });

    const cmpText = (x, y) => String(x || '').localeCompare(String(y || ''), 'pt-BR', { sensitivity: 'base' });
    const cmpKey = (k, a, b) => {
      const key = String(k || '').trim().toLowerCase();
      if (key === 'name') return cmpText(String(a?.name || ''), String(b?.name || ''));
      if (key === 'status') {
        const as = (a?.ativo !== false) ? 0 : 1;
        const bs = (b?.ativo !== false) ? 0 : 1;
        return as - bs;
      }
      return 0;
    };
    filtered.sort((a, b) => {
      const base = cmpKey(mailboxesSortKey, a, b);
      return (mailboxesSortDir === 'desc') ? -base : base;
    });

    const size = Math.max(5, Math.min(200, Number(mailboxesPageSize) || 50));
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / size));
    mailboxesPage = Math.max(1, Math.min(mailboxesPage, pages));
    const start = (mailboxesPage - 1) * size;
    const slice = filtered.slice(start, start + size);

    lastRenderedMailboxIds = slice.map(mb => String(mb?.id || '').trim()).filter(Boolean);
    updateMailboxesSummary(list, slice.length, total);

    if (els.mailboxCheckAll) {
      const keys = lastRenderedMailboxIds;
      const any = keys.some(k => selectedMailboxIds.has(k));
      const all = keys.length > 0 && keys.every(k => selectedMailboxIds.has(k));
      els.mailboxCheckAll.disabled = keys.length === 0;
      els.mailboxCheckAll.indeterminate = any && !all;
      els.mailboxCheckAll.checked = all;
    }

    if (!total) {
      els.mailboxList.innerHTML = '<tr><td colspan="4" class="text-muted">Nenhuma caixa encontrada.</td></tr>';
    } else {
      els.mailboxList.innerHTML = slice.map(mb => {
        const id = String(mb?.id || '').trim();
        const ativo = mb?.ativo !== false;
        const status = ativo ? '<span class="badge fw-normal text-bg-success">Ativa</span>' : '<span class="badge fw-normal text-bg-danger">Suspensa</span>';
        const name = String(mb?.name || '');
        const type = String(mb?.type || '').trim().toLowerCase();
        const linkType = String(mb?.link_type || mb?.linkType || '').trim().toLowerCase();
        const linkId = String(mb?.link_id || mb?.linkId || '').trim();
        const canDelete = !!(canAdminDeleteMailbox && id && type === 'grupo' && !linkType && !linkId);
        const btnLabel = ativo
          ? '<img src="/images/pause.png" alt="Suspender" style="width:16px;height:16px;vertical-align:middle" />'
          : '<img src="/images/play.png" alt="Reativar" style="width:16px;height:16px;vertical-align:middle" />';
        const btnClass = ativo ? 'btn-outline-danger' : 'btn-outline-success';
        const delLabel = '<img src="/images/excluir.png" alt="Excluir" style="width:16px;height:16px;vertical-align:middle" />';
        const isSel = id && selectedMailboxIds.has(id);
        return `
          <tr>
            <td><input class="form-check-input" type="checkbox" data-mailbox-select="1" data-mailbox-id="${escapeHtml(id)}" ${isSel ? 'checked' : ''}></td>
            <td>${escapeHtml(name || '—')}</td>
            <td>${status}</td>
            <td class="text-center">
              <div class="d-inline-flex align-items-center justify-content-center gap-2">
                <button class="btn ${btnClass} btn-sm" type="button" ${id ? `data-mailbox-toggle=\"${escapeHtml(id)}\" data-mailbox-next=\"${ativo ? '0' : '1'}\"` : 'disabled'} title="${ativo ? 'Suspender' : 'Reativar'}">${btnLabel}</button>
                ${canDelete ? `<button class="btn btn-outline-danger btn-sm" type="button" data-mailbox-delete=\"${escapeHtml(id)}\" title="Excluir">${delLabel}</button>` : ''}
              </div>
            </td>
          </tr>`;
      }).join('');
    }

    if (els.mailboxPageInfo) {
      els.mailboxPageInfo.textContent = `Página ${mailboxesPage} de ${pages}`;
    }
    if (els.mailboxPrev) els.mailboxPrev.disabled = mailboxesPage <= 1;
    if (els.mailboxNext) els.mailboxNext.disabled = mailboxesPage >= pages;

    renderMailboxesHeaderState();
    renderMailboxesBulkActions();
  }

  function renderMetricsUsersTable(){
    if (!els.metricsUsers) return;
    const list = Array.isArray(metricsUsersList) ? metricsUsersList : [];

    let filtered = list.slice();

    // Filtros por coluna
    filtered = filtered.filter(r => {
      const emRaw = String(r?.email || '');
      const em = normalizeEmail(emRaw) || String(emRaw || '').trim();
      if (metricsUsersColFilters.user instanceof Set) {
        if (!metricsUsersColFilters.user.has(em)) return false;
      }
      return true;
    });

    const cmpText = (x, y) => String(x || '').localeCompare(String(y || ''), 'pt-BR', { sensitivity: 'base' });
    const cmpNum = (x, y) => (Number(x) || 0) - (Number(y) || 0);
    const cmpKey = (k, a, b) => {
      const key = String(k || '').trim().toLowerCase();
      if (key === 'user') return cmpText(String(a?.email || ''), String(b?.email || ''));
      if (key === 'sentcount') return cmpNum(a?.sentCount, b?.sentCount);
      if (key === 'receivedcount') return cmpNum(a?.receivedCount, b?.receivedCount);
      if (key === 'sentbytes') return cmpNum(a?.sentBytes, b?.sentBytes);
      if (key === 'receivedbytes') return cmpNum(a?.receivedBytes, b?.receivedBytes);
      if (key === 'total') return cmpNum((a?.sentCount || 0) + (a?.receivedCount || 0), (b?.sentCount || 0) + (b?.receivedCount || 0));
      return 0;
    };
    filtered.sort((a, b) => {
      const base = cmpKey(metricsUsersSortKey, a, b);
      return (metricsUsersSortDir === 'desc') ? -base : base;
    });

    const size = Math.max(5, Math.min(100, Number(metricsUsersPageSize) || 25));
    const totalFiltered = filtered.length;
    const pages = Math.max(1, Math.ceil(totalFiltered / size));
    metricsUsersPage = Math.max(1, Math.min(metricsUsersPage, pages));
    const start = (metricsUsersPage - 1) * size;
    const slice = filtered.slice(start, start + size);

    if (els.metricsUsersSummary) {
      els.metricsUsersSummary.textContent = `Exibindo ${slice.length}/${totalFiltered} usuários`;
    }

    if (!totalFiltered) {
      els.metricsUsers.innerHTML = '<tr><td colspan="5" class="text-muted">Sem dados no período.</td></tr>';
    } else {
      els.metricsUsers.innerHTML = slice.map(r => {
        const emRaw = String(r?.email || '');
        const em = normalizeEmail(emRaw) || emRaw;
        const info = normalizeEmail(emRaw) ? usersByEmail.get(normalizeEmail(emRaw)) : null;
        const origemRaw = String(info?.origem || '').trim().toLowerCase();
        const origem = (origemRaw === 'portal') ? 'Portal' : (origemRaw ? 'Colaborador' : '');
        const badge = origem
          ? ` <span class="badge ${origem === 'Portal' ? 'text-bg-info' : 'text-bg-secondary'}">${escapeHtml(origem)}</span>`
          : '';
        return `
          <tr>
            <td>${escapeHtml(String(em || ''))}${badge}</td>
            <td class="text-center">${Number(r?.sentCount || 0)}</td>
            <td class="text-center">${Number(r?.receivedCount || 0)}</td>
            <td class="text-center">${escapeHtml(String(r?.sentBytesHuman || '0 B'))}</td>
            <td class="text-center">${escapeHtml(String(r?.receivedBytesHuman || '0 B'))}</td>
          </tr>`;
      }).join('');
    }

    // Indicadores de ordenação
    try {
      const head = els.metricsUsersHead;
      if (head) {
        const inds = head.querySelectorAll('[data-mu-sort-ind]');
        inds.forEach(el => {
          const k = String(el.getAttribute('data-mu-sort-ind') || '').trim().toLowerCase();
          if (!k) return;
          if (k === String(metricsUsersSortKey || '').trim().toLowerCase()) {
            el.textContent = (metricsUsersSortDir === 'desc') ? '▼' : '▲';
          } else {
            el.textContent = '';
          }
        });
      }
    } catch { /* noop */ }

    if (els.metricsUsersPageInfo) {
      els.metricsUsersPageInfo.textContent = `Página ${metricsUsersPage} de ${pages}`;

    renderMetricsUsersHeaderState();
    }
    if (els.metricsUsersPrev) els.metricsUsersPrev.disabled = metricsUsersPage <= 1;
    if (els.metricsUsersNext) els.metricsUsersNext.disabled = metricsUsersPage >= pages;
  }

  function renderMetricsMailboxesTable(){
    if (!els.metricsMailboxes) return;
    const list = Array.isArray(metricsMailboxesList) ? metricsMailboxesList : [];

    let filtered = list.slice();

    // Filtros por coluna
    filtered = filtered.filter(r => {
      const name = String(r?.mailboxName || r?.mailboxId || '').trim() || '—';
      const type = String(r?.mailboxType || '').trim() || '—';
      if (metricsMailboxesColFilters.mailbox instanceof Set) {
        if (!metricsMailboxesColFilters.mailbox.has(name)) return false;
      }
      if (metricsMailboxesColFilters.type instanceof Set) {
        if (!metricsMailboxesColFilters.type.has(type)) return false;
      }
      return true;
    });

    const cmpText = (x, y) => String(x || '').localeCompare(String(y || ''), 'pt-BR', { sensitivity: 'base' });
    const cmpNum = (x, y) => (Number(x) || 0) - (Number(y) || 0);
    const cmpKey = (k, a, b) => {
      const key = String(k || '').trim().toLowerCase();
      if (key === 'mailbox') return cmpText(String(a?.mailboxName || a?.mailboxId || ''), String(b?.mailboxName || b?.mailboxId || ''));
      if (key === 'type') return cmpText(String(a?.mailboxType || ''), String(b?.mailboxType || ''));
      if (key === 'sentcount') return cmpNum(a?.sentCount, b?.sentCount);
      if (key === 'receivedcount') return cmpNum(a?.receivedCount, b?.receivedCount);
      if (key === 'sentbytes') return cmpNum(a?.sentBytes, b?.sentBytes);
      if (key === 'receivedbytes') return cmpNum(a?.receivedBytes, b?.receivedBytes);
      if (key === 'total') return cmpNum((a?.sentCount || 0) + (a?.receivedCount || 0), (b?.sentCount || 0) + (b?.receivedCount || 0));
      return 0;
    };
    filtered.sort((a, b) => {
      const base = cmpKey(metricsMailboxesSortKey, a, b);
      return (metricsMailboxesSortDir === 'desc') ? -base : base;
    });

    const size = Math.max(5, Math.min(100, Number(metricsMailboxesPageSize) || 25));
    const totalFiltered = filtered.length;
    const pages = Math.max(1, Math.ceil(totalFiltered / size));
    metricsMailboxesPage = Math.max(1, Math.min(metricsMailboxesPage, pages));
    const start = (metricsMailboxesPage - 1) * size;
    const slice = filtered.slice(start, start + size);

    if (els.metricsMailboxesSummary) {
      els.metricsMailboxesSummary.textContent = `Exibindo ${slice.length}/${totalFiltered} caixas`;
    }

    if (!totalFiltered) {
      els.metricsMailboxes.innerHTML = '<tr><td colspan="6" class="text-muted">Sem dados no período.</td></tr>';
    } else {
      els.metricsMailboxes.innerHTML = slice.map(r => {
        const name = String(r?.mailboxName || r?.mailboxId || '');
        const type = String(r?.mailboxType || '');
        return `
          <tr>
            <td>${escapeHtml(name)}</td>
            <td><span class="badge text-bg-light text-dark">${escapeHtml(type)}</span></td>
            <td class="text-center">${Number(r?.sentCount || 0)}</td>
            <td class="text-center">${Number(r?.receivedCount || 0)}</td>
            <td class="text-center">${escapeHtml(String(r?.sentBytesHuman || '0 B'))}</td>
            <td class="text-center">${escapeHtml(String(r?.receivedBytesHuman || '0 B'))}</td>
          </tr>`;
      }).join('');
    }

    // Indicadores de ordenação
    try {
      const head = els.metricsMailboxesHead;
      if (head) {
        const inds = head.querySelectorAll('[data-mm-sort-ind]');
        inds.forEach(el => {
          const k = String(el.getAttribute('data-mm-sort-ind') || '').trim().toLowerCase();
          if (!k) return;
          if (k === String(metricsMailboxesSortKey || '').trim().toLowerCase()) {
            el.textContent = (metricsMailboxesSortDir === 'desc') ? '▼' : '▲';
          } else {
            el.textContent = '';
          }
        });
      }
    } catch { /* noop */ }

    renderMetricsMailboxesHeaderState();

    if (els.metricsMailboxesPageInfo) {
      els.metricsMailboxesPageInfo.textContent = `Página ${metricsMailboxesPage} de ${pages}`;
    }
    if (els.metricsMailboxesPrev) els.metricsMailboxesPrev.disabled = metricsMailboxesPage <= 1;
    if (els.metricsMailboxesNext) els.metricsMailboxesNext.disabled = metricsMailboxesPage >= pages;
  }

  async function loadSettings(){
    try {
      const unidadeId = getUnidadeId();
      if (!unidadeId) return;
      const data = await fetchJson(`${basePath}/api/msg/admin/settings?unidade_id=${encodeURIComponent(unidadeId)}`);
      currentSettings = data?.settings || null;
      dirtySuspPortalList = null;
      dirtySuspColabList = null;
      dirtyPortalPerms = null;

      renderUsersTable();
    } catch (e) {
      const st = Number(e?.status || 0) || 0;
      if (st === 401 || st === 403) {
        renderAccessDenied('Acesso negado.');
        return;
      }
      showToast(e?.message || 'Falha ao carregar configurações.', 'error');
      throw e;
    }
  }

  async function saveSettings(opts = {}){
    const unidadeId = getUnidadeId();
    if (!unidadeId) return;

    const payload = {
      unidade_id: unidadeId,
      pessoais_suspensas_portal: collectSuspendedPortal(),
      pessoais_suspensas_colaborador: collectSuspendedColab(),
      portal_user_perms: collectPortalUserPerms()
    };

    // Compatibilidade: só envia flags globais se existirem controles na tela.
    if (els.suspPessoais) payload.suspender_caixas_pessoais = !!els.suspPessoais.checked;
    if (els.suspGrupos) payload.suspender_caixas_grupo = !!els.suspGrupos.checked;
    if (els.allowP2P) payload.permitir_pessoal_para_pessoal = !!els.allowP2P.checked;

    const data = await fetchJson(`${basePath}/api/msg/admin/settings`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    currentSettings = data?.settings || null;
    dirtySuspPortalList = null;
    dirtySuspColabList = null;
    dirtyPortalPerms = null;
    renderUsersTable();

    const silent = !!opts?.silent;
    const successMsg = (opts && Object.prototype.hasOwnProperty.call(opts, 'successMsg'))
      ? String(opts.successMsg || '')
      : 'Configurações salvas.';
    if (!silent && successMsg) showToast(successMsg, 'success');
  }

  async function loadUsers(){
    try {
      const unidadeId = getUnidadeId();
      if (!unidadeId) return;

      setLoading(els.usersTable, 8);
      const data = await fetchJson(`${basePath}/api/msg/admin/users?unidade_id=${encodeURIComponent(unidadeId)}`);
      const list = Array.isArray(data?.data) ? data.data : [];

    const normalized = (Array.isArray(list) ? list : []).map(u => ({
      email: normalizeEmail(u?.email),
      nome: String(u?.nome || '').trim(),
      origem: (String(u?.origem || '').trim().toLowerCase() === 'portal') ? 'portal' : 'colaborador',
      habitacao: String(u?.habitacao || '').trim(),
      habitacao_id: String(u?.habitacao_id || u?.habitacaoId || '').trim()
    }));

    // Defesa: se existir ao menos 1 vínculo Portal por habitação para o e-mail,
    // remove a linha genérica Portal (habitacao_id vazio) para evitar duplicidade “—”.
    const portalEmailsWithHab = new Set(
      normalized
        .filter(u => u?.origem === 'portal' && !!u?.habitacao_id && !!u?.email)
        .map(u => u.email)
    );

    const filtered = normalized.filter(u => {
      if (!u?.email) return false;
      if (u?.origem !== 'portal') return true;
      if (u?.habitacao_id) return true;
      return !portalEmailsWithHab.has(u.email);
    });

    usersList = filtered
      .map(u => ({ ...u, ownerKey: buildOwnerKeyForUserRow(u) }))
      .filter(u => !!u.email && !!u.ownerKey);

    usersByOwnerKey = new Map();
    for (const u of usersList) {
      usersByOwnerKey.set(u.ownerKey, u);
    }

    usersByEmail = new Map();
    for (const u of usersList) {
      usersByEmail.set(u.email, { email: u.email, nome: u.nome, origem: u.origem });
    }

      usersPage = 1;
      renderUsersTable();
      showToast('Usuários carregados.', 'success');
    } catch (e) {
      setLoadError(els.usersTable, 8, e?.message || 'Falha ao carregar usuários.');
      showToast(e?.message || 'Falha ao carregar usuários.', 'error');
      throw e;
    }
  }

  function getSelectedUserRows(){
    const keys = Array.from(selectedUserKeys || []);
    const rows = [];
    for (const raw of keys) {
      const k = normalizeOwnerKey(raw);
      if (!k) continue;
      const row = usersByOwnerKey.get(k);
      if (row) rows.push(row);
    }
    return rows;
  }

  function renderUsersBulkActions(){
    if (!els.usersBulkActions) return;
    const selCount = (selectedUserKeys && selectedUserKeys.size) ? selectedUserKeys.size : 0;
    if (!selCount) {
      els.usersBulkActions.style.display = 'none';
      els.usersBulkActions.innerHTML = '';
      return;
    }

    const rows = getSelectedUserRows();
    const portalEmails = Array.from(new Set(rows.filter(r => r?.origem === 'portal' && r?.email).map(r => r.email))).filter(Boolean);
    const hasPortal = portalEmails.length > 0;

    const triState = (onCount, totalCount) => {
      const total = Math.max(0, Number(totalCount) || 0);
      const on = Math.max(0, Number(onCount) || 0);
      if (!total) return 'none';
      if (on <= 0) return 'none';
      if (on >= total) return 'all';
      return 'partial';
    };
    const stateLabel = (state) => state === 'all' ? 'Todos' : state === 'partial' ? 'Parcial' : 'Nenhum';

    const suspendedCount = rows.reduce((acc, r) => {
      const key = normalizeOwnerKey(r?.ownerKey);
      if (!key) return acc;
      const origemRaw = String(r?.origem || '').trim().toLowerCase();
      return acc + (isSuspendedOwnerKey(key, origemRaw) ? 1 : 0);
    }, 0);
    const totalSelected = rows.length;
    const activeCount = Math.max(0, totalSelected - suspendedCount);
    const suspState = triState(suspendedCount, totalSelected);

    // Para Suspender/Ativar, o estado do botão deve refletir QUANTOS serão afetados pela ação.
    // Ex.: se todos estão ativos (0 suspensos), “Suspender” = Todos e “Ativar” = Nenhum.
    const suspendAffectsState = triState(activeCount, totalSelected);
    const activateAffectsState = triState(suspendedCount, totalSelected);

    const icon = (src, alt) => `<img class="wdg-users-bulk-ico" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`;
    const arrow = `<span class="wdg-users-bulk-arrow" aria-hidden="true"></span>`;

    const permBtn = (key, label, iconHtml) => {
      const disabled = !hasPortal;
      let onCount = 0;
      let offCount = 0;
      if (hasPortal) {
        for (const em of portalEmails) {
          const isOn = getPortalPerms(em)?.[key] !== false;
          if (isOn) onCount += 1;
          else offCount += 1;
        }
      }
      const st = disabled ? 'none' : triState(onCount, portalEmails.length);
      const title = disabled
        ? 'Selecione usuários do Portal para alterar permissões.'
        : `${label} (selecionados) — Estado: ${stateLabel(st)}`;

      return `
        <button type="button" class="wdg-users-bulk-btn wdg-users-bulk-btn--icon" ${disabled ? 'disabled' : ''}
          aria-label="${escapeHtml(label)}" data-users-bulk-perm="${escapeHtml(key)}" data-bulk-state="${escapeHtml(st)}" title="${escapeHtml(title)}">
          ${iconHtml}
        </button>`;
    };

    const suspendMeta = (() => {
      const st = suspendAffectsState;
      const title = st === 'none' ? 'Suspender selecionados (nenhum ativo).' : st === 'partial' ? 'Suspender selecionados (parcial).' : 'Suspender selecionados (todos).';
      return { disabled: st === 'none', state: st, title };
    })();

    const activateMeta = (() => {
      const st = activateAffectsState;
      const title = st === 'none' ? 'Ativar selecionados (nenhum suspenso).' : st === 'partial' ? 'Ativar selecionados (parcial).' : 'Ativar selecionados (todos).';
      return { disabled: st === 'none', state: st, title };
    })();

    const suspendBtn = `
      <button type="button" class="wdg-users-bulk-btn wdg-users-bulk-btn--icon" data-users-bulk-suspend="1"
        ${suspendMeta.disabled ? 'disabled' : ''} data-bulk-state="${escapeHtml(suspendMeta.state)}" aria-label="Suspender selecionados" title="${escapeHtml(suspendMeta.title)}">
        ${icon('/images/pause.png','Suspender')}
      </button>`;
    const activateBtn = `
      <button type="button" class="wdg-users-bulk-btn wdg-users-bulk-btn--icon" data-users-bulk-activate="1"
        ${activateMeta.disabled ? 'disabled' : ''} data-bulk-state="${escapeHtml(activateMeta.state)}" aria-label="Ativar selecionados" title="${escapeHtml(activateMeta.title)}">
        ${icon('/images/play.png','Ativar')}
      </button>`;

    // Regra: mostra apenas UM botão (Suspender OU Ativar) conforme maioria/estado.
    // - Se todos suspensos: mostra Ativar
    // - Se nenhum suspenso: mostra Suspender
    // - Se maioria suspensa (ou empate): mostra Ativar
    // - Se maioria ativa: mostra Suspender
    let showAction = 'suspend';
    if (suspendedCount <= 0) showAction = 'suspend';
    else if (activeCount <= 0) showAction = 'activate';
    else if (suspendedCount >= activeCount) showAction = 'activate';
    else showAction = 'suspend';
    const suspToggleBtn = (showAction === 'activate') ? activateBtn : suspendBtn;

    const p2pIcon = `${icon('/images/pessoal.png','Pessoal')}${arrow}${icon('/images/pessoal.png','Pessoal')}`;
    const p2hIcon = `${icon('/images/pessoal.png','Pessoal')}${arrow}${icon('/images/home.png','Habitação')}`;
    const p2cIcon = `${icon('/images/pessoal.png','Pessoal')}${arrow}${icon('/images/colaborador.png','Colaborador')}`;

    els.usersBulkActions.innerHTML = `
      <div class="wdg-users-bulk-inner" aria-label="Ações em massa">
        ${suspToggleBtn}
        ${permBtn('permitir_pessoal_para_pessoal', 'Pessoal → Pessoal', p2pIcon)}
        ${permBtn('permitir_pessoal_para_habitacao', 'Pessoal → Habitação', p2hIcon)}
        ${permBtn('permitir_pessoal_para_colaborador', 'Pessoal → Colaborador', p2cIcon)}
      </div>`;
    els.usersBulkActions.style.display = '';
  }

  function bulkSetSuspended(suspended){
    const rows = getSelectedUserRows();
    if (!rows.length) return;

    const portalSet = new Set((collectSuspendedPortal() || []).map(v => String(v || '').trim().toLowerCase()).filter(Boolean));
    const colabSet = new Set((collectSuspendedColab() || []).map(v => String(v || '').trim().toLowerCase()).filter(Boolean));

    for (const r of rows) {
      const ownerKey = normalizeOwnerKey(r?.ownerKey);
      if (!ownerKey) continue;
      const origemNorm = String(r?.origem || '').trim().toLowerCase() === 'portal' ? 'portal' : 'colaborador';
      const set = (origemNorm === 'portal') ? portalSet : colabSet;
      const baseEmail = ownerKeyToEmail(ownerKey);
      if (baseEmail) set.delete(baseEmail);
      if (suspended) set.add(ownerKey);
      else set.delete(ownerKey);
    }

    dirtySuspPortalList = Array.from(portalSet.values()).sort();
    dirtySuspColabList = Array.from(colabSet.values()).sort();
    renderUsersTable();
    showToast(suspended ? 'Suspensão aplicada aos selecionados (pendente salvar).' : 'Ativação aplicada aos selecionados (pendente salvar).', 'success');
  }

  function bulkTogglePortalPerm(key){
    const k = String(key || '').trim();
    if (!k) return;
    const rows = getSelectedUserRows().filter(r => r?.origem === 'portal' && r?.email);
    const emails = Array.from(new Set(rows.map(r => r.email))).filter(Boolean);
    if (!emails.length) {
      showToast('Selecione usuários do Portal para alterar permissões.', 'info');
      return;
    }
    const allOn = emails.every(em => getPortalPerms(em)?.[k] !== false);
    const next = !allOn;
    for (const em of emails) setPortalPerm(em, k, next);
    renderUsersTable();
    const label = (k === 'permitir_pessoal_para_pessoal') ? 'Pessoal → Pessoal'
      : (k === 'permitir_pessoal_para_habitacao') ? 'Pessoal → Habitação'
      : (k === 'permitir_pessoal_para_colaborador') ? 'Pessoal → Colaborador'
      : k;
    showToast(`${next ? 'Ativada' : 'Desativada'} permissão "${label}" para selecionados.`, 'success');
    scheduleAutoSaveSettings({ successMsg: 'Permissões salvas.', failMsg: 'Falha ao salvar permissões.' });
  }

  function setSuspendedEmail(email, origem, suspended){
    const ownerKey = normalizeOwnerKey(email);
    if (!ownerKey) return;
    const origemNorm = String(origem || '').trim().toLowerCase() === 'portal' ? 'portal' : 'colaborador';
    const base = origemNorm === 'portal' ? collectSuspendedPortal() : collectSuspendedColab();
    const set = new Set((Array.isArray(base) ? base : []).map(v => String(v || '').trim().toLowerCase()).filter(Boolean));
    const baseEmail = ownerKeyToEmail(ownerKey);

    // Se existia suspensão "legada" por e-mail puro, remove para permitir granularidade por contexto.
    if (baseEmail) set.delete(baseEmail);

    if (suspended) set.add(ownerKey);
    else set.delete(ownerKey);

    const next = Array.from(set.values()).sort();
    if (origemNorm === 'portal') dirtySuspPortalList = next;
    else dirtySuspColabList = next;
    renderUsersTable();
  }

  async function loadMailboxes(){
    try {
      const unidadeId = getUnidadeId();
      if (!unidadeId) return;

      setLoading(els.mailboxList, 4);
      const data = await fetchJson(`${basePath}/api/msg/admin/mailboxes?unidade_id=${encodeURIComponent(unidadeId)}`);
      const list = Array.isArray(data?.data) ? data.data : [];

      mailboxesList = Array.isArray(list) ? list : [];
      mailboxesById = new Map();
      for (const mb of mailboxesList) {
        const id = String(mb?.id || '').trim();
        if (!id) continue;
        mailboxesById.set(id, mb);
      }
      mailboxesPage = 1;
      renderMailboxesTable();
    } catch (e) {
      setLoadError(els.mailboxList, 4, e?.message || 'Falha ao carregar caixas.');
      showToast(e?.message || 'Falha ao carregar caixas.', 'error');
      throw e;
    }
  }

  async function toggleMailbox(id, ativo){
    if (!id) return;
    await setMailboxStatus(id, ativo);
    showToast('Status da caixa atualizado.', 'success');
    await loadMailboxes();
  }

  async function deleteMailboxAdmin(id){
    if (!id) return;
    const mb = mailboxesById?.get(String(id)) || null;
    const name = String(mb?.name || '').trim();
    const type = String(mb?.type || '').trim().toLowerCase();
    const linkType = String(mb?.link_type || mb?.linkType || '').trim().toLowerCase();
    const linkId = String(mb?.link_id || mb?.linkId || '').trim();

    // Guarda defensiva: UI já oculta, mas evita exclusão via DOM/console.
    if (!(canAdminDeleteMailbox && type === 'grupo' && !linkType && !linkId)) {
      showToast('Esta caixa não pode ser excluída (apenas caixas de grupo criadas manualmente).', 'error');
      return;
    }

    await fetchJson(`${basePath}/api/msg/admin/mailboxes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    try { selectedMailboxIds.delete(String(id)); } catch { /* noop */ }
    showToast(`Caixa excluída: ${name ? '"' + name + '"' : id}`, 'success');
    await loadMailboxes();
  }

  async function setMailboxStatus(id, ativo){
    if (!id) return;
    await fetchJson(`${basePath}/api/msg/admin/mailboxes/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: !!ativo })
    });
  }

  async function bulkSetMailboxesActive(ativo){
    const rows = getSelectedMailboxRows();
    if (!rows.length) return;
    const target = !!ativo;
    const ids = rows
      .filter(mb => (mb?.ativo !== false) !== target)
      .map(mb => String(mb?.id || '').trim())
      .filter(Boolean);

    if (!ids.length) {
      showToast(target ? 'Todas as selecionadas já estão ativas.' : 'Todas as selecionadas já estão suspensas.', 'info');
      return;
    }

    try {
      await Promise.all(ids.map(id => setMailboxStatus(id, target)));
      await loadMailboxes();
      showToast(target ? 'Caixas ativadas (selecionadas).' : 'Caixas suspensas (selecionadas).', 'success');
    } catch (e) {
      showToast(e?.message || 'Falha ao atualizar caixas selecionadas.', 'error');
    }
  }

  async function loadMetricsUsers(){
    try {
      const unidadeId = getUnidadeId();
      if (!unidadeId) return;
      const { from, to } = getRange();

      setLoading(els.metricsUsers, 5);
      const q = new URLSearchParams({ unidade_id: unidadeId });
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      const data = await fetchJson(`${basePath}/api/msg/admin/metrics/users?${q.toString()}`);

      const list = Array.isArray(data?.data) ? data.data : [];
      const totals = data?.totals || null;
      renderKpiTotals('users', totals);

      // Best-effort (com fallback visual no erro)
      loadKpiUsersSeries();

      metricsUsersList = Array.isArray(list) ? list : [];
      metricsUsersPage = 1;
      renderMetricsUsersTable();
    } catch (e) {
      setLoadError(els.metricsUsers, 5, e?.message || 'Falha ao carregar métricas de usuários.');
      showToast(e?.message || 'Falha ao carregar métricas de usuários.', 'error');
      throw e;
    }
  }

  async function loadMetricsMailboxes(){
    try {
      const unidadeId = getUnidadeId();
      if (!unidadeId) return;
      const { from, to } = getRange();

      setLoading(els.metricsMailboxes, 6);
      const q = new URLSearchParams({ unidade_id: unidadeId });
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      const data = await fetchJson(`${basePath}/api/msg/admin/metrics/mailboxes?${q.toString()}`);

      const list = Array.isArray(data?.data) ? data.data : [];
      const totals = data?.totals || null;
      renderKpiTotals('mailboxes', totals);

      // Best-effort (com fallback visual no erro)
      loadKpiMailboxesSeries();

      metricsMailboxesList = Array.isArray(list) ? list : [];
      metricsMailboxesPage = 1;
      renderMetricsMailboxesTable();
    } catch (e) {
      setLoadError(els.metricsMailboxes, 6, e?.message || 'Falha ao carregar métricas de caixas.');
      showToast(e?.message || 'Falha ao carregar métricas de caixas.', 'error');
      throw e;
    }
  }

  async function refreshMetrics(opts = {}){
    const silent = !!opts.silent;
    const successMsg = (opts && Object.prototype.hasOwnProperty.call(opts, 'successMsg')) ? String(opts.successMsg || '') : 'Métricas atualizadas.';
    try {
      await Promise.all([loadMetricsUsers(), loadMetricsMailboxes()]);
      if (!silent && successMsg) showToast(successMsg, 'success');
    } catch (e) {
      showToast(e?.message || 'Falha ao carregar métricas.', 'error');
    }
  }

  async function refreshAll(){
    try {
      await loadSettings();

      // Se não tem permissão, loadSettings já renderizou o estado de acesso negado.
      // Evita disparar os demais endpoints e gerar spam de erros.
      if (els.save && els.save.disabled) return;

      const steps = [
        { key: 'Usuários', run: () => loadUsers() },
        { key: 'Caixas', run: () => loadMailboxes() },
        { key: 'Métricas (Usuários)', run: () => loadMetricsUsers() },
        { key: 'Métricas (Caixas)', run: () => loadMetricsMailboxes() }
      ];

      const results = await Promise.allSettled(steps.map(s => Promise.resolve().then(() => s.run())));
      const failed = [];
      results.forEach((r, i) => {
        if (r.status === 'rejected') failed.push(steps[i].key);
      });

      if (!failed.length) {
        showToast('Atualizado.', 'success');
      } else {
        showToast(`Alguns blocos falharam: ${failed.join(', ')}`, 'error');
      }
    } catch (e) {
      const st = Number(e?.status || 0) || 0;
      if (st === 401 || st === 403) {
        renderAccessDenied('Acesso negado.');
        return;
      }
      showToast(e?.message || 'Falha ao atualizar.', 'error');
    }
  }

  function initDefaults(bootUser, allowList){
    // Unidade default
    try {
      if (!els.unidade) return;
      const userUnit = String(bootUser?.unidade_id || '').trim();
      const stored = allowList ? tryLoadSelectedAdminUnitIdFromStorage() : '';
      const pick = (stored || userUnit);
      if (pick) {
        const has = Array.from(els.unidade.options).some(o => String(o.value) === pick);
        if (has) els.unidade.value = pick;
      }
    } catch {
      // noop
    }

    // Datas default (últimos 30 dias)
    const now = new Date();
    const from = new Date(now.getTime() - 30*24*60*60*1000);
    if (els.from && !els.from.value) els.from.value = toISODate(from);
    if (els.to && !els.to.value) els.to.value = toISODate(now);
  }

    function bind(options = {}){
      const bootUser = options?.bootUser || getBootUser();
      const allowList = (options?.allowList !== undefined) ? !!options.allowList : isMasterOrAdmin(bootUser?.role);

      if (els.unidade && !els.unidade.__wdgBound) {
        els.unidade.__wdgBound = true;
        if (allowList) {
          els.unidade.addEventListener('change', () => {
            try { trySaveSelectedAdminUnitIdToStorage(String(els.unidade?.value || '').trim()); } catch { /* noop */ }
            refreshAll();
          });
        }
      }

      if (els.refreshAll && !els.refreshAll.__wdgBound) {
        els.refreshAll.__wdgBound = true;
        els.refreshAll.addEventListener('click', () => refreshAll());
      }
      if (els.save && !els.save.__wdgBound) {
        els.save.__wdgBound = true;
        els.save.addEventListener('click', async () => {
      try {
        await saveSettings();
      } catch (e) {
        showToast(e?.message || 'Falha ao salvar.', 'error');
      }
        });
      }

      // Controles de busca/filtro/limpar/recarregar dos usuários foram removidos do UI.
      // A tabela continua funcionando via filtros por coluna e refreshAll().

      if (els.usersSearch && !els.usersSearch.__wdgBound) {
        els.usersSearch.__wdgBound = true;
        els.usersSearch.addEventListener('input', () => {
          usersQuery = getUsersQuery();
          usersPage = 1;
          renderUsersTable();
        });
      }

      if (els.usersFilter && !els.usersFilter.__wdgBound) {
        els.usersFilter.__wdgBound = true;
        els.usersFilter.addEventListener('change', () => {
          usersFilter = String(els.usersFilter.value || 'all');
          usersPage = 1;
          renderUsersTable();
        });
      }

      if (els.usersPageSize && !els.usersPageSize.__wdgBound) {
        els.usersPageSize.__wdgBound = true;
        els.usersPageSize.addEventListener('change', () => {
          usersPageSize = Number(els.usersPageSize.value) || 50;
          usersPage = 1;
          renderUsersTable();
        });
      }

      if (els.usersBulkActions && !els.usersBulkActions.__wdgBound) {
        els.usersBulkActions.__wdgBound = true;
        els.usersBulkActions.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!t) return;

          const susp = t.closest && t.closest('[data-users-bulk-suspend]');
          if (susp) {
            bulkSetSuspended(true);
            return;
          }
          const act = t.closest && t.closest('[data-users-bulk-activate]');
          if (act) {
            bulkSetSuspended(false);
            return;
          }
          const perm = t.closest && t.closest('[data-users-bulk-perm]');
          if (perm) {
            const k = String(perm.getAttribute('data-users-bulk-perm') || '').trim();
            bulkTogglePortalPerm(k);
          }
        });
      }

      if (els.usersPrev && !els.usersPrev.__wdgBound) {
        els.usersPrev.__wdgBound = true;
        els.usersPrev.addEventListener('click', () => {
          usersPage = Math.max(1, usersPage - 1);
          renderUsersTable();
        });
      }

      if (els.usersNext && !els.usersNext.__wdgBound) {
        els.usersNext.__wdgBound = true;
        els.usersNext.addEventListener('click', () => {
          usersPage = usersPage + 1;
          renderUsersTable();
        });
      }

      if (els.usersTable && !els.usersTable.__wdgBound) {
        els.usersTable.__wdgBound = true;
        els.usersTable.addEventListener('change', (ev) => {
          const t = ev.target;
          if (!t) return;

          const sel = t.closest && t.closest('[data-user-select]');
          if (sel) {
            const key = String(sel.getAttribute('data-user-key') || '').trim();
            if (!key) return;
            if (sel.checked) selectedUserKeys.add(key);
            else selectedUserKeys.delete(key);
            renderUsersTable();
            return;
          }

          const perm = t.closest && t.closest('[data-user-perm]');
          if (perm) {
            const email = String(perm.getAttribute('data-user-email') || '').trim();
            const k = String(perm.getAttribute('data-user-perm') || '').trim();
            if (!email || !k) return;
            setPortalPerm(email, k, !!perm.checked);
            // Re-render para refletir em outras linhas do mesmo e-mail e atualizar ações em massa.
            renderUsersTable();
            scheduleAutoSaveSettings({ successMsg: 'Permissões salvas.', failMsg: 'Falha ao salvar permissões.' });
            return;
          }
        });
        els.usersTable.addEventListener('click', (ev) => {
          const btn = ev.target?.closest('[data-user-toggle-susp-key]');
          const ownerKey = btn?.getAttribute('data-user-toggle-susp-key');
          const origem = btn?.getAttribute('data-user-origem') || '';
          if (!ownerKey) return;
          const isSusp = isSuspendedOwnerKey(ownerKey, origem);
          setSuspendedEmail(ownerKey, origem, !isSusp);
        });
      }

      if (els.usersHead && !els.usersHead.__wdgBound) {
        els.usersHead.__wdgBound = true;
        els.usersHead.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!t) return;

          const sortBtn = t.closest && t.closest('[data-users-sort]');
          if (sortBtn) {
            const key = String(sortBtn.getAttribute('data-users-sort') || '').trim().toLowerCase();
            if (!key) return;
            if (usersSortKey === key) usersSortDir = (usersSortDir === 'desc') ? 'asc' : 'desc';
            else {
              usersSortKey = key;
              usersSortDir = 'asc';
            }
            renderUsersTable();
            return;
          }

          const filterBtn = t.closest && t.closest('[data-users-filter]');
          if (filterBtn) {
            const key = String(filterBtn.getAttribute('data-users-filter') || '').trim().toLowerCase();
            if (!key) return;
            if (usersFilterPanel && usersFilterPanel.style.display !== 'none' && usersFilterPanelKey === key) {
              closeUsersFilterPanel();
              return;
            }
            openUsersFilterPanel(key, filterBtn);
          }
        });
      }

      if (!document.body.__wdgUsersFilterPanelBound) {
        document.body.__wdgUsersFilterPanelBound = true;
        document.body.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!t) return;

          const markAll = t.closest && t.closest('[data-users-filter-markall]');
          if (markAll) {
            if (!usersFilterPanel) return;
            const k = String(markAll.getAttribute('data-users-filter-markall') || '').trim().toLowerCase();
            if (!k) return;
            const inputs = usersFilterPanel.querySelectorAll(`input[data-users-filter-item="1"][data-users-filter-key="${k}"]`);
            inputs.forEach(i => { i.checked = true; });
            return;
          }

          const unmarkAll = t.closest && t.closest('[data-users-filter-unmarkall]');
          if (unmarkAll) {
            if (!usersFilterPanel) return;
            const k = String(unmarkAll.getAttribute('data-users-filter-unmarkall') || '').trim().toLowerCase();
            if (!k) return;
            const inputs = usersFilterPanel.querySelectorAll(`input[data-users-filter-item="1"][data-users-filter-key="${k}"]`);
            inputs.forEach(i => { i.checked = false; });
            return;
          }

          const apply = t.closest && t.closest('[data-users-filter-apply]');
          if (apply) {
            const k = String(apply.getAttribute('data-users-filter-apply') || '').trim().toLowerCase();
            applyUsersFilterPanel(k);
            return;
          }
          const clear = t.closest && t.closest('[data-users-filter-clear]');
          if (clear) {
            const k = String(clear.getAttribute('data-users-filter-clear') || '').trim().toLowerCase();
            clearUsersFilter(k);
          }
        });

        document.body.addEventListener('input', (ev) => {
          const t = ev.target;
          const inp = t && t.matches && t.matches('input[data-users-filter-search]') ? t : null;
          if (!inp || !usersFilterPanel) return;
          const q = String(inp.value || '').trim().toLowerCase();
          const items = usersFilterPanel.querySelectorAll('[data-users-filter-opt="1"]');
          items.forEach(it => {
            const label = String(it.getAttribute('data-users-filter-label') || '').trim().toLowerCase();
            const show = !q || (label && label.includes(q));
            it.style.display = show ? '' : 'none';
          });
        });
      }

      if (els.usersCheckAll && !els.usersCheckAll.__wdgBound) {
        els.usersCheckAll.__wdgBound = true;
        els.usersCheckAll.addEventListener('change', () => {
          const keys = Array.isArray(lastRenderedUserKeys) ? lastRenderedUserKeys : [];
          if (!keys.length) return;
          if (els.usersCheckAll.checked) {
            keys.forEach(k => selectedUserKeys.add(k));
          } else {
            keys.forEach(k => selectedUserKeys.delete(k));
          }
          renderUsersTable();
        });
      }

      // Bloco Caixas (grupo/públicas/habitação): agora segue o mesmo padrão da tabela de usuários.

      if (els.mailboxPageSize && !els.mailboxPageSize.__wdgBound) {
        els.mailboxPageSize.__wdgBound = true;
        els.mailboxPageSize.addEventListener('change', () => {
          mailboxesPageSize = Number(els.mailboxPageSize.value) || 50;
          mailboxesPage = 1;
          renderMailboxesTable();
        });
      }

      if (els.mailboxPrev && !els.mailboxPrev.__wdgBound) {
        els.mailboxPrev.__wdgBound = true;
        els.mailboxPrev.addEventListener('click', () => {
          mailboxesPage = Math.max(1, mailboxesPage - 1);
          renderMailboxesTable();
        });
      }

      if (els.mailboxNext && !els.mailboxNext.__wdgBound) {
        els.mailboxNext.__wdgBound = true;
        els.mailboxNext.addEventListener('click', () => {
          mailboxesPage = mailboxesPage + 1;
          renderMailboxesTable();
        });
      }

      if (els.mailboxBulkActions && !els.mailboxBulkActions.__wdgBound) {
        els.mailboxBulkActions.__wdgBound = true;
        els.mailboxBulkActions.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!t) return;
          const susp = t.closest && t.closest('[data-mb-bulk-suspend]');
          if (susp) {
            bulkSetMailboxesActive(false);
            return;
          }
          const act = t.closest && t.closest('[data-mb-bulk-activate]');
          if (act) {
            bulkSetMailboxesActive(true);
          }
        });
      }

      if (els.mailboxHead && !els.mailboxHead.__wdgBound) {
        els.mailboxHead.__wdgBound = true;
        els.mailboxHead.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!t) return;

          const sortBtn = t.closest && t.closest('[data-mb-sort]');
          if (sortBtn) {
            const key = String(sortBtn.getAttribute('data-mb-sort') || '').trim().toLowerCase();
            if (!key) return;
            if (mailboxesSortKey === key) mailboxesSortDir = (mailboxesSortDir === 'desc') ? 'asc' : 'desc';
            else {
              mailboxesSortKey = key;
              mailboxesSortDir = 'asc';
            }
            renderMailboxesTable();
            return;
          }

          const filterBtn = t.closest && t.closest('[data-mb-filter]');
          if (filterBtn) {
            const key = String(filterBtn.getAttribute('data-mb-filter') || '').trim().toLowerCase();
            if (!key) return;
            if (mailboxesFilterPanel && mailboxesFilterPanel.style.display !== 'none' && mailboxesFilterPanelKey === key) {
              closeMailboxesFilterPanel();
              return;
            }
            openMailboxesFilterPanel(key, filterBtn);
          }
        });
      }

      if (!document.body.__wdgMailboxesFilterPanelBound) {
        document.body.__wdgMailboxesFilterPanelBound = true;

        document.body.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!t) return;

          const markAll = t.closest && t.closest('[data-mb-filter-markall]');
          if (markAll) {
            if (!mailboxesFilterPanel) return;
            const k = String(markAll.getAttribute('data-mb-filter-markall') || '').trim().toLowerCase();
            if (!k) return;
            const inputs = mailboxesFilterPanel.querySelectorAll(`input[data-mb-filter-item="1"][data-mb-filter-key="${k}"]`);
            inputs.forEach(i => { i.checked = true; });
            return;
          }

          const unmarkAll = t.closest && t.closest('[data-mb-filter-unmarkall]');
          if (unmarkAll) {
            if (!mailboxesFilterPanel) return;
            const k = String(unmarkAll.getAttribute('data-mb-filter-unmarkall') || '').trim().toLowerCase();
            if (!k) return;
            const inputs = mailboxesFilterPanel.querySelectorAll(`input[data-mb-filter-item="1"][data-mb-filter-key="${k}"]`);
            inputs.forEach(i => { i.checked = false; });
            return;
          }

          const apply = t.closest && t.closest('[data-mb-filter-apply]');
          if (apply) {
            const k = String(apply.getAttribute('data-mb-filter-apply') || '').trim().toLowerCase();
            applyMailboxesFilterPanel(k);
            return;
          }
          const clear = t.closest && t.closest('[data-mb-filter-clear]');
          if (clear) {
            const k = String(clear.getAttribute('data-mb-filter-clear') || '').trim().toLowerCase();
            clearMailboxesFilter(k);
          }
        });

        document.body.addEventListener('input', (ev) => {
          const t = ev.target;
          const inp = t && t.matches && t.matches('input[data-mb-filter-search]') ? t : null;
          if (!inp || !mailboxesFilterPanel) return;
          const q = String(inp.value || '').trim().toLowerCase();
          const items = mailboxesFilterPanel.querySelectorAll('[data-mb-filter-opt="1"]');
          items.forEach(it => {
            const label = String(it.getAttribute('data-mb-filter-label') || '').trim().toLowerCase();
            const show = !q || (label && label.includes(q));
            it.style.display = show ? '' : 'none';
          });
        });
      }

      if (els.mailboxCheckAll && !els.mailboxCheckAll.__wdgBound) {
        els.mailboxCheckAll.__wdgBound = true;
        els.mailboxCheckAll.addEventListener('change', () => {
          const ids = Array.isArray(lastRenderedMailboxIds) ? lastRenderedMailboxIds : [];
          if (!ids.length) return;
          if (els.mailboxCheckAll.checked) {
            ids.forEach(id => selectedMailboxIds.add(id));
          } else {
            ids.forEach(id => selectedMailboxIds.delete(id));
          }
          renderMailboxesTable();
        });
      }

      if (els.mailboxList && !els.mailboxList.__wdgBound) {
        els.mailboxList.__wdgBound = true;

        els.mailboxList.addEventListener('change', (ev) => {
          const t = ev.target;
          if (!t) return;
          const sel = t.closest && t.closest('[data-mailbox-select]');
          if (!sel) return;
          const id = String(sel.getAttribute('data-mailbox-id') || '').trim();
          if (!id) return;
          if (sel.checked) selectedMailboxIds.add(id);
          else selectedMailboxIds.delete(id);
          renderMailboxesTable();
        });

        els.mailboxList.addEventListener('click', async (ev) => {
          const delBtn = ev.target?.closest('[data-mailbox-delete]');
          if (delBtn) {
            const id = String(delBtn.getAttribute('data-mailbox-delete') || '').trim();
            if (!id) return;
            const mb = mailboxesById?.get(String(id)) || null;
            const name = String(mb?.name || '').trim();
            const label = name ? `"${name}"` : id;
            if (!confirm(`Excluir definitivamente a caixa ${label}?\n\nAtenção: esta ação não pode ser desfeita.`)) return;
            try {
              await deleteMailboxAdmin(id);
            } catch (e) {
              const msgRaw = String(e?.message || '').trim();
              const st = Number(e?.status || 0) || 0;
              if (st === 403) showToast('Acesso negado: somente Master/Admin pode excluir caixas.', 'error');
              else if (st === 404) showToast('Caixa não encontrada (pode ter sido removida por outro usuário).', 'error');
              else if (st === 400) showToast(`Não foi possível excluir: ${msgRaw || 'caixa não elegível.'}`, 'error');
              else showToast(msgRaw || 'Falha ao excluir a caixa.', 'error');
            }
            return;
          }

          const btn = ev.target?.closest('[data-mailbox-toggle]');
          if (!btn) return;
          const id = String(btn.getAttribute('data-mailbox-toggle') || '').trim();
          const next = String(btn.getAttribute('data-mailbox-next') || '1') === '1';
          try {
            await toggleMailbox(id, next);
          } catch (e) {
            showToast(e?.message || 'Falha ao atualizar status da caixa.', 'error');
          }
        });
      }

      if (els.reloadMetrics && !els.reloadMetrics.__wdgBound) {
        els.reloadMetrics.__wdgBound = true;
        els.reloadMetrics.addEventListener('click', async () => {
          await refreshMetrics({ silent: false, successMsg: 'Métricas atualizadas.' });
        });
      }

      if (els.metricsUsersPageSize && !els.metricsUsersPageSize.__wdgBound) {
        els.metricsUsersPageSize.__wdgBound = true;
        els.metricsUsersPageSize.addEventListener('change', () => {
          metricsUsersPageSize = Number(els.metricsUsersPageSize.value) || 25;
          metricsUsersPage = 1;
          renderMetricsUsersTable();
        });
      }

      if (els.metricsUsersHead && !els.metricsUsersHead.__wdgBound) {
        els.metricsUsersHead.__wdgBound = true;
        els.metricsUsersHead.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!t) return;

          const filterBtn = t.closest && t.closest('[data-mu-filter]');
          if (filterBtn) {
            const key = String(filterBtn.getAttribute('data-mu-filter') || '').trim().toLowerCase();
            if (!key) return;
            if (metricsUsersFilterPanel && metricsUsersFilterPanel.style.display !== 'none' && metricsUsersFilterPanelKey === key) {
              closeMetricsUsersFilterPanel();
              return;
            }
            openMetricsUsersFilterPanel(key, filterBtn);
            return;
          }

          const sortBtn = t.closest && t.closest('[data-mu-sort]');
          if (!sortBtn) return;
          const key = String(sortBtn.getAttribute('data-mu-sort') || '').trim().toLowerCase();
          if (!key) return;
          if (metricsUsersSortKey === key) metricsUsersSortDir = (metricsUsersSortDir === 'desc') ? 'asc' : 'desc';
          else {
            metricsUsersSortKey = key;
            metricsUsersSortDir = (key === 'user') ? 'asc' : 'desc';
          }
          metricsUsersPage = 1;
          renderMetricsUsersTable();
        });
      }

      if (els.metricsUsersPrev && !els.metricsUsersPrev.__wdgBound) {
        els.metricsUsersPrev.__wdgBound = true;
        els.metricsUsersPrev.addEventListener('click', () => {
          metricsUsersPage = Math.max(1, metricsUsersPage - 1);
          renderMetricsUsersTable();
        });
      }

      if (els.metricsUsersNext && !els.metricsUsersNext.__wdgBound) {
        els.metricsUsersNext.__wdgBound = true;
        els.metricsUsersNext.addEventListener('click', () => {
          metricsUsersPage = metricsUsersPage + 1;
          renderMetricsUsersTable();
        });
      }

      if (els.metricsMailboxesPageSize && !els.metricsMailboxesPageSize.__wdgBound) {
        els.metricsMailboxesPageSize.__wdgBound = true;
        els.metricsMailboxesPageSize.addEventListener('change', () => {
          metricsMailboxesPageSize = Number(els.metricsMailboxesPageSize.value) || 25;
          metricsMailboxesPage = 1;
          renderMetricsMailboxesTable();
        });
      }

      if (els.metricsMailboxesHead && !els.metricsMailboxesHead.__wdgBound) {
        els.metricsMailboxesHead.__wdgBound = true;
        els.metricsMailboxesHead.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!t) return;

          const filterBtn = t.closest && t.closest('[data-mm-filter]');
          if (filterBtn) {
            const key = String(filterBtn.getAttribute('data-mm-filter') || '').trim().toLowerCase();
            if (!key) return;
            if (metricsMailboxesFilterPanel && metricsMailboxesFilterPanel.style.display !== 'none' && metricsMailboxesFilterPanelKey === key) {
              closeMetricsMailboxesFilterPanel();
              return;
            }
            openMetricsMailboxesFilterPanel(key, filterBtn);
            return;
          }

          const sortBtn = t.closest && t.closest('[data-mm-sort]');
          if (!sortBtn) return;
          const key = String(sortBtn.getAttribute('data-mm-sort') || '').trim().toLowerCase();
          if (!key) return;
          if (metricsMailboxesSortKey === key) metricsMailboxesSortDir = (metricsMailboxesSortDir === 'desc') ? 'asc' : 'desc';
          else {
            metricsMailboxesSortKey = key;
            metricsMailboxesSortDir = (key === 'mailbox' || key === 'type') ? 'asc' : 'desc';
          }
          metricsMailboxesPage = 1;
          renderMetricsMailboxesTable();
        });
      }

      if (!document.body.__wdgMetricsFilterPanelBound) {
        document.body.__wdgMetricsFilterPanelBound = true;

        document.body.addEventListener('click', (ev) => {
          const t = ev.target;
          if (!t) return;

          // Users metrics
          const muMarkAll = t.closest && t.closest('[data-mu-filter-markall]');
          if (muMarkAll) {
            if (!metricsUsersFilterPanel) return;
            const k = String(muMarkAll.getAttribute('data-mu-filter-markall') || '').trim().toLowerCase();
            const inputs = metricsUsersFilterPanel.querySelectorAll(`input[data-mu-filter-item="1"][data-mu-filter-key="${k}"]`);
            inputs.forEach(i => { i.checked = true; });
            return;
          }
          const muUnmarkAll = t.closest && t.closest('[data-mu-filter-unmarkall]');
          if (muUnmarkAll) {
            if (!metricsUsersFilterPanel) return;
            const k = String(muUnmarkAll.getAttribute('data-mu-filter-unmarkall') || '').trim().toLowerCase();
            const inputs = metricsUsersFilterPanel.querySelectorAll(`input[data-mu-filter-item="1"][data-mu-filter-key="${k}"]`);
            inputs.forEach(i => { i.checked = false; });
            return;
          }
          const muApply = t.closest && t.closest('[data-mu-filter-apply]');
          if (muApply) {
            const k = String(muApply.getAttribute('data-mu-filter-apply') || '').trim().toLowerCase();
            applyMetricsUsersFilterPanel(k);
            return;
          }
          const muClear = t.closest && t.closest('[data-mu-filter-clear]');
          if (muClear) {
            const k = String(muClear.getAttribute('data-mu-filter-clear') || '').trim().toLowerCase();
            clearMetricsUsersFilter(k);
            return;
          }

          // Mailboxes metrics
          const mmMarkAll = t.closest && t.closest('[data-mm-filter-markall]');
          if (mmMarkAll) {
            if (!metricsMailboxesFilterPanel) return;
            const k = String(mmMarkAll.getAttribute('data-mm-filter-markall') || '').trim().toLowerCase();
            const inputs = metricsMailboxesFilterPanel.querySelectorAll(`input[data-mm-filter-item="1"][data-mm-filter-key="${k}"]`);
            inputs.forEach(i => { i.checked = true; });
            return;
          }
          const mmUnmarkAll = t.closest && t.closest('[data-mm-filter-unmarkall]');
          if (mmUnmarkAll) {
            if (!metricsMailboxesFilterPanel) return;
            const k = String(mmUnmarkAll.getAttribute('data-mm-filter-unmarkall') || '').trim().toLowerCase();
            const inputs = metricsMailboxesFilterPanel.querySelectorAll(`input[data-mm-filter-item="1"][data-mm-filter-key="${k}"]`);
            inputs.forEach(i => { i.checked = false; });
            return;
          }
          const mmApply = t.closest && t.closest('[data-mm-filter-apply]');
          if (mmApply) {
            const k = String(mmApply.getAttribute('data-mm-filter-apply') || '').trim().toLowerCase();
            applyMetricsMailboxesFilterPanel(k);
            return;
          }
          const mmClear = t.closest && t.closest('[data-mm-filter-clear]');
          if (mmClear) {
            const k = String(mmClear.getAttribute('data-mm-filter-clear') || '').trim().toLowerCase();
            clearMetricsMailboxesFilter(k);
            return;
          }
        });

        document.body.addEventListener('input', (ev) => {
          const t = ev.target;
          if (!t) return;

          const muSearch = t.matches && t.matches('input[data-mu-filter-search]') ? t : null;
          if (muSearch && metricsUsersFilterPanel) {
            const q = String(muSearch.value || '').trim().toLowerCase();
            const items = metricsUsersFilterPanel.querySelectorAll('[data-mu-filter-opt="1"]');
            items.forEach(it => {
              const label = String(it.getAttribute('data-mu-filter-label') || '').trim().toLowerCase();
              it.style.display = (!q || (label && label.includes(q))) ? '' : 'none';
            });
            return;
          }

          const mmSearch = t.matches && t.matches('input[data-mm-filter-search]') ? t : null;
          if (mmSearch && metricsMailboxesFilterPanel) {
            const q = String(mmSearch.value || '').trim().toLowerCase();
            const items = metricsMailboxesFilterPanel.querySelectorAll('[data-mm-filter-opt="1"]');
            items.forEach(it => {
              const label = String(it.getAttribute('data-mm-filter-label') || '').trim().toLowerCase();
              it.style.display = (!q || (label && label.includes(q))) ? '' : 'none';
            });
          }
        });
      }

      if (els.metricsMailboxesPrev && !els.metricsMailboxesPrev.__wdgBound) {
        els.metricsMailboxesPrev.__wdgBound = true;
        els.metricsMailboxesPrev.addEventListener('click', () => {
          metricsMailboxesPage = Math.max(1, metricsMailboxesPage - 1);
          renderMetricsMailboxesTable();
        });
      }

      if (els.metricsMailboxesNext && !els.metricsMailboxesNext.__wdgBound) {
        els.metricsMailboxesNext.__wdgBound = true;
        els.metricsMailboxesNext.addEventListener('click', () => {
          metricsMailboxesPage = metricsMailboxesPage + 1;
          renderMetricsMailboxesTable();
        });
      }

    let onDateChangeT = null;
    const onDateChange = () => {
      if (onDateChangeT) clearTimeout(onDateChangeT);
      onDateChangeT = setTimeout(() => {
        refreshMetrics({ silent: true }).catch(() => { /* noop */ });
      }, 350);
    };
      if (els.from && !els.from.__wdgBound) {
        els.from.__wdgBound = true;
        els.from.addEventListener('change', onDateChange);
        els.from.addEventListener('input', onDateChange);
      }
      if (els.to && !els.to.__wdgBound) {
        els.to.__wdgBound = true;
        els.to.addEventListener('change', onDateChange);
        els.to.addEventListener('input', onDateChange);
      }
  }
    (async () => {
      const bootUser = getBootUser();
      const allowList = isMasterOrAdmin(bootUser?.role); // master/admin: pode listar/trocar unidades
      const canUseCfg = allowList || isDiretor(bootUser?.role); // diretor: permitido (escopo da própria unidade no backend)
      canAdminDeleteMailbox = !!allowList; // exclusão admin continua só master/admin

      await ensureUnidadesOptionsLoaded({ bootUser, allowList });
      initDefaults(bootUser, allowList);
      bind({ bootUser, allowList });

      if (!canUseCfg) {
        renderAccessDenied('Acesso negado.');
        return;
      }

      refreshAll();
      if (opts && opts.mode === 'embedded') {
        // Em modo embed, não spammar toast de "Atualizado"; refreshAll já mostra somente em sucesso.
      }
    })();
  }

  try {
    if (typeof window !== 'undefined') {
      window.__wdgMsgCfgGeralInit = initMsgCfgGeral;
    }
  } catch { /* noop */ }
})();
