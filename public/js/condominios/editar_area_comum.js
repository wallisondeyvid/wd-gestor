(function(){
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');

  const form = document.getElementById('formPesquisaArea');
  const selUnidade = document.getElementById('fAreaUnidade');
  const selStatus = document.getElementById('fAreaStatus');
  const inpNome = document.getElementById('fAreaNome');
  const tbody = document.getElementById('areaResultadosBody');
  const tplLinha = document.getElementById('tplLinhaArea');
  const pager = document.getElementById('areaPaginas');
  const pageSizeSel = document.getElementById('areaPageSize');
  const tableWrap = document.getElementById('areaResultadoWrap');

  const state = { page: 1, size: parseInt(pageSizeSel?.value || '50', 10), total: 0, data: [] };
  let fullData = [];
  const habitacaoCache = new Map();
  let filterTimer = null;
  let reloadTimer = null;

  function showToast(message, type){
    const text = Array.isArray(message) ? message.filter(Boolean).join('\n') : String(message || '');
    if(!text) return;
    let container = document.getElementById('toastContainerAreasEditar');
    if(!container){
      container = document.createElement('div');
      container.id = 'toastContainerAreasEditar';
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
    toast.innerHTML = '<div class="d-flex"><div class="toast-body">' + text.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>') + '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>';
    container.appendChild(toast);
    const removeToast = () => { try { toast.remove(); } catch(_){} };
    const closeBtn = toast.querySelector('.btn-close');
    if(closeBtn) closeBtn.addEventListener('click', removeToast);
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(removeToast, 320);
    }, 3600);
  }

  async function getJson(url){
    try{
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      return await res.json();
    }catch(err){
      console.warn('[editar_area_comum] fetch falhou', url, err);
      return null;
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

  function getAreaUnidadeId(area){
    if(!area || typeof area !== 'object') return '';
    if(area.unidade_id) return String(area.unidade_id);
    if(area.unidade && (area.unidade._id || area.unidade.id)) return String(area.unidade._id || area.unidade.id);
    if(area._unidadeId) return String(area._unidadeId);
    return '';
  }

  function formatHabitacaoLabelForArea(hab){
    if(!hab || typeof hab !== 'object') return 'Habitação';
    const partes = [];
    const bloco = hab.bloco && (hab.bloco.nome || hab.bloco.label);
    if(bloco) partes.push(String(bloco));
    const andar = hab.andar && (hab.andar.nome || hab.andar.label);
    if(andar) partes.push(String(andar));
    const numero = hab.numero || hab.identificador || hab.codigo || hab.nome || hab.label;
    if(numero) partes.push(String(numero));
    if(!partes.length && hab.tipo) partes.push(String(hab.tipo));
    return partes.join(' - ') || 'Habitação';
  }

  function mapHabitacoesEMoradores(rawList){
    const habitacoes = [];
    const moradores = [];
    if(!Array.isArray(rawList)) return { habitacoes, moradores };
    rawList.forEach(h => {
      if(!h || !h._id) return;
      const habId = String(h._id);
      const label = formatHabitacaoLabelForArea(h);
      const unidadeId = h.unidade_id || (h.unidade && (h.unidade._id || h.unidade.id));
      const unidadePayload = h.unidade && typeof h.unidade === 'object' ? (cloneData(h.unidade) || h.unidade) : null;
      const habItem = {
        _id: habId,
        unidade_id: unidadeId ? String(unidadeId) : undefined,
        unidade: unidadePayload || undefined,
        label,
        nome: h.numero || label,
        numero: h.numero || '',
        bloco: h.bloco || null,
        andar: h.andar || null,
        tipo: h.tipo || '',
        moradores: Array.isArray(h.moradores) ? h.moradores.map(m => m && m._id ? String(m._id) : null).filter(Boolean) : []
      };
      habitacoes.push(habItem);
      if(Array.isArray(h.moradores)){
        h.moradores.forEach(m => {
          if(!m || !m._id) return;
          const moradorItem = {
            _id: String(m._id),
            nome: m.nome || 'Morador',
            habitacao_id: habId,
            habitacaoId: habId,
            habitacao: label,
            inquilino: !!m.inquilino
          };
          if(m.cpf) moradorItem.cpf = String(m.cpf);
          if(m.rg) moradorItem.rg = String(m.rg);
          if(m.email) moradorItem.email = String(m.email);
          if(m.telefone) moradorItem.telefone = String(m.telefone);
          if(m.data_nascimento) moradorItem.data_nascimento = m.data_nascimento;
          if(m.cond_usuario_id) moradorItem.cond_usuario_id = String(m.cond_usuario_id);
          const extraKeys = [
            'pai','mae','nome_pai','nome_mae','filiacao_pai','filiacao_mae',
            'documento_rg','documento','estado_civil','estadoCivil','profissao','ocupacao',
            'nascimento','dt_nascimento','celular','whatsapp','telefone_whatsapp','tem_whatsapp',
            'whatsapp_flag','whatsapp_indicador','endereco','endereco_completo','logradouro','numero',
            'complemento','bairro','cidade','estado','cep'
          ];
          extraKeys.forEach(key => {
            if(m[key] !== undefined && m[key] !== null && m[key] !== ''){
              moradorItem[key] = m[key];
            }
          });
          moradores.push(moradorItem);
        });
      }
    });
    return { habitacoes, moradores };
  }

  async function carregarHabitacoesParaArea(area){
    const unidadeId = getAreaUnidadeId(area);
    if(!unidadeId) return { habitacoes: [], moradores: [] };
    if(habitacaoCache.has(unidadeId)){
      const cached = habitacaoCache.get(unidadeId);
      return {
        habitacoes: cloneData(cached.habitacoes) || cached.habitacoes.slice(),
        moradores: cloneData(cached.moradores) || cached.moradores.slice()
      };
    }
    const url = `${basePath}/api/habitacoes/busca?unidade=${encodeURIComponent(unidadeId)}&_ts=${Date.now()}`;
    const data = await getJson(url);
    if(!Array.isArray(data)) return { habitacoes: [], moradores: [] };
    const mapped = mapHabitacoesEMoradores(data);
    habitacaoCache.set(unidadeId, {
      habitacoes: mapped.habitacoes.slice(),
      moradores: mapped.moradores.slice()
    });
    return mapped;
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
        const statusMsg = res.status === 503 ? 'Banco indisponível. Tente novamente em instantes.' : 'Falha na solicitação (' + res.status + ')';
        const msg = payload && (payload.error || payload.detail) ? String(payload.error || payload.detail) : statusMsg;
        showToast(msg, res.status >= 500 ? 'danger' : 'warning');
        console.warn('[editar_area_comum] requisição retornou erro', { url, status: res.status, payload });
        return { ok: false, status: res.status, payload };
      }
      return { ok: true, status: res.status, payload };
    }catch(err){
      console.warn('[editar_area_comum] request falhou', url, err);
      showToast('Não foi possível se conectar ao servidor.', 'danger');
      return { ok: false, error: err };
    }
  }

  function normalizeUnidade(unidade, item){
    if(!unidade){
      const altId = item?.unidade_id || item?.unidadeId || '';
      return { _id: altId, nome: '', codigo: '' };
    }
    if(typeof unidade === 'string') return { _id: unidade, nome: unidade, codigo: '' };
    const id = unidade._id || unidade.id || unidade.codigo || unidade.nome || '';
    return { ...unidade, _id: String(id || '') };
  }

  function formatUnidadeLabel(unidade){
    if(!unidade) return '—';
    const codigo = (unidade.codigo || '').toString().trim();
    const nome = (unidade.nome || '').toString().trim();
    return [codigo, nome].filter(Boolean).join(' - ') || nome || codigo || '—';
  }

  function formatAreaM2(value){
    if(value == null || value === '') return '';
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if(!isFinite(num)) return '';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' m²';
  }

  function detectarStatus(item){
    if(!item || typeof item !== 'object') return 'ativo';
    if(item.ativo === false) return 'inativo';
    const status = (item.status || item.situacao || '').toString().toLowerCase();
    if(/inativ|desativ|bloquead/.test(status)) return 'inativo';
    return 'ativo';
  }

  function prepararItem(item){
    if(!item || typeof item !== 'object') return item;
    const unidadeNorm = normalizeUnidade(item.unidade, item);
    return {
      ...item,
      unidade: unidadeNorm,
      _unidadeId: unidadeNorm._id || '',
      _unidadeLabel: formatUnidadeLabel(unidadeNorm),
      _status: detectarStatus(item)
    };
  }

  async function carregarAreas(options){
    const url = basePath + '/api/areas-comuns/busca';
    const data = await getJson(url);
    const list = Array.isArray(data) ? data : (data && data.items) || [];
    fullData = list.map(prepararItem);
    atualizarOpcaoUnidade();
    aplicarFiltros(true);
  }

  function atualizarOpcaoUnidade(){
    if(!selUnidade) return;
    if(!fullData.length){
      selUnidade.innerHTML = '<option value="">Todos</option>';
      selUnidade.disabled = true;
      return;
    }
    const mapa = new Map();
    fullData.forEach(item => {
      if(!item || !item._unidadeId) return;
      if(!mapa.has(item._unidadeId)) mapa.set(item._unidadeId, item._unidadeLabel || 'Condomínio');
    });
    const options = Array.from(mapa.entries()).sort((a,b) => a[1].localeCompare(b[1], 'pt-BR'));
    let html = '<option value="">Todos</option>';
    html += options.map(([value,label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
    selUnidade.innerHTML = html;
    selUnidade.disabled = false;
    if(options.length === 1) selUnidade.value = options[0][0];
  }

  function aplicarFiltros(initial){
    if(!fullData.length){
      state.data = [];
      state.total = 0;
      state.page = 1;
      renderTabela();
      return;
    }
    const unidadeSel = selUnidade?.value || '';
    const statusSel = selStatus?.value || '';
    const nomeTerm = (inpNome?.value || '').trim().toLowerCase();
    const filtered = fullData.filter(item => {
      if(!item) return false;
      if(unidadeSel && item._unidadeId !== unidadeSel) return false;
      if(statusSel === 'ativas' && item._status !== 'ativo') return false;
      if(statusSel === 'inativas' && item._status !== 'inativo') return false;
      if(nomeTerm){
        const nome = (item.nome || '').toString().toLowerCase();
        if(!nome.includes(nomeTerm)) return false;
      }
      return true;
    });
    state.data = filtered;
    state.total = filtered.length;
    state.page = 1;
    renderTabela();
  }

  function scheduleFilter(){
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => aplicarFiltros(false), 150);
  }

  function scheduleReload(){
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => carregarAreas({ initialRun: false }), 200);
  }

  function renderTabela(){
    tbody.innerHTML = '';
    const total = state.total;
    if(!total){
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'text-center text-muted py-4';
      td.textContent = 'Nenhuma área encontrada.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      buildPager();
      applyScrollLimit();
      return;
    }
    const size = state.size;
    const maxPage = Math.max(1, Math.ceil(total / size));
    if(state.page > maxPage) state.page = maxPage;
    const start = (state.page - 1) * size;
    const slice = state.data.slice(start, start + size);
    slice.forEach(item => tbody.appendChild(buildRow(item)));
    buildPager();
    applyScrollLimit();
  }

  function setCellBlock(cell, primary, secondary){
    if(!cell) return;
    cell.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'wdg-area-stack';
    const main = document.createElement('span');
    main.className = 'wdg-area-primary';
    const textoPrincipal = (primary != null ? String(primary) : '').trim() || '—';
    main.textContent = textoPrincipal;
    wrap.appendChild(main);
    const secundario = (secondary != null ? String(secondary) : '').trim();
    if(secundario){
      const sub = document.createElement('span');
      sub.className = 'wdg-area-secondary';
      sub.textContent = secundario;
      wrap.appendChild(sub);
    }
    cell.appendChild(wrap);
  }

  function createChip(options){
    const opts = options || {};
    const tag = opts.href ? 'a' : (typeof opts.onClick === 'function' ? 'button' : 'span');
    const el = document.createElement(tag);
    el.className = 'wdg-area-chip';
    if(tag === 'button') el.type = 'button';
    if(opts.variant) el.dataset.variant = opts.variant;
    if(tag === 'a'){
      el.href = opts.href;
      if(opts.target) el.target = opts.target;
      el.rel = opts.rel || 'noopener';
      el.classList.add('wdg-area-chip--link');
    }
    if(typeof opts.onClick === 'function'){
      el.classList.add('wdg-area-chip--link');
      el.addEventListener('click', ev => {
        ev.preventDefault();
        opts.onClick(ev);
      });
    }
    if(opts.icon){
      const icon = document.createElement('i');
      icon.className = opts.icon;
      el.appendChild(icon);
    }
    const label = document.createElement('span');
    label.className = 'wdg-area-chip-text';
    label.textContent = opts.text || '';
    el.appendChild(label);
    if(opts.title) el.title = opts.title;
    return el;
  }

  function appendChipRow(cell, chips, options){
    if(!cell) return;
    cell.innerHTML = '';
    const list = Array.isArray(chips) ? chips.filter(Boolean) : [];
    if(!list.length){
      const empty = document.createElement('span');
      empty.className = 'wdg-area-empty';
      empty.textContent = '—';
      cell.appendChild(empty);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'wdg-area-chip-row';
    if(options && options.layout === 'column'){
      wrap.dataset.layout = 'column';
    }
    list.forEach(chip => wrap.appendChild(chip));
    cell.appendChild(wrap);
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

  function updateTermoUsoIndicatorInRow(row, regrasTexto){
    if(!row) return;
    const cell = row.querySelector('.area-col-area');
    if(!cell) return;
    const stack = cell.querySelector('.wdg-area-stack');
    if(!stack) return;
    const existing = stack.querySelector('.wdg-area-termo');
    if(existing) existing.remove();
    const lista = parseRegrasUsoList(regrasTexto);
    if(!lista.length) return;
    const chipRow = document.createElement('div');
    chipRow.className = 'wdg-area-chip-row wdg-area-termo';
    chipRow.dataset.layout = 'row';
    chipRow.style.marginTop = '.35rem';
    const count = lista.length;
    const label = count > 1 ? `Regras de uso (${count})` : 'Regra de uso';
    const preview = lista.slice(0, 5).join('\n');
    const chip = createChip({
      text: label,
      variant: 'primary',
      icon: 'bi bi-file-text',
      title: preview
    });
    chip.classList.add('wdg-area-termo-chip');
    chipRow.appendChild(chip);
    stack.appendChild(chipRow);
  }

  function buildRow(item){
    if(!tplLinha || !tplLinha.content){
      const trFallback = document.createElement('tr');
      trFallback.innerHTML = '<td colspan="5">Estrutura de linha indisponível.</td>';
      return trFallback;
    }
    const tr = tplLinha.content.firstElementChild.cloneNode(true);
    if(item && item._id) tr.dataset.id = String(item._id);
    const unidadeLabel = item._unidadeLabel || '—';
    const areaDetails = formatAreaM2(item.area_m2 || item.area);
    const secundario = [unidadeLabel, areaDetails].filter(Boolean).join(' · ');
    setCellBlock(tr.querySelector('.area-col-area'), item.nome || 'Área Comum', secundario);
    updateTermoUsoIndicatorInRow(tr, item.regras_uso);

    const materiaisTd = tr.querySelector('.area-col-materiais');
    appendChipRow(materiaisTd, buildMateriaisChips(item), { layout: 'column' });

    const dispTd = tr.querySelector('.area-col-disponibilidades');
    appendChipRow(dispTd, buildDisponibilidadesChips(item));

    const restrTd = tr.querySelector('.area-col-restricoes');
    appendChipRow(restrTd, buildRestricoesChips(item));

    tr.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tipo = btn.getAttribute('data-action');
        if(tipo === 'disponibilidades'){
          abrirModalDisponibilidade(item);
          return;
        }
        if(tipo === 'ceder-uso'){
          abrirModalCederParaUso(item);
          return;
        }
        if(tipo === 'restricoes'){
          abrirModalRestricoes(item);
          return;
        }
        if(tipo === 'materiais'){
          abrirModalMateriais(item);
          return;
        }
        if(tipo === 'termo'){
          abrirModalRegrasUso(item);
          return;
        }
        emitirAcao(tipo, item);
      });
    });

    return tr;
  }

  function normalizeMaterialNome(source){
    if(source == null) return 'Material';
    if(typeof source === 'string') return source.trim() || 'Material';
    const base = source.nome || source.descricao || source.titulo || source.label || source.tipo || source.categoria;
    const texto = base != null ? String(base).trim() : '';
    return texto || 'Material';
  }

  function getMaterialQuantidadeValor(source){
    if(!source || typeof source !== 'object') return 1;
    const origem = source.quantidade ?? source.qtd ?? source.qde ?? source.quantidade_total;
    if(origem == null || origem === '') return 1;
    const numero = Number(origem);
    if(Number.isFinite(numero) && numero > 0) return numero;
    return 1;
  }

  function buildMaterialDetalhe(source){
    if(!source || typeof source !== 'object') return '';
    const patrimonio = source.patrimonio || source.serie || source.num_serie || source.codigo || source.codigo_patrimonio;
    if(patrimonio) return '#' + String(patrimonio).trim();
    const marcaModelo = [source.marca, source.modelo]
      .map(part => (part != null ? String(part).trim() : ''))
      .filter(Boolean)
      .join(' / ');
    if(marcaModelo) return marcaModelo;
    return '';
  }

  function buildMateriaisChips(item){
    const lista = Array.isArray(item.materiais) ? item.materiais : [];
    if(!lista.length) return [];
    const grupos = new Map();
    lista.forEach(mat => {
      const nome = normalizeMaterialNome(mat);
      const key = nome.toLowerCase();
      const grupo = grupos.get(key) || { nome, quantidade: 0, detalhes: [] };
      grupo.quantidade += getMaterialQuantidadeValor(mat);
      const detalhe = buildMaterialDetalhe(mat);
      if(detalhe) grupo.detalhes.push(detalhe);
      grupos.set(key, grupo);
    });
    const agrupados = Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'accent' }));
    const chips = agrupados.slice(0, 3).map(grupo => {
      const texto = grupo.quantidade > 1 ? `${grupo.nome} (${grupo.quantidade})` : grupo.nome;
      const titleParts = [texto];
      if(grupo.detalhes.length){
        const detalhesPreview = grupo.detalhes.slice(0, 5).join(', ');
        titleParts.push(detalhesPreview);
        if(grupo.detalhes.length > 5){
          titleParts.push(`+${grupo.detalhes.length - 5} registros`);
        }
      }
      return createChip({
        text: texto,
        variant: 'accent',
        icon: 'bi bi-box-seam',
        title: titleParts.join('\n')
      });
    });
    if(agrupados.length > 3){
      chips.push(createChip({
        text: '+' + (agrupados.length - 3),
        variant: 'muted',
        icon: 'bi bi-plus-lg'
      }));
    }
    return chips;
  }

  function buildDisponibilidadesChips(item){
    const lista = Array.isArray(item.disponibilidades) ? item.disponibilidades : [];
    if(!lista.length) return [];
    const dayMap = {
      sunday: 'Dom', monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui', friday: 'Sex', saturday: 'Sáb'
    };
    const chips = lista.map(dis => {
      if(dis && typeof dis === 'object'){
        const dayId = String(dis.day || dis.dia || dis.weekday || '').toLowerCase();
        const dayLabel = dayMap[dayId] || (dis.day_label || dis.label || 'Dia');
        const intervals = Array.isArray(dis.intervals) ? dis.intervals : (Array.isArray(dis.horarios) ? dis.horarios : []);
        const formatted = intervals.map(intervalo => {
          if(typeof intervalo === 'string') return intervalo;
          if(intervalo && typeof intervalo === 'object'){
            const start = intervalo.start || intervalo.inicio || intervalo.from || intervalo.de || intervalo.hora_inicio || '';
            const end = intervalo.end || intervalo.fim || intervalo.to || intervalo.ate || intervalo.hora_fim || '';
            if(start && end) return `${start} - ${end}`;
          }
          return '';
        }).filter(Boolean);
        const texto = formatted.length ? `${dayLabel} · ${formatted.join(', ')}` : `${dayLabel}`;
        return createChip({
          text: texto,
          variant: 'success',
          icon: 'bi bi-clock-history',
          title: formatted.length ? texto : `${dayLabel} disponível`
        });
      }
      const titulo = (typeof dis === 'string') ? dis : (dis.nome || dis.titulo || 'Disponibilidade');
      return createChip({
        text: titulo,
        variant: 'success',
        icon: 'bi bi-clock'
      });
    });
    return chips;
  }

  function buildRestricoesChips(item){
    const lista = Array.isArray(item.restricoes) ? item.restricoes : [];
    if(!lista.length) return [];
    const formatDate = raw => {
      if(!raw) return '';
      const str = String(raw).trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      const [y,m,d] = str.split('-');
      return `${d}/${m}/${y}`;
    };
    const extract = res => {
      if(res && typeof res === 'object'){
        const date = res.date || res.data || res.dia || res.day || '';
        const inicio = res.start || res.inicio || res.from || res.de || res.hora_inicio || '';
        const fim = res.end || res.fim || res.to || res.ate || res.hora_fim || '';
        const obs = res.observacao || res.obs || res.justificativa || res.motivo || '';
        const labelParts = [];
        const dateLabel = formatDate(date);
        if(dateLabel) labelParts.push(dateLabel);
        const timeLabel = inicio && fim ? `${inicio} - ${fim}` : (inicio || fim || '—');
        if(timeLabel) labelParts.push(timeLabel);
        const text = labelParts.join(' · ') || 'Restrição';
        const titleParts = [text];
        if(obs) titleParts.push(String(obs));
        return { text, title: titleParts.join('\n') };
      }
      const titulo = (typeof res === 'string') ? res : (res && (res.nome || res.titulo)) || 'Restrição';
      return { text: titulo, title: titulo };
    };
    const chips = lista.slice(0, 3).map(res => {
      const info = extract(res);
      return createChip({
        text: info.text,
        variant: 'danger',
        icon: 'bi bi-slash-circle',
        title: info.title
      });
    });
    if(lista.length > 3){
      chips.push(createChip({
        text: '+' + (lista.length - 3),
        variant: 'muted',
        icon: 'bi bi-plus-lg'
      }));
    }
    return chips;
  }

  async function salvarDisponibilidadesBackend(areaId, schedule){
    if(!areaId){
      showToast('Não foi possível identificar a área selecionada. Atualize a página e tente novamente.', 'warning');
      return { ok: false, reason: 'missing-id' };
    }
    const normalized = normalizeSchedulePayload(schedule);
    const payload = { disponibilidades: normalized };
    const result = await sendJson(basePath + '/api/areas-comuns/' + encodeURIComponent(areaId), 'PUT', payload);
    if(result.ok){
      showToast('Disponibilidades atualizadas.', 'success');
    }
    return result;
  }

  async function salvarRestricoesBackend(areaId, restrictions){
    if(!areaId){
      showToast('Não foi possível identificar a área selecionada. Atualize a página e tente novamente.', 'warning');
      return { ok: false, reason: 'missing-id' };
    }
    const normalized = normalizeRestrictionsPayload(restrictions);
    const payload = { restricoes: normalized };
    const result = await sendJson(basePath + '/api/areas-comuns/' + encodeURIComponent(areaId), 'PUT', payload);
    if(result.ok){
      showToast('Restrições atualizadas.', 'success');
    }
    return { ...result, normalized };
  }

  async function salvarRegrasUsoBackend(areaId, regrasTexto){
    if(!areaId){
      showToast('Não foi possível identificar a área selecionada. Atualize a página e tente novamente.', 'warning');
      return { ok: false, reason: 'missing-id' };
    }
    const texto = typeof regrasTexto === 'string' ? regrasTexto : '';
    const payload = { regras_uso: texto };
    const result = await sendJson(basePath + '/api/areas-comuns/' + encodeURIComponent(areaId), 'PUT', payload);
    if(result.ok){
      const persisted = typeof result.payload?.regras_uso === 'string' ? result.payload.regras_uso : texto;
      const hasRules = !!persisted.trim();
      showToast(hasRules ? 'Regras de uso atualizadas.' : 'Regras de uso removidas.', hasRules ? 'success' : 'secondary');
    }
    return result;
  }

  function abrirModalCederParaUso(item){
    if(!window.WDG_AC_CESSAO || typeof window.WDG_AC_CESSAO.abrir !== 'function'){
      console.warn('[editar_area_comum] modal de cessão indisponível');
      emitirAcao('ceder-uso', item);
      return;
    }
    const payload = {
      area: cloneData(item) || item,
      areaId: item && item._id ? String(item._id) : ''
    };
    try{
      window.WDG_AC_CESSAO.abrir(payload).then(result => {
        const detail = {
          area: payload.area,
          areaId: payload.areaId,
          result
        };
        document.dispatchEvent(new CustomEvent('area-comum:cessao:aberta', { detail }));
      }).catch(err => {
        console.warn('[editar_area_comum] erro ao abrir modal de cessão', err);
        emitirAcao('ceder-uso', item);
      });
    }catch(err){
      console.warn('[editar_area_comum] falha ao abrir modal de cessão', err);
      emitirAcao('ceder-uso', item);
    }
  }

  function abrirModalRestricoes(item){
    if(!window.WDG_AC_RESTR || typeof window.WDG_AC_RESTR.abrir !== 'function'){
      console.warn('[editar_area_comum] modal de restrições indisponível');
      emitirAcao('restricoes', item);
      return;
    }
    const payload = {
      area: item,
      restricoes: Array.isArray(item.restricoes) ? item.restricoes : []
    };
    try{
      window.WDG_AC_RESTR.abrir(payload).then(async result => {
        if(result && Array.isArray(result.restrictions)){
          const areaId = item && item._id ? String(item._id) : '';
          if(!areaId){
            showToast('Não foi possível salvar as restrições: área sem identificador.', 'warning');
            return;
          }
          const saveResult = await salvarRestricoesBackend(areaId, result.restrictions);
          if(!saveResult || !saveResult.ok) return;
          const savedList = Array.isArray(saveResult.payload?.restricoes) ? saveResult.payload.restricoes : (saveResult.normalized || normalizeRestrictionsPayload(result.restrictions));
          item.restricoes = savedList;
          const row = tbody.querySelector(`[data-id="${areaId}"]`);
          if(row){
            appendChipRow(row.querySelector('.area-col-restricoes'), buildRestricoesChips(item));
          }
          const detail = {
            area: cloneData(item) || item,
            areaId,
            restrictions: cloneData(savedList) || savedList,
            saved: true,
            response: saveResult.payload
          };
          document.dispatchEvent(new CustomEvent('area-comum:restricao:aplicada', { detail }));
        }
      }).catch(err => {
        console.warn('[editar_area_comum] erro ao abrir modal de restrições', err);
        emitirAcao('restricoes', item);
      });
    }catch(err){
      console.warn('[editar_area_comum] falha ao abrir modal de restrições', err);
      emitirAcao('restricoes', item);
    }
  }

  function abrirModalMateriais(item){
    if(!window.WDG_AC_MATERIAL || typeof window.WDG_AC_MATERIAL.abrir !== 'function'){
      console.warn('[editar_area_comum] modal de materiais indisponível');
      emitirAcao('materiais', item);
      return;
    }
    const payload = {
      area: cloneData(item) || item,
      areaId: item && item._id ? String(item._id) : '',
      autoFetch: true
    };
    try{
      return window.WDG_AC_MATERIAL.abrir(payload).catch(err => {
        console.warn('[editar_area_comum] erro ao abrir modal de materiais', err);
        showToast('Não foi possível abrir o modal de materiais.', 'warning');
      });
    }catch(err){
      console.warn('[editar_area_comum] falha ao abrir modal de materiais', err);
      showToast('Não foi possível abrir o modal de materiais.', 'warning');
    }
  }

  function abrirModalRegrasUso(item){
    if(!window.WDG_AC_REGRAS || typeof window.WDG_AC_REGRAS.abrir !== 'function'){
      console.warn('[editar_area_comum] modal de regras de uso indisponível');
      emitirAcao('termo', item);
      return;
    }
    const areaId = item && item._id ? String(item._id) : '';
    const payload = {
      area: cloneData(item) || item,
      areaId,
      regras: item ? item.regras_uso : ''
    };
    try{
      window.WDG_AC_REGRAS.abrir(payload).then(async result => {
        if(!result) return;
        const targetAreaId = result.areaId || areaId;
        if(!targetAreaId){
          if(result.saved){
            showToast('Não foi possível salvar as regras: área sem identificador.', 'warning');
          }
          return;
        }
        if(!result.saved) return;
        const texto = typeof result.serialized === 'string' ? result.serialized : '';
        const saveResult = await salvarRegrasUsoBackend(targetAreaId, texto);
        if(!saveResult || !saveResult.ok) return;
        const savedTexto = typeof saveResult.payload?.regras_uso === 'string' ? saveResult.payload.regras_uso : texto;
        item.regras_uso = savedTexto;
        const parsedRules = Array.isArray(result.rules) && result.rules.length
          ? result.rules.map(rule => String(rule))
          : ((window.WDG_AC_REGRAS && typeof window.WDG_AC_REGRAS.parse === 'function')
            ? window.WDG_AC_REGRAS.parse(savedTexto)
            : parseRegrasUsoList(savedTexto));
        const row = tbody.querySelector(`[data-id="${targetAreaId}"]`);
        if(row){
          updateTermoUsoIndicatorInRow(row, savedTexto);
        }
        const detail = {
          area: cloneData(item) || item,
          areaId: targetAreaId,
          regras: cloneData(parsedRules) || parsedRules,
          texto: savedTexto,
          count: Array.isArray(parsedRules) ? parsedRules.length : 0,
          saved: true,
          response: saveResult.payload
        };
        document.dispatchEvent(new CustomEvent('area-comum:termo:aplicado', { detail }));
      }).catch(err => {
        console.warn('[editar_area_comum] erro ao abrir modal de regras de uso', err);
        emitirAcao('termo', item);
      });
    }catch(err){
      console.warn('[editar_area_comum] falha ao abrir modal de regras de uso', err);
      emitirAcao('termo', item);
    }
  }
  function abrirModalDisponibilidade(item){
    if(!window.WDG_AC_DISP || typeof window.WDG_AC_DISP.abrir !== 'function'){
      console.warn('[editar_area_comum] modal de disponibilidade indisponível');
      emitirAcao('disponibilidades', item);
      return;
    }
    const payload = {
      area: item,
      disponibilidades: Array.isArray(item.disponibilidades) ? item.disponibilidades : []
    };
    try{
      window.WDG_AC_DISP.abrir(payload).then(async result => {
        if(result && Array.isArray(result.schedule)){
          const areaId = item && item._id ? String(item._id) : '';
          if(!areaId){
            showToast('Não foi possível salvar as disponibilidades: área sem identificador.', 'warning');
            return;
          }
          const saveResult = await salvarDisponibilidadesBackend(areaId, result.schedule);
          if(!saveResult || !saveResult.ok) return;
          const savedList = Array.isArray(saveResult.payload?.disponibilidades) ? saveResult.payload.disponibilidades : result.schedule;
          item.disponibilidades = savedList;
          const row = tbody.querySelector(`[data-id="${areaId}"]`);
          if(row){
            appendChipRow(row.querySelector('.area-col-disponibilidades'), buildDisponibilidadesChips(item));
          }
          const savedListClone = cloneData(savedList) || savedList;
          const areaDetailBase = result.area ? { ...result.area } : cloneData(item);
          if(areaDetailBase){
            areaDetailBase.disponibilidades = savedListClone;
          }
          const detail = {
            area: areaDetailBase || item,
            areaId,
            schedule: savedListClone,
            saved: true,
            response: saveResult.payload
          };
          document.dispatchEvent(new CustomEvent('area-comum:disponibilidade:aplicada', { detail }));
        }
      }).catch(err => {
        console.warn('[editar_area_comum] erro ao abrir modal de disponibilidade', err);
        emitirAcao('disponibilidades', item);
      });
    }catch(err){
      console.warn('[editar_area_comum] falha ao abrir modal de disponibilidade', err);
      emitirAcao('disponibilidades', item);
    }
  }

  function emitirAcao(tipo, item){
    try{
      const payload = typeof structuredClone === 'function' ? structuredClone(item) : JSON.parse(JSON.stringify(item || {}));
      const event = new CustomEvent('area-comum:acao', {
        bubbles: true,
        detail: { tipo, area: payload }
      });
      document.dispatchEvent(event);
    }catch(err){
      console.warn('[editar_area_comum] falha ao emitir ação', err);
    }
  }

  function buildPager(){
    if(!pager) return;
    pager.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(state.total / state.size));
    if(totalPages <= 1){
      const info = document.createElement('div');
      info.className = 'w-100 text-center';
      info.style.fontSize = '.75rem';
      info.textContent = 'Total: ' + state.total + ' área(s)';
      pager.appendChild(info);
      return;
    }
    const windowSize = 7;
    let start = Math.max(1, state.page - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    if(end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);

    const frag = document.createDocumentFragment();
    frag.appendChild(mkBtn('«', () => { state.page = 1; renderTabela(); }, state.page === 1));
    frag.appendChild(mkBtn('‹', () => { if(state.page > 1){ state.page--; renderTabela(); } }, state.page === 1));
    for(let p = start; p <= end; p++){
      frag.appendChild(mkBtn(String(p), () => { state.page = p; renderTabela(); }, false, p === state.page));
    }
    frag.appendChild(mkBtn('›', () => { if(state.page < totalPages){ state.page++; renderTabela(); } }, state.page === totalPages));
    frag.appendChild(mkBtn('»', () => { state.page = totalPages; renderTabela(); }, state.page === totalPages));

    const info = document.createElement('div');
    info.className = 'w-100 text-center mt-1';
    info.style.fontSize = '.75rem';
    info.textContent = 'Total: ' + state.total + ' área(s)';
    frag.appendChild(info);

    pager.appendChild(frag);
  }

  function mkBtn(label, onClick, disabled, active){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wdg-pager-btn';
    b.textContent = label;
    if(disabled) b.disabled = true;
    if(active) b.classList.add('active');
    b.addEventListener('click', onClick);
    return b;
  }

  function applyScrollLimit(){
    if(!tableWrap) return;
    const count = tbody.querySelectorAll('tr').length;
    if(count > 4) tableWrap.classList.add('scroll-limit');
    else tableWrap.classList.remove('scroll-limit');
  }

  function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }

  form?.addEventListener('submit', ev => ev.preventDefault());
  selUnidade?.addEventListener('change', scheduleFilter);
  selStatus?.addEventListener('change', scheduleFilter);
  inpNome?.addEventListener('input', scheduleFilter);
  pageSizeSel?.addEventListener('change', () => {
    const parsed = parseInt(pageSizeSel.value, 10);
    state.size = (!isNaN(parsed) && parsed > 0) ? parsed : 50;
    state.page = 1;
    renderTabela();
  });

  function handleMaterialRecebido(event){
    const detail = event && event.detail ? event.detail : {};
    const response = detail.response || {};
    const transferencia = response.transferencia || {};
    const materialPayload = response.material || null;
    const destinoId = normalizeStringId(transferencia.destinoId) || extractDestinationAreaId(detail);
    const origemId = normalizeStringId(transferencia.origemId) || extractOriginAreaId(detail);
    const materialId = getMaterialSnapshotId(materialPayload) || getMaterialSnapshotId(detail.material);

    if(!materialPayload || !destinoId || !materialId){
      scheduleReload();
      return;
    }

    const removed = origemId ? removeMaterialFromArea(origemId, materialId) : true;
    if(origemId && !removed){
      scheduleReload();
      return;
    }

    const added = addMaterialToArea(destinoId, materialPayload);
    if(!added){
      scheduleReload();
      return;
    }

    renderTabela();
  }

  function normalizeStringId(value){
    if(value === null || value === undefined) return '';
    const str = String(value).trim();
    return str;
  }

  function extractOriginAreaId(detail){
    if(!detail) return '';
    const raw = detail.material && detail.material.raw;
    if(raw){
      const candidate = extractAreaIdFromPayload(raw.origem || raw.areaOrigem);
      if(candidate) return candidate;
      if(raw.transferencia && raw.transferencia.origemId){
        const transferId = normalizeStringId(raw.transferencia.origemId);
        if(transferId) return transferId;
      }
    }
    const fallback = detail.material && detail.material.origem;
    return extractAreaIdFromPayload(fallback);
  }

  function extractDestinationAreaId(detail){
    if(!detail) return '';
    const raw = detail.material && detail.material.raw;
    if(raw){
      const candidate = extractAreaIdFromPayload(raw.destino || raw.areaDestino);
      if(candidate) return candidate;
    }
    if(detail.area){
      const candidate = extractAreaIdFromPayload(detail.area);
      if(candidate) return candidate;
    }
    if(detail.areaId) return normalizeStringId(detail.areaId);
    return '';
  }

  function extractAreaIdFromPayload(payload){
    if(!payload || typeof payload !== 'object') return '';
    const fields = ['areaId', '_id', 'id', 'area_id'];
    for(const field of fields){
      if(payload[field]){
        const id = normalizeStringId(payload[field]);
        if(id) return id;
      }
    }
    return '';
  }

  function findAreaById(areaId){
    const target = normalizeStringId(areaId);
    if(!target) return null;
    return fullData.find(item => item && normalizeStringId(item._id) === target) || null;
  }

  function ensureAreaMaterialList(area){
    if(!area) return [];
    if(!Array.isArray(area.materiais)) area.materiais = [];
    return area.materiais;
  }

  function getMaterialSnapshotId(material){
    if(!material) return '';
    const fields = ['materialId', 'id', '_id'];
    for(const field of fields){
      if(material[field]){
        const id = normalizeStringId(material[field]);
        if(id) return id;
      }
    }
    return '';
  }

  function cloneMaterialSnapshot(payload){
    if(!payload || typeof payload !== 'object') return null;
    const clone = cloneData(payload) || {};
    if(clone.materialId) clone.materialId = normalizeStringId(clone.materialId);
    if(clone._id) clone._id = normalizeStringId(clone._id);
    if(clone.id) clone.id = normalizeStringId(clone.id);
    if(!clone.id && clone.materialId) clone.id = clone.materialId;
    if(!clone.materialId && clone.id) clone.materialId = clone.id;
    if(!clone.id && clone._id) clone.id = clone._id;
    if(!clone.materialId && clone._id) clone.materialId = clone._id;
    return clone;
  }

  function removeMaterialFromArea(areaId, materialId){
    const area = findAreaById(areaId);
    if(!area) return false;
    const list = ensureAreaMaterialList(area);
    if(!list.length) return false;
    const target = normalizeStringId(materialId);
    const index = list.findIndex(item => getMaterialSnapshotId(item) === target);
    if(index === -1) return false;
    list.splice(index, 1);
    return true;
  }

  function addMaterialToArea(areaId, materialPayload){
    const area = findAreaById(areaId);
    if(!area) return false;
    const list = ensureAreaMaterialList(area);
    const material = cloneMaterialSnapshot(materialPayload);
    if(!material) return false;
    const target = getMaterialSnapshotId(material);
    if(!target) return false;
    const index = list.findIndex(item => getMaterialSnapshotId(item) === target);
    if(index >= 0) list[index] = material;
    else list.push(material);
    sortMateriaisList(list);
    return true;
  }

  function sortMateriaisList(list){
    if(!Array.isArray(list) || list.length < 2) return;
    list.sort(compareMateriais);
  }

  function compareMateriais(a, b){
    const nomeA = a && a.nome ? String(a.nome) : '';
    const nomeB = b && b.nome ? String(b.nome) : '';
    const nomeComp = nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    if(nomeComp !== 0) return nomeComp;
    const patA = a && (a.patrimonio || a.serie) ? String(a.patrimonio || a.serie) : '';
    const patB = b && (b.patrimonio || b.serie) ? String(b.patrimonio || b.serie) : '';
    return patA.localeCompare(patB, 'pt-BR', { sensitivity: 'base' });
  }

  document.addEventListener('area-comum:lista:refresh', scheduleReload);
  document.addEventListener('area-comum:material:recebido', handleMaterialRecebido);

  carregarAreas({ initialRun: true });
})();
