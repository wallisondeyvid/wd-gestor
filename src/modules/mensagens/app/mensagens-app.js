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
  return req?.session?.user || req?.user || null;
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
      apiBasePath: '/condominios',
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

app.get('/', renderCaixaMensagens);

// O dashboard do módulo é a própria Caixa de Mensagens.
app.get('/dashboard', renderCaixaMensagens);

export default app;
