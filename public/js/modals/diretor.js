// public/js/modals/diretor.js
// Seleção de Diretor (somente para unidade Matriz)
// Requer no HTML/EJS:
//  - #modalDiretor, #buscaDiretor, #listaDiretores, #btnSelecionarDiretorModal
//  - #diretor_usuario_id (hidden) e #diretorUsuarioDisplay (read-only)
//  - #blocoDiretor (wrapper do campo) visível só quando "Matriz" estiver marcado
//  - Botão #btnSelecionarDiretor para abrir o modal

(function () {
  const state = {
    usuarios: [],
    dom: {}
  };

  // --- Utils ---
  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const getUsuarios = () => {
    const src = Array.isArray(window.usuariosDiretor) ? window.usuariosDiretor : [];
    // Normaliza possíveis formatos vindos da API
    return src.map(u => {
      const id = String(u._id || u.id || '');
      const nome =
        u.nome ||
        (u.funcionario_id && (u.funcionario_id.nome || u.funcionario_id.name)) ||
        u.name || u.fullName || '—';
      const email = u.email || (u.user && u.user.email) || '';
      const role = u.role || (u.perfil && u.perfil.nome) || '';
      return { id, nome, email, role };
    });
  };

  function cacheDom() {
    state.dom.modal = document.getElementById('modalDiretor');
    state.dom.busca = document.getElementById('buscaDiretor');
    state.dom.lista = document.getElementById('listaDiretores');
    state.dom.btnConfirmar = document.getElementById('btnSelecionarDiretorModal');

    state.dom.hiddenId = document.getElementById('diretor_usuario_id');
    state.dom.display = document.getElementById('diretorUsuarioDisplay');
    state.dom.bloco = document.getElementById('blocoDiretor');

    state.dom.btnAbrir = document.getElementById('btnSelecionarDiretor');
    state.dom.chkMatriz = document.getElementById('matriz');
    state.dom.chkFilial = document.getElementById('filial');
  }

  // --- Render list ---
function renderLista(filtro = '') {
  if (!state.dom.lista) return;
  const f = norm(filtro);
  const itens = state.usuarios.filter(u => {
    if (!f) return true;
    return norm(u.nome).includes(f) || norm(u.email).includes(f) || norm(u.role).includes(f);
  });

  const selecionado = state.dom.hiddenId?.value ? String(state.dom.hiddenId.value) : '';

  state.dom.lista.innerHTML = itens.map(u => {
    const id = `user_${u.id}`;
    const checked = selecionado && selecionado === u.id ? 'checked' : '';
    return `
      <li class="list-group-item ms-row ms-3cols-director">
        <div class="ms-col-sel">
          <input class="form-check-input chkDiretor" type="checkbox" id="${id}" value="${u.id}" ${checked}>
        </div>
        <div class="ms-col-name">
          <div class="fw-semibold" title="${u.nome}">${u.nome}</div>
        </div>
        <div class="ms-col-email" title="${u.email || ''}">${u.email || ''}</div>
      </li>`;
  }).join('');

  // Exclusividade: mantém só 1 checkbox marcado
  const allChecks = state.dom.lista.querySelectorAll('.chkDiretor');
  allChecks.forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) {
        allChecks.forEach(outro => { if (outro !== chk) outro.checked = false; });
      }
    });
    // clique na linha marca/desmarca o checkbox
    chk.closest('li')?.addEventListener('click', (ev) => {
      if (ev.target.tagName !== 'INPUT') chk.click();
    });
    // duplo clique confirma
    chk.closest('li')?.addEventListener('dblclick', confirmarSelecao);
  });
}

  // --- Modal open ---
  function abrirModal() {
    if (!state.dom.modal) return;
    // Atualiza fonte de dados sempre que abrir (caso a página tenha atualizado window.usuariosDiretor)
    state.usuarios = getUsuarios();
    renderLista(state.dom.busca ? state.dom.busca.value : '');
    const inst = bootstrap.Modal.getOrCreateInstance(state.dom.modal, { backdrop: true, keyboard: true });
    inst.show();
  }

  // --- Confirm selection ---
