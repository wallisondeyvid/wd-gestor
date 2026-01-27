(function(){
  const basePath = document.body?.dataset?.basePath || '/portal-morador';
  const habIdFromBody = document.body?.dataset?.habId || '';
  const habLabelFromBody = document.body?.dataset?.habLabel || '';

  const listEl = document.getElementById('pmVisitasLista');
  const emptyEl = document.getElementById('pmVisitasEmpty');
  const refreshBtn = document.getElementById('pmVisitaRefresh');

  function escapeHtml(str){
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function toast(msg, variant){
    const box = document.createElement('div');
    box.className = 'pm-toast ' + (variant ? `--${variant}` : '');
    box.textContent = msg;
    document.body.appendChild(box);
    setTimeout(() => {
      box.style.opacity = '0';
      box.style.transform = 'translateY(12px)';
      setTimeout(() => box.remove(), 260);
    }, 4200);
  }

  function safeDate(value){
    if(!value) return null;
    const d = new Date(value);
    if(!Number.isFinite(d.getTime())) return null;
    return d;
  }

  function formatDt(value){
    const d = safeDate(value);
    if(!d) return '—';
    return d.toLocaleString('pt-BR');
  }

  function formatDateOnly(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    // Evita bug de fuso: "YYYY-MM-DD" em JS é interpretado como UTC.
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
      const y = Number(raw.slice(0, 4));
      const m = Number(raw.slice(5, 7));
      const dd = Number(raw.slice(8, 10));
      const local = new Date(y, (m || 1) - 1, dd || 1);
      if(Number.isFinite(local.getTime())) return local.toLocaleDateString('pt-BR');
    }
    const d = safeDate(raw);
    if(!d) return '';
    return d.toLocaleDateString('pt-BR');
  }

  function normalizePlate(value){
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  }

  function formatPlate(value){
    const v = normalizePlate(value);
    if(v.length <= 3) return v;
    return `${v.slice(0,3)}-${v.slice(3)}`;
  }

  function formatVehicle(v){
    if(!v) return '';
    const parts = [
      formatPlate(v.placa),
      v.tipo,
      v.marca,
      v.modelo,
      v.cor,
      v.ano
    ].map((p) => String(p || '').trim()).filter(Boolean);
    return parts.join(' · ');
  }

  function eventVisual(tipo){
    const t = String(tipo || '').trim();
    if(t === 'CHEGADA_COMUNICADA') return { icon: 'bi-door-open', tone: 'info', title: 'Chegada comunicada' };
    if(t === 'ENTRADA_AUTORIZADA') return { icon: 'bi-shield-check', tone: 'success', title: 'Entrada autorizada' };
    if(t === 'SAIDA_COMUNICADA') return { icon: 'bi-door-closed', tone: 'danger', title: 'Saída comunicada' };
    if(t === 'MORADOR_ENTRADA') return { icon: 'bi-box-arrow-in-right', tone: 'success', title: 'Entrada registrada' };
    if(t === 'MORADOR_SAIDA') return { icon: 'bi-box-arrow-right', tone: 'danger', title: 'Saída registrada' };
    return { icon: 'bi-dot', tone: 'muted', title: 'Evento' };
  }

  function labelTipo(tipo){
    const t = String(tipo || '').trim();
    if(t === 'CHEGADA_COMUNICADA') return 'Chegada';
    if(t === 'ENTRADA_AUTORIZADA') return 'Entrada';
    if(t === 'SAIDA_COMUNICADA') return 'Saída';
    if(t === 'MORADOR_ENTRADA') return 'Entrada';
    if(t === 'MORADOR_SAIDA') return 'Saída';
    return t || 'Evento';
  }

  function statusBadge(eventos){
    const list = Array.isArray(eventos) ? eventos : [];
    const hasExit = list.some(e => {
      const t = String(e?.tipo || '').trim();
      return t === 'SAIDA_COMUNICADA' || t === 'MORADOR_SAIDA';
    });
    const hasEntry = list.some(e => {
      const t = String(e?.tipo || '').trim();
      return t === 'ENTRADA_AUTORIZADA' || t === 'MORADOR_ENTRADA';
    });
    const hasArrival = list.some(e => String(e?.tipo || '').trim() === 'CHEGADA_COMUNICADA');
    if(hasExit) return { label: 'Saiu', tone: 'danger', icon: 'bi-box-arrow-right' };
    if(hasEntry) return { label: 'Entrou', tone: 'success', icon: 'bi-box-arrow-in-right' };
    if(hasArrival) return { label: 'Aguardando', tone: 'info', icon: 'bi-hourglass-split' };
    return { label: 'Sem eventos', tone: 'muted', icon: 'bi-dash-circle' };
  }

  function renderEventLine(ev){
    const tipo = String(ev?.tipo || '').trim();
    const vis = eventVisual(tipo);
    const ocorr = ev?.ocorridoEm || ev?.em;
    const reg = ev?.registradoEm || ev?.em;
    const actor = ev?.por && typeof ev.por === 'object' ? ev.por : null;
    const actorLabel = actor ? (String(actor?.nome || actor?.email || '').trim() || '') : '';
    const extra = (tipo === 'SAIDA_COMUNICADA' || tipo === 'MORADOR_SAIDA')
      ? `<div class="pm-access-times"><span><strong>Saída:</strong> ${escapeHtml(formatDt(ocorr))}</span><span><strong>Registrado:</strong> ${escapeHtml(formatDt(reg))}</span></div>`
      : `<div class="pm-access-times"><span><strong>Ocorrido:</strong> ${escapeHtml(formatDt(ocorr))}</span><span><strong>Registrado:</strong> ${escapeHtml(formatDt(reg))}</span></div>`;

    const just = String(ev?.justificativa || '').trim();
    const justificativaHtml = just ? `<div class="pm-access-just">${escapeHtml(just)}</div>` : '';

    return `
      <div class="pm-access-event pm-access-event--${escapeHtml(vis.tone)}">
        <div class="pm-access-ico" aria-hidden="true"><i class="bi ${escapeHtml(vis.icon)}"></i></div>
        <div class="pm-access-body">
          <div class="pm-access-head">
            <div class="pm-access-title">${escapeHtml(labelTipo(tipo))}</div>
            ${actorLabel ? `<div class="pm-access-actor" title="Responsável">${escapeHtml(actorLabel)}</div>` : ''}
          </div>
          ${extra}
          ${justificativaHtml}
        </div>
      </div>
    `;
  }

  function renderCard(item){
    const v = item?.visitante && typeof item.visitante === 'object' ? item.visitante : null;
    const nome = String(v?.nome || '').trim() || 'Visitante';
    const pessoaTipo = String(item?.pessoaTipo || '').trim();
    const isMorador = pessoaTipo === 'MORADOR';
    const rg = String(v?.rg || '').trim() || 'Não informado';
    const cpf = String(v?.cpf || '').trim() || 'Não informado';
    const tel = String(v?.tel || '').trim() || 'Não informado';
    const hab = String(item?.habitacaoNome || habLabelFromBody || '').trim();
    const dia = String(item?.dia || '').trim();
    const veiculoResumo = formatVehicle(item?.veiculo);
    const eventosRaw = Array.isArray(item?.eventos) ? item.eventos : [];
    const tipoOrder = (tipo) => {
      const t = String(tipo || '').trim();
      if(t === 'CHEGADA_COMUNICADA') return 1;
      if(t === 'ENTRADA_AUTORIZADA' || t === 'MORADOR_ENTRADA') return 2;
      if(t === 'SAIDA_COMUNICADA' || t === 'MORADOR_SAIDA') return 3;
      return 99;
    };
    const eventos = eventosRaw.slice().sort((a, b) => {
      const oa = tipoOrder(a?.tipo);
      const ob = tipoOrder(b?.tipo);
      if(oa !== ob) return oa - ob;
      const ta = safeDate(a?.registradoEm || a?.ocorridoEm || a?.em)?.getTime?.() || 0;
      const tb = safeDate(b?.registradoEm || b?.ocorridoEm || b?.em)?.getTime?.() || 0;
      return ta - tb;
    });

    const badge = statusBadge(eventos);
    const lastEv = eventos.length ? eventos[eventos.length - 1] : null;
    const lastTime = lastEv ? (lastEv.registradoEm || lastEv.ocorridoEm || lastEv.em) : null;

    const metaBlocks = [
      { label: 'Data', value: dia ? formatDateOnly(dia) : '' },
      ...(isMorador ? [] : [
        { label: 'RG', value: rg },
        { label: 'CPF', value: cpf },
        { label: 'Telefone', value: tel },
        { label: 'Veículo', value: veiculoResumo || 'Não informado' }
      ])
    ];

    return `
      <article class="pm-access-card" data-visitante-key="${escapeHtml(item?.visitanteKey || '')}" data-dia="${escapeHtml(dia)}">
        <div class="pm-access-card-head">
          <div>
            <div class="pm-access-title-row">
              <strong class="pm-access-name">${escapeHtml(nome)}</strong>
              <span class="pm-access-badge pm-access-badge--${escapeHtml(badge.tone)}" title="Status">
                <i class="bi ${escapeHtml(badge.icon)}" aria-hidden="true"></i>
                ${escapeHtml(badge.label)}
              </span>
            </div>
            ${hab ? `<div class="pm-field-hint">${escapeHtml(hab)}</div>` : ''}
          </div>
          <div class="pm-access-card-right">
            ${lastTime ? `<div class="pm-access-last" title="Última atualização"><i class="bi bi-clock-history"></i>${escapeHtml(formatDt(lastTime))}</div>` : ''}
            ${isMorador ? `<span class="pm-visitante-chip"><i class="bi bi-person-badge"></i>Morador</span>` : (v?.principal ? `<span class="pm-visitante-chip"><i class="bi bi-person-badge"></i>Principal</span>` : '')}
          </div>
        </div>

        <div class="pm-visitante-meta pm-access-meta">
          ${metaBlocks.filter(b => b.value).map((block) => `
            <div class="pm-visitante-meta-block">
              <span class="pm-visitante-meta-label">${escapeHtml(block.label)}:</span>
              <span class="pm-visitante-meta-value">${escapeHtml(block.value)}</span>
            </div>
          `).join('')}
        </div>

        <div class="pm-access-timeline" role="list">
          ${eventos.length ? eventos.map(renderEventLine).join('') : '<div class="text-muted">Sem comunicações registradas.</div>'}
        </div>
      </article>
    `;
  }

  async function fetchHistorico(){
    try {
      const hab = String(habIdFromBody || '').trim();
      const qs = hab ? `?hab=${encodeURIComponent(hab)}` : '';
      const r = await fetch(`${basePath}/api/visitas/historico-acessos${qs}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const j = await r.json().catch(() => null);
      if(!r.ok || !j){
        throw new Error(j?.error || 'Falha ao carregar histórico.');
      }
      return Array.isArray(j?.data) ? j.data : [];
    } catch (err){
      toast(err?.message || 'Falha ao carregar histórico.', 'warning');
      return [];
    }
  }

  function render(items){
    if(!listEl || !emptyEl) return;
    const records = Array.isArray(items) ? items : [];
    if(!records.length){
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    listEl.innerHTML = records.map(renderCard).join('');
  }

  async function refresh(){
    const data = await fetchHistorico();
    render(data);
  }

  refreshBtn?.addEventListener('click', refresh);
  refresh();
})();
