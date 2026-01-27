// Arquivo intermediário obsoleto. Use somente selecionar_setor.js

// Versão refatorada do modal Selecionar Setor (padronização modais-funcionarios)
(() => {
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m]));
  const escapeAttr = (s='') => escapeHtml(s).replace(/"/g,'&quot;');
  const debounce = (fn, wait=250) => { let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; };

  const API = {
    unidadesCluster: async (baseId) => {
      const url = `/api/unidades/cluster?unidade_id=${encodeURIComponent(baseId)}`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' }});
      if (!r.ok) throw new Error('Falha ao buscar unidades relacionadas');
      const j = await r.json();
      return Array.isArray(j) ? j : (j.unidades || j.data || []);
    },
    setores: async (unidadeId, q='') => {
      const url = `/api/setores/unidade/${encodeURIComponent(unidadeId)}${q?`?q=${encodeURIComponent(q)}`:''}`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' }});
      if (!r.ok) throw new Error('Falha ao buscar setores');
      const j = await r.json();
      return Array.isArray(j) ? j : (j.setores || j.data || []);
    },
  };

  function fallbackUnidadesCluster(baseId) {
    const all = (window.__WD && Array.isArray(window.__WD.unidades)) ? window.__WD.unidades : [];
    if (!all.length) return [];
    const base = all.find(u => String(u._id) === String(baseId));
    if (!base) return [];
    const anchor = base.matriz_id || base.unidade_principal_id || base._id;
    const asStr = String(anchor);
    const grupo = all.filter(u => String(u._id) === asStr || String(u.matriz_id||'') === asStr || String(u.unidade_principal_id||'') === asStr );
    return grupo.length ? grupo : [base];
  }

  function fallbackSetores(unidadeId, q='') {
    const all = (window.__WD && Array.isArray(window.__WD.setores)) ? window.__WD.setores : [];
    if (!all.length) return [];
    const re = q ? new RegExp(q, 'i') : null;
    return all.filter(s => {
      const sid = String((s.unidade_id && (s.unidade_id._id || s.unidade_id)) || '');
      const matchUnidade = sid === String(unidadeId);
      if (!matchUnidade) return false;
      if (!re) return true;
      return re.test(s.nome || '') || re.test(s.descricao || '');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const modalEl = byId('modalSelecionarSetor');
    const abrirBtn = byId('btnSelecionarSetor');
    const mainSel = byId('unidade');
    if (!modalEl || !abrirBtn || !mainSel) {
      console.warn('[SelecionarSetor] Elementos não encontrados.');
      return;
    }
    const selUnidade = modalEl.querySelector('#modalSelectUnidadeSetor');
    const inpBusca = modalEl.querySelector('#setorPesquisa');
    const ulSetores = modalEl.querySelector('#listaSetores');
    const btnConfirmar = byId('btnConfirmarSetor');
    let lastLoadedUnidadeId = null;

    function renderVazio(msg){
      ulSetores.innerHTML = `<li class="list-group-item list-empty"><span class="col-desc">${escapeHtml(msg)}</span></li>`;
      btnConfirmar.disabled = true;
    }

    function renderSetores(setores) {
      if (!Array.isArray(setores) || !setores.length) {
        renderVazio('Nenhum setor encontrado.');
        return;
      }
      ulSetores.innerHTML = setores.map(s => {
        const id = s._id || s.id || '';
        const nome = s.nome || '';
        const desc = s.descricao || '';
        const label = nome || desc;
        return `\n          <li class="list-group-item">\n            <label class="item-row mb-0">\n              <span class="col-sel">\n                <input type="radio" class="form-check-input" name="optSetor" value="${escapeAttr(id)}" data-label="${escapeAttr(label)}">\n              </span>\n              <span class="col-cod">${escapeHtml(nome || '(sem nome)')}</span>\n              <span class="col-desc">${escapeHtml(desc || '(sem descrição)')}</span>\n            </label>\n          </li>`;
      }).join('');
      btnConfirmar.disabled = true;
    }

    async function carregarSetores(unidadeId, q='') {
      if (!unidadeId) {
        renderVazio('Selecione uma unidade para carregar os setores...');
        return;
      }
      ulSetores.innerHTML = `<li class=\"list-group-item list-empty\">Carregando setores...</li>`;
      try {
        const setores = await API.setores(unidadeId, q);
        console.log('[Modal Setor] Setores recebidos para unidade', unidadeId, setores);
        renderSetores(setores);
      } catch (e) {
        console.error(e);
        renderVazio('Erro ao carregar setores.');
      }
    }

    async function carregarUnidadesDoGrupo(baseId) {
      selUnidade.innerHTML = `<option>Carregando unidades...</option>`;
      selUnidade.disabled = true;
      let unidades = [];
      try { unidades = await API.unidadesCluster(baseId); } catch { unidades = fallbackUnidadesCluster(baseId); }
      if (!Array.isArray(unidades) || !unidades.length) {
        selUnidade.innerHTML = `<option value=\"\">Nenhuma unidade encontrada</option>`;
        selUnidade.disabled = true;
        renderVazio('Nenhuma unidade encontrada.');
        return;
      }
      unidades.sort((a,b) => String(a.nome||a.fantasia||'').localeCompare(String(b.nome||b.fantasia||'')));
      selUnidade.innerHTML = unidades.map(u => {
        const label = u.codigo && u.nome ? `${u.codigo} - ${u.nome}` : (u.nome || u.fantasia || u.razao_social || u.codigo || u._id);
        return `<option value=\"${escapeAttr(u._id)}\">${escapeHtml(label)}</option>`;
      }).join('');
      const existe = unidades.some(u => String(u._id) === String(baseId));
      selUnidade.disabled = false;
      selUnidade.value = existe ? baseId : selUnidade.value;
      lastLoadedUnidadeId = selUnidade.value;
      await carregarSetores(selUnidade.value, inpBusca.value.trim());
    }

    abrirBtn.addEventListener('click', async () => {
      const baseId = mainSel.value;
      if (!baseId) {
        alert('Selecione uma Unidade na aba Identificação antes de escolher o Setor.');
        return;
      }
      await carregarUnidadesDoGrupo(baseId);
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
      setTimeout(() => inpBusca?.focus(), 120);
    });

    selUnidade.addEventListener('change', () => {
      lastLoadedUnidadeId = selUnidade.value;
      carregarSetores(selUnidade.value, inpBusca.value.trim());
    });

    ulSetores.addEventListener('change', (ev) => {
      if (ev.target && ev.target.matches('input[name="optSetor"]')) {
        btnConfirmar.disabled = false;
      }
    });

    inpBusca.addEventListener('input', debounce(() => {
      carregarSetores(selUnidade.value, inpBusca.value.trim());
    }, 250));

    btnConfirmar.addEventListener('click', () => {
      const checked = ulSetores.querySelector('input[name="optSetor"]:checked');
      if (!checked) {
        alert('Selecione um setor para confirmar.');
        return;
      }
      const id = checked.value;
      const label = checked.dataset.label || '';
      const out = byId('setor');
      if (out) {
        out.value = id;
        out.dataset.setorId = id;
        out.title = label;
        let hiddenId = byId('setor_id_hidden');
        if (!hiddenId) {
          hiddenId = document.createElement('input');
          hiddenId.type = 'hidden';
          hiddenId.name = 'departamento';
          hiddenId.id = 'setor_id_hidden';
          out.parentNode.appendChild(hiddenId);
        }
        hiddenId.value = id;
        out.value = label;
      }
      bootstrap.Modal.getInstance(modalEl)?.hide();
    });
  });
})();
