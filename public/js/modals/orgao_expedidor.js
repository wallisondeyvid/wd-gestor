(() => {
  'use strict';

  // ---------- utils ----------
  const norm = (s='') =>
    s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();

  // limpa backdrops “presos” e garante modal dentro do <body>
  function cleanBackdrops() {
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('paddingRight');
  }
  function ensureInBody(el){ if (el && el.parentElement !== document.body) document.body.appendChild(el); }

  // carrega o primeiro JSON disponível entre os caminhos abaixo
  async function loadData() {
    const candidates = [
      '/data/orgaos_expedidor.json',
      '/data/orgaos_expedidores.json',
      '/data/orgao_expedidor.json',
      '/data/orgaos_emissor_rg.json'
    ];
    for (const url of candidates) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) continue;
        const j = await r.json();
        // aceita objeto { "SIGLA":"Nome" } ou array [{codigo, nome|descricao}]
        if (Array.isArray(j)) {
          return j.map(x => ({
            codigo: String(x.codigo ?? x.sigla ?? '').trim(),
            nome:   String(x.nome   ?? x.descricao ?? '').trim()
          })).filter(x => x.codigo || x.nome);
        } else if (j && typeof j === 'object') {
          return Object.entries(j).map(([codigo, nome]) => ({
            codigo: String(codigo).trim(),
            nome:   String(nome).trim()
          }));
        }
      } catch(_) { /* tenta o próximo */ }
    }
    return [];
  }

  // reserva o espaço da barra de rolagem para alinhar cabeçalho/linhas
  function syncScrollbarPadding(wrapEl){
    if (!wrapEl) return;
    const sbw = wrapEl.offsetWidth - wrapEl.clientWidth; // scrollbar width
    wrapEl.style.setProperty('--sbw', sbw + 'px');
  }

  document.addEventListener('click', (e) => {
    // Qualquer gatilho com esses seletor(es) abre o modal
    const btn = e.target.closest(
      '#btnAbrirModalOrgaoExpedidor, [data-bs-target="#modalOrgaoExpedidor"], [data-target="#modalOrgaoExpedidor"]'
    );
    if (!btn) return;
    e.preventDefault();
    const modal = document.getElementById('modalOrgaoExpedidor');
    if (!modal) return;
    cleanBackdrops();
    ensureInBody(modal);
    bootstrap.Modal.getOrCreateInstance(modal).show();
  });

  document.addEventListener('DOMContentLoaded', async () => {
    const modal        = document.getElementById('modalOrgaoExpedidor');
    if (!modal) return;

    const inputBusca   = modal.querySelector('#pesquisaOrgaoExpedidor');
    const wrap         = modal.querySelector('#wrapOrgaos');
    const ul           = modal.querySelector('#orgaosExpedidorList');
    const outroCheck   = modal.querySelector('#orgaoOutroCheck');
    const outroWrap    = modal.querySelector('#manualOrgaoWrap');
    const outroCod     = modal.querySelector('#orgaoOutroCodigo');
    const outroNome    = modal.querySelector('#orgaoOutroNome');
    const btnLimpar    = modal.querySelector('#modalOrgaoExpedidorLimpar');
    const btnConf      = modal.querySelector('#modalOrgaoExpedidorConfirmar');
    const destino      = document.getElementById('extra_orgao_expedidor') ||
                         document.getElementById('orgao_expedidor');

    let DATA = [];

    function render(list){
      ul.innerHTML = '';
      const frag = document.createDocumentFragment();
      (list || []).forEach((item, idx) => {
        const id = `orgExp_${idx}`;
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.innerHTML = `
          <div class="col-sel">
            <input type="checkbox" class="form-check-input" name="orgExpCheck" id="${id}">
          </div>
          <label for="${id}" class="mb-0 col-cod">${item.codigo}</label>
          <label for="${id}" class="mb-0 col-nom">${item.nome}</label>
        `;
        const chk = li.querySelector('input[type=checkbox]');
        // single-select (comportamento de radio)
        chk.addEventListener('change', () => {
          if (chk.checked) {
            ul.querySelectorAll('input[name=orgExpCheck]').forEach(o => { if (o!==chk) o.checked = false; });
            outroCheck.checked = false;
            outroWrap.classList.add('d-none');
          }
        });
        // clicar na linha marca o checkbox
        li.addEventListener('click', (ev) => {
          if (ev.target.tagName !== 'INPUT') {
            chk.checked = true;
            chk.dispatchEvent(new Event('change'));
          }
        });
        frag.appendChild(li);
      });
      ul.appendChild(frag);
      syncScrollbarPadding(wrap);
    }

    function preselectFromField(){
      const val = (destino?.value || '').trim();
      if (!val) return;
      const m = val.match(/^\s*([A-Z0-9.-]+)\s*-\s*(.+)$/i);
      const code = m?.[1]?.trim();
      const text = val.toLowerCase();

      // tenta por "SIGLA - NOME", depois por sigla
      let targetInput = Array.from(ul.querySelectorAll('li')).find(li => {
        const cod = li.querySelector('.col-cod')?.textContent.trim();
        const nom = li.querySelector('.col-nom')?.textContent.trim();
        return (`${cod} - ${nom}`).toLowerCase() === text;
      })?.querySelector('input[type=checkbox]');

      if (!targetInput && code) {
        targetInput = Array.from(ul.querySelectorAll('li')).find(li =>
          li.querySelector('.col-cod')?.textContent.trim().toLowerCase() === code.toLowerCase()
        )?.querySelector('input[type=checkbox]');
      }

      if (targetInput) {
        targetInput.checked = true;
        targetInput.closest('li')?.scrollIntoView({ block:'nearest' });
        outroCheck.checked = false;
        outroWrap.classList.add('d-none');
      } else if (m) {
        // ativa “Outro” com os valores existentes
        outroCheck.checked = true;
        outroWrap.classList.remove('d-none');
        outroCod.value  = m[1] || '';
        outroNome.value = m[2] || '';
      }
    }

    // Abrir: carregar dados uma única vez
    modal.addEventListener('show.bs.modal', async () => {
      cleanBackdrops(); ensureInBody(modal);
      if (!DATA.length) DATA = await loadData();
      // ordena por nome mantendo código como chave secundaria
      DATA.sort((a,b) => (a.nome||'').localeCompare(b.nome||'', 'pt-BR') || (a.codigo||'').localeCompare(b.codigo||''));
      render(DATA);
      inputBusca && (inputBusca.value = '');
      outroCheck.checked = false;
      outroWrap.classList.add('d-none');
      outroCod.value = ''; outroNome.value = '';
    });

    modal.addEventListener('shown.bs.modal', () => {
      inputBusca?.focus();
      preselectFromField();
      syncScrollbarPadding(wrap);
    });

    // filtro
    inputBusca?.addEventListener('input', () => {
      const t = norm(inputBusca.value || '');
      const filtered = !t ? DATA : DATA.filter(o =>
        norm(o.codigo).includes(t) || norm(o.nome).includes(t) || norm(`${o.codigo} - ${o.nome}`).includes(t)
      );
      render(filtered);
    });

    // outro
    outroCheck?.addEventListener('change', () => {
      if (outroCheck.checked) {
        ul.querySelectorAll('input[name=orgExpCheck]').forEach(o => o.checked = false);
        outroWrap.classList.remove('d-none');
        outroCod.focus();
      } else {
        outroWrap.classList.add('d-none');
        outroCod.value = ''; outroNome.value = '';
      }
    });

    // limpar
    btnLimpar?.addEventListener('click', () => {
      inputBusca && (inputBusca.value = '');
      render(DATA);
      ul.querySelectorAll('input[name=orgExpCheck]').forEach(o => o.checked = false);
      outroCheck.checked = false;
      outroWrap.classList.add('d-none');
      outroCod.value = ''; outroNome.value = '';
      if (destino) destino.value = '';
    });

    // confirmar
    btnConf?.addEventListener('click', () => {
      let value = '';
      if (outroCheck.checked) {
        const c = (outroCod.value || '').trim();
        const n = (outroNome.value || '').trim();
        if (!c || !n) { (c?outroNome:outroCod).focus(); return; }
        value = `${c} - ${n}`;
      } else {
        const sel = ul.querySelector('input[name=orgExpCheck]:checked');
        if (sel) {
          const row = sel.closest('li');
          const c = row.querySelector('.col-cod')?.textContent.trim() || '';
          const n = row.querySelector('.col-nom')?.textContent.trim() || '';
          value = `${c} - ${n}`;
        }
      }
      if (destino) destino.value = value;
      bootstrap.Modal.getOrCreateInstance(modal).hide();
    });

    // recalcula padding do cabeçalho quando a janela muda
    window.addEventListener('resize', () => syncScrollbarPadding(wrap));
  });
})();