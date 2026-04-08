import {
	saveUserDoc,
	setFuncionarioUsuarioIdById,
	unsetFuncionarioUsuarioIdById,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function updateUsuarioExecutionService({
	user,
	isTargetMaster,
	cleanCpf,
	trimmedNome = null,
	role,
	unidadeId,
	funcionarioId,
} = {}) {
	if (cleanCpf) {
		user.cpf = cleanCpf;
	} else {
		user.cpf = undefined;
	}

	if (trimmedNome) {
		user.nome = trimmedNome;
	}

	if (!isTargetMaster) {
		if (role && role !== 'master') user.role = role;
		const prevUnidadeId = user.unidade_id ? String(user.unidade_id) : null;
		user.unidade_id = unidadeId || null;

		const prevFuncionarioId = user.funcionario_id ? String(user.funcionario_id) : null;
		const nextFuncionarioId = funcionarioId ? String(funcionarioId) : null;
		user.funcionario_id = nextFuncionarioId || null;

		if (prevFuncionarioId !== nextFuncionarioId) {
			try {
				if (prevFuncionarioId) {
					await unsetFuncionarioUsuarioIdById(prevFuncionarioId, prevUnidadeId);
				}
				if (nextFuncionarioId) {
					await setFuncionarioUsuarioIdById(nextFuncionarioId, user._id, unidadeId || null);
				}
			} catch (linkErr) {
				console.warn('[atualizarUsuario] aviso ao sincronizar vínculo de funcionário:', linkErr?.message || linkErr);
			}
		}
	}

	await saveUserDoc(user);

	return {
		kind: 'updated',
		userId: user._id,
		updated: true,
	};
}

export default updateUsuarioExecutionService;