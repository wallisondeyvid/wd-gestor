// /js/modals/orgao_profissional.js
(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnAbrirModalOrgaoProfissional');
    if (btn) btn.addEventListener('click', abrirModal);
  });

  async function abrirModal() {
    const modalEl   = document.getElementById('modalOrgaoProfissional');
    const pesquisa  = document.getElementById('modalOrgaoProfissionalPesquisa');
    const lista     = document.getElementById('modalOrgaoProfissionalLista');
    const chkOutro  = document.getElementById('modalOrgaoProfissionalOutroCheck');
    const outroWrap = document.getElementById('modalOrgaoProfissionalOutroWrap');
    const outroCod  = document.getElementById('modalOrgaoProfissionalOutroCodigo');
    const outroNom  = document.getElementById('modalOrgaoProfissionalOutroNome');
    const btnLimpar = document.getElementById('modalOrgaoProfissionalLimpar');
    const btnOK     = document.getElementById('modalOrgaoProfissionalConfirmar');
    const destino   = document.getElementById('extra_orgao_prof');

    // Carrega JSON (formato { "CRM":"Conselho...", ... })
    let itens = [];
    try {
      const json = await fetch('/data/orgaos_profissionais.json', { cache: 'no-store' }).then(r => r.json());
      itens = Object.entries(json || {}).map(([codigo, nome]) => ({ codigo, nome }));
    } catch (e) { console.warn('Falha ao carregar órgãos profissionais', e); }

    const norm = s => (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

    function render(data) {
      lista.innerHTML = '';
      const frag = document.createDocumentFragment();

      (data || []).forEach((o, i) => {
        const id = `oprof_${i}`;
        const li = document.createElement('li');
        li.className = 'list-group-item item-grid';
        li.innerHTML = `
          <div class="col-sel">
            <input class="form-check-input" type="radio" id="${id}" name="orgao_prof" value="${o.codigo} - ${o.nome}">
          </div>
          <label for="${id}" class="col-cod mb-0">${o.codigo}</label>
          <label for="${id}" class="col-desc mb-0" title="${o.nome}">${o.nome}</label>
        `;

        const input = li.querySelector('input');

        input.addEventListener('change', ev => {
          if (ev.target.checked) {
            chkOutro.checked = false;
            outroWrap.classList.add('d-none');
          }
        });

        li.addEventListener('click', ev => {
          if (ev.target.tagName !== 'INPUT') {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        frag.appendChild(li);
      });
      lista.appendChild(frag);
    }

    function preselectFromField() {
      const current = (destino?.value || '').trim();
      if (!current) return;
      const cod = current.split(' - ')[0]?.trim();
      const hit = itens.find(o => `${o.codigo} - ${o.nome}` === current) || itens.find(o => o.codigo === cod);
      if (hit) {
        const val = `${hit.codigo} - ${hit.nome}`;
        const input = Array.from(lista.querySelectorAll('input[name="orgao_prof"]')).find(i => i.value === val);
        if (input) {
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        chkOutro.checked = false;
        outroWrap.classList.add('d-none');
        outroCod.value = '';
        outroNom.value = '';
      } else {
        chkOutro.checked = true;
        outroWrap.classList.remove('d-none');
        outroCod.value = cod || '';
        outroNom.value = current.includes(' - ') ? current.split(' - ').slice(1).join(' - ').trim() : current;
      }
    }

    // Estado inicial
    render(itens);
    pesquisa.value = '';
    chkOutro.checked = false;
    outroWrap.classList.add('d-none');
    outroCod.value = '';
    outroNom.value = '';
    preselectFromField();

    // Filtro
    pesquisa.oninput = () => {
      const t = norm(pesquisa.value);
      render(t ? itens.filter(o => norm(o.codigo).includes(t) || norm(o.nome).includes(t)) : itens);
      if (!t) preselectFromField();
    };

    // “Outro”
    chkOutro.onchange = () => {
      if (chkOutro.checked) {
        outroWrap.classList.remove('d-none');
        lista.querySelectorAll('input[name="orgao_prof"]').forEach(i => (i.checked = false));
        outroCod.focus();
      } else {
        outroWrap.classList.add('d-none');
        outroCod.value = '';
        outroNom.value = '';
      }
    };

    // Limpar
    btnLimpar.onclick = () => {
      pesquisa.value = '';
      render(itens);
      lista.querySelectorAll('input[name="orgao_prof"]').forEach(i => (i.checked = false));
      chkOutro.checked = false;
      outroWrap.classList.add('d-none');
      outroCod.value = '';
      outroNom.value = '';
      if (destino) destino.value = '';
    };

    // Confirmar
    btnOK.onclick = () => {
      if (chkOutro.checked) {
        const c = outroCod.value.trim();
        const d = outroNom.value.trim();
        if (!c || !d) { (c ? outroNom : outroCod).focus(); return; }
        destino.value = `${c} - ${d}`;
      } else {
        const sel = lista.querySelector('input[name="orgao_prof"]:checked');
        destino.value = sel ? sel.value : '';
      }
      bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    };

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
    setTimeout(() => pesquisa?.focus(), 150);
  }
})();