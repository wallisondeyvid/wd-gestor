import { createUnitScope } from '#shared/unitScope.js';
import {
	findFuncionarioByIdRepo,
	deleteFuncionarioByIdRepo,
} from '#modules/gestor/app/repositories/FuncionarioRepository.js';
import { findUserByFuncionarioIdRepo } from '#modules/gestor/app/repositories/UserRepository.js';

const GLOBAL_SCOPE = createUnitScope({});

function normalizeUnitId(value) {
	return String(value || '').trim();
}

export async function deleteFuncionarioPostExecutionService({ funcionarioId, canonicalUnitId = null }) {
	const scopedUnitId = normalizeUnitId(canonicalUnitId) || null;
	const lookupScope = scopedUnitId
		? createUnitScope({ unidadeId: scopedUnitId })
		: GLOBAL_SCOPE;

	const funcionario = await findFuncionarioByIdRepo({
		unitScope: lookupScope,
		id: funcionarioId,
		unidadeId: scopedUnitId,
	});

	if (!funcionario) {
		return { kind: 'already_removed' };
	}

	const usuarioVinculado = await findUserByFuncionarioIdRepo({
		unitScope: GLOBAL_SCOPE,
		funcionarioId: funcionario._id,
	});

	if (usuarioVinculado?.role === 'master') {
		return { kind: 'forbidden_master_link' };
	}

	const effectiveUnitId = scopedUnitId || normalizeUnitId(funcionario?.unidade_id) || null;
	const deleteScope = effectiveUnitId
		? createUnitScope({ unidadeId: effectiveUnitId })
		: GLOBAL_SCOPE;

	await deleteFuncionarioByIdRepo({
		unitScope: deleteScope,
		id: funcionarioId,
		unidadeId: effectiveUnitId,
	});

	return {
		kind: 'deleted',
		funcionarioNome: funcionario.nome,
	};
}

export default deleteFuncionarioPostExecutionService;