// /js/modals/naturalidade.js
(() => {
  'use strict';

  const simplify = (s='') => s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();

  // Garante que o modal não sofra com transform/overflow de ancestrais
  function ensureModalFree(modalEl, width='640px'){
    if (!modalEl) return;
    if (modalEl.parentElement !== document.body) document.body.appendChild(modalEl);
    modalEl.style.setProperty('--bs-modal-width', width, 'important');
    const dlg = modalEl.querySelector('.modal-dialog');
    if (dlg) {
      dlg.style.setProperty('max-width', width, 'important');
      dlg.style.setProperty('width', 'auto', 'important');
      dlg.style.setProperty('transform', 'none', 'important');
      dlg.style.removeProperty('left');
      dlg.style.removeProperty('top');
      dlg.style.removeProperty('position');
    }
    modalEl.style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('modalNaturalidade');
    if (!modal) return;

    // já coloca no body ao carregar
    if (modal.parentElement !== document.body) document.body.appendChild(modal);

    const selUF     = modal.querySelector('#selectEstadoNaturalidade');
    const selCid    = modal.querySelector('#selectCidadeNaturalidade');
    const codIbge   = modal.querySelector('#inputCodigoIbgeNaturalidade');
    const btnLimpar = modal.querySelector('#btnLimparNaturalidade');
    const btnOk     = modal.querySelector('#btnConfirmarNaturalidade');

    let estados = [];
    let cidadesPorUf = {};
    let municipiosIbge = [];

    // Carregamento dos dados (com cache desativado)
    const pEstados = fetch('/data/estados.json', {cache:'no-store'})
      .then(r => r.json())
      .then(arr => {
        estados = arr || [];
        if (selUF) {
          selUF.innerHTML = '<option value="">Selecione...</option>' +
            estados.map(e => `<option value="${e.sigla}">${e.nome}</option>`).join('');
        }
      });

    const pCidades = fetch('/data/municipios_por_uf.json', {cache:'no-store'})
      .then(r => r.json()).then(obj => (cidadesPorUf = obj || {}));

    const pMunicipios = fetch('/data/municipios_ibge.json', {cache:'no-store'})
      .then(r => r.json()).then(arr => (municipiosIbge = arr || []));

    const ensureLoaded = () => Promise.all([pEstados, pCidades, pMunicipios]);

    // UF => popula cidades
    selUF?.addEventListener('change', function() {
      const uf = this.value;
      if (!selCid) return;
      selCid.innerHTML = '<option value="">Selecione...</option>';
      if (uf && cidadesPorUf[uf]) {
        selCid.innerHTML += cidadesPorUf[uf].map(c => `<option value="${c}">${c}</option>`).join('');
      }
      if (codIbge) codIbge.value = '';
      selCid?.focus();
    });

    // Cidade => preenche IBGE
    selCid?.addEventListener('change', function() {
      const uf = selUF?.value;
      const cidade = this.value;
      const alvo = simplify(cidade);
      const muni = municipiosIbge.find(m => m.uf === uf && simplify(m.nome) === alvo);
      if (codIbge) codIbge.value = muni ? muni.codigo : '';
    });

    // Botões
    btnLimpar?.addEventListener('click', function() {
      if (selUF) selUF.value = '';
      if (selCid) selCid.innerHTML = '<option value="">Selecione...</option>';
      if (codIbge) codIbge.value = '';
      const input = document.getElementById('naturalidade');
      if (input) input.value = '';
    });

    btnOk?.addEventListener('click', function() {
      const uf = selUF?.value || '';
      const cidade = selCid?.value || '';
      const input = document.getElementById('naturalidade');
      if (input) input.value = cidade ? `${cidade} (${uf})` : '';
      bootstrap.Modal.getOrCreateInstance(modal).hide();
    });

    // Pré-seleção a partir do campo do formulário
    function preselectFromField() {
      const current = (document.getElementById('naturalidade')?.value || '').trim();
      const m = current.match(/^(.+?)\s*\(\s*([A-Za-z]{2})\s*\)\s*$/);
      if (!m) return;
      const cidadeTxt = m[1].trim();
      const ufTxt     = m[2].toUpperCase();

      if (selUF) {
        selUF.value = ufTxt;
        selUF.dispatchEvent(new Event('change'));
      }
      if (selCid && cidadeTxt) {
        const alvo = simplify(cidadeTxt);
        let opt = Array.from(selCid.options).find(o => o.value === cidadeTxt)
               || Array.from(selCid.options).find(o => simplify(o.textContent || o.value) === alvo);
        if (!opt) {
          const extra = document.createElement('option');
          extra.value = cidadeTxt; extra.textContent = cidadeTxt;
          selCid.appendChild(extra);
          opt = extra;
        }
        selCid.value = opt.value;

        const muni = municipiosIbge.find(m => m.uf === ufTxt && simplify(m.nome) === alvo);
        if (codIbge) codIbge.value = muni ? muni.codigo : '';
      }
    }

    // Bootstrap hooks
    modal.addEventListener('show.bs.modal', async () => {
      ensureModalFree(modal, '640px');  // evita “tela cinza”
      await ensureLoaded();
      preselectFromField();
    });

    modal.addEventListener('shown.bs.modal', () => {
      selUF?.focus();
    });
  });
})();