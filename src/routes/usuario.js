// Rotas de usuário migradas para `src/modules/gestor/app/routes/usuario.js`.
// Este arquivo legacy foi esvaziado para evitar duplicidade de handlers.
    console.log(`Usuário ${userId} definido como diretor da unidade ${unidadeId}`);
  } catch (e) {
    console.error('Erro ao definir diretor:', e);
  }
};

// Middleware para autenticação de API (retorna JSON em vez de redirecionar)
const requireApiAuth = async (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }
  try {
    // Tenta primeiro carregar usuário genérico
    const user = await User.findOne({ email: req.session.user.email.toLowerCase() }).lean();
    if (user) {
      let unidadeId = user.unidade_id || null;
      let unidadePrincipalId = null;

      // Para usuários master, tentar obter a unidade principal do sistema
      if (user.role === 'master' && !unidadeId) {
        try {
          const Unidade = (await import('#core/models/unidade.js')).default;
          const unidadePrincipal = await Unidade.findOne({ is_principal: true }).lean();
          if (unidadePrincipal) {
            unidadeId = unidadePrincipal._id;
            unidadePrincipalId = unidadePrincipal._id;
          }
        } catch (e) {
          console.warn('Falha ao obter unidade principal para master:', e.message);
        }
      } else if (unidadeId) {
        try {
          const Unidade = (await import('#core/models/unidade.js')).default;
          const unidadeDoc = await Unidade.findById(unidadeId).lean();
          if (unidadeDoc) {
            unidadePrincipalId = unidadeDoc.is_principal ? unidadeDoc._id : (unidadeDoc.unidade_principal_id || null);
          }
        } catch (e) {
          console.warn('Falha ao obter unidade do usuário:', e.message);
        }
      }

      // Validações por nível de acesso
      switch (user.role) {
        case 'master':
          // Master: sem restrições
          break;

        case 'admin':
          // Admin: sem unidade/função obrigatórias
          break;

        case 'diretor':
          // Diretor: deve ter unidade principal e ser diretor
          if (!unidadeId) {
            return res.status(403).json({ error: 'Diretor deve ter unidade principal' });
          }
          // Verificar se é diretor da unidade
          try {
            const Unidade = (await import('#core/models/unidade.js')).default;
            const unidade = await Unidade.findById(unidadeId);
            if (!unidade || unidade.diretor_usuario_id?.toString() !== user._id.toString()) {
              return res.status(403).json({ error: 'Diretor deve ser diretor da unidade' });
            }
          } catch (e) {
            return res.status(500).json({ error: 'Erro ao validar diretor' });
          }
          break;

        case 'user':
          // User: deve ter unidade
          if (!unidadeId) {
            return res.status(403).json({ error: 'Usuário deve ter unidade' });
          }
          break;

        default:
          return res.status(403).json({ error: 'Nível de acesso inválido' });
      }

      // Obter módulos permitidos para o usuário
      const modulosPermitidos = await obterModulosPermitidos(user, unidadeId);

      req.user = {
        id: user._id,
        nome: user.nome || req.session.user.nome || 'Usuário',
        email: user.email,
        role: user.role,
        isMaster: user.role === 'master' || user.email === 'wallisondeyvid13@gmail.com',
        unidade_id: unidadeId,
        unidade_principal_id: unidadePrincipalId,
        funcao: req.session.user.funcao || null,
        modulos_permitidos: modulosPermitidos
      };
      return next();
    }

    // Fallback: modo antigo baseado em Funcionário (se existir)
    try {
  const Funcionario = (await import('#core/models/Funcionario.js')).default;
      const funcionario = await Funcionario.findOne({ email: req.session.user.email.toLowerCase() });
      if (!funcionario) return res.status(401).json({ error: 'Usuário não encontrado' });

      req.user = {
        id: funcionario._id,
        nome: funcionario.nome || 'Usuário',
        email: funcionario.email,
        unidade_id: funcionario.unidade_id ? funcionario.unidade_id._id : null,
        unidade_principal_id: funcionario.unidade_id && funcionario.unidade_id.is_principal
          ? funcionario.unidade_id._id
          : (funcionario.unidade_id && funcionario.unidade_id.unidade_principal_id) || null,
        funcao: funcionario.funcao_id ? funcionario.funcao_id.nome : null,
        isMaster: funcionario.email === 'wallisondeyvid13@gmail.com',
        role: 'user'
      };
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'Erro na autenticação' });
    }
  } catch (e) {
    console.error('Erro no requireApiAuth:', e);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// POST /api/usuario/foto
router.post('/api/usuario/foto', requireApiAuth, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    await fs.mkdir(UP_DIR, { recursive: true });
    const userId = req.user.id; // req.user já foi validado pelo requireApiAuth
    const filename = `${userId}-${uuid()}.webp`;
    const finalPath = path.join(UP_DIR, filename);
    await sharp(req.file.path)
      .resize(512, 512, { fit: 'cover', position: 'center', withoutEnlargement: true })
      .toFormat('webp', { quality: 90 })
      .toFile(finalPath);
    try { await fs.unlink(req.file.path); } catch {}
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.foto) {
      const oldPath = path.join(UP_DIR, user.foto);
      try { await fs.unlink(oldPath); } catch {}
    }
    user.foto = `users/${filename}`;
    await user.save();
    return res.json({ ok: true, foto: user.foto });
  } catch (err) {
    console.error('[upload foto]', err);
    return res.status(500).json({ error: 'Falha ao processar foto' });
  }
});

