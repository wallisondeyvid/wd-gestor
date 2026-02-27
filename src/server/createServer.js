// Fábrica de servidor que monta módulos dinamicamente
// Captura automaticamente erros de handlers async (Promise rejeitada) e encaminha para o error handler do Express.
import 'express-async-errors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import nodeFetch from 'node-fetch';
import { getPorts } from '#shared/container/ports.js';
import { BankPort } from '#shared/ports/bank.port.js';
import { DocumentosPort } from '#shared/ports/documentos.port.js';
import { loadConfig } from '#core/config/index.js';
import { connectMongo } from '#core/db/connect.js';
import { disconnectMongo } from '#core/db/connect.js';
import { centralErrorHandler, notFoundHandler } from '#core/middlewares/errorHandler.js';
import { envelopeNormalizer } from '#core/middlewares/envelopeNormalizer.js';
import { rememberRestore } from '#core/middlewares/rememberRestore.js';
import { isWidgetEnabledCached } from '#core/utils/widgetSettings.js';
import User from '#models/user.js';
import verificacaoRoutes from '#routes/verificacao.routes.js';
import * as gestorModule from '#modules/gestor/index.js';
import * as clinicaModule from '#modules/clinica/index.js';
import * as condominiosModule from '#modules/condominios/index.js';
import * as portalMoradorModule from '#modules/portal-morador/index.js';
// Reuso de handlers de login/primeiro acesso do Gestor para rotas genéricas de módulos
import { login as genericLogin, primeiroAcessoPost as genericPrimeiroAcessoPost } from '#modules/gestor/app/controllers/authController.js';
import { portalLoginPost, portalPrimeiroAcessoGet, portalPrimeiroAcessoPost } from '#modules/portal-morador/app/controllers/authController.js';

// Módulos registrados: por padrão, NÃO montar Escalas (fora do escopo atual).
// Para habilitar Escalas no futuro, use ENABLE_ESCALAS=1.
const registry = [gestorModule, clinicaModule, condominiosModule, portalMoradorModule];

let __portsBound = false;

function bindPortsOnce() {
  if (__portsBound) return;
  const ports = getPorts();
  Object.assign(BankPort, ports.bank);
  Object.assign(DocumentosPort, ports.documentos);
  __portsBound = true;
}

