// Migrado de public/js/modals/detalhes_unidades.js
(function(){
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
	document.addEventListener('click', function (e) {
		const btn = e.target.closest('[data-action="abrirDetalhes"]'); if (!btn) return;
		const id = btn.getAttribute('data-id') || btn.closest('tr')?.getAttribute('data-id');
		const u = Array.isArray(window.unidadesFiltradas) ? window.unidadesFiltradas.find(x => String(x._id) === String(id)) : null; if (!u) return;

		// Definir atributo com ID no modal (usado pelo fluxo de upload no modal)
		try{ const modalRoot = document.getElementById('detalhesModal'); if(modalRoot) modalRoot.setAttribute('data-unidade-id', String(id)); }catch(_){ }

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
