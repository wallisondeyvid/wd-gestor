/* =========================================================================
 * PERFIL — Cópia íntegra de public/js/perfil.js
 * ========================================================================= */
console.log('[perfil.js] carregado');

function resolveBasePath(){
	try {
		const modal = document.getElementById('modalPerfil');
		let bp = (window.__perfilBasePath || (modal && modal.getAttribute('data-perfil-base')) || (document.body && (document.body.dataset?.basePath || document.body.getAttribute('data-base-path'))) || '/gestor');
		bp = String(bp || '').trim();
		if (bp.endsWith('/')) bp = bp.slice(0, -1);
		return bp || '/gestor';
	} catch {
		return '/gestor';
	}
}

const BASE_PATH = resolveBasePath();
function api(url){ return BASE_PATH + url; }

// Flag global para indicar se a foto de perfil foi atualizada durante a sessão do modal
let fotoAtualizada = false;
let fotoEmEdicao = null; // File aguardando confirmação
let fotoPreviewOriginal = null; // src original para restaurar se cancelar

// Função para abrir o modal de perfil
function abrirModalPerfil() {
	const el = document.getElementById('modalPerfil');
	const modal = bootstrap.Modal.getOrCreateInstance(el);
	carregarDadosPerfil();
	modal.show();
}

// Carregar dados do perfil do usuário (reconstruído)
async function carregarDadosPerfil() {
	console.time('[perfil] carregarDadosPerfil');
	if (window.__perfilState) {
		window.__perfilState.setStatus('Carregando dados do usuário...', 'loading');
	}
	try {
		const resp = await fetch(api('/api/usuario'), {
			credentials: 'same-origin',
			cache: 'no-store',
			headers: { 'Accept': 'application/json' }
		});
		if (!resp.ok) {
			let msg = 'Falha ao obter usuário';
			try { const err = await resp.json(); msg = err.error || err.message || msg; } catch {}
			throw new Error(msg + ` (HTTP ${resp.status})`);
		}
		const raw = await resp.json();
		let data = null;
		if (raw && typeof raw === 'object') {
			if (raw.data && typeof raw.data === 'object') data = raw.data;
			else if (raw.usuario && typeof raw.usuario === 'object') data = raw.usuario;
			else data = raw;
		}
		if (!data) throw new Error('Resposta vazia de /api/usuario');
		window.currentUser = data;
		console.debug('[perfil] raw usuario:', raw);
		console.debug('[perfil] data resolvida:', data);

		const payload = {
			nome: data.nome || data.funcionario?.nome || 'Não informado',
			cpf: data.cpf || data.funcionario?.cpf || 'Não informado',
			unidade_nome: (data.role === 'master') ? '—' : (data.unidade_nome || data.unidade?.nome || 'Não informado'),
			unidade_codigo: (data.role === 'master') ? '' : (data.unidade_codigo || ''),
			email: data.email || 'Não informado',
			telefone: data.telefone || data.funcionario?.telefone || 'Não informado',
			primeiro_acesso: !!data.primeiro_acesso,
			senha_provisoria: !!data.senha_provisoria,
			role: data.role
		};

		if (window.__perfilState?.fill) {
			window.__perfilState.fill(payload);
		} else {
			// Fallback direto
			const map = [
				['perfilNome', payload.nome],
				['perfilCPF', payload.cpf],
				['perfilUnidade', payload.unidade_codigo ? `${payload.unidade_codigo} - ${payload.unidade_nome}` : payload.unidade_nome],
				['perfilRole', formatarRole(payload.role)],
				['perfilTelefone', payload.telefone],
				['perfilEmail', payload.email]
			];
			map.forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
		}

		await carregarModulosAcessiveis();
		carregarFotoPerfil();
		if (window.__perfilState) window.__perfilState.setStatus('', '');
	} catch (err) {
		console.error('[perfil] erro carregarDadosPerfil:', err);
		if (window.__perfilState) window.__perfilState.setStatus(err.message || 'Erro ao carregar perfil', 'error');
		else mostrarErro(err.message || 'Erro ao carregar perfil');
	} finally {
		console.timeEnd('[perfil] carregarDadosPerfil');
	}
}

