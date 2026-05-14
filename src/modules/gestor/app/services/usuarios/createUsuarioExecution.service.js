import {
	createFuncionarioDoc,
	createUserMembership,
	findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean,
	saveUserDoc,
	setFuncionarioUsuarioIdById,
	setFuncionarioUsuarioIdIfEmpty,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { createUserAndSendPassword } from '#modules/gestor/app/services/userService.js';

function normalizeRoleValue(value) {
	return String(value || '').trim().toLowerCase();
}

function resolvePapelContextualFromRole(role) {
	const normalizedRole = normalizeRoleValue(role);
	if (normalizedRole === 'diretor') return 'gestor';
	if (normalizedRole === 'user') return 'user';
	return null;
}

function buildUserMembershipPayload({ userId, role, unidadeId, funcionarioId = null }) {
	const papelContextual = resolvePapelContextualFromRole(role);
	const unidadeIdNorm = String(unidadeId || '').trim();
	if (!userId || !papelContextual || !unidadeIdNorm) {
		return null;
	}

	return {
		user_id: userId,
		unidade_id: unidadeIdNorm,
		papel_contextual: papelContextual,
		status: 'active',
		funcionario_id: funcionarioId || null,
		origem: 'gestor-user-admin',
	};
}

function isDuplicateKeyError(error) {
	const code = error?.code || error?.original?.code || null;
	return code === 11000 || /duplicate key/i.test(String(error?.message || error || ''));
}

function normalizeEntityId(value) {
	return String(value || '').trim();
}

async function findCriarUsuarioFuncionarioByCpfUnidade(cleanCpf, unidadeId) {
	const normalizedUnidadeId = normalizeEntityId(unidadeId);
	if (!cleanCpf || !normalizedUnidadeId) return null;

	return findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean(cleanCpf, normalizedUnidadeId);
}

async function setCriarUsuarioFuncionarioUsuarioIdIfEmpty(funcionarioId, userId, unidadeId = null) {
	return setFuncionarioUsuarioIdIfEmpty(funcionarioId, userId, unidadeId);
}

async function setCriarUsuarioFuncionarioUsuarioIdById(funcionarioId, userId, unidadeId = null) {
	return setFuncionarioUsuarioIdById(funcionarioId, userId, unidadeId);
}

async function createCriarUsuarioFuncionarioDoc(doc) {
	return createFuncionarioDoc(doc);
}

async function materializeCriarUsuarioFuncionarioLinkCore({
	user,
	isExistingUser,
	nome,
	email,
	cleanCpf,
	unidadeId,
	funcionarioId,
	funcionarioDoc,
	wantsNewFuncionario,
}) {
	let linkedFuncionarioId = funcionarioDoc?._id || null;
	let funcionarioNovo = null;

	if (funcionarioDoc) {
		try {
			const shouldSyncUserFuncionarioId = !user.funcionario_id;
			if (!isExistingUser || shouldSyncUserFuncionarioId) {
				user.funcionario_id = funcionarioDoc._id;
				if (!user.unidade_id && unidadeId) user.unidade_id = unidadeId;
				await saveUserDoc(user);
			}
			await setCriarUsuarioFuncionarioUsuarioIdIfEmpty(
				funcionarioDoc._id,
				user._id,
				funcionarioDoc.unidade_id || unidadeId || null,
			);
		} catch (linkErr) {
			console.warn('[criarUsuario] falha ao vincular funcionario_id informado:', linkErr?.message || linkErr);
		}
	}

	if (wantsNewFuncionario && !funcionarioId) {
		try {
			const existente = await findCriarUsuarioFuncionarioByCpfUnidade(cleanCpf, unidadeId);
			if (existente) {
				linkedFuncionarioId = existente._id;
				const shouldSyncUserFuncionarioId = !user.funcionario_id;
				if (!isExistingUser || shouldSyncUserFuncionarioId) {
					user.funcionario_id = existente._id;
					if (!user.unidade_id && unidadeId) user.unidade_id = unidadeId;
					await saveUserDoc(user);
				}
				try { await setCriarUsuarioFuncionarioUsuarioIdById(existente._id, user._id, existente.unidade_id || unidadeId || null); } catch (_up) {}
				console.log('[criarUsuario] Vinculado a funcionário existente', { funcionario_id: existente._id.toString(), user_id: user._id.toString() });
			} else {
				const placeholderRG = 'RG' + Date.now();
				const placeholderNascimento = new Date('2000-01-01');
				const placeholderTelefone = '(00) 0000-0000';
				funcionarioNovo = await createCriarUsuarioFuncionarioDoc({
					unidade_id: unidadeId,
					nome: user.nome || (nome && nome.trim()) || String(email || '').split('@')[0],
					rg: placeholderRG,
					cpf: cleanCpf,
					data_nascimento: placeholderNascimento,
					sexo: 'N',
					email,
					telefone: placeholderTelefone,
					usuario_id: user._id,
				});
				linkedFuncionarioId = funcionarioNovo._id;
				if (!isExistingUser) {
					user.funcionario_id = funcionarioNovo._id;
					if (!user.unidade_id) user.unidade_id = unidadeId;
					await saveUserDoc(user);
				}
				console.log('[criarUsuario] Funcionário placeholder criado e vinculado', { funcionario_id: funcionarioNovo._id.toString(), user_id: user._id.toString() });
			}
		} catch (errFuncionario) {
			const msg = String(errFuncionario && (errFuncionario.message || errFuncionario));
			const code = (errFuncionario && (errFuncionario.code || errFuncionario?.original?.code)) || null;
			const isDup = code === 11000 || /duplicate key/i.test(msg);
			if (isDup) {
				try {
					const existente = cleanCpf
						? await findCriarUsuarioFuncionarioByCpfUnidade(cleanCpf, unidadeId)
						: null;
					if (existente) {
						linkedFuncionarioId = existente._id;
						if (!isExistingUser) {
							user.funcionario_id = existente._id;
							if (!user.unidade_id && unidadeId) user.unidade_id = unidadeId;
							await saveUserDoc(user);
						}
						try { await setCriarUsuarioFuncionarioUsuarioIdById(existente._id, user._id, existente.unidade_id || unidadeId || null); } catch (_up2) {}
						console.warn('[criarUsuario] Conflito ao criar funcionário; vinculado a existente', { funcionario_id: existente._id.toString() });
					}
				} catch (_e) {}
			} else {
				return {
					kind: 'funcionario_create_error',
					message: 'Falha ao criar funcionário automático: ' + (errFuncionario.message || 'erro'),
				};
			}
		}
	}

	return { kind: 'ok', linkedFuncionarioId, funcionarioNovo };
}

async function materializeCriarUsuarioMembershipCore({
	userId,
	requestedUserRole,
	unidadeId,
	linkedFuncionarioId,
}) {
	const membershipPayload = buildUserMembershipPayload({
		userId,
		role: requestedUserRole,
		unidadeId,
		funcionarioId: linkedFuncionarioId,
	});
	if (!membershipPayload) {
		return { kind: 'ok' };
	}

	try {
		await createUserMembership(membershipPayload);
	} catch (membershipErr) {
		if (isDuplicateKeyError(membershipErr)) {
			return {
				kind: 'membership_duplicate',
			};
		}
		console.error('[criarUsuario] falha ao criar membership:', membershipErr);
		return {
			kind: 'membership_error',
			message: 'Falha ao criar vínculo do usuário com a unidade',
		};
	}

	return { kind: 'ok' };
}

async function materializeCriarUsuarioUserMaterializationCore({
	existingUser = null,
	nome,
	email,
	cleanCpf,
	requestedUserRole,
	unidadeId,
	funcionarioId = null,
	senha,
}) {
	const isExistingUser = !!existingUser;
	let user = existingUser;
	let tempPasswordPlain = null;

	if (!user) {
		console.log('[criarUsuario] disparando createUserAndSendPassword');
		user = await createUserAndSendPassword({
			nome: (nome && nome.trim()) || String(email || '').split('@')[0],
			email,
			cpf: cleanCpf || undefined,
			role: requestedUserRole,
			unidade_id: unidadeId || null,
			funcionario_id: funcionarioId || null,
			senha,
		});
		tempPasswordPlain = user._temp_password_plain || null;
	}

	return { user, isExistingUser, tempPasswordPlain };
}

export async function createUsuarioExecutionService({
	existingUser = null,
	nome,
	email,
	cleanCpf,
	requestedUserRole,
	unidadeId,
	funcionarioId = null,
	funcionarioDoc = null,
	wantsNewFuncionario = false,
	senha,
} = {}) {
	const userMaterializationResult = await materializeCriarUsuarioUserMaterializationCore({
		existingUser,
		nome,
		email,
		cleanCpf,
		requestedUserRole,
		unidadeId,
		funcionarioId,
		senha,
	});
	const { user, isExistingUser, tempPasswordPlain } = userMaterializationResult;

	const funcionarioLinkResult = await materializeCriarUsuarioFuncionarioLinkCore({
		user,
		isExistingUser,
		nome,
		email,
		cleanCpf,
		unidadeId,
		funcionarioId,
		funcionarioDoc,
		wantsNewFuncionario,
	});
	if (funcionarioLinkResult.kind === 'funcionario_create_error') {
		return {
			kind: 'funcionario_create_error',
			message: funcionarioLinkResult.message,
		};
	}

	const { linkedFuncionarioId, funcionarioNovo } = funcionarioLinkResult;

	const membershipResult = await materializeCriarUsuarioMembershipCore({
		userId: user._id,
		requestedUserRole,
		unidadeId,
		linkedFuncionarioId,
	});
	if (membershipResult.kind !== 'ok') {
		return membershipResult;
	}

	const payload = {
		id: user._id,
		funcionario_id: linkedFuncionarioId || user.funcionario_id || funcionarioNovo?._id || null,
		outcome: isExistingUser ? 'linked' : 'created',
	};
	if (tempPasswordPlain && process.env.NODE_ENV !== 'production') {
		payload.tempPassword = tempPasswordPlain;
	}

	return {
		kind: 'created',
		userId: user._id,
		payload,
	};
}

export default createUsuarioExecutionService;