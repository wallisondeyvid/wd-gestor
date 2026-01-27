import rateLimit from 'express-rate-limit';

// Handler padronizado para responder quando o limite é excedido
export function rateLimitHandler (req, res /*, next */) {
  res.status(429).json({
    success: false,
    message: 'Muitas requisições. Tente novamente mais tarde.'
  });
}

// Funções fábrica para criar limitadores com políticas específicas
export function createLoginLimiter (opts = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    ...opts
  });
}

export function createApiLimiter (opts = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    ...opts
  });
}

export function createCompanyLimiter (opts = {}) {
  return rateLimit({
    windowMs: 10 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    ...opts
  });
}

// Normaliza empresa em header/query para chave de rate limit customizado (placeholder)
export function normalizeEmpresa (req) {
  return (
    req.headers['x-empresa-id'] ||
    req.query.empresa ||
    (req.session && req.session.empresaId) ||
    'default'
  );
}

// Instâncias prontas (defaults) – podem ser usadas diretamente
export const loginLimiter = createLoginLimiter();
export const apiLimiter = createApiLimiter();
export const uploadLimiter = createApiLimiter({ max: 500 });
export const publicReadLimiter = createApiLimiter({ max: 1000 });
export const resetPasswordLimiter = createLoginLimiter({ max: 5, windowMs: 60 * 60 * 1000 });
export const registerLimiter = createLoginLimiter({ max: 10, windowMs: 60 * 60 * 1000 });
