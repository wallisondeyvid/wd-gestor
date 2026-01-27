(function(){
  const root = document.querySelector('.wdg-area-body');
  if(!root) return;

  const refs = {
    grid: document.getElementById('areaPanelGrid'),
    empty: document.getElementById('areaPanelEmpty'),
    toast: document.getElementById('areaPanelToast'),
    countVisible: document.getElementById('areaPanelCount'),
    filterForm: document.getElementById('areaPanelFilters'),
    filterUnidade: document.getElementById('areaFilterUnidade'),
    filterTipo: document.getElementById('areaFilterTipo'),
    filterSearch: document.getElementById('areaFilterSearch'),
    buttons: {
      refresh: document.querySelector('#areaPanelFilters [data-action="refresh"]'),
      reset: document.querySelector('#areaPanelFilters [data-action="reset"]')
    },
    quickFilters: document.getElementById('areaQuickFilters')
  };

  const state = {
    unidades: [],
    areas: [],
    filtered: [],
    currentUnidade: '',
    activeQuickFilter: null,
    quickFilters: [],
    skeletonCount: 6,
    toastTimer: null,
    searchDebounce: null
  };

  const scopeAll = root.dataset.scopeAll === 'true';
  const defaultUnit = root.dataset.userUnit || '';
  const basePath = root.dataset.basePath || '';

  init();

  function init(){
    bindEvents();
    hydrateUnidades().then(initialUnit => {
      if(initialUnit){
        loadAreas(initialUnit);
      } else {
        renderEmptyState(true);
      }
    });
  }

  function bindEvents(){
    refs.filterForm?.addEventListener('submit', evt => evt.preventDefault());
    refs.filterUnidade?.addEventListener('change', () => {
      const unidadeId = refs.filterUnidade.value || '';
      state.currentUnidade = unidadeId;
      resetDependentFilters();
      if(unidadeId){
        loadAreas(unidadeId);
      } else {
        state.areas = [];
        applyFilters();
      }
    });
    refs.filterTipo?.addEventListener('change', () => applyFilters());
    if(refs.filterSearch){
      refs.filterSearch.addEventListener('input', () => {
        clearTimeout(state.searchDebounce);
        state.searchDebounce = setTimeout(() => applyFilters(), 250);
      });
    }
    refs.buttons.refresh?.addEventListener('click', () => {
      if(state.currentUnidade){
        loadAreas(state.currentUnidade, { silentStats: true });
      } else {
        showToast('Selecione um condomínio para atualizar os dados.');
      }
    });
    refs.buttons.reset?.addEventListener('click', () => {
      resetFilters();
      applyFilters();
    });
    if(refs.quickFilters){
      refs.quickFilters.addEventListener('click', evt => {
        const target = evt.target.closest('[data-quick-filter]');
        if(!target) return;
        const filterId = target.getAttribute('data-quick-filter');
        state.activeQuickFilter = state.activeQuickFilter === filterId ? null : filterId;
        updateQuickFilterVisuals();
        applyFilters();
      });
    }
    refs.grid?.addEventListener('click', evt => {
      const button = evt.target.closest('button[data-action]');
      if(!button) return;
      const card = button.closest('.wdg-area-card');
      const areaId = card ? card.dataset.id : null;
      const action = button.getAttribute('data-action');
      handleCardAction(action, areaId, card);
    });
  }

  async function hydrateUnidades(){
    try{
      const res = await fetch(withBase(`/api/unidades?_=${Date.now()}`));
      if(!res.ok) throw new Error('Falha ao carregar unidades');
      const data = await res.json();
      state.unidades = Array.isArray(data) ? data : [];
      populateUnidadeOptions();
      const resolved = resolveInitialUnit();
      if(resolved){
        refs.filterUnidade.value = resolved;
        state.currentUnidade = resolved;
      }
      return resolved;
    } catch(err){
      console.error('[painel_area_comum] unidades erro', err);
      showToast('Não foi possível carregar as unidades disponíveis.', 'danger');
      populateUnidadeOptions([]);
      return '';
    }
  }

  function populateUnidadeOptions(list){
    const options = Array.isArray(list) ? list : state.unidades;
    if(!refs.filterUnidade) return;
    const select = refs.filterUnidade;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = options.length ? 'Selecione um condomínio' : 'Nenhuma unidade disponível';
    select.appendChild(placeholder);
    let hasDefault = false;
    options.forEach(unit => {
      const option = document.createElement('option');
      option.value = unit && unit._id ? String(unit._id) : '';
      if(option.value && defaultUnit && option.value === defaultUnit) hasDefault = true;
      const parts = [];
      if(unit?.codigo) parts.push(unit.codigo);
      if(unit?.nome) parts.push(unit.nome);
      option.textContent = parts.length ? parts.join(' · ') : (unit?._id || 'Condomínio');
      select.appendChild(option);
    });
    if(defaultUnit && !hasDefault){
      const fallback = document.createElement('option');
      fallback.value = defaultUnit;
      fallback.textContent = 'Unidade vinculada';
      select.appendChild(fallback);
    }
    if(!scopeAll){
      select.disabled = true;
      const bound = defaultUnit || (options[0] && options[0]._id) || '';
      if(bound) select.value = bound;
    }
  }

  function resolveInitialUnit(){
    if(defaultUnit) return defaultUnit;
    if(!scopeAll) return (refs.filterUnidade && refs.filterUnidade.value) || '';
    if(state.unidades.length === 1) return state.unidades[0]._id;
    return '';
  }

  async function loadAreas(unidadeId, opts){
    if(!unidadeId){
      state.areas = [];
      applyFilters();
      return;
    }
    const options = opts || {};
    setGridLoading(true);
    try{
      const params = new URLSearchParams({ unidade: unidadeId, _: Date.now() });
      const res = await fetch(withBase(`/api/areas-comuns/lista?${params}`));
      if(!res.ok) throw new Error('Falha ao carregar áreas comuns');
      const data = await res.json();
      state.areas = Array.isArray(data) ? data : [];
      updateDependentCombos();
      refreshQuickFilters();
      applyFilters();
      if(!options.silentStats) {
        showToast(`Atualizado com ${state.areas.length} áreas.`);
      }
    } catch(err){
      console.error('[painel_area_comum] áreas erro', err);
      state.areas = [];
      applyFilters();
      showToast('Não foi possível carregar as áreas comuns deste condomínio.', 'danger');
    } finally {
      setGridLoading(false);
    }
  }

  function setGridLoading(flag){
    if(!refs.grid) return;
    if(flag){
      refs.grid.innerHTML = '';
      for(let i=0;i<state.skeletonCount;i+=1){
        refs.grid.appendChild(buildSkeletonCard());
      }
      renderEmptyState(false);
    }
  }

  function buildSkeletonCard(){
    const wrapper = document.createElement('article');
    wrapper.className = 'wdg-area-card wdg-area-skeleton';
    wrapper.innerHTML = '<div class="wdg-area-skeleton" style="height:24px;width:60%;margin-bottom:1rem;"></div>' +
      '<div class="wdg-area-skeleton" style="height:12px;width:90%;margin-bottom:.5rem;"></div>' +
      '<div class="wdg-area-skeleton" style="height:12px;width:70%;margin-bottom:.5rem;"></div>' +
      '<div class="wdg-area-skeleton" style="height:40px;width:100%;"></div>';
    return wrapper;
  }

  function resetFilters(){
    if(refs.filterSearch) refs.filterSearch.value = '';
    if(refs.filterTipo) refs.filterTipo.value = '';
    state.activeQuickFilter = null;
    updateQuickFilterVisuals();
  }

  function resetDependentFilters(){
    if(refs.filterTipo){
      refs.filterTipo.innerHTML = '<option value="">Selecione um condomínio</option>';
      refs.filterTipo.disabled = true;
    }
  }

  function updateDependentCombos(){
    hydrateOptionsFromCollection(refs.filterTipo, 'tipo', 'Todos os tipos');
  }

  function hydrateOptionsFromCollection(selectEl, key, fallbackLabel){
    if(!selectEl) return;
    const uniqueItems = new Map();
    state.areas.forEach(area => {
      const value = area && (area[key] || area[`tipo_${key}`]);
      if(!value) return;
      const id = typeof value === 'object' ? (value._id || value.id || value.slug) : value;
      const label = typeof value === 'object' ? (value.nome || value.descricao || value.slug || 'Tipo') : value;
      if(!id) return;
      uniqueItems.set(String(id), label);
    });
    selectEl.innerHTML = '';
    const baseOption = document.createElement('option');
    baseOption.value = '';
    baseOption.textContent = uniqueItems.size ? fallbackLabel : 'Sem registros';
    selectEl.appendChild(baseOption);
    uniqueItems.forEach((label, id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      selectEl.appendChild(opt);
    });
    selectEl.disabled = uniqueItems.size === 0;
  }

  function refreshQuickFilters(){
    if(!refs.quickFilters) return;
    const configs = buildQuickFilterConfigs();
    state.quickFilters = configs;
    if(state.activeQuickFilter && !configs.some(cfg => cfg.id === state.activeQuickFilter)){
      state.activeQuickFilter = null;
    }
    refs.quickFilters.innerHTML = '';
    if(!configs.length){
      refs.quickFilters.style.display = 'none';
      state.activeQuickFilter = null;
      return;
    }
    refs.quickFilters.style.display = '';
    configs.forEach(cfg => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wdg-area-chip';
      chip.dataset.quickFilter = cfg.id;
      chip.innerHTML = `${cfg.icon || ''}${cfg.label}`;
      refs.quickFilters.appendChild(chip);
    });
    updateQuickFilterVisuals();
  }

  function buildQuickFilterConfigs(){
    const collection = state.areas || [];
    if(!collection.length) return [];
    const configs = [
      { id: 'disponiveis', label: 'Disponíveis hoje', predicate: a => !a.reservado_no_dia, icon: '<i class="bi bi-check-circle me-1"></i>' },
      { id: 'reservadas', label: 'Reservadas', predicate: a => Array.isArray(a.reservas_ativas) && a.reservas_ativas.length, icon: '<i class="bi bi-calendar-event me-1"></i>' },
      { id: 'manutencao', label: 'Em manutenção', predicate: a => !!a.em_manutencao, icon: '<i class="bi bi-wrench-adjustable me-1"></i>' }
    ];
    return configs.filter(cfg => collection.some(cfg.predicate));
  }

  function updateQuickFilterVisuals(){
    if(!refs.quickFilters) return;
    Array.from(refs.quickFilters.querySelectorAll('[data-quick-filter]')).forEach(node => {
      const id = node.getAttribute('data-quick-filter');
      node.classList.toggle('is-active', state.activeQuickFilter === id);
    });
  }

  function applyFilters(){
    const collection = state.areas || [];
    if(!collection.length){
      state.filtered = [];
      refs.grid.innerHTML = '';
      renderEmptyState(true);
      updateStats();
      return;
    }
    const tipoId = refs.filterTipo ? refs.filterTipo.value : '';
    const search = (refs.filterSearch ? refs.filterSearch.value : '').trim().toLowerCase();

    let filtered = collection.slice();
    if(tipoId){
      filtered = filtered.filter(area => {
        const value = area && (area.tipo || area.tipo_area);
        if(!value) return false;
        const id = typeof value === 'object' ? (value._id || value.id || value.slug) : value;
        return String(id) === tipoId;
      });
    }
    if(search){
      filtered = filtered.filter(area => {
        const bucket = [area?.nome, area?.descricao, area?.localizacao];
        const composite = bucket.filter(Boolean).join(' ').toLowerCase();
        return composite.includes(search);
      });
    }
    if(state.activeQuickFilter){
      const selected = state.quickFilters.find(q => q.id === state.activeQuickFilter);
      if(selected && typeof selected.predicate === 'function'){
        filtered = filtered.filter(selected.predicate);
      }
    }
    state.filtered = filtered;
    renderCards();
    updateStats();
  }

  function renderCards(){
    if(!refs.grid) return;
    refs.grid.innerHTML = '';
    if(!state.filtered.length){
      renderEmptyState(true);
      return;
    }
    renderEmptyState(false);
    const frag = document.createDocumentFragment();
    state.filtered.forEach(area => frag.appendChild(buildCard(area)));
    refs.grid.appendChild(frag);
  }

  function buildCard(area){
    const card = document.createElement('article');
    card.className = 'wdg-area-card';
    card.dataset.id = area && area._id ? String(area._id) : '';
    const reservado = Array.isArray(area?.reservas_ativas) && area.reservas_ativas.length > 0;
    card.dataset.status = reservado ? 'reservado' : 'disponivel';
    const statusLabel = reservado ? 'Reservada' : 'Disponível';
    const statusClass = reservado ? 'status-reservado' : 'status-disponivel';
    const capacidade = typeof area?.capacidade === 'number' ? area.capacidade : null;
    const tamanho = typeof area?.area_m2 === 'number' ? `${area.area_m2} m²` : null;
    const observacao = area?.observacao || area?.localizacao || null;
    const tipo = area?.tipo && (area.tipo.nome || area.tipo.descricao || area.tipo);
    const responsavel = area?.responsavel?.nome || area?.responsavel_nome || null;

    const metaChunks = [];
    if(tipo) metaChunks.push(tipo);
    if(capacidade) metaChunks.push(`${capacidade} pessoas`);
    if(tamanho) metaChunks.push(tamanho);

    const tags = [];
    if(tipo) tags.push(tipo);
    if(capacidade) tags.push(`${capacidade} pessoas`);
    if(tamanho) tags.push(tamanho);

    const reservasPreview = resolveReservasPreview(area);
    const disponiveisPreview = resolveDisponibilidadesPreview(area);
    const indisponiveisPreview = resolveIndisponibilidadesPreview(area);
    const observacaoPreview = buildObservacaoPreview(observacao, responsavel, area?.taxa_limpeza);
    const timelineItems = buildAreaTimeline(area);

    const tagsHtml = tags.map(tag => `<span class="wdg-area-tag">${escapeHtml(tag)}</span>`).join('');
    const scheduleHtml = `
      <section class="wdg-area-schedule">
        ${renderScheduleCard('Períodos disponíveis', disponiveisPreview, 'Sem horários cadastrados')}
        ${renderScheduleCard('Períodos de indisponibilidade', indisponiveisPreview, 'Sem bloqueios programados')}
        ${renderScheduleCard('Reservas previstas', reservasPreview, 'Nenhuma reserva futura registrada')}
        ${renderScheduleCard('Observação', [], 'Sem observações registradas', { customContent: observacaoPreview.html, isScrollable: observacaoPreview.isScrollable })}
      </section>`;
    const timelineHtml = timelineItems.map(item => `
        <li>
          <small>${escapeHtml(item.label)}</small>
          <span>${escapeHtml(item.value)}</span>
        </li>`).join('');

    card.innerHTML = `
      <div class="wdg-area-card-head">
        <div>
          <div class="wdg-area-card-topline">
            <p class="wdg-area-card-title">${escapeHtml(area?.nome || 'Área sem título')}</p>
            <span class="wdg-area-card-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="wdg-area-card-meta">${metaChunks.map(escapeHtml).join(' · ') || 'Sem detalhes'}</div>
        </div>
      </div>
      <div class="wdg-area-tag-row">${tagsHtml}</div>
      ${scheduleHtml}
      ${timelineItems.length ? `<ul class="wdg-area-timeline">${timelineHtml}</ul>` : ''}
      <div class="wdg-area-card-actions">
        ${renderAreaActionIcons()}
      </div>`;
    return card;
  }

  function renderAreaActionIcons(){
    const icons = [
      { action: 'detalhes', label: 'Detalhes', asset: '/images/detalhe.png', fallback: 'bi bi-eye' },
      { action: 'ceder-uso', label: 'Ceder para uso', asset: '/images/cessaodeuso.png', fallback: 'bi bi-calendar-event' },
      { action: 'materiais', label: 'Materiais', asset: '/images/materiais.png', fallback: 'bi bi-boxes' },
      { action: 'disponibilidades', label: 'Definir disponibilidades', asset: '/images/disponibilidade.png', fallback: 'bi bi-clock-history' },
      { action: 'restricoes', label: 'Definir restrições', asset: '/images/indisponivel.png', fallback: 'bi bi-slash-circle' },
      { action: 'termo', label: 'Definir termo de uso', asset: '/images/termodeuso.png', fallback: 'bi bi-file-text' }
    ];
    return `<div class="wdg-area-card-action-icons">${icons.map(buildActionIconMarkup).join('')}</div>`;
  }

  function buildActionIconMarkup(cfg){
    const label = escapeHtml(cfg.label);
    const src = escapeHtml(withBase(cfg.asset));
    const fallback = escapeHtml(cfg.fallback || 'bi bi-question-circle');
    return `
      <button type="button" class="wdg-icon-btn" data-action="${cfg.action}" title="${label}" aria-label="${label}">
        <img src="${src}" alt="${label}" onerror="this.outerHTML='&lt;i class=&quot;${fallback}&quot;&gt;&lt;/i&gt;'">
      </button>`;
  }

  function buildAreaTimeline(area){
    const reservas = Array.isArray(area?.reservas_ativas) ? area.reservas_ativas : [];
    const proximaReserva = reservas.length ? reservas[0] : null;
    if(!proximaReserva) return [];
    return [{ label: 'Próxima reserva', value: formatDate(proximaReserva.inicio || proximaReserva.data, proximaReserva.fim) }];
  }

  function renderScheduleCard(title, items, emptyMessage, options = {}){
    const list = Array.isArray(items) ? items : [];
    const hasCustom = typeof options.customContent === 'string' && options.customContent.trim().length;
    let content = '';
    if(hasCustom){
      content = options.customContent;
    } else if(list.length){
      content = `<ul class="wdg-area-schedule-list">${list.map(entry => `
          <li>
            <strong>${escapeHtml(entry.primary || '')}</strong>
            ${entry.secondary ? `<span>${escapeHtml(entry.secondary)}</span>` : ''}
            ${entry.badge ? `<small class="${entry.badgeTone || ''}">${escapeHtml(entry.badge)}</small>` : ''}
          </li>`).join('')}</ul>`;
    } else {
      content = `<p class="wdg-area-schedule-empty">${escapeHtml(emptyMessage)}</p>`;
    }
    const scrollable = options.forceScrollable || options.isScrollable || (!hasCustom && list.length >= 4);
    return `
      <article class="wdg-area-schedule-card${scrollable ? ' has-scroll' : ''}">
        <header>
          <h4>${escapeHtml(title)}</h4>
        </header>
        <div class="wdg-area-schedule-content">
          ${content}
        </div>
      </article>`;
  }

  function resolveReservasPreview(area){
    const list = Array.isArray(area?.reservas_ativas) ? area.reservas_ativas : [];
    if(!list.length) return [];
    return list.slice(0, 4).map(item => {
      const primary = formatReservaRange(item.inicio, item.fim);
      const secondary = item.responsavel_nome || item.habitacao_label || 'Reserva registrada';
      const badge = item.status === 'em_andamento' ? 'Em andamento' : (item.status === 'futuro' ? 'Agendada' : 'Encerrada');
      const badgeTone = item.status === 'em_andamento' ? 'is-live' : (item.status === 'futuro' ? 'is-future' : 'is-muted');
      return { primary, secondary, badge, badgeTone };
    });
  }

  function resolveDisponibilidadesPreview(area){
    const list = Array.isArray(area?.disponibilidades) ? area.disponibilidades : [];
    if(!list.length) return [];
    return list.map(slot => mapDisponibilidadeSlot(slot)).filter(Boolean);
  }

  function mapDisponibilidadeSlot(slot){
    if(slot == null) return null;
    if(typeof slot === 'string'){
      const texto = slot.trim();
      return texto ? { primary: texto, secondary: '' } : null;
    }
    if(typeof slot !== 'object') return null;
    const primary = formatDisponibilidadeDia(slot);
    const detalhes = extractDisponibilidadeIntervalos(slot);
    const note = slot.observacao || slot.obs || slot.nota || '';
    const secondary = detalhes.length ? detalhes.join(', ') : (note || 'Sem horários definidos');
    return { primary: primary || 'Período', secondary };
  }

  function formatDisponibilidadeDia(slot){
    if(!slot) return '';
    const dayMap = {
      sunday: 'Domingo', monday: 'Segunda-feira', tuesday: 'Terça-feira', wednesday: 'Quarta-feira',
      thursday: 'Quinta-feira', friday: 'Sexta-feira', saturday: 'Sábado'
    };
    const candidate = (slot.day || slot.weekday || slot.dia || slot.day_id || '').toString().trim().toLowerCase();
    if(candidate && dayMap[candidate]) return dayMap[candidate];
    if(slot.day_label) return String(slot.day_label);
    if(slot.label) return String(slot.label);
    if(slot.nome) return String(slot.nome);
    if(slot.titulo) return String(slot.titulo);
    return '';
  }

  function extractDisponibilidadeIntervalos(slot){
    if(!slot || typeof slot !== 'object') return [];
    const raw = Array.isArray(slot.intervals) ? slot.intervals
      : (Array.isArray(slot.slots) ? slot.slots
      : (Array.isArray(slot.horarios) ? slot.horarios : []));
    if(!raw.length) return [];
    return raw.map(entry => formatDisponibilidadeInterval(entry)).filter(Boolean);
  }

  function formatDisponibilidadeInterval(entry){
    if(entry == null) return '';
    if(typeof entry === 'string'){
      const normalized = entry.replace(/\s+/g, ' ').trim();
      if(!normalized) return '';
      if(/\d/.test(normalized)){
        const [ini, fim] = normalized.split(/[-–]/).map(part => part.trim());
        if(ini && fim) return `${formatHourLabel(ini)} - ${formatHourLabel(fim)}`;
      }
      return normalized;
    }
    if(typeof entry !== 'object') return '';
    const start = entry.start || entry.inicio || entry.from || entry.de || entry.hora_inicio || entry.horaInicio || '';
    const end = entry.end || entry.fim || entry.to || entry.ate || entry.hora_fim || entry.horaFim || '';
    if(!start || !end) return '';
    return `${formatHourLabel(start)} - ${formatHourLabel(end)}`;
  }

  function resolveIndisponibilidadesPreview(area){
    const list = Array.isArray(area?.restricoes) ? area.restricoes : [];
    if(!list.length) return [];
    return list.slice(0, 4).map(item => {
      const primary = formatDateLabel(item.date);
      const range = `${formatHourLabel(item.start)} - ${formatHourLabel(item.end)}`;
      const detail = item.observacao ? `${range} · ${item.observacao}` : range;
      return { primary, secondary: detail };
    });
  }

  function buildObservacaoPreview(text, responsavel, taxaUso){
    const extras = [];
    if(responsavel) extras.push(`Responsável: ${responsavel}`);
    if(taxaUso != null) extras.push(`Taxa de uso: ${formatCurrencyBr(taxaUso)}`);
    const baseLines = typeof text === 'string' ? text.split(/\r?\n+/).map(line => line.trim()).filter(Boolean) : [];
    const lines = baseLines.concat(extras);
    if(!lines.length) return { html: '', isScrollable: false };
    const html = `<div class="wdg-area-schedule-note">${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}</div>`;
    return { html, isScrollable: lines.length >= 4 };
  }

  function formatReservaRange(startIso, endIso){
    const start = startIso ? new Date(startIso) : null;
    const end = endIso ? new Date(endIso) : null;
    if(!start || Number.isNaN(start.getTime())) return 'Sem data';
    const sameDay = end && !Number.isNaN(end.getTime()) ? start.toDateString() === end.toDateString() : true;
    const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
    const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const startDate = dateFormatter.format(start);
    const startTime = timeFormatter.format(start);
    if(!end || Number.isNaN(end.getTime())){
      return `${startDate} · ${startTime}`;
    }
    const endTime = timeFormatter.format(end);
    if(sameDay) return `${startDate} · ${startTime} - ${endTime}`;
    const endDate = dateFormatter.format(end);
    return `${startDate} ${startTime} → ${endDate} ${endTime}`;
  }

  function formatHourLabel(value){
    if(!value) return '';
    const normalized = normalizeAreaTime(value) || String(value);
    const parts = normalized.split(':');
    const hour = (parts[0] || '00').replace(/[^0-9]/g, '');
    const minute = (parts[1] || '00').replace(/[^0-9]/g, '');
    const safeHour = hour.padStart(2,'0').slice(-2);
    const safeMinute = minute.padStart(2,'0').slice(-2);
    return `${safeHour}h${safeMinute}`;
  }

  function formatDateLabel(value){
    if(!value) return 'Sem data';
    const date = new Date(value);
    if(Number.isNaN(date.getTime())){
      const isoLike = String(value).trim();
      const parts = isoLike.split('-');
      if(parts.length === 3){
        return `${parts[2]}/${parts[1]}`;
      }
      return isoLike;
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function formatCurrencyBr(value){
    if(value == null) return '—';
    try{
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
    } catch{
      return `R$ ${Number(value).toFixed(2)}`;
    }
  }

  function formatDate(start, end){
    if(!start) return 'Sem data';
    try {
      const startDate = new Date(start);
      const endDate = end ? new Date(end) : null;
      const formatter = new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
      const startStr = formatter.format(startDate).replace('.', '');
      return endDate ? `${startStr} - ${formatter.format(endDate).replace('.', '')}` : startStr;
    } catch {
      return String(start);
    }
  }

  function formatAreaUnidadeLabel(area){
    if(area?.unidade && typeof area.unidade === 'object'){
      const codigo = area.unidade.codigo || '';
      const nome = area.unidade.nome || area.unidade.label || '';
      const composed = [codigo, nome].filter(Boolean).join(' - ');
      if(composed) return composed;
    }
    if(area?.unidade_label) return String(area.unidade_label);
    if(area?.unidade_nome) return String(area.unidade_nome);
    const unitId = area?.unidade_id || area?.unidadeId;
    return unitId ? `Unidade ${unitId}` : '—';
  }

  function formatAreaTamanho(value){
    if(value == null || value === '') return '—';
    const num = Number(value);
    if(Number.isFinite(num)){
      const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
      return `${formatted} m²`;
    }
    return `${value} m²`;
  }

  function formatCapacidadeHumana(value){
    if(value == null || value === '') return '—';
    const num = Number(value);
    if(Number.isFinite(num)){
      const plural = Math.abs(num) === 1 ? 'pessoa' : 'pessoas';
      return `${num} ${plural}`;
    }
    return String(value);
  }

  function resolveAreaObservacao(area){
    const text = area?.observacao || area?.obs || '';
    if(text) return text;
    return area?.localizacao || 'Sem observações registradas.';
  }

  function resolveAreaFoto(area){
    return area?.foto || area?.foto_url || area?.fotoUrl || '';
  }

  function setTextContent(elementId, text){
    const el = document.getElementById(elementId);
    if(el){
      el.textContent = text == null ? '—' : String(text);
    }
  }

  function findAreaById(areaId){
    if(!areaId) return null;
    const needle = String(areaId);
    return state.areas.find(item => item && String(item._id || item.id || item.areaId || '') === needle) || null;
  }

  function refreshAreaCard(areaId){
    if(!areaId || !refs.grid) return;
    const card = Array.from(refs.grid.querySelectorAll('.wdg-area-card')).find(node => node.dataset && node.dataset.id === areaId);
    if(!card) return;
    const area = findAreaById(areaId);
    if(!area) return;
    const updated = buildCard(area);
    card.replaceWith(updated);
  }

  function resolveAreaId(area){
    if(!area || typeof area !== 'object') return '';
    return String(area._id || area.id || area.areaId || '');
  }

  function abrirModalDetalhesArea(area){
    const modalEl = document.getElementById('modalDetAreaConstCad');
    if(!modalEl){
      showToast('Modal de detalhes indisponível.', 'danger');
      return;
    }
    setTextContent('detACUnidade', formatAreaUnidadeLabel(area));
    setTextContent('detACNome', area?.nome || '—');
    setTextContent('detACArea', formatAreaTamanho(area?.area_m2));
    setTextContent('detACCapacidade', formatCapacidadeHumana(area?.capacidade));
    setTextContent('detACObs', resolveAreaObservacao(area));
    const fotoEl = document.getElementById('detACFoto');
    const emptyEl = document.getElementById('detACFotoVazio');
    const fotoSrc = resolveAreaFoto(area);
    if(fotoEl && emptyEl){
      if(fotoSrc){
        fotoEl.src = fotoSrc;
        fotoEl.classList.remove('d-none');
        emptyEl.classList.add('d-none');
      } else {
        fotoEl.src = '';
        fotoEl.classList.add('d-none');
        emptyEl.classList.remove('d-none');
      }
    }
    try{
      const modalInstance = window.bootstrap && window.bootstrap.Modal
        ? window.bootstrap.Modal.getOrCreateInstance(modalEl)
        : null;
      modalInstance ? modalInstance.show() : modalEl.classList.add('show');
    }catch(err){
      console.warn('[painel_area_comum] falha ao abrir modal de detalhes', err);
      showToast('Não foi possível abrir o modal de detalhes.', 'warning');
    }
  }

  function abrirModalCederParaUso(area){
    if(!window.WDG_AC_CESSAO || typeof window.WDG_AC_CESSAO.abrir !== 'function'){
      showToast('Modal de cessão indisponível no momento.', 'danger');
      return;
    }
    const payload = {
      area: cloneData(area) || area,
      areaId: resolveAreaId(area)
    };
    try{
      window.WDG_AC_CESSAO.abrir(payload).then(result => {
        const detail = { area: payload.area, areaId: payload.areaId, result };
        document.dispatchEvent(new CustomEvent('area-comum:cessao:aberta', { detail }));
      }).catch(err => {
        console.warn('[painel_area_comum] erro ao abrir modal de cessão', err);
        showToast('Não foi possível abrir o modal de cessão.', 'danger');
      });
    }catch(err){
      console.warn('[painel_area_comum] falha ao abrir modal de cessão', err);
      showToast('Não foi possível abrir o modal de cessão.', 'danger');
    }
  }

  function abrirModalMateriais(area){
    if(!window.WDG_AC_MATERIAL || typeof window.WDG_AC_MATERIAL.abrir !== 'function'){
      showToast('Modal de materiais indisponível no momento.', 'danger');
      return;
    }
    const payload = {
      area: cloneData(area) || area,
      areaId: resolveAreaId(area),
      autoFetch: true
    };
    try{
      window.WDG_AC_MATERIAL.abrir(payload).catch(err => {
        console.warn('[painel_area_comum] erro ao abrir modal de materiais', err);
        showToast('Não foi possível abrir o modal de materiais.', 'warning');
      });
    }catch(err){
      console.warn('[painel_area_comum] falha ao abrir modal de materiais', err);
      showToast('Não foi possível abrir o modal de materiais.', 'warning');
    }
  }

  async function abrirModalDisponibilidade(area){
    if(!window.WDG_AC_DISP || typeof window.WDG_AC_DISP.abrir !== 'function'){
      showToast('Modal de disponibilidades indisponível.', 'danger');
      return;
    }
    const payload = {
      area: cloneData(area) || area,
      disponibilidades: Array.isArray(area.disponibilidades) ? cloneData(area.disponibilidades) || area.disponibilidades : []
    };
    try{
      const result = await window.WDG_AC_DISP.abrir(payload);
      if(result && Array.isArray(result.schedule)){
        await persistDisponibilidades(area, result.schedule);
      }
    }catch(err){
      console.warn('[painel_area_comum] erro ao abrir modal de disponibilidades', err);
      showToast('Não foi possível abrir o modal de disponibilidades.', 'warning');
    }
  }

  async function abrirModalRestricoes(area){
    if(!window.WDG_AC_RESTR || typeof window.WDG_AC_RESTR.abrir !== 'function'){
      showToast('Modal de restrições indisponível.', 'danger');
      return;
    }
    const payload = {
      area: cloneData(area) || area,
      restricoes: Array.isArray(area.restricoes) ? cloneData(area.restricoes) || area.restricoes : []
    };
    try{
      const result = await window.WDG_AC_RESTR.abrir(payload);
      if(result && Array.isArray(result.restrictions)){
        await persistRestricoes(area, result.restrictions);
      }
    }catch(err){
      console.warn('[painel_area_comum] erro ao abrir modal de restrições', err);
      showToast('Não foi possível abrir o modal de restrições.', 'warning');
    }
  }

  async function abrirModalRegrasUso(area){
    if(!window.WDG_AC_REGRAS || typeof window.WDG_AC_REGRAS.abrir !== 'function'){
      showToast('Modal de termo de uso indisponível.', 'danger');
      return;
    }
    const payload = {
      area: cloneData(area) || area,
      areaId: resolveAreaId(area),
      regras: area?.regras_uso || ''
    };
    try{
      const result = await window.WDG_AC_REGRAS.abrir(payload);
      if(!result || !result.saved) return;
      const targetId = result.areaId || payload.areaId;
      if(!targetId){
        showToast('Não foi possível salvar o termo: área sem identificador.', 'warning');
        return;
      }
      const serialized = typeof result.serialized === 'string' ? result.serialized : '';
      const saveResult = await salvarRegrasUsoBackend(targetId, serialized);
      if(!saveResult || !saveResult.ok) return;
      const savedTexto = typeof saveResult.payload?.regras_uso === 'string' ? saveResult.payload.regras_uso : serialized;
      area.regras_uso = savedTexto;
      refreshAreaCard(targetId);
      const parsedRules = Array.isArray(result.rules) && result.rules.length
        ? result.rules.map(rule => String(rule))
        : ((window.WDG_AC_REGRAS && typeof window.WDG_AC_REGRAS.parse === 'function')
          ? window.WDG_AC_REGRAS.parse(savedTexto)
          : parseRegrasUsoList(savedTexto));
      const detail = {
        area: cloneData(area) || area,
        areaId: targetId,
        regras: cloneData(parsedRules) || parsedRules,
        texto: savedTexto,
        count: Array.isArray(parsedRules) ? parsedRules.length : 0,
        saved: true,
        response: saveResult.payload
      };
      document.dispatchEvent(new CustomEvent('area-comum:termo:aplicado', { detail }));
    }catch(err){
      console.warn('[painel_area_comum] erro ao abrir modal de regras de uso', err);
      showToast('Não foi possível abrir o modal de termo de uso.', 'warning');
    }
  }

  async function persistDisponibilidades(area, schedule){
    const areaId = resolveAreaId(area);
    if(!areaId){
      showToast('Área sem identificador. Atualize a página e tente novamente.', 'warning');
      return;
    }
    const saveResult = await salvarDisponibilidadesBackend(areaId, schedule);
    if(!saveResult || !saveResult.ok) return;
    const savedList = Array.isArray(saveResult.payload?.disponibilidades)
      ? saveResult.payload.disponibilidades
      : (saveResult.normalized || normalizeSchedulePayload(schedule));
    area.disponibilidades = savedList;
    refreshAreaCard(areaId);
    const detail = {
      area: cloneData(area) || area,
      areaId,
      schedule: cloneData(savedList) || savedList,
      saved: true,
      response: saveResult.payload
    };
    document.dispatchEvent(new CustomEvent('area-comum:disponibilidade:aplicada', { detail }));
  }

  async function persistRestricoes(area, restrictions){
    const areaId = resolveAreaId(area);
    if(!areaId){
      showToast('Área sem identificador. Atualize a página e tente novamente.', 'warning');
      return;
    }
    const saveResult = await salvarRestricoesBackend(areaId, restrictions);
    if(!saveResult || !saveResult.ok) return;
    const savedList = Array.isArray(saveResult.payload?.restricoes)
      ? saveResult.payload.restricoes
      : (saveResult.normalized || normalizeRestrictionsPayload(restrictions));
    area.restricoes = savedList;
    refreshAreaCard(areaId);
    const detail = {
      area: cloneData(area) || area,
      areaId,
      restrictions: cloneData(savedList) || savedList,
      saved: true,
      response: saveResult.payload
    };
    document.dispatchEvent(new CustomEvent('area-comum:restricao:aplicada', { detail }));
  }

  async function salvarDisponibilidadesBackend(areaId, schedule){
    if(!areaId){
      showToast('Não foi possível identificar a área selecionada.', 'warning');
      return { ok: false, reason: 'missing-id' };
    }
    const normalized = normalizeSchedulePayload(schedule);
    const payload = { disponibilidades: normalized };
    const url = withBase(`/api/areas-comuns/${encodeURIComponent(areaId)}`);
    const result = await sendJson(url, 'PUT', payload);
    if(result.ok){
      showToast('Disponibilidades atualizadas.', 'success');
    }
    return { ...result, normalized };
  }

  async function salvarRestricoesBackend(areaId, restrictions){
    if(!areaId){
      showToast('Não foi possível identificar a área selecionada.', 'warning');
      return { ok: false, reason: 'missing-id' };
    }
    const normalized = normalizeRestrictionsPayload(restrictions);
    const payload = { restricoes: normalized };
    const url = withBase(`/api/areas-comuns/${encodeURIComponent(areaId)}`);
    const result = await sendJson(url, 'PUT', payload);
    if(result.ok){
      showToast('Restrições atualizadas.', 'success');
    }
    return { ...result, normalized };
  }

  async function salvarRegrasUsoBackend(areaId, texto){
    if(!areaId){
      showToast('Não foi possível identificar a área selecionada.', 'warning');
      return { ok: false, reason: 'missing-id' };
    }
    const payload = { regras_uso: typeof texto === 'string' ? texto : '' };
    const url = withBase(`/api/areas-comuns/${encodeURIComponent(areaId)}`);
    const result = await sendJson(url, 'PUT', payload);
    if(result.ok){
      const hasRules = !!payload.regras_uso.trim();
      showToast(hasRules ? 'Termo de uso atualizado.' : 'Termo de uso removido.', hasRules ? 'success' : 'secondary');
    }
    return result;
  }

  async function sendJson(url, method, body){
    const options = {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    };
    if(body !== undefined){
      options.body = JSON.stringify(body);
    }
    try{
      const res = await fetch(url, options);
      const text = await res.text();
      let payload = null;
      if(text){
        try{ payload = JSON.parse(text); }
        catch(_){ payload = null; }
      }
      if(!res.ok){
        const statusMsg = res.status === 503 ? 'Serviço indisponível. Tente novamente em instantes.' : 'Falha ao salvar os dados.';
        const msg = payload && (payload.error || payload.detail) ? String(payload.error || payload.detail) : statusMsg;
        showToast(msg, 'danger');
        return { ok: false, status: res.status, payload };
      }
      return { ok: true, status: res.status, payload };
    }catch(err){
      console.warn('[painel_area_comum] requisição falhou', url, err);
      showToast('Não foi possível se conectar ao servidor.', 'danger');
      return { ok: false, error: err };
    }
  }

  function cloneData(value){
    try{
      if(typeof structuredClone === 'function') return structuredClone(value);
    }catch(_){ }
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(_){
      return null;
    }
  }

  function normalizeSchedulePayload(schedule){
    if(!Array.isArray(schedule)) return [];
    const clean = [];
    schedule.forEach(entry => {
      if(!entry) return;
      const dayRaw = entry.day || entry.weekday || entry.dia || entry.day_id;
      if(typeof dayRaw !== 'string') return;
      const day = dayRaw.trim().toLowerCase();
      if(!day) return;
      const labelRaw = typeof entry.label === 'string' && entry.label ? entry.label : (typeof entry.day_label === 'string' && entry.day_label ? entry.day_label : '');
      const dayIndexRaw = Number.isInteger(entry.day_index) ? entry.day_index : (Number.isInteger(entry.weekday_index) ? entry.weekday_index : null);
      const slotsRaw = Array.isArray(entry.intervals) ? entry.intervals : (Array.isArray(entry.slots) ? entry.slots : (Array.isArray(entry.horarios) ? entry.horarios : []));
      if(!slotsRaw.length) return;
      const intervals = [];
      slotsRaw.forEach(slot => {
        if(!slot) return;
        const startRaw = typeof slot.start === 'string' ? slot.start : (typeof slot.inicio === 'string' ? slot.inicio : (typeof slot.from === 'string' ? slot.from : (typeof slot.de === 'string' ? slot.de : null)));
        const endRaw = typeof slot.end === 'string' ? slot.end : (typeof slot.fim === 'string' ? slot.fim : (typeof slot.to === 'string' ? slot.to : (typeof slot.ate === 'string' ? slot.ate : null)));
        const start = startRaw ? startRaw.trim() : '';
        const end = endRaw ? endRaw.trim() : '';
        if(!start || !end) return;
        intervals.push({ start, end });
      });
      if(!intervals.length) return;
      const normalized = { day, intervals: intervals.map(slot => ({ start: slot.start, end: slot.end })) };
      if(labelRaw) normalized.label = labelRaw;
      if(dayIndexRaw != null) normalized.day_index = dayIndexRaw;
      clean.push(normalized);
    });
    return clean;
  }

  function normalizeRestrictionDate(value){
    if(!value) return null;
    let str = String(value).trim();
    if(!str) return null;
    const iso = /^([0-9]{4})[-\.\/_]([0-9]{1,2})[-\.\/_]([0-9]{1,2})$/.exec(str);
    if(iso){
      const year = Number(iso[1]);
      const month = Number(iso[2]);
      const day = Number(iso[3]);
      if(!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
      const date = new Date(Date.UTC(year, month - 1, day));
      if(date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
      return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
    const br = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/.exec(str);
    if(br){
      const day = Number(br[1]);
      const month = Number(br[2]);
      const year = Number(br[3]);
      if(!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
      const date = new Date(Date.UTC(year, month - 1, day));
      if(date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
      return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
    const parsed = new Date(str);
    if(Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }

  function normalizeRestrictionsPayload(list){
    if(!Array.isArray(list)) return [];
    const clean = [];
    list.forEach(entry => {
      if(!entry) return;
      const date = normalizeRestrictionDate(entry.date || entry.data || entry.dia || entry.day);
      const start = normalizeAreaTime(entry.start || entry.inicio || entry.from || entry.de || entry.hora_inicio || entry.horaInicio);
      const end = normalizeAreaTime(entry.end || entry.fim || entry.to || entry.ate || entry.hora_fim || entry.horaFim);
      if(!date || !start || !end) return;
      if(minutesFromTime(end) <= minutesFromTime(start)) return;
      let obs = entry.observacao;
      if(obs == null) obs = entry.obs;
      if(obs == null) obs = entry.justificativa;
      if(obs == null) obs = entry.motivo;
      const observacao = obs != null ? String(obs).trim().slice(0, 600) : '';
      clean.push({ date, start, end, observacao });
    });
    clean.sort((a, b) => {
      if(a.date === b.date) return minutesFromTime(a.start) - minutesFromTime(b.start);
      return a.date < b.date ? -1 : 1;
    });
    return clean;
  }

  function normalizeAreaTime(value){
    if(value == null) return null;
    let str = String(value).trim();
    if(!str) return null;
    str = str.replace(/[hH]/g, ':').replace(/[^0-9:]/g, '');
    if(/^\d{3,4}$/.test(str)){
      str = str.slice(0, str.length - 2) + ':' + str.slice(-2);
    }
    const match = /^([0-9]{1,2}):([0-9]{1,2})$/.exec(str);
    if(!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if(Number.isNaN(hour) || Number.isNaN(minute)) return null;
    if(hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return String(hour).padStart(2,'0') + ':' + String(minute).padStart(2,'0');
  }

  function minutesFromTime(time){
    if(!/^\d{2}:\d{2}$/.test(time)) return NaN;
    const [h, m] = time.split(':').map(Number);
    return (h * 60) + m;
  }

  function parseRegrasUsoList(source){
    const collected = [];
    const collect = value => {
      if(value == null) return;
      if(Array.isArray(value)){
        value.forEach(collect);
        return;
      }
      if(typeof value === 'object'){
        if(Object.prototype.hasOwnProperty.call(value, 'rules')) collect(value.rules);
        if(Object.prototype.hasOwnProperty.call(value, 'regras')) collect(value.regras);
        if(Object.prototype.hasOwnProperty.call(value, 'text')) collect(value.text);
        const keys = Object.keys(value).filter(k => !['rules','regras','text'].includes(k));
        keys.forEach(key => collect(value[key]));
        return;
      }
      if(typeof value === 'string'){
        value.split(/\r?\n+/).forEach(part => {
          const texto = part.replace(/\s+/g, ' ').trim();
          if(texto) collected.push(texto);
        });
        return;
      }
      const texto = String(value).replace(/\s+/g, ' ').trim();
      if(texto && texto !== '[object Object]') collected.push(texto);
    };
    collect(source);
    if(!collected.length) return [];
    const seen = new Set();
    const unique = [];
    for(const item of collected){
      if(seen.has(item)) continue;
      seen.add(item);
      unique.push(item);
      if(unique.length >= 100) break;
    }
    return unique;
  }

  function renderEmptyState(flag){
    if(refs.empty) refs.empty.classList.toggle('is-visible', !!flag);
  }

  function updateStats(){
    if(refs.countVisible){
      refs.countVisible.textContent = state.filtered.length;
    }
  }

  function handleCardAction(action, areaId){
    if(!areaId || !action) return;
    const area = findAreaById(areaId);
    if(!area){
      showToast('Não foi possível localizar os dados da área selecionada.', 'danger');
      return;
    }
    if(action === 'detalhes'){
      abrirModalDetalhesArea(area);
      return;
    }
    if(action === 'reservas'){
      showToast('Redirecionando para reservas (em breve).');
      return;
    }
    if(action === 'ceder-uso'){
      abrirModalCederParaUso(area);
      return;
    }
    if(action === 'materiais'){
      abrirModalMateriais(area);
      return;
    }
    if(action === 'disponibilidades'){
      abrirModalDisponibilidade(area);
      return;
    }
    if(action === 'restricoes'){
      abrirModalRestricoes(area);
      return;
    }
    if(action === 'termo'){
      abrirModalRegrasUso(area);
      return;
    }
  }

  function showToast(message, variant){
    if(!refs.toast) return;
    refs.toast.textContent = message;
    refs.toast.classList.add('is-visible');
    refs.toast.style.background = variant === 'danger' ? '#b91c1c' : '#0f172a';
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => refs.toast.classList.remove('is-visible'), 3500);
  }

  function escapeHtml(str){
    if(str == null) return '';
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c] || c));
  }

  function withBase(path){
    if(!path) return basePath || '';
    if(path.startsWith('http')) return path;
    return `${basePath}${path}`.replace(/\/+/g,'/');
  }
})();
