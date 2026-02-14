// gestor-app.js - Entry point do módulo Gestor
// ----------------------------------------------------------------------------------
// Estratégia de montagem:
// 1. Este sub-app é exportado e montado externamente com meta.basePath = '/gestor'.
// 2. TODAS as rotas internas aqui são definidas sem o prefixo '/gestor'. Ao montar,
//    o Express automaticamente expõe como /gestor/<rota>.
// 3. res.locals.basePath (ou _bp nas views) é injetado dinamicamente via req.baseUrl
//    para construir links/URLs de forma resiliente se o basePath mudar futuramente.
// 4. Assets estáticos são servidos aqui sem prefixo '/gestor' porque o prefixo será
//    adicionado pelo mount externo. Ex: app.use('/images', ...) => /gestor/images.
// 5. Evitamos duplicação de montagens; cada router é registrado apenas uma vez.
// 6. Para APIs com risco de colisão de parâmetros genéricos (/:id), usamos prefixos
//    mais específicos (ex: '/api/funcionarios').
// 7. Se precisar adicionar novo router, importar acima e incluir em bloco adequado.
// ----------------------------------------------------------------------------------
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import methodOverride from 'method-override';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

// Rotas (mantida mesma estrutura)
import usuarioRouter from './routes/usuario.js';
import unidadeRouter from './routes/unidade.js';
import funcionarioRouter from './routes/funcionario.js';
import funcaoRouter from './routes/funcao.js';
import setorRouter from './routes/setor.js';
import recursoRouter from './routes/recurso.js';
import moduloRouter from './routes/modulo.js';
import dashboardRouter from './routes/dashboard.js';
import pagesRouter from './routes/pagesRouter.js';
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';
import userApiRouter from './routes/userApi.js';
import unidadeApiRouter from './routes/unidadeApi.js';
import funcaoApiRouter from './routes/funcaoApi.js';
import setorApiRouter from './routes/setorApi.js';
import recursoApiRouter from './routes/recursoApi.js';
import biometriaApiRouter from './routes/biometriaApi.js';
import funcionarioApiRouter from './routes/funcionarioApi.js';
import cnaeApiRouter from './routes/cnaeApi.js';
import moduloApiRouter from './routes/moduloApi.js';
import debugApiRouter from './routes/debugApi.js';
import userAdminApiRouter from './routes/userAdminApi.js';
import miscApiRouter from './routes/miscApi.js';
import userPhotoApiRouter from './routes/userPhotoApi.js';
import bancoApiRouter from './routes/bancoApi.js';
import faceBiometriaUploadApiRouter from './routes/faceBiometriaUploadApi.js';
import feedbackApiRouter from './routes/feedbackApi.js';
import widgetSettingsApiRouter from './routes/widgetSettingsApi.js';
import User from '#models/user.js';

const app = express();
// Aumenta limites de body parser para suportar upload inline (DataURL) de logos (até ~10-12MB)
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(express.json({ limit: '12mb' }));
// Suporte a formulários HTML usando _method=PUT / _method=DELETE na query ou body
app.use(methodOverride(function (req, res) {
	// Prioriza querystring ?_method=PUT
	if (req.query && typeof req.query._method === 'string') {
		return req.query._method;
	}
	// Depois campos de formulário (x-www-form-urlencoded ou multipart) nome _method
	if (req.body && typeof req.body._method === 'string') {
		return req.body._method;
	}
	return undefined;
}));

// Injeta basePath dinamicamente (quando montado em /gestor => req.baseUrl == '/gestor')
app.use((req, res, next) => {
	// baseUrl pode ser '' se montado na raiz
	res.locals.basePath = req.baseUrl || '';
	// Versão de assets para cache-busting controlado a cada deploy
	try {
		const v = process.env.APP_VERSION
			|| (process.env.VERCEL_GIT_COMMIT_SHA ? String(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 8) : '')
			|| (process.env.BUILD_TIME ? String(process.env.BUILD_TIME) : '')
			|| '';
		res.locals.assetVersion = v || String(Math.floor(Date.now() / (1000 * 60 * 5))); // fallback: muda a cada ~5min
	} catch { /* noop */ }
	// Links auxiliares (downloads etc.)
	try {
		const DEFAULT_AGENT_URL = process.env.FINGERPRINT_AGENT_URL || 'https://github.com/wallisondeyvid/wdgestor/actions';
		const DEFAULT_AGENT_SHA = process.env.FINGERPRINT_AGENT_SHA256 || 'c778d9e6f565050704cc6ebbc36ffad9823aa493fbfaf2b625953b11335362c5';
		res.locals.fingerprintAgentUrl = (req.baseUrl || '') + '/downloads/fingerprint-agent';
		res.locals.fingerprintAgentSha256 = DEFAULT_AGENT_SHA;
		// Armazena também em app.locals para eventual uso em outros templates
		app.locals.__FINGERPRINT_AGENT_URL_TARGET = DEFAULT_AGENT_URL;
	} catch(_) { /* noop */ }
	// Headers de diagnóstico leves: commit/build quando disponíveis + flag de compat upload
	try {
		if (process.env.APP_VERSION) res.setHeader('X-App-Version', process.env.APP_VERSION);
		if (process.env.VERCEL_GIT_COMMIT_SHA) res.setHeader('X-App-Commit', process.env.VERCEL_GIT_COMMIT_SHA);
		if (process.env.BUILD_TIME) res.setHeader('X-App-Build-Time', process.env.BUILD_TIME);
		res.setHeader('X-Logo-Upload-Compat', 'true');
	} catch { /* ignore headers errors */ }
	next();
});

