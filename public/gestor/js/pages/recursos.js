/* =========================================================================
 * RECURSOS — Cópia íntegra de public/js/recursos.js
 * ========================================================================= */
console.debug('[recursos.js] carregado');

document.addEventListener('DOMContentLoaded', () => {

	// Detectar basePath (mesma lógica usada em outras partes)
	const basePath = (window.__perfilBasePath || (document.querySelector('script[data-base-path]')?.getAttribute('data-base-path')) || (window.basePath) || '/gestor').replace(/\/$/,'');
	const byId = (id) => document.getElementById(id);

	function normalizeText(v){
		return String(v ?? '').replace(/\s+/g, ' ').trim();
	}

	function askDeleteRecursoConfirm(label){
		const modalEl = byId('rDeleteConfirmModal');
		const labelEl = byId('rDeleteConfirmLabel');
		const yesBtn = byId('rDeleteConfirmYes');

		const safeLabel = normalizeText(label) || 'selecionado';

		// fallback se Bootstrap/modal não estiver disponível
		if (!modalEl || !yesBtn || !(window.bootstrap && window.bootstrap.Modal)){
			return Promise.resolve(window.confirm(`Deseja excluir o recurso ${safeLabel}? Esta exclusão é definitiva e não pode ser desfeita.`));
		}

		if (labelEl) labelEl.textContent = safeLabel;

		return new Promise((resolve) => {
			let resolved = false;
			const bs = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: true, keyboard: true, focus: true });

			const onHidden = () => {
				if (resolved) return;
				resolved = true;
				resolve(false);
			};

			const onYes = (e) => {
				try { e?.preventDefault?.(); } catch { /* noop */ }
				if (resolved) return;
				resolved = true;
				resolve(true);
				try { bs.hide(); } catch { /* noop */ }
			};

			modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
			yesBtn.addEventListener('click', onYes, { once: true });
			bs.show();
		});
	}

	// Máscara para placa
	const initPlacaMask = () => {
		const placaEl = byId('placa');
		if (!placaEl) return;

		placaEl.addEventListener('input', (e) => {
			let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
			if (value.length <= 3) {
				value = value;
			} else if (value.length <= 7) {
				value = value.slice(0, 3) + '-' + value.slice(3);
			} else {
				value = value.slice(0, 3) + '-' + value.slice(3, 7);
			}
			e.target.value = value;
		});

		placaEl.addEventListener('blur', (e) => {
			const value = e.target.value;
			// Regex para formato antigo (ABC-1234) ou Mercosul (ABC-1D34)
			const placaRegexAntiga = /^[A-Z]{3}-[0-9]{4}$/;
			const placaRegexMercosul = /^[A-Z]{3}-[0-9][A-Z][0-9]{2}$/;
			if (value && !placaRegexAntiga.test(value) && !placaRegexMercosul.test(value)) {
				e.target.setCustomValidity('Formato de placa inválido. Use ABC-1234 ou ABC-1D34');
				e.target.classList.add('is-invalid');
			} else {
				e.target.setCustomValidity('');
				e.target.classList.remove('is-invalid');
			}
		});
	};

	// Máscara para chassi (17 caracteres alfanuméricos)
	const initChassiMask = () => {
		const chassiEl = byId('chassi');
		if (!chassiEl) return;

		chassiEl.addEventListener('input', (e) => {
			e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
		});
	};

	// Máscara para RENAVAM (11 dígitos)
	const initRenavamMask = () => {
		const renavamEl = byId('renavam');
		if (!renavamEl) return;

		renavamEl.addEventListener('input', (e) => {
			e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
		});
	};

	// Inicializar máscaras
	initPlacaMask();
	initChassiMask();
	initRenavamMask();

	// Validação do formulário
	const form = byId('formNovoRecurso');
	if (form) {
		form.addEventListener('submit', async (e) => {
			e.preventDefault();

			if (!form.checkValidity()) {
				e.stopPropagation();
				form.classList.add('was-validated');
				return;
			}

			const formData = new FormData(form);
			const data = Object.fromEntries(formData.entries());

			// Garantir que os campos sejam enviados corretamente
			const processedData = {
				unidade_id: data.unidade_id,
				tipo: data.tipo,
				placa: data.placa,
				chassi: data.chassi,
				renavam: data.renavam,
				ano: data.ano ? parseInt(data.ano) : null,
				mod: data.mod ? parseInt(data.mod) : null,
				marca: data.marca,
				modelo: data.modelo,
				cor: data.cor
			};

			// Verificar se todos os campos obrigatórios estão preenchidos
			const requiredFields = ['unidade_id', 'tipo', 'placa', 'chassi', 'renavam', 'ano', 'mod', 'marca', 'modelo', 'cor'];
			const missingFields = requiredFields.filter(field => !processedData[field]);

			if (missingFields.length > 0) {
				alert('Campos obrigatórios não preenchidos: ' + missingFields.join(', '));
				return;
			}

			// Debug: verificar se os campos estão sendo enviados
			console.log('Dados do formulário:', processedData);

			try {
				// Determinar se é criação ou atualização
				const recursoId = byId('recursoId').value;
				const isUpdate = !!recursoId;

				const response = await fetch(isUpdate ? `${basePath}/api/recursos/${recursoId}` : `${basePath}/api/recursos`, {
					method: isUpdate ? 'PUT' : 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
						body: JSON.stringify(processedData)
				});

				if (response.ok) {
					const message = isUpdate ? 'Recurso atualizado com sucesso!' : 'Recurso cadastrado com sucesso!';
					alert(message);

					// Resetar formulário sempre (criação ou atualização)
					form.reset();
					form.classList.remove('was-validated');
					byId('recursoId').value = '';

					// Resetar o botão para modo criação
					const submitBtn = form.querySelector('button[type="submit"]');
					if (submitBtn) {
						submitBtn.textContent = 'Cadastrar Recurso';
					}

					carregarRecursos(); // Recarregar lista
				} else {
					const error = await response.json();
					alert('Erro ao ' + (isUpdate ? 'atualizar' : 'cadastrar') + ' recurso: ' + (error.error || 'Erro desconhecido'));
				}
			} catch (error) {
				console.error('Erro:', error);
				alert('Erro ao cadastrar recurso. Tente novamente.');
			}
		});
	}

	// Carregar recursos na tabela
	const carregarRecursos = async () => {
		try {
			const response = await fetch(`${basePath}/api/recursos`);
			if (response.ok) {
				const payload = await response.json();
				const recursos = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
				renderizarRecursos(recursos);
			} else {
				console.error('Falha ao carregar recursos: HTTP', response.status);
				renderizarRecursos([]);
			}
		} catch (error) {
			console.error('Erro ao carregar recursos:', error);
		}
	};

	// Renderizar recursos na tabela
	const renderizarRecursos = (recursos) => {
		const tbody = byId('recursosTableBody');
		if (!tbody) return;

		console.debug('[recursos] renderizarRecursos recebidos:', recursos && recursos.length, recursos && recursos[0]);

		if (!Array.isArray(recursos)) {
			console.warn('[recursos] resposta não é array, limpando tabela.');
			tbody.innerHTML = '';
			return;
		}

		tbody.innerHTML = recursos.map(recurso => `
			<tr data-recurso-id="${recurso._id}">
				<td>${recurso.unidade_id?.nome || 'N/A'}</td>
				<td>${recurso.tipo}</td>
				<td>${recurso.placa}</td>
				<td>${recurso.marca}</td>
				<td>${recurso.modelo}</td>
				<td>${recurso.ano}</td>
				<td>${recurso.mod}</td>
				<td>${recurso.cor}</td>
				<td>
					<span class="badge ${recurso.ativo ? 'bg-success' : 'bg-danger'}">
						${recurso.ativo ? 'Ativo' : 'Inativo'}
					</span>
				</td>
				<td class="col-acoes">
					<div class="d-flex gap-1 justify-content-center flex-nowrap">
						<button type="button" class="wdg-icon-btn" data-action="editar" data-id="${recurso._id}" title="Editar" aria-label="Editar">
							<img src="${basePath}/images/editar.png" alt="Editar" onerror="this.outerHTML='&lt;i class=\'bi bi-pencil\'&gt;&lt;/i&gt;'" />
						</button>
						<button type="button" class="wdg-icon-btn" data-action="excluir" data-id="${recurso._id}" title="Excluir" aria-label="Excluir">
							<img src="${basePath}/images/excluir.png" alt="Excluir" onerror="this.outerHTML='&lt;i class=\'bi bi-trash\'&gt;&lt;/i&gt;'" />
						</button>
					</div>
				</td>
			</tr>
		`).join('');

		// Atualiza paginação e scroll-limit a cada renderização
		try { aplicarPaginacaoRecursos(); } catch (e) { console.warn('[recursos] aplicarPaginacaoRecursos falhou:', e); }
	};

	// Funções globais para os botões (novoRecurso removido)

	window.editarRecurso = async (id) => {
		try {
			const response = await fetch(`${basePath}/api/recursos/${id}`);
			if (response.ok) {
				const raw = await response.json();
				const recurso = (raw && typeof raw === 'object' && (raw.data || raw.recurso)) ? (raw.data || raw.recurso) : raw; // suporta {data:...} ou {recurso:...} ou objeto direto
				console.debug('[recursos] editarRecurso payload', raw, '-> usado:', recurso);
				if(!recurso || typeof recurso !== 'object') { alert('Resposta inválida do servidor'); return; }

				// Preencher o formulário com os dados do recurso
				const safe = (v)=> (v === undefined || v === null) ? '' : v;
				byId('recursoId').value = safe(recurso._id);
				byId('unidade_id').value = safe(recurso.unidade_id?._id || (typeof recurso.unidade_id === 'string' ? recurso.unidade_id : recurso.unidade_id?._id) || '');
				byId('tipo').value = safe(recurso.tipo);
				byId('placa').value = safe(recurso.placa);
				byId('chassi').value = safe(recurso.chassi);
				byId('renavam').value = safe(recurso.renavam);
				byId('ano').value = safe(recurso.ano ?? '');
				byId('mod').value = safe(recurso.mod ?? '');
				byId('modelo').value = safe(recurso.modelo);
				byId('cor').value = safe(recurso.cor);

				// Selecionar a marca correta
				const selectMarca = byId('marca');
				if (selectMarca) {
					const trySetMarca = () => { if (recurso.marca && Array.from(selectMarca.options).some(o=>o.value===recurso.marca)) selectMarca.value = recurso.marca; };
					// tenta imediatamente e depois novamente (caso opções ainda não tenham sido carregadas)
					trySetMarca();
					setTimeout(trySetMarca, 120);
				}

				// Mudar o botão para "Atualizar"
				const submitBtn = form.querySelector('button[type="submit"]');
				if (submitBtn) {
					submitBtn.textContent = 'Atualizar Recurso';
				}

				// Scroll para o topo do formulário
				form.scrollIntoView({ behavior: 'smooth' });
			} else {
				alert('Erro ao carregar dados do recurso');
			}
		} catch (error) {
			console.error('Erro ao editar recurso:', error);
			alert('Erro ao carregar dados do recurso');
		}
	};

	window.excluirRecurso = async (id, label) => {
		const ok = await askDeleteRecursoConfirm(label || 'selecionado');
		if (!ok) return;

		try {
			const response = await fetch(`${basePath}/api/recursos/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				alert('Recurso excluído com sucesso!');
				carregarRecursos();
			} else {
				alert('Erro ao excluir recurso');
			}
		} catch (error) {
			console.error('Erro:', error);
			alert('Erro ao excluir recurso');
		}
	};

	// Carregar recursos ao inicializar
	carregarRecursos();

	// Delegação de eventos para botões editar / excluir (padrão data-action)
	const tbody = document.getElementById('recursosTableBody');
	if(tbody){
		tbody.addEventListener('click', (ev)=>{
			const btn = ev.target.closest('button[data-action]');
			if(!btn) return;
			const id = btn.getAttribute('data-id');
			const action = btn.getAttribute('data-action');
			if(!id || !action) return;
			ev.preventDefault();
			if(action === 'editar') return editarRecurso(id);
			if(action === 'excluir'){
				const tr = btn.closest('tr');
				const unidade = normalizeText(tr?.children?.[0]?.textContent);
				const placa = normalizeText(tr?.children?.[2]?.textContent);
				const modelo = normalizeText(tr?.children?.[4]?.textContent);
				const parts = [placa, modelo].filter(Boolean);
				const baseLabel = parts.length ? parts.join(' — ') : '';
				const label = unidade ? (baseLabel ? `${baseLabel} (${unidade})` : unidade) : (baseLabel || 'selecionado');
				return excluirRecurso(id, label);
			}
		});
	}

	// Paginação (igual padrão Unidades/Funções/Setores)
	function aplicarPaginacaoRecursos(){
		const tbody = document.querySelector('#tabelaRecursos tbody');
		const pager = document.getElementById('rPaginas');
		const pageSizeSel = document.getElementById('rPageSize');
		const wrapper = document.getElementById('wrapperTabelaRecursos');
		if(!tbody || !pager || !pageSizeSel) return;
		let allRows = Array.from(tbody.querySelectorAll('tr'));
		const emptyRow = allRows.find(tr => tr.querySelector('.text-muted'));
		const dataRows = emptyRow ? allRows.filter(tr => tr!==emptyRow) : allRows;
		if(wrapper){ if(dataRows.length > 4) wrapper.classList.add('scroll-limit'); else wrapper.classList.remove('scroll-limit'); }
		allRows = dataRows;
		function getPageSize(){ const v=parseInt(pageSizeSel.value,10); return (!isNaN(v)&&v>0)? v : 50; }
		const state = { page: 0 };
		function mkBtn(label, go, dis){ const b=document.createElement('button'); b.type='button'; b.textContent=label; b.disabled=!!dis; b.addEventListener('click', ()=>{ state.page=go; render(); }); return b; }
		function buildPager(totalPages, totalItems){
			pager.innerHTML='';
			if (totalPages <= 1){
				const info=document.createElement('div'); info.className='w-100 text-center mt-1'; info.style.fontSize='.7rem'; info.textContent='Total: '+totalItems+' recurso(s)'; pager.appendChild(info); return;
			}
			const win=5; let start=Math.max(0, state.page-Math.floor(win/2)); let end=Math.min(totalPages-1, start+win-1);
			pager.appendChild(mkBtn('<<',0,state.page===0)); pager.appendChild(mkBtn('<',state.page-1,state.page===0));
			if(start>0){ const b0=mkBtn('1',0,false); if(state.page===0) b0.classList.add('active'); pager.appendChild(b0); const dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; pager.appendChild(dots); }
			for(let p=start;p<=end;p++){ const b=mkBtn(String(p+1),p,false); if(p===state.page) b.classList.add('active'); pager.appendChild(b); }
			if(end<totalPages-1){ const dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; pager.appendChild(dots2); const blast=mkBtn(String(totalPages), totalPages-1,false); if(state.page===totalPages-1) blast.classList.add('active'); pager.appendChild(blast); }
			pager.appendChild(mkBtn('>', state.page+1, state.page===totalPages-1)); pager.appendChild(mkBtn('>>', totalPages-1, state.page===totalPages-1));
			const info2=document.createElement('div'); info2.className='w-100 text-center mt-1'; info2.style.fontSize='.7rem'; info2.textContent='Total: '+totalItems+' recurso(s)'; pager.appendChild(info2);
		}
		function render(){
			const size = getPageSize();
			const totalPages = Math.ceil(allRows.length / size) || 1;
			if (state.page < 0) state.page = 0; if (state.page >= totalPages) state.page = totalPages - 1;
			const start = state.page * size; const end = Math.min(allRows.length, start + size);
			allRows.forEach((tr, idx)=>{ tr.style.display = (idx>=start && idx<end) ? '' : 'none'; });
			buildPager(totalPages, allRows.length);
		}
		pageSizeSel.onchange = ()=>{ state.page=0; render(); };
		render();
	}
	// Expor para eventual reuso
	window.aplicarPaginacaoRecursos = aplicarPaginacaoRecursos;

	// Alternância do botão principal (Cadastrar/Salvar) + cancelar
	(function(){
		const idField = byId('recursoId');
		const btn = byId('btnSubmitRecurso');
		const btnCancel = byId('btnCancelarEdicao');
		const form = byId('formNovoRecurso');
		if(!idField || !btn || !form) return;
		function update(){
			const editing = !!(idField.value && idField.value.trim());
			if(editing){
				btn.textContent='Salvar'; btn.title='Salvar'; btn.setAttribute('aria-label','Salvar');
				btn.classList.remove('btn-primary'); btn.classList.add('btn-outline-success');
				btnCancel && btnCancel.classList.remove('d-none');
			}else{
				btn.textContent='Cadastrar'; btn.title='Cadastrar'; btn.setAttribute('aria-label','Cadastrar');
				btn.classList.remove('btn-outline-success'); btn.classList.add('btn-primary');
				btnCancel && btnCancel.classList.add('d-none');
			}
		}
		const mo = new MutationObserver(update); mo.observe(idField, { attributes:true, attributeFilter:['value'] });
		['change','input'].forEach(ev=> idField.addEventListener(ev, update));
		btnCancel && btnCancel.addEventListener('click', ()=>{ idField.value=''; form.reset(); update(); });
		byId('btnResetRecurso')?.addEventListener('click', ()=>{ if(idField.value){ idField.value=''; update(); } });
		update();
	})();
});

