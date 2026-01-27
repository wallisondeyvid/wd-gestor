(function(){
  const basePath = document.body?.dataset?.basePath || '/portal-morador';
  const habIdFromBody = document.body?.dataset?.habId || '';
  const habLabelFromBody = document.body?.dataset?.habLabel || '';

  const habSelect = document.getElementById('pmVisitaHab');
  const habLabelEl = document.getElementById('pmVisitaHabLabel');
  const finalidadeSelect = document.getElementById('pmVisitaFinalidade');
  const nomeInput = document.getElementById('pmVisitaNome');
  const rgInput = document.getElementById('pmVisitaRg');
  const cpfInput = document.getElementById('pmVisitaCpf');
  const telInput = document.getElementById('pmVisitaTel');
  const inicioInput = document.getElementById('pmVisitaInicio');
  const fimInput = document.getElementById('pmVisitaFim');
  const obsInput = document.getElementById('pmVisitaObs');
  const form = document.getElementById('pmVisitaForm');
  const vehicleToggle = document.getElementById('pmVisitaVeiculoToggle');
  const vehicleFieldset = document.getElementById('pmVisitaVeiculoFields');
  const vehicleTypeSelect = document.getElementById('pmVisitaVeiculoTipo');
  const vehiclePlateInput = document.getElementById('pmVisitaPlaca');
  const vehicleBrandSelect = document.getElementById('pmVisitaMarca');
  const vehicleModeloInput = document.getElementById('pmVisitaModelo');
  const vehicleCorInput = document.getElementById('pmVisitaCor');
  const vehicleAnoInput = document.getElementById('pmVisitaAno');
  const vehicleFields = vehicleFieldset ? Array.from(vehicleFieldset.querySelectorAll('[data-vehicle-field]')) : [];
  const historyList = document.getElementById('pmVisitasLista');
  const historyEmpty = document.getElementById('pmVisitasEmpty');
  const historyCount = document.getElementById('pmVisitaHabResumo');
  const refreshBtn = document.getElementById('pmVisitaRefresh');

  const deleteConfirmModal = document.getElementById('pmDeleteVisitaConfirm');
  const deleteConfirmYes = document.getElementById('pmDeleteVisitaConfirmYes');
  const deleteConfirmNo = document.getElementById('pmDeleteVisitaConfirmNo');

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
  const ACTION_ICONS = {
    edit: `${basePath}/images/editar.png`,
    delete: `${basePath}/images/excluir.png`
  };
  let vehicleBrandMapCache = null;
  let vehicleBrandMapPromise = null;
  let editingVisitaId = null;

  let pendingDeleteResolve = null;

  function askDeleteConfirm(){
    if(!deleteConfirmModal || !deleteConfirmYes || !deleteConfirmNo){
      return Promise.resolve(confirm('Tem certeza que deseja excluir essa visita?'));
    }
    deleteConfirmModal.hidden = false;
    return new Promise((resolve) => {
      pendingDeleteResolve = resolve;
      try { deleteConfirmNo.focus(); } catch {}
    });
  }

  function closeDeleteConfirm(answer){
    if(deleteConfirmModal) deleteConfirmModal.hidden = true;
    const resolve = pendingDeleteResolve;
    pendingDeleteResolve = null;
    if(typeof resolve === 'function') resolve(Boolean(answer));
  }

  deleteConfirmYes?.addEventListener('click', () => closeDeleteConfirm(true));
  deleteConfirmNo?.addEventListener('click', () => closeDeleteConfirm(false));

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

  function isoDate(value){
    if(!value) return null;
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function dateInputValueFromIso(value){
    if(!value) return '';
    try {
      const d = new Date(value);
      if(Number.isNaN(d.getTime())) return '';
      return d.toISOString().slice(0,10);
    } catch {
      return '';
    }
  }

  function formatDate(value){
    try {
      const d = new Date(value);
      if(Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch {
      return '';
    }
  }

  function formatRange(start, end){
    const ini = formatDate(start);
    const fim = formatDate(end);
    if(ini && fim) return `${ini} · ${fim}`;
    return ini || fim || '';
  }

  function formatCpfValue(value){
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if(digits.length <= 3) return digits;
    if(digits.length <= 6) return `${digits.slice(0,3)}.${digits.slice(3)}`;
    if(digits.length <= 9) return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
    return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`;
  }

  function formatPhoneValue(value){
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if(!digits) return '';
    if(digits.length < 2) return `(${digits}`;
    const ddd = digits.slice(0,2);
    const rest = digits.slice(2);
    const useFiveDigits = rest.length > 8;
    const firstLen = useFiveDigits ? 5 : 4;
    const firstPart = rest.slice(0, firstLen);
    const secondPart = rest.slice(firstLen, firstLen + 4);
    let formatted = `(${ddd})`;
    if(firstPart){
      formatted += ` ${firstPart}`;
    }
    if(secondPart){
      formatted += `-${secondPart}`;
    }
    return formatted.trim();
  }

  function stripDiacritics(value){
    if(!value) return '';
    try {
      return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch {
      return value;
    }
  }

  function normalizePlateValue(value){
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  }

  function formatPlateForDisplay(value){
    const normalized = normalizePlateValue(value);
    if(normalized.length <= 3) return normalized;
    return `${normalized.slice(0,3)}-${normalized.slice(3)}`;
  }

  function isValidPlate(value){
    const normalized = normalizePlateValue(value);
    if(normalized.length !== 7) return false;
    return (/^[A-Z]{3}\d{4}$/).test(normalized) || (/^[A-Z]{3}\d[A-Z]\d{2}$/).test(normalized);
  }

  async function tryFetchJson(url){
    try {
      const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if(!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function fetchVehicleBrandsData(){
    const primary = [
      `${basePath}/data/marcas_veiculos_por_tipo.json`,
      '/gestor/data/marcas_veiculos_por_tipo.json',
      '/data/marcas_veiculos_por_tipo.json'
    ];
    for(const url of primary){
      const data = await tryFetchJson(url);
      if(data && typeof data === 'object' && !Array.isArray(data)) return data;
    }
    const fallback = [
      `${basePath}/data/marcas_veiculos.json`,
      '/gestor/data/marcas_veiculos.json',
      '/data/marcas_veiculos.json'
    ];
    for(const url of fallback){
      const data = await tryFetchJson(url);
      if(Array.isArray(data) && data.length){
        return { _default: data };
      }
    }
    return { _default: [] };
  }

  function normalizeBrandMap(rawMap){
    const normalized = {};
    if(rawMap && typeof rawMap === 'object'){
      Object.entries(rawMap).forEach(([key, value]) => {
        const list = Array.isArray(value)
          ? value.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        if(!list.length) return;
        const unique = [];
        const seen = new Set();
        list.forEach((item) => {
          const lower = item.toLowerCase();
          if(seen.has(lower)) return;
          seen.add(lower);
          unique.push(item);
        });
        if(!seen.has('outro')) unique.push('Outro');
        const variants = new Set([
          key,
          stripDiacritics(key),
          String(key).toLowerCase(),
          stripDiacritics(key).toLowerCase(),
          stripDiacritics(key).replace(/[^a-z0-9]/gi, ''),
          stripDiacritics(key).replace(/[^a-z0-9]/gi, '').toLowerCase()
        ]);
        variants.forEach((variant) => {
          if(!variant) return;
          if(!normalized[variant]) normalized[variant] = unique;
        });
        if(!normalized[key]) normalized[key] = unique;
      });
    }
    if(!Array.isArray(normalized._default)){
      normalized._default = [];
    }
    if(!normalized._default.length){
      const fallbackKey = Object.keys(normalized).find((k) => k !== '_default');
      if(fallbackKey) normalized._default = normalized[fallbackKey];
    }
    if(!Array.isArray(normalized._default)){
      normalized._default = [];
    }
    if(!normalized._default.includes('Outro')){
      normalized._default = [...normalized._default, 'Outro'];
    }
    return normalized;
  }

  async function ensureVehicleBrandMap(){
    if(vehicleBrandMapCache) return vehicleBrandMapCache;
    if(vehicleBrandMapPromise) return vehicleBrandMapPromise;
    vehicleBrandMapPromise = fetchVehicleBrandsData()
      .then((data) => normalizeBrandMap(data))
      .catch(() => ({ _default: [] }))
      .then((map) => {
        vehicleBrandMapCache = map;
        return map;
      });
    return vehicleBrandMapPromise;
  }

  function resolveBrandOptions(map, tipo){
    if(!map) return [];
    if(!tipo) return Array.isArray(map._default) ? map._default : [];
    const trimmed = String(tipo).trim();
    const stripped = stripDiacritics(trimmed);
    const variants = [
      trimmed,
      trimmed.toLowerCase(),
      stripped,
      stripped.toLowerCase(),
      stripped.replace(/[^a-z0-9]/gi, ''),
      stripped.replace(/[^a-z0-9]/gi, '').toLowerCase()
    ];
    for(const variant of variants){
      if(variant && Array.isArray(map[variant])) return map[variant];
    }
    return Array.isArray(map._default) ? map._default : [];
  }

  function populateVehicleTypeOptions(){
    if(!vehicleTypeSelect || vehicleTypeSelect.dataset.ready === '1') return;
    vehicleTypeSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione';
    placeholder.disabled = true;
    placeholder.selected = true;
    vehicleTypeSelect.appendChild(placeholder);
    VEHICLE_TYPES.forEach((tipo) => {
      const opt = document.createElement('option');
      opt.value = tipo;
      opt.textContent = tipo;
      vehicleTypeSelect.appendChild(opt);
    });
    vehicleTypeSelect.dataset.ready = '1';
  }

  function resetVehicleBrandField(){
    if(!vehicleBrandSelect) return;
    vehicleBrandSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione o tipo do veículo';
    placeholder.disabled = true;
    placeholder.selected = true;
    vehicleBrandSelect.appendChild(placeholder);
    vehicleBrandSelect.disabled = true;
    vehicleBrandSelect.dataset.loadedTipo = '';
  }

  async function populateVehicleBrandOptions(tipo, presetValue){
    if(!vehicleBrandSelect) return;
    if(!tipo){
      resetVehicleBrandField();
      return;
    }
    vehicleBrandSelect.disabled = true;
    vehicleBrandSelect.innerHTML = '';
    const loadingOption = document.createElement('option');
    loadingOption.value = '';
    loadingOption.textContent = 'Carregando marcas...';
    loadingOption.disabled = true;
    loadingOption.selected = true;
    vehicleBrandSelect.appendChild(loadingOption);
    const currentTipo = tipo;
    const map = await ensureVehicleBrandMap();
    if(vehicleTypeSelect && vehicleTypeSelect.value !== currentTipo){
      return;
    }
    const options = resolveBrandOptions(map, currentTipo);
    vehicleBrandSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione';
    placeholder.disabled = true;
    placeholder.selected = true;
    vehicleBrandSelect.appendChild(placeholder);
    options.forEach((marca) => {
      const opt = document.createElement('option');
      opt.value = marca;
      opt.textContent = marca;
      vehicleBrandSelect.appendChild(opt);
    });
    vehicleBrandSelect.disabled = false;
    vehicleBrandSelect.dataset.loadedTipo = currentTipo;
    if(presetValue){
      vehicleBrandSelect.value = presetValue;
      if(!vehicleBrandSelect.value){
        vehicleBrandSelect.value = '';
      }
    }
  }

  function toggleVehicleFields(enabled){
    if(!vehicleFieldset) return;
    if(enabled){
      populateVehicleTypeOptions();
      vehicleFieldset.classList.add('is-visible');
    } else {
      vehicleFieldset.classList.remove('is-visible');
    }
    vehicleFields.forEach((field) => {
      field.disabled = !enabled;
      if(!enabled){
        if(field.tagName === 'SELECT'){
          field.selectedIndex = 0;
        } else {
          field.value = '';
        }
      }
    });
    if(!enabled){
      resetVehicleBrandField();
      if(vehiclePlateInput) vehiclePlateInput.value = '';
      if(vehicleTypeSelect) vehicleTypeSelect.selectedIndex = 0;
    } else if(vehicleBrandSelect && !vehicleTypeSelect?.value){
      vehicleBrandSelect.disabled = true;
    } else if(vehicleTypeSelect?.value){
      populateVehicleBrandOptions(vehicleTypeSelect.value, vehicleBrandSelect?.value);
    }
  }

  function setMinDates(){
    const today = new Date();
    const iso = today.toISOString().slice(0,10);
    if(inicioInput && !inicioInput.value) inicioInput.value = iso;
    if(inicioInput) inicioInput.min = iso;
    if(fimInput){
      const minValue = inicioInput?.value || iso;
      fimInput.min = minValue;
      if(!fimInput.value || fimInput.value < minValue){
        fimInput.value = minValue;
      }
    }
  }

  inicioInput?.addEventListener('change', () => {
    if(fimInput && inicioInput){
      fimInput.min = inicioInput.value || '';
      if(!fimInput.value){
        fimInput.value = inicioInput.value;
      } else if(fimInput.value < inicioInput.value){
        fimInput.value = inicioInput.value;
      }
    }
  });

  cpfInput?.addEventListener('input', () => {
    cpfInput.value = formatCpfValue(cpfInput.value);
  });

  telInput?.addEventListener('input', () => {
    telInput.value = formatPhoneValue(telInput.value);
  });

  vehicleTypeSelect?.addEventListener('change', () => {
    populateVehicleBrandOptions(vehicleTypeSelect.value);
  });

  vehiclePlateInput?.addEventListener('input', () => {
    vehiclePlateInput.value = normalizePlateValue(vehiclePlateInput.value);
  });

  vehicleToggle?.addEventListener('change', () => {
    toggleVehicleFields(!!vehicleToggle.checked);
  });

  function updateHabResumo(){
    if(historyCount){
      historyCount.textContent = habLabelFromBody || '';
    }
    if(habLabelEl){
      habLabelEl.textContent = habLabelFromBody || 'Habitação selecionada';
    }
  }

  function ensureHabFromContext(){
    if(habSelect){
      habSelect.value = habIdFromBody || '';
    }
    updateHabResumo();
  }

  async function fetchVisitas(){
    try {
      const hab = (habIdFromBody || habSelect?.value || '').trim();
      const qs = hab ? `?hab=${encodeURIComponent(hab)}` : '';
      const r = await fetch(`${basePath}/api/visitantes${qs}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
      });
      const j = await r.json().catch(() => null);
      if(!r.ok || !j){
        throw new Error(j?.error || 'Falha ao carregar visitas.');
      }
      return Array.isArray(j?.data) ? j.data : [];
    } catch (err){
      toast(err?.message || 'Falha ao listar visitas.', 'warning');
      return [];
    }
  }

  function renderVisitas(items){
    if(!historyList || !historyEmpty) return;
    const records = Array.isArray(items) ? items : [];
    if(!records.length){
      historyList.innerHTML = '';
      historyEmpty.hidden = false;
      return;
    }
    historyEmpty.hidden = true;
    historyList.innerHTML = records.map((item) => {
      const range = formatRange(item.periodoInicio, item.periodoFim);
      const finalidade = String(item.finalidadeLabel || item.finalidade || '').trim();
      const hab = String(item.habitacaoNome || '').trim();
      const obs = String(item.observacoes || '').trim();
      const veiculoResumo = formatVehicle(item.veiculo);
      const metaBlocks = [
        { label: 'Período', value: range },
        { label: 'RG', value: item.visitanteRg },
        { label: 'CPF', value: item.visitanteCpf },
        { label: 'Telefone', value: item.visitanteTel },
        { label: 'Veículo', value: veiculoResumo }
      ];
      return `
        <article class="pm-visitante-card" data-visita-id="${escapeHtml(item._id || '')}">
          <div class="pm-visitante-card-head">
            <div>
              <strong>${escapeHtml(item.visitanteNome || '')}</strong>
              ${hab ? `<div class="pm-field-hint">${escapeHtml(hab)}</div>` : ''}
            </div>
            <div class="pm-visitante-card-actions">
              <span class="pm-visitante-chip"><i class="bi bi-calendar-event"></i>${escapeHtml(finalidade || 'Visita')}</span>
              <button class="wdg-icon-btn pm-visitante-card-action" type="button" title="Editar" aria-label="Editar" data-visita-action="edit" data-visita-id="${escapeHtml(item._id || '')}">
                <img src="${ACTION_ICONS.edit}" alt="Editar" onerror="this.outerHTML='&lt;i class=&quot;bi bi-pencil&quot;&gt;&lt;/i&gt;'">
              </button>
              <button class="wdg-icon-btn pm-visitante-card-action" type="button" title="Excluir" aria-label="Excluir" data-visita-action="delete" data-visita-id="${escapeHtml(item._id || '')}">
                <img src="${ACTION_ICONS.delete}" alt="Excluir" onerror="this.outerHTML='&lt;i class=&quot;bi bi-trash&quot;&gt;&lt;/i&gt;'">
              </button>
            </div>
          </div>
          <div class="pm-visitante-meta">
            ${metaBlocks.map((block) => `
              <div class="pm-visitante-meta-block">
                <span class="pm-visitante-meta-label">${block.label}:</span>
                <span class="pm-visitante-meta-value">${escapeHtml(block.value || 'Não informado')}</span>
              </div>
            `).join('')}
          </div>
          ${obs ? `<p class="pm-visitante-obs">${escapeHtml(obs)}</p>` : ''}
        </article>
      `;
    }).join('');
  }

  function formatVehicle(v){
    if(!v) return '';
    const parts = [
      formatPlateForDisplay(v.placa),
      v.tipo,
      v.marca,
      v.modelo,
      v.cor,
      v.ano
    ].map((p) => String(p || '').trim()).filter(Boolean);
    return parts.join(' · ');
  }

  function escapeHtml(str){
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  async function fetchVisitaById(visitaId){
    const id = String(visitaId || '').trim();
    if(!id) return null;
    try {
      const r = await fetch(`${basePath}/api/visitantes/${encodeURIComponent(id)}?_=${Date.now()}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
      });
      const j = await r.json().catch(() => null);
      if(!r.ok) throw new Error(j?.error || 'Falha ao carregar visita.');
      return j?.data || null;
    } catch (err){
      toast(err?.message || 'Falha ao carregar visita.', 'warning');
      return null;
    }
  }

  async function startEditVisita(data){
    const d = (data && typeof data === 'object') ? data : null;
    if(!d || !d._id){
      toast('Registro inválido para edição.', 'warning');
      return;
    }
    editingVisitaId = String(d._id);

    if(habSelect && d.habitacaoId){
      habSelect.value = String(d.habitacaoId);
    }
    if(finalidadeSelect && d.finalidade){
      finalidadeSelect.value = String(d.finalidade);
    }
    if(nomeInput) nomeInput.value = String(d.visitanteNome || '');
    if(rgInput) rgInput.value = String(d.visitanteRg || '');
    if(cpfInput) cpfInput.value = formatCpfValue(String(d.visitanteCpf || ''));
    if(telInput) telInput.value = formatPhoneValue(String(d.visitanteTel || ''));
    if(inicioInput) inicioInput.value = dateInputValueFromIso(d.periodoInicio);
    if(fimInput) fimInput.value = dateInputValueFromIso(d.periodoFim);
    if(obsInput) obsInput.value = String(d.observacoes || '');

    updateHabResumo();
    if(inicioInput){
      inicioInput.dispatchEvent(new Event('change'));
    }

    const hasVehicle = !!d.veiculo;
    if(vehicleToggle) vehicleToggle.checked = hasVehicle;
    toggleVehicleFields(hasVehicle);
    if(hasVehicle && d.veiculo){
      const v = d.veiculo;
      if(vehicleTypeSelect) vehicleTypeSelect.value = String(v.tipo || '');
      await populateVehicleBrandOptions(vehicleTypeSelect?.value || '', String(v.marca || ''));
      if(vehiclePlateInput) vehiclePlateInput.value = normalizePlateValue(v.placa || '');
      if(vehicleModeloInput) vehicleModeloInput.value = String(v.modelo || '');
      if(vehicleCorInput) vehicleCorInput.value = String(v.cor || '');
      if(vehicleAnoInput) vehicleAnoInput.value = String(v.ano || '');
    }

    const submitBtn = form?.querySelector('button[type="submit"]');
    if(submitBtn) submitBtn.textContent = 'Atualizar visita';
    nomeInput?.focus();
  }

  async function refresh(){
    updateHabResumo();
    const data = await fetchVisitas();
    renderVisitas(data);
  }

  refreshBtn?.addEventListener('click', () => {
    refresh();
  });

  historyList?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-visita-action]');
    if(!btn) return;
    const action = btn.dataset.visitaAction;
    const visitaId = btn.dataset.visitaId;
    if(!visitaId){
      toast('Registro não encontrado.', 'warning');
      return;
    }
    if(action === 'edit'){
      fetchVisitaById(visitaId).then((d) => {
        if(d) startEditVisita(d);
      });
      return;
    }
    if(action === 'delete'){
      (async () => {
        const ok = await askDeleteConfirm();
        if(!ok) return;
        try {
          const r = await fetch(`${basePath}/api/visitantes/${encodeURIComponent(visitaId)}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
          });
          const j = await r.json().catch(() => null);
          if(!r.ok) throw new Error(j?.error || 'Falha ao excluir visita.');
          toast('Visita excluída com sucesso.', 'success');
          await refresh();
        } catch (err){
          toast(err?.message || 'Falha ao excluir visita.', 'warning');
        }
      })();
      return;
    }
  });

  form?.addEventListener('reset', () => {
    editingVisitaId = null;
    const submitBtn = form?.querySelector('button[type="submit"]');
    if(submitBtn) submitBtn.textContent = 'Comunicar visita';
    setTimeout(() => {
      toggleVehicleFields(!!vehicleToggle?.checked);
      setMinDates();
    }, 0);
  });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const habitacaoId = String(habIdFromBody || habSelect?.value || '').trim();
    const finalidade = String(finalidadeSelect?.value || '').trim();
    const visitanteNome = String(nomeInput?.value || '').trim();
    const visitanteRg = String(rgInput?.value || '').trim();
    const visitanteCpf = String(cpfInput?.value || '').trim();
    const visitanteTel = String(telInput?.value || '').trim();
    const periodoInicioIso = isoDate(inicioInput?.value);
    const periodoFimIso = isoDate(fimInput?.value);
    const observacoes = String(obsInput?.value || '').trim();

    if(!habitacaoId){
      toast('Habitação não disponível. Refaça o login.', 'warning');
      return;
    }
    if(!finalidade){
      toast('Informe a finalidade da visita.', 'warning');
      finalidadeSelect?.focus();
      return;
    }
    if(!visitanteNome){
      toast('Informe o nome do visitante.', 'warning');
      nomeInput?.focus();
      return;
    }
    if(!periodoInicioIso || !periodoFimIso){
      toast('Preencha o período completo.', 'warning');
      return;
    }
    if(new Date(periodoFimIso) < new Date(periodoInicioIso)){
      toast('Data final não pode ser antes da inicial.', 'warning');
      return;
    }

    const hasVehicle = !!vehicleToggle?.checked;
    let veiculo = null;
    if(hasVehicle){
      const tipoVeiculo = String(vehicleTypeSelect?.value || '').trim();
      const placaRaw = normalizePlateValue(vehiclePlateInput?.value || '');
      if(!tipoVeiculo){
        toast('Selecione o tipo do veículo.', 'warning');
        vehicleTypeSelect?.focus();
        return;
      }
      if(!placaRaw){
        toast('Informe a placa do veículo.', 'warning');
        vehiclePlateInput?.focus();
        return;
      }
      if(!isValidPlate(placaRaw)){
        toast('Placa inválida. Utilize os formatos ABC1234 ou ABC1D23.', 'warning');
        vehiclePlateInput?.focus();
        return;
      }
      veiculo = {
        tipo: tipoVeiculo,
        placa: formatPlateForDisplay(placaRaw),
        marca: String(vehicleBrandSelect?.value || '').trim(),
        modelo: String(vehicleModeloInput?.value || '').trim(),
        cor: String(vehicleCorInput?.value || '').trim(),
        ano: String(vehicleAnoInput?.value || '').trim()
      };
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const prevLabel = submitBtn?.textContent;
    if(submitBtn){
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }

    try {
      const payload = {
        habitacaoId,
        habitacaoNome: habLabelFromBody || '',
        finalidade,
        visitanteNome,
        visitanteRg,
        visitanteCpf,
        visitanteTel,
        periodoInicio: periodoInicioIso,
        periodoFim: periodoFimIso,
        observacoes,
        veiculo
      };
      const isEdit = !!editingVisitaId;
      const url = isEdit
        ? `${basePath}/api/visitantes/${encodeURIComponent(editingVisitaId)}`
        : `${basePath}/api/visitantes`;
      const r = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => null);
      if(!r.ok){
        throw new Error(j?.error || 'Falha ao comunicar visita.');
      }
      form.reset();
      toggleVehicleFields(false);
      setMinDates();
      editingVisitaId = null;
      toast(isEdit ? 'Visita atualizada com sucesso.' : 'Visita comunicada com sucesso.', 'success');
      await refresh();
    } catch (err){
      console.error(err);
      toast(err?.message || 'Falha ao comunicar visita.', 'warning');
    } finally {
      if(submitBtn){
        submitBtn.disabled = false;
        submitBtn.textContent = (editingVisitaId ? 'Atualizar visita' : (prevLabel || 'Comunicar visita'));
      }
    }
  });

  populateVehicleTypeOptions();
  resetVehicleBrandField();
  setMinDates();
  toggleVehicleFields(false);
  ensureHabFromContext();
  refresh();
})();
