(function(){
  try { console.log('[dirigencia] build', '2026-01-31-snapshot', 'pageBuildId=', (window && window.__WDG_BUILD_ID) ? window.__WDG_BUILD_ID : ''); } catch {}
  const root = document.getElementById('dirigenciaApp');
  if (!root) return;

  const BASE_PATH = (root && root.dataset && root.dataset.basePath)
    ? String(root.dataset.basePath || '').trim()
    : ((document.body && document.body.dataset && document.body.dataset.basePath) ? String(document.body.dataset.basePath || '').trim() : '/condominios');

  const isScopeAll = (root && root.dataset && String(root.dataset.scopeAll) === 'true') ? true : false;
  const isMaster = (root && root.dataset && String(root.dataset.isMaster) === 'true') ? true : false;
  let canEditDirigencia = (root && root.dataset && String(root.dataset.canEdit) === 'true') ? true : false;
  let canEdit = !!(isScopeAll || canEditDirigencia);
  const userUnit = (root && root.dataset) ? String(root.dataset.userUnit || '').trim() : '';
  const UNIT_PICK_KEY = 'wdg.condominios.dirigencia.unidade.v1';
  // OBS: `unidade.png` é servido em `/images/unidade.png` (não em `${BASE_PATH}/images`).
  const UNIT_ICON_URL = '/images/unidade.png';

  const STORAGE_KEY_LEGACY = 'wdg.condominios.dirigencia.v1';
  const STORAGE_KEY_PREFIX = 'wdg.condominios.dirigencia.unit.v1';
  const PREVIEW_ZOOM_KEY = 'wdg.condominios.dirigencia.previewZoom.v1';
  const ORG_ZOOM_KEY = 'wdg.condominios.dirigencia.orgZoom.v1';

  const __supportsCssZoom = (() => {
    try {
      const el = document.createElement('div');
      return 'zoom' in el.style;
    } catch {
      return false;
    }
  })();

  const __orgLineState = new WeakMap();

  const refs = {
    contentRoot: root.querySelector('.wdg-drg-content'),
    navButtons: Array.from(root.querySelectorAll('.wdg-navbtn[data-view]')),
    jumpButtons: Array.from(root.querySelectorAll('[data-jump]')),
    condoSelects: Array.from(root.querySelectorAll('[data-condo-select]')),
    condoInlineLogos: Array.from(root.querySelectorAll('[data-condo-inline-logo="1"]')),
    condoUserPickHosts: Array.from(root.querySelectorAll('[data-condo-userpick-host="1"]')),
    orgContainer: document.getElementById('orgContainer') || root.querySelector('#orgContainer'),
    orgPreview: document.getElementById('orgPreview') || root.querySelector('#orgPreview'),
    orgPrintLogo: document.getElementById('orgPrintLogo') || root.querySelector('#orgPrintLogo'),
    orgPrintUnitName: document.getElementById('orgPrintUnitName') || root.querySelector('#orgPrintUnitName'),
    orgPrintLines: Array.from(document.querySelectorAll('[data-org-print-line]')),
    orgZoomLabel: document.getElementById('orgZoomLabel') || root.querySelector('#orgZoomLabel'),
    previewZoomLabel: document.getElementById('previewZoomLabel') || root.querySelector('#previewZoomLabel'),
    btnOrgPrint: document.getElementById('btnOrgPrint') || root.querySelector('#btnOrgPrint'),
    btnOrgZoomIn: document.getElementById('btnOrgZoomIn') || root.querySelector('#btnOrgZoomIn'),
    btnOrgZoomOut: document.getElementById('btnOrgZoomOut') || root.querySelector('#btnOrgZoomOut'),
    btnPreviewZoomIn: document.getElementById('btnPreviewZoomIn') || root.querySelector('#btnPreviewZoomIn'),
    btnPreviewZoomOut: document.getElementById('btnPreviewZoomOut') || root.querySelector('#btnPreviewZoomOut'),
    btnRefresh: document.getElementById('btnRefresh') || root.querySelector('#btnRefresh'),
    btnDemo: document.getElementById('btnDemo') || root.querySelector('#btnDemo'),
    btnAddRole: document.getElementById('btnAddRole') || root.querySelector('#btnAddRole'),
    btnSave: document.getElementById('btnSave') || root.querySelector('#btnSave'),
    btnReset: document.getElementById('btnReset') || root.querySelector('#btnReset'),
    btnExport: document.getElementById('btnExport') || root.querySelector('#btnExport'),
    btnClearAssignments: document.getElementById('btnClearAssignments') || root.querySelector('#btnClearAssignments'),
    rolesPager: document.getElementById('rolesPager') || root.querySelector('#rolesPager'),
    rolesTableBody: document.getElementById('rolesTableBody') || root.querySelector('#rolesTableBody'),
    assignmentsContainer: document.getElementById('assignmentsContainer') || root.querySelector('#assignmentsContainer'),
    usersPreview: document.getElementById('usersPreview') || root.querySelector('#usersPreview'),
    kpiRoles: document.getElementById('kpiRoles') || root.querySelector('#kpiRoles'),
    kpiAssigned: document.getElementById('kpiAssigned') || root.querySelector('#kpiAssigned'),
    toastRoot: document.getElementById('toastRoot') || root.querySelector('#toastRoot')
  };

  const panes = {
    inicio: root.querySelector('[data-pane="inicio"]'),
    dirigentes: root.querySelector('[data-pane="dirigentes"]'),
    configuracao: root.querySelector('[data-pane="configuracao"]')
  };

  function getConfigNavButton(){
    try {
      return (refs.navButtons || []).find(b => String(b?.getAttribute('data-view') || '').trim().toLowerCase() === 'configuracao') || null;
    } catch {
      return null;
    }
  }

  function syncConfigVisibility(){
    const btn = getConfigNavButton();
    try { if (btn) btn.classList.toggle('d-none', !canEdit); } catch { /* noop */ }

    // Se o usuário não pode editar, garante que o painel não fique acessível.
    try {
      if (!canEdit && currentView === 'configuracao') {
        setView('dirigentes', { silent: true });
        toast('Configuração disponível apenas para Master/Admin/Diretor.', 'warning');
      }
    } catch { /* noop */ }
  }

  let currentView = 'inicio';
  let selectedUnitId = '';
  let unidadesCache = [];
  let usersCache = [];
  let usersCacheLoaded = false;
  let usersCacheUnitId = '';
  let usersCacheReqId = 0;
  let usersCacheLoadingPromise = null;

  let mandatosAtivosCache = {};
  let mandatosAtivosLoaded = false;
  let mandatosAtivosUnitId = '';
  let mandatosAtivosReqId = 0;
  let mandatosAtivosLoadingPromise = null;

  let __mandatoUiBound = false;
  let __mandatoModalsReady = false;
  let __mandatoModal = null;
  let __mandatoHistoryModal = null;
  let __mandatoEndModal = null;
  let __mandatoDeleteModal = null;

  let rolesPage = 1;
  let rolesPageSize = 10;
  let previewZoomPercent = loadPreviewZoomPercent();
  let orgZoomPercent = loadOrgZoomPercent();
  let state = defaultState();

  let __slotStyleWired = false;

  let __previewDnd = {
    roleId: '',
    visualParentId: '',
    overRoleId: '',
    anchorId: '',
    restrictToBlock: false
  };

  let __slotEditorSuppressClickUntil = 0;

  function setCssVar(el, name, value){
    if (!el || !name) return;
    const v = (value == null) ? '' : String(value);
    if (v) el.style.setProperty(name, v);
    else el.style.removeProperty(name);
  }

  function formatDateBR(value){
    if (!value) return '—';
    try {
      const d = (value instanceof Date) ? value : new Date(value);
      if (!Number.isFinite(d.getTime())) return '—';
      return d.toLocaleDateString('pt-BR');
    } catch {
      return '—';
    }
  }

  function toDateInputValue(value){
    try {
      const d = (value instanceof Date) ? value : new Date(value);
      if (!Number.isFinite(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch {
      return '';
    }
  }

  function dateMinusDays(date, days){
    try {
      const d = (date instanceof Date) ? new Date(date.getTime()) : new Date(date);
      if (!Number.isFinite(d.getTime())) return null;
      d.setDate(d.getDate() - Number(days || 0));
      return d;
    } catch {
      return null;
    }
  }

  async function api(path, opts){
    const url = String(BASE_PATH || '') + String(path || '');
    const method = (opts && opts.method) ? String(opts.method).toUpperCase() : 'GET';
    const canRetry = (method === 'GET');
    const maxAttempts = canRetry ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const resp = await fetch(url, Object.assign({
        credentials: 'same-origin',
        headers: Object.assign({ 'Accept': 'application/json', 'X-Requested-With': 'fetch' }, (opts && opts.headers) || {})
      }, opts || {}));

      let json = null;
      try { json = await resp.json(); } catch { json = null; }

      if (resp.ok) return json;

      const status = Number(resp.status);
      const transient = (status === 502 || status === 503 || status === 504);
      if (!transient || attempt === maxAttempts) {
        const msg = (json && (json.message || json.error)) ? (json.message || json.error) : `HTTP ${resp.status}`;
        const err = new Error(msg);
        try { err.status = resp.status; } catch { /* noop */ }
        try { err.payload = json; } catch { /* noop */ }
        throw err;
      }
      await new Promise(r => setTimeout(r, 200 * attempt));
    }

    return null;
  }

  let __dirigenciaDebugEndpointMissing = false;

  async function refreshCanEditFromServer(unitId){
    // Master/Admin já está resolvido pelo próprio HTML.
    if (isScopeAll) return;
    if (__dirigenciaDebugEndpointMissing) return;
    try {
      const uid = String(unitId || getSelectedUnidadeId() || '').trim();
      const qs = uid ? (`?unidadeId=${encodeURIComponent(uid)}`) : '';
      const json = await api(`/api/dirigencia/_debug/me${qs}`);
      if (!json || json.success === false) return;
      const data = json.data && typeof json.data === 'object' ? json.data : {};
      const isDiretor = !!data.isDiretor;
      const isAll = !!data.isScopeAll;
      const canEditForUnit = (data.canEditDirigenciaForUnidade !== undefined) ? !!data.canEditDirigenciaForUnidade : null;

      const next = (canEditForUnit === null) ? !!(isAll || isDiretor) : !!(isAll || canEditForUnit);
      if (next !== canEdit) {
        canEdit = next;
        canEditDirigencia = next;
        try { root.dataset.canEdit = next ? 'true' : 'false'; } catch { /* noop */ }
        // Atualiza cards de atribuição e botões imediatamente.
        try { renderAssignments(); } catch { /* noop */ }

        // Menu/painel de configuração depende desta flag.
        try { syncConfigVisibility(); } catch { /* noop */ }
      }
    } catch (e) {
      // Se o backend ainda não foi reiniciado, este endpoint pode não existir.
      // Evita repetir chamadas e poluir o console com 404.
      if (e && Number(e.status) === 404) {
        __dirigenciaDebugEndpointMissing = true;
      }
      // Silencioso: não bloqueia a página.
    }
  }

  function getSelectedUnidadeId(){
    const v = String(selectedUnitId || '').trim();
    if (v) return v;
    const u = String(userUnit || '').trim();
    return u;
  }

  async function tryLoadCloudState(unitId){
    const uid = String(unitId || '').trim();
    if (!uid) return null;
    try {
      const json = await api(`/api/dirigencia/${encodeURIComponent(uid)}/state`);
      if (!json || typeof json !== 'object') return null;
      if (json.success === false) return null;
      return {
        notFound: !!json.notFound,
        state: json.state || null,
        updatedAt: json.updatedAt || null,
        updatedBy: json.updatedBy || ''
      };
    } catch {
      return null;
    }
  }

  async function trySaveCloudState(unitId, nextState){
    const uid = String(unitId || '').trim();
    if (!uid) return null;
    const payload = (nextState && typeof nextState === 'object') ? nextState : state;

    try {
      return await api(`/api/dirigencia/${encodeURIComponent(uid)}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: payload })
      });
    } catch {
      return null;
    }
  }

  let __cloudSaveTimer = 0;
  let __cloudSavePendingUnitId = '';
  let __cloudSaveInFlight = null;

  function scheduleCloudSave(unitId){
    const uid = String(unitId || getSelectedUnidadeId() || '').trim();
    if (!uid) return;
    __cloudSavePendingUnitId = uid;

    try { if (__cloudSaveTimer) clearTimeout(__cloudSaveTimer); } catch { /* noop */ }
    __cloudSaveTimer = setTimeout(() => {
      __cloudSaveTimer = 0;
      void flushCloudSave();
    }, 650);
  }

  async function flushCloudSave(){
    const uid = String(__cloudSavePendingUnitId || getSelectedUnidadeId() || '').trim();
    if (!uid) return null;

    // serializa flush
    if (__cloudSaveInFlight) {
      try { await __cloudSaveInFlight; } catch { /* noop */ }
    }

    __cloudSaveInFlight = (async () => {
      try {
        const res = await trySaveCloudState(uid, state);
        return res;
      } finally {
        __cloudSaveInFlight = null;
      }
    })();

    return await __cloudSaveInFlight;
  }

  function setSelectOptions(selectEl, options, selectedValue){
    if (!selectEl) return;
    const list = Array.isArray(options) ? options : [];
    const desired = (selectedValue == null) ? '' : String(selectedValue);

    try { selectEl.innerHTML = ''; } catch {
      try {
        while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
      } catch { /* noop */ }
    }

    list.forEach(o => {
      const opt = document.createElement('option');
      opt.value = String(o?.value ?? '');
      opt.textContent = String(o?.label ?? o?.value ?? '');
      selectEl.appendChild(opt);
    });

    // seleciona valor se existir
    try {
      selectEl.value = desired;
      if (desired && selectEl.value !== desired) {
        // se o valor não existe na lista, mantém primeira opção
        selectEl.selectedIndex = 0;
      }
    } catch { /* noop */ }
  }

  function computeFill(color, alpha){
    const c = String(color || '').trim();
    if (!c) return '';
    const a = (alpha == null || alpha === '') ? 100 : Number(alpha);
    if (!Number.isFinite(a) || a >= 100) return c;

    // Suporta #RGB / #RRGGBB
    if (c.startsWith('#')) {
      let hex = c.slice(1);
      if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const op = Math.max(0, Math.min(1, a / 100));
        return `rgba(${r},${g},${b},${op})`;
      }
    }
    // Fallback: retorna a cor original
    return c;
  }

  function slotDecorationValue(part){
    const underline = !!(part && part.underline);
    const strike = !!(part && part.strike);
    if (underline && strike) return 'underline line-through';
    if (underline) return 'underline';
    if (strike) return 'line-through';
    return '';
  }

  function applySlotStyleToCard(card, style){
    if (!card) return;
    const s = (style && typeof style === 'object') ? style : {};
    const shapeKey = String(s.shape || s.slotShape || '').trim().toLowerCase() || 'rect';

    // Forma (classe): necessário para a mudança refletir no organograma
    const shapeClasses = ['rect','circle','triangle','pentagon','hexagon','octagon','star'].map(x => `wdg-slot-shape-${x}`);
    try { card.classList.remove(...shapeClasses); } catch {}
    try { card.classList.add(`wdg-slot-shape-${shapeKey}`); } catch {}

    const fill = computeFill(s.bgColor, s.bgAlpha);
    const hasCustom = !!(
      String(s.bgColor || '').trim() ||
      String(s.borderColor || '').trim() ||
      (s.bgAlpha != null && s.bgAlpha !== '') ||
      (s.borderAlpha != null && s.borderAlpha !== '') ||
      (s.cardWidth != null) ||
      (s.borderWidth != null) ||
      (s.borderStyle != null) ||
      (s.contentScale != null) ||
      (s.textParts && Object.keys(s.textParts).length)
    );
    if (hasCustom) card.setAttribute('data-slot-custom', '1');
    else card.removeAttribute('data-slot-custom');

    // Transparência real: quando alpha < 100, removemos o efeito de "vidro" (backdrop-filter)
    const bgAlphaNum = (s.bgAlpha == null || s.bgAlpha === '') ? 100 : Number(s.bgAlpha);
    const isTranslucent = !!(String(s.bgColor || '').trim()) && Number.isFinite(bgAlphaNum) && bgAlphaNum < 100;
    card.classList.toggle('wdg-slot-bg-translucent', isTranslucent);

    setCssVar(card, '--wdg-slot-bg', fill);
    // `--wdg-slot-text` era usado na versão anterior; agora o texto é por-campo.
    // Remove sempre para não deixar valores antigos (ex.: branco) esconderem o conteúdo.
    setCssVar(card, '--wdg-slot-text', '');

    // Borda
    const borderFill = computeFill(s.borderColor, s.borderAlpha);
    setCssVar(card, '--wdg-slot-border-width', (s.borderWidth == null) ? '' : `${Number(s.borderWidth)}px`);
    setCssVar(card, '--wdg-slot-border-style', String(s.borderStyle || '').trim());
    setCssVar(card, '--wdg-slot-border-color', borderFill);

    // Tamanho da forma (largura) e escala do conteúdo
    // Padronizado: circle usa o mesmo cardWidth dos demais shapes (fallback CSS: 280px)
    setCssVar(card, '--wdg-slot-card-width', (s.cardWidth != null) ? `${Number(s.cardWidth)}px` : '');
    const cs = (s.contentScale == null || s.contentScale === '') ? 1 : Number(s.contentScale);
    const contentScale = (Number.isFinite(cs) ? Math.max(0.6, Math.min(1.1, cs)) : 1);
    setCssVar(card, '--wdg-slot-content-scale', (contentScale === 1) ? '' : String(contentScale));

    // Circle: desativa auto-ajuste por conteúdo (tamanho vem só do cardWidth + CSS fallback)
    setCssVar(card, '--wdg-slot-circle-size', '');
    try { delete card.dataset.circleToken; } catch {}

    // Borda premium (formas com clip-path): camada SVG com stroke real
    const clipShapes = new Set(['triangle','pentagon','hexagon','octagon','star']);
    const needsSvgBorder = clipShapes.has(shapeKey);

    const ensureSvgBorderLayer = (host) => {
      let existing = null;
      try {
        existing = host.querySelector(':scope > svg.wdg-slot-svg-border');
      } catch {
        existing = Array.from(host.children || []).find(x => x && x.tagName === 'svg' && x.classList && x.classList.contains('wdg-slot-svg-border')) || null;
      }
      if (existing) return existing;

      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'wdg-slot-svg-border');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.display = 'block';
      svg.style.overflow = 'visible';

      const makePoly = (cls, points) => {
        const p = document.createElementNS(NS, 'polygon');
        p.setAttribute('class', `wdg-slot-svg-shape ${cls}`);
        p.setAttribute('points', points);
        return p;
      };

      // Mesmos contornos das clip-paths (em %) mapeados para viewBox 0..100
      svg.appendChild(makePoly('wdg-slot-svg-triangle', '50,0 0,100 100,100'));
      svg.appendChild(makePoly('wdg-slot-svg-pentagon', '50,0 100,38 82,100 18,100 0,38'));
      svg.appendChild(makePoly('wdg-slot-svg-hexagon', '25,0 75,0 100,50 75,100 25,100 0,50'));
      svg.appendChild(makePoly('wdg-slot-svg-octagon', '30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30'));
      svg.appendChild(makePoly('wdg-slot-svg-star', '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35'));

      // Coloca como primeira camada do card (abaixo do conteúdo)
      try { host.insertBefore(svg, host.firstChild); } catch { host.appendChild(svg); }
      return svg;
    };

    if (needsSvgBorder) {
      const svg = ensureSvgBorderLayer(card);

      // Aplica atributos direto no SVG (mais consistente entre navegadores)
      const fallbackStroke = 'rgba(255,255,255,.72)';
      const stroke = String(borderFill || '').trim() || fallbackStroke;
      const bw = (s.borderWidth == null || s.borderWidth === '') ? 1 : Number(s.borderWidth);
      const borderPx = (Number.isFinite(bw) && bw > 0) ? bw : 1;
      const styleKey = String(s.borderStyle || 'solid').trim().toLowerCase();

      // mostra apenas a forma ativa
      const clsFor = {
        triangle: 'wdg-slot-svg-triangle',
        pentagon: 'wdg-slot-svg-pentagon',
        hexagon: 'wdg-slot-svg-hexagon',
        octagon: 'wdg-slot-svg-octagon',
        star: 'wdg-slot-svg-star',
      };
      const activeCls = clsFor[shapeKey] || '';

      const dashFor = (key, w) => {
        if (key === 'dashed') return `${Math.max(2, Math.round(w * 3))} ${Math.max(2, Math.round(w * 2))}`;
        if (key === 'dotted') return `0 ${Math.max(2, Math.round(w * 2.4))}`;
        return '';
      };

      try {
        const shapes = Array.from(svg.querySelectorAll('.wdg-slot-svg-shape'));
        shapes.forEach(el => {
          const isActive = activeCls && el.classList && el.classList.contains(activeCls);
          el.style.display = isActive ? 'block' : 'none';
          if (!isActive) return;
          el.setAttribute('fill', 'none');
          el.setAttribute('stroke', stroke);
          el.setAttribute('stroke-width', `${borderPx}px`);
          el.setAttribute('vector-effect', 'non-scaling-stroke');
          el.setAttribute('stroke-linejoin', 'round');
          el.setAttribute('stroke-linecap', (styleKey === 'dotted') ? 'round' : 'round');
          const dash = dashFor(styleKey, borderPx);
          if (dash) el.setAttribute('stroke-dasharray', dash);
          else el.removeAttribute('stroke-dasharray');
        });
      } catch {}

      // Escala o contorno para dentro (evita o stroke ser cortado pelo clip-path)
      let minDim = 280;
      try {
        const r = card.getBoundingClientRect();
        const w = Number(r && r.width) || 0;
        const h = Number(r && r.height) || 0;
        if (w > 0 && h > 0) minDim = Math.max(80, Math.min(w, h));
      } catch {}
      const rawScale = 1 - ((borderPx * 2) / minDim);
      const scale = Math.max(0.88, Math.min(0.995, rawScale));
      setCssVar(card, '--wdg-slot-border-svg-scale', String(scale));
    } else {
      // Remove camada se não precisar (mantém DOM limpo)
      try { card.querySelector(':scope > svg.wdg-slot-svg-border')?.remove(); } catch {}
      setCssVar(card, '--wdg-slot-border-svg-scale', '');
    }

    // Alinhamento
    card.classList.toggle('wdg-slot-align-left', s.align === 'left');
    card.classList.toggle('wdg-slot-align-right', s.align === 'right');
    card.classList.toggle('wdg-slot-align-center', s.align !== 'left' && s.align !== 'right');

    const parts = s.textParts || {};
    const applyPart = (key, prefix) => {
      const p = parts[key] || {};
      setCssVar(card, `--wdg-slot-${prefix}-color`, p.color);
      setCssVar(card, `--wdg-slot-${prefix}-size`, (p.size != null && Number.isFinite(Number(p.size)) && Number(p.size) > 0) ? `${Number(p.size)}px` : '');
      setCssVar(card, `--wdg-slot-${prefix}-weight`, p.weight);
      setCssVar(card, `--wdg-slot-${prefix}-style`, p.italic ? 'italic' : 'normal');
      setCssVar(card, `--wdg-slot-${prefix}-decoration`, slotDecorationValue(p));
      setCssVar(card, `--wdg-slot-${prefix}-font`, p.font);
      setCssVar(card, `--wdg-slot-${prefix}-align`, (p.align === 'left' || p.align === 'center' || p.align === 'right') ? p.align : '');

      if (prefix === 'pill') {
        setCssVar(card, '--wdg-slot-pill-bg', String(p.bgColor || '').trim());
        setCssVar(card, '--wdg-slot-pill-border-color', String(p.borderColor || '').trim());
      }
    };
    applyPart('name', 'name');
    applyPart('role', 'role');
    applyPart('email', 'email');
    applyPart('pill', 'pill');

    // Alinhamento do status (pílula) é via flex no container
    try {
      const pillAlign = String((parts && parts.pill && parts.pill.align) || '').trim().toLowerCase();
      const justify = (pillAlign === 'left') ? 'flex-start'
        : (pillAlign === 'center') ? 'center'
          : (pillAlign === 'right') ? 'flex-end'
            : '';
      setCssVar(card, '--wdg-slot-status-justify', justify);
    } catch {}

    try {
      card.dataset.slotShape = shapeKey;
      card.dataset.slotBg = String(fill || '');
      card.dataset.slotBgColor = String(s.bgColor || '');
      card.dataset.slotBgAlpha = String(s.bgAlpha != null ? s.bgAlpha : 100);
      card.dataset.slotBorderWidth = (s.borderWidth == null) ? '' : String(s.borderWidth);
      card.dataset.slotBorderStyle = String(s.borderStyle || '');
      card.dataset.slotBorderColor = String(s.borderColor || '');
      card.dataset.slotBorderAlpha = String(s.borderAlpha != null ? s.borderAlpha : 100);
      card.dataset.slotCardWidth = (s.cardWidth == null) ? '' : String(s.cardWidth);
      card.dataset.slotContentScale = String(s.contentScale != null ? s.contentScale : 1);
      card.dataset.slotText = String(s.text || '');
      card.dataset.slotAlign = String(s.align || 'center');
      card.dataset.slotName = JSON.stringify(parts.name || {});
      card.dataset.slotRole = JSON.stringify(parts.role || {});
      card.dataset.slotEmail = JSON.stringify(parts.email || {});
      card.dataset.slotPill = JSON.stringify(parts.pill || {});
    } catch {}
  }

  function defaultSlotStyle(){
    return {
      global: {
        shape: 'rect',
        bgColor: '',
        bgAlpha: 100,
        borderWidth: null,
        borderStyle: '',
        borderColor: '',
        borderAlpha: 100,
        cardWidth: null,
        contentScale: 1,
        text: '',
        align: 'center',
        textParts: { name: {}, role: {}, email: {}, pill: {} }
      },
      byRole: {}
    };
  }

  function normalizeSlotStyle(style){
    const s = (style && typeof style === 'object') ? style : {};
    const shapeAllowed = new Set(['rect','circle','triangle','pentagon','hexagon','octagon','star']);
    const rawShape = String(s.shape || 'rect').trim().toLowerCase();
    const shape = shapeAllowed.has(rawShape) ? rawShape : 'rect';

    // Back-compat: bg/text antigos
    const legacyBg = String(s.bg || '').trim();
    const bgColor = String((s.bgColor != null ? s.bgColor : legacyBg) || '').trim();
    const bgAlphaRaw = (s.bgAlpha == null || s.bgAlpha === '') ? 100 : Number(s.bgAlpha);
    const bgAlpha = Number.isFinite(bgAlphaRaw) ? Math.max(0, Math.min(100, Math.round(bgAlphaRaw))) : 100;

    const borderWidthRaw = (s.borderWidth == null || s.borderWidth === '') ? null : Number(s.borderWidth);
    const borderWidth = (borderWidthRaw == null) ? null : (Number.isFinite(borderWidthRaw) ? Math.max(0, Math.min(24, Math.round(borderWidthRaw))) : null);
    const borderStyle = String(s.borderStyle || '').trim();
    const borderColor = String(s.borderColor || '').trim();
    const borderAlphaRaw = (s.borderAlpha == null || s.borderAlpha === '') ? 100 : Number(s.borderAlpha);
    const borderAlpha = Number.isFinite(borderAlphaRaw) ? Math.max(0, Math.min(100, Math.round(borderAlphaRaw))) : 100;

    const cardWidthRaw = (s.cardWidth == null || s.cardWidth === '') ? null : Number(s.cardWidth);
    const cardWidth = (cardWidthRaw == null) ? null : (Number.isFinite(cardWidthRaw) ? Math.max(200, Math.min(520, Math.round(cardWidthRaw))) : null);

    const contentScaleRaw = (s.contentScale == null || s.contentScale === '') ? 1 : Number(s.contentScale);
    const contentScale = Number.isFinite(contentScaleRaw) ? Math.max(0.6, Math.min(1.1, contentScaleRaw)) : 1;

    const alignRaw = String(s.align || 'center').trim().toLowerCase();
    const align = (alignRaw === 'left' || alignRaw === 'right') ? alignRaw : 'center';

    const cleanPart = (p) => {
      const o = (p && typeof p === 'object') ? p : {};
      let size = null;
      if (o.size !== '' && o.size != null) {
        const n = Number(o.size);
        if (Number.isFinite(n) && n > 0) size = n;
      }
      const partAlignRaw = String(o.align || '').trim().toLowerCase();
      const partAlign = (partAlignRaw === 'left' || partAlignRaw === 'center' || partAlignRaw === 'right') ? partAlignRaw : '';
      return {
        color: String(o.color || '').trim(),
        bgColor: String(o.bgColor || '').trim(),
        borderColor: String(o.borderColor || '').trim(),
        size,
        weight: String(o.weight || '').trim(),
        italic: !!o.italic,
        underline: !!o.underline,
        strike: !!o.strike,
        font: String(o.font || '').trim(),
        align: partAlign,
      };
    };

    const parts = (s.textParts && typeof s.textParts === 'object') ? s.textParts : {};
    const textParts = {
      name: cleanPart(parts.name),
      role: cleanPart(parts.role),
      email: cleanPart(parts.email),
      pill: cleanPart(parts.pill),
    };

    return {
      shape,
      bgColor,
      bgAlpha,
      borderWidth,
      borderStyle,
      borderColor,
      borderAlpha,
      cardWidth,
      contentScale,
      text: String(s.text || '').trim(),
      align,
      textParts,
    };
  }

  function ensureSlotStyleState(){
    // Suporta formatos antigos: slotStyle = {} | {shape,...} | {global,byRole}
    if (!state.slotStyle || typeof state.slotStyle !== 'object') state.slotStyle = {};

    const hasWrapper = !!(state.slotStyle.global && typeof state.slotStyle.global === 'object')
      || !!(state.slotStyle.byRole && typeof state.slotStyle.byRole === 'object');

    if (!hasWrapper) {
      // Se veio um objeto "direto" (sem wrapper), trate como global.
      const legacy = state.slotStyle;
      state.slotStyle = { global: legacy, byRole: {} };
    }

    if (!state.slotStyle.global || typeof state.slotStyle.global !== 'object') state.slotStyle.global = {};
    if (!state.slotStyle.byRole || typeof state.slotStyle.byRole !== 'object') state.slotStyle.byRole = {};

    state.slotStyle.global = normalizeSlotStyle(Object.assign({}, defaultSlotStyle().global, state.slotStyle.global));
    return state.slotStyle;
  }

  function mergeSlotStyles(baseStyle, overrideStyle){
    const base = normalizeSlotStyle(baseStyle);
    const over = (overrideStyle && typeof overrideStyle === 'object') ? overrideStyle : null;
    if (!over) return base;
    const o = normalizeSlotStyle(over);
    const pick = (key) => Object.prototype.hasOwnProperty.call(over, key) ? o[key] : base[key];
    const out = {
      shape: pick('shape'),
      bgColor: pick('bgColor'),
      bgAlpha: pick('bgAlpha'),
      borderWidth: pick('borderWidth'),
      borderStyle: pick('borderStyle'),
      borderColor: pick('borderColor'),
      borderAlpha: pick('borderAlpha'),
      cardWidth: pick('cardWidth'),
      contentScale: pick('contentScale'),
      text: pick('text'),
      align: pick('align'),
      textParts: {
        name: Object.assign({}, base.textParts?.name || {}, o.textParts?.name || {}),
        role: Object.assign({}, base.textParts?.role || {}, o.textParts?.role || {}),
        email: Object.assign({}, base.textParts?.email || {}, o.textParts?.email || {}),
        pill: Object.assign({}, base.textParts?.pill || {}, o.textParts?.pill || {}),
      }
    };
    return out;
  }

  function getEffectiveSlotStyle(roleId){
    ensureSlotStyleState();
    const rid = String(roleId || '').trim();
    const globalStyle = state.slotStyle.global || {};
    if (!rid) return normalizeSlotStyle(globalStyle);
    const roleStyle = (state.slotStyle.byRole && state.slotStyle.byRole[rid]) ? state.slotStyle.byRole[rid] : null;
    return roleStyle ? mergeSlotStyles(globalStyle, roleStyle) : normalizeSlotStyle(globalStyle);
  }

  function applySlotStyleToStages({ roleId, applyAll } = {}){
    const targets = [refs.orgContainer, refs.orgPreview].filter(Boolean);
    const rid = String(roleId || '').trim();

    targets.forEach(container => {
      const stage = container.querySelector ? container.querySelector('.wdg-orgstage') : null;
      if (!stage) return;
      const host = stage.querySelector ? (stage.querySelector('.wdg-orgchart') || stage) : stage;
      if (!host) return;

      const cards = applyAll
        ? Array.from(host.querySelectorAll('.wdg-orgcard'))
        : (rid
          ? Array.from(host.querySelectorAll(`li[data-role-id="${(window.CSS && CSS.escape) ? CSS.escape(rid) : rid}"] .wdg-orgcard`))
          : []);

      cards.forEach(card => {
        try {
          const li = card.closest ? card.closest('li[data-role-id]') : null;
          const cardRoleId = li ? String(li.getAttribute('data-role-id') || '').trim() : rid;
          applySlotStyleToCard(card, getEffectiveSlotStyle(cardRoleId));
        } catch { /* noop */ }
      });

      try { adjustCircleSizesInStage(stage); } catch { /* noop */ }
      try { scheduleDrawOrgLines(stage, { preview: container === refs.orgPreview, reason: 'slot-style' }); } catch { /* noop */ }
    });
  }

  function defaultState(){
    return {
      roles: [],
      assignments: {},
      slotStyle: defaultSlotStyle(),
      lastSavedAt: null
    };
  }

  function adjustCircleSizesInStage(stage){
    const host = stage && stage.querySelector ? (stage.querySelector('.wdg-orgchart') || stage) : null;
    if (!host) return;
    const cards = Array.from(host.querySelectorAll('.wdg-orgcard'));
    cards.forEach(card => {
      try {
        const li = card.closest ? card.closest('li[data-role-id]') : null;
        const roleId = li ? String(li.getAttribute('data-role-id') || '') : '';
        applySlotStyleToCard(card, getEffectiveSlotStyle(roleId));
      } catch { /* noop */ }
    });
  }

  async function printOrganograma(){
    const isDev = (() => {
      try {
        return !!(window.__DEV__ || (location && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')));
      } catch {
        return false;
      }
    })();

    // (1) DIAGNÓSTICO obrigatório: candidatos e presença de nós
    try {
      if (isDev) {
        console.log('[print] candidates:', {
          hasWdgPrintRoot: !!document.querySelector('#wdgPrintRoot'),
          hasWdgPrintInner: !!document.querySelector('#wdgPrintInner'),
          hasOrgContainer: !!document.querySelector('#orgContainer'),
          hasOrgStage: !!document.querySelector('.wdg-orgstage'),
          hasOrgHead: !!document.querySelector('.wdg-org-head'),
          hasPrintHeader: !!document.querySelector('.wdg-org-printheader'),
          orgContainerHTML: document.querySelector('#orgContainer')?.innerHTML?.slice(0, 200),
          printInnerHTML: document.querySelector('#wdgPrintInner')?.innerHTML?.slice(0, 200),
        });
      }
    } catch { /* noop */ }

    // 1) limpar toasts e overlays que possam cobrir o SVG
    try {
      const toastRoot = document.querySelector('#toastRoot');
      if (toastRoot) toastRoot.innerHTML = '';
    } catch { /* noop */ }
    try { document.querySelectorAll('.wdg-toast').forEach(el => el.remove()); } catch { /* noop */ }
    try { document.querySelectorAll('.modal-backdrop').forEach(el => el.remove()); } catch { /* noop */ }

    const orgContainer = refs?.orgContainer || document.getElementById('orgContainer');
    const stage = (document.querySelector('#wdgPrintInner .wdg-orgstage')
      || document.querySelector('#orgContainer .wdg-orgstage')
      || (orgContainer ? orgContainer.querySelector('.wdg-orgstage') : null)
      || document.querySelector('.wdg-orgstage'));

    // 2) redraw síncrono (linhas) antes de clonar
    try {
      if (stage && typeof drawOrgLines === 'function') {
        drawOrgLines(stage, { preview: false, reason: 'print' });
      } else if (stage && typeof scheduleDrawOrgLines === 'function') {
        scheduleDrawOrgLines(stage, { preview: false, reason: 'print', immediate: true });
      }
    } catch { /* noop */ }

    // 3) esperar 2 frames para o layout assentar e o SVG atualizar
    try { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); } catch { /* noop */ }

    // 4) impressão isolada via iframe (mais estável no Chrome)
    await printOrganogramaViaIframe({ orgContainer, stage });
  }

  async function printOrganogramaViaIframe({ orgContainer, stage } = {}){
    const isDev = (() => {
      try {
        return !!(window.__DEV__ || (location && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')));
      } catch {
        return false;
      }
    })();

    // PASSO 1 — Encontrar e provar o cabeçalho real no DOM (antes de clonar)
    const headA = document.querySelector('#wdgPrintRoot .wdg-org-head');
    const headB = document.querySelector('.wdg-org-head');
    const headC = document.querySelector('.wdg-org-printheader');
    try {
      if (isDev) {
        console.log('[print] header candidates', {
          hasA: !!headA, hasB: !!headB, hasC: !!headC,
          a: headA?.outerHTML?.slice(0, 200),
          b: headB?.outerHTML?.slice(0, 200),
          c: headC?.outerHTML?.slice(0, 200),
        });
      }
    } catch { /* noop */ }

    function pickHeaderNode(){
      return headA || headB || headC || null;
    }

    const headerNode = pickHeaderNode();

    // Clona o nó REAL que contém cards + SVG já renderizado (stage)
    const stageSource = (stage instanceof HTMLElement) ? stage
      : (document.querySelector('#wdgPrintInner .wdg-orgstage')
        || document.querySelector('#orgContainer .wdg-orgstage')
        || document.querySelector('.wdg-orgstage'));

    // Fallback: se não tiver stage, usa o container
    const orgSource = stageSource || ((orgContainer instanceof HTMLElement) ? orgContainer
      : (stage && stage.closest ? stage.closest('#orgContainer') : null)
      || document.getElementById('orgContainer'));

    try {
      if (isDev) {
        console.log('[print] chosen nodes:', {
          header: headerNode ? (headerNode.className || headerNode.id || headerNode.tagName) : null,
          orgSource: orgSource ? (orgSource.className || orgSource.id || orgSource.tagName) : null,
          isStage: !!stageSource,
        });
      }
    } catch { /* noop */ }

    // PASSO 2 — Se não achar header, aborta com erro visível (e alerta só em DEV)
    if (!headerNode) {
      console.error('[print] header not found - cannot print header');
      try {
        if (isDev) alert('DEV: Header não encontrado no DOM para impressão. Veja o console: [print] header candidates');
      } catch { /* noop */ }
      return;
    }
    if (!orgSource) {
      try { window.print(); } catch { /* noop */ }
      return;
    }

    let frame = document.getElementById('wdgPrintFrame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'wdgPrintFrame';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      // 0x0 pode resultar em páginas em branco em alguns drivers.
      frame.style.width = '1px';
      frame.style.height = '1px';
      frame.style.border = '0';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      document.body.appendChild(frame);
    }

    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      try { window.print(); } catch { /* noop */ }
      return;
    }

    // Escreve um documento limpo
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>');
    doc.close();

    // Copia estilos (links + styles) para manter a aparência dos cards
    const styleLoads = [];
    try {
      const head = doc.head;
      const srcHead = document.head;
      srcHead.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
        try {
          const c = doc.createElement('link');
          c.rel = 'stylesheet';
          c.href = l.href;
          styleLoads.push(new Promise(res => {
            c.addEventListener('load', () => res(), { once: true });
            c.addEventListener('error', () => res(), { once: true });
          }));
          head.appendChild(c);
        } catch { /* noop */ }
      });
      srcHead.querySelectorAll('style').forEach(s => {
        try {
          const c = doc.createElement('style');
          c.textContent = s.textContent || '';
          head.appendChild(c);
        } catch { /* noop */ }
      });
    } catch { /* noop */ }

    // PASSO 4 — CSS do iframe (limpo; sem whitelists perigosas)
    // IMPORTANTE: neutraliza regras @media print da página que podem esconder tudo (ex.: body * { visibility:hidden !important; }).
    const injectedCss = `
      @page { size: A4 landscape; margin: 10mm; }
      html, body { height: auto !important; background: #fff !important; color: #111 !important; }
      body { margin: 0 !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

      /* Cabeçalho de impressão: no screen ele fica fora da tela/opaco; aqui precisa ser visível */
      .wdg-org-printheader{
        position: static !important;
        left: auto !important;
        top: auto !important;
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        justify-content: flex-start !important;
        align-items: center !important;
      }

      .wdg-org-printmeta{
        flex: 1 1 auto !important;
        text-align: center !important;
      }

      .wdg-org-printlogo{
        width: 180px !important;
        height: 66px !important;
        max-width: 100% !important;
        object-fit: contain !important;
      }

      .wdg-org-printheader{
        width: auto !important;
        flex-direction: column !important;
        justify-content: center !important;
        align-items: center !important;
        gap: 6px !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      .wdg-org-printheader::after{
        content: none !important;
        display: none !important;
      }

      .wdg-org-printmeta{
        flex: 0 0 auto !important;
        text-align: center !important;
      }

      /* Reset de print (evita página em branco por regras herdadas) */
      @media print {
        body * { visibility: visible !important; }
      }

      #printDoc { width: 100% !important; }
      #printHeader { margin: 0 0 6mm 0 !important; break-inside: avoid !important; page-break-inside: avoid !important; display: flex !important; justify-content: center !important; }
      #printBody { width: 100% !important; break-before: avoid !important; page-break-before: avoid !important; }

      /* wrapper do organograma: centralizado e sem quebra */
      #wdgPrintOrgWrap{ break-inside: avoid !important; page-break-inside: avoid !important; margin-left: auto !important; margin-right: auto !important; }

      /* header clonado às vezes vem como .wdg-org-head; garante centralização */
      .wdg-org-head{ width: 100% !important; display: flex !important; justify-content: center !important; }

      /* evita deslocamento do header por wrappers vazios (ex.: ms-auto do zoom) */
      #printHeader .ms-auto, .wdg-org-head .ms-auto { display: none !important; }

      /* Nunca imprimir lixo */
      #toastRoot, .wdg-toast, .modal, .modal-backdrop,
      nav, aside, footer,
      .wdg-zoombar, .wdg-zoombtn, [data-zoom],
      .wdg-slot-editbtn,
      .wdg-orgpill, .wdg-orgstatus, .badge,
      button, .btn { display: none !important; }

      /* Stage precisa expandir para o conteúdo para o SVG ter width/height > 0 */
      .wdg-orgstage { width: max-content !important; margin: 0 auto !important; overflow: visible !important; }

      /* Fotos sem efeito */
      img, .wdg-orgcard img, .wdg-avatar img {
        filter: none !important;
        opacity: 1 !important;
        mix-blend-mode: normal !important;
        box-shadow: none !important;
        background: transparent !important;
        transform: none !important;
      }
      .wdg-avatar::before, .wdg-avatar::after,
      .wdg-avatar--photo::before, .wdg-avatar--photo::after,
      .wdg-orgcard::before, .wdg-orgcard::after {
        content: none !important;
        filter: none !important;
        opacity: 0 !important;
        mix-blend-mode: normal !important;
      }

      /* Linhas visíveis */
      svg.wdg-orglines, .wdg-orglines-html { display: block !important; visibility: visible !important; opacity: 1 !important; }

      /* Evitar página extra */
      .wdg-orgcard { break-inside: avoid !important; page-break-inside: avoid !important; }
    `;

    try {
      const s = doc.createElement('style');
      s.textContent = injectedCss;
      doc.head.appendChild(s);
    } catch { /* noop */ }

    // PASSO 2 — Monta BODY do iframe: HEADER + STAGE
    const printDoc = doc.createElement('div');
    printDoc.id = 'printDoc';

    const printHeader = doc.createElement('div');
    printHeader.id = 'printHeader';
    const headerClone = headerNode.cloneNode(true);
    // PASSO 3 — Remove itens indesejados dentro do CLONE do header
    try { headerClone.querySelectorAll('.wdg-zoombar, .wdg-zoombtn, [data-zoom], button, .btn, #toastRoot, .wdg-toast, .modal, .modal-backdrop').forEach(el => el.remove()); } catch { /* noop */ }
    printHeader.appendChild(headerClone);

    const printBody = doc.createElement('div');
    printBody.id = 'printBody';
    const orgClone = orgSource.cloneNode(true);
    // PASSO 3 — Remove itens indesejados dentro do CLONE do stage
    try { orgClone.querySelectorAll('.wdg-zoombar, .wdg-zoombtn, [data-zoom]').forEach(el => el.remove()); } catch { /* noop */ }
    try { orgClone.querySelectorAll('.wdg-orgpill, .wdg-orgstatus, .badge, .wdg-slot-editbtn, button, .btn').forEach(el => el.remove()); } catch { /* noop */ }
    try { orgClone.querySelectorAll('#toastRoot, .wdg-toast, .modal, .modal-backdrop').forEach(el => el.remove()); } catch { /* noop */ }
    // Remove sobras de zoom por id/classe/texto (ex.: "Zoom: 100%")
    try {
      Array.from(orgClone.querySelectorAll('*')).forEach(el => {
        const id = String(el.id || '');
        const cls = String(el.className || '');
        const txt = String(el.textContent || '');
        if ((/zoom/i.test(id) || /zoom/i.test(cls)) && /zoom/i.test(txt)) {
          el.remove();
        }
      });
    } catch { /* noop */ }

    // Host para escala/centralização (usar zoom para afetar o layout no print)
    const orgWrap = doc.createElement('div');
    orgWrap.id = 'wdgPrintOrgWrap';
    orgWrap.style.display = 'block';
    orgWrap.style.width = 'max-content';
    orgWrap.style.maxWidth = '100%';
    orgWrap.style.margin = '0 auto';
    orgWrap.style.overflow = 'visible';
    orgWrap.appendChild(orgClone);
    printBody.appendChild(orgWrap);

    printDoc.appendChild(printHeader);
    printDoc.appendChild(printBody);
    doc.body.appendChild(printDoc);

    // Aguarda CSS carregar
    try { await Promise.race([Promise.all(styleLoads), new Promise(r => setTimeout(r, 1500))]); } catch { /* noop */ }

    // Aguarda fonts
    try { await (doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve()); } catch { /* noop */ }

    // Espera imagens/fontes assentarem antes de calcular escala
    try {
      const imgs = Array.from(doc.images || []);
      const waitImg = (img) => new Promise(res => {
        try {
          if (img.complete) return res();
          img.addEventListener('load', () => res(), { once: true });
          img.addEventListener('error', () => res(), { once: true });
        } catch {
          res();
        }
      });
      await Promise.all(imgs.map(img => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => waitImg(img))));
    } catch { /* noop */ }

    // 2x rAF do iframe (não do window principal)
    try { await new Promise(r => win.requestAnimationFrame(() => win.requestAnimationFrame(r))); } catch { /* noop */ }

    // PASSO 5 — prova de que o header existe e tem tamanho no iframe
    try {
      const hdrEl = doc.querySelector('#printHeader');
      const hdrRect = hdrEl ? hdrEl.getBoundingClientRect() : null;
      const hasHdrImg = !!doc.querySelector('#printHeader img');
      if (isDev) {
        console.log('[print] iframe header metrics', {
          hdrRect: hdrRect ? { w: hdrRect.width, h: hdrRect.height, top: hdrRect.top, left: hdrRect.left } : null,
          hasHdrImg,
        });
      }
    } catch { /* noop */ }

    // Confirma que o SVG existe e tem tamanho > 0 no iframe
    try {
      const svg = doc.querySelector('svg.wdg-orglines');
      const svgW = svg ? (svg.clientWidth || 0) : 0;
      const svgH = svg ? (svg.clientHeight || 0) : 0;
      let bbox = null;
      try { bbox = svg ? svg.getBBox() : null; } catch { bbox = null; }
      if (isDev) {
        console.log('[print] iframe metrics:', {
          hasSvg: !!svg,
          svgClient: { w: svgW, h: svgH },
          svgBBox: bbox ? { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height } : null,
          chartRect: cr ? { w: cr.width, h: cr.height } : null,
        });
      }
    } catch { /* noop */ }

    // Fit-to-page (A4 landscape com margin 10mm): calcula escala para caber em 1 página
    try {
      const mmToPx = (mm) => (mm * 96) / 25.4;
      // A4 landscape: 297mm x 210mm; margin total 20mm (10mm cada lado)
      const pageW = mmToPx(297 - 20);
      const pageH = mmToPx(210 - 20);

      const headerEl = printDoc.querySelector('#printHeader');
      const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;

      const chart = orgWrap.querySelector('.wdg-orgchart') || orgWrap.querySelector('.wdg-orgstage') || orgWrap;
      const cw = Math.max(1, Math.ceil(chart.scrollWidth || chart.clientWidth || chart.getBoundingClientRect().width || 1));
      const ch = Math.max(1, Math.ceil(chart.scrollHeight || chart.clientHeight || chart.getBoundingClientRect().height || 1));

      const availW = Math.max(1, pageW);
      const availH = Math.max(1, pageH - headerH - mmToPx(6));
      const scale = Math.min(availW / cw, availH / ch);
      // Para garantir 1 página, não ampliamos; apenas reduzimos quando necessário.
      const clamped = Math.max(0.2, Math.min(scale, 1));

      // 'zoom' reduz o tamanho no layout (evita página extra). Fallback: transform.
      try {
        orgWrap.style.zoom = String(clamped.toFixed(3));
        orgWrap.style.transform = '';
        orgWrap.style.transformOrigin = '';
      } catch {
        orgWrap.style.transform = `scale(${clamped.toFixed(3)})`;
        orgWrap.style.transformOrigin = 'top center';
      }
    } catch { /* noop */ }

    // Imprime e limpa o iframe depois
    await new Promise(resolve => setTimeout(resolve, 0));
    const cleanup = () => {
      try { frame.remove(); } catch { /* noop */ }
    };
    try {
      win.addEventListener('afterprint', () => setTimeout(cleanup, 0), { once: true });
    } catch { /* noop */ }

    try {
      win.focus();
      // Último assentamento antes do print
      try { await new Promise(r => win.requestAnimationFrame(() => win.requestAnimationFrame(r))); } catch { /* noop */ }
      win.print();
    } catch {
      try { window.print(); } catch { /* noop */ }
    }

    // Fallback: remove mesmo se afterprint não disparar
    try { setTimeout(cleanup, 4000); } catch { /* noop */ }
  }

  function installPrintRedrawHook(){
    // Hook mínimo: não altera layout, apenas redesenha conectores antes do print.
    if (installPrintRedrawHook._installed) return;
    installPrintRedrawHook._installed = true;

    const redraw = () => {
      try {
        const container = refs?.orgContainer || document.getElementById('orgContainer');
        const stage = container ? container.querySelector('.wdg-orgstage') : null;
        if (!stage) return;
        // Sem scheduler no print: desenha imediatamente.
        if (typeof drawOrgLines === 'function') drawOrgLines(stage, { preview: false, reason: 'print' });
      } catch { /* noop */ }
    };

    try { window.addEventListener('beforeprint', redraw); } catch { /* noop */ }
  }

  async function loadUnidadesForSelects() {
    if (!refs.condoSelects.length) return;

    refs.condoSelects.forEach(sel => {
      try {
        sel.disabled = true;
        setSelectOptions(sel, [{ value: '', label: 'Carregando...' }], '');
      } catch { /* noop */ }
    });

    let list = [];
    try { list = await api('/api/unidades'); } catch { list = []; }

    const unidades = Array.isArray(list) ? list : (Array.isArray(list && list.data) ? list.data : []);
    const norm = unidades.map(u => {
      const id = u && (u._id || u.id) ? String(u._id || u.id) : '';
      const codigo = String(u && u.codigo ? u.codigo : '').trim();
      const nome = String(u && u.nome ? u.nome : '').trim();
      const label = (codigo ? (codigo + ' - ') : '') + (nome || id || 'Unidade');
      return {
        id,
        codigo,
        nome,
        label,
        endereco: u?.endereco,
        cidade: u?.cidade,
        estado: u?.estado,
        cep: u?.cep,
        cepFormatado: u?.cepFormatado,
        telefoneCelular: u?.telefoneCelular,
        telefoneFixo: u?.telefoneFixo,
        emailPrincipal: u?.emailPrincipal,
        emailFiscal: u?.emailFiscal,
        cnpj: u?.cnpj,
        logo: u?.logo || u?.logo_url || u?.logoUrl || u?.logo_unidade || u?.logoUnidade || u?.headerLogo || u?.header_logo || u?.logoURL || u?.logo_url_unidade || u?.logo_unidade_url || u?.logoUnidadeUrl || u?.logo_unidadeUrl || u?.logo_unidadeURL || u?.logoUrlUnidade || u?.logoUrlUnidade,
        logoUrl: u?.logoUrl || u?.logo_url || u?.logoURL || u?.logo_url_unidade || u?.logo_unidade_url || u?.logoUnidadeUrl || u?.logo_unidadeUrl || u?.logo_unidadeURL || u?.logoUrlUnidade || u?.logoUrl
      };
    }).filter(u => !!u.id);

    unidadesCache = norm;

    // Master/Admin: pode escolher; demais: trava na unidade do usuário.
    if (isScopeAll) {
      let saved = '';
      try { saved = String(localStorage.getItem(UNIT_PICK_KEY) || '').trim(); } catch { saved = ''; }

      const prefer = String(userUnit || '').trim() || saved;
      const initial = prefer && norm.some(u => u.id === prefer)
        ? prefer
        : (norm[0] ? norm[0].id : '');

      selectedUnitId = initial;
      refs.condoSelects.forEach(sel => {
        setSelectOptions(sel, norm.map(u => ({ value: u.id, label: u.label })), initial);
        sel.disabled = norm.length <= 1;
      });
      syncCondoSelects(initial);
      try { if (initial) localStorage.setItem(UNIT_PICK_KEY, initial); } catch { /* noop */ }

      // Master/Admin: troca o select por UserPick PRO (mesmo estilo do picker de usuário)
      ensureCondoUserPickers();
      syncCondoUserPickersFromSelected();

      try { updateOrgPrintHeader(initial); } catch { /* noop */ }

      await handleUnitChange(initial, { silentToast: true, reason: 'units-load-admin' });
      return;
    }

    let fixed = String(userUnit || '').trim();
    if (!fixed && norm.length === 1) fixed = norm[0].id;
    selectedUnitId = fixed;

    let fixedLabel = '';
    if (fixed) {
      const found = norm.find(u => u.id === fixed);
      fixedLabel = found ? found.label : fixed;
    }

    refs.condoSelects.forEach(sel => {
      setSelectOptions(sel,
        fixed ? [{ value: fixed, label: fixedLabel }] : [{ value: '', label: 'Unidade não vinculada' }],
        fixed
      );
      sel.disabled = true;
    });
    syncCondoSelects(fixed);

    try { updateOrgPrintHeader(fixed); } catch { /* noop */ }

    await handleUnitChange(fixed, { silentToast: true, reason: 'units-load-fixed' });

    // Revalida permissão de edição (Diretor) após carregar a unidade.
    try { await refreshCanEditFromServer(); } catch { /* noop */ }

    // Diretor/User: mantém select visível e esconde o host
    teardownCondoUserPickers();
  }

  function initCondominioField() {
    if (!refs.condoSelects.length) return;

    refs.condoSelects.forEach(sel => {
      if (sel.__wdgBound) return;
      sel.__wdgBound = true;
      sel.addEventListener('change', () => {
        const v = String(sel.value || '').trim();
        selectedUnitId = v;
        syncCondoSelects(v);
        syncCondoUserPickersFromSelected();
        try { if (isScopeAll) localStorage.setItem(UNIT_PICK_KEY, v); } catch { /* noop */ }
        void handleUnitChange(v, { silentToast: false, reason: 'select-change' });
      });
    });

    void loadUnidadesForSelects();
  }

  function syncCondoSelects(unitId){
    const v = String(unitId || '').trim();
    selectedUnitId = v;

    try {
      refs.condoSelects.forEach(sel => {
        try {
          if (String(sel.value || '') !== v) sel.value = v;
        } catch { /* noop */ }
      });
    } catch { /* noop */ }

    try {
      (refs.condoInlineLogos || []).forEach(img => {
        try { setUnidadeLogoOnImg(img, v); } catch { /* noop */ }
      });
    } catch { /* noop */ }
  }

  function normalizeTextLoose(s){
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function getDefaultUserAvatarUrl(){
    const bp = String(BASE_PATH || '/condominios').trim().replace(/\/+$/g, '');
    return bp ? `${bp}/images/usuario.png` : '/images/usuario.png';
  }

  function coerceUserAvatarUrl(rawValue){
    const bp = String(BASE_PATH || '/condominios').trim().replace(/\/+$/g, '');
    const raw = String(rawValue || '').trim();
    if (!raw) return getDefaultUserAvatarUrl();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) {
      if (bp && !raw.startsWith(bp + '/')) return bp + raw;
      return raw;
    }
    const clean = raw.replace(/^\/+/, '');
    return bp ? `${bp}/${clean}` : `/${clean}`;
  }

  function coerceMandatoDocumentoUrl(rawValue){
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    // Permite URLs absolutas (blob/vercel) ou paths locais (/uploads/...)
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return raw;
    return '';
  }

  function getActiveUsers(){
    const unitId = String(getSelectedUnidadeId() || '').trim();
    if (usersCacheLoaded && usersCacheUnitId && unitId && usersCacheUnitId === unitId) {
      return Array.isArray(usersCache) ? usersCache : [];
    }
    return Array.isArray(fallbackUsers) ? fallbackUsers : [];
  }

  function normalizeUserEntry(raw){
    const email = String(raw?.email || '').trim().toLowerCase();
    const nome = String(raw?.nome || '').trim();
    // Preferir `cond_usuario_id` para garantir compatibilidade com Mandatos (ref: CondUsuario),
    // mas permitir fallback para usuários do Gestor (o backend pode mapear/criar CondUsuario via e-mail).
    const uid = raw?.cond_usuario_id || raw?._id || raw?.usuario_id || '';
    const rawId = String(uid || '').trim();
    const isObjectId = /^[a-f\d]{24}$/i.test(rawId);
    // Mandatos exigem ObjectId (CondUsuario ou User mapeável). Não permitir e-mail como id.
    const id = isObjectId ? rawId : '';
    const fotoUrl = email
      ? `${String(BASE_PATH || '/condominios')}/api/usuarios/foto?email=${encodeURIComponent(email)}`
      : (id ? `${String(BASE_PATH || '/condominios')}/api/usuarios/foto?id=${encodeURIComponent(id)}` : '');

    return {
      id,
      nome: nome || email || id,
      email,
      fotoUrl
    };
  }

  async function ensureUsersLoadedForUnit(unitId, opts = {}){
    const uid = String(unitId || '').trim();
    if (!uid) {
      usersCache = [];
      usersCacheUnitId = '';
      usersCacheLoaded = true;
      usersCacheLoadingPromise = null;
      return [];
    }

    const force = !!opts?.force;

    if (!force && usersCacheLoaded && usersCacheUnitId === uid && Array.isArray(usersCache)) {
      return usersCache;
    }

    if (!force && usersCacheLoadingPromise && usersCacheUnitId === uid) {
      return await usersCacheLoadingPromise;
    }

    usersCacheUnitId = uid;
    usersCacheLoaded = false;

    const thisReq = ++usersCacheReqId;
    usersCacheLoadingPromise = (async () => {
      try {
        const query = new URLSearchParams({ unidade_id: uid, limit: '500' });
        const list = await api('/api/usuarios/busca.v2?' + query.toString());
        const arr = Array.isArray(list) ? list : (Array.isArray(list?.data) ? list.data : []);

        // Para Dirigência (Mandatos): trazer TODOS os usuários vinculados à unidade.
        // O backend já filtra por unidade/vínculos; aqui só normalizamos/deduplicamos.
        const norm = (arr || [])
          .filter(raw => raw && typeof raw === 'object')
          .map(normalizeUserEntry)
          .filter(u => u && u.id);

        // Dedup por id (garante estabilidade quando há múltiplas origens)
        const byId = new Map();
        norm.forEach(u => {
          const k = String(u.id || '').trim();
          if (!k) return;
          if (!byId.has(k)) byId.set(k, u);
        });
        const deduped = Array.from(byId.values());

        // Evita sobrescrever se uma requisição mais nova já ocorreu
        if (thisReq === usersCacheReqId) {
          usersCache = deduped;
          usersCacheLoaded = true;
        }

        return deduped;
      } catch {
        if (!opts?.silent) toast('Não foi possível carregar usuários desta unidade.', 'warning');
        if (thisReq === usersCacheReqId) {
          usersCache = [];
          usersCacheLoaded = true;
        }
        return [];
      } finally {
        if (thisReq === usersCacheReqId) {
          usersCacheLoadingPromise = null;
        }
      }
    })();

    return await usersCacheLoadingPromise;
  }

  async function ensureMandatosAtivosLoadedForUnit(unitId, opts = {}){
    const uid = String(unitId || '').trim();
    if (!uid) {
      mandatosAtivosCache = {};
      mandatosAtivosUnitId = '';
      mandatosAtivosLoaded = true;
      mandatosAtivosLoadingPromise = null;
      return {};
    }

    const force = !!opts?.force;
    if (!force && mandatosAtivosLoaded && mandatosAtivosUnitId === uid && mandatosAtivosCache && typeof mandatosAtivosCache === 'object') {
      return mandatosAtivosCache;
    }
    if (!force && mandatosAtivosLoadingPromise && mandatosAtivosUnitId === uid) {
      return await mandatosAtivosLoadingPromise;
    }

    mandatosAtivosUnitId = uid;
    mandatosAtivosLoaded = false;
    const thisReq = ++mandatosAtivosReqId;

    mandatosAtivosLoadingPromise = (async () => {
      try {
        const json = await api(`/api/dirigencia/${encodeURIComponent(uid)}/mandatos/ativos`);
        const data = (json && typeof json === 'object' && json.success !== false && json.data && typeof json.data === 'object')
          ? json.data
          : {};

        if (thisReq === mandatosAtivosReqId) {
          mandatosAtivosCache = data;
          mandatosAtivosLoaded = true;
        }
        return data;
      } catch {
        if (!opts?.silent) toast('Não foi possível carregar mandatos ativos.', 'warning');
        if (thisReq === mandatosAtivosReqId) {
          mandatosAtivosCache = {};
          mandatosAtivosLoaded = true;
        }
        return {};
      } finally {
        if (thisReq === mandatosAtivosReqId) {
          mandatosAtivosLoadingPromise = null;
        }
      }
    })();

    return await mandatosAtivosLoadingPromise;
  }

  function applyAssignmentsFromMandatosCache(){
    const uid = String(getSelectedUnidadeId() || '').trim();
    if (!uid) return;
    if (!mandatosAtivosLoaded || mandatosAtivosUnitId !== uid) return;
    state.assignments = (state.assignments && typeof state.assignments === 'object') ? state.assignments : {};

    const roles = Array.isArray(state.roles) ? state.roles : [];
    const roleIds = new Set(roles.map(r => String(r?.id || '').trim()).filter(Boolean));

    // remove roles inexistentes
    Object.keys(state.assignments).forEach(rid => {
      if (!roleIds.has(rid)) delete state.assignments[rid];
    });

    // aplica ativos
    for (const rid of roleIds) {
      const m = mandatosAtivosCache ? mandatosAtivosCache[rid] : null;
      const userId = String(m?.usuario?.id || m?.usuario?._id || '').trim();
      if (userId) state.assignments[rid] = userId;
      else delete state.assignments[rid];
    }
  }

  async function handleUnitChange(unitId, opts = {}){
    const uid = String(unitId || '').trim() || String(userUnit || '').trim();
    const effective = uid;

    // Reseta paginação local dos cargos ao trocar unidade
    rolesPage = 1;

    const loaded = await loadStateCloudFirst(effective);
    state = loaded && loaded.state ? loaded.state : defaultState();
    if (loaded && loaded.seedCloud) {
      // Primeiro acesso (doc inexistente): cria no backend usando o estado local/default.
      scheduleCloudSave(effective);
    }
    await ensureUsersLoadedForUnit(effective, { silent: true });
    await ensureMandatosAtivosLoadedForUnit(effective, { silent: true, force: true });
    try { applyAssignmentsFromMandatosCache(); } catch { /* noop */ }

    // Revalida permissão por unidade (principalmente para Diretor).
    try { await refreshCanEditFromServer(effective); } catch { /* noop */ }
    try { syncConfigVisibility(); } catch { /* noop */ }

    try { updateOrgPrintHeader(effective); } catch { /* noop */ }
    try {
      (refs.condoInlineLogos || []).forEach(img => {
        try { setUnidadeLogoOnImg(img, effective); } catch { /* noop */ }
      });
    } catch { /* noop */ }

    renderAll();
    if (!opts?.silentToast) toast('Condomínio atualizado.', 'info');
  }

  function findUnidadeById(id){
    const key = String(id || '').trim();
    if (!key) return null;
    return (unidadesCache || []).find(u => String(u?.id || '') === key) || null;
  }

  function buildLogoCandidates(rawUrl, basePath){
    const bp = String(basePath || '').trim();
    const u = String(rawUrl || '').trim();
    if (!u) return [];

    const candidates = [];
    const isAbs = /^https?:\/\//i.test(u) || u.startsWith('data:');
    if (isAbs) {
      candidates.push(u);
      return candidates;
    }

    // Prioriza com prefixo do módulo quando a URL é root-relative.
    // Ex.: payload pode vir com `/api/unidades/:id/logo`, mas no app `/condominios` a rota real é `/condominios/api/...`.
    if (bp && u.startsWith('/') && !u.startsWith(bp + '/')) {
      candidates.push(bp + u);
    }

    // como veio
    candidates.push(u);

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

  function getUnidadeLogoCandidates(id){
    const uid = String(id || '').trim();
    if (!uid) return [UNIT_ICON_URL];

    const base = String(BASE_PATH || '/condominios');
    const isCondominiosApp = base.includes('/condominios');

    // 0) Preferir URL de logo vinda do /api/unidades (mais confiável)
    const u = findUnidadeById(uid);
    const rawLogo = String(u?.logo || u?.logo_url || u?.logoUrl || u?.logo_unidade || u?.logoUnidade || u?.headerLogo || u?.header_logo || '').trim();
    const fromList = rawLogo ? buildLogoCandidates(rawLogo, base) : [];

    const raw = [
      ...fromList,
      // 1) Módulo Gestor (onde a logo é cadastrada)
      ...(isCondominiosApp ? [`/gestor/api/unidades/${encodeURIComponent(uid)}/logo`] : []),
      // 2) Se existir no módulo atual (nem sempre existe)
      base + `/api/unidades/${encodeURIComponent(uid)}/logo`,
      // 3) Gestor (quando não estamos no /condominios)
      ...(!isCondominiosApp ? [`/gestor/api/unidades/${encodeURIComponent(uid)}/logo`] : []),
      // 3) Sem prefixo (caso o app esteja montado direto)
      `/api/unidades/${encodeURIComponent(uid)}/logo`,
    ];

    // Remove duplicados / vazios
    const out = [];
    raw.forEach(u => {
      const s = String(u || '').trim();
      if (!s) return;
      if (out.includes(s)) return;
      out.push(s);
    });

    // fallback sempre por último
    out.push(UNIT_ICON_URL);
    return out;
  }

  function bindUnidadeLogoImg(imgEl){
    if (!imgEl) return;
    if (imgEl.__wdgUnitLogoBound) return;
    imgEl.__wdgUnitLogoBound = true;
    try {
      imgEl.addEventListener('error', () => {
        let cands = [];
        try { cands = JSON.parse(String(imgEl.getAttribute('data-logo-cands') || '[]')); } catch { cands = []; }
        let idx = 0;
        try { idx = Number(imgEl.getAttribute('data-logo-idx') || '0') || 0; } catch { idx = 0; }
        idx += 1;
        try { imgEl.setAttribute('data-logo-idx', String(idx)); } catch { /* noop */ }

        const next = (Array.isArray(cands) ? cands[idx] : null) || UNIT_ICON_URL;
        try { imgEl.src = next; } catch { /* noop */ }
      });
    } catch { /* noop */ }
  }

  function setUnidadeLogoOnImg(imgEl, unidadeId){
    if (!imgEl) return;
    bindUnidadeLogoImg(imgEl);
    const cands = getUnidadeLogoCandidates(unidadeId);
    try { imgEl.setAttribute('data-logo-cands', JSON.stringify(cands)); } catch { /* noop */ }
    try { imgEl.setAttribute('data-logo-idx', '0'); } catch { /* noop */ }
    try { imgEl.src = cands[0] || UNIT_ICON_URL; } catch { /* noop */ }
  }

  function updateOrgPrintHeader(unidadeId){
    const uid = String(unidadeId || '').trim();
    const u = uid ? findUnidadeById(uid) : null;

    // 1) Logo
    try {
      const img = refs?.orgPrintLogo || document.getElementById('orgPrintLogo');
      if (img) {
        setUnidadeLogoOnImg(img, uid);
        try { img.alt = u?.nome ? `Logo do condomínio ${String(u.nome).trim()}` : 'Logo do condomínio'; } catch { /* noop */ }
      }
    } catch { /* noop */ }

    // 2) Nome
    try {
      const nameEl = refs?.orgPrintUnitName || document.getElementById('orgPrintUnitName');
      if (nameEl) {
        const name = String(u?.nome || '').trim();
        nameEl.textContent = name || (uid || '');
      }
    } catch { /* noop */ }

    // 3) Linhas (endereço / contato / CNPJ)
    const lines = [];
    try {
      const cnpj = String(u?.cnpj || '').trim();
      if (cnpj) lines.push('CNPJ: ' + cnpj);

      const endereco = String(u?.endereco || '').trim();
      const cidade = String(u?.cidade || '').trim();
      const estado = String(u?.estado || '').trim();
      const cep = String(u?.cepFormatado || u?.cep || '').trim();
      const loc = [cidade, estado].filter(Boolean).join(' - ');
      const endLine = [endereco, loc, (cep ? ('CEP: ' + cep) : '')].filter(Boolean).join(' · ');
      if (endLine) lines.push(endLine);

      const telFixo = String(u?.telefoneFixo || '').trim();
      const telCel = String(u?.telefoneCelular || '').trim();
      const tels = [telFixo, telCel].filter(Boolean).join(' / ');
      if (tels) lines.push('Telefone: ' + tels);

      const email = String(u?.emailPrincipal || '').trim();
      if (email) lines.push('E-mail: ' + email);
    } catch { /* noop */ }

    try {
      const lineEls = (refs?.orgPrintLines && refs.orgPrintLines.length)
        ? refs.orgPrintLines
        : Array.from(document.querySelectorAll('[data-org-print-line]'));

      // limpa e aplica até o limite de placeholders
      (lineEls || []).forEach((el, idx) => {
        if (!el) return;
        const text = (lines[idx] != null) ? String(lines[idx]) : '';
        el.textContent = text;
        el.hidden = !text;
      });
    } catch { /* noop */ }
  }

  function buildCondoUserPickHtml(){
    return [
      '<div class="wdg-userpick wdg-userpick-pro wdg-userpick-pro-lg" data-userpick="1" data-userpick-pro="1" data-condo-userpick="1">',
      '  <div class="wdg-userpick-field" role="combobox" aria-expanded="false" aria-haspopup="listbox">',
      '    <div class="wdg-userpick-selected" data-userpick-selected hidden>',
      `      <img class="wdg-userpick-sel-avatar" data-userpick-sel-avatar src="${escapeHtml(UNIT_ICON_URL)}" alt="Logo do condomínio">`,
      '      <div class="wdg-userpick-sel-text">',
      '        <div class="wdg-userpick-sel-name" data-userpick-sel-name></div>',
      '        <div class="wdg-userpick-sel-meta" data-userpick-sel-meta></div>',
      '      </div>',
      '    </div>',
      '    <input class="form-control wdg-userpick-input" type="text" data-condo-input aria-label="Selecionar condomínio" placeholder="Selecionar condomínio" maxlength="160" autocomplete="off" value="">',
      '    <button type="button" class="wdg-userpick-clear" data-userpick-clear aria-label="Limpar" title="Limpar" hidden>×</button>',
      '    <span class="wdg-userpick-chevron" aria-hidden="true"></span>',
      '    <input type="hidden" data-condo-value value="">',
      '  </div>',
      '  <div class="wdg-userpick-menu" data-userpick-menu="1" hidden></div>',
      '</div>'
    ].join('\n');
  }

  function ensureCondoUserPickers(){
    if (!isScopeAll) return;
    if (!refs.condoSelects.length) return;

    refs.condoSelects.forEach((sel) => {
      // esconde select (mantém como storage/fallback)
      try { sel.style.display = 'none'; } catch { /* noop */ }

      const field = sel.closest('.wdg-condo-field');
      const host = field ? field.querySelector('[data-condo-userpick-host="1"]') : null;
      if (!host) return;

      host.classList.add('wdg-on');
      if (host.__wdgHasPicker) return;
      host.__wdgHasPicker = true;
      host.innerHTML = buildCondoUserPickHtml();
    });

    bindCondoUserPickers();
  }

  function teardownCondoUserPickers(){
    refs.condoSelects.forEach(sel => {
      try { sel.style.display = ''; } catch { /* noop */ }
    });
    refs.condoUserPickHosts.forEach(h => {
      try {
        h.classList.remove('wdg-on');
        h.innerHTML = '';
        h.__wdgHasPicker = false;
      } catch { /* noop */ }
    });
  }

  function syncCondoUserPickersFromSelected(){
    if (!isScopeAll) return;
    const current = String(getSelectedUnidadeId() || '').trim();
    const u = current ? findUnidadeById(current) : null;
    document.querySelectorAll('[data-condo-userpick="1"]').forEach(p => {
      const input = p.querySelector('input[data-condo-input]');
      const hidden = p.querySelector('input[data-condo-value]');
      const proAvatar = p.querySelector('[data-userpick-sel-avatar]');
      const proSelected = p.querySelector('[data-userpick-selected]');
      const proName = p.querySelector('[data-userpick-sel-name]');
      const proMeta = p.querySelector('[data-userpick-sel-meta]');
      const proClear = p.querySelector('[data-userpick-clear]');
      if (!input || !hidden) return;

      if (!current || !u) {
        hidden.value = '';
        input.placeholder = 'Selecionar condomínio';
        input.value = '';
        if (proSelected) proSelected.hidden = true;
        if (proClear) proClear.hidden = true;
        p.classList.remove('wdg-userpick-has');
        return;
      }

      hidden.value = current;
      if (proAvatar) setUnidadeLogoOnImg(proAvatar, current);
      if (proName) proName.textContent = String(u.label || current);
      if (proMeta) proMeta.textContent = current;
      input.value = '';
      input.placeholder = 'Trocar condomínio…';
      if (proSelected) proSelected.hidden = false;
      if (proClear) proClear.hidden = false;
      p.classList.add('wdg-userpick-has');
    });
  }

  function bindCondoUserPickers(){
    const pickers = Array.from(document.querySelectorAll('[data-condo-userpick="1"]'));
    if (!pickers.length) return;

    pickers.forEach(p => {
      if (p.__wdgBound) return;
      p.__wdgBound = true;

      const input = p.querySelector('input[data-condo-input]');
      const menu = p.querySelector('[data-userpick-menu="1"]');
      const hidden = p.querySelector('input[data-condo-value]');
      const proClear = p.querySelector('[data-userpick-clear]');
      const proField = p.querySelector('.wdg-userpick-field');

      if (!input || !menu || !hidden) return;

      try { menu.__wdgPicker = p; } catch {}

      function closeMenu(){
        menu.hidden = true;
        menu.innerHTML = '';
        try {
          const field = p.querySelector('.wdg-userpick-field');
          if (field) field.setAttribute('aria-expanded', 'false');
        } catch {}
        p.classList.remove('wdg-userpick-open');
      }

      function positionMenuFixed(){
        if (menu.hidden) return;
        const anchor = proField || input;
        const rect = anchor.getBoundingClientRect();
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;

        const pad = 8;
        let width = Math.max(360, Math.ceil(rect.width));
        width = Math.min(width, Math.max(320, viewportW - (pad * 2)));

        const spaceBelow = Math.max(0, viewportH - rect.bottom);
        const spaceAbove = Math.max(0, rect.top);
        const preferUp = spaceBelow < 240 && spaceAbove > spaceBelow;

        let maxH = 360;
        if (preferUp) maxH = Math.max(180, Math.min(360, spaceAbove - (pad * 2)));
        else maxH = Math.max(180, Math.min(360, spaceBelow - (pad * 2)));

        let left = Math.floor(rect.left);
        if (left + width > viewportW - pad) left = Math.max(pad, Math.floor(viewportW - pad - width));
        if (left < pad) left = pad;

        let top;
        if (preferUp) top = Math.max(pad, Math.floor(rect.top - 6 - maxH));
        else top = Math.min(Math.max(pad, Math.floor(rect.bottom + 6)), Math.max(pad, Math.floor(viewportH - pad - maxH)));

        menu.style.position = 'fixed';
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.width = `${width}px`;
        menu.style.maxHeight = `${maxH}px`;
        menu.style.overflowY = 'auto';
        menu.style.overscrollBehavior = 'contain';
        menu.style.zIndex = '3000';
      }

      function renderMenu(){
        const q = normalizeTextLoose(input.value);
        const list = (unidadesCache || []).slice();
        const filtered = !q ? list : list.filter(u => normalizeTextLoose(u?.label).includes(q) || normalizeTextLoose(u?.id).includes(q));

        const selectedId = String(getSelectedUnidadeId() || '').trim();

        if (!filtered.length) {
          menu.innerHTML = '<div class="wdg-userpick-empty">Nenhum condomínio encontrado.</div>';
          return;
        }

        menu.innerHTML = filtered.map(u => {
          const isSelected = String(u.id) === selectedId;
          return `
            <button type="button" class="wdg-userpick-item" data-userpick-item="1" data-unit-id="${escapeHtml(u.id)}" ${isSelected ? 'data-selected="1"' : ''}>
              <img class="wdg-userpick-avatar" data-unit-logo="1" data-unit-id="${escapeHtml(u.id)}" src="${escapeHtml(UNIT_ICON_URL)}" alt="Logo do condomínio">
              <div class="wdg-userpick-meta">
                <div class="wdg-userpick-name">${escapeHtml(u.label)}</div>
                <div class="wdg-userpick-email">${escapeHtml(u.id)}</div>
              </div>
              <span class="wdg-userpick-check" aria-hidden="true">✓</span>
            </button>
          `;
        }).join('');

        // Carrega logo real da unidade (com fallback)
        try {
          menu.querySelectorAll('img[data-unit-logo="1"]').forEach(img => {
            if (img.__wdgUnitLogoBound) return;
            const uid = String(img.getAttribute('data-unit-id') || '').trim();
            setUnidadeLogoOnImg(img, uid);
          });
        } catch { /* noop */ }
      }

      function openMenu(){
        closeAllUserPickMenus();
        menu.hidden = false;
        p.classList.add('wdg-userpick-open');
        renderMenu();
        try { requestAnimationFrame(() => positionMenuFixed()); } catch { positionMenuFixed(); }
        try {
          const field = p.querySelector('.wdg-userpick-field');
          if (field) field.setAttribute('aria-expanded', 'true');
        } catch {}
      }

      if (proClear && !proClear.__wdgBound) {
        proClear.__wdgBound = true;
        proClear.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          // limpar seleção
          selectedUnitId = '';
          syncCondoSelects('');
          syncCondoUserPickersFromSelected();
          try { localStorage.removeItem(UNIT_PICK_KEY); } catch { /* noop */ }
          toast('Condomínio limpo.', 'info');
          openMenu();
        });
      }

      input.addEventListener('focus', () => openMenu());
      input.addEventListener('click', () => openMenu());

      let _t = null;
      input.addEventListener('input', () => {
        if (_t) clearTimeout(_t);
        _t = setTimeout(() => {
          if (!menu.hidden) {
            renderMenu();
            positionMenuFixed();
          } else {
            openMenu();
          }
        }, 60);
      });

      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          closeMenu();
        }
      });

      menu.addEventListener('click', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement)) return;
        const btn = t.closest('[data-userpick-item="1"]');
        if (!btn) return;
        const unitId = String(btn.getAttribute('data-unit-id') || '').trim();
        if (!unitId) return;

        selectedUnitId = unitId;
        syncCondoSelects(unitId);
        syncCondoUserPickersFromSelected();
        try { localStorage.setItem(UNIT_PICK_KEY, unitId); } catch { /* noop */ }
        void handleUnitChange(unitId, { silentToast: false, reason: 'userpick-change' });
        closeMenu();
      });
    });
  }

  function wireNav(){
    refs.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-view');
        if (String(v || '').trim().toLowerCase() === 'configuracao' && !canEdit) {
          toast('Configuração disponível apenas para Master/Admin/Diretor.', 'warning');
          return;
        }
        setView(v);
      });
    });

    refs.jumpButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-jump');
        if (String(target || '').trim().toLowerCase() === 'configuracao' && !canEdit) {
          toast('Configuração disponível apenas para Master/Admin/Diretor.', 'warning');
          return;
        }
        setView(target);
      });
    });

    // View inicial
    setView('inicio', { silent: true });

    // Estado inicial do menu/painel conforme permissão.
    try { syncConfigVisibility(); } catch { /* noop */ }

    try {
      window.addEventListener('resize', () => {
        updateInicioFillHeight();
      });
    } catch {}
  }

  function updateInicioFillHeight(){
    if (!refs.contentRoot) return;
    if (currentView !== 'inicio') {
      refs.contentRoot.style.removeProperty('--wdg-inicio-fill-h');
      return;
    }

    // Altura disponível do topo do conteúdo até o rodapé do viewport (evita scroll “sobrando”)
    const rect = refs.contentRoot.getBoundingClientRect();
    const bottomGap = 16;
    const h = Math.max(360, Math.floor(window.innerHeight - rect.top - bottomGap));
    refs.contentRoot.style.setProperty('--wdg-inicio-fill-h', `${h}px`);
  }

  function wireActions(){
    if (refs.btnSave) {
      refs.btnSave.addEventListener('click', async () => {
        saveState();
        await flushCloudSave();
        toast('Salvo na nuvem.', 'success');
      });
    }

    if (refs.btnExport) {
      refs.btnExport.addEventListener('click', () => {
        const payload = buildExportPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dirigencia-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Exportado JSON da dirigência.', 'info');
      });
    }

    if (refs.btnReset) {
      refs.btnReset.addEventListener('click', () => {
        if (!confirm('Resetar cargos e atribuições para o padrão?')) return;
        state = defaultState();
        saveState();
        renderAll();
        toast('Reset concluído.', 'warning');
      });
    }

    if (refs.rolesPager) {
      refs.rolesPager.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('[data-roles-page]') : null;
        if (!btn) return;
        const action = btn.getAttribute('data-roles-page');
        if (action === 'prev') rolesPage = Math.max(1, rolesPage - 1);
        if (action === 'next') rolesPage = rolesPage + 1;
        if (action === 'first') rolesPage = 1;
        if (action === 'last') rolesPage = 999999;
        renderRolesTable();
      });

      refs.rolesPager.addEventListener('change', (ev) => {
        const sel = ev.target;
        if (!sel || !sel.matches || !sel.matches('[data-roles-pagesize]')) return;
        const nextSize = Number(sel.value);
        if (!Number.isFinite(nextSize) || nextSize <= 0) return;
        rolesPageSize = nextSize;
        rolesPage = 1;
        renderRolesTable();
      });
    }

    if (refs.btnAddRole) {
      refs.btnAddRole.addEventListener('click', async () => {
        try { await openRoleCreateDialog(); } catch { /* noop */ }
      });
    }

    if (refs.btnRefresh) {
      refs.btnRefresh.addEventListener('click', () => renderAll());
    }

    if (refs.btnDemo) {
      refs.btnDemo.addEventListener('click', () => {
        state = defaultState();
        saveState();
        renderAll();
        toast('Demo aplicada. Ajuste como quiser.', 'info');
      });
    }

    if (refs.btnClearAssignments) {
      refs.btnClearAssignments.addEventListener('click', () => {
        toast('Atribuições agora são derivadas de mandatos. Use “Encerrar mandato” no cargo desejado.', 'info');
      });
    }

    if (refs.btnPreviewZoomOut) {
      refs.btnPreviewZoomOut.addEventListener('click', () => {
        setPreviewZoomPercent(previewZoomPercent - 10);
      });
    }

    if (refs.btnPreviewZoomIn) {
      refs.btnPreviewZoomIn.addEventListener('click', () => {
        setPreviewZoomPercent(previewZoomPercent + 10);
      });
    }

    if (refs.btnOrgZoomOut) {
      refs.btnOrgZoomOut.addEventListener('click', () => {
        setOrgZoomPercent(orgZoomPercent - 10);
      });
    }

    if (refs.btnOrgZoomIn) {
      refs.btnOrgZoomIn.addEventListener('click', () => {
        setOrgZoomPercent(orgZoomPercent + 10);
      });
    }

    if (refs.btnOrgPrint) {
      refs.btnOrgPrint.addEventListener('click', () => {
        try { void printOrganograma(); } catch { /* noop */ }
      });
    }

    if (!__slotStyleWired) {
      __slotStyleWired = true;
      document.addEventListener('wdg:slot-style:apply', (ev) => {
        const d = (ev && ev.detail && typeof ev.detail === 'object') ? ev.detail : {};
        const roleId = String(d.roleId || '').trim();
        const applyAll = !!d.applyAll;
        const style = d.style;

        try { console.log('[slot-style] apply', { roleId, applyAll }); } catch { /* noop */ }

        ensureSlotStyleState();

        if (applyAll) {
          state.slotStyle.global = normalizeSlotStyle(style);
          state.slotStyle.byRole = {};
        } else if (roleId) {
          state.slotStyle.byRole[roleId] = normalizeSlotStyle(style);
        } else {
          return;
        }

        saveState();
        applySlotStyleToStages({ roleId, applyAll });
      });
    }

    // Delegação de eventos: tabela de roles
    document.addEventListener('change', (ev) => {
      const el = ev.target;
      if (!(el instanceof HTMLElement)) return;

      if (el.matches('[data-role-parent-select]')) {
        const roleId = el.getAttribute('data-role-id');
        const parentId = el.value || null;
        if (!roleId) return;
        if (parentId === roleId) {
          toast('Um cargo não pode se subordinar a si mesmo.', 'danger');
          el.value = getRole(roleId)?.parentId || '';
          return;
        }
        // Prevenir ciclos
        if (parentId && createsCycle(roleId, parentId)) {
          toast('Hierarquia inválida: isso criaria um ciclo.', 'danger');
          el.value = getRole(roleId)?.parentId || '';
          return;
        }
        setRoleParent(roleId, parentId);
        saveState();
        renderAll();
        toast('Hierarquia atualizada.', 'success');
        return;
      }

      if (el.matches('[data-role-user-select]')) {
        const roleId = el.getAttribute('data-role-id');
        if (!roleId) return;
        const userId = el.value || '';
        setAssignment(roleId, userId || null);
        saveState();
        renderAll();
        toast('Atribuição atualizada.', 'success');
        return;
      }

      if (el.matches('[data-role-type-select]')) {
        const roleId = el.getAttribute('data-role-id');
        if (!roleId) return;
        const val = String(el.value || '').toLowerCase();
        setRoleRelationType(roleId, val);
        saveState();
        renderAll();
        toast('Tipo de subordinação atualizado.', 'success');
        return;
      }
    });

    document.addEventListener('click', async (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;

      const mandatoNewBtn = target.closest('[data-mandato-new]');
      if (mandatoNewBtn) {
        try { ev.preventDefault(); } catch { /* noop */ }
        if (!canEdit) {
          toast('Sem permissão para editar Dirigência. (Apenas Master/Admin/Diretor)', 'warning');
          return;
        }
        const roleId = String(mandatoNewBtn.getAttribute('data-role-id') || '').trim();
        if (!roleId) return;
        const uid = String(getSelectedUnidadeId() || '').trim();
        if (uid) {
          await ensureMandatosAtivosLoadedForUnit(uid, { silent: true });
          const active = mandatosAtivosCache ? mandatosAtivosCache[roleId] : null;
          const activeId = String(active?.id || active?._id || '').trim();
          if (activeId) {
            const ok = confirm('Já existe um mandato ativo para este cargo. Para criar um novo, primeiro é necessário encerrar o mandato atual. Abrir encerramento agora?');
            if (ok) openEndModal(roleId, activeId);
            return;
          }
        }
        openNewMandatoModal(roleId);
        return;
      }

      const mandatoHistoryBtn = target.closest('[data-mandato-history]');
      if (mandatoHistoryBtn) {
        try { ev.preventDefault(); } catch { /* noop */ }
        const roleId = String(mandatoHistoryBtn.getAttribute('data-role-id') || '').trim();
        if (roleId) await openHistoryModal(roleId);
        return;
      }

      const mandatoEndBtn = target.closest('[data-mandato-end]');
      if (mandatoEndBtn) {
        try { ev.preventDefault(); } catch { /* noop */ }
        if (!canEdit) {
          toast('Sem permissão para editar Dirigência. (Apenas Master/Admin/Diretor)', 'warning');
          return;
        }
        const roleId = String(mandatoEndBtn.getAttribute('data-role-id') || '').trim();
        const mandatoId = String(mandatoEndBtn.getAttribute('data-mandato-id') || '').trim();
        if (mandatoId) openEndModal(roleId, mandatoId);
        return;
      }

      // Editar slot (cards do organograma / preview): abre modal via evento (modal_editar_slot_organograma.js)
      const slotEditBtn = target.closest('.wdg-slot-editbtn');
      if (slotEditBtn) {
        try { ev.preventDefault(); } catch { /* noop */ }
        try { ev.stopPropagation(); } catch { /* noop */ }

        // Evita clique logo após drag/drop (pointer reorder)
        try {
          if (__slotEditorSuppressClickUntil && Date.now() < __slotEditorSuppressClickUntil) {
            console.log('[slot-editor] suppressed click (after drag)');
            return;
          }
        } catch { /* noop */ }

        const roleId = String(slotEditBtn.getAttribute('data-role-id') || '').trim();
        console.log('[slot-editor] click', { roleId, hasModalEl: !!document.getElementById('modalEditarSlotOrganograma') });
        if (!roleId) return;

        try {
          document.dispatchEvent(new CustomEvent('wdg:slot-editor:open', { detail: { roleId } }));
        } catch (e) {
          console.error('[slot-editor] failed to dispatch open event', e);
        }
        return;
      }

      const delBtn = target.closest('[data-role-delete]');
      if (delBtn) {
        const roleId = delBtn.getAttribute('data-role-id');
        const role = getRole(roleId);
        if (!role) return;
        if (!role.deletable) {
          toast('Este cargo não pode ser apagado.', 'danger');
          return;
        }
        const ask = (window.WDGCargoOrganograma && typeof window.WDGCargoOrganograma.confirmDeleteRole === 'function')
          ? window.WDGCargoOrganograma.confirmDeleteRole({ roleName: role.nome })
          : Promise.resolve(confirm(`Apagar o cargo "${role.nome}"?`));

        const ok = await ask;
        if (!ok) return;
        deleteRole(roleId);
        saveState();
        renderAll();
        toast('Cargo removido.', 'warning');
        return;
      }

      const renameBtn = target.closest('[data-role-rename]');
      if (renameBtn) {
        const roleId = renameBtn.getAttribute('data-role-id');
        const role = getRole(roleId);
        if (!role) return;
        try { await openRoleRenameDialog(roleId); } catch { /* noop */ }
        return;
      }
    });

    // Reordenação por arrasto (swap): preview, atribuições e tabela
    wireOrgPreviewReorder();
    wireAssignmentsReorder();
    wireRolesTableReorder();
  }

  function sortRolesForUiList(roles){
    const arr = (roles || []).slice();
    // Para telas de lista (Atribuições e Tabela): ordem puramente pelo sortIndex
    // (sem acoplar vínculo horizontal/blocos).
    return arr.sort((a,b) => {
      const ia = Number(a?.sortIndex);
      const ib = Number(b?.sortIndex);
      const fa = Number.isFinite(ia);
      const fb = Number.isFinite(ib);
      if (fa && fb && ia !== ib) return ia - ib;
      if (fa && !fb) return -1;
      if (!fa && fb) return 1;
      return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR');
    });
  }

  function swapRolesInUiOrder(roleAId, roleBId){
    const aId = String(roleAId || '').trim();
    const bId = String(roleBId || '').trim();
    if (!aId || !bId || aId === bId) return false;

    const aRole = getRole(aId);
    const bRole = getRole(bId);
    if (!aRole || !bRole) return false;

    const ordered = sortRolesForUiList(state.roles);
    const iA = ordered.findIndex(r => String(r?.id || '') === aId);
    const iB = ordered.findIndex(r => String(r?.id || '') === bId);
    if (iA < 0 || iB < 0 || iA === iB) return false;

    const tmp = ordered[iA];
    ordered[iA] = ordered[iB];
    ordered[iB] = tmp;

    // Reindexa globalmente, sem blocos horizontais.
    let base = 0;
    for (const r of ordered) {
      if (!r) continue;
      base += 100;
      r.sortIndex = base;
    }

    // Segurança: garante inteiros/normalização
    ensureRoleSortIndexes();
    return true;
  }

  function clearDndHints(rootEl){
    if (!rootEl) return;
    try {
      rootEl.querySelectorAll('.wdg-dnd-drop, .wdg-dnd-dragging').forEach(el => {
        el.classList.remove('wdg-dnd-drop', 'wdg-dnd-dragging');
      });
    } catch {}
  }

  function wireAssignmentsReorder(){
    if (!refs.assignmentsContainer) return;
    const host = refs.assignmentsContainer;
    if (host.dataset.wdgAssignmentsReorderBound === '1') return;
    host.dataset.wdgAssignmentsReorderBound = '1';

    if (!(typeof window !== 'undefined' && 'PointerEvent' in window)) return;

    const drag = {
      active: false,
      pointerId: 0,
      roleId: '',
      overRoleId: '',
      startX: 0,
      startY: 0,
      moved: false,
      draggingEl: null
    };

    const isInteractive = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      return !!(el.closest('input, textarea, select, button, a, [data-userpick="1"], [data-userpick-menu="1"]'));
    };

    const getItem = (el) => {
      if (!(el instanceof HTMLElement)) return null;
      const item = el.closest('.wdg-assignment-slot[data-role-id]');
      if (item && host.contains(item)) return item;
      return null;
    };

    const getItemFromPoint = (x, y) => {
      try {
        const el = document.elementFromPoint(x, y);
        return getItem(el);
      } catch {
        return null;
      }
    };

    const isAllowedTarget = (item) => {
      if (!item) return false;
      const rid = String(item.getAttribute('data-role-id') || '').trim();
      if (!rid) return false;
      if (rid === drag.roleId) return false;
      return true;
    };

    const updateOver = (x, y) => {
      const item = getItemFromPoint(x, y);
      if (!isAllowedTarget(item)) {
        drag.overRoleId = '';
        clearDndHints(host);
        return;
      }
      drag.overRoleId = String(item.getAttribute('data-role-id') || '').trim();
      clearDndHints(host);
      item.classList.add('wdg-dnd-drop');
    };

    const end = (apply) => {
      const roleId = drag.roleId;
      const over = drag.overRoleId;
      if (drag.draggingEl) {
        try { drag.draggingEl.classList.remove('wdg-dnd-dragging'); } catch {}
      }
      drag.active = false;
      drag.pointerId = 0;
      drag.roleId = '';
      drag.overRoleId = '';
      drag.startX = 0;
      drag.startY = 0;
      drag.moved = false;
      drag.draggingEl = null;
      clearDndHints(host);

      if (!apply) return;
      if (!roleId || !over) return;
      const changed = swapRolesInUiOrder(roleId, over);
      if (changed) {
        saveState();
        renderAll();
        toast('Ordem dos slots atualizada.', 'success');
      }
    };

    host.addEventListener('pointerdown', (ev) => {
      if (!(ev.target instanceof HTMLElement)) return;
      if (ev.button != null && ev.button !== 0) return;
      if (isInteractive(ev.target)) return;

      const item = getItem(ev.target);
      if (!item) return;
      const roleId = String(item.getAttribute('data-role-id') || '').trim();
      if (!roleId) return;
      const role = getRole(roleId);
      if (!role) return;

      drag.active = true;
      drag.pointerId = ev.pointerId;
      drag.roleId = roleId;
      drag.overRoleId = '';
      drag.startX = ev.clientX;
      drag.startY = ev.clientY;
      drag.moved = false;
      drag.draggingEl = item;

      try { item.setPointerCapture(ev.pointerId); } catch {}
      try { ev.preventDefault(); } catch {}
    }, { passive: false });

    host.addEventListener('pointermove', (ev) => {
      if (!drag.active) return;
      if (ev.pointerId !== drag.pointerId) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      const dist2 = (dx * dx) + (dy * dy);
      if (!drag.moved) {
        if (dist2 < 16) return;
        drag.moved = true;
        if (drag.draggingEl) drag.draggingEl.classList.add('wdg-dnd-dragging');
      }
      try { ev.preventDefault(); } catch {}
      updateOver(ev.clientX, ev.clientY);
    }, { passive: false });

    host.addEventListener('pointerup', (ev) => {
      if (!drag.active) return;
      if (ev.pointerId !== drag.pointerId) return;
      try { ev.preventDefault(); } catch {}
      end(!!drag.moved);
    }, { passive: false });

    host.addEventListener('pointercancel', (ev) => {
      if (!drag.active) return;
      if (ev.pointerId !== drag.pointerId) return;
      end(false);
    });
  }

  function wireRolesTableReorder(){
    if (!refs.rolesTableBody) return;
    const host = refs.rolesTableBody;
    const table = host.closest('table');
    const flagHost = table || host;
    if (flagHost && flagHost.dataset && flagHost.dataset.wdgRolesReorderBound === '1') return;
    if (flagHost && flagHost.dataset) flagHost.dataset.wdgRolesReorderBound = '1';

    if (!(typeof window !== 'undefined' && 'PointerEvent' in window)) return;

    const drag = {
      active: false,
      pointerId: 0,
      roleId: '',
      overRoleId: '',
      startX: 0,
      startY: 0,
      moved: false,
      draggingEl: null
    };

    const getRow = (el) => {
      if (!(el instanceof HTMLElement)) return null;
      const row = el.closest('tr[data-role-id]');
      if (row && host.contains(row)) return row;
      return null;
    };

    const getRowFromPoint = (x, y) => {
      try {
        const el = document.elementFromPoint(x, y);
        return getRow(el);
      } catch {
        return null;
      }
    };

    const isAllowedTarget = (row) => {
      if (!row) return false;
      const rid = String(row.getAttribute('data-role-id') || '').trim();
      if (!rid) return false;
      if (rid === drag.roleId) return false;
      return true;
    };

    const updateOver = (x, y) => {
      const row = getRowFromPoint(x, y);
      if (!isAllowedTarget(row)) {
        drag.overRoleId = '';
        clearDndHints(host);
        return;
      }
      drag.overRoleId = String(row.getAttribute('data-role-id') || '').trim();
      clearDndHints(host);
      row.classList.add('wdg-dnd-drop');
    };

    const end = (apply) => {
      const roleId = drag.roleId;
      const over = drag.overRoleId;
      if (drag.draggingEl) {
        try { drag.draggingEl.classList.remove('wdg-dnd-dragging'); } catch {}
      }
      drag.active = false;
      drag.pointerId = 0;
      drag.roleId = '';
      drag.overRoleId = '';
      drag.startX = 0;
      drag.startY = 0;
      drag.moved = false;
      drag.draggingEl = null;
      clearDndHints(host);

      if (!apply) return;
      if (!roleId || !over) return;
      const changed = swapRolesInUiOrder(roleId, over);
      if (changed) {
        saveState();
        renderAll();
        toast('Ordem da tabela atualizada.', 'success');
      }
    };

    host.addEventListener('pointerdown', (ev) => {
      if (!(ev.target instanceof HTMLElement)) return;
      if (ev.button != null && ev.button !== 0) return;

      // Só inicia por um "handle" para não conflitar com selects/botões
      if (!ev.target.closest('[data-role-drag-handle="1"]')) return;

      const row = getRow(ev.target);
      if (!row) return;
      const roleId = String(row.getAttribute('data-role-id') || '').trim();
      if (!roleId) return;
      const role = getRole(roleId);
      if (!role) return;

      drag.active = true;
      drag.pointerId = ev.pointerId;
      drag.roleId = roleId;
      drag.overRoleId = '';
      drag.startX = ev.clientX;
      drag.startY = ev.clientY;
      drag.moved = false;
      drag.draggingEl = row;

      try { row.setPointerCapture(ev.pointerId); } catch {}
      try { ev.preventDefault(); } catch {}
    }, { passive: false });

    host.addEventListener('pointermove', (ev) => {
      if (!drag.active) return;
      if (ev.pointerId !== drag.pointerId) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      const dist2 = (dx * dx) + (dy * dy);
      if (!drag.moved) {
        if (dist2 < 16) return;
        drag.moved = true;
        if (drag.draggingEl) drag.draggingEl.classList.add('wdg-dnd-dragging');
      }
      try { ev.preventDefault(); } catch {}
      updateOver(ev.clientX, ev.clientY);
    }, { passive: false });

    host.addEventListener('pointerup', (ev) => {
      if (!drag.active) return;
      if (ev.pointerId !== drag.pointerId) return;
      try { ev.preventDefault(); } catch {}
      end(!!drag.moved);
    }, { passive: false });

    host.addEventListener('pointercancel', (ev) => {
      if (!drag.active) return;
      if (ev.pointerId !== drag.pointerId) return;
      end(false);
    });
  }

  function setView(view, opts = {}){
    const v = String(view || '').trim().toLowerCase();
    const known = new Set(['inicio', 'dirigentes', 'configuracao']);
    let chosen = known.has(v) ? v : 'inicio';

    if (chosen === 'configuracao' && !canEdit) {
      chosen = 'dirigentes';
      if (!opts?.silent) toast('Configuração disponível apenas para Master/Admin/Diretor.', 'warning');
    }

    currentView = chosen;
    try { root.classList.toggle('wdg-view-inicio', chosen === 'inicio'); } catch {}

    Object.entries(panes).forEach(([key, pane]) => {
      if (!pane) return;
      if (key === chosen) pane.classList.remove('d-none');
      else pane.classList.add('d-none');
    });

    if (refs.contentRoot) {
      refs.contentRoot.classList.toggle('wdg-drg-content--flat', chosen === 'inicio');
    }

    try { requestAnimationFrame(() => updateInicioFillHeight()); } catch {}

    // Ao abrir Configuração, reaplica zoom/linhas depois do layout ficar visível.
    if (chosen === 'configuracao') {
      try { requestAnimationFrame(() => applyPreviewZoom()); } catch {}
    }

    // Ao abrir Início, reaplica zoom/linhas do organograma principal.
    if (chosen === 'inicio') {
      try { requestAnimationFrame(() => applyOrgZoom()); } catch {}
    }

    refs.navButtons.forEach(btn => {
      const isActive = btn.getAttribute('data-view') === chosen;
      btn.classList.toggle('active', isActive);
    });

    try { syncConfigVisibility(); } catch { /* noop */ }

    if (!opts.silent) {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    }
  }

  function renderAll(){
    renderKpis();
    renderOrg(refs.orgContainer);
    applyOrgZoom();
    renderAssignments();
    renderUsersPreview();
    renderRolesTable();
    renderOrg(refs.orgPreview, { preview: true });
    applyPreviewZoom();
  }

  function getOrgScaleFromPercent(percent){
    const p = clampInt(percent, 40, 300);
    return p / 100;
  }

  function applyOrgZoom(){
    if (!refs.orgContainer) return;
    const stage = refs.orgContainer.querySelector('.wdg-orgstage');
    if (!stage) return;

    const scale = getOrgScaleFromPercent(orgZoomPercent);

    if (__supportsCssZoom) {
      stage.style.zoom = String(scale);
      stage.style.transform = '';
    } else {
      stage.style.zoom = '';
      stage.style.transform = `scale(${scale})`;
      stage.style.transformOrigin = 'top center';
    }

    updateOrgZoomLabel();

    try {
      if (!stage.dataset.wdgOrgScrollInit) {
        stage.dataset.wdgOrgScrollInit = '1';
        refs.orgContainer.scrollTop = 0;
        refs.orgContainer.scrollLeft = Math.max(0, Math.floor((refs.orgContainer.scrollWidth - refs.orgContainer.clientWidth) / 2));
      }
    } catch {}

    try {
      setTimeout(() => {
        scheduleDrawOrgLines(stage, { preview: false });
      }, 0);
    } catch {}
  }

  function updateOrgZoomLabel(){
    if (!refs.orgZoomLabel) return;
    refs.orgZoomLabel.textContent = `${clampInt(orgZoomPercent, 40, 300)}%`;
  }

  function setOrgZoomPercent(percent){
    orgZoomPercent = clampInt(percent, 40, 300);
    saveOrgZoomPercent(orgZoomPercent);
    applyOrgZoom();
  }

  function loadOrgZoomPercent(){
    try {
      const raw = localStorage.getItem(ORG_ZOOM_KEY);
      if (!raw) return 100;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return 100;
      // Compat: valores antigos de "nível" viram % (100%, 150%, ...)
      if (Math.abs(parsed) <= 10) {
        return clampInt(100 + (Math.round(parsed) * 50), 40, 300);
      }
      return clampInt(parsed, 40, 300);
    } catch {
      return 100;
    }
  }

  function saveOrgZoomPercent(percent){
    try {
      localStorage.setItem(ORG_ZOOM_KEY, String(percent));
    } catch {
      // ignore
    }
  }

  function getPreviewScaleFromPercent(percent){
    const p = clampInt(percent, 40, 300);
    return p / 100;
  }

  function applyPreviewZoom(){
    if (!refs.orgPreview) return;
    const stage = refs.orgPreview.querySelector('.wdg-orgstage');
    if (!stage) return;

    const scale = getPreviewScaleFromPercent(previewZoomPercent);

    if (__supportsCssZoom) {
      stage.style.zoom = String(scale);
      stage.style.transform = '';
    } else {
      stage.style.zoom = '';
      stage.style.transform = `scale(${scale})`;
      stage.style.transformOrigin = 'top center';
    }

    updatePreviewZoomLabel();

    // Botão de editar slot: manter tamanho/distância constantes independente do zoom
    try {
      const inv = (scale && Number.isFinite(scale) && scale > 0) ? (1 / scale) : 1;
      stage.style.setProperty('--wdg-slot-editbtn-inv-scale', inv.toFixed(3));
      stage.style.setProperty('--wdg-slot-editbtn-off', `${(-12 * inv).toFixed(2)}px`);
    } catch { /* noop */ }

    // Quando o preview é re-renderizado, o scroll pode ficar em uma posição ruim
    // e dar a impressão que o organograma sumiu. Mantemos o topo visível e centralizamos.
    try {
      if (!stage.dataset.wdgPreviewScrollInit) {
        stage.dataset.wdgPreviewScrollInit = '1';
        refs.orgPreview.scrollTop = 0;
        refs.orgPreview.scrollLeft = Math.max(0, Math.floor((refs.orgPreview.scrollWidth - refs.orgPreview.clientWidth) / 2));
      }
    } catch {}

    // Garante conectores corretos quando o layout muda.
    try {
      setTimeout(() => {
        scheduleDrawOrgLines(stage, { preview: true });
      }, 0);
    } catch {}
  }

  function updatePreviewZoomLabel(){
    if (!refs.previewZoomLabel) return;
    refs.previewZoomLabel.textContent = `${clampInt(previewZoomPercent, 40, 300)}%`;
  }

  function setPreviewZoomPercent(percent){
    previewZoomPercent = clampInt(percent, 40, 300);
    savePreviewZoomPercent(previewZoomPercent);
    applyPreviewZoom();
  }

  function loadPreviewZoomPercent(){
    try {
      const raw = localStorage.getItem(PREVIEW_ZOOM_KEY);
      if (!raw) return 50;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return 50;
      // Compat: valores antigos de "nível" (inteiros pequenos) viram % (50%, 100%, 150%, ...)
      if (Math.abs(parsed) <= 10) {
        return clampInt(50 + (Math.round(parsed) * 50), 40, 300);
      }
      return clampInt(parsed, 40, 300);
    } catch {
      return 50;
    }
  }

  function savePreviewZoomPercent(percent){
    try {
      localStorage.setItem(PREVIEW_ZOOM_KEY, String(percent));
    } catch {
      // ignore
    }
  }

  function clampInt(value, min, max){
    const n = Number(value);
    const i = Number.isFinite(n) ? Math.round(n) : 0;
    return Math.max(min, Math.min(max, i));
  }

  function renderKpis(){
    const roles = state.roles || [];
    const assigned = Object.values(state.assignments || {}).filter(Boolean).length;
    if (refs.kpiRoles) refs.kpiRoles.textContent = String(roles.length);
    if (refs.kpiAssigned) refs.kpiAssigned.textContent = String(assigned);
  }

  function renderUsersPreview(){
    if (!refs.usersPreview) return;
    refs.usersPreview.innerHTML = '';

    const assignments = state.assignments || {};
    const byUser = new Map();
    Object.keys(assignments).forEach(roleId => {
      const userId = String(assignments[roleId] || '').trim();
      if (!userId) return;
      if (!byUser.has(userId)) byUser.set(userId, []);
      byUser.get(userId).push(getRoleName(roleId) || roleId);
    });

    if (!byUser.size) {
      refs.usersPreview.innerHTML = '<div class="wdg-empty">Nenhum usuário atribuído nesta unidade.</div>';
      return;
    }

    const users = getActiveUsers();
    const cards = Array.from(byUser.entries()).map(([userId, roles]) => {
      const u = (users || []).find(x => String(x?.id || '') === String(userId)) || null;
      const nome = u ? String(u.nome || '').trim() : String(userId);
      const email = u ? String(u.email || '').trim() : '';
      const rolesLabel = (roles || []).slice().sort((a,b) => String(a||'').localeCompare(String(b||''), 'pt-BR')).join(', ');
      const row = document.createElement('div');
      row.className = 'border rounded-4 p-3';
      row.innerHTML = `
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div style="min-width:0;">
            <p class="mb-0 fw-semibold" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(nome)}</p>
            <small class="text-muted" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${escapeHtml(email || '—')}</small>
            <small class="text-muted" style="display:block; margin-top:4px;">${escapeHtml(rolesLabel)}</small>
          </div>
          <span class="badge text-bg-primary" title="Quantidade de cargos">${escapeHtml(String((roles || []).length))}</span>
        </div>`;
      return row;
    });

    cards
      .sort((a,b) => String(a.textContent||'').localeCompare(String(b.textContent||''), 'pt-BR'))
      .forEach(el => refs.usersPreview.appendChild(el));
  }

  function renderAssignments(){
    if (!refs.assignmentsContainer) return;

    const roles = sortRolesForUiList(state.roles);
    if (!roles.length) {
      refs.assignmentsContainer.innerHTML = '<div class="wdg-empty">Nenhum cargo cadastrado.</div>';
      return;
    }


    const container = document.createElement('div');
    container.className = 'wdg-assignments-grid';

    roles.forEach(role => {
      const mandate = (mandatosAtivosLoaded && mandatosAtivosUnitId === String(getSelectedUnidadeId() || '').trim())
        ? (mandatosAtivosCache ? mandatosAtivosCache[role.id] : null)
        : null;

      const ended = (() => {
        if (!mandate || !mandate.fim) return false;
        const dt = new Date(mandate.fim);
        if (!Number.isFinite(dt.getTime())) return false;
        return dt.getTime() < Date.now();
      })();

      const statusText = mandate ? (ended ? 'Encerrado' : 'Ativo') : 'Vago';
      const statusClass = mandate
        ? (ended ? 'wdg-slot-pill wdg-slot-pill--ended' : 'wdg-slot-pill wdg-slot-pill--active')
        : 'wdg-slot-pill wdg-slot-pill--vacant';

      const assignedUserId = String(mandate?.usuario?.id || mandate?.usuario?._id || ((state.assignments && state.assignments[role.id]) || '')).trim();
      const cachedUser = assignedUserId ? (getActiveUsers() || []).find(u => String(u?.id || '') === assignedUserId) : null;
      const mandateUser = (mandate && mandate.usuario && typeof mandate.usuario === 'object') ? mandate.usuario : null;
      const assignedName = String(mandateUser?.nome || '').trim() || String(cachedUser?.nome || '').trim();
      const assignedEmail = String(mandateUser?.email || '').trim() || String(cachedUser?.email || '').trim();
      const assignedAvatar = coerceUserAvatarUrl(String(mandateUser?.foto || '').trim() || String(cachedUser?.fotoUrl || '').trim());
      const assignedLabel = (assignedName || assignedEmail || assignedUserId || '').trim();
      const inicioLabel = mandate?.inicio ? formatDateBR(mandate.inicio) : '—';
      const fimLabel = mandate?.fim ? formatDateBR(mandate.fim) : '—';
      const mandatoLabel = mandate ? `${inicioLabel} — ${fimLabel}` : '—';
      const mandatoId = String(mandate?.id || mandate?._id || '').trim();

      const docUrl = coerceMandatoDocumentoUrl(mandate?.documento?.url);
      const docName = String(mandate?.documento?.originalName || '').trim() || 'Documento';

      const card = document.createElement('div');
      card.className = 'wdg-assignment-slot';
      card.setAttribute('data-role-id', String(role.id || ''));
      card.setAttribute('data-visual-parent-id', getVisualParentId(role.id) || '');

      const actionsHtml = canEdit
        ? `
          <div class="wdg-slot-actions">
            <button type="button" class="btn btn-sm btn-primary" data-mandato-new="1" data-role-id="${escapeHtml(role.id)}">Novo mandato</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-mandato-end="1" data-role-id="${escapeHtml(role.id)}" data-mandato-id="${escapeHtml(mandatoId)}" ${mandatoId ? '' : 'disabled'}>Encerrar mandato</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-mandato-history="1" data-role-id="${escapeHtml(role.id)}">Ver histórico</button>
          </div>
        `
        : `
          <div class="wdg-slot-actions">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-mandato-history="1" data-role-id="${escapeHtml(role.id)}">Ver histórico</button>
          </div>
          <div class="small text-muted mt-2">Edição disponível apenas para Master/Admin/Diretor.</div>
        `;

      card.innerHTML = `
        <div class="wdg-slot-head">
          <div style="min-width:0;">
            <div class="wdg-slot-role">${escapeHtml(role.nome)}</div>
            <div class="wdg-slot-sub">Subordina a: ${escapeHtml(getRoleName(role.parentId) || '—')}</div>
          </div>
          <div class="${escapeHtml(statusClass)}">${escapeHtml(statusText)}</div>
        </div>

        <div>
          <div class="wdg-slot-label">Responsável</div>
          ${assignedUserId ? `
            <div class="wdg-slot-user" style="margin-top:6px;">
              <img class="wdg-slot-avatar" src="${escapeHtml(assignedAvatar)}" alt="" onerror="this.onerror=null; this.src='${escapeHtml(getDefaultUserAvatarUrl())}';">
              <div class="wdg-slot-usertext">
                <div class="wdg-slot-username">${escapeHtml(assignedLabel || '—')}</div>
                <div class="wdg-slot-usermeta">${escapeHtml(assignedEmail || '—')}</div>
              </div>
            </div>
          ` : `<div class="wdg-slot-value" style="margin-top:6px;">—</div>`}

          <div class="wdg-slot-row">
            <div>
              <div class="wdg-slot-label">Mandato</div>
              <div class="wdg-slot-value">${escapeHtml(mandatoLabel)}</div>
            </div>
          </div>

          <div class="wdg-slot-row">
            <div style="min-width:0;">
              <div class="wdg-slot-label">Documento</div>
              ${docUrl ? `
                <a class="wdg-slot-doclink" href="${escapeHtml(docUrl)}" target="_blank" rel="noopener" title="${escapeHtml(docName)}">${escapeHtml(docName)}</a>
              ` : `<div class="wdg-slot-value">—</div>`}
            </div>
          </div>

          ${actionsHtml}
        </div>
      `;
      container.appendChild(card);
    });

    refs.assignmentsContainer.innerHTML = '';
    refs.assignmentsContainer.appendChild(container);
  }

  function ensureMandatoModals(){
    if (__mandatoModalsReady) return;
    __mandatoModalsReady = true;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal fade" id="wdgMandatoModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <form data-mandato-form>
              <div class="modal-header">
                <h5 class="modal-title">Novo mandato</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
              </div>
              <div class="modal-body">
                <input type="hidden" data-mandato-role-id value="">
                <div class="mb-2 text-muted" data-mandato-role-label></div>

                <div class="row g-2">
                  <div class="col-12 col-md-6">
                    <label class="form-label">Usuário ocupante</label>
                    <div class="wdg-userpick wdg-userpick-pro wdg-userpick-pro-lg" data-userpick="1" data-userpick-pro="1" data-mandato-userpick="1">
                      <div class="wdg-userpick-field" role="combobox" aria-expanded="false" aria-haspopup="listbox">
                        <div class="wdg-userpick-selected" data-userpick-selected hidden>
                          <img class="wdg-userpick-sel-avatar" data-userpick-sel-avatar alt="">
                          <div class="wdg-userpick-sel-text">
                            <div class="wdg-userpick-sel-name" data-userpick-sel-name></div>
                            <div class="wdg-userpick-sel-meta" data-userpick-sel-meta></div>
                          </div>
                        </div>
                        <input class="form-control wdg-userpick-input" type="text" data-mandato-user-input aria-label="Selecionar usuário" placeholder="Digite para buscar usuário" maxlength="120" autocomplete="off" value="">
                        <button type="button" class="wdg-userpick-clear" data-userpick-clear aria-label="Limpar" title="Limpar" hidden>×</button>
                        <span class="wdg-userpick-chevron" aria-hidden="true"></span>
                        <input type="hidden" data-mandato-user-id value="">
                      </div>
                      <div class="wdg-userpick-menu" data-userpick-menu="1" hidden></div>
                    </div>
                  </div>
                  <div class="col-6 col-md-3">
                    <label class="form-label">Início</label>
                    <input class="form-control" type="date" data-mandato-inicio required>
                  </div>
                  <div class="col-6 col-md-3">
                    <label class="form-label">Fim</label>
                    <input class="form-control" type="date" data-mandato-fim>
                  </div>
                </div>

                <div class="row g-2 mt-1">
                  <div class="col-12 col-md-6">
                    <label class="form-label">Origem</label>
                    <select class="form-select" data-mandato-origem required>
                      <option value="provisorio">Provisório</option>
                      <option value="assembleia">Assembleia</option>
                      <option value="judicial">Judicial</option>
                    </select>
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="form-label">Observação</label>
                    <input class="form-control" type="text" data-mandato-observacao maxlength="240">
                  </div>
                </div>

                <div class="row g-2 mt-1">
                  <div class="col-12">
                    <label class="form-label">Documento (ata / ordem judicial / outros)</label>
                    <input class="form-control" type="file" data-mandato-documento accept="application/pdf,image/*,.doc,.docx">
                    <div class="small text-muted mt-1" data-mandato-doc-hint>PDF, imagem ou DOC/DOCX (até 20MB).</div>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="submit" class="btn btn-primary" data-mandato-submit>Salvar mandato</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="modal fade" id="wdgMandatoHistoryModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Histórico de mandatos</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body" data-mandato-history-body>
              <div class="text-muted">Carregando…</div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Fechar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal fade" id="wdgMandatoDeleteModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <form data-mandato-delete-form>
              <div class="modal-header">
                <h5 class="modal-title">Excluir mandato</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
              </div>
              <div class="modal-body">
                <input type="hidden" data-mandato-delete-id value="">
                <input type="hidden" data-mandato-delete-role-id value="">
                <div class="wdg-delete-question">Tem certeza que deseja excluir este mandato definitivamente?</div>
                <div class="small text-muted mt-2">Esta ação não pode ser desfeita.</div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="submit" class="btn btn-danger" data-mandato-delete-submit>Excluir</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="modal fade" id="wdgMandatoEndModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <form data-mandato-end-form>
              <div class="modal-header">
                <h5 class="modal-title">Encerrar mandato</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
              </div>
              <div class="modal-body">
                <input type="hidden" data-mandato-end-id value="">
                <div class="mb-2 text-muted" data-mandato-end-label></div>

                <label class="form-label">Data de encerramento</label>
                <input class="form-control" type="date" data-mandato-end-fim>

                <label class="form-label mt-2">Observação</label>
                <input class="form-control" type="text" data-mandato-end-obs maxlength="240" placeholder="Ex.: Renúncia / fim de mandato">
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="submit" class="btn btn-danger">Encerrar</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    try {
      __mandatoModal = new bootstrap.Modal(document.getElementById('wdgMandatoModal'));
      __mandatoHistoryModal = new bootstrap.Modal(document.getElementById('wdgMandatoHistoryModal'));
      __mandatoEndModal = new bootstrap.Modal(document.getElementById('wdgMandatoEndModal'));
      __mandatoDeleteModal = new bootstrap.Modal(document.getElementById('wdgMandatoDeleteModal'));
    } catch {
      __mandatoModal = null;
      __mandatoHistoryModal = null;
      __mandatoEndModal = null;
      __mandatoDeleteModal = null;
    }

    // UserPick do modal "Novo mandato"
    try { bindMandatoUserPick(); } catch { /* noop */ }

    // Click: preparar exclusão (somente Master)
    const histModalEl = document.getElementById('wdgMandatoHistoryModal');
    if (histModalEl && !histModalEl.__wdgBoundDelete) {
      histModalEl.__wdgBoundDelete = true;
      histModalEl.addEventListener('click', async (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement)) return;
        const btn = t.closest('[data-mandato-delete="1"]');
        if (!btn) return;
        if (!isMaster) {
          toast('Apenas Master pode excluir mandatos.', 'warning');
          return;
        }

        const mid = String(btn.getAttribute('data-mandato-id') || '').trim();
        const rid = String(btn.getAttribute('data-role-id') || '').trim();
        if (!mid) return;

        const delForm = document.querySelector('#wdgMandatoDeleteModal [data-mandato-delete-form]');
        if (!delForm || !__mandatoDeleteModal) return;
        const idEl = delForm.querySelector('[data-mandato-delete-id]');
        const roleEl = delForm.querySelector('[data-mandato-delete-role-id]');
        if (idEl) idEl.value = mid;
        if (roleEl) roleEl.value = rid;
        try { __mandatoDeleteModal.show(); } catch {}
      });
    }

    // submit: excluir mandato (somente Master)
    const deleteForm = document.querySelector('#wdgMandatoDeleteModal [data-mandato-delete-form]');
    if (deleteForm && !deleteForm.__wdgBound) {
      deleteForm.__wdgBound = true;
      deleteForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!isMaster) {
          toast('Apenas Master pode excluir mandatos.', 'warning');
          return;
        }

        const idEl = deleteForm.querySelector('[data-mandato-delete-id]');
        const roleEl = deleteForm.querySelector('[data-mandato-delete-role-id]');
        const submitBtn = deleteForm.querySelector('[data-mandato-delete-submit]');
        const mid = String(idEl?.value || '').trim();
        const rid = String(roleEl?.value || '').trim();

        const uid = String(getSelectedUnidadeId() || '').trim();
        if (!uid || !mid) return;

        try { submitBtn && submitBtn.setAttribute('disabled', 'disabled'); } catch {}

        try {
          const res = await api(`/api/dirigencia/mandatos/${encodeURIComponent(mid)}`, { method: 'DELETE' });
          if (res && res.success === false) throw new Error(res.error || 'Falha ao excluir mandato');

          // Atualiza caches e UI
          await ensureMandatosAtivosLoadedForUnit(uid, { silent: true, force: true });
          applyAssignmentsFromMandatosCache();
          renderAll();

          try { __mandatoDeleteModal && __mandatoDeleteModal.hide(); } catch {}

          if (rid) {
            await openHistoryModal(rid);
          }

          toast('Mandato excluído.', 'success');
        } catch (e) {
          toast(e?.message || 'Não foi possível excluir o mandato.', 'danger');
        } finally {
          try { submitBtn && submitBtn.removeAttribute('disabled'); } catch {}
        }
      });
    }

    // submit: criar mandato
    const form = document.querySelector('#wdgMandatoModal [data-mandato-form]');
    if (form && !form.__wdgBound) {
      form.__wdgBound = true;

      // UI: exibe nome do arquivo selecionado
      try {
        const docInput = form.querySelector('[data-mandato-documento]');
        const docHint = form.querySelector('[data-mandato-doc-hint]');
        if (docInput && !docInput.__wdgBound) {
          docInput.__wdgBound = true;
          docInput.addEventListener('change', () => {
            try {
              const f = docInput.files && docInput.files[0] ? docInput.files[0] : null;
              if (docHint) docHint.textContent = f ? `Selecionado: ${f.name}` : 'PDF, imagem ou DOC/DOCX (até 20MB).';
            } catch { /* noop */ }
          });
        }
      } catch { /* noop */ }

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const uid = String(getSelectedUnidadeId() || '').trim();
        if (!uid) return;

        const roleId = String(form.querySelector('[data-mandato-role-id]')?.value || '').trim();
        const usuarioId = String(
          form.querySelector('[data-mandato-user-id]')?.value ||
          form.querySelector('[data-mandato-user-select]')?.value ||
          ''
        ).trim();
        const inicio = String(form.querySelector('[data-mandato-inicio]')?.value || '').trim();
        const fim = String(form.querySelector('[data-mandato-fim]')?.value || '').trim();
        const origem = String(form.querySelector('[data-mandato-origem]')?.value || '').trim();
        const observacao = String(form.querySelector('[data-mandato-observacao]')?.value || '').trim();
        const documento = (() => {
          try {
            const input = form.querySelector('[data-mandato-documento]');
            const f = input && input.files && input.files[0] ? input.files[0] : null;
            return f || null;
          } catch { return null; }
        })();

        if (!roleId) return;
        if (!usuarioId) {
          toast('Selecione um usuário ocupante.', 'warning');
          return;
        }
        if (!inicio) {
          toast('Informe a data de início.', 'warning');
          return;
        }

        const btn = form.querySelector('[data-mandato-submit]');
        try { if (btn) btn.disabled = true; } catch {}
        try {
          // Se já houver mandato ativo, oferece encerrar automaticamente e criar o novo.
          await ensureMandatosAtivosLoadedForUnit(uid, { silent: true, force: true });
          const active = mandatosAtivosCache ? mandatosAtivosCache[roleId] : null;
          const activeId = String(active?.id || active?._id || '').trim();
          if (activeId) {
            const inicioDate = parseDateInput(inicio) || null;
            const suggestedEnd = inicioDate ? dateMinusDays(inicioDate, 1) : null;
            const suggestedEndLabel = suggestedEnd ? formatDateBR(suggestedEnd) : 'ontem';
            const ok = confirm(`Já existe um mandato ativo para este cargo. Deseja encerrar automaticamente em ${suggestedEndLabel} e criar o novo mandato?`);
            if (!ok) {
              openEndModal(roleId, activeId);
              return;
            }

            if (suggestedEnd) {
              await api(`/api/dirigencia/mandatos/${encodeURIComponent(activeId)}/encerrar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fim: toDateInputValue(suggestedEnd),
                  observacao: 'Encerrado automaticamente para criação de novo mandato.'
                })
              });
              await ensureMandatosAtivosLoadedForUnit(uid, { silent: true, force: true });
            } else {
              // Sem data válida: cai no fluxo manual.
              openEndModal(roleId, activeId);
              return;
            }
          }

          let res;
          if (documento) {
            const fd = new FormData();
            fd.append('roleId', roleId);
            fd.append('usuarioId', usuarioId);
            fd.append('inicio', inicio);
            if (fim) fd.append('fim', fim);
            fd.append('origem', origem);
            if (observacao) fd.append('observacao', observacao);
            fd.append('documento', documento, documento.name || 'documento');
            res = await api(`/api/dirigencia/${encodeURIComponent(uid)}/mandatos`, {
              method: 'POST',
              body: fd
            });
          } else {
            const payload = { roleId, usuarioId, inicio, fim: fim || null, origem, observacao };
            res = await api(`/api/dirigencia/${encodeURIComponent(uid)}/mandatos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          }
          if (res && res.success === false) throw new Error(res.error || 'Falha ao criar mandato');
          try {
            const warn = res && typeof res === 'object' ? String(res.warning || '').trim() : '';
            if (warn) toast(warn, 'warning');
          } catch { /* noop */ }

          // Se o backend criou CondUsuario automaticamente, atualiza a lista para exibir nome/e-mail/foto.
          try { await ensureUsersLoadedForUnit(uid, { silent: true, force: true }); } catch { /* noop */ }

          await ensureMandatosAtivosLoadedForUnit(uid, { silent: true, force: true });
          applyAssignmentsFromMandatosCache();
          renderAll();

          try { __mandatoModal && __mandatoModal.hide(); } catch {}
          toast('Mandato criado.', 'success');
        } catch (e) {
          if (e && Number(e.status) === 409) {
            toast(e?.message || 'Conflito ao criar o mandato.', 'warning');
            // Se o conflito for por mandato ativo, facilita: abre encerramento.
            try {
              await ensureMandatosAtivosLoadedForUnit(uid, { silent: true, force: true });
              const active = mandatosAtivosCache ? mandatosAtivosCache[roleId] : null;
              const activeId = String(active?.id || active?._id || '').trim();
              if (activeId) {
                const ok = confirm('Deseja encerrar o mandato ativo agora?');
                if (ok) openEndModal(roleId, activeId);
              }
            } catch { /* noop */ }
          } else {
            // Ajuda diagnóstico: backend pode responder 400 com JSON { error }
            try {
              if (e && Number(e.status) === 400 && e.payload && typeof e.payload === 'object') {
                const detail = String(e.payload.error || e.payload.message || '').trim();
                if (detail) {
                  toast(detail, 'danger');
                  console.warn('[dirigencia][mandato-create][400]', { detail, payload: e.payload });
                  return;
                }
              }
            } catch { /* noop */ }
            toast(e?.message || 'Não foi possível criar o mandato.', 'danger');
          }
        } finally {
          try { if (btn) btn.disabled = false; } catch {}
        }
      });
    }

    // submit: encerrar mandato
    const endForm = document.querySelector('#wdgMandatoEndModal [data-mandato-end-form]');
    if (endForm && !endForm.__wdgBound) {
      endForm.__wdgBound = true;
      endForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const uid = String(getSelectedUnidadeId() || '').trim();
        if (!uid) return;

        const mandatoId = String(endForm.querySelector('[data-mandato-end-id]')?.value || '').trim();
        if (!mandatoId) return;
        const fim = String(endForm.querySelector('[data-mandato-end-fim]')?.value || '').trim();
        const observacao = String(endForm.querySelector('[data-mandato-end-obs]')?.value || '').trim();

        const btn = endForm.querySelector('button[type="submit"]');
        try { if (btn) btn.disabled = true; } catch {}
        try {
          const payload = { fim: fim || null, observacao: observacao || null };
          const res = await api(`/api/dirigencia/mandatos/${encodeURIComponent(mandatoId)}/encerrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res && res.success === false) throw new Error(res.error || 'Falha ao encerrar mandato');

          await ensureMandatosAtivosLoadedForUnit(uid, { silent: true, force: true });
          applyAssignmentsFromMandatosCache();
          renderAll();

          try { __mandatoEndModal && __mandatoEndModal.hide(); } catch {}
          toast('Mandato encerrado.', 'success');
        } catch (e) {
          toast(e?.message || 'Não foi possível encerrar o mandato.', 'danger');
        } finally {
          try { if (btn) btn.disabled = false; } catch {}
        }
      });
    }
  }

  function openNewMandatoModal(roleId){
    ensureMandatoModals();
    if (!__mandatoModal) return;
    const rid = String(roleId || '').trim();
    if (!rid) return;

    const role = getRole(rid);
    const form = document.querySelector('#wdgMandatoModal [data-mandato-form]');
    if (!form) return;

    const roleInput = form.querySelector('[data-mandato-role-id]');
    const roleLabel = form.querySelector('[data-mandato-role-label]');
    const sel = form.querySelector('[data-mandato-user-select]');
    const userHidden = form.querySelector('[data-mandato-user-id]');
    const userInput = form.querySelector('[data-mandato-user-input]');
    const proSelected = form.querySelector('[data-userpick-selected]');
    const proClear = form.querySelector('[data-userpick-clear]');
    const inicio = form.querySelector('[data-mandato-inicio]');
    const fim = form.querySelector('[data-mandato-fim]');
    const origem = form.querySelector('[data-mandato-origem]');
    const obs = form.querySelector('[data-mandato-observacao]');
    const docInput = form.querySelector('[data-mandato-documento]');
    const docHint = form.querySelector('[data-mandato-doc-hint]');

    if (roleInput) roleInput.value = rid;
    if (roleLabel) roleLabel.textContent = role ? `Cargo: ${role.nome}` : `Cargo: ${rid}`;

    // Reset seleção do usuário no picker
    if (userHidden) userHidden.value = '';
    if (sel) sel.value = '';
    if (userInput) {
      userInput.value = '';
      userInput.placeholder = 'Digite para buscar usuário';
    }
    try {
      if (proSelected) proSelected.hidden = true;
      if (proClear) proClear.hidden = true;
      const picker = form.querySelector('[data-mandato-userpick="1"]');
      if (picker) picker.classList.remove('wdg-userpick-has');
    } catch { /* noop */ }

    // Garante cache carregado (menu mostra "Carregando" se ainda estiver em andamento)
    try {
      const unitId = String(getSelectedUnidadeId() || '').trim();
      if (unitId) void ensureUsersLoadedForUnit(unitId, { silent: true });
    } catch { /* noop */ }

    if (inicio) inicio.value = toDateInputValue(new Date());
    if (fim) fim.value = '';
    if (origem) origem.value = 'provisorio';
    if (obs) obs.value = '';
    if (docInput) docInput.value = '';
    if (docHint) docHint.textContent = 'PDF, imagem ou DOC/DOCX (até 20MB).';

    try { __mandatoModal.show(); } catch {}
  }

  function bindMandatoUserPick(){
    const form = document.querySelector('#wdgMandatoModal [data-mandato-form]');
    if (!form) return;
    const picker = form.querySelector('[data-mandato-userpick="1"]');
    if (!picker || picker.__wdgBound) return;
    picker.__wdgBound = true;

    if (!document.body.__wdgUserPickGlobalOutsideBound) {
      document.body.__wdgUserPickGlobalOutsideBound = true;
      document.addEventListener('mousedown', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement)) return;
        const insidePicker = t.closest('[data-userpick="1"]');
        const insideMenu = t.closest('[data-userpick-menu="1"]');
        if (!insidePicker && !insideMenu) closeAllUserPickMenus();
      });
    }

    const input = picker.querySelector('input[data-mandato-user-input]');
    const hiddenValue = picker.querySelector('input[data-mandato-user-id]');
    const menu = picker.querySelector('[data-userpick-menu="1"]');
    const proSelected = picker.querySelector('[data-userpick-selected]');
    const proAvatar = picker.querySelector('[data-userpick-sel-avatar]');
    const proName = picker.querySelector('[data-userpick-sel-name]');
    const proMeta = picker.querySelector('[data-userpick-sel-meta]');
    const proClear = picker.querySelector('[data-userpick-clear]');
    const proField = picker.querySelector('.wdg-userpick-field');
    const fallbackSelect = form.querySelector('[data-mandato-user-select]');
    if (!input || !hiddenValue || !menu) return;

    try { menu.__wdgPicker = picker; } catch {}

    function getDefaultAvatarUrl(){
      const bp = String(BASE_PATH || '/condominios').trim().replace(/\/+$/g, '');
      return bp ? `${bp}/images/usuario.png` : '/images/usuario.png';
    }

    function getUserAvatarUrl(u){
      const bp = String(BASE_PATH || '/condominios').trim().replace(/\/+$/g, '');
      const raw = String(u?.fotoUrl || u?.avatarUrl || u?.avatar || u?.foto || '').trim();
      if (!raw) return getDefaultAvatarUrl();
      if (/^https?:\/\//i.test(raw)) return raw;
      if (raw.startsWith('/')) {
        if (bp && !raw.startsWith(bp + '/')) return bp + raw;
        return raw;
      }
      const clean = raw.replace(/^\/+/, '');
      return bp ? `${bp}/${clean}` : `/${clean}`;
    }

    function normalizeText(s){
      return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    function setProSelectedState(enabled){
      if (proSelected) proSelected.hidden = !enabled;
      if (proClear) proClear.hidden = !enabled;
      if (enabled) picker.classList.add('wdg-userpick-has');
      else picker.classList.remove('wdg-userpick-has');
    }

    function applySelection(userId, opts = {}){
      const id = String(userId || '').trim();
      hiddenValue.value = id;
      try { if (fallbackSelect) fallbackSelect.value = id; } catch { /* noop */ }

      if (!id) {
        input.value = '';
        input.placeholder = 'Digite para buscar usuário';
        setProSelectedState(false);
        return;
      }

      const u = (getActiveUsers() || []).find(x => String(x?.id || '') === id) || null;
      if (proAvatar) proAvatar.src = u ? getUserAvatarUrl(u) : getDefaultAvatarUrl();
      if (proName) proName.textContent = u ? (String(u?.nome || '').trim() || String(u?.email || '').trim() || id) : id;
      if (proMeta) proMeta.textContent = u ? (String(u?.email || '').trim() || '') : '';
      input.value = '';
      input.placeholder = 'Trocar usuário…';
      setProSelectedState(true);

      if (!opts?.silent) {
        // Apenas fecha o menu; a validação ocorre no submit.
        closeAllUserPickMenus();
      }
    }

    function closeMenu(){
      menu.hidden = true;
      menu.innerHTML = '';
      picker.classList.remove('wdg-userpick-open');
      try { if (proField) proField.setAttribute('aria-expanded', 'false'); } catch {}
    }

    function positionMenuFixed(){
      if (menu.hidden) return;
      const anchor = proField || input;
      const rect = anchor.getBoundingClientRect();
      const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;

      const pad = 8;
      let width = Math.max(360, Math.ceil(rect.width));
      width = Math.min(width, Math.max(320, viewportW - (pad * 2)));

      const spaceBelow = Math.max(0, viewportH - rect.bottom);
      const spaceAbove = Math.max(0, rect.top);
      const preferUp = spaceBelow < 240 && spaceAbove > spaceBelow;

      let maxH = 360;
      if (preferUp) maxH = Math.max(180, Math.min(360, spaceAbove - (pad * 2)));
      else maxH = Math.max(180, Math.min(360, spaceBelow - (pad * 2)));

      let left = Math.floor(rect.left);
      if (left + width > viewportW - pad) left = Math.max(pad, Math.floor(viewportW - pad - width));
      if (left < pad) left = pad;

      let top;
      if (preferUp) top = Math.max(pad, Math.floor(rect.top - 6 - maxH));
      else top = Math.min(Math.max(pad, Math.floor(rect.bottom + 6)), Math.max(pad, Math.floor(viewportH - pad - maxH)));

      menu.style.position = 'fixed';
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${maxH}px`;
      menu.style.overflowY = 'auto';
      menu.style.overscrollBehavior = 'contain';
      menu.style.zIndex = '3000';
    }

    function ensureRepositionBound(){
      if (picker.__wdgUserpickRepositionBound) return;
      picker.__wdgUserpickRepositionBound = true;
      const handler = () => { if (!menu.hidden) positionMenuFixed(); };
      window.addEventListener('resize', handler);
      window.addEventListener('scroll', handler, true);
    }

    function renderMenu(){
      const unitId = String(getSelectedUnidadeId() || '').trim();
      if (!unitId) {
        menu.innerHTML = '<div class="wdg-userpick-empty">Selecione um condomínio para listar usuários.</div>';
        return;
      }

      if (!usersCacheLoaded || usersCacheUnitId !== unitId) {
        menu.innerHTML = '<div class="wdg-userpick-empty">Carregando usuários…</div>';
        void ensureUsersLoadedForUnit(unitId, { silent: true }).then(() => {
          if (!menu.hidden) {
            renderMenu();
            positionMenuFixed();
          }
        });
        return;
      }

      const q = normalizeText(input.value);
      const users = (getActiveUsers() || []).slice().sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'));
      const filtered = !q
        ? users
        : users.filter(u => {
            const name = normalizeText(u?.nome);
            const email = normalizeText(u?.email);
            return (name && name.includes(q)) || (email && email.includes(q));
          });

      if (!filtered.length) {
        menu.innerHTML = '<div class="wdg-userpick-empty">Nenhum usuário encontrado.</div>';
        return;
      }

      const selectedId = String(hiddenValue.value || '').trim();
      menu.innerHTML = filtered.map(u => {
        const id = escapeHtml(u.id);
        const isSelected = String(u.id) === selectedId;
        const nome = escapeHtml(u.nome);
        const email = escapeHtml(u.email);
        const avatar = escapeHtml(getUserAvatarUrl(u));
        return `
          <button type="button" class="wdg-userpick-item" data-userpick-item="1" data-user-id="${id}" ${isSelected ? 'data-selected="1"' : ''}>
            <img class="wdg-userpick-avatar" src="${avatar}" alt="">
            <div class="wdg-userpick-meta">
              <div class="wdg-userpick-name">${nome}</div>
              <div class="wdg-userpick-email">${email}</div>
            </div>
            <span class="wdg-userpick-check" aria-hidden="true">✓</span>
          </button>
        `;
      }).join('');
    }

    function openMenu(){
      closeAllUserPickMenus();
      menu.hidden = false;
      picker.classList.add('wdg-userpick-open');
      renderMenu();
      try { requestAnimationFrame(() => positionMenuFixed()); } catch { positionMenuFixed(); }
      ensureRepositionBound();
      try { if (proField) proField.setAttribute('aria-expanded', 'true'); } catch {}
    }

    // estado inicial
    applySelection(hiddenValue.value, { silent: true });

    if (proClear && !proClear.__wdgBound) {
      proClear.__wdgBound = true;
      proClear.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        applySelection('', { silent: true });
        openMenu();
      });
    }

    if (proField && !proField.__wdgBound) {
      proField.__wdgBound = true;
      proField.addEventListener('mousedown', () => {
        try { input.focus(); } catch {}
      });
    }

    input.addEventListener('focus', () => openMenu());
    input.addEventListener('click', () => openMenu());

    let _debounceT = null;
    input.addEventListener('input', () => {
      if (_debounceT) clearTimeout(_debounceT);
      _debounceT = setTimeout(() => {
        if (!menu.hidden) {
          renderMenu();
          positionMenuFixed();
        } else {
          openMenu();
        }
      }, 60);
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeMenu();
        return;
      }
      if (ev.key === 'ArrowDown') {
        if (menu.hidden) openMenu();
      }
    });

    menu.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const btn = t.closest('[data-userpick-item="1"]');
      if (!btn) return;
      const userId = String(btn.getAttribute('data-user-id') || '').trim();
      applySelection(userId);
      closeMenu();
    });
  }

  async function openHistoryModal(roleId){
    ensureMandatoModals();
    if (!__mandatoHistoryModal) return;
    const rid = String(roleId || '').trim();
    const uid = String(getSelectedUnidadeId() || '').trim();
    if (!rid || !uid) return;

    const body = document.querySelector('#wdgMandatoHistoryModal [data-mandato-history-body]');
    if (body) body.innerHTML = '<div class="text-muted">Carregando…</div>';
    try { __mandatoHistoryModal.show(); } catch {}

    try {
      const json = await api(`/api/dirigencia/${encodeURIComponent(uid)}/cargos/${encodeURIComponent(rid)}/mandatos/historico`);
      const arr = Array.isArray(json?.data) ? json.data : [];

      if (!body) return;
      if (!arr.length) {
        body.innerHTML = '<div class="wdg-empty">Nenhum mandato registrado para este cargo.</div>';
        return;
      }

      const rows = arr.map(m => {
        const u = (m && m.usuario && typeof m.usuario === 'object') ? m.usuario : null;
        const nome = String(u?.nome || '').trim();
        const email = String(u?.email || '').trim();
        const rawFoto = String(u?.foto || '').trim();
        const fallbackId = String(u?.id || '').trim();
        const isObjectId = /^[a-f\d]{24}$/i.test(fallbackId);
        const bp = String(BASE_PATH || '/condominios').trim().replace(/\/+$/g, '');
        const foto = rawFoto
          ? coerceUserAvatarUrl(rawFoto)
          : (email
              ? `${bp}/api/usuarios/foto?email=${encodeURIComponent(email)}`
              : (isObjectId ? `${bp}/api/usuarios/foto?id=${encodeURIComponent(fallbackId)}` : getDefaultUserAvatarUrl()));

        const label = (nome || email || fallbackId || '—').trim();
        const inicio = formatDateBR(m?.inicio);
        const fim = formatDateBR(m?.fim);
        const origemRaw = String(m?.origem || '').trim();
        const origemNorm = normalizeTextLoose(origemRaw);
        const origemBadge = (() => {
          if (!origemNorm) return '<span class="wdg-hist-origin">—</span>';
          if (origemNorm === 'assembleia' || origemNorm === 'assembleia-geral' || origemNorm === 'assembleia geral') {
            return '<span class="wdg-hist-origin wdg-hist-origin--assembleia">Assembléia</span>';
          }
          if (origemNorm === 'judicial') {
            return '<span class="wdg-hist-origin wdg-hist-origin--judicial">Judicial</span>';
          }
          if (origemNorm === 'provisorio' || origemNorm === 'provisorio(a)' || origemNorm === 'provisorio (a)') {
            return '<span class="wdg-hist-origin wdg-hist-origin--provisorio">Provisório</span>';
          }
          return `<span class="wdg-hist-origin">${escapeHtml(origemRaw || '—')}</span>`;
        })();
        const ativo = m?.ativo ? 'Ativo' : 'Encerrado';
        const obs = String(m?.observacao || '').trim();
        const mid = String(m?.id || m?._id || '').trim();
        const excluirIcon = bp ? `${bp}/images/excluir.png` : '/images/excluir.png';
        return `
          <tr>
            <td>
              <div class="wdg-hist-occupant">
                <img class="wdg-hist-avatar" src="${escapeHtml(foto)}" alt="" onerror="this.onerror=null; this.src='${escapeHtml(getDefaultUserAvatarUrl())}';">
                <div class="wdg-hist-occupant-text">
                  <div class="wdg-hist-name">${escapeHtml(label)}</div>
                  <div class="wdg-hist-email">${escapeHtml(email || '—')}</div>
                </div>
              </div>
            </td>
            <td>${escapeHtml(inicio)} — ${escapeHtml(fim)}</td>
            <td>${origemBadge}</td>
            <td><span class="wdg-hist-badge ${m?.ativo ? 'wdg-hist-badge--ok' : 'wdg-hist-badge--ended'}">${escapeHtml(ativo)}</span></td>
            <td>${escapeHtml(obs || '—')}</td>
            ${isMaster ? `<td class="text-center">${mid ? `<button type="button" class="wdg-iconbtn" title="Excluir" aria-label="Excluir" data-mandato-delete="1" data-mandato-id="${escapeHtml(mid)}" data-role-id="${escapeHtml(rid)}"><img src="${escapeHtml(excluirIcon)}" alt=""></button>` : ''}</td>` : ''}
          </tr>
        `;
      }).join('');

      body.innerHTML = `
        <div class="wdg-history-wrap">
          <div class="wdg-history-scroll">
          <table class="wdg-table wdg-history-table">
            <thead>
              <tr>
                <th>Ocupante</th>
                <th>Período</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Obs.</th>
                ${isMaster ? '<th class="text-center">Ações</th>' : ''}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          </div>
        </div>
      `;
    } catch (e) {
      if (body) body.innerHTML = `<div class="text-danger">${escapeHtml(e?.message || 'Falha ao carregar histórico.')}</div>`;
    }
  }

  function openEndModal(roleId, mandatoId){
    ensureMandatoModals();
    if (!__mandatoEndModal) return;
    const mid = String(mandatoId || '').trim();
    if (!mid) return;

    const role = getRole(roleId);
    const form = document.querySelector('#wdgMandatoEndModal [data-mandato-end-form]');
    if (!form) return;
    const idEl = form.querySelector('[data-mandato-end-id]');
    const labelEl = form.querySelector('[data-mandato-end-label]');
    const fimEl = form.querySelector('[data-mandato-end-fim]');
    const obsEl = form.querySelector('[data-mandato-end-obs]');

    if (idEl) idEl.value = mid;
    if (labelEl) labelEl.textContent = role ? `Cargo: ${role.nome}` : 'Cargo';
    if (fimEl) fimEl.value = toDateInputValue(new Date());
    if (obsEl) obsEl.value = '';

    try { __mandatoEndModal.show(); } catch {}
  }

  function buildAssignmentUserPickHtml(roleId, assignedUserId){
    const rid = escapeHtml(roleId || '');
    const uid = escapeHtml(assignedUserId || '');

    return [
      `<div class="wdg-userpick wdg-userpick-pro wdg-userpick-pro-sm" data-userpick="1" data-userpick-pro="1" data-assignment-userpick="1" data-role-id="${rid}">`,
      '  <div class="wdg-userpick-field" role="combobox" aria-expanded="false" aria-haspopup="listbox">',
      '    <div class="wdg-userpick-selected" data-userpick-selected hidden>',
      '      <img class="wdg-userpick-sel-avatar" data-userpick-sel-avatar alt="">',
      '      <div class="wdg-userpick-sel-text">',
      '        <div class="wdg-userpick-sel-name" data-userpick-sel-name></div>',
      '        <div class="wdg-userpick-sel-meta" data-userpick-sel-meta></div>',
      '      </div>',
      '    </div>',
      '    <input class="form-control wdg-userpick-input" type="text" data-assignment-user-input aria-label="Selecionar usuário" placeholder="Selecionar usuário" maxlength="120" autocomplete="off" value="">',
      '    <button type="button" class="wdg-userpick-clear" data-userpick-clear aria-label="Limpar" title="Limpar" hidden>×</button>',
      '    <span class="wdg-userpick-chevron" aria-hidden="true"></span>',
      `    <input type="hidden" data-assignment-user-value value="${uid}">`,
      '  </div>',
      '  <div class="wdg-userpick-menu" data-userpick-menu="1" hidden></div>',
      '</div>'
    ].join('\n');
  }

  function bindAssignmentUserPicks(root){
    const host = root || document;
    const pickers = host.querySelectorAll('[data-assignment-userpick="1"]');
    if (!pickers.length) return;

    if (!document.body.__wdgAssignmentUserPickOutsideBound) {
      document.body.__wdgAssignmentUserPickOutsideBound = true;
      document.addEventListener('mousedown', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement)) return;
        const insidePicker = t.closest('[data-userpick="1"]');
        const insideMenu = t.closest('[data-userpick-menu="1"]');
        if (!insidePicker && !insideMenu) closeAllUserPickMenus();
      });
    }

    pickers.forEach(p => {
      if (p.__wdgBound) return;
      p.__wdgBound = true;

      const input = p.querySelector('input[data-assignment-user-input]');
      const menu = p.querySelector('[data-userpick-menu="1"]');
      const hiddenValue = p.querySelector('input[data-assignment-user-value]');
      const roleId = p.getAttribute('data-role-id') || '';

      const proSelected = p.querySelector('[data-userpick-selected]');
      const proAvatar = p.querySelector('[data-userpick-sel-avatar]');
      const proName = p.querySelector('[data-userpick-sel-name]');
      const proMeta = p.querySelector('[data-userpick-sel-meta]');
      const proClear = p.querySelector('[data-userpick-clear]');
      const proField = p.querySelector('.wdg-userpick-field');

      const hostCard = p.closest('.wdg-assignment-slot');

      if (!input || !menu || !hiddenValue) return;

      // Ajuda o fechamento global a remover estados visuais
      try { menu.__wdgPicker = p; } catch {}

      function setProSelectedState(enabled) {
        if (proSelected) proSelected.hidden = !enabled;
        if (proClear) proClear.hidden = !enabled;
        if (enabled) p.classList.add('wdg-userpick-has');
        else p.classList.remove('wdg-userpick-has');
      }

      function getBasePath(){
        const app = document.getElementById('dirigenciaApp');
        const bp = app ? String(app.getAttribute('data-base-path') || '') : '';
        return bp.trim().replace(/\/+$/g, '');
      }

      function getDefaultAvatarUrl(){
        const bp = getBasePath();
        return bp ? `${bp}/images/usuario.png` : '/images/usuario.png';
      }

      function getUserAvatarUrl(u){
        const bp = getBasePath();
        const raw = String(u?.fotoUrl || u?.avatarUrl || u?.avatar || u?.foto || '').trim();
        if (!raw) return getDefaultAvatarUrl();
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith('/')) return raw;
        const clean = raw.replace(/^\/+/, '');
        return bp ? `${bp}/${clean}` : `/${clean}`;
      }

      function normalizeText(s){
        return String(s || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
      }

      function findUserById(id){
        const key = String(id || '').trim();
        if (!key) return null;
        return (getActiveUsers() || []).find(u => String(u?.id || '') === key) || null;
      }

      function setProDisplay(u){
        if (!u) return;
        const nome = String(u.nome || '').trim();
        const email = String(u.email || '').trim();
        const avatarSrc = getUserAvatarUrl(u);

        if (proAvatar) proAvatar.src = avatarSrc;
        if (proName) proName.textContent = nome || email || '';
        if (proMeta) proMeta.textContent = email || '';

        input.value = '';
        input.placeholder = 'Trocar usuário…';
        setProSelectedState(true);
      }

      function clearSelection(opts = {}){
        hiddenValue.value = '';
        input.value = '';
        input.placeholder = 'Selecionar usuário';
        setProSelectedState(false);

        if (!opts.silent) {
          setAssignment(roleId, null);
          saveState();
          renderAll();
          toast('Atribuição atualizada.', 'success');
        }
      }

      function applySelection(userId, opts = {}){
        const id = String(userId || '').trim();
        if (!id) {
          clearSelection(opts);
          return;
        }
        const u = findUserById(id);
        hiddenValue.value = id;
        if (u) setProDisplay(u);
        else {
          // Fallback minimalista
          if (proAvatar) proAvatar.src = getDefaultAvatarUrl();
          if (proName) proName.textContent = id;
          if (proMeta) proMeta.textContent = '';
          input.value = '';
          input.placeholder = 'Trocar usuário…';
          setProSelectedState(true);
        }

        if (!opts.silent) {
          setAssignment(roleId, id);
          saveState();
          renderAll();
          toast('Atribuição atualizada.', 'success');
        }
      }

      function ensurePortalHost(){
        let el = document.getElementById('wdgUserpickPortal');
        if (!el) {
          el = document.createElement('div');
          el.id = 'wdgUserpickPortal';
          el.style.zIndex = '3000';
          document.body.appendChild(el);
        }
        return el;
      }

      function portalMenu(menuEl){
        if (!menuEl || menuEl.__wdgPortaled) return;
        menuEl.__wdgReturnParent = menuEl.parentElement;
        menuEl.__wdgPortaled = true;
        try { ensurePortalHost().appendChild(menuEl); } catch {}
      }

      function unportalMenu(menuEl){
        if (!menuEl || !menuEl.__wdgPortaled) return;
        const parent = menuEl.__wdgReturnParent;
        menuEl.__wdgPortaled = false;
        menuEl.__wdgReturnParent = null;
        try { if (parent) parent.appendChild(menuEl); } catch {}
      }

      function closeMenu(){
        menu.hidden = true;
        menu.innerHTML = '';
        unportalMenu(menu);
        p.classList.remove('wdg-userpick-open');
        if (hostCard) hostCard.classList.remove('wdg-assignment-slot--picking');
        try {
          const field = p.querySelector('.wdg-userpick-field');
          if (field) field.setAttribute('aria-expanded', 'false');
        } catch {}
      }

      function positionMenuFixed(){
        if (menu.hidden) return;
        const anchor = proField || input;
        const rect = anchor.getBoundingClientRect();
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;

        const pad = 8;
        let width = Math.max(260, Math.ceil(rect.width));
        width = Math.min(width, Math.max(260, viewportW - (pad * 2)));

        const spaceBelow = Math.max(0, viewportH - rect.bottom);
        const spaceAbove = Math.max(0, rect.top);
        const preferUp = spaceBelow < 240 && spaceAbove > spaceBelow;

        let maxH = 320;
        if (preferUp) maxH = Math.max(160, Math.min(320, spaceAbove - (pad * 2)));
        else maxH = Math.max(160, Math.min(320, spaceBelow - (pad * 2)));

        let left = Math.floor(rect.left);
        if (left + width > viewportW - pad) left = Math.max(pad, Math.floor(viewportW - pad - width));
        if (left < pad) left = pad;

        let top;
        if (preferUp) top = Math.max(pad, Math.floor(rect.top - 6 - maxH));
        else top = Math.min(Math.max(pad, Math.floor(rect.bottom + 6)), Math.max(pad, Math.floor(viewportH - pad - maxH)));

        menu.style.position = 'fixed';
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.width = `${width}px`;
        menu.style.maxHeight = `${maxH}px`;
        menu.style.overflowY = 'auto';
        menu.style.overscrollBehavior = 'contain';
        menu.style.zIndex = '3000';
      }

      function ensureRepositionBound(){
        if (p.__wdgUserpickRepositionBound) return;
        p.__wdgUserpickRepositionBound = true;
        const handler = () => { if (!menu.hidden) positionMenuFixed(); };
        window.addEventListener('resize', handler);
        window.addEventListener('scroll', handler, true);
      }

      function renderMenu(){
        const unitId = String(getSelectedUnidadeId() || '').trim();
        if (!unitId) {
          menu.innerHTML = '<div class="wdg-userpick-empty">Selecione um condomínio para listar usuários.</div>';
          return;
        }

        if (!usersCacheLoaded || usersCacheUnitId !== unitId) {
          menu.innerHTML = '<div class="wdg-userpick-empty">Carregando usuários…</div>';
          void ensureUsersLoadedForUnit(unitId, { silent: true }).then(() => {
            if (!menu.hidden) {
              renderMenu();
              positionMenuFixed();
            }
          });
          return;
        }

        const q = normalizeText(input.value);
        const users = (getActiveUsers() || []).slice().sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'));

        const filtered = !q
          ? users
          : users.filter(u => {
              const name = normalizeText(u?.nome);
              const email = normalizeText(u?.email);
              return (name && name.includes(q)) || (email && email.includes(q));
            });

        const selectedId = String(hiddenValue.value || '').trim();
        const items = [];
        const noneSelected = !selectedId;
        items.push(`
          <button type="button" class="wdg-userpick-item wdg-userpick-item--none" data-userpick-item="1" data-user-id="" ${noneSelected ? 'data-selected="1"' : ''}>
            <img class="wdg-userpick-avatar" src="${escapeHtml(getDefaultAvatarUrl())}" alt="">
            <div class="wdg-userpick-meta">
              <div class="wdg-userpick-name">Sem responsável</div>
              <div class="wdg-userpick-email">Remover atribuição</div>
            </div>
            <span class="wdg-userpick-check" aria-hidden="true">✓</span>
          </button>
        `);

        filtered.forEach(u => {
          const id = escapeHtml(u.id);
          const isSelected = String(u.id) === selectedId;
          const nome = escapeHtml(u.nome);
          const email = escapeHtml(u.email);
          const avatar = escapeHtml(getUserAvatarUrl(u));
          items.push(`
            <button type="button" class="wdg-userpick-item" data-userpick-item="1" data-user-id="${id}" ${isSelected ? 'data-selected="1"' : ''}>
              <img class="wdg-userpick-avatar" src="${avatar}" alt="">
              <div class="wdg-userpick-meta">
                <div class="wdg-userpick-name">${nome}</div>
                <div class="wdg-userpick-email">${email}</div>
              </div>
              <span class="wdg-userpick-check" aria-hidden="true">✓</span>
            </button>
          `);
        });

        if (!filtered.length) {
          menu.innerHTML = '<div class="wdg-userpick-empty">Nenhum usuário encontrado.</div>';
          return;
        }
        menu.innerHTML = items.join('');
      }

      function openMenu(){
        closeAllUserPickMenus();
        menu.hidden = false;
        portalMenu(menu);
        p.classList.add('wdg-userpick-open');
        if (hostCard) hostCard.classList.add('wdg-assignment-slot--picking');
        renderMenu();
        try { requestAnimationFrame(() => positionMenuFixed()); } catch { positionMenuFixed(); }
        ensureRepositionBound();
        try {
          const field = p.querySelector('.wdg-userpick-field');
          if (field) field.setAttribute('aria-expanded', 'true');
        } catch {}
      }

      // Hidrata visual a partir do valor atual
      applySelection(hiddenValue.value, { silent: true });

      if (proClear && !proClear.__wdgBound) {
        proClear.__wdgBound = true;
        proClear.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          clearSelection();
        });
      }

      if (proField && !proField.__wdgBound) {
        proField.__wdgBound = true;
        proField.addEventListener('mousedown', () => {
          try { input.focus(); } catch {}
        });
      }

      input.addEventListener('focus', () => {
        openMenu();
      });
      input.addEventListener('click', () => {
        openMenu();
      });

      let _debounceT = null;
      input.addEventListener('input', () => {
        if (_debounceT) clearTimeout(_debounceT);
        _debounceT = setTimeout(() => {
          if (!menu.hidden) {
            renderMenu();
            positionMenuFixed();
          } else {
            openMenu();
          }
        }, 60);
      });

      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          closeMenu();
          return;
        }
        if (ev.key === 'ArrowDown') {
          if (menu.hidden) openMenu();
        }
      });

      menu.addEventListener('click', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement)) return;
        const btn = t.closest('[data-userpick-item="1"]');
        if (!btn) return;
        const userId = btn.getAttribute('data-user-id') || '';
        applySelection(userId);
      });
    });
  }

  function closeAllUserPickMenus(){
    document.querySelectorAll('[data-userpick-menu="1"]').forEach(m => {
      try {
        m.hidden = true;
        m.innerHTML = '';

        const picker = m.__wdgPicker;
        if (picker && picker.classList) {
          picker.classList.remove('wdg-userpick-open');
          const hostCard = picker.closest && picker.closest('.wdg-assignment-slot');
          if (hostCard) hostCard.classList.remove('wdg-assignment-slot--picking');
          const field = picker.querySelector && picker.querySelector('.wdg-userpick-field');
          if (field) field.setAttribute('aria-expanded', 'false');
        }

        if (m.__wdgPortaled) {
          const parent = m.__wdgReturnParent;
          m.__wdgPortaled = false;
          m.__wdgReturnParent = null;
          if (parent) parent.appendChild(m);
        }
      } catch {
        // ignore
      }
    });
  }

  function closeAllPillSelectMenus(except){
    try {
      document.querySelectorAll('.wdg-pillselect-menu').forEach(m => {
        if (except && m === except) return;
        try {
          m.hidden = true;
          const wrap = m.__wdgWrap || (m.closest ? m.closest('.wdg-pillselect') : null);
          if (wrap) wrap.classList.remove('wdg-pillselect-open');
          const btn = m.__wdgBtn || (wrap ? wrap.querySelector('.wdg-pillselect-btn') : null);
          if (btn) btn.setAttribute('aria-expanded', 'false');

          // Se estiver portaled no body, só mantém escondido
          if (m.__wdgPortaled) {
            // Se o select/wrap já saiu do DOM (re-render), remove o menu para não acumular.
            try {
              if (wrap && !wrap.isConnected) m.remove();
            } catch { /* noop */ }
          }
        } catch { /* noop */ }
      });
    } catch { /* noop */ }
  }

  function cleanupOrphanPillSelectMenus(){
    try {
      document.querySelectorAll('.wdg-pillselect-menu').forEach(m => {
        try {
          if (!m.__wdgPortaled) return;
          const wrap = m.__wdgWrap;
          if (wrap && !wrap.isConnected) m.remove();
        } catch { /* noop */ }
      });
    } catch { /* noop */ }
  }

  function wirePillSelectsForRolesTable(){
    if (!refs.rolesTableBody) return;

    // Bind global outside click once
    if (!document.body.__wdgPillSelectOutsideBound) {
      document.body.__wdgPillSelectOutsideBound = true;
      document.addEventListener('mousedown', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement)) return;
        const insidePill = t.closest('.wdg-pillselect');
        const insideMenu = t.closest('.wdg-pillselect-menu');
        if (!insidePill && !insideMenu) closeAllPillSelectMenus();
      });
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') closeAllPillSelectMenus();
      });
      window.addEventListener('resize', () => closeAllPillSelectMenus());

      // Se o usuário rolar o container da tabela, fecha (evita menu “desancorado”)
      const rolesScroll = document.querySelector('.wdg-roles-scroll');
      if (rolesScroll && !rolesScroll.__wdgPillSelectScrollBound) {
        rolesScroll.__wdgPillSelectScrollBound = true;
        rolesScroll.addEventListener('scroll', () => closeAllPillSelectMenus(), { passive: true });
      }
    }

    const selects = refs.rolesTableBody.querySelectorAll('select[data-role-parent-select], select[data-role-type-select]');
    selects.forEach(sel => {
      if (!(sel instanceof HTMLSelectElement)) return;
      if (sel.__wdgPillSelect) return;
      sel.__wdgPillSelect = true;

      const isType = sel.matches('[data-role-type-select]');

      // Wrapper
      const wrap = document.createElement('div');
      wrap.className = 'wdg-pillselect';
      wrap.setAttribute('data-pillselect', '1');
      wrap.setAttribute('data-pillselect-kind', isType ? 'type' : 'parent');

      // Button
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wdg-pillselect-btn';
      btn.setAttribute('aria-haspopup', 'listbox');
      btn.setAttribute('aria-expanded', 'false');

      const badge = document.createElement('span');
      badge.className = 'wdg-pillselect-badge';
      btn.appendChild(badge);

      // Menu
      const menu = document.createElement('div');
      menu.className = 'wdg-pillselect-menu';
      menu.hidden = true;
      menu.setAttribute('role', 'listbox');
      menu.__wdgPortaled = true;
      menu.__wdgWrap = wrap;
      menu.__wdgBtn = btn;
      // Portaliza no body para não afetar scroll/overflow da tabela
      try { document.body.appendChild(menu); } catch { /* noop */ }

      function getOptionLabel(opt){
        const t = String(opt?.textContent || '').trim();
        return t || '—';
      }

      function badgeClassForCurrent(){
        const v = String(sel.value || '').trim().toLowerCase();
        if (!v) return 'wdg-pillselect-badge--muted';
        if (!isType) return '';
        if (v === 'vertical') return 'wdg-pillselect-badge--vertical';
        if (v === 'horizontal') return 'wdg-pillselect-badge--horizontal';
        return '';
      }

      function syncBadge(){
        const opt = sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0] : null;
        badge.textContent = getOptionLabel(opt);
        badge.className = `wdg-pillselect-badge ${badgeClassForCurrent()}`.trim();
      }

      function buildMenu(){
        const opts = Array.from(sel.options || []);
        const cur = String(sel.value || '');
        menu.innerHTML = opts.map(o => {
          const v = String(o.value || '');
          const label = escapeHtml(getOptionLabel(o));
          const selected = (v === cur);
          return `
            <button type="button" class="wdg-pillselect-item" data-pillselect-item="1" data-value="${escapeHtml(v)}" ${selected ? 'data-selected="1"' : ''}>
              <span>${label}</span>
              <span class="wdg-pillselect-check" aria-hidden="true">${selected ? '✓' : ''}</span>
            </button>
          `;
        }).join('');
      }

      function open(){
        closeAllPillSelectMenus(menu);
        buildMenu();

        // Exibe como popover fixo (não é cortado por overflow da tabela)
        menu.hidden = false;
        wrap.classList.add('wdg-pillselect-open');
        btn.setAttribute('aria-expanded', 'true');

        try {
          const r = btn.getBoundingClientRect();
          const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
          const spaceBelow = vh - r.bottom - 12;
          const spaceAbove = r.top - 12;

          menu.style.position = 'fixed';
          menu.style.left = `${Math.round(r.left)}px`;
          menu.style.minWidth = `${Math.round(r.width)}px`;
          menu.style.maxWidth = `${Math.round(Math.min(420, r.width + 220))}px`;

          // Decide abrir pra baixo ou pra cima
          if (spaceBelow < 220 && spaceAbove > spaceBelow) {
            menu.style.top = 'auto';
            menu.style.bottom = `${Math.round(vh - r.top + 8)}px`;
            menu.style.maxHeight = `${Math.max(140, Math.round(spaceAbove))}px`;
          } else {
            menu.style.bottom = 'auto';
            menu.style.top = `${Math.round(r.bottom + 8)}px`;
            menu.style.maxHeight = `${Math.max(140, Math.round(spaceBelow))}px`;
          }

          // Garante que fique acima do resto
          menu.style.zIndex = '9999';
        } catch { /* noop */ }
      }

      function close(){
        menu.hidden = true;
        wrap.classList.remove('wdg-pillselect-open');
        btn.setAttribute('aria-expanded', 'false');
        try {
          menu.style.position = '';
          menu.style.left = '';
          menu.style.top = '';
          menu.style.bottom = '';
          menu.style.minWidth = '';
          menu.style.maxWidth = '';
          menu.style.maxHeight = '';
          menu.style.zIndex = '';
        } catch { /* noop */ }
      }

      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (menu.hidden) open();
        else close();
      });

      menu.addEventListener('click', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement)) return;
        const item = t.closest('[data-pillselect-item="1"]');
        if (!item) return;
        const v = String(item.getAttribute('data-value') || '');
        sel.value = v;
        syncBadge();
        close();
        // Dispara fluxo existente (delegação document.change)
        try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch { /* noop */ }
      });

      // Evita que o mousedown global feche antes do click
      menu.addEventListener('mousedown', (ev) => {
        try { ev.stopPropagation(); } catch { /* noop */ }
      });

      // Inicial
      syncBadge();

      // Mantém badge em sync com alterações externas
      sel.addEventListener('change', () => {
        syncBadge();
      });

      // Inserir no DOM
      sel.classList.add('wdg-pillselect-native');
      try {
        sel.classList.remove('form-select');
        sel.classList.remove('wdg-select');
        sel.tabIndex = -1;
        sel.setAttribute('aria-hidden', 'true');
      } catch { /* noop */ }
      sel.parentNode && sel.parentNode.insertBefore(wrap, sel);
      wrap.appendChild(sel);
      wrap.appendChild(btn);
    });
  }

  function renderRolesTable(){
    if (!refs.rolesTableBody) return;

    // Evita dropdowns órfãos após paginação/re-render
    try { closeAllPillSelectMenus(); } catch { /* noop */ }
    try { cleanupOrphanPillSelectMenus(); } catch { /* noop */ }

    const roles = sortRolesForUiList(state.roles);
    const pageInfo = paginate(roles, rolesPage, rolesPageSize);
    rolesPage = pageInfo.page;
    refs.rolesTableBody.innerHTML = '';

    if (!roles.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4"><div class="wdg-empty">Nenhum cargo cadastrado.</div></td>`;
      refs.rolesTableBody.appendChild(tr);
      renderRolesPager({ total: 0, page: 1, pages: 1, from: 0, to: 0, pageSize: rolesPageSize });
      return;
    }

    pageInfo.items.forEach(role => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-role-id', String(role.id || ''));
      tr.setAttribute('data-visual-parent-id', getVisualParentId(role.id) || '');
      const parentOptions = buildParentOptions(role.id, role.parentId);

      const isSindico = !!role.mandatory;

      const parentCell = isSindico
        ? `<div class="text-muted">—</div>`
        : `
          <select class="form-select wdg-select" data-role-parent-select data-role-id="${escapeHtml(role.id)}">
            ${parentOptions}
          </select>
        `;

      const typeCell = isSindico
        ? `<div class="text-muted">—</div>`
        : `
          <select class="form-select wdg-select" data-role-type-select data-role-id="${escapeHtml(role.id)}">
            <option value="vertical" ${String(role.relationType||'vertical') === 'vertical' ? 'selected' : ''}>Vertical</option>
            <option value="horizontal" ${String(role.relationType||'vertical') === 'horizontal' ? 'selected' : ''}>Horizontal</option>
          </select>
        `;

      const actionsCell = isSindico
        ? `<span class="text-muted">—</span>`
        : `
          <div class="d-flex justify-content-center gap-2">
            <button class="wdg-iconbtn" type="button" data-role-rename data-role-id="${escapeHtml(role.id)}" aria-label="Editar cargo">
              <img src="/images/editar.png" alt="" loading="lazy">
            </button>
            <button class="wdg-iconbtn" type="button" data-role-delete data-role-id="${escapeHtml(role.id)}" ${role.deletable ? '' : 'disabled'} aria-label="Excluir cargo">
              <img src="/images/excluir.png" alt="" loading="lazy">
            </button>
          </div>
        `;
      const dragHandle = `<button type="button" class="wdg-row-drag" data-role-drag-handle="1" aria-label="Arrastar para reordenar" title="Arrastar para reordenar">⋮⋮</button>`;

      tr.innerHTML = `
        <td>
          <div class="d-flex align-items-start gap-2">
            ${dragHandle}
            <div style="min-width:0;">
              <div>${escapeHtml(role.nome)}</div>
              <div class="text-muted" style="font-size:.85rem;">ID: ${escapeHtml(role.id)}</div>
            </div>
          </div>
        </td>
        <td>
          ${parentCell}
        </td>
        <td>
          ${typeCell}
        </td>
        <td class="text-center">
          ${actionsCell}
        </td>
      `;
      refs.rolesTableBody.appendChild(tr);
    });

    renderRolesPager(pageInfo);
    // Moderniza selects (subordinação/tipo) com pill dropdown
    try { wirePillSelectsForRolesTable(); } catch { /* noop */ }
  }

  function paginate(items, page, pageSize){
    const total = Array.isArray(items) ? items.length : 0;
    const safePageSize = Math.max(1, Number(pageSize) || 1);
    const pages = Math.max(1, Math.ceil(total / safePageSize));
    const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
    const start = (safePage - 1) * safePageSize;
    const end = Math.min(start + safePageSize, total);
    return {
      total,
      page: safePage,
      pages,
      pageSize: safePageSize,
      from: total ? (start + 1) : 0,
      to: total ? end : 0,
      items: items.slice(start, end)
    };
  }

  function renderRolesPager(info){
    if (!refs.rolesPager) return;

    const total = Number(info && info.total) || 0;
    const page = Number(info && info.page) || 1;
    const pages = Number(info && info.pages) || 1;
    const from = Number(info && info.from) || 0;
    const to = Number(info && info.to) || 0;
    const pageSize = Number(info && info.pageSize) || rolesPageSize;

    const disabledPrev = page <= 1;
    const disabledNext = page >= pages;

    refs.rolesPager.innerHTML = `
      <div class="wdg-roles-pager-left">
        ${total ? `Mostrando ${from}–${to} de ${total}` : '—'}
      </div>
      <div class="wdg-roles-pager-center">
        <button type="button" class="wdg-roles-pager-btn" data-roles-page="first" ${disabledPrev ? 'disabled' : ''} aria-label="Primeira página">«</button>
        <button type="button" class="wdg-roles-pager-btn" data-roles-page="prev" ${disabledPrev ? 'disabled' : ''} aria-label="Página anterior">Anterior</button>
        <span class="wdg-roles-pager-info">${page}/${pages}</span>
        <button type="button" class="wdg-roles-pager-btn" data-roles-page="next" ${disabledNext ? 'disabled' : ''} aria-label="Próxima página">Próxima</button>
        <button type="button" class="wdg-roles-pager-btn" data-roles-page="last" ${disabledNext ? 'disabled' : ''} aria-label="Última página">»</button>
      </div>
      <div class="wdg-roles-pager-right">
        <span class="wdg-roles-pagesize-label">Por página</span>
        <select class="form-select form-select-sm wdg-select wdg-roles-pagesize" data-roles-pagesize aria-label="Itens por página">
          ${[5,10,15,20,25,50].map(n => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
    `;
  }

  function renderOrg(target, opts = {}){
    if (!target) return;

    const roles = state.roles || [];
    const rolesById = new Map(roles.map(r => [r.id, r]));
    const nodesByParent = groupByVisualParent(roles, rolesById);
    const roots = getVisualRoots(roles, rolesById);

    target.innerHTML = '';

    if (!state.roles || state.roles.length === 0) {
      target.innerHTML = '<div class="wdg-empty">Nenhum cargo para exibir.</div>';
      return;
    }

    if (detectAnyCycle()) {
      target.innerHTML = '<div class="wdg-empty">Hierarquia inválida: ciclo detectado. Ajuste em Configuração.</div>';
      return;
    }

    const stage = document.createElement('div');
    stage.className = 'wdg-orgstage';

    const chart = document.createElement('div');
    chart.className = 'wdg-orgchart';

    const topUl = document.createElement('ul');
    topUl.setAttribute('aria-label', opts.preview ? 'Pré-visualização do organograma' : 'Organograma do condomínio');

    roots.forEach((r, idx) => {
      topUl.appendChild(renderNode(r.id, nodesByParent, opts, idx, roots.length));
    });

    chart.appendChild(topUl);
    stage.appendChild(chart);

    // Importante: as camadas de linhas (SVG/HTML) devem ser ancoradas no `.wdg-orgchart`
    // para manter coordenadas consistentes (tela + impressão/PDF).
    ensureOrgSvg(stage);
    target.appendChild(stage);

    try {
      requestAnimationFrame(() => {
        try { adjustCircleSizesInStage(stage); } catch {}
        scheduleDrawOrgLines(stage, { preview: !!opts.preview });
      });
    } catch {
      try { adjustCircleSizesInStage(stage); } catch {}
      scheduleDrawOrgLines(stage, { preview: !!opts.preview });
    }
  }

  function getVisualParentId(roleId){
    const role = getRole(roleId);
    if (!role) return '';
    let pid = role.parentId || '';
    if (String(role.relationType || 'vertical') === 'horizontal' && pid) {
      const parent = getRole(pid);
      pid = parent ? (parent.parentId || '') : '';
    }
    return String(pid || '');
  }

  function isHorizontalChildRole(role){
    if (!role) return false;
    return (String(role.relationType || 'vertical') === 'horizontal') && !!role.parentId;
  }

  function roleHasHorizontalChildren(roleId){
    const rid = String(roleId || '').trim();
    if (!rid) return false;
    return (state.roles || []).some(r => String(r?.parentId || '') === rid && String(r?.relationType || 'vertical') === 'horizontal');
  }

  function isRoleInHorizontalBlock(role){
    if (!role) return false;
    if (isHorizontalChildRole(role)) return true;
    return roleHasHorizontalChildren(role.id);
  }

  function getAnchorIdForRole(role){
    if (!role) return '';
    if (isHorizontalChildRole(role)) return String(role.parentId || '');
    return String(role.id || '');
  }

  function getRoleSortIndex(role){
    if (!role) return 999999999;
    if (role.mandatory) return -1000000;
    const n = Number(role.sortIndex);
    if (Number.isFinite(n)) return n;
    return 999999999;
  }

  function compareRolesForOrg(a, b){
    // Mantém blocos inseparáveis quando existe relação horizontal:
    // (cargo âncora + seus filhos horizontais) não podem ser intercalados por outros cargos.
    const aAnchorId = getAnchorIdForRole(a);
    const bAnchorId = getAnchorIdForRole(b);
    const aAnchor = aAnchorId ? (getRole(aAnchorId) || a) : a;
    const bAnchor = bAnchorId ? (getRole(bAnchorId) || b) : b;

    const da = getRoleSortIndex(aAnchor);
    const db = getRoleSortIndex(bAnchor);
    if (da !== db) return da - db;

    // Se chaves empatarem, ordena por nome do âncora para estabilidade
    if (aAnchorId !== bAnchorId) {
      const an = String(aAnchor?.nome || '').trim();
      const bn = String(bAnchor?.nome || '').trim();
      const cmpAnchorName = an.localeCompare(bn, 'pt-BR');
      if (cmpAnchorName !== 0) return cmpAnchorName;
    }

    // Dentro do mesmo bloco: usa sortIndex (permite reordenação interna) e nome
    const ia = Number(a?.sortIndex);
    const ib = Number(b?.sortIndex);
    if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
    return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR');
  }

  function ensureRoleSortIndexesOnRoles(roles){
    const arr = Array.isArray(roles) ? roles : [];
    arr.forEach(r => {
      if (!r || typeof r !== 'object') return;
      const n = Number(r.sortIndex);
      if (Number.isFinite(n)) {
        r.sortIndex = Math.round(n);
      } else {
        // Se for o cargo obrigatório (Síndico) e não tiver sortIndex definido, aplica o padrão inicial.
        if (r.mandatory) r.sortIndex = 0;
      }
    });

    const rolesById = new Map(arr.map(r => [r.id, r]));
    const nodesByParent = groupByVisualParent(arr, rolesById);

    for (const [, siblings] of nodesByParent.entries()) {
      const nums = siblings
        .map(r => Number(r.sortIndex))
        .filter(n => Number.isFinite(n));
      const hasDup = (new Set(nums)).size !== nums.length;
      const anyMissing = siblings.some(r => !Number.isFinite(Number(r.sortIndex)) && !r.mandatory);

      if (hasDup) {
        const sorted = siblings.slice().sort(compareRolesForOrg);
        let idx = 0;
        sorted.forEach(r => {
          if (r.mandatory) {
            r.sortIndex = 0;
            return;
          }
          idx += 1;
          r.sortIndex = idx * 10;
        });
        continue;
      }

      if (anyMissing) {
        let max = nums.length ? Math.max(...nums) : 0;
        const missing = siblings
          .filter(r => !Number.isFinite(Number(r.sortIndex)) && !r.mandatory)
          .slice()
          .sort((a,b) => String(a?.nome||'').localeCompare(String(b?.nome||''), 'pt-BR'));
        missing.forEach(r => {
          max += 10;
          r.sortIndex = max;
        });
      }
    }

    // Compat: se um filho horizontal não tem índice, posiciona após a âncora.
    // Não força "após" quando já existe índice (para permitir reordenação interna).
    arr.forEach(r => {
      if (!isHorizontalChildRole(r)) return;
      const anchor = rolesById.get(String(r.parentId || ''));
      if (!anchor) return;
      const aIdx = Number(anchor.sortIndex);
      const cIdx = Number(r.sortIndex);
      if (Number.isFinite(aIdx) && !Number.isFinite(cIdx)) {
        r.sortIndex = aIdx + 10;
      }
    });
  }

  function ensureRoleSortIndexes(){
    ensureRoleSortIndexesOnRoles(state.roles);
  }

  function renderNode(roleId, nodesByParent, opts, listIndex = 0, listTotal = 0){
    const role = getRole(roleId);
    const li = document.createElement('li');
    li.setAttribute('data-role-id', String(roleId));
    if (role?.parentId) li.setAttribute('data-parent-id', String(role.parentId));
    li.setAttribute('data-rel-type', String(role?.relationType || 'vertical'));
    li.setAttribute('data-visual-parent-id', getVisualParentId(roleId) || '');

    if (opts.preview && role && !role.mandatory) {
      li.classList.add('wdg-dnd-item');
      li.dataset.wdgDnd = '1';
    }

    const assignedUserId = (state.assignments && state.assignments[roleId]) || '';
    const assignedUser = assignedUserId ? (getActiveUsers() || []).find(u => String(u?.id || '') === String(assignedUserId)) : null;

    const avatar = assignedUser
      ? avatarHtml(assignedUser)
      : `<div class="wdg-avatar wdg-avatar--empty" aria-hidden="true"><i class="bi bi-person"></i></div>`;

    const statusPill = assignedUser
      ? `<span class="wdg-orgpill"><i class="bi bi-person-check"></i>Atribuído</span>`
      : `<span class="wdg-orgpill wdg-orgpill--warn"><i class="bi bi-exclamation-triangle"></i>Pendente</span>`;

    const personLine = assignedUser ? escapeHtml(assignedUser.nome) : 'Sem responsável';
    const emailLine = assignedUser ? escapeHtml(assignedUser.email || '—') : '—';

    const card = document.createElement('div');
    card.className = 'wdg-orgcard';
    card.innerHTML = `
      <div class="wdg-orgcontent">
        <div class="wdg-orgmain">
          <div class="wdg-orgavatar">${avatar}</div>
          <div class="wdg-orgname">${personLine}</div>
          <div class="wdg-orgrole">${escapeHtml(role?.nome || 'Cargo')}</div>
          <div class="wdg-orgemail">${emailLine}</div>
        </div>
        <div class="wdg-orgstatus">${statusPill}</div>
      </div>
    `;

    try { applySlotStyleToCard(card, getEffectiveSlotStyle(roleId)); } catch {}

    // Wrapper do card: serve de âncora para o botão (não desloca quando o LI cresce por filhos)
    const cardWrap = document.createElement('div');
    cardWrap.className = 'wdg-orgcardwrap';

    // Botão de edição do slot (apenas na pré-visualização; fora do card para não ser cortado por clip-path/circle)
    if (opts.preview) {
      try {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'wdg-slot-editbtn';
        editBtn.setAttribute('data-role-id', String(roleId));
        editBtn.setAttribute('aria-label', 'Editar slot');
        editBtn.setAttribute('title', 'Editar');
        editBtn.innerHTML = '<img src="/images/lapisedit.png" alt="" loading="lazy">';
        cardWrap.appendChild(editBtn);
      } catch {}
    }

    cardWrap.appendChild(card);
    li.appendChild(cardWrap);

    const children = nodesByParent.get(roleId) || [];
    if (children.length) {
      const ul = document.createElement('ul');
      const orderedChildren = children.slice().sort(compareRolesForOrg);
      orderedChildren.forEach((ch, idx) => {
        ul.appendChild(renderNode(ch.id, nodesByParent, opts, idx, orderedChildren.length));
      });
      li.appendChild(ul);
    }

    return li;
  }

  function ensureOrgSvg(stage){
    const host = (stage && stage.querySelector) ? (stage.querySelector('.wdg-orgchart') || stage) : stage;
    if (!host) return null;

    const existing = host.querySelector('svg.wdg-orglines');
    if (existing) return existing;

    const uid = `wdgorg-${Math.random().toString(36).slice(2,10)}-${Date.now().toString(36)}`;
    const gradId = `wdgOrgGrad-${uid}`;
    const glowId = `wdgOrgGlow-${uid}`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('wdg-orglines');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.zIndex = '1';
    svg.style.pointerEvents = 'none';
    svg.style.display = 'block';
    svg.style.overflow = 'visible';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.dataset.wdgOrgGlowId = glowId;
    svg.innerHTML = `
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(29,78,216,.22)"/>
          <stop offset="50%" stop-color="rgba(15,23,42,.16)"/>
          <stop offset="100%" stop-color="rgba(56,189,248,.22)"/>
        </linearGradient>
        <filter id="${glowId}" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g data-org-lines></g>
    `;

    host.prepend(svg);
    return svg;
  }

  function ensureOrgHtmlLines(stage){
    const host = (stage && stage.querySelector) ? (stage.querySelector('.wdg-orgchart') || stage) : stage;
    if (!host) return null;

    const existing = host.querySelector('.wdg-orglines-html');
    if (existing) return existing;
    const el = document.createElement('div');
    el.className = 'wdg-orglines-html';
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    el.style.zIndex = '1';
    el.style.pointerEvents = 'none';
    el.style.display = 'block';
    host.prepend(el);
    return el;
  }

  function ensureOrgDebug(stage){
    const existing = stage.querySelector('.wdg-orgdebug');
    if (existing) return existing;
    const el = document.createElement('div');
    el.className = 'wdg-orgdebug';
    el.style.position = 'absolute';
    el.style.top = '10px';
    el.style.right = '10px';
    el.style.zIndex = '5';
    el.style.pointerEvents = 'none';
    el.style.padding = '6px 10px';
    el.style.borderRadius = '10px';
    el.style.background = 'rgba(15,23,42,.82)';
    el.style.color = '#fff';
    el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    el.style.fontSize = '12px';
    el.style.fontWeight = '700';
    el.style.display = 'none';
    stage.appendChild(el);
    return el;
  }

  function scheduleDrawOrgLines(stage, opts = {}){
    // Observação: já tivemos casos em que zoom/viewport faziam o matchMedia cair como "small"
    // e o SVG era ocultado, parecendo que as linhas "sumiram". Preferimos sempre desenhar.

    let st = __orgLineState.get(stage);
    if (!st) {
      st = { raf: 0, tmo: 0, ro: null, onResize: null };
      __orgLineState.set(stage, st);

      // Recalcula quando o stage muda de tamanho
      try {
        if (typeof ResizeObserver !== 'undefined') {
          st.ro = new ResizeObserver(() => scheduleDrawOrgLines(stage, opts));
          st.ro.observe(stage);
        }
      } catch {}

      st.onResize = () => scheduleDrawOrgLines(stage, opts);
      try { window.addEventListener('resize', st.onResize, { passive: true }); } catch {}
    }

    // Modo imediato (ex.: print): bypassa debounce/rAF/setTimeout.
    if (opts && opts.immediate) {
      try { drawOrgLines(stage, opts); } catch { /* noop */ }
      return;
    }

    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = requestAnimationFrame(() => {
      // 2 frames: garante que layout/paint assentaram antes de medir
      requestAnimationFrame(() => {
        st.raf = 0;
        drawOrgLines(stage, opts);

        // Fallback premium: alguns navegadores só estabilizam após fonts/blur
        try {
          if (!st.tmo) {
            st.tmo = setTimeout(() => {
              st.tmo = 0;
              drawOrgLines(stage, opts);
            }, 160);
          }
        } catch {}
      });
    });
  }

  function drawOrgLines(stage, opts = {}){
    const host = (stage && stage.querySelector) ? (stage.querySelector('.wdg-orgchart') || stage) : stage;
    if (!host) return;

    const svg = host.querySelector('svg.wdg-orglines');
    if (!svg) return;
    const g = svg.querySelector('g[data-org-lines]');
    if (!g) return;

    const htmlLayer = ensureOrgHtmlLines(stage);
    const dbg = ensureOrgDebug(stage);

    const printMode = !opts.preview && (() => {
      try {
        if (typeof document !== 'undefined' && document.body && document.body.classList.contains('wdg-print-org')) return true;
      } catch { /* noop */ }
      const reason = String(opts && opts.reason ? opts.reason : '').toLowerCase();
      return reason.includes('print');
    })();

    // Print: preferimos SVG porque alguns drivers (ex.: Microsoft Print to PDF)
    // podem deslocar layers absolutos (HTML) quando há auto-zoom.
    try { svg.style.display = 'block'; } catch { /* noop */ }
    try { htmlLayer.style.display = printMode ? 'none' : 'block'; } catch { /* noop */ }

    // Em alguns contextos (scroll/overflow + blur), filtros SVG podem não renderizar.
    // Preferimos linhas sólidas (mais compatíveis) para garantir visibilidade.

    const stageRect = host.getBoundingClientRect();

    // Ajusta o canvas do SVG ao tamanho real do stage (conteúdo)
    // Premium/robusto no print: usamos o espaço de layout (scrollWidth/Height) e derivamos a escala
    // a partir do próprio stage, para converter de viewport -> layout mesmo com zoom/transform.
    const width = Math.ceil(host.scrollWidth || host.clientWidth || stageRect.width || 0);
    const height = Math.ceil(host.scrollHeight || host.clientHeight || stageRect.height || 0);
    if (!width || !height) return;

    const deriveScaleFromCards = () => {
      try {
        const cards = Array.from(host.querySelectorAll('.wdg-orgcard')).slice(0, 10);
        const xs = [];
        const ys = [];
        for (const el of cards) {
          if (!(el instanceof HTMLElement)) continue;
          const r = el.getBoundingClientRect();
          const ow = Number(el.offsetWidth) || 0;
          const oh = Number(el.offsetHeight) || 0;
          const sx = (ow > 0) ? (r.width / ow) : 0;
          const sy = (oh > 0) ? (r.height / oh) : 0;
          if (Number.isFinite(sx) && sx > 0.05 && sx < 10) xs.push(sx);
          if (Number.isFinite(sy) && sy > 0.05 && sy < 10) ys.push(sy);
        }
        const median = (arr) => {
          const a = (arr || []).slice().sort((p,q) => p - q);
          if (!a.length) return 0;
          return a[Math.floor(a.length / 2)];
        };
        return { sx: median(xs), sy: median(ys) };
      } catch {
        return { sx: 0, sy: 0 };
      }
    };

    const getExplicitStageScale = () => {
      try {
        const ds = Number(stage?.dataset?.wdgPrintScale);
        if (Number.isFinite(ds) && ds > 0) return ds;
      } catch { /* noop */ }

      try {
        const cs = window.getComputedStyle(stage);
        const z = Number(cs && cs.zoom != null ? cs.zoom : 0);
        if (Number.isFinite(z) && z > 0) return z;
      } catch { /* noop */ }

      try {
        const cs = window.getComputedStyle(stage);
        const tr = String(cs?.transform || '').trim();
        if (tr && tr !== 'none') {
          // matrix(a,b,c,d,tx,ty) => escalaX = sqrt(a^2+b^2)
          const m = tr.match(/matrix\(([^)]+)\)/i);
          if (m && m[1]) {
            const parts = m[1].split(',').map(s => Number(String(s).trim()));
            const a = parts[0];
            const b = parts[1];
            const scaleX = Math.sqrt((a * a) + (b * b));
            if (Number.isFinite(scaleX) && scaleX > 0) return scaleX;
          }
        }
      } catch { /* noop */ }

      return 1;
    };

    const explicitScale = printMode ? getExplicitStageScale() : 0;
    const sampleScale = deriveScaleFromCards();
    const fallbackScaleX = width ? (stageRect.width / width) : 1;
    const fallbackScaleY = height ? (stageRect.height / height) : 1;

    // No print preview (ex.: Microsoft Print to PDF), a escala aplicada pode divergir da que
    // tentamos setar via zoom/transform. A medição "real" via cards costuma ser mais confiável.
    const pickScale = (primary, secondary, tertiary) => {
      const ok = (v) => Number.isFinite(v) && v > 0.05 && v < 10;
      if (ok(primary)) return primary;
      if (ok(secondary)) return secondary;
      if (ok(tertiary)) return tertiary;
      return 1;
    };

    const scaleX = printMode
      ? pickScale(sampleScale.sx, explicitScale, 1)
      : pickScale(sampleScale.sx, fallbackScaleX, 1);

    const scaleY = printMode
      ? pickScale(sampleScale.sy, explicitScale, 1)
      : pickScale(sampleScale.sy, fallbackScaleY, 1);

    const safeScaleX = (Number.isFinite(scaleX) && scaleX > 0) ? scaleX : 1;
    const safeScaleY = (Number.isFinite(scaleY) && scaleY > 0) ? scaleY : 1;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;

    htmlLayer.style.width = `${width}px`;
    htmlLayer.style.height = `${height}px`;

    while (g.firstChild) g.removeChild(g.firstChild);
    while (htmlLayer.firstChild) htmlLayer.removeChild(htmlLayer.firstChild);

    const nodes = Array.from(host.querySelectorAll('li[data-role-id]'));
    const byId = new Map(nodes.map(n => [n.getAttribute('data-role-id'), n]));

    const nodesWithParent = nodes.filter(n => n.getAttribute('data-parent-id'));

    let drewAny = false;
    let lineCount = 0;
    const fallbackSegs = [];

    const stroke = opts.preview ? 'rgba(51,65,85,.58)' : 'rgba(30,41,59,.62)';
    const strokeWidth = opts.preview ? 2.6 : (printMode ? 3.6 : 3.2);
    const strokeOpacity = opts.preview ? 0.86 : 0.98;
    const dotR = opts.preview ? 2.6 : 3.0;
    const dotFill = opts.preview ? 'rgba(51,65,85,.50)' : 'rgba(30,41,59,.60)';
    const dotOpacity = opts.preview ? 0.7 : 0.9;

    const appendLine = (x1, y1, x2, y2) => {
      if (![x1,y1,x2,y2].every(Number.isFinite)) return;

      // No print (PDF), subpixel costuma causar “desalinhamento” visual.
      // Faz snap para coordenadas inteiras para manter linhas nítidas.
      if (printMode) {
        x1 = Math.round(x1);
        y1 = Math.round(y1);
        x2 = Math.round(x2);
        y2 = Math.round(y2);
      }

      // SVG (tela + print)
      {
        const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ln.setAttribute('x1', x1.toFixed(1));
        ln.setAttribute('y1', y1.toFixed(1));
        ln.setAttribute('x2', x2.toFixed(1));
        ln.setAttribute('y2', y2.toFixed(1));
        ln.setAttribute('stroke', stroke);
        ln.setAttribute('stroke-width', String(strokeWidth));
        ln.setAttribute('stroke-linecap', 'butt');
        ln.setAttribute('opacity', String(strokeOpacity));
        if (!opts.preview) ln.setAttribute('vector-effect', 'non-scaling-stroke');
        g.appendChild(ln);
      }

      // HTML (print) - mantido como fallback, mas normalmente oculto no print.
      if (printMode && htmlLayer && htmlLayer.style.display !== 'none') {
        const t = Math.max(2, Math.round(strokeWidth));
        const seg = document.createElement('div');
        seg.className = 'wdg-orgseg';
        seg.style.position = 'absolute';
        seg.style.background = stroke;
        seg.style.opacity = String(strokeOpacity);
        seg.style.borderRadius = '999px';

        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const w = Math.abs(x2 - x1);
        const h = Math.abs(y2 - y1);

        if (w >= h) {
          // horizontal
          seg.style.left = `${Math.round(left)}px`;
          seg.style.top = `${Math.round(y1 - (t / 2))}px`;
          seg.style.width = `${Math.round(Math.max(0, w))}px`;
          seg.style.height = `${t}px`;
        } else {
          // vertical
          seg.style.left = `${Math.round(x1 - (t / 2))}px`;
          seg.style.top = `${Math.round(top)}px`;
          seg.style.width = `${t}px`;
          seg.style.height = `${Math.round(Math.max(0, h))}px`;
        }
        htmlLayer.appendChild(seg);
      }

      lineCount += 1;
      drewAny = true;
    };

    const appendDot = (cx, cy) => {
      if (![cx,cy].every(Number.isFinite)) return;
      if (!printMode) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', cx.toFixed(1));
        c.setAttribute('cy', cy.toFixed(1));
        c.setAttribute('r', String(dotR));
        c.setAttribute('fill', dotFill);
        c.setAttribute('opacity', String(dotOpacity));
        g.appendChild(c);
      }
    };

    // Coleta relações (com coordenadas já convertidas para o espaço do stage)
    const edges = [];

    const getLayoutRectRelativeToHost = (el) => {
      const target = (el instanceof HTMLElement) ? el : null;
      if (!target) return null;

      if (!printMode) return null;

      // Print/PDF: método mais confiável é medir no espaço de layout (offsets),
      // porque o print preview pode aplicar auto-zoom que distorce getBoundingClientRect().
      try {
        let left = 0;
        let top = 0;
        let cur = target;
        while (cur && cur !== host) {
          if (!(cur instanceof HTMLElement)) break;
          left += Number(cur.offsetLeft) || 0;
          top += Number(cur.offsetTop) || 0;
          cur = cur.offsetParent;
        }
        if (cur === host) {
          const w = Number(target.offsetWidth) || 0;
          const h = Number(target.offsetHeight) || 0;
          return { left, top, width: w, height: h, right: left + w, bottom: top + h };
        }
      } catch { /* fallback abaixo */ }

      // Fallback: converte viewport -> layout com a melhor escala disponível
      try {
        const tr = target.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        const left = ((tr.left - hr.left) / safeScaleX) + (host.scrollLeft || 0);
        const top = ((tr.top - hr.top) / safeScaleY) + (host.scrollTop || 0);
        const width = (tr.width / safeScaleX);
        const height = (tr.height / safeScaleY);
        if (![left, top, width, height].every(Number.isFinite)) return null;
        return { left, top, width, height, right: left + width, bottom: top + height };
      } catch {
        return null;
      }
    };

    for (const node of nodes) {
      const roleId = node.getAttribute('data-role-id');
      const parentId = node.getAttribute('data-parent-id');
      if (!roleId || !parentId) continue;

      const parentLi = byId.get(parentId);
      if (!parentLi) continue;

      const parentCard = parentLi.querySelector('.wdg-orgcard');
      const childCard = node.querySelector('.wdg-orgcard');
      if (!parentCard || !childCard) continue;

      // No print, preferimos medir no espaço de layout (offsets) para evitar
      // qualquer distorção do preview/driver de PDF.
      const prLayout = printMode ? getLayoutRectRelativeToHost(parentCard) : null;
      const crLayout = printMode ? getLayoutRectRelativeToHost(childCard) : null;

      const pr = (!prLayout) ? parentCard.getBoundingClientRect() : null;
      const cr = (!crLayout) ? childCard.getBoundingClientRect() : null;
      const relType = String(node.getAttribute('data-rel-type') || 'vertical');

      let pCenterX, pBottomY, pLeftX, pRightX, pMidY, pTopY, pFullBottomY;
      let cCenterX, cTopY, cLeftX, cRightX, cMidY, cFullBottomY;

      if (prLayout && crLayout) {
        pCenterX = prLayout.left + (prLayout.width / 2);
        pBottomY = prLayout.bottom;
        pLeftX = prLayout.left;
        pRightX = prLayout.right;
        pMidY = prLayout.top + (prLayout.height / 2);
        pTopY = prLayout.top;
        pFullBottomY = prLayout.bottom;

        cCenterX = crLayout.left + (crLayout.width / 2);
        cTopY = crLayout.top;
        cLeftX = crLayout.left;
        cRightX = crLayout.right;
        cMidY = crLayout.top + (crLayout.height / 2);
        cFullBottomY = crLayout.bottom;
      } else {
        // Converte coordenadas do viewport para o espaço do stage (layout)
        pCenterX = ((pr.left - stageRect.left) + (pr.width / 2)) / safeScaleX;
        pBottomY = ((pr.bottom - stageRect.top)) / safeScaleY;
        pLeftX = ((pr.left - stageRect.left)) / safeScaleX;
        pRightX = ((pr.right - stageRect.left)) / safeScaleX;
        pMidY = ((pr.top - stageRect.top) + (pr.height / 2)) / safeScaleY;
        pTopY = ((pr.top - stageRect.top)) / safeScaleY;
        pFullBottomY = ((pr.bottom - stageRect.top)) / safeScaleY;

        cCenterX = ((cr.left - stageRect.left) + (cr.width / 2)) / safeScaleX;
        cTopY = ((cr.top - stageRect.top)) / safeScaleY;
        cLeftX = ((cr.left - stageRect.left)) / safeScaleX;
        cRightX = ((cr.right - stageRect.left)) / safeScaleX;
        cMidY = ((cr.top - stageRect.top) + (cr.height / 2)) / safeScaleY;
        cFullBottomY = ((cr.bottom - stageRect.top)) / safeScaleY;
      }

      // Âncoras: horizontal deve usar o caminho mais curto.
      // Se o filho estiver à esquerda do pai, conecta (pai.esquerda -> filho.direita)
      // senão (pai.direita -> filho.esquerda)
      const isHorizontal = relType === 'horizontal';
      const childOnLeft = isHorizontal && Number.isFinite(cCenterX) && Number.isFinite(pCenterX) && (cCenterX < pCenterX);

      const x1 = isHorizontal ? (childOnLeft ? pLeftX : pRightX) : pCenterX;
      const y1 = isHorizontal ? pMidY : pBottomY;
      const x2 = isHorizontal ? (childOnLeft ? cRightX : cLeftX) : cCenterX;
      const y2 = isHorizontal ? cMidY : cTopY;

      if (!(Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2))) continue;

      edges.push({
        roleId,
        parentId,
        relType,
        x1, y1, x2, y2,
        pMidY,
        cMidY,
        pTopY, pFullBottomY,
        cTopY, cFullBottomY
      });
    }

    // Desenha relações horizontais
    // Regra do print: as pontas DEVEM encostar exatamente na borda do slot (card).
    // Então, no modo impressão, evitamos um "y" intermediário (reta em yStraight),
    // e ancoramos sempre em (x1,y1) e (x2,y2), usando cotovelo apenas quando necessário.
    for (const e of edges.filter(x => x.relType === 'horizontal')) {
      const y1 = e.y1;
      const y2 = e.y2;

      // Leve "overlap" para garantir contato visual com a borda (PDF costuma arredondar/antialias).
      const expandEnds = (x1, x2, px) => {
        const a = Number(x1);
        const b = Number(x2);
        if (!(Number.isFinite(a) && Number.isFinite(b))) return [x1, x2];
        if (b >= a) return [a - px, b + px];
        return [a + px, b - px];
      };

      if (printMode) {
        const overlapTop = Math.max(e.pTopY, e.cTopY);
        const overlapBottom = Math.min(e.pFullBottomY, e.cFullBottomY);
        const overlapH = overlapBottom - overlapTop;
        const hasOverlap = Number.isFinite(overlapH) && overlapH >= 10;
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

        const [x1p, x2p] = expandEnds(Math.round(e.x1), Math.round(e.x2), 1);
        const y1p = Math.round(y1);
        const y2p = Math.round(y2);

        if (hasOverlap) {
          // Preferência no print: reta única (premium) e encostando na borda.
          // Escolhe um Y dentro da faixa comum para evitar o "degrau" no PDF.
          const pad = 6;
          const avgMid = (Number(e.pMidY) + Number(e.cMidY)) / 2;
          const yStraight = clamp(avgMid, overlapTop + pad, overlapBottom - pad);
          const yStraightP = Math.round(yStraight);
          appendLine(x1p, yStraightP, x2p, yStraightP);
        } else {
          // Sem overlap: cotovelo, mas mantendo as pontas exatamente na borda
          // Coloca o "desnível" perto do destino (mais discreto no print)
          const dir = (x2p >= x1p) ? 1 : -1;
          const laneX = Math.round(x2p - (dir * 34));
          const laneXSafe = (dir === 1)
            ? Math.max(laneX, x1p + 28)
            : Math.min(laneX, x1p - 28);

          appendLine(x1p, y1p, laneXSafe, y1p);
          appendLine(laneXSafe, y1p, laneXSafe, y2p);
          appendLine(laneXSafe, y2p, x2p, y2p);
        }
      } else {
        // Tela: tenta reta quando possível; senão cotovelo simétrico
        const overlapTop = Math.max(e.pTopY, e.cTopY);
        const overlapBottom = Math.min(e.pFullBottomY, e.cFullBottomY);
        const overlapH = overlapBottom - overlapTop;
        const hasOverlap = Number.isFinite(overlapH) && overlapH >= 12;

        if (hasOverlap) {
          const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
          const pad = 6;
          const avgMid = (Number(e.pMidY) + Number(e.cMidY)) / 2;
          const yStraight = clamp(avgMid, overlapTop + pad, overlapBottom - pad);
          appendLine(e.x1, yStraight, e.x2, yStraight);
        } else {
          const midX = (e.x1 + e.x2) / 2;
          appendLine(e.x1, y1, midX, y1);
          appendLine(midX, y1, midX, y2);
          appendLine(midX, y2, e.x2, y2);
        }
        appendDot(e.x1, e.y1);
        appendDot(e.x2, e.y2);
      }

      // fallback/diag
      fallbackSegs.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, midY: (e.y1 + e.y2) / 2 });
    }

    // Desenha relações verticais por grupo (tronco + barra horizontal + descidas)
    const byParentEdges = new Map();
    for (const e of edges.filter(x => x.relType !== 'horizontal')) {
      if (!byParentEdges.has(e.parentId)) byParentEdges.set(e.parentId, []);
      byParentEdges.get(e.parentId).push(e);
    }

    for (const [, group] of byParentEdges.entries()) {
      if (!group || !group.length) continue;

      // Ponto do pai é comum no grupo (p/centerX + bottomY)
      const px = group[0].x1;
      const py = group[0].y1;
      const children = group.slice().sort((a,b) => a.x2 - b.x2);
      const childXs = children.map(c => c.x2);
      const childYs = children.map(c => c.y2);

      if (children.length === 1) {
        const c = children[0];
        const dyRaw = (c.y2 - py);
        const dy = Math.max(22, Math.min(90, dyRaw * 0.55));
        const midY = Math.min(c.y2 - 10, py + dy);
        appendLine(px, py, px, midY);
        appendLine(px, midY, c.x2, midY);
        appendLine(c.x2, midY, c.x2, c.y2);
        appendDot(px, py);
        appendDot(c.x2, c.y2);
        fallbackSegs.push({ x1: px, y1: py, x2: c.x2, y2: c.y2, midY });
        continue;
      }

      const minChildX = Math.min(...childXs);
      const maxChildX = Math.max(...childXs);
      const minChildTop = Math.min(...childYs);

      // "Barramento" comum: fica abaixo do pai e acima do topo dos filhos
      const gap = Math.max(18, Math.min(70, (minChildTop - py) * 0.55));
      let junctionY = py + gap;
      junctionY = Math.min(junctionY, minChildTop - 12);
      junctionY = Math.max(py + 18, junctionY);

      appendLine(px, py, px, junctionY);
      appendLine(minChildX, junctionY, maxChildX, junctionY);

      for (const c of children) {
        appendLine(c.x2, junctionY, c.x2, c.y2);
        appendDot(c.x2, c.y2);
        fallbackSegs.push({ x1: px, y1: py, x2: c.x2, y2: c.y2, midY: junctionY });
      }
      appendDot(px, py);
    }

    try {
      svg.dataset.wdgOrgLineCount = String(lineCount);
    } catch {}

    // Se não desenhou nada mas existem relações, mostra um diagnóstico visual.
    // Também desenha uma linha vermelha de prova (1) para confirmar que o layer está visível.
    try {
      if (!opts.preview && nodes.length) {
        const diag = `nodes=${nodes.length} parents=${nodesWithParent.length} lines=${lineCount} w=${width} h=${height}`;
        if (!drewAny && nodesWithParent.length) {
          dbg.textContent = diag;
          dbg.style.display = 'block';

          // Fallback HTML (mais resiliente que SVG em alguns cenários)
          const color = 'rgba(30,41,59,.60)';
          const thickness = 3;
          for (const s of fallbackSegs) {
            const v1 = document.createElement('div');
            v1.className = 'wdg-orgseg';
            v1.style.position = 'absolute';
            v1.style.left = `${s.x1 - (thickness / 2)}px`;
            v1.style.top = `${s.y1}px`;
            v1.style.width = `${thickness}px`;
            v1.style.height = `${Math.max(0, s.midY - s.y1)}px`;
            v1.style.background = color;
            v1.style.borderRadius = '999px';
            htmlLayer.appendChild(v1);

            const h = document.createElement('div');
            h.className = 'wdg-orgseg';
            h.style.position = 'absolute';
            h.style.left = `${Math.min(s.x1, s.x2)}px`;
            h.style.top = `${s.midY - (thickness / 2)}px`;
            h.style.width = `${Math.abs(s.x2 - s.x1)}px`;
            h.style.height = `${thickness}px`;
            h.style.background = color;
            h.style.borderRadius = '999px';
            htmlLayer.appendChild(h);

            const v2 = document.createElement('div');
            v2.className = 'wdg-orgseg';
            v2.style.position = 'absolute';
            v2.style.left = `${s.x2 - (thickness / 2)}px`;
            v2.style.top = `${s.midY}px`;
            v2.style.width = `${thickness}px`;
            v2.style.height = `${Math.max(0, s.y2 - s.midY)}px`;
            v2.style.background = color;
            v2.style.borderRadius = '999px';
            htmlLayer.appendChild(v2);
          }

          const proof = document.createElement('div');
          proof.style.position = 'absolute';
          proof.style.left = '12px';
          proof.style.top = '12px';
          proof.style.width = '140px';
          proof.style.height = '3px';
          proof.style.background = 'rgba(220,38,38,.95)';
          proof.style.borderRadius = '999px';
          htmlLayer.appendChild(proof);
        } else {
          dbg.style.display = 'none';
        }
      }
    } catch {}

    // Debug silencioso: se não desenhou nada, ainda garante SVG visível (não afeta UI)
    if (!drewAny) {
      // no-op
    }
  }

  async function openRoleCreateDialog(){
    const openModal = (window.WDGCargoOrganograma && typeof window.WDGCargoOrganograma.openRoleNameModal === 'function')
      ? window.WDGCargoOrganograma.openRoleNameModal
      : null;

    const askName = async (initialValue, initialError) => {
      if (!openModal) {
        const nome = prompt('Nome do novo cargo (ex.: Comissão de Obras, Conselho Fiscal, etc.):');
        return (nome == null) ? null : String(nome);
      }
      return await openModal({
        mode: 'create',
        initialValue: initialValue || '',
        initialError: initialError || '',
        validate: (val) => {
          const clean = String(val || '').trim();
          if (!clean) return 'Informe um nome para o cargo.';
          if (state.roles.some(r => normalize(r.nome) === normalize(clean))) return 'Já existe um cargo com esse nome.';
          return '';
        }
      });
    };

    let initial = '';
    let err = '';
    const nome = await askName(initial, err);
    if (!nome) return;

    const clean = String(nome).trim();
    if (!clean) return;
    if (state.roles.some(r => normalize(r.nome) === normalize(clean))) {
      toast('Já existe um cargo com esse nome.', 'danger');
      return;
    }

    const id = `r-${slug(clean)}-${Math.random().toString(16).slice(2,6)}`;
    // Por padrão, tudo abaixo do Síndico
    const sindico = state.roles.find(r => r.mandatory) || null;
    const parentId = sindico ? sindico.id : null;

    state.roles.push({ id, nome: clean, parentId, relationType: 'vertical', mandatory: false, deletable: true });
    ensureRoleSortIndexes();
    saveState();
    renderAll();
    toast('Cargo criado.', 'success');
  }

  function setRoleRelationType(roleId, relationType){
    const role = getRole(roleId);
    if (!role) return;
    if (role.mandatory) {
      role.relationType = 'vertical';
      return;
    }
    const clean = String(relationType || '').toLowerCase();
    role.relationType = (clean === 'horizontal') ? 'horizontal' : 'vertical';
    ensureRoleSortIndexes();
  }

  async function openRoleRenameDialog(roleId){
    const role = getRole(roleId);
    if (!role) return;

    const openModal = (window.WDGCargoOrganograma && typeof window.WDGCargoOrganograma.openRoleNameModal === 'function')
      ? window.WDGCargoOrganograma.openRoleNameModal
      : null;

    const nome = openModal
      ? await openModal({
        mode: 'edit',
        initialValue: role.nome,
        validate: (val) => {
          const clean = String(val || '').trim();
          if (!clean) return 'Informe um nome para o cargo.';
          if (role.mandatory && normalize(clean) !== normalize('Síndico')) return 'O cargo obrigatório deve permanecer como “Síndico”.';
          if (state.roles.some(r => r.id !== roleId && normalize(r.nome) === normalize(clean))) return 'Já existe um cargo com esse nome.';
          return '';
        }
      })
      : prompt('Renomear cargo:', role.nome);

    if (nome == null) return;
    const clean = String(nome).trim();
    if (!clean) return;
    if (role.mandatory && normalize(clean) !== normalize('Síndico')) {
      toast('O cargo obrigatório deve permanecer como “Síndico”.', 'danger');
      return;
    }
    if (state.roles.some(r => r.id !== roleId && normalize(r.nome) === normalize(clean))) {
      toast('Já existe um cargo com esse nome.', 'danger');
      return;
    }
    role.nome = clean;
    saveState();
    renderAll();
    toast('Cargo renomeado.', 'success');
  }

  function setRoleParent(roleId, parentId){
    const role = getRole(roleId);
    if (!role) return;
    if (!parentId && !role.mandatory) {
      const sindico = (state.roles || []).find(r => r.mandatory) || null;
      role.parentId = sindico ? sindico.id : null;
      return;
    }
    role.parentId = parentId || null;
    ensureRoleSortIndexes();
  }

  function setAssignment(roleId, userId){
    state.assignments = state.assignments || {};
    if (!userId) {
      delete state.assignments[roleId];
      return;
    }
    state.assignments[roleId] = userId;
  }

  function deleteRole(roleId){
    // remove o role
    state.roles = (state.roles || []).filter(r => r.id !== roleId);

    // limpa assignments desse role
    if (state.assignments && state.assignments[roleId]) delete state.assignments[roleId];

    // filhos sobem para o parent do removido
    const removed = getRole(roleId);
    const removedParent = removed ? removed.parentId : null;
    (state.roles || []).forEach(r => {
      if (r.parentId === roleId) r.parentId = removedParent || null;
    });

    ensureRoleSortIndexes();
  }

  function buildParentOptions(roleId, selectedParentId){
    const roles = (state.roles || []).filter(r => r.id !== roleId);
    const opts = roles
      .slice()
      .sort((a,b) => String(a.nome||'').localeCompare(String(b.nome||''), 'pt-BR'))
      .map(r => {
        const selected = r.id === selectedParentId ? 'selected' : '';
        return `<option value="${escapeHtml(r.id)}" ${selected}>${escapeHtml(r.nome)}</option>`;
      });
    return opts.join('');
  }

  function groupByParent(roles){
    const map = new Map();
    (roles || []).forEach(r => {
      const pid = r.parentId || null;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push(r);
    });
    return map;
  }

  function groupByVisualParent(roles, rolesById){
    const map = new Map();
    (roles || []).forEach(r => {
      let pid = r.parentId || null;
      if (String(r.relationType || 'vertical') === 'horizontal' && pid) {
        const parent = rolesById.get(pid);
        pid = parent ? (parent.parentId || null) : null;
      }
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push(r);
    });
    return map;
  }

  function getVisualRoots(roles, rolesById){
    const all = roles || [];
    const ids = new Set(all.map(r => r.id));

    const visualParentOf = (r) => {
      let pid = r.parentId || null;
      if (String(r.relationType || 'vertical') === 'horizontal' && pid) {
        const parent = rolesById.get(pid);
        pid = parent ? (parent.parentId || null) : null;
      }
      return pid;
    };

    const roots = all.filter(r => {
      const vp = visualParentOf(r);
      return !vp || !ids.has(vp);
    });

    // preferir o Síndico como raiz
    const sindico = all.find(r => r.mandatory);
    if (sindico) {
      const first = roots.find(r => r.id === sindico.id);
      if (first) return [first, ...roots.filter(r => r.id !== sindico.id)];
    }
    return roots;
  }

  function getRoots(){
    const roles = state.roles || [];
    const ids = new Set(roles.map(r => r.id));
    const roots = roles.filter(r => !r.parentId || !ids.has(r.parentId));
    // preferir o Síndico como raiz
    const sindico = roles.find(r => r.mandatory);
    if (sindico) {
      const first = roots.find(r => r.id === sindico.id);
      if (first) {
        return [first, ...roots.filter(r => r.id !== sindico.id)];
      }
    }
    return roots;
  }

  function getRole(roleId){
    return (state.roles || []).find(r => r.id === roleId) || null;
  }

  function getRoleName(roleId){
    if (!roleId) return '';
    const r = getRole(roleId);
    return r ? r.nome : '';
  }

  function createsCycle(roleId, parentId){
    // verifica se roleId aparece na cadeia de ancestrais do parentId
    let current = parentId;
    const visited = new Set();
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      if (current === roleId) return true;
      const r = getRole(current);
      current = r ? r.parentId : null;
    }
    return false;
  }

  function detectAnyCycle(){
    const roles = state.roles || [];
    const byId = new Map(roles.map(r => [r.id, r]));

    for (const r of roles) {
      let current = r.id;
      const seen = new Set();
      while (current) {
        if (seen.has(current)) return true;
        seen.add(current);
        const rr = byId.get(current);
        current = rr ? rr.parentId : null;
      }
    }
    return false;
  }

  function sortRolesForDisplay(roles){
    const arr = (roles || []).slice();
    // Ordem geral baseada em: Síndico primeiro; depois por "pai visual"; e dentro do mesmo grupo usa sortIndex (compareRolesForOrg)
    return arr.sort((a,b) => {
      if (a?.mandatory && !b?.mandatory) return -1;
      if (!a?.mandatory && b?.mandatory) return 1;

      const vpa = getVisualParentId(a?.id) || '__root__';
      const vpb = getVisualParentId(b?.id) || '__root__';
      if (vpa !== vpb) {
        const pa = (vpa && vpa !== '__root__') ? getRole(vpa) : null;
        const pb = (vpb && vpb !== '__root__') ? getRole(vpb) : null;
        const da = getRoleSortIndex(pa);
        const db = getRoleSortIndex(pb);
        if (da !== db) return da - db;
        const an = String(pa?.nome || vpa).trim();
        const bn = String(pb?.nome || vpb).trim();
        const cmp = an.localeCompare(bn, 'pt-BR');
        if (cmp !== 0) return cmp;
      }

      return compareRolesForOrg(a, b);
    });
  }

  function buildExportPayload(){
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      roles: state.roles,
      assignments: state.assignments,
      slotStyle: state.slotStyle,
    };
  }

  function storageKeyForUnit(unitId){
    const uid = String(unitId || '').trim();
    return `${STORAGE_KEY_PREFIX}.${uid || '__none__'}`;
  }

  function loadState(unitId){
    try {
      const uid = String(unitId || getSelectedUnidadeId() || userUnit || '').trim();
      const key = storageKeyForUnit(uid);

      let raw = '';
      let fromLegacy = false;
      try { raw = localStorage.getItem(key) || ''; } catch { raw = ''; }

      // Migração: se existe dado antigo e estamos na unidade do usuário, migra uma vez.
      if (!raw && uid && userUnit && uid === String(userUnit) ) {
        try {
          const legacyRaw = localStorage.getItem(STORAGE_KEY_LEGACY);
          if (legacyRaw) {
            raw = legacyRaw;
            fromLegacy = true;
          }
        } catch { /* noop */ }
      }

      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultState();

      const roles = Array.isArray(parsed.roles) ? parsed.roles : [];
      const hasSindico = roles.some(r => normalize(r.nome) === normalize('Síndico') || r.mandatory);
      if (!hasSindico) {
        roles.unshift({ id: 'r-sindico', nome: 'Síndico', parentId: null, relationType: 'vertical', mandatory: true, deletable: false });
      }

      // Garantir invariantes do Síndico
      roles.forEach(r => {
        if (normalize(r.nome) === normalize('Síndico') || r.id === 'r-sindico') {
          r.nome = 'Síndico';
          r.mandatory = true;
          r.deletable = false;
          r.parentId = null;
          r.relationType = 'vertical';
          r.id = 'r-sindico';
        }
        if (typeof r.deletable !== 'boolean') r.deletable = !r.mandatory;
        if (typeof r.mandatory !== 'boolean') r.mandatory = false;
        if (r.parentId === '') r.parentId = null;

        if (String(r.relationType || '').toLowerCase() !== 'horizontal') r.relationType = 'vertical';
      });

      // Migração: não permitir cargos "sem superior" (exceto Síndico)
      const sindicoId = (roles.find(r => r.mandatory) || {}).id || 'r-sindico';
      roles.forEach(r => {
        if (!r.mandatory && !r.parentId) r.parentId = sindicoId;
      });

      // Migração: ordem persistida (permite reorganização por arrastar/soltar)
      ensureRoleSortIndexesOnRoles(roles);

      const assignments = (parsed.assignments && typeof parsed.assignments === 'object') ? parsed.assignments : {};

      // Remover assignments para roles inexistentes
      const roleIds = new Set(roles.map(r => r.id));
      Object.keys(assignments).forEach(roleId => {
        if (!roleIds.has(roleId)) delete assignments[roleId];
      });

      const slotStyle = (parsed.slotStyle && typeof parsed.slotStyle === 'object')
        ? parsed.slotStyle
        : { global: { shape: 'rect', bg: '', text: '', align: 'center', textParts: {} }, byRole: {} };

      const result = {
        roles,
        assignments,
        slotStyle,
        lastSavedAt: parsed.lastSavedAt || null
      };

      if (fromLegacy) {
        try {
          localStorage.setItem(key, JSON.stringify(result));
          localStorage.removeItem(STORAGE_KEY_LEGACY);
        } catch { /* noop */ }
      }

      return result;
    } catch {
      return defaultState();
    }
  }

  async function loadStateCloudFirst(unitId){
    const uid = String(unitId || getSelectedUnidadeId() || userUnit || '').trim();
    if (!uid) return { state: defaultState(), seedCloud: false };

    const cloud = await tryLoadCloudState(uid);
    if (cloud && cloud.state && typeof cloud.state === 'object') {
      // Normaliza via caminho existente: grava no cache local e reaproveita loadState()
      try {
        const key = storageKeyForUnit(uid);
        localStorage.setItem(key, JSON.stringify(cloud.state));
      } catch { /* noop */ }
      return { state: loadState(uid), seedCloud: false };
    }

    // Sem doc na nuvem: usa local (ou default) e faz seed automático.
    return { state: loadState(uid), seedCloud: !!cloud?.notFound };
  }

  function saveState(unitId){
    try {
      const uid = String(unitId || getSelectedUnidadeId() || userUnit || '').trim();
      const key = storageKeyForUnit(uid);
      state.lastSavedAt = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(state));
      scheduleCloudSave(uid);
    } catch {
      // ignore
    }
  }

  function clearPreviewDndHints(){
    if (!refs.orgPreview) return;
    try {
      refs.orgPreview.querySelectorAll('li.wdg-dnd-drop, li.wdg-dnd-over, li.wdg-dnd-dragging').forEach(el => {
        el.classList.remove('wdg-dnd-drop', 'wdg-dnd-over', 'wdg-dnd-dragging');
      });
    } catch {}
  }

  function buildVisualSiblingGroups(visualParentId){
    const roles = state.roles || [];
    const rolesById = new Map(roles.map(r => [r.id, r]));
    const nodesByParent = groupByVisualParent(roles, rolesById);
    const siblings = (nodesByParent.get(visualParentId || null) || []).slice();

    const byAnchor = new Map();
    const siblingById = new Map(siblings.map(r => [String(r.id), r]));

    for (const r of siblings) {
      const anchorId = getAnchorIdForRole(r) || String(r.id);
      if (!byAnchor.has(anchorId)) byAnchor.set(anchorId, { anchorId, members: [] });
      byAnchor.get(anchorId).members.push(r);
    }

    const groups = [];

    for (const g of byAnchor.values()) {
      const anchorRole = siblingById.get(String(g.anchorId || '')) || null;
      if (!anchorRole) {
        // Se a âncora não está entre os irmãos (caso raro), não cria bloco: mantém cada item isolado
        g.members.forEach(r => {
          groups.push({
            anchorId: String(r.id),
            members: [r]
          });
        });
        continue;
      }

      const members = g.members.slice();
      members.sort(compareRolesForOrg);

      groups.push({
        anchorId: String(g.anchorId),
        members
      });
    }

    groups.sort((ga, gb) => {
      const aAnchor = getRole(ga.anchorId) || ga.members[0];
      const bAnchor = getRole(gb.anchorId) || gb.members[0];
      const da = getRoleSortIndex(aAnchor);
      const db = getRoleSortIndex(bAnchor);
      if (da !== db) return da - db;
      return String(aAnchor?.nome || '').localeCompare(String(bAnchor?.nome || ''), 'pt-BR');
    });

    return groups;
  }

  function reorderVisualSiblings(visualParentId, draggedRoleId, targetRoleId, insertAfter){
    const groups = buildVisualSiblingGroups(visualParentId);
    const draggedId = String(draggedRoleId || '');
    const targetId = String(targetRoleId || '');

    const findGroupIndexByRoleId = (roleId) => {
      return groups.findIndex(g => g.members.some(r => String(r.id) === String(roleId)));
    };

    const dragGroupIdx = findGroupIndexByRoleId(draggedId);
    const targetGroupIdx = findGroupIndexByRoleId(targetId);
    if (dragGroupIdx < 0 || targetGroupIdx < 0) return false;
    if (dragGroupIdx === targetGroupIdx) {
      // Movimento permitido APENAS dentro do bloco horizontal
      const draggedRole = getRole(draggedId);
      const targetRole = getRole(targetId);
      if (!draggedRole || !targetRole) return false;
      const anchorId = getAnchorIdForRole(draggedRole);
      const anchorId2 = getAnchorIdForRole(targetRole);
      if (!anchorId || !anchorId2 || String(anchorId) !== String(anchorId2)) return false;

      const anchorRole = getRole(anchorId);
      if (!anchorRole || !isRoleInHorizontalBlock(anchorRole)) return false;

      // Reordena apenas dentro do bloco, mantendo o sortIndex da âncora como "base" do bloco
      const groupsSame = groups[dragGroupIdx];
      const members = (groupsSame && Array.isArray(groupsSame.members)) ? groupsSame.members.slice() : [];
      if (members.length < 2) return false;

      members.sort((a,b) => {
        const ia = Number(a?.sortIndex);
        const ib = Number(b?.sortIndex);
        if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
        return String(a?.nome||'').localeCompare(String(b?.nome||''), 'pt-BR');
      });

      const dragged = members.find(r => String(r.id) === draggedId);
      const target = members.find(r => String(r.id) === targetId);
      if (!dragged || !target) return false;
      if (dragged.mandatory) return false;

      const next = members.filter(r => String(r.id) !== draggedId);
      let idx = next.findIndex(r => String(r.id) === targetId);
      if (idx < 0) return false;
      if (insertAfter) idx += 1;
      next.splice(idx, 0, dragged);

      const base = Number(anchorRole.sortIndex);
      const safeBase = Number.isFinite(base) ? base : 100;
      const anchorIndex = Math.max(0, next.findIndex(r => String(r.id) === String(anchorId)));

      for (let i = 0; i < next.length; i++) {
        const r = next[i];
        const offset = (i - anchorIndex) * 10;
        if (String(r.id) === String(anchorId)) r.sortIndex = safeBase;
        else r.sortIndex = safeBase + offset;
      }

      return true;
    }

    const draggedGroup = groups[dragGroupIdx];
    const anchorRole = getRole(draggedGroup.anchorId) || draggedGroup.members[0];
    if (anchorRole && anchorRole.mandatory) return false;

    groups.splice(dragGroupIdx, 1);
    let idx = targetGroupIdx;
    if (dragGroupIdx < targetGroupIdx) idx = targetGroupIdx - 1;
    if (insertAfter) idx += 1;
    idx = Math.max(0, Math.min(groups.length, idx));
    groups.splice(idx, 0, draggedGroup);

    // Reindexa por blocos, mantendo coesão do vínculo horizontal e preservando ordem interna
    let base = 0;
    for (const g of groups) {
      const a = getRole(g.anchorId) || g.members[0];
      if (a && a.mandatory) {
        a.sortIndex = 0;
        continue;
      }
      base += 100;
      if (a) a.sortIndex = base;

      const membersOrdered = (g.members || []).slice().sort((ra, rb) => {
        const ia = Number(ra?.sortIndex);
        const ib = Number(rb?.sortIndex);
        if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
        return String(ra?.nome||'').localeCompare(String(rb?.nome||''), 'pt-BR');
      });
      const anchorIndex = Math.max(0, membersOrdered.findIndex(r => String(r.id) === String(g.anchorId)));
      for (let i = 0; i < membersOrdered.length; i++) {
        const r = membersOrdered[i];
        const offset = (i - anchorIndex) * 10;
        if (String(r.id) === String(g.anchorId)) r.sortIndex = base;
        else r.sortIndex = base + offset;
      }
    }

    return true;
  }

  function swapVisualSiblings(visualParentId, roleAId, roleBId){
    const groups = buildVisualSiblingGroups(visualParentId);
    const aId = String(roleAId || '');
    const bId = String(roleBId || '');
    if (!aId || !bId || aId === bId) return false;

    const findGroupIndexByRoleId = (roleId) => {
      return groups.findIndex(g => g.members.some(r => String(r.id) === String(roleId)));
    };

    const aGroupIdx = findGroupIndexByRoleId(aId);
    const bGroupIdx = findGroupIndexByRoleId(bId);
    if (aGroupIdx < 0 || bGroupIdx < 0) return false;

    // Mesmo bloco: swap interno (apenas dentro do bloco horizontal)
    if (aGroupIdx === bGroupIdx) {
      const aRole = getRole(aId);
      const bRole = getRole(bId);
      if (!aRole || !bRole) return false;

      const aAnchor = getAnchorIdForRole(aRole);
      const bAnchor = getAnchorIdForRole(bRole);
      if (!aAnchor || !bAnchor || String(aAnchor) !== String(bAnchor)) return false;
      const anchorRole = getRole(aAnchor);
      if (!anchorRole || !isRoleInHorizontalBlock(anchorRole)) return false;

      const members = groups[aGroupIdx].members.slice().sort((x,y) => {
        const ix = Number(x?.sortIndex);
        const iy = Number(y?.sortIndex);
        if (Number.isFinite(ix) && Number.isFinite(iy) && ix !== iy) return ix - iy;
        return String(x?.nome||'').localeCompare(String(y?.nome||''), 'pt-BR');
      });

      const iA = members.findIndex(r => String(r.id) === aId);
      const iB = members.findIndex(r => String(r.id) === bId);
      if (iA < 0 || iB < 0 || iA === iB) return false;

      // swap
      const tmp = members[iA];
      members[iA] = members[iB];
      members[iB] = tmp;

      const base = Number(anchorRole.sortIndex);
      const safeBase = Number.isFinite(base) ? base : 100;
      const anchorIndex = Math.max(0, members.findIndex(r => String(r.id) === String(aAnchor)));
      for (let i = 0; i < members.length; i++) {
        const r = members[i];
        const offset = (i - anchorIndex) * 10;
        if (String(r.id) === String(aAnchor)) r.sortIndex = safeBase;
        else r.sortIndex = safeBase + offset;
      }

      return true;
    }

    // Blocos diferentes: swap de blocos
    const ga = groups[aGroupIdx];
    const gb = groups[bGroupIdx];
    const anchorA = getRole(ga.anchorId) || ga.members[0];
    const anchorB = getRole(gb.anchorId) || gb.members[0];
    if ((anchorA && anchorA.mandatory) || (anchorB && anchorB.mandatory)) return false;

    groups[aGroupIdx] = gb;
    groups[bGroupIdx] = ga;

    // Reindexa por blocos preservando ordem interna atual
    let base = 0;
    for (const g of groups) {
      const a = getRole(g.anchorId) || g.members[0];
      if (a && a.mandatory) {
        a.sortIndex = 0;
        continue;
      }
      base += 100;
      if (a) a.sortIndex = base;

      const membersOrdered = (g.members || []).slice().sort((ra, rb) => {
        const ia = Number(ra?.sortIndex);
        const ib = Number(rb?.sortIndex);
        if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
        return String(ra?.nome||'').localeCompare(String(rb?.nome||''), 'pt-BR');
      });
      const anchorIndex = Math.max(0, membersOrdered.findIndex(r => String(r.id) === String(g.anchorId)));
      for (let i = 0; i < membersOrdered.length; i++) {
        const r = membersOrdered[i];
        const offset = (i - anchorIndex) * 10;
        if (String(r.id) === String(g.anchorId)) r.sortIndex = base;
        else r.sortIndex = base + offset;
      }
    }

    return true;
  }

  function wireOrgPreviewReorder(){
    if (!refs.orgPreview) return;
    if (refs.orgPreview.dataset.wdgDndBound === '1') return;

    // Preferir Pointer Events (bem mais robusto que HTML5 drag/drop em zoom/scroll)
    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
      wireOrgPreviewPointerReorder();
      return;
    }

    // Fallback (ambientes antigos)
    wireOrgPreviewDnD();
  }

  function wireOrgPreviewPointerReorder(){
    if (!refs.orgPreview) return;
    if (refs.orgPreview.dataset.wdgDndBound === '1') return;
    refs.orgPreview.dataset.wdgDndBound = '1';

    const drag = {
      active: false,
      pointerId: 0,
      roleId: '',
      visualParentId: '',
      anchorId: '',
      restrictToBlock: false,
      startX: 0,
      startY: 0,
      moved: false,
      overRoleId: '',
      insertAfter: false,
      draggingLi: null
    };

    const clearHints = () => {
      try { clearPreviewDndHints(); } catch {}
    };

    const getLiFromPoint = (clientX, clientY) => {
      try {
        const el = document.elementFromPoint(clientX, clientY);
        if (el && el.closest) {
          const li = el.closest('li[data-role-id]');
          if (li && refs.orgPreview.contains(li)) return li;
        }
      } catch {}
      return null;
    };

    const isLiAllowed = (li) => {
      if (!li) return false;
      const roleId = String(li.getAttribute('data-role-id') || '').trim();
      const vp = String(li.getAttribute('data-visual-parent-id') || '').trim();
      if (!roleId || !vp) return false;
      if (vp !== drag.visualParentId) return false;
      if (roleId === drag.roleId) return false;

      if (drag.restrictToBlock) {
        const overRole = getRole(roleId);
        const overAnchor = getAnchorIdForRole(overRole);
        if (!overAnchor || String(overAnchor) !== String(drag.anchorId)) return false;
      }

      return true;
    };

    const findNearestAllowedLi = (clientX, clientY) => {
      try {
        const all = Array.from(refs.orgPreview.querySelectorAll('li[data-role-id]'));
        const candidates = all.filter(isLiAllowed);
        let best = null;
        let bestD = Infinity;
        for (const li of candidates) {
          const card = li.querySelector('.wdg-orgcard');
          const rect = (card || li).getBoundingClientRect();
          const mx = rect.left + rect.width / 2;
          const my = rect.top + rect.height / 2;
          const dx = clientX - mx;
          const dy = clientY - my;
          const d = (dx * dx) + (dy * dy);
          if (d < bestD) {
            bestD = d;
            best = li;
          }
        }

        if (!best) return null;
        const maxDist = 560 * 560;
        if (bestD > maxDist) return null;
        return best;
      } catch {
        return null;
      }
    };

    const updateOver = (clientX, clientY) => {
      const li = getLiFromPoint(clientX, clientY);
      const chosen = (isLiAllowed(li) ? li : findNearestAllowedLi(clientX, clientY));
      if (!chosen) {
        drag.overRoleId = '';
        clearHints();
        return;
      }

      const roleId = String(chosen.getAttribute('data-role-id') || '').trim();
      drag.overRoleId = roleId;
      clearHints();
      chosen.classList.add('wdg-dnd-drop');

      try {
        const card = chosen.querySelector('.wdg-orgcard');
        const rect = (card || chosen).getBoundingClientRect();
        drag.insertAfter = clientX > (rect.left + rect.width / 2);
      } catch {
        drag.insertAfter = false;
      }
    };

    const endDrag = (apply) => {
      if (drag.draggingLi) {
        try { drag.draggingLi.classList.remove('wdg-dnd-dragging'); } catch {}
      }
      const roleId = drag.roleId;
      const vp = drag.visualParentId;
      const over = drag.overRoleId;
      const insertAfter = !!drag.insertAfter;

      drag.active = false;
      drag.pointerId = 0;
      drag.roleId = '';
      drag.visualParentId = '';
      drag.anchorId = '';
      drag.restrictToBlock = false;
      drag.startX = 0;
      drag.startY = 0;
      drag.moved = false;
      drag.overRoleId = '';
      drag.insertAfter = false;
      drag.draggingLi = null;

      clearHints();

      if (apply) __slotEditorSuppressClickUntil = Date.now() + 650;

      if (!apply) return;
      if (!roleId || !vp || !over) return;

      // Mais robusto: drop sempre faz troca (swap). Evita no-op por "lado" errado do card.
      const changed = swapVisualSiblings(vp, roleId, over);
      if (changed) {
        saveState();
        renderAll();
        toast('Ordem do organograma atualizada.', 'success');
      }
    };

    refs.orgPreview.addEventListener('pointerdown', (ev) => {
      if (!(ev.target instanceof HTMLElement)) return;
      if (ev.button != null && ev.button !== 0) return;

      // Não iniciar drag quando o usuário clicou no botão de editar slot
      try {
        if (ev.target.closest('.wdg-slot-editbtn')) return;
      } catch { /* noop */ }

      const li = ev.target.closest('li[data-role-id]');
      if (!li || !refs.orgPreview.contains(li)) return;
      if (li.dataset.wdgDnd !== '1') return;

      const roleId = String(li.getAttribute('data-role-id') || '').trim();
      const vp = String(li.getAttribute('data-visual-parent-id') || '').trim();
      if (!roleId || !vp) return;

      const role = getRole(roleId);
      if (!role || role.mandatory) return;

      drag.active = true;
      drag.pointerId = ev.pointerId;
      drag.roleId = roleId;
      drag.visualParentId = vp;
      drag.anchorId = getAnchorIdForRole(role) || '';
      drag.restrictToBlock = isHorizontalChildRole(role);
      drag.startX = ev.clientX;
      drag.startY = ev.clientY;
      drag.moved = false;
      drag.overRoleId = '';
      drag.insertAfter = false;
      drag.draggingLi = li;

      try { li.setPointerCapture(ev.pointerId); } catch {}
      try { ev.preventDefault(); } catch {}
    }, { passive: false });

    refs.orgPreview.addEventListener('pointermove', (ev) => {
      if (!drag.active) return;
      if (ev.pointerId !== drag.pointerId) return;

      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      const dist2 = (dx * dx) + (dy * dy);
      if (!drag.moved) {
        // Deadzone pequena para não disparar sem intenção
        if (dist2 < 16) return;
        drag.moved = true;
        if (drag.draggingLi) drag.draggingLi.classList.add('wdg-dnd-dragging');
      }

      try { ev.preventDefault(); } catch {}
      updateOver(ev.clientX, ev.clientY);
    }, { passive: false });

    refs.orgPreview.addEventListener('pointerup', (ev) => {
      if (!drag.active) return;
      if (ev.pointerId !== drag.pointerId) return;
      try { ev.preventDefault(); } catch {}
      endDrag(!!drag.moved);
    }, { passive: false });

    refs.orgPreview.addEventListener('pointercancel', (ev) => {
      if (!drag.active) return;
      if (ev.pointerId !== drag.pointerId) return;
      endDrag(false);
    });

    // Segurança extra: não deixar HTML5 DnD interferir
    refs.orgPreview.addEventListener('dragstart', (ev) => {
      try { ev.preventDefault(); } catch {}
    });
  }

  function wireOrgPreviewDnD(){
    if (!refs.orgPreview) return;
    if (refs.orgPreview.dataset.wdgDndBound === '1') return;
    refs.orgPreview.dataset.wdgDndBound = '1';

    const getTargetLi = (ev) => {
      try {
        // Em alguns navegadores o ev.target durante drag pode ser inconsistente (ghost image).
        // elementFromPoint tende a ser bem mais confiável.
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if (el && el.closest) {
          const li = el.closest('li[data-role-id]');
          if (li && refs.orgPreview.contains(li)) return li;
        }
      } catch {}

      const t = ev.target;
      if (t instanceof HTMLElement) {
        const li = t.closest('li[data-role-id]');
        if (li && refs.orgPreview.contains(li)) return li;
      }

      return null;
    };

    const findNearestDropLi = (ev) => {
      try {
        const cx = Number(ev.clientX);
        const cy = Number(ev.clientY);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

        const all = Array.from(refs.orgPreview.querySelectorAll('li[data-role-id]'));
        if (!all.length) return null;

        const candidates = all.filter(li => {
          const roleId = String(li.getAttribute('data-role-id') || '').trim();
          const vp = String(li.getAttribute('data-visual-parent-id') || '').trim();
          if (!roleId || !vp) return false;
          if (vp !== __previewDnd.visualParentId) return false;
          if (roleId === __previewDnd.roleId) return false;
          if (__previewDnd.restrictToBlock) {
            const overRole = getRole(roleId);
            const overAnchor = getAnchorIdForRole(overRole);
            if (!overAnchor || String(overAnchor) !== String(__previewDnd.anchorId)) return false;
          }
          return true;
        });

        let best = null;
        let bestD = Infinity;
        for (const li of candidates) {
          const card = li.querySelector('.wdg-orgcard');
          const rect = (card || li).getBoundingClientRect();
          const mx = rect.left + rect.width / 2;
          const my = rect.top + rect.height / 2;
          const dx = (cx - mx);
          const dy = (cy - my);
          const d = (dx * dx) + (dy * dy);
          if (d < bestD) {
            bestD = d;
            best = li;
          }
        }

        // Threshold: evita escolher algo muito distante quando o usuário está fora do organograma
        if (!best) return null;
        const maxDist = 520 * 520;
        if (bestD > maxDist) return null;
        return best;
      } catch {
        return null;
      }
    };

    refs.orgPreview.addEventListener('dragstart', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const li = t.closest('li[data-role-id]');
      if (!li) return;
      if (li.getAttribute('draggable') !== 'true') return;
      const roleId = String(li.getAttribute('data-role-id') || '').trim();
      const vp = String(li.getAttribute('data-visual-parent-id') || '').trim();
      if (!roleId || !vp) return; // não reordena raízes
      const role = getRole(roleId);
      if (!role || role.mandatory) return;

      __previewDnd.roleId = roleId;
      __previewDnd.visualParentId = vp;
      __previewDnd.overRoleId = '';
      __previewDnd.anchorId = getAnchorIdForRole(role) || '';
      // Se for filho horizontal, só permite movimentação dentro do bloco (não arrasta o bloco inteiro)
      __previewDnd.restrictToBlock = isHorizontalChildRole(role);
      li.classList.add('wdg-dnd-dragging');

      try {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', roleId);
        try { ev.dataTransfer.dropEffect = 'move'; } catch {}

        // Melhora UX: força um drag image pequeno, reduzindo "perda" do alvo
        try {
          const ghost = li.cloneNode(true);
          ghost.style.position = 'fixed';
          ghost.style.left = '-9999px';
          ghost.style.top = '-9999px';
          ghost.style.width = '240px';
          ghost.style.opacity = '0.85';
          ghost.style.pointerEvents = 'none';
          document.body.appendChild(ghost);
          ev.dataTransfer.setDragImage(ghost, 120, 40);
          setTimeout(() => { try { ghost.remove(); } catch {} }, 0);
        } catch {}
      } catch {}
    });

    refs.orgPreview.addEventListener('dragover', (ev) => {
      if (!__previewDnd.roleId) return;

      // Importante: sem preventDefault o drop falha (e dá a sensação de "ter que tentar várias vezes")
      try { ev.preventDefault(); } catch {}
      try { ev.dataTransfer.dropEffect = 'move'; } catch {}

      const li = getTargetLi(ev) || findNearestDropLi(ev);
      if (!li) return;
      const roleId = String(li.getAttribute('data-role-id') || '').trim();
      const vp = String(li.getAttribute('data-visual-parent-id') || '').trim();
      if (!roleId || !vp) return;
      if (vp !== __previewDnd.visualParentId) return;
      if (roleId === __previewDnd.roleId) return;

      if (__previewDnd.restrictToBlock) {
        const overRole = getRole(roleId);
        const overAnchor = getAnchorIdForRole(overRole);
        if (!overAnchor || String(overAnchor) !== String(__previewDnd.anchorId)) return;
      }

      __previewDnd.overRoleId = roleId;
      clearPreviewDndHints();
      li.classList.add('wdg-dnd-drop');
    });

    refs.orgPreview.addEventListener('drop', (ev) => {
      if (!__previewDnd.roleId) return;
      try { ev.preventDefault(); } catch {}

      const li = getTargetLi(ev) || findNearestDropLi(ev);

      // Se soltou no "vazio", usa o último alvo válido (muito mais tolerante)
      let targetRoleId = '';
      let vp = '';
      if (li) {
        targetRoleId = String(li.getAttribute('data-role-id') || '').trim();
        vp = String(li.getAttribute('data-visual-parent-id') || '').trim();
      } else {
        targetRoleId = String(__previewDnd.overRoleId || '').trim();
        vp = String(__previewDnd.visualParentId || '').trim();
      }

      if (!targetRoleId || !vp) return;
      if (vp !== __previewDnd.visualParentId) return;
      if (targetRoleId === __previewDnd.roleId) return;

      if (__previewDnd.restrictToBlock) {
        const overRole = getRole(targetRoleId);
        const overAnchor = getAnchorIdForRole(overRole);
        if (!overAnchor || String(overAnchor) !== String(__previewDnd.anchorId)) return;
      }

      ev.preventDefault();

      // decide esquerda/direita (antes/depois) pelo mouse
      let insertAfter = false;
      try {
        const li2 = li || (refs.orgPreview.querySelector(`li[data-role-id="${CSS && CSS.escape ? CSS.escape(targetRoleId) : targetRoleId}"]`));
        const card = li2 ? li2.querySelector('.wdg-orgcard') : null;
        const rect = card ? card.getBoundingClientRect() : (li2 ? li2.getBoundingClientRect() : null);
        if (!rect) throw new Error('no-rect');
        insertAfter = ev.clientX > (rect.left + rect.width / 2);
      } catch {}

      // Estratégia robusta: drop sempre troca posições (swap)
      const changed = swapVisualSiblings(vp, __previewDnd.roleId, targetRoleId);
      __previewDnd.roleId = '';
      __previewDnd.visualParentId = '';
      __previewDnd.overRoleId = '';
      __previewDnd.anchorId = '';
      __previewDnd.restrictToBlock = false;
      clearPreviewDndHints();

      if (changed) {
        saveState();
        renderAll();
        toast('Ordem do organograma atualizada.', 'success');
      }
    });

    refs.orgPreview.addEventListener('dragend', () => {
      __previewDnd.roleId = '';
      __previewDnd.visualParentId = '';
      __previewDnd.overRoleId = '';
      __previewDnd.anchorId = '';
      __previewDnd.restrictToBlock = false;
      clearPreviewDndHints();
    });
  }

  function toast(message, kind){
    try {
      if (document.body && document.body.classList.contains('wdg-print-org')) return;
      if (window.matchMedia && window.matchMedia('print').matches) return;
    } catch { /* noop */ }
    if (!refs.toastRoot) return;
    const type = String(kind || 'info');
    const klass = {
      success: 'alert-success',
      info: 'alert-primary',
      warning: 'alert-warning',
      danger: 'alert-danger'
    }[type] || 'alert-primary';

    const el = document.createElement('div');
    el.className = `alert ${klass} shadow-sm`;
    el.style.borderRadius = '14px';
    el.style.fontWeight = '800';
    el.style.marginBottom = '10px';
    el.textContent = message;

    refs.toastRoot.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .18s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, 2200);
  }

  function normalize(s){
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function slug(s){
    return normalize(s)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function escapeHtml(value){
    if (value == null) return '';
    return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] || c));
  }

  function getInitials(name){
    const clean = String(name || '').trim();
    if (!clean) return '';
    const parts = clean.split(/\s+/g).filter(Boolean);
    const first = parts[0]?.[0] || '';
    const last = (parts.length > 1 ? parts[parts.length - 1]?.[0] : '') || '';
    return (first + last).toUpperCase();
  }

  function hashString(input){
    const s = String(input || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function pickAvatarClass(seed){
    const variants = ['wdg-avatar--g1','wdg-avatar--g2','wdg-avatar--g3','wdg-avatar--g4','wdg-avatar--g5'];
    const idx = hashString(seed) % variants.length;
    return variants[idx];
  }

  function avatarHtml(user){
    const initials = getInitials(user?.nome) || '•';
    const seed = user?.id || user?.email || user?.nome || 'user';
    const cls = pickAvatarClass(seed);
    const photo = String(user?.fotoUrl || user?.avatarUrl || user?.foto || '').trim();

    if (photo) {
      const src = escapeHtml(photo);
      // onerror: marca falha e remove a img (libera o <span> de iniciais)
      return `
        <div class="wdg-avatar wdg-avatar--photo ${cls}" aria-hidden="true">
          <img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="try{this.closest('.wdg-avatar').classList.add('wdg-avatar--imgfail');}catch(e){};try{this.remove();}catch(e){}">
          <span>${escapeHtml(initials)}</span>
        </div>
      `.trim();
    }

    return `<div class="wdg-avatar ${cls}" aria-hidden="true"><span>${escapeHtml(initials)}</span></div>`;
  }

  function boot(){
    try { wireNav(); } catch { /* noop */ }
    try { wireActions(); } catch { /* noop */ }
    try { installPrintRedrawHook(); } catch { /* noop */ }
    try { initCondominioField(); } catch { /* noop */ }
    try { void refreshCanEditFromServer(); } catch { /* noop */ }
    try { updateInicioFillHeight(); } catch { /* noop */ }
  }

  try {
    // Script é carregado com o DOM pronto nesta tela, mas mantemos o boot resiliente.
    boot();
  } catch { /* noop */ }
})();
