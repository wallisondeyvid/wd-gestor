(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const appRoot = $('#novaAssembleiaApp');
  const basePath = (appRoot && appRoot.getAttribute('data-base-path')) || '/condominios';

  const modalEl = $('#modalAssembleiaLocal');
  if (!modalEl) return;

  const formEl = modalEl.closest('form') || $('form.needs-validation') || $('form');
  const localInput = formEl ? $('[name="local"]', formEl) : null;
  const unidadeInput = formEl ? ($('[data-unidade-hidden]', formEl) || $('[name="unidade_id"]', formEl)) : null;

  const radioCondo = $('#assembleia_local_tipo_condo');
  const radioFora = $('#assembleia_local_tipo_fora');
  const wrapCondo = $('[data-assembleia-local-condo]', modalEl);
  const wrapFora = $('[data-assembleia-local-fora]', modalEl);

  const searchEl = $('[data-areas-search]', modalEl);
  const refreshBtn = $('[data-areas-refresh]', modalEl);
  const areasScrollEl = $('[data-areas-scroll]', modalEl);
  const listEl = $('[data-areas-list]', modalEl);
  const hintEl = $('[data-areas-hint]', modalEl);

  const enderecoResumoEl = $('#assembleia_local_endereco_resumo');
  const enderecoResumoHiddenEl = $('#endereco_resumo');
  const openEnderecoBtn = $('[data-open-endereco]', modalEl);

  const confirmBtn = $('[data-assembleia-local-confirm]', modalEl);

  let selectedArea = null;
  let lastFetchAbort = null;
  let lastQuery = '';

  const getUnidadeId = () => {
    const v = unidadeInput ? String(unidadeInput.value || '').trim() : '';
    return v;
  };

  const setHint = (text, kind = 'muted') => {
    if (!hintEl) return;
    const msg = String(text || '').trim();
    if (!msg) {
      hintEl.style.display = 'none';
      hintEl.textContent = '';
      hintEl.className = 'wdg-muted small mt-2';
      return;
    }
    hintEl.style.display = '';
    hintEl.textContent = msg;
    hintEl.className = `small mt-2 ${kind === 'danger' ? 'text-danger' : 'wdg-muted'}`;
  };

  const renderAreas = (areas) => {
    if (!listEl) return;
    listEl.innerHTML = '';

    // rolagem “premium”: só ativa quando passar de 6 itens
    const count = Array.isArray(areas) ? areas.length : 0;
    if (areasScrollEl) {
      if (count > 6) {
        // ~6 itens confortáveis (header é sticky dentro do wrapper)
        areasScrollEl.style.maxHeight = '372px';
      } else {
        areasScrollEl.style.maxHeight = '';
      }
    }

    if (!Array.isArray(areas) || !areas.length) {
      const empty = document.createElement('div');
      empty.className = 'wdg-muted';
      empty.textContent = 'Nenhuma área comum encontrada.';
      listEl.appendChild(empty);
      return;
    }

    areas.forEach((area) => {
      const id = area && (area._id || area.id) ? String(area._id || area.id) : '';
      const nome = area && area.nome ? String(area.nome) : '';
      const status = area && area.status_operacional ? String(area.status_operacional) : '';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-group-item list-group-item-action';
      btn.setAttribute('data-area-id', id);

      const row = document.createElement('div');
      row.className = 'wdg-area-row';

      const left = document.createElement('div');
      left.className = 'wdg-area-left d-flex flex-column';

      const title = document.createElement('div');
      title.className = 'fw-semibold';
      title.textContent = nome || '(sem nome)';

      const meta = document.createElement('div');
      meta.className = 'text-muted small';
      meta.textContent = area && area.codigo ? `Código: ${area.codigo}` : '';

      left.appendChild(title);
      if (meta.textContent) left.appendChild(meta);

      const right = document.createElement('div');
      right.className = 'wdg-area-right';

      const badge = document.createElement('span');
      badge.className = 'badge rounded-pill';
      const statusLower = status.toLowerCase();
      if (statusLower === 'inativa') {
        badge.classList.add('text-bg-secondary');
        badge.textContent = 'Inativa';
      } else if (statusLower === 'manutencao') {
        badge.classList.add('text-bg-warning');
        badge.textContent = 'Manutenção';
      } else if (statusLower === 'reservado') {
        badge.classList.add('text-bg-info');
        badge.textContent = 'Reservado';
      } else {
        badge.classList.add('text-bg-success');
        badge.textContent = 'Disponível';
      }

      right.appendChild(badge);

      row.appendChild(left);
      row.appendChild(right);
      btn.appendChild(row);

      if (selectedArea && selectedArea.id === id) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', () => {
        selectedArea = { id, nome, raw: area };
        $$('button.list-group-item', listEl).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        updateConfirmState();
      });

      listEl.appendChild(btn);
    });
  };

  const fetchAreas = async (term) => {
    const unidadeId = getUnidadeId();
    if (!unidadeId) {
      setHint('Selecione um condomínio para listar as áreas comuns.', 'danger');
      renderAreas([]);
      return;
    }

    const q = String(term || '').trim();
    lastQuery = q;

    if (lastFetchAbort) {
      try { lastFetchAbort.abort(); } catch {}
    }
    lastFetchAbort = new AbortController();

    setHint('Carregando áreas comuns...');

    const url = `${basePath}/api/areas-comuns/lista?unidade=${encodeURIComponent(unidadeId)}&q=${encodeURIComponent(q)}&limit=80`;
    try {
      const r = await fetch(url, { cache: 'no-store', signal: lastFetchAbort.signal });
      if (!r.ok) {
        const msg = r.status === 403
          ? 'Você não tem permissão para listar áreas dessa unidade.'
          : 'Falha ao carregar áreas comuns.';
        setHint(msg, 'danger');
        renderAreas([]);
        return;
      }
      const data = await r.json();
      setHint('');
      renderAreas(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      setHint('Erro de rede ao carregar áreas comuns.', 'danger');
      renderAreas([]);
    }
  };

  const getTipo = () => (radioFora && radioFora.checked ? 'fora' : 'condominio');

  const applyTipoUi = () => {
    const tipo = getTipo();
    if (wrapCondo) wrapCondo.classList.toggle('d-none', tipo !== 'condominio');
    if (wrapFora) wrapFora.classList.toggle('d-none', tipo !== 'fora');
    updateConfirmState();

    if (tipo === 'condominio') {
      if (searchEl && !searchEl.dataset.loadedOnce) {
        searchEl.dataset.loadedOnce = '1';
        fetchAreas('');
      }
    }
  };

  const updateConfirmState = () => {
    if (!confirmBtn) return;
    const tipo = getTipo();
    if (tipo === 'condominio') {
      confirmBtn.disabled = !(selectedArea && selectedArea.nome);
      return;
    }
    const resumo = enderecoResumoEl ? String(enderecoResumoEl.value || '').trim() : '';
    confirmBtn.disabled = !resumo;
  };

  const syncResumoFromHidden = () => {
    if (!enderecoResumoEl || !enderecoResumoHiddenEl) return;
    const v = String(enderecoResumoHiddenEl.value || '').trim();
    if (!v) return;
    if (String(enderecoResumoEl.value || '').trim() === v) return;
    enderecoResumoEl.value = v;
    enderecoResumoEl.dispatchEvent(new Event('input', { bubbles: true }));
    enderecoResumoEl.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const openEnderecoPopup = () => {
    // Mantém compatibilidade máxima com o popup legado (ele também tenta #endereco_resumo)
    const field = 'endereco_resumo';
    const url = `/endereco?field=${encodeURIComponent(field)}`;
    const w = 980;
    const h = 760;
    const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
    const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
    const features = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;

    const win = window.open(url, 'wdg_endereco_popup', features);
    if (!win) {
      alert('Não foi possível abrir o popup de endereço. Verifique o bloqueador de pop-ups.');
      return;
    }
    try { win.focus(); } catch {}

    // fallback: quando o popup fecha, sincroniza o valor (caso eventos não disparem)
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed > 5 * 60 * 1000) {
        clearInterval(timer);
        return;
      }
      if (win.closed) {
        clearInterval(timer);
        syncResumoFromHidden();
        updateConfirmState();
      }
    }, 250);
  };

  const confirmSelection = () => {
    if (!localInput) return;

    const tipo = getTipo();
    if (tipo === 'condominio') {
      if (!selectedArea || !selectedArea.nome) return;
      localInput.value = selectedArea.nome;
      localInput.dispatchEvent(new Event('input', { bubbles: true }));
      localInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const resumo = enderecoResumoEl ? String(enderecoResumoEl.value || '').trim() : '';
      if (!resumo) return;
      localInput.value = resumo;
      localInput.dispatchEvent(new Event('input', { bubbles: true }));
      localInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const bsModal = window.bootstrap && window.bootstrap.Modal ? window.bootstrap.Modal.getInstance(modalEl) : null;
    if (bsModal) bsModal.hide();
  };

  const debounce = (fn, ms = 250) => {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  // eventos
  if (radioCondo) radioCondo.addEventListener('change', applyTipoUi);
  if (radioFora) radioFora.addEventListener('change', applyTipoUi);

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => fetchAreas(searchEl ? searchEl.value : ''));
  }

  if (searchEl) {
    const onSearch = debounce(() => fetchAreas(searchEl.value), 320);
    searchEl.addEventListener('input', onSearch);
  }

  if (openEnderecoBtn) {
    openEnderecoBtn.addEventListener('click', openEnderecoPopup);
  }

  if (enderecoResumoEl) {
    enderecoResumoEl.addEventListener('input', updateConfirmState);
    enderecoResumoEl.addEventListener('change', updateConfirmState);
  }

  if (enderecoResumoHiddenEl) {
    const onHiddenUpdate = () => {
      syncResumoFromHidden();
      updateConfirmState();
    };
    enderecoResumoHiddenEl.addEventListener('input', onHiddenUpdate);
    enderecoResumoHiddenEl.addEventListener('change', onHiddenUpdate);
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', confirmSelection);
  }

  modalEl.addEventListener('show.bs.modal', () => {
    // reset suave
    setHint('');
    selectedArea = null;
    if (listEl) listEl.innerHTML = '';

    // não apagar endereço salvo (caso usuário abra/feche)
    // mas atualiza estado do botão
    applyTipoUi();

    // se o local atual já tem valor, deixa o fluxo mais natural
    const currentLocal = localInput ? String(localInput.value || '').trim() : '';
    if (currentLocal && enderecoResumoEl && !enderecoResumoEl.value) {
      // não tenta inferir se é área comum; só deixa visível para o usuário reaproveitar
      enderecoResumoEl.value = currentLocal;
    }

    // se o popup já escreveu algo no hidden, espelha pro campo do modal
    syncResumoFromHidden();
    updateConfirmState();
  });
})();
