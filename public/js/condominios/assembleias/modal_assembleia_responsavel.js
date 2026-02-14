(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const modalEl = $('#modalPesquisarResponsavel');
  if (!modalEl) return;

  const appRoot = $('#novaAssembleiaApp');
  const basePath =
    (modalEl.getAttribute('data-bp') || '').trim() ||
    (appRoot && appRoot.getAttribute('data-base-path')) ||
    '/condominios';

  const formEl = modalEl.closest('form') || $('form.needs-validation') || $('form');
  const responsavelInput = formEl ? $('[name="responsavel"]', formEl) : null;
  const unidadeInput = formEl ? ($('[data-unidade-hidden]', formEl) || $('[name="unidade_id"]', formEl)) : null;

  const tipoRadios = $$('[data-resp-tipo]', modalEl);
  const searchEl = $('[data-resp-search]', modalEl);
  const refreshBtn = $('[data-resp-refresh]', modalEl);
  const scrollEl = $('[data-resp-scroll]', modalEl);
  const listEl = $('[data-resp-list]', modalEl);
  const hintEl = $('[data-resp-hint]', modalEl);
  const confirmBtn = $('[data-resp-confirm]', modalEl);

  const pickerWrap = $('[data-resp-picker-wrap]', modalEl);
  const outroWrap = $('[data-resp-outro]', modalEl);
  const outroNome = $('[data-outro-nome]', modalEl);
  const outroCpf = $('[data-outro-cpf]', modalEl);
  const outroEmail = $('[data-outro-email]', modalEl);
  const outroFuncao = $('[data-outro-funcao]', modalEl);

  let selected = null;
  let lastFetchAbort = null;
  let debTimer = null;
  let lastTipo = 'dirigentes';

  const normalizeStr = (value) => {
    const s = String(value || '').trim().toLowerCase();
    try {
      return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    } catch {
      return s;
    }
  };

  const getUnidadeId = () => {
    const v = unidadeInput ? String(unidadeInput.value || '').trim() : '';
    return v;
  };

  const getTipo = () => {
    const el = tipoRadios.find(r => r && r.checked);
    const v = el ? String(el.value || '').trim().toLowerCase() : '';
    if (v === 'outro') return 'outro';
    if (v === 'colaboradores') return 'colaboradores';
    if (v === 'condominos') return 'condominos';
    return 'dirigentes';
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

  const updateConfirmState = () => {
    if (!confirmBtn) return;
    const tipo = getTipo();
    if (tipo === 'outro') {
      const nome = String(outroNome?.value || '').trim();
      confirmBtn.disabled = !nome;
      return;
    }
    confirmBtn.disabled = !(selected && selected.nome);
  };

  const imgFallback = (img) => {
    try {
      const alt = String(img.getAttribute('data-alt-src') || '').trim();
      const primary = String(img.getAttribute('data-primary-src') || '').trim();
      if (!img.dataset.triedAlt && alt && !String(img.src || '').includes(alt)) {
        img.dataset.triedAlt = '1';
        img.src = alt;
        return;
      }
      if (!img.dataset.triedPrimary && primary && !String(img.src || '').includes(primary)) {
        img.dataset.triedPrimary = '1';
        img.src = primary;
        return;
      }
    } catch {
      /* noop */
    }
    img.onerror = null;
    img.src = '/images/usuario.png';
  };

  const encodeSafeUrl = (url) => {
    try {
      return encodeURI(String(url || '').trim());
    } catch {
      return String(url || '').trim();
    }
  };

  const buildAltFotoUrl = (email) => {
    const em = String(email || '').trim().toLowerCase();
    if (!em || !em.includes('@')) return '';
    return `${String(basePath || '').replace(/\/+$/, '')}/api/usuarios/foto?email=${encodeURIComponent(em)}&v=${Date.now()}`;
  };

  const renderList = (items) => {
    if (!listEl) return;
    listEl.innerHTML = '';

    const arr = Array.isArray(items) ? items : [];

    if (!arr.length) {
      const empty = document.createElement('div');
      empty.className = 'wdg-muted';
      empty.textContent = 'Nenhuma pessoa encontrada.';
      listEl.appendChild(empty);
      return;
    }

    arr.forEach((p) => {
      const pid = String(p?.id || '').trim();
      const nome = String(p?.nome || '').trim();
      const email = String(p?.email || '').trim();
      const subtitulo = String(p?.subtitulo || '').trim();
      const subtitulos = Array.isArray(p?.subtitulos) ? p.subtitulos : [];
      const fotoRaw = String(p?.foto || '').trim();

      const rowBtn = document.createElement('button');
      rowBtn.type = 'button';
      rowBtn.className = 'wdg-row-btn';

      const row = document.createElement('div');
      row.className = 'd-flex gap-2 align-items-start p-2 wdg-recipient-row';
      row.setAttribute('data-person-id', pid);

      const radioWrap = document.createElement('div');
      radioWrap.className = 'form-check mt-1';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'assembleia_responsavel_pick';
      radio.className = 'form-check-input';
      radio.checked = !!(selected && selected.id && selected.id === pid);
      radioWrap.appendChild(radio);

      const avatar = document.createElement('div');
      avatar.className = 'rounded-circle border bg-light';
      avatar.style.width = '38px';
      avatar.style.height = '38px';
      avatar.style.overflow = 'hidden';
      avatar.style.flex = '0 0 38px';

      const img = document.createElement('img');
      const primarySrc = fotoRaw ? encodeSafeUrl(fotoRaw) : '';
      const altSrc = buildAltFotoUrl(email);
      const initialSrc = primarySrc || altSrc || '/images/usuario.png';
      img.src = initialSrc;
      img.setAttribute('data-primary-src', primarySrc);
      img.setAttribute('data-alt-src', altSrc);
      img.alt = '';
      img.style.width = '38px';
      img.style.height = '38px';
      img.style.objectFit = 'cover';
      img.style.display = 'block';
      img.onerror = () => imgFallback(img);
      avatar.appendChild(img);

      const info = document.createElement('div');
      info.className = 'flex-grow-1';
      info.style.minWidth = '0';

      const nm = document.createElement('div');
      nm.className = 'fw-semibold';
      nm.textContent = nome || '-';
      info.appendChild(nm);

      const lines = [];
      if (Array.isArray(subtitulos) && subtitulos.length) {
        subtitulos.forEach((ln) => {
          const t = String(ln || '').trim();
          if (t) lines.push(t);
        });
      } else if (subtitulo) {
        lines.push(subtitulo);
      }

      lines.slice(0, 2).forEach((ln) => {
        const st = document.createElement('div');
        st.className = 'text-muted small';
        st.textContent = ln;
        info.appendChild(st);
      });

      if (email) {
        const em = document.createElement('div');
        em.className = 'text-muted small';
        em.textContent = email;
        info.appendChild(em);
      }

      row.appendChild(radioWrap);
      row.appendChild(avatar);
      row.appendChild(info);
      rowBtn.appendChild(row);

      const applySelection = () => {
        selected = { id: pid, nome, email, subtitulo: lines[0] || '', foto: primarySrc || altSrc || '' };
        $$('[data-person-id]', listEl).forEach((it) => it.classList.remove('wdg-selected'));
        row.classList.add('wdg-selected');
        $$('input[type="radio"][name="assembleia_responsavel_pick"]', listEl).forEach((r) => { r.checked = false; });
        radio.checked = true;
        updateConfirmState();
      };

      rowBtn.addEventListener('click', applySelection);
      radio.addEventListener('click', (ev) => {
        ev.stopPropagation();
        applySelection();
      });

      if (selected && selected.id && selected.id === pid) row.classList.add('wdg-selected');
      listEl.appendChild(rowBtn);
    });
  };

  const fetchPeople = async () => {
    const tipo = getTipo();
    lastTipo = tipo;

    if (tipo === 'outro') {
      setHint('');
      renderList([]);
      return;
    }

    const unidadeId = getUnidadeId();
    if (!unidadeId) {
      setHint('Selecione um condomínio para listar pessoas.', 'danger');
      renderList([]);
      return;
    }

    const q = String(searchEl?.value || '').trim();

    if (lastFetchAbort) {
      try { lastFetchAbort.abort(); } catch {}
    }
    lastFetchAbort = new AbortController();

    setHint('Carregando...');

    const url = `${String(basePath || '').replace(/\/+$/, '')}/assembleias/api/responsaveis?unidade_id=${encodeURIComponent(unidadeId)}&tipo=${encodeURIComponent(tipo)}&q=${encodeURIComponent(q)}&limit=120`;

    try {
      const r = await fetch(url, { cache: 'no-store', signal: lastFetchAbort.signal });
      if (!r.ok) {
        const msg = r.status === 403
          ? 'Você não tem permissão para listar pessoas dessa unidade.'
          : 'Falha ao carregar pessoas.';
        setHint(msg, 'danger');
        renderList([]);
        return;
      }
      const data = await r.json();
      setHint('');
      renderList(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      setHint('Erro de rede ao carregar pessoas.', 'danger');
      renderList([]);
    }
  };

  const applyTipoUi = () => {
    const tipo = getTipo();

    if (pickerWrap) pickerWrap.classList.toggle('d-none', tipo === 'outro');
    if (outroWrap) outroWrap.classList.toggle('d-none', tipo !== 'outro');

    selected = null;
    updateConfirmState();

    if (tipo !== 'outro') {
      fetchPeople();
      return;
    }

    try { outroNome && outroNome.focus(); } catch {}
  };

  const buildResponsavelText = (p) => {
    const nome = String(p?.nome || '').trim();
    const email = String(p?.email || '').trim();
    const sub = String(p?.subtitulo || '').trim();

    const parts = [];
    if (nome) parts.push(nome);
    if (sub) parts.push(sub);

    let s = parts.join(' - ').trim();
    if (email) s = `${s} <${email}>`;
    return s.trim();
  };

  const buildOutroText = () => {
    const nome = String(outroNome?.value || '').trim();
    const cpf = String(outroCpf?.value || '').trim();
    const email = String(outroEmail?.value || '').trim();
    const funcao = String(outroFuncao?.value || '').trim();

    let s = nome;
    if (funcao) s = `${s} - ${funcao}`;
    if (email) s = `${s} <${email}>`;
    if (cpf) s = `${s} (CPF ${cpf})`;
    return String(s || '').trim();
  };

  const confirmSelection = () => {
    if (!responsavelInput) return;
    const tipo = getTipo();

    if (tipo === 'outro') {
      const nome = String(outroNome?.value || '').trim();
      if (!nome) return;
      responsavelInput.value = buildOutroText();
      try { delete responsavelInput.dataset.responsavelFoto; } catch { /* noop */ }
    } else {
      if (!selected || !selected.nome) return;
      responsavelInput.value = buildResponsavelText(selected);
      try {
        const foto = String(selected?.foto || '').trim();
        if (foto) responsavelInput.dataset.responsavelFoto = foto;
        else delete responsavelInput.dataset.responsavelFoto;
      } catch { /* noop */ }
    }

    responsavelInput.dispatchEvent(new Event('input', { bubbles: true }));
    responsavelInput.dispatchEvent(new Event('change', { bubbles: true }));

    try {
      const inst = window.bootstrap && window.bootstrap.Modal
        ? window.bootstrap.Modal.getOrCreateInstance(modalEl)
        : null;
      if (inst) inst.hide();
    } catch {
      /* noop */
    }
  };

  // Eventos
  tipoRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (getTipo() === lastTipo) return;
      applyTipoUi();
    });
  });

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      if (getTipo() === 'outro') {
        updateConfirmState();
        return;
      }
      if (debTimer) clearTimeout(debTimer);
      debTimer = setTimeout(() => fetchPeople(), 260);
    });

    searchEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        fetchPeople();
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => fetchPeople());
  }

  [outroNome, outroCpf, outroEmail, outroFuncao].filter(Boolean).forEach((el) => {
    el.addEventListener('input', () => updateConfirmState());
  });

  if (confirmBtn) {
    confirmBtn.addEventListener('click', confirmSelection);
  }

  // Bootstrap: ao abrir, busca lista do tipo atual
  modalEl.addEventListener('shown.bs.modal', () => {
    applyTipoUi();
    if (getTipo() !== 'outro') {
      try { searchEl && searchEl.focus(); } catch {}
    }
  });
})();
