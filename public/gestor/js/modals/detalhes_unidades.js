// Migrado de public/js/modals/detalhes_unidades.js
(function(){
	const PROVISIONING_HISTORY_LIMIT = 20;

	function getBase(){
		try{
			let bp = (document.body && document.body.getAttribute('data-base-path'))
				|| window.__APP_BASE_PATH__
				|| window.basePathGlobal
				|| '/gestor';
			return String(bp).replace(/\/$/, '');
		}catch(_){ return '/gestor'; }
	}
	function resolveLogoSrc(val, unidadeId){
		try{
			const BASE = getBase();
			const v = String(val||'').trim();
			if(!v) return `${BASE}/img/placeholder-logo.svg`;
			// Centralize sempre via API para serverless-friendly (Data URL ou legado)
			if (unidadeId) {
				const apiUrl = `${BASE}/api/unidades/${unidadeId}/logo`;
				return apiUrl;
			}
			// fallback sem ID (deve ser raro)
			return `${BASE}/img/placeholder-logo.svg`;
		}catch(_){
			try{
				const BASE = getBase();
				return `${BASE}/img/placeholder-logo.svg`;
			}catch(__){ return '/gestor/img/placeholder-logo.svg'; }
		}
	}
	function formatarCNPJ(valor){
		try{ const c=String(valor||'').replace(/\D/g,''); if(c.length!==14) return valor||''; return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'); }catch(_){ return valor||''; }
	}
	function formatarCPF(valor){
		try{ const c=String(valor||'').replace(/\D/g,''); if(c.length!==11) return valor||''; return c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4'); }catch(_){ return valor||''; }
	}
	function formatarCEP(valor){
		try{ const c=String(valor||'').replace(/\D/g,''); if(c.length!==8) return valor||''; return c.replace(/^(\d{2})(\d{3})(\d{3})$/,'$1.$2-$3'); }catch(_){ return valor||''; }
	}
	function parseEnderecoLegacy(endereco){
		const res = {logradouro:'', numero:'', complemento:'', bairro:'', cidade:'', estado:'', cep:'', codigoIbge:''};
		if(!endereco) return res;
		let s = String(endereco);
		// Extrair Código IBGE
		const mIbge = s.match(/(?:código\s*)?ibge\s*[:\-]?\s*(\d{7})/i);
		if(mIbge){ res.codigoIbge = mIbge[1]; s = s.replace(mIbge[0],''); }
		// Extrair CEP (aceita 39.390-000, 39390-000, 39390000)
		const mCep = s.match(/cep\s*[:\-]?\s*([0-9\.\-]{8,12}|\d{5}-?\d{3})/i) || s.match(/(\d{2}\.\d{3}-\d{3}|\d{5}-\d{3}|\d{8})/);
		if(mCep){
			const digits = mCep[1].replace(/\D/g,'');
			if(digits.length===8){ res.cep = digits; }
			s = s.replace(mCep[0],'');
		}
		// Tokenizar por vírgula
		let tokens = s.split(',').map(t=>t.trim()).filter(Boolean);
		// Identificar Cidade - UF
		let idxCidadeUf = tokens.findIndex(t=>/\s-\s*[A-Za-z]{2}(?:\b|,)/.test(t));
		if(idxCidadeUf>=0){
			const parts = tokens[idxCidadeUf].split(/\s-\s*/);
			res.cidade = (parts[0]||'').trim();
			res.estado = (parts[1]||'').replace(/[,\.].*$/,'').trim();
			tokens.splice(idxCidadeUf,1);
		}
		// Logradouro
		if(tokens.length){ res.logradouro = tokens.shift(); }
		// Número
		if(tokens.length){
			const t = tokens[0];
			if(/^\d+$|^s\/?n$/i.test(t)){ res.numero = t; tokens.shift(); }
		}
		// Bairro geralmente é o último antes da cidade
		if(tokens.length){ res.bairro = tokens.pop(); }
		// O restante vira complemento
		if(tokens.length){ res.complemento = tokens.join(', '); }
		return res;
	}
	function escaparHtml(s){
		return String(s||'')
			.replace(/&/g,'&amp;')
			.replace(/</g,'&lt;')
			.replace(/>/g,'&gt;');
	}
	function formatarEnderecoMultilinha(endereco){
		try{
			const esc = escaparHtml(endereco||'');
			if(!esc) return '';
			// quebra em vírgulas: ", " -> ",<br>"
			return esc.replace(/,\s*/g, ',<br>');
		}catch(_){ return endereco||''; }
	}
	function safeId(value){
		return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
	}
	function normalizarPayloadApi(payload){
		if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) {
			return payload.data;
		}
		return payload;
	}
	async function requestApiJson(url, options = {}){
		const mergedOptions = {
			credentials: 'same-origin',
			...options,
			headers: {
				Accept: 'application/json',
				...(options.headers || {}),
			},
		};

		const response = await fetch(url, mergedOptions);
		const payload = await response.json().catch(() => ({}));
		if (!response.ok || payload?.success === false) {
			const msg = payload?.message || payload?.error || `Falha na requisicao (${response.status})`;
			throw new Error(String(msg || 'Falha na requisicao'));
		}

		return normalizarPayloadApi(payload);
	}
	function formatarDataHora(valor){
		if (!valor) return '<span class="text-muted">--</span>';
		try {
			const d = new Date(valor);
			if (Number.isNaN(d.getTime())) return escaparHtml(String(valor));
			return escaparHtml(d.toLocaleString('pt-BR'));
		} catch(_) {
			return escaparHtml(String(valor));
		}
	}
	function formatarDataHoraTexto(valor){
		if (!valor) return '--';
		try {
			const d = new Date(valor);
			if (Number.isNaN(d.getTime())) return String(valor);
			return d.toLocaleString('pt-BR');
		} catch(_) {
			return String(valor);
		}
	}
	function formatarNomeModuloProvisioning(modulo){
		const nomeOriginal = String(modulo || '').trim();
		if (!nomeOriginal) return '';

		const chave = nomeOriginal
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();

		const nomesAmigaveis = {
			'gestao de condominio': 'Gestão de Condomínio',
			clinica: 'Clínica',
			escalas: 'Escalas',
			gestor: 'Gestor',
			'portal do morador': 'Portal do Morador',
			'portal morador': 'Portal do Morador',
		};

		return nomesAmigaveis[chave] || nomeOriginal;
	}
	function normalizarModulosProvisioning(modulos){
		if (!Array.isArray(modulos)) return [];

		return modulos
			.map((modulo) => formatarNomeModuloProvisioning(modulo))
			.map((modulo) => String(modulo || '').trim())
			.filter(Boolean);
	}
	function renderizarModulosProvisioning(modulos){
		const modulosNormalizados = normalizarModulosProvisioning(modulos);
		if (modulosNormalizados.length === 0) {
			return '<span class="text-muted">Nao informado</span>';
		}

		return modulosNormalizados
			.map((modulo) => `<span class="badge text-bg-light border">${escaparHtml(String(modulo || ''))}</span>`)
			.join(' ');
	}
	function renderizarSecaoProvisionamento(container, {
		snapshot = null,
		loading = false,
		retrying = false,
		errorMessage = '',
		successMessage = '',
	} = {}){
		if (!container) return;

		const status = String(snapshot?.status || 'not_provisioned').trim() || 'not_provisioned';
		const ready = snapshot?.ready === true;
		const statusClass = status === 'error'
			? 'text-bg-danger'
			: (ready ? 'text-bg-success' : 'text-bg-warning');
		const readyClass = ready ? 'text-bg-success' : 'text-bg-secondary';
		const dbName = snapshot?.dbName ? escaparHtml(snapshot.dbName) : '<span class="text-muted">Nao informado</span>';
		const modulosView = Array.isArray(snapshot?.modulosHabilitadosDisplay) && snapshot.modulosHabilitadosDisplay.length > 0
			? snapshot.modulosHabilitadosDisplay
			: snapshot?.modulosHabilitados;
		const modulosNormalizados = normalizarModulosProvisioning(modulosView);
		const totalModulos = modulosNormalizados.length;
		const modulosHtml = renderizarModulosProvisioning(modulosView);
		const resumoStatus = ready
			? 'Banco provisionado com sucesso'
			: 'Provisionamento pendente ou incompleto';
		const resumoModulos = `${totalModulos} ${totalModulos === 1 ? 'módulo habilitado' : 'módulos habilitados'}`;
		const resumoUltimaExecucao = snapshot?.lastProvisionedAt
			? `Última execução em ${formatarDataHoraTexto(snapshot.lastProvisionedAt)}`
			: 'Última execução não registrada';
		const resumoClass = ready ? 'text-success' : 'text-warning';
		const lastErrorHtml = snapshot?.lastProvisioningError
			? `<div class="small text-danger text-break">${escaparHtml(snapshot.lastProvisioningError)}</div>`
			: '<span class="text-muted">Sem erro registrado</span>';
		const emProcessamento = loading || retrying;
		const retryLabel = emProcessamento
			? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Processando...'
			: 'Reprocessar provisioning';
		const retryBtnClass = ready ? 'btn btn-outline-secondary btn-sm' : 'btn btn-outline-primary btn-sm';

		container.innerHTML = `
			<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
				<small class="text-muted">Consulta e reprocessamento técnico do provisioning.</small>
				<button type="button" class="${retryBtnClass}" data-action="retry-provisioning" ${emProcessamento ? 'disabled' : ''}>${retryLabel}</button>
			</div>
			${successMessage ? `<div class="alert alert-success py-2 mb-2" role="alert">${escaparHtml(successMessage)}</div>` : ''}
			${errorMessage ? `<div class="alert alert-danger py-2 mb-2" role="alert">${escaparHtml(errorMessage)}</div>` : ''}
			${loading && !snapshot ? '<div class="small text-muted mb-2">Carregando status de provisioning...</div>' : ''}
			<div class="small mb-2">
				<div class="${resumoClass}">${escaparHtml(resumoStatus)}</div>
				<div class="text-muted">${escaparHtml(resumoModulos)}</div>
				<div class="text-muted">${escaparHtml(resumoUltimaExecucao)}</div>
			</div>
			<dl class="row profile-dl mb-0">
				<dt class="col-sm-5 col-lg-4">Status</dt>
				<dd class="col-sm-7 col-lg-8"><span class="badge ${statusClass}">${escaparHtml(status)}</span></dd>
				<dt class="col-sm-5 col-lg-4">Ready</dt>
				<dd class="col-sm-7 col-lg-8"><span class="badge ${readyClass}">${ready ? 'Sim' : 'Nao'}</span></dd>
				<dt class="col-sm-5 col-lg-4">DB Name</dt>
				<dd class="col-sm-7 col-lg-8 text-break">${dbName}</dd>
				<dt class="col-sm-5 col-lg-4">Modulos habilitados</dt>
				<dd class="col-sm-7 col-lg-8 d-flex flex-wrap gap-1">${modulosHtml}</dd>
				<dt class="col-sm-5 col-lg-4">Ultimo erro</dt>
				<dd class="col-sm-7 col-lg-8">${lastErrorHtml}</dd>
				<dt class="col-sm-5 col-lg-4">Criado em</dt>
				<dd class="col-sm-7 col-lg-8">${formatarDataHora(snapshot?.createdAt)}</dd>
				<dt class="col-sm-5 col-lg-4">Atualizado em</dt>
				<dd class="col-sm-7 col-lg-8">${formatarDataHora(snapshot?.updatedAt)}</dd>
				<dt class="col-sm-5 col-lg-4">Ultimo provisionamento</dt>
				<dd class="col-sm-7 col-lg-8">${formatarDataHora(snapshot?.lastProvisionedAt)}</dd>
			</dl>
		`;
	}
	function renderizarBadgeHistoricoScope(scope){
		const normalized = String(scope || '').trim().toLowerCase();
		if (normalized === 'module') {
			return '<span class="badge text-bg-info">module</span>';
		}
		return '<span class="badge text-bg-secondary">unit</span>';
	}
	function resolveHistoricoStatusClass(status){
		const normalized = String(status || '').trim().toLowerCase();
		if (normalized === 'success') return 'text-bg-success';
		if (normalized === 'error') return 'text-bg-danger';
		if (normalized === 'started') return 'text-bg-warning text-dark';
		return 'text-bg-secondary';
	}
	function renderizarBadgeHistoricoStatus(status){
		const normalized = String(status || 'info').trim().toLowerCase() || 'info';
		const statusClass = resolveHistoricoStatusClass(normalized);
		return `<span class="badge ${statusClass}">${escaparHtml(normalized)}</span>`;
	}
	function renderizarSecaoHistoricoProvisionamento(container, {
		loading = false,
		errorMessage = '',
		events = [],
		loaded = false,
		lastUpdatedAt = null,
		hasMore = false,
	} = {}){
		if (!container) return;

		const listaEventos = Array.isArray(events) ? events : [];
		const atualizadoEm = lastUpdatedAt
			? `Última atualização: ${escaparHtml(formatarDataHoraTexto(lastUpdatedAt))}`
			: 'Última atualização: --';
		const resumoQuantidade = loaded
			? `Mostrando ${listaEventos.length} evento(s) recentes.`
			: 'Visão temporal dos eventos de provisioning da unidade.';
		const maisEventos = hasMore ? 'Há mais eventos disponíveis no backend.' : '';

		let corpo = '';
		if (loading) {
			corpo = '<div class="small text-muted mt-2">Carregando histórico de provisioning...</div>';
		} else if (errorMessage) {
			corpo = `<div class="alert alert-danger py-2 mt-2 mb-0" role="alert">${escaparHtml(errorMessage)}</div>`;
		} else if (loaded && listaEventos.length === 0) {
			corpo = '<div class="small text-muted mt-2">Nenhum evento de provisioning encontrado para esta unidade.</div>';
		} else if (loaded) {
			const linhas = listaEventos.map((eventDoc) => {
				const modulo = eventDoc?.moduleKey
					? formatarNomeModuloProvisioning(eventDoc.moduleKey)
					: formatarNomeModuloProvisioning(
						eventDoc?.moduleLabel
						|| eventDoc?.requestedModule
						|| eventDoc?.metadata?.requestedModule
						|| ''
					) || '--';
				const detalhe = String(eventDoc?.message || eventDoc?.reason || '--');

				return `
					<tr>
						<td class="small text-nowrap">${formatarDataHora(eventDoc?.createdAt)}</td>
						<td class="small">${renderizarBadgeHistoricoScope(eventDoc?.scope)}</td>
						<td class="small text-nowrap">${escaparHtml(modulo)}</td>
						<td class="small text-nowrap">${escaparHtml(String(eventDoc?.eventType || '--'))}</td>
						<td class="small text-nowrap">${escaparHtml(String(eventDoc?.operation || '--'))}</td>
						<td class="small">${renderizarBadgeHistoricoStatus(eventDoc?.status)}</td>
						<td class="small text-break">${escaparHtml(detalhe)}</td>
					</tr>
				`;
			}).join('');

			corpo = `
				<div class="table-responsive mt-2">
					<table class="table table-sm table-hover align-middle mb-0">
						<thead class="table-light">
							<tr>
								<th>Data/Hora</th>
								<th>Escopo</th>
								<th>Módulo</th>
								<th>Evento</th>
								<th>Operação</th>
								<th>Status</th>
								<th>Mensagem / Motivo</th>
							</tr>
						</thead>
						<tbody>${linhas}</tbody>
					</table>
				</div>
			`;
		}

		container.innerHTML = `
			<div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
				<small class="text-muted">${escaparHtml(resumoQuantidade)}</small>
				<button type="button" class="btn btn-outline-secondary btn-sm" data-action="refresh-provisioning-history" ${loading ? 'disabled' : ''}>Atualizar histórico</button>
			</div>
			<div class="small text-muted mt-1">${escaparHtml(atualizadoEm)}</div>
			${maisEventos ? `<div class="small text-muted">${escaparHtml(maisEventos)}</div>` : ''}
			${corpo}
		`;
	}
	function ensureProvisioningRetryDelegation(modalRoot){
		if (!modalRoot) return;
		if (modalRoot.dataset.provisioningRetryDelegation === '1') return;

		modalRoot.addEventListener('click', (event) => {
			const retryBtn = event.target.closest('[data-action="retry-provisioning"]');
			if (!retryBtn) return;

			event.preventDefault();
			event.stopPropagation();

			console.info('[detalhes_unidades][provisioning] clique no botao de retry', {
				unidadeId: modalRoot.getAttribute('data-unidade-id') || null,
			});

			if (retryBtn.disabled) {
				console.info('[detalhes_unidades][provisioning] retry ignorado: botao desabilitado');
				return;
			}

			const context = modalRoot.__provisioningContext;
			if (!context || typeof context.retryProvisioning !== 'function') {
				console.warn('[detalhes_unidades][provisioning] contexto de retry indisponivel');
				return;
			}

			if (typeof context.isContextoAtivo === 'function' && !context.isContextoAtivo()) {
				console.warn('[detalhes_unidades][provisioning] retry ignorado: contexto inativo');
				return;
			}

			void context.retryProvisioning();
		});

		modalRoot.dataset.provisioningRetryDelegation = '1';
	}
	function ensureProvisioningHistoryDelegation(modalRoot){
		if (!modalRoot) return;
		if (modalRoot.dataset.provisioningHistoryDelegation === '1') return;

		modalRoot.addEventListener('click', (event) => {
			const refreshBtn = event.target.closest('[data-action="refresh-provisioning-history"]');
			if (!refreshBtn) return;

			event.preventDefault();
			event.stopPropagation();

			if (refreshBtn.disabled) return;

			const context = modalRoot.__provisioningHistoryContext;
			if (!context || typeof context.refreshHistorico !== 'function') {
				console.warn('[detalhes_unidades][historico] contexto de refresh indisponivel');
				return;
			}

			if (typeof context.isContextoAtivo === 'function' && !context.isContextoAtivo()) {
				console.warn('[detalhes_unidades][historico] refresh ignorado: contexto inativo');
				return;
			}

			void context.refreshHistorico();
		});

		modalRoot.dataset.provisioningHistoryDelegation = '1';
	}
	function iniciarProvisionamentoDetalhes({ unidadeId, containerId, requestToken }){
		const container = document.getElementById(containerId);
		const modalRoot = document.getElementById('detalhesModal');
		if (!container || !modalRoot || !unidadeId) return;
		ensureProvisioningRetryDelegation(modalRoot);

		const state = {
			snapshot: null,
			loading: true,
			retrying: false,
			errorMessage: '',
			successMessage: '',
		};

		const isContextoAtivo = () => {
			const sameUnit = String(modalRoot.getAttribute('data-unidade-id') || '') === String(unidadeId);
			const sameToken = String(modalRoot.getAttribute('data-provisioning-token') || '') === String(requestToken || '');
			return sameUnit && sameToken;
		};

		const render = () => {
			if (!isContextoAtivo()) return;
			renderizarSecaoProvisionamento(container, {
				snapshot: state.snapshot,
				loading: state.loading,
				retrying: state.retrying,
				errorMessage: state.errorMessage,
				successMessage: state.successMessage,
			});
		};

		const urlStatus = `${getBase()}/api/unidades/${encodeURIComponent(unidadeId)}/provisioning`;
		const urlRetry = `${getBase()}/api/unidades/${encodeURIComponent(unidadeId)}/provisioning/retry`;

		const carregarStatus = async ({ successMessage = '' } = {}) => {
			state.loading = true;
			state.errorMessage = '';
			if (successMessage) state.successMessage = successMessage;
			render();

			try {
				const snapshot = await requestApiJson(urlStatus);
				if (!isContextoAtivo()) return;
				console.info('[detalhes_unidades][provisioning] status consultado com sucesso', {
					unidadeId,
					status: snapshot?.status || null,
					ready: snapshot?.ready === true,
				});
				state.snapshot = snapshot || null;
				state.loading = false;
				render();
			} catch (error) {
				if (!isContextoAtivo()) return;
				console.error('[detalhes_unidades][provisioning] erro ao consultar status', {
					unidadeId,
					error: String(error?.message || error),
				});
				state.loading = false;
				state.errorMessage = String(error?.message || 'Falha ao consultar provisioning.');
				render();
			}
		};

		async function retryProvisioning(){
			if (state.retrying || state.loading) return;
			state.retrying = true;
			state.errorMessage = '';
			state.successMessage = '';
			render();
			console.info('[detalhes_unidades][provisioning] retry iniciado', {
				unidadeId,
				url: urlRetry,
			});

			try {
				const retryData = await requestApiJson(urlRetry, { method: 'POST' });
				if (!isContextoAtivo()) return;
				console.info('[detalhes_unidades][provisioning] retry concluido com sucesso', {
					unidadeId,
					status: retryData?.snapshot?.status || retryData?.provisioningResult?.globalStatus || null,
				});

				state.retrying = false;
				const historyContext = modalRoot.__provisioningHistoryContext;
				if (historyContext && typeof historyContext.refreshHistorico === 'function') {
					await historyContext.refreshHistorico();
				}
				await carregarStatus({ successMessage: 'Provisioning reprocessado com sucesso.' });
			} catch (error) {
				if (!isContextoAtivo()) return;
				console.error('[detalhes_unidades][provisioning] erro no retry', {
					unidadeId,
					error: String(error?.message || error),
				});
				state.retrying = false;
				state.errorMessage = String(error?.message || 'Falha ao reprocessar provisioning.');
				render();
			}
		}

		modalRoot.__provisioningContext = {
			unidadeId,
			requestToken,
			isContextoAtivo,
			retryProvisioning,
		};

		render();
		void carregarStatus();
	}
	function iniciarHistoricoProvisionamentoDetalhes({ unidadeId, containerId, requestToken }){
		const container = document.getElementById(containerId);
		const modalRoot = document.getElementById('detalhesModal');
		if (!container || !modalRoot || !unidadeId) return;
		ensureProvisioningHistoryDelegation(modalRoot);

		const state = {
			loading: true,
			errorMessage: '',
			events: [],
			loaded: false,
			lastUpdatedAt: null,
			hasMore: false,
		};

		const isContextoAtivo = () => {
			const sameUnit = String(modalRoot.getAttribute('data-unidade-id') || '') === String(unidadeId);
			const sameToken = String(modalRoot.getAttribute('data-provisioning-token') || '') === String(requestToken || '');
			return sameUnit && sameToken;
		};

		const render = () => {
			if (!isContextoAtivo()) return;
			renderizarSecaoHistoricoProvisionamento(container, {
				loading: state.loading,
				errorMessage: state.errorMessage,
				events: state.events,
				loaded: state.loaded,
				lastUpdatedAt: state.lastUpdatedAt,
				hasMore: state.hasMore,
			});
		};

		const urlHistorico = `${getBase()}/api/unidades/${encodeURIComponent(unidadeId)}/provisioning/events`;

		const carregarHistorico = async () => {
			state.loading = true;
			state.errorMessage = '';
			render();

			try {
				const payload = await requestApiJson(`${urlHistorico}?limit=${PROVISIONING_HISTORY_LIMIT}`);
				if (!isContextoAtivo()) return;

				state.events = Array.isArray(payload?.events) ? payload.events : [];
				state.hasMore = payload?.pagination?.hasMore === true;
				state.loaded = true;
				state.loading = false;
				state.lastUpdatedAt = new Date().toISOString();
				render();
			} catch (error) {
				if (!isContextoAtivo()) return;

				state.loading = false;
				state.loaded = true;
				state.errorMessage = String(error?.message || 'Falha ao carregar histórico de provisioning.');
				render();
			}
		};

		modalRoot.__provisioningHistoryContext = {
			unidadeId,
			requestToken,
			isContextoAtivo,
			refreshHistorico: carregarHistorico,
		};

		render();
		void carregarHistorico();
	}
	document.addEventListener('click', function (e) {
		const btn = e.target.closest('[data-action="abrirDetalhes"]'); if (!btn) return;
		const id = btn.getAttribute('data-id') || btn.closest('tr')?.getAttribute('data-id');
		const u = Array.isArray(window.unidadesFiltradas) ? window.unidadesFiltradas.find(x => String(x._id) === String(id)) : null; if (!u) return;

		// Definir atributo com ID no modal (usado pelo fluxo de upload no modal)
		let provisioningToken = '';
		try{
			const modalRoot = document.getElementById('detalhesModal');
			if(modalRoot){
				modalRoot.setAttribute('data-unidade-id', String(id));
				provisioningToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
				modalRoot.setAttribute('data-provisioning-token', provisioningToken);
			}
		}catch(_){ }

		// Preencher logo de pré-visualização do modal (robusto)
		try{
			const prev = document.getElementById('detalhesLogoPreview');
			if (prev){
				const src = resolveLogoSrc(u.logo, id);
				console.log('BASE in detalhes_unidades modal:', getBase());
				console.log('Setting detalhesLogoPreview src to:', src);
				// Sempre usar API URL para evitar problemas com data URLs longas
				const sep = src.includes('?') ? '&' : '?';
				prev.src = src + sep + 'v=' + Date.now();
			}
		}catch(_){ }
		const acc = document.getElementById('detalhesAccordion');
		if (acc) {
			const docLabel = (u.pessoaTipo === 'pf') ? 'CPF' : 'CNPJ';
			const docValue = (u.pessoaTipo === 'pf') ? formatarCPF(u.cpf || '') : formatarCNPJ(u.cnpj || '');
			const provisioningContainerId = `provisioning-${safeId(u._id || 'unidade')}`;
			const historicoContainerId = `provisioning-history-${safeId(u._id || 'unidade')}`;

			function rows(pares){
				return '<dl class="row profile-dl mb-0">' + pares.map(([k,v])=>{
					const isEnd = k === 'Endereço';
					const ddClass = `col-sm-7 col-lg-8 ${isEnd ? 'is-endereco' : 'text-break'}`;
					return `<dt class="col-sm-5 col-lg-4">${k}</dt><dd class="${ddClass}">${v||''}</dd>`;
				}).join('') + '</dl>';
			}

			const grupos = [
				{
					id:'grpIdent', titulo:'Identificação',
					conteudo: rows([
						['Código', escaparHtml(u.codigo || '')],
						['Nome Fantasia', escaparHtml(u.nome || '')],
						['Razão Social', escaparHtml(u.razaoSocial || '')],
						['Tipo', escaparHtml(u.subunidade ? 'Filial' : 'Matriz')],
						['Matriz', escaparHtml(u.is_principal ? 'Sim' : 'Não')],
						[docLabel, escaparHtml(docValue)],
					])
				},
				{
					id:'grpEndereco', titulo:'Endereço',
					conteudo: (function(){
						const parsed = parseEnderecoLegacy(u.endereco);
						const tipoLog = u.tipoLogradouro ? (u.tipoLogradouro + ' ') : '';
						const logradouro = (u.logradouro ? (tipoLog + u.logradouro) : parsed.logradouro) || '';
						const numero = (u.numero || parsed.numero || '');
						const complemento = (u.complemento || parsed.complemento || '');
						const bairro = (u.bairro || parsed.bairro || '');
						const cidade = (u.cidade || parsed.cidade || '');
						const estado = (String(u.estado||parsed.estado||'').toUpperCase());
						const cep = formatarCEP((u.cep||parsed.cep||''));
						const ibge = (u.codigoIbgeMunicipio || parsed.codigoIbge || '');
						return rows([
							['Logradouro', escaparHtml(logradouro.trim())],
							['Número', escaparHtml(numero)],
							['Complemento', escaparHtml(complemento)],
							['Bairro', escaparHtml(bairro)],
							['Cidade', escaparHtml(cidade)],
							['Estado', escaparHtml(estado)],
							['CEP', escaparHtml(cep)],
							['Código IBGE', escaparHtml(ibge)],
						]);
					})()
				},
				{
					id:'grpContato', titulo:'Contatos',
					conteudo: rows([
						['Telefone Fixo', escaparHtml(u.telefoneFixo || '')],
						['Telefone Celular', escaparHtml(u.telefoneCelular || '')],
						['E-mail Principal', escaparHtml(u.emailPrincipal || '')],
						['E-mail Fiscal', escaparHtml(u.emailFiscal || '')],
						['Site', escaparHtml(u.site || '')],
					])
				},
				{
					id:'grpBancario', titulo:'Dados Bancários',
					conteudo: rows([
						['Banco', escaparHtml(u.banco || '')],
						['Agência', escaparHtml(u.agencia || '')],
						['C/C', escaparHtml(u.contaCorrente || '')],
						['PIX (tipo)', escaparHtml(u.tipoPix || '')],
						['PIX (chave)', escaparHtml(u.pixChave || '')],
					])
				},
				{
					id:'grpProvisionamento', titulo:'Provisionamento',
					conteudo: `<div id="${provisioningContainerId}"></div>`
				},
				{
					id:'grpHistorico', titulo:'Histórico',
					conteudo: `<div id="${historicoContainerId}"></div>`
				}
			];

						const accId = 'acc-' + (u._id || 'unidade');
									const html = grupos.map((g, idx)=>{
											const isOpen = false; // inicia todos recolhidos (como no modal de funcionário)
								const collapseId = `${accId}-${g.id}`;
												return `
												<div class="ud-section">
													<div class="ud-toggle ${isOpen ? '' : 'collapsed'}" tabindex="0" role="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${isOpen}" aria-controls="${collapseId}">
														<i class="bi bi-chevron-right ud-caret"></i>
														<span>${g.titulo}</span>
													</div>
													<div id="${collapseId}" class="collapse ${isOpen ? 'show' : ''}" data-bs-parent="#${accId}">
														<div class="ud-body">${g.conteudo}</div>
													</div>
												</div>`;
						}).join('');

						acc.id = accId; // para o data-bs-parent funcionar
			acc.innerHTML = html;
			iniciarProvisionamentoDetalhes({
				unidadeId: id,
				containerId: provisioningContainerId,
				requestToken: provisioningToken,
			});
			iniciarHistoricoProvisionamentoDetalhes({
				unidadeId: id,
				containerId: historicoContainerId,
				requestToken: provisioningToken,
			});

			// comportamento: abrir um fecha os outros (via data-bs-parent) – nada extra aqui
		}
		const el = document.getElementById('detalhesModal');
		if (el) {
			try {
				if (window.bootstrap && window.bootstrap.Modal) {
					window.bootstrap.Modal.getOrCreateInstance(el).show();
				} else {
					const opener = document.querySelector('[data-bs-target="#detalhesModal"], [href="#detalhesModal"]');
					if (opener) opener.click();
				}
			} catch(_) { /* ignora se bootstrap não estiver presente */ }
		}
	});

	// Atualiza preview da logo quando for alterada em qualquer lugar
	window.addEventListener('unidade:logoAtualizada', function(ev){
		try{
			const det = ev && ev.detail || {};
			const id = String(det.id||'');
			const modalRoot = document.getElementById('detalhesModal');
			if (!modalRoot || !id) return;
			const currentId = modalRoot.getAttribute('data-unidade-id') || '';
			if (String(currentId) !== id) return; // evento de outra unidade
			const prev = document.getElementById('detalhesLogoPreview');
			const src = resolveLogoSrc(det.logo, id);
			console.log('BASE in detalhes_unidades event:', getBase());
			console.log('Updating detalhesLogoPreview src to:', src);
			if (prev && src){
				// Sempre usar API URL para evitar problemas com data URLs longas
				const sep = src.includes('?')?'&':'?';
				prev.src = src + sep + 'v=' + Date.now();
			}
		}catch(_){ }
	});
})();