function confirmarSelecao() {
  const marcado = state.dom.lista?.querySelector('.chkDiretor:checked');
  if (!marcado) { alert('Selecione um diretor na lista.'); return; }
  const id = String(marcado.value);
  const u = state.usuarios.find(x => x.id === id);
  if (!u) return;

  if (state.dom.hiddenId) state.dom.hiddenId.value = id;
  if (state.dom.display) state.dom.display.value = `${u.nome}${u.email ? ', ' + u.email : ''}`;

  const inst = bootstrap.Modal.getInstance(state.dom.modal);
  if (inst) inst.hide();
}

  // --- Visibilidade do bloco (Matriz x Filial) ---
  function atualizarVisibilidade() {
    if (!state.dom.bloco) return;
    const isMatriz = !!state.dom.chkMatriz?.checked;
    state.dom.bloco.style.display = isMatriz ? '' : 'none';
    if (!isMatriz) {
      // limpamos seleção quando vira Filial
      if (state.dom.hiddenId) state.dom.hiddenId.value = '';
      if (state.dom.display) state.dom.display.value = '';
    }
  }

  // Permite setar por ID externamente (ex.: ao carregar em modo edição)
  function setDiretorById(id) {
    const alvo = state.usuarios.find(u => String(u.id) === String(id));
    if (!alvo) return false;
    if (state.dom.hiddenId) state.dom.hiddenId.value = String(alvo.id);
    if (state.dom.display) {
      const subt = [alvo.email, alvo.role].filter(Boolean).join(' • ');
      state.dom.display.value = `${alvo.nome}${subt ? `, ${subt}` : ''}`;
    }
    return true;
    }

  // --- Bind events ---
  function bindEvents() {
    if (state.dom.btnAbrir) {
      state.dom.btnAbrir.addEventListener('click', abrirModal);
    }
    if (state.dom.busca) {
      state.dom.busca.addEventListener('input', (e) => renderLista(e.target.value));
    }
    if (state.dom.btnConfirmar) {
      state.dom.btnConfirmar.addEventListener('click', confirmarSelecao);
    }
    if (state.dom.modal) {
      // Ao abrir, preserva pré-seleção (se existir)
      state.dom.modal.addEventListener('show.bs.modal', () => {
        // re-render para sincronizar seleção atual
        renderLista(state.dom.busca ? state.dom.busca.value : '');
        // foco no campo de busca para digitar direto
        setTimeout(() => state.dom.busca?.focus(), 120);
      });
      // Higiene de backdrops (evita overlay preso ao fechar)
      state.dom.modal.addEventListener('hidden.bs.modal', () => {
        setTimeout(() => {
          const aberto = document.querySelector('.modal.show');
          if (!aberto) {
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
          }
        }, 60);
      });
    }
    if (state.dom.chkMatriz) {
      state.dom.chkMatriz.addEventListener('change', atualizarVisibilidade);
    }
    if (state.dom.chkFilial) {
      state.dom.chkFilial.addEventListener('change', atualizarVisibilidade);
    }

    // Reset do formulário limpa a seleção exibida
    const form = document.getElementById('cadastroUnidadeForm');
    if (form) {
      form.addEventListener('reset', () => {
        setTimeout(() => {
          if (state.dom.hiddenId) state.dom.hiddenId.value = '';
          if (state.dom.display) state.dom.display.value = '';
          atualizarVisibilidade();
        }, 0);
      });
    }
  }

  // --- Init ---
  function init() {
    cacheDom();
    state.usuarios = getUsuarios();
    bindEvents();
    // se já veio preenchido (edição), sincroniza o display
    if (state.dom.hiddenId?.value) {
      setDiretorById(state.dom.hiddenId.value);
    }
    atualizarVisibilidade();
  }

  // expõe uma API mínima global (para chamadas de outras partes do app)
  window.DiretorModule = {
    init,
    abrirModal,
    atualizarVisibilidade,
    setDiretorById
  };

  // auto-init
  document.addEventListener('DOMContentLoaded', init);
})();