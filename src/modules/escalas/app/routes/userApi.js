import { Router } from 'express';
import User from '#models/user.js';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID as uuid } from 'crypto';
import { put, del } from '@vercel/blob';

const router = Router();

// GET /api/usuario — retorna dados básicos do usuário atual (contexto Escalas)
router.get('/api/usuario', async (req, res) => {
  try {
    const sessionUser = req.session?.escalasUser;
    const email = (req.user?.email || sessionUser?.email || '').toLowerCase();
    if (!email) return res.status(401).json({ error: 'Usuário não autenticado' });

    const userDoc = await User.findOne({ email }).lean();
    if (!userDoc && !req.user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const id = userDoc?._id || req.user?.id || null;
  const nome = userDoc?.nome || req.user?.nome || 'Usuário';
  const role = userDoc?.role || req.user?.role || 'user';
  const cpf = userDoc?.cpf || null;
  const unidade_id = userDoc?.unidade_id || req.user?.unidade_id || null;
  let telefone = userDoc?.telefone || req.user?.telefone || null;
    const foto = userDoc?.foto || req.user?.foto || null;

    // Buscar nome da unidade quando aplicável
    let unidade_nome = null;
    if (role !== 'master' && unidade_id) {
      try {
        const Unidade = (await import('#models/unidade.js')).default;
        const un = await Unidade.findById(unidade_id).select('nome').lean();
        unidade_nome = un?.nome || null;
      } catch (e) {
        // não falhar se não encontrar
      }
    }

    // Enriquecer com dados do Funcionário quando existir vínculo (para telefone, etc.)
    let funcionarioInfo = null;
    try{
      if (!telefone) {
        const Func = (await import('#models/Funcionario.js')).default;
        let func = null;
        if (userDoc?.funcionario_id) {
          func = await Func.findById(userDoc.funcionario_id).select('telefone nome').lean();
        } else if (id) {
          func = await Func.findOne({ usuario_id: id }).select('telefone nome').lean();
        } else if (cpf) {
          func = await Func.findOne({ cpf }).select('telefone nome').lean();
        }
        if (func) {
          telefone = func.telefone || telefone;
          funcionarioInfo = { nome: func.nome || null, telefone: func.telefone || null };
        }
      }
    }catch(_e){ /* silencioso */ }

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
      , ...(funcionarioInfo? { funcionario: funcionarioInfo }: {})
    });
  } catch (err) {
    console.error('[escalas][api/usuario] erro:', err);
    return res.status(500).json({ error: 'Falha ao buscar usuário' });
  }
});

// GET /api/usuario/foto — serve a foto do usuário atual (com fallback para placeholder)
router.get('/api/usuario/foto', async (req, res) => {
  try {
    const sessionUser = req.session?.escalasUser;
    const email = (req.user?.email || sessionUser?.email || '').toLowerCase();

  // Resolve caminhos base (apenas para placeholder)
  const ROOT = process.cwd();
    const placeholderSvg = path.join(ROOT, 'public', 'img', 'user-placeholder.svg');
    const placeholderPng = path.join(ROOT, 'images', 'usuario.png');
    const sendPlaceholder = () => {
      const target = fs.existsSync(placeholderSvg) ? placeholderSvg : (fs.existsSync(placeholderPng) ? placeholderPng : null);
      if (!target) return res.status(404).end();
      const ext = path.extname(target).toLowerCase();
      if (ext === '.svg') res.type('image/svg+xml');
      else if (ext === '.png') res.type('image/png');
      res.set('Cache-Control', 'public, max-age=300');
      return res.sendFile(target);
    };

    // Se não autenticado, devolve placeholder para não quebrar UI
    if (!email) return sendPlaceholder();

    const userDoc = await User.findOne({ email }).lean();
    const foto = userDoc?.foto || null;
    if (!foto) return sendPlaceholder();
    // 1) Data URL (legado) -> retornar binário diretamente
    if (/^data:/i.test(String(foto))) {
      try {
        const [header, base64] = String(foto).split(',');
        const contentType = header.split(';')[0].split(':')[1] || 'application/octet-stream';
        const buffer = Buffer.from(base64 || '', 'base64');
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'private, max-age=300');
        return res.send(buffer);
      } catch(_) { /* fallback para abaixo */ }
    }
    // 2) URL pública (Blob/S3/Cloudinary): redireciona
    if (/^https?:\/\//i.test(foto)) {
      res.set('Cache-Control', 'public, max-age=60');
      return res.redirect(foto);
    }
    // 3) Caminho em disco legado (compat raríssima). Se não existir, placeholder
    try {
      if (typeof foto === 'string') {
        const rel = foto.replace(/^\/+/, '');
        const ROOT2 = process.cwd();
        const candidates = [
          path.join(ROOT2, 'public', rel),
          path.join(ROOT2, rel),
          path.join(ROOT2, 'public', 'uploads', rel)
        ];
        for (const p of candidates) {
          try {
            const st = fs.statSync(p);
            if (st && st.isFile()) {
              const ext = path.extname(p).toLowerCase();
              const type = ext === '.svg' ? 'image/svg+xml'
                          : ext === '.png' ? 'image/png'
                          : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
                          : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
              res.set('Content-Type', type);
              res.set('Cache-Control', 'private, max-age=300');
              return res.sendFile(p);
            }
          } catch {}
        }
      }
    } catch { /* segue para placeholder */ }
    return sendPlaceholder();
  } catch (err) {
    console.error('[escalas][api/usuario/foto] erro:', err);
    // Em erro inesperado, devolve placeholder
    try {
      const ROOT = process.cwd();
      const placeholderSvg = path.join(ROOT, 'public', 'img', 'user-placeholder.svg');
      const placeholderPng = path.join(ROOT, 'images', 'usuario.png');
      const target = fs.existsSync(placeholderSvg) ? placeholderSvg : (fs.existsSync(placeholderPng) ? placeholderPng : null);
      if (!target) return res.status(500).json({ error: 'Falha ao buscar foto' });
      const ext = path.extname(target).toLowerCase();
      if (ext === '.svg') res.type('image/svg+xml');
      else if (ext === '.png') res.type('image/png');
      return res.sendFile(target);
    } catch {
      return res.status(500).json({ error: 'Falha ao buscar foto' });
    }
  }
});