// Carregar módulos acessíveis do usuário
async function carregarModulosAcessiveis() {
	try {
		const response = await fetch(api('/api/modulos'), {
			credentials: 'same-origin',
			cache: 'no-store'
		});
		if (response.ok) {
			const payload = await response.json();
			const modulos = (payload && typeof payload === 'object' && 'data' in payload) ? payload.data : payload;
			const container = document.getElementById('perfilModulos');

			if (Array.isArray(modulos) && modulos.length > 0) {
				// Limpar container
				container.innerHTML = '';

				// Filtrar módulos ativos e criar badges de forma segura
				const modulosAtivos = modulos.filter(modulo => modulo && String(modulo.status || '').toLowerCase() === 'ativo');

				modulosAtivos.forEach(modulo => {
					const badge = document.createElement('span');
					// text-bg-primary aplica fundo primário com texto branco no Bootstrap 5
					badge.className = 'badge text-bg-primary me-1';
					badge.textContent = modulo.nome || 'Módulo';
					container.appendChild(badge);
				});
			} else {
				container.innerHTML = '<span class="text-muted">Nenhum módulo acessível</span>';
			}
		} else {
			document.getElementById('perfilModulos').innerHTML = '<span class="text-muted">Erro ao carregar módulos</span>';
		}
	} catch (error) {
		console.error('Erro ao carregar módulos:', error);
		document.getElementById('perfilModulos').innerHTML = '<span class="text-muted">Erro ao carregar módulos</span>';
	}
}

// Carregar foto do perfil
function carregarFotoPerfil() {
	const fotoElement = document.getElementById('fotoPerfil');
	const user = window.currentUser || {};

	// Se o usuário tiver uma foto, carregar, senão usar avatar padrão
	if (user.foto) {
		const raw = String(user.foto).trim();
		let src = '';
		if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) {
			src = raw;
		} else if (raw.startsWith('uploads/')) {
			src = '/' + raw;
		} else if (raw.startsWith('users/')) {
			src = '/uploads/' + raw;
		} else {
			src = '/' + raw;
		}
		// cache-buster
		const sep = src.includes('?') ? '&' : '?';
		// Usar a URL da foto do usuário com cache-buster
		fotoElement.src = `${src}${sep}v=${Date.now()}`;
	} else {
		// Fallback seguro dentro do escopo do módulo Gestor
		fotoElement.src = api('/img/user-placeholder.svg');
	}

	// Adicionar tratamento de erro para a imagem (evitar loop)
	fotoElement.onerror = function() {
		if (!this.dataset.fallback) {
			this.dataset.fallback = '1';
			this.src = api('/img/user-placeholder.svg');
		}
	};
}

// Função para alterar foto
function iniciarAlteracaoFoto() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'image/*';
	input.style.display = 'none';

	input.addEventListener('change', (e) => {
		const file = e.target.files?.[0];
		if (!file) { input.remove(); return; }
		if (file.size > 5 * 1024 * 1024) { alert('Arquivo muito grande. Máximo 5MB.'); input.remove(); return; }
		if (!file.type.startsWith('image/')) { alert('Selecione uma imagem válida.'); input.remove(); return; }
		// Guardar original para possível cancelamento
		const img = document.getElementById('fotoPerfil');
		if (!fotoPreviewOriginal) fotoPreviewOriginal = img.src;
		fotoEmEdicao = file;
		// Preview local
		const reader = new FileReader();
		reader.onload = ev => { img.src = ev.target.result; };
		reader.readAsDataURL(file);
		// Alternar botões
		document.getElementById('btnAlterarFoto')?.classList.add('d-none');
		document.getElementById('grupoConfirmarFoto')?.classList.remove('d-none');
	});

	document.body.appendChild(input);
	input.click();
}

function cancelarAlteracaoFoto() {
	if (fotoEmEdicao && fotoPreviewOriginal) {
		document.getElementById('fotoPerfil').src = fotoPreviewOriginal;
	}
	fotoEmEdicao = null;
	fotoPreviewOriginal = null;
	document.getElementById('btnAlterarFoto')?.classList.remove('d-none');
	document.getElementById('grupoConfirmarFoto')?.classList.add('d-none');
}

