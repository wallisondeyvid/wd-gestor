import mensagensApiRouter from './mensagens-api.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../../..');

app.use('/images', express.static(path.join(ROOT, 'public/mensagens/images')));
app.use('/css', express.static(path.join(ROOT, 'public/mensagens/css')));

app.get('/js/caixa_de_mensagem.js', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    res.set('CDN-Cache-Control', 'no-store');
    res.set('X-WDG-Asset-Version', String(res.locals.assetVersion || 'dev'));
  } catch {
    /* noop */
  }

  return res.sendFile(path.join(ROOT, 'public/mensagens/js/caixa_de_mensagem.js'));
});

app.use('/js', express.static(path.join(ROOT, 'public/mensagens/js')));

function getCtxUser(req) {
  const sessionUser = req?.session?.user || null;
  const reqUser = req?.user || null;

  if (reqUser && typeof reqUser === 'object') {
    return {
      ...(sessionUser && typeof sessionUser === 'object' ? sessionUser : {}),
      ...reqUser,
      role: reqUser.role || sessionUser?.role || '',
      isMaster: !!(reqUser.isMaster || sessionUser?.isMaster || reqUser.role === 'master' || sessionUser?.role === 'master')
    };
  }

  return sessionUser || null;
}

async function renderCaixaMensagens(req, res) {
  try {
    const ctxUser = getCtxUser(req);

    if (!ctxUser) {
      const nextUrl = encodeURIComponent(String(req.originalUrl || req.url || '/mensagens'));
      return res.redirect(`/mensagens/login?next=${nextUrl}`);
    }

    return res.render('mensagens/caixa_de_mensagem', {
      user: ctxUser,
      basePath: '/condominios',
      assetBasePath: '/mensagens',
      apiBasePath: '/mensagens',
      moduleLabel: 'Caixa de Mensagens'
    });
  } catch (err) {
    console.error('[mensagens][ui] erro:', err);
    return res
      .status(500)
      .type('text/plain; charset=utf-8')
      .send('Falha ao carregar a Caixa de Mensagens.');
  }
}

app.get('/api/usuario', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(307, `/condominios/api/usuario${qs}`);
});

app.get('/api/modulos', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(307, `/condominios/api/modulos${qs}`);
});

app.get('/api/usuario/foto', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(307, `/condominios/api/usuario/foto${qs}`);
});

app.get('/api/usuarios/foto', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(307, `/condominios/api/usuarios/foto${qs}`);
});

app.put('/api/usuario/senha', express.json({ limit: '128kb' }), (req, res) => {
  return res.redirect(307, '/condominios/api/usuario/senha');
});

function redirectToCondominiosApi(req, res) {
  const original = String(req.originalUrl || req.url || '');
  const suffix = original.replace(/^\/mensagens\/api\/msg/i, '');
  const target = `/condominios/api/msg${suffix || ''}`;
  return res.redirect(307, target);
}

app.use('/api/msg', mensagensApiRouter);
app.use('/api/msg', redirectToCondominiosApi);

app.get('/', renderCaixaMensagens);

// O dashboard do módulo é a própria Caixa de Mensagens.
app.get('/dashboard', renderCaixaMensagens);

export default app;
