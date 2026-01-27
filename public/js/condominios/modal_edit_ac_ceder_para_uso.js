(function(){
  const modalId = 'modalEditACCederParaUso';
  const modalEl = document.getElementById(modalId);
  if(!modalEl) return;

  let modalInstance = null;
  const tabTriggers = Array.from(modalEl.querySelectorAll('[data-bs-toggle="tab"]'));
  const totalTabs = tabTriggers.length;
  const prevBtn = modalEl.querySelector('[data-role="tab-prev"]');
  const nextBtn = modalEl.querySelector('[data-role="tab-next"]');
  const reservaForm = modalEl.querySelector('#formCederReserva');
  const reservaListEl = modalEl.querySelector('#listaCederReserva');
  const addReservaBtn = modalEl.querySelector('[data-section="reserva"]');
  const resumoUnidadeEls = Array.from(modalEl.querySelectorAll('[data-role="resumo-unidade"]'));
  const resumoAreaEls = Array.from(modalEl.querySelectorAll('[data-role="resumo-area"]'));
  const reservaInputs = {
    dataInicial: modalEl.querySelector('#cederDataInicial'),
    horaInicial: modalEl.querySelector('#cederHoraInicial'),
    horaFinal: modalEl.querySelector('#cederHoraFinal'),
    repeatDates: modalEl.querySelector('#cederDatasRepeticao')
  };
  const repeatControlEl = modalEl.querySelector('[data-role="repeat-control"]');
  const repeatChipsEl = modalEl.querySelector('[data-role="repeat-chips"]');
  const repeatOpenBtn = modalEl.querySelector('[data-role="repeat-open"]');
  const repeatPanel = modalEl.querySelector('[data-role="repeat-calendar"]');
  const repeatMonthLabel = modalEl.querySelector('[data-role="repeat-month"]');
  const repeatGrid = modalEl.querySelector('[data-role="repeat-grid"]');
  const repeatPrevBtn = modalEl.querySelector('[data-role="repeat-prev-month"]');
  const repeatNextBtn = modalEl.querySelector('[data-role="repeat-next-month"]');
  const repeatClearBtn = modalEl.querySelector('[data-role="repeat-clear"]');
  const repeatCloseBtn = modalEl.querySelector('[data-role="repeat-close"]');
  const rawBasePath = (reservaListEl && reservaListEl.dataset.basePath) || document.body.getAttribute('data-base-path') || '/condominios';
  const BASE_PATH = (rawBasePath ? String(rawBasePath).replace(/\/$/, '') : '/condominios') || '/condominios';
  const cessionarioForm = modalEl.querySelector('#formCederCessionario');
  const cessionarioListEl = modalEl.querySelector('#listaCederCessionario');
  const addCessionarioBtn = modalEl.querySelector('[data-section="cessionario"]');
  const cessionarioCancelBtn = modalEl.querySelector('[data-role="cessionario-cancel-edit"]');
  const cessionarioClearBtn = modalEl.querySelector('[data-role="cessionario-clear"]');
  const cessionarioFields = {
    habitacao: modalEl.querySelector('#acCessCessionarioHab'),
    morador: modalEl.querySelector('#acCessCessionarioMoradores'),
    nome: modalEl.querySelector('#acCessCessionarioNome'),
    cpf: modalEl.querySelector('#acCessCessionarioCPF'),
    nascimento: modalEl.querySelector('#acCessCessionarioNascimento'),
    sexo: modalEl.querySelector('#acCessCessionarioSexo'),
    rg: modalEl.querySelector('#acCessCessionarioRG'),
    pai: modalEl.querySelector('#acCessCessionarioPai'),
    mae: modalEl.querySelector('#acCessCessionarioMae'),
    estadoCivil: modalEl.querySelector('#acCessCessionarioEstadoCivil'),
    profissao: modalEl.querySelector('#acCessCessionarioProfissao'),
    nacionalidade: modalEl.querySelector('#acCessCessionarioNacionalidade'),
    endereco: modalEl.querySelector('#acCessCessionarioEndereco'),
    email: modalEl.querySelector('#acCessCessionarioEmail'),
    telefone: modalEl.querySelector('#acCessCessionarioTelefone'),
    whatsapp: modalEl.querySelector('#acCessCessionarioWhatsapp')
  };
  const cessionarioListEmptyText = cessionarioListEl ? cessionarioListEl.textContent.trim() : 'Nenhum cessionário adicionado.';

  const prepostoForm = modalEl.querySelector('#formCederPreposto');
  const prepostoListEl = modalEl.querySelector('#listaCederPreposto');
  const addPrepostoBtn = modalEl.querySelector('[data-role="preposto-submit"]');
  const prepostoCancelBtn = modalEl.querySelector('[data-role="preposto-cancel-edit"]');
  const prepostoClearBtn = modalEl.querySelector('[data-role="preposto-clear"]');
  const prepostoFields = {
    colaborador: modalEl.querySelector('#acPrepostoColaborador'),
    nome: modalEl.querySelector('#acPrepostoNome'),
    cpf: modalEl.querySelector('#acPrepostoCPF'),
    nascimento: modalEl.querySelector('#acPrepostoNascimento'),
    sexo: modalEl.querySelector('#acPrepostoSexo'),
    rg: modalEl.querySelector('#acPrepostoRG'),
    pai: modalEl.querySelector('#acPrepostoPai'),
    mae: modalEl.querySelector('#acPrepostoMae'),
    estadoCivil: modalEl.querySelector('#acPrepostoEstadoCivil'),
    profissao: modalEl.querySelector('#acPrepostoProfissao'),
    nacionalidade: modalEl.querySelector('#acPrepostoNacionalidade'),
    endereco: modalEl.querySelector('#acPrepostoEndereco'),
    email: modalEl.querySelector('#acPrepostoEmail'),
    telefone: modalEl.querySelector('#acPrepostoTelefone'),
    whatsapp: modalEl.querySelector('#acPrepostoWhatsapp')
  };
  const prepostoListEmptyText = prepostoListEl ? prepostoListEl.textContent.trim() : 'Nenhum preposto vinculado.';
  const materiaisDisponiveisListEl = modalEl.querySelector('#listaMateriaisDisponiveis');
  const materiaisExtraidosListEl = modalEl.querySelector('#listaMateriaisExtraidos');
  const materiaisCessaoListEl = modalEl.querySelector('#listaMateriaisCessao');
  const materiaisExtrairBtn = modalEl.querySelector('[data-role="materiais-extrair"]');
  const materiaisInserirBtn = modalEl.querySelector('[data-role="materiais-inserir"]');
  const taxasForm = modalEl.querySelector('#formCederTaxas');
  const taxasListEl = modalEl.querySelector('#listaCederTaxas');
  const taxaCancelBtn = modalEl.querySelector('[data-role="taxa-cancel-edit"]');
  const taxaClearBtn = modalEl.querySelector('[data-role="taxa-clear"]');
  const taxaSubmitBtn = modalEl.querySelector('[data-role="taxa-submit"]');
  const taxaFields = {
    tipo: modalEl.querySelector('#acTaxaTipo'),
    valor: modalEl.querySelector('#acTaxaValor'),
    vencimento: modalEl.querySelector('#acTaxaVencimento'),
    fundo: modalEl.querySelector('#acTaxaFundo'),
    fundamento: modalEl.querySelector('#acTaxaFundamento')
  };
  const taxaBoletoFields = {
    enabled: modalEl.querySelector('#acTaxaBoletoHabilitado'),
    banco: modalEl.querySelector('#acTaxaBoletoBanco'),
    carteira: modalEl.querySelector('#acTaxaBoletoCarteira'),
    documento: modalEl.querySelector('#acTaxaBoletoDocumento'),
    instrucao: modalEl.querySelector('#acTaxaBoletoInstrucao'),
    multa: modalEl.querySelector('#acTaxaBoletoMulta'),
    juros: modalEl.querySelector('#acTaxaBoletoJuros'),
    enviarEmail: modalEl.querySelector('#acTaxaBoletoEnviarEmail'),
    enviarWhatsapp: modalEl.querySelector('#acTaxaBoletoEnviarWhatsapp')
  };
  const taxaValorGroup = modalEl.querySelector('[data-role="taxa-valor-group"]');
  const taxaVencimentoGroup = modalEl.querySelector('[data-role="taxa-vencimento-group"]');
  const taxaBoletoConfigWrapper = modalEl.querySelector('[data-role="taxa-boleto-config"]');
  const abatimentoFields = {
    titulo: modalEl.querySelector('#acAbatimentoTitulo'),
    percentual: modalEl.querySelector('#acAbatimentoPercentual'),
    descricao: modalEl.querySelector('#acAbatimentoDescricao')
  };
  const abatimentoSubmitBtn = modalEl.querySelector('[data-role="abatimento-submit"]');
  const abatimentoCancelBtn = modalEl.querySelector('[data-role="abatimento-cancel-edit"]');
  const abatimentoListEl = modalEl.querySelector('#listaTaxaAbatimentos');
  const taxaListEmptyText = taxasListEl ? taxasListEl.textContent.trim() : 'Nenhuma taxa cadastrada.';
  const abatimentoListEmptyText = abatimentoListEl ? abatimentoListEl.textContent.trim() : 'Nenhum abatimento informado.';
  const foroForm = modalEl.querySelector('#formCederForo');
  const foroListEl = modalEl.querySelector('#listaCederForo');
  const foroSubmitBtn = modalEl.querySelector('[data-role="foro-submit"]');
  const foroClearBtn = modalEl.querySelector('[data-role="foro-clear"]');
  const foroFields = {
    estado: modalEl.querySelector('#acForoEstado'),
    municipio: modalEl.querySelector('#acForoMunicipio'),
    vara: modalEl.querySelector('#acForoVara')
  };
  const foroListEmptyText = foroListEl ? foroListEl.textContent.trim() : 'Nenhum foro cadastrado.';
  const RESERVA_PAGE_SIZE = 4;
  const MATERIALS_PAGE_SIZE = 4;
  let reservasBound = false;
  let cessionariosBound = false;
  let prepostosBound = false;
  let materiaisBound = false;
  let taxasBound = false;
  let forosBound = false;
  let stepperBound = false;
  let reservas = [];
  let cessionarios = [];
  let prepostos = [];
  let taxas = [];
  let foros = [];
  const materiaisState = {
    disponiveis: [],
    extraidos: [],
    cessao: [],
    selecionados: new Set(),
    pager: {
      disponiveis: 0,
      extraidos: 0,
      cessao: 0
    }
  };
  let reservaPage = 0;
  let reservaEditId = null;
  let cessionarioEditId = null;
  let prepostoEditId = null;
  let taxaEditId = null;
  let taxaFormAbatimentos = [];
  let taxaAbatimentoEditId = null;
  let foroEditId = null;
  let materialUidCounter = 0;
  let snapshot = null;
  let resolveFn = null;
  let rejectFn = null;
  let repeatControlsBound = false;
  let unidadeFinanceiroDefaults = null;
  const cessionarioState = {
    unidadeId: '',
    unidadeLabel: '',
    unidadeEndereco: '',
    habitacoes: [],
    habitacaoMap: new Map(),
    moradoresById: new Map(),
    habitacoesPromise: null,
    lastHabitacoesUnidadeId: ''
  };
  const prepostoState = {
    unidadeId: '',
    unidadeLabel: '',
    unidadeEndereco: '',
    colaboradores: [],
    colaboradorMap: new Map(),
    colaboradoresPromise: null,
    lastUnidadeId: ''
  };
  const WEEKDAY_INFO = [
    { id: 'sunday', index: 0, aliases: ['0', 'dom', 'domingo', 'sun', 'sunday'] },
    { id: 'monday', index: 1, aliases: ['1', 'seg', 'segunda', 'segunda-feira', 'mon', 'monday'] },
    { id: 'tuesday', index: 2, aliases: ['2', 'ter', 'terca', 'terca-feira', 'tue', 'tuesday'] },
    { id: 'wednesday', index: 3, aliases: ['3', 'qua', 'quarta', 'quarta-feira', 'wed', 'wednesday'] },
    { id: 'thursday', index: 4, aliases: ['4', 'qui', 'quinta', 'quinta-feira', 'thu', 'thursday'] },
    { id: 'friday', index: 5, aliases: ['5', 'sex', 'sexta', 'sexta-feira', 'fri', 'friday'] },
    { id: 'saturday', index: 6, aliases: ['6', 'sab', 'sabado', 'sáb', 'sábado', 'sat', 'saturday'] }
  ];
  const WEEKDAY_ALIAS = WEEKDAY_INFO.reduce((map, day) => {
    map[day.id] = day.id;
    map[String(day.index)] = day.id;
    (day.aliases || []).forEach(alias => { map[String(alias).toLowerCase()] = day.id; });
    return map;
  }, {});
  const MINUTES_PER_DAY = 24 * 60;
  let areaScheduleCache = null;
  let areaRestrictionCache = null;
  let repeatDatesSelected = new Set();
  let repeatCalendarCursor = new Date();
  let repeatPanelVisible = false;
  let estadosBrasilCache = null;
  let estadosBrasilMap = null;
  let municipiosPorUfCache = null;
  let municipiosPorUfPromise = null;

  function getOrCreateModalInstance(){
    if(!modalInstance && window.bootstrap && typeof window.bootstrap.Modal === 'function'){
      modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static' });
    }
    modalEl.style.display = 'block';
    return modalInstance;
  }

  function show(){
    const instance = getOrCreateModalInstance();
    if(instance && typeof instance.show === 'function'){
      instance.show();
    } else {
      modalEl.style.display = 'block';
    }
  }

  function hide(){
    if(modalInstance && typeof modalInstance.hide === 'function'){
      modalInstance.hide();
      return;
    }
    if(window.bootstrap && typeof window.bootstrap.Modal === 'function'){
      const instance = window.bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static' });
      modalInstance = instance;
      if(instance && typeof instance.hide === 'function'){
        instance.hide();
        return;
      }
    }
    modalEl.style.display = 'none';
  }

  function resetAreaCaches(){
    areaScheduleCache = null;
    areaRestrictionCache = null;
  }

  function getSnapshotArea(){
    if(!snapshot || typeof snapshot !== 'object') return {};
    const candidateKeys = ['area', 'areaInfo', 'areaDados', 'areaData', 'dadosArea', 'areaDetalhes', 'area_detail'];
    for(const key of candidateKeys){
      const candidate = snapshot[key];
      if(candidate && typeof candidate === 'object') return candidate;
    }
    return snapshot;
  }
  function fromIsoDate(value){
    if(typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match) return null;
    const ano = Number(match[1]);
    const mes = Number(match[2]) - 1;
    const dia = Number(match[3]);
    if(!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
    const parsed = new Date(ano, mes, dia, 0, 0, 0, 0);
    if(Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  function resetRepeatDates(){
    repeatDatesSelected = new Set();
    closeRepeatCalendar();
    renderRepeatSummary();
  }

  function pruneRepeatDates(){
    const baseDate = reservaInputs.dataInicial ? parseDateBr(reservaInputs.dataInicial.value) : null;
    if(!baseDate) return;
    const baseIso = formatDateIso(baseDate);
    if(repeatDatesSelected.has(baseIso)) repeatDatesSelected.delete(baseIso);
  }

  function syncRepeatInputField(){
    if(!reservaInputs.repeatDates) return;
    if(!repeatDatesSelected || repeatDatesSelected.size === 0){
      reservaInputs.repeatDates.value = '';
      return;
    }
    const sorted = Array.from(repeatDatesSelected).sort();
    reservaInputs.repeatDates.value = sorted.join(',');
  }

  function hydrateRepeatSelectionFromInput(){
    if(!reservaInputs.repeatDates) return;
    const raw = String(reservaInputs.repeatDates.value || '').trim();
    if(!raw) return;
    const tokens = raw.split(/[,;\s]+/).map(part => part.trim()).filter(Boolean);
    if(!tokens.length) return;
    tokens.forEach(token => {
      let iso = null;
      if(/^\d{4}-\d{2}-\d{2}$/.test(token)){
        iso = token;
      } else if(/^\d{2}\/\d{2}\/\d{4}$/.test(token)){
        const parsed = parseDateBr(token);
        if(parsed) iso = formatDateIso(parsed);
      } else {
        const fallback = new Date(token);
        if(!Number.isNaN(fallback.getTime())){
          iso = formatDateIso(fallback);
        }
      }
      if(iso) repeatDatesSelected.add(iso);
    });
    pruneRepeatDates();
    syncRepeatInputField();
  }

  function renderRepeatSummary(){
    if(!repeatChipsEl) return;
    pruneRepeatDates();
    syncRepeatInputField();
    repeatChipsEl.innerHTML = '';
    if(repeatControlEl){
      repeatControlEl.classList.toggle('has-selection', repeatDatesSelected.size > 0);
    }
    if(repeatClearBtn){
      repeatClearBtn.disabled = repeatDatesSelected.size === 0;
    }
    if(!repeatDatesSelected.size){
      const placeholder = document.createElement('span');
      placeholder.className = 'wdg-repeat-placeholder';
      placeholder.textContent = 'Nenhuma data selecionada';
      repeatChipsEl.appendChild(placeholder);
      return;
    }
    const sorted = Array.from(repeatDatesSelected).sort();
    sorted.forEach(iso => {
      const chip = document.createElement('span');
      chip.className = 'wdg-repeat-chip';
      chip.dataset.date = iso;
      const label = document.createElement('span');
      label.className = 'wdg-repeat-chip__label';
      label.textContent = formatIsoToBr(iso);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'wdg-repeat-chip__remove';
      removeBtn.dataset.action = 'remove-repeat-date';
      removeBtn.dataset.date = iso;
      removeBtn.setAttribute('aria-label', `Remover ${formatIsoToBr(iso)}`);
      removeBtn.innerHTML = '&times;';
      chip.appendChild(label);
      chip.appendChild(removeBtn);
      repeatChipsEl.appendChild(chip);
    });
  }

  function openRepeatCalendar(){
    if(!repeatPanel || repeatPanelVisible) return;
    repeatPanelVisible = true;
    repeatPanel.hidden = false;
    repeatPanel.setAttribute('aria-hidden', 'false');
    if(repeatControlEl) repeatControlEl.classList.add('is-open');
    if(repeatOpenBtn) repeatOpenBtn.setAttribute('aria-expanded', 'true');
    updateRepeatCalendarCursorFromInputs();
    renderRepeatCalendar();
    if(typeof repeatPanel.focus === 'function') repeatPanel.focus();
    document.addEventListener('click', handleRepeatOutsideClick, true);
    document.addEventListener('keydown', handleRepeatKeydown, true);
  }

  function closeRepeatCalendar(){
    if(!repeatPanelVisible || !repeatPanel) return;
    repeatPanelVisible = false;
    repeatPanel.hidden = true;
    repeatPanel.setAttribute('aria-hidden', 'true');
    if(repeatControlEl) repeatControlEl.classList.remove('is-open');
    if(repeatOpenBtn) repeatOpenBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', handleRepeatOutsideClick, true);
    document.removeEventListener('keydown', handleRepeatKeydown, true);
    const active = document.activeElement;
    if(repeatOpenBtn && typeof repeatOpenBtn.focus === 'function' && repeatPanel && repeatPanel.contains(active)){
      repeatOpenBtn.focus();
    }
  }

  function updateRepeatCalendarCursorFromInputs(){
    const baseDate = reservaInputs.dataInicial ? parseDateBr(reservaInputs.dataInicial.value) : null;
    const fallback = new Date();
    const source = baseDate || fallback;
    repeatCalendarCursor = new Date(source.getFullYear(), source.getMonth(), 1, 0, 0, 0, 0);
  }

  function changeRepeatMonth(offset){
    if(!Number.isInteger(offset) || !repeatCalendarCursor) return;
    repeatCalendarCursor = new Date(repeatCalendarCursor.getFullYear(), repeatCalendarCursor.getMonth() + offset, 1, 0, 0, 0, 0);
    renderRepeatCalendar();
  }

  function renderRepeatCalendar(){
    if(!repeatPanel || !repeatGrid || !repeatMonthLabel) return;
    const cursor = repeatCalendarCursor instanceof Date && !Number.isNaN(repeatCalendarCursor.getTime())
      ? repeatCalendarCursor
      : new Date();
    const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
    repeatMonthLabel.textContent = monthFormatter.format(cursor);
    repeatGrid.innerHTML = '';
    const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0);
    const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - firstDay.getDay(), 0, 0, 0, 0);
    const baseDate = reservaInputs.dataInicial ? parseDateBr(reservaInputs.dataInicial.value) : null;
    const baseIso = baseDate ? formatDateIso(baseDate) : null;
    const todayIso = formatDateIso(new Date());
    for(let i = 0; i < 42; i += 1){
      const iter = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 0, 0, 0, 0);
      const iso = formatDateIso(iter);
      const dayBtn = document.createElement('button');
      dayBtn.type = 'button';
      dayBtn.className = 'wdg-repeat-calendar__day';
      dayBtn.dataset.date = iso;
      dayBtn.textContent = String(iter.getDate());
      if(iter.getMonth() !== cursor.getMonth()){
        dayBtn.classList.add('is-outside');
      }
      if(repeatDatesSelected.has(iso)){
        dayBtn.classList.add('is-selected');
      }
      if(iso === todayIso){
        dayBtn.classList.add('is-today');
      }
      if(baseIso && iso === baseIso){
        dayBtn.disabled = true;
        dayBtn.classList.add('is-base');
      }
      repeatGrid.appendChild(dayBtn);
    }
  }

  function handleRepeatGridClick(event){
    const target = event.target.closest('[data-date]');
    if(!target || target.disabled) return;
    const iso = target.dataset.date;
    if(repeatDatesSelected.has(iso)) repeatDatesSelected.delete(iso);
    else repeatDatesSelected.add(iso);
    renderRepeatCalendar();
    renderRepeatSummary();
  }

  function handleRepeatChipClick(event){
    const btn = event.target.closest('[data-action="remove-repeat-date"]');
    if(!btn) return;
    const iso = btn.dataset.date;
    if(repeatDatesSelected.delete(iso)){
      renderRepeatSummary();
      renderRepeatCalendar();
    }
  }

  function handleRepeatOutsideClick(event){
    if(!repeatPanelVisible) return;
    if(repeatPanel && repeatPanel.contains(event.target)) return;
    if(repeatControlEl && repeatControlEl.contains(event.target)) return;
    closeRepeatCalendar();
  }

  function handleRepeatKeydown(event){
    if(event.key === 'Escape'){ closeRepeatCalendar(); }
  }

  function bindRepeatControls(){
    if(repeatControlsBound) return;
    repeatControlsBound = true;
    hydrateRepeatSelectionFromInput();
    if(repeatOpenBtn){
      repeatOpenBtn.addEventListener('click', () => {
        if(repeatPanelVisible) closeRepeatCalendar();
        else openRepeatCalendar();
      });
    }
    if(repeatPrevBtn){
      repeatPrevBtn.addEventListener('click', () => changeRepeatMonth(-1));
    }
    if(repeatNextBtn){
      repeatNextBtn.addEventListener('click', () => changeRepeatMonth(1));
    }
    if(repeatClearBtn){
      repeatClearBtn.addEventListener('click', () => {
        resetRepeatDates();
        openRepeatCalendar();
      });
    }
    if(repeatCloseBtn){
      repeatCloseBtn.addEventListener('click', () => closeRepeatCalendar());
    }
    if(repeatGrid){
      repeatGrid.addEventListener('click', handleRepeatGridClick);
    }
    if(repeatChipsEl){
      repeatChipsEl.addEventListener('click', handleRepeatChipClick);
    }
    renderRepeatSummary();
  }

  function resolveWeekdayId(value){
    if(value === null || value === undefined) return null;
    if(typeof value === 'number' && value >= 0 && value <= 6){
      return WEEKDAY_INFO[value] ? WEEKDAY_INFO[value].id : null;
    }
    const str = String(value).trim().toLowerCase();
    if(str === '') return null;
    if(WEEKDAY_ALIAS[str]) return WEEKDAY_ALIAS[str];
    if(/^[0-6]$/.test(str)){
      return WEEKDAY_INFO[Number(str)] ? WEEKDAY_INFO[Number(str)].id : null;
    }
    return null;
  }

  function timeStringToMinutes(value){
    if(value === null || value === undefined) return NaN;
    if(typeof value === 'number' && Number.isFinite(value)) return value;
    if(value instanceof Date){
      return (value.getHours() * 60) + value.getMinutes();
    }
    const str = String(value).trim();
    if(!str) return NaN;
    const match = str.match(/^\s*(\d{1,2})[:hH]?(\d{2})\s*$/);
    if(!match) return NaN;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if(!Number.isInteger(hours) || !Number.isInteger(minutes)) return NaN;
    if(hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
    return (hours * 60) + minutes;
  }

  function normalizeDateIso(value){
    if(!value && value !== 0) return null;
    if(value instanceof Date){
      return value.toISOString().slice(0, 10);
    }
    const str = String(value).trim();
    if(!str) return null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(str)){
      const [dia, mes, ano] = str.split('/');
      return `${ano}-${mes}-${dia}`;
    }
    const parsed = new Date(str);
    if(Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }

  function formatDateIso(date){
    if(!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const ano = String(date.getFullYear());
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function formatIsoToBr(iso){
    if(typeof iso !== 'string' || iso.length < 10) return iso || '';
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match) return iso;
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function splitIntervalByDay(startDate, endDate){
    const segments = [];
    if(!(startDate instanceof Date) || !(endDate instanceof Date)) return segments;
    if(Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return segments;
    if(endDate.getTime() <= startDate.getTime()) return segments;
    let cursor = new Date(startDate.getTime());
    while(cursor.getTime() < endDate.getTime()){
      const dayIso = formatDateIso(cursor);
      const weekday = WEEKDAY_INFO[cursor.getDay()] ? WEEKDAY_INFO[cursor.getDay()].id : null;
      const startMinutes = (cursor.getHours() * 60) + cursor.getMinutes();
      const nextDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
      const segmentEnd = endDate.getTime() <= nextDay.getTime() ? new Date(endDate.getTime()) : nextDay;
      let endMinutes = (segmentEnd.getHours() * 60) + segmentEnd.getMinutes();
      if(segmentEnd.getHours() === 0 && segmentEnd.getMinutes() === 0){
        endMinutes = MINUTES_PER_DAY;
      }
      segments.push({
        isoDate: dayIso,
        weekday,
        startMinutes,
        endMinutes: Math.max(startMinutes, endMinutes)
      });
      if(segmentEnd.getTime() === endDate.getTime()) break;
      cursor = new Date(segmentEnd.getTime());
    }
    return segments;
  }

  function ensureAreaScheduleCache(){
    if(areaScheduleCache) return areaScheduleCache;
    const area = getSnapshotArea();
    const scheduleList = area && Array.isArray(area.disponibilidades) ? area.disponibilidades : (Array.isArray(area.schedule) ? area.schedule : []);
    const map = {};
    let hasAny = false;
    scheduleList.forEach(entry => {
      if(!entry) return;
      const dayId = resolveWeekdayId(entry.day ?? entry.day_id ?? entry.weekday ?? entry.weekday_index ?? entry.dia ?? entry.dia_semana ?? entry.index);
      if(!dayId) return;
      const slotsSource = Array.isArray(entry.intervals)
        ? entry.intervals
        : (Array.isArray(entry.slots) ? entry.slots : (Array.isArray(entry.horarios) ? entry.horarios : []));
      const normalized = [];
      slotsSource.forEach(slot => {
        if(slot == null) return;
        let start = null;
        let end = null;
        if(typeof slot === 'string'){
          const parts = slot.split(/\s*(?:-|→|a|até|\/|to)\s*/i);
          if(parts.length === 2){
            start = timeStringToMinutes(parts[0]);
            end = timeStringToMinutes(parts[1]);
          }
        } else if(typeof slot === 'object'){
          start = timeStringToMinutes(slot.start ?? slot.inicio ?? slot.from ?? slot.de ?? slot.hora_inicio ?? slot.horaInicio);
          end = timeStringToMinutes(slot.end ?? slot.fim ?? slot.to ?? slot.ate ?? slot.hora_fim ?? slot.horaFim ?? slot.termino);
        }
        if(Number.isFinite(start) && Number.isFinite(end) && end > start){
          normalized.push({ start, end });
        }
      });
      if(!normalized.length) return;
      normalized.sort((a, b) => a.start - b.start);
      map[dayId] = normalized;
      hasAny = true;
    });
    areaScheduleCache = { map, hasAny };
    return areaScheduleCache;
  }

  function ensureAreaRestrictionCache(){
    if(areaRestrictionCache) return areaRestrictionCache;
    const area = getSnapshotArea();
    const restrictionList = area && Array.isArray(area.restricoes) ? area.restricoes : [];
    const map = {};
    restrictionList.forEach(entry => {
      if(!entry) return;
      const iso = normalizeDateIso(entry.date ?? entry.data ?? entry.dia ?? entry.day);
      const start = timeStringToMinutes(entry.start ?? entry.inicio ?? entry.from ?? entry.de ?? entry.hora_inicio ?? entry.horaInicio);
      const end = timeStringToMinutes(entry.end ?? entry.fim ?? entry.to ?? entry.ate ?? entry.hora_fim ?? entry.horaFim ?? entry.termino);
      if(!iso || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      if(!map[iso]) map[iso] = [];
      map[iso].push({ start, end, observacao: entry.observacao || entry.obs || entry.motivo || '' });
    });
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => a.start - b.start);
    });
    areaRestrictionCache = map;
    return areaRestrictionCache;
  }

  // Garante que cada segmento diário do período respeite a disponibilidade configurada e não colida com restrições.
  function validateReservaAgainstArea(startDateTime, endDateTime){
    const schedule = ensureAreaScheduleCache();
    const restrictions = ensureAreaRestrictionCache();
    const segments = splitIntervalByDay(startDateTime, endDateTime);
    if(!segments.length){
      return { ok: false, message: 'Período inválido para replicação.' };
    }
    for(const segment of segments){
      if(schedule.hasAny){
        const intervals = segment.weekday ? (schedule.map[segment.weekday] || []) : [];
        if(!intervals.length){
          return {
            ok: false,
            message: `A área não possui disponibilidade cadastrada em ${formatIsoToBr(segment.isoDate)}.`
          };
        }
        const fits = intervals.some(interval => segment.startMinutes >= interval.start && segment.endMinutes <= interval.end);
        if(!fits){
          return {
            ok: false,
            message: `O horário informado em ${formatIsoToBr(segment.isoDate)} não está dentro da disponibilidade da área.`
          };
        }
      }
      const dayRestrictions = restrictions[segment.isoDate];
      if(dayRestrictions && dayRestrictions.length){
        const conflict = dayRestrictions.some(interval => segment.startMinutes < interval.end && segment.endMinutes > interval.start);
        if(conflict){
          return {
            ok: false,
            message: `Já existe uma restrição cadastrada para ${formatIsoToBr(segment.isoDate)} neste horário.`
          };
        }
      }
    }
    return { ok: true };
  }

  function hasReservaWithStart(iso, skipId){
    if(!iso) return false;
    return reservas.some(item => {
      if(skipId && String(item.id) === String(skipId)) return false;
      if(!item || !item.inicioISO) return false;
      return String(item.inicioISO) === String(iso);
    });
  }

  function getReservaStartTime(reserva){
    if(!reserva) return 0;
    if(reserva.inicioISO){
      const parsed = Date.parse(reserva.inicioISO);
      if(Number.isFinite(parsed)) return parsed;
    }
    const data = parseDateBr(reserva.dataInicial);
    const dateTime = combineDateTime(data, reserva.horaInicial);
    if(dateTime) return dateTime.getTime();
    return 0;
  }

  function sortReservasByInicio(){
    reservas.sort((a, b) => getReservaStartTime(a) - getReservaStartTime(b));
  }

  // Gera a lista de períodos clonados a partir das datas extras informadas pelo usuário.
  function buildRepeatReservations(repeatValue, startDateTime, endDateTime, rawInputs, skipId){
    const output = [];
    const summary = { ok: true, items: output, skipped: [] };
    if(repeatValue === null || repeatValue === undefined) return summary;

    let tokens = [];
    if(repeatValue instanceof Set){
      tokens = Array.from(repeatValue);
    } else if(Array.isArray(repeatValue)){
      tokens = repeatValue.slice();
    } else if(typeof repeatValue === 'string'){
      tokens = repeatValue
        .split(/[;,\n\s]+/)
        .map(part => part.trim())
        .filter(part => part.length > 0);
    } else {
      tokens = [String(repeatValue)].filter(Boolean);
    }

    if(!tokens.length) return summary;

    const seen = new Set();
    const durationMs = endDateTime.getTime() - startDateTime.getTime();
    if(durationMs <= 0){
      return { ok: false, message: 'O horário final deve ser posterior ao inicial para repetir o período.' };
    }

    const baseIso = formatDateIso(startDateTime);

    for(const tokenRaw of tokens){
      const token = String(tokenRaw).trim();
      if(!token) continue;

      let parsedDate = null;
      let normalizedToken = null;

      if(/^\d{4}-\d{2}-\d{2}$/.test(token)){
        normalizedToken = token;
        parsedDate = fromIsoDate(token);
      }

      if(!parsedDate && /^\d{2}\/\d{2}\/\d{4}$/.test(token)){
        parsedDate = parseDateBr(token);
        if(parsedDate) normalizedToken = formatDateIso(parsedDate);
      }

      if(!parsedDate){
        const fallback = new Date(token);
        if(!Number.isNaN(fallback.getTime())){
          parsedDate = fallback;
          normalizedToken = formatDateIso(fallback);
        }
      }

      if(!parsedDate || !normalizedToken){
        return { ok: false, message: `Data inválida para repetição: ${token}. Use datas no formato DD/MM/AAAA.` };
      }

      if(normalizedToken === baseIso) continue;
      if(seen.has(normalizedToken)) continue;
      seen.add(normalizedToken);

      const repeatStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), startDateTime.getHours(), startDateTime.getMinutes(), 0, 0);
      const repeatEnd = new Date(repeatStart.getTime() + durationMs);
      const validation = validateReservaAgainstArea(repeatStart, repeatEnd);
      if(!validation.ok){
        return { ok: false, message: `Não foi possível repetir para ${formatDateBr(repeatStart)}: ${validation.message}` };
      }

      const inicioISO = repeatStart.toISOString();
      if(hasReservaWithStart(inicioISO, skipId)){
        summary.skipped.push(formatDateBr(repeatStart));
        continue;
      }

      output.push({
        id: generateReservaId(),
        dataInicial: formatDateBr(repeatStart),
        horaInicial: rawInputs.horaInicial,
        dataFinal: formatDateBr(repeatEnd),
        horaFinal: rawInputs.horaFinal,
        inicioISO,
        fimISO: repeatEnd.toISOString()
      });
    }

    if(!output.length && summary.skipped.length){
      return {
        ok: false,
        message: `Todas as datas informadas já possuíam períodos cadastrados: ${summary.skipped.join(', ')}.`
      };
    }

    return summary;
  }

  function currentTabIndex(){
    if(!totalTabs) return 0;
    const idx = tabTriggers.findIndex(btn => btn.classList.contains('active'));
    return idx >= 0 ? idx : 0;
  }

  function showTab(index){
    if(!totalTabs) return;
    if(index < 0 || index >= totalTabs) return;
    const trigger = tabTriggers[index];
    if(!trigger) return;
    if(window.bootstrap && window.bootstrap.Tab){
      const tab = window.bootstrap.Tab.getOrCreateInstance(trigger);
      if(tab && typeof tab.show === 'function') tab.show();
      else trigger.click();
    } else {
      trigger.click();
    }
  }

  function updateStepperControls(){
    if(!prevBtn || !nextBtn || !totalTabs) return;
    const idx = currentTabIndex();
    prevBtn.disabled = idx <= 0;
    if(idx >= totalTabs - 1){
      nextBtn.textContent = 'Salvar';
      nextBtn.dataset.mode = 'save';
    } else {
      nextBtn.textContent = 'Próximo';
      nextBtn.dataset.mode = 'next';
    }
  }

  function bindStepper(){
    if(stepperBound || !totalTabs) return;
    stepperBound = true;
    tabTriggers.forEach(trigger => {
      trigger.addEventListener('shown.bs.tab', updateStepperControls);
    });
    if(prevBtn){
      prevBtn.addEventListener('click', () => {
        const idx = currentTabIndex();
        if(idx > 0){
          showTab(idx - 1);
        }
      });
    }
    if(nextBtn){
      nextBtn.addEventListener('click', () => {
        const idx = currentTabIndex();
        if(idx >= totalTabs - 1){
          confirm();
        } else {
          showTab(idx + 1);
        }
      });
    }
  }

  function resetState(){
    clearReservaForm();
    reservas = [];
    reservaPage = 0;
    reservaEditId = null;
    snapshot = null;
    resolveFn = null;
    rejectFn = null;
    unidadeFinanceiroDefaults = null;
    resetAreaCaches();
    renderReservas();
    updateResumoArea(null);
    resetCessionarioState({});
    resetPrepostoState({});
    resetMateriaisState({ area: [] });
    renderMateriais();
    resetTaxasState();
    resetForoState();
  }

  function open(payload){
    snapshot = payload && typeof payload === 'object' ? payload : {};
    unidadeFinanceiroDefaults = null;
    resetAreaCaches();
    bindStepper();
    bindReservaActions();
    reservas = Array.isArray(snapshot.reservas)
      ? snapshot.reservas.map(normalizeReservaItem)
      : [];
    if(snapshot && Number.isFinite(snapshot.reservaPageSize)){
      /* legacy compatibility: ignore custom sizes */
    }
    reservaPage = 0;
    renderReservas();
    resetReservaScroll();
    clearReservaForm();
    updateResumoArea(snapshot.area || snapshot);
    bindCessionarioActions();
    bindPrepostoActions();
    bindMateriaisActions();
    bindTaxaActions();
    bindForoActions();
    const areaData = snapshot.area || snapshot;
    const unidadeSources = [
      areaData,
      snapshot,
      snapshot && snapshot.areaInfo,
      snapshot && snapshot.areaDados,
      snapshot && snapshot.areaDetalhes,
      snapshot && snapshot.area_detail,
      snapshot && snapshot.dadosArea,
      snapshot && snapshot.areaData
    ].filter(source => source && typeof source === 'object');

    let unidadeId = '';
    let unidadeLabel = '';
    let unidadeEndereco = '';

    unidadeSources.forEach(source => {
      if(!unidadeId){
        const candidateId = resolveUnidadeId(source);
        if(candidateId) unidadeId = candidateId;
      }
      if(!unidadeLabel){
        const labelCandidate = resolveUnidade(source);
        if(labelCandidate) unidadeLabel = sanitizeText(labelCandidate);
      }
      if(!unidadeEndereco){
        const enderecoCandidate = resolveUnidadeEndereco(source);
        if(enderecoCandidate) unidadeEndereco = enderecoCandidate;
      }
    });

    const fallbackCollections = [];
    if(Array.isArray(snapshot.prepostos)) fallbackCollections.push(snapshot.prepostos);
    if(Array.isArray(snapshot.cessionarios)) fallbackCollections.push(snapshot.cessionarios);

    fallbackCollections.forEach(collection => {
      collection.forEach(entry => {
        if(!entry || typeof entry !== 'object') return;
        if(!unidadeId){
          const candidateId = entry.unidade_id || entry.unidadeId || (entry.unidade && (entry.unidade._id || entry.unidade.id));
          if(candidateId) unidadeId = sanitizeText(candidateId);
        }
        if(!unidadeLabel){
          const candidateLabel = entry.unidade_label || entry.unidadeLabel || (entry.unidade && (entry.unidade.nome || entry.unidade.label));
          if(candidateLabel) unidadeLabel = sanitizeText(candidateLabel);
        }
        if(!unidadeEndereco && entry.unidade){
          const enderecoCandidate = resolveUnidadeEndereco(entry.unidade);
          if(enderecoCandidate) unidadeEndereco = enderecoCandidate;
        }
      });
    });

    if(!unidadeId && snapshot && typeof snapshot.unidade_id !== 'undefined'){
      unidadeId = sanitizeText(snapshot.unidade_id);
    }
    if(!unidadeId && snapshot && typeof snapshot.unidadeId !== 'undefined'){
      unidadeId = sanitizeText(snapshot.unidadeId);
    }
    if(!unidadeLabel && snapshot && typeof snapshot.unidade_label !== 'undefined'){
      unidadeLabel = sanitizeText(snapshot.unidade_label);
    }
    if(!unidadeLabel && snapshot && typeof snapshot.unidadeLabel !== 'undefined'){
      unidadeLabel = sanitizeText(snapshot.unidadeLabel);
    }
    if(!unidadeEndereco && snapshot && snapshot.unidade){
      const enderecoCandidate = resolveUnidadeEndereco(snapshot.unidade);
      if(enderecoCandidate) unidadeEndereco = enderecoCandidate;
      if(!unidadeId){
        const candidateId = resolveUnidadeId(snapshot.unidade);
        if(candidateId) unidadeId = candidateId;
      }
      if(!unidadeLabel){
        const labelCandidate = resolveUnidade(snapshot.unidade);
        if(labelCandidate) unidadeLabel = sanitizeText(labelCandidate);
      }
    }

    const financeSources = [];
    unidadeSources.forEach(source => { if(source) financeSources.push(source); });
    fallbackCollections.forEach(collection => {
      collection.forEach(entry => { if(entry) financeSources.push(entry); });
    });
    if(areaData) financeSources.push(areaData);
    if(snapshot) financeSources.push(snapshot);
    if(snapshot && snapshot.unidade) financeSources.push(snapshot.unidade);
    unidadeFinanceiroDefaults = resolveUnidadeFinanceiroDefaults(financeSources);

    resetCessionarioState({ unidadeId, unidadeLabel, unidadeEndereco });
    resetPrepostoState({ unidadeId, unidadeLabel, unidadeEndereco });
    const materiaisArea = resolveAreaMateriais(areaData);
    const materiaisDisponiveisSeed = snapshot.materiaisDisponiveis || snapshot.materiais_disponiveis || snapshot.disponiveis || [];
    const materiaisExtraidosSeed = snapshot.materiaisExtraidos || snapshot.materiais_extraidos || snapshot.extraidos || [];
    const materiaisCessaoSeed = Array.isArray(snapshot.materiais) ? snapshot.materiais : [];
    resetMateriaisState({
      area: materiaisArea,
      disponiveis: materiaisDisponiveisSeed,
      extraidos: materiaisExtraidosSeed,
      cessao: materiaisCessaoSeed
    });
    renderMateriais();
    hydrateTaxasFromSnapshot();
    hydrateForosFromSnapshot();
    ensureCessionarioLookups();
    ensurePrepostoLookups();
    hydrateCessionariosFromSnapshot();
    hydratePrepostosFromSnapshot();
    if(unidadeId){
      loadHabitacoesForUnidade(unidadeId).catch(err => {
        console.warn('[ceder-uso] não foi possível carregar habitações da unidade', err);
      });
      loadColaboradoresForUnidade(unidadeId).catch(err => {
        console.warn('[ceder-uso] não foi possível carregar colaboradores da unidade', err);
      });
    } else {
      populateHabitacaoSelect('');
      updateMoradorOptionsForHabitacao('');
      populateColaboradorSelect('');
    }
    if(totalTabs){
      showTab(0);
      setTimeout(updateStepperControls, 0);
    }
    show();
    return new Promise((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
  }

  function close(){
    hide();
    resetState();
  }

  function confirm(){
    snapshot = snapshot || {};
    snapshot.reservas = reservas.map(item => ({ ...item }));
    snapshot.cessionarios = cessionarios.map(item => cloneShallow(item) || { ...item });
    snapshot.prepostos = prepostos.map(item => cloneShallow(item) || { ...item });
    const materiaisParaCessao = materiaisState.cessao.length ? materiaisState.cessao : materiaisState.disponiveis;
    snapshot.materiais = serializeMaterialList(materiaisParaCessao);
    snapshot.materiais_disponiveis = serializeMaterialList(materiaisState.disponiveis);
    snapshot.materiaisDisponiveis = snapshot.materiais_disponiveis;
    snapshot.materiais_extraidos = serializeMaterialList(materiaisState.extraidos);
    snapshot.materiaisExtraidos = snapshot.materiais_extraidos;
    snapshot.disponiveis = snapshot.materiais_disponiveis;
    snapshot.extraidos = snapshot.materiais_extraidos;
    const taxasPayload = serializeTaxaList(taxas);
    snapshot.taxas_custos = taxasPayload;
    snapshot.taxasCustos = snapshot.taxas_custos;
    snapshot.taxas = snapshot.taxas_custos;
    const forosPayload = serializeForoList(foros);
    snapshot.foros = forosPayload;
    snapshot.foros_cadastrados = snapshot.foros;
    if(typeof resolveFn === 'function'){
      resolveFn({ saved: true, payload: snapshot });
    }
    close();
  }

  function cancel(){
    if(typeof rejectFn === 'function'){
      rejectFn(new Error('Modal cancelado'));
    }
    close();
  }

  modalEl.addEventListener('hidden.bs.modal', resetState);

  modalEl.querySelectorAll('[data-action="dismiss"]').forEach(btn => {
    btn.addEventListener('click', cancel);
  });

  function sanitizeText(value){
    if(value === null || value === undefined) return '';
    const text = String(value).trim();
    if(!text) return '';
    const lowered = text.toLowerCase();
    if(lowered === 'undefined' || lowered === 'null' || lowered === 'nan') return '';
    return text;
  }

  function toBoolean(value){
    if(typeof value === 'boolean') return value;
    if(typeof value === 'number') return value !== 0;
    if(typeof value === 'string'){
      const normalized = value.trim().toLowerCase();
      if(!normalized) return false;
      return ['1', 'true', 'sim', 'yes', 'y', 'habilitado'].includes(normalized);
    }
    return false;
  }

  function removeDiacritics(value){
    if(typeof value !== 'string') return value;
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function stripCodigoIbgeEndereco(value){
    const text = sanitizeText(value);
    if(!text) return '';
    const normalized = removeDiacritics(text).toLowerCase();
    const marker = 'codigo ibge';
    const index = normalized.indexOf(marker);
    if(index === -1) return text;
    const trimmed = text.slice(0, index).replace(/[\s–—,:;-]+$/g, '').trim();
    return trimmed.replace(/\s{2,}/g, ' ');
  }

  function sanitizeLabelValue(value){
    const text = sanitizeText(value);
    if(!text) return '';
    const normalized = text.replace(/\s{2,}/g, ' ').trim();
    const prefixRegex = /^(bloco|andar|tipo(?: de habita[cç][aã]o)?|n[ºo]|n[uú]mero|numero|identificacao|identificação)(\s*[:=\-–—]+\s*|\s+)/i;
    const match = normalized.match(prefixRegex);
    if(!match) return normalized;
    const label = match[1];
    const separator = match[2] || '';
    const candidateRaw = normalized.slice(match[0].length).trim();
    const hasSeparator = /[:=\-–—]/.test(separator);
    const duplicateWord = candidateRaw && candidateRaw.toLowerCase().startsWith(label.toLowerCase());
    if(candidateRaw && (hasSeparator || duplicateWord)){
      return candidateRaw.replace(/^[\s\-–—,]+/, '').replace(/\s{2,}/g, ' ').trim();
    }
    return normalized;
  }

  function normalizeSexoValue(value){
    const text = sanitizeText(value).toLowerCase();
    if(!text) return '';
    if(text === 'm' || text.startsWith('masc')) return 'M';
    if(text === 'f' || text.startsWith('fem')) return 'F';
    if(text.startsWith('out')) return 'O';
    if(text.startsWith('n')) return 'N';
    return '';
  }

  function resolveSexoLabel(value, fallback){
    const normalized = String(value || '').toUpperCase();
    if(!normalized) return '';
    const provided = sanitizeText(fallback);
    if(provided) return provided;
    switch(normalized){
      case 'M': return 'Masculino';
      case 'F': return 'Feminino';
      case 'O': return 'Outro';
      case 'N': return 'Não informado';
      default: return '';
    }
  }

  const MORADOR_SEXO_VALUE_PATHS = [
    'sexo',
    'Sexo',
    'genero',
    'Genero',
    'genero_codigo',
    'generoCodigo',
    'sexo_codigo',
    'sexoCodigo',
    'sexo_value',
    'sexoValue',
    'sexo_tipo',
    'sexoTipo',
    'tipo_sexo',
    'tipoSexo',
    'sexo_mf',
    'sexoMF',
    'sexo_sigla',
    'sexoSigla',
    ['dados', 'sexo'],
    ['dados', 'Sexo'],
    ['dados', 'genero'],
    ['dados', 'Genero'],
    ['dados', 'sexo_codigo'],
    ['dados', 'genero_codigo'],
    ['dados', 'sexoSigla'],
    ['pessoa', 'sexo'],
    ['pessoa', 'genero'],
    ['pessoa', 'sexo_codigo'],
    ['pessoa', 'genero_codigo'],
    ['pessoa', 'sexoSigla']
  ];

  const MORADOR_SEXO_LABEL_PATHS = [
    'sexo_label',
    'sexoLabel',
    'genero_label',
    'generoLabel',
    'descricao_sexo',
    'descricaoSexo',
    'sexo_descricao',
    'sexoDescricao',
    'descricao_genero',
    'descricaoGenero',
    'genero_descricao',
    'generoDescricao',
    ['dados', 'sexo_label'],
    ['dados', 'sexoLabel'],
    ['dados', 'genero_label'],
    ['dados', 'generoLabel'],
    ['dados', 'descricao_sexo'],
    ['dados', 'descricaoSexo'],
    ['pessoa', 'sexo_label'],
    ['pessoa', 'sexoLabel'],
    ['pessoa', 'genero_label'],
    ['pessoa', 'generoLabel']
  ];

  function resolveMoradorSexoInfo(morador){
    if(!morador || typeof morador !== 'object') return { value: '', label: '' };
    const valueCandidate = resolveFromCandidates(morador, MORADOR_SEXO_VALUE_PATHS);
    let valueString = '';
    let valueDerivedLabel = '';
    if(valueCandidate && typeof valueCandidate === 'object'){
      valueString = sanitizeText(valueCandidate.codigo || valueCandidate.value || valueCandidate.sigla || valueCandidate.id || valueCandidate.chave || '');
      valueDerivedLabel = sanitizeText(valueCandidate.descricao || valueCandidate.label || valueCandidate.nome || valueCandidate.text || '');
    } else {
      valueString = sanitizeText(valueCandidate);
    }
    const labelCandidate = resolveFromCandidates(morador, MORADOR_SEXO_LABEL_PATHS);
    const labelString = labelCandidate && typeof labelCandidate === 'object'
      ? sanitizeText(labelCandidate.descricao || labelCandidate.label || labelCandidate.nome || labelCandidate.text || '')
      : sanitizeText(labelCandidate);
    const normalizedValue = normalizeSexoValue(valueString) || normalizeSexoValue(labelString) || normalizeSexoValue(valueDerivedLabel) || '';
    const label = resolveSexoLabel(normalizedValue, labelString || valueDerivedLabel);
    return { value: normalizedValue, label };
  }

  function enrichMoradorSexo(morador){
    if(!morador || typeof morador !== 'object') return morador;
    const info = resolveMoradorSexoInfo(morador);
    if(!info.value && !info.label) return morador;
    const existingRawValue = sanitizeText(morador.sexo || morador.genero || '');
    const existingValue = normalizeSexoValue(existingRawValue) || '';
    const existingLabel = sanitizeText(morador.sexo_label || morador.genero_label || morador.descricao_sexo || morador.descricao_genero || '');
    let changed = false;
    const clone = { ...morador };
    if(info.value && info.value !== existingValue){
      clone.sexo = info.value;
      changed = true;
    } else if(info.value && existingRawValue.toUpperCase() !== info.value){
      clone.sexo = info.value;
      changed = true;
    }
    if(info.label && info.label !== existingLabel){
      clone.sexo_label = info.label;
      changed = true;
    }
    return changed ? clone : morador;
  }

  function resolveFromCandidates(source, candidates){
    if(!source || typeof source !== 'object') return '';
    for(const path of candidates){
      let value;
      if(Array.isArray(path)){
        value = path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
      } else {
        value = source[path];
      }
      if(value !== undefined && value !== null && value !== ''){
        return value;
      }
    }
    return '';
  }

  function resolveUnidade(area){
    return resolveFromCandidates(area, [
      '_unidadeLabel',
      'unidade_label',
      'unidade_nome',
      ['unidade', 'nome'],
      ['unidade', 'label'],
      ['condominio', 'nome'],
      ['condominio', 'label']
    ]);
  }

  function resolveAreaNome(area){
    return resolveFromCandidates(area, [
      'nome',
      'label',
      'descricao',
      'descricao_curta',
      'area_nome',
      'titulo'
    ]);
  }

  function resolveCapacidade(area){
    const value = resolveFromCandidates(area, [
      'capacidade',
      'capacidade_maxima',
      'capacidadeMaxima',
      'capacidade_total',
      'lotacao',
      'lotacao_maxima',
      'lotacaoMaxima',
      'capacidade_lotacao',
      'capacidadeEvento',
      'capacidade_evento'
    ]);
    if(value === null || value === undefined || value === '') return '';
    const asNumber = Number(value);
    if(Number.isFinite(asNumber)) return String(asNumber);
    return sanitizeText(value);
  }

  function resolveIdFromCandidates(source, candidates){
    if(!source || typeof source !== 'object') return '';
    for(const path of candidates){
      let value;
      if(Array.isArray(path)){
        value = path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
      } else {
        value = source[path];
      }
      if(value === null || value === undefined || value === '') continue;
      if(typeof value === 'object'){
        if(value._id !== undefined) return sanitizeText(value._id);
        if(value.id !== undefined) return sanitizeText(value.id);
        if(value.value !== undefined) return sanitizeText(value.value);
      } else {
        return sanitizeText(value);
      }
    }
    return '';
  }

  function resolveUnidadeId(area){
    return resolveIdFromCandidates(area, [
      'unidade_id',
      '_unidadeId',
      'unidadeId',
      ['unidade', '_id'],
      ['unidade', 'id'],
      ['unidade', 'unidade_id'],
      'condominio_id',
      'condominioId',
      ['condominio', '_id'],
      ['condominio', 'id'],
      ['condominio', 'unidade_id'],
      ['area', 'unidade_id'],
      ['area', 'unidade', '_id']
    ]);
  }

  function resolveUnidadeEndereco(area){
    if(!area || typeof area !== 'object') return '';
    const resolved = resolveFromCandidates(area, [
      ['unidade', 'endereco'],
      ['condominio', 'endereco'],
      'endereco'
    ]);
    if(!resolved) return '';
    if(typeof resolved === 'string') return stripCodigoIbgeEndereco(resolved);
    if(typeof resolved === 'object'){
      const nested = resolveFromCandidates(resolved, ['descricao', 'display', 'texto', 'endereco']);
      if(typeof nested === 'string' && nested) return stripCodigoIbgeEndereco(nested);
      const logradouro = sanitizeText(resolved.logradouro || resolved.rua || resolved.endereco || '');
      const numero = sanitizeText(resolved.numero || resolved.num || resolved.n || '');
      const bairro = sanitizeText(resolved.bairro || resolved.setor || '');
      const cidade = sanitizeText(resolved.cidade || resolved.municipio || '');
      const uf = sanitizeText(resolved.uf || resolved.estado || '');
      const cep = sanitizeText(resolved.cep || resolved.CEP || '');
      const partes = [];
      if(logradouro) partes.push(logradouro);
      if(numero) partes.push('nº ' + numero);
      if(bairro) partes.push(bairro);
      if(cidade && uf) partes.push(`${cidade} - ${uf}`);
      else if(cidade) partes.push(cidade);
      if(cep) partes.push('CEP ' + cep);
      return stripCodigoIbgeEndereco(partes.filter(Boolean).join(', '));
    }
    return '';
  }

  function resolveUnidadeFinanceiroSource(source){
    if(!source || typeof source !== 'object') return null;
    if(Array.isArray(source)) return null;
    if(source.unidade && typeof source.unidade === 'object') return source.unidade;
    if(source.condominio && typeof source.condominio === 'object') return source.condominio;
    if(source.unidade_snapshot && typeof source.unidade_snapshot === 'object') return source.unidade_snapshot;
    if(source.area && typeof source.area === 'object'){
      const nestedArea = resolveUnidadeFinanceiroSource(source.area);
      if(nestedArea) return nestedArea;
    }
    if(source.areaInfo && typeof source.areaInfo === 'object'){
      const nestedInfo = resolveUnidadeFinanceiroSource(source.areaInfo);
      if(nestedInfo) return nestedInfo;
    }
    if(source.areaDados && typeof source.areaDados === 'object'){
      const nestedDados = resolveUnidadeFinanceiroSource(source.areaDados);
      if(nestedDados) return nestedDados;
    }
    if(source.areaDetalhes && typeof source.areaDetalhes === 'object'){
      const nestedDetalhes = resolveUnidadeFinanceiroSource(source.areaDetalhes);
      if(nestedDetalhes) return nestedDetalhes;
    }
    if(source.area_detail && typeof source.area_detail === 'object'){
      const nestedDetail = resolveUnidadeFinanceiroSource(source.area_detail);
      if(nestedDetail) return nestedDetail;
    }
    if(source.dadosArea && typeof source.dadosArea === 'object'){
      const nestedDadosArea = resolveUnidadeFinanceiroSource(source.dadosArea);
      if(nestedDadosArea) return nestedDadosArea;
    }
    if(source.areaData && typeof source.areaData === 'object'){
      const nestedAreaData = resolveUnidadeFinanceiroSource(source.areaData);
      if(nestedAreaData) return nestedAreaData;
    }
    if(source._id || source.codigo || source.nome || source.banco || source.agencia || source.contaCorrente || source.pixChave){
      return source;
    }
    return null;
  }

  function resolveUnidadeFinanceiroDefaults(sources){
    if(Array.isArray(sources)){
      for(const source of sources){
        const resolved = resolveUnidadeFinanceiroDefaults(source);
        if(resolved) return resolved;
      }
      return null;
    }
    const unidade = resolveUnidadeFinanceiroSource(sources);
    if(!unidade) return null;
    const banco = sanitizeText(unidade.banco || unidade.banco_emissor || unidade.nome_banco || '');
    const carteira = sanitizeText(unidade.carteira || unidade.carteiraCodigo || unidade.carteira_codigo || unidade.convenio || unidade.agencia || '');
    const documento = sanitizeText(unidade.documento || unidade.nosso_numero || unidade.nossoNumero || unidade.contaCorrente || unidade.conta_corrente || '');
    const instrucao = sanitizeText(unidade.instrucao_boleto || unidade.boleto_instrucao || unidade.instrucao || '');
    let multaPercentual = parsePercentValue(unidade.multa_boleto ?? unidade.multaPercentual ?? unidade.multa_percentual ?? null);
    if(!Number.isFinite(multaPercentual)) multaPercentual = null;
    let jurosPercentual = parsePercentValue(unidade.juros_boleto ?? unidade.jurosPercentual ?? unidade.juros_percentual ?? null);
    if(!Number.isFinite(jurosPercentual)) jurosPercentual = null;
    const enviarEmail = toBoolean(unidade.boleto_email ?? unidade.enviarBoletoEmail ?? false);
    const enviarWhatsapp = toBoolean(unidade.boleto_whatsapp ?? unidade.enviarBoletoWhatsapp ?? false);
    if(!banco && !carteira && !documento && !instrucao && multaPercentual === null && jurosPercentual === null && !enviarEmail && !enviarWhatsapp){
      return null;
    }
    return {
      banco,
      carteira,
      documento,
      instrucao,
      multaPercentual,
      jurosPercentual,
      enviarEmail,
      enviarWhatsapp
    };
  }

  function resolveAreaMateriais(area){
    if(!area || typeof area !== 'object') return [];
    const candidates = [
      area.materiais,
      area.materiaisDisponiveis,
      area.materiais_disponiveis,
      area.materiais_vinculados,
      area.materiaisVinculados,
      area.materiais_area,
      area.materiaisArea,
      area.lista_materiais,
      area.listaMateriais,
      area.dados && area.dados.materiais,
      area.area && area.area.materiais
    ];
    for(const candidate of candidates){
      if(Array.isArray(candidate) && candidate.length) return candidate;
    }
    return Array.isArray(area.materiais) ? area.materiais : [];
  }

  function formatCpf(value){
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if(digits.length <= 3) return digits;
    if(digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if(digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  function formatTelefone(value){
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    const len = digits.length;
    if(len === 0) return '';
    if(len < 3) return `(${digits}`;
    const ddd = digits.slice(0, 2);
    const local = digits.slice(2);
    if(local.length === 0) return `(${ddd}`;
    if(local.length <= 5) return `(${ddd}) ${local}`;
    if(local.length <= 8) return `(${ddd}) ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
    return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5, 9)}`;
  }

  function applyTelefoneMask(input){
    if(!input) return { digits: '', formatted: '' };
    const digits = String(input.value || '').replace(/\D/g, '').slice(0, 11);
    const formatted = formatTelefone(digits);
    input.value = formatted;
    if(input.dataset) input.dataset.digits = digits;
    return { digits, formatted };
  }

  function setTelefoneFieldValue(input, rawValue, options){
    if(!input) return { digits: '', formatted: '' };
    const skipIfEmpty = !!(options && options.skipIfEmpty);
    const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 11);
    if(!digits && skipIfEmpty) return { digits: '', formatted: '' };
    const formatted = formatTelefone(digits);
    input.value = formatted;
    if(input.dataset) input.dataset.digits = digits;
    return { digits, formatted };
  }

  function handleTelefoneInput(event){
    if(!event || !event.target) return;
    applyTelefoneMask(event.target);
  }

  function bindTelefoneMask(input){
    if(!input) return;
    input.addEventListener('input', handleTelefoneInput);
    input.addEventListener('blur', handleTelefoneInput);
    applyTelefoneMask(input);
  }

  function parseMoneyValue(value){
    if(value === null || value === undefined) return NaN;
    if(typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const str = String(value).trim();
    if(!str) return NaN;
    const normalized = str
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9+\-.]/g, '');
    if(!normalized) return NaN;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function formatCurrencyBr(value){
    if(typeof value !== 'number' || Number.isNaN(value)) return '';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  function parsePercentValue(value){
    if(value === null || value === undefined) return NaN;
    if(typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const str = String(value).trim();
    if(!str) return NaN;
    const normalized = str
      .replace(/\s+/g, '')
      .replace(',', '.')
      .replace(/[^0-9+\-.]/g, '');
    if(!normalized) return NaN;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function formatPercentBr(value){
    if(typeof value !== 'number' || Number.isNaN(value)) return '';
    return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
  }

  function cloneShallow(value){
    if(value === null || value === undefined) return null;
    try{ return JSON.parse(JSON.stringify(value)); }
    catch(_err){
      try{ return { ...value }; }
      catch(_inner){ return null; }
    }
  }

  function resolveMaterialQuantidade(source){
    if(!source || typeof source !== 'object') return 1;
    const campos = [
      source.quantidade,
      source.qtd,
      source.qde,
      source.quantidade_total,
      source.quantidadeTotal,
      source.total
    ];
    for(const campo of campos){
      const numero = Number(campo);
      if(Number.isFinite(numero) && numero > 0) return numero;
    }
    return 1;
  }

  function resolveMaterialNome(source){
    if(!source || typeof source !== 'object') return 'Material';
    const campos = [
      source.nome,
      source.descricao,
      source.titulo,
      source.label,
      source.material,
      source.item,
      source.tipo
    ];
    for(const campo of campos){
      const texto = sanitizeText(campo);
      if(texto) return texto;
    }
    return 'Material';
  }

  function resolveMaterialDetalhe(source){
    if(!source || typeof source !== 'object') return '';
    const patrimonio = sanitizeText(
      source.patrimonio
      || source.codigo_patrimonio
      || source.codigoPatrimonio
      || source.codigo
      || source.identificador
      || source.serie
      || source.num_serie
      || source.numero_serie
    );
    const marca = sanitizeText(source.marca);
    const modelo = sanitizeText(source.modelo);
    const observacao = sanitizeText(source.observacao || source.obs || '');
    const partes = [];
    if(patrimonio) partes.push('#' + patrimonio);
    if(marca || modelo) partes.push([marca, modelo].filter(Boolean).join(' / '));
    if(observacao) partes.push(observacao);
    return partes.filter(Boolean).join(' · ');
  }

  function computeMaterialSignature(source){
    if(!source) return '';
    const base = source.raw && typeof source.raw === 'object' ? source.raw : source;
    if(!base || typeof base !== 'object') return '';
    const campos = [
      base._id,
      base.id,
      base.uid,
      base.uuid,
      base.codigo,
      base.codigo_patrimonio,
      base.codigoPatrimonio,
      base.patrimonio,
      base.num_serie,
      base.numero_serie,
      base.numSerie,
      base.serie,
      base.nome,
      base.descricao,
      base.titulo,
      base.label,
      base.material,
      base.item,
      base.marca,
      base.modelo
    ];
    const quantidade = resolveMaterialQuantidade(base);
    const normalized = campos
      .map(valor => sanitizeText(valor).toLowerCase())
      .filter(Boolean);
    normalized.push(`qtd:${quantidade}`);
    if(!normalized.length){
      try {
        return JSON.stringify(base);
      } catch(_err){
        return `material-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
    }
    return normalized.join('|');
  }

  function nextMaterialUid(){
    materialUidCounter += 1;
    return `material-${materialUidCounter}`;
  }

  function createNormalizedMaterial(raw){
    const clone = cloneShallow(raw) || {};
    const nome = resolveMaterialNome(clone);
    const quantidade = resolveMaterialQuantidade(clone);
    const detalhe = resolveMaterialDetalhe(clone);
    clone.nome = nome;
    if(!clone.quantidade) clone.quantidade = quantidade;
    const signature = computeMaterialSignature(clone);
    return {
      uid: nextMaterialUid(),
      signature,
      nome,
      quantidade,
      detalhe,
      raw: clone
    };
  }

  function normalizeMaterialCollection(rawList){
    if(!Array.isArray(rawList)) return [];
    return rawList.map(createNormalizedMaterial);
  }

  function findAndDetachMaterialBySignature(list, source){
    if(!Array.isArray(list) || !list.length) return null;
    const signature = computeMaterialSignature(source);
    if(!signature) return null;
    const idx = list.findIndex(item => item.signature === signature);
    if(idx === -1) return null;
    return list.splice(idx, 1)[0];
  }

  function findMaterialBySignature(list, source){
    if(!Array.isArray(list) || !list.length) return null;
    const signature = computeMaterialSignature(source);
    if(!signature) return null;
    return list.find(item => item.signature === signature) || null;
  }

  function sortMaterialList(list){
    if(!Array.isArray(list)) return;
    list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'accent' }));
  }

  function pruneMateriaisSelection(){
    const validIds = new Set(materiaisState.disponiveis.map(item => item.uid));
    Array.from(materiaisState.selecionados).forEach(id => {
      if(!validIds.has(id)) materiaisState.selecionados.delete(id);
    });
  }

  function materialToPayload(material){
    if(!material) return null;
    const base = cloneShallow(material.raw || material) || {};
    if(!base.nome && material.nome) base.nome = material.nome;
    if(!base.quantidade && material.quantidade) base.quantidade = material.quantidade;
    if(!base.detalhe && material.detalhe) base.detalhe = material.detalhe;
    return base;
  }

  function serializeMaterialList(list){
    if(!Array.isArray(list) || !list.length) return [];
    return list.map(materialToPayload).filter(Boolean);
  }

  function resetMateriaisState(seed){
    materialUidCounter = 0;
    materiaisState.selecionados = new Set();
    const seedData = seed || {};
    const areaRaw = Array.isArray(seedData.area) ? seedData.area : [];
    let baseMateriais = normalizeMaterialCollection(areaRaw);
    const seedDisponiveisRaw = Array.isArray(seedData.disponiveis) ? seedData.disponiveis : [];
    seedDisponiveisRaw.forEach(raw => {
      const signature = computeMaterialSignature(raw);
      if(!baseMateriais.some(item => item.signature === signature)){
        baseMateriais.push(createNormalizedMaterial(raw));
      }
    });
    if(!baseMateriais.length && seedDisponiveisRaw.length){
      baseMateriais = normalizeMaterialCollection(seedDisponiveisRaw);
    }
    const extraidosRaw = Array.isArray(seedData.extraidos) ? seedData.extraidos : [];
    const extraidos = [];
    const disponiveis = baseMateriais.slice();
    extraidosRaw.forEach(raw => {
      const matched = findAndDetachMaterialBySignature(disponiveis, raw);
      if(matched) extraidos.push(matched);
      else extraidos.push(createNormalizedMaterial(raw));
    });
    sortMaterialList(disponiveis);
    sortMaterialList(extraidos);
    const cessaoRaw = Array.isArray(seedData.cessao) ? seedData.cessao : [];
    let cessao;
    if(cessaoRaw.length){
      const pool = disponiveis.concat(extraidos);
      cessao = cessaoRaw.map(raw => findMaterialBySignature(pool, raw) || createNormalizedMaterial(raw));
    } else {
      cessao = [];
    }
    sortMaterialList(cessao);
    materiaisState.disponiveis = disponiveis;
    materiaisState.extraidos = extraidos;
    materiaisState.cessao = cessao;
    resetMateriaisPagination();
  }

  function renderMateriais(){
    renderMateriaisDisponiveis();
    renderMateriaisExtraidos();
    renderMateriaisCessao();
    updateMateriaisControls();
  }

  function renderMateriaisDisponiveis(){
    if(!materiaisDisponiveisListEl) return;
    materiaisDisponiveisListEl.innerHTML = '';
    pruneMateriaisSelection();
    const { list, total, currentPage } = resolveMateriaisTotals('disponiveis');
    if(total === 0){
      const empty = document.createElement('div');
      empty.className = 'wdg-placeholder-box';
      empty.textContent = 'Nenhum material disponível.';
      materiaisDisponiveisListEl.appendChild(empty);
      return;
    }
    const pageSize = MATERIALS_PAGE_SIZE;
    const start = currentPage * pageSize;
    const visibleItems = list.slice(start, start + pageSize);
    const fragment = document.createDocumentFragment();
    visibleItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'wdg-material-row';

      const checkWrap = document.createElement('div');
      checkWrap.className = 'form-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'form-check-input';
      checkbox.dataset.materialId = item.uid;
      checkbox.checked = materiaisState.selecionados.has(item.uid);
      checkWrap.appendChild(checkbox);
      row.appendChild(checkWrap);

      const content = document.createElement('div');
      content.className = 'flex-grow-1';
      const title = document.createElement('div');
      title.className = 'wdg-material-name';
      title.textContent = item.nome || 'Material';
      if(item.quantidade > 1){
        const qty = document.createElement('span');
        qty.className = 'wdg-material-qty';
        qty.textContent = `${item.quantidade} un.`;
        title.appendChild(qty);
      }
      content.appendChild(title);
      if(item.detalhe){
        const detail = document.createElement('div');
        detail.className = 'wdg-material-detail';
        detail.textContent = item.detalhe;
        content.appendChild(detail);
      }
      row.appendChild(content);

      const actions = document.createElement('div');
      actions.className = 'wdg-material-actions';
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'wdg-icon-btn';
      actionBtn.dataset.materialAction = 'extract';
      actionBtn.dataset.id = item.uid;
      actionBtn.title = 'Extrair material';
      actionBtn.setAttribute('aria-label', 'Extrair material');
      const icon = document.createElement('img');
      icon.src = buildStaticAssetPath('images/extrair.png');
      icon.alt = 'Extrair';
      icon.width = 24;
      icon.height = 24;
      icon.loading = 'lazy';
      icon.decoding = 'async';
      attachIconFallback(icon, 'bi bi-box-arrow-up-right');
      actionBtn.appendChild(icon);
      actions.appendChild(actionBtn);
      row.appendChild(actions);

      fragment.appendChild(row);
    });
    materiaisDisponiveisListEl.appendChild(fragment);
    const footer = createMateriaisPagerFooter('disponiveis', total, currentPage);
    if(footer) materiaisDisponiveisListEl.appendChild(footer);
  }

  function renderMateriaisExtraidos(){
    if(!materiaisExtraidosListEl) return;
    materiaisExtraidosListEl.innerHTML = '';
    const { list, total, currentPage } = resolveMateriaisTotals('extraidos');
    if(total === 0){
      const empty = document.createElement('div');
      empty.className = 'wdg-placeholder-box';
      empty.textContent = 'Nenhum material retirado.';
      materiaisExtraidosListEl.appendChild(empty);
      return;
    }
    const pageSize = MATERIALS_PAGE_SIZE;
    const start = currentPage * pageSize;
    const visibleItems = list.slice(start, start + pageSize);
    const fragment = document.createDocumentFragment();
    visibleItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'wdg-material-row';

      const content = document.createElement('div');
      content.className = 'flex-grow-1';
      const title = document.createElement('div');
      title.className = 'wdg-material-name';
      title.textContent = item.nome || 'Material';
      if(item.quantidade > 1){
        const qty = document.createElement('span');
        qty.className = 'wdg-material-qty';
        qty.textContent = `${item.quantidade} un.`;
        title.appendChild(qty);
      }
      content.appendChild(title);
      if(item.detalhe){
        const detail = document.createElement('div');
        detail.className = 'wdg-material-detail';
        detail.textContent = item.detalhe;
        content.appendChild(detail);
      }
      row.appendChild(content);

      const actions = document.createElement('div');
      actions.className = 'wdg-material-actions';
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'wdg-icon-btn';
      actionBtn.dataset.materialAction = 'repor';
      actionBtn.dataset.id = item.uid;
      actionBtn.title = 'Repor material';
      actionBtn.setAttribute('aria-label', 'Repor material');
      const icon = document.createElement('img');
      icon.src = buildStaticAssetPath('images/retornar_material.png');
      icon.alt = 'Repor';
      icon.width = 24;
      icon.height = 24;
      icon.loading = 'lazy';
      icon.decoding = 'async';
      attachIconFallback(icon, 'bi bi-arrow-counterclockwise');
      actionBtn.appendChild(icon);
      actions.appendChild(actionBtn);
      row.appendChild(actions);

      fragment.appendChild(row);
    });
    materiaisExtraidosListEl.appendChild(fragment);
    const footer = createMateriaisPagerFooter('extraidos', total, currentPage);
    if(footer) materiaisExtraidosListEl.appendChild(footer);
  }

  function renderMateriaisCessao(){
    if(!materiaisCessaoListEl) return;
    materiaisCessaoListEl.innerHTML = '';
    const { list, total, currentPage } = resolveMateriaisTotals('cessao');
    if(total === 0){
      const empty = document.createElement('div');
      empty.className = 'wdg-placeholder-box';
      empty.textContent = 'Nenhum material inserido.';
      materiaisCessaoListEl.appendChild(empty);
      return;
    }
    const pageSize = MATERIALS_PAGE_SIZE;
    const start = currentPage * pageSize;
    const visibleItems = list.slice(start, start + pageSize);
    const fragment = document.createDocumentFragment();
    visibleItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'wdg-material-row';
      const content = document.createElement('div');
      content.className = 'flex-grow-1';
      const title = document.createElement('div');
      title.className = 'wdg-material-name';
      title.textContent = item.nome || 'Material';
      if(item.quantidade > 1){
        const qty = document.createElement('span');
        qty.className = 'wdg-material-qty';
        qty.textContent = `${item.quantidade} un.`;
        title.appendChild(qty);
      }
      content.appendChild(title);
      if(item.detalhe){
        const detail = document.createElement('div');
        detail.className = 'wdg-material-detail';
        detail.textContent = item.detalhe;
        content.appendChild(detail);
      }
      row.appendChild(content);
      fragment.appendChild(row);
    });
    materiaisCessaoListEl.appendChild(fragment);
    const footer = createMateriaisPagerFooter('cessao', total, currentPage);
    if(footer) materiaisCessaoListEl.appendChild(footer);
  }

  function updateMateriaisControls(){
    if(materiaisExtrairBtn){
      materiaisExtrairBtn.disabled = materiaisState.selecionados.size === 0;
    }
    if(materiaisInserirBtn){
      materiaisInserirBtn.disabled = materiaisState.disponiveis.length === 0 && materiaisState.cessao.length === 0;
    }
  }

  function handleMateriaisDisponiveisChange(event){
    const checkbox = event && event.target ? event.target.closest('input[type="checkbox"][data-material-id]') : null;
    if(!checkbox) return;
    const id = checkbox.dataset.materialId;
    if(!id) return;
    if(checkbox.checked) materiaisState.selecionados.add(id);
    else materiaisState.selecionados.delete(id);
    updateMateriaisControls();
  }

  function handleMateriaisDisponiveisClick(event){
    if(maybeHandleMateriaisPagerEvent(event)) return;
    const actionBtn = event && event.target ? event.target.closest('[data-material-action="extract"]') : null;
    if(!actionBtn) return;
    const id = actionBtn.dataset.id;
    if(!id) return;
    handleMateriaisExtrair([id]);
  }

  function handleMateriaisExtrair(ids){
    const targetIds = Array.isArray(ids) && ids.length
      ? ids
      : Array.from(materiaisState.selecionados);
    if(!targetIds.length) return;
    const moved = [];
    targetIds.forEach(id => {
      const idx = materiaisState.disponiveis.findIndex(item => item.uid === id);
      if(idx === -1) return;
      const [item] = materiaisState.disponiveis.splice(idx, 1);
      materiaisState.extraidos.push(item);
      materiaisState.selecionados.delete(id);
      moved.push(item);
    });
    if(!moved.length) return;
    sortMaterialList(materiaisState.disponiveis);
    sortMaterialList(materiaisState.extraidos);
    renderMateriais();
  }

  function handleMateriaisRepor(id){
    if(!id) return;
    const idx = materiaisState.extraidos.findIndex(item => item.uid === id);
    if(idx === -1) return;
    const [item] = materiaisState.extraidos.splice(idx, 1);
    materiaisState.disponiveis.push(item);
    sortMaterialList(materiaisState.disponiveis);
    sortMaterialList(materiaisState.extraidos);
    renderMateriais();
  }

  function handleMateriaisExtraidosClick(event){
    if(maybeHandleMateriaisPagerEvent(event)) return;
    const actionBtn = event && event.target ? event.target.closest('[data-material-action="repor"]') : null;
    if(!actionBtn) return;
    const id = actionBtn.dataset.id;
    if(!id) return;
    handleMateriaisRepor(id);
  }

  function handleMateriaisCessaoClick(event){
    maybeHandleMateriaisPagerEvent(event);
  }

  function handleMateriaisInserir(){
    materiaisState.cessao = materiaisState.disponiveis.slice();
    sortMaterialList(materiaisState.cessao);
    renderMateriaisCessao();
    updateMateriaisControls();
  }

  function bindMateriaisActions(){
    if(materiaisBound) return;
    materiaisBound = true;
    if(materiaisDisponiveisListEl){
      materiaisDisponiveisListEl.addEventListener('change', handleMateriaisDisponiveisChange);
      materiaisDisponiveisListEl.addEventListener('click', handleMateriaisDisponiveisClick);
    }
    if(materiaisExtraidosListEl){
      materiaisExtraidosListEl.addEventListener('click', handleMateriaisExtraidosClick);
    }
    if(materiaisCessaoListEl){
      materiaisCessaoListEl.addEventListener('click', handleMateriaisCessaoClick);
    }
    if(materiaisExtrairBtn){
      materiaisExtrairBtn.addEventListener('click', () => handleMateriaisExtrair());
    }
    if(materiaisInserirBtn){
      materiaisInserirBtn.addEventListener('click', handleMateriaisInserir);
    }
  }

  function resetTaxasState(){
    clearTaxaForm();
    taxas = [];
    renderTaxas();
    syncTaxasSnapshot();
  }

  function hydrateTaxasFromSnapshot(){
    const source = snapshot && (snapshot.taxasCustos || snapshot.taxas_custos || snapshot.taxas) || [];
    taxas = Array.isArray(source) ? source.map(normalizeTaxaItem).filter(Boolean) : [];
    renderTaxas();
    clearTaxaForm();
    syncTaxasSnapshot();
  }

  function bindTaxaActions(){
    if(taxasBound || !taxasForm) return;
    taxasBound = true;
    if(taxaFields.tipo){
      taxaFields.tipo.addEventListener('change', handleTaxaTipoChange);
    }
    if(taxaBoletoFields.enabled){
      taxaBoletoFields.enabled.addEventListener('change', handleTaxaBoletoToggle);
    }
    if(taxaSubmitBtn){
      taxaSubmitBtn.addEventListener('click', handleTaxaSubmit);
    }
    if(taxaClearBtn){
      taxaClearBtn.addEventListener('click', () => clearTaxaForm());
    }
    if(taxaCancelBtn){
      taxaCancelBtn.addEventListener('click', () => clearTaxaForm());
    }
    if(abatimentoSubmitBtn){
      abatimentoSubmitBtn.addEventListener('click', handleAbatimentoSubmit);
    }
    if(abatimentoCancelBtn){
      abatimentoCancelBtn.addEventListener('click', () => clearAbatimentoFields());
    }
    if(taxasListEl){
      taxasListEl.addEventListener('click', handleTaxaListClick);
    }
    if(abatimentoListEl){
      abatimentoListEl.addEventListener('click', handleAbatimentoListClick);
    }
    handleTaxaTipoChange();
  }

  function handleTaxaTipoChange(){
    const tipo = taxaFields.tipo ? sanitizeText(taxaFields.tipo.value).toLowerCase() : '';
    const isCobranca = tipo === 'cobranca';
    if(taxaValorGroup){
      taxaValorGroup.classList.toggle('d-none', !isCobranca);
    }
    if(taxaFields.valor){
      taxaFields.valor.disabled = !isCobranca;
      if(!isCobranca){
        taxaFields.valor.value = '';
      }
    }
    if(taxaVencimentoGroup){
      taxaVencimentoGroup.classList.toggle('d-none', !isCobranca);
    }
    if(taxaFields.vencimento){
      taxaFields.vencimento.disabled = !isCobranca;
      if(!isCobranca){
        taxaFields.vencimento.value = '';
        if(taxaFields.vencimento.dataset) taxaFields.vencimento.dataset.iso = '';
      }
    }
    syncTaxaBoletoVisibility(isCobranca);
  }

  function handleTaxaBoletoToggle(){
    syncTaxaBoletoVisibility(isCurrentTaxaTipoCobranca());
  }

  function isCurrentTaxaTipoCobranca(){
    const tipo = taxaFields.tipo ? sanitizeText(taxaFields.tipo.value).toLowerCase() : '';
    return tipo === 'cobranca';
  }

  function syncTaxaBoletoVisibility(isCobranca){
    const toggle = taxaBoletoFields.enabled;
    if(toggle){
      toggle.disabled = !isCobranca;
      if(!isCobranca){
        toggle.checked = false;
      }
    }
    const showConfig = Boolean(isCobranca && toggle && toggle.checked);
    if(taxaBoletoConfigWrapper){
      taxaBoletoConfigWrapper.classList.toggle('d-none', !showConfig);
    }
    Object.entries(taxaBoletoFields).forEach(([key, field]) => {
      if(!field || key === 'enabled') return;
      field.disabled = !showConfig;
    });
  }

  function clearTaxaValidation(){
    Object.values(taxaFields).forEach(field => {
      if(field) field.classList.remove('is-invalid');
    });
  }

  function markTaxaInvalid(input){
    if(!input) return;
    input.classList.add('is-invalid');
  }

  function clearAbatimentoValidation(){
    Object.values(abatimentoFields).forEach(field => {
      if(field) field.classList.remove('is-invalid');
    });
  }

  function markAbatimentoInvalid(input){
    if(!input) return;
    input.classList.add('is-invalid');
  }

  function setTaxaButtonLabel(mode){
    if(!taxaSubmitBtn) return;
    if(mode === 'update'){
      taxaSubmitBtn.textContent = 'Atualizar';
      taxaSubmitBtn.dataset.mode = 'update';
    } else {
      taxaSubmitBtn.textContent = 'Inserir';
      taxaSubmitBtn.dataset.mode = 'insert';
    }
  }

  function toggleTaxaCancel(show){
    if(!taxaCancelBtn) return;
    taxaCancelBtn.hidden = !show;
  }

  function notifyTaxaErro(message){
    if(window.WDG && window.WDG.notification && typeof window.WDG.notification.danger === 'function'){
      window.WDG.notification.danger(message);
    } else {
      window.alert(message);
    }
  }

  function notifyTaxaSucesso(message){
    if(window.WDG && window.WDG.notification && typeof window.WDG.notification.success === 'function'){
      window.WDG.notification.success(message);
    } else {
      console.info('[ceder-uso] taxas:', message);
    }
  }

  function clearTaxaForm(){
    clearTaxaValidation();
    if(taxaFields.tipo) taxaFields.tipo.value = '';
    if(taxaFields.valor) taxaFields.valor.value = '';
    if(taxaFields.vencimento){
      taxaFields.vencimento.value = '';
      if(taxaFields.vencimento.dataset) taxaFields.vencimento.dataset.iso = '';
    }
    if(taxaFields.fundo) taxaFields.fundo.value = '';
    if(taxaFields.fundamento) taxaFields.fundamento.value = '';
    clearTaxaBoletoFields();
    taxaEditId = null;
    taxaFormAbatimentos = [];
    clearAbatimentoFields();
    renderAbatimentos();
    setTaxaButtonLabel('insert');
    toggleTaxaCancel(false);
    handleTaxaTipoChange();
  }

  function clearTaxaBoletoFields(){
    if(taxaBoletoFields.enabled){
      taxaBoletoFields.enabled.checked = false;
    }
    Object.entries(taxaBoletoFields).forEach(([key, field]) => {
      if(!field || key === 'enabled') return;
      if(field.type === 'checkbox') field.checked = false;
      else field.value = '';
    });
    syncTaxaBoletoVisibility(false);
    applyTaxaBoletoDefaults();
  }

  function applyTaxaBoletoDefaults(options){
    if(!unidadeFinanceiroDefaults) return;
    const mode = options && options.force ? 'force' : 'preserve';
    const setText = (field, value) => {
      if(!field || !value) return;
      if(mode === 'force' || !sanitizeText(field.value)){
        field.value = value;
      }
    };
    const setNumber = (field, value) => {
      if(!field || value === null || value === undefined) return;
      if(!Number.isFinite(value) && typeof value !== 'string') return;
      if(mode === 'force' || !sanitizeText(field.value)){
        field.value = Number.isFinite(value) ? String(value) : String(value);
      }
    };
    const setCheckboxTrue = (field, value) => {
      if(!field || !value) return;
      if(mode === 'force' || field.checked === false){
        field.checked = true;
      }
    };
    setText(taxaBoletoFields.banco, unidadeFinanceiroDefaults.banco);
    setText(taxaBoletoFields.carteira, unidadeFinanceiroDefaults.carteira);
    setText(taxaBoletoFields.documento, unidadeFinanceiroDefaults.documento);
    setText(taxaBoletoFields.instrucao, unidadeFinanceiroDefaults.instrucao);
    setNumber(taxaBoletoFields.multa, unidadeFinanceiroDefaults.multaPercentual);
    setNumber(taxaBoletoFields.juros, unidadeFinanceiroDefaults.jurosPercentual);
    setCheckboxTrue(taxaBoletoFields.enviarEmail, unidadeFinanceiroDefaults.enviarEmail);
    setCheckboxTrue(taxaBoletoFields.enviarWhatsapp, unidadeFinanceiroDefaults.enviarWhatsapp);
  }

  function collectTaxaBoletoConfig(){
    let hasValue = false;
    const config = {};
    if(taxaBoletoFields.banco){
      const banco = sanitizeText(taxaBoletoFields.banco.value);
      if(banco){
        config.banco = banco;
        hasValue = true;
      }
    }
    if(taxaBoletoFields.carteira){
      const carteira = sanitizeText(taxaBoletoFields.carteira.value);
      if(carteira){
        config.carteira = carteira;
        hasValue = true;
      }
    }
    if(taxaBoletoFields.documento){
      const documento = sanitizeText(taxaBoletoFields.documento.value);
      if(documento){
        config.documento = documento;
        hasValue = true;
      }
    }
    if(taxaBoletoFields.instrucao){
      const instrucao = sanitizeText(taxaBoletoFields.instrucao.value);
      if(instrucao){
        config.instrucao = instrucao;
        hasValue = true;
      }
    }
    if(taxaBoletoFields.multa){
      const multa = parsePercentValue(taxaBoletoFields.multa.value);
      if(Number.isFinite(multa)){
        config.multaPercentual = multa;
        hasValue = true;
      }
    }
    if(taxaBoletoFields.juros){
      const juros = parsePercentValue(taxaBoletoFields.juros.value);
      if(Number.isFinite(juros)){
        config.jurosPercentual = juros;
        hasValue = true;
      }
    }
    if(taxaBoletoFields.enviarEmail && taxaBoletoFields.enviarEmail.checked){
      config.enviarEmail = true;
      hasValue = true;
    }
    if(taxaBoletoFields.enviarWhatsapp && taxaBoletoFields.enviarWhatsapp.checked){
      config.enviarWhatsapp = true;
      hasValue = true;
    }
    return hasValue ? config : null;
  }

  function collectTaxaInputs(currentId){
    if(!taxasForm) return null;
    clearTaxaValidation();
    const tipoRaw = taxaFields.tipo ? sanitizeText(taxaFields.tipo.value) : '';
    if(!tipoRaw){
      markTaxaInvalid(taxaFields.tipo);
      notifyTaxaErro('Selecione o tipo de cobrança.');
      return null;
    }
    const tipoNormalized = tipoRaw.toLowerCase();
    if(tipoNormalized !== 'isencao' && tipoNormalized !== 'cobranca'){
      markTaxaInvalid(taxaFields.tipo);
      notifyTaxaErro('Selecione uma opção válida de cobrança.');
      return null;
    }
    const isCobranca = tipoNormalized === 'cobranca';
    let valor = null;
    if(isCobranca){
      const valorRaw = taxaFields.valor ? taxaFields.valor.value : '';
      valor = parseMoneyValue(valorRaw);
      if(!Number.isFinite(valor) || valor <= 0){
        markTaxaInvalid(taxaFields.valor);
        notifyTaxaErro('Informe um valor de taxa válido.');
        return null;
      }
    }
    let vencimentoIso = '';
    let vencimentoBr = '';
    if(isCobranca){
      const vencRaw = taxaFields.vencimento ? sanitizeText(taxaFields.vencimento.value) : '';
      const vencimentoDate = parseDateBr(vencRaw);
      if(!vencimentoDate){
        markTaxaInvalid(taxaFields.vencimento);
        notifyTaxaErro('Informe uma data de vencimento válida (DD/MM/AAAA).');
        return null;
      }
      vencimentoIso = formatDateIso(vencimentoDate);
      vencimentoBr = formatDateBr(vencimentoDate);
    }
    const fundo = taxaFields.fundo ? sanitizeText(taxaFields.fundo.value) : '';
    const fundamento = taxaFields.fundamento ? sanitizeText(taxaFields.fundamento.value) : '';
    const abatimentos = taxaFormAbatimentos.map(item => ({ ...item }));
    const boletoEnabled = isCobranca && taxaBoletoFields.enabled && taxaBoletoFields.enabled.checked;
    const boletoConfig = boletoEnabled ? collectTaxaBoletoConfig() : null;
    return {
      id: currentId ? String(currentId) : generateTaxaId(),
      tipo: tipoNormalized,
      valor: isCobranca ? valor : null,
      vencimentoIso,
      vencimentoBr,
      fundo,
      fundamento,
      abatimentos,
      geraBoleto: boletoEnabled,
      boletoConfig
    };
  }

  function populateTaxaBoletoFields(entry){
    const config = entry && entry.boletoConfig ? { ...entry.boletoConfig } : null;
    if(taxaBoletoFields.enabled){
      taxaBoletoFields.enabled.checked = Boolean(entry && entry.geraBoleto);
    }
    const setValue = (field, value) => {
      if(!field) return;
      field.value = value || '';
    };
    setValue(taxaBoletoFields.banco, config && config.banco);
    setValue(taxaBoletoFields.carteira, config && config.carteira);
    setValue(taxaBoletoFields.documento, config && config.documento);
    setValue(taxaBoletoFields.instrucao, config && config.instrucao);
    if(taxaBoletoFields.multa){
      taxaBoletoFields.multa.value = Number.isFinite(config && config.multaPercentual)
        ? String(config.multaPercentual)
        : '';
    }
    if(taxaBoletoFields.juros){
      taxaBoletoFields.juros.value = Number.isFinite(config && config.jurosPercentual)
        ? String(config.jurosPercentual)
        : '';
    }
    if(taxaBoletoFields.enviarEmail){
      taxaBoletoFields.enviarEmail.checked = Boolean(config && config.enviarEmail);
    }
    if(taxaBoletoFields.enviarWhatsapp){
      taxaBoletoFields.enviarWhatsapp.checked = Boolean(config && config.enviarWhatsapp);
    }
    syncTaxaBoletoVisibility(isCurrentTaxaTipoCobranca());
  }

  function handleTaxaSubmit(){
    const payload = collectTaxaInputs(taxaEditId);
    if(!payload) return;
    const isUpdate = Boolean(taxaEditId);
    if(isUpdate){
      const idx = taxas.findIndex(item => String(item.id) === String(taxaEditId));
      if(idx >= 0) taxas[idx] = payload;
      else taxas.push(payload);
    } else {
      taxas.push(payload);
    }
    renderTaxas();
    syncTaxasSnapshot();
    clearTaxaForm();
    notifyTaxaSucesso(isUpdate ? 'Taxa atualizada.' : 'Taxa inserida.');
  }

  function handleTaxaListClick(event){
    const actionBtn = event && event.target ? event.target.closest('[data-taxa-action]') : null;
    if(!actionBtn) return;
    event.preventDefault();
    const { taxaAction } = actionBtn.dataset;
    const id = actionBtn.dataset.id;
    if(!id) return;
    if(taxaAction === 'edit'){
      startTaxaEdit(id);
    } else if(taxaAction === 'remove'){
      removeTaxa(id);
    } else if(taxaAction === 'boleto'){
      triggerTaxaBoletoGeneration(id);
    }
  }

  function startTaxaEdit(id){
    const entry = taxas.find(item => String(item.id) === String(id));
    if(!entry) return;
    clearTaxaValidation();
    clearAbatimentoValidation();
    taxaEditId = String(entry.id);
    if(taxaFields.tipo) taxaFields.tipo.value = entry.tipo || '';
    if(taxaFields.valor){
      if(entry.tipo === 'cobranca' && Number.isFinite(entry.valor)){
        taxaFields.valor.value = entry.valor.toFixed(2);
      } else {
        taxaFields.valor.value = '';
      }
    }
    if(taxaFields.vencimento){
      taxaFields.vencimento.value = entry.vencimentoBr || '';
      if(taxaFields.vencimento.dataset) taxaFields.vencimento.dataset.iso = entry.vencimentoIso || '';
    }
    if(taxaFields.fundo) taxaFields.fundo.value = entry.fundo || '';
    if(taxaFields.fundamento) taxaFields.fundamento.value = entry.fundamento || '';
    taxaFormAbatimentos = Array.isArray(entry.abatimentos) ? entry.abatimentos.map(item => ({ ...item })) : [];
    renderAbatimentos();
    clearAbatimentoFields();
    populateTaxaBoletoFields(entry);
    setTaxaButtonLabel('update');
    toggleTaxaCancel(true);
    handleTaxaTipoChange();
  }

  function removeTaxa(id){
    const index = taxas.findIndex(item => String(item.id) === String(id));
    if(index === -1) return;
    const [removed] = taxas.splice(index, 1);
    if(taxaEditId && removed && String(removed.id) === String(taxaEditId)){
      clearTaxaForm();
    }
    renderTaxas();
    syncTaxasSnapshot();
    notifyTaxaSucesso('Taxa removida.');
  }

  function triggerTaxaBoletoGeneration(id){
    const entry = taxas.find(item => String(item.id) === String(id));
    if(!entry) return;
    if(entry.tipo !== 'cobranca'){
      notifyTaxaErro('Apenas cobranças podem gerar boletos.');
      return;
    }
    if(!entry.geraBoleto){
      notifyTaxaErro('Habilite a geração de boleto na taxa selecionada.');
      return;
    }
    if(!Number.isFinite(entry.valor)){
      notifyTaxaErro('Informe o valor da taxa antes de gerar o boleto.');
      return;
    }
    if(!entry.vencimentoIso){
      notifyTaxaErro('Defina a data de vencimento para gerar o boleto.');
      return;
    }
    const pagador = cessionarios[0] || null;
    if(!pagador){
      notifyTaxaErro('Adicione um cessionário para emitir o boleto.');
      return;
    }
    const detail = buildTaxaBoletoDetail(entry, pagador);
    const dispatched = modalEl.dispatchEvent(new CustomEvent('wdg:taxa:gerar-boleto', {
      detail,
      bubbles: true,
      cancelable: true
    }));
    if(dispatched){
      notifyTaxaSucesso('Solicitação de boleto enviada para processamento.');
    }
  }

  function buildTaxaBoletoDetail(entry, pagador){
    const area = getSnapshotArea();
    return {
      taxa: cloneShallow(entry) || { ...entry },
      cobranca: {
        taxaId: entry.id,
        valor: entry.valor,
        valorFormatado: formatCurrencyBr(entry.valor),
        vencimentoIso: entry.vencimentoIso,
        vencimentoBr: entry.vencimentoBr,
        fundo: entry.fundo,
        fundamento: entry.fundamento,
        abatimentos: Array.isArray(entry.abatimentos) ? entry.abatimentos.map(item => ({ ...item })) : []
      },
      boletoConfig: entry.boletoConfig ? { ...entry.boletoConfig } : null,
      cessionario: cloneShallow(pagador) || { ...pagador },
      unidade: {
        id: cessionarioState.unidadeId || '',
        nome: cessionarioState.unidadeLabel || '',
        endereco: cessionarioState.unidadeEndereco || ''
      },
      area,
      reservas: Array.isArray(reservas) ? reservas.map(item => cloneShallow(item) || { ...item }) : []
    };
  }

  function syncTaxasSnapshot(){
    if(!snapshot || typeof snapshot !== 'object') return;
    const serialized = serializeTaxaList(taxas);
    snapshot.taxas_custos = serialized;
    snapshot.taxasCustos = snapshot.taxas_custos;
    snapshot.taxas = snapshot.taxas_custos;
  }

  function renderTaxas(){
    if(!taxasListEl) return;
    if(!Array.isArray(taxas) || !taxas.length){
      taxasListEl.classList.add('wdg-placeholder-box');
      taxasListEl.innerHTML = taxaListEmptyText || 'Nenhuma taxa cadastrada.';
      return;
    }
    taxasListEl.classList.remove('wdg-placeholder-box');
    taxasListEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    taxas.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'wdg-cessionario-item border rounded p-3 mb-2 d-flex flex-column flex-md-row justify-content-between align-items-start gap-2';
      card.dataset.id = String(entry.id);

      const infoWrap = document.createElement('div');
      infoWrap.className = 'wdg-cessionario-item__info';

      const title = document.createElement('div');
      title.className = 'wdg-cessionario-item__summary';
      title.textContent = resolveTaxaTipoLabel(entry.tipo);
      infoWrap.appendChild(title);

      const detailsText = formatTaxaDetails(entry);
      if(detailsText){
        const detailsEl = document.createElement('div');
        detailsEl.className = 'small text-muted mt-1';
        detailsEl.textContent = detailsText;
        infoWrap.appendChild(detailsEl);
      }

      if(entry.fundamento){
        const fundamentoEl = document.createElement('div');
        fundamentoEl.className = 'small mt-1';
        fundamentoEl.textContent = `Fundamento deliberativo: ${entry.fundamento}`;
        infoWrap.appendChild(fundamentoEl);
      }

      if(Array.isArray(entry.abatimentos) && entry.abatimentos.length){
        const abatimentoEl = document.createElement('div');
        abatimentoEl.className = 'small mt-1';
        const resumo = entry.abatimentos.map(item => `${formatPercentBr(item.percentual)} - ${item.titulo}`).join('; ');
        abatimentoEl.textContent = `Abatimentos: ${resumo}`;
        infoWrap.appendChild(abatimentoEl);
      }

      const boletoSummary = getTaxaBoletoSummary(entry);
      if(boletoSummary){
        const boletoEl = document.createElement('div');
        boletoEl.className = 'small text-primary mt-1 fw-semibold';
        boletoEl.textContent = boletoSummary;
        infoWrap.appendChild(boletoEl);
      }

      const actions = document.createElement('div');
      actions.className = 'wdg-cessionario-item__actions d-flex gap-3 align-items-center';
      const editBtn = createIconActionButton({
        datasetKey: 'taxaAction',
        action: 'edit',
        id: entry.id,
        icon: 'images/editar.png',
        alt: 'Editar taxa',
        title: 'Editar taxa',
        fallbackClass: 'bi bi-pencil'
      });

      if(entry.tipo === 'cobranca' && entry.geraBoleto){
        const boletoBtn = createIconActionButton({
          datasetKey: 'taxaAction',
          action: 'boleto',
          id: entry.id,
          icon: 'images/imprimir.png',
          alt: 'Gerar boleto',
          title: 'Gerar boleto',
          fallbackClass: 'bi bi-receipt'
        });
        actions.appendChild(boletoBtn);
      }

      const removeBtn = createIconActionButton({
        datasetKey: 'taxaAction',
        action: 'remove',
        id: entry.id,
        icon: 'images/remover.png',
        alt: 'Remover taxa',
        title: 'Remover taxa',
        fallbackClass: 'bi bi-trash'
      });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      card.appendChild(infoWrap);
      card.appendChild(actions);
      fragment.appendChild(card);
    });
    taxasListEl.appendChild(fragment);
  }

  function resolveTaxaTipoLabel(tipo){
    const normalized = sanitizeText(tipo).toLowerCase();
    if(normalized === 'cobranca') return 'Cobrança de taxa';
    if(normalized === 'isencao') return 'Isenção de taxa';
    return 'Taxa';
  }

  function formatTaxaDetails(entry){
    if(!entry) return '';
    const parts = [];
    if(entry.tipo === 'cobranca'){
      if(Number.isFinite(entry.valor)) parts.push(`Valor: ${formatCurrencyBr(entry.valor)}`);
      if(entry.vencimentoBr) parts.push(`Vencimento: ${entry.vencimentoBr}`);
    } else {
      parts.push('Sem cobrança');
    }
    if(entry.fundo) parts.push(`Fundo: ${entry.fundo}`);
    return parts.join(' · ');
  }

  function getTaxaBoletoSummary(entry){
    if(!entry || !entry.geraBoleto) return '';
    const config = entry.boletoConfig || {};
    const parts = ['Boleto habilitado'];
    if(config.banco) parts.push(config.banco);
    if(config.documento) parts.push(`Doc ${config.documento}`);
    return parts.join(' · ');
  }

  function renderAbatimentos(){
    if(!abatimentoListEl) return;
    if(!Array.isArray(taxaFormAbatimentos) || !taxaFormAbatimentos.length){
      abatimentoListEl.classList.add('wdg-placeholder-box');
      abatimentoListEl.innerHTML = abatimentoListEmptyText || 'Nenhum abatimento informado.';
      return;
    }
    abatimentoListEl.classList.remove('wdg-placeholder-box');
    abatimentoListEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    taxaFormAbatimentos.forEach(item => {
      const row = document.createElement('div');
      row.className = 'wdg-cessionario-item border rounded p-2 mb-2 d-flex flex-column flex-md-row justify-content-between align-items-start gap-2';
      row.dataset.id = String(item.id);

      const info = document.createElement('div');
      info.className = 'wdg-cessionario-item__info';
      const titleEl = document.createElement('div');
      titleEl.className = 'fw-semibold';
      titleEl.textContent = item.titulo || 'Abatimento';
      info.appendChild(titleEl);

      const detailEl = document.createElement('div');
      detailEl.className = 'small text-muted';
      detailEl.textContent = item.descricao
        ? `${formatPercentBr(item.percentual)} · ${item.descricao}`
        : formatPercentBr(item.percentual);
      info.appendChild(detailEl);

      const actions = document.createElement('div');
      actions.className = 'wdg-cessionario-item__actions d-flex gap-3 align-items-center';

      const editBtn = createIconActionButton({
        datasetKey: 'abatimentoAction',
        action: 'edit',
        id: item.id,
        icon: 'images/editar.png',
        alt: 'Editar abatimento',
        title: 'Editar abatimento',
        fallbackClass: 'bi bi-pencil'
      });

      const removeBtn = createIconActionButton({
        datasetKey: 'abatimentoAction',
        action: 'remove',
        id: item.id,
        icon: 'images/remover.png',
        alt: 'Remover abatimento',
        title: 'Remover abatimento',
        fallbackClass: 'bi bi-trash'
      });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      row.appendChild(info);
      row.appendChild(actions);
      fragment.appendChild(row);
    });
    abatimentoListEl.appendChild(fragment);
  }

  function setAbatimentoButtonLabel(mode){
    if(!abatimentoSubmitBtn) return;
    if(mode === 'update'){
      abatimentoSubmitBtn.textContent = 'Atualizar abatimento';
      abatimentoSubmitBtn.dataset.mode = 'update';
    } else {
      abatimentoSubmitBtn.textContent = 'Adicionar abatimento';
      abatimentoSubmitBtn.dataset.mode = 'insert';
    }
  }

  function toggleAbatimentoCancel(show){
    if(!abatimentoCancelBtn) return;
    abatimentoCancelBtn.hidden = !show;
  }

  function clearAbatimentoFields(){
    clearAbatimentoValidation();
    if(abatimentoFields.titulo) abatimentoFields.titulo.value = '';
    if(abatimentoFields.percentual) abatimentoFields.percentual.value = '';
    if(abatimentoFields.descricao) abatimentoFields.descricao.value = '';
    taxaAbatimentoEditId = null;
    setAbatimentoButtonLabel('insert');
    toggleAbatimentoCancel(false);
  }

  function collectAbatimentoInputs(currentId){
    clearAbatimentoValidation();
    const titulo = abatimentoFields.titulo ? sanitizeText(abatimentoFields.titulo.value) : '';
    if(!titulo){
      markAbatimentoInvalid(abatimentoFields.titulo);
      notifyTaxaErro('Informe o título do abatimento.');
      return null;
    }
    const percentualValue = abatimentoFields.percentual ? abatimentoFields.percentual.value : '';
    let percentual = parsePercentValue(percentualValue);
    if(!Number.isFinite(percentual)){
      markAbatimentoInvalid(abatimentoFields.percentual);
      notifyTaxaErro('Informe um percentual válido para o abatimento.');
      return null;
    }
    if(percentual < 0 || percentual > 100){
      markAbatimentoInvalid(abatimentoFields.percentual);
      notifyTaxaErro('O percentual do abatimento deve estar entre 0 e 100.');
      return null;
    }
    const descricao = abatimentoFields.descricao ? sanitizeText(abatimentoFields.descricao.value) : '';
    return {
      id: currentId ? String(currentId) : generateAbatimentoId(),
      titulo,
      percentual,
      descricao
    };
  }

  function handleAbatimentoSubmit(){
    const payload = collectAbatimentoInputs(taxaAbatimentoEditId);
    if(!payload) return;
    const isUpdate = Boolean(taxaAbatimentoEditId);
    if(isUpdate){
      const idx = taxaFormAbatimentos.findIndex(item => String(item.id) === String(taxaAbatimentoEditId));
      if(idx >= 0) taxaFormAbatimentos[idx] = payload;
      else taxaFormAbatimentos.push(payload);
    } else {
      taxaFormAbatimentos.push(payload);
    }
    renderAbatimentos();
    clearAbatimentoFields();
  }

  function handleAbatimentoListClick(event){
    const actionBtn = event && event.target ? event.target.closest('[data-abatimento-action]') : null;
    if(!actionBtn) return;
    event.preventDefault();
    const { abatimentoAction } = actionBtn.dataset;
    const id = actionBtn.dataset.id;
    if(!id) return;
    if(abatimentoAction === 'edit'){
      startAbatimentoEdit(id);
    } else if(abatimentoAction === 'remove'){
      removeAbatimento(id);
    }
  }

  function startAbatimentoEdit(id){
    const entry = taxaFormAbatimentos.find(item => String(item.id) === String(id));
    if(!entry) return;
    clearAbatimentoValidation();
    taxaAbatimentoEditId = String(entry.id);
    if(abatimentoFields.titulo) abatimentoFields.titulo.value = entry.titulo || '';
    if(abatimentoFields.percentual){
      abatimentoFields.percentual.value = Number.isFinite(entry.percentual) ? entry.percentual.toString() : '';
    }
    if(abatimentoFields.descricao) abatimentoFields.descricao.value = entry.descricao || '';
    setAbatimentoButtonLabel('update');
    toggleAbatimentoCancel(true);
  }

  function removeAbatimento(id){
    const index = taxaFormAbatimentos.findIndex(item => String(item.id) === String(id));
    if(index === -1) return;
    const [removed] = taxaFormAbatimentos.splice(index, 1);
    if(taxaAbatimentoEditId && removed && String(removed.id) === String(taxaAbatimentoEditId)){
      clearAbatimentoFields();
    }
    renderAbatimentos();
  }

  function generateTaxaId(){
    const random = Math.floor(Math.random() * 1e6);
    return `taxa-${Date.now()}-${random}`;
  }

  function generateAbatimentoId(){
    const random = Math.floor(Math.random() * 1e6);
    return `abatimento-${Date.now()}-${random}`;
  }

  function normalizeTaxaItem(raw){
    if(!raw || typeof raw !== 'object') return null;
    const clone = cloneShallow(raw) || raw;
    const tipoCandidate = sanitizeText(clone.tipo || clone.tipo_cobranca || clone.modalidade || clone.status || '');
    const tipoLower = tipoCandidate.toLowerCase();
    let tipo = 'isencao';
    if(tipoLower.startsWith('cob') || tipoLower.startsWith('tax') || tipoLower === 'cobranca'){
      tipo = 'cobranca';
    } else if(tipoLower.startsWith('isen') || tipoLower === 'isencao'){
      tipo = 'isencao';
    }
    const isCobranca = tipo === 'cobranca';
    const valorCandidate = clone.valor ?? clone.valor_taxa ?? clone.valor_cobranca ?? clone.valorReais ?? null;
    const valor = isCobranca ? parseMoneyValue(valorCandidate) : null;
    const vencimentoCandidate = clone.vencimento_iso || clone.vencimentoIso || clone.vencimento || clone.data_vencimento || clone.dataVencimento || '';
    let vencimentoIso = '';
    let vencimentoBr = '';
    if(isCobranca){
      const iso = normalizeDateIso(vencimentoCandidate) || '';
      if(iso){
        const parsedIso = fromIsoDate(iso);
        if(parsedIso){
          vencimentoIso = iso;
          vencimentoBr = formatDateBr(parsedIso);
        }
      }
      if(!vencimentoIso && clone.vencimento_br){
        const parsedBr = parseDateBr(clone.vencimento_br);
        if(parsedBr){
          vencimentoIso = formatDateIso(parsedBr);
          vencimentoBr = formatDateBr(parsedBr);
        }
      }
    }
    const fundo = sanitizeText(clone.fundo_destinacao || clone.fundo || clone.destinacao || clone.destino || '');
    const fundamento = sanitizeText(clone.fundamento_deliberativo || clone.fundamento || clone.deliberacao || clone.descricao || '');
    const abatimentosRaw = Array.isArray(clone.abatimentos) ? clone.abatimentos : [];
    const abatimentos = abatimentosRaw.map(normalizeAbatimentoItem).filter(Boolean);
    const boletoConfigRaw = clone.boleto_config || clone.config_boleto || clone.boletoConfig || clone.boleto || null;
    const boletoConfig = normalizeBoletoConfig(boletoConfigRaw);
    const geraBoletoFlag = clone.gera_boleto ?? clone.boleto_habilitado ?? clone.emitir_boleto ?? clone.habilitar_boleto;
    const geraBoleto = geraBoletoFlag !== undefined ? toBoolean(geraBoletoFlag) : Boolean(boletoConfig);
    return {
      id: sanitizeText(clone.id || clone._id || '') || generateTaxaId(),
      tipo,
      valor: isCobranca && Number.isFinite(valor) ? valor : null,
      vencimentoIso,
      vencimentoBr,
      fundo,
      fundamento,
      abatimentos,
      geraBoleto,
      boletoConfig
    };
  }

  function normalizeAbatimentoItem(raw){
    if(!raw || typeof raw !== 'object') return null;
    const clone = cloneShallow(raw) || raw;
    const titulo = sanitizeText(clone.titulo || clone.titulo_referencia || clone.referencia || clone.nome || clone.label || 'Abatimento');
    const percentualCandidate = clone.percentual ?? clone.percentual_desconto ?? clone.percent ?? clone.valor ?? null;
    let percentual = parsePercentValue(percentualCandidate);
    if(!Number.isFinite(percentual)) percentual = 0;
    const descricao = sanitizeText(clone.descricao || clone.condicoes || clone.condicao || clone.detalhes || clone.obs || '');
    return {
      id: sanitizeText(clone.id || clone._id || '') || generateAbatimentoId(),
      titulo,
      percentual,
      descricao
    };
  }

  function normalizeBoletoConfig(raw){
    if(!raw || typeof raw !== 'object') return null;
    const clone = cloneShallow(raw) || raw;
    const banco = sanitizeText(clone.banco || clone.banco_emissor || clone.bank || clone.instituicao || '');
    const carteira = sanitizeText(clone.carteira || clone.convenio || clone.carteira_codigo || clone.codigo || '');
    const documento = sanitizeText(clone.documento || clone.nosso_numero || clone.nossoNumero || clone.identificador || '');
    const instrucao = sanitizeText(clone.instrucao || clone.instrucoes || clone.mensagem || clone.mensagem_pagador || clone.observacoes || '');
    let multaPercentual = parsePercentValue(clone.multaPercentual ?? clone.multa_percentual ?? clone.multa ?? null);
    if(!Number.isFinite(multaPercentual)) multaPercentual = null;
    let jurosPercentual = parsePercentValue(clone.jurosPercentual ?? clone.juros_percentual ?? clone.juros ?? null);
    if(!Number.isFinite(jurosPercentual)) jurosPercentual = null;
    const enviarEmail = toBoolean(clone.enviarEmail ?? clone.enviar_email ?? clone.email ?? false);
    const enviarWhatsapp = toBoolean(clone.enviarWhatsapp ?? clone.enviar_whatsapp ?? clone.whatsapp ?? false);
    if(!banco && !carteira && !documento && !instrucao && multaPercentual === null && jurosPercentual === null && !enviarEmail && !enviarWhatsapp){
      return null;
    }
    return {
      banco,
      carteira,
      documento,
      instrucao,
      multaPercentual,
      jurosPercentual,
      enviarEmail,
      enviarWhatsapp
    };
  }

  function serializeTaxaList(list){
    if(!Array.isArray(list) || !list.length) return [];
    return list.map(serializeTaxaItem).filter(Boolean);
  }

  function serializeTaxaItem(item){
    if(!item) return null;
    const payload = {
      id: item.id,
      tipo: item.tipo,
      valor: item.tipo === 'cobranca' && Number.isFinite(item.valor) ? item.valor : null,
      valor_formatado: item.tipo === 'cobranca' && Number.isFinite(item.valor) ? formatCurrencyBr(item.valor) : '',
      vencimento_iso: item.vencimentoIso || '',
      vencimento: item.vencimentoIso || '',
      vencimento_br: item.vencimentoBr || '',
      fundo_destinacao: item.fundo || '',
      fundo: item.fundo || '',
      fundamento_deliberativo: item.fundamento || '',
      fundamento: item.fundamento || '',
      abatimentos: Array.isArray(item.abatimentos) ? item.abatimentos.map(serializeAbatimento).filter(Boolean) : [],
      gera_boleto: Boolean(item.geraBoleto),
      boleto_habilitado: Boolean(item.geraBoleto),
      boleto_config: item.boletoConfig ? serializeBoletoConfig(item.boletoConfig) : null
    };
    return payload;
  }

  function serializeAbatimento(item){
    if(!item) return null;
    return {
      id: item.id,
      titulo: item.titulo,
      percentual: Number.isFinite(item.percentual) ? item.percentual : null,
      percentual_formatado: Number.isFinite(item.percentual) ? formatPercentBr(item.percentual) : '',
      descricao: item.descricao || ''
    };
  }

  function serializeBoletoConfig(config){
    if(!config) return null;
    return {
      banco: config.banco || '',
      carteira: config.carteira || '',
      documento: config.documento || '',
      instrucao: config.instrucao || '',
      multa_percentual: Number.isFinite(config.multaPercentual) ? config.multaPercentual : null,
      juros_percentual: Number.isFinite(config.jurosPercentual) ? config.jurosPercentual : null,
      enviar_email: Boolean(config.enviarEmail),
      enviar_whatsapp: Boolean(config.enviarWhatsapp)
    };
  }

  function resetForoState(){
    foros = [];
    foroEditId = null;
    Promise.resolve(populateEstadoOptions()).finally(() => {
      clearForoForm();
      renderForos();
      syncForosSnapshot();
    });
  }

  function hydrateForosFromSnapshot(){
    const seed = snapshot && (snapshot.foros || snapshot.foros_cadastrados || snapshot.foro) || [];
    const normalized = Array.isArray(seed) ? seed.map(normalizeForoItem).filter(Boolean) : [];
    foros = normalized;
    renderForos();
    Promise.resolve(populateEstadoOptions()).finally(() => {
      clearForoForm();
    });
    syncForosSnapshot();
  }

  function bindForoActions(){
    if(forosBound || !foroForm) return;
    forosBound = true;
    if(foroFields.estado){
      foroFields.estado.addEventListener('change', () => handleForoEstadoChange());
    }
    if(foroFields.vara){
      foroFields.vara.addEventListener('input', handleForoVaraInput);
    }
    if(foroSubmitBtn){
      foroSubmitBtn.addEventListener('click', handleForoSubmit);
    }
    if(foroClearBtn){
      foroClearBtn.addEventListener('click', () => clearForoForm());
    }
    if(foroListEl){
      foroListEl.addEventListener('click', handleForoListClick);
    }
    populateEstadoOptions();
    handleForoEstadoChange();
  }

  function notifyForoErro(message){
    if(window.WDG && window.WDG.notification && typeof window.WDG.notification.danger === 'function'){
      window.WDG.notification.danger(message);
    } else {
      window.alert(message);
    }
  }

  function notifyForoSucesso(message){
    if(window.WDG && window.WDG.notification && typeof window.WDG.notification.success === 'function'){
      window.WDG.notification.success(message);
    } else {
      console.info('[ceder-uso] foro:', message);
    }
  }

  function clearForoValidation(){
    [foroFields.estado, foroFields.municipio, foroFields.vara].forEach(field => {
      if(field) field.classList.remove('is-invalid');
    });
  }

  function markForoInvalid(field){
    if(!field) return;
    field.classList.add('is-invalid');
  }

  function clearForoForm(options){
    const keepEstado = !!(options && options.keepEstado);
    const keepMunicipio = !!(options && options.keepMunicipio);
    clearForoValidation();
    if(foroFields.estado && !keepEstado){
      foroFields.estado.value = '';
    }
    const currentUf = foroFields.estado ? sanitizeText(foroFields.estado.value) : '';
    if(foroFields.municipio){
      const selectedMunicipio = keepMunicipio ? foroFields.municipio.value : '';
      populateMunicipiosOptions(keepEstado ? currentUf : '', { selected: selectedMunicipio });
    }
    if(foroFields.vara) foroFields.vara.value = '';
    foroEditId = null;
    setForoButtonLabel('insert');
  }

  async function populateEstadoOptions(selected){
    const select = foroFields.estado;
    if(!select) return;
    const estados = await fetchEstadosBrasil();
    const current = selected !== undefined ? selected : select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione...';
    select.appendChild(placeholder);
    estados.forEach(item => {
      if(!item || !item.sigla) return;
      const option = document.createElement('option');
      option.value = sanitizeText(item.sigla).toUpperCase();
      option.textContent = sanitizeText(item.nome || item.sigla);
      select.appendChild(option);
    });
    if(current){
      select.value = current;
      if(select.value !== current){
        select.value = '';
      }
    }
  }

  function handleForoEstadoChange(){
    const uf = foroFields.estado ? sanitizeText(foroFields.estado.value).toUpperCase() : '';
    populateMunicipiosOptions(uf);
  }

  async function populateMunicipiosOptions(uf, options){
    const select = foroFields.municipio;
    if(!select) return;
    const selected = options && options.selected !== undefined ? options.selected : '';
    select.innerHTML = '';
    if(!uf){
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Selecione um estado';
      select.appendChild(placeholder);
      select.disabled = true;
      select.value = '';
      return;
    }
    const municipiosMap = await fetchMunicipiosPorUf();
    const lista = Array.isArray(municipiosMap[uf]) ? municipiosMap[uf] : [];
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = lista.length ? 'Selecione...' : 'Nenhum município disponível';
    select.appendChild(placeholder);
    lista.forEach(nome => {
      const option = document.createElement('option');
      option.value = sanitizeText(nome);
      option.textContent = sanitizeText(nome);
      select.appendChild(option);
    });
    select.disabled = lista.length === 0;
    if(selected){
      select.value = selected;
      if(select.value !== selected){
        select.value = '';
      }
    }
  }

  function handleForoVaraInput(event){
    if(!event || !event.target) return;
    const input = event.target;
    const raw = input.value === undefined || input.value === null ? '' : String(input.value);
    input.value = raw.toLocaleUpperCase('pt-BR');
  }

  function collectForoInputs(currentId){
    if(!foroForm) return null;
    clearForoValidation();
    const estado = foroFields.estado ? sanitizeText(foroFields.estado.value).toUpperCase() : '';
    if(!estado){
      markForoInvalid(foroFields.estado);
      notifyForoErro('Selecione o estado do foro.');
      return null;
    }
    const municipio = foroFields.municipio ? sanitizeText(foroFields.municipio.value) : '';
    if(!municipio){
      markForoInvalid(foroFields.municipio);
      notifyForoErro('Selecione o município do foro.');
      return null;
    }
    let vara = foroFields.vara ? sanitizeText(foroFields.vara.value) : '';
    if(!vara){
      markForoInvalid(foroFields.vara);
      notifyForoErro('Informe a vara competente.');
      return null;
    }
    vara = vara.toLocaleUpperCase('pt-BR');
    if(foroFields.vara) foroFields.vara.value = vara;
    return {
      id: currentId ? String(currentId) : generateForoId(),
      estadoSigla: estado,
      estadoNome: resolveEstadoNome(estado),
      municipio,
      vara
    };
  }

  function handleForoSubmit(){
    const payload = collectForoInputs(foroEditId);
    if(!payload) return;
    if(!foroEditId && foros.length >= 1){
      notifyForoErro('Já existe um foro cadastrado. Edite ou remova o registro atual para inserir outro.');
      return;
    }
    const isUpdate = Boolean(foroEditId);
    if(isUpdate){
      const idx = foros.findIndex(item => String(item.id) === String(foroEditId));
      if(idx >= 0) foros[idx] = payload;
      else foros.push(payload);
    } else {
      foros = [payload];
    }
    renderForos();
    syncForosSnapshot();
    clearForoForm();
    notifyForoSucesso(isUpdate ? 'Foro atualizado.' : 'Foro inserido.');
  }

  function handleForoListClick(event){
    const actionBtn = event && event.target ? event.target.closest('[data-foro-action]') : null;
    if(!actionBtn) return;
    event.preventDefault();
    const { foroAction } = actionBtn.dataset;
    const id = actionBtn.dataset.id;
    if(!id) return;
    if(foroAction === 'edit'){
      startForoEdit(id);
    } else if(foroAction === 'remove'){
      removeForo(id);
    }
  }

  function startForoEdit(id){
    const entry = foros.find(item => String(item.id) === String(id));
    if(!entry) return;
    foroEditId = String(entry.id);
    clearForoValidation();
    Promise.resolve(populateEstadoOptions(entry.estadoSigla)).then(() => populateMunicipiosOptions(entry.estadoSigla, { selected: entry.municipio })).then(() => {
      if(foroFields.estado) foroFields.estado.value = entry.estadoSigla || '';
      if(foroFields.municipio) foroFields.municipio.value = entry.municipio || '';
    }).finally(() => {
      if(foroFields.vara) foroFields.vara.value = entry.vara || '';
      setForoButtonLabel('update');
    });
  }

  function removeForo(id){
    const index = foros.findIndex(item => String(item.id) === String(id));
    if(index === -1) return;
    const [removed] = foros.splice(index, 1);
    if(foroEditId && removed && String(removed.id) === String(foroEditId)){
      clearForoForm();
    }
    renderForos();
    syncForosSnapshot();
    notifyForoSucesso('Foro removido.');
  }

  function setForoButtonLabel(mode){
    if(!foroSubmitBtn) return;
    if(mode === 'update'){
      foroSubmitBtn.textContent = 'Atualizar';
      foroSubmitBtn.dataset.mode = 'update';
    } else {
      foroSubmitBtn.textContent = 'Inserir';
      foroSubmitBtn.dataset.mode = 'insert';
    }
  }

  function renderForos(){
    if(!foroListEl) return;
    if(!Array.isArray(foros) || !foros.length){
      foroListEl.classList.add('wdg-placeholder-box');
      foroListEl.innerHTML = foroListEmptyText || 'Nenhum foro cadastrado.';
      return;
    }
    foroListEl.classList.remove('wdg-placeholder-box');
    foroListEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    foros.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'wdg-cessionario-item border rounded p-3 mb-2 d-flex flex-column flex-md-row justify-content-between align-items-start gap-2';
      card.dataset.id = String(entry.id);

      const infoWrap = document.createElement('div');
      infoWrap.className = 'wdg-cessionario-item__info';

      const title = document.createElement('div');
      title.className = 'wdg-cessionario-item__summary';
      title.textContent = entry.vara || 'Vara não informada';
      infoWrap.appendChild(title);

      const details = document.createElement('div');
      details.className = 'small text-muted mt-1';
      details.textContent = formatForoDetails(entry);
      infoWrap.appendChild(details);

      const actions = document.createElement('div');
      actions.className = 'wdg-cessionario-item__actions d-flex gap-3 align-items-center';

      const editBtn = createIconActionButton({
        datasetKey: 'foroAction',
        action: 'edit',
        id: entry.id,
        icon: 'images/editar.png',
        alt: 'Editar foro',
        title: 'Editar foro',
        fallbackClass: 'bi bi-pencil'
      });

      const removeBtn = createIconActionButton({
        datasetKey: 'foroAction',
        action: 'remove',
        id: entry.id,
        icon: 'images/remover.png',
        alt: 'Remover foro',
        title: 'Remover foro',
        fallbackClass: 'bi bi-trash'
      });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      card.appendChild(infoWrap);
      card.appendChild(actions);
      fragment.appendChild(card);
    });
    foroListEl.appendChild(fragment);
  }

  function syncForosSnapshot(){
    if(!snapshot || typeof snapshot !== 'object') return;
    const serialized = serializeForoList(foros);
    snapshot.foros = serialized;
    snapshot.foros_cadastrados = snapshot.foros;
  }

  function normalizeForoItem(raw){
    if(!raw || typeof raw !== 'object') return null;
    const clone = cloneShallow(raw) || raw;
    const estadoSigla = sanitizeText(clone.estado_sigla || clone.estado || clone.uf || clone.unidade_federativa || '').toUpperCase();
    const municipio = sanitizeText(clone.municipio || clone.cidade || clone.localidade || '');
    let vara = sanitizeText(clone.vara || clone.titulo || clone.nome || clone.descricao || '');
    if(!estadoSigla || !municipio) return null;
    if(!vara) vara = `${municipio.toUpperCase()} - VARA`;
    vara = vara.toLocaleUpperCase('pt-BR');
    return {
      id: sanitizeText(clone.id || clone._id || '') || generateForoId(),
      estadoSigla,
      estadoNome: sanitizeText(clone.estado_nome || clone.estadoNome || resolveEstadoNome(estadoSigla)),
      municipio,
      vara
    };
  }

  function serializeForoList(list){
    if(!Array.isArray(list) || !list.length) return [];
    return list.map(serializeForoItem).filter(Boolean);
  }

  function serializeForoItem(item){
    if(!item) return null;
    return {
      id: item.id,
      estado_sigla: item.estadoSigla,
      estado: item.estadoSigla,
      estado_nome: item.estadoNome || resolveEstadoNome(item.estadoSigla),
      municipio: item.municipio,
      vara: item.vara
    };
  }

  function formatForoDetails(entry){
    if(!entry) return '';
    const estadoLabel = entry.estadoSigla ? `${entry.estadoSigla}${entry.estadoNome && entry.estadoNome !== entry.estadoSigla ? ` - ${entry.estadoNome}` : ''}` : '';
    const municipioLabel = entry.municipio ? `${entry.municipio}` : '';
    const comarcaParts = [];
    if(municipioLabel) comarcaParts.push(municipioLabel);
    if(estadoLabel) comarcaParts.push(estadoLabel);
    const comarca = comarcaParts.join(' / ');
    return comarca ? `Comarca: ${comarca}` : '';
  }

  function generateForoId(){
    const random = Math.floor(Math.random() * 1e6);
    return `foro-${Date.now()}-${random}`;
  }

  async function fetchEstadosBrasil(){
    if(Array.isArray(estadosBrasilCache) && estadosBrasilCache.length){
      return estadosBrasilCache;
    }
    try{
      const res = await fetch('/data/estados.json', { cache: 'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      estadosBrasilCache = Array.isArray(data) ? data : [];
    } catch(err){
      estadosBrasilCache = [];
      console.warn('[ceder-uso] falha ao carregar lista de estados', err);
    }
    estadosBrasilMap = new Map();
    estadosBrasilCache.forEach(item => {
      if(item && item.sigla){
        estadosBrasilMap.set(String(item.sigla).toUpperCase(), sanitizeText(item.nome || item.sigla));
      }
    });
    return estadosBrasilCache;
  }

  async function fetchMunicipiosPorUf(){
    if(municipiosPorUfCache) return municipiosPorUfCache;
    if(municipiosPorUfPromise) return municipiosPorUfPromise;
    municipiosPorUfPromise = fetch('/data/municipios_por_uf.json', { cache: 'no-store' })
      .then(res => {
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        municipiosPorUfCache = data && typeof data === 'object' ? data : {};
        return municipiosPorUfCache;
      })
      .catch(err => {
        municipiosPorUfCache = {};
        console.warn('[ceder-uso] falha ao carregar municípios por UF', err);
        return municipiosPorUfCache;
      })
      .finally(() => {
        municipiosPorUfPromise = null;
      });
    return municipiosPorUfPromise;
  }

  function resolveEstadoNome(sigla){
    const uf = sanitizeText(sigla).toUpperCase();
    if(!uf) return '';
    if(estadosBrasilMap && estadosBrasilMap.has(uf)){
      return estadosBrasilMap.get(uf) || uf;
    }
    if(Array.isArray(estadosBrasilCache)){
      const match = estadosBrasilCache.find(item => String(item.sigla).toUpperCase() === uf);
      if(match) return sanitizeText(match.nome || match.sigla);
    }
    return uf;
  }

  function parseBirthValue(value){
    if(!value) return null;
    if(value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const str = String(value).trim();
    if(!str) return null;
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(str)){
      return parseDateBr(str);
    }
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(isoMatch){
      const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(str);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function computeAgeFromDate(date){
    if(!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    const monthDiff = now.getMonth() - date.getMonth();
    if(monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())){
      age -= 1;
    }
    return age;
  }

  function isAdultMorador(morador){
    if(!morador) return false;
    const birth = parseBirthValue(morador.data_nascimento || morador.dataNascimento || morador.nascimento);
    if(!birth) return false;
    const age = computeAgeFromDate(birth);
    return age !== null && age >= 18;
  }

  function computeHabitacaoDescriptors(habitacao){
    if(!habitacao || typeof habitacao !== 'object') return null;
    const blocoRaw = (habitacao.bloco && (habitacao.bloco.nome || habitacao.bloco.label)) || habitacao.bloco_nome || habitacao.bloco;
    const andarRawBase = (habitacao.andar && (habitacao.andar.nome || habitacao.andar.label)) || habitacao.andar_nome || habitacao.andar;
    const tipoRaw = habitacao.tipo || habitacao.categoria || '';
    let numeroRaw = habitacao.numero || habitacao.identificador || habitacao.label || '';

    const bloco = sanitizeLabelValue(blocoRaw);
    const andarSanitized = sanitizeText(andarRawBase);
    const andarBase = andarSanitized.replace(/\b(andar|pavimento|piso)$/i, '').trim();
    const andar = sanitizeLabelValue(andarBase || andarSanitized);

    const tipoSanitized = sanitizeText(tipoRaw);
    const tipo = tipoSanitized ? sanitizeLabelValue(tipoSanitized) : '';

    let numero = '';
    if(numeroRaw){
      numeroRaw = sanitizeText(numeroRaw).replace(/^#+/, '').replace(/^n[ºo\.\-\s]*/i, '');
      numero = sanitizeLabelValue(numeroRaw);
    }

    return { bloco, andar, tipo, numero };
  }

  function buildHabitacaoLabel(habitacao){
    if(!habitacao || typeof habitacao !== 'object') return 'Habitação';
    const descritores = computeHabitacaoDescriptors(habitacao);
    if(descritores){
      const parts = [descritores.bloco, descritores.andar, descritores.tipo, descritores.numero].filter(Boolean);
      if(parts.length) return parts.join(' - ');
    }
    if(habitacao.unidade && habitacao.unidade.nome){
      return `${sanitizeText(habitacao.unidade.nome)} - ${String(habitacao._id || '').slice(-6)}`;
    }
    return `Habitação ${String(habitacao._id || habitacao.id || '').slice(-6)}`;
  }

  function buildHabitacaoComplement(habitacao){
    const descritores = computeHabitacaoDescriptors(habitacao);
    if(!descritores) return '';
    return [descritores.bloco, descritores.andar, descritores.tipo, descritores.numero]
      .filter(Boolean)
      .join(' - ');
  }

  function buildEnderecoComHabitacao(baseEndereco, habitacao){
    const base = stripCodigoIbgeEndereco(baseEndereco);
    const complemento = buildHabitacaoComplement(habitacao);
    if(base && complemento) return `${base} - ${complemento}`;
    return base || complemento;
  }

  function buildMoradorLabel(morador){
    if(!morador) return 'Morador';
    const nome = sanitizeText(morador.nome || morador.label || 'Morador');
    const suffix = morador.inquilino ? ' (Inquilino)' : '';
    return nome + suffix;
  }

  function resolveSexoFlexions(value){
    const normalized = normalizeSexoValue(value);
    if(normalized === 'M'){
      return { nascido: 'nascido', filho: 'filho', portador: 'portador', inscrito: 'inscrito' };
    }
    if(normalized === 'F'){
      return { nascido: 'nascida', filho: 'filha', portador: 'portadora', inscrito: 'inscrita' };
    }
    return { nascido: 'nascido(a)', filho: 'filho(a)', portador: 'portador(a)', inscrito: 'inscrito(a)' };
  }

  function formatDescriptor(value){
    const text = sanitizeText(value);
    if(!text) return 'não informado';
    return text.toLocaleLowerCase('pt-BR');
  }

  function buildPessoaSummary(entry){
    if(!entry) return 'Dados não informados.';
    const termos = resolveSexoFlexions(entry.sexo || (entry.dados && entry.dados.sexo));
    const nome = sanitizeText(entry.nome || entry.morador_nome || entry.colaborador_nome || 'Participante');
    const nacionalidade = formatDescriptor(entry.nacionalidade_label || entry.nacionalidade);
    const profissao = formatDescriptor(entry.profissao);
    const nascimentoBr = sanitizeText(entry.data_nascimento_br) || (entry.data_nascimento ? formatIsoToBr(entry.data_nascimento) : '');
    const nascimentoSegment = nascimentoBr || 'não informado';
    const mae = sanitizeText(entry.mae);
    const pai = sanitizeText(entry.pai);
    let parentescoSegment;
    if(mae && pai){
      parentescoSegment = `${termos.filho} de ${mae} e ${pai}`;
    } else if(mae){
      parentescoSegment = `${termos.filho} de ${mae}`;
    } else if(pai){
      parentescoSegment = `${termos.filho} de ${pai}`;
    } else {
      parentescoSegment = `${termos.filho} de genitores não informados`;
    }
    const rg = sanitizeText(entry.rg) || 'não informado';
    const cpfFormatado = sanitizeText(entry.cpf_formatado || (entry.cpf ? formatCpf(entry.cpf) : '')) || 'não informado';
    const enderecoLimpo = stripCodigoIbgeEndereco(entry.endereco || '') || '';
    const enderecoSegment = enderecoLimpo ? `na ${enderecoLimpo}` : 'em endereço não informado';
    let telefone = sanitizeText(entry.telefone_formatado)
      || formatTelefone(entry.telefone)
      || formatTelefone(entry.telefone_digits);
    if(telefone && entry.whatsapp){
      telefone = `${telefone} (WhatsApp)`;
    }
    const telefoneSegment = telefone || 'não informado';
    const emailSegment = sanitizeText(entry.email) || 'não informado';
    return `${nome}, ${nacionalidade}, ${profissao}, ${termos.nascido} em ${nascimentoSegment}, ${parentescoSegment}, ${termos.portador} do RG ${rg}, ${termos.inscrito} no CPF sob o nº ${cpfFormatado}, residente ${enderecoSegment}, telefone: ${telefoneSegment}, e-mail: ${emailSegment}.`;
  }

  function updateResumoArea(area){
    const unidade = sanitizeText(resolveUnidade(area)) || 'Não informado';
    const areaNome = sanitizeText(resolveAreaNome(area)) || 'Não informada';
    const capacidade = sanitizeText(resolveCapacidade(area));
    const unidadeLabel = unidade;
    const areaLabel = capacidade ? `${areaNome} - Capacidade: ${capacidade}` : areaNome;
    resumoUnidadeEls.forEach(el => { el.textContent = unidadeLabel; });
    resumoAreaEls.forEach(el => { el.textContent = areaLabel; });
  }

  function bindReservaActions(){
    if(reservasBound) return;
    if(!reservaForm || !reservaListEl || !addReservaBtn) return;
    reservasBound = true;
    addReservaBtn.addEventListener('click', handleAdicionarReserva);
    reservaListEl.addEventListener('click', handleReservaListClick);
  }

  function handleAdicionarReserva(){
    const payload = collectReservaInputs(reservaEditId);
    if(!payload) return;
    const { entry, repeats, skipped } = payload;
    const isEditing = Boolean(reservaEditId);
    if(isEditing){
      const idx = reservas.findIndex(item => String(item.id) === String(reservaEditId));
      if(idx >= 0){
        reservas[idx] = entry;
      } else {
        reservas.push(entry);
      }
    } else {
      reservas.push(entry);
    }
    if(Array.isArray(repeats) && repeats.length){
      repeats.forEach(item => { reservas.push(item); });
      reservaPage = Math.max(0, Math.ceil(reservas.length / RESERVA_PAGE_SIZE) - 1);
    } else if(!isEditing){
      reservaPage = Math.max(0, Math.ceil(reservas.length / RESERVA_PAGE_SIZE) - 1);
    }
    sortReservasByInicio();
    if(Array.isArray(repeats) && repeats.length){
      const lastRepeat = repeats[repeats.length - 1];
      const lastIndex = reservas.findIndex(item => String(item.id) === String(lastRepeat.id));
      if(lastIndex >= 0){
        reservaPage = Math.floor(lastIndex / RESERVA_PAGE_SIZE);
      }
    } else {
      const primaryIndex = reservas.findIndex(item => String(item.id) === String(entry.id));
      if(primaryIndex >= 0){
        reservaPage = Math.floor(primaryIndex / RESERVA_PAGE_SIZE);
      }
    }
    ensureReservaPageRange();
    snapshot = snapshot || {};
    snapshot.reservas = reservas.map(item => ({ ...item }));
    renderReservas();
    clearReservaForm();
    resetReservaScroll();
    if(skipped && skipped.length){
      if(window.WDG && window.WDG.notification && typeof window.WDG.notification.info === 'function'){
        window.WDG.notification.info(`Algumas datas foram ignoradas por já possuírem períodos cadastrados: ${skipped.join(', ')}.`);
      } else {
        console.info('[ceder-uso] datas ignoradas por já estarem cadastradas:', skipped);
      }
    }
  }

  function generateReservaId(){
    const random = Math.floor(Math.random() * 1e6);
    return `reserva-${Date.now()}-${random}`;
  }

  function normalizeReservaItem(item){
    if(!item || typeof item !== 'object'){
      return {
        id: generateReservaId(),
        dataInicial: '',
        horaInicial: '',
        dataFinal: '',
        horaFinal: ''
      };
    }
    const clone = { ...item };
    if(clone.id === undefined || clone.id === null || clone.id === ''){
      clone.id = generateReservaId();
    } else {
      clone.id = String(clone.id);
    }
    clone.dataInicial = sanitizeText(clone.dataInicial);
    clone.horaInicial = sanitizeText(clone.horaInicial);
    clone.dataFinal = sanitizeText(clone.dataFinal) || clone.dataInicial;
    clone.horaFinal = sanitizeText(clone.horaFinal);
    if(!clone.inicioISO){
      const baseInicio = parseDateBr(clone.dataInicial);
      const inicioDate = combineDateTime(baseInicio, clone.horaInicial);
      if(inicioDate) clone.inicioISO = inicioDate.toISOString();
    }
    if(!clone.fimISO){
      const baseFim = parseDateBr(clone.dataFinal) || parseDateBr(clone.dataInicial);
      const fimDate = combineDateTime(baseFim, clone.horaFinal);
      if(fimDate) clone.fimISO = fimDate.toISOString();
    }
    return clone;
  }

  function collectReservaInputs(currentId){
    if(!reservaInputs.dataInicial || !reservaInputs.horaInicial || !reservaInputs.horaFinal){
      return null;
    }
    clearReservaValidation();
    const raw = {
      dataInicial: sanitizeText(reservaInputs.dataInicial.value),
      horaInicial: sanitizeText(reservaInputs.horaInicial.value),
      horaFinal: sanitizeText(reservaInputs.horaFinal.value)
    };
    const missing = Object.entries(raw).filter(([, value]) => !value);
    if(missing.length){
      missing.forEach(([key]) => markReservaInvalid(reservaInputs[key]));
      notifyReservaErro('Preencha a data e os horários para inserir o período.');
      return null;
    }
    const inicioData = parseDateBr(raw.dataInicial);
    if(!inicioData){
      markReservaInvalid(reservaInputs.dataInicial);
      notifyReservaErro('Informe datas válidas no formato DD/MM/AAAA.');
      return null;
    }
    const inicioDateTime = combineDateTime(inicioData, raw.horaInicial);
    const fimDateTime = combineDateTime(inicioData, raw.horaFinal);
    if(!inicioDateTime || !fimDateTime){
      if(!inicioDateTime) markReservaInvalid(reservaInputs.horaInicial);
      if(!fimDateTime) markReservaInvalid(reservaInputs.horaFinal);
      notifyReservaErro('Informe horários válidos no formato HH:MM.');
      return null;
    }
    if(fimDateTime.getTime() <= inicioDateTime.getTime()){
      markReservaInvalid(reservaInputs.horaFinal);
      notifyReservaErro('A hora final deve ser posterior à hora inicial.');
      return null;
    }
    const areaValidation = validateReservaAgainstArea(inicioDateTime, fimDateTime);
    if(!areaValidation.ok){
      notifyReservaErro(areaValidation.message);
      return null;
    }
    const sanitizedInicial = formatDateBr(inicioDateTime);
    const sanitizedFinal = sanitizedInicial;
    const baseEntry = {
      id: currentId ? String(currentId) : generateReservaId(),
      dataInicial: sanitizedInicial,
      horaInicial: raw.horaInicial,
      dataFinal: sanitizedFinal,
      horaFinal: raw.horaFinal,
      inicioISO: inicioDateTime.toISOString(),
      fimISO: fimDateTime.toISOString()
    };
    const repeatRaw = reservaInputs.repeatDates ? reservaInputs.repeatDates.value : '';
    const repeatSource = repeatDatesSelected && repeatDatesSelected.size ? repeatDatesSelected : repeatRaw;
    const repeatSummary = buildRepeatReservations(repeatSource, inicioDateTime, fimDateTime, raw, currentId);
    if(repeatSummary && repeatSummary.ok === false){
      notifyReservaErro(repeatSummary.message);
      return null;
    }
    return {
      entry: baseEntry,
      repeats: repeatSummary ? repeatSummary.items : [],
      skipped: repeatSummary ? repeatSummary.skipped : []
    };
  }

  function handleReservaListClick(event){
    const actionBtn = event.target.closest('[data-reserva-action]');
    if(actionBtn){
      event.preventDefault();
      const action = actionBtn.dataset.reservaAction;
      const id = actionBtn.dataset.id;
      if(!id) return;
      if(action === 'edit'){
        startReservaEdit(id);
      } else if(action === 'remove'){
        removeReserva(id);
      }
      return;
    }
    const pageBtn = event.target.closest('[data-reserva-page]');
    if(pageBtn){
      event.preventDefault();
      changeReservaPage(pageBtn.dataset.reservaPage);
    }
  }

  function startReservaEdit(id){
    const target = reservas.find(item => String(item.id) === String(id));
    if(!target) return;
    reservaEditId = String(target.id);
    populateReservaForm(target);
    setReservaButtonLabel('edit');
  }

  function populateReservaForm(reserva){
    if(!reserva) return;
    if(reservaInputs.dataInicial) reservaInputs.dataInicial.value = reserva.dataInicial || '';
    if(reservaInputs.horaInicial) reservaInputs.horaInicial.value = reserva.horaInicial || '';
    if(reservaInputs.horaFinal) reservaInputs.horaFinal.value = reserva.horaFinal || '';
    if(reservaInputs.repeatDates) reservaInputs.repeatDates.value = '';
    clearReservaValidation();
    if(reservaInputs.dataInicial){
      reservaInputs.dataInicial.dispatchEvent(new Event('input', { bubbles: true }));
      reservaInputs.dataInicial.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function removeReserva(id){
    const targetId = String(id);
    const idx = reservas.findIndex(item => String(item.id) === targetId);
    if(idx === -1) return;
    reservas.splice(idx, 1);
    snapshot = snapshot || {};
    snapshot.reservas = reservas.map(item => ({ ...item }));
    if(reservaEditId && String(reservaEditId) === targetId){
      clearReservaForm();
    }
    ensureReservaPageRange();
    renderReservas();
    resetReservaScroll();
  }

  function changeReservaPage(target){
    if(!target) return;
    const totalPages = ensureReservaPageRange();
    let newPage = reservaPage;
    switch(target){
      case 'first':
        newPage = 0;
        break;
      case 'prev':
        newPage = Math.max(0, reservaPage - 1);
        break;
      case 'next':
        newPage = Math.min(totalPages - 1, reservaPage + 1);
        break;
      case 'last':
        newPage = Math.max(0, totalPages - 1);
        break;
      default: {
        const numeric = Number(target);
        if(Number.isFinite(numeric)){
          newPage = Math.min(totalPages - 1, Math.max(0, Math.floor(numeric)));
        }
        break;
      }
    }
    if(newPage === reservaPage) return;
    reservaPage = newPage;
    renderReservas();
    resetReservaScroll();
  }

  function ensureReservaPageRange(){
    if(!Array.isArray(reservas) || !reservas.length){
      reservaPage = 0;
      return 1;
    }
    const totalPages = Math.max(1, Math.ceil(reservas.length / Math.max(1, RESERVA_PAGE_SIZE)));
    if(reservaPage >= totalPages) reservaPage = totalPages - 1;
    if(reservaPage < 0) reservaPage = 0;
    return totalPages;
  }

  function resetReservaScroll(){
    if(!reservaListEl) return;
    const scrollWrap = reservaListEl.querySelector('.wdg-reserva-periodo__scroll');
    if(scrollWrap) scrollWrap.scrollTop = 0;
  }

  function clearReservaValidation(){
    Object.values(reservaInputs).forEach(input => {
      if(!input) return;
      input.classList.remove('is-invalid');
    });
  }

  function markReservaInvalid(input){
    if(!input) return;
    input.classList.add('is-invalid');
  }

  function combineDateTime(date, timeStr){
    if(!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    if(typeof timeStr !== 'string') return null;
    const parts = timeStr.split(':');
    if(parts.length < 2) return null;
    const horas = Number(parts[0]);
    const minutos = Number(parts[1]);
    if(!Number.isInteger(horas) || horas < 0 || horas > 23) return null;
    if(!Number.isInteger(minutos) || minutos < 0 || minutos > 59) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), horas, minutos, 0, 0);
  }

  function notifyReservaErro(message){
    if(window.WDG && window.WDG.notification && typeof window.WDG.notification.danger === 'function'){
      window.WDG.notification.danger(message);
    } else {
      window.alert(message);
    }
  }

  function renderReservas(){
    if(!reservaListEl) return;
    const totalPages = ensureReservaPageRange();
    const hasItems = reservas.length > 0;
    const hasPagination = totalPages > 1;
    const effectivePageSize = Math.max(1, RESERVA_PAGE_SIZE);
    const shouldScroll = !hasPagination && reservas.length > effectivePageSize;
    reservaListEl.classList.toggle('has-items', hasItems);
    reservaListEl.classList.toggle('is-scrollable', shouldScroll);
    reservaListEl.classList.toggle('is-empty', !hasItems);
    reservaListEl.classList.add('is-paginated');
    reservaListEl.innerHTML = '';
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'wdg-reserva-periodo__scroll';
    if(!hasItems){
      scrollWrap.classList.add('wdg-reserva-periodo__scroll--empty');
    }

    if(hasItems){
      const startIndex = reservaPage * effectivePageSize;
      const visibleItems = hasPagination
        ? reservas.slice(startIndex, startIndex + effectivePageSize)
        : reservas;
      visibleItems.forEach(item => {
        const entry = document.createElement('div');
        entry.className = 'wdg-reserva-periodo__item';
        entry.dataset.id = String(item.id);
        const text = document.createElement('span');
        text.className = 'wdg-reserva-periodo__text';
        text.textContent = formatReservaPeriodo(item);
        entry.appendChild(text);

        const buttons = document.createElement('div');
        buttons.className = 'wdg-reserva-periodo__buttons';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'wdg-icon-btn wdg-reserva-periodo__icon';
        editBtn.dataset.reservaAction = 'edit';
        editBtn.dataset.id = String(item.id);
        editBtn.title = 'Editar período';
        editBtn.setAttribute('aria-label', 'Editar período');
        const editImg = document.createElement('img');
        editImg.src = buildReservaAssetPath('images/editar.png');
        editImg.alt = 'Editar período';
        editImg.width = 24;
        editImg.height = 24;
        editImg.decoding = 'async';
        editImg.loading = 'lazy';
        attachIconFallback(editImg, 'bi bi-pencil');
        editBtn.appendChild(editImg);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'wdg-icon-btn wdg-reserva-periodo__icon wdg-reserva-periodo__icon--remove';
        removeBtn.dataset.reservaAction = 'remove';
        removeBtn.dataset.id = String(item.id);
        removeBtn.title = 'Remover período';
        removeBtn.setAttribute('aria-label', 'Remover período');
        const removeImg = document.createElement('img');
        removeImg.src = buildReservaAssetPath('images/remover.png');
        removeImg.alt = 'Remover período';
        removeImg.width = 24;
        removeImg.height = 24;
        removeImg.decoding = 'async';
        removeImg.loading = 'lazy';
        attachIconFallback(removeImg, 'bi bi-trash');
        removeBtn.appendChild(removeImg);

        buttons.appendChild(editBtn);
        buttons.appendChild(removeBtn);
        entry.appendChild(buttons);
        scrollWrap.appendChild(entry);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'wdg-reserva-periodo__empty';
      empty.textContent = 'Nenhum registro cadastrado.';
      scrollWrap.appendChild(empty);
    }

    reservaListEl.appendChild(scrollWrap);

    const pager = document.createElement('div');
    pager.className = 'wdg-pager wdg-reserva-periodo__pager';

    const makeButton = (label, value, disabled) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.className = 'wdg-reserva-periodo__page-btn';
      btn.disabled = !hasItems || !!disabled;
      btn.dataset.reservaPage = String(value);
      return btn;
    };

    const makeEllipsis = () => {
      const span = document.createElement('span');
      span.className = 'wdg-reserva-periodo__pager-ellipsis';
      span.textContent = '...';
      return span;
    };

    pager.appendChild(makeButton('<<', 'first', reservaPage === 0));
    pager.appendChild(makeButton('<', 'prev', reservaPage === 0));

    let start = Math.max(0, reservaPage - 2);
    let end = Math.min(totalPages - 1, start + 4);
    if(end - start < 4) start = Math.max(0, end - 4);

    if(start > 0){
      const firstBtn = makeButton('1', 0, false);
      if(reservaPage === 0) firstBtn.classList.add('active');
      pager.appendChild(firstBtn);
      if(start > 1){
        pager.appendChild(makeEllipsis());
      }
    }

    for(let pageIdx = start; pageIdx <= end; pageIdx += 1){
      const btn = makeButton(String(pageIdx + 1), pageIdx, false);
      if(pageIdx === reservaPage) btn.classList.add('active');
      pager.appendChild(btn);
    }

    if(end < totalPages - 1){
      if(end < totalPages - 2){
        pager.appendChild(makeEllipsis());
      }
      const lastBtn = makeButton(String(totalPages), totalPages - 1, false);
      if(reservaPage === totalPages - 1) lastBtn.classList.add('active');
      pager.appendChild(lastBtn);
    }

    pager.appendChild(makeButton('>', 'next', reservaPage >= totalPages - 1));
    pager.appendChild(makeButton('>>', 'last', reservaPage >= totalPages - 1));

    const totalInfo = document.createElement('div');
    totalInfo.className = 'wdg-reserva-periodo__total';
    const totalLabel = reservas.length === 1 ? 'período' : 'períodos';
    totalInfo.textContent = `Total: ${reservas.length} ${totalLabel}`;

    const footer = document.createElement('div');
    footer.className = 'wdg-reserva-periodo__footer';
    footer.appendChild(pager);
    footer.appendChild(totalInfo);
    reservaListEl.appendChild(footer);
  }

  function buildReservaAssetPath(relativePath){
    const base = (reservaListEl && reservaListEl.dataset.basePath) || '';
    const cleanBase = base && base.endsWith('/') ? base.slice(0, -1) : base;
    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    if(cleanBase) return `${cleanBase}/${cleanPath}`;
    return `/${cleanPath}`;
  }

  function buildStaticAssetPath(relativePath){
    if(typeof relativePath !== 'string' || !relativePath) return '';
    const trimmed = relativePath.trim();
    if(!trimmed) return '';
    if(/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')){
      return trimmed;
    }
    const cleanPath = trimmed.replace(/^\/+/, '');
    const base = typeof BASE_PATH === 'string' ? BASE_PATH : '';
    const normalizedBase = base ? base.replace(/\/$/, '') : '';
    if(!normalizedBase){
      return `/${cleanPath}`;
    }
    const baseNoSlash = normalizedBase.replace(/^\//, '');
    if(cleanPath.toLowerCase().startsWith(`${baseNoSlash.toLowerCase()}/`)){
      return `/${cleanPath}`;
    }
    return `${normalizedBase}/${cleanPath}`;
  }

  function ensureMateriaisPagerObject(){
    if(!materiaisState.pager){
      materiaisState.pager = {
        disponiveis: 0,
        extraidos: 0,
        cessao: 0
      };
    }
  }

  function resetMateriaisPagination(){
    ensureMateriaisPagerObject();
    materiaisState.pager.disponiveis = 0;
    materiaisState.pager.extraidos = 0;
    materiaisState.pager.cessao = 0;
  }

  function ensureMateriaisPage(section, totalItems){
    ensureMateriaisPagerObject();
    if(totalItems <= 0){
      materiaisState.pager[section] = 0;
      return 0;
    }
    const totalPages = Math.ceil(totalItems / MATERIALS_PAGE_SIZE);
    const maxPage = Math.max(0, totalPages - 1);
    const current = Number.isInteger(materiaisState.pager[section]) ? materiaisState.pager[section] : 0;
    const safe = Math.min(Math.max(0, current), maxPage);
    materiaisState.pager[section] = safe;
    return safe;
  }

  function setMateriaisPage(section, page){
    ensureMateriaisPagerObject();
    materiaisState.pager[section] = Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0);
  }

  function resolveMateriaisTotals(section){
    const list = Array.isArray(materiaisState[section]) ? materiaisState[section] : [];
    const total = list.length;
    const totalPages = total > 0 ? Math.ceil(total / MATERIALS_PAGE_SIZE) : 0;
    const currentPage = ensureMateriaisPage(section, total);
    return { list, total, totalPages, currentPage };
  }

  function createMateriaisPagerFooter(section, totalItems, currentPage){
    if(totalItems <= MATERIALS_PAGE_SIZE) return null;
    const totalPages = Math.ceil(totalItems / MATERIALS_PAGE_SIZE);
    if(totalPages <= 1) return null;

    const footer = document.createElement('div');
    footer.className = 'wdg-material-footer';

    const pager = document.createElement('div');
    pager.className = 'wdg-pager wdg-material-pager';

    const makeButton = (label, value, disabled) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.className = 'wdg-material-pager__btn';
      btn.disabled = !!disabled;
      btn.dataset.materialSection = section;
      btn.dataset.materialPage = String(value);
      return btn;
    };

    const makeEllipsis = () => {
      const span = document.createElement('span');
      span.className = 'wdg-material-pager__ellipsis';
      span.textContent = '...';
      return span;
    };

    pager.appendChild(makeButton('<<', 'first', currentPage === 0));
    pager.appendChild(makeButton('<', 'prev', currentPage === 0));

    let start = Math.max(0, currentPage - 2);
    let end = Math.min(totalPages - 1, start + 4);
    if(end - start < 4) start = Math.max(0, end - 4);

    if(start > 0){
      const firstBtn = makeButton('1', 0, false);
      if(currentPage === 0) firstBtn.classList.add('active');
      pager.appendChild(firstBtn);
      if(start > 1){
        pager.appendChild(makeEllipsis());
      }
    }

    for(let pageIdx = start; pageIdx <= end; pageIdx += 1){
      const btn = makeButton(String(pageIdx + 1), pageIdx, false);
      if(pageIdx === currentPage) btn.classList.add('active');
      pager.appendChild(btn);
    }

    if(end < totalPages - 1){
      if(end < totalPages - 2){
        pager.appendChild(makeEllipsis());
      }
      const lastBtn = makeButton(String(totalPages), totalPages - 1, false);
      if(currentPage === totalPages - 1) lastBtn.classList.add('active');
      pager.appendChild(lastBtn);
    }

    pager.appendChild(makeButton('>', 'next', currentPage >= totalPages - 1));
    pager.appendChild(makeButton('>>', 'last', currentPage >= totalPages - 1));

    const totalInfo = document.createElement('div');
    totalInfo.className = 'wdg-material-total';
    const label = totalItems === 1 ? 'material' : 'materiais';
    totalInfo.textContent = `Total: ${totalItems} ${label}`;

    footer.appendChild(pager);
    footer.appendChild(totalInfo);
    return footer;
  }

  function handleMateriaisPagerButton(button){
    if(!button) return;
    const section = button.dataset.materialSection;
    if(!section) return;
    const { totalPages, currentPage } = resolveMateriaisTotals(section);
    if(totalPages <= 1) return;
    const action = button.dataset.materialPage;
    let nextPage = currentPage;
    if(action === 'first') nextPage = 0;
    else if(action === 'prev') nextPage = Math.max(0, currentPage - 1);
    else if(action === 'next') nextPage = Math.min(totalPages - 1, currentPage + 1);
    else if(action === 'last') nextPage = totalPages - 1;
    else {
      const numeric = Number(action);
      if(Number.isInteger(numeric)){
        nextPage = Math.min(Math.max(0, numeric), totalPages - 1);
      }
    }
    if(nextPage === currentPage) return;
    setMateriaisPage(section, nextPage);
    renderMateriais();
  }

  function maybeHandleMateriaisPagerEvent(event){
    const button = event && event.target ? event.target.closest('[data-material-page]') : null;
    if(!button) return false;
    event.preventDefault();
    handleMateriaisPagerButton(button);
    return true;
  }

  function attachIconFallback(imgEl, iconClass){
    if(!imgEl) return;
    imgEl.addEventListener('error', () => {
      const fallback = document.createElement('i');
      fallback.className = iconClass;
      imgEl.replaceWith(fallback);
    }, { once: true });
  }

  function createIconActionButton(options){
    const {
      datasetKey,
      action,
      id,
      icon,
      alt,
      title,
      extraClass,
      fallbackClass
    } = options || {};
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wdg-icon-btn';
    if(extraClass) btn.classList.add(extraClass);
    if(datasetKey && action !== undefined){
      btn.dataset[datasetKey] = action;
    }
    if(id !== undefined){
      btn.dataset.id = String(id);
    }
    if(title){
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
    const img = document.createElement('img');
    const assetPath = icon ? buildStaticAssetPath(icon) : '';
    if(assetPath) img.src = assetPath;
    img.alt = alt || title || String(action || '');
    img.width = 24;
    img.height = 24;
    img.decoding = 'async';
    img.loading = 'lazy';
    attachIconFallback(img, fallbackClass || 'bi');
    btn.appendChild(img);
    return btn;
  }

  function formatReservaPeriodo(reserva){
    const dataInicial = sanitizeText(reserva.dataInicial);
    const dataFinal = sanitizeText(reserva.dataFinal) || dataInicial;
    const horaInicial = sanitizeText(reserva.horaInicial);
    const horaFinal = sanitizeText(reserva.horaFinal);
    if(dataInicial && dataFinal && dataInicial === dataFinal){
      return `${dataInicial} · ${horaInicial} às ${horaFinal}`;
    }
    const inicio = `${dataInicial} ${horaInicial}`.trim();
    const fim = `${dataFinal} ${horaFinal}`.trim();
    return `De ${inicio} até ${fim}`;
  }

  function clearReservaForm(){
    if(!reservaForm) return;
    reservaForm.reset();
    reservaEditId = null;
    setReservaButtonLabel('insert');
    clearReservaValidation();
    if(reservaInputs.dataInicial){
      reservaInputs.dataInicial.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if(reservaInputs.repeatDates){
      reservaInputs.repeatDates.value = '';
    }
    resetRepeatDates();
  }

  function setReservaButtonLabel(mode){
    if(!addReservaBtn) return;
    if(mode === 'edit'){
      addReservaBtn.textContent = 'Atualizar';
      addReservaBtn.dataset.mode = 'edit';
      addReservaBtn.classList.add('btn-primary');
      addReservaBtn.classList.remove('btn-outline-primary');
    } else {
      addReservaBtn.textContent = 'Inserir';
      addReservaBtn.dataset.mode = 'insert';
      addReservaBtn.classList.add('btn-outline-primary');
      addReservaBtn.classList.remove('btn-primary');
    }
  }

  function notifyCessionarioErro(message){
    if(window.WDG && window.WDG.notification && typeof window.WDG.notification.danger === 'function'){
      window.WDG.notification.danger(message);
    } else {
      window.alert(message);
    }
  }

  function notifyCessionarioSucesso(message){
    if(window.WDG && window.WDG.notification && typeof window.WDG.notification.success === 'function'){
      window.WDG.notification.success(message);
    } else {
      console.info('[ceder-uso] cessionario:', message);
    }
  }

  function notifyPrepostoErro(message){
    if(window.WDG && window.WDG.notification && typeof window.WDG.notification.danger === 'function'){
      window.WDG.notification.danger(message);
    } else {
      window.alert(message);
    }
  }

  function notifyPrepostoSucesso(message){
    if(window.WDG && window.WDG.notification && typeof window.WDG.notification.success === 'function'){
      window.WDG.notification.success(message);
    } else {
      console.info('[ceder-uso] preposto:', message);
    }
  }

  function markCessionarioInvalid(input){
    if(!input) return;
    input.classList.add('is-invalid');
  }

  function clearCessionarioValidation(){
    if(!cessionarioForm) return;
    Array.from(cessionarioForm.querySelectorAll('.is-invalid')).forEach(el => el.classList.remove('is-invalid'));
  }

  function clearPrepostoValidation(){
    if(!prepostoForm) return;
    Array.from(prepostoForm.querySelectorAll('.is-invalid')).forEach(el => el.classList.remove('is-invalid'));
  }

  function setCessionarioButtonLabel(mode){
    if(!addCessionarioBtn) return;
    if(mode === 'update'){
      addCessionarioBtn.textContent = 'Atualizar';
      addCessionarioBtn.dataset.mode = 'update';
      addCessionarioBtn.classList.add('btn-primary');
      addCessionarioBtn.classList.remove('btn-outline-primary');
    } else {
      addCessionarioBtn.textContent = 'Inserir';
      addCessionarioBtn.dataset.mode = 'insert';
      addCessionarioBtn.classList.add('btn-primary');
      addCessionarioBtn.classList.remove('btn-outline-primary');
    }
  }

  function toggleCessionarioCancel(show){
    if(!cessionarioCancelBtn) return;
    cessionarioCancelBtn.hidden = !show;
  }

  function setPrepostoButtonLabel(mode){
    if(!addPrepostoBtn) return;
    if(mode === 'update'){
      addPrepostoBtn.textContent = 'Atualizar';
      addPrepostoBtn.dataset.mode = 'update';
      addPrepostoBtn.classList.add('btn-primary');
      addPrepostoBtn.classList.remove('btn-outline-primary');
    } else {
      addPrepostoBtn.textContent = 'Inserir';
      addPrepostoBtn.dataset.mode = 'insert';
      addPrepostoBtn.classList.add('btn-primary');
      addPrepostoBtn.classList.remove('btn-outline-primary');
    }
  }

  function togglePrepostoCancel(show){
    if(!prepostoCancelBtn) return;
    prepostoCancelBtn.hidden = !show;
  }

  function updateCessionarioInsertAvailability(){
    if(!addCessionarioBtn) return;
    const atLimit = cessionarios.length >= 1;
    const editing = Boolean(cessionarioEditId);
    const shouldDisable = atLimit && !editing;
    addCessionarioBtn.disabled = shouldDisable;
    if(shouldDisable){
      addCessionarioBtn.title = 'Já existe um cessionário cadastrado. Edite ou remova o registro antes de adicionar outro.';
    } else {
      addCessionarioBtn.removeAttribute('title');
    }
  }

  function updatePrepostoInsertAvailability(){
    if(!addPrepostoBtn) return;
    const atLimit = prepostos.length >= 1;
    const editing = Boolean(prepostoEditId);
    const shouldDisable = atLimit && !editing;
    addPrepostoBtn.disabled = shouldDisable;
    if(shouldDisable){
      addPrepostoBtn.title = 'Já existe um preposto cadastrado. Edite ou remova o registro antes de adicionar outro.';
    } else {
      addPrepostoBtn.removeAttribute('title');
    }
  }

  function clearCessionarioForm(options){
    if(!cessionarioForm) return;
    const keepHab = !!(options && options.keepHab);
    const keepMorador = !!(options && options.keepMorador);
    const keepEndereco = !!(options && options.keepEndereco);
    if(cessionarioFields.habitacao && !keepHab){
      cessionarioFields.habitacao.value = '';
    }
    const currentHabId = keepHab && cessionarioFields.habitacao ? cessionarioFields.habitacao.value : '';
    updateMoradorOptionsForHabitacao(currentHabId, { includeAll: keepMorador, selected: keepMorador && cessionarioFields.morador ? cessionarioFields.morador.value : '' });
    if(cessionarioFields.morador && !keepMorador){
      cessionarioFields.morador.value = '';
    }
    if(cessionarioFields.nome) cessionarioFields.nome.value = '';
    if(cessionarioFields.cpf){
      cessionarioFields.cpf.value = '';
      if(cessionarioFields.cpf.dataset) cessionarioFields.cpf.dataset.digits = '';
    }
    if(cessionarioFields.nascimento){
      cessionarioFields.nascimento.value = '';
      if(cessionarioFields.nascimento.dataset) cessionarioFields.nascimento.dataset.iso = '';
    }
    if(cessionarioFields.sexo) cessionarioFields.sexo.value = '';
    if(cessionarioFields.rg) cessionarioFields.rg.value = '';
    if(cessionarioFields.pai) cessionarioFields.pai.value = '';
    if(cessionarioFields.mae) cessionarioFields.mae.value = '';
    if(cessionarioFields.profissao) cessionarioFields.profissao.value = '';
    if(cessionarioFields.estadoCivil) cessionarioFields.estadoCivil.value = '';
    if(cessionarioFields.nacionalidade) cessionarioFields.nacionalidade.value = '';
    if(cessionarioFields.endereco){
      if(keepEndereco){
        cessionarioFields.endereco.value = stripCodigoIbgeEndereco(cessionarioFields.endereco.value);
      } else {
        cessionarioFields.endereco.value = '';
      }
    }
    if(cessionarioFields.email) cessionarioFields.email.value = '';
    if(cessionarioFields.telefone) setTelefoneFieldValue(cessionarioFields.telefone, '', { skipIfEmpty: false });
    if(cessionarioFields.whatsapp) cessionarioFields.whatsapp.checked = false;
    cessionarioEditId = null;
    clearCessionarioValidation();
    setCessionarioButtonLabel('insert');
    toggleCessionarioCancel(false);
    updateCessionarioInsertAvailability();
  }

  function clearPrepostoForm(options){
    if(!prepostoForm) return;
    const keepColaborador = !!(options && options.keepColaborador);
    const keepEndereco = !!(options && options.keepEndereco);
    if(prepostoFields.colaborador && !keepColaborador){
      prepostoFields.colaborador.value = '';
    }
    if(prepostoFields.nome) prepostoFields.nome.value = '';
    if(prepostoFields.cpf){
      prepostoFields.cpf.value = '';
      if(prepostoFields.cpf.dataset) prepostoFields.cpf.dataset.digits = '';
    }
    if(prepostoFields.nascimento){
      prepostoFields.nascimento.value = '';
      if(prepostoFields.nascimento.dataset) prepostoFields.nascimento.dataset.iso = '';
    }
    if(prepostoFields.sexo) prepostoFields.sexo.value = '';
    if(prepostoFields.rg) prepostoFields.rg.value = '';
    if(prepostoFields.pai) prepostoFields.pai.value = '';
    if(prepostoFields.mae) prepostoFields.mae.value = '';
    if(prepostoFields.profissao) prepostoFields.profissao.value = '';
    if(prepostoFields.estadoCivil) prepostoFields.estadoCivil.value = '';
    if(prepostoFields.nacionalidade) prepostoFields.nacionalidade.value = '';
    if(prepostoFields.endereco){
      if(keepEndereco){
        prepostoFields.endereco.value = stripCodigoIbgeEndereco(prepostoFields.endereco.value);
      } else {
        prepostoFields.endereco.value = '';
      }
    }
    if(prepostoFields.email) prepostoFields.email.value = '';
    if(prepostoFields.telefone) setTelefoneFieldValue(prepostoFields.telefone, '', { skipIfEmpty: false });
    if(prepostoFields.whatsapp) prepostoFields.whatsapp.checked = false;
    prepostoEditId = null;
    clearPrepostoValidation();
    setPrepostoButtonLabel('insert');
    togglePrepostoCancel(false);
    updatePrepostoInsertAvailability();
  }

  function renderPessoaCards(entries, listEl, emptyText, options){
    if(!listEl) return;
    const type = options && options.type ? String(options.type) : 'pessoa';
    const subtitleBuilder = options && typeof options.subtitleBuilder === 'function'
      ? options.subtitleBuilder
      : null;
    const emptyLabel = emptyText || 'Nenhum registro cadastrado.';
    if(!Array.isArray(entries) || !entries.length){
      listEl.classList.add('wdg-placeholder-box');
      listEl.innerHTML = emptyLabel;
      return;
    }
    listEl.classList.remove('wdg-placeholder-box');
    listEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'wdg-cessionario-item border rounded p-3 mb-2 d-flex flex-column flex-md-row justify-content-between align-items-start gap-2';
      card.dataset.id = String(entry.id);

      const infoWrap = document.createElement('div');
      infoWrap.className = 'wdg-cessionario-item__info';
      const description = document.createElement('div');
      description.className = 'wdg-cessionario-item__summary';
      description.textContent = buildPessoaSummary(entry);
      infoWrap.appendChild(description);

      if(subtitleBuilder){
        const subtitleText = sanitizeText(subtitleBuilder(entry));
        if(subtitleText){
          const subtitleEl = document.createElement('div');
          subtitleEl.className = 'small text-muted mt-2';
          subtitleEl.textContent = subtitleText;
          infoWrap.appendChild(subtitleEl);
        }
      }

      const actions = document.createElement('div');
      actions.className = 'wdg-cessionario-item__actions d-flex gap-3 align-items-center';
      const datasetKey = `${type}Action`;
      const editBtn = createIconActionButton({
        datasetKey,
        action: 'edit',
        id: entry.id,
        icon: 'images/editar.png',
        alt: 'Editar',
        title: 'Editar',
        fallbackClass: 'bi bi-pencil'
      });

      const removeBtn = createIconActionButton({
        datasetKey,
        action: 'remove',
        id: entry.id,
        icon: 'images/excluir.png',
        alt: 'Remover',
        title: 'Remover',
        fallbackClass: 'bi bi-trash'
      });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      card.appendChild(infoWrap);
      card.appendChild(actions);
      fragment.appendChild(card);
    });
    listEl.appendChild(fragment);
  }

  function renderCessionarios(){
    renderPessoaCards(cessionarios, cessionarioListEl, cessionarioListEmptyText || 'Nenhum cessionário adicionado.', {
      type: 'cessionario',
      subtitleBuilder: entry => entry && entry.habitacao_label ? entry.habitacao_label : 'Habitação não informada'
    });
    updateCessionarioInsertAvailability();
  }

  function renderPrepostos(){
    renderPessoaCards(prepostos, prepostoListEl, prepostoListEmptyText || 'Nenhum preposto vinculado.', {
      type: 'preposto',
      subtitleBuilder: entry => entry && entry.unidade_label ? entry.unidade_label : ''
    });
    updatePrepostoInsertAvailability();
  }

  function populateHabitacaoSelect(selectedId){
    const select = cessionarioFields.habitacao;
    if(!select) return;
    const previous = selectedId !== undefined ? String(selectedId) : select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = cessionarioState.habitacoes.length ? 'Selecione...' : 'Nenhuma habitação disponível';
    select.appendChild(placeholder);
    cessionarioState.habitacoes.forEach(habitacao => {
      const id = String(habitacao._id || habitacao.id || '');
      if(!id) return;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = buildHabitacaoLabel(habitacao);
      select.appendChild(option);
    });
    if(previous){
      select.value = previous;
      if(select.value !== previous){
        const fallback = cessionarioState.habitacaoMap.get(previous) || null;
        if(fallback){
          const option = document.createElement('option');
          option.value = previous;
          option.textContent = buildHabitacaoLabel(fallback);
          select.appendChild(option);
          select.value = previous;
        }
      }
    }
    select.disabled = cessionarioState.habitacoes.length === 0 && !previous;
  }

  function updateMoradorOptionsForHabitacao(habitacaoId, options){
    const select = cessionarioFields.morador;
    if(!select){
      cessionarioState.moradoresById.clear();
      return;
    }
    const includeAll = !!(options && options.includeAll);
    const selected = options && options.selected ? String(options.selected) : '';
    const fallbackMorador = options && options.fallbackMorador ? options.fallbackMorador : null;
    const autoFill = options && options.autoFill === false ? false : true;
    const preserveEditable = !!(options && options.preserveEditable);
    const forceEnable = !!(options && options.forceEnable);

    select.innerHTML = '';
    cessionarioState.moradoresById.clear();

    if(!habitacaoId){
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Selecione uma habitação';
      select.appendChild(opt);
      select.disabled = !forceEnable;
      return;
    }

    const habitacao = cessionarioState.habitacaoMap.get(String(habitacaoId));
    if(!habitacao){
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Habitação não encontrada';
      select.appendChild(opt);
      select.disabled = !forceEnable;
      return;
    }

    const moradores = Array.isArray(habitacao.moradores) ? habitacao.moradores : [];
    const candidatos = includeAll ? moradores : moradores.filter(isAdultMorador);

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = candidatos.length ? 'Selecione...' : 'Nenhum morador adulto disponível';
    select.appendChild(placeholder);

    candidatos.forEach(morador => {
      const id = String(morador._id || morador.id || '');
      if(!id) return;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = buildMoradorLabel(morador);
      option.dataset.birth = sanitizeText(morador.data_nascimento || '');
      select.appendChild(option);
      const enrichedMorador = enrichMoradorSexo(morador);
      cessionarioState.moradoresById.set(id, enrichedMorador);
    });

    if(fallbackMorador){
      const fallbackId = String(fallbackMorador._id || fallbackMorador.id || '');
      if(fallbackId && !cessionarioState.moradoresById.has(fallbackId)){
        const option = document.createElement('option');
        option.value = fallbackId;
        option.textContent = buildMoradorLabel(fallbackMorador);
        option.dataset.birth = sanitizeText(fallbackMorador.data_nascimento || '');
        select.appendChild(option);
        const enrichedFallback = enrichMoradorSexo(fallbackMorador);
        cessionarioState.moradoresById.set(fallbackId, enrichedFallback);
      }
    }

    select.disabled = !forceEnable && candidatos.length === 0;
    if(selected){
      select.value = selected;
      if(select.value !== selected && fallbackMorador){
        const fallbackId = String(fallbackMorador._id || fallbackMorador.id || '');
        select.value = fallbackId || '';
      }
      if(select.value && autoFill){
        fillFormFromMoradorId(select.value, { preserveEditable });
      }
    }
  }

  function loadHabitacoesForUnidade(unidadeId){
    const normalized = sanitizeText(unidadeId);
    if(!normalized){
      cessionarioState.habitacoes = [];
      cessionarioState.habitacaoMap = new Map();
      cessionarioState.moradoresById = new Map();
      populateHabitacaoSelect('');
      updateMoradorOptionsForHabitacao('');
      return Promise.resolve([]);
    }
    if(cessionarioState.habitacoesPromise && cessionarioState.lastHabitacoesUnidadeId === normalized){
      return cessionarioState.habitacoesPromise;
    }
    if(cessionarioFields.habitacao){
      cessionarioFields.habitacao.innerHTML = '<option value="">Carregando...</option>';
      cessionarioFields.habitacao.disabled = true;
    }
    const url = `${BASE_PATH}/api/habitacoes/busca?unidade=${encodeURIComponent(normalized)}&_ts=${Date.now()}`;
    const fetchPromise = fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then(res => res.ok ? res.json() : [])
      .catch(() => [])
      .then(data => {
        const habitacoes = Array.isArray(data) ? data : [];
        cessionarioState.habitacoes = habitacoes;
        cessionarioState.habitacaoMap = new Map(habitacoes.map(h => [String(h._id || h.id || ''), h]));
        const unidade = habitacoes[0] && habitacoes[0].unidade ? habitacoes[0].unidade : null;
        if(unidade){
          const enderecoUnidade = resolveUnidadeEndereco(unidade);
          if(enderecoUnidade) cessionarioState.unidadeEndereco = enderecoUnidade;
        }
        const previous = cessionarioFields.habitacao ? cessionarioFields.habitacao.value : '';
        populateHabitacaoSelect(previous);
        const currentHabId = cessionarioFields.habitacao ? cessionarioFields.habitacao.value : '';
        updateMoradorOptionsForHabitacao(currentHabId, { includeAll: true, selected: cessionarioFields.morador ? cessionarioFields.morador.value : '' });
        if(cessionarioFields.endereco){
          const hasMoradorSelecionado = Boolean(cessionarioFields.morador && sanitizeText(cessionarioFields.morador.value));
          if(!hasMoradorSelecionado){
            cessionarioFields.endereco.value = '';
          }
        }
        return habitacoes;
      });
    const trackingPromise = fetchPromise.finally(() => {
      cessionarioState.habitacoesPromise = null;
      cessionarioState.lastHabitacoesUnidadeId = normalized;
    });
    cessionarioState.habitacoesPromise = trackingPromise;
    cessionarioState.lastHabitacoesUnidadeId = normalized;
    return trackingPromise;
  }

  function ensureCessionarioLookups(){
    return Promise.all([
      loadEstadoCivilOptions(cessionarioFields.estadoCivil),
      loadNacionalidadeOptions(cessionarioFields.nacionalidade)
    ]);
  }

  function normalizeColaboradorData(raw){
    if(!raw) return null;
    let clone;
    try { clone = JSON.parse(JSON.stringify(raw)); }
    catch(_err){ try { clone = { ...raw }; } catch(_inner){ clone = raw; } }
    if(!clone) return null;
    const id = sanitizeText(clone._id || clone.id || '');
    if(!id) return null;
    const nome = sanitizeText(clone.nome || clone.nome_social || clone.colaborador_nome || '');
    const mae = sanitizeText(clone.nome_mae || clone.mae || '');
    const pai = sanitizeText(clone.nome_pai || clone.pai || '');
    const cpfDigits = sanitizeText(clone.cpf || '').replace(/\D/g,'').slice(0, 11);
    const dataIso = sanitizeText(clone.data_nascimento_iso || clone.data_nascimento || '');
    const dataBr = sanitizeText(clone.data_nascimento_br || (dataIso ? formatIsoToBr(dataIso) : ''));
    const sexoInfo = resolveMoradorSexoInfo(clone);
    const telefoneDigits = sanitizeText(clone.telefone_digits || clone.telefone || clone.telefone_formatado || '').replace(/\D/g,'').slice(0, 11);
    const telefoneFormatado = telefoneDigits ? formatTelefone(telefoneDigits) : sanitizeText(clone.telefone_formatado || clone.telefone || '');
    const unidadeId = sanitizeText(clone.unidade_id || '');
    const unidadeLabel = sanitizeText(clone.unidade_label || '');
    return {
      _id: id,
      id,
      nome,
      colaborador_label: sanitizeText(clone.label || clone.colaborador_label || nome),
      mae,
      pai,
      rg: sanitizeText(clone.rg || ''),
      cpf: cpfDigits,
      cpf_formatado: formatCpf(cpfDigits),
      data_nascimento: dataIso,
      data_nascimento_br: dataBr,
      sexo: sexoInfo.value || normalizeSexoValue(clone.sexo) || '',
      sexo_label: sexoInfo.label || sanitizeText(clone.sexo_label || ''),
      estado_civil: sanitizeText(clone.estado_civil || ''),
      estado_civil_label: sanitizeText(clone.estado_civil_label || ''),
      nacionalidade: sanitizeText(clone.nacionalidade || ''),
      nacionalidade_label: sanitizeText(clone.nacionalidade_label || ''),
      profissao: sanitizeText(clone.profissao || clone.cargo || ''),
      email: sanitizeText(clone.email || ''),
      telefone: telefoneDigits,
      telefone_digits: telefoneDigits,
      telefone_formatado: telefoneFormatado,
      whatsapp: !!clone.whatsapp,
      endereco: stripCodigoIbgeEndereco(clone.endereco || ''),
      unidade_id: unidadeId,
      unidade_label: unidadeLabel,
      snapshot: clone
    };
  }

  function populateColaboradorSelect(selectedId, options){
    const select = prepostoFields.colaborador;
    if(!select) return;
    const fallback = options && options.fallback ? options.fallback : null;
    const previous = selectedId !== undefined ? String(selectedId) : select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = prepostoState.colaboradores.length ? 'Selecione...' : 'Nenhum colaborador disponível';
    select.appendChild(placeholder);
    prepostoState.colaboradores.forEach(item => {
      const id = String(item._id || item.id || '');
      if(!id) return;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = sanitizeText(item.colaborador_label || item.nome || id);
      select.appendChild(option);
    });
    if(fallback){
      const fallbackId = String(fallback._id || fallback.id || '');
      if(fallbackId && !prepostoState.colaboradorMap.has(fallbackId)){
        const fallbackOption = document.createElement('option');
        fallbackOption.value = fallbackId;
        fallbackOption.textContent = sanitizeText(fallback.colaborador_label || fallback.nome || fallbackId);
        select.appendChild(fallbackOption);
        prepostoState.colaboradorMap.set(fallbackId, fallback);
      }
    }
    if(previous){
      select.value = previous;
      if(select.value !== previous && fallback){
        const fallbackId = String(fallback._id || fallback.id || '');
        select.value = fallbackId || '';
      }
    }
    select.disabled = prepostoState.colaboradores.length === 0 && !previous;
  }

  function loadColaboradoresForUnidade(unidadeId){
    const normalized = sanitizeText(unidadeId);
    if(!normalized){
      prepostoState.colaboradores = [];
      prepostoState.colaboradorMap = new Map();
      populateColaboradorSelect('');
      return Promise.resolve([]);
    }
    if(prepostoState.colaboradoresPromise && prepostoState.lastUnidadeId === normalized){
      return prepostoState.colaboradoresPromise;
    }
    if(prepostoFields.colaborador){
      prepostoFields.colaborador.innerHTML = '<option value="">Carregando...</option>';
      prepostoFields.colaborador.disabled = true;
    }
    const url = `${BASE_PATH}/api/colaboradores?unidade=${encodeURIComponent(normalized)}&_ts=${Date.now()}`;
    const fetchPromise = fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then(res => res.ok ? res.json() : [])
      .catch(() => [])
      .then(data => {
        const colaboradores = Array.isArray(data) ? data.map(normalizeColaboradorData).filter(Boolean) : [];
        prepostoState.colaboradores = colaboradores;
        prepostoState.colaboradorMap = new Map(colaboradores.map(item => [String(item._id || item.id || ''), item]));
        populateColaboradorSelect(prepostoFields.colaborador ? prepostoFields.colaborador.value : '');
        return colaboradores;
      })
      .finally(() => {
        prepostoState.colaboradoresPromise = null;
        prepostoState.lastUnidadeId = normalized;
      });
    prepostoState.colaboradoresPromise = fetchPromise;
    prepostoState.lastUnidadeId = normalized;
    return fetchPromise;
  }

  function ensurePrepostoLookups(){
    return Promise.all([
      loadEstadoCivilOptions(prepostoFields.estadoCivil),
      loadNacionalidadeOptions(prepostoFields.nacionalidade)
    ]);
  }

  let estadoCivilCache = null;
  async function fetchEstadoCivilOptions(){
    if(Array.isArray(estadoCivilCache)) return estadoCivilCache;
    try{
      const res = await fetch('/data/estado_civil.json', { cache: 'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      estadoCivilCache = Array.isArray(data) ? data : [];
    } catch(err){
      estadoCivilCache = [];
      console.warn('[ceder-uso] falha ao carregar lista de estado civil', err);
    }
    return estadoCivilCache;
  }

  async function loadEstadoCivilOptions(targetSelect){
    const select = targetSelect || cessionarioFields.estadoCivil;
    if(!select || select.dataset.loaded === 'true') return;
    const data = await fetchEstadoCivilOptions();
    const current = select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione...';
    select.appendChild(placeholder);
    data.forEach(item => {
      if(!item) return;
      const option = document.createElement('option');
      option.value = String(item.codigo || item.value || '');
      option.textContent = item.descricao || item.label || option.value;
      select.appendChild(option);
    });
    if(current) select.value = current;
    select.dataset.loaded = 'true';
  }

  let nacionalidadeCache = null;
  async function fetchNacionalidadeOptions(){
    if(Array.isArray(nacionalidadeCache)) return nacionalidadeCache;
    try{
      const res = await fetch('/data/nacionalidades.json', { cache: 'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      nacionalidadeCache = Array.isArray(data) ? data : [];
    } catch(err){
      nacionalidadeCache = [];
      console.warn('[ceder-uso] falha ao carregar lista de nacionalidades', err);
    }
    return nacionalidadeCache;
  }

  async function loadNacionalidadeOptions(targetSelect){
    const select = targetSelect || cessionarioFields.nacionalidade;
    if(!select || select.dataset.loaded === 'true') return;
    const data = await fetchNacionalidadeOptions();
    const current = select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione...';
    select.appendChild(placeholder);
    data.forEach(item => {
      if(!item) return;
      const option = document.createElement('option');
      option.value = String(item.codigo || item.value || '');
      option.textContent = item.descricao || item.label || option.value;
      select.appendChild(option);
    });
    if(current) select.value = current;
    select.dataset.loaded = 'true';
  }

  function handleHabitacaoChange(){
    if(!cessionarioFields.habitacao) return;
    const habId = sanitizeText(cessionarioFields.habitacao.value || '');
    updateMoradorOptionsForHabitacao(habId);
    if(cessionarioFields.morador) cessionarioFields.morador.value = '';
    if(cessionarioFields.endereco){
      cessionarioFields.endereco.value = '';
    }
    if(cessionarioFields.nome) cessionarioFields.nome.value = '';
    if(cessionarioFields.cpf){
      cessionarioFields.cpf.value = '';
      if(cessionarioFields.cpf.dataset) cessionarioFields.cpf.dataset.digits = '';
    }
    if(cessionarioFields.nascimento){
      cessionarioFields.nascimento.value = '';
      if(cessionarioFields.nascimento.dataset) cessionarioFields.nascimento.dataset.iso = '';
    }
    if(cessionarioFields.sexo) cessionarioFields.sexo.value = '';
    ['rg','pai','mae','email','profissao'].forEach(key => {
      const field = cessionarioFields[key];
      if(field) field.value = '';
    });
    if(cessionarioFields.telefone){
      setTelefoneFieldValue(cessionarioFields.telefone, '', { skipIfEmpty: false });
    }
    if(cessionarioFields.whatsapp) cessionarioFields.whatsapp.checked = false;
    clearCessionarioValidation();
  }

  function handleMoradorChange(){
    if(!cessionarioFields.morador) return;
    const moradorId = sanitizeText(cessionarioFields.morador.value || '');
    if(!moradorId){
      if(cessionarioFields.nome) cessionarioFields.nome.value = '';
      if(cessionarioFields.cpf){
        cessionarioFields.cpf.value = '';
        if(cessionarioFields.cpf.dataset) cessionarioFields.cpf.dataset.digits = '';
      }
      if(cessionarioFields.nascimento){
        cessionarioFields.nascimento.value = '';
        if(cessionarioFields.nascimento.dataset) cessionarioFields.nascimento.dataset.iso = '';
      }
      if(cessionarioFields.sexo) cessionarioFields.sexo.value = '';
      ['rg','pai','mae','email','profissao'].forEach(key => {
        const field = cessionarioFields[key];
        if(field) field.value = '';
      });
      if(cessionarioFields.endereco) cessionarioFields.endereco.value = '';
      if(cessionarioFields.telefone){
        setTelefoneFieldValue(cessionarioFields.telefone, '', { skipIfEmpty: false });
      }
      if(cessionarioFields.whatsapp) cessionarioFields.whatsapp.checked = false;
      return;
    }
    fillFormFromMoradorId(moradorId);
  }

  function fillFormFromMoradorId(moradorId, options){
    const morador = cessionarioState.moradoresById.get(String(moradorId));
    if(!morador) return;
    const enrichedMorador = enrichMoradorSexo(morador);
    if(enrichedMorador !== morador){
      cessionarioState.moradoresById.set(String(moradorId), enrichedMorador);
    }
    const preserveEditable = !!(options && options.preserveEditable);
    if(cessionarioFields.nome) cessionarioFields.nome.value = sanitizeText(enrichedMorador.nome || morador.nome || '');
    if(cessionarioFields.cpf){
      const digits = sanitizeText(enrichedMorador.cpf || morador.cpf || '').replace(/\D/g, '');
      cessionarioFields.cpf.value = formatCpf(digits);
      if(cessionarioFields.cpf.dataset) cessionarioFields.cpf.dataset.digits = digits;
    }
    const birthDate = parseBirthValue(enrichedMorador.data_nascimento || enrichedMorador.dataNascimento || morador.data_nascimento || morador.dataNascimento || '');
    if(cessionarioFields.nascimento){
      cessionarioFields.nascimento.value = birthDate ? formatDateBr(birthDate) : '';
      if(cessionarioFields.nascimento.dataset) cessionarioFields.nascimento.dataset.iso = birthDate ? formatDateIso(birthDate) : '';
    }
    if(cessionarioFields.rg) cessionarioFields.rg.value = sanitizeText(enrichedMorador.rg || morador.rg || '');
    if(cessionarioFields.pai) cessionarioFields.pai.value = sanitizeText(enrichedMorador.pai || morador.pai || '');
    if(cessionarioFields.mae) cessionarioFields.mae.value = sanitizeText(enrichedMorador.mae || morador.mae || '');
    if(!preserveEditable){
      const habId = cessionarioFields.habitacao ? cessionarioFields.habitacao.value : '';
      const habitacao = cessionarioState.habitacaoMap.get(String(habId));
      let baseEndereco = cessionarioState.unidadeEndereco || '';
      if(habitacao && habitacao.unidade){
        const resolvedEndereco = resolveUnidadeEndereco(habitacao.unidade);
        if(resolvedEndereco){
          baseEndereco = resolvedEndereco;
          cessionarioState.unidadeEndereco = resolvedEndereco;
        }
      }
      if(cessionarioFields.endereco){
        const enderecoFinal = buildEnderecoComHabitacao(baseEndereco, habitacao);
        cessionarioFields.endereco.value = enderecoFinal;
      }
    }
    if(cessionarioFields.email){
      const email = enrichedMorador.email || enrichedMorador.responsavel_email || morador.email || morador.responsavel_email || '';
      if(email || !preserveEditable) cessionarioFields.email.value = sanitizeText(email);
    }
    if(cessionarioFields.telefone){
      const telefone = enrichedMorador.telefone || morador.telefone || '';
      if(telefone || !preserveEditable){
        setTelefoneFieldValue(cessionarioFields.telefone, telefone, { skipIfEmpty: preserveEditable });
      }
    }
    if(cessionarioFields.whatsapp){
      const whatsappFlag = typeof enrichedMorador.telefone_whatsapp === 'boolean' ? enrichedMorador.telefone_whatsapp : (typeof enrichedMorador.whatsapp === 'boolean' ? enrichedMorador.whatsapp : (typeof morador.telefone_whatsapp === 'boolean' ? morador.telefone_whatsapp : (typeof morador.whatsapp === 'boolean' ? morador.whatsapp : false)));
      cessionarioFields.whatsapp.checked = !!whatsappFlag;
    }
    if(cessionarioFields.sexo){
      const sexoInfo = resolveMoradorSexoInfo(enrichedMorador);
      if(sexoInfo.value){
        cessionarioFields.sexo.value = sexoInfo.value;
      } else if(!preserveEditable){
        cessionarioFields.sexo.value = '';
      }
    }
  }

  function collectCessionarioInputs(currentId){
    if(!cessionarioForm) return null;
    clearCessionarioValidation();
    const habField = cessionarioFields.habitacao;
    const moradorField = cessionarioFields.morador;
    const habId = habField ? sanitizeText(habField.value) : '';
    if(!habId){
      markCessionarioInvalid(habField);
      notifyCessionarioErro('Selecione uma habitação para o cessionário.');
      return null;
    }
    const habitacao = cessionarioState.habitacaoMap.get(habId) || null;
    if(!habitacao){
      markCessionarioInvalid(habField);
      notifyCessionarioErro('Não foi possível identificar a habitação selecionada.');
      return null;
    }
    const moradorId = moradorField ? sanitizeText(moradorField.value) : '';
    if(!moradorId){
      markCessionarioInvalid(moradorField);
      notifyCessionarioErro('Selecione o morador que será o cessionário.');
      return null;
    }
    let moradorSnapshot = cessionarioState.moradoresById.get(moradorId) || null;
    const enrichedSnapshot = enrichMoradorSexo(moradorSnapshot);
    if(enrichedSnapshot && enrichedSnapshot !== moradorSnapshot){
      cessionarioState.moradoresById.set(moradorId, enrichedSnapshot);
      moradorSnapshot = enrichedSnapshot;
    }
    if(!moradorSnapshot){
      markCessionarioInvalid(moradorField);
      notifyCessionarioErro('Morador selecionado não encontrado na habitação.');
      return null;
    }
    const nome = sanitizeText(cessionarioFields.nome ? cessionarioFields.nome.value : '');
    if(!nome){
      markCessionarioInvalid(cessionarioFields.nome);
      notifyCessionarioErro('O nome do cessionário é obrigatório.');
      return null;
    }
    const nascimentoField = cessionarioFields.nascimento;
    let nascimentoIso = nascimentoField && nascimentoField.dataset ? sanitizeText(nascimentoField.dataset.iso) : '';
    const nascimentoBr = nascimentoField ? sanitizeText(nascimentoField.value) : '';
    if(!nascimentoIso && nascimentoBr){
      const parsedNascimento = parseDateBr(nascimentoBr);
      if(parsedNascimento){
        nascimentoIso = formatDateIso(parsedNascimento);
        if(nascimentoField && nascimentoField.dataset) nascimentoField.dataset.iso = nascimentoIso;
      }
    }
    const cpfField = cessionarioFields.cpf;
    const cpfDigits = cpfField ? ((cpfField.dataset && cpfField.dataset.digits) ? sanitizeText(cpfField.dataset.digits) : sanitizeText(cpfField.value).replace(/\D/g,'')) : '';
    const entryId = currentId ? String(currentId) : `cessionario-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const unidadeId = cessionarioState.unidadeId || resolveUnidadeId(habitacao) || '';
    const unidadeLabel = cessionarioState.unidadeLabel || sanitizeText((habitacao.unidade && habitacao.unidade.nome) || resolveUnidade(snapshot && snapshot.area) || '');
    const habitacaoLabel = sanitizeText(entryId && habitacao ? buildHabitacaoLabel(habitacao) : '');
    const estadoCivilValue = cessionarioFields.estadoCivil ? sanitizeText(cessionarioFields.estadoCivil.value) : '';
    const estadoCivilLabel = cessionarioFields.estadoCivil && cessionarioFields.estadoCivil.selectedIndex >= 0
      ? sanitizeText(cessionarioFields.estadoCivil.options[cessionarioFields.estadoCivil.selectedIndex].text || '')
      : '';
    const nacionalidadeValue = cessionarioFields.nacionalidade ? sanitizeText(cessionarioFields.nacionalidade.value) : '';
    const nacionalidadeLabel = cessionarioFields.nacionalidade && cessionarioFields.nacionalidade.selectedIndex >= 0
      ? sanitizeText(cessionarioFields.nacionalidade.options[cessionarioFields.nacionalidade.selectedIndex].text || '')
      : '';
    let sexoValue = '';
    let sexoLabel = '';
    if(cessionarioFields.sexo){
      const rawSexo = sanitizeText(cessionarioFields.sexo.value);
      sexoValue = normalizeSexoValue(rawSexo) || rawSexo.toUpperCase();
      const optionLabel = cessionarioFields.sexo.selectedIndex >= 0
        ? cessionarioFields.sexo.options[cessionarioFields.sexo.selectedIndex].text || ''
        : '';
      sexoLabel = resolveSexoLabel(sexoValue, optionLabel);
    }
    if(moradorSnapshot && !sexoValue){
      const moradorSexoInfo = resolveMoradorSexoInfo(moradorSnapshot);
      sexoValue = moradorSexoInfo.value || sexoValue;
      sexoLabel = moradorSexoInfo.label || sexoLabel;
    }
    const endereco = cessionarioFields.endereco ? stripCodigoIbgeEndereco(cessionarioFields.endereco.value) : '';
    const email = cessionarioFields.email ? sanitizeText(cessionarioFields.email.value) : '';
    const telefoneField = cessionarioFields.telefone;
    const telefoneDigits = telefoneField
      ? String((telefoneField.dataset && telefoneField.dataset.digits) || '').replace(/\D/g, '').slice(0, 11)
      : '';
    const telefoneFormatado = telefoneDigits ? formatTelefone(telefoneDigits) : '';
    const whatsapp = cessionarioFields.whatsapp ? !!cessionarioFields.whatsapp.checked : false;
    const dados = {
      nome,
      pai: sanitizeText(cessionarioFields.pai ? cessionarioFields.pai.value : ''),
      mae: sanitizeText(cessionarioFields.mae ? cessionarioFields.mae.value : ''),
      rg: sanitizeText(cessionarioFields.rg ? cessionarioFields.rg.value : ''),
      cpf: cpfDigits,
      data_nascimento: nascimentoIso,
      data_nascimento_br: nascimentoBr,
      endereco,
      estado_civil: estadoCivilValue,
      estado_civil_label: estadoCivilLabel,
      sexo: sexoValue,
      sexo_label: sexoLabel,
      profissao: sanitizeText(cessionarioFields.profissao ? cessionarioFields.profissao.value : ''),
      nacionalidade: nacionalidadeValue,
      nacionalidade_label: nacionalidadeLabel,
      email,
      telefone: telefoneDigits,
      telefone_digits: telefoneDigits,
      telefone_formatado: telefoneFormatado,
      whatsapp
    };
    const entry = {
      id: entryId,
      unidade_id: unidadeId,
      unidade_label: unidadeLabel,
      habitacao_id: habId,
      habitacao_label: habitacaoLabel,
      morador_id: moradorId,
      morador_nome: sanitizeText(moradorSnapshot && moradorSnapshot.nome ? moradorSnapshot.nome : nome),
      nome,
      pai: dados.pai,
      mae: dados.mae,
      rg: dados.rg,
      cpf: cpfDigits,
      cpf_formatado: formatCpf(cpfDigits),
      data_nascimento: nascimentoIso,
      data_nascimento_br: nascimentoBr,
      endereco,
      estado_civil: estadoCivilValue,
      estado_civil_label: estadoCivilLabel,
      sexo: sexoValue,
      sexo_label: sexoLabel,
      profissao: dados.profissao,
      nacionalidade: nacionalidadeValue,
      nacionalidade_label: nacionalidadeLabel,
      email,
      telefone: telefoneDigits,
      telefone_formatado: telefoneFormatado,
      telefone_digits: telefoneDigits,
      whatsapp,
      dados,
      unidade_snapshot: cloneShallow(habitacao.unidade || null),
      habitacao_snapshot: cloneShallow(habitacao),
      morador_snapshot: cloneShallow(moradorSnapshot)
    };
    return { entry };
  }

  function handleAddCessionario(){
    if(!cessionarioEditId && cessionarios.length >= 1){
      notifyCessionarioErro('Já existe um cessionário cadastrado. Edite ou remova o registro atual antes de adicionar outro.');
      return;
    }
    const result = collectCessionarioInputs(cessionarioEditId);
    if(!result) return;
    const { entry } = result;
    if(cessionarioEditId){
      const idx = cessionarios.findIndex(item => String(item.id) === String(cessionarioEditId));
      if(idx >= 0){
        cessionarios[idx] = entry;
      } else {
        cessionarios.push(entry);
      }
      notifyCessionarioSucesso('Cessionário atualizado na lista.');
    } else {
      cessionarios.push(entry);
      notifyCessionarioSucesso('Cessionário adicionado à lista.');
    }
    snapshot = snapshot || {};
    snapshot.cessionarios = cessionarios.map(item => cloneShallow(item) || { ...item });
    renderCessionarios();
    clearCessionarioForm({ keepHab: true });
    updateCessionarioInsertAvailability();
  }

  function handleCancelCessionarioEdit(){
    clearCessionarioForm({ keepHab: true });
  }

  function startEditCessionario(entry){
    if(!entry) return;
    cessionarioEditId = String(entry.id);
    setCessionarioButtonLabel('update');
    toggleCessionarioCancel(true);
    updateCessionarioInsertAvailability();
    ensureCessionarioLookups().finally(() => {
      const prepareHabitacoes = cessionarioState.unidadeId ? loadHabitacoesForUnidade(cessionarioState.unidadeId) : Promise.resolve([]);
      prepareHabitacoes.then(() => {
        const habitacaoId = sanitizeText(entry.habitacao_id || '');
        const moradorId = sanitizeText(entry.morador_id || '');
        if(cessionarioFields.habitacao){
          populateHabitacaoSelect(habitacaoId);
          cessionarioFields.habitacao.value = habitacaoId || '';
        }
        updateMoradorOptionsForHabitacao(habitacaoId, {
          includeAll: true,
          selected: moradorId,
          fallbackMorador: entry.morador_snapshot || null,
          autoFill: false,
          forceEnable: true,
          preserveEditable: true
        });
        if(cessionarioFields.morador){
          cessionarioFields.morador.value = moradorId || '';
        }
        if(cessionarioFields.nome) cessionarioFields.nome.value = sanitizeText(entry.nome || entry.morador_nome || '');
        if(cessionarioFields.cpf){
          const digits = sanitizeText(entry.cpf || entry.cpf_formatado || '').replace(/\D/g,'');
          cessionarioFields.cpf.value = formatCpf(digits);
          if(cessionarioFields.cpf.dataset) cessionarioFields.cpf.dataset.digits = digits;
        }
        if(cessionarioFields.nascimento){
          const br = entry.data_nascimento_br || (entry.data_nascimento ? formatIsoToBr(entry.data_nascimento) : '');
          cessionarioFields.nascimento.value = br;
          if(cessionarioFields.nascimento.dataset) cessionarioFields.nascimento.dataset.iso = sanitizeText(entry.data_nascimento || '');
        }
        if(cessionarioFields.sexo){
          const sexoValor = normalizeSexoValue(entry.sexo)
            || normalizeSexoValue(entry.dados && entry.dados.sexo)
            || normalizeSexoValue(entry.sexo_label || (entry.dados && entry.dados.sexo_label) || '')
            || sanitizeText(entry.sexo || (entry.dados && entry.dados.sexo) || '').toUpperCase();
          cessionarioFields.sexo.value = sexoValor || '';
        }
        if(cessionarioFields.rg) cessionarioFields.rg.value = sanitizeText(entry.rg || '');
        if(cessionarioFields.pai) cessionarioFields.pai.value = sanitizeText(entry.pai || '');
        if(cessionarioFields.mae) cessionarioFields.mae.value = sanitizeText(entry.mae || '');
        if(cessionarioFields.estadoCivil) cessionarioFields.estadoCivil.value = sanitizeText(entry.estado_civil || '');
        if(cessionarioFields.profissao) cessionarioFields.profissao.value = sanitizeText(entry.profissao || '');
        if(cessionarioFields.nacionalidade) cessionarioFields.nacionalidade.value = sanitizeText(entry.nacionalidade || '');
        if(cessionarioFields.endereco){
          const enderecoEdit = stripCodigoIbgeEndereco(entry.endereco || cessionarioState.unidadeEndereco || '');
          cessionarioFields.endereco.value = enderecoEdit;
        }
        if(cessionarioFields.email) cessionarioFields.email.value = sanitizeText(entry.email || '');
        if(cessionarioFields.telefone){
          const telefoneSeed = entry.telefone_digits || (entry.dados && entry.dados.telefone_digits) || entry.telefone || (entry.dados && entry.dados.telefone) || '';
          setTelefoneFieldValue(cessionarioFields.telefone, telefoneSeed, { skipIfEmpty: false });
        }
        if(cessionarioFields.whatsapp) cessionarioFields.whatsapp.checked = !!entry.whatsapp;
        const snapshotMorador = entry.morador_snapshot || cessionarioState.moradoresById.get(moradorId) || null;
        const enrichedSnapshot = enrichMoradorSexo(snapshotMorador) || snapshotMorador;
        if(enrichedSnapshot){
          cessionarioState.moradoresById.set(moradorId, enrichedSnapshot);
        }
      }).catch(err => {
        console.warn('[ceder-uso] falha ao preparar edição do cessionário', err);
      });
    });
  }

  function removeCessionario(id){
    const idx = cessionarios.findIndex(item => String(item.id) === String(id));
    if(idx === -1) return;
    cessionarios.splice(idx, 1);
    if(cessionarioEditId && String(cessionarioEditId) === String(id)){
      clearCessionarioForm({ keepHab: true });
    }
    snapshot = snapshot || {};
    snapshot.cessionarios = cessionarios.map(item => cloneShallow(item) || { ...item });
    renderCessionarios();
    notifyCessionarioSucesso('Cessionário removido da lista.');
    updateCessionarioInsertAvailability();
  }

  function handleCessionarioListClick(event){
    const actionBtn = event.target.closest('[data-cessionario-action]');
    if(!actionBtn) return;
    const action = actionBtn.dataset.cessionarioAction;
    const id = actionBtn.dataset.id;
    if(!action || !id) return;
    if(action === 'edit'){
      const entry = cessionarios.find(item => String(item.id) === String(id));
      if(entry) startEditCessionario(entry);
    } else if(action === 'remove'){
      if(window.confirm('Remover o cessionário selecionado?')){
        removeCessionario(id);
      }
    }
  }

  function handleColaboradorChange(){
    if(!prepostoFields.colaborador) return;
    const colaboradorId = sanitizeText(prepostoFields.colaborador.value || '');
    if(!colaboradorId){
      if(prepostoFields.nome) prepostoFields.nome.value = '';
      if(prepostoFields.cpf){
        prepostoFields.cpf.value = '';
        if(prepostoFields.cpf.dataset) prepostoFields.cpf.dataset.digits = '';
      }
      if(prepostoFields.nascimento){
        prepostoFields.nascimento.value = '';
        if(prepostoFields.nascimento.dataset) prepostoFields.nascimento.dataset.iso = '';
      }
      if(prepostoFields.sexo) prepostoFields.sexo.value = '';
      if(prepostoFields.rg) prepostoFields.rg.value = '';
      if(prepostoFields.pai) prepostoFields.pai.value = '';
      if(prepostoFields.mae) prepostoFields.mae.value = '';
      if(prepostoFields.estadoCivil) prepostoFields.estadoCivil.value = '';
      if(prepostoFields.profissao) prepostoFields.profissao.value = '';
      if(prepostoFields.nacionalidade) prepostoFields.nacionalidade.value = '';
      if(prepostoFields.endereco) prepostoFields.endereco.value = '';
      if(prepostoFields.email) prepostoFields.email.value = '';
      if(prepostoFields.telefone) setTelefoneFieldValue(prepostoFields.telefone, '', { skipIfEmpty: false });
      if(prepostoFields.whatsapp) prepostoFields.whatsapp.checked = false;
      clearPrepostoValidation();
      return;
    }
    fillPrepostoFromColaboradorId(colaboradorId);
  }

  function fillPrepostoFromColaboradorId(colaboradorId, options){
    const fallback = options && options.fallback ? normalizeColaboradorData(options.fallback) : null;
    const existing = prepostoState.colaboradorMap.get(String(colaboradorId));
    const colaborador = existing || fallback;
    if(!colaborador) return null;
    prepostoState.colaboradorMap.set(String(colaboradorId), colaborador);
    clearPrepostoValidation();
    if(prepostoFields.nome) prepostoFields.nome.value = sanitizeText(colaborador.nome || colaborador.colaborador_label || '');
    if(prepostoFields.cpf){
      const digits = sanitizeText(colaborador.cpf || colaborador.cpf_formatado || '').replace(/\D/g,'').slice(0, 11);
      prepostoFields.cpf.value = formatCpf(digits);
      if(prepostoFields.cpf.dataset) prepostoFields.cpf.dataset.digits = digits;
    }
    const birthDate = parseBirthValue(colaborador.data_nascimento || colaborador.data_nascimento_br || '');
    if(prepostoFields.nascimento){
      prepostoFields.nascimento.value = birthDate ? formatDateBr(birthDate) : '';
      if(prepostoFields.nascimento.dataset) prepostoFields.nascimento.dataset.iso = birthDate ? formatDateIso(birthDate) : '';
    }
    if(prepostoFields.sexo){
      prepostoFields.sexo.value = normalizeSexoValue(colaborador.sexo) || '';
    }
    if(prepostoFields.rg) prepostoFields.rg.value = sanitizeText(colaborador.rg || '');
    if(prepostoFields.pai) prepostoFields.pai.value = sanitizeText(colaborador.pai || '');
    if(prepostoFields.mae) prepostoFields.mae.value = sanitizeText(colaborador.mae || '');
    if(prepostoFields.profissao) prepostoFields.profissao.value = sanitizeText(colaborador.profissao || '');
    if(prepostoFields.endereco){
      const endereco = stripCodigoIbgeEndereco(colaborador.endereco || '');
      prepostoFields.endereco.value = endereco;
    }
    if(prepostoFields.email) prepostoFields.email.value = sanitizeText(colaborador.email || '');
    if(prepostoFields.telefone){
      const telefoneSeed = colaborador.telefone_digits || colaborador.telefone || colaborador.telefone_formatado || '';
      setTelefoneFieldValue(prepostoFields.telefone, telefoneSeed, { skipIfEmpty: false });
    }
    if(prepostoFields.whatsapp) prepostoFields.whatsapp.checked = !!colaborador.whatsapp;
    ensurePrepostoLookups().then(() => {
      if(prepostoFields.estadoCivil){
        prepostoFields.estadoCivil.value = sanitizeText(colaborador.estado_civil || '');
      }
      if(prepostoFields.nacionalidade){
        prepostoFields.nacionalidade.value = sanitizeText(colaborador.nacionalidade || '');
      }
    }).catch(() => {
      /* noop */
    });
    return colaborador;
  }

  function collectPrepostoInputs(currentId){
    if(!prepostoForm) return null;
    clearPrepostoValidation();
    const colaboradorField = prepostoFields.colaborador;
    const colaboradorId = colaboradorField ? sanitizeText(colaboradorField.value) : '';
    if(!colaboradorId){
      markCessionarioInvalid(colaboradorField);
      notifyPrepostoErro('Selecione o colaborador que será o preposto.');
      return null;
    }
    let colaboradorSnapshot = prepostoState.colaboradorMap.get(colaboradorId) || null;
    if(!colaboradorSnapshot){
      colaboradorSnapshot = normalizeColaboradorData({ _id: colaboradorId, nome: prepostoFields.nome ? prepostoFields.nome.value : '' });
      if(colaboradorSnapshot) prepostoState.colaboradorMap.set(colaboradorId, colaboradorSnapshot);
    }
    const nome = sanitizeText(prepostoFields.nome ? prepostoFields.nome.value : '');
    if(!nome){
      markCessionarioInvalid(prepostoFields.nome);
      notifyPrepostoErro('O nome do preposto é obrigatório.');
      return null;
    }
    const nascimentoField = prepostoFields.nascimento;
    let nascimentoIso = nascimentoField && nascimentoField.dataset ? sanitizeText(nascimentoField.dataset.iso) : '';
    const nascimentoBr = nascimentoField ? sanitizeText(nascimentoField.value) : '';
    if(!nascimentoIso && nascimentoBr){
      const parsedNascimento = parseDateBr(nascimentoBr);
      if(parsedNascimento){
        nascimentoIso = formatDateIso(parsedNascimento);
        if(nascimentoField && nascimentoField.dataset) nascimentoField.dataset.iso = nascimentoIso;
      }
    }
    const cpfField = prepostoFields.cpf;
    const cpfDigits = cpfField ? ((cpfField.dataset && cpfField.dataset.digits) ? sanitizeText(cpfField.dataset.digits) : sanitizeText(cpfField.value).replace(/\D/g,'')) : '';
    const entryId = currentId ? String(currentId) : `preposto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const unidadeId = prepostoState.unidadeId || '';
    const unidadeLabel = prepostoState.unidadeLabel || '';
    let sexoValue = '';
    let sexoLabel = '';
    if(prepostoFields.sexo){
      const rawSexo = sanitizeText(prepostoFields.sexo.value);
      sexoValue = normalizeSexoValue(rawSexo) || rawSexo.toUpperCase();
      const optionLabel = prepostoFields.sexo.selectedIndex >= 0
        ? prepostoFields.sexo.options[prepostoFields.sexo.selectedIndex].text || ''
        : '';
      sexoLabel = resolveSexoLabel(sexoValue, optionLabel);
    }
    if(colaboradorSnapshot && !sexoValue){
      const sexoInfo = resolveMoradorSexoInfo(colaboradorSnapshot);
      sexoValue = sexoInfo.value || sexoValue;
      sexoLabel = sexoInfo.label || sexoLabel;
    }
    const estadoCivilValue = prepostoFields.estadoCivil ? sanitizeText(prepostoFields.estadoCivil.value) : '';
    const estadoCivilLabel = prepostoFields.estadoCivil && prepostoFields.estadoCivil.selectedIndex >= 0
      ? sanitizeText(prepostoFields.estadoCivil.options[prepostoFields.estadoCivil.selectedIndex].text || '')
      : '';
    const nacionalidadeValue = prepostoFields.nacionalidade ? sanitizeText(prepostoFields.nacionalidade.value) : '';
    const nacionalidadeLabel = prepostoFields.nacionalidade && prepostoFields.nacionalidade.selectedIndex >= 0
      ? sanitizeText(prepostoFields.nacionalidade.options[prepostoFields.nacionalidade.selectedIndex].text || '')
      : '';
    const endereco = prepostoFields.endereco ? stripCodigoIbgeEndereco(prepostoFields.endereco.value) : '';
    const email = prepostoFields.email ? sanitizeText(prepostoFields.email.value) : '';
    const telefoneField = prepostoFields.telefone;
    const telefoneDigits = telefoneField
      ? String((telefoneField.dataset && telefoneField.dataset.digits) || '').replace(/\D/g, '').slice(0, 11)
      : '';
    const telefoneFormatado = telefoneDigits ? formatTelefone(telefoneDigits) : '';
    const whatsapp = prepostoFields.whatsapp ? !!prepostoFields.whatsapp.checked : false;
    const dados = {
      nome,
      pai: sanitizeText(prepostoFields.pai ? prepostoFields.pai.value : ''),
      mae: sanitizeText(prepostoFields.mae ? prepostoFields.mae.value : ''),
      rg: sanitizeText(prepostoFields.rg ? prepostoFields.rg.value : ''),
      cpf: cpfDigits,
      data_nascimento: nascimentoIso,
      data_nascimento_br: nascimentoBr,
      endereco,
      estado_civil: estadoCivilValue,
      estado_civil_label: estadoCivilLabel,
      sexo: sexoValue,
      sexo_label: sexoLabel,
      profissao: sanitizeText(prepostoFields.profissao ? prepostoFields.profissao.value : ''),
      nacionalidade: nacionalidadeValue,
      nacionalidade_label: nacionalidadeLabel,
      email,
      telefone: telefoneDigits,
      telefone_digits: telefoneDigits,
      telefone_formatado: telefoneFormatado,
      whatsapp
    };
    const entry = {
      id: entryId,
      unidade_id: unidadeId,
      unidade_label: unidadeLabel,
      colaborador_id: colaboradorId,
      colaborador_nome: sanitizeText(colaboradorSnapshot && colaboradorSnapshot.nome ? colaboradorSnapshot.nome : nome),
      colaborador_label: sanitizeText(colaboradorSnapshot && (colaboradorSnapshot.colaborador_label || colaboradorSnapshot.nome) || ''),
      nome,
      pai: dados.pai,
      mae: dados.mae,
      rg: dados.rg,
      cpf: cpfDigits,
      cpf_formatado: formatCpf(cpfDigits),
      data_nascimento: nascimentoIso,
      data_nascimento_br: nascimentoBr,
      sexo: sexoValue,
      sexo_label: sexoLabel,
      endereco,
      estado_civil: estadoCivilValue,
      estado_civil_label: estadoCivilLabel,
      profissao: dados.profissao,
      nacionalidade: nacionalidadeValue,
      nacionalidade_label: nacionalidadeLabel,
      email,
      telefone: telefoneDigits,
      telefone_formatado: telefoneFormatado,
      telefone_digits: telefoneDigits,
      whatsapp,
      dados,
      colaborador_snapshot: cloneShallow(colaboradorSnapshot)
    };
    return { entry };
  }

  function handleAddPreposto(){
    if(!prepostoEditId && prepostos.length >= 1){
      notifyPrepostoErro('Já existe um preposto cadastrado. Edite ou remova o registro atual antes de adicionar outro.');
      return;
    }
    const result = collectPrepostoInputs(prepostoEditId);
    if(!result) return;
    const { entry } = result;
    if(prepostoEditId){
      const idx = prepostos.findIndex(item => String(item.id) === String(prepostoEditId));
      if(idx >= 0){
        prepostos[idx] = entry;
      } else {
        prepostos.push(entry);
      }
      notifyPrepostoSucesso('Preposto atualizado na lista.');
    } else {
      prepostos.push(entry);
      notifyPrepostoSucesso('Preposto adicionado à lista.');
    }
    snapshot = snapshot || {};
    snapshot.prepostos = prepostos.map(item => cloneShallow(item) || { ...item });
    renderPrepostos();
    clearPrepostoForm();
    updatePrepostoInsertAvailability();
  }

  function handleCancelPrepostoEdit(){
    clearPrepostoForm();
  }

  function startEditPreposto(entry){
    if(!entry) return;
    clearPrepostoValidation();
    prepostoEditId = String(entry.id);
    setPrepostoButtonLabel('update');
    togglePrepostoCancel(true);
    updatePrepostoInsertAvailability();
    ensurePrepostoLookups().finally(() => {
      const prepareColaboradores = prepostoState.unidadeId
        ? loadColaboradoresForUnidade(prepostoState.unidadeId)
        : Promise.resolve([]);
      prepareColaboradores.then(() => {
        const colaboradorId = sanitizeText(entry.colaborador_id || '');
        if(prepostoFields.colaborador){
          populateColaboradorSelect(colaboradorId, { fallback: entry.colaborador_snapshot || entry.dados || null });
          prepostoFields.colaborador.value = colaboradorId || '';
        }
        fillPrepostoFromColaboradorId(colaboradorId, { fallback: entry.colaborador_snapshot || null });
        if(prepostoFields.nome) prepostoFields.nome.value = sanitizeText(entry.nome || entry.colaborador_nome || '');
        if(prepostoFields.cpf){
          const digits = sanitizeText(entry.cpf || entry.cpf_formatado || '').replace(/\D/g,'');
          prepostoFields.cpf.value = formatCpf(digits);
          if(prepostoFields.cpf.dataset) prepostoFields.cpf.dataset.digits = digits;
        }
        if(prepostoFields.nascimento){
          const br = entry.data_nascimento_br || (entry.data_nascimento ? formatIsoToBr(entry.data_nascimento) : '');
          prepostoFields.nascimento.value = br;
          if(prepostoFields.nascimento.dataset) prepostoFields.nascimento.dataset.iso = sanitizeText(entry.data_nascimento || '');
        }
        if(prepostoFields.sexo){
          const sexoValor = normalizeSexoValue(entry.sexo)
            || normalizeSexoValue(entry.dados && entry.dados.sexo)
            || normalizeSexoValue(entry.sexo_label || (entry.dados && entry.dados.sexo_label) || '')
            || sanitizeText(entry.sexo || (entry.dados && entry.dados.sexo) || '').toUpperCase();
          prepostoFields.sexo.value = sexoValor || '';
        }
        if(prepostoFields.rg) prepostoFields.rg.value = sanitizeText(entry.rg || '');
        if(prepostoFields.pai) prepostoFields.pai.value = sanitizeText(entry.pai || '');
        if(prepostoFields.mae) prepostoFields.mae.value = sanitizeText(entry.mae || '');
        if(prepostoFields.estadoCivil) prepostoFields.estadoCivil.value = sanitizeText(entry.estado_civil || '');
        if(prepostoFields.profissao) prepostoFields.profissao.value = sanitizeText(entry.profissao || '');
        if(prepostoFields.nacionalidade) prepostoFields.nacionalidade.value = sanitizeText(entry.nacionalidade || '');
        if(prepostoFields.endereco) prepostoFields.endereco.value = stripCodigoIbgeEndereco(entry.endereco || '');
        if(prepostoFields.email) prepostoFields.email.value = sanitizeText(entry.email || '');
        if(prepostoFields.telefone){
          const telefoneSeed = entry.telefone_digits || (entry.dados && entry.dados.telefone_digits) || entry.telefone || (entry.dados && entry.dados.telefone) || '';
          setTelefoneFieldValue(prepostoFields.telefone, telefoneSeed, { skipIfEmpty: false });
        }
        if(prepostoFields.whatsapp) prepostoFields.whatsapp.checked = !!entry.whatsapp;
        if(entry.colaborador_id && entry.colaborador_snapshot){
          const normalizedSnapshot = normalizeColaboradorData(entry.colaborador_snapshot) || entry.colaborador_snapshot;
          prepostoState.colaboradorMap.set(entry.colaborador_id, normalizedSnapshot);
        }
      }).catch(err => {
        console.warn('[ceder-uso] falha ao preparar edição do preposto', err);
      });
    });
  }

  function removePreposto(id){
    const idx = prepostos.findIndex(item => String(item.id) === String(id));
    if(idx === -1) return;
    prepostos.splice(idx, 1);
    if(prepostoEditId && String(prepostoEditId) === String(id)){
      clearPrepostoForm();
    }
    snapshot = snapshot || {};
    snapshot.prepostos = prepostos.map(item => cloneShallow(item) || { ...item });
    renderPrepostos();
    notifyPrepostoSucesso('Preposto removido da lista.');
    updatePrepostoInsertAvailability();
  }

  function handlePrepostoListClick(event){
    const actionBtn = event.target.closest('[data-preposto-action]');
    if(!actionBtn) return;
    const action = actionBtn.dataset.prepostoAction;
    const id = actionBtn.dataset.id;
    if(!action || !id) return;
    if(action === 'edit'){
      const entry = prepostos.find(item => String(item.id) === String(id));
      if(entry) startEditPreposto(entry);
    } else if(action === 'remove'){
      if(window.confirm('Remover o preposto selecionado?')){
        removePreposto(id);
      }
    }
  }

  function normalizePrepostoEntry(entry){
    if(!entry) return null;
    let clone;
    try {
      clone = typeof entry === 'object' ? JSON.parse(JSON.stringify(entry)) : null;
    } catch (err){
      console.warn('[ceder-uso] não foi possível clonar preposto', err);
      clone = entry;
    }
    if(!clone || typeof clone !== 'object') return null;
    const colaboradorSnapshot = clone.colaborador_snapshot || clone.colaborador || null;
    const normalizedSnapshot = colaboradorSnapshot ? normalizeColaboradorData(colaboradorSnapshot) : null;
    const colaboradorId = sanitizeText(
      clone.colaborador_id
      || clone.colaboradorId
      || (clone.colaborador && (clone.colaborador._id || clone.colaborador.id))
      || (normalizedSnapshot && (normalizedSnapshot._id || normalizedSnapshot.id))
      || ''
    );
    const nomeBase = sanitizeText(clone.nome || (clone.dados && clone.dados.nome) || (normalizedSnapshot && normalizedSnapshot.nome) || '');
    const cpfDigits = sanitizeText(
      clone.cpf
      || (clone.dados && clone.dados.cpf)
      || (normalizedSnapshot && (normalizedSnapshot.cpf || normalizedSnapshot.cpf_formatado))
      || ''
    ).replace(/\D/g,'').slice(0, 11);
    const dataIso = sanitizeText(
      clone.data_nascimento
      || (clone.dados && clone.dados.data_nascimento)
      || ''
    );
    const dataBr = sanitizeText(
      clone.data_nascimento_br
      || (clone.dados && clone.dados.data_nascimento_br)
      || (dataIso ? formatIsoToBr(dataIso) : '')
    );
    const sexoValue = normalizeSexoValue(
      clone.sexo
      || (clone.dados && clone.dados.sexo)
      || (normalizedSnapshot && normalizedSnapshot.sexo)
      || ''
    ) || '';
    const sexoLabel = resolveSexoLabel(
      sexoValue,
      clone.sexo_label
      || (clone.dados && clone.dados.sexo_label)
      || (normalizedSnapshot && (normalizedSnapshot.sexo_label || normalizedSnapshot.sexoDescricao))
      || ''
    );
    const telefoneDigits = sanitizeText(
      clone.telefone_digits
      || (clone.dados && clone.dados.telefone_digits)
      || clone.telefone
      || (clone.dados && clone.dados.telefone)
      || (normalizedSnapshot && (normalizedSnapshot.telefone_digits || normalizedSnapshot.telefone))
      || ''
    ).replace(/\D/g,'').slice(0, 11);
    const telefoneFormatado = telefoneDigits ? formatTelefone(telefoneDigits) : sanitizeText(
      clone.telefone_formatado
      || (clone.dados && clone.dados.telefone_formatado)
      || (normalizedSnapshot && normalizedSnapshot.telefone_formatado)
      || ''
    );
    const dados = clone.dados && typeof clone.dados === 'object'
      ? { ...clone.dados }
      : {};
    if(dados){
      dados.nome = nomeBase;
      dados.cpf = cpfDigits;
      dados.data_nascimento = dataIso;
      dados.data_nascimento_br = dataBr;
      dados.telefone = telefoneDigits;
      dados.telefone_digits = telefoneDigits;
      dados.telefone_formatado = telefoneFormatado;
      dados.sexo = sexoValue;
      dados.sexo_label = sexoLabel;
      dados.endereco = stripCodigoIbgeEndereco(dados.endereco || clone.endereco || '');
    }
    const fallbackId = clone.id || clone._id || colaboradorId || `preposto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const preposto = {
      id: sanitizeText(String(fallbackId || '')),
      unidade_id: sanitizeText(clone.unidade_id || clone.unidadeId || ''),
      unidade_label: sanitizeText(clone.unidade_label || clone.unidadeLabel || ''),
      colaborador_id: colaboradorId,
      colaborador_nome: sanitizeText(
        clone.colaborador_nome
        || (normalizedSnapshot && (normalizedSnapshot.nome || normalizedSnapshot.colaborador_label))
        || nomeBase
      ),
      colaborador_label: sanitizeText(
        clone.colaborador_label
        || (normalizedSnapshot && (normalizedSnapshot.colaborador_label || normalizedSnapshot.nome))
        || nomeBase
      ),
      nome: nomeBase,
      pai: sanitizeText(clone.pai || (clone.dados && clone.dados.pai) || ''),
      mae: sanitizeText(clone.mae || (clone.dados && clone.dados.mae) || ''),
      rg: sanitizeText(clone.rg || (clone.dados && clone.dados.rg) || ''),
      cpf: cpfDigits,
      cpf_formatado: formatCpf(cpfDigits),
      data_nascimento: dataIso,
      data_nascimento_br: dataBr,
      sexo: sexoValue,
      sexo_label: sexoLabel,
      endereco: stripCodigoIbgeEndereco(clone.endereco || (clone.dados && clone.dados.endereco) || ''),
      estado_civil: sanitizeText(clone.estado_civil || (clone.dados && clone.dados.estado_civil) || ''),
      estado_civil_label: sanitizeText(clone.estado_civil_label || (clone.dados && clone.dados.estado_civil_label) || ''),
      profissao: sanitizeText(clone.profissao || (clone.dados && clone.dados.profissao) || ''),
      nacionalidade: sanitizeText(clone.nacionalidade || (clone.dados && clone.dados.nacionalidade) || ''),
      nacionalidade_label: sanitizeText(clone.nacionalidade_label || (clone.dados && clone.dados.nacionalidade_label) || ''),
      email: sanitizeText(clone.email || (clone.dados && clone.dados.email) || ''),
      telefone: telefoneDigits,
      telefone_formatado: telefoneFormatado,
      telefone_digits: telefoneDigits,
      whatsapp: typeof clone.whatsapp === 'boolean' ? clone.whatsapp : !!(clone.dados && clone.dados.whatsapp),
      dados,
      colaborador_snapshot: normalizedSnapshot || null
    };
    return preposto;
  }

  function hydratePrepostosFromSnapshot(){
    const source = Array.isArray(snapshot && snapshot.prepostos)
      ? snapshot.prepostos.slice(0, 1)
      : [];
    prepostos = source.map(normalizePrepostoEntry).filter(Boolean);
    prepostos.forEach(item => {
      if(item.colaborador_id && item.colaborador_snapshot){
        const normalized = normalizeColaboradorData(item.colaborador_snapshot) || item.colaborador_snapshot;
        prepostoState.colaboradorMap.set(item.colaborador_id, normalized);
      }
    });
    if(prepostoFields.colaborador && prepostos.length){
      const primary = prepostos[0];
      populateColaboradorSelect(primary.colaborador_id || '', {
        fallback: primary.colaborador_snapshot || primary.dados || null
      });
      if(primary.colaborador_id){
        prepostoFields.colaborador.value = primary.colaborador_id;
      }
    }
    renderPrepostos();
    updatePrepostoInsertAvailability();
  }

  function resetPrepostoState(seed){
    prepostos = [];
    prepostoEditId = null;
    prepostoState.unidadeId = sanitizeText(seed && seed.unidadeId ? seed.unidadeId : '');
    prepostoState.unidadeLabel = sanitizeText(seed && seed.unidadeLabel ? seed.unidadeLabel : '');
    prepostoState.unidadeEndereco = stripCodigoIbgeEndereco(seed && seed.unidadeEndereco ? seed.unidadeEndereco : '');
    prepostoState.colaboradores = [];
    prepostoState.colaboradorMap = new Map();
    prepostoState.colaboradoresPromise = null;
    prepostoState.lastUnidadeId = '';
    populateColaboradorSelect('');
    clearPrepostoForm();
    renderPrepostos();
    setPrepostoButtonLabel('insert');
    togglePrepostoCancel(false);
    updatePrepostoInsertAvailability();
  }

  function bindPrepostoActions(){
    if(prepostosBound) return;
    if(!prepostoForm || !addPrepostoBtn) return;
    prepostosBound = true;
    addPrepostoBtn.addEventListener('click', handleAddPreposto);
    if(prepostoListEl){
      prepostoListEl.addEventListener('click', handlePrepostoListClick);
    }
    if(prepostoFields.colaborador){
      prepostoFields.colaborador.addEventListener('change', handleColaboradorChange);
    }
    if(prepostoCancelBtn){
      prepostoCancelBtn.addEventListener('click', handleCancelPrepostoEdit);
    }
    if(prepostoClearBtn){
      prepostoClearBtn.addEventListener('click', () => {
        clearPrepostoForm({ keepColaborador: true });
      });
    }
    if(prepostoForm){
      const cleanInvalid = event => {
        const target = event.target;
        if(target && target.classList && target.classList.contains('is-invalid')){
          target.classList.remove('is-invalid');
        }
      };
      prepostoForm.addEventListener('input', cleanInvalid);
      prepostoForm.addEventListener('change', cleanInvalid);
    }
    if(prepostoFields.telefone) bindTelefoneMask(prepostoFields.telefone);
    updatePrepostoInsertAvailability();
  }

  function normalizeCessionarioEntry(entry){
    if(!entry) return null;
    let clone;
    try{ clone = JSON.parse(JSON.stringify(entry)); }
    catch(_err){ try{ clone = { ...entry }; } catch(_inner){ clone = entry; } }
    if(!clone) return null;
    const id = sanitizeText(clone.id || clone.uuid || clone.key || `cessionario-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const unidadeId = sanitizeText(clone.unidade_id || clone.unidadeId || (clone.unidade && (clone.unidade._id || clone.unidade.id)) || '');
    const unidadeLabel = sanitizeText(clone.unidade_label || clone.unidadeLabel || (clone.unidade && (clone.unidade.nome || clone.unidade.label)) || '');
    const habitacaoId = sanitizeText(clone.habitacao_id || clone.habitacaoId || (clone.habitacao && (clone.habitacao._id || clone.habitacao.id)) || '');
    const habitacaoLabel = sanitizeText(clone.habitacao_label || clone.habitacaoLabel || (clone.habitacao && (clone.habitacao.label || buildHabitacaoLabel(clone.habitacao))) || '');
    const moradorId = sanitizeText(clone.morador_id || clone.moradorId || (clone.morador && (clone.morador._id || clone.morador.id)) || '');
    const moradorNome = sanitizeText(clone.morador_nome || clone.moradorNome || clone.nome || '');
    const cpfDigits = sanitizeText(clone.cpf || (clone.dados && clone.dados.cpf) || '').replace(/\D/g,'');
    const dataIso = sanitizeText(clone.data_nascimento || (clone.dados && clone.dados.data_nascimento) || '');
    const dataBr = sanitizeText(clone.data_nascimento_br || (clone.dados && clone.dados.data_nascimento_br) || (dataIso ? formatIsoToBr(dataIso) : ''));
    const rawSexoValue = sanitizeText(clone.sexo || (clone.dados && clone.dados.sexo) || '');
    const rawSexoLabel = sanitizeText(clone.sexo_label || (clone.dados && clone.dados.sexo_label) || '');
    const sexo = normalizeSexoValue(rawSexoValue) || normalizeSexoValue(rawSexoLabel) || (rawSexoValue ? rawSexoValue.toUpperCase() : '');
    const sexoLabel = resolveSexoLabel(sexo, rawSexoLabel);
    const dadosClone = clone.dados && typeof clone.dados === 'object'
      ? { ...clone.dados }
      : {};
    const telefoneDigitsSeed = sanitizeText(clone.telefone_digits || (clone.dados && clone.dados.telefone_digits) || '');
    const telefoneDigits = telefoneDigitsSeed
      ? telefoneDigitsSeed.replace(/\D/g, '').slice(0, 11)
      : sanitizeText(clone.telefone || (clone.dados && clone.dados.telefone) || '').replace(/\D/g, '').slice(0, 11);
    const telefoneFormattedFallback = sanitizeText((clone.telefone_formatado || (clone.dados && clone.dados.telefone_formatado) || clone.telefone || (clone.dados && clone.dados.telefone) || ''));
    const telefoneFormatted = formatTelefone(telefoneDigits) || telefoneFormattedFallback;
    if(dadosClone){
      dadosClone.endereco = stripCodigoIbgeEndereco(dadosClone.endereco);
      dadosClone.sexo = sexo;
      dadosClone.sexo_label = sexoLabel;
      dadosClone.telefone_digits = telefoneDigits;
      dadosClone.telefone = telefoneDigits;
      dadosClone.telefone_formatado = telefoneFormatted;
    }
    const moradorSnapshot = clone.morador_snapshot || clone.morador || null;
    const enrichedMoradorSnapshot = enrichMoradorSexo(moradorSnapshot);
    return {
      id,
      unidade_id: unidadeId,
      unidade_label: unidadeLabel,
      habitacao_id: habitacaoId,
      habitacao_label: habitacaoLabel,
      morador_id: moradorId,
      morador_nome: moradorNome,
      nome: sanitizeText(clone.nome || (clone.dados && clone.dados.nome) || moradorNome),
      pai: sanitizeText(clone.pai || (clone.dados && clone.dados.pai) || ''),
      mae: sanitizeText(clone.mae || (clone.dados && clone.dados.mae) || ''),
      rg: sanitizeText(clone.rg || (clone.dados && clone.dados.rg) || ''),
      cpf: cpfDigits,
      cpf_formatado: formatCpf(cpfDigits),
      data_nascimento: dataIso,
      data_nascimento_br: dataBr,
      sexo,
      sexo_label: sexoLabel,
      endereco: stripCodigoIbgeEndereco(clone.endereco || (clone.dados && clone.dados.endereco) || ''),
      estado_civil: sanitizeText(clone.estado_civil || (clone.dados && clone.dados.estado_civil) || ''),
      estado_civil_label: sanitizeText(clone.estado_civil_label || (clone.dados && clone.dados.estado_civil_label) || ''),
      profissao: sanitizeText(clone.profissao || (clone.dados && clone.dados.profissao) || ''),
      nacionalidade: sanitizeText(clone.nacionalidade || (clone.dados && clone.dados.nacionalidade) || ''),
      nacionalidade_label: sanitizeText(clone.nacionalidade_label || (clone.dados && clone.dados.nacionalidade_label) || ''),
      email: sanitizeText(clone.email || (clone.dados && clone.dados.email) || ''),
      telefone: telefoneDigits,
      telefone_formatado: telefoneFormatted,
      telefone_digits: telefoneDigits,
      whatsapp: typeof clone.whatsapp === 'boolean' ? clone.whatsapp : !!(clone.dados && clone.dados.whatsapp),
      dados: dadosClone,
      unidade_snapshot: clone.unidade_snapshot || clone.unidade || null,
      habitacao_snapshot: clone.habitacao_snapshot || clone.habitacao || null,
      morador_snapshot: enrichedMoradorSnapshot
    };
  }

  function hydrateCessionariosFromSnapshot(){
    if(!snapshot) return;
    const source = Array.isArray(snapshot.cessionarios) ? snapshot.cessionarios.slice(0, 1) : [];
    cessionarios = source.map(normalizeCessionarioEntry).filter(Boolean);
    cessionarios.forEach(entry => {
      if(entry.habitacao_id && entry.habitacao_snapshot && !cessionarioState.habitacaoMap.has(entry.habitacao_id)){
        cessionarioState.habitacaoMap.set(entry.habitacao_id, entry.habitacao_snapshot);
      }
      if(entry.morador_id){
        const baseSnapshot = entry.morador_snapshot && typeof entry.morador_snapshot === 'object'
          ? entry.morador_snapshot
          : {};
        const mergedSnapshot = {
          ...baseSnapshot,
          sexo: baseSnapshot.sexo || entry.sexo || (baseSnapshot.genero || ''),
          sexo_label: baseSnapshot.sexo_label || entry.sexo_label || baseSnapshot.genero_label || ''
        };
        if(!mergedSnapshot._id) mergedSnapshot._id = entry.morador_id;
        if(!mergedSnapshot.id) mergedSnapshot.id = entry.morador_id;
        if(!mergedSnapshot.nome && entry.morador_nome) mergedSnapshot.nome = entry.morador_nome;
        const enriched = enrichMoradorSexo(mergedSnapshot);
        entry.morador_snapshot = enriched;
        cessionarioState.moradoresById.set(entry.morador_id, enriched);
      }
    });
    renderCessionarios();
  }

  function resetCessionarioState(seed){
    const seedData = seed || {};
    cessionarios = [];
    cessionarioEditId = null;
    cessionarioState.unidadeId = sanitizeText(seedData.unidadeId || '');
    cessionarioState.unidadeLabel = sanitizeText(seedData.unidadeLabel || '');
    cessionarioState.unidadeEndereco = stripCodigoIbgeEndereco(seedData.unidadeEndereco || '');
    cessionarioState.habitacoes = [];
    cessionarioState.habitacaoMap = new Map();
    cessionarioState.moradoresById = new Map();
    cessionarioState.habitacoesPromise = null;
    cessionarioState.lastHabitacoesUnidadeId = '';
    clearCessionarioForm();
    renderCessionarios();
    setCessionarioButtonLabel('insert');
    updateCessionarioInsertAvailability();
  }

  function bindCessionarioActions(){
    if(cessionariosBound) return;
    if(!cessionarioForm || !cessionarioListEl || !addCessionarioBtn) return;
    cessionariosBound = true;
    addCessionarioBtn.addEventListener('click', handleAddCessionario);
    cessionarioListEl.addEventListener('click', handleCessionarioListClick);
    if(cessionarioFields.habitacao){
      cessionarioFields.habitacao.addEventListener('change', handleHabitacaoChange);
    }
    if(cessionarioFields.morador){
      cessionarioFields.morador.addEventListener('change', handleMoradorChange);
    }
    bindTelefoneMask(cessionarioFields.telefone);
    if(cessionarioCancelBtn){
      cessionarioCancelBtn.addEventListener('click', handleCancelCessionarioEdit);
    }
    if(cessionarioClearBtn){
      cessionarioClearBtn.addEventListener('click', () => {
        clearCessionarioForm({ keepHab: true });
      });
    }
    cessionarioForm.addEventListener('input', event => {
      const target = event.target;
      if(target && target.classList.contains('is-invalid')) target.classList.remove('is-invalid');
    });
    cessionarioForm.addEventListener('change', event => {
      const target = event.target;
      if(target && target.classList.contains('is-invalid')) target.classList.remove('is-invalid');
    });
    updateCessionarioInsertAvailability();
  }

  function ensureDatepickerScript(){
    const hasScript = !!document.querySelector('script[src*="/gestor/js/core/simple-datepicker.js"]');
    if(!hasScript){
      const script = document.createElement('script');
      script.src = '/gestor/js/core/simple-datepicker.js';
      document.head.appendChild(script);
    }
  }

  function parseDateBr(value){
    if(typeof value !== 'string') return null;
    const parts = value.trim().split('/');
    if(parts.length !== 3) return null;
    const [diaStr, mesStr, anoStr] = parts;
    const dia = Number(diaStr);
    const mes = Number(mesStr);
    const ano = Number(anoStr);
    if(!Number.isInteger(dia) || !Number.isInteger(mes) || !Number.isInteger(ano)) return null;
    if(dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 1900) return null;
    const date = new Date(ano, mes - 1, dia);
    if(Number.isNaN(date.getTime())) return null;
    if(date.getDate() !== dia || date.getMonth() !== mes - 1 || date.getFullYear() !== ano) return null;
    return date;
  }

  function formatDateBr(date){
    if(!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const ano = date.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }

  function ensureReservaDates(){
    const dataInicialInput = modalEl.querySelector('#cederDataInicial');
    if(!dataInicialInput) return;
    if(dataInicialInput.dataset.bound === 'true') return;
    dataInicialInput.dataset.bound = 'true';

    const handleBaseDateChange = () => {
      renderRepeatSummary();
      renderRepeatCalendar();
    };

    dataInicialInput.addEventListener('change', handleBaseDateChange);
    dataInicialInput.addEventListener('input', handleBaseDateChange);
  }

  ensureDatepickerScript();
  ensureReservaDates();
  bindRepeatControls();
  bindStepper();
  bindReservaActions();
  bindCessionarioActions();
  bindPrepostoActions();
  resetCessionarioState({});
  resetPrepostoState({});
  setReservaButtonLabel('insert');
  renderReservas();
  updateStepperControls();
  updateResumoArea(null);

  window.WDG_AC_CESSAO = {
    abrir: open,
    fechar: close
  };
})();
