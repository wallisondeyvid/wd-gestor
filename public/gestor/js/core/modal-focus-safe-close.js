(function(global){
	if (global.wdgModalFocusSafe) return;

	function resolveElement(candidate){
		if (typeof candidate === 'function') {
			try { return resolveElement(candidate()); } catch (_) { return null; }
		}
		return candidate instanceof HTMLElement ? candidate : null;
	}

	function canFocus(element){
		return !!(
			element
			&& document.contains(element)
			&& typeof element.focus === 'function'
			&& !element.disabled
			&& element.getAttribute?.('aria-hidden') !== 'true'
		);
	}

	function blurActiveWithin(modalEl){
		const active = document.activeElement;
		if (active instanceof HTMLElement && modalEl.contains(active) && typeof active.blur === 'function') {
			active.blur();
			return active;
		}
		return null;
	}

	function focusElement(element){
		if (!canFocus(element)) return false;
		try {
			element.focus({ preventScroll: true });
			return true;
		} catch (_) {
			try {
				element.focus();
				return true;
			} catch (__){
				return false;
			}
		}
	}

	function install(modalEl, options = {}){
		if (!(modalEl instanceof HTMLElement)) return null;
		if (modalEl.__wdFocusSafeController) return modalEl.__wdFocusSafeController;

		const state = {
			lastTrigger: null,
			pendingReturnFocus: null,
		};

		function resolveReturnFocus(){
			return resolveElement(state.pendingReturnFocus)
				|| resolveElement(options.getReturnFocus)
				|| resolveElement(state.lastTrigger)
				|| resolveElement(options.fallbackReturnFocus)
				|| null;
		}

		modalEl.addEventListener('show.bs.modal', (event) => {
			const relatedTarget = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
			const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			if (relatedTarget) {
				state.lastTrigger = relatedTarget;
			} else if (active && !modalEl.contains(active)) {
				state.lastTrigger = active;
			}
			state.pendingReturnFocus = null;
		});

		modalEl.addEventListener('hide.bs.modal', () => {
			blurActiveWithin(modalEl);
		});

		modalEl.addEventListener('hidden.bs.modal', () => {
			if (document.querySelector('.modal.show')) return;
			const target = resolveReturnFocus();
			state.pendingReturnFocus = null;
			if (!focusElement(target)) {
				focusElement(resolveElement(state.lastTrigger));
			}
		});

		const controller = {
			rememberReturnFocus(target){
				const resolved = resolveElement(target);
				if (resolved) state.pendingReturnFocus = resolved;
				return resolved;
			},
			hide(target){
				const resolved = resolveElement(target);
				if (resolved) state.pendingReturnFocus = resolved;
				blurActiveWithin(modalEl);
				const modalApi = global.bootstrap?.Modal?.getInstance(modalEl)
					|| global.bootstrap?.Modal?.getOrCreateInstance?.(modalEl);
				modalApi?.hide();
			},
			blurActiveElement(){
				return blurActiveWithin(modalEl);
			},
		};

		modalEl.__wdFocusSafeController = controller;
		return controller;
	}

	global.wdgModalFocusSafe = { install };
})(window);