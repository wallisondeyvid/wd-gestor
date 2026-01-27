/* =========================================================================
 * PRIMEIRO ACESSO — Cópia íntegra de public/js/primeiroacesso.js
 * ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
	// Validação do formulário de primeiro acesso
	const form = document.getElementById('primeiroAcessoForm');
	form.addEventListener('submit', (event) => {
		const senha = document.getElementById('senha').value;
		const confirmarSenha = document.getElementById('confirmar_senha').value;

		if (!senha || !confirmarSenha) {
			event.preventDefault();
			alert('Por favor, preencha ambos os campos de senha.');
			return;
		}

		if (senha !== confirmarSenha) {
			event.preventDefault();
			alert('As senhas não coincidem!');
			return;
		}

		if (senha.length < 8) {
			event.preventDefault();
			alert('A senha deve ter pelo menos 8 caracteres!');
			return;
		}

		// Validação de força da senha
		const hasUpperCase = /[A-Z]/.test(senha);
		const hasLowerCase = /[a-z]/.test(senha);
		const hasNumbers = /\d/.test(senha);
		const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(senha);

		if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
			event.preventDefault();
			alert('A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número.');
			return;
		}
	});

	// Mostrar/ocultar senha
	const toggleBtn = document.querySelector('.toggle-pass');
	if (toggleBtn) {
		toggleBtn.addEventListener('click', (e) => {
			const input = document.getElementById('senha');
			const icon = e.currentTarget.querySelector('i');
			if (!input) return;
			const showing = input.type === 'text';
			input.type = showing ? 'password' : 'text';
			icon.classList.toggle('bi-eye', showing);
			icon.classList.toggle('bi-eye-slash', !showing);
		});
	}

	// Mostrar/ocultar confirmar senha
	const toggleConfirmBtn = document.querySelector('.toggle-pass-confirm');
	if (toggleConfirmBtn) {
		toggleConfirmBtn.addEventListener('click', (e) => {
			const input = document.getElementById('confirmar_senha');
			const icon = e.currentTarget.querySelector('i');
			if (!input) return;
			const showing = input.type === 'text';
			input.type = showing ? 'password' : 'text';
			icon.classList.toggle('bi-eye', showing);
			icon.classList.toggle('bi-eye-slash', !showing);
		});
	}

	// Forçar aplicação do fundo caso não seja aplicado
	const body = document.body;
	if (!body.classList.contains('login-bg')) {
		body.classList.add('login-bg');
	}
	// Garantir que o CSS seja aplicado
	body.style.background = 'linear-gradient(180deg, #4a90e2 0%, #63a4ff 35%, #8bb8ff 70%, #b3d1ff 100%)';
	body.style.minHeight = '100vh';
	body.style.backgroundAttachment = 'fixed';
	body.style.backgroundSize = 'cover';
});

