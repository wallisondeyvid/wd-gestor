(function(){
  let modalEl, bsModal;
  let selecionado = null;
  // Preferir o endpoint do módulo Escalas por padrão (evita 401 em /gestor quando não autenticado)
  let recursosEndpointPreferred = 'escalas'; // 'gestor' | 'escalas' | null

  function $(s,ctx){ return (ctx||document).querySelector(s); }
  function $all(s,ctx){ return Array.from((ctx||document).querySelectorAll(s)); }

  function abrir(){
    modalEl = document.getElementById('modalLocalizarRecurso');
    if(!modalEl){ console.error('[localizar_recurso] modalLocalizarRecurso não encontrado no DOM'); return; }
    if(!bsModal) bsModal = new bootstrap.Modal(modalEl);
    carregarUnidades();
    limparTabela();
    selecionado = null;
    $('#btnSelecionarRecursoGestor').disabled = true;
    // Manter modal de recurso no estado "show" e normalizado
    try {
      const modalRecursoEl = document.getElementById('modalRecurso');
      if(modalRecursoEl && !modalRecursoEl.classList.contains('show')){
        const recInst = bootstrap.Modal.getOrCreateInstance(modalRecursoEl, { backdrop:'static' });
        recInst.show();
      }
      if(modalRecursoEl){ modalRecursoEl.style.zIndex = '1060'; }
    } catch(_mr){}
    bsModal.show();
    // Sem esconder o modal anterior: empilhar por z-index/backdrop
  }

  function carregarUnidades(){
    const sel = $('#buscaRecursoUnidade');
    if(!sel) return;
    // Limpar e inserir opção padrão
    sel.innerHTML = '';
    const def = document.createElement('option'); def.value=''; def.selected=true; def.textContent='Selecione...'; sel.appendChild(def);
    // Tentar API de unidades relacionadas no módulo Escalas
    const base = (document.body && document.body.dataset && document.body.dataset.basePath) ? document.body.dataset.basePath : '/escalas';
    fetch(base + '/api/unidades-relacionadas', { credentials:'same-origin' })
      .then(r=> r.ok? r.json(): null)
      .then(js=>{
        const arr = (js && Array.isArray(js.data))? js.data: [];
        if(!arr.length) return;
        arr.forEach(u=>{
          const id = (u.id||u._id||u.unidade_id||u.codigo||'').toString();
          const nome = u.nome || u.descricao || u.titulo || u.codigo || 'Unidade';
          const opt = document.createElement('option');
          opt.value = id; opt.textContent = (u.codigo? (u.codigo+' - '):'') + nome;
          sel.appendChild(opt);
        });
      })
      .catch(()=>{
        // Fallback leve a partir de contexto global, se existir
        try {
          const unidades = (window.__ESCALA_CONTEXT__ && Array.isArray(window.__ESCALA_CONTEXT__.unidades))? window.__ESCALA_CONTEXT__.unidades: [];
          unidades.forEach(u=>{
            const opt = document.createElement('option');
            opt.value = (u.id||u._id||u.codigo||'').toString();
            opt.textContent = (u.codigo? (u.codigo+' - '):'') + (u.nome||'Unidade');
            sel.appendChild(opt);
          });
        } catch(_e){}
      });
  }

  function limparTabela(){
    const tbody = $('#tabelaResultadosRecursosGestor tbody');
    tbody.innerHTML = '';
  }

  async function executarBuscaReal(placa, unidade){
    // Regra: é necessário ao menos um filtro (placa ou unidade)
    if(!placa && !unidade){
      return [];
    }
    const base = (document.body && document.body.dataset && document.body.dataset.basePath) ? document.body.dataset.basePath : '/escalas';
    const params = new URLSearchParams();
    if(placa) params.set('placa', placa);
    if(unidade) params.set('unidadeId', unidade);
    // Preferir endpoint do Gestor (sempre montado). Cacheia preferência ao obter 200.
    const tryGestor = async () => {
      const url = '/gestor/api/recursos' + (params.toString()? ('?'+params.toString()): '');
      const r = await fetch(url, { credentials:'same-origin' });
      if(!r.ok) return null;
      const js = await r.json();
      recursosEndpointPreferred = 'gestor';
      if(Array.isArray(js)) return js; if(js && Array.isArray(js.data)) return js.data; return [];
    };
    const tryEscalas = async () => {
      const url = base + '/api/recursos' + (params.toString()? ('?'+params.toString()): '');
      const r = await fetch(url, { credentials:'same-origin' });
      if(!r.ok) return null;
      const js = await r.json();
      recursosEndpointPreferred = 'escalas';
      if(Array.isArray(js)) return js; if(js && Array.isArray(js.data)) return js.data; return [];
    };

    try {
      // Em páginas da diária, force preferir '/escalas' para evitar 401 do '/gestor'
      try {
        const p = (location && location.pathname) ? location.pathname : '';
        if(/\/escalas\/diaria(\b|\/)/.test(p)) recursosEndpointPreferred = 'escalas';
      } catch(_){ }
      if(recursosEndpointPreferred === 'gestor'){
        const out = await tryGestor(); if(out) return out; // se falhar, tenta escalas
        const out2 = await tryEscalas(); return out2 || [];
      }
      if(recursosEndpointPreferred === 'escalas'){
        const out = await tryEscalas(); if(out) return out; // se falhar, tenta gestor
        const out2 = await tryGestor(); return out2 || [];
      }
      // Primeira detecção: Gestor primeiro para evitar 404 em /escalas quando módulo não está ativo
      const g = await tryGestor(); if(g) return g;
      const e = await tryEscalas(); if(e) return e;
      return [];
    } catch(_e){ return []; }
  }
  async function simularBusca(e){
    e.preventDefault();
    const placa = $('#buscaRecursoPlaca').value.trim();
    const unidade = $('#buscaRecursoUnidade').value;
    // Se não informou nenhum filtro, não busca e avisa
    if(!placa && !unidade){
      const tb = $('#tabelaResultadosRecursosGestor tbody');
      if(tb) tb.innerHTML = '';
      try { if(window.__toastRecurso){ window.__toastRecurso.info('Digite uma placa ou selecione uma unidade.'); } else { alert('Digite uma placa ou selecione uma unidade.'); } } catch(_t){}
      return;
    }
    const tbody = $('#tabelaResultadosRecursosGestor tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Buscando...</td></tr>';
    const resultados = await executarBuscaReal(placa, unidade) || [];
    if(!resultados.length){ tbody.innerHTML = ''; return; }
    tbody.innerHTML = resultados.map(r=>{
      const id = r.id||r._id||r.recurso_id||'';
      const placa = r.placa||r.codigo||r.patrimonio||'';
      const marca = r.marca||r.fabricante||'';
      const modelo = r.modelo||r.descricao||r.titulo||'';
      const unidade = r.unidade_nome||r.unidadeFormatada||r.unidade||r.unidade_codigo||'';
      return `<tr data-id="${id}"><td><input type="radio" name="selRecurso"></td><td>${placa}</td><td>${marca}</td><td>${modelo}</td><td>${unidade}</td></tr>`;
    }).join('');
  }

  function bindTabela(){
    document.addEventListener('click', e=>{
      const tr = e.target.closest('#tabelaResultadosRecursosGestor tbody tr');
      if(tr){
        $all('#tabelaResultadosRecursosGestor tbody tr').forEach(l=> l.classList.remove('table-active'));
        tr.classList.add('table-active');
        const id = tr.getAttribute('data-id');
        const cols = tr.querySelectorAll('td');
        selecionado = {
          id,
          placa: cols[1].textContent,
          marca: cols[2].textContent,
          modelo: cols[3].textContent
        };
        tr.querySelector('input[type=radio]').checked = true;
        const bSel = $('#btnSelecionarRecursoGestor');
        if(bSel){ bSel.disabled = false; bSel.removeAttribute('disabled'); }
      }
    });
    // Habilitar seleção também ao marcar o radio diretamente
    document.addEventListener('change', e=>{
      const input = e.target.closest('#tabelaResultadosRecursosGestor tbody input[type="radio"][name="selRecurso"]');
      if(!input) return;
      const tr = input.closest('tr');
      if(!tr) return;
      $all('#tabelaResultadosRecursosGestor tbody tr').forEach(l=> l.classList.remove('table-active'));
      tr.classList.add('table-active');
      const id = tr.getAttribute('data-id');
      const cols = tr.querySelectorAll('td');
      selecionado = {
        id,
        placa: cols[1].textContent,
        marca: cols[2].textContent,
        modelo: cols[3].textContent
      };
      const bSel2 = $('#btnSelecionarRecursoGestor');
      if(bSel2){ bSel2.disabled = false; bSel2.removeAttribute('disabled'); }
    });
    // Duplo clique na linha confirma seleção
    document.addEventListener('dblclick', e=>{
      const tr = e.target.closest('#tabelaResultadosRecursosGestor tbody tr');
      if(!tr) return;
      const btn = document.getElementById('btnSelecionarRecursoGestor');
      if(btn){ btn.disabled = false; btn.removeAttribute('disabled'); }
      confirmar();
    });
  }

  function obterSelecaoAtualDoDom(){
    try {
      const tr = document.querySelector('#tabelaResultadosRecursosGestor tbody tr.table-active') ||
                document.querySelector('#tabelaResultadosRecursosGestor tbody input[name="selRecurso"]:checked')?.closest('tr');
      if(!tr) return null;
      const id = tr.getAttribute('data-id');
      const tds = tr.querySelectorAll('td');
      return {
        id,
        placa: tds[1]?.textContent || '',
        marca: tds[2]?.textContent || '',
        modelo: tds[3]?.textContent || ''
      };
    } catch(_e){ return null; }
  }

  function confirmar(){
    if(!selecionado){
      selecionado = obterSelecaoAtualDoDom();
    }
    if(!selecionado){
      try { if(window.__toastRecurso){ window.__toastRecurso.info('Selecione um recurso da lista.'); } else { alert('Selecione um recurso da lista.'); } } catch(_t){ try { alert('Selecione um recurso da lista.'); } catch(_){} }
      return;
    }
    const parts = [selecionado.placa, selecionado.marca, selecionado.modelo].filter(Boolean);
    const label = parts.join(' - ');
    const input = document.getElementById('campoPesquisarRecurso');
    if(input){ input.value = label; }
    const hidden = document.getElementById('recursoSelecionadoId');
    if(hidden){ hidden.value = selecionado.id; }
    // Preencher campos ocultos de apoio
    const hPlaca = document.getElementById('recursoSelecionadoPlaca');
    const hMarca = document.getElementById('recursoSelecionadoMarca');
    const hModelo = document.getElementById('recursoSelecionadoModelo');
    if(hPlaca) hPlaca.value = selecionado.placa || '';
    if(hMarca) hMarca.value = selecionado.marca || '';
    if(hModelo) hModelo.value = selecionado.modelo || '';
    const limparBtn = document.getElementById('btnLimparRecursoSelecionado');
    if(limparBtn){ limparBtn.style.display='inline-block'; }
    // Avisar o modal principal sobre a seleção (para que ele possa higienizar estado)
    try {
      document.dispatchEvent(new CustomEvent('recurso:selecionado-localizar', { detail:{ id: selecionado.id, placa: selecionado.placa, marca: selecionado.marca, modelo: selecionado.modelo } }));
    } catch(_evt){}
    bsModal.hide();
  }

  function limparSelecao(){
    const input = document.getElementById('campoPesquisarRecurso');
    const hidden = document.getElementById('recursoSelecionadoId');
    if(input) input.value='';
    if(hidden) hidden.value='';
    const hPlaca = document.getElementById('recursoSelecionadoPlaca');
    const hMarca = document.getElementById('recursoSelecionadoMarca');
    const hModelo = document.getElementById('recursoSelecionadoModelo');
    if(hPlaca) hPlaca.value='';
    if(hMarca) hMarca.value='';
    if(hModelo) hModelo.value='';
    const limparBtn = document.getElementById('btnLimparRecursoSelecionado');
    if(limparBtn) limparBtn.style.display='none';
  }

  function init(){
    console.debug('[localizar_recurso] init');
    // Registrar handlers de empilhamento mesmo quando aberto via data-bs-*
    const el = document.getElementById('modalLocalizarRecurso');
    if(el){
      el.addEventListener('shown.bs.modal', ()=>{ try { window.__STACK_OPENING_LOCALIZAR = false; } catch(_e){} });
      el.addEventListener('show.bs.modal', ()=>{
        try {
          const openCount = document.querySelectorAll('.modal.show').length;
          const zIndex = 1050 + (openCount * 10);
          el.style.zIndex = String(zIndex);
          // Ajustar apenas o backdrop recém-criado (o último)
          setTimeout(()=>{
            const backs = document.querySelectorAll('.modal-backdrop');
            const last = backs[backs.length-1];
            if(last){ last.style.zIndex = String(zIndex-1); last.classList.add('modal-stack'); }
          },0);
        } catch(_e){ /* ignore */ }
      });
      el.addEventListener('hidden.bs.modal', ()=>{
        try { el.style.zIndex=''; } catch(_){ }
        setTimeout(()=>{
          const open = Array.from(document.querySelectorAll('.modal.show'));
          const backs = Array.from(document.querySelectorAll('.modal-backdrop'));
          // Normalizar backdrops: manter no máximo 1 quando ainda houver modal aberto; ou nenhum se não houver
          if(open.length > 0){
            // Remover excessos além do último
            for(let i=backs.length-1; i>=1; i--){ try { backs[i].remove(); } catch(_r){} }
            const rem = document.querySelector('.modal-backdrop');
            if(rem){ rem.classList.remove('modal-stack'); rem.style.zIndex=''; }
            // Garantir body travado e foco no topo
            document.body.classList.add('modal-open');
            try {
              const top = open[open.length-1];
              if(top){ top.style.zIndex=''; top.focus && top.focus(); }
            } catch(_f){}
          } else {
            // Sem modais abertos: remover todos os backdrops e liberar o body
            backs.forEach(b=>{ try { b.remove(); } catch(_d){} });
            document.body.classList.remove('modal-open');
          }
        }, 50);
      });
    }
    // Captura antes do Bootstrap para impedir que ele feche o modal atual automaticamente
    document.addEventListener('click', e=>{
      const btn = e.target.closest && e.target.closest('#btnAbrirLocalizarRecurso');
      if(!btn) return;
      try { window.__STACK_OPENING_LOCALIZAR = true; } catch(_s){}
      // Previne o toggler padrão do Bootstrap
      e.preventDefault(); e.stopPropagation();
      // Impedir que o modal de recurso feche nesta abertura
      try {
        const modalRecursoEl = document.getElementById('modalRecurso');
        if(modalRecursoEl){
          const preventHide = function(ev){ if(window.__STACK_OPENING_LOCALIZAR){ ev.preventDefault(); } };
          // Anexa preventivo uma única vez (idempotente)
          if(!modalRecursoEl.__preventHideLocalizar){ modalRecursoEl.addEventListener('hide.bs.modal', preventHide); modalRecursoEl.__preventHideLocalizar = true; }
        }
      } catch(_ph){}
      // Abrir programaticamente
      abrir();
    }, true);

    document.addEventListener('click', e=>{
      if(e.target.closest && e.target.closest('#btnAbrirLocalizarRecurso')){ console.debug('[localizar_recurso] click #btnAbrirLocalizarRecurso'); abrir(); }
      if(e.target.closest && e.target.closest('#btnSelecionarRecursoGestor')){ confirmar(); }
      if(e.target.closest && e.target.closest('#btnLimparRecursoSelecionado')){ limparSelecao(); }
      if(e.target.closest && e.target.closest('#btnCancelarLocalizarRecurso')){
        try {
          // Fecha este modal e retorna o foco ao modal de recurso (se estiver aberto)
          if(bsModal){ bsModal.hide(); }
          setTimeout(()=>{
            const modalRecursoEl = document.getElementById('modalRecurso');
            if(!modalRecursoEl) return;
            const recInst = bootstrap.Modal.getOrCreateInstance(modalRecursoEl, { backdrop: 'static' });
            // Se o modal de recurso já estava aberto, apenas garantir foco
            if(modalRecursoEl.classList.contains('show')){
              try { modalRecursoEl.focus(); } catch(_f){}
            } else {
              // reabrir por segurança
              recInst.show();
            }
          }, 120);
        } catch(_c){ /* ignore */ }
      }
    });
    const form = document.getElementById('formBuscaRecursoGestor');
    if(form){ form.addEventListener('submit', simularBusca); }
    // Bind direto no botão Selecionar (além da delegação) para garantir funcionamento
    const btnSelDir = document.getElementById('btnSelecionarRecursoGestor');
    if(btnSelDir){
      btnSelDir.addEventListener('click', (ev)=>{ ev.preventDefault(); confirmar(); });
    }
    bindTabela();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    try { init(); } catch(_e){}
  }
})();
