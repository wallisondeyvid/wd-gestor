/* =========================================================================
 * FORM SUBMIT UNIDADE — Cópia íntegra de public/js/form-submit-unidade.js
 * ========================================================================= */
(function(){
	// Detecta BASE (prefixo do app, ex: '/gestor') para evitar 404 nas rotas
	const BASE = (function(){
		// Preferências: atributo no body, variável global definida por outros módulos
		let bp = (document.body && document.body.getAttribute('data-base-path'))
			|| window.__APP_BASE_PATH__
			|| window.basePathGlobal
			|| '';
		if (!bp) {
			try {
				const path = window.location.pathname || '';
				if (path.startsWith('/gestor')) bp = '/gestor';
			} catch(_) {}
		}
		if (!bp) bp = '';
		return String(bp).replace(/\/$/, '');
	})();

	const V = window.Validators || {};
	const DEBUG_UNIDADES = (() => {
		try {
			return window.WDG_DEBUG_UNIDADES === true || window.localStorage?.getItem('WDG_DEBUG_UNIDADES') === '1';
		} catch (_) {
			return window.WDG_DEBUG_UNIDADES === true;
		}
	})();

	function debugLog(message, payload){
		if (!DEBUG_UNIDADES) return;
		if (arguments.length > 1) console.debug(message, payload);
		else console.debug(message);
	}

	function sanitizeApiBancariaForLog(apiBancaria){
		if (!apiBancaria || typeof apiBancaria !== 'object') return apiBancaria;
		const safe = { ...apiBancaria };
		['apiHeaderValue','apiQueryParamValue','apiBasicPassword','apiOauthClientSecret','apiMtlsPassword','apiMtlsCertFileData'].forEach((key) => {
			if (key in safe) safe[key] = '[REDACTED]';
		});
		return safe;
	}

	function sanitizePayloadForLog(payload){
		if (!payload || typeof payload !== 'object') return payload;
		const safe = { ...payload };
		['nomeFantasia','razaoSocial','cpf','cnpj','endereco','inscricaoEstadual','inscricaoMunicipal','cnaePrincipal','cnaeSecundarios','emailPrincipal','emailFiscal','telefoneFixo','telefoneCelular','site','banco','agencia','contaCorrente','pixChave'].forEach((key) => {
			if (key in safe && safe[key]) safe[key] = '[REDACTED]';
		});
		if (safe.apiBancaria) safe.apiBancaria = sanitizeApiBancariaForLog(safe.apiBancaria);
		return safe;
	}

	// Utilitário local: lê arquivo e retorna Data URL (Promise)
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

	// Atualiza a tabela de unidades sem recarregar a página
	async function refreshUnitsTable(){
		try {
			const url = window.location.href.split('#')[0];
			const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
			if (!res.ok) return;
			const html = await res.text();
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');
			const newTbody = doc.querySelector('#tabelaUnidades tbody');
			const table = document.getElementById('tabelaUnidades');
			if (newTbody && table) {
				const oldTbody = table.querySelector('tbody');
				if (oldTbody) oldTbody.replaceWith(newTbody);
				// Esconde filiais por padrão (alinha com comportamento inicial)
				newTbody.querySelectorAll('tr.filial-row').forEach(tr => { tr.classList.add('filial-hidden'); tr.style.display = 'none'; });
			}
			// Atualiza dataset global de unidades para ações como editar
			try {
				const jsonEl = doc.getElementById('unidadesJson');
				if (jsonEl && jsonEl.textContent) {
					window.unidadesFiltradas = JSON.parse(jsonEl.textContent);
				}
			} catch(_) {}
		} catch(err){ console.warn('[refreshUnitsTable] Falha ao atualizar tabela dinamicamente', err); }
	}

	async function buildApiBancariaPayload(){
		const getVal = (id) => {
			const el = document.getElementById(id);
			return el ? String(el.value || '').trim() : '';
		};
		const payload = {
			tipoAutenticacaoAPI: getVal('tipoAutenticacaoAPI'),
			apiHeaderName: getVal('apiHeaderName'),
			apiHeaderValue: getVal('apiHeaderValue'),
			apiQueryParamName: getVal('apiQueryParamName'),
			apiQueryParamValue: getVal('apiQueryParamValue'),
			apiBasicUser: getVal('apiBasicUser'),
			apiBasicPassword: getVal('apiBasicPassword'),
			apiOauthClientId: getVal('apiOauthClientId'),
			apiOauthClientSecret: getVal('apiOauthClientSecret'),
			apiOauthScope: getVal('apiOauthScope'),
			apiOauthTokenUrl: getVal('apiOauthTokenUrl'),
			apiBaseUrl: getVal('apiBaseUrl'),
			apiTokenUrlGenerica: getVal('apiTokenUrlGenerica'),
			apiMtlsPassword: getVal('apiMtlsPassword')
		};
		const mtlsInput = document.getElementById('apiMtlsCertFile');
		if (mtlsInput && mtlsInput.files && mtlsInput.files[0]) {
			const file = mtlsInput.files[0];
			payload.apiMtlsCertFileName = file.name;
			try {
				payload.apiMtlsCertFileData = await readFileAsDataURL(file);
			} catch (e) {
				console.warn('[buildApiBancariaPayload] Falha ao ler certificado mTLS', e);
			}
		}
		Object.keys(payload).forEach((key) => {
			if (payload[key] === '') delete payload[key];
		});
		return payload;
	}

	function resetApiBancariaFields(){
		const ids = [
			'tipoAutenticacaoAPI','apiHeaderName','apiHeaderValue','apiQueryParamName','apiQueryParamValue',
			'apiBasicUser','apiBasicPassword','apiOauthClientId','apiOauthClientSecret','apiOauthScope',
			'apiOauthTokenUrl','apiBaseUrl','apiTokenUrlGenerica','apiMtlsPassword'
		];
		ids.forEach(id => {
			const el = document.getElementById(id);
			if (el) el.value = '';
		});
		const select = document.getElementById('tipoAutenticacaoAPI');
		if (select) {
			select.value = '';
			try { select.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){ }
		}
		const mtlsInput = document.getElementById('apiMtlsCertFile');
		if (mtlsInput) mtlsInput.value = '';
		const mtlsStatus = document.getElementById('apiMtlsFileName');
		if (mtlsStatus) mtlsStatus.textContent = 'Nenhum arquivo selecionado';
	}
	async function cadastrarUnidade(e){
		try {
			if(e && typeof e.preventDefault==='function') e.preventDefault();

			// Guardar possível id criado para uso em upload de logo pós-criação
			let createdId = '';

			// Validação do tipo de pessoa (e usar isso para validar CNPJ/CPF corretamente)
			const pessoaTipo = document.querySelector('input[name="pessoaTipo"]:checked')?.value;
			debugLog('[unidades:submit] pessoaTipo capturado', { pessoaTipo });
      
			// Tentar uma abordagem alternativa
			const pessoaTipoAlt = document.querySelector('input[name="pessoaTipo"]:checked');
			debugLog('[unidades:submit] radio pessoaTipo encontrado', { found: Boolean(pessoaTipoAlt) });
      
			if (!pessoaTipo || !['pf', 'pj'].includes(pessoaTipo)) {
				debugLog('[unidades:submit] pessoaTipo inválido', { pessoaTipo });
				alert('Tipo de pessoa deve ser Pessoa Física (PF) ou Pessoa Jurídica (PJ).');
				return false;
			}

			// Validações específicas por tipo de pessoa
			if (pessoaTipo === 'pf') {
				const cpfEl = document.getElementById('cpf');
				if (cpfEl) {
					const cpfDigits = cpfEl.value.replace(/\D/g, '');
					if (cpfDigits.length !== 11) {
						cpfEl.classList.add('is-invalid');
						alert('CPF deve ter 11 dígitos');
						return false;
					}
					const ok = V.validarCPFValor ? V.validarCPFValor(cpfEl.value) : false;
					if (!ok) {
						cpfEl.classList.add('is-invalid');
						alert('CPF inválido');
						return false;
					}
				}
			} else if (pessoaTipo === 'pj') {
				const cnpjEl = document.getElementById('cnpj');
				if (cnpjEl) {
					const cnpjDigits = (cnpjEl.value || '').replace(/\D/g, '');
					if (cnpjDigits.length !== 14) {
						V.marcarCNPJInvalido && V.marcarCNPJInvalido(cnpjEl, true);
						alert('CNPJ deve ter 14 dígitos');
						return false;
					}
					const ok = V.validarCNPJValor ? V.validarCNPJValor(cnpjEl.value) : true;
					if (!ok) {
						V.marcarCNPJInvalido && V.marcarCNPJInvalido(cnpjEl, true);
						alert('CNPJ inválido');
						return false;
					}
				}
			}

			const ieEl=document.getElementById('inscricaoEstadual'); const enderecoEl=document.getElementById('endereco'); const ufAtual= V.extrairUFDoEndereco? V.extrairUFDoEndereco(enderecoEl?enderecoEl.value:'') : ''; const ieOk= V.validarIEPorUF? V.validarIEPorUF(ieEl?ieEl.value:'', ufAtual):true; if(!ieOk){ if(ieEl){ ieEl.classList.add('is-invalid'); ieEl.style.borderColor='red'; ieEl.title= ufAtual?`Inscrição Estadual inválida para ${ufAtual}`:'Inscrição Estadual inválida'; } alert(`Inscrição Estadual inválida${ufAtual? ' para '+ufAtual:''}. Verifique o formato.`); return false; }
			const unidadeId=document.getElementById('unidadeId')?.value || ''; const isEdit=!!unidadeId; const isMatriz=!!document.getElementById('matriz')?.checked; const isFilial=!!document.getElementById('filial')?.checked; const unidadePrincipal=document.getElementById('unidadePrincipal')?.value || '';
			const pixChaveVal=document.getElementById('pixChave')?.value?.trim() || ''; let tipoPixVal=(document.querySelector('input[name="tipoPix"]:checked')?.value) || document.getElementById('tipoPixHidden')?.value || ''; if(!tipoPixVal && pixChaveVal && window.PixModule){ window.PixModule.detectarEAplicarMascaraPix({forcar:true}); tipoPixVal=(document.querySelector('input[name="tipoPix"]:checked')?.value) || document.getElementById('tipoPixHidden')?.value || ''; }
			// Coleta de módulos selecionados via inputs hidden (campo visual é somente exibição)
			const hiddenMods = Array.from(document.querySelectorAll('input[name="modulosAcessiveis[]"]')).map(i=>String(i.value));
			let modulos = hiddenMods;
			// Fallback de segurança: se não houver hidden, lê do <select multiple>
			if (!modulos.length) {
				try {
					const sel = document.getElementById('modulosAcessiveis');
					if (sel) modulos = Array.from(sel.options).filter(o => o.selected).map(o => String(o.value));
				} catch(_) {}
			}
			const diretorId=isMatriz ? (document.getElementById('diretor_usuario_id')?.value || '') : '';
			function val(id){ return document.getElementById(id)?.value || ''; }
	if (isFilial && !unidadePrincipal) { alert('Selecione a Matriz antes de salvar a Filial.'); const sel=document.getElementById('unidadePrincipal'); if(sel) sel.focus(); return false; }
			const payload={ nomeFantasia: val('nomeFantasia'), razaoSocial: val('razaoSocial'), cnpj: val('cnpj'), cpf: val('cpf'), pessoaTipo: document.querySelector('input[name="pessoaTipo"]:checked')?.value || '', endereco: val('endereco'), inscricaoEstadual: val('inscricaoEstadual'), inscricaoMunicipal: val('inscricaoMunicipal'), cnaePrincipal: val('cnaePrincipal'), cnaeSecundarios: val('cnaeSecundarios'), regimeTributario: val('regimeTributario'), naturezaJuridica: val('naturezaJuridica'), dataAbertura: val('dataAbertura'), telefoneFixo: val('telefoneFixo'), telefoneCelular: val('telefoneCelular'), emailPrincipal: val('emailPrincipal'), emailFiscal: val('emailFiscal'), site: val('site'), banco: val('banco'), agencia:'', contaCorrente:'', pixChave: pixChaveVal, tipoPix: tipoPixVal, modulosAcessiveis: modulos, subunidade: String(isFilial), unidadePrincipal: isFilial ? (unidadePrincipal || null) : null, diretor_usuario_id: diretorId || null };
			payload.apiBancaria = await buildApiBancariaPayload();
			// Garantir preservação da logo no update (se backend não preservar automaticamente)
			const logoAtual = document.getElementById('logoAtual')?.value || '';
			if (logoAtual) payload.logo = logoAtual;
			debugLog('[unidades:submit] payload sanitizado', sanitizePayloadForLog(payload));
			if(!isEdit) payload.principal=String(isMatriz);
			const agenciaNumero=val('agenciaNumero').trim(); const agenciaDV=val('agenciaDV').trim(); const contaNumero=val('contaNumero').trim(); const contaDV=val('contaDV').trim();
			function validaAg(num,dv){ if(!num && !dv) return ''; if(!/^\d{1,5}$/.test(num)) return 'Número da agência inválido (1-5 dígitos).'; if(dv && !/^[0-9Xx]{1,2}$/.test(dv)) return 'DV da agência inválido.'; return null; }
			function validaCc(num,dv){ if(!num && !dv) return ''; if(!/^\d{1,12}$/.test(num)) return 'Número da conta inválido (1-12 dígitos).'; if(dv && !/^[0-9Xx]{1,2}$/.test(dv)) return 'DV da conta inválido.'; return null; }
			const errAg=validaAg(agenciaNumero,agenciaDV); if(typeof errAg==='string' && errAg){ alert(errAg); return false; } const errCc=validaCc(contaNumero,contaDV); if(typeof errCc==='string' && errCc){ alert(errCc); return false; }
			payload.agencia = agenciaNumero ? (agenciaDV ? `${agenciaNumero}-${agenciaDV.toUpperCase()}` : agenciaNumero) : ''; payload.contaCorrente = contaNumero ? (contaDV ? `${contaNumero}-${contaDV.toUpperCase()}` : contaNumero) : '';
			debugLog('[unidades:submit] request sanitizada', { url: isEdit ? `${BASE}/api/unidades/${unidadeId}` : `${BASE}/api/unidades`, method: isEdit? 'PUT':'POST', payload: sanitizePayloadForLog(payload) });
			const url = isEdit ? `${BASE}/api/unidades/${unidadeId}` : `${BASE}/api/unidades`;
			const method=isEdit? 'PUT':'POST';
			let res, data;
			try {
				res = await fetch(url,{ 
					method, 
					headers:{ 'Content-Type':'application/json','Accept':'application/json' }, 
					body: JSON.stringify(payload),
					credentials: 'same-origin'
				});
			} catch(netErr){
				console.error('[cadastrarUnidade] Falha de rede ou fetch', netErr);
				alert('Falha de rede ao tentar salvar (ver console).');
				return false;
			}
			const rawText = await res.text();
			try { data = rawText? JSON.parse(rawText): {}; } catch(parseErr){ data = { parseError:true, raw: rawText }; }
			if(!res.ok){
				console.error('[cadastrarUnidade] Erro resposta', { status: res.status, message: data?.message || data?.error || null });
				alert(data.error || data.message || (`Falha ao salvar unidade (HTTP ${res.status}).`));
				return false;
			}
			// Extrair ID (para upload de logo pós-criação e outras necessidades). Evitar reabrir após PUT.
			try {
				const unwrap = (obj)=>{
					if (!obj || typeof obj !== 'object') return obj;
					if ('data' in obj && obj.data) return unwrap(obj.data);
					return obj;
				};
				const flat = unwrap(data);
				let id = String(flat?._id || flat?.id || '').trim();
				if (!id && isEdit) { id = document.getElementById('unidadeId')?.value || ''; }
				createdId = id || createdId;
				if (!isEdit) {
					// Não reabrir automaticamente após criar (vamos recarregar a página para resetar validações)
					try { sessionStorage.removeItem('WDG_LAST_EDITED_UNIDADE'); } catch(_) {}
				} else {
					// Em edição não reabrir automaticamente após salvar
					try { sessionStorage.removeItem('WDG_LAST_EDITED_UNIDADE'); } catch(_) {}
				}
			} catch(_) {}
			// Sucesso: se for novo cadastro, limpar formulário para próximo cadastro
			if (!isEdit) {
				try {
					// Se houver um arquivo de logo selecionado, enviar agora para a nova unidade (inline JSON, serverless-safe)
					try {
						const inputLogo = document.getElementById('inputLogoUnidade');
						const statusLogo = document.getElementById('statusLogoUnidade');
						const file = inputLogo?.files && inputLogo.files[0] ? inputLogo.files[0] : null;
						if (file && createdId) {
							if (statusLogo) { statusLogo.className = 'small text-muted'; statusLogo.textContent = 'Enviando logo...'; }
							let novoLogo = '';
							try {
								const dataUrl = await readFileAsDataURL(file);
								const upRes = await fetch(`${BASE}/api/unidades/${createdId}/logo-inline`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json', 'Accept':'application/json' },
									credentials: 'same-origin',
									body: JSON.stringify({ dataUrl })
								});
								const upPayload = await upRes.json().catch(()=>({}));
								if (!upRes.ok || upPayload.error) throw new Error(upPayload.error || upPayload.message || 'Falha no upload inline');
								novoLogo = upPayload.logo;
								// Atualiza hidden e dispara evento de atualização
								try { const hiddenLogo = document.getElementById('logoAtual'); if (hiddenLogo) hiddenLogo.value = novoLogo || ''; } catch(_){ }
								try { window.dispatchEvent(new CustomEvent('unidade:logoAtualizada', { detail: { id: createdId, logo: novoLogo } })); } catch(_){ }
								if (statusLogo) { statusLogo.className = 'small text-success'; statusLogo.textContent = 'Logo enviada com sucesso.'; }
							} catch(errUp) {
								console.warn('[cadastrarUnidade] Upload de logo (inline) falhou pós-criação', errUp);
								if (statusLogo) { statusLogo.className = 'small text-warning'; statusLogo.textContent = 'Logo não enviada: ' + (errUp.message || 'falha no upload'); }
							}
						}
					} catch (e) { console.warn('[cadastrarUnidade] Erro no upload automático da logo pós-criação', e); }

					const form = document.getElementById('cadastroUnidadeForm');
					form?.reset();
					resetApiBancariaFields();
					// Limpar prévia da logo e hidden
					try {
						const prev = document.getElementById('logoUnidadePreview');
						const hiddenLogo = document.getElementById('logoAtual');
						const base = (document.body && document.body.getAttribute('data-base-path')) || window.__APP_BASE_PATH__ || window.basePathGlobal || '';
						if (hiddenLogo) hiddenLogo.value = '';
						if (prev) prev.src = (base ? base : '') + '/img/placeholder-logo.svg';
					} catch(_) {}

					// Restaurar estado padrão Matriz/Filial para não-diretor e bloquear select de Matriz
					try {
						const isDiretor = (window.userRole === 'diretor');
						if (!isDiretor) {
							const matriz = document.getElementById('matriz');
							const filial = document.getElementById('filial');
							if (matriz && filial) { matriz.checked = true; filial.checked = false; }
							const sel = document.getElementById('unidadePrincipal');
							if (sel) { sel.value = ''; sel.disabled = true; sel.required = false; }
						}
					} catch(_) {}

					// Limpar estado PIX (radios ocultos/visuais e valor)
					try {
						document.querySelectorAll('input[name="tipoPix"]').forEach(r=>{ r.checked = false; });
						const hidden = document.getElementById('tipoPixHidden'); if (hidden) hidden.value = '';
						const pix = document.getElementById('pixChave'); if (pix){ pix.value=''; pix.classList.remove('is-valid','is-invalid'); }
					} catch(_) {}

					// Limpar seleção persistente do modal de CNAE secundário
					try { document.getElementById('btnDesmarcarTodosCnaeSecundario')?.click(); } catch(_) {}

					// Remover inputs hidden de módulos e limpar exibição
					try {
						Array.from(document.querySelectorAll('input[name="modulosAcessiveis[]"]')).forEach(n=>n.remove());
						const modSel = document.getElementById('modulosAcessiveis'); if (modSel) modSel.innerHTML='';
					} catch(_){ }

					// Focar primeiro campo
					try { document.getElementById('nomeFantasia')?.focus(); } catch(_) {}
					// Voltar para a primeira aba (Dados Gerais)
					try {
						const firstTab = document.querySelector('#tabsCadastroUnidade .nav-link');
						firstTab?.click();
					} catch(_) {}

					// Atualiza a lista de unidades cadastradas (após possível upload de logo)
					await refreshUnitsTable();
					alert('Unidade cadastrada com sucesso.');
					// Recarrega a página para reiniciar validações e estados visuais
					window.location.reload();
				} catch(err){ console.warn('Falha ao resetar formulário pós-cadastro', err); }
				return false;
			}

			// Para edição, NÃO recarregar a página: atualizar tabela e limpar formulário
			try {
				await refreshUnitsTable();
				const form = document.getElementById('cadastroUnidadeForm');
				form?.reset();
				resetApiBancariaFields();
				// Garantir limpeza de estado específico de edição
				try { const hid = document.getElementById('unidadeId'); if (hid) hid.value = ''; } catch(_){ }
				// Limpar prévia da logo e hidden
				try {
					const prev = document.getElementById('logoUnidadePreview');
					const hiddenLogo = document.getElementById('logoAtual');
					const base = (document.body && document.body.getAttribute('data-base-path')) || window.__APP_BASE_PATH__ || window.basePathGlobal || '';
					if (hiddenLogo) hiddenLogo.value = '';
					if (prev) prev.src = (base ? base : '') + '/img/placeholder-logo.svg';
				} catch(_) {}
				// Restaurar estado padrão Matriz/Filial para não-diretor e bloquear select de Matriz
				try {
					const isDiretor = (window.userRole === 'diretor');
					if (!isDiretor) {
						const matriz = document.getElementById('matriz');
						const filial = document.getElementById('filial');
						if (matriz && filial) { matriz.checked = true; filial.checked = false; }
						const sel = document.getElementById('unidadePrincipal');
						if (sel) { sel.value = ''; sel.disabled = true; sel.required = false; }
					}
				} catch(_) {}
				// Limpar estado PIX (radios e valor)
				try {
					document.querySelectorAll('input[name="tipoPix"]').forEach(r=>{ r.checked = false; });
					const hidden = document.getElementById('tipoPixHidden'); if (hidden) hidden.value = '';
					const pix = document.getElementById('pixChave'); if (pix){ pix.value=''; pix.classList.remove('is-valid','is-invalid'); }
				} catch(_) {}
				// Limpar seleção persistente do modal de CNAE secundário
				try { document.getElementById('btnDesmarcarTodosCnaeSecundario')?.click(); } catch(_) {}
				// Remover inputs hidden de módulos e limpar exibição
				try {
					Array.from(document.querySelectorAll('input[name="modulosAcessiveis[]"]')).forEach(n=>n.remove());
					const modSel = document.getElementById('modulosAcessiveis'); if (modSel) modSel.innerHTML='';
				} catch(_){ }
				// Focar primeiro campo e voltar para a primeira aba
				try { document.getElementById('nomeFantasia')?.focus(); } catch(_) {}
				try {
					const firstTab = document.querySelector('#tabsCadastroUnidade .nav-link');
					firstTab?.click();
				} catch(_) {}
				alert('Unidade atualizada com sucesso.');
				// Recarrega a página para reiniciar validações e estados visuais
				window.location.reload();
			} catch(err) {
				console.warn('Falha ao atualizar tabela ou resetar formulário pós-edição', err);
			}
			return false;
		} catch(err){ console.error('Falha ao enviar formulário de unidade:',err); alert('Erro inesperado ao salvar a unidade.'); return false; }
	}
	function bind(){ 
		const form=document.getElementById('cadastroUnidadeForm'); 
		if(form) {
			form.addEventListener('submit', cadastrarUnidade, true);
		}
	}
	document.addEventListener('DOMContentLoaded', bind);
	if (document.readyState !== 'loading') {
		setTimeout(bind,0);
	}
	window.cadastrarUnidade = cadastrarUnidade;
	debugLog('[unidades:submit] script carregado');
})();

