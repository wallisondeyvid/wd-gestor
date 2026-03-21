// Controller de Usuários (migrado)
import {
	findUsersLockedAfterSelectLean,
	findUsersByQueryLean,
	findAllUnidadesSelectIdCodigoNomeLean,
	findAllFuncionariosSelectIdNomeCpfLean,
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
	deleteUserById,
	unsetFuncionarioUsuarioIdIfMatchesUser,
	findUserByEmail,
	findUserMembershipsByUserIdsLean,
	findUnidadesByIdsNomeCodigoLean,
	findUserMembershipByUserAndUnidade,
	findUserByIdSelectAuthLockInfo,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
// Usamos o util do módulo Gestor para manter a chave `error` nas respostas 4xx/5xx
import { ok, created, badRequest, notFound, serverError } from '#modules/gestor/app/utils/apiResponse.js';
// Service para criação + envio de senha provisória
import {
	createUserAndSendPassword,
	findUserByIdForProfile,
	findUserByEmailForProfile,
} from '#modules/gestor/app/services/userService.js';
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
		const docs = await findUsersLockedAfterSelectLean(agora);
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
		const query = req.user.isMaster ? {} : { role: { $ne: 'master' } };
		const usuarios = await findUsersByQueryLean(query);
		const unidadesFiltradas = await findAllUnidadesSelectIdCodigoNomeLean();
		const funcionarios = await findAllFuncionariosSelectIdNomeCpfLean();
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
	user.ativo = !user.ativo;
	await saveUserDoc(user);
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
		if (cpf) {
			const cleanCpf = cpf.replace(/\D/g,'');
			const duplicado = await findUserDuplicadoByCpfUnidadeExcludingId(user._id, cleanCpf, user.unidade_id);
			if (duplicado) return res.status(400).send('CPF já cadastrado nesta empresa');
			user.cpf = cleanCpf;
		} else {
			user.cpf = undefined;
		}
		if (nome) user.nome = nome.trim();
		if (!isTargetMaster) {
			if (role && role !== 'master') user.role = role;
			user.unidade_id = unidade_id || null;
			// Gerenciar (des)vinculação de funcionário: manter consistência em Funcionario.usuario_id
			const prevFuncionarioId = user.funcionario_id ? String(user.funcionario_id) : null;
			const nextFuncionarioId = funcionario_id ? String(funcionario_id) : null;
			user.funcionario_id = nextFuncionarioId || null;
			if (prevFuncionarioId !== nextFuncionarioId) {
				try {
					if (prevFuncionarioId) {
						await unsetFuncionarioUsuarioIdById(prevFuncionarioId);
					}
					if (nextFuncionarioId) {
						await setFuncionarioUsuarioIdById(nextFuncionarioId, user._id);
					}
				} catch (linkErr) {
					console.warn('[atualizarUsuario] aviso ao sincronizar vínculo de funcionário:', linkErr?.message || linkErr);
				}
			}
		}
		await saveUserDoc(user);
		// Se for requisição AJAX/JSON, responde com JSON; caso contrário, PRG 303 para evitar re-POST
		const wantsJson = (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || String(req.headers.accept||'').includes('application/json'));
		if (wantsJson) {
			return res.json({ success:true, id: user._id, updated:true });
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
		await deleteUserById(user._id);
		if (vinculoFuncionarioId) {
			try {
				await unsetFuncionarioUsuarioIdIfMatchesUser(vinculoFuncionarioId, user._id);
			} catch(unsetErr) {
				console.warn('[excluirUsuario] aviso ao remover vínculo de funcionário:', unsetErr?.message || unsetErr);
			}
		}
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

		// Utiliza service central que já gera/usa senha, seta primeiro_acesso e dispara e-mail
		const isExistingUser = !!existingUser;
		let user = existingUser;
		if (!user) {
			console.log('[criarUsuario] disparando createUserAndSendPassword');
			user = await createUserAndSendPassword({
				nome: (nome && nome.trim()) || emailNorm.split('@')[0],
				email: emailNorm,
				cpf: cpf ? cpf.replace(/\D/g,'') : undefined,
				role: requestedUserRole,
				unidade_id: unidade_id || null,
				funcionario_id: funcionario_id || null,
				senha // pode vir definida ou service gera temporária
			});
		}

		let linkedFuncionarioId = funcionarioDoc?._id || null;

		// Se funcionario_id foi enviado e validado, efetiva o vínculo no documento do Funcionário
		if (funcionarioDoc) {
			try {
				const shouldSyncUserFuncionarioId = !user.funcionario_id;
				if (!isExistingUser || shouldSyncUserFuncionarioId) {
					user.funcionario_id = funcionarioDoc._id;
					if (!user.unidade_id) user.unidade_id = funcionarioDoc.unidade_id;
					await saveUserDoc(user);
				}
				await setCriarUsuarioFuncionarioUsuarioIdIfEmpty(funcionarioDoc._id, user._id);
			} catch(linkErr) {
				console.warn('[criarUsuario] falha ao vincular funcionario_id informado:', linkErr?.message || linkErr);
			}
		}

		// Criação ou vinculação opcional de Funcionário quando solicitado e nenhum funcionario_id fornecido
		let funcionarioNovo = null;
		const wantsNewFuncionario = (criarNovoFuncionario === 'on' || criarNovoFuncionario === 'true' || criarNovoFuncionario === true);
		if (wantsNewFuncionario && !funcionario_id) {
			// Validar campos mínimos necessários para criar um funcionário placeholder
			const cleanCpf = cpf ? cpf.replace(/\D/g,'') : null;
			if (!cleanCpf) return badRequest(res, 'CPF é obrigatório para criar novo funcionário automaticamente.', { code: 'CPF_REQUIRED' });
			if (!unidade_id) return badRequest(res, 'Unidade é obrigatória para criar novo funcionário.', { code: 'UNIT_REQUIRED' });
			try {
				// Tentar localizar funcionário existente apenas por CPF + unidade.
				const existente = await findCriarUsuarioFuncionarioByCpfUnidade(cleanCpf, unidade_id);
				if (existente) {
					linkedFuncionarioId = existente._id;
					// Vincula usuário ao funcionário já existente
					const shouldSyncUserFuncionarioId = !user.funcionario_id;
					if (!isExistingUser || shouldSyncUserFuncionarioId) {
						user.funcionario_id = existente._id;
						if (!user.unidade_id) user.unidade_id = existente.unidade_id || unidade_id;
						await saveUserDoc(user);
					}
					// marca vínculo no funcionário para evitar reaparecer como disponível
					try { await setCriarUsuarioFuncionarioUsuarioIdById(existente._id, user._id); } catch(_up) {}
					console.log('[criarUsuario] Vinculado a funcionário existente', { funcionario_id: existente._id.toString(), user_id: user._id.toString() });
				} else {
					// Criar placeholder mínimo
					const placeholderRG = 'RG' + Date.now();
					const placeholderNascimento = new Date('2000-01-01');
					const placeholderTelefone = '(00) 0000-0000';
					funcionarioNovo = await createCriarUsuarioFuncionarioDoc({
						unidade_id,
						nome: user.nome || (nome && nome.trim()) || emailNorm.split('@')[0],
						rg: placeholderRG,
						cpf: cleanCpf,
						data_nascimento: placeholderNascimento,
						sexo: 'N',
						email: emailNorm,
						telefone: placeholderTelefone,
						usuario_id: user._id
					});
					linkedFuncionarioId = funcionarioNovo._id;
					if (!isExistingUser) {
						user.funcionario_id = funcionarioNovo._id;
						if (!user.unidade_id) user.unidade_id = unidade_id;
						await saveUserDoc(user);
					}
					console.log('[criarUsuario] Funcionário placeholder criado e vinculado', { funcionario_id: funcionarioNovo._id.toString(), user_id: user._id.toString() });
				}
			} catch (errFuncionario) {
				// Tratamento amigável: se erro de duplicidade (11000), tenta localizar e vincular
				// apenas por CPF + unidade para evitar associação cross-tenant por e-mail.
				const msg = String(errFuncionario && (errFuncionario.message || errFuncionario))
				const code = (errFuncionario && (errFuncionario.code || errFuncionario?.original?.code)) || null;
				const isDup = code === 11000 || /duplicate key/i.test(msg);
				if (isDup) {
					try {
						const existente = cleanCpf
							? await findCriarUsuarioFuncionarioByCpfUnidade(cleanCpf, unidade_id)
							: null;
						if (existente) {
							linkedFuncionarioId = existente._id;
							if (!isExistingUser) {
								user.funcionario_id = existente._id;
								if (!user.unidade_id) user.unidade_id = existente.unidade_id || unidade_id;
								await saveUserDoc(user);
							}
							try { await setCriarUsuarioFuncionarioUsuarioIdById(existente._id, user._id); } catch(_up2) {}
							console.warn('[criarUsuario] Conflito ao criar funcionário; vinculado a existente', { funcionario_id: existente._id.toString() });
						}
					} catch(_e) { /* ignora fallback de vinculação */ }
					// Mesmo em duplicidade, não falhar a criação do usuário
				} else {
					console.error('[criarUsuario] Falha ao criar funcionário automático:', errFuncionario);
					return serverError(res, 'Falha ao criar funcionário automático: ' + (errFuncionario.message || 'erro'));
				}
			}
		}

		const membershipPayload = buildUserMembershipPayload({
			userId: user._id,
			role: requestedUserRole,
			unidadeId: unidade_id,
			funcionarioId: linkedFuncionarioId,
		});
		if (membershipPayload) {
			try {
				await createUserMembership(membershipPayload);
			} catch (membershipErr) {
				if (isDuplicateKeyError(membershipErr)) {
					return badRequest(res, 'Usuário já vinculado a esta unidade', { code: 'USER_MEMBERSHIP_DUPLICATE' });
				}
				console.error('[criarUsuario] falha ao criar membership:', membershipErr);
				return serverError(res, 'Falha ao criar vínculo do usuário com a unidade');
			}
		}
		// Retorna também senha temporária apenas em ambiente não-produção para permitir exibição imediata
		const payload = {
			id: user._id,
			funcionario_id: linkedFuncionarioId || user.funcionario_id || funcionarioNovo?._id || null,
			outcome: isExistingUser ? 'linked' : 'created',
		};
		if (user._temp_password_plain && process.env.NODE_ENV !== 'production') {
			payload.tempPassword = user._temp_password_plain;
		}
		return created(res, user._id, { data: payload });
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

		const user = await findUserByEmail(email);
		if (!user) {
			return ok(res, {
				email,
				exists: false,
				user: null,
				membershipsCount: 0,
				membershipsSummary: [],
				linkedUnidadeIds: [],
				blockedUnidadeIds: [],
			});
		}

		const normalizedUserId = normalizeEntityId(user._id);
		const memberships = await findUserMembershipsByUserIdsLean([normalizedUserId]);
		const unidadeIds = [...new Set((Array.isArray(memberships) ? memberships : []).map((membership) => normalizeEntityId(membership?.unidade_id)).filter(Boolean))];
		const unidades = unidadeIds.length > 0
			? await findUnidadesByIdsNomeCodigoLean(unidadeIds)
			: [];
		const unidadesById = new Map(
			(Array.isArray(unidades) ? unidades : []).map((unidade) => [normalizeEntityId(unidade?._id), unidade])
		);
		const membershipsSummary = (Array.isArray(memberships) ? memberships : []).map((membership) => {
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
		const linkedUnidadeIds = [...new Set(membershipsSummary.map((membership) => membership.unidade_id).filter(Boolean))];

		return ok(res, {
			email,
			exists: true,
			user: {
				id: String(user._id),
				nome: String(user.nome || '').trim() || null,
				cpf: String(user.cpf || '').trim() || null,
				role: String(user.role || '').trim() || null,
				global_role: String(user.global_role || '').trim() || null,
				unidade_id: normalizeEntityId(user.unidade_id) || null,
				funcionario_id: normalizeEntityId(user.funcionario_id) || null,
				ativo: user.ativo !== false,
			},
			membershipsCount: membershipsSummary.length,
			membershipsSummary,
			linkedUnidadeIds,
			blockedUnidadeIds: linkedUnidadeIds,
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

		// Recarregar usuário do banco para garantir populates consistentes
		const objectId = new mongoose.Types.ObjectId(String(sessionIdRaw));
		let targetId = objectId;
		let baseUser = null;
		if (targetId) {
			const user = await findUserByIdForProfile({ unitScope: req.unitScope, userId: targetId });
			baseUser = user;
		}
		// Fallback: se id ausente ou não encontrado, tentar por e-mail
		if (!baseUser) {
			const emailCandidate = (req.user && req.user.email) || (req.session && req.session.user && req.session.user.email) || null;
			if (emailCandidate) {
				baseUser = await findUserByEmailForProfile({ unitScope: req.unitScope, email: emailCandidate.toLowerCase() });
				if (baseUser) { targetId = baseUser._id; }
			}
		}
		if (!baseUser) {
			console.warn('[obterUsuarioAtual] usuário não encontrado', { id: targetId || null, email: (req.user && req.user.email) || null });
			return res.status(404).json({ success:false, error:'Usuário não encontrado', code:'NOT_FOUND' });
		}

		// Extrair dados diretos
		const { _id, email, role, isMaster, foto } = baseUser;
		// Campos diretos podem existir no user ou no funcionario vinculado
		const funcionario = baseUser.funcionario_id && typeof baseUser.funcionario_id === 'object' ? baseUser.funcionario_id : null;
		const unidadeFromUser = baseUser.unidade_id && typeof baseUser.unidade_id === 'object' ? baseUser.unidade_id : null;
		const unidadeFromFuncionario = funcionario?.unidade_id && typeof funcionario.unidade_id === 'object' ? funcionario.unidade_id : null;

		// Resolução de campos (preferência: user > funcionario) para evitar sobrescrever dados específicos de usuário
		const resolvedNome = baseUser.nome || funcionario?.nome || null;
		const resolvedCpf = baseUser.cpf || funcionario?.cpf || null;
		const resolvedTelefone = baseUser.telefone || funcionario?.telefone || null;
		// Unidade: preferência user.unidade_id, fallback funcionario.unidade_id
		const unidadeResolved = unidadeFromUser || unidadeFromFuncionario || null;
		const unidade_id = unidadeResolved?._id || baseUser.unidade_id || funcionario?.unidade_id || null;
		const unidade_nome = unidadeResolved?.nome || null;
		const unidade_codigo = unidadeResolved?.codigo || null;

		const payload = {
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
			telefone: resolvedTelefone
		};

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
		user.failed_login_attempts = 0;
		user.lock_until = null;
		await saveUserDoc(user);
		return res.json({ success:true, unlocked:true, id: user._id });
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
		const agora = new Date();
		const locked = !!(user.lock_until && user.lock_until > agora);
		const secondsRemaining = locked ? Math.max(0, Math.ceil((user.lock_until.getTime() - agora.getTime()) / 1000)) : 0;
		const minutesRemaining = locked ? Math.max(0, Math.ceil(secondsRemaining / 60)) : 0;
		return res.json({
			success: true,
			data: {
				id: user._id,
				email: user.email,
				role: user.role,
				failed_login_attempts: user.failed_login_attempts || 0,
				lock_until: user.lock_until || null,
				locked,
				seconds_remaining: secondsRemaining,
				minutes_remaining: minutesRemaining
			}
		});
	} catch (e) {
		console.error('[statusUsuario] erro:', e);
		return res.status(500).json({ success:false, error:'Falha ao obter status', code:'SERVER_ERROR' });
	}
}
