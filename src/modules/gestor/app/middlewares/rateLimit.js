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

function isSuccessfulLoginResponse(req, res) {
	const statusCode = Number(res.statusCode || 0);
	if (statusCode >= 200 && statusCode < 300) return true;
	const location = String(res.getHeader?.('location') || '').toLowerCase();
	if (!location) return false;
	if (!location.includes('/login')) return true;
	return location.includes('?step=select');
}

export function createGestorLoginHttpLimiter(opts = {}) {
	const windowMs = parsePositiveIntEnv(process.env.LOGIN_HTTP_RATE_LIMIT_WINDOW_MS, 600000);
	const max = parsePositiveIntEnv(process.env.LOGIN_HTTP_RATE_LIMIT_MAX, 20);

	return createLoginLimiter({
		windowMs,
		max,
		skipSuccessfulRequests: true,
		requestWasSuccessful: isSuccessfulLoginResponse,
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

export const gestorLoginHttpLimiter = createGestorLoginHttpLimiter();

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