export async function createServer(options = {}) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const ROOT = process.cwd();
  const config = options.config || loadConfig();
  const skipDb = options.skipDb === true;
  const skipDbForced = options.skipDb === true;
  const isParityEnv = String(process.env.PARITY || '').trim() === '1';
  const isTestEnv = ['test','ci','jest','mocha'].includes(String(process.env.NODE_ENV||'').toLowerCase()) || process.argv.includes('--test') || options.skipDb === true || isParityEnv;
  const app = express();

  bindPortsOnce();

  const traceRequests = String(process.env.WD_TRACE_REQUESTS || '').trim() === '1';
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const requestId = req.headers['x-request-id'] ? String(req.headers['x-request-id']) : randomUUID();
    const originalUrl = String(req.originalUrl || req.url || '/');
    const pathname = originalUrl.split('?')[0] || '/';
    const firstSegment = pathname.replace(/^\/+/, '').split('/')[0] || 'root';
    const wdPath = firstSegment.toLowerCase();

    req.requestId = requestId;
    res.locals.requestId = requestId;
    res.locals.wdPath = wdPath;

    try {
      res.setHeader('X-Request-Id', requestId);
      res.setHeader('X-WD-Path', wdPath);
    } catch {
      /* noop */
    }

    res.on('finish', () => {
      if (!traceRequests) return;
      const durationMs = Date.now() - startedAt;
      const method = String(req.method || 'GET').toUpperCase();
      const statusCode = res.statusCode;
      console.log(`[trace] ${requestId} ${method} ${originalUrl} ${statusCode} ${durationMs}ms wdPath=${wdPath}`);
    });

    next();
  });

  // Widgets: injeta flag de visibilidade (por módulo) para os templates EJS.
  // Default: habilitado; se DB indisponível, mantém habilitado (não quebra páginas).
  try {
    const KNOWN_WIDGET_MODULES = new Set(['gestor', 'clinica', 'condominios', 'escalas', 'portal-morador', 'portal_morador']);
    app.use(async (req, res, next) => {
      try {
        const url = String(req.originalUrl || req.url || '');
        // Evita custo em assets
        if (/\.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?)(?:\?|$)/i.test(url)) return next();
        const pathname = url.split('?')[0] || '';
        const seg = pathname.replace(/^\/+/, '').split('/')[0] || '';
        if (!seg || !KNOWN_WIDGET_MODULES.has(seg)) return next();
        const moduleId = seg === 'portal_morador' ? 'portal-morador' : seg;
        res.locals.feedbackWidgetEnabled = await isWidgetEnabledCached('feedback', moduleId, true);
      } catch { /* noop */ }
      next();
    });
  } catch { /* noop */ }

  // Headers de diagnóstico de deploy (úteis para confirmar que o runtime está com este código/commit).
  try {
    const buildTag = process.env.WDG_BUILD_TAG || 'wdg-2026-01-24-login-modulo-lookup';
    app.use((req, res, next) => {
      try {
        res.setHeader('X-WDG-Build', buildTag);
        const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || '';
        if (sha) res.setHeader('X-WDG-Commit', String(sha).slice(0, 12));
        const ref = process.env.VERCEL_GIT_COMMIT_REF || '';
        if (ref) res.setHeader('X-WDG-Branch', String(ref).slice(0, 64));
      } catch { /* noop */ }
      next();
    });
  } catch { /* noop */ }
  // Registrar view engine para rotas diretas deste app (ex.: '/', '/index')
  try {
    const viewsRoot = path.join(ROOT, '.', 'views');
    app.set('views', [
      path.join(viewsRoot),
      path.join(viewsRoot, 'gestor'),
      path.join(viewsRoot, 'escalas'),
      path.join(viewsRoot, 'portal-morador'),
    ]);
    app.set('view engine', 'ejs');
  } catch(_) { /* noop */ }
  // Vercel/Proxies: habilita confiança no proxy para que req.secure reflita HTTPS e cookies 'secure' funcionem
  // Sem isso, em ambientes atrás de proxy (como Vercel), express-session pode RECUSAR setar o cookie de sessão
  // e causar loop de redirecionamento no login.
  app.set('trust proxy', 1);
  app.locals.skipDb = !!skipDb;
  // Quando o caller passa skipDb=true explicitamente (ex.: testes), não tentamos reconectar no middleware de retry.
  app.locals.__skipDbForced = !!skipDbForced;

  // Flag efetiva: pode mudar para true caso a conexão com Mongo falhe durante o boot.
  // (Importante para evitar inicializações que assumem DB disponível, como MongoStore.)
  const getEffectiveSkipDb = () => !!app.locals.skipDb;

  // Retry de conexão (serverless): se o boot caiu em skipDb por falha transitória,
  // tenta reconectar sob demanda quando chegar uma rota que tipicamente depende de DB.
  try {
    app.locals.__dbRetry = { lastAttemptAt: 0, promise: null };
    app.use(async (req, _res, next) => {
      try {
        // Modo skipDb forçado (ex.: testes): não tentar reconectar automaticamente.
        if (app.locals.__skipDbForced) return next();
        // Se o app está em skipDb ou se a conexão caiu após o boot (readyState != 1), tenta reconectar.
        const mongoReady = mongoose.connection.readyState === 1;
        if (!getEffectiveSkipDb() && mongoReady) return next();
        const method = String(req.method || 'GET').toUpperCase();
        const url = String(req.originalUrl || req.url || '');
        // Evita tentativas em assets e páginas públicas de login
        const isStatic = /\.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?)($|\?)/i.test(url) || url.includes('/images/') || url.includes('/css/') || url.includes('/js/');
        if (isStatic) return next();
        const isDbLikelyNeeded =
          /^\/(gestor\/api|condominios\/api|api|portal-morador\/api|portal_morador\/api)\b/i.test(url) ||
          // Páginas autenticadas do Portal costumam depender de sessão/DB; ao menos, aquecemos a conexão
          // antes de middlewares como express-session/connect-mongo.
          /^\/portal-morador\/(home|mensagens|enquetes|comunicados|solicitacoes|financeiro|visitante)\b/i.test(url) ||
          /^\/portal_morador\/(home|mensagens|enquetes|comunicados|solicitacoes|financeiro|visitante)\b/i.test(url) ||
          // POST de login em módulos montados em /:seg (ex.: /condominios/login)
          (method === 'POST' && /^\/[^\/]+\/login\b/i.test(url));
        if (!isDbLikelyNeeded) return next();
        // Throttle: no máximo 1 tentativa a cada 15s por processo
        const now = Date.now();
        const st = app.locals.__dbRetry;
        if (st.promise) {
          await st.promise.catch(() => null);
          return next();
        }
        if (now - (st.lastAttemptAt || 0) < 15000) return next();
        st.lastAttemptAt = now;
        const mongoUrl = config.mongoUri || process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUrl) return next();

        st.promise = (async () => {
          try {
            await connectMongo(mongoUrl);
            if (mongoose.connection.readyState === 1) {
              app.locals.skipDb = false;
              console.log('[server][db] reconectado; skipDb=false');
            }
          } catch {
            // Mantém skipDb=true; sem crash
          }
        })();
        await st.promise.catch(() => null);
        st.promise = null;
        return next();
      } catch {
        return next();
      }
    });
  } catch { /* noop */ }

  // Header de diagnóstico: sinaliza se o app atual está em modo "light" (skipDb)
  try {
    app.use((req, res, next) => {
      try {
        res.setHeader('X-App-Mode', getEffectiveSkipDb() ? 'light' : 'full');
        res.setHeader('X-Mongo-State', String(mongoose.connection.readyState));
      } catch {
        /* noop */
      }
      next();
    });
  } catch(_) { /* noop */ }

  // Interceptador de res.redirect para evitar loops para /gestor/login e /gestor/primeiroacesso
  // Se algum middleware tentar redirecionar essas páginas públicas, renderizamos o EJS diretamente.
  try {
    const ROOTi = path.join(ROOT, '.');
    app.use((req, res, next) => {
      const originalRedirect = res.redirect.bind(res);
      res.redirect = async function(statusOrUrl, maybeUrl) {
        try {
          const method = String(req.method||'GET').toUpperCase();
          let status = 302;
          let url = '';
          if (typeof statusOrUrl === 'number') { status = statusOrUrl; url = String(maybeUrl||''); }
          else { url = String(statusOrUrl||''); }
          const target = url.split('#')[0];
          const isLogin = /(^|\/)[^?#]*\blogin(\/?|\?|$)/i.test(target);
          const isPA    = /(^|\/)[^?#]*\bprimeiroacesso(\/?|\?|$)/i.test(target);
          if ((isLogin || isPA) && (method === 'GET' || method === 'HEAD')) {
            const qIndex = target.indexOf('?');
            const qs = qIndex >= 0 ? target.slice(qIndex + 1) : (url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
            const params = new URLSearchParams(qs);
            const erro = params.get('erro') || null;
            let mensagem = null;
            if (isPA && erro) {
              switch (erro) {
                case 'campos': mensagem = 'Preencha todos os campos.'; break;
                case 'confirmacao': mensagem = 'Confirmação de senha não confere.'; break;
                case 'tamanho': mensagem = 'A nova senha deve ter pelo menos 8 caracteres.'; break;
                case 'forca': mensagem = 'A senha precisa conter maiúscula, minúscula e número.'; break;
                case 'servidor': mensagem = 'Falha ao atualizar senha. Tente novamente.'; break;
              }
            }
            // Detecta módulo pelo alvo do redirect
            let seg = null;
            const mm = target.match(/^\/([^\/?#]+)\/(login|primeiroacesso)(?:[?#].*)?$/i);
            if (mm) seg = (mm[1]||'').toLowerCase();
            if (!seg) seg = /^\/escalas\b/i.test(target) ? 'escalas' : (/^\/gestor\b/i.test(target) ? 'gestor' : null);
            const basePath = seg ? ('/' + seg) : '/gestor';

            // Resolve o label do módulo de forma idêntica à rota GET /:seg/login
            async function resolveModuleLabel(segment) {
              try {
                if (!segment || segment === 'gestor') return 'Gestor';
                if (segment === 'escalas') return 'Escalas';
                if (!req.app.locals.skipDb && mongoose.connection.readyState === 1) {
                  const ModuloModel = (await import('#models/modulo.js')).default;
                  const m = await ModuloModel.findOne({
                    $or: [
                      { url_base: '/' + segment },
                      { url_base: segment },
                      { nome: new RegExp('^' + segment + '$', 'i') }
                    ]
                  }).select('nome').lean().maxTimeMS(Number(process.env.MONGO_QUERY_TIMEOUT_MS||3000));
                  if (m?.nome) return m.nome;
                }
              } catch {}
              try {
                const meta = registry
                  .map(m => m.meta || {})
                  .find(mt => (String(mt.basePath||'').replace(/^\//,'') === segment) || (String(mt.name||'') === segment));
                if (meta && meta.displayName) return meta.displayName;
              } catch {}
              return segment ? (segment.charAt(0).toUpperCase() + segment.slice(1)) : 'Gestor';
            }
            let moduleLabel = await resolveModuleLabel(seg);
            const isPortalSeg = seg === 'portal-morador' || seg === 'portal_morador';
            if (isPortalSeg && isPA && !isLogin) {
              // Portal do Morador precisa executar o controlador real de primeiro acesso (token dinâmico)
              return originalRedirect(statusOrUrl, maybeUrl);
            }

            let viewName = isLogin ? 'gestor/logingestor' : 'gestor/primeiroacesso';
            if (isPortalSeg && isLogin) {
              viewName = 'portal-morador/login';
              moduleLabel = 'Portal do Morador';
            }
            try {
              return res.render(viewName, { basePath, moduleLabel, erro, mensagem }, (err, html) => {
                if (err) return originalRedirect(status, url);
                try {
                  res.set('Content-Type', 'text/html; charset=utf-8');
                  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
                  res.set('Pragma', 'no-cache');
                  res.set('Expires', '0');
                  res.set('X-Redirect-Guard', isLogin ? 'login' : 'primeiroacesso');
                } catch {}
                return res.status(200).send(html);
              });
            } catch(_er) {
              return originalRedirect(status, url);
            }
          }
        } catch(_e) { /* se algo falhar, segue o redirecionamento normal */ }
        // IMPORTANT: nunca chame `res.redirect(url, undefined)`.
        // O Express interpreta como assinatura legada `res.redirect(url, status)` e acaba com status `undefined`.
        if (typeof statusOrUrl === 'number') {
          return originalRedirect(statusOrUrl, maybeUrl);
        }
        return originalRedirect(String(statusOrUrl || ''));
      };
      next();
    });
  } catch(_e) { /* noop */ }

  // Ultra-early guard: renderiza /gestor/login e /gestor/primeiroacesso antes de QUALQUER outra coisa
  // Cobre GET e HEAD, preserva query (?erro=...) e evita qualquer redirecionamento acidental
  try {
    const ROOT2 = path.join(ROOT, '.');
    app.use(async (req, res, next) => {
      try {
        const m = String(req.method||'GET').toUpperCase();
        if (m !== 'GET' && m !== 'HEAD') return next();
        const url = String(req.originalUrl || req.url || '');
        const isLogin = /^\/gestor\/login(?:[?#].*)?$/.test(url) || /^\/login(?:[?#].*)?$/.test(url);
        const isPA    = /^\/gestor\/primeiroacesso(?:[?#].*)?$/.test(url) || /^\/primeiroacesso(?:[?#].*)?$/.test(url);
        if (!isPA) return next();
        const queryStr = (url.includes('?')) ? url.slice(url.indexOf('?') + 1) : '';
        const params = new URLSearchParams(queryStr);
        const raw = params.get('raw');
        const erro = params.get('erro') || null;
        let mensagem = null;
        if (isPA && erro) {
          switch (erro) {
            case 'campos': mensagem = 'Preencha todos os campos.'; break;
            case 'confirmacao': mensagem = 'Confirmação de senha não confere.'; break;
            case 'tamanho': mensagem = 'A nova senha deve ter pelo menos 8 caracteres.'; break;
            case 'forca': mensagem = 'A senha precisa conter maiúscula, minúscula e número.'; break;
            case 'servidor': mensagem = 'Falha ao atualizar senha. Tente novamente.'; break;
          }
        }
        if (raw === '1' || raw === 'true') {
          const tag = isLogin ? 'login' : 'primeiroacesso';
          res.set('Content-Type', 'text/plain; charset=utf-8');
          res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.set('X-Guard-Direct', tag);
          return res.status(200).send(`[server-guard] direct ${tag}`);
        }
        return res.render('gestor/primeiroacesso', { basePath: '/gestor', moduleLabel: 'Gestor', erro, mensagem }, (err, html) => {
          if (err) return next();
          res.set('Content-Type', 'text/html; charset=utf-8');
          res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.set('Pragma', 'no-cache');
          res.set('Expires', '0');
          res.set('X-Guard-Direct', 'primeiroacesso');
          return res.status(200).send(html);
        });
      } catch(_e) { return next(); }
    });
  } catch(_e) { /* noop */ }

  // Sirva estáticos e aliases o mais cedo possível (antes de sessão/middlewares)
  // para evitar overhead e potenciais 500 causados por stores de sessão em assets
  try {
    app.use('/images', express.static(path.join(ROOT, 'images')));             // imagens globais
    app.use(express.static(path.join(ROOT, 'public')));                        // /css, /js, etc. na raiz
    // Aliases sob /gestor para quando assets forem referenciados com base do módulo
    app.use('/gestor/js/gestor', express.static(path.join(ROOT, 'public/gestor/js')));
  app.use('/gestor/js', express.static(path.join(ROOT, 'public/gestor/js')));
  // Também servir scripts compartilhados (public/js) sob /gestor/js (ex.: /gestor/js/validators.js)
  app.use('/gestor/js', express.static(path.join(ROOT, 'public/js')));
    app.use('/gestor/js/pages', express.static(path.join(ROOT, 'public/gestor/js/pages')));
    app.use('/gestor/css', express.static(path.join(ROOT, 'public/css')));
    app.use('/gestor/images', express.static(path.join(ROOT, 'images')));
    app.use('/gestor/img', express.static(path.join(ROOT, 'public/img')));
  // Alias direto para dados estáticos sob o prefixo do módulo Gestor
  // Evita 500/404 caso o sub-app não capture /gestor/data em alguns ambientes
  app.use('/gestor/data', express.static(path.join(ROOT, 'public/data')));

    // Favicon genérico para qualquer módulo de primeiro nível (ex.: /clinica/favicon.ico, /condominios/favicon.ico)
    // e também para a raiz (/favicon.ico). Usa public/favicon.ico se existir; caso contrário, fallback para images/logoWDGestor.png
    const serveFavicon = (req, res) => {
      try {
        const ico = path.join(ROOT, 'public', 'favicon.ico');
        const png = path.join(ROOT, 'images', 'logoWDGestor.png');
        let target = null;
        if (fs.existsSync(ico)) { target = ico; res.type('image/x-icon'); }
        else if (fs.existsSync(png)) { target = png; res.type('image/png'); }
        if (!target) return res.status(204).end();
        res.set('Cache-Control', 'public, max-age=86400');
        return res.sendFile(target, err => {
          if (!err) return;
          try {
            if (res.headersSent) return res.end();
            return res.status(204).end();
          } catch { return; }
        });
      } catch {
        return res.status(204).end();
      }
    };
    app.get('/favicon.ico', serveFavicon);
    app.get('/:seg/favicon.ico', serveFavicon);

    // Handlers explícitos para assets do módulo Escalas ANTES de qualquer outro middleware
    // Evita que falhas de sessão/DB ou erros do express.static virem 500 em assets
    app.get('/escalas/css/*', (req, res) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/css\//, '');
        const p = path.join(ROOT, 'public/css', rel);
        if (!fs.existsSync(p)) return res.status(404).set('X-Served-By','escalas-css-miss').type('text/plain').send('Not found');
        res.set('X-Served-By','escalas-css');
        res.type('text/css');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(p);
      } catch {
        return res.status(404).set('X-Served-By','escalas-css-error').type('text/plain').send('Not found');
      }
    });
    app.get('/escalas/images/*', (req, res) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/images\//, '');
        const p = path.join(ROOT, 'images', rel);
        if (!fs.existsSync(p)) return res.status(404).set('X-Served-By','escalas-images-miss').end();
        res.set('X-Served-By','escalas-images');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(p);
      } catch {
        return res.status(404).set('X-Served-By','escalas-images-error').end();
      }
    });
    app.get('/escalas/img/*', (req, res) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/img\//, '');
        const p = path.join(ROOT, 'public/img', rel);
        if (!fs.existsSync(p)) return res.status(404).set('X-Served-By','escalas-img-miss').end();
        res.set('X-Served-By','escalas-img');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(p);
      } catch {
        return res.status(404).set('X-Served-By','escalas-img-error').end();
      }
    });
    // Compat: muitos templates antigos referenciam /escalas/js/pages/login.js
    // No módulo Escalas, o script equivalente mora em public/js/escalas/login.js
    // Colocar ESTE handler ANTES do genérico /escalas/js/* para não retornar 404
    app.get('/escalas/js/pages/login.js', (req, res) => {
      try {
        const primary = path.join(ROOT, 'public/js/escalas/login.js');
        const fallback = path.join(ROOT, 'public/gestor/js/pages/login.js');
        const target = fs.existsSync(primary) ? primary : (fs.existsSync(fallback) ? fallback : null);
        if (!target) return res.status(404).set('X-Served-By','escalas-js-login-miss').type('text/plain').send('Not found');
        res.set('X-Served-By','escalas-js-login');
        res.type('application/javascript');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(target);
      } catch {
        return res.status(404).set('X-Served-By','escalas-js-login-error').type('text/plain').send('Not found');
      }
    });
    app.get('/escalas/js/*', (req, res) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/js\//, '');
        const p1 = path.join(ROOT, 'public/escalas/js', rel);
        const p2 = path.join(ROOT, 'public/js', rel);
        const target = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
        if (!target) return res.status(404).set('X-Served-By','escalas-js-miss').type('text/plain').send('Not found');
        res.set('X-Served-By', target === p1 ? 'escalas-js' : 'escalas-js-shared');
        res.type('application/javascript');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(target);
      } catch {
        return res.status(404).set('X-Served-By','escalas-js-error').type('text/plain').send('Not found');
      }
    });
    // Aliases GENÉRICOS para quaisquer módulos de primeiro nível (ex.: /clinica/css/*, /clinica/images/*, /clinica/js/*)
    // Isso permite que a mesma tela de login funcione para qualquer módulo novo, usando os assets compartilhados.
    app.use('/:seg/css', (req, res, next) => {
      const seg = String(req.params.seg||''); if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      return express.static(path.join(ROOT, 'public/css'))(req, res, next);
    });
    app.use('/:seg/images', (req, res, next) => {
      const seg = String(req.params.seg||''); if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      return express.static(path.join(ROOT, 'images'))(req, res, next);
    });
    app.use('/:seg/img', (req, res, next) => {
      const seg = String(req.params.seg||''); if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      return express.static(path.join(ROOT, 'public/img'))(req, res, next);
    });
    app.use('/:seg/js', (req, res, next) => {
      const seg = String(req.params.seg||''); if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      return express.static(path.join(ROOT, 'public/js'))(req, res, next);
    });

    // Uploads compartilhados (ex.: fotos) para módulos genéricos (inclui /condominios/uploads/*)
    app.use('/:seg/uploads', (req, res, next) => {
      const seg = String(req.params.seg||''); if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      // Prioriza uploads persistidos em /uploads; fallback para /public/uploads (ambientes legados)
      const st1 = express.static(path.join(ROOT, 'uploads'));
      const st2 = express.static(path.join(ROOT, 'public/uploads'));
      return st1(req, res, () => st2(req, res, next));
    });

    // Uploads na raiz (casos onde a URL vem como /uploads/*)
    app.use('/uploads', express.static(path.join(ROOT, 'uploads')));
    app.use('/uploads', express.static(path.join(ROOT, 'public/uploads')));
    // Script de página de login compartilhado para módulos genéricos
    app.get('/:seg/js/pages/login.js', (req, res, next) => {
      try {
        const seg = String(req.params.seg||''); if (!seg || seg === 'gestor' || seg === 'escalas') return next();
        const p = path.join(ROOT, 'public/gestor/js/pages/login.js');
        res.type('application/javascript');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(p, err => err ? next() : undefined);
      } catch { return next(); }
    });
    // Uploads do módulo Escalas: se o arquivo não existir (Vercel é efêmero), servir placeholder
    app.get('/escalas/uploads/*', (req, res) => {
      try {
        const rel = String((req.path || '').replace(/^\/escalas\/uploads\//, ''));
        const cand = [
          path.join(ROOT, 'public/uploads', rel),
          path.join(ROOT, 'uploads', rel)
        ];
        for (const p of cand) {
          try {
            if (fs.existsSync(p)) {
              res.set('X-Served-By','escalas-uploads-hit');
              res.set('Cache-Control', 'public, max-age=300');
              return res.sendFile(p);
            }
          } catch {}
        }
        // Fallbacks: SVG placeholder (preferível) ou PNG de usuário
        const phSvg = path.join(ROOT, 'public', 'img', 'user-placeholder.svg');
        const phPng = path.join(ROOT, 'images', 'usuario.png');
        const target = (fs.existsSync(phSvg) ? phSvg : (fs.existsSync(phPng) ? phPng : null));
        if (!target) {
          console.warn('[uploads] placeholder inexistente', { rel, phSvg, phPng });
          return res.status(404).set('X-Served-By','escalas-uploads-no-placeholder').end();
        }
        const ext = path.extname(target).toLowerCase();
        if (ext === '.svg') res.type('image/svg+xml');
        else if (ext === '.png') res.type('image/png');
        res.set('Cache-Control', 'public, max-age=300');
        res.set('X-Served-By','escalas-uploads-fallback');
        console.info('[uploads] fallback placeholder', { rel, target: path.basename(target) });
        return res.sendFile(target);
      } catch (e) {
        console.warn('[uploads] erro ao servir upload', e?.message);
        return res.status(404).set('X-Served-By','escalas-uploads-error').end();
      }
    });
  // Aliases sob /escalas para servir assets ANTES da sessão/middlewares
  // Isso evita 500 em assets caso a sessão/DB falhe, e reduz overhead
  app.use('/escalas/images', express.static(path.join(ROOT, 'images')));
  app.use('/escalas/css', express.static(path.join(ROOT, 'public/css')));
  app.use('/escalas/js/escalas', express.static(path.join(ROOT, 'public/escalas/js/escalas')));
  app.use('/escalas/js', express.static(path.join(ROOT, 'public/escalas/js')));
  app.use('/escalas/js', express.static(path.join(ROOT, 'public/js')));
  app.use('/escalas/img', express.static(path.join(ROOT, 'public/img')));
  app.use('/escalas/uploads', express.static(path.join(ROOT, 'public/uploads')));
    // Fallback explícito para CSS do módulo Escalas (alguns ambientes podem não resolver o static)
    app.get('/escalas/css/*', (req, res, next) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/css\//, '');
        const p = path.join(ROOT, 'public/css', rel);
        res.set('X-Served-By','escalas-css-fallback');
        res.type('text/css');
        return res.sendFile(p, err => err ? next() : undefined);
      } catch { return next(); }
    });
    // Fallback explícito para IMAGES do módulo Escalas
    app.get('/escalas/images/*', (req, res, next) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/images\//, '');
        const p = path.join(ROOT, 'images', rel);
        res.set('X-Served-By','escalas-images-fallback');
        return res.sendFile(p, err => err ? next() : undefined);
      } catch { return next(); }
    });
    // Fallback explícito para IMG do módulo Escalas
    app.get('/escalas/img/*', (req, res, next) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/img\//, '');
        const p = path.join(ROOT, 'public/img', rel);
        res.set('X-Served-By','escalas-img-fallback');
        return res.sendFile(p, err => err ? next() : undefined);
      } catch { return next(); }
    });
    // Fallback explícito para JS do módulo Escalas (tenta primeiro pasta específica, depois compartilhada)
    app.get('/escalas/js/*', (req, res, next) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/js\//, '');
        const p1 = path.join(ROOT, 'public/escalas/js', rel);
        res.set('X-Served-By','escalas-js-fallback-1');
        return res.sendFile(p1, err1 => {
          if (!err1) return; // enviado
          try {
            const p2 = path.join(ROOT, 'public/js', rel);
            res.set('X-Served-By','escalas-js-fallback-2');
            return res.sendFile(p2, err2 => err2 ? next() : undefined);
          } catch { return next(); }
        });
      } catch { return next(); }
    });
    // Fallback explícito para o login.js
    app.get('/gestor/js/pages/login.js', (req, res, next) => {
      try {
        const p = path.join(ROOT, 'public/gestor/js/pages/login.js');
        return res.sendFile(p, err => err ? next() : undefined);
      } catch { return next(); }
    });
  } catch(_e) { /* noop */ }

  

  // HARD-STOP: Renderização direta das páginas públicas críticas antes de qualquer
  // middleware que possa redirecionar. Isso elimina loops ocasionais no GET
  // /gestor/login e /gestor/primeiroacesso caso o entrypoint não intercepte.
  try {
    const ROOT = process.cwd();
    function parseErroMensagem(isLogin, qs) {
      try {
        const params = new URLSearchParams(qs || '');
        const erro = params.get('erro') || null;
        if (isLogin) return { erro, mensagem: null };
        let mensagem = null;
        switch (erro) {
          case 'campos': mensagem = 'Preencha todos os campos.'; break;
          case 'confirmacao': mensagem = 'Confirmação de senha não confere.'; break;
          case 'tamanho': mensagem = 'A nova senha deve ter pelo menos 8 caracteres.'; break;
          case 'forca': mensagem = 'A senha precisa conter maiúscula, minúscula e número.'; break;
          case 'servidor': mensagem = 'Falha ao atualizar senha. Tente novamente.'; break;
        }
        return { erro, mensagem };
      } catch { return { erro:null, mensagem:null }; }
    }
    app.get('/gestor/login', (req, res, next) => {
      try {
        const isLogin = true;
        const queryStr = (req.originalUrl && req.originalUrl.includes('?')) ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
        const { erro, mensagem } = parseErroMensagem(isLogin, queryStr);
        return res.render('gestor/logingestor', { basePath: '/gestor', moduleLabel: 'WDGestor', erro, mensagem }, (err, html) => {
          if (err) return next();
          try {
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
            res.set('X-Server-Direct', 'login');
          } catch {}
          return res.status(200).send(html);
        });
      } catch (e) { return next(); }
    });
    // Login genérico: /:seg/login -> renderiza mesma view com basePath dinâmico
    app.get('/:seg/login', async (req, res, next) => {
      try {
        const seg = String(req.params.seg||'').toLowerCase();
        if (!seg || seg === 'gestor' || seg === 'escalas') return next();
        const queryStr = (req.originalUrl && req.originalUrl.includes('?')) ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
        const params = new URLSearchParams(queryStr);
        const { erro, mensagem } = parseErroMensagem(true, queryStr);
        const motivo = params.get('motivo') || null;
        let moduleLabel = seg.charAt(0).toUpperCase() + seg.slice(1);
        const isPortalMorador = seg === 'portal-morador' || seg === 'portal_morador';
        if (isPortalMorador) {
          const basePath = '/' + seg;
          const email = params.get('email') || '';
          return res.render('portal-morador/login', { basePath, moduleLabel: 'Portal do Morador', erro, mensagem, email }, (err, html) => {
            if (err) return next();
            try {
              res.set('Content-Type', 'text/html; charset=utf-8');
              res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
              res.set('Pragma', 'no-cache');
              res.set('Expires', '0');
              res.set('X-Server-Direct', 'login-portal-morador');
            } catch {}
            return res.status(200).send(html);
          });
        }
        // Tenta obter o nome e status a partir do banco se disponível
        try {
          if (!req.app.locals.skipDb && mongoose.connection.readyState === 1) {
            const ModuloModel = (await import('#models/modulo.js')).default;
            const m = await ModuloModel.findOne({
              $or: [
                { url_base: '/' + seg },
                { url_base: seg },
                { nome: new RegExp('^'+seg+'$', 'i') }
              ]
            }).select('nome status url_base').lean().maxTimeMS(Number(process.env.MONGO_QUERY_TIMEOUT_MS||3000));
            if (!m) {
              // Módulo não existe no banco -> página de erro comum (404)
              try {
                res.status(404);
                return res.render('erro', { errorMessage: `Módulo \'${seg}\' não encontrado.` });
              } catch {
                return res.status(404).send('Módulo não encontrado.');
              }
            }
            if (m?.nome) moduleLabel = m.nome;
            const status = String(m?.status || '').toLowerCase();
            const permitido = (status === 'ativo' || status === 'planejado' || status === 'em planejamento');
            if (!permitido) {
              const basePath = String(m?.url_base || '/' + seg);
              return res.status(200).render('partials/construcao', { moduleName: moduleLabel, basePath });
            }
          }
        } catch {}
        // Fallback: procurar no registry estático (metadados do módulo) para nome amigável
        try {
          const meta = registry
            .map(m => m.meta || {})
            .find(mt => (String(mt.basePath||'').replace(/^\//,'') === seg) || (String(mt.name||'') === seg));
          if (meta && meta.displayName) moduleLabel = meta.displayName;
        } catch {}
        const basePath = '/' + seg;
        // Quando o roteador anterior indicar módulo inexistente/planejado, renderiza página de construção
        if (erro === 'modulo' && (motivo === 'modulo_inexistente' || motivo === 'planejado' || motivo === 'indisponivel')) {
          try {
            return res.status(200).render('partials/construcao', { moduleName: moduleLabel, basePath });
          } catch (_e) {
            // fallback de renderização
            return res.render('partials/construcao', { moduleName: moduleLabel, basePath }, (err, html) => {
              if (err) return next();
              try {
                res.set('Content-Type', 'text/html; charset=utf-8');
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
              } catch {}
              return res.status(200).send(html);
            });
          }
        }
        return res.render('gestor/logingestor', { basePath, moduleLabel, erro, mensagem }, (err, html) => {
          if (err) return next();
          try {
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
            res.set('X-Server-Direct', 'login-generic');
          } catch {}
          return res.status(200).send(html);
        });
      } catch (e) { return next(); }
    });
  } catch(_e) { /* noop */ }

  // Fallback explícito para /gestor/data (serverless/ordem de middlewares)
  // Tenta servir diretamente de public/data quando o alias acima não atender
  try {
    app.get('/gestor/data/*', (req, res, next) => {
      try {
        const rel = String(req.path || '').replace(/^\/gestor\/data\//, '');
        const p = path.join(ROOT, 'public/data', rel);
        if (!fs.existsSync(p)) return next();
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(p);
      } catch { return next(); }
    });
  } catch(_e) { /* noop */ }

  // Identificador único deste boot de processo para invalidar sessões antigas (stateless ao reiniciar)
  const BOOT_ID = process.env.SESSION_BOOT_ID || (app.locals.sessionBootId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8));
  app.locals.sessionBootId = BOOT_ID;

  if (!skipDb) {
    try {
      const mongoUrl = config.mongoUri || process.env.MONGO_URI || process.env.MONGODB_URI;
      await connectMongo(mongoUrl);
    } catch (err) {
      console.warn('[server][db] Falha ao conectar ao MongoDB — executando em modo sem DB (skipDb=true):', err?.message);
      app.locals.skipDb = true;
      // Evita Mongoose "buffering timed out" ao executar sem DB (testes/páginas em modo leve)
      mongoose.set('bufferCommands', false);
      mongoose.set('bufferTimeoutMS', 0);
    }
  } else {
    // Evita Mongoose "buffering timed out" ao executar sem DB (testes de páginas)
    mongoose.set('bufferCommands', false);
    mongoose.set('bufferTimeoutMS', 0);
  }

  // Sessão HTTP: usa MemoryStore por padrão; opcionalmente usa MongoStore quando SESSION_STORE=mongo
  // Importante: quando o Mongo oscila em runtime (serverless), o connect-mongo pode lançar/propagar erro
  // no meio do pipeline do express-session, derrubando páginas HTML com 503.
  // Para UX melhor, degradamos para "sem sessão" quando for erro de conectividade (o usuário pode relogar).
  function isMongoOfflineErrorLike(err) {
    try {
      if (!err) return false;
      const seen = new Set();
      const stack = [err];
      while (stack.length) {
        const e = stack.pop();
        if (!e || typeof e !== 'object') continue;
        if (seen.has(e)) continue;
        seen.add(e);

        const name = String(e?.name || '');
        const msg = String(e?.message || '');
        const code = String(e?.code || '');

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

  function wrapSessionStoreSafe(innerStore) {
    if (!innerStore || typeof innerStore !== 'object') return innerStore;
    const safe = Object.create(innerStore);

    const wrapCb = (methodName, cb) => {
      if (typeof cb !== 'function') return cb;
      return (err, ...rest) => {
        if (isMongoOfflineErrorLike(err)) {
          if (methodName === 'get') return cb(null, null);
          return cb(null, ...rest);
        }
        return cb(err, ...rest);
      };
    };

    const wrapMethod = (methodName) => {
      const fn = innerStore[methodName];
      if (typeof fn !== 'function') return;
      safe[methodName] = (...args) => {
        try {
          if (args.length) {
            const last = args[args.length - 1];
            if (typeof last === 'function') {
              args[args.length - 1] = wrapCb(methodName, last);
            }
          }
          return fn.apply(innerStore, args);
        } catch (err) {
          const last = args.length ? args[args.length - 1] : null;
          if (typeof last === 'function') {
            const cb = wrapCb(methodName, last);
            if (isMongoOfflineErrorLike(err)) {
              if (methodName === 'get') return cb(null, null);
              return cb(null);
            }
            return cb(err);
          }
          if (!isMongoOfflineErrorLike(err)) throw err;
        }
      };
    };

    ['get', 'set', 'touch', 'destroy', 'all', 'clear', 'length'].forEach(wrapMethod);
    try { safe.__wdgSafeStore = true; } catch { /* noop */ }
    return safe;
  }

  let store;
  // Preferir MongoStore automaticamente em ambientes serverless (ex.: Vercel) quando houver MONGO_URI
  const wantMongoStore = (
    (process.env.SESSION_STORE || '').toLowerCase() === 'mongo' ||
    ((process.env.SESSION_STORE || '').trim() === '' && !getEffectiveSkipDb() && (process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL) && (config.mongoUri || process.env.MONGO_URI || process.env.MONGODB_URI))
  );
  if (wantMongoStore && !getEffectiveSkipDb()) {
    try {
      const { default: MongoStore } = await import('connect-mongo');
      const mongoUrl = config.mongoUri || process.env.MONGO_URI || process.env.MONGODB_URI;
      if (mongoUrl) {
        const serverless = !!(process.env.VERCEL || process.env.VERCEL_URL || process.env.AWS_LAMBDA_FUNCTION_NAME);
        const defaultServerSelectionTimeout = serverless ? 8000 : 5000;
        const defaultConnectTimeout = serverless ? 8000 : 8000;
        const defaultSocketTimeout = serverless ? 20000 : 20000;
        const rawSst = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || defaultServerSelectionTimeout);
        const rawCt = Number(process.env.MONGO_CONNECT_TIMEOUT_MS || defaultConnectTimeout);
        const rawSt = Number(process.env.MONGO_SOCKET_TIMEOUT_MS || defaultSocketTimeout);
        const minSst = serverless ? 8000 : 0;
        const minCt = serverless ? 8000 : 0;
        const minSt = serverless ? 20000 : 0;
        store = MongoStore.create({
          mongoUrl,
          collectionName: 'sessions',
          ttl: 60 * 60 * 8,
          mongoOptions: {
            serverSelectionTimeoutMS: Math.max(rawSst, minSst),
            connectTimeoutMS: Math.max(rawCt, minCt),
            socketTimeoutMS: Math.max(rawSt, minSt),
            maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 10),
          },
        });
        store = wrapSessionStoreSafe(store);
        console.log('[session] usando connect-mongo');
      }
    } catch (err) {
      console.warn('[session] falha ao habilitar connect-mongo:', err.message, '-> usando MemoryStore');
    }
  }

  app.use(session({
    name: 'wdg.sid',
    secret: (process.env.SESSION_SECRET || config.sessionSecret || 'dev-secret'),
    resave: false,
    saveUninitialized: false,
    // Renovar expiração do cookie a cada resposta quando houver atividade
    rolling: true,
    store,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8 // 8h
    }
  }));

  // Marca sessão nova com bootId assim que criada (antes do rememberRestore)
  app.use((req,res,next)=> { try { if (req.session && !req.session._bootId) { req.session._bootId = BOOT_ID; if (!res.headersSent) res.cookie('wdg_boot', BOOT_ID, { httpOnly:false, sameSite:'lax' }); } } catch {} next(); });

  // Middleware para invalidar sessão criada em outro boot quando política exigir
  // DESABILITADO PERMANENTEMENTE - causava loops de redirecionamento em páginas públicas
  const invalidateOnBoot = false;
  if (invalidateOnBoot) {
    app.use((req,res,next)=> {
      try {
        if (req.session) {
          if (!req.session._bootId) { req.session._bootId = BOOT_ID; }
          else if (req.session._bootId !== BOOT_ID) {
            // Sessão de processo antigo -> destruir. Em páginas públicas (login/primeiroacesso/reset), NÃO redirecionar para evitar loop
            const url = String(req.originalUrl || req.url || '');
            const isPublicPage = /^(?:\/gestor)?\/(login|primeiroacesso|esquecisenha|esqueci-senha)(?:[?#].*)?$/i.test(url) || /^(?:\/gestor)?\/reset-password\//i.test(url);
            const wantsJson = url.startsWith('/api/') || url.startsWith('/gestor/api/');
            return req.session.destroy(()=> {
              if (wantsJson) return res.status(440).json({ success:false, error:'SESSION_EXPIRED', code:'SESSION_BOOT_INVALIDATED' });
              if (isPublicPage) return next();
              return res.redirect('/gestor/login');
            });
          }
        }
      } catch { /* ignore */ }
      next();
    });
  }

  // Cookies + remember restore
  app.use(cookieParser());
  app.use(rememberRestore);

  // Reidrata req.user a partir da sessão real (id/email) para middlewares/rotas que dependem de role/isMaster.
  // Não altera contrato da sessão: continua mínima em req.session.user.
  app.use(async (req, _res, next) => {
    try {
      if (req.user) return next();
      const sess = req.session?.user;
      if (!sess || (!sess.id && !sess.email)) return next();
      if (mongoose.connection.readyState !== 1) return next();

      let userDoc = null;
      if (sess.id && mongoose.Types.ObjectId.isValid(String(sess.id))) {
        userDoc = await User.findById(String(sess.id)).lean();
      }
      if (!userDoc && sess.email) {
        userDoc = await User.findOne({ email: String(sess.email).toLowerCase() }).lean();
      }
      if (!userDoc) return next();

      req.user = {
        _id: userDoc._id,
        id: userDoc._id,
        email: userDoc.email,
        nome: userDoc.nome || null,
        role: userDoc.role,
        isMaster: String(userDoc.role || '').toLowerCase() === 'master',
        unidade_id: userDoc.unidade_id || null,
        funcionario_id: userDoc.funcionario_id || null,
        foto: userDoc.foto || null,
      };
    } catch {
      // noop
    }
    return next();
  });

  // Interceptador de módulos com status 'planejado' -> renderiza página de construção
  // Modos de operação:
  //  - post: somente após login detectado via sessão (comportamento original)
  //  - path: por caminho (ex.: qualquer GET dentro do prefixo do módulo), exceto login/logout e assets
  // Em Vercel/serverless, a sessão em MemoryStore se perde entre requisições; então adotamos "path" por padrão
  // quando process.env.VERCEL estiver presente, a menos que PLANNED_GATE_MODE=post seja definido.
  try {
    app.use(async (req, res, next) => {
      try {
        const gateDebug = String(process.env.PLANNED_GATE_DEBUG||'').trim() === '1';
        const gateMode = (String(process.env.PLANNED_GATE_MODE||'').trim().toLowerCase()) || (process.env.VERCEL ? 'path' : 'post');
  const method = String(req.method||'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') return next();
        const original = String(req.originalUrl || req.url || '');
        const pathOnly = original.split('?')[0];
        if (!pathOnly || pathOnly === '/') return next();
        // Determina primeiro segmento e regras de exclusão
        const isMaster = !!(req.user?.isMaster || (req.session?.user?.role === 'master') || (req.session?.escalasUser?.role === 'master'));
        if (isMaster) return next();
  // Primeiro segmento
  const first = '/' + pathOnly.replace(/^\//,'').split('/')[0];
        if (first.length < 2) return next();
  // Não interceptar a própria página de login ou logout do módulo (permite "Voltar" funcionar)
  const escFirst = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isModuleLogin = new RegExp('^' + escFirst + '\/login(?:[?#].*)?$', 'i').test(pathOnly);
  const isModuleLogout = new RegExp('^' + escFirst + '\/logout(?:[?#].*)?$', 'i').test(pathOnly);
  if (isModuleLogin || isModuleLogout) return next();
        // Excluir assets e rotas públicas auxiliares do módulo
        const isStatic = (
          new RegExp('^' + escFirst + '\\/(css|js|images|img|uploads)(?:/|$)', 'i').test(pathOnly) ||
          new RegExp('^' + escFirst + '\\/favicon\\.ico(?:$|[?#])', 'i').test(pathOnly) ||
          new RegExp('^' + escFirst + '\\/metrics(?:$|[?#])', 'i').test(pathOnly)
        );
        if (isStatic) return next();

        // IMPORTANTE: não interceptar rotas de API do módulo.
        // O gate é de UI (renderiza HTML) e, se aplicado em /api/*, quebra clientes que esperam JSON
        // (ex.: Portal do Morador proxyando /portal-morador/api/msg/* -> /condominios/api/msg/*).
        const isApi = new RegExp('^' + escFirst + '\\/(api)(?:/|$)', 'i').test(pathOnly);
        if (isApi) {
          if (gateDebug) { try { res.set('X-Planned-Gate', 'skip-api;mode:' + gateMode); } catch{} }
          return next();
        }
        // Lista de prefixos forçados (não depende de DB)
        const forcedList = String(process.env.PLANNED_FORCE_PREFIXES||'').split(',').map(s=>s.trim()).filter(Boolean);
        const isForced = forcedList.some(p => p === first || p === first.replace(/^\//,''));

        // Requer usuário logado apenas no modo "post"; no modo "path" (padrão na Vercel), não exige sessão
        if (gateMode === 'post') {
          const logged = !!(req.session && (req.session.user || req.session.escalasUser));
          if (!logged) {
            if (gateDebug) { try { res.set('X-Planned-Gate','mode:post-unlogged-skip'); } catch{} }
            return next();
          }
        }
        // Não tentar sem DB
        if (!isForced && (req?.app?.locals?.skipDb || mongoose.connection.readyState !== 1)) {
          if (gateDebug) { try { res.set('X-Planned-Gate','skip-db'); } catch{} }
          return next();
        }
        // Carrega modelo de Módulo on-demand
        let ModuloModel = null;
        try { const mod = await import('#models/modulo.js'); ModuloModel = mod.default || mod; } catch { ModuloModel = null; }
        if (!ModuloModel && !isForced) return next();
        // Tenta localizar o módulo pelo url_base; se não achar, tenta variações e por nome
        let modulo = null;
        if (ModuloModel) {
          modulo = await ModuloModel.findOne({ url_base: first })
            .select('nome status url_base')
            .lean()
            .maxTimeMS(Number(process.env.MONGO_QUERY_TIMEOUT_MS||3000));
          if (!modulo) {
            const segName = first.replace(/^\//,'');
            modulo = await ModuloModel.findOne({
              $or: [
                { url_base: segName },
                { url_base: '/' + segName },
                { nome: new RegExp('^'+segName+'$', 'i') }
              ]
            }).select('nome status url_base').lean().maxTimeMS(Number(process.env.MONGO_QUERY_TIMEOUT_MS||3000));
          }
        }
        if (!modulo && !isForced) {
          if (gateDebug) { try { res.set('X-Planned-Gate','module-not-found:'+first+';mode:'+gateMode); } catch{} }
          return next();
        }
  const status = String((modulo && modulo.status) || '').toLowerCase();
        if (!isForced && status !== 'planejado') {
          if (gateDebug) { try { res.set('X-Planned-Gate','status:'+status+';mode:'+gateMode); } catch{} }
          return next();
        }
        // Exibir página de "Em construção" para usuários não-master
        try {
          if (gateDebug) { try { res.set('X-Planned-Gate', (isForced ? 'render-forced' : 'render')+';mode:'+gateMode); } catch{} }
          const moduleName = modulo?.nome || (modulo?.url_base || first).replace(/^\//,'').toUpperCase();
          const basePath = (modulo?.url_base || first);
          return res.status(200).render('partials/construcao', { moduleName, basePath });
        } catch(_r) {
          // Fallback usando res.render para evitar artefatos de promises no HTML
          return res.render('partials/construcao', { moduleName: (modulo?.nome || (modulo?.url_base||first)), basePath: (modulo?.url_base||first) }, (err, html) => {
            if (err) return next();
            res.set('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(html);
          });
        }
      } catch { return next(); }
    });
  } catch(_) { /* noop */ }

  // Serve estáticos do módulo Escalas sob raiz (compat)
  try {
    app.use('/escalas/js/escalas', express.static(path.join(ROOT, 'public/escalas/js/escalas')));
  } catch(_e) { /* noop */ }

  // Habilitar módulo Escalas somente sob flag explícita
  if (process.env.ENABLE_ESCALAS === '1') {
    try {
      const escalasModule = await import('#modules/escalas/index.js');
      registry.push(escalasModule);
    } catch (err) {
      console.warn('[server] Escalas desabilitado por erro de carga:', err.message);
      try {
        console.error('[server][escalas][stack]', err.stack);
        // Heurística para ajudar a diagnosticar causas comuns
        if(/Unexpected reserved word/i.test(err.message)){
          console.warn('[server][escalas] Possíveis causas para "Unexpected reserved word":');
          console.warn(' - Versão do Node muito antiga para os import maps (campo "imports" em package.json).');
          console.warn(' - Execução em ambiente que transpila/parcialmente converte ESM e perdeu "type":"module".');
          console.warn(' - Algum arquivo com sintaxe moderna (optional chaining, import assertions) não suportada.');
          console.warn('Sugestões:');
          console.warn('  1) Verifique versão: node -v (recomendado >= 18, ideal >= 20).');
          console.warn('  2) Confirme se package.json (type: module) está sendo o mesmo no runtime.');
          console.warn('  3) Rode com NODE_OPTIONS="--trace-uncaught" para stack completa.');
          console.warn('  4) Teste resolução manual de alias: import "./src/core/models/user.js" em vez de "#core/...".');
        }
      } catch(_l){ /* ignore logging issues */ }
    }
  }

  // Inicializações (hooks) antes de montar rotas
  for (const mod of registry) {
    if (typeof mod.meta?.init === 'function') {
      try { await mod.meta.init({ config }); } catch (err) { console.error(`[server] init hook falhou para ${mod.meta.name}:`, err.message); }
    }
  }

  // Middleware de normalização de envelopes (precisa vir antes de rotas)
  app.use(envelopeNormalizer);

  // Rotas globais públicas (infraestrutura central)
  app.use(verificacaoRoutes);

  // Removido: redirecionamento de /escalas/api/usuario -> /gestor/api/usuario
  // Mantemos as rotas do módulo Escalas responsáveis por /escalas/api/usuario
  // para garantir que os dados venham da sessão correta (escalasUser)

  // Monta módulos
  for (const mod of registry) {
    const meta = mod.meta || { name: 'unknown', basePath: '/' };
    const built = mod.buildModule({ config });
    // Propagar flag de DB para o sub-app (req.app dentro do módulo aponta para o sub-app)
    try {
      if (built && built.locals) {
        built.locals.skipDb = getEffectiveSkipDb();
      }
    } catch {}
    app.use(meta.basePath || '/', built);
    console.log(`[server] módulo montado: ${meta.name} em ${meta.basePath || '/'}`);

    // Alias: algumas instalações/links usam /condominio (singular).
    // Monta o mesmo sub-app para evitar 404 e manter compatibilidade.
    try {
      if (meta?.name === 'condominios' && (meta.basePath || '/condominios') === '/condominios') {
        app.use('/condominio', built);
        console.log('[server] módulo montado (alias): condominios em /condominio');
      }
    } catch { /* noop */ }
  }

  // Compat: permitir chamadas sem o prefixo /escalas para rotas do módulo Escalas
  // Ex.: GET /api/escalas/:id -> redireciona para /escalas/api/escalas/:id mantendo método/corpo (307)

    // Compat: algumas instalações antigas usam /portal_morador (underscore).
    // Monta o mesmo sub-app também nesse path para evitar 404 em deploy.
    try {
      if (meta?.name === 'portal-morador' && (meta.basePath || '/portal-morador') === '/portal-morador') {
        app.use('/portal_morador', built);
        console.log('[server] módulo montado (alias): portal-morador em /portal_morador');
      }
    } catch { /* noop */ }
  app.use('/api/escalas', (req, res, next) => {
    try {
      if (isTestEnv) {
        req.url = '/escalas' + (req.originalUrl || req.url || '');
        return app.handle(req, res, next);
      }
      const target = '/escalas' + (req.originalUrl || req.url || '');
      return res.redirect(307, target);
    } catch { return next(); }
  });

  // Compat geral: mapear /api/* raiz para /gestor/api/* (mantém método e corpo)
  // Muitos scripts legados chamam "/api/..." sem o prefixo do módulo
  app.use('/api', (req, res, next) => {
    try {
      if (isTestEnv) return next();
      const original = String(req.originalUrl || req.url || '');
      // Se já for uma sub-rota tratada acima (/api/escalas), deixa seguir
      if (original.startsWith('/api/escalas')) return next();
      // Exceções: rotas públicas utilitárias que precisam ficar no root /api
      if (original.startsWith('/api/cep')) return next();

      // Importante: quando a UI do Portal do Morador (sub-app) chama por engano /api/msg/*,
      // o redirect genérico para /gestor/api/* resulta em 401 e dá a sensação de "deslogar".
      // Detecta via Referer e redireciona para o prefixo correto do Portal.
      if (original.startsWith('/api/msg')) {
        const ref = String(req.get('referer') || '').toLowerCase();
        if (ref.includes('/portal-morador/') || ref.includes('/portal_morador/')) {
          return res.redirect(307, '/portal-morador' + original);
        }
      }

      return res.redirect(307, '/gestor' + original);
    } catch { return next(); }
  });

  // Proxy de CEP (ViaCEP) para evitar CORS no browser.
  // Uso: GET /api/cep/32642100
  app.get('/api/cep/:cep', async (req, res) => {
    try {
      const raw = String(req.params.cep || '');
      const cep = raw.replace(/\D/g, '').slice(0, 8);
      if (cep.length !== 8) {
        return res.status(400).json({ error: 'CEP inválido' });
      }
      const fetchFn = (typeof fetch === 'function') ? fetch : nodeFetch;

      async function fetchJson(url, timeoutMs) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        if (typeof t?.unref === 'function') t.unref();
        try {
          const resp = await fetchFn(url, { signal: ctrl.signal, headers: { 'accept': 'application/json' } });
          const status = resp?.status || 0;
          const ok = !!resp?.ok;
          let data = null;
          try {
            data = await resp.json();
          } catch {
            data = null;
          }
          return { ok, status, data, aborted: false };
        } catch (err) {
          const msg = String(err?.name || err?.message || err);
          const lower = msg.toLowerCase();
          const aborted = (err && (err.name === 'AbortError')) || lower.includes('abort') || lower.includes('timeout');
          return { ok: false, status: aborted ? 504 : 0, data: null, aborted };
        } finally {
          clearTimeout(t);
        }
      }

      const timeoutMs = Math.max(1000, Number(process.env.CEP_LOOKUP_TIMEOUT_MS || process.env.VIACEP_TIMEOUT_MS || 3500));

      // 1) ViaCEP (preferencial)
      const via = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`, timeoutMs);
      if (via.ok && via.data && !via.data.erro) {
        try {
          res.set('X-CEP-Proxy', '1');
          res.set('X-CEP-Provider', 'viacep');
          res.set('Cache-Control', 'public, max-age=86400');
        } catch {}
        return res.json(via.data);
      }
      if (via.data?.erro) {
        return res.status(404).json({ error: 'CEP não encontrado' });
      }

      // 2) Fallback: BrasilAPI (não retorna IBGE; mantém compatibilidade com campos principais)
      const br = await fetchJson(`https://brasilapi.com.br/api/cep/v1/${cep}`, timeoutMs);
      if (br.ok && br.data && !br.data.error) {
        const mapped = {
          cep: br.data.cep || cep,
          logradouro: br.data.street || '',
          complemento: '',
          bairro: br.data.neighborhood || '',
          localidade: br.data.city || '',
          uf: br.data.state || '',
          ibge: ''
        };
        try {
          res.set('X-CEP-Proxy', '1');
          res.set('X-CEP-Provider', 'brasilapi');
          res.set('Cache-Control', 'public, max-age=86400');
        } catch {}
        return res.json(mapped);
      }

      if (via.aborted && br.aborted) {
        try {
          res.set('X-CEP-Proxy', '1');
          res.set('X-CEP-Provider', 'timeout');
        } catch {}
        return res.status(504).json({ error: 'Timeout ao consultar CEP' });
      }

      return res.status(502).json({ error: 'Falha ao consultar CEP' });
    } catch (err) {
      const msg = String(err?.name || err?.message || err);
      const isAbort = msg.toLowerCase().includes('abort');
      try {
        res.set('X-CEP-Proxy', '1');
        res.set('X-CEP-Provider', 'error');
      } catch {}
      return res.status(isAbort ? 504 : 502).json({ error: 'Falha ao consultar CEP' });
    }
  });

  // Fallback quando módulo Escalas está desabilitado e alguma parte do front tenta /escalas/login
  // POST genérico para /:seg/login delegando para o controlador do Gestor
  try {
    app.post('/:seg/login', express.urlencoded({ extended: true, limit: '12mb' }), express.json({ limit: '12mb' }), (req, res, next) => {
      try {
        const rawSeg = String(req.params.seg||'');
        const seg = rawSeg.toLowerCase();
        if (!seg || seg === 'gestor' || seg === 'escalas') return next();
        const isPortal = seg === 'portal-morador' || seg === 'portal_morador';
        // Express pode definir req.baseUrl como propriedade não configurável.
        // Usar defineProperty aqui pode lançar "Cannot redefine property" e virar 500 no login.
        try { req.baseUrl = '/' + seg; } catch { /* noop */ }
        if (isPortal) {
          return Promise.resolve(portalLoginPost(req, res)).catch(next);
        }
        return Promise.resolve(genericLogin(req, res)).catch(next);
      } catch (e) { return next(); }
    });
    // Logout genérico: limpa sessão básica e volta ao login do módulo
    app.get('/:seg/logout', (req, res, next) => {
      try {
        const seg = String(req.params.seg||'').toLowerCase();
        if (!seg || seg === 'gestor' || seg === 'escalas') return next();
        try {
          const cookieName = process.env.REMEMBER_COOKIE_NAME || 'wdg_remember';
          res.clearCookie(cookieName);
        } catch {}
        try {
          if (req.session) {
            delete req.session.user;
            delete req.session.escalasUser;
          }
        } catch {}
        return res.redirect(302, '/' + seg + '/login');
      } catch (e) { return next(); }
    });
    // Primeiro acesso genérico
    app.get('/:seg/primeiroacesso', (req, res, next) => {
      try {
        const rawSeg = String(req.params.seg||'');
        const seg = rawSeg.toLowerCase();
        if (!seg || seg === 'gestor' || seg === 'escalas') return next();
        const isPortal = seg === 'portal-morador' || seg === 'portal_morador';
        try { req.baseUrl = '/' + seg; } catch { /* noop */ }
        if (isPortal) {
          return Promise.resolve(portalPrimeiroAcessoGet(req, res)).catch(next);
        }
        const basePath = '/' + seg;
        const moduleLabel = seg.charAt(0).toUpperCase() + seg.slice(1);
        return res.render('gestor/primeiroacesso', { basePath, moduleLabel }, (err, html)=> err ? next() : res.status(200).send(html));
      } catch (e) { return next(); }
    });
    app.post('/:seg/primeiroacesso', express.urlencoded({ extended: true, limit: '12mb' }), express.json({ limit: '12mb' }), (req, res, next) => {
      try {
        const rawSeg = String(req.params.seg||'');
        const seg = rawSeg.toLowerCase();
        if (!seg || seg === 'gestor' || seg === 'escalas') return next();
        const isPortal = seg === 'portal-morador' || seg === 'portal_morador';
        try { req.baseUrl = '/' + seg; } catch { /* noop */ }
        if (isPortal) {
          return Promise.resolve(portalPrimeiroAcessoPost(req, res)).catch(next);
        }
        return Promise.resolve(genericPrimeiroAcessoPost(req, res)).catch(next);
      } catch (e) { return next(); }
    });
  } catch(_) { /* noop */ }

  if (process.env.ENABLE_ESCALAS !== '1') {
    // Servir placeholder para foto de usuário mesmo com módulo desabilitado
    app.get('/escalas/api/usuario/foto', (req,res)=>{
      try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const ROOT = process.cwd();
        const placeholderSvg = path.join(ROOT, 'public', 'img', 'user-placeholder.svg');
        const placeholderPng = path.join(ROOT, 'images', 'usuario.png');
        const target = fs.existsSync(placeholderSvg) ? placeholderSvg : (fs.existsSync(placeholderPng) ? placeholderPng : null);
        if (!target) return res.status(404).end();
        const ext = path.extname(target).toLowerCase();
        if (ext === '.svg') res.type('image/svg+xml');
        else if (ext === '.png') res.type('image/png');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(target);
      } catch {
        return res.status(404).end();
      }
    });
    app.get(['/escalas', '/escalas/login'], (req,res)=> res.redirect(302, '/gestor/login'));
    // Qualquer rota dentro de /escalas/* devolve 404 orientando habilitar
    app.use('/escalas', (req,res)=>{
      return res.status(404).send('Módulo Escalas desabilitado. Defina ENABLE_ESCALAS=1 e reinicie para ativar.');
    });
  }

  // Health simples
  app.get('/health', (req,res)=> res.json({ ok:true, ts: Date.now() }));
  // Health de DB (diagnóstico) - habilitado apenas quando EXPOSE_DB_DEBUG=1
  if ((process.env.EXPOSE_DB_DEBUG || '0') === '1') {
    async function importWithFallback(aliasPath, relPath){
      try { const mod = await import(aliasPath); return mod.default || mod; } catch(e1){ try { const mod2 = await import(relPath); return mod2.default || mod2; } catch(e2){ return null; } }
    }
    app.get('/health/db', async (req,res)=>{
      try {
        const stateMap = { 0:'disconnected', 1:'connected', 2:'connecting', 3:'disconnecting' };
        const cn = mongoose.connection;
        const status = stateMap[cn.readyState] || String(cn.readyState);
        const info = {
          ok: status === 'connected',
          status,
          host: cn?.host || null,
          port: cn?.port || null,
          name: cn?.name || null,
          user: cn?.user || null,
          uriHint: (process.env.MONGO_URI || process.env.MONGODB_URI || (typeof cn?.client?.s?.url === 'string' ? cn.client.s.url : null)) || null,
        };
        // Contagens básicas
        const Unidade = await importWithFallback('#models/unidade.js', '#models/unidade.js');
        const User = await importWithFallback('#models/user.js', '#models/user.js');
        let counts = {};
        try { counts.unidades = Unidade ? await Unidade.countDocuments({}) : null; } catch { counts.unidades = null; }
        try { counts.usuarios = User ? await User.countDocuments({}) : null; } catch { counts.usuarios = null; }
        return res.json({ ...info, counts });
      } catch (e) {
        return res.status(500).json({ ok:false, error:e.message });
      }
    });
  }

  // Favicon (evita 404 no /favicon.ico ao usar PNG do logo)
  app.get('/favicon.ico', (req,res)=>{
    try {
      const iconPath = path.join(ROOT, 'images', 'logoWDGestor.png');
      return res.sendFile(iconPath, err => { if (err) return res.status(204).end(); });
    } catch { return res.status(204).end(); }
  });
  // Favicon específico do módulo Escalas (compat)
  app.get('/escalas/favicon.ico', (req,res)=>{
    try {
      // Prioriza public/favicon.ico se existir; senão usa o logo padrão
      const icoPath = path.join(ROOT, 'public', 'favicon.ico');
      const fallbackPng = path.join(ROOT, 'images', 'logoWDGestor.png');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.sendFile(icoPath, err => {
        if (!err) return;
        return res.sendFile(fallbackPng, err2 => { if (err2) return res.status(204).end(); });
      });
    } catch { return res.status(204).end(); }
  });

  // Página inicial pública (Index) dinâmica com listagem de módulos
  // Exibe cards criativos com links para /<modulo>/login; se status='planejado', marca como "Em breve"
  try {
    app.get(['/', '/index'], async (req, res, next) => {
      try {
        let ModuloModel = null;
        try { const mod = await import('#models/modulo.js'); ModuloModel = mod.default || mod; } catch {}
        let modulos = [];
        try {
          if (ModuloModel && mongoose.connection.readyState === 1) {
            modulos = await ModuloModel.find({}).select('nome descricao status url_base').lean().maxTimeMS(Number(process.env.MONGO_QUERY_TIMEOUT_MS||3000));
          }
        } catch { /* se DB indisponível, segue com lista vazia */ }
        return res.render('index', {
          title: 'WDGestor — Início',
          modulos: (modulos||[]).map(m => ({
            nome: m.nome,
            descricao: m.descricao || '',
            status: String(m.status||'').toLowerCase(),
            url_base: m.url_base || ('/' + String(m.nome||'').toLowerCase())
          })),
          year: new Date().getFullYear()
        });
      } catch (e) { return next(e); }
    });
  } catch(_) { /* noop */ }

  // Health check DB (opcional, habilitado via EXPOSE_DB_DEBUG=1)
  if (String(process.env.EXPOSE_DB_DEBUG || '').trim() === '1') {
    app.get('/health/db', async (req, res) => {
      try {
        const conn = mongoose.connection;
        const status = conn.readyState === 1 ? 'connected' : 'disconnected';
        const counts = {};
        if (status === 'connected') {
          try { counts.unidades = await mongoose.model('Unidade').countDocuments(); } catch { counts.unidades = 0; }
          try { counts.usuarios = await mongoose.model('User').countDocuments(); } catch { counts.usuarios = 0; }
        }
        res.json({
          ok: status === 'connected',
          status,
          host: conn.host || null,
          port: conn.port || null,
          name: conn.name || null,
          user: conn.user || null,
          uriHint: config.mongoUri ? config.mongoUri.replace(/:([^:@]{4})[^:@]*@/, ':$1****@') : null,
          counts
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });
  }

  // Redirects de compatibilidade (URLs antigas sem prefixo)
  // Reset password acessado sem /gestor prefix -> redireciona
  app.get('/reset-password/:token', (req,res,next)=> {
    // Se já existir módulo montado que atenda, não intercepta
    // Aqui assumimos que rota correta é /gestor/reset-password/:token
    return res.redirect(302, '/gestor/reset-password/' + req.params.token);
  });
  app.post('/reset-password', (req,res,next)=> {
    return res.redirect(308, '/gestor/reset-password');
  });

  // Compatibilidade: requisições antigas para /usuarios (sem /gestor e sem /api)
  // Alguns clientes legados enviam POST diretamente para /usuarios* ao invés de /gestor/api/usuarios*
  // Mapeamos com 308 para preservar método e corpo
  app.post('/usuarios', (req,res)=> res.redirect(308, '/gestor/api/usuarios'));
  app.post('/usuarios/:id/toggle', (req,res)=> res.redirect(308, `/gestor/api/usuarios/${req.params.id}/toggle`));
  app.post('/usuarios/:id/update', (req,res)=> res.redirect(308, `/gestor/api/usuarios/${req.params.id}/update`));
  app.post('/usuarios/:id/delete', (req,res)=> res.redirect(308, `/gestor/api/usuarios/${req.params.id}/delete`));

  // Compat: páginas raiz sem prefixo -> redirecionar para /gestor/<rota>
  const legacyPaths = [
    '/login',
    '/usuarios', '/unidades', '/funcionarios', '/funcoes', '/setores', '/recursos', '/modulos',
    '/dashboard', '/contato', '/primeiroacesso', '/esquecisenha', '/esqueci-senha', '/endereco'
  ];
  for (const p of legacyPaths) {
    app.get(p, (req,res,next)=> {
      if (!isTestEnv) return res.redirect(302, '/gestor' + p);
      if (getEffectiveSkipDb()) {
        return res.status(200).type('text/html; charset=utf-8').send('<!doctype html><html><body>ok</body></html>');
      }
      try {
        req.url = '/gestor' + p;
        return app.handle(req, res, next);
      } catch {
        return next();
      }
    });
  }

  // Permitir adiar registro dos handlers de erro (útil para testes que injetam rotas depois)
  const registerErrorHandlers = () => {
    // 404 específico para prefixo /api (garante JSON para APIs inexistentes)
    const apiNotFound = (req, res) => res
      .status(404)
      .type('application/json; charset=utf-8')
      .json({ error: true, message: 'Recurso não encontrado' });
    const alreadyHasApiNotFound = app._router?.stack?.some(l => l?.handle === apiNotFound);
    if (!alreadyHasApiNotFound) app.use('/api', apiNotFound);

    // Evitar registro duplicado em execuções repetidas
    const alreadyHasNotFound = app._router?.stack?.some(l => l?.handle === notFoundHandler);
    if (!alreadyHasNotFound) app.use(notFoundHandler);
    const alreadyHasCentral = app._router?.stack?.some(l => l?.handle === centralErrorHandler);
    if (!alreadyHasCentral) app.use(centralErrorHandler);
  };

  if (!options.deferErrorHandlers) {
    // Fallback global para relatório de escala em PDF
    const pdfRoutes = [
      '/escalas/relatorios/escala/:id.pdf',
      '/escalas/relatorios/escala/:id',
      '/escalas/relatorios/escala',
      '/escalas/relatorios/escala.pdf',
      '/escalas/relatorio/escala/:id.pdf',
      '/escalas/relatorio/escala/:id',
      '/escalas/relatorio/escala',
      '/escalas/relatorio/escala.pdf'
    ];
    async function relatorioFallback(req,res,next){
      try {
        // Exigir sessão do módulo Escalas
        if (!req.session?.escalasUser) {
          return res.redirect(302, '/escalas/login');
        }
        // Carrega handler real on-demand
        const mod = await import('#modules/escalas/app/routes/relatorios.js');
        const handler = mod.relatorioEscalaHandler || (mod.default && mod.default.relatorioEscalaHandler);
        if (typeof handler !== 'function') return next();
        // Normaliza ID a partir de params, query ou caminho (suportando .pdf)
        if (!req.query) req.query = {};
        if (!req.query.id) {
          if (req.params?.id) req.query.id = String(req.params.id);
          else {
            const m = String(req.originalUrl||req.url||'').match(/([0-9a-fA-F]{24})(?:\.pdf)?(?:\?.*)?$/);
            if (m) req.query.id = m[1];
          }
        }
        return handler(req,res);
      } catch (e) {
        // Se falhar por qualquer motivo, deixe cair no notFound/centralError
        return next();
      }
    }
    for (const p of pdfRoutes) {
      app.get(p, relatorioFallback);
    }
    registerErrorHandlers();
  }

  const close = async ({ stopMemoryServer = true } = {}) => {
    const isParityLike = String(process.env.PARITY || '').trim() === '1' || String(process.env.PARITY_RUNNER || '').trim() === '1';
    const isTestLike = String(process.env.NODE_ENV || '').toLowerCase() === 'test' || process.argv.includes('--test') || isParityLike;
    if (!isTestLike) return;
    await disconnectMongo({ stopMemoryServer });
  };

  return { app, config, registerErrorHandlers, close };
}
