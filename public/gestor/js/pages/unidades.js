/* =========================================================================
 *  UNIDADES — Script principal (cópia íntegra de public/js/unidades.js)
 *  (Manter sincronizado até fase de remoção dos originais)
 * ========================================================================= */
console.debug('[unidades.js] carregado (versão pós-modularização)');

document.addEventListener('DOMContentLoaded', () => {
	// ===================== Helpers gerais =====================
	const byId = (id) => document.getElementById(id);

	function normalizeText(v){
		const s = String(v ?? '').trim();
		return s;
	}

	function sanitizeApiBancariaForLog(apiBancaria){
		if (!apiBancaria || typeof apiBancaria !== 'object') return apiBancaria;
		const safe = { ...apiBancaria };
		['apiHeaderValue','apiQueryParamValue','apiBasicPassword','apiOauthClientSecret','apiMtlsPassword','apiMtlsCertFileData'].forEach((key) => {
			if (key in safe) safe[key] = '[REDACTED]';
		});
		return safe;
	}

	function sanitizeUnidadeForLog(unidade){
		if (!unidade || typeof unidade !== 'object') return unidade;
		const safe = { ...unidade };
		if (safe.apiBancaria) safe.apiBancaria = sanitizeApiBancariaForLog(safe.apiBancaria);
		return safe;
	}

	function askDeleteUnidadeConfirm(unidadeNome){
		const modalEl = byId('uDeleteConfirmModal');
		const nameEl = byId('uDeleteConfirmName');
		const yesBtn = byId('uDeleteConfirmYes');

		const nome = normalizeText(unidadeNome) || 'selecionada';

		// fallback se Bootstrap/modal não estiver disponível
		if (!modalEl || !yesBtn || !(window.bootstrap && window.bootstrap.Modal)) {
			return Promise.resolve(window.confirm(`Deseja excluir a unidade ${nome}? Esta exclusão é definitiva e não pode ser desfeita.`));
		}

		if (nameEl) nameEl.textContent = nome;

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

	// Leitor de arquivo -> DataURL (Promise)
	function readFileAsDataURL(file){
		return new Promise((resolve, reject) => {
			try {
				const fr = new FileReader();
				fr.onerror = () => reject(new Error('Falha ao ler arquivo'));
				fr.onload = () => resolve(String(fr.result||''));
				fr.readAsDataURL(file);
			} catch(e){ reject(e); }
		});
	}

	// ===================== BASE PATH (prefixo /gestor) =====================
	// Detecta dinamicamente o prefixo montado (ex: '/gestor') para evitar 404 em chamadas '/api/...'
	// Estratégia: permite injeção server-side (window.__APP_BASE_PATH__) ou inferência pela URL atual.
	const BASE = (function(){
		if (window.__APP_BASE_PATH__) return window.__APP_BASE_PATH__;
		if (window.basePathGlobal) return window.basePathGlobal; // fallback compartilhado
		try {
			const path = window.location.pathname || '';
			// Se a URL começar com /gestor, adotamos como base
			return path.startsWith('/gestor') ? '/gestor' : '';
		} catch(_) { return ''; }
	})();
	if (!window.__APP_BASE_PATH__) window.__APP_BASE_PATH__ = BASE; // expõe para outros módulos se precisarem
	console.debug('[unidades.js] BASE detectado para API de unidades:', BASE || '(raiz)');

	function apiUnidades(sufixo=''){ return `${BASE}/api/unidades${sufixo}`; }

	// Debounce simples (exposto global para reuso)
	if (typeof window.debounce !== 'function') {
		window.debounce = function(fn, wait) {
			let t; return function() {
				const ctx = this, args = arguments;
				clearTimeout(t); t = setTimeout(() => fn.apply(ctx, args), wait || 300);
			};
		};
	}

	// ===================== (NOVO) Garantir select de módulos vazio no boot e ao reset =====================
	(function resetModulosInicial(){
		const modSel = byId('modulosAcessiveis');
		if (modSel) {
			modSel.innerHTML = '';
			modSel.setAttribute('disabled','');
			modSel.setAttribute('aria-readonly','true');
			modSel.title = 'Selecione os módulos pelo botão Gerenciar; este campo é apenas exibição.';
			// dispara eventos (caso alguém escute)
			modSel.dispatchEvent(new Event('input',  { bubbles: true }));
			modSel.dispatchEvent(new Event('change', { bubbles: true }));
		}
	})();

	(function hookResetForm(){
		const form = byId('cadastroUnidadeForm');
		if (!form) return;
		form.addEventListener('reset', () => {
			// espera o reset nativo e então limpa as options
			setTimeout(() => {
				const modSel = byId('modulosAcessiveis');
				if (modSel) {
					modSel.innerHTML = '';
					modSel.setAttribute('disabled','');
					modSel.setAttribute('aria-readonly','true');
					modSel.title = 'Selecione os módulos pelo botão Gerenciar; este campo é apenas exibição.';
					modSel.dispatchEvent(new Event('input',  { bubbles: true }));
					modSel.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}, 0);
		});
	})();

	// ===================== Credenciais genéricas de API bancária =====================
	(function initApiCredenciaisGenericas(){
		const select = document.getElementById('tipoAutenticacaoAPI');
		const sections = Array.from(document.querySelectorAll('[data-auth-section]'));
		if (!select || !sections.length) return;

		const form = document.getElementById('cadastroUnidadeForm');
		const mtlsInput = document.getElementById('apiMtlsCertFile');
		const mtlsStatus = document.getElementById('apiMtlsFileName');

		const updateSections = () => {
			const current = (select.value || '').toLowerCase();
			sections.forEach(section => {
				const raw = (section.getAttribute('data-auth-section') || '').toLowerCase();
				if (!raw) return;
				const targets = raw.split(',').map(t => t.trim()).filter(Boolean);
				const shouldShow = current && targets.includes(current);
				section.classList.toggle('d-none', !shouldShow);
				section.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
			});

			if (current !== 'mtls' && mtlsInput) {
				mtlsInput.value = '';
				if (mtlsStatus) mtlsStatus.textContent = 'Nenhum arquivo selecionado';
			}
		};

		select.addEventListener('change', updateSections);

		if (mtlsInput && mtlsStatus) {
			mtlsInput.addEventListener('change', () => {
				const file = mtlsInput.files && mtlsInput.files[0];
				mtlsStatus.textContent = file ? file.name : 'Nenhum arquivo selecionado';
			});
		}

		if (form) {
			form.addEventListener('reset', () => {
				setTimeout(() => {
					select.value = '';
					updateSections();
				}, 0);
			});
		}

		updateSections();
	})();

	(function initTesteBanco(){
		const btn = byId('btnTestarBanco');
		const statusEl = byId('statusTesteBanco');
		const unidadeIdEl = byId('unidadeId');
		if (!btn || !statusEl || !unidadeIdEl) return;
		btn.addEventListener('click', async () => {
			const unidadeId = (unidadeIdEl.value || '').trim();
			if (!unidadeId) {
				alert('Salve a unidade antes de testar a conexão com o banco.');
				return;
			}
			statusEl.textContent = 'Testando conexão...';
			statusEl.classList.remove('text-success', 'text-danger');
			statusEl.classList.add('text-muted');
			btn.setAttribute('disabled', 'disabled');
			try {
				const res = await fetch(`${BASE}/unidades/${unidadeId}/testar-banco`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
					credentials: 'same-origin'
				});
				const data = await res.json().catch(() => ({}));
				if (data.ok) {
					statusEl.textContent = data.detalhe || 'Conexão OK';
					statusEl.classList.remove('text-muted', 'text-danger');
					statusEl.classList.add('text-success');
				} else {
					statusEl.textContent = data.message || 'Falha ao testar conexão.';
					statusEl.classList.remove('text-muted', 'text-success');
					statusEl.classList.add('text-danger');
				}
			} catch (err) {
				console.error('[initTesteBanco] erro', err);
				statusEl.textContent = 'Erro inesperado ao testar conexão.';
				statusEl.classList.remove('text-muted', 'text-success');
				statusEl.classList.add('text-danger');
			} finally {
				btn.removeAttribute('disabled');
			}
		});
	})();

	// Reabrir automaticamente a unidade recém-salva para manter contexto visual (inclui prévia da logo)
	(function reopenLastEdited(){
		try {
			const last = sessionStorage.getItem('WDG_LAST_EDITED_UNIDADE');
			if (last) {
				sessionStorage.removeItem('WDG_LAST_EDITED_UNIDADE');
				setTimeout(()=>{ if (typeof window.editar === 'function') window.editar(last); }, 300);
			}
		} catch(_){ }
	})();

	// ===================== CNPJ: máscara e validação via utils/masks.js =====================
	const cnpjEl = byId('cnpj');

	function checkCnpjAgainstMatriz() {
		const filialChecked = !!byId('filial')?.checked;
		if (!filialChecked) return { ok: true, reason: '' };
		const matrizDigits = getMatrizCnpjDigits();
		const digits = (cnpjEl?.value || '').replace(/\D/g,'');
		if (!digits) return { ok: true, reason: '' };
		if (!matrizDigits) return { ok: false, reason: 'Selecione a Matriz para validar o CNPJ.' };
		if (digits.length !== 14) return { ok: false, reason: 'CNPJ incompleto.' };
		const baseOk = digits.slice(0,8) === matrizDigits.slice(0,8);
		const sufixo = digits.slice(8,12);
		const sufixoOk = sufixo !== '0001';
		return { ok: baseOk && sufixoOk, reason: baseOk ? (sufixoOk ? '' : 'Sufixo 0001 é reservado para matriz.') : 'CNPJ não pertence à base da Matriz selecionada.' };
	}

	function bindCNPJMaskWhenReady(attempt=1){
		if (!cnpjEl) return;
		if (window.WDMasks && window.WDMasks.formatCNPJ && window.WDMasks.isValidCNPJ && window.WDMasks.setValidity){
			cnpjEl.addEventListener('input', () => {
				const pessoaTipoSel = document.querySelector('input[name="pessoaTipo"]:checked')?.value;
				if (pessoaTipoSel !== 'pj') {
					// Não validar CNPJ quando PF; manter campo neutro
					cnpjEl.classList.remove('is-valid','is-invalid');
					cnpjEl.removeAttribute('title');
					return;
				}
				cnpjEl.value = window.WDMasks.formatCNPJ(cnpjEl.value);
				const digits = cnpjEl.value.replace(/\D/g, '');
				if (digits.length === 14) {
					const dvOk = window.WDMasks.isValidCNPJ(cnpjEl.value);
					const baseRule = checkCnpjAgainstMatriz();
					const ok = dvOk && baseRule.ok;
					// Durante digitação: só marcar inválido; manter neutro quando válido
					if (!ok) {
						cnpjEl.classList.add('is-invalid');
						cnpjEl.classList.remove('is-valid');
						cnpjEl.title = baseRule.reason || 'CNPJ inválido para Filial.';
					} else {
						cnpjEl.classList.remove('is-invalid');
						cnpjEl.classList.remove('is-valid');
						cnpjEl.removeAttribute('title');
					}
				} else {
					cnpjEl.classList.remove('is-valid', 'is-invalid');
					cnpjEl.removeAttribute('title');
				}
			});
			cnpjEl.addEventListener('blur', () => {
				const pessoaTipoSel = document.querySelector('input[name="pessoaTipo"]:checked')?.value;
				if (pessoaTipoSel !== 'pj') {
					// PF: ignorar validação/alerta de CNPJ
					cnpjEl.classList.remove('is-valid','is-invalid');
					cnpjEl.removeAttribute('title');
					return;
				}
				const digits = cnpjEl.value.replace(/\D/g, '');
				const dvOk = window.WDMasks.isValidCNPJ(cnpjEl.value);
				let msg = '';
				let ok = dvOk;
				const filialRule = checkCnpjAgainstMatriz();
				if (!filialRule.ok) { ok = false; msg = filialRule.reason; }
				window.WDMasks.setValidity(cnpjEl, ok);
				if (!ok && digits.length === 14) {
					alert(msg || 'CNPJ inválido');
					cnpjEl.title = msg || 'CNPJ inválido';
				} else {
					cnpjEl.removeAttribute('title');
				}
			});
			cnpjEl.value = window.WDMasks.formatCNPJ(cnpjEl.value);
			console.log('[unidades.js] Máscara CNPJ inicializada (attempt='+attempt+')');
			return;
		}
		if (attempt <= 20){
			if (attempt % 5 === 0) console.log('[unidades.js] aguardando WDMasks para CNPJ (tentativa '+attempt+')');
			setTimeout(()=>bindCNPJMaskWhenReady(attempt+1), 75);
		}else{
			console.warn('[unidades.js] Não conseguiu inicializar máscara de CNPJ — WDMasks indisponível');
		}
	}
	bindCNPJMaskWhenReady();

	// ===================== Matriz × Filial =====================
	function lockPessoaTipoForFilial(isFilial){
		const pf = byId('pessoaFisica');
		const pj = byId('pessoaJuridica');
		if (!pf || !pj) return;
		if (isFilial) {
			// Filial: somente PJ
			pj.checked = true;
			pf.checked = false;
			pf.disabled = true;
			pj.disabled = true;
			try { togglePessoaFields(false); } catch(_){ }
		} else {
			pf.disabled = false;
			pj.disabled = false;
		}
	}

	function updateCnpjEditabilityForFilial(isFilial){
		const cnpjInput = byId('cnpj');
		if (!cnpjInput) return;
		// Para filial: permitir digitação livre, apenas validar contra a Matriz
		if (isFilial) {
			cnpjInput.readOnly = false;
			cnpjInput.placeholder = 'Informe o CNPJ de filial compatível com a Matriz selecionada';
		} else {
			cnpjInput.readOnly = false;
			cnpjInput.placeholder = '';
		}
	}

	function getMatrizCnpjDigits(){
		const sel = byId('unidadePrincipal');
		if (!sel) return '';
		const opt = sel.options[sel.selectedIndex];
		if (!opt) return '';
		const cnpj = (opt.getAttribute('data-cnpj') || '').replace(/\D/g,'');
		return cnpj.length === 14 ? cnpj : '';
	}

	function setPrincipalSelect(isMatriz) {
		const sel = byId('unidadePrincipal');
		if (!sel) return;
		console.log('[setPrincipalSelect] Chamado com isMatriz:', isMatriz);
		console.log('[setPrincipalSelect] Valor atual do select antes:', sel.value);
		sel.disabled = !!isMatriz;   // desativa quando Matriz
		sel.required = !isMatriz;    // exige quando Filial
		if (isMatriz) {
			sel.value = ''; // limpa se voltar para Matriz
			console.log('[setPrincipalSelect] Select limpo porque é matriz');
		}
		console.log('[setPrincipalSelect] Valor final do select:', sel.value);
		try { window.DiretorModule?.atualizarVisibilidade?.(); } catch {}
		// Regras de pessoa tipo/CNPJ conforme Matriz x Filial
		lockPessoaTipoForFilial(!isMatriz);
		updateCnpjEditabilityForFilial(!isMatriz);
	}

	// Listener para alternar estado do select ao mudar Matriz/Filial
	document.addEventListener('change', (ev) => {
		if (ev.target && ev.target.matches('input[name="tipoUnidade"]')) {
			const isMatriz = ev.target.value === 'matriz';
			setPrincipalSelect(isMatriz);
		}
	});

	// Sempre que a Matriz selecionada mudar e estivermos em Filial,
	// reforçar bloqueios e manter CNPJ somente visual/informativo
	const unidPrincipalSel = byId('unidadePrincipal');
	if (unidPrincipalSel) {
		unidPrincipalSel.addEventListener('change', () => {
			const isFilial = byId('filial')?.checked;
			if (isFilial) {
				lockPessoaTipoForFilial(true);
				updateCnpjEditabilityForFilial(true);
				// Revalidar CNPJ com a nova Matriz
				try {
					const digits = cnpjEl?.value?.replace(/\D/g,'') || '';
					if (digits.length === 14 && window.WDMasks?.setValidity) {
						const dvOk = window.WDMasks.isValidCNPJ(cnpjEl.value);
						const baseRule = checkCnpjAgainstMatriz();
						const ok = dvOk && baseRule.ok;
						window.WDMasks.setValidity(cnpjEl, ok);
						if (!ok) cnpjEl.title = baseRule.reason || 'CNPJ inválido para Filial.'; else cnpjEl.removeAttribute('title');
					}
				} catch(_){ }
			}
		});
	}

	// Estado inicial (para não-diretor): aplicar conforme radio marcado no carregamento
	(function initPrincipalSelectInitialState(){
		try {
			const userRole = window.userRole || '';
			if (userRole === 'diretor') return; // diretores já forçam filial em initDiretorRestrictions()
			const checked = document.querySelector('input[name="tipoUnidade"]:checked');
			if (checked) setPrincipalSelect(checked.value === 'matriz');
		} catch(_) {}
	})();

	// ===================== Restrições para Diretores =====================
	function initDiretorRestrictions() {
		// Verificar se o usuário atual é diretor
		const userRole = window.userRole || '<%= user ? user.role : "" %>';
		const isDiretor = userRole === 'diretor';

		if (!isDiretor) return;

		console.log('[DIRETOR RESTRICTIONS] Aplicando restrições para diretor');

		// 1. Garantir que sempre esteja selecionado "Filial"
		const filialRadio = byId('filial');
		const matrizRadio = byId('matriz');
		const unidadePrincipalSelect = byId('unidadePrincipalSelect');
		const unidadePrincipal = byId('unidadePrincipal');

		if (filialRadio && matrizRadio) {
			// Forçar seleção de filial
			filialRadio.checked = true;
			matrizRadio.checked = false;

			// Desabilitar mudança de seleção
			matrizRadio.disabled = true;
			filialRadio.disabled = true;

			console.log('[DIRETOR RESTRICTIONS] Filial selecionada e bloqueada para diretores');
		}

		// 2. Sempre mostrar e tornar obrigatório o select de unidade principal
		if (unidadePrincipalSelect) {
			unidadePrincipalSelect.style.display = 'block';
		}

		if (unidadePrincipal) {
			unidadePrincipal.required = true;
			unidadePrincipal.disabled = false;
			console.log('[DIRETOR RESTRICTIONS] Select de matriz tornado obrigatório');
		}

		// 3. Aplicar estado inicial correto
		setPrincipalSelect(false); // false = filial, então select deve estar habilitado

		// 4. Prevenir qualquer tentativa de mudança via JavaScript
		const preventRadioChange = (ev) => {
			if (ev.target && ev.target.matches('input[name="tipoUnidade"]') && ev.target.value === 'matriz') {
				ev.preventDefault();
				ev.stopPropagation();
				console.log('[DIRETOR RESTRICTIONS] Tentativa de seleção de matriz bloqueada');
				return false;
			}
		};

		document.addEventListener('change', preventRadioChange, true);
		document.addEventListener('click', preventRadioChange, true);
	}

	// Inicializar restrições para diretores
	initDiretorRestrictions();

	// ===================== Pessoa Física × Jurídica =====================
	function togglePessoaFields(isPessoaFisica) {
		const cpfEl = byId('cpf');
		const cnpjEl = byId('cnpj');

		if (isPessoaFisica) {
			// Pessoa Física: CPF ativo, CNPJ desativado
			if (cpfEl) {
				cpfEl.disabled = false;
				cpfEl.required = true;
				cpfEl.value = window.WDMasks ? window.WDMasks.formatCPF(cpfEl.value) : cpfEl.value;
			}
			if (cnpjEl) {
				cnpjEl.disabled = true;
				cnpjEl.required = false;
				cnpjEl.value = '';
			}
		} else {
			// Pessoa Jurídica: CNPJ ativo, CPF desativado
			if (cpfEl) {
				cpfEl.disabled = true;
				cpfEl.required = false;
				cpfEl.value = '';
			}
			if (cnpjEl) {
				cnpjEl.disabled = false;
				cnpjEl.required = true;
				cnpjEl.value = window.WDMasks ? window.WDMasks.formatCNPJ(cnpjEl.value) : cnpjEl.value;
			}
		}
	}

	// Estado inicial: adiado até WDMasks estar pronto para evitar TypeError em formatCPF/formatCNPJ
	function initPessoaTipoWhenReady(attempt=1){
		const ready = !!(window.WDMasks && window.WDMasks.formatCPF && window.WDMasks.formatCNPJ);
		if (ready){
			try { togglePessoaFields(true); } catch(e){ console.warn('[unidades.js] falha init pessoaTipo', e); }
			return;
		}
		if (attempt <= 20){
			if (attempt % 5 === 0) console.log('[unidades.js] aguardando WDMasks para togglePessoaFields (tentativa '+attempt+')');
			setTimeout(()=>initPessoaTipoWhenReady(attempt+1), 60);
		}else{
			console.warn('[unidades.js] prosseguindo sem WDMasks — togglePessoaFields não formatará valores');
			try { togglePessoaFields(true); } catch {}
		}
	}
	initPessoaTipoWhenReady();

	// Alternar campos quando mudar seleção PF/PJ
	document.addEventListener('change', (ev) => {
		if (ev.target && ev.target.matches('input[name="pessoaTipo"]')) {
			togglePessoaFields(ev.target.value === 'pf');
		}
	});

	// Aplicar máscaras CPF
	function bindCPFMaskWhenReady(attempt=1){
		const cpfEl = byId('cpf');
		if (!cpfEl) return;
		if (window.WDMasks && window.WDMasks.formatCPF && window.WDMasks.isValidCPF && window.WDMasks.setValidity){
			cpfEl.addEventListener('input', () => {
				cpfEl.value = window.WDMasks.formatCPF(cpfEl.value);
				const digits = cpfEl.value.replace(/\D/g, '');
				if (digits.length === 11) {
					const ok = window.WDMasks.isValidCPF(cpfEl.value);
					// Durante digitação: só marcar inválido; manter neutro quando válido
					if (!ok) {
						cpfEl.classList.add('is-invalid');
						cpfEl.classList.remove('is-valid');
					} else {
						cpfEl.classList.remove('is-invalid');
						cpfEl.classList.remove('is-valid');
					}
				} else {
					cpfEl.classList.remove('is-valid', 'is-invalid');
				}
			});
			cpfEl.addEventListener('blur', () => {
				const digits = cpfEl.value.replace(/\D/g, '');
				const ok = window.WDMasks.isValidCPF(cpfEl.value);
				window.WDMasks.setValidity(cpfEl, ok);
				if (!ok && digits.length === 11) alert('CPF inválido');
			});
			console.log('[unidades.js] Máscara CPF inicializada (attempt='+attempt+')');
			return;
		}
		if (attempt <= 20){
			if (attempt % 5 === 0) console.log('[unidades.js] aguardando WDMasks para CPF (tentativa '+attempt+')');
			setTimeout(()=>bindCPFMaskWhenReady(attempt+1), 75);
		}else{
			console.warn('[unidades.js] Não conseguiu inicializar máscara de CPF — WDMasks indisponível');
		}
	}
	bindCPFMaskWhenReady();

	// ===================== Telefones & E-mails =====================
	// Aguardar carregamento completo do masks.js
	const initMasks = () => {
		const telFixo = byId('telefoneFixo');
		const telCel  = byId('telefoneCelular');
		const emailPrin = byId('emailPrincipal');
		const emailFis  = byId('emailFiscal');

		console.log('[unidades.js] Inicializando máscaras:', {
			telFixo: !!telFixo,
			telCel: !!telCel,
			emailPrin: !!emailPrin,
			emailFis: !!emailFis,
			WDMasks: !!window.WDMasks
		});

		if (telFixo && window.WDMasks && window.WDMasks.applyPhoneMask) {
			if (!telFixo.__phoneMaskBound) {
				window.WDMasks.applyPhoneMask(telFixo); // bind uma única vez
				telFixo.__phoneMaskBound = true;
				console.log('[unidades.js] Máscara telefone fixo aplicada (bind único)');
			} else {
				console.log('[unidades.js] Máscara telefone fixo já aplicada — ignorando rebinding');
			}
		}

		if (telCel && window.WDMasks && window.WDMasks.applyPhoneMask) {
			if (!telCel.__phoneMaskBound) {
				window.WDMasks.applyPhoneMask(telCel); // bind uma única vez
				telCel.__phoneMaskBound = true;
				console.log('[unidades.js] Máscara telefone celular aplicada (bind único)');
			} else {
				console.log('[unidades.js] Máscara telefone celular já aplicada — ignorando rebinding');
			}
		}

		if (emailPrin && window.WDMasks) {
			const applyEmail = () => {
				if (window.WDMasks.validateEmail) return window.WDMasks.validateEmail(emailPrin, { onBlur: false });
				const t = String(emailPrin.value || '').trim();
				const ok = t ? (window.WDMasks.isValidEmail ? window.WDMasks.isValidEmail(t) : true) : true; // vazio: não marcar inválido
				window.WDMasks.setValidity && window.WDMasks.setValidity(emailPrin, ok);
				return ok;
			};
			emailPrin.addEventListener('input', applyEmail);
			emailPrin.addEventListener('blur', () => {
				if (window.WDMasks.validateEmail) return window.WDMasks.validateEmail(emailPrin, { onBlur: true });
				applyEmail();
			});
			// não validar imediatamente se vazio; deixa feedback limpo até interação
			console.log('[unidades.js] Validação email principal aplicada (input + blur)');
		}

		if (emailFis && window.WDMasks) {
			const applyEmailF = () => {
				if (window.WDMasks.validateEmail) return window.WDMasks.validateEmail(emailFis, { onBlur: false });
				const t = String(emailFis.value || '').trim();
				const ok = t ? (window.WDMasks.isValidEmail ? window.WDMasks.isValidEmail(t) : true) : true; // vazio: não marcar inválido
				window.WDMasks.setValidity && window.WDMasks.setValidity(emailFis, ok);
				return ok;
			};
			emailFis.addEventListener('input', applyEmailF);
			emailFis.addEventListener('blur', () => {
				if (window.WDMasks.validateEmail) return window.WDMasks.validateEmail(emailFis, { onBlur: true });
				applyEmailF();
			});
			// sem validação inicial agressiva
			console.log('[unidades.js] Validação email fiscal aplicada (input + blur)');
		}

		// ===================== Máscara e validação de URL (Site) =====================
		const siteEl = byId('site');
		if (siteEl && window.WDMasks && window.WDMasks.applyURLMask) {
			window.WDMasks.applyURLMask(siteEl);
			console.log('[unidades.js] Máscara URL (site) aplicada');
		}
	};

	// Ouvir evento de carregamento do masks.js
	document.addEventListener('masksLoaded', (e) => {
		console.log('[unidades.js] Evento masksLoaded recebido');
		initMasks();
	});

	// Tentar inicializar imediatamente caso já esteja carregado
	if (window.WDMasks) {
		initMasks();
	}

	// ===================== Inscrição Estadual por UF (dinâmica) =====================
	(function initIEValidationByUF(){
		const ieEl = byId('inscricaoEstadual');
		const endEl = byId('endereco');
		if (!ieEl || !endEl) return;
		function revalidateIE(){
			try {
				const uf = (window.Validators?.extrairUFDoEndereco) ? window.Validators.extrairUFDoEndereco(endEl.value || '') : '';
				// Aplicar máscara/formato conforme UF
				if (window.Validators?.aplicarMascaraIEInput) window.Validators.aplicarMascaraIEInput(ieEl, uf);
				const ok = (window.Validators?.validarIEPorUF) ? window.Validators.validarIEPorUF(ieEl.value || '', uf) : true;
				if (window.Validators?.marcarCampoIE) window.Validators.marcarCampoIE(ieEl, ok, uf);
			} catch(_){ }
		}
		ieEl.addEventListener('input', revalidateIE);
		ieEl.addEventListener('blur', revalidateIE);
		endEl.addEventListener('input', revalidateIE);
		endEl.addEventListener('change', revalidateIE);
		// primeira validação
		setTimeout(revalidateIE, 0);
	})();

	// ===================== Upload & Preview de Logo (Aba Credenciais) =====================
	(function initLogoUpload(){
		const inputFile = byId('inputLogoUnidade');
		const btnSelect = byId('btnSelecionarLogo');
		const grupoConfirmar = byId('grupoConfirmarLogo');
		const btnConfirmar = byId('btnConfirmarLogo');
		const btnCancelar = byId('btnCancelarLogo');
		const preview = byId('logoUnidadePreview');
		const statusEl = byId('statusLogoUnidade');
		let arquivoSelecionado = null;
		let previewAnterior = null;
		function setStatus(msg,tipo){ if(!statusEl) return; const map={info:'text-muted',success:'text-success',error:'text-danger',warning:'text-warning'}; statusEl.className='small '+(map[tipo]||'text-muted'); statusEl.textContent=msg||''; }
		function resetEstado(){ arquivoSelecionado=null; if(previewAnterior){ preview.src=previewAnterior; previewAnterior=null;} grupoConfirmar?.classList.add('d-none'); btnSelect?.classList.remove('d-none'); }
		btnSelect?.addEventListener('click',()=>{ if(!inputFile) return; inputFile.value=''; inputFile.click(); });
		inputFile?.addEventListener('change', (ev)=>{ const f=ev.target.files?.[0]; if(!f){ resetEstado(); return;} if(!f.type.startsWith('image/')){ alert('Selecione um arquivo de imagem.'); return;} if(f.size>4*1024*1024){ alert('Máximo 4MB.'); return;} arquivoSelecionado=f; if(preview){ previewAnterior=preview.src; const url=URL.createObjectURL(f); preview.src=url; } btnSelect?.classList.add('d-none'); grupoConfirmar?.classList.remove('d-none'); setStatus('Pré-visualização local — confirme para enviar','info'); });
		btnCancelar?.addEventListener('click',()=>{ resetEstado(); setStatus('',''); });
		btnConfirmar?.addEventListener('click', async ()=>{ if(!arquivoSelecionado){ return;} try { setStatus('Enviando...','info'); const unidadeId = byId('unidadeId')?.value; if(!unidadeId){ alert('Salve a unidade antes de enviar a logo.'); setStatus('Salve a unidade antes do upload','warning'); return;}
			// Preferir endpoint inline (JSON) para evitar qualquer middleware de fs no server
			let novoLogo = '';
				try {
					const dataUrl = await readFileAsDataURL(arquivoSelecionado);
					const rInline = await fetch(apiUnidades(`/${unidadeId}/logo-inline`), {
						method:'POST', credentials:'same-origin', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ dataUrl })
					});
					const payload = await rInline.json().catch(()=>({}));
					const data = (payload && typeof payload === 'object' && 'data' in payload) ? payload.data : payload;
					if (!rInline.ok || payload.error) throw new Error(payload.error || payload.message || 'Falha no upload inline');
					novoLogo = data && (data.logo || data.url || data.foto) || '';
				} catch(errInline){
				console.error('[logoUpload] upload inline falhou', errInline);
				throw errInline; // sem fallback multipart em ambiente serverless
			}
			setStatus('Logo atualizada.','success'); // Atualiza dataset local (window.unidadesFiltradas)
			try { const hiddenLogo = byId('logoAtual'); if (hiddenLogo) hiddenLogo.value = novoLogo || ''; } catch(_){ }
			try { if(window.unidadesFiltradas){ const idx=window.unidadesFiltradas.findIndex(u=>u._id===unidadeId); if(idx>=0){ window.unidadesFiltradas[idx].logo = novoLogo; } } } catch(_){ }
			window.dispatchEvent(new CustomEvent('unidade:logoAtualizada',{ detail:{ id:unidadeId, logo:novoLogo } })); resetEstado(); // força reload preview com cache-buster
						if(preview && novoLogo){
							// Sempre usar API para display (serverless-friendly)
							const apiUrl = `${BASE}/api/unidades/${byId('unidadeId')?.value || ''}/logo`;
							const sep = apiUrl.includes('?')?'&':'?';
							console.log('BASE in upload success:', BASE);
							console.log('Setting preview src to:', apiUrl + sep + 'v=' + Date.now());
							preview.src = apiUrl + sep + 'v=' + Date.now();
						}
		} catch(e){ console.error('[logoUpload] erro',e); setStatus(e.message||'Erro ao enviar','error'); alert('Erro ao enviar logo: '+(e.message||'erro')); }
		});
	})();

	// ===================== Upload de Logo via Modal Detalhes =====================
	(function initLogoDetalhes(){
		const input = byId('inputLogoDetalhes');
		const btnTrocar = byId('btnTrocarLogoDetalhes');
		const grupo = byId('grupoConfirmarLogoDetalhes');
		const btnOk = byId('btnConfirmarLogoDetalhes');
		const btnCancel = byId('btnCancelarLogoDetalhes');
		const prev = byId('detalhesLogoPreview');
		const status = byId('statusLogoDetalhes');
		let fileSel=null; let oldSrc=null; function setStatus(msg,t){ if(!status) return; const map={info:'text-muted',success:'text-success',error:'text-danger',warning:'text-warning'}; status.className='small '+(map[t]||'text-muted'); status.textContent=msg||''; }
		btnTrocar?.addEventListener('click',()=>{ if(!input) return; input.value=''; input.click(); });
		input?.addEventListener('change', ev=>{ const f=ev.target.files?.[0]; if(!f){ return;} if(!f.type.startsWith('image/')){ alert('Selecione imagem.'); return;} if(f.size>4*1024*1024){ alert('Máx 4MB'); return;} fileSel=f; oldSrc=prev?.src; const url=URL.createObjectURL(f); if(prev) prev.src=url; grupo?.classList.remove('d-none'); btnTrocar?.classList.add('d-none'); setStatus('Pré-visualização — confirme para enviar','info'); });
		btnCancel?.addEventListener('click',()=>{ if(oldSrc && prev) prev.src=oldSrc; fileSel=null; grupo?.classList.add('d-none'); btnTrocar?.classList.remove('d-none'); setStatus('',''); });
		btnOk?.addEventListener('click', async ()=>{ if(!fileSel){ return;} try { setStatus('Enviando...','info'); const unidadeId = byId('detalhesModal')?.getAttribute('data-unidade-id'); if(!unidadeId){ setStatus('ID da unidade não encontrado','error'); return;}
			let novoLogo = '';
				try {
					const dataUrl = await readFileAsDataURL(fileSel);
					const rInline = await fetch(apiUnidades(`/${unidadeId}/logo-inline`), {
						method:'POST', credentials:'same-origin', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ dataUrl })
					});
					const payload = await rInline.json().catch(()=>({}));
					const data = (payload && typeof payload === 'object' && 'data' in payload) ? payload.data : payload;
					if (!rInline.ok || payload.error) throw new Error(payload.error || payload.message || 'Falha no upload inline');
					novoLogo = data && (data.logo || data.url || data.foto) || '';
				} catch(errInline){
				console.error('[logoModalUpload] upload inline falhou', errInline);
				throw errInline; // sem fallback multipart em ambiente serverless
			}
			setStatus('Logo atualizada.','success'); window.dispatchEvent(new CustomEvent('unidade:logoAtualizada',{ detail:{ id:unidadeId, logo:novoLogo } })); // Atualiza dataset global
			try { const hiddenLogo = byId('logoAtual'); if (hiddenLogo && String(byId('unidadeId')?.value||'') === String(unidadeId)) hiddenLogo.value = novoLogo || ''; } catch(_){ }
			try { if(window.unidadesFiltradas){ const idx=window.unidadesFiltradas.findIndex(u=>u._id===unidadeId); if(idx>=0){ window.unidadesFiltradas[idx].logo = novoLogo; } } } catch(_){ }
						grupo?.classList.add('d-none'); btnTrocar?.classList.remove('d-none'); fileSel=null; oldSrc=null;
						if(prev && novoLogo){
							// Sempre usar API para display (serverless-friendly)
							const unidadeId = byId('detalhesModal')?.getAttribute('data-unidade-id') || '';
							const apiUrl = `${BASE}/api/unidades/${unidadeId}/logo`;
							const sep=apiUrl.includes('?')?'&':'?';
							console.log('BASE in modal upload success:', BASE);
							console.log('Setting prev src to:', apiUrl+sep+'v='+Date.now());
							prev.src=apiUrl+sep+'v='+Date.now();
						}
		} catch(e){ console.error('[logoModalUpload] erro',e); setStatus(e.message||'Erro','error'); alert('Erro ao enviar logo: '+(e.message||'erro')); }
		});
		// Quando modal fecha, limpar estado
		const modalEl = document.getElementById('detalhesModal');
		if(modalEl){ modalEl.addEventListener('hidden.bs.modal',()=>{ fileSel=null; oldSrc=null; grupo?.classList.add('d-none'); btnTrocar?.classList.remove('d-none'); setStatus('',''); }); }
	})();


	// ===================== PIX: detecção, máscara e validação =====================
	function updatePixHelp() {
		const helpEl = byId('pixHelp');
		if (!helpEl) return;
		const tipo = document.querySelector('input[name="tipoPix"]:checked')?.value || '';
		const auto = byId('pixAuto') ? !!byId('pixAuto').checked : true;
		const msgs = {
			cpf: 'Chave CPF: digite 11 dígitos de um CPF válido. Ex.: 123.456.789-09',
			cnpj: 'Chave CNPJ: digite 14 dígitos de um CNPJ válido. Ex.: 12.345.678/0001-90',
			telefone: 'Chave telefone: DDD + número (10 ou 11 dígitos). Aceita DDI 55. Ex.: (11) 91234-5678',
			email: 'Chave e-mail: informe um e-mail válido. Ex.: nome@dominio.com',
			aleatoria: 'Chave aleatória (EVP): cole a chave completa (geralmente um UUID).'
		};
		if (tipo) {
			helpEl.textContent = msgs[tipo] || '';
		} else if (auto) {
			helpEl.textContent = 'Auto: o tipo da chave será detectado conforme você digita. Você pode selecionar manualmente se preferir.';
		} else {
			helpEl.textContent = 'Selecione o tipo da chave PIX para aplicar a máscara e validação.';
		}
	}

	function detectarTipoPix(chave) {
		if (!chave) return '';
		const valor = String(chave).trim();

		// Verificar se é CPF (11 dígitos)
		const cpfDigits = valor.replace(/\D/g, '');
		if (cpfDigits.length === 11 && window.WDMasks?.isValidCPF(cpfDigits)) {
			return 'cpf';
		}

		// Verificar se é CNPJ (14 dígitos)
		if (cpfDigits.length === 14 && window.WDMasks?.isValidCNPJ(cpfDigits)) {
			return 'cnpj';
		}

		// Verificar se é e-mail
		if (window.WDMasks?.isValidEmail(valor)) {
			return 'email';
		}

		// Verificar se é telefone (10-11 dígitos nacional ou 12-13 com DDI 55)
		const telefoneDigits = valor.replace(/\D/g, '');
		if (
			(telefoneDigits.length >= 10 && telefoneDigits.length <= 11) ||
			(telefoneDigits.length >= 12 && telefoneDigits.length <= 13 && telefoneDigits.startsWith('55'))
		) {
			return 'telefone';
		}

		// Se não for nenhum dos tipos específicos, é aleatório
		return valor ? 'aleatoria' : '';
	}

	function selecionarTipoPix(tipo) {
		if (!tipo) return;
		const radios = document.querySelectorAll('input[name="tipoPix"]');
		let found = false;
		radios.forEach(r => {
			if (r.value === tipo) {
				r.checked = true;
				found = true;
			} else {
				r.checked = false;
			}
		});
		if (found) {
			const hidden = byId('tipoPixHidden');
			if (hidden) hidden.value = tipo;
            // Atualiza o texto de ajuda conforme o novo tipo
            updatePixHelp();
		}
		return found;
	}

	function aplicarMascaraPix() {
		const pixEl = byId('pixChave');
		if (!pixEl || !window.WDMasks) return;

		// CORREÇÃO: seletor malformado 'input[name="tipoPix":checked' -> 'input[name="tipoPix"]:checked'
		const tipo = document.querySelector('input[name="tipoPix"]:checked')?.value || '';
		const raw = String(pixEl.value || '');

		if (tipo === 'cpf') {
			pixEl.value = window.WDMasks.formatCPF(raw);
		} else if (tipo === 'cnpj') {
			pixEl.value = window.WDMasks.formatCNPJ(raw);
		} else if (tipo === 'telefone') {
			// Normaliza números com DDI brasileiro para o padrão nacional
			let norm = raw.replace(/\D/g, '');
			if (norm.startsWith('55') && norm.length >= 12) {
				// Remove DDI 55 e mantém os últimos 10-11 dígitos
				norm = norm.slice(2);
			}
			pixEl.value = window.WDMasks.formatTelefone(norm);
		} else if (tipo === 'email') {
			// E-mail não precisa de máscara específica
			pixEl.value = raw;
		} else if (tipo === 'aleatoria') {
			// Campo livre, limita a 120 caracteres
			pixEl.value = raw.slice(0, 120);
		}

		// Feedback durante digitação: apenas "inválido" quando aplicável; neutro quando válido
		const val = String(pixEl.value || '').trim();
		if (!val) { pixEl.classList.remove('is-valid','is-invalid'); return; }
		let invalid = false;
		if (tipo === 'cpf') {
			const d = val.replace(/\D/g,'');
			if (d.length === 11) invalid = !window.WDMasks.isValidCPF(val);
			else { pixEl.classList.remove('is-valid','is-invalid'); return; }
		} else if (tipo === 'cnpj') {
			const d = val.replace(/\D/g,'');
			if (d.length === 14) invalid = !window.WDMasks.isValidCNPJ(val);
			else { pixEl.classList.remove('is-valid','is-invalid'); return; }
		} else if (tipo === 'email') {
			invalid = !window.WDMasks.isValidEmail(val);
		} else if (tipo === 'telefone') {
			let d = val.replace(/\D/g,'');
			if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
			if (d.length > 0 && d.length < 10) { pixEl.classList.remove('is-valid','is-invalid'); return; }
			if (d.length > 11) invalid = true; // segurança
			else invalid = false; // 10-11 será validado no blur
		} else {
			// aleatória: neutro
			pixEl.classList.remove('is-valid','is-invalid');
			return;
		}
		if (invalid) { pixEl.classList.add('is-invalid'); pixEl.classList.remove('is-valid'); }
		else { pixEl.classList.remove('is-invalid','is-valid'); }
	}

	function validarChavePix() {
		const pixEl = byId('pixChave');
		if (!pixEl || !window.WDMasks) return true;

		const tipo = document.querySelector('input[name="tipoPix"]:checked')?.value || '';
		const valor = pixEl.value.trim();

		if (!valor) return true; // Campo vazio é válido

		let isValid = true;
		let errorMessage = '';

		if (tipo === 'cpf') {
			isValid = window.WDMasks.isValidCPF(valor);
			errorMessage = 'CPF inválido';
		} else if (tipo === 'cnpj') {
			isValid = window.WDMasks.isValidCNPJ(valor);
			errorMessage = 'CNPJ inválido';
		} else if (tipo === 'email') {
			isValid = window.WDMasks.isValidEmail(valor);
			errorMessage = 'E-mail inválido';
		} else if (tipo === 'telefone') {
			// Para telefone, aceita 10-11 dígitos (nacional) ou 12-13 com DDI 55
			let digits = valor.replace(/\D/g, '');
			if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
			isValid = digits.length >= 10 && digits.length <= 11;
			errorMessage = 'Telefone inválido';
		} else if (tipo === 'aleatoria') {
			// Campo livre, sempre válido
			isValid = true;
		}

		// Aplicar feedback final no blur
		if (window.WDMasks.setValidity) window.WDMasks.setValidity(pixEl, isValid);

		if (window.WDMasks.setValidity) window.WDMasks.setValidity(pixEl, isValid);
		if (!isValid) {
			alert(`${errorMessage}.`);
			// Não alterar automaticamente o tipo selecionado; manter máscara atual
		}

		return isValid;
	}

	function detectarEAplicarMascaraPix({ forcar = false } = {}) {
		const pixEl = byId('pixChave');
		if (!pixEl) return;

		const atual = pixEl.value;
		const tipoSelecionado = document.querySelector('input[name="tipoPix"]:checked')?.value;
		const tipoDetectado = detectarTipoPix(atual);
        const auto = byId('pixAuto') ? !!byId('pixAuto').checked : true;

		// Auto ligado: detectar e aplicar sempre que possível
		if (auto) {
			if (tipoDetectado) selecionarTipoPix(tipoDetectado);
		} else {
			// Auto desligado: só detectar quando não há tipo selecionado
			if (!tipoSelecionado && tipoDetectado) selecionarTipoPix(tipoDetectado);
		}

		aplicarMascaraPix();
        // Mantém o help coerente quando digitando sem tipo selecionado
        updatePixHelp();
	}

	// Listeners PIX
	const radiosPix = document.querySelectorAll('input[name="tipoPix"]');
	radiosPix.forEach(r => r.addEventListener('change', () => {
		const hidden = byId('tipoPixHidden');
		if (hidden) hidden.value = r.value;

		// Não sobrescrever o valor digitado ao trocar tipo; apenas reformatar a chave conforme o novo tipo

		detectarEAplicarMascaraPix({ forcar: true });
        updatePixHelp();
	}));

	const pixEl = byId('pixChave');
	if (pixEl) {
	    pixEl.addEventListener('input', () => detectarEAplicarMascaraPix());
		pixEl.addEventListener('blur', () => {
		    detectarEAplicarMascaraPix({ forcar: false });
			validarChavePix();
		});
	}

    // Toggle Auto: afeta detecção automática e o help
	const pixAutoEl = byId('pixAuto');
	if (pixAutoEl) {
		pixAutoEl.addEventListener('change', () => {
			// Ao ligar o Auto, limpa seleção manual para permitir detecção imediata
			if (pixAutoEl.checked) {
				const radios = document.querySelectorAll('input[name="tipoPix"]');
				radios.forEach(r => { r.checked = false; });
				const hidden = byId('tipoPixHidden');
				if (hidden) hidden.value = '';
			}
			updatePixHelp();
			detectarEAplicarMascaraPix({ forcar: true });
		});
	}

    // Atualiza help inicial no carregamento
    updatePixHelp();

	// ===================== Agência/Conta: filtros =====================
	(function filtroAgenciaConta() {
		function filtrar(el, regex, upper) {
			if (!el) return;
			el.addEventListener('input', () => {
				let v = el.value; let n = v.replace(regex,''); if (upper) n = n.toUpperCase(); if (n !== v) el.value = n;
			});
		}
		filtrar(byId('agenciaNumero'), /[^0-9]/g, false);
		filtrar(byId('agenciaDV'),     /[^0-9xX]/g, true);
		filtrar(byId('contaNumero'),   /[^0-9]/g, false);
		filtrar(byId('contaDV'),       /[^0-9xX]/g, true);
	})();

	// ===================== Provisioning resumido na lista =====================
	const provisioningSummaryCache = new Map();
	const provisioningSummaryInFlight = new Map();
	const provisioningSummaryQueue = [];
	const provisioningSummaryQueuedIds = new Set();
	const PROVISIONING_SUCCESS_TTL_MS = 2 * 60 * 1000;
	const PROVISIONING_ERROR_TTL_MS = 20 * 1000;
	const PROVISIONING_MAX_CONCURRENCY = 4;
	let provisioningSummaryActiveCount = 0;
	let provisioningSummaryRefreshTimer = null;

	function notifyTabelaUnidadesRenderizada(){
		document.dispatchEvent(new CustomEvent('unidades:tabela-renderizada'));
	}

	function escapeHtmlProvisioning(value){
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function normalizeProvisioningPayload(payload){
		if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) {
			return payload.data;
		}
		return payload;
	}

	function formatarDataHoraProvisioningCurta(value){
		if (!value) return '';
		try {
			const d = new Date(value);
			if (Number.isNaN(d.getTime())) return '';
			const diffMs = Date.now() - d.getTime();
			if (diffMs >= 0 && diffMs < 2 * 60 * 1000) return 'ha pouco';
			if (diffMs >= 0 && diffMs < 60 * 60 * 1000) {
				const mins = Math.max(1, Math.floor(diffMs / (60 * 1000)));
				return `ha ${mins}m`;
			}
			return d.toLocaleString('pt-BR', {
				day: '2-digit',
				month: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			}).replace(',', '');
		} catch (_) {
			return '';
		}
	}

	function formatarNomeModuloProvisioningResumo(modulo){
		const nomeOriginal = String(modulo || '').trim();
		if (!nomeOriginal) return '';

		const chave = nomeOriginal
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();

		const nomesAmigaveis = {
			'gestao de condominio': 'Gestao de Condominio',
			clinica: 'Clinica',
			escalas: 'Escalas',
			gestor: 'Gestor',
		};

		return nomesAmigaveis[chave] || nomeOriginal;
	}

	function normalizarModulosProvisioningResumo(modulos){
		if (!Array.isArray(modulos)) return [];
		return modulos
			.map((item) => formatarNomeModuloProvisioningResumo(item))
			.map((item) => String(item || '').trim())
			.filter(Boolean);
	}

	function montarResumoModulosProvisioning(modulos, snapshot){
		const total = Array.isArray(modulos) ? modulos.length : 0;
		if (total === 0) {
			if (String(snapshot?.status || '').trim().toLowerCase() === 'error') return 'ver detalhes';
			return 'sem bootstrap';
		}

		const todosTecnicos = modulos.every((item) => /^[a-f\d]{24}$/i.test(String(item || '').trim()));
		if (todosTecnicos) return `${total} ${total === 1 ? 'modulo' : 'modulos'}`;

		if (total === 1) return modulos[0];
		if (total === 2) return `${modulos[0]}, ${modulos[1]}`;
		return `${modulos[0]}, ${modulos[1]} +${total - 2}`;
	}

	function getProvisioningStatusVisual(snapshot){
		const status = String(snapshot?.status || '').trim().toLowerCase();
		if (status === 'error') {
			return { badgeClass: 'text-bg-danger', badgeLabel: 'Erro', state: 'error' };
		}
		if (snapshot?.ready === true) {
			return { badgeClass: 'text-bg-success', badgeLabel: 'Pronto', state: 'ready' };
		}
		return { badgeClass: 'text-bg-warning text-dark', badgeLabel: 'Pendente', state: 'pending' };
	}

	function renderProvisioningLoadingCell(cell){
		if (!cell) return;
		cell.dataset.provisioningState = 'loading';
		cell.innerHTML = [
			'<div class="prov-summary">',
				'<div class="prov-line-1"><span class="badge text-bg-warning text-dark">Pendente</span></div>',
				'<div class="prov-line-2">consultando...</div>',
			'</div>'
		].join('');
	}

	function renderProvisioningErrorCell(cell, errorMessage){
		if (!cell) return;
		cell.dataset.provisioningState = 'error';
		const msg = String(errorMessage || 'Falha ao consultar provisioning.').trim();
		cell.setAttribute('title', msg);
		cell.innerHTML = [
			'<div class="prov-summary">',
				'<div class="prov-line-1"><span class="badge text-bg-danger">Erro</span></div>',
				'<div class="prov-line-2">ver detalhes</div>',
			'</div>'
		].join('');
	}

	function renderProvisioningSnapshotCell(cell, snapshot){
		if (!cell) return;
		const visual = getProvisioningStatusVisual(snapshot);
		const modulosView = Array.isArray(snapshot?.modulosHabilitadosDisplay) && snapshot.modulosHabilitadosDisplay.length
			? snapshot.modulosHabilitadosDisplay
			: snapshot?.modulosHabilitados;
		const modulos = normalizarModulosProvisioningResumo(modulosView);
		const modulosResumo = montarResumoModulosProvisioning(modulos, snapshot);
		const tempoCurto = formatarDataHoraProvisioningCurta(snapshot?.lastProvisionedAt);

		cell.dataset.provisioningState = visual.state;
		cell.removeAttribute('title');
		cell.innerHTML = `
			<div class="prov-summary">
				<div class="prov-line-1">
					<span class="badge ${visual.badgeClass}">${visual.badgeLabel}</span>
					${tempoCurto ? `<span class="prov-time">${escapeHtmlProvisioning(tempoCurto)}</span>` : ''}
				</div>
				<div class="prov-line-2">${escapeHtmlProvisioning(modulosResumo)}</div>
			</div>
		`;
	}

	function isProvisioningCacheEntryFresh(entry){
		if (!entry || typeof entry !== 'object') return false;
		const fetchedAt = Number(entry.fetchedAt || 0);
		if (!fetchedAt) return false;
		const age = Date.now() - fetchedAt;
		const ttl = entry.ok ? PROVISIONING_SUCCESS_TTL_MS : PROVISIONING_ERROR_TTL_MS;
		return age <= ttl;
	}

	function getProvisioningCacheEntry(unidadeId){
		const key = String(unidadeId || '').trim();
		if (!key) return null;
		const entry = provisioningSummaryCache.get(key);
		if (!isProvisioningCacheEntryFresh(entry)) {
			provisioningSummaryCache.delete(key);
			return null;
		}
		return entry;
	}

	function setProvisioningCacheEntry(unidadeId, entry){
		const key = String(unidadeId || '').trim();
		if (!key) return;
		provisioningSummaryCache.set(key, {
			ok: entry?.ok === true,
			snapshot: entry?.snapshot || null,
			errorMessage: String(entry?.errorMessage || ''),
			fetchedAt: Date.now(),
		});
	}

	async function fetchProvisioningSummary(unidadeId){
		const key = String(unidadeId || '').trim();
		if (!key) {
			const invalid = { ok: false, snapshot: null, errorMessage: 'ID da unidade invalido.' };
			setProvisioningCacheEntry(key, invalid);
			return invalid;
		}

		const cached = getProvisioningCacheEntry(key);
		if (cached) return cached;

		if (provisioningSummaryInFlight.has(key)) {
			return provisioningSummaryInFlight.get(key);
		}

		const request = (async () => {
			try {
				const url = `${BASE}/api/unidades/${encodeURIComponent(key)}/provisioning`;
				const resp = await fetch(url, {
					credentials: 'same-origin',
					headers: { Accept: 'application/json' },
				});
				const payload = await resp.json().catch(() => ({}));
				if (!resp.ok || payload?.success === false) {
					throw new Error(payload?.message || payload?.error || `Falha na consulta (${resp.status})`);
				}

				const snapshot = normalizeProvisioningPayload(payload) || {};
				const result = { ok: true, snapshot, errorMessage: '' };
				setProvisioningCacheEntry(key, result);
				return getProvisioningCacheEntry(key) || result;
			} catch (error) {
				const result = {
					ok: false,
					snapshot: null,
					errorMessage: String(error?.message || 'Falha ao consultar provisioning.'),
				};
				setProvisioningCacheEntry(key, result);
				return getProvisioningCacheEntry(key) || result;
			}
		})();

		provisioningSummaryInFlight.set(key, request);
		return request.finally(() => {
			provisioningSummaryInFlight.delete(key);
		});
	}

	function applyProvisioningCacheToCells(unidadeId){
		const key = String(unidadeId || '').trim();
		if (!key) return;
		const entry = getProvisioningCacheEntry(key);
		if (!entry) return;

		document.querySelectorAll('[data-provisioning-cell]').forEach((cell) => {
			if (String(cell.getAttribute('data-unidade-id') || '') !== key) return;
			if (entry.ok) renderProvisioningSnapshotCell(cell, entry.snapshot || {});
			else renderProvisioningErrorCell(cell, entry.errorMessage);
		});
	}

	function processProvisioningQueue(){
		while (provisioningSummaryActiveCount < PROVISIONING_MAX_CONCURRENCY && provisioningSummaryQueue.length > 0) {
			const unidadeId = provisioningSummaryQueue.shift();
			provisioningSummaryQueuedIds.delete(unidadeId);
			provisioningSummaryActiveCount += 1;

			void fetchProvisioningSummary(unidadeId)
				.finally(() => {
					provisioningSummaryActiveCount -= 1;
					applyProvisioningCacheToCells(unidadeId);
					processProvisioningQueue();
				});
		}
	}

	function enqueueProvisioningSummaryFetch(unidadeId){
		const key = String(unidadeId || '').trim();
		if (!key) return;
		if (provisioningSummaryQueuedIds.has(key)) return;
		if (provisioningSummaryInFlight.has(key)) return;
		provisioningSummaryQueuedIds.add(key);
		provisioningSummaryQueue.push(key);
		processProvisioningQueue();
	}

	function isRowVisibleForProvisioning(row){
		if (!row || !row.isConnected) return false;
		if (row.style.display === 'none') return false;
		try {
			const computed = window.getComputedStyle(row);
			return computed.display !== 'none' && computed.visibility !== 'hidden';
		} catch (_) {
			return true;
		}
	}

	function carregarResumoProvisioningVisivel(){
		const rows = document.querySelectorAll('#tabelaUnidades tbody tr.unidade-row');
		if (!rows.length) return;

		rows.forEach((row) => {
			if (!isRowVisibleForProvisioning(row)) return;
			const cell = row.querySelector('[data-provisioning-cell]');
			if (!cell) return;

			const unidadeId = String(cell.getAttribute('data-unidade-id') || row.getAttribute('data-id') || '').trim();
			if (!unidadeId) return;

			const cached = getProvisioningCacheEntry(unidadeId);
			if (cached) {
				if (cached.ok) renderProvisioningSnapshotCell(cell, cached.snapshot || {});
				else renderProvisioningErrorCell(cell, cached.errorMessage);
				return;
			}

			renderProvisioningLoadingCell(cell);
			enqueueProvisioningSummaryFetch(unidadeId);
		});
	}

	function agendarResumoProvisioningVisivel(){
		if (provisioningSummaryRefreshTimer) {
			clearTimeout(provisioningSummaryRefreshTimer);
		}
		provisioningSummaryRefreshTimer = setTimeout(() => {
			provisioningSummaryRefreshTimer = null;
			carregarResumoProvisioningVisivel();
		}, 50);
	}

	document.addEventListener('unidades:tabela-renderizada', agendarResumoProvisioningVisivel);
	agendarResumoProvisioningVisivel();

	// ===================== Tabela: filiais expand/collapse =====================
	function reclasificarFiliaisOrfas(principalId) {
		try {
			if (!principalId) return;
			const candidatas = Array.from(document.querySelectorAll('tr.unidade-row'))
				.filter(tr => tr.getAttribute('data-id') !== principalId)
				.filter(tr => !tr.classList.contains('filial-row'))
				.filter(tr => tr.getAttribute('data-unidade-principal-id') === principalId);
			candidatas.forEach(tr => { tr.classList.add('filial-row', `filial-of-${principalId}`); tr.style.display = 'none'; });
		} catch(e) { console.warn('Reclass filiais órfãs:', e); }
	}
	function inicializarFiliaisOrfas() {
		const principais = Array.from(document.querySelectorAll('tr.unidade-row[data-principal="true"]'));
		principais.forEach(tr => reclasificarFiliaisOrfas(tr.getAttribute('data-id')));
	}
	function toggleFiliais(principalId, forceState) {
		if (!principalId) return;
		reclasificarFiliaisOrfas(principalId);
		let filialRows = document.querySelectorAll(`.filial-of-${principalId}`);
		if (!filialRows.length) return;
		const btn = document.querySelector(`button.toggle-filiais[data-principal-id="${principalId}"]`);
		let expandir = forceState;
		if (expandir === undefined) {
			const algumVisivel = Array.from(filialRows).some(r => (r.style.display !== 'none') && (getComputedStyle(r).display !== 'none'));
			expandir = !algumVisivel;
		}
		filialRows.forEach(r => {
			if (expandir) { r.classList.remove('filial-hidden'); r.style.display = 'table-row'; }
			else { r.classList.add('filial-hidden'); r.style.display = 'none'; }
		});
		if (btn) {
			btn.innerHTML = expandir ? '&#9662;' : '&#9656;';
			btn.setAttribute('aria-expanded', expandir ? 'true' : 'false');
			btn.setAttribute('data-state',    expandir ? 'expanded' : 'collapsed');
			btn.title = expandir ? 'Recolher filiais' : 'Expandir filiais';
		}
		if (expandir) {
			try {
				const primeiro = filialRows[0];
				if (primeiro) {
					primeiro.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
					primeiro.classList.add('filial-expanded-highlight');
					setTimeout(()=> primeiro.classList.remove('filial-expanded-highlight'), 2000);
				}
			} catch(_) {}
		}
		notifyTabelaUnidadesRenderizada();
	}
	inicializarFiliaisOrfas();
	document.addEventListener('click', function(e){
		const origem = e.target.closest('button.toggle-filiais');
		if (!origem) return;
		if (origem.__busyToggle) return;
		origem.__busyToggle = true; setTimeout(()=> origem.__busyToggle = false, 250);
		const principalId = origem.getAttribute('data-principal-id');
		if (principalId) toggleFiliais(principalId);
	});
	document.querySelectorAll('tr.filial-row').forEach(tr => { tr.classList.add('filial-hidden'); tr.style.display = 'none'; });

	// ===================== Paginação da lista de unidades (por grupo de principal+filiais) =====================
	(function initPagination(){
		const tbody = document.querySelector('#tabelaUnidades tbody');
		const pager = document.getElementById('uPaginas');
		const pageSizeSel = document.getElementById('uPageSize');
		if (!tbody || !pager || !pageSizeSel) return;

		// Captura a ordem original de linhas e cria grupos (principal + suas filiais)
		let allRows = Array.from(tbody.querySelectorAll('tr.unidade-row'));
		if (!allRows.length) return; // sem dados

		const groups = [];
		const byIdMap = new Map();
		allRows.forEach(tr => { byIdMap.set(String(tr.getAttribute('data-id')||''), tr); });
		const used = new Set();
		for (let i=0;i<allRows.length;i++){
			const tr = allRows[i];
			if (used.has(tr)) continue;
			const isPrincipal = String(tr.getAttribute('data-principal')) === 'true';
			if (isPrincipal){
				const pid = String(tr.getAttribute('data-id') || '');
				const groupRows = [tr]; used.add(tr);
				// agrega filiais subsequentes ou espalhadas que referenciem este principal
				for (let j=0;j<allRows.length;j++){
					const r = allRows[j];
					if (used.has(r)) continue;
					const fid = String(r.getAttribute('data-unidade-principal-id') || '');
					if (fid && fid === pid){ groupRows.push(r); used.add(r); }
				}
				groups.push(groupRows);
			} else {
				// Filial sem principal visível: vira grupo solo
				groups.push([tr]); used.add(tr);
			}
		}

		let state = { page: 0 };
		function getPageSize(){
			const v = parseInt(pageSizeSel.value,10);
			return (!isNaN(v) && v>0) ? v : 50;
		}

		function buildPager(totalPages, totalItems){
			pager.innerHTML = '';
			if (totalPages <= 1){
				const info = document.createElement('div');
				info.className = 'w-100 text-center mt-1';
				info.style.fontSize = '.7rem';
				info.textContent = 'Total: ' + totalItems + ' unidade(s)';
				pager.appendChild(info);
				return;
			}
			function mk(label, go, dis){ const b=document.createElement('button'); b.type='button'; b.textContent=label; b.disabled=!!dis; b.addEventListener('click', function(){ state.page=go; render(); }); return b; }
			const win=5; let start=Math.max(0, state.page-Math.floor(win/2)); let end=Math.min(totalPages-1, start+win-1);
			pager.appendChild(mk('<<',0,state.page===0)); pager.appendChild(mk('<',state.page-1,state.page===0));
			if(start>0){ const b0=mk('1',0,false); if(state.page===0) b0.classList.add('active'); pager.appendChild(b0); const dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; pager.appendChild(dots); }
			for(let p=start;p<=end;p++){ const b=mk(String(p+1),p,false); if(p===state.page) b.classList.add('active'); pager.appendChild(b); }
			if(end<totalPages-1){ const dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; pager.appendChild(dots2); const blast=mk(String(totalPages), totalPages-1,false); if(state.page===totalPages-1) blast.classList.add('active'); pager.appendChild(blast); }
			pager.appendChild(mk('>', state.page+1, state.page===totalPages-1)); pager.appendChild(mk('>>', totalPages-1, state.page===totalPages-1));
			const info2=document.createElement('div'); info2.className='w-100 text-center mt-1'; info2.style.fontSize='.7rem'; info2.textContent='Total: '+ totalItems +' unidade(s)'; pager.appendChild(info2);
		}

		function render(){
			const size = getPageSize();
			const totalPages = Math.ceil(groups.length / size) || 1;
			if (state.page < 0) state.page = 0;
			if (state.page >= totalPages) state.page = totalPages - 1;
			const start = state.page * size;
			const end = Math.min(groups.length, start + size);
			// Limpar tbody e repor grupos da página
			tbody.innerHTML = '';
			if (!groups.length){
				const tr = document.createElement('tr');
				tr.innerHTML = '<td colspan="8" class="text-center text-muted">Nenhuma unidade cadastrada.</td>';
				tbody.appendChild(tr);
				buildPager(1, 0);
				notifyTabelaUnidadesRenderizada();
				return;
			}
			for (let i=start;i<end;i++){
				const rows = groups[i];
				rows.forEach(r => { tbody.appendChild(r); });
			}
			buildPager(totalPages, groups.length);
			notifyTabelaUnidadesRenderizada();
		}

		pageSizeSel.addEventListener('change', function(){ state.page = 0; render(); });
		render();
	})();

	// ===================== Edição (preencher formulário) =====================
	function setVal(id, val){ const el = byId(id); if (el != null && val !== undefined && val !== null) el.value = val; }

	const API_CRED_FIELD_MAP = {
		apiHeaderName: 'apiHeaderName',
		apiHeaderValue: 'apiHeaderValue',
		apiQueryParamName: 'apiQueryParamName',
		apiQueryParamValue: 'apiQueryParamValue',
		apiBasicUser: 'apiBasicUser',
		apiBasicPassword: 'apiBasicPassword',
		apiOauthClientId: 'apiOauthClientId',
		apiOauthClientSecret: 'apiOauthClientSecret',
		apiOauthScope: 'apiOauthScope',
		apiOauthTokenUrl: 'apiOauthTokenUrl',
		apiBaseUrl: 'apiBaseUrl',
		apiTokenUrlGenerica: 'apiTokenUrlGenerica',
		apiMtlsPassword: 'apiMtlsPassword'
	};
	const API_CRED_FIELD_IDS = Object.keys(API_CRED_FIELD_MAP);

	function resetApiCredenciaisDom(){
		API_CRED_FIELD_IDS.forEach(id => {
			const el = byId(id);
			if (el) el.value = '';
		});
		const authSelect = byId('tipoAutenticacaoAPI');
		if (authSelect) {
			authSelect.value = '';
			try { authSelect.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){ }
		}
		const mtlsInput = byId('apiMtlsCertFile');
		if (mtlsInput) mtlsInput.value = '';
		const mtlsStatus = byId('apiMtlsFileName');
		if (mtlsStatus) mtlsStatus.textContent = 'Nenhum arquivo selecionado';
	}

	function preencherApiCredenciais(apiData){
		const data = (apiData && typeof apiData === 'object') ? apiData : {};
		API_CRED_FIELD_IDS.forEach(id => {
			const el = byId(id);
			if (!el) return;
			const key = API_CRED_FIELD_MAP[id];
			const value = data[key];
			el.value = (value === undefined || value === null) ? '' : value;
		});
		const authSelect = byId('tipoAutenticacaoAPI');
		if (authSelect) {
			authSelect.value = data.tipoAutenticacaoAPI || '';
			try { authSelect.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){ }
		}
		const mtlsStatus = byId('apiMtlsFileName');
		if (mtlsStatus) {
			mtlsStatus.textContent = data.apiMtlsCertFileName ? `Arquivo salvo: ${data.apiMtlsCertFileName}` : 'Nenhum arquivo selecionado';
		}
		const mtlsInput = byId('apiMtlsCertFile');
		if (mtlsInput) mtlsInput.value = '';
	}

	function prepararBotoesEdicao(){
		const submitBtn = document.querySelector('#cadastroUnidadeForm button[type="submit"]');
		if (submitBtn) {
			// Texto puro: Salvar
			submitBtn.textContent = 'Salvar';
			submitBtn.classList.remove('btn-outline-secondary');
			submitBtn.classList.add('btn-outline-primary');
			submitBtn.title = 'Salvar';
			submitBtn.setAttribute('aria-label', 'Salvar');

			if (!byId('cancelarEdicaoBtn')) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'btn btn-outline-secondary ms-2';
				btn.id = 'cancelarEdicaoBtn';
				btn.title = 'Cancelar edição';
				btn.setAttribute('aria-label', 'Cancelar edição');
				// Texto puro: Cancelar
				btn.textContent = 'Cancelar';
				btn.onclick = cancelarEdicao;
				submitBtn.after(btn);
			}
		}
	}

	function preencherModulos(u){
		const modSel = byId('modulosAcessiveis');
		if (!modSel) return;
		const ids = (u.modulosAcessiveis || []).map(x => x && (x._id || x).toString());
		const todos = Array.isArray(window.todosModulos) ? window.todosModulos : [];
		const map = new Map(todos.map(m => [String(m._id), m]));
		modSel.innerHTML='';
		modSel.setAttribute('disabled','');
		modSel.setAttribute('aria-readonly','true');
		modSel.title = 'Selecione os módulos pelo botão Gerenciar; este campo é apenas exibição.';
		// Limpar hidden antigos antes de repovoar
		Array.from(document.querySelectorAll('input[name="modulosAcessiveis[]"]')).forEach(n=>n.remove());
		ids.forEach(id => {
			const m = map.get(String(id)); if (!m) return;
			const opt=document.createElement('option');
			opt.value=String(m._id); opt.textContent=m.nome + (m.status==='inativo'?' (inativo)':'');
			opt.selected=true; modSel.appendChild(opt);
			// hidden para submissão
			const hidden = document.createElement('input');
			hidden.type='hidden'; hidden.name='modulosAcessiveis[]'; hidden.value=String(m._id);
			const form = byId('cadastroUnidadeForm'); form && form.appendChild(hidden);
		});
	}

	// Impede qualquer interação direta no select de módulos (não deve alterar seleção)
	(function enforceReadOnlyModulos(){
		const sel = byId('modulosAcessiveis'); if (!sel) return;
		sel.addEventListener('mousedown', (e)=>{ e.preventDefault(); e.stopPropagation(); return false; });
		sel.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); return false; });
		sel.addEventListener('change', (e)=>{ e.preventDefault(); e.stopImmediatePropagation(); /* revert UI change if any */ sel.selectedIndex = -1; return false; });
	})();

	function preencherDiretor(u){
		try {
			const hiddenDiretorId = byId('diretor_usuario_id');
			const displayDiretor = byId('diretorUsuarioDisplay');
			const blocoDiretor   = byId('blocoDiretor');
			if (hiddenDiretorId && displayDiretor && blocoDiretor) {
				if (u.is_principal) {
					blocoDiretor.style.display='';
					const idSel = u.diretor_usuario_id ? String(u.diretor_usuario_id) : '';
					hiddenDiretorId.value = idSel;
					if (idSel && window.DiretorModule?.setDiretorById) {
						// Garante init antes de setar por ID
						try { window.DiretorModule.init?.(); } catch(_){ }
						const ok = window.DiretorModule.setDiretorById(idSel);
						// Fallback: tentar popular manualmente usando window.usuariosDiretor
						if (!ok) {
							try {
								const lista = Array.isArray(window.usuariosDiretor) ? window.usuariosDiretor : [];
								const alvo = lista.find(x => String(x._id || x.id) === String(idSel));
								if (alvo) {
									const nome = alvo.nome || (alvo.funcionario_id && (alvo.funcionario_id.nome || alvo.funcionario_id.name)) || alvo.name || alvo.fullName || '';
									const email = alvo.email || (alvo.user && alvo.user.email) || '';
									displayDiretor.value = `${nome}${email ? ', ' + email : ''}`.trim();
								}
							} catch(_){}
						}
					} else if (!idSel) {
						displayDiretor.value='';
					}
				} else {
					hiddenDiretorId.value=''; displayDiretor.value=''; blocoDiretor.style.display='none';
				}
			}
		} catch(_){ }
	}

	function dispararChangeMatriz(){ try { const m2=byId('matriz'); if (m2) m2.dispatchEvent(new Event('change',{bubbles:true})); } catch(_){ } }

	window.editar = function editar(id) {
		const cache = (Array.isArray(window.unidadesFiltradas) ? window.unidadesFiltradas : []).find(u => String(u._id) === String(id)) || {};
		// preenchimento rápido
		(function preencherBasico(u){
			const idEl = byId('unidadeId'); if (idEl && u._id) idEl.value = u._id;
			setVal('nomeFantasia', u.nome);
			setVal('razaoSocial', u.razaoSocial);
			setVal('cnpj', Validators.formatarCNPJInput(u.cnpj || ''));
			setVal('cpf', u.cpf || '');
			setVal('endereco', u.endereco);
		})(cache);

		// detalhe completo
		fetch(apiUnidades(`/${id}`), {
			credentials: 'same-origin'
		})
			.then(r => r.ok ? r.json() : Promise.reject())
			// A API padronizada retorna { success, data }. Desembrulhar antes de preencher.
			.then(payload => {
				if (payload && typeof payload === 'object' && 'data' in payload) {
					// Se por algum motivo vier duplamente aninhado { data: { data: {...} } }
					const d = payload.data;
					return (d && typeof d === 'object' && 'data' in d) ? d.data : d;
				}
				return payload;
			})
			.then(preencherCompleto)
			.catch(() => preencherCompleto(cache));

		function preencherCompleto(u){
			if (!u) return;
			console.debug('[EDITAR] Payload recebido para preenchimento:', sanitizeUnidadeForLog(u));
			setVal('unidadeId', u._id);
			setVal('nomeFantasia', u.nome);
			setVal('razaoSocial', u.razaoSocial);
			setVal('cnpj', Validators.formatarCNPJInput(u.cnpj || ''));
			setVal('cpf', u.cpf || '');
			setVal('endereco', u.endereco);
			// Preencher prévia da logo (se existir)
			try {
				const preview = byId('logoUnidadePreview');
				const hiddenLogo = byId('logoAtual');
				if (hiddenLogo) hiddenLogo.value = u.logo || '';
				if (preview) {
					// Sempre usar API para display (serverless-friendly)
					const apiUrl = `${BASE}/api/unidades/${u._id}/logo`;
					const sep = apiUrl.includes('?') ? '&' : '?';
					console.log('BASE in editar:', BASE);
					console.log('Setting logoUnidadePreview src to:', apiUrl + sep + 'v=' + Date.now());
					preview.src = apiUrl + sep + 'v=' + Date.now();
				}
			} catch(_){}
			setVal('inscricaoEstadual', u.inscricaoEstadual);
			try { const ieEl = byId('inscricaoEstadual'); if (ieEl){ ieEl.dispatchEvent(new Event('input',{bubbles:true})); ieEl.dispatchEvent(new Event('blur',{bubbles:true})); } } catch(_){ }
			setVal('inscricaoMunicipal', u.inscricaoMunicipal);
			setVal('cnaePrincipal', u.cnaePrincipal);
			setVal('cnaeSecundarios', u.cnaeSecundarios);
			setVal('regimeTributario', u.regimeTributario);
			setVal('naturezaJuridica', u.naturezaJuridica);
			setVal('dataAbertura', u.dataAbertura ? u.dataAbertura.split('T')[0] : '');
			setVal('telefoneFixo', u.telefoneFixo);
			setVal('telefoneCelular', u.telefoneCelular);
			setVal('emailPrincipal', u.emailPrincipal);
			setVal('emailFiscal', u.emailFiscal);
			setVal('site', u.site);
			console.debug('[EDITAR] Dados bancários recebidos:', { banco: u.banco, agencia: u.agencia, contaCorrente: u.contaCorrente });
			// Fallback: se a API não retornar algum campo, tenta preencher a partir do cache inicial
			const bancoVal = (u.banco != null && u.banco !== '') ? u.banco : (cache && cache.banco) ? cache.banco : '';
			const agenciaVal = (u.agencia != null && u.agencia !== '') ? u.agencia : (cache && cache.agencia) ? cache.agencia : '';
			const contaVal = (u.contaCorrente != null && u.contaCorrente !== '') ? u.contaCorrente : (cache && cache.contaCorrente) ? cache.contaCorrente : '';
			setVal('banco', bancoVal);

			const _ag = agenciaVal || u.agencia;
			if (_ag) {
				const partsAg = String(_ag).split('-');
				setVal('agenciaNumero', partsAg[0] || '');
				setVal('agenciaDV', partsAg[1] || '');
			} else { setVal('agenciaNumero',''); setVal('agenciaDV',''); }
			const _cc = contaVal || u.contaCorrente;
			if (_cc) {
				const partsCc = String(_cc).split('-');
				setVal('contaNumero', partsCc[0] || '');
				setVal('contaDV', partsCc[1] || '');
			} else { setVal('contaNumero',''); setVal('contaDV',''); }

			setVal('pixChave', u.pixChave);

			// Tipo pix
			(function(){
				const radios = document.querySelectorAll('input[name="tipoPix"]');
				if (!radios.length) return;
				let tipo = (u.tipoPix || '').trim();
				const chave = (u.pixChave || '').trim();
				if (!tipo && chave) {
					const dig = chave.replace(/\D/g,'');
					if (dig.length === 14) tipo = 'cnpj';
					else if (dig.length === 11) tipo = 'cpf';
					else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(chave)) tipo = 'email';
					else if (/^\+?\d{10,15}$/.test(dig)) tipo = 'telefone';
					else if (chave) tipo = 'aleatoria';
				}
				radios.forEach(r => r.checked = (r.value === tipo));
				const hidden = byId('tipoPixHidden'); if (hidden) hidden.value = tipo;
			})();

			// Aplicar máscara e validação PIX após preencher os dados
			setTimeout(() => detectarEAplicarMascaraPix({ forcar: true }), 100);

			// Tipo de unidade
			const matrizInput = byId('matriz');
			const filialInput = byId('filial');
			if (matrizInput && filialInput) {
				console.log('[EDITAR] Definindo radios - is_principal:', u.is_principal);
				matrizInput.checked = !!u.is_principal;
				filialInput.checked  = !u.is_principal;
			}
			// aplica a regra do select conforme o tipo
			setPrincipalSelect(!!u.is_principal);

			// Pequeno delay para garantir que o DOM seja atualizado
			setTimeout(() => {
				if (!u.is_principal) {
					const unidadePrincipalId = u.unidade_principal_id ? String(u.unidade_principal_id) : '';
					setVal('unidadePrincipal', unidadePrincipalId);
					console.log('[EDITAR] Definindo unidade principal:', unidadePrincipalId);
					console.log('[EDITAR] Valor original unidade_principal_id:', u.unidade_principal_id);
					console.log('[EDITAR] Tipo do valor:', typeof u.unidade_principal_id);

					// Disparar evento change para garantir que o select seja atualizado
					const selectEl = byId('unidadePrincipal');
					if (selectEl) {
						selectEl.dispatchEvent(new Event('change', { bubbles: true }));
						console.log('[EDITAR] Select unidadePrincipal atualizado');
						console.log('[EDITAR] Valor atual do select:', selectEl.value);
					}
				}
			}, 100);

			preencherApiCredenciais(u.apiBancaria);
			prepararBotoesEdicao();
			preencherModulos(u);
			preencherDiretor(u);
			dispararChangeMatriz();

			// Definir tipo de pessoa baseado no campo pessoaTipo do banco
			const pessoaTipoRadios = document.querySelectorAll('input[name="pessoaTipo"]');
			console.log('[EDITAR] pessoaTipo:', u.pessoaTipo, 'CPF:', u.cpf, 'CNPJ:', u.cnpj);

			if (pessoaTipoRadios.length > 0 && u.pessoaTipo) {
				pessoaTipoRadios.forEach(radio => {
					if (radio.value === u.pessoaTipo) radio.checked = true;
				});
			} else {
				// Fallback: inferir baseado nos dados (CPF/CNPJ)
				if (u.cpf) {
					pessoaTipoRadios.forEach(radio => {
						if (radio.value === 'pf') radio.checked = true;
					});
				} else if (u.cnpj) {
					pessoaTipoRadios.forEach(radio => {
						if (radio.value === 'pj') radio.checked = true;
					});
				}
			}

			// Disparar evento change para atualizar campos
			setTimeout(() => {
				const checkedRadio = document.querySelector('input[name="pessoaTipo"]:checked');
				if (checkedRadio) {
					checkedRadio.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}, 100);

			// Aplicar máscara do site se disponível
			const siteEl = byId('site');
			if (siteEl && window.WDMasks && window.WDMasks.applyURLMask) {
				window.WDMasks.applyURLMask(siteEl);
			}
		}
	};

	window.cancelarEdicao = function cancelarEdicao() {
		const form = byId('cadastroUnidadeForm');
		if (!form) return;
		form.reset();
		resetApiCredenciaisDom();
		// Resetar prévia da logo e hidden
		try{
			const prev = byId('logoUnidadePreview');
			const hiddenLogo = byId('logoAtual');
			if (hiddenLogo) hiddenLogo.value = '';
			if (prev) prev.src = `${BASE}/img/placeholder-logo.svg`;
		}catch(_){ }
		const unidadeId = byId('unidadeId'); if (unidadeId) unidadeId.value = '';
		const matriz = byId('matriz'); if (matriz) matriz.disabled = false;
		const filial = byId('filial'); if (filial) filial.disabled = false;
		const submitBtn = document.querySelector('#cadastroUnidadeForm button[type="submit"]');
		if (submitBtn) {
			// Texto puro: Cadastrar
			submitBtn.textContent = 'Cadastrar';
			submitBtn.title = 'Cadastrar';
			submitBtn.setAttribute('aria-label', 'Cadastrar');
			submitBtn.classList.remove('btn-outline-secondary');
			submitBtn.classList.add('btn-outline-primary');
		}
		const btn = byId('cancelarEdicaoBtn'); if (btn) btn.remove();
		const modSel = byId('modulosAcessiveis'); if (modSel) modSel.innerHTML = '';
		try { const hid = byId('diretor_usuario_id'); const disp = byId('diretorUsuarioDisplay'); if (hid) hid.value = ''; if (disp) disp.value = ''; } catch(_){ }
		if (window.DiretorModule?.atualizarVisibilidade) window.DiretorModule.atualizarVisibilidade();

		// volta a regra inicial do select (sempre desativado)
		setPrincipalSelect(true);
	};

	// ===================== Delegação de ações na tabela =====================
	document.addEventListener('click', async function (e) {
		const btn = e.target.closest('[data-action]');
		if (!btn) return;
		const action = btn.getAttribute('data-action');
		try {
			if (action === 'editar') {
				const id = btn.getAttribute('data-id') || btn.closest('tr')?.getAttribute('data-id');
				if (id) window.editar(id);
			}
			if (action === 'excluir') {
				const id = btn.getAttribute('data-id') || btn.closest('tr')?.getAttribute('data-id');
				if (!id) return;
				const tr = btn.closest('tr');
				const nome = tr?.querySelector('.td-nome span')?.textContent || tr?.querySelector('.td-nome')?.textContent || '';
				const ok = await askDeleteUnidadeConfirm(nome);
				if (!ok) return;
				const res = await fetch(apiUnidades(`/${id}`), { 
					method: 'DELETE', 
					headers: { 'Accept': 'application/json' },
					credentials: 'same-origin'
				});
				if (res.ok) location.reload();
				else { const data = await res.json().catch(() => ({})); alert(data.error || 'Falha ao excluir a unidade.'); }
			}
			if (action === 'toggleAccess') {
				const checks = Array.from(document.querySelectorAll('.unit-checkbox:checked'));
				if (!checks.length) { alert('Selecione ao menos uma unidade.'); return; }
				const ids = checks.map(ch => ch.getAttribute('data-id'));
				const allActive = checks.every(ch => String(ch.closest('tr')?.getAttribute('data-is-active')) === 'true');
				const activate = !allActive;
				const res = await fetch(apiUnidades('/toggle-access'), {
					method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
					body: JSON.stringify({ unitIds: ids, activate })
				});
				if (res.ok) location.reload();
				else { const data = await res.json().catch(() => ({})); alert(data.error || 'Não foi possível atualizar o acesso.'); }
			}
		} catch (err) {
			console.error('Ação falhou:', action, err);
			alert('Falha na ação: ' + (action || ''));
		}
	});

	// ===================== Submit do formulário =====================
	window.cadastrarUnidade = async function (e) {
		console.log('[FRONTEND] Função cadastrarUnidade chamada');
		try {
			if (e && typeof e.preventDefault === 'function') e.preventDefault();

			// Regra: Se Filial, forçar Pessoa Jurídica e exigir Matriz selecionada
			const isFilial = !!byId('filial')?.checked;
			const isMatriz = !!byId('matriz')?.checked;
			const unidadePrincipalSel = byId('unidadePrincipal')?.value || '';
			if (isFilial) {
				lockPessoaTipoForFilial(true);
				if (!unidadePrincipalSel) {
					alert('Selecione a Matriz para a Filial.');
					return false;
				}
			}

			// Capturar tipo de pessoa antes das validações específicas
			const pessoaTipo = document.querySelector('input[name="pessoaTipo"]:checked')?.value;

			// CNPJ: validar somente para Pessoa Jurídica
			if (pessoaTipo === 'pj' && cnpjEl) {
				console.log('[FRONTEND] Validando CNPJ:', cnpjEl.value);
				const ok = validarCNPJValor(cnpjEl.value);
				console.log('[FRONTEND] CNPJ válido:', ok);
				if (!ok) { marcarCNPJInvalido(cnpjEl, true); alert('CNPJ inválido'); return false; }
				// Se filial e um CNPJ foi preenchido, validar base com a Matriz selecionada
				if (isFilial && cnpjEl.value) {
					const matrizCNPJ = getMatrizCnpjDigits();
					const cnpjDigits = cnpjEl.value.replace(/\D/g,'');
					if (matrizCNPJ && cnpjDigits.length === 14) {
						const baseMatriz = matrizCNPJ.slice(0,8);
						const baseInformada = cnpjDigits.slice(0,8);
						const sufixo = cnpjDigits.slice(8,12);
						if (baseInformada !== baseMatriz || sufixo === '0001') {
							alert('Para Filial, o CNPJ deve pertencer à base da Matriz selecionada e ter sufixo diferente de 0001.');
							return false;
						}
					}
				}
			}

			// CPF (se pessoa física selecionada)
			console.log('[FRONTEND] pessoaTipo selecionado:', pessoaTipo);
			const cpfEl = byId('cpf');
			if (pessoaTipo === 'pf' && cpfEl) {
				const cpfDigits = cpfEl.value.replace(/\D/g, '');
				if (cpfDigits.length !== 11) {
					cpfEl.classList.add('is-invalid');
					alert('CPF deve ter 11 dígitos');
					return false;
				}
				const ok = window.WDMasks && window.WDMasks.isValidCPF ? window.WDMasks.isValidCPF(cpfEl.value) : false;
				if (!ok) {
					cpfEl.classList.add('is-invalid');
					alert('CPF inválido');
					return false;
				}
			}

			// IE por UF
			const ieEl = byId('inscricaoEstadual');
			const enderecoEl = byId('endereco');
			const ufAtual = extrairUFDoEndereco(enderecoEl ? enderecoEl.value : '');
			const ieOk = validarIEPorUF(ieEl ? ieEl.value : '', ufAtual);
			if (!ieOk) {
				if (ieEl) { ieEl.classList.add('is-invalid'); ieEl.style.borderColor = 'red'; ieEl.title = ufAtual ? `Inscrição Estadual inválida para ${ufAtual}` : 'Inscrição Estadual inválida'; }
				alert(`Inscrição Estadual inválida${ufAtual ? ' para ' + ufAtual : ''}. Verifique o formato.`);
				return false;
			}

			const unidadeId = byId('unidadeId')?.value || '';
			const isEdit = !!unidadeId;
			// isMatriz/isFilial já calculados acima
			const unidadePrincipal = byId('unidadePrincipal')?.value || '';

			const pixChaveVal = byId('pixChave')?.value?.trim() || '';
			let tipoPixVal = (document.querySelector('input[name="tipoPix"]:checked')?.value) || byId('tipoPixHidden')?.value || '';
			if (!tipoPixVal && pixChaveVal) {
				selecionarTipoPix(detectarTipoPix(pixChaveVal));
				tipoPixVal = (document.querySelector('input[name="tipoPix"]:checked')?.value) || byId('tipoPixHidden')?.value || '';
			}

			const modSel = byId('modulosAcessiveis');
			const modulos = modSel ? Array.from(modSel.options).filter(o => o.selected).map(o => o.value) : [];
			// Diretriz atual: campo diretor é somente exibição na edição.
			// Não enviamos diretor_usuario_id no submit; o vínculo é gerenciado via cadastro de usuário diretor.
			const diretorId = '';

			const payload = {
				nomeFantasia: byId('nomeFantasia')?.value || '',
				razaoSocial:  byId('razaoSocial')?.value || '',
				cnpj:         byId('cnpj')?.value || '',
				cpf:          byId('cpf')?.value || '',
				pessoaTipo:   document.querySelector('input[name="pessoaTipo"]:checked')?.value || '',
				endereco:     byId('endereco')?.value || '',
				inscricaoEstadual:  byId('inscricaoEstadual')?.value || '',
				inscricaoMunicipal: byId('inscricaoMunicipal')?.value || '',
				cnaePrincipal:      byId('cnaePrincipal')?.value || '',
				cnaeSecundarios:    byId('cnaeSecundarios')?.value || '',
				regimeTributario:   byId('regimeTributario')?.value || '',
				naturezaJuridica:   byId('naturezaJuridica')?.value || '',
				dataAbertura:       byId('dataAbertura')?.value || '',
				telefoneFixo:       byId('telefoneFixo')?.value || '',
				telefoneCelular:    byId('telefoneCelular')?.value || '',
				emailPrincipal:     byId('emailPrincipal')?.value || '',
				emailFiscal:        byId('emailFiscal')?.value || '',
				site:               byId('site')?.value || '',
				banco:              byId('banco')?.value || '',
				agencia: '',
				contaCorrente: '',
				pixChave: pixChaveVal,
				tipoPix:  tipoPixVal,
				modulosAcessiveis: modulos,
				subunidade: String(isFilial),
				unidadePrincipal: isFilial ? (unidadePrincipal || null) : null,
				// não enviar diretor_usuario_id; backend mantém vínculo pelo usuário
				// diretor_usuario_id: null
			};
			if (!isEdit) payload.principal = String(isMatriz);

			// agência/conta
			const agenciaNumero = (byId('agenciaNumero')?.value || '').trim();
			const agenciaDV     = (byId('agenciaDV')?.value || '').trim();
			const contaNumero   = (byId('contaNumero')?.value || '').trim();
			const contaDV       = (byId('contaDV')?.value || '').trim();
			function validaAgencia(num, dv){
				if (!num && !dv) return '';
				if (!/^\d{1,5}$/.test(num)) return 'Número da agência inválido (1-5 dígitos).';
				if (dv && !/^[0-9Xx]{1,2}$/.test(dv)) return 'DV da agência inválido.';
				return null;
			}
			function validaConta(num, dv){
				if (!num && !dv) return '';
				if (!/^\d{1,12}$/.test(num)) return 'Número da conta inválido (1-12 dígitos).';
				if (dv && !/^[0-9Xx]{1,2}$/.test(dv)) return 'DV da conta inválido.';
				return null;
			}
			const errAg = validaAgencia(agenciaNumero, agenciaDV);
			if (typeof errAg === 'string' && errAg) { alert(errAg); return false; }
			const errCc = validaConta(contaNumero, contaDV);
			if (typeof errCc === 'string' && errCc) { alert(errCc); return false; }
			payload.agencia = agenciaNumero ? (agenciaDV ? `${agenciaNumero}-${agenciaDV.toUpperCase()}` : agenciaNumero) : '';
			payload.contaCorrente = contaNumero ? (contaDV ? `${contaNumero}-${contaDV.toUpperCase()}` : contaNumero) : '';

			const url = isEdit ? apiUnidades(`/${unidadeId}`) : apiUnidades('');
			const method = isEdit ? 'PUT' : 'POST';

			console.log('[FRONTEND] Enviando requisição:', { url, method, payload });

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
				credentials: 'same-origin', // Adicionar credenciais
				body: JSON.stringify(payload)
			});

			console.log('[FRONTEND] Resposta recebida:', { status: res.status, statusText: res.statusText });
			const data = await res.json().catch(() => ({}));
			console.log('[FRONTEND] Dados da resposta:', data);
			if (!res.ok) {
				console.error('[FRONTEND] Erro na resposta:', { status: res.status, data });
				alert(data.error || data.message || 'Falha ao salvar unidade.');
				return false;
			}

			// Sucesso: se for novo cadastro, apenas limpar o formulário para o próximo
			if (!isEdit) {
				try {
					const form = byId('cadastroUnidadeForm');
					form?.reset();
					resetApiCredenciaisDom();

					// Reset prévia da logo e hidden
					try {
						const prev = byId('logoUnidadePreview');
						const hiddenLogo = byId('logoAtual');
						if (hiddenLogo) hiddenLogo.value = '';
						if (prev) prev.src = `${BASE}/img/placeholder-logo.svg`;
					} catch(_) {}

					// Garantir radios padrão e estado inicial de Matriz
					const matriz = byId('matriz');
					const filial = byId('filial');
					if (matriz && filial) { matriz.checked = true; filial.checked = false; }
					setPrincipalSelect(true);

					// Limpar estado PIX
					try {
						document.querySelectorAll('input[name="tipoPix"]').forEach(r=>{ r.checked = false; });
						const hidden = byId('tipoPixHidden'); if (hidden) hidden.value = '';
						const pix = byId('pixChave'); pix?.classList.remove('is-valid','is-invalid'); if (pix) pix.value = '';
						updatePixHelp();
					} catch(_) {}

					// Voltar Pessoa Física como padrão (e alternar campos)
					try {
						const pf = byId('pessoaFisica'); const pj = byId('pessoaJuridica');
						if (pf && pj) { pf.checked = true; pj.checked = false; }
						togglePessoaFields(true);
					} catch(_) {}

					// Foco no primeiro campo
					byId('nomeFantasia')?.focus();

					alert('Unidade cadastrada com sucesso. Formulário pronto para o próximo cadastro.');
				} catch(err){ console.warn('Falha ao resetar formulário pós-cadastro', err); }
				return false;
			}

			// Para edição, manter comportamento atual de recarregar a página
			location.reload();
			return false;
		} catch (err) {
			console.error('Falha ao enviar formulário de unidade:', err);
			alert('Erro inesperado ao salvar a unidade.');
			return false;
		}
	};

	// ===================== Inicializações de módulos externos =====================
	try { if (window.BancoModule?.init) window.BancoModule.init(); } catch(_){}
	try { if (window.DiretorModule?.init) window.DiretorModule.init(); } catch(_){}
	try { if (window.DiretorModule?.atualizarVisibilidade) window.DiretorModule.atualizarVisibilidade(); } catch(_){}

	// Higiene global de backdrops
	document.addEventListener('hidden.bs.modal', function(){
		setTimeout(()=>{
			const aberto = document.querySelector('.modal.show');
			if (!aberto) {
				document.querySelectorAll('.modal-backdrop').forEach(b=>b.remove());
				document.body.classList.remove('modal-open');
				document.body.style.removeProperty('padding-right');
			}
		}, 80);
	});

	// ===================== Navegação entre abas (Próximo/Voltar) =====================
	(function navAbas(){
		const ordem=['abaDadosGerais','abaDadosEmpresariais','abaContatos','abaBancarios','abaCredenciais'];
		function ir(idx){ if(idx<0||idx>=ordem.length) return; const trg=document.querySelector(`[data-bs-target="#${ordem[idx]}"]`); if(trg){ new bootstrap.Tab(trg).show(); } }
		function indiceAtual(){ return ordem.findIndex(id=>byId(id)?.classList.contains('active')); }
		document.querySelectorAll('[data-nav="next"]').forEach(btn=>btn.addEventListener('click', e=>{ e.preventDefault(); const i=indiceAtual(); if(i>-1) ir(i+1); }));
		document.querySelectorAll('[data-nav="prev"]').forEach(btn=>btn.addEventListener('click', e=>{ e.preventDefault(); const i=indiceAtual(); if(i>-1) ir(i-1); }));
	})();

	// Esconde linhas não principais no carregamento (reforço)
	(function ocultarNaoPrincipaisInicialmente(){
		const naoPrincipais = document.querySelectorAll('tr.unidade-row:not([data-principal="true"])');
		naoPrincipais.forEach(tr => { tr.style.display = 'none'; });
	})();

	// Exportar funções PIX para uso global
	window.detectarTipoPix = detectarTipoPix;
	window.selecionarTipoPix = selecionarTipoPix;
	window.aplicarMascaraPix = aplicarMascaraPix;
	window.validarChavePix = validarChavePix;
	window.detectarEAplicarMascaraPix = detectarEAplicarMascaraPix;

	// ===================== Fallback: hidratar via API quando SSR vier vazio =====================
	(async function hydrateIfEmpty(){
		try {
			const tbody = document.querySelector('#tabelaUnidades tbody');
			if (!tbody) return;
			const hasRows = !!tbody.querySelector('tr.unidade-row');
			if (hasRows) return; // já tem linhas renderizadas no SSR
			const resp = await fetch(apiUnidades(''), { credentials: 'same-origin', headers: { 'Accept':'application/json' } });
			if (!resp.ok) return;
			const payload = await resp.json().catch(()=>null);
			if (!payload) return;
			const data = ('data' in payload) ? payload.data : payload;
			const unidades = Array.isArray(data) ? data : (Array.isArray(data?.unidades) ? data.unidades : []);
			const principais = Array.isArray(data?.principalUnits) ? data.principalUnits : unidades.filter(u=>u.is_principal || u.subunidade===false || u.subunidade==='false');
			if (!Array.isArray(unidades)) return;
			window.unidadesFiltradas = unidades;
			// Renderizar linhas
			const fmtDoc = (u)=>{
				const isFilial = !!u.subunidade;
				const id = String(u._id||'');
				const cpf = (u.cpf||'').replace(/\D/g,'');
				const cpfFmt = cpf.length===11 ? cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : (u.cpf||'');
				const cnpj = (u.cnpj||'').replace(/\D/g,'');
				const cnpjFmt = cnpj.length===14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (u.cnpj||'');
				const tipoDoc = (u.pessoaTipo==='pf');
				return `
				<tr class="unidade-row ${isFilial?('filial-row filial-of-'+(u.unidade_principal_id||'')) : ''}"
					data-id="${id}" data-principal="${u.is_principal?'true':'false'}" data-unidade-principal-id="${u.unidade_principal_id||''}" data-is-active="true">
					<td></td>
					<td>${u.codigo||''}</td>
					<td class="td-nome"><span>${u.nome||''}</span></td>
					<td>${isFilial?'Filial':'Matriz'}</td>
					<td>${tipoDoc?cpfFmt:cnpjFmt}</td>
					<td>${u.endereco||''}</td>
					<td class="td-provisioning text-start" data-provisioning-cell data-unidade-id="${id}" data-provisioning-state="idle">
						<div class="prov-summary">
							<div class="prov-line-1"><span class="badge text-bg-warning text-dark">Pendente</span></div>
							<div class="prov-line-2">ver detalhes</div>
						</div>
					</td>
					<td>
						<div class="d-flex gap-1 justify-content-center flex-nowrap">
							<button type="button" class="wdg-icon-btn" data-action="abrirDetalhes" data-id="${id}" title="Detalhes" aria-label="Detalhes">
								<img src="${BASE}/images/detalhe.png" alt="Detalhes" onerror="this.replaceWith(document.createElement('i')); this.previousSibling?.remove();">
							</button>
							<button type="button" class="wdg-icon-btn" data-action="editar" data-id="${id}" title="Editar" aria-label="Editar">
								<img src="${BASE}/images/editar.png" alt="Editar" onerror="this.outerHTML='&lt;i class=\'bi bi-pencil\'&gt;&lt;/i&gt;'" />
							</button>
							<button type="button" class="wdg-icon-btn" data-action="excluir" data-id="${id}" title="Excluir" aria-label="Excluir">
								<img src="${BASE}/images/excluir.png" alt="Excluir" onerror="this.outerHTML='&lt;i class=\'bi bi-trash\'&gt;&lt;/i&gt;'" />
							</button>
						</div>
					</td>
				</tr>`;
			};
			tbody.innerHTML = unidades.length ? unidades.map(fmtDoc).join('') : '<tr><td colspan="8" class="text-center text-muted">Nenhuma unidade cadastrada.</td></tr>';
			// Popular select de matrizes
			const sel = document.getElementById('unidadePrincipal');
			if (sel) {
				sel.innerHTML = '<option value="">Selecione...</option>' + (principais||[]).map(u=>`<option value="${u._id}" data-cnpj="${u.cnpj||''}">${(u.codigo&&u.nome)?(u.codigo+' - '+u.nome):(u.nome||'')}</option>`).join('');
			}
			// Reclassificar e esconder filiais inicialmente
			try { inicializarFiliaisOrfas(); document.querySelectorAll('tr.filial-row').forEach(tr => { tr.classList.add('filial-hidden'); tr.style.display = 'none'; }); } catch(_){ }
			notifyTabelaUnidadesRenderizada();
		} catch(e) { console.warn('[unidades.js] fallback hidratação falhou:', e); }
	})();
});

