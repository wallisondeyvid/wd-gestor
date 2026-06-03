import {
	loginLimiter,
	resetPasswordLimiter,
	registerLimiter,
	apiLimiter,
	uploadLimiter,
	publicReadLimiter,
	createLoginLimiter,
	createApiLimiter,
	createCompanyLimiter,
	normalizeEmpresa,
	rateLimitHandler
} from '#core/middlewares/rateLimit.js';
import { sanitizeMongoErrorForLog } from '#core/db/connect.js';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

const GESTOR_LOGIN_RATE_LIMIT_COLLECTION = 'loginratelimits';
const GESTOR_LOGIN_RATE_LIMIT_NAMESPACE = 'gestor-login';
const gestorLoginRateLimitIndexCache = new Set();
let nextGestorLoginRateLimitNamespaceId = 0;

function createNextGestorLoginRateLimitNamespaceId() {
	nextGestorLoginRateLimitNamespaceId += 1;
	return `test-${nextGestorLoginRateLimitNamespaceId}`;
}

function parsePositiveIntEnv(value, fallback) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isJsonLoginRequest(req) {
	if (req.is?.('application/json')) return true;
	const accept = String(req.get?.('accept') || '').toLowerCase();
	if (accept.includes('application/json') && !accept.includes('text/html')) return true;
	return false;
}

function shouldAutoCreateGestorLoginRateLimitIndexes() {
	const flag = String(process.env.LOGIN_HTTP_RATE_LIMIT_AUTO_INDEX ?? 'true').trim().toLowerCase();
	return !['0', 'false', 'off', 'no'].includes(flag);
}

export function resetGestorLoginHttpLimiterNamespace(app) {
	if (!app || (typeof app !== 'function' && typeof app !== 'object')) return null;
	const namespace = `${GESTOR_LOGIN_RATE_LIMIT_NAMESPACE}-${createNextGestorLoginRateLimitNamespaceId()}`;
	app.locals = app.locals || {};
	app.locals.gestorLoginHttpLimiterNamespace = namespace;
	return namespace;
}

function getGestorLoginRateLimitIp(req) {
	const forwardedFor = Array.isArray(req?.headers?.['x-forwarded-for'])
		? req.headers['x-forwarded-for'][0]
		: String(req?.headers?.['x-forwarded-for'] || '');
	const rawIp = String(req?.ip || forwardedFor.split(',')[0] || 'unknown').trim();
	return rawIp || 'unknown';
}

function normalizeGestorLoginRateLimitNamespace(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return GESTOR_LOGIN_RATE_LIMIT_NAMESPACE;
	return normalized.replace(/[^a-z0-9:_-]+/g, '-');
}

function buildGestorLoginRateLimitKey(req, namespace) {
	const hash = createHash('sha256');
	hash.write(getGestorLoginRateLimitIp(req));
	hash.end();
	const ipHash = hash.digest('hex');
	return `${normalizeGestorLoginRateLimitNamespace(namespace)}:${ipHash}`;
}

function resolveGestorLoginRateLimitNamespace(req, opts) {
	return normalizeGestorLoginRateLimitNamespace(
		opts.namespace || req?.app?.locals?.gestorLoginHttpLimiterNamespace || GESTOR_LOGIN_RATE_LIMIT_NAMESPACE
	);
}

function resolveGestorLoginRateLimitCollectionName(req, opts) {
	const collectionName = String(
		opts.collectionName || req?.app?.locals?.gestorLoginHttpLimiterCollectionName || GESTOR_LOGIN_RATE_LIMIT_COLLECTION
	).trim();
	return collectionName || GESTOR_LOGIN_RATE_LIMIT_COLLECTION;
}

function buildGestorLoginRateLimitIndexCacheKey(collection) {
	const dbName = String(collection?.dbName || collection?.db?.databaseName || 'db').trim() || 'db';
	const collectionName = String(collection?.collectionName || 'collection').trim() || 'collection';
	return `${dbName}:${collectionName}`;
}

