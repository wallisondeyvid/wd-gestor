import {
	deleteFuncionarioForDeletePostData,
	findFuncionarioForDeletePostData,
	findLinkedUserForDeletePostData,
} from '#modules/gestor/app/data/funcionarios/funcionarioDeletePostDataFacade.js';

function normalizeUnitId(value) {
	return String(value || '').trim();
}

export async function deleteFuncionarioPostExecutionService({ funcionarioId, canonicalUnitId = null }) {
	const scopedUnitId = normalizeUnitId(canonicalUnitId) || null;

	const funcionario = await findFuncionarioForDeletePostData({
		funcionarioId,
		unidadeId: scopedUnitId,
	});

	if (!funcionario) {
		return { kind: 'already_removed' };
	}

	const usuarioVinculado = await findLinkedUserForDeletePostData({ funcionarioId: funcionario._id });

	if (usuarioVinculado?.role === 'master') {
		return { kind: 'forbidden_master_link' };
	}

	const effectiveUnitId = scopedUnitId || normalizeUnitId(funcionario?.unidade_id) || null;

	await deleteFuncionarioForDeletePostData({
		funcionarioId,
		unidadeId: effectiveUnitId,
	});

	return {
		kind: 'deleted',
		funcionarioNome: funcionario.nome,
	};
}

export default deleteFuncionarioPostExecutionService;