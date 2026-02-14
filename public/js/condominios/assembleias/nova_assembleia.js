(function () {
  'use strict';

  const root = document.getElementById('novaAssembleiaApp');
  if (!root) return;

  function qs(sel, el) {
    return (el || document).querySelector(sel);
  }

  function qsa(sel, el) {
    return Array.from((el || document).querySelectorAll(sel));
  }

  function getChoiceValueByDataAttr(dataAttrSelector) {
    const el = qs(dataAttrSelector);
    if (!el) return '';

    // Select
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'SELECT') return String(el.value || '');

    // Radio group
    const type = String(el.getAttribute('type') || '').toLowerCase();
    if (type === 'radio') {
      const name = String(el.getAttribute('name') || '').trim();
      if (!name) return String(el.value || '');
      const checked = qs(`input[type="radio"][name="${name}"]:checked`);
      return String(checked?.value || '');
    }

    // Fallback
    return String(el.value || '');
  }

  function safeJsonParse(text) {
    try {
      const s = String(text || '').trim();
      if (!s) return null;
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  const DEFAULT_REGRAS_RECOMMENDED = {
    voteMode: 'POR_FRACAO',
    delinquencyPolicy: 'BLOQUEIA_VOTO',
    eligibility: {
      allowOwner: true,
      allowProxyWithPoA: true,
      allowTenantWithAuthorization: false,
      allowThirdPartyWithPoA: true
    },
    requirePoAIfNotOwner: true,
    presence: {
      allowRemotePresence: true,
      requireModeratorApprovalForRemote: true
    },
    quorum: {
      installationBase: 'PRESENTES',
      metric: 'FRACAO'
    },
    audit: {
      requireReasonOnOverride: true
    }
  };

  function normalizeRegras(input) {
    const r = (input && typeof input === 'object') ? input : {};

    const voteMode = (r.voteMode === 'POR_UNIDADE' || r.voteMode === 'POR_FRACAO') ? r.voteMode : DEFAULT_REGRAS_RECOMMENDED.voteMode;
    const delinquencyPolicy = (r.delinquencyPolicy === 'BLOQUEIA_VOTO' || r.delinquencyPolicy === 'APENAS_AVISO' || r.delinquencyPolicy === 'BLOQUEIA_PRESENCA_E_VOTO')
      ? r.delinquencyPolicy
      : DEFAULT_REGRAS_RECOMMENDED.delinquencyPolicy;

    const eligibilityIn = (r.eligibility && typeof r.eligibility === 'object') ? r.eligibility : {};
    const eligibility = {
      allowOwner: !!eligibilityIn.allowOwner,
      allowProxyWithPoA: !!eligibilityIn.allowProxyWithPoA,
      allowTenantWithAuthorization: !!eligibilityIn.allowTenantWithAuthorization,
      allowThirdPartyWithPoA: !!eligibilityIn.allowThirdPartyWithPoA
    };

    let requirePoAIfNotOwner = !!r.requirePoAIfNotOwner;
    if (!eligibility.allowProxyWithPoA && requirePoAIfNotOwner) requirePoAIfNotOwner = false;

    const presenceIn = (r.presence && typeof r.presence === 'object') ? r.presence : {};
    const presence = {
      allowRemotePresence: !!presenceIn.allowRemotePresence,
      requireModeratorApprovalForRemote: !!presenceIn.requireModeratorApprovalForRemote
    };
    if (!presence.allowRemotePresence) presence.requireModeratorApprovalForRemote = false;

    const quorumIn = (r.quorum && typeof r.quorum === 'object') ? r.quorum : {};
    const installationBase = (quorumIn.installationBase === 'TOTAL' || quorumIn.installationBase === 'ADIMPLENTES' || quorumIn.installationBase === 'PRESENTES')
      ? quorumIn.installationBase
      : DEFAULT_REGRAS_RECOMMENDED.quorum.installationBase;

    let metric = (quorumIn.metric === 'UNIDADES' || quorumIn.metric === 'FRACAO')
      ? quorumIn.metric
      : (voteMode === 'POR_FRACAO' ? 'FRACAO' : 'UNIDADES');
    if (voteMode === 'POR_FRACAO') metric = 'FRACAO';
    if (voteMode === 'POR_UNIDADE' && metric === 'FRACAO') metric = 'UNIDADES';

    const auditIn = (r.audit && typeof r.audit === 'object') ? r.audit : {};
    const audit = { requireReasonOnOverride: (auditIn.requireReasonOnOverride === false) ? false : true };

    return {
      voteMode,
      delinquencyPolicy,
      eligibility,
      requirePoAIfNotOwner,
      presence,
      quorum: { installationBase, metric },
      audit
    };
  }

  function formatResumoRegras(regras) {
    const r = normalizeRegras(regras);

    const voto = r.voteMode === 'POR_FRACAO' ? 'Fração ideal' : 'Unidade';
    const inad = r.delinquencyPolicy === 'BLOQUEIA_VOTO'
      ? 'não votam'
      : (r.delinquencyPolicy === 'APENAS_AVISO' ? 'apenas aviso' : 'sem presença e sem voto');

    const quem = [];
    if (r.eligibility.allowOwner) quem.push('Proprietário');
    if (r.eligibility.allowProxyWithPoA) quem.push('Procurador com procuração');
    if (r.eligibility.allowTenantWithAuthorization) quem.push('Inquilino com autorização');
    if (r.eligibility.allowThirdPartyWithPoA) quem.push('Terceiro com procuração');

    const presenca = r.presence.allowRemotePresence
      ? (r.presence.requireModeratorApprovalForRemote ? 'permitida (com aprovação do moderador)' : 'permitida')
      : 'somente presencial';

    const base = r.quorum.installationBase === 'TOTAL'
      ? 'Total'
      : (r.quorum.installationBase === 'ADIMPLENTES' ? 'Adimplentes' : 'Presentes');
    const metrica = r.quorum.metric === 'FRACAO' ? 'Fração' : 'Unidades';

    return [
      `Voto por: ${voto}`,
      `Inadimplentes: ${inad}`,
      `Quem pode votar: ${quem.length ? quem.join(', ') : 'Ninguém (revise as regras)'}`,
      `Procuração: ${r.requirePoAIfNotOwner ? 'obrigatória se não for proprietário' : 'não obrigatória'}`,
      `Presença remota: ${presenca}`,
      `Quórum de instalação: ${base} (${metrica})`,
      `Auditoria: ${r.audit.requireReasonOnOverride ? 'exige motivo ao liberar exceções' : 'não exige motivo'}`
    ];
  }

  // Navegação (hidden input nav)
  qsa('form [data-nav-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = btn.closest('form');
      if (!form) return;
      const nav = btn.getAttribute('data-nav-btn') || 'stay';
      const navInput = qs('input[data-nav]', form);
      if (navInput) navInput.value = nav;
    });
  });

  // Campos de data: abrir o calendário ao clicar no campo (sem depender do ícone)
  function wireDatePickers() {
    qsa('input[type="date"]', root).forEach((inp) => {
      if (inp.__wdgDateBound) return;
      inp.__wdgDateBound = true;

      const open = () => {
        if (inp.disabled || inp.readOnly) return;
        if (typeof inp.showPicker === 'function') {
          try { inp.showPicker(); } catch { /* noop */ }
        }
      };

      inp.addEventListener('pointerdown', open);
      inp.addEventListener('focus', open);
    });
  }

  wireDatePickers();

  // Aba Dados: Regras (padrão do condomínio vs personalizar)
  (function wireRegrasAssembleia() {
    const regrasRoot = qs('[data-assembleia-regras-root]');
    if (!regrasRoot) return;

    const form = regrasRoot.closest('form');
    if (!form) return;

    const bp = root.getAttribute('data-base-path') || '';

    const usePadraoEl = qs('[data-regras-use-padrao]', regrasRoot);
    const origemInp = qs('[data-regras-origem]', regrasRoot);
    const snapshotInp = qs('[data-regras-snapshot]', regrasRoot);
    const summaryUl = qs('[data-regras-summary]', regrasRoot);
    const customPanel = qs('[data-regras-custom-panel]', regrasRoot);
    const warnBox = qs('[data-regras-warning]', regrasRoot);

    const draftJsonEl = qs('#regrasDraftJson', regrasRoot);
    const draftSnapshotRaw = safeJsonParse(draftJsonEl ? draftJsonEl.textContent : '') || null;

    function setWarning(text) {
      if (!warnBox) return;
      const msg = String(text || '').trim();
      if (!msg) {
        warnBox.classList.add('d-none');
        warnBox.textContent = '';
        return;
      }
      warnBox.textContent = msg;
      warnBox.classList.remove('d-none');
    }

    async function fetchRegrasCondominio(unidadeId) {
      try {
        const url = new URL(`${bp}/assembleias/configuracoes/json`, window.location.origin);
        const u = String(unidadeId || '').trim();
        if (u) url.searchParams.set('unidade_id', u);
        url.searchParams.set('v', String(Date.now()));
        const r = await fetch(url.toString(), { credentials: 'same-origin' });
        if (!r.ok) throw new Error('Falha ao carregar regras');
        const data = await r.json();
        return normalizeRegras(data && data.regras ? data.regras : DEFAULT_REGRAS_RECOMMENDED);
      } catch {
        return normalizeRegras(DEFAULT_REGRAS_RECOMMENDED);
      }
    }

    function renderSummary(regras) {
      if (!summaryUl) return;
      const lines = formatResumoRegras(regras);
      summaryUl.innerHTML = '';
      lines.forEach((t) => {
        const li = document.createElement('li');
        li.textContent = String(t);
        summaryUl.appendChild(li);
      });
    }

    function setOrigem(v) {
      if (!origemInp) return;
      const up = String(v || '').trim().toUpperCase();
      origemInp.value = (up === 'PERSONALIZADA') ? 'PERSONALIZADA' : 'PADRAO_CONDOMINIO';
    }

    function setSnapshot(regras) {
      if (!snapshotInp) return;
      snapshotInp.value = JSON.stringify(normalizeRegras(regras));
    }

    function readCustomFromUI() {
      const voteMode = String(qs('input[name="regras_voteMode"]:checked', regrasRoot)?.value || '').trim();
      const delinquencyPolicy = String(qs('input[name="regras_delinquency"]:checked', regrasRoot)?.value || '').trim();

      const eligibility = {
        allowOwner: !!qs('[data-regras-elig="allowOwner"]', regrasRoot)?.checked,
        allowProxyWithPoA: !!qs('[data-regras-elig="allowProxyWithPoA"]', regrasRoot)?.checked,
        allowTenantWithAuthorization: !!qs('[data-regras-elig="allowTenantWithAuthorization"]', regrasRoot)?.checked,
        allowThirdPartyWithPoA: !!qs('[data-regras-elig="allowThirdPartyWithPoA"]', regrasRoot)?.checked
      };
      const requirePoAIfNotOwner = !!qs('[data-regras-require-poa]', regrasRoot)?.checked;

      const presence = {
        allowRemotePresence: !!qs('[data-regras-presence="allowRemotePresence"]', regrasRoot)?.checked,
        requireModeratorApprovalForRemote: !!qs('[data-regras-presence="requireModeratorApprovalForRemote"]', regrasRoot)?.checked
      };
      const quorum = {
        installationBase: String(qs('[data-regras-quorum="installationBase"]', regrasRoot)?.value || '').trim(),
        metric: String(qs('[data-regras-quorum="metric"]', regrasRoot)?.value || '').trim()
      };
      const audit = {
        requireReasonOnOverride: !!qs('[data-regras-audit-reason]', regrasRoot)?.checked
      };

      return normalizeRegras({ voteMode, delinquencyPolicy, eligibility, requirePoAIfNotOwner, presence, quorum, audit });
    }

    function applyCustomToUI(regras) {
      const r = normalizeRegras(regras);

      qsa('input[name="regras_voteMode"]', regrasRoot).forEach((el) => { el.checked = String(el.value) === r.voteMode; });
      qsa('input[name="regras_delinquency"]', regrasRoot).forEach((el) => { el.checked = String(el.value) === r.delinquencyPolicy; });

      const mapElig = {
        allowOwner: r.eligibility.allowOwner,
        allowProxyWithPoA: r.eligibility.allowProxyWithPoA,
        allowTenantWithAuthorization: r.eligibility.allowTenantWithAuthorization,
        allowThirdPartyWithPoA: r.eligibility.allowThirdPartyWithPoA
      };
      Object.keys(mapElig).forEach((k) => {
        const el = qs(`[data-regras-elig="${k}"]`, regrasRoot);
        if (el) el.checked = !!mapElig[k];
      });

      const req = qs('[data-regras-require-poa]', regrasRoot);
      if (req) req.checked = !!r.requirePoAIfNotOwner;

      const pr = qs('[data-regras-presence="allowRemotePresence"]', regrasRoot);
      const pm = qs('[data-regras-presence="requireModeratorApprovalForRemote"]', regrasRoot);
      if (pr) pr.checked = !!r.presence.allowRemotePresence;
      if (pm) pm.checked = !!r.presence.requireModeratorApprovalForRemote;

      const qb = qs('[data-regras-quorum="installationBase"]', regrasRoot);
      const qm = qs('[data-regras-quorum="metric"]', regrasRoot);
      if (qb) qb.value = r.quorum.installationBase;
      if (qm) qm.value = r.quorum.metric;

      const ar = qs('[data-regras-audit-reason]', regrasRoot);
      if (ar) ar.checked = !!r.audit.requireReasonOnOverride;

      syncCoherenceCustom({ showWarnings: false });
    }

    function syncCoherenceCustom({ showWarnings } = {}) {
      const voteMode = String(qs('input[name="regras_voteMode"]:checked', regrasRoot)?.value || '').trim();
      const metricSel = qs('[data-regras-quorum="metric"]', regrasRoot);
      if (metricSel) {
        if (voteMode === 'POR_FRACAO') metricSel.value = 'FRACAO';
        if (voteMode === 'POR_UNIDADE' && metricSel.value === 'FRACAO') metricSel.value = 'UNIDADES';
      }

      const allowRemote = !!qs('[data-regras-presence="allowRemotePresence"]', regrasRoot)?.checked;
      const requireMod = qs('[data-regras-presence="requireModeratorApprovalForRemote"]', regrasRoot);
      if (requireMod) {
        requireMod.disabled = !allowRemote;
        if (!allowRemote) requireMod.checked = false;
      }

      const allowProxy = !!qs('[data-regras-elig="allowProxyWithPoA"]', regrasRoot)?.checked;
      const reqPoA = qs('[data-regras-require-poa]', regrasRoot);
      if (reqPoA && reqPoA.checked && !allowProxy) {
        reqPoA.checked = false;
        if (showWarnings) setWarning('A opção “Procuração obrigatória se não for proprietário” foi desativada porque “Procurador com procuração” não está habilitado.');
      } else if (showWarnings) {
        setWarning('');
      }
    }

    function setCustomVisible(visible) {
      if (!customPanel) return;
      customPanel.style.display = visible ? '' : 'none';

      // Desabilita inputs quando oculto para não poluir submissão/validação.
      qsa('input, select, textarea, button', customPanel).forEach((el) => {
        el.disabled = !visible;
      });
    }

    async function boot() {
      const unidadeId = String(qs('input[data-unidade-hidden][name="unidade_id"]', form)?.value || '').trim();
      const regrasCondo = await fetchRegrasCondominio(unidadeId);

      const origemInicial = String(origemInp?.value || '').trim().toUpperCase();
      const hasDraftSnapshot = draftSnapshotRaw && typeof draftSnapshotRaw === 'object' && Object.keys(draftSnapshotRaw).length;
      const draftSnapshot = hasDraftSnapshot ? normalizeRegras(draftSnapshotRaw) : null;

      const usarPadrao = (origemInicial === 'PERSONALIZADA') ? false : true;
      if (usePadraoEl) usePadraoEl.checked = usarPadrao;

      if (usarPadrao) {
        setOrigem('PADRAO_CONDOMINIO');
        const snap = draftSnapshot || regrasCondo;
        setSnapshot(snap);
        renderSummary(snap);
        setCustomVisible(false);
        applyCustomToUI(snap);
      } else {
        setOrigem('PERSONALIZADA');
        const snap = draftSnapshot || regrasCondo;
        applyCustomToUI(snap);
        setSnapshot(snap);
        renderSummary(snap);
        setCustomVisible(true);
      }

      if (usePadraoEl) {
        usePadraoEl.addEventListener('change', () => {
          const on = !!usePadraoEl.checked;
          if (on) {
            setOrigem('PADRAO_CONDOMINIO');
            // mantém o custom preenchido para caso o usuário volte a personalizar
            const snap = regrasCondo;
            setSnapshot(snap);
            renderSummary(snap);
            setCustomVisible(false);
          } else {
            setOrigem('PERSONALIZADA');
            const snap = readCustomFromUI();
            setSnapshot(snap);
            renderSummary(snap);
            setCustomVisible(true);
          }
        });
      }

      // Mudanças no painel custom atualizam resumo/snapshot
      qsa('input, select', customPanel || undefined).forEach((el) => {
        el.addEventListener('change', () => {
          if (usePadraoEl && usePadraoEl.checked) return;
          syncCoherenceCustom({ showWarnings: true });
          const snap = readCustomFromUI();
          setSnapshot(snap);
          renderSummary(snap);
        });
      });

      // Submit sempre envia snapshot/origem coerentes
      form.addEventListener('submit', () => {
        const on = !!(usePadraoEl && usePadraoEl.checked);
        if (on) {
          setOrigem('PADRAO_CONDOMINIO');
          // snapshot deve ser sempre salvo (auditoria)
          setSnapshot(regrasCondo);
        } else {
          setOrigem('PERSONALIZADA');
          syncCoherenceCustom({ showWarnings: true });
          setSnapshot(readCustomFromUI());
        }
      });
    }

    boot();
  })();

  function wireTimePickers() {
    qsa('input[type="time"]', root).forEach((inp) => {
      if (inp.__wdgTimeBound) return;
      inp.__wdgTimeBound = true;

      const open = () => {
        if (inp.disabled || inp.readOnly) return;
        if (typeof inp.showPicker === 'function') {
          try { inp.showPicker(); } catch { /* noop */ }
        }
      };

      // Importante: não abrir automaticamente no foco/clique.
      // Em alguns Chromium, showPicker() “sequestra” o teclado e impede digitação.
      // Mantém um caminho para o picker via duplo clique.
      inp.addEventListener('dblclick', open);
    });
  }

  wireTimePickers();

  // Aba Dados: Gerar número (manual) via API
  (function wireNumeroGenerator() {
    const btn = qs('[data-generate-numero]');
    if (!btn) return;
    if (btn.__wdgBound) return;
    btn.__wdgBound = true;

    btn.addEventListener('click', async () => {
      const form = btn.closest('form');
      const numeroInput = qs('input[name="numero"]', form || undefined);
      if (!numeroInput) return;

      const bp = root.getAttribute('data-base-path') || '';
      const unidadeHidden = qs('input[data-unidade-hidden][name="unidade_id"]', form || undefined);
      const unidadeId = String(unidadeHidden?.value || '').trim();

      const prevText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Gerando';

      try {
        const url = new URL(`${bp}/assembleias/api/numero/gerar`, window.location.origin);
        if (unidadeId) url.searchParams.set('unidade_id', unidadeId);
        url.searchParams.set('v', String(Date.now()));

        const r = await fetch(url.toString(), { credentials: 'same-origin' });
        if (!r.ok) throw new Error('Falha ao gerar número');
        const data = await r.json();
        const numero = String(data?.numero || '').trim();
        if (numero) numeroInput.value = numero;
      } catch {
        // fallback local (sem garantia de unicidade)
        try {
          const year = new Date().getFullYear();
          const rnd = Math.floor(1000 + Math.random() * 9000);
          numeroInput.value = `ASM-${year}-${rnd}`;
        } catch { /* noop */ }
      } finally {
        btn.innerHTML = prevText;
        btn.disabled = false;
      }
    });
  })();

  // Aba Dados: Observações com contador (até 4000)
  (function wireObservacoesCounter() {
    const ta = qs('[data-observacoes]');
    const out = qs('[data-observacoes-count]');
    if (!ta || !out) return;

    const max = Number(ta.getAttribute('maxlength') || 4000) || 4000;
    const sync = () => {
      const n = String(ta.value || '').length;
      out.textContent = `${n}/${max}`;
    };
    ta.addEventListener('input', sync);
    sync();
  })();

  // Aba Convocação: Motivo de override com contador (até 4000)
  (function wireOverrideMotivoCounter() {
    const ta = qs('[data-override-motivo]');
    const out = qs('[data-override-motivo-count]');
    if (!ta || !out) return;

    const max = Number(ta.getAttribute('maxlength') || 4000) || 4000;
    const sync = () => {
      const n = String(ta.value || '').length;
      out.textContent = `${n}/${max}`;
    };
    ta.addEventListener('input', sync);
    sync();
  })();

  // Modalidade: show/hide local/link
  function syncModalidade() {
    const modalidade = getChoiceValueByDataAttr('[data-modalidade]').toLowerCase();
    const localWrap = qs('[data-field-local]');
    const linkWrap = qs('[data-field-link]');
    if (!localWrap || !linkWrap) return;

    const wantsLocal = modalidade === 'presencial' || modalidade === 'hibrida';
    const wantsLink = modalidade === 'virtual' || modalidade === 'hibrida';

    const localInput = qs('input, textarea, select', localWrap);
    const linkInput = qs('input, textarea, select', linkWrap);
    const localBtn = qs('button', localWrap);
    const linkBtn = qs('button', linkWrap);

    if (localInput) localInput.disabled = !wantsLocal;
    if (linkInput) linkInput.disabled = !wantsLink;
    if (localBtn) localBtn.disabled = !wantsLocal;
    if (linkBtn) linkBtn.disabled = !wantsLink;

    // Obrigatoriedade condicional (validada no Avançar via checkValidity)
    if (localInput) localInput.required = wantsLocal;
    if (linkInput) linkInput.required = wantsLink;

    localWrap.classList.toggle('wdg-field-disabled', !wantsLocal);
    linkWrap.classList.toggle('wdg-field-disabled', !wantsLink);
  }

  const modalidadeEls = qsa('[data-modalidade]');
  if (modalidadeEls.length) {
    modalidadeEls.forEach((el) => el.addEventListener('change', syncModalidade));
    syncModalidade();
  }

  // Aba Dados: obrigatórios para prosseguir (Avançar)
  (function wireDadosNextValidation() {
    const form = qs('form.needs-validation', root) || qs('form', root);
    if (!form) return;

    const tab = String(qs('input[name="tab"]', form)?.value || '').trim().toLowerCase();
    if (tab && tab !== 'dados') return;

    form.addEventListener('submit', (ev) => {
      const nav = String(qs('input[data-nav]', form)?.value || 'stay').trim().toLowerCase();
      if (nav !== 'next') return;

      // Garante required/disabled coerentes com a modalidade atual.
      try { syncModalidade(); } catch { /* noop */ }

      form.classList.add('was-validated');
      if (!form.checkValidity()) {
        ev.preventDefault();
        ev.stopPropagation();
        try { form.reportValidity(); } catch { /* noop */ }
      }
    });
  })();

  // Condomínio (seletor global no index): hidratar combo via API (padrão do módulo)
  async function hydrateCondoSelect() {
    const sel = qs('[data-condo-select]');
    if (!sel) return;

    // Se já tem opções (além do placeholder), não mexe.
    try {
      const options = Array.from(sel.options || []);
      const hasRealOptions = options.some(o => String(o.value || '').trim());
      if (hasRealOptions) return;
    } catch { /* noop */ }

    const bp = root.getAttribute('data-base-path') || '';
    let units = [];
    try {
      const r = await fetch(`${bp}/api/unidades`, { credentials: 'same-origin' });
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) units = data;
    } catch { /* noop */ }

    const labelFor = (u) => {
      const nome = String(u?.nome || '').trim();
      const razao = String(u?.razaoSocial || '').trim();
      const codigo = String(u?.codigo || '').trim();
      return nome || razao || codigo || String(u?._id || '').trim();
    };

    // Sempre coloca placeholder
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

    // Seleção inicial
    const desired = String(sel.getAttribute('data-selected-unidade-id') || '').trim();
    const firstRealId = String(units[0]?._id || '').trim();
    const toSelect = desired || (sel.disabled ? firstRealId : '');
    if (toSelect) {
      sel.value = toSelect;
      try { sel.setAttribute('data-selected-unidade-id', toSelect); } catch { /* noop */ }
    }

    // Sincroniza hidden(s)
    syncUnidadeHiddenInputs(sel.value);
    syncCondoLogo(sel.value);
  }

  function syncUnidadeHiddenInputs(unidadeId) {
    const v = String(unidadeId || '').trim();

    // hidden do form global de persistência
    const form = qs('[data-assembleia-unidade-form]');
    const hid = qs('[data-assembleia-unidade-id]', form || undefined);
    if (hid) hid.value = v;

    // hidden dentro do form da aba Dados (para primeiro save)
    qsa('input[data-unidade-hidden][name="unidade_id"]').forEach((inp) => {
      try { inp.value = v; } catch { /* noop */ }
    });
  }

  function syncCondoLogo(unidadeId) {
    const v = String(unidadeId || '').trim();
    const img = qs('[data-condo-inline-logo]');
    if (!img) return;
    const bp = root.getAttribute('data-base-path') || '';
    const fallback = '/images/unidade.png';
    if (!v) {
      img.src = fallback;
      return;
    }
    img.src = `${bp}/api/unidades/${encodeURIComponent(v)}/logo`;
    img.onerror = () => { try { img.onerror = null; img.src = fallback; } catch { /* noop */ } };
  }

  // Aba Dados: Responsável (exibição estilo card com foto)
  (function wireResponsavelCard() {
    const form = qs('form.needs-validation', root) || qs('form', root);
    if (!form) return;

    const valueInput = qs('[data-responsavel-value][name="responsavel"]', form);
    const fieldWrap = qs('[data-responsavel-field]', form);
    const cardEl = qs('[data-responsavel-card]', form);
    const imgEl = qs('[data-responsavel-img]', form);
    const nomeEl = qs('[data-responsavel-nome]', form);
    const subEl = qs('[data-responsavel-subtitulo]', form);
    const emailEl = qs('[data-responsavel-email]', form);
    const invalidEl = qs('[data-responsavel-invalid]', form);
    if (!valueInput || !fieldWrap || !cardEl || !imgEl || !nomeEl || !subEl || !emailEl) return;

    const bp = root.getAttribute('data-base-path') || '';
    const fotoByEmail = (email) => {
      const e = String(email || '').trim().toLowerCase();
      if (!e || !e.includes('@')) return '';
      return `${String(bp || '').replace(/\/+$/, '')}/api/usuarios/foto?email=${encodeURIComponent(e)}&v=${Date.now()}`;
    };

    const parseResponsavel = (raw) => {
      const text = String(raw || '').trim();
      if (!text) return { nome: '', subtitulo: '', email: '' };

      let email = '';
      const mEmail = text.match(/<([^>]+)>/);
      if (mEmail) email = String(mEmail[1] || '').trim();

      const beforeEmail = text.split('<')[0].trim();
      const beforeCpf = beforeEmail.replace(/\(\s*cpf\s*[^)]+\)/i, '').trim();

      let nome = beforeCpf;
      let subtitulo = '';
      const idx = beforeCpf.indexOf(' - ');
      if (idx >= 0) {
        nome = beforeCpf.slice(0, idx).trim();
        subtitulo = beforeCpf.slice(idx + 3).trim();
      }

      return { nome, subtitulo, email };
    };

    const setImg = (src) => {
      const v = String(src || '').trim();
      imgEl.src = v || '/images/usuario.png';
    };

    const render = () => {
      const raw = String(valueInput.value || '').trim();
      const { nome, subtitulo, email } = parseResponsavel(raw);

      if (!raw) {
        try { delete valueInput.dataset.responsavelFoto; } catch { /* noop */ }
        nomeEl.textContent = 'Clique em Pesquisar';
        subEl.style.display = 'none';
        subEl.textContent = '';
        emailEl.style.display = 'none';
        emailEl.textContent = '';
        setImg('/images/usuario.png');
        fieldWrap.classList.remove('wdg-invalid');
        if (invalidEl) invalidEl.classList.add('d-none');
        return;
      }

      nomeEl.textContent = nome || raw;
      if (subtitulo) {
        subEl.textContent = subtitulo;
        subEl.style.display = '';
      } else {
        subEl.textContent = '';
        subEl.style.display = 'none';
      }
      if (email) {
        emailEl.textContent = email;
        emailEl.style.display = '';
      } else {
        emailEl.textContent = '';
        emailEl.style.display = 'none';
      }

      const fotoFromModal = String(valueInput.dataset.responsavelFoto || '').trim();
      const foto = fotoFromModal || fotoByEmail(email) || (raw.toLowerCase().includes('cpf') ? '/images/pessoal.png' : '/images/usuario.png');
      setImg(foto);
      imgEl.onerror = () => {
        try {
          imgEl.onerror = null;
          imgEl.src = '/images/usuario.png';
        } catch { /* noop */ }
      };

      fieldWrap.classList.remove('wdg-invalid');
      if (invalidEl) invalidEl.classList.add('d-none');
    };

    valueInput.addEventListener('input', render);
    valueInput.addEventListener('change', render);

    // validação simples (mantém UX mesmo com input hidden)
    form.addEventListener('submit', (ev) => {
      const tab = String(qs('input[name="tab"]', form)?.value || '').trim().toLowerCase();
      if (tab && tab !== 'dados') return;

      const nav = String(qs('input[data-nav]', form)?.value || 'stay').trim().toLowerCase();
      // Responsável é obrigatório para prosseguir (Avançar), mas não bloqueia salvar rascunho.
      if (nav !== 'next') return;

      const v = String(valueInput.value || '').trim();
      if (!v) {
        fieldWrap.classList.add('wdg-invalid');
        if (invalidEl) invalidEl.classList.remove('d-none');
        ev.preventDefault();
        ev.stopPropagation();
      }
    });

    render();
  })();

  function updateUrlWithUnidade(unidadeId) {
    try {
      const v = String(unidadeId || '').trim();
      const url = new URL(window.location.href);
      if (v) url.searchParams.set('unidade_id', v);
      else url.searchParams.delete('unidade_id');
      window.location.href = url.toString();
    } catch { /* noop */ }
  }

  function persistUnidadeSelection(unidadeId) {
    const v = String(unidadeId || '').trim();
    syncUnidadeHiddenInputs(v);
    syncCondoLogo(v);

    const form = qs('[data-assembleia-unidade-form]');
    if (!form) {
      updateUrlWithUnidade(v);
      return;
    }

    const idInput = qs('input[name="id"]', form);
    const id = String(idInput?.value || '').trim();
    if (id) {
      try { form.submit(); } catch { /* noop */ }
      return;
    }

    // Sem ID (rascunho ainda não criado): mantém seleção no querystring
    updateUrlWithUnidade(v);
  }

  // Inicializa seletor global
  const condoSel = qs('[data-condo-select]');
  if (condoSel) {
    try { hydrateCondoSelect(); } catch { /* noop */ }
    condoSel.addEventListener('change', () => {
      persistUnidadeSelection(condoSel.value);
    });
  }

  // Regra convocação: show/hide horários
  function syncRegra() {
    const regra = getChoiceValueByDataAttr('[data-regra]').toLowerCase();
    const hUnica = qs('[data-field-hora-unica]');
    const h1 = qs('[data-field-hora1]');
    const h2 = qs('[data-field-hora2]');
    if (!hUnica || !h1 || !h2) return;

    const unica = regra === 'unica';
    const dupla = regra === 'dupla';

    hUnica.style.display = unica ? '' : 'none';
    h1.style.display = dupla ? '' : 'none';
    h2.style.display = dupla ? '' : 'none';
  }

  const regraEls = qsa('[data-regra]');
  if (regraEls.length) {
    regraEls.forEach((el) => el.addEventListener('change', syncRegra));
    syncRegra();
  }

  // Pauta add/remove
  const pautaList = qs('#pautaList');
  const tpl = qs('#tplPautaItem');
  const btnAdd = qs('#btnAddPauta');
  const countInput = qs('[data-pauta-count]');

  function wirePautaObsCounters() {
    if (!pautaList) return;
    const items = qsa('[data-pauta-item]', pautaList);
    items.forEach((item) => {
      const ta = qs('[data-pauta-obs]', item) || qs('textarea.form-control', item);
      const out = qs('[data-pauta-obs-count]', item);
      if (!ta || !out) return;

      const max = Number(ta.getAttribute('maxlength') || 4000) || 4000;
      const sync = () => {
        const n = String(ta.value || '').length;
        out.textContent = `${n}/${max}`;
      };

      if (!ta.__wdgBoundPautaObsCounter) {
        ta.__wdgBoundPautaObsCounter = true;
        ta.addEventListener('input', sync);
      }
      sync();
    });
  }

  function renumberPauta() {
    if (!pautaList || !countInput) return;
    const items = qsa('[data-pauta-item]', pautaList);
    items.forEach((item, idx) => {
      const title = qs('[data-pauta-title]', item);
      if (title) title.textContent = `Item ${idx + 1}`;

      const sel = qs('select.form-select', item);
      const radios = qsa('input[type="radio"][data-pauta-tipo-radio]', item);
      const radioLabels = qsa('label[data-pauta-tipo-label]', item);
      const inp = qs('input.form-control', item);
      const ta = qs('textarea.form-control', item);
      if (sel) sel.name = `pauta_tipo_${idx}`;
      if (radios.length) {
        radios.forEach((r) => {
          r.name = `pauta_tipo_${idx}`;
          const tipo = String(r.getAttribute('data-pauta-tipo') || r.value || '').trim() || 'tipo';
          r.id = `pauta_${idx}_tipo_${tipo}`;
        });
        radioLabels.forEach((lb) => {
          const tipo = String(lb.getAttribute('data-pauta-tipo') || '').trim() || 'tipo';
          lb.htmlFor = `pauta_${idx}_tipo_${tipo}`;
        });
      }
      if (inp) inp.name = `pauta_descricao_${idx}`;
      if (ta) ta.name = `pauta_obs_${idx}`;
    });
    countInput.value = String(items.length);
    wirePautaObsCounters();
  }

  function attachRemoveHandlers() {
    if (!pautaList) return;
    qsa('[data-pauta-remove]', pautaList).forEach((btn) => {
      if (btn.__wdgBound) return;
      btn.__wdgBound = true;
      btn.addEventListener('click', () => {
        const item = btn.closest('[data-pauta-item]');
        if (!item) return;
        item.remove();
        // mantém ao menos 1 item visual
        if (!qsa('[data-pauta-item]', pautaList).length && tpl) {
          const node = tpl.content.firstElementChild?.cloneNode(true);
          if (node) pautaList.appendChild(node);
        }
        attachRemoveHandlers();
        renumberPauta();
      });
    });
  }

  if (btnAdd && pautaList && tpl) {
    btnAdd.addEventListener('click', () => {
      const node = tpl.content.firstElementChild?.cloneNode(true);
      if (!node) return;
      pautaList.appendChild(node);
      attachRemoveHandlers();
      renumberPauta();
      wirePautaObsCounters();
    });
  }

  attachRemoveHandlers();
  renumberPauta();
  wirePautaObsCounters();

  // Aba Pauta: tipo obrigatório somente quando há descrição
  (function wirePautaTipoConditionalValidation() {
    const form = qs('form', root);
    if (!form) return;

    const tab = String(qs('input[name="tab"]', form)?.value || '').trim().toLowerCase();
    if (tab && tab !== 'pauta') return;

    const getItemDescricao = (item) => {
      const inp = qs('input[name^="pauta_descricao_"]', item) || qs('input.form-control', item);
      return inp ? String(inp.value || '').trim() : '';
    };

    const getItemRadios = (item) => qsa('input[type="radio"][data-pauta-tipo-radio]', item);

    const validateItem = (item) => {
      const desc = getItemDescricao(item);
      const radios = getItemRadios(item);
      if (!radios.length) return true;

      // Limpa estados anteriores
      radios.forEach((r) => {
        try { r.setCustomValidity(''); } catch { /* noop */ }
      });

      // Se não há descrição, não exige tipo
      if (!desc) {
        try { radios[0].required = false; } catch { /* noop */ }
        return true;
      }

      // Se há descrição, exige tipo
      try { radios[0].required = true; } catch { /* noop */ }
      const hasChecked = radios.some((r) => !!r.checked);
      if (hasChecked) return true;

      try { radios[0].setCustomValidity('Selecione o tipo da pauta.'); } catch { /* noop */ }
      return false;
    };

    const bindItem = (item) => {
      if (!item || item.__wdgBoundPautaTipoConditional) return;
      item.__wdgBoundPautaTipoConditional = true;

      const descInp = qs('input[name^="pauta_descricao_"]', item) || qs('input.form-control', item);
      const radios = getItemRadios(item);

      if (descInp) {
        descInp.addEventListener('input', () => {
          validateItem(item);
        });
        descInp.addEventListener('change', () => {
          validateItem(item);
        });
      }

      radios.forEach((r) => {
        r.addEventListener('change', () => {
          validateItem(item);
        });
      });

      // Estado inicial
      validateItem(item);
    };

    const bindAll = () => {
      qsa('[data-pauta-item]', pautaList || form).forEach(bindItem);
    };

    bindAll();

    // Re-binda depois de adicionar/remover/renumerar
    const originalRenumber = renumberPauta;
    // Evita re-wrapping múltiplas vezes
    if (!renumberPauta.__wdgWrapped) {
      renumberPauta.__wdgWrapped = true;
      renumberPauta = function wrappedRenumberPauta() {
        originalRenumber();
        bindAll();
      };
    }

    form.addEventListener('submit', (ev) => {
      // Sempre valida ao submeter a aba Pauta
      const items = qsa('[data-pauta-item]', pautaList || form);
      let ok = true;
      items.forEach((it) => { if (!validateItem(it)) ok = false; });
      if (!ok) {
        ev.preventDefault();
        ev.stopPropagation();
        form.classList.add('was-validated');
        try { form.reportValidity(); } catch { /* noop */ }
      }
    });
  })();

  // Aba Publicação: entrega + edital (assina fora; WD certifica)
  (function wirePublicacaoEntregaAndEdital() {
    const formPublicar = qs('#formPublicar');
    if (!formPublicar) return;

    const escapeHtmlLocal = (v) => {
      return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const ensureToastContainer = () => {
      let el = qs('#wdgToastContainer');
      if (el) return el;
      // fallback: cria dinamicamente se o partial não estiver presente
      el = document.createElement('div');
      el.id = 'wdgToastContainer';
      el.className = 'toast-container position-fixed top-0 end-0 p-3';
      el.style.zIndex = '1200';
      document.body.appendChild(el);
      return el;
    };

    const showToast = ({ title, lines, variant }) => {
      const container = ensureToastContainer();
      const tTitle = String(title || '').trim() || 'Aviso';
      const v = String(variant || 'danger').trim() || 'danger';
      const arr = Array.isArray(lines) ? lines : [String(lines || '').trim()].filter(Boolean);
      const safeLines = arr.map(s => String(s || '').trim()).filter(Boolean).slice(0, 12);
      const bodyHtml = safeLines.length
        ? safeLines.map(s => `<div class="small">• ${escapeHtmlLocal(s)}</div>`).join('')
        : `<div class="small">${escapeHtmlLocal('Ocorreu um erro. Tente novamente.')}</div>`;

      const toastEl = document.createElement('div');
      toastEl.className = `toast align-items-stretch text-bg-${v} border-0`;
      toastEl.setAttribute('role', 'alert');
      toastEl.setAttribute('aria-live', 'assertive');
      toastEl.setAttribute('aria-atomic', 'true');
      toastEl.innerHTML = `
        <div class="d-flex">
          <div class="toast-body">
            <div class="fw-semibold">${escapeHtmlLocal(tTitle)}</div>
            ${bodyHtml}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
        </div>
      `.trim();
      container.appendChild(toastEl);

      try {
        if (window.bootstrap && bootstrap.Toast) {
          const inst = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 9000, autohide: true });
          inst.show();
        } else {
          // fallback sem bootstrap
          setTimeout(() => { try { toastEl.remove(); } catch { /* noop */ } }, 9000);
        }
      } catch {
        // fallback final
        try { alert(`${tTitle}: ${safeLines.join('\n')}`); } catch { /* noop */ }
      }

      // Limpeza quando fechar
      try {
        toastEl.addEventListener('hidden.bs.toast', () => { try { toastEl.remove(); } catch { /* noop */ } });
      } catch { /* noop */ }
    };

    const syncSelectedIdsFromUi = () => {
      // Fonte de verdade: cards na coluna "Selecionados".
      try {
        const pickerEl = qs('[data-recipients-picker]');
        const selectedListEl = pickerEl ? qs('[data-selected-list]', pickerEl) : null;
        const hid = pickerEl ? qs('input[name="selectedPersonIds"][data-selected-ids]', pickerEl) : qs('input[name="selectedPersonIds"][data-selected-ids]');
        if (!selectedListEl) return '';

        // 1) Preferência: cards (estrutura da coluna direita)
        let ids = qsa('.card[data-person-id]', selectedListEl)
          .map(el => String(el?.getAttribute?.('data-person-id') || '').trim())
          .filter(Boolean);

        // 2) Fallback: qualquer nó com data-person-id dentro da lista
        if (!ids.length) {
          ids = qsa('[data-person-id]', selectedListEl)
            .map(el => String(el?.getAttribute?.('data-person-id') || '').trim())
            .filter(Boolean);
        }

        // 3) Fallback final: usa e-mails (backend aceita ids no formato em:<email>)
        if (!ids.length) {
          const emails = qsa('[data-person-email]', selectedListEl)
            .map(el => String(el?.textContent || '').trim().toLowerCase())
            .filter(s => s && s.includes('@'));
          ids = emails.map(em => `em:${em}`);
        }

        ids = ids.slice(0, 500);
        const csv = ids.join(',');

        // Atualiza o hidden do picker (fora do form) se existir.
        if (hid) hid.value = csv;

        // GARANTIA: também mantém um hidden DENTRO do form para o POST.
        try {
          if (formPublicar) {
            let inForm = qs('input[name="selectedPersonIds"][data-selected-ids-submit]', formPublicar);
            if (!inForm) {
              inForm = document.createElement('input');
              inForm.type = 'hidden';
              inForm.name = 'selectedPersonIds';
              inForm.setAttribute('data-selected-ids-submit', '1');
              formPublicar.appendChild(inForm);
            }
            inForm.value = csv;
          }
        } catch { /* noop */ }

        return csv;
      } catch {
        return '';
      }
    };

    const bp = root.getAttribute('data-base-path') || '/condominios';
    const assembleiaId = (() => {
      const hid = qs('input[name="id"]', formPublicar);
      const v = String(hid?.value || '').trim();
      if (v) return v;
      try {
        const url = new URL(window.location.href);
        return String(url.searchParams.get('id') || '').trim();
      } catch {
        return '';
      }
    })();

    // Data de publicação -> Data de emissão da convocação (name=dataEmissao)
    const dataInput = qs('input[type="date"][name="dataPublicacao"]');
    if (dataInput) {
      const lbl = dataInput.closest('.col-md-4, .col-12, .col')?.querySelector('label.form-label');
      if (lbl) lbl.textContent = 'Data de emissão da convocação';
      dataInput.name = 'dataEmissao';
      if (!String(dataInput.value || '').trim()) {
        try {
          const today = new Date();
          const iso = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0, 10);
          dataInput.value = iso;
        } catch { /* noop */ }
      }
    }

    // Entrega (aba Publicação) é fixa via Caixa de Mensagens.

    // Botão final: Publicar -> Convocar assembleia
    const submitBtn = qs('button[type="submit"]', formPublicar);
    if (submitBtn) {
      // Evita sobrescrever o HTML e apagar ícones já renderizados pela view.
      const labelSpan = submitBtn.querySelector('span:not(.wdg-btn3d-iconwrap)');
      if (labelSpan) {
        labelSpan.textContent = 'Convocar assembleia';
      } else {
        const iconWrap = submitBtn.querySelector('.wdg-btn3d-iconwrap');
        const iconI = submitBtn.querySelector('i');
        const iconImg = submitBtn.querySelector('img.wdg-btn3d-icon');

        // Caso padrão (igual aos botões Abrir documento/Copiar link): <img> + texto.
        if (iconImg) {
          try {
            const nodes = Array.from(submitBtn.childNodes || []);
            const iconIdx = nodes.indexOf(iconImg);
            let textNode = null;
            for (let i = Math.max(0, iconIdx + 1); i < nodes.length; i += 1) {
              const n = nodes[i];
              if (n && n.nodeType === 3) { // TEXT_NODE
                textNode = n;
                break;
              }
            }
            if (!textNode) {
              submitBtn.appendChild(document.createTextNode(' Convocar assembleia'));
            } else {
              textNode.textContent = ' Convocar assembleia';
            }
          } catch {
            // fallback seguro
            submitBtn.innerHTML = `${iconImg.outerHTML} Convocar assembleia`;
          }
        } else {
          const iconHtml = iconWrap?.outerHTML || iconI?.outerHTML || '';
          submitBtn.innerHTML = `${iconHtml}${iconHtml ? ' ' : ''}Convocar assembleia`;
        }
      }
    }

    // Convocar assembleia (AJAX) -> mostra modal "Convocação enviada com sucesso!"
    if (formPublicar && !formPublicar.__wdgBound) {
      formPublicar.__wdgBound = true;
      formPublicar.addEventListener('submit', async (e) => {
        try { e?.preventDefault?.(); } catch { /* noop */ }

        const action = String(formPublicar.getAttribute('action') || '').trim() || window.location.href;
        const prevHtml = submitBtn ? submitBtn.innerHTML : '';
        try {
          if (submitBtn) submitBtn.disabled = true;

          // Garante que o hidden reflita a UI (não depende de checkbox).
          const selectedCsvUi = String(syncSelectedIdsFromUi() || '').trim();
          if (!selectedCsvUi) {
            showToast({
              title: 'Não foi possível convocar',
              lines: ['Nenhum destinatário foi encontrado na lista Selecionados. Use o botão ">" para mover o usuário para a lista da direita.'],
              variant: 'danger'
            });
            return;
          }

          // IMPORTANTE: esta rota usa apenas urlencoded/json (ver ASSEMBLEIA_BODY_PARSERS).
          // Portanto, não pode enviar multipart/form-data.
          const fd = new FormData(formPublicar);

          // Safety: garante selectedPersonIds (input pode estar fora do form e usar atributo form).
          try {
            const selectedCsv = String(syncSelectedIdsFromUi() || qs('input[data-selected-ids]')?.value || '').trim();
            if (selectedCsv && !fd.get('selectedPersonIds')) fd.append('selectedPersonIds', selectedCsv);
          } catch { /* noop */ }

          const params = new URLSearchParams();
          try {
            for (const [k, v] of fd.entries()) {
              // não esperamos arquivos aqui; apenas campos simples
              if (v instanceof File) continue;
              params.append(String(k), String(v));
            }
          } catch { /* noop */ }

          // Fonte final de verdade: coluna "Selecionados". Garante que o backend receba.
          try {
            const selectedCsvFinal = selectedCsvUi || String(syncSelectedIdsFromUi() || '').trim();
            if (selectedCsvFinal) {
              params.set('selectedPersonIds', selectedCsvFinal);
            }
          } catch { /* noop */ }

          const r = await fetch(action, {
            method: 'POST',
            body: params,
            credentials: 'same-origin',
            headers: {
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'x-wdg-ajax': '1',
              'x-requested-with': 'XMLHttpRequest',
              'accept': 'application/json'
            }
          });

          const ct = String(r.headers.get('content-type') || '').toLowerCase();
          const isJson = ct.includes('application/json');
          const data = isJson ? await r.json().catch(() => ({})) : null;

          if (!r.ok || !data || data.ok !== true) {
            const lines = [];
            try {
              const pe = data?.publishErrors;
              if (pe && typeof pe === 'object') {
                Object.keys(pe).forEach((k) => {
                  const v = String(pe[k] || '').trim();
                  if (v) lines.push(v);
                });
              }
            } catch { /* noop */ }
            const mainMsg = String(data?.error || data?.message || '').trim();
            if (mainMsg) lines.unshift(mainMsg);

            // Debug retornado pelo backend (apenas para diagnóstico durante implantação)
            try {
              if (data?.debug) {
                const recv = (data.debug.receivedSelectedPersonIds === undefined) ? '' : String(data.debug.receivedSelectedPersonIds);
                const docCount = (data.debug.docSelectedPersonIdsCount === undefined) ? '' : String(data.debug.docSelectedPersonIdsCount);
                lines.push(`Debug: enviado selectedPersonIds="${selectedCsvUi}"`);
                if (recv) lines.push(`Debug: recebido selectedPersonIds="${recv}"`);
                if (docCount) lines.push(`Debug: doc.selectedPersonIds=${docCount}`);
              }
            } catch { /* noop */ }

            // Se não veio JSON (ex.: erro interno/redirect), tenta extrair algo do HTML
            if (!lines.length && !isJson) {
              try {
                const rawText = await r.text().catch(() => '');
                const compact = String(rawText || '')
                  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
                  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (compact) lines.push(compact.slice(0, 240));
              } catch { /* noop */ }
            }

            if (!lines.length) lines.push(`Falha ao enviar a convocação (HTTP ${r.status}). Verifique as pendências e tente novamente.`);
            showToast({ title: 'Não foi possível convocar', lines, variant: 'danger' });
            return;
          }

          const modalEl = qs('#modalConvocacaoEnviada');
          const redirectTo = String(data?.redirect || '').trim();

          if (modalEl && root && window.bootstrap && bootstrap.Modal) {
            const inst = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: true });
            const onHidden = () => {
              try { modalEl.removeEventListener('hidden.bs.modal', onHidden); } catch { /* noop */ }
              if (redirectTo) window.location.assign(redirectTo);
            };
            try { modalEl.addEventListener('hidden.bs.modal', onHidden); } catch { /* noop */ }
            inst.show();
          } else if (redirectTo) {
            window.location.assign(redirectTo);
          }
        } catch (_err) {
          showToast({
            title: 'Não foi possível convocar',
            lines: ['Falha ao enviar a convocação. Tente novamente.'],
            variant: 'danger'
          });
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            // Não muda o HTML do botão; apenas restaura caso algum fluxo tenha alterado.
            if (prevHtml) submitBtn.innerHTML = prevHtml;
          }
        }
      });
    }

    const buildEditalUrl = () => {
      const base = String(bp || '').replace(/\/+$/, '') || '/condominios';
      return `${base}/assembleias/${encodeURIComponent(assembleiaId)}/edital`;
    };

    const buildEditalPrintUrl = () => {
      const u = buildEditalUrl();
      return u ? `${u}?print=1` : u;
    };

    const btnPrev = qs('#btnPreviewEdital');
    if (btnPrev && !btnPrev.__wdgBound) {
      btnPrev.__wdgBound = true;
      btnPrev.addEventListener('click', (e) => {
        try { e?.preventDefault?.(); } catch { /* noop */ }
        if (!assembleiaId) return;
        window.open(buildEditalUrl(), '_blank', 'noopener');
      });
    }

    const btnPrint = qs('#btnPrintEdital');
    if (btnPrint && !btnPrint.__wdgBound) {
      btnPrint.__wdgBound = true;
      btnPrint.addEventListener('click', (e) => {
        try { e?.preventDefault?.(); } catch { /* noop */ }
        if (!assembleiaId) return;
        // Abre a versão leve (print=1) e deixa o próprio template disparar o print.
        const w = window.open(buildEditalPrintUrl(), '_blank', 'noopener');
        try { w?.focus?.(); } catch { /* noop */ }
      });
    }

    // Upload do PDF assinado (certificação)
    const uploadWrap = qs('[data-edital-certificacao-wrap]');
    const warningEl = qs('[data-edital-pendente-warning]');
    const tokenHidden = qs('[data-edital-token]');
    const fileInput = qs('[data-edital-pdf-input]');
    const uploadBtn = qs('[data-edital-upload-btn]');
    const statusEl = qs('[data-edital-upload-status]');
    const validadoWrap = qs('[data-edital-validado]');
    const linkEl = qs('[data-edital-verificar-link]');
    const pdfLinkEl = qs('[data-edital-pdf-link]');
    const copyBtn = qs('[data-edital-copy-link]');
    const qrToggleBtn = qs('[data-edital-qr-toggle]');
    const qrOuter = qs('[data-edital-qrcode-wrap]');
    const qrEl = qs('[data-edital-qrcode]');

    // Wizard (UX progressiva)
    const wizardRoot = qs('[data-publicacao-wizard]');
    const step1Card = qs('[data-publicacao-step="1"]');
    const step3Card = qs('[data-publicacao-step="3"]');
    const step2PendingWrap = qs('[data-edital-step2-pending]');
    const step2DoneWrap = qs('[data-edital-step2-done]');
    const step3Extras = qsa('[data-publicacao-step3-extra]');

    // Garante ordem visual: Passo 2 -> Destinatários -> Passo 3
    try {
      const pickerEl = qs('[data-recipients-picker]');
      if (wizardRoot && pickerEl && step3Card && pickerEl.parentElement !== wizardRoot) {
        wizardRoot.insertBefore(pickerEl, step3Card);
      }
    } catch { /* noop */ }

    const badgeEl = qs('[data-edital-status-badge]');
    const descEl = qs('[data-edital-status-desc]');
    const tokenTextEl = qs('[data-edital-token-text]');
    const hashTextEl = qs('[data-edital-hash-text]');
    const substituidoAlert = qs('[data-edital-substituido]');
    const revogadoAlert = qs('[data-edital-revogado]');
    const novoVerificarLink = qs('[data-edital-verificar-novo-link]');
    const novoPdfLink = qs('[data-edital-pdf-novo-link]');

    // Reusa o submitBtn (Convocar assembleia) já capturado acima.
    if (submitBtn && submitBtn.dataset.baseDisabled === undefined) {
      // Se estiver desabilitado apenas por fluxo (ex.: sem token ainda), o JS pode habilitar depois.
      // Só travamos como baseDisabled quando não existe ID de assembleia.
      submitBtn.dataset.baseDisabled = (submitBtn.disabled && !assembleiaId) ? '1' : '0';
    }

    function getToken() {
      return String(tokenHidden?.value || '').trim();
    }

    function setToken(tok) {
      const t = String(tok || '').trim();
      if (tokenHidden) tokenHidden.value = t;
    }

    function setStatus(html) {
      if (!statusEl) return;
      statusEl.innerHTML = html || '';
    }

    function publicVerificarUrlForToken(tok) {
      const t = String(tok || '').trim();
      if (!t) return '';
      return `/verificar/${encodeURIComponent(t)}`;
    }

    function publicPdfUrlForToken(tok) {
      const t = String(tok || '').trim();
      if (!t) return '';
      return `/verificar/${encodeURIComponent(t)}/pdf`;
    }

    function publicStatusUrlForToken(tok) {
      const t = String(tok || '').trim();
      if (!t) return '';
      return `/verificar/${encodeURIComponent(t)}/status?v=${encodeURIComponent(String(Date.now()))}`;
    }

    function setBadge(state) {
      if (!badgeEl) return;
      const s0 = String(state || '').trim().toUpperCase();
      const s = s0 || 'PENDENTE';

      // Não expõe estados técnicos (hash/token/status) na UI principal.
      const label = (() => {
        if (s === 'VALIDADO' || s === 'FINALIZADO' || s === 'CONCLUIDO' || s === 'CONCLUÍDO') return 'CONCLUÍDO';
        if (s === 'REVOGADO' || s === 'SUBSTITUIDO' || s === 'SUBSTITUÍDO' || s === 'REENVIAR') return 'REENVIAR';
        if (s === 'ENVIANDO') return 'ENVIANDO';
        return 'PENDENTE';
      })();

      badgeEl.textContent = label;
      try {
        badgeEl.classList.remove('bg-secondary', 'bg-success', 'bg-danger', 'bg-warning', 'bg-info', 'text-dark');
        if (label === 'CONCLUÍDO') badgeEl.classList.add('bg-success');
        else if (label === 'REENVIAR') badgeEl.classList.add('bg-warning', 'text-dark');
        else if (label === 'ENVIANDO') badgeEl.classList.add('bg-info', 'text-dark');
        else badgeEl.classList.add('bg-secondary');
      } catch { /* noop */ }
    }

    function setDesc(text) {
      if (!descEl) return;
      descEl.textContent = String(text || '').trim();
    }

    function setTokenText(tok) {
      if (!tokenTextEl) return;
      const t = String(tok || '').trim();
      tokenTextEl.textContent = t || '—';
    }

    function setHashText(hash) {
      if (!hashTextEl) return;
      const h = String(hash || '').trim();
      hashTextEl.textContent = h || '—';
    }

    function setLinkDisabled(el, disabled) {
      if (!el) return;
      const d = !!disabled;
      try {
        el.classList.toggle('disabled', d);
        if (d) {
          el.setAttribute('aria-disabled', 'true');
          el.setAttribute('tabindex', '-1');
        } else {
          el.removeAttribute('aria-disabled');
          el.removeAttribute('tabindex');
        }
      } catch { /* noop */ }
    }

    let statusCache = null;
    let statusCacheToken = '';
    let statusCacheAt = 0;

    async function fetchDocStatus(tok) {
      const t = String(tok || '').trim();
      if (!t) return null;
      const now = Date.now();
      if (t === statusCacheToken && statusCache && (now - statusCacheAt) < 8000) return statusCache;
      statusCacheToken = t;
      statusCacheAt = now;
      try {
        const url = publicStatusUrlForToken(t);
        const r = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!r.ok) {
          statusCache = null;
          return null;
        }
        const data = await r.json();
        statusCache = data && typeof data === 'object' ? data : null;
        return statusCache;
      } catch {
        statusCache = null;
        return null;
      }
    }

    function getDocStatusUpper() {
      const s = String(statusCache?.status || '').trim().toUpperCase();
      return s;
    }

    function getSubstituidoPorToken() {
      return String(statusCache?.substituidoPorToken || '').trim();
    }

    function getHashSha256Pdf() {
      return String(statusCache?.hashSha256Pdf || '').trim();
    }

    function showSubstituido(subToken) {
      if (substituidoAlert) substituidoAlert.classList.toggle('d-none', !subToken);
      if (revogadoAlert) revogadoAlert.classList.add('d-none');
      if (novoVerificarLink) novoVerificarLink.setAttribute('href', subToken ? publicVerificarUrlForToken(subToken) : '#');
      if (novoPdfLink) novoPdfLink.setAttribute('href', subToken ? publicPdfUrlForToken(subToken) : '#');
      setLinkDisabled(novoVerificarLink, !subToken);
      setLinkDisabled(novoPdfLink, !subToken);
    }

    function showRevogado(show) {
      if (revogadoAlert) revogadoAlert.classList.toggle('d-none', !show);
      if (substituidoAlert) substituidoAlert.classList.add('d-none');
    }

    let syncSeq = 0;
    function syncCertificacaoUi() {
      // fire-and-forget (evita travar UI)
      syncCertificacaoUiAsync();
    }

    async function syncCertificacaoUiAsync() {
      const seq = ++syncSeq;
      const tok = getToken();
      const hasTok = !!tok;

      if (uploadWrap) uploadWrap.classList.remove('d-none');

      setTokenText(tok);
      if (warningEl) warningEl.classList.toggle('d-none', hasTok);

      // Links base (token atual do formulário)
      if (linkEl) linkEl.setAttribute('href', hasTok ? publicVerificarUrlForToken(tok) : '#');
      if (pdfLinkEl) pdfLinkEl.setAttribute('href', hasTok ? publicPdfUrlForToken(tok) : '#');
      setLinkDisabled(linkEl, !hasTok);
      setLinkDisabled(pdfLinkEl, !hasTok);

      // Hash (best-effort): se ainda não buscou status, fica em —
      setHashText('');

      // Sem token: estado pendente
      if (!hasTok) {
        showRevogado(false);
        showSubstituido('');
        setBadge('PENDENTE');
        setDesc('Envie o edital assinado.');
        if (qrOuter) qrOuter.classList.add('d-none');
        if (validadoWrap) validadoWrap.classList.add('d-none');
        setStatus('');

        // Wizard: só mostra o próximo passo
        if (step2PendingWrap) step2PendingWrap.classList.remove('d-none');
        if (step2DoneWrap) step2DoneWrap.classList.add('d-none');
        if (step1Card) step1Card.classList.remove('d-none');
        if (step3Card) step3Card.classList.add('d-none');
        step3Extras.forEach((el) => el.classList.add('d-none'));

        if (submitBtn) {
          const baseDisabled = submitBtn.dataset.baseDisabled === '1';
          submitBtn.disabled = baseDisabled || true;
        }
        return;
      }

      // Busca status real do token (VAL/REV/SUB) para polimento premium.
      await fetchDocStatus(tok);
      if (seq !== syncSeq) return;

      const st = getDocStatusUpper();
      const subTok = getSubstituidoPorToken();
      const hash = getHashSha256Pdf();
      setHashText(hash);

      const invalidKnown = (st === 'REVOGADO' || st === 'SUBSTITUIDO');

      const step2Done = hasTok && !invalidKnown;

      if (invalidKnown) {
        setBadge('REENVIAR');
        setDesc('Este arquivo não pode ser usado. Envie o edital assinado novamente.');
        showRevogado(st === 'REVOGADO');
        showSubstituido(st === 'SUBSTITUIDO' ? subTok : '');
        if (validadoWrap) validadoWrap.classList.add('d-none');
      } else {
        setBadge('CONCLUÍDO');
        setDesc('Edital assinado enviado com sucesso.');
        showRevogado(false);
        showSubstituido('');
        if (validadoWrap) validadoWrap.classList.remove('d-none');
      }

      // Wizard: só mostra o próximo passo
      if (step2PendingWrap) step2PendingWrap.classList.toggle('d-none', step2Done);
      if (step2DoneWrap) step2DoneWrap.classList.toggle('d-none', !step2Done);
      if (step1Card) step1Card.classList.toggle('d-none', step2Done);
      if (step3Card) step3Card.classList.toggle('d-none', !step2Done);
      step3Extras.forEach((el) => el.classList.toggle('d-none', !step2Done));

      // Regras: convocar/publicar só pode se houver token (FINAL). Se status inválido for conhecido, bloqueia.
      if (submitBtn) {
        const baseDisabled = submitBtn.dataset.baseDisabled === '1';
        submitBtn.disabled = baseDisabled || (!hasTok || invalidKnown);
      }

      // QRCode (opcional): só abre via botão
      if (qrOuter) qrOuter.classList.add('d-none');
      setStatus('');
    }

    async function ensureQrLib() {
      if (window.QRCode && window.QRCode.CorrectLevel) return true;
      try {
        const base = String(bp || '').replace(/\/+$/, '') || '/condominios';
        const src = `${base}/js/condominios/vendor-qrcode.min.js`;
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
        return !!(window.QRCode && window.QRCode.CorrectLevel);
      } catch {
        return false;
      }
    }

    async function renderQrCode(url) {
      if (!qrEl) return;
      const ok = await ensureQrLib();
      if (!ok) return;
      try {
        qrEl.innerHTML = '';
        const text = new URL(String(url || ''), window.location.origin).toString();
        // eslint-disable-next-line no-new
        new window.QRCode(qrEl, { text, width: 164, height: 164, correctLevel: window.QRCode.CorrectLevel.L });
      } catch { /* noop */ }
    }

    async function copyText(text) {
      const t = String(text || '');
      if (!t) return false;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(t);
          return true;
        }
      } catch { /* noop */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return !!ok;
      } catch {
        return false;
      }
    }

    async function handleUpload() {
      if (!assembleiaId) {
        setStatus('<div class="text-danger small" style="font-weight:700;">Salve a assembleia antes de enviar o PDF.</div>');
        return;
      }
      const f = fileInput?.files?.[0];
      if (!f) {
        setStatus('<div class="text-danger small" style="font-weight:700;">Selecione um arquivo PDF.</div>');
        return;
      }
      const name = String(f.name || '').toLowerCase();
      const type = String(f.type || '').toLowerCase();
      if ((type && type !== 'application/pdf') || (name && !name.endsWith('.pdf'))) {
        setStatus('<div class="text-danger small" style="font-weight:700;">Arquivo inválido. Envie um PDF.</div>');
        return;
      }

      const prevHtml = uploadBtn ? uploadBtn.innerHTML : '';
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Enviando';
      }
      setBadge('ENVIANDO');
      setDesc('Enviando…');
      setStatus('<div class="text-muted small">Enviando…</div>');

      try {
        const fd = new FormData();
        fd.append('pdf', f);
        const url = `${String(bp || '').replace(/\/+$/, '') || '/condominios'}/assembleias/${encodeURIComponent(assembleiaId)}/edital/upload-assinado`;
        const r = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' });
        let data = null;
        try { data = await r.json(); } catch { /* noop */ }

        if (!r.ok || !data?.success) {
          const msg = String(data?.message || 'Falha ao enviar o PDF.').trim();
          setStatus(`<div class="text-danger small" style="font-weight:700;">${msg}</div>`);
          return;
        }

        const token = String(data?.token || '').trim();
        if (!token) {
          setStatus('<div class="text-danger small" style="font-weight:700;">Falha ao finalizar o envio. Tente novamente.</div>');
          return;
        }

        setToken(token);
        statusCache = null;
        statusCacheToken = '';
        statusCacheAt = 0;
        const verificarUrl = String(data?.verificarUrl || publicVerificarUrlForToken(token)).trim();
        const fullUrl = new URL(verificarUrl, window.location.origin).toString();

        // Hash retornado no upload (melhor feedback imediato)
        try { setHashText(String(data?.hashSha256Pdf || '').trim()); } catch { /* noop */ }

        setStatus('<div class="text-success small" style="font-weight:700;">Edital assinado enviado com sucesso.</div>');
        syncCertificacaoUi();

        // Pré-carrega QR apenas se o usuário abrir (melhor UX/perf)
        try { await renderQrCode(fullUrl); } catch { /* noop */ }
      } catch {
        setStatus('<div class="text-danger small" style="font-weight:700;">Erro ao enviar. Tente novamente.</div>');
      } finally {
        if (uploadBtn) {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = prevHtml;
        }
        syncCertificacaoUi();
      }
    }

    if (uploadBtn && !uploadBtn.__wdgBound) {
      uploadBtn.__wdgBound = true;
      uploadBtn.addEventListener('click', handleUpload);
    }

    if (copyBtn && !copyBtn.__wdgBound) {
      copyBtn.__wdgBound = true;
      copyBtn.addEventListener('click', async () => {
        const tok = getToken();
        const st = getDocStatusUpper();
        const subTok = getSubstituidoPorToken();
        const effective = (st === 'SUBSTITUIDO' && subTok) ? subTok : tok;
        const href = effective ? new URL(publicVerificarUrlForToken(effective), window.location.origin).toString() : '';
        if (!href) return;
        const ok = await copyText(href);
        if (ok) setStatus('<div class="text-success small" style="font-weight:700;">Link copiado.</div>');
        else setStatus('<div class="text-muted small">Não foi possível copiar automaticamente.</div>');
      });
    }

    if (qrToggleBtn && !qrToggleBtn.__wdgBound) {
      qrToggleBtn.__wdgBound = true;
      qrToggleBtn.addEventListener('click', async () => {
        const tok = getToken();
        if (!tok) return;

        // Se substituído, usa o token atual para o QR (melhor para o morador).
        const st = getDocStatusUpper();
        const subTok = getSubstituidoPorToken();
        const effective = (st === 'SUBSTITUIDO' && subTok) ? subTok : tok;
        const href = effective ? new URL(publicVerificarUrlForToken(effective), window.location.origin).toString() : '';
        if (!href) return;

        const isHidden = qrOuter ? qrOuter.classList.contains('d-none') : true;
        if (qrOuter) qrOuter.classList.toggle('d-none', !isHidden);
        if (isHidden) {
          await renderQrCode(href);
        }
      });
    }

    // Estado inicial
    syncCertificacaoUi();
    (async function initQrIfToken(){
      const tok = getToken();
      if (!tok) return;
      // status + links premium
      syncCertificacaoUi();
    })();
  })();

  // Destinatários (aba Publicação): picklist 2 colunas
  const picker = qs('[data-recipients-picker]');
  if (picker) {
    const selectedListEl = qs('[data-selected-list]', picker);
    const selectedIdsInput = qs('input[data-selected-ids]', picker);
    const selectedCountEls = [qs('[data-selected-count]', picker), qs('[data-selected-badge]', picker)].filter(Boolean);
    const selectedToplineEl = qs('[data-selected-topline]', picker);
    const selectedEmptyEl = qs('[data-selected-empty]', picker);

    const btnAddAll = qs('#btnAddAll', picker);
    const btnAdd = qs('#btnAdd', picker);
    const btnRemove = qs('#btnRemove', picker);
    const btnRemoveAll = qs('#btnRemoveAll', picker);

    const normalizeId = (v) => String(v || '').trim();
    const parseCsvIds = (csv) => String(csv || '')
      .split(',')
      .map(s => normalizeId(s))
      .filter(Boolean);

    function findAvailableRowById(id) {
      const pid = normalizeId(id);
      if (!pid) return null;
      return qsa('[data-available-person]', picker).find(row => normalizeId(row.getAttribute('data-person-id')) === pid) || null;
    }

    function findAvailableRowByAlias(id) {
      const pid = normalizeId(id);
      if (!pid) return null;
      const rows = qsa('[data-available-person]', picker);
      for (const row of rows) {
        const aliasesCsv = String(row.getAttribute('data-person-aliases') || '').trim();
        if (!aliasesCsv) continue;
        const aliases = aliasesCsv.split(',').map(s => normalizeId(s)).filter(Boolean);
        if (aliases.includes(pid)) return row;
      }
      return null;
    }

    function resolveToAvailableId(rawId) {
      const pid = normalizeId(rawId);
      if (!pid) return '';
      if (findAvailableRowById(pid)) return pid;
      const byAlias = findAvailableRowByAlias(pid);
      if (byAlias) return normalizeId(byAlias.getAttribute('data-person-id')) || pid;
      return pid;
    }

    const selectedIds = new Set(parseCsvIds(selectedIdsInput ? selectedIdsInput.value : '').map(resolveToAvailableId).filter(Boolean));

    // Fallback: se o server renderizou cards em "Selecionados" mas o hidden veio vazio,
    // considera o DOM como fonte inicial.
    try {
      if (selectedListEl && selectedIds.size === 0) {
        const domIds = qsa('[data-person-id]', selectedListEl)
          .map(el => normalizeId(el?.getAttribute?.('data-person-id')))
          .filter(Boolean)
          .map(resolveToAvailableId)
          .filter(Boolean);
        domIds.forEach((pid) => selectedIds.add(pid));
      }
    } catch { /* noop */ }

    function readPersonInfoFromEl(el) {
      if (!el) return null;
      const id = normalizeId(el.getAttribute('data-person-id'));
      if (!id) return null;

      const nome = String(qs('[data-person-nome]', el)?.textContent || '').trim();
      const subtitulos = qsa('[data-person-subtitulo]', el)
        .map(n => String(n?.textContent || '').trim())
        .filter(Boolean);
      const email = String(qs('[data-person-email]', el)?.textContent || '').trim();

      // foto: tenta ler do card selecionado (img), senão vazio
      let foto = '';
      try {
        const img = qs('img', el);
        if (img && img.getAttribute) foto = String(img.getAttribute('src') || '').trim();
      } catch { /* noop */ }

      return { id, nome, subtitulos, email, foto };
    }

    function buildSelectedCard(person) {
      const p = person || {};
      const id = normalizeId(p.id);
      const nome = String(p.nome || '').trim() || '-';
      const subtitulos = Array.isArray(p.subtitulos) ? p.subtitulos : (String(p.subtitulo || '').trim() ? [String(p.subtitulo || '').trim()] : []);
      const email = String(p.email || '').trim();
      const foto = String(p.foto || '').trim() || '/images/usuario.png';

      const subtitulosHtml = (subtitulos || [])
        .map(s => String(s || '').trim())
        .filter(Boolean)
        .map(s => `<div class="text-muted small" data-person-subtitulo>${escapeHtml(s)}</div>`)
        .join('');

      const wrap = document.createElement('div');
      wrap.className = 'card';
      wrap.setAttribute('data-person-id', id);
      wrap.innerHTML = `
        <div class="card-body py-2">
          <div class="d-flex align-items-start gap-2">
            <div class="form-check mt-1">
              <input class="form-check-input" type="checkbox" data-selected-checkbox>
            </div>
            <div class="rounded-circle border bg-light" style="width:38px;height:38px;overflow:hidden;flex:0 0 38px;">
              <img src="${foto}" alt="" style="width:38px;height:38px;object-fit:cover;display:block;">
            </div>
            <div class="flex-grow-1" style="min-width:0;">
              <div class="fw-semibold" data-person-nome>${escapeHtml(nome)}</div>
              ${subtitulosHtml}
              <div class="text-muted small" data-person-email>${escapeHtml(email)}</div>
            </div>
          </div>
        </div>
      `;
      return wrap;
    }

    function escapeHtml(v) {
      return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getSelectedCount() {
      return selectedIds.size;
    }

    function syncHiddenInput() {
      if (!selectedIdsInput) return;
      selectedIdsInput.value = Array.from(selectedIds.values()).join(',');
    }

    function syncCounters() {
      const n = getSelectedCount();
      selectedCountEls.forEach(el => { try { el.textContent = String(n); } catch { /* noop */ } });
      if (selectedToplineEl) selectedToplineEl.textContent = `${n} selecionados`;
      if (selectedEmptyEl) selectedEmptyEl.style.display = n === 0 ? '' : 'none';
    }

    function markAvailableCheckboxes() {
      const normalizeEmailSimple = (value) => {
        const s = String(value || '').trim().toLowerCase();
        return (s && s.includes('@')) ? s : '';
      };

      const selectedEmails = (() => {
        const set = new Set();
        if (!selectedListEl) return set;
        qsa('[data-person-id]', selectedListEl).forEach((row) => {
          const email = String(qs('[data-person-email]', row)?.textContent || '').trim();
          const norm = normalizeEmailSimple(email);
          if (norm) set.add(norm);
        });
        return set;
      })();

      qsa('[data-available-person]', picker).forEach((row) => {
        const id = normalizeId(row.getAttribute('data-person-id'));
        const cb = qs('[data-available-checkbox]', row);
        if (!cb) return;
        const rowEmail = String(qs('[data-person-email]', row)?.textContent || '').trim();
        const rowEmailNorm = normalizeEmailSimple(rowEmail);
        const isSelected = (id && selectedIds.has(id)) || (rowEmailNorm && selectedEmails.has(rowEmailNorm));
        if (isSelected) cb.checked = false;
        cb.disabled = !!isSelected;
        row.style.opacity = isSelected ? '0.55' : '';
      });

      syncListToggles();
    }

    function getEnabledAvailableCheckboxes() {
      return qsa('[data-available-checkbox]', picker).filter(cb => cb && !cb.disabled);
    }

    function getAllSelectedCheckboxes() {
      if (!selectedListEl) return [];
      return qsa('[data-selected-checkbox]', selectedListEl).filter(Boolean);
    }

    function setListChecked(listKey, checked) {
      const key = normalizeId(listKey);
      const want = !!checked;
      if (key === 'available') {
        getEnabledAvailableCheckboxes().forEach((cb) => { cb.checked = want; });
        syncGroupToggles();
        syncListToggles();
        return;
      }
      if (key === 'selected') {
        getAllSelectedCheckboxes().forEach((cb) => { cb.checked = want; });
        syncListToggles();
      }
    }

    function syncListToggles() {
      const toggles = qsa('[data-list-toggle]', picker);
      if (!toggles.length) return;

      toggles.forEach((t) => {
        const key = normalizeId(t.getAttribute('data-list-toggle'));

        if (key === 'available') {
          const enabled = getEnabledAvailableCheckboxes();
          if (!enabled.length) {
            t.checked = false;
            t.indeterminate = false;
            t.disabled = true;
            return;
          }
          t.disabled = false;
          const checkedCount = enabled.filter(cb => cb.checked).length;
          t.indeterminate = checkedCount > 0 && checkedCount < enabled.length;
          t.checked = checkedCount === enabled.length;
          return;
        }

        if (key === 'selected') {
          const all = getAllSelectedCheckboxes();
          if (!all.length) {
            t.checked = false;
            t.indeterminate = false;
            t.disabled = true;
            return;
          }
          t.disabled = false;
          const checkedCount = all.filter(cb => cb.checked).length;
          t.indeterminate = checkedCount > 0 && checkedCount < all.length;
          t.checked = checkedCount === all.length;
        }
      });
    }

    function ensureSelectedCardForId(id) {
      const pid = normalizeId(id);
      if (!pid || !selectedListEl) return;
      const existing = qs(`[data-person-id="${cssEscape(pid)}"]`, selectedListEl);
      if (existing) return;

      // tenta puxar dados da coluna esquerda (disponíveis); suporta IDs antigos via aliases
      const src = findAvailableRowById(pid) || findAvailableRowByAlias(pid) || null;
      const info = readPersonInfoFromEl(src) || { id: pid, nome: pid, subtitulo: '', email: '', foto: '' };
      const card = buildSelectedCard(info);
      selectedListEl.appendChild(card);
    }

    function removeSelectedCardForId(id) {
      if (!selectedListEl) return;
      const pid = normalizeId(id);
      if (!pid) return;
      const el = qs(`[data-person-id="${cssEscape(pid)}"]`, selectedListEl);
      if (el) el.remove();
    }

    function cssEscape(value) {
      // fallback simples (id esperado: sem aspas); garante não quebrar seletor
      return String(value || '').replace(/\\/g, '\\\\').replace(/\"/g, '\\"');
    }

    function addSelected(ids) {
      const list = Array.isArray(ids) ? ids : [];
      list.map(normalizeId).filter(Boolean).forEach((pid) => {
        if (selectedIds.has(pid)) return;
        selectedIds.add(pid);
        ensureSelectedCardForId(pid);
      });
      syncHiddenInput();
      syncCounters();
      markAvailableCheckboxes();
      syncGroupToggles();
      syncListToggles();
    }

    function removeSelected(ids) {
      const list = Array.isArray(ids) ? ids : [];
      list.map(normalizeId).filter(Boolean).forEach((pid) => {
        if (!selectedIds.has(pid)) return;
        selectedIds.delete(pid);
        removeSelectedCardForId(pid);
      });
      syncHiddenInput();
      syncCounters();
      markAvailableCheckboxes();
      syncGroupToggles();
      syncListToggles();
    }

    function getGroupAvailableIds(groupKey) {
      const key = normalizeId(groupKey);
      if (!key) return [];
      const ids = qsa('[data-available-person]', picker)
        .filter(row => normalizeId(row.getAttribute('data-group')) === key)
        .map(row => normalizeId(row.getAttribute('data-person-id')))
        .filter(Boolean);
      return Array.from(new Set(ids));
    }

    function setGroupAvailableChecked(groupKey, checked) {
      const key = normalizeId(groupKey);
      const want = !!checked;
      if (!key) return;
      qsa('[data-available-person]', picker)
        .filter(row => normalizeId(row.getAttribute('data-group')) === key)
        .forEach((row) => {
          const cb = qs('[data-available-checkbox]', row);
          if (!cb || cb.disabled) return;
          cb.checked = want;
        });
    }

    function syncGroupToggles() {
      const toggles = qsa('[data-group-toggle]', picker);
      if (!toggles.length) return;
      toggles.forEach((t) => {
        const key = normalizeId(t.getAttribute('data-group'));
        const rows = qsa('[data-available-person]', picker)
          .filter(row => normalizeId(row.getAttribute('data-group')) === key);
        const enabledRows = rows.filter(row => {
          const cb = qs('[data-available-checkbox]', row);
          return cb && !cb.disabled;
        });
        if (!enabledRows.length) {
          t.checked = false;
          t.indeterminate = false;
          t.disabled = true;
          return;
        }
        t.disabled = false;
        const checkedCount = enabledRows.filter(row => {
          const cb = qs('[data-available-checkbox]', row);
          return cb && cb.checked;
        }).length;
        t.indeterminate = checkedCount > 0 && checkedCount < enabledRows.length;
        t.checked = checkedCount === enabledRows.length;
      });
    }

    // Selecionar todos por grupo (Dirigentes/Colaboradores/Condôminos)
    qsa('[data-group-toggle]', picker).forEach((t) => {
      if (t.__wdgBound) return;
      t.__wdgBound = true;
      t.addEventListener('change', () => {
        const key = normalizeId(t.getAttribute('data-group'));
        setGroupAvailableChecked(key, !!t.checked);
        syncGroupToggles();
      });
    });

    function addAllVisible() {
      const ids = qsa('[data-available-person]', picker)
        .map(el => normalizeId(el.getAttribute('data-person-id')))
        .filter(Boolean);
      addSelected(ids);
    }

    function removeAll() {
      const ids = Array.from(selectedIds.values());
      removeSelected(ids);
    }

    function getCheckedAvailableIds() {
      return qsa('[data-available-person]', picker)
        .filter(row => {
          const cb = qs('[data-available-checkbox]', row);
          return cb && cb.checked && !cb.disabled;
        })
        .map(row => normalizeId(row.getAttribute('data-person-id')))
        .filter(Boolean);
    }

    function getCheckedSelectedIds() {
      if (!selectedListEl) return [];
      return qsa('[data-person-id]', selectedListEl)
        .filter(row => {
          const cb = qs('[data-selected-checkbox]', row);
          return cb && cb.checked;
        })
        .map(row => normalizeId(row.getAttribute('data-person-id')))
        .filter(Boolean);
    }

    // bind botões
    if (btnAddAll) btnAddAll.addEventListener('click', () => addAllVisible());
    if (btnAdd) btnAdd.addEventListener('click', () => addSelected(getCheckedAvailableIds()));
    if (btnRemove) btnRemove.addEventListener('click', () => removeSelected(getCheckedSelectedIds()));
    if (btnRemoveAll) btnRemoveAll.addEventListener('click', () => removeAll());

    // Remoção é feita somente pelos botões (< e <<)

    // Estado inicial: garante que o DOM reflita o hidden input
    try {
      // Se o EJS trouxe snapshot vazio mas há IDs, cria cards best-effort
      Array.from(selectedIds.values()).forEach((pid) => ensureSelectedCardForId(pid));
    } catch { /* noop */ }
    syncHiddenInput();
    syncCounters();
    markAvailableCheckboxes();
    syncGroupToggles();
    syncListToggles();

    // Selecionar todos por lista (Disponíveis / Selecionados)
    qsa('[data-list-toggle]', picker).forEach((t) => {
      if (t.__wdgBound) return;
      t.__wdgBound = true;
      t.addEventListener('change', () => {
        const key = normalizeId(t.getAttribute('data-list-toggle'));
        setListChecked(key, !!t.checked);
      });
    });

    // Ao marcar/desmarcar checkboxes individuais (disponíveis), atualiza o estado dos toggles de grupo
    qsa('[data-available-checkbox]', picker).forEach((cb) => {
      if (cb.__wdgBound) return;
      cb.__wdgBound = true;
      cb.addEventListener('change', () => {
        syncGroupToggles();
        syncListToggles();
      });
    });

    // Ao marcar/desmarcar checkboxes individuais (selecionados), atualiza o estado do toggle do cabeçalho
    if (selectedListEl) {
      qsa('[data-selected-checkbox]', selectedListEl).forEach((cb) => {
        if (cb.__wdgBound) return;
        cb.__wdgBound = true;
        cb.addEventListener('change', () => syncListToggles());
      });

      // Se novos cards forem adicionados dinamicamente, o listener acima não cobre.
      // Usa delegação simples para manter o toggle sincronizado.
      if (!selectedListEl.__wdgDelegateBound) {
        selectedListEl.__wdgDelegateBound = true;
        selectedListEl.addEventListener('change', (ev) => {
          const target = ev?.target;
          if (!target) return;
          if (target.matches && target.matches('[data-selected-checkbox]')) syncListToggles();
        });
      }
    }
  }
})();
