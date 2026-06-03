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

const gestorLoginRateLimitAppIds = new WeakMap();
let nextGestorLoginRateLimitAppId = 0;

function createNextGestorLoginRateLimitAppId() {
	nextGestorLoginRateLimitAppId += 1;
	return `app-${nextGestorLoginRateLimitAppId}`;
}

function resolveGestorLoginRateLimitOwner(app) {
	let current = app;
	while (current && current.parent) {
		current = current.parent;
	}
	return current || app;
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

function getGestorLoginRateLimitAppId(app) {
	const owner = resolveGestorLoginRateLimitOwner(app);
	if (!owner || (typeof owner !== 'function' && typeof owner !== 'object')) {
		return 'global';
	}

	const existingAppId = gestorLoginRateLimitAppIds.get(owner);
	if (existingAppId) return existingAppId;

	const appId = createNextGestorLoginRateLimitAppId();
	gestorLoginRateLimitAppIds.set(owner, appId);
	return appId;
}

export function resetGestorLoginHttpLimiterNamespace(app) {
	const owner = resolveGestorLoginRateLimitOwner(app);
	if (!owner || (typeof owner !== 'function' && typeof owner !== 'object')) return null;
	const appId = createNextGestorLoginRateLimitAppId();
	gestorLoginRateLimitAppIds.set(owner, appId);
	return appId;
}

function buildGestorLoginRateLimitKey(req) {
	const appId = getGestorLoginRateLimitAppId(req?.app);
	const ip = String(req?.ip || req?.headers?.['x-forwarded-for'] || 'unknown');
	return `${appId}:${ip}`;
}

export function createGestorLoginHttpLimiter(opts = {}) {
	const windowMs = parsePositiveIntEnv(process.env.LOGIN_HTTP_RATE_LIMIT_WINDOW_MS, 600000);
	const max = parsePositiveIntEnv(process.env.LOGIN_HTTP_RATE_LIMIT_MAX, 20);

	return createLoginLimiter({
		windowMs,
		max,
		skipSuccessfulRequests: false,
		keyGenerator: buildGestorLoginRateLimitKey,
		handler(req, res) {
			if (isJsonLoginRequest(req)) {
				return res.status(429).json({
					success: false,
					error: 'TOO_MANY_LOGIN_ATTEMPTS'
				});
			}

			const basePath = req.baseUrl || '';
			return res.redirect(303, `${basePath}/login?erro=muitas_tentativas`);
		},
		...opts
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
