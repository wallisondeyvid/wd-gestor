import {
	findFuncionarioById,
	deleteFuncionarioById,
	findUserByFuncionarioId,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeUnitId(value) {
	return String(value || '').trim();
}

export async function deleteFuncionarioPostExecutionService({ funcionarioId, canonicalUnitId = null }) {
	const scopedUnitId = normalizeUnitId(canonicalUnitId) || null;

	const funcionario = await findFuncionarioById(funcionarioId, scopedUnitId);

	if (!funcionario) {
		return { kind: 'already_removed' };
	}

	const usuarioVinculado = await findUserByFuncionarioId(funcionario._id);

	if (usuarioVinculado?.role === 'master') {
		return { kind: 'forbidden_master_link' };
	}

	const effectiveUnitId = scopedUnitId || normalizeUnitId(funcionario?.unidade_id) || null;

	await deleteFuncionarioById(funcionarioId, effectiveUnitId);

	return {
		kind: 'deleted',
		funcionarioNome: funcionario.nome,
	};
}

export default deleteFuncionarioPostExecutionService;