(function () {
  const body = document.body;
  const basePath = String(body?.getAttribute('data-base-path') || '/portal-morador').replace(/\/$/, '') || '/portal-morador';
  const assembleiaId = String(body?.getAttribute('data-assembleia-id') || '').trim();

  const el = (sel) => document.querySelector(sel);
  const titleEl = el('[data-asm-title]');
  const statusEl = el('[data-pres-status]');
  const msgEl = el('[data-pres-msg]');
  const confirmBtn = el('[data-pres-confirm]');
  let pollTimer = null;

  const setMsg = (text, { show = true } = {}) => {
    if (!msgEl) return;
    msgEl.textContent = String(text || '');
    msgEl.hidden = !show || !String(text || '').trim();
  };

  const fmtDataHora = (a) => {
    try {
      const d = a?.data ? new Date(a.data) : null;
      const hora = String(a?.horaUnica || a?.hora1 || '').trim();
      if (!d || Number.isNaN(d.getTime())) return '—';
      const dataStr = d.toLocaleDateString('pt-BR');
      return hora ? `${dataStr} ${hora}` : dataStr;
    } catch {
      return '—';
    }
  };

  const labelPresenca = (p) => {
    const s = String(p?.status || '').trim().toUpperCase();
    if (!p) return 'Nenhuma presença registrada ainda.';
    if (s === 'CONFIRMED' || s === 'CONFIRMADO') return 'Confirmada';
    if (s === 'PENDING_PARTICIPANT') return 'Pendente da sua confirmação';
    if (s === 'PENDING_MODERATOR') return 'Aguardando confirmação do moderador';
    if (s === 'REJECTED' || s === 'CANCELED') return 'Não confirmada';
    return s ? s : '—';
  };

  const redirectToStatus = () => {
    window.location.href = `${basePath}/assembleias/${encodeURIComponent(assembleiaId)}/status`;
  };

  const stopPolling = () => {
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const startPollingUntilConfirmed = () => {
    stopPolling();
    const tick = async () => {
      try {
        const pres = await fetchJson(`/api/assembleias/${encodeURIComponent(assembleiaId)}/presenca`);
        const p = pres?.data || null;
        const s = String(p?.status || '').trim().toUpperCase();
        if (statusEl) statusEl.textContent = labelPresenca(p);
        if (s === 'CONFIRMED' || s === 'CONFIRMADO') {
          redirectToStatus();
          return;
        }
      } catch {
        /* noop */
      }
      pollTimer = window.setTimeout(tick, 4000);
    };
    tick();
  };

  const fetchJson = async (path, opts) => {
    const resp = await fetch(basePath + path, {
      headers: { 'Content-Type': 'application/json' },
      ...(opts || {})
    });
    let data;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    if (!resp.ok) {
      const errMsg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${resp.status}`;
      const err = new Error(errMsg);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  };

  const load = async () => {
    if (!assembleiaId) {
      if (titleEl) titleEl.textContent = 'Assembleia inválida.';
      if (statusEl) statusEl.textContent = '—';
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }

    setMsg('');
    if (titleEl) titleEl.textContent = 'Carregando…';
    if (statusEl) statusEl.textContent = 'Carregando…';

    const asm = await fetchJson(`/api/assembleias/${encodeURIComponent(assembleiaId)}`);
    const a = asm?.data || null;
    if (titleEl) {
      const titulo = String(a?.titulo || 'Assembleia').trim();
      const numero = String(a?.numero || '').trim();
      const dh = fmtDataHora(a);
      titleEl.textContent = `${(numero ? `#${numero} ` : '')}${titulo} • ${dh}`;
    }

    const pres = await fetchJson(`/api/assembleias/${encodeURIComponent(assembleiaId)}/presenca`);
    const p = pres?.data || null;
    if (statusEl) statusEl.textContent = labelPresenca(p);

    const st = String(p?.status || '').trim().toUpperCase();
    const confirmed = st === 'CONFIRMED' || st === 'CONFIRMADO';
    if (confirmBtn) confirmBtn.disabled = confirmed;

    if (confirmed) {
      redirectToStatus();
      return;
    }
    if (st === 'PENDING_MODERATOR') {
      setMsg('Aguardando confirmação do moderador.', { show: true });
      startPollingUntilConfirmed();
    } else {
      stopPolling();
    }
  };

  const confirmPresence = async () => {
    if (!assembleiaId) return;
    try {
      setMsg('');
      if (confirmBtn) confirmBtn.disabled = true;
      const current = await fetchJson(`/api/assembleias/${encodeURIComponent(assembleiaId)}/presenca`);
      const curStatus = String(current?.data?.status || '').trim().toUpperCase();
      const endpoint = (curStatus === 'PENDING_PARTICIPANT')
        ? '/presenca/confirmar'
        : '/presenca/solicitar';

      const result = await fetchJson(`/api/assembleias/${encodeURIComponent(assembleiaId)}${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      const nextStatus = String(result?.data?.presence?.status || '').trim().toUpperCase();
      if (nextStatus === 'CONFIRMED') {
        redirectToStatus();
        return;
      }
      if (nextStatus === 'PENDING_MODERATOR') {
        setMsg('Aguardando confirmação do moderador.', { show: true });
        startPollingUntilConfirmed();
      } else {
        setMsg('Presença registrada.', { show: true });
      }
      await load();
    } catch (e) {
      if (statusEl) statusEl.textContent = '—';
      if (confirmBtn) confirmBtn.disabled = false;
      setMsg(e?.message || 'Falha ao confirmar presença.', { show: true });
    }
  };

  if (confirmBtn) {
    confirmBtn.addEventListener('click', confirmPresence);
  }

  load().catch((e) => {
    if (titleEl) titleEl.textContent = 'Falha ao carregar.';
    if (statusEl) statusEl.textContent = '—';
    setMsg(e?.message || 'Falha ao carregar dados.', { show: true });
  });
})();
