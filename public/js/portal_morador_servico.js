(function () {
  const basePath = document.body?.dataset?.basePath || '/portal-morador';
  const habIdFromBody = document.body?.dataset?.habId || '';
  const habLabelFromBody = document.body?.dataset?.habLabel || '';

  const btnCancelar = document.getElementById('pmCancelarChamado');
  const formWrap = document.getElementById('pmFormWrap');
  const form = document.getElementById('pmServicoForm');
  const cardsWrap = document.getElementById('pmServicosCards');
  const emptyEl = document.getElementById('pmServicosEmpty');
  const countEl = document.getElementById('pmServicosCount');

  const pagerEl = document.getElementById('pmServicosPager');
  const btnPrev = document.getElementById('pmServicosPrev');
  const btnNext = document.getElementById('pmServicosNext');
  const pageInfoEl = document.getElementById('pmServicosPageInfo');

  const formTitleEl = document.getElementById('pmServicoFormTitle');
  const submitBtn = document.getElementById('pmServicoSubmit');
  const hiddenIdEl = document.getElementById('pmServicoId');
  const habLabelEl = document.getElementById('pmServicoHabLabel');
  const habInput = document.getElementById('pmServicoHab');
  const fotosInput = document.getElementById('pmFotos');
  const fotosCountEl = document.getElementById('pmFotosCount');
  const fotosPickBtn = document.getElementById('pmFotosPick');
  const fotosPreviewEl = document.getElementById('pmFotosPreview');

  const deleteConfirmModal = document.getElementById('pmDeleteConfirm');
  const deleteConfirmYes = document.getElementById('pmDeleteConfirmYes');
  const deleteConfirmNo = document.getElementById('pmDeleteConfirmNo');

  const notifBellBtn = document.querySelector('.pm-icon-btn[title="Notificações"]');

  const STATUS_CACHE_KEY = `pm-servicos-status:${habIdFromBody || 'all'}`;
  const UNREAD_FLAG_KEY = `${STATUS_CACHE_KEY}:unread`;
  const NOTIF_STORE_KEY = 'pm-servicos-notifs';
  const AUTO_REFRESH_MS = 45000;

  const urlParams = new URLSearchParams(window.location.search || '');
  let pendingFocusId = '';
  const notifParam = String(urlParams.get('notif') || '').trim();
  if (notifParam) {
    pendingFocusId = notifParam;
    try {
      urlParams.delete('notif');
      const cleanUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '') + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    } catch {
      /* noop */
    }
  } else if (window.location.hash && window.location.hash.indexOf('#notif-') === 0) {
    pendingFocusId = window.location.hash.replace('#notif-', '').trim();
  }

  const PAGE_SIZE = 6;
  let allItems = [];
  let page = 1;

  let statusCache = loadStatusCache();
  let unreadAccepted = getUnreadFlag();

  let editId = null;
  let editExistingFotos = 0;

  let previewUrls = [];
  let selectedFiles = [];

  let pendingDeleteResolve = null;

  if(habLabelEl){
    habLabelEl.textContent = habLabelFromBody || 'Habitação selecionada';
  }
  if(habInput){
    habInput.value = habIdFromBody || '';
  }

  function askDeleteConfirm() {
    if (!deleteConfirmModal || !deleteConfirmYes || !deleteConfirmNo) {
      return Promise.resolve(confirm('Tem certeza que deseja excluir esse chamado?'));
    }
    deleteConfirmModal.hidden = false;

    return new Promise((resolve) => {
      pendingDeleteResolve = resolve;
      try { deleteConfirmNo.focus(); } catch {}
    });
  }

  function closeDeleteConfirm(answer) {
    if (deleteConfirmModal) deleteConfirmModal.hidden = true;
    const resolve = pendingDeleteResolve;
    pendingDeleteResolve = null;
    if (typeof resolve === 'function') resolve(Boolean(answer));
  }

  deleteConfirmYes?.addEventListener('click', () => closeDeleteConfirm(true));
  deleteConfirmNo?.addEventListener('click', () => closeDeleteConfirm(false));

  function clampPage(p, totalPages) {
    const tp = Math.max(1, Number(totalPages || 1));
    const v = Number(p || 1);
    if (!Number.isFinite(v) || v < 1) return 1;
    if (v > tp) return tp;
    return Math.floor(v);
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '';
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function normalizeStatus(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (!s) return 'aberto';
    const cleaned = s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ');
    if (cleaned.includes('aceita') || cleaned.includes('aceito')) return 'aceita';
    if (cleaned.includes('rejeita') || cleaned.includes('recusad')) return 'rejeitada';
    if (cleaned.includes('andamento') || cleaned.includes('em andamento')) return 'andamento';
    if (cleaned.includes('concluido') || cleaned.includes('finalizado') || cleaned.includes('resolvido')) return 'concluido';
    return 'aberto';
  }

  function statusLabel(status) {
    switch (status) {
      case 'aceita': return 'Aceita';
      case 'rejeitada': return 'Rejeitada';
      case 'andamento': return 'Em andamento';
      case 'concluido': return 'Concluído';
      default: return 'Aberto';
    }
  }

  function toast(msg, variant) {
    const box = document.createElement('div');
    box.className = 'pm-toast ' + (variant ? `--${variant}` : '');
    box.textContent = msg;
    document.body.appendChild(box);
    setTimeout(() => {
      box.style.opacity = '0';
      box.style.transform = 'translateY(-12px)';
      setTimeout(() => box.remove(), 250);
    }, 4200);
  }

  function friendlyApiError(j, fallback) {
    const code = j?.code ? String(j.code) : '';
    if (code === 'DB_OFFLINE') {
      return j?.error || 'Banco de dados temporariamente indisponível. Tente novamente em instantes.';
    }
    return j?.error || j?.message || fallback;
  }

  function loadStatusCache() {
    try {
      const raw = localStorage.getItem(STATUS_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* noop */
    }
    return {};
  }

  function loadNotifStore() {
    try {
      const raw = localStorage.getItem(NOTIF_STORE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
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

  const SERVICO_TITLE_CACHE_KEY = 'pm_servico_title_cache_v1';

  function loadServicoTitleCache() {
    try {
      const raw = localStorage.getItem(SERVICO_TITLE_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
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
    const cache = loadServicoTitleCache();
    const byId = servicoId ? String(cache['id:' + String(servicoId).trim()] || '').trim() : '';
    if (byId) return byId;
    const byProto = proto ? String(cache['p:' + String(proto).trim()] || '').trim() : '';
    if (byProto) return byProto;
    return '';
  }

  function pushServiceNotification({ id, protocolo, message, assunto }) {
    const now = Date.now();
    const list = loadNotifStore();
    const proto = String(protocolo || id || '').trim();
    const title = proto ? `Solicitação ${proto}` : 'Solicitação de serviço';
    const msg = message || 'Foi aceita pelo condomínio. Você já pode acompanhar o andamento.';
    let subj = String(assunto || '').trim();
    if (!subj) {
      try { subj = getCachedServicoAssunto(proto, id); } catch { subj = ''; }
    }
    const item = {
      id: id || proto || `srv-${now}`,
      protocolo: proto,
      title,
      message: msg,
      assunto: subj,
      ts: now,
      read: false
    };

    // Evita duplicar a mesma notificação para o mesmo status.
    const exists = list.find((n) => n.id === item.id && n.protocolo === item.protocolo && n.message === item.message);
    if (!exists) {
      list.unshift(item);
      saveNotifStore(list.slice(0, 30));
    }
  }

  function saveStatusCache(map) {
    try {
      localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(map || {}));
    } catch {
      /* noop */
    }
  }

  function getUnreadFlag() {
    try {
      return localStorage.getItem(UNREAD_FLAG_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setUnreadFlag(value) {
    try {
      if (value) {
        localStorage.setItem(UNREAD_FLAG_KEY, '1');
      } else {
        localStorage.removeItem(UNREAD_FLAG_KEY);
      }
    } catch {
      /* noop */
    }
  }

  function setBellUnread(value) {
    if (!notifBellBtn) return;
    notifBellBtn.classList.toggle('has-unread', !!value);
  }

  function logPortalDiagFromResponse(r, op) {
    try {
      if (!r || !r.headers) return;
      const diag = {
        op: op || 'request',
        status: r.status,
        statusText: r.statusText,
        vercelId: r.headers.get('x-vercel-id'),
        portalDbMode: r.headers.get('x-portal-db-mode'),
        portalEffectiveSkipDb: r.headers.get('x-portal-effective-skipdb'),
        portalParentSkipDb: r.headers.get('x-portal-parent-skipdb'),
        portalSubAppSkipDb: r.headers.get('x-portal-subapp-skipdb'),
        portalMongoState: r.headers.get('x-portal-mongo-state'),
        portalMongoUriPresent: r.headers.get('x-portal-mongo-uri-present'),
        mongoState: r.headers.get('x-mongo-state'),
      };
      console.warn('[portal-morador] diag', diag);
    } catch { }
  }

  async function apiGetServicos() {
    const url = `${basePath}/api/servicos`;
    const opts = {
      cache: 'no-store',
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
      credentials: 'same-origin'
    };

    let r = await fetch(url, opts);
    // Alguns CDNs/browsers podem responder 304 e o fetch não expõe o body cacheado.
    // Nesse caso, refaz a chamada bypassando cache.
    if (r.status === 304) {
      r = await fetch(url, {
        ...opts,
        cache: 'reload',
        headers: { ...opts.headers, 'Cache-Control': 'no-cache' }
      });
    }
    if (!r.ok) {
      if (r.status === 503 || r.status >= 500) logPortalDiagFromResponse(r, 'GET /api/servicos');
      const j = await r.json().catch(() => null);
      const msg = friendlyApiError(j, 'Falha ao carregar chamados.');
      throw new Error(msg);
    }
    const j = await r.json();
    return Array.isArray(j?.data) ? j.data : [];
  }

  async function apiPostServico(formData) {
    const r = await fetch(`${basePath}/api/servicos`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'fetch'
      },
      credentials: 'same-origin',
      body: formData
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      if (r.status === 503 || r.status >= 500) logPortalDiagFromResponse(r, 'POST /api/servicos');
      const msg = friendlyApiError(j, 'Falha ao enviar solicitação.');
      throw new Error(msg);
    }
    return j;
  }

  async function apiPutServico(id, formData) {
    const r = await fetch(`${basePath}/api/servicos/${encodeURIComponent(String(id || ''))}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'fetch'
      },
      credentials: 'same-origin',
      body: formData
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      if (r.status === 503 || r.status >= 500) logPortalDiagFromResponse(r, 'PUT /api/servicos/:id');
      const msg = friendlyApiError(j, 'Falha ao editar solicitação.');
      throw new Error(msg);
    }
    return j;
  }

  async function apiDeleteServico(id) {
    const r = await fetch(`${basePath}/api/servicos/${encodeURIComponent(String(id || ''))}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'fetch'
      },
      credentials: 'same-origin'
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      if (r.status === 503 || r.status >= 500) logPortalDiagFromResponse(r, 'DELETE /api/servicos/:id');
      const msg = friendlyApiError(j, 'Falha ao excluir solicitação.');
      throw new Error(msg);
    }
    return j;
  }

  function getFotosRemaining() {
    const used = Math.max(0, Number(editExistingFotos || 0));
    return Math.max(0, 5 - used);
  }

  function setFotosCountText() {
    if (!fotosCountEl) return;
    const selected = selectedFiles.length;
    const remaining = getFotosRemaining();
    if (editId) {
      fotosCountEl.textContent = `${selected}/${remaining} novas (já existem ${editExistingFotos}/5)`;
      return;
    }
    fotosCountEl.textContent = `${selected}/5 selecionadas`;
  }

  function revokePreviewUrls() {
    try {
      for (const u of previewUrls) {
        try { URL.revokeObjectURL(u); } catch {}
      }
    } catch {}
    previewUrls = [];
  }

  function setInputFiles(files) {
    const list = Array.isArray(files) ? files : [];
    try {
      const dt = new DataTransfer();
      list.forEach((f) => dt.items.add(f));
      if (fotosInput) fotosInput.files = dt.files;
    } catch {
      // fallback: não consegue reatribuir
    }
  }

  function syncSelectedFilesToInput() {
    setInputFiles(selectedFiles);
  }

  function renderFotoPreviews() {
    if (!fotosPreviewEl) return;
    revokePreviewUrls();

    const files = selectedFiles.slice();
    if (!files.length) {
      fotosPreviewEl.innerHTML = '';
      return;
    }

    const html = files.map((f, idx) => {
      const url = URL.createObjectURL(f);
      previewUrls.push(url);
      return `
        <figure class="pm-upload-preview" data-idx="${idx}">
          <img src="${escapeHtml(url)}" alt="Prévia da foto ${idx + 1}">
          <button class="pm-upload-remove" type="button" data-remove="${idx}" aria-label="Remover foto" title="Remover">×</button>
        </figure>
      `;
    }).join('');

    fotosPreviewEl.innerHTML = html;
  }

  function forceLimitFiles(max) {
    try {
      const input = fotosInput;
      if (!input) return;
      const files = Array.from(input.files || []);
      if (files.length <= max) return;
      const dt = new DataTransfer();
      files.slice(0, max).forEach((f) => dt.items.add(f));
      input.files = dt.files;
    } catch {
      // se não der para reatribuir FileList, ao menos avisa
    }
  }

  function clampSelectedFiles(max) {
    if (!Number.isFinite(Number(max)) || max < 0) max = 0;
    if (selectedFiles.length <= max) return;
    selectedFiles = selectedFiles.slice(0, max);
  }

  function addFilesIncremental(newFiles, max) {
    const incoming = Array.isArray(newFiles) ? newFiles : [];
    if (!incoming.length) return;

    // evita duplicar ao re-selecionar o mesmo arquivo
    const keyOf = (f) => `${f?.name || ''}|${f?.size || 0}|${f?.lastModified || 0}`;
    const seen = new Set(selectedFiles.map(keyOf));

    for (const f of incoming) {
      if (!f) continue;
      const k = keyOf(f);
      if (seen.has(k)) continue;
      selectedFiles.push(f);
      seen.add(k);
      if (selectedFiles.length >= max) break;
    }
    clampSelectedFiles(max);
  }

  function setModeCreate() {
    editId = null;
    editExistingFotos = 0;
    selectedFiles = [];
    if (hiddenIdEl) hiddenIdEl.value = '';
    if (formTitleEl) formTitleEl.textContent = 'Novo chamado de serviço';
    if (submitBtn) submitBtn.textContent = 'Enviar solicitação';
    if (fotosInput) fotosInput.value = '';
    syncSelectedFilesToInput();
    revokePreviewUrls();
    if (fotosPreviewEl) fotosPreviewEl.innerHTML = '';
    setFotosCountText();
  }

  function setModeEdit(item) {
    const id = String(item?._id || '').trim();
    if (!id) return;
    editId = id;
    const fotos = Array.isArray(item?.fotos) ? item.fotos : [];
    editExistingFotos = fotos.length;
    selectedFiles = [];
    if (hiddenIdEl) hiddenIdEl.value = id;
    if (formTitleEl) formTitleEl.textContent = 'Editar chamado de serviço';
    if (submitBtn) submitBtn.textContent = 'Salvar alterações';
    if (fotosInput) fotosInput.value = '';
    syncSelectedFilesToInput();
    revokePreviewUrls();
    if (fotosPreviewEl) fotosPreviewEl.innerHTML = '';
    setFotosCountText();
    try { formWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  }

  function renderServicosPaged(items) {
    if (!cardsWrap || !emptyEl) return;

    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      allItems = [];
      page = 1;
      if (countEl) countEl.textContent = '';
      cardsWrap.innerHTML = '';
      emptyEl.hidden = false;
      if (pagerEl) pagerEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;

    allItems = list.slice();
    // Ordena do mais recente para o mais antigo quando houver data.
    try {
      allItems.sort((a, b) => {
        const da = new Date(a?.createdAt || a?.criado_em || a?.criadoEm || 0).getTime();
        const db = new Date(b?.createdAt || b?.criado_em || b?.criadoEm || 0).getTime();
        return (db || 0) - (da || 0);
      });
    } catch {}

    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = clampPage(page, totalPages);

    const start = (page - 1) * PAGE_SIZE;
    const slice = allItems.slice(start, start + PAGE_SIZE);

    if (countEl) {
      countEl.textContent = `${total} total · Página ${page}/${totalPages}`;
    }

    if (pagerEl) {
      pagerEl.hidden = totalPages <= 1;
    }
    if (pageInfoEl) {
      pageInfoEl.textContent = `Página ${page} de ${totalPages}`;
    }
    if (btnPrev) btnPrev.disabled = page <= 1;
    if (btnNext) btnNext.disabled = page >= totalPages;

    cardsWrap.innerHTML = slice.map((it) => {
      const apiId = String(it?._id || '').trim();
      const displayId = String(it?.protocolo || '').trim() || apiId;
      const titulo = escapeHtml(it?.titulo || '');
      const descricao = escapeHtml(it?.descricao || '');
      const status = normalizeStatus(it?.status || 'aberto');
      const criado = fmtDate(it?.createdAt || it?.criado_em || it?.criadoEm);
      const fotos = Array.isArray(it?.fotos) ? it.fotos : [];
      const fotosHtml = fotos.length
        ? `<div class="pm-servico-fotos">${fotos
            .slice(0, 5)
            .map((u) => {
              const url = escapeHtml(u);
              return `<a class="pm-servico-foto" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Foto do chamado"></a>`;
            })
            .join('')}</div>`
        : '';

      const iconDetalhe = `${basePath}/images/detalhe.png`;
      const iconEditar = `${basePath}/images/editar.png`;
      const iconExcluir = `${basePath}/images/excluir.png`;

      return `
        <article class="pm-servico-card" data-id="${escapeHtml(apiId)}">
          <div class="pm-servico-card-main">
            <div class="pm-servico-left">
              <div class="pm-servico-assunto">${titulo || '-'}</div>

              <div class="pm-servico-row">
                <span class="pm-servico-label">Nº da solicitação:</span>
                <span class="pm-servico-value">${escapeHtml(displayId || '-')}</span>
              </div>

              <div class="pm-servico-row">
                <span class="pm-servico-label">Data / Hora da solicitação:</span>
                <span class="pm-servico-value">${escapeHtml(criado || '-')}</span>
              </div>

              <div class="pm-servico-row pm-servico-row--desc">
                <span class="pm-servico-label">Descrição:</span>
                <span class="pm-servico-value pm-servico-desc-inline">${descricao || '-'}</span>
              </div>
            </div>

            <div class="pm-servico-right">
              <span class="pm-chip" data-status="${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>
              <div class="pm-servico-actions-icons">
                <button class="wdg-icon-btn" type="button" data-action="details" data-id="${escapeHtml(apiId)}" aria-label="Detalhes" title="Detalhes">
                  <img src="${escapeHtml(iconDetalhe)}" alt="Detalhes">
                </button>
                <button class="wdg-icon-btn" type="button" data-action="edit" data-id="${escapeHtml(apiId)}" aria-label="Editar" title="Editar">
                  <img src="${escapeHtml(iconEditar)}" alt="Editar">
                </button>
                <button class="wdg-icon-btn" type="button" data-action="delete" data-id="${escapeHtml(apiId)}" aria-label="Excluir" title="Excluir">
                  <img src="${escapeHtml(iconExcluir)}" alt="Excluir">
                </button>
              </div>
            </div>
          </div>

          <div class="pm-servico-details" hidden>
            ${fotosHtml}
          </div>
        </article>
      `;
    }).join('');

    tryFocusPendingCard();
  }

  function tryFocusPendingCard() {
    if (!pendingFocusId || !cardsWrap) return;
    const selectorId = pendingFocusId.replace(/"/g, '\\"');
    const card = cardsWrap.querySelector('[data-id="' + selectorId + '"]');
    if (!card) return;
    pendingFocusId = '';
    card.classList.add('pm-servico-highlight');
    try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    setTimeout(() => { card.classList.remove('pm-servico-highlight'); }, 2400);
  }

  function processStatusChanges(items) {
    const prev = statusCache || {};
    const next = {};
    let hasNewAccepted = false;

    for (const it of Array.isArray(items) ? items : []) {
      const id = String(it?._id || '').trim();
      if (!id) continue;
      const status = normalizeStatus(it?.status || 'aberto');
      next[id] = status;

      const proto = String(it?.protocolo || id).trim();
      if (status === 'aceita' && prev[id] && prev[id] !== 'aceita') {
        toast(`Solicitação ${proto || id} foi aceita pelo condomínio.`, 'success');
        pushServiceNotification({ id, protocolo: proto, assunto: it?.titulo });
        hasNewAccepted = true;
      }
      if (status === 'rejeitada' && prev[id] && prev[id] !== 'rejeitada') {
        const motivo = String(it?.rejeicao_motivo || it?.rejeitada_motivo || '').trim();
        const msg = motivo ? `Foi rejeitada: ${motivo}` : 'Foi rejeitada pelo condomínio.';
        toast(`Solicitação ${proto || id} foi rejeitada.`, 'warning');
        pushServiceNotification({ id, protocolo: proto, message: msg, assunto: it?.titulo });
        hasNewAccepted = true;
      }
    }

    statusCache = next;
    saveStatusCache(next);

    if (hasNewAccepted) {
      unreadAccepted = true;
      setUnreadFlag(true);
    }
    setBellUnread(unreadAccepted);
  }

  function rerenderPage() {
    renderServicosPaged(allItems);
  }

  async function refresh(opts = {}) {
    const silentErrors = !!opts.silentErrors;
    try {
      const items = await apiGetServicos();
      processStatusChanges(items);
      renderServicosPaged(items);
    } catch (e) {
      // Evita "sumir" com a lista existente em falhas temporárias (ex.: DB offline)
      try {
        if (Array.isArray(allItems) && allItems.length) {
          rerenderPage();
        } else {
          renderServicosPaged([]);
        }
      } catch {
        renderServicosPaged([]);
      }
      if (!silentErrors) {
        toast(e?.message || 'Falha ao carregar chamados.', 'warning');
      }
    }
  }

  btnCancelar?.addEventListener('click', () => {
    try {
      form?.reset();
      setModeCreate();
      const first = form?.querySelector('input, textarea, select');
      first && first.focus();
      if (formWrap) formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {}
  });

  fotosInput?.addEventListener('change', () => {
    const max = editId ? getFotosRemaining() : 5;
    const incoming = Array.from(fotosInput?.files || []);
    addFilesIncremental(incoming, max);
    syncSelectedFilesToInput();
    if (incoming.length && selectedFiles.length >= max && incoming.length > 1) {
      toast(`Limite de ${max} foto(s) atingido.`, 'warning');
    }
    if (fotosInput) fotosInput.value = '';
    setFotosCountText();
    renderFotoPreviews();
  });

  fotosPickBtn?.addEventListener('click', () => {
    try { fotosInput?.click(); } catch {}
  });

  fotosPreviewEl?.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('button[data-remove]');
    if (!btn) return;
    const idx = Number(btn.dataset.remove);
    if (!Number.isFinite(idx)) return;
    selectedFiles = selectedFiles.filter((_, i) => i !== idx);
    syncSelectedFilesToInput();
    setFotosCountText();
    renderFotoPreviews();
  });

  btnPrev?.addEventListener('click', () => {
    page = Math.max(1, page - 1);
    rerenderPage();
    try { cardsWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  });
  btnNext?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil((allItems.length || 0) / PAGE_SIZE));
    page = Math.min(totalPages, page + 1);
    rerenderPage();
    try { cardsWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const titulo = String(form.querySelector('#pmTitulo')?.value || '').trim();
    const descricao = String(form.querySelector('#pmDescricao')?.value || '').trim();
    const habitacaoId = String(habInput?.value || habIdFromBody || '').trim();
    const habitacaoNome = habLabelFromBody || '';

    if (!habitacaoId) {
      toast('Habitação não disponível. Refaça o login.', 'warning');
      return;
    }

    if (!titulo || !descricao) {
      toast('Preencha assunto e descrição.', 'warning');
      return;
    }

    const prevText = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }

    try {
      const fd = new FormData();
      fd.append('titulo', titulo);
      fd.append('descricao', descricao);
      fd.append('habitacao_id', habitacaoId);
      fd.append('habitacao_label', habitacaoNome);

      const remaining = editId ? getFotosRemaining() : 5;
      const files = selectedFiles.slice(0, remaining);
      files.forEach((f) => fd.append('fotos', f));

      if (editId) {
        await apiPutServico(editId, fd);
        toast('Chamado atualizado.', 'success');
      } else {
        await apiPostServico(fd);
        toast('Chamado inserido com sucesso!', 'success');
      }

      form.reset();
      setModeCreate();
      await refresh();
    } catch (e) {
      toast(e?.message || 'Falha ao enviar solicitação.', 'warning');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = prevText || (editId ? 'Salvar alterações' : 'Enviar solicitação');
      }
    }
  });

  cardsWrap?.addEventListener('click', async (ev) => {
    const btn = ev.target?.closest?.('button[data-action][data-id]');
    if (!btn) return;
    const action = String(btn.dataset.action || '');
    const id = String(btn.dataset.id || '').trim();
    if (!id) return;

    const item = allItems.find((it) => String(it?._id || '').trim() === id) || null;
    const card = btn.closest('.pm-servico-card');
    const detailsEl = card?.querySelector?.('.pm-servico-details');

    if (action === 'details') {
      if (detailsEl) {
        detailsEl.hidden = !detailsEl.hidden;
        try { card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
      }
      return;
    }

    if (action === 'edit') {
      if (!item) {
        toast('Chamado não encontrado.', 'warning');
        return;
      }
      try {
        form.querySelector('#pmTitulo').value = String(item?.titulo || '');
        form.querySelector('#pmDescricao').value = String(item?.descricao || '');
        setModeEdit(item);
        setFotosCountText();
      } catch {
        /* noop */
      }
      return;
    }

    if (action === 'delete') {
      const ok = await askDeleteConfirm();
      if (!ok) return;

      btn.disabled = true;
      try {
        await apiDeleteServico(id);
        if (editId === id) {
          try { form?.reset(); } catch {}
          setModeCreate();
        }
        toast('Chamado excluído com sucesso!', 'success');
        await refresh();
      } catch (e) {
        toast(e?.message || 'Falha ao excluir solicitação.', 'warning');
      } finally {
        btn.disabled = false;
      }
      return;
    }
  });

  setBellUnread(unreadAccepted);

  notifBellBtn?.addEventListener('click', () => {
    unreadAccepted = false;
    setUnreadFlag(false);
    setBellUnread(false);
  });

  setModeCreate();
  refresh();
  setInterval(() => refresh({ silentErrors: true }), AUTO_REFRESH_MS);
})();
