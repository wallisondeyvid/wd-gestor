// Gestor: modal CNAE Secundário com API + fallback
document.addEventListener('DOMContentLoaded', () => {
	const modalEl            = document.getElementById('modalCnaeSecundario');
	if (!modalEl) return;

	const filtroInput        = document.getElementById('filtroCnaeSecundario');
	const listaDiv           = document.getElementById('listaCnaesSecundarios');
	const btnInserir         = document.getElementById('btnInserirCnaeSecundario');
	const btnDesmarcarTodos  = document.getElementById('btnDesmarcarTodosCnaeSecundario');
	const campoDestino       = document.getElementById('cnaeSecundarios');
	const overlay            = document.getElementById('cnae-loading-overlay');
	const limiteInfo        = document.getElementById('limiteCnaesSecundarios');

	let listaCnaes = [];
	let baseListaCnaes = [];
	let debounceTimer = null;
	let carregando = false;
	// seleção persistente (codigo -> nome)
	const selecionadosMap = new Map();
	const LIMITE = 99;

	function parseCampoDestinoInicial(){
		// lê valor existente no campo e popula selecionadosMap
		const v = (campoDestino?.value || '').trim();
		if (!v) return;
		v.split(',').map(s => s.trim()).forEach(item => {
			if (!item) return;
			const [cod, nome] = item.split(' - ');
			const codigo = (cod || '').trim();
			const nomeVal = (nome || '').trim();
			if (codigo) selecionadosMap.set(codigo, nomeVal || '');
		});
	}

	function atualizarLimiteInfo(){
		if (!limiteInfo) return;
		const qtd = selecionadosMap.size;
		const restante = Math.max(0, LIMITE - qtd);
		limiteInfo.textContent = `${qtd}/${LIMITE} selecionados${restante===0 ? ' (limite atingido)' : ''}`;
		limiteInfo.classList.toggle('text-danger', restante===0);
	}

	function normaliza(raw){
		const out = [];
		function mapOne(n){
			if(!n) return null;
			const codigo = String(n.codigo ?? n.cod ?? n.code ?? n.CNAE ?? n.cnae ?? '').trim();
			const nomeRaw = (n.nome ?? n.descricao ?? n['descrição'] ?? n.DESCRICAO ?? n.descricao_cnae ?? n.descricaoCnae ?? n.descricaoCNAE ?? n.desc ?? n.text ?? n.title ?? n.titulo ?? n.label);
			const nome = String(nomeRaw || '').trim();
			if(!codigo) return null;
			return { codigo, nome };
		}
		function walk(obj){ if(!obj) return; if(Array.isArray(obj)) obj.forEach(x=>{ const m=mapOne(x); if(m) out.push(m); }); else if(typeof obj === 'object'){ if(Array.isArray(obj.cnaes)) walk(obj.cnaes); else Object.values(obj).forEach(walk); } }
		walk(raw);
		const seen = new Set(), dedup = [];
		for(const it of out){ if(!it) continue; if(seen.has(it.codigo)) continue; seen.add(it.codigo); dedup.push(it); }
		const toNum = c => parseInt(String(c).replace(/\D/g,''),10)||0;
		dedup.sort((a,b)=>toNum(a.codigo)-toNum(b.codigo));
		return dedup;
	}

		function renderLista(filtro = '') {
			const filtroLower = filtro.toLowerCase();
			const itens = listaCnaes.filter(c => !filtroLower || c.codigo.toLowerCase().includes(filtroLower) || c.nome.toLowerCase().includes(filtroLower));
			let targetUl = document.getElementById('listaCnaesSecundariosUL');
			if (!targetUl) {
				// cria o UL se não existir (mantém cabeçalho)
				const wrapper = document.getElementById('listaCnaesSecundarios');
				if (wrapper) {
					const ul = document.createElement('ul');
					ul.id = 'listaCnaesSecundariosUL';
					ul.className = 'cnae-list';
					wrapper.appendChild(ul);
					targetUl = ul;
				}
			}
			if (!targetUl) return;
			if (!itens.length) {
				targetUl.innerHTML = `<li class="list-group-item" style="padding:.45rem .75rem; border:0; color:#6c757d;">Nenhum CNAE encontrado.</li>`;
				return;
			}
            targetUl.innerHTML = itens.map(c => {
				const id = `chkCnae_${c.codigo.replace(/[^a-zA-Z0-9]/g,'_')}`;
				const nome = (c.nome || '(sem descrição)').trim();
				return `
					<li class="list-group-item d-grid" style="grid-template-columns:72px 110px 1fr; column-gap:12px; align-items:center; border:0; border-bottom:1px solid var(--bs-gray-200); padding:.5rem .75rem;">
						<div class="text-center">
							<input class="form-check-input" type="checkbox" id="${id}" value="${c.codigo}" data-nome="${nome.replace(/"/g,'&quot;')}">
						</div>
						<div class="text-center" style="white-space:nowrap;">${c.codigo}</div>
						  <label class="form-check-label col-desc" for="${id}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#1e293b;" title="${nome}">${nome}</label>
					</li>`;
			}).join('');

			// marca checados conforme seleção persistente
			targetUl.querySelectorAll('input[type="checkbox"]').forEach(chk => {
				chk.checked = selecionadosMap.has(chk.value);
			});

			// listeners de mudança dentro da lista (delegados por performance)
			if (!targetUl.dataset.bound) {
			targetUl.addEventListener('change', (ev) => {
				const t = ev.target;
				if (!(t && t.matches && t.matches('input[type="checkbox"]'))) return;
				const codigo = t.value;
				const nome = t.dataset.nome || '';
				if (t.checked) {
					if (selecionadosMap.size >= LIMITE && !selecionadosMap.has(codigo)) {
						// impede exceder o limite
						t.checked = false;
						alert(`É permitido selecionar no máximo ${LIMITE} CNAEs secundários.`);
						return;
					}
					selecionadosMap.set(codigo, nome);
				} else {
					selecionadosMap.delete(codigo);
				}
				atualizarLimiteInfo();
			});
				targetUl.dataset.bound = '1';
			}

			// atualiza contador
			atualizarLimiteInfo();
	}

	async function carregarCnaes() {
		try {
			if (carregando) return;
			carregando = true;
			if (overlay) overlay.style.display = 'flex';
			// na primeira abertura, parse valores existentes do campo
			if (selecionadosMap.size === 0) parseCampoDestinoInicial();
			if (baseListaCnaes.length){
				listaCnaes = baseListaCnaes.slice(0);
				renderLista('');
				return;
			}
			const dados = await fetchGestorData('CNAES_POR_NATUREZA.json');
			if(!dados){
				mostrarErroLista();
				return;
			}
			baseListaCnaes = normaliza(dados);
			listaCnaes = baseListaCnaes.slice(0);
			if (!window.__CNAE_SEC_DEBUG_ONCE){
				console.debug('[cnae_secundario] carregado itens:', listaCnaes.length, 'exemplo:', listaCnaes.slice(0,3));
				window.__CNAE_SEC_DEBUG_ONCE = true;
			}
			renderLista('');
		} catch (err) {
			console.error('Erro ao carregar CNAEs:', err);
			mostrarErroLista();
		} finally {
			if (overlay) overlay.style.display = 'none';
			carregando = false;
		}
	}

	async function fetchGestorData(nome){ const r=await window.wdgFetchGestorJson?.(nome); return r&&r.ok? r.data:null; }

	function mostrarErroLista(){
		let targetUl = document.getElementById('listaCnaesSecundariosUL');
		if (!targetUl){
			const wrapper = document.getElementById('listaCnaesSecundarios');
			if (wrapper){
				targetUl = document.createElement('ul');
				targetUl.id = 'listaCnaesSecundariosUL';
				targetUl.className = 'cnae-list';
				wrapper.appendChild(targetUl);
			}
		}
		if (targetUl){
			targetUl.innerHTML = `<li class="list-group-item" style="padding:.45rem .75rem; border:0; color:#dc3545;">Falha ao carregar CNAEs.</li>`;
		}
	}

	function getNaturezaCodigo(){
		const el = document.getElementById('naturezaJuridica');
		if (!el) return '';
		const v = (el.value || el.textContent || '').trim();
		if (!v) return '';
		const i = v.indexOf(' - ');
		return (i > -1 ? v.slice(0, i) : v).trim();
	}

	async function buscarApiCnaes(search){
		try{
			const natureza = getNaturezaCodigo();
			const params = new URLSearchParams();
			if (search) params.set('search', search);
			if (natureza) params.set('natureza', natureza);
			params.set('limit', '300');
			const url = `/cnaes?${params.toString()}`;
			const res = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
			if (!res.ok) throw new Error('HTTP '+res.status);
			const body = await res.json();
			const data = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);
			return normaliza(data);
		}catch(err){
			console.warn('[cnae_secundario] busca API falhou, usando fallback local:', err.message || err);
			return null;
		}
	}

	if (filtroInput) {
		filtroInput.addEventListener('input', e => {
			const q = (e.target.value || '').trim();
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(async () => {
				if (q.length >= 2){
					const api = await buscarApiCnaes(q);
					if (api && api.length){
						listaCnaes = api;
						renderLista('');
						return;
					}
				}
				listaCnaes = baseListaCnaes.length ? baseListaCnaes.slice(0) : listaCnaes;
				renderLista(q);
			}, 250);
		});
	}

	if (btnInserir) {
		btnInserir.addEventListener('click', () => {
			// usa seleção persistente (mantém itens escolhidos em diferentes filtros)
			const selecionados = Array.from(selecionadosMap.entries()).map(([codigo, nome]) => `${codigo} - ${nome || ''}`.trim());
			if (campoDestino) {
				campoDestino.value = selecionados.join(', ');
				campoDestino.dispatchEvent(new Event('change', { bubbles: true }));
			}
			const modal = bootstrap.Modal.getInstance(modalEl);
			if (modal) modal.hide();
		});
	}

	if (btnDesmarcarTodos) {
		btnDesmarcarTodos.addEventListener('click', () => {
			const ul = document.getElementById('listaCnaesSecundariosUL');
			if (ul) {
				ul.querySelectorAll('input[type="checkbox"]:checked').forEach(chk => chk.checked = false);
			}
			// limpa seleção global
			selecionadosMap.clear();
			atualizarLimiteInfo();
		});
	}

	const abrirBtn = document.getElementById('btnPesquisarCnaeSecundario');
	if (abrirBtn) {
		abrirBtn.addEventListener('click', () => {
			const inst = bootstrap.Modal.getOrCreateInstance(modalEl);
			inst.show();
		});
	}
	modalEl.addEventListener('show.bs.modal', carregarCnaes);
		// Pré-carregar de forma resiliente (caso o evento de show não dispare por algum motivo)
		carregarCnaes();
		// inicializa contador na carga
		atualizarLimiteInfo();
});
