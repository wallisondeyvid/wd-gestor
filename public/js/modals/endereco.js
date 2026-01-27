(() => {
  'use strict';

  function getBasePath() {
    // 1. atributo data-base-path no <body>
    const bodyAttr = document.body?.getAttribute('data-base-path');
    if (bodyAttr) return bodyAttr.replace(/\/$/, '');
    // 2. variáveis globais conhecidas
    if (window.__WD_BASE_PATH) return String(window.__WD_BASE_PATH).replace(/\/$/, '');
    if (window.__perfilBasePath) return String(window.__perfilBasePath).replace(/\/$/, '');
    // 3. heurística: se pathname começa com /gestor
    if (location.pathname.startsWith('/gestor')) return '/gestor';
    return '';
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="abrirPopupEndereco"]');
    if (!btn) return;

    // prioridade: data-target-input -> #endereco_resumo -> #endereco
    let targetId = (btn.dataset.targetInput || btn.dataset.target || '').replace(/^#/, '');
    if (!targetId) {
      if (document.getElementById('endereco_resumo')) targetId = 'endereco_resumo';
      else targetId = 'endereco';
    }

    const campo = document.getElementById(targetId) || document.querySelector(`[name="${targetId}"]`);
    const valor = campo?.value || '';

    const base = getBasePath();
    const origin = window.location.origin || '';
    const buildUrl = (prefix) => {
      const p = (prefix||'').replace(/\/$/,'');
      const path = `${p}/endereco?field=${encodeURIComponent(targetId)}&endereco=${encodeURIComponent(valor)}`.replace(/\/+/g,'/');
      // Evita duplicar origin se já for absoluta
      if (/^https?:\/\//i.test(path)) return path;
      return origin + (path.startsWith('/') ? path : '/' + path);
    };

    let url = buildUrl(base);
    // Se base vazio, continua /endereco; se base definido mas rota não existir, tentaremos fallback mais tarde.

    // centraliza a janela
    const w = 860, h = 600;
    const left = Math.max(0, (window.screen.width  - w) / 2);
    const top  = Math.max(0, (window.screen.height - h) / 2);

    // Abrir primeiro (melhor UX); se falhar de conteúdo, usuário verá erro, mas tentamos ping assíncrono pra possível fallback.
    const popup = window.open(
      url,
      'popupEndereco',
      `toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=${w},height=${h},left=${left},top=${top}`
    );

    // Fallback: se basePath não vazio e diferente de '', verificar rapidamente se retornou 404 via fetch HEAD.
    if (base) {
      fetch(url, { method: 'GET', headers: { 'X-Ping-Only': '1' }, cache: 'no-store' })
        .then(r => {
          if (!r.ok && [404,401,403].includes(r.status)) {
            const fallbackUrl = buildUrl('');
            console.warn('[endereco-popup] Rota com basePath não disponível (', r.status, ') usando fallback', { original: url, fallback: fallbackUrl });
            if (!popup || popup.closed) {
              window.open(fallbackUrl, 'popupEndereco');
            } else {
              try { popup.location.replace(fallbackUrl); } catch(_) {}
            }
          }
        })
        .catch(() => {/* silêncio: não atrapalhar UX */});
    }
  });
})();