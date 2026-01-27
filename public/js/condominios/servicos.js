(function(){
  const root = document.getElementById('servicosApp');
  if(!root) return;

  const refs = {
    filtroCondominio: document.getElementById('filtroCondominio'),
    filtroStatus: document.getElementById('filtroStatus'),
    filtroOrigem: document.getElementById('filtroOrigem'),
    filtroBusca: document.getElementById('filtroBusca'),
    listaSolicitacoes: document.getElementById('listaSolicitacoes'),
    metricPendentes: document.getElementById('metricPendentes'),
    metricPendentesTexto: document.getElementById('metricPendentesTexto'),
    metricSla: document.getElementById('metricSla'),
    metricFinanceiro: document.getElementById('metricFinanceiro'),
    osSolicitacao: document.getElementById('osSolicitacao'),
    osResponsavel: document.getElementById('osResponsavel'),
    osPrevisao: document.getElementById('osPrevisao'),
    osObservacoes: document.getElementById('osObservacoes'),
    osStatusLabel: document.getElementById('osStatusLabel'),
    kanbanBoard: document.getElementById('kanbanBoard'),
    tabelaHistorico: document.querySelector('#tabelaHistorico tbody')
  };

  const basePath = root.dataset.basePath || '';
  const scopeAll = root.dataset.scopeAll === 'true';
  const defaultUnit = root.dataset.userUnit || '';
  const defaultUnitName = root.dataset.userUnitName || '';

  const state = {
    filtro: { status: 'todos', origem: 'todas', busca: '', unidade: defaultUnit || '' },
    unidades: [],
    solicitacoes: [],
    responsaveis: [
      { id: 'col-01', nome: 'Marcelo Lima', cargo: 'Técnico de manutenção', disponibilidade: 'Em plantão', rating: 4.9 },
      { id: 'col-02', nome: 'Bianca Sanches', cargo: 'Facilities', disponibilidade: 'Livre hoje', rating: 4.7 },
      { id: 'col-03', nome: 'Equipe TerceiraVia', cargo: 'Terceirizada elétrica', disponibilidade: 'Agenda 24h', rating: 4.5 }
    ],
    ordens: []
  };

  init();

  async function init(){
    await hydrateUnidades();
    await loadSolicitacoes();
    hydrateSelects();
    bindEvents();
    applyFilters();
    renderKanban();
    renderHistorico();
    renderMetrics();
  }

  async function hydrateUnidades(){
    if(!refs.filtroCondominio) return;
    refs.filtroCondominio.innerHTML = '<option value="">Carregando...</option>';
    try{
      const res = await fetch(`${basePath}/api/unidades?_=${Date.now()}`);
      if(!res.ok) throw new Error('Falha ao carregar unidades');
      const data = await res.json();
      state.unidades = Array.isArray(data) ? data : [];
      distribuirUnidadesDemo(state.unidades);
      popularSelectUnidades(state.unidades);
    } catch(err){
      console.error('[servicos] unidades erro', err);
      state.unidades = [];
      popularSelectUnidades([]);
    }
  }

  function popularSelectUnidades(list){
    if(!refs.filtroCondominio) return;
    const unidadesList = Array.isArray(list) ? list : state.unidades;
    const select = refs.filtroCondominio;
    select.innerHTML = '';

    // Para Diretor/User com unidade vinculada: trava no condomínio do usuário
    if(!scopeAll){
      const vinculado = defaultUnit || (unidadesList[0] && unidadesList[0]._id) || '';
      const label = resolveUnitLabel(vinculado, unidadesList) || defaultUnitName || 'Unidade vinculada';
      const option = document.createElement('option');
      option.value = vinculado;
      option.textContent = label;
      select.appendChild(option);
      select.disabled = true;
      state.filtro.unidade = vinculado;
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = unidadesList.length ? 'Todos os condomínios' : 'Nenhuma unidade disponível';
    select.appendChild(placeholder);

    unidadesList.forEach(unit => {
      const option = document.createElement('option');
      option.value = unit && unit._id ? String(unit._id) : '';
      option.textContent = resolveUnitLabel(option.value, [unit]) || (unit && unit.nome) || 'Condomínio';
      select.appendChild(option);
    });

    if(defaultUnit){
      select.value = defaultUnit;
      state.filtro.unidade = defaultUnit;
    } else if(unidadesList.length === 1){
      select.value = unidadesList[0]._id || '';
      state.filtro.unidade = select.value;
    }
  }

  function resolveUnitLabel(id, list){
    if(!id) return '';
    const source = Array.isArray(list) ? list : state.unidades;
    const found = source.find(u => u && String(u._id) === String(id));
    if(found){
      const parts = [];
      if(found.codigo) parts.push(found.codigo);
      if(found.nome) parts.push(found.nome);
      return parts.length ? parts.join(' · ') : (found.nome || 'Condomínio');
    }
    return defaultUnitName || '';
  }

  function distribuirUnidadesDemo(list){
    if(!Array.isArray(list) || !list.length) return;
    const ids = list.map(u => u && u._id).filter(Boolean).map(String);
    if(!ids.length) return;
    let idx = 0;
    state.ordens = state.ordens.map(order => ({ ...order, unidadeId: order.unidadeId || ids[idx++ % ids.length] }));
  }

  function hydrateSelects(){
    if(refs.osSolicitacao){
      refs.osSolicitacao.innerHTML = '<option value="">Selecione uma solicitação</option>' + state.solicitacoes.map(s => `<option value="${s.id}">${escapeHtml(s.titulo)} • ${escapeHtml(s.area)}</option>`).join('');
    }
    if(refs.osResponsavel){
      refs.osResponsavel.innerHTML = '<option value="">Selecione o responsável</option>' + state.responsaveis.map(r => `<option value="${r.id}">${escapeHtml(r.nome)} • ${escapeHtml(r.cargo)}</option>`).join('');
    }
    if(refs.osPrevisao){
      const dt = new Date();
      dt.setDate(dt.getDate() + 2);
      refs.osPrevisao.value = dt.toISOString().split('T')[0];
    }
  }

  function bindEvents(){
    refs.filtroCondominio?.addEventListener('change', async () => {
      state.filtro.unidade = refs.filtroCondominio.value || '';
      await loadSolicitacoes();
      applyFilters();
      renderKanban();
    });
    refs.filtroStatus?.addEventListener('change', () => {
      state.filtro.status = refs.filtroStatus.value;
      applyFilters();
    });
    refs.filtroOrigem?.addEventListener('change', () => {
      state.filtro.origem = refs.filtroOrigem.value;
      applyFilters();
    });
    refs.filtroBusca?.addEventListener('input', debounce(() => {
      state.filtro.busca = (refs.filtroBusca.value || '').toLowerCase();
      applyFilters();
    }, 200));
    root.addEventListener('click', evt => {
      const actionBtn = evt.target.closest('[data-action]');
      if(!actionBtn) return;
      const action = actionBtn.getAttribute('data-action');
      const svcId = actionBtn.getAttribute('data-id');
      switch(action){
        case 'nova-solicitacao':
          notify('Fluxo interno aberto para registrar uma nova demanda.');
          break;
        case 'abrir-portal':
          notify('Abrindo Portal do Morador em uma nova aba segura.');
          break;
        case 'gerar-os-card':
          if(svcId) prefillOrdemFromSolicitacao(svcId);
          scrollToOS();
          break;
        case 'gerar-os':
          gerarOrdem();
          break;
        case 'abrir-financeiro':
          notify('Redirecionando para Administração > Financeiro com a OS vinculada.');
          break;
        case 'ver-portal':
          notify('Visualizando conversa no Portal do Morador.');
          break;
        case 'exportar':
          notify('Exportação CSV/PDF agendada por e-mail.');
          break;
        case 'compartilhar':
          copyShareLink();
          break;
        case 'baixar-historico':
          notify('Relatório consolidado enviado para o seu e-mail.');
          break;
        default:
          break;
      }
    });
  }

  function applyFilters(){
    const unidadeSelecionada = state.filtro.unidade;
    const temDadosUnidade = state.solicitacoes.some(item => item.unidadeId);
    const list = state.solicitacoes.filter(item => {
      const statusOk = state.filtro.status === 'todos' || item.status === state.filtro.status;
      const origemOk = state.filtro.origem === 'todas' || item.origem === state.filtro.origem;
      const buscaOk = !state.filtro.busca || `${item.titulo} ${item.area} ${item.morador}`.toLowerCase().includes(state.filtro.busca);
      const unidadeOk = !unidadeSelecionada || !temDadosUnidade || String(item.unidadeId || '') === String(unidadeSelecionada);
      return statusOk && origemOk && buscaOk && unidadeOk;
    });
    renderSolicitacoes(list);
    renderMetrics();
  }

  async function loadSolicitacoes(){
    const params = new URLSearchParams();
    params.set('status', 'aberto,aceita');
    if(state.filtro.unidade) params.set('unidade', state.filtro.unidade);
    params.set('_', Date.now());

    try{
      const res = await fetch(`${basePath}/api/servicos/solicitacoes?${params.toString()}`);
      if(!res.ok) throw new Error('Falha ao carregar solicitações');
      const payload = await res.json();
      const data = Array.isArray(payload?.data) ? payload.data : [];
      const unitLabel = (id) => resolveUnitLabel(id) || 'Condomínio';
      state.solicitacoes = data.map(item => ({
        id: item._id,
        titulo: item.titulo || 'Solicitação',
        area: item.habitacao_label || 'Portal do Morador',
        origem: 'portal',
        morador: item.morador_email || 'Morador',
        unidade: unitLabel(item.unidade_id),
        unidadeId: item.unidade_id || '',
        prazo: formatPrazo(item.createdAt),
        criticidade: item.nova ? 'Alta' : 'Média',
        status: item.status === 'aceita' ? 'aceita' : 'pendente',
        slaOk: true,
        canal: 'Portal do Morador'
      }));
      applyFilters();
      renderKanban();
      renderMetrics();
    }catch(err){
      console.error('[servicos] solicitacoes erro', err);
      state.solicitacoes = [];
      notify('Não foi possível carregar as solicitações do Portal.');
    }
  }

  function formatPrazo(dateStr){
    if(!dateStr) return 'Portal';
    const dt = new Date(dateStr);
    if(Number.isNaN(dt.getTime())) return 'Portal';
    const day = dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
    const hour = dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    return `${day} • ${hour}`;
  }

  function renderSolicitacoes(list){
    if(!refs.listaSolicitacoes) return;
    if(!list.length){
      refs.listaSolicitacoes.innerHTML = '<div class="wdg-empty-state">Nenhuma solicitação com os filtros aplicados.</div>';
      return;
    }
    refs.listaSolicitacoes.innerHTML = list.map(item => {
      const badgeClass = item.origem === 'portal' ? 'text-bg-info' : 'text-bg-dark';
      const criticity = item.criticidade === 'Alta' ? 'danger' : item.criticidade === 'Média' ? 'warning' : 'secondary';
      const statusLabel = item.status === 'aceita' ? '<span class="badge text-bg-success ms-2">Solicitação aceita</span>' : '<span class="badge text-bg-secondary ms-2">Aguardando aceite</span>';
      const osDisabled = item.status !== 'aceita' ? 'disabled' : '';
      return `
        <article class="wdg-service-card">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h3 class="h5 mb-1">${escapeHtml(item.titulo)}</h3>
              <p class="text-muted mb-2">${escapeHtml(item.area)} • ${escapeHtml(item.prazo)} ${statusLabel}</p>
              <small class="d-block text-muted">Origem: <span class="fw-semibold">${item.origem === 'portal' ? 'Portal do Morador' : 'Administração'}</span> — Solicitante: ${escapeHtml(item.morador)}</small>
            </div>
            <span class="badge ${badgeClass}">${escapeHtml(item.canal)}</span>
          </div>
          <div class="d-flex align-items-center gap-3 mt-3">
            <span class="badge rounded-pill text-bg-${criticity}">Criticidade ${escapeHtml(item.criticidade)}</span>
            <span class="badge rounded-pill text-bg-${item.slaOk ? 'success' : 'danger'}">${item.slaOk ? 'Dentro do SLA' : 'SLA em risco'}</span>
          </div>
          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-outline-primary flex-fill" data-action="ver-portal"><i class="bi bi-chat-square-text me-1"></i>Portal</button>
            <button class="btn btn-primary flex-fill" data-action="gerar-os-card" data-id="${item.id}" ${osDisabled}><i class="bi bi-clipboard-plus me-1"></i>${item.status === 'aceita' ? 'Gerar OS' : 'Aguardando aceite'}</button>
          </div>
        </article>`;
    }).join('');
  }

  function renderKanban(){
    if(!refs.kanbanBoard) return;
    const columns = [
      { key: 'fila', label: 'Fila de atendimento', icon: 'bi-inbox', items: [] },
      { key: 'execucao', label: 'Em execução', icon: 'bi-lightning', items: [] },
      { key: 'aguardando', label: 'Aguardando aprovação', icon: 'bi-hourglass-split', items: [] },
      { key: 'finalizado', label: 'Concluídos', icon: 'bi-check-circle', items: [] }
    ];
    state.solicitacoes.forEach(item => {
      if(item.status === 'pendente') columns[0].items.push(buildKanbanItem(item));
    });
    const html = columns.map(col => `
      <div class="wdg-kanban-column">
        <h3><i class="bi ${col.icon}"></i>${col.label}</h3>
        <ul>
          ${col.items.length ? col.items.map(li => `<li>${li}</li>`).join('') : '<li class="text-muted small">Sem itens</li>'}
        </ul>
      </div>`).join('');
    refs.kanbanBoard.innerHTML = html;
  }

  function buildKanbanItem(item){
    return `
      <div class="d-flex flex-column">
        <strong>${escapeHtml(item.titulo)}</strong>
        <small class="text-muted">${escapeHtml(item.area)} • ${escapeHtml(item.prazo)}</small>
      </div>`;
  }

  function renderHistorico(){
    if(!refs.tabelaHistorico) return;
    const rows = state.ordens.map(order => {
      return `
        <tr>
          <td>${escapeHtml(order.id)}</td>
          <td>${escapeHtml(order.titulo)}</td>
          <td>${escapeHtml(order.responsavel)}</td>
          <td>${escapeHtml(order.origem === 'portal' ? 'Portal do Morador' : 'Condomínio')}</td>
          <td>${formatCurrency(order.custo)}</td>
          <td><span class="badge rounded-pill text-bg-${order.status === 'finalizado' ? 'success' : order.status === 'em_execucao' ? 'warning' : 'secondary'}">${escapeHtml(mapStatusLabel(order.status))}</span></td>
        </tr>`;
    });
    refs.tabelaHistorico.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="6" class="text-center text-muted">Nenhuma ordem gerada ainda.</td></tr>';
  }

  function renderMetrics(){
    const pendentes = state.solicitacoes.filter(s => s.status === 'pendente');
    refs.metricPendentes.textContent = pendentes.length;
    refs.metricPendentesTexto.textContent = pendentes.length ? 'Solicitações aguardando atendimento' : 'Nenhuma pendência — parabéns!';
    const totalHistorico = state.ordens.length;
    const slaCount = state.ordens.filter(o => o.sla === 'Dentro').length;
    refs.metricSla.textContent = totalHistorico ? `${Math.round((slaCount / totalHistorico) * 100)}%` : '0%';
    const custoTotal = state.ordens.reduce((sum, o) => sum + (o.custo || 0), 0);
    refs.metricFinanceiro.textContent = formatCurrency(custoTotal);
  }

  function prefillOrdemFromSolicitacao(id){
    const option = state.solicitacoes.find(s => s.id === id);
    if(!option || !refs.osSolicitacao) return;
    refs.osSolicitacao.value = option.id;
    refs.osStatusLabel.textContent = 'Selecionada';
    refs.osStatusLabel.classList.remove('text-bg-success');
    refs.osStatusLabel.classList.add('text-bg-warning');
  }

  function scrollToOS(){
    const panel = document.querySelector('.wdg-os-panel');
    if(!panel) return;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function gerarOrdem(){
    if(!refs.osSolicitacao || !refs.osResponsavel) return;
    const solicitacaoId = refs.osSolicitacao.value;
    const responsavelId = refs.osResponsavel.value;
    if(!solicitacaoId){ notify('Selecione uma solicitação para gerar a OS.'); return; }
    if(!responsavelId){ notify('Escolha o funcionário responsável.'); return; }
    const solicitacao = state.solicitacoes.find(s => s.id === solicitacaoId);
    const responsavel = state.responsaveis.find(r => r.id === responsavelId);
    const novaOS = {
      id: `OS-${Math.floor(Math.random()*900)+100}`,
      solicitacaoId,
      titulo: solicitacao ? solicitacao.titulo : 'Serviço',
      responsavel: responsavel ? responsavel.nome : 'Equipe',
      status: 'aguardando_aprovacao',
      origem: solicitacao ? solicitacao.origem : 'condominio',
      custo: Math.round(Math.random()*800)+150,
      data: new Date().toLocaleDateString('pt-BR'),
      sla: 'Dentro',
      canal: solicitacao ? solicitacao.canal : 'Central',
      financeiro: false
    };
    state.ordens.unshift(novaOS);
    if(solicitacao){ solicitacao.status = 'executando'; }
    notify('OS criada, push enviado para o morador e síndico.');
    refs.osStatusLabel.textContent = 'Gerada';
    refs.osStatusLabel.classList.remove('text-bg-warning');
    refs.osStatusLabel.classList.add('text-bg-success');
    refs.osObservacoes.value = '';
    renderHistorico();
    renderKanban();
    applyFilters();
  }

  function mapStatusLabel(status){
    switch(status){
      case 'em_execucao': return 'Em execução';
      case 'aguardando_aprovacao': return 'Aguardando aprovação';
      case 'finalizado': return 'Finalizado';
      case 'pendente': return 'Pendente';
      default: return status;
    }
  }

  function formatCurrency(value){
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  }

  function notify(message){
    if(!message) return;
    const toast = document.createElement('div');
    toast.className = 'alert alert-dark position-fixed top-0 end-0 m-3 shadow';
    toast.style.zIndex = 2050;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 2200);
  }

  function copyShareLink(){
    const base = root.dataset.basePath || '/condominios';
    const url = `${location.origin}${base}/servicos/servicos`;
    navigator.clipboard?.writeText(url)
      .then(() => notify('Link copiado e pronto para envio ao conselho.'))
      .catch(() => notify('Copie manualmente: ' + url));
  }

  function debounce(fn, delay){
    let timer;
    return function(...args){
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function escapeHtml(value){
    if(value == null) return '';
    return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] || c));
  }
})();
