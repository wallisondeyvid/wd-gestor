// Migracao: backfill seguro e idempotente de user memberships a partir do legado.
// Fase 2: popula user_memberships e global_role, sem alterar login, auth runtime ou front.

import 'dotenv/config';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import User from '#models/user.js';
import Unidade from '#models/unidade.js';
import Funcionario from '#models/Funcionario.js';
import UserMembership from '#models/userMembership.js';
import { criarUserMembershipsFase1 } from './2026-03-11_criar-user-memberships-fase1.js';

export const BACKFILL_ORIGIN = 'legacy-auth-context-phase2';

const CONTEXTUAL_ROLE_BY_LEGACY_ROLE = Object.freeze({
	diretor: 'gestor',
	user: 'user',
});

const GLOBAL_ROLE_SET = new Set(['master', 'admin']);
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_SAMPLE_LIMIT = 50;
const MEMBERSHIP_COLLECTION = 'user_memberships';

function parseArgs(argv) {
	const args = new Set();
	const kv = new Map();
	for (const arg of argv) {
		if (arg.startsWith('--')) {
			const eq = arg.indexOf('=');
			if (eq > -1) kv.set(arg.slice(2, eq), arg.slice(eq + 1));
			else args.add(arg);
			continue;
		}
		if (arg.startsWith('-')) args.add(arg);
	}
	return { args, kv };
}

export function normalizeRole(value) {
	return String(value || '').trim().toLowerCase();
}

