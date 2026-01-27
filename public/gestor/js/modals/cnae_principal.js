// public/gestor/js/modals/cnae_principal.js (padronizado com secundário)
document.addEventListener('DOMContentLoaded', () => {
	const modalEl       = document.getElementById('modalCnaePrincipal');
	if (!modalEl) return;

	const filtroInput   = document.getElementById('filtroCnaePrincipal');
	const ulLista       = document.getElementById('listaCnaePrincipalList'); // <ul>
	const campoDestino  = document.getElementById('cnaePrincipal');

	const btnConfirmar  = document.getElementById('btnConfirmarCnaePrincipal') ||
												document.getElementById('btnInserirCnaePrincipal');
	const btnLimpar     = document.getElementById('btnLimparCnaePrincipal');

	let listaCnaes = [];         // [{ codigo, nome }]
		let baseListaCnaes = [];     // cache do JSON estático completo
	let filtroAtual = '';
		let debounceTimer = null;
		let lastApiQuery = { q: '', nat: '' };

	// Helpers
	const esc  = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
	const norm = s => String(s || '').replace(/\D+/g, '');

	function normaliza(raw){
		const out = [];
		function mapOne(n){
			if (!n) return null;
			const codigo = (n.codigo ?? n.cod ?? n.code ?? n.CNAE ?? n.cnae ?? n.id ?? n.value);
			const descRaw = (n.nome ?? n.descricao ?? n['descrição'] ?? n.DESCRICAO ?? n.descricao_cnae ?? n.descricaoCnae ?? n.descricaoCNAE ?? n.desc ?? n.text ?? n.title ?? n.titulo ?? n.label);
			const c = String(codigo ?? '').trim();
			const d = String(descRaw ?? '').trim();
			if (!c) return null;
			return { codigo: c, nome: d };
		}
		function walk(v){
			if (!v) return;
			if (Array.isArray(v)) { v.forEach(x => { const m = mapOne(x); if (m) out.push(m); }); return; }
			if (typeof v === 'object'){
				if (Array.isArray(v.cnaes))  return walk(v.cnaes);
				if (Array.isArray(v.items))  return walk(v.items);
				if (Array.isArray(v.values)) return walk(v.values);
				Object.values(v).forEach(walk);
			}
		}
		walk(raw);
		// dedup e ordenação
		const seen = new Set();
		const dedup = [];
		for (const it of out){ if (!it) continue; if (seen.has(it.codigo)) continue; seen.add(it.codigo); dedup.push(it); }
		const toNum = s => parseInt(String(s).replace(/\D/g,''),10) || 0;
		dedup.sort((a,b)=> toNum(a.codigo) - toNum(b.codigo));
		return dedup;
	}

	function codigoAtualDoCampo(){
		const ds = campoDestino?.dataset?.cnaeCodigo;
		if (ds) return ds.trim();
		const v = (campoDestino?.value || '').trim();
		if (!v) return '';
		const i = v.indexOf(' - ');
		if (i > -1) return v.slice(0, i).trim();
		const m = v.match(/\d{4}-\d\/\d{2}/);
		return (m ? m[0] : v.split(/\s+/)[0]).trim();
	}

	function renderLista(filtro = ''){
		filtroAtual = filtro || '';
		if (!ulLista) return;

		const t = filtroAtual.toLowerCase();
		const itens = listaCnaes.filter(c => !t || c.codigo.toLowerCase().includes(t) || c.nome.toLowerCase().includes(t));

		if (!itens.length){
			ulLista.innerHTML = `<li class="list-group-item" style="padding:.55rem .75rem;border:0;color:#6c757d;">Nenhum CNAE encontrado.</li>`;
			return;
		}

			ulLista.innerHTML = itens.map(c => {
				const id = `rbCnae_${c.codigo.replace(/[^a-zA-Z0-9]/g,'_')}`;
				const nome = (c.nome || c.descricao || c.DESCRICAO || '').trim();
				const nomeDisplay = nome || '(sem descrição)';
				return `
					<li class="list-group-item d-grid" style="grid-template-columns:72px 110px 1fr; column-gap:12px; align-items:center; border:0; border-bottom:1px solid var(--bs-gray-200); padding:.5rem .75rem;">
						<div class="text-center">
							<input class="form-check-input" type="radio" name="cnaePrincipalSel" id="${id}" value="${esc(c.codigo)}" data-nome="${esc(nomeDisplay)}">
						</div>
						<div class="text-center" style="white-space:nowrap;">${esc(c.codigo)}</div>
						<label class="form-check-label col-desc" for="${id}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#1e293b;" title="${esc(nomeDisplay)}">${esc(nomeDisplay)}</label>
					</li>`;
			}).join('');

		preSelecionar();
	}

	function preSelecionar(){
		const wanted = codigoAtualDoCampo();
		if (!wanted) return;
		const target = Array.from(ulLista.querySelectorAll('input[name="cnaePrincipalSel"]'))
			.find(r => norm(r.value) === norm(wanted));
		if (!target){
			if (filtroAtual){
				filtroAtual = '';
				if (filtroInput) filtroInput.value = '';
				renderLista('');
			}
			return;
		}
		target.checked = true;
		ulLista.querySelectorAll('.item-grid').forEach(n => n.classList.remove('is-selected'));
		const row = target.closest('.item-grid');
		if (row){
			row.classList.add('is-selected');
			row.scrollIntoView({ block: 'center' });
		}
	}

	async function carregarCnaes(){
		if (baseListaCnaes.length){
			listaCnaes = baseListaCnaes.slice(0);
			renderLista(filtroAtual);
			return;
		}
		const dados = await fetchGestorData('CNAES_POR_NATUREZA.json');
		if (!dados){
			ulLista.innerHTML = `<li class="list-group-item text-danger">Falha ao carregar CNAEs.</li>`;
			return;
		}
		baseListaCnaes = normaliza(dados);
		listaCnaes = baseListaCnaes.slice(0);
		renderLista('');
	}

	async function fetchGestorData(nome){ const r=await window.wdgFetchGestorJson?.(nome); return r&&r.ok ? r.data : null; }

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
				params.set('limit', '200');
				const url = `/cnaes?${params.toString()}`;
				lastApiQuery = { q: search, nat: natureza };
				const res = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
				if (!res.ok) throw new Error('HTTP '+res.status);
				const body = await res.json();
				const data = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);
				return normaliza(data);
			}catch(err){
				console.warn('[cnae_principal] busca API falhou, usando fallback local:', err.message || err);
				return null;
			}
		}

		// Eventos com debounce e fallback API
		filtroInput?.addEventListener('input', e => {
			const q = (e.target.value || '').trim();
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(async () => {
				if (q.length >= 2){
					const api = await buscarApiCnaes(q);
					if (api && api.length){
						listaCnaes = api;
						renderLista(''); // já vem filtrado pela API
						return;
					}
				}
				// fallback: usa cache local e filtra no cliente
				listaCnaes = baseListaCnaes.length ? baseListaCnaes.slice(0) : listaCnaes;
				renderLista(q);
			}, 250);
		});

	btnConfirmar?.addEventListener('click', () => {
		const marcado = ulLista.querySelector('input[name="cnaePrincipalSel"]:checked');
		if (!marcado){ alert('Selecione um CNAE.'); return; }
		const codigo = (marcado.value || '').trim();
		const nome   = (marcado.dataset.nome || '').trim();
		campoDestino.value = `${codigo} - ${nome}`;
		campoDestino.dataset.cnaeCodigo = codigo;    // guarda para pré-seleção futura
		campoDestino.dispatchEvent(new Event('change', { bubbles: true }));
		bootstrap.Modal.getInstance(modalEl)?.hide();
	});

	btnLimpar?.addEventListener('click', () => {
		campoDestino.value = '';
		delete campoDestino.dataset.cnaeCodigo;
		campoDestino.dispatchEvent(new Event('change', { bubbles: true }));
		ulLista.querySelectorAll('input[name="cnaePrincipalSel"]').forEach(r => r.checked = false);
		ulLista.querySelectorAll('.item-grid').forEach(n => n.classList.remove('is-selected'));
	});

	modalEl.addEventListener('show.bs.modal', async () => {
		await carregarCnaes();
		if (filtroInput && filtroInput.value) renderLista(filtroInput.value);
		setTimeout(() => filtroInput?.focus(), 60);
	});
});
