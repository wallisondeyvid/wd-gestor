// (migrado) apiResponse.js
function normalizeErrorMessage(e){
  if(!e) return 'Erro inesperado';
  if(typeof e === 'string') return e;
  if(e.message) return e.message;
  try { return JSON.stringify(e); } catch { return 'Erro'; }
}
export function ok(res, data, meta){ const body={ success:true, data }; if(meta) body.meta=meta; return res.json(body);} 
export function created(res, id, extra){ return res.status(201).json({ success:true, created:true, id, ...(extra||{}) }); }
export function badRequest(res, message, extras){ return res.status(400).json({ success:false, error: message, code:'BAD_REQUEST', ...(extras||{}) }); }
export function notFound(res, message='Recurso não encontrado'){ return res.status(404).json({ success:false, error: message, code:'NOT_FOUND' }); }
export function serverError(res, err, opts){ const msg=normalizeErrorMessage(err); const body={ success:false, error: msg, code:'SERVER_ERROR' }; if(opts?.stack && err?.stack) body.stack=err.stack; if(opts?.extra) Object.assign(body, opts.extra); return res.status(500).json(body);} 
export function missingFields(res, campos){ return badRequest(res, 'Campos obrigatórios ausentes', { campos }); }
