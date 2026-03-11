// Migracao: criar estrutura aditiva de user memberships para autenticacao contextual por unidade.
// Fase 1: apenas cria colecao e indices, sem backfill e sem alterar fluxos legados.

import 'dotenv/config';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COLLECTION = 'user_memberships';

const TARGET_INDEXES = [
	{
		name: 'uk_user_membership_user_unidade',
		key: { user_id: 1, unidade_id: 1 },
		options: { unique: true, name: 'uk_user_membership_user_unidade' },
	},
	{
		name: 'idx_user_membership_user_status',
		key: { user_id: 1, status: 1 },
		options: { name: 'idx_user_membership_user_status' },
	},
	{
		name: 'idx_user_membership_unidade_status_papel',
		key: { unidade_id: 1, status: 1, papel_contextual: 1 },
		options: { name: 'idx_user_membership_unidade_status_papel' },
	},
	{
		name: 'uk_user_membership_unidade_funcionario',
		key: { unidade_id: 1, funcionario_id: 1 },
		options: {
			unique: true,
			name: 'uk_user_membership_unidade_funcionario',
			partialFilterExpression: { funcionario_id: { $type: 'objectId' } },
		},
	},
];

function sameKey(left, right) {
	const leftEntries = Object.entries(left || {});
	const rightEntries = Object.entries(right || {});
	if (leftEntries.length !== rightEntries.length) return false;

	return leftEntries.every(([key, value], index) => {
		const rightEntry = rightEntries[index];
		return rightEntry && rightEntry[0] === key && rightEntry[1] === value;
	});
}

function normalizePartial(partial) {
	if (!partial || typeof partial !== 'object') return null;
	return JSON.stringify(partial);
}

function samePartialFilter(left, right) {
	return normalizePartial(left) === normalizePartial(right);
}

function sameIndexShape(existing, target) {
	if (!sameKey(existing?.key, target?.key)) return false;
	if (!!existing?.unique !== !!target?.options?.unique) return false;
	if (!samePartialFilter(existing?.partialFilterExpression, target?.options?.partialFilterExpression)) return false;
	return true;
}

async function ensureCollection(db, { dryRun = false } = {}) {
	const existingCollections = await db.listCollections({ name: COLLECTION }, { nameOnly: true }).toArray();
	const alreadyExists = existingCollections.some((entry) => entry?.name === COLLECTION);

	if (alreadyExists) {
		console.log(`Colecao ja existe: ${COLLECTION}`);
		return { existed: true };
	}

	if (dryRun) {
		console.log(`[dry-run] Criaria a colecao ${COLLECTION}`);
		return { existed: false };
	}

	await db.createCollection(COLLECTION);
	console.log(`Colecao criada: ${COLLECTION}`);
	return { existed: true };
}

async function ensureIndexes(collection, { dryRun = false, collectionExists = true } = {}) {
	const indexes = collectionExists ? await collection.indexes() : [];

	console.log(`Indices atuais em ${COLLECTION}:`);
	if (!indexes.length) {
		console.log(' - nenhum indice encontrado');
	} else {
		indexes.forEach((index) => {
			console.log(' -', index.name, JSON.stringify(index.key), index.unique ? '[UNIQUE]' : '', index.partialFilterExpression ? '[PARTIAL]' : '');
		});
	}

	for (const target of TARGET_INDEXES) {
		const existingByName = indexes.find((index) => index.name === target.name);
		if (existingByName && !sameIndexShape(existingByName, target)) {
			throw new Error(
				`Ja existe um indice com nome ${COLLECTION}.${target.name}, mas com shape incompatível: ${JSON.stringify(existingByName)}`
			);
		}

		const existingCompatible = indexes.find((index) => sameIndexShape(index, target));
		if (existingCompatible) {
			console.log(`Indice ja existe: ${COLLECTION}.${existingCompatible.name}`);
			continue;
		}

		if (dryRun) {
			console.log(`[dry-run] Criaria indice ${COLLECTION}.${target.name} ${JSON.stringify(target.key)}`);
			continue;
		}

		await collection.createIndex(target.key, target.options);
		console.log(`Indice criado: ${COLLECTION}.${target.name}`);
	}

	console.log('Nenhum dado legado foi alterado. Nenhum backfill foi executado.');
}

export async function criarUserMembershipsFase1({ dryRun = false } = {}) {
	console.log('Iniciando migracao aditiva de user memberships (fase 1)...');
	if (dryRun) console.log('Modo DRY-RUN ativo: nenhuma alteracao sera persistida.');

	const db = mongoose.connection.db;
	if (!db) {
		throw new Error('Conexao com MongoDB nao esta pronta.');
	}

	const collectionState = await ensureCollection(db, { dryRun });
	const collection = db.collection(COLLECTION);
	await ensureIndexes(collection, { dryRun, collectionExists: collectionState.existed });

	console.log('Migracao concluida. Estrutura aditiva pronta para fases futuras de login contextual.');
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
	const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wdgestor';
	const dryRun = process.argv.slice(2).includes('--dry-run') || process.argv.slice(2).includes('-n');

	(async () => {
		try {
			await mongoose.connect(mongoURI);
			await criarUserMembershipsFase1({ dryRun });
			await mongoose.disconnect();
			console.log('Finalizado');
			process.exit(0);
		} catch (error) {
			console.error('Erro na migracao aditiva de user memberships:', error);
			try { await mongoose.disconnect(); } catch {}
			process.exit(1);
		}
	})();
}

export default criarUserMembershipsFase1;
