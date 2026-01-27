// (migrado) loginController
export async function renderLogin(req, res) {
	const { erro } = req.query;
	// Para senha/bloqueado usamos toasts client-side; demais mantêm mensagem inline.
	let mensagem = null;
	if (erro === 'usuario') mensagem = 'Usuário não cadastrado ou inativo.';
	else if (erro === 'servidor') mensagem = 'Erro interno do servidor.';
	else if (erro === 'modulo') mensagem = 'Acesso negado: você não tem permissão para acessar este módulo.';
	res.render('logingestor', { mensagem });
}
