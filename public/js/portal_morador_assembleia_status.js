(function () {
  const body = document.body;
  const basePath = String(body?.getAttribute('data-base-path') || '/portal-morador').replace(/\/$/, '') || '/portal-morador';
  const assembleiaId = String(body?.getAttribute('data-assembleia-id') || '').trim();

  const stateEl = document.querySelector('[data-asm-state]');
  const itemEl = document.querySelector('[data-asm-item]');
  const votingEl = document.querySelector('[data-asm-voting]');
  const presenceEl = document.querySelector('[data-asm-presence]');
  const updatedEl = document.querySelector('[data-asm-updated]');
  const msgEl = document.querySelector('[data-asm-msg]');

  const setMsg = (msg) => {
    if (!msgEl) return;
    const text = String(msg || '').trim();
    msgEl.textContent = text;
    msgEl.hidden = !text;
  };

  const fetchJson = async (path) => {
    const resp = await fetch(basePath + path, {
      headers: { 'Content-Type': 'application/json' }
    });
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    if (!resp.ok) throw new Error(String(data?.error || data?.message || `HTTP ${resp.status}`));
    return data;
  };

  const render = (payload) => {
    const data = payload?.data || {};
    const item = data?.currentAgendaItem || null;
    const voting = data?.voting || {};
    const presence = data?.presence || null;

    if (stateEl) stateEl.textContent = String(data?.status || data?.assemblyState || '—');
    if (itemEl) itemEl.textContent = item ? `#${Number(item?.idx || 0) + 1} ${String(item?.descricao || '').trim() || String(item?.tipo || '').trim()}` : 'Sem item ativo';
    if (votingEl) votingEl.textContent = voting?.isOpen ? `Aberta${voting?.tipo ? ` (${String(voting.tipo)})` : ''}` : 'Fechada';

    if (presenceEl) {
      if (!presence) presenceEl.textContent = 'Sem registro';
      else {
        const st = String(presence?.status || '').trim().toUpperCase();
        if (st === 'CONFIRMED') presenceEl.textContent = 'Confirmada';
        else if (st === 'PENDING_MODERATOR') presenceEl.textContent = 'Pendente do moderador';
        else if (st === 'PENDING_PARTICIPANT') presenceEl.textContent = 'Pendente da sua confirmação';
        else presenceEl.textContent = st || '—';
      }
    }

    if (updatedEl) updatedEl.textContent = `Atualizado: ${new Date().toLocaleTimeString('pt-BR')}`;
  };

  let timer = null;
  const poll = async () => {
    if (!assembleiaId) {
      setMsg('Assembleia inválida.');
      return;
    }
    try {
      const json = await fetchJson(`/api/assembleias/${encodeURIComponent(assembleiaId)}/status`);
      setMsg('');
      render(json);
    } catch (e) {
      setMsg(e?.message || 'Falha ao carregar status da assembleia.');
    } finally {
      timer = window.setTimeout(poll, 4000);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      return;
    }
    if (!timer) poll();
  });

  poll();
})();
