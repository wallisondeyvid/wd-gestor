// apiResponse centralizado no core
export function ok(res, data = {}, extra = {}) {
  return res.status(200).json({ success: true, ...extra, data });
}
export function created(res, id, extra = {}) {
  return res.status(201).json({ success: true, created: true, id, ...extra });
}
export function badRequest(res, message = 'Bad request', extra = {}) {
  return res.status(400).json({ success: false, code: 'BAD_REQUEST', message, ...extra });
}
export function notFound(res, message = 'Not found', extra = {}) {
  return res.status(404).json({ success: false, code: 'NOT_FOUND', message, ...extra });
}
export function missingFields(res, campos = []) {
  return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Campos obrigatórios ausentes', campos });
}
export function serverError(res, error, extra = {}) {
  return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno', ...extra });
}
export default { ok, created, badRequest, notFound, missingFields, serverError };