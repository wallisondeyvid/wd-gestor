(() => {
  'use strict';

  const norm = (s='') => String(s).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();

  document.addEventListener('DOMContentLoaded', function () {
    const modal        = document.getElementById('modalCBO');
    if (!modal) return;

    const ulCBO        = modal.querySelector('#listaCBO');
    const inpPesquisa  = modal.querySelector('#cboPesquisa');
    const btnLimpar    = modal.querySelector('#btnLimparCBO');
    const btnConfirmar = modal.querySelector('#btnConfirmarCBO');
    const campoCBO     = document.getElementById('extra_cbo');

    // “Outro”
    const outroCheck   = modal.querySelector('#cboOutroCheck');
    const outroWrap    = modal.querySelector('#cboOutroWrap');
    const outroCodigo  = modal.querySelector('#cboOutroCodigo');
    const outroTitulo  = modal.querySelector('#cboOutroTitulo');

    let listaCBO = [];

    async function loadCBO() {
      if (listaCBO.length) return;
      const res = await fetch('/data/cbo_full.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.json();
      // aceita {codigo,titulo} ou variações
      listaCBO = (arr || []).map(o => ({
        codigo: String(o.codigo ?? o.code ?? o.id ?? '').trim(),
        titulo: String(o.titulo ?? o.nome ?? o.title ?? '').trim()
      })).filter(o => o.codigo || o.titulo);
    }

    function renderListaCBO(lista) {
      if (!ulCBO) return;
      ulCBO.innerHTML = '';
      const frag = document.createDocumentFragment();

      (lista || []).forEach((cbo, idx) => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.innerHTML = `
          <div class="col-sel">
            <input type="radio" name="cboCheck" class="form-check-input" id="cboCheck${idx}" value="${cbo.codigo} - ${cbo.titulo}">
          </div>
          <div class="col-cod">${cbo.codigo}</div>
          <div class="col-desc">${cbo.titulo}</div>
        `;
        // highlight manual (fallback ao :has)
        li.querySelector('input')?.addEventListener('change', function () {
          ulCBO.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('is-selected'));
          if (this.checked) li.classList.add('is-selected');
          // se usuário seleciona da lista, esconda “Outro”
          if (outroCheck) outroCheck.checked = false;
          outroWrap?.classList.add('d-none');
          outroCodigo && (outroCodigo.value = '');
          outroTitulo && (outroTitulo.value = '');
        });
        frag.appendChild(li);
      });

      ulCBO.appendChild(frag);
    }

    // Pré-seleção baseada no campo principal
    function preselectFromField() {
      const current = (campoCBO?.value || '').trim();
      if (!current) return;

      let done = false;

      // 1) tentar “código - título” exato
      ulCBO?.querySelectorAll('input[name="cboCheck"]').forEach(r => {
        if (!done && r.value === current) { r.checked = true; done = true; }
      });

      // 2) tentar apenas pelo código (antes de " - ")
      if (!done) {
        const code = current.split(' - ')[0]?.trim();
        if (code) {
          ulCBO?.querySelectorAll('input[name="cboCheck"]').forEach(r => {
            if (!done && r.value.startsWith(code + ' -')) { r.checked = true; done = true; }
          });
        }
      }

      // 3) se não achar, ativa “Outro” preenchendo os campos
      if (!done && outroCheck) {
        outroCheck.checked = true;
        outroWrap?.classList.remove('d-none');
        const parts = current.split(' - ');
        outroCodigo && (outroCodigo.value = (parts[0] || '').trim());
        outroTitulo && (outroTitulo.value = parts.slice(1).join(' - ').trim());
      }

      // rolar para o selecionado
      const checked = ulCBO?.querySelector('input[name="cboCheck"]:checked');
      checked?.closest('li')?.scrollIntoView({ block: 'nearest' });
    }

    // Ao abrir o modal
    modal.addEventListener('show.bs.modal', async () => {
      try {
        await loadCBO();
        renderListaCBO(listaCBO);

        // resets
        inpPesquisa && (inpPesquisa.value = '');
        outroCheck && (outroCheck.checked = false);
        outroWrap?.classList.add('d-none');
        outroCodigo && (outroCodigo.value = '');
        outroTitulo && (outroTitulo.value = '');

        preselectFromField();
      } catch (e) {
        if (ulCBO) ulCBO.innerHTML = '<li class="list-group-item text-danger">Erro ao carregar CBO.</li>';
        console.error('Falha ao carregar CBO:', e);
      }
    });

    // Pesquisa
    inpPesquisa?.addEventListener('input', function () {
      const t = norm(this.value || '');
      const filtrados = (listaCBO || []).filter(c =>
        norm(`${c.codigo} ${c.titulo}`).includes(t)
      );
      renderListaCBO(filtrados);
    });

    // Outro (toggle)
    outroCheck?.addEventListener('change', function () {
      if (this.checked) {
        outroWrap?.classList.remove('d-none');
        ulCBO?.querySelectorAll('input[name=cboCheck]').forEach(c => (c.checked = false));
        ulCBO?.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('is-selected'));
      } else {
        outroWrap?.classList.add('d-none');
        outroCodigo && (outroCodigo.value = '');
        outroTitulo && (outroTitulo.value = '');
      }
    });

    // Digitar “Código” → tenta casar com a lista
    outroCodigo?.addEventListener('input', function () {
      const code = this.value.trim();
      const found = (listaCBO || []).find(c => c.codigo === code);
      if (found) {
        outroTitulo && (outroTitulo.value = found.titulo);
        // seleciona na lista
        ulCBO?.querySelectorAll('input[name=cboCheck]').forEach(c => {
          c.checked = c.value.startsWith(found.codigo + ' -');
          c.closest('li')?.classList.toggle('is-selected', c.checked);
        });
        outroCheck && (outroCheck.checked = false);
        outroWrap?.classList.add('d-none');
      }
    });

    // Digitar “Título” → tenta casar com a lista
    outroTitulo?.addEventListener('input', function () {
      const t = norm(this.value);
      const found = (listaCBO || []).find(c => norm(c.titulo) === t);
      if (found) {
        outroCodigo && (outroCodigo.value = found.codigo);
        ulCBO?.querySelectorAll('input[name=cboCheck]').forEach(c => {
          c.checked = c.value.startsWith(found.codigo + ' -');
          c.closest('li')?.classList.toggle('is-selected', c.checked);
        });
        outroCheck && (outroCheck.checked = false);
        outroWrap?.classList.add('d-none');
      }
    });

    // Limpar
    btnLimpar?.addEventListener('click', function () {
      ulCBO?.querySelectorAll('input[name=cboCheck]').forEach(c => (c.checked = false));
      ulCBO?.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('is-selected'));
      if (campoCBO) campoCBO.value = '';
      if (inpPesquisa) inpPesquisa.value = '';
      if (outroCheck) outroCheck.checked = false;
      outroWrap?.classList.add('d-none');
      outroCodigo && (outroCodigo.value = '');
      outroTitulo && (outroTitulo.value = '');
      renderListaCBO(listaCBO);
    });

    // Confirmar
    btnConfirmar?.addEventListener('click', function () {
      const checked = ulCBO?.querySelector('input[name=cboCheck]:checked');
      if (checked) {
        if (campoCBO) campoCBO.value = checked.value;
      } else if (outroCheck?.checked) {
        const cod = (outroCodigo?.value || '').trim();
        const tit = (outroTitulo?.value || '').trim();
        if (campoCBO) campoCBO.value = (cod && tit) ? `${cod} - ${tit}` : '';
      } else {
        if (campoCBO) campoCBO.value = '';
      }
      bootstrap.Modal.getOrCreateInstance(modal).hide();
    });
  });
})();