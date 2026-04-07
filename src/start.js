// Novo entrypoint unificado usando createServer
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const PORTAL_UI_REV = 'pm-msg-ui-2026-01-12-01';
function getAssetVersion() {
  try {
    return process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.VERCEL_DEPLOYMENT_ID
      || process.env.VERCEL_BUILD_ID
      || process.env.VERCEL_URL
      || 'dev';
  } catch {
    return 'dev';
  }
}

// Hardening: em ambientes serverless é comum ver rejeições durante cold start (ex.: Mongo indisponível).
// Mantemos logs claros e evitamos término inesperado do processo.
if (!globalThis.__wdgProcessHandlersInstalled) {
  globalThis.__wdgProcessHandlersInstalled = true;
  try {
    process.on('unhandledRejection', (reason) => {
      try {
        const msg = reason && (reason.stack || reason.message || String(reason));
        console.error('[process] Unhandled Rejection:', msg);
      } catch {
        console.error('[process] Unhandled Rejection');
      }
    });
    process.on('uncaughtException', (err) => {
      try {
        console.error('[process] Uncaught Exception:', err?.stack || err?.message || String(err));
      } catch {
        console.error('[process] Uncaught Exception');
      }
    });
  } catch {
    /* noop */
  }
}

// Mantemos duas instâncias em cache:
// - cachedStaticApp: sem conexão com DB, para servir assets rapidamente e evitar 500 em cold start
// - cachedApp: app completo com DB para demais rotas
let cachedApp = null;
let cachedStaticApp = null;

let __createServerFn = null;
let __createServerPromise = null;
async function getCreateServer(){
  if (__createServerFn) return __createServerFn;
  if (!__createServerPromise) {
    __createServerPromise = import('./server/createServer.js')
      .then(m => m.createServer)
      .catch(err => { throw err; });
  }
  __createServerFn = await __createServerPromise;
  return __createServerFn;
}

// Garante um BOOT_ID único e COMPARTILHADO entre as duas instâncias (light e full),
// evitando que o middleware de invalidação compare boots diferentes e force redirect
// para /gestor/login ao alternar entre apps.
if (!process.env.SESSION_BOOT_ID) {
  process.env.SESSION_BOOT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
}

function isEscalasStatic(url = ''){
  try{
    const u = String(url||'');
    return /^\/escalas\/(css|js|img|images|uploads)\//.test(u) || u === '/favicon.ico' || u === '/escalas/favicon.ico';
  }catch{ return false; }
}

