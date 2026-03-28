import {
	findUserByIdForProfile,
	findUserByEmailForProfile,
} from '#modules/gestor/app/services/userService.js';

export async function getUsuarioAtualProfileOwnerService({ unitScope, sessionUserId, fallbackEmail } = {}) {
	let targetId = sessionUserId || null;
	let baseUser = null;

	if (targetId) {
		baseUser = await findUserByIdForProfile({ unitScope, userId: targetId });
	}

	const fallbackEmailRaw = String(fallbackEmail || '').trim() || null;
	const fallbackEmailNormalized = fallbackEmailRaw ? fallbackEmailRaw.toLowerCase() : null;
	if (!baseUser && fallbackEmailNormalized) {
		baseUser = await findUserByEmailForProfile({ unitScope, email: fallbackEmailNormalized });
		if (baseUser) {
			targetId = baseUser._id;
		}
	}

	if (!baseUser) {
		return {
			kind: 'not_found',
			targetId: targetId || null,
			email: fallbackEmailRaw,
		};
	}

	const { _id, email, role, isMaster, foto } = baseUser;
	const funcionario = baseUser.funcionario_id && typeof baseUser.funcionario_id === 'object' ? baseUser.funcionario_id : null;
	const unidadeFromUser = baseUser.unidade_id && typeof baseUser.unidade_id === 'object' ? baseUser.unidade_id : null;
	const unidadeFromFuncionario = funcionario?.unidade_id && typeof funcionario.unidade_id === 'object' ? funcionario.unidade_id : null;

	const resolvedNome = baseUser.nome || funcionario?.nome || null;
	const resolvedCpf = baseUser.cpf || funcionario?.cpf || null;
	const resolvedTelefone = baseUser.telefone || funcionario?.telefone || null;
	const unidadeResolved = unidadeFromUser || unidadeFromFuncionario || null;
	const unidade_id = unidadeResolved?._id || baseUser.unidade_id || funcionario?.unidade_id || null;
	const unidade_nome = unidadeResolved?.nome || null;
	const unidade_codigo = unidadeResolved?.codigo || null;

	return {
		kind: 'ok',
		baseUser,
		payload: {
			id: _id,
			nome: resolvedNome,
			email,
			role,
			isMaster: !!isMaster,
			unidade_id,
			unidade_nome,
			unidade_codigo,
			funcionario_id: funcionario?._id || baseUser.funcionario_id || null,
			foto: foto || null,
			cpf: resolvedCpf,
			telefone: resolvedTelefone,
		},
	};
}

export default getUsuarioAtualProfileOwnerService;