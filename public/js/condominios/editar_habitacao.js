(function(){
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');

  // Elementos do formulário
  const form = document.getElementById('formPesquisaHab');
  const selBloco = document.getElementById('fBloco');
  const selAndar = document.getElementById('fAndar');
  const inpNumero = document.getElementById('fNumero');
  const listaNumeros = document.getElementById('listaNumeros');

  // Tabela
  const tbody = document.getElementById('habResultadosBody');
  const tplLinha = document.getElementById('tplLinhaHab');
  const pager = document.getElementById('habPaginas');
  const pageSizeSel = document.getElementById('habPageSize');
  const tableWrap = document.getElementById('habResultadoWrap');

  // Estado de paginação
  const state = { page: 1, size: parseInt(pageSizeSel?.value||'50',10), total: 0, data: [] };
  let fullData = [];
  let filterTimer = null;
  let reloadTimer = null;
  const HAB_NUMBER_SUGGESTIONS_LIMIT = 30;

  // Util: fetch JSON genérico com fallback
  async function getJson(url){
    try{
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      return await res.json();
    }catch(e){ console.warn('[editar_habitacao] fetch falhou', url, e); return null; }
  }

  function normalizeContrato(c){
    if(!c || typeof c !== 'object') return c;
    const out = { ...c };
    if(out.periodo && typeof out.periodo === 'object') out.periodo = { ...out.periodo };
    else {
      const inicio = out.vigencia_inicio || out.inicio_vigencia || out.inicio || null;
      const fim = out.vigencia_fim || out.fim_vigencia || out.fim || null;
      out.periodo = { inicio, fim };
    }
    return out;
  }
  function normalizeContratos(list){
    return Array.isArray(list) ? list.map(normalizeContrato) : [];
  }

  function formatUnidade(u){
    const cod = (u.codigo||'').toString().trim();
    const nome = (u.nome||'').toString().trim();
    return [cod, nome].filter(Boolean).join(' - ') || nome || cod || '—';
  }
  function formatPlaca(value){
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!raw) return '';
    if(raw.length <= 3) return raw;
    return raw.slice(0,3) + '-' + raw.slice(3);
  }
  function formatPetResumo(pet){
    if(!pet || typeof pet !== 'object') return '';
    const especieBase = (pet.especie || '').toLowerCase() === 'outro' && pet.especie_outro ? pet.especie_outro : pet.especie;
    const especie = (especieBase || '').trim();
    const nome = (pet.nome || '').trim();
    const raca = (pet.raca || '').trim();
    const parts = [];
    if(nome) parts.push(nome);
    if(especie) parts.push(especie);
    if(raca && (!especie || raca.toLowerCase() !== especie.toLowerCase())) parts.push(raca);
    let resumo = parts.length ? parts.join(' · ') : 'Pet';
    if(pet.aux_needs) resumo += ' · Nec. especiais';
    return resumo;
  }
  function prepararItem(item){
    if(!item || typeof item !== 'object') return item;
    const bloco = item.bloco || null;
    const andar = item.andar || null;
    const blocoId = bloco && bloco._id ? String(bloco._id) : (bloco && bloco.nome ? `nome:${bloco.nome}` : '__none__');
    const andarId = andar && andar._id ? String(andar._id) : (andar && andar.nome ? `nome:${andar.nome}` : '__none__');
    return {
      ...item,
      _blocoId: blocoId,
      _andarId: andarId,
      _blocoLabel: bloco && bloco.nome ? bloco.nome : 'Sem bloco',
      _andarLabel: andar && andar.nome ? andar.nome : 'Sem andar',
      _numeroStr: item.numero != null ? String(item.numero) : ''
    };
  }

  async function carregarHabitacoes(options = {}){
    const { initialRun = false } = options || {};
    const url = basePath + '/api/habitacoes/busca';
    const data = await getJson(url);
    const arr = Array.isArray(data) ? data : (data && data.items) || [];
    fullData = arr.map(prepararItem);
    atualizarOpcoesFiltro();
    updateNumberSuggestions(inpNumero?.value || '');
    aplicarFiltros(initialRun);
  }

  function atualizarOpcoesFiltro(){
    if(selBloco){
      if(!fullData.length){
        selBloco.innerHTML = '<option value="">Todos</option>';
        selBloco.disabled = true;
      } else {
        const blocos = new Map();
        let includeNone = false;
        fullData.forEach(item => {
          if(!item) return;
          if(item._blocoId === '__none__'){ includeNone = true; return; }
          if(item._blocoId){
            const label = item._blocoLabel || 'Bloco';
            if(!blocos.has(item._blocoId)) blocos.set(item._blocoId, label);
          }
        });
        const options = Array.from(blocos.entries()).sort((a,b) => a[1].localeCompare(b[1]));
        let html = '<option value="">Todos</option>';
        html += options.map(([value,label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
        if(includeNone) html += '<option value="__none__">Sem bloco</option>';
        selBloco.innerHTML = html;
        const allowed = new Set(['', ...options.map(([value]) => value), ...(includeNone ? ['__none__'] : [])]);
        if(!allowed.has(selBloco.value)) selBloco.value = '';
        selBloco.disabled = false;
      }
    }

    if(selAndar){
      if(!fullData.length){
        selAndar.innerHTML = '<option value="">Todos</option>';
        selAndar.disabled = true;
      } else {
        const andares = new Map();
        let includeNone = false;
        fullData.forEach(item => {
          if(!item) return;
          if(item._andarId === '__none__'){ includeNone = true; return; }
          if(item._andarId){
            const label = item._andarLabel || 'Andar';
            if(!andares.has(item._andarId)) andares.set(item._andarId, label);
          }
        });
        const options = Array.from(andares.entries()).sort((a,b) => a[1].localeCompare(b[1]));
        let html = '<option value="">Todos</option>';
        html += options.map(([value,label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
        if(includeNone) html += '<option value="__none__">Sem andar</option>';
        selAndar.innerHTML = html;
        const allowed = new Set(['', ...options.map(([value]) => value), ...(includeNone ? ['__none__'] : [])]);
        if(!allowed.has(selAndar.value)) selAndar.value = '';
        selAndar.disabled = false;
      }
    }
  }

  function updateNumberSuggestions(term){
    if(!listaNumeros) return;
    if(!fullData.length){ listaNumeros.innerHTML = ''; return; }
    const needle = (term||'').toString().trim().toLowerCase();
    const seen = new Set();
    const items = [];
    for(const item of fullData){
      if(!item || !item._numeroStr) continue;
      const numero = item._numeroStr;
      if(needle && !numero.toLowerCase().includes(needle)) continue;
      if(seen.has(numero)) continue;
      seen.add(numero);
      items.push(numero);
      if(items.length >= HAB_NUMBER_SUGGESTIONS_LIMIT) break;
    }
    listaNumeros.innerHTML = items.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  }

  function aplicarFiltros(initial = false){
    const blocoSel = selBloco?.value || '';
    const andarSel = selAndar?.value || '';
    const numeroTerm = (inpNumero?.value || '').trim().toLowerCase();
    if(!fullData.length){
      state.data = [];
      state.total = 0;
      state.page = 1;
      renderTabela();
      return;
    }
    const filtered = fullData.filter(item => {
      if(!item) return false;
      if(blocoSel && item._blocoId !== blocoSel) return false;
      if(andarSel && item._andarId !== andarSel) return false;
      if(numeroTerm){
        const numero = item._numeroStr.toLowerCase();
        if(!numero.includes(numeroTerm)) return false;
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
    reloadTimer = setTimeout(() => carregarHabitacoes({ initialRun: false }), 200);
  }

  function renderTabela(){
    tbody.innerHTML = '';
    const size = state.size;
    const start = (state.page-1)*size;
    const end = start + size;
    const slice = state.data.slice(start, end);
    slice.forEach(item => tbody.appendChild(buildRow(item)));
    buildPager();
    applyScrollLimit();
  }

  function setCellBlock(cell, primary, secondary){
    if(!cell) return;
    cell.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'wdg-hab-stack';
    const main = document.createElement('span');
    main.className = 'wdg-hab-primary';
    const mainRaw = primary != null ? String(primary) : '';
    const mainText = mainRaw.trim() || '—';
    main.textContent = mainText;
    main.style.whiteSpace = 'nowrap';
    wrap.appendChild(main);
    const secondaryRaw = secondary != null ? String(secondary) : '';
    if(secondaryRaw.trim()){
      const sub = document.createElement('span');
      sub.className = 'wdg-hab-secondary';
      sub.textContent = secondaryRaw;
      sub.style.whiteSpace = 'nowrap';
      wrap.appendChild(sub);
    }
    cell.appendChild(wrap);
  }

  function createChip(options){
    const opts = options || {};
    const tag = opts.href ? 'a' : (typeof opts.onClick === 'function' ? 'button' : 'span');
    const el = document.createElement(tag);
    el.className = 'wdg-hab-chip';
    if(tag === 'button') el.type = 'button';
    if(opts.variant) el.dataset.variant = opts.variant;
    if(tag === 'a'){
      el.href = opts.href;
      if(opts.target) el.target = opts.target;
      el.rel = opts.rel || 'noopener';
    }
    if(typeof opts.onClick === 'function'){
      el.classList.add('wdg-hab-chip--link');
      el.addEventListener('click', ev => { ev.preventDefault(); opts.onClick(ev); });
    } else if(tag === 'a'){
      el.classList.add('wdg-hab-chip--link');
    }
    if(opts.icon){
      const iconEl = document.createElement('i');
      iconEl.className = opts.icon;
      el.appendChild(iconEl);
    }
    const textSpan = document.createElement('span');
    textSpan.className = 'wdg-hab-chip-text';
    textSpan.textContent = opts.text || '';
    el.appendChild(textSpan);
    if(opts.title) el.title = opts.title;
    return el;
  }

  function appendChipRow(cell, chips){
    if(!cell) return;
    cell.innerHTML = '';
    const validChips = Array.isArray(chips) ? chips.filter(Boolean) : [];
    if(!validChips.length){
      const empty = document.createElement('span');
      empty.className = 'wdg-hab-empty';
      empty.textContent = '—';
      cell.appendChild(empty);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'wdg-hab-chip-row';
    wrap.style.flexWrap = 'wrap';
    validChips.forEach(chip => wrap.appendChild(chip));
    cell.appendChild(wrap);
  }

  function buildRow(item){
    const tr = tplLinha.content.firstElementChild.cloneNode(true);
    // Habitação: "Condomínio - Bloco/Torre - Andar - Nº/Identificação"
    const unidadeLabel = formatUnidade(item.unidade||{});
    const detalhesHab = [item.bloco?.nome, item.andar?.nome, item.numero].filter(Boolean).join(' · ');
    const habPrimary = detalhesHab || unidadeLabel || '—';
    const habSecondary = detalhesHab && unidadeLabel ? unidadeLabel : '';
    setCellBlock(tr.querySelector('.hab-col-hab'), habPrimary, habSecondary);

    // Proprietário
    const proprietario = item.proprietario || {};
    const propNome = proprietario.nome || '—';
    const propInfo = proprietario.email || '';
    setCellBlock(tr.querySelector('.hab-col-prop'), propNome, propInfo);

    // Alugado? Sim/Não
    appendChipRow(tr.querySelector('.hab-col-alugado'), [
      createChip({
        text: item.alugado ? 'Sim' : 'Não',
        variant: item.alugado ? 'success' : 'muted',
        icon: item.alugado ? 'bi bi-door-open' : 'bi bi-door-closed'
      })
    ]);

    // Contrato locação: chip com ícone que abre contrato vigente
    const contratoTd = tr.querySelector('.hab-col-contrato');
    contratoTd.innerHTML = '';
    (function(){
      const info = getContratoVigenteInfo(item);
      const contratoChip = createChip({
        text: info.hasContrato ? (info.hasUrl ? 'Abrir contrato' : 'Ver contrato') : 'Sem contrato',
        variant: info.hasContrato ? 'accent' : 'muted',
        icon: 'bi bi-file-earmark-text',
        title: info.hasContrato ? (info.hasUrl ? 'Abrir contrato vigente' : 'Contrato vigente sem arquivo disponível') : 'Nenhum contrato vigente',
        onClick(){ abrirContratoHabitacao(item, contratoChip); }
      });
      configureContratoButton(contratoChip, info);
      contratoTd.appendChild(contratoChip);
    })();

    // Moradores
    const moradoresTd = tr.querySelector('.hab-col-moradores');
    const moradores = Array.isArray(item.moradores) ? item.moradores : [];
    if(moradores.length){
      const chips = moradores.map(m => {
        const isMaior = calcMaioridade(m.data_nascimento);
        const flagMaior = isMaior ? '+18' : '-18';
        const isInquilino = m && (m.inquilino === true);
        const texto = `${m.nome || 'Sem nome'} (${flagMaior})${isInquilino ? ' · Inq.' : ''}`;
        return createChip({
          text: texto,
          variant: isInquilino ? 'warning' : 'accent',
          icon: isInquilino ? 'bi bi-person-badge' : 'bi bi-person'
        });
      });
      appendChipRow(moradoresTd, chips);
    } else {
      appendChipRow(moradoresTd, []);
    }

    const veicTd = tr.querySelector('.hab-col-veiculos');
    const veiculos = Array.isArray(item.veiculos) ? item.veiculos : [];
    if(veiculos.length){
      const chips = veiculos.map(v => {
        const placaFmt = formatPlaca(v.placa);
        const resumo = [v.tipo || 'Veículo', placaFmt || '', v.marca || '', v.modelo || '', v.cor || '']
          .filter(Boolean)
          .join(' · ');
        return createChip({
          text: resumo || 'Ver veículo',
          variant: 'accent',
          icon: 'bi bi-car-front',
          title: 'Visualizar detalhes do veículo',
          onClick(){
            try {
              const payload = typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v || {}));
              const ctx = { habitacao: item };
              if(window.WDG_VEIC_DET && typeof window.WDG_VEIC_DET.abrir === 'function'){
                window.WDG_VEIC_DET.abrir(payload, ctx);
              } else {
                console.warn('[editar_habitacao] modal de detalhes do veículo indisponível');
              }
            } catch(err){ console.warn('[editar_habitacao] falha ao abrir detalhes do veículo', err); }
          }
        });
      });
      appendChipRow(veicTd, chips);
    } else {
      appendChipRow(veicTd, []);
    }

    const petsTd = tr.querySelector('.hab-col-pets');
    const pets = Array.isArray(item.pets) ? item.pets : [];
    if(pets.length){
      const chips = pets.map(pet => {
        const resumo = formatPetResumo(pet);
        return createChip({
          text: resumo || 'Ver pet',
          variant: 'accent',
          icon: 'bi bi-heart',
          title: 'Visualizar detalhes do pet',
          onClick(){
            try{
              const payload = typeof structuredClone === 'function' ? structuredClone(pet) : JSON.parse(JSON.stringify(pet || {}));
              const habLabel = detalhesHab || unidadeLabel || '';
              const ctx = { habitacao: item, habLabel };
              if(window.WDG_PET_DET && typeof window.WDG_PET_DET.abrir === 'function'){
                window.WDG_PET_DET.abrir(payload, ctx);
              } else {
                console.warn('[editar_habitacao] modal de detalhes do pet indisponível');
              }
            }catch(err){ console.warn('[editar_habitacao] falha ao abrir detalhes do pet', err); }
          }
        });
      });
      appendChipRow(petsTd, chips);
    } else {
      appendChipRow(petsTd, []);
    }

    // Ações
    tr.querySelector('[data-action="aluguel"]').addEventListener('click', () => emitirAcao('aluguel', item));
    tr.querySelector('[data-action="veiculos"]').addEventListener('click', () => emitirAcao('veiculos', item));
    tr.querySelector('[data-action="pets"]').addEventListener('click', () => emitirAcao('pets', item));
    return tr;
  }

  function emitirAcao(tipo, item){
    const ev = new CustomEvent('habitacao:acao', { detail: { tipo, item } });
    document.dispatchEvent(ev);
  }

  function parseDateBRorISO(s){
    if(!s) return null;
    if(s instanceof Date && !isNaN(s.getTime())) return s;
    if(typeof s === 'number'){ const dNum = new Date(s); return isNaN(dNum)? null : dNum; }
    const str = String(s).trim();
    const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m){ const d = new Date(+m[3], +m[2]-1, +m[1]); return isNaN(d)? null : d; }
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if(iso){ const dIso = new Date(+iso[1], +iso[2]-1, +iso[3]); return isNaN(dIso)? null : dIso; }
    const d2 = new Date(str); return isNaN(d2)? null : d2;
  }

  function getContratoVigenteInfo(item){
    const info = { contrato: null, hasContrato:false, hasUrl:false };
    if(!item) return info;
    let arr = normalizeContratos(item.contratos_locacao);
    try {
      if(!arr.length && item.contrato_locacao){ arr = normalizeContratos([item.contrato_locacao]); }
      if(arr.length){
        const today = new Date(); today.setHours(0,0,0,0);
        const vigentes = arr.filter(c => {
          const di = parseDateBRorISO(c?.periodo?.inicio);
          const df = parseDateBRorISO(c?.periodo?.fim);
          if(!di || !df) return false;
          const s = new Date(di.getFullYear(), di.getMonth(), di.getDate());
          const e = new Date(df.getFullYear(), df.getMonth(), df.getDate());
          return today.getTime() >= s.getTime() && today.getTime() <= e.getTime();
        });
        let contrato = null;
        if(vigentes.length){
          contrato = vigentes.sort((a,b)=>{
            const ai = parseDateBRorISO(a?.periodo?.inicio)?.getTime() || 0;
            const bi = parseDateBRorISO(b?.periodo?.inicio)?.getTime() || 0;
            return bi - ai;
          })[0];
        }
        if(!contrato){ contrato = arr[arr.length-1]; }
        if(contrato){
          info.contrato = contrato;
          info.hasContrato = true;
          info.hasUrl = !!contrato.url;
        }
      }
    } catch(_e){ /* ignora e usa defaults */ }
    return info;
  }

  function configureContratoButton(btn, info){
    if(!btn) return;
    const state = info || { hasContrato:false, hasUrl:false };
    if(!state.hasContrato){
      btn.title = 'Sem contrato';
      btn.disabled = true;
    } else if(state.hasUrl){
      btn.title = 'Abrir contrato vigente';
      btn.disabled = false;
    } else {
      btn.title = 'Contrato vigente sem arquivo disponível';
      btn.disabled = false;
    }
  }

  async function abrirContratoHabitacao(item, btn){
    if(!item) return;
    let info = getContratoVigenteInfo(item);
    if(info.hasUrl){
      try { window.open(info.contrato.url, '_blank', 'noopener'); } catch(_e){}
      return;
    }
    // tenta refrescar dados da habitação antes de desistir
    try {
      if(btn){ btn.disabled = true; btn.classList.add('wdg-loading'); }
      const fresh = await getJson(basePath + '/api/habitacoes/' + encodeURIComponent(String(item._id)));
      if(fresh && fresh._id){
        // atualiza objeto original para refletir dados mais recentes
        Object.assign(item, fresh);
        info = getContratoVigenteInfo(item);
        if(info.hasUrl){
          try { window.open(info.contrato.url, '_blank', 'noopener'); } catch(_e){}
          return;
        }
      }
    } catch(err){ console.warn('[editar_habitacao] falha ao atualizar dados do contrato', err); }
    finally {
      if(btn){
        configureContratoButton(btn, info);
        btn.classList.remove('wdg-loading');
      }
    }
    alert(info.hasContrato ? 'Contrato vigente não possui arquivo anexado.' : 'Nenhum contrato vigente encontrado.');
  }

  function buildPager(){
    pager.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(state.total / state.size));
    if(totalPages <= 1) return;
    const windowSize = 7;
    let start = Math.max(1, state.page - Math.floor(windowSize/2));
    let end = Math.min(totalPages, start + windowSize - 1);
    if(end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);

    const frag = document.createDocumentFragment();
    frag.appendChild(mkBtn('«', () => { state.page = 1; renderTabela(); }, state.page === 1));
    frag.appendChild(mkBtn('‹', () => { if(state.page>1){ state.page--; renderTabela(); } }, state.page === 1));
    for(let p = start; p<=end; p++) frag.appendChild(mkBtn(String(p), () => { state.page = p; renderTabela(); }, false, p===state.page));
    frag.appendChild(mkBtn('›', () => { if(state.page<totalPages){ state.page++; renderTabela(); } }, state.page === totalPages));
    frag.appendChild(mkBtn('»', () => { state.page = totalPages; renderTabela(); }, state.page === totalPages));
    pager.appendChild(frag);
  }
  function mkBtn(label, onClick, disabled, active){
    const b = document.createElement('button');
    b.type='button'; b.className='wdg-pager-btn'; b.textContent=label;
    if(disabled) b.disabled=true;
    if(active) b.classList.add('active');
    b.addEventListener('click', onClick);
    return b;
  }
  function applyScrollLimit(){
    if(!tableWrap) return;
    const count = tbody.querySelectorAll('tr').length;
    if(count > 4) tableWrap.classList.add('scroll-limit'); else tableWrap.classList.remove('scroll-limit');
  }

  function calcMaioridade(dataStr){
    if(!dataStr) return true; // default: tratar como maior
    try{
      const [d,m,a] = (dataStr.includes('/') ? dataStr.split('/') : dataStr.split('-')).map(x=>parseInt(x,10));
      const dt = dataStr.includes('/') ? new Date(a, m-1, d) : new Date(d, m-1, a);
      if(isNaN(dt.getTime())) return true;
      const now = new Date();
      let idade = now.getFullYear() - dt.getFullYear();
      const mDiff = now.getMonth() - dt.getMonth();
      if(mDiff < 0 || (mDiff===0 && now.getDate() < dt.getDate())) idade--;
      return idade >= 18;
    }catch(e){ return true; }
  }

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }

  // Eventos
  form?.addEventListener('submit', ev => ev.preventDefault());
  form?.addEventListener('reset', ev => {
    ev.preventDefault();
    if(selBloco){ selBloco.value = ''; }
    if(selAndar){ selAndar.value = ''; }
    if(inpNumero){ inpNumero.value = ''; }
    updateNumberSuggestions('');
    aplicarFiltros(false);
  });
  selBloco?.addEventListener('change', scheduleFilter);
  selAndar?.addEventListener('change', scheduleFilter);
  inpNumero?.addEventListener('input', () => {
    updateNumberSuggestions(inpNumero.value);
    scheduleFilter();
  });
  inpNumero?.addEventListener('focus', () => updateNumberSuggestions(inpNumero.value));
  pageSizeSel?.addEventListener('change', () => {
    const parsed = parseInt(pageSizeSel.value, 10);
    state.size = (!isNaN(parsed) && parsed > 0) ? parsed : 50;
    state.page = 1;
    renderTabela();
  });
  document.addEventListener('habitacao:lista:refresh', scheduleReload);
  document.addEventListener('habitacao:moradores:atualizado', scheduleReload);

  // Boot
  carregarHabitacoes({ initialRun: true });
})();