export function normalizeObjectId(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function isValidObjectIdString(value) {
	const normalized = normalizeObjectId(value);
	return !!normalized && mongoose.isValidObjectId(normalized);
}

export function resolveDesiredGlobalRole(user) {
	const role = normalizeRole(user?.role);
	return GLOBAL_ROLE_SET.has(role) ? role : null;
}

export function resolveDesiredContextualRole(user) {
	const role = normalizeRole(user?.role);
	return CONTEXTUAL_ROLE_BY_LEGACY_ROLE[role] || null;
}

function normalizeStatus(value) {
	return normalizeRole(value) === 'inactive' ? 'inactive' : 'active';
}

function membershipKey(userId, unidadeId) {
	return `${normalizeObjectId(userId)}::${normalizeObjectId(unidadeId)}`;
}

function unitFuncionarioKey(unidadeId, funcionarioId) {
	return `${normalizeObjectId(unidadeId)}::${normalizeObjectId(funcionarioId)}`;
}

function buildUserRef(user) {
	return {
		userId: normalizeObjectId(user?._id),
		email: String(user?.email || '').trim().toLowerCase(),
		role: normalizeRole(user?.role),
	};
}

function chunkArray(items, size = DEFAULT_BATCH_SIZE) {
	const output = [];
	for (let index = 0; index < items.length; index += size) {
		output.push(items.slice(index, index + size));
	}
	return output;
}

async function hasCollection(db, collectionName) {
	const collections = await db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
	return collections.some((entry) => entry?.name === collectionName);
}

async function loadMapByIds(Model, ids, select) {
	const normalizedIds = Array.from(new Set(ids.map((id) => normalizeObjectId(id)).filter(Boolean)));
	const map = new Map();
	for (const batch of chunkArray(normalizedIds)) {
		const docs = await Model.find({ _id: { $in: batch } }).select(select).lean();
		for (const doc of docs || []) {
			map.set(normalizeObjectId(doc?._id), doc);
		}
	}
	return map;
}

async function loadExistingMembershipMaps(userIds, { collectionExists }) {
	const byUserUnit = new Map();
	const byUnitFuncionario = new Map();

	if (!collectionExists) {
		return { byUserUnit, byUnitFuncionario };
	}

	const normalizedUserIds = Array.from(new Set(userIds.map((id) => normalizeObjectId(id)).filter(Boolean)));
	for (const batch of chunkArray(normalizedUserIds)) {
		const docs = await UserMembership.find({ user_id: { $in: batch } })
			.select('_id user_id unidade_id papel_contextual status funcionario_id origem')
			.lean();

		for (const doc of docs || []) {
			const userId = normalizeObjectId(doc?.user_id);
			const unidadeId = normalizeObjectId(doc?.unidade_id);
			if (userId && unidadeId) {
				byUserUnit.set(membershipKey(userId, unidadeId), doc);
			}

			const funcionarioId = normalizeObjectId(doc?.funcionario_id);
			if (unidadeId && funcionarioId) {
				byUnitFuncionario.set(unitFuncionarioKey(unidadeId, funcionarioId), doc);
			}
		}
	}

	return { byUserUnit, byUnitFuncionario };
}

function buildDuplicateLegacyFuncKeySet(users) {
	const ownersByKey = new Map();
	for (const user of users || []) {
		const contextualRole = resolveDesiredContextualRole(user);
		if (!contextualRole) continue;

		const unidadeId = normalizeObjectId(user?.unidade_id);
		const funcionarioId = normalizeObjectId(user?.funcionario_id);
		if (!unidadeId || !funcionarioId) continue;

		const key = unitFuncionarioKey(unidadeId, funcionarioId);
		if (!ownersByKey.has(key)) ownersByKey.set(key, new Set());
		ownersByKey.get(key).add(normalizeObjectId(user?._id));
	}

	const duplicatedKeys = new Set();
	for (const [key, owners] of ownersByKey.entries()) {
		if (owners.size > 1) duplicatedKeys.add(key);
	}
	return duplicatedKeys;
}

export function planLegacyUserBackfill({
	user,
	unitDoc = null,
	funcionarioDoc = null,
	existingMembership = null,
	occupyingMembershipByFunc = null,
	legacyFuncDuplicated = false,
	origin = BACKFILL_ORIGIN,
} = {}) {
	const plan = {
		desiredGlobalRole: resolveDesiredGlobalRole(user),
		desiredMembership: null,
		globalRoleAction: 'none',
		membershipAction: 'none',
		membershipUpdate: null,
		anomalies: [],
		flags: {
			withoutUnitContextual: false,
			withoutRoleContextual: false,
		},
	};

	const userId = normalizeObjectId(user?._id);
	const currentGlobalRole = normalizeRole(user?.global_role);
	const desiredContextualRole = resolveDesiredContextualRole(user);

	if (plan.desiredGlobalRole) {
		plan.flags.withoutRoleContextual = true;
		if (!currentGlobalRole) {
			plan.globalRoleAction = 'set';
		} else if (currentGlobalRole === plan.desiredGlobalRole) {
			plan.globalRoleAction = 'already-set';
		} else {
			plan.anomalies.push({
				code: 'GLOBAL_ROLE_CONFLICT',
				detail: {
					currentGlobalRole,
					desiredGlobalRole: plan.desiredGlobalRole,
				},
			});
		}
		return plan;
	}

	if (!desiredContextualRole) {
		plan.flags.withoutRoleContextual = true;
		if (normalizeRole(user?.role)) {
			plan.anomalies.push({
				code: 'UNSUPPORTED_ROLE',
				detail: { role: normalizeRole(user?.role) },
			});
		}
		return plan;
	}

	if (currentGlobalRole) {
		plan.anomalies.push({
			code: 'UNEXPECTED_GLOBAL_ROLE_FOR_CONTEXTUAL_USER',
			detail: { currentGlobalRole },
		});
	}

	const unidadeId = normalizeObjectId(user?.unidade_id);
	if (!unidadeId) {
		plan.flags.withoutUnitContextual = true;
		plan.anomalies.push({ code: 'CONTEXTUAL_ROLE_WITHOUT_UNIDADE_ID', detail: {} });
		return plan;
	}

	if (!isValidObjectIdString(unidadeId)) {
		plan.flags.withoutUnitContextual = true;
		plan.anomalies.push({ code: 'CONTEXTUAL_ROLE_UNIDADE_ID_INVALID', detail: { unidadeId } });
		return plan;
	}

	if (!unitDoc) {
		plan.flags.withoutUnitContextual = true;
		plan.anomalies.push({ code: 'CONTEXTUAL_ROLE_UNIDADE_NOT_FOUND', detail: { unidadeId } });
		return plan;
	}

	const funcionarioId = normalizeObjectId(user?.funcionario_id);
	let normalizedFuncionarioId = '';

	if (funcionarioId) {
		if (!isValidObjectIdString(funcionarioId)) {
			plan.anomalies.push({ code: 'FUNCIONARIO_ID_INVALID', detail: { funcionarioId } });
			return plan;
		}

		if (!funcionarioDoc) {
			plan.anomalies.push({ code: 'FUNCIONARIO_NOT_FOUND', detail: { funcionarioId } });
			return plan;
		}

		const funcionarioUnidadeId = normalizeObjectId(funcionarioDoc?.unidade_id);
		if (!funcionarioUnidadeId) {
			plan.anomalies.push({ code: 'FUNCIONARIO_WITHOUT_UNIDADE_ID', detail: { funcionarioId } });
			return plan;
		}

		if (funcionarioUnidadeId !== unidadeId) {
			plan.anomalies.push({
				code: 'FUNCIONARIO_UNIDADE_MISMATCH',
				detail: { funcionarioId, funcionarioUnidadeId, userUnidadeId: unidadeId },
			});
			return plan;
		}

		const funcionarioUsuarioId = normalizeObjectId(funcionarioDoc?.usuario_id);
		if (funcionarioUsuarioId && funcionarioUsuarioId !== userId) {
			plan.anomalies.push({
				code: 'FUNCIONARIO_LINKED_TO_OTHER_USER',
				detail: { funcionarioId, funcionarioUsuarioId },
			});
			return plan;
		}

		if (legacyFuncDuplicated) {
			plan.anomalies.push({
				code: 'LEGACY_FUNCIONARIO_DUPLICATED_ACROSS_USERS',
				detail: { unidadeId, funcionarioId },
			});
			return plan;
		}

		const occupyingUserId = normalizeObjectId(occupyingMembershipByFunc?.user_id);
		if (occupyingUserId && occupyingUserId !== userId) {
			plan.anomalies.push({
				code: 'MEMBERSHIP_FUNCIONARIO_OCCUPIED',
				detail: {
					funcionarioId,
					occupyingUserId,
					membershipId: normalizeObjectId(occupyingMembershipByFunc?._id),
				},
			});
			return plan;
		}

		normalizedFuncionarioId = funcionarioId;
	}

	plan.desiredMembership = {
		user_id: userId,
		unidade_id: unidadeId,
		papel_contextual: desiredContextualRole,
		status: user?.ativo === false ? 'inactive' : 'active',
		funcionario_id: normalizedFuncionarioId || null,
		origem: origin,
	};

	if (!existingMembership) {
		plan.membershipAction = 'create';
		return plan;
	}

	const existingRole = normalizeRole(existingMembership?.papel_contextual);
	if (existingRole !== desiredContextualRole) {
		plan.anomalies.push({
			code: 'MEMBERSHIP_ROLE_CONFLICT',
			detail: { currentRole: existingRole, desiredRole: desiredContextualRole },
		});
		return plan;
	}

	const existingFuncionarioId = normalizeObjectId(existingMembership?.funcionario_id);
	if (existingFuncionarioId !== normalizedFuncionarioId) {
		plan.anomalies.push({
			code: 'MEMBERSHIP_FUNCIONARIO_CONFLICT',
			detail: {
				currentFuncionarioId: existingFuncionarioId || null,
				desiredFuncionarioId: normalizedFuncionarioId || null,
			},
		});
		return plan;
	}

	const membershipUpdate = {};
	if (normalizeStatus(existingMembership?.status) !== plan.desiredMembership.status) {
		membershipUpdate.status = plan.desiredMembership.status;
	}

	if (!String(existingMembership?.origem || '').trim()) {
		membershipUpdate.origem = origin;
	}

	if (Object.keys(membershipUpdate).length > 0) {
		plan.membershipAction = 'update';
		plan.membershipUpdate = membershipUpdate;
		return plan;
	}

	plan.membershipAction = 'already-existing';
	return plan;
}

function createSummary({ dryRun, limit = null, email = null, userId = null } = {}) {
	return {
		dryRun,
		limit: limit ?? null,
		email: email || null,
		userId: userId || null,
		usersRead: 0,
		globalRolesSet: 0,
		globalRolesAlreadyAligned: 0,
		membershipsCreated: 0,
		membershipsUpdated: 0,
		membershipsAlreadyExisting: 0,
		usersWithAnomaly: 0,
		usersWithoutUnitContextual: 0,
		usersWithoutRoleContextual: 0,
		anomaliesByCode: {},
		anomalySamples: [],
	};
}

function pushAnomalies(summary, user, anomalies, { usersWithAnomalySet, sampleLimit }) {
	if (!anomalies?.length) return;

	const ref = buildUserRef(user);
	usersWithAnomalySet.add(ref.userId || ref.email || JSON.stringify(ref));

	for (const anomaly of anomalies) {
		summary.anomaliesByCode[anomaly.code] = (summary.anomaliesByCode[anomaly.code] || 0) + 1;
		if (summary.anomalySamples.length < sampleLimit) {
			summary.anomalySamples.push({
				...ref,
				code: anomaly.code,
				detail: anomaly.detail || {},
			});
		}
	}
}

async function loadUsers({ limit = null, email = null, userId = null } = {}) {
	const filter = {};
	if (email) filter.email = String(email).trim().toLowerCase();
	if (userId) filter._id = new mongoose.Types.ObjectId(String(userId));

	let query = User.find(filter)
		.select('_id email role global_role unidade_id funcionario_id ativo')
		.sort({ _id: 1 })
		.lean();

	if (Number.isInteger(limit) && limit > 0) {
		query = query.limit(limit);
	}

	return query;
}

async function updateUserGlobalRole(userId, desiredGlobalRole) {
	return User.updateOne(
		{
			_id: userId,
			$or: [
				{ global_role: { $exists: false } },
				{ global_role: null },
				{ global_role: '' },
			],
		},
		{ $set: { global_role: desiredGlobalRole } }
	);
}

async function createMembership(desiredMembership) {
	return UserMembership.create(desiredMembership);
}

async function updateMembership(membershipId, membershipUpdate) {
	return UserMembership.updateOne({ _id: membershipId }, { $set: membershipUpdate });
}

function printSummary(summary) {
	console.log('Resumo do backfill:');
	console.log(` - users lidos: ${summary.usersRead}`);
	console.log(` - memberships criados: ${summary.membershipsCreated}`);
	console.log(` - memberships atualizados: ${summary.membershipsUpdated}`);
	console.log(` - memberships ja existentes: ${summary.membershipsAlreadyExisting}`);
	console.log(` - users com anomalia: ${summary.usersWithAnomaly}`);
	console.log(` - users sem unidade contextual: ${summary.usersWithoutUnitContextual}`);
	console.log(` - users sem role contextual aproveitavel: ${summary.usersWithoutRoleContextual}`);
	console.log(` - global_role definidos: ${summary.globalRolesSet}`);
	console.log(` - global_role ja alinhados: ${summary.globalRolesAlreadyAligned}`);

	console.log('Anomalias por codigo:');
	const anomalyEntries = Object.entries(summary.anomaliesByCode).sort((left, right) => left[0].localeCompare(right[0]));
	if (!anomalyEntries.length) {
		console.log(' - nenhuma anomalia detectada');
	} else {
		for (const [code, count] of anomalyEntries) {
			console.log(` - ${code}: ${count}`);
		}
	}

	if (summary.anomalySamples.length) {
		console.log('Amostra de anomalias:');
		for (const sample of summary.anomalySamples) {
			console.log(` - ${sample.code} user=${sample.userId || 'n/a'} email=${sample.email || 'n/a'} role=${sample.role || 'n/a'} detail=${JSON.stringify(sample.detail)}`);
		}
	}

	console.log('Resumo JSON:');
	console.log(JSON.stringify(summary, null, 2));
}

export async function backfillUserMembershipsFase2({ dryRun = false, limit = null, email = null, userId = null, sampleLimit = DEFAULT_SAMPLE_LIMIT } = {}) {
	console.log('Iniciando backfill de user memberships (fase 2)...');
	if (dryRun) console.log('Modo DRY-RUN ativo: nenhuma alteracao sera persistida.');
	if (limit) console.log(`Limitando processamento a ${limit} user(s).`);
	if (email) console.log(`Filtrando por email: ${String(email).trim().toLowerCase()}`);
	if (userId) console.log(`Filtrando por user_id: ${String(userId).trim()}`);

	await criarUserMembershipsFase1({ dryRun });

	const db = mongoose.connection.db;
	if (!db) throw new Error('Conexao com MongoDB nao esta pronta.');

	const summary = createSummary({ dryRun, limit, email, userId });
	const usersWithAnomalySet = new Set();

	const users = await loadUsers({ limit, email, userId });
	summary.usersRead = users.length;

	const contextualUsers = users.filter((user) => !!resolveDesiredContextualRole(user));
	const unidadeIds = contextualUsers
		.map((user) => normalizeObjectId(user?.unidade_id))
		.filter((value) => isValidObjectIdString(value));
	const funcionarioIds = contextualUsers
		.map((user) => normalizeObjectId(user?.funcionario_id))
		.filter((value) => isValidObjectIdString(value));
	const contextualUserIds = contextualUsers.map((user) => normalizeObjectId(user?._id)).filter(Boolean);

	const unidadeMap = await loadMapByIds(Unidade, unidadeIds, '_id');
	const funcionarioMap = await loadMapByIds(Funcionario, funcionarioIds, '_id unidade_id usuario_id');
	const collectionExists = await hasCollection(db, MEMBERSHIP_COLLECTION);
	const membershipMaps = await loadExistingMembershipMaps(contextualUserIds, { collectionExists });
	const duplicatedLegacyFuncKeys = buildDuplicateLegacyFuncKeySet(contextualUsers);

	for (const user of users) {
		const unidadeId = normalizeObjectId(user?.unidade_id);
		const funcionarioId = normalizeObjectId(user?.funcionario_id);
		const unitDoc = unidadeMap.get(unidadeId) || null;
		const funcionarioDoc = funcionarioMap.get(funcionarioId) || null;
		const existingMembership = membershipMaps.byUserUnit.get(membershipKey(user?._id, unidadeId)) || null;
		const occupyingMembershipByFunc = funcionarioId
			? membershipMaps.byUnitFuncionario.get(unitFuncionarioKey(unidadeId, funcionarioId)) || null
			: null;
		const legacyFuncDuplicated = funcionarioId ? duplicatedLegacyFuncKeys.has(unitFuncionarioKey(unidadeId, funcionarioId)) : false;

		const plan = planLegacyUserBackfill({
			user,
			unitDoc,
			funcionarioDoc,
			existingMembership,
			occupyingMembershipByFunc,
			legacyFuncDuplicated,
			origin: BACKFILL_ORIGIN,
		});

		if (plan.flags.withoutUnitContextual) summary.usersWithoutUnitContextual += 1;
		if (plan.flags.withoutRoleContextual) summary.usersWithoutRoleContextual += 1;

		pushAnomalies(summary, user, plan.anomalies, { usersWithAnomalySet, sampleLimit });

		if (plan.globalRoleAction === 'already-set') {
			summary.globalRolesAlreadyAligned += 1;
		} else if (plan.globalRoleAction === 'set') {
			if (!dryRun) {
				const result = await updateUserGlobalRole(user._id, plan.desiredGlobalRole);
				if (result.modifiedCount === 0) {
					pushAnomalies(summary, user, [{ code: 'GLOBAL_ROLE_WRITE_SKIPPED', detail: { desiredGlobalRole: plan.desiredGlobalRole } }], { usersWithAnomalySet, sampleLimit });
				} else {
					summary.globalRolesSet += 1;
				}
			} else {
				summary.globalRolesSet += 1;
			}
		}

		if (plan.membershipAction === 'create' && plan.desiredMembership) {
			if (!dryRun) {
				try {
					const created = await createMembership(plan.desiredMembership);
					summary.membershipsCreated += 1;
					membershipMaps.byUserUnit.set(membershipKey(created.user_id, created.unidade_id), created.toObject ? created.toObject() : created);
					if (created.funcionario_id) {
						membershipMaps.byUnitFuncionario.set(unitFuncionarioKey(created.unidade_id, created.funcionario_id), created.toObject ? created.toObject() : created);
					}
				} catch (error) {
					pushAnomalies(summary, user, [{ code: 'MEMBERSHIP_CREATE_FAILED', detail: { message: String(error?.message || error) } }], { usersWithAnomalySet, sampleLimit });
				}
			} else {
				summary.membershipsCreated += 1;
			}
		}

		if (plan.membershipAction === 'update' && existingMembership && plan.membershipUpdate) {
			if (!dryRun) {
				const result = await updateMembership(existingMembership._id, plan.membershipUpdate);
				if (result.modifiedCount > 0) {
					summary.membershipsUpdated += 1;
				} else {
					pushAnomalies(summary, user, [{ code: 'MEMBERSHIP_UPDATE_SKIPPED', detail: { membershipId: normalizeObjectId(existingMembership._id) } }], { usersWithAnomalySet, sampleLimit });
				}
			} else {
				summary.membershipsUpdated += 1;
			}
		}

		if (plan.membershipAction === 'already-existing') {
			summary.membershipsAlreadyExisting += 1;
		}
	}

	summary.usersWithAnomaly = usersWithAnomalySet.size;
	printSummary(summary);
	console.log('Backfill concluido. Runtime legado permanece inalterado.');
	return summary;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
	const { args, kv } = parseArgs(process.argv.slice(2));
	const dryRun = args.has('--dry-run') || args.has('-n');
	const limitRaw = kv.get('limit') || null;
	const limit = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : null;
	const email = kv.get('email') || null;
	const userId = kv.get('user-id') || kv.get('user') || null;
	const sampleLimitRaw = kv.get('sample-limit') || null;
	const sampleLimit = sampleLimitRaw && /^\d+$/.test(sampleLimitRaw) ? Number(sampleLimitRaw) : DEFAULT_SAMPLE_LIMIT;
	const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wdgestor';

	(async () => {
		try {
			await mongoose.connect(mongoURI);
			await backfillUserMembershipsFase2({ dryRun, limit, email, userId, sampleLimit });
			await mongoose.disconnect();
			console.log('Finalizado');
			process.exit(0);
		} catch (error) {
			console.error('Erro no backfill de user memberships:', error);
			try { await mongoose.disconnect(); } catch {}
			process.exit(1);
		}
	})();
}

export default backfillUserMembershipsFase2;
