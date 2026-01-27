(function(){
  const root = document.getElementById('assembleiaApp');
  if(!root) return;

  const refs = {
    agendamentos: document.getElementById('listaAgendamentos'),
    participantes: document.getElementById('listaParticipantes'),
    votacoes: document.getElementById('listaVotacoes'),
    timeline: document.getElementById('timelineAtas'),
    atas: document.querySelector('#tabelaAtas tbody'),
    pagerAtas: document.getElementById('pagerAtas'),
    enquetes: document.getElementById('listaEnquetes'),
    comunicados: document.getElementById('listaComunicados'),
    ataEditor: document.getElementById('ataEditor')
  };

  const pagination = {
    page: 1,
    perPage: 5
  };

  const state = {
    agendamentos: [
      { id: 'asm-301', titulo: 'Assembleia Extraordinária', data: '15/12/2025 · 19h30', formato: 'Híbrido', pauta: 'Rateio da fachada e elevadores', publico: 'Condôminos + Conselho', status: 'Convites enviados' },
      { id: 'asm-299', titulo: 'Prestação de contas 2025', data: '10/02/2026 · 20h00', formato: 'Remoto', pauta: 'Contas anuais / aprovação orçamento', publico: 'Todos os moradores', status: 'Rascunho' },
      { id: 'asm-295', titulo: 'Assembleia Temática Energia Solar', data: '28/01/2026 · 19h', formato: 'Presencial', pauta: 'Apresentação proposta fornecedor', publico: 'Blocos A e B', status: 'Pesquisa de interesse' }
    ],
    participantes: [
      { nome: 'Marina Costa', unidade: 'Torre A · 1204', papel: 'Síndica', status: 'Online' },
      { nome: 'Rodrigo Nogueira', unidade: 'Torre B · 701', papel: 'Conselheiro', status: 'Online' },
      { nome: 'Helena Prado', unidade: 'Garden 08', papel: 'Condomina', status: 'Presencial' },
      { nome: 'Eduardo Matos', unidade: 'Cobertura 02', papel: 'Condomino', status: 'Online' }
    ],
    votacoes: [
      { id: 'vote-1', tema: 'Reajuste do fundo de reserva', status: 'Aberta', quorum: '54% computado', prazo: 'Encerra em 12 min' },
      { id: 'vote-2', tema: 'Contratação da empresa de segurança', status: 'Preparando', quorum: 'aguardando apresentação', prazo: 'Sequência' }
    ],
    timeline: [
      { data: '22/10/2025', titulo: 'AGO Ordinária', resumo: 'Aprovação da previsão orçamentária 2026 e eleição de conselheiros.' },
      { data: '14/08/2025', titulo: 'Assembleia Extraordinária', resumo: 'Deliberação sobre pet-friendly e atualização do regimento interno.' },
      { data: '07/05/2025', titulo: 'Reunião temática', resumo: 'Apresentação do projeto de energia solar - fase estudo.' }
    ],
    atas: [
      { data: '22/10/2025', titulo: 'AGO Ordinária 2025', presidente: 'Marina Costa', decisoes: 5, status: 'Arquivo definitivo' },
      { data: '14/08/2025', titulo: 'AE Regimento interno', presidente: 'Carlos Mendes', decisoes: 3, status: 'Publicado no app' },
      { data: '07/05/2025', titulo: 'Reunião Energia Solar', presidente: 'Clara Silva', decisoes: 2, status: 'Em execução' },
      { data: '18/03/2025', titulo: 'Assembleia Extra: portaria', presidente: 'Marina Costa', decisoes: 4, status: 'Arquivado' },
      { data: '10/12/2024', titulo: 'AGO 2024', presidente: 'Carlos Mendes', decisoes: 6, status: 'Arquivo definitivo' }
    ],
    enquetes: [
      { pergunta: 'Qual formato preferido para assembleias ordinárias?', votos: { presencial: 32, hibrido: 58, remoto: 12 }, expira: '05/12' },
      { pergunta: 'Favoráveis ao orçamento da fachada?', votos: { sim: 41, nao: 9, abstenção: 4 }, expira: '12/12' }
    ],
    comunicados: [
      { titulo: 'Envio da ata 22/10', corpo: 'Arquivo disponível no app e e-mail dos moradores.', autor: 'Síndica', data: '23/10/2025' },
      { titulo: 'Próxima assembleia híbrida', corpo: 'Reserve a data 15/12 às 19h30. Link será enviado pelo app.', autor: 'Gestão', data: '01/11/2025' }
    ]
  };

  init();

  function init(){
    renderAgendamentos();
    renderParticipantes();
    renderVotacoes();
    renderTimeline();
    renderAtas();
    renderEnquetes();
    renderComunicados();
    hydrateAtaEditor();
    bindEvents();
  }

  function bindEvents(){
    root.addEventListener('click', evt => {
      const action = evt.target.closest('[data-action]');
      if(!action) return;
      evt.preventDefault();
      const name = action.getAttribute('data-action');
      if(name === 'ver-presenca'){
        notify('Lista completa disponível após registrar presença.');
        return;
      }
      if(name === 'finalizar-ata'){
        notify('Ata marcada como concluída e pronta para assinatura digital.');
        return;
      }
      if(name === 'inserir-modelo'){
        if(refs.ataEditor){
          refs.ataEditor.value = buildModeloAta();
        }
        notify('Modelo aplicado. Ajuste os campos antes de salvar.');
        return;
      }
      notify(`Ação "${name}" em desenvolvimento.`);
    });
  }

  function renderAgendamentos(){
    if(!refs.agendamentos) return;
    refs.agendamentos.innerHTML = '';
    state.agendamentos.forEach(item => {
      const card = document.createElement('article');
      card.className = 'wdg-asm-card';
      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <h3>${escapeHtml(item.titulo)}</h3>
            <small>${escapeHtml(item.data)} · ${escapeHtml(item.formato)}</small>
          </div>
          <span class="wdg-pill">${escapeHtml(item.status)}</span>
        </div>
        <p class="mt-3 mb-2 fw-semibold">Pauta: ${escapeHtml(item.pauta)}</p>
        <small class="text-muted">Público: ${escapeHtml(item.publico)}</small>
        <div class="mt-3 d-flex gap-2">
          <button class="btn btn-outline-primary btn-sm" data-action="abrir-assembleia">Detalhes</button>
          <button class="btn btn-outline-secondary btn-sm" data-action="duplicar-agendamento">Duplicar</button>
        </div>`;
      refs.agendamentos.appendChild(card);
    });
  }

  function renderParticipantes(){
    if(!refs.participantes) return;
    refs.participantes.innerHTML = '';
    state.participantes.forEach(person => {
      const item = document.createElement('li');
      item.className = 'list-group-item d-flex justify-content-between align-items-center';
      item.innerHTML = `
        <div>
          <p class="mb-0 fw-semibold">${escapeHtml(person.nome)}</p>
          <small class="text-muted">${escapeHtml(person.unidade)} · ${escapeHtml(person.papel)}</small>
        </div>
        <span class="badge rounded-pill ${person.status === 'Online' ? 'text-bg-success' : 'text-bg-primary'}">${escapeHtml(person.status)}</span>`;
      refs.participantes.appendChild(item);
    });
  }

  function renderVotacoes(){
    if(!refs.votacoes) return;
    refs.votacoes.innerHTML = '';
    state.votacoes.forEach(vote => {
      const card = document.createElement('div');
      card.className = 'border rounded-3 p-3';
      card.innerHTML = `
        <p class="mb-1 fw-semibold">${escapeHtml(vote.tema)}</p>
        <small class="text-muted d-block">${escapeHtml(vote.quorum)}</small>
        <div class="d-flex justify-content-between align-items-center mt-2">
          <span class="wdg-pill">${escapeHtml(vote.status)}</span>
          <button class="btn btn-outline-secondary btn-sm" data-action="abrir-votacao">${vote.status === 'Aberta' ? 'Acompanhar' : 'Preparar'}</button>
        </div>`;
      refs.votacoes.appendChild(card);
    });
  }

  function renderTimeline(){
    if(!refs.timeline) return;
    refs.timeline.innerHTML = '';
    state.timeline.forEach(entry => {
      const li = document.createElement('li');
      li.innerHTML = `
        <h4 class="h6 mb-1">${escapeHtml(entry.data)} · ${escapeHtml(entry.titulo)}</h4>
        <p class="text-muted mb-0">${escapeHtml(entry.resumo)}</p>`;
      refs.timeline.appendChild(li);
    });
  }

  function renderAtas(){
    if(!refs.atas) return;
    const total = state.atas.length;
    const pages = Math.max(1, Math.ceil(total / pagination.perPage));
    if(pagination.page > pages) pagination.page = pages;
    const start = (pagination.page - 1) * pagination.perPage;
    const rows = state.atas.slice(start, start + pagination.perPage);
    refs.atas.innerHTML = '';
    if(!rows.length){
      refs.atas.innerHTML = '<tr><td colspan="6"><div class="wdg-empty-state">Nenhuma ata registrada.</div></td></tr>';
    } else {
      rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(row.data)}</td>
          <td>${escapeHtml(row.titulo)}</td>
          <td>${escapeHtml(row.presidente)}</td>
          <td>${row.decisoes} deliberações</td>
          <td><span class="wdg-pill">${escapeHtml(row.status)}</span></td>
          <td class="text-end"><button class="btn btn-link btn-sm" data-action="ver-ata">Abrir</button></td>`;
        refs.atas.appendChild(tr);
      });
    }
    renderAtasPager(total);
  }

  function renderAtasPager(total){
    if(!refs.pagerAtas) return;
    const pages = Math.max(1, Math.ceil(total / pagination.perPage));
    refs.pagerAtas.innerHTML = '';
    if(total === 0){
      refs.pagerAtas.classList.add('table-pagination-hidden');
      return;
    }
    refs.pagerAtas.classList.remove('table-pagination-hidden');
    const start = (pagination.page - 1) * pagination.perPage + 1;
    const end = Math.min(total, pagination.page * pagination.perPage);
    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = `Mostrando ${start}-${end} de ${total}`;
    const controls = document.createElement('div');
    controls.className = 'btn-group';
    controls.appendChild(buildPagerButton('Anterior', pagination.page === 1, () => changePage(pagination.page - 1)));
    for(let i = 1; i <= pages; i += 1){
      const btn = buildPagerButton(i, false, () => changePage(i));
      if(i === pagination.page) btn.classList.add('active');
      controls.appendChild(btn);
    }
    controls.appendChild(buildPagerButton('Próxima', pagination.page === pages, () => changePage(pagination.page + 1)));
    refs.pagerAtas.appendChild(info);
    refs.pagerAtas.appendChild(controls);
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

  function changePage(target){
    const totalPages = Math.max(1, Math.ceil(state.atas.length / pagination.perPage));
    const next = Math.min(Math.max(1, target), totalPages);
    if(next === pagination.page) return;
    pagination.page = next;
    renderAtas();
  }

  function renderEnquetes(){
    if(!refs.enquetes) return;
    refs.enquetes.innerHTML = '';
    state.enquetes.forEach(poll => {
      const total = Object.values(poll.votos).reduce((acc,val) => acc + val, 0) || 1;
      const card = document.createElement('div');
      card.className = 'border rounded-3 p-3';
      card.innerHTML = `<p class="fw-semibold mb-1">${escapeHtml(poll.pergunta)}</p><small class="text-muted">Encerra em ${escapeHtml(poll.expira)}</small>`;
      Object.entries(poll.votos).forEach(([label, value]) => {
        const percent = Math.round((value / total) * 100);
        const row = document.createElement('div');
        row.className = 'mt-2';
        row.innerHTML = `
          <div class="d-flex justify-content-between"><small>${escapeHtml(label)}</small><small>${percent}%</small></div>
          <div class="progress" style="height:6px;"><div class="progress-bar" role="progressbar" style="width:${percent}%"></div></div>`;
        card.appendChild(row);
      });
      refs.enquetes.appendChild(card);
    });
  }

  function renderComunicados(){
    if(!refs.comunicados) return;
    refs.comunicados.innerHTML = '';
    state.comunicados.forEach(note => {
      const card = document.createElement('div');
      card.className = 'border rounded-3 p-3 bg-light';
      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <p class="fw-semibold mb-1">${escapeHtml(note.titulo)}</p>
            <small class="text-muted">${escapeHtml(note.data)} · ${escapeHtml(note.autor)}</small>
          </div>
          <button class="btn btn-outline-secondary btn-sm" data-action="reenviar-comunicado">Reenviar</button>
        </div>
        <p class="mb-0 mt-2">${escapeHtml(note.corpo)}</p>`;
      refs.comunicados.appendChild(card);
    });
  }

  function hydrateAtaEditor(){
    if(refs.ataEditor && !refs.ataEditor.value){
      refs.ataEditor.value = buildModeloAta();
    }
  }

  function buildModeloAta(){
    const now = new Date();
    const data = now.toLocaleDateString('pt-BR');
    return `Aberta a sessão às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} do dia ${data}.\n\nPresentes: Síndica, Conselho, condôminos representando 68% da fração ideal.\n\nPauta 1 - Prestação de contas:\n • Exposição do balancete do 3º trimestre.\n • Deliberação: contas aprovadas por unanimidade.\n\nPauta 2 - Reforma da fachada:\n • Apresentação do orçamento consolidado.\n • Deliberação: aprovada por 61% favoráveis, prazo de início fevereiro/2026.\n\nNada mais havendo, foi lavrada a presente ata para assinatura digital.`;
  }

  function notify(message){
    if(!message) return;
    const alert = document.createElement('div');
    alert.className = 'alert alert-primary position-fixed top-0 end-0 mt-3 me-3 shadow';
    alert.style.zIndex = 2050;
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.classList.add('show'));
    setTimeout(() => {
      alert.classList.remove('show');
      alert.addEventListener('transitionend', () => alert.remove(), { once: true });
    }, 2200);
  }

  function escapeHtml(value){
    if(value == null) return '';
    return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] || c));
  }
})();