// Diagnóstico: logar somente redirects/erros do módulo Gestor com um resumo da sessão/cookie.
// Ajuda a identificar "loga e cai" (geralmente cookie de sessão não persistindo ou algum endpoint retornando 401/302).
app.use((req, res, next) => {
	const startedAt = Date.now();
	const original = String(req.originalUrl || req.url || '');
	const baseUrl = String(req.baseUrl || '');
	const pathOnly = String(req.path || '');
	const hasSidCookie = (() => {
		try {
			const raw = String(req.headers?.cookie || '');
			return /(?:^|;\s*)wdg\.sid=/.test(raw);
		} catch { return false; }
	})();
	res.on('finish', () => {
		try {
			const status = Number(res.statusCode || 0);
			const isRedirect = status >= 300 && status < 400;
			const isError = status >= 400;
			if (!isRedirect && !isError) return;
			// Evitar ruído excessivo de assets
			if (/\.(?:css|js|png|jpg|jpeg|webp|svg|ico|map)(?:\?|$)/i.test(original)) return;
			const location = String(res.getHeader('location') || '');
			const sessionUser = req.session && (req.session.user || req.session.escalasUser);
			const email = sessionUser?.email || req.user?.email || null;
			console.warn('[gestor][http]', {
				status,
				method: String(req.method || 'GET').toUpperCase(),
				baseUrl,
				path: pathOnly,
				original,
				location,
				hasSidCookie,
				hasSessionUser: !!sessionUser,
				email,
				ms: Date.now() - startedAt,
			});
		} catch { /* noop */ }
	});
	next();
});

// Middleware global: popula/atualiza req.user a partir da sessão SEMPRE que houver sessão válida
// (evita ficar preso em usuário sintético de middlewares anteriores ou skipAuth)
app.use(async (req, res, next) => {
	try {
		// Em modo sem DB ou sem conexão ativa, não tentar consultar o Mongo; apenas espelhar dados mínimos da sessão
		if (req.app?.locals?.skipDb || mongoose.connection.readyState !== 1) {
			const sessionUser = req.session && req.session.user;
			if (sessionUser) {
				req.user = {
					id: sessionUser.id || null,
					_id: sessionUser.id || null,
					nome: sessionUser.nome || 'Usuário',
					email: sessionUser.email,
					role: sessionUser.role || 'user',
					isMaster: (sessionUser.role === 'master'),
					unidade_id: sessionUser.unidade_id || null,
					funcionario_id: sessionUser.funcionario_id || null,
					foto: sessionUser.foto || null
				};
			}
			return next();
		}
		if (req.skipAuth) return next();
		const sessionUser = req.session && req.session.user;
		if (!sessionUser || !sessionUser.email) return next();
		const email = (sessionUser.email || '').toLowerCase();
		const userDoc = await User.findOne({ email }).lean().maxTimeMS(Number(process.env.MONGO_QUERY_TIMEOUT_MS||3000));
		if (userDoc) {
			req.user = {
				id: userDoc._id,
				_id: userDoc._id,
				nome: userDoc.nome || sessionUser.nome || 'Usuário',
				email: userDoc.email,
				role: userDoc.role,
				isMaster: (userDoc.role === 'master'),
				unidade_id: userDoc.unidade_id || null,
				funcionario_id: userDoc.funcionario_id || null,
				foto: userDoc.foto || null
			};
		} else {
			// Fallback mínimo: espelha sessão (útil em fluxos parciais), com heurística de master por e-mail
			req.user = {
				id: sessionUser.id || null,
				_id: sessionUser.id || null,
				nome: sessionUser.nome || 'Usuário',
				email: sessionUser.email,
				role: sessionUser.role || 'user',
				isMaster: (sessionUser.role === 'master'),
				unidade_id: sessionUser.unidade_id || null,
				funcionario_id: sessionUser.funcionario_id || null,
				foto: sessionUser.foto || null
			};
		}
	} catch (e) {
		// Log leve; não falhar a requisição por erro não crítico
		console.warn('[populateUserFromSession] falha:', e.message);
	}
	return next();
});