async function confirmarAlteracaoFoto() {
	if (!fotoEmEdicao) { cancelarAlteracaoFoto(); return; }
	try {
		setStatusFoto('Enviando...', 'info');
		await enviarFoto(fotoEmEdicao);
		fotoAtualizada = true;
		setStatusFoto('Foto atualizada (lembre de salvar o perfil se aplicável).', 'success');
	} catch (e) {
		console.error('[confirmarAlteracaoFoto] erro:', e);
		setStatusFoto('Falha ao enviar foto: ' + (e.message||'erro'), 'error');
		return; // mantém modo edição para tentar novamente
	}
	fotoEmEdicao = null;
	fotoPreviewOriginal = null;
	document.getElementById('btnAlterarFoto')?.classList.remove('d-none');
	document.getElementById('grupoConfirmarFoto')?.classList.add('d-none');
}

function setStatusFoto(msg, kind) {
	let el = document.getElementById('statusFotoPerfil');
	if (!el) {
		el = document.createElement('div');
		el.id = 'statusFotoPerfil';
		el.className = 'small mt-2';
		document.getElementById('perfilFotoBotoes')?.appendChild(el);
	}
	const map = { info:'text-muted', success:'text-success', error:'text-danger', warning:'text-warning' };
	el.className = 'small mt-2 ' + (map[kind]||'text-muted');
	el.textContent = msg || '';
}

// Enviar foto para o servidor
async function enviarFoto(file) {
	try {
		const formData = new FormData();
		formData.append('foto', file);

		const response = await fetch(api('/api/usuario/foto'), {
			method: 'POST',
			body: formData,
			credentials: 'same-origin',
			cache: 'no-store'
		});

		if (response.ok) {
			const result = await response.json();
			alert('Foto atualizada com sucesso!');

	// Atualizar foto no modal com cache-buster
	document.getElementById('fotoPerfil').src = `/uploads/${result.foto}?v=${Date.now()}`;

			// Atualizar estado e dados em memória
			fotoAtualizada = true;
			if (window.currentUser) {
				window.currentUser.foto = result.foto;
			}

			// Fechar modal de alteração de senha se estiver aberto
			const modalSenha = bootstrap.Modal.getInstance(document.getElementById('modalAlterarSenha'));
			if (modalSenha) {
				modalSenha.hide();
			}
		} else {
			const error = await response.json();
			alert('Erro ao atualizar foto: ' + (error.error || 'Erro desconhecido'));
		}
	} catch (error) {
		console.error('Erro ao enviar foto:', error);
		alert('Erro ao enviar foto. Tente novamente.');
	}
}

// Função para alterar senha
function alterarSenha() {
	const modalPerfil = bootstrap.Modal.getInstance(document.getElementById('modalPerfil'));
	modalPerfil?.hide();
	const modalSenhaEl = document.getElementById('modalAlterarSenha');
	if (modalSenhaEl) {
		bootstrap.Modal.getOrCreateInstance(modalSenhaEl).show();
	} else {
		console.warn('[alterarSenha] modalAlterarSenha não encontrado no DOM');
	}
}

// Função para mostrar erros
function mostrarErro(mensagem) {
	if (window.__perfilState) {
		window.__perfilState.setStatus(mensagem, 'error');
		return;
	}
	alert(mensagem);
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
	console.log('[perfil.js] DOM carregado, perfil inicializado');

	// Prevenir submit do formulário de alteração de senha
	const form = document.getElementById('formAlterarSenha');
	if (form) {
		form.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter' || e.shiftKey) return;
			e.preventDefault();
			salvarNovaSenha();
		});
	}

	// Recarregar a página quando o modal de perfil for fechado, somente se a foto foi atualizada
	const modalPerfilEl = document.getElementById('modalPerfil');
	if (modalPerfilEl) {
		// Gatilho: ao abrir o modal, sempre carregar dados (cobre caso o modal seja aberto via data-bs-*)
		modalPerfilEl.addEventListener('show.bs.modal', () => {
			try { carregarDadosPerfil(); } catch (e) { console.warn('[perfil.js] falha ao carregar perfil no show:', e); }
		});
		modalPerfilEl.addEventListener('hidden.bs.modal', () => {
			// Se havia uma foto em edição mas não confirmada, reverte preview
			if (fotoEmEdicao && fotoPreviewOriginal) {
				document.getElementById('fotoPerfil').src = fotoPreviewOriginal;
				fotoEmEdicao = null; fotoPreviewOriginal = null;
				document.getElementById('btnAlterarFoto')?.classList.remove('d-none');
				document.getElementById('grupoConfirmarFoto')?.classList.add('d-none');
			}
			// Se a foto foi efetivamente atualizada já emitimos um evento para outros componentes
			if (fotoAtualizada) {
				fotoAtualizada = false;
				window.dispatchEvent(new CustomEvent('perfil:fotoAtualizada'));
			}
		});
	}
});

