// Placeholder de reexport: apontar para impl global se existir em outro local
// Caso a implementação real esteja em outro diretório central futuro, ajustar aqui.
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
} from '#core/middlewares/rateLimit.js';
