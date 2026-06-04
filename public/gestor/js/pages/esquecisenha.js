/* =========================================================================
 * ESQUECI SENHA — Cópia íntegra de public/js/esquecisenha.js
 * ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
	const cpfInput = document.getElementById('cpf');
	const form = document.getElementById('esqueciSenhaForm');
	if (!cpfInput || !form) return;
	const submitBtn = form.querySelector('button[type="submit"]');
	const originalBtnText = submitBtn.innerHTML;
	const requestSection = document.getElementById('recoveryRequestSection');
	const confirmationSection = document.getElementById('recoveryConfirmationSection');
	const helpSection = document.getElementById('recoveryHelpSection');
	const confirmationMessage = document.getElementById('recoveryConfirmationMessage');

	// Máscara CPF
	cpfInput.addEventListener('input', (e) => {
		let v = e.target.value.replace(/\D/g,'').slice(0,11);
		v = v.replace(/(\d{3})(\d)/, '$1.$2');
		v = v.replace(/(\d{3})(\d)/, '$1.$2');
		v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
		e.target.value = v;
	});

	form.addEventListener('submit', async (ev) => {
		ev.preventDefault();
		const cpfDigits = cpfInput.value.replace(/\D/g,'');

		if (!cpfDigits) return showAlert('Informe o CPF.', 'danger');
		if (cpfDigits.length !== 11) return showAlert('CPF deve ter 11 dígitos.', 'danger');
		if (!validarCPF(cpfDigits)) return showAlert('CPF inválido.', 'danger');

		await solicitarReset({ cpf: cpfInput.value });
	});

	async function solicitarReset(payload) {
		toggleLoading(true, 'Enviando...');
		try {
			const bp = (window._BASE_PATH && typeof window._BASE_PATH === 'string') ? window._BASE_PATH : '/gestor';
			const resp = await fetch(`${bp}/esqueci-senha`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'X-Requested-With': 'XMLHttpRequest'
				},
				body: JSON.stringify(payload)
			});
			const data = await resp.json();
			if (data.success) {
				showConfirmationState(data.message);
				form.reset();
			} else {
				showAlert(data.message || 'Falha.', 'danger');
			}
		} catch (e) {
			console.error(e);
			showAlert('Erro na solicitação.', 'danger');
		} finally {
			toggleLoading(false);
		}
	}

	function showConfirmationState(message) {
		document.querySelectorAll('.alert.dynamic-alert').forEach(a=>a.remove());
		if (typeof message === 'string' && message && confirmationMessage) {
			confirmationMessage.textContent = message;
		}
		if (requestSection) requestSection.classList.add('d-none');
		if (helpSection) helpSection.classList.add('d-none');
		if (confirmationSection) {
			confirmationSection.classList.remove('d-none');
			confirmationSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	function toggleLoading(state, text) {
		if (state) {
			submitBtn.disabled = true;
			submitBtn.setAttribute('aria-busy', 'true');
			submitBtn.innerHTML = `<i class="bi bi-hourglass-split me-2"></i>${text || 'Processando...'}`;
		} else {
			submitBtn.disabled = false;
			submitBtn.removeAttribute('aria-busy');
			submitBtn.innerHTML = originalBtnText;
		}
	}

	function showAlert(message, type) {
		document.querySelectorAll('.alert.dynamic-alert').forEach(a=>a.remove());
		const alertDiv = document.createElement('div');
		alertDiv.className = `alert dynamic-alert alert-${type} alert-dismissible fade show mt-3`;
		alertDiv.innerHTML = `
			<i class="bi ${type==='success'?'bi-check-circle':'bi-exclamation-triangle'} me-2"></i>${message}
			<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
		form.parentNode.insertBefore(alertDiv, form);
		if (type==='success') setTimeout(()=>alertDiv.remove(), 6000);
	}

	function validarCPF(cpf) {
		cpf = cpf.replace(/[^\d]+/g,'');
		if (cpf.length !== 11 || /(\d)\1{10}/.test(cpf)) return false;
		let soma=0; for (let i=1;i<=9;i++) soma+=parseInt(cpf.substring(i-1,i))*(11-i);
		let resto=(soma*10)%11; if(resto===10||resto===11) resto=0; if(resto!==parseInt(cpf.substring(9,10))) return false;
		soma=0; for (let i=1;i<=10;i++) soma+=parseInt(cpf.substring(i-1,i))*(12-i);
		resto=(soma*10)%11; if(resto===10||resto===11) resto=0; if(resto!==parseInt(cpf.substring(10,11))) return false; return true;
	}

	// Ajustes de fundo
	const body = document.body;
	if (!body.classList.contains('login-bg')) body.classList.add('login-bg');
	body.style.background='linear-gradient(180deg, #4a90e2 0%, #63a4ff 35%, #8bb8ff 70%, #b3d1ff 100%)';
	body.style.minHeight='100vh';
	body.style.backgroundAttachment='fixed';
	body.style.backgroundSize='cover';
});

