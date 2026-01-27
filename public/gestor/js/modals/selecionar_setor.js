// Versão refatorada e padronizada do modal Selecionar Setor (usa classes list-empty, grid definida em modais-funcionarios.css)
(() => {
	const byId = (id) => document.getElementById(id);
	const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m]));
	const escapeAttr = (s='') => escapeHtml(s).replace(/"/g,'&quot;');
	const debounce = (fn, wait=250) => { let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; };

	function getBase(){ const b=document.body?.getAttribute('data-base-path')||window.__WD_BASE_PATH||'/gestor'; return b.endsWith('/')?b.slice(0,-1):b; }
	const API = {
		unidadesCluster: async (baseId) => {
			const bp=getBase();
			const url = `${bp}/api/unidades/cluster?unidade_id=${encodeURIComponent(baseId)}`;
			const t0 = performance.now();
			const r = await fetch(url, { headers: { 'Accept': 'application/json' }});
			const dt = (performance.now() - t0).toFixed(0);
			console.debug('[Modal Setor] Fetch unidadesCluster', { url, status: r.status, ms: dt });
			if (!r.ok) throw new Error('Falha ao buscar unidades relacionadas');
			const j = await r.json();
			const arr = Array.isArray(j) ? j : (j.unidades || j.data || []);
			console.debug('[Modal Setor] unidadesCluster -> quantidade', arr.length, 'exemplo', arr[0]);
			return arr;
		},
		setores: async (unidadeId, q='') => {
			const bp=getBase();
			const url = `${bp}/api/setores/unidade/${encodeURIComponent(unidadeId)}${q?`?q=${encodeURIComponent(q)}`:''}`;
			const t0 = performance.now();
			const r = await fetch(url, { headers: { 'Accept': 'application/json' }});
			const dt = (performance.now() - t0).toFixed(0);
			console.debug('[Modal Setor] Fetch setores', { url, status: r.status, ms: dt });
			if (!r.ok) throw new Error('Falha ao buscar setores');
			const j = await r.json();
			const arr = Array.isArray(j) ? j : (j.setores || j.data || []);
			console.debug('[Modal Setor] setores -> quantidade', arr.length, 'exemplo', arr[0]);
			return arr;
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
			ulSetores.innerHTML = `<li class="list-group-item list-empty">Carregando setores...</li>`;
			try {
				let setores = await API.setores(unidadeId, q);
				if (!setores.length) {
					const fallback = fallbackSetores(unidadeId, q);
						if (fallback.length) {
							console.debug('[Modal Setor] Usando fallbackSetores. API retornou vazio.');
							setores = fallback;
						} else {
							console.debug('[Modal Setor] Lista de setores vazia (API e fallback).');
						}
				}
				console.log('[Modal Setor] Setores (final) para unidade', unidadeId, { quantidade: setores.length, setores });
				renderSetores(setores);
			} catch (e) {
				console.error('[Modal Setor] Erro ao carregar setores', e);
				const fb = fallbackSetores(unidadeId, q);
				if (fb.length) {
					console.warn('[Modal Setor] Usando fallbackSetores após erro de API.');
					renderSetores(fb);
				} else {
					renderVazio('Erro ao carregar setores.');
				}
			}
		}

		async function carregarUnidadesDoGrupo(baseId) {
			selUnidade.innerHTML = `<option>Carregando unidades...</option>`;
			selUnidade.disabled = true;
			let unidades = [];
			try { unidades = await API.unidadesCluster(baseId); } catch { unidades = fallbackUnidadesCluster(baseId); }
			if (!Array.isArray(unidades) || !unidades.length) {
				selUnidade.innerHTML = `<option value="">Nenhuma unidade encontrada</option>`;
				selUnidade.disabled = true;
				renderVazio('Nenhuma unidade encontrada.');
				return;
			}
			unidades.sort((a,b) => String(a.nome||a.fantasia||'').localeCompare(String(b.nome||b.fantasia||'')));
			const optionsHtml = unidades.map(u => {
				const id = u._id || u.id || u.unidade_id || '';
				const label = u.codigo && u.nome ? `${u.codigo} - ${u.nome}` : (u.nome || u.fantasia || u.razao_social || u.codigo || id);
				return `<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`;
			}).join('');
			selUnidade.innerHTML = optionsHtml;
			console.debug('[Modal Setor] Options unidades geradas', { quantidade: unidades.length, htmlChars: optionsHtml.length });
			const existe = unidades.some(u => String(u._id||u.id) === String(baseId));
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
				out.value = id;            // compat legado (se algum código ainda espera id no value)
				out.dataset.setorId = id;  // padronizado
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
				out.value = label; // exibir o nome/label pro usuário
			}
			bootstrap.Modal.getInstance(modalEl)?.hide();
		});
	});
})();
