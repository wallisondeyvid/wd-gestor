// Página de Setores - extraído de setor.ejs
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const basePath = document.body.getAttribute('data-base-path') || '/gestor';
    // Toast helpers
    function buildToastHtml(id, title, body, colorClass){
      const now = new Date();
      const time = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit', second:'2-digit'});
      return `<div id="${id}" class="toast text-bg-${colorClass} border-0 fade" role="alert" aria-live="assertive" aria-atomic="true">\n`+
        `<div class="toast-header text-bg-${colorClass} border-0">\n`+
        `<strong class="me-auto">${title}</strong>\n`+
        `<small>${time}</small>\n`+
        `<button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Fechar"></button>\n`+
        `</div>\n`+
        `<div class="toast-body">${body}</div>\n`+
      `</div>`;
    }
    function showToast(body, opts={}){
      const { title='Info', type='info', delay=4000 } = opts;
      const colorMap = { success:'success', error:'danger', danger:'danger', info:'primary', warn:'warning', warning:'warning' };
      const colorClass = colorMap[type] || 'secondary';
      const id = 't_'+Math.random().toString(36).slice(2);
      const container = document.getElementById('toastContainer');
      if(!container) return; // segurança
      container.insertAdjacentHTML('beforeend', buildToastHtml(id, title, body, colorClass));
      const el = document.getElementById(id);
      const toast = new bootstrap.Toast(el, { delay, autohide:true });
      toast.show();
      return toast;
    }
    const toastSuccess = (msg)=>showToast(msg,{title:'Sucesso',type:'success'});
    const toastError   = (msg)=>showToast(msg,{title:'Erro',type:'error', delay:6000});
    const toastInfo    = (msg)=>showToast(msg,{title:'Info',type:'info'});

    const formSetor   = document.getElementById('formSetor');
    if(!formSetor) return; // página não presente
    const hiddenId    = document.getElementById('setor_edit_id');
    const btnSubmit   = document.getElementById('btnSubmitSetor');
    const btnCancelar = document.getElementById('btnCancelarEdicao');
    const tbody       = document.querySelector('.wdg-setores-table tbody');
    const unidadeSelect = document.getElementById('unidade_id');

    function entrarModoEdicao(){
      btnSubmit.textContent = 'Salvar';
      btnSubmit.classList.remove('btn-outline-primary');
      btnSubmit.classList.add('btn-outline-success');
      btnCancelar.classList.remove('d-none');
    }
    function cancelarEdicao(){
      hiddenId.value = '';
      formSetor.reset();
      btnSubmit.textContent = 'Cadastrar';
      btnSubmit.classList.remove('btn-outline-success');
      btnSubmit.classList.add('btn-outline-primary');
      btnCancelar.classList.add('d-none');
    }
    btnCancelar.addEventListener('click', cancelarEdicao);
    document.getElementById('btnResetForm').addEventListener('click', () => { if (hiddenId.value) cancelarEdicao(); });

  function linhaSetor(setor){
      let unidadeNome = setor.unidade_label || setor.unidade_nome || (setor.unidade_id && (setor.unidade_id.nome || setor.unidade_id.codigo)) || '—';
      const temDesc = !!setor.descricao;
      const descEsc = temDesc ? (setor.descricao||'').replace(/"/g,'&quot;') : '';
      const nomeEsc = (setor.nome||'').replace(/"/g,'&quot;');
      const unidadeCellHtml = unidadeNome;
      return `<tr>
          <td class="col-unid">${unidadeCellHtml}</td>
          <td class="col-nome"><div class="text-truncate" title="${nomeEsc}">${nomeEsc}</div></td>
          <td class="col-desc">`+
          (temDesc
            ? `<div class="text-truncate" title="${descEsc}">${descEsc}</div>`
            : `<span class="badge rounded-pill text-bg-secondary" title="Sem descrição">Sem descrição</span>`
          )+
        `</td>
        <td class="col-acoes">
          <div class="d-flex gap-1 justify-content-center flex-nowrap">
            <button type="button" class="wdg-icon-btn" data-action="editar" data-id="${setor._id}" title="Editar" aria-label="Editar">
              <img src="${basePath}/images/editar.png" alt="Editar" onerror="this.onerror=null;this.outerHTML='&lt;i class=\'bi bi-pencil\'&gt;&lt;/i&gt;'" />
            </button>
            <button type="button" class="wdg-icon-btn" data-action="excluir" data-id="${setor._id}" data-nome="${nomeEsc}" title="Excluir" aria-label="Excluir">
              <img src="${basePath}/images/excluir.png" alt="Excluir" onerror="this.onerror=null;this.outerHTML='&lt;i class=\'bi bi-trash\'&gt;&lt;/i&gt;'" />
            </button>
          </div>
        </td>
      </tr>`;
    }

    async function recarregarLista(){
      const unid = unidadeSelect.value || '';
      const qs = unid ? (`?unidade_id=${encodeURIComponent(unid)}`) : '';
      try {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">'+
          '<div class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></div>'+
          'Carregando...'+
        '</td></tr>';
          const res = await fetchJson(basePath + '/api/setores'+qs);
          if(!res.ok) throw new Error(res.error||'Erro carregando setores');
          let setores = Array.isArray(res.data) ? res.data : [];
        setores.sort((a,b)=>{
          const ua = (a.unidade_nome) || (a.unidade_id && (a.unidade_id.nome || a.unidade_id.codigo)) || '';
          const ub = (b.unidade_nome) || (b.unidade_id && (b.unidade_id.nome || b.unidade_id.codigo)) || '';
          const cmpU = ua.localeCompare(ub,'pt-BR',{sensitivity:'base'});
          if (cmpU !== 0) return cmpU;
          return (a.nome||'').localeCompare((b.nome||''),'pt-BR',{sensitivity:'base'});
        });
        if (!setores.length){
          tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum setor cadastrado.</td></tr>';
          return;
        }
        // Lista montada
  tbody.innerHTML = setores.map(linhaSetor).join('');
      } catch(e){
        console.error('[setores] falha ao recarregar:', e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar lista</td></tr>';
        toastError('Falha ao recarregar lista');
      }
    }

    // Recarrega sempre ao entrar na página para garantir unidade preenchida
    recarregarLista();

    formSetor.addEventListener('submit', function(e){
      e.preventDefault();
      const isUpdate = !!hiddenId.value;
      const payload = {
        unidade_id: document.getElementById('unidade_id').value,
        nome:       document.getElementById('nome').value.trim(),
        descricao:  document.getElementById('descricao').value.trim()
      };
      if (!payload.unidade_id || !payload.nome){
        toastError('Preencha Unidade e Nome.');
        return;
      }
      btnSubmit.disabled = true;
      btnSubmit.textContent = isUpdate ? 'Salvando...' : 'Cadastrando...';
  const url = isUpdate ? (basePath + '/api/setores/' + hiddenId.value) : (basePath + '/api/setores');
      const method = isUpdate ? 'PUT' : 'POST';
      fetchJson(url, { method, body: JSON.stringify(payload) })
        .then(res => {
          if(!res.ok) throw new Error(res.error||'Erro');
          if (!isUpdate) { formSetor.reset(); hiddenId.value=''; }
          cancelarEdicao();
          return recarregarLista();
        })
        .catch(err => { toastError('Erro: ' + err.message); })
        .finally(() => {
          btnSubmit.disabled = false;
          btnSubmit.textContent = 'Cadastrar';
        });
    });

    // Modal de confirmação de exclusão
    const deleteModalEl = document.getElementById('confirmDeleteModal');
    let deleteModalInstance = null;
    let deleteTargetId = null;
    if (deleteModalEl) {
      deleteModalInstance = new bootstrap.Modal(deleteModalEl);
      const btnConfirmDelete = document.getElementById('btnConfirmDelete');
      btnConfirmDelete.addEventListener('click', () => {
        if(!deleteTargetId) return;
        const btn = btnConfirmDelete;
        btn.disabled = true;
        btn.textContent = 'Excluindo...';
  fetchJson(basePath + '/api/setores/' + deleteTargetId, { method:'DELETE' })
          .then(res => { if(!res.ok) throw new Error(res.error||'Erro'); toastSuccess('Setor excluído'); deleteModalInstance.hide(); return recarregarLista(); })
          .catch(err => toastError('Erro: ' + err.message))
          .finally(()=>{ btn.disabled=false; btn.textContent='Excluir'; deleteTargetId=null; });
      });
    }

    function excluirHandler(id, nome){
      deleteTargetId = id;
      const msgEl = document.getElementById('confirmDeleteMessage');
      if (msgEl) {
        msgEl.textContent = nome ? `Excluir o setor "${nome}"?` : 'Tem certeza que deseja excluir este setor?';
      }
      if (deleteModalInstance) deleteModalInstance.show();
      else if (window.confirm('Confirma exclusão?')) {
  fetchJson(basePath + '/api/setores/' + id, { method:'DELETE' })
          .then(res => { if(!res.ok) throw new Error(res.error||'Erro'); toastSuccess('Setor excluído'); return recarregarLista(); })
          .catch(err => toastError('Erro: ' + err.message));
      }
  }

  function editarHandler(id){
  fetchJson(basePath + '/api/setores/' + id)
        .then(res => {
          if(!res.ok) throw new Error(res.error||'Erro');
          const data = res.data || {};
          hiddenId.value = data._id || id;
          const unidadeValue = (data.unidade_id && (data.unidade_id._id || data.unidade_id.id)) || data.unidade_id || '';
          document.getElementById('unidade_id').value = unidadeValue;
          document.getElementById('nome').value       = data.nome || '';
          document.getElementById('descricao').value  = data.descricao || '';
          entrarModoEdicao();
          formSetor.scrollIntoView({ behavior:'smooth', block:'start' });
        })
        .catch(() => toastError('Falha ao carregar setor.'));

      if (window.matchMedia('(hover:hover)').matches) {
        document.querySelectorAll('.navbar .dropdown').forEach(dd => {
          const toggle = dd.querySelector('[data-bs-toggle="dropdown"]');
          if (!toggle) return;
          const inst = bootstrap.Dropdown.getOrCreateInstance(toggle);
          dd.addEventListener('mouseenter', () => inst.show());
          dd.addEventListener('mouseleave', () => inst.hide());
        });
      }
    }

    // Delegação de eventos para botões com data-action (paridade com Unidades)
    document.addEventListener('click', function(ev){
      const btn = ev.target.closest('.wdg-icon-btn');
      if(!btn) return;
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      if(action === 'editar' && id){ editarHandler(id); }
      if(action === 'excluir' && id){ excluirHandler(id, btn.getAttribute('data-nome')||''); }
    });

    // (Removido) Código de atribuição de unidade a setores órfãos - modal foi retirado.
  });
})();
