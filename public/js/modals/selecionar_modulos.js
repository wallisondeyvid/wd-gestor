// public/js/selecionar_modulos.js
// Modal de Selecionar Módulos (usa /gestor/css/modais.css)
document.addEventListener('DOMContentLoaded', () => {
  const modalEl      = document.getElementById('modalModulos');
  if (!modalEl) return;

  const buscaInput   = document.getElementById('buscaModulos');
  const listaDiv     = document.getElementById('listaModulos');
  const btnSalvar    = document.getElementById('btnSalvarModulos');
  const selectDestino= document.getElementById('modulosAcessiveis');

  function statusBadge(statusRaw) {
    const s = (statusRaw ?? '').toString().trim();
    const sl = s.toLowerCase();
    // mapeia para classes e mantém o texto original do banco
    let cls = 'bg-secondary';
    if (sl === 'ativo') cls = 'bg-success';
    else if (sl === 'inativo' || sl === 'desativado') cls = 'bg-secondary';
    else if (sl === 'planejado' || sl === 'em planejamento') cls = 'bg-info';
    else if (sl === 'em teste' || sl === 'beta') cls = 'bg-warning text-dark';

    const label = s || '—';
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function renderLista(filtro = '') {
    const filtroLower = filtro.toLowerCase();
    const todos = Array.isArray(window.todosModulos) ? window.todosModulos : [];
    const selecionados = new Set(Array.from(selectDestino.selectedOptions).map(o => String(o.value)));

    const itens = todos.filter(m => {
      const nome = (m.nome || '').toLowerCase();
      const desc = (m.descricao || m.description || '').toLowerCase();
      return !filtroLower || nome.includes(filtroLower) || desc.includes(filtroLower);
    });

    if (!itens.length) {
      listaDiv.innerHTML = `
        <div class="table-empty text-muted small px-3 py-2">Nenhum módulo encontrado.</div>
      `;
      return;
    }

    listaDiv.innerHTML = itens.map(m => {
      const idStr   = String(m._id ?? m.id ?? '');
      const checked = selecionados.has(idStr) ? 'checked' : '';
      const badge   = statusBadge(m.status);

      return `
        <div class="row-line d-grid align-items-center"
             style="grid-template-columns:72px 1fr 120px; column-gap:12px; padding:.55rem .75rem; border-bottom:1px solid var(--bs-gray-200);">
          <div class="text-center">
            <input class="form-check-input" type="checkbox" id="chkModulo_${idStr}" value="${idStr}" ${checked}>
          </div>
          <label class="form-check-label text-truncate" for="chkModulo_${idStr}">
            ${m.nome ?? '(sem nome)'}
          </label>
          <div class="text-center">${badge}</div>
        </div>
      `;
    }).join('');
  }

  // Busca
  if (buscaInput) {
    buscaInput.addEventListener('input', e => renderLista(e.target.value));
  }

  // Salvar seleção -> refaz <select multiple>
  if (btnSalvar) {
    btnSalvar.addEventListener('click', () => {
      const marcados = Array.from(listaDiv.querySelectorAll('input[type="checkbox"]:checked'))
        .map(chk => String(chk.value));

      const todos = Array.isArray(window.todosModulos) ? window.todosModulos : [];
      const byId  = new Map(todos.map(m => [String(m._id ?? m.id ?? ''), m]));

      selectDestino.innerHTML = '';
      marcados.forEach(id => {
        const m = byId.get(id);
        if (!m) return;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = m.nome ?? '(sem nome)';
        opt.selected = true;
        selectDestino.appendChild(opt);
      });

      // Manter sincronizados os inputs ocultos esperados pelo submit (modulosAcessiveis[])
      try {
        const form = document.getElementById('cadastroUnidadeForm');
        if (form) {
          // Remove antigos
          Array.from(form.querySelectorAll('input[name="modulosAcessiveis[]"]')).forEach(n => n.remove());
          // Cria novos conforme seleção
          marcados.forEach(id => {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = 'modulosAcessiveis[]';
            hidden.value = id;
            form.appendChild(hidden);
          });
        }
      } catch(_) {}

      const inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();
    });
  }

  // Sempre renderiza com dados atuais quando abre
  modalEl.addEventListener('show.bs.modal', () => renderLista(''));
});