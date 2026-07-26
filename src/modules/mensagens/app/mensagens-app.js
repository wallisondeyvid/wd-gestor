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
      basePath: '/mensagens',
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

function pickUserFoto(user) {
  return String(
    user?.foto ||
    user?.foto_url ||
    user?.fotoUrl ||
    user?.avatar ||
    user?.avatarUrl ||
    ''
  ).trim();
}

function sendUserPlaceholder(_req, res) {
  try {
    const placeholderSvg = path.join(ROOT, 'public', 'img', 'user-placeholder.svg');
    res.set('Cache-Control', 'public, max-age=300');
    return res.type('image/svg+xml').sendFile(placeholderSvg);
  } catch {
    return res.status(404).end();
  }
}

app.get('/api/usuario', (req, res) => {
  const user = getCtxUser(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Não autenticado',
      code: 'UNAUTHORIZED'
    });
  }

  const payload = {
    id: user.id || user._id || user.userId || null,
    _id: user._id || user.id || user.userId || null,
    nome: user.nome || user.name || user.email || 'Usuário',
    email: user.email || '',
    role: user.role || '',
    cpf: user.cpf || null,
    telefone: user.telefone || user.phone || null,
    unidade_id: user.unidade_id || user.unidadeId || null,
    unidadeId: user.unidadeId || user.unidade_id || null,
    unidade_nome: user.unidade_nome || user.unidadeNome || user.unidade?.nome || null,
    unidadeNome: user.unidadeNome || user.unidade_nome || user.unidade?.nome || null,
    unidade_codigo: user.unidade_codigo || user.unidadeCodigo || user.unidade?.codigo || null,
    foto: pickUserFoto(user),
    primeiro_acesso: !!user.primeiro_acesso,
    senha_provisoria: !!user.senha_provisoria
  };

  return res.json({
    success: true,
    usuario: payload,
    data: payload
  });
});

app.get(['/api/usuario/foto', '/api/usuarios/foto'], (req, res) => {
  const user = getCtxUser(req);
  const foto = pickUserFoto(user);

  if (foto && /^https?:\/\//i.test(foto)) {
    res.set('Cache-Control', 'public, max-age=60');
    return res.redirect(302, foto);
  }

  return sendUserPlaceholder(req, res);
});

app.get('/api/modulos', (_req, res) => {
  return res.json({
    success: true,
    data: [],
    modulos: []
  });
});

app.put('/api/usuario/senha', express.json({ limit: '128kb' }), (_req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Alteração de senha ainda não foi migrada para o módulo Mensagens.',
    code: 'MENSAGENS_PASSWORD_NOT_MIGRATED'
  });
});

app.use('/api/msg', mensagensApiRouter);

app.get('/', renderCaixaMensagens);

// O dashboard do módulo é a própria Caixa de Mensagens.
app.get('/dashboard', renderCaixaMensagens);

export default app;
