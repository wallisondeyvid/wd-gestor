(function(){
  'use strict';

  const qs = (sel, root) => (root || document).querySelector(sel);

  const state = {
    nameResolve: null,
    nameReject: null,
    deleteResolve: null,
    deleteReject: null,
    validateFn: null,
  };

  function getModal(id){
    const el = document.getElementById(id);
    if (!el) return null;
    const bs = (window.bootstrap && window.bootstrap.Modal) ? window.bootstrap.Modal : null;
    if (!bs) return null;
    return { el, api: bs.getOrCreateInstance(el) };
  }

  function promptWithValidation(message, initialValue, validateFn){
    const maxAttempts = 3;
    let lastErr = '';
    for (let i = 0; i < maxAttempts; i++) {
      const hint = lastErr ? `\n\nErro: ${lastErr}` : '';
      const val = prompt(`${message}${hint}`, String(initialValue || ''));
      if (val == null) return null;
      const clean = String(val || '').trim();
      if (typeof validateFn === 'function') {
        const err = String(validateFn(clean) || '').trim();
        if (err) {
          lastErr = err;
          continue;
        }
      }
      return clean;
    }
    return null;
  }

  function showError(msg){
    const box = qs('#cargoModalError');
    if (!box) return;
    const m = String(msg || '').trim();
    if (!m) {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }
    box.textContent = m;
    box.style.display = 'block';
  }

  function syncCount(){
    const input = qs('#cargoNome');
    const out = qs('#cargoCharCount');
    if (!input || !out) return;
    out.textContent = String((input.value || '').length);
  }

  function focusInputSoon(){
    window.setTimeout(() => {
      try {
        const input = qs('#cargoNome');
        if (!input) return;
        input.focus();
        input.select();
      } catch {}
    }, 60);
  }

  function closeNameModal(answer){
    const { api } = getModal('modalCargoOrganograma') || {};
    try { api && api.hide(); } catch {}

    const resolve = state.nameResolve;
    state.nameResolve = null;
    state.nameReject = null;
    state.validateFn = null;

    if (resolve) resolve(answer);
  }

  function closeDeleteModal(answer){
    const { api } = getModal('modalExcluirCargoOrganograma') || {};
    try { api && api.hide(); } catch {}

    const resolve = state.deleteResolve;
    state.deleteResolve = null;
    state.deleteReject = null;

    if (resolve) resolve(!!answer);
  }

  function bindOnce(){
    if (window.__wdgCargoModalBound) return;
    window.__wdgCargoModalBound = true;

    const nameModalEl = document.getElementById('modalCargoOrganograma');
    const deleteModalEl = document.getElementById('modalExcluirCargoOrganograma');

    const okBtn = qs('#cargoModalOk');
    const cancelBtn = qs('#cargoModalCancel');
    const form = qs('#cargoModalForm');
    const input = qs('#cargoNome');

    okBtn && okBtn.addEventListener('click', () => {
      const val = String(input && input.value ? input.value : '').trim();
      if (!val) {
        showError('Informe um nome para o cargo.');
        focusInputSoon();
        return;
      }
      if (typeof state.validateFn === 'function') {
        const err = state.validateFn(val);
        if (err) {
          showError(String(err));
          focusInputSoon();
          return;
        }
      }
      showError('');
      closeNameModal(val);
    });

    cancelBtn && cancelBtn.addEventListener('click', () => closeNameModal(null));

    form && form.addEventListener('submit', (ev) => {
      try { ev.preventDefault(); } catch {}
      okBtn && okBtn.click();
    });

    input && input.addEventListener('input', () => {
      syncCount();
      showError('');
    });

    // Sugestões
    document.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const chip = t.closest('[data-cargo-suggest]');
      if (!chip) return;
      const v = String(chip.getAttribute('data-cargo-suggest') || '').trim();
      if (!v) return;
      if (input) {
        input.value = v;
        syncCount();
        showError('');
        focusInputSoon();
      }
    });

    // Fecha via X/backdrop => resolve null
    nameModalEl && nameModalEl.addEventListener('hidden.bs.modal', () => {
      if (state.nameResolve) closeNameModal(null);
    });

    const delOk = qs('#cargoDeleteOk');
    const delCancel = qs('#cargoDeleteCancel');
    delOk && delOk.addEventListener('click', () => closeDeleteModal(true));
    delCancel && delCancel.addEventListener('click', () => closeDeleteModal(false));

    deleteModalEl && deleteModalEl.addEventListener('hidden.bs.modal', () => {
      if (state.deleteResolve) closeDeleteModal(false);
    });
  }

  function openRoleNameModal(opts){
    bindOnce();

    const o = opts || {};
    const mode = String(o.mode || 'create');
    const title = qs('#cargoModalTitle');
    const subtitle = qs('#cargoModalSubtitle');
    const hint = qs('#cargoModalHint');
    const okBtn = qs('#cargoModalOk');
    const input = qs('#cargoNome');
    const suggestions = qs('#cargoSuggestions');

    if (title) title.textContent = (mode === 'edit') ? 'Editar cargo' : 'Novo cargo';
    if (subtitle) subtitle.textContent = (mode === 'edit')
      ? 'Atualize o nome do cargo. A hierarquia e os responsáveis permanecem.'
      : 'Crie um cargo para montar a hierarquia do organograma.';
    if (hint) hint.textContent = (mode === 'edit')
      ? 'Dica: mantenha um nome consistente com a hierarquia.'
      : 'Dica: use um nome claro e curto.';

    if (okBtn) okBtn.textContent = (mode === 'edit') ? 'Salvar' : 'Criar';

    // Sugestões só no modo criar
    if (suggestions) suggestions.style.display = (mode === 'edit') ? 'none' : 'flex';

    if (input) {
      input.value = String(o.initialValue || '');
      syncCount();
    }

    showError(String(o.initialError || ''));
    state.validateFn = (typeof o.validate === 'function') ? o.validate : null;

    const modal = getModal('modalCargoOrganograma');
    if (!modal) {
      try {
        console.warn('[cargoModal] bootstrap.Modal indisponível ou modal não encontrado; usando fallback prompt.');
      } catch {}

      const message = (mode === 'edit') ? 'Editar cargo:' : 'Nome do novo cargo:';
      const answer = promptWithValidation(message, String(o.initialValue || ''), (typeof o.validate === 'function') ? o.validate : null);
      return Promise.resolve(answer);
    }

    return new Promise((resolve, reject) => {
      state.nameResolve = resolve;
      state.nameReject = reject;
      try {
        modal.api.show();
      } catch {
        try {
          console.warn('[cargoModal] falha ao abrir modal; usando fallback prompt.');
        } catch {}
        const message = (mode === 'edit') ? 'Editar cargo:' : 'Nome do novo cargo:';
        resolve(promptWithValidation(message, String(o.initialValue || ''), (typeof o.validate === 'function') ? o.validate : null));
        return;
      }
      focusInputSoon();
    });
  }

  function confirmDeleteRole(opts){
    bindOnce();

    const o = opts || {};
    const name = String(o.roleName || '').trim() || 'Cargo';
    const label = qs('#cargoDeleteName');
    if (label) label.textContent = `"${name}"`;

    const modal = getModal('modalExcluirCargoOrganograma');
    if (!modal) {
      try {
        console.warn('[cargoModal] bootstrap.Modal indisponível ou modal de exclusão não encontrado; usando confirm().');
      } catch {}
      return Promise.resolve(confirm(`Apagar o cargo "${name}"?`));
    }

    return new Promise((resolve, reject) => {
      state.deleteResolve = resolve;
      state.deleteReject = reject;
      try {
        modal.api.show();
      } catch {
        resolve(confirm(`Apagar o cargo "${name}"?`));
        return;
      }
    });
  }

  // API global
  window.WDGCargoOrganograma = {
    openRoleNameModal,
    confirmDeleteRole,
  };
})();
