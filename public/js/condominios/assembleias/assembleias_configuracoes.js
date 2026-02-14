(function () {
  'use strict';

  const root = document.getElementById('assembleiaConfiguracoesApp');
  if (!root) return;

  function qs(sel, el) { return (el || document).querySelector(sel); }
  function qsa(sel, el) { return Array.from((el || document).querySelectorAll(sel)); }

  const DEFAULT_RECOMMENDED = {
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

  function safeJsonParse(text) {
    try {
      const s = String(text || '').trim();
      if (!s) return null;
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function normalizeRegras(input) {
    const r = (input && typeof input === 'object') ? input : {};

    const voteMode = (r.voteMode === 'POR_UNIDADE' || r.voteMode === 'POR_FRACAO') ? r.voteMode : DEFAULT_RECOMMENDED.voteMode;
    const delinquencyPolicy = (r.delinquencyPolicy === 'BLOQUEIA_VOTO' || r.delinquencyPolicy === 'APENAS_AVISO' || r.delinquencyPolicy === 'BLOQUEIA_PRESENCA_E_VOTO')
      ? r.delinquencyPolicy
      : DEFAULT_RECOMMENDED.delinquencyPolicy;

    const eligibilityIn = (r.eligibility && typeof r.eligibility === 'object') ? r.eligibility : {};
    const eligibility = {
      allowOwner: !!eligibilityIn.allowOwner,
      allowProxyWithPoA: !!eligibilityIn.allowProxyWithPoA,
      allowTenantWithAuthorization: !!eligibilityIn.allowTenantWithAuthorization,
      allowThirdPartyWithPoA: !!eligibilityIn.allowThirdPartyWithPoA
    };

    let requirePoAIfNotOwner = !!r.requirePoAIfNotOwner;
    if (!eligibility.allowProxyWithPoA && requirePoAIfNotOwner) {
      // Regra de coerência: se não existe procurador, não faz sentido exigir procuração (corrige no client também).
      requirePoAIfNotOwner = false;
    }

    const presenceIn = (r.presence && typeof r.presence === 'object') ? r.presence : {};
    const presence = {
      allowRemotePresence: !!presenceIn.allowRemotePresence,
      requireModeratorApprovalForRemote: !!presenceIn.requireModeratorApprovalForRemote
    };
    if (!presence.allowRemotePresence) presence.requireModeratorApprovalForRemote = false;

    const quorumIn = (r.quorum && typeof r.quorum === 'object') ? r.quorum : {};
    const installationBase = (quorumIn.installationBase === 'TOTAL' || quorumIn.installationBase === 'ADIMPLENTES' || quorumIn.installationBase === 'PRESENTES')
      ? quorumIn.installationBase
      : DEFAULT_RECOMMENDED.quorum.installationBase;

    let metric = (quorumIn.metric === 'UNIDADES' || quorumIn.metric === 'FRACAO')
      ? quorumIn.metric
      : (voteMode === 'POR_FRACAO' ? 'FRACAO' : 'UNIDADES');

    // Coerência com voteMode
    if (voteMode === 'POR_FRACAO') metric = 'FRACAO';
    if (voteMode === 'POR_UNIDADE') metric = (metric === 'FRACAO') ? 'UNIDADES' : metric;

    const auditIn = (r.audit && typeof r.audit === 'object') ? r.audit : {};
    const audit = {
      requireReasonOnOverride: (auditIn.requireReasonOnOverride === false) ? false : true
    };

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

  function setWarning(text) {
    const box = qs('[data-regras-warning]');
    if (!box) return;
    const msg = String(text || '').trim();
    if (!msg) {
      box.classList.add('d-none');
      box.textContent = '';
      return;
    }
    box.textContent = msg;
    box.classList.remove('d-none');
  }

  function readFromUI() {
    const voteMode = String(qs('input[name="voteMode"]:checked')?.value || '').trim();
    const delinquencyPolicy = String(qs('input[name="delinquencyPolicy"]:checked')?.value || '').trim();

    const eligibility = {
      allowOwner: !!qs('[data-elig="allowOwner"]')?.checked,
      allowProxyWithPoA: !!qs('[data-elig="allowProxyWithPoA"]')?.checked,
      allowTenantWithAuthorization: !!qs('[data-elig="allowTenantWithAuthorization"]')?.checked,
      allowThirdPartyWithPoA: !!qs('[data-elig="allowThirdPartyWithPoA"]')?.checked
    };

    const requirePoAIfNotOwner = !!qs('[data-require-poa]')?.checked;

    const presence = {
      allowRemotePresence: !!qs('[data-presence="allowRemotePresence"]')?.checked,
      requireModeratorApprovalForRemote: !!qs('[data-presence="requireModeratorApprovalForRemote"]')?.checked
    };

    const quorum = {
      installationBase: String(qs('[data-quorum="installationBase"]')?.value || '').trim(),
      metric: String(qs('[data-quorum="metric"]')?.value || '').trim()
    };

    const audit = {
      requireReasonOnOverride: !!qs('[data-audit-reason]')?.checked
    };

    return normalizeRegras({ voteMode, delinquencyPolicy, eligibility, requirePoAIfNotOwner, presence, quorum, audit });
  }

  function applyToUI(regras) {
    const r = normalizeRegras(regras);

    // radios
    qsa('input[name="voteMode"]').forEach((el) => { el.checked = String(el.value) === r.voteMode; });
    qsa('input[name="delinquencyPolicy"]').forEach((el) => { el.checked = String(el.value) === r.delinquencyPolicy; });

    // eligibility
    const mapElig = {
      allowOwner: r.eligibility.allowOwner,
      allowProxyWithPoA: r.eligibility.allowProxyWithPoA,
      allowTenantWithAuthorization: r.eligibility.allowTenantWithAuthorization,
      allowThirdPartyWithPoA: r.eligibility.allowThirdPartyWithPoA
    };
    Object.keys(mapElig).forEach((k) => {
      const el = qs(`[data-elig="${k}"]`);
      if (el) el.checked = !!mapElig[k];
    });

    const reqPoA = qs('[data-require-poa]');
    if (reqPoA) reqPoA.checked = !!r.requirePoAIfNotOwner;

    const pr = qs('[data-presence="allowRemotePresence"]');
    const pm = qs('[data-presence="requireModeratorApprovalForRemote"]');
    if (pr) pr.checked = !!r.presence.allowRemotePresence;
    if (pm) pm.checked = !!r.presence.requireModeratorApprovalForRemote;

    const qb = qs('[data-quorum="installationBase"]');
    const qm = qs('[data-quorum="metric"]');
    if (qb) qb.value = r.quorum.installationBase;
    if (qm) qm.value = r.quorum.metric;

    const ar = qs('[data-audit-reason]');
    if (ar) ar.checked = !!r.audit.requireReasonOnOverride;

    syncCoherence({ showWarnings: false });
  }

  function syncCoherence({ showWarnings } = {}) {
    const voteMode = String(qs('input[name="voteMode"]:checked')?.value || '').trim();

    // voteMode -> metric
    const metricSel = qs('[data-quorum="metric"]');
    if (metricSel) {
      if (voteMode === 'POR_FRACAO') metricSel.value = 'FRACAO';
      if (voteMode === 'POR_UNIDADE' && metricSel.value === 'FRACAO') metricSel.value = 'UNIDADES';
    }

    // remote presence -> moderator approval enabled
    const allowRemote = !!qs('[data-presence="allowRemotePresence"]')?.checked;
    const requireMod = qs('[data-presence="requireModeratorApprovalForRemote"]');
    if (requireMod) {
      requireMod.disabled = !allowRemote;
      if (!allowRemote) requireMod.checked = false;
    }

    // requirePoAIfNotOwner coherence
    const allowProxy = !!qs('[data-elig="allowProxyWithPoA"]')?.checked;
    const reqPoA = qs('[data-require-poa]');
    if (reqPoA && reqPoA.checked && !allowProxy) {
      reqPoA.checked = false;
      if (showWarnings) {
        setWarning('A opção “Procuração obrigatória se não for proprietário” foi desativada porque “Procurador com procuração” não está habilitado.');
      }
    } else if (showWarnings) {
      setWarning('');
    }
  }

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

    const desired = String(sel.getAttribute('data-selected-unidade-id') || '').trim();
    const firstRealId = String(units[0]?._id || '').trim();
    const toSelect = desired || (sel.disabled ? firstRealId : '');
    if (toSelect) {
      sel.value = toSelect;
      try { sel.setAttribute('data-selected-unidade-id', toSelect); } catch { /* noop */ }
    }

    syncUnidadeHidden(sel.value);
    syncCondoLogo(sel.value);

    // Se não veio regras do server (Master sem unidade selecionada), carrega via JSON quando selecionar.
    if (!desired && String(sel.value || '').trim()) {
      await reloadRegras(sel.value);
    }
  }

  function syncUnidadeHidden(unidadeId) {
    const v = String(unidadeId || '').trim();
    const hid = qs('input[data-unidade-hidden][name="unidade_id"]');
    if (hid) hid.value = v;
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

  async function reloadRegras(unidadeId) {
    const bp = root.getAttribute('data-base-path') || '';
    const id = String(unidadeId || '').trim();
    if (!id) {
      applyToUI(DEFAULT_RECOMMENDED);
      return;
    }

    try {
      const url = new URL(`${bp}/assembleias/configuracoes/json`, window.location.origin);
      url.searchParams.set('unidade_id', id);
      url.searchParams.set('v', String(Date.now()));
      const r = await fetch(url.toString(), { credentials: 'same-origin' });
      if (!r.ok) throw new Error('Falha ao carregar regras');
      const data = await r.json();
      const regras = data && data.regras ? data.regras : DEFAULT_RECOMMENDED;
      applyToUI(regras);
    } catch {
      applyToUI(DEFAULT_RECOMMENDED);
    }
  }

  (function boot() {
    const initial = (function () {
      const el = qs('#regrasInitialJson');
      return safeJsonParse(el ? el.textContent : '') || {};
    })();

    applyToUI(Object.keys(initial || {}).length ? initial : DEFAULT_RECOMMENDED);

    // Bind changes for coherence
    qsa('input[name="voteMode"]').forEach((el) => el.addEventListener('change', () => syncCoherence({ showWarnings: true })));
    qsa('[data-elig]').forEach((el) => el.addEventListener('change', () => syncCoherence({ showWarnings: true })));
    qsa('[data-presence]').forEach((el) => el.addEventListener('change', () => syncCoherence({ showWarnings: true })));
    const qb = qs('[data-quorum="installationBase"]');
    if (qb) qb.addEventListener('change', () => syncCoherence({ showWarnings: false }));

    const restoreBtn = qs('[data-regras-restore]');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => {
        applyToUI(DEFAULT_RECOMMENDED);
        setWarning('Padrão recomendado aplicado. Revise e clique em “Salvar configurações”.');
      });
    }

    const sel = qs('[data-condo-select]');
    if (sel) {
      sel.addEventListener('change', async () => {
        const v = String(sel.value || '').trim();
        syncUnidadeHidden(v);
        syncCondoLogo(v);
        await reloadRegras(v);
      });
    }

    // Submit: serializa para JSON
    const form = qs('#assembleiaConfigForm');
    if (form) {
      form.addEventListener('submit', (ev) => {
        const unidadeId = String(qs('input[data-unidade-hidden][name="unidade_id"]')?.value || '').trim();
        const canScopeAll = String(root.getAttribute('data-scope-all') || '').toLowerCase() === 'true';
        if (canScopeAll && !unidadeId) {
          ev.preventDefault();
          setWarning('Selecione um condomínio para salvar as configurações.');
          return;
        }

        syncCoherence({ showWarnings: true });
        const regras = readFromUI();
        const hid = qs('input[data-regras-json][name="regrasJson"]', form);
        if (hid) hid.value = JSON.stringify(regras);
      });
    }

    hydrateCondoSelect();
  })();
})();
