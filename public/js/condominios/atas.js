(function(){
  const root = document.getElementById('atasApp');
  if(!root) return;

  const refs = {
    tabela: document.querySelector('#tabelaAtas tbody'),
    pager: document.getElementById('pagerAtas'),
    filtroPeriodo: document.getElementById('filtroPeriodo'),
    filtroFormato: document.getElementById('filtroFormato'),
    filtroBusca: document.getElementById('filtroBusca'),
    viewerTitulo: document.getElementById('viewerTitulo'),
    viewerPlaceholder: document.getElementById('viewerPlaceholder'),
    viewerFrame: document.getElementById('viewerFrame'),
    cardsResumo: document.getElementById('cardsResumo')
  };

  const state = {
    filtro: {
      periodo: 'ano',
      formato: 'todos',
      busca: ''
    },
    pagination: { page: 1, perPage: 6 },
    atas: [
      { id: 'ata-2025-10', data: '22/10/2025', titulo: 'AGO Ordinária 2025', tipo: 'Ordinária', presidente: 'Marina Costa', status: 'Disponível', pdf: 'sample-ata-ago-2025.pdf' },
      { id: 'ata-2025-08', data: '14/08/2025', titulo: 'Extraordinária · Regimento', tipo: 'Extraordinária', presidente: 'Carlos Mendes', status: 'Disponível', pdf: 'sample-ata-regimento.pdf' },
      { id: 'ata-2025-05', data: '07/05/2025', titulo: 'Reunião temática Energia', tipo: 'Temática', presidente: 'Clara Silva', status: 'Em execução', pdf: 'sample-ata-energia.pdf' },
      { id: 'ata-2025-03', data: '18/03/2025', titulo: 'Extraordinária Portaria', tipo: 'Extraordinária', presidente: 'Marina Costa', status: 'Arquivada', pdf: 'sample-ata-portaria.pdf' },
      { id: 'ata-2024-12', data: '10/12/2024', titulo: 'AGO 2024', tipo: 'Ordinária', presidente: 'Carlos Mendes', status: 'Disponível', pdf: 'sample-ata-ago-2024.pdf' },
      { id: 'ata-2024-08', data: '16/08/2024', titulo: 'Extraordinária – elevadores', tipo: 'Extraordinária', presidente: 'Marina Costa', status: 'Disponível', pdf: 'sample-ata-elevadores.pdf' }
    ],
    resumo: [
      { label: 'Atas assinadas em 2025', valor: 4, detail: '+1 vs 2024' },
      { label: 'Pendências de assinatura', valor: 1, detail: 'Em execução' },
      { label: 'Percentual digital', valor: '93%', detail: 'Atas com assinatura ICP' },
      { label: 'Downloads no app', valor: 327, detail: 'Últimos 12 meses' }
    ]
  };

  init();

  function init(){
    bindFilters();
    renderResumo();
    applyFilters();
  }

  function bindFilters(){
    refs.filtroPeriodo?.addEventListener('change', () => {
      state.filtro.periodo = refs.filtroPeriodo.value;
      applyFilters();
    });
    refs.filtroFormato?.addEventListener('change', () => {
      state.filtro.formato = refs.filtroFormato.value;
      applyFilters();
    });
    refs.filtroBusca?.addEventListener('input', debounce(() => {
      state.filtro.busca = (refs.filtroBusca.value || '').toLowerCase();
      applyFilters();
    }, 250));
    root.addEventListener('click', evt => {
      const action = evt.target.closest('[data-action]');
      if(!action) return;
      evt.preventDefault();
      const act = action.getAttribute('data-action');
      if(act === 'abrir-ata'){
        const id = action.dataset.id;
        openAta(id);
        return;
      }
      if(act === 'baixar-ata'){
        notify('Download iniciado em PDF com autenticação digital.');
        return;
      }
      notify(`Ação "${act}" em desenvolvimento.`);
    });
  }

  function applyFilters(){
    const filtered = state.atas.filter(row => {
      const matchFormato = state.filtro.formato === 'todos' || row.tipo.toLowerCase().includes(state.filtro.formato);
      const matchBusca = !state.filtro.busca || `${row.titulo} ${row.presidente}`.toLowerCase().includes(state.filtro.busca);
      return matchFormato && matchBusca;
    });
    state.pagination.page = 1;
    renderTable(filtered);
  }

  function renderTable(list){
    if(!refs.tabela) return;
    const { page, perPage } = state.pagination;
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, pages);
    state.pagination.page = safePage;
    const start = (safePage - 1) * perPage;
    const pageItems = list.slice(start, start + perPage);
    refs.tabela.innerHTML = '';
    if(!pageItems.length){
      refs.tabela.innerHTML = '<tr><td colspan="6"><div class="wdg-empty-state">Nenhuma ata encontrada para os filtros atuais.</div></td></tr>';
    } else {
      pageItems.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(row.data)}</td>
          <td>${escapeHtml(row.titulo)}</td>
          <td>${escapeHtml(row.tipo)}</td>
          <td>${escapeHtml(row.presidente)}</td>
          <td><span class="wdg-pill">${escapeHtml(row.status)}</span></td>
          <td class="text-end">
            <div class="btn-group">
              <button class="btn btn-outline-primary btn-sm" data-action="abrir-ata" data-id="${row.id}"><i class="bi bi-eye"></i></button>
              <button class="btn btn-outline-secondary btn-sm" data-action="baixar-ata"><i class="bi bi-download"></i></button>
            </div>
          </td>`;
        refs.tabela.appendChild(tr);
      });
    }
    renderPager(total, pageItems.length);
  }

  function renderPager(totalItems, countOnPage){
    if(!refs.pager) return;
    const { page, perPage } = state.pagination;
    if(totalItems <= perPage && totalItems > 0){
      refs.pager.classList.remove('table-pagination-hidden');
    } else if(totalItems === 0){
      refs.pager.classList.add('table-pagination-hidden');
      refs.pager.innerHTML = '';
      return;
    }
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const startDisplay = totalItems ? (page - 1) * perPage + 1 : 0;
    const endDisplay = totalItems ? startDisplay + countOnPage - 1 : 0;
    refs.pager.innerHTML = '';
    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = totalItems ? `Mostrando ${startDisplay}-${endDisplay} de ${totalItems}` : 'Sem registros';
    const controls = document.createElement('div');
    controls.className = 'btn-group';
    controls.appendChild(buildPagerButton('Anterior', page === 1, () => changePage(page - 1)));
    const pages = buildPageList(totalPages, page);
    pages.forEach(p => {
      if(p === '...'){
        const span = document.createElement('span');
        span.className = 'btn btn-outline-secondary disabled';
        span.textContent = '...';
        controls.appendChild(span);
      } else {
        const btn = buildPagerButton(p, false, () => changePage(p));
        if(p === page) btn.classList.add('active');
        controls.appendChild(btn);
      }
    });
    controls.appendChild(buildPagerButton('Próxima', page === totalPages, () => changePage(page + 1)));
    refs.pager.appendChild(info);
    refs.pager.appendChild(controls);
    refs.pager.classList.remove('table-pagination-hidden');
  }

  function buildPagerButton(label, disabled, handler){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-secondary';
    btn.textContent = label;
    btn.disabled = !!disabled;
    btn.addEventListener('click', handler);
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

  function changePage(target){
    const totalPages = Math.max(1, Math.ceil(state.atas.length / state.pagination.perPage));
    const next = Math.min(Math.max(1, target), totalPages);
    if(next === state.pagination.page) return;
    state.pagination.page = next;
    applyFilters();
  }

  function openAta(id){
    const ata = state.atas.find(item => item.id === id);
    if(!ata || !refs.viewerTitulo || !refs.viewerFrame) return;
    refs.viewerTitulo.textContent = ata.titulo;
    refs.viewerPlaceholder.classList.add('d-none');
    refs.viewerFrame.classList.remove('d-none');
    const base = root.dataset.basePath || '';
    refs.viewerFrame.src = `${base}/docs/${encodeURIComponent(ata.pdf)}`;
    notify('Pré-visualizando ata em PDF.');
  }

  function renderResumo(){
    if(!refs.cardsResumo) return;
    refs.cardsResumo.innerHTML = '';
    state.resumo.forEach(card => {
      const el = document.createElement('article');
      el.className = 'wdg-atas-card';
      el.innerHTML = `
        <span class="text-uppercase small text-muted">${escapeHtml(card.label)}</span>
        <h3 class="display-6 fw-bold">${escapeHtml(card.valor)}</h3>
        <small>${escapeHtml(card.detail)}</small>`;
      refs.cardsResumo.appendChild(el);
    });
  }

  function notify(message){
    if(!message) return;
    const alert = document.createElement('div');
    alert.className = 'alert alert-dark position-fixed top-0 end-0 m-3 shadow';
    alert.style.zIndex = 2050;
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.classList.add('show'));
    setTimeout(() => {
      alert.classList.remove('show');
      alert.addEventListener('transitionend', () => alert.remove(), { once: true });
    }, 2200);
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
