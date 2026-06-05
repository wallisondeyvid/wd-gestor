// Migrated from public/js/init/dates-global.js
(function () {
	const DEBUG_FLAGS = ['WDG_DEBUG_UNIDADES', 'WDG_DEBUG_GESTOR_ASSETS'];
	const debugLog = (...args) => window.WDGDebug?.log?.(DEBUG_FLAGS, 'debug', ...args);
	if(window.__WDDatesCanonicalLoaded){
		debugLog('[dates-global] Abortando: já carregado canonicamente.');
		return;
	}
	window.__WDDatesCanonicalLoaded = true;
	// Guardas para evitar spam de logs / reprocessamentos
	const enhancedInputs = new WeakSet();
	let loggedFlatpickrMissing = false;
	let loggedLocaleMissing = false;
	let lastEnhanceRun = 0;
	const ENHANCE_MIN_INTERVAL = 150; // ms (debounce simples contra enxurrada do MutationObserver)
	function log(msg, level = 'info') {
		const tag = '[dates-global]';
		if (level === 'error') {
			console.error(tag, msg);
		} else if (level === 'warn') {
			console.warn(tag, msg);
		} else if (level === 'debug') {
			debugLog(tag, msg);
		} else {
			window.WDGDebug?.log?.(DEBUG_FLAGS, 'info', tag, msg);
		}
	}

	function addFooter(instance) {
		try {
			// Acessibilidade/Issues (Chrome): elementos internos do flatpickr não vêm com id/name
			// Adicionar apenas `name` (não precisa ser único) para evitar warnings de autofill.
			try {
				const calA11y = instance && instance.calendarContainer;
				if (calA11y) {
					const monthSel = calA11y.querySelector('.flatpickr-monthDropdown-months');
					if (monthSel && !monthSel.getAttribute('name')) monthSel.setAttribute('name', 'flatpickr-month');
					const yearInp = calA11y.querySelector('input.numInput.cur-year');
					if (yearInp && !yearInp.getAttribute('name')) yearInp.setAttribute('name', 'flatpickr-year');
				}
			} catch (_e) { /* noop */ }

			const cal = instance.calendarContainer;
			if (cal && !cal.querySelector('.flatpickr-footer')) {
				const footer = document.createElement('div');
				footer.className = 'flatpickr-footer';
				const clear = document.createElement('button');
				clear.type = 'button';
				clear.className = 'flatpickr-clear';
				clear.textContent = 'Limpar';
				clear.addEventListener('click', () => {
					try { instance.clear(); instance.close(); instance._input.dispatchEvent(new Event('blur')); } catch (e) { log(e, 'warn'); }
				});
				footer.appendChild(clear);
				cal.appendChild(footer);
			}
		} catch (e) { log(e, 'warn'); }
	}

	function validateDateInputOnBlur(el){
		try {
			const val = el.value.trim();
			// Limpo -> remove erro e feedback
			if (!val) { cleanupInvalidFeedback(el); el.classList.remove('is-invalid'); return; }
			// Enquanto está digitando parcial (ex: 1 ou 12/3) não marcar inválido
			if (/^\d{1,2}$|^\d{1,2}\/\d{1,2}$/.test(val)) { el.classList.remove('is-invalid'); return; }
			const match = val.match(/^([0-3]\d)\/([0-1]\d)\/(\d{4})$/);
			if (!match) { markInvalidDate(el, 'Data inválida (formato deve ser DD/MM/AAAA).'); return; }
			const d = parseInt(match[1], 10);
			const m = parseInt(match[2], 10);
			const y = parseInt(match[3], 10);
			if(m<1||m>12||d<1||d>31||y<1900||y>2100){ markInvalidDate(el, 'Data fora do intervalo válido.'); return; }
			const dt = new Date(y, m - 1, d);
			if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
				cleanupInvalidFeedback(el);
				el.classList.remove('is-invalid');
				el.dataset.dateValidated = '1';
			} else {
				markInvalidDate(el, 'Data inexistente no calendário.');
			}
		} catch (e) { log(e,'warn'); }
	}

	function markInvalidDate(el, message){
		el.classList.add('is-invalid');
		let fb = el.nextElementSibling;
		if(!(fb && fb.classList && fb.classList.contains('invalid-feedback'))){
			fb = document.createElement('div');
			fb.className = 'invalid-feedback';
			el.parentNode.insertBefore(fb, el.nextSibling);
		}
		fb.textContent = message || 'Data inválida.';
	}

	function cleanupInvalidFeedback(el){
		if(el.nextElementSibling && el.nextElementSibling.classList?.contains('invalid-feedback')){
			el.nextElementSibling.textContent = '';
		}
	}

	function enhance(root = document) {
		// Debounce simples
		const now = Date.now();
		if (now - lastEnhanceRun < ENHANCE_MIN_INTERVAL) return;
		lastEnhanceRun = now;
		if (typeof window.flatpickr !== 'function') {
			if (!loggedFlatpickrMissing) {
				log('flatpickr indisponível no momento do enhance() – execução adiada.', 'debug');
				loggedFlatpickrMissing = true;
			}
			return; // Sai silenciosamente
		}
		if (!window.flatpickr.l10ns || !window.flatpickr.l10ns.pt) {
			if (!loggedLocaleMissing) {
				log('Locale pt ainda não carregada – aguardando.', 'debug');
				loggedLocaleMissing = true;
			}
			return;
		}
		const inputs = root.querySelectorAll('input.date-br, input.mask-date, input[data-mask="date"]');
		inputs.forEach(el => {
			try {
				el.classList.add('date-br');
				if (el.__flatpickr || enhancedInputs.has(el)) return;
				const isFuncionarioField = el.closest('[id^="aba"]') !== null || el.id.includes('extra_') || el.name.includes('data_') || el.id === 'data_nascimento' || el.id === 'data_admissao' || el.id === 'data_termino';
				const isCNHValidity = el.id === 'extra_cnh_validade' || el.name === 'cnh_validade';
				const isBeneficioInicio = el.id === 'beneficio_data_inicio' || el.name === 'beneficio_data_inicio';
				const localeObj = (window.flatpickr?.l10ns?.pt) ? window.flatpickr.l10ns.pt : undefined;
				flatpickr(el, {
					locale: localeObj,
					dateFormat: 'd/m/Y',
					allowInput: false,
					disableMobile: true,
					maxDate: (isFuncionarioField && !isCNHValidity && !isBeneficioInicio) ? new Date() : undefined,
					onReady: addFooter
				});
				enhancedInputs.add(el);
				el.addEventListener('blur', () => validateDateInputOnBlur(el));
			} catch (e) { log(e, 'warn'); }
		});
	}

	function tryEnhanceLater(attempt = 1) {
		if (typeof window.flatpickr === 'function' && window.flatpickr.l10ns?.pt) {
			log('flatpickr + locale pt disponíveis após ' + attempt + ' tentativa(s). Reexecutando enhance().');
			enhance();
			return;
		}
		if (attempt <= 10) {
			setTimeout(() => tryEnhanceLater(attempt + 1), 150 * attempt);
		} else {
			log('flatpickr/locale pt não carregaram após tentativas – desistindo para evitar loop.', 'warn');
		}
	}

	document.addEventListener('DOMContentLoaded', function () {
		try { window.Dates?.init(); } catch (e) { log(e, 'warn'); }
		enhance();
		if (typeof window.flatpickr !== 'function' || !window.flatpickr.l10ns?.pt) {
			tryEnhanceLater();
		}
		// Reage ao carregamento tardio via flatpickr-loader
		document.addEventListener('flatpickrReady', () => {
			log('Evento flatpickrReady recebido – reforçando enhance().');
			enhance();
		});
		const mo = new MutationObserver(muts => {
			muts.forEach(m => {
				m.addedNodes.forEach(n => {
					if (n.nodeType === 1) enhance(n);
				});
			});
		});
		mo.observe(document.body, { childList: true, subtree: true });
	});
})();