// Disponibiliza user para as views de forma consistente (após popular req.user)
app.use((req, res, next) => {
	res.locals.user = req.user || (req.session && req.session.user) || null;
	next();
});

// Ajuste de caminhos: agora estamos em src/modules/gestor/app
// Views ficam ainda em src/views/gestor
// Views: prioriza /views/gestor, com fallback para /views
app.set('views', [
	path.join(ROOT, 'views/gestor'),
	path.join(ROOT, 'views')
]);
app.set('view engine', 'ejs');

// Static roots relativos ao novo local (subir 3 níveis para raiz do projeto)

// Compatibilidade PRIORITÁRIA: sempre atenda /js/modals/* a partir de public/gestor/js/modals
// Registrado ANTES do static '/js' para prevalecer e evitar versões antigas de public/js/modals
app.get('/js/modals/:file', (req, res, next) => {
	try {
		const raw = String(req.params.file || '').trim();
		if (!raw || /[\/\\]/.test(raw)) return next();
		const safe = raw.replace(/[^A-Za-z0-9_.-]/g, '');
		const full = path.join(ROOT, 'public/gestor/js/modals', safe);
		return res.sendFile(full, err => err ? next() : undefined);
	} catch { return next(); }
});

// Como o sub-app será montado externamente em /gestor, aqui usamos caminhos sem o prefixo '/gestor'
app.use('/js/gestor', express.static(path.join(ROOT, 'public/gestor/js'))); // => /gestor/js/gestor
app.use('/css', express.static(path.join(ROOT, 'public/css')));              // => /gestor/css
app.use('/js', express.static(path.join(ROOT, 'public/js')));                // => /gestor/js
app.use('/images', express.static(path.join(ROOT, 'images')));               // => /gestor/images
app.use('/img', express.static(path.join(ROOT, 'public/img')));              // => /gestor/img
// Fallback para logos antigas de unidades salvas como arquivos (serverless-friendly)
app.get('/uploads/unidades/*', (req, res) => {
	try {
		const rel = String(req.path || '').replace(/^\/uploads\//, '');
		const candidates = [
			path.join(ROOT, 'public/uploads', rel),
			path.join(ROOT, 'uploads', rel)
		];
		for (const p of candidates) {
			try { if (fs.existsSync(p)) return res.sendFile(p); } catch {}
		}
		// Placeholder padrão
		const ph = path.join(ROOT, 'public', 'img', 'placeholder-logo.svg');
		if (fs.existsSync(ph)) {
			res.type('image/svg+xml');
			return res.sendFile(ph);
		}
		return res.status(404).end();
	} catch {
		return res.status(404).end();
	}
});
app.use('/uploads', express.static(path.join(ROOT, 'public/uploads')));      // => /gestor/uploads
app.use('/data', express.static(path.join(ROOT, 'public/data')));            // => /gestor/data
app.use('/downloads', express.static(path.join(ROOT, 'public/downloads')));  // => /gestor/downloads
app.use('/', express.static(path.join(ROOT, 'public/gestor')));              // => /gestor/* assets específicos do módulo

// Compat: muitas versões antigas do frontend formavam URLs do tipo
//   /gestor/funcionarios/<funcId>-<uuid>.webp
// que não existem como arquivo estático. Redirecionamos para a API canônica
// que resolve Blob/placeholder.
app.get('/funcionarios/:file', (req, res, next) => {
	try {
		const file = String(req.params.file || '');
		if (!/\.webp$/i.test(file)) return next();
		// Extrai o primeiro ObjectId (24 hex) do início do nome
		const m = file.match(/^([a-fA-F0-9]{24})/);
		if (!m) return res.status(404).end();
		const funcId = m[1];
		const bp = req.baseUrl || '';
		return res.redirect(302, `${bp}/api/funcionarios/${funcId}/foto`);
	} catch(_) { return next(); }
});

// Fallback routes for static files that may not be served correctly in serverless
app.get('/js/*', (req, res, next) => {
  try {
    const rel = req.path.replace(/^\/js\//, '');
    const file = path.join(ROOT, 'public/js', rel);
    if (fs.existsSync(file)) {
      return res.sendFile(file);
    }
  } catch {}
  next();
});
app.get('/data/*', (req, res, next) => {
  try {
    const rel = req.path.replace(/^\/data\//, '');
    const file = path.join(ROOT, 'public/data', rel);
    if (fs.existsSync(file)) {
      return res.sendFile(file);
    }
  } catch {}
  next();
});

// Fallback explícito para JS de páginas do Gestor (caso o static não capture em ambientes serverless)
app.get('/js/pages/:file', (req, res, next) => {
	try {
		const raw = String(req.params.file || '').trim();
		// Sanitize nome do arquivo (evita path traversal)
		if (!raw || /\//.test(raw)) return next();
		const safe = raw.replace(/[^A-Za-z0-9_.-]/g, '');
		const full = path.join(ROOT, 'public/gestor/js/pages', safe);
		return res.sendFile(full, err => err ? next() : undefined);
	} catch { return next(); }
});

    // (migrado acima) Compat: /js/modals/* já registrado antes do static '/js'

// Fallback alternativo para caminho usado por algumas views: /js/gestor/pages/* => public/gestor/js/pages/*
app.get('/js/gestor/pages/:file', (req, res, next) => {
	try {
		const raw = String(req.params.file || '').trim();
		if (!raw || /\//.test(raw)) return next();
		const safe = raw.replace(/[^A-Za-z0-9_.-]/g, '');
		const full = path.join(ROOT, 'public/gestor/js/pages', safe);
		return res.sendFile(full, err => err ? next() : undefined);
	} catch { return next(); }
});

// ---------- Downloads utilitários ----------
// Redireciona para o instalador do FingerprintAgent (configurável por env)
app.get('/downloads/fingerprint-agent', (req, res) => {
	try {
		const bp = req.baseUrl || '';
		// 1) Se o instalador existir localmente, sirva-o diretamente
		const candidates = [
			{ file: path.join(ROOT, 'public/downloads/FingerprintAgent-Setup-x64.exe'), url: bp + '/downloads/FingerprintAgent-Setup-x64.exe' },
			{ file: path.join(ROOT, 'public/downloads/FingerprintAgent.exe'),         url: bp + '/downloads/FingerprintAgent.exe' },
			{ file: path.join(ROOT, 'public/gestor/download/FingerprintAgent.exe'),   url: bp + '/download/FingerprintAgent.exe' },
			{ file: path.join(ROOT, 'public/gestor/download/FingerprintAgent-Setup-x64.exe'), url: bp + '/download/FingerprintAgent-Setup-x64.exe' },
		];
		for (const c of candidates){ if (fs.existsSync(c.file)) return res.redirect(302, c.url); }
		// 2) Caso contrário, use a URL configurada por ambiente (ou app.locals)
		const envUrl = process.env.FINGERPRINT_AGENT_URL || app.locals.__FINGERPRINT_AGENT_URL_TARGET;
		if (envUrl && typeof envUrl === 'string' && envUrl.startsWith('http')) {
			return res.redirect(302, envUrl);
		}
		// 3) Fallback: página do repositório (o usuário pode publicar o instalador nas Releases)
		return res.redirect(302, 'https://github.com/wallisondeyvid/wdgestor/releases');
	} catch(_) { return res.redirect(302, 'https://github.com/wallisondeyvid/wdgestor/actions'); }
});

// ===================== Rotas =====================
// Todas internas sem prefixo; prefixo público vem de meta.basePath (ex: /gestor)

// Páginas
app.use('/', pagesRouter);          // rotas de páginas públicas (/login, /dashboard, etc.)
app.use('/', dashboardRouter);
app.use('/', usuarioRouter);
app.use('/', unidadeRouter);
app.use('/', funcionarioRouter);
app.use('/', funcaoRouter);
app.use('/', setorRouter);
app.use('/', recursoRouter);
app.use('/', moduloRouter);

// APIs base
app.use('/', apiRouter);
app.use('/', authRouter);
app.use('/', userApiRouter);
app.use('/', unidadeApiRouter);
app.use('/', funcaoApiRouter);
app.use('/', setorApiRouter);
app.use('/', recursoApiRouter);
app.use('/', biometriaApiRouter);
app.use('/', cnaeApiRouter);
app.use('/', moduloApiRouter);
app.use('/', debugApiRouter);
app.use('/', userAdminApiRouter);
app.use('/', userPhotoApiRouter);
app.use('/', faceBiometriaUploadApiRouter);
app.use('/api', miscApiRouter);     // agrupado em /api misc endpoints
app.use('/api', bancoApiRouter);    // banco endpoints dentro de /api
// Prefixo específico para evitar colisões de '/:id'
app.use('/api/funcionarios', funcionarioApiRouter);
// Feedback (widget + admin)
app.use('/', feedbackApiRouter);
// Configuração de widgets (visibilidade por módulo)
app.use('/', widgetSettingsApiRouter);

// Export principal
export default app;