async function ensureGestorLoginRateLimitIndexes(collection, opts = {}) {
	if (!collection) return;
	if (opts.ensureIndexes === false) return;
	if (!shouldAutoCreateGestorLoginRateLimitIndexes()) return;

	const cacheKey = buildGestorLoginRateLimitIndexCacheKey(collection);
	if (gestorLoginRateLimitIndexCache.has(cacheKey)) return;
	gestorLoginRateLimitIndexCache.add(cacheKey);

	try {
		await collection.createIndex({ key: 1 }, {
			name: 'gestor_login_rate_limit_key_unique',
			unique: true
		});
		await collection.createIndex({ expiresAt: 1 }, {
			name: 'gestor_login_rate_limit_expires_at_ttl',
			expireAfterSeconds: 0
		});
	} catch (error) {
		console.warn('[gestor-login-rate-limit] falha ao garantir indices; seguindo sem bloquear login', sanitizeMongoErrorForLog(error));
	}
}

function resolveGestorLoginRateLimitCollection(req, opts = {}) {
	if (typeof opts.collectionResolver === 'function') {
		return opts.collectionResolver(req);
	}

	if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
	return mongoose.connection.db.collection(resolveGestorLoginRateLimitCollectionName(req, opts));
}

function createExpiredWindowExpression(now, resetValue, activeValue) {
	return {
		$cond: [
			{
				$or: [
					{ $eq: [{ $ifNull: ['$expiresAt', null] }, null] },
					{ $lte: ['$expiresAt', now] }
				]
			},
			resetValue,
			activeValue
		]
	};
}

function defaultGestorLoginRateLimitHandler(req, res) {
	if (isJsonLoginRequest(req)) {
		return res.status(429).json({
			success: false,
			error: 'TOO_MANY_LOGIN_ATTEMPTS'
		});
	}

	const basePath = req.baseUrl || '';
	return res.redirect(303, `${basePath}/login?erro=muitas_tentativas`);
}

export function createGestorLoginHttpLimiter(opts = {}) {
	const windowMs = parsePositiveIntEnv(opts.windowMs ?? process.env.LOGIN_HTTP_RATE_LIMIT_WINDOW_MS, 600000);
	const max = parsePositiveIntEnv(opts.max ?? process.env.LOGIN_HTTP_RATE_LIMIT_MAX, 20);
	const handler = typeof opts.handler === 'function' ? opts.handler : defaultGestorLoginRateLimitHandler;

	return async function gestorLoginHttpLimiter(req, res, next) {
		try {
			const collection = resolveGestorLoginRateLimitCollection(req, opts);
			if (!collection) return next();

			await ensureGestorLoginRateLimitIndexes(collection, opts);

			const now = new Date();
			const expiresAt = new Date(now.getTime() + windowMs);
			const key = buildGestorLoginRateLimitKey(req, resolveGestorLoginRateLimitNamespace(req, opts));
			const result = await collection.findOneAndUpdate(
				{ key },
				[
					{
						$set: {
							key,
							windowStart: createExpiredWindowExpression(now, now, { $ifNull: ['$windowStart', now] }),
							count: createExpiredWindowExpression(now, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }),
							expiresAt: createExpiredWindowExpression(now, expiresAt, '$expiresAt'),
							createdAt: { $ifNull: ['$createdAt', now] },
							updatedAt: now
						}
					}
				],
				{
					upsert: true,
					returnDocument: 'after'
				}
			);

			const state = result?.value ?? result;
			const count = Number(state?.count || 0);
			if (count > max) {
				return handler(req, res);
			}

			return next();
		} catch (error) {
			console.warn('[gestor-login-rate-limit] falha no limiter persistente; fail-open', sanitizeMongoErrorForLog(error));
			return next();
		}
	};
}

export {
	loginLimiter,
	resetPasswordLimiter,
	registerLimiter,
	apiLimiter,
	uploadLimiter,
	publicReadLimiter,
	createLoginLimiter,
	createApiLimiter,
	createCompanyLimiter,
	normalizeEmpresa,
	rateLimitHandler
};
