// Migrated from public/js/init/masks-global.js
(function() {
	'use strict';
	const TAG = '[masks-global]';
	function safeBind(methodName, fn, el) {
		try {
			if (typeof fn !== 'function') { console.warn(TAG, 'Método ausente:', methodName); return; }
			fn(el);
		} catch (e) { console.warn(TAG, 'Erro ao aplicar', methodName, e); }
	}
	function initMasks(attempt=1) {
		if (!window.__WDMasksCanonicalLoaded) {
			window.__WDMasksCanonicalLoaded = true;
			console.log(TAG, 'Marcando canonical loaded');
		} else {
			console.log(TAG, 'Reentrada detectada - já marcado canonical loaded');
		}
		if (!window.WDMasks) {
			if (attempt <= 10) return setTimeout(() => initMasks(attempt+1), 100 * attempt);
			console.warn(TAG, 'WDMasks não disponível após tentativas. Abortando inicialização.');
			return;
		}
		const WDMasks = window.WDMasks;
		// Polyfill: garantir que formatTelefone exista (usado por PIX telefone em unidades.js)
		if (!WDMasks.formatTelefone) {
			WDMasks.formatTelefone = function(v){
				if (!v) return '';
				const d = String(v).replace(/\D/g,'').slice(0,12);
				// Serviços iniciados em 0 (0800, 0300, 0500, 0900, 4004, 3003 etc.)
				if (/^0\d{3}/.test(d)) {
					if (d.length <= 4) return d;           // 0800
					if (d.length <= 7) return `${d.slice(0,4)}-${d.slice(4)}`; // 0800-123
					return `${d.slice(0,4)}-${d.slice(4,7)}-${d.slice(7,11)}`; // 0800-123-4567
				}
				// Padrão com DDD
				if (d.length <= 2) return d;
				if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
				if (d.length <=10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`;
				return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
			};
			console.log(TAG, 'Polyfill formatTelefone adicionado (utils-masks.js ausente nesta página).');
		}
		// Removido fallback automático de moeda para não conflitar com versão digit-a-digit.
		if (!WDMasks.bindMoedaMask) {
			console.warn(TAG, 'bindMoedaMask ausente – campo .moeda-mask ficará sem máscara até masks.js registrar implementação. Verificar ordem de scripts.');
		}
		function applyMasks(root=document) {
			const q = (sel) => root.querySelectorAll(sel);
			q('.titulo-eleitor-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindTituloEleitorMask', WDMasks.bindTituloEleitorMask, el); el.__maskApplied=true; }});
			q('.zona-eleitoral-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindZonaEleitoralMask', WDMasks.bindZonaEleitoralMask, el); el.__maskApplied=true; }});
			q('.secao-eleitoral-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindSecaoEleitoralMask', WDMasks.bindSecaoEleitoralMask, el); el.__maskApplied=true; }});
			q('.cnh-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindCnhMask', WDMasks.bindCnhMask, el); el.__maskApplied=true; }});
			q('.cpf-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindCPFMask', WDMasks.bindCPFMask, el); el.__maskApplied=true; }});
			q('.cnpj-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindCNPJMask', WDMasks.bindCNPJMask, el); el.__maskApplied=true; }});
			q('.pis-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindPisMask', WDMasks.bindPisMask, el); el.__maskApplied=true; }});
			q('.moeda-mask').forEach(el => { if (!el.__maskApplied){ if (WDMasks.bindMoedaMask){ safeBind('bindMoedaMask', WDMasks.bindMoedaMask, el); el.__maskApplied=true; el.dataset.maskSource = el.dataset.maskSource || 'digit-cent'; } else if (WDMasks.formatMoeda){ // fallback mínimo somente em blur
				el.addEventListener('blur', ()=>{ try { el.value = WDMasks.formatMoeda(el.value); } catch(_){ } });
				el.__maskApplied=true; el.dataset.maskSource='fallback-blur';
			}}});
			q('.porcentagem-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindPorcentagemMask', WDMasks.bindPorcentagemMask, el); el.__maskApplied=true; }});
			q('.agencia-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindAgenciaMask', WDMasks.bindAgenciaMask, el); el.__maskApplied=true; }});
			q('.conta-mask').forEach(el => { if (!el.__maskApplied){ safeBind('bindContaMask', WDMasks.bindContaMask, el); el.__maskApplied=true; }});
			// Telefone (classe .telefone-mask) - usa Validators.aplicarMascaraTelefone se existir; senão polyfill formatTelefone
			q('.telefone-mask').forEach(el => {
				if(el.__telefoneApplied) return;
				const applyTel = ()=>{
					try {
						if (window.Validators?.aplicarMascaraTelefone) window.Validators.aplicarMascaraTelefone(el); else if (WDMasks.formatTelefone){ el.value = WDMasks.formatTelefone(el.value); }
					} catch(err){ console.warn(TAG,'telefone mask erro', err); }
				};
				el.addEventListener('input', applyTel);
				if(el.value) applyTel();
				el.addEventListener('blur', ()=>{
					try {
						const ok = window.Validators?.validarTelefoneValor ? window.Validators.validarTelefoneValor(el.value) : (el.value.replace(/\D/g,'').length>=10);
						el.classList.toggle('is-valid', ok && el.value.trim()!=='');
						el.classList.toggle('is-invalid', !ok && el.value.trim()!=='');
					}catch(err){ console.warn(TAG,'telefone validate erro', err); }
				});
				el.__telefoneApplied = true;
			});
			// Email (classe .email-mask)
			q('.email-mask').forEach(el => {
				if(el.__emailApplied) return;
				el.addEventListener('blur', ()=>{
					try {
						const ok = window.Validators?.validarEmailValor ? window.Validators.validarEmailValor(el.value) : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value)||!el.value.trim();
						el.classList.toggle('is-valid', ok && el.value.trim()!=='');
						el.classList.toggle('is-invalid', !ok && el.value.trim()!=='');
					}catch(err){ console.warn(TAG,'email validate erro', err); }
				});
				if(el.value){
					const ok = window.Validators?.validarEmailValor ? window.Validators.validarEmailValor(el.value) : true;
					el.classList.toggle('is-valid', ok && el.value.trim()!=='');
					el.classList.toggle('is-invalid', !ok && el.value.trim()!=='');
				}
				el.__emailApplied = true;
			});
		}
		applyMasks();
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.type === 'childList') {
					mutation.addedNodes.forEach((node) => {
						if (node.nodeType === Node.ELEMENT_NODE) {
							if (node.matches?.('[class*="mask"]')) applyMasks(node);
							const anyMasks = node.querySelector?.('[class*="mask"]');
							if (anyMasks) applyMasks(node);
						}
					});
				}
			});
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}
	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => initMasks()); } else { initMasks(); }
})();
