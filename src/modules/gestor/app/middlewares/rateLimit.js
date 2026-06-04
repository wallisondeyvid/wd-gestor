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
const GESTOR_RECOVERY_RATE_LIMIT_COLLECTION = 'recoveryratelimits';
const GESTOR_RECOVERY_RATE_LIMIT_NAMESPACE = 'gestor-recovery';
const gestorLoginRateLimitIndexCache = new Set();
const gestorRecoveryRateLimitIndexCache = new Set();
let nextGestorLoginRateLimitNamespaceId = 0;
let nextGestorRecoveryRateLimitNamespaceId = 0;

const GESTOR_RECOVERY_RATE_LIMIT_MESSAGE = 'Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.';

function createNextGestorLoginRateLimitNamespaceId() {
	nextGestorLoginRateLimitNamespaceId += 1;
	return `test-${nextGestorLoginRateLimitNamespaceId}`;
}

function createNextGestorRecoveryRateLimitNamespaceId() {
	nextGestorRecoveryRateLimitNamespaceId += 1;
	return `test-${nextGestorRecoveryRateLimitNamespaceId}`;
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

export function resetGestorRecoveryHttpLimiterNamespace(app) {
	if (!app || (typeof app !== 'function' && typeof app !== 'object')) return null;
	const namespace = `${GESTOR_RECOVERY_RATE_LIMIT_NAMESPACE}-${createNextGestorRecoveryRateLimitNamespaceId()}`;
	app.locals = app.locals || {};
	app.locals.gestorRecoveryHttpLimiterNamespace = namespace;
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

function hashGestorRateLimitValue(value) {
	const hash = createHash('sha256');
	hash.write(String(value || ''));
	hash.end();
	return hash.digest('hex');
}

function buildGestorLoginRateLimitKey(req, namespace) {
	const ipHash = hashGestorRateLimitValue(getGestorLoginRateLimitIp(req));
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

function isJsonLikeRequest(req) {
	if (req.xhr) return true;
	if (req.is?.('application/json')) return true;
	const requestedWith = String(req.get?.('x-requested-with') || '').toLowerCase();
	if (requestedWith === 'xmlhttprequest') return true;
	const accept = String(req.get?.('accept') || '').toLowerCase();
	return accept.includes('application/json') && !accept.includes('text/html');
}

function normalizeCpfForRateLimit(rawValue) {
	const digits = String(rawValue || '').replace(/\D/g, '');
	return digits.length === 11 ? digits : '';
}

function resolveGestorRecoveryCpfDigits(req) {
	return normalizeCpfForRateLimit(req?.body?.cpf || req?.query?.cpf);
}

function resolveGestorRecoveryRateLimitCollectionName(req, opts) {
	const collectionName = String(
		opts.collectionName || req?.app?.locals?.gestorRecoveryHttpLimiterCollectionName || GESTOR_RECOVERY_RATE_LIMIT_COLLECTION
	).trim();
	return collectionName || GESTOR_RECOVERY_RATE_LIMIT_COLLECTION;
}

function resolveGestorRecoveryRateLimitNamespace(req, opts = {}) {
	const appNamespace = String(req?.app?.locals?.gestorRecoveryHttpLimiterNamespace || '').trim();
	const suffix = String(opts.namespaceSuffix || '').trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-');
	const baseNamespace = normalizeGestorLoginRateLimitNamespace(appNamespace || opts.namespace || GESTOR_RECOVERY_RATE_LIMIT_NAMESPACE);
	if (!suffix) return baseNamespace;
	return `${baseNamespace}:${suffix}`;
}

async function ensureGestorRecoveryRateLimitIndexes(collection, opts = {}) {
	if (!collection) return;
	if (opts.ensureIndexes === false) return;
	if (!shouldAutoCreateGestorLoginRateLimitIndexes()) return;

	const cacheKey = buildGestorLoginRateLimitIndexCacheKey(collection);
	if (gestorRecoveryRateLimitIndexCache.has(cacheKey)) return;
	gestorRecoveryRateLimitIndexCache.add(cacheKey);

	try {
		await collection.createIndex({ key: 1 }, {
			name: 'gestor_recovery_rate_limit_key_unique',
			unique: true
		});
		await collection.createIndex({ expiresAt: 1 }, {
			name: 'gestor_recovery_rate_limit_expires_at_ttl',
			expireAfterSeconds: 0
		});
	} catch (error) {
		console.warn('[gestor-recovery-rate-limit] falha ao garantir indices; seguindo sem bloquear recovery', sanitizeMongoErrorForLog(error));
	}
}

function resolveGestorRecoveryRateLimitCollection(req, opts = {}) {
	if (typeof opts.collectionResolver === 'function') {
		return opts.collectionResolver(req);
	}

	if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
	return mongoose.connection.db.collection(resolveGestorRecoveryRateLimitCollectionName(req, opts));
}

function buildGestorRecoveryIpRateLimitKey(req, namespace) {
	const ipHash = hashGestorRateLimitValue(getGestorLoginRateLimitIp(req));
	return `${namespace}:${ipHash}`;
}

function buildGestorRecoveryCpfRateLimitKey(req, namespace) {
	const cpfDigits = resolveGestorRecoveryCpfDigits(req);
	if (!cpfDigits) return '';
	return `${namespace}:${hashGestorRateLimitValue(cpfDigits)}`;
}

function defaultGestorRecoveryRateLimitHandler(req, res) {
	if (isJsonLikeRequest(req)) {
		return res.status(429).json({
			success: false,
			message: GESTOR_RECOVERY_RATE_LIMIT_MESSAGE,
		});
	}

	return res.status(429).render('esquecisenha', {
		basePath: req.baseUrl || '/gestor',
		solicitacaoRecebida: false,
		mensagemErro: GESTOR_RECOVERY_RATE_LIMIT_MESSAGE,
	});
}

function defaultGestorRecoveryEmailsRateLimitHandler(_req, res) {
	return res.status(429).json({
		success: false,
		message: GESTOR_RECOVERY_RATE_LIMIT_MESSAGE,
	});
}

function defaultGestorResetPasswordRateLimitHandler(req, res) {
	if (isJsonLikeRequest(req)) {
		return res.status(429).json({
			success: false,
			message: GESTOR_RECOVERY_RATE_LIMIT_MESSAGE,
		});
	}

	return res.status(429).render('reset-password-error', {
		title: 'Tente novamente mais tarde',
		message: GESTOR_RECOVERY_RATE_LIMIT_MESSAGE,
		showRetry: true,
		basePath: req.baseUrl || '/gestor',
	});
}

function createGestorRecoveryMongoRateLimiter(opts = {}) {
	const windowMs = parsePositiveIntEnv(opts.windowMs ?? process.env.RECOVERY_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
	const max = parsePositiveIntEnv(opts.max, 10);
	const handler = typeof opts.handler === 'function' ? opts.handler : defaultGestorRecoveryRateLimitHandler;
	const keyBuilder = typeof opts.keyBuilder === 'function' ? opts.keyBuilder : buildGestorRecoveryIpRateLimitKey;
	const logLabel = String(opts.logLabel || 'gestor-recovery-rate-limit');

	return async function gestorRecoveryHttpLimiter(req, res, next) {
		try {
			const collection = resolveGestorRecoveryRateLimitCollection(req, opts);
			if (!collection) return next();

			await ensureGestorRecoveryRateLimitIndexes(collection, opts);

			const namespace = resolveGestorRecoveryRateLimitNamespace(req, opts);
			const key = keyBuilder(req, namespace);
			if (!key) return next();

			const now = new Date();
			const expiresAt = new Date(now.getTime() + windowMs);
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
							updatedAt: now,
						},
					},
				],
				{
					upsert: true,
					returnDocument: 'after',
				}
			);

			const state = result?.value ?? result;
			const count = Number(state?.count || 0);
			if (count > max) {
				return handler(req, res);
			}

			return next();
		} catch (error) {
			console.warn(`[${logLabel}] falha no limiter persistente; fail-open`, sanitizeMongoErrorForLog(error));
			return next();
		}
	};
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

export function createGestorRecoveryRequestIpHttpLimiter(opts = {}) {
	return createGestorRecoveryMongoRateLimiter({
		...opts,
		namespaceSuffix: 'request-ip',
		max: parsePositiveIntEnv(opts.max ?? process.env.RECOVERY_RATE_LIMIT_MAX, 10),
		keyBuilder: buildGestorRecoveryIpRateLimitKey,
		handler: typeof opts.handler === 'function' ? opts.handler : defaultGestorRecoveryRateLimitHandler,
		logLabel: 'gestor-recovery-request-ip-rate-limit',
	});
}

export function createGestorRecoveryRequestCpfHttpLimiter(opts = {}) {
	return createGestorRecoveryMongoRateLimiter({
		...opts,
		namespaceSuffix: 'request-cpf',
		max: parsePositiveIntEnv(opts.max ?? process.env.RECOVERY_CPF_RATE_LIMIT_MAX, 3),
		keyBuilder: buildGestorRecoveryCpfRateLimitKey,
		handler: typeof opts.handler === 'function' ? opts.handler : defaultGestorRecoveryRateLimitHandler,
		logLabel: 'gestor-recovery-request-cpf-rate-limit',
	});
}

export function createGestorRecoveryEmailsIpHttpLimiter(opts = {}) {
	return createGestorRecoveryMongoRateLimiter({
		...opts,
		namespaceSuffix: 'emails-ip',
		max: parsePositiveIntEnv(opts.max ?? process.env.RECOVERY_RATE_LIMIT_MAX, 10),
		keyBuilder: buildGestorRecoveryIpRateLimitKey,
		handler: typeof opts.handler === 'function' ? opts.handler : defaultGestorRecoveryEmailsRateLimitHandler,
		logLabel: 'gestor-recovery-emails-ip-rate-limit',
	});
}

export function createGestorRecoveryEmailsCpfHttpLimiter(opts = {}) {
	return createGestorRecoveryMongoRateLimiter({
		...opts,
		namespaceSuffix: 'emails-cpf',
		max: parsePositiveIntEnv(opts.max ?? process.env.RECOVERY_CPF_RATE_LIMIT_MAX, 3),
		keyBuilder: buildGestorRecoveryCpfRateLimitKey,
		handler: typeof opts.handler === 'function' ? opts.handler : defaultGestorRecoveryEmailsRateLimitHandler,
		logLabel: 'gestor-recovery-emails-cpf-rate-limit',
	});
}

export function createGestorResetPasswordHttpLimiter(opts = {}) {
	return createGestorRecoveryMongoRateLimiter({
		...opts,
		windowMs: opts.windowMs ?? process.env.RECOVERY_RATE_LIMIT_WINDOW_MS,
		namespaceSuffix: 'reset-ip',
		max: parsePositiveIntEnv(opts.max ?? process.env.RESET_PASSWORD_RATE_LIMIT_MAX, 10),
		keyBuilder: buildGestorRecoveryIpRateLimitKey,
		handler: typeof opts.handler === 'function' ? opts.handler : defaultGestorResetPasswordRateLimitHandler,
		logLabel: 'gestor-reset-password-rate-limit',
	});
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
