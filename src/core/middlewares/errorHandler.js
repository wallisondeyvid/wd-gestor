// Error handler central unificado (HTML vs JSON)

function wantsJson(req) {
  if (req.xhr) return true;
  const accept = req.headers['accept'] || '';
  if (accept.includes('application/json')) return true;
  const requestedWith = String(req.headers?.['x-requested-with'] || '').toLowerCase();
  if (requestedWith === 'xmlhttprequest' || requestedWith === 'fetch') return true;
  const url = (req.originalUrl || req.url || req.path || '') || '';
  // Suporta apps montados em subpaths (ex.: /portal-morador/api/*, /condominios/api/*)
  if (url.includes('/api/')) return true;
  return false;
}

function isMongoOfflineError(err) {
  try {
    if (!err) return false;

    const seen = new Set();
    const stack = [err];
    while (stack.length) {
      const e = stack.pop();
      if (!e || typeof e !== 'object') continue;
      if (seen.has(e)) continue;
      seen.add(e);

      const name = String(e.name || '');
      const msg = String(e.message || '');
      const code = String(e.code || '');

      if (name === 'MongoServerSelectionError') return true;
      if (/ServerSelectionError/i.test(name)) return true;
      if (/MongoNetworkError|MongoNotConnectedError|MongoTopologyClosedError/i.test(name)) return true;

      if (/ReplicaSetNoPrimary/i.test(msg)) return true;
      if (/server selection timed out/i.test(msg)) return true;
      if (/Topology is closed/i.test(msg)) return true;
      if (/buffering timed out/i.test(msg)) return true;
      if (/client must be connected/i.test(msg)) return true;
      if (/not connected/i.test(msg)) return true;

      if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(msg)) return true;
      if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(code)) return true;

      const reasonType = String(e?.reason?.type || '');
      if (/ReplicaSetNoPrimary/i.test(reasonType)) return true;

      if (e.cause) stack.push(e.cause);
      if (e.reason && typeof e.reason === 'object') stack.push(e.reason);
      if (e.errors && typeof e.errors === 'object') {
        for (const v of Object.values(e.errors)) stack.push(v);
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function notFoundHandler(req, res, next) {
  const isJson = wantsJson(req);
  const status = 404;
  if (!isJson) {
    res.status(status).set('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<html><body><h1>Erro ${status}</h1><pre>Recurso não encontrado</pre></body></html>`);
  }
  return res
    .status(status)
    .set('Content-Type', 'application/json; charset=utf-8')
    .json({ error: true, message: 'Recurso não encontrado' });
}

export function centralErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isDbOffline = isMongoOfflineError(err);
  const status = isDbOffline ? 503 : (err.status || 500);
  const isJson = wantsJson(req);
  if (!isJson) {
    // Renderização simples para views (poderia ser substituída por página ejs)
    res.status(status).set('Content-Type', 'text/html; charset=utf-8');
    const msg = isDbOffline ? 'Banco de dados temporariamente indisponível. Tente novamente em instantes.' : (err.message || 'Erro interno');
    return res.send(`<html><body><h1>Erro ${status}</h1><pre>${msg}</pre></body></html>`);
  }
  const payload = {
    error: true,
    message: isDbOffline ? 'Banco de dados temporariamente indisponível' : (err.message || 'Erro interno')
  };
  if (isDbOffline) payload.code = 'DB_OFFLINE';
  if (err.details) payload.details = err.details;
  if (process.env.NODE_ENV !== 'production' && err.stack) payload.stack = err.stack;
  if (status >= 500) console.error('[centralError]', err);
  res
    .status(status)
    .set('Content-Type', 'application/json; charset=utf-8')
    .json(payload);
}
