export class AppError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  const payload = {
    error: true,
    message: err.message || 'Erro interno',
  };
  if (err.details) payload.details = err.details;
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }
  if (status >= 500) console.error('[errorHandler]', err);
  res.status(status).json(payload);
}