function isStaticAssetRequest(url = '') {
  try {
    const u = String(url || '');
    // Extensões típicas de assets
    if (/\.(?:css|js|mjs|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot)(?:$|\?)/i.test(u)) return true;
    // Prefixos comuns (raiz e módulos)
    if (/^\/(?:css|js|img|images|uploads|data)\//i.test(u)) return true;
    if (/^\/(?:gestor|condominios|portal-morador|portal_morador|escalas)\/(?:css|js|img|images|uploads|data)\//i.test(u)) return true;
    return false;
  } catch {
    return false;
  }
}

function getContentTypeByExt(p = '') {
  const lower = String(p || '').toLowerCase();
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (lower.endsWith('.map')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml; charset=utf-8';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.eot')) return 'application/vnd.ms-fontobject';
  return 'application/octet-stream';
}

function safeFsJoin(baseDir, relPath) {
  const safeRel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const full = path.join(baseDir, safeRel);
  const normFull = path.normalize(full);
  const normBase = path.normalize(baseDir);
  if (!normFull.startsWith(normBase)) return null;
  return normFull;
}

async function tryServeStaticFromFs(req, res) {
  try {
    const rawUrl = String(req?.url || req?.originalUrl || '');
    const pathname = rawUrl.split('?')[0].split('#')[0] || '';
    if (!isStaticAssetRequest(pathname) && !isEscalasStatic(pathname)) return false;

    // Mapear prefixos conhecidos para pastas físicas
    const rules = [
      { re: /^\/(?:gestor|condominios|portal-morador|portal_morador|escalas)\/css\/(.+)$/i, base: path.join(ROOT, 'public', 'css') },
      { re: /^\/(?:gestor|condominios|portal-morador|portal_morador|escalas)\/img\/(.+)$/i, base: path.join(ROOT, 'public', 'img') },
      { re: /^\/(?:gestor|condominios|portal-morador|portal_morador|escalas)\/images\/(.+)$/i, base: path.join(ROOT, 'images') },
      { re: /^\/(?:gestor|condominios|portal-morador|portal_morador|escalas)\/data\/(.+)$/i, base: path.join(ROOT, 'public', 'data') },
      // /:seg/js pode apontar tanto para public/gestor/js quanto para public/js (scripts compartilhados)
      { re: /^\/(?:gestor|condominios|portal-morador|portal_morador|escalas)\/js\/(.+)$/i, base: path.join(ROOT, 'public', 'gestor', 'js'), altBase: path.join(ROOT, 'public', 'js') },
      { re: /^\/css\/(.+)$/i, base: path.join(ROOT, 'public', 'css') },
      { re: /^\/img\/(.+)$/i, base: path.join(ROOT, 'public', 'img') },
      { re: /^\/images\/(.+)$/i, base: path.join(ROOT, 'images') },
      { re: /^\/data\/(.+)$/i, base: path.join(ROOT, 'public', 'data') },
      { re: /^\/js\/(.+)$/i, base: path.join(ROOT, 'public', 'js') },
      { re: /^\/uploads\/(.+)$/i, base: path.join(ROOT, 'public', 'uploads'), altBase: path.join(ROOT, 'uploads') },
    ];

    for (const r of rules) {
      const m = pathname.match(r.re);
      if (!m) continue;
      const rel = decodeURIComponent(String(m[1] || '').replace(/\0/g, ''));
      const fsMod = await import('fs');
      const p1 = safeFsJoin(r.base, rel);
      const exists1 = p1 ? await fsMod.promises.stat(p1).then(s => s.isFile()).catch(() => false) : false;
      let target = exists1 ? p1 : null;
      if (!target && r.altBase) {
        const p2 = safeFsJoin(r.altBase, rel);
        const exists2 = p2 ? await fsMod.promises.stat(p2).then(s => s.isFile()).catch(() => false) : false;
        if (exists2) target = p2;
      }
      if (!target) return false;

      const buf = await fsMod.promises.readFile(target);
      res.statusCode = 200;
      res.setHeader('Content-Type', getContentTypeByExt(target));
      res.setHeader('Cache-Control', 'public, max-age=300');
      try { res.setHeader('X-WDG-Served-By', 'start-fs'); } catch {}
      return res.end(buf), true;
    }

    return false;
  } catch {
    return false;
  }
}

// Páginas públicas que podem ser servidas sem DB (light mode)
function isLightPublicPage(req){
  try{
    const method = (req.method||'GET').toUpperCase();
    if (method !== 'GET') return false;
    const u = String(req.url || req.originalUrl || '');
    // Tratar tanto com prefixo /gestor quanto, por compat, raiz
    return (
      /^\/(gestor\/)?login(?:[?#].*)?$/.test(u) ||
      /^\/(gestor\/)?esquecisenha(?:[?#].*)?$/.test(u) ||
      /^\/(gestor\/)?contato(?:[?#].*)?$/.test(u) ||
      // Primeiro acesso deve ser servido em modo leve para evitar 500/loops quando o DB estiver indisponível
      /^\/(gestor\/)?primeiroacesso(?:[?#].*)?$/.test(u) ||
      // Condomínios (compatibilidade: /condominios-login)
      /^\/condominios\/login(?:[?#].*)?$/.test(u) ||
      /^\/condominios-login(?:[?#].*)?$/.test(u) ||
      /^\/condominios\/primeiroacesso(?:[?#].*)?$/.test(u) ||
      /^\/condominios-primeiroacesso(?:[?#].*)?$/.test(u) ||
      /^\/portal-morador\/login(?:[?#].*)?$/.test(u) ||
      /^\/portal-morador\/primeiroacesso(?:[?#].*)?$/.test(u) ||
      // Rotas de reset de senha acessadas via e-mail
      /^\/(gestor\/)?reset-password\/.+/.test(u)
    );
  }catch{ return false; }
}

// Para Vercel
export default async function handler(req, res) {
  // Assets: servir direto do FS antes do boot do app (evita 503 quando Mongo/boot oscila)
  try {
    const served = await tryServeStaticFromFs(req, res);
    if (served) return;
  } catch {
    // segue fluxo normal
  }

  // Favicon deve nunca derrubar o handler (evita 500 em todos os módulos)
  try {
    const url0 = String(req?.url || req?.originalUrl || '');
    if (/^\/favicon\.ico(?:$|[?#])/.test(url0) || /^\/[a-z0-9_-]+\/favicon\.ico(?:$|[?#])/i.test(url0)) {
      const ico = path.join(ROOT, 'public', 'favicon.ico');
      const png = path.join(ROOT, 'images', 'logoWDGestor.png');
      let target = null;
      let contentType = 'image/x-icon';
      try {
        if (ico && await (await import('fs')).promises.stat(ico).then(s => s.isFile()).catch(() => false)) {
          target = ico;
          contentType = 'image/x-icon';
        } else if (png && await (await import('fs')).promises.stat(png).then(s => s.isFile()).catch(() => false)) {
          target = png;
          contentType = 'image/png';
        }
      } catch { /* noop */ }
      if (target) {
        try {
          const fsMod = await import('fs');
          const buf = await fsMod.promises.readFile(target);
          res.statusCode = 200;
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          try { res.setHeader('X-WDG-Favicon', 'direct'); } catch {}
          return res.end(buf);
        } catch {
          res.statusCode = 204;
          return res.end();
        }
      }
      res.statusCode = 204;
      return res.end();
    }
  } catch {
    // não bloqueia
  }
  
  const urlForStatic = String(req.url || req.originalUrl || '');
  const wantsStatic = isEscalasStatic(urlForStatic) || isStaticAssetRequest(urlForStatic);
  const wantsLight = !wantsStatic && isLightPublicPage(req);
  if (wantsStatic || wantsLight){
    if (!cachedStaticApp){
      try {
        const createServer = await getCreateServer();
        const { app } = await createServer({ skipDb: true });
        cachedStaticApp = app;
      } catch (e) {
        console.error('[start] createServer(skipDb) falhou:', e?.stack || e?.message || String(e));
        res.statusCode = 503;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        try { res.setHeader('X-WDG-Boot', 'skipdb-error'); } catch {}
        return res.end('Serviço temporariamente indisponível.');
      }
    }
    return cachedStaticApp(req, res);
  }
  if (!cachedApp) {
    try {
      const createServer = await getCreateServer();
      const { app } = await createServer();
      cachedApp = app;
    } catch (e) {
      console.error('[start] createServer(full) falhou:', e?.stack || e?.message || String(e));
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      try { res.setHeader('X-WDG-Boot', 'full-error'); } catch {}
      return res.end('Serviço temporariamente indisponível.');
    }
  }
  return cachedApp(req, res);
}

// Para local
async function main(){
  try {
    const createServer = await getCreateServer();
    const { app, config } = await createServer();
    const port = process.env.PORT || config.port || 3001;
    if (process.env.VERCEL !== '1') {
      app.listen(port, () => console.log(`[start] Servidor ouvindo na porta ${port}`));
    }
  } catch (e) {
    console.error('[start] Falha ao iniciar servidor:', e);
    if (process.env.VERCEL !== '1') {
      process.exit(1);
    }
  }
}

if (process.env.VERCEL !== '1') {
  main();
}
