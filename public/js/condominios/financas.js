(function(){
  const root = document.getElementById('financasApp');
  if(!root) return;

  const refs = {
    resumoCards: document.getElementById('financasResumoCards'),
    periodoAtivo: document.getElementById('financasPeriodoAtivo'),
    inadimplentes: document.querySelector('#tabelaInadimplentes tbody'),
    contasPagar: document.getElementById('listaContasPagar'),
    fundos: document.querySelector('#tabelaFundos tbody'),
    fundosCadastro: document.querySelector('#tabelaFundosCadastrados tbody'),
    receitas: document.querySelector('#tabelaReceitas tbody'),
    receitasPeriodo: document.getElementById('receitaPeriodo'),
    receitasStatus: document.getElementById('receitaStatus'),
    receitasBusca: document.getElementById('receitaBusca'),
    despesas: document.querySelector('#tabelaDespesas tbody'),
    despesaCentro: document.getElementById('despesaCentro'),
    despesaSituacao: document.getElementById('despesaSituacao'),
    despesaFornecedor: document.getElementById('despesaFornecedor'),
    pagerInadimplentes: document.getElementById('pagerInadimplentes'),
    pagerFundos: document.getElementById('pagerFundos'),
    pagerFundosCadastro: document.getElementById('pagerFundosCadastrados'),
    pagerReceitas: document.getElementById('pagerReceitas'),
    pagerDespesas: document.getElementById('pagerDespesas'),
    pagerDespesasRecorrentes: document.getElementById('pagerDespesasRecorrentes'),
    pagerMensalidades: document.getElementById('pagerMensalidades'),
    despesasRecorrentes: document.querySelector('#tabelaDespesasRecorrentes tbody'),
    formFundo: document.getElementById('formFundo'),
    formRecorrente: document.getElementById('formDespesaRecorrente'),
    formRateio: document.getElementById('formRateio'),
    mensalidades: document.querySelector('#tabelaMensalidades tbody'),
    rateioCompetencia: document.getElementById('rateioCompetencia'),
    rateioBase: document.getElementById('rateioBase'),
    rateioMetodo: document.getElementById('rateioMetodo'),
    fundoCondominioField: document.getElementById('fundoCondominio'),
    fundoCondominioDisplay: document.getElementById('fundoCondominioNome'),
    fundoSaldoInput: document.getElementById('fundoSaldo'),
    toastTarget: document.body
  };

  const basePath = root.dataset.basePath || '';
  const scopeAll = root.dataset.scopeAll === 'true';
  const defaultUnitId = root.dataset.unidadeId || '';
  const defaultUnitName = root.dataset.unidadeNome || '';
  const iconCache = Object.create(null);

  const chartRefs = {
    receitas: null,
    despesas: null,
    fundos: null
  };

  const pagers = {};

  const state = {
    filtroPeriodo: 'mes',
    unidades: [],
    resumoCards: [
      { label: 'Receita projetada', value: 185240.54, trend: +8.2 },
      { label: 'Recebido até agora', value: 132908.76, trend: +4.3 },
      { label: 'Despesas no mês', value: 97854.32, trend: -2.1 },
      { label: 'Saldo em fundos', value: 42650.00, trend: +12.0 },
      { label: 'Inadimplência', value: 0.073, trend: -1.5, isRate: true }
    ],
    seriesReceitas: {
      labels: buildLastMonths(6),
      data: [142, 158, 165, 178, 190, 205]
    },
    seriesDespesas: {
      labels: buildLastMonths(6),
      data: [121, 133, 129, 147, 152, 138]
    },
    fundosCadastrados: [],
    fundos: [],
    contasPagar: [
      { fornecedor: 'Portaria 24h', vencimento: '03/12/2025', valor: 12800, status: 'Agendado' },
      { fornecedor: 'Energia áreas comuns', vencimento: '08/12/2025', valor: 18230.42, status: 'Pendente aprovar' },
      { fornecedor: 'Manutenção elevadores', vencimento: '12/12/2025', valor: 7600, status: 'Programado' }
    ],
    despesasRecorrentes: [
      { id: 'rec-1', nome: 'Energia áreas comuns', conta: 'area-comum', frequencia: 'Mensal', vencimento: 10, metodo: 'Por consumo', ultimoValor: 18230.42 },
      { id: 'rec-2', nome: 'Portaria 24h', conta: 'administracao', frequencia: 'Mensal', vencimento: 5, metodo: 'Fração ideal', ultimoValor: 12800.00 },
      { id: 'rec-3', nome: 'Limpeza e jardinagem', conta: 'geral', frequencia: 'Mensal', vencimento: 12, metodo: 'Valor igual', ultimoValor: 9500.00 }
    ],
    inadimplentes: [
      { unidade: 'Torre A · 104', responsavel: 'Ana Costa', periodo: 'Ago/25 - Nov/25', valor: 4350.90, status: 'Negociação' },
      { unidade: 'Torre B · 701', responsavel: 'Marcos Vieira', periodo: 'Set/25 - Nov/25', valor: 2875.00, status: 'Carta registrada' },
      { unidade: 'Garden 12', responsavel: 'Eduardo Dias', periodo: 'Out/25 - Nov/25', valor: 1980.50, status: 'Cobrança jurídica' }
    ],
    receitas: [
      { unidade: 'Torre A · 101', competencia: 'Nov/25', vencimento: '10/11/2025', valor: 950.00, status: 'Liquidada', atualizado: '12/11/2025 09:12' },
      { unidade: 'Torre A · 305', competencia: 'Nov/25', vencimento: '10/11/2025', valor: 1120.00, status: 'Prevista', atualizado: 'Aguardando' },
      { unidade: 'Garden 07', competencia: 'Nov/25', vencimento: '10/11/2025', valor: 1750.00, status: 'Em atraso', atualizado: '15/11/2025 16:40' },
      { unidade: 'Cobertura 02', competencia: 'Dez/25', vencimento: '10/12/2025', valor: 2420.00, status: 'Prevista', atualizado: 'Programado' }
    ],
    despesas: [
      { fornecedor: 'Água e saneamento', descricao: 'Medição coletiva', vencimento: '07/11/2025', valor: 14320.19, status: 'Paga' },
      { fornecedor: 'Limpeza Clean+', descricao: 'Contrato mensal', vencimento: '12/11/2025', valor: 18200.00, status: 'Pendente' },
      { fornecedor: 'Segurança Alfa', descricao: 'Equipe noturna', vencimento: '18/11/2025', valor: 21980.00, status: 'Atrasada' },
      { fornecedor: 'Elevadores Max', descricao: 'Preventiva trimestral', vencimento: '28/11/2025', valor: 9800.00, status: 'Pendente' }
    ],
    habitacoes: [
      { unidade: 'Torre A · 101', fracao: 0.0125, consumo: 118 },
      { unidade: 'Torre A · 305', fracao: 0.0145, consumo: 142 },
      { unidade: 'Garden 07', fracao: 0.0185, consumo: 198 },
      { unidade: 'Cobertura 02', fracao: 0.0260, consumo: 248 },
      { unidade: 'Torre B · 701', fracao: 0.0190, consumo: 160 }
    ],
    mensalidades: []
  };

  init();

  function init(){
    setupPagers();
    renderResumo();
    renderCharts();
    renderInadimplentes();
    renderContasPagar();
    renderFundosCadastro();
    renderMovimentacoesFundos();
    applyReceitasFilters();
    applyDespesasFilters();
    renderDespesasRecorrentes();
    renderMensalidades();
    bindCurrencyField(refs.fundoSaldoInput);
    bindEvents();
    if(scopeAll) hydrateUnidadesSelect();
    else ensureReadonlyUnit();
  }

  function bindEvents(){
    refs.receitasPeriodo?.addEventListener('change', () => {
      state.filtroPeriodo = refs.receitasPeriodo.value;
      refs.periodoAtivo.textContent = labelForPeriodo(state.filtroPeriodo);
      simulateLoading(() => applyReceitasFilters());
    });
    refs.receitasStatus?.addEventListener('change', () => applyReceitasFilters());
    refs.receitasBusca?.addEventListener('input', debounce(() => applyReceitasFilters(), 250));
    refs.despesaCentro?.addEventListener('change', () => applyDespesasFilters());
    refs.despesaSituacao?.addEventListener('change', () => applyDespesasFilters());
    refs.despesaFornecedor?.addEventListener('input', debounce(() => applyDespesasFilters(), 300));
    root.addEventListener('click', evt => {
      const action = evt.target.closest('[data-action]');
      if(!action) return;
      evt.preventDefault();
      const act = action.getAttribute('data-action');
      switch(act){
        case 'salvar-fundo':
          handleSalvarFundo();
          break;
        case 'limpar-fundo':
          refs.formFundo?.reset();
          resetCurrencyField(refs.fundoSaldoInput);
          ensureReadonlyUnit();
          notify('Campos do fundo limpos.');
          break;
        case 'detalhar-fundo':
          notify('Em breve você poderá consultar os detalhes completos do fundo.');
          break;
        case 'editar-fundo':
          notify('Edição de fundo em desenvolvimento.');
          break;
        case 'excluir-fundo':
          handleExcluirFundo(action.dataset.id);
          break;
        case 'salvar-despesa-recorrente':
          handleSalvarDespesaRecorrente();
          break;
        case 'simular-rateio':
          simulateRateio(false);
          break;
        case 'gerar-mensalidades':
          simulateRateio(true);
          break;
        case 'exportar-mensalidades':
          notify('Exportação disponível após salvar a simulação.');
          break;
        default:
          notify(`Ação "${act}" em desenvolvimento.`);
      }
    });
  }

  function setupPagers(){
    registerPager('inadimplentes', {
      body: refs.inadimplentes,
      container: refs.pagerInadimplentes,
      rowsPerPage: 5,
      emptyMessage: 'Nenhuma unidade inadimplente no período.',
      renderRow: renderInadimplenteRow
    });
    registerPager('fundos', {
      body: refs.fundos,
      container: refs.pagerFundos,
      rowsPerPage: 6,
      emptyMessage: '',
      renderRow: renderFundoRow
    });
    registerPager('fundosCadastro', {
      body: refs.fundosCadastro,
      container: refs.pagerFundosCadastro,
      rowsPerPage: 6,
      emptyMessage: '',
      renderRow: renderFundoCadastroRow
    });
    registerPager('receitas', {
      body: refs.receitas,
      container: refs.pagerReceitas,
      rowsPerPage: 7,
      emptyMessage: 'Nenhuma receita encontrada com os filtros atuais.',
      renderRow: renderReceitaRow
    });
    registerPager('despesas', {
      body: refs.despesas,
      container: refs.pagerDespesas,
      rowsPerPage: 7,
      emptyMessage: 'Nenhuma despesa encontrada com os filtros atuais.',
      renderRow: renderDespesaRow
    });
    registerPager('despesasRecorrentes', {
      body: refs.despesasRecorrentes,
      container: refs.pagerDespesasRecorrentes,
      rowsPerPage: 6,
      emptyMessage: 'Ainda não há despesas recorrentes cadastradas.',
      renderRow: renderDespesaRecorrenteRow
    });
    registerPager('mensalidades', {
      body: refs.mensalidades,
      container: refs.pagerMensalidades,
      rowsPerPage: 6,
      emptyMessage: 'Simule um rateio para visualizar os valores sugeridos.',
      renderRow: renderMensalidadeRow
    });
  }

  function renderResumo(){
    if(!refs.resumoCards) return;
    refs.resumoCards.innerHTML = '';
    state.resumoCards.forEach(card => {
      const wrapper = document.createElement('article');
      wrapper.className = 'wdg-fin-card';
      const trendClass = card.trend >= 0 ? 'positive' : 'negative';
      const trendIcon = card.trend >= 0 ? 'bi-arrow-up-right' : 'bi-arrow-down-right';
      const valueText = card.isRate ? formatPercent(card.value) : formatCurrency(card.value);
      wrapper.innerHTML = `
        <h3>${card.label}</h3>
        <p class="value">${valueText}</p>
        <div class="wdg-fin-trend ${trendClass}">
          <i class="bi ${trendIcon}"></i>
          <span>${Math.abs(card.trend).toFixed(1)}% vs mês anterior</span>
        </div>`;
      refs.resumoCards.appendChild(wrapper);
    });
  }

  function renderCharts(){
    destroyCharts();
    const receitasCtx = document.getElementById('chartReceitas');
    const despesasCtx = document.getElementById('chartDespesas');
    const fundosCtx = document.getElementById('chartFundos');
    if(receitasCtx){
      chartRefs.receitas = new Chart(receitasCtx, {
        type: 'line',
        data: {
          labels: state.seriesReceitas.labels,
          datasets: [{
            label: 'Receitas (mil R$)',
            data: state.seriesReceitas.data,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,.15)',
            tension: 0.35,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#0f172a'
          }]
        },
        options: defaultLineOptions('Receitas mensais em milhares de reais')
      });
    }
    if(despesasCtx){
      chartRefs.despesas = new Chart(despesasCtx, {
        type: 'line',
        data: {
          labels: state.seriesDespesas.labels,
          datasets: [{
            label: 'Despesas (mil R$)',
            data: state.seriesDespesas.data,
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,.15)',
            tension: 0.35,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#9a3412'
          }]
        },
        options: defaultLineOptions('Despesas mensais em milhares de reais')
      });
    }
    if(fundosCtx){
      const fundosData = summarizeFundos();
      chartRefs.fundos = new Chart(fundosCtx, {
        type: 'doughnut',
        data: {
          labels: fundosData.labels,
          datasets: [{
            data: fundosData.values,
            backgroundColor: ['#0ea5e9','#22c55e','#facc15','#f97316','#6366f1'],
            borderWidth: 0
          }]
        },
        options: {
          plugins: {
            legend: { position: 'bottom' }
          },
          cutout: '62%'
        }
      });
    }
  }

  function destroyCharts(){
    Object.keys(chartRefs).forEach(key => {
      if(chartRefs[key]){
        chartRefs[key].destroy();
        chartRefs[key] = null;
      }
    });
  }

  function renderInadimplentes(){
    updatePagerData('inadimplentes', state.inadimplentes);
  }

  function renderContasPagar(){
    if(!refs.contasPagar) return;
    refs.contasPagar.innerHTML = '';
    state.contasPagar.forEach(item => {
      const card = document.createElement('div');
      card.className = 'd-flex justify-content-between align-items-start p-3 rounded-3 border';
      card.style.borderColor = 'rgba(15,23,42,.1)';
      card.innerHTML = `
        <div>
          <p class="fw-semibold mb-1">${escapeHtml(item.fornecedor)}</p>
          <small class="text-muted">Vence em ${escapeHtml(item.vencimento)}</small>
        </div>
        <div class="text-end">
          <p class="fw-bold mb-0">${formatCurrency(item.valor)}</p>
          <span class="badge text-bg-light">${escapeHtml(item.status)}</span>
        </div>`;
      refs.contasPagar.appendChild(card);
    });
  }

  function renderFundosCadastro(){
    updatePagerData('fundosCadastro', state.fundosCadastrados);
  }

  function renderMovimentacoesFundos(){
    updatePagerData('fundos', state.fundos);
  }

  function renderDespesasRecorrentes(){
    updatePagerData('despesasRecorrentes', state.despesasRecorrentes);
  }

  function applyReceitasFilters(){
    if(!refs.receitas) return;
    const periodo = refs.receitasPeriodo?.value || 'mes';
    const status = refs.receitasStatus?.value || 'todos';
    const busca = (refs.receitasBusca?.value || '').toLowerCase();
    const filtered = state.receitas.filter(item => {
      const statusOk = status === 'todos' || item.status.toLowerCase() === status.toLowerCase();
      const buscaOk = !busca || `${item.unidade} ${item.competencia}`.toLowerCase().includes(busca);
      return statusOk && buscaOk;
    });
    updatePagerData('receitas', filtered);
    refs.periodoAtivo.textContent = labelForPeriodo(periodo);
  }

  function applyDespesasFilters(){
    if(!refs.despesas) return;
    const centro = refs.despesaCentro?.value || 'todos';
    const situacao = refs.despesaSituacao?.value || 'pagas';
    const fornecedor = (refs.despesaFornecedor?.value || '').toLowerCase();
    const filtered = state.despesas.filter(item => {
      const matchFornecedor = !fornecedor || item.fornecedor.toLowerCase().includes(fornecedor);
      const matchSituacao = situacao === 'pagas'
        ? item.status === 'Paga'
        : situacao === 'pendentes'
          ? item.status === 'Pendente'
          : item.status === 'Atrasada';
      const matchCentro = centro === 'todos' || item.descricao.toLowerCase().includes(centro);
      return matchFornecedor && matchSituacao && matchCentro;
    });
    updatePagerData('despesas', filtered);
  }

  function renderMensalidades(){
    updatePagerData('mensalidades', state.mensalidades);
  }

  function hydrateUnidadesSelect(){
    if(!scopeAll || !refs.fundoCondominioField || refs.fundoCondominioField.tagName !== 'SELECT') return;
    populateCondominioOptions([]);
    fetch(withBase(`/api/unidades?_=${Date.now()}`))
      .then(resp => {
        if(!resp.ok) throw new Error('Falha ao listar unidades');
        return resp.json();
      })
      .then(data => {
        state.unidades = Array.isArray(data) ? data : [];
        populateCondominioOptions(state.unidades);
      })
      .catch(err => {
        console.error('[financas] unidades erro', err);
        state.unidades = [];
        populateCondominioOptions([]);
        notify('Não foi possível carregar os condomínios disponíveis.');
      });
  }

  function populateCondominioOptions(list){
    if(!refs.fundoCondominioField || refs.fundoCondominioField.tagName !== 'SELECT') return;
    const select = refs.fundoCondominioField;
    const options = Array.isArray(list) ? list : [];
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = options.length ? 'Selecione um condomínio' : 'Nenhuma unidade disponível';
    select.appendChild(placeholder);
    options.forEach(unit => {
      const option = document.createElement('option');
      option.value = unit && unit._id ? String(unit._id) : '';
      if(!option.value) return;
      option.textContent = buildUnidadeLabel(unit);
      select.appendChild(option);
    });
    if(defaultUnitId){
      select.value = defaultUnitId;
    }
  }

  function ensureReadonlyUnit(){
    if(scopeAll) return;
    if(refs.fundoCondominioDisplay && defaultUnitName){
      refs.fundoCondominioDisplay.value = defaultUnitName;
    }
    if(refs.fundoCondominioField && !refs.fundoCondominioField.value){
      refs.fundoCondominioField.value = defaultUnitId;
    }
  }

  function handleSalvarFundo(){
    if(!refs.formFundo) return;
    const condominioId = (refs.fundoCondominioField?.value || '').trim() || defaultUnitId;
    if(scopeAll && !condominioId){
      notify('Selecione um condomínio antes de salvar o fundo.');
      return;
    }
    const nomeInput = document.getElementById('fundoNome');
    const objetivoInput = document.getElementById('fundoObjetivo');
    const saldoInput = document.getElementById('fundoSaldo');
    const obsInput = document.getElementById('fundoObservacao');
    const nome = nomeInput?.value?.trim();
    const objetivo = objetivoInput?.value?.trim();
    if(!nome){
      notify('Informe o nome do fundo.');
      return;
    }
    if(!objetivo){
      notify('Descreva o objetivo do fundo.');
      return;
    }
    const saldo = parseCurrencyField(saldoInput);
    const observacao = obsInput?.value?.trim();
    const condominioNome = resolveCondominioNome(condominioId);
    const novoFundo = {
      id: `fund-${Date.now()}`,
      condominio: { id: condominioId, nome: condominioNome },
      nome,
      objetivo,
      saldoInicial: saldo > 0 ? saldo : 0,
      saldoAtual: saldo > 0 ? saldo : 0,
      observacao
    };
    state.fundosCadastrados.unshift(novoFundo);
    renderFundosCadastro();
    refs.formFundo.reset();
    resetCurrencyField(refs.fundoSaldoInput);
    if(scopeAll){
      refs.fundoCondominioField.value = condominioId;
    } else {
      ensureReadonlyUnit();
    }
    notify('Fundo cadastrado (modo demonstrativo).');
  }

  function handleExcluirFundo(fundoId){
    if(!fundoId) return;
    if(hasMovimentacaoForFundo(fundoId)){
      notify('Fundos com movimentações não podem ser excluídos.');
      return;
    }
    state.fundosCadastrados = state.fundosCadastrados.filter(f => f.id !== fundoId);
    renderFundosCadastro();
    notify('Fundo excluído.');
  }

  function summarizeFundos(){
    const buckets = new Map();
    state.fundos.forEach(entry => {
      if(!buckets.has(entry.nome)) buckets.set(entry.nome, 0);
      buckets.set(entry.nome, buckets.get(entry.nome) + entry.valor);
    });
    const labels = [];
    const values = [];
    buckets.forEach((val, key) => {
      labels.push(key);
      values.push(Math.max(val, 0.1));
    });
    return { labels, values };
  }

  function handleSalvarDespesaRecorrente(){
    if(!refs.formRecorrente) return;
    const data = new FormData(refs.formRecorrente);
    const nome = data.get('recorrenteNome') || document.getElementById('recorrenteNome')?.value;
    const categoria = data.get('recorrenteCategoria') || document.getElementById('recorrenteCategoria')?.value;
    const frequencia = (document.getElementById('recorrenteFrequencia')?.value || 'mensal');
    const conta = document.getElementById('recorrenteConta')?.value || 'geral';
    const vencimento = Number(document.getElementById('recorrenteVencimento')?.value || 10);
    const metodo = document.getElementById('recorrenteMetodo')?.value || 'fracao';
    const consumo = Number(document.getElementById('recorrenteConsumo')?.value || 0);
    const valor = Number(document.getElementById('recorrenteValorEstimado')?.value || 0);
    if(!nome){
      notify('Informe o nome da despesa recorrente.');
      return;
    }
    const metodoLabel = metodo === 'consumo' ? 'Por consumo' : metodo === 'igual' ? 'Valor igual' : 'Fração ideal';
    state.despesasRecorrentes.unshift({
      id: `rec-${Date.now()}`,
      nome,
      conta,
      frequencia: capitalizeFirst(frequencia),
      vencimento,
      metodo: metodoLabel,
      ultimoValor: valor || 0,
      consumo
    });
    renderDespesasRecorrentes();
    refs.formRecorrente?.reset();
    notify('Despesa recorrente salva.');
  }

  function simulateRateio(persistir){
    const competencia = refs.rateioCompetencia?.value || formatCompetencia(new Date());
    const metodo = refs.rateioMetodo?.value || 'fracao';
    const baseSel = refs.rateioBase?.value || 'previsto';
    const baseValor = baseSel === 'realizado'
      ? state.resumoCards.find(card => card.label.includes('Despesas'))?.value || 95000
      : baseSel === 'custom'
        ? sumRecorrentesEstimadas()
        : 102000; // previsto
    const fundoPercent = 0.08; // inspirado em mercado: fundo obras 5-10%
    const fundoTotal = baseValor * fundoPercent;
    const totalConsumo = state.habitacoes.reduce((acc, u) => acc + (u.consumo || 0), 0) || 1;
    state.mensalidades = state.habitacoes.map(un => {
      const peso = metodo === 'consumo' ? (un.consumo || 0) / totalConsumo : un.fracao;
      const valorBase = baseValor * peso;
      const cotaFundo = fundoTotal * un.fracao;
      return {
        unidade: un.unidade,
        fracao: un.fracao,
        consumo: metodo === 'consumo' ? (un.consumo || 0) : null,
        valorBase,
        cotaFundo,
        total: valorBase + cotaFundo
      };
    });
    renderMensalidades();
    notify(persistir ? `Mensalidades geradas para ${formatCompetencia(competencia)}.` : 'Simulação atualizada.');
  }

  function sumRecorrentesEstimadas(){
    return state.despesasRecorrentes.reduce((acc, item) => acc + (item.ultimoValor || 0), 0) || 0;
  }

  function registerPager(key, config){
    if(!config || !config.body || !config.container) return;
    if(pagers[key]) return;
    const pager = {
      key,
      body: config.body,
      container: config.container,
      rowsPerPage: Number(config.rowsPerPage) || 5,
      currentPage: 1,
      data: [],
      renderRow: config.renderRow,
      emptyMessage: typeof config.emptyMessage === 'string'
        ? config.emptyMessage
        : 'Nenhum registro encontrado.',
      colspan: config.colspan || getTableColspan(config.body)
    };
    pager.container.dataset.pagerKey = key;
    pager.container.addEventListener('click', handlePagerClick);
    pagers[key] = pager;
  }

  function updatePagerData(key, data){
    const pager = pagers[key];
    if(!pager) return;
    pager.data = Array.isArray(data) ? data.slice() : [];
    pager.currentPage = 1;
    renderPager(key);
  }

  function renderPager(key){
    const pager = pagers[key];
    if(!pager || !pager.body) return;
    pager.body.innerHTML = '';
    const total = pager.data.length;
    if(!total){
      if(pager.emptyMessage){
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="${pager.colspan}"><div class="wdg-empty-state">${pager.emptyMessage}</div></td>`;
        pager.body.appendChild(tr);
      }
      togglePagerVisibility(pager, false);
      return;
    }
    const start = (pager.currentPage - 1) * pager.rowsPerPage;
    const pageItems = pager.data.slice(start, start + pager.rowsPerPage);
    pageItems.forEach(item => pager.renderRow(item, pager.body));
    renderPagerControls(pager, total, start, pageItems.length);
    togglePagerVisibility(pager, true);
  }

  function renderPagerControls(pager, totalItems, startIndex, countOnPage){
    if(!pager.container) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / pager.rowsPerPage));
    pager.container.innerHTML = '';
    const info = document.createElement('span');
    info.className = 'pagination-info';
    const startDisplay = startIndex + 1;
    const endDisplay = startIndex + countOnPage;
    info.textContent = `Mostrando ${startDisplay}-${endDisplay} de ${totalItems}`;
    const controls = document.createElement('div');
    controls.className = 'btn-group';
    controls.appendChild(buildPagerButton('Anterior', pager.currentPage === 1, { action: 'prev' }));
    const pages = buildPageList(totalPages, pager.currentPage);
    pages.forEach(page => {
      if(page === '...'){
        const span = document.createElement('span');
        span.className = 'btn btn-outline-secondary disabled';
        span.textContent = '...';
        controls.appendChild(span);
      } else {
        const btn = buildPagerButton(page, false, { page });
        if(page === pager.currentPage) btn.classList.add('active');
        controls.appendChild(btn);
      }
    });
    controls.appendChild(buildPagerButton('Próxima', pager.currentPage === totalPages, { action: 'next' }));
    pager.container.appendChild(info);
    pager.container.appendChild(controls);
  }

  function buildPagerButton(label, disabled, meta){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-secondary';
    btn.textContent = label;
    if(disabled) btn.disabled = true;
    if(meta?.action) btn.dataset.action = meta.action;
    if(meta?.page) btn.dataset.page = meta.page;
    return btn;
  }

  function buildPageList(totalPages, current){
    if(totalPages <= 5){
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [1];
    if(current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(totalPages - 1, current + 1);
    for(let i = start; i <= end; i += 1) pages.push(i);
    if(current < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }

  function handlePagerClick(evt){
    const container = evt.currentTarget;
    const btn = evt.target.closest('button');
    if(!btn) return;
    const key = container.dataset.pagerKey;
    if(!key) return;
    const pager = pagers[key];
    if(!pager) return;
    evt.preventDefault();
    const action = btn.dataset.action;
    if(action === 'prev') changePagerPage(key, pager.currentPage - 1);
    else if(action === 'next') changePagerPage(key, pager.currentPage + 1);
    else if(btn.dataset.page) changePagerPage(key, Number(btn.dataset.page));
  }

  function changePagerPage(key, newPage){
    const pager = pagers[key];
    if(!pager) return;
    const totalPages = Math.max(1, Math.ceil(pager.data.length / pager.rowsPerPage));
    const target = Math.min(Math.max(1, newPage), totalPages);
    if(target === pager.currentPage) return;
    pager.currentPage = target;
    renderPager(key);
  }

  function togglePagerVisibility(pager, visible){
    if(!pager.container) return;
    if(visible) pager.container.classList.remove('table-pagination-hidden');
    else pager.container.classList.add('table-pagination-hidden');
  }

  function getTableColspan(body){
    const table = body?.closest('table');
    return table && table.tHead && table.tHead.rows[0] ? table.tHead.rows[0].cells.length : 1;
  }

  function renderInadimplenteRow(item, tbody){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.unidade)}</td>
      <td>${escapeHtml(item.responsavel)}</td>
      <td>${escapeHtml(item.periodo)}</td>
      <td>${formatCurrency(item.valor)}</td>
      <td>${buildStatusTag(item.status)}</td>
      <td class="text-end"><button class="btn btn-link btn-sm" data-action="ver-cobranca">Detalhes</button></td>`;
    tbody.appendChild(tr);
  }

  function renderFundoCadastroRow(item, tbody){
    const tr = document.createElement('tr');
    const condoId = item && item.condominio ? item.condominio.id : undefined;
    const condNome = item && item.condominio && item.condominio.nome
      ? item.condominio.nome
      : resolveCondominioNome(condoId);
    const fundoId = item && item.id ? item.id : '';
    const nomeFundo = item && item.nome ? item.nome : '';
    const objetivo = item && item.objetivo ? item.objetivo : '-';
    const saldoInicial = (item && typeof item.saldoInicial === 'number') ? item.saldoInicial : 0;
    const saldoAtual = (item && typeof item.saldoAtual === 'number') ? item.saldoAtual : saldoInicial;
    const hasMov = hasMovimentacaoForFundo(fundoId);
    const detailBtn = buildIconButtonHtml({ action: 'detalhar-fundo', id: fundoId, icon: 'detalhe', label: 'Detalhes' });
    const editBtn = buildIconButtonHtml({ action: 'editar-fundo', id: fundoId, icon: 'editar', label: 'Editar' });
    const deleteBtn = buildIconButtonHtml({
      action: hasMov ? null : 'excluir-fundo',
      id: fundoId,
      icon: 'excluir',
      label: 'Excluir',
      title: hasMov ? 'Não é possível excluir fundos com movimentações registradas' : 'Excluir',
      disabled: hasMov
    });
    tr.innerHTML = `
      <td>${escapeHtml(condNome)}</td>
      <td>${escapeHtml(nomeFundo)}</td>
      <td>${formatCurrency(saldoInicial)}</td>
      <td>${escapeHtml(objetivo)}</td>
      <td>${formatCurrency(saldoAtual)}</td>
      <td class="text-end">
        <div class="d-flex gap-1 justify-content-end flex-nowrap">
          ${detailBtn}
          ${editBtn}
          ${deleteBtn}
        </div>
      </td>`;
    tbody.appendChild(tr);
  }

  function renderFundoRow(entry, tbody){
    const tr = document.createElement('tr');
    const tag = entry.valor >= 0 ? '<span class="wdg-tag success">Entrada</span>' : '<span class="wdg-tag warning">Saída</span>';
    tr.innerHTML = `
      <td>${escapeHtml(entry.nome)}</td>
      <td>${tag}</td>
      <td>${escapeHtml(entry.data)}</td>
      <td>${escapeHtml(entry.origem)}</td>
      <td>${formatCurrency(entry.valor)}</td>
      <td>${escapeHtml(entry.responsavel)}</td>`;
    tbody.appendChild(tr);
  }

  function renderReceitaRow(item, tbody){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.unidade)}</td>
      <td>${escapeHtml(item.competencia)}</td>
      <td>${escapeHtml(item.vencimento)}</td>
      <td>${formatCurrency(item.valor)}</td>
      <td>${buildStatusTag(item.status)}</td>
      <td>${escapeHtml(item.atualizado)}</td>`;
    tbody.appendChild(tr);
  }

  function renderDespesaRow(item, tbody){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.fornecedor)}</td>
      <td>${escapeHtml(item.descricao)}</td>
      <td>${escapeHtml(item.vencimento)}</td>
      <td>${formatCurrency(item.valor)}</td>
      <td>${buildStatusTag(item.status)}</td>
      <td class="text-end"><button class="btn btn-link btn-sm" data-action="detalhar-despesa">Detalhar</button></td>`;
    tbody.appendChild(tr);
  }

  function renderDespesaRecorrenteRow(item, tbody){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.nome)}</td>
      <td>${escapeHtml(labelConta(item.conta))}</td>
      <td>${escapeHtml(item.frequencia)}</td>
      <td>Dia ${item.vencimento}</td>
      <td>${escapeHtml(item.metodo)}</td>
      <td>${formatCurrency(item.ultimoValor)}</td>
      <td class="text-end"><button class="btn btn-link btn-sm" data-action="editar-recorrencia">Editar</button></td>`;
    tbody.appendChild(tr);
  }

  function renderMensalidadeRow(item, tbody){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.unidade)}</td>
      <td>${(item.fracao * 100).toFixed(2)}%</td>
      <td>${item.consumo ? `${item.consumo.toFixed(0)} u.` : '-'}</td>
      <td>${formatCurrency(item.valorBase)}</td>
      <td>${formatCurrency(item.cotaFundo)}</td>
      <td>${formatCurrency(item.total)}</td>`;
    tbody.appendChild(tr);
  }

  function labelForPeriodo(key){
    switch(key){
      case 'trim': return 'Último trimestre';
      case 'ano': return 'Ano corrente';
      default: return 'Mês atual';
    }
  }

  function labelConta(value){
    switch(value){
      case 'administracao': return 'Conta da administração';
      case 'area-comum': return 'Conta por área comum';
      default: return 'Caixa geral do condomínio';
    }
  }

  function defaultLineOptions(label){
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: R$ ${ctx.parsed.y.toLocaleString('pt-BR',{minimumFractionDigits:2})}` } },
        title: { display: true, text: label, align: 'start', color: '#475569', font: { size: 13 } }
      },
      scales: {
        y: { ticks: { callback: value => `R$ ${value}k` }, grid: { color: 'rgba(148,163,184,.2)' } },
        x: { grid: { display: false } }
      }
    };
  }

  function formatCompetencia(value){
    if(value instanceof Date){
      const month = String(value.getMonth()+1).padStart(2,'0');
      return `${value.getFullYear()}-${month}`;
    }
    return value;
  }

  function buildStatusTag(status){
    const normalized = (status || '').toLowerCase();
    let cls = 'success';
    if(normalized.includes('atras') || normalized.includes('cobran') || normalized.includes('jur')) cls = 'danger';
    else if(normalized.includes('pend') || normalized.includes('negoci')) cls = 'warning';
    const icon = cls === 'success' ? 'bi-check-circle' : cls === 'warning' ? 'bi-exclamation-triangle' : 'bi-fire';
    return `<span class="wdg-tag ${cls}"><i class="bi ${icon}"></i>${escapeHtml(status)}</span>`;
  }

  function resolveCondominioNome(unidadeId){
    if(unidadeId){
      const target = state.unidades.find(un => String(un?._id) === String(unidadeId));
      if(target) return buildUnidadeLabel(target);
    }
    if(defaultUnitId && (!unidadeId || String(unidadeId) === String(defaultUnitId))){
      return defaultUnitName || 'Unidade vinculada';
    }
    return 'Condomínio';
  }

  function hasMovimentacaoForFundo(fundoId){
    if(!fundoId) return false;
    return state.fundos.some(entry => String(entry.fundoId || '') === String(fundoId));
  }

  function buildUnidadeLabel(unit){
    if(!unit) return 'Condomínio';
    const parts = [];
    if(unit.codigo) parts.push(unit.codigo);
    if(unit.nome) parts.push(unit.nome);
    return parts.length ? parts.join(' · ') : (unit._id || 'Condomínio');
  }

  function assetPath(relative){
    if(!relative) return '';
    const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const cleanRel = relative.replace(/^\/+/, '');
    return cleanBase ? `${cleanBase}/${cleanRel}` : `/${cleanRel}`;
  }

  function iconSrc(name){
    if(!name) return '';
    if(iconCache[name]) return iconCache[name];
    const src = assetPath(`images/${name}.png`);
    iconCache[name] = src;
    return src;
  }

  function buildIconButtonHtml(config){
    if(!config) return '';
    const label = config.label || '';
    const title = escapeHtml(config.title || label);
    const attrParts = [];
    if(config.action) attrParts.push(`data-action="${config.action}"`);
    if(config.id) attrParts.push(`data-id="${config.id}"`);
    const attrString = attrParts.length ? ` ${attrParts.join(' ')}` : '';
    const disabledAttr = config.disabled ? ' disabled' : '';
    const titleAttr = title ? ` title="${title}" aria-label="${title}"` : '';
    const iconName = config.icon || 'detalhe';
    const imgSrc = iconSrc(iconName);
    return `<button type="button" class="wdg-icon-btn"${titleAttr}${attrString}${disabledAttr}><img src="${imgSrc}" alt="${escapeHtml(label)}"></button>`;
  }

  function notify(message){
    if(!message) return;
    const alert = document.createElement('div');
    alert.className = 'alert alert-dark position-fixed top-0 end-0 m-3 shadow';
    alert.style.zIndex = 2000;
    alert.textContent = message;
    refs.toastTarget.appendChild(alert);
    setTimeout(() => alert.classList.add('show'));
    setTimeout(() => {
      alert.classList.remove('show');
      alert.addEventListener('transitionend', () => alert.remove(), { once: true });
    }, 2200);
  }

  function buildLastMonths(count){
    const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
    const now = new Date();
    const labels = [];
    for(let i = count - 1; i >= 0; i -= 1){
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(formatter.format(date));
    }
    return labels;
  }

  function bindCurrencyField(input){
    if(!input || input.__currencyMaskBound) return;
    const applyMask = evt => {
      const digits = extractCurrencyDigits(evt ? evt.target.value : input.value);
      input.dataset.rawDigits = digits;
      input.value = digits ? formatCurrency(Number(digits) / 100) : '';
    };
    input.addEventListener('input', applyMask);
    input.addEventListener('blur', applyMask);
    input.addEventListener('focus', () => {
      if(!input.dataset.rawDigits) input.dataset.rawDigits = '';
    });
    input.__currencyMaskBound = true;
    applyMask();
  }

  function resetCurrencyField(input){
    if(!input) return;
    input.dataset.rawDigits = '';
    input.value = '';
  }

  function parseCurrencyField(input){
    if(!input) return 0;
    const digits = input.dataset.rawDigits || extractCurrencyDigits(input.value);
    return digits ? Number(digits) / 100 : 0;
  }

  function extractCurrencyDigits(value){
    return String(value || '').replace(/\D/g, '');
  }

  function formatCurrency(value){
    const number = Number(value) || 0;
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatPercent(value){
    return (Number(value) * 100).toFixed(1) + '%';
  }

  function capitalizeFirst(text){
    if(!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function escapeHtml(str){
    if(str == null) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, c => map[c] || c);
  }

  function debounce(fn, delay){
    let timer;
    return function(...args){
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function withBase(path){
    if(!path) return '';
    if(/^https?:\/\//i.test(path)) return path;
    if(!basePath) return path;
    const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const clean = path.startsWith('/') ? path.slice(1) : path;
    return `${base}/${clean}`;
  }

  function simulateLoading(callback){
    setTimeout(callback, 150);
  }
})();
