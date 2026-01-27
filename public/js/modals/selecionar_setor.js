(() => {
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const escapeAttr = (s='') => escapeHtml(s).replace(/"/g,'&quot;');
  const debounce = (fn, wait=250) => { let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; };

  // Endpoints recomendados
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

  // Fallback: monta o grupo da unidade a partir de window.__WD.unidades
  function fallbackUnidadesCluster(baseId) {
    const all = (window.__WD && Array.isArray(window.__WD.unidades)) ? window.__WD.unidades : [];
    if (!all.length) return [];
    const base = all.find(u => String(u._id) === String(baseId));
    if (!base) return [];

    // Anchor: matriz (matriz_id/unidade_principal_id nulo) ou o id da matriz se filial
    const anchor = base.matriz_id || base.unidade_principal_id || base._id;
    const asStr = String(anchor);

    const grupo = all.filter(u =>
      String(u._id) === asStr ||
      String(u.matriz_id||'') === asStr ||
      String(u.unidade_principal_id||'') === asStr
    );

    return grupo.length ? grupo : [base];
  }

  // Fallback p/ SETORES, lendo o que veio do EJS
  function fallbackSetores(unidadeId, q='') {
    const all = (window.__WD && Array.isArray(window.__WD.setores)) ? window.__WD.setores : [];
    if (!all.length) return [];
    const re = q ? new RegExp(q, 'i') : null;

    return all.filter(s => {
      // unidade_id pode vir como ObjectId, string ou objeto {_id:...}
      const sid = String(
        (s.unidade_id && (s.unidade_id._id || s.unidade_id)) || ''
      );
      const matchUnidade = sid === String(unidadeId);
      if (!matchUnidade) return false;

      if (!re) return true;
      return re.test(s.nome || '') ||
             re.test(s.descricao || '');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const modalEl   = byId('modalSelecionarSetor');
    const abrirBtn  = byId('btnSelecionarSetor');
    const mainSel   = byId('unidade'); // campo "Unidade" da aba Identificação

    if (!modalEl || !abrirBtn || !mainSel) {
      console.warn('[SelecionarSetor] Elementos não encontrados.');
      return;
    }

    const selUnidade   = modalEl.querySelector('#modalSelectUnidadeSetor');
    const inpBusca     = modalEl.querySelector('#setorPesquisa');
    const ulSetores     = modalEl.querySelector('#listaSetores');
    const btnConfirmar = byId('btnConfirmarSetor');

    let lastLoadedUnidadeId = null;

    function renderSetores(setores) {
      if (!Array.isArray(setores) || !setores.length) {
        ulSetores.innerHTML = `
          <li class="list-group-item"><div class="item-row">
            <span class="col-sel"></span>
            <span class="col-cod">—</span>
            <span class="col-desc">Nenhum setor encontrado.</span>
          </div></li>`;
        btnConfirmar.disabled = true;
        return;
      }

      ulSetores.innerHTML = setores.map(s => {
        const id   = s._id || s.id || '';
        const nome  = s.nome || '';
        const desc = s.descricao || '';
        const label = nome || desc;

        return `
          <li class="list-group-item">
            <label class="item-row mb-0">
              <span class="col-sel">
                <input type="radio" class="form-check-input" name="optSetor" value="${escapeAttr(id)}" data-label="${escapeAttr(label)}">
              </span>
              <span class="col-cod">${escapeHtml(nome || '—')}</span>
              <span class="col-desc">${escapeHtml(desc || '(sem descrição)')}</span>
            </label>
          </li>`;
      }).join('');

      btnConfirmar.disabled = true;
    }

    async function carregarSetores(unidadeId, q='') {
      if (!unidadeId) {
        renderSetores([]);
        return;
      }
      ulSetores.innerHTML = `
        <li class="list-group-item"><div class="item-row">
          <span class="col-sel"></span>
          <span class="col-cod">…</span>
          <span class="col-desc">Carregando setores…</span>
        </div></li>`;

      try {
        const setores = await API.setores(unidadeId, q);
        console.log('[Modal Setor] Setores recebidos para unidade', unidadeId, setores);
        renderSetores(setores);
      } catch (e) {
        console.error(e);
        ulSetores.innerHTML = `
          <li class="list-group-item"><div class="item-row">
            <span class="col-sel"></span>
            <span class="col-cod">!</span>
            <span class="col-desc text-danger">Erro ao carregar setores.</span>
          </div></li>`;
      }
    }

    async function carregarUnidadesDoGrupo(baseId) {
      selUnidade.innerHTML = `<option>Carregando unidades...</option>`;
      selUnidade.disabled = true;

      let unidades = [];
      try {
        unidades = await API.unidadesCluster(baseId);
      } catch {
        unidades = fallbackUnidadesCluster(baseId);
      }

      if (!Array.isArray(unidades) || !unidades.length) {
        selUnidade.innerHTML = `<option value="">Nenhuma unidade encontrada</option>`;
        selUnidade.disabled = true;
        renderSetores([]);
        return;
      }

      // Ordena por nome se houver
      unidades.sort((a,b) => String(a.nome||a.fantasia||'').localeCompare(String(b.nome||b.fantasia||'')));

      selUnidade.innerHTML = unidades.map(u => {
        const label = u.codigo && u.nome ? `${u.codigo} - ${u.nome}` : (u.nome || u.fantasia || u.razao_social || u.codigo || u._id);
        return `<option value="${escapeAttr(u._id)}">${escapeHtml(label)}</option>`;
      }).join('');

      // Seleciona a mesma unidade da aba, se existir na lista
      const existe = unidades.some(u => String(u._id) === String(baseId));
      selUnidade.disabled = false;
      selUnidade.value = existe ? baseId : selUnidade.value;

      lastLoadedUnidadeId = selUnidade.value;
      await carregarSetores(selUnidade.value, inpBusca.value.trim());
    }

    // ===== Eventos =====
    abrirBtn.addEventListener('click', async () => {
      const baseId = mainSel.value;
      if (!baseId) {
        alert('Selecione uma Unidade na aba Identificação antes de escolher o Setor.');
        return;
      }
      await carregarUnidadesDoGrupo(baseId);
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
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
      const id    = checked.value;
      const label = checked.dataset.label || '';

      // Campo existente na aba (name=setor_nome, id=setor). Mostra o nome mas mantém o ID como valor!
      const out = byId('setor');
      if (out) {
        out.value = id;               // mantém o ID como valor (para envio)
        out.dataset.setorId = id;     // guarda o ID em data attribute
        out.title = label;            // dica ao passar o mouse

        // Cria um campo hidden para o ID se necessário
        let hiddenId = byId('setor_id_hidden');
        if (!hiddenId) {
          hiddenId = document.createElement('input');
          hiddenId.type = 'hidden';
          hiddenId.name = 'departamento';
          hiddenId.id = 'setor_id_hidden';
          out.parentNode.appendChild(hiddenId);
        }
        hiddenId.value = id;
        out.value = label;  // mostra o nome do setor
      }

      bootstrap.Modal.getInstance(modalEl)?.hide();
    });
  });
})();
