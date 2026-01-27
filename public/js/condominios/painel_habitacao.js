(function(){
  const root = document.querySelector('.wdg-hab-body');
  if(!root) return;

  const refs = {
    grid: document.getElementById('habPanelGrid'),
    empty: document.getElementById('habPanelEmpty'),
    toast: document.getElementById('habPanelToast'),
    countVisible: document.getElementById('habPanelCount'),
    filterForm: document.getElementById('habPanelFilters'),
    filterUnidade: document.getElementById('habFilterUnidade'),
    filterBloco: document.getElementById('habFilterBloco'),
    filterAndar: document.getElementById('habFilterAndar'),
    filterSearch: document.getElementById('habFilterSearch'),
    buttons: {
      refresh: document.querySelector('[data-action="refresh"]'),
      reset: document.querySelector('[data-action="reset"]')
    },
    quickFilters: document.getElementById('habQuickFilters'),
    reservasModal: document.getElementById('habReservasModal'),
    reservasTitle: document.getElementById('habReservasTitle'),
    reservasSubtitle: document.getElementById('habReservasSubtitle'),
    reservasList: document.getElementById('habReservasList'),
    reservasEmpty: document.getElementById('habReservasEmpty'),
    reservasLoading: document.getElementById('habReservasLoading'),
    moradorAcessoModal: document.getElementById('habMoradorAcessoModal'),
    moradorAcessoTitle: document.getElementById('habMoradorAcessoTitle'),
    moradorAcessoSubtitle: document.getElementById('habMoradorAcessoSubtitle'),
    moradorAcessoPergunta: document.getElementById('habMoradorAcessoPergunta'),
    moradorAcessoDt: document.getElementById('habMoradorAcessoDt'),
    moradorAcessoIcon: document.getElementById('habMoradorAcessoIcon'),
    moradorAcessoPill: document.getElementById('habMoradorAcessoPill'),
    moradorAcessoPillText: document.getElementById('habMoradorAcessoPillText'),
    moradorAcessoHabId: document.getElementById('habMoradorAcessoHabId'),
    moradorAcessoMoradorId: document.getElementById('habMoradorAcessoMoradorId'),
    moradorAcessoAcao: document.getElementById('habMoradorAcessoAcao'),
    moradorAcessoErro: document.getElementById('habMoradorAcessoErro'),
    moradorAcessoConfirmar: document.getElementById('habMoradorAcessoConfirmar')
  };

  const state = {
    unidades: [],
    habitacoes: [],
    filtered: [],
    currentUnidade: '',
    activeQuickFilter: null,
    quickFilters: [],
    skeletonCount: 6,
    toastTimer: null,
    searchDebounce: null,
    habIndex: new Map(),
    reservasCache: new Map(),
    visitaIndex: new Map(),
    moradorAcessoSubmitting: false,
    moradorAcessoBs: null
  };

  const scopeAll = root.dataset.scopeAll === 'true';
  const defaultUnit = root.dataset.userUnit || '';
  const basePath = root.dataset.basePath || '';
  const iconCache = Object.create(null);
  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  const VISITA_SEEN_KEY = 'wdg_hab_visitas_seen_v1';

  function loadSeenVisitas(){
    try {
      const raw = localStorage.getItem(VISITA_SEEN_KEY);
      if(!raw) return new Set();
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return new Set(parsed.map(String));
      return new Set();
    } catch {
      return new Set();
    }
  }

  function saveSeenVisitas(set){
    try { localStorage.setItem(VISITA_SEEN_KEY, JSON.stringify(Array.from(set || []))); } catch {}
  }

  const seenVisitas = loadSeenVisitas();

  function markVisitaSeen(id){
    const key = String(id || '').trim();
    if(!key) return;
    if(seenVisitas.has(key)) return;
    seenVisitas.add(key);
    saveSeenVisitas(seenVisitas);
  }

  function normalizeStatus(raw){
    const s = String(raw || '').toLowerCase();
    if(!s) return 'aberto';
    if(s.includes('aceit')) return 'aceita';
    if(s.includes('rejeit') || s.includes('recus')) return 'rejeitada';
    return s;
  }

  function isServicoAtivo(item){
    const st = normalizeStatus(item && item.status);
    return st !== 'aceita' && st !== 'rejeitada';
  }

  init();

  function init(){
    bindEvents();
    bindCrossModuleEvents();
    hydrateUnidades().then(initialUnit => {
      if(initialUnit){
        loadHabitacoes(initialUnit);
      } else {
        renderEmptyState(true);
      }
    });
  }

  function bindCrossModuleEvents(){
    window.addEventListener('wdg-servico-status-change', evt => {
      const detail = evt?.detail || {};
      const id = detail.id ? String(detail.id) : '';
      const habId = detail.habitacaoId ? String(detail.habitacaoId) : '';
      if(!id) return;
      const hab = habId ? getHabById(habId) : null;
      if(hab && Array.isArray(hab.solicitacoes_servico)){
        hab.solicitacoes_servico = hab.solicitacoes_servico.filter(item => String(item && item._id || '') !== id);
        applyFilters();
        showToast('Solicitação atualizada.', 'success');
      }
    });
  }

  function bindEvents(){
    if(refs.filterForm){
      refs.filterForm.addEventListener('submit', evt => evt.preventDefault());
    }
    if(refs.filterUnidade){
      refs.filterUnidade.addEventListener('change', () => {
        const unidadeId = refs.filterUnidade.value || '';
        state.currentUnidade = unidadeId;
        resetDependentFilters();
        if(unidadeId){
          loadHabitacoes(unidadeId);
        } else {
          state.habitacoes = [];
          applyFilters();
        }
      });
    }
    if(refs.filterBloco){
      refs.filterBloco.addEventListener('change', () => applyFilters());
    }
    if(refs.filterAndar){
      refs.filterAndar.addEventListener('change', () => applyFilters());
    }
    if(refs.filterSearch){
      refs.filterSearch.addEventListener('input', () => {
        clearTimeout(state.searchDebounce);
        state.searchDebounce = setTimeout(() => applyFilters(), 250);
      });
    }
    if(refs.buttons.refresh){
      refs.buttons.refresh.addEventListener('click', () => {
        if(state.currentUnidade){
          loadHabitacoes(state.currentUnidade, { silentStats: true });
        } else {
          showToast('Selecione um condomínio para atualizar os dados.');
        }
      });
    }
    if(refs.buttons.reset){
      refs.buttons.reset.addEventListener('click', () => {
        resetFilters();
        applyFilters();
      });
    }
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
    if(refs.grid){
      refs.grid.addEventListener('click', evt => {
        const button = evt.target.closest('button[data-action]');
        if(!button) return;
        const card = button.closest('.wdg-hab-card');
        const habId = card ? card.dataset.id : null;
        const action = button.getAttribute('data-action');
        handleCardAction(action, habId, card, button);
      });
    }

    if(refs.moradorAcessoConfirmar){
      refs.moradorAcessoConfirmar.addEventListener('click', submitMoradorAcesso);
    }
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
      console.error('[painel_habitacao] unidades erro', err);
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
    let hasDefaultOption = false;
    options.forEach(unit => {
      const option = document.createElement('option');
      option.value = unit && unit._id ? String(unit._id) : '';
      if(option.value && defaultUnit && option.value === defaultUnit) hasDefaultOption = true;
      const parts = [];
      if(unit && unit.codigo) parts.push(unit.codigo);
      if(unit && unit.nome) parts.push(unit.nome);
      option.textContent = parts.length ? parts.join(' · ') : (unit && unit._id ? unit._id : 'Condomínio');
      select.appendChild(option);
    });
    if(defaultUnit && !hasDefaultOption){
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

  async function loadHabitacoes(unidadeId, opts){
    if(!unidadeId){
      state.habitacoes = [];
      rebuildHabIndex();
      applyFilters();
      return;
    }
    const options = opts || {};
    setGridLoading(true);
    try{
      const params = new URLSearchParams({ unidade: unidadeId, _: Date.now() });
      const res = await fetch(withBase(`/api/habitacoes/busca?${params}`));
      if(!res.ok) throw new Error('Falha ao carregar habitações');
      const data = await res.json();
      state.habitacoes = Array.isArray(data)
        ? data.map(h => {
            const svc = Array.isArray(h?.solicitacoes_servico) ? h.solicitacoes_servico.filter(isServicoAtivo) : [];
            return { ...h, solicitacoes_servico: svc };
          })
        : [];
      rebuildHabIndex();
      updateDependentCombos();
      refreshQuickFilters();
      applyFilters();
      if(!options.silentStats){
        showToast(`Atualizado com ${state.habitacoes.length} habitações.`);
      }
    } catch(err){
      console.error('[painel_habitacao] habitações erro', err);
      state.habitacoes = [];
      rebuildHabIndex();
      applyFilters();
      showToast('Não foi possível carregar as habitações deste condomínio.', 'danger');
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
    wrapper.className = 'wdg-hab-card wdg-hab-skeleton';
    wrapper.innerHTML = '<div class="wdg-hab-skeleton" style="height:24px;width:60%;margin-bottom:1rem;"></div>' +
      '<div class="wdg-hab-skeleton" style="height:12px;width:90%;margin-bottom:.5rem;"></div>' +
      '<div class="wdg-hab-skeleton" style="height:12px;width:70%;margin-bottom:.5rem;"></div>' +
      '<div class="wdg-hab-skeleton" style="height:12px;width:80%;margin-bottom:.5rem;"></div>' +
      '<div class="wdg-hab-skeleton" style="height:40px;width:100%;"></div>';
    return wrapper;
  }

  function resetFilters(){
    if(refs.filterSearch) refs.filterSearch.value = '';
    if(refs.filterBloco) refs.filterBloco.value = '';
    if(refs.filterAndar) refs.filterAndar.value = '';
    state.activeQuickFilter = null;
    updateQuickFilterVisuals();
  }

  function resetDependentFilters(){
    if(refs.filterBloco){
      refs.filterBloco.innerHTML = '<option value="">Selecione um condomínio</option>';
      refs.filterBloco.disabled = true;
    }
    if(refs.filterAndar){
      refs.filterAndar.innerHTML = '<option value="">Selecione um condomínio</option>';
      refs.filterAndar.disabled = true;
    }
  }

  function updateDependentCombos(){
    hydrateOptionsFromCollection(refs.filterBloco, 'bloco', 'Todos os blocos');
    hydrateOptionsFromCollection(refs.filterAndar, 'andar', 'Todos os andares');
  }

  function hydrateOptionsFromCollection(selectEl, key, fallbackLabel){
    if(!selectEl) return;
    const uniqueItems = new Map();
    state.habitacoes.forEach(h => {
      const node = h && h[key];
      if(!node) return;
      const id = node._id || node.id;
      if(!id) return;
      const label = node.nome || node.codigo || `ID ${id}`;
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
      chip.className = 'wdg-hab-chip';
      chip.dataset.quickFilter = cfg.id;
      chip.innerHTML = `${cfg.icon || ''}${cfg.label}`;
      refs.quickFilters.appendChild(chip);
    });
    updateQuickFilterVisuals();
  }

  function buildQuickFilterConfigs(){
    const collection = state.habitacoes || [];
    if(!collection.length) return [];
    const configs = [
      { id: 'livres', label: 'Disponíveis agora', predicate: h => !h.alugado, icon: '<i class="bi bi-lightning-charge me-1"></i>' },
      { id: 'locadas', label: 'Locadas', predicate: h => !!h.alugado, icon: '<i class="bi bi-key me-1"></i>' },
      { id: 'sem-moradores', label: 'Sem moradores', predicate: h => !(Array.isArray(h.moradores) && h.moradores.length), icon: '<i class="bi bi-emoji-neutral me-1"></i>' },
      { id: 'com-pets', label: 'Com pets', predicate: h => Array.isArray(h.pets) && h.pets.length > 0, icon: '<i class="bi bi-heart me-1"></i>' }
    ];
    return configs.filter(cfg => collection.some(cfg.predicate));
  }

  function updateQuickFilterVisuals(){
    if(!refs.quickFilters) return;
    const children = Array.from(refs.quickFilters.querySelectorAll('[data-quick-filter]'));
    children.forEach(node => {
      const id = node.getAttribute('data-quick-filter');
      node.classList.toggle('is-active', state.activeQuickFilter === id);
    });
  }

  function applyFilters(){
    const collection = state.habitacoes || [];
    if(!collection.length){
      state.filtered = [];
      refs.grid.innerHTML = '';
      renderEmptyState(true);
      updateStats();
      return;
    }
    const blocoId = refs.filterBloco ? refs.filterBloco.value : '';
    const andarId = refs.filterAndar ? refs.filterAndar.value : '';
    const search = (refs.filterSearch ? refs.filterSearch.value : '').trim().toLowerCase();

    let filtered = collection.slice();
    if(blocoId) filtered = filtered.filter(h => (h.bloco && String(h.bloco._id || h.bloco.id) === blocoId));
    if(andarId) filtered = filtered.filter(h => (h.andar && String(h.andar._id || h.andar.id) === andarId));
    if(search){
      filtered = filtered.filter(h => {
        const bucket = [h.numero, h.tipo, h.descricao];
        if(h.bloco && h.bloco.nome) bucket.push(h.bloco.nome);
        if(h.andar && h.andar.nome) bucket.push(h.andar.nome);
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
    state.filtered.forEach(h => {
      frag.appendChild(buildCard(h));
    });
    refs.grid.appendChild(frag);
  }

  function rebuildHabIndex(){
    const entries = Array.isArray(state.habitacoes) ? state.habitacoes : [];
    state.habIndex = new Map(entries.map(h => [String(h._id), h]));
  }

  function getHabById(habId){
    if(!habId) return null;
    const key = String(habId);
    if(state.habIndex.has(key)) return state.habIndex.get(key);
    return (state.habitacoes || []).find(h => String(h._id) === key) || null;
  }

  function buildCard(hab){
    const card = document.createElement('article');
    card.className = 'wdg-hab-card';
    card.dataset.id = hab && hab._id ? String(hab._id) : '';
    const blocoLabel = hab && hab.bloco && (hab.bloco.nome || hab.bloco.codigo);
    const andarLabel = hab && hab.andar && (hab.andar.nome || hab.andar.codigo);
    const numero = hab && hab.numero ? String(hab.numero) : 'Sem referência';
    const tipo = hab && hab.tipo ? String(hab.tipo) : '';
    const moradores = Array.isArray(hab && hab.moradores) ? hab.moradores : [];
    const habitada = moradores.length > 0;
    const contratoAtual = resolveContratoAtivo(hab);
    const hasContratoAtivo = !!(contratoAtual && contratoAtual.contrato);
    const hasInquilino = moradores.some(m => !!m.inquilino);
    const flaggedLocacao = !!(hab && hab.alugado);
    const isLocada = habitada && (hasInquilino || flaggedLocacao || hasContratoAtivo);
    const ocupacaoState = !habitada ? 'vaga' : (isLocada ? 'locado' : 'proprio');
    const occupancyContext = !habitada ? 'Livre' : (isLocada ? 'Contrato ativo' : 'Uso próprio');
    card.dataset.status = ocupacaoState;
    const statusClass = `status-${ocupacaoState}`;
    const statusLabel = habitada ? (isLocada ? 'Habitada · Locada' : 'Habitada · Própria') : 'Não habitada';
    const ocupacaoLabel = habitada ? `${moradores.length} ${moradores.length === 1 ? 'morador' : 'moradores'}` : 'Sem moradores vinculados';
    const owner = hab && hab.proprietario && hab.proprietario.nome ? hab.proprietario.nome : '';
    const pets = Array.isArray(hab && hab.pets) ? hab.pets : [];
    const veiculos = Array.isArray(hab && hab.veiculos) ? hab.veiculos : [];
    const garagemLines = resolveGaragemInfo(hab);
    const visitasHtml = buildSolicitacoesVisitaHtml(hab);
    const habLabel = buildHabLabelText(hab);
    if(habLabel) card.dataset.label = habLabel;

    const metaChunks = [];
    if(blocoLabel) metaChunks.push(`Bloco ${escapeHtml(blocoLabel)}`);
    if(andarLabel) metaChunks.push(`Andar ${escapeHtml(andarLabel)}`);
    if(tipo) metaChunks.push(escapeHtml(tipo));

    const tags = [];
    if(!habitada) tags.push('Disponível para ocupação');
    else if(isLocada) tags.push('Contrato ativo');
    tags.push(ocupacaoLabel);
    if(pets.length) tags.push(`${pets.length} ${pets.length === 1 ? 'pet' : 'pets'}`);
    if(hab && hab.pendencia_financeira) tags.push('Pendência financeira');

    const moradoresHtml = buildMoradoresList(hab, moradores);

    const vehicleHtml = buildVehicleList(hab);
    const petHtml = buildPetList(hab);
    const garagemHtml = buildGaragemList(hab);

    const ownerEntry = {
      label: 'Proprietário',
      value: owner ? [owner] : ['Sem proprietário cadastrado'],
      fullRow: true
    };

    const metaItems = [
      ownerEntry,
      moradoresHtml
        ? { label: 'Moradores', html: moradoresHtml, fullRow: true }
        : { label: 'Moradores', value: ['Sem moradores cadastrados'], fullRow: true, scrollable: true },
      vehicleHtml
        ? { label: 'Veículos', html: vehicleHtml, fullRow: true }
        : { label: 'Veículos', value: veiculos.length ? veiculos.map(v => v.placa || v.modelo || 'Veículo') : ['Sem veículos cadastrados'], fullRow: true, scrollable: true },
      petHtml
        ? { label: 'Pets', html: petHtml, fullRow: true }
        : { label: 'Pets', value: pets.length ? pets.map(p => p.nome || 'Pet') : ['Sem pets cadastrados'], fullRow: true, scrollable: true },
      garagemHtml
        ? { label: 'Vagas de garagem', html: garagemHtml, fullRow: true }
        : { label: 'Vagas de garagem', value: garagemLines, fullRow: true, scrollable: true },
      visitasHtml
        ? { label: 'Solicitações / Permissões de visita', html: visitasHtml, fullRow: true, scrollable: true }
        : { label: 'Solicitações / Permissões de visita', value: ['Sem registros recentes'], fullRow: true, scrollable: true }
    ].filter(Boolean);

    const timelineItems = buildHabTimeline(hab, contratoAtual, isLocada);

    const tagsHtml = tags.map(tag => `<span class="wdg-hab-tag">${escapeHtml(tag)}</span>`).join('');
    const metaHtml = metaItems.length
      ? metaItems.map(item => `
          <article class="wdg-hab-meta-item${item.fullRow ? ' is-wide' : ''}"${item.scrollable ? ' data-scrollable="true"' : ''}>
            <span>${escapeHtml(item.label)}</span>
            ${item.html ? item.html : renderMetaValue(item.value)}
          </article>`).join('')
      : `<article class="wdg-hab-meta-item"><span>Dados</span><strong>Sem detalhes</strong></article>`;
    const timelineHtml = (timelineItems.length ? timelineItems : [{ label: 'Status', value: statusLabel }])
      .map(item => {
        const toneAttr = item.tone ? ` class="${item.tone}"` : '';
        return `
        <li${toneAttr}>
          <small>${escapeHtml(item.label)}</small>
          <span>${escapeHtml(item.value)}</span>
        </li>`;
      }).join('');

    card.innerHTML = `
      <div class="wdg-hab-card-head">
        <div>
          <div class="wdg-hab-card-topline">
            <p class="wdg-hab-card-title">${escapeHtml(numero)}</p>
            <span class="wdg-hab-card-status ${statusClass}">${statusLabel}</span>
          </div>
          <p class="wdg-hab-card-meta">${metaChunks.join(' · ') || 'Sem identificação complementar'}</p>
        </div>
        <div class="wdg-hab-occupancy">
          <span class="wdg-hab-occupancy-label ${habitadasClass(ocupacaoState)}">${escapeHtml(occupancyContext)}</span>
        </div>
      </div>
      <div class="wdg-hab-tag-row">${tagsHtml}</div>
      <div class="wdg-hab-meta-grid">${metaHtml}</div>
      <ul class="wdg-hab-timeline">${timelineHtml}</ul>
      <div class="wdg-hab-card-actions">
        <div class="wdg-hab-card-icon-actions">
          ${buildPrimaryActionButton('hab-details', 'Detalhes da habitação', 'detalhe')}
          ${buildPrimaryActionButton('reservas', 'Reservas', 'reservado')}
        </div>
        <div class="wdg-hab-card-secondary-actions">
          ${buildPrimaryActionButton('visit', 'Comunicar visitante', 'visita')}
          ${buildPrimaryActionButton('service', 'Solicitar serviço', 'servicos')}
        </div>
      </div>
    `;
    return card;
  }

  function buildMoradoresList(hab, moradores){
    const list = Array.isArray(moradores) ? moradores : [];
    if(!list.length) return '';
    const habId = hab && hab._id ? String(hab._id) : '';
    const rows = list.map((m) => {
      const mid = m && m._id ? String(m._id) : '';
      const nome = escapeHtml(m && m.nome ? m.nome : 'Morador');
      const presente = !!(m && m.acesso_presente);
      const chipClass = presente ? 'is-presente' : 'is-ausente';
      const chipLabel = presente ? 'Presente' : 'Ausente';
      const chipIcon = presente ? 'bi bi-check-circle-fill' : 'bi bi-x-circle-fill';
      return `
        <div class="wdg-hab-inline-row">
          <button class="wdg-hab-inline-row-btn" type="button" data-action="morador-acesso" data-hab-id="${escapeHtml(habId)}" data-morador-id="${escapeHtml(mid)}" data-presente="${presente ? 'true' : 'false'}" aria-label="${nome}">
            <div class="wdg-hab-inline-text">
              <span class="wdg-hab-presenca-chip ${chipClass}"><i class="${chipIcon}" aria-hidden="true"></i>${chipLabel}</span>
              <strong>${nome}</strong>
            </div>
          </button>
        </div>
      `;
    }).join('');
    return `<div class="wdg-hab-inline-list">${rows}</div>`;
  }

  function renderMetaValue(value){
    if(Array.isArray(value)){
      if(!value.length) return '<strong>Sem registros</strong>';
      return `<div class="wdg-hab-meta-stack">${value.map(line => `<span class="wdg-hab-meta-line">${escapeHtml(line)}</span>`).join('')}</div>`;
    }
    const safeValue = value == null || value === '' ? 'Sem registros' : value;
    return `<strong>${escapeHtml(safeValue)}</strong>`;
  }

  function formatProtocolo10(value){
    const v = String(value || '').replace(/\D/g,'');
    if(!v) return '';
    return v.slice(-10).padStart(10,'0');
  }

  function resolveItemTimestampMs(item){
    if(!item) return 0;
    const candidates = [
      item.createdAt,
      item.created_at,
      item.updatedAt,
      item.updated_at,
      item.atualizado_em,
      item.periodoInicio,
      item.inicio,
      item.data,
      item.date
    ].filter(Boolean);
    for(const c of candidates){
      const t = Date.parse(String(c));
      if(Number.isFinite(t)) return t;
    }
    return 0;
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
    return new Date(parts.y, parts.m, parts.d, 23, 59, 59, 999);
  }

  function sameLocalDay(a, b){
    if(!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function resolveVisitaWindow(item){
    const created = item?.createdAt ? new Date(item.createdAt) : null;
    const startRaw = item?.periodoInicio || item?.inicio || null;
    const endRaw = item?.periodoFim || item?.fim || null;
    const startDay = resolveLocalDayStart(startRaw);
    const endDay = resolveLocalDayEnd(endRaw);

    let start = startDay;
    if(created && Number.isFinite(created.getTime()) && startDay && sameLocalDay(created, startDay)){
      start = created;
    }
    const end = endDay;
    return {
      start: start && Number.isFinite(start.getTime()) ? start : null,
      end: end && Number.isFinite(end.getTime()) ? end : null,
      created: created && Number.isFinite(created.getTime()) ? created : null
    };
  }

  function buildSolicitacoesVisitaHtml(hab){
    const solicitacoes = Array.isArray(hab && hab.solicitacoes_visita) ? hab.solicitacoes_visita : [];
    const permissoes = Array.isArray(hab && hab.permissoes_visita) ? hab.permissoes_visita : [];
    const servicos = Array.isArray(hab && hab.solicitacoes_servico) ? hab.solicitacoes_servico.filter(isServicoAtivo) : [];

    const visitItems = [...solicitacoes, ...permissoes].filter(Boolean);
    const hasAny = visitItems.length || servicos.length;
    if(!hasAny) return '';

    const visitaIcon = iconPath('visita');
    const servicoIcon = iconPath('servicos');

    const now = Date.now();
    const all = [];

    visitItems.forEach(item => {
      const id = String(item?._id || '').trim();
      if(id) state.visitaIndex.set(id, item);

      const win = resolveVisitaWindow(item);
      const startMs = win.start ? win.start.getTime() : null;
      const endMs = win.end ? win.end.getTime() : null;
      const hasPeriod = !!(startMs != null && endMs != null);

      if(hasPeriod){
        if(now < startMs) return;
        if(now > endMs) return;
      }

      const ts = (win.created ? win.created.getTime() : null) || resolveItemTimestampMs(item);
      const isNew = id ? !seenVisitas.has(id) : ((ts ? (now - ts) : Number.POSITIVE_INFINITY) <= DAY_IN_MS);
      const nome = String(item?.visitanteNome || item?.nome || item?.visitante || '').trim() || 'Visita';
      const finalidade = String(item?.finalidadeLabel || item?.finalidade || '').trim();
      const inicio = win.start ? win.start.toISOString() : String(item?.periodoInicio || item?.inicio || '').trim();
      const fim = win.end ? win.end.toISOString() : String(item?.periodoFim || item?.fim || '').trim();
      const range = [inicio ? formatDateBr(inicio) : '', fim ? formatDateBr(fim) : ''].filter(Boolean).join(' - ');
      const label = finalidade ? `${nome} · ${finalidade}` : nome;
      const sub = range || (ts ? `Criado em ${formatDateBr(new Date(ts).toISOString()) || ''}`.trim() : '');
      all.push({ kind: 'visita', ts, isNew, label, sub, item, id });
    });

    servicos.forEach(item => {
      const id = item && item._id ? String(item._id) : '';
      if(!id) return;
      const ts = resolveItemTimestampMs(item);
      const isNew = item && item.nova !== false;
      const proto = formatProtocolo10(item.protocolo || '');
      const assunto = String(item?.titulo || '').trim();
      const base = `Solicitação de serviço nº ${proto || '0000000000'}`;
      const label = assunto ? `${base} · ${assunto}` : base;
      all.push({ kind: 'servico', ts, isNew, label, sub: '', id });
    });

    all.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    const rows = all.slice(0, 10).map(entry => {
      const markerLabel = entry.isNew ? 'Novo' : 'Já visto';
      const markerClass = entry.isNew ? 'is-new' : 'is-old';

      if(entry.kind === 'servico'){
        return `
          <button type="button" class="wdg-hab-inline-row wdg-hab-inline-row-btn" data-kind="servico" data-action="servico-portal" data-servico-id="${escapeHtml(entry.id)}" aria-label="${escapeHtml(entry.label)}" title="${escapeHtml(entry.label)}">
            <span class="wdg-hab-inline-marker ${markerClass}" role="img" aria-label="${escapeHtml(markerLabel)}" title="${escapeHtml(markerLabel)}"></span>
            <span class="wdg-hab-inline-icon-btn" aria-hidden="true">${servicoIcon ? `<img src="${servicoIcon}" alt="">` : ''}</span>
            <span class="wdg-hab-inline-text"><strong>${escapeHtml(entry.label)}</strong></span>
          </button>
        `;
      }

      return `
        <button type="button" class="wdg-hab-inline-row wdg-hab-inline-row-btn" data-kind="visita" data-action="visita-info" data-visita-id="${escapeHtml(entry.id || '')}" aria-label="${escapeHtml(entry.label)}" title="${escapeHtml(entry.label)}">
          <span class="wdg-hab-inline-marker ${markerClass}" role="img" aria-label="${escapeHtml(markerLabel)}" title="${escapeHtml(markerLabel)}"></span>
          <span class="wdg-hab-inline-icon-btn" aria-hidden="true">${visitaIcon ? `<img src="${visitaIcon}" alt="">` : ''}</span>
          <span class="wdg-hab-inline-text">
            <strong>${escapeHtml(entry.label)}</strong>
            ${entry.sub ? `<small>${escapeHtml(entry.sub)}</small>` : ''}
          </span>
        </button>
      `;
    }).filter(Boolean).join('') || '<strong>Sem registros recentes</strong>';

    return `<div class="wdg-hab-inline-list">${rows}</div>`;
  }

  function buildPrimaryActionButton(action, label, iconName, options){
    const icon = iconPath(iconName);
    const count = options && Number.isFinite(options.count) ? options.count : null;
    const disabled = options && options.disabled;
    const attrs = disabled ? ' disabled' : '';
    const safeLabel = label || 'Ação';
    return `
      <div class="wdg-hab-icon-pod">
        <button type="button" class="wdg-icon-btn wdg-hab-icon-btn" data-action="${action}" title="${escapeHtml(safeLabel)}" aria-label="${escapeHtml(safeLabel)}"${attrs}>
          ${icon ? `<img src="${icon}" alt="${escapeHtml(safeLabel)}">` : ''}
        </button>
        ${count ? `<span class="wdg-hab-action-count">${escapeHtml(String(count))}</span>` : ''}
      </div>`;
  }

  function buildVehicleList(hab){
    const list = Array.isArray(hab && hab.veiculos) ? hab.veiculos : [];
    if(!list.length) return '';
    const icon = iconPath('veiculo');
    return `<div class="wdg-hab-inline-list">${list.map((veic, idx) => {
      const label = veic && (veic.placa || veic.placa_original || veic.modelo) ? (veic.placa || veic.placa_original || veic.modelo) : `Veículo ${idx + 1}`;
      const parts = [];
      if(veic && veic.tipo) parts.push(veic.tipo);
      const marcaModelo = [veic && veic.marca, veic && veic.modelo].filter(Boolean).join(' / ');
      if(marcaModelo) parts.push(marcaModelo);
      return renderInlineRow('vehicle', idx, icon, label, parts.join(' · '));
    }).join('')}</div>`;
  }

  function buildPetList(hab){
    const list = Array.isArray(hab && hab.pets) ? hab.pets : [];
    if(!list.length) return '';
    const icon = iconPath('pet');
    return `<div class="wdg-hab-inline-list">${list.map((pet, idx) => {
      const label = pet && pet.nome ? pet.nome : `Pet ${idx + 1}`;
      const subtitle = [pet && pet.especie, pet && pet.raca].filter(Boolean).join(' · ');
      return renderInlineRow('pet', idx, icon, label, subtitle);
    }).join('')}</div>`;
  }

  function buildGaragemList(hab){
    const list = Array.isArray(hab && hab.vagas_garagem) ? hab.vagas_garagem : [];
    if(!list.length) return '';
    const icon = iconPath('garagem');
    return `<div class="wdg-hab-inline-list">${list.map((vaga, idx) => {
      const label = vaga && (vaga.nome || vaga.codigo) ? (vaga.nome || vaga.codigo) : `Vaga ${idx + 1}`;
      const subtitle = vaga && vaga.ativa === false ? 'Inativa' : 'Ativa';
      return renderInlineRow('garage', idx, icon, label, subtitle);
    }).join('')}</div>`;
  }

  function renderInlineRow(action, index, icon, label, subtitle){
    const resolvedLabel = label || 'Registro';
    const accessible = `${resolvedLabel} · abrir`;
    return `
      <div class="wdg-hab-inline-row">
        <button type="button" class="wdg-icon-btn wdg-hab-inline-icon-btn" data-action="${action}" data-index="${index}" aria-label="${escapeHtml(accessible)}" title="${escapeHtml(accessible)}">
          ${icon ? `<img src="${icon}" alt="${escapeHtml(resolvedLabel)}">` : ''}
        </button>
        <div class="wdg-hab-inline-text">
          <strong>${escapeHtml(resolvedLabel)}</strong>
          ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}
        </div>
      </div>`;
  }

  function resolveGaragemInfo(hab){
    const explicitVagas = Array.isArray(hab && hab.vagas_garagem) ? hab.vagas_garagem : [];
    const veiculos = Array.isArray(hab && hab.veiculos) ? hab.veiculos : [];
    const legacyLabel = hab && (hab.garagem_nome || hab.garagem_codigo) ? [hab.garagem_nome || hab.garagem_codigo] : [];
    const labels = [];
    explicitVagas.forEach(vaga => {
      if(!vaga) return;
      const label = vaga.nome || vaga.codigo || vaga.identificacao || vaga.label;
      if(label) labels.push(label);
    });
    veiculos.forEach(veiculo => {
      if(!veiculo) return;
      const label = veiculo.garagem_nome || veiculo.garagem_codigo || veiculo.garagem;
      if(label) labels.push(label);
    });
    legacyLabel.forEach(text => { if(text) labels.push(text); });
    if(labels.length){
      return Array.from(new Set(labels)).map(text => `Vaga ${text}`);
    }
    if(veiculos.length){
      return [`${veiculos.length} ${veiculos.length === 1 ? 'veículo associado' : 'veículos associados'}`, 'Nenhuma vaga identificada'];
    }
    return ['Nenhuma vaga vinculada'];
  }

  function buildHabLabelText(hab){
    if(!hab || typeof hab !== 'object') return '';
    const parts = [];
    const unidadeLabel = buildUnidadeLabel(hab.unidade);
    if(unidadeLabel) parts.push(unidadeLabel);
    if(hab.bloco && (hab.bloco.nome || hab.bloco.codigo)) parts.push(`Bloco ${hab.bloco.nome || hab.bloco.codigo}`);
    if(hab.andar && (hab.andar.nome || hab.andar.codigo)) parts.push(hab.andar.nome || hab.andar.codigo);
    if(hab.numero) parts.push(`Hab. ${hab.numero}`);
    return parts.filter(Boolean).join(' · ');
  }

  function buildUnidadeLabel(unidade){
    if(!unidade || typeof unidade !== 'object') return '';
    const parts = [];
    if(unidade.codigo) parts.push(unidade.codigo);
    if(unidade.nome) parts.push(unidade.nome);
    return parts.length ? parts.join(' - ') : (unidade.nome || unidade.codigo || '');
  }

  function openHabitacaoDetails(hab){
    const modal = document.getElementById('modalDetHabCad');
    if(!modal){ showToast('Modal de detalhes indisponível.', 'danger'); return; }
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if(el) el.textContent = value != null && value !== '' ? value : '—';
    };
    setText('detUnidade', buildUnidadeLabel(hab.unidade) || '—');
    setText('detTipo', hab && hab.tipo ? hab.tipo : '—');
    setText('detBloco', hab && hab.bloco && (hab.bloco.nome || hab.bloco.codigo) ? hab.bloco.nome || hab.bloco.codigo : '—');
    setText('detAndar', hab && hab.andar && (hab.andar.nome || hab.andar.codigo) ? hab.andar.nome || hab.andar.codigo : '—');
    setText('detNumero', hab && hab.numero ? hab.numero : '—');
    setText('detArea', hab && hab.area_m2 != null ? `${hab.area_m2} m²` : '—');
    setText('detFracao', hab && hab.fracao_ideal != null ? `${hab.fracao_ideal}%` : '—');
    const desc = document.getElementById('detDesc');
    if(desc) desc.textContent = hab && hab.descricao ? hab.descricao : 'Sem descrição cadastrada.';
    const foto = document.getElementById('detFoto');
    const fotoVazio = document.getElementById('detFotoVazio');
    if(foto && fotoVazio){
      if(hab && hab.foto){
        foto.src = hab.foto;
        foto.classList.remove('d-none');
        fotoVazio.classList.add('d-none');
      } else {
        foto.src = '';
        foto.classList.add('d-none');
        fotoVazio.classList.remove('d-none');
      }
    }
    try{
      if(typeof bootstrap !== 'undefined' && bootstrap.Modal){
        bootstrap.Modal.getOrCreateInstance(modal).show();
      } else {
        modal.classList.add('show');
      }
    }catch(err){ console.warn('[painel_habitacao] modal detalhes hab falhou', err); }
  }

  function openVehicleDetails(hab, button){
    if(!window.WDG_VEIC_DET || typeof window.WDG_VEIC_DET.abrir !== 'function'){
      showToast('Modal de veículos indisponível.', 'danger');
      return;
    }
    const index = button && typeof button.dataset.index !== 'undefined' ? parseInt(button.dataset.index, 10) : -1;
    const veiculos = Array.isArray(hab && hab.veiculos) ? hab.veiculos : [];
    const vehicle = veiculos[index];
    if(!vehicle){
      showToast('Veículo não encontrado para esta habitação.', 'warning');
      return;
    }
    try {
      window.WDG_VEIC_DET.abrir(vehicle, { habitacao: hab, habLabel: buildHabLabelText(hab) });
    } catch(err){
      console.error('[painel_habitacao] falha ao abrir veículo', err);
      showToast('Não foi possível abrir o veículo selecionado.', 'danger');
    }
  }

  function openPetDetails(hab, button){
    if(!window.WDG_PET_DET || typeof window.WDG_PET_DET.abrir !== 'function'){
      showToast('Modal de pets indisponível.', 'danger');
      return;
    }
    const index = button && typeof button.dataset.index !== 'undefined' ? parseInt(button.dataset.index, 10) : -1;
    const pets = Array.isArray(hab && hab.pets) ? hab.pets : [];
    const pet = pets[index];
    if(!pet){
      showToast('Pet não encontrado para esta habitação.', 'warning');
      return;
    }
    try {
      window.WDG_PET_DET.abrir(pet, { habitacao: hab, habLabel: buildHabLabelText(hab) });
    } catch(err){
      console.error('[painel_habitacao] falha ao abrir pet', err);
      showToast('Não foi possível abrir o pet selecionado.', 'danger');
    }
  }

  function openGarageDetails(hab, button){
    const modal = document.getElementById('modalDetGarCad');
    if(!modal){ showToast('Modal de garagem indisponível.', 'danger'); return; }
    const index = button && typeof button.dataset.index !== 'undefined' ? parseInt(button.dataset.index, 10) : -1;
    const vagas = Array.isArray(hab && hab.vagas_garagem) ? hab.vagas_garagem : [];
    const vaga = vagas[index];
    if(!vaga){
      showToast('Vaga de garagem não encontrada.', 'warning');
      return;
    }
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if(el) el.textContent = value != null && value !== '' ? value : '—';
    };
    setText('detGUnidade', buildUnidadeLabel(hab.unidade) || '—');
    setText('detGNome', vaga.nome || vaga.codigo || 'Vaga');
    setText('detGVinc', buildHabLabelText(hab) || '—');
    const obs = document.getElementById('detGObs');
    if(obs) obs.textContent = vaga.obs || 'Sem observações.';
    const foto = document.getElementById('detGFoto');
    const fotoVazio = document.getElementById('detGFotoVazio');
    if(foto && fotoVazio){
      if(vaga.foto){
        foto.src = vaga.foto;
        foto.classList.remove('d-none');
        fotoVazio.classList.add('d-none');
      } else {
        foto.src = '';
        foto.classList.add('d-none');
        fotoVazio.classList.remove('d-none');
      }
    }
    try{
      if(typeof bootstrap !== 'undefined' && bootstrap.Modal){
        bootstrap.Modal.getOrCreateInstance(modal).show();
      } else {
        modal.classList.add('show');
      }
    }catch(err){ console.warn('[painel_habitacao] modal garagem falhou', err); }
  }

  async function openReservasModal(hab){
    if(!refs.reservasModal){
      showToast('Modal de reservas indisponível.', 'danger');
      return;
    }
    const habLabel = buildHabLabelText(hab);
    if(refs.reservasTitle) refs.reservasTitle.textContent = `Reservas · ${hab && hab.numero ? hab.numero : 'Habitação'}`;
    if(refs.reservasSubtitle) refs.reservasSubtitle.textContent = habLabel || '';
    if(refs.reservasList) refs.reservasList.innerHTML = '';
    if(refs.reservasEmpty) refs.reservasEmpty.classList.add('d-none');
    if(refs.reservasLoading) refs.reservasLoading.classList.remove('d-none');
    try{
      if(typeof bootstrap !== 'undefined' && bootstrap.Modal){
        bootstrap.Modal.getOrCreateInstance(refs.reservasModal).show();
      }
    }catch(err){ console.warn('[painel_habitacao] modal reservas falhou', err); }
    const key = hab && hab._id ? String(hab._id) : '';
    if(!key){
      renderReservasList([]);
      return;
    }
    if(state.reservasCache.has(key)){
      if(refs.reservasLoading) refs.reservasLoading.classList.add('d-none');
      renderReservasList(state.reservasCache.get(key));
      return;
    }
    try{
      const payload = await fetchHabitacaoReservas(key);
      const reservas = payload && Array.isArray(payload.reservas) ? payload.reservas : [];
      state.reservasCache.set(key, reservas);
      if(refs.reservasLoading) refs.reservasLoading.classList.add('d-none');
      renderReservasList(reservas);
    } catch(err){
      console.error('[painel_habitacao] reservas erro', err);
      if(refs.reservasLoading) refs.reservasLoading.classList.add('d-none');
      if(refs.reservasEmpty){
        refs.reservasEmpty.textContent = 'Não foi possível carregar as reservas agora.';
        refs.reservasEmpty.classList.remove('d-none');
      }
      showToast('Falha ao carregar reservas da habitação.', 'danger');
    }
  }

  function renderReservasList(reservas){
    if(!refs.reservasList || !refs.reservasEmpty) return;
    if(!Array.isArray(reservas) || !reservas.length){
      refs.reservasList.innerHTML = '';
      refs.reservasEmpty.textContent = 'Nenhuma reserva encontrada para esta habitação.';
      refs.reservasEmpty.classList.remove('d-none');
      return;
    }
    refs.reservasEmpty.classList.add('d-none');
    refs.reservasList.innerHTML = reservas.map(renderReservaCard).join('');
  }

  function renderReservaCard(item){
    const areaLabel = item && item.area ? [item.area.nome, item.area.codigo].filter(Boolean).join(' · ') : 'Área comum';
    const dateRange = formatReservaDateRange(item);
    const hourRange = formatReservaHourRange(item);
    const metaParts = [];
    if(dateRange) metaParts.push(`<span><i class="bi bi-calendar3"></i> ${escapeHtml(dateRange)}</span>`);
    if(hourRange) metaParts.push(`<span><i class="bi bi-clock"></i> ${escapeHtml(hourRange)}</span>`);
    if(item && item.morador_nome) metaParts.push(`<span><i class="bi bi-person"></i> ${escapeHtml(item.morador_nome)}</span>`);
    const badges = [];
    if(item && item.termo_status) badges.push(`<span class="badge bg-light text-dark">Termo: ${escapeHtml(item.termo_status)}</span>`);
    if(item && item.pagamento_status_label) badges.push(`<span class="badge bg-primary-subtle text-primary">${escapeHtml(item.pagamento_status_label)}</span>`);
    return `
      <article class="wdg-hab-reserva-card">
        <div class="wdg-hab-reserva-top">
          <strong>${escapeHtml(areaLabel)}</strong>
          ${badges.length ? `<div class="wdg-hab-reserva-status">${badges.join('')}</div>` : ''}
        </div>
        ${metaParts.length ? `<div class="wdg-hab-reserva-meta">${metaParts.join('')}</div>` : ''}
        ${item && item.observacao ? `<p class="wdg-hab-reserva-note">${escapeHtml(item.observacao)}</p>` : ''}
      </article>`;
  }

  function formatReservaDateRange(item){
    if(!item) return '';
    const start = formatDateBr(item.date);
    const end = formatDateBr(item.date_end);
    if(start && end && start !== end) return `${start} · ${end}`;
    return start || end || '';
  }

  function formatReservaHourRange(item){
    if(!item) return '';
    const start = formatTimeLabel(item.start);
    const end = formatTimeLabel(item.end);
    if(start && end) return `${start} às ${end}`;
    return start || end || '';
  }

  function formatTimeLabel(value){
    if(!value) return '';
    const [hour, minute] = String(value).split(':');
    if(!hour) return value;
    const label = `${hour.padStart(2, '0')}h${(minute || '00').padStart(2, '0')}`;
    return label;
  }

  async function fetchHabitacaoReservas(habId){
    const url = withBase(`/api/habitacoes/${encodeURIComponent(habId)}/reservas?_=${Date.now()}`);
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function resolveVisitaInfo(hab){
    const solicitacoes = Array.isArray(hab && hab.solicitacoes_visita) ? hab.solicitacoes_visita : [];
    const permissoes = Array.isArray(hab && hab.permissoes_visita) ? hab.permissoes_visita : [];
    const cards = [];
    if(solicitacoes.length){
      cards.push(`${solicitacoes.length} ${solicitacoes.length === 1 ? 'solicitação pendente' : 'solicitações pendentes'}`);
    }
    if(permissoes.length){
      cards.push(`${permissoes.length} ${permissoes.length === 1 ? 'permissão ativa' : 'permissões ativas'}`);
    }
    const nextVisitDate = resolveNextVisitDate(hab);
    if(nextVisitDate){
      cards.push(`Próxima visita: ${nextVisitDate}`);
    }
    if(!cards.length) cards.push('Sem registros recentes');
    return cards;
  }

  function resolveNextVisitDate(hab){
    if(!hab) return '';
    const source = hab.proxima_visita || (hab.agenda && (hab.agenda.proxima_visita || hab.agenda.proxima)) || null;
    if(!source) return '';
    const formatted = formatDateBr(source);
    return formatted || '';
  }

  function habitadasClass(state){
    if(state === 'locado') return 'is-locada';
    if(state === 'proprio') return 'is-propria';
    return 'is-vaga';
  }

  function buildHabTimeline(hab, contratoAtivo, isLocada){
    const lastUpdate = hab && (hab.atualizado_em || hab.updatedAt || hab.updated_at || hab.createdAt);
    const proximaInspecao = hab && (hab.proxima_inspecao || hab.proxima_visita || (hab.agenda && hab.agenda.proxima_visita));
    const financeiro = hab && hab.status_financeiro ? hab.status_financeiro : (isLocada ? 'Locatário em dia' : 'Sem lançamentos');
    const periodoItem = isLocada ? resolvePeriodoLocacaoItem(contratoAtivo) : null;
    const items = [
      { label: 'Última atualização', value: lastUpdate ? (formatDateBr(lastUpdate) || 'Hoje') : 'Hoje' },
      periodoItem,
      proximaInspecao ? { label: 'Próx. vistoria', value: formatDateBr(proximaInspecao) || 'Agendar' } : null,
      { label: 'Financeiro', value: financeiro }
    ];
    return items.filter(item => item && item.value);
  }

  function resolvePeriodoLocacaoItem(context){
    const label = 'Período de locação';
    if(!context) return { label, value: 'Contrato não localizado', tone: 'is-warning' };
    const { inicioFormatado, fimFormatado, inicioDate, fimDate, isVigente, hasRenovacaoFutura } = context;
    const display = (inicioFormatado && fimFormatado)
      ? `${inicioFormatado} - ${fimFormatado}`
      : (inicioFormatado ? `Desde ${inicioFormatado}` : (fimFormatado ? `Até ${fimFormatado}` : 'Sem período definido'));
    const today = getTodayMidnight();
    let tone = '';
    if(fimDate){
      if(today > fimDate) tone = hasRenovacaoFutura ? 'is-success' : 'is-danger';
      else if(isVigente){
        const diffDays = Math.ceil((fimDate.getTime() - today.getTime()) / DAY_IN_MS);
        const needsAlert = diffDays <= 31 && !hasRenovacaoFutura;
        tone = needsAlert ? 'is-warning' : 'is-success';
      }
    } else if(isVigente){
      tone = 'is-success';
    } else if(inicioDate && inicioDate <= today){
      tone = 'is-success';
    }
    return { label, value: display, tone };
  }

  function resolveContratoAtivo(hab){
    if(!hab) return null;
    const contratos = Array.isArray(hab.contratos_locacao) && hab.contratos_locacao.length
      ? hab.contratos_locacao
      : (hab.contrato_locacao ? [hab.contrato_locacao] : []);
    if(!contratos.length) return null;
    const normalized = contratos
      .map(normalizeContratoPayload)
      .filter(c => c && !c.cancelado && !c.encerrado && c.ativo !== false);
    if(!normalized.length) return null;
    const today = getTodayMidnight();
    const annotated = normalized.map((contrato, idx) => {
      const periodo = contrato.periodo || {};
      const inicio = periodo.inicio || '';
      const fim = periodo.fim || '';
      const inicioDate = parseDateInput(inicio);
      const fimDate = parseDateInput(fim);
      const startTime = inicioDate ? inicioDate.getTime() : null;
      const endTime = fimDate ? fimDate.getTime() : null;
      let isVigente = false;
      if(startTime != null && endTime != null){
        isVigente = today.getTime() >= startTime && today.getTime() <= endTime;
      } else if(endTime != null){
        isVigente = today.getTime() <= endTime;
      } else if(startTime != null){
        isVigente = today.getTime() >= startTime;
      }
      const isFuture = !isVigente && startTime != null ? startTime > today.getTime() : false;
      return { contrato, idx, inicio, fim, inicioDate, fimDate, isVigente, isFuture };
    });
    const vigentes = annotated.filter(item => item.isVigente);
    let selected = null;
    if(vigentes.length){
      selected = vigentes.sort((a,b) => (b.inicioDate?.getTime() || 0) - (a.inicioDate?.getTime() || 0))[0];
    } else {
      const passados = annotated.filter(item => !item.isFuture);
      if(passados.length){
        selected = passados.sort((a,b) => (b.fimDate?.getTime() || b.inicioDate?.getTime() || 0) - (a.fimDate?.getTime() || a.inicioDate?.getTime() || 0))[0];
      } else {
        const futuros = annotated.filter(item => item.isFuture);
        if(futuros.length){
          selected = futuros.sort((a,b) => (a.inicioDate?.getTime() || Infinity) - (b.inicioDate?.getTime() || Infinity))[0];
        }
      }
    }
    if(!selected) return null;
    let hasRenovacaoFutura = false;
    if(selected.fimDate){
      const selectedEnd = selected.fimDate.getTime();
      hasRenovacaoFutura = annotated.some(item => {
        if(item === selected) return false;
        const start = item.inicioDate ? item.inicioDate.getTime() : null;
        return start != null && start >= selectedEnd;
      });
    }
    return {
      contrato: selected.contrato,
      inicio: selected.inicio || '',
      fim: selected.fim || '',
      inicioFormatado: selected.inicioDate ? selected.inicioDate.toLocaleDateString('pt-BR') : (selected.inicio ? formatDateBr(selected.inicio) : ''),
      fimFormatado: selected.fimDate ? selected.fimDate.toLocaleDateString('pt-BR') : (selected.fim ? formatDateBr(selected.fim) : ''),
      inicioDate: selected.inicioDate || null,
      fimDate: selected.fimDate || null,
      isVigente: !!selected.isVigente,
      isFuture: !!selected.isFuture,
      hasRenovacaoFutura
    };
  }

  function updateStats(){
    if(refs.countVisible) refs.countVisible.textContent = formatNumber(state.filtered.length);
  }

  function renderEmptyState(show){
    if(refs.empty) refs.empty.classList.toggle('is-visible', !!show);
  }

  function handleCardAction(action, habId, card, button){
    if(!action || !habId){
      showToast('Selecione um cartão válido para agir.', 'warning');
      return;
    }
    const hab = getHabById(habId);
    if(!hab){
      showToast('Não foi possível localizar os dados da habitação.', 'danger');
      return;
    }
    let numero = '';
    if(card){
      const titleNode = card.querySelector('.wdg-hab-card-title');
      numero = titleNode ? titleNode.textContent : '';
    }
    switch(action){
      case 'hab-details':
      case 'details':
        openHabitacaoDetails(hab);
        break;
      case 'reservas':
        openReservasModal(hab);
        break;
      case 'vehicle':
        openVehicleDetails(hab, button);
        break;
      case 'pet':
        openPetDetails(hab, button);
        break;
      case 'garage':
        openGarageDetails(hab, button);
        break;
      case 'visit':
        showToast(`Convide visitantes para ${numero || 'a unidade'} diretamente do módulo Visitas.`, 'success');
        break;
      case 'service':
        showToast(`Registre uma ordem de serviço para ${numero || 'esta unidade'} pelo módulo Manutenção.`, 'success');
        break;
      case 'visita-info': {
        const visitaId = button?.dataset?.visitaId ? String(button.dataset.visitaId) : '';
        const visita = visitaId ? (state.visitaIndex.get(visitaId) || null) : null;
        if(!visita){
          showToast('Não foi possível localizar os dados da visita.', 'warning');
          break;
        }
        if(typeof window.wdgOpenVisitaInfoModal === 'function'){
          window.wdgOpenVisitaInfoModal(visita, { hab });
          if(visitaId){
            markVisitaSeen(visitaId);
            applyFilters();
          }
        } else {
          showToast('Modal de informações da visita não disponível.', 'warning');
        }
        break;
      }
      case 'servico-portal':
        openSolicitacaoServicoPortal(button, habId);
        break;
      case 'morador-acesso':
        openMoradorAcessoModal(hab, button);
        break;
      default:
        showToast('Ação não reconhecida.', 'warning');
    }
  }

  function toLocalDatetimeValue(date){
    const d = date instanceof Date ? date : new Date();
    if(!Number.isFinite(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${y}-${m}-${dd}T${hh}:${mm}`;
  }

  function setMoradorAcessoError(msg){
    if(!refs.moradorAcessoErro) return;
    const text = String(msg || '').trim();
    refs.moradorAcessoErro.textContent = text;
    refs.moradorAcessoErro.style.display = text ? '' : 'none';
  }

  function openMoradorAcessoModal(hab, button){
    try {
      if(!refs.moradorAcessoModal) return;
      if(!state.moradorAcessoBs && window.bootstrap && typeof window.bootstrap.Modal === 'function'){
        state.moradorAcessoBs = window.bootstrap.Modal.getOrCreateInstance(refs.moradorAcessoModal);
      }

      const habId = hab && hab._id ? String(hab._id) : '';
      const moradorId = String(button?.dataset?.moradorId || button?.getAttribute('data-morador-id') || '').trim();
      const presente = String(button?.dataset?.presente || button?.getAttribute('data-presente') || '') === 'true';
      const acao = presente ? 'saida' : 'entrada';

      const morador = (Array.isArray(hab?.moradores) ? hab.moradores : []).find(m => String(m?._id || '') === moradorId) || null;
      const nome = String(morador?.nome || button?.getAttribute('aria-label') || 'Morador').trim();
      const numero = String(hab?.numero || hab?.label || hab?.identificacao || '').trim();

      if(refs.moradorAcessoTitle) refs.moradorAcessoTitle.textContent = 'Registrar acesso';
      if(refs.moradorAcessoSubtitle) refs.moradorAcessoSubtitle.textContent = `${nome}${numero ? (' · ' + numero) : ''}`;
      if(refs.moradorAcessoPergunta) refs.moradorAcessoPergunta.textContent = presente ? 'Confirmar saída?' : 'Confirmar entrada?';

      // Aparência (Entrada/Saída)
      const modalEl = refs.moradorAcessoModal;
      const badgeEl = modalEl ? modalEl.querySelector('.wdg-acesso-badge') : null;
      if(badgeEl){
        badgeEl.classList.toggle('is-entrada', acao === 'entrada');
        badgeEl.classList.toggle('is-saida', acao === 'saida');
      }
      if(refs.moradorAcessoIcon){
        // Mantém o elemento, troca apenas o ícone
        refs.moradorAcessoIcon.className = acao === 'entrada' ? 'bi bi-box-arrow-in-right' : 'bi bi-box-arrow-right';
      }
      if(refs.moradorAcessoPill){
        refs.moradorAcessoPill.classList.toggle('is-entrada', acao === 'entrada');
        refs.moradorAcessoPill.classList.toggle('is-saida', acao === 'saida');
      }
      if(refs.moradorAcessoPillText) refs.moradorAcessoPillText.textContent = acao === 'entrada' ? 'Entrada' : 'Saída';
      if(refs.moradorAcessoConfirmar) refs.moradorAcessoConfirmar.textContent = acao === 'entrada' ? 'Confirmar entrada' : 'Confirmar saída';

      if(refs.moradorAcessoHabId) refs.moradorAcessoHabId.value = habId;
      if(refs.moradorAcessoMoradorId) refs.moradorAcessoMoradorId.value = moradorId;
      if(refs.moradorAcessoAcao) refs.moradorAcessoAcao.value = acao;
      if(refs.moradorAcessoDt) refs.moradorAcessoDt.value = toLocalDatetimeValue(new Date());
      setMoradorAcessoError('');

      state.moradorAcessoBs?.show();
    } catch (e) {
      console.warn('[painel_habitacao] falha ao abrir modal morador acesso', e);
      showToast('Não foi possível abrir o registro de acesso.', 'warning');
    }
  }

  async function submitMoradorAcesso(){
    if(state.moradorAcessoSubmitting) return;
    const habId = String(refs.moradorAcessoHabId?.value || '').trim();
    const moradorId = String(refs.moradorAcessoMoradorId?.value || '').trim();
    const acao = String(refs.moradorAcessoAcao?.value || '').trim();
    const dtVal = String(refs.moradorAcessoDt?.value || '').trim();
    if(!habId || !moradorId){
      setMoradorAcessoError('Parâmetros inválidos.');
      return;
    }
    if(acao !== 'entrada' && acao !== 'saida'){
      setMoradorAcessoError('Ação inválida.');
      return;
    }

    let ocorridoIso = null;
    try {
      if(dtVal){
        const d = new Date(dtVal);
        if(Number.isFinite(d.getTime())) ocorridoIso = d.toISOString();
      }
    } catch { ocorridoIso = null; }

    state.moradorAcessoSubmitting = true;
    if(refs.moradorAcessoConfirmar) refs.moradorAcessoConfirmar.disabled = true;
    setMoradorAcessoError('');

    try {
      const url = withBase(`/api/habitacoes/${encodeURIComponent(habId)}/moradores/${encodeURIComponent(moradorId)}/acesso`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ acao, ocorridoEm: ocorridoIso || undefined })
      });
      const j = await res.json().catch(() => null);
      if(!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao registrar.');

      // Atualiza em memória e re-renderiza
      const hab = getHabById(habId);
      if(hab && Array.isArray(hab.moradores)){
        const m = hab.moradores.find(x => String(x?._id || '') === moradorId) || null;
        if(m){
          m.acesso_presente = !!(j?.data?.acesso_presente);
          m.acesso_ultimo_em = j?.data?.ocorridoEm || j?.data?.registradoEm || null;
        }
      }
      applyFilters();

      state.moradorAcessoBs?.hide();
      showToast(acao === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.', 'success');
    } catch (err) {
      setMoradorAcessoError(err?.message || 'Falha ao registrar acesso.');
    } finally {
      state.moradorAcessoSubmitting = false;
      if(refs.moradorAcessoConfirmar) refs.moradorAcessoConfirmar.disabled = false;
    }
  }

  async function openSolicitacaoServicoPortal(button, habId){
    const id = String(button?.getAttribute('data-servico-id') || '').trim();
    if(!id){
      showToast('Solicitação inválida.', 'warning');
      return;
    }
    try{
      const res = await fetch(withBase(`/api/solicitacoes-servico/${encodeURIComponent(id)}?_=${Date.now()}`), { cache: 'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const data = payload && payload.data ? payload.data : null;
      if(!data) throw new Error('Resposta inválida');

      // Ao abrir (tomar conhecimento), remove o marcador "(nova)" do item da lista.
      try{
        const stripNova = (s) => String(s || '').replace(/\s*\(\s*nova\s*\)\s*$/i, '').trim();
        const textEl = button.querySelector('.wdg-hab-inline-text strong');
        const current = stripNova(textEl ? textEl.textContent : (button.getAttribute('aria-label') || button.getAttribute('title') || ''));
        if(textEl) textEl.textContent = current;
        if(current){
          button.setAttribute('aria-label', current);
          button.setAttribute('title', current);
        }
      }catch(_e){ /* noop */ }

      // Também marca como "lida" no estado em memória para não voltar em re-render local.
      try{
        const hab = getHabById(habId);
        const list = Array.isArray(hab && hab.solicitacoes_servico) ? hab.solicitacoes_servico : null;
        if(list){
          const found = list.find(item => item && String(item._id || '') === id);
          if(found) found.nova = false;
        }
      }catch(_e){ /* noop */ }

      if(window.WDG_SOL_SERVICO_DET && typeof window.WDG_SOL_SERVICO_DET.abrir === 'function'){
        window.WDG_SOL_SERVICO_DET.abrir(data);
      } else {
        showToast('Modal indisponível para exibir a solicitação.', 'warning');
      }
    }catch(err){
      console.warn('[painel_habitacao] falha ao abrir solicitação de serviço', err);
      showToast('Não foi possível abrir a solicitação de serviço.', 'danger');
    }
  }

  function showToast(message, tone){
    if(!refs.toast) return;
    const palette = {
      info: '#0f172a',
      success: '#15803d',
      warning: '#d97706',
      danger: '#b91c1c'
    };
    refs.toast.style.backgroundColor = palette[tone] || palette.info;
    refs.toast.textContent = message;
    refs.toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      refs.toast.classList.remove('is-visible');
    }, 3800);
  }

  function escapeHtml(value){
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value){
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function formatDateBr(value){
    const date = parseDateInput(value);
    if(!date) return '';
    return date.toLocaleDateString('pt-BR');
  }

  function parseDateInput(value){
    if(!value && value !== 0) return null;
    if(value instanceof Date && !Number.isNaN(value.getTime())){
      const clone = new Date(value.getTime());
      clone.setHours(0,0,0,0);
      return clone;
    }
    if(typeof value === 'number'){
      const dateFromNumber = new Date(value);
      if(Number.isNaN(dateFromNumber.getTime())) return null;
      dateFromNumber.setHours(0,0,0,0);
      return dateFromNumber;
    }
    const str = String(value).trim();
    if(!str) return null;
    const br = str.match(/^([0-3]\d)\/([01]\d)\/(\d{4})$/);
    if(br){
      const dateBr = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
      if(Number.isNaN(dateBr.getTime())) return null;
      dateBr.setHours(0,0,0,0);
      return dateBr;
    }
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if(iso){
      const dateIso = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      if(Number.isNaN(dateIso.getTime())) return null;
      dateIso.setHours(0,0,0,0);
      return dateIso;
    }
    const fallback = new Date(str);
    if(Number.isNaN(fallback.getTime())) return null;
    fallback.setHours(0,0,0,0);
    return fallback;
  }

  function getTodayMidnight(){
    const today = new Date();
    today.setHours(0,0,0,0);
    return today;
  }

  function normalizeContratoPayload(raw){
    if(!raw || typeof raw !== 'object') return null;
    return {
      ...raw,
      periodo: extractContratoPeriodo(raw)
    };
  }

  function extractContratoPeriodo(raw){
    if(!raw || typeof raw !== 'object') return { inicio: '', fim: '' };
    const basePeriodo = raw.periodo && typeof raw.periodo === 'object' ? { ...raw.periodo } : {};
    const inicio = basePeriodo.inicio
      || raw.vigencia_inicio || raw.vigenciaInicio
      || raw.inicio_vigencia || raw.inicioVigencia
      || raw.inicio || raw.data_inicio || raw.dataInicio || raw.data_inicial || raw.dataInicial
      || '';
    const fim = basePeriodo.fim
      || raw.vigencia_fim || raw.vigenciaFim
      || raw.fim_vigencia || raw.fimVigencia
      || raw.fim || raw.data_fim || raw.dataFim || raw.data_final || raw.dataFinal
      || '';
    return { inicio, fim };
  }

  function withBase(path){
    if(!path) return basePath || '';
    if(path.startsWith('http')) return path;
    const normalizedBase = basePath.endsWith('/') ? basePath.slice(0,-1) : basePath;
    if(path.startsWith('/')) return `${normalizedBase}${path}` || path;
    return `${normalizedBase}/${path}`;
  }

  function iconPath(name){
    if(!name) return '';
    if(iconCache[name]) return iconCache[name];
    iconCache[name] = withBase(`/images/${name}.png`);
    return iconCache[name];
  }
})();
