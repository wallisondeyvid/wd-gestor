(function(){
  const modalEl = document.getElementById('modalEditAreaDisponibilidade');
  if(!modalEl || typeof bootstrap === 'undefined') return;

  const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });

  const DAYS = [
    { id: 'sunday', index: 0, short: 'Dom', label: 'Domingo', aliases: ['0','dom','domingo','sun','sunday'] },
    { id: 'monday', index: 1, short: 'Seg', label: 'Segunda-feira', aliases: ['1','seg','segunda','segunda-feira','mon','monday'] },
    { id: 'tuesday', index: 2, short: 'Ter', label: 'Terça-feira', aliases: ['2','ter','terça','terca','terça-feira','terca-feira','tue','tuesday'] },
    { id: 'wednesday', index: 3, short: 'Qua', label: 'Quarta-feira', aliases: ['3','qua','quarta','quarta-feira','wed','wednesday'] },
    { id: 'thursday', index: 4, short: 'Qui', label: 'Quinta-feira', aliases: ['4','qui','quinta','quinta-feira','thu','thursday'] },
    { id: 'friday', index: 5, short: 'Sex', label: 'Sexta-feira', aliases: ['5','sex','sexta','sexta-feira','fri','friday'] },
    { id: 'saturday', index: 6, short: 'Sáb', label: 'Sábado', aliases: ['6','sab','sáb','sabado','sábado','sat','saturday'] }
  ];
  const DAY_MAP = DAYS.reduce((map, day) => {
    map[day.id] = day.id;
    (day.aliases || []).forEach(alias => { map[String(alias).toLowerCase()] = day.id; });
    return map;
  }, {});

  const areaNomeEl = modalEl.querySelector('#acDispAreaNome');
  const areaUnidadeEl = modalEl.querySelector('#acDispAreaUnidade');
  const dayButtons = Array.from(modalEl.querySelectorAll('[data-role="day-selector"]'));
  const copyButtons = Array.from(modalEl.querySelectorAll('[data-role="copy-target"]'));
  const dayEnabledSwitch = modalEl.querySelector('#acDispDayEnabled');
  const currentDayTitle = modalEl.querySelector('#acDispCurrentDayTitle');
  const feedbackEl = modalEl.querySelector('#acDispFeedback');
  const resumoEl = modalEl.querySelector('#acDispResumo');
  const badgeDias = modalEl.querySelector('#acDispBadgeDias');
  const badgeSlots = modalEl.querySelector('#acDispBadgeSlots');
  const slotList = modalEl.querySelector('#acDispSlotList');
  const slotEmpty = modalEl.querySelector('#acDispSlotEmpty');
  const horaInicioInput = modalEl.querySelector('#acDispHoraInicio');
  const horaFimInput = modalEl.querySelector('#acDispHoraFim');
  const addSlotBtn = modalEl.querySelector('[data-action="add-slot"]');
  const clearDayBtn = modalEl.querySelector('[data-action="clear-day"]');
  const copyBtn = modalEl.querySelector('[data-action="copy-day"]');
  const cancelBtn = modalEl.querySelector('[data-action="cancel"]');
  const saveBtn = modalEl.querySelector('[data-action="save"]');

  const state = {
    area: null,
    selectedDay: 'monday',
    data: makeDefaultState(),
    copyTargets: new Set(),
    pendingResolve: null,
    confirmed: false
  };
  let feedbackTimer = null;

  function makeDefaultState(){
    const base = {};
    DAYS.forEach(day => {
      base[day.id] = { enabled: false, slots: [] };
    });
    return base;
  }

  function cloneDeep(obj){
    return obj ? JSON.parse(JSON.stringify(obj)) : obj;
  }

  function resolveDayId(input){
    if(input == null) return null;
    if(typeof input === 'number' && input >=0 && input <=6){
      return DAYS[input] ? DAYS[input].id : null;
    }
    const value = String(input).trim().toLowerCase();
    if(value === '') return null;
    if(DAY_MAP[value]) return DAY_MAP[value];
    if(/^\d$/.test(value)){ return DAYS[Number(value)] ? DAYS[Number(value)].id : null; }
    return null;
  }

  function normalizeTime(value){
    if(value == null) return null;
    if(value instanceof Date){
      const hour = value.getHours();
      const minute = value.getMinutes();
      return pad(hour) + ':' + pad(minute);
    }
    let str = String(value).trim();
    if(!str) return null;
    str = str.replace(/[hH]/,'_').replace(/[^0-9_:\.]/g,'').replace(/[\.]/g,':').replace(/_/g,':');
    if(/^\d{3,4}$/.test(str)){
      str = str.slice(0, str.length-2) + ':' + str.slice(-2);
    }
    if(/^\d{1,2}:\d{1,2}$/.test(str)){
      const parts = str.split(':');
      const hour = Number(parts[0]);
      const minute = Number(parts[1]);
      if(Number.isNaN(hour) || Number.isNaN(minute)) return null;
      if(hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
      return pad(hour) + ':' + pad(minute);
    }
    return null;
  }

  function pad(n){ return String(Math.floor(n)).padStart(2,'0'); }
  function toMinutes(time){
    if(!/^\d{2}:\d{2}$/.test(time)) return NaN;
    const [h,m] = time.split(':').map(Number);
    return (h*60) + m;
  }

  function selectDay(dayId){
    if(!state.data[dayId]) dayId = 'monday';
    state.selectedDay = dayId;
    if(state.copyTargets.has(dayId)) state.copyTargets.delete(dayId);
    renderDayButtons();
    renderCopyTargets();
    renderEditor();
  }

  function renderDayButtons(){
    dayButtons.forEach(btn => {
      const day = btn.getAttribute('data-day');
      const info = state.data[day];
      btn.classList.toggle('is-active', day === state.selectedDay);
      btn.setAttribute('data-enabled', info && info.enabled ? 'true' : 'false');
      btn.setAttribute('aria-pressed', day === state.selectedDay ? 'true' : 'false');
    });
  }

  function renderCopyTargets(){
    copyButtons.forEach(btn => {
      const day = btn.getAttribute('data-day');
      if(day === state.selectedDay){
        btn.classList.remove('is-active');
        btn.disabled = true;
        state.copyTargets.delete(day);
      } else {
        btn.disabled = false;
        btn.classList.toggle('is-active', state.copyTargets.has(day));
      }
    });
    updateCopyButtonState();
  }

  function renderEditor(){
    const dayInfo = state.data[state.selectedDay] || { enabled:false, slots:[] };
    const dayMeta = DAYS.find(d => d.id === state.selectedDay) || DAYS[1];
    currentDayTitle.textContent = dayMeta ? dayMeta.label : 'Dia';
    dayEnabledSwitch.checked = !!dayInfo.enabled;
    const enabled = !!dayInfo.enabled;
    horaInicioInput.disabled = !enabled;
    horaFimInput.disabled = !enabled;
    addSlotBtn.disabled = !enabled;
    clearDayBtn.disabled = !enabled || !(dayInfo.slots && dayInfo.slots.length);
    copyBtn.disabled = !enabled || !(dayInfo.slots && dayInfo.slots.length) || state.copyTargets.size === 0;
    renderSlotList(dayInfo);
  }

  function renderSlotList(dayInfo){
    const slots = Array.isArray(dayInfo.slots) ? dayInfo.slots.slice().sort((a,b) => toMinutes(a.start) - toMinutes(b.start)) : [];
    dayInfo.slots = slots;
    slotList.innerHTML = '';
    if(!slots.length){
      slotEmpty.classList.add('is-visible');
      return;
    }
    slotEmpty.classList.remove('is-visible');
    slots.forEach((slot, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'wdg-ac-slot';
      wrapper.dataset.index = String(index);

      const info = document.createElement('div');
      info.className = 'wdg-ac-slot-info';

      const time = document.createElement('span');
      time.className = 'wdg-ac-slot-time';
      time.textContent = `${slot.start} → ${slot.end}`;
      info.appendChild(time);

      const meta = document.createElement('span');
      meta.className = 'wdg-ac-slot-meta';
      meta.textContent = `Intervalo ${index + 1}`;
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'wdg-ac-slot-actions';
      const btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'wdg-ac-slot-btn';
      btnRemove.dataset.action = 'remove-slot';
      btnRemove.dataset.index = String(index);
      btnRemove.textContent = 'Remover';
      actions.appendChild(btnRemove);

      wrapper.appendChild(info);
      wrapper.appendChild(actions);
      slotList.appendChild(wrapper);
    });
  }

  function updateSummary(){
    let dias = 0;
    let intervals = 0;
    Object.keys(state.data).forEach(day => {
      const info = state.data[day];
      if(info && info.enabled && Array.isArray(info.slots) && info.slots.length){
        dias += 1;
        intervals += info.slots.length;
      }
    });
    if(badgeDias) badgeDias.textContent = String(dias);
    if(badgeSlots) badgeSlots.textContent = String(intervals);
    if(resumoEl){
      if(dias === 0){
        resumoEl.textContent = 'Nenhum dia disponível configurado.';
      } else {
        resumoEl.textContent = `${dias} dia(s) disponível(is) com ${intervals} intervalo(s) ao todo.`;
      }
    }
  }

  function setFeedback(message, status, autoHideMs){
    if(feedbackTimer){ clearTimeout(feedbackTimer); feedbackTimer = null; }
    if(!feedbackEl) return;
    if(!message){
      feedbackEl.removeAttribute('data-status');
      feedbackEl.textContent = '';
      return;
    }
    const type = status || 'info';
    feedbackEl.dataset.status = type;
    feedbackEl.textContent = message;
    if(autoHideMs && autoHideMs > 0){
      feedbackTimer = setTimeout(() => {
        feedbackEl.removeAttribute('data-status');
        feedbackEl.textContent = '';
      }, autoHideMs);
    }
  }

  function appendSlot(){
    const dayInfo = state.data[state.selectedDay];
    if(!dayInfo || !dayInfo.enabled){
      setFeedback('Habilite o dia para cadastrar intervalos.', 'warning', 3500);
      return;
    }
    const startRaw = normalizeTime(horaInicioInput.value);
    const endRaw = normalizeTime(horaFimInput.value);
    if(!startRaw || !endRaw){
      setFeedback('Informe horários válidos (HH:MM).', 'warning', 4000);
      if(!startRaw) horaInicioInput.focus(); else if(!endRaw) horaFimInput.focus();
      return;
    }
    if(toMinutes(endRaw) <= toMinutes(startRaw)){
      setFeedback('O horário final deve ser posterior ao horário inicial.', 'danger', 4500);
      horaFimInput.focus();
      return;
    }
    const overlap = dayInfo.slots.some(slot => {
      const startExisting = toMinutes(slot.start);
      const endExisting = toMinutes(slot.end);
      const startNew = toMinutes(startRaw);
      const endNew = toMinutes(endRaw);
      return (startNew < endExisting) && (endNew > startExisting);
    });
    if(overlap){
      setFeedback('Este intervalo conflita com outro já cadastrado.', 'danger', 4200);
      return;
    }
    dayInfo.slots.push({ start: startRaw, end: endRaw });
    dayInfo.slots.sort((a,b) => toMinutes(a.start) - toMinutes(b.start));
    horaInicioInput.value = '';
    horaFimInput.value = '';
    renderEditor();
    updateSummary();
    setFeedback('Intervalo adicionado.', 'success', 2800);
  }

  function clearDaySlots(){
    const info = state.data[state.selectedDay];
    if(!info) return;
    info.slots = [];
    renderEditor();
    updateSummary();
    setFeedback('Intervalos removidos para este dia.', 'info', 3000);
  }

  function handleSlotListClick(ev){
    const btn = ev.target.closest('[data-action="remove-slot"]');
    if(!btn) return;
    const index = Number(btn.dataset.index);
    if(Number.isNaN(index)) return;
    const info = state.data[state.selectedDay];
    if(!info || !info.slots) return;
    info.slots.splice(index, 1);
    renderEditor();
    updateSummary();
    setFeedback('Intervalo removido.', 'info', 2600);
  }

  function toggleCopyTarget(dayId){
    if(!state.data[dayId]) return;
    if(dayId === state.selectedDay) return;
    if(state.copyTargets.has(dayId)) state.copyTargets.delete(dayId);
    else state.copyTargets.add(dayId);
    renderCopyTargets();
  }

  function updateCopyButtonState(){
    const info = state.data[state.selectedDay];
    const canCopy = info && info.enabled && Array.isArray(info.slots) && info.slots.length && state.copyTargets.size > 0;
    copyBtn.disabled = !canCopy;
  }

  function copyCurrentDayToTargets(){
    const sourceInfo = state.data[state.selectedDay];
    if(!sourceInfo || !sourceInfo.enabled || !sourceInfo.slots.length){
      setFeedback('Cadastre ao menos um intervalo antes de copiar.', 'warning', 3600);
      return;
    }
    if(state.copyTargets.size === 0){
      setFeedback('Selecione os dias que devem receber os intervalos.', 'warning', 3600);
      return;
    }
    state.copyTargets.forEach(dayId => {
      if(!state.data[dayId]) return;
      state.data[dayId].enabled = true;
      state.data[dayId].slots = sourceInfo.slots.map(slot => ({ ...slot }));
    });
    setFeedback(`Intervalos aplicados a ${state.copyTargets.size} dia(s).`, 'success', 3200);
    renderDayButtons();
    renderCopyTargets();
    updateSummary();
  }

  function handleDaySwitch(){
    const info = state.data[state.selectedDay];
    if(!info) return;
    info.enabled = !!dayEnabledSwitch.checked;
    if(!info.enabled){
      // manter intervalos salvos, apenas desativar
      setFeedback('Dia desativado. Os intervalos permanecerão salvos para futura reativação.', 'info', 4000);
    } else {
      setFeedback('Dia habilitado para receber reservas.', 'info', 3000);
    }
    renderEditor();
    renderDayButtons();
    updateSummary();
  }

  function importSchedule(schedule){
    state.data = makeDefaultState();
    if(!Array.isArray(schedule)) return;
    schedule.forEach(entry => {
      if(!entry) return;
      let dayId = null;
      if(entry.day) dayId = resolveDayId(entry.day);
      if(dayId == null && entry.weekday != null) dayId = resolveDayId(entry.weekday);
      if(dayId == null && entry.weekday_index != null) dayId = resolveDayId(entry.weekday_index);
      if(dayId == null && entry.dia != null) dayId = resolveDayId(entry.dia);
      if(dayId == null && entry.dia_semana != null) dayId = resolveDayId(entry.dia_semana);
      if(dayId == null && entry.index != null) dayId = resolveDayId(entry.index);
      if(dayId == null) return;
      const info = state.data[dayId];
      if(!info) return;
      info.enabled = entry.enabled !== false && entry.disponivel !== false && entry.ativo !== false;
      const slots = Array.isArray(entry.intervals) ? entry.intervals : (Array.isArray(entry.slots) ? entry.slots : (Array.isArray(entry.horarios) ? entry.horarios : []));
      const parsed = [];
      slots.forEach(slot => {
        if(slot == null) return;
        let start = null;
        let end = null;
        if(typeof slot === 'string'){
          const parts = slot.split(/\s*(?:-|→|a|até|\/)\s*/i);
          if(parts.length === 2){
            start = normalizeTime(parts[0]);
            end = normalizeTime(parts[1]);
          }
        } else if(typeof slot === 'object'){
          start = normalizeTime(slot.start || slot.inicio || slot.de || slot.from || slot.hora_inicio || slot.horaInicio);
          end = normalizeTime(slot.end || slot.fim || slot.ate || slot.to || slot.hora_fim || slot.horaFim || slot.termino);
        }
        if(start && end && toMinutes(end) > toMinutes(start)){
          parsed.push({ start, end });
        }
      });
      parsed.sort((a,b) => toMinutes(a.start) - toMinutes(b.start));
      info.slots = parsed;
      if(info.slots.length && entry.enabled === false) info.enabled = false;
      if(info.slots.length && info.enabled === false && entry.enabled == null && entry.disponivel == null && entry.ativo == null){
        info.enabled = true; // assume habilitado se há intervalos
      }
    });
  }

  function exportSchedule(){
    const out = [];
    DAYS.forEach(day => {
      const info = state.data[day.id];
      if(!info || !info.enabled || !Array.isArray(info.slots) || !info.slots.length) return;
      out.push({
        day: day.id,
        day_label: day.label,
        day_index: day.index,
        intervals: info.slots.map(slot => ({ start: slot.start, end: slot.end }))
      });
    });
    return out;
  }

  function resetModalState(){
    state.area = null;
    state.selectedDay = 'monday';
    state.data = makeDefaultState();
    state.copyTargets = new Set();
    state.pendingResolve = null;
    state.confirmed = false;
    horaInicioInput.value = '';
    horaFimInput.value = '';
    setFeedback('', null);
    renderDayButtons();
    renderCopyTargets();
    renderEditor();
    updateSummary();
  }

  function gatherResult(){
    return {
      area: state.area ? cloneDeep(state.area) : null,
      areaId: state.area && (state.area._id || state.area.id || state.area.area_id) ? String(state.area._id || state.area.id || state.area.area_id) : null,
      schedule: exportSchedule()
    };
  }

  function openModal(options){
    const opts = options || {};
    state.area = opts.area ? cloneDeep(opts.area) : null;
    importSchedule(opts.disponibilidades || opts.schedule || opts.agenda || []);
    state.selectedDay = findFirstEnabledDay() || 'monday';
    state.copyTargets = new Set();
    state.pendingResolve = null;
    state.confirmed = false;

    if(areaNomeEl){
      const nome = (state.area && (state.area.nome || state.area.label || state.area.area_nome)) || 'Área comum';
      areaNomeEl.textContent = String(nome || 'Área comum');
    }
    if(areaUnidadeEl){
      const unidade = state.area && (state.area.unidade_label || state.area.unidadeNome || (state.area.unidade && (state.area.unidade.nome || state.area.unidade_label)));
      areaUnidadeEl.textContent = unidade ? String(unidade) : 'Unidade não informada';
    }

    renderDayButtons();
    renderCopyTargets();
    renderEditor();
    updateSummary();

    setTimeout(() => {
      if(dayEnabledSwitch) dayEnabledSwitch.focus({ preventScroll: false });
    }, 100);

    return new Promise(resolve => {
      state.pendingResolve = resolve;
      bsModal.show();
    });
  }

  function findFirstEnabledDay(){
    const found = DAYS.find(day => {
      const info = state.data[day.id];
      return info && info.enabled && info.slots && info.slots.length;
    });
    return found ? found.id : null;
  }

  dayButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.getAttribute('data-day');
      selectDay(day);
    });
  });

  copyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.getAttribute('data-day');
      toggleCopyTarget(day);
    });
  });

  slotList.addEventListener('click', handleSlotListClick);
  addSlotBtn?.addEventListener('click', appendSlot);
  clearDayBtn?.addEventListener('click', clearDaySlots);
  copyBtn?.addEventListener('click', copyCurrentDayToTargets);
  dayEnabledSwitch?.addEventListener('change', handleDaySwitch);

  cancelBtn?.addEventListener('click', () => {
    state.confirmed = false;
    if(state.pendingResolve){
      state.pendingResolve(null);
      state.pendingResolve = null;
    }
  });

  saveBtn?.addEventListener('click', () => {
    const schedule = exportSchedule();
    if(!schedule.length){
      setFeedback('Selecione ao menos um dia com intervalo para salvar.', 'warning', 4200);
      return;
    }
    state.confirmed = true;
    const payload = gatherResult();
    if(state.pendingResolve){
      state.pendingResolve(payload);
      state.pendingResolve = null;
    }
    const eventDetail = { area: payload.area, areaId: payload.areaId, schedule: payload.schedule };
    document.dispatchEvent(new CustomEvent('area-comum:disponibilidade:salva', { detail: eventDetail }));
    bsModal.hide();
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    if(!state.confirmed && state.pendingResolve){
      state.pendingResolve(null);
      state.pendingResolve = null;
    }
    resetModalState();
  });

  modalEl.addEventListener('shown.bs.modal', () => {
    if(dayEnabledSwitch) dayEnabledSwitch.focus({ preventScroll: false });
  });

  function closeModal(){
    bsModal.hide();
  }

  window.WDG_AC_DISP = {
    abrir: openModal,
    fechar: closeModal,
    getState(){
      return { area: cloneDeep(state.area), data: cloneDeep(state.data), selectedDay: state.selectedDay };
    }
  };
})();
