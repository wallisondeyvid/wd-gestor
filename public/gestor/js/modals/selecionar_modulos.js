// Fonte do modal de seleção de módulos
// Prioriza `window.modulosPermitidos` (definido pela unidade selecionada na página)
// e cai para `window.todosModulos` quando não houver unidade selecionada.
document.addEventListener('DOMContentLoaded', () => {
  const modalEl = document.getElementById('modalModulos');
  if (!modalEl) return;

  const buscaInput = document.getElementById('buscaModulos');
  const listaDiv = document.getElementById('listaModulos');
  const btnSalvar = document.getElementById('btnSalvarModulos');
  const selectDestino = document.getElementById('modulosAcessiveis');
  const focusSafe = window.wdgModalFocusSafe?.install?.(modalEl, {
    getReturnFocus: () => document.querySelector('[data-bs-target="#modalModulos"]'),
  }) || null;

  function fonteModulos() {
    // Se houver filtro por unidade, usar exatamente os módulos permitidos (mesmo que vazio)
    if (Array.isArray(window.modulosPermitidos)) return window.modulosPermitidos;
    // Sem unidade selecionada: usar todos os módulos
    return Array.isArray(window.todosModulos) ? window.todosModulos : [];
  }

  function statusBadge(statusRaw) {
    const s = (statusRaw ?? '').toString().trim();
    const sl = s.toLowerCase();
    let cls = 'bg-secondary';
    if (sl === 'ativo') cls = 'bg-success';
    else if (sl === 'inativo' || sl === 'desativado') cls = 'bg-secondary';
    else if (sl === 'planejado' || sl === 'em planejamento') cls = 'bg-info';
    else if (sl === 'em teste' || sl === 'beta') cls = 'bg-warning text-dark';
    const label = s ? (s.charAt(0).toUpperCase() + s.slice(1)) : '—';
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function renderLista(filtro = '') {
    const filtroLower = filtro.toLowerCase();
    const todos = fonteModulos();
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
      const idStr = String(m._id ?? m.id ?? '');
      const checked = selecionados.has(idStr) ? 'checked' : '';
      const badge = statusBadge(m.status);
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

  if (buscaInput) {
    buscaInput.addEventListener('input', e => renderLista(e.target.value));
  }

  if (btnSalvar) {
    btnSalvar.addEventListener('click', () => {
      const marcados = Array.from(listaDiv.querySelectorAll('input[type="checkbox"]:checked')).map(chk => String(chk.value));
      const todos = fonteModulos();
      const byId = new Map(todos.map(m => [String(m._id ?? m.id ?? ''), m]));
      // Atualiza somente a exibição (select) e também sincroniza inputs hidden para o submit
      selectDestino.innerHTML = '';
      // Remover hiddens da página de Unidades, se existirem (evita lixo quando usado em outras páginas)
      document.querySelectorAll('input[name="modulosAcessiveis[]"]').forEach(n => n.remove());
      marcados.forEach(id => {
        const m = byId.get(id);
        if (!m) return;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = m.nome ?? '(sem nome)';
        opt.selected = true;
        selectDestino.appendChild(opt);
      });
      // Sincronizar hidden específico da página de Funções
      try {
        const hiddenFuncoes = document.getElementById('modulos_habilitados');
        if (hiddenFuncoes) hiddenFuncoes.value = marcados.join(',');
      } catch(_) {}
      if (focusSafe) {
        focusSafe.hide();
        return;
      }
      const inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();
    });
  }

  modalEl.addEventListener('show.bs.modal', () => renderLista(''));
});
