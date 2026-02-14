(() => {
  const cfg = window.__WdgAssembleiaExecution || {};

  const cfgEl = document.getElementById('wdg-exec-config');
  const execRoot = document.getElementById('wdg-exec-root') || cfgEl?.closest('#wdg-exec-root') || document.getElementById('wdg-tabs')?.closest('.container-fluid') || null;
  const assembleiaId = cfg.assembleiaId || (cfgEl ? cfgEl.getAttribute('data-assembleia-id') : '');
  const apiBase = assembleiaId
    ? (cfg.apiBase || (`/condominios/api/assembleias/${encodeURIComponent(assembleiaId)}/execution`))
    : null;

  const el = (id) => document.getElementById(id);
  const show = (node) => node && node.classList.remove('d-none');
  const hide = (node) => node && node.classList.add('d-none');

  // logs temporários (habilite com: window.__WDG_DEBUG_PRESENCAS__ = true)
  const DEBUG_PRES = !!(window.__WDG_DEBUG_PRESENCAS__ || window.__WDG_DEBUG_PRESENCA__);
  const dbgPres = (...args) => {
    if (!DEBUG_PRES) return;
    try { console.log('[WDG Presenças]', ...args); } catch { /* noop */ }
  };

  const DEFAULT_HOME_ICON = '/images/home.png';

  const pick = (obj, keys) => {
    if (!obj) return '';
    for (const k of (keys || [])) {
      if (obj && obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
    }
    return '';
  };

  const formatHabitacaoFromItem = (it) => {
    if (!it) return '';
    const hab = it.habitacao || it.hab || it.unidadeHabitacao || it.habitacaoObj || null;
    const bloco = pick(hab || it, ['bloco', 'blocoNome', 'bloco_nome', 'bloco_name', 'torre', 'torreNome', 'torre_nome']);
    const andar = pick(hab || it, ['andar', 'andarNome', 'andar_nome', 'pavimento', 'pavimentoNome', 'pavimento_nome']);
    const tipo = pick(hab || it, ['tipo', 'tipoHabitacao', 'tipo_habitacao', 'tipoNome', 'tipo_nome', 'categoria', 'categoriaNome', 'categoria_nome']);
    const numero = pick(hab || it, ['numero', 'num', 'apto', 'apartamento', 'casa', 'unidade', 'unidadeNumero', 'unidade_numero', 'habitacaoNumero', 'habitacao_numero']);
    const parts = [];
    if (bloco) parts.push(/^bloco\b/i.test(bloco) ? bloco : `Bloco ${bloco}`);
    if (andar) parts.push(andar);
    if (tipo) {
      if (numero) parts.push(`${tipo} ${numero}`);
      else parts.push(tipo);
    } else if (numero) {
      parts.push(numero);
    }
    return parts.join(' - ').trim();
  };

  const getHabitationPickerDisplay = (it) => {
    const obj = (it && it.raw && typeof it.raw === 'object') ? it.raw : it;
    const formatted = formatHabitacaoFromItem(obj);
    if (formatted) {
      const segs = formatted.split(/\s+-\s+/g).map((p) => String(p || '').trim()).filter(Boolean);
      const cond = String((obj && (
        obj.condominioNome || obj.condominio_nome || obj.condominioName || obj.nomeCondominio || obj.nome_condominio ||
        obj.condominio || obj.unidadeNome || obj.unidade_nome || obj.unidade
      )) || '').trim();
      return {
        line1: cond || 'Condomínio',
        line2: segs.join(' - ')
      };
    }

    const rawLabel = String((obj && (obj.label || obj.nome || obj.name)) || '').trim();
    const parts = rawLabel.split(/\s+-\s+/g).map((p) => String(p || '').trim()).filter(Boolean);
    const cond2 = String((obj && (
      obj.condominioNome || obj.condominio_nome || obj.condominioName || obj.nomeCondominio || obj.nome_condominio ||
      obj.condominio || obj.unidadeNome || obj.unidade_nome || obj.unidade
    )) || '').trim();
    if (!parts.length) return { line1: (cond2 || 'Condomínio'), line2: '' };
    return { line1: (cond2 || 'Condomínio'), line2: parts.join(' - ') };
  };

  const shorten = (str, maxLen) => {
    const s = String(str || '');
    const n = Number(maxLen || 0);
    if (!n || s.length <= n) return s;
    if (n <= 3) return s.slice(0, n);
    return s.slice(0, n - 3) + '...';
  };

  const getHabitationTokenText = (hab) => {
    if (!hab) return '';
    const info = getHabitationPickerDisplay(hab);
    const line1 = String(info.line1 || 'Habitação').trim();
    const line2 = String(info.line2 || '').trim();
    const base = line2 ? `${line1} · ${line2}` : line1;
    return base;
  };

  const renderHabitationTokenHtml = (hab) => {
    if (!hab) return '';
    const info = getHabitationPickerDisplay(hab);
    const line1 = escapeHtml(String(info.line1 || 'Habitação').trim() || 'Habitação');
    const line2Raw = String(info.line2 || '').trim();
    const line2 = line2Raw ? escapeHtml(line2Raw) : '';
    return `<span class="wdg-pres-token-body">`
      + `<span class="wdg-pres-token-line1">${line1}</span>`
      + (line2 ? `<span class="wdg-pres-token-line2">${line2}</span>` : '')
      + `</span>`;
  };

  const parseBoolish = (v) => {
    if (v === true) return true;
    if (v === false) return false;
    if (v == null) return false;
    if (typeof v === 'number') return v === 1;
    const s = String(v).trim().toLowerCase();
    if (!s) return false;
    if (['1', 'true', 't', 'sim', 's', 'yes', 'y'].includes(s)) return true;
    if (['0', 'false', 'f', 'nao', 'não', 'n', 'no'].includes(s)) return false;
    // status text
    if ((s.includes('nao') || s.includes('não')) && s.includes('inad')) return false;
    if (s.includes('inad')) return true;
    if (s.includes('adimpl') || s.includes('regular') || s.includes('ok')) return false;
    return false;
  };

  const parseInadimplente = (h) => {
    if (!h) return false;
    if (typeof h.inadimplente === 'boolean') return h.inadimplente;
    if (h.inadimplente != null) return parseBoolish(h.inadimplente);
    if (h.adimplente != null) return !parseBoolish(h.adimplente);
    const st = String(h.statusFinanceiro || h.situacaoFinanceira || h.financeiroStatus || h.inadimplenciaStatus || h.status || '').trim();
    if (!st) return false;
    return parseBoolish(st);
  };

  const isDev = (() => {
    try {
      if (DEBUG_PRES) return true;
      if (cfg && (cfg.dev || cfg.isDev)) return true;
      const h = String(location.hostname || '').toLowerCase();
      return h === 'localhost' || h === '127.0.0.1';
    } catch {
      return false;
    }
  })();

  const onDomReady = (fn) => {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn, { once: true });
      } else {
        fn();
      }
    } catch {
      try { fn(); } catch { /* noop */ }
    }
  };

  onDomReady(() => {
    try { console.info('[exec] assembleia-execution.js ativo', { path: location.pathname, ts: Date.now() }); } catch { /* noop */ }

    if (!isDev) return;

    try {
      const tab = document.getElementById('wdg-tab-presencas');
      if (!tab) return;
      if (document.getElementById('wdg-badge-exec-js-ativo')) return;
      const h5 = tab.querySelector('h5');
      if (!h5) return;
      const badge = document.createElement('span');
      badge.id = 'wdg-badge-exec-js-ativo';
      badge.className = 'badge text-bg-success ms-2 align-middle';
      badge.textContent = 'Execução JS ativo';
      h5.appendChild(badge);
    } catch { /* noop */ }
  });

  const errorBox = el('wdg-error');
  const successBox = el('wdg-success');

  const setMsg = (box, msg) => {
    if (!box) return;
    if (!msg) {
      hide(box);
      box.textContent = '';
      return;
    }
    box.textContent = String(msg);
    show(box);
  };

  const flashSuccess = (msg) => {
    setMsg(errorBox, '');
    setMsg(successBox, msg);
    setTimeout(() => setMsg(successBox, ''), 2500);
  };

  const flashError = (msg) => {
    setMsg(successBox, '');
    setMsg(errorBox, msg);
  };

  const fmtMs = (ms) => {
    if (ms == null || Number.isNaN(ms)) return '—';
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const safeJson = async (res) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: text || res.statusText };
    }
  };

  const api = async (path, opts = {}) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin'
    });

    const data = await safeJson(res);
    if (!res.ok || data?.ok === false) {
      const msg = data?.error || data?.message || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return data;
  };

  const state = {
    tab: 'sessao',
    timer: null,
    pollingMs: 1500,
    lastStatus: null,
    executionData: null,
    inFlight: false,
    outrosPresentes: [],
    currentDocPresenceId: null,
    pendingPinPresenceId: null
  };

  const getBackendPresences = () => {
    const s = state.executionData || state.lastStatus?.data || state.lastStatus || null;
    const arr = s?.presences;
    return Array.isArray(arr) ? arr : [];
  };

  const setActiveTab = (tab) => {
    state.tab = tab;

    const tabs = (execRoot || document).querySelectorAll('#wdg-tabs [data-tab]');
    tabs.forEach((btn) => {
      const isActive = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('active', isActive);
      try { btn.setAttribute('aria-selected', isActive ? 'true' : 'false'); } catch { /* noop */ }
    });

    const panels = (execRoot || document).querySelectorAll('.wdg-tab');
    panels.forEach((panel) => hide(panel));

    const panel = el(`wdg-tab-${tab}`);
    show(panel);

    // URL state
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', tab);
      window.history.replaceState({}, '', u.toString());
    } catch { /* noop */ }
  };

  const renderEvents = (events) => {
    const box = el('wdg-exec-events');
    if (!box) return;
    if (!events || !events.length) {
      box.textContent = '(sem eventos)';
      return;
    }
    const lines = events
      .slice()
      .reverse()
      .map((ev) => {
        const at = ev?.at ? new Date(ev.at).toLocaleString('pt-BR') : '—';
        const type = ev?.type || 'event';
        const msg = ev?.message || '';
        return `[${at}] ${type} ${msg}`.trim();
      });
    box.textContent = lines.join('\n');
  };

  const renderPresences = (presences) => {
    const tbody = el('wdg-presences-body');
    if (!tbody) return;

    const reps = Array.isArray(presences)
      ? presences
      : getBackendPresences();
    state.lastRenderedPresences = reps;

    const presVisible = reps.filter((p) => !p?.isRemoved);
    const outrosVisible = (Array.isArray(state.outrosPresentes) ? state.outrosPresentes : []).filter((o) => o && o.nome);

    if (!presVisible.length && !outrosVisible.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-muted">Nenhuma presença registrada.</td></tr>';
      return;
    }

    const mapTipoOutro = (t) => {
      const s = String(t || '').trim().toLowerCase();
      if (s === 'morador') return 'Morador';
      if (s === 'dirigente') return 'Dirigente';
      if (s === 'colaborador') return 'Colaborador';
      return 'Outros';
    };

    const fmtRepTipo = (tipoRaw) => {
      const s = String(tipoRaw || '').trim();
      if (s === 'proprietario') return 'Proprietário';
      if (s === 'inquilino_autorizado') return 'Inquilino autorizado';
      if (s === 'procurador') return 'Procurador';
      return s || '—';
    };

    const presRows = presVisible
      .slice()
      .sort((a, b) => String(a.habitacaoLabel || a.key || '').localeCompare(String(b.habitacaoLabel || b.key || '')))
      .map((p) => {
        const id = String(p.id || p.presenceId || p.key || '');
        const hab = String(p.habitacaoLabel || p.habitacaoId || p.key || '');
        const nome = String(p.participanteNome || p.nome || '');
        const role = String(p.presence_role || p.role || 'REPRESENTANTE').trim().toUpperCase();
        const representacao = role === 'NAO_REPRESENTANTE' ? 'Não' : 'Sim';
        const tipo = fmtRepTipo(p.participanteTipo);
        const status = String(p.status || '').trim();
        const statusNorm = status.toUpperCase();
        const statusLabel = (() => {
          if (statusNorm === 'PENDING_MODERATOR') return 'Pendente (moderador)';
          if (statusNorm === 'PENDING_PARTICIPANT') return 'Pendente (participante)';
          if (statusNorm === 'CONFIRMED') return 'Confirmada';
          if (statusNorm === 'REJECTED') return 'Recusada';
          if (statusNorm === 'CANCELED') return 'Cancelada';
          return status;
        })();
        const frac = p.fracaoIdeal != null ? fmtPercent(Number(p.fracaoIdeal) || 0) : '';
        const docMeta = p?.docs?.procuracao || null;
        const hasDoc = !!docMeta;
        const docName = hasDoc ? String(docMeta.nomeArquivo || '') : '';
        const badge = `<span class="wdg-pres-badge" data-variant="${escapeHtml(statusNorm || status)}">${escapeHtml(statusLabel || status)}</span>`;

        const canVote = (role === 'REPRESENTANTE' && (statusNorm === 'CONFIRMED' || statusNorm === 'APROVADO' || statusNorm === 'CONFIRMADO')) && (p.canVote !== false) && p.isVotante !== false;
        const votantePill = canVote
          ? `<span class="wdg-pres-pill" data-variant="votante">Votante</span>`
          : `<span class="wdg-pres-pill" data-variant="nao_votante" title="${escapeHtml(String(p.motivoNaoVotante || ''))}">Não votante</span>`;

        let inadPill = '';
        if (p.inadimplente) {
          const variant = String(p.voteRestriction || '') === 'BLOQUEIA_VOTO'
            ? 'inadimplente_bloqueia_voto'
            : 'inadimplente_aviso';
          const txt = variant === 'inadimplente_bloqueia_voto' ? 'Inadimplente (voto bloqueado)' : 'Inadimplente (aviso)';
          inadPill = `<span class="wdg-pres-pill" data-variant="${variant}">${escapeHtml(txt)}</span>`;
        }

        const metaLine = hasDoc
          ? `<div class="small text-muted"><span class="wdg-pres-docname" title="${escapeHtml(docName)}">${escapeHtml(docName)}</span></div>`
          : (String(p.participanteTipo || '') !== 'proprietario' ? `<div class="small text-muted">(sem doc)</div>` : '');

        const actions = `
          <span class="wdg-pres-row-actions">
            ${statusNorm === 'PENDING_MODERATOR' ? `<button class="btn btn-sm btn-success" type="button" data-pres-action="confirmar_moderador" data-pres-id="${escapeHtml(id)}">Confirmar solicitação</button>` : ''}
            ${statusNorm === 'PENDING_PARTICIPANT' ? `<button class="btn btn-sm btn-outline-primary" type="button" data-pres-action="confirmar_pin" data-pres-id="${escapeHtml(id)}">Confirmar presença (PIN)</button>` : ''}
            <button class="btn btn-sm btn-outline-secondary" type="button" data-pres-action="ver_doc" data-pres-id="${escapeHtml(id)}">${hasDoc ? 'Ver doc' : 'Anexar doc'}</button>
          </span>`;

        return `<tr>
          <td class="text-nowrap">${escapeHtml(hab)}</td>
          <td>${escapeHtml(nome)}${metaLine}</td>
          <td class="text-nowrap">${representacao}</td>
          <td class="text-nowrap">${escapeHtml(tipo)}</td>
          <td class="text-nowrap">
            <div class="d-flex flex-wrap gap-1 align-items-center justify-content-center">
              ${badge}
              ${votantePill}
              ${inadPill}
            </div>
          </td>
          <td class="text-nowrap">${escapeHtml(frac)}</td>
          <td>${actions}</td>
        </tr>`;
      });

    const outrosRows = outrosVisible
      .slice()
      .sort((a, b) => {
        const ha = String(a.habitacaoLabel || '').trim();
        const hb = String(b.habitacaoLabel || '').trim();
        if (ha && hb && ha !== hb) return ha.localeCompare(hb);
        if (ha && !hb) return -1;
        if (!ha && hb) return 1;
        return String(a.nome || '').localeCompare(String(b.nome || ''));
      })
      .map((o) => {
        const id = escapeHtml(String(o.id || ''));
        const hab = escapeHtml(String(o.habitacaoLabel || '—'));
        const nome = escapeHtml(String(o.nome || ''));
        const tipo = mapTipoOutro(o.tipo);
        const representacao = 'Não';

        const meta = [
          (o.cpf ? `CPF: ${String(o.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : ''),
          (o.email ? `E-mail: ${String(o.email)}` : ''),
          (o.obs ? `Obs: ${String(o.obs)}` : '')
        ].filter(Boolean).join(' • ');
        const title = meta ? escapeHtml(meta) : '';

        const actions = `
          <span class="wdg-pres-row-actions">
            <button class="btn btn-sm btn-outline-secondary" type="button" data-outro-action="remover" data-outro-id="${id}">Remover</button>
          </span>`;

        return `<tr>
          <td class="text-nowrap">${hab}</td>
          <td title="${title}">${nome}</td>
          <td class="text-nowrap">${representacao}</td>
          <td class="text-nowrap">${escapeHtml(tipo)}</td>
          <td class="text-nowrap">—</td>
          <td class="text-nowrap">—</td>
          <td>${actions}</td>
        </tr>`;
      });

    tbody.innerHTML = [...presRows, ...outrosRows].join('');

    tbody.querySelectorAll('[data-pres-action][data-pres-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = String(btn.getAttribute('data-pres-action') || '');
        const id = String(btn.getAttribute('data-pres-id') || '');
        onPresenceAction({ action, id });
      });
    });

    tbody.querySelectorAll('[data-outro-action="remover"][data-outro-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = String(btn.getAttribute('data-outro-id') || '').trim();
        if (!id) return;
        state.outrosPresentes = (Array.isArray(state.outrosPresentes) ? state.outrosPresentes : []).filter((x) => String(x?.id) !== id);
        renderPresences(state.lastRenderedPresences);
        persistLocal();
      });
    });
  };

  const normalizeOutro = (o) => {
    const tipoRaw = String(o?.tipo || '').trim().toLowerCase();
    const tipo = (tipoRaw === 'morador' || tipoRaw === 'colaborador' || tipoRaw === 'dirigente' || tipoRaw === 'outros')
      ? tipoRaw
      : 'outros';
    const cpfDigits = String(o?.cpf || '').replace(/\D/g, '').slice(0, 11);
    const email = String(o?.email || '').trim();
    const obs = String(o?.obs || '').trim();
    const pessoaId = String(o?.pessoaId || '').trim();
    const nome = String(o?.nome || '').trim();
    const habitacaoId = String(o?.habitacaoId || o?.habitacao_id || '').trim();
    const habitacaoLabel = String(o?.habitacaoLabel || o?.habitacao_label || '').trim();
    return {
      id: String(o?.id || genId()),
      tipo,
      pessoaId,
      nome,
      cpf: cpfDigits,
      email,
      obs,
      habitacaoId,
      habitacaoLabel,
      createdAt: String(o?.createdAt || new Date().toISOString())
    };
  };

  const renderOutrosPresentes = () => {
    const box = el('wdg-outros-list');
    if (!box) return;
    const list = Array.isArray(state.outrosPresentes) ? state.outrosPresentes : [];
    const visible = list.filter((x) => x && x.nome);
    if (!visible.length) {
      box.innerHTML = '<div class="text-muted small">(nenhum)</div>';
      return;
    }

    box.innerHTML = `<div class="wdg-outros-wrap">${visible
      .slice()
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
      .map((o) => {
        const id = escapeHtml(String(o.id));
        const nome = escapeHtml(String(o.nome));
        const tipo = escapeHtml(String(o.tipo || 'outros'));
        const meta = [
          (o.cpf ? `CPF: ${String(o.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : ''),
          (o.email ? `E-mail: ${String(o.email)}` : ''),
          (o.obs ? `Obs: ${String(o.obs)}` : '')
        ].filter(Boolean).join(' • ');
        const title = meta ? escapeHtml(meta) : '';
        return `<span class="wdg-outros-chip">
          <span class="wdg-outros-name" title="${title}">${nome}</span>
          <span class="badge text-bg-light border" style="font-weight:800;">${tipo}</span>
          <button class="btn btn-sm btn-outline-secondary" type="button" data-outro-action="remover" data-outro-id="${id}">Remover</button>
        </span>`;
      })
      .join('')}</div>`;

    box.querySelectorAll('[data-outro-action="remover"][data-outro-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = String(btn.getAttribute('data-outro-id') || '').trim();
        if (!id) return;
        state.outrosPresentes = (Array.isArray(state.outrosPresentes) ? state.outrosPresentes : []).filter((x) => String(x?.id) !== id);
        renderOutrosPresentes();
        persistLocal();
      });
    });
  };

  // =============================
  // Providers plugáveis
  // =============================
  const getBoot = () => {
    const b = window.__WDG_BOOT__ && typeof window.__WDG_BOOT__ === 'object' ? window.__WDG_BOOT__ : {};
    return {
      assembleiaId: String(b.assembleiaId || assembleiaId || '').trim(),
      userLabel: String(b.userLabel || '').trim()
    };
  };

  const getAssembleiaConfig = () => {
    const raw = (window.__WDG_ASSEMBLEIA_CONFIG__ && typeof window.__WDG_ASSEMBLEIA_CONFIG__ === 'object')
      ? window.__WDG_ASSEMBLEIA_CONFIG__
      : ((window.__ASSEMBLEIA_CONFIG__ && typeof window.__ASSEMBLEIA_CONFIG__ === 'object') ? window.__ASSEMBLEIA_CONFIG__ : {});

    const modeloVoto = raw.modeloVoto === 'unidade' || raw.modeloVoto === 'fracao' ? raw.modeloVoto : 'unidade';
    const inadimplencia = raw.inadimplencia === 'bloqueiaVoto' || raw.inadimplencia === 'apenasAviso' || raw.inadimplencia === 'bloqueiaPresencaEVoto'
      ? raw.inadimplencia
      : 'apenasAviso';
    const quorumInstalacaoBase = raw.quorumInstalacaoBase === 'presentes' || raw.quorumInstalacaoBase === 'votantes'
      ? raw.quorumInstalacaoBase
      : 'presentes';
    const quorumInstalacaoMetrica = raw.quorumInstalacaoMetrica === 'unidade' || raw.quorumInstalacaoMetrica === 'fracao'
      ? raw.quorumInstalacaoMetrica
      : (modeloVoto === 'fracao' ? 'fracao' : 'unidade');

    const exigirAprovacaoModeradorRemoto = !!raw.exigirAprovacaoModeradorRemoto;

    // opcionais (se o backend / view fornecer)
    const quorumInstalacaoMinimo = (raw.quorumInstalacaoMinimo == null) ? null : Number(raw.quorumInstalacaoMinimo);
    const quorumInstalacaoMinimoUnidades = (raw.quorumInstalacaoMinimoUnidades == null) ? null : Number(raw.quorumInstalacaoMinimoUnidades);

    return {
      modeloVoto,
      inadimplencia,
      quorumInstalacaoBase,
      quorumInstalacaoMetrica,
      exigirAprovacaoModeradorRemoto,
      quorumInstalacaoMinimo: Number.isFinite(quorumInstalacaoMinimo) ? quorumInstalacaoMinimo : null,
      quorumInstalacaoMinimoUnidades: Number.isFinite(quorumInstalacaoMinimoUnidades) ? quorumInstalacaoMinimoUnidades : null
    };
  };

  const getHabitacoesDirectory = () => {
    const raw = (window.__HABITACOES__ && Array.isArray(window.__HABITACOES__))
      ? window.__HABITACOES__
      : ((window.__HABITACOES_MOCK__ && Array.isArray(window.__HABITACOES_MOCK__)) ? window.__HABITACOES_MOCK__ : null);

    // fallback mínimo local (apenas para funcionar sem backend)
    const fallback = [
      { id: 'hab_101', label: 'APTO-101', fracaoIdeal: 0.012345, inadimplente: true,
        proprietarios: [ { id: 'p1', nome: 'Ana Proprietária' } ], moradores: [ { id: 'm1', nome: 'Bruno Morador' } ] },
      { id: 'hab_102', label: 'APTO-102', fracaoIdeal: 0.010001, inadimplente: false,
        proprietarios: [ { id: 'p2', nome: 'Carla Proprietária' } ], moradores: [] },
      { id: 'hab_201', label: 'APTO-201', fracaoIdeal: 0.020000, inadimplente: false,
        proprietarios: [ { id: 'p3', nome: 'Diego Proprietário' }, { id: 'p4', nome: 'Elisa Proprietária' } ],
        moradores: [ { id: 'm2', nome: 'Felipe Morador' }, { id: 'm3', nome: 'Gi Moradora' } ] },
      { id: 'hab_202', label: 'APTO-202', fracaoIdeal: 0.018888, inadimplente: true,
        proprietarios: [ { id: 'p5', nome: 'Hugo Proprietário' } ], moradores: [ { id: 'm4', nome: 'Iris Moradora' } ] }
    ];

    // Importante: não simular dados em produção.
    // Se a view/back não fornecer __HABITACOES__, em ambiente normal retornamos vazio.
    // O fallback só existe para desenvolvimento/local.
    const list = raw || (isDev ? fallback : []);
    const mapped = list
      .map((h) => ({
        id: String(h.id || ''),
        label: String(h.label || h.nome || h.name || ''),
        fracaoIdealPercent: (h && h.fracaoIdealPercent != null && h.fracaoIdealPercent !== '' && Number.isFinite(Number(h.fracaoIdealPercent)))
          ? Number(h.fracaoIdealPercent)
          : null,
        fracaoIdeal: (h && h.fracaoIdeal != null && h.fracaoIdeal !== '' && Number.isFinite(Number(h.fracaoIdeal)))
          ? Number(h.fracaoIdeal)
          : null,
        inadimplente: parseInadimplente(h),
        raw: (h && typeof h === 'object') ? h : null,
        proprietarios: Array.isArray(h.proprietarios)
          ? h.proprietarios
            .map((p) => ({
              id: String(p?.id || p?._id || ''),
              nome: String(p?.nome || p?.name || ''),
              email: String(p?.email || p?.mail || '').trim(),
              foto: String(p?.foto || p?.fotoUrl || p?.avatar || p?.imagem || p?.image || p?.fotoPerfil || p?.profilePhoto || '').trim(),
              usuario_id: p?.usuario_id || p?.usuarioId || p?.userId || null,
              cond_usuario_id: p?.cond_usuario_id || p?.condUsuarioId || null
            }))
            .filter((p) => p && p.id && p.nome)
          : [],
        moradores: Array.isArray(h.moradores)
          ? h.moradores
            .map((m) => ({
              id: String(m?.id || m?._id || ''),
              nome: String(m?.nome || m?.name || ''),
              email: String(m?.email || m?.mail || m?.usuarioEmail || m?.userEmail || m?.emailUsuario || '').trim(),
              foto: String(m?.foto || m?.fotoUrl || m?.avatar || m?.imagem || m?.image || m?.fotoPerfil || m?.profilePhoto || '').trim(),
              usuario_id: m?.usuario_id,
              cond_usuario_id: m?.cond_usuario_id
            }))
            .filter((m) => m && m.id && m.nome)
          : []
      }))

    // Compatibilidade: versões antigas/alternativas podem enviar `fracaoIdeal` já em percentual (0..100)
    // em vez de fração (0..1). Detectamos pela soma aproximada do diretório.
    try {
      const total = mapped.reduce((acc, h) => acc + (Number(h?.fracaoIdeal) || 0), 0);
      if (total > 2) {
        // Se a soma passa muito de 1, assumimos escala percentual.
        mapped.forEach((h) => {
          if (!h) return;
          const pct = (h.fracaoIdealPercent != null && Number.isFinite(Number(h.fracaoIdealPercent)))
            ? Number(h.fracaoIdealPercent)
            : ((h.fracaoIdeal != null && Number.isFinite(Number(h.fracaoIdeal))) ? Number(h.fracaoIdeal) : null);
          h.fracaoIdealPercent = (pct != null && Number.isFinite(pct)) ? pct : null;
          h.fracaoIdeal = (pct != null && Number.isFinite(pct)) ? (pct / 100) : null;
        });
        dbgPres('habitacoesDirectory.normalizedFromPercentScale', { total });
      }
    } catch { /* noop */ }

    return mapped.filter((h) => h && h.id && h.label);
  };

  const getUserLabel = () => {
    const b = getBoot();
    return b.userLabel || String(window.__WDG_USER_LABEL__ || '').trim() || 'Gestor';
  };

  const fmtPercent = (fraction01) => {
    if (fraction01 == null || Number.isNaN(fraction01)) return '—';
    const v = Number(fraction01) * 100;
    const s = v.toFixed(4);
    // pt-BR: vírgula
    return `${s.replace('.', ',')}%`;
  };

  const fmtPercentValue = (percent0100) => {
    if (percent0100 == null || Number.isNaN(percent0100)) return '—';
    const v = Number(percent0100);
    if (!Number.isFinite(v)) return '—';
    const s = v.toFixed(6).replace(/\.?0+$/, '');
    return `${s.replace('.', ',')}%`;
  };

  const fmtFraction01 = (fraction01) => {
    if (fraction01 == null || Number.isNaN(fraction01)) return '—';
    return Number(fraction01).toFixed(6);
  };

  const sumFractions = (arr) => {
    // soma estável: mantém precisão no valor interno e só arredonda na exibição
    let sum = 0;
    for (const x of (arr || [])) sum += (Number(x) || 0);
    return sum;
  };

  const setInlineAlert = (id, msg) => {
    const node = el(id);
    if (!node) return;
    if (!msg) {
      node.textContent = '';
      hide(node);
      return;
    }
    node.textContent = String(msg);
    show(node);
  };

  const computeQuorum = (backendQuorum) => {
    const cfgA = getAssembleiaConfig();
    const pres = getBackendPresences();
    const ativos = pres.filter((p) => !p?.isRemoved);
    const aprovados = ativos.filter((p) => {
      const role = String(p?.presence_role || p?.role || 'REPRESENTANTE').trim().toUpperCase();
      const status = String(p?.status || '').trim().toUpperCase();
      return role === 'REPRESENTANTE' && status === 'CONFIRMED';
    });
    const pendentes = ativos.filter((p) => String(p?.status || '').trim().toUpperCase().startsWith('PENDING_'));

    const bloqueados = ativos.filter((p) => {
      const status = String(p?.status || '').trim().toUpperCase();
      if (status === 'REJECTED' || status === 'CANCELED') return true;
      if (cfgA.quorumInstalacaoBase === 'votantes' && status === 'CONFIRMED' && p?.isVotante === false) return true;
      return false;
    });

    const base = cfgA.quorumInstalacaoBase;
    const baseAprovados = base === 'votantes' ? aprovados.filter((p) => !!p.isVotante) : aprovados;

    const backendPresentCount = Number(backendQuorum?.presentCount ?? backendQuorum?.pessoas ?? NaN);
    const backendFracao = Number(backendQuorum?.fracaoIdealPresent ?? backendQuorum?.fracaoIdeal ?? NaN);

    const unidades = Number.isFinite(backendPresentCount) ? backendPresentCount : baseAprovados.length;
    const fracao = Number.isFinite(backendFracao)
      ? backendFracao
      : sumFractions(baseAprovados.map((p) => Number(p.fracaoIdeal) || 0));

    let faltaLabel = '—';
    if (cfgA.quorumInstalacaoMetrica === 'fracao' && cfgA.quorumInstalacaoMinimo != null) {
      const falta = Math.max(0, Number(cfgA.quorumInstalacaoMinimo) - fracao);
      faltaLabel = falta <= 0 ? 'OK' : fmtPercent(falta);
    } else if (cfgA.quorumInstalacaoMetrica === 'unidade' && cfgA.quorumInstalacaoMinimoUnidades != null) {
      const falta = Math.max(0, Number(cfgA.quorumInstalacaoMinimoUnidades) - unidades);
      faltaLabel = falta <= 0 ? 'OK' : `${falta} unidade(s)`;
    }

    const effective = `Base: ${base === 'votantes' ? 'votantes' : 'presentes'} • Métrica: ${cfgA.quorumInstalacaoMetrica} • Aprovados: ${unidades} unidade(s) / ${fmtPercent(fracao)} • Bloqueados: ${bloqueados.length} • Falta: ${faltaLabel}`;

    return {
      unidadesAprovadas: unidades,
      fracaoAprovada: fracao,
      pendentes: pendentes.length,
      bloqueados: bloqueados.length,
      faltaLabel,
      effective
    };
  };

  const renderQuorumCard = (backendQuorum = null) => {
    const q = computeQuorum(backendQuorum);
    const u = el('wdg-quorum-aprovados-unidades');
    const f = el('wdg-quorum-aprovados-fracao');
    const p = el('wdg-quorum-pendentes');
    const b = el('wdg-quorum-bloqueados');
    const fl = el('wdg-quorum-falta');
    const eff = el('wdg-quorum-effective');
    if (u) u.textContent = String(q.unidadesAprovadas);
    if (f) f.textContent = fmtPercent(q.fracaoAprovada);
    if (p) p.textContent = String(q.pendentes);
    if (b) b.textContent = String(q.bloqueados || 0);
    if (fl) fl.textContent = String(q.faltaLabel || '—');
    if (eff) eff.textContent = q.effective;
  };

  const genId = () => {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch { /* noop */ }
    return `pres_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const fileMeta = (file) => {
    if (!file) return null;
    return {
      nomeArquivo: String(file.name || ''),
      size: Number(file.size || 0),
      mime: String(file.type || '')
    };
  };

  const getStorageKey = () => {
    const b = getBoot();
    const id = b.assembleiaId || String(assembleiaId || '').trim() || 'sem_id';
    return `wdg.exec.presences.v1.${id}`;
  };

  const persistLocal = () => {
    try {
      const key = getStorageKey();
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        outrosPresentes: Array.isArray(state.outrosPresentes) ? state.outrosPresentes : []
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
      dbgPres('persistLocal', { key, outrosCount: payload.outrosPresentes.length, updatedAt: payload.updatedAt });
    } catch { /* noop */ }
  };

  const loadLocal = () => {
    try {
      const key = getStorageKey();
      const raw = window.localStorage.getItem(key);
      if (!raw) return { outrosPresentes: [] };
      const parsed = JSON.parse(raw);
      const outros = Array.isArray(parsed?.outrosPresentes) ? parsed.outrosPresentes : [];
      dbgPres('loadLocal', { key, outrosCount: outros.length, updatedAt: parsed?.updatedAt || null });
      return { outrosPresentes: outros };
    } catch {
      return { outrosPresentes: [] };
    }
  };

  const pushAudit = (presence, action, extra = {}) => {
    const trail = Array.isArray(presence.auditTrail) ? presence.auditTrail.slice() : [];
    trail.push({ at: new Date().toISOString(), action, byUserLabel: getUserLabel(), ...(extra || {}) });
    presence.auditTrail = trail;
  };

  const normalizePresence = (p) => {
    const statusRaw = String(p?.status || '').trim();
    const status = (statusRaw === 'pendente' || statusRaw === 'aprovado' || statusRaw === 'recusado') ? statusRaw : 'pendente';
    const tipoIn = String(p?.participanteTipo || '').trim();
    const tipoRaw = (tipoIn === 'morador') ? 'inquilino_autorizado' : (tipoIn === 'terceiro' ? 'procurador' : tipoIn);
    const participanteTipo = (tipoRaw === 'proprietario' || tipoRaw === 'inquilino_autorizado' || tipoRaw === 'procurador') ? tipoRaw : 'procurador';
    const srcRaw = String(p?.source || '').trim();
    const source = (srcRaw === 'gestor' || srcRaw === 'portal') ? srcRaw : 'gestor';

    const docs = p?.docs && typeof p.docs === 'object' ? p.docs : {};
    const procuracao = docs.procuracao && typeof docs.procuracao === 'object'
      ? {
        nomeArquivo: String(docs.procuracao.nomeArquivo || ''),
        size: Number(docs.procuracao.size || 0),
        mime: String(docs.procuracao.mime || '')
      }
      : null;

    return {
      id: String(p?.id || genId()),
      habitacaoId: String(p?.habitacaoId || ''),
      habitacaoLabel: String(p?.habitacaoLabel || ''),
      fracaoIdeal: Number(p?.fracaoIdeal || 0),
      participanteTipo,
      participanteNome: String(p?.participanteNome || ''),
      participanteCpf: String(p?.participanteCpf || ''),
      participanteEmail: String(p?.participanteEmail || ''),
      participanteObs: String(p?.participanteObs || ''),
      source,
      status,
      isVotante: p?.isVotante == null ? true : !!p.isVotante,
      motivoNaoVotante: String(p?.motivoNaoVotante || ''),
      voteRestriction: String(p?.voteRestriction || ''),
      inadimplente: !!p?.inadimplente,
      isRemoved: !!p?.isRemoved,
      removedAt: p?.removedAt ? String(p.removedAt) : '',
      docs: { procuracao },
      createdAt: String(p?.createdAt || new Date().toISOString()),
      auditTrail: Array.isArray(p?.auditTrail) ? p.auditTrail : []
    };
  };

  const isPresenceBlockedByInadimplencia = (habitacao) => {
    const cfgA = getAssembleiaConfig();
    if (!habitacao || !habitacao.inadimplente) return false;
    return cfgA.inadimplencia === 'bloqueiaPresencaEVoto';
  };

  const applyInadimplenciaRules = ({ habitacao, presenceDraft }) => {
    const cfgA = getAssembleiaConfig();
    if (!habitacao || !habitacao.inadimplente) return presenceDraft;

    if (cfgA.inadimplencia === 'apenasAviso') {
      presenceDraft.voteRestriction = 'AVISO_INADIMPLENTE';
      presenceDraft.inadimplente = true;
      return presenceDraft;
    }

    if (cfgA.inadimplencia === 'bloqueiaVoto') {
      presenceDraft.inadimplente = true;
      presenceDraft.isVotante = false;
      presenceDraft.motivoNaoVotante = presenceDraft.motivoNaoVotante || 'Inadimplência: voto bloqueado pela regra da assembleia.';
      presenceDraft.voteRestriction = 'BLOQUEIA_VOTO';
      return presenceDraft;
    }

    // bloqueiaPresencaEVoto é tratado antes (bloqueio de registro)
    presenceDraft.inadimplente = true;
    return presenceDraft;
  };

  const getSelectedParticipante = ({ tipo, hab }) => {
    const propSel = el('wdg-proprietario-select');
    const morSel = el('wdg-morador-select');
    const nomeLivre = String(el('wdg-nome-livre')?.value || '').trim();

    if (tipo === 'proprietario') {
      const val = String(propSel?.value || '').trim();
      const person = (hab.proprietarios || []).find((p) => String(p.id) === val) || null;
      const nome = String(person?.nome || '').trim();
      return { pessoaId: person ? String(person.id) : '', nome };
    }

    if (tipo === 'inquilino_autorizado' || tipo === 'morador') {
      const val = String(morSel?.value || '').trim();
      const person = (hab.moradores || []).find((m) => String(m.id) === val) || null;
      const nome = String(person?.nome || '').trim();
      return { pessoaId: person ? String(person.id) : '', nome };
    }

    return { pessoaId: '', nome: nomeLivre };
  };

  const syncConfigPill = () => {
    const cfgA = getAssembleiaConfig();
    const pill = el('wdg-pres-config-pill');
    if (!pill) return;
    const mv = cfgA.modeloVoto === 'fracao' ? 'FRAÇÃO' : 'UNIDADE';
    const mod = cfgA.exigirAprovacaoModeradorRemoto ? 'MOD REMOTO: SIM' : 'MOD REMOTO: NÃO';
    const inad = cfgA.inadimplencia === 'bloqueiaPresencaEVoto' ? 'INAD: BLOQUEIA PRESENÇA' : (cfgA.inadimplencia === 'bloqueiaVoto' ? 'INAD: BLOQUEIA VOTO' : 'INAD: AVISO');
    const base = cfgA.quorumInstalacaoBase === 'votantes' ? 'BASE: VOTANTES' : 'BASE: PRESENTES';
    const met = cfgA.quorumInstalacaoMetrica === 'fracao' ? 'MÉTRICA: FRAÇÃO' : 'MÉTRICA: UNIDADE';
    pill.textContent = `VOTO: ${mv} • ${base} • ${met} • ${mod} • ${inad}`;
  };

  const renderRepresentantesPanel = (hab) => {
    const ulProps = el('wdg-rep-proprietarios');
    const ulMors = el('wdg-rep-moradores');
    const propSel = el('wdg-proprietario-select');
    const morSel = el('wdg-morador-select');

    const props = (hab && Array.isArray(hab.proprietarios)) ? hab.proprietarios : [];
    const mors = (hab && Array.isArray(hab.moradores)) ? hab.moradores : [];

    if (ulProps) {
      ulProps.innerHTML = props.length
        ? props.map((p) => `<li>${escapeHtml(p.nome)}</li>`).join('')
        : '<li class="text-muted">(nenhum cadastrado)</li>';
    }
    if (ulMors) {
      ulMors.innerHTML = mors.length
        ? mors.map((m) => `<li>${escapeHtml(m.nome)}</li>`).join('')
        : '<li class="text-muted">(nenhum cadastrado)</li>';
    }

    if (propSel) {
      propSel.innerHTML = props.length
        ? props.map((p, idx) => `<option value="${escapeHtml(p.id)}" ${idx === 0 ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')
        : '<option value="" selected>(nenhum proprietário cadastrado)</option>';
      propSel.disabled = !props.length;
    }

    if (morSel) {
      morSel.innerHTML = mors.length
        ? mors.map((m, idx) => `<option value="${escapeHtml(m.id)}" ${idx === 0 ? 'selected' : ''}>${escapeHtml(m.nome)}</option>`).join('')
        : '<option value="" selected>(nenhum morador cadastrado)</option>';
      morSel.disabled = !mors.length;
    }
  };

  const renderHabitationOptions = ({ list, filter }) => {
    const valueEl = el('wdg-habitacao-id');
    if (!valueEl) return;

    // Se ainda existir um <select>, mantém compat.
    if (String(valueEl.tagName || '').toUpperCase() === 'SELECT') {
      const select = valueEl;
      const q = String(filter || '').trim().toLowerCase();
      const filtered = !q
        ? list
        : list.filter((h) => String(h.label || '').toLowerCase().includes(q) || String(h.id || '').toLowerCase().includes(q));

      const current = String(select.value || '').trim();
      select.innerHTML = ['<option value="" selected>Selecione…</option>']
        .concat(
          filtered
            .slice()
            .sort((a, b) => String(a.label).localeCompare(String(b.label)))
            .map((h) => {
              const inad = h.inadimplente ? ' (inadimplente)' : '';
              const isSel = current && current === h.id;
              return `<option value="${escapeHtml(h.id)}" ${isSel ? 'selected' : ''}>${escapeHtml(h.label + inad)}</option>`;
            })
        )
        .join('');
      return;
    }

    // Picker (estilo Enquetes): input + menu
    const root = document.querySelector('[data-pres-picker="habitacao"]');
    const input = root ? root.querySelector('[data-pres-picker-input]') : null;
    const menu = root ? root.querySelector('[data-pres-picker-menu]') : null;
    if (!root || !input || !menu) return;

    const q = String(filter || '').trim().toLowerCase();
    const current = String(valueEl.value || '').trim();

    const filtered = (!q
      ? list
      : list.filter((h) => {
        const info = getHabitationPickerDisplay(h);
        const s1 = String(h.label || '').toLowerCase();
        const s2 = String(h.id || '').toLowerCase();
        const s3 = String(info.line1 || '').toLowerCase();
        const s4 = String(info.line2 || '').toLowerCase();
        return s1.includes(q) || s2.includes(q) || s3.includes(q) || s4.includes(q);
      }))
      .filter((h) => !current || String(h.id) !== current);

    const items = filtered
      .slice()
      .sort((a, b) => String(a.label).localeCompare(String(b.label)))
      .map((h) => {
        const info = getHabitationPickerDisplay(h);
        const line1 = String(info.line1 || 'Habitação').trim();
        const line2 = String(info.line2 || '').trim();

        const avatar = ''
          + '<span class="wdg-pick-avatar">'
          +   `<img src="${escapeHtml(DEFAULT_HOME_ICON)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(DEFAULT_HOME_ICON)}';">`
          + '</span>';
        const line2Html = line2 ? `<span class="wdg-pick-hab">${escapeHtml(line2)}</span>` : '';
        return ''
          + `<button type="button" class="wdg-pres-picker-item" data-hab-id="${escapeHtml(h.id)}">`
          +   avatar
          +   '<span class="wdg-pick-lines">'
          +     `<span class="wdg-pick-name">${escapeHtml(line1)}</span>`
          +     line2Html
          +   '</span>'
          + '</button>';
      })
      .join('');

    menu.innerHTML = items || '<div class="px-3 py-2 text-muted" style="font-weight:700">Nenhum resultado.</div>';
  };

  const syncFormForSelectedHab = ({ hab }) => {
    const frac = el('wdg-fracao-ideal');
    if (frac) {
      const vPct = hab ? hab.fracaoIdealPercent : null;
      const v01 = hab ? hab.fracaoIdeal : null;
      if (vPct != null && Number.isFinite(Number(vPct))) {
        frac.value = fmtPercentValue(Number(vPct));
      } else {
        frac.value = (v01 != null && Number.isFinite(Number(v01))) ? fmtPercent(Number(v01)) : '';
      }
    }

    // Financeiro: adimplente/inadimplente
    try {
      const fin = el('wdg-financeiro-badge');
      if (fin) {
        if (!hab) {
          fin.className = 'badge text-bg-secondary';
          fin.textContent = '—';
        } else if (hab.inadimplente) {
          fin.className = 'badge text-bg-danger';
          fin.textContent = 'Inadimplente';
        } else {
          fin.className = 'badge text-bg-success';
          fin.textContent = 'Adimplente';
        }
      }
    } catch { /* noop */ }

    renderRepresentantesPanel(hab);

    const blocked = isPresenceBlockedByInadimplencia(hab);
    const btn = el('wdg-btn-confirmar');
    if (btn) btn.disabled = !!blocked;

    const habPickInput = el('wdg-habitacao-picker-input');
    if (habPickInput) habPickInput.classList.toggle('wdg-pres-hab-inad', !!hab?.inadimplente);
    try {
      const box = document.querySelector('[data-pres-picker="habitacao"] [data-pres-picker-box]');
      if (box) box.classList.toggle('wdg-pres-hab-inad', !!hab?.inadimplente);
    } catch { /* noop */ }

    setInlineAlert('wdg-pres-form-warn', blocked
      ? 'Esta habitação está marcada como inadimplente. Pela configuração atual, a presença está bloqueada.'
      : (hab && hab.inadimplente && getAssembleiaConfig().inadimplencia === 'apenasAviso'
        ? 'Habitação inadimplente: permitido registrar, mas fica com aviso (auditoria).' :
        (hab && hab.inadimplente && getAssembleiaConfig().inadimplencia === 'bloqueiaVoto'
          ? 'Habitação inadimplente: presença permitida, mas não votante (voto bloqueado).' : '')));

    syncVotoControls({ hab });
  };

  const syncVotoControls = ({ hab }) => {
    const votoEl = el('wdg-voto-status');
    const badge = el('wdg-voto-badge');
    if (!votoEl) return;

    const cfgA = getAssembleiaConfig();
    const isInad = !!hab?.inadimplente;
    const forceNaoVotante = isInad && cfgA.inadimplencia === 'bloqueiaVoto';

    const setUi = (val, locked) => {
      const v = String(val || 'votante').trim() || 'votante';
      try { votoEl.value = v; } catch { /* noop */ }
      if (badge) {
        const isNao = v === 'nao_votante';
        badge.className = `badge ${isNao ? 'text-bg-danger' : 'text-bg-success'} dropdown-toggle`;
        badge.textContent = isNao ? 'Inapto para votar' : 'Apto para votar';
        if (locked) {
          badge.setAttribute('aria-disabled', 'true');
          badge.classList.remove('dropdown-toggle');
          try { badge.removeAttribute('data-bs-toggle'); } catch { /* noop */ }
        } else {
          badge.removeAttribute('aria-disabled');
          badge.classList.add('dropdown-toggle');
          try { badge.setAttribute('data-bs-toggle', 'dropdown'); } catch { /* noop */ }
        }
      }
    };

    if (!hab) {
      setUi('votante', false);
      return;
    }
    if (forceNaoVotante) {
      setUi('nao_votante', true);
      return;
    }
    const cur = String(votoEl.value || '').trim() || 'votante';
    setUi(cur, false);
  };

  const syncProcRequired = () => {
    const repSel = el('wdg-representante-tipo');
    const tipo = String(repSel?.value || (execRoot || document).querySelector('input[name="participanteTipo"]:checked')?.value || '').trim();
    const fileInput = el('wdg-anexo-file');
    const help = el('wdg-procuracao-help');
    const docLabel = el('wdg-doc-label');
    const must = tipo && tipo !== 'proprietario';
    if (fileInput) fileInput.required = must;
    if (help) help.textContent = must
      ? 'Obrigatória (tipo diferente de proprietário).'
      : 'Opcional (proprietário).';
    if (docLabel) docLabel.textContent = must ? 'Procuração (anexo)' : 'Anexo';

    const nomeLivre = el('wdg-nome-livre');
    const propSel = el('wdg-proprietario-select');
    const morSel = el('wdg-morador-select');

    const wrapProp = el('wdg-rep-proprietario-wrap');
    const wrapMor = el('wdg-rep-inquilino-wrap');
    const wrapProc = el('wdg-rep-procurador-wrap');

    if (wrapProp) wrapProp.classList.toggle('d-none', tipo !== 'proprietario');
    if (wrapMor) wrapMor.classList.toggle('d-none', tipo !== 'inquilino_autorizado');
    if (wrapProc) wrapProc.classList.toggle('d-none', tipo !== 'procurador');

    if (propSel) propSel.disabled = (tipo !== 'proprietario') || (propSel.querySelectorAll('option').length <= 1 && !String(propSel.value || '').trim());
    if (morSel) morSel.disabled = (tipo !== 'inquilino_autorizado') || (morSel.querySelectorAll('option').length <= 1 && !String(morSel.value || '').trim());
    if (nomeLivre) nomeLivre.disabled = (tipo !== 'procurador');
  };

  const submitRepresentativePresence = async ({ hab, participanteNome, participanteTipo, participanteCpf, participanteEmail, participanteObs, participanteUserId, participanteCondUsuarioId, source, status, docMeta, isVotante, motivoNaoVotante }) => {
    if (!hab) throw new Error('Selecione uma habitação.');
    if (isPresenceBlockedByInadimplencia(hab)) {
      throw new Error('Presença bloqueada: habitação inadimplente (conforme configuração).');
    }

    if (!assembleiaId) throw new Error('Assembleia inválida para registrar presença.');

    await api('/presence', { method: 'POST', body: {
      presence_role: 'REPRESENTANTE',
      habitacaoId: String(hab.id || '').trim(),
      habitacaoLabel: String(hab.label || '').trim(),
      nome: String(participanteNome || '').trim(),
      participanteTipo: String(participanteTipo || '').trim(),
      participanteCpf: String(participanteCpf || '').trim(),
      participanteEmail: String(participanteEmail || '').trim(),
      participanteObs: String(participanteObs || '').trim(),
      portalUserId: String(participanteCondUsuarioId || participanteUserId || '').trim(),
      condUsuarioId: String(participanteCondUsuarioId || '').trim(),
      source: String(source || 'gestor').trim(),
      status: String(status || '').trim(),
      isVotante: isVotante == null ? true : !!isVotante,
      motivoNaoVotante: String(motivoNaoVotante || '').trim(),
      fracaoIdeal: Number(hab.fracaoIdeal || 0) || 0,
      procuracaoPara: String(participanteTipo || '').trim() === 'procurador' ? String(participanteNome || '').trim() : '',
      hasDoc: !!docMeta
    }});
  };

  const onPresenceAction = ({ action, id }) => {
    dbgPres('onPresenceAction', { action, id });

    if (assembleiaId && (action === 'confirmar_moderador' || action === 'confirmar_pin')) {
      (async () => {
        try {
          if (action === 'confirmar_moderador') {
            const pres = getBackendPresences().find((x) => String(x?.presenceId || x?.id || x?.key || '') === String(id || '').trim()) || null;
            if (!pres) throw new Error('Presença não encontrada para confirmação do moderador.');

            await api('/presence', {
              method: 'POST',
              body: {
                presence_role: 'REPRESENTANTE',
                habitacaoId: String(pres?.habitacao_id || pres?.habitacaoId || '').trim(),
                habitacaoLabel: String(pres?.unidadeLabel || pres?.habitacaoLabel || '').trim(),
                nome: String(pres?.nome || pres?.participanteNome || '').trim(),
                source: 'gestor',
                fracaoIdeal: Number(pres?.fracaoIdeal || 0) || 0,
                procuracaoPara: String(pres?.procuracaoPara || '').trim()
              }
            });

            flashSuccess('Solicitação confirmada pelo moderador.');
            await reloadExecutionState();
          } else {
            state.pendingPinPresenceId = String(id || '').trim();
            const hid = el('wdg-pin-presence-id');
            const inp = el('wdg-pin-presence-value');
            if (hid) hid.value = state.pendingPinPresenceId;
            if (inp) inp.value = '';
            try {
              const modalEl = el('wdg-modal-confirmar-pin');
              if (modalEl && window.bootstrap && window.bootstrap.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
                window.setTimeout(() => {
                  try {
                    const pinInp = el('wdg-pin-presence-value');
                    if (pinInp) {
                      pinInp.removeAttribute('readonly');
                      pinInp.removeAttribute('disabled');
                      pinInp.focus();
                      pinInp.select();
                    }
                  } catch { /* noop */ }
                }, 80);
              }
            } catch { /* noop */ }
          }
        } catch (e) {
          flashError(e?.message || 'Falha ao confirmar presença.');
        }
      })();
      return;
    }

    if (action === 'ver_doc') {
      const p = getBackendPresences().find((x) => String(x?.presenceId || x?.id || x?.key || '') === String(id || '').trim()) || null;
      const meta = p?.docs?.procuracao || null;
      dbgPres('doc.open', { id: String(id || ''), hasDoc: !!meta });
      const box = el('wdg-doc-meta');
      if (box) box.textContent = meta ? JSON.stringify(meta, null, 2) : '—';
      state.currentDocPresenceId = String(id || '');
      const replace = el('wdg-doc-replace');
      if (replace) replace.value = '';
      const btnRemove = el('wdg-doc-remove');
      if (btnRemove) btnRemove.disabled = !meta;
      try {
        const modalEl = el('wdg-modal-doc');
        if (modalEl && window.bootstrap && window.bootstrap.Modal) {
          window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
      } catch { /* noop */ }
      return;
    }

    return;
  };

  const exportPresencesJson = () => {
    const b = getBoot();
    const backendPresences = getBackendPresences();
    const payload = {
      version: 1,
      assembleiaId: b.assembleiaId || String(assembleiaId || '').trim(),
      exportedAt: new Date().toISOString(),
      presences: backendPresences,
      outrosPresentes: Array.isArray(state.outrosPresentes) ? state.outrosPresentes : []
    };
    dbgPres('exportPresencesJson', { assembleiaId: payload.assembleiaId, count: payload.presences.length });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const fname = `presencas_${String(payload.assembleiaId || 'assembleia').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(a.href); } catch { /* noop */ }
      try { a.remove(); } catch { /* noop */ }
    }, 0);
  };

  const importPresencesJson = async (file) => {
    dbgPres('importPresencesJson.blocked', { name: file?.name || null, size: file?.size || null });
    throw new Error('Importação de presenças desabilitada nesta fase. Use somente o backend.');
  };

  const renderAgenda = (agenda, currentAgendaIdx) => {
    const list = el('wdg-agenda-list');
    if (!list) return;

    if (!agenda || !agenda.length) {
      list.innerHTML = '<div class="list-group-item text-muted">(pauta vazia)</div>';
      return;
    }

    list.innerHTML = agenda
      .slice()
      .sort((a, b) => Number(a.idx) - Number(b.idx))
      .map((it) => {
        const idx = Number(it.idx);
        const isCurrent = idx === Number(currentAgendaIdx);
        const stateLabel = String(it.state || '');
        const descr = String(it.descricao || '');
        return `<button type="button" class="list-group-item list-group-item-action ${isCurrent ? 'active' : ''}" data-agenda-idx="${idx}">
          <div class="d-flex justify-content-between gap-2">
            <div class="text-truncate"><span class="fw-semibold">#${idx}</span> ${escapeHtml(descr)}</div>
            <div class="small opacity-75 text-nowrap">${escapeHtml(stateLabel)}</div>
          </div>
        </button>`;
      })
      .join('');

    // click set agenda
    list.querySelectorAll('[data-agenda-idx]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-agenda-idx'));
        try {
          await api('/agenda', { method: 'POST', body: { action: 'set', idx } });
          flashSuccess('Pauta atualizada.');
          await reloadExecutionState();
        } catch (e) {
          flashError(e.message);
        }
      });
    });
  };

  const renderVoteSummary = (vote) => {
    const sim = el('wdg-vote-sim');
    const nao = el('wdg-vote-nao');
    const abst = el('wdg-vote-abst');
    const total = el('wdg-vote-total');

    const vs = vote?.summary || vote || null;
    if (!vs) {
      if (sim) sim.textContent = '—';
      if (nao) nao.textContent = '—';
      if (abst) abst.textContent = '—';
      if (total) total.textContent = '—';
      return;
    }

    if (sim) sim.textContent = String(vs.sim ?? 0);
    if (nao) nao.textContent = String(vs.nao ?? 0);
    if (abst) abst.textContent = String(vs.abstencao ?? vs.abst ?? 0);
    if (total) total.textContent = String(vs.total ?? 0);
  };

  const setStatusPill = (node, variant) => {
    if (!node) return;
    const variants = [
      'text-bg-primary',
      'text-bg-success',
      'text-bg-warning',
      'text-bg-danger',
      'text-bg-secondary',
      'text-bg-light'
    ];
    variants.forEach((v) => node.classList.remove(v));
    if (variant) node.classList.add(variant);
  };

  const setStepState = (node, state) => {
    if (!node) return;
    // default: neutro (usa CSS da página)
    ['text-bg-success', 'text-bg-primary', 'text-bg-warning', 'text-bg-danger', 'text-bg-secondary'].forEach((c) => node.classList.remove(c));
    if (state === 'done') node.classList.add('text-bg-success');
    else if (state === 'active') node.classList.add('text-bg-primary');
    else if (state === 'warn') node.classList.add('text-bg-warning');
  };

  const renderSessionStatusUI = (s) => {
    const rawStatus = String(s?.sessionStatus || '').toLowerCase();
    const isPaused = !!s?.isPaused;
    const isClosed = rawStatus === 'encerrada' || rawStatus === 'encerrado';
    const isWaiting = rawStatus === 'aguardando' || !rawStatus;

    const events = Array.isArray(s?.events) ? s.events : [];
    const hasPaused = events.some((ev) => String(ev?.type || '') === 'session_paused');
    const hasResumed = events.some((ev) => String(ev?.type || '') === 'session_resumed');

    const statusEl = el('wdg-exec-status');
    const badgeEl = el('wdg-exec-status-badge');
    const progressEl = el('wdg-exec-status-progress');

    let label = '—';
    let badgeVariant = 'text-bg-secondary';
    let progress = 0;

    if (isWaiting) {
      label = 'Aguardando abertura';
      badgeVariant = 'text-bg-secondary';
      progress = 0;
    } else if (isClosed) {
      label = 'Encerrada';
      badgeVariant = 'text-bg-danger';
      progress = 100;
    } else if (rawStatus === 'aberta' && isPaused) {
      label = 'Pausada';
      badgeVariant = 'text-bg-warning';
      progress = 66;
    } else if (rawStatus === 'aberta') {
      label = hasResumed ? 'Em andamento (retomada)' : 'Em andamento';
      badgeVariant = 'text-bg-success';
      progress = 33;
    } else {
      label = String(s?.sessionStatus || '—');
      badgeVariant = 'text-bg-secondary';
      progress = 0;
    }

    if (statusEl) {
      statusEl.textContent = label;
      statusEl.title = rawStatus ? `Status: ${rawStatus}${isPaused ? ' (pausada)' : ''}` : '';
    }
    setStatusPill(badgeEl, badgeVariant);

    if (progressEl) {
      progressEl.style.width = `${Math.max(0, Math.min(100, progress))}%`;
      // cor do progressbar acompanha o badge
      progressEl.classList.remove('bg-success', 'bg-warning', 'bg-danger', 'bg-secondary', 'bg-primary');
      if (badgeVariant.includes('success')) progressEl.classList.add('bg-success');
      else if (badgeVariant.includes('warning')) progressEl.classList.add('bg-warning');
      else if (badgeVariant.includes('danger')) progressEl.classList.add('bg-danger');
      else if (badgeVariant.includes('primary')) progressEl.classList.add('bg-primary');
      else progressEl.classList.add('bg-secondary');
    }

    // stepper (Abertura / Pausa / Retorno / Encerramento)
    const stepOpen = el('wdg-step-open');
    const stepPause = el('wdg-step-pause');
    const stepResume = el('wdg-step-resume');
    const stepClose = el('wdg-step-close');

    // abertura
    if (isWaiting) setStepState(stepOpen, 'active');
    else if (rawStatus === 'aberta' || isClosed) setStepState(stepOpen, 'done');
    else setStepState(stepOpen, null);

    // pausa
    if (isPaused) setStepState(stepPause, 'warn');
    else if (hasPaused) setStepState(stepPause, 'done');
    else setStepState(stepPause, null);

    // retorno
    if (!isPaused && (hasResumed || (rawStatus === 'aberta' && hasPaused))) setStepState(stepResume, 'done');
    else if (rawStatus === 'aberta' && !isPaused && hasPaused) setStepState(stepResume, 'active');
    else setStepState(stepResume, null);

    // encerramento
    if (isClosed) setStepState(stepClose, 'done');
    else setStepState(stepClose, null);

    // botão de pausa: alterna label
    const pauseLabel = el('wdg-btn-pause-label');
    if (pauseLabel) pauseLabel.textContent = isPaused ? 'Retomar' : 'Pausar';
  };

  const renderTop = (data) => {
    const s = (data && (data.data || data.status)) || data;

    renderSessionStatusUI(s);
    el('wdg-exec-clock').textContent = fmtMs(s?.sessionClockMs);

    const quorum = s?.quorum;
    if (quorum) {
      const presentCount = (quorum.presentCount ?? quorum.pessoas ?? 0);
      const fracao = (quorum.fracaoIdealPresent ?? quorum.fracaoIdeal ?? 0);
      el('wdg-exec-quorum').textContent = `${presentCount} presentes (${fracao} fração)`;
      el('wdg-summary-presences').textContent = `${presentCount}`;
    } else {
      el('wdg-exec-quorum').textContent = '—';
      el('wdg-summary-presences').textContent = '—';
    }

    const item = s?.currentAgendaItem || s?.currentItem;
    el('wdg-exec-agenda').textContent = item ? `#${item.idx} ${item.descricao || ''}`.trim() : '—';

    renderEvents(s?.events || []);
    const apiPresences = Array.isArray(s?.presences) ? s.presences : [];
    renderPresences(apiPresences);
    renderQuorumCard(s?.quorum || null);
    renderAgenda(s?.agenda || [], s?.currentAgendaIdx);

    // vote
    if (s?.openVote) {
      el('wdg-summary-vote').textContent = `Sim ${s.openVote.sim ?? 0} / Não ${s.openVote.nao ?? 0} / Abst ${s.openVote.abstencao ?? 0}`;
      renderVoteSummary({ summary: s.openVote });
    } else {
      el('wdg-summary-vote').textContent = '—';
      renderVoteSummary(null);
    }

    el('wdg-summary-updated').textContent = new Date().toLocaleTimeString('pt-BR');

    // ata/pdf
    const pdf = el('wdg-btn-ata-pdf');
    if (pdf) pdf.href = `${apiBase}/ata.pdf`;
  };

  const reloadExecutionState = async () => {
    if (!assembleiaId || !apiBase) return;
    if (state.inFlight) return;
    state.inFlight = true;

    try {
      const data = await api('/status');
      state.lastStatus = data;
      state.executionData = data?.data || data || null;
      renderTop(data);
      setMsg(errorBox, '');
    } catch (e) {
      flashError(e.message);
    } finally {
      state.inFlight = false;
    }
  };

  const refreshStatus = reloadExecutionState;

  const startPolling = () => {
    stopPolling();
    const tick = async () => {
      await reloadExecutionState();
      state.timer = window.setTimeout(tick, state.pollingMs);
    };
    tick();
  };

  const stopPolling = () => {
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
  };

  const escapeHtml = (str) => {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  };

  const bind = () => {
    const mountModalToBody = (modalId) => {
      try {
        const modalEl = el(modalId);
        if (!modalEl || modalEl.parentElement === document.body) return modalEl;
        document.body.appendChild(modalEl);
        return modalEl;
      } catch {
        return el(modalId);
      }
    };

    mountModalToBody('wdg-modal-portal-presence');
    mountModalToBody('wdg-modal-confirmar-pin');
    mountModalToBody('wdg-modal-doc');

    // tabs
    (execRoot || document).querySelectorAll('#wdg-tabs [data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.getAttribute('data-tab')));
    });

    // restore tab from query
    try {
      const u = new URL(window.location.href);
      const tab = u.searchParams.get('tab');
      if (tab) setActiveTab(tab);
    } catch { /* noop */ }

    // Presenças: mantém apenas dados auxiliares locais (outros presentes).
    const presRoot = el('wdg-presencas-app');
    if (presRoot && String(presRoot.getAttribute('data-mode') || '') === 'local') {
      const payload = loadLocal();
      state.outrosPresentes = (payload.outrosPresentes || []).map(normalizeOutro).filter((x) => x && x.nome);
      syncConfigPill();
      renderQuorumCard();
      renderPresences(getBackendPresences());

      const habs = getHabitacoesDirectory();
      const habById = new Map(habs.map((h) => [String(h.id), h]));

      // Card: não representante (outros presentes)
      const outrosTipoSel = el('wdg-outros-tipo');
      const outrosPessoaWrap = el('wdg-outros-pessoa-wrap');
      const outrosPessoaSel = el('wdg-outros-pessoa');
      const outrosPessoaIdInp = el('wdg-outros-pessoa-id');
      const outrosSearchEl = el('wdg-outros-search');
      const outrosRefreshBtn = el('wdg-outros-refresh');
      const outrosListEl = el('wdg-outros-list');
      const outrosHintEl = el('wdg-outros-hint');
      const outrosManualWrap = el('wdg-outros-manual-wrap');
      const outrosNomeInp = el('wdg-outros-nome');
      const outrosCpfInp = el('wdg-outros-cpf');
      const outrosEmailInp = el('wdg-outros-email');
      const outrosObsInp = el('wdg-outros-obs');

      const outrosAddBtn = el('wdg-outros-add');

      let outrosLastTipo = '';
      let outrosSelected = null;
      let outrosOptionsCache = [];

      const normalizeStr = (value) => {
        const s = String(value || '').trim().toLowerCase();
        try {
          return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
        } catch {
          return s;
        }
      };

      const moduleBasePath = (() => {
        // apiBase normalmente é: /condominios/api/...
        const raw = String(apiBase || '').trim();
        if (raw.includes('/api/')) return raw.split('/api/')[0] || '/condominios';
        // fallback seguro
        return '/condominios';
      })();

      const encodeSafeUrl = (url) => {
        try {
          return encodeURI(String(url || '').trim());
        } catch {
          return String(url || '').trim();
        }
      };

      const normalizeFotoUrl = (fotoRaw) => {
        const f = String(fotoRaw || '').trim();
        if (!f) return '';
        if (/^https?:\/\//i.test(f)) return encodeSafeUrl(f);
        if (f.startsWith('/')) return encodeSafeUrl(f);
        const bp = String(moduleBasePath || '').replace(/\/+$/, '');
        return encodeSafeUrl(`${bp}/${f.replace(/^\/+/, '')}`);
      };

      const buildAltFotoUrl = (email) => {
        const em = String(email || '').trim().toLowerCase();
        if (!em || !em.includes('@')) return '';
        const bp = String(moduleBasePath || '').replace(/\/+$/, '');
        return `${bp}/api/usuarios/foto?email=${encodeURIComponent(em)}&v=${Date.now()}`;
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

      const getOutrosTipo = () => {
        if (!outrosTipoSel) return 'dirigente';
        if (String(outrosTipoSel.tagName || '').toUpperCase() === 'SELECT') {
          return String(outrosTipoSel.value || 'dirigente').trim().toLowerCase();
        }
        const checked = outrosTipoSel.querySelector('input[type="radio"][name="wdg-outros-tipo"]:checked');
        return String(checked?.value || 'dirigente').trim().toLowerCase();
      };

      const setOutrosHint = (text, kind = 'muted') => {
        if (!outrosHintEl) return;
        const msg = String(text || '').trim();
        if (!msg) {
          outrosHintEl.style.display = 'none';
          outrosHintEl.textContent = '';
          outrosHintEl.className = 'wdg-muted small mt-2';
          return;
        }
        outrosHintEl.style.display = '';
        outrosHintEl.textContent = msg;
        outrosHintEl.className = `small mt-2 ${kind === 'danger' ? 'text-danger' : 'wdg-muted'}`;
      };

      const updateOutrosAddState = () => {
        if (!outrosAddBtn) return;
        const tipo = getOutrosTipo();
        if (tipo === 'outros') {
          const nome = String(outrosNomeInp?.value || '').trim();
          outrosAddBtn.disabled = !nome;
          return;
        }
        // modo lista (novo) ou select (legado)
        if (outrosPessoaSel) {
          outrosAddBtn.disabled = !String(outrosPessoaSel.value || '').trim();
          return;
        }
        const pid = String(outrosSelected?.pessoaId || outrosPessoaIdInp?.value || '').trim();
        outrosAddBtn.disabled = !pid;
      };

      const getOutrosKey = (o) => {
        const t = String(o?.tipo || 'outros').trim().toLowerCase();
        const pid = String(o?.pessoaId || '').trim();
        const nome = String(o?.nome || '').trim().toLowerCase();
        if (pid) return `${t}:${pid}`;
        return `${t}:nome:${nome}`;
      };

      const readWindowList = (keys) => {
        for (const k of (keys || [])) {
          const arr = window[k];
          if (Array.isArray(arr)) return arr;
        }
        return [];
      };

      const buildPeopleOptions = (tipo) => {
        const t = String(tipo || '').trim().toLowerCase();
        const existingKeys = new Set((Array.isArray(state.outrosPresentes) ? state.outrosPresentes : []).map(getOutrosKey));

        const coerceEmail = (raw) => {
          const s = String(raw || '').trim();
          return (s && s.includes('@')) ? s : '';
        };

        if (t === 'morador') {
          const opts = [];
          habs.forEach((hab) => {
            (hab.moradores || []).forEach((m) => {
              const pid = String(m?.id || '').trim();
              const nome = String(m?.nome || '').trim();
              if (!pid || !nome) return;
              const key = `morador:${pid}`;
              if (existingKeys.has(key)) return;
              const label = `${nome} — ${String(hab.label || '').trim()}`;

              const email = coerceEmail(pick(m, ['email', 'mail', 'usuarioEmail', 'userEmail', 'emailUsuario']));
              const foto = pick(m, ['foto', 'fotoUrl', 'avatar', 'imagem', 'image', 'fotoPerfil', 'profilePhoto']);

              opts.push({
                pessoaId: pid,
                nome,
                label,
                habitacaoId: String(hab.id || ''),
                habitacaoLabel: String(hab.label || ''),
                email,
                foto,
                subtitulos: [String(hab.label || '').trim()].filter(Boolean)
              });
            });
          });
          return opts.sort((a, b) => String(a.label).localeCompare(String(b.label)));
        }

        if (t === 'dirigente') {
          const raw = readWindowList(['__WDG_DIRIGENTES__', '__DIRIGENTES__', '__WDG_DIRIGENCIA__']);
          return (raw || [])
            .map((p) => ({
              pessoaId: String(p?._id || p?.id || '').trim(),
              nome: String(p?.nome || p?.name || '').trim(),
              label: String(p?.nome || p?.name || '').trim(),
              email: coerceEmail(pick(p, ['email', 'mail', 'usuarioEmail', 'userEmail', 'emailUsuario'])),
              subtitulo: String(p?.cargo || p?.funcao || '').trim(),
              foto: pick(p, ['foto', 'fotoUrl', 'avatar', 'imagem', 'image', 'fotoPerfil', 'profilePhoto'])
            }))
            .filter((p) => p.pessoaId && p.nome && !existingKeys.has(`dirigente:${p.pessoaId}`))
            .sort((a, b) => String(a.label).localeCompare(String(b.label)));
        }

        if (t === 'colaborador') {
          const raw = readWindowList(['__WDG_COLABORADORES__', '__COLABORADORES__', '__WDG_COLABORACAO__']);
          return (raw || [])
            .map((p) => ({
              pessoaId: String(p?._id || p?.id || '').trim(),
              nome: String(p?.nome || p?.name || '').trim(),
              label: String(p?.nome || p?.name || '').trim(),
              email: coerceEmail(pick(p, ['email', 'mail', 'usuarioEmail', 'userEmail', 'emailUsuario'])),
              subtitulo: String(p?.cargo || p?.funcao || '').trim(),
              foto: pick(p, ['foto', 'fotoUrl', 'avatar', 'imagem', 'image', 'fotoPerfil', 'profilePhoto'])
            }))
            .filter((p) => p.pessoaId && p.nome && !existingKeys.has(`colaborador:${p.pessoaId}`))
            .sort((a, b) => String(a.label).localeCompare(String(b.label)));
        }

        return [];
      };

      const renderOutrosPeopleList = (opts) => {
        if (!outrosListEl) return;
        outrosListEl.innerHTML = '';

        const arr = Array.isArray(opts) ? opts : [];
        if (!arr.length) {
          setOutrosHint('Nenhuma pessoa encontrada.', 'muted');
          updateOutrosAddState();
          return;
        }
        setOutrosHint('', 'muted');

        arr.forEach((p) => {
          const pid = String(p?.pessoaId || '').trim();
          const nome = String(p?.nome || '').trim();
          const email = String(p?.email || '').trim();
          const subtitulo = String(p?.subtitulo || '').trim();
          const subtitulos = Array.isArray(p?.subtitulos) ? p.subtitulos : (Array.isArray(p?.subtitulos) ? p.subtitulos : []);
          const fotoRaw = String(p?.foto || '').trim();

          const rowBtn = document.createElement('button');
          rowBtn.type = 'button';
          rowBtn.className = 'wdg-row-btn';

          const row = document.createElement('div');
          row.className = 'd-flex gap-2 align-items-start p-2 wdg-recipient-row';
          if (outrosSelected && String(outrosSelected.pessoaId) === pid) row.classList.add('wdg-selected');

          const radioWrap = document.createElement('div');
          radioWrap.className = 'form-check mt-1';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'wdg_outros_pick';
          radio.className = 'form-check-input';
          radio.checked = !!(outrosSelected && String(outrosSelected.pessoaId) === pid);
          radioWrap.appendChild(radio);

          const avatar = document.createElement('div');
          avatar.className = 'rounded-circle border bg-light';
          avatar.style.width = '38px';
          avatar.style.height = '38px';
          avatar.style.overflow = 'hidden';
          avatar.style.flex = '0 0 38px';

          const img = document.createElement('img');
          const primarySrc = normalizeFotoUrl(fotoRaw);
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
          const rawLines = Array.isArray(subtitulos) ? subtitulos : [];
          rawLines.forEach((ln) => {
            const t = String(ln || '').trim();
            if (t) lines.push(t);
          });
          if (!lines.length && subtitulo) lines.push(subtitulo);
          if (!lines.length && String(p?.label || '').includes('—')) {
            const parts = String(p.label).split('—').map((s) => String(s).trim()).filter(Boolean);
            if (parts[1]) lines.push(parts[1]);
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

          rowBtn.addEventListener('click', () => {
            outrosSelected = p;
            if (outrosPessoaIdInp) outrosPessoaIdInp.value = pid;
            // re-render para aplicar estado selecionado
            renderOutrosPeopleList(outrosOptionsCache);
            updateOutrosAddState();
          });

          outrosListEl.appendChild(rowBtn);
        });

        updateOutrosAddState();
      };

      const syncOutrosUi = () => {
        const tipo = getOutrosTipo();
        const isManual = tipo === 'outros';
        if (outrosPessoaWrap) outrosPessoaWrap.classList.toggle('d-none', isManual);
        if (outrosManualWrap) outrosManualWrap.classList.toggle('d-none', !isManual);

        // troca de tipo: limpa seleção e busca
        if (tipo !== outrosLastTipo) {
          outrosLastTipo = tipo;
          outrosSelected = null;
          if (outrosPessoaIdInp) outrosPessoaIdInp.value = '';
          if (outrosSearchEl) outrosSearchEl.value = '';
        }

        // legado: select
        if (!isManual && outrosPessoaSel) {
          const labelNode = outrosPessoaWrap ? outrosPessoaWrap.querySelector('label.form-label') : null;
          if (labelNode) labelNode.textContent = tipo === 'morador'
            ? 'Morador'
            : (tipo === 'dirigente' ? 'Dirigente' : 'Colaborador');

          const opts = buildPeopleOptions(tipo);
          outrosOptionsCache = opts;
          if (!opts.length) {
            outrosPessoaSel.innerHTML = '<option value="" selected disabled>(nenhum disponível)</option>';
          } else {
            outrosPessoaSel.innerHTML = '<option value="" selected disabled>Selecione...</option>'
              + opts.map((p) => `<option value="${escapeHtml(p.pessoaId)}">${escapeHtml(p.label)}</option>`).join('');
          }
          updateOutrosAddState();
        }

        // novo: lista + busca
        if (!isManual && !outrosPessoaSel && outrosListEl) {
          const opts = buildPeopleOptions(tipo);
          outrosOptionsCache = opts;

          const q = normalizeStr(outrosSearchEl?.value || '');
          const filtered = q
            ? opts.filter((p) => {
              const hay = normalizeStr([p.nome, p.label, p.email, p.subtitulo].filter(Boolean).join(' '));
              return hay.includes(q);
            })
            : opts;

          if (!opts.length) {
            const msg = tipo === 'morador'
              ? 'Nenhum morador disponível.'
              : (tipo === 'dirigente' ? 'Nenhum dirigente disponível.' : 'Nenhum colaborador disponível.');
            setOutrosHint(msg, 'muted');
          } else {
            setOutrosHint('', 'muted');
          }
          renderOutrosPeopleList(filtered);
        }

        if (isManual) {
          if (outrosNomeInp) outrosNomeInp.value = '';
          if (outrosCpfInp) outrosCpfInp.value = '';
          if (outrosEmailInp) outrosEmailInp.value = '';
          if (outrosObsInp) outrosObsInp.value = '';
          updateOutrosAddState();
        }
      };

      if (outrosTipoSel) {
        if (String(outrosTipoSel.tagName || '').toUpperCase() === 'SELECT') {
          outrosTipoSel.addEventListener('change', syncOutrosUi);
        } else {
          outrosTipoSel
            .querySelectorAll('input[type="radio"][name="wdg-outros-tipo"]')
            .forEach((r) => r.addEventListener('change', syncOutrosUi));
        }
      }

      outrosSearchEl?.addEventListener('input', () => {
        if (outrosPessoaSel) return; // legado
        const tipo = getOutrosTipo();
        if (tipo === 'outros') return;
        const opts = outrosOptionsCache || [];
        const q = normalizeStr(outrosSearchEl.value || '');
        const filtered = q
          ? opts.filter((p) => {
            const hay = normalizeStr([p.nome, p.label, p.email, p.subtitulo].filter(Boolean).join(' '));
            return hay.includes(q);
          })
          : opts;
        renderOutrosPeopleList(filtered);
      });

      outrosRefreshBtn?.addEventListener('click', () => syncOutrosUi());

      outrosNomeInp?.addEventListener('input', () => updateOutrosAddState());
      syncOutrosUi();

      if (!habs.length) {
        setInlineAlert('wdg-pres-form-error', 'Diretório de habitações não carregado. Esta tela não vai simular dados: a view/backend precisa fornecer window.__HABITACOES__ (array) para permitir seleção.');
      }

      // Picker: representante da habitação (Seleção)
      const repTipoSel = el('wdg-rep-tipo');
      const repPessoaIdInp = el('wdg-rep-pessoa-id');
      const repSearchEl = el('wdg-rep-search');
      const repRefreshBtn = el('wdg-rep-refresh');
      const repListEl = el('wdg-rep-list');
      const repHintEl = el('wdg-rep-hint');

      const repPessoaWrap = el('wdg-rep-pessoa-wrap');
      const repManualWrap = el('wdg-rep-procurador-manual-wrap');

      const repProcNome = el('wdg-rep-proc-nome');
      const repProcCpf = el('wdg-rep-proc-cpf');
      const repProcEmail = el('wdg-rep-proc-email');
      const repProcObs = el('wdg-rep-proc-obs');

      let repSelected = null;
      let repOptionsCache = [];

      const getRepTipo = () => {
        if (!repTipoSel) return 'proprietario';
        const checked = repTipoSel.querySelector('input[type="radio"][name="wdg-rep-tipo"]:checked');
        return String(checked?.value || 'proprietario').trim() || 'proprietario';
      };

      const setRepHint = (text, kind = 'muted') => {
        if (!repHintEl) return;
        const msg = String(text || '').trim();
        if (!msg) {
          repHintEl.style.display = 'none';
          repHintEl.textContent = '';
          repHintEl.className = 'wdg-muted small mt-2';
          return;
        }
        repHintEl.style.display = '';
        repHintEl.textContent = msg;
        repHintEl.className = `small mt-2 ${kind === 'danger' ? 'text-danger' : 'wdg-muted'}`;
      };

      const renderRepPeopleList = (opts) => {
        if (!repListEl) return;
        repListEl.innerHTML = '';

        const arr = Array.isArray(opts) ? opts : [];
        if (!arr.length) {
          // hint é definido no syncRepUi
          return;
        }
        setRepHint('', 'muted');

        arr.forEach((p) => {
          const pid = String(p?.pessoaId || '').trim();
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
          if (repSelected && String(repSelected.pessoaId) === pid) row.classList.add('wdg-selected');

          const radioWrap = document.createElement('div');
          radioWrap.className = 'form-check mt-1';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'wdg_rep_pick';
          radio.className = 'form-check-input';
          radio.checked = !!(repSelected && String(repSelected.pessoaId) === pid);
          radioWrap.appendChild(radio);

          const avatar = document.createElement('div');
          avatar.className = 'rounded-circle border bg-light';
          avatar.style.width = '38px';
          avatar.style.height = '38px';
          avatar.style.overflow = 'hidden';
          avatar.style.flex = '0 0 38px';

          const img = document.createElement('img');
          const primarySrc = normalizeFotoUrl(fotoRaw);
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
          (Array.isArray(subtitulos) ? subtitulos : []).forEach((ln) => {
            const t = String(ln || '').trim();
            if (t) lines.push(t);
          });
          if (!lines.length && subtitulo) lines.push(subtitulo);
          if (!lines.length && String(p?.label || '').includes('—')) {
            const parts = String(p.label).split('—').map((s) => String(s).trim()).filter(Boolean);
            if (parts[1]) lines.push(parts[1]);
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

          rowBtn.addEventListener('click', () => {
            repSelected = p;
            if (repPessoaIdInp) repPessoaIdInp.value = pid;
            renderRepPeopleList(repOptionsCache);
          });

          repListEl.appendChild(rowBtn);
        });
      };

      const buildRepOptions = ({ tipo, hab }) => {
        const t = String(tipo || '').trim();
        if (!hab) return [];
        if (t === 'proprietario') {
          const props = Array.isArray(hab.proprietarios) ? hab.proprietarios : [];
          return props
            .map((p) => ({
              pessoaId: String(p?.id || p?._id || '').trim(),
              nome: String(p?.nome || p?.name || '').trim(),
              label: String(p?.nome || p?.name || '').trim(),
              email: String(p?.email || p?.mail || '').trim(),
              foto: String(p?.foto || p?.fotoUrl || p?.avatar || p?.imagem || p?.image || p?.fotoPerfil || p?.profilePhoto || '').trim(),
              userId: String(p?.usuario_id || p?.usuarioId || p?.userId || '').trim(),
              condUsuarioId: String(p?.cond_usuario_id || p?.condUsuarioId || '').trim(),
              subtitulos: [String(hab.label || '').trim()].filter(Boolean)
            }))
            .filter((x) => x && x.pessoaId && x.nome)
            .sort((a, b) => String(a.label).localeCompare(String(b.label)));
        }
        if (t === 'inquilino_autorizado') {
          const mors = Array.isArray(hab.moradores) ? hab.moradores : [];
          return mors
            .map((m) => ({
              pessoaId: String(m?.id || m?._id || '').trim(),
              nome: String(m?.nome || m?.name || '').trim(),
              label: String(m?.nome || m?.name || '').trim(),
              email: String(m?.email || m?.mail || m?.usuarioEmail || m?.userEmail || m?.emailUsuario || '').trim(),
              foto: String(m?.foto || m?.fotoUrl || m?.avatar || m?.imagem || m?.image || m?.fotoPerfil || m?.profilePhoto || '').trim(),
              userId: String(m?.usuario_id || m?.usuarioId || m?.userId || '').trim(),
              condUsuarioId: String(m?.cond_usuario_id || m?.condUsuarioId || '').trim(),
              subtitulos: [String(hab.label || '').trim()].filter(Boolean)
            }))
            .filter((x) => x && x.pessoaId && x.nome)
            .sort((a, b) => String(a.label).localeCompare(String(b.label)));
        }
        return [];
      };

      const syncRepUi = ({ hab }) => {
        const tipo = getRepTipo();

        // visibilidade (caso syncProcRequired não exista por algum motivo)
        if (repPessoaWrap) repPessoaWrap.classList.toggle('d-none', tipo === 'procurador');
        if (repManualWrap) repManualWrap.classList.toggle('d-none', tipo !== 'procurador');

        if (tipo === 'procurador') {
          repOptionsCache = [];
          if (repListEl) repListEl.innerHTML = '';
          setRepHint('', 'muted');
          return;
        }

        if (!hab) {
          repSelected = null;
          if (repPessoaIdInp) repPessoaIdInp.value = '';
          repOptionsCache = [];
          if (repListEl) repListEl.innerHTML = '';
          setRepHint('Selecione uma habitação.', 'muted');
          return;
        }

        const opts = buildRepOptions({ tipo, hab });
        repOptionsCache = opts;

        // se seleção ficou inválida (trocou hab/tipo)
        if (repSelected && !opts.some((x) => String(x.pessoaId) === String(repSelected.pessoaId))) {
          repSelected = null;
          if (repPessoaIdInp) repPessoaIdInp.value = '';
        }

        const q = normalizeStr(repSearchEl?.value || '');
        const filtered = q
          ? opts.filter((p) => {
            const hay = normalizeStr([p.nome, p.label, p.email, p.subtitulo].filter(Boolean).join(' '));
            return hay.includes(q);
          })
          : opts;

        if (!opts.length) {
          setRepHint(tipo === 'proprietario'
            ? 'Nenhum proprietário disponível.'
            : 'Nenhum inquilino disponível.', 'muted');
        } else {
          setRepHint('', 'muted');
        }

        renderRepPeopleList(filtered);
      };

      // Picker de habitação (mesmo conceito usado em Enquetes, porém single-select local)
      const habValue = el('wdg-habitacao-id');
      const pickerRoot = document.querySelector('[data-pres-picker="habitacao"]');
      const pickerInput = pickerRoot ? pickerRoot.querySelector('[data-pres-picker-input]') : null;
      const pickerMenu = pickerRoot ? pickerRoot.querySelector('[data-pres-picker-menu]') : null;
      const pickerBox = pickerRoot ? pickerRoot.querySelector('[data-pres-picker-box]') : null;
      const pickerTokens = pickerRoot ? pickerRoot.querySelector('[data-pres-picker-tokens]') : null;
      const pickerPlaceholder = pickerRoot ? pickerRoot.querySelector('[data-pres-picker-placeholder]') : null;

      const syncPickerChrome = () => {
        if (!pickerPlaceholder || !pickerInput) return;
        const hasToken = !!(pickerTokens && pickerTokens.querySelector && pickerTokens.querySelector('[data-pres-token]'));
        const hasText = !!String(pickerInput.value || '').trim();
        pickerPlaceholder.hidden = hasToken || hasText;
        try {
          pickerBox?.classList?.toggle('is-empty', !(hasToken || hasText));
        } catch { /* noop */ }
      };

      const renderPickerToken = (hab) => {
        if (!pickerTokens) return;
        if (!hab) {
          pickerTokens.innerHTML = '';
          syncPickerChrome();
          return;
        }
        pickerTokens.innerHTML = `<span class="wdg-pres-token" data-pres-token data-val="${escapeHtml(hab.id)}" title="${escapeHtml(getHabitationTokenText(hab))}">${renderHabitationTokenHtml(hab)}<button type="button" data-pres-token-del aria-label="Remover">×</button></span>`;
        syncPickerChrome();
      };

      const closeMenu = () => {
        if (pickerMenu) pickerMenu.hidden = true;
      };

      const openMenu = () => {
        if (!pickerMenu || !pickerInput) return;
        if (!habs.length) {
          // Não abre menu “vazio” sem explicar o motivo
          try { pickerMenu.hidden = true; } catch { /* noop */ }
          return;
        }
        renderHabitationOptions({ list: habs, filter: pickerInput.value });
        pickerMenu.hidden = false;
      };

      const setSelectedHab = (hab, opts = {}) => {
        if (!habValue) return;
        const keepOk = !!opts.keepOk;
        habValue.value = hab ? String(hab.id) : '';
        setInlineAlert('wdg-pres-form-error', '');
        if (!keepOk) setInlineAlert('wdg-pres-form-ok', '');
        if (pickerInput) pickerInput.value = '';
        renderPickerToken(hab);
        syncPickerChrome();
        syncFormForSelectedHab({ hab });
        syncProcRequired();
        syncRepUi({ hab });
      };

      // init
      if (pickerInput && pickerMenu && habValue && String(habValue.value || '').trim()) {
        const habInit = habById.get(String(habValue.value || '').trim()) || null;
        if (habInit) setSelectedHab(habInit, { keepOk: true });
      } else {
        // sem seleção
        syncFormForSelectedHab({ hab: null });
        renderPickerToken(null);
        syncPickerChrome();
      }

      // eventos
      pickerInput?.addEventListener('focus', openMenu);
      pickerInput?.addEventListener('click', openMenu);
      pickerBox?.addEventListener('click', () => {
        try { pickerInput?.focus(); } catch { /* noop */ }
        openMenu();
      });
      pickerTokens?.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('[data-pres-token-del]') : null;
        if (!btn) return;
        setSelectedHab(null, { keepOk: true });
        closeMenu();
        try { pickerInput?.focus(); } catch { /* noop */ }
      });
      pickerInput?.addEventListener('input', () => {
        syncPickerChrome();
        openMenu();
      });
      pickerInput?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          closeMenu();
          return;
        }
        if (ev.key === 'Backspace') {
          const hasText = !!String(pickerInput?.value || '').trim();
          const hasSel = !!String(habValue?.value || '').trim();
          if (!hasText && hasSel) {
            setSelectedHab(null, { keepOk: true });
            syncPickerChrome();
            openMenu();
          }
        }
      });
      pickerMenu?.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('[data-hab-id]') : null;
        const id = btn ? String(btn.getAttribute('data-hab-id') || '').trim() : '';
        if (!id) return;
        const hab = habById.get(id) || null;
        if (!hab) return;
        setSelectedHab(hab);
        closeMenu();
      });
      pickerRoot?.addEventListener('focusout', (ev) => {
        if (!pickerRoot || !pickerMenu) return;
        const next = ev.relatedTarget;
        if (next && pickerRoot.contains(next)) return;
        closeMenu();
      });

      // votação: badge/menu
      (execRoot || document)
        .querySelectorAll('#wdg-voto-menu [data-voto-set]')
        .forEach((btn) => {
          btn.addEventListener('click', () => {
            const badge = el('wdg-voto-badge');
            if (badge && badge.getAttribute('aria-disabled') === 'true') return;
            const v = String(btn.getAttribute('data-voto-set') || '').trim();
            if (!v) return;
            const votoEl = el('wdg-voto-status');
            if (votoEl) votoEl.value = v;
            const habId = String(el('wdg-habitacao-id')?.value || '').trim();
            const hab = habId ? (habById.get(habId) || null) : null;
            syncVotoControls({ hab });
          });
        });

      // tipo representante
      repTipoSel
        ?.querySelectorAll('input[type="radio"][name="wdg-rep-tipo"]')
        .forEach((r) => r.addEventListener('change', () => {
          setInlineAlert('wdg-pres-form-error', '');
          setInlineAlert('wdg-pres-form-ok', '');
          repSelected = null;
          if (repPessoaIdInp) repPessoaIdInp.value = '';
          if (repSearchEl) repSearchEl.value = '';
          if (repProcNome) repProcNome.value = '';
          if (repProcCpf) repProcCpf.value = '';
          if (repProcEmail) repProcEmail.value = '';
          if (repProcObs) repProcObs.value = '';
          syncProcRequired();
          const habId = String(el('wdg-habitacao-id')?.value || '').trim();
          const hab = habId ? (habById.get(habId) || null) : null;
          syncRepUi({ hab });
        }));

      repSearchEl?.addEventListener('input', () => {
        const opts = repOptionsCache || [];
        const q = normalizeStr(repSearchEl.value || '');
        const filtered = q
          ? opts.filter((p) => {
            const hay = normalizeStr([p.nome, p.label, p.email, p.subtitulo].filter(Boolean).join(' '));
            return hay.includes(q);
          })
          : opts;
        renderRepPeopleList(filtered);
      });

      repRefreshBtn?.addEventListener('click', () => {
        const habId = String(el('wdg-habitacao-id')?.value || '').trim();
        const hab = habId ? (habById.get(habId) || null) : null;
        syncRepUi({ hab });
      });

      // Defaults
      syncProcRequired();
      try {
        const habId = String(el('wdg-habitacao-id')?.value || '').trim();
        const hab = habId ? (habById.get(habId) || null) : null;
        syncRepUi({ hab });
      } catch { /* noop */ }

      // Limpar
      el('wdg-btn-limpar')?.addEventListener('click', () => {
        setInlineAlert('wdg-pres-form-error', '');
        setInlineAlert('wdg-pres-form-ok', '');
        try { el('wdg-form-presence')?.reset(); } catch { /* noop */ }
        repSelected = null;
        if (repPessoaIdInp) repPessoaIdInp.value = '';
        if (repSearchEl) repSearchEl.value = '';
        setSelectedHab(null, { keepOk: true });
        syncVotoControls({ hab: null });
      });

      // export/import
      el('wdg-btn-export-json')?.addEventListener('click', exportPresencesJson);
      el('wdg-btn-import-json')?.addEventListener('click', () => {
        dbgPres('ui.import.click');
        const inp = el('wdg-import-json-file');
        if (inp) inp.click();
      });
      el('wdg-import-json-file')?.addEventListener('change', async (ev) => {
        const f = ev.target && ev.target.files && ev.target.files[0] ? ev.target.files[0] : null;
        ev.target.value = '';
        if (!f) return;
        try {
          await importPresencesJson(f);
        } catch (e) {
          setInlineAlert('wdg-pres-form-error', e.message);
        }
      });

      // modal doc replace/remove
      el('wdg-doc-remove')?.addEventListener('click', () => {
        const id = String(state.currentDocPresenceId || '').trim();
        if (!id) return;
        dbgPres('doc.remove.blocked', { id });
        flashError('Edição de documento local desabilitada. Recarregue o estado pelo backend.');
        const box = el('wdg-doc-meta');
        if (box) box.textContent = 'Operação indisponível nesta fase.';
        const btnRemove = el('wdg-doc-remove');
        if (btnRemove) btnRemove.disabled = false;
      });

      el('wdg-doc-save')?.addEventListener('click', () => {
        const id = String(state.currentDocPresenceId || '').trim();
        if (!id) return;
        const file = el('wdg-doc-replace')?.files?.[0] || null;
        const meta = fileMeta(file);
        if (!meta) return;
        dbgPres('doc.save.blocked', { id, meta });
        flashError('Edição de documento local desabilitada. Recarregue o estado pelo backend.');
        const box = el('wdg-doc-meta');
        if (box) box.textContent = 'Operação indisponível nesta fase.';
        const btnRemove = el('wdg-doc-remove');
        if (btnRemove) btnRemove.disabled = true;
        const replace = el('wdg-doc-replace');
        if (replace) replace.value = '';
      });

      el('wdg-form-presence')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        setInlineAlert('wdg-pres-form-error', '');
        setInlineAlert('wdg-pres-form-ok', '');

        const habId = String(el('wdg-habitacao-id')?.value || '').trim();
        const hab = habId ? (habById.get(habId) || null) : null;
        if (!hab) {
          setInlineAlert('wdg-pres-form-error', 'Selecione uma habitação para registrar presença.');
          return;
        }

        if (isPresenceBlockedByInadimplencia(hab)) {
          setInlineAlert('wdg-pres-form-error', 'Presença bloqueada: habitação inadimplente (conforme configuração).');
          return;
        }

        const participanteTipo = (() => {
          const checked = (execRoot || document).querySelector('#wdg-rep-tipo input[type="radio"][name="wdg-rep-tipo"]:checked');
          return String(checked?.value || '').trim();
        })();
        if (!participanteTipo) {
          setInlineAlert('wdg-pres-form-error', 'Selecione o tipo de representante.');
          return;
        }

        let participanteNome = '';
        let participanteCpf = '';
        let participanteEmail = '';
        let participanteObs = '';
        let participanteUserId = '';
        let participanteCondUsuarioId = '';

        if (participanteTipo === 'procurador') {
          participanteNome = String(repProcNome?.value || '').trim();
          participanteCpf = String(repProcCpf?.value || '').trim();
          participanteEmail = String(repProcEmail?.value || '').trim();
          participanteObs = String(repProcObs?.value || '').trim();
          if (!participanteNome) {
            setInlineAlert('wdg-pres-form-error', 'Informe o nome do procurador.');
            return;
          }
        } else {
          const pid = String(repSelected?.pessoaId || repPessoaIdInp?.value || '').trim();
          const nome = String(repSelected?.nome || '').trim();
          if (!pid || !nome) {
            setInlineAlert('wdg-pres-form-error', 'Selecione uma pessoa.');
            return;
          }
          participanteNome = nome;
          participanteUserId = String(repSelected?.userId || '').trim();
          participanteCondUsuarioId = String(repSelected?.condUsuarioId || '').trim();
        }

        const votoStatus = String(el('wdg-voto-status')?.value || 'votante').trim();
        const isVotante = votoStatus !== 'nao_votante';
        const motivoNaoVotante = '';

        const fileInput = el('wdg-anexo-file');
        const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        const docMeta = fileMeta(file);
        const requiresDoc = participanteTipo !== 'proprietario';
        if (requiresDoc && !docMeta) {
          setInlineAlert('wdg-pres-form-error', 'Procuração obrigatória para este tipo de representante.');
          return;
        }

        const status = participanteTipo === 'proprietario' ? 'aprovado' : 'pendente';

        try {
          await submitRepresentativePresence({
            hab,
            participanteTipo,
            participanteNome,
            participanteCpf,
            participanteEmail,
            participanteObs,
            participanteUserId,
            participanteCondUsuarioId,
            source: 'gestor',
            status,
            docMeta: docMeta || null,
            isVotante,
            motivoNaoVotante
          });
          await reloadExecutionState();
          setInlineAlert('wdg-pres-form-ok', status === 'aprovado'
            ? 'Presença registrada e aprovada (proprietário).'
            : 'Presença registrada como pendente (aguardando moderação).');
          ev.target.reset();
          repSelected = null;
          if (repPessoaIdInp) repPessoaIdInp.value = '';
          if (repSearchEl) repSearchEl.value = '';
          syncProcRequired();
          setSelectedHab(null, { keepOk: true });
        } catch (e) {
          setInlineAlert('wdg-pres-form-error', e.message);
        }
      });

      // Outros presentes
      el('wdg-outros-add')?.addEventListener('click', () => {
        setInlineAlert('wdg-pres-form-error', '');
        const tipo = getOutrosTipo();
        if (!tipo) return;

        const existingKeys = new Set((Array.isArray(state.outrosPresentes) ? state.outrosPresentes : []).map(getOutrosKey));

        let payload = null;
        if (tipo === 'outros') {
          const nome = String(outrosNomeInp?.value || '').trim();
          if (!nome) {
            setInlineAlert('wdg-pres-form-error', 'Informe o nome.');
            return;
          }
          const cpf = String(outrosCpfInp?.value || '');
          const email = String(outrosEmailInp?.value || '').trim();
          const obs = String(outrosObsInp?.value || '').trim();
          payload = { tipo, nome, cpf, email, obs };
        } else {
          if (outrosPessoaSel) {
            const pessoaId = String(outrosPessoaSel?.value || '').trim();
            if (!pessoaId) {
              setInlineAlert('wdg-pres-form-error', 'Selecione uma pessoa.');
              return;
            }
            const selectedText = String(outrosPessoaSel?.selectedOptions?.[0]?.textContent || '').trim();
            const nome = selectedText ? selectedText.split('—')[0].trim() : '';
            const opt = (outrosOptionsCache || []).find((x) => String(x?.pessoaId || '') === pessoaId) || null;
            payload = {
              tipo,
              pessoaId,
              nome: nome || selectedText,
              email: String(opt?.email || '').trim(),
              habitacaoId: String(opt?.habitacaoId || '').trim(),
              habitacaoLabel: String(opt?.habitacaoLabel || '').trim()
            };
          } else {
            const pessoaId = String(outrosSelected?.pessoaId || outrosPessoaIdInp?.value || '').trim();
            if (!pessoaId) {
              setInlineAlert('wdg-pres-form-error', 'Selecione uma pessoa.');
              return;
            }
            const nome = String(outrosSelected?.nome || '').trim();
            payload = {
              tipo,
              pessoaId,
              nome,
              email: String(outrosSelected?.email || '').trim(),
              habitacaoId: String(outrosSelected?.habitacaoId || '').trim(),
              habitacaoLabel: String(outrosSelected?.habitacaoLabel || '').trim()
            };
          }
        }

        const norm = normalizeOutro(payload);
        const key = getOutrosKey(norm);
        if (existingKeys.has(key)) {
          setInlineAlert('wdg-pres-form-error', 'Esta pessoa já está na lista.');
          return;
        }

        state.outrosPresentes = (Array.isArray(state.outrosPresentes) ? state.outrosPresentes : []).concat([norm]);

        // limpar UI
        if (tipo === 'outros') {
          if (outrosNomeInp) outrosNomeInp.value = '';
          if (outrosCpfInp) outrosCpfInp.value = '';
          if (outrosEmailInp) outrosEmailInp.value = '';
          if (outrosObsInp) outrosObsInp.value = '';
        } else {
          try { if (outrosPessoaSel) outrosPessoaSel.value = ''; } catch { /* noop */ }
          outrosSelected = null;
          if (outrosPessoaIdInp) outrosPessoaIdInp.value = '';
        }
        renderPresences(getBackendPresences());
        persistLocal();
        syncOutrosUi();
      });

      // Portal simulation
      const modalPortalEl = el('wdg-modal-portal-presence');
      const portalBtn = el('wdg-btn-simular-portal');
      const portalHab = el('wdg-portal-hab');
      const portalTipo = el('wdg-portal-tipo');
      const portalNome = el('wdg-portal-nome');
      const portalDoc = el('wdg-portal-doc');
      const portalErr = el('wdg-portal-error');
      const portalSubmit = el('wdg-portal-submit');

      if (portalHab) {
        portalHab.innerHTML = habs
          .slice()
          .sort((a, b) => String(a.label).localeCompare(String(b.label)))
          .map((h) => {
            const inad = h.inadimplente ? ' (inadimplente)' : '';
            return `<option value="${escapeHtml(h.id)}">${escapeHtml(h.label + inad)}</option>`;
          })
          .join('');
      }

      portalBtn?.addEventListener('click', () => {
        if (portalErr) hide(portalErr);
        if (portalErr) portalErr.textContent = '';
        if (portalNome) portalNome.value = '';
        if (portalDoc) portalDoc.value = '';
        try {
          if (modalPortalEl && window.bootstrap && window.bootstrap.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(modalPortalEl).show();
          }
        } catch { /* noop */ }
      });

      portalSubmit?.addEventListener('click', async () => {
        if (portalErr) hide(portalErr);
        if (portalErr) portalErr.textContent = '';

        const habId = String(portalHab?.value || '').trim();
        const hab = habId ? (habById.get(habId) || null) : null;
        if (!hab) {
          if (portalErr) { portalErr.textContent = 'Selecione a habitação.'; show(portalErr); }
          return;
        }

        if (isPresenceBlockedByInadimplencia(hab)) {
          if (portalErr) { portalErr.textContent = 'Presença bloqueada: habitação inadimplente (conforme configuração).'; show(portalErr); }
          return;
        }

        const tipo = String(portalTipo?.value || '').trim();
        const nome = String(portalNome?.value || '').trim();
        if (!nome) {
          if (portalErr) { portalErr.textContent = 'Informe o nome.'; show(portalErr); }
          return;
        }

        const file = portalDoc && portalDoc.files && portalDoc.files[0] ? portalDoc.files[0] : null;
        const docMeta = fileMeta(file);
        const requiresDoc = tipo !== 'proprietario';
        if (requiresDoc && !docMeta) {
          if (portalErr) { portalErr.textContent = 'Procuração obrigatória para este tipo de participante.'; show(portalErr); }
          return;
        }

        const cfgA = getAssembleiaConfig();
        const status = (tipo !== 'proprietario')
          ? 'pendente'
          : (cfgA.exigirAprovacaoModeradorRemoto ? 'pendente' : 'aprovado');

        try {
          await submitRepresentativePresence({ hab, participanteTipo: tipo, participanteNome: nome, source: 'portal', status, docMeta: docMeta || null });
          await reloadExecutionState();
          try {
            if (modalPortalEl && window.bootstrap && window.bootstrap.Modal) {
              window.bootstrap.Modal.getOrCreateInstance(modalPortalEl).hide();
            }
          } catch { /* noop */ }
        } catch (e) {
          if (portalErr) { portalErr.textContent = e.message; show(portalErr); }
        }
      });
    }

    el('wdg-pin-presence-submit')?.addEventListener('click', async () => {
      try {
        const selectedRef = String(el('wdg-pin-presence-id')?.value || state.pendingPinPresenceId || '').trim();
        const selectedPresence = getBackendPresences().find((x) => {
          const pid = String(x?.presenceId || x?.id || '').trim();
          const pkey = String(x?.key || '').trim();
          return pid === selectedRef || pkey === selectedRef;
        }) || null;
        const presenceId = String(selectedPresence?.presenceId || selectedPresence?.id || selectedRef || '').trim();
        const presenceKey = String(selectedPresence?.key || '').trim();
        const senha = String(el('wdg-pin-presence-value')?.value || '').trim();
        if ((!presenceId && !presenceKey) || !senha || !assembleiaId) {
          flashError('Informe o PIN/senha para confirmar presença.');
          return;
        }
        await api('/presence/confirm', { method: 'POST', body: { presenceId, presenceKey, senha } });
        flashSuccess('Presença confirmada por PIN/senha.');
        try {
          const modalEl = el('wdg-modal-confirmar-pin');
          if (modalEl && window.bootstrap && window.bootstrap.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          }
        } catch { /* noop */ }
        state.pendingPinPresenceId = null;
        await reloadExecutionState();
      } catch (e) {
        flashError(e?.message || 'Falha ao confirmar presença por PIN.');
      }
    });

    el('wdg-pin-presence-value')?.addEventListener('keydown', (ev) => {
      try {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        el('wdg-pin-presence-submit')?.click();
      } catch { /* noop */ }
    });

    // Sem assembleiaId: mantém abas + presenças local.
    if (!assembleiaId || !apiBase) {
      return;
    }

    // top actions
    el('wdg-btn-refresh')?.addEventListener('click', () => reloadExecutionState());

    el('wdg-btn-open')?.addEventListener('click', async () => {
      try {
        await api('/open', { method: 'POST', body: {} });
        flashSuccess('Sessão aberta.');
        await reloadExecutionState();
      } catch (e) {
        flashError(e.message);
      }
    });

    const pauseHandler = async () => {
      try {
        await api('/pause', { method: 'POST', body: {} });
        flashSuccess('Estado de pausa atualizado.');
        await reloadExecutionState();
      } catch (e) {
        flashError(e.message);
      }
    };
    el('wdg-btn-pause')?.addEventListener('click', pauseHandler);

    const closeHandler = async () => {
      try {
        await api('/close', { method: 'POST', body: {} });
        flashSuccess('Sessão encerrada.');
        await reloadExecutionState();
      } catch (e) {
        flashError(e.message);
      }
    };
    el('wdg-btn-close')?.addEventListener('click', closeHandler);
    el('wdg-btn-close-2')?.addEventListener('click', closeHandler);

    // Presenças via API (desabilitado): esta aba opera em memória por enquanto.

    // agenda
    el('wdg-btn-agenda-prev')?.addEventListener('click', async () => {
      try {
        await api('/agenda', { method: 'POST', body: { action: 'prev' } });
        flashSuccess('Pauta: item anterior.');
        await reloadExecutionState();
      } catch (e) {
        flashError(e.message);
      }
    });

    el('wdg-btn-agenda-next')?.addEventListener('click', async () => {
      try {
        await api('/agenda', { method: 'POST', body: { action: 'next' } });
        flashSuccess('Pauta: próximo item.');
        await reloadExecutionState();
      } catch (e) {
        flashError(e.message);
      }
    });

    el('wdg-btn-agenda-discuss')?.addEventListener('click', async () => {
      try {
        await api('/agenda', { method: 'POST', body: { action: 'start_discussion' } });
        flashSuccess('Discussão iniciada.');
        await reloadExecutionState();
      } catch (e) {
        flashError(e.message);
      }
    });

    // voting
    el('wdg-btn-vote-open')?.addEventListener('click', async () => {
      try {
        const ruleType = String(el('wdg-vote-rule')?.value || 'maioria_simples');
        const voteType = String(el('wdg-vote-type')?.value || 'sim_nao_abstencao');
        await api('/vote/open', { method: 'POST', body: { ruleType, voteType } });
        flashSuccess('Votação aberta.');
        await reloadExecutionState();
      } catch (e) {
        flashError(e.message);
      }
    });

    el('wdg-btn-vote-close')?.addEventListener('click', async () => {
      try {
        await api('/vote/close', { method: 'POST', body: {} });
        flashSuccess('Votação fechada.');
        await reloadExecutionState();
      } catch (e) {
        flashError(e.message);
      }
    });

    el('wdg-form-vote')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const presenceKey = String(fd.get('presenceKey') || '').trim();
      const choice = String(fd.get('choice') || '').trim();
      if (!presenceKey || !choice) return;

      try {
        await api('/vote', { method: 'POST', body: { presenceKey, choice } });
        flashSuccess('Voto registrado.');
        await reloadExecutionState();
      } catch (e) {
        flashError(e.message);
      }
    });

    // ata
    el('wdg-btn-ata-load')?.addEventListener('click', async () => {
      try {
        const data = await api('/ata');
        const text = data?.ataText || data?.text || '';
        const ta = el('wdg-ata-text');
        if (ta) ta.value = String(text);
        flashSuccess('Prévia da ata carregada.');
      } catch (e) {
        flashError(e.message);
      }
    });

    // pause polling when hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopPolling();
      else startPolling();
    });
  };

  const boot = async () => {
    bind();
    if (!assembleiaId || !apiBase) return;
    await reloadExecutionState();
    startPolling();
  };

  boot();
})();
