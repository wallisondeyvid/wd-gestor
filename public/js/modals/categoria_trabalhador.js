(() => {
  'use strict';

  // --- helpers ---
  const normStr = (s='') => s.normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim().toLowerCase();
  const shape   = (o) => ({
    codigo: String(o?.codigo ?? o?.code ?? '').trim(),
    nome:   String(o?.nome   ?? o?.descricao ?? o?.description ?? o?.label ?? '').trim()
  });

  function ensureInBody(modal) {
    if (modal && modal.parentElement !== document.body) document.body.appendChild(modal);
  }
  function cleanStuckBackdrop() {
    // Se por algum motivo ficou um backdrop sem modal, limpamos.
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('paddingRight');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const modal  = document.getElementById('modalCategoriaTrabalhador');
    if (!modal) return;

    ensureInBody(modal);

    // garante que o botão "Selecionar" abra o modal corretamente
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bs-target="#modalCategoriaTrabalhador"]');
      if (!btn) return;
      e.preventDefault();
      cleanStuckBackdrop();
      ensureInBody(modal);
      bootstrap.Modal.getOrCreateInstance(modal).show();
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    const modal        = document.getElementById('modalCategoriaTrabalhador');
    if (!modal) return;

    const ulLista      = modal.querySelector('#listaCategoriaTrabalhador');   // <ul class="list-group list-scroll" ...>
    const headerItem   = modal.querySelector('.list-header .list-group-item'); // item do cabeçalho
    const inpPesquisa  = modal.querySelector('#categoriaTrabalhadorPesquisa');
    const btnLimpar    = modal.querySelector('#btnLimparCategoriaTrabalhador');
    const btnConfirmar = modal.querySelector('#btnConfirmarCategoriaTrabalhador');
    const campoDestino = document.getElementById('extra_categoria_trabalhador');

    let CATEGORIAS = [];

    async function loadCategorias() {
      if (CATEGORIAS.length) return;
      const res = await fetch('/data/categorias_trabalhador.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.json();
      CATEGORIAS = (Array.isArray(arr) ? arr : [])
        .map(shape)
        .filter(x => x.codigo || x.nome)
        .sort((a,b) => {
          const an = +a.codigo, bn = +b.codigo;
          const byCode = (Number.isFinite(an) && Number.isFinite(bn)) ? (an - bn)
                        : (a.codigo||'').localeCompare(b.codigo||'');
          return byCode || (a.nome||'').localeCompare(b.nome||'');
        });
    }

    function markSelected(li, radio) {
      ulLista.querySelectorAll('.item-row').forEach(r => r.classList.remove('is-selected'));
      radio?.checked && li.querySelector('.item-row')?.classList.add('is-selected');
    }

    // --- cabeçalho x lista: compensa a largura da scrollbar
    function syncHeaderPadding() {
      const list = modal.querySelector('.list-scroll');
      if (!list || !headerItem) return;
      const sbw = list.offsetWidth - list.clientWidth; // scrollbar width
      headerItem.style.setProperty('--sbw', sbw + 'px');
    }

    function render(lista) {
      if (!ulLista) return;
      ulLista.innerHTML = '';
      let vazios=0;
      const frag = document.createDocumentFragment();

      (lista || []).forEach((it, idx) => {
        const id = `catTrab_${idx}`;
        let nome = it.nome || '';
        if(!nome){ vazios++; nome='(sem descrição)'; }
        const li = document.createElement('li');
        li.className = 'list-group-item p-0';
        li.innerHTML = `
          <div class="item-row">
            <div class="col-sel">
              <input type="radio" name="catTrab" class="form-check-input" id="${id}" value="${it.codigo} - ${nome}">
            </div>
            <label for="${id}" class="mb-0 col-cod">${it.codigo}</label>
            <label for="${id}" class="mb-0 col-desc" data-raw-nome="${(it.nome||'').replace(/"/g,'&quot;')}">${nome}</label>
          </div>
        `;
        const radio = li.querySelector('input[type=radio]');
        radio?.addEventListener('change', () => markSelected(li, radio));
        li.addEventListener('click', (ev) => {
          if (ev.target.tagName !== 'INPUT') { radio.checked = true; markSelected(li, radio); }
        });
        frag.appendChild(li);
      });

      ulLista.appendChild(frag);
      if(vazios) console.warn('[categoria_trabalhador][public] nomes/descrições vazios:', vazios, 'de', lista.length);
      requestAnimationFrame(syncHeaderPadding);
    }

    function preselect() {
      const current = (campoDestino?.value || '').trim();
      if (!current) return;
      const code = current.split(' - ')[0].trim();
      // tenta achar por "código - nome" ou por código
      let match = Array.from(ulLista.querySelectorAll('input[name="catTrab"]'))
        .find(r => r.value === current || r.value.startsWith(code + ' - '));
      if (match) {
        match.checked = true;
        match.closest('li')?.querySelector('.item-row')?.classList.add('is-selected');
        match.closest('li')?.scrollIntoView({ block: 'nearest' });
      }
    }

    // eventos do modal
    modal.addEventListener('show.bs.modal', async () => {
      try {
        cleanStuckBackdrop();
        ensureInBody(modal);
        if (ulLista) ulLista.innerHTML = '<li class="list-group-item">Carregando…</li>';
        await loadCategorias();
        render(CATEGORIAS);
        inpPesquisa && (inpPesquisa.value = '');
      } catch (e) {
        console.error('[CategoriaTrabalhador] Falha ao carregar:', e);
        if (ulLista) ulLista.innerHTML = '<li class="list-group-item text-danger">Erro ao carregar categorias.</li>';
      }
    });

    modal.addEventListener('shown.bs.modal', () => {
      inpPesquisa?.focus();
      preselect();
      syncHeaderPadding();
    });

    modal.addEventListener('hidden.bs.modal', () => {
      // garante que nenhum backdrop fique “preso”
      cleanStuckBackdrop();
    });

    // filtro
    inpPesquisa?.addEventListener('input', () => {
      const t = normStr(inpPesquisa.value || '');
      render(CATEGORIAS.filter(c => normStr(`${c.codigo} ${c.nome}`).includes(t)));
    });

    // limpar
    btnLimpar?.addEventListener('click', () => {
      modal.querySelectorAll('input[name=catTrab]').forEach(c => (c.checked = false));
      ulLista?.querySelectorAll('.item-row').forEach(r => r.classList.remove('is-selected'));
      if (campoDestino) campoDestino.value = '';
      inpPesquisa && (inpPesquisa.value = '');
      render(CATEGORIAS);
    });

    // confirmar
    btnConfirmar?.addEventListener('click', () => {
      const sel = modal.querySelector('input[name=catTrab]:checked');
      if (campoDestino) campoDestino.value = sel ? sel.value : '';
      bootstrap.Modal.getOrCreateInstance(modal).hide();
    });

    // manter alinhamento em redimensionamentos e quando a lista muda de tamanho
    window.addEventListener('resize', syncHeaderPadding);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(syncHeaderPadding);
      ro.observe(ulLista);
    }
  });
})();