(function () {
  function getBasePath() {
    const raw = document?.body?.dataset?.basePath;
    const v = (typeof raw === 'string' ? raw : '').trim();
    return v || '/portal-morador';
  }

  function normPath(p) {
    const s = String(p || '').trim();
    if (!s) return '/';
    // remove trailing slash (except root)
    if (s.length > 1 && s.endsWith('/')) return s.slice(0, -1);
    return s;
  }

  function safeUrl(href) {
    try {
      return new URL(href, window.location.origin);
    } catch {
      return null;
    }
  }

  function clearActive(navRoot) {
    navRoot.querySelectorAll('.active').forEach((el) => el.classList.remove('active'));
    navRoot.querySelectorAll('[aria-current="page"]').forEach((el) => el.removeAttribute('aria-current'));
  }

  function applyActive(linkEl) {
    if (!linkEl) return;
    linkEl.classList.add('active');
    linkEl.setAttribute('aria-current', 'page');

    // Open ancestor details and mark summaries as active.
    let cur = linkEl;
    while (cur) {
      const det = cur.closest && cur.closest('details');
      if (!det) break;
      det.open = true;
      const sum = det.querySelector(':scope > summary');
      if (sum) sum.classList.add('active');
      cur = det.parentElement;
    }
  }

  function pickBestLink(links, pathname, hash) {
    let best = null;
    let bestScore = -1;

    for (const a of links) {
      const hrefAttr = a.getAttribute('href') || '';
      if (!hrefAttr || hrefAttr.startsWith('javascript:')) continue;

      const u = safeUrl(hrefAttr);
      if (!u) continue;

      const linkPath = normPath(u.pathname);
      const linkHash = String(u.hash || '');

      // Special case: home anchors.
      if (hash && linkHash && linkPath === pathname) {
        if (linkHash === hash) {
          const score = 10000 + linkPath.length + linkHash.length;
          if (score > bestScore) {
            best = a;
            bestScore = score;
          }
          continue;
        }
      }

      // Exact path match is best.
      if (linkPath === pathname) {
        const score = 9000 + linkPath.length;
        if (score > bestScore) {
          best = a;
          bestScore = score;
        }
        continue;
      }

      // Prefix match (useful for sections).
      if (pathname.startsWith(linkPath) && linkPath !== '/' && linkPath.length >= 2) {
        const score = 1000 + linkPath.length;
        if (score > bestScore) {
          best = a;
          bestScore = score;
        }
      }
    }

    return best;
  }

  function syncActiveFor(pathnameOverride, hashOverride) {
    const navRoot = document.querySelector('.pm-sidebar .pm-nav');
    if (!navRoot) return;

    const basePath = normPath(getBasePath());
    const pathname = normPath(pathnameOverride || window.location.pathname);
    const hash = String(hashOverride || window.location.hash || '');

    // Only act inside the portal basePath.
    if (basePath && pathname !== basePath && !pathname.startsWith(basePath + '/')) {
      return;
    }

    const links = Array.from(navRoot.querySelectorAll('a.pm-nav-item, a.pm-nav-sub-item'));

    clearActive(navRoot);

    const best = pickBestLink(links, pathname, hash);
    applyActive(best);
  }

  function viewToPath(view) {
    const v = String(view || '').trim().toLowerCase();
    if (!v) return '';
    const map = {
      nova: '/mensagens/nova',
      entrada: '/mensagens/entrada',
      saida: '/mensagens/saida',
      arquivo: '/mensagens/arquivo',
      lixeira: '/mensagens/lixeira',
      grupos: '/mensagens/grupos',
      cfg_caixas: '/mensagens/caixas'
    };
    return map[v] || '';
  }

  function applyActiveByPathOrView(pathOrView) {
    const navRoot = document.querySelector('.pm-sidebar .pm-nav');
    if (!navRoot) return;
    const basePath = normPath(getBasePath());
    let path = String(pathOrView || '').trim();
    if (!path) return;
    if (!path.startsWith('/')) {
      path = viewToPath(path);
      if (!path) return;
    }
    const fullPath = basePath && !path.startsWith(basePath) ? normPath(basePath + path) : normPath(path);
    clearActive(navRoot);
    const links = Array.from(navRoot.querySelectorAll('a.pm-nav-item, a.pm-nav-sub-item'));
    const best = pickBestLink(links, fullPath, '');
    applyActive(best);
  }

  function syncActive() {
    syncActiveFor();
  }

  window.__wdgPortalNavSetActive = applyActiveByPathOrView;
  window.__wdgPortalNavSync = syncActive;

  document.addEventListener('DOMContentLoaded', syncActive);
  window.addEventListener('hashchange', syncActive);
  window.addEventListener('popstate', syncActive);
})();
