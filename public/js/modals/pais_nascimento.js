// /js/modals/pais_nascimento.js
(() => {
  'use strict';

  const DATA_PATH = '/data/paises_bacen.json';

  const norm    = (o) => ({ code: String(o.code ?? o.codigo ?? o.id ?? '').trim(),
                            name: String(o.name ?? o.nome   ?? o.label ?? '').trim() });
  const normStr = (s='') => String(s).replace(/\s+/g,' ').trim().toLowerCase();
  const cssEscape = (window.CSS && CSS.escape) ? CSS.escape : (s)=>String(s).replace(/["\\]/g,'\\$&');

  document.addEventListener('DOMContentLoaded', () => {
    // >>> MOVe o modal para o <body> para não ser “clipado” por containers
    const modal = document.getElementById('modalPaisNascimento');
    if (!modal) return;
    if (modal.parentElement !== document.body) document.body.appendChild(modal);

    const els = {
      list:        modal.querySelector('#listaPaises'),
      search:      modal.querySelector('#paisPesquisa'),
      outroCheck:  modal.querySelector('#paisCheckOutro'),
      outroWrap:   modal.querySelector('#campoOutroPais'),
      outroCod:    modal.querySelector('#outroPaisCodigo'),
      outroNome:   modal.querySelector('#outroPaisNome'),
      btnLimpar:   modal.querySelector('#btnLimparPais'),
      btnOk:       modal.querySelector('#btnConfirmarPais'),
    };

    let PAISES = [];

    function destino() {
      return document.getElementById('pais_nascimento') || document.querySelector('input[name="pais_nascimento"]');
    }

    async function load() {
      if (PAISES.length) return;
      const r = await fetch(DATA_PATH, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${DATA_PATH}`);
      const text = (await r.text()).replace(/^\uFEFF/,'');
      if (text.trim().startsWith('<')) throw new Error('Recebi HTML no lugar de JSON');
      const json = JSON.parse(text);
      const raw  = Array.isArray(json) ? json : (json.data || json.items || json.paises || []);
      PAISES     = raw.map(norm).filter(x => x.code && x.name);
      if (!PAISES.length) throw new Error('JSON de países vazio após normalização');
      PAISES.sort((a,b) => (a.name||'').localeCompare(b.name||'','pt-BR'));
    }

    function render(lista) {
      els.list.innerHTML = '';
      (lista || []).forEach((p, i) => {
        const id = `paisCheck${i}`;
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex align-items-center';
        li.innerHTML = `
          <input type="checkbox" name="paisNascimentoCheck" class="form-check-input" id="${id}" value="${p.code}">
          <label for="${id}" class="mb-0 col-cod">${p.code}</label>
          <label for="${id}" class="mb-0 col-nom">${p.name}</label>
        `;
        const ck = li.querySelector('input');
        ck.addEventListener('click', function(){
          modal.querySelectorAll('input[name=paisNascimentoCheck]').forEach(c => { if (c !== this) c.checked = false; });
          if (els.outroCheck) els.outroCheck.checked = false;
          els.outroWrap.classList.add('d-none');
          els.list.querySelectorAll('.list-group-item').forEach(li2 => li2.classList.remove('is-selected'));
          if (this.checked) li.classList.add('is-selected');
        });
        els.list.appendChild(li);
      });
      if (!(lista && lista.length)) {
        const li = document.createElement('li');
        li.className = 'list-group-item text-muted';
        li.textContent = 'Nenhum país encontrado.';
        els.list.appendChild(li);
      }
    }

    function applyFilter(q) {
      const out = PAISES.filter(p => normStr(`${p.code} ${p.name}`).includes(q));
      render(out);
      return out;
    }

    function autoSelectIfUnique(codeTyped, nameTyped) {
      const code = (codeTyped || '').trim();
      const name = normStr(nameTyped || '');
      let found = null;
      if (code) found = PAISES.find(p => p.code === code);
      if (!found) {
        const candidates = PAISES.filter(p =>
          (!code || p.code.startsWith(code)) && (!name || normStr(p.name).includes(name))
        );
        if (candidates.length === 1) found = candidates[0];
      }
      if (found) {
        if (els.outroCheck) els.outroCheck.checked = false;
        els.outroWrap.classList.add('d-none');
        modal.querySelectorAll('input[name=paisNascimentoCheck]').forEach(c => {
          const on = (c.value === found.code);
          c.checked = on;
          c.closest('li')?.classList.toggle('is-selected', on);
        });
        modal.querySelector(`input[name="paisNascimentoCheck"][value="${cssEscape(found.code)}"]`)
             ?.closest('li')?.scrollIntoView({ block: 'nearest' });
        return true;
      }
      return false;
    }

    function preselectFromField() {
      const cur = (destino()?.value || '').trim();
      if (!cur) return;
      const m = cur.split(' - ');
      const codeCandidate = (m[0] || '').trim();
      const nameCandidate = (m.slice(1).join(' - ') || cur).trim();

      const found =
        PAISES.find(p => p.code === codeCandidate) ||
        PAISES.find(p => normStr(`${p.code} - ${p.name}`) === normStr(cur));

      if (found) {
        const chk = modal.querySelector(`input[name="paisNascimentoCheck"][value="${cssEscape(found.code)}"]`);
        if (chk) {
          chk.checked = true;
          chk.closest('li')?.classList.add('is-selected');
          if (els.outroCheck) els.outroCheck.checked = false;
          els.outroWrap.classList.add('d-none');
          chk.closest('li')?.scrollIntoView({ block: 'nearest' });
        }
      } else {
        if (els.outroCheck) els.outroCheck.checked = true;
        els.outroWrap.classList.remove('d-none');
        if (els.outroCod)  els.outroCod.value = codeCandidate;
        if (els.outroNome) els.outroNome.value = nameCandidate;
        applyFilter(normStr(cur));
      }
    }

    // ciclo de vida do modal
    modal.addEventListener('show.bs.modal', async () => {
      els.list.innerHTML = '<li class="list-group-item">Carregando…</li>';
      try {
        await load();
        render(PAISES);
        if (els.search) els.search.value = '';
        if (els.outroCheck) els.outroCheck.checked = false;
        if (els.outroCod)  els.outroCod.value = '';
        if (els.outroNome) els.outroNome.value = '';
        els.outroWrap.classList.add('d-none');
        preselectFromField();
      } catch (e) {
        els.list.innerHTML = `<li class="list-group-item text-danger">Erro ao carregar (${e.message}).</li>`;
        console.error('[País Nascimento]', e);
      }
    });

    // força reposicionamento após animação (caso algum CSS externo crie stacking context)
    modal.addEventListener('shown.bs.modal', () => {
      const inst = bootstrap.Modal.getOrCreateInstance(modal);
      inst.handleUpdate();
      els.search?.focus();
    });

    // busca
    els.search?.addEventListener('input', () => {
      const q = normStr(els.search.value || '');
      applyFilter(q);
      if (els.outroCheck?.checked) els.outroWrap.classList.remove('d-none');
    });

    // “Outro”
    els.outroCheck?.addEventListener('change', () => {
      if (els.outroCheck.checked) {
        modal.querySelectorAll('input[name=paisNascimentoCheck]').forEach(c => (c.checked=false));
        els.list.querySelectorAll('.list-group-item').forEach(li => li.classList.remove('is-selected'));
        els.outroWrap.classList.remove('d-none');
        els.outroCod?.focus();
      } else {
        els.outroWrap.classList.add('d-none');
        if (els.outroCod)  els.outroCod.value = '';
        if (els.outroNome) els.outroNome.value = '';
      }
    });
    const onOutroInput = () => {
      if (!els.outroCheck?.checked) return;
      const code = (els.outroCod?.value || '').trim();
      const name = (els.outroNome?.value || '').trim();
      applyFilter(normStr(`${code} ${name}`));
      autoSelectIfUnique(code, name);
    };
    els.outroCod?.addEventListener('input', onOutroInput);
    els.outroNome?.addEventListener('input', onOutroInput);

    // limpar
    els.btnLimpar?.addEventListener('click', () => {
      modal.querySelectorAll('input[name=paisNascimentoCheck]').forEach(c => (c.checked=false));
      els.list.querySelectorAll('.list-group-item').forEach(li => li.classList.remove('is-selected'));
      if (els.outroCheck) els.outroCheck.checked = false;
      if (els.outroCod)  els.outroCod.value = '';
      if (els.outroNome) els.outroNome.value = '';
      els.outroWrap.classList.add('d-none');
      const d = destino(); if (d) d.value = '';
      render(PAISES);
    });

    // confirmar
    els.btnOk?.addEventListener('click', () => {
      const d = destino(); if (!d) return;

      if (els.outroCheck?.checked) {
        const code = (els.outroCod?.value  || '').trim();
        const name = (els.outroNome?.value || '').trim();
        els.outroCod?.classList.toggle('is-invalid', !code);
        els.outroNome?.classList.toggle('is-invalid', !name);
        if (!code || !name) return;
        d.value = `${code} - ${name}`;
        bootstrap.Modal.getOrCreateInstance(modal).hide();
        return;
      }

      const chk = modal.querySelector('input[name=paisNascimentoCheck]:checked');
      if (chk) {
        const p = PAISES.find(x => x.code === chk.value);
        d.value = p ? `${p.code} - ${p.name}` : chk.value;
      } else {
        d.value = '';
      }
      bootstrap.Modal.getOrCreateInstance(modal).hide();
    });
  });
})();