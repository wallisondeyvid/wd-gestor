// Migrado de public/js/modals/funcionario_detalhes.js
(function () { 'use strict';
	// Guard global removido, pois upload agora é manual
	const FALLBACK_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"> <rect width="96" height="96" rx="12" fill="#f1f5f9"/> <circle cx="48" cy="36" r="18" fill="#cbd5e1"/> <rect x="20" y="60" width="56" height="20" rx="10" fill="#cbd5e1"/> </svg>`);

	// Estado para preview de foto
	let currentFile = null;
	let originalSrc = '';
	let currentFuncId = null;

	// Helpers
	function getModalEl(){ return document.getElementById('modalFuncionarioDetalhes'); }
	function isFallbackSrc(src){ return !src || String(src).startsWith('data:image/svg+xml'); }
	function resetBackdrops() { document.querySelectorAll('.modal-backdrop').forEach(el => el.remove()); document.body.classList.remove('modal-open'); document.body.style.overflow = ''; document.body.style.paddingRight = ''; }
	const get = (obj, path) => !obj || !path ? '' : String(path.split('.').reduce((o, k) => (o && o[k]) ?? undefined, obj) ?? '');
	function toBrDate(v) { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return v; const dd = String(d.getDate()).padStart(2, '0'); const mm = String(d.getMonth() + 1).padStart(2, '0'); return `${dd}/${mm}/${d.getFullYear()}`; }
	function formatCPF(v) { const s = String(v || '').replace(/\D/g, '').padStart(11, '0').slice(-11); return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
	function formatMoneyBR(v) { if (v === null || v === undefined || v === '') return ''; const n = typeof v === 'number' ? v : Number(String(v).toString().replace(',', '.')); if (!Number.isFinite(n)) return String(v); return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
	function mapSexo(s) { const m = { F: 'Feminino', M: 'Masculino', N: 'Não informado' }; return m[s] || s || ''; }
	function formatEndereco(end) { if (!end || typeof end !== 'object') return ''; const p = (k) => (end[k] ? String(end[k]) : ''); const ped = [[p('tipo_logradouro'), p('logradouro')].filter(Boolean).join(' '), p('numero'), p('complemento')].filter(Boolean).join(', '); const bairroCidade = [p('bairro'), [p('cidade'), p('estado')].filter(Boolean).join(' - ')].filter(Boolean).join(' • '); const cep = p('cep') ? `CEP: ${p('cep')}` : ''; const ibge = p('codigo_ibge') ? `IBGE: ${p('codigo_ibge')}` : ''; return [ped, bairroCidade, [cep, ibge].filter(Boolean).join(' • ')].filter(Boolean).join(' — '); }
	function basePath(){ const b=document.body.getAttribute('data-base-path')||'/gestor'; return b.endsWith('/')? b.slice(0,-1):b; }
	async function fetchFuncionarioById(id) { const bp=basePath(); async function tryUrl(u) { try { const r = await fetch(u, { headers: { Accept: 'application/json' } }); if (!r.ok) return null; const j = await r.json(); return j.funcionario || j.data || j; } catch { return null; } } return (await tryUrl(`${bp}/api/funcionarios/${id}`)) || (await tryUrl(`${bp}/api/funcionarios/${id}/detalhes`)) || (await tryUrl(`${bp}/funcionarios/${id}.json`)) || Promise.reject(new Error('Nenhum endpoint respondeu')); }

	// Guard leve para evitar cliques soltos na área de status
	if (!document.__fdUploadClickGuard){
		const stopper = (ev) => {
			const status = ev.target && ev.target.closest('#detalheFotoStatus');
			if (!status) return;
			if (ev.target.closest('button, a, input, label')) return;
			try { ev.stopPropagation(); } catch(_){ }
			try { ev.stopImmediatePropagation(); } catch(_){ }
			try { ev.preventDefault(); } catch(_){ }
		};
		['click','pointerdown','mousedown','mouseup'].forEach(evt=>{
			document.addEventListener(evt, stopper, true);
		});
		document.__fdUploadClickGuard = true;
	}

	function setStatusButtons(hasFoto){
		const statusEl = document.getElementById('detalheFotoStatus');
		if (!statusEl) return;
		if (hasFoto) {
			statusEl.innerHTML = `
				<span class="badge bg-success me-2">Foto cadastrada</span>
				<button type="button" class="btn btn-sm btn-outline-primary me-1" id="btnAlterarFoto">Alterar</button>
				<button type="button" class="btn btn-sm btn-outline-danger" id="btnRemoverFoto">Remover</button>
			`;
		} else {
			statusEl.innerHTML = `
				<span class="badge bg-secondary me-2">Sem foto</span>
				<button type="button" class="btn btn-sm btn-outline-primary" id="btnAdicionarFoto">Adicionar</button>
			`;
		}
	}

	function triggerFileSelect(){
		const inputEl = document.getElementById('fdFileInput');
		if (!inputEl) return;
		inputEl.value = '';
		inputEl.click();
	}

	function render(data) {
		const modal = getModalEl();
		if (!modal) return;

		const img = modal.querySelector('#detalheFoto');
		console.log('[MODAL DETALHES] Elemento img encontrado:', !!img);

		let rawFoto = data.foto_url_api || data.foto || data.foto_url || data.extra_foto_url || '';
		const hasFoto = !!(data.foto || data.foto_url || data.extra_foto_url);
		if (rawFoto && typeof rawFoto === 'object') rawFoto = rawFoto.url || rawFoto.caminho || '';
		if (typeof window.buildFotoUrl !== 'function') {
			window.buildFotoUrl = function(caminho){
				if(!caminho) return '';
				let c = String(caminho).trim();
				c = c.replace(/^public\//,'');
				if (/^(?:data:|https?:)/i.test(c)) return c;
				c = c.replace(/^\//,'');
				return '/' + c;
			};
			console.log('[MODAL DETALHES] buildFotoUrl inline definido (fallback).');
		}

		let src = FALLBACK_AVATAR;
		if (data && data._id) {
			const apiFoto = `${basePath()}/api/funcionarios/${data._id}/foto`;
			src = apiFoto + `?cb=${Date.now()}`;
		} else if (rawFoto) {
			if (/\/api\/funcionarios\/.+\/foto(\?.*)?$/i.test(String(rawFoto))) {
				const sep = String(rawFoto).includes('?') ? '&' : '?';
				src = String(rawFoto) + sep + 'cb=' + Date.now();
			} else {
				src = window.buildFotoUrl(rawFoto);
			}
		}
		console.log('[MODAL DETALHES] Foto data:', { rawFoto, finalSrc: src });
		if (!src) src = FALLBACK_AVATAR;
		console.log('[MODAL DETALHES] Foto final src:', src);
		originalSrc = src;
		currentFuncId = data._id;
		if (img) {
			img.src = src;
			img.onerror = () => { img.src = FALLBACK_AVATAR; };
		}

		setStatusButtons(hasFoto);

		// Campos de texto
		modal.querySelectorAll('[data-field]')?.forEach(el => {
			const path = el.getAttribute('data-field');
			let v = get(data, path);
			if (['data_nascimento','data_admissao','data_termino','rg_data_expedicao','fgts_data','cert_militar_data','cnh_validade','data_chegada_brasil','updatedAt','createdAt'].includes(path)) v = v ? toBrDate(v) : '';
			if (path === 'cpf' && v) v = formatCPF(v);
			if (path === 'salario_base' && v !== undefined && v !== null && v !== '') v = formatMoneyBR(v);
			if (path === 'sexo' && v) v = mapSexo(v);
			if (path === 'fgts_optante' && v) { const fgtsMap = { '1': 'Optante pelo FGTS', '2': 'Não optante pelo FGTS', '3': 'Não optante – trabalhador com idade igual ou superior a 70 anos' }; v = fgtsMap[v] || v; }
			el.textContent = v || '—';
		});

		// Endereço
		const detEnd = modal.querySelector('#det_endereco');
		if (detEnd) detEnd.textContent = formatEndereco(data.endereco) || '—';

		// Dependentes
		const depTbody = modal.querySelector('#listaDependentes');
		if (depTbody) {
			const deps = Array.isArray(data.dependentes) ? data.dependentes : [];
			depTbody.innerHTML = deps.length ? deps.map(d => {
				const nome = d.nome || '—';
				const cpf = d.cpf ? formatCPF(d.cpf) : '—';
				const par = d.parentesco || '—';
				const nasc = d.data_nascimento ? toBrDate(d.data_nascimento) : '—';
				const obs = d.observacoes || d.obs || '—';
				return `<tr><td>${nome}</td><td>${cpf}</td><td>${par}</td><td>${nasc}</td><td>${obs}</td></tr>`;
			}).join('') : `<tr><td colspan="5" class="text-muted">—</td></tr>`;
		}

		// Benefícios
		const benTbody = modal.querySelector('#listaBeneficios');
		if (benTbody) {
			const bens = Array.isArray(data.beneficios) ? data.beneficios : [];
			benTbody.innerHTML = bens.length ? bens.map(b => {
				const tipo = b.tipo || '—';
				const desc = b.nome || b.descricao || '—';
				const valor = (b.valor !== undefined && b.valor !== null && b.valor !== '') ? formatMoneyBR(b.valor) : '—';
				const inicio = b.inicio ? (String(b.inicio).toLowerCase() === 'admissão' || String(b.inicio).toLowerCase() === 'admissao' ? 'Admissão' : 'Outra data') : '—';
				const dataIni = b.data_inicio ? toBrDate(b.data_inicio) : (inicio === 'Admissão' ? '' : '—');
				return `<tr><td>${tipo}</td><td>${desc}</td><td>${valor}</td><td>${inicio}</td><td>${dataIni}</td></tr>`;
			}).join('') : `<tr><td colspan="5" class="text-muted">—</td></tr>`;
		}

		// Anexos
		(function(){
			const listEl = modal.querySelector('#detalheAnexosList');
			const vazioEl = modal.querySelector('#detalheAnexosVazio');
			if(!listEl) return;
			const anexos = Array.isArray(data.anexos)? data.anexos : [];
			if(!anexos.length){ listEl.innerHTML=''; if(vazioEl) vazioEl.style.display='block'; return; }
			if(vazioEl) vazioEl.style.display='none';
			function iconFor(mime){ if(!mime) return 'bi-file-earmark'; if(mime.startsWith('image/')) return 'bi-file-earmark-image'; if(mime==='application/pdf') return 'bi-file-earmark-pdf'; if(/spreadsheet|excel/.test(mime)) return 'bi-file-earmark-excel'; if(/word/.test(mime)) return 'bi-file-earmark-word'; if(/powerpoint/.test(mime)) return 'bi-file-earmark-ppt'; if(mime.startsWith('text/')) return 'bi-file-earmark-text'; return 'bi-file-earmark'; }
			function formatSize(bytes){ if(!bytes && bytes!==0) return ''; if(bytes < 1024) return bytes+' B'; if(bytes < 1024*1024) return (bytes/1024).toFixed(1)+' KB'; return (bytes/1024/1024).toFixed(1)+' MB'; }
			listEl.innerHTML = anexos.map((a,i)=>{
				const nome = a.nome || 'arquivo';
				const caminho = a.caminho || '';
				let href = '';
				if(caminho){ if(/^uploads\//.test(caminho)) href = caminho.replace(/^/,'/'); if(data._id) href = `${basePath()}/api/funcionarios/${data._id}/anexo/${i}`; }
				const mime = a.mime || '';
				const ic = iconFor(mime);
				const tam = formatSize(a.tamanho);
				return `<li class="list-group-item d-flex justify-content-between align-items-center gap-2">
					<span class="d-inline-flex align-items-center gap-2 flex-grow-1 text-truncate">
						<i class="bi ${ic} text-primary"></i>
						<span class="text-truncate" title="${nome}">${nome}</span>
						<small class="text-muted">${tam}</small>
					</span>
					<a class="btn btn-sm btn-outline-secondary" href="${href}" target="_blank" rel="noopener" title="Abrir / Download"><i class="bi bi-box-arrow-up-right"></i></a>
				</li>`;
			}).join('');
		})();
	}

	async function openDetalhes(id) {
		const modalEl = getModalEl();
		if (!modalEl) return;
		if (modalEl.parentNode !== document.body) document.body.appendChild(modalEl);
		resetBackdrops();
		render({ nome: 'Carregando…' });
		const bs = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: false, focus: false });
		if (!modalEl.classList.contains('show')) bs.show();
		try {
			console.log('[MODAL DETALHES] Buscando dados para ID:', id);
			const data = await fetchFuncionarioById(id);
			console.log('[MODAL DETALHES] Dados recebidos:', data);
			render(data);
		} catch (e) {
			console.error('[MODAL DETALHES] Falha ao carregar dados do funcionário:', e);
			try { const warn = modalEl.querySelector('#detalheFotoStatus'); if (warn) warn.innerHTML = '<span class="badge bg-danger">Falha ao carregar dados</span>'; } catch {}
		}
	}

	// Delegação ampla garante funcionamento mesmo com mudanças de container/tabela
	document.addEventListener('click', (ev) => {
		const btn = ev.target.closest('.btn-detalhes-func');
		if (!btn) return;
		const id = btn.dataset.funcId || btn.dataset.id || btn.closest('tr')?.getAttribute('data-func-id');
		if (!id) {
			console.warn('[MODAL DETALHES] Clique em detalhes sem ID associado');
			return;
		}
		openDetalhes(id);
	});

	// Delegação global para os botões do status
	document.body.addEventListener('click', async (ev) => {
		const add = ev.target && ev.target.closest('#btnAdicionarFoto');
		const alt = ev.target && ev.target.closest('#btnAlterarFoto');
		const rem = ev.target && ev.target.closest('#btnRemoverFoto');
		const salvar = ev.target && ev.target.closest('#btnSalvarFoto');
		const cancelar = ev.target && ev.target.closest('#btnCancelarFoto');
		if (!(add||alt||rem||salvar||cancelar)) return;
		if (add || alt) {
			triggerFileSelect();
			return;
		}
		if (rem) {
			try {
				const resp = await fetch(`${basePath()}/api/funcionarios/${currentFuncId}/incremental`, { method: 'PUT', body: new URLSearchParams({ excluir_foto: 'true' }), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' } });
				if (!resp.ok) throw new Error(`Erro ${resp.status}`);
				const modal = getModalEl();
				const img = modal?.querySelector('#detalheFoto');
				if (img) img.src = FALLBACK_AVATAR;
				originalSrc = FALLBACK_AVATAR;
				setStatusButtons(false);
			} catch (err) {
				alert('Erro ao remover foto: ' + err.message);
			}
			return;
		}
		if (cancelar) {
			const modal = getModalEl();
			const img = modal?.querySelector('#detalheFoto');
			if (img) img.src = originalSrc;
			currentFile = null;
			setStatusButtons(!isFallbackSrc(originalSrc));
			return;
		}
		if (salvar) {
			console.log('[MODAL DETALHES] Clique em Salvar Foto — arquivo presente?', !!currentFile, 'funcId=', currentFuncId);
			if (!currentFile) { alert('Nenhum arquivo selecionado.'); return; }
			try {
				const fd = new FormData();
				fd.append('foto', currentFile, currentFile.name || 'foto.jpg');
				const url = `${basePath()}/api/funcionarios/${currentFuncId}/incremental`;
				const resp = await fetch(url, { method: 'PUT', body: fd, headers: { 'Accept': 'application/json' } });
				if (!resp.ok) { const txt = await resp.text().catch(()=> 'Erro ao enviar'); throw new Error(`Falha no upload (${resp.status}): ${txt}`); }
				const modal = getModalEl();
				const img = modal?.querySelector('#detalheFoto');
				const previewUrl = `${basePath()}/api/funcionarios/${currentFuncId}/foto?cb=${Date.now()}`;
				if (img) img.src = previewUrl;
				originalSrc = previewUrl;
				currentFile = null;
				setStatusButtons(true);
				console.log('[MODAL DETALHES] Foto salva com sucesso.');
			} catch (err) {
				console.error('[MODAL DETALHES] Erro ao salvar foto:', err);
				alert('Não foi possível salvar a foto: ' + err.message);
			}
		}
	});

	// Delegação para mudança no input file (robusta mesmo se o input for recriado)
	document.body.addEventListener('change', (ev) => {
		const input = ev.target && ev.target.closest('#fdFileInput');
		if (!input) return;
		const file = input.files && input.files[0];
		console.log('[MODAL DETALHES] File input change — selecionado:', !!file, file ? file.name : 'nenhum');
		if (!file) return;
		currentFile = file;
		const modal = getModalEl();
		const img = modal ? modal.querySelector('#detalheFoto') : null;
		if (img) {
			try { if (img.dataset.previewUrl) URL.revokeObjectURL(img.dataset.previewUrl); } catch {}
			const url = URL.createObjectURL(file);
			img.dataset.previewUrl = url;
			img.src = url;
		}
		const statusEl = document.getElementById('detalheFotoStatus');
		if (statusEl) {
			statusEl.innerHTML = `
				<span class="badge bg-warning me-2">Pré-visualização</span>
				<button type="button" class="btn btn-sm btn-success me-1" id="btnSalvarFoto">Salvar Foto</button>
				<button type="button" class="btn btn-sm btn-outline-secondary" id="btnCancelarFoto">Cancelar</button>
			`;
		}
	});

	window.openFuncionarioDetalhes = openDetalhes;
})();
