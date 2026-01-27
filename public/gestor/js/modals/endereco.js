// Migrado de public/js/modals/endereco.js
(() => { 'use strict';
	function getBase(){
		const attr = document.body?.getAttribute('data-base-path') || window.__WD_BASE_PATH || '/gestor';
		return attr.endsWith('/') ? attr.slice(0,-1) : attr;
	}
	document.addEventListener('click', (e) => {
		const btn = e.target.closest('[data-action="abrirPopupEndereco"]');
		if (!btn) return;
		let targetId = (btn.dataset.targetInput || btn.dataset.target || '').replace(/^#/, '');
		if (!targetId) {
			const doc = document;
			if (doc.getElementById('endereco_resumo')) targetId = 'endereco_resumo'; else targetId = 'endereco';
		}
		const campo = document.getElementById(targetId) || document.querySelector(`[name="${targetId}"]`);
		const valor = campo?.value || '';
		const base = getBase();
		const url = `${base}/endereco?field=${encodeURIComponent(targetId)}&endereco=${encodeURIComponent(valor)}`;
		const w = 860, h = 600;
		const left = Math.max(0, (window.screen.width - w) / 2);
		const top = Math.max(0, (window.screen.height - h) / 2);
		window.open(url,'popupEndereco',`toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=${w},height=${h},left=${left},top=${top}`);
	});
})();
