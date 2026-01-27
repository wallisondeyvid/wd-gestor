(function(){
  const modalEl = document.getElementById('modalTransferirMaterial');
  if(!modalEl || typeof bootstrap === 'undefined') return;

  const dom = {
    nome: modalEl.querySelector('[data-role="material-nome"]'),
    patrimonio: modalEl.querySelector('[data-role="material-patrimonio"]'),
    quantidade: modalEl.querySelector('[data-role="material-quantidade"]'),
    tipo: modalEl.querySelector('[data-role="material-tipo"]'),
    descricaoWrap: modalEl.querySelector('[data-role="material-descricao-wrap"]'),
    descricao: modalEl.querySelector('[data-role="material-descricao"]'),
    origemLegenda: modalEl.querySelector('[data-role="origem-legenda"]'),
    destinoSelect: modalEl.querySelector('[data-role="destino-select"]'),
    destinoLoading: modalEl.querySelector('[data-role="destino-loading"]'),
    destinoEmpty: modalEl.querySelector('[data-role="destino-empty"]'),
    feedback: modalEl.querySelector('[data-role="feedback"]'),
    cancelar: modalEl.querySelector('[data-role="cancelar"]'),
    confirmar: modalEl.querySelector('[data-role="confirmar"]')
  };

  const basePathAttr = modalEl.getAttribute('data-base-path') || document.body.getAttribute('data-base-path') || '';
  const BASE_PATH = normalizeBasePath(basePathAttr);
  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: false });
  const NO_DEST_MSG = 'Nenhuma area disponivel para receber este material.';

  let resolver = null;
  let currentContext = null;
  let isBusy = false;
  let isLoadingDestinos = false;
  let destinosLoaded = false;
  let destinosRequestId = 0;

  function setText(el, value){ if(!el) return; el.textContent = value || '--'; }

  function formatQuantidade(value){
    if(value === null || value === undefined) return '--';
    const num = Number(value);
    if(!Number.isFinite(num)) return String(value);
    return num.toLocaleString('pt-BR');
  }

  function buildAreaLabel(area){
    if(!area) return '';
    if(typeof area.label === 'string' && area.label) return area.label;
    const nome = sanitize(area.nome || area.descricao || area.titulo);
    const codigo = sanitize(area.codigo || area.sigla || area.identificador);
    if(nome && codigo && codigo !== nome) return nome + ' (' + codigo + ')';
    return nome || codigo || '';
  }

  function buildUnidadeLabel(unidade){
    if(!unidade) return '';
    if(typeof unidade === 'string') return unidade;
    if(typeof unidade.label === 'string' && unidade.label) return unidade.label;
    const codigo = sanitize(unidade.codigo || unidade.sigla || unidade.identificador);
    const nome = sanitize(unidade.nome || unidade.descricao || unidade.titulo);
    if(nome && codigo && codigo !== nome) return codigo + ' - ' + nome;
    return nome || codigo || '';
  }

  function sanitizeDestinos(array, ignore){
    if(!Array.isArray(array)) return [];
    const skip = normalizeIdSet(ignore);
    const seen = new Set();
    return array.reduce((acc, item) => {
      if(!item || typeof item !== 'object') return acc;
      const id = resolveId(item);
      if(!id || skip.has(id) || seen.has(id)) return acc;
      seen.add(id);
      const unidade = pickFirstObject(item, ['unidade', 'condominio', 'origemUnidade']);
      const areaLabel = buildAreaLabel(item) || item.nome || id;
      const unidadeLabel = buildUnidadeLabel(unidade);
      const labelParts = [areaLabel];
      if(unidadeLabel && unidadeLabel !== areaLabel) labelParts.push(unidadeLabel);
      acc.push({ id, label: labelParts.filter(Boolean).join(' - ') || areaLabel || unidadeLabel || id, raw: deepClone(item) });
      return acc;
    }, []);
  }

  function populateDestinos(destinos){
    if(!dom.destinoSelect) return;
    dom.destinoSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione...';
    dom.destinoSelect.appendChild(placeholder);
    destinos.forEach(dest => {
      const option = document.createElement('option');
      option.value = dest.id;
      option.textContent = dest.label;
      dom.destinoSelect.appendChild(option);
    });
    dom.destinoSelect.value = '';
  }

  function fillMaterialInfo(context){
    const material = context.material || {};
    setText(dom.nome, material.nome || material.label || 'Material');
    setText(dom.patrimonio, material.patrimonio || material.codigo || '--');
    setText(dom.quantidade, formatQuantidade(material.quantidade));
    setText(dom.tipo, material.tipo || material.categoria || '--');
    const descricao = material.descricao || material.observacao || material.obs || '';
    if(dom.descricaoWrap){
      if(descricao){
        dom.descricaoWrap.classList.remove('d-none');
        setText(dom.descricao, descricao);
      } else {
        dom.descricaoWrap.classList.add('d-none');
        setText(dom.descricao, '--');
      }
    }
    const unidadeLabel = buildUnidadeLabel(context.origem && context.origem.unidade);
    const areaLabel = buildAreaLabel(context.origem && context.origem.area);
    if(dom.origemLegenda){
      const parts = [];
      if(unidadeLabel) parts.push(unidadeLabel);
      if(areaLabel) parts.push(areaLabel);
      dom.origemLegenda.textContent = parts.length ? parts.join(' - ') : '--';
    }
  }

  function hasDestinosDisponiveis(){
    return currentContext && Array.isArray(currentContext.destinos) && currentContext.destinos.length > 0;
  }

  function syncControlState(){
    if(isLoadingDestinos){
      if(dom.destinoSelect) dom.destinoSelect.disabled = true;
      if(dom.confirmar) dom.confirmar.disabled = true;
      return;
    }
    const hasDest = hasDestinosDisponiveis();
    if(dom.destinoSelect) dom.destinoSelect.disabled = !hasDest;
    if(dom.confirmar) dom.confirmar.disabled = isBusy || !hasDest;
    if(hasDest){
      if(dom.feedback && dom.feedback.textContent === NO_DEST_MSG) setFeedback('');
      setDestinosEmpty(false);
    } else if(destinosLoaded){
      setFeedback(NO_DEST_MSG);
      setDestinosEmpty(true);
    }
  }

  function setFeedback(message){
    if(!dom.feedback) return;
    dom.feedback.textContent = message || '';
  }

  function setBusy(active){
    isBusy = !!active;
    if(dom.cancelar) dom.cancelar.disabled = !!active;
    if(active) modalEl.classList.add('is-loading');
    else modalEl.classList.remove('is-loading');
    syncControlState();
  }

  function setDestinosLoading(active){
    if(dom.destinoLoading) dom.destinoLoading.classList.toggle('d-none', !active);
  }

  function setDestinosEmpty(active){
    if(dom.destinoEmpty) dom.destinoEmpty.classList.toggle('d-none', !active);
  }

  function finalize(result){
    const output = result || { ok: false, cancelled: true };
    const resolve = resolver;
    resolver = null;
    currentContext = null;
    destinosRequestId += 1;
      destinosLoaded = false;
      isLoadingDestinos = false;
      setDestinosLoading(false);
      setDestinosEmpty(false);
      setBusy(false);
      setFeedback('');
    try{ bsModal.hide(); }catch(_err){ modalEl.style.display = 'none'; }
    if(typeof resolve === 'function'){
      resolve(output);
    }
  }

  function handleConfirm(){
    if(isBusy) return;
    if(isLoadingDestinos){
      setFeedback('Aguarde o carregamento das areas.');
      return;
    }
    if(!hasDestinosDisponiveis()){
      setFeedback(NO_DEST_MSG);
      return;
    }
    if(!currentContext || typeof currentContext.onSubmit !== 'function'){
      finalize({ ok: false, cancelled: true });
      return;
    }
    const destinoId = dom.destinoSelect ? dom.destinoSelect.value : '';
    if(!destinoId){
      setFeedback('Selecione a area de destino.');
      return;
    }
    setFeedback('');
    setBusy(true);
    Promise.resolve(currentContext.onSubmit({ destinoId }))
      .then(result => {
        if(!result || result.ok === false){
          const message = result && result.message ? result.message : 'Falha ao registrar a transferencia.';
          setFeedback(message);
          setBusy(false);
          return;
        }
        finalize({ ok: true, destinoId });
      })
      .catch(err => {
        console.warn('[modal_transferir_material] falha ao confirmar transferencia', err);
        setFeedback('Nao foi possivel concluir a transferencia.');
        setBusy(false);
      });
  }

  function handleCancel(){
    if(isBusy) return;
    finalize({ ok: false, cancelled: true });
  }

  modalEl.addEventListener('hidden.bs.modal', () => {
    if(resolver){
      const resolve = resolver;
      resolver = null;
      currentContext = null;
      destinosRequestId += 1;
      setBusy(false);
      setFeedback('');
      destinosLoaded = false;
      isLoadingDestinos = false;
      setDestinosLoading(false);
      setDestinosEmpty(false);
      resolve({ ok: false, cancelled: true });
    }
  });

  if(dom.confirmar) dom.confirmar.addEventListener('click', handleConfirm);
  if(dom.cancelar) dom.cancelar.addEventListener('click', handleCancel);

  window.WDG_MATERIAL_TRANSFER = {
    abrir(context){
      destinosRequestId += 1;
      const areaId = resolveId(context && (context.areaId !== undefined ? context.areaId : context?.origem?.area));
      const unidadeId = resolveId(context && (context.unidadeId !== undefined ? context.unidadeId : context?.origem?.unidade));
      const ignore = normalizeIdSet(areaId ? [areaId] : []);
      currentContext = {
        material: context && context.material ? deepClone(context.material) : {},
        origem: {
          area: context && context.origem && context.origem.area ? deepClone(context.origem.area) : null,
          unidade: context && context.origem && context.origem.unidade ? deepClone(context.origem.unidade) : null
        },
        areaId,
        unidadeId,
        destinos: mergeDestinos([], sanitizeDestinos(context && context.destinos, ignore), ignore),
        onSubmit: typeof context?.onSubmit === 'function' ? context.onSubmit : null,
        destinosHydrated: false
      };
      destinosLoaded = currentContext.destinos.length > 0;
      isLoadingDestinos = false;
      setDestinosLoading(false);
      setDestinosEmpty(false);
      populateDestinos(currentContext.destinos);
      fillMaterialInfo(currentContext);
      setFeedback('');
      setBusy(false);
      setTimeout(() => {
        try{ dom.destinoSelect && dom.destinoSelect.focus({ preventScroll: true }); }catch(_err){}
      }, 120);
      bsModal.show();
      hydrateDestinos(destinosRequestId, ignore);
      return new Promise(resolve => {
        resolver = resolve;
      });
    }
  };

  function hydrateDestinos(requestId, ignore){
    if(!currentContext) return;
    const ignoreIds = normalizeIdSet(ignore);
    const unidadeId = currentContext.unidadeId;
    if(currentContext.destinosHydrated){
      destinosLoaded = hasDestinosDisponiveis();
      if(!destinosLoaded) setDestinosEmpty(true);
      syncControlState();
      return;
    }
    if(!unidadeId || typeof window.fetch !== 'function'){
      currentContext.destinosHydrated = true;
      destinosLoaded = hasDestinosDisponiveis();
      if(!destinosLoaded) setDestinosEmpty(true);
      syncControlState();
      return;
    }
    if(isLoadingDestinos) return;
    isLoadingDestinos = true;
    setDestinosLoading(true);
    setDestinosEmpty(false);
    setFeedback('');
    syncControlState();
    fetchDestinos(unidadeId).then(lista => {
      if(requestId !== destinosRequestId) return;
      const extras = sanitizeDestinos(lista, ignoreIds);
      currentContext.destinos = mergeDestinos(currentContext.destinos, extras, ignoreIds);
      currentContext.destinosHydrated = true;
      destinosLoaded = true;
      populateDestinos(currentContext.destinos);
      if(!currentContext.destinos.length) setDestinosEmpty(true);
    }).catch(err => {
      if(requestId !== destinosRequestId) return;
      console.warn('[modal_transferir_material] falha ao carregar destinos', err);
      currentContext.destinosHydrated = true;
      destinosLoaded = hasDestinosDisponiveis();
      if(!destinosLoaded) setDestinosEmpty(true);
      if(dom.feedback && !dom.feedback.textContent) setFeedback('Nao foi possivel carregar as areas disponiveis.');
    }).finally(() => {
      if(requestId !== destinosRequestId) return;
      isLoadingDestinos = false;
      if(!currentContext.destinosHydrated) currentContext.destinosHydrated = true;
      setDestinosLoading(false);
      syncControlState();
    });
  }

  async function fetchDestinos(unidadeId){
    const url = buildAreasUrl(unidadeId);
    if(!url) return [];
    const res = await fetch(url, { credentials: 'same-origin' });
    if(!res.ok) return [];
    const data = await res.json().catch(() => null);
    return extractAreaList(data);
  }

  function buildAreasUrl(unidadeId){
    const base = BASE_PATH || '';
    const root = (base || '') + '/api/areas-comuns/busca';
    const params = new URLSearchParams();
    if(unidadeId) params.append('unidade', unidadeId);
    params.append('_ts', Date.now());
    return root + '?' + params.toString();
  }

  function extractAreaList(payload){
    if(Array.isArray(payload)) return payload;
    if(!payload || typeof payload !== 'object') return [];
    const keys = ['items', 'lista', 'list', 'areas', 'dados', 'data', 'result', 'results', 'rows'];
    for(const key of keys){
      if(Array.isArray(payload[key])) return payload[key];
    }
    return [];
  }

  function mergeDestinos(existing, extras, ignore){
    const skip = normalizeIdSet(ignore);
    const seen = new Set();
    const merged = [];
    const push = item => {
      if(!item || !item.id) return;
      const id = String(item.id);
      if(seen.has(id) || skip.has(id)) return;
      seen.add(id);
      merged.push(item);
    };
    (Array.isArray(existing) ? existing : []).forEach(push);
    (Array.isArray(extras) ? extras : []).forEach(push);
    return merged;
  }

  function normalizeIdSet(input){
    if(input instanceof Set) return input;
    const set = new Set();
    if(Array.isArray(input)){
      input.forEach(value => {
        if(value === null || value === undefined) return;
        set.add(String(value));
      });
    } else if(input){
      set.add(String(input));
    }
    return set;
  }

  function resolveId(value){
    if(value === null || value === undefined) return '';
    if(typeof value === 'string' || typeof value === 'number') return String(value);
    if(typeof value !== 'object') return '';
    return resolveIdentifier(value, ['id', '_id', 'areaId', 'area_id', 'codigo', 'uid']);
  }

  function resolveIdentifier(object, keys){
    if(!object) return '';
    for(const key of keys){
      const value = object[key];
      if(value === null || value === undefined || value === '') continue;
      return String(value);
    }
    return '';
  }

  function pickFirstObject(source, keys){
    if(!source || typeof source !== 'object') return null;
    for(const key of keys){
      const value = source[key];
      if(value && typeof value === 'object') return value;
    }
    return null;
  }

  function sanitize(value){
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function deepClone(value){
    try{ return JSON.parse(JSON.stringify(value)); }
    catch(_err){ return value; }
  }

  function normalizeBasePath(raw){
    if(!raw) return '';
    let base = String(raw).trim();
    if(!base) return '';
    if(!base.startsWith('/')) base = '/' + base;
    if(base.endsWith('/')) base = base.slice(0, -1);
    return base;
  }
})();
