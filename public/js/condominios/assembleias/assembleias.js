(function () {
  'use strict';

  // JS mínimo (placeholder): a lista é renderizada no servidor.
  // Pode ser expandido para paginação/ações em lote.
  const app = document.getElementById('assembleiasApp');
  if (!app) return;

  const basePath = String(app.getAttribute('data-base-path') || '/condominios').trim() || '/condominios';

  // Condomínio: mesma funcionalidade do campo em Nova Assembleia
  function qs(sel, el) {
    return (el || document).querySelector(sel);
  }

  function qsa(sel, el) {
    return Array.from((el || document).querySelectorAll(sel));
  }

  async function hydrateCondoSelect() {
    const sel = qs('[data-condo-select]', app);
    if (!sel) return;

    // Se já tem opções (além do placeholder), não mexe.
    try {
      const options = Array.from(sel.options || []);
      const hasRealOptions = options.some(o => String(o.value || '').trim());
      if (hasRealOptions) return;
    } catch { /* noop */ }

    let units = [];
    try {
      const r = await fetch(`${basePath}/api/unidades`, { credentials: 'same-origin' });
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) units = data;
    } catch { /* noop */ }

    const normalizeUnitCode = (v) => String(v || '').trim().toUpperCase();
    const findUnitIdByCode = (code) => {
      const c = normalizeUnitCode(code);
      if (!c) return '';
      const u = (units || []).find(x => normalizeUnitCode(x?.codigo) === c);
      return u && u._id ? String(u._id).trim() : '';
    };

    const labelFor = (u) => {
      const nome = String(u?.nome || '').trim();
      const razao = String(u?.razaoSocial || '').trim();
      const codigo = String(u?.codigo || '').trim();
      return nome || razao || codigo || String(u?._id || '').trim();
    };

    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Selecione';
    sel.appendChild(opt0);

    units.forEach((u) => {
      const id = String(u?._id || '').trim();
      if (!id) return;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = labelFor(u);
      sel.appendChild(opt);
    });

    let desired = '';
    try {
      const url = new URL(window.location.href);
      desired = String(url.searchParams.get('unidade_id') || url.searchParams.get('unidade') || url.searchParams.get('unidadeId') || '').trim();
    } catch { /* noop */ }
    if (!desired) desired = String(sel.getAttribute('data-selected-unidade-id') || '').trim();

    // Se veio um código (ex: M0000001) em vez do ObjectId, tenta mapear.
    if (desired && !/^[a-f0-9]{24}$/i.test(desired)) {
      const mapped = findUnitIdByCode(desired);
      if (mapped) desired = mapped;
    }

    const userUnit = String(app.getAttribute('data-user-unit') || '').trim();
    const firstRealId = String(units[0]?._id || '').trim();
    const toSelect = desired || (sel.disabled ? (userUnit || firstRealId) : (units.length === 1 ? firstRealId : ''));
    if (toSelect) {
      sel.value = toSelect;
      try { sel.setAttribute('data-selected-unidade-id', toSelect); } catch { /* noop */ }
    }

    syncCondoLogo(sel.value);
    applyUnidadeFilterToRows(sel.value);
  }

  function applyUnidadeFilterToRows(unidadeId) {
    const v = String(unidadeId || '').trim();
    const rows = Array.from(document.querySelectorAll('tr[data-assembleia-row="1"]'));
    if (!rows.length) return;

    // Sem filtro selecionado: não deve exibir itens.
    if (!v) {
      rows.forEach((r) => {
        try { r.style.display = 'none'; } catch { /* noop */ }
      });
      return;
    }

    rows.forEach((r) => {
      const rowUnit = String(r.getAttribute('data-unidade-id') || '').trim();
      const ok = rowUnit && rowUnit === v;
      try { r.style.display = ok ? '' : 'none'; } catch { /* noop */ }
    });
  }

  function syncCondoLogo(unidadeId) {
    const v = String(unidadeId || '').trim();
    const img = qs('[data-condo-inline-logo]', app);
    if (!img) return;
    const fallback = '/images/unidade.png';
    if (!v) {
      img.src = fallback;
      return;
    }
    img.src = `${basePath}/api/unidades/${encodeURIComponent(v)}/logo`;
    img.onerror = () => { try { img.onerror = null; img.src = fallback; } catch { /* noop */ } };
  }

  function updateUrlWithUnidade(unidadeId) {
    try {
      const v = String(unidadeId || '').trim();
      const url = new URL(window.location.href);
      if (v) url.searchParams.set('unidade_id', v);
      else url.searchParams.delete('unidade_id');
      // Troca de condomínio deve voltar para a primeira página.
      url.searchParams.delete('page');
      url.searchParams.delete('p');
      window.location.href = url.toString();
    } catch { /* noop */ }
  }

  const condoSel = qs('[data-condo-select]', app);
  if (condoSel) {
    try { hydrateCondoSelect(); } catch { /* noop */ }
    condoSel.addEventListener('change', () => {
      const v = String(condoSel.value || '').trim();
      try { condoSel.setAttribute('data-selected-unidade-id', v); } catch { /* noop */ }
      syncCondoLogo(v);
      // Fallback visual imediato (em caso de cache/CDN ou navegação bloqueada).
      applyUnidadeFilterToRows(v);
      updateUrlWithUnidade(v);
    });
  }

  // Ao carregar: se já vier HTML com várias unidades (cache/CDN), aplica o filtro da URL.
  try {
    const url = new URL(window.location.href);
    const u0 = String(url.searchParams.get('unidade_id') || '').trim();
    if (u0 && /^[a-f0-9]{24}$/i.test(u0)) applyUnidadeFilterToRows(u0);
  } catch { /* noop */ }

  // =============================
  // Layout: lista até o fim da página + paginação fixa
  // =============================
  function fitListHeightToViewport() {
    const block = document.getElementById('assembleiasListBlock') || document.querySelector('.wdg-roles-block');
    const wrap = (block && block.querySelector) ? block.querySelector('.wdg-roles-tablewrap') : document.querySelector('.wdg-roles-tablewrap');
    const pag = document.getElementById('assembleiasPager') || document.querySelector('#assembleiasPager');
    if (!block || !wrap) return;

    try {
      const rect = block.getBoundingClientRect();
      const pagH = pag ? pag.getBoundingClientRect().height : 0;
      const bottomGap = 16; // respiro até a borda inferior
      const available = Math.floor(window.innerHeight - rect.top - bottomGap);
      const desired = Math.max(220, available);
      block.style.height = desired + 'px';
      // tabela ocupa o restante, deixando paginação visível
      wrap.style.height = Math.max(160, desired - pagH) + 'px';
    } catch { /* noop */ }
  }

  try {
    fitListHeightToViewport();
    window.addEventListener('resize', () => {
      try { fitListHeightToViewport(); } catch { /* noop */ }
    });
  } catch { /* noop */ }

  // =============================
  // Pager (igual Dirigência > Configuração)
  // =============================
  function navigateToPage(nextPage, nextPerPage) {
    try {
      const url = new URL(window.location.href);
      const p = Math.max(1, parseInt(String(nextPage || '1'), 10) || 1);
      url.searchParams.set('page', String(p));
      url.searchParams.delete('p');
      if (nextPerPage) {
        url.searchParams.set('perPage', String(nextPerPage));
        url.searchParams.delete('pageSize');
        url.searchParams.delete('pagesize');
      }
      window.location.href = url.toString();
    } catch { /* noop */ }
  }

  (function wirePager() {
    const pager = document.getElementById('assembleiasPager');
    if (!pager) return;

    pager.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const btn = t.closest('[data-asm-page]');
      if (!btn) return;
      if (btn.hasAttribute('disabled')) return;
      const action = String(btn.getAttribute('data-asm-page') || '').trim();
      const page = parseInt(String(pager.getAttribute('data-page') || '1'), 10) || 1;
      const pages = parseInt(String(pager.getAttribute('data-pages') || '1'), 10) || 1;
      const perPage = parseInt(String(pager.getAttribute('data-per-page') || '10'), 10) || 10;

      if (action === 'first') return navigateToPage(1, perPage);
      if (action === 'prev') return navigateToPage(Math.max(1, page - 1), perPage);
      if (action === 'next') return navigateToPage(Math.min(pages, page + 1), perPage);
      if (action === 'last') return navigateToPage(pages, perPage);
    });

    pager.addEventListener('change', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      if (!t.matches('[data-asm-pagesize]')) return;
      const nextPerPage = parseInt(String(t.value || '10'), 10) || 10;
      // muda pageSize => volta para 1
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('perPage', String(nextPerPage));
        url.searchParams.delete('pageSize');
        url.searchParams.delete('pagesize');
        url.searchParams.delete('page');
        url.searchParams.delete('p');
        window.location.href = url.toString();
      } catch { /* noop */ }
    });
  })();

  let __assembleiaDeleteModal = null;
  let __deleteBound = false;

  function ensureDeleteModal() {
    const existing = document.getElementById('wdgAssembleiaDeleteModal');
    if (!existing) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="modal fade" id="wdgAssembleiaDeleteModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <form method="POST" data-assembleia-delete-form>
                <div class="modal-header">
                  <h5 class="modal-title">Excluir assembleia</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                </div>
                <div class="modal-body">
                  <div class="wdg-delete-question">Excluir definitivamente esta assembleia?</div>
                  <div class="small text-muted mt-2 text-center">Isso remove também documentos e arquivos gerados.</div>
                  <div class="mt-2 fw-semibold text-center" data-assembleia-delete-label></div>
                  <div class="small text-muted mt-2 text-center">Esta ação não pode ser desfeita.</div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                  <button type="submit" class="btn btn-danger" data-assembleia-delete-submit>Excluir</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);
    }

    if (!__assembleiaDeleteModal) {
      try {
        __assembleiaDeleteModal = new bootstrap.Modal(document.getElementById('wdgAssembleiaDeleteModal'));
      } catch {
        __assembleiaDeleteModal = null;
      }
    }

    if (!__deleteBound) {
      __deleteBound = true;
      const deleteForm = document.querySelector('#wdgAssembleiaDeleteModal [data-assembleia-delete-form]');
      if (deleteForm) {
        deleteForm.addEventListener('submit', () => {
          const submitBtn = deleteForm.querySelector('[data-assembleia-delete-submit]');
          try { submitBtn && submitBtn.setAttribute('disabled', 'disabled'); } catch {}
        });
      }
    }
  }

  // Click: abrir modal de exclusão
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;

    const btn = t.closest('[data-assembleia-delete="1"]');
    if (!btn) return;

    const assembleiaId = String(btn.getAttribute('data-assembleia-id') || '').trim();
    if (!assembleiaId) return;

    const label = String(btn.getAttribute('data-assembleia-label') || '').trim();

    ensureDeleteModal();
    if (!__assembleiaDeleteModal) return;

    const form = document.querySelector('#wdgAssembleiaDeleteModal [data-assembleia-delete-form]');
    if (form) {
      form.setAttribute('action', `${basePath}/assembleias/${encodeURIComponent(assembleiaId)}/excluir-definitivo`);
    }
    const labelEl = document.querySelector('#wdgAssembleiaDeleteModal [data-assembleia-delete-label]');
    if (labelEl) {
      labelEl.textContent = label ? label : '';
    }

    try { __assembleiaDeleteModal.show(); } catch {}
  });

  // =============================
  // Filtro por coluna (estilo Excel)
  // =============================

  const COLS = {
    data: 'Data',
    numero: 'Número',
    titulo: 'Título',
    natureza: 'Natureza',
    status: 'Status'
  };

  const colEls = {
    pop: document.getElementById('wdgColFilter'),
    title: document.getElementById('wdgColFilterTitle'),
    close: document.getElementById('wdgColFilterClose'),
    search: document.getElementById('wdgColFilterSearch'),
    all: document.getElementById('wdgColFilterAll'),
    list: document.getElementById('wdgColFilterList'),
    apply: document.getElementById('wdgColFilterApply'),
    cancel: document.getElementById('wdgColFilterCancel'),
    clear: document.getElementById('wdgColFilterClear')
  };

  const columnFilters = {
    data: null,
    numero: null,
    titulo: null,
    natureza: null,
    status: null
  };

  let activeCol = '';
  let activeColButton = null;

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeFilterValue(v) {
    const out = String(v ?? '').trim();
    if (out === '-') return '';
    return out;
  }

  function getAssembleiaRows() {
    const tbody = document.querySelector('#assembleiasTable tbody');
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr[data-assembleia-row="1"]'));
  }

  function valueForColumn(row, col) {
    const key = String(col || '');
    const cell = row ? row.querySelector(`[data-col="${CSS.escape(key)}"]`) : null;
    if (!cell) return '';
    return String(cell.textContent || '').trim();
  }

  function applyColumnFilters(rows, exceptCol) {
    const base = Array.isArray(rows) ? rows : [];
    const except = exceptCol ? String(exceptCol) : '';

    return base.filter((row) => {
      for (const col of Object.keys(COLS)) {
        if (except && col === except) continue;
        const set = columnFilters[col];
        if (!set || !(set instanceof Set) || set.size === 0) continue;
        const v = normalizeFilterValue(valueForColumn(row, col));
        if (!set.has(v)) return false;
      }
      return true;
    });
  }

  function uniqueValuesForColumn(rows, col) {
    const values = new Set();
    for (const row of (rows || [])) {
      values.add(normalizeFilterValue(valueForColumn(row, col)));
    }
    const arr = [...values];
    arr.sort((a, b) => {
      if (a === '' && b !== '') return 1;
      if (a !== '' && b === '') return -1;
      return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    });
    return arr;
  }

  function isFilterActive(col) {
    const set = columnFilters[String(col || '')];
    return !!(set && set instanceof Set && set.size > 0);
  }

  function updateFilterIcons() {
    document.querySelectorAll('.wdg-colfilter-btn').forEach((btn) => {
      const col = btn.getAttribute('data-col') || '';
      const icon = btn.querySelector('i');
      const active = isFilterActive(col);
      btn.classList.toggle('is-active', active);
      if (icon) icon.className = active ? 'bi bi-funnel-fill' : 'bi bi-filter';
    });
  }

  function ensureColFilterInBody() {
    if (!colEls.pop) return;
    if (colEls.pop.parentElement !== document.body) {
      document.body.appendChild(colEls.pop);
    }
  }

  function applyColFilterSearch() {
    if (!colEls.search || !colEls.list) return;
    const q = String(colEls.search.value || '').trim().toLowerCase();
    const items = colEls.list.querySelectorAll('.form-check');
    items.forEach((row) => {
      const lbl = row.querySelector('label');
      const txt = String(lbl?.textContent || '').toLowerCase();
      row.style.display = (!q || txt.includes(q)) ? '' : 'none';
    });
  }

  function updateColFilterAllCheckbox() {
    if (!colEls.all || !colEls.list) return;
    const checks = [...colEls.list.querySelectorAll('.wdg-colfilter-opt')];
    if (!checks.length) {
      colEls.all.checked = true;
      return;
    }
    colEls.all.checked = checks.every(c => c.checked);
  }

  function closeColFilter() {
    if (!colEls.pop) return;
    colEls.pop.hidden = true;
    colEls.pop.setAttribute('aria-hidden', 'true');
    activeCol = '';
    activeColButton = null;
  }

  function openColFilter(col, buttonEl) {
    if (!colEls.pop || !colEls.list || !colEls.all || !colEls.search) return;
    const colKey = String(col || '');
    if (!COLS[colKey]) return;

    ensureColFilterInBody();

    activeCol = colKey;
    activeColButton = buttonEl || null;

    const allRows = getAssembleiaRows();
    const base = applyColumnFilters(allRows, colKey);
    const values = uniqueValuesForColumn(base, colKey);

    if (colEls.title) colEls.title.textContent = `Filtro: ${COLS[colKey]}`;
    colEls.search.value = '';

    const currentSet = columnFilters[colKey];
    const isAll = !currentSet || !(currentSet instanceof Set) || currentSet.size === 0;

    colEls.list.innerHTML = values.map((v, idx) => {
      const id = `wdgColFilterOpt_${colKey}_${idx}`;
      const label = v === '' ? '(Vazios)' : v;
      const checked = isAll ? true : currentSet.has(v);
      return `
        <div class="form-check">
          <input class="form-check-input wdg-colfilter-opt" type="checkbox" id="${escapeHtml(id)}" data-value="${escapeHtml(v)}" ${checked ? 'checked' : ''}>
          <label class="form-check-label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
      `;
    }).join('');

    colEls.all.checked = true;

    const rect = (buttonEl && buttonEl.getBoundingClientRect) ? buttonEl.getBoundingClientRect() : null;
    const pop = colEls.pop;
    pop.hidden = false;
    pop.setAttribute('aria-hidden', 'false');

    const popRect = pop.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

    let left = 8;
    let top = 8;
    if (rect) {
      left = rect.left;
      top = rect.bottom + 6;
      left = Math.min(Math.max(8, left), vw - popRect.width - 8);
      const bottom = top + popRect.height;
      const viewportBottom = vh - 8;
      if (bottom > viewportBottom) {
        const tryTop = rect.top - popRect.height - 6;
        if (tryTop >= 8) top = tryTop;
      }
    }

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    updateColFilterAllCheckbox();
    applyColFilterSearch();
    try { colEls.search.focus(); } catch {}
  }

  function getColFilterCheckedValues() {
    if (!colEls.list) return [];
    const checks = colEls.list.querySelectorAll('.wdg-colfilter-opt');
    const out = [];
    checks.forEach((c) => {
      if (c && c.checked) {
        out.push(normalizeFilterValue(c.getAttribute('data-value')));
      }
    });
    return out;
  }

  function syncEmptyRow(visibleCount) {
    const tbody = document.querySelector('#assembleiasTable tbody');
    if (!tbody) return;
    const allRows = getAssembleiaRows();
    if (!allRows.length) return; // quando o servidor já retornou vazio

    let emptyRow = tbody.querySelector('tr[data-wdg-empty-row="1"]');
    if (!emptyRow) {
      emptyRow = document.createElement('tr');
      emptyRow.setAttribute('data-wdg-empty-row', '1');
      emptyRow.innerHTML = '<td colspan="6" class="text-center text-muted py-4">Nenhuma assembleia encontrada.</td>';
      tbody.appendChild(emptyRow);
    }
    emptyRow.style.display = (visibleCount === 0) ? '' : 'none';
  }

  function applyAndRenderRows() {
    const allRows = getAssembleiaRows();
    if (!allRows.length) return;

    const visible = applyColumnFilters(allRows);
    const visibleSet = new Set(visible);
    allRows.forEach((row) => {
      row.style.display = visibleSet.has(row) ? '' : 'none';
    });

    updateFilterIcons();
    syncEmptyRow(visible.length);
  }

  function initColumnFilters() {
    if (!colEls.pop) return;

    // abrir
    document.querySelectorAll('.wdg-colfilter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const col = btn.getAttribute('data-col');
        openColFilter(col, btn);
      });
    });

    // fechar
    colEls.close?.addEventListener('click', () => closeColFilter());
    colEls.cancel?.addEventListener('click', () => closeColFilter());

    // clicar fora
    document.addEventListener('pointerdown', (e) => {
      if (!colEls.pop || colEls.pop.hidden) return;
      const t = e.target;
      if (t && (colEls.pop.contains(t) || (activeColButton && activeColButton.contains && activeColButton.contains(t)))) return;
      closeColFilter();
    }, { capture: true });

    // ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && colEls.pop && !colEls.pop.hidden) closeColFilter();
    });

    // busca
    colEls.search?.addEventListener('input', () => applyColFilterSearch());

    // (Selecionar tudo)
    colEls.all?.addEventListener('change', () => {
      if (!colEls.list) return;
      const checks = colEls.list.querySelectorAll('.wdg-colfilter-opt');
      checks.forEach((c) => { c.checked = !!colEls.all.checked; });
    });

    // check individual
    colEls.list?.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('wdg-colfilter-opt')) {
        updateColFilterAllCheckbox();
      }
    });

    // aplicar
    colEls.apply?.addEventListener('click', () => {
      if (!activeCol) return;
      const checked = getColFilterCheckedValues();

      const allRows = getAssembleiaRows();
      const base = applyColumnFilters(allRows, activeCol);
      const allValues = uniqueValuesForColumn(base, activeCol);
      const isAll = checked.length === allValues.length;

      columnFilters[activeCol] = isAll ? null : new Set(checked);
      closeColFilter();
      applyAndRenderRows();
    });

    // limpar filtro da coluna
    colEls.clear?.addEventListener('click', () => {
      if (!activeCol) return;
      columnFilters[activeCol] = null;
      closeColFilter();
      applyAndRenderRows();
    });
  }

  try {
    initColumnFilters();
    updateFilterIcons();
    applyAndRenderRows();
  } catch {
    // noop
  }
})();
