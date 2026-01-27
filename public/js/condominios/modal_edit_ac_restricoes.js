(function(){
  const modalEl = document.getElementById('modalEditAreaRestricoes');
  if(!modalEl || typeof bootstrap === 'undefined') return;

  const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });

  const areaNomeEl = modalEl.querySelector('#acRestrAreaNome');
  const areaUnidadeEl = modalEl.querySelector('#acRestrAreaUnidade');
  const badgeTotal = modalEl.querySelector('#acRestrBadgeTotal');
  const badgeProximas = modalEl.querySelector('#acRestrBadgeProximas');
  const resumoEl = modalEl.querySelector('#acRestrResumo');
  const feedbackEl = modalEl.querySelector('#acRestrFeedback');
  const listEl = modalEl.querySelector('#acRestrList');
  const emptyEl = modalEl.querySelector('#acRestrEmpty');
  const editorStatusEl = modalEl.querySelector('#acRestrEditorStatus');
  const resetBtn = modalEl.querySelector('#acRestrResetBtn');
  const cancelEditBtn = modalEl.querySelector('#acRestrCancelEdit');
  const applyBtn = modalEl.querySelector('#acRestrApplyBtn');
  const saveBtn = modalEl.querySelector('[data-action="save"]');
  const cancelBtn = modalEl.querySelector('[data-action="cancel"]');

  const inputData = modalEl.querySelector('#acRestrData');
  const inputHoraInicio = modalEl.querySelector('#acRestrHoraInicio');
  const inputHoraFim = modalEl.querySelector('#acRestrHoraFim');
  const inputObs = modalEl.querySelector('#acRestrObservacao');
  const obsCount = modalEl.querySelector('#acRestrObsCount');

  const state = {
    area: null,
    list: [],
    editingIndex: -1,
    pendingResolve: null,
    confirmed: false
  };
  let feedbackTimer = null;

  function cloneDeep(obj){
    try{ if(typeof structuredClone === 'function') return structuredClone(obj); }
    catch(_){ }
    try{ return JSON.parse(JSON.stringify(obj)); }
    catch(_){ return null; }
  }

  function normalizeDate(value){
    if(!value) return null;
    let str = String(value).trim();
    if(!str) return null;
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(str)){
      const [dd, mm, yyyy] = str.split('/');
      const day = Number(dd); const month = Number(mm); const year = Number(yyyy);
      if(day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100){
        return String(year).padStart(4,'0') + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
      }
      return null;
    }
    if(/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    return null;
  }

  function normalizeTime(value){
    if(!value) return null;
    let str = String(value).trim();
    if(!str) return null;
    str = str.replace(/[hH]/, ':').replace(/[^0-9:]/g, '');
    if(/^\d{3,4}$/.test(str)) str = str.slice(0, str.length - 2) + ':' + str.slice(-2);
    if(!/^\d{1,2}:\d{1,2}$/.test(str)) return null;
    const [hh, mm] = str.split(':').map(Number);
    if(Number.isNaN(hh) || Number.isNaN(mm)) return null;
    if(hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  }

  function minutesFromTime(time){
    if(!/^\d{2}:\d{2}$/.test(time)) return NaN;
    const parts = time.split(':').map(Number);
    return (parts[0] * 60) + parts[1];
  }

  function setFeedback(message, status, autoHideMs){
    if(feedbackTimer){ clearTimeout(feedbackTimer); feedbackTimer = null; }
    if(!feedbackEl) return;
    if(!message){
      feedbackEl.removeAttribute('data-status');
      feedbackEl.textContent = '';
      return;
    }
    feedbackEl.dataset.status = status || 'info';
    feedbackEl.textContent = String(message);
    if(autoHideMs && autoHideMs > 0){
      feedbackTimer = setTimeout(() => {
        feedbackEl.removeAttribute('data-status');
        feedbackEl.textContent = '';
      }, autoHideMs);
    }
  }

  function updateObsCount(){
    if(!obsCount) return;
    obsCount.textContent = String(inputObs.value.length);
  }

  function clearForm(preserveFeedback){
    inputData.value = '';
    inputHoraInicio.value = '';
    inputHoraFim.value = '';
    inputObs.value = '';
    updateObsCount();
    state.editingIndex = -1;
    editorStatusEl.textContent = 'Nova restrição';
    applyBtn.textContent = 'Adicionar restrição';
    resetBtn.disabled = true;
    cancelEditBtn.hidden = true;
    cancelEditBtn.disabled = true;
    if(!preserveFeedback) setFeedback('', null);
  }

  function normalizeInput(entry){
    if(!entry) return null;
    const dateRaw = entry.date || entry.data || entry.day || entry.dia;
    const startRaw = entry.start || entry.inicio || entry.from || entry.de || entry.hora_inicio;
    const endRaw = entry.end || entry.fim || entry.to || entry.ate || entry.hora_fim;
    const obsRaw = entry.observacao || entry.obs || entry.justificativa || entry.motivo || entry.note;
    const date = normalizeDate(dateRaw);
    const timeStart = normalizeTime(startRaw);
    const timeEnd = normalizeTime(endRaw);
    if(!date || !timeStart || !timeEnd) return null;
    if(minutesFromTime(timeEnd) <= minutesFromTime(timeStart)) return null;
    const obs = obsRaw != null ? String(obsRaw).trim() : '';
    return { date, start: timeStart, end: timeEnd, observacao: obs };
  }

  function importRestrictions(list){
    state.list = [];
    if(!Array.isArray(list)) return;
    const parsed = [];
    list.forEach(item => {
      const normalized = normalizeInput(item);
      if(normalized) parsed.push(normalized);
    });
    parsed.sort((a,b) => {
      if(a.date === b.date) return minutesFromTime(a.start) - minutesFromTime(b.start);
      return a.date < b.date ? -1 : 1;
    });
    state.list = parsed;
  }

  function exportRestrictions(){
    return state.list.map(item => ({ ...item }));
  }

  function formatDateLabel(dateStr){
    try{
      const parts = dateStr.split('-');
      if(parts.length !== 3) return dateStr;
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }catch(_){ return dateStr; }
  }

  function formatTimeRange(item){
    return item.start + ' → ' + item.end;
  }

  function isUpcoming(dateStr){
    if(!dateStr) return false;
    const today = new Date();
    const todayIso = today.toISOString().slice(0,10);
    return dateStr >= todayIso;
  }

  function updateStats(){
    const total = state.list.length;
    const proximas = state.list.filter(item => isUpcoming(item.date)).length;
    if(badgeTotal) badgeTotal.textContent = String(total);
    if(badgeProximas) badgeProximas.textContent = String(proximas);
    if(resumoEl){
      if(!total){
        resumoEl.textContent = 'Nenhuma restrição registrada.';
      } else {
        resumoEl.textContent = total + ' período(s) bloqueado(s) — ' + proximas + ' futuro(s).';
      }
    }
  }

  function renderList(){
    listEl.innerHTML = '';
    if(!state.list.length){
      emptyEl.classList.add('is-visible');
      updateStats();
      return;
    }
    emptyEl.classList.remove('is-visible');
    const frag = document.createDocumentFragment();
    state.list.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'wdg-ac-restr-item';
      card.dataset.index = String(index);
      if(isUpcoming(item.date)) card.dataset.upcoming = 'true';

      const head = document.createElement('div');
      head.className = 'wdg-ac-restr-item-head';

      const dateWrap = document.createElement('div');
      dateWrap.className = 'wdg-ac-restr-date';
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = formatDateLabel(item.date);
      const time = document.createElement('span');
      time.className = 'wdg-ac-restr-time';
      time.textContent = formatTimeRange(item);
      dateWrap.appendChild(badge);
      dateWrap.appendChild(time);

      const actions = document.createElement('div');
      actions.className = 'wdg-ac-restr-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'wdg-ac-restr-action';
      editBtn.dataset.role = 'edit';
      editBtn.dataset.index = String(index);
      editBtn.textContent = 'Editar';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'wdg-ac-restr-action';
      removeBtn.dataset.role = 'remove';
      removeBtn.dataset.index = String(index);
      removeBtn.textContent = 'Remover';
      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      head.appendChild(dateWrap);
      head.appendChild(actions);

      const obs = document.createElement('div');
      obs.className = 'wdg-ac-restr-obs';
      obs.textContent = item.observacao || 'Sem justificativa informada.';

      card.appendChild(head);
      card.appendChild(obs);
      frag.appendChild(card);
    });
    listEl.appendChild(frag);
    updateStats();
  }

  function populateFormFromItem(item){
    if(!item) return;
    inputData.value = formatDateLabel(item.date);
    inputHoraInicio.value = item.start;
    inputHoraFim.value = item.end;
    inputObs.value = item.observacao || '';
    updateObsCount();
    editorStatusEl.textContent = 'Editando restrição';
    applyBtn.textContent = 'Atualizar restrição';
    resetBtn.disabled = false;
    cancelEditBtn.hidden = false;
    cancelEditBtn.disabled = false;
  }

  function startEdit(index){
    const idx = Number(index);
    if(Number.isNaN(idx) || idx < 0 || idx >= state.list.length) return;
    state.editingIndex = idx;
    populateFormFromItem(state.list[idx]);
    setFeedback('Editando registro existente. Altere os campos e atualize.', 'info', 4200);
  }

  function removeItem(index){
    const idx = Number(index);
    if(Number.isNaN(idx) || idx < 0 || idx >= state.list.length) return;
    state.list.splice(idx, 1);
    clearForm(true);
    renderList();
    setFeedback('Restrição removida.', 'info', 3200);
  }

  function applyForm(){
    const date = normalizeDate(inputData.value);
    const start = normalizeTime(inputHoraInicio.value);
    const end = normalizeTime(inputHoraFim.value);
    const obs = inputObs.value.trim();
    if(!date){
      setFeedback('Informe uma data válida.', 'warning', 3600);
      inputData.focus();
      return;
    }
    if(!start){
      setFeedback('Informe o horário inicial.', 'warning', 3600);
      inputHoraInicio.focus();
      return;
    }
    if(!end){
      setFeedback('Informe o horário final.', 'warning', 3600);
      inputHoraFim.focus();
      return;
    }
    if(minutesFromTime(end) <= minutesFromTime(start)){
      setFeedback('O horário final deve ser posterior ao horário inicial.', 'danger', 4200);
      inputHoraFim.focus();
      return;
    }
    if(!obs){
      setFeedback('Descreva a justificativa para a restrição.', 'warning', 4000);
      inputObs.focus();
      return;
    }
    const item = { date, start, end, observacao: obs };
    const duplicateIndex = state.list.findIndex((entry, idx) => idx !== state.editingIndex && entry.date === date && entry.start === start && entry.end === end);
    if(duplicateIndex >= 0){
      setFeedback('Já existe uma restrição para este período. Ajuste o intervalo.', 'warning', 4200);
      return;
    }
    if(state.editingIndex >= 0){
      state.list[state.editingIndex] = item;
      setFeedback('Restrição atualizada.', 'success', 3200);
    } else {
      state.list.push(item);
      setFeedback('Restrição adicionada.', 'success', 2800);
    }
    state.list.sort((a,b) => {
      if(a.date === b.date) return minutesFromTime(a.start) - minutesFromTime(b.start);
      return a.date < b.date ? -1 : 1;
    });
    clearForm(true);
    renderList();
  }

  function gatherResult(){
    const areaClone = cloneDeep(state.area);
    if(areaClone) areaClone.restricoes = exportRestrictions();
    const areaId = state.area && (state.area._id || state.area.id || state.area.area_id) ? String(state.area._id || state.area.id || state.area.area_id) : null;
    return {
      area: areaClone,
      areaId,
      restrictions: exportRestrictions()
    };
  }

  function openModal(options){
    const opts = options || {};
    state.area = opts.area ? cloneDeep(opts.area) : null;
    importRestrictions(opts.restricoes || opts.restrictions || opts.bloqueios || []);
    state.editingIndex = -1;
    state.pendingResolve = null;
    state.confirmed = false;
    clearForm(true);
    renderList();

    if(areaNomeEl){
      const nome = (state.area && (state.area.nome || state.area.label || state.area.area_nome)) || 'Área comum';
      areaNomeEl.textContent = String(nome);
    }
    if(areaUnidadeEl){
      const unidade = state.area && (state.area.unidade_label || state.area.unidadeNome || (state.area.unidade && (state.area.unidade.nome || state.area.unidade_label)));
      areaUnidadeEl.textContent = unidade ? String(unidade) : 'Unidade não informada';
    }
    updateObsCount();
    resetBtn.disabled = true;
    cancelEditBtn.hidden = true;
    cancelEditBtn.disabled = true;
    setFeedback('', null);

    return new Promise(resolve => {
      state.pendingResolve = resolve;
      bsModal.show();
    });
  }

  function closeModal(){
    bsModal.hide();
  }

  listEl.addEventListener('click', ev => {
    const btn = ev.target.closest('.wdg-ac-restr-action');
    if(!btn) return;
    const role = btn.dataset.role;
    const index = btn.dataset.index;
    if(role === 'edit'){
      startEdit(index);
    } else if(role === 'remove'){
      removeItem(index);
    }
  });

  applyBtn?.addEventListener('click', applyForm);
  resetBtn?.addEventListener('click', () => {
    clearForm();
  });
  cancelEditBtn?.addEventListener('click', () => {
    clearForm();
  });
  inputObs?.addEventListener('input', updateObsCount);

  saveBtn?.addEventListener('click', () => {
    if(!state.list.length){
      setFeedback('Cadastre ao menos uma restrição antes de salvar.', 'warning', 4200);
      return;
    }
    state.confirmed = true;
    const payload = gatherResult();
    if(state.pendingResolve){
      state.pendingResolve({ ...payload, saved: true });
      state.pendingResolve = null;
    }
    document.dispatchEvent(new CustomEvent('area-comum:restricao:salva', { detail: { ...payload, saved: true } }));
    bsModal.hide();
  });

  cancelBtn?.addEventListener('click', () => {
    state.confirmed = false;
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    if(!state.confirmed && state.pendingResolve){
      state.pendingResolve(null);
      state.pendingResolve = null;
    }
    state.area = null;
    state.list = [];
    state.editingIndex = -1;
    state.confirmed = false;
    setFeedback('', null);
    clearForm();
    listEl.innerHTML = '';
    emptyEl.classList.add('is-visible');
  });

  modalEl.addEventListener('shown.bs.modal', () => {
    inputData?.focus({ preventScroll: false });
  });

  window.WDG_AC_RESTR = {
    abrir: openModal,
    fechar: closeModal,
    getState(){
      return {
        area: cloneDeep(state.area),
        list: exportRestrictions(),
        editingIndex: state.editingIndex
      };
    }
  };
})();