// GET /api/modulos — retorna lista simples de módulos acessíveis (para badges do perfil)
router.get('/api/modulos', async (req, res) => {
  try {
    const sessionUser = req.user || req.session?.escalasUser || req.session?.user || null;

    if (req.session && !req.session.escalasUser && sessionUser) {
      req.session.escalasUser = {
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
    // Buscar usuário completo para obter role/unidade quando necessário
    const email = (req.user?.email || sessionUser?.email || '').toLowerCase();
    const userDoc = email ? await User.findOne({ email }).lean().catch(()=>null) : null;
    const role = String(req.user?.role || userDoc?.role || 'user').toLowerCase();
    const wantDebug = String(req.query?.debug || '').trim() === '1';

    const mapMods = (mods) => (mods || []).filter(Boolean).map(m => ({
      _id: m._id,
      nome: m.nome,
      descricao: m.descricao,
      status: m.status,
      url_base: m.url_base,
    }));

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

    // 1) Master/Admin: listar todos os módulos cadastrados
    if (role === 'master' || role === 'admin'){
      try{
        const Modulo = (await import('#models/modulo.js')).default;
        const todos = await Modulo.find({}).select('_id nome descricao status url_base').lean();
        return res.json({ data: todos });
      }catch(_){ /* fallback abaixo */ }
    }

    // 2) Diretor: módulos da unidade
    if (role === 'diretor') {
      const unidadeId = req.user?.unidade_id || userDoc?.unidade_id || sessionUser?.unidade_id || sessionUser?.unidadeId || req.user?.unidade_principal_id || userDoc?.unidade_principal_id || null;
      const unidade = await tryLoadUnidadeComModulos(unidadeId);
      if (unidade?.modulosAcessiveis?.length) return res.json({ data: mapMods(unidade.modulosAcessiveis) });
    }

    // 3) User: módulos da função filtrados pela unidade
    if (role === 'user') {
      try {
        const Funcionario = (await import('#models/Funcionario.js')).default;
        const Funcao = (await import('#models/funcao.js')).default;
        let dbg = wantDebug ? { source: 'user', funcionario: null, funcao: null, unidade: null } : null;

        const funcionarioId = req.user?.funcionario_id || userDoc?.funcionario_id || null;
        const unidadeIdFuncionario = req.user?.unidade_id || userDoc?.unidade_id || sessionUser?.unidade_id || sessionUser?.unidadeId || null;
        const cpfFuncionario = String(userDoc?.cpf || req.user?.cpf || '').replace(/\D/g,'');
        let funcionario = null;
        if (funcionarioId) funcionario = await Funcionario.findById(funcionarioId).select('_id funcao_id unidade_id usuario_id cpf email').lean();
        if (!funcionario && (userDoc?._id || req.user?._id)) {
          const uid = userDoc?._id || req.user?._id;
          funcionario = await Funcionario.findOne({ usuario_id: uid }).select('_id funcao_id unidade_id usuario_id cpf email').lean();
        }
        if (!funcionario && cpfFuncionario && unidadeIdFuncionario) {
          funcionario = await Funcionario.findOne({ cpf: cpfFuncionario, unidade_id: unidadeIdFuncionario }).select('_id funcao_id unidade_id usuario_id cpf email').lean();
        }

        if (dbg) dbg.funcionario = funcionario ? { _id: funcionario._id, funcao_id: funcionario.funcao_id, unidade_id: funcionario.unidade_id } : null;

        const unidadeId = funcionario?.unidade_id || req.user?.unidade_id || userDoc?.unidade_id || sessionUser?.unidade_id || sessionUser?.unidadeId || req.user?.unidade_principal_id || userDoc?.unidade_principal_id || null;
        const unidade = await tryLoadUnidadeComModulos(unidadeId);
        if (dbg) dbg.unidade = unidade ? { _id: unidade._id, subunidade: !!unidade.subunidade, unidade_principal_id: unidade.unidade_principal_id, modulosCount: (unidade.modulosAcessiveis||[]).length } : null;
        const modsUnidade = (unidade?.modulosAcessiveis || []).filter(Boolean);
        let modsFuncao = [];

        if (funcionario?.funcao_id) {
          const funcao = await Funcao.findById(funcionario.funcao_id).populate('modulos_habilitados').lean();
          if (dbg) dbg.funcao = funcao ? { _id: funcao._id, ativa: funcao.ativa !== false, modulosCount: (funcao.modulos_habilitados||[]).length } : null;
          modsFuncao = (funcao?.modulos_habilitados || []).filter(Boolean);
        }

        const union = uniqById([ ...modsFuncao, ...modsUnidade ]);
        if (union.length) {
          const payload = { data: mapMods(union) };
          if (wantDebug) payload.debug = dbg;
          return res.json(payload);
        }
      } catch {
        /* fallback abaixo */
      }
    }

    // 3) Fallback mínimo: sempre expor Escalas como ativo
    return res.json({ data: [{ nome:'Escalas', status:'ativo' }] });
  } catch (err) {
    return res.json({ data: [{ nome:'Escalas', status:'ativo' }] });
  }
});

// POST /api/usuario/foto — faz upload e atualiza a foto do usuário (sempre em nuvem via Vercel Blob)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.post('/api/usuario/foto', upload.single('foto'), async (req, res) => {
  try {
    const sessionUser = req.session?.escalasUser;
    const email = (req.user?.email || sessionUser?.email || '').toLowerCase();
    if (!email) return res.status(401).json({ error: 'Usuário não autenticado' });
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    // Suporte a múltiplos nomes de variável e a store conectada no Vercel
    const inVercel = !!process.env.VERCEL; // execução dentro da infra Vercel (store conectada dispensa token)
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
      || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
      || process.env.VERCEL_BLOB_RW_TOKEN
      || '';
    if (!inVercel && !blobToken) {
      return res.status(503).json({
        error: 'Blob não configurado (conecte a Store ao projeto no Vercel OU defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)'
      });
    }

    // Buscar usuário
    const userDoc = await User.findOne({ email });
    if (!userDoc) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Processa imagem (validação + normalização)
    let webpBuf;
    try {
      webpBuf = await sharp(req.file.buffer)
        .rotate()
        .resize(512, 512, { fit: 'cover', position: 'center', withoutEnlargement: true })
        .toFormat('webp', { quality: 90 })
        .toBuffer();
    } catch {
      return res.status(400).json({ error: 'Arquivo inválido' });
    }

    // Gera chave com sufixo aleatório para bust de cache
    const key = `users/${userDoc._id}-${uuid()}.webp`;
    const putOptions = {
      access: 'public',
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
      ...(blobToken ? { token: blobToken } : {})
    };
    const { url } = await put(key, webpBuf, putOptions);

    // Remove foto anterior (best-effort) se era Blob
    const prev = userDoc.foto;
    if (prev && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(prev)) {
      try { await del(prev, blobToken ? { token: blobToken } : undefined); } catch { /* ignore */ }
    }

    userDoc.foto = url; // salva URL pública
    await userDoc.save();
    return res.json({ ok: true, foto: url });
  } catch (err) {
    console.error('[escalas][api/usuario/foto POST] erro:', err);
    return res.status(500).json({ error: 'Falha ao processar foto' });
  }
});

export default router;
