(function(){
  const basePath = document.body?.dataset?.basePath || '/portal-morador';
  const currentHabId = document.body?.dataset?.habId || '';
  const currentHabLabel = document.body?.dataset?.habLabel || 'Habitação selecionada';

  const triggers = Array.from(document.querySelectorAll('#pmHabSwitcher'));
  const labels = Array.from(document.querySelectorAll('#pmHabSwitcherLabel'));
  const portal = document.getElementById('pmHabSwitcherMenu');
  const grid = document.getElementById('pmHabMenuGrid');
  const pager = document.getElementById('pmHabMenuPager');
  const closeBtn = document.getElementById('pmHabMenuClose');
  if (!portal || !grid || !pager || !triggers.length) return;

  const PER_PAGE = 9;
  let items = [];
  let page = 0;
  let loading = false;
  let loaded = false;
  let submitting = false;

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function setLabels(text) {
    const val = text || 'Habitação selecionada';
    labels.forEach((el) => {
      if (!el) return;
      el.textContent = val;
      el.title = val;
    });
  }
  setLabels(currentHabLabel);

  function renderMessage(msg) {
    grid.innerHTML = `<div class="pm-hab-empty">${esc(msg || 'Nenhuma habitação encontrada.')}</div>`;
    pager.innerHTML = '';
  }

  async function loadData(force) {
    if (loading) return;
    if (loaded && !force) return;
    loading = true;
    try {
      const res = await fetch(`${basePath}/api/auth/context`, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (res.status === 401 || res.status === 403) {
        window.location.href = `${basePath}/login`;
        return;
      }
      const j = await res.json().catch(() => null);
      if (res.status === 409 && (j?.code === 'PORTAL_SELECTION_REQUIRED' || j?.error === 'PORTAL_SELECTION_REQUIRED')) {
        window.location.href = `${basePath}/login?step=select`;
        return;
      }
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Não foi possível carregar habitações.');

      const out = [];
      const unidades = Array.isArray(j?.unidades) ? j.unidades : [];
      unidades.forEach((u) => {
        const habs = Array.isArray(u?.habitacoes) ? u.habitacoes : [];
        habs.forEach((h) => {
          const id = String(h?.id || '').trim();
          const uniId = String(u?.id || '').trim();
          if (!id || !uniId) return;
          out.push({
            id,
            label: String(h?.label || 'Habitação').trim() || 'Habitação',
            unidadeId: uniId,
            unidadeNome: String(u?.nome || 'Condomínio').trim() || 'Condomínio',
            unidadeCodigo: String(u?.codigo || '').trim(),
            unidadeLogo: String(u?.logoUrl || '').trim()
          });
        });
      });
      if (!out.length) throw new Error('Nenhuma habitação encontrada para este usuário.');
      items = out;
      loaded = true;
    } finally {
      loading = false;
    }
  }

  function renderPager(totalPages) {
    const total = Math.max(1, totalPages);
    const disablePrev = page <= 0;
    const disableNext = page >= total - 1;
    pager.innerHTML = [
      `<button class="pm-hab-pager-btn" type="button" data-dir="-1" aria-label="Página anterior" ${disablePrev ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>`,
      `<span class="pm-hab-page-indicator" aria-live="polite">${page + 1} / ${total}</span>`,
      `<button class="pm-hab-pager-btn" type="button" data-dir="1" aria-label="Próxima página" ${disableNext ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>`
    ].join('');
  }

  function renderPage(nextPage) {
    const total = Math.max(1, Math.ceil(items.length / PER_PAGE));
    const targetPage = Number.isFinite(nextPage) ? nextPage : 0;
    page = Math.min(Math.max(0, targetPage), total - 1);
    const slice = items.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    while (slice.length < PER_PAGE) {
      slice.push(null);
    }
    if (!slice.length) {
      renderMessage('Nenhuma habitação encontrada.');
      return;
    }
    grid.innerHTML = slice.map((item) => {
      if (!item) {
        return '<div class="pm-hab-card pm-hab-card--empty" aria-hidden="true"></div>';
      }
      const meta = item.unidadeCodigo ? `${item.unidadeNome} · ${item.unidadeCodigo}` : item.unidadeNome;
      const selected = item.id === currentHabId;
      const logoSrc = item.unidadeLogo || `${basePath}/images/home.png`;
      return (
        `<button class="pm-hab-card" type="button" role="option" aria-selected="${selected}"` +
        ` data-hab="${esc(item.id)}" data-unidade="${esc(item.unidadeId)}" data-label="${esc(item.label)}" title="${esc(item.label)}">` +
        `  <span class="pm-hab-card__logo"><img src="${esc(logoSrc)}" alt=""></span>` +
        `  <span class="pm-hab-card__title">${esc(item.label)}</span>` +
        `  <span class="pm-hab-card__meta">${esc(meta)}</span>` +
        `</button>`
      );
    }).join('');
    renderPager(total);
  }

  async function openMenu() {
    if (!portal) return;
    portal.hidden = false;
    triggers.forEach((btn) => btn.setAttribute('aria-expanded', 'true'));
    renderMessage('Carregando habitações...');
    try {
      await loadData();
      renderPage(0);
    } catch (err) {
      renderMessage(err?.message || 'Não foi possível carregar habitações.');
    }
    document.addEventListener('keydown', handleKeydown);
  }

  function closeMenu() {
    portal.hidden = true;
    triggers.forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
    document.removeEventListener('keydown', handleKeydown);
  }

  function handleKeydown(ev) {
    if (ev.key === 'Escape') closeMenu();
  }

  async function selectHab(unidadeId, habId, label) {
    if (submitting) return;
    if (!unidadeId || !habId) return;
    submitting = true;
    try {
      const res = await fetch(`${basePath}/api/auth/selecionar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'fetch'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ unidade_id: unidadeId, habitacao_id: habId })
      });
      if (res.status === 401 || res.status === 403) {
        window.location.href = `${basePath}/login`;
        return;
      }
      const j = await res.json().catch(() => null);
      if (res.status === 409 && (j?.code === 'PORTAL_SELECTION_REQUIRED' || j?.error === 'PORTAL_SELECTION_REQUIRED')) {
        window.location.href = `${basePath}/login?step=select`;
        return;
      }
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Não foi possível trocar de habitação.');
      setLabels(label);
      closeMenu();
      window.location.reload();
    } catch (err) {
      renderMessage(err?.message || 'Não foi possível trocar de habitação.');
    } finally {
      submitting = false;
    }
  }

  triggers.forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (portal.hidden) openMenu();
      else closeMenu();
    });
  });

  closeBtn?.addEventListener('click', closeMenu);
  portal.addEventListener('click', (ev) => {
    if (ev.target === portal) closeMenu();
  });

  grid.addEventListener('click', (ev) => {
    const card = ev.target.closest('.pm-hab-card');
    if (!card || submitting) return;
    selectHab(card.dataset.unidade, card.dataset.hab, card.dataset.label);
  });

  pager.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-dir],[data-page]');
    if (!btn) return;
    if (btn.hasAttribute('data-page')) {
      const next = Number(btn.getAttribute('data-page')) || 0;
      renderPage(next);
      return;
    }
    const dir = Number(btn.getAttribute('data-dir')) || 0;
    renderPage(page + dir);
  });
})();
