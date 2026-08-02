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

app.get('/api/modulos', async (req, res) => {
  try {
    const sessionUser = req.user || req.session?.mensagensUser || req.session?.user || null;

    if (req.session && !req.session.mensagensUser && sessionUser) {
      req.session.mensagensUser = {
        id: sessionUser.id || sessionUser._id || null,
        _id: sessionUser._id || sessionUser.id || null,
        email: sessionUser.email || null,
        nome: sessionUser.nome || sessionUser.name || 'Usuário',
        role: String(sessionUser.role || sessionUser.globalRole || sessionUser.global_role || sessionUser.effectiveRole || 'user').toLowerCase(),
        isMaster: !!sessionUser.isMaster,
        unidade_id: sessionUser.unidade_id || sessionUser.unidadeId || sessionUser.unidade_principal_id || null,
        unidadeId: sessionUser.unidadeId || sessionUser.unidade_id || sessionUser.unidade_principal_id || null,
        unidade_principal_id: sessionUser.unidade_principal_id || sessionUser.unidade_id || sessionUser.unidadeId || null,
        funcionario_id: sessionUser.funcionario_id || null
      };
    }

    const email = String(req.user?.email || sessionUser?.email || '').trim().toLowerCase();

    const User = (await import('#models/user.js')).default;
    const userDoc = email ? await User.findOne({ email }).lean().catch(() => null) : null;

    const role = String(
      req.user?.role ||
      sessionUser?.role ||
      userDoc?.role ||
      sessionUser?.global_role ||
      userDoc?.global_role ||
      'user'
    ).toLowerCase();

    const mapMods = (mods) => (mods || []).filter(Boolean).map(m => ({
      _id: m._id,
      nome: m.nome,
      descricao: m.descricao,
      status: m.status,
      url_base: m.url_base
    }));

    const withCompat = (mods) => {
      const data = mapMods(mods);
      return res.json({ success: true, data, modulos: data });
    };

    const uniqById = (mods) => {
      const out = [];
      const seen = new Set();

      for (const m of (mods || [])) {
        const id = m?._id ? String(m._id) : '';
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        out.push(m);
      }

      return out;
    };

    const tryLoadUnidadeComModulos = async (unidadeId) => {
      if (!unidadeId) return null;

      try {
        const Unidade = (await import('#models/unidade.js')).default;

        const unidade = await Unidade.findById(unidadeId)
          .select('_id is_principal subunidade unidade_principal_id modulosAcessiveis')
          .populate('modulosAcessiveis')
          .lean();

        if (!unidade) return null;
        if (unidade?.modulosAcessiveis?.length) return unidade;

        if (unidade.subunidade && unidade.unidade_principal_id) {
          const principal = await Unidade.findById(unidade.unidade_principal_id)
            .select('_id is_principal subunidade unidade_principal_id modulosAcessiveis')
            .populate('modulosAcessiveis')
            .lean();

          if (principal) return principal;
        }

        return unidade;
      } catch {
        return null;
      }
    };

    if (role === 'master' || role === 'admin' || req.user?.isMaster || sessionUser?.isMaster) {
      const Modulo = (await import('#models/modulo.js')).default;
      const todos = await Modulo.find({})
        .select('_id nome descricao status url_base')
        .lean();

      return withCompat(todos);
    }

    if (role === 'diretor') {
      const unidadeId =
        req.user?.unidade_id ||
        sessionUser?.unidade_id ||
        sessionUser?.unidadeId ||
        userDoc?.unidade_id ||
        req.user?.unidade_principal_id ||
        sessionUser?.unidade_principal_id ||
        userDoc?.unidade_principal_id ||
        null;

      const unidade = await tryLoadUnidadeComModulos(unidadeId);

      if (unidade?.modulosAcessiveis?.length) {
        return withCompat(unidade.modulosAcessiveis);
      }
    }

    if (role === 'user') {
      try {
        const Funcionario = (await import('#models/Funcionario.js')).default;
        const Funcao = (await import('#models/funcao.js')).default;

        const funcionarioId = req.user?.funcionario_id || sessionUser?.funcionario_id || userDoc?.funcionario_id || null;
        const unidadeIdFuncionario = req.user?.unidade_id || sessionUser?.unidade_id || sessionUser?.unidadeId || userDoc?.unidade_id || null;
        const cpfFuncionario = String(userDoc?.cpf || req.user?.cpf || sessionUser?.cpf || '').replace(/\D/g, '');

        let funcionario = null;

        if (funcionarioId) {
          funcionario = await Funcionario.findById(funcionarioId)
            .select('_id funcao_id unidade_id usuario_id cpf email')
            .lean();
        }

        if (!funcionario && (userDoc?._id || req.user?._id || sessionUser?._id)) {
          const uid = userDoc?._id || req.user?._id || sessionUser?._id;

          funcionario = await Funcionario.findOne({ usuario_id: uid })
            .select('_id funcao_id unidade_id usuario_id cpf email')
            .lean();
        }

        if (!funcionario && cpfFuncionario && unidadeIdFuncionario) {
          funcionario = await Funcionario.findOne({ cpf: cpfFuncionario, unidade_id: unidadeIdFuncionario })
            .select('_id funcao_id unidade_id usuario_id cpf email')
            .lean();
        }

        const unidadeId =
          funcionario?.unidade_id ||
          req.user?.unidade_id ||
          sessionUser?.unidade_id ||
          sessionUser?.unidadeId ||
          userDoc?.unidade_id ||
          req.user?.unidade_principal_id ||
          sessionUser?.unidade_principal_id ||
          userDoc?.unidade_principal_id ||
          null;

        const unidade = await tryLoadUnidadeComModulos(unidadeId);
        const modsUnidade = (unidade?.modulosAcessiveis || []).filter(Boolean);

        let modsFuncao = [];

        if (funcionario?.funcao_id) {
          const funcao = await Funcao.findById(funcionario.funcao_id)
            .populate('modulos_habilitados')
            .lean();

          modsFuncao = (funcao?.modulos_habilitados || []).filter(Boolean);
        }

        const union = uniqById([...modsFuncao, ...modsUnidade]);

        if (union.length) {
          return withCompat(union);
        }
      } catch {
        /* fallback abaixo */
      }
    }

    return withCompat([]);
  } catch (err) {
    console.warn('[mensagens][api/modulos] falha ao listar módulos:', err?.message || err);
    return res.json({ success: true, data: [], modulos: [] });
  }
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
