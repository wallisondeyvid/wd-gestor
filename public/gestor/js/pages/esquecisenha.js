/* =========================================================================
 * ESQUECI SENHA — Cópia íntegra de public/js/esquecisenha.js
 * ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
	const cpfInput = document.getElementById('cpf');
	const form = document.getElementById('esqueciSenhaForm');
	const submitBtn = form.querySelector('button[type="submit"]');
	const originalBtnText = submitBtn.innerHTML;
	const emailGroup = document.getElementById('emailGroup');
	const emailInput = document.getElementById('email');
	const emailHint = document.getElementById('emailHint');

	// Elemento dinâmico para lista de e-mails
	let listaWrapper = null;

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
		const emailConfirm = (emailInput?.value || '').trim();

		if (!cpfDigits) return showAlert('Informe o CPF.', 'danger');
		if (cpfDigits.length !== 11) return showAlert('CPF deve ter 11 dígitos.', 'danger');
		if (!validarCPF(cpfDigits)) return showAlert('CPF inválido.', 'danger');

		// Se ainda não carregamos a lista de e-mails, primeiro chama endpoint de descoberta
		if (!listaWrapper) {
			await carregarEmails(cpfDigits);
			return; // usuário depois submete novamente escolhendo
		}

		const selecionado = listaWrapper.querySelector('input[type="radio"][name="emailSelecionado"]:checked');
		if (!selecionado) return showAlert('Selecione um e-mail.', 'warning');
		const emailSelecionado = selecionado.value;
		if (!emailConfirm) return showAlert('Confirme o e-mail digitando no campo abaixo.', 'warning');
		if (emailConfirm.toLowerCase() !== emailSelecionado.toLowerCase()) return showAlert('Confirmação não corresponde ao e-mail selecionado.', 'danger');

		// Envia solicitação final
		await solicitarReset({ cpf: cpfInput.value, email: emailSelecionado, emailConfirm });
	});

	async function carregarEmails(cpfDigits) {
		toggleLoading(true, 'Consultando...');
		try {
			const bp = (window._BASE_PATH && typeof window._BASE_PATH === 'string') ? window._BASE_PATH : '/gestor';
			const resp = await fetch(`${bp}/api/recover/emails?cpf=${encodeURIComponent(cpfDigits)}`);
			const data = await resp.json();
			if (!data.success) {
				showAlert(data.message || 'Não foi possível consultar.', 'danger');
				return;
			}
			if (data.quantidade === 1) {
				// Apenas um email: criar automaticamente wrapper com um radio já selecionado
				criarListaEmails([{ email: data.emails[0].original, masked: data.emails[0].email }]);
				showAlert('Confirmar e-mail para enviar redefinição.', 'info');
			} else {
				criarListaEmails(data.emails.map(e => ({ email: e.original, masked: e.email })));
				showAlert('Selecione o e-mail correspondente e confirme digitando abaixo.', 'info');
			}
			emailGroup?.classList.remove('d-none');
			emailInput.placeholder = 'Digite novamente o e-mail escolhido';
		} catch (e) {
			console.error(e);
			showAlert('Erro consultando e-mails.', 'danger');
		} finally {
			toggleLoading(false);
		}
	}

	function criarListaEmails(lista) {
		if (listaWrapper) listaWrapper.remove();
		listaWrapper = document.createElement('div');
		listaWrapper.className = 'mb-3 border rounded p-3 bg-light';
		const title = document.createElement('div');
		title.className = 'fw-medium mb-2';
		title.textContent = 'E-mails encontrados:';
		listaWrapper.appendChild(title);
		lista.forEach((item, idx) => {
			const id = 'emailOpt'+idx;
			const div = document.createElement('div');
			div.className = 'form-check';
			div.innerHTML = `
				<input class="form-check-input" type="radio" name="emailSelecionado" id="${id}" value="${item.email}" ${idx===0?'checked':''}>
				<label class="form-check-label" for="${id}">${mask(item.email)}</label>`;
			listaWrapper.appendChild(div);
		});
		form.insertBefore(listaWrapper, form.querySelector('.d-grid'));
	}

	async function solicitarReset(payload) {
		toggleLoading(true, 'Enviando...');
		try {
			const bp = (window._BASE_PATH && typeof window._BASE_PATH === 'string') ? window._BASE_PATH : '/gestor';
			const resp = await fetch(`${bp}/esqueci-senha`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await resp.json();
			if (data.success) {
				showAlert(data.message, 'success');
				form.reset();
				if (listaWrapper) { listaWrapper.remove(); listaWrapper = null; }
				emailGroup.classList.add('d-none');
				emailInput.value = '';
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

	function toggleLoading(state, text) {
		if (state) {
			submitBtn.disabled = true;
			submitBtn.innerHTML = `<i class="bi bi-hourglass-split me-2"></i>${text || 'Processando...'}`;
		} else {
			submitBtn.disabled = false;
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

	function mask(email) { // Reproduz mesmo padrão backend
		if(!email || !email.includes('@')) return '***';
		const [local,domain]=email.split('@');
		if(local.length<=2) return local[0]+'***@'+domain;
		return local[0]+'*'.repeat(local.length-2)+local[local.length-1]+'@'+domain;
	}

	// Ajustes de fundo
	const body = document.body;
	if (!body.classList.contains('login-bg')) body.classList.add('login-bg');
	body.style.background='linear-gradient(180deg, #4a90e2 0%, #63a4ff 35%, #8bb8ff 70%, #b3d1ff 100%)';
	body.style.minHeight='100vh';
	body.style.backgroundAttachment='fixed';
	body.style.backgroundSize='cover';
});

