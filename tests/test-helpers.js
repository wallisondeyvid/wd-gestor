// test-helpers.js

export function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,        // objetos/JSON
    text: null,        // strings/enviadas via send
    headers: Object.create(null),
    locals: {},

    status(code) { this.statusCode = code; return this; },

    set(field, value) { // Express-style
      if (typeof field === 'string') {
        this.headers[field.toLowerCase()] = String(value);
      } else if (field && typeof field === 'object') {
        for (const [k, v] of Object.entries(field)) {
          this.headers[k.toLowerCase()] = String(v);
        }
      }
      return this;
    },

    get(field) {
      return this.headers[String(field).toLowerCase()];
    },

    setHeader(k, v) { // Node-style alias
      this.headers[String(k).toLowerCase()] = String(v);
      return this;
    },

    getHeader(k) {
      return this.headers[String(k).toLowerCase()];
    },

    json(payload) {
      // imite Express: seta content-type se ainda não houver
      if (!this.get('content-type')) this.set('Content-Type', 'application/json; charset=utf-8');
      this.body = payload;
      this.text = null;
      return this;
    },

    send(data) {
      if (typeof data === 'object' && data !== null && !Buffer.isBuffer(data)) {
        // se mandarem objeto, trate como json
        return this.json(data);
      }
      if (!this.get('content-type')) this.set('Content-Type', 'text/html; charset=utf-8');
      this.text = data == null ? '' : String(data);
      this.body = null;
      return this;
    },

    sendStatus(code) {
      this.status(code);
      // Express manda o texto do status; para testes, vazio já basta
      return this.send('');
    },

    redirect(url, code = 302) {
      this.status(code);
      this.set('Location', url);
      return this.send(`Redirecting to ${url}`);
    },

    end() { return this; },

    // opcional: render "fake" para testes de views
    render(view, ctx, cb) {
      if (typeof ctx === 'function') { cb = ctx; ctx = undefined; }
      const html = `<html data-view="${view}"></html>`;
      if (cb) return cb(null, html);
      this.set('Content-Type', 'text/html; charset=utf-8');
      this.text = html;
      this.body = null;
      this.view = view;
      this.context = ctx ?? this.locals;
      return this;
    }
  };
  return res;
}

export function createMockReq(query = {}, params = {}, body = {}, opts = {}) {
  const {
    headers = {},
    method = 'GET',
    originalUrl = '/',
    path = originalUrl,
    session = null,
    user = null,
  } = opts;

  return {
    query,
    params,
    body,
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    method,
    originalUrl,
    path,
    url: originalUrl,
    session,
    user,
    ip: opts.ip || '127.0.0.1',
    protocol: opts.protocol || 'http',
    hostname: opts.hostname || 'localhost',

    get(name) { return this.headers[String(name).toLowerCase()]; },
  };
}