// Middleware básico de sessão para endpoints de perfil (sem validações rígidas)
const requireSessionBasic = async (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }
  try {
    const email = (req.session.user.email || '').toLowerCase();
    const user = await User.findOne({ email }).lean();
    if (user) {
      req.user = {
        id: user._id,
        nome: user.nome || req.session.user.nome || 'Usuário',
        email: user.email,
        role: user.role,
        isMaster: user.role === 'master' || user.email === 'wallisondeyvid13@gmail.com',
        unidade_id: user.unidade_id || null,
        unidade_principal_id: null,
        funcao: req.session.user.funcao || null
      };
      return next();
    }
    // Fallback para Funcionário
    try {
  const Funcionario = (await import('#core/models/Funcionario.js')).default;
      const funcionario = await Funcionario.findOne({ email }).lean();
      if (!funcionario) return res.status(401).json({ error: 'Usuário não encontrado' });
      req.user = {
        id: funcionario._id,
        nome: funcionario.nome || 'Usuário',
        email: funcionario.email,
        role: 'user',
        isMaster: funcionario.email === 'wallisondeyvid13@gmail.com',
        unidade_id: funcionario.unidade_id || null,
        unidade_principal_id: null,
        funcao: funcionario.funcao_id || null
      };
      return next();
    } catch (e) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
  } catch (e) {
    console.error('Erro no requireSessionBasic:', e);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// GET /api/usuario (perfil básico do usuário atual)
router.get('/api/usuario', requireSessionBasic, async (req, res) => {
  try {
    const email = (req.user?.email || '').toLowerCase();
    let userDoc = await User.findOne({ email }).lean();
    let funcDoc = null;
    if (!userDoc) {
  const Funcionario = (await import('#core/models/Funcionario.js')).default;
      funcDoc = await Funcionario.findOne({ email }).lean();
      if (!funcDoc) return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const id = userDoc?._id || funcDoc?._id;
    const nome = userDoc?.nome || funcDoc?.nome || req.user?.nome || 'Usuário';
    const role = userDoc?.role || req.user?.role || 'user';
    const cpf = userDoc?.cpf || funcDoc?.cpf || null;
    const unidade_id = userDoc?.unidade_id || funcDoc?.unidade_id || null;
    const telefone = userDoc?.telefone || funcDoc?.telefone || null;
    const foto = userDoc?.foto || funcDoc?.foto || null;

    // Buscar nome da unidade quando aplicável
    let unidade_nome = null;
    if (role !== 'master' && unidade_id) {
      try {
  const Unidade = (await import('#core/models/unidade.js')).default;
        const un = await Unidade.findById(unidade_id).select('nome').lean();
        unidade_nome = un?.nome || null;
      } catch (e) {
        console.warn('Falha ao obter nome da unidade:', e.message);
      }
    }

    return res.json({
      id,
      nome,
      email,
      cpf,
      role,
      unidade_id,
      unidade_nome,
      telefone: telefone || null,
      foto: foto || null
    });
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    return res.status(500).json({ error: 'Falha ao buscar usuário' });
  }
});

export default router;
