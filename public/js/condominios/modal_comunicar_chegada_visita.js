(function(){
  function qs(sel, root){ return (root || document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function getBasePath(){
    try{
      const bp = (document.body && document.body.getAttribute('data-base-path')) || '';
      const v = String(bp || '').trim();
      return v ? v : '/condominios';
    }catch{ return '/condominios'; }
  }
  function escapeHtml(s){
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function isSameLocalDay(a, b){
    if(!a || !b) return false;
    const da = new Date(a);
    const db = new Date(b);
    if(!Number.isFinite(da.getTime()) || !Number.isFinite(db.getTime())) return false;
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }

  const chegadaModalEl = document.getElementById('wdgChegadaVisitaModal');
  const addModalEl = document.getElementById('wdgChegadaAddVisitanteModal');
  if(!chegadaModalEl || !addModalEl) return;

  const chegadaTitle = document.getElementById('wdgChegadaVisitaTitle');
  const chegadaSubtitle = document.getElementById('wdgChegadaVisitaSubtitle');
  const chegadaList = document.getElementById('wdgChegadaVisitaList');
  const chegadaEmpty = document.getElementById('wdgChegadaVisitaEmpty');
  const chegadaAddBtn = document.getElementById('wdgChegadaVisitaAddBtn');
  const chegadaComunicarBtn = document.getElementById('wdgChegadaVisitaComunicarBtn');

  const formEl = document.getElementById('wdgChegadaAddVisitanteForm');
  const addNome = document.getElementById('wdgChegadaAddNome');
  const addRg = document.getElementById('wdgChegadaAddRg');
  const addCpf = document.getElementById('wdgChegadaAddCpf');
  const addTel = document.getElementById('wdgChegadaAddTel');
  const addObs = document.getElementById('wdgChegadaAddObs');
  const addVehicleToggle = document.getElementById('wdgChegadaAddVeiculoToggle');
  const addVehicleFieldset = document.getElementById('wdgChegadaAddVeiculoFields');
  const addVehicleType = document.getElementById('wdgChegadaAddVeiculoTipo');
  const addVehiclePlate = document.getElementById('wdgChegadaAddPlaca');
  const addVehicleBrand = document.getElementById('wdgChegadaAddMarca');
  const addVehicleModelo = document.getElementById('wdgChegadaAddModelo');
  const addVehicleCor = document.getElementById('wdgChegadaAddCor');
  const addVehicleAno = document.getElementById('wdgChegadaAddAno');
  const addVehicleFields = addVehicleFieldset ? qsa('[data-vehicle-field]', addVehicleFieldset) : [];
  const addSubmit = document.getElementById('wdgChegadaAddSubmit');
  const addTitleEl = document.getElementById('wdgChegadaAddVisitanteTitle');
  const addSubtitleEl = document.getElementById('wdgChegadaAddVisitanteSubtitle');

  const bsChegada = window.bootstrap && window.bootstrap.Modal ? window.bootstrap.Modal.getOrCreateInstance(chegadaModalEl) : null;
  const bsAdd = window.bootstrap && window.bootstrap.Modal ? window.bootstrap.Modal.getOrCreateInstance(addModalEl) : null;

  let currentVisita = null;
  let draftVisitantes = [];
  let editingIndex = null;
  let editingIsPrincipal = false;

  function setAddModalMode(mode){
    // mode: 'add' | 'edit-principal' | 'edit'
    if(mode === 'edit-principal'){
      if(addTitleEl) addTitleEl.textContent = 'Editar visitante principal';
      if(addSubtitleEl) addSubtitleEl.textContent = 'Corrija nome/documentos e dados de veículo, se necessário.';
      if(addSubmit) addSubmit.textContent = 'Salvar';
      return;
    }
    if(mode === 'edit'){
      if(addTitleEl) addTitleEl.textContent = 'Editar visitante';
      if(addSubtitleEl) addSubtitleEl.textContent = 'Atualize os dados do acompanhante.';
      if(addSubmit) addSubmit.textContent = 'Salvar';
      return;
    }
    if(addTitleEl) addTitleEl.textContent = 'Adicionar visitante';
    if(addSubtitleEl) addSubtitleEl.textContent = 'Visitante acompanhando a visita comunicada.';
    if(addSubmit) addSubmit.textContent = 'Adicionar';
  }

  const VEHICLE_TYPES = [
    'Carro',
    'Motocicleta',
    'Caminhonete',
    'Utilitário',
    'Caminhão',
    'Ônibus',
    'Van',
    'SUV',
    'Pick-up',
    'Trator',
    'Quadriciclo',
    'Bicicleta',
    'Patinete',
    'Reboque',
    'Semirreboque',
    'Embarcação',
    'Outro'
  ];

  let vehicleBrandMapCache = null;
  let vehicleBrandMapPromise = null;

  function normKey(s){
    try{
      const v = String(s || '').trim().toLowerCase();
      return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch {
      return String(s || '').trim().toLowerCase();
    }
  }

  async function fetchJsonAny(urls){
    const list = Array.isArray(urls) ? urls : [urls];
    for(const u of list){
      if(!u) continue;
      try{
        const r = await fetch(u, { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' } });
        if(!r.ok) continue;
        const j = await r.json();
        return j;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  async function getVehicleBrandMap(){
    if(vehicleBrandMapCache) return vehicleBrandMapCache;
    if(vehicleBrandMapPromise) return vehicleBrandMapPromise;
    const bp = getBasePath();
    const urls = [
      `${bp}/data/marcas_veiculos_por_tipo.json`,
      '/gestor/data/marcas_veiculos_por_tipo.json',
      '/data/marcas_veiculos_por_tipo.json',
      `${bp}/data/marcas_veiculos.json`,
      '/gestor/data/marcas_veiculos.json',
      '/data/marcas_veiculos.json'
    ];
    vehicleBrandMapPromise = (async () => {
      const data = await fetchJsonAny(urls);
      const map = {};
      if(Array.isArray(data)){
        // Lista simples de marcas
        map['*'] = data.map(x => String(x || '').trim()).filter(Boolean);
      } else if(data && typeof data === 'object') {
        // Mapa por tipo (ideal)
        Object.keys(data).forEach(k => {
          const arr = Array.isArray(data[k]) ? data[k] : [];
          map[normKey(k)] = arr.map(x => String(x || '').trim()).filter(Boolean);
        });
      }
      vehicleBrandMapCache = map;
      vehicleBrandMapPromise = null;
      return map;
    })();
    return vehicleBrandMapPromise;
  }

  function initVehicleTypeOptions(){
    if(!addVehicleType) return;
    if(addVehicleType.dataset.init === '1') return;
    addVehicleType.dataset.init = '1';
    VEHICLE_TYPES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      addVehicleType.appendChild(opt);
    });
  }

  async function refreshVehicleBrands(){
    if(!addVehicleBrand) return;
    if(!addVehicleType) return;
    const tipo = String(addVehicleType.value || '').trim();
    const key = normKey(tipo);
    const map = await getVehicleBrandMap();
    const list = (map && map[key] && map[key].length) ? map[key] : (map && map['*'] ? map['*'] : []);

    addVehicleBrand.innerHTML = '';
    if(!tipo){
      addVehicleBrand.disabled = true;
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Selecione o tipo do veículo';
      addVehicleBrand.appendChild(opt);
      return;
    }

    const first = document.createElement('option');
    first.value = '';
    first.textContent = list.length ? 'Selecione' : 'Selecione o tipo do veículo';
    addVehicleBrand.appendChild(first);

    list.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      addVehicleBrand.appendChild(opt);
    });
    addVehicleBrand.disabled = !list.length;
  }

  function setVehicleUiEnabled(enabled){
    if(!addVehicleFieldset) return;
    addVehicleFieldset.style.display = enabled ? '' : 'none';
    if(!enabled){
      addVehicleFields.forEach(el => {
        try{ el.value = ''; }catch{ /* noop */ }
      });
      if(addVehicleBrand){
        addVehicleBrand.disabled = true;
        addVehicleBrand.innerHTML = '<option value="">Selecione o tipo do veículo</option>';
      }
      if(addVehicleType){
        try{ addVehicleType.value = ''; }catch{ /* noop */ }
      }
    }
  }

  function toastSuccess(msg){
    try{
      if(window.WDG && window.WDG.notification && typeof window.WDG.notification.success === 'function'){
        window.WDG.notification.success(msg);
        return;
      }
    }catch{ /* noop */ }
  }

  function toastDanger(msg){
    try{
      if(window.WDG && window.WDG.notification && typeof window.WDG.notification.danger === 'function'){
        window.WDG.notification.danger(msg);
        return;
      }
    }catch{ /* noop */ }
    try{ alert(msg); }catch{ /* noop */ }
  }

  async function apiPostJson(url, body){
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {})
    });
    const text = await res.text();
    let json = null;
    try{ json = text ? JSON.parse(text) : null; }catch{ json = null; }
    if(!res.ok){
      const msg = (json && (json.error || json.message)) ? (json.error || json.message) : (text || 'Falha na requisição');
      const err = new Error(msg);
      err.status = res.status;
      err.payload = json;
      throw err;
    }
    return json;
  }

  function normalizeVisitanteInput(v){
    const nome = String(v?.nome || '').trim();
    if(!nome) return null;
    return {
      nome,
      rg: String(v?.rg || '').trim(),
      cpf: String(v?.cpf || '').trim(),
      tel: String(v?.tel || '').trim(),
      motivo: String(v?.motivo || '').trim(),
      observacoes: String(v?.observacoes || '').trim(),
      veiculo: v?.veiculo && typeof v.veiculo === 'object'
        ? {
            tipo: String(v.veiculo.tipo || '').trim(),
            placa: String(v.veiculo.placa || '').trim(),
            marca: String(v.veiculo.marca || '').trim(),
            modelo: String(v.veiculo.modelo || '').trim(),
            cor: String(v.veiculo.cor || '').trim(),
            ano: String(v.veiculo.ano || '').trim()
          }
        : null,
      principal: v?.principal === true
    };
  }

  function uniqVisitantes(list){
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach(v => {
      const nv = normalizeVisitanteInput(v);
      if(!nv) return;
      const key = `${String(nv.nome||'').toLowerCase()}|${String(nv.rg||'')}|${String(nv.cpf||'')}`;
      if(seen.has(key)) return;
      seen.add(key);
      out.push(nv);
    });
    out.sort((a,b)=> (b.principal?1:0) - (a.principal?1:0));
    return out;
  }

  function buildInitialDraft(visita){
    const now = new Date();
    const principalNome = String(visita?.visitanteNome || '').trim();
    const principal = principalNome ? {
      nome: principalNome,
      rg: String(visita?.visitanteRg || '').trim(),
      cpf: String(visita?.visitanteCpf || '').trim(),
      tel: String(visita?.visitanteTel || '').trim(),
      motivo: String(visita?.finalidadeLabel || visita?.finalidade || '').trim(),
      observacoes: String(visita?.observacoes || '').trim(),
      veiculo: visita?.veiculo && typeof visita.veiculo === 'object'
        ? {
            tipo: String(visita.veiculo.tipo || '').trim(),
            placa: String(visita.veiculo.placa || '').trim(),
            marca: String(visita.veiculo.marca || '').trim(),
            modelo: String(visita.veiculo.modelo || '').trim(),
            cor: String(visita.veiculo.cor || '').trim(),
            ano: String(visita.veiculo.ano || '').trim()
          }
        : null,
      principal: true
    } : null;

    // Se a chegada já foi comunicada hoje, reaproveita somente os acompanhantes do dia.
    const extras = (Array.isArray(visita?.chegadaVisitantes) ? visita.chegadaVisitantes : [])
      .filter(Boolean)
      .filter(v => v?.principal !== true)
      .filter(v => v?.criadoEm && isSameLocalDay(v.criadoEm, now))
      .map(v => ({
        nome: String(v?.nome || '').trim(),
        rg: String(v?.rg || '').trim(),
        cpf: String(v?.cpf || '').trim(),
        tel: String(v?.tel || '').trim(),
        motivo: String(v?.motivo || '').trim(),
        observacoes: String(v?.observacoes || '').trim(),
        veiculo: v?.veiculo && typeof v.veiculo === 'object'
          ? {
              tipo: String(v.veiculo.tipo || '').trim(),
              placa: String(v.veiculo.placa || '').trim(),
              marca: String(v.veiculo.marca || '').trim(),
              modelo: String(v.veiculo.modelo || '').trim(),
              cor: String(v.veiculo.cor || '').trim(),
              ano: String(v.veiculo.ano || '').trim()
            }
          : null,
        principal: false
      }));

    return uniqVisitantes([...(principal ? [principal] : []), ...extras]);
  }

  function renderList(){
    const visitantes = uniqVisitantes(draftVisitantes);
    if(chegadaEmpty) chegadaEmpty.classList.toggle('d-none', visitantes.length > 0);
    if(!chegadaList) return;
    const bp = getBasePath();
    const editIconUrl = `${bp}/images/editar.png`;
    const deleteIconUrl = `${bp}/images/excluir.png`;
    chegadaList.innerHTML = visitantes.map(v => {
      const idx = draftVisitantes.findIndex(it => {
        const a = normalizeVisitanteInput(it);
        const b = normalizeVisitanteInput(v);
        if(!a || !b) return false;
        return String(a.nome).toLowerCase() === String(b.nome).toLowerCase()
          && String(a.rg||'') === String(b.rg||'')
          && String(a.cpf||'') === String(b.cpf||'')
          && Boolean(a.principal) === Boolean(b.principal);
      });

      const left = `
        <span class="wdg-hab-inline-marker ${v.principal ? 'is-new' : 'is-old'}" role="img" aria-label="${v.principal ? 'Principal' : 'Acompanhante'}" title="${v.principal ? 'Principal' : 'Acompanhante'}"></span>
      `;
      const subParts = [];
      if(v.motivo) subParts.push(v.motivo);
      if(v.rg) subParts.push(`RG ${v.rg}`);
      if(v.cpf) subParts.push(`CPF ${v.cpf}`);
      if(v.tel) subParts.push(`Tel ${v.tel}`);
      if(v.veiculo && (v.veiculo.placa || v.veiculo.tipo)){
        const parts = [];
        if(v.veiculo.placa) parts.push(`Placa ${v.veiculo.placa}`);
        if(v.veiculo.tipo) parts.push(v.veiculo.tipo);
        subParts.push(`Veículo ${parts.join(' · ')}`.trim());
      }
      const sub = subParts.join(' · ');

      const badge = v.principal
        ? '<span class="wdg-chip wdg-chip--primary" title="Visitante principal">Principal</span>'
        : '<span class="wdg-chip" title="Visitante acompanhante">Acompanhante</span>';

      const actions = v.principal
        ? `
          <span class="ms-auto d-flex align-items-center gap-2 wdg-row-actions">
            <button type="button" class="wdg-hab-inline-icon-btn" data-action="edit" data-index="${idx}" aria-label="Editar visitante principal" title="Editar">
              <img src="${escapeHtml(editIconUrl)}" alt="Editar" />
            </button>
          </span>
        `
        : `
          <span class="ms-auto d-flex align-items-center gap-2 wdg-row-actions">
            <button type="button" class="wdg-hab-inline-icon-btn" data-action="edit" data-index="${idx}" aria-label="Editar visitante" title="Editar">
              <img src="${escapeHtml(editIconUrl)}" alt="Editar" />
            </button>
            <button type="button" class="wdg-hab-inline-icon-btn" data-action="delete" data-index="${idx}" aria-label="Excluir visitante" title="Excluir">
              <img src="${escapeHtml(deleteIconUrl)}" alt="Excluir" />
            </button>
          </span>
        `;

      return `
        <div class="wdg-hab-inline-row" role="listitem" data-row-index="${idx}">
          ${left}
          <span class="wdg-hab-inline-text">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <strong style="font-weight:500">${escapeHtml(v.nome)}</strong>
              ${badge}
            </div>
            ${sub ? `<small>${escapeHtml(sub)}</small>` : ''}
          </span>
          ${actions}
        </div>
      `;
    }).join('');
  }

  async function comunicarChegada(visita, visitantesDraft){
    if(!visita || !visita._id) throw new Error('Visita inválida');
    const bp = getBasePath();
    const url = `${bp}/api/visitas/${encodeURIComponent(String(visita._id))}/chegada`;
    const all = uniqVisitantes(visitantesDraft);
    const principal = all.find(v => v && v.principal) || null;
    const principalPayload = principal ? {
      nome: principal.nome,
      rg: principal.rg,
      cpf: principal.cpf,
      tel: principal.tel,
      observacoes: principal.observacoes,
      veiculo: principal.veiculo
    } : null;

    const visitantes = all
      .filter(v => v && !v.principal)
      .map(v => ({
        nome: v.nome,
        rg: v.rg,
        cpf: v.cpf,
        tel: v.tel,
        motivo: v.motivo,
        observacoes: v.observacoes,
        veiculo: v.veiculo
      }));

    const json = await apiPostJson(url, { principal: principalPayload, visitantes });
    return json && json.visita ? json.visita : json;
  }

  function resetAddForm(){
    if(formEl) formEl.reset();
    if(addNome) addNome.value = '';
    if(addRg) addRg.value = '';
    if(addCpf) addCpf.value = '';
    if(addTel) addTel.value = '';
    if(addObs) addObs.value = '';
    if(addVehicleToggle) addVehicleToggle.checked = false;
    setVehicleUiEnabled(false);
    editingIndex = null;
    editingIsPrincipal = false;
    setAddModalMode('add');
  }

  function fillAddFormFromVisitante(v){
    if(!v) return;
    if(addNome) addNome.value = String(v.nome || '').trim();
    if(addRg) addRg.value = String(v.rg || '').trim();
    if(addCpf) addCpf.value = String(v.cpf || '').trim();
    if(addTel) addTel.value = String(v.tel || '').trim();
    if(addObs) addObs.value = String(v.observacoes || v.motivo || '').trim();

    const hasVehicle = !!(v.veiculo && (v.veiculo.tipo || v.veiculo.placa || v.veiculo.marca || v.veiculo.modelo || v.veiculo.cor || v.veiculo.ano));
    if(addVehicleToggle) addVehicleToggle.checked = hasVehicle;
    setVehicleUiEnabled(hasVehicle);
    if(hasVehicle && v.veiculo){
      initVehicleTypeOptions();
      if(addVehicleType) addVehicleType.value = String(v.veiculo.tipo || '').trim();
      if(addVehiclePlate) addVehiclePlate.value = String(v.veiculo.placa || '').trim();
      if(addVehicleModelo) addVehicleModelo.value = String(v.veiculo.modelo || '').trim();
      if(addVehicleCor) addVehicleCor.value = String(v.veiculo.cor || '').trim();
      if(addVehicleAno) addVehicleAno.value = String(v.veiculo.ano || '').trim();
      refreshVehicleBrands().then(function(){
        try{ if(addVehicleBrand) addVehicleBrand.value = String(v.veiculo.marca || '').trim(); }catch{ /* noop */ }
      });
    }
  }

  function resolveMoradorLabel(visita, hab){
    const name = String(
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

    const email = String(
      visita?.morador_email ||
      visita?.moradorEmail ||
      visita?.morador?.email ||
      hab?.morador_email ||
      hab?.moradorEmail ||
      hab?.morador?.email ||
      ''
    ).trim();

    return name || email;
  }

  async function openChegadaModal(visita, ctx){
    currentVisita = visita || null;
    if(!currentVisita || !currentVisita._id) return;

    draftVisitantes = buildInitialDraft(currentVisita);
    editingIndex = null;

    const habNome = String(currentVisita.habitacaoNome || '').trim();
    const hab = ctx && ctx.hab ? ctx.hab : null;
    const moradorLabel = resolveMoradorLabel(currentVisita, hab);
    if(chegadaTitle) chegadaTitle.textContent = 'Comunicar chegada';
    if(chegadaSubtitle) chegadaSubtitle.textContent = [habNome ? `Habitação: ${habNome}` : '', moradorLabel ? `Morador: ${moradorLabel}` : ''].filter(Boolean).join(' · ');

    renderList();

    if(bsChegada) bsChegada.show();
    else {
      chegadaModalEl.classList.add('show');
      chegadaModalEl.style.display = 'block';
      chegadaModalEl.removeAttribute('aria-hidden');
    }
  }

  if(chegadaComunicarBtn){
    chegadaComunicarBtn.addEventListener('click', async function(){
      if(!currentVisita || !currentVisita._id) return;
      if(chegadaComunicarBtn) chegadaComunicarBtn.disabled = true;
      try{
        const updated = await comunicarChegada(currentVisita, draftVisitantes);
        currentVisita = updated || currentVisita;

        try{
          if(window.__wdgLastVisitaInfo && window.__wdgLastVisitaInfo.visita && String(window.__wdgLastVisitaInfo.visita._id || '') === String(currentVisita._id || '')){
            window.__wdgLastVisitaInfo.visita = currentVisita;
          }
        } catch(_e){ /* noop */ }

        try{
          if(typeof window.wdgRefreshVisitaInfoComms === 'function'){
            window.wdgRefreshVisitaInfoComms();
          }
        } catch(_e){ /* noop */ }

        // Recria o rascunho com base no que o backend salvou (somente dia atual)
        draftVisitantes = buildInitialDraft(currentVisita);
        renderList();
        toastSuccess('Visita comunicada.');
      } catch(err){
        toastDanger(err?.message || 'Falha ao comunicar visita.');
      } finally {
        if(chegadaComunicarBtn) chegadaComunicarBtn.disabled = false;
      }
    });
  }

  if(chegadaAddBtn){
    chegadaAddBtn.addEventListener('click', function(){
      if(!currentVisita || !currentVisita._id) return;
      resetAddForm();
      setAddModalMode('add');
      initVehicleTypeOptions();
      if(addVehicleType) refreshVehicleBrands();

      if(bsAdd) bsAdd.show();
      else {
        addModalEl.classList.add('show');
        addModalEl.style.display = 'block';
        addModalEl.removeAttribute('aria-hidden');
      }
    });
  }

  if(addVehicleToggle){
    addVehicleToggle.addEventListener('change', function(){
      setVehicleUiEnabled(!!addVehicleToggle.checked);
      if(addVehicleToggle.checked){
        initVehicleTypeOptions();
        if(addVehicleType) refreshVehicleBrands();
      }
    });
  }
  if(addVehicleType){
    addVehicleType.addEventListener('change', function(){
      refreshVehicleBrands();
    });
  }

  if(chegadaList){
    chegadaList.addEventListener('click', function(e){
      const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if(!btn) return;
      const action = String(btn.getAttribute('data-action') || '').trim();
      const idx = Number(btn.getAttribute('data-index'));
      if(!Number.isFinite(idx) || idx < 0) return;

      const cur = draftVisitantes[idx];
      const nv = normalizeVisitanteInput(cur);
      if(!nv) return;

      if(nv.principal && action === 'delete'){
        toastDanger('Visitante principal não pode ser excluído.');
        return;
      }

      if(action === 'edit'){
        editingIndex = idx;
        editingIsPrincipal = !!nv.principal;
        setAddModalMode(editingIsPrincipal ? 'edit-principal' : 'edit');
        initVehicleTypeOptions();
        fillAddFormFromVisitante(nv);

        if(bsAdd) bsAdd.show();
        else {
          addModalEl.classList.add('show');
          addModalEl.style.display = 'block';
          addModalEl.removeAttribute('aria-hidden');
        }
        return;
      }

      if(action === 'delete'){
        draftVisitantes.splice(idx, 1);
        draftVisitantes = uniqVisitantes(draftVisitantes);
        renderList();
        return;
      }

      if(action === 'edit'){
        editingIndex = idx;
        resetAddForm();
        editingIndex = idx;
        fillAddFormFromVisitante(nv);
        if(addSubmit) addSubmit.textContent = 'Salvar';
        if(bsAdd) bsAdd.show();
      }
    });
  }

  if(formEl){
    formEl.addEventListener('submit', async function(e){
      e.preventDefault();
      if(!currentVisita || !currentVisita._id) return;
      const nome = String(addNome && addNome.value || '').trim();
      const rg = String(addRg && addRg.value || '').trim();
      const cpf = String(addCpf && addCpf.value || '').trim();
      const tel = String(addTel && addTel.value || '').trim();
      const observacoes = String(addObs && addObs.value || '').trim();
      if(!nome){
        toastDanger('Informe o nome do visitante.');
        return;
      }

      let veiculo = null;
      const wantsVehicle = !!(addVehicleToggle && addVehicleToggle.checked);
      if(wantsVehicle){
        const tipo = String(addVehicleType && addVehicleType.value || '').trim();
        const placa = String(addVehiclePlate && addVehiclePlate.value || '').trim();
        const marca = String(addVehicleBrand && addVehicleBrand.value || '').trim();
        const modelo = String(addVehicleModelo && addVehicleModelo.value || '').trim();
        const cor = String(addVehicleCor && addVehicleCor.value || '').trim();
        const ano = String(addVehicleAno && addVehicleAno.value || '').trim();
        if(!tipo){
          toastDanger('Informe o tipo do veículo.');
          return;
        }
        veiculo = { tipo, placa, marca, modelo, cor, ano };
      }

      if(addSubmit) addSubmit.disabled = true;
      try{
        const isEdit = Number.isFinite(editingIndex) && editingIndex != null && editingIndex >= 0;
        const keepPrincipal = isEdit ? !!editingIsPrincipal : false;
        const motivoBase = keepPrincipal
          ? String(currentVisita?.finalidadeLabel || currentVisita?.finalidade || '').trim()
          : observacoes;
        const payload = { nome, rg, cpf, tel, motivo: motivoBase, observacoes, veiculo, principal: keepPrincipal };
        if(isEdit){
          draftVisitantes[editingIndex] = payload;
        } else {
          draftVisitantes.push(payload);
        }
        draftVisitantes = uniqVisitantes(draftVisitantes);
        renderList();
        toastSuccess(isEdit ? 'Visitante atualizado.' : 'Visitante adicionado.');
        if(bsAdd) bsAdd.hide();
      } catch(err){
        toastDanger(err?.message || 'Falha ao adicionar visitante.');
      } finally {
        if(addSubmit) addSubmit.disabled = false;
        resetAddForm();
      }
    });
  }

  window.wdgOpenChegadaVisitaModal = function(visita, ctx){
    openChegadaModal(visita, ctx || null);
  };
})();
