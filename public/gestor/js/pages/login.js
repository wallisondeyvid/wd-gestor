/* =========================================================================
 * LOGIN — Cópia de public/js/login.js
 * ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const basePath = (typeof window._BASE_PATH === 'string' && window._BASE_PATH.trim())
    ? window._BASE_PATH.trim()
    : '/gestor';

  // Validação do formulário (robusta para diferentes ids/nomes)
  const form = document.querySelector('form');
  if (form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalSubmitHtml = submitBtn ? submitBtn.innerHTML : '';
    const loadingLabel = submitBtn?.getAttribute('data-loading-label') || 'Entrando...';
    form.addEventListener('submit', (event) => {
      const emailEl = document.getElementById('email')
        || document.getElementById('usuario')
        || document.querySelector('input[name="email"]');
      const senhaEl = document.getElementById('senha')
        || document.querySelector('input[type="password"][name="senha"]')
        || document.querySelector('input[type="password"]');
      const emailVal = (emailEl && typeof emailEl.value === 'string') ? emailEl.value.trim() : '';
      const senhaVal = (senhaEl && typeof senhaEl.value === 'string') ? senhaEl.value.trim() : '';
      if (!emailVal || !senhaVal) {
        event.preventDefault();
        alert('Por favor, preencha ambos os campos: E-mail e Senha.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.innerHTML = `<span class="auth-submit-spinner"><i class="bi bi-hourglass-split"></i>${loadingLabel}</span>`;
      }
    });

    window.addEventListener('pageshow', () => {
      if (!submitBtn) return;
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.innerHTML = originalSubmitHtml;
    });
  }

  // Tratamento de foco por parâmetro de erro (compatível com id/nome diferentes)
  (function(){
    try {
      const params = new URLSearchParams(window.location.search);
      const erro = params.get('erro');
      const emailEl = document.getElementById('email')
        || document.getElementById('usuario')
        || document.querySelector('input[name="email"]');
      const senhaEl = document.getElementById('senha')
        || document.querySelector('input[type="password"][name="senha"]')
        || document.querySelector('input[type="password"]');
      if (erro === 'usuario') { if (emailEl) emailEl.value = ''; if (senhaEl) senhaEl.value = ''; emailEl && emailEl.focus(); }
      else if (erro === 'senha') { if (senhaEl) senhaEl.value = ''; senhaEl && senhaEl.focus(); }
    } catch(e){}
  })();

  // Mostrar/ocultar senha (se presente)
  const toggleBtn = document.getElementById('toggleSenha') || document.querySelector('.toggle-pass');
  if (toggleBtn) {
    toggleBtn.type = 'button';
    toggleBtn.addEventListener('click', (event) => {
      event.preventDefault();

      const input = document.getElementById('senha')
        || document.querySelector('input[name="senha"]');
      const icon = event.currentTarget.querySelector('i');
      if (!input) return;

      const shouldShow = input.type === 'password';
      input.type = shouldShow ? 'text' : 'password';
      toggleBtn.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
      toggleBtn.setAttribute('aria-pressed', shouldShow ? 'true' : 'false');

      if (icon) {
        icon.classList.toggle('bi-eye', !shouldShow);
        icon.classList.toggle('bi-eye-slash', shouldShow);
      }
    });
  }

  const params = new URLSearchParams(window.location.search);
  const selectionStepRequested = params.get('step') === 'select';
  const loginFormSection = document.getElementById('loginFormSection');
  const selectionPanel = document.getElementById('loginSelectionPanel');
  const selectionAlert = document.getElementById('loginSelectionAlert');
  const selectionStatus = document.getElementById('loginSelectionStatus');
  const selectionList = document.getElementById('loginUnitSelectionList');

  function notifySelection(message, variant = 'warning') {
    if (typeof window.showToast === 'function') {
      window.showToast({ title: 'Seleção de unidade', body: message, variant });
    }
  }

  function setSelectionMode(enabled) {
    if (loginFormSection) loginFormSection.classList.toggle('d-none', enabled);
    if (selectionPanel) selectionPanel.classList.toggle('d-none', !enabled);
  }

  function setSelectionAlert(message) {
    if (!selectionAlert) return;
    if (!message) {
      selectionAlert.classList.add('d-none');
      selectionAlert.textContent = '';
      return;
    }

    selectionAlert.textContent = message;
    selectionAlert.classList.remove('d-none');
  }

  function clearSelectionStepFromUrl() {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('step');
    const normalized = `${nextUrl.pathname}${nextUrl.search ? nextUrl.search : ''}${nextUrl.hash || ''}`;
    window.history.replaceState({}, document.title, normalized);
  }

  function redirectToDashboard() {
    window.location.assign(`${basePath}/dashboard`);
  }

  function fallbackToLogin(message) {
    setSelectionMode(false);
    clearSelectionStepFromUrl();
    setSelectionAlert('');
    if (selectionList) selectionList.innerHTML = '';
    if (selectionStatus) selectionStatus.textContent = '';
    if (message) notifySelection(message, 'warning');
  }

  function buildSelectionErrorMessage(code) {
    switch (String(code || '').trim()) {
      case 'GESTOR_INVALID_UNIDADE_ID':
        return 'Não foi possível identificar a unidade selecionada.';
      case 'GESTOR_UNIT_NOT_ALLOWED':
        return 'A unidade escolhida não pertence aos seus vínculos ativos.';
      case 'GESTOR_UNAUTHORIZED':
        return 'Sua sessão expirou. Faça login novamente para continuar.';
      case 'GESTOR_SELECTION_NOT_REQUIRED':
        return 'Sua seleção de unidade já foi concluída.';
      case 'GESTOR_AUTH_CONTEXT_SELECTION_DISABLED':
        return 'A seleção de unidade não está disponível neste ambiente.';
      case 'GESTOR_AUTH_CONTEXT_SELECTION_ERROR':
        return 'Não foi possível concluir a seleção de unidade agora.';
      default:
        return 'Não foi possível concluir a seleção de unidade. Tente novamente.';
    }
  }

  function getMembershipLabel(membership) {
    const unidadeNome = String(membership?.unidadeNome || '').trim() || 'Unidade sem nome';
    const unidadeCodigo = String(membership?.unidadeCodigo || '').trim();
    const papel = String(membership?.papelContextual || '').trim().toLowerCase() === 'gestor'
      ? 'Gestor'
      : 'Usuário';

    return {
      title: unidadeNome,
      subtitle: unidadeCodigo ? `Código ${unidadeCodigo}` : 'Código não informado',
      badge: papel,
    };
  }

  function setSelectionButtonsDisabled(disabled) {
    if (!selectionList) return;
    const buttons = selectionList.querySelectorAll('[data-unidade-id]');
    buttons.forEach((button) => {
      button.disabled = disabled;
      button.classList.toggle('disabled', disabled);
    });
  }

  async function postSelectedUnit(unidadeId) {
    setSelectionAlert('');
    setSelectionButtonsDisabled(true);
    if (selectionStatus) selectionStatus.textContent = 'Confirmando unidade selecionada...';

    try {
      const response = await fetch(`${basePath}/auth/select-unit`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ unidade_id: unidadeId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok) {
        redirectToDashboard();
        return;
      }

      if (response.status === 401) {
        fallbackToLogin(buildSelectionErrorMessage(payload?.code));
        return;
      }

      if (response.status === 409 && payload?.authenticated && !payload?.needsUnitSelection) {
        redirectToDashboard();
        return;
      }

      setSelectionAlert(buildSelectionErrorMessage(payload?.code));
      if (selectionStatus) selectionStatus.textContent = 'Escolha uma unidade válida para continuar.';
      setSelectionButtonsDisabled(false);
    } catch (_error) {
      setSelectionAlert('Não foi possível concluir a seleção de unidade agora. Tente novamente.');
      if (selectionStatus) selectionStatus.textContent = 'Escolha uma unidade válida para continuar.';
      setSelectionButtonsDisabled(false);
    }
  }

  function renderSelectionOptions(memberships) {
    if (!selectionList) return;

    selectionList.innerHTML = '';
    memberships.forEach((membership) => {
      const button = document.createElement('button');
      const label = getMembershipLabel(membership);
      const row = document.createElement('div');
      const info = document.createElement('div');
      const title = document.createElement('div');
      const subtitle = document.createElement('div');
      const badge = document.createElement('span');

      button.type = 'button';
      button.className = 'list-group-item list-group-item-action text-start';
      button.dataset.unidadeId = membership.unidadeId;

      row.className = 'd-flex w-100 justify-content-between align-items-center gap-2';
      info.className = '';
      title.className = 'fw-semibold';
      title.textContent = label.title;
      subtitle.className = 'small text-muted';
      subtitle.textContent = label.subtitle;
      badge.className = 'badge text-bg-light border';
      badge.textContent = label.badge;

      info.appendChild(title);
      info.appendChild(subtitle);
      row.appendChild(info);
      row.appendChild(badge);
      button.appendChild(row);

      button.addEventListener('click', () => {
        if (!membership?.unidadeId) {
          setSelectionAlert('Não foi possível identificar a unidade selecionada.');
          return;
        }
        postSelectedUnit(membership.unidadeId);
      });

      selectionList.appendChild(button);
    });
  }

  async function hydrateSelectionStep() {
    if (!selectionStepRequested || !selectionPanel) return;

    setSelectionMode(true);
    setSelectionAlert('');
    if (selectionStatus) selectionStatus.textContent = 'Carregando suas unidades...';
    if (selectionList) selectionList.innerHTML = '';

    try {
      const response = await fetch(`${basePath}/auth/context?_=${Date.now()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 || !payload?.authenticated) {
        fallbackToLogin('Sua sessão de seleção expirou. Faça login novamente.');
        return;
      }

      if (payload?.globalRole || payload?.activeContext || Number(payload?.membershipCount || 0) === 1) {
        redirectToDashboard();
        return;
      }

      if (!payload?.needsUnitSelection) {
        fallbackToLogin('Nenhuma seleção de unidade está pendente nesta sessão.');
        return;
      }

      const memberships = Array.isArray(payload?.memberships)
        ? payload.memberships.filter((membership) => membership && membership.unidadeId)
        : [];

      if (!memberships.length) {
        fallbackToLogin('Não foi possível carregar suas unidades disponíveis. Faça login novamente.');
        return;
      }

      renderSelectionOptions(memberships);
      if (selectionStatus) selectionStatus.textContent = 'Escolha a unidade que deseja usar nesta sessão.';
    } catch (_error) {
      fallbackToLogin('Não foi possível carregar suas unidades disponíveis. Tente novamente.');
    }
  }

  hydrateSelectionStep();
  // Sem alterações visuais automáticas: respeita o CSS original da página
});
