// Migrado de public/js/modals/diretor.js
// Exibição do diretor vinculato em modo somente leitura
(function () {
	const state = { usuarios: [], dom: {} };
	const getUsuarios = () => {
		const src = Array.isArray(window.usuariosDiretor) ? window.usuariosDiretor : [];
		return src.map(u => ({
			id: String(u._id || u.id || ''),
			nome: u.nome || (u.funcionario_id && (u.funcionario_id.nome || u.funcionario_id.name)) || u.name || u.fullName || '—',
			email: u.email || (u.user && u.user.email) || '',
			role: u.role || (u.perfil && u.perfil.nome) || ''
		}));
	};
	function cacheDom() {
		state.dom.hiddenId = document.getElementById('diretor_usuario_id');
		state.dom.display  = document.getElementById('diretorUsuarioDisplay');
		state.dom.bloco    = document.getElementById('blocoDiretor');
		state.dom.chkMatriz= document.getElementById('matriz');
		state.dom.chkFilial= document.getElementById('filial');
	}
		function atualizarVisibilidade() {
		if (!state.dom.bloco) return;
			const isMatriz = !!state.dom.chkMatriz?.checked;
			const unidadeIdEl = document.getElementById('unidadeId');
			const isEdit = !!(unidadeIdEl && unidadeIdEl.value);
			// Exibe SOMENTE quando estiver editando e a unidade for principal
			state.dom.bloco.style.display = (isEdit && isMatriz) ? '' : 'none';
		if (!isMatriz) {
			if (state.dom.hiddenId) state.dom.hiddenId.value = '';
			if (state.dom.display) state.dom.display.value = '';
		}
	}
	function setDiretorById(id) {
		state.usuarios = getUsuarios();
		const alvo = state.usuarios.find(u => String(u.id) === String(id));
		if (!alvo) return false;
		if (state.dom.hiddenId) state.dom.hiddenId.value = String(alvo.id);
		if (state.dom.display) {
			const subt = [alvo.email, alvo.role].filter(Boolean).join(' • ');
			state.dom.display.value = `${alvo.nome}${subt ? `, ${subt}` : ''}`;
		}
		return true;
	}
	function init() {
		cacheDom();
		state.usuarios = getUsuarios();
		// Se já houver valor (edição), renderiza
		if (state.dom.hiddenId?.value) setDiretorById(state.dom.hiddenId.value);
		// Controle de visibilidade conforme matriz/filial
		state.dom.chkMatriz?.addEventListener('change', atualizarVisibilidade);
		state.dom.chkFilial?.addEventListener('change', atualizarVisibilidade);
		atualizarVisibilidade();
	}
	window.DiretorModule = { init, atualizarVisibilidade, setDiretorById };
	document.addEventListener('DOMContentLoaded', init);
})();