// Expor funções chave globalmente (caso script seja carregado como módulo ou defer)
window.abrirModalPerfil = abrirModalPerfil;
window.carregarDadosPerfil = carregarDadosPerfil;
// antigas referências para compatibilidade
window.alterarFoto = iniciarAlteracaoFoto;
window.alterarSenha = alterarSenha;
window.salvarNovaSenha = salvarNovaSenha;
window.iniciarAlteracaoFoto = iniciarAlteracaoFoto;
window.cancelarAlteracaoFoto = cancelarAlteracaoFoto;
window.confirmarAlteracaoFoto = confirmarAlteracaoFoto;

// Salvar nova senha
async function salvarNovaSenha() {
	const statusEl = document.getElementById('statusAlterarSenha');
	const senhaAtualEl = document.getElementById('senhaAtual');
	const novaSenhaEl = document.getElementById('novaSenha');
	const confirmarEl = document.getElementById('confirmarSenha');
	const btnSalvar = document.getElementById('btnSalvarSenha');

	function setStatus(msg, tipo='info') {
		if (!statusEl) return;
		statusEl.className = '';
		const map = { info:'text-secondary', success:'text-success', error:'text-danger', warning:'text-warning' };
		statusEl.classList.add(map[tipo]||'text-secondary');
		statusEl.textContent = msg;
	}

	const senhaAtual = senhaAtualEl?.value?.trim() || '';
	const novaSenha = novaSenhaEl?.value?.trim() || '';
	const confirmar = confirmarEl?.value?.trim() || '';

	if (!senhaAtual || !novaSenha || !confirmar) {
		setStatus('Preencha todos os campos.', 'warning');
		return;
	}
	if (novaSenha.length < 6) {
		setStatus('Nova senha deve ter ao menos 6 caracteres.', 'warning');
		return;
	}
	if (novaSenha !== confirmar) {
		setStatus('Confirmação não confere.', 'warning');
		return;
	}

	try {
		setStatus('Salvando...', 'info');
		if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.dataset.originalText = btnSalvar.textContent; btnSalvar.textContent = 'Salvando...'; }
		const resp = await fetch(api('/api/usuario/senha'), {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ senhaAtual, novaSenha }),
			credentials: 'same-origin',
			cache: 'no-store'
		});
		const payload = await resp.json().catch(()=>({}));
		if (!resp.ok || payload?.error) {
			setStatus(payload.error || payload.message || `Erro (${resp.status}) ao alterar senha`, 'error');
			return;
		}
		setStatus('Senha alterada com sucesso!', 'success');
		// Limpa campos
		if (senhaAtualEl) senhaAtualEl.value='';
		if (novaSenhaEl) novaSenhaEl.value='';
		if (confirmarEl) confirmarEl.value='';
		// Atualiza flags in-memory
		if (window.currentUser) {
			window.currentUser.primeiro_acesso = false;
			window.currentUser.senha_provisoria = false;
		}
		// Fechar automaticamente após pequeno delay
		setTimeout(()=>{
			const modal = bootstrap.Modal.getInstance(document.getElementById('modalAlterarSenha'));
			modal?.hide();
		}, 800);
	} catch (err) {
		console.error('[salvarNovaSenha] erro:', err);
		setStatus(err.message || 'Falha ao alterar senha', 'error');
	} finally {
		if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = btnSalvar.dataset.originalText || 'Salvar Senha'; }
	}
}

