// /public/js/modals/banco.js (LEGADO)
// AVISO: utilizar /gestor/js/modals/banco.js. Este script permanece para retrocompatibilidade.
if (window && window.wdgFetchGestorJson) {
  console.warn('[legacy banco] ignorado - usar /gestor/js/modals/banco.js');
} else {
(() => {
  const MODAL_ID = 'modalBanco';
  const TBODY_ID = 'modalBancoTbody';
  const SEARCH_ID = 'modalBancoPesquisa';
  const BTN_CONFIRM_ID = 'modalBancoConfirmar';
  const BTN_CLEAR_ID = 'modalBancoLimpar';
  const CHECK_OUTRO_ID = 'modalBancoOutroCheck';
  const OUTRO_WRAP_ID = 'modalBancoOutro';
  const OUTRO_COD_ID = 'modalBancoOutroCodigo';
  const OUTRO_NOME_ID = 'modalBancoOutroNome';

  // destino: tenta Unidades (#banco) e Funcionários (#extra_banco)
  const getTargetInput = () =>
    document.getElementById('banco') || document.getElementById('extra_banco');

  let cache = [];      // [{ codigo, nome }]
  let filtrados = [];  // lista em tela

  const $ = (id) => document.getElementById(id);
  const modalEl = $(MODAL_ID);

  if (!modalEl) return;

  const tbody = $(TBODY_ID);
  const search = $(SEARCH_ID);
  const btnConfirm = $(BTN_CONFIRM_ID);
  const btnClear = $(BTN_CLEAR_ID);
  const chkOutro = $(CHECK_OUTRO_ID);
  const outroWrap = $(OUTRO_WRAP_ID);
  const outroCod = $(OUTRO_COD_ID);
  const outroNome = $(OUTRO_NOME_ID);

  function escapeHtml(s = '') {
    return s.replace(/[&<>"']/g, (m) => ({'&':'&nbsp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function render(list) {
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-muted py-2">Nenhum banco encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(b => `
      <tr class="align-middle">
        <td class="text-center" style="width:72px;">
          <input class="form-check-input" type="radio" name="bancoOpt"
                 value="${b.codigo}" data-codigo="${b.codigo}" data-nome="${escapeHtml(b.nome)}">
        </td>
        <td class="text-center" style="width:110px;">${b.codigo}</td>
        <td>${escapeHtml(b.nome)}</td>
      </tr>
    `).join('');
  }

  async function loadBanks() {
    if (cache.length) return cache;
    try {
      const res = await fetch('/data/bancos.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // normaliza
      cache = (Array.isArray(data) ? data : (data.items || data.values || []))
        .map(x => ({
          codigo: String(x.codigo ?? x.cod ?? x.code ?? x.id ?? '').padStart(3, '0'),
          nome: String(x.nome ?? x.name ?? x.label ?? x.descricao ?? '')
        }))
        .filter(x => x.codigo && x.nome);
      // ordena por código
      cache.sort((a,b) => a.codigo.localeCompare(b.codigo));
      return cache;
    } catch (e) {
      console.error('[banco-module] erro ao carregar bancos:', e);
      cache = [];
      return cache;
    }
  }

  function filtra(term) {
    const t = (term || '').toLowerCase().trim();
    filtrados = !t ? cache.slice() :
      cache.filter(b =>
        b.codigo.toLowerCase().includes(t) ||
        b.nome.toLowerCase().includes(t)
      );
    render(filtrados);
  }

  // abrir modal -> carregar e renderizar
  modalEl.addEventListener('show.bs.modal', async () => {
    await loadBanks();
    filtra('');
    if (search) { search.value = ''; }
    if (chkOutro) chkOutro.checked = false;
    if (outroWrap) outroWrap.classList.add('d-none');
    if (outroCod) outroCod.value = '';
    if (outroNome) outroNome.value = '';
  });

  // busca
  if (search) {
    search.addEventListener('input', (e) => filtra(e.target.value));
  }

  // “Outro banco”
  if (chkOutro) {
    chkOutro.addEventListener('change', () => {
      if (chkOutro.checked) {
        // limpa qualquer seleção de radio
        tbody?.querySelectorAll('input[type="radio"][name="bancoOpt"]').forEach(r => r.checked = false);
        outroWrap?.classList.remove('d-none');
        outroCod?.focus();
      } else {
        outroWrap?.classList.add('d-none');
      }
    });
  }

  // limpar
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      const target = getTargetInput();
      if (target) target.value = '';
      // limpa seleções
      tbody?.querySelectorAll('input[type="radio"][name="bancoOpt"]').forEach(r => r.checked = false);
      if (chkOutro) chkOutro.checked = false;
      outroWrap?.classList.add('d-none');
      if (outroCod) outroCod.value = '';
      if (outroNome) outroNome.value = '';
    });
  }

  // confirmar
  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      const target = getTargetInput();
      if (!target) {
        console.warn('[banco-module] campo de destino não encontrado (#banco ou #extra_banco).');
        return;
      }

      if (chkOutro && chkOutro.checked) {
        const cod = (outroCod?.value || '').trim();
        const nom = (outroNome?.value || '').trim();
        if (!cod || !nom) {
          alert('Informe código e nome do banco.');
          return;
        }
        target.value = `${cod} - ${nom}`;
      } else {
        const sel =
          document.querySelector('#' + TBODY_ID + ' input[type="radio"][name="bancoOpt"]:checked');
        if (!sel) {
          alert('Selecione um banco.');
          return;
        }
        const codigo = sel.getAttribute('data-codigo') || sel.value;
        const nome = sel.getAttribute('data-nome') || '';
        target.value = `${codigo} - ${nome}`;
      }

      // fecha modal
      const inst = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
      inst.hide();
      // dispara change para ouvir fora
      getTargetInput()?.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
})();
} // fim guarda legacy