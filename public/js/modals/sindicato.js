// /public/js/modals/sindicato.js
(() => {
  'use strict';

  /* ===== Helpers ===== */
  const onlyDigits = (s='') => String(s).replace(/\D+/g, '');
  const stripAccents = (s='') =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // CNPJ local (fallback)
  const formatCnpjLocal = v => {
    const d = onlyDigits(v).slice(0,14);
    return d.replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
  };
  const isValidCnpjLocal = cnpj => {
    const c = onlyDigits(cnpj);
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    const calc = len => {
      let sum = 0, pos = len - 7;
      for (let i = len; i >= 1; i--) {
        sum += Number(c[len - i]) * pos--;
        if (pos < 2) pos = 9;
      }
      const mod = sum % 11;
      return (mod < 2) ? 0 : 11 - mod;
    };
    return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
  };

  // Integra com WDMasks se existir
  const WDM = window.WDMasks || {};
  const formatCNPJ   = WDM.formatCNPJ   || formatCnpjLocal;
  const isValidCNPJ  = WDM.isValidCNPJ  || isValidCnpjLocal;
  const bindCNPJMask = WDM.bindCNPJMask || (el => {
    if (!el || el.__cnpjBound) return;
    el.__cnpjBound = true;
    el.addEventListener('input', () => { el.value = formatCnpjLocal(el.value); });
    el.addEventListener('blur',  () => { el.value = formatCnpjLocal(el.value); });
  });

  const fetchJSON = async (url, label) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar ${label||url}`);
    return res.json();
  };

  // Normaliza e padroniza chaves + cria índice de busca
  const normalizeSindicatos = (raw) => {
    let arr = Array.isArray(raw) ? raw
            : Array.isArray(raw?.data)  ? raw.data
            : Array.isArray(raw?.items) ? raw.items
            : (raw && typeof raw === 'object') ? Object.values(raw) : [];

    const normOne = (s = {}) => {
      const map = {};
      for (const k of Object.keys(s)) map[k.toLowerCase()] = k;
      const get = (...alts) => {
        for (const a of alts) {
          const key = map[a.toLowerCase()];
          if (key && s[key] != null && String(s[key]).trim() !== '') return String(s[key]).trim();
        }
        for (const a of alts) {
          const k2 = Object.keys(map).find(k => k.includes(a.toLowerCase()));
          if (k2) {
            const key = map[k2];
            if (key && s[key] != null && String(s[key]).trim() !== '') return String(s[key]).trim();
          }
        }
        return '';
      };

      const cnpj      = get('cnpj','cnpj_raiz','cnpjbase','cnpj_basico','cnpj_matriz','cnpj_entidade');
      const nome      = get('nome','razao','razão','razao_social','razaosocial','entidade','sindicato','descricao','descrição','nome_entidade');
      const municipio = get('municipio','município','cidade','localidade','munic','cidade_nome');
      const uf        = get('uf','estado','siglauf','sigla_uf','uf_sigla');

      const obj = { cnpj, nome, municipio, uf, ...s };

      // Índices de busca
      const keyText = `${nome} ${municipio} ${uf}`.trim();
      obj._searchText = stripAccents(keyText);
      obj._searchDigits = onlyDigits(cnpj);

      return (obj.cnpj || obj.nome || obj.municipio || obj.uf) ? obj : null;
    };

    return (arr || []).map(normOne).filter(Boolean);
  };

  // Debounce
  const debounce = (fn, ms=150) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  /* ===== Estado do modal ===== */
  let state = {
    sindicatos: [],
    filtered: [],
    // virtualização
    batchSize: 300,
    renderedCount: 0,
  };

  document.addEventListener('DOMContentLoaded', () => {
    const modalEl = document.getElementById('modalSindicato');
    const detalhesModalEl = document.getElementById('modalSindicatoDetalhesModal');
    if (!modalEl) return;

    if (modalEl.parentElement !== document.body) document.body.appendChild(modalEl);
    if (detalhesModalEl && detalhesModalEl.parentElement !== document.body) document.body.appendChild(detalhesModalEl);

    init(modalEl).catch(err => console.error('[sindicato.js] init error:', err));
  });

  async function init(modalEl) {
    const listaEl        = modalEl.querySelector('#modalSindicatoLista');
    const pesquisaEl     = modalEl.querySelector('#modalSindicatoPesquisa');
    const outroCheck     = modalEl.querySelector('#modalSindicatoOutroCheck');
    const outroWrap      = modalEl.querySelector('#modalSindicatoOutro');
    const outroCNPJ      = modalEl.querySelector('#modalSindicatoOutroCNPJ');
    const outroNome      = modalEl.querySelector('#modalSindicatoOutroNome');
    const outroUF        = modalEl.querySelector('#modalSindicatoOutroUF');
    const outroMunicipio = modalEl.querySelector('#modalSindicatoOutroMunicipio');
    const detalhesBtn    = modalEl.querySelector('#modalSindicatoDetalhes');
    const limparBtn      = modalEl.querySelector('#modalSindicatoLimpar');
    const confirmarBtn   = modalEl.querySelector('#modalSindicatoConfirmar');
    const campoDestino   = document.getElementById('extra_sindicato');
    const wrapScroll     = modalEl.querySelector('#wrapTabelaSindicato');

    // Carrega dados
    listaEl.innerHTML = `<tr><td colspan="5" class="text-muted">Carregando sindicatos...</td></tr>`;
    let ufs = [], municipios = [];
    try {
      const sindicatosRaw = await fetchJSON('/data/sindicatos_full.json', 'sindicatos_full.json');
      state.sindicatos = normalizeSindicatos(sindicatosRaw);
      state.filtered = state.sindicatos; // inicial: todos

      // auxiliares (opcional)
      try {
        [ufs, municipios] = await Promise.all([
          fetchJSON('/data/estados.json', 'estados.json'),
          fetchJSON('/data/municipios_ibge.json', 'municipios_ibge.json'),
        ]);
      } catch { /* segue sem travar */ }

    } catch (e) {
      listaEl.innerHTML = `<tr><td colspan="5" class="text-danger">Erro ao carregar sindicatos: ${e.message}</td></tr>`;
      return;
    }

    // UF/Município (Outro)
    if (outroUF) {
      outroUF.innerHTML = '<option value="">UF...</option>';
      (ufs || []).forEach(uf => {
        const opt = document.createElement('option');
        opt.value = uf.sigla;
        opt.textContent = uf.nome;
        outroUF.appendChild(opt);
      });
      outroUF.onchange = () => {
        outroMunicipio.innerHTML = '<option value="">Município...</option>';
        const ufSel = outroUF.value;
        if (!ufSel) return;
        (municipios || []).filter(m => m.uf === ufSel).forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.codigo;
          opt.textContent = m.nome;
          outroMunicipio.appendChild(opt);
        });
      };
    }

    // Render virtual (reseta e desenha primeiro lote)
    const resetAndRender = () => {
      state.renderedCount = 0;
      listaEl.innerHTML = '';
      renderMore(); // primeiro lote
    };

    const renderMore = () => {
      const { filtered, renderedCount, batchSize } = state;
      const end = Math.min(renderedCount + batchSize, filtered.length);

      for (let i = renderedCount; i < end; i++) {
        const s = filtered[i];
        const tr = document.createElement('tr');

        const tdSel = document.createElement('td');
        tdSel.className = 'text-center';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'sindicato';
        radio.value = s.cnpj || '';
        radio.className = 'form-check-input';
        radio.dataset.nome = s.nome || '';
        radio.dataset.municipio = s.municipio || '';
        radio.dataset.uf = s.uf || '';
        tdSel.appendChild(radio);

        const tdCnpj = document.createElement('td'); tdCnpj.textContent = s.cnpj || '';
        const tdNome = document.createElement('td'); tdNome.textContent = s.nome || '';
        const tdMun  = document.createElement('td'); tdMun.textContent  = s.municipio || '';
        const tdUf   = document.createElement('td'); tdUf.textContent   = s.uf || '';

        tr.append(tdSel, tdCnpj, tdNome, tdMun, tdUf);
        listaEl.appendChild(tr);
      }

      state.renderedCount = end;

      if (filtered.length === 0) {
        listaEl.innerHTML = `<tr><td colspan="5" class="text-muted">Nenhum sindicato encontrado.</td></tr>`;
      }
    };

    // Infinite scroll dentro do wrap
    const onScroll = () => {
      if (!wrapScroll) return;
      const nearBottom = wrapScroll.scrollTop + wrapScroll.clientHeight >= wrapScroll.scrollHeight - 40;
      if (nearBottom && state.renderedCount < state.filtered.length) {
        renderMore();
      }
    };
    wrapScroll?.addEventListener('scroll', onScroll);

    // Render inicial
    resetAndRender();

    // Busca — tokenizada, sem acento, inclui CNPJ/UF/município/nome
    const doSearch = () => {
      const termRaw = (pesquisaEl?.value || '').trim();
      if (!termRaw) {
        state.filtered = state.sindicatos;
        resetAndRender();
        return;
      }
      const term = stripAccents(termRaw);
      const digits = onlyDigits(termRaw);
      const tokens = term.split(/\s+/).filter(Boolean); // AND entre tokens

      state.filtered = state.sindicatos.filter(s => {
        // CNPJ: busca por substring numérica
        const cnpjHit = digits ? s._searchDigits.includes(digits) : false;

        // Texto: AND entre tokens no _searchText
        const textHit = tokens.every(t => s._searchText.includes(t));

        // UF curta (ex.: “mg” digitado)
        const ufHit = tokens.length === 1 && tokens[0].length <= 3
          ? stripAccents(s.uf || '').includes(tokens[0])
          : false;

        return cnpjHit || textHit || ufHit;
      });

      resetAndRender();
    };
    pesquisaEl?.addEventListener('input', debounce(doSearch, 150));

    // “Outro sindicato”
    outroWrap.style.display = 'none';
    outroCheck.checked = false;
    if (outroCNPJ) bindCNPJMask(outroCNPJ);
    outroCheck.onchange = () => {
      outroWrap.style.display = outroCheck.checked ? '' : 'none';
      if (!outroCheck.checked) {
        [outroCNPJ, outroNome].forEach(el => el && (el.value=''));
        if (outroUF) outroUF.value = '';
        if (outroMunicipio) outroMunicipio.innerHTML = '<option value="">Município...</option>';
        listaEl.querySelectorAll('input[name="sindicato"]').forEach(el => (el.checked = false));
        listaEl.querySelectorAll('tr').forEach(tr => tr.classList.remove('is-selected'));
      } else {
        bindCNPJMask(outroCNPJ);
      }
    };

    // Seleção pelo clique na linha
    listaEl.addEventListener('click', ev => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const radio = tr.querySelector('input[type="radio"][name="sindicato"]');
      if (radio && ev.target !== radio) {
        radio.checked = true;
        listaEl.querySelectorAll('tr').forEach(r => r.classList.remove('is-selected'));
        tr.classList.add('is-selected');
        outroCheck.checked = false; outroWrap.style.display = 'none';
      }
    });

    // Confirmar
    confirmarBtn.onclick = () => {
      const sel = listaEl.querySelector('input[name="sindicato"]:checked');
      let s = null;
      if (sel) {
        s = {
          cnpj: sel.value,
          nome: sel.dataset.nome,
          municipio: sel.dataset.municipio,
          uf: sel.dataset.uf
        };
      } else if (outroCheck.checked) {
        const cnpj = (outroCNPJ?.value || '').trim();
        const nome = (outroNome?.value || '').trim();
        const uf   = outroUF?.value || '';
        const mun  = outroMunicipio?.options[outroMunicipio.selectedIndex]?.textContent || '';
        if (!cnpj || !nome || !uf || !mun) { alert('Preencha todos os campos do sindicato personalizado.'); return; }
        s = { cnpj, nome, municipio: mun, uf };
      }
      if (!s) { alert('Selecione um sindicato ou preencha "Outro".'); return; }
      if (campoDestino) campoDestino.value = `${formatCNPJ(s.cnpj)} - ${s.nome} - ${s.municipio} - ${s.uf}`;
      bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    };

    // Limpar
    limparBtn.onclick = () => {
      if (campoDestino) campoDestino.value = '';
      bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    };

    // Detalhes
    const handleDetalhesClick = () => {
      const sel = listaEl.querySelector('input[name="sindicato"]:checked');
      let s = null;
      if (sel) {
        const dig = onlyDigits(sel.value);
        s = state.sindicatos.find(x => onlyDigits(x.cnpj) === dig) ||
            { cnpj: sel.value, nome: sel.dataset.nome, municipio: sel.dataset.municipio, uf: sel.dataset.uf };
      } else if (outroCheck.checked) {
        s = {
          cnpj: (outroCNPJ?.value || '').trim(),
          nome: (outroNome?.value || '').trim(),
          uf: outroUF?.value || '',
          municipio: outroMunicipio?.options[outroMunicipio.selectedIndex]?.textContent || ''
        };
      }
      if (!s) { alert('Selecione um sindicato primeiro.'); return; }

      const box = document.getElementById('modalSindicatoDetalhesConteudo');
      const detModal = document.getElementById('modalSindicatoDetalhesModal');
      if (!box || !detModal) return;

      box.innerHTML = `
        <table class="table table-sm detalhes-sindicato-table">
          <tbody></tbody>
        </table>`;
      const tbody = box.querySelector('tbody');
      const put = (k,v) => {
        const val = (v ?? '').toString().trim();
        if (val) tbody.insertAdjacentHTML('beforeend',
          `<tr><td class="detail-label">${k}</td><td class="detail-value">${val}</td></tr>`);
      };
      put('CNPJ', formatCNPJ(s.cnpj));
      put('Nome', s.nome);
      put('UF', s.uf);
      put('Município', s.municipio);
      put('Categoria', s.categoria);
      put('Grau', s.grau);
      put('Grupo', s.grupo);
      put('Classe', s.classe);
      put('Código Sindical', s.codigo_sindical || s.codigoSindical);
      put('Endereço', [s.logradouro, s.numero, s.bairro].filter(Boolean).join(', '));
      put('CEP', s.cep);
      put('Email', s.email);
      put('Telefone', s.telefone);
      bootstrap.Modal.getOrCreateInstance(detModal).show();
    };
    detalhesBtn?.addEventListener('click', handleDetalhesClick);

    modalEl.addEventListener('shown.bs.modal', () => bindCNPJMask(outroCNPJ));
  }
})();