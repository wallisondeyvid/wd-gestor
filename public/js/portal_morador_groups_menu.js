(function () {
  'use strict';

  const LS_PREFIX = 'wdg_msg_selectedMailboxId::';

  function getBasePath() {
    const bp = String(document.body?.dataset?.basePath || '').trim();
    return bp || '/portal-morador';
  }

  function getStoredMailboxId(basePath) {
    try {
      const key = LS_PREFIX + String(basePath || '').trim();
      const v = String(window.localStorage?.getItem(key) || '').trim();
      return v;
    } catch {
      return '';
    }
  }

  function setStoredMailboxId(basePath, mailboxId) {
    try {
      const key = LS_PREFIX + String(basePath || '').trim();
      const v = String(mailboxId || '').trim();
      if (!v) return;
      window.localStorage?.setItem(key, v);
    } catch {
      /* noop */
    }
  }

  function getCurrentMailboxId(basePath) {
    const select = document.querySelector('#msgMailboxSelect');
    const fromSelect = String(select?.value || '').trim();
    if (fromSelect) {
      setStoredMailboxId(basePath, fromSelect);
      return fromSelect;
    }

    const stored = getStoredMailboxId(basePath);
    if (stored) return stored;

    return 'pessoal';
  }

  async function fetchGroups(basePath, mailboxId) {
    const bp = String(basePath || '').trim();
    const mb = String(mailboxId || 'pessoal').trim() || 'pessoal';

    const url = `${bp}/api/msg/groups?mailboxId=${encodeURIComponent(mb)}`;
    const resp = await fetch(url, { credentials: 'same-origin' });

    const json = await resp.json().catch(() => null);
    if (!resp.ok || !Array.isArray(json)) return [];

    return json
      .map(g => ({
        id: String(g?.id || '').trim(),
        name: String(g?.name || g?.nome || '').trim(),
        membersCount: Array.isArray(g?.members) ? g.members.filter(Boolean).length : 0
      }))
      .filter(g => g.id && g.name);
  }

  function dedupeAndSort(groups) {
    const byId = new Map();
    for (const g of Array.isArray(groups) ? groups : []) {
      if (!g?.id || !g?.name) continue;
      if (!byId.has(g.id)) byId.set(g.id, g);
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  function renderGroupsMenu(groups, basePath, mailboxId) {
    const container = document.querySelector('.pm-nav-sub-details--grupos .pm-nav-sub[aria-label="Grupos"]');
    if (!container) return;

    // Remove itens dinâmicos anteriores
    container.querySelectorAll('[data-pm-group-item="1"]').forEach(el => {
      try { el.remove(); } catch { /* noop */ }
    });

    const editLink = container.querySelector('a[href*="/mensagens/grupos"]');

    const list = dedupeAndSort(groups);
    for (const g of list) {
      const a = document.createElement('a');
      a.className = 'pm-nav-sub-item';
      a.setAttribute('data-pm-group-item', '1');
      a.href = `${String(basePath || '').trim()}/mensagens/nova?mailboxId=${encodeURIComponent(String(mailboxId || 'pessoal'))}&groupId=${encodeURIComponent(g.id)}`;

      const img = document.createElement('img');
      img.className = 'pm-nav-ico';
      img.src = `${String(basePath || '').trim()}/images/grupo.png`;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');

      a.appendChild(img);

      const label = document.createTextNode(`${g.name}${(g.membersCount > 0) ? ` (${g.membersCount})` : ''}`);
      a.appendChild(label);

      if (editLink && editLink.parentNode === container) {
        container.insertBefore(a, editLink);
      } else {
        container.appendChild(a);
      }
    }
  }

  async function refresh() {
    const basePath = getBasePath();
    const mailboxId = getCurrentMailboxId(basePath);

    const groups = await fetchGroups(basePath, mailboxId).catch(() => []);
    renderGroupsMenu(groups, basePath, mailboxId);
  }

  function bind() {
    const select = document.querySelector('#msgMailboxSelect');
    if (select && !select.__pmGroupsBound) {
      select.__pmGroupsBound = true;
      select.addEventListener('change', () => void refresh());
    }
  }

  function start() {
    bind();
    void refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
