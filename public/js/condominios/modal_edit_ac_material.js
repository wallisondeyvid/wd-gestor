(function(window, document){
  'use strict';

  const MODAL_ID = 'modalEditACMaterial';
  const MODAL_ACTION_KEY = 'materiais';
  const modalEl = document.getElementById(MODAL_ID);
  if(!modalEl) return;

  const rawBasePath = modalEl.dataset.basePath || document.body.getAttribute('data-base-path') || '';
  const BASE_PATH = normalizeBasePath(rawBasePath);
  const endpointTemplates = {
    contexto: modalEl.dataset.contextEndpoint || '',
    transferir: modalEl.dataset.transferEndpoint || '',
    receber: modalEl.dataset.receiveEndpoint || '',
    cancelar: modalEl.dataset.cancelEndpoint || ''
  };

  const dom = {
    resumoUnidade: Array.from(modalEl.querySelectorAll('[data-role="resumo-unidade"]')),
    resumoArea: Array.from(modalEl.querySelectorAll('[data-role="resumo-area"]')),
    status: modalEl.querySelector('[data-role="status-label"]'),
    listaArea: modalEl.querySelector('#listaMateriaisArea'),
    listaReceber: modalEl.querySelector('#listaMateriaisReceber'),
    listaTransferidos: modalEl.querySelector('#listaMateriaisTransferidos'),
    listaLogs: modalEl.querySelector('#listaMaterialLogs'),
    searchInput: modalEl.querySelector('[data-role="material-search"]'),
    areaCounter: modalEl.querySelector('[data-role="area-counter"]'),
    receberCounter: modalEl.querySelector('[data-role="receber-counter"]'),
    transferidosCounter: modalEl.querySelector('[data-role="transferidos-counter"]'),
    tabsContainer: modalEl.querySelector('#tabsMaterialContent'),
    logsRefresh: modalEl.querySelector('[data-role="logs-refresh"]')
  };

  const state = {
    snapshot: null,
    area: null,
    unidade: null,
    areaId: '',
    unidadeId: '',
    materiaisArea: [],
    materiaisReceber: [],
    materiaisTransferidos: [],
    destinos: [],
    logs: [],
    logsLoaded: false,
    filtro: { busca: '' },
    pendingOperations: [],
    isBusy: false,
    resolvers: { resolve: null, reject: null }
  };

  let bsModalInstance = null;

  bindStaticListeners();

  window.WDG_AC_MATERIAL = {
    abrir: openModal,
    fechar: hideModal,
    atualizarLogs: refreshLogs,
    obterEstado: () => cloneData({ ...state, resolvers: undefined, snapshot: undefined }),
    atualizarContexto: applyContextPayload
  };

  document.addEventListener('area-comum:acao', handleAreaAction);

  function resetState(){
    state.snapshot = null;
    state.area = null;
    state.unidade = null;
    state.areaId = '';
    state.unidadeId = '';
    state.materiaisArea = [];
    state.materiaisReceber = [];
    state.materiaisTransferidos = [];
    state.destinos = [];
    state.logs = [];
    state.logsLoaded = false;
    state.filtro.busca = '';
    state.pendingOperations = [];
    state.isBusy = false;
    if(dom.searchInput) dom.searchInput.value = '';
    modalEl.classList.remove('is-loading');
  }

  function bindStaticListeners(){
    if(dom.searchInput){
      dom.searchInput.addEventListener('input', () => {
        state.filtro.busca = String(dom.searchInput.value || '').trim().toLowerCase();
        renderMateriaisArea();
      });
    }
    if(dom.logsRefresh){
      dom.logsRefresh.addEventListener('click', () => refreshLogs({ force: true }));
    }
    modalEl.addEventListener('click', handleMaterialActionClick, true);
    modalEl.addEventListener('hidden.bs.modal', onModalHidden);
    modalEl.addEventListener('shown.bs.modal', () => {
      if(dom.searchInput) dom.searchInput.focus({ preventScroll: true });
    });
    modalEl.addEventListener('shown.bs.tab', ev => {
      const targetId = ev?.target?.getAttribute('id') || '';
      if(targetId === 'tabMaterialLogs-tab') refreshLogs();
    });
  }

  function openModal(payload){
    resetState();
    clearStatus();
    state.snapshot = cloneData(payload) || {};
    hydrateFromPayload(state.snapshot).then(() => {
      renderAll();
      showModal();
    }).catch(err => {
      console.warn('[modal_edit_ac_material] falha ao preparar modal', err);
      showStatus('Não foi possível carregar os materiais da área.', 'error');
      renderAll();
      showModal();
    });
    return new Promise((resolve, reject) => {
      state.resolvers.resolve = resolve;
      state.resolvers.reject = reject;
    });
  }

  function hideModal(reason){
    const instance = getModalInstance();
    if(instance && typeof instance.hide === 'function'){
      instance.hide();
    } else {
      modalEl.style.display = 'none';
    }
    finalizePromise(reason || { closed: true });
  }

  function showModal(){
    const instance = getModalInstance();
    if(instance && typeof instance.show === 'function'){
      instance.show();
    } else {
      modalEl.style.display = 'block';
    }
  }

  function getModalInstance(){
    if(bsModalInstance) return bsModalInstance;
    if(window.bootstrap && typeof window.bootstrap.Modal === 'function'){
      bsModalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: false });
    }
    return bsModalInstance;
  }

  function onModalHidden(){
    const payload = {
      areaId: state.areaId,
      pending: cloneData(state.pendingOperations)
    };
    finalizePromise({ closed: true, payload });
    resetState();
    clearStatus();
  }

  function finalizePromise(detail){
    const resolver = state.resolvers.resolve;
    const rejecter = state.resolvers.reject;
    state.resolvers.resolve = null;
    state.resolvers.reject = null;
    if(typeof resolver === 'function') resolver(detail);
    if(typeof rejecter === 'function' && detail && detail.error) rejecter(detail.error);
  }

  async function hydrateFromPayload(payload){
    const areaInfo = pickFirstObject(payload, ['area', 'areaInfo', 'areaDados', 'areaData', 'dadosArea', 'areaDetalhes']);
    const unidadeInfo = pickFirstObject(payload, ['unidade', 'condominio', 'unidadeInfo', 'condominioInfo']);
    state.area = areaInfo || null;
    state.unidade = unidadeInfo || null;
    state.areaId = resolveIdentifier(areaInfo, ['_id', 'id', 'areaId', 'area_id', 'identificador']);
    state.unidadeId = resolveIdentifier(unidadeInfo, ['_id', 'id', 'unidadeId', 'condominioId']);

    const materiaisArea = pickFirstArray(payload, ['materiaisArea', 'materiais', 'materiaisDisponiveis', 'materiais_na_area']);
    const materiaisReceber = pickFirstArray(payload, ['materiaisReceber', 'pendentesReceber', 'materiaisPendentes', 'materiaisAReceber']);
    const materiaisTransferidos = pickFirstArray(payload, ['materiaisTransferidos', 'pendentesTransferidos', 'materiaisEnviados', 'materiaisEmTransito']);
    const destinos = pickFirstArray(payload, ['destinos', 'areasDestino', 'areasDisponiveis', 'unidadesDestino']);
    const logs = pickFirstArray(payload, ['logs', 'historico', 'movimentacoes']);

    state.materiaisArea = materiaisArea.map(normalizeMaterial);
    state.materiaisReceber = materiaisReceber.map(normalizeMaterial);
    state.materiaisTransferidos = materiaisTransferidos.map(normalizeMaterial);
    state.destinos = destinos.map(normalizeDestino);
    if(logs.length){
      state.logs = logs.map(normalizeLog);
      state.logsLoaded = true;
    }

    if(!state.unidade){
      const unidadeFromArea = pickFirstObject(areaInfo, ['unidade', 'condominio', 'unidadeInfo']);
      if(unidadeFromArea) state.unidade = unidadeFromArea;
      else if(areaInfo && areaInfo._unidadeLabel){
        state.unidade = { label: areaInfo._unidadeLabel, nome: areaInfo._unidadeLabel };
      }
    }

    if(!state.areaId && state.area){
      state.areaId = resolveIdentifier(state.area, ['idArea', 'codigo']);
    }

    if(!state.unidadeId && state.unidade && typeof state.unidade === 'object'){
      state.unidadeId = resolveIdentifier(state.unidade, ['_id', 'id', 'unidadeId', 'condominioId']);
    }

    if(!state.materiaisArea.length){
      const fallbackArea = pickFirstArray(areaInfo, ['materiais', 'materiaisDisponiveis', 'materiais_disponiveis']);
      if(fallbackArea.length) state.materiaisArea = fallbackArea.map(normalizeMaterial);
    }

    if(!state.materiaisReceber.length){
      const fallbackReceber = pickFirstArray(areaInfo, ['materiaisReceber', 'materiais_pendentes', 'materiais_pendentes_receber']);
      if(fallbackReceber.length) state.materiaisReceber = fallbackReceber.map(normalizeMaterial);
    }

    if(!state.materiaisTransferidos.length){
      const fallbackTransferidos = pickFirstArray(areaInfo, ['materiaisTransferidos', 'materiais_em_transito', 'materiaisPendentesEnvio']);
      if(fallbackTransferidos.length) state.materiaisTransferidos = fallbackTransferidos.map(normalizeMaterial);
    }

    const areaIdHasSlash = typeof state.areaId === 'string' && state.areaId.includes('/');
    const hasCustomContextEndpoint = Boolean(endpointTemplates.contexto);
    const allowDefaultFetch = hasCustomContextEndpoint || !areaIdHasSlash;
    const needsDestinos = state.destinos.length === 0;
    const needsMateriais = state.materiaisArea.length === 0;
    const shouldAutoFetch = Boolean(state.areaId) && payload && payload.autoFetch !== false && (needsMateriais || needsDestinos) && typeof window.fetch === 'function' && allowDefaultFetch;
    if(shouldAutoFetch){
      const contextResult = await fetchContextSnapshot(state.areaId, payload && payload.contextOptions);
      if(contextResult && contextResult.ok && contextResult.payload){
        applyContextPayload(contextResult.payload);
      }
    }
  }

  function applyContextPayload(context){
    if(!context || typeof context !== 'object') return;
    const areaInfo = pickFirstObject(context, ['area', 'areaInfo', 'dadosArea']);
    const unidadeInfo = pickFirstObject(context, ['unidade', 'condominio'])
      || (typeof context.unidadeLabel === 'string' ? { label: context.unidadeLabel, nome: context.unidadeLabel } : null);
    if(areaInfo) state.area = areaInfo;
    if(unidadeInfo) state.unidade = unidadeInfo;
    if(!state.areaId) state.areaId = resolveIdentifier(areaInfo, ['_id', 'id', 'areaId', 'codigo']);
    if(!state.unidadeId) state.unidadeId = resolveIdentifier(unidadeInfo, ['_id', 'id', 'unidadeId']);
    const destinos = pickFirstArray(context, ['destinos', 'areasDestino', 'destinosPossiveis']);
    if(destinos.length) state.destinos = destinos.map(normalizeDestino);
    const materiaisArea = pickFirstArray(context, ['materiaisArea', 'materiais', 'materiaisDisponiveis']);
    if(materiaisArea.length) state.materiaisArea = materiaisArea.map(normalizeMaterial);
    const materiaisReceber = pickFirstArray(context, ['materiaisReceber', 'pendentesReceber']);
    if(materiaisReceber.length) state.materiaisReceber = materiaisReceber.map(normalizeMaterial);
    const transferidos = pickFirstArray(context, ['materiaisTransferidos', 'pendentesTransferidos']);
    if(transferidos.length) state.materiaisTransferidos = transferidos.map(normalizeMaterial);
    if(!state.unidade && areaInfo && areaInfo._unidadeLabel){
      state.unidade = { label: areaInfo._unidadeLabel, nome: areaInfo._unidadeLabel };
    }
    const logs = pickFirstArray(context, ['logs', 'historico', 'movimentacoes']);
    if(logs.length){
      state.logs = logs.map(normalizeLog);
      state.logsLoaded = true;
    }
    renderAll();
  }

  function renderAll(){
    renderResumo();
    renderMateriaisArea();
    renderMateriaisReceber();
    renderMateriaisTransferidos();
    if(state.logsLoaded) renderLogs();
    updateCounters();
  }

  function renderResumo(){
    const unidadeLabel = buildUnidadeLabel(state.unidade);
    const areaLabel = buildAreaLabel(state.area);
    dom.resumoUnidade.forEach(el => setText(el, unidadeLabel || '—'));
    dom.resumoArea.forEach(el => setText(el, areaLabel || '—'));
  }

  function renderMateriaisArea(){
    if(!dom.listaArea) return;
    const filtro = state.filtro.busca;
    const baseList = state.materiaisArea;
    const filtered = filtro ? baseList.filter(item => matchesFilter(item, filtro)) : baseList;
    renderCollection(dom.listaArea, filtered, {
      empty: '',
      source: 'area',
      actions: buildAreaActions()
    });
    updateCounters();
  }

  function renderMateriaisReceber(){
    if(!dom.listaReceber) return;
    renderCollection(dom.listaReceber, state.materiaisReceber, {
      empty: '',
      source: 'receber',
      actions: buildReceberActions()
    });
    updateCounters();
  }

  function renderMateriaisTransferidos(){
    if(!dom.listaTransferidos) return;
    renderCollection(dom.listaTransferidos, state.materiaisTransferidos, {
      empty: '',
      source: 'transferidos',
      actions: buildTransferidosActions()
    });
    updateCounters();
  }

  function renderLogs(){
    if(!dom.listaLogs) return;
    const list = state.logs;
    dom.listaLogs.innerHTML = '';
    if(!list.length){
      dom.listaLogs.classList.add('wdg-placeholder-box');
      dom.listaLogs.textContent = '';
      return;
    }
    dom.listaLogs.classList.remove('wdg-placeholder-box');
    const frag = document.createDocumentFragment();
    list.forEach(entry => {
      const item = document.createElement('article');
      item.className = 'wdg-material-log';

      const head = document.createElement('div');
      head.className = 'wdg-material-log__head';

      const overview = document.createElement('div');
      overview.className = 'wdg-material-log__overview';

      const title = document.createElement('span');
      title.className = 'wdg-material-log__title';
      title.textContent = entry.material || 'Material';
      overview.appendChild(title);

      const patrimonioTexto = entry.patrimonio || '';
      if(patrimonioTexto){
        const badge = document.createElement('span');
        badge.className = 'wdg-material-log__patrimonio';
        badge.textContent = `Patrimônio ${patrimonioTexto}`;
        overview.appendChild(badge);
      }

      head.appendChild(overview);

      const time = document.createElement('span');
      time.className = 'wdg-material-log__time';
      time.textContent = entry.dataFormatada || entry.data || '';
      head.appendChild(time);

      const meta = document.createElement('div');
      meta.className = 'wdg-material-log__meta';
      appendMeta(meta, 'Ação', entry.acao);
      appendMeta(meta, 'Origem', entry.origem);
      appendMeta(meta, 'Destino', entry.destino);
      appendMeta(meta, 'Usuário', entry.usuario);

      const note = document.createElement('div');
      note.className = 'wdg-material-log__note';
      note.textContent = entry.obs || entry.mensagem || '';

      item.appendChild(head);
      if(meta.childNodes.length) item.appendChild(meta);
      if(note.textContent) item.appendChild(note);
      frag.appendChild(item);
    });
    dom.listaLogs.appendChild(frag);
  }

  function renderCollection(container, list, options){
    if(!container) return;
    container.innerHTML = '';
    if(!Array.isArray(list) || !list.length){
      container.classList.add('wdg-placeholder-box');
      container.textContent = options.empty || '';
      return;
    }
    container.classList.remove('wdg-placeholder-box');
    const frag = document.createDocumentFragment();
    list.forEach(material => frag.appendChild(createMaterialCard(material, options)));
    container.appendChild(frag);
  }

  function createMaterialCard(material, options){
    const card = document.createElement('article');
    card.className = 'wdg-material-item';
    card.dataset.materialId = material.id || '';
    if(material.transferenciaId) card.dataset.transferenciaId = material.transferenciaId;
    card.dataset.source = options.source || '';

    const head = document.createElement('div');
    head.className = 'wdg-material-item__headline';
    const title = document.createElement('div');
    title.className = 'wdg-material-item__name';
    title.textContent = material.nome || 'Material sem identificação';
    head.appendChild(title);

    const badges = buildMaterialBadges(material);
    if(badges.childNodes.length) head.appendChild(badges);

    const meta = document.createElement('div');
    meta.className = 'wdg-material-item__meta';
    appendMeta(meta, 'Patrimônio', material.patrimonio);
    appendMeta(meta, 'Quantidade', formatQuantity(material.quantidade));
    appendMeta(meta, 'Tipo', material.tipo);
    appendMeta(meta, 'Status', material.status);

    const footer = document.createElement('div');
    footer.className = 'wdg-material-item__footer';
    const showLocation = options.source !== 'area';
    if(showLocation){
      footer.appendChild(makeFooterInfo('Origem', material.origemLabel));
      footer.appendChild(makeFooterInfo('Destino', material.destinoLabel));
    }
    const updated = material.atualizadoEm || material.criadoEm;
    footer.appendChild(makeFooterInfo('Atualizado', updated));

    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'wdg-material-item__actions';
    const actionSource = typeof options.actions === 'function' ? options.actions(material) : options.actions;
    const actions = Array.isArray(actionSource) ? actionSource : [];
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = buildButtonClass(action.variant || 'outline-primary');
      btn.textContent = action.label;
      btn.dataset.materialAction = action.action;
      btn.dataset.materialId = material.id || '';
      if(material.transferenciaId) btn.dataset.transferenciaId = material.transferenciaId;
      if(action.source) btn.dataset.materialSource = action.source;
      else if(options.source) btn.dataset.materialSource = options.source;
      if(action.disabled) btn.disabled = true;
      if(action.title) btn.title = action.title;
      actionsWrapper.appendChild(btn);
    });

    card.appendChild(head);
    if(meta.childNodes.length) card.appendChild(meta);
    if(material.descricao){
      const details = document.createElement('div');
      details.textContent = material.descricao;
      details.className = 'wdg-material-item__description';
      card.appendChild(details);
    }
    card.appendChild(actionsWrapper);
    card.appendChild(footer);
    return card;
  }

  function buildMaterialBadges(material){
    const wrap = document.createElement('div');
    wrap.className = 'wdg-material-item__badges';
    if(material.categoria) wrap.appendChild(makeBadge(material.categoria));
    if(material.modalidade) wrap.appendChild(makeBadge(material.modalidade));
    if(material.emprestimo === true) wrap.appendChild(makeBadge('Em empréstimo'));
    if(material.temporario === true) wrap.appendChild(makeBadge('Temporário'));
    return wrap;
  }

  function buildButtonClass(variant){
    switch(variant){
      case 'primary':
        return 'btn btn-sm btn-primary';
      case 'danger':
        return 'btn btn-sm btn-danger';
      case 'warning':
        return 'btn btn-sm btn-warning';
      case 'success':
        return 'btn btn-sm btn-success';
      case 'outline-danger':
        return 'btn btn-sm btn-outline-danger';
      case 'outline-success':
        return 'btn btn-sm btn-outline-success';
      case 'outline-secondary':
        return 'btn btn-sm btn-outline-secondary';
      default:
        return 'btn btn-sm btn-outline-primary';
    }
  }

  function buildAreaActions(){
    return material => {
      const destinosDisponiveis = resolveDestinosDisponiveis(material);
      const hasDestinos = destinosDisponiveis.length > 0;
      const actions = [];
      actions.push({
        action: 'transfer',
        label: 'Transferir',
        variant: 'primary',
        disabled: state.isBusy,
        title: hasDestinos ? 'Transferir material para outra area' : 'Nenhuma area disponivel no momento (ver detalhes)',
        source: 'area'
      });
      actions.push({ action: 'loan', label: 'Emprestar material', variant: 'outline-secondary', source: 'area' });
      return actions;
    };
  }

  function buildReceberActions(){
    return () => [
      { action: 'receive', label: 'Confirmar recebimento', variant: 'success', source: 'receber' },
      { action: 'reject', label: 'Recusar', variant: 'outline-danger', source: 'receber' }
    ];
  }

  function buildTransferidosActions(){
    return material => {
      const actions = [
        { action: 'cancel-transfer', label: 'Cancelar envio', variant: 'outline-danger', source: 'transferidos' }
      ];
      if(material.transferenciaId) actions.push({ action: 'abrir-log', label: 'Ver detalhes', variant: 'outline-secondary', source: 'transferidos' });
      return actions;
    };
  }

  function appendMeta(container, label, value){
    const text = sanitize(value);
    if(!text) return;
    const span = document.createElement('span');
    span.innerHTML = `<strong>${label}:</strong> ${escapeHtml(text)}`;
    container.appendChild(span);
  }

  function makeFooterInfo(label, value){
    const wrap = document.createElement('span');
    wrap.innerHTML = `<strong>${label}:</strong> ${escapeHtml(sanitize(value) || '—')}`;
    return wrap;
  }

  function makeBadge(label){
    const badge = document.createElement('span');
    badge.className = 'wdg-material-item__badge';
    badge.textContent = label;
    return badge;
  }

  function updateCounters(){
    if(dom.areaCounter) dom.areaCounter.textContent = formatCounter(state.materiaisArea.length);
    if(dom.receberCounter) dom.receberCounter.textContent = formatCounter(state.materiaisReceber.length);
    if(dom.transferidosCounter) dom.transferidosCounter.textContent = formatCounter(state.materiaisTransferidos.length);
  }

  async function performTransfer(material, destinoId){
    if(state.isBusy) return { ok: false, message: 'Outra operação está em andamento.' };
    state.isBusy = true;
    setBusy(true);
    const destinosDisponiveis = resolveDestinosDisponiveis(material);
    const destino = destinosDisponiveis.find(item => item.id === destinoId) || null;
    const payload = {
      areaId: state.areaId,
      unidadeId: state.unidadeId,
      material: cloneData(material),
      materialId: material.id,
      destinoId,
      destino
    };
    try{
      const result = await executeOperation('transfer', payload, () => defaultTransferRequest(payload));
      if(!result || result.ok === false){
        const message = result && result.message ? result.message : 'Falha ao registrar a transferência.';
        showStatus(message, 'error');
        return { ok: false, message };
      }
      moveMaterialBetweenLists(material.id, 'area', 'transferidos', destino);
      if(result.payload && result.payload.transferencia && result.payload.transferencia.id){
        const moved = findMaterialById(material.id, 'transferidos');
        if(moved) moved.transferenciaId = String(result.payload.transferencia.id);
      }
      state.pendingOperations.push({ tipo: 'transferencia', materialId: material.id, destinoId, timestamp: Date.now(), response: result.payload || null });
      renderAll();
      showStatus('Transferência registrada com sucesso.', 'success');
      document.dispatchEvent(new CustomEvent('area-comum:material:transferido', { detail: { ...payload, response: result.payload || null } }));
      return { ok: true, payload: result.payload || null };
    }catch(err){
      console.warn('[modal_edit_ac_material] falha ao transferir material', err);
      const message = 'Não foi possível transferir o material.';
      showStatus(message, 'error');
      return { ok: false, message };
    } finally {
      state.isBusy = false;
      setBusy(false);
    }
  }

  async function refreshLogs(options){
    if(state.logsLoaded && (!options || !options.force)) return;
    if(!state.areaId){
      document.dispatchEvent(new CustomEvent('area-comum:material:logs:solicitar', { detail: { areaId: state.areaId } }));
      return;
    }
    setBusy(true);
    try{
      const eventDetail = { areaId: state.areaId, handled: false, promise: null };
      document.dispatchEvent(new CustomEvent('area-comum:material:logs:refresh', { detail: eventDetail }));
      if(eventDetail.handled && eventDetail.promise && typeof eventDetail.promise.then === 'function'){
        const result = await eventDetail.promise;
        applyLogs(result);
        return;
      }
      const url = buildContextUrl(state.areaId, { logs: true });
      if(!url || typeof window.fetch !== 'function') return;
      const response = await fetch(url, { credentials: 'same-origin' });
      if(!response.ok) return;
      const data = await response.json().catch(() => ({}));
      applyLogs(data);
    }catch(err){
      console.warn('[modal_edit_ac_material] falha ao atualizar logs', err);
    } finally {
      state.logsLoaded = true;
      setBusy(false);
      renderLogs();
    }
  }

  function applyLogs(data){
    if(!data) return;
    let list = [];
    if(Array.isArray(data)) list = data;
    else if(Array.isArray(data.logs)) list = data.logs;
    else if(Array.isArray(data.movimentacoes)) list = data.movimentacoes;
    state.logs = list.map(normalizeLog);
    state.logsLoaded = true;
    renderLogs();
  }

  function performReceive(material, approve){
    if(state.isBusy) return;
    const transferenciaId = material.transferenciaId || material.id;
    if(!transferenciaId){
      showStatus('Identificador da transferência não encontrado.', 'warning');
      return;
    }
    state.isBusy = true;
    setBusy(true);
    const payload = {
      areaId: state.areaId,
      unidadeId: state.unidadeId,
      materialId: material.id,
      transferenciaId,
      aprovar: approve,
      material: cloneData(material)
    };
    executeOperation(approve ? 'receber' : 'rejeitar', payload, () => defaultReceiveRequest(payload)).then(result => {
      if(!result || result.ok === false){
        const message = result && result.message ? result.message : 'Não foi possível atualizar o status do material.';
        showStatus(message, 'error');
        return;
      }
      removeMaterialFromList(material.id, 'receber');
      if(approve){
        const rawMaterial = cloneData(material.raw) || {};
        rawMaterial.status = rawMaterial.status || 'Disponível';
        rawMaterial.areaDestino = state.area;
        const normalizado = normalizeMaterial(rawMaterial);
        state.materiaisArea.unshift(normalizado);
      }
      state.pendingOperations.push({ tipo: approve ? 'recebimento' : 'recusa', materialId: material.id, transferenciaId, timestamp: Date.now(), response: result.payload || null });
      renderAll();
      const evento = approve ? 'area-comum:material:recebido' : 'area-comum:material:recusado';
      document.dispatchEvent(new CustomEvent(evento, { detail: { ...payload, response: result.payload || null } }));
      showStatus(approve ? 'Material recebido com sucesso.' : 'Material recusado.', approve ? 'success' : 'warning');
    }).catch(err => {
      console.warn('[modal_edit_ac_material] falha ao confirmar recebimento', err);
      showStatus('Erro ao processar o material.', 'error');
    }).finally(() => {
      state.isBusy = false;
      setBusy(false);
    });
  }

  function performCancelTransfer(material){
    if(state.isBusy) return;
    const transferenciaId = material.transferenciaId || material.id;
    if(!transferenciaId){
      showStatus('Transferência sem identificador.', 'warning');
      return;
    }
    state.isBusy = true;
    setBusy(true);
    const payload = {
      areaId: state.areaId,
      unidadeId: state.unidadeId,
      materialId: material.id,
      transferenciaId,
      material: cloneData(material)
    };
    executeOperation('cancelar', payload, () => defaultCancelRequest(payload)).then(result => {
      if(!result || result.ok === false){
        showStatus(result && result.message ? result.message : 'Não foi possível cancelar a transferência.', 'error');
        return;
      }
      moveMaterialBetweenLists(material.id, 'transferidos', 'area');
      renderAll();
      showStatus('Transferência cancelada.', 'success');
      state.pendingOperations.push({ tipo: 'cancelamento', materialId: material.id, transferenciaId, timestamp: Date.now(), response: result.payload || null });
      document.dispatchEvent(new CustomEvent('area-comum:material:transferencia:cancelada', { detail: { ...payload, response: result.payload || null } }));
    }).catch(err => {
      console.warn('[modal_edit_ac_material] falha ao cancelar transferência', err);
      showStatus('Erro ao cancelar a transferência.', 'error');
    }).finally(() => {
      state.isBusy = false;
      setBusy(false);
    });
  }

  function emitLoanFlow(material){
    const detail = {
      areaId: state.areaId,
      unidadeId: state.unidadeId,
      material: cloneData(material),
      handled: false,
      promise: null
    };
    document.dispatchEvent(new CustomEvent('area-comum:material:emprestimo', { detail }));
    if(!detail.handled){
      showStatus('Acione o fluxo de empréstimo na aplicação principal.', 'info');
    }
  }

  function executeOperation(kind, payload, fallback){
    try{
      const detail = { tipo: kind, payload, handled: false, promise: null };
      document.dispatchEvent(new CustomEvent('area-comum:material:acao', { detail }));
      if(detail.handled && detail.promise && typeof detail.promise.then === 'function'){
        return detail.promise;
      }
    }catch(err){
      console.warn('[modal_edit_ac_material] falha ao emitir evento de ação', err);
    }
    if(typeof fallback === 'function') return fallback();
    return Promise.resolve({ ok: false, skipped: true, message: 'Operação não tratada.' });
  }

  async function defaultTransferRequest(payload){
    const url = buildTransferUrl(payload.areaId, payload.destinoId);
    if(!url || typeof window.fetch !== 'function'){
      return { ok: false, message: 'Endpoint de transferência não disponível.' };
    }
    try{
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ materialId: payload.materialId, destinoId: payload.destinoId })
      });
      if(!res.ok) return { ok: false, status: res.status };
      const data = await res.json().catch(() => ({}));
      return { ok: true, payload: data };
    }catch(err){
      console.warn('[modal_edit_ac_material] request transfer failed', err);
      return { ok: false, error: err };
    }
  }

  async function defaultReceiveRequest(payload){
    const url = buildReceiveUrl(payload.areaId, payload.transferenciaId);
    if(!url || typeof window.fetch !== 'function'){
      return { ok: false, message: 'Endpoint de recebimento não disponível.' };
    }
    try{
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ materialId: payload.materialId, transferenciaId: payload.transferenciaId, acao: payload.aprovar ? 'confirmar' : 'rejeitar' })
      });
      if(!res.ok) return { ok: false, status: res.status };
      const data = await res.json().catch(() => ({}));
      return { ok: true, payload: data };
    }catch(err){
      console.warn('[modal_edit_ac_material] request receive failed', err);
      return { ok: false, error: err };
    }
  }

  async function defaultCancelRequest(payload){
    const url = buildCancelUrl(payload.areaId, payload.transferenciaId);
    if(!url || typeof window.fetch !== 'function'){
      return { ok: false, message: 'Endpoint de cancelamento não disponível.' };
    }
    try{
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ materialId: payload.materialId, transferenciaId: payload.transferenciaId })
      });
      if(!res.ok) return { ok: false, status: res.status };
      const data = await res.json().catch(() => ({}));
      return { ok: true, payload: data };
    }catch(err){
      console.warn('[modal_edit_ac_material] request cancel failed', err);
      return { ok: false, error: err };
    }
  }

  async function fetchContextSnapshot(areaId, options){
    const detail = {
      areaId,
      unidadeId: state.unidadeId,
      area: cloneData(state.area),
      options,
      handled: false,
      promise: null
    };
    try{
      document.dispatchEvent(new CustomEvent('area-comum:material:contexto', { detail }));
    }catch(err){
      console.warn('[modal_edit_ac_material] erro ao emitir evento de contexto', err);
    }
    if(detail.handled){
      try{
        if(detail.promise && typeof detail.promise.then === 'function'){
          const result = await detail.promise;
          if(result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'ok')){
            return result;
          }
          return { ok: true, payload: result };
        }
      }catch(err){
        console.warn('[modal_edit_ac_material] falha ao resolver contexto externo', err);
        return { ok: false, error: err };
      }
      return { ok: false, reason: 'context-handler-without-promise' };
    }

    const url = buildContextUrl(areaId, options);
    if(!url || typeof window.fetch !== 'function') return { ok: false, reason: 'missing-context-endpoint' };
    try{
      const response = await fetch(url, { credentials: 'same-origin' });
      if(!response.ok) return { ok: false, status: response.status };
      const payload = await response.json().catch(() => ({}));
      return { ok: true, payload };
    }catch(err){
      console.warn('[modal_edit_ac_material] falha ao buscar contexto remoto', err);
      return { ok: false, error: err };
    }
  }

  function buildContextUrl(areaId, options){
    const template = endpointTemplates.contexto;
    const substitutes = { areaId, unidadeId: state.unidadeId };
    if(template){
      return buildUrlFromTemplate(template, substitutes, options);
    }
    const base = joinUrl(BASE_PATH, 'api/areas-comuns');
    const encodedAreaId = encodeURIComponentSafe(areaId);
    if(!encodedAreaId){
      return '';
    }
    const areaIdHasSlash = areaId && areaId.indexOf('/') !== -1;
    if(!template && areaIdHasSlash){
      return '';
    }
    let url = joinUrl(base, encodedAreaId, 'materiais', 'contexto');
    if(options && options.logs){
      url += (url.includes('?') ? '&' : '?') + 'secao=logs';
    }
    return url;
  }

  function buildTransferUrl(areaId){
    const template = endpointTemplates.transferir;
    const substitutes = { areaId, unidadeId: state.unidadeId };
    if(template){
      return buildUrlFromTemplate(template, substitutes);
    }
    return joinUrl(joinUrl(BASE_PATH, 'api/areas-comuns'), encodeURIComponentSafe(areaId), 'materiais', 'transferencias');
  }

  function buildReceiveUrl(areaId, transferenciaId){
    const template = endpointTemplates.receber;
    const substitutes = { areaId, transferenciaId, unidadeId: state.unidadeId };
    if(template){
      return buildUrlFromTemplate(template, substitutes);
    }
    return joinUrl(joinUrl(BASE_PATH, 'api/areas-comuns'), encodeURIComponentSafe(areaId), 'materiais', 'recebimentos');
  }

  function buildCancelUrl(areaId, transferenciaId){
    const template = endpointTemplates.cancelar;
    const substitutes = { areaId, transferenciaId, unidadeId: state.unidadeId };
    if(template){
      return buildUrlFromTemplate(template, substitutes);
    }
    return joinUrl(joinUrl(BASE_PATH, 'api/areas-comuns'), encodeURIComponentSafe(areaId), 'materiais', 'transferencias', encodeURIComponentSafe(transferenciaId));
  }

  function buildUrlFromTemplate(template, values, options){
    const substitutions = { ...values };
    const final = template.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => encodeURIComponentSafe(substitutions[key]));
    if(options && options.logs){
      return final.indexOf('?') >= 0 ? `${final}&secao=logs` : `${final}?secao=logs`;
    }
    return final;
  }

  function joinUrl(){
    const parts = Array.from(arguments).filter(Boolean).map(part => String(part));
    return parts.map((segment, index) => {
      let clean = segment;
      if(index === 0){
        clean = clean.replace(/\/$/, '');
      } else {
        clean = clean.replace(/^\/+/, '').replace(/\/$/, '');
      }
      return clean;
    }).filter(Boolean).join('/');
  }

  function encodeURIComponentSafe(value){
    const str = sanitize(value);
    return str ? encodeURIComponent(str) : '';
  }

  function setBusy(active){
    if(active){
      modalEl.classList.add('is-loading');
    } else {
      modalEl.classList.remove('is-loading');
    }
  }

  function showStatus(message, tone){
    if(!dom.status) return;
    dom.status.textContent = message || '';
    dom.status.dataset.tone = tone || '';
    dom.status.classList.remove('is-success', 'is-warning', 'is-error', 'is-info');
    if(tone){
      const toneClass = tone === 'error' ? 'is-error' : tone === 'warning' ? 'is-warning' : tone === 'success' ? 'is-success' : 'is-info';
      dom.status.classList.add(toneClass);
    }
  }

  function clearStatus(){
    showStatus('', '');
  }

  function handleMaterialActionClick(event){
    const target = event.target instanceof Element ? event.target : null;
    if(!target) return;
    const actionBtn = target.closest('[data-material-action]');
    if(!actionBtn || !modalEl.contains(actionBtn)) return;
    event.preventDefault();
    const action = actionBtn.dataset.materialAction;
    const materialId = actionBtn.dataset.materialId;
    const source = actionBtn.dataset.materialSource;
    const material = findMaterialById(materialId, source);
    if(!material){
      showStatus('Material não localizado para esta ação.', 'warning');
      return;
    }
    switch(action){
      case 'transfer':
        openTransferModal(material);
        break;
      case 'loan':
        emitLoanFlow(material);
        break;
      case 'receive':
        performReceive(material, true);
        break;
      case 'reject':
        performReceive(material, false);
        break;
      case 'cancel-transfer':
        performCancelTransfer(material);
        break;
      case 'abrir-log':
        refreshLogs({ force: true });
        if(dom.tabsContainer){
          const logsTabTrigger = modalEl.querySelector('#tabMaterialLogs-tab');
          if(logsTabTrigger && typeof logsTabTrigger.click === 'function') logsTabTrigger.click();
        }
        break;
      default:
        showStatus('Ação não reconhecida.', 'warning');
    }
  }

  function openTransferModal(material){
    if(!material) return;
    const destinosDisponiveis = resolveDestinosDisponiveis(material);
    if(!Array.isArray(destinosDisponiveis) || destinosDisponiveis.length === 0){
      showStatus('Nenhuma area disponivel para receber este material no momento, mas ainda e possivel visualizar os detalhes da transferencia.', 'info');
    }
    const transferModalApi = window.WDG_MATERIAL_TRANSFER;
    if(!transferModalApi || typeof transferModalApi.abrir !== 'function'){
      showStatus('Fluxo de transferência indisponível no momento.', 'warning');
      return;
    }
    try{
      transferModalApi.abrir({
        material: cloneData(material),
        origem: {
          area: cloneData(state.area),
          unidade: cloneData(state.unidade)
        },
        areaId: state.areaId,
        unidadeId: state.unidadeId,
        destinos: cloneData(destinosDisponiveis),
        onSubmit: async ({ destinoId }) => {
          if(!destinoId){
            return { ok: false, message: 'Selecione a área de destino.' };
          }
          return performTransfer(material, destinoId);
        }
      });
    }catch(err){
      console.warn('[modal_edit_ac_material] falha ao abrir modal de transferência', err);
      showStatus('Não foi possível iniciar a transferência.', 'error');
    }
  }

  function moveMaterialBetweenLists(materialId, from, to, destino){
    const originList = getListBySource(from);
    const targetList = getListBySource(to);
    if(!originList || !targetList) return;
    const index = originList.findIndex(item => item.id === materialId);
    if(index === -1) return;
    const [item] = originList.splice(index, 1);
    if(destino){
      item.destinoId = destino.id;
      item.destinoLabel = destino.label;
      item.status = 'Em transferência';
    } else if(to === 'area'){
      item.destinoId = '';
      item.destinoLabel = '';
      item.status = 'Disponível';
    }
    targetList.unshift(item);
  }

  function removeMaterialFromList(materialId, source){
    const list = getListBySource(source);
    if(!list) return;
    const index = list.findIndex(item => item.id === materialId);
    if(index >= 0) list.splice(index, 1);
  }

  function findMaterialById(id, source){
    if(!id) return null;
    const list = getListBySource(source);
    if(!Array.isArray(list)) return null;
    return list.find(item => item.id === id) || null;
  }

  function getListBySource(source){
    switch(source){
      case 'area': return state.materiaisArea;
      case 'receber': return state.materiaisReceber;
      case 'transferidos': return state.materiaisTransferidos;
      default: return null;
    }
  }

  function matchesFilter(material, lowercaseTerm){
    if(!material) return false;
    const haystack = [material.nome, material.patrimonio, material.descricao, material.categoria, material.tipo].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(lowercaseTerm);
  }

  function buildUnidadeLabel(unidade){
    if(!unidade){
      const fallback = state.area && state.area._unidadeLabel ? state.area._unidadeLabel : '';
      return sanitize(fallback);
    }
    if(typeof unidade === 'string') return sanitize(unidade);
    const nome = sanitize(unidade.nome || unidade.name || unidade.descricao || unidade.label);
    const bloco = sanitize(unidade.bloco || unidade.torre || unidade.identificador || unidade.codigo);
    if(nome && bloco) return `${nome} • ${bloco}`;
    return nome || bloco;
  }

  function buildAreaLabel(area){
    if(!area) return '';
    const nome = sanitize(area.nome || area.name || area.descricao || area.area || area.titulo);
    const codigo = sanitize(area.codigo || area.sigla || area.identificador);
    if(nome && codigo) return `${nome} (${codigo})`;
    return nome || codigo;
  }

  function normalizeMaterial(raw){
    const base = raw || {};
    const source = base.material || base.item || base;
    const id = resolveIdentifier(source, ['materialId', 'id', '_id', 'codigo', 'uid']);
    const nome = sanitize(source.nome || source.name || source.descricao || source.titulo);
    const patrimonio = sanitize(source.patrimonio || source.patrimonioNumero || source.numPatrimonio || source.codigoPatrimonio);
    const quantidade = resolveNumber(source.quantidade, source.qtde, 1);
    const tipo = sanitize(source.tipo || source.categoria || source.classificacao);
    const categoria = sanitize(source.categoria || source.grupo);
    const modalidade = sanitize(source.modalidade || source.uso);
    const origemArea = pickFirstObject(source, ['origem', 'areaOrigem']);
    const destinoArea = pickFirstObject(source, ['destino', 'areaDestino']);
    const origemLabel = origemArea ? buildAreaLabel(origemArea) : sanitize(source.origemLabel || source.areaOrigemNome || source.origemDescricao);
    const destinoLabel = destinoArea ? buildAreaLabel(destinoArea) : sanitize(source.destinoLabel || source.areaDestinoNome || source.destinoDescricao);
    const transferenciaId = resolveIdentifier(source, ['transferenciaId', 'transferencia_id', 'envioId', 'pendenciaId', 'idTransferencia']);
    const status = sanitize(source.status || source.situacao);
    const descricao = sanitize(source.descricao || source.observacao || source.detalhes);
    const atualizadoEm = formatDateTime(source.atualizadoEm || source.updatedAt || source.dataAtualizacao);
    const criadoEm = formatDateTime(source.criadoEm || source.createdAt || source.dataCriacao);
    const emprestimo = Boolean(source.emprestimo || source.isEmprestimo);
    const temporario = Boolean(source.temporario || source.provisorio);

    return {
      id: id || (nome ? String(nome).toLowerCase().replace(/\s+/g, '-') : null) || generateFallbackId(),
      nome: nome || 'Material sem identificação',
      patrimonio,
      quantidade,
      tipo,
      categoria,
      modalidade,
      descricao,
      status,
      transferenciaId,
      origemLabel,
      destinoLabel,
      atualizadoEm,
      criadoEm,
      emprestimo,
      temporario,
      raw: cloneData(base)
    };
  }

  function normalizeDestino(raw){
    const base = raw || {};
    const id = resolveIdentifier(base, ['id', '_id', 'areaId', 'area_id', 'codigo']);
    const nome = sanitize(base.nome || base.name || base.descricao || base.area || base.titulo);
    const unidade = pickFirstObject(base, ['unidade', 'condominio']);
    const unidadeNome = unidade ? sanitize(unidade.nome || unidade.name || unidade.descricao) : sanitize(base.unidadeNome || base.condominioNome);
    const label = [nome, unidadeNome].filter(Boolean).join(' • ') || nome || unidadeNome || 'Área de destino';
    return { id: id || generateFallbackId('dest'), nome, unidadeNome, label, raw: cloneData(raw) };
  }

  function resolveDestinosDisponiveis(material){
    const resultado = [];
    const vistos = new Set();
    const adicionar = lista => {
      if(!Array.isArray(lista)) return;
      lista.forEach(item => {
        if(!item) return;
        const normalizado = item && typeof item === 'object' && item.id && item.label && Object.prototype.hasOwnProperty.call(item, 'raw')
          ? item
          : normalizeDestino(item);
        if(!normalizado || !normalizado.id || vistos.has(normalizado.id)) return;
        vistos.add(normalizado.id);
        resultado.push(normalizado);
      });
    };
    adicionar(state.destinos);
    if(material && typeof material === 'object'){
      const pacotes = extrairPossiveisDestinos(material.raw || material);
      pacotes.forEach(adicionar);
    }
    return resultado;
  }

  function extrairPossiveisDestinos(fonte){
    if(!fonte || typeof fonte !== 'object') return [];
    const conjuntos = [];
    const candidatos = [fonte];
    ['material', 'item', 'dados', 'contexto', 'payload'].forEach(chave => {
      const valor = fonte[chave];
      if(valor && typeof valor === 'object') candidatos.push(valor);
    });
    const chaves = [
      'destinos', 'destinosDisponiveis', 'destinos_disponiveis', 'areasDestino', 'areas_destino',
      'areasDisponiveis', 'areas_disponiveis', 'destinosPossiveis', 'destinos_possiveis',
      'possiveisDestinos', 'listaDestinos', 'destinosTransferencia', 'destinos_transferencia'
    ];
    candidatos.forEach(base => {
      chaves.forEach(chave => {
        const valor = base && base[chave];
        if(Array.isArray(valor) && valor.length) conjuntos.push(valor);
      });
    });
    return conjuntos;
  }

  function normalizeLog(raw){
    const base = raw || {};
    const data = base.data || base.dataHora || base.createdAt || base.atualizadoEm;
    const dataFormatada = formatDateTime(data);
    return {
      id: resolveIdentifier(base, ['id', '_id', 'logId']) || generateFallbackId('log'),
      material: sanitize(base.material || base.materialNome || base.nomeMaterial),
      patrimonio: sanitize(base.patrimonio || base.materialPatrimonio || base.material_patrimonio || base.patrimonioMaterial || ''),
      acao: sanitize(base.acao || base.tipo || base.evento),
      origem: sanitize(base.origem || base.origemLabel || base.areaOrigem),
      destino: sanitize(base.destino || base.destinoLabel || base.areaDestino),
      usuario: sanitize(base.usuario || base.executadoPor || base.responsavel),
      obs: sanitize(base.obs || base.observacao || base.mensagem || base.detalhes),
      data: data ? String(data) : '',
      dataFormatada
    };
  }

  function resolveIdentifier(object, keys){
    if(!object) return '';
    for(const key of keys){
      const value = object[key];
      if(value === 0) return '0';
      if(value) return String(value);
    }
    return '';
  }

  function resolveNumber(){
    for(const value of arguments){
      if(value === null || value === undefined) continue;
      const num = Number(value);
      if(!Number.isNaN(num)) return num;
    }
    return 0;
  }

  function setText(node, value){
    if(node) node.textContent = value;
  }

  function sanitize(value){
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function escapeHtml(value){
    return String(value || '').replace(/[&<>"]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[match] || match));
  }

  function pickFirstObject(source, keys){
    if(!source) return null;
    for(const key of keys){
      const value = source[key];
      if(value && typeof value === 'object') return value;
    }
    return null;
  }

  function pickFirstArray(source, keys){
    if(!source) return [];
    for(const key of keys){
      const value = source[key];
      if(Array.isArray(value)) return value;
      if(value && typeof value === 'object'){
        const nestedKeys = ['lista', 'list', 'items', 'itens', 'values', 'dados', 'data', 'result', 'results', 'rows', 'collection'];
        for(const nestedKey of nestedKeys){
          const nestedValue = value[nestedKey];
          if(Array.isArray(nestedValue)) return nestedValue;
        }
        if(Array.isArray(value[0])){
          return value[0];
        }
      }
    }
    return [];
  }

  function formatCounter(count){
    const value = Number(count) || 0;
    return value === 1 ? '1 item' : `${value} itens`;
  }

  function formatQuantity(value){
    const number = Number(value);
    if(Number.isNaN(number)) return sanitize(value) || '1';
    return number % 1 === 0 ? String(number) : number.toFixed(2);
  }

  function formatDateTime(value){
    if(!value) return '';
    try{
      const date = value instanceof Date ? value : new Date(value);
      if(Number.isNaN(date.getTime())) return sanitize(value);
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
    }catch(err){
      return sanitize(value);
    }
  }

  function generateFallbackId(prefix){
    const seed = Math.random().toString(36).slice(2, 8);
    return `${prefix || 'mat'}-${seed}`;
  }

  function normalizeBasePath(raw){
    if(!raw) return '';
    let base = String(raw).trim();
    if(!base) return '';
    if(base.endsWith('/')) base = base.slice(0, -1);
    if(base && !/^https?:/i.test(base) && !base.startsWith('/')) base = '/' + base;
    return base;
  }

  function cloneData(value){
    try{
      if(typeof structuredClone === 'function') return structuredClone(value);
    }catch(err){
      // ignore structuredClone failure and fallback
    }
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      return value;
    }
  }

  function handleAreaAction(event){
    const detail = event && event.detail;
    if(!detail || detail.tipo !== MODAL_ACTION_KEY) return;
    openModal(detail);
  }

})(window, document);
