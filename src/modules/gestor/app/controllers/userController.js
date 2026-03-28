// Controller de Usuários (migrado)
import {
	findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean,
	findFuncionarioByIdSelectIdUnidadeUsuarioLean,
	findUserById,
	saveUserDoc,
	findUserDuplicadoByCpfUnidadeExcludingId,
	createFuncionarioDoc,
	createUserMembership,
	unsetFuncionarioUsuarioIdById,
	setFuncionarioUsuarioIdById,
	setFuncionarioUsuarioIdIfEmpty,
	countUsersMasters,
	findUserByEmail,
	findUserMembershipsByUserIdsLean,
	findUnidadesByIdsNomeCodigoLean,
	findUserMembershipByUserAndUnidade,
	findUserByIdSelectAuthLockInfo,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { listLockedUsersService } from '#modules/gestor/app/services/usuarios/listLockedUsers.service.js';
import { checkUsuarioEmailOwnerService } from '#modules/gestor/app/services/usuarios/checkUsuarioEmailOwner.service.js';
import { createUsuarioExecutionService } from '#modules/gestor/app/services/usuarios/createUsuarioExecution.service.js';
import { getUsuarioAtualProfileOwnerService } from '#modules/gestor/app/services/usuarios/getUsuarioAtualProfileOwner.service.js';
import { listUsuariosOwnerService } from '#modules/gestor/app/services/usuarios/listUsuariosOwner.service.js';
import { deleteUsuarioExecutionService } from '#modules/gestor/app/services/usuarios/deleteUsuarioExecution.service.js';
import { statusUsuarioLockStateOwnerService } from '#modules/gestor/app/services/usuarios/statusUsuarioLockStateOwner.service.js';
import { toggleUsuarioExecutionService } from '#modules/gestor/app/services/usuarios/toggleUsuarioExecution.service.js';
import { unlockUsuarioExecutionService } from '#modules/gestor/app/services/usuarios/unlockUsuarioExecution.service.js';
import { updateUsuarioExecutionService } from '#modules/gestor/app/services/usuarios/updateUsuarioExecution.service.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
// Usamos o util do módulo Gestor para manter a chave `error` nas respostas 4xx/5xx
import { ok, created, badRequest, notFound, serverError } from '#modules/gestor/app/utils/apiResponse.js';
import {
	GESTOR_AUTH_CONTEXT_RESOLVER_FLAG,
	resolveGestorAuthContext,
} from '#modules/gestor/app/services/authContextResolver.js';

function isAuthContextResolverEnabledForRequest(req) {
	const featureFlags = req.app?.locals?.gestorAuthContextFeatureFlags || null;
	if (featureFlags && typeof featureFlags === 'object') {
		return isFeatureEnabled(featureFlags, GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
	}
	return isFlagEnabled(GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
}

function buildUsuarioAuthContextExtras(authContext) {
	if (!authContext || authContext.source !== 'auth-context-v1') {
		return null;
	}

	return {
		authenticated: !!authContext.authenticated,
		source: authContext.source,
		globalRole: authContext.globalRole || null,
		effectiveRole: authContext.effectiveRole || null,
		needsUnitSelection: !!authContext.needsUnitSelection,
		membershipCount: Number(authContext.membershipCount || 0),
		activeContext: authContext.activeContext
			? {
				membershipId: authContext.activeContext.membershipId,
				unidadeId: authContext.activeContext.unidadeId,
				unidadePrincipalId: authContext.activeContext.unidadePrincipalId || null,
				papelContextual: authContext.activeContext.papelContextual || null,
				funcionarioId: authContext.activeContext.funcionarioId || null,
				legacyRole: authContext.activeContext.legacyRole || null,
			}
			: null,
		membershipsSummary: Array.isArray(authContext.memberships)
			? authContext.memberships.map((membership) => ({
				membershipId: membership.membershipId,
				unidadeId: membership.unidadeId,
				unidadePrincipalId: membership.unidadePrincipalId || null,
				unidadeNome: membership.unidadeNome || null,
				unidadeCodigo: membership.unidadeCodigo || null,
				papelContextual: membership.papelContextual || null,
				legacyRole: membership.legacyRole || null,
			}))
			: [],
	};
}

function normalizeRoleValue(value) {
	return String(value || '').trim().toLowerCase();
}

function resolveRequestedUserRole(value) {
	const normalizedRole = normalizeRoleValue(value);
	if (!normalizedRole || normalizedRole === 'master') {
		return 'user';
	}
	return normalizedRole;
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

function buildUnidadeSummaryLabel(unidade) {
	const codigo = String(unidade?.codigo || '').trim();
	const nome = String(unidade?.nome || '').trim();
	if (codigo && nome) return `${codigo} - ${nome}`;
	return nome || codigo || null;
}

const CHECK_USUARIO_EMAIL_GLOBAL_SCOPE = { type: 'global', unidadeId: null };
const CRIAR_USUARIO_PREFLIGHT_GLOBAL_SCOPE = { type: 'global', unidadeId: null };

async function findCriarUsuarioFuncionarioById(funcionarioId) {
	return findFuncionarioByIdSelectIdUnidadeUsuarioLean(funcionarioId);
}

async function findCriarUsuarioFuncionarioByCpfUnidade(cleanCpf, unidadeId) {
	const normalizedUnidadeId = normalizeEntityId(unidadeId);
	if (!cleanCpf || !normalizedUnidadeId) return null;

	return findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean(cleanCpf, normalizedUnidadeId);
}

async function setCriarUsuarioFuncionarioUsuarioIdIfEmpty(funcionarioId, userId) {
	return setFuncionarioUsuarioIdIfEmpty(funcionarioId, userId);
}

async function setCriarUsuarioFuncionarioUsuarioIdById(funcionarioId, userId) {
	return setFuncionarioUsuarioIdById(funcionarioId, userId);
}

async function createCriarUsuarioFuncionarioDoc(doc) {
	return createFuncionarioDoc(doc);
}

async function resolveCriarUsuarioProvidedFuncionario({ funcionarioId, unidadeId }) {
	if (!funcionarioId) {
		return {
			funcionarioDoc: null,
			unidadeId,
		};
	}

	try {
		const funcionarioDoc = await findCriarUsuarioFuncionarioById(funcionarioId);
		if (!funcionarioDoc) {
			return {
				error: {
					message: 'Funcionário não encontrado',
					code: 'FUNC_NOT_FOUND',
				},
			};
		}

		if (funcionarioDoc.usuario_id) {
			return {
				error: {
					message: 'Funcionário já vinculado a um usuário',
					code: 'FUNC_ALREADY_LINKED',
				},
			};
		}

		if (unidadeId && String(funcionarioDoc.unidade_id) !== String(unidadeId)) {
			return {
				error: {
					message: 'Funcionário pertence a outra unidade',
					code: 'FUNC_WRONG_UNIT',
				},
			};
		}

		return {
			funcionarioDoc,
			unidadeId: unidadeId || String(funcionarioDoc.unidade_id),
		};
	} catch (_error) {
		return {
			error: {
				message: 'Funcionário inválido',
				code: 'FUNC_INVALID',
			},
		};
	}
}

async function loadMembershipsSummaryForUserId(userId) {
	const normalizedUserId = normalizeEntityId(userId);
	if (!normalizedUserId) return [];

	const memberships = await findUserMembershipsByUserIdsLean([normalizedUserId]);
	if (!Array.isArray(memberships) || memberships.length === 0) return [];

	const unidadeIds = [...new Set(memberships.map((membership) => normalizeEntityId(membership?.unidade_id)).filter(Boolean))];
	const unidades = unidadeIds.length > 0 ? await findUnidadesByIdsNomeCodigoLean(unidadeIds) : [];
	const unidadesById = new Map(
		(Array.isArray(unidades) ? unidades : []).map((unidade) => [normalizeEntityId(unidade?._id), unidade])
	);

	return memberships.map((membership) => {
		const unidadeId = normalizeEntityId(membership?.unidade_id);
		const unidade = unidadesById.get(unidadeId) || null;
		return {
			unidade_id: unidadeId,
			unidade_nome: buildUnidadeSummaryLabel(unidade) || unidadeId,
			papel_contextual: String(membership?.papel_contextual || '').trim() || null,
			status: String(membership?.status || '').trim() || null,
			funcionario_id: normalizeEntityId(membership?.funcionario_id) || null,
		};
	});
}

// Lista usuários atualmente bloqueados por lock_until futuro
export async function listLockedUsers(req, res) {
	try {
		if (!req.user) return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
		if (!(req.user.isMaster || req.user.role === 'admin')) return res.status(403).json({ success:false, error:'Acesso negado', code:'FORBIDDEN' });
		const agora = new Date();
		const docs = await listLockedUsersService(agora);
		return res.json({ success:true, total: docs.length, data: docs });
	} catch (e) {
		console.error('[listLockedUsers] erro:', e);
		return res.status(500).json({ success:false, error:'Falha ao listar bloqueados', code:'SERVER_ERROR' });
	}
}

export async function listarUsuarios(req, res, next) {
    try {
		if (!req.user) return res.status(401).send('Não autenticado');
		if (!req.user.isMaster && req.user.role !== 'admin') return res.status(403).send('Acesso negado');
		const result = await listUsuariosOwnerService({ isMaster: req.user.isMaster });
		const { usuarios, unidadesFiltradas, funcionarios } = result;
		res.render('usuarios', { usuarios, user: req.user, unidadesFiltradas, funcionarios });
	} catch (e) {
		console.error('Erro na rota /usuarios:', e);
		next(e);
	}
}

export async function toggleUsuario(req, res) {
	if (!req.user) return res.status(401).send('Não autenticado');
	if (!req.user.isMaster && req.user.role !== 'admin') return res.status(403).send('Acesso negado');
	const user = await findUserById(req.params.id);
	if (!user) return res.status(404).send('Usuário não encontrado');
	if (user.role === 'master' && !req.user.isMaster) return res.status(403).send('Apenas Master pode alterar o usuário Master');
	await toggleUsuarioExecutionService({ user });
	// Se for requisição AJAX (fetch com X-Requested-With) retorna JSON
	if (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest') {
		return res.json({ success:true, id: user._id, ativo: user.ativo });
	}
	res.redirect('/gestor/usuarios');
}

export async function atualizarUsuario(req, res) {
	if (!req.user) return res.status(401).send('Não autenticado');
	if (!req.user.isMaster && req.user.role !== 'admin') return res.status(403).send('Acesso negado');
	try {
		const { nome, role, cpf, unidade_id, funcionario_id } = req.body;
		const user = await findUserById(req.params.id);
		if (!user) return res.status(404).send('Usuário não encontrado');
		if (user.role === 'master' && !req.user.isMaster) return res.status(403).send('Apenas Master pode alterar o usuário Master');
		const isTargetMaster = user.role === 'master';
		if (role && (role === 'user' || role === 'diretor') && (!unidade_id || unidade_id.trim() === '')) {
			return res.status(400).send('Para usuários e diretores, é obrigatório selecionar uma unidade vinculada.');
		}
		const cleanCpf = cpf ? cpf.replace(/\D/g,'') : null;
		if (cpf) {
			const duplicado = await findUserDuplicadoByCpfUnidadeExcludingId(user._id, cleanCpf, user.unidade_id);
			if (duplicado) return res.status(400).send('CPF já cadastrado nesta empresa');
		}

		const result = await updateUsuarioExecutionService({
			user,
			isTargetMaster,
			cleanCpf,
			trimmedNome: nome ? nome.trim() : null,
			role,
			unidadeId: unidade_id,
			funcionarioId: funcionario_id,
		});
		// Se for requisição AJAX/JSON, responde com JSON; caso contrário, PRG 303 para evitar re-POST
		const wantsJson = (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || String(req.headers.accept||'').includes('application/json'));
		if (wantsJson) {
			return res.json({ success:true, id: result.userId, updated: result.updated });
		}
		const bp = (req.baseUrl && req.baseUrl.trim()) || '/gestor';
		return res.redirect(303, `${bp}/usuarios`);
	} catch (e) {
		console.error('Erro update usuário:', e);
		res.status(500).send('Falha ao atualizar usuário');
	}
}

export async function excluirUsuario(req, res) {
	if (!req.user) return res.status(401).send('Não autenticado');
	if (!req.user.isMaster) return res.status(403).send('Acesso negado');
	try {
		const user = await findUserById(req.params.id);
		if (!user) return res.status(404).send('Usuário não encontrado');
		if (String(user._id) === String(req.user._id)) {
			return res.status(403).send('Você não pode excluir seu próprio usuário.');
		}
		if (user.role === 'master') {
			const totalMasters = await countUsersMasters();
			console.warn('Tentativa de exclusão de master bloqueada. Total masters:', totalMasters);
			return res.status(403).send('Usuário master não pode ser excluído.');
		}
		// Se estiver vinculado a um funcionário, remover vínculo no documento do funcionário
		const vinculoFuncionarioId = user.funcionario_id ? String(user.funcionario_id) : null;
		await deleteUsuarioExecutionService({ userId: user._id, vinculoFuncionarioId });
		if (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest') {
			return res.json({ success:true, deleted:true, id: user._id });
		}
		res.redirect('/gestor/usuarios');
	} catch (e) {
		console.error('Erro excluir usuário:', e);
		if (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest') {
			return res.status(500).json({ success:false, error:'Falha ao excluir usuário' });
		}
		res.status(500).send('Falha ao excluir usuário');
	}
}

export async function criarUsuario(req, res) {
	try {
		if (!req.user?.isMaster && req.user?.role !== 'admin') {
			return res.status(403).json({ success:false, error:'Acesso negado', code:'FORBIDDEN' });
		}
		let rawBody = req.body;
		// Robustez: se por alguma razão o body chegou como string (text/plain), tenta parsear
		if (typeof rawBody === 'string') {
			try { rawBody = JSON.parse(rawBody); } catch { /* mantém string */ }
		}
		// Extrair campos com tolerância a chaves alternativas (Email, e-mail)
		const nome = rawBody?.nome;
		const senha = rawBody?.senha;
		const role = rawBody?.role;
		let unidade_id = rawBody?.unidade_id;
		const funcionario_id = rawBody?.funcionario_id;
		const cpf = rawBody?.cpf;
		const criarNovoFuncionario = rawBody?.criarNovoFuncionario;
		let email = rawBody?.email ?? rawBody?.Email ?? rawBody?.['e-mail'] ?? rawBody?.['E-mail'];
		if (typeof email === 'string') email = email.trim();
		if (!email) {
			// Log leve para diagnosticar perda de body no Vercel sem vazar senha
			try {
				const ct = (req.headers && (req.headers['content-type'] || req.headers['Content-Type'])) || null;
				const keys = rawBody && typeof rawBody === 'object' ? Object.keys(rawBody) : [];
				if (Array.isArray(keys) && keys.length) {
					// Ocultar campo senha, se existir
					if (keys.includes('senha')) keys.splice(keys.indexOf('senha'), 1);
				}
				console.warn('[criarUsuario] EMAIL_REQUIRED — body sem e-mail', { method:req.method, url:req.originalUrl||req.url, contentType:ct, keys });
			} catch { /* noop */ }
			return badRequest(res, 'E-mail obrigatório', { code: 'EMAIL_REQUIRED' });
		}
		const emailNorm = String(email).toLowerCase();
		const existingUser = await findUserByEmail(emailNorm);
		const requestedUserRole = resolveRequestedUserRole(role);
		const normalizedRole = normalizeRoleValue(role);
		const canLinkExistingUser = !!buildUserMembershipPayload({
			userId: existingUser?._id || null,
			role: requestedUserRole,
			unidadeId: unidade_id,
		});
		if (existingUser && !canLinkExistingUser) {
			return badRequest(res, 'Email já cadastrado', { code: 'EMAIL_DUPLICATE' });
		}
		if ((normalizedRole === 'user' || normalizedRole === 'diretor') && (!unidade_id || unidade_id.trim() === '')) {
			return badRequest(res, 'Para usuários e diretores, é obrigatório selecionar uma unidade vinculada.', { code: 'UNIT_REQUIRED' });
		}

		// Se um funcionario_id foi enviado, validar que ele pertence à unidade selecionada e não possui usuario vinculado
		let funcionarioDoc = null;
		if (funcionario_id) {
			const resolvedProvidedFuncionario = await resolveCriarUsuarioProvidedFuncionario({
				funcionarioId: funcionario_id,
				unidadeId: unidade_id,
			});
			if (resolvedProvidedFuncionario.error) {
				return badRequest(res, resolvedProvidedFuncionario.error.message, {
					code: resolvedProvidedFuncionario.error.code,
				});
			}

			funcionarioDoc = resolvedProvidedFuncionario.funcionarioDoc;
			unidade_id = resolvedProvidedFuncionario.unidadeId;
		}

		if (existingUser) {
			const existingMembership = await findUserMembershipByUserAndUnidade(existingUser._id, unidade_id);
			if (existingMembership) {
				return badRequest(res, 'Usuário já vinculado a esta unidade', { code: 'USER_MEMBERSHIP_DUPLICATE' });
			}
		}

		const wantsNewFuncionario = (criarNovoFuncionario === 'on' || criarNovoFuncionario === 'true' || criarNovoFuncionario === true);
		const cleanCpf = cpf ? cpf.replace(/\D/g,'') : null;
		if (wantsNewFuncionario && !funcionario_id) {
			if (!cleanCpf) return badRequest(res, 'CPF é obrigatório para criar novo funcionário automaticamente.', { code: 'CPF_REQUIRED' });
			if (!unidade_id) return badRequest(res, 'Unidade é obrigatória para criar novo funcionário.', { code: 'UNIT_REQUIRED' });
		}

		const result = await createUsuarioExecutionService({
			existingUser,
			nome,
			email: emailNorm,
			cleanCpf,
			requestedUserRole,
			unidadeId: unidade_id,
			funcionarioId: funcionario_id,
			funcionarioDoc,
			wantsNewFuncionario,
			senha,
		});

		if (result.kind === 'membership_duplicate') {
			return badRequest(res, 'Usuário já vinculado a esta unidade', { code: 'USER_MEMBERSHIP_DUPLICATE' });
		}
		if (result.kind === 'funcionario_create_error' || result.kind === 'membership_error') {
			return serverError(res, result.message);
		}

		return created(res, result.userId, { data: result.payload });
	} catch (e) {
		console.error('[criarUsuario] erro:', e);
		return serverError(res, 'Falha ao criar usuário');
	}
}

export async function checkUsuarioEmail(req, res) {
	try {
		if (!req.user?.isMaster && req.user?.role !== 'admin') {
			return res.status(403).json({ success:false, error:'Acesso negado', code:'FORBIDDEN' });
		}

		const email = String(req.query?.email || '').trim().toLowerCase();
		if (!email) {
			return badRequest(res, 'E-mail obrigatório', { code: 'EMAIL_REQUIRED' });
		}

		const result = await checkUsuarioEmailOwnerService({ email });
		return ok(res, {
			email: result.email,
			exists: result.exists,
			user: result.user,
			membershipsCount: result.membershipsCount,
			membershipsSummary: result.membershipsSummary,
			linkedUnidadeIds: result.linkedUnidadeIds,
			blockedUnidadeIds: result.blockedUnidadeIds,
		});
	} catch (e) {
		console.error('[checkUsuarioEmail] erro:', e);
		return serverError(res, 'Falha ao verificar e-mail');
	}
}

export async function obterUsuarioAtual(req, res) {
	if (!req.user) {
		return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
	}
	try {
		const sessionIdRaw = req.session?.user?.id;
		if (!sessionIdRaw || !mongoose.Types.ObjectId.isValid(String(sessionIdRaw))) {
			return res.status(401).json({ success:false, error:'Sessão inválida', code:'UNAUTHORIZED' });
		}

		const result = await getUsuarioAtualProfileOwnerService({
			unitScope: req.unitScope,
			sessionUserId: new mongoose.Types.ObjectId(String(sessionIdRaw)),
			fallbackEmail: req.user?.email || req.session?.user?.email || null,
		});
		if (result.kind === 'not_found') {
			console.warn('[obterUsuarioAtual] usuário não encontrado', { id: result.targetId || null, email: result.email || null });
			return res.status(404).json({ success:false, error:'Usuário não encontrado', code:'NOT_FOUND' });
		}

		const { baseUser, payload } = result;

		if (isAuthContextResolverEnabledForRequest(req)) {
			const authContext = await resolveGestorAuthContext({
				authenticatedUser: baseUser,
				sessionUser: req.session?.user || null,
				existingAuthContext: req.session?.gestorAuthContext || null,
				featureFlags: req.app?.locals?.gestorAuthContextFeatureFlags || null,
				deps: req.app?.locals?.gestorAuthContextResolverDeps || undefined,
				maxTimeMS: req.app?.locals?.gestorAuthContextMaxTimeMS,
			});

			const authContextExtras = buildUsuarioAuthContextExtras(authContext);
			if (authContextExtras) {
				Object.assign(payload, authContextExtras);
			}
		}

		return ok(res, payload);
	} catch (e) {
		console.error('[obterUsuarioAtual] erro ao montar perfil enriquecido:', e);
		return serverError(res, 'Falha ao obter usuário');
	}
}

export async function atualizarSenhaUsuario(req, res) {
	if (!req.user) {
		return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
	}
	try {
		const { senhaAtual, novaSenha } = req.body;
		if (!senhaAtual || !novaSenha) return badRequest(res, 'Parâmetros insuficientes');
		const user = await findUserById(req.user.id);
		if (!user) return notFound(res, 'Usuário não encontrado');
		const confere = await bcrypt.compare(senhaAtual, user.senha);
		if (!confere) return badRequest(res, 'Senha atual inválida');
		user.senha = await bcrypt.hash(novaSenha, 10);
		// Limpa flags de primeiro acesso / senha provisória se ainda marcadas
		if (user.primeiro_acesso) user.primeiro_acesso = false;
		if (user.senha_provisoria) user.senha_provisoria = false;
		await saveUserDoc(user);
		return ok(res, { updated:true, primeiro_acesso:false, senha_provisoria:false });
	} catch (e) {
		console.error('[atualizarSenhaUsuario] erro:', e);
		return serverError(res, 'Falha ao atualizar senha');
	}
}

// Desbloqueia usuário específico (admin/master)
export async function unlockUsuario(req, res) {
	try {
		if (!req.user) return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
		if (!(req.user.isMaster || req.user.role === 'admin')) return res.status(403).json({ success:false, error:'Acesso negado', code:'FORBIDDEN' });
		const { id } = req.params;
		const user = await findUserById(id);
		if (!user) return res.status(404).json({ success:false, error:'Usuário não encontrado', code:'NOT_FOUND' });
		const result = await unlockUsuarioExecutionService({ user });
		return res.json({ success:true, unlocked: result.unlocked, id: result.userId });
	} catch (e) {
		console.error('[unlockUsuario] erro:', e);
		return res.status(500).json({ success:false, error:'Falha ao desbloquear usuário', code:'SERVER_ERROR' });
	}
}

// Status de lock / tentativas para um usuário
export async function statusUsuario(req, res) {
	try {
		if (!req.user) return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
		const { id } = req.params;
		// Permitir self ou admin/master
		const isPriv = (req.user.isMaster || req.user.role === 'admin');
		if (!isPriv && String(req.user.id) !== String(id)) {
			return res.status(403).json({ success:false, error:'Acesso negado', code:'FORBIDDEN' });
		}
		const user = await findUserByIdSelectAuthLockInfo(id);
		if (!user) return res.status(404).json({ success:false, error:'Usuário não encontrado', code:'NOT_FOUND' });
		const result = await statusUsuarioLockStateOwnerService({ user, now: new Date() });
		return res.json({
			success: true,
			data: result.data,
		});
	} catch (e) {
		console.error('[statusUsuario] erro:', e);
		return res.status(500).json({ success:false, error:'Falha ao obter status', code:'SERVER_ERROR' });
	}
}
