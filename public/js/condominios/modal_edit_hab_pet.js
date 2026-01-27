(function(){
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');
  const modalEl = document.getElementById('modalEditHabPet');
  if(!modalEl || typeof bootstrap === 'undefined' || !bootstrap.Modal) return;
  const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

  const elHab = document.getElementById('petHabLabel');
  const elProp = document.getElementById('petPropLabel');
  const form = document.getElementById('formPet');
  const selEspecie = document.getElementById('petEspecie');
  const wrapEspecieOutro = document.getElementById('petEspecieOutroWrap');
  const inpEspecieOutro = document.getElementById('petEspecieOutro');
  const inpNome = document.getElementById('petNome');
  const inpRaca = document.getElementById('petRaca');
  const inpPeso = document.getElementById('petPeso');
  const inpCor = document.getElementById('petCor');
  const radAuxYes = document.getElementById('petAuxYes');
  const radAuxNo = document.getElementById('petAuxNo');
  const inpFoto = document.getElementById('petFoto');
  const fotoPreview = document.getElementById('petFotoPreview');
  const fotoPreviewImg = document.getElementById('petFotoPreviewImg');
  const fotoPreviewLabel = document.getElementById('petFotoPreviewLabel');
  const fotoPreviewInfo = document.getElementById('petFotoPreviewInfo');
  const btnFotoRemover = document.getElementById('btnPetFotoRemover');

  const btnLimpar = document.getElementById('btnPetLimpar');
  const btnCancelar = document.getElementById('btnPetCancelarEdicao');
  const btnInserir = document.getElementById('btnPetInserir');
  const btnSalvar = document.getElementById('btnPetsSalvar');
  const btnFechar = document.getElementById('btnPetsFechar');

  const listaBody = document.getElementById('petListaBody');
  const pageSizeSel = document.getElementById('petPageSize');
  const pager = document.getElementById('petPager');

  const SPECIES = [
    'Cão','Gato','Macaco','Cobra','Lagarto','Iguana','Papagaio','Periquito','Calopsita','Arara',
    'Canário','Hamster','Porquinho-da-índia','Furão','Chinchila','Coelho','Ouriço','Porco','Pônei','Cavalo',
    'Peixe','Tartaruga','Ave Exótica','Outro'
  ];
  const MAX_FOTO_SIZE = 4 * 1024 * 1024;

  const state = {
    hab: null,
    proprietario: null,
    pets: [],
    original: [],
    editingIndex: null,
    page: 0
  };

  const formState = {
    existingFoto: null,
    pendingFoto: null,
    removeFoto: false
  };

  function escapeHtml(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }

  function clone(obj){
    return obj ? JSON.parse(JSON.stringify(obj)) : null;
  }

  function formatBytes(bytes){
    if(!bytes) return '';
    const units = ['B','KB','MB'];
    let value = bytes;
    let idx = 0;
    while(value >= 1024 && idx < units.length - 1){ value /= 1024; idx++; }
    return (value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)) + ' ' + units[idx];
  }

  function formatHabLabel(item){
    if(!item) return '';
    const unidade = item.unidade || {};
    const unidadeStr = [unidade.codigo, unidade.nome].filter(Boolean).join(' - ');
    const bloco = item.bloco && item.bloco.nome ? 'Bloco ' + item.bloco.nome : '';
    const andar = item.andar && item.andar.nome ? item.andar.nome : '';
    const tipoNum = [item.tipo, item.numero].filter(Boolean).join(' ');
    return [unidadeStr, bloco, andar, tipoNum].filter(Boolean).join(' - ');
  }

  function formatProprietarioLabel(prop){
    if(!prop) return '—';
    const nome = prop.nome || prop.razao || prop.fantasia || '';
    return nome || '—';
  }

  function formatEspecie(pet){
    if(!pet) return '—';
    if((pet.especie || '').toLowerCase() === 'outro' && pet.especie_outro){
      return pet.especie_outro;
    }
    return pet.especie || '—';
  }

  function showToast(message, type){
    const text = Array.isArray(message) ? message.filter(Boolean).join('\n') : String(message || '');
    if(!text) return;
    let container = document.getElementById('toastContainerHabPets');
    if(!container){
      container = document.createElement('div');
      container.id = 'toastContainerHabPets';
      container.style.position = 'fixed';
      container.style.top = '1rem';
      container.style.right = '1rem';
      container.style.zIndex = '1060';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '.5rem';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast align-items-center text-bg-' + (type || 'secondary') + ' border-0 show shadow';
    toast.style.minWidth = '240px';
    toast.setAttribute('role','alert');
    toast.setAttribute('aria-live','assertive');
    toast.setAttribute('aria-atomic','true');
    toast.innerHTML = '<div class="d-flex"><div class="toast-body">' + escapeHtml(text).replace(/\n/g,'<br>') + '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>';
    container.appendChild(toast);
    const remover = () => { try { toast.remove(); } catch(_e){} };
    const closeBtn = toast.querySelector('.btn-close');
    if(closeBtn) closeBtn.addEventListener('click', remover);
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(remover, 320);
    }, 3500);
  }

  function populateSpeciesOptions(extraValue){
    if(!selEspecie) return;
    const current = selEspecie.value;
    const selected = extraValue || current;
    selEspecie.innerHTML = '<option value="">Selecione...</option>';
    SPECIES.forEach(name => {
      const opt = document.createElement('option');
      const isOutro = name.toLowerCase() === 'outro';
      opt.value = isOutro ? '__outros__' : name;
      opt.textContent = name;
      selEspecie.appendChild(opt);
    });
    if(selected){ selEspecie.value = selected; }
  }

  function toggleEspecieOutro(){
    const isOutro = selEspecie.value === '__outros__';
    wrapEspecieOutro.classList.toggle('d-none', !isOutro);
    if(!isOutro) inpEspecieOutro.value = '';
  }

  function sanitizePesoDigits(rawValue){
    return String(rawValue || '').replace(/\D/g,'').slice(0, 6);
  }

  function digitsToDisplay(digits, includeKg){
    const sanitized = sanitizePesoDigits(digits);
    const size = Math.max(3, sanitized.length || 0);
    const padded = sanitized.padStart(size, '0');
    const inteiroRaw = padded.slice(0, padded.length - 2);
    const inteiro = inteiroRaw.replace(/^0+(?=\d)/, '') || '0';
    const decimal = padded.slice(-2);
    const base = inteiro + ',' + decimal;
    return includeKg ? base + ' kg' : base;
  }

  function digitsHaveValue(digits){
    return /[1-9]/.test(String(digits || ''));
  }

  function setPesoDigits(digits, includeKg){
    if(!inpPeso) return;
    const sanitized = sanitizePesoDigits(digits);
    inpPeso.value = digitsToDisplay(sanitized, includeKg);
    if(inpPeso.dataset){
      inpPeso.dataset.digits = sanitized;
      inpPeso.dataset.hasValue = digitsHaveValue(sanitized) ? '1' : '';
    }
  }

  function getPesoMaskedValue(){
    if(!inpPeso || !inpPeso.dataset || inpPeso.dataset.hasValue !== '1') return '';
    const digits = inpPeso.dataset.digits || '';
    return digitsToDisplay(digits, false);
  }

  function focusPesoInput(selectAll){
    try{
      if(selectAll){ inpPeso.select(); }
      else { inpPeso.setSelectionRange(inpPeso.value.length, inpPeso.value.length); }
    }catch(_e){}
  }

  function initPesoMask(){
    if(!inpPeso) return;
    setPesoDigits(inpPeso.value, true);
    inpPeso.addEventListener('focus', () => {
      setPesoDigits(inpPeso.dataset && inpPeso.dataset.digits || '', false);
      setTimeout(() => focusPesoInput(true), 0);
    });
    inpPeso.addEventListener('input', () => {
      setPesoDigits(inpPeso.value, false);
      setTimeout(focusPesoInput, 0);
    });
    inpPeso.addEventListener('blur', () => {
      setPesoDigits(inpPeso.dataset && inpPeso.dataset.digits || '', true);
    });
  }

  function updateFotoPreview(data){
    const info = data && typeof data === 'object' ? data : null;
    const hasData = info && (info.url || info.file);
    if(!hasData){
      fotoPreview.classList.add('d-none');
      fotoPreviewImg.src = '';
      fotoPreviewLabel.textContent = '';
      fotoPreviewInfo.textContent = '';
      return;
    }
    fotoPreview.classList.remove('d-none');
    const src = info.url || info.file || '';
    fotoPreviewImg.src = src;
    fotoPreviewLabel.textContent = info.nome || 'Foto selecionada';
    const sizeHint = info.tamanho ? formatBytes(info.tamanho) : '';
    fotoPreviewInfo.textContent = [info.mime || '', sizeHint].filter(Boolean).join(' · ');
  }

  function resetForm(){
    if(form) form.reset();
    populateSpeciesOptions();
    selEspecie.value = '';
    inpEspecieOutro.value = '';
    inpNome.value = '';
    inpRaca.value = '';
    setPesoDigits('', true);
    inpCor.value = '';
    if(radAuxYes) radAuxYes.checked = false;
    if(radAuxNo) radAuxNo.checked = true;
    if(inpFoto) inpFoto.value = '';
    formState.existingFoto = null;
    formState.pendingFoto = null;
    formState.removeFoto = false;
    updateFotoPreview(null);
    state.editingIndex = null;
    btnCancelar.classList.add('d-none');
    btnInserir.textContent = 'Inserir';
    toggleEspecieOutro();
  }

  function readFileAsDataUrl(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'));
      reader.readAsDataURL(file);
    });
  }

  function normalizePetFromServer(raw){
    if(!raw || typeof raw !== 'object') return null;
    const obj = clone(raw) || {};
    obj._id = obj._id || obj.id || null;
    obj.especie = obj.especie || '';
    obj.especie_outro = obj.especie_outro || '';
    obj.nome = obj.nome || '';
    obj.raca = obj.raca || '';
    obj.peso = obj.peso || '';
    obj.cor = obj.cor || '';
    obj.aux_needs = !!obj.aux_needs;
    obj.foto = obj.foto && typeof obj.foto === 'object'
      ? { url: obj.foto.url || '', nome: obj.foto.nome || '', mime: obj.foto.mime || '', tamanho: Number.isFinite(Number(obj.foto.tamanho)) ? Number(obj.foto.tamanho) : null }
      : { url:'', nome:'', mime:'', tamanho:null };
    return obj;
  }

  function preparePetForSend(pet){
    const obj = clone(pet) || {};
    if(obj.foto && obj.foto.tamanho != null && !Number.isFinite(Number(obj.foto.tamanho))){ delete obj.foto.tamanho; }
    return obj;
  }

  function getPageSize(){
    const val = parseInt(pageSizeSel.value, 10);
    return (!isNaN(val) && val > 0) ? val : 25;
  }

  function renderPager(){
    pager.innerHTML = '';
    const total = state.pets.length;
    const size = getPageSize();
    const totalPages = Math.max(1, Math.ceil(total / size));
    if(state.page >= totalPages) state.page = totalPages - 1;
    if(totalPages <= 1) return;
    const frag = document.createDocumentFragment();
    const buildBtn = (label, page, disabled, active) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wdg-pager-btn';
      btn.textContent = label;
      if(disabled) btn.disabled = true;
      if(active) btn.classList.add('active');
      btn.addEventListener('click', () => { state.page = page; renderLista(); });
      return btn;
    };
    frag.appendChild(buildBtn('«', 0, state.page === 0, false));
    frag.appendChild(buildBtn('‹', Math.max(0, state.page - 1), state.page === 0, false));
    const windowSize = 7;
    let start = Math.max(0, state.page - Math.floor(windowSize/2));
    let end = Math.min(totalPages - 1, start + windowSize - 1);
    if(end - start + 1 < windowSize) start = Math.max(0, end - windowSize + 1);
    for(let p = start; p <= end; p++) frag.appendChild(buildBtn(String(p+1), p, false, p === state.page));
    frag.appendChild(buildBtn('›', Math.min(totalPages - 1, state.page + 1), state.page >= totalPages - 1, false));
    frag.appendChild(buildBtn('»', totalPages - 1, state.page >= totalPages - 1, false));
    pager.appendChild(frag);
  }

  function renderLista(){
    listaBody.innerHTML = '';
    const size = getPageSize();
    const start = state.page * size;
    const itens = state.pets.slice(start, start + size);
    if(!itens.length){
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'Nenhum pet cadastrado.';
      tr.appendChild(td);
      listaBody.appendChild(tr);
    } else {
      itens.forEach(pet => {
        const tr = document.createElement('tr');
        const cells = [
          formatEspecie(pet) || '—',
          pet.raca || '—',
          pet.nome || '—'
        ];
        cells.forEach(text => {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        });

        const tdAcoes = document.createElement('td');
        tdAcoes.dataset.index = state.pets.indexOf(pet);
        const wrap = document.createElement('div');
        wrap.className = 'd-flex gap-2 justify-content-center';
        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'wdg-icon-btn';
        btnEdit.dataset.role = 'edit';
        btnEdit.title = 'Editar';
        btnEdit.setAttribute('aria-label','Editar');
        const imgEdit = document.createElement('img');
        imgEdit.src = basePath + '/images/editar.png';
        imgEdit.alt = 'Editar';
        btnEdit.appendChild(imgEdit);
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'wdg-icon-btn';
        btnDel.dataset.role = 'delete';
        btnDel.title = 'Excluir';
        btnDel.setAttribute('aria-label','Excluir');
        const imgDel = document.createElement('img');
        imgDel.src = basePath + '/images/excluir.png';
        imgDel.alt = 'Excluir';
        btnDel.appendChild(imgDel);
        wrap.appendChild(btnEdit);
        wrap.appendChild(btnDel);
        tdAcoes.appendChild(wrap);
        tr.appendChild(tdAcoes);
        listaBody.appendChild(tr);
      });
    }
    renderPager();
  }

  async function handleFotoChange(){
    const file = inpFoto.files && inpFoto.files[0] ? inpFoto.files[0] : null;
    if(!file){
      formState.pendingFoto = null;
      if(formState.removeFoto){ updateFotoPreview(null); }
      else updateFotoPreview(formState.existingFoto);
      return;
    }
    if(file.size > MAX_FOTO_SIZE){
      showToast('Imagem excede o limite de 4MB.', 'warning');
      inpFoto.value = '';
      return;
    }
    try{
      const dataUrl = await readFileAsDataUrl(file);
      formState.pendingFoto = {
        nome: file.name,
        mime: file.type || '',
        tamanho: file.size || null,
        file: dataUrl
      };
      formState.removeFoto = false;
      updateFotoPreview(formState.pendingFoto);
    }catch(err){
      console.warn('[modal_edit_hab_pet] falha ao ler foto', err);
      showToast('Não foi possível ler a imagem selecionada.', 'danger');
      inpFoto.value = '';
    }
  }

  function removeFoto(){
    formState.pendingFoto = null;
    formState.existingFoto = null;
    formState.removeFoto = true;
    if(inpFoto) inpFoto.value = '';
    updateFotoPreview(null);
  }

  function collectFormData(editingPet){
    const errors = [];
    const especieVal = selEspecie.value || '';
    if(!especieVal){ errors.push('Selecione a espécie do pet.'); }
    const isOutro = especieVal === '__outros__';
    const especieOutroVal = String(inpEspecieOutro.value || '').trim();
    if(isOutro && !especieOutroVal){ errors.push('Informe qual é a espécie.'); }
    const nomeVal = String(inpNome.value || '').trim();
    if(!nomeVal){ errors.push('Informe o nome do pet.'); }
    if(errors.length){
      showToast(errors, 'warning');
      return null;
    }
    const pet = editingPet ? clone(editingPet) : {};
    pet._id = pet._id || null;
    pet.especie = isOutro ? 'Outro' : especieVal;
    pet.especie_outro = isOutro ? especieOutroVal : '';
    pet.nome = nomeVal;
    pet.raca = String(inpRaca.value || '').trim();
    pet.peso = getPesoMaskedValue();
    pet.cor = String(inpCor.value || '').trim();
    pet.aux_needs = !!(radAuxYes && radAuxYes.checked);
    if(formState.removeFoto){
      pet.foto = { url:'', nome:'', mime:'', tamanho:null };
    } else if(formState.pendingFoto){
      pet.foto = clone(formState.pendingFoto);
    } else if(formState.existingFoto){
      pet.foto = clone(formState.existingFoto);
    } else if(!pet.foto){
      pet.foto = { url:'', nome:'', mime:'', tamanho:null };
    }
    return pet;
  }

  function setEditing(index){
    const pet = state.pets[index];
    if(!pet) return;
    state.editingIndex = index;
    const especieVal = pet.especie && pet.especie.toLowerCase() === 'outro' ? '__outros__' : pet.especie;
    populateSpeciesOptions(especieVal);
    selEspecie.value = especieVal;
    inpEspecieOutro.value = especieVal === '__outros__' ? (pet.especie_outro || '') : '';
    toggleEspecieOutro();
    inpNome.value = pet.nome || '';
    inpRaca.value = pet.raca || '';
    setPesoDigits(pet && pet.peso ? pet.peso : '', true);
    inpCor.value = pet.cor || '';
    if(pet.aux_needs){
      if(radAuxYes) radAuxYes.checked = true;
      if(radAuxNo) radAuxNo.checked = false;
    } else {
      if(radAuxYes) radAuxYes.checked = false;
      if(radAuxNo) radAuxNo.checked = true;
    }
    formState.existingFoto = pet.foto ? clone(pet.foto) : null;
    formState.pendingFoto = null;
    formState.removeFoto = false;
    updateFotoPreview(formState.existingFoto);
    if(inpFoto) inpFoto.value = '';
    btnCancelar.classList.remove('d-none');
    btnInserir.textContent = 'Salvar edição';
  }

  async function handleInserir(){
    const editing = state.editingIndex != null ? state.pets[state.editingIndex] : null;
    const pet = collectFormData(editing);
    if(!pet) return;
    if(state.editingIndex != null){
      state.pets[state.editingIndex] = pet;
      showToast('Pet atualizado na lista. Lembre-se de salvar.', 'success');
    } else {
      state.pets.push(pet);
      showToast('Pet adicionado à lista. Lembre-se de salvar.', 'success');
    }
    renderLista();
    resetForm();
  }

  function normalizeLista(list){
    return Array.isArray(list) ? list.map(normalizePetFromServer).filter(Boolean) : [];
  }

  async function salvarPets(){
    if(!state.hab || !state.hab._id){ showToast('Habitação inválida.', 'danger'); return; }
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';
    try{
      const payload = state.pets.map(preparePetForSend);
      const res = await fetch(basePath + '/api/habitacoes/' + encodeURIComponent(String(state.hab._id)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ pets: payload })
      });
      let data = null;
      try { data = await res.json(); } catch(_e){ data = null; }
      if(!res.ok || (data && data.error)){
        const errMsg = (data && data.error) ? data.error : 'Falha ao salvar pets.';
        throw new Error(errMsg);
      }
      if(data && data.pets){
        state.pets = normalizeLista(data.pets);
        state.hab = { ...state.hab, ...data };
        renderLista();
        resetForm();
      }
      showToast('Pets salvos com sucesso.', 'success');
      try{ document.dispatchEvent(new CustomEvent('habitacao:lista:refresh')); }catch(_evt){}
    }catch(err){
      showToast(err && err.message ? err.message : 'Falha ao salvar pets.', 'danger');
    }finally{
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar alterações';
    }
  }

  function populate(habitacao){
    state.hab = habitacao;
    state.proprietario = habitacao ? habitacao.proprietario || null : null;
    state.pets = normalizeLista(habitacao && habitacao.pets);
    state.original = state.pets.map(clone);
    state.page = 0;
    if(elHab) elHab.textContent = formatHabLabel(habitacao);
    if(elProp) elProp.textContent = formatProprietarioLabel(state.proprietario);
    renderLista();
    resetForm();
  }

  async function refreshFromServer(habitacao){
    if(!habitacao || !habitacao._id) return;
    try{
      const res = await fetch(basePath + '/api/habitacoes/' + encodeURIComponent(String(habitacao._id)), { cache: 'no-store' });
      if(!res.ok) return;
      const data = await res.json();
      if(data && data._id){
        populate(data);
      }
    }catch(err){ console.warn('[modal_edit_hab_pet] refresh falhou', err); }
  }

  async function openModal(item){
    populate(item);
    populateSpeciesOptions(selEspecie.value || '');
    toggleEspecieOutro();
    refreshFromServer(item);
    bsModal.show();
  }

  selEspecie.addEventListener('change', toggleEspecieOutro);
  inpFoto.addEventListener('change', handleFotoChange);
  btnFotoRemover.addEventListener('click', removeFoto);
  btnLimpar.addEventListener('click', resetForm);
  btnCancelar.addEventListener('click', resetForm);
  btnInserir.addEventListener('click', handleInserir);
  btnSalvar.addEventListener('click', salvarPets);
  btnFechar.addEventListener('click', () => { bsModal.hide(); });
  pageSizeSel.addEventListener('change', () => { state.page = 0; renderLista(); });
  listaBody.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-role]');
    if(!btn) return;
    const idx = parseInt(btn.parentElement.parentElement.dataset.index || '-1', 10);
    if(isNaN(idx) || idx < 0) return;
    if(btn.dataset.role === 'edit'){
      setEditing(idx);
    } else if(btn.dataset.role === 'delete'){
      if(confirm('Deseja remover este pet da lista?')){
        if(state.editingIndex === idx) resetForm();
        state.pets.splice(idx, 1);
        renderLista();
      }
    }
  });

  document.addEventListener('habitacao:acao', ev => {
    const detail = ev && ev.detail || {};
    if(detail.tipo !== 'pets') return;
    const item = detail.item || null;
    if(!item) return;
    openModal(item);
  });

  populateSpeciesOptions();
  toggleEspecieOutro();
  initPesoMask();
})();
