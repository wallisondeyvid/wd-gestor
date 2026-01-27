(function(){
  function qs(id){ return document.getElementById(id); }
  function getBasePath(){
    try{
      const bp = (document.body && document.body.getAttribute('data-base-path')) || '';
      const v = String(bp || '').trim();
      return v ? v : '/condominios';
    }catch{ return '/condominios'; }
  }

  const modalEl = qs('wdgVisitaInfoModal');
  if(!modalEl) return;

  const titleEl = qs('wdgVisitaInfoTitle');
  const subtitleEl = qs('wdgVisitaInfoSubtitle');
  const kpiWrap = qs('wdgVisitaInfoKpi');
  const windowEl = qs('wdgVisitaInfoWindow');

  const nomeEl = qs('wdgVisitaInfoNome');
  const finalidadeEl = qs('wdgVisitaInfoFinalidade');
  const habEl = qs('wdgVisitaInfoHabitacao');
  const moradorEl = qs('wdgVisitaInfoMorador');
  const periodoEl = qs('wdgVisitaInfoPeriodo');
  const criadoEl = qs('wdgVisitaInfoCriadoEm');

  const rgEl = qs('wdgVisitaInfoRg');
  const cpfEl = qs('wdgVisitaInfoCpf');
  const telEl = qs('wdgVisitaInfoTel');

  const obsWrap = qs('wdgVisitaInfoObsWrap');
  const obsEl = qs('wdgVisitaInfoObs');

  const veicWrap = qs('wdgVisitaInfoVeiculoWrap');
  const veicTipo = qs('wdgVisitaInfoVeicTipo');
  const veicPlaca = qs('wdgVisitaInfoVeicPlaca');
  const veicMarca = qs('wdgVisitaInfoVeicMarca');
  const veicModelo = qs('wdgVisitaInfoVeicModelo');
  const veicCor = qs('wdgVisitaInfoVeicCor');
  const veicAno = qs('wdgVisitaInfoVeicAno');

  const btnChegada = qs('wdgVisitaInfoComunicarChegadaBtn');

  const commsListEl = qs('wdgVisitaInfoCommsList');
  const commsEmptyEl = qs('wdgVisitaInfoCommsEmpty');

  const autorizarModalEl = qs('wdgVisitaAutorizarManualModal');
  const autorizarTitleEl = qs('wdgVisitaAutorizarManualTitle');
  const autorizarSubtitleEl = qs('wdgVisitaAutorizarManualSubtitle');
  const autorizarWhenWrapEl = qs('wdgVisitaAutorizarManualWhenWrap');
  const autorizarWhenLabelEl = qs('wdgVisitaAutorizarManualWhenLabel');
  const autorizarWhenEl = qs('wdgVisitaAutorizarManualWhen');
  const autorizarJustWrapEl = qs('wdgVisitaAutorizarManualJustWrap');
  const autorizarJustEl = qs('wdgVisitaAutorizarManualJustificativa');
  const autorizarConfirmBtn = qs('wdgVisitaAutorizarManualConfirmBtn');

  const bsAutorizar = (autorizarModalEl && window.bootstrap && window.bootstrap.Modal)
    ? window.bootstrap.Modal.getOrCreateInstance(autorizarModalEl)
    : null;

  const detalhesModalEl = qs('wdgVisitaCommsDetalhesModal');
  const detalhesTitleEl = qs('wdgVisitaCommsDetalhesTitle');
  const detalhesSubtitleEl = qs('wdgVisitaCommsDetalhesSubtitle');
  const detalhesBadgeEl = qs('wdgVisitaCommsDetalhesBadge');
  const detalhesNomeEl = qs('wdgVisitaCommsDetalhesNome');
  const detalhesDocsEl = qs('wdgVisitaCommsDetalhesDocs');
  const detalhesVeicWrap = qs('wdgVisitaCommsDetalhesVeiculoWrap');
  const detalhesVeicTipo = qs('wdgVisitaCommsDetalhesVeicTipo');
  const detalhesVeicPlaca = qs('wdgVisitaCommsDetalhesVeicPlaca');
  const detalhesVeicMarca = qs('wdgVisitaCommsDetalhesVeicMarca');
  const detalhesVeicModelo = qs('wdgVisitaCommsDetalhesVeicModelo');
  const detalhesVeicCor = qs('wdgVisitaCommsDetalhesVeicCor');
  const detalhesVeicAno = qs('wdgVisitaCommsDetalhesVeicAno');
  const detalhesRegsEl = qs('wdgVisitaCommsDetalhesRegistros');
  const detalhesRegsEmptyEl = qs('wdgVisitaCommsDetalhesRegistrosEmpty');

  const bsDetalhes = (detalhesModalEl && window.bootstrap && window.bootstrap.Modal)
    ? window.bootstrap.Modal.getOrCreateInstance(detalhesModalEl)
    : null;

  let pendingVisitorKey = '';
  let pendingVisitorLabel = '';
  let pendingAction = ''; // 'autorizar' | 'saida'

  const bsModal = window.bootstrap && window.bootstrap.Modal
    ? window.bootstrap.Modal.getOrCreateInstance(modalEl)
    : null;

  function setText(el, value, fallback){
    if(!el) return;
    const v = String(value || '').trim();
    el.textContent = v || (fallback || '');
  }

  function fmtDateTimeBr(d){
    if(!d || !Number.isFinite(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  function toDatetimeLocalValue(d){
    if(!d || !Number.isFinite(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function parseDatetimeLocalValue(v){
    const s = String(v || '').trim();
    if(!s) return null;
    const d = new Date(s);
    if(!Number.isFinite(d.getTime())) return null;
    return d;
  }

  function isSameLocalDay(a, b){
    if(!a || !b) return false;
    const da = new Date(a);
    const db = new Date(b);
    if(!Number.isFinite(da.getTime()) || !Number.isFinite(db.getTime())) return false;
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }

  function escapeHtml(s){
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function showToast(msg, type){
    try{
      const text = String(msg || '').trim();
      if(!text) return;
      let c = document.getElementById('wdgVisitaInfoToastContainer');
      if(!c){
        c = document.createElement('div');
        c.id = 'wdgVisitaInfoToastContainer';
        c.style.position = 'fixed';
        c.style.top = '1rem';
        c.style.right = '1rem';
        c.style.zIndex = '1060';
        document.body.appendChild(c);
      }
      const el = document.createElement('div');
      el.className = 'toast align-items-center text-bg-' + (type || 'secondary') + ' border-0 show';
      el.innerHTML = '<div class="d-flex"><div class="toast-body">' + escapeHtml(text) + '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>';
      c.appendChild(el);
      const btn = el.querySelector('.btn-close');
      if(btn) btn.addEventListener('click', function(){ try{ el.remove(); }catch(_){} });
      setTimeout(function(){ try{ el.remove(); }catch(_){} }, 4500);
    }catch{ /* noop */ }
  }

  function toastSuccess(msg){ showToast(msg, 'success'); }
  function toastDanger(msg){ showToast(msg, 'danger'); }

  function buildVisitorKey(nome, rg, cpf){
    return `${String(nome||'').trim().toLowerCase()}|${String(rg||'').trim()}|${String(cpf||'').trim()}`;
  }

  function normalizeCommsForDay(visita){
    const dayStart = resolveLocalDayStart(visita?.chegadaEm);
    const dayEnd = resolveLocalDayEnd(visita?.chegadaEm);
    if(!dayStart || !dayEnd || !Number.isFinite(dayStart.getTime()) || !Number.isFinite(dayEnd.getTime())){
      return { dayStart: null, dayEnd: null, items: [] };
    }
    const list = Array.isArray(visita?.comunicacoesAcesso) ? visita.comunicacoesAcesso : [];
    const items = list
      .filter(ev => {
        if(!ev || !ev.em) return false;
        const d = new Date(ev.em);
        if(!Number.isFinite(d.getTime())) return false;
        return d.getTime() >= dayStart.getTime() && d.getTime() <= dayEnd.getTime();
      })
      .map(ev => ({
        tipo: String(ev.tipo || '').trim(),
        status: String(ev.status || '').trim(),
        em: ev.em ? new Date(ev.em) : null,
        ocorridoEm: (ev.ocorridoEm || ev.ocorrido_em) ? new Date(ev.ocorridoEm || ev.ocorrido_em) : null,
        registradoEm: (ev.registradoEm || ev.registrado_em) ? new Date(ev.registradoEm || ev.registrado_em) : null,
        visitanteKey: String(ev.visitanteKey || '').trim(),
        visitante: ev.visitante && typeof ev.visitante === 'object' ? ev.visitante : null,
        por: ev.por && typeof ev.por === 'object' ? ev.por : null,
        justificativa: String(ev.justificativa || '').trim()
      }))
      .filter(ev => ev.tipo && ev.em && Number.isFinite(ev.em.getTime()))
      .map(ev => {
        const reg = ev.registradoEm && Number.isFinite(ev.registradoEm.getTime()) ? ev.registradoEm : null;
        const occ = ev.ocorridoEm && Number.isFinite(ev.ocorridoEm.getTime()) ? ev.ocorridoEm : null;
        return {
          ...ev,
          ocorridoEm: occ,
          registradoEm: reg,
          _sortKey: (reg || ev.em)
        };
      })
      .sort((a,b) => b._sortKey.getTime() - a._sortKey.getTime());
    return { dayStart, dayEnd, items };
  }

  function groupByVisitor(visita, items, dayStart, dayEnd){
    const map = new Map();
    const add = (key, base) => {
      const k = String(key || '').trim();
      if(!k) return;
      if(!map.has(k)) map.set(k, { key: k, visitante: base || null, events: [] });
    };

    // Primeiro, garante visitantes do dia (para aparecerem mesmo se não houver eventos completos)
    try{
      const vv = Array.isArray(visita?.chegadaVisitantes) ? visita.chegadaVisitantes : [];
      if(dayStart && dayEnd && Number.isFinite(dayStart.getTime()) && Number.isFinite(dayEnd.getTime())){
        vv.forEach(v => {
          if(!v) return;
          if(v.principal !== true){
            if(!v.criadoEm) return;
            const created = new Date(v.criadoEm);
            if(!Number.isFinite(created.getTime())) return;
            if(created.getTime() < dayStart.getTime() || created.getTime() > dayEnd.getTime()) return;
          }
          const k = buildVisitorKey(v.nome, v.rg, v.cpf);
          add(k, {
            nome: String(v?.nome || '').trim(),
            rg: String(v?.rg || '').trim(),
            cpf: String(v?.cpf || '').trim(),
            tel: String(v?.tel || '').trim(),
            principal: v?.principal === true
          });
        });
      }
    }catch{ /* noop */ }

    // Depois, adiciona eventos
    items.forEach(ev => {
      const k = String(ev.visitanteKey || '').trim();
      if(!k) return;
      add(k, ev.visitante);
      const entry = map.get(k);
      if(ev.visitante && !entry.visitante) entry.visitante = ev.visitante;
      entry.events.push(ev);
    });

    const arr = Array.from(map.values());
    // Ordena: principal primeiro; depois por nome
    arr.sort((a,b) => {
      const ap = a.visitante && a.visitante.principal ? 1 : 0;
      const bp = b.visitante && b.visitante.principal ? 1 : 0;
      if(ap !== bp) return bp - ap;
      const an = String(a.visitante?.nome || '').toLowerCase();
      const bn = String(b.visitante?.nome || '').toLowerCase();
      return an.localeCompare(bn);
    });
    return arr;
  }

  function computeVisitorState(events){
    const hasChegada = events.some(i => i.tipo === 'CHEGADA_COMUNICADA');
    const hasEntrada = events.some(i => i.tipo === 'ENTRADA_AUTORIZADA');
    const hasSaida = events.some(i => i.tipo === 'SAIDA_COMUNICADA');
    return { hasChegada, hasEntrada, hasSaida };
  }

  function eventVisual(ev){
    const tipo = String(ev?.tipo || '').trim();
    if(tipo === 'CHEGADA_COMUNICADA') return { icon: 'bi bi-bell', tone: 'text-primary' };
    if(tipo === 'ENTRADA_AUTORIZADA') return { icon: 'bi bi-check-circle', tone: 'text-success' };
    if(tipo === 'SAIDA_COMUNICADA') return { icon: 'bi bi-box-arrow-right', tone: 'text-danger' };
    return { icon: 'bi bi-dot', tone: 'text-muted' };
  }

  function renderEventDetailsItem(ev){
    const vis = eventVisual(ev);
    let title = '';
    let sub = '';
    if(ev.tipo === 'CHEGADA_COMUNICADA'){
      title = 'Chegada comunicada';
      sub = ev.status === 'AGUARDANDO_CONFIRMACAO' ? 'Aguardando confirmação do morador' : (ev.status || '');
    } else if(ev.tipo === 'ENTRADA_AUTORIZADA'){
      title = 'Entrada autorizada';
      sub = ev.status || '';
    } else if(ev.tipo === 'SAIDA_COMUNICADA'){
      title = 'Saída comunicada';
      sub = ev.status || '';
    } else {
      title = ev.tipo;
      sub = ev.status || '';
    }

    const actorTipo = String(ev?.por?.tipo || '').trim();
    const actorNome = String(ev?.por?.nome || ev?.por?.email || '').trim();
    const actorLine = actorNome ? `${escapeHtml(actorNome)}${actorTipo ? ` (${escapeHtml(actorTipo)})` : ''}` : '';

    const occ = ev.ocorridoEm ? fmtDateTimeBr(ev.ocorridoEm) : '';
    const reg = (ev.registradoEm || ev.em) ? fmtDateTimeBr(ev.registradoEm || ev.em) : '';
    const when = reg || occ;

    const metaParts = [];
    if(ev.tipo === 'SAIDA_COMUNICADA'){
      if(occ) metaParts.push(`<div class="small text-muted">Saída: <span class="text-body">${escapeHtml(occ)}</span></div>`);
      if(reg) metaParts.push(`<div class="small text-muted">Registrado: <span class="text-body">${escapeHtml(reg)}</span></div>`);
    } else {
      if(reg) metaParts.push(`<div class="small text-muted">Registrado: <span class="text-body">${escapeHtml(reg)}</span></div>`);
    }
    if(ev.justificativa){
      metaParts.push(`<div class="small text-muted">Justificativa: <span class="text-body">${escapeHtml(ev.justificativa)}</span></div>`);
    }

    return (
      `<div class="list-group-item">`
      + `  <div class="d-flex align-items-start justify-content-between gap-3">`
      + `    <div class="d-flex align-items-start gap-2">`
      + `      <i class="${escapeHtml(vis.icon)} ${escapeHtml(vis.tone)}" aria-hidden="true"></i>`
      + `      <div>`
      + `        <div class="${escapeHtml(vis.tone)}">${escapeHtml(title)}${sub ? `: <span class="text-muted">${escapeHtml(sub)}</span>` : ''}</div>`
      + `        ${metaParts.join('')}`
      + `      </div>`
      + `    </div>`
      + `    <div class="text-end">`
      + `      ${when ? `<div class="small text-muted">${escapeHtml(when)}</div>` : ''}`
      + `      ${actorLine ? `<div class="small text-muted">${actorLine}</div>` : ''}`
      + `    </div>`
      + `  </div>`
      + `</div>`
    );
  }

  function renderEventCompact(ev){
    const vis = eventVisual(ev);

    let title = '';
    let sub = '';
    if(ev.tipo === 'CHEGADA_COMUNICADA'){
      title = 'Chegada comunicada';
      sub = ev.status === 'AGUARDANDO_CONFIRMACAO' ? 'Aguardando confirmação do morador' : (ev.status || '');
    } else if(ev.tipo === 'ENTRADA_AUTORIZADA'){
      title = 'Entrada autorizada';
      sub = ev.status || '';
    } else if(ev.tipo === 'SAIDA_COMUNICADA'){
      title = 'Saída comunicada';
      sub = ev.status || '';
    } else {
      title = ev.tipo;
      sub = ev.status || '';
    }

    const actorTipo = String(ev?.por?.tipo || '').trim();
    const actorNome = String(ev?.por?.nome || ev?.por?.email || '').trim();
    const actorLine = actorNome ? `${escapeHtml(actorNome)}${actorTipo ? ` (${escapeHtml(actorTipo)})` : ''}` : '';

    const occ = ev.ocorridoEm ? fmtDateTimeBr(ev.ocorridoEm) : '';
    const reg = (ev.registradoEm || ev.em) ? fmtDateTimeBr(ev.registradoEm || ev.em) : '';

    const metaParts = [];
    if(ev.tipo === 'SAIDA_COMUNICADA'){
      if(occ) metaParts.push(`<div class="small text-muted">Saída: <span class="text-body">${escapeHtml(occ)}</span></div>`);
      if(reg) metaParts.push(`<div class="small text-muted">Registrado: <span class="text-body">${escapeHtml(reg)}</span></div>`);
    }
    if(ev.justificativa){
      metaParts.push(`<div class="small text-muted">Justificativa: <span class="text-body">${escapeHtml(ev.justificativa)}</span></div>`);
    }

    return (
      `<div class="py-2">`
      + `  <div class="d-flex align-items-start justify-content-between gap-3">`
      + `    <div class="d-flex align-items-start gap-2">`
      + `      <i class="${escapeHtml(vis.icon)} ${escapeHtml(vis.tone)}" aria-hidden="true"></i>`
      + `      <div>`
      + `        <div>${escapeHtml(title)}${sub ? `: <span class=\"text-muted\">${escapeHtml(sub)}</span>` : ''}</div>`
      + `        ${metaParts.join('')}`
      + `      </div>`
      + `    </div>`
      + `    ${actorLine ? `<div class=\"small text-muted text-end\">${actorLine}</div>` : ''}`
      + `  </div>`
      + `</div>`
    );
  }

  function openDetalhesModal(visitanteKey){
    if(!bsDetalhes || !detalhesRegsEl) return;
    const snap = window.__wdgLastVisitaInfo || {};
    const visita = snap.visita || null;
    if(!visita) return;

    const info = normalizeCommsForDay(visita);
    const grouped = groupByVisitor(visita, info.items || [], info.dayStart, info.dayEnd);
    const entry = grouped.find(g => String(g?.key || '').trim() === String(visitanteKey || '').trim()) || null;

    const v = entry && entry.visitante ? entry.visitante : null;
    const nome = String(v?.nome || '').trim() || (pendingVisitorLabel || 'Ingressante');
    const rg = String(v?.rg || '').trim();
    const cpf = String(v?.cpf || '').trim();
    const tel = String(v?.tel || '').trim();
    const isPrincipal = v?.principal === true;

    if(detalhesTitleEl) detalhesTitleEl.textContent = 'Detalhes do ingressante';
    if(detalhesSubtitleEl){
      const hab = String(visita?.habitacaoNome || '').trim();
      detalhesSubtitleEl.textContent = hab ? `Habitação: ${hab}` : '';
    }

    if(detalhesBadgeEl){
      detalhesBadgeEl.innerHTML = isPrincipal
        ? '<span class="badge text-bg-primary">Principal</span>'
        : '<span class="badge text-bg-secondary">Acompanhante</span>';
    }
    if(detalhesNomeEl) detalhesNomeEl.innerHTML = `<strong>${escapeHtml(nome)}</strong>`;

    const docParts = [];
    if(rg) docParts.push('RG ' + rg);
    if(cpf) docParts.push('CPF ' + cpf);
    if(tel) docParts.push('Tel ' + tel);
    if(detalhesDocsEl) detalhesDocsEl.textContent = docParts.length ? docParts.join(' · ') : '';

    const veiculo = visita?.veiculo && typeof visita.veiculo === 'object' ? visita.veiculo : null;
    if(veiculo){
      if(detalhesVeicWrap) detalhesVeicWrap.hidden = false;
      setText(detalhesVeicTipo, veiculo?.tipo, '—');
      setText(detalhesVeicPlaca, veiculo?.placa, '—');
      setText(detalhesVeicMarca, veiculo?.marca, '—');
      setText(detalhesVeicModelo, veiculo?.modelo, '—');
      setText(detalhesVeicCor, veiculo?.cor, '—');
      setText(detalhesVeicAno, veiculo?.ano, '—');
    } else {
      if(detalhesVeicWrap) detalhesVeicWrap.hidden = true;
    }

    const evs = entry && Array.isArray(entry.events)
      ? entry.events.slice().sort((a,b) => {
        const ka = (a && a._sortKey && Number.isFinite(a._sortKey.getTime())) ? a._sortKey : (a?.em ? new Date(a.em) : new Date(0));
        const kb = (b && b._sortKey && Number.isFinite(b._sortKey.getTime())) ? b._sortKey : (b?.em ? new Date(b.em) : new Date(0));
        return ka.getTime() - kb.getTime();
      })
      : [];

    if(detalhesRegsEmptyEl) detalhesRegsEmptyEl.hidden = !!evs.length;
    detalhesRegsEl.innerHTML = evs.length ? evs.map(renderEventDetailsItem).join('') : '';
    bsDetalhes.show();
  }

  async function fetchVisitaFull(visitaId){
    const bp = getBasePath();
    const url = `${bp}/api/visitas/${encodeURIComponent(String(visitaId))}?_=${Date.now()}`;
    const resp = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if(!data || !data.visita) throw new Error('Resposta inválida');
    return data.visita;
  }

  function renderComms(visita){
    if(!commsListEl) return;
    const info = normalizeCommsForDay(visita);
    const items = info.items;
    const dayOk = !!(info.dayStart && info.dayEnd && Number.isFinite(info.dayStart.getTime()) && Number.isFinite(info.dayEnd.getTime()));

    const grouped = groupByVisitor(visita, items, info.dayStart, info.dayEnd);

    // Ordena os cards por último evento (mais recente primeiro).
    grouped.sort((a, b) => {
      const aEvents = Array.isArray(a?.events) ? a.events : [];
      const bEvents = Array.isArray(b?.events) ? b.events : [];
      const aLatest = aEvents.reduce((acc, ev) => {
        const k = ev && ev._sortKey && Number.isFinite(ev._sortKey.getTime()) ? ev._sortKey : (ev?.em ? new Date(ev.em) : null);
        const t = k && Number.isFinite(k.getTime()) ? k.getTime() : 0;
        return Math.max(acc, t);
      }, 0);
      const bLatest = bEvents.reduce((acc, ev) => {
        const k = ev && ev._sortKey && Number.isFinite(ev._sortKey.getTime()) ? ev._sortKey : (ev?.em ? new Date(ev.em) : null);
        const t = k && Number.isFinite(k.getTime()) ? k.getTime() : 0;
        return Math.max(acc, t);
      }, 0);
      if(aLatest !== bLatest) return bLatest - aLatest;

      const ap = a?.visitante && a.visitante.principal ? 1 : 0;
      const bp = b?.visitante && b.visitante.principal ? 1 : 0;
      if(ap !== bp) return bp - ap;

      const an = String(a?.visitante?.nome || '').toLowerCase();
      const bn = String(b?.visitante?.nome || '').toLowerCase();
      return an.localeCompare(bn);
    });
    const anyEvents = grouped.some(g => g.events && g.events.length);
    if(commsEmptyEl) commsEmptyEl.hidden = anyEvents;
    commsListEl.innerHTML = '';

    if(!grouped.length){
      return;
    }

    const html = grouped.map(g => {
      const v = g.visitante || {};
      const name = String(v.nome || '').trim() || 'Visitante';
      const rg = String(v.rg || '').trim();
      const cpf = String(v.cpf || '').trim();
      const tel = String(v.tel || '').trim();
      const isPrincipal = v.principal === true;

      // Mantém as atualizações do registro em ordem (de cima para baixo): chegada -> entrada -> saída.
      const evs = Array.isArray(g.events) ? g.events.slice().sort((a,b) => {
        const ka = (a && a._sortKey && Number.isFinite(a._sortKey.getTime())) ? a._sortKey : (a?.em ? new Date(a.em) : new Date(0));
        const kb = (b && b._sortKey && Number.isFinite(b._sortKey.getTime())) ? b._sortKey : (b?.em ? new Date(b.em) : new Date(0));
        return ka.getTime() - kb.getTime();
      }) : [];

      const st = computeVisitorState(evs);
      const lastEv = (evs && evs.length) ? evs[evs.length - 1] : null;
      const when = lastEv && (lastEv.registradoEm || lastEv.em) ? fmtDateTimeBr(lastEv.registradoEm || lastEv.em) : '';

      const badge = isPrincipal
        ? '<span class="wdg-chip wdg-chip--primary" title="Visitante principal">Principal</span>'
        : '<span class="wdg-chip" title="Visitante acompanhante">Acompanhante</span>';

      const docParts = [];
      if(rg) docParts.push('RG ' + rg);
      if(cpf) docParts.push('CPF ' + cpf);
      if(tel) docParts.push('Tel ' + tel);
      const docsLine = docParts.length ? `<div class="wdg-visita-card__sub">${escapeHtml(docParts.join(' · '))}</div>` : '';

      const lines = evs.map(renderEventCompact).join('');

      const btnAuth = (dayOk && !st.hasEntrada && !st.hasSaida)
        ? `<button type="button" class="btn btn-outline-primary btn-sm" data-comms-action="autorizar" data-visitante-key="${escapeHtml(g.key)}">Autorizar manualmente</button>`
        : '';
      const btnSaida = (st.hasEntrada && !st.hasSaida)
        ? `<button type="button" class="btn btn-outline-danger btn-sm" data-comms-action="saida" data-visitante-key="${escapeHtml(g.key)}">Comunicar saída</button>`
        : '';

      const bp = getBasePath();
      const detalheIcon = `${bp}/images/detalhe.png`;
      const btnDetalhes = `<button type="button" class="btn btn-outline-secondary btn-sm" data-comms-action="detalhes" data-visitante-key="${escapeHtml(g.key)}" title="Detalhes" aria-label="Detalhes">` +
        `<img src="${escapeHtml(detalheIcon)}" alt="" style="width:18px;height:18px;vertical-align:-3px" onerror="this.outerHTML='&lt;i class=\"bi bi-info-circle\"&gt;&lt;/i&gt;'">` +
      `</button>`;

      const actions = (btnAuth || btnSaida || btnDetalhes)
        ? `<div class="d-flex align-items-center justify-content-end gap-2 mt-2">${btnDetalhes}${btnAuth}${btnSaida}</div>`
        : '';

      return (
        `<div class="wdg-visita-card" data-visitante-key="${escapeHtml(g.key)}">`
        + `<div class="d-flex align-items-center justify-content-between gap-2">`
        + `  <div class="wdg-visita-card__label">${escapeHtml(when || '')}</div>`
        + `  <div class="d-flex align-items-center gap-2">${badge}</div>`
        + `</div>`
        + `<div class="wdg-visita-card__value"><strong>${escapeHtml(name)}</strong></div>`
        + (docsLine ? `<div class="small text-muted">${escapeHtml(docParts.join(' · '))}</div>` : '')
        + `<div class="mt-2 pt-2 border-top">`
        + (lines || '<div class="text-muted">Sem comunicações registradas para este visitante.</div>')
        + `</div>`
        + actions
        + `</div>`
      );
    }).join('');

    commsListEl.innerHTML = html;
  }

  async function refreshComms(){
    const snap = window.__wdgLastVisitaInfo || {};
    const visita = snap.visita || null;
    if(!visita || !visita._id) return;
    try{
      const full = await fetchVisitaFull(visita._id);
      snap.visita = full;
      window.__wdgLastVisitaInfo = snap;
      renderComms(full);
    } catch(_e){
      // se falhar, tenta renderizar com o que temos
      renderComms(visita);
    }
  }

  // Permite que outros modais/fluxos forcem a atualização da lista.
  window.wdgRefreshVisitaInfoComms = function(){
    return refreshComms();
  };

  function fmtDateBr(d){
    if(!d || !Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { year:'numeric', month:'2-digit', day:'2-digit' });
  }

  function resolveCalendarDayParts(dateLike){
    if(!dateLike) return null;
    if(typeof dateLike === 'string'){
      const s = dateLike.trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(m){
        return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
      }
    }
    const d = new Date(dateLike);
    if(!Number.isFinite(d.getTime())) return null;
    const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
    if(isUtcMidnight){
      return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
    }
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }

  function resolveLocalDayStart(dateLike){
    const parts = resolveCalendarDayParts(dateLike);
    if(!parts) return null;
    return new Date(parts.y, parts.m, parts.d, 0, 0, 0, 0);
  }

  function resolveLocalDayEnd(dateLike){
    const parts = resolveCalendarDayParts(dateLike);
    if(!parts) return null;
    return new Date(parts.y, parts.m, parts.d, 23, 59, 0, 0);
  }

  function sameLocalDay(a, b){
    if(!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function resolveVisitaWindow(visita){
    const created = visita?.createdAt ? new Date(visita.createdAt) : null;
    const startRaw = visita?.periodoInicio || visita?.inicio || null;
    const endRaw = visita?.periodoFim || visita?.fim || null;
    const startDay = resolveLocalDayStart(startRaw);
    const endDay = resolveLocalDayEnd(endRaw);

    let start = startDay;
    if(created && Number.isFinite(created.getTime()) && startDay && sameLocalDay(created, startDay)){
      start = created;
    }
    return {
      start: start && Number.isFinite(start.getTime()) ? start : null,
      end: endDay && Number.isFinite(endDay.getTime()) ? endDay : null,
      created: created && Number.isFinite(created.getTime()) ? created : null
    };
  }

  window.wdgOpenVisitaInfoModal = function(visita, ctx){
    window.__wdgLastVisitaInfo = { visita: visita || null, ctx: ctx || null };
    const hab = ctx && ctx.hab ? ctx.hab : null;

    setText(titleEl, 'Informações da visita');

    const finalidade = String(visita?.finalidadeLabel || visita?.finalidade || '').trim();
    const habitacaoNome = String(visita?.habitacaoNome || hab?.label || hab?.numero || '').trim();
    const moradorNome = String(
      visita?.morador_nome ||
      visita?.moradorNome ||
      visita?.morador_name ||
      visita?.moradorName ||
      visita?.morador?.nome ||
      visita?.morador?.name ||
      hab?.morador_nome ||
      hab?.moradorNome ||
      hab?.morador_name ||
      hab?.moradorName ||
      hab?.morador?.nome ||
      hab?.morador?.name ||
      ''
    ).trim();
    const moradorEmail = String(
      visita?.morador_email ||
      visita?.moradorEmail ||
      visita?.morador?.email ||
      hab?.morador_email ||
      hab?.moradorEmail ||
      hab?.morador?.email ||
      ''
    ).trim();

    const nome = String(visita?.visitanteNome || '').trim();
    setText(nomeEl, nome, '—');
    setText(finalidadeEl, finalidade, '');

    setText(habEl, habitacaoNome, '—');
    setText(moradorEl, (moradorNome || moradorEmail) ? `Morador: ${moradorNome || moradorEmail}` : '', '');

    const win = resolveVisitaWindow(visita);
    const startLabel = win.start ? fmtDateTimeBr(win.start) : '';
    const endLabel = win.end ? `${fmtDateBr(win.end)} 23:59` : '';

    if(startLabel && endLabel){
      setText(periodoEl, `${startLabel} → ${endLabel}`, '—');
      if(kpiWrap) kpiWrap.hidden = false;
      setText(windowEl, `${startLabel} até ${endLabel}`, '');
    } else {
      setText(periodoEl, '—', '—');
      if(kpiWrap) kpiWrap.hidden = true;
    }

    const createdLabel = win.created ? `Criado em ${fmtDateTimeBr(win.created)}` : '';
    setText(criadoEl, createdLabel, '');

    setText(subtitleEl, finalidade ? `Finalidade: ${finalidade}` : (habitacaoNome ? `Habitação: ${habitacaoNome}` : ''));

    setText(rgEl, visita?.visitanteRg, '—');
    setText(cpfEl, visita?.visitanteCpf, '—');
    setText(telEl, visita?.visitanteTel, '—');

    const obs = String(visita?.observacoes || '').trim();
    if(obs){
      if(obsWrap) obsWrap.hidden = false;
      setText(obsEl, obs, '');
    } else {
      if(obsWrap) obsWrap.hidden = true;
      setText(obsEl, '', '');
    }

    const veiculo = visita?.veiculo && typeof visita.veiculo === 'object' ? visita.veiculo : null;
    if(veiculo){
      if(veicWrap) veicWrap.hidden = false;
      setText(veicTipo, veiculo?.tipo, '—');
      setText(veicPlaca, veiculo?.placa, '—');
      setText(veicMarca, veiculo?.marca, '—');
      setText(veicModelo, veiculo?.modelo, '—');
      setText(veicCor, veiculo?.cor, '—');
      setText(veicAno, veiculo?.ano, '—');
    } else {
      if(veicWrap) veicWrap.hidden = true;
      setText(veicTipo, '', '');
      setText(veicPlaca, '', '');
      setText(veicMarca, '', '');
      setText(veicModelo, '', '');
      setText(veicCor, '', '');
      setText(veicAno, '', '');
    }

    if(bsModal){
      bsModal.show();
    } else {
      modalEl.classList.add('show');
      modalEl.style.display = 'block';
      modalEl.removeAttribute('aria-hidden');
    }

    // Atualiza/Renderiza comunicações (buscando versão completa da visita)
    try{
      if(commsEmptyEl) commsEmptyEl.hidden = false;
      if(commsListEl) commsListEl.innerHTML = '';
    }catch{ /* noop */ }
    refreshComms();
  };

  if(btnChegada){
    btnChegada.addEventListener('click', function(){
      const snap = window.__wdgLastVisitaInfo || {};
      const visita = snap.visita || null;
      if(!visita || !visita._id) return;
      if(typeof window.wdgOpenChegadaVisitaModal === 'function'){
        window.wdgOpenChegadaVisitaModal(visita, snap.ctx || {});
      }
    });
  }

  if(commsListEl){
    commsListEl.addEventListener('click', function(e){
      const btn = e.target && e.target.closest ? e.target.closest('button[data-comms-action]') : null;
      if(!btn) return;
      const action = String(btn.getAttribute('data-comms-action') || '').trim();
      const vkey = String(btn.getAttribute('data-visitante-key') || '').trim();
      if(!vkey) return;

      // tenta achar nome do visitante no card
      try{
        const card = btn.closest('[data-visitante-key]');
        const nameEl = card ? card.querySelector('.wdg-visita-card__value') : null;
        pendingVisitorLabel = nameEl ? String(nameEl.textContent || '').trim() : '';
      } catch{ pendingVisitorLabel = ''; }

      if(action === 'detalhes'){
        pendingVisitorKey = vkey;
        pendingAction = 'detalhes';
        openDetalhesModal(vkey);
        return;
      }

      if(action === 'autorizar'){
        pendingVisitorKey = vkey;
        pendingAction = 'autorizar';
        try{
          if(autorizarTitleEl) autorizarTitleEl.textContent = 'Autorizar entrada manualmente';
          if(autorizarSubtitleEl) autorizarSubtitleEl.textContent = 'Informe a justificativa (será registrada no histórico).';
          if(autorizarWhenLabelEl) autorizarWhenLabelEl.textContent = 'Data e hora da entrada';
          if(autorizarWhenWrapEl) autorizarWhenWrapEl.hidden = false;
          if(autorizarJustWrapEl) autorizarJustWrapEl.hidden = false;
          if(autorizarWhenEl) autorizarWhenEl.value = toDatetimeLocalValue(new Date());
        }catch{ /* noop */ }
        if(autorizarJustEl) autorizarJustEl.value = '';
        if(bsAutorizar) bsAutorizar.show();
        else if(autorizarModalEl){
          autorizarModalEl.classList.add('show');
          autorizarModalEl.style.display = 'block';
          autorizarModalEl.removeAttribute('aria-hidden');
        }
        return;
      }

      if(action === 'saida'){
        pendingVisitorKey = vkey;
        pendingAction = 'saida';
        try{
          if(autorizarTitleEl) autorizarTitleEl.textContent = 'Comunicar saída';
          if(autorizarSubtitleEl) autorizarSubtitleEl.textContent = 'Confirme a data e hora da saída.';
          if(autorizarWhenLabelEl) autorizarWhenLabelEl.textContent = 'Data e hora da saída';
          if(autorizarWhenWrapEl) autorizarWhenWrapEl.hidden = false;
          if(autorizarJustWrapEl) autorizarJustWrapEl.hidden = true;
          if(autorizarWhenEl) autorizarWhenEl.value = toDatetimeLocalValue(new Date());
        }catch{ /* noop */ }
        if(autorizarJustEl) autorizarJustEl.value = '';
        if(bsAutorizar) bsAutorizar.show();
        else if(autorizarModalEl){
          autorizarModalEl.classList.add('show');
          autorizarModalEl.style.display = 'block';
          autorizarModalEl.removeAttribute('aria-hidden');
        }
      }
    });
  }

  if(autorizarConfirmBtn){
    autorizarConfirmBtn.addEventListener('click', async function(){
      const snap = window.__wdgLastVisitaInfo || {};
      const visita = snap.visita || null;
      if(!visita || !visita._id) return;
      const action = String(pendingAction || '').trim();
      const justificativa = String(autorizarJustEl ? autorizarJustEl.value : '').trim();
      const vkey = String(pendingVisitorKey || '').trim();
      if(!vkey){
        return;
      }

      const whenLocal = autorizarWhenEl ? String(autorizarWhenEl.value || '').trim() : '';
      const whenDate = parseDatetimeLocalValue(whenLocal);
      if(!whenDate){
        try{ autorizarWhenEl && autorizarWhenEl.focus && autorizarWhenEl.focus(); } catch{ /* noop */ }
        return;
      }

      if(action === 'autorizar'){
        if(!justificativa){
          try{ autorizarJustEl && autorizarJustEl.focus && autorizarJustEl.focus(); } catch{ /* noop */ }
          return;
        }
      }

      const bp = getBasePath();
      try{
        autorizarConfirmBtn.disabled = true;
        const url = (action === 'saida')
          ? `${bp}/api/visitas/${encodeURIComponent(String(visita._id))}/saida`
          : `${bp}/api/visitas/${encodeURIComponent(String(visita._id))}/autorizar-manual`;
        const body = (action === 'saida')
          ? { visitanteKey: vkey, ocorridoEm: whenLocal }
          : { justificativa, visitanteKey: vkey, ocorridoEm: whenLocal };
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(body)
        });
        let payload = null;
        try{ payload = await resp.json(); } catch { payload = null; }
        if(!resp.ok){
          const fallback = (action === 'saida')
            ? `Falha ao comunicar saída (HTTP ${resp.status}).`
            : `Falha ao autorizar entrada (HTTP ${resp.status}).`;
          const msg = (payload && payload.error) ? String(payload.error) : fallback;
          toastDanger(msg);
          try{ await refreshComms(); } catch { /* noop */ }
          return;
        }

        if(payload && payload.visita){
          snap.visita = payload.visita;
          window.__wdgLastVisitaInfo = snap;
          renderComms(payload.visita);
        }
        await refreshComms();
        toastSuccess(action === 'saida' ? 'Saída comunicada.' : 'Entrada autorizada.');
        if(bsAutorizar) bsAutorizar.hide();
      } catch(e){
        toastDanger(e?.message || (String(pendingAction || '') === 'saida' ? 'Falha ao comunicar saída.' : 'Falha ao autorizar entrada.'));
        try{ await refreshComms(); } catch { /* noop */ }
      } finally {
        autorizarConfirmBtn.disabled = false;
      }
    });
  }
})();